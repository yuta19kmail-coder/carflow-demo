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
  function _defaultConfig() {
    return {
      channelAccessToken: '',
      groupId: '',
      enabled: false,
      triggers: {
        dailyReport:  { enabled: false, time: '17:00', skipClosedDays: true },
        redBoardNote: { enabled: false },
        taskComplete: { enabled: false, mode: 'all' },
      },
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
        _lineConfig = {
          channelAccessToken: typeof d.channelAccessToken === 'string' ? d.channelAccessToken : '',
          groupId: typeof d.groupId === 'string' ? d.groupId : '',
          enabled: !!d.enabled,
          triggers: {
            dailyReport: Object.assign({}, def.triggers.dailyReport, (d.triggers && d.triggers.dailyReport) || {}),
            redBoardNote: Object.assign({}, def.triggers.redBoardNote, (d.triggers && d.triggers.redBoardNote) || {}),
            taskComplete: Object.assign({}, def.triggers.taskComplete, (d.triggers && d.triggers.taskComplete) || {}),
          },
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
  }

  // ----------------------------------------
  // ハンドラ群
  // ----------------------------------------
  function toggleLineEnabled() {
    _lineConfig.enabled = !_lineConfig.enabled;
    const t = document.getElementById('line-enabled-toggle');
    if (t) t.classList.toggle('on', _lineConfig.enabled);
  }

  function toggleLineTrigger(key) {
    if (!_lineConfig.triggers[key]) return;
    _lineConfig.triggers[key].enabled = !_lineConfig.triggers[key].enabled;
    const id = ({
      dailyReport:  'line-trig-daily-toggle',
      redBoardNote: 'line-trig-redboard-toggle',
      taskComplete: 'line-trig-task-toggle',
    })[key];
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on', !!_lineConfig.triggers[key].enabled);
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
  }

  function toggleDailyClosed() {
    const cur = !!_lineConfig.triggers.dailyReport.skipClosedDays;
    _lineConfig.triggers.dailyReport.skipClosedDays = !cur;
    const el = document.getElementById('line-daily-closed-toggle');
    if (el) el.classList.toggle('on', !_lineConfig.triggers.dailyReport.skipClosedDays);
  }

  function onTaskModeChange(radio) {
    if (!radio || !radio.value) return;
    _lineConfig.triggers.taskComplete.mode = radio.value;
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
      triggers: {
        dailyReport: Object.assign({}, _lineConfig.triggers.dailyReport),
        redBoardNote: Object.assign({}, _lineConfig.triggers.redBoardNote),
        taskComplete: Object.assign({}, _lineConfig.triggers.taskComplete),
      },
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _hookNavSwitch);
  } else {
    _hookNavSwitch();
  }

  console.log('[line-notify] v1.8.20 ready');
})();
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        