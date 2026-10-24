/* ========================================
   quote/quote-data.js ─ 見積・原価管理のデータ（読み込み・保存・相場・型式DB）  CarFlow v4.0.0（2026-10-23）
   ----------------------------------------
   ◎ この画面は CarFlow の中の iframe（同じサイト）。ログイン・Firestore・車の一覧は親（CarFlow）の物を借りる（親の window.CarQuote・fb）
   ◎ 置き場
       見積  ＝ Firestore companies/{会社}/carQuotes/{車のID}（1台1枚。基本価格・プラン見積・個別見積・売約の札・原価・車の追加の情報）
                保存のたびに前の中身を carQuotes/{車のID}/hist に1枚残す（足すだけ・消せない＝記録から人が戻せる）
       設定  ＝ Firestore companies/{会社}/settings/quote（プランの中身・諸費用・税・会社の帳票の欄。直せるのは設定を直せる人）
       下書き＝ このブラウザ（localStorage cf_quote_v4）＝開いている画面・作りかけ（保存していない）の見積だけ
       相場  ＝ 相場ビューと同じ Storage soba/v1/（meta・index・cards・soba-calc.js・katashiki.json）。当て方は ../soba/stock.js
   ◎ 車の欄（メーカー・車種・グレード・年式・走行・色・写真・売約）は CarFlow の物を読むだけ。見積からは書かない
     型式・初度登録・排気量・重量などは CarFlow に欄が無いので、見積の側（carQuotes の veh）に持つ
   🔴 デモ版（親に __DEMO_MODE）は本物の相場を読まない（soba/demo/ の見本だけ）
   ======================================== */
