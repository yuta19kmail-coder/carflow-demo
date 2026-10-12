/* ========================================
   soba-quick.js ─ 全体一覧の「相場より安い −◯万」の1行  CarFlow v3.11.0（2026-10-12）
   ----------------------------------------
   🗣 2026-10-12 ゆうた「全体一覧に対して　相場より安い　-〇万円　ぐらいの簡易的な1行を表示するようにして」
   ◎ 数字はカード詳細の［相場］タブ（soba/embed.js）の一番上と同じ物
     ＝ 当て方 soba/stock.js（SobaStock.match）・計算 soba-calc.js の quoteMix・条件（グレード・色・走行の帯とぴったり・未使用車の自動）も同じ
     ＝ 本体価格（税込・CarSoba.car）− 小売相場（税込）
   ◎ データは相場ビューと同じ Storage soba/v1/（ログインの通行証を付けて読む。ダウンロード URL は作らない）
     ・meta.json は毎回（小さい）。index.json・soba-calc.js・カードは要る時だけ
     ・答えはこのブラウザに控える（localStorage cf_soba_quick）。相場データの日付（meta.built）か車の中身（CarSoba.sig＋選び直し）が変わったら出し直す
       ＝ふだんはカードを1枚も読まない
   ◎ 本体価格の無い車・相場の引けない車は「—」（ホバーで理由）
   🔴 計算はここに書かない（soba-calc.js の仕事）。引き算と言葉だけ
   ======================================== */
