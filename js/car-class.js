/* ================================================================================
   car-class.js  -  🚗 車の区分（国産／輸入・軽）とメーカー表   CarFlow v3.18.0
   ================================================================================
   ◎ゆうた（2026-10-19）
     🗣「全アプリに関してはとりあえずいいや。PitFlowが整備ソフトとの兼ね合いがあるからあまりいじりたくない。
        だからCarFlowだけに限定して作成する感じに」
     ＝ CarFlow（本物）と見積モックだけで使う。PitFlow の 1課／2課（boardId）とは関係しない。
     見本と棚卸し＝ `..\..\..\_記録\モック\モック_2026-10-19_国産輸入軽の区分.html`・`..\..\..\_記録\調査・棚卸し\棚卸し_2026-10-19_国産輸入軽の区分.md`

   ◎決まり
     ① 国産／輸入は**メーカーで決まる** → 下の「メーカー表」で毎回読む。車には**手で直した時だけ** origin を書く
     ② 軽は**1台ごとに決まる** → 車の kei（手で直した時・型式や車検証から入れた時）／無ければ排気量 ≦660cc／無ければボディ（「軽」を含む）
     ③ 表に無いメーカーは**勝手に国産にしない**（空＝わからない）。画面で1回だけ「国産？輸入？」と聞き、答えを会社の表（carMakers）に1行足す
     ④ 打った文字はそのまま残す。判定と集計の時だけ、表の正式名・まとめる先に読み替える
     ⑤ BMW の MINI と MINI は「MINI」（全アプリ共通の決まり・analytics-car.js の前からの決まりと同じ）

   ◎置き場
     このファイルは**画面も Firestore も触らない**（表と判定だけ）＝分析用の書き出し（サーバー）と見積モックもこのまま読み込む。
     会社で足した行の読み書きは db-makers.js。表を見る・直す画面は settings.js（車両・販売）。
     🔜 あとで全アプリ共通にする時は、このファイルを _shared へ移すだけで済む形にしてある（CarFlow の物を何も借りていない）。

   ◎表の1行＝[正式名, 区分, まとめる先, 別の書き方…]
     区分＝'dom'（国産）／'imp'（輸入）。まとめる先が '' なら正式名のまま。
     最初の表は 相場DB（build.py の MAKER）・グーのカタログ（goo_all.json の42社）・見積モックの IMPORT_MK・
     PitFlow のお客様の車に実際に入っている書き方（54通り・2026-10-19 の書き出し）から作った。手で一から打っていない。
     全角／半角・ひらがな／カタカナ・小さい字（ィ→イ）・空白と「・」の違いは、表に書かなくても同じ扱い（key）。
   ================================================================================ */
