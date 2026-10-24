/* ============================================================
   🖼 カード詳細の［写真］タブ（v4.5.0）
   🗣 2026-10-23「見積で5枚とか使うじゃん？写真タブを設けて、必要になる分を入れられるように。入れやすく並び替えしやすい形で。
      どのアングルか指定してほしい。サムネとして使うのはその写真1番として、今の左上のサムネから変更できないように」
      →「10枚・角度は帳票と同じ10種」→「この見本の形で本番に入れて」（見本＝_記録\モック\モック_2026-10-23_カード詳細の写真タブ.html）
   🗣 2026-10-24「アングルの並びは固定にしたい。写真自体の並び替えを拒否するという意味でなくて、この枠にはこの画像という並びの固定」
      → v4.5.5 枠（1〜10番）ごとに角度が決まっている（ANG の順）。写真を別の枠へ動かすと、その枠の角度になる（入っている枠なら入れ替え）。
        空いた枠は詰めない（タイヤの写真が無ければ 9番は空きのまま）。角度を選ぶ欄は無くした
   ・car.photos＝[{ url, path, angle, at }]（10枚まで・枠の順に並べて保存）。サムネ＝car.photo＝入っている中で一番若い枠（ふつうは1番・外装 前）
   ・photos が無い車は car.photo を「1番・外装 前」として見せる（初めて直した時に photos を書く）
   ・見積の帳票は角度で写真を拾う（quote.js carPh）。その角度が無い時はサムネ
   ・記録：入れた・外した・動かした・入れ替えは、車のフローと操作ログに前→後で（addLog）。写真を外しても置き場のファイルは消さない（記録から戻せる）
   ============================================================ */