(function () {
  'use strict';
  var BUCKET = 'carflow-9d500.firebasestorage.app', PREFIX = 'soba/v1/', LSK = 'cf_soba_quick';
  var meta = null, idx = null, baseP = null, cards = {}, queue = [], busy = false, store = null, waitT = null;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function load() {
    if (store) return store;
    try { store = JSON.parse(ls(LSK) || '{}') || {}; } catch (e) { store = {}; }
    if (!store.rows) store.rows = {};
    return store;
  }
  function save() {
    try {
      var rows = {}; Object.keys(store.rows).forEach(function (k) { if (!store.rows[k].err) rows[k] = store.rows[k]; });
      ls(LSK, JSON.stringify({ built: store.built, rows: rows }));
    } catch (e) {}
  }
  function ver() { var m = document.querySelector('meta[name="app-version"]'); return m ? m.getAttribute('content') : ''; }

  function get(path, kind) {
    var demo = window.__DEMO_MODE === true, pr;
    if (demo) pr = fetch('soba/demo/' + path, { cache: 'no-store' });
    else {
      var u = window.firebase && firebase.apps && firebase.apps.length && firebase.auth().currentUser;
      if (!u) return Promise.reject(new Error('ログインしていません'));
      pr = u.getIdToken().then(function (t) {
        return fetch('https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/' + encodeURIComponent(PREFIX + path) + '?alt=media',
          { headers: { Authorization: 'Firebase ' + t }, cache: path === 'meta.json' ? 'no-store' : 'default' });
      });
    }
    return pr.then(function (r) {
      if (!r.ok) throw new Error('相場データを読めませんでした（' + r.status + '）');
      return kind === 'text' ? r.text() : r.json();
    });
  }
  function addScript(src, text) {
    return new Promise(function (ok, ng) {
      var s = document.createElement('script');
      if (text != null) { s.textContent = text; document.head.appendChild(s); ok(); return; }
      s.src = src; s.onload = ok; s.onerror = function () { ng(new Error('読み込めませんでした：' + src)); };
      document.head.appendChild(s);
    });
  }
  /* meta だけ先に（答えの控えが使えるかを決める） */
  var metaP = null;
  function ensureMeta() {
    if (!metaP) metaP = get('meta.json').then(function (m) {
      if (m.schema !== 1) throw new Error('相場データの形が変わりました');
      meta = m;
      var st = load();
      if (st.built !== m.built) {   // 相場データが新しくなったら全部出し直す
        var had = Object.keys(st.rows).length;
        st.built = m.built; st.rows = {}; save();
        if (had && typeof SobaQuick.onUpdate === 'function') setTimeout(function () { try { SobaQuick.onUpdate(); } catch (e) {} }, 0);
      }
      return m;
    });
    return metaP;
  }
  /* 出し直しが要る時だけ：index・計算・当て方 */
  function ensureBase() {
    if (!baseP) baseP = ensureMeta().then(function () {
      return Promise.all([get('index.json'), window.SobaCalc ? null : get('soba-calc.js', 'text')]);
    }).then(function (a) {
      var hidden = {}; (meta.hidden || []).forEach(function (k) { hidden[k] = 1; });
      idx = a[0].filter(function (e) { return !hidden[e.key] && (e.years || []).length; });
      var p = a[1] != null ? addScript(null, a[1] + '\n//# sourceURL=soba-calc.js') : Promise.resolve();
      return p.then(function () { return window.SobaStock ? null : addScript('soba/stock.js?v=' + encodeURIComponent(ver())); });
    }).then(function () { if (!window.SobaCalc || !window.SobaStock) throw new Error('相場の計算を読み込めませんでした'); });
    return baseP;
  }
  function card(k) {
    if (!cards[k]) cards[k] = get('cards/' + encodeURIComponent(k) + '.json').catch(function (e) { delete cards[k]; throw e; });
    return cards[k];
  }

  function sigOf(c) {
    var pick = ls('cf_soba_pick_' + c.id) || '';
    return (window.CarSoba ? CarSoba.sig(c) : '') + '|' + pick;
  }

  /* 1台：［相場］タブの embed.js baseS と同じ条件で quoteMix */
  function compute(c) {
    var info = CarSoba.car(c.id);
    if (!info) return Promise.resolve(null);
    if (!info.bodyIncl) return Promise.resolve({ x: '本体価格が入っていません' });
    return ensureBase().then(function () {
      return SobaStock.match(info, idx, card, { key: ls('cf_soba_pick_' + c.id) || null });
    }).then(function (m) {
      if (!m.ok) return { x: m.why || '相場が引けません' };
      var f = { g: m.g == null ? null : m.g };
      if (m.col) f.col = m.col;
      if (m.km != null) f.kb = SobaCalc.cxKb(m.km);
      var ys = [m.y];
      var un = SobaCalc.autoUnused ? SobaCalc.autoUnused(m.card, ys, f, m.km) : false;
      var R = SobaCalc.quoteMix(m.card, ys, f, { km: m.km, q: {}, unused: un });
      if (!R || R.rt == null) return { x: 'この条件の相場が出ません' };
      return { rt: Math.round(R.rt * 1000), d: Math.round(info.bodyIncl - R.rt * 1000), car: m.car, g: m.g || '', y: m.y };
    });
  }

  function pump() {
    if (busy) return;
    var c = queue.shift(); if (!c) return;
    busy = true;
    var sig = sigOf(c);
    compute(c).then(function (r) {
      if (r) { load().rows[c.id] = Object.assign({ sig: sig }, r); save(); }
    }, function (e) {
      console.warn('[soba-quick]', c.num, e);
      load().rows[c.id] = { sig: sig, x: String((e && e.message) || e), err: 1 };
    }).then(function () {
      busy = false;
      clearTimeout(waitT); waitT = setTimeout(function () { if (typeof SobaQuick.onUpdate === 'function') try { SobaQuick.onUpdate(); } catch (e) {} }, queue.length ? 600 : 0);
      setTimeout(pump, 0);
    });
  }

  /* 一覧の描画から呼ぶ：控えがあれば返す。無ければ並べて出す（出たら onUpdate で描き直し）
     ⚠ 読めなかった時（err）はこの開いている間だけ「—」で持つ（控えには書かない＝次に開いた時にやり直す。描き直しのたびに読み直さない） */
  function result(c) {
    if (!c || !c.id || !window.CarSoba) return null;
    var sig = sigOf(c), r = load().rows[c.id];
    if (r && r.sig === sig) { if (!meta) ensureMeta().catch(function () {}); return r; }
    if (!queue.some(function (q) { return q.id === c.id; })) {
      queue.push(c);
      ensureMeta().then(pump, function (e) {
        console.warn('[soba-quick] meta', e);
        queue = []; load().rows[c.id] = { sig: sig, x: String((e && e.message) || e), err: 1 };
        if (typeof SobaQuick.onUpdate === 'function') try { SobaQuick.onUpdate(); } catch (e2) {}
      });
    }
    return null;
  }

  /* 表のセル（1行） */
  function cell(c) {
    var r = result(c);
    if (!r) return '<span class="sq sq-wait" title="相場を計算中">…</span>';
    if (r.x) return '<span class="sq sq-na" title="' + esc(r.x) + '">—</span>';
    var pct = r.d / r.rt * 100, man = (Math.abs(r.d) / 10000).toFixed(1) + '万';
    var cls = pct >= 10 ? 'ng' : pct >= 3 ? 'mid' : pct <= -3 ? 'ok' : 'eq';
    var txt = pct >= 3 ? '相場より高い +' + man : pct <= -3 ? '相場より安い −' + man : '相場どおり ' + (r.d >= 0 ? '+' : '−') + man;
    var tip = '小売相場（税込）' + (r.rt / 10000).toFixed(1) + '万・' + r.car + '・' + r.y + '年式' + (r.g ? '・' + r.g : '・グレード指定なし') + '（' + (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1) + '%）。くわしくはカード詳細の［相場］タブ';
    return '<span class="sq sq-' + cls + '" title="' + esc(tip) + '">' + txt + '</span>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }

  var SobaQuick = window.SobaQuick = { result: result, cell: cell, onUpdate: null, _compute: compute };
})();
