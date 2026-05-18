// ========================================
// theme.js (v2.4.0)
// テーマ切替（4テーマ：dark / light / dark-liquid / light-liquid）＋フォントサイズ切替
// localStorage 保存・起動時復元
// v0.9.9: トップバーのクイックフォントサイズを3分割ボタンに変更
// v2.4.0: 4テーマ展開（リキッド・ガラス対応）
// ========================================

const THEME_KEY = 'carflow_theme';
const FONTSIZE_KEY = 'carflow_fontsize';
const DEFAULT_THEME = 'dark';
const DEFAULT_FONTSIZE = 'md';

// v2.4.0: 4テーマ
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

function setFontSize(size) {
  const s = FONTSIZE_ORDER.includes(size) ? size : 'md';
  document.documentElement.setAttribute('data-fontsize', s);
  try { localStorage.setItem(FONTSIZE_KEY, s); } catch (e) {}
  refreshFontSizePickerUI();
  refreshTopbarFontSizeLabel();
  if (typeof showToast === 'function') {
    showToast(`🔤 文字サイズ：${FONTSIZE_LABELS[s]}`);
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
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refreshTopbarFontSizeLabel);
} else {
  refreshTopbarFontSizeLabel();
}
