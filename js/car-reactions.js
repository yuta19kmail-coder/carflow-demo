/* ============================================================
   📣 反響の取り込み（v4.5.0）＝設定 ▸ データ の「反響の取り込み」
   🗣 2026-10-23「反響の数字は週1回のポータル点検の時に CarFlow へ入れる形で」
   ・グー MOTORGATE「効果分析 ▸ 在庫」（集計単位＝日ごと・1か月分）の CSV（CP932）＝車ごと・日ごと
       正面画像表示回数（一覧で見られた）・複数画像表示回数（写真を開いた）・見積依頼件数・検討中リスト追加数・店舗詳細閲覧回数・MAP閲覧回数・ユーザーレビュー閲覧回数
   ・カーセンサー C-MATCH「登録物件一覧」のダウンロード（CP932）＝車ごとの累計（取り込んだ日の控え）
       総掲載日数・詳細閲覧数・メール問合せ数（全て）・電話問合せ数・MAP閲覧数・お気に入り
   ・置き場＝companies/{会社}/carReactions/{車のID}：{ num, goo:{日:[7つ]}, cs:{控えの日:[掲載日数,詳細,メール,電話,MAP,お気に入り]}, updatedAt, updatedBy }
     日ごとに足していく（同じ日は新しい取り込みで上書き＝グーは月の途中の分も後で直る）。消さない
   ・車は管理番号（KM0546・KM-0546）で合わせる。空の行は見積に入れた車台番号で合わせる。合わない行は件数だけ知らせる
   ・点数は作らない（反響DB の決まり「点数は在庫判断に使わない」）。見せるのは生の数字＝カード詳細の［価格履歴］
   ・元のファイルの控え・答え合わせは今までどおり 業務ツール\車販\反響DB（このページはそこから CarFlow へ写すだけ）
   ============================================================ */