(function () {
  'use strict';
  /* 並び＝訴求力のある順（🗣 2026-10-23「訴求力のある写真の並びを調査して」→ 1 頭（斜め前）・2 運転席まわり（コックピットは2番目に見たい写真という調査）・3 後ろ・4 横・5 前の席・6 後ろの席・7 荷室・8 メーター・9 ナビ・10 タイヤ。新しく入れた写真の角度はこの順に付く） */
  /* v4.5.4 深掘りの結果で並べ直し（🗣 2026-10-23「調査のおすすめの並びに変えて」・業務ツール\車販\ポータル運用\調査_写真の並び_2026-10.md）
     ＝ポータルの一覧には 2〜4番も小さく並ぶ → 外装を続けない。中古車の人は状態（走行距離・運転席・座席）を見る → メーターを5番へ。横は最後 */
  /* v4.5.5 この順がそのまま枠（1番＝ANG[0]…10番＝ANG[9]） */
  var ANG = ['外装 前', '運転席まわり', '外装 後ろ', '前の席', 'メーター', '後ろの席', '荷室', 'ナビ・カメラ', 'タイヤ', '外装 横'];
  var MAX = 10;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function I(n, fb, px) { return (typeof ic === 'function') ? ic(n, fb, px || 15) : fb; }
  function curCar() { var id = (typeof activeDetailCarId !== 'undefined') ? activeDetailCarId : null; return id && typeof cars !== 'undefined' ? cars.find(function (c) { return c.id === id; }) : null; }
  function canEdit() { return typeof hasPermission !== 'function' || hasPermission('canEditCarInfo'); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /* この車の写真（photos が無い車は今の1枚を1番に） */
  function list(car) {
    if (!car) return [];
    if (Array.isArray(car.photos)) return car.photos.filter(function (p) { return p && p.url; }).slice(0, MAX);
    return car.photo ? [{ url: car.photo, angle: ANG[0] }] : [];
  }
  function count(car) { return list(car).length; }
  /* 枠に並べる：s[i]＝ANG[i] の写真（無ければ null）。角度が重なった・知らない角度の写真は extra（前の版で入れた物。どこかの枠へ動かすか外す） */
  function slotsOf(car) {
    var s = []; for (var i = 0; i < MAX; i++) s.push(null);
    var extra = [];
    list(car).forEach(function (p) { var k = ANG.indexOf(p.angle); if (k >= 0 && !s[k]) s[k] = p; else extra.push(p); });
    return { s: s, extra: extra };
  }
  /* 保存する形に戻す（枠の順・角度は枠の角度） */
  function pack(s, extra) {
    return s.map(function (p, i) { return p ? Object.assign({}, p, { angle: ANG[i] }) : null; }).filter(Boolean).concat(extra || []);
  }
  var busy = false, drag = null;   // drag＝{ k:'s'（枠）|'x'（余り）, i }

  /* 保存（photos と サムネ＝photo と記録を同じ1回で）。失敗したら画面を元に戻す */
  async function save(car, next, action) {
    var before = { photos: car.photos, photo: car.photo };
    car.photos = next.map(function (p) { return { url: p.url, path: p.path || '', angle: p.angle || ANG[0], at: p.at || '' }; });
    car.photo = car.photos[0] ? car.photos[0].url : '';
    if (typeof addLog === 'function') addLog(car.id, action);
    try {
      var fn = (window.dbCars && window.dbCars.saveCarPaths) || window.saveCarPaths;
      await fn(car.id, [{ path: ['photos'], value: car.photos }, { path: ['photo'], value: car.photo }, { path: ['logs'], value: car.logs }]);
    } catch (err) {
      console.error('[car-photos] save', err);
      car.photos = before.photos; car.photo = before.photo;
      if (typeof showToast === 'function') showToast('写真を保存できませんでした（通信または権限を確認してください）', 'CF-1029');
      redraw(car); return false;
    }
    redraw(car); return true;
  }
  function redraw(car) { if (typeof renderDetailBody === 'function') renderDetailBody(car); if (typeof renderAll === 'function') renderAll(); }
  function guard() { if (canEdit()) return true; if (typeof showToast === 'function') showToast('この操作はあなたの権限ではできません', 'CF-0027'); return false; }
  var nm = function (i) { return (i + 1) + '番・' + ANG[i]; };
  var thumbOf = function (s) { var k = s.findIndex(function (p) { return !!p; }); return k < 0 ? 'なし' : nm(k); };

  /* 入れる。target＝この枠から入れる（＋の枠・枠へ落とした時）。残りは空いている枠に若い順で。
     入っている枠へ落とした写真は、その枠の写真と入れ替える（前の写真は外れる・ファイルは残る） */
  var target = null;
  function pick(i) { if (!guard()) return; target = (typeof i === 'number' && i >= 0 && i < MAX) ? i : null; var f = document.getElementById('cph-inp'); if (f) { f.value = ''; f.click(); } }
  async function addFiles(files, at) {
    var car = curCar(); if (!car || busy || !guard()) return;
    if (typeof at !== 'number') { at = target; } target = null;
    files = Array.prototype.filter.call(files || [], function (f) { return /^image\//.test(f.type); });
    if (!files.length) return;
    var S = slotsOf(car), s = S.s.slice(), th0 = thumbOf(s);
    /* 入れる枠を決める：at（あれば・入っていても）→ 空いている枠を若い順 */
    var plan = []; if (at != null) plan.push(at);
    for (var j = 0; j < MAX; j++) if (!s[j] && plan.indexOf(j) < 0) plan.push(j);
    if (!plan.length) { if (typeof showToast === 'function') showToast('10枠とも入っています。外してから入れるか、入れたい枠へ落としてください'); return; }
    if (files.length > plan.length) { if (typeof showToast === 'function') showToast('空いている枠は ' + plan.length + '個なので、はじめの ' + plan.length + '枚だけ入れます'); files = files.slice(0, plan.length); }
    busy = true; if (typeof showToast === 'function') showToast('写真をアップロード中…（' + files.length + '枚）');
    var done = [], swapped = [];
    try {
      for (var i = 0; i < files.length; i++) {
        var r = await window.dbStorage.uploadCarPhotoN(car.id, files[i]);
        if (!r) throw new Error('upload');
        var k = plan[i]; if (s[k]) swapped.push(k);
        s[k] = { url: r.url, path: r.path, angle: ANG[k], at: today() }; done.push(k);
      }
    } catch (err) {
      console.error('[car-photos] upload', err);
      if (typeof showToast === 'function') showToast('写真のアップロードに失敗しました', 'CF-1026');
    }
    busy = false;
    if (!done.length) return;
    var th1 = thumbOf(s);
    var ok = await save(car, pack(s, S.extra), '写真を入れた（' + done.map(nm).join('・') + '）' + (swapped.length ? '＝' + swapped.map(nm).join('・') + 'は前の写真と入れ替え' : '') + (th0 !== th1 ? '＝サムネ ' + th0 + ' → ' + th1 : ''));
    if (ok && typeof showToast === 'function') showToast('写真を ' + done.length + '枚入れました');
  }
  /* 🗣 2026-10-23「Alrit の 車販 ▸ グーネット車両写真 から対応した KM 番号の物をいれて」＝選んだ写真で丸ごと入れ替える（files の順に 1番・2番…の枠）。
     今の写真のファイルは消さない（記録から戻せる）。車両詳細を開いていなくても使える（carId で） */
  async function replaceFor(carId, files, note) {
    var car = (typeof cars !== 'undefined' ? cars : []).find(function (c) { return c.id === carId; }); if (!car || busy || !guard()) return false;
    files = Array.prototype.filter.call(files || [], function (f) { return /^image\//.test(f.type); }).slice(0, MAX); if (!files.length) return false;
    busy = true; var added = [], before = list(car).length;
    try { for (var i = 0; i < files.length; i++) { var r = await window.dbStorage.uploadCarPhotoN(car.id, files[i]); if (!r) throw new Error('upload'); added.push({ url: r.url, path: r.path, angle: ANG[i] || ANG[0], at: today() }); } }
    catch (err) { console.error('[car-photos] replaceFor', err); busy = false; if (typeof showToast === 'function') showToast('写真のアップロードに失敗しました（' + (car.num || '') + '）', 'CF-1026'); return false; }
    busy = false;
    return await save(car, added, '写真を入れ替えた（' + before + '枚 → ' + added.length + '枚' + (note ? '・' + note : '') + '）＝1番 ' + added[0].angle + ' をサムネに');
  }
  /* 角度の順（ANG）に並べ直す（v4.5.4 で並びを変えた時に、入れてあった車をそろえる用・画面のボタンは無い）。ANG に無い角度は後ろに元の順のまま */
  async function sortByAngle(carId) {
    var car = (typeof cars !== 'undefined' ? cars : []).find(function (c) { return c.id === carId; }); if (!car || !guard()) return false;
    var cur = list(car), rank = function (p) { var r = ANG.indexOf(p.angle); return r < 0 ? ANG.length : r; };
    var next = cur.map(function (p, j) { return { p: p, j: j }; }).sort(function (a, b) { return rank(a.p) - rank(b.p) || a.j - b.j; }).map(function (x) { return x.p; });
    if (next.every(function (p, j) { return p === cur[j]; })) return true;
    return await save(car, next, '写真の並びを角度の順にそろえた（' + next.map(function (p) { return p.angle; }).join('・') + '）' + (next[0] !== cur[0] ? '＝サムネ ' + cur[0].angle + ' → ' + next[0].angle : ''));
  }
  /* 外す：その枠は空きになる（ほかの写真は動かない） */
  async function remove(i) {
    var car = curCar(); if (!car || !guard()) return; var S = slotsOf(car), s = S.s.slice(); if (!s[i]) return;
    var th0 = thumbOf(s);
    var ok = (typeof cfAsk === 'function') ? await cfAsk(nm(i) + 'の写真を外しますか？\n外した枠は空きになります（ほかの写真は動きません）。', { ok: '外す' }) : true;
    if (!ok) return;
    s[i] = null; var th1 = thumbOf(s);
    save(car, pack(s, S.extra), '写真を外した（' + nm(i) + '）' + (th0 !== th1 ? '＝サムネ ' + th0 + ' → ' + th1 : ''));
  }
  /* 余り（角度が重なった前の写真）を外す */
  async function removeExtra(j) {
    var car = curCar(); if (!car || !guard()) return; var S = slotsOf(car), x = S.extra[j]; if (!x) return;
    var ok = (typeof cfAsk === 'function') ? await cfAsk('枠に入っていない写真（' + (x.angle || '') + '）を外しますか？', { ok: '外す' }) : true;
    if (!ok) return;
    var ex = S.extra.slice(); ex.splice(j, 1);
    save(car, pack(S.s, ex), '写真を外した（枠の外・' + (x.angle || '') + '）');
  }
  /* 動かす：枠 from → 枠 to。to が入っていれば入れ替え。写真の角度は動いた先の枠の角度になる */
  function move(from, to) {
    var car = curCar(); if (!car || !guard()) return; var S = slotsOf(car), s = S.s.slice();
    if (from === to || from < 0 || to < 0 || from >= MAX || to >= MAX || !s[from]) return;
    var th0 = thumbOf(s), a = s[from], b = s[to]; s[to] = a; s[from] = b; var th1 = thumbOf(s);
    save(car, pack(s, S.extra), (b ? '写真を入れ替え（' + nm(from) + ' ⇄ ' + nm(to) + '）' : '写真を動かした（' + nm(from) + ' → ' + nm(to) + '）') + (th0 !== th1 ? '＝サムネ ' + th0 + ' → ' + th1 : ''));
  }
  /* 余りの写真を枠へ（入っていれば、その枠の写真が余りへ） */
  function moveExtra(j, to) {
    var car = curCar(); if (!car || !guard()) return; var S = slotsOf(car), s = S.s.slice(), ex = S.extra.slice(), x = ex[j];
    if (!x || to < 0 || to >= MAX) return;
    var th0 = thumbOf(s), b = s[to]; s[to] = x; ex.splice(j, 1); if (b) ex.push(b); var th1 = thumbOf(s);
    save(car, pack(s, ex), '写真を枠へ（枠の外・' + (x.angle || '') + ' → ' + nm(to) + '）' + (b ? '＝前の写真は枠の外へ' : '') + (th0 !== th1 ? '＝サムネ ' + th0 + ' → ' + th1 : ''));
  }
  /* ドラッグ（パソコン）。スマホ・タブレットは ◀ ▶（となりの枠と入れ替え） */
  function dStart(ev, i, k) { drag = { k: k || 's', i: i }; try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(i)); } catch (e) {} ev.currentTarget.classList.add('drag'); }
  function dEnd(ev) { drag = null; ev.currentTarget.classList.remove('drag'); document.querySelectorAll('.cph-slot.over,.cph-drop.over').forEach(function (x) { x.classList.remove('over'); }); }
  function dOver(ev) { var files = ev.dataTransfer && Array.prototype.indexOf.call(ev.dataTransfer.types || [], 'Files') >= 0; if (drag == null && !files) return; ev.preventDefault(); ev.currentTarget.classList.add('over'); }
  function dLeave(ev) { ev.currentTarget.classList.remove('over'); }
  function dDrop(ev, i) {
    ev.preventDefault(); ev.currentTarget.classList.remove('over');
    if (drag == null) { if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length) addFiles(ev.dataTransfer.files, i >= 0 && i < MAX ? i : null); return; }
    var d = drag; drag = null; if (!(i >= 0 && i < MAX)) return;
    if (d.k === 'x') moveExtra(d.i, i); else move(d.i, i);
  }
  function zoom(i, k) { var S = slotsOf(curCar()), p = k === 'x' ? S.extra[i] : S.s[i]; if (p && typeof openImagePreview === 'function') openImagePreview(p.url); }

  /* タブの中身：10枠（枠の角度は固定） */
  function panel(car) {
    var S = slotsOf(car), s = S.s, ed = canEdit(), th = s.findIndex(function (p) { return !!p; });
    var slots = '';
    for (var i = 0; i < MAX; i++) {
      var p = s[i], use = (i === th ? 'カード・一覧・見積の表紙・' : '') + '帳票の「' + esc(ANG[i]) + '」';
      var dropAttr = ' ondragover="CarPhotos.dOver(event)" ondragleave="CarPhotos.dLeave(event)" ondrop="CarPhotos.dDrop(event,' + i + ')"';
      var head = '<span class="cph-no">' + (i + 1) + (i === th ? ' サムネ' : '') + '</span>';
      if (p) {
        slots += '<div class="cph-slot' + (i === th ? ' first' : '') + '"' + (ed ? ' draggable="true" ondragstart="CarPhotos.dStart(event,' + i + ')" ondragend="CarPhotos.dEnd(event)"' : '') + dropAttr + '>'
          + '<div class="cph-img" onclick="CarPhotos.zoom(' + i + ')" title="クリックで大きく表示"><img src="' + esc(p.url) + '" alt="" loading="lazy">' + head
          + (ed ? '<button class="cph-x" title="この写真を外す" onclick="event.stopPropagation();CarPhotos.remove(' + i + ')">✕</button>' : '') + '</div>'
          + '<div class="cph-ft"><b class="cph-ang">' + esc(ANG[i]) + '</b>'
          + (ed ? '<span class="cph-mv"><button title="前の枠と入れ替え" onclick="CarPhotos.move(' + i + ',' + (i - 1) + ')"' + (i === 0 ? ' disabled' : '') + '>◀</button><button title="後ろの枠と入れ替え" onclick="CarPhotos.move(' + i + ',' + (i + 1) + ')"' + (i === MAX - 1 ? ' disabled' : '') + '>▶</button></span>' : '')
          + '<div class="cph-use">' + use + '</div></div></div>';
      } else {
        slots += '<div class="cph-slot empty"' + dropAttr + '>'
          + '<div class="cph-img">' + (ed ? '<div class="cph-add" onclick="CarPhotos.pick(' + i + ')"><b>＋</b>' + esc(ANG[i]) + '</div>' : '<div class="cph-add off">' + esc(ANG[i]) + '</div>') + head + '</div>'
          + '<div class="cph-ft"><b class="cph-ang">' + esc(ANG[i]) + '</b><div class="cph-use">空き</div></div></div>';
      }
    }
    var extra = S.extra.map(function (p, j) {
      return '<div class="cph-slot extra"' + (ed ? ' draggable="true" ondragstart="CarPhotos.dStart(event,' + j + ',\'x\')" ondragend="CarPhotos.dEnd(event)"' : '') + '>'
        + '<div class="cph-img" onclick="CarPhotos.zoom(' + j + ',\'x\')" title="クリックで大きく表示"><img src="' + esc(p.url) + '" alt="" loading="lazy"><span class="cph-no">枠の外</span>'
        + (ed ? '<button class="cph-x" title="この写真を外す" onclick="event.stopPropagation();CarPhotos.removeExtra(' + j + ')">✕</button>' : '') + '</div>'
        + '<div class="cph-ft"><div class="cph-use">' + esc(p.angle || '') + '（同じ角度が2枚）</div></div></div>';
    }).join('');
    return '<div class="cph">'
      + (ed ? '<div class="cph-bar"><button class="btn-sm btn-primary" onclick="CarPhotos.pick()">' + I('plus', '＋', 14) + ' 写真をまとめて入れる</button><span class="cph-sub">枠ごとに角度が決まっています。選んだ写真は空いている枠に若い順で入ります。写真を別の枠へドラッグ（◀ ▶）すると、その枠の角度になります（入っている枠とは入れ替え）</span>'
        + '<input type="file" id="cph-inp" accept="image/*" multiple style="display:none" onchange="CarPhotos.addFiles(this.files)"></div>' : '<div class="cph-sub" style="margin-bottom:8px">見るだけです（写真を直せるのは車両情報を直せる人）</div>')
      + '<div class="cph-grid">' + slots + '</div>'
      + (extra ? '<div class="cph-extra"><div class="cph-sub">枠の外の写真（前の版で同じ角度に2枚入っていた物）。使うなら枠へドラッグ、要らなければ ✕</div><div class="cph-grid">' + extra + '</div></div>' : '')
      + (ed ? '<div class="cph-drop" ondragover="CarPhotos.dOver(event)" ondragleave="CarPhotos.dLeave(event)" ondrop="CarPhotos.dDrop(event,99)">ここに写真をまとめて落としても、空いている枠に入ります（パソコン）。決まった枠に入れる時は、その枠へ落とす。スマホは「まとめて入れる」か枠の＋</div>' : '')
      + '<div class="cph-note"><b>見積の帳票の写真</b>：帳票の置き場（外装 前・横・後ろ・運転席まわり など）は、<b>同じ角度の枠の写真</b>を使います。その枠が空きの時は<b>サムネの写真</b>。<br>'
      + '<b>サムネ</b>は1番（外装 前）の写真。カードのサムネ・一覧・見積の表紙に使います。1番が空きの時は、入っている中で一番若い枠の写真。左上のサムネでは変えられません。</div></div>';
  }

  window.CarPhotos = { ANG: ANG, list: list, count: count, panel: panel, pick: pick, addFiles: addFiles, replaceFor: replaceFor, sortByAngle: sortByAngle, remove: remove, removeExtra: removeExtra, move: move, moveExtra: moveExtra,
    dStart: dStart, dEnd: dEnd, dOver: dOver, dLeave: dLeave, dDrop: dDrop, zoom: zoom };
})();
