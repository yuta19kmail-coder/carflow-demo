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
  /* 🖼 v4.5.0 ［写真］タブの写真（角度つき・10枚まで）。見積の帳票は角度で拾う（quote.js carPh） */
  function photosOf(c) {
    var L = (window.CarPhotos ? CarPhotos.list(c) : (c && c.photo ? [{ url: c.photo, angle: '外装 前' }] : []));
    return L.filter(function (x) { return x && typeof x.url === 'string' && /^(https:|data:image\/)/.test(x.url); }).map(function (x) { return { url: x.url, angle: x.angle || '' }; });
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
      origin: c.origin || '', keiHand: c.keiHand || '', photo: photoOf(c), photos: photosOf(c),
      equip: equipList(c)
    };
  }
  /* 在庫（cars）の車。月次で締めた車（archivedCars）は出さない */
  function carsList() { return list().filter(function (c) { return c && c.id; }).map(facts); }
  /* 車の一覧が変わったかの目印（iframe が数秒おきに見る） */
  function sig() {
    return list().map(function (c) {
      return [c.id, c.num, c.maker, c.model, c.grade, c.year, c.km, c.color, c.col, c.contract, c.price, c.totalPrice, (c.photo || '').length, (Array.isArray(c.photos) ? c.photos.map(function (x) { return (x.angle || '') + (x.url || '').length; }).join(',') : ''), c.purchaseDate].join('|');
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
  /* 🗣 2026-10-23「見積のプランで装備品の印刷をすると見積もりが出てきちゃう」＝見積の［装備品一覧を印刷］はカードの装備品チェックの印刷（equipment-view.js）を開く */
  function printEquip(id) { try { if (find(id) && typeof printEquipmentSheet === 'function') { printEquipmentSheet(id); return true; } } catch (e) { console.warn('[CarQuote] printEquip', e); } return false; }

  /* サイドバーの［見積］［原価管理］。同じ iframe を開いて、中の画面だけ切り替える */
  var SRC = function (app) { return 'quote/index.html?v=' + encodeURIComponent(ver()) + '&app=' + encodeURIComponent(app); };
  var dirty = {};   /* 見積の設定が変わった＝その iframe は次に見せる時に読み直す（iframe ごとに設定を読んでいるため） */
  function open(app, el) {
    if (typeof showPanel === 'function') showPanel('quote', el);
    var f = document.getElementById('quote-frame'); if (!f) return;
    if (!f.getAttribute('src') || dirty['quote-frame']) { dirty['quote-frame'] = false; f.setAttribute('src', SRC(app || 'quote') + '&r=' + Date.now()); return; }
    try { if (f.contentWindow && f.contentWindow.QApp) f.contentWindow.QApp.go(app || 'quote'); } catch (e) {}
  }
  /* 🔗 v4.5.14 🗣 2026-10-24「見積は一覧→詳細→ABC→顧客って全部個別のURLにできる？戻るで戻りたい」
     ＝見積の画面ごとに住所：#quote（一覧）／#quote/{車ID}/base・plan・cust/{お客様ID}・order／#cost（原価管理）・#cost/{車ID}。
     iframe の画面が変わるたびに route() で足跡を残し、戻る・進む（popstate）で iframe をその画面へ（QApp.route）。
     住所は「#/」で始めない＝共通部品 coreflow-nav.js（#/kanban などのタブ）とぶつからない（あちらは #/ 以外を見ない） */
  var applying = false, pendingRoute = null;
  function isQ(h) { return /^#(quote|cost)(\/|$)/.test(h || ''); }
  function panelOpen() { var p = document.getElementById('panel-quote'); return !!(p && p.classList.contains('open')); }
  function route(r) {
    if (!r || pendingRoute || !panelOpen()) return;   // 住所の画面を開いている途中・ほかの画面を見ている間（裏で描き直した時）は残さない
    var h = '#' + r; if (location.hash === h) return;
    try { history[applying ? 'replaceState' : 'pushState']({ cfq: r }, '', location.pathname + (location.search || '') + h); } catch (e) {}
  }
  function goRoute(r) {
    var app = /^cost/.test(r) ? 'cost' : 'quote', el = document.getElementById(app === 'cost' ? 'si-qcost' : 'si-quote'), f = document.getElementById('quote-frame'); if (!f) return;
    var ready = function () { try { return !!(f.contentWindow && f.contentWindow.QApp && f.contentWindow.QApp.ready() && f.contentWindow.QApp.route); } catch (e) { return false; } };
    var apply = function () { pendingRoute = null; applying = true; try { f.contentWindow.QApp.route(r); } catch (e) {} applying = false; };
    if (!panelOpen() && typeof showPanel === 'function') showPanel('quote', el);
    if (ready() && f.getAttribute('src') && !dirty['quote-frame']) { apply(); return; }
    pendingRoute = r; open(app, el);
    var n = 0, t = setInterval(function () { if (ready()) { clearInterval(t); apply(); } else if (++n > 80) { clearInterval(t); pendingRoute = null; } }, 250);
  }
  window.addEventListener('popstate', function () {
    if (isQ(location.hash)) { goRoute(location.hash.slice(1)); return; }
    /* 見積に入る前（住所なし＝ダッシュボード）まで戻った時。#/kanban などのタブは coreflow-nav.js が開く */
    if (panelOpen() && !/^#\//.test(location.hash || '') && typeof showPanel === 'function') showPanel('dashboard', document.getElementById('si-dashboard'));
  });
  /* coreflow-nav.js は「最初のタブの切り替え」だけ足跡を置き換える（push しない）＝見積の画面からタブへ移ると、見積の足跡が消えて戻れなかった。
     最初の1回だけ、見積の足跡を1つ複製してから渡す（置き換えられるのは複製の方）。index.html の CoreflowNav.wire より後で包む */
  window.addEventListener('load', function () {
    var inner = window.switchTab; if (typeof inner !== 'function') return; var first = !/^#\//.test(location.hash || '');   // #/… で開いた時は deeplink-car.js が先に1回切り替える
    window.switchTab = function () {
      if (first && isQ(location.hash)) { try { history.pushState(history.state, '', location.href); } catch (e) {} }
      first = false; return inner.apply(this, arguments);
    };
  });
  /* 再読み込み・送ってもらった住所：ログインと車の読み込みが済んでから開く */
  if (isQ(location.hash)) {
    var r0 = location.hash.slice(1), n0 = 0;
    var t0 = setInterval(function () {
      var ok = document.body && document.body.classList.contains('app-active') && window.fb && fb.currentStaff && list().length;
      if (ok) { clearInterval(t0); goRoute(r0); } else if (++n0 > 400) clearInterval(t0);
    }, 300);
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
  /* 📄 v4.5.0 カード詳細の［価格履歴］＝見積の値付けの履歴・相場・反響（quote/ を app＝hist で）。
     🗣 2026-10-23「価格履歴の PDF のアップロードは見積もりと統合されたから要らない。見積もりの値段推移みたいな相場と合わせつつ、値下げの履歴をみれる奴をそのまま表示」 */
  function histPanel(c) {
    return '<iframe class="cd3-soba-f cd3-hist-f" data-car="' + String(c.id).replace(/[^\w-]/g, '') + '" title="この車の価格履歴" src="' + SRC('hist') + '&car=' + encodeURIComponent(c.id) + '"></iframe>';
  }
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
    log: log, toast: toast, openCar: openCar, open: open, openFor: openFor, route: route, ver: ver, printEquip: printEquip, mountSet: mountSet, setChanged: setChanged, histPanel: histPanel,
    demo: function () { return window.__DEMO_MODE === true; }
  };
})();
