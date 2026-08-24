// ========================================
// theme.js (v1.0.1)
// テーマ切替（ダーク/ライト）＋フォントサイズ切替
// localStorage 保存・起動時復元
// v0.9.9: トップバーのクイックフォントサイズを3分割ボタンに変更
// v1.0.0: toggleTheme() を追加。現場モード（ws-topbar）のテーマ切替ボタンを同期。
// v1.0.1: 切替ボタンを現場モード TOP（#tb-theme-toggle）に移設。
// ========================================

const THEME_KEY = 'carflow_theme';
const FONTSIZE_KEY = 'carflow_fontsize';
const DEFAULT_THEME = 'dark';
const DEFAULT_FONTSIZE = 'md';

// 4テーマ（dark / light / dark-liquid / light-liquid）
const VALID_THEMES = ['dark', 'light', 'dark-liquid', 'light-liquid'];
const THEME_LABELS = {
  'dark':         '🌙 ダーク',
  'light':        '☀️ ライト',
  'dark-liquid':  '✨ ダーク・リキッド',
  'light-liquid': '💎 ライト・リキッド',
};

const FONTSIZE_ORDER = ['md', 'lg', 'xl'];
const FONTSIZE_LABELS = { md: '標準', lg: '大', xl: '特大' };

function setTheme(theme) {
  const t = VALID_THEMES.includes(theme) ? theme : DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  refreshThemePickerUI();
  if (typeof showToast === 'function') {
    showToast(THEME_LABELS[t] + ' に切替えました');
  }
}

// 現場モード TOP（topbar）のワンタップ切替：dark/light の base だけ切替。リキッド suffix は維持
//   例：dark-liquid → light-liquid、light → dark
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
  const isLight = cur === 'light' || cur === 'light-liquid';
  const isLiquid = cur.endsWith('-liquid');
  const baseNext = isLight ? 'dark' : 'light';
  const nextTheme = isLiquid ? (baseNext + '-liquid') : baseNext;
  setTheme(nextTheme);
}

// ヘッダー（AAAの右隣）の4テーマ循環ボタン用：dark → light → dark-liquid → light-liquid を巡回。
//   setTheme 経由なので localStorage 保存＋設定画面のテーマピッカーと自動連動する。
function cycleTheme() {
  const order = ['dark', 'light', 'dark-liquid', 'light-liquid'];
  const cur = document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
  const idx = order.indexOf(cur);
  const next = order[(idx + 1) % order.length];
  setTheme(next);
}

function setFontSize(size) {
  const s = FONTSIZE_ORDER.includes(size) ? size : 'md';
  document.documentElement.setAttribute('data-fontsize', s);
  try { localStorage.setItem(FONTSIZE_KEY, s); } catch (e) {}
  refreshFontSizePickerUI();
  refreshTopbarFontSizeLabel();
  if (typeof showToast === 'function') {
    showToast(`文字サイズ：${FONTSIZE_LABELS[s]}`);
  }
}

function applyStoredThemeAndSize() {
  let theme = DEFAULT_THEME;
  let size = DEFAULT_FONTSIZE;
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (VALID_THEMES.includes(t)) theme = t;
    const s = localStorage.getItem(FONTSIZE_KEY);
    if (FONTSIZE_ORDER.includes(s)) size = s;
  } catch (e) {}
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-fontsize', size);
}

function refreshThemePickerUI() {
  const cur = document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
  document.querySelectorAll('#theme-picker .theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === cur);
  });
  // 現場モード TOP（topbar）の切替ボタンの表示を同期（4テーマ対応：base のみ反転）
  const tbBtn = document.getElementById('tb-theme-toggle');
  if (tbBtn) {
    const isLight = cur === 'light' || cur === 'light-liquid';
    tbBtn.innerHTML = icoE(isLight ? '☀️' : '🌙');
    tbBtn.setAttribute('aria-label', isLight ? 'ライト→ダークに切替' : 'ダーク→ライトに切替');
    tbBtn.setAttribute('title', isLight ? 'ライト→ダーク' : 'ダーク→ライト');
  }
  // ヘッダー（AAAの右隣）の4テーマ循環ボタンのアイコン/ツールチップも同期
  //   アイコンは設定画面のテーマピッカーと同じ絵文字（🌙/☀️/✨/💎）に揃える
  const cycBtn = document.getElementById('tb-theme-cycle');
  if (cycBtn) {
    const ICON = { 'dark': '🌙', 'light': '☀️', 'dark-liquid': '✨', 'light-liquid': '💎' };
    const NAME = { 'dark': 'ダーク', 'light': 'ライト', 'dark-liquid': 'ダーク・リキッド', 'light-liquid': 'ライト・リキッド' };
    cycBtn.innerHTML = icoE(ICON[cur] || '🌙');
    cycBtn.setAttribute('title', 'テーマ切替（現在：' + (NAME[cur] || '') + '）');
    cycBtn.setAttribute('aria-label', 'テーマを切り替え。現在：' + (NAME[cur] || ''));
  }
}

function refreshFontSizePickerUI() {
  const cur = document.documentElement.getAttribute('data-fontsize') || DEFAULT_FONTSIZE;
  document.querySelectorAll('#fontsize-picker .fontsize-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.fontsize === cur);
  });
}

// v0.9.9: トップバーの3分割ボタンの状態を更新
function refreshTopbarFontSizeLabel() {
  const cur = document.documentElement.getAttribute('data-fontsize') || DEFAULT_FONTSIZE;
  document.querySelectorAll('#tb-fontsize-group .tb-fontsize-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.fontsize === cur);
  });
}

applyStoredThemeAndSize();
function _initThemeUI() {
  refreshTopbarFontSizeLabel();
  refreshThemePickerUI();  // v1.0.0: 現場モード切替ボタンの初期表示
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initThemeUI);
} else {
  _initThemeUI();
}
