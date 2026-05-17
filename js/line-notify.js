// ========================================
// line-notify.js (v1.8.19 → v1.8.20)
// LINE通知連携：設定UI＋Cloud Functions経由のテスト送信
// ----------------------------------------
// Firestoreパス：companies/{cid}/integrations/line
//   {
//     channelAccessToken, groupId, enabled,
//     triggers: {
//       dailyReport: { enabled, time:'HH:MM', skipClosedDays:bool },
//       redBoardNote: { enabled },
//       taskComplete: { enabled, mode:'all'|'once_per_day_per_person'|'phase_only' },
//     },
//     dedupKeys: { ... },
//     updatedAt, updatedBy
//   }
//
// 設計方針：
//   ・チャネルアクセストークンは絶対にブラウザのコンソール／LocalStorage に出さない
//   ・送信は Cloud Functions 経由（asia-northeast1）
//   ・SaaS化想定：Cloud Function側で companyId を受け取り、その会社のtoken/groupIdで送信
//   ・admin/manager のみ閲覧・編集可（Firestoreルールで二重ガード）
// ========================================

(function () {
  'use strict';

  // ----------------------------------------
  // メモリ上の現在値
  // ----------------------------------------
  // v1.8.107/110: 新規トリガー
  // v1.8.110: monthlyCloseReminder を追加（月末締め作業リマインド・前ズレ）
  const NEW_TRIGGER_KEYS = [
    'exhibitReady', 'deliveryReady', 'deliveryDone',
    'monthlyGoalReached', 'contractWin', 'limitOver',
    'carIntake', 'invDaysAlert', 'monthlySummary',
    'monthlyCloseReminder',
  ];
  // 時刻設定を持つスケジュール系トリガー
  const SCHEDULED_TRIGGER_KEYS = ['limitOver', 'invDaysAlert', 'monthlySummary', 'monthlyCloseReminder'];

  function _defaultConfig() {
    const triggers = {
      dailyReport:  { enabled: false, time: '17:00', skipClosedDays: true },
      redBoardNote: { enabled: false },
      taskComplete: { enabled: false, mode: 'all' },
    };
    NEW_TRIGGER_KEYS.forEach(k => { triggers[k] = { enabled: false }; });
    return {
      channelAccessToken: '',
      groupId: '',
      enabled: false,
      triggers,
    };
  }

  let _lineConfig = _defaultConfig();
  let _tokenMasked = true;

  // ----------------------------------------
  // Firestore参照
  // ----------------------------------------
  function _lineDoc() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db
      .collection('companies').doc(window.fb.currentCompanyId)
      .collection('integrations').doc('line');
  }

  // ----------------------------------------
  // Cloud Functions
  // ----------------------------------------
  function _functions() {
    if (typeof firebase === 'undefined' || !firebase.functions) return null;
    return firebase.app().functions('asia-northeast1');
  }

  // ----------------------------------------
  // 読み込み
  // ----------------------------------------
  async function loadLineConfig() {
    const ref = _lineDoc();
    if (!ref) return;
    try {
      const snap = await ref.get();
      const def = _defaultConfig();
      if (!snap.exists) {
        _lineConfig = def;
      } else {
        const d = snap.data() || {};
        const mergedTriggers = {
          dailyReport:  Object.assign({}, def.triggers.dailyReport, (d.triggers && d.triggers.dailyReport) || {}),
          redBoardNote: Object.assign({}, def.triggers.redBoardNote, (d.triggers && d.triggers.redBoardNote) || {}),
          taskComplete: Object.assign({}, def.triggers.taskComplete, (d.triggers && d.triggers.taskComplete) || {}),
        };
        // v1.8.107: 新規トリガーも汎用マージ
        NEW_TRIGGER_KEYS.forEach(k => {
          mergedTriggers[k] = Object.assign({}, def.triggers[k], (d.triggers && d.triggers[k]) || {});
        });
        _lineConfig = {
          channelAccessToken: typeof d.channelAccessToken === 'string' ? d.channelAccessToken : '',
          groupId: typeof d.groupId === 'string' ? d.groupId : '',
          enabled: !!d.enabled,
          triggers: mergedTriggers,
        };
      }
      _tokenMasked = !!_lineConfig.channelAccessToken;
      _renderLineUI();
      console.log('[line-notify] config loaded');
    } catch (err) {
      console.error('[line-notify] loadLineConfig error', err);
      _setStatus('読み込みに失敗しました', 'err');
    }
  }

  // ----------------------------------------
  // UIに値を流し込む
  // ----------------------------------------
  function _renderLineUI() {
    const tokenInp = document.getElementById('line-token-inp');
    const groupInp = document.getElementById('line-group-inp');
    const toggleEnabled = document.getElementById('line-enabled-toggle');

    if (tokenInp) {
      if (_tokenMasked && _lineConfig.channelAccessToken) {
        tokenInp.value = _lineConfig.channelAccessToken.slice(0, 6) + '●●●●●●●●●●';
        tokenInp.type = 'password';
        tokenInp.dataset.masked = '1';
      } else {
        tokenInp.value = _lineConfig.channelAccessToken;
        tokenInp.type = 'password';
        tokenInp.dataset.masked = '0';
      }
    }
    if (groupInp) groupInp.value = _lineConfig.groupId;
    if (toggleEnabled) toggleEnabled.classList.toggle('on', !!_lineConfig.enabled);

    // トリガー個別
    const tDaily = document.getElementById('line-trig-daily-toggle');
    const tRed = document.getElementById('line-trig-redboard-toggle');
    const tTask = document.getElementById('line-trig-task-toggle');
    if (tDaily) tDaily.classList.toggle('on', !!_lineConfig.triggers.dailyReport.enabled);
    if (tRed) tRed.classList.toggle('on', !!_lineConfig.triggers.redBoardNote.enabled);
    if (tTask) tTask.classList.toggle('on', !!_lineConfig.triggers.taskComplete.enabled);
    // v1.8.107: 新規トリガー
    NEW_TRIGGER_KEYS.forEach(key => {
      const el = document.getElementById('line-trig-' + key + '-toggle');
      if (el) el.classList.toggle('on', !!(_lineConfig.triggers[key] && _lineConfig.triggers[key].enabled));
    });
    // v1.8.110: スケジュール通知の時刻入力欄を反映
    const DEFAULT_TIMES = { limitOver:'07:00', invDaysAlert:'07:00', monthlySummary:'08:00', monthlyCloseReminder:'17:00' };
    SCHEDULED_TRIGGER_KEYS.forEach(key => {
      const el = document.getElementById('line-' + key + '-time');
      if (el) {
        const t = (_lineConfig.triggers[key] && _lineConfig.triggers[key].time) || DEFAULT_TIMES[key] || '08:00';
        el.value = t;
      }
    });

    // 日報時刻
    const dailyTime = document.getElementById('line-daily-time');
    if (dailyTime) dailyTime.value = _lineConfig.triggers.dailyReport.time || '17:00';

    // 休業日も送る
    const dailyClosed = document.getElementById('line-daily-closed-toggle');
    if (dailyClosed) {
      // skipClosedDays が true → 「休業日にも送る」スイッチは OFF
      const skip = !!_lineConfig.triggers.dailyReport.skipClosedDays;
      dailyClosed.classList.toggle('on', !skip);
    }

    // タスクモードラジオ
    const mode = _lineConfig.triggers.taskComplete.mode || 'all';
    document.querySelectorAll('input[name="line-task-mode"]').forEach(r => {
      r.checked = (r.value === mode);
    });

    // v1.8.80: タスク完了通知 文言カスタムの件数サマリーとレア率を反映
    if (typeof renderLineMessageSummary === 'function') {
      try { renderLineMessageSummary(); } catch (e) { console.warn('[line-notify] renderLineMessageSummary failed:', e); }
    }
  }

  // ----------------------------------------
  // ハンドラ群
  // ----------------------------------------
  // v1.8.107: スイッチ操作 → 即時保存（トークン/グループIDは保存ボタン経由のまま）
  // 「個別スイッチを触ったのに保存忘れで戻る」事故を撲滅
  async function _saveTogglesOnly() {
    const ref = _lineDoc();
    if (!ref) return;
    try {
      await ref.set({
        enabled: !!_lineConfig.enabled,
        triggers: _serializeTriggers(),
        updatedAt: window.fb.serverTimestamp(),
        updatedBy: (window.fb.currentUser && window.fb.currentUser.uid) || null,
      }, { merge: true });
      _flashSaved();
    } catch (err) {
      console.warn('[line-notify] toggle auto-save failed', err);
      _setStatus('自動保存失敗：' + (err.message || err.code), 'err');
    }
  }
  function _serializeTriggers() {
    const t = _lineConfig.triggers || {};
    const out = {};
    Object.keys(t).forEach(k => { out[k] = Object.assign({}, t[k]); });
    return out;
  }
  function _flashSaved() {
    // v1.8.108: 既存の枠内テキストではなく、画面右下トーストで通知
    if (typeof showToast === 'function') showToast('✓ 自動保存しました');
  }

  function toggleLineEnabled() {
    _lineConfig.enabled = !_lineConfig.enabled;
    const t = document.getElementById('line-enabled-toggle');
    if (t) t.classList.toggle('on', _lineConfig.enabled);
    _saveTogglesOnly();
  }

  function toggleLineTrigger(key) {
    // v1.8.107: 未定義のキーが来た場合は作る（新規トリガー追加用）
    if (!_lineConfig.triggers[key]) _lineConfig.triggers[key] = { enabled: false };
    _lineConfig.triggers[key].enabled = !_lineConfig.triggers[key].enabled;
    // v1.8.107: トグル要素IDは line-trig-<key>-toggle で統一（既存3つも個別マップ）
    const idMap = {
      dailyReport:  'line-trig-daily-toggle',
      redBoardNote: 'line-trig-redboard-toggle',
      taskComplete: 'line-trig-task-toggle',
    };
    const id = idMap[key] || ('line-trig-' + key + '-toggle');
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on', !!_lineConfig.triggers[key].enabled);
    // v1.8.107: 即時保存
    _saveTogglesOnly();
  }

  function onDailyTimeChange() {
    const inp = document.getElementById('line-daily-time');
    if (!inp) return;
    let v = inp.value || '17:00';
    // HH:MM 形式の検証＋5分単位に丸め
    const m = /^(\d{1,2}):(\d{2})$/.exec(v);
    if (!m) { v = '17:00'; }
    else {
      const hh = String(Math.min(23, Math.max(0, parseInt(m[1], 10)))).padStart(2, '0');
      let mm = parseInt(m[2], 10);
      mm = Math.round(mm / 5) * 5;
      if (mm >= 60) mm = 55;
      v = `${hh}:${String(mm).padStart(2, '0')}`;
    }
    inp.value = v;
    _lineConfig.triggers.dailyReport.time = v;
    _saveTogglesOnly(); // v1.8.107: 即時保存
  }

  function toggleDailyClosed() {
    const cur = !!_lineConfig.triggers.dailyReport.skipClosedDays;
    _lineConfig.triggers.dailyReport.skipClosedDays = !cur;
    const el = document.getElementById('line-daily-closed-toggle');
    if (el) el.classList.toggle('on', !_lineConfig.triggers.dailyReport.skipClosedDays);
    _saveTogglesOnly(); // v1.8.107: 即時保存
  }

  function onTaskModeChange(radio) {
    if (!radio || !radio.value) return;
    _lineConfig.triggers.taskComplete.mode = radio.value;
    _saveTogglesOnly(); // v1.8.107: 即時保存
  }

  // v1.8.110: スケジュール系トリガーの送信時刻を変更（即時保存）
  function onTriggerTimeChange(key, value){
    if (!_lineConfig.triggers[key]) _lineConfig.triggers[key] = { enabled: false };
    // HH:MM 形式の検証＋5分単位丸め
    let v = value || '08:00';
    const m = /^(\d{1,2}):(\d{2})$/.exec(v);
    if (m){
      const hh = String(Math.min(23, Math.max(0, parseInt(m[1], 10)))).padStart(2, '0');
      let mm = parseInt(m[2], 10);
      mm = Math.round(mm / 5) * 5;
      if (mm >= 60) mm = 55;
      v = `${hh}:${String(mm).padStart(2, '0')}`;
    } else {
      v = '08:00';
    }
    _lineConfig.triggers[key].time = v;
    const el = document.getElementById('line-' + key + '-time');
    if (el) el.value = v;
    _saveTogglesOnly();
  }

  function toggleLineTokenVisibility() {
    const inp = document.getElementById('line-token-inp');
    if (!inp) return;
    if (inp.dataset.masked === '1') {
      // 伏字 → 平文（既存トークンを表示）
      inp.value = _lineConfig.channelAccessToken;
      inp.type = 'text';
      inp.dataset.masked = '0';
      _tokenMasked = false;
    } else {
      // 平文 → 伏字（メモリ値ベースで再描画）
      inp.type = 'password';
      _tokenMasked = true;
      _renderLineUI();
    }
  }

  // ----------------------------------------
  // 保存
  // ----------------------------------------
  async function saveLineConfig() {
    const ref = _lineDoc();
    if (!ref) { _setStatus('会社情報がまだ読み込まれていません', 'err'); return; }

    const tokenInp = document.getElementById('line-token-inp');
    const groupInp = document.getElementById('line-group-inp');

    let token = _lineConfig.channelAccessToken;
    if (tokenInp && tokenInp.dataset.masked === '0') {
      token = tokenInp.value.trim();
    }
    const groupId = (groupInp ? groupInp.value : '').trim();

    if (_lineConfig.enabled) {
      if (!token) { _setStatus('トークンが空です（有効化するなら必須）', 'err'); return; }
      if (!groupId) { _setStatus('グループIDが空です（有効化するなら必須）', 'err'); return; }
      if (!/^C[a-z0-9]{32}$/i.test(groupId)) {
        _setStatus('グループIDの形式がおかしいです（C始まりの33文字）', 'err'); return;
      }
    }

    const payload = {
      channelAccessToken: token,
      groupId: groupId,
      enabled: !!_lineConfig.enabled,
      // v1.8.107: 新規トリガーも含めて全部シリアライズ
      triggers: _serializeTriggers(),
      updatedAt: window.fb.serverTimestamp(),
      updatedBy: (window.fb.currentUser && window.fb.currentUser.uid) || null,
    };

    try {
      _setStatus('保存中…', '');
      await ref.set(payload, { merge: true });
      _lineConfig.channelAccessToken = token;
      _lineConfig.groupId = groupId;
      _tokenMasked = true;
      _renderLineUI();
      _setStatus('✅ 保存しました', 'ok');
      if (typeof showToast === 'function') showToast('LINE連携設定を保存しました');
    } catch (err) {
      console.error('[line-notify] save error', err);
      _setStatus('保存に失敗：' + (err.message || err.code), 'err');
    }
  }

  // ----------------------------------------
  // 接続テスト送信（v1.8.19既存）
  // ----------------------------------------
  async function sendLineTest() {
    if (!window.fb || !window.fb.currentCompanyId) {
      _setStatus('会社情報がまだ読み込まれていません', 'err'); return;
    }
    if (!_lineConfig.enabled) {
      _setStatus('「LINE通知を有効化」がOFFです', 'err'); return;
    }
    const fns = _functions();
    if (!fns) { _setStatus('Functions SDKが読み込まれていません', 'err'); return; }

    const btn = document.getElementById('line-test-btn');
    if (btn) { btn.disabled = true; btn.textContent = '送信中…'; }
    _setStatus('テスト送信中…', '');

    try {
      const callable = fns.httpsCallable('sendLineNotification');
      const senderName = _myDisplayName();
      const stamp = _formatNow();
      const message = `🚗 CarFlow からの接続テストです。\n送信日時：${stamp}\n送信者：${senderName}`;

      await callable({
        companyId: window.fb.currentCompanyId,
        message: message,
        kind: 'test',
      });
      _setStatus('✅ 接続テストOK（LINEグループを確認）', 'ok');
      if (typeof showToast === 'function') showToast('LINEに接続テストを送信しました');
    } catch (err) {
      console.error('[line-notify] test send error', err);
      _setStatus('❌ 送信失敗：' + _explainErr(err), 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📤 接続テスト送信'; }
    }
  }

  // ----------------------------------------
  // 共通：送信前チェック
  // ----------------------------------------
  function _assertReady() {
    if (!window.fb || !window.fb.currentCompanyId) {
      _setStatus('会社情報がまだ読み込まれていません', 'err'); return false;
    }
    if (!_lineConfig.enabled) {
      _setStatus('「LINE通知を有効化」がOFFです', 'err'); return false;
    }
    return true;
  }

  // ----------------------------------------
  // ユーティリティ
  // ----------------------------------------
  function _myDisplayName() {
    return (window.fb.currentStaff && (window.fb.currentStaff.customDisplayName || window.fb.currentStaff.displayName))
      || (window.fb.currentUser && window.fb.currentUser.displayName)
      || 'CarFlow ユーザー';
  }

  function _formatNow() {
    const n = new Date();
    return `${n.getFullYear()}/${String(n.getMonth()+1).padStart(2,'0')}/${String(n.getDate()).padStart(2,'0')} ${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  }

  function _explainErr(err) {
    let msg = err.message || err.code || 'unknown';
    if (err.code === 'unauthenticated') msg = 'ログインが必要です';
    if (err.code === 'permission-denied') msg = '権限がありません（admin/manager のみ）';
    if (err.code === 'failed-precondition') msg = msg || '設定が未完了です';
    return msg;
  }

  function _setStatus(text, kind) {
    const el = document.getElementById('line-config-status');
    if (!el) return;
    el.textContent = text || '';
    el.style.color =
      kind === 'ok' ? 'var(--green, #22c55e)' :
      kind === 'err' ? 'var(--red, #ef4444)' :
      'var(--text3)';
  }

  // ----------------------------------------
  // 設定画面のタブ切替時に loadLineConfig を呼ぶ
  // ----------------------------------------
  function _hookNavSwitch() {
    const nav = document.getElementById('settings-nav');
    if (!nav) return;
    nav.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-section="notify"]');
      if (btn) setTimeout(() => { loadLineConfig(); }, 50);
    });
  }

  // ----------------------------------------
  // v1.8.107: テスト送信用のヘッダー付与
  // ----------------------------------------
  const TEST_HEADER = '⚠️ これは動作テストです。実対応は不要です。\n────────────────\n';
  function _withTestHeader(body) {
    return TEST_HEADER + (body || '');
  }

  // v1.8.107: 各種テスト送信。サンプル文面をクライアント側で組み立てて送る
  async function sendTestForTrigger(kind) {
    if (!_assertReady()) return;
    const fns = _functions();
    if (!fns) { _setStatus('Functions SDKが読み込まれていません', 'err'); return; }
    let body = '';
    const car = { num: 'KMxxxx', maker: '（サンプル）', model: 'ノアX' };
    const senderName = _myDisplayName();
    switch (kind) {
      case 'dailyReport':
        body = `🌅 CarFlow 日報 サンプル\n\n📋 明日の予定：3件\n🚗 明日の納車予定：2台\n💰 今月の売上：¥5,742,000 / 目標 ¥10,000,000\n⏰ 明日リミット車両：1台`;
        break;
      case 'redBoardNote':
        body = `🚨 緊急付箋が立ちました\n\n📝 KMxxxx 明日来店予定\n\n💬 13:00 にナガヨシ様来店予定\n午前中のうちに洗車してほしい\n\n🙋 作成者\n${senderName}`;
        break;
      case 'taskComplete':
        body = `🎉 ${senderName}さんが「再生」を完了しました！\n\n🚗 ${car.num} ${car.maker} ${car.model}\n\nがんばってください！💪`;
        break;
      case 'exhibitReady':
        body = `✨ 仕上がりました！\n\n🚗 ${car.num} ${car.maker} ${car.model}\n再生フェーズの全大タスクが完了 → 展示準備完了です。\nお疲れさまでした！`;
        break;
      case 'deliveryReady':
        body = `🚗 いよいよ納車！\n\n${car.num} ${car.maker} ${car.model}\n納車準備フェーズの全大タスクが完了しました。\n最終チェックよろしくお願いします。`;
        break;
      case 'deliveryDone':
        body = `🎉🎉🎉 納車完了！\n\n🚗 ${car.num} ${car.maker} ${car.model} が無事お客様の元へ！\n\n${senderName}さん、ありがとうございました 🎉`;
        break;
      case 'monthlyGoalReached':
        body = `🏆 月販目標達成しました！\n\n今月 10台 / 目標 10台\n皆さんお疲れさまです！`;
        break;
      case 'contractWin':
        body = `💴 売約取れました！\n\n🚗 ${car.num} ${car.maker} ${car.model}\n👤 営業：${senderName}さん\n📅 納車予定：来月10日`;
        break;
      case 'limitOver':
        body = `🚨 リミット超過アラート\n\n🚗 ${car.num} ${car.maker} ${car.model}\n⚠️ 「再生」が限界ライン +3日\n要対応：早急にチェックを`;
        break;
      case 'carIntake':
        body = `📥 新車仕入れました\n\n🚗 ${car.num} ${car.maker} ${car.model}\n仕入日：今日\n次の弾、よろしくお願いします！`;
        break;
      case 'invDaysAlert':
        body = `⏰ 在庫日数警告\n\n🚗 ${car.num} ${car.maker} ${car.model} が在庫60日に到達\n動き出しが必要です（再掲載／値下げ検討）`;
        break;
      case 'monthlySummary':
        body = `📊 先月 月次サマリー\n\n納車：8台 / 目標 10台（80%）\n売上：¥9,200,000 / 目標 ¥10,000,000\nお疲れさまでした！`;
        break;
      case 'monthlyCloseReminder':
        body = `📋 月末締め作業リマインド\n\n今日は今月の最終営業日です。\n月末締め作業をお忘れなく：\n・在庫車の最終確認\n・販売実績の月締め処理\n・経費精算\n\nよろしくお願いします！`;
        break;
      default:
        body = `（${kind} のテスト送信です）`;
    }
    const message = _withTestHeader(body);
    const btnId = 'line-test-btn-' + kind;
    const btn = document.getElementById(btnId);
    if (btn) { btn.disabled = true; btn.textContent = '送信中…'; }
    try {
      const callable = fns.httpsCallable('sendLineNotification');
      await callable({
        companyId: window.fb.currentCompanyId,
        message: message,
        kind: 'test_' + kind,
      });
      _setStatus('✅ テスト送信OK：' + kind, 'ok');
      if (typeof showToast === 'function') showToast(`✅ テスト送信：${kind}`);
    } catch (err) {
      console.error('[line-notify] test send error', kind, err);
      _setStatus('❌ テスト送信失敗：' + _explainErr(err), 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📤 テスト送信'; }
    }
  }

  // ----------------------------------------
  // v1.8.80: 汎用 LINE メッセージ送信（タスク完了通知などから呼ばれる）
  //   kind === 'task_complete' の時は _lineConfig.triggers.taskComplete.enabled を見て判定
  // ----------------------------------------
  async function sendLineMessage(message, kind) {
    if (!message) return false;
    if (!window.fb || !window.fb.currentCompanyId) return false;
    if (!_lineConfig || !_lineConfig.enabled) return false;
    const k = kind || 'task_complete';
    // タスク完了通知トリガーが OFF なら送信スキップ
    if (k === 'task_complete' && _lineConfig.triggers && _lineConfig.triggers.taskComplete && _lineConfig.triggers.taskComplete.enabled === false) {
      return false;
    }
    const fns = _functions();
    if (!fns) return false;
    try {
      const callable = fns.httpsCallable('sendLineNotification');
      await callable({
        companyId: window.fb.currentCompanyId,
        message: message,
        kind: k,
      });
      return true;
    } catch (err) {
      console.warn('[line-notify] sendLineMessage failed:', err);
      return false;
    }
  }

  // ----------------------------------------
  // 公開
  // ----------------------------------------
  window.toggleLineEnabled = toggleLineEnabled;
  window.toggleLineTrigger = toggleLineTrigger;
  window.onDailyTimeChange = onDailyTimeChange;
  window.toggleDailyClosed = toggleDailyClosed;
  window.onTaskModeChange = onTaskModeChange;
  window.toggleLineTokenVisibility = toggleLineTokenVisibility;
  window.saveLineConfig = saveLineConfig;
  window.sendLineTest = sendLineTest;
  window.loadLineConfig = loadLineConfig;
  // v1.8.80: 汎用 LINE 送信
  window.sendLineMessage = sendLineMessage;
  // v1.8.107: 各トリガー別のテスト送信
  window.sendTestForTrigger = sendTestForTrigger;
  // v1.8.110: スケジュール通知の時刻変更
  window.onTriggerTimeChange = onTriggerTimeChange;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _hookNavSwitch);
  } else {
    _hookNavSwitch();
  }

  console.log('[line-notify] v1.8.20 ready');
})();
