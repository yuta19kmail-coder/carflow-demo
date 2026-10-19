/* ================================================================================
   car-class-ui.js  -  🚗 車両登録・編集の「国産／輸入」「軽」と、表に無いメーカーの聞き方   CarFlow v3.18.0
   ================================================================================
   ◎画面（車両登録・編集の窓＝modal-car の基本情報）
     ・国産／輸入 … メーカー表で自動。押すと「手で直した」（自動と同じ方を押すと自動に戻る）
     ・軽       … ボディ（「軽」を含むか）で自動。押すと「手で直した」
     ・メーカーを打って、表に無い時だけ「「◯◯」はメーカー表に無いメーカーです［国産］［輸入］［あとで］」
       答えるとメーカー表に1行（db-makers.js）。次からはだれが登録しても聞かれない
       書き方違いなら、表のメーカーを選ぶ＝その書き方を表に足す
   ◎車に書く欄（car-modal.js が保存）
     origin  … 'dom'／'imp'＝手で直した時だけ。空＝メーカー表で読む
     keiHand … 'kei'／'normal'＝手で直した時だけ。空＝ボディ（あとで排気量・型式・車検証）で読む
   ================================================================================ */
(function (w) {
  'use strict';

  var S = { origin: '', keiHand: '', later: false, timer: null };
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function maker(){ var e = $('inp-maker'); return e ? e.value.trim() : ''; }
  function model(){ var e = $('inp-model'); return e ? e.value.trim() : ''; }
  function size(){ var e = $('inp-size'); return e ? e.value : ''; }
  function canAdd(){
    if (typeof w.hasPermission !== 'function') return true;
    return w.hasPermission('canCreateCar') || w.hasPermission('canEditCarInfo');
  }

  function chip(group, val, label, on, color){
    return '<button type="button" class="cc-chip' + (on ? ' on cc-' + color : '') + '" data-cc="' + group + '" data-v="' + val + '">' + label + '</button>';
  }
  function render(){
    var oEl = $('cc-origin'), kEl = $('cc-kei');
    if (!oEl || !kEl || !w.CFCarClass) return;
    var autoO = w.CFMaker.origin(maker(), model());
    var curO = S.origin || autoO;
    oEl.innerHTML = chip('origin', 'dom', '国産', curO === 'dom', 'dom') + chip('origin', 'imp', '輸入', curO === 'imp', 'imp');
    var oBy = S.origin ? 'hand' : (autoO ? 'table' : '');
    $('cc-origin-by').innerHTML = oBy === 'hand' ? '<span class="cc-hand">手で直した</span>'
      : oBy === 'table' ? 'メーカー表から' : (maker() ? '<span class="cc-unk">わからない</span>' : '');
    var autoK = w.CFCarClass.kei({ size: size() });
    var curK = S.keiHand ? (S.keiHand === 'kei') : autoK.v;
    kEl.innerHTML = chip('kei', 'normal', '普通車', curK === false, 'normal') + chip('kei', 'kei', '軽', curK === true, 'kei');
    $('cc-kei-by').innerHTML = S.keiHand ? '<span class="cc-hand">手で直した</span>' : (autoK.by ? w.CFCarClass.BY_LABEL[autoK.by] : '');
    renderAsk();
  }
  function renderAsk(){
    var el = $('cc-ask'); if (!el) return;
    var m = maker();
    if (!m || S.later || !w.CFMaker || w.CFMaker.known(m) || S.origin || !canAdd()) { el.style.display = 'none'; el.innerHTML = ''; el.dataset.sig = ''; return; }
    /* 🔴 同じメーカーで出ている間は作り直さない。メーカー欄から［国産］を押すと、押す途中で欄の change が来て描き直し、
       押したボタンが入れ替わって押せなかった（試験で見つけた） */
    if (el.dataset.sig === m && el.style.display !== 'none') return;
    el.dataset.sig = m;
    var opts = w.CFMaker.names().map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');
    el.innerHTML = '<div class="cc-ask-h">「' + esc(m) + '」はメーカー表に無いメーカーです。国産？輸入？</div>'
      + '<div class="cc-ask-row">'
      + '<button type="button" class="cc-btn cc-dom" data-ask="dom">国産</button>'
      + '<button type="button" class="cc-btn cc-imp" data-ask="imp">輸入</button>'
      + '<button type="button" class="cc-btn cc-later" data-ask="later">あとで</button>'
      + '</div>'
      + '<div class="cc-ask-sub">書き方違いなら：<select id="cc-alias"><option value="">表のメーカーから選ぶ</option>' + opts + '</select></div>'
      + '<div class="cc-ask-note">答えると表に足され、次からはだれが登録しても聞かれません。</div>';
    el.style.display = '';
  }

  async function answer(origin){
    var m = maker(); if (!m) return;
    var ok = false;
    try { ok = !!(w.dbMakers && await w.dbMakers.add(m, origin)); } catch (e) { console.error('[car-class-ui] add', e); ok = false; }
    if (ok) {
      if (typeof w.showToast === 'function') w.showToast('「' + m + '」を' + w.CFMaker.ORIGIN_LABEL[origin] + 'としてメーカー表に足しました');
      /* 購読が届く前でも、この画面では答えのとおりに見せる */
      var extra = (w.dbMakers ? w.dbMakers.list() : []).concat([{ name: m, origin: origin }]);
      w.CFMaker.setExtra(extra);
    } else {
      S.origin = origin;   /* 表に足せなくても、この車には入れる（手で直した扱い） */
      if (typeof w.showToast === 'function') w.showToast('メーカー表に足せませんでした（この車には区分を入れました）', 'CF-1030');
    }
    render();
  }
  async function alias(toName){
    var m = maker(); if (!m || !toName) return;
    var ok = false;
    try { ok = !!(w.dbMakers && await w.dbMakers.addAlias(m, toName)); } catch (e) { console.error('[car-class-ui] alias', e); ok = false; }
    if (ok) {
      if (typeof w.showToast === 'function') w.showToast('「' + m + '」を「' + toName + '」の書き方として足しました');
      w.CFMaker.setExtra((w.dbMakers ? w.dbMakers.list() : []).concat([{ aliasOf: toName, alias: m }]));
    } else if (typeof w.showToast === 'function') w.showToast('メーカー表に足せませんでした（この車には区分を入れました）', 'CF-1030');
    render();
  }

  function onClick(e){
    var b = e.target.closest ? e.target.closest('[data-cc],[data-ask]') : null;
    if (!b) return;
    if (b.dataset.ask) {
      if (b.dataset.ask === 'later') { S.later = true; render(); return; }
      answer(b.dataset.ask); return;
    }
    var v = b.dataset.v;
    if (b.dataset.cc === 'origin') {
      var autoO = w.CFMaker.origin(maker(), model());
      S.origin = (v === autoO) ? '' : v;
    } else {
      var autoK = w.CFCarClass.kei({ size: size() }).v;
      S.keiHand = ((v === 'kei') === autoK) ? '' : v;
    }
    render();
  }
  var wired = false;
  function wire(){
    if (wired) return;
    var box = $('modal-car'); if (!box) return;
    wired = true;
    box.addEventListener('click', onClick);
    box.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'cc-alias' && e.target.value) alias(e.target.value);
      if (e.target && (e.target.id === 'inp-size' || e.target.id === 'inp-maker')) render();
    });
    box.addEventListener('input', function (e) {
      if (!e.target || (e.target.id !== 'inp-maker' && e.target.id !== 'inp-model')) return;
      if (e.target.id === 'inp-maker') S.later = false;
      clearTimeout(S.timer); S.timer = setTimeout(render, 350);
    });
  }

  /* 窓を開いた時（car-modal.js openCarModal から） */
  function open(car){
    wire();
    S.origin = (car && (car.origin === 'dom' || car.origin === 'imp')) ? car.origin : '';
    S.keiHand = (car && (car.keiHand === 'kei' || car.keiHand === 'normal')) ? car.keiHand : '';
    S.later = false;
    render();
  }
  /* 保存の時（car-modal.js から）：車に書く値 */
  function read(){ return { origin: S.origin, keiHand: S.keiHand }; }

  /* ---------------- 設定 ▸ 車両・販売 ▸ メーカー表 ---------------- */
  function renderMakerTable(){
    var el = $('maker-table'); if (!el || !w.CFMaker) return;
    var canEdit = typeof w.hasPermission === 'function' ? w.hasPermission('canEditSettings') : false;
    var rows = w.CFMaker.list();
    var nDom = rows.filter(function (r) { return r.origin === 'dom'; }).length, nImp = rows.filter(function (r) { return r.origin === 'imp'; }).length;
    var added = rows.filter(function (r) { return r.extra; }).length;
    var body = rows.map(function (r) {
      var o = canEdit
        ? '<select data-mk="' + esc(r.name) + '" data-before="' + r.origin + '"><option value="dom"' + (r.origin === 'dom' ? ' selected' : '') + '>国産</option><option value="imp"' + (r.origin === 'imp' ? ' selected' : '') + '>輸入</option></select>'
        : esc(w.CFMaker.ORIGIN_LABEL[r.origin] || 'わからない');
      var who = r.extra ? (esc(r.byName || '') || '会社で足した') : '';
      return '<tr><td>' + esc(r.name) + (r.group !== r.name ? '<div class="mk-al">集計＝' + esc(r.group) + '</div>' : '') + '</td>'
        + '<td>' + o + '</td><td class="mk-al">' + esc(r.aliases.join('・')) + '</td><td class="mk-al">' + who + '</td></tr>';
    }).join('');
    el.innerHTML = '<div style="font-size:12px;color:var(--text2)">' + rows.length + '社（国産 ' + nDom + '・輸入 ' + nImp + '）／会社で足した・直した ' + added + '</div>'
      + '<div class="mk-wrap"><table class="mk-table"><tr><th>メーカー</th><th>区分</th><th>別の書き方（どれで打っても同じ）</th><th>足した人</th></tr>' + body + '</table></div>';
    if (!el._wired) {
      el._wired = true;
      el.addEventListener('change', async function (e) {
        var s = e.target; if (!s || !s.dataset || !s.dataset.mk) return;
        var ok = false;
        try { ok = !!(w.dbMakers && await w.dbMakers.setOrigin(s.dataset.mk, s.value, s.dataset.before)); } catch (err) { console.error('[car-class-ui] setOrigin', err); }
        if (ok) { if (typeof w.showToast === 'function') w.showToast('「' + s.dataset.mk + '」を' + w.CFMaker.ORIGIN_LABEL[s.value] + 'にしました'); }
        else { if (typeof w.showToast === 'function') w.showToast('メーカー表を直せませんでした', 'CF-9019'); renderMakerTable(); }
      });
    }
  }

  /* 表が届いたら（ほかの人が答えた時）窓が開いていれば描き直す・設定の表も */
  if (w.dbMakers) w.dbMakers.onChange(function () {
    var m = $('modal-car'); if (m && m.classList.contains('open')) render();
    if ($('maker-table') && $('maker-table').offsetParent) renderMakerTable();
  });

  w.renderMakerTable = renderMakerTable;
  w.ccUi = { open: open, read: read, render: render };
})(window);
