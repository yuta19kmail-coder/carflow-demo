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
  if (name === 'announce' && typeof renderAnnounce === 'function') renderAnnounce();
  if (name === 'members') renderMembers();
  if (name === 'dashboard') renderDashboard();
  if (name === 'archive') renderArchive();
  // v2.16.0: 管理番号リスト
  if (name === 'numlist' && typeof renderNumList === 'function') renderNumList();
  // v2.1.0: バックオフィスパネル
  if (name === 'backoffice' && typeof renderBackoffice === 'function') renderBackoffice();
  // v2.33.0: 整備依頼業務（PitFlow の車販作業）
  if (name === 'pitsales' && window.PitEmbed) PitEmbed.renderPanel();
  if (name === 'help') {
    if (typeof initHelpPanel === 'function') initHelpPanel();
  }
  if (name === 'templates') {
    if (typeof renderTemplateEditor === 'function') renderTemplateEditor();
  }
  if (name === 'settings') {
    // v2.38.0: 定休日・営業時間は MHS が基準。ここは「いま届いているもの」を見せるだけ
    if (typeof window.renderMhsCalCard === 'function') window.renderMhsCalCard();
    renderSizeEditor();
    renderInvWarnEditor();
    renderDelWarnEditor();
    renderGoalsEditor();
    refreshLeadDaysUI();
    if (typeof refreshPriceTaxUI === 'function') refreshPriceTaxUI();
    if (typeof refreshCompanyInfoUI === 'function') refreshCompanyInfoUI();
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

// ========================================
// v2.38.0 設定「店舗運営」の中身＝MHSから届いている営業日・営業時間（見るだけ）
// ========================================
// 🔴 中身は共通部品 js/cal-pit.js の pitCalCardHtml() 1本。ここに書き写さないこと。
window.renderMhsCalCard = function () {
  var el = document.getElementById('mhs-cal-card');
  if (!el) return;
  try { el.innerHTML = (typeof pitCalCardHtml === 'function') ? pitCalCardHtml() : ''; }
  catch (e) { el.innerHTML = ''; }
};
