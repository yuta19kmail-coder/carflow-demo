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

   ◎v3.16.10（棚卸し A-70・ゆうた 2026-10-15「ものすごい金額とデータ量にならないのであれば、可能なだけデータは取って」）
     表を足した（どれも「アプリにもう在る物」だけ。欄を作ってはいない）：
       carflow.操作ログ   … auditLogs 1件＝1行（全部・足すだけの記録）。中身は伏せ字・辞書に「引用しない」
       carflow.目標       … 会社設定の月の目標（台数・売上）＋その月の実績（soldPool・recogDateAny＝ダッシュボードと同じ）
       carflow.装備       … 装備品チェックの入っている項目 1つ＝1行（getEquipmentState・_eqActiveSections を借りる）
       carflow.仮登録     … tentativeCars 1件＝1行
       carflow.手入力番号 … manualNumbers 1件＝1行
       carflow.削除台帳   … deletedCars の台帳の行（正式削除・取り消し・仮登録に戻した・戻した・完全に消した）。中身の文書（~t_）は出さない
     carflow（車1台1行）の末尾に：納車完了にした日・その出どころ・装備チェック・装備ありの数・写真・作業メモ・事務メモ・タスクメモの数
     🔴 写真の中身（data:URL・URL）は出さない。有無だけ。
     ⚠ サーバーの car-month.js（LINE の月の数字）も同じ fill を使う＝重い入れ物（操作ログなど）を読まないよう coreSources を出している
   ================================================================================ */
