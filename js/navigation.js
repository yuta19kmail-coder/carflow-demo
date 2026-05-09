// ========================================
// navigation.js
// パネル・タブの切り替え
// v0.9.6: 設定画面でテーマ・フォントサイズ選択状態を反映
// v1.8.1: ミーティングビュー対応
// ========================================

function showPanel(name, el) {
  document.querySelectorAll('.side-panel,.view').forEach(v => {
    v.classList.remove('open','active');
    v.style.display = 'none';
  });
  document.querySelectorAll('.sb-item').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  const p = document.getElementById('panel-' + name);
  if (p) { p.style.display = 'flex'; p.classList.add('open'); }
  document.body.classList.toggle('panel-dashboard-active', name === 'dashboard');
  document.body.classList.remove('tab-view-active');
  document.body.classList.remove('action-area-collapsed');
  if (name === 'log') renderLogPanel();
  if (name === 'members') renderMembers();
  if (name === 'dashboard') renderDashboard();
  if (name === 'archive') renderArchive();
  if (name === 'help') {
    if (typeof initHelpPanel === 'function') initHelpPanel();
  }
  if (name === 'templates') {
    if (typeof renderTemplateEditor === 'function') renderTemplateEditor();
  }
  if (name === 'settings') {
    renderClosedDaysPicker();
    renderSizeEditor();
    renderInvWarnEditor();
    renderDelWarnEditor();
    renderClosedRulesList();
    renderGoalsEditor();
    refreshLeadDaysUI();
    if (typeof refreshThemePickerUI === 'function') refreshThemePickerUI();
    if (typeof refreshFontSizePickerUI === 'function') refreshFontSizePickerUI();
    if (typeof renderTasksEditor === 'function') renderTasksEditor();
    if (typeof renderProfileSection === 'function') renderProfileSection();
    if (typeof renderBoardLabelsEditor === 'function') renderBoardLabelsEditor();
  }
}

// タブ（カンバン、カレンダー、展示、進捗、一覧、在庫、ミーティング 等）切替
function switchTab(name, el) {
  document.querySelectorAll('.side-panel,.view').forEach(v => {
    v.classList.remove('open','active');
    v.style.display = 'none';
  });
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(s => s.classList.remove('active'));
  if (el && el.classList && typeof el.classList.add === 'function') {
    el.classList.add('active');
  }
  const v = document.getElementById('view-' + name);
  if (v) { v.style.display = 'flex'; v.classList.add('active'); }
  document.body.classList.remove('panel-dashboard-active');
  // v1.7.43: 作業実績は車一覧系ではないので要対応アクションを出さない
  // v1.8.1: ミーティングは中で要対応アクションを別表示するので下部 chip は隠す
  if (name === 'worklog' || name === 'meeting') {
    document.body.classList.remove('tab-view-active');
  } else {
    document.body.classList.add('tab-view-active');
  }
  document.body.classList.remove('action-area-collapsed');
  if (name === 'overview') {
    if (typeof renderOverview === 'function') renderOverview();
  }
  if (name === 'kanban')    renderKanban();
  if (name === 'calendar')  renderCalendar();
  if (name === 'exhibit')   renderExhibit();
  if (name === 'progress')  renderProgress();
  if (name === 'table')     renderTable();
  if (name === 'inventory') renderInventory();
  if (name === 'deal') {
    if (typeof renderDeal === 'function') renderDeal();
    if (typeof enterDealMode === 'function') enterDealMode();
  } else {
    document.body.classList.remove('deal-mode');
  }
  if (name === 'worklog') {
    if (typeof renderWorklog === 'function') renderWorklog();
  }
  // v1.8.1: ミーティングビュー
  if (name === 'meeting') {
    // サイドバー経由で開いた時、上で sb-item を全消去してしまうので si-meeting に active を付け直す
    const siM = document.getElementById('si-meeting');
    if (siM) siM.classList.add('active');
    if (typeof renderMeeting === 'function') renderMeeting();
  }
}