(function () {
  'use strict';
  var GOO_KEYS = ['正面画像表示回数', '複数画像表示回数', '見積依頼件数', '検討中リスト追加数', '店舗詳細閲覧回数', 'MAP閲覧回数', 'ユーザーレビュー閲覧回数'];
  var CS_KEYS = ['総掲載日数', '詳細閲覧数', 'メール問合せ数（全て）', '電話問合せ数', 'MAP閲覧数', 'お気に入り'];
  function toast(m, c) { if (typeof showToast === 'function') showToast(m, c); }
  function nNum(s) { return String(s || '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, ''); }   /* KM-0546 → KM0546 */
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function status(t, kind) { var e = document.getElementById('rx-imp-st'); if (e) { e.textContent = t || ''; e.style.color = kind === 'err' ? 'var(--red)' : kind === 'ok' ? 'var(--green)' : 'var(--text3)'; } }

  /* CSV を1行ずつ（"…" の中の , と改行に対応） */
  function parseCsv(text) {
    var rows = [], row = [], f = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += ch;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  async function readText(file) {
    var buf = await file.arrayBuffer();
    try { return new TextDecoder('shift_jis').decode(buf); } catch (e) { return new TextDecoder('utf-8').decode(buf); }
  }

  /* グー：見出しの行（「集計項目」がある行）の上の「期間指定:2026年09月」で年月、見出しの「9/1(火)」で日 */
  function parseGoo(rows) {
    var hi = rows.findIndex(function (r) { return r.indexOf('集計項目') >= 0 && r.indexOf('管理ID') >= 0; }); if (hi < 0) return null;
    var H = rows[hi], ci = H.indexOf('集計項目'), di = ci + 2, ki = H.indexOf('管理ID'), vi = H.indexOf('車台番号');
    var ymRow = rows.slice(0, hi).map(function (r) { return r.join(','); }).join(',');
    var m = ymRow.match(/期間指定:(\d{4})年(\d{1,2})月/); if (!m) return null;
    var Y = +m[1];
    var days = H.slice(di).map(function (h) { var x = String(h).match(/(\d{1,2})\/(\d{1,2})/); return x ? Y + '-' + String(+x[1]).padStart(2, '0') + '-' + String(+x[2]).padStart(2, '0') : null; });
    var out = {}, cur = null;
    rows.slice(hi + 1).forEach(function (r) {
      if (!r || r.length <= di) return;
      if (r[vi] || r[ki]) cur = { km: nNum(r[ki]), vin: nNum(r[vi]), d: {} };
      if (!cur) return;
      var k = GOO_KEYS.indexOf(r[ci]); if (k < 0) return;
      var key = cur.km || ('VIN:' + cur.vin); out[key] = out[key] || cur;
      days.forEach(function (d, j) { if (!d) return; var v = +(r[di + j] || 0) || 0; (cur.d[d] = cur.d[d] || [0, 0, 0, 0, 0, 0, 0])[k] = v; });
    });
    return { kind: 'goo', month: m[1] + '-' + String(+m[2]).padStart(2, '0'), cars: out };
  }
  /* カーセンサー：見出しの行（「貴社管理番号」と「詳細閲覧数」がある行）。上の「出力日時：」が控えの日 */
  function parseCs(rows) {
    var hi = rows.findIndex(function (r) { return r.indexOf('貴社管理番号') >= 0 && r.indexOf('詳細閲覧数') >= 0; }); if (hi < 0) return null;
    var H = rows[hi], ki = H.indexOf('貴社管理番号'), vi = H.indexOf('車台番号');
    var at = null; rows.slice(0, hi).forEach(function (r) { if (/出力日時/.test(r[0] || '') && r[1]) { var x = String(r[1]).match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/); if (x) at = x[1] + '-' + String(+x[2]).padStart(2, '0') + '-' + String(+x[3]).padStart(2, '0'); } });
    if (!at) at = ymd(new Date());
    var idx = CS_KEYS.map(function (k) { return H.indexOf(k); }), out = {};
    rows.slice(hi + 1).forEach(function (r) {
      if (!r || r.length <= ki || !(r[ki] || r[vi])) return;
      var v = idx.map(function (i) { return i >= 0 ? (+(String(r[i] || '').replace(/,/g, '')) || 0) : 0; });
      var key = nNum(r[ki]) || ('VIN:' + nNum(r[vi]));
      out[key] = { km: nNum(r[ki]), vin: nNum(r[vi]), v: v, listed: (r[H.indexOf('掲載状況')] || '') };
    });
    return { kind: 'cs', at: at, cars: out };
  }

  /* 車台番号と管理番号の対応表（反響DB の「車台番号と管理番号.csv」・ポータル運用の「対応表.csv」など）。
     見出しに 管理番号の欄（KM番号・管理ID・貴社管理番号・管理用番号）と 車台番号の欄 がある CSV */
  function parseMap(rows) {
    var KM = ['KM番号', '管理番号', '管理ID', '貴社管理番号', '管理用番号'], VIN = ['車台番号', 'グー物件(車台番号)'];
    var hi = rows.findIndex(function (r) { return KM.some(function (k) { return r.indexOf(k) >= 0; }) && VIN.some(function (k) { return r.indexOf(k) >= 0; }); }); if (hi < 0) return null;
    var H = rows[hi], ki = H.findIndex(function (h) { return KM.indexOf(h) >= 0; }), vi = H.findIndex(function (h) { return VIN.indexOf(h) >= 0; }), pairs = [];
    rows.slice(hi + 1).forEach(function (r) { var k = nNum(r[ki]), v = nNum(r[vi]); if (k && v) pairs.push([v, k]); });
    return pairs.length ? { kind: 'map', pairs: pairs } : null;
  }

  /* 取り込み（ファイルをまとめて選ぶ）。グーは月ごとに何枚でも・カーセンサーは1枚（その日の控え） */
  function pick() {
    if (typeof hasPermission === 'function' && !hasPermission('canEditSettings')) { toast('この操作はあなたの権限ではできません', 'CF-0027'); return; }
    var f = document.getElementById('rx-imp-inp'); if (f) { f.value = ''; f.click(); }
  }
  async function importFiles(files) {
    files = Array.prototype.slice.call(files || []); if (!files.length) return;
    var cid = window.fb && fb.currentCompanyId; if (!cid) { toast('会社が分かりません'); return; }
    status('読み込み中…');
    var parsed = [];
    for (var i = 0; i < files.length; i++) {
      var rows = parseCsv(await readText(files[i])), g = parseGoo(rows), c = g ? null : parseCs(rows), mp = g || c ? null : parseMap(rows);
      if (g || c || mp) parsed.push(Object.assign({ name: files[i].name }, g || c || mp)); else parsed.push({ name: files[i].name, kind: '?' });
    }
    var bad = parsed.filter(function (p) { return p.kind === '?'; });
    if (bad.length === parsed.length) { status('グー（効果分析 ▸ 在庫・日ごと）かカーセンサー（登録物件一覧）の CSV ではありません：' + bad.map(function (b) { return b.name; }).join('・'), 'err'); return; }
    /* 車を合わせる：管理番号 → 車（在庫と販売実績）。空なら見積の車台番号 */
    var all = (typeof cars !== 'undefined' ? cars : []).concat(typeof archivedCars !== 'undefined' ? archivedCars : []);
    var byNum = {}; all.forEach(function (c) { if (c && c.num) byNum[nNum(c.num)] = c; });
    /* 車台番号 → 車：①前に取り込んだ時に覚えた車台番号 ②見積に入れた車台番号 ③一緒に選んだ対応表 ④グー・カーセンサーの行で管理番号と車台番号が両方ある物 */
    var byVin = {};
    try { var rq = await fb.db.collection('companies').doc(cid).collection('carReactions').get(); rq.forEach(function (d) { var v = nNum((d.data() || {}).vin); if (v) byVin[v] = d.id; }); } catch (e) { console.warn('[car-reactions] carReactions', e); }
    try { var qs = await fb.db.collection('companies').doc(cid).collection('carQuotes').get(); qs.forEach(function (d) { var v = nNum((d.data() || {}).vin); if (v) byVin[v] = d.id; }); } catch (e) { console.warn('[car-reactions] carQuotes', e); }
    var learn = function (vin, km) { var c = km && byNum[km]; if (vin && c && !byVin[vin]) byVin[vin] = c.id; };
    parsed.forEach(function (p) { if (p.kind === 'map') p.pairs.forEach(function (x) { learn(x[0], x[1]); }); else if (p.cars) Object.keys(p.cars).forEach(function (k) { var x = p.cars[k]; learn(x.vin, x.km); }); });
    var vinOf = {}; Object.keys(byVin).forEach(function (v) { vinOf[byVin[v]] = v; });
    var docs = {}, miss = {};
    parsed.forEach(function (p) {
      if (p.kind === '?' || p.kind === 'map') return;
      Object.keys(p.cars).forEach(function (key) {
        var x = p.cars[key], car = x.km ? byNum[x.km] : null, id = car ? car.id : (x.vin && byVin[x.vin]) || null;
        if (!id) { miss[key] = 1; return; }
        if (!car) car = all.find(function (c) { return c && c.id === id; });
        var o = docs[id] = docs[id] || { num: car ? car.num : '', vin: vinOf[id] || '', goo: {}, cs: {} };
        if (p.kind === 'goo') Object.keys(x.d).forEach(function (d) { o.goo[d] = x.d[d]; });
        else o.cs[p.at] = x.v;
      });
    });
    var ids = Object.keys(docs);
    if (!ids.length) { status('CarFlow の車と1台も合いませんでした（管理番号・車台番号）', 'err'); return; }
    var gN = parsed.filter(function (p) { return p.kind === 'goo'; }), cN = parsed.filter(function (p) { return p.kind === 'cs'; });
    if (!gN.length && !cN.length) { status('グー・カーセンサーの CSV がありません（対応表だけでは取り込みません）', 'err'); return; }
    var msg = '反響を取り込みます：' + (gN.length ? 'グー ' + gN.map(function (p) { return p.month; }).join('・') + '（' + gN.reduce(function (s, p) { return s + Object.keys(p.cars).length; }, 0) + '行）' : '')
      + (cN.length ? (gN.length ? '／' : '') + 'カーセンサー ' + cN.map(function (p) { return p.at; }).join('・') + ' の控え' : '')
      + '\n合った車 ' + ids.length + '台' + (Object.keys(miss).length ? '・合わなかった行 ' + Object.keys(miss).length + '（CarFlow に無い車・管理番号が空など）' : '') + '\nよろしいですか？';
    if (typeof cfAsk === 'function' && !(await cfAsk(msg, { ok: '取り込む' }))) { status('取り込みをやめました'); return; }
    status('書き込み中…');
    try {
      var me = (window.fb && fb.currentUser && fb.currentUser.uid) || null, who = (typeof currentUser === 'string' && currentUser) || '';
      var ref = fb.db.collection('companies').doc(cid).collection('carReactions'), TS = firebase.firestore.FieldValue.serverTimestamp();
      for (var b = 0; b < ids.length; b += 200) {
        var batch = fb.db.batch();
        ids.slice(b, b + 200).forEach(function (id) { var o = docs[id]; batch.set(ref.doc(id), Object.assign({ num: o.num, goo: o.goo, cs: o.cs, updatedAt: TS, updatedBy: me, updatedByName: who }, o.vin ? { vin: o.vin } : {}), { merge: true }); });
        await batch.commit();
      }
    } catch (err) {
      console.error('[car-reactions] write', err); status('書き込めませんでした（通信または権限）', 'err'); toast('反響を取り込めませんでした', 'CF-1033'); return;
    }
    /* 記録：操作ログに1行（どのファイル・何台）。車のフローには書かない（毎週37台に行が増えるため） */
    var line = '反響を取り込み（' + parsed.filter(function (p) { return p.kind === 'goo' || p.kind === 'cs'; }).map(function (p) { return p.kind === 'goo' ? 'グー ' + p.month : 'カーセンサー ' + p.at; }).join('・') + '・' + ids.length + '台' + (Object.keys(miss).length ? '・合わない行 ' + Object.keys(miss).length : '') + '）';
    try { if (window.dbAudit && dbAudit.appendAuditLog) dbAudit.appendAuditLog({ time: (new Date().getMonth() + 1) + '/' + new Date().getDate(), at: Date.now(), userUid: me, user: who || '—', carNum: '—', action: line, carId: null }); } catch (e) {}
    status('取り込みました：' + ids.length + '台' + (Object.keys(miss).length ? '（合わなかった行 ' + Object.keys(miss).length + '）' : '') + (bad.length ? '・読めなかったファイル ' + bad.length : ''), 'ok');
    toast('反響を取り込みました（' + ids.length + '台）');
    try { if (window.CarQuote && CarQuote.setChanged) CarQuote.setChanged(null); } catch (e) {}
  }
  window.CarReactions = { pick: pick, importFiles: importFiles, _parseGoo: parseGoo, _parseCs: parseCs, _parseCsv: parseCsv, _parseMap: parseMap };
})();
