/* ========================================
   pit-hover.js  （CarFlow v2.34.0）
   整備依頼業務・ダッシュボードのカードをマウスオーバーすると、
   カードの右側に「情報カード」を固定で出す（バッジ位置に関係なく常に同じ場所）。
   ----------------------------------------
   🔴 これは PitFlow の js/card-hover.js の【写し】です。
      PitFlow を直したら、ここも直してください。
      test_pit_embed.mjs が両方のソースを見比べて、ずれたら落ちます。

   ⚠ PitFlow と意図的に違うところ（これだけ）：
      🔴 **CarFlow のホバーは「見るだけ」**。
         PitFlow のホバーは引継ぎメモ・確定金額・返車日/時間・洗車・お礼LINE を
         その場で直せますが、CarFlow では**読むだけの表示**にしてあります。
         理由＝「編集の本体は PitFlow。CarFlow から書くのは済みフラグ1個だけ」という
         2026-08-05 の決めごとのまま。ここで書けるようにすると、
         PitFlow 側の同時編集を巻き戻す事故が起きます。
         直したい時は、カードをクリック＝PitFlow がそのカードで開きます。

   データは PitEmbed._api から読むだけ（自分では Firestore を触らない）。
   ======================================== */
(function () {
  'use strict';

  var el = null, curId = null;
  var overRegion = false;          // カード or パネルの上にカーソルがあるか
  var hideTimer = null;

  function API() { return (window.PitEmbed && window.PitEmbed._api) || null; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function icon(name, fb, size) { return (window.ic ? ic(name, fb, size || 16) : (fb || '')); }

  /* PitFlow views.js の statusLabel / fmtMD / daysFromToday の写し */
  var STATUS_LABEL = {
    reserved: '予約', check: '点検待ち', estim: '見積り中', contact: '連絡中',
    parts: 'パーツ待ち', work: '作業待ち', workDone: '作業完了',
    returned: '返車完了', scrap: '廃車・乗替', outsource: '外注'
  };
  function statusLabel(s) { return STATUS_LABEL[s] || s || ''; }
  function fmtMD(s) {
    if (!s) return '';
    var p = String(s).split('-');
    return (p.length >= 3) ? (+p[1] + '/' + +p[2]) : s;
  }
  function daysFromToday(s) {
    if (!s) return null;
    var d = new Date(s + 'T00:00:00'); if (isNaN(d.getTime())) return null;
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }

  /* 今のフェーズに入った時刻(ms)。phaseAt 優先→ログの最後のフェーズ移動→入庫日 の順 */
  function phaseStartMs(c) {
    if (c.phaseAt) return c.phaseAt;
    var log = c.log || [];
    for (var i = log.length - 1; i >= 0; i--) {
      if (log[i] && log[i].type === 'phase' && log[i].to === c.status && log[i].at) return log[i].at;
    }
    if (c.reserveDate) { var d = new Date(c.reserveDate + 'T00:00:00'); if (!isNaN(d.getTime())) return d.getTime(); }
    return null;
  }
  function daysSinceMs(ms) {
    if (ms == null) return null;
    var t = new Date(); t.setHours(0, 0, 0, 0);
    var d = new Date(ms); d.setHours(0, 0, 0, 0);
    return Math.round((t - d) / 86400000);
  }
  /* 2つのISO日付の期間日数（両端含む） */
  function periodDays(aISO, bISO) {
    if (!aISO || !bISO) return null;
    var a = new Date(aISO + 'T00:00:00'), b = new Date(bISO + 'T00:00:00');
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000) + 1;
  }

  function ensureEl() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'pit-hovercard';
    document.body.appendChild(el);
    /* パネル自体にカーソルが乗っている間は消さない（カード→パネルへ移動して読める） */
    el.addEventListener('mouseenter', function () { overRegion = true; cancelHide(); });
    el.addEventListener('mouseleave', function () { overRegion = false; scheduleHide(); });
    /* 🔴 入力欄は置かない＝ここに input/change/click の保存処理は無い（見るだけ）。 */
    return el;
  }
  function cancelHide() { clearTimeout(hideTimer); }
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (overRegion) return;
      hide();
    }, 280);
  }

  function fill(c) {
    var api = API(); if (!api) return;
    var team = (c.boardId === 'import') ? 'y' : 'k';
    var teamLabel = (team === 'y') ? '輸入車' : '国産車';
    var ku = (c.division === 'div2') ? '2課' : (c.division === 'div1' ? '1課' : (c.boardId === 'import' ? '2課' : '1課'));
    var staff = c.frontStaff || c.staff || '';
    var carTxt = (c.maker ? esc(c.maker) + ' ' : '') + esc(c.car || '（車種未入力）');

    var h = '';
    h += '<div class="ph-head">';
    if (c.resNo) h += '<span class="ph-resno">' + esc(c.resNo) + '</span>';
    h += '<span class="ph-pill ph-team ' + team + '">' + teamLabel + '</span>';
    h += '<span class="ph-pill ph-div">' + ku + '</span>';
    if (staff) h += '<span class="ph-staffwrap"><span class="ph-stafflb">担当</span><span class="ph-staff">' + esc(staff) + '</span></span>';
    h += '</div>';
    h += '<div class="ph-name">' + esc(api.custName(c) || '（未入力）') + ' <small>様</small></div>';
    if (c.kana) h += '<div class="ph-kana">' + esc(c.kana) + '</div>';
    h += '<div class="ph-car">' + carTxt + '</div>';
    if (c.plate || (c.karteNo || '').trim()) {
      h += '<div class="ph-plate-row">'
         + (c.plate ? '<span class="ph-plate">' + esc(c.plate) + '</span>' : '')
         + ((c.karteNo || '').trim() ? '<span class="ph-karte">' + esc(c.karteNo.trim()) + '</span>' : '')
         + '</div>';
    }

    /* ===== バッジ（該当するものだけ全部） ===== */
    (function () {
      var bd = [];
      if (c.tentative) bd.push('<span class="ph-b ph-b-kari" title="仮予約">仮</span>');
      var wids = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes : (c.workType ? [c.workType] : []);
      wids.forEach(function (id) {
        var w = api.wtOf(id);
        if (!w) return;
        var cd = ((id === 'coat1y' || id === 'coat3m') && c.coatingDone) ? ' ph-done' : '';
        bd.push('<span class="ph-b' + cd + '" style="background:' + w.color + '22;color:' + w.color + ';border-color:' + w.color + '88">' + esc(w.label) + '</span>');
      });
      (Array.isArray(c.workSpecials) ? c.workSpecials : []).forEach(function (id) {
        var lb = api.spLabel(id);
        if (lb) bd.push('<span class="ph-b ph-b-special">' + esc(lb) + '</span>');
      });
      if (c.dropType) {
        var mk = function (o) { return '<span class="ph-b ph-b-drop" title="' + esc(o.desc || '') + '">' + esc(o.label) + '</span>'; };
        var a = api.dtOf(c.dropType), b = c.dropType2 ? api.dtOf(c.dropType2) : null;
        bd.push((a && b) ? ('<span class="dbpair">' + mk(a) + mk(b) + '</span>') : (a ? mk(a) : (b ? mk(b) : '')));
      }
      if (c.needLoaner) bd.push('<span class="ph-b ph-b-loaner">代車</span>');
      if (c.needWash)   bd.push('<span class="ph-b ph-b-wash' + (c.washSalesDone ? ' ph-done' : '') + '">洗車</span>');
      if (c.consult)    bd.push('<span class="ph-b ph-b-consult">相談</span>');
      if (c.urgent)     bd.push('<span class="ph-b ph-b-urg">緊急</span>');
      if (c.codeRed)    bd.push('<span class="ph-b ph-b-red">クレーム</span>');
      if (c.testDrive)  bd.push('<span class="ph-b ph-b-td">試運転</span>');
      if (c.headlight)  bd.push('<span class="ph-b ph-b-hl' + (c.headlightDone ? ' ph-done' : '') + '">ライト磨き</span>');
      if (c.coatingOK)  bd.push('<span class="ph-b ph-b-coat">コーティング受注</span>');
      if (c.salesReq)   bd.push('<span class="ph-b ph-b-sales' + (c.salesReqDone ? ' ph-done' : '') + '">車販依頼</span>');
      if (c.earlyDiscount) bd.push('<span class="ph-b ph-b-early">早期割</span>');
      var hdr = Array.isArray(c.drive) ? c.drive : [];
      if (hdr.indexOf('leftHand') >= 0 && hdr.indexOf('mt') >= 0) bd.push('<span class="ph-b ph-b-cau">左M/T</span>');
      else {
        if (hdr.indexOf('leftHand') >= 0) bd.push('<span class="ph-b ph-b-cau">左ハンドル</span>');
        if (hdr.indexOf('mt') >= 0) bd.push('<span class="ph-b ph-b-cau">M/T</span>');
      }
      if (hdr.indexOf('lowCar') >= 0)  bd.push('<span class="ph-b ph-b-cau">車高低い</span>');
      if (hdr.indexOf('noShoes') >= 0) bd.push('<span class="ph-b ph-b-cau">土足禁止</span>');
      if (bd.length) h += '<div class="ph-badges">' + bd.join('') + '</div>';
    })();

    /* ===== 経過日数。予約（入庫前）は予約日だけ ===== */
    var resv = (c.status === 'reserved');
    h += '<div class="ph-stats' + (resv ? (c.needLoaner ? ' ph-stats-2' : ' ph-stats-1') : '') + '">';

    if (resv) {
      var rd = c.reserveDate;
      var rmd = rd ? fmtMD(rd) : '未定';
      var rn = rd ? daysFromToday(rd) : null;
      var rsub = (rn == null) ? '日付未定' : (rn > 0 ? ('あと' + rn + '日') : (rn === 0 ? '今日' : (Math.abs(rn) + '日前')));
      h += '<div class="ph-stat s-resv"><div class="ph-stat-lb">予約</div>'
         + '<div class="ph-stat-num">' + esc(rmd) + '</div>'
         + '<div class="ph-stat-sub">' + rsub + '</div></div>';
      if (c.needLoaner) {
        var lo = api.loanerOf(c.loanerId);
        var loMain = (lo && lo.model) ? lo.model : (lo ? lo.name : (c.loanerId || '代車'));
        var loNo = lo ? (lo.name || '') : '';
        var loSub = (loNo ? loNo + '　' : '') + (c.loanerFrom ? (fmtMD(c.loanerFrom) + '〜') : '期間未定');
        h += '<div class="ph-stat s-resv-loaner"><div class="ph-stat-lb">代車</div>'
           + '<div class="ph-stat-num" style="font-size:14px">' + esc(loMain) + '</div>'
           + '<div class="ph-stat-sub">' + esc(loSub) + '</div></div>';
      }
    } else if (c.status === 'returned') {
      var retF = c.returnDateFinal || c.returnDate || '';
      var hStart = c.reserveDate || '';
      var hd = periodDays(hStart, retF);
      var hsub = (hStart && retF) ? (fmtMD(hStart) + '〜' + fmtMD(retF)) : (hStart ? fmtMD(hStart) + '〜' : '—');
      h += '<div class="ph-stat s-hold"><div class="ph-stat-lb">預かり期間</div>'
         + '<div class="ph-stat-num">' + (hd != null ? hd : '—') + '<span class="u">日間</span></div>'
         + '<div class="ph-stat-sub">' + esc(hsub) + '</div></div>';
      if (!c.needLoaner) {
        h += '<div class="ph-stat s-loaner lv-none"><div class="ph-stat-lb">代車</div>'
           + '<div class="ph-stat-num">なし</div><div class="ph-stat-sub">&nbsp;</div></div>';
      } else {
        var lo2 = api.loanerOf(c.loanerId);
        var loNm = lo2 ? (lo2.model || lo2.name || '') : (c.loanerId || '');
        var lStart = c.loanerFrom || '';
        var lEnd = c.loanerTo || retF || '';
        var ld = periodDays(lStart, lEnd);
        var lsub = (lStart && lEnd) ? (fmtMD(lStart) + '〜' + fmtMD(lEnd)) : '期間未定';
        h += '<div class="ph-stat s-ldone"><div class="ph-stat-lb">代車</div>'
           + '<div class="ph-stat-num">' + (ld != null ? ld : '—') + '<span class="u">日間</span></div>'
           + '<div class="ph-stat-sub">' + (loNm ? esc(loNm) + '　' : '') + esc(lsub) + '</div></div>';
      }
      var fa = c.amountFinal;
      var faStr = (fa != null && fa !== '') ? ('¥' + Number(fa).toLocaleString()) : '—';
      h += '<div class="ph-stat s-amt"><div class="ph-stat-lb">確定金額</div>'
         + '<div class="ph-stat-num" style="font-size:16px">' + faStr + '</div><div class="ph-stat-sub">請求額</div></div>';
    } else {
      /* ① 預かり */
      var holdN = (function () { var n = daysFromToday(c.reserveDate); return (n == null) ? null : (1 - n); })();
      h += '<div class="ph-stat s-hold"><div class="ph-stat-lb">預かり</div>'
         + '<div class="ph-stat-num">' + (holdN != null ? holdN : '—') + '<span class="u">日目</span></div>'
         + '<div class="ph-stat-sub">' + (c.reserveDate ? (fmtMD(c.reserveDate) + '〜') : '未定') + '</div></div>';

      /* ② このフェーズ（外注の時は「完了予定 〇/〇」） */
      var pms = phaseStartMs(c);
      var phaseN = (function () { var n = daysSinceMs(pms); return (n == null) ? null : (n + 1); })();
      if (c.status === 'outsource') {
        var dueTxt = c.outsourceDue ? (function () { var p = String(c.outsourceDue).split('-'); return (+p[1]) + '/' + (+p[2]); })() : '未定';
        h += '<div class="ph-stat s-phase"><div class="ph-stat-lb">外注作業</div>'
           + '<div class="ph-stat-num">' + (phaseN != null ? phaseN : '—') + '<span class="u">日目</span></div>'
           + '<div class="ph-stat-sub">〜' + esc(dueTxt) + '</div></div>';
      } else {
        var phaseLb = statusLabel(c.status);
        var phaseSub = pms != null ? (function () { var d = new Date(pms); return (d.getMonth() + 1) + '/' + d.getDate() + '〜'; })() : '—';
        h += '<div class="ph-stat s-phase"><div class="ph-stat-lb">このフェーズ<br>（' + esc(phaseLb) + '）</div>'
           + '<div class="ph-stat-num">' + (phaseN != null ? phaseN : '—') + '<span class="u">日目</span></div>'
           + '<div class="ph-stat-sub">' + phaseSub + '</div></div>';
      }

      /* ③ 代車リミット */
      if (!c.needLoaner) {
        h += '<div class="ph-stat s-loaner lv-none"><div class="ph-stat-lb">代車</div>'
           + '<div class="ph-stat-num">なし</div><div class="ph-stat-sub">&nbsp;</div></div>';
      } else {
        var rem = api.loanerRem(c);
        var lv = api.loanerKey(rem);
        var due = c.loanerTo || c.returnDateFinal || c.returnDate || '';
        var dueTxt2 = due ? ('〜' + fmtMD(due)) : '期限未設定';
        var numHtml, pct;
        if (rem == null) { numHtml = '返却日<br>未定'; pct = 0; }
        else if (rem < 0) { numHtml = Math.abs(rem) + '<span class="u">日超過</span>'; pct = 100; }
        else { numHtml = 'あと' + rem + '<span class="u">日</span>'; pct = Math.max(6, Math.min(100, Math.round(rem / 7 * 100))); }
        h += '<div class="ph-stat s-loaner lv-' + lv + '"><div class="ph-stat-lb">代車リミット</div>'
           + '<div class="ph-stat-num">' + numHtml + '</div><div class="ph-stat-sub">' + esc(dueTxt2) + '</div>'
           + '<div class="ph-meter"><i style="width:' + pct + '%"></i></div></div>';
      }
    }
    h += '</div>'; /* .ph-stats */

    /* ===== 注意（外注先） ===== */
    if (c.status === 'outsource') {
      h += '<div class="ph-note">' + icon('external', '↗', 16) + ' 外注先：' + esc(c.outsourceTo || '未定')
         + (c.outsourceNote ? '（' + esc(c.outsourceNote) + '）' : '') + '</div>';
    }

    /* ===== 下部メモ群 ===== */
    if (c.needLoaner && (c.loanerFixed || (c.loanerOther || '').trim())) {
      h += '<div class="ph-sec ph-sec-loaner"><div class="ph-sec-lb">' + icon('van', '🚐', 16) + ' 代車条件</div>'
        + '<div class="ph-sec-body">'
        + (c.loanerFixed ? '<span class="ph-fix">固定</span>' : '')
        + ((c.loanerOther || '').trim() ? '<span class="ph-lmemo">' + esc(c.loanerOther) + '</span>' : '')
        + '</div></div>';
    }
    var resmemo = (c.menu || c.memo || '').trim();
    h += '<div class="ph-sec"><div class="ph-sec-lb">' + icon('pencil', '✎', 16) + ' 予約内容メモ</div>'
       + '<div class="ph-sec-body ph-memo">'
       + (resmemo ? esc(resmemo).replace(/\n/g, '<br>') : '<span class="ph-empty">（なし）</span>')
       + '</div></div>';

    /* 🔴 引継ぎメモ＝PitFlow では入力欄。CarFlow は【読むだけ】 */
    var hom = (c.handoffMemo || '').trim();
    h += '<div class="ph-sec"><div class="ph-sec-lb">' + icon('refresh', '↻', 16) + ' 引継ぎメモ</div>'
       + '<div class="ph-sec-body ph-memo">'
       + (hom ? esc(hom).replace(/\n/g, '<br>') : '<span class="ph-empty">（なし）</span>')
       + '</div></div>';

    /* 🔴 完TEL / 返車＝PitFlow では入力欄。CarFlow は【読むだけ】 */
    if (c.returnStage && c.status !== 'returned') {
      var amtStr = (c.amountFinal != null && c.amountFinal !== '') ? ('¥' + Number(c.amountFinal).toLocaleString()) : '';
      var washOn = (c.needWash !== false);
      var lineOn = !c.noThanksLine;
      var ro = function (k, v) {
        return '<div class="ph-ro-row"><span class="ph-ro-k">' + k + '</span>'
             + '<span class="ph-ro-v' + (v ? '' : ' is-empty') + '">' + (v || '未入力') + '</span></div>';
      };
      h += '<div class="ph-sec">';
      h += '<div class="ph-sec-lb">' + icon('phone', '☎', 16) + ' 完TEL / 返車</div>';
      h += ro('確定金額', esc(amtStr));
      h += ro('返車予定日', c.returnDate ? esc(fmtMD(c.returnDate)) : '');
      h += ro('返車時間', esc(c.returnTime || ''));
      h += ro('洗車', '<span class="ph-ro-yn' + (washOn ? ' on' : '') + '">' + (washOn ? '要' : '不要') + '</span>'
                    + ((c.washNote || '').trim() ? ' <span class="ph-lmemo">' + esc(c.washNote.trim()) + '</span>' : ''));
      h += ro('お礼LINE', '<span class="ph-ro-yn' + (lineOn ? ' on' : '') + '">' + (lineOn ? '要' : '不要') + '</span>');
      h += '</div>';
    }

    /* 🛒 車販依頼メモ */
    if (c.salesReq && (c.salesReqMemo || '').trim()) {
      h += '<div class="ph-sec"><div class="ph-sec-lb">' + icon('cart', '🛒', 16) + ' 車販依頼メモ</div>'
         + '<div class="ph-sec-body ph-sales-line">' + esc(c.salesReqMemo) + '</div></div>';
    }

    /* 🔴 ここは見るだけ、と必ず伝える（PitFlow と違うので、書けると思わせない） */
    h += '<div class="ph-ro-hint">ここは見るだけです。直すときは、カードをクリック → PitFlow がこのカードで開きます。</div>';

    ensureEl().innerHTML = h;
  }

  function position(cardEl) {
    var ic2 = ensureEl();
    var r = cardEl.getBoundingClientRect();
    var w = 300, gap = 10;
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var left = r.right + gap;
    if (left + w > vw - 8) {            /* 右にはみ出す→カードの左へ */
      left = r.left - w - gap;
      if (left < 8) left = 8;
    }
    ic2.style.left = left + 'px';
    ic2.style.top = r.top + 'px';
    var hh = ic2.offsetHeight;
    var top = r.top;
    if (top + hh > vh - 8) {            /* 下にはみ出す→持ち上げ */
      top = vh - hh - 8;
      if (top < 58) top = 58;
    }
    ic2.style.top = top + 'px';
  }

  function show(cardEl) {
    var api = API(); if (!api) return;
    var id = cardEl.dataset.cardId;
    if (!id) return;
    var c = api.card(id);
    if (!c) return;
    curId = id;
    fill(c);
    ensureEl().classList.add('show');
    position(cardEl);
  }
  function hide() { curId = null; overRegion = false; if (el) el.classList.remove('show'); }

  /* 出す対象：整備依頼業務のカード（.pit-card.pcm）と、ダッシュボードの1行（.pe-row）。 */
  var HOVER_SEL = '.pit-card.pcm, .pe-row';
  document.addEventListener('mouseover', function (e) {
    var card = e.target.closest && e.target.closest(HOVER_SEL);
    if (!card) return;
    if (!card.dataset || !card.dataset.cardId) return;
    overRegion = true; cancelHide();
    if (card.dataset.cardId === curId) return;   /* 同じカード上の移動は無視 */
    show(card);
  });
  document.addEventListener('mouseout', function (e) {
    var card = e.target.closest && e.target.closest(HOVER_SEL);
    if (!card) return;
    var to = e.relatedTarget;
    if (to && to.closest && (to.closest(HOVER_SEL) || (el && el.contains(to)))) return;
    overRegion = false; scheduleHide();
  });
  /* スクロール中は隠す（位置ズレ防止）。パネル内のスクロールは維持 */
  document.addEventListener('scroll', function (e) {
    if (el && el.contains(e.target)) return;
    hide();
  }, true);

  /* テスト用の窓口（本体からは使わない） */
  window.PitHover = { _debug: { fill: fill, show: show, hide: hide, statusLabel: statusLabel, fmtMD: fmtMD } };
})();
