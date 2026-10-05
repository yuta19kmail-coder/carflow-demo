/* ================================================================================
   analytics-car.js  -  📊 分析用の書き出し（Claude が読む表）  CarFlow v3.7.0
   ================================================================================
   ◎ゆうた指定（2026-10-05）
     🗣「ありとあらゆるデータをあなたに渡すってのがイメージの全容」
     決まりの本体＝`..\..\..\_記録\仕様\分析用の書き出し_全アプリ共通の決まり.md`（全アプリ共通）
     手本＝PitFlow の `js\analytics-pit.js`（1本目）

   ◎これは何
     車1台＝1行の表（CSV）と、その列の説明書（辞書）を作る。
     🔴 **画面は持たない。** 毎晩サーバー（`_サーバー\functions\`）が
        **本番のこのファイルをそのまま読み込んで** window.CF_ANALYTICS を呼ぶ＝画面と表の数え方が必ず同じ。
     🔴 **数え方はここで作らない。** 借りている物＝
        売れた車を1回だけ数える `soldPool`（state.js）／金額の税換算 `_amountFromCarWithSnapshot`（helpers.js）／
        売上計上日 `recogDateAny`・年式 `parseYearInput`（helpers.js）／進捗 `calcProg`・`calcBackofficeProg`（progress.js）／
        状態の言葉 `COLS`（config.js）。
        ここで足したのは「日数の引き算」「MINI のまとめ方（PitFlow の pitCardMaker と同じ決まり）」「呼び名」「伏せ字」だけ。

   ◎読み込み（fill）は auth.js の起動時の読み込みと同じ形
     cars / archivedCars / deletedCars ＝ 配列の中身を入れ替える（auth.js の cars.length = 0 → push）
     settings/main ＝ db-settings.js の _applyToMemory（loadSettings が使う物そのもの）で既定値に重ねる
     checklistTemplates ＝ db-templates.js の replaceInMemory（refreshTemplates と同じ：1件以上ある時だけ）

   ◎出さないもの（決まり §6）
     🔴 お客様のフルネーム・下の名前・電話・住所・メール・LINE・ナンバーは**どの列にも入れない**。
     お客様は「苗字＋車種」の呼び名だけ。苗字が切り出せない時は「（苗字不明）」。
     メモ（自由記述）は電話・メール・ナンバーらしき文字と、その車のお客様の名前を伏せ字にしてから出す。

   ⚠ 読み込みは config / tasks-def / checklist-templates / steps / db-settings / db-templates / state / helpers /
      progress / equipment-view より**後ろ**（それらを借りる）。並びは test_analytics.mjs の FILES が正。
   ================================================================================ */
