// ========================================
// demo-line-toast.js
// デモ版用：LINE Cloud Functions 呼び出しを「スマホ風UIトースト」に置き換え
// ----------------------------------------
// 本物のLINEには送らない。画面右下にスマホ風UIで吹き出し表示。
// 既存 line-notify.js は読み込まない代わりに、これでスタブ化。
// ========================================

(function () {
  'use strict';

  let _toastContainer = null;

  function _ensureContainer() {
    if (_toastContainer) return _toastContainer;
    _toastContainer = document.createElement('div');
    _toastContainer.id = 'demo-line-toast-container';
    document.body.appendChild(_toastContainer);
    return _toastContainer;
  }

  // -----------------------------------
  // トースト表示
  // -----------------------------------
  function showLineToast(message, opts) {
    opts = opts || {};
    const container = _ensureContainer();
    const card = document.createElement('div');
    card.className = 'demo-line-toast';
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    card.innerHTML = `
      <div class="demo-line-toast-header">
        <div class="demo-line-toast-avatar">🚗</div>
        <div class="demo-line-toast-meta">
          <div class="demo-line-toast-name">CarFlow Bot</div>
          <div class="demo-line-toast-sub">${opts.label || 'LINE通知'}</div>
        </div>
        <button class="demo-line-toast-close" aria-label="閉じる">×</button>
      </div>
      <div class="demo-line-toast-body">${_formatMessage(message)}</div>
      <div class="demo-line-toast-footer">
        <span class="demo-line-toast-time">${time}</span>
        <span class="demo-line-toast-tag">📱 LINEプレビュー（実送信はされません）</span>
      </div>
    `;
    container.appendChild(card);
    // アニメーション in
    requestAnimationFrame(() => card.classList.add('show'));
    // 閉じるボタン
    card.querySelector('.demo-line-toast-close').onclick = () => _close(card);
    // 自動クローズ（10秒）
    setTimeout(() => _close(card), 10000);
  }

  function _close(card) {
    card.classList.remove('show');
    setTimeout(() => card.remove(), 300);
  }

  function _formatMessage(msg) {
    return String(msg || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  // -----------------------------------
  // line-notify.js の API スタブ
  // 本番は Firebase Functions を呼ぶが、デモはトーストで代替
  // -----------------------------------
  // v1.8.110: 14種類すべて初期 ON 状態（デモなので動作確認しやすいよう全部 ON）
  const NEW_TRIGGER_KEYS = [
    'exhibitReady', 'deliveryReady', 'deliveryDone',
    'monthlyGoalReached', 'contractWin', 'limitOver',
    'carIntake', 'invDaysAlert', 'monthlySummary',
    'monthlyCloseReminder',
  ];
  const SCHEDULED_TRIGGER_KEYS = ['limitOver', 'invDaysAlert', 'monthlySummary', 'monthlyCloseReminder'];
  const DEFAULT_TIMES = { limitOver:'07:00', invDaysAlert:'07:00', monthlySummary:'08:00', monthlyCloseReminder:'17:00' };

  let _lineConfig = {
    enabled: true,
    channelAccessToken: 'demo-token',
    groupId: 'demo-group',
    triggers: {
      dailyReport: { enabled: true, time: '17:00', skipClosedDays: true },
      redBoardNote: { enabled: true },
      taskComplete: { enabled: true, mode: 'all' },
    },
  };
  // 新規トリガーを初期化
  NEW_TRIGGER_KEYS.forEach(k => {
    _lineConfig.triggers[k] = { enabled: true };
    if (SCHEDULED_TRIGGER_KEYS.indexOf(k) >= 0) _lineConfig.triggers[k].time = DEFAULT_TIMES[k];
  });

  async function loadLineConfig() {
    _renderLineUI();
  }
  async function saveLineConfig() {
    if (typeof showToast === 'function') showToast('（デモ）LINE設定を保存しました');
  }
  function _renderLineUI() {
    const tokenInp = document.getElementById('line-token-inp');
    const groupInp = document.getElementById('line-group-inp');
    if (tokenInp) tokenInp.value = 'demo●●●●●●●●●●';
    if (groupInp) groupInp.value = 'デモグループID';
    const toggleEnabled = document.getElementById('line-enabled-toggle');
    if (toggleEnabled) toggleEnabled.classList.toggle('on', !!_lineConfig.enabled);
    const tDaily = document.getElementById('line-trig-daily-toggle');
    const tRed = document.getElementById('line-trig-redboard-toggle');
    const tTask = document.getElementById('line-trig-task-toggle');
    if (tDaily) tDaily.classList.toggle('on', !!_lineConfig.triggers.dailyReport.enabled);
    if (tRed) tRed.classList.toggle('on', !!_lineConfig.triggers.redBoardNote.enabled);
    if (tTask) tTask.classList.toggle('on', !!_lineConfig.triggers.taskComplete.enabled);
    // v1.8.110: 日報の「休業日にも送信する」トグル
    const tDailyClosed = document.getElementById('line-daily-closed-toggle');
    if (tDailyClosed) tDailyClosed.classList.toggle('on', !_lineConfig.triggers.dailyReport.skipClosedDays);
    const tDailyTime = document.getElementById('line-daily-time');
    if (tDailyTime) tDailyTime.value = _lineConfig.triggers.dailyReport.time || '17:00';
    // v1.8.110: 新規9トリガーのON/OFF
    NEW_TRIGGER_KEYS.forEach(key => {
      const el = document.getElementById('line-trig-' + key + '-toggle');
      if (el) el.classList.toggle('on', !!(_lineConfig.triggers[key] && _lineConfig.triggers[key].enabled));
    });
    // v1.8.110: スケジュール通知の時刻
    SCHEDULED_TRIGGER_KEYS.forEach(key => {
      const el = document.getElementById('line-' + key + '-time');
      if (el) el.value = (_lineConfig.triggers[key] && _lineConfig.triggers[key].time) || DEFAULT_TIMES[key] || '08:00';
    });
    // タスク完了モード（ラジオボタン）
    const modeRadios = document.querySelectorAll('input[name="line-task-mode"]');
    modeRadios.forEach(r => { r.checked = (r.value === (_lineConfig.triggers.taskComplete.mode || 'all')); });
  }
  function toggleLineEnabled() {
    _lineConfig.enabled = !_lineConfig.enabled;
    _renderLineUI();
  }
  function toggleLineTrigger(key) {
    // v1.8.110: 新規キーも自動作成
    if (!_lineConfig.triggers[key]) _lineConfig.triggers[key] = { enabled: false };
    _lineConfig.triggers[key].enabled = !_lineConfig.triggers[key].enabled;
    _renderLineUI();
    if (typeof showToast === 'function') showToast('✓ 自動保存しました（デモ）');
  }
  function onDailyTimeChange() {
    const inp = document.getElementById('line-daily-time');
    if (inp) _lineConfig.triggers.dailyReport.time = inp.value || '17:00';
    if (typeof showToast === 'function') showToast('✓ 自動保存しました（デモ）');
  }
  function toggleDailyClosed() {
    // skipClosedDays トグル（本体仕様）
    _lineConfig.triggers.dailyReport.skipClosedDays = !_lineConfig.triggers.dailyReport.skipClosedDays;
    _renderLineUI();
    if (typeof showToast === 'function') showToast('✓ 自動保存しました（デモ）');
  }
  function onTaskModeChange(el) {
    _lineConfig.triggers.taskComplete.mode = el.value;
    if (typeof showToast === 'function') showToast('✓ 自動保存しました（デモ）');
  }
  // v1.8.110: スケジュール通知の送信時刻変更
  function onTriggerTimeChange(key, value){
    if (!_lineConfig.triggers[key]) _lineConfig.triggers[key] = { enabled: false };
    _lineConfig.triggers[key].time = value || DEFAULT_TIMES[key] || '08:00';
    const el = document.getElementById('line-' + key + '-time');
    if (el) el.value = _lineConfig.triggers[key].time;
    if (typeof showToast === 'function') showToast('✓ 自動保存しました（デモ）');
  }
  function toggleLineTokenVisibility() { /* noop */ }
  async function sendLineTest() {
    showLineToast('🚗 CarFlow からの接続テストです。\n\n（デモ版なので実際のLINEには送られません）', { label: '接続テスト' });
  }

  // -----------------------------------
  // 自動トリガー用フック（赤付箋作成・大タスク完了など）
  // 本番では Cloud Functions が裏で動くが、デモは画面上で発火
  // -----------------------------------
  window.demoTriggerRedBoardNote = function (note) {
    if (!_lineConfig.enabled || !_lineConfig.triggers.redBoardNote.enabled) return;
    const senderName = (window.fb.currentUser && window.fb.currentUser.displayName) || 'ユーザー';
    const message = [
      '🚨 緊急付箋が立ちました',
      '',
      `📝 タイトル：${note.title || '(無題)'}`,
      `💬 内容：${note.body || '(本文なし)'}`,
      `🙋 作成者：${senderName}`,
    ].join('\n');
    showLineToast(message, { label: '赤付箋通知' });
  };

  window.demoTriggerTaskComplete = function (taskName, carNum, carModel) {
    if (!_lineConfig.enabled || !_lineConfig.triggers.taskComplete.enabled) return;
    const senderName = (window.fb.currentUser && window.fb.currentUser.displayName) || 'ユーザー';
    const message = [
      `🎉 ${senderName}さんが「${taskName}」を完了しました！`,
      '',
      `🚗 ${carNum} ${carModel}`,
      '',
      'がんばってください！💪',
    ].join('\n');
    showLineToast(message, { label: '大タスク完了' });
  };

  window.demoTriggerDailyReport = function () {
    const message = [
      '📅 本日の業務終了 / 明日の予定',
      '',
      '🚗 明日の納車予定：2台',
      '・KM-DEMO-005 トヨタ ノア',
      '・KM-DEMO-008 ホンダ N-BOX',
      '',
      '💰 今月の売上：¥7,820,000 / 目標 ¥10,000,000（78%）',
      '📦 在庫リミット車両：3台',
    ].join('\n');
    showLineToast(message, { label: '日報通知' });
  };

  // -----------------------------------
  // 既存 window.* にスタブ関数を公開
  // -----------------------------------
  window.toggleLineEnabled = toggleLineEnabled;
  window.toggleLineTrigger = toggleLineTrigger;
  window.onDailyTimeChange = onDailyTimeChange;
  window.toggleDailyClosed = toggleDailyClosed;
  window.onTaskModeChange = onTaskModeChange;
  window.toggleLineTokenVisibility = toggleLineTokenVisibility;
  window.saveLineConfig = saveLineConfig;
  window.loadLineConfig = loadLineConfig;
  window.demoShowLineToast = showLineToast;
  // v1.8.110: 新規追加
  window.onTriggerTimeChange = onTriggerTimeChange;

  // v1.8.105: task-completion-notify.js が呼ぶ sendLineMessage を本番互換で実装
  // 本番は line-notify.js が定義する。デモではトースト表示に置換
  window.sendLineMessage = function (message, kind) {
    if (!_lineConfig.enabled) return Promise.resolve();
    let label = 'LINE通知';
    if (kind === 'task_complete' || kind === 'task_completion') label = 'タスク完了';
    else if (kind === 'red_boardnote') label = '赤付箋';
    else if (kind === 'daily_report') label = '日報';
    showLineToast(message, { label });
    return Promise.resolve();
  };

  // v1.8.110: 各トリガー別のテスト送信をデモ用にトースト化
  // 本体は Cloud Functions 呼び出し（デモ版だと _assertReady で主電源OFFブロック）
  // デモでは主電源無関係で常にトーストで動作確認できるよう上書き
  const TEST_HEADER = '⚠️ これは動作テストです。実対応は不要です。\n────────────────\n';
  window.sendTestForTrigger = function (kind) {
    let body = '';
    let label = 'テスト';
    const car = { num: 'KMxxxx', maker: '（サンプル）', model: 'ノアX' };
    const senderName = '（デモユーザー）';
    switch (kind) {
      case 'dailyReport':
        body = `🌅 CarFlow 日報 サンプル\n\n📋 明日の予定：3件\n🚗 明日の納車予定：2台\n💰 今月の売上：¥5,742,000 / 目標 ¥10,000,000\n⏰ 明日リミット車両：1台`;
        label = '日報通知';
        break;
      case 'redBoardNote':
        body = `🚨 緊急付箋が立ちました\n\n📝 KMxxxx 明日来店予定\n\n💬 13:00 にナガヨシ様来店予定\n午前中のうちに洗車してほしい\n\n🙋 作成者\n${senderName}`;
        label = '赤付箋通知';
        break;
      case 'taskComplete':
        body = `🎉 ${senderName}さんが「再生」を完了しました！\n\n🚗 ${car.num} ${car.maker} ${car.model}\n\nがんばってください！💪`;
        label = '大タスク完了';
        break;
      case 'exhibitReady':
        body = `✨ 仕上がりました！\n\n🚗 ${car.num} ${car.maker} ${car.model}\n再生フェーズの全大タスクが完了 → 展示準備完了です。\nお疲れさまでした！`;
        label = '展示準備完了';
        break;
      case 'deliveryReady':
        body = `🚗 いよいよ納車！\n\n${car.num} ${car.maker} ${car.model}\n納車準備フェーズの全大タスクが完了しました。\n最終チェックよろしくお願いします。`;
        label = '納車準備完了';
        break;
      case 'deliveryDone':
        body = `🎉🎉🎉 納車完了！\n\n🚗 ${car.num} ${car.maker} ${car.model} が無事お客様の元へ！\n\n${senderName}さん、ありがとうございました 🎉`;
        label = '納車完了';
        break;
      case 'monthlyGoalReached':
        body = `🏆 月販目標達成しました！\n\n今月 10台 / 目標 10台\n皆さんお疲れさまです！`;
        label = '月販目標達成';
        break;
      case 'contractWin':
        body = `💴 売約取れました！\n\n🚗 ${car.num} ${car.maker} ${car.model}\n👤 営業：${senderName}さん\n📅 納車予定：来月10日`;
        label = '売約';
        break;
      case 'limitOver':
        body = `🚨 リミット超過アラート（朝の定時通知）\n\n・KM-0500 ノアX：再生（限界+3日）\n・KM-0505 フォレスター：展示（限界+5日）`;
        label = 'リミット超過';
        break;
      case 'carIntake':
        body = `📥 新車仕入れました\n\n🚗 ${car.num} ${car.maker} ${car.model}\n仕入日：今日\n次の弾、よろしくお願いします！`;
        label = '仕入れ';
        break;
      case 'invDaysAlert':
        body = `⏰ 在庫日数警告（朝の定時通知）\n\n・KM-0480 アクア：在庫65日（60日警告）\n・KM-0475 N-BOX：在庫95日（90日警告）`;
        label = '在庫日数警告';
        break;
      case 'monthlySummary':
        body = `📊 先月 月次サマリー\n\n納車：8台 / 目標 10台（80%）\n売上：¥9,200,000 / 目標 ¥10,000,000\nお疲れさまでした！`;
        label = '月末サマリー';
        break;
      case 'monthlyCloseReminder':
        body = `📋 月末締め作業リマインド\n\n今日は今月の最終営業日です。\n月末締め作業をお忘れなく：\n・在庫車の最終確認\n・販売実績の月締め処理\n・経費精算\n\nよろしくお願いします！`;
        label = '月末締めリマインド';
        break;
      default:
        body = `（${kind} のテスト送信です）`;
    }
    showLineToast(TEST_HEADER + body, { label });
  };

  // 接続テストも同様
  window.sendLineTest = function () {
    showLineToast('🚗 CarFlow からの接続テストです。\n\n（デモ版なので実際のLINEには送られません）', { label: '接続テスト' });
  };

  console.log('[demo-line-toast] ready');
})();
