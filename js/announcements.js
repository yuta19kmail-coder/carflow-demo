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

// ----- お知らせデータ（version は対応バージョン、date は YYYY-MM-DD） -----
//   seed:true … 公開時点で「既読扱い」（過去機能のまとめ）。ポップアップは出さず受信箱では確認済み表示。
//   ※デモでは直近3件（4テーマ/メモ/ログ）は seed を付けず、ポップアップのデモンストレーション用に残す。
const ANNOUNCEMENTS = [
  {
    id: 'a-hist-realtime',
    seed: true,
    version: '1.8',
    date: '2026-05-16',
    title: '🔄 リアルタイム同期',
    body: `<p>複数の端末・スタッフで同時に使っても、カードの変更が<b>リアルタイムで全員の画面に反映</b>されるようになりました。</p>`,
  },
  {
    id: 'a-hist-tax',
    seed: true,
    version: '1.8',
    date: '2026-05-16',
    title: '💴 税モード（税抜／税込の切り替え）',
    body: `<p>金額を<b>税抜／税込</b>で切り替えて表示できるようになりました（設定 → 税扱い）。本体価格と総額の併記にも対応しています。</p>`,
  },
  {
    id: 'a-hist-line',
    seed: true,
    version: '1.8',
    date: '2026-05-16',
    title: '🔔 LINE通知＆2軸期日（目標ライン／限界ライン）',
    body: `<p>タスクに<b>「目標ライン」「限界ライン」</b>の2段階の期日を設定できるようになりました。期日が近づくと<b>社内LINEグループへ自動通知</b>が飛びます（設定 → 通知）。</p>`,
  },
  {
    id: 'a-hist-dashboard',
    seed: true,
    version: '1.8',
    date: '2026-05-16',
    title: '📊 ダッシュボード刷新（サマリー6カード＋着地予測）',
    body: `<p>ダッシュボード上部に在庫・売約・納車の<b>サマリー6カード</b>を追加。さらに今月の販売<b>着地予測</b>（確定／見込み／実績予測）を表示するようにしました。</p>`,
  },
  {
    id: 'a-hist-backoffice',
    seed: true,
    version: '2.1',
    date: '2026-05-18',
    title: '🗂 バックオフィス（売約後の事務処理）',
    body: `<p>売約後の事務処理（原価処理・書類整理など）を専用の<b>「🗂 バックオフィス」</b>ビューで管理できるようになりました（左メニュー）。当月／先月／先々月で整理して見られます。</p>`,
  },
  {
    id: 'a-hist-taskmemo',
    seed: true,
    version: '2.2',
    date: '2026-05-18',
    title: '📝 タスク個別メモ＋自動付箋',
    body: `<p>各大タスクに<b>個別メモ</b>（自由文／日付／時刻）を付けられるようになりました（設定 → タスク・進捗 → 📝メモ設定）。日付メモは全体タスクの<b>緑付箋に自動表示</b>されます。</p>`,
  },
  {
    id: 'a-hist-taskpattern',
    seed: true,
    version: '2.5',
    date: '2026-05-19',
    title: '📦 タスクパターン＆小タスク制',
    body: `<p>大タスクの中身（小タスクのチェックリスト）を<b>「タスクパターン」</b>として管理・編集できるようになりました（設定 → 📦タスクパターン）。各タスクの<b>小タスク制 ON/OFF</b> も自由に切り替えられます。</p>`,
  },
  {
    id: 'a-20260521-theme',
    version: '2.6',
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
    version: '2.7',
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
    version: '2.7',
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
// v2.5.27: 既読の意味が「確認ボタン」方式に変わったため、旧キーの既読は引き継がず別キーに（リセット）
const ANNOUNCE_READ_KEY = 'carflow_announce_read_v2';

function _getReadAnnounce() {
  try {
    const r = JSON.parse(localStorage.getItem(ANNOUNCE_READ_KEY) || '[]');
    return Array.isArray(r) ? r : [];
  } catch (e) { return []; }
}
function _setReadAnnounce(arr) {
  try { localStorage.setItem(ANNOUNCE_READ_KEY, JSON.stringify(arr)); } catch (e) {}
}
// seed:true（公開時点で既読扱い）か、保存済み既読に含まれていれば「既読」とみなす
function _isAncRead(id, readArr) {
  if (readArr && readArr.indexOf(id) !== -1) return true;
  const a = ANNOUNCEMENTS.find(x => x.id === id);
  return !!(a && a.seed);
}
function announceUnreadCount() {
  const read = _getReadAnnounce();
  return ANNOUNCEMENTS.filter(a => !_isAncRead(a.id, read)).length;
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
// デモ用：既読をすべてリセット（「最初からやり直す」で呼ぶ → 新着ポップアップが再び出る）
function resetAnnounceRead() {
  try { localStorage.removeItem(ANNOUNCE_READ_KEY); } catch (e) {}
  window._ancPopupShown = false;
  refreshAnnounceBadge();
}

// ----- サイドバーの未読バッジ -----
function refreshAnnounceBadge() {
  const el = document.getElementById('announce-badge');
  if (!el) return;
  const n = announceUnreadCount();
  // .sb-badge は CSS で display:none 固定なので、表示時は明示的に inline-block にする（'' だと none に戻る）
  if (n > 0) { el.textContent = String(n); el.style.display = 'inline-block'; }
  else { el.textContent = ''; el.style.display = 'none'; }
}

// ----- 受信箱の描画 -----
function _ancEsc(s) {
  if (typeof escapeHtml === 'function') return escapeHtml(s);
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// バージョン比較（"2.7" > "2.6"）。昇順差分を返す。
function _verNum(v) {
  const p = String(v == null ? '0' : v).split('.').map(n => parseInt(n, 10) || 0);
  return (p[0] || 0) * 10000 + (p[1] || 0) * 100 + (p[2] || 0);
}
function _verCmp(a, b) { return _verNum(a) - _verNum(b); }
function renderAnnounce() {
  const host = document.getElementById('announce-list');
  if (!host) return;
  const read = _getReadAnnounce();
  // 受信箱：バージョンが新しい順（同点は日付が新しい順）
  const items = ANNOUNCEMENTS.slice().sort((a, b) => _verCmp(b.version, a.version) || String(b.date || '').localeCompare(String(a.date || '')));
  if (!items.length) {
    host.innerHTML = '<div class="anc-empty">お知らせはありません</div>';
    refreshAnnounceBadge();
    return;
  }
  host.innerHTML = items.map(a => {
    const isRead = _isAncRead(a.id, read);
    const isOpen = window._ancOpen === a.id;
    const verTag = a.version ? '<span class="anc-ver">v' + _ancEsc(a.version) + '</span>' : '';
    const footer = isRead
      ? '<div class="anc-footer"><span class="anc-confirmed">✓ 確認済み</span></div>'
      : '<div class="anc-footer"><button type="button" class="anc-confirm-btn" onclick="confirmAnnounce(\'' + a.id + '\')">✓ 確認する（OK）</button></div>';
    return '<div class="anc-item ' + (isRead ? 'is-read' : 'is-unread') + (isOpen ? ' is-open' : '') + '">'
      + '<div class="anc-head" onclick="toggleAnnounce(\'' + a.id + '\')">'
      + '<span class="anc-dot"></span>'
      + verTag
      + '<span class="anc-title">' + _ancEsc(a.title) + '</span>'
      + '<span class="anc-date">' + _ancEsc(a.date || '') + '</span>'
      + '<span class="anc-caret">' + (isOpen ? '▲' : '▼') + '</span>'
      + '</div>'
      + '<div class="anc-body" style="' + (isOpen ? '' : 'display:none') + '">' + (a.body || '') + footer + '</div>'
      + '</div>';
  }).join('');
  refreshAnnounceBadge();
}
function toggleAnnounce(id) {
  // 開閉のみ。既読化は「確認する（OK）」ボタンで明示的に行う。
  window._ancOpen = (window._ancOpen === id) ? null : id;
  renderAnnounce();
}
function confirmAnnounce(id) {
  _markAnnounceRead(id);
  renderAnnounce();
}

// ----- ログイン後の「新着お知らせ」ポップアップ（よくあるソフトの What's New 挙動） -----
function _ancPopupEl() {
  let el = document.getElementById('announce-popup-overlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'announce-popup-overlay';
    document.body.appendChild(el);
  }
  return el;
}
// 未読があればポップアップを出す（ログイン直後・1回）。複数あれば「古い順」に1件ずつ表示。
function maybeShowAnnouncePopup() {
  if (window._ancPopupShown) return;
  const unread = _unreadAncSorted();
  if (!unread.length) return;
  window._ancPopupShown = true;
  window._ancQueue = unread;
  window._ancQueueIdx = 0;
  _showAncQueueItem();
}
// 未読を「古い順（バージョン昇順→日付昇順）」で返す
function _unreadAncSorted() {
  const read = _getReadAnnounce();
  return ANNOUNCEMENTS.filter(a => !_isAncRead(a.id, read))
    .sort((a, b) => _verCmp(a.version, b.version) || String(a.date || '').localeCompare(String(b.date || '')));
}
// 後方互換：直接呼ばれてもキュー表示にする
function showAnnouncePopup() {
  const unread = _unreadAncSorted();
  if (!unread.length) return;
  window._ancQueue = unread;
  window._ancQueueIdx = 0;
  _showAncQueueItem();
}
// キューの現在位置の1件を表示
function _showAncQueueItem() {
  const q = window._ancQueue || [];
  const i = window._ancQueueIdx || 0;
  if (i >= q.length) { closeAnnouncePopup(); return; }
  const a = q[i];
  const verTag = a.version ? '<span class="anc-ver">v' + _ancEsc(a.version) + '</span>' : '';
  const progress = (q.length > 1) ? '<span class="anc-popup-progress">' + (i + 1) + ' / ' + q.length + '</span>' : '';
  const okLabel = (i + 1 < q.length) ? '確認して次へ ▶' : '確認';
  const el = _ancPopupEl();
  el.innerHTML = '<div class="modal anc-popup">'
    + '<div class="anc-popup-head"><span class="anc-popup-icon">📢</span>'
    + '<span class="anc-popup-title">新着のお知らせ</span>' + progress + '</div>'
    + '<div class="anc-popup-body">'
    + '<div class="anc-popup-item-head">' + verTag
    + '<span class="anc-popup-item-title">' + _ancEsc(a.title) + '</span>'
    + '<span class="anc-popup-item-date">' + _ancEsc(a.date || '') + '</span></div>'
    + '<div class="anc-popup-item-body">' + (a.body || '') + '</div>'
    + '</div>'
    + '<div class="anc-popup-foot">'
    + '<button type="button" class="anc-popup-later" onclick="closeAnnouncePopup()">後で</button>'
    + '<button type="button" class="anc-popup-ok" onclick="confirmAnnouncePopup()">' + okLabel + '</button>'
    + '</div></div>';
  el.classList.add('open');
}
function closeAnnouncePopup() {
  const el = document.getElementById('announce-popup-overlay');
  if (el) el.classList.remove('open');
}
// 「確認」：今表示中の1件を既読にし、次の1件（より新しい方）へ。なければ閉じる。
function confirmAnnouncePopup() {
  const q = window._ancQueue || [];
  const i = window._ancQueueIdx || 0;
  if (q[i]) _markAnnounceRead(q[i].id);
  window._ancQueueIdx = i + 1;
  if (window._ancQueueIdx < q.length) {
    _showAncQueueItem();
  } else {
    closeAnnouncePopup();
    if (typeof renderAnnounce === 'function') renderAnnounce();
  }
}

// ----- 初期化：起動時にバッジを表示 -----
(function () {
  function _init() { refreshAnnounceBadge(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else { _init(); }
})();