(function (w) {
  'use strict';

  var VERSION = '1';   /* 🔴 列を足す・意味を変えたら上げる（辞書の頭に出る） */

  function s(v){ return v == null ? '' : String(v); }
  function t(v){ return s(v).trim(); }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function ymd(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function safe(fn, dflt){ try { var v = fn(); return v == null ? dflt : v; } catch (e) { return dflt; } }
  /* 画面の部品を借りる。`let`/`const` で置かれた物（cars・COLS・appSettings…）は window に乗らないので typeof で拾う */
  function fnOf(name){
    switch (name){
      case 'cars':         return typeof cars !== 'undefined' ? cars : null;
      case 'archivedCars': return typeof archivedCars !== 'undefined' ? archivedCars : null;
      case 'deletedCars':  return typeof deletedCars !== 'undefined' ? deletedCars : null;
      case 'COLS':         return typeof COLS !== 'undefined' ? COLS : null;
      case 'appSettings':  return typeof appSettings !== 'undefined' ? appSettings : null;
    }
    return typeof w[name] === 'function' ? w[name] : null;
  }

  /* 日付：'YYYY-MM-DD…' ／ ISO ／ ミリ秒 ／ Firestore の時刻（{seconds}・{_seconds}・toDate）→ 'YYYY-MM-DD'（日本時間の暦） */
  function day(v){
    if (v == null || v === '') return '';
    if (typeof v === 'string'){
      var m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(v.trim());
      if (m && v.trim().length <= 10) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
      var d0 = new Date(v); return isNaN(d0) ? (m ? m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]) : '') : ymd(d0);
    }
    var ms = null;
    if (typeof v === 'number') ms = v;
    else if (typeof v === 'object'){
      if (typeof v.toDate === 'function') ms = safe(function () { return v.toDate().getTime(); }, null);
      else if (v.seconds != null) ms = Number(v.seconds) * 1000;
      else if (v._seconds != null) ms = Number(v._seconds) * 1000;
    }
    if (ms == null || !isFinite(ms)) return '';
    return ymd(new Date(ms));
  }
  /* a → b の日数（ダッシュボード・販売実績の在庫日数と同じ引き算＝暦の日の差） */
  function days(a, b){
    a = day(a); b = day(b); if (!a || !b) return null;
    var p = a.split('-'), q = b.split('-');
    return Math.round((new Date(+q[0], q[1] - 1, +q[2]) - new Date(+p[0], p[1] - 1, +p[2])) / 864e5);
  }
  function nonNeg(n){ return n == null ? '' : Math.max(0, n); }

  /* ================================================================
     🚗 メーカー：BMW の MINI と MINI は「MINI」（決まり §6・PitFlow の pitCardMaker と同じ決まり）
     ================================================================ */
  function isMini(c){
    var x = s(c && c.model) + ' ' + s(c && c.maker);
    return /ミニ|MINI|ﾐﾆ/i.test(x) && !/ミニカ|ミニキャブ|ミニバン/.test(s(c && c.model));
  }
  function makerOf(c){ return isMini(c) ? 'MINI' : t(c && c.maker); }

  /* ================================================================
     👤 呼び名＝苗字＋車種（決まり §6・ゆうた指定）
     🔴 下の名前を出さない。
       ・会社名ならそのまま
       ・空白で区切られていれば最初の区切りまで（＝姓）
       ・区切りが無い個人名は「（苗字不明）」（姓と名の境目を決めつけない）
     ================================================================ */
  var CORP = /[㈱㈲]|\(同\)|[（(][株有同合][)）]|株式会社|有限会社|合同会社|会社|組合|法人|商会|商店|商事|工業|産業|モータース|オート|自動車|ガレージ|サービス|ホールディングス/;
  function custName(c){
    var n = t(c && c.customerName);
    n = (typeof w.normCustomerName === 'function') ? w.normCustomerName(n) : n.replace(/\s+/g, ' ').trim();
    return n.replace(/\s*(様|さま|御中|殿|どの|さん|ちゃん|くん)$/, '').trim();
  }
  function surnameOf(c){
    var n = custName(c);
    if (!n) return '';
    if (CORP.test(n)) return n;
    var parts = n.split(/[\s　]+/);
    return parts.length >= 2 ? parts[0] : '（苗字不明）';
  }
  function callName(c){
    var a = surnameOf(c); if (!a) return '';
    var car = t(c.model);
    return a + (car ? ' ' + car : '');
  }

  /* ================================================================
     🙈 自由記述の伏せ字（電話・メール・LINE・ナンバー・その車のお客様の名前）
     ================================================================ */
  function mask(text, c){
    var x = s(text);
    if (!x.trim()) return '';
    x = x.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '［メール］');
    x = x.replace(/LINE\s*(ID)?\s*[:：]?\s*@?[\w.\-]{3,}/gi, '［LINE］');
    x = x.replace(/[0０][0-9０-９]{1,4}[-‐ー−―\s(（)）]{0,2}[0-9０-９]{1,4}[-‐ー−―\s)）]{0,2}[0-9０-９]{3,4}/g, '［電話］');
    x = x.replace(/[0-9０-９]{10,}/g, '［電話］');
    x = x.replace(/[぀-ゟ]\s*[0-9０-９・]{1,2}[-‐ー−―][0-9０-９]{2}/g, '［ナンバー］');
    x = x.replace(/(^|[^0-9０-９\-‐ー−―/:：.])[0-9０-９]{2}[-‐ー−―][0-9０-９]{2}(?![0-9０-９\-‐ー−―/:：.])/g, '$1［ナンバー］');   /* 日付（2026-09-01）は残す */
    var n = custName(c);
    if (n){
      var sur = surnameOf(c);
      if (!CORP.test(n)){
        var parts = n.split(/[\s　]+/).filter(function (p) { return p.length >= 1; });
        var full = parts.join('');
        if (full.length >= 2) x = x.split(full).join(sur && sur !== '（苗字不明）' ? sur : '〇〇');
        x = x.split(n).join(sur && sur !== '（苗字不明）' ? sur : '〇〇');
        parts.slice(1).forEach(function (p) { if (p.length >= 1) x = x.split(p).join('〇〇'); });
      }
    }
    return x.replace(/\r\n|\r|\n/g, ' / ').replace(/\s{2,}/g, ' ').trim();
  }

  /* CSV の1マス（PitFlow の cell と同じ） */
  function cell(v){
    if (v == null) return '';
    var x = (typeof v === 'number') ? String(v) : s(v);
    return /[",\r\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
  }

  /* 金額：入力が空なら空（0 にしない）。税抜・円・整数 */
  function hasNum(v){ return v !== '' && v != null && isFinite(Number(String(v).replace(/,/g, ''))); }
  function yenExcl(c, source){
    var f = fnOf('_amountFromCarWithSnapshot');
    if (!f) return '';
    return Math.round(f(c, source, 'excl'));
  }

  /* 登録した人＝いちばん古い「新規登録」「仮登録から」の操作ログの人（名簿の表示名） */
  function registeredBy(c){
    var L = Array.isArray(c.logs) ? c.logs : [];
    for (var i = L.length - 1; i >= 0; i--){
      var e = L[i]; if (!e) continue;
      if (/^(新規登録|仮登録から)/.test(t(e.action))) return t(e.user) === '—' ? '' : t(e.user);
    }
    return '';
  }

  function colLabel(id){
    var C = fnOf('COLS') || [];
    var r = C.filter(function (x) { return x && x.id === id; })[0];
    return r ? r.label : t(id);
  }

  /* ================================================================
     📊 列
     ================================================================ */
  var COLS_DEF = [
    ['アプリ', '常に carflow'],
    ['ID', '車の番号（Firestore の文書ID）。在庫・実績・削除台帳で同じ車は同じID'],
    ['書き出した日', 'この表を作った日'],
    ['管理番号', 'カードの管理番号（例 KM-0521）。空＝番号なし（その他の車など）'],
    ['置き場', '在庫（cars）／実績（月次締め済み・archivedCars）／正式削除（AA出品・売約不成立・廃車など・deletedCars）'],
    ['状態', 'カンバンの列（その他・仕入れ・展示準備中・展示中・納車準備・納車完了）。正式削除は空（台帳に列が残っていない）'],
    ['売約', '売約済みなら 1、まだなら 0。正式削除は空（分からない）'],
    ['オーダー', 'オーダー車両（在庫として数えない）なら 1、ちがえば 0'],
    ['メーカー', 'カードのメーカー。BMW の MINI と MINI はまとめて MINI（全アプリ共通の決まり）'],
    ['車種', 'カードの車種'],
    ['グレード', 'カードのグレード'],
    ['年式', '西暦（和暦の入力も西暦に直す＝parseYearInput）。読めなければ空'],
    ['色', 'カードの色。未入力（—）は空'],
    ['ボディ', 'ボディサイズ（軽自動車・コンパクト…）'],
    ['走行距離km', '数字。⚠ 新規登録で空欄のまま保存すると 0 が入る＝0 は「0km か未入力」'],
    ['呼び名', '買ったお客様の苗字＋車種。読む用で、数える・結ぶ鍵にはしない。苗字が切り出せない時は（苗字不明）。空＝お客様の名前が入っていない（在庫の車はふつう空）'],
    ['仕入れ日', 'purchaseDate。在庫日数の起点。仮登録から上げた車は「来た日」'],
    ['展示開始日', 'はじめて展示中の列に入った日（exhibitedAt）。空＝まだ展示していない／記録の無い古い車'],
    ['売約日', 'contractDate。空＝売約していない'],
    ['納車日', 'deliveryDate。納車完了なら実際の納車日、売約中なら予定日'],
    ['締めた月', '月次集計締めをした月（YYYY-MM）。在庫の車は空'],
    ['売上計上日', '売上に数える日（recogDateAny＝設定の「売上計上」が納車基準なら納車日・売約基準なら売約日）。まだ計上されない車は空'],
    ['削除日', '正式削除した日。正式削除の行だけ'],
    ['在庫日数', '仕入れ日 → 納車日（納車完了の車）／仕入れ日 → 書き出した日（それ以外）。ダッシュボード・販売実績の平均在庫日数と同じ引き算。オーダー車両・仕入れ日が無い車は空'],
    ['展示までの日数', '仕入れ日 → 展示開始日（再生・準備にかかった日数）。どちらかが空なら空'],
    ['売約までの日数', '仕入れ日 → 売約日。オーダー車両は空'],
    ['売約から納車までの日数', '売約日 → 納車日（納車完了の車だけ）'],
    ['売約からの日数', '売約済みでまだ納車完了でない車の、売約日 → 書き出した日（カンバンの「売約N日」と同じ起点）'],
    ['本体価格', '税抜・円。各車の税扱い（納車完了時に固定した物、無ければ今の設定）で税抜に直した（_amountFromCarWithSnapshot）。空＝価格未入力'],
    ['総額', '支払総額を税抜・円に直した物。空＝総額未入力'],
    ['諸費用等', '総額 − 本体価格（税抜）。アプリに諸費用の欄は無いので差で出している。どちらかが空なら空'],
    ['売上金額', '税抜・円。ダッシュボード・販売実績が数える金額（設定「集計の元データ」＝本体 or 総額）を税抜にした物。空＝価格未入力'],
    ['価格の税扱い', '入力された金額の税扱い（本体：税込/税抜・総額：税込/税抜・税率%）'],
    ['税扱いの固定', '納車完了の時に税扱いを固定していれば 1（以後の設定変更で金額が動かない）。0＝今の設定で計算'],
    ['進捗', '作業の進み具合 %（calcProg＝カードの%と同じ）。売約前は再生側・売約後は納車側のタスク。正式削除は空'],
    ['事務進捗', 'バックオフィス（書類・原価処理など）の進み具合 %（calcBackofficeProg）。正式削除は空'],
    ['事務完了', 'バックオフィス完了なら 1、ちがえば 0'],
    ['事務完了日', 'バックオフィスを完了にした日'],
    ['見積の数', '価格履歴に登録した見積PDFの数（0＝本当に0）'],
    ['値下げ回数', '見積PDFの理由が「値下げ」の数'],
    ['最後の見積日', 'いちばん新しい見積PDFを登録した日'],
    ['登録した人', 'その車を新規登録（または仮登録から上げた）人。操作ログの名前（名簿の表示名）。空＝ログが無い'],
    ['メモ', 'カードのメモ（自由記述）。電話・メール・LINE・ナンバーらしき文字と、お客様の名前は伏せ字。改行は「 / 」']
  ];

  /* ================================================================
     📥 データを入れる（auth.js の起動時の読み込みと同じ形）
     ================================================================ */
  var SOURCES = {
    cols: ['companies/{cid}/cars', 'companies/{cid}/archivedCars', 'companies/{cid}/deletedCars', 'companies/{cid}/checklistTemplates'],
    docs: ['companies/{cid}/settings/main']
  };
  function pick(obj, tmpl){
    obj = obj || {};
    if (Object.prototype.hasOwnProperty.call(obj, tmpl)) return obj[tmpl];
    var re = new RegExp('^' + tmpl.split('{cid}').map(function (p) { return p.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&'); }).join('[^/]+') + '$');
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k) && re.test(k)) return obj[k];
    return undefined;
  }
  function refill(arr, list){
    if (!Array.isArray(arr)) return;
    arr.length = 0;
    (Array.isArray(list) ? list : []).forEach(function (x) {
      if (x && typeof x === 'object'){ if (!x.id && x._docId) x.id = x._docId; arr.push(x); }
    });
  }
  function fill(data){
    /* 箱の外で作られた配列・日付と混ざらないよう、箱の中で作り直す */
    data = JSON.parse(JSON.stringify(data || {}));
    var C = data.cols || {}, D = data.docs || {};
    refill(fnOf('cars'), pick(C, SOURCES.cols[0]));                 /* auth.js：cars.length = 0 → push */
    var sv = pick(D, SOURCES.docs[0]);                                /* auth.js：dbSettings.loadSettings → _applyToMemory */
    if (sv && w.dbSettings && typeof w.dbSettings._applyToMemory === 'function') w.dbSettings._applyToMemory(sv);
    refill(fnOf('archivedCars'), pick(C, SOURCES.cols[1]));         /* auth.js：archivedCars.length = 0 → push */
    refill(fnOf('deletedCars'), pick(C, SOURCES.cols[2]));          /* auth.js：deletedCars.length = 0 → push */
    var tl = pick(C, SOURCES.cols[3]);                                /* db-templates.js refreshTemplates：1件以上ある時だけ置き換え */
    if (Array.isArray(tl) && tl.length && w.dbTemplates && typeof w.dbTemplates.replaceInMemory === 'function') w.dbTemplates.replaceInMemory(tl);
    var n = 0; [C].forEach(function (o) { for (var k in o) if (Array.isArray(o[k])) n += o[k].length; });
    return n;
  }

  /* ================================================================
     📊 表を作る
     ================================================================ */
  function build(opt){
    opt = opt || {};
    var today = opt.today || ymd(new Date());
    var pool = (fnOf('soldPool') || function () { return []; })();     /* 実績＋在庫（同じ車は1回だけ） */
    var arcIds = {};
    (fnOf('archivedCars') || []).forEach(function (c) { if (c && c.id) arcIds[c.id] = 1; });
    var seen = {};
    var list = [];
    pool.forEach(function (c) { if (c && c.id && !seen[c.id]){ seen[c.id] = 1; list.push({ c: c, where: arcIds[c.id] ? '実績' : '在庫' }); } });
    (fnOf('deletedCars') || []).forEach(function (c) { if (c && c.id && !seen[c.id]){ seen[c.id] = 1; list.push({ c: c, where: '正式削除' }); } });
    list.sort(function (a, b) { return t(a.c.num).localeCompare(t(b.c.num)) || t(a.c.id).localeCompare(t(b.c.id)); });

    var ps = safe(function () { return fnOf('appSettings').priceTax; }, {}) || {};
    var source = (ps.dashboardSource === 'total') ? 'total' : 'body';
    var count = { 行: 0, 在庫: 0, 実績: 0, 正式削除: 0, 売約済み: 0, 価格あり: 0 };

    var rows = list.map(function (x) {
      var c = x.c, del = x.where === '正式削除';
      count.行++; count[x.where]++;
      if (!del && c.contract) count.売約済み++;
      var done = !del && (c.col === 'done' || !!c._archivedAt || x.where === '実績');
      var buy = day(c.purchaseDate), exh = day(c.exhibitedAt), con = c.contract ? day(c.contractDate) : '', dlv = day(c.deliveryDate);
      var inv = (del || c.isOrder || !buy) ? '' : nonNeg(days(buy, (done && dlv) ? dlv : today));
      var hasBody = !del && hasNum(c.price) && String(c.price).trim() !== '';
      var hasTotal = !del && Number(c.totalPrice) > 0;
      if (hasBody || hasTotal) count.価格あり++;
      var body = hasBody ? yenExcl(c, 'body') : '';
      var total = hasTotal ? yenExcl(c, 'total') : '';
      var sale = (source === 'total' ? (hasTotal || hasBody) : hasBody) ? yenExcl(c, source) : '';
      var tax = del ? null : safe(function () { return fnOf('getCarPriceTax')(c); }, null);
      var prog = del ? '' : safe(function () { return fnOf('calcProg')(c).pct; }, '');
      var bo = del ? '' : safe(function () { return fnOf('calcBackofficeProg')(c).pct; }, '');
      var est = Array.isArray(c.estimates) ? c.estimates.filter(Boolean) : [];
      var yr = safe(function () { return fnOf('parseYearInput')(c.year); }, null);
      var km = t(c.km).replace(/[,\s]/g, '').replace(/km$/i, '');
      var col = t(c.color);
      return [
        'carflow', c.id, today,
        t(c.num),
        x.where === '実績' ? '実績（締め済み）' : x.where,
        del ? '' : colLabel(c.col),
        del ? '' : (c.contract ? 1 : 0),
        c.isOrder ? 1 : 0,
        makerOf(c), t(c.model), t(c.grade),
        yr || '',
        (col === '—' ? '' : col),
        t(c.size),
        (km !== '' && isFinite(Number(km))) ? Number(km) : '',
        del ? '' : callName(c),
        buy, exh, con, dlv,
        t(c._archivedYM),
        del ? '' : day(safe(function () { return fnOf('recogDateAny')(c); }, '')),
        del ? day(c.deletedAt) : '',
        inv,
        nonNeg(days(buy, exh)),
        c.isOrder ? '' : nonNeg(days(buy, con)),
        done ? nonNeg(days(con, dlv)) : '',
        (!del && c.contract && !done) ? nonNeg(days(day(c.contractDate) || buy, today)) : '',
        body, total,
        (body !== '' && total !== '') ? total - body : '',
        sale,
        tax ? ('本体:' + (tax.body === 'excl' ? '税抜' : '税込') + ' 総額:' + (tax.total === 'excl' ? '税抜' : '税込') + ' ' + (tax.rate != null ? tax.rate : 10) + '%') : '',
        del ? '' : (c.priceTaxSnapshot ? 1 : 0),
        prog, bo,
        del ? '' : (c.backofficeCompleted ? 1 : 0),
        day(c.backofficeCompletedAt),
        del ? '' : est.length,
        del ? '' : est.filter(function (e) { return t(e.reason) === '値下げ'; }).length,
        est.length ? day(est[est.length - 1].at) : '',
        del ? '' : registeredBy(c),
        del ? '' : mask(c.memo, c)
      ];
    });

    var head = COLS_DEF.map(function (x) { return x[0]; });
    var csv = '﻿' + [head].concat(rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n';
    return { cols: head, rows: rows, csv: csv, dict: dict(today, count, source, opt), count: count };
  }

  /* ================================================================
     📖 辞書（表と必ず一緒に置く・決まり §5）
     ================================================================ */
  function dict(today, count, source, opt){
    var ver = t((opt && opt.appVersion) || w.CF_APP_VERSION || '');
    var L = [];
    L.push('# carflow.csv の辞書（版 ' + VERSION + '）');
    L.push('');
    L.push('- 書き出した日：' + today + (ver ? '（CarFlow ' + ver + '）' : ''));
    L.push('- 1行＝車1台。在庫の車・月次締めした実績の車・正式に削除した車（台帳）を全部。仮登録（まだ来ていない車）は入れていない。');
    L.push('- 行数：' + count.行 + '／在庫 ' + count.在庫 + '／実績（締め済み） ' + count.実績 + '／正式削除 ' + count.正式削除 + '／うち売約済み ' + count.売約済み + '／価格あり ' + count.価格あり);
    L.push('- 数え方は CarFlow の画面と同じ部品を借りている（ダッシュボード・販売実績と数字が一致する）。');
    L.push('- 決まり＝`CoreFlowアプリ\\_記録\\仕様\\分析用の書き出し_全アプリ共通の決まり.md`');
    L.push('');
    L.push('## 読むときの注意');
    L.push('- 🔴 空と0は別。空＝分からない／入っていない。');
    L.push('- 🔴 お金は全部 税抜・円。CarFlow は「税込で入力」が既定なので、税率で割り戻している（端数は四捨五入）。いまの集計の元データ＝' + (source === 'total' ? '総額' : '本体価格') + '。');
    L.push('- 🔴 CarFlow には**仕入れ値（原価）・粗利・仕入れ先の区分・担当者の欄が無い**。この表にも無い。粗利を聞かれたら「CarFlow には原価が無い」と答える（推測で出さない）。');
    L.push('- 🔴 車台番号の欄はまだ無い（見積＋納車詳細入力の新体制で入る予定）。PitFlow の車とは**結ばない**（名前・ナンバーで無理に結ばない・決まり §7）。');
    L.push('- 売れた車は「実績」と「在庫（納車完了）」の両方に残っていることがある（月次締めで在庫から消せなかった台）。この表では soldPool と同じく実績の方だけを1行にしている＝1台は1回だけ。');
    L.push('- オーダー車両は在庫として数えない（在庫日数は空）。ダッシュボードの平均在庫日数もオーダー車両を外している。');
    L.push('- 正式削除の行は、管理番号・メーカー・車種・グレード・削除日しか残っていない（それ以外は空＝分からない）。');
    L.push('- 走行距離の 0 は「未入力」のことがある（新規登録で空欄だと 0 が入る）。');
    L.push('- 呼び名は読む用。数える・結ぶのは ID・管理番号。');
    L.push('- 🔴 メモ（自由記述）には人名が入りうる。伏せ字にしてあるが、**引用しない**。中身の傾向をつかむ用。');
    L.push('- 出す時の段：ゆうた宛ては全部言ってよい。社員が見る物では個人の比較・評価を出さない（決まり §6.5）。');
    L.push('');
    L.push('## 列');
    L.push('');
    L.push('| 列 | 中身 |');
    L.push('|---|---|');
    COLS_DEF.forEach(function (x) { L.push('| ' + x[0] + ' | ' + x[1].replace(/\|/g, '／') + ' |'); });
    L.push('');
    return L.join('\n');
  }

  /* ================================================================
     公開（サーバーはこの約束だけを見る）
     ================================================================ */
  w.CF_ANALYTICS = {
    app: 'carflow',
    version: VERSION,
    sources: SOURCES,
    fill: fill,
    tables: function (opt) {
      var T = build(opt);
      return [{ name: 'carflow', csv: T.csv, dict: T.dict, count: T.count }];
    },
    _build: build   /* 見張り用（列と行をそのまま見る） */
  };
})(window);
