// ========================================
// meeting.js (v1.8.5 → v1.8.24)
// β版 ミーティングビュー — 既存ビューを4分割で同時表示
// v1.8.5: .meeting-zoom ラッパーで囲んで CSS の transform: scale を効かせる
// v1.8.24:
//   - クローン HTML から id 属性を剥がして、元ビューとのID重複によるクリック不具合を解消
//   - onclick 等の属性は残るので、各セル内のボタン・カードはミーティングビュー上でも普通にクリック可能
// ========================================

(function () {
  'use strict';

  window.openMeetingFromSidebar = function (sbItem) {
    document.querySelectorAll('.sb-item').forEach(s => s.classList.remove('active'));
    if (sbItem) sbItem.classList.add('active');
    const fakeTab = { classList: { add: function(){}, remove: function(){} } };
    if (typeof switchTab === 'function') {
      switchTab('meeting', fakeTab);
    }
  };

  // v1.8.24: クローン HTML 側の id 属性を data-id-orig にリネーム
  // 同じIDが2箇所に存在すると getElementById が元ビュー側を返してしまい、
  // ミーティング側でクリックしても元ビューが動く（or 動かない）状態になっていた。
  function _stripIds(html) {
    if (!html) return '';
    return String(html).replace(/(\s)id\s*=\s*"([^"]*)"/g, '$1data-id-orig="$2"');
  }

  function _wrap(html) {
    return '<div class="meeting-zoom">' + _stripIds(html || '') + '</div>';
  }

  function _mirrorHtml(srcId, dstId) {
    const src = document.getElementById(srcId);
    const dst = document.getElementById(dstId);
    if (!src || !dst) return;
    dst.innerHTML = _wrap(src.innerHTML);
  }
  function _mirrorBySelector(srcSel, dstId) {
    const src = document.querySelector(srcSel);
    const dst = document.getElementById(dstId);
    if (!src || !dst) return;
    dst.innerHTML = _wrap(src.innerHTML);
  }

  function renderMeeting() {
    // (1) 進捗セル
    try { if (typeof renderProgress === 'function') renderProgress(); }
    catch (e) { console.error('[meeting] renderProgress', e); }
    _mirrorHtml('pv-grid', 'meeting-progress-body');

    // (2) カレンダーセル
    try { if (typeof renderCalendar === 'function') renderCalendar(); }
    catch (e) { console.error('[meeting] renderCalendar', e); }
    _mirrorBySelector('#view-calendar .cal-wrap', 'meeting-calendar-body');

    // (3) 展示セル
    try { if (typeof renderExhibit === 'function') renderExhibit(); }
    catch (e) { console.error('[meeting] renderExhibit', e); }
    _mirrorHtml('ex-cols', 'meeting-exhibit-body');

    // (4) 警告ブロック（カレンダー上のカウントダウン）— v1.8.29
    // カレンダーは renderCalendar 内で renderCountdown を既に呼んでいるので
    // ここでは cal-countdown の中身をミラーリングするだけ
    const srcW = document.getElementById('cal-countdown');
    const dstW = document.getElementById('meeting-warn-body');
    if (srcW && dstW) {
      if (!srcW.children.length || srcW.textContent.includes('納車準備中の車両がありません')) {
        dstW.innerHTML = _wrap('<div style="color:var(--text3);font-style:italic;padding:14px;text-align:center">✓ 納車前のカウントダウン対象なし</div>');
      } else {
        dstW.innerHTML = _wrap(srcW.innerHTML);
      }
    }

    // (5) 要対応アクション
    try { if (typeof renderActions === 'function') renderActions(); }
    catch (e) { console.error('[meeting] renderActions', e); }
    const srcA = document.getElementById('action-chips');
    const dstA = document.getElementById('meeting-actions-body');
    if (srcA && dstA) {
      if (srcA.children.length === 0) {
        dstA.innerHTML = _wrap('<div style="color:var(--text3);font-style:italic;padding:14px;text-align:center">✓ 要対応のアクションはありません</div>');
      } else {
        dstA.innerHTML = _wrap(srcA.innerHTML);
      }
    }
  }
  window.renderMeeting = renderMeeting;

  console.log('[meeting] ready (v1.8.24: ID重複解消＋表示領域拡大)');
})();
