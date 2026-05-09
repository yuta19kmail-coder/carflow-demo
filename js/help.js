// ========================================
// help.js (v1.7.30)
// ヘルプ：side-panel 化（モーダル廃止）。中身は HELP_CONTENTS から流し込む。
// ========================================

let _helpInited = false;
let _helpCurrentSection = 'basic-overview';

// 後方互換：openHelp(section) は showPanel('help') に転送
function openHelp(section) {
  if (typeof showPanel === 'function') {
    const sb = document.getElementById('si-help');
    showPanel('help', sb);
  }
  if (section) _helpCurrentSection = section;
  // showPanel が initHelpPanel を呼ぶ（navigation.js 側のフック）
  // 直接呼ばれた場合に備えて初期化もしておく
  initHelpPanel();
}
window.openHelp = openHelp;

// v1.7.30: panel-help を body 末尾から「メイン領域内」のマウント先に移す
//   showPanel は document 全体の .side-panel を切り替えるが、表示位置（CSS の親）
//   は other panel と同じ親じゃないと flex レイアウトが壊れる。
//   起動時に1回だけ実行する。
function _movePanelHelpToMainArea() {
  const panel = document.getElementById('panel-help');
  const mount = document.getElementById('help-mount');
  if (panel && mount && mount.parentNode && panel.parentNode !== mount.parentNode) {
    mount.parentNode.insertBefore(panel, mount);
    mount.remove();
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _movePanelHelpToMainArea);
} else {
  _movePanelHelpToMainArea();
}

// navigation.js の showPanel('help') から呼ばれる初期化
function initHelpPanel() {
  // 念のため再度チェック（DOM が後から差し替えられた場合に備えて）
  _movePanelHelpToMainArea();
  if (!_helpInited) {
    _injectAllHelpContents();
    _helpInited = true;
  }
  showHelpSection(_helpCurrentSection || 'basic-overview');
}
window.initHelpPanel = initHelpPanel;

// 後方互換用：closeHelp は showPanel('dashboard') 相当に転送
function closeHelp() {
  if (typeof showPanel === 'function') {
    const sb = document.getElementById('si-dashboard');
    showPanel('dashboard', sb);
  }
}
window.closeHelp = closeHelp;

function showHelpSection(id) {
  if (!id) id = 'basic-overview';
  _helpCurrentSection = id;
  document.querySelectorAll('.help-sb-item').forEach(el => {
    el.classList.toggle('active', el.dataset.section === id);
  });
  document.querySelectorAll('.help-sec').forEach(el => {
    el.classList.toggle('active', el.dataset.section === id);
  });
  // スマホでは選んだら自動でサイドバーを閉じる
  document.body.classList.remove('help-sb-mobile-open');
  // スクロール位置をトップに
  const content = document.getElementById('help-content');
  if (content) content.scrollTop = 0;
}
window.showHelpSection = showHelpSection;

function toggleHelpSidebar() {
  document.body.classList.toggle('help-sb-mobile-open');
}
window.toggleHelpSidebar = toggleHelpSidebar;

function onHelpSearch(q) {
  const query = String(q || '').trim().toLowerCase();
  if (!query) {
    document.querySelectorAll('.help-sb-item, .help-sb-cat').forEach(el => {
      el.style.display = '';
    });
    return;
  }
  document.querySelectorAll('.help-sb-item').forEach(el => {
    const id = el.dataset.section;
    const label = (el.textContent || '').toLowerCase();
    const body = (window.HELP_CONTENTS && window.HELP_CONTENTS[id])
      ? String(window.HELP_CONTENTS[id]).toLowerCase()
      : '';
    if (label.includes(query) || body.includes(query)) {
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });
  document.querySelectorAll('.help-sb-cat').forEach(catEl => {
    let next = catEl.nextElementSibling;
    let hasVisible = false;
    while (next && !next.classList.contains('help-sb-cat')) {
      if (next.classList.contains('help-sb-item') && next.style.display !== 'none') {
        hasVisible = true;
        break;
      }
      next = next.nextElementSibling;
    }
    catEl.style.display = hasVisible ? '' : 'none';
  });
}
window.onHelpSearch = onHelpSearch;

function _injectAllHelpContents() {
  if (typeof HELP_CONTENTS !== 'object' || HELP_CONTENTS == null) return;
  document.querySelectorAll('.help-sec').forEach(el => {
    const id = el.dataset.section;
    if (!id) return;
    const html = HELP_CONTENTS[id];
    if (typeof html === 'string') el.innerHTML = html;
    else el.innerHTML = '<div class="help-wip">📝 このセクションは執筆中です。</div>';
  });
}
