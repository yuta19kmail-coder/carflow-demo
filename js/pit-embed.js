/* ========================================
   pit-embed.js  -  PitFlow の「車販作業」を CarFlow に出す（CarFlow v2.33.0）
   ----------------------------------------
   ◎なにをするもの
     ① サイドバー「🔧 整備依頼業務」＝ **PitFlow の「車販作業」ビューをそのまま**出す。
        洗車／今週の洗車予定／車検ヘッドライト磨き／コーティング依頼／
        直近1か月のコーティング予定／その他依頼事項 の6枠。
        「✓ 完了」「↩ 戻す」もそのまま動き、**結果は PitFlow にそのまま入る**。
     ② ダッシュボードの「要対応アクション」の上＝ **今日・明日にやる PitFlow の作業**を
        1行ずつのコンパクト表示で。ここでもその場で「済」にできる。

   ◎どこのデータを見ているか（🔴 CarFlow のデータではない）
     companies/<会社>/**pitCards**      … PitFlow の入庫カードそのもの
     companies/<会社>/**pitSettings/main** … 作業タイプ（車検/12点/1Y/3M…）の名前と色
     ＝ **CarFlow と PitFlow は同じ Firebase プロジェクト**なので、直接読み書きできる。
     Firestore ルールは `pitCards` / `pitSettings` とも社員なら read/write 可（変更不要）。

   🔴 書き込みは「済みフラグ1個」だけ
     washSalesDone / headlightDone / coatingDone / salesReqDone のどれか1つを
     `update()` で書く（＋工程ログに1行 arrayUnion）。**カードを丸ごと上書きしない。**
     丸ごと書くと、PitFlow 側で同時に編集していた内容を巻き戻してしまう。
     PitFlow は他アプリからの部分更新を purchase の onSnapshot で正しく拾う作りになっている
     （db-pit.js `_watch`：中身が変わっていたら state を差し替える）。

   ⚠ 見た目の元ネタ（写しの元）
     ・カード      … PitFlow `js/reserve.js` の `cardHtml(c,{compact:true})`
     ・6つの枠     … PitFlow `js/car-sales.js`
     ・スタイル    … PitFlow `css/polish.css` の `.pcm-*` / `.cs-*` → こちらは `css/pit-embed.css`
     🔴 **PitFlow 側の car-sales.js / cardHtml を直したら、ここも直すこと。**
        `test_pit_embed.mjs` が両方のソースを見比べて、ずれたら落ちるようにしてある。

   🔴 判定は写しにしない（v2.44.0〜）
     ・代車の残り日数と色           … `_shared/coreflow-loaner-remain.js`
     ・返車予定の「どのくらい確かか」… `_shared/coreflow-return-plan.js`（v2.45.0）
     ＝ **PitFlow と CarFlow が同じ部品を使う。**ここに計算を書き戻さないこと。
     　（写しにしていたせいで「返却済なのに赤い超過」が出た事故の直し）

   ⚠ カードをクリックすると **PitFlow を別タブで開く**（`?card=<id>`／PitFlow の deeplink-pit.js が受ける）。
      CarFlow 側にカード詳細は作らない＝編集の本体は PitFlow、という決めごとのため。
   ======================================== */
