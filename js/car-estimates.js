/* ========================================
   car-estimates.js ─ 車ごとの見積もりPDF（価格履歴）CarFlow v3.5.0
   ----------------------------------------
   ◎きっかけ（2026-09-29 ゆうた）
     🗣「各カードに最新の見積もりPDFを添付したい
     　　ヘッダーの走行距離BOXの横にでも書類アイコンでクリックでそのままPDF展開閲覧、印刷も可能
     　　下のタスクが入ってる方のタブに価格履歴を新設する　そこにPDFドラッグで登録される
     　　また最新以外のPDFに関してはこのタブ内に一覧で登録順にアーカイブされてるイメージ」

   ◎v3.5.1 登録の時に理由を選ぶ（初稿／見積内容更新／月次プライス改定／値下げ／その他＝自由記入）。
     一覧は表（No.・日付・理由・人・ファイル・サイズ）。ファイル名は出さない（「開く」に乗せると出る）

   ◎置き場
     PDF 本体＝ファイル置き場（Firebase Storage）companies/{会社}/cars/{車id}/estimates/{時刻}_{乱数}.pdf
               ⚠ 置けるのは 10MB まで・PDF だけ（_ルール\storage.rules の companies/** がそう決めている）
     一覧     ＝ 車の estimates（配列・登録順）。1件＝{ id, name, url, path, size, at, by, byName, reason, reasonNote? }
               🔴 足す時は arrayUnion で「足すだけ」を送る＝別の端末が同時に足しても消し合わない
     最新     ＝ 配列の最後。帯（走行距離の横）の📄はこれを開く

   ◎見る・印刷する
     アプリの上に重ねて開く（ブラウザの PDF 表示＝そのまま印刷ボタンが使える）。
     念のため「新しいタブで開く」も置く（ブラウザによって重ねた表示で印刷できない時の逃げ道）。

   ⚠ 消す操作は作っていない（まだ頼まれていない）。間違えて入れた時は新しいのを入れれば最新が替わる。
   ⚠ PC・タブレットのカード詳細（car-detail-v3.js）だけ。スマホ・1カラム表示には出していない。
   ======================================== */
