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
  let _lineConfig = {
    enabled: true,
    channelAccessToken: 'demo-token',
    groupId: 'demo-group',
    triggers: {
      dailyReport: { enabled: true, time: '17:00', includeClosedDays: false },
      redBoardNote: { enabled: true },
      taskComplete: { enabled: true, mode: 'all' },
    },
  };

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
  }
  function toggleLineEnabled() {
    _lineConfig.enabled = !_lineConfig.enabled;
    _renderLineUI();
  }
  function toggleLineTrigger(key) {
    if (_lineConfig.triggers[key]) {
      _lineConfig.triggers[key].enabled = !_lineConfig.triggers[key].enabled;
      _renderLineUI();
    }
  }
  function onDailyTimeChange() { /* noop */ }
  function toggleDailyClosed() {
    _lineConfig.triggers.dailyReport.includeClosedDays = !_lineConfig.triggers.dailyReport.includeClosedDays;
  }
  function onTaskModeChange(el) {
    _lineConfig.triggers.taskComplete.mode = el.value;
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
  window.sendLineTest = sendLineTest;
  window.loadLineConfig = loadLineConfig;
  window.demoShowLineToast = showLineToast;

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

  console.log('[demo-line-toast] ready');
})();
