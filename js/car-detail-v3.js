/* ========================================
   car-detail-v3.js  ─  カード詳細 v3.0（PC・タブレット向け）CarFlow v3.0.0
   ----------------------------------------
   ◎なにをするもの（2026-09-25 ゆうた）
     🗣「スマホでもギリ可読性があるようにと1カラム表示をしていたが　PC（ないし、タブレット）に割り切って　効率的な表示を目指したい」
     ＝ カード詳細を **全画面に近い大きさ** にして、
        上＝車の帯（写真・メーカー 車種 グレード・情報の箱・日数・金額・お客様名）
        下の左＝タブ［メモ・付箋］［フロー］／下の右＝タブ［売約後タスク］［装備詳細］（隙間）［展示フェーズ］
     モック＝ ..\資料\モック\モック_v3.0_カード詳細_2カラム_2026-09-25.html
     1枚   ＝ ..\..\_記録\v3.0_カード詳細_計画と進捗.md

   🔴 **見た目と並べ方だけ。保存するデータは変えていない。**
      ・大タスクの行は car-detail.js の `_detailTaskItemsHtml`（v2.64.0 の中身そのまま）を呼んでいる。押した時の動きも今までどおり
      ・メモ（コアメモ・作業メモ・バックオフィスメモ）の編集も今までの関数（startEditWorkMemo など）
      ・付箋は今の付箋から「題か本文に管理番号がある物」「タスクメモから出た自動付箋」を拾って出すだけ（本物の linkifyCarNums と同じ物差し）
      ・フローは今の操作ログ（car.logs）を並べ直して出すだけ（手で足す欄は v3.0.1 で外した）
   🔴 スマホ（幅 900px 以下）と「1カラム表示」を選んだ時は、今までの renderDetailBody の形のまま
      ・選んだ表示と左右の幅は **ブラウザごとに覚える**（ゆうた「これはブラウザごとの記憶でOK」）

   ⚠ 売約後の車の［展示フェーズ］は **見るだけ**。
      大タスクの計算（進み・中タスク・作業管理票）は「車がいまどの状態か」で売約後／展示前を決めているので、
      売約後の車で展示前の大タスクを押すと売約後の方へ書かれてしまう。だから押せなくしてある。
   ======================================== */