(function () {
  'use strict';

  var MAX = 10 * 1024 * 1024;
  var busy = {};   /* 車id → 送っている最中 */

  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s == null ? '' : s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function I(name, fb, px) { return (typeof ic === 'function') ? ic(name, fb, px || 15) : fb; }
  function toast(m, code) { if (typeof showToast === 'function') showToast(m, code); }
  function list(car) { return (car && Array.isArray(car.estimates)) ? car.estimates : []; }
  function latest(car) { var l = list(car); return l.length ? l[l.length - 1] : null; }
  function findCar(id) {
    var c = null;
    if (typeof cars !== 'undefined' && Array.isArray(cars)) c = cars.find(function (x) { return x && x.id === id; });
    if (!c && typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) c = archivedCars.find(function (x) { return x && x.id === id; });
    return c;
  }
  function ymdhm(ms) {
    var d = new Date(ms || 0), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round((n || 0) / 1024)) + 'KB'; }
  function myName() {
    var m = window.fb && window.fb.currentMember;
    if (window.CFUser) return window.CFUser.fullName(m, window.fb && window.fb.currentUser);
    return (m && m.name) || '';
  }
  function redraw() {
    if (window.CarDetailV3 && typeof window.CarDetailV3.redraw === 'function') window.CarDetailV3.redraw();
  }

  /* ---------- 帯（走行距離の横）の📄 ---------- */
  function bandCell(car) {
    var e = latest(car);
    if (!e) return '';
    return '<button type="button" class="cd3-est" onclick="CarEstimates.open(\'' + esc(car.id) + '\')" title="最新の見積もりを開く（' + esc(e.name) + '）">'
      + '<span class="k">見積</span><span class="v">' + I('estimate', '📄', 16) + ' 開く</span></button>';
  }

  /* ---------- 登録の理由（v3.5.1 ゆうた指定） ----------
     🗣「理由に関してはUP時にて選択する感じにする」
     ⚠ 並びと言葉はこの1か所。増やす時はここに足すだけ（保存は言葉そのもの＝reason）。
       「その他」だけは自由に書ける（reasonNote）。 */
  var REASONS = ['初稿', '見積内容更新', '月次プライス改定', '値下げ', 'その他'];
  function reasonText(e) {
    if (!e || !e.reason) return '—';
    return e.reason === 'その他' && e.reasonNote ? 'その他：' + e.reasonNote : e.reason;
  }

  /* ---------- 右のタブ［価格履歴］ ----------
     🗣「アーカイブはファイルネームは出さなくていいからもっとアーカイブ情報をメインに
     　　ナンバー 日付 理由 人 ファイル サイズ」＝表にした（ファイル名は「開く」の上に乗せるだけ） */
  function head() {
    return '<div class="est-tr est-th"><span>No.</span><span>日付</span><span>理由</span><span>人</span><span>ファイル</span><span class="r">サイズ</span></div>';
  }
  function row(car, e, idx, isNew) {
    return '<div class="est-tr' + (isNew ? ' new' : '') + '">'
      + '<span class="est-no">' + (idx + 1) + (isNew ? '<span class="est-badge">最新</span>' : '') + '</span>'
      + '<span class="est-dt">' + ymdhm(e.at) + '</span>'
      + '<span class="est-rs" title="' + esc(reasonText(e)) + '">' + esc(reasonText(e)) + '</span>'
      + '<span class="est-by">' + esc(e.byName || '—') + '</span>'
      + '<span><button type="button" class="est-btn" title="' + esc(e.name) + '" onclick="CarEstimates.open(\'' + esc(car.id) + '\',\'' + esc(e.id) + '\')">' + I('fileText', '📄', 14) + ' 開く</button></span>'
      + '<span class="r est-sz">' + (e.size ? kb(e.size) : '—') + '</span>'
      + '</div>';
  }
  function panel(car) {
    var L = list(car), e = latest(car), up = !!busy[car.id];
    var h = '<div class="est-drop' + (up ? ' busy' : '') + '" id="est-drop" data-car="' + esc(car.id) + '"'
      + ' ondragover="CarEstimates.over(event)" ondragleave="CarEstimates.leave(event)" ondrop="CarEstimates.drop(event,\'' + esc(car.id) + '\')">'
      + '<div class="est-drop-ic">' + I('upload', '⬆', 22) + '</div>'
      + '<div class="est-drop-t">' + (up ? '登録しています…' : '見積もりの PDF をここへドラッグ') + '</div>'
      + '<div class="est-drop-s">または <label class="est-pick">ファイルを選ぶ<input type="file" accept="application/pdf,.pdf" onchange="CarEstimates.pick(this,\'' + esc(car.id) + '\')"></label>（PDF・10MBまで）</div>'
      + '</div>';
    if (!e) return h + '<div class="est-empty">まだ見積もりが登録されていません</div>';
    h += '<div class="cd3-lab">最新の見積もり</div><div class="est-tbl">' + head() + row(car, e, L.length - 1, true) + '</div>';
    if (L.length > 1) {
      h += '<div class="cd3-lab" style="margin-top:14px">これまでの見積もり（登録順）</div><div class="est-tbl">' + head();
      for (var i = 0; i < L.length - 1; i++) h += row(car, L[i], i, false);
      h += '</div>';
    }
    return h;
  }

  /* ---------- 登録 ---------- */
  function add(carId, file) {
    var car = findCar(carId);
    if (!car || !file) return;
    if (busy[carId]) return toast('いま登録しています。終わってからもう一度');
    var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (!isPdf) return toast('PDF だけ登録できます', 'CF-1010');
    if (file.size > MAX) return toast('PDF が大きすぎます（10MBまで）', 'CF-1011');
    var cid = window.fb && window.fb.currentCompanyId, st = window.fb && window.fb.storage;
    if (!cid || !st) return toast('ファイル置き場につながっていません', 'CF-1012');
    askReason(car, file, function (reason, note) { upload(car, file, reason, note); });
  }

  /* 理由を選ぶ小さな窓。選ぶまで［登録］は押せない。「その他」は一言書くまで押せない。
     初めての1枚だけ「初稿」を最初から選んでおく。 */
  var ASK = null;
  function askReason(car, file, done) {
    closeAsk();
    ASK = { done: done, reason: list(car).length ? '' : '初稿' };
    var ov = document.createElement('div');
    ov.id = 'est-ask';
    ov.className = 'est-viewer est-ask-ov';
    ov.innerHTML = '<div class="est-ask">'
      + '<div class="est-ask-h">' + I('estimate', '📄', 16) + ' 見積もりを登録</div>'
      + '<div class="est-ask-f" title="' + esc(file.name) + '">' + I('fileText', '📄', 14) + ' ' + esc(file.name) + '<span>' + kb(file.size) + '</span></div>'
      + '<div class="est-ask-l">登録の理由</div>'
      + '<div class="est-ask-rs">' + REASONS.map(function (r) {
          return '<label class="est-ask-r"><input type="radio" name="est-rs" value="' + esc(r) + '"' + (r === ASK.reason ? ' checked' : '') + ' onchange="CarEstimates._rs(this.value)"> ' + esc(r) + '</label>';
        }).join('') + '</div>'
      + '<input type="text" id="est-ask-note" class="est-ask-note" maxlength="60" placeholder="その他の理由（例：オプション追加）" oninput="CarEstimates._rs()" style="display:none">'
      + '<div class="est-ask-b"><button type="button" class="est-v-btn" onclick="CarEstimates._ask(false)">やめる</button>'
      + '<button type="button" class="est-v-btn pri" id="est-ask-ok" onclick="CarEstimates._ask(true)">' + I('upload', '⬆', 14) + ' 登録する</button></div>'
      + '</div>';
    ov.addEventListener('click', function (ev) { if (ev.target === ov) closeAsk(); });
    document.body.appendChild(ov);
    askSync();
  }
  function askSync() {
    if (!ASK) return;
    var note = document.getElementById('est-ask-note'), ok = document.getElementById('est-ask-ok');
    var other = ASK.reason === 'その他';
    if (note) note.style.display = other ? '' : 'none';
    var can = !!ASK.reason && (!other || !!(note && note.value.trim()));
    if (ok) ok.disabled = !can;
  }
  function closeAsk() { var o = document.getElementById('est-ask'); if (o) o.remove(); ASK = null; }

  function upload(car, file, reason, note) {
    var carId = car.id;
    var cid = window.fb.currentCompanyId, st = window.fb.storage;
    var id = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    var path = 'companies/' + cid + '/cars/' + carId + '/estimates/' + id + '.pdf';
    var ref = st.ref(path);
    busy[carId] = true; redraw();
    ref.put(file, { contentType: 'application/pdf' })
      .then(function () { return ref.getDownloadURL(); })
      .then(function (url) {
        var e = { id: id, name: String(file.name || '見積もり.pdf').slice(0, 120), url: url, path: path, size: file.size || 0,
                  at: Date.now(), by: (window.fb.currentUser && window.fb.currentUser.uid) || '', byName: myName(),
                  reason: reason };
        if (reason === 'その他' && note) e.reasonNote = String(note).slice(0, 60);
        if (!Array.isArray(car.estimates)) car.estimates = [];
        car.estimates.push(e);
        /* 🔴 足すだけを送る（arrayUnion）＝同時に別の端末が足しても消し合わない */
        var FV = window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue;
        var p = (window.dbCars && window.dbCars.saveCarField && FV)
          ? window.dbCars.saveCarField(carId, ['estimates'], FV.arrayUnion(e)) : Promise.resolve();
        if (typeof addLog === 'function') addLog(carId, '見積もりPDFを登録（' + reasonText(e) + '）');
        return p;
      })
      .then(function () { toast('見積もりを登録しました'); })
      .catch(function (err) {
        console.error('[car-estimates] 登録に失敗', err);
        toast('見積もりを登録できませんでした', 'CF-1013');
      })
      .then(function () { busy[carId] = false; redraw(); });
  }

  /* ---------- 見る（アプリの上に重ねる） ---------- */
  function open(carId, estId) {
    var car = findCar(carId); if (!car) return;
    var e = estId ? list(car).find(function (x) { return x.id === estId; }) : latest(car);
    if (!e || !e.url) return;
    close();
    var ov = document.createElement('div');
    ov.id = 'est-viewer';
    ov.className = 'est-viewer';
    ov.innerHTML = '<div class="est-v-bar"><span class="est-v-t">' + I('fileText', '📄', 16) + ' ' + esc(e.name) + '<span class="est-v-s">' + ymdhm(e.at) + (e.byName ? '　' + esc(e.byName) : '') + '</span></span>'
      + '<a class="est-v-btn" href="' + esc(e.url) + '" target="_blank" rel="noopener">' + I('external', '↗', 14) + ' 新しいタブで開く</a>'
      + '<button type="button" class="est-v-btn" onclick="CarEstimates.close()">' + I('close', '✕', 14) + ' 閉じる</button></div>'
      + '<iframe class="est-v-frame" src="' + esc(e.url) + '" title="見積もり"></iframe>';
    ov.addEventListener('click', function (ev) { if (ev.target === ov) close(); });
    document.body.appendChild(ov);
    document.addEventListener('keydown', onKey);
  }
  function onKey(ev) { if (ev.key === 'Escape') close(); }
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && ASK) closeAsk(); });
  function close() {
    var ov = document.getElementById('est-viewer');
    if (ov) ov.remove();
    document.removeEventListener('keydown', onKey);
  }

  window.CarEstimates = {
    bandCell: bandCell,
    panel: panel,
    count: function (car) { return list(car).length; },
    open: open,
    close: close,
    REASONS: REASONS,
    _rs: function (v) { if (!ASK) return; if (v) ASK.reason = v; askSync(); },
    _ask: function (go) {
      if (!ASK) return;
      var note = document.getElementById('est-ask-note');
      var r = ASK.reason, n = note ? note.value.trim() : '', done = ASK.done;
      if (go && (!r || (r === 'その他' && !n))) return;
      closeAsk();
      if (go) done(r, n);
    },
    pick: function (inp, carId) { var f = inp.files && inp.files[0]; inp.value = ''; add(carId, f); },
    over: function (ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; var d = document.getElementById('est-drop'); if (d) d.classList.add('over'); },
    leave: function () { var d = document.getElementById('est-drop'); if (d) d.classList.remove('over'); },
    drop: function (ev, carId) {
      ev.preventDefault();
      var d = document.getElementById('est-drop'); if (d) d.classList.remove('over');
      var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      add(carId, f);
    }
  };
})();