(function (w) {
  'use strict';

  var BASE = [
    /* ---------- 国産 ---------- */
    ['トヨタ', 'dom', '', 'TOYOTA', 'トヨタ自動車', 'TMUK', 'TMT', 'TMMK', 'トヨタTMMK', 'NUMMI'],
    ['レクサス', 'dom', '', 'LEXUS'],
    ['日産', 'dom', '', 'ニッサン', 'NISSAN', '日産自動車', 'ニッサンMT'],
    ['ホンダ', 'dom', '', 'HONDA', '本田', '本田技研', 'ホンダオブザユーケー', 'ホンダカナダ', 'ホンダオブアメリカ'],
    ['マツダ', 'dom', '', 'MAZDA', 'ユーノス', 'アンフィニ', 'オートザム'],
    ['三菱', 'dom', '', 'ミツビシ', 'MITSUBISHI', '三菱自動車'],
    ['三菱ふそう', 'dom', '', 'ミツビシフソウ', 'FUSO'],
    ['スバル', 'dom', '', 'SUBARU', '富士重工'],
    ['スズキ', 'dom', '', 'SUZUKI'],
    ['ダイハツ', 'dom', '', 'DAIHATSU'],
    ['いすゞ', 'dom', '', 'イスズ', 'いすず', 'ISUZU'],
    ['日野', 'dom', '', 'ヒノ', 'HINO'],
    ['光岡', 'dom', '', 'ミツオカ', 'MITSUOKA'],
    ['UDトラックス', 'dom', '', '日産ディーゼル'],
    ['ヤマハ', 'dom', '', 'YAMAHA'],
    ['カワサキ', 'dom', '', 'KAWASAKI'],
    /* ---------- 輸入 ---------- */
    ['BMW', 'imp', '', 'ビーエムダブリュー'],
    ['BMWアルピナ', 'imp', '', 'アルピナ', 'ALPINA'],
    ['MINI', 'imp', '', 'ミニ', 'BMWMINI', 'BMWミニ'],
    ['メルセデス・ベンツ', 'imp', '', 'ベンツ', 'メルセデス', 'MERCEDES', 'MERCEDESBENZ', 'BENZ', 'メルセデスAMG', 'AMG', 'メルセデスマイバッハ', 'マイバッハ'],
    ['スマート', 'imp', '', 'SMART', 'MCC'],
    ['フォルクスワーゲン', 'imp', '', 'VW', 'VOLKSWAGEN', 'ワーゲン'],
    ['アウディ', 'imp', '', 'AUDI'],
    ['ポルシェ', 'imp', '', 'PORSCHE'],
    ['オペル', 'imp', '', 'OPEL'],
    ['ボルボ', 'imp', '', 'VOLVO'],
    ['プジョー', 'imp', '', 'PEUGEOT'],
    ['シトロエン', 'imp', '', 'CITROEN'],
    ['DS', 'imp', '', 'DSオートモビル', 'DSオートモビルズ', 'DSAUTOMOBILES'],
    ['ルノー', 'imp', '', 'RENAULT'],
    ['アルピーヌ', 'imp', '', 'ALPINE'],
    ['フィアット', 'imp', '', 'FIAT'],
    ['アバルト', 'imp', '', 'ABARTH'],
    ['アルファロメオ', 'imp', '', 'ALFAROMEO', 'アルファ'],
    ['ランチア', 'imp', '', 'LANCIA'],
    ['フェラーリ', 'imp', '', 'FERRARI'],
    ['マセラティ', 'imp', '', 'MASERATI'],
    ['ランボルギーニ', 'imp', '', 'LAMBORGHINI'],
    ['ジャガー', 'imp', '', 'JAGUAR'],
    ['ランドローバー', 'imp', '', 'LANDROVER', 'ランドロバー', 'レンジローバー', 'RANGEROVER'],
    ['ローバー', 'imp', '', 'ROVER'],
    ['ロールスロイス', 'imp', '', 'ROLLSROYCE'],
    ['ベントレー', 'imp', '', 'BENTLEY'],
    ['アストンマーティン', 'imp', '', 'アストンマーチン', 'ASTONMARTIN'],
    ['ロータス', 'imp', '', 'LOTUS'],
    ['マクラーレン', 'imp', '', 'MCLAREN'],
    ['ケータハム', 'imp', '', 'CATERHAM'],
    ['サーブ', 'imp', '', 'SAAB'],
    ['ジープ', 'imp', '', 'JEEP', 'クライスラージープ', 'クライスラー・ジープ'],
    ['クライスラー', 'imp', '', 'CHRYSLER'],
    ['ダッジ', 'imp', '', 'DODGE'],
    ['シボレー', 'imp', '', 'CHEVROLET'],
    ['キャデラック', 'imp', '', 'CADILLAC'],
    ['GMC', 'imp', ''],
    ['ハマー', 'imp', '', 'HUMMER'],
    ['フォード', 'imp', '', 'FORD', 'ニホンフォード', '日本フォード'],
    ['リンカーン', 'imp', '', 'LINCOLN'],
    ['テスラ', 'imp', '', 'TESLA'],
    ['ヒョンデ', 'imp', '', 'ヒュンダイ', 'HYUNDAI'],
    ['BYD', 'imp', ''],
    ['ドゥカティ', 'imp', '', 'ドカティ', 'ドカテイ', 'DUCATI'],
    ['ハーレーダビッドソン', 'imp', '', 'ハーレー', 'HARLEYDAVIDSON']
  ];

  var ORIGIN_LABEL = { dom: '国産', imp: '輸入' };

  /* 書き方の違いを消した鍵：全角→半角（NFKC）・大文字・ひらがな→カタカナ・小さい字→大きい字・空白と記号を外す */
  var SMALL = { 'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ッ': 'ツ', 'ヮ': 'ワ', 'ヵ': 'カ', 'ヶ': 'ケ' };
  function key(s){
    s = String(s == null ? '' : s);
    if (s.normalize) s = s.normalize('NFKC');
    s = s.toUpperCase().replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); });
    s = s.replace(/[ァィゥェォャュョッヮヵヶ]/g, function (c) { return SMALL[c]; });
    return s.replace(/[\s・･\.\-‐−―_,、。'’`"&\/\\()（）]/g, '');
  }

  /* 表の索引。BASE と会社で足した行（extra）を重ねる。同じ鍵は会社の行が勝つ（管理者が区分を直した時） */
  var ROWS = [], IDX = {}, EXTRA = [];
  function rowOf(a, extra){
    return { name: a.name, origin: a.origin === 'dom' || a.origin === 'imp' ? a.origin : '', group: a.group || a.name,
      aliases: (a.aliases || []).slice(), extra: !!extra, by: a.by || '', byName: a.byName || '', at: a.at || null, id: a.id || '' };
  }
  function rebuild(){
    ROWS = []; IDX = {};
    BASE.forEach(function (r) { ROWS.push(rowOf({ name: r[0], origin: r[1], group: r[2], aliases: r.slice(3) }, false)); });
    EXTRA.forEach(function (x) {
      if (!x || !x.name) return;
      var r = rowOf(x, true), k = key(r.name);
      /* 正式名か別の書き方が表の行と同じなら、その行を置き換える（区分・まとめる先を管理者が直した時） */
      var hit = -1;
      ROWS.forEach(function (o, i) { if (hit < 0 && !o.extra && (key(o.name) === k || o.aliases.some(function (a) { return key(a) === k; }))) hit = i; });
      if (hit >= 0) {
        var o = ROWS[hit];
        r.aliases = o.aliases.concat(r.aliases).concat(key(o.name) === k ? [] : [o.name]);
        if (key(o.name) !== k) r.name = o.name;
        if (!x.group) r.group = o.group;
        ROWS[hit] = r;
      } else ROWS.push(r);
    });
    /* 書き方違いとして既存の行に足した物（aliasOf） */
    EXTRA.forEach(function (x) {
      if (!x || !x.aliasOf || !x.alias) return;
      var tk = key(x.aliasOf);
      ROWS.forEach(function (o) { if (key(o.name) === tk && o.aliases.indexOf(x.alias) < 0) o.aliases.push(x.alias); });
    });
    ROWS.forEach(function (r) {
      [r.name].concat(r.aliases).forEach(function (a) { var k = key(a); if (k && !IDX[k]) IDX[k] = r; });
    });
  }

  /* ミニの見分け（analytics-car.js の前からの決まりと同じ） */
  function isMini(maker, model){
    var x = String(model || '') + ' ' + String(maker || '');
    return /ミニ|MINI|ﾐﾆ|ＭＩＮＩ/i.test(x) && !/ミニカ|ミニキャブ|ミニバン/.test(String(model || ''));
  }

  /* メーカー名 → 表の行（無ければ null）。まず鍵が同じ行、無ければ鍵の頭が一番長く合う行（「トヨタ自動車株式会社」など） */
  function find(maker){
    var k = key(maker);
    if (!k) return null;
    if (IDX[k]) return IDX[k];
    var best = null, bl = 1;
    Object.keys(IDX).forEach(function (ik) { if (ik.length > bl && k.indexOf(ik) === 0) { best = IDX[ik]; bl = ik.length; } });
    return best;
  }
  /* 国産／輸入：'dom'／'imp'／''（わからない） */
  function originOf(maker, model){
    var r = find(maker);
    if (r && r.origin) return r.origin;
    if (isMini(maker, model)) return 'imp';
    return '';
  }
  /* 集計でまとめる先（メーカー別に数える所）。表に無ければ打った文字のまま */
  function groupOf(maker, model){
    if (isMini(maker, model)) return 'MINI';
    var r = find(maker);
    return r ? r.group : String(maker == null ? '' : maker).trim();
  }

  /* ---------------- 車1台の区分（手で直した値 → 自動） ---------------- */
  /* 国産／輸入：{ v:'dom'|'imp'|'', by:'hand'|'table'|'' } */
  function carOrigin(car){
    car = car || {};
    if (car.origin === 'dom' || car.origin === 'imp') return { v: car.origin, by: 'hand' };
    var v = originOf(car.maker, car.model);
    return { v: v, by: v ? 'table' : '' };
  }
  /* 軽：{ v:true|false|null, by:'hand'|'katashiki'|'shaken'|'cc'|'size'|'' }
     CarFlow の手で直した印 keiHand（'kei'／'normal'）／見積モックの kei（true/false・keiBy＝出どころ・無ければ手）／
     排気量 cc／ボディ（size に「軽」） */
  function carKei(car){
    car = car || {};
    if (car.keiHand === 'kei' || car.keiHand === 'normal') return { v: car.keiHand === 'kei', by: 'hand' };
    if (car.kei === true || car.kei === false) return { v: car.kei, by: car.keiBy || 'hand' };
    var cc = parseInt(String(car.cc == null ? '' : car.cc).replace(/[^\d]/g, ''), 10);
    if (cc > 0) return { v: cc <= 660, by: 'cc' };
    var sz = String(car.size == null ? '' : car.size).trim();
    if (sz) return { v: /軽/.test(sz), by: 'size' };
    return { v: null, by: '' };
  }

  var BY_LABEL = { hand: '手で直した', table: 'メーカー表から', katashiki: '型式から', shaken: '車検証から', cc: '排気量から', size: 'ボディから' };

  /* 同じメーカー（鍵が同じ）が2回来たら後の方だけ（答えた直後の仮の行と、届いた行が重なった時） */
  function setExtra(list){
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).slice().reverse().forEach(function (x) {
      if (!x) return;
      var k = x.aliasOf ? 'alias:' + key(x.alias) : key(x.name);
      if (!k || seen[k]) return;
      seen[k] = 1; out.unshift(x);
    });
    EXTRA = out; rebuild();
  }
  function list(){ return ROWS.slice(); }
  /* 候補（datalist 用）：正式名を表の順に */
  function names(){ return ROWS.map(function (r) { return r.name; }); }

  rebuild();

  w.CFMaker = {
    key: key, find: find, origin: originOf, group: groupOf, isMini: isMini,
    isImport: function (maker, model) { return originOf(maker, model) === 'imp'; },
    known: function (maker) { return !!find(maker) || isMini(maker, ''); },
    list: list, names: names, setExtra: setExtra,
    ORIGIN_LABEL: ORIGIN_LABEL, BY_LABEL: BY_LABEL, _BASE: BASE
  };
  w.CFCarClass = { origin: carOrigin, kei: carKei, BY_LABEL: BY_LABEL, ORIGIN_LABEL: ORIGIN_LABEL };
})(typeof window !== 'undefined' ? window : this);
