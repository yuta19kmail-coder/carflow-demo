/* ============================================================
   🖼 カード詳細の［写真］タブ（v4.5.0）
   🗣 2026-10-23「見積で5枚とか使うじゃん？写真タブを設けて、必要になる分を入れられるように。入れやすく並び替えしやすい形で。
      どのアングルか指定してほしい。サムネとして使うのはその写真1番として、今の左上のサムネから変更できないように」
      →「10枚・角度は帳票と同じ10種」→「この見本の形で本番に入れて」（見本＝_記録\モック\モック_2026-10-23_カード詳細の写真タブ.html）
   ・car.photos＝[{ url, path, angle, at }]（10枚まで）。1番＝サムネ＝car.photo にも同じ住所を入れる（カンバン・一覧・見積など今までの所はそのまま）
   ・photos が無い車は car.photo を「1番・外装 前」として見せる（初めて直した時に photos を書く）
   ・見積の帳票は角度で写真を拾う（quote.js carPh）。その角度が無い時は1番
   ・記録：入れた・外した・並べ替え・角度の変更は、車のフローと操作ログに前→後で（addLog）。写真を外しても置き場のファイルは消さない（記録から戻せる）
   ============================================================ */
(function () {
  'use strict';
  /* 並び＝訴求力のある順（🗣 2026-10-23「訴求力のある写真の並びを調査して」→ 1 頭（斜め前）・2 運転席まわり（コックピットは2番目に見たい写真という調査）・3 後ろ・4 横・5 前の席・6 後ろの席・7 荷室・8 メーター・9 ナビ・10 タイヤ。新しく入れた写真の角度はこの順に付く） */
  /* v4.5.4 深掘りの結果で並べ直し（🗣 2026-10-23「調査のおすすめの並びに変えて」・業務ツール\車販\ポータル運用\調査_写真の並び_2026-10.md）
     ＝ポータルの一覧には 2〜4番も小さく並ぶ → 外装を続けない。中古車の人は状態（走行距離・運転席・座席）を見る → メーターを5番へ。横は最後 */
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
  var busy = false, dragI = null;

  /* 保存（photos と 1番＝photo と記録を同じ1回で）。失敗したら画面を元に戻す */
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
  var nm = function (i, p) { return (i + 1) + '番・' + (p.angle || ANG[0]); };

  /* 入れる（まとめて）。空いている枠に順に・角度はまだ使っていない物から */
  function pick() { if (!guard()) return; var f = document.getElementById('cph-inp'); if (f) { f.value = ''; f.click(); } }
  async function addFiles(files) {
    var car = curCar(); if (!car || busy || !guard()) return;
    files = Array.prototype.filter.call(files || [], function (f) { return /^image\//.test(f.type); });
    if (!files.length) return;
    var cur = list(car), room = MAX - cur.length;
    if (room <= 0) { if (typeof showToast === 'function') showToast('写真は10枚までです。外してから入れてください'); return; }
    if (files.length > room) { if (typeof showToast === 'function') showToast('10枚までなので、はじめの ' + room + '枚だけ入れます'); files = files.slice(0, room); }
    busy = true; if (typeof showToast === 'function') showToast('写真をアップロード中…（' + files.length + '枚）');
    var added = [];
    try {
      for (var i = 0; i < files.length; i++) {
        var r = await window.dbStorage.uploadCarPhotoN(car.id, files[i]);
        if (!r) throw new Error('upload');
        var used = cur.concat(added).map(function (p) { return p.angle; });
        var a = ANG.find(function (x) { return used.indexOf(x) < 0; }) || ANG[0];
        added.push({ url: r.url, path: r.path, angle: a, at: today() });
      }
    } catch (err) {
      console.error('[car-photos] upload', err);
      if (typeof showToast === 'function') showToast('写真のアップロードに失敗しました', 'CF-1026');
    }
    busy = false;
    if (!added.length) return;
    var next = cur.concat(added);
    var ok = await save(car, next, '写真を入れた（' + added.map(function (p, j) { return nm(cur.length + j, p); }).join('・') + '）' + (cur.length === 0 ? '＝1番をサムネに' : ''));
    if (ok && typeof showToast === 'function') showToast('写真を ' + added.length + '枚入れました');
  }
  /* 🗣 2026-10-23「Alrit の 車販 ▸ グーネット車両写真 から対応した KM 番号の物をいれて」＝選んだ写真で丸ごと入れ替える（角度は files の順に ANG の順）。
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
  async function remove(i) {
    var car = curCar(); if (!car || !guard()) return; var cur = list(car); if (!cur[i]) return;
    var ok = (typeof cfAsk === 'function') ? await cfAsk((i + 1) + '番の写真（' + (cur[i].angle || '') + '）を外しますか？' + (i === 0 ? '\n1番を外すと、2番の写真がサムネになります。' : ''), { ok: '外す' }) : true;
    if (!ok) return;
    var next = cur.slice(); var gone = next.splice(i, 1)[0];
    save(car, next, '写真を外した（' + nm(i, gone) + '）' + (i === 0 ? '＝サムネ ' + (next[0] ? '→ ' + next[0].angle : '→ なし') : ''));
  }
  function move(from, to) {
    var car = curCar(); if (!car || !guard()) return; var cur = list(car);
    if (from === to || from < 0 || to < 0 || from >= cur.length || to >= cur.length) return;
    var next = cur.slice(), x = next.splice(from, 1)[0]; next.splice(to, 0, x);
    save(car, next, '写真の並びを変更（' + nm(from, x) + ' → ' + (to + 1) + '番）' + (to === 0 || from === 0 ? '＝サムネ ' + cur[0].angle + ' → ' + next[0].angle : ''));
  }
  function angle(i, a) {
    var car = curCar(); if (!car || !guard()) return; var cur = list(car); if (!cur[i] || cur[i].angle === a) return;
    var next = cur.map(function (p, j) { return j === i ? Object.assign({}, p, { angle: a }) : p; });
    save(car, next, '写真の角度を変更（' + (i + 1) + '番：' + cur[i].angle + ' → ' + a + '）');
  }
  /* ドラッグ（パソコン）。スマホ・タブレットは ◀ ▶ */
  function dStart(ev, i) { dragI = i; try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(i)); } catch (e) {} ev.currentTarget.classList.add('drag'); }
  function dEnd(ev) { dragI = null; ev.currentTarget.classList.remove('drag'); document.querySelectorAll('.cph-slot.over').forEach(function (x) { x.classList.remove('over'); }); }
  function dOver(ev) { var files = ev.dataTransfer && Array.prototype.indexOf.call(ev.dataTransfer.types || [], 'Files') >= 0; if (dragI == null && !files) return; ev.preventDefault(); ev.currentTarget.classList.add('over'); }
  function dLeave(ev) { ev.currentTarget.classList.remove('over'); }
  function dDrop(ev, i) {
    ev.preventDefault(); ev.currentTarget.classList.remove('over');
    if (dragI == null) { if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length) addFiles(ev.dataTransfer.files); return; }
    var from = dragI; dragI = null; var n = count(curCar()); move(from, Math.min(i, n - 1));
  }
  function zoom(i) { var c = curCar(), p = list(c)[i]; if (p && typeof openImagePreview === 'function') openImagePreview(p.url); }

  /* タブの中身 */
  function panel(car) {
    var cur = list(car), ed = canEdit(), used = {};
    cur.forEach(function (p, i) { if (used[p.angle] == null) used[p.angle] = i; });
    var slots = '';
    for (var i = 0; i < MAX; i++) {
      var p = cur[i];
      if (p) {
        slots += '<div class="cph-slot' + (i === 0 ? ' first' : '') + '"' + (ed ? ' draggable="true" ondragstart="CarPhotos.dStart(event,' + i + ')" ondragend="CarPhotos.dEnd(event)"' : '') + ' ondragover="CarPhotos.dOver(event)" ondragleave="CarPhotos.dLeave(event)" ondrop="CarPhotos.dDrop(event,' + i + ')">'
          + '<div class="cph-img" onclick="CarPhotos.zoom(' + i + ')" title="クリックで大きく表示"><img src="' + esc(p.url) + '" alt="" loading="lazy"><span class="cph-no">' + (i + 1) + (i === 0 ? ' サムネ' : '') + '</span>'
          + (ed ? '<button class="cph-x" title="この写真を外す" onclick="event.stopPropagation();CarPhotos.remove(' + i + ')">✕</button>' : '') + '</div>'
          + '<div class="cph-ft">' + (ed ? '<select onchange="CarPhotos.angle(' + i + ',this.value)">' + ANG.map(function (a) { return '<option' + (a === p.angle ? ' selected' : '') + '>' + a + '</option>'; }).join('') + '</select>' : '<b>' + esc(p.angle) + '</b>')
          + (ed ? '<span class="cph-mv"><button title="前へ" onclick="CarPhotos.move(' + i + ',' + (i - 1) + ')"' + (i === 0 ? ' disabled' : '') + '>◀</button><button title="後ろへ" onclick="CarPhotos.move(' + i + ',' + (i + 1) + ')"' + (i === cur.length - 1 ? ' disabled' : '') + '>▶</button></span>' : '')
          + '<div class="cph-use">' + (i === 0 ? 'カード・一覧・見積の表紙' : '') + (used[p.angle] === i ? (i === 0 ? '・' : '') + '帳票の「' + esc(p.angle) + '」' : '<span class="dup">' + esc(p.angle) + 'は ' + (used[p.angle] + 1) + '番を使う</span>') + '</div></div></div>';
      } else {
        slots += '<div class="cph-slot empty" ondragover="CarPhotos.dOver(event)" ondragleave="CarPhotos.dLeave(event)" ondrop="CarPhotos.dDrop(event,' + i + ')">'
          + '<div class="cph-img">' + (ed ? '<div class="cph-add" onclick="CarPhotos.pick()"><b>＋</b>' + (i + 1) + '番の写真</div>' : '<div class="cph-add off">' + (i + 1) + '番</div>') + '</div><div class="cph-ft"><div class="cph-use">空き</div></div></div>';
      }
    }
    return '<div class="cph">'
      + (ed ? '<div class="cph-bar"><button class="btn-sm btn-primary" onclick="CarPhotos.pick()">' + I('plus', '＋', 14) + ' 写真をまとめて入れる</button><span class="cph-sub">選んだ写真が、空いている枠に順に入ります（10枚まで）。ドラッグか ◀ ▶ で並べ替え・角度は写真の下で選ぶ</span>'
        + '<input type="file" id="cph-inp" accept="image/*" multiple style="display:none" onchange="CarPhotos.addFiles(this.files)"></div>' : '<div class="cph-sub" style="margin-bottom:8px">見るだけです（写真を直せるのは車両情報を直せる人）</div>')
      + '<div class="cph-grid">' + slots + '</div>'
      + (ed ? '<div class="cph-drop" ondragover="CarPhotos.dOver(event)" ondragleave="CarPhotos.dLeave(event)" ondrop="CarPhotos.dDrop(event,99)">ここに写真をまとめて落としても入ります（パソコン）。スマホは「まとめて入れる」でカメラか写真から</div>' : '')
      + '<div class="cph-note"><b>見積の帳票の写真</b>：帳票の置き場（外装 前・横・後ろ・運転席まわり など）は、<b>同じ角度の写真</b>を使います。その角度が無い時は<b>1番の写真</b>。同じ角度が2枚ある時は番号の若い方。<br>'
      + '<b>1番</b>は、カードのサムネ・一覧・見積の表紙。1番を変える時は、ほかの写真を1番の枠へ（左上のサムネでは変えられません）。</div></div>';
  }

  window.CarPhotos = { ANG: ANG, list: list, count: count, panel: panel, pick: pick, addFiles: addFiles, replaceFor: replaceFor, sortByAngle: sortByAngle, remove: remove, move: move, angle: angle,
    dStart: dStart, dEnd: dEnd, dOver: dOver, dLeave: dLeave, dDrop: dDrop, zoom: zoom };
})();
