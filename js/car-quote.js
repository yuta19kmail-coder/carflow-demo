/* ========================================
   car-quote.js ─ セールス ▸ 見積・原価管理（親の側のつなぎ）  CarFlow v4.0.0（2026-10-23）
   ----------------------------------------
   🗣 2026-10-23 ゆうた「4までは一気に実装」「売約ボタンをおしたら見積タブ上で売約と出るだけ。大タスクに絡むような挙動は今回なし」
       「見積を実際の入庫車両で作成できる・相場が本物のデータで連動している・原価が入力できる」
       「見積は今の金色のやつを暫定的に決定として印刷できるように（この後変更予定）」「これを持って CarFlow は 4.0 にバージョンアップ」
   ◎ 中身は quote/index.html を iframe で開く（相場ビューと同じ作り）。画面と計算は見積モック v4.83.0 を写した quote/quote.js
   ◎ ここは iframe に「本物の CarFlow の物」を渡す窓口だけ（window.CarQuote）
       ・車の一覧（cars）… 車の欄は読むだけ。見積から車の欄（売約・価格・状態・タスク）には書かない
       ・ログイン・会社・権限・名簿・会社情報・記録（addLog＝車のフロー＋操作ログ）
   ◎ 見積のデータは Firestore companies/{会社}/carQuotes/{車のID}（車と別の置き場＝車の「まるごと保存」と消し合わない）。
     読み書きは iframe 側（quote/quote-data.js）が親の fb.db で行う
   ⚠ 名前：「見積」は前から［価格履歴］（CarEstimates・見積もりPDF）が使っている。こちらは CarQuote／carQuotes／panel-quote
   ======================================== */
