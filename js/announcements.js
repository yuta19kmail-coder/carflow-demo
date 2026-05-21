// ========================================
// announcements.js (v2.5.25-demo / 新機能)
// 「お知らせ」：新機能の使い方などを“メール的”に配信する受信箱。
//
// ・お知らせ本体は ANNOUNCEMENTS 配列にコード定義（開発側が新機能リリース時に追記）。
// ・既読状態はアカウントごと。
//     - デモ版：アカウント概念がないので localStorage（端末ごと）に保存。
//     - 本体反映時：Firestore のスタッフドキュメントに readAnnouncements として保存に差し替える。
//   → 保存は _getReadAnnounce / _setReadAnnounce に集約しているので、本体ではここだけ差し替えればよい。
// ・サイドバー「お知らせ」に未読件数バッジ（#announce-badge）。既読にすると減る／消える。
//
// 公開API：
//   renderAnnounce()         パネル描画（showPanel('announce') から呼ばれる）
//   refreshAnnounceBadge()   サイドバーの未読バッジ更新
//   toggleAnnounce(id)       1件を開閉（開いたら既読化）
//   markAllAnnounceRead()    すべて既読
// ========================================

// ----- お知らせデータ（新しいものほど上に。date は YYYY-MM-DD） -----
const ANNOUNCEMENTS = [
  {
    id: 'a-20260521-theme',
    date: '2026-05-21',
    title: '🎨 テーマが4種類になりました（ライト刷新＋リキッドガラス）',
    body: `
      <p>画面のテーマが <b>4種類</b> から選べるようになりました。</p>
      <ul>
        <li>🌙 ダーク／☀️ ライト（白グレーで見やすく刷新）</li>
        <li>✨ ダーク・リキッド／💎 ライト・リキッド（ガラス風の半透明デザイン）</li>
      </ul>
      <p><b>切り替え方</b>：画面右上の文字サイズ「AAA」の右隣のボタンを押すごとに4テーマを順番に切替できます。設定 → 表示設定 からも選べます。</p>
      <p>スマホの現場モードでは、上部の 🌙/☀️ ボタンでダーク/ライトをワンタップ切替できます。</p>
    `,
  },
  {
    id: 'a-20260521-memo',
    date: '2026-05-21',
    title: '📝 ダッシュボードに「車両メモ一覧」を追加',
    body: `
      <p>これまで車両のメモは、カードを1台ずつ開かないと確認できませんでした。</p>
      <p>ダッシュボードの「全体タスク（付箋）」の下に <b>車両メモ一覧</b> を追加し、メモのある車をまとめて確認できるようになりました。</p>
      <ul>
        <li>「その他／在庫車／売約車」の3グループで表示</li>
        <li>各行に コアメモ・作業メモ・大タスクのメモ をコンパクト表示</li>
        <li><b>管理番号をクリック</b>すると車両の詳細が開きます</li>
        <li>通常は折りたたみ。「詳細 ▼」で展開します</li>
      </ul>
    `,
  },
  {
    id: 'a-20260521-log',
    date: '2026-05-21',
    title: '📋 操作ログが見やすくなりました',
    body: `
      <p>操作ログ（管理 → 操作ログ）の表示を改善しました。</p>
      <ul>
        <li><b>管理番号をクリック</b>すると、その車両の詳細が開きます</li>
        <li>「t_webup」のような内部の記号を、<b>日本語のタスク名</b>（例：webUP）で表示するようにしました</li>
      </ul>
    `,
  },
];

// ----- 既読状態（デモ＝localStorage。本体ではここをFirestoreに差し替え） -----
const ANNOUNCE_READ_KEY = 'carflow_announce_read';

function _getReadAnnounce() {
  try {
    const r = JSON.parse(localStorage.getItem(ANNOUNCE_READ_KEY) || '[]');
    return Array.isArray(r) ? r : [];
  } catch (e) { return []; }
}
function _setReadAnnounce(arr) {
  try { localStorage.setItem(ANNOUNCE_READ_KEY, JSON.stringify(arr)); } catch (e) {}
}
function announceUnreadCount() {
  const read = _getReadAnnounce();
  return ANNOUNCEMENTS.filter(a => read.indexOf(a.id) === -1).length;
}
function _markAnnounceRead(id) {
  const read = _getReadAnnounce();
  if (read.indexOf(id) === -1) { read.push(id); _setReadAnnounce(read); }
  refreshAnnounceBadge();
}
function markAllAnnounceRead() {
  _setReadAnnounce(ANNOUNCEMENTS.map(a => a.id));
  refreshAnnounceBadge();
  renderAnnounce();
}

// ----- サイドバーの未読バッジ -----
function refreshAnnounceBadge() {
  const el = document.getElementById('announce-badge');
  if (!el) return;
  const n = announceUnreadCount();
  if (n > 0) { el.textContent = String(n); el.style.display = ''; }
  else { el.textContent = ''; el.style.display = 'none'; }
}

// ----- 受信箱の描画 -----
function _ancEsc(s) {
  if (typeof escapeHtml === 'function') return escapeHtml(s);
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderAnnounce() {
  const host = document.getElementById('announce-list');
  if (!host) return;
  const read = _getReadAnnounce();
  const items = ANNOUNCEMENTS.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  if (!items.length) {
    host.innerHTML = '<div class="anc-empty">お知らせはありません</div>';
    refreshAnnounceBadge();
    return;
  }
  host.innerHTML = items.map(a => {
    const isRead = read.indexOf(a.id) !== -1;
    const isOpen = window._ancOpen === a.id;
    return '<div class="anc-item ' + (isRead ? 'is-read' : 'is-unread') + (isOpen ? ' is-open' : '') + '">'
      + '<div class="anc-head" onclick="toggleAnnounce(\'' + a.id + '\')">'
      + '<span class="anc-dot"></span>'
      + '<span class="anc-title">' + _ancEsc(a.title) + '</span>'
      + '<span class="anc-date">' + _ancEsc(a.date || '') + '</span>'
      + '<span class="anc-caret">' + (isOpen ? '▲' : '▼') + '</span>'
      + '</div>'
      + '<div class="anc-body" style="' + (isOpen ? '' : 'display:none') + '">' + (a.body || '') + '</div>'
      + '</div>';
  }).join('');
  refreshAnnounceBadge();
}
function toggleAnnounce(id) {
  const opening = window._ancOpen !== id;
  window._ancOpen = opening ? id : null;
  if (opening) _markAnnounceRead(id);   // 開いたら既読
  renderAnnounce();
}

// ----- 初期化：起動時にバッジを表示 -----
(function () {
  function _init() { refreshAnnounceBadge(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else { _init(); }
})();