(function () {
  'use strict';
  const P = (function () { try { return window.parent; } catch (e) { return null; } })();
  const CQ = P && P.CarQuote, FB = P && P.fb;
  const DEMO = !!(P && P.__DEMO_MODE === true);
  const BUCKET = 'carflow-9d500.firebasestorage.app', PREFIX = 'soba/v1/';
  const $ = id => document.getElementById(id);
  /* 今日（この画面を開いた日・PC の時計）。見積日・有効期限・在庫日数の元 */
  window.Q_TODAY = (d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))(new Date());
  function boot(msg) { const b = $('q-boot'); if (b) b.innerHTML = msg; }
  if (!CQ || !FB || !FB.db) { boot('CarFlow の中から開いてください（ログイン情報がありません）。'); return; }

  /* 入れ子の相場ビュー（../soba/index.html?car=）が「親」として見る物を、ここにも置く */
  window.firebase = P.firebase; window.CarSoba = P.CarSoba; window.__DEMO_MODE = P.__DEMO_MODE;

  /* ---------- テーマ：CarFlow に合わせる（変わったらついて行く） ---------- */
  (function () {
    const R = document.documentElement;
    function sync() {
      try {
        const pr = P.document.documentElement;
        R.setAttribute('data-theme', pr.getAttribute('data-theme') || 'dark');
        R.setAttribute('style', pr.getAttribute('style') || '');
        R.className = pr.className;
      } catch (e) {}
    }
    sync();
    try { new P.MutationObserver(sync).observe(P.document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] }); } catch (e) {}
  })();

  const CID = FB.currentCompanyId;
  const coll = name => FB.db.collection('companies').doc(CID).collection(name);
  const TS = () => P.firebase.firestore.FieldValue.serverTimestamp();
  const pobj = o => P.JSON.parse(JSON.stringify(o));   /* 親の窓の物にする（Firestore に渡す物は全部これを通す） */

  /* 見積の中で保存する欄（それ以外＝CarFlow の車の欄・画面だけの一時の値は保存しない） */
  const QKEYS = ['base', 'std', 'custs', 'order', 'cogs', 'board', 'reached', 'eqx', 'eqDone'];   /* cf（車両情報の最初の値の控え）は画面を開くと作られるので保存しない */
  const VKEYS = ['fmodel', 'firstReg', 'cc', 'weight', 'fuel', 'hybrid', 'gradeSub', 'colorCat', 'vin', 'keiQ', 'sizeQ'];
  function partOf(car, live) {
    const o = {};
    QKEYS.forEach(k => { if (car[k] !== undefined) o[k] = car[k]; });
    /* 🔴 v4.0.1 画面を開いただけで作られる物は保存しない＝原価表の空の形（原価管理の一覧を開くと全部の車に作られる） */
    if (o.cogs && window.QApi && QApi.cogsBlank && JSON.stringify(o.cogs) === QApi.cogsBlank()) delete o.cogs;
    const v = {}; VKEYS.forEach(k => {
      const x = car[k];
      if (x === undefined || x === '' || x === null) return;
      if ((k === 'cc' || k === 'weight') && !+x) return;              /* 0＝まだ入れていない */
      if (k === 'firstReg' && (live || car)._firstRegGuess) return;              /* CarFlow の年式から仮に入れた物は保存しない */
      if ((k === 'fuel' && x === 'gas') || (k === 'hybrid' && !x)) return;   /* 既定の値 */
      v[k] = x;
    });
    o.veh = v;
    return JSON.parse(JSON.stringify(o, (k, x) => k && k[0] === '_' ? undefined : x));
  }
  const jsonOf = (car, live) => JSON.stringify(partOf(car, live));   /* live＝画面の車（作りかけの車は保存済みの中身 c0 に「_」の印が無いため） */

  /* ---------- 車：CarFlow の車 ＋ 見積の1枚 → 画面（quote.js）の車 ---------- */
  function yearOfFacts(f) { const y = parseInt(String(f.year || '').slice(0, 4), 10); return y > 1950 && y < 2100 ? y : null; }
  function isKei(f, v) {
    if (v && v.keiQ != null) return !!v.keiQ;
    try { if (window.CFCarClass) { const r = CFCarClass.kei({ keiHand: f.keiHand, cc: v && v.cc, size: f.size }); if (r.v != null) return r.v; } } catch (e) {}
    return false;
  }
  function merge(f, q) {
    q = q || {};
    const v = q.veh || {}, y = yearOfFacts(f);
    const car = {
      id: f.id, num: f.num || '（番号なし）', maker: f.maker, model: f.model, grade: f.grade, color: f.color, km: f.km,
      buyDate: (f.purchaseDate || '').slice(0, 10) || window.Q_TODAY, photo: f.photo, photos: f.photos || [], cfSize: f.size,
      status: f.col === 'purchase' ? 'purchase' : f.col === 'regen' ? 'regen' : 'exhibit',
      _f: f, _sold: f.sold, _col: f.col,
      fmodel: v.fmodel || '', firstReg: v.firstReg || (y ? y + '-01' : ''), _firstRegGuess: !v.firstReg,
      cc: +v.cc || 0, weight: +v.weight || 0, fuel: v.fuel || 'gas', hybrid: !!v.hybrid, gradeSub: v.gradeSub || '',
      colorCat: v.colorCat, vin: v.vin || '', keiQ: v.keiQ, sizeQ: v.sizeQ,
      cfPrice: f.bodyIncl || 0,   /* CarFlow の本体価格（税込）。基本価格を作る時の最初の値 */
      std: { ov: {}, extra: [], disc: { A: 0, B: 0, C: 0, D: 0 }, rec: null, tier: {}, showD: false }, custs: [], order: null
    };
    car.kei = isKei(f, v);
    QKEYS.forEach(k => { if (q[k] !== undefined) car[k] = JSON.parse(JSON.stringify(q[k])); });
    return car;
  }

  /* ---------- 読み込み ---------- */
  const D = { quotes: {}, written: {}, set: null, setJSON: '', setWritten: '', revs: {} };
  async function loadAll() {
    /* 読めない時（ルールがまだ・ネットが切れた）は空で開いて知らせる＝保存はできないが画面は見られる */
    const [qs, st] = await Promise.all([
      coll('carQuotes').get().catch(e => { console.error('[quote] carQuotes', e); D.readErr = e; return null; }),
      coll('settings').doc('quote').get().catch(e => { console.error('[quote] settings/quote', e); D.readErr = D.readErr || e; return null; })]);
    if (qs) qs.forEach(d => { const x = d.data() || {}; D.quotes[d.id] = x; D.revs[d.id] = x.rev || 0; });
    /* v4.5.17 設定は JSON の文字で持つ（json）。前の形（set）も読む */
    const sd = st && st.exists ? (st.data() || {}) : null;
    D.set = sd ? (sd.json ? (() => { try { return JSON.parse(sd.json); } catch (e) { console.error('[quote] settings json', e); return null; } })() : sd.set || null) : null;
    if (D.readErr) CQ.toast('見積の保存場所を読めませんでした（' + (D.readErr.code || D.readErr.message || '') + '）', 'CF-1032');
  }

  /* ---------- 保存 ---------- */
  let flushT = null, busy = false, again = false;
  const ME = () => CQ.me();
  /* 何が変わったか（記録の1行）。前→後の金額は支払総額・車両本体・原価・個別見積の数・売約 */
  function summary(prev, next, car) {
    const p = prev || {}, n = next || {}, out = [];
    if (!prev) {   /* 初めての保存 */
      const nb = n.base;
      return '見積を作成' + (nb ? '（本体 ' + (Math.round(+nb.price || 0)).toLocaleString('ja-JP') + ' 円・税抜' + (window.QApi && QApi.costSum(nb) ? '・車両原価 ' + QApi.costSum(nb).toLocaleString('ja-JP') + ' 円' : '') + '）' : '');
    }
    const pb = p.base || null, nb = n.base || null;
    const yen = v => (Math.round(+v || 0)).toLocaleString('ja-JP');
    if (!pb && nb) out.push('基本価格を作成（本体 ' + yen(nb.price) + ' 円・税抜）');
    else if (pb && nb) {
      if (pb.price !== nb.price) out.push('車両本体 ' + yen(pb.price) + ' → ' + yen(nb.price) + ' 円（税抜）');
      const pc = window.QApi ? QApi.costSum(pb) : 0, nc = window.QApi ? QApi.costSum(nb) : 0;
      if (pc !== nc) out.push('車両原価 ' + yen(pc) + ' → ' + yen(nc) + ' 円');
      if (JSON.stringify(Object.assign({}, pb, { price: 0, cost: 0, hist: 0, changed: 0 })) !== JSON.stringify(Object.assign({}, nb, { price: 0, cost: 0, hist: 0, changed: 0 }))) out.push('基本価格の中身を変更');
    } else if (pb && !nb) out.push('基本価格を消した');
    if (JSON.stringify(p.std || null) !== JSON.stringify(n.std || null)) out.push('プラン見積を変更');
    const pu = (p.custs || []).length, nu = (n.custs || []).length;
    if (pu !== nu) out.push('個別見積 ' + pu + ' → ' + nu + ' 件');
    else if (JSON.stringify(p.custs || []) !== JSON.stringify(n.custs || [])) out.push('個別見積を変更');
    if (!p.order && n.order) out.push('売約（見積の上だけ）：' + ((n.custs || []).find(u => u.id === n.order.cust) || {}).name + ' 様・プラン ' + n.order.plan);
    else if (p.order && !n.order) out.push('売約を取り消し（見積の上だけ）');
    else if (p.order && n.order && JSON.stringify(p.order) !== JSON.stringify(n.order)) out.push('売約の中身を変更');
    if (JSON.stringify(p.cogs || null) !== JSON.stringify(n.cogs || null)) out.push('原価管理を変更');
    if (JSON.stringify(p.veh || {}) !== JSON.stringify(n.veh || {})) out.push('車両情報（型式・初度登録など）を変更');
    if (!out.length) out.push('見積を保存');
    return out.join('・');
  }
  async function writeCar(car, json) {
    const id = car.id, prevJSON = D.written[id], prev = prevJSON ? JSON.parse(prevJSON) : null, next = JSON.parse(json);
    const me = ME(), ref = coll('carQuotes').doc(id);
    const sum = summary(prev, next, car);
    const rev = (D.revs[id] || 0) + 1;
    const batch = FB.db.batch();
    /* 🔴 Firestore に渡す物は親（本体）の窓で作り直す（StockFlow 料金表 2026-10-12 の事故：iframe の {} は「custom Object」で弾かれる） */
    const doc = pobj(Object.assign({}, next, { carId: id, carNum: car.num, rev, updatedBy: me.uid, updatedByName: me.name }));
    doc.updatedAt = TS();
    const h = pobj({ by: me.uid, byName: me.name, where: '見積（CarFlow v4）', what: sum, rev, before: prevJSON || null });
    h.at = TS();
    batch.set(ref, doc);
    batch.set(ref.collection('hist').doc(), h);
    await batch.commit();
    D.written[id] = json; D.revs[id] = rev; D.quotes[id] = next;
    CQ.log(id, '見積：' + sum);
  }
  async function writeSet() {
    if (!CQ.can('canEditSettings')) return;
    const json = D.setJSON, me = ME();
    /* 🗣 2026-10-24「設定で見積もりの部分で CF-9020」＝設定の中に「表の中の表」（サイズごとの値段 vo・機種 bo・よく足す品 quick）があり、
       Firestore は配列の中の配列を保存できない（Nested arrays are not supported）＝今まで一度も保存できていなかった。
       → v4.5.17 設定は JSON の文字で1つの欄（json）に入れる。直す前の中身も prevJson に残す（記録から戻せる） */
    const doc = pobj({ json, prevJson: D.setWritten || null, updatedBy: me.uid, updatedByName: me.name });
    doc.updatedAt = TS();
    await coll('settings').doc('quote').set(doc);
    D.setWritten = json;
    CQ.log(null, '見積の設定を変更');
    try { if (CQ.setChanged) CQ.setChanged(window); } catch (e) {}   /* v4.4.0 設定の画面と見積の画面は別の iframe＝ほかの iframe は次に開く時に読み直す */
  }
  async function flush() {
    if (busy) { again = true; return; }
    busy = true;
    try {
      const S = window.QApi && QApi.state(); if (!S) return;
      if (CQ.canEdit()) {
        for (const car of S.cars) {
          const c0 = (S.edit && S.edit.carId === car.id) ? JSON.parse(S.edit.orig) : car;   // 作りかけ（保存していない）の車は、前に保存した中身のまま
          const json = jsonOf(c0, car);
          if (json === D.written[car.id]) continue;
          if (D.written[car.id] === undefined && json === D.empty[car.id]) continue;   // 何もしていない車は書かない
          try { await writeCar(car, json); }
          catch (e) { console.error('[quote] save', car.num, e); CQ.toast('見積を保存できませんでした（' + car.num + '）', 'CF-1031'); D.written[car.id] = json; }
        }
      }
      D.setJSON = JSON.stringify(S.set);
      if (D.setJSON !== D.setWritten && CQ.can('canEditSettings')) {
        try { await writeSet(); } catch (e) { console.error('[quote] settings', e); CQ.toast('見積の設定を保存できませんでした', 'CF-9020'); D.setWritten = D.setJSON; }
      }
    } finally {
      busy = false;
      if (again) { again = false; schedule(); }
    }
  }
  function schedule() { clearTimeout(flushT); flushT = setTimeout(flush, 700); }

  /* v4.5.23 🗣 2026-10-24「店舗情報が作成済みの見積に反映されない。電話番号が変わった時を考えると、既存の見積にも反映した方がいい」
     ＝帳票は保存した設定（店舗情報＝帳票・会社）をその都度読む作り。ただ、開いていた見積の画面は開いた時の設定のままだった（別の PC・別のタブ・設定を直す前に開いた画面）。
     → 見積の設定が保存されたら、開いている画面にもすぐ入れる。この画面で設定を直している途中（まだ保存していない）の時だけは触らない */
  function listenSet() {
    coll('settings').doc('quote').onSnapshot(d => {
      const x = (d && d.data && d.data()) || {}; if (!x.json || x.json === D.setWritten) return;
      const S = window.QApi && QApi.state(); if (!S) return;
      if (JSON.stringify(S.set) !== D.setWritten) return;   // この画面で設定を直している途中
      let s; try { s = JSON.parse(x.json); } catch (e) { return; }
      s.staff = CQ.staff();   // 担当はいつもメンバー画面のセールスから（quote.js の起動と同じ）
      const j = JSON.stringify(s); if (j === D.setWritten) return;
      S.set = s; D.set = s; D.setJSON = D.setWritten = j;
      QApi.refresh();
    }, e => console.warn('[quote] settings/quote listen', e));
  }

  /* ほかの人の保存を受け取る（いま直している車は触らない） */
  function listen() {
    coll('carQuotes').onSnapshot(snap => {
      const S = window.QApi && QApi.state(); if (!S) return;
      let changed = false;
      snap.docChanges().forEach(ch => {
        const id = ch.doc.id, x = ch.doc.data() || {};
        if (ch.type === 'removed') return;
        if ((x.rev || 0) <= (D.revs[id] || 0)) return;   // 自分の保存・古い物
        D.revs[id] = x.rev || 0; D.quotes[id] = x;
        const car = S.cars.find(c => c.id === id); if (!car) return;
        if (S.edit && S.edit.carId === id) { QApi.toast((x.updatedByName || 'ほかの人') + ' さんがこの車の見積を保存しました。保存すると上書きになります'); return; }
        const f = car._f, m = merge(f, x); QKEYS.concat(VKEYS, ['kei', 'firstReg', '_firstRegGuess']).forEach(k => { car[k] = m[k]; });
        D.written[id] = jsonOf(car); changed = true;
      });
      if (changed) QApi.refresh();
    }, e => console.warn('[quote] listen', e));
    /* CarFlow の車が増えた・変わった（数秒おきに目印を比べる） */
    let sig = CQ.sig();
    setInterval(() => {
      const s = CQ.sig(); if (s === sig) return; sig = s;
      const S = window.QApi && QApi.state(); if (!S) return;
      const list = CQ.cars(), have = {};
      list.forEach(f => {
        have[f.id] = 1;
        const car = S.cars.find(c => c.id === f.id);
        if (!car) { const m = merge(f, D.quotes[f.id]); S.cars.push(m); D.empty[f.id] = jsonOf(m); if (D.quotes[f.id]) D.written[f.id] = jsonOf(m); return; }
        const m = merge(f, null);
        ['num', 'maker', 'model', 'grade', 'color', 'km', 'buyDate', 'photo', 'photos', 'cfSize', 'status', '_f', '_sold', '_col', 'cfPrice'].forEach(k => { car[k] = m[k]; });
        if (car.keiQ == null) car.kei = m.kei;
        car._sb = undefined; car._sbKey = undefined;
      });
      S.cars = S.cars.filter(c => have[c.id] || c.id === (S.edit && S.edit.carId));
      QApi.refresh();
    }, 3000);
  }

  /* ---------- 相場（相場ビュー・一覧の「相場との差」と同じ当て方と計算） ---------- */
  let META = null, IDX = null, baseP = null, KATA = null, kataP = null;
  const CARDS = {};
  async function token() { const u = P.firebase.auth().currentUser; if (!u) throw new Error('ログインしていません'); return u.getIdToken(); }
  async function get(path, kind) {
    let r;
    if (DEMO) r = await fetch('../soba/demo/' + path, { cache: 'no-store' });
    else r = await fetch('https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/' + encodeURIComponent(PREFIX + path) + '?alt=media',
      { headers: { Authorization: 'Firebase ' + await token() }, cache: path === 'meta.json' ? 'no-store' : 'default' });
    if (r.status === 404) { const e = new Error('相場データが見つかりません：' + path); e.notFound = true; throw e; }
    if (!r.ok) throw new Error('相場データを読めませんでした（' + r.status + '）');
    return kind === 'text' ? r.text() : r.json();
  }
  function addScript(src, text) {
    return new Promise((ok, ng) => {
      const s = document.createElement('script');
      if (text != null) { s.textContent = text; document.head.appendChild(s); ok(); return; }
      s.src = src; s.onload = ok; s.onerror = () => ng(new Error('読み込めませんでした：' + src)); document.head.appendChild(s);
    });
  }
  function ensureSoba() {
    if (!baseP) baseP = (async () => {
      META = await get('meta.json');
      if (META.schema !== 1) throw new Error('相場データの形が変わりました（schema ' + META.schema + '）');
      if (DEMO && META.demo !== true) throw new Error('デモの見本に作り物の印がありません');
      const [idx, calc] = await Promise.all([get('index.json'), window.SobaCalc ? null : get('soba-calc.js', 'text')]);
      const hidden = {}; (META.hidden || []).forEach(k => { hidden[k] = 1; });
      IDX = idx.filter(e => !hidden[e.key] && (e.years || []).length);
      if (calc != null) await addScript(null, calc + '\n//# sourceURL=soba-calc.js');
      /* ライバル店DB（rival.js＝店のカテゴリごとの掲載の倍率）。無ければ C1 の比べを出さないだけ */
      if (!window.RIVAL) { const rv = await get('rival.js', 'text').catch(() => null); if (rv) await addScript(null, rv + '\n//# sourceURL=rival.js'); }
      if (!window.SobaStock) await addScript('../soba/stock.js?v=' + encodeURIComponent(CQ.ver()));
      if (!window.SobaCalc || !window.SobaStock) throw new Error('相場の計算を読み込めませんでした');
    })();
    return baseP;
  }
  function card(k) {
    if (!CARDS[k]) CARDS[k] = get('cards/' + encodeURIComponent(k) + '.json').catch(e => { delete CARDS[k]; throw e; });
    return CARDS[k];
  }
  const pickKey = id => { try { return localStorage.getItem('cf_soba_pick_' + id) || null; } catch (e) { return null; } };
  function sobaKey(car) { return [car.maker, car.model, car.grade, car.firstReg, car.km, car.color, pickKey(car.id)].join('|'); }
  /* 月のラベル（相場データの月を 0 として −12〜0） */
  function months() {
    const b = String((META && (META.raw || META.built)) || '');
    let y, m; const a = b.match(/^(\d{4})-(\d{2})/), c = b.match(/^(\d{2})(\d{2})\d{2}$/);
    if (a) { y = +a[1]; m = +a[2]; } else if (c) { y = 2000 + +c[1]; m = +c[2]; } else { const d = new Date(); y = d.getFullYear(); m = d.getMonth() + 1; }
    const out = []; for (let i = 12; i >= 0; i--) { const d = new Date(y, m - 1 - i, 1); out.push(String(d.getFullYear()).slice(2) + '/' + String(d.getMonth() + 1).padStart(2, '0')); }
    return out;
  }
  function slopeOf(a) { const f = a.filter(x => x > 0); if (f.length < 2) return 0; return Math.round((Math.pow(f[f.length - 1] / f[0], 1 / (f.length - 1)) - 1) * 1000) / 10; }
  /* 🗣 2026-10-23「小売りの方は保証有の店から合わせていかないと」「車両価格としてがっつり組ませて高いか安いかを見たい」→「とりあえずやってみて」
     ＝ライバル店DB の C1（一般店・保証あり＋法定整備付＝うちと同じ層）の店の掲載の値を、この車の条件に当てて出す。
     計算は相場ビュー（soba/view.js rivalAdj）と同じ：この車の相場（R.rt＝グレード・年式・走行・色で当てた値）× C1 の倍率（年数帯があればそちら）。
     返す形（千円・税込）：total 総額の真ん中・p25／p75 幅・body 本体（車両価格）・fees 諸費用の真ん中・warr 保証あり%・warrM 保証の月・seibi 法定整備付%・days 掲載日数・n 台数 */
  const rvAge = a => a <= 1 ? '〜1年' : a <= 3 ? '2-3年' : a <= 6 ? '4-6年' : a <= 10 ? '7-10年' : '11年〜';
  function c1Of(key, y, R) {
    const RV = window.RIVAL; if (!RV || !RV.R || R.rt == null) return null;
    const T = RV.R[key]; if (!T || !T.C1) return null;
    const A = ((RV.RA || {})[key] || {})[rvAge((RV.yr || 2026) - (+y))] || {}, v = T.C1, r = A.C1 ? A.C1[0] : v[0], sh = r / v[0];
    return { total: R.rt * r, p25: R.rt * v[1] * sh, p75: R.rt * v[2] * sh, body: R.rt * v[3] * sh, fees: v[4], warr: v[5], warrM: v[6], seibi: v[7], days: v[8], n: v[9],
      ratio: r, nAge: A.C1 ? A.C1[1] : null, age: A.C1 ? rvAge((RV.yr || 2026) - (+y)) : '', built: RV.built || '' };
  }
  /* 相場カード＋計算 → 画面の形（quote.js の sobaOf が返す物）。金額は千円・小売は税込・AA は税抜 */
  function shape(m, R) {
    const Y = m.card.years[m.y] || {}, ser = (Y.ser_sold || []).slice(-13), sa = (Y.ser_aa || []).slice(-13);
    const lastS = ser.length ? ser[ser.length - 1][1] : 0, lastA = sa.length ? sa[sa.length - 1][1] : 0;
    const fit = (arr, last, now) => { const o = arr.map(x => last ? Math.round(x[1] * now / last) : Math.round(now)); while (o.length < 13) o.unshift(o[0] || Math.round(now)); return o; };
    const series = fit(ser, lastS, R.rt), aa = fit(sa, lastA, R.aa != null ? R.aa : 0);
    const z = (Y.sold && Y.sold.z) || 60, sp = [[-5, .46], [-2, .74], [0, 1], [3, 1.48], [6, 2.07]].map(([d, f]) => ({ d, days: Math.round(z * f) }));
    const cr = (R.conf && R.conf.rt) || {}, n = Y.n || {};
    return {
      real: true, key: m.key, cardName: m.car, y: m.y, g: m.g, how: m.how, col: m.col, km: m.km, built: META && META.built,
      now: Math.round(R.rt), series, aa, m: months(),
      stock: Math.round(R.stk || (Y.stock && Y.stock.p) || R.rt), total: Math.round((Y.stock && Y.stock.tot) || R.rt), days: (Y.stock && Y.stock.z) || z, old90: Y.stock && Y.stock.old90 != null ? Y.stock.old90 : '—', nStock: n.stock || 0,
      /* 🔴 v4.0.12 前は sold1y に R.rt1y（＝1年後の見込み）・sold3m にいまの値・aa1m に R.aa1（＝1か月後の見込み）を入れていた＝表の名前と違った。
         いまは相場カードの実績＝その年式の全グレードの生の真ん中（成約 1年 p12・直近3か月 p3／AA 13か月 p13・直近2か月 p1）。この車の条件に当てた値ではない */
      fresh: Math.round(R.frs || R.rt), rawSold12: (Y.sold && Y.sold.p12) || null, rawSold3: (Y.sold && Y.sold.p3) || null,
      aaNow: Math.round(R.aa || 0), rawAA13: (Y.aa && Y.aa.p13) || null, rawAA2: (Y.aa && Y.aa.p1) || null, asnet: Math.round((Y.asnet && Y.asnet.p) || 0),
      in4rt: Math.round(R.rt4 || R.rt), in4aa: Math.round(R.aa4 || R.aa || 0), slope: slopeOf(series), slopeAA: slopeOf(aa),
      c1: c1Of(m.key, m.y, R),
      trust: cr.grade || '—', pct: cr.pct, nSold: n.sold || cr.n || 0, nAA: n.aa || 0, up: R.up, speed: sp, sellDays: z
    };
  }
  const SB_BUSY = {};
  /* 一度に読むのは3台まで（一覧を開くと在庫の全部の車が並ぶ＝相場カードを順番に読む）。いま開いている車は先頭に割り込む */
  let sbRun = 0; const sbQ = [];
  function sbPump() { while (sbRun < 3 && sbQ.length) { const job = sbQ.shift(); sbRun++; job().finally(() => { sbRun--; sbPump(); }); } }
  /* 同期で呼ぶ（画面の描き直しの中から）。持っていなければ裏で出して、出たら描き直す */
  function soba(car) {
    if (!car) return null;
    const key = sobaKey(car);
    if (car._sbKey === key) return car._sb || null;
    if (SB_BUSY[car.id] === key) return null;
    SB_BUSY[car.id] = key; car._sbState = 'loading';
    const S0 = window.QApi && QApi.state(), mine = S0 && S0.ui.carId === car.id;
    const job = async () => {
      let sb = null, why = '';
      try {
        await ensureSoba();
        const y = parseInt(String(car.firstReg || '').slice(0, 4), 10) || null;
        const m = await SobaStock.match({ id: car.id, maker: car.maker, model: car.model, grade: car.grade, year: y, km: car.km, color: car.color }, IDX, card, { key: pickKey(car.id) });
        if (!m.ok) why = m.why || '相場が引けません';
        else {
          const f = { g: m.g == null ? null : m.g }; if (m.col) f.col = m.col; if (m.km != null) f.kb = SobaCalc.cxKb(m.km);
          const ys = [m.y], un = SobaCalc.autoUnused ? SobaCalc.autoUnused(m.card, ys, f, m.km) : false;
          const R = SobaCalc.quoteMix(m.card, ys, f, { km: m.km, q: {}, unused: un });
          if (!R || R.rt == null) why = 'この条件の相場が出ません'; else sb = shape(m, R);
        }
      } catch (e) { why = (DEMO ? 'デモ版では相場を出していません' : String((e && e.message) || e)); console.warn('[quote] soba', car.num, e); }
      if (SB_BUSY[car.id] !== key) return;
      delete SB_BUSY[car.id];
      car._sb = sb; car._sbKey = key; car._sbState = sb ? 'ok' : 'none'; car._sbWhy = why;
      QApi.refreshSoon();
    };
    if (mine) sbQ.unshift(job); else sbQ.push(job);
    sbPump();
    return null;
  }

  /* ---------- 型式DB（Storage の katashiki.json＝グーのカタログ 10,312型式）→ 画面の形 KATA[型式]['メーカー|車種'] = 行の並び ---------- */
  function ensureKata() {
    if (!kataP) kataP = (DEMO ? Promise.resolve([]) : get('katashiki.json')).then(list => {
      const K = {};
      (list || []).forEach(r => {
        const code = String(r['型式'] || '').toUpperCase(); if (!code) return;
        const mkr = r['メーカー'] || '', full = String(r['車種'] || ''), car = full.split(' ').slice(1).join(' ') || full;
        const mk0 = full.split(' ')[0], hit = window.CFMaker ? (CFMaker.find(mk0) || CFMaker.find(mkr)) : null, mkJ = hit ? hit.name : mk0;
        const ymOf = v => String(v || '').replace(/\D/g, '').replace(/^(\d{4})(\d{2}).*/, '$1/$2');
        const ym = ymOf(r['初出']), ymL = ymOf(r['最終']) || ym;   /* 🔴 v4.0.4 最終（最後の発売）も行にする＝発売の幅が「初出〜最終」になる（前は初出だけ＝2020/02〜2020/02 と出て、ヤリス 2023/07 に「年式が違う」） */
        const cc = parseInt(String(r['排気量'] || '').replace(/[^\d]/g, ''), 10) || '';
        const grades = String(r['グレード'] || '').split('／').map(s => s.trim()).filter(Boolean);
        const price = r['新車価格最高'] ? Math.round(+r['新車価格最高'] * 10000) : '';
        const rows = [];
        (grades.length ? grades : ['']).forEach(g => (ymL !== ym ? [ym, ymL] : [ym]).forEach(y => rows.push([y, g, cc ? cc + 'cc' : '', r['駆動'] || '', '', r['定員'] || '', '', price, r['型式全体'] || code, '', '', ''])));
        const k = mkJ + '|' + car;
        ((K[code] = K[code] || {})[k] = (K[code][k] || []).concat(rows));
      });
      KATA = K; window.KATA = K;
      return K;
    }).catch(e => { console.warn('[quote] katashiki', e); KATA = {}; window.KATA = {}; return {}; });
    return kataP;
  }

  /* ---------- StockFlow の料金表（部品・油脂）。原価管理の部品の単価に使う（読むだけ） ---------- */
  let SF = [], SFC = [];
  const ymd = t => { try { const d = t && t.toDate ? t.toDate() : t ? new Date(t) : null; return d && !isNaN(d) ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : ''; } catch (e) { return ''; } };
  function loadSF() {
    if (DEMO) return;
    coll('stockPriceItems').get().then(qs => {
      const out = [], coat = [];
      qs.forEach(d => {
        const x = d.data() || {}; if (x.deleted || x.trash) return;
        /* v4.5.8 🗣 2026-10-24「コーティングの値段は StockFlow から参照する形に」＝作業（labor）の「コーティング」の品も読む（cat＝料金の組・name＝「…・Mサイズ」・list＝税抜。「¥33,000〜」のような文字は null） */
        if (x.typ === 'labor') { if (x.kind === 'コーティング') coat.push({ cat: x.cat || '', name: x.name || '', list: (typeof x.list === 'number' || /^\d+$/.test(String(x.list || ''))) ? +x.list : null }); return; }
        const no = typeof x.no === 'number' ? 'P' + String(x.no).padStart(4, '0') : String(x.no || '');
        /* cat・list（定価）・shop（店頭）＝見積の品の本体（ドラレコなど sfCat の品）の機種と値段に使う（2026-10-23） */
        out.push({ id: d.id, no, kind: x.kind || '', cat: x.cat || '', maker: x.maker || '', name: x.name || '', code: x.code || '', sup: x.sup || '', unit: x.unit || '', cost: +x.cost || 0, list: +x.list || 0, shop: +x.shop || 0, at: ymd(x.updatedAt) });
      });
      out.sort((a, b) => String(a.no).localeCompare(String(b.no)));
      SF = out; SFC = coat; if (window.QApi) QApi.refreshSoon();
    }).catch(e => console.warn('[quote] stockPriceItems', e));
  }

  /* ---------- 📣 反響（carReactions）。カード詳細の［価格履歴］に生の数字を重ねる（読むだけ・v4.5.0） ---------- */
  let RX = {};
  function loadRx() {
    if (DEMO) return;
    coll('carReactions').get().then(qs => { const o = {}; qs.forEach(d => { o[d.id] = d.data() || {}; }); RX = o; if (window.QApi) QApi.refreshSoon(); })
      .catch(e => console.warn('[quote] carReactions', e));
  }

  /* ---------- 起動 ---------- */
  window.QData = {
    demo: DEMO, me: () => CQ.me(), canEdit: () => CQ.canEdit(), canSet: () => CQ.can('canEditSettings'), staff: () => CQ.staff(), company: () => CQ.company(),
    ver: () => CQ.ver(), log: (id, a) => CQ.log(id, a), toastTop: (m, c) => CQ.toast(m, c), openCar: id => CQ.openCar(id), route: r => { try { if (CQ.route) CQ.route(r); } catch (e) {} },   /* v4.5.14 見積の画面の住所（親の戻る・進む） */
    /* 装備品一覧＝カードの装備品チェックの印刷（親の画面で開く）。入力があるかは開くたびに親から読む（車の一覧の目印に装備は入っていない） */
    printEquip: id => !!(CQ.printEquip && CQ.printEquip(id)), equipDone: id => { const f = CQ.car(id); return !!(f && f.equip && f.equip.length); },
    schedule, flush, soba, rx: id => RX[id] || null,
    /* 見張り用：いま保存すると書きに行く車（書かずに見るだけ） */
    _pending: () => { const S = window.QApi && QApi.state(); if (!S) return []; return S.cars.filter(car => { const c0 = (S.edit && S.edit.carId === car.id) ? JSON.parse(S.edit.orig) : car; const j = jsonOf(c0, car); return j !== D.written[car.id] && !(D.written[car.id] === undefined && j === D.empty[car.id]); }).map(c => c.num); }, ensureKata, kata: () => KATA, sf: () => SF, sfCoat: () => SFC, sobaMeta: () => META, pickKey,
    get savedSet() { return D.set; }
  };
  (async () => {
    try {
      boot('見積を読み込み中…（車・見積・設定）');
      await loadAll();
      ensureSoba().catch(e => console.warn('[quote] soba base', e));
      ensureKata(); loadSF(); loadRx();
      D.empty = {};
      window.QBOOT = {
        set: D.set, cars: CQ.cars().map(f => merge(f, D.quotes[f.id])),
        app: new URLSearchParams(location.search).get('app') || 'quote'
      };
      await addScript('quote.js?v=' + encodeURIComponent(CQ.ver()));
      const S = QApi.state();
      /* 読み込んだ直後の形を「保存済み」とする（画面の決まりで整えただけの差は書かない） */
      S.cars.forEach(c => { const j = jsonOf(c); if (D.quotes[c.id]) D.written[c.id] = j; else D.empty[c.id] = j; });
      D.setJSON = D.setWritten = JSON.stringify(S.set);
      listen(); listenSet();
    } catch (e) {
      console.error('[quote] boot', e);
      boot('⚠ 見積を読み込めませんでした：' + String((e && e.message) || e).replace(/</g, '&lt;') + '<br><small>CF-1032・開き直しても直らない時はチーフへ</small>');
      CQ.toast('見積を読み込めませんでした', 'CF-1032');
    }
  })();
})();