(function () {
  'use strict';

  function list() { return (typeof cars !== 'undefined' && Array.isArray(cars)) ? cars : []; }
  function find(id) {
    var c = list().find(function (x) { return x && x.id === id; });
    if (!c && typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) c = archivedCars.find(function (x) { return x && x.id === id; });
    return c || null;
  }
  function incl(amount, field) {
    var n = Number(amount) || 0; if (!n) return 0;
    var lab = (typeof getTaxLabel === 'function') ? getTaxLabel(field) : '税込';
    return (lab === '税抜' && typeof convertTax === 'function') ? Math.round(convertTax(n, 'excl', 'incl')) : n;
  }
  function photoOf(c) {
    var p = c && c.photo;
    return (typeof p === 'string' && /^(https:|data:image\/)/.test(p)) ? p : '';
  }
  /* 装備品チェックで「あり」の装備の名前（印刷シートと同じ判定。セレクトは「名前（値）」・「なし」は出さない・コメントは出さない）。
     getEquipmentState は空の箱を作るので使わず、読むだけで取る */
  function equipList(c) {
    try {
      var bucket = (c.col === 'delivery' || c.col === 'done') ? 'deliveryTasks' : 'regenTasks';
      var st = (c[bucket] && c[bucket].t_equip) || {};
      var secs = typeof _eqActiveSections === 'function' ? _eqActiveSections(c) : null;
      if (!Array.isArray(secs)) return [];
      var out = [];
      secs.forEach(function (sec) {
        (sec.items || []).forEach(function (it) {
          if (it._disabled) return;
          var v = st[it.id], t = it.inputType || 'tri';
          if (v == null || v === '') return;
          var pos = t === 'check' ? v === true : t === 'tri' ? v === 'on' : t === 'status' ? v === 'ok' : t === 'select' ? !/^なし/.test(String(v)) : false;
          var nm = it.name || it.label || it.id;   /* テンプレートの項目は name（equipment-def.js は label） */
          if (pos) out.push(t === 'select' ? nm + '（' + v + '）' : nm);
        });
      });
      return out;
    } catch (e) { return []; }
  }
  /* iframe に渡す車の中身（読むだけ）。金額は税込の円にそろえる */
  function facts(c) {
    var y = (typeof parseYearInput === 'function' ? parseYearInput(c.year) : null) || c.year || '';
    return {
      id: c.id, num: c.num || '', maker: c.maker || '', model: c.model || '', grade: c.grade || '',
      year: y, yearRaw: c.year || '', color: c.color || '', km: Number(c.km) || 0, size: c.size || '',
      purchaseDate: c.purchaseDate || '', col: c.col || '', isOrder: !!c.isOrder,
      sold: c.contract === 1 || c.contract === true || c.contract === '1', contractDate: c.contractDate || '', deliveryDate: c.deliveryDate || '',
      bodyIncl: incl(c.price, 'body'), totalIncl: incl(c.totalPrice, 'total'),
      origin: c.origin || '', keiHand: c.keiHand || '', photo: photoOf(c),
      equip: equipList(c)
    };
  }
  /* 在庫（cars）の車。月次で締めた車（archivedCars）は出さない */
  function carsList() { return list().filter(function (c) { return c && c.id; }).map(facts); }
  /* 車の一覧が変わったかの目印（iframe が数秒おきに見る） */
  function sig() {
    return list().map(function (c) {
      return [c.id, c.num, c.maker, c.model, c.grade, c.year, c.km, c.color, c.col, c.contract, c.price, c.totalPrice, (c.photo || '').length, c.purchaseDate].join('|');
    }).join('\n');
  }
  function me() {
    var u = window.fb && window.fb.currentUser, s = (window.fb && window.fb.currentStaff) || {};
    return { uid: (u && u.uid) || '', name: (typeof currentUser === 'string' && currentUser) || s.displayName || '', role: s.role || '' };
  }
  function can(p) { try { return typeof hasPermission === 'function' ? !!hasPermission(p) : false; } catch (e) { return false; } }
  /* 書ける人＝車の情報を直せる人（管理者・マネージャー・スタッフ）。作業者・閲覧は見るだけ（原価も出さない） */
  function canEdit() { return can('canEditCarInfo'); }
  function staffNames() {
    try {
      if (window.CFMembers && CFMembers.ready()) return CFMembers.usable().map(function (r) { return r.displayName || r.name || ''; }).filter(Boolean);
    } catch (e) {}
    var m = me(); return m.name ? [m.name] : [];
  }
  function company() {
    var ci = (typeof appSettings !== 'undefined' && appSettings && appSettings.companyInfo) || {};
    return { name: ci.name || '', address: ci.address || '', phone: ci.phone || '', email: ci.email || '', url: ci.url || '' };
  }
  /* 記録：車のフロー＋操作ログ（addLog）。どの車でもない記録は操作ログだけ */
  function log(carId, action) {
    try {
      if (carId && find(carId) && typeof addLog === 'function') { addLog(carId, action); return; }
      if (typeof addAuditLog === 'function') addAuditLog(action, carId ? ((find(carId) || {}).num || '') : '');
    } catch (e) { console.warn('[CarQuote] log', e); }
  }
  function toast(msg, code) { try { if (typeof showToast === 'function') showToast(msg, code); } catch (e) {} }
  function openCar(id) { try { if (typeof openDetail === 'function') openDetail(id); } catch (e) {} }
  function ver() { var m = document.querySelector('meta[name="app-version"]'); return m ? m.getAttribute('content') : ''; }

  /* サイドバーの［見積］［原価管理］。同じ iframe を開いて、中の画面だけ切り替える */
  var SRC = function (app) { return 'quote/index.html?v=' + encodeURIComponent(ver()) + '&app=' + encodeURIComponent(app); };
  var dirty = {};   /* 見積の設定が変わった＝その iframe は次に見せる時に読み直す（iframe ごとに設定を読んでいるため） */
  function open(app, el) {
    if (typeof showPanel === 'function') showPanel('quote', el);
    var f = document.getElementById('quote-frame'); if (!f) return;
    if (!f.getAttribute('src') || dirty['quote-frame']) { dirty['quote-frame'] = false; f.setAttribute('src', SRC(app || 'quote') + '&r=' + Date.now()); return; }
    try { if (f.contentWindow && f.contentWindow.QApp) f.contentWindow.QApp.go(app || 'quote'); } catch (e) {}
  }
  /* 車両詳細などから「この車の見積を開く」 */
  function openFor(carId) {
    var el = document.getElementById('si-quote');
    if (typeof closeModal === 'function') { try { closeModal('modal-detail'); } catch (e) {} }
    open('quote', el);
    var f = document.getElementById('quote-frame');
    var go = function () { try { if (f.contentWindow && f.contentWindow.QApp && f.contentWindow.QApp.ready()) { f.contentWindow.QApp.openCar(carId); return true; } } catch (e) {} return false; };
    if (!go()) { var n = 0, t = setInterval(function () { if (go() || ++n > 60) clearInterval(t); }, 250); }
  }

  /* 🗣 2026-10-23「見積と原価にそれぞれ右上に設定があるけど、モックじゃないから素直に CarFlow の設定に見積・原価を足して正式な設定に」
     ＝設定 ▸ 見積（app＝set）／設定 ▸ 原価（app＝cgset）。中身は見積と同じ quote/index.html を、設定の欄の中の iframe で開く（js/settings.js の selectSettingsSection から呼ぶ） */
  var SET_FRAMES = { 'quote-set': ['quote-set-frame', 'set'], 'cost-set': ['cost-set-frame', 'cgset'] };
  function mountSet(sec) {
    var m = SET_FRAMES[sec]; if (!m) return; var f = document.getElementById(m[0]); if (!f) return;
    if (!f.getAttribute('src') || dirty[m[0]]) { dirty[m[0]] = false; f.setAttribute('src', SRC(m[1]) + '&r=' + Date.now()); }
  }
  function setChanged(win) {
    ['quote-frame', 'quote-set-frame', 'cost-set-frame'].forEach(function (id) { var f = document.getElementById(id); if (f && f.getAttribute('src') && f.contentWindow !== win) dirty[id] = true; });
  }

  window.CarQuote = {
    cars: carsList, car: function (id) { var c = find(id); return c ? facts(c) : null; }, sig: sig,
    me: me, can: can, canEdit: canEdit, staff: staffNames, company: company,
    log: log, toast: toast, openCar: openCar, open: open, openFor: openFor, ver: ver, mountSet: mountSet, setChanged: setChanged,
    demo: function () { return window.__DEMO_MODE === true; }
  };
})();