(function () {
  'use strict';

  var LS_VIEW = 'cf_detail_view';   /* 'old' ＝ 1カラム表示を選んだ */
  var LS_LW = 'cf_detail_lw';       /* 左の幅（px） */
  var MIN_W = 900;                  /* これより狭い画面は今までの1カラム */

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, String(v));
    } catch (e) {}
    return null;
  }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s == null ? '' : s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function I(name, fb, px) { return (typeof ic === 'function') ? ic(name, fb, px || 15) : fb; }
  function modal() { return document.getElementById('modal-detail'); }
  function mode() { return (typeof window.getCurrentDetailMode === 'function') ? window.getCurrentDetailMode() : 'default'; }

  function isOn() {
    if (document.body.classList.contains('mobile')) return false;
    if (window.innerWidth <= MIN_W) return false;
    return ls(LS_VIEW) !== 'old';
  }
  function leave() { var m = modal(); if (m) m.classList.remove('cd3-on'); }

  /* 表示の切りかえ（👁）。'old'＝今までの1カラム／'new'＝新しい形 */
  function setView(v) {
    ls(LS_VIEW, v === 'old' ? 'old' : null);
    var car = curCar();
    if (car && typeof renderDetailBody === 'function') renderDetailBody(car);
  }
  function curCar() {
    var id = (typeof activeDetailCarId !== 'undefined') ? activeDetailCarId : null;
    if (!id) return null;
    var c = null;
    if (typeof cars !== 'undefined' && Array.isArray(cars)) c = cars.find(function (x) { return x && x.id === id; });
    if (!c && typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) c = archivedCars.find(function (x) { return x && x.id === id; });
    return c || null;
  }

  var curTab = {}, leftTab = {}, flowOpen = {};

  /* ---------------- 上の帯 ---------------- */
  function dayBlock(car) {
    if (car.col === 'other') {
      return '<div class="detail-days-box dg"><div class="detail-days-num">' + daysSince(car.purchaseDate) + '<span class="detail-days-unit">日</span></div><div class="detail-days-label">仕入れから</div></div>';
    }
    if (car.isOrder) {
      return '<div class="detail-days-box" style="background:rgba(168,85,247,.18);color:#c084fc;border:1px solid rgba(168,85,247,.4)">'
        + '<div class="detail-days-num" style="font-size:18px">' + I('box', '📦', 16) + '</div><div class="detail-days-label">オーダー車両</div>'
        + '<div class="detail-days-sub" style="color:#c084fc;opacity:.85">在庫日数カウントなし</div></div>';
    }
    if (car.contract) {
      var delDiff = car.deliveryDate ? daysDiff(car.deliveryDate) : null;
      var wt = delWarnTier(delDiff);
      var lab = (delDiff != null) ? (delDiff === 0 ? '納車本日' : delDiff > 0 ? '納車まで' + delDiff + '日' : '納車超過' + (-delDiff) + '日') : '';
      return '<div class="detail-days-box db"><div class="detail-days-num">' + daysSinceContract(car) + '<span class="detail-days-unit">日</span></div><div class="detail-days-label">売約から</div>'
        + (lab ? '<div class="detail-days-sub' + (wt ? ' warn' : '') + '">' + lab + '</div>' : '') + '</div>';
    }
    var inv = daysSince(car.purchaseDate), w2 = invWarnTier(inv);
    var cls = w2 ? (w2.days >= 45 ? 'dr' : w2.days >= 30 ? 'dw' : 'dg') : 'dg';
    return '<div class="detail-days-box ' + cls + '"' + (w2 ? ' style="background:' + w2.bg + ';color:' + w2.color + '"' : '') + '><div class="detail-days-num">' + inv + '<span class="detail-days-unit">日</span></div><div class="detail-days-label">在庫</div></div>';
  }
  function priceBlock(car) {
    if (car.col === 'other') {
      return '<div class="cd3-other"><span class="pill ' + ((typeof pillMap !== 'undefined' && pillMap.other) || 'pill-other') + '">' + I('pencil', '📝', 14) + ' その他</span>'
        + '<div>身の振り方が決まっていない保留中の車両。<br>タスクや進捗の管理対象外です。</div></div>';
    }
    var tlb = (typeof getTaxLabel === 'function') ? getTaxLabel('body') : '税込';
    var tlt = (typeof getTaxLabel === 'function') ? getTaxLabel('total') : '税込';
    var pt = fmtPriceTwo(car.totalPrice, car.price), h = '';
    if (pt.hasTotal) h += '<div class="cd3-total"><span class="k">総額</span>' + pt.totalDisp + '<span class="tx">（' + tlt + '）</span></div>';
    if (pt.hasBody) h += pt.hasTotal ? '<div class="cd3-bodyp">本体 ' + pt.bodyDisp + '（' + tlb + '）</div>'
                                     : '<div class="cd3-total"><span class="k">本体</span>' + pt.bodyDisp + '<span class="tx">（' + tlb + '）</span></div>';
    var chip = (typeof customerChipHTML === 'function') ? customerChipHTML(car.customerName, 'title') : '';
    var del = car.deliveryDate ? '<span class="cd3-del">' + I('calendar', '📅', 13) + ' 納車予定 ' + fmtDate(car.deliveryDate) + '</span>' : '';
    return '<div class="cd3-price">' + h + ((del || chip) ? '<div class="cd3-sub">' + del + chip + '</div>' : '') + '</div>';
  }
  function band(car) {
    var photo = '<div class="detail-photo' + (car.photo ? ' cd3-zoom' : '') + '"' + (car.photo ? ' onclick="CarDetailV3.zoom()" title="クリックで大きく表示"' : '') + '>'
      + (car.photo ? '<img src="' + esc(car.photo) + '" alt="">' : carEmoji(car.size))
      + '<div class="detail-photo-edit" onclick="event.stopPropagation();document.getElementById(\'dp-inp\').click()">' + I('camera', '📷', 16) + ' 写真を変更</div></div>'
      + '<input type="file" id="dp-inp" accept="image/*" capture="environment" style="display:none" onchange="onDetailPhoto(this)">';
    var yr = (typeof fmtYearDisplay === 'function') ? fmtYearDisplay((typeof parseYearInput === 'function' ? parseYearInput(car.year) : null) || car.year) : (car.year || '');
    var sp = [['管理番号', car.num || '—'], ['年式', yr || '—'], ['車体色', car.color || '—'], ['走行距離', Number(car.km || 0).toLocaleString() + 'km']];
    return '<div class="cd3-band">' + photo
      + '<div class="cd3-mid"><div class="cd3-title"><span class="mk">' + esc(car.maker || '') + '</span><span class="md">' + esc(car.model || '') + '</span>'
      + (car.grade ? '<span class="gr">' + esc(car.grade) + '</span>' : '') + '</div>'
      + '<div class="cd3-spec">' + sp.map(function (x) { return '<div><div class="k">' + x[0] + '</div><div class="v" title="' + esc(x[1]) + '">' + esc(x[1]) + '</div></div>'; }).join('') + '</div></div>'
      + '<div class="cd3-right">' + dayBlock(car) + priceBlock(car) + '</div></div>';
  }
  function header(car) {
    var colLabel = ((typeof COLS !== 'undefined' && COLS.find(function (c) { return c.id === car.col; })) || {}).label || car.col;
    var pill = (typeof pillMap !== 'undefined' && pillMap[car.col]) || 'pill-other';
    return '<div class="cd3-hdr"><span class="cd3-ttl">' + esc((car.num || '') + '　' + (car.model || '')) + '</span>'
      + '<span class="pill ' + pill + '">' + esc(colLabel) + '</span>'
      + (mode() === 'backoffice' ? '<span class="pill pill-purple">' + I('files', '🗂', 13) + ' バックオフィスから開いた</span>' : '')
      + '<span class="cd3-sp"></span>'
      + '<button class="cd3-hbtn" onclick="openCarNoteFromDetail()" title="この車両の付箋を作成">' + I('sticky', '🗒', 15) + ' 付箋を作る</button>'
      + '<button class="cd3-hbtn" onclick="CarDetailV3.setView(\'old\')" title="ビューを切り替える（今までの1カラムの表示へ）">' + I('eye', '👁', 16) + ' 1カラム表示</button>'
      + '<button class="cd3-hbtn" data-edit-car="1" onclick="openCarModal(\'' + esc(car.id) + '\')" title="車両詳細を編集">' + I('settings', '⚙', 16) + ' 編集</button>'
      + '<button class="mclose" onclick="closeModal(\'modal-detail\')" title="閉じる">' + I('close', '✕', 15) + '</button></div>';
  }

  /* ---------------- 左：メモ・付箋 ---------------- */
  function coreMemoHtml(car) {
    var m = (car.memo || '').trim();
    return m
      ? '<div class="core-memo" data-expanded="0" onclick="toggleCoreMemo(this)"><div class="core-memo-label">' + I('pin', '📌', 14) + ' メモ</div><div class="core-memo-text">' + esc(m).replace(/\n/g, '<br>') + '</div></div>'
      : '<div class="core-memo core-memo-empty"><div class="core-memo-label">' + I('pin', '📌', 14) + ' メモ</div><div class="core-memo-text core-memo-placeholder">メモは未記入です（編集ボタンから記入）</div></div>';
  }
  function workMemoHtml(car) {
    var isD = car.col === 'delivery' || car.col === 'done';
    var hint = car.col === 'other' ? '（保留中のメモ）' : isD ? '（納車準備中のメモ）' : '（再生中のメモ）';
    var w = (car.workMemo || '').trim();
    return '<div class="work-memo" id="work-memo-wrap"><div class="work-memo-label">' + I('pencil', '📝', 16) + ' 作業メモ <span class="work-memo-hint">' + hint + '</span></div>'
      + '<div class="work-memo-view" onclick="startEditWorkMemo(\'' + esc(car.id) + '\')">'
      + (w ? esc(w).replace(/\n/g, '<br>') : '<span class="work-memo-placeholder">タップしてメモを記入</span>') + '</div></div>';
  }
  var KM_RE = /[KkＫｋ][MmＭｍ][-－ー−―‐]?[0-9０-９]{1,6}/g;
  function carNotes(car) {
    var B = window.CFNoteBoard;
    if (!B || typeof boardNotes === 'undefined' || !Array.isArray(boardNotes)) return [];
    var R = B.rules, A = B.adapter && B.adapter();
    var me = R.meList(A && A.me ? A.me() : []), now = Date.now(), my = normCarNum(car.num || '');
    return boardNotes.filter(function (n) {
      if (!n || !n.id || !R.canSee(n, me) || R.isHidden(n, now)) return false;
      if (n.autoSource && n.autoSource.carId === car.id) return true;
      if (!my) return false;
      var txt = (n.title || '') + '\n' + (R.bodyOf(n) || '');
      return (txt.match(KM_RE) || []).some(function (m) { return normCarNum(m) === my; });
    }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function notesHtml(car) {
    var list = carNotes(car);
    var cards = list.length ? '<div class="cfnb"><div class="bn-grid">' + list.map(function (n) {
      try { return window.CFNoteBoard.cardHtml(n, { noDrag: true }); } catch (e) { return ''; }
    }).join('') + '</div></div>' : '<div class="cd3-empty">ボードに出ている、この車の付箋はありません</div>';
    return '<div class="cd3-nt" id="cd3-notes"><div class="cd3-nt-h">' + I('sticky', '🗒', 14) + ' この車の付箋 <span class="cd3-cnt">' + list.length + '</span>'
      + '<button class="cd3-add" onclick="openCarNoteFromDetail()">＋ この車の付箋</button></div>' + cards
      + '<div class="cd3-hint">題か本文に「' + esc(car.num || '管理番号') + '」が入っている付箋と、タスクメモから出た付箋が並びます。</div></div>';
  }

  /* ---------------- 左：フロー（今の操作ログ car.logs を並べ直す） ----------------
     ・新しい順。大きい出来事（状態の移動・大タスクの完了・納車日・車両情報の編集）は出したまま
     ・細かい記録（中タスク・小タスクの☑・メモの更新など）は、ひとつ上の大きい出来事の下に「この間の記録 N件」でたたむ
     ・大タスクの番号（例 d_docs）は名前に読みかえる
     見た目は PitFlow 予約詳細のフロー（card-view.js の cv-flow）と同じ */
  var taskNameMap = null;
  function taskNames() {
    if (taskNameMap) return taskNameMap;
    taskNameMap = {};
    ['regen', 'delivery', 'backoffice'].forEach(function (ph) {
      try { (getAllTasksForUI(ph) || []).forEach(function (t) { taskNameMap[t.id] = (t.icon ? t.icon + ' ' : '') + t.name; }); } catch (e) {}
    });
    return taskNameMap;
  }
  function pretty(a) {
    var M = taskNames();
    return String(a || '')
      .replace(/「([a-z]_[A-Za-z0-9_]+)」/g, function (m, id) { return M[id] ? '「' + M[id] + '」' : m; })
      .replace(/^バックオフィス: ([a-z]_[A-Za-z0-9_]+) を/, function (m, id) { return 'バックオフィス「' + (M[id] || id) + '」を'; })
      .replace(/^タスク「([^」]+)」/, function (m, id) { return 'タスク「' + (M[id] || id) + '」'; });
  }
  function kindOf(a) {
    a = String(a || '');
    if (/^(ステータス変更|売約設定|売約＆納車完了|納車完了|売約キャンセル|仮登録から|登録済み|新規登録|売約に伴い|月次集計締め)/.test(a)) return 'phase';
    if (/^(中タスク|\[.+\]「)|のメモを(作成|更新|削除)$|^(作業メモ|バックオフィスメモ)を更新$|写真を自動削除/.test(a)) return 'minor';
    if (/^納車日変更|^納車時間/.test(a)) return 'date';
    if (/を未完了に戻す$|取り消し|0% に戻した/.test(a)) return 'cancel';
    if (/を完了$|完了$|^バックオフィス/.test(a)) return 'task';
    if (/^車両情報を編集/.test(a)) return 'edit';
    return 'other';
  }
  var FIC = { phase: '➡️', task: '✅', date: '📅', cancel: '↩️', edit: '✏️', other: '💬', minor: '▸' };
  function flowHtml(car) {
    var L = (Array.isArray(car.logs) ? car.logs : []).slice().reverse();   /* car.logs は新しい順 → 古い順にして組む */
    var groups = [], g = null;
    L.forEach(function (e) {
      var k = kindOf(e.action);
      if (k === 'minor' && g) g.kids.push(e);
      else if (k === 'minor') { g = { main: null, kids: [e] }; groups.push(g); }
      else { g = { main: e, kids: [] }; groups.push(g); }
    });
    groups.reverse();
    var row = function (e, kid) {
      var k = kindOf(e.action);
      return '<div class="cv-frow' + (kid ? '' : ' done') + ' k-' + k + '"><span class="cv-fdot"></span><div class="cv-fmain"><div class="cv-ft"><span class="f-ic">' + FIC[k] + '</span>' + esc(pretty(e.action)) + '</div>'
        + '<div class="cv-fd">' + esc(e.time || '') + (e.user ? ' ・ ' + esc(e.user) : '') + '</div></div></div>';
    };
    var h = '<div class="cv-flow">';
    if (!groups.length) h += '<div class="cd3-empty">記録はまだありません。</div>';
    groups.forEach(function (gr, gi) {
      var key = car.id + '_' + gi + '_' + (gr.main ? gr.main.time : '');
      if (gr.main) h += row(gr.main, false);
      if (gr.kids.length) {
        var op = !!flowOpen[key];
        h += '<div class="cv-fsub' + (op ? ' open' : '') + '"><button class="cv-fmore" onclick="CarDetailV3.tgFlow(\'' + esc(key) + '\')"><i class="cv-fcar"></i>'
          + (op ? 'この間の記録を閉じる' : 'この間の記録 ' + gr.kids.length + '件') + '</button>'
          + (op ? '<div class="cv-fkids">' + gr.kids.slice().reverse().map(function (e) { return row(e, true); }).join('') + '</div>' : '') + '</div>';
      }
    });
    h += '</div>';
    /* 手で足す欄は置かない＝自動で残る記録だけ（2026-09-25 ゆうた「フローのこの部分は要らない　単純に自動入力だけで」・v3.0.1） */
    h += '<div class="cv-fhint">大タスクの完了・状態の移動・納車日などは自動でここに残ります（今までの操作ログと同じ物）。中タスクや小タスクの☑などの細かい記録はたたんであります。</div>';
    return h;
  }


  /* ---------------- 右：タスク ---------------- */
  function tasksPanel(car, which) {
    var isBo = which === 'bo';
    var html = '';
    if (isBo) {
      if (!car.backofficeTasks) car.backofficeTasks = {};
      var bo = (typeof calcBackofficeProg === 'function') ? calcBackofficeProg(car) : { pct: 0, done: 0, total: 0, tasks: [] };
      html += overall({ done: bo.done, total: bo.total, pct: bo.pct }, I('files', '🗂', 16) + ' バックオフィス（事務処理）')
        + '<div class="task-items">' + _detailTaskItemsHtml(car, bo.tasks || [], false, true) + '</div>'
        + '<div style="margin-top:14px">' + _renderBackofficeMemoHtml(car) + '</div>' + _detailBoFooterHtml(car, bo.tasks || []);
      return html;
    }
    var isD = car.col === 'delivery' || car.col === 'done';
    if (which === 'regenPast') {
      /* 売約後の車の展示前タスク＝「展示前の状態」として計算して、見るだけ */
      var view = Object.assign({}, car, { col: 'regen' });
      var ts = getActiveRegenTasks(view);
      return '<div class="cd3-note">展示前タスクは売約前のものです（記録として見るだけ・押せません）</div>'
        + overall(calcProg(view), '展示フェーズ（展示前タスク）')
        + '<div class="task-items cd3-ro">' + _detailTaskItemsHtml(view, ts, false, false) + '</div>';
    }
    var tasks = isD ? getActiveDeliveryTasks(car) : getActiveRegenTasks(car);
    return (isD && typeof _renderRegistrationBar === 'function' ? _renderRegistrationBar(car) : '')
      + overall(calcProg(car), isD ? '売約後タスク（納車準備）' : '展示前タスク（業務タスク）')
      + '<div class="task-items">' + _detailTaskItemsHtml(car, tasks, isD, false) + '</div>';
  }
  function overall(p, label) {
    return '<div class="cd3-lab">' + label + '</div><div class="detail-overall"><div class="detail-overall-label"><span>全体進捗</span><span>' + p.done + '/' + p.total + ' (' + p.pct + '%)</span></div>'
      + '<div class="detail-overall-bar"><div class="detail-overall-fill" style="width:' + p.pct + '%;background:' + (p.pct >= 100 ? 'var(--green)' : p.pct > 0 ? 'var(--orange)' : 'var(--bg4)') + '"></div></div></div>';
  }
  function eqPanel(car) {
    return (typeof renderEquipmentView === 'function') ? '<div class="cd3-eq">' + renderEquipmentView(car, {}) + '</div>' : '';
  }
  function eqOn() { return !(typeof isTaskActive === 'function' && !isTaskActive('t_equip', 'regen')); }
  function cnt(p) { return (p && p.total) ? '<span class="cv-tcnt' + (p.done >= p.total ? ' ok' : '') + '">' + p.done + '/' + p.total + '</span>' : ''; }

  /* 右のタブ。🔴 いまの状態の大タスクが必ず先頭
       売約後の車＝［売約後タスク］［装備詳細］（隙間）［展示フェーズ］
       売約前の車＝［展示前タスク］［装備詳細］／その他＝［装備詳細］
       バックオフィスから開いた時は先頭に［バックオフィス］ */
  function rightTabs(car) {
    var t = [], isD = car.col === 'delivery' || car.col === 'done';
    if (mode() === 'backoffice') {
      var bo = (typeof calcBackofficeProg === 'function') ? calcBackofficeProg(car) : null;
      t.push({ k: 'bo', ic: 'files', fb: '🗂', lb: 'バックオフィス', c: bo });
    }
    if (car.col !== 'other') t.push({ k: 'now', ic: isD ? 'car' : 'wrench', fb: isD ? '🚗' : '🔧', lb: isD ? '売約後タスク' : '展示前タスク', c: calcProg(car) });
    if (eqOn()) t.push({ k: 'eq', ic: 'clipboard', fb: '📋', lb: '装備詳細' });
    if (isD) {
      t.push({ gap: 1 });
      t.push({ k: 'regenPast', ic: 'wrench', fb: '🔧', lb: '展示フェーズ', past: 1, c: calcProg(Object.assign({}, car, { col: 'regen' })) });
    }
    return t;
  }

  /* ---------------- 組み立て ---------------- */
  function render(car) {
    var m = modal(); if (!m) return;
    m.classList.add('cd3-on');
    var body = document.getElementById('detail-body'); if (!body) return;
    /* 描き直しでスクロールが上に戻らないように控える */
    var keepL = body.querySelector('.cd3-col.l .cv-body'), keepR = body.querySelector('.cd3-col.r .cv-body');
    var sl = keepL ? keepL.scrollTop : 0, sr = keepR ? keepR.scrollTop : 0, same = body.getAttribute('data-car') === car.id;

    var tabs = rightTabs(car), k = curTab[car.id];
    if (!k || !tabs.some(function (x) { return x.k === k; })) k = (tabs.find(function (x) { return x.k; }) || {}).k;
    var rbar = '<div class="cv-tabs">' + tabs.map(function (x) {
      if (x.gap) return '<span class="cv-tgap"></span>';
      return '<button class="cv-tab' + (x.k === k ? ' on' : '') + (x.past ? ' past' : '') + '" onclick="CarDetailV3.tab(\'' + x.k + '\')">' + I(x.ic, x.fb, 16) + ' ' + x.lb + cnt(x.c) + '</button>';
    }).join('') + '</div>';
    var P = k === 'eq' ? eqPanel(car) : (k ? tasksPanel(car, k) : '');

    var lk = leftTab[car.id] || 'memo';
    var nn = carNotes(car).length;
    var lbar = '<div class="cv-tabs">'
      + '<button class="cv-tab' + (lk === 'memo' ? ' on' : '') + '" onclick="CarDetailV3.ltab(\'memo\')">' + I('pin', '📌', 16) + ' メモ・付箋' + (nn ? '<span class="cv-tcnt">' + nn + '</span>' : '') + '</button>'
      + '<button class="cv-tab' + (lk === 'flow' ? ' on' : '') + '" onclick="CarDetailV3.ltab(\'flow\')">' + I('clock', '🕘', 16) + ' フロー</button></div>';
    var LP = lk === 'flow' ? flowHtml(car) : coreMemoHtml(car) + (mode() === 'backoffice' ? '' : workMemoHtml(car)) + notesHtml(car);

    var lw = +ls(LS_LW) || 0;
    body.setAttribute('data-car', car.id);
    body.innerHTML = header(car) + band(car)
      + '<div class="cd3-body"' + (lw ? ' style="--lw:' + lw + 'px"' : '') + '>'
      + '<div class="cd3-col l">' + lbar + '<div class="cv-body">' + LP + '</div></div>'
      + '<div class="cd3-split" title="ドラッグで幅を変える（ダブルクリックで元に戻す）" onpointerdown="CarDetailV3.splitDown(event)" ondblclick="CarDetailV3.splitReset()"></div>'
      + '<div class="cd3-col r">' + rbar + '<div class="cv-body">' + P + '</div></div></div>';
    if (same) {
      var nl = body.querySelector('.cd3-col.l .cv-body'), nr = body.querySelector('.cd3-col.r .cv-body');
      if (nl) nl.scrollTop = sl; if (nr) nr.scrollTop = sr;
    }
    if (typeof icHydrate === 'function') icHydrate(body);
  }

  /* ---------------- 左右の幅（ドラッグ） ---------------- */
  function splitDown(ev) {
    var box = document.querySelector('#detail-body .cd3-body'), sp = ev.currentTarget; if (!box) return;
    var x0 = box.getBoundingClientRect().left, max = Math.round(box.getBoundingClientRect().width * 0.6), lw = 0;
    sp.classList.add('drag'); document.body.classList.add('cd3-dragging');
    try { sp.setPointerCapture(ev.pointerId); } catch (e) {}
    function mv(e) { lw = Math.max(280, Math.min(max, Math.round(e.clientX - x0))); box.style.setProperty('--lw', lw + 'px'); }
    function up() {
      sp.classList.remove('drag'); document.body.classList.remove('cd3-dragging');
      sp.removeEventListener('pointermove', mv); sp.removeEventListener('pointerup', up); sp.removeEventListener('pointercancel', up);
      if (lw) ls(LS_LW, lw);
    }
    sp.addEventListener('pointermove', mv); sp.addEventListener('pointerup', up); sp.addEventListener('pointercancel', up);
    ev.preventDefault();
  }
  function splitReset() { ls(LS_LW, null); var c = curCar(); if (c) render(c); }

  /* 付箋が変わったら（リアルタイム同期で renderBoardNotes が呼ばれた時）、開いている車の付箋も描き直す */
  function hookNotes() {
    var B = window.CFNoteBoard; if (!B || B._cd3Hooked) return;
    var orig = B.render;
    B.render = function () {
      var r = orig.apply(this, arguments);
      try {
        /* ⚠ 丸ごと描き直さない（作業メモを書いている途中で消えるため）。付箋の欄とタブの数だけ差し替える */
        var m = modal(), c = curCar(), box = document.getElementById('cd3-notes');
        if (m && m.classList.contains('open') && m.classList.contains('cd3-on') && c) {
          if (box) box.outerHTML = notesHtml(c);
          var tb = document.querySelector('#detail-body .cd3-col.l .cv-tab');
          if (tb) {
            var n = carNotes(c).length, old = tb.querySelector('.cv-tcnt');
            if (old) old.remove();
            if (n) tb.insertAdjacentHTML('beforeend', '<span class="cv-tcnt">' + n + '</span>');
          }
        }
      } catch (e) {}
      return r;
    };
    B._cd3Hooked = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookNotes); else hookNotes();

  /* 開くたびに、左右とも先頭のタブから（＝いまの状態の大タスク／メモ・付箋）。
     同じ車を開き直した時に、前に見ていたタブが残っていると「バックオフィスから開いたのに売約後タスク」になるため */
  if (typeof window.openDetail === 'function') {
    var _openDetail = window.openDetail;
    window.openDetail = function (carId) {
      delete curTab[carId]; delete leftTab[carId];
      return _openDetail.apply(this, arguments);
    };
  }

  /* 画面の幅が変わった時（900px をまたいだ時）は、開いている詳細を描き直して形を切りかえる */
  var lastOn = null;
  window.addEventListener('resize', function () {
    var on = isOn(); if (on === lastOn) return; lastOn = on;
    var m = modal(), c = curCar();
    if (m && m.classList.contains('open') && c && typeof renderDetailBody === 'function') renderDetailBody(c);
  });

  window.CarDetailV3 = {
    isOn: isOn, leave: leave, render: render, setView: setView,
    tab: function (k) { var c = curCar(); if (!c) return; curTab[c.id] = k; render(c); },
    ltab: function (k) { var c = curCar(); if (!c) return; leftTab[c.id] = k; render(c); },
    tgFlow: function (k) { flowOpen[k] = !flowOpen[k]; var c = curCar(); if (c) render(c); },
    zoom: function () { var c = curCar(); if (c && c.photo && typeof openImagePreview === 'function') openImagePreview(c.photo); },
    splitDown: splitDown, splitReset: splitReset,
    _kindOf: kindOf, _pretty: pretty, _carNotes: carNotes
  };
})();