(function () {
  'use strict';

  var PITFLOW_URL = 'https://pitflow.kobayashi-motors.com';

  /* 🔴 車販作業に出るのは「まだ終わっていないカード」だけ（PitFlow の _csActive と同じ＝
     status が returned／scrap 以外）。全部読むとカードが増えるほど重くなるので、
     Firestore 側で絞って読む。**PitFlow に新しい status が増えたらここに足すこと。**
     （足し忘れると、その status のカードだけ CarFlow に出てこない） */
  var ACTIVE_STATUS = ['reserved', 'check', 'estim', 'contact', 'parts', 'work', 'workDone', 'outsource'];

  /* PitFlow の既定（pitSettings が読めるまでの仮）。PitFlow state.js の写し。 */
  var DEF_WORKTYPES = [
    { id: 'shaken',  label: '車検',   color: '#ef4444' },
    { id: '12pt',    label: '12点',   color: '#f97316' },
    { id: 'general', label: '一般',   color: '#84cc16' },
    { id: 'oil',     label: 'オイル', color: '#eab308' },
    { id: 'bp',      label: 'B.P',    color: '#3b82f6' },
    { id: 'coat1y',  label: '1Y',     color: '#8b5cf6' },
    { id: 'coat3m',  label: '3M',     color: '#a855f7' }
  ];
  var DROP_TYPES = [
    { id: 'wait',    label: '待', desc: 'お客様待ち' },
    { id: 'sameDay', label: '当', desc: '当日返車' },
    { id: 'drop',    label: '預', desc: '預かり' }
  ];
  /* 特殊（保証・保険）＝PitFlow state.js の PIT_WORK_SPECIALS の写し。ホバー詳細にだけ出る。 */
  var WORK_SPECIALS = [
    { id: 'warranty',  label: '保証' },
    { id: 'insurance', label: '保険' }
  ];
  var DROP_COLOR   = { wait: '#f59e0b', sameDay: '#3b82f6', drop: '#26a269' };
  var LOANER_COLOR = { green: '#1db97a', amber: '#f59e0b', red: '#ef4444', none: '#9fa8c7' };

  /* 完了フラグの対応表（PitFlow car-sales.js の CS_DONEFLAG と同じ） */
  var DONEFLAG = { wash: 'washSalesDone', headlight: 'headlightDone', coating: 'coatingDone', salesReq: 'salesReqDone' };
  var TASK_LABEL = { wash: '洗車', headlight: 'ヘッドライト磨き', coating: 'コーティング', salesReq: '車販依頼' };
  var CS_INTASK = ['check', 'estim', 'contact', 'parts', 'work', 'workDone', 'outsource'];

  /* ---------------- 中で持っているもの ---------------- */
  var PS = { cards: [], loaners: [], workTypes: DEF_WORKTYPES.slice(), loanerColors: { greenMin: 4, amberMin: 2 } };
  var _unsubCards = null, _unsubSettings = null, _unsubLoaners = null, _unsubAssigns = null, _started = false, _loaded = false, _err = '';

  /* ---------------- 小道具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function icon(name, fb, size) { return (window.ic ? ic(name, fb, size || 16) : (fb || '')); }
  function wtOf(id) { return (PS.workTypes || []).find(function (w) { return w.id === id; }) || null; }
  function dtOf(id) { return DROP_TYPES.find(function (d) { return d.id === id; }) || null; }
  function spLabel(id) { var m = WORK_SPECIALS.find(function (x) { return x.id === id; }); return m ? m.label : ''; }
  function loanerOf(id) { return (PS.loaners || []).find(function (x) { return x.id === id; }) || null; }

  /* PitFlow の pitSurname / pitCustName / pitCustSurname の写し（state.js） */
  function pitSurname(name) {
    var s = String(name == null ? '' : name).trim();
    if (!s) return '';
    var t = s.replace(/株式会社|（株）|\(株\)/g, '㈱')
             .replace(/有限会社|（有）|\(有\)/g, '㈲')
             .replace(/合同会社|（同）|\(同\)/g, '(同)');
    if (/[㈱㈲]|\(同\)|会社|組合|法人/.test(t)) return t.replace(/\s+/g, ' ').trim();
    return t.split(/\s+/)[0] || t;
  }
  function custName(c) {
    var k = String((c && c.customer) == null ? '' : c.customer).trim();
    if (k) return k;
    return String((c && c.kana) == null ? '' : c.kana).trim();
  }
  function custSurname(c) { return pitSurname(custName(c)); }

  /* 🔴 v2.44.0（ゆうた指定 2026-08-19）代車の残り日数と色は
     **全アプリ共通の部品（_shared/coreflow-loaner-remain.js）に完全に任せる。**
     🗣「あくまで **PitFlow の出張画面**だから、**PitFlow に完全に準拠**してほしい」

     ⚠ v2.43.1 まではここに **PitFlow の古い版の写し**があり、**返したかどうかを見ていなかった。**
        ＝ PitFlow では灰色の「返却済」の車が、**この画面では赤い「超過◯日」**で出ていた。
        （PitFlow は v1.82.0 で直したが、写しには届いていなかった）
     🔴 **写しを新しくするのではなく、判定を1本にして両方がそれを使う形にした。**
        ここに計算を書き戻さないこと。 */
  function loanerInfo(c) {
    if (window.CFLoanerRemain) return CFLoanerRemain.of(c);
    /* 部品が読めていない時の保険＝バッジを出さない（**ウソの色を出すより出さない方がまし**） */
    return { has: false, back: false, at: '', due: '', rem: null, level: 'none' };
  }
  function loanerRem(c) { var r = loanerInfo(c); return r.rem; }
  function loanerKey(rem) { return window.CFLoanerRemain ? CFLoanerRemain.levelOf(rem) : 'none'; }

  /* 翌営業日／今週日曜（PitFlow car-sales.js の _csNextBizDay / _csThisSunday と同じ考え方）。
     🚫 休みは MHS の定休日カレンダー（PitCal）が基準＝PitFlow と必ず同じ日になる。 */
  function nextBizDay() {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    for (var i = 0; i < 14; i++) {
      d.setDate(d.getDate() + 1);
      var ds = ymd(d);
      var closed = (window.PitCal ? PitCal.isClosed(ds) : false);
      var hol = !!(window.Holidays && Holidays.name && Holidays.name(ds));
      if (!closed && !hol) return d;
    }
    return d;
  }
  function thisSunday() {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return ymd(d);
  }

  function hasCoat(c) {
    var ids = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes
            : (Array.isArray(c.workAddons) ? c.workAddons.concat(c.workType ? [c.workType] : []) : (c.workType ? [c.workType] : []));
    return ids.indexOf('coat1y') >= 0 || ids.indexOf('coat3m') >= 0;
  }

  /* ---------------- カード1枚（PitFlow reserve.js cardHtml(compact) の写し） ----------------
     ⚠ 元は「かんばん用」の枝（opts.kanban / PitPip / 並び替え）も持っているが、
        車販作業では使わないので落としてある。クリック先だけ CarFlow 用に差し替え。 */
  function cardHtml(c) {
    var teamColor = (c.boardId === 'import') ? '#ec4899' : '#1db97a';
    var wts = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes : (c.workType ? [c.workType] : []);
    var top = '';
    if (c.needLoaner) {
      /* 🔴 v2.44.0 返却済み（back）は**グレー**。PitFlow の予約カードと同じ見え方にそろえた。 */
      var lk = loanerInfo(c).level;
      if (lk === 'back') top += '<span class="pcm-loaner" style="background:#8390a622;color:#8390a6;border-color:#8390a666;" title="代車は返却済み">代車</span>';
      else if (lk === 'none') top += '';
      else if (lk === 'dead') top += '<span class="pcm-loaner pcm-dead">代車</span>';
      else {
        var lc = LOANER_COLOR[lk] || '#f59e0b';
        top += '<span class="pcm-loaner" style="background:' + lc + '22;color:' + lc + ';border-color:' + lc + '66;">代車</span>';
      }
    }
    var dt = dtOf(c.dropType);
    if (dt && (c.dropType2 || dt.id === 'wait' || dt.id === 'sameDay')) {
      var mk = function (o) {
        var dc = DROP_COLOR[o.id] || 'var(--text2)';
        return '<span class="pcm-drop" style="background:' + dc + '22;color:' + dc + ';border-color:' + dc + '66;">' + esc(o.label) + '</span>';
      };
      var b = c.dropType2 ? dtOf(c.dropType2) : null;
      top += (dt && b) ? ('<span class="dbpair">' + mk(dt) + mk(b) + '</span>') : mk(dt);
    }
    wts.slice(0, 2).forEach(function (id) {
      var w = wtOf(id);
      if (!w) return;
      var cd = ((id === 'coat1y' || id === 'coat3m') && c.coatingDone) ? ' pcm-done' : '';
      top += '<span class="pcm-wt' + cd + '" style="background:' + w.color + '22;color:' + w.color + ';border-color:' + w.color + '66;">' + esc(w.label) + '</span>';
    });

    var h = '<div class="pit-card pcm' + (c.codeRed ? ' pcm-claim' : '') + (c.resNo ? ' pcm-tab' : '')
          + (c.tentative ? ' is-tentative' : '') + '" data-card-id="' + esc(c.id) + '"'
          + ' onclick="PitEmbed.open(\'' + esc(c.id) + '\')" title="クリックで PitFlow のカードを開きます"'
          + ' style="border-left-color:' + teamColor + ';">';
    if (c.resNo) {
      h += '<div class="pcm-ear" style="border-left-color:' + (c.codeRed ? '#ef4444' : teamColor)
         + (c.codeRed ? ';border-top-color:#ef4444' : '') + '">' + esc(c.resNo) + '</div><i class="pcm-ear-slide"></i>';
    }
    var dr = Array.isArray(c.drive) ? c.drive : [], ct = [];
    if (dr.indexOf('leftHand') >= 0 && dr.indexOf('mt') >= 0) ct.push('左M/T');
    else { if (dr.indexOf('leftHand') >= 0) ct.push('左'); if (dr.indexOf('mt') >= 0) ct.push('M/T'); }
    if (dr.indexOf('lowCar') >= 0) ct.push('車高');
    if (dr.indexOf('noShoes') >= 0) ct.push('土禁');
    if (ct.length) {
      h += '<div class="pcm-cau">' + ct.slice(0, 3).map(function (x) { return '<span class="pcm-caut">' + esc(x) + '</span>'; }).join('') + '</div>';
    }
    var nm = custSurname(c) || '（未入力）';
    var stf = pitSurname(c.frontStaff || c.staff || '');
    var kn = c.tentative ? '<span class="kari-name" title="仮予約">仮</span>' : '';
    h += '<div class="pcm-r"><span class="pcm-nm2"><span class="pcm-name">' + esc(nm) + '</span><span class="pcm-sama">様</span>' + kn
       + '</span><span class="pcm-badges">' + top + '</span></div>';
    var washB = (c.returnStage && c.needWash) ? '<span class="pcm-wash' + (c.washSalesDone ? ' pcm-done' : '') + '" title="洗車対象">洗車</span>' : '';
    h += '<div class="pcm-r"><span class="pcm-car">' + esc(c.car || '') + '</span>' + washB
       + (stf ? '<span class="pcm-front">' + esc(stf) + '</span>' : '') + '</div>';
    if (c.status === 'outsource') {
      var odN = c.phaseAt ? (Math.floor((Date.now() - c.phaseAt) / 86400000) + 1) : null;
      var oName = (c.outsourceTo || '外注先未定') + (c.outsourceNote ? ' ' + c.outsourceNote : '');
      h += '<div class="pcm-out">' + icon('external', '↗', 16) + ' <span class="pcm-outn">' + esc(oName) + '</span>'
         + (odN != null ? '<span class="pcm-outd">' + odN + '日目</span>' : '') + '</div>';
    }
    h += '</div>';
    return h;
  }

  /* ---------------- 枠の部品（PitFlow car-sales.js の写し） ---------------- */
  function csCard(c, task, extra) {
    var ex = extra ? ('<div class="cs-extra">' + extra + '</div>') : '';
    var body = '<div class="cs-item"><div class="cs-cardwrap">' + cardHtml(c) + ex + '</div>';
    if (task) {
      body += '<button class="cs-done" onclick="event.stopPropagation();PitEmbed.done(\'' + esc(c.id) + '\',\'' + task + '\')">'
            + icon('check', '✓', 14) + ' 完了</button>';
    }
    return body + '</div>';
  }
  function csDoneCard(c, task) {
    return '<div class="cs-item cs-doneitem"><div class="cs-cardwrap">' + cardHtml(c) + '</div>'
         + '<button class="cs-undo" onclick="event.stopPropagation();PitEmbed.undo(\'' + esc(c.id) + '\',\'' + task + '\')">'
         + icon('undo', '↩', 14) + ' 戻す</button></div>';
  }
  function csSec(title, sub, bodyHtml, doneHtml) {
    var h = '<div class="cs-sec">';
    h += '<div class="cs-sec-h">' + title + (sub ? ' <small>' + sub + '</small>' : '') + '</div>';
    h += '<div class="cs-sec-body">' + (bodyHtml || '<div class="cs-empty">なし</div>') + '</div>';
    if (doneHtml) h += '<div class="cs-done-strip"><div class="cs-done-lb">完了済み</div><div class="cs-done-row">' + doneHtml + '</div></div>';
    return h + '</div>';
  }
  function retLabel(c) {
    if (c.returnDate) {
      var d = new Date(c.returnDate + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        return icon('car', '🚗', 16) + ' 返車 ' + (d.getMonth() + 1) + '/' + d.getDate()
             + '（' + '日月火水木金土'[d.getDay()] + '）' + (c.returnTime ? ' ' + esc(c.returnTime) : '');
      }
    }
    return icon('car', '🚗', 16) + ' 返車日未定';
  }

  /* 🆕 v2.45.0（PitFlow v1.152.0 と同じ）洗車の行に出す「いつ返す予定か」＋その確からしさ。
     🔴 日付も札も **_shared/coreflow-return-plan.js の1本**から。ここで条件を書き写さない。
        （2026-08-19 の代車と同じやり方。CarFlow は PitFlow の出張画面なので答えをそろえる）
     ・確定 … 完TELを通った日（札なし）
     ・未完 … 盤面のまま確定返車日が入っている（🟠 塗りつぶし）
     ・暫定 … 受注のときの約束（🟠 枠だけ）／待・当の入庫日も同じ
     ・未定 … 完TELまで来たのに日が決まっていない（🟠 破線） */
  function planDate(c) { return window.CFReturnPlan ? CFReturnPlan.date(c) : ((c && c.returnDate) || ''); }
  function washLabel(c) {
    var badge = window.CFReturnPlan ? CFReturnPlan.badgeOf(c, 'mini') : '';
    var d = planDate(c);
    if (d) {
      var dt = new Date(d + 'T00:00:00');
      if (!isNaN(dt.getTime())) {
        return (badge ? badge + ' ' : '') + icon('car', '🚗', 16) + ' 返車 ' + (dt.getMonth() + 1) + '/' + dt.getDate()
             + '（' + '日月火水木金土'[dt.getDay()] + '）' + (c.returnTime ? ' ' + esc(c.returnTime) : '');
      }
    }
    return (badge ? badge + ' ' : '') + icon('car', '🚗', 16) + ' 返車日未定';
  }
  function inLabel(c) {
    if (c.status === 'reserved') {
      if (c.reserveDate) {
        var d = new Date(c.reserveDate + 'T00:00:00');
        if (!isNaN(d.getTime())) return icon('calendar', '📅', 16) + ' 入庫予約 ' + (d.getMonth() + 1) + '/' + d.getDate();
      }
      return icon('calendar', '📅', 16) + ' 予約';
    }
    return icon('factory', '🏭', 16) + ' 入庫中';
  }

  /* ---------------- ① 整備依頼業務（＝PitFlow 車販作業の丸写し） ---------------- */
  function buildSections() {
    var cards = PS.cards || [];
    var nextBiz = ymd(nextBizDay());
    var sun = thisSunday();
    var todayStr = ymd(new Date());
    var active = function (c) { return c.status !== 'returned' && c.status !== 'scrap'; };

    /* 🔴🔴 v2.45.0（PitFlow v1.151.0 / v1.152.0 と同じ）**洗車は完TELを待たない。**
       🗣「今日明日、今週の洗車予定に関しては、未完も含めて、**タスクボード上にあったとしても**、
       　　暫定返車予定・確定返車予定が今日明日 or 今週末にかぶるようなら**基本表示させる**」
       🗣「**とにかく状況によっては整備完了を待たずに洗車も始めないとスケジュールが追いつかなくなる**」

       ◎前＝`洗車あり` かつ **完TELを通った車だけ**。＝今週返す約束の車が1台も出てこなかった。
       ◎今＝**洗車ありなら、まだ盤面にいても拾う。**
         日付は **_shared/coreflow-return-plan.js の1本**（確定 → 未完 → 暫定 → 待・当の入庫日）。
       ⚠ **まだ入庫していない車（reserved）とキャンセルは拾わない**（洗う車が工場に無い）。
       ⚠ 🔴 これは**洗車の段取り用の物差し**。返車カレンダー系は今までどおり「確定だけ」。混ぜない。 */
    var washAll = cards.filter(function (c) {
      return c.needWash && active(c) && c.status !== 'reserved' && c.status !== 'cancelled';
    });
    var washToday    = washAll.filter(function (c) { return planDate(c) === todayStr; });
    var washTomorrow = washAll.filter(function (c) { return planDate(c) === nextBiz; });
    var washWeek     = washAll.filter(function (c) { var d = planDate(c); return d && d > nextBiz && d <= sun; });
    /* ⚠ 返車日が決まっていない車は**完TELを通ったものだけ**（＝日を決めに行く車）。
       　 ここまで広げると、日付が何も決まっていない車が全部並んで一覧が使い物にならなくなる。
       🔄 v2.45.0 別枠にはせず、下で「今週」と同じ並びに混ぜる（札で見分ける）。 */
    var washNoDate   = washAll.filter(function (c) { return c.returnStage && !planDate(c); });
    var headlight = cards.filter(function (c) { return c.headlight && active(c); });
    var coatReq   = cards.filter(function (c) { return hasCoat(c) && c.coatingOK && active(c); });
    var monthAhead = (function () { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 31); return ymd(d); })();
    var coatPlan = cards.filter(function (c) {
      return hasCoat(c) && active(c) && !c.returnStage
        && ((c.status === 'reserved' && c.reserveDate && c.reserveDate <= monthAhead) || CS_INTASK.indexOf(c.status) >= 0);
    });
    var salesReq = cards.filter(function (c) { return c.salesReq && active(c); });
    return { nextBiz: nextBiz, washToday: washToday, washTomorrow: washTomorrow, washWeek: washWeek,
             washNoDate: washNoDate, headlight: headlight, coatReq: coatReq, coatPlan: coatPlan, salesReq: salesReq };
  }

  function renderPitSales() {
    var body = document.getElementById('pit-sales-body');
    if (!body) return;
    if (!_loaded) {
      body.innerHTML = '<div class="pe-note">' + (_err
        ? ('PitFlow のデータを読めませんでした（' + esc(_err) + '）。通信または権限を確認してください。')
        : 'PitFlow のデータを読み込んでいます…') + '</div>';
      return;
    }
    var S = buildSections();
    var sortTime = function (a, b) { return String(a.returnTime || a.reserveTime || '99:99').localeCompare(String(b.returnTime || b.reserveTime || '99:99')); };
    /* 🔴 v2.45.0 並びも「いつ返す予定か」1本で（確定だけを見ていたので暫定の車が最後尾に固まっていた） */
    var sortDate = function (a, b) { return String(planDate(a) || '9999').localeCompare(String(planDate(b) || '9999')); };
    var split = function (arr, flag) { return { open: arr.filter(function (c) { return !c[flag]; }), done: arr.filter(function (c) { return c[flag]; }) }; };

    var h = '<div class="cs-cols">';
    {
      var st = split(S.washToday.sort(sortTime), 'washSalesDone');
      var sm = split(S.washTomorrow.sort(sortTime), 'washSalesDone');
      /* 🔴 v2.45.0 どの札の日で出ているのかが分からないと現場が困るので、**全部に返車予定を付ける** */
      var bodyHtml = '<div class="cs-subh">' + icon('sun', '☀️', 16) + ' 今日</div>'
        + (st.open.length ? st.open.map(function (c) { return csCard(c, 'wash', washLabel(c)); }).join('') : '<div class="cs-empty">なし</div>')
        + '<div class="cs-subh">' + icon('moon', '🌙', 16) + ' 明日 <small>（翌営業日 ' + S.nextBiz.slice(5).replace('-', '/') + '）</small></div>'
        + (sm.open.length ? sm.open.map(function (c) { return csCard(c, 'wash', washLabel(c)); }).join('') : '<div class="cs-empty">なし</div>');
      h += csSec(icon('drop', '💧', 16) + ' 洗車', '今日・明日ぶん（暫定・未完も出します）', bodyHtml,
                 st.done.concat(sm.done).map(function (c) { return csDoneCard(c, 'wash'); }).join(''));
    }
    {
      /* 🔄 v2.45.0（PitFlow v1.152.0 と同じ）**「洗車で返車日未定」を別枠から出して、同じ並びに混ぜた。**
         🗣「（別枠にすると）**このエリアの重要度が分からなくなる**から、
         　　**未定バッジをつけて一緒に並べちゃった方がよくない？**」
         🔴 枠が分かれていると別の仕事に見える。実際はどちらも今週中に洗う車で、
            未定の方はむしろ**日を決めに行かないといけない＝重い**。
            **下にあるほど軽く見える＝重要度が逆に伝わる。**
         👉 1本の並びにして、確からしさは札で出す（確定＝札なし／未完／暫定／未定）。
         ⚠ 日付が無い車は並びの最後（sortDate が 9999 として扱う）。**消えはしない。** */
      var weekAll = S.washWeek.concat(S.washNoDate);
      var sw = split(weekAll.sort(sortDate), 'washSalesDone');
      var b2 = (sw.open.length ? sw.open.map(function (c) { return csCard(c, 'wash', washLabel(c)); }).join('')
                               : '<div class="cs-empty">なし</div>');
      h += csSec(icon('calendar', '📅', 16) + ' 今週の洗車予定', '〜今週日曜（暫定・未完・未定も一緒に）', b2,
                 sw.done.map(function (c) { return csDoneCard(c, 'wash'); }).join(''));
    }
    {
      var s3 = split(S.headlight.sort(sortDate), 'headlightDone');
      h += csSec(icon('search', '🔍', 16) + ' 車検ヘッドライト磨き', '',
                 s3.open.map(function (c) { return csCard(c, 'headlight'); }).join(''),
                 s3.done.map(function (c) { return csDoneCard(c, 'headlight'); }).join(''));
    }
    {
      var s4 = split(S.coatReq.sort(sortDate), 'coatingDone');
      h += csSec(icon('sparkle', '✨', 16) + ' コーティング依頼', '受注OK・返車予定日つき',
                 s4.open.map(function (c) { return csCard(c, 'coating', retLabel(c)); }).join(''),
                 s4.done.map(function (c) { return csDoneCard(c, 'coating'); }).join(''));
    }
    {
      h += csSec(icon('calendar', '📅', 16) + ' 直近1か月のコーティング予定', '予約・入庫中の1Y/3M',
                 S.coatPlan.sort(function (a, b) { return String(a.reserveDate || '9999').localeCompare(String(b.reserveDate || '9999')); })
                   .map(function (c) { return csCard(c, null, inLabel(c)); }).join(''), '');
    }
    {
      var s6 = split(S.salesReq, 'salesReqDone');
      h += csSec(icon('cart', '🛒', 16) + ' その他依頼事項', '車販依頼',
                 s6.open.map(function (c) { return csCard(c, 'salesReq', c.salesReqMemo ? (icon('pencil', '✏️', 16) + ' ' + esc(c.salesReqMemo)) : ''); }).join(''),
                 s6.done.map(function (c) { return csDoneCard(c, 'salesReq'); }).join(''));
    }
    h += '</div>';
    body.innerHTML = h;
  }

  /* ---------------- ② ダッシュボードの「今日・明日の整備依頼」 ----------------
     ⚠ ここは**サクッと確認してサクッと済みにする**ための場所。
        だから「今日・明日が期限のものだけ」に絞り、1件1行にしている。
        それ以外（今週ぶん・日付未定・コーティング予定）は数だけ出して、
        「整備依頼業務」ページへ送る。🔴 ここに全部出さないこと（見なくなる）。 */
  function todayItems() {
    var S = buildSections();
    var todayStr = ymd(new Date());
    var out = [];
    var push = function (c, task, when, what) {
      if (c[DONEFLAG[task]]) return;
      out.push({ c: c, task: task, when: when, what: what });
    };
    S.washToday.forEach(function (c) { push(c, 'wash', 'today', '洗車'); });
    S.washTomorrow.forEach(function (c) { push(c, 'wash', 'tomorrow', '洗車'); });
    /* ヘッドライト磨き・コーティング依頼・その他依頼＝返車日が今日/明日のものだけ */
    var dueSoon = function (c) { return c.returnDate === todayStr || c.returnDate === S.nextBiz; };
    S.headlight.filter(dueSoon).forEach(function (c) { push(c, 'headlight', c.returnDate === todayStr ? 'today' : 'tomorrow', 'ヘッドライト磨き'); });
    S.coatReq.filter(dueSoon).forEach(function (c) { push(c, 'coating', c.returnDate === todayStr ? 'today' : 'tomorrow', 'コーティング'); });
    S.salesReq.filter(dueSoon).forEach(function (c) { push(c, 'salesReq', c.returnDate === todayStr ? 'today' : 'tomorrow', '車販依頼'); });
    /* 今日が先・時刻順 */
    out.sort(function (a, b) {
      if (a.when !== b.when) return a.when === 'today' ? -1 : 1;
      return String(a.c.returnTime || a.c.reserveTime || '99:99').localeCompare(String(b.c.returnTime || b.c.reserveTime || '99:99'));
    });
    /* ページに送る「残り」の数 */
    var rest = 0;
    var notDone = function (arr, f) { return arr.filter(function (c) { return !c[f]; }).length; };
    rest += notDone(S.washWeek, 'washSalesDone') + notDone(S.washNoDate, 'washSalesDone');
    rest += notDone(S.headlight.filter(function (c) { return !dueSoon(c); }), 'headlightDone');
    rest += notDone(S.coatReq.filter(function (c) { return !dueSoon(c); }), 'coatingDone');
    rest += notDone(S.salesReq.filter(function (c) { return !dueSoon(c); }), 'salesReqDone');
    return { items: out, rest: rest };
  }

  function renderPitToday() {
    var host = document.getElementById('pit-today-area');
    if (!host) return;
    if (!_loaded) {
      host.innerHTML = '<div class="panel-card"><h3>' + icon('wrench', '🔧', 16) + ' 今日・明日の整備依頼</h3>'
        + '<div class="pe-note">' + (_err ? ('PitFlow のデータを読めませんでした（' + esc(_err) + '）') : 'PitFlow のデータを読み込んでいます…') + '</div></div>';
      return;
    }
    var R = todayItems();
    var h = '<div class="panel-card pe-today">';
    h += '<h3>' + icon('wrench', '🔧', 16) + ' 今日・明日の整備依頼'
       + '<span class="pe-cnt' + (R.items.length ? ' on' : '') + '">' + R.items.length + '</span>'
       + '<button class="pe-more" onclick="showPanel(\'pitsales\',document.getElementById(\'si-pitsales\'))">整備依頼業務をひらく '
       + icon('chevRight', '›', 14) + '</button></h3>';
    if (!R.items.length) {
      h += '<div class="pe-none">' + icon('check', '✓', 15) + ' 今日・明日にやる整備依頼はありません</div>';
    } else {
      h += '<div class="pe-rows">';
      R.items.forEach(function (it) {
        var c = it.c;
        /* data-card-id ＝ マウスオーバーで詳細を出すため（js/pit-hover.js が読む） */
        h += '<div class="pe-row" data-card-id="' + esc(c.id) + '" onclick="PitEmbed.open(\'' + esc(c.id) + '\')" title="マウスを乗せると詳細／クリックで PitFlow のカードを開きます">';
        h += '<span class="pe-when ' + it.when + '">' + (it.when === 'today' ? '今日' : '明日') + '</span>';
        h += '<span class="pe-what pe-t-' + it.task + '">' + esc(it.what) + '</span>';
        h += '<span class="pe-nm">' + esc(custSurname(c) || '（未入力）') + ' 様</span>';
        h += '<span class="pe-car">' + esc(c.car || '') + '</span>';
        var t = c.returnTime || c.reserveTime || '';
        h += '<span class="pe-time">' + esc(t) + '</span>';
        h += '<button class="pe-ok" onclick="event.stopPropagation();PitEmbed.done(\'' + esc(c.id) + '\',\'' + it.task + '\')">'
           + icon('check', '✓', 14) + ' 済</button>';
        h += '</div>';
      });
      h += '</div>';
    }
    if (R.rest > 0) {
      h += '<div class="pe-rest">このほかに <b>' + R.rest + '件</b>（今週ぶん・日付未定など）'
         + '<button class="pe-restbtn" onclick="showPanel(\'pitsales\',document.getElementById(\'si-pitsales\'))">見る</button></div>';
    }
    h += '</div>';
    host.innerHTML = h;
  }

  /* ---------------- 完了／戻す（🔴 PitFlow に書く） ---------------- */
  function cardsCol() {
    if (!(window.fb && window.fb.db && window.fb.currentCompanyId)) return null;
    return window.fb.db.collection('companies').doc(window.fb.currentCompanyId).collection('pitCards');
  }
  function setDone(id, task, val) {
    var flag = DONEFLAG[task];
    var c = (PS.cards || []).find(function (x) { return x.id === id; });
    if (!flag || !c) return;
    var col = cardsCol();
    if (!col) { if (window.showToast) showToast('ログインが確認できません', 'CF-7001'); return; }

    var before = !!c[flag];
    c[flag] = !!val;                       /* 先に画面へ（押した感じを止めない） */
    renderPitSales(); renderPitToday();

    var patch = {};
    patch[flag] = !!val;
    /* 工程ログにも1行残す＝PitFlow で見た時に「誰かが CarFlow で済みにした」と分かる。
       ⚠ 配列は arrayUnion で足す（読み込み→書き戻しにすると、同時編集を巻き戻す）。 */
    if (val && window.firebase && firebase.firestore && firebase.firestore.FieldValue) {
      patch.log = firebase.firestore.FieldValue.arrayUnion({
        label: '車販作業 完了（' + (TASK_LABEL[task] || task) + '）／CarFlow',
        at: Date.now()
      });
    }
    /* 🔴🔴 2026-08-29 **PitFlow のカードは版番号（rev）で守られている。**
       ---------------------------------------------------------
       ◎背景（PitFlow で実際に起きた事故・2026-08-28）
         古い画面がカードを**まるごと**書き戻して、他の人の入庫・工程・返車・売上を消した。
         その対策として、**サーバー（Firestore のルール）が
         「新しい版 == いまの版 + 1」でない書き込みを受け付けない**ようになった。
       ◎ここが守られている理由
         CarFlow は `update` で**触る欄だけ**書く（まるごと差し替えない）ので、そもそも安全。
         それでも**版を1つ進めておかないとルールに弾かれる**ので、必ず足す。
       ⚠ `increment` を使う＝サーバー側で「いまの版＋1」になる。
          自分で数字を読んで書くと、読んだ後に誰かが直した時にズレる。
       ⚠ **この行を消すと、CarFlow から PitFlow のカードに一切書けなくなる。** */
    if (window.firebase && firebase.firestore && firebase.firestore.FieldValue) {
      patch.rev = firebase.firestore.FieldValue.increment(1);
    }
    col.doc(id).update(patch).then(function () {
      if (window.showToast) showToast(val ? '✓ 完了にしました（PitFlowにも反映）' : '↩ 戻しました（PitFlowにも反映）');
    }).catch(function (e) {
      c[flag] = before;                    /* 書けなかったら画面も戻す */
      renderPitSales(); renderPitToday();
      console.error('[pit-embed] 書き込みに失敗', e);
      if (window.showToast) showToast('PitFlow に反映できませんでした（通信または権限）', 'CF-7002');
    });
  }

  /* ---------------- 購読 ---------------- */
  function repaint() {
    try { renderPitSales(); } catch (e) { console.error('[pit-embed] renderPitSales', e); }
    try { renderPitToday(); } catch (e) { console.error('[pit-embed] renderPitToday', e); }
  }
  function start() {
    if (_started) return;
    var col = cardsCol();
    if (!col) return;                      /* ログイン前は何もしない */
    _started = true;

    var onSnap = function (snap) {
      var arr = [];
      snap.forEach(function (d) { var o = d.data() || {}; o.id = d.id; arr.push(o); });
      PS.cards = arr; _loaded = true; _err = '';
      repaint();
    };
    var onErr = function (e) {
      console.error('[pit-embed] pitCards を読めませんでした', e);
      _err = (e && e.code) || 'error';
      repaint();
    };
    try {
      /* まず「終わっていないカードだけ」で読む（軽い）。
         うまくいかない環境（インデックス等）では全件に落とす。 */
      _unsubCards = col.where('status', 'in', ACTIVE_STATUS).onSnapshot(onSnap, function (e) {
        console.warn('[pit-embed] 絞り込みで読めなかったので全件に切り替えます', e && e.code);
        try { _unsubCards = col.onSnapshot(onSnap, onErr); } catch (e2) { onErr(e2); }
      });
    } catch (e) { onErr(e); }

    try {
      _unsubSettings = window.fb.db.collection('companies').doc(window.fb.currentCompanyId)
        .collection('pitSettings').doc('main').onSnapshot(function (d) {
          if (!d.exists) return;
          var s = (d.data() || {}).settings || {};
          if (Array.isArray(s.workTypes) && s.workTypes.length) PS.workTypes = s.workTypes;
          if (s.loanerColors) PS.loanerColors = s.loanerColors;
          repaint();
        }, function (e) { console.warn('[pit-embed] pitSettings を読めませんでした（既定で続けます）', e && e.code); });
    } catch (e) {}
    /* 代車の一覧＝ホバー詳細で「何の代車か（車種名）」を出すためだけに読む。
       🔴 読めなくても画面は動く（代車番号だけになる）ので、失敗しても止めない。 */
    try {
      _unsubLoaners = window.fb.db.collection('companies').doc(window.fb.currentCompanyId)
        .collection('pitLoaners').onSnapshot(function (snap) {
          var arr = []; snap.forEach(function (d) { var o = d.data() || {}; o.id = d.id; arr.push(o); });
          PS.loaners = arr;
        }, function (e) { console.warn('[pit-embed] pitLoaners を読めませんでした（代車名なしで続けます）', e && e.code); });
    } catch (e) {}

    /* 🔴 v2.44.0 代車の**貸した札**（pitLoanerAssigns）も読む。
       ⚠ 「返ってきたか」は札に書いてある＝これを読まないと PitFlow と同じ答えにならない。
       ⚠ 読めなくても画面は動く（カードの印だけで判断する）ので、失敗しても止めない。 */
    try {
      _unsubAssigns = window.fb.db.collection('companies').doc(window.fb.currentCompanyId)
        .collection('pitLoanerAssigns').onSnapshot(function (snap) {
          var arr2 = []; snap.forEach(function (d) { var o = d.data() || {}; o.id = d.id; arr2.push(o); });
          PS.loanerAssigns = arr2;
          repaint();
        }, function (e) { console.warn('[pit-embed] pitLoanerAssigns を読めませんでした（返却の判定が鈍ります）', e && e.code); });
    } catch (e) {}

    /* 🔴 v2.44.0 共通部品に「CarFlow が読んだ PitFlow のデータ」を差し込む。
       ⚠ 渡すのは 貸した札 と 色の境目 の2つだけ。判定の中身は部品が持つ（PitFlow と同じもの）。 */
    if (window.CFLoanerRemain) {
      CFLoanerRemain.setup({
        assigns: function () { return PS.loanerAssigns || []; },
        colors:  function () { return PS.loanerColors || null; }
      });
    }

    /* 🔴 届く前でも「読み込んでいます」を出す＝**空っぽの画面を見せない**。
       ここを呼ばないと、データが来るまで枠ごと消えていて「壊れた？」に見える。 */
    repaint();
    console.log('[pit-embed] PitFlow のカードを購読しました');
  }

  /* ---------------- 外に出す ---------------- */
  window.PitEmbed = {
    start: start,
    render: repaint,
    renderPanel: renderPitSales,
    renderToday: renderPitToday,
    done: function (id, task) { setDone(id, task, true); },
    undo: function (id, task) { setDone(id, task, false); },
    open: function (id) {
      try { window.open(PITFLOW_URL + '/?card=' + encodeURIComponent(id), '_blank', 'noopener'); }
      catch (e) { location.href = PITFLOW_URL + '/?card=' + encodeURIComponent(id); }
    },
    /* 🖱 ホバー詳細（js/pit-hover.js）が使う窓口。
       🔴 ここは「読むだけ」。pit-hover.js から書き込みはしない。 */
    _api: {
      card: function (id) { return (PS.cards || []).find(function (x) { return x.id === id; }) || null; },
      wtOf: wtOf, dtOf: dtOf, spLabel: spLabel, loanerOf: loanerOf,
      custName: custName, loanerRem: loanerRem, loanerKey: loanerKey, esc: esc
    },
    /* テスト用の窓口（本体からは使わない） */
    _debug: { PS: PS, buildSections: buildSections, todayItems: todayItems, cardHtml: cardHtml,
              setLoaded: function (v) { _loaded = v; }, setCards: function (a) { PS.cards = a; _loaded = true; } }
  };

  /* ログインが済むまで少しずつ様子を見る（auth.js には触らない） */
  var tries = 0;
  var iv = setInterval(function () {
    if (_started || ++tries > 120) { clearInterval(iv); return; }
    start();
  }, 500);
  start();
})();