(function (w) {
  'use strict';

  var VERSION = '5';   /* 🔴 列を足す・意味を変えたら上げる（辞書の頭に出る）。2＝v3.16.10 表を5つ・carflow に列を8つ・納車日の説明を直した／3＝v3.18.0 国産輸入・軽の4列・メーカーをメーカー表のまとめる先に・表 carflow.メーカー表 */

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
      case 'deletedCarsAll': return typeof deletedCarsAll !== 'undefined' ? deletedCarsAll : null;
      case 'tentativeCars':  return typeof tentativeCars !== 'undefined' ? tentativeCars : null;
      case 'manualNumbers':  return typeof manualNumbers !== 'undefined' ? manualNumbers : null;
      case 'TENTATIVE_REASONS': return typeof TENTATIVE_REASONS !== 'undefined' ? TENTATIVE_REASONS : null;
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
  /* 時刻 → ミリ秒（数字／Firestore の時刻 {seconds}・{_seconds}・toDate／ISO の文字列）。読めなければ null */
  function msOf(v){
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'object'){
      if (typeof v.toDate === 'function') return safe(function () { return v.toDate().getTime(); }, null);
      if (v.seconds != null) return Number(v.seconds) * 1000;
      if (v._seconds != null) return Number(v._seconds) * 1000;
      return null;
    }
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)){ var d = new Date(v); return isNaN(d) ? null : d.getTime(); }
    return null;
  }
  /* ミリ秒 → 'YYYY-MM-DD HH:MM'（日本時間。サーバーの時計の設定に左右されない） */
  function jstDT(ms){
    if (ms == null || !isFinite(ms)) return '';
    var d = new Date(ms + 9 * 3600000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }

  /* ================================================================
     🚗 メーカー：BMW の MINI と MINI は「MINI」（決まり §6・PitFlow の pitCardMaker と同じ決まり）
     ================================================================ */
  function isMini(c){
    var x = s(c && c.model) + ' ' + s(c && c.maker);
    return /ミニ|MINI|ﾐﾆ/i.test(x) && !/ミニカ|ミニキャブ|ミニバン/.test(s(c && c.model));
  }
  /* v3.18.0 メーカー表（car-class.js）の「まとめる先」で出す＝ベンツ／メルセデス、ニッサン／日産、ＢＭＷ／BMW が1つになる。
     MINI の決まりは car-class.js も同じ。表が読み込まれていない時（古いサーバー）は前の決まり */
  function makerOf(c){
    if (w.CFMaker) return w.CFMaker.group(c && c.maker, c && c.model);
    return isMini(c) ? 'MINI' : t(c && c.maker);
  }
  var ORG = { dom: '国産', imp: '輸入' };
  var BYL = { hand: '手で直した', table: 'メーカー表', katashiki: '型式', shaken: '車検証', cc: '排気量', size: 'ボディ' };
  /* [国産輸入, その出どころ, 軽, その出どころ]。car-class.js が無ければ空 */
  function classOf(c){
    if (!w.CFCarClass) return ['', '', '', ''];
    var o = w.CFCarClass.origin(c), k = w.CFCarClass.kei(c);
    return [ORG[o.v] || '', o.v ? BYL[o.by] || o.by : '', k.v === true ? '軽' : k.v === false ? '普通' : '', k.v == null ? '' : (BYL[k.by] || k.by)];
  }

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

  /* 名前1つ → 出してよい形（法人はそのまま・空白で区切れれば最初の区切り＝姓・区切れない個人名は〇〇） */
  function nameSafe(n){
    n = t(n).replace(/\s*(様|さま|御中|殿|どの|さん|ちゃん|くん)$/, '').trim();
    if (!n || n === '未設定' || n === '空') return n;
    if (CORP.test(n)) return n;
    var parts = n.split(/[\s　]+/);
    return parts.length >= 2 ? parts[0] : '〇〇';
  }
  /* 操作ログの文の伏せ字。
     ① 記録の決まった書き方「お客様 A → B」「お客様 A→B」の名前を、姓（または〇〇）に
     ② その車のお客様の名前（車が分かる時）・電話・メール・LINE・ナンバー（mask と同じ） */
  function logMask(text, c){
    var x = s(text);
    if (!x.trim()) return '';
    x = x.replace(/お客様\s*([^→・）)\/\n]*?)\s*→\s*([^・）)\/\n]*)/g, function (m0, a, b) {
      return 'お客様 ' + nameSafe(a) + '→' + nameSafe(b);
    });
    return mask(x, c || {});
  }

  /* ================================================================
     👥 名簿（CoreFlow の portalMembers）：ログインの番号（uid）→ 名簿の番号・名前
     🔴 出すのは名簿の番号と、名前の最初の区切り（姓）まで。メール・uid は出さない（決まり §6 社員の決まり）
     ================================================================ */
  var ROSTER = { byUid: {}, loaded: false };
  function shortName(v){
    var x = t(v); if (!x || /[@＠]/.test(x)) return '';
    return x.split(/[\s　]+/)[0];
  }
  function buildRoster(list){
    var by = {};
    (Array.isArray(list) ? list : []).forEach(function (p) {
      if (!p || !p.id) return;
      var r = { id: String(p.id), name: shortName(p.name) || shortName(p.gname) || '' };
      by[String(p.id)] = r;                         /* 名簿の番号そのもの（members-core.js：uid が無ければ番号） */
      if (p.uid) by[String(p.uid)] = r;
    });
    ROSTER = { byUid: by, loaded: Array.isArray(list) };
  }
  /* 人 → [名簿の番号, 名前]。サーバー（'system'）は ['', 'サーバー'] */
  function who(uid, fallbackName){
    var u = t(uid);
    if (u === 'system') return ['', 'サーバー'];
    var r = u ? ROSTER.byUid[u] : null;
    if (r) return [r.id, r.name || shortName(fallbackName)];
    var f = t(fallbackName);
    return ['', (f === '—' ? '' : shortName(f))];
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
    ['置き場', '在庫（cars）／実績（月次締め済み・archivedCars）／正式削除（AA出品・売約不成立・廃車など・deletedCars の「正式に削除」で、ゴミ箱から戻していない車。取り消し・仮登録に戻した車は入れない）'],
    ['状態', 'カンバンの列（その他・仕入れ・展示準備中・展示中・納車準備・納車完了）。正式削除は空（台帳に列が残っていない）'],
    ['売約', '売約済みなら 1、まだなら 0。正式削除は空（分からない）'],
    ['オーダー', 'オーダー車両（在庫として数えない）なら 1、ちがえば 0'],
    ['メーカー', 'カードのメーカーを、メーカー表（js/car-class.js＋会社で足した行）の「まとめる先」に読み替えた物（版3〜：ベンツ／メルセデス・ベンツ、ニッサン／日産、ＢＭＷ／BMW は1つ）。BMW の MINI と MINI はまとめて MINI（全アプリ共通の決まり）。表に無いメーカーは打った文字のまま'],
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
    ['納車日', 'deliveryDate＝売約の時に入れた納車の予定日（カレンダー・車両情報の編集で人が直した日）。🔴 納車完了にしてもこの日は書き換わらない＝納車完了の車でも「予定日のまま」のことがある。実際に納車完了にした日は「納車完了にした日」の列'],
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
    ['見積の数', '価格履歴に登録した見積PDFの数（0＝本当に0）。消した見積もり（ゴミ箱の印）は数えない'],
    ['値下げ回数', '見積PDFの理由が「値下げ」の数'],
    ['最後の見積日', 'いちばん新しい見積PDFを登録した日'],
    ['登録した人', 'その車を新規登録（または仮登録から上げた）人。操作ログの名前（名簿の表示名）。空＝ログが無い'],
    ['メモ', 'カードのメモ（自由記述）。電話・メール・LINE・ナンバーらしき文字と、お客様の名前は伏せ字。改行は「 / 」'],
    /* ↓ 版2（v3.16.10）で末尾に足した列 */
    ['納車完了にした日', '人が「納車完了」にした日（日本時間）。アプリに専用の欄は無いので記録から読む＝その車のフロー（at のある行）と操作ログ（auditLogs）の「納車完了：」「売約＆納車完了」「→納車完了」の行のうち一番新しい日。その後に「納車完了を取り消し」があれば空。記録に無い昔の車は、納車完了の時に固定した税扱いの日（priceTaxSnapshot.capturedAt＝初めて納車完了にした日）。納車完了でない車・正式削除は空'],
    ['納車完了にした日の出どころ', '記録（フロー・操作ログ）／税扱いの固定（記録に日付が無い昔の車＝初めて納車完了にした日）／空＝分からない（Excel 取り込み・締めの古い車など）'],
    ['装備チェック', '装備品チェックの埋まり具合 %（calcEquipmentProgress＝画面の装備の%と同じ）。0＝項目はあるが1つも入っていない。空＝タスクパターン未選択で項目が無い／正式削除'],
    ['装備ありの数', '装備品チェックで「あり」（○）になっている項目の数。項目ごとの中身は carflow.装備。空＝項目が無い／正式削除'],
    ['写真', 'カードに写真があれば 1、無ければ 0（写真そのもの・住所は出さない）。正式削除は空'],
    ['作業メモ', 'カードの作業メモ（workMemo・自由記述）。⚠ 売約で納車準備に移す時に空にされる。伏せ字はメモと同じ。引用しない'],
    ['事務メモ', 'バックオフィスのメモ（backofficeMemo・自由記述）。伏せ字はメモと同じ。引用しない'],
    ['タスクメモの数', 'タスクごとのメモ（taskMemos）で中身のある物の数。0＝無い。中身は出していない。正式削除は空'],
    /* ↓ 版3（v3.18.0）で末尾に足した列 */
    ['国産輸入', '国産／輸入。ふだんはメーカー表で読む（車に書いていない）。手で直した車だけ車の origin。空＝メーカー表に無いメーカー（まだだれも答えていない）'],
    ['国産輸入の出どころ', 'メーカー表／手で直した。空＝分からない'],
    ['軽', '軽／普通。手で直した車だけ車の keiHand。それ以外はボディ（「軽」を含む名前なら軽）。空＝ボディも無い'],
    ['軽の出どころ', '手で直した／ボディ（あとで排気量・型式・車検証が入る予定）。空＝分からない'],
    /* ↓ 版5（v4.5.0）で末尾に足した列 */
    ['写真の枚数', 'カード詳細の［写真］タブの枚数（0〜10。［写真］タブを使う前の車は写真があれば 1・写真そのもの・住所は出さない）。正式削除は空']
  ];

  /* ================================================================
     📥 データを入れる（auth.js の起動時の読み込みと同じ形）
     ================================================================ */
  var SOURCES = {
    cols: ['companies/{cid}/cars', 'companies/{cid}/archivedCars', 'companies/{cid}/deletedCars', 'companies/{cid}/checklistTemplates',
      /* v3.16.10 足した（A-70）：操作ログ・名簿（番号と姓だけ使う）・仮登録・手入力の番号 */
      'companies/{cid}/auditLogs', 'companies/{cid}/portalMembers', 'companies/{cid}/tentativeCars', 'companies/{cid}/manualNumbers',
      /* v3.18.0 メーカー表の会社で足した行（国産／輸入の答え）。🔴 車の数え方にも効く（メーカーのまとめ方）ので CORE_SOURCES にも入れる */
      'companies/{cid}/carMakers',
      /* v4.0.0 見積（1台1枚。基本価格・プラン見積・個別見積・見積の上の売約の札・原価）。CORE_SOURCES には入れない（車の数え方に効かない） */
      'companies/{cid}/carQuotes',
      /* v4.5.0 反響（グー・カーセンサーの車ごとの生の数字・週1回の取り込み）。CORE_SOURCES には入れない */
      'companies/{cid}/carReactions'],
    docs: ['companies/{cid}/settings/main']
  };
  /* 車の数え方だけに要る入れ物（サーバーの car-month.js＝LINE の月の数字はこれだけ読めば足りる。操作ログは何万件にもなる） */
  var CORE_SOURCES = { cols: SOURCES.cols.slice(0, 4).concat([SOURCES.cols[8]]), docs: SOURCES.docs.slice() };
  var EXTRA = { audit: null, roster: null, bodies: {}, tentLoaded: false, manualLoaded: false };   /* 状態に置き場が無い物（操作ログ・名簿）。null＝読んでいない（入れ物ごと渡されなかった） */
  /* db-deleted.js isLedger と同じ線（番号台帳に数える行＝正式削除で、戻していない）。db-deleted.js は読み込まないのでここに同じ1行 */
  function isLedgerRow(c){ return !!c && !c.restoredAt && (!c.mode || c.mode === 'formal'); }
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
    /* v3.16.10 フローの並び＝db-cars.js・db-archive.js の読み込みと同じく _cfSortLogs で新しい順に（サーバーの配列は足した行が後ろに付く） */
    var srt = fnOf('_cfSortLogs');
    if (srt) [fnOf('cars'), fnOf('archivedCars')].forEach(function (arr) {
      (arr || []).forEach(function (c) { if (c && Array.isArray(c.logs)) c.logs = srt(c.logs); });
    });
    /* auth.js：deletedCarsAll＝台帳の行（中身の文書 ~t_ は db-deleted.js が外す）／deletedCars＝そのうち番号台帳に数える行 */
    var dl = pick(C, SOURCES.cols[2]);
    dl = Array.isArray(dl) ? dl : [];
    var isBody = function (x) { return x && String(x.id || x._docId || '').indexOf('~t_') === 0; };
    EXTRA.bodies = {};                                                /* 中身の文書（消した車まるごと）＝表には出さない。操作ログの伏せ字（お客様の名前）にだけ使う */
    dl.forEach(function (x) { if (isBody(x) && x.car && typeof x.car === 'object') EXTRA.bodies[String(x.carId || String(x.id).slice(3))] = x.car; });
    refill(fnOf('deletedCarsAll'), dl.filter(function (x) { return !isBody(x); }));
    refill(fnOf('deletedCars'), dl.filter(function (x) { return !isBody(x) && isLedgerRow(x); }));   /* auth.js：D.isLedger の行だけ */
    var tl = pick(C, SOURCES.cols[3]);                                /* db-templates.js refreshTemplates：1件以上ある時だけ置き換え */
    if (Array.isArray(tl) && tl.length && w.dbTemplates && typeof w.dbTemplates.replaceInMemory === 'function') w.dbTemplates.replaceInMemory(tl);
    /* v3.16.10 auth.js：tentativeCars / manualNumbers も length = 0 → push。操作ログ・名簿は状態に置かず、ここだけで持つ */
    var al = pick(C, SOURCES.cols[4]), pm = pick(C, SOURCES.cols[5]), te = pick(C, SOURCES.cols[6]), mn = pick(C, SOURCES.cols[7]);
    EXTRA.audit = Array.isArray(al) ? al.filter(function (x) { return x && typeof x === 'object'; }) : null;
    EXTRA.roster = Array.isArray(pm) ? pm : null;
    buildRoster(pm);
    refill(fnOf('tentativeCars'), te);
    refill(fnOf('manualNumbers'), mn);
    EXTRA.tentLoaded = Array.isArray(te); EXTRA.manualLoaded = Array.isArray(mn);
    /* v3.18.0 db-makers.js の購読と同じ：会社で足した行を表に重ねる（無ければ表の本体だけ） */
    var mk = pick(C, SOURCES.cols[8]);
    EXTRA.makersLoaded = Array.isArray(mk);
    if (w.CFMaker) w.CFMaker.setExtra(Array.isArray(mk) ? mk.filter(function (x) { return x && typeof x === 'object'; }) : []);
    /* v4.0.0 見積（carQuotes）＝表 carflow.見積 の元。読めなかった時は null */
    var qt = pick(C, SOURCES.cols[9]);
    EXTRA.quotes = Array.isArray(qt) ? qt.filter(function (x) { return x && typeof x === 'object'; }) : null;
    /* v4.5.0 反響（carReactions）＝表 carflow.反響グー・carflow.反響カーセンサー の元 */
    var rx = pick(C, SOURCES.cols[10]);
    EXTRA.reactions = Array.isArray(rx) ? rx.filter(function (x) { return x && typeof x === 'object'; }) : null;
    var n = 0; [C].forEach(function (o) { for (var k in o) if (Array.isArray(o[k])) n += o[k].length; });
    return n;
  }

  /* ================================================================
     🚚 納車完了にした日（アプリに欄が無い＝記録から読む）
     書き方＝kanban.js：closeDeliverConfirm「納車完了：納車準備→納車完了」／closeSellConfirm「売約＆納車完了：…」／
             closeUndeliverConfirm「納車完了を取り消し：…」／applyKanbanMove「ステータス変更: A→納車完了」
     ================================================================ */
  var RE_DONE = /^(納車完了：|売約＆納車完了|ステータス変更[:：]\s*[^→]*→納車完了)/;
  var RE_UNDONE = /^納車完了を取り消し/;
  function doneIndexFromAudit(){
    var ix = {};
    (EXTRA.audit || []).forEach(function (a) {
      if (!a || !a.carId) return;
      var act = t(a.action), ms = msOf(a.time);
      if (ms == null) return;
      var k = String(a.carId), o = ix[k] || (ix[k] = { done: null, undone: null });
      if (RE_DONE.test(act)) { if (o.done == null || ms > o.done) o.done = ms; }
      else if (RE_UNDONE.test(act)) { if (o.undone == null || ms > o.undone) o.undone = ms; }
    });
    return ix;
  }
  function doneDateOf(c, isDone, ix){
    if (!isDone) return ['', ''];
    var o = { done: null, undone: null }, a = ix[String(c.id)];
    if (a) { o.done = a.done; o.undone = a.undone; }
    (Array.isArray(c.logs) ? c.logs : []).forEach(function (e) {
      if (!e || typeof e.at !== 'number') return;
      var act = t(e.action);
      if (RE_DONE.test(act)) { if (o.done == null || e.at > o.done) o.done = e.at; }
      else if (RE_UNDONE.test(act)) { if (o.undone == null || e.at > o.undone) o.undone = e.at; }
    });
    if (o.done != null && (o.undone == null || o.done > o.undone)) return [jstDT(o.done).slice(0, 10), '記録'];
    if (o.done == null && o.undone == null){
      var cap = day(c.priceTaxSnapshot && c.priceTaxSnapshot.capturedAt);
      if (cap) return [cap, '税扱いの固定'];
    }
    return ['', ''];
  }

  /* ================================================================
     🧰 装備品チェック（equipment-view.js を借りる。⚠ getEquipmentState は空の入れ物を車に足すので、写しで呼ぶ）
     ================================================================ */
  var EQ_KIND = { tri: 'あり・なし', status: 'OK・NG', select: '選択', text: '自由記述', check: 'チェック' };
  function equipOf(c){
    var getS = fnOf('getEquipmentState'), secF = fnOf('_eqActiveSections'), filled = fnOf('_eqIsFilled'), prog = fnOf('calcEquipmentProgress');
    if (!getS || !secF || !filled) return null;
    var tmp = Object.assign({}, c, { regenTasks: Object.assign({}, c.regenTasks || {}), deliveryTasks: Object.assign({}, c.deliveryTasks || {}) });
    var secs = safe(function () { return secF(tmp); }, null);
    if (!Array.isArray(secs) || !secs.length) return null;
    var st = safe(function () { return getS(tmp); }, {}) || {};
    var P = prog ? safe(function () { return prog(tmp); }, null) : null;
    if (P && (P._noVariant || !P.total)) return null;
    var items = [], on = 0;
    secs.forEach(function (sec) {
      (sec && sec.items || []).forEach(function (it) {
        if (!it || it._disabled) return;
        var v = st[it.id];
        if (!safe(function () { return filled(it, v); }, false)) return;
        var kind = it.inputType || 'tri', val;
        if (kind === 'tri') val = v === 'on' ? 'あり' : 'なし';
        else if (kind === 'status') val = v === 'ok' ? 'OK' : 'NG';
        else if (kind === 'check') val = 'あり';
        else if (kind === 'text') val = mask(v, c);
        else val = t(v);
        if (val === 'あり') on++;
        items.push({ sec: t(sec.title), id: t(it.id), name: t(it.name || it.label), kind: EQ_KIND[kind] || kind, val: val, print: it.hideInPrint ? 0 : 1 });
      });
    });
    return { pct: P ? P.pct : '', on: on, items: items };
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
    /* v3.16.0 deletedCars にはゴミ箱の行（取り消し・仮登録に戻した・戻した）も入る。数えるのは「正式に削除」で戻していない行だけ */
    (fnOf('deletedCars') || []).forEach(function (c) { if (c && c.id && isLedgerRow(c) && !seen[c.id]){ seen[c.id] = 1; list.push({ c: c, where: '正式削除' }); } });
    list.sort(function (a, b) { return t(a.c.num).localeCompare(t(b.c.num)) || t(a.c.id).localeCompare(t(b.c.id)); });

    var ps = safe(function () { return fnOf('appSettings').priceTax; }, {}) || {};
    var source = (ps.dashboardSource === 'total') ? 'total' : 'body';
    var count = { 行: 0, 在庫: 0, 実績: 0, 正式削除: 0, 売約済み: 0, 価格あり: 0, 納車完了にした日あり: 0 };
    var doneIx = doneIndexFromAudit();
    var eqList = [];   /* carflow.装備 の材料（車ごと） */

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
      var est = Array.isArray(c.estimates) ? c.estimates.filter(function (x) { return x && !x.deletedAt; }) : [];   /* v3.16.0 消した印の物は数えない */
      var yr = safe(function () { return fnOf('parseYearInput')(c.year); }, null);
      var km = t(c.km).replace(/[,\s]/g, '').replace(/km$/i, '');
      var col = t(c.color);
      var dd = del ? ['', ''] : doneDateOf(c, done, doneIx);
      if (dd[0]) count.納車完了にした日あり++;
      var eq = del ? null : equipOf(c);
      if (eq && eq.items.length) eqList.push({ c: c, where: x.where, eq: eq });
      var tm = (c.taskMemos && typeof c.taskMemos === 'object') ? c.taskMemos : {};
      var memoN = Object.keys(tm).filter(function (k) { return tm[k] && t(typeof tm[k] === 'object' ? tm[k].value : tm[k]) !== ''; }).length;
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
        del ? '' : mask(c.memo, c),
        /* ↓ 版2（v3.16.10） */
        dd[0], dd[1],
        eq ? eq.pct : '',
        eq ? eq.on : '',
        del ? '' : (t(c.photo) ? 1 : 0),
        del ? '' : mask(c.workMemo, c),
        del ? '' : mask(c.backofficeMemo, c),
        del ? '' : memoN
      ].concat(classOf(c), [del ? '' : (Array.isArray(c.photos) ? c.photos.filter(function (x) { return x && x.url; }).length : (t(c.photo) ? 1 : 0))]);   /* ↓ 版5（v4.5.0）写真の枚数 */
    });

    var head = COLS_DEF.map(function (x) { return x[0]; });
    var csv = '﻿' + [head].concat(rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n';
    return { cols: head, rows: rows, csv: csv, dict: dict(today, count, source, opt), count: count, eqList: eqList, today: today, source: source };
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
    L.push('- 🔴 納車日（deliveryDate）は**予定日**。納車完了にしても書き換わらない。「実際に納車完了にした日」は「納車完了にした日」の列（記録から読んだ日）。いま読めた車＝' + count.納車完了にした日あり + '台。在庫日数・売約から納車までの日数は今までどおり納車日（予定日）で引いている＝販売実績の画面と同じ。');
    L.push('- 一緒に置いている表：carflow.操作ログ（誰が・いつ・何をしたか）／carflow.目標（月の目標と実績）／carflow.装備（装備品チェックの中身）／carflow.仮登録／carflow.手入力番号／carflow.削除台帳。どれも ID（車の番号）・管理番号で結ぶ。');
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
     🧾 2枚目からの表（v3.16.10・A-70）の共通の作り
     ================================================================ */
  function toCsv(head, rows){
    return '﻿' + [head].concat(rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n';
  }
  function dictOf(name, today, opt, lines, cols){
    var ver = t((opt && opt.appVersion) || w.CF_APP_VERSION || '');
    var L = ['# ' + name + '.csv の辞書（版 ' + VERSION + '）', '', '- 書き出した日：' + today + (ver ? '（CarFlow ' + ver + '）' : '')];
    lines.forEach(function (x) { L.push(x); });
    L.push('- 決まり＝`CoreFlowアプリ\\_記録\\仕様\\分析用の書き出し_全アプリ共通の決まり.md`');
    L.push('- 🔴 空と0は別。空＝分からない／入っていない。');
    L.push('- 出す時の段：ゆうた宛ては全部言ってよい。社員が見る物では個人の比較・評価を出さない（決まり §6.5）。');
    L.push(''); L.push('## 列'); L.push(''); L.push('| 列 | 中身 |'); L.push('|---|---|');
    cols.forEach(function (x) { L.push('| ' + x[0] + ' | ' + x[1].replace(/\|/g, '／') + ' |'); });
    L.push('');
    return L.join('\n');
  }
  function heads(cols){ return cols.map(function (x) { return x[0]; }); }
  /* 車の番号 → 車（在庫・実績・ゴミ箱の中身）。操作ログの伏せ字（その車のお客様の名前）用 */
  function carIndex(){
    var ix = {};
    Object.keys(EXTRA.bodies || {}).forEach(function (k) { ix[k] = EXTRA.bodies[k]; });
    (fnOf('archivedCars') || []).forEach(function (c) { if (c && c.id) ix[String(c.id)] = c; });
    (fnOf('cars') || []).forEach(function (c) { if (c && c.id) ix[String(c.id)] = c; });
    return ix;
  }

  /* ---------------- 📝 carflow.操作ログ（auditLogs 1件＝1行） ---------------- */
  var AUDIT_COLS = [
    ['アプリ', '常に carflow'],
    ['ID', '操作ログの文書の番号（auditLogs）'],
    ['書き出した日', 'この表を作った日'],
    ['日時', '記録した時刻（日本時間 YYYY-MM-DD HH:MM・サーバーの時計）。空＝時刻が読めない行'],
    ['社員番号', 'した人の名簿の番号（CoreFlow の portalMembers・全アプリ共通の社員の鍵）。空＝名簿に無い人／サーバー'],
    ['社員', 'した人の名前（名簿の名前の最初の区切り＝姓まで。下の名前は出さない）。サーバーが送った LINE は「サーバー」'],
    ['操作', '何をしたかの見出し（内容の頭の言葉。例：車両情報を編集・納車完了・中タスク・チェック項目・バックオフィス・設定を変更・LINE を送った）'],
    ['対象の種類', '車（車の番号がある）／管理番号（番号だけ）／仮登録／設定／タスクパターン／LINE／その他'],
    ['対象ID', '車の番号（carflow の ID と同じ＝ここで結ぶ）。空＝車に結びつかない操作'],
    ['内容', '記録の文（action）。LINE は送った文の頭100文字。🔴 電話・メール・LINE・ナンバーらしき文字と、お客様の名前（「お客様 A→B」の書き方とその車のお客様）は伏せ字。**引用しない**'],
    ['どこから', 'CarFlow の画面／CarFlow の画面（整備依頼業務）＝PitFlow の車販作業を CarFlow から押した／サーバー（LINE の送信記録）'],
    ['管理番号', '記録の時の管理番号（carNum）。空＝番号なし'],
    ['LINEの種類', 'サーバーが送った LINE の種類（kind。例 daily_auto・task_complete_a）。LINE 以外は空']
  ];
  function opHead(act){
    var a = t(act);
    if (/^\[[^\]]*\]/.test(a)) return 'チェック項目';
    var h = a.split(/[：:（(「『【\s]/)[0];
    return h.length > 20 ? h.slice(0, 20) : h;
  }
  function targetKind(a, act){
    if (a.type === 'line_notify_sent') return 'LINE';
    if (a.carId) return '車';
    if (/^仮登録/.test(act)) return '仮登録';
    if (/^設定を変更/.test(act) || /^LINE の/.test(act)) return '設定';
    if (/^タスクパターン/.test(act)) return 'タスクパターン';
    if (t(a.carNum) && t(a.carNum) !== '—') return '管理番号';
    return 'その他';
  }
  function auditTable(today, opt){
    var head = heads(AUDIT_COLS);
    var cix = carIndex();
    var list = (EXTRA.audit || []).map(function (a) {
      var isLine = a.type === 'line_notify_sent';
      return { a: a, ms: msOf(isLine ? (a.at || a.time) : a.time) };
    });
    list.sort(function (x, y) {
      if (x.ms == null && y.ms == null) return t(x.a.id).localeCompare(t(y.a.id));
      if (x.ms == null) return 1;
      if (y.ms == null) return -1;
      return x.ms - y.ms || t(x.a.id).localeCompare(t(y.a.id));
    });
    var count = { 行: 0, LINE: 0, 車: 0, 時刻なし: 0, 名簿に無い人: 0 };
    var rows = list.map(function (x) {
      var a = x.a, isLine = a.type === 'line_notify_sent';
      var act = t(a.action);
      var car = a.carId ? cix[String(a.carId)] : null;
      var p = who(a.uid, isLine ? '' : a.userName);
      count.行++;
      if (isLine) count.LINE++;
      if (a.carId) count.車++;
      if (x.ms == null) count.時刻なし++;
      if (!isLine && t(a.uid) && t(a.uid) !== 'system' && !p[0]) count.名簿に無い人++;
      var num = t(a.carNum);
      return [
        'carflow', t(a.id), today,
        jstDT(x.ms),
        p[0], p[1],
        isLine ? 'LINE を送った' : (act ? opHead(act) : t(a.type)),
        targetKind(a, act),
        t(a.carId),
        isLine ? logMask(a.messagePreview, null) : logMask(act, car),
        isLine ? 'サーバー' : (/^PitFlow：/.test(act) ? 'CarFlow の画面（整備依頼業務）' : 'CarFlow の画面'),
        num === '—' ? '' : num,
        isLine ? t(a.kind) : ''
      ];
    });
    var lines = [
      '- 1行＝操作ログ（companies/{会社}/auditLogs）の1件。**全部**出している（記録は足すだけ・誰も消せない＝v3.16.8）。古い順。',
      '- 行数：' + count.行 + '／うち車の操作 ' + count.車 + '／サーバーの LINE ' + count.LINE + '／時刻が読めない ' + count.時刻なし + '／名簿に無い人 ' + count.名簿に無い人,
      EXTRA.audit ? '- 書き方は2つ：画面の操作（helpers.js addLog・addAuditLog ＝ 車のフローと同じ文）と、サーバーが LINE を送った記録（type=line_notify_sent）。' : '- ⚠ 今回は操作ログを読めなかった（入れ物ごと渡されていない）。0 行＝「操作が無かった」ではない。',
      '- 🔴 v1.5.4（2026-04-30）より前の操作は入っていない。車のフロー（カードの「フロー」）にはそれより前の行もあるが、ここには無い。',
      '- 🔴 内容には人名が入りうる（社員の名前は出している・お客様の名前は伏せ字）。**引用しない**。傾向（誰がどの操作を多くしているか・何時に動いているか）をつかむ用。',
      '- 社員の比較（誰が多い・少ない）は、社員が見る物には出さない（決まり §6.5）。'
    ];
    return { name: 'carflow.操作ログ', csv: toCsv(head, rows), dict: dictOf('carflow.操作ログ', today, opt, lines, AUDIT_COLS), count: count, _rows: rows, _head: head };
  }

  /* ---------------- 🎯 carflow.目標（1か月＝1行） ---------------- */
  var GOAL_COLS = [
    ['アプリ', '常に carflow'],
    ['ID', '月（YYYY-MM）'],
    ['書き出した日', 'この表を作った日'],
    ['月', 'YYYY-MM'],
    ['年度', '会社設定の年度の始まりの月で数えた年度（fyKey。例 FY2026）'],
    ['目標の台数', 'その月の月販目標（台）。設定 ▸ 目標で月ごとに入れた数、無ければ既定の目標（goals.default）＝monthlyGoal と同じ'],
    ['目標の売上（入力のまま）', 'その月の売上目標（円）。🔴 入力のまま＝税込か税抜かは「目標の税扱い」の列（ダッシュボードの表示の税扱いと同じ）'],
    ['目標の売上（税抜）', '目標の売上を税抜に直した物（convertTax・いまの税率）。実績と比べる時はこちら'],
    ['目標の出どころ', '月ごと＝その月に入力した目標／既定＝月の目標が無いので既定の目標（goals.default）'],
    ['目標の税扱い', '税込／税抜（appSettings.priceTax.dashboard＝ダッシュボードの金額の表示の扱い）'],
    ['実績の台数', 'その月に売上に数える車の台数（soldPool の車のうち recogDateAny がその月＝ダッシュボード・LINE の月次まとめと同じ数え方）。0＝本当に0'],
    ['実績の売上（税抜）', 'その台の売上金額（carflow の「売上金額」と同じ＝税抜・集計の元データの設定どおり）の合計。価格未入力の車は 0 で足す（ダッシュボードと同じ）'],
    ['台数の達成率', '実績の台数 ÷ 目標の台数 ×100（整数%）。目標が 0 なら空'],
    ['売上の達成率', '実績の売上（税抜）÷ 目標の売上（税抜）×100（整数%）。目標が 0 なら空'],
    ['売上計上の基準', '納車完了／売約（会社設定 goals.revRecog）。実績の月はこの基準で決まる']
  ];
  function goalTable(today, opt, source){
    var head = heads(GOAL_COLS);
    var A = fnOf('appSettings') || {};
    var g = A.goals || {};
    var monthly = (g.monthly && typeof g.monthly === 'object') ? g.monthly : {};
    var dflt = (g.default && typeof g.default === 'object') ? g.default : null;
    var dashMode = (A.priceTax && A.priceTax.dashboard === 'excl') ? 'excl' : 'incl';
    var conv = fnOf('convertTax'), rec = fnOf('recogDateAny'), fy = fnOf('fyKey');
    /* 実績：月 → [台数, 税抜の合計]（car-month.js・ダッシュボードと同じ：soldPool の車を recogDateAny の月で） */
    var act = {};
    ((fnOf('soldPool') || function () { return []; })() || []).forEach(function (c) {
      var d = day(safe(function () { return rec(c); }, ''));
      if (!d) return;
      var m = d.slice(0, 7), o = act[m] || (act[m] = [0, 0]);
      o[0]++;
      o[1] += Number(safe(function () { return yenExcl(c, source); }, 0)) || 0;
    });
    /* 並べる月＝目標を入れた月・実績のある月の一番古い月 〜 今の年度の終わり（設定画面の12か月）・目標を入れた一番先の月 */
    var keys = Object.keys(monthly).filter(function (k) { return /^\d{4}-\d{2}$/.test(k); }).concat(Object.keys(act));
    var ys = Number(g.yearStart) || 1;
    var ty = +today.slice(0, 4), tm = +today.slice(5, 7);
    var fyStart = (tm >= ys) ? ty : ty - 1;
    var endIdx = fyStart * 12 + (ys - 1) + 11;   /* 年度の12か月目（0始まりの通し月） */
    keys.push(Math.floor(endIdx / 12) + '-' + pad(endIdx % 12 + 1));
    keys.push(today.slice(0, 7));
    keys.sort();
    var first = keys[0], last = keys[keys.length - 1];
    var months = [];
    var y = +first.slice(0, 4), m = +first.slice(5, 7);
    while ((y + '-' + pad(m)) <= last && months.length < 600) { months.push(y + '-' + pad(m)); m++; if (m > 12) { m = 1; y++; } }
    var count = { 行: 0, 月ごとの目標: 0 };
    var num = function (v) { return (v != null && v !== '' && isFinite(Number(v))) ? Number(v) : ''; };
    var rows = months.map(function (k) {
      var own = (monthly[k] && typeof monthly[k] === 'object') ? monthly[k] : null;
      var gg = own || dflt;
      var gc = gg ? num(gg.count) : '';
      var gs = gg ? num(gg.sales) : '';
      if (gs !== '') gs = Math.round(gs);
      var gsx = gs === '' ? '' : Math.round(conv ? conv(gs, dashMode, 'excl') : gs);
      var a = act[k] || [0, 0];
      count.行++;
      if (own) count.月ごとの目標++;
      return [
        'carflow', k, today, k,
        fy ? safe(function () { return fy(k + '-15'); }, '') : '',
        gc, gs, gsx,
        own ? '月ごと' : (gg ? '既定' : ''),
        dashMode === 'excl' ? '税抜' : '税込',
        a[0], Math.round(a[1]),
        (gc !== '' && gc > 0) ? Math.round(a[0] / gc * 100) : '',
        (gsx !== '' && gsx > 0) ? Math.round(a[1] / gsx * 100) : '',
        (g.revRecog === 'contract') ? '売約' : '納車完了'
      ];
    });
    var lines = [
      '- 1行＝1か月。会社設定（settings/main の appSettings.goals）の月の目標と、その月の実績。',
      '- 行数：' + count.行 + '／うち月ごとに目標を入れた月 ' + count.月ごとの目標 + '。並べた月＝目標か実績のある一番古い月から、今の年度の終わり（設定画面の12か月）まで。',
      '- 🔴 目標は「その月に入れた目標が無ければ既定の目標」（monthlyGoal と同じ）。昔の月の「既定」は、その時の既定ではなく**今の既定**（既定の履歴はアプリに無い）。',
      '- 実績はダッシュボード・LINE の月次まとめと同じ数え方（soldPool・recogDateAny）。金額は税抜にそろえた（ダッシュボードの表示が税込なら、画面の数字は約1.1倍）。',
      '- 年度の目標（goals.annual）は設定画面に入れる所が無い＝出していない。'
    ];
    return { name: 'carflow.目標', csv: toCsv(head, rows), dict: dictOf('carflow.目標', today, opt, lines, GOAL_COLS), count: count, _rows: rows, _head: head };
  }

  /* ---------------- 🧰 carflow.装備（車1台×入っている項目1つ＝1行） ---------------- */
  var EQ_COLS = [
    ['アプリ', '常に carflow'],
    ['ID', '車の番号／項目の番号'],
    ['書き出した日', 'この表を作った日'],
    ['車ID', '車の番号（carflow の ID と同じ）'],
    ['管理番号', 'カードの管理番号'],
    ['置き場', '在庫／実績（締め済み）'],
    ['カテゴリ', '装備品チェックの見出し（タスクパターンの装備の区分。例 オーディオ・ナビ・来歴・付属品）'],
    ['項目', '装備の名前（例 カーナビ・1オーナー・禁煙車）'],
    ['値', 'あり／なし（○×）・OK／NG・選んだ物（例 フルセグ）・自由記述（伏せ字。引用しない）'],
    ['入力の種類', 'あり・なし／OK・NG／選択／自由記述／チェック'],
    ['お客様用の印刷に出す', '1＝装備の印刷・商談に出す項目／0＝「印刷に出さない」にした項目（整備・社内向け）']
  ];
  function equipTable(T, opt){
    var head = heads(EQ_COLS);
    var rows = [], ncar = 0;
    T.eqList.forEach(function (x) {
      ncar++;
      x.eq.items.forEach(function (it) {
        rows.push(['carflow', t(x.c.id) + '/' + it.id, T.today, t(x.c.id), t(x.c.num), x.where === '実績' ? '実績（締め済み）' : x.where,
          it.sec, it.name, it.val, it.kind, it.print]);
      });
    });
    var count = { 行: rows.length, 車: ncar };
    var lines = [
      '- 1行＝車1台の装備品チェックの「入っている」項目1つ（空の項目は出さない＝行が無い項目は「未確認」）。在庫と実績の車（正式削除は出さない）。',
      '- 行数：' + count.行 + '／車 ' + count.車 + '台。',
      '- 読み方は画面と同じ（equipment-view.js の getEquipmentState・_eqActiveSections・_eqIsFilled）。⚠ 画面は「納車準備・納車完了の車は納車側の入れ物」を見る＝売約後に入れ直していない車は空のことがある（画面も同じ）。',
      '- 記事・ポータルの車両説明の材料用。🔴 自由記述（A/C コメント・その他コメント）は伏せ字にしてあるが引用しない。',
      '- 修復歴・車検の期限・PR文・車両コメントの欄は CarFlow に無い（この表にも無い）。'
    ];
    return { name: 'carflow.装備', csv: toCsv(head, rows), dict: dictOf('carflow.装備', T.today, opt, lines, EQ_COLS), count: count, _rows: rows, _head: head };
  }

  /* ---------------- 🕓 carflow.仮登録（tentativeCars 1件＝1行） ---------------- */
  var TENT_COLS = [
    ['アプリ', '常に carflow'],
    ['ID', '仮登録の番号（tentativeCars）。車になると消える（その車のフローに「仮登録から」が残る）'],
    ['書き出した日', 'この表を作った日'],
    ['メーカー', 'メーカー（BMW の MINI と MINI は MINI）'],
    ['車種', '車種'],
    ['理由', '買取予定／下取り予定／陸送予定／その他（TENTATIVE_REASONS の言葉）'],
    ['登録日', '仮登録した日（createdAt・日本時間）。空＝記録なし'],
    ['登録した人の番号', '名簿の番号（portalMembers）。空＝名簿に無い人'],
    ['登録した人', '名簿の名前の最初の区切り（姓）まで'],
    ['経過日数', '登録日 → 書き出した日。空＝登録日なし'],
    ['メモ', '仮登録のメモ（自由記述）。電話・メール・LINE・ナンバーは伏せ字。🔴 下取りのお客様の名前などが入りうる＝引用しない']
  ];
  function tentTable(today, opt){
    var head = heads(TENT_COLS);
    var R = fnOf('TENTATIVE_REASONS') || [];
    var lab = function (id) { var r = R.filter(function (x) { return x && x.id === id; })[0]; return r ? r.label : t(id); };
    var list = (fnOf('tentativeCars') || []).slice().sort(function (a, b) { return (msOf(a.createdAt) || 0) - (msOf(b.createdAt) || 0) || t(a.id).localeCompare(t(b.id)); });
    var rows = list.map(function (x) {
      var d = day(x.createdAt), p = who(x.createdBy, '');
      return ['carflow', t(x.id), today, makerOf(x), t(x.model), lab(x.reason), d, p[0], p[1], d ? nonNeg(days(d, today)) : '', mask(x.memo, {})];
    });
    var lines = [
      '- 1行＝仮登録（まだ来ていない車・管理番号なし）1件。いま残っている物だけ（車になった物・消した物は消えている＝操作ログに「仮登録を追加／変更／削除」が残る）。',
      EXTRA.tentLoaded ? '- 行数：' + rows.length + '。' : '- ⚠ 今回は仮登録を読めなかった（入れ物ごと渡されていない）。',
      '- 業務（タスク・ダッシュボード・実績・日数）には入らない車。carflow の表にも入っていない。'
    ];
    return { name: 'carflow.仮登録', csv: toCsv(head, rows), dict: dictOf('carflow.仮登録', today, opt, lines, TENT_COLS), count: { 行: rows.length }, _rows: rows, _head: head };
  }

  /* ---------------- 🔢 carflow.手入力番号（manualNumbers 1件＝1行） ---------------- */
  var MAN_COLS = [
    ['アプリ', '常に carflow'],
    ['ID', '手入力の番号の記録の番号（manualNumbers）'],
    ['書き出した日', 'この表を作った日'],
    ['管理番号', '使った管理番号（例 KM-0123）'],
    ['車種', '車種'],
    ['グレード', 'グレード'],
    ['登録日', '手入力で足した日（createdAt・日本時間）。空＝記録なし'],
    ['登録した人の番号', '名簿の番号（portalMembers）。空＝名簿に無い人'],
    ['登録した人', '名簿の名前の最初の区切り（姓）まで'],
    ['メモ', '手入力のメモ（note・自由記述）。伏せ字はメモと同じ。引用しない']
  ];
  function manualTable(today, opt){
    var head = heads(MAN_COLS);
    var list = (fnOf('manualNumbers') || []).slice().sort(function (a, b) { return t(a.num).localeCompare(t(b.num)) || t(a.id).localeCompare(t(b.id)); });
    var rows = list.map(function (x) {
      var p = who(x.createdBy, '');
      return ['carflow', t(x.id), today, t(x.num), t(x.model), t(x.grade), day(x.createdAt), p[0], p[1], mask(x.note, {})];
    });
    var lines = [
      '- 1行＝管理番号リストに「番号は使ったが、実車のデータが無い」として手で足した1件。業務（カード・カンバン・ダッシュボード）には入らない。',
      EXTRA.manualLoaded ? '- 行数：' + rows.length + '。' : '- ⚠ 今回は手入力の番号を読めなかった（入れ物ごと渡されていない）。',
      '- 管理番号の抜け（使ったのに車が無い番号）を数える時は、carflow（在庫・実績・正式削除）＋ここ を合わせる。'
    ];
    return { name: 'carflow.手入力番号', csv: toCsv(head, rows), dict: dictOf('carflow.手入力番号', today, opt, lines, MAN_COLS), count: { 行: rows.length }, _rows: rows, _head: head };
  }

  /* ---------------- 🗑 carflow.削除台帳（deletedCars の台帳の行 1件＝1行） ---------------- */
  var DEL_COLS = [
    ['アプリ', '常に carflow'],
    ['ID', '車の番号（消す前の carflow の ID と同じ）'],
    ['書き出した日', 'この表を作った日'],
    ['管理番号', '消した時の管理番号'],
    ['メーカー', 'メーカー（BMW の MINI と MINI は MINI）'],
    ['車種', '車種'],
    ['グレード', 'グレード'],
    ['消し方', '正式削除（AA出品・売約不成立・廃車など＝番号を残す）／取り消し（間違い・テスト入力＝番号は再利用）／仮登録に戻した（番号は手放す）。mode の無い昔の行は正式削除'],
    ['今の扱い', 'ゴミ箱（戻せる）／戻した（restoredAt＝車に戻っている）／完全に消した（purgedAt・マスターが中身を消した）／台帳だけ（v3.16.0 より前に消した・中身は無い）'],
    ['消した日', '消した日（deletedAt・日本時間）'],
    ['消した人の番号', '名簿の番号（portalMembers）。空＝名簿に無い人・記録なし'],
    ['消した人', '名簿の名前の最初の区切り（姓）まで'],
    ['消した時の状態', '消した時のカンバンの列（fromCol）。空＝記録なし（v3.16.0 より前）'],
    ['戻した日', 'ゴミ箱から戻した日（restoredAt）'],
    ['完全に消した日', 'ゴミ箱から完全に消した日（purgedAt）'],
    ['番号の重複扱い', '管理番号リストで「番号の重複」として台帳に入れた行なら 1、そうでなければ 0。空＝記録なし'],
    ['写しに入らなかった物', 'ゴミ箱の写しが大きすぎて外した物（dropped：写真・見積の data:URL など）。空＝なし'],
    ['メモ', '台帳の行のメモ（note）。伏せ字はメモと同じ']
  ];
  function delTable(today, opt){
    var head = heads(DEL_COLS);
    var C = fnOf('COLS') || [];
    var lab = function (id) { if (!t(id)) return ''; var r = C.filter(function (x) { return x && x.id === id; })[0]; return r ? r.label : t(id); };
    var MODE = { formal: '正式削除', cancel: '取り消し', revert: '仮登録に戻した' };
    var list = (fnOf('deletedCarsAll') || []).slice().sort(function (a, b) { return (msOf(a.deletedAt) || 0) - (msOf(b.deletedAt) || 0) || t(a.id).localeCompare(t(b.id)); });
    var count = { 行: 0, ゴミ箱: 0, 正式削除: 0 };
    var rows = list.map(function (x) {
      var p = who(x.deletedBy, x.deletedByName);
      var inTrash = !x.restoredAt && !x.purgedAt && (!!x.inTrash || (!!x.trash && typeof x.trash === 'object'));
      var state = x.restoredAt ? '戻した' : (x.purgedAt ? '完全に消した' : (inTrash ? 'ゴミ箱' : '台帳だけ'));
      count.行++;
      if (inTrash) count.ゴミ箱++;
      if (isLedgerRow(x)) count.正式削除++;
      return ['carflow', t(x.id), today, t(x.num), makerOf(x), t(x.model), t(x.grade),
        MODE[x.mode || 'formal'] || t(x.mode), state,
        day(x.deletedAt), p[0], p[1], lab(x.fromCol),
        day(x.restoredAt), day(x.purgedAt),
        x.isDuplicate == null ? '' : (x.isDuplicate ? 1 : 0),
        Array.isArray(x.dropped) ? x.dropped.map(t).join('・') : '',
        mask(x.note, {})];
    });
    var lines = [
      '- 1行＝deletedCars の台帳の行1件（消した車）。中身の文書（~t_…＝消した車まるごと）は出さない。',
      '- 行数：' + count.行 + '／いまゴミ箱 ' + count.ゴミ箱 + '／番号台帳に数える正式削除 ' + count.正式削除 + '（carflow の「正式削除」の行と同じ数）。',
      '- 期間で自動に片づける仕組みは無い（2026-10-15 指示）。「戻した」行の車は carflow の在庫か実績に居る。'
    ];
    return { name: 'carflow.削除台帳', csv: toCsv(head, rows), dict: dictOf('carflow.削除台帳', today, opt, lines, DEL_COLS), count: count, _rows: rows, _head: head };
  }

  /* ---------------- 🚗 carflow.メーカー表（v3.18.0・メーカー1社＝1行） ---------------- */
  var MK_COLS = [
    ['アプリ', '常に carflow'],
    ['ID', 'メーカーの鍵（正式名の書き方の違いを消した物＝CFMaker.key。会社で足した行は carMakers の文書の名前と同じ）'],
    ['書き出した日', 'この表を作った日'],
    ['メーカー', '正式名'],
    ['国産輸入', '国産／輸入'],
    ['まとめる先', 'メーカー別に数える時の名前（carflow の「メーカー」の列はこれ）'],
    ['別の書き方', 'どれで打っても同じメーカーになる書き方（「・」区切り）。全角半角・ひらがなカタカナ・小さい字・空白の違いは書かなくても同じ扱い'],
    ['出どころ', '最初からある（js/car-class.js）／会社で足した（登録の時の「国産？輸入？」の答え）／会社で直した（管理者が区分を直した）'],
    ['足した人', '会社で足した・直した人の名前（姓まで）。最初からある行は空'],
    ['足した日', '会社で足した日（日本時間）']
  ];
  function makerTable(today, opt){
    var head = heads(MK_COLS);
    var list = w.CFMaker ? w.CFMaker.list() : [];
    var base = {};
    (w.CFMaker ? w.CFMaker._BASE : []).forEach(function (r) { base[w.CFMaker.key(r[0])] = 1; });
    var rows = list.map(function (r) {
      var src = !r.extra ? '最初からある' : (base[w.CFMaker.key(r.name)] ? '会社で直した' : '会社で足した');
      return ['carflow', w.CFMaker.key(r.name), today, r.name, ORG[r.origin] || '', r.group, r.aliases.join('・'), src, t(r.byName).split(/[\s　]+/)[0] || '', day(r.at)];
    });
    var lines = [
      '- 1行＝メーカー1社。CarFlow の車両登録で国産／輸入を自動で入れる表（本体＝CarFlow の js/car-class.js・会社で足した行＝companies/{cid}/carMakers）。',
      EXTRA.makersLoaded ? '- 行数：' + rows.length + '。' : '- ⚠ 今回は会社で足した行を読めなかった（表の本体だけ）。',
      '- 🔴 CarFlow だけの決まり（2026-10-19 ゆうた）。PitFlow の 1課／2課とは別物。',
      '- 相場DB・ほかの道具で国産／輸入を分ける時は、この表を読む（自分で一覧を持たない）。'
    ];
    return { name: 'carflow.メーカー表', csv: toCsv(head, rows), dict: dictOf('carflow.メーカー表', today, opt, lines, MK_COLS), count: { 行: rows.length }, _rows: rows, _head: head };
  }

  /* ================================================================
     🧾 v4.0.0 carflow.見積（companies/{cid}/carQuotes）＝1行＝見積のある車1台
     金額は見積の画面と同じ物差し：本体＝車両本体価格（税抜・納車整備を除く）・原価は税抜。支払総額は計算が要るので出さない（見積の画面だけが出す）
     ================================================================ */
  var QT_COLS = [
    ['アプリ', '常に carflow'],
    ['ID', '車のID（cars の文書の名前と同じ＝表 carflow の ID とつなげる）'],
    ['書き出した日', 'この表を作った日'],
    ['管理番号', '保存した時の管理番号'],
    ['本体（税抜）', '基本価格の車両本体価格（税抜・納車整備を除く・円）。基本価格が無い車は空'],
    ['納車整備（税抜）', 'その車の納車前点検の金額（円）。空＝設定の既定の値'],
    ['登録の種類', '中古新規／継続移転／移転継続／移転／予備検'],
    ['仕入価格', '車両原価の仕入価格（落札・買取・円・税抜）'],
    ['AA手数料', '車両原価の AA 手数料・落札料（円・税抜）'],
    ['陸送', '車両原価の陸送（円）'],
    ['自動車税月割', '車両原価の自動車税の月割（円）。無い時は空'],
    ['車両原価計', '仕入価格＋AA手数料＋陸送＋自動車税月割（円）'],
    ['粗利（本体−原価）', '本体（税抜）− 車両原価計（円）。納車整備・オプション・原価管理の部品や外注は入っていない'],
    ['値付けの回数', '基本価格の値付けの履歴の件数（初回を含む）'],
    ['最後の値付け日', '値付けの履歴の最後の日'],
    ['最後の値付けの理由', '値付けの履歴の最後の理由'],
    ['個別見積の数', 'お客様ごとの見積の件数'],
    ['売約（見積）', '見積の上の売約の札が付いているか（1＝付いている）。🔴 CarFlow の売約（cars の contract）とは別物'],
    ['売約日（見積）', '見積の上の売約の日'],
    ['売約のプラン', 'A／B／C／D（業販）'],
    ['原価管理の確定日', '原価管理で原価を確定した日。まだなら空'],
    ['更新日', '見積を最後に保存した日（日本時間）'],
    ['更新した人', '最後に保存した人（姓まで）']
  ];
  function quoteTable(today, opt){
    var head = heads(QT_COLS);
    /* v4.0.1 中身の無い見積（基本価格・お客様・売約・原価の確定のどれも無い＝画面を開いただけで出来た物）は出さない */
    var list = (EXTRA.quotes || []).filter(function (q) { return q.base || (Array.isArray(q.custs) && q.custs.length) || q.order || (q.cogs && q.cogs.done); });
    var num = function (v) { var n = Number(v); return isFinite(n) && v !== '' && v != null ? Math.round(n) : ''; };
    var rows = list.map(function (q) {
      var b = q.base || null, c = (b && b.cost) || {}, h = (b && Array.isArray(b.hist)) ? b.hist : [], last = h.length ? h[h.length - 1] : null;
      var costSum = b ? (Number(c.buy) || 0) + (Number(c.aa) || 0) + (Number(c.move) || 0) + (Number(c.tax) || 0) : '';
      var o = q.order || null, g = q.cogs || {};
      return ['carflow', t(q.carId || q.id || q._docId), today, t(q.carNum), b ? num(b.price) : '', b && b.seibi != null ? num(b.seibi) : '', b ? t(b.regType) : '',
        b ? num(c.buy) : '', b ? num(c.aa) : '', b ? num(c.move) : '', b && c.tax != null ? num(c.tax) : '', costSum, b ? num(b.price) - costSum : '',
        h.length || '', last ? t(last.date) : '', last ? t(last.why) : '', Array.isArray(q.custs) ? q.custs.length : 0,
        o ? 1 : 0, o ? t(o.date) : '', o ? t(o.plan) : '', t(g.done), day(q.updatedAt), t(q.updatedByName).split(/[\s　]+/)[0] || ''];
    });
    var lines = [
      '- 1行＝見積のある車1台（CarFlow v4.0.0 から。セールス ▸ 見積で作った物）。見積の無い車・中身の無い見積（基本価格・お客様・売約・原価の確定のどれも無い）は出ない。',
      EXTRA.quotes ? '- 行数：' + rows.length + '。' : '- ⚠ 今回は見積（carQuotes）を読めなかった。',
      '- 🔴 「売約（見積）」は見積の上の札だけ。車が売れたかは表 carflow（CarFlow の売約・納車）で数える。',
      '- 粗利（本体−原価）は車両本体と車両原価だけの差。オプション・諸費用・原価管理の部品や外注は入っていない。'
    ];
    return { name: 'carflow.見積', csv: toCsv(head, rows), dict: dictOf('carflow.見積', today, opt, lines, QT_COLS), count: { 行: rows.length }, _rows: rows, _head: head };
  }

  /* ================================================================
     📣 v4.5.0 carflow.反響グー／carflow.反響カーセンサー（companies/{cid}/carReactions）
     設定 ▸ データ の「反響の取り込み」（週1回のポータル点検）で入れた生の数字。点数は作らない
     ================================================================ */
  var RXG_COLS = [['アプリ', '常に carflow'], ['ID', '車のID（表 carflow の ID）'], ['書き出した日', 'この表を作った日'], ['管理番号', '取り込んだ時の管理番号'], ['日', 'グーの数字の日'],
    ['一覧で見られた', 'グー 正面画像表示回数（その日）'], ['写真を開いた', 'グー 複数画像表示回数（その日）'], ['見積依頼', 'グー 見積依頼件数（その日）'], ['検討中に入れた', 'グー 検討中リスト追加数（その日）'],
    ['店舗詳細', 'グー 店舗詳細閲覧回数（その日）'], ['MAP', 'グー MAP閲覧回数（その日）'], ['レビュー', 'グー ユーザーレビュー閲覧回数（その日）']];
  var RXC_COLS = [['アプリ', '常に carflow'], ['ID', '車のID（表 carflow の ID）'], ['書き出した日', 'この表を作った日'], ['管理番号', '取り込んだ時の管理番号'], ['控えの日', 'カーセンサーの登録物件一覧を書き出した日'],
    ['総掲載日数', 'その日までの累計'], ['詳細閲覧', 'その日までの累計'], ['メール問合せ', 'その日までの累計'], ['電話問合せ', 'その日までの累計'], ['MAP', 'その日までの累計'], ['お気に入り', 'その日までの累計']];
  function rxTable(today, opt, kind){
    var cols = kind === 'goo' ? RXG_COLS : RXC_COLS, head = heads(cols), rows = [];
    (EXTRA.reactions || []).forEach(function (r) {
      var m = (kind === 'goo' ? r.goo : r.cs) || {}, id = t(r.carId || r.id || r._docId);
      Object.keys(m).sort().forEach(function (d) { var v = Array.isArray(m[d]) ? m[d] : []; rows.push(['carflow', id, today, t(r.num), d].concat(cols.slice(5).map(function (x, i) { var n = Number(v[i]); return isFinite(n) ? n : ''; }))); });
    });
    var name = kind === 'goo' ? 'carflow.反響グー' : 'carflow.反響カーセンサー';
    var lines = [
      kind === 'goo' ? '- 1行＝車1台×1日（グー MOTORGATE 効果分析 ▸ 在庫・日ごと）。週1回のポータル点検で 設定 ▸ データ ▸ 反響の取り込み から入れた分だけ。' : '- 1行＝車1台×控えの日（カーセンサー C-MATCH 登録物件一覧の累計）。週の数字は控えどうしの差で出す。',
      EXTRA.reactions ? '- 行数：' + rows.length + '。' : '- ⚠ 今回は反響（carReactions）を読めなかった。',
      '- 🔴 点数ではなく生の数字。反響の点数は答え合わせ中（反響DB の決まり）＝在庫を動かす根拠にしない。'
    ];
    return { name: name, csv: toCsv(head, rows), dict: dictOf(name, today, opt, lines, cols), count: { 行: rows.length }, _rows: rows, _head: head };
  }

  function allTables(opt){
    opt = opt || {};
    var T = build(opt);
    var out = [{ name: 'carflow', csv: T.csv, dict: T.dict, count: T.count }];
    [auditTable(T.today, opt), goalTable(T.today, opt, T.source), equipTable(T, opt), tentTable(T.today, opt), manualTable(T.today, opt), delTable(T.today, opt), makerTable(T.today, opt), quoteTable(T.today, opt), rxTable(T.today, opt, 'goo'), rxTable(T.today, opt, 'cs')]
      .forEach(function (x) { out.push({ name: x.name, csv: x.csv, dict: x.dict, count: x.count }); });
    return out;
  }

  /* ================================================================
     公開（サーバーはこの約束だけを見る）
     ================================================================ */
  w.CF_ANALYTICS = {
    app: 'carflow',
    version: VERSION,
    sources: SOURCES,
    coreSources: CORE_SOURCES,   /* v3.16.10 車の数え方だけに要る入れ物（サーバーの car-month.js 用。操作ログなどを読まない） */
    fill: fill,
    tables: allTables,
    _build: build,   /* 見張り用（列と行をそのまま見る） */
    _sub: { audit: auditTable, goal: goalTable, equip: equipTable, tent: tentTable, manual: manualTable, del: delTable, maker: makerTable, quote: quoteTable, rx: rxTable }   /* 見張り用 */
  };
})(window);
