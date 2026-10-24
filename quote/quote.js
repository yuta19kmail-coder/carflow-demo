'use strict';
/* =====================================================================
   0. 表（2026-09-30 公的資料で確認。調査＝..\調査_見積機能_2026-09-30\05_税・保険_2026年9月時点.md）
   ===================================================================== */
const TAX_CAR = [[1000,25000,29500],[1500,30500,34500],[2000,36000,39500],[2500,43500,45000],[3000,50000,51000],[3500,57000,58000],[4000,65500,66500],[4500,75500,76500],[6000,87000,88000],[99999,110000,111000]];
const WEIGHT_2Y = { exempt:0, eco:5000, std:8200, y13:11400, y18:12600 };
const WEIGHT_KEI_2Y = { exempt:0, eco:5000, std:6600, y13:8200, y18:8800 };
const JIBAI = [
  { from:'2023-04-01', car:{12:11500,13:12010,24:17650,25:18160,36:23690,37:24190}, kei:{12:11440,13:11950,24:17540,25:18040,36:23520,37:24010} },
  { from:'2026-11-01', car:{12:12250,13:12770,24:18560,25:19070,36:24690,37:25180}, kei:{12:12300,13:12830,24:18660,25:19170,36:24830,37:25330} },
];
/* 登録の種類（v3.5 納車まわりモックの「登録パターン」と同じ5つ。🗣 2026-10-01「名変の呼び方も移転に統一」）
   insp＝車検（検査）を受けて渡す／xfer＝今のナンバーのまま持ち主を変える（自動車税は未経過相当額＝課税）／buyerReg＝登録はお客様側 */
const REG_TYPES = [
  { k:'shinki',  l:'中古新規', d:'一時抹消の車を新しく登録して、車検を取って渡す', insp:true,  xfer:false },
  { k:'keiten',  l:'継続移転', d:'車検を取ってから（継続検査）、持ち主を移す',       insp:true,  xfer:true  },
  { k:'itenkei', l:'移転継続', d:'持ち主を移してから、車検を取る',                   insp:true,  xfer:true  },
  { k:'iten',    l:'移転',     d:'車検が残っているので、持ち主を移すだけ',           insp:false, xfer:true  },
  { k:'yobi',    l:'予備検',   d:'検査だけ受けて予備検査証で渡す（登録はお客様側）',   insp:true,  xfer:false, buyerReg:true },
];
const regOf = k => REG_TYPES.find(r=>r.k===k) || REG_TYPES[0];
/* 5ナンバー（小型）／3ナンバー（普通）。🗣 2026-10-22「とりあえず 5 と 3 のスイッチをつけて、それで金額が変わるように」（寸法からの自動は本実装で）
   押していない車は排気量で仮に決める（2,000cc 超＝3ナンバー）。軽は使わない */
function plateClsOf(car, b){ return (b && b.plateCls) || ((+car.cc||0) > 2000 ? '3' : '5'); }
/* 見積の画面の版＝CarFlow の版（v4.0.0 で見積モック v4.83.0 を本物に移した。モックの版はここで止める） */
const MOCK_VER = '4.83.0';
const TODAY = window.Q_TODAY || new Date().toISOString().slice(0,10);   /* 今日（PC の時計）。モックは 2026-09-30 に止めていた */
const PLANS = ['A','B','C'];
const plansOf = showD => showD ? PLANS.concat('D') : PLANS;
const custPlans = u => u.plans && u.plans.length ? u.plans : plansOf(u.showD);   // 個別見積で選んだプラン（前からある見積は A/B/C＋業販）

/* =====================================================================
   1. 既定の値（プランの中身・諸費用・税の表など。車は CarFlow から・見積は Firestore から＝quote-data.js）
   ===================================================================== */
const COLORS = { 'パール':'#f1efe9','ブラック':'#2b2f38','シルバー':'#c5ccd6','ホワイト':'#fafafa','レッド':'#c0392b','ブルー':'#2f5d9e','グレー':'#8a929e','ベージュ':'#d9c7a7','ミントグリーン':'#9fd8c4' };
/* プランのオプションのテンプレ（🗣 2026-10-03「テンプレ部分を作り込んで」。金額は見本＝設定で直す）
   vt＝種類：null（1つの金額）／'size'（ボディサイズで金額が変わる・車から自動で選ぶ）／'pick'（工賃などを選ぶ）。金額＝a ＋ vo の選んだ金額 */
/* ドラレコの取付工賃（社内料金表 ドラレコ取付工賃 2023.03.23 の「コバモ購入」・税抜）。並びの最初＝選ぶ前の値（前後カメラが多いので 前後セダン） */
const DR_VO = () => [['前後セダン',16000],['前後セダン＋駐車監視',19000],['前後ワゴン',25000],['前後ワゴン＋駐車監視',28000],['前のみ',9000],['前のみ＋駐車監視',12000]];
const DR_VO_IMP = () => [['前後セダン',18000],['前後セダン＋駐車監視',21000],['前後ワゴン',26000],['前後ワゴン＋駐車監視',29000],['前のみ',13000],['前のみ＋駐車監視',16000]];
const DR_BO = () => [['ユピテル SN-TW73d',27000],['ユピテル SN-ST 5700d',19500],['ユピテル Z-330',50000],['ユピテル ZNV-800M',55000]];   // StockFlow の定価（2026-10-23）の控え
const PACK_ITEMS = () => [
  /* 🗣 2026-10-04「希望ナンバーはパックとしてプラン見積に入れたい」→「デフォで ABC チェック・OP の一番上」。SCD の在庫見積では 10/11 件に「希望ナンバーパック（10,000円）」（調査 10）。
     金額の中に希望番号のナンバー代と手続きが入る＝パックが入ったプランはナンバー代（通常）を外す。名前に「希望ナンバー」が入る品で判定
     → v4.5.7 🗣 2026-10-24「希望ナンバーはパックで1万円、それとは別に通常ナンバー代はいれてほしい」＝パックが入っても通常のナンバー代（諸費用・立替）は外さない */
  { id:'wish_pk', n:'希望ナンバーパック', a:10000, in:{A:1,B:1,C:1} },
  { id:'etc_re',  n:'既設ETC再セットアップ', a:3500, in:{A:1,B:1,C:1} },
  /* labor＝取付工賃が付く品（🗣 2026-10-03「ドラレコとかは工賃と分けて記載」→ お勧め＝入力は1行・紙は本体と工賃の2行）。a＝本体、vo＝取付工賃の種類（3つ目が 1 なら本体なし＝持ち込み品の取付） */
  { id:'etc_new', n:'ETC車載器 新規取付', a:9800, bo:[['ETC車載器（アンテナ分離型）',9800],['ETC2.0車載器',19800]], vt:'pick', vl:'取付工賃', labor:1, vo:[['標準取付',10000],['持ち込み品の取付（本体なし）',10000,1]], in:{A:0,B:0,C:0} },
  { id:'etc_set', n:'ETCセットアップ', a:3500, in:{A:0,B:0,C:0} },
  /* bo＝機種（本体の名前と金額）。🗣 2026-10-03「ドラレコは本体の金額も先に設定しておきたい」→「機種を何種類か用意して選ぶ形」＝そっち。金額は見本 */
  /* 🗣 2026-10-23「ドラレコの工賃をこれ（社内料金表 ドラレコ取付工賃 2023.03.23・コバモ購入）に揃えて」「本体は StockFlow のドラレコを見て」
     「種類で分ける・OBD と特殊（＋5千円〜）だけ外す」「持ち込みは入れない」「駐車記録ユニットなど別売りは今回入れない」
     ＝工賃は 前後セダン／前後ワゴン／前のみ（それぞれ駐車監視あり・なし）・国産と輸入車（voImp）で別の値段・税抜。本体＝StockFlow の料金表の「ドライブレコーダー」（sfCat・定価。店頭が入ったら店頭）。bo は StockFlow を読めない時の控え */
  { id:'dr_tw73', n:'ドライブレコーダー', a:27000, sfCat:'ドライブレコーダー', bo:DR_BO(), vt:'pick', vl:'取付工賃', labor:1, vo:DR_VO(), voImp:DR_VO_IMP(), in:{A:0,B:1,C:1} },
  /* 納車の洗車・コーティング・ルームクリーニング（🗣 2026-10-16「納車の洗車系も全部 OP に。裸はなし＝水洗い洗車のみ・内装なし。
       A＝納車クリーニング（GYEON 洗車＋室内清掃）1.5万／B＝1y とルームクリーニング梅／C＝ジーゾックスとルームクリーニング竹。コーティングとルークリはそれぞれ別料金」）
     金額＝社内料金表（カーケア料金表 2021.04.13／コーティング料金表 2022.10.24・社外秘）の税抜。大きさはこっちで決める（自動選択なし・car.std.csize）
     ルームクリーニングは S・M・L の3段＝ボディサイズ S・SM→S、M・L→M、MH・LH→L で読む（仮の読み替え）。ジーゾックスは「通常価格」・輸入車は voImp。LH は料金表に無い＝要相談 */
  { id:'cl_dl',   n:'納車クリーニング（GYEON 洗車＋室内清掃）', a:15000, in:{A:1,B:0,C:0} },
  /* v4.5.8 🗣 2026-10-24「コーティングの値段は StockFlow から参照する形に。設定からいじれなくてOK」＝sfCoat＝StockFlow の料金表（作業・コーティング）の組の名前（imp＝輸入車の組）。
     段ごとの値段は StockFlow の「…・Mサイズ」の定価（税抜）。読めない時（デモ・通信）は下の vo（2026-10-24 時点の StockFlow と同じ値）を使う */
  { id:'ct_3m',   n:'ボディコーティング KeePer 3m（ポリマー）', a:0, sfCoat:{ v:'KeePer 3m Coating 基本料金' }, vt:'size', vl:'ボディサイズ', vo:[['S',7500],['SM',8000],['M',8500],['L',9000],['MH',12000],['LH',14000]], in:{A:0,B:0,C:0} },
  { id:'ct_1y',   n:'ボディコーティング KeePer 1y（ガラス）', a:0, sfCoat:{ v:'KeePer 1y Coating（ガラス）' }, vt:'size', vl:'ボディサイズ', vo:[['S',19400],['SM',21600],['M',23900],['L',26100],['MH',30300],['LH',34600]], in:{A:0,B:1,C:0} },
  { id:'ct_gz',   n:'ボディコーティング G\'ZOX リアルガラスコート', a:0, sfCoat:{ v:'国産 通常価格', imp:'輸入車 通常価格' }, vt:'size', vl:'ボディサイズ', vo:[['S',82600],['SM',92600],['M',97600],['L',123600],['MH',137600],['LH',null]], voImp:[['S',null],['SM',97600],['M',117600],['L',137600],['MH',167600],['LH',null]], in:{A:0,B:0,C:1} },
  { id:'rc_ume',  n:'ルームクリーニング 梅', a:0, vt:'size', vl:'ボディサイズ', vo:[['S',3300],['SM',3300],['M',4600],['L',4600],['MH',5700],['LH',5700]], in:{A:0,B:1,C:0} },
  { id:'rc_take', n:'ルームクリーニング 竹', a:0, vt:'size', vl:'ボディサイズ', vo:[['S',5600],['SM',5600],['M',6600],['L',6600],['MH',7800],['LH',7800]], in:{A:0,B:0,C:1} },
  { id:'rc_matsu',n:'ルームクリーニング 松', a:0, vt:'size', vl:'ボディサイズ', vo:[['S',28000],['SM',28000],['M',30000],['L',30000],['MH',32000],['LH',32000]], in:{A:0,B:0,C:0} },
  /* 🗣 2026-10-03「3品は足して」＝SCD の在庫見積で多く出ていた物（10_SCD在庫見積の頻出項目.md）。金額は見本 */
  { id:'ozone',   n:'オゾン除菌消臭システム', a:4500, in:{A:0,B:1,C:1} },
  { id:'acf_al',  n:'エアコンフィルター抗アレルギー', a:4400, in:{A:0,B:1,C:1} },
  { id:'led_sig', n:'LED発煙筒', a:3300, in:{A:0,B:1,C:1} },   // 🗣「信号灯じゃなくて LED 発煙筒に」
];
const SIZE_CLS = ['S','SM','M','L','MH','LH'];
const SIZE_EX = { S:'ワゴンR・アルト', SM:'エブリイ・タント・スイフト', M:'ウィッシュ・レガシー', L:'Eクラス・クラウン', MH:'ステップ・セレナ', LH:'アルファード・Sクラス・V' };   // 料金表の例
/* ボディサイズ（コーティングの段）は車から自動で選ばない。プラン見積で人が選ぶ（car.std.csize） */
/* 納車整備とメンテナンスパック（🗣 2026-10-16 確定）
   ・基本（裸の見積）＝納車前点検 1.5万（車両価格に含む）。本当に点検だけ（オイル交換・部品交換なし）。車の状態で多少上げることもある＝既定値・車ごとに変えられる。保証 3か月または3,000km
   ・スタンダードメンテナンスパック ＋4万（＝いままでの「スタンダード 5.5万」と同じ合計）。保証 1年または10,000km
   ・プレミアムメンテナンスパック ＋8万（金額も内容もまだ仮）。保証 3年または30,000km
   ・プラン見積は A・B＝スタンダード、C＝プレミアム（設定・車ごと・お客様ごとに変えられる）
   k＝L（基本）/M/H。L の price＝車両価格に含む既定の金額、M・H の add＝パックの金額（車の納車前点検の金額に関係なく固定）、war＝そのプランの保証
   🗣 2026-10-23「とにかくスマートカーディーラーから移行することに全力で行く」「メンテナンスパックと保証が大きく違う」「メンテナンスパックを選ばせないようにして、
   基本の納車整備を5.5万円で3年3万キロ保証をデフォルトに。ただし無くすなどではなく、グレーアウトにしてその上に枠を置いて暫定処置」
   （見本＝_記録\モック\モック_2026-10-23_メンテナンスパックの暫定処置.html）
   ＝基本（L）を「納車整備 5.5万・保証 3年または30,000km」・中身は今までのスタンダードの内容。パック（M・H）は PACK_HOLD の間は使わない（設定は残す＝枠を外せば戻る） */
const PACK_HOLD = true;
const SEIBI_TIERS = () => [
  { k:'L', name:'納車整備', price:55000, war:'3年または30,000km', note:'法定12か月点検の項目の点検／エンジンオイル・フィルター交換／バッテリー交換／ワイパーゴム交換／ブレーキフルード交換／エアコンガスクリーニング＆補充', tbd:false },
  { k:'M', name:'スタンダードメンテナンスパック', add:40000, war:'1年または10,000km', note:'エンジンオイル・フィルター交換／バッテリー交換／ワイパーゴム交換／ブレーキフルード交換／エアコンガスクリーニング＆補充', tbd:false },
  { k:'H', name:'プレミアムメンテナンスパック', add:80000, war:'3年または30,000km', note:'スタンダードの内容＋足回り・消耗品の予防交換（内容は検討中）', tbd:true } ];
function defaultSettings(){
  return {
    seibi:{ tiers:SEIBI_TIERS(), v2:1 },
    packs:{ names:{A:'エントリー',B:'スタンダード',C:'プレミアム'}, tier:{A:'M',B:'M',C:'H'}, rec:'B', items:PACK_ITEMS(), v2:1, v3:1, v4:1, v5:1, v6:1, v7:1, v8:1, v9:1 },
    quick:[ ['スタッドレスタイヤ4本',68000], ['フロアマット交換',18000], ['ナビ地図更新',15000], ['バイザー',12000], ['ドライブレコーダー（前）',19800] ],
    fees:{ daikoReg:25000,   /* 🗣 2026-10-19「検査登録手続代行費用の既定を 25,000 に」（選択肢は 25,000／35,000）。前＝🗣 2026-10-04「基本は登録を3万に増やす感じでまとまった」＝代書費用（行政書士法で不可）を置かない代わり。調査＝資料\調査_見積機能_2026-09-30	 */
       daikoRegImp:35000,   /* 🗣 2026-10-19「メーカー名を見て振り分けられるよね？国産だと 2.5万で輸入車が 3.5万」＝輸入車（isImport）の既定 */
       daikoGarage:15000, daikoGarageKei:10000, garage:2200, plate:1980, plateKei:2100, wish:5000, out:15000, deliver:20000 },
    /* 🗣 2026-10-19「希望ナンバーの代行手数料が 5千円。ナンバー代は調べてちゃんとした金額を代入できるように」＝fees.wish は代行（課税）。ナンバー代（立替・2枚）は下の表
       根拠＝関東運輸局 2025-03-28 発表「自動車登録番号標交付手数料の改定」別紙の千葉県（2025-04-07 から・希望と図柄は予約分から）。軽はくるなび（千葉県のナンバープレート代一覧・2025-05-01 以降）。図柄のフルカラー寄付金（1,000円〜）は入っていない */
    plates:{ wishP:5000, wishJ:9000, zug:8500, kWishP:5200, kWishJ:10000, kZug:8600 },
    /* 検査・登録の手数料（立替）。🗣 2026-10-22「うちは認証」＝陸運局への持込検査の額（指定工場の 3,300 ではない）。car＝3ナンバー（普通）・sm＝5ナンバー（小型）
       根拠＝国交省「登録・検査手数料一覧表（令和8年4月1日現在）」：中古新規の登録 1,300＋新規検査 持込 普通 2,900／小型 2,800、継続検査 持込 普通 2,600／小型 2,500、移転 700。⚠ 予備検・軽は未確認の仮の値＝設定で直せる */
    reg:{ car:{ shinki:4200, keiten:3300, itenkei:3300, iten:700, yobi:1800 }, sm:{ shinki:4100, keiten:3200, itenkei:3200, iten:700, yobi:1800 }, kei:{ shinki:1800, keiten:1800, itenkei:1800, iten:0, yobi:1800 } },
    company:{ name:'小林モータース株式会社', zip:'〒270-0000', addr:'千葉県松戸市○○ 2-3-2', tel:'047-000-0000', fax:'047-000-0000', line:'https://line.me/R/ti/p/@150irnnj', inv:'T0000000000000', kobutsu:'第000000000000号', bank:'○○銀行 ○○支店（普）0000000 小林モータース株式会社', valid:30, area:'千葉県内登録（松戸）・店頭納車' },
    loan:{ rate:9.3, count:60 },
    staff:['小林 裕太','山田 花子','専務'],
  };
}
function mkBase(o){ const nm = (d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'))(new Date(+TODAY.slice(0,4), +TODAY.slice(5,7), 1)), se = (+TODAY.slice(0,4)+1)+TODAY.slice(4,7);
  return Object.assign({ price:0, wsPrice:0, newCar:false, regType:'shinki', plate:'keep', regAuto:true, regMonth:nm, shakenEnd:se, eco:'std', jibaiM:25, jibaiAmt:0, recycle:12000, warranty:'3年または30,000km', repair:'なし', cost:{buy:0,aa:10000,move:0,fix:0}, hist:[], portalDone:{goo:'',cs:''}, changed:'' }, o); }
/* 担当の初めの値＝いま開いている人（名簿の書き方の空白の違いは見ない）。名簿にいなければ空（選んでもらう） */
function meStaff(list){ const me = window.QData ? String(QData.me().name||'') : '', k = x => String(x||'').replace(/[\s　]/g,''); return (list||[]).find(n=>k(n)===k(me)) || ''; }
function newCustObj(s, car, o){
  return Object.assign({ id:'u'+Date.now()+Math.floor(Math.random()*1000), name:'', tel:'', addr:'', made:TODAY, staff:meStaff(s.set.staff),
    baseSnap:JSON.parse(JSON.stringify(car.base)), items:stdItemsOf(s, car).map(x=>Object.assign({ n:x.n, a:x.a, in:{...x.in} }, x.laborL!=null ? { bodyA:x.bodyA, laborL:x.laborL, bn:x.bn } : {}, (x.extra || x.dup || (car.std.keep||[]).includes(x.key)) && !PLANS.some(p=>x.in[p]) ? { keep:1 } : {})),
    tiers:JSON.parse(JSON.stringify({...s.set.packs.tier, ...(car.std.tier||{})})),   /* カスタムの段（物）を写す＝プラン見積と別々に直せる */ showD:!!car.std.showD,
    disc:{A:0,B:0,C:0,D:0,...car.std.disc}, cond:{ wish:false, out:false, garage:false, deliver:false }, trade:0, tradeLoan:0,
    pay:'cash', down:0, rate:s.set.loan.rate, count:s.set.loan.count, rec:car.std.rec || s.set.packs.rec, note:'' }, o);
}

/* =====================================================================
   2. 保存（このブラウザに）
   ===================================================================== */
const LS = 'cf_quote_v4';   /* このブラウザに残す物＝画面の状態（ui）と作りかけ（pending）だけ。見積・設定は Firestore（quote-data.js） */
let S = (function(){
  let loc = null; try { loc = JSON.parse(localStorage.getItem(LS)); } catch(e) {}
  const B = window.QBOOT || {};
  const s = { v:40, set: B.set || defaultSettings(), cars: B.cars || [],
    ui: Object.assign({ view:'list', carId:null, step:'base', custId:null, plan:'B', filter:'all', q:'', sort:'fresh', doc:null, rtab:'soba' }, (loc && loc.ui) || {}),
    pending: (loc && loc.pending) || null };
  s.ui.app = ['cost','set','cgset','hist'].includes(B.app) ? B.app : 'quote';   /* hist＝カード詳細の［価格履歴］（v4.5.0・?car=車のID） */   /* set・cgset＝CarFlow の設定 ▸ 見積／原価 の中に開いた時（v4.4.0） */
  if (!B.set){ const co = window.QData ? QData.company() : {};   /* 見積の設定がまだ無い時＝会社の欄は CarFlow の会社情報から */
    if (co.name) s.set.company.name = co.name; if (co.address) s.set.company.addr = co.address; if (co.phone) s.set.company.tel = co.phone; }
  /* v4.5.20 🗣 2026-10-24「店舗情報の FAX 入らない、逆に LINE を入れたい」＝LINE（友だち追加の URL・帳票に QR）。最初は小林モータース【公式】@150irnnj */
  if (s.set.regCut == null) s.set.regCut = 23;   // v4.5.24 月の切り替え日（毎月◯日）
  if (s.set.company && s.set.company.line == null) s.set.company.line = 'https://line.me/R/ti/p/@150irnnj';
  if (window.QData) s.set.staff = QData.staff();   /* 担当＝CarFlow のメンバー画面で「セールス」にチェックの人（v4.5.18・設定からは外した） */
  ['feeV2','feeV3','regV2'].forEach(k=>{ if (!s.set[k]) s.set[k] = 1; });
  /* 🗣 2026-10-23 スマートカーディーラーからの移行：基本（L）を 納車整備 5.5万・保証 3年または30,000km に（前の設定の 納車前点検 1.5万 を1回だけ置き換え。読み込んだ直後の形なので、見ただけでは書かない） */
  /* 🗣 2026-10-23 ドラレコを社内料金表の工賃・StockFlow の本体に（品の id dr_tw73 は同じ＝車ごとの選びはそのまま） */
  if (s.set.packs && !s.set.packs.v10){ const d = (s.set.packs.items||[]).find(x=>x.id==='dr_tw73'); if (d) Object.assign(d, { n:'ドライブレコーダー', a:27000, sfCat:'ドライブレコーダー', bo:DR_BO(), vo:DR_VO(), voImp:DR_VO_IMP() }); s.set.packs.v10 = 1; }
  if (s.set.packs && !s.set.packs.v11){ const SFC0 = { ct_3m:{ v:'KeePer 3m Coating 基本料金' }, ct_1y:{ v:'KeePer 1y Coating（ガラス）' }, ct_gz:{ v:'国産 通常価格', imp:'輸入車 通常価格' } }; (s.set.packs.items||[]).forEach(x=>{ if (SFC0[x.id] && !x.sfCoat) x.sfCoat = SFC0[x.id]; }); s.set.packs.v11 = 1; }   // v4.5.8 コーティングは StockFlow から
  if (s.set.seibi && !s.set.seibi.v3){ const L = (s.set.seibi.tiers||[]).find(x=>x.k==='L'), N = SEIBI_TIERS()[0]; if (L && L.price===15000 && L.name==='納車前点検') Object.assign(L, { name:N.name, price:N.price, war:N.war, note:N.note }); s.set.seibi.v3 = 1; }
  if (s.pending && !s.cars.some(c=>c.id===s.pending.carId)) s.pending = null;
  /* 🗣 2026-10-23「サイドバーから見積もりをクリックしたときに一覧に戻るように」＝開いた時はいつも一覧から（前に開いていた車・原価管理の車は覚えない） */
  s.ui.view = 'list'; s.ui.carId = null; s.ui.cgCar = null; s.ui.cgView = null;
  return s;
})();
/* 前の希望ナンバーの種類（一般＝パックと同じ 10,000 を課税で1本）→ 代行＋ナンバー代に分けた種類へ */
function fixWish(c){ if (c) (c.custs||[]).forEach(u=>{ const d = u.cond && u.cond.d && u.cond.d.wish; if (!d) return; const NM = { '希望番号（一般）':'希望番号（ペイント）', '字光式':'希望番号（字光式）' }; if (!NM[d.ty] && !(d.ty==='図柄入り' && d.t==null)) return; if (NM[d.ty]) d.ty = NM[d.ty];
  const PL = S.set.plates, k = c.kei, T = { '希望番号（ペイント）':k?PL.kWishP:PL.wishP, '希望番号（字光式）':k?PL.kWishJ:PL.wishJ, '図柄入り':k?PL.kZug:PL.zug }; d.k = S.set.fees.wish; d.t = T[d.ty]; }); }
S.cars.forEach(fixWish);
S.cars.forEach(c=>(c.custs||[]).forEach(payFix));
/* 🗣 2026-10-19 車庫証明は裸に入れない → 条件を「お客様が取る（garageSelf）」から「当店で取る（garage）」に。前に作ったお客様は金額が変わらないように引き継ぐ */
function fixGarage(o){ if (!o || typeof o !== 'object') return; if (o.cond && typeof o.cond === 'object' && o.cond.garage === undefined && 'garageSelf' in o.cond){ o.cond.garage = !o.cond.garageSelf; delete o.cond.garageSelf; } Object.values(o).forEach(fixGarage); }
fixGarage(S.cars);
/* 保存：画面の状態と作りかけはこのブラウザ、見積と設定は少し待ってまとめて Firestore（QData.schedule＝変わった車だけ） */
function save(){ try { localStorage.setItem(LS, JSON.stringify({ ui:S.ui, pending:S.pending })); } catch(e) {} if (window.QData) QData.schedule(); }
function confirm2(m){ try { return window.confirm(m); } catch(e) { return true; } }

/* =====================================================================
   3. 計算
   ===================================================================== */
const yen = n => (Math.round(n)||0).toLocaleString('ja-JP');
const man = n => (Math.round(n/1000)/10).toFixed(1);
const mk = k => (k/10).toFixed(1);
const f100 = n => Math.floor(n/100)*100;
const ym = s => { const [y,m] = s.split('-').map(Number); return {y,m}; };
const fy = s => { const {y,m} = ym(s); return m>=4 ? y : y-1; };
const jd = s => s ? s.replace(/-/g,'/') : '—';
const addDays = (s,d) => { const t=new Date(s+'T00:00:00'); t.setDate(t.getDate()+d); return t.toISOString().slice(0,10); };
const daysBetween = (a,b) => Math.round((new Date(b)-new Date(a))/86400000);
/* 和暦（年月まで）：平成31年4月まで／令和元年5月から */
const ccU = c => +(c && c.cc) ? Number(c.cc).toLocaleString()+' cc' : '—';   /* 排気量（0＝まだ入れていない）。v4.0.0 */
const warekiYM = s => { if (!/^\d{4}-\d{2}/.test(s||'')) return '初度登録 —'; const {y, m} = ym(s); const r = (y>2019 || (y===2019 && m>=5)); return (r ? '令和'+(y===2019?'元':y-2018) : '平成'+(y-1988)) + '年' + m + '月'; };
const eraYear = y => y>2019 ? '令和'+(y-2018)+'年' : y===2019 ? '令和元年・平成31年' : '平成'+(y-1988)+'年';
/* 初度登録の入力：和暦を先にした年の選択＋月の選択（🗣 2026-10-01「和暦を優先で西暦をあと。いまだとすごい短いからもうちょい見やすく」） */
function frPick(car, chgCls, dis){
  const cur = car.firstReg ? ym(car.firstReg) : null, Y = +TODAY.slice(0,4);
  const ys = []; for (let y = Y; y >= 1995; y--) ys.push(`<option value="${y}" ${cur&&cur.y===y?'selected':''}>${eraYear(y)}（${y}）</option>`);
  const ms = []; for (let m = 1; m <= 12; m++) ms.push(`<option value="${m}" ${cur&&cur.m===m?'selected':''}>${m}月</option>`);
  const on = `const y=$('v-fr-y').value,m=$('v-fr-m').value;if(y&&m)setCar('firstReg',y+'-'+String(m).padStart(2,'0'))`;
  return `<div class="fr-pick"><select id="v-fr-y" class="q-in ${chgCls}" onchange="${on}" ${dis?'disabled':''}>${cur?'':'<option value="">年を選ぶ</option>'}${ys.join('')}</select><select id="v-fr-m" class="q-in ${chgCls}" onchange="${on}" ${dis?'disabled':''}>${cur?'':'<option value="">月</option>'}${ms.join('')}</select></div>`;
}
const wareki = s => { const {y} = ym(s); return y>=2019 ? '令和'+(y===2019?'元':y-2018)+'年' : '平成'+(y-1988)+'年'; };
let _asOf = null;   // 履歴用：この日の時点で計算する（ふだんは null＝TODAY）
/* v4.5.24 🗣 2026-10-24「月跨ぎの見積の一斉変更の日付を設定画面に。月の切り替え日は今月と来月、これを任意の日に。今だと23日」
   ＝登録予定月が「自動」の車は、毎月の切り替え日（S.set.regCut・1〜28日・最初は23日）の前日までは今月登録、切り替え日からは来月登録で計算する。
   登録日は 15日（今月登録で今日が16日以降なら今日）。継続移転・移転継続の自賠責は今まで通り決めた月数（25か月）で固定 */
const regCut = () => Math.min(28, Math.max(1, Math.round(+((S.set && S.set.regCut) || 23)) || 23));
function autoRegDate(){ const t = String(_asOf || TODAY); let y = +t.slice(0,4), m = +t.slice(5,7); const d = +t.slice(8,10) || 1;
  if (d >= regCut()){ m++; if (m > 12){ m = 1; y++; } return `${y}-${String(m).padStart(2,'0')}-15`; }
  return `${y}-${String(m).padStart(2,'0')}-${String(Math.max(15, d)).padStart(2,'0')}`; }
const autoRegMonth = () => autoRegDate().slice(0,7);
function regDateOf(b){ return b.regAuto ? autoRegDate() : b.regMonth + '-15'; }
function monthsToMarch(s){ const {m} = ym(s); return m>=4 ? (12-m)+3 : 3-m; }
function jibaiTable(d){ return [...JIBAI].reverse().find(t=>d>=t.from); }
const carOf = id => S.cars.find(c=>c.id===id);
const custOf = (car,id) => car.custs.find(u=>u.id===id);
const planName = p => p==='D' ? '業販（現状渡し）' : p==='base' ? '基本見積' : S.set.packs.names[p];
const ALL_P = ['base','A','B','C','D'];   // 並びの順（基本・A・B・C・業販）
const plab = p => p==='base' ? '基本' : p==='D' ? '業販' : p;

/* 🗣 2026-10-19「基本は OK。でも走行 3千キロとか、新車保証が残ってるとか、どうしてもはまらない場合がある。フルでカスタムできる作りを。ただし通常は畳んでおく。保証の表示とも絡む」
   ＝プランごとの段（tiers[p]）に、決まった段の記号（L・M・H）の代わりに物 { k:'X', name, add, war, note } を置ける。war は見積書などの保証に出る（空＝基本価格の保証のまま） */
const tierOf = k => (k && typeof k === 'object') ? Object.assign({ k:'X', name:'カスタム', add:0, war:'', note:'', tbd:false }, k) : (S.set.seibi.tiers.find(x=>x.k===k) || S.set.seibi.tiers[0]);
const lightPrice = () => S.set.seibi.tiers[0].price;
/* 車両原価＝仕入価格＋AA 手数料・落札料＋陸送。🗣 2026-10-01「加修は抜いていい。ここは別途、詳細な修理などの原価ページを用意する」 */
const costOf = b => { const c = (b && b.cost) || {}; return (c.buy||0)+(c.aa||0)+(c.move||0)+(c.tax||0); };
/* 自動車税の月割：計算しない。ある時は AA から請求された金額をそのまま入れる（🗣 2026-10-02「自税はそんな難しくない。単純にある場合は AA に請求される」） */
/* 🗣 2026-10-01「納車整備は固定ではなくて手打ち可能＋テンプレ3種から選べるように。デフォルトは1.5万」
   b.seibi＝この車の納車整備（車両価格に含む・税抜）。未設定（null）は設定のいちばん下の段（ライト 1.5万）＝既定
   🗣 2026-10-16「裸の見積もりの最低限の納車整備は1.5万円。ただし状況によっては動かすので、ここはデフォ値として」＝既定は設定から・車ごとに変えられる・「既定に戻す」で null に */
const seibiOf = b => (b && b.seibi != null) ? +b.seibi : lightPrice();
const packAdd = k => !PACK_HOLD && k && k!=='L' ? (+tierOf(k).add||0) : 0;   // メンテナンスパックの金額（車の納車前点検の金額に関係なく固定）
const planWar = k => !PACK_HOLD && k && k!=='L' && tierOf(k).war ? tierOf(k).war : null;   // そのプランの保証（パックの保証）
const withWar = (b, k) => { const w = planWar(k); return w && b ? Object.assign({}, b, { warranty:w }) : b; };
function seibiInfo(b){ const v = seibiOf(b), t = S.set.seibi.tiers[0]; return v===t.price ? { name:t.name, price:v, note:t.note, k:t.k } : { name:t.name, price:v, note:t.note+'（この車の状態に合わせた金額）', k:null, own:1 }; }
/* 自賠責：表にある月数（12・13・24・25・36・37）は表から。ほかの月数（例 3か月）は手で入れた額、無ければ表から近似した目安 */
function jibaiOf(b, jt){
  const m = Math.max(1, Math.min(37, parseInt(b.jibaiM)||0));
  if (jt[m]) return { amt:jt[m], src:'table', m };
  if (b.jibaiAmt > 0) return { amt:b.jibaiAmt, src:'manual', m };
  const per = (jt[24]-jt[12])/12, est = m<12 ? jt[12]-(12-m)*per : m<24 ? jt[12]+(m-12)*per : m<36 ? jt[24]+(m-24)*(jt[36]-jt[24])/12 : jt[36];
  return { amt:Math.max(0, Math.round(est/10)*10), src:'est', m };
}
/* 輸入車＝メーカー名で見分ける（コーティングの輸入車の料金・検査登録手続代行費用・新規車両登録のボディサイズで使う） */
/* 4.74.0 メーカー表（本物の CarFlow の car-class.js）で見分ける。全角の ＢＭＷ・ＭＩＮＩ、ベンツ／メルセデスなどの書き方違いも同じ。表に無いメーカーは国産の既定（代行費用は選び直せる） */
/* 🔴 function で置く（const だと、最初に開いた時の見本づくり defaultState → stdItemsOf がこの行より前に呼んで止まっていた＝4.72.0 から） */
function isImport(car){ return CFMaker.isImport(car && car.maker, car && car.model); }
function baseCalc(car, b){
  const rd = regDateOf(b), kei = car.kei, F = S.set.fees, R = regOf(b.regType);
  let annual = 0, heavy = false, months = 0, carTaxFull = 0;
  if (!kei){
    const row = TAX_CAR.find(r=>car.cc<=r[0]);
    annual = car.firstReg>='2019-10' ? row[1] : row[2];
    if (!car.hybrid && fy(rd) >= fy(car.firstReg+'-01') + (car.fuel==='diesel'?12:14)) { annual = f100(annual*1.15); heavy = true; }
    months = monthsToMarch(rd); carTaxFull = f100(annual*months/12);
  }
  const {y,m} = ym(car.firstReg);
  const d13 = (m===1)?(y+12)+'-12':(y+13)+'-'+String(m-1).padStart(2,'0'), d18 = (m===1)?(y+17)+'-12':(y+18)+'-'+String(m-1).padStart(2,'0');
  let key = b.eco; if (key==='std'){ if (rd.slice(0,7)>=d18) key='y18'; else if (rd.slice(0,7)>=d13) key='y13'; }
  const units = Math.ceil((+car.weight||0)/500);
  /* 🗣 2026-10-23 重量税は国交省の「次回自動車重量税額照会」で出た額を入れる（減税・13年・18年・その年の税制が全部入った額）。
     登録車は照会した額（b.wtQ＝{amt, at}）だけ＝重さからは計算しない（AA の車は重さが分からない・減税の対象が毎年変わる）。
     軽は重さに関係なく決まった額＝区分（b.eco）から。照会した額を入れたらそちら */
  const wtNeed = R.insp && !R.buyerReg, wq = b.wtQ && b.wtQ.amt != null && b.wtQ.amt !== '' ? +b.wtQ.amt : null;
  const weight = !wtNeed ? 0 : wq != null ? wq : kei ? WEIGHT_KEI_2Y[key] : 0;
  const wtMiss = wtNeed && !kei && wq == null;
  /* 照会し直し：照会した日と登録の予定日が、重量税の税制の年度（5/1 から）をまたぐ時 */
  const tyOf = d => { const y = +String(d).slice(0,4), md = String(d).slice(5,10); return md >= '05-01' ? y : y-1; };
  const wtStale = wtNeed && wq != null && !!b.wtQ.at && tyOf(b.wtQ.at) !== tyOf(rd);
  const tb = jibaiTable(rd), jt = kei ? tb.kei : tb.car;
  const jb = R.insp ? jibaiOf(b, jt) : { amt:0, src:'none', m:0 };
  const seibiIn = seibiOf(b), seibiI = seibiInfo(b);
  const body = b.price + seibiIn;
  const carTax = R.xfer || R.buyerReg ? 0 : carTaxFull;
  const unexpTax = R.xfer && !kei ? carTaxFull : 0;
  const a = ym(rd), e = ym(b.shakenEnd), remM = Math.max(0,(e.y-a.y)*12+(e.m-a.m));
  const unexpJb = !R.insp ? f100((jt[24]||0)*remM/24) : 0;
  const daikoG = kei ? F.daikoGarageKei : F.daikoGarage;
  const plateFee = R.buyerReg ? 0 : (R.k==='shinki' || b.plate==='change') ? (kei ? (F.plateKei||F.plate) : F.plate) : 0;
  return { R, rd, kei, annual, heavy, months, carTax, unexpTax, weight, weightKey:key, units, d13, wtNeed, wtQ:wq, wtAt: wq != null ? (b.wtQ.at||'') : '', wtMiss, wtStale, jibai:jb.amt, jibaiSrc:jb.src, jibaiM:jb.m, tbFrom:tb.from, unexpJb, remM,
    body, bodyIn:Math.floor(body*1.1), seibiIn, seibiInfo:seibiI, daikoG, plateFee, regFee:S.set.reg[kei?'kei':plateClsOf(car,b)==='5'?'sm':'car'][R.k]||0, garageFee: (kei||R.buyerReg)?0:F.garage, imp: isImport(car) };
}
/* 販売諸費用（課税）の行。🗣 2026-10-04「色々なパターンがあるから、基本価格にその販売諸費用欄の内容と金額を出して、手打ちでも変更できるし、内容を足せるように」
   決まった2行（検査登録・車庫証明）は設定の金額が元。b.feeAmt＝この車だけの金額／b.feeHide＝外した行／b.feeAdd＝足した行 [{n,a}]
   g＝車庫証明を当店で取るか（個別見積の「当店で取る」の時だけ 1。裸・予備検は 0） */
function feeRows(bc, b, g){ const F = S.set.fees, ov = b.feeAmt || {}, hid = b.feeHide || {};
  const auto = [{ id:'reg', n: bc.R.buyerReg?'予備検査代行費用':'検査登録手続代行費用', def:(bc.imp ? F.daikoRegImp : F.daikoReg), mul:1 },
                { id:'garage', n: bc.kei?'保管場所届出代行費用':'車庫証明手続代行費用', def:bc.daikoG, mul:g }];
  const own = r => r.id !== 'garage';   // 車庫証明は個別見積の条件だけで決まる＝前の手入力・外した印は効かせない
  return auto.map(r=>Object.assign(r, { auto:1, manual: own(r) && ov[r.id]!=null, a: (own(r) && ov[r.id]!=null ? ov[r.id] : r.def) * r.mul, hide: own(r) && !!hid[r.id] }))
    .concat((b.feeAdd||[]).map((x,i)=>({ id:'add'+i, i, n:x.n, a:+x.a||0, add:1, t:x.t==='t'?'t':'k' }))); }
/* 🗣 2026-10-04「ロックはいらない。法令順守をしないつもりではない。リアルに行政書士に頼むケースもあるから、いろいろ入れられないと困る」→ 名前の止めは無し。足した行は 課税／立替（t） */
const REG_FEE_OPT = (def, imp) => [25000,35000].concat([25000,35000].includes(def) ? [] : [def]).sort((a,b)=>a-b).map(v=>[v, yen(v)+(v===def?(imp?'（輸入車の既定）':'（国産車の既定）'):'')]);
const feeTaxOf = n => /行政書士/.test(n) ? 't' : 'k';
/* 足す時の候補（調査 11＝他店の見積でよく出る名前）。お客様ごとに要る物（希望ナンバー・管轄外・納車）は個別見積の「この方の条件」でも足せる */
const FEE_SUG = ['行政書士報酬','管轄外登録費用','県外登録費用','希望ナンバー代行費用','納車費用','下取車諸手続代行費用','所有権解除手続代行費用','予備検査代行費用'];
/* 価格履歴に残す（🗣 2026-10-04「残すように」）。b.feeLog＝[{date, prev, next, detail}]。同じ日の直しは1行にまとめ、元に戻したら消す。
   基本価格を作った日のうちは「初回の値付け」の一部なので残さない */
function feeCfg(b){ return JSON.parse(JSON.stringify({ feeAmt:b.feeAmt||{}, feeHide:b.feeHide||{}, feeAdd:b.feeAdd||[] })); }
function feeCfgAt(b, d){ const L = (b.feeLog||[]).slice().sort((x,y)=>x.date<y.date?-1:1); if (!L.length) return {};
  let c = L[0].prev; L.forEach(x=>{ if (x.date<=d) c = x.next; }); return c; }
function feeDiff(car, a, c){ const b0 = car.base, bc = baseCalc(car, b0), g = 0;
  const rs = cfg => feeRows(bc, Object.assign({}, b0, cfg), g).filter(r=>!r.hide && r.id!=='garage'), A = rs(a), C = rs(c), out = [];
  C.forEach(r=>{ const o = A.find(x=>x.n===r.n); if (!o) out.push(`${r.n} 追加 ${yen(r.a)}${r.t==='t'?'（立替）':''}`); else if (o.a!==r.a) out.push(`${r.n} ${yen(o.a)}→${yen(r.a)}`); else if ((o.t||'k')!==(r.t||'k')) out.push(`${r.n} ${r.t==='t'?'立替':'課税'}に`); });
  A.forEach(r=>{ if (!C.some(x=>x.n===r.n)) out.push(`${r.n} 外す`); });
  return out.join('・'); }
function feeLogTouch(car, before){ const b = car.base; if (!b.hist.length || b.hist[0].date===TODAY) return;
  b.feeLog = b.feeLog || []; let L = b.feeLog.find(x=>x.date===TODAY);
  if (!L){ L = { date:TODAY, prev:before }; b.feeLog.push(L); }
  L.next = feeCfg(b); L.detail = feeDiff(car, L.prev, L.next);
  if (!L.detail) b.feeLog = b.feeLog.filter(x=>x!==L); }
function feeEdit(fn, hard){ const car = curCar(), b = car.base, before = feeCfg(b); if (hard) snap(); fn(b); b.changed = TODAY; feeLogTouch(car, before); if (hard){ save(); render(); } else renderKeep(); }
function feeAmt(id, v){ feeEdit(b=>{ b.feeAmt = Object.assign({}, b.feeAmt, {[id]:v}); }); }
function feeAmtReset(id){ feeEdit(b=>{ b.feeAmt = Object.assign({}, b.feeAmt); delete b.feeAmt[id]; }, 1); }
function feeHide(id, on){ feeEdit(b=>{ b.feeHide = Object.assign({}, b.feeHide); if (on) b.feeHide[id] = true; else delete b.feeHide[id]; }, 1); if (on) toast('この車の見積から外しました', true); }
function feeAdd(){ const n = ($('b-fnew-n').value||'').trim(), a = parseYen($('b-fnew-a').value);
  if (!n){ toast('項目名を入れてください'); $('b-fnew-n').focus(); return; }
  feeEdit(b=>{ b.feeAdd = (b.feeAdd||[]).concat([{ n, a, t:feeTaxOf(n) }]); }, 1); }
function feeName(i, v){ feeEdit(b=>{ b.feeAdd = b.feeAdd.map((x,j)=>j===i?Object.assign({}, x, { n: v.trim() || '（項目名なし）' }):x); }, 1); }
function feeAddAmt(i, v){ feeEdit(b=>{ b.feeAdd = b.feeAdd.map((x,j)=>j===i?Object.assign({}, x, { a:v }):x); }); }
function feeAddTax(i, tx){ feeEdit(b=>{ b.feeAdd = b.feeAdd.map((x,j)=>j===i?Object.assign({}, x, { t:tx }):x); }, 1); }
function feeDel(i){ feeEdit(b=>{ b.feeAdd = b.feeAdd.filter((x,j)=>j!==i); }, 1); toast('項目を消しました', true); }
/* ctx：{ car, b(基本価格), items[], plan, tiers{A..}, disc, cond, trade, tradeLoan, pay, down, rate, count }
   plan＝D（業販）は現状渡し：車両本体（業販価格）＋リサイクルだけ。納車整備・オプション・登録の費用・税保険は入らない */
function calc(ctx){
  const { car, b } = ctx, F = S.set.fees, bc = baseCalc(car, b), cond = ctx.cond || {};
  const plan = ctx.plan, ws = plan==='D';
  const trade = +ctx.trade||0, tradeLoan = +ctx.tradeLoan||0, disc = +(ctx.disc||0);
  if (ws){
    const body = b.wsPrice || b.price, vehicle = body - disc, taxable = vehicle, ctax = Math.floor(taxable*0.10), nonTax = b.recycle, cash = taxable + ctax + nonTax, net = cash - trade + tradeLoan;
    const loan = ctx.pay==='loan' ? loanCalc(net, +ctx.down||0, (ctx.rate!=null && ctx.rate!=='' ? +ctx.rate : S.set.loan.rate), +ctx.count||S.set.loan.count) : null;
    return { ws:true, bc:{...bc, seibiIn:0, carTax:0, weight:0, jibai:0, unexpTax:0, unexpJb:0, months:0}, body, bodyIn:Math.floor(body*1.1), optSum:0, inPlan:[], disc, vehicle, feeK:[], feeKSum:0, legal:[], legalSum:0, taxIns:0, condRows:[], condK:0, condT:0,
      taxable, ctax, nonTax, tate:0, cash, net, loan, trade, tradeLoan, seibi:false, tier:null };
  }
  const tier = plan && !PACK_HOLD ? ((ctx.tiers && ctx.tiers[plan]) || 'L') : 'L';   // PACK_HOLD＝暫定でパックを使わない（どのプランも基本の納車整備）
  const upA = packAdd(tier);   // メンテナンスパック（固定の金額）
  const up = tier!=='L' && upA ? [{ n:tierOf(tier).name, a:upA, up:tier }] : [];
  const items = ctx.items || [];
  /* 🗣 2026-10-19「希望ナンバーをこの人の条件でチェックした場合は、希望ナンバー OP は『詳細にて』の文言にして、ちゃんとした金額に切り替わるように」
     ＝個別見積で ✓ の時は、A/B/C の希望ナンバーパックの行を外し、条件の詳細（種類・課税・立替）の金額を諸費用に入れる。プラン見積（条件なし）は今まで通りパック */
  const isWishPk = x => /希望ナンバー/.test(x.n||'');
  const inPlan = up.concat(items.filter(x=>plan && x.in[plan] && !(cond.wish && isWishPk(x))));
  const optSum = inPlan.reduce((s,x)=>s+(+x.a||0),0);
  const vehicle = bc.body - disc + optSum;
  /* 🗣 2026-10-19「車庫証明は裸で要らない。今は車庫はやってもらう前提で裸見積もりを出しているみたい」＝裸（基本価格・プラン見積）は入れない。個別見積の「当店で取る」の時だけ代行費用と手数料が入る */
  /* 🗣 2026-10-19「保管場所届出は行ごと抜いちゃって」＝軽は保管場所届出の行（代行・手数料・条件）を出さない */
  const g = (cond.garage && !bc.R.buyerReg && !bc.kei) ? 1 : 0, gD = g ? condD(cond, 'garage') : null, wD = cond.wish ? condD(cond, 'wish', bc.kei) : null;
  const fRows = feeRows(bc, b, g).filter(r=>!r.hide && !(r.id==='garage' && !g)).map(r=> r.id==='garage' && gD ? Object.assign({}, r, { a: +gD.k||0, n: r.n + (gD.ty && gD.ty!==CONDP().garage.ty[0][0] ? '（'+gD.ty+'）' : '') }) : r), feeK = fRows.filter(r=>r.t!=='t').map(r=>[r.n, r.a]), feeT = fRows.filter(r=>r.t==='t').map(r=>[r.n, r.a]);
  const feeKSum = feeK.reduce((s,f)=>s+f[1],0);
  const legal = [[bc.R.buyerReg?'予備検査手数料':bc.kei?'検査手数料（軽）':'検査・登録手数料', bc.regFee], ...(bc.kei || !g ? [] : [['車庫証明手数料', gD ? (+gD.t||0) : bc.garageFee*g]]), wD ? ['ナンバープレート代（'+(wD.ty||'希望番号').replace(/^希望番号（(.+)）$/, '希望・$1')+'）', +wD.t||0] : ['ナンバープレート代', bc.plateFee]].concat(feeT);
  const legalSum = legal.reduce((s,f)=>s+f[1],0);
  const taxIns = bc.carTax + bc.weight + bc.jibai;
  const condRows = [];
  const cdm = (d) => d.memo ? '（'+d.memo+'）' : '';
  if (wD && +wD.k) condRows.push(['希望ナンバー申込代行費用'+cdm(wD), +wD.k, 'k']);
  if (cond.out){ const d = condD(cond,'out'); if (+d.k) condRows.push(['管轄外登録費用'+cdm(d), +d.k, 'k']); if (+d.t) condRows.push(['管轄外登録（立替）'+cdm(d), +d.t, 't']); }
  /* 🗣 2026-10-19「この方の条件にカスタム自由行を入れられるように」＝u.cond.free＝[{ n, k（課税）, t（立替）, memo, on }]。✓の物だけ A/B/C（と基本）に入る */
  (cond.free||[]).filter(f=>f.on).forEach(f=>{ const nm = (f.n||'（名前なし）')+(f.memo?'（'+f.memo+'）':''); if (+f.k) condRows.push([nm, +f.k, 'k']); if (+f.t) condRows.push([nm+'（立替）', +f.t, 't']); });
  if (cond.deliver){ const d = condD(cond,'deliver'); if (+d.k) condRows.push(['ご指定場所への納車費用'+cdm(d), +d.k, 'k']); if (+d.t) condRows.push(['納車（立替）'+cdm(d), +d.t, 't']); }
  const condK = condRows.filter(r=>r[2]==='k').reduce((s,r)=>s+r[1],0), condT = condRows.filter(r=>r[2]==='t').reduce((s,r)=>s+r[1],0);
  const taxable = vehicle + feeKSum + bc.unexpTax + bc.unexpJb + condK;
  const ctax = Math.floor(taxable*0.10);
  const nonTax = b.recycle, tate = legalSum + taxIns + condT;
  const cash = taxable + ctax + nonTax + tate;
  const net = cash - trade + tradeLoan;
  const loan = ctx.pay==='loan' ? loanCalc(net, +ctx.down||0, (ctx.rate!=null && ctx.rate!=='' ? +ctx.rate : S.set.loan.rate), +ctx.count||S.set.loan.count) : null;
  return { ws:false, bc, body:bc.body, bodyIn:bc.bodyIn, optSum, inPlan, disc, vehicle, feeK, feeKSum, legal, legalSum, taxIns, condRows, condK, condT,
    taxable, ctax, nonTax, tate, cash, net, loan, trade, tradeLoan, seibi:true, tier };
}
function loanCalc(net, down, rate, n){
  const P = Math.max(0, net-down), r = rate/100/12, pm = r ? P*r/(1-Math.pow(1+r,-n)) : P/n;
  const total = Math.round(pm*n), later = f100(pm), first = total - later*(n-1);
  return { P, n, first, later, fee: total-P, total, hanbai: down+total, rate, down };
}
/* 本体の機種を StockFlow の料金表から（p.sfCat＝分類）。値段＝店頭（入っていれば）か定価・税抜。並びは控え（p.bo）の順を先に＝車ごとに選んだ番号がずれない */
function sfBo(p){ if (!p.sfCat || !window.QData || !QData.sf) return null; const L = QData.sf().filter(x=>x.cat===p.sfCat && (x.shop || x.list)); if (!L.length) return null;
  const nm = x => [x.maker && !String(x.name||'').includes(x.maker) ? x.maker : '', x.name, x.code].filter(Boolean).join(' '), at = x => { const i = (p.bo||[]).findIndex(o=>sfN(o[0]).endsWith(sfN(x.code||x.name))); return i < 0 ? 99 : i; };
  return L.slice().sort((a,b)=>at(a)-at(b) || String(a.no).localeCompare(String(b.no))).map(x=>[nm(x), x.shop || x.list]); }
/* コーティングの段ごとの値段を StockFlow の料金表から（p.sfCoat）。[[S,値],[SM,値]…]。料金表に無い段・「〜」の値段は null（＝料金表になし）。読めない時は null */
/* 🗣 2026-10-24「設定は丸ごと打てないようにして、タイトルだけで『StockFlow連動』とかってテキストだけに。ドラレコも同様に」＝設定 ▸ 見積で名前と「StockFlow連動」だけ見せる品
   （コーティング＝sfCoat・ドラレコ＝sfCat の本体＋取付工賃。工賃は StockFlow に品が無いので、ドラレコ取付工賃の表（2023-03-23）の値で固定＝DR_VO） */
const sfLinked = x => !!(x && (x.sfCoat || (x.labor && x.sfCat)));
function sfSize(p, imp){ if (!p.sfCoat || !window.QData || !QData.sfCoat) return null; const cat = imp && p.sfCoat.imp ? p.sfCoat.imp : p.sfCoat.v, L = QData.sfCoat().filter(x=>x.cat===cat); if (!L.length) return null;
  return SIZE_CLS.map(z=>{ const h = L.find(x=>String(x.name||'').endsWith('・'+z+'サイズ')); return [z, h && h.list!=null ? h.list : null]; }); }
function stdItemsOf(s, car){
  /* 🗣 2026-10-03「ドラレコはプランによって変える可能性があるから何回も入れられるように」→ 同じテンプレの品を car.std.dups[品] に足した分だけ並べる（キーは 品~番号） */
  const set = s.set, st = car.std, ov = st.ov || {}, amt = st.amt || {}, vs = st.vsel || {}, dups = st.dups || {};
  const imp = isImport(car);
  const tpl = set.packs.items.flatMap(p0=>{ const sv = sfSize(p0, imp), p = sv ? Object.assign({}, p0, { vo:sv }) : p0.voImp && imp ? Object.assign({}, p0, { vo:p0.voImp }) : p0, pkey = p.id || p.n;
    return [pkey].concat((dups[pkey]||[]).map(d=>pkey+'~'+d)).map((key, n)=>{ const dup = n > 0;
      let vi = null, vlab = '', noSize = false;
      let ask = false;
      if (p.vt==='size' && p.vo && p.vo.length){ const ci = st.csize ? p.vo.findIndex(o=>o[0]===st.csize) : -1; if (ci>=0 && p.vo[ci][1]!=null){ vi = ci; vlab = p.vo[vi][0]; } else if (ci>=0){ noSize = true; ask = true; } else noSize = true; }
      else if (p.vt && p.vo && p.vo.length){ vi = Math.min(vs[key] != null ? vs[key] : 0, p.vo.length-1); vlab = p.vo[vi][0]; }
      const nobody = !!(p.labor && vi!=null && p.vo[vi][2]), bo = p.labor ? (sfBo(p) || (p.bo && p.bo.length ? p.bo : null)) : null, bi = bo ? Math.min((st.bsel && st.bsel[key]) || 0, bo.length-1) : null;
      const bodyA = p.labor ? (nobody ? 0 : (st.amtB && st.amtB[key] != null ? st.amtB[key] : (bo ? bo[bi][1] : (p.a||0)))) : null;
      const laborA = p.labor ? (st.amtL && st.amtL[key] != null ? st.amtL[key] : p.vo[vi][1]) : null;
      const calcA = p.labor ? bodyA + laborA : (p.a||0) + (vi!=null ? p.vo[vi][1] : 0);
      const bname = p.labor && bo && !nobody ? bo[bi][0] : '';
      return { key, pkey, dup, n: p.n + (bname ? '・'+bname : '') + (vlab ? `（${vlab}${p.vt==='size'?'サイズ':''}）` : ask ? `（${st.csize}${imp&&p0.voImp?'・輸入車':''}サイズ・料金表になし）` : noSize ? '（サイズ未選択）' : ''), base:p.n,
        a: !p.labor && amt[key] != null ? amt[key] : calcA, calcA, manual: !p.labor && amt[key] != null,
        in: ov[key] || (dup ? {A:0,B:0,C:0} : (ov[p.n] || {...p.in})), vt:p.vt, vo:p.vo, vl:p.vl, vi, noSize,
        labor: !!p.labor, bodyA, laborA, laborL: p.labor ? p.vo[vi][0] : null, bn: p.labor && !nobody ? (bo ? bo[bi][0] : (p.bn || p.n)) : null, nobody, bo, bi,
        bMan: !!(st.amtB && st.amtB[key] != null), lMan: !!(st.amtL && st.amtL[key] != null) }; }); });
  const ext = (st.extra||[]).map(x=>{ const key = 'x:'+(x.fid||x.n); return { ...x, key, base:x.n, a: amt[key] != null ? amt[key] : x.a, calcA:x.a, in:{...x.in} }; });   // fid＝自由行（品名が空でも1行ずつ見分ける）
  const hide = st.hide || [], all = tpl.filter(x=>!hide.includes(x.key)).concat(ext), ord = st.order || [];   // 🗣「✕で消せる。この車にだけ適用、下の選ぶに戻るイメージ」
  return all.slice().sort((a,b)=>{ const ia = ord.indexOf(a.key), ib = ord.indexOf(b.key); return (ia<0?999+all.indexOf(a):ia) - (ib<0?999+all.indexOf(b):ib); });
}
const stdItems = car => stdItemsOf(S, car);
const stdTiers = car => ({...S.set.packs.tier, ...(car.std.tier||{})});
const baseCtx = car => ({ car, b:car.base });
const stdCtx = (car,p) => ({ car, b:withWar(car.base, stdTiers(car)[p]), items:stdItems(car), tiers:stdTiers(car), plan:p, disc:0 });   // 保証はプランのパックの保証   // 🗣 2026-10-02「業販の上の値引きは全部なしでOK」＝プラン見積は値引きなし（値引きは個別見積で）
/* 下取・お支払い（🗣 2026-10-04「個別見積に下取りと支払いの部分、3.5 モックの中身くらい入れないとだめだよね」）
   元＝モック_v3.5_納車まわり の「💴 支払い」。なし／ありは null＝まだ選んでいない（v3.5 と同じく選び忘れを拾う）
   pay＝計算用（'loan'＝オートローンだけ割賦の計算をする。銀行ローンはお客様の銀行から一括で入る＝店から見ると振込と同じ） */
function PAY0(){ return { downOn:null, downMethod:'', downDate:'', tradeIn:null, tradeModel:'', tradeClass:'', tradeProc:'', tradeOwn:null, tradeMove:'', tradeDest:'', tradeDestOther:'',
  restMethod:'', restWhen:'', restDate:'', ownership:false, underage:false }; }   // 関数にしておく＝読み込み時の見本作り（defaultState）から呼べる
const TRADE_DESTS = ['廃車','AA','買取業者','店頭販売','その他','未定'];
const restLb = u => u.restMethod==='オートローン' ? '実行予定日' : u.restMethod==='銀行ローン' ? '振込予定日' : '受領予定日';
function payFix(u){ if (u.restMethod!==undefined) return;
  Object.assign(u, PAY0());
  if (u.pay==='loan'){ u.restMethod = 'オートローン'; u.restWhen = 'date'; u.downOn = (u.down||0) > 0; }
  if (u.trade){ u.tradeIn = true; const m = /下取あり（(.+?)）/.exec(u.note||''); if (m) u.tradeModel = m[1]; } }
function payMiss(u0, p){ payFix(u0); const m = [], ps = p ? [p] : custPlans(u0), anyT = ps.some(x=>ppOf(u0,x).tradeIn), u = Object.assign({}, u0, p ? ppOf(u0, p) : {});
  ps.forEach(x=>{ const q = ppOf(u0, x), t = ps.length>1 ? (x==='base'?'基本':x)+'の' : '';
    if (q.downOn==null) m.push(t+'頭金'); if (q.downOn && !q.down) m.push(t+'頭金の金額');
    if (q.tradeIn==null) m.push(t+'下取り'); if (!q.restMethod) m.push(t+'残金の支払方法'); });
  if (ps.some(x=>ppOf(u0,x).downOn) && !u0.downMethod) m.push('頭金の支払方法');
  if (anyT){ u.trade = u0.trade; if (!String(u.tradeModel||'').trim()) m.push('下取りの車種'); if (!u.trade) m.push('下取車価格'); if (!u.tradeClass) m.push('下取りの区分'); if (!u.tradeProc) m.push('下取りの手続き');
    if (u.tradeOwn==null) m.push('下取りの所有権解除'); if (!u.tradeMove) m.push('下取りの引っ越し'); if (!u.tradeDest) m.push('下取りの行先'); }
  return m; }
function payCard(car, u, dis){ payFix(u);   // u.minor は見積番号のマイナー（別物）。未成年は underage
  const C = car.id, U = u.id, NS = v => (v==null || v==='') ? '<span class="q-pill warn">未選択</span>' : '';
  const yn = (k, cur) => seg(cur==null?'':cur?'y':'n', [['n','なし'],['y','あり']], `custPay('${C}','${U}','${k}','$v'==='y')`, dis) + NS(cur);
  const sg = (k, opts) => seg(u[k]||'', opts.map(o=>Array.isArray(o)?o:[o,o]), `custPay('${C}','${U}','${k}','$v')`, dis) + NS(u[k]);
  const row = (l, inner) => `<div class="q-pr"><label>${l}</label><div>${inner}</div></div>`;
  const ps = custPlans(u), pp = ps.includes(S.ui.plan) ? S.ui.plan : (ps.includes(u.rec) ? u.rec : ps[0]), k = calc(custCtx(car, u, pp));
  const down = u.downOn ? (u.down||0) : 0, rest = k.net - down;
  return `<div class="q-card"><h3>下取・お支払い <span class="r">金額はすべて税込・${esc(p_lab(pp))}で計算</span></h3><div class="bd">
    ${row('頭金', yn('downOn', u.downOn) + (u.downOn ? `<div class="km-in">${money('u-down', u.down, `custSet('${C}','${U}','down',parseYen(this.value))`, dis)}</div>` : ''))}
    ${u.downOn ? row('', sg('downMethod', ['現金','振込']) + `<span class="q-why" style="display:inline;margin:0 4px 0 10px">受領日</span><input type="date" class="q-in" style="width:150px" value="${esc(u.downDate)}" onchange="custSet('${C}','${U}','downDate',this.value,1)" ${dis?'disabled':''}>`) : ''}
    ${row('下取り', yn('tradeIn', u.tradeIn))}
    ${u.tradeIn ? `<div class="q-psub">
      ${row('車種', `<input id="u-tmodel" class="q-in" placeholder="例：H22 フィット" value="${esc(u.tradeModel)}" onchange="custSet('${C}','${U}','tradeModel',this.value,1)" ${dis?'disabled':''}>${NS(String(u.tradeModel||'').trim())}`)}
      ${row('下取車価格', `<div class="km-in">${money('u-trade', u.trade, `custSet('${C}','${U}','trade',parseYen(this.value))`, dis)}</div><span class="q-why" style="display:inline">支払総額から引く</span>${u.trade?'':NS('')}`)}
      ${row('残債', `<div class="km-in">${money('u-tl', u.tradeLoan, `custSet('${C}','${U}','tradeLoan',parseYen(this.value))`, dis)}</div><span class="q-why" style="display:inline">ローンが残っている時・支払総額に足す</span>`)}
      ${row('区分', sg('tradeClass', [['普通車','普通車'],['軽自動車','軽'],['貨物','貨物']]))}
      ${row('手続き', sg('tradeProc', [['抹消登録','抹消'],['移転抹消登録','移転抹消'],['移転','移転']]))}
      ${row('所有権解除', yn('tradeOwn', u.tradeOwn))}
      ${row('引っ越し', sg('tradeMove', ['なし','1回','2回以上']))}
      ${row('行先', sg('tradeDest', TRADE_DESTS))}
      ${u.tradeDest==='その他' ? row('', `<input class="q-in" placeholder="行先の中身" value="${esc(u.tradeDestOther)}" onchange="custSet('${C}','${U}','tradeDestOther',this.value,1)" ${dis?'disabled':''}>`) : ''}</div>` : ''}
    ${row('残金', `<b class="q-rest ${rest<0?'neg':''}">${yen(rest)} 円</b><span class="q-why" style="display:inline;margin-left:8px">支払総額 ${yen(k.cash)}${k.trade?' − 下取り '+yen(k.trade):''}${k.tradeLoan?' ＋ 残債 '+yen(k.tradeLoan):''}${down?' − 頭金 '+yen(down):''}</span>`)}
    ${row('', sg('restMethod', ['現金','振込','オートローン','銀行ローン']))}
    ${u.restMethod ? row('', `<span class="q-why" style="display:inline;margin-right:6px">${restLb(u)}</span>${/ローン/.test(u.restMethod) ? '' : seg(u.restWhen||'', [['date','日付'],['del','納車時']], `custPay('${C}','${U}','restWhen','$v')`, dis)}${u.restWhen==='date' ? `<input type="date" class="q-in" style="width:150px;margin-left:6px" value="${esc(u.restDate)}" onchange="custSet('${C}','${U}','restDate',this.value,1)" ${dis?'disabled':''}>` : u.restWhen==='del' ? '<span class="q-why" style="display:inline;margin-left:6px">＝ 納車日</span>' : ''}`) : ''}
    ${u.restMethod==='オートローン' ? `<div class="q-psub">
      ${row('実質年率', `<input id="u-rate" class="q-in num" style="width:80px" inputmode="decimal" data-raw value="${u.rate}" oninput="if(event.isComposing)return;custSet('${C}','${U}','rate',numIn(this.value))" oncompositionend="custSet('${C}','${U}','rate',numIn(this.value))" ${dis?'disabled':''}><span class="q-why" style="display:inline;margin:0">%</span>`)}
      ${row('回数', `<select id="u-count" class="q-in" style="width:110px" onchange="custSet('${C}','${U}','count',+this.value,1)" ${dis?'disabled':''}>${[12,24,36,48,60,72,84,96,120].map(n=>`<option ${n===u.count?'selected':''}>${n}</option>`).join('')}</select>`)}
      ${k.loan ? row('お支払い', `<div class="q-loan"><span>割賦元金 <b>${yen(k.loan.P)}</b></span><span>初回 <b>${yen(k.loan.first)}</b></span><span>2回目以降 <b>${yen(k.loan.later)}</b> × ${k.loan.n-1}回</span><span>分割手数料 <b>${yen(k.loan.fee)}</b></span><span>割賦販売価格 <b>${yen(k.loan.hanbai)}</b></span></div>`) : ''}</div>` : ''}
    ${row('その他', `<div class="sb-pick">${u.restMethod==='オートローン' ? `<label class="q-chk"><input type="checkbox" ${u.ownership?'checked':''} onchange="custPay('${C}','${U}','ownership',this.checked)" ${dis?'disabled':''}>所有権留保（ローン会社）</label>` : ''}<label class="q-chk"><input type="checkbox" ${u.underage?'checked':''} onchange="custPay('${C}','${U}','underage',this.checked)" ${dis?'disabled':''}>未成年</label></div>`)}
  </div></div>`; }
function custPay(cid, uid, k, v){ const car = carOf(cid), u = custOf(car, uid); snap(); u[k] = v;
  if (k==='restMethod'){ u.pay = v==='オートローン' ? 'loan' : 'cash'; if (v!=='オートローン') u.ownership = false; if (/ローン/.test(v)) u.restWhen = 'date'; }
  if (k==='downOn' && !v) u.down = 0;
  if (k==='tradeIn' && !v){ u.trade = 0; u.tradeLoan = 0; }
  save(); render(); }
/* 🗣 2026-10-19「値引きと下取り支払いをセットに。支払方法も ABC それぞれで下取りあり・なし、現金・ローンだったり、見積内容が同じでも支払方法に差があるパターンを。それぞれの値引き。ぶち抜きの1本」「下取の価格は共通（あり／なしだけプランごと）」
   ＝プランごとに u.pp[p]＝{ tradeIn, downOn, down, restMethod, rate, count }。下取車の価格・中身・受領日などは共通（u のまま）。前の1つだけの値は、初めて読む時に各プランへ写す */
function ppOf(u, p){ p = p || 'base'; u.pp = u.pp || {}; if (!u.pp[p]) u.pp[p] = { tradeIn: u.tradeIn==null ? null : !!u.tradeIn, downOn: u.downOn==null ? null : !!u.downOn, down: u.down||0, restMethod: u.restMethod||'', rate: u.rate!=null ? u.rate : S.set.loan.rate, count: u.count || S.set.loan.count }; return u.pp[p]; }
const uFor = (u, p) => { const q = ppOf(u, p); return Object.assign({}, u, q, { pay: q.restMethod==='オートローン' ? 'loan' : 'cash', trade: q.tradeIn ? u.trade : 0, tradeLoan: q.tradeIn ? u.tradeLoan : 0, down: q.downOn ? q.down : 0 }); };
const custCtx = (car,u,p,b) => { const q = ppOf(u, p); return { car, b:withWar(b||u.baseSnap, p && p!=='base' && u.tiers ? u.tiers[p] : null), items:u.items, tiers:u.tiers, plan:p==='base'?null:p, disc:(u.disc||{})[p]||0, cond:u.cond, trade: q.tradeIn ? (u.trade||0) : 0, tradeLoan: q.tradeIn ? (u.tradeLoan||0) : 0, pay: q.restMethod==='オートローン' ? 'loan' : 'cash', down: q.downOn ? (q.down||0) : 0, rate:q.rate, count:q.count }; };
const payBrief = u => custPlans(u).map(p=>{ const q = ppOf(u,p); return (p==='base'?'基本':p)+' '+(q.restMethod ? (q.restMethod==='オートローン'?'ローン':q.restMethod) : '未選択')+(q.tradeIn?'・下取':''); }).join('／');
function custPP(cid, uid, p, k, v, soft){ const u = custOf(carOf(cid), uid), q = ppOf(u, p); if (!soft) snap(); q[k] = v;
  if (k==='downOn' && !v) q.down = 0;
  if (soft) renderKeep(); else { save(); render(); } }
function custPPCopy(cid, uid, from, to){ const u = custOf(carOf(cid), uid); snap(); u.pp[to] = JSON.parse(JSON.stringify(ppOf(u, from))); u.disc[to] = u.disc[from]||0; save(); render(); toast(`${to} を ${from} と同じ値引き・支払いにしました`, true); }
function payDiscCard(car, u, dis){ payFix(u); const C = car.id, U = u.id, ps = custPlans(u), NS = '<span class="q-pill warn" style="font-size:10.5px">未選択</span>';
  const rec = ps.includes(u.rec) ? u.rec : ps[0], K = {}; ps.forEach(p=>K[p] = calc(custCtx(car, u, p)));
  const yn = (p, k, cur) => seg(cur==null?'':cur?'y':'n', [['n','なし'],['y','あり']], `custPP('${C}','${U}','${p}','${k}','$v'==='y')`, dis) + (cur==null ? '<div>'+NS+'</div>' : '');
  const col = (p, inner) => `<td class="${p===rec?'rec':''}">${inner}</td>`;
  const R = (lb, f) => `<tr><th>${lb}</th>${ps.map(p=>col(p, f(p, ppOf(u,p), K[p]))).join('')}</tr>`;
  const anyTrade = ps.some(p=>ppOf(u,p).tradeIn), anyDown = ps.some(p=>ppOf(u,p).downOn);
  return `<div class="q-card"><h3>${I('receipt','🧾',15)} 値引き・下取・お支払い <span class="r">プランごとに決める（金額は税込）・下取車の価格と中身は共通</span></h3><div class="bd" style="overflow-x:auto">
    <table class="q-pp"><thead><tr><th></th>${ps.map(p=>col(p, pb(p)+(p===rec?' <span class="q-pb rec" style="position:static">おすすめ</span>':''))).join('')}</tr></thead><tbody>
    ${R('値引き', p=>`<div class="km-in">${money('u-d-'+p, u.disc[p]||0, `custSet('${C}','${U}','disc.${p}',parseYen(this.value))`, dis)}</div>`)}
    ${R('支払総額', (p,q,k)=>`<b>${yen(k.cash)}</b>`)}
    ${R('下取り', (p,q)=>yn(p,'tradeIn',q.tradeIn) + (q.tradeIn ? `<div class="q-why" style="margin:3px 0 0">− ${yen(u.trade||0)}${u.tradeLoan?'・残債 ＋'+yen(u.tradeLoan):''}${u.trade?'':' <span class="q-pill warn" style="font-size:10.5px">価格を下で</span>'}</div>` : ''))}
    ${R('頭金', (p,q)=>yn(p,'downOn',q.downOn) + (q.downOn ? `<div style="margin-top:4px" class="km-in">${money('u-dw-'+p, q.down, `custPP('${C}','${U}','${p}','down',parseYen(this.value),1)`, dis)}</div>` : ''))}
    ${R('残金の払い方', (p,q)=>seg(q.restMethod||'', [['現金','現金'],['振込','振込'],['オートローン','ローン'],['銀行ローン','銀行']], `custPP('${C}','${U}','${p}','restMethod','$v')`, dis) + (q.restMethod ? '' : '<div>'+NS+'</div>')
        + (q.restMethod==='オートローン' ? `<div style="margin-top:4px;display:flex;gap:4px;justify-content:center;align-items:center"><input id="u-rate-${p}" class="q-in num" style="width:58px" inputmode="decimal" data-raw value="${q.rate}" oninput="if(event.isComposing)return;custPP('${C}','${U}','${p}','rate',numIn(this.value),1)" oncompositionend="custPP('${C}','${U}','${p}','rate',numIn(this.value),1)" ${dis?'disabled':''}><span class="q-why" style="margin:0">%</span><select class="q-in" style="width:72px" onchange="custPP('${C}','${U}','${p}','count',+this.value)" ${dis?'disabled':''}>${[12,24,36,48,60,72,84,96,120].map(n=>`<option ${n===q.count?'selected':''}>${n}</option>`).join('')}</select><span class="q-why" style="margin:0">回</span></div>` : ''))}
    ${R('お支払い', (p,q,k)=>{ const down = q.downOn ? (q.down||0) : 0, rest = k.net - down; return k.loan ? `<div class="res">月々 ${yen(k.loan.later)}<small>初回 ${yen(k.loan.first)}・${k.loan.n}回${down?'・頭金 '+yen(down):''}</small><small>割賦販売価格 ${yen(k.loan.hanbai)}</small></div>` : `<div class="res ${rest<0?'neg':''}">${q.restMethod==='銀行ローン'?'銀行ローン ':q.restMethod?'残金 ':''}${yen(rest)}<small>${[down?'頭金 '+yen(down):'', k.trade?'下取 −'+yen(k.trade):''].filter(Boolean).join('・')||'一括'}</small></div>`; })}
    ${ps.length>1 ? `<tr><th></th>${ps.map(p=>col(p, p===rec ? '' : `<button class="q-btn sm" onclick="custPPCopy('${C}','${U}','${rec}','${p}')" ${dis?'disabled':''}>${rec==='base'?'基本':rec} と同じにする</button>`)).join('')}</tr>` : ''}
    </tbody></table>
    <details class="q-ppx" ${anyTrade && payMiss(u).some(m=>/下取/.test(m)) ? 'open' : ''}><summary>下取車・受け取り方など（共通）：${anyTrade ? esc(String(u.tradeModel||'車種 未入力'))+'・価格 '+yen(u.trade||0) : '下取りなし'}${anyDown ? '・頭金 '+esc(u.downMethod||'支払方法 未選択') : ''}</summary>
      ${payShared(car, u, dis)}</details></div></div>`; }
function payShared(car, u, dis){ const C = car.id, U = u.id, NS = v => (v==null || v==='') ? '<span class="q-pill warn">未選択</span>' : '';
  const yn = (k, cur) => seg(cur==null?'':cur?'y':'n', [['n','なし'],['y','あり']], `custPay('${C}','${U}','${k}','$v'==='y')`, dis) + NS(cur);
  const sg = (k, opts) => seg(u[k]||'', opts.map(o=>Array.isArray(o)?o:[o,o]), `custPay('${C}','${U}','${k}','$v')`, dis) + NS(u[k]);
  const row = (l, inner) => `<div class="q-pr"><label>${l}</label><div>${inner}</div></div>`;
  const ps = custPlans(u), anyTrade = ps.some(p=>ppOf(u,p).tradeIn), anyDown = ps.some(p=>ppOf(u,p).downOn), anyLoan = ps.some(p=>/ローン/.test(ppOf(u,p).restMethod||''));
  return `<div style="margin-top:6px">
    ${row('下取車価格', `<div class="km-in">${money('u-trade', u.trade, `custSet('${C}','${U}','trade',parseYen(this.value))`, dis)}</div><span class="q-why" style="display:inline">「あり」のプランだけ支払総額から引く</span>`)}
    ${row('残債', `<div class="km-in">${money('u-tl', u.tradeLoan, `custSet('${C}','${U}','tradeLoan',parseYen(this.value))`, dis)}</div><span class="q-why" style="display:inline">ローンが残っている時・支払総額に足す</span>`)}
    ${row('車種', `<input id="u-tmodel" class="q-in" placeholder="例：H22 フィット" value="${esc(u.tradeModel)}" onchange="custSet('${C}','${U}','tradeModel',this.value,1)" ${dis?'disabled':''}>${anyTrade?NS(String(u.tradeModel||'').trim()):''}`)}
    ${row('区分', sg('tradeClass', [['普通車','普通車'],['軽自動車','軽'],['貨物','貨物']]))}
    ${row('手続き', sg('tradeProc', [['抹消登録','抹消'],['移転抹消登録','移転抹消'],['移転','移転']]))}
    ${row('所有権解除', yn('tradeOwn', u.tradeOwn))}
    ${row('引っ越し', sg('tradeMove', ['なし','1回','2回以上']))}
    ${row('行先', sg('tradeDest', TRADE_DESTS))}
    ${u.tradeDest==='その他' ? row('', `<input class="q-in" placeholder="行先の中身" value="${esc(u.tradeDestOther)}" onchange="custSet('${C}','${U}','tradeDestOther',this.value,1)" ${dis?'disabled':''}>`) : ''}
    ${row('頭金の受け取り', sg('downMethod', ['現金','振込']) + `<span class="q-why" style="display:inline;margin:0 4px 0 10px">受領日</span><input type="date" class="q-in" style="width:150px" value="${esc(u.downDate)}" onchange="custSet('${C}','${U}','downDate',this.value,1)" ${dis?'disabled':''}>`)}
    ${row('残金の受け取り', seg(u.restWhen||'', [['date','日付'],['del','納車時']], `custPay('${C}','${U}','restWhen','$v')`, dis) + (u.restWhen==='date' ? `<input type="date" class="q-in" style="width:150px;margin-left:6px" value="${esc(u.restDate)}" onchange="custSet('${C}','${U}','restDate',this.value,1)" ${dis?'disabled':''}>` : u.restWhen==='del' ? '<span class="q-why" style="display:inline;margin-left:6px">＝ 納車日</span>' : '') + '<span class="q-why" style="display:inline;margin-left:8px">ローンは実行予定日・振込は振込予定日</span>')}
    ${row('その他', `<div class="sb-pick">${anyLoan ? `<label class="q-chk"><input type="checkbox" ${u.ownership?'checked':''} onchange="custPay('${C}','${U}','ownership',this.checked)" ${dis?'disabled':''}>所有権留保（ローン会社）</label>` : ''}<label class="q-chk"><input type="checkbox" ${u.underage?'checked':''} onchange="custPay('${C}','${U}','underage',this.checked)" ${dis?'disabled':''}>未成年</label></div>`)}
  </div>`; }
function staleOf(car,u){ return custPlans(u).some(p=>calc(custCtx(car,u,p,car.base)).net !== calc(custCtx(car,u,p)).net); }
function identicalPlans(u){
  const sig = p => JSON.stringify(u.items.filter(x=>x.in[p]).map(x=>x.n+x.a).sort())+'|'+(u.disc[p]||0)+'|'+JSON.stringify(u.tiers[p])+'|'+JSON.stringify(ppOf(u,p));
  const ps = custPlans(u), out = []; [['A','B'],['B','C'],['A','C']].forEach(([x,y])=>{ if (ps.includes(x) && ps.includes(y) && sig(x)===sig(y)) out.push(x+' と '+y); }); return out;
}
/* 工程＝CarFlow の列（仕入れ purchase／展示準備中 regen／展示中 exhibit／売約済み＝納車準備 delivery）。商談中は展示中の中の札 */
const PHASES = [['all','全て'],['purchase','仕入れ'],['regen','展示準備中'],['exhibit','展示中'],['delivery','売約済み（納車準備）']];
/* 売約＝見積の売約の札（car.order）か、CarFlow で売約・納車準備・納車完了の車（_sold・_col） */
function phaseOf(car){ return (car.order || car._sold || car._col==='delivery' || car._col==='done') ? 'delivery' : (car.status==='purchase' || car.status==='regen') ? car.status : 'exhibit'; }
function carStatus(car){ const ph = phaseOf(car);
  if (ph==='delivery') return car.order ? ['sold','売約済み（見積・'+jd(car.order.date).slice(5)+'）'] : ['sold','売約済み'];
  if (ph==='purchase') return ['purchase','仕入れ'];
  if (ph==='regen') return ['regen','展示準備中'];
  return car.custs.length ? ['deal','展示中・商談中'] : ['exhibit','展示中']; }

/* ---------- 相場＝相場ビューと同じ相場カード（Storage soba/v1/）・同じ当て方（soba/stock.js）・同じ計算（soba-calc.js quoteMix）
   quote-data.js の QData.soba(car) が裏で出して car._sb に持つ（出たら描き直す）。金額は千円・小売は税込・AA は税抜
   返す形：now（小売 成約の車両価格・税込）・series/aa（13か月・この車の条件に合わせて伸縮）・stock/fresh・rawSold12/rawSold3（全グレードの生の真ん中）・aaNow・rawAA13/rawAA2・asnet・in4rt/in4aa・
           days（在庫日数）・old90・nStock・nSold・nAA・trust（信頼度 A〜F）・pct（外れの目安 ±%）・speed（値付けと売れるまでの日数の目安）・cardName/y/g/built ---------- */
function sobaOf(car){ return window.QData ? QData.soba(car) : null; }
const sobaWait = car => car && car._sbState === 'loading';
function sobaDays(sb, d){ const s = sb.speed; if (d<=s[0].d) return s[0].days; for (let i=1;i<s.length;i++){ if (d<=s[i].d){ const a=s[i-1], b=s[i]; return Math.round(a.days+(b.days-a.days)*(d-a.d)/(b.d-a.d)); } } return s[s.length-1].days; }
/* 🗣 2026-10-19「基本裏側の表示は全部税抜きに揃えたい」＝小売の相場（成約の車両価格・税込・千円）を、自社の車両本体（税抜）と同じ物差しに直す。相場比の%は今まで通り車両価格どうしで出す */
const mktEx = (car, v) => v/1.1 - seibiOf(car && car.base)/1000;
function ratioLabel(r){ return r<=0.95?['great','かなり安い']:r<=0.99?['good','お買い得']:r<=1.03?['fair','相場並み']:['high','高め']; }

/* =====================================================================
   4. 部品
   ===================================================================== */
const $ = id => document.getElementById(id);
/* 🗣 2026-10-19 昼の点検：onclick などの '…' の中に入れる値は jsq（' と \ を逃がしてから esc）。esc だけだと「Meguiar's」のような名前で押しても動かない */
const jsq = s => esc(String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"));
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function I(n, fb, sz){ return (typeof ic==='function') ? ic(n, fb, sz||14) : fb; }
/* 🗣 2026-10-23「相場をもっときれいに・情報が多くて分かりにくい」「インフォマークとかにしたら？」＝長い説明は ⓘ にしまう（乗せる／押すと出る） */
function info(t){ return `<span class="q-i" tabindex="0" role="button" aria-label="説明">i<span class="q-i-pop">${t}</span></span>`; }
function qiPlace(el){ requestAnimationFrame(()=>{ const p = el.querySelector('.q-i-pop'); if (!p) return;
  const r = el.getBoundingClientRect(), w = Math.min(330, innerWidth-16); p.style.width = w+'px';
  p.style.left = Math.max(8, Math.min(innerWidth-w-8, r.left + r.width/2 - w/2))+'px';
  const h = p.offsetHeight; p.style.top = (r.bottom+6+h > innerHeight ? Math.max(8, r.top-6-h) : r.bottom+6)+'px'; }); }
['mouseover','focusin'].forEach(ev=>document.addEventListener(ev, e=>{ const el = e.target.closest && e.target.closest('.q-i'); if (el && !el.contains(e.relatedTarget)) qiPlace(el); }));
/* 🗣 2026-10-19 昼の点検：日本語入力のまま全角で打っても数字になるように（１２０００・－5000・３．９）。前は 0 になっていた */
const numIn = v => { const n = parseFloat(String(v||'').normalize('NFKC').replace(/[^\d.\-]/g,'')); return isNaN(n) ? 0 : n; };
function parseYen(v){ v = String(v||'').normalize('NFKC').replace(/[¥,円\s]/g,''); const m = v.match(/^([\d.]+)万$/); if (m) return Math.round(parseFloat(m[1])*10000); const n = parseFloat(v); return isNaN(n)?0:Math.round(n); }
function money(id, val, on, dis){ return `<input id="${id}" class="q-in num" inputmode="numeric" value="${yen(val)}" data-money onfocus="this.value=this.value.replace(/,/g,'')" onblur="this.value=yen(parseYen(this.value))" oninput="if(event.isComposing)return;${on}" oncompositionend="${on}" ${dis?'disabled':''}>`; }
/* 🗣 2026-10-19「AA の落札手数料は会場によって税込と税抜がある。税込・税抜の切り替えボタンを付けて表示を2つに割って、常に反対側を打ち込みで表示」
   ＝持つのは税抜（cost.aa）。どちらで入れるかは cost.aaIn（'in'＝税込で入れる・無し＝税抜）。左＝入れる側、右＝反対側（入れるたびに計算）。基本価格の車両原価と原価管理の両方で使う */
function aaFeeIn(car, id, dis){ const c = car.base.cost, inc = c.aaIn === 'in', ex = c.aa || 0, incV = (c.aaInV != null && Math.round(c.aaInV/1.1) === ex) ? c.aaInV : Math.round(ex*1.1);   // 税込で入れた額はそのまま出す（1円ずれない）
  return `<div class="aa-fee">${seg(inc?'in':'ex', [['ex','税抜'],['in','税込']], `aaMode('${car.id}','$v')`, dis)}<div class="h"><small>${inc?'税込で入れる':'税抜で入れる'}</small>${money(id, inc?incV:ex, `aaSet('${car.id}',parseYen(this.value))`, dis)}</div><div class="h oth"><small>${inc?'税抜（自動）':'税込（自動）'}</small><b>${yen(inc?ex:incV)}</b></div></div>`; }
function aaSet(cid, v){ const c = carOf(cid).base.cost; if (c.aaIn === 'in'){ c.aa = Math.round(v/1.1); c.aaInV = v; } else { c.aa = v; delete c.aaInV; } renderKeep(); }
function aaMode(cid, m){ snap(); const c = carOf(cid).base.cost; if (m === 'in') c.aaIn = 'in'; else delete c.aaIn; save(); render(); }
/* 🗣 2026-10-19「プルダウンとかで選べる方がいいかな。2行にしたくない」「検査登録手続代行費用が保証欄のような感じで 2.5万と3.5万から選べる、手打ちも出来るように」
   ＝選択肢のプルダウン＋「手入力…」。今の値が選択肢に無い時・「手入力…」を選んだ時は右に入力欄。選んだ時の動きは PICK[key]（描くたびに入れ直す） */
const PICK = {};
function pickIn(key, cur, opts, onPick, inputHtml, dis){ PICK[key] = onPick; S.ui.pk = S.ui.pk || {};
  const hit = opts.some(o=>String(o[0])===String(cur)); if (!hit) S.ui.pk[key] = 1;   // 手入力になったら、選択肢と同じ額を打っても欄を消さない
  const other = !hit || S.ui.pk[key];
  return `<div class="sb-pick pk"><select class="q-in pk-sel" onchange="pickSel('${key}',this.value)" ${dis?'disabled':''}>${opts.map(([v,l])=>`<option value="${esc(String(v))}" ${!other&&String(v)===String(cur)?'selected':''}>${esc(l)}</option>`).join('')}<option value="__o" ${other?'selected':''}>手入力…</option></select>${other?inputHtml:''}</div>`; }
function pickSel(key, v){ S.ui.pk = S.ui.pk || {}; if (v === '__o'){ S.ui.pk[key] = 1; render(); const e = document.querySelector('.sb-pick.pk select[onchange*="\''+key+'\'"]'); const i = e && e.parentElement.querySelector('input'); if (i){ i.focus(); i.select(); } return; } delete S.ui.pk[key]; PICK[key](v); }
function seg(cur, opts, on, dis){ return `<span class="q-seg">${opts.map(([v,l])=>`<button class="${cur===v?'on':''}" onclick="${on.replace(/\$v/g,v)}" ${dis?'disabled':''}>${l}</button>`).join('')}</span>`; }
function pb(p){ return `<span class="q-pb ${p}">${p==='base'?'基本見積':p+'・'+esc(planName(p))}</span>`; }
/* 車の写真（本物の CarFlow はカードの写真。モックは NAS のグーネット掲載写真を3台分だけ＝build.py の photos_js）。無い車は絵 */
/* 🖼 v4.5.0 帳票の置き場 → カード詳細の［写真］タブの角度（🗣 2026-10-23「どのアングルか指定してほしい」）。その角度の写真が無い時は1番（＝car.photo・サムネ） */
const PH_ANG = { hero:'外装 前', side:'外装 横', rear:'外装 後ろ', back:'外装 後ろ', dash:'運転席まわり', nav:'ナビ・カメラ', seat:'前の席', seat2:'後ろの席', lug:'荷室', meter:'メーター', wheel:'タイヤ' };
const carPh = (car, slot) => { const a = slot && PH_ANG[slot], L = car.photos || [], hit = a ? L.find(x=>x && x.angle===a && x.url) : null; return hit ? hit.url : (car.photo || (L[0] && L[0].url) || ''); };
function carSvg(car, label){
  if (carPh(car)) return `<img class="car-ph" src="${carPh(car)}" alt="">`;
  const col = COLORS[car.color] || '#ccc', dark = ['ブラック','ブルー','レッド','グレー'].includes(car.color);
  const van = /ノア|ヴォクシー|セレナ|フリード|タント|N-BOX|スペーシア/.test(car.model), kei = car.kei;
  const body = van ? (kei ? 'M70 122 L78 62 Q82 50 96 50 L214 50 Q232 50 240 64 L262 104 Q276 108 278 122 L278 132 L62 132 Z' : 'M44 120 L62 74 Q68 60 86 58 L216 56 Q236 56 246 70 L270 102 Q286 106 288 120 L288 132 L40 132 Z')
                 : 'M48 120 L84 88 Q96 72 124 70 L196 70 Q220 70 236 86 L262 104 Q282 108 284 120 L284 132 L44 132 Z';
  const win = van ? (kei ? 'M88 60 L150 58 L150 92 L84 92 Z M158 58 L210 58 Q222 58 228 68 L240 92 L158 92 Z' : 'M76 72 L90 64 L150 62 L150 96 L70 96 Z M158 62 L212 60 Q224 60 232 70 L250 96 L158 96 Z')
                : 'M100 90 Q108 80 126 78 L150 78 L150 100 L94 100 Z M158 78 L194 78 Q212 78 224 90 L234 100 L158 100 Z';
  return `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g${car.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd8e6"/><stop offset="1" stop-color="#e9edf3"/></linearGradient></defs><rect width="320" height="180" fill="url(#g${car.id})"/><rect y="138" width="320" height="42" fill="#b8c2d1"/><path d="${body}" fill="${col}" stroke="${dark?'#111':'#9aa3b2'}" stroke-width="2"/><path d="${win}" fill="${dark?'#2c3e55':'#8fa6c4'}"/><circle cx="${kei?100:96}" cy="134" r="17" fill="#2b2f38"/><circle cx="${kei?100:96}" cy="134" r="7" fill="#9aa3b2"/><circle cx="${kei?240:238}" cy="134" r="17" fill="#2b2f38"/><circle cx="${kei?240:238}" cy="134" r="7" fill="#9aa3b2"/>${label?`<text x="160" y="172" text-anchor="middle" font-size="11" fill="#6b7585" font-family="sans-serif">${label}</text>`:''}</svg>`;
}

/* =====================================================================
   5. 画面：一覧
   ===================================================================== */
function listRow(car){
  const days = daysBetween(car.buyDate, TODAY), [st, stl] = carStatus(car), sb = sobaOf(car);   // sb＝null は相場カードなし
  const k = car.base ? calc(baseCtx(car)) : null;
  /* 🗣 2026-10-23「どっちも欲しい。店で区切った総額の比較と、裸の車両価格を全部で比較した2本」
     ①全部の店の小売の成約の相場と車両価格（税込）で（ratio・前からの相場比）／②保証・整備付きの店（C1）の掲載と支払総額で（c1）。
     🗣「見積なしでOK。CarFlow 見積が進めば、手入れはすぐに無くすつもり」＝見積（基本価格）が無い車は比べない（カードの掲載の値は使わない） */
  const src = 'q', myBody = k ? k.bodyIn : 0, myTotal = k ? k.cash : 0;
  const ratio = sb && myBody ? myBody/1000/sb.now : null, lab = ratio ? ratioLabel(ratio) : null;
  const c1 = sb && sb.c1 && myTotal ? c1Judge(myTotal/1000, sb.c1) : null;
  const pend = car.base && car.base.changed && ['goo','cs'].some(s=>(car.base.portalDone[s]||'')<car.base.changed);
  const noPortal = car.base && !car.base.portalDone.goo;
  return { car, days, st, stl, sb, k, ratio, lab, c1, src, pend: pend||noPortal };
}

/* ---------- 一覧：価格履歴（🗣 2026-10-01「一括印刷の横に価格履歴ボタン。どれも直近の値動きを表示。工程や見積ボタン等、車両情報以外は出さなくてOK」
   ねらい：「月をまたいで、ちゃんとどれも価格調整できてるよな？」を一目で見る ---------- */
/* 1行の形はそのまま、直近の値動き1件だけ出す（🗣「今の1行の感じは変えずに。2026/09/01 － 2,250,000 … 自動車税 6→5か月 ▲3,300 こんな感じの表記が出ればいい。相場とかは要らない」） */
function histTable(list){
  let h = `<div class="q-list q-plist"><table><thead><tr><th></th><th>車</th><th>直近の値動き</th><th class="v">増減</th><th class="v">本体（税抜）</th><th class="v">支払総額（税込）</th><th>理由</th></tr></thead><tbody>`;
  list.forEach(r=>{ const c = r.car, ev = c.base ? priceEvents(c) : [], e = ev[ev.length-1], seibi = seibiOf(c.base);
    const fee = e && e.kind==='fee', d = !e || fee ? null : e.from ? e.to - e.from : null;
    h += `<tr class="row" onclick="${c.base?`openCut('${c.id}')`:`openRowMenu('${c.id}')`}"><td><div class="ph">${carSvg(c)}</div></td>
      <td class="nm"><div class="nmw"><span class="kmno">${c.base&&c.base.sale?`<span class="q-pill ${c.base.sale.on?'high':'warn'}" style="display:block;width:fit-content;margin-bottom:2px">${c.base.sale.on?'セール中':'セール予定'}〜${jd(c.base.sale.to).slice(5)}</span>`:''}${esc(c.num)}${c.base?`<small class="q-ver" title="${c.order?'売約した見積の番号':'見積の最新の番号（基本価格-プラン見積-個別見積）'}">${verLabel(c)}</small>`:''}</span><div class="nmb"><b>${esc(c.maker)} ${esc(c.model)}</b> <small>${esc(c.grade)}・${c.firstReg?wareki(c.firstReg):''}・${(c.km/10000).toFixed(1)}万km${c.kei?'・軽':''}</small></div></div></td>
      ${e ? `<td>${jd(e.date)}</td>
      <td class="v" style="font-weight:800;color:${fee?'var(--text3)':d==null?'var(--text3)':d<0?'var(--green)':'var(--orange)'}">${fee?'－':d==null?'初回':(d<0?'▲':'＋')+yen(Math.abs(d))}</td>
      <td class="v">${yen(e.to)}</td><td class="v"><b>${yen(cashAt(c, e.to, e.date).cash)}</b></td>
      <td class="why">${esc(fee ? e.detail : e.why)}</td>`
      : `<td colspan="5"><span class="q-empty">基本価格なし</span></td>`}</tr>`; });
  if (!list.length) h += `<tr><td colspan="8" class="q-placeholder">当てはまる車がありません</td></tr>`;
  return h + `</tbody></table></div>`;
}
let _hideSold = false;   // 保存しない（上のタブ・車を開く・ほかのビューで外れる）
function renderList(){
  const rows = S.cars.map(listRow);
  const u = S.ui; if (!PHASES.some(x=>x[0]===u.phase)) u.phase = 'all';
  const cnt = ph => ph==='all' ? rows.length : rows.filter(r=>phaseOf(r.car)===ph).length;
  let list = u.phase==='all' ? rows : rows.filter(r=>phaseOf(r.car)===u.phase);
  if (_hideSold && u.phase!=='delivery') list = list.filter(r=>phaseOf(r.car)!=='delivery');   // 🗣 2026-10-05「並びの右隣りに ✅売約車を非表示」→「チェックは記憶しない。別タブや別ビューに行ったら戻る」
  if (u.q){ const q = u.q.toLowerCase(); list = list.filter(r=>(r.car.num+r.car.maker+r.car.model+r.car.grade).toLowerCase().includes(q)); }
  const lastChg = c => c.base && c.base.hist.length ? c.base.hist[c.base.hist.length-1].date : '9999';   // 最後に価格を変えた日（基本価格なしは最後）
  const byNum = (a,b)=>b.car.num.localeCompare(a.car.num);
  const sorters = { fresh:(a,b)=>(!!a.car.base - !!b.car.base) || byNum(a,b), num:byNum, ratio:(a,b)=>(b.ratio||0)-(a.ratio||0), c1:(a,b)=>((b.c1&&b.c1.pct)||0)-((a.c1&&a.c1.pct)||0),
    days:(a,b)=>(b.days-a.days) || byNum(a,b),
    stale:(a,b)=>lastChg(a.car).localeCompare(lastChg(b.car)) || byNum(a,b), total:(a,b)=>((b.k&&b.k.cash)||0)-((a.k&&a.k.cash)||0) };
  if (!sorters[u.sort]) u.sort = 'fresh';
  list.sort(sorters[u.sort]);
  const sel = u.sel = u.sel || {}; Object.keys(sel).forEach(id=>{ if (!carOf(id)) delete sel[id]; });
  const selN = Object.keys(sel).filter(id=>sel[id]).length;
  let h = `<div class="q-wrap"><div class="q-top"><div><div class="t">${I('estimate','🧾',18)} 見積</div><div class="s">在庫車 ${S.cars.length}台。基本価格 → プラン見積 → 個別見積 → 売約（売約は見積の上の札だけ。カンバンの売約・納車のタスクには触れません）</div></div><span class="sp"></span>${roNote()}</div>
    ${S.pending && carOf(S.pending.carId) ? (()=>{ const pc = carOf(S.pending.carId); return `<div class="q-pend">${I('info','ℹ',15)} 途中の見積：<b>${esc(pc.num)} ${esc(pc.model)}</b>（${STEP_L[S.pending.step]}・${esc(S.pending.at)}）<span class="sp"></span><button class="q-btn sm" onclick="pendingDrop()">破棄</button><button class="q-btn pri sm" onclick="pendingResume()">続きから</button></div>`; })() : ''}
    <div class="q-phase">${PHASES.map(([id,l])=>`<button class="${u.phase===id?'on':''}" onclick="S.ui.phase='${id}';_hideSold=false;save();render()">${l}<b>${cnt(id)}</b></button>`).join('')}</div>
    <div class="q-tools"><input id="q-search" class="q-in" style="max-width:280px" placeholder="管理番号・車名で探す" value="${esc(u.q)}" oninput="if(event.isComposing)return;S.ui.q=this.value;renderKeep()" oncompositionend="S.ui.q=this.value;renderKeep()">
      <span style="font-size:12px;color:var(--text3)">並び</span>${seg(u.sort,[['fresh','新規'],['num','管理番号'],['days','在庫日数'],['c1','C1比'],['ratio','相場比'],['stale','価格据置'],['total','支払総額']],"S.ui.sort='$v';save();render()")}<label class="q-chk" style="margin-left:6px;flex:0 0 auto;width:auto;white-space:nowrap" title="売約済みの車を一覧から外す（「売約済み」のタブでは出る）"><input type="checkbox" ${_hideSold?'checked':''} onchange="_hideSold=this.checked;render()">売約車を非表示</label>
      <span class="sp" style="flex:1"></span>${u.bulkMode
        ? `<span style="font-size:12.5px;color:var(--text2)">印刷する車にチェック：<b style="color:var(--blue)">${selN} 台</b></span><button class="q-btn pri" ${selN?'':'disabled'} onclick="openBulk()">${I('printer','🖨',15)} 選んだ車を印刷へ</button><button class="q-btn" onclick="S.ui.bulkMode=false;S.ui.sel={};save();render()">やめる</button>`
        : `<button class="q-btn ${u.histMode?'pri':''}" onclick="S.ui.histMode=!S.ui.histMode;save();render()">${I('down','↓',15)} 価格履歴${u.histMode?'を閉じる':''}</button>${u.histMode?'':`<button class="q-btn" onclick="S.ui.bulkMode=true;save();render()">${I('printer','🖨',15)} 一括印刷</button>`}`}</div>
    <div class="q-list"><table><thead><tr>${u.bulkMode?`<th class="ck"><input type="checkbox" title="表示中を全部選ぶ" ${list.length&&list.every(r=>sel[r.car.id])?'checked':''} onclick="event.stopPropagation();selAll(this.checked)"></th>`:''}<th></th><th>車</th><th>${u.sort==='days'?'在庫日数':u.sort==='stale'?'据置日数':'工程'}</th><th class="v">本体（税抜）</th><th class="v">支払総額（掲載・税込）</th><th title="保証あり＋法定整備付の一般店（C1）の掲載の支払総額と比べる">保証・整備付きの店と<small style="display:block;font-weight:400;color:var(--text3)">支払総額</small></th><th title="格安・現状販売も含む全部の店の小売の成約の相場と、車両価格（税込）で比べる">全部の店と<small style="display:block;font-weight:400;color:var(--text3)">車両価格</small></th><th style="text-align:right"></th></tr></thead><tbody>`;
  S.ui.listIds = list.map(r=>r.car.id);
  if (!u.histMode) list.forEach(r=>{ const c = r.car;
    h += `<tr class="row ${u.bulkMode&&sel[c.id]?'sel':''}" onclick="${u.bulkMode?(c.base?`selOne('${c.id}',${sel[c.id]?'false':'true'})`:`toast('基本価格が無い車は刷れません')`):`openRowMenu('${c.id}')`}">${u.bulkMode?`<td class="ck" onclick="event.stopPropagation()"><input type="checkbox" ${sel[c.id]?'checked':''} ${c.base?'':'disabled'} onclick="selOne('${c.id}',this.checked)"></td>`:''}<td><div class="ph">${carSvg(c)}</div></td>
      <td class="nm"><div class="nmw"><span class="kmno">${c.base&&c.base.sale?`<span class="q-pill ${c.base.sale.on?'high':'warn'}" style="display:block;width:fit-content;margin-bottom:2px">${c.base.sale.on?'セール中':'セール予定'}〜${jd(c.base.sale.to).slice(5)}</span>`:''}${esc(c.num)}${c.base?`<small class="q-ver" title="${c.order?'売約した見積の番号':'見積の最新の番号（基本価格-プラン見積-個別見積）'}">${verLabel(c)}</small>`:''}</span><div class="nmb"><b>${esc(c.maker)} ${esc(c.model)}</b> <small>${esc(c.grade)}・${c.firstReg?wareki(c.firstReg):''}・${(c.km/10000).toFixed(1)}万km${c.kei?'・軽':''}</small></div></div></td>
      <td>${u.sort==='days' ? `<b class="q-dnum">${r.days}</b>日` : u.sort==='stale' ? (c.base&&c.base.hist.length ? `<b class="q-dnum">${daysBetween(lastChg(c), TODAY)}</b>日<small class="q-dsub">${jd(lastChg(c)).slice(5)} から</small>` : '<span class="q-empty">—</span>') : `<span class="q-pill ${r.st}">${esc(r.stl)}</span>${r.k&&(r.k.bc.wtMiss||r.k.bc.wtStale)?`<span class="q-pill warn" style="margin-left:4px" title="基本価格の「国交省で照会」で重量税を入れる">${r.k.bc.wtMiss?'重量税 未照会':'重量税 照会し直し'}</span>`:''}`}</td>
      <td class="v">${r.k?yen(c.base.price):`<span class="q-empty">基本価格なし</span>`}</td>
      <td class="v"><b>${r.k?yen(r.k.cash):'—'}</b></td>
      <td>${!r.k?'<span class="q-pill none">見積なし</span>':r.c1?`<span class="q-pill ${r.c1.cls}" title="${r.c1.lab}">${r.c1.short} ${r.c1.pct}%</span>`:r.sb?'<span class="q-pill none">C1 なし</span>':sobaWait(r.car)?'<span class="q-pill none">読み込み中</span>':'<span class="q-pill none">相場なし</span>'}</td>
      <td>${!r.k?'<span class="q-pill none">見積なし</span>':r.lab?`<span class="q-pill ${r.lab[0]}">${r.lab[1]} ${Math.round(r.ratio*100)}%</span>`:sobaWait(r.car)?'<span class="q-pill none">読み込み中</span>':'<span class="q-pill none">相場なし</span>'}</td>
      <td onclick="event.stopPropagation()">${c.base?`<div class="qd"><button class="b0" title="カード詳細を開く" onclick="QData.openCar('${c.id}')">${I('car','🚗',13)} 詳細</button><button class="b0" title="値付けの履歴と相場の状況を見る" onclick="openPriceView('${c.id}')">${I('down','↓',13)} 価格履歴</button><button class="b0" title="見積書の閲覧画面を開く（中で 基本・A・B・C を切り替え）" onclick="quickDoc('${c.id}','base')">${I('estimate','🧾',13)} 見積</button><button class="b0" title="基本・A・B・C・装備品一覧から選んで印刷" onclick="openPick('${c.id}')">${I('printer','🖨',13)} 選択印刷</button></div>`:'<span class="q-empty" style="float:right">基本価格なし</span>'}</td></tr>`; });
  if (!list.length) h += `<tr><td colspan="${u.bulkMode?9:8}" class="q-placeholder">当てはまる車がありません</td></tr>`;
  h += `</tbody></table></div></div>`;
  if (u.histMode) h = h.slice(0, h.indexOf('<div class="q-list">')) + histTable(list) + '</div>';
  $('q-root').innerHTML = h;
}

/* =====================================================================
   6. 画面：車の見積（① ② ③ ④）
   ===================================================================== */
/* 見るだけの人（作業者・閲覧）：直しても保存しない（Firestore のルールでも弾く）。原価は出さない */
function roNote(){ return QData.canEdit() ? '' : `<span class="q-pill warn" title="見積を直せるのは 管理者・マネージャー・スタッフ">見るだけ（保存されません）</span>`; }
function renderCar(){
  const car = carOf(S.ui.carId); if (!car) return goList();
  const u = S.ui, days = daysBetween(car.buyDate, TODAY), [st, stl] = carStatus(car);
  const k = car.base ? calc(baseCtx(car)) : null;
  const split = !car.base || u.step==='base';
  let h = `<div class="q-wrap ${split?'split':''}"><div class="q-back" onclick="goList()">${I('left','←',14)} 見積の一覧</div>
    <div class="q-band"><div class="ph">${carSvg(car)}</div><div><div class="ttl"><small>${esc(car.num)}</small><small>${esc(car.maker)}</small>${esc(car.model)} ${esc(car.grade)}${car.base?`<span class="q-verb" title="${car.order?'売約した見積の番号':'見積の最新の番号（基本価格-プラン見積-個別見積）'}">${esc(verLong(car))}</span>`:''}</div>
      <div class="ch"><span class="q-pill ${st}">${esc(stl)}</span><span>${warekiYM(car.firstReg)}${car.firstReg?'（'+car.firstReg.slice(0,4)+'）':''}${car._firstRegGuess&&car.firstReg?' <small class="q-why" style="display:inline">年式から仮</small>':''}</span><span>${car.km?car.km.toLocaleString()+'km':'走行 —'}</span><span>${car.cc?ccU(car):'排気量 —'}${car.kei?'・軽':''}${car.hybrid?'・HV':''}</span><span>${esc(car.color)}</span><span>${esc(car.fmodel)}</span><span>在庫 <b>${days}日</b></span></div></div>
      <span class="sp"></span>
      ${k?`<div class="tot"><div class="k">掲載の支払総額（税込）</div><div class="v">${yen(k.cash)}</div><div class="k">本体（税抜）${yen(car.base.price)}</div></div>`:''}
      <div style="display:flex;flex-direction:column;gap:6px"><button class="q-btn sm" onclick="QData.openCar('${car.id}')">${I('card','🪪',14)} カード詳細</button>${car.base?`<button class="q-btn sm" onclick="openDocs()">${I('printer','🖨',14)} 帳票を見る</button>`:''}</div></div>`;
  const nC = car.custs.length;
  const steps = [['base','1','基本価格'],['std','2','プラン見積'],['cust','3','個別見積'],['order','4','売約']];
  h += `<div class="q-steps">${steps.map(([id,n,l])=>{ const dis = (!car.base && id!=='base') || (id==='order' && !car.order) || (u.step!==id && STEPS.indexOf(id) > reachedOf(car));
      return `<div class="q-step ${u.step===id?'on':''} ${dis?'dis':''}" onclick="${dis?`toast('${!car.base&&id!=='base'?'先に基本価格を作ってください':id==='order'&&!car.order?'個別見積から「売約にする」と進めます':'「保存して次へ」で進んだ所まで行き来できます'}')`:`moveTo('${id}')`}"><span class="n">${n}</span>${l}${id==='cust'&&nC?`<span class="c">${nC}</span>`:''}${id==='order'&&car.order?'<span class="c">版'+car.order.ver+'</span>':''}</div>`; }).join('')}</div>`;
  h += stepGuide(car, car.base ? u.step : 'base');
  if (!car.base) h += noBase(car);
  else if (u.step==='base') h += stepBase(car);
  else if (u.step==='std') h += stepStd(car);
  else if (u.step==='cust') h += stepCust(car);
  else if (u.step==='order' && car.order) h += stepOrder(car);
  h += `</div>`;
  $('q-root').innerHTML = h;
}
function noBase(car){
  const L = leftCompact(car) + `<div class="q-card lead"><h3>${I('info','ℹ',15)} この車はまだ基本価格がありません</h3><div class="bd">
    <div class="q-why" style="font-size:12.5px">今は車両カードで入れた金額（<b>${yen(car.cfPrice||0)}円</b>）が カードとポータルに出ています。基本価格を作ると、以後の金額は全部ここから出ます。</div>
    <div class="q-f" style="margin-top:8px"><div><label class="k">車両本体価格（税抜・納車整備を除く）</label>${money('nb-price', !car.cfPrice && sobaOf(car) ? Math.round(sobaOf(car).now*1000/1.1/1000)*1000 - lightPrice() : Math.round((car.cfPrice||0)/1.1/1000)*1000 - lightPrice(), '')}</div>
      <div><label class="k">リサイクル預託金相当額</label>${money('nb-rec', car.kei?9500:12000, '')}</div></div>
    <div style="margin-top:12px;display:flex;gap:8px"><button class="q-btn pri" onclick="makeBase('${car.id}')">${I('plus','＋',14)} 基本価格を作る</button><span class="q-why" style="margin:6px 0 0">登録の種類などは標準の値で作られます（あとで直せる）</span></div></div></div>`;
  return `<div class="q-grid split"><div id="q-colL">${L}</div><div id="q-colR">${rightPanel(car, null)}</div></div>`;
}


/* ---------- 段ごとの「ここでやること」（🗣 2026-10-01「①②③をクリックしたときに、その下に何をすべきところなのかもっと明確に」） ---------- */
function stepGuide(car, step){
  const G = {
    base:['基本価格','この車をいくらで出すかを決める所。ここで決めた金額が掲載の支払総額と、全部の見積のもとになります。'],
    std:['プラン見積','来店・問い合わせで最初に渡す見積。店のパックから自動ででき、基本価格の変更にもついてきます。'],
    cust:['個別見積','お客様ごとの見積。商談しながら3つのプランを仕上げ、決まった1本を売約にします。'],
    order:['売約','決まった1本を注文書に固定して、納車の準備に渡す所。'],
  }[step];
  return `<div class="q-guide1"><b>${G[0]}</b><span>${G[1]}</span><span class="sp"></span>${navBtns(car, step)}</div>`;
}

/* ---------- 車両情報（🗣 2026-10-01「CarFlow のカードを適当に作ってたとしても、ここでちゃんと一括で修正できるように。KM番号だけは自動採番なので変更不可」）
   本物：ここで直した値は CarFlow の車両カード（cars/{id}）にそのまま保存＝カード詳細と同じ値。直す前の値は car.cf に持って「変更」を出す ---------- */
const VEH_FIELDS = ['maker','model','grade','gradeSub','fmodel','vin','firstReg','km','color','cc','weight','kei','fuel','hybrid','buyDate'];
const MAKERS = CFMaker.names();   /* 4.74.0 候補はメーカー表（本物の CarFlow の car-class.js）の正式名 */
/* 相場DB（業務ツール\車販\AA相場診断\相場DB の cards.json）のどの条件で相場を出すか。
   車種＝車種マスターのキー（DataLine 車種名＋型式）／型式は前の記号を外した部分（DBA-ZRR80W → ZRR80W）／年式／グレード（メイン）＋詳細／走行／色（パール白・黒・銀…にまとめる） */
const carCat = car => car.colorCat || colorCat(car.color);   // 区分：手で選んだ値 → 無ければ色の名前から
function colorCat(c){ c = c||''; if (!c) return '—';   // 🗣「白とパールは分けた方がよくない？」→ 相場DB と同じ分け方
  return /ツートン|2トーン|\//.test(c)?'ツートン':/パール/.test(c)?'パール白':/ホワイト|白|シロ/.test(c)?'白':/ブラック|黒|クロ/.test(c)?'黒':/シルバー|銀|ギン/.test(c)?'銀':/グレー|ガンメタ|チタン|ハイ/.test(c)?'グレー'
    :/ブルー|青|紺|コン|アオ|ネイビー/.test(c)?'青系':/レッド|赤|ワイン|アカ|オレンジ|ダイダイ/.test(c)?'赤・橙':/ブラウン|茶|ベージュ|ゴールド|金|ブロンズ|カーキ/.test(c)?'茶・金':/グリーン|緑|ミドリ|ミント/.test(c)?'緑':'その他'; }
function vehMatch(car){ const code = (car.fmodel||'').split('-').pop();
  return [esc(car.model||'—'), '型式 '+esc(code||'—'), (car.firstReg?car.firstReg.slice(0,4)+'年式':'年式 —'), esc(car.grade||'—')+(car.gradeSub?'・'+esc(car.gradeSub):''), (car.km?(car.km/10000).toFixed(1)+'万km':'走行 —'), '色 '+carCat(car)]; }
function vehKata(car){
  const L = katLookup(car.fmodel, car.firstReg, car.maker);
  if (L.state!=='ok') return `<div class="match"><b>型式DB</b><span>${L.state==='empty'?'型式を入れると候補が出ます':'型式「'+esc(L.code)+'」は見つかりません'}</span></div>`;
  const nm = L.names.find(n=>n.car===car.model) || L.names[0], w = katWarn(nm, car.firstReg), G = katGrades(nm, L.y, car.firstReg);
  return `<div class="match"><b>型式DB</b><span>${L.names.map(n=>esc(n.mk+' '+n.car)).join('／')}（${esc(nm.first)}〜${esc(nm.last)} 発売）</span>
    ${G.list.slice(0,10).map(x=>`<button type="button" class="nc-chip ${car.grade===x.g?'on':''}" style="padding:2px 8px" onclick="setCar('grade','${jsq(x.g)}')">${esc(x.g)}</button>`).join('')}</div>${w?`<div class="nc-warn">⚠ ${w}</div>`:''}`;
}
/* vehCard（前の車両情報の形）は v4.0.0 で外した＝leftCompact だけ */
function cpOpen(id, def){ S.ui.cp = S.ui.cp || {}; return S.ui.cp[id]===undefined ? def : S.ui.cp[id]; }
function cpToggle(id, def){ S.ui.cp = S.ui.cp || {}; S.ui.cp[id] = !cpOpen(id, def); save(); render(); }
function cpSec(id, def, title, sum, pills, rows){
  const op = cpOpen(id, def);
  return `<div class="q-cp ${op?'open':''}"><div class="hd" onclick="cpToggle('${id}',${def})"><span class="cv">▶</span><span class="t">${title}</span><span class="sm">${sum}</span>${pills||''}</div>${op?`<div class="bd">${rows}</div>`:''}</div>`;
}
const cpRow = (label, inner, cls) => `<div class="r ${cls||''}"><label>${label}</label><div>${inner}</div></div>`;
const AUTO_K = ['cc','weight','kei','fuel'];
/* CarFlow の車の欄（読むだけ）。見積からは書かない＝直すのは CarFlow の車両情報（カード詳細）で。v4.0.0 */
const REAL_K = ['maker','model','grade','km','color','buyDate'];
const realVal = (car, k) => k==='km' ? (car.km ? Number(car.km).toLocaleString()+' km' : '—') : k==='buyDate' ? (car.buyDate ? jd(car.buyDate) : '—') : (car[k] || '—');
const realRO = (car, k) => `<span class="vv">${esc(realVal(car, k))}</span> <button type="button" class="q-btn sm" style="margin-left:6px" onclick="QData.openCar('${car.id}')" title="カード詳細を開く（車両情報はそちらで直す）">カードで直す</button>`;
/* 車体色：色と区分の2つの選択（🗣 2026-10-01「車体色は色と区分も選べる形の方がいい」） */
const COLOR_LIST = ['パールホワイト','ホワイト','パール','ブラック','シルバー','グレー','ガンメタ','レッド','ブルー','ネイビー','グリーン','ミントグリーン','ベージュ','ブラウン','イエロー','オレンジ','パープル','ゴールド','ツートン'];
function colorPick(car, chgCls, dis){
  /* 🗣「車体色自体は手打ちじゃないの？」→ 色は手打ち（候補つき）、区分だけ選ぶ */
  return `<div class="col-pick"><input id="v-color" class="q-in ${chgCls}" value="${esc(car.color||'')}" placeholder="例：パールホワイトⅢ" list="v-colors" onchange="setColor(this.value)" ${dis?'disabled':''}><datalist id="v-colors">${COLOR_LIST.map(c=>`<option value="${c}">`).join('')}</datalist>
    <span class="k">区分</span><select id="v-colorCat" class="q-in" onchange="setCar('colorCat',this.value)" ${dis?'disabled':''}>${COLOR_CATS.map(c=>`<option ${c===carCat(car)?'selected':''}>${c}</option>`).join('')}</select>
    ${car.colorCat && car.colorCat!==colorCat(car.color) ? '<span class="q-why" style="margin:0">手で選んだ区分</span>' : ''}</div>`;
}
/* 色を変えた時：区分は自動（手で選んだ区分は色に合わせて外す） */
function setColor(v){ const car = curCar(); if (car.colorCat === colorCat(car.color)) delete car.colorCat; setCar('color', v); }
/* ---------- 型式の入力（🗣 2026-10-01「型式は半角英数・大文字固定。PitFlow のナンバー入力のようにクリックで2枠に。DBA －（埋め込み）ZRR80W のような形」）
   PitFlow card-detail.js の _plateGuideHtml と同じ作り：見た目は1枠（読み取りだけ）、押すと下にガイドが開く。閉じた時に保存 ---------- */
const upAlnum = (s, hy) => String(s||'').normalize('NFKC').toUpperCase().replace(hy ? /[^A-Z0-9-]/g : /[^A-Z0-9]/g, '');
function upFix(el, hy){ const v = upAlnum(el.value, hy); if (v !== el.value){ const pos = el.selectionStart - (el.value.length - v.length); el.value = v; try { el.setSelectionRange(pos, pos); } catch(e){} } }
function kataPick(car, chgCls, dis){
  const v = car.fmodel || '', i = v.indexOf('-'), pre = i>=0 ? v.slice(0,i) : '', post = i>=0 ? v.slice(i+1) : v;
  const inp = (id, val, ph, w, next) => `<input id="${id}" class="q-in up-in" style="width:${w}px" value="${esc(val)}" placeholder="${ph}" autocomplete="off" autocapitalize="characters" spellcheck="false"
    oninput="if(!event.isComposing){upFix(this);ktSync()}" oncompositionend="upFix(this);ktSync()" onkeydown="if(event.key==='Enter'){event.preventDefault();${next}}">`;
  return `<div class="kt-pick" id="kt-pick" data-car="${car.id}"><input id="v-fmodel" class="q-in kt-main ${chgCls}" readonly value="${esc(v)}" placeholder="クリックして入力（例：DBA-ZRR80W）" onclick="ktOpen()" onkeydown="if(event.key==='Enter')ktOpen()" ${dis?'disabled':''}>
    <div class="kt-guide"><div class="kt-grid">
      <div><div class="l">前（排ガス記号）</div>${inp('kt-pre', pre, 'DBA', 74, "$('kt-post').focus()")}</div>
      <span class="dash">－</span>
      <div><div class="l">後（型式）</div>${inp('kt-post', post, 'ZRR80W', 140, 'ktClose(1)')}</div></div>
      <div class="q-why" style="margin:6px 0 0">半角英数・大文字に自動でそろえます。<br>前の記号が無い型式は「後」だけで OK</div></div></div>`;
}
function ktSync(){ const pre = $('kt-pre').value, post = $('kt-post').value; $('v-fmodel').value = pre && post ? pre+'-'+post : (pre || post); }
function ktOpen(){ const w = $('kt-pick'); if (!w || $('v-fmodel').disabled) return; w.classList.add('open'); setTimeout(()=>{ const a = $('kt-pre'); if (a) a.focus(); }, 0); }
function ktClose(save){ const w = $('kt-pick'); if (!w || !w.classList.contains('open')) return; w.classList.remove('open'); const car = carOf(w.dataset.car), v = $('v-fmodel').value; if (save !== 0 && car && v !== (car.fmodel||'')) setCar('fmodel', v); }
document.addEventListener('mousedown', e=>{ const w = $('kt-pick'); if (w && w.classList.contains('open') && !w.contains(e.target)) ktClose(1); });
document.addEventListener('keydown', e=>{ if (e.key==='Escape'){ const w = $('kt-pick'); if (w && w.classList.contains('open')){ const car = carOf(w.dataset.car); $('v-fmodel').value = car.fmodel||''; ktClose(0); } } });
/* 🗣 2026-10-19「保証の選択に 3か月の他、1年1万キロ・3年3万キロ・新車保証・なし も選べるように」 */
const WAR_TPL = ['3か月または3,000km', '1年または10,000km', '3年または30,000km', '新車保証', 'なし'];
const warText = b => b.warranty || '';
const warNone = b => !b || !b.warranty || b.warranty === 'なし';   // 保証なし＝帳票は「保証付」と書かない
function leftCompact(car){
  if (!car.cf){ car.cf = {}; VEH_FIELDS.forEach(k=>car.cf[k]=car[k]); }
  const dis = !!car.order || !QData.canEdit(), chg = k => !REAL_K.includes(k) && String(car[k]??'') !== String(car.cf[k]??'');
  const auto = k => AUTO_K.includes(k) ? '<span class="q-pill" style="background:rgba(14,165,233,.18);color:#7dd3fc">型式から</span>' : '';
  const lab = (k, l) => `${l}${auto(k)}${chg(k)?'<span class="chg">変更</span>':''}`;
  const txt = (k, ph, list) => REAL_K.includes(k) ? realRO(car, k) : `<input id="v-${k}" class="q-in ${chg(k)?'chg':''}" value="${esc(car[k]??'')}" placeholder="${ph||''}" ${list?`list="${list}"`:''} onchange="setCar('${k}',this.value)" ${dis?'disabled':''}>`;
  const num = (k, unit) => REAL_K.includes(k) ? realRO(car, k) : `<div class="two"><input id="v-${k}" class="q-in num ${chg(k)?'chg':''}" inputmode="numeric" value="${car[k]?Number(car[k]).toLocaleString():''}" onchange="setCar('${k}',parseYen(this.value))" ${dis?'disabled':''}><span>${unit}</span></div>`;
  const power = car.hybrid ? 'hv' : (car.fuel||'gas');
  const nChg = VEH_FIELDS.filter(chg).length;
  const miss = ['fmodel','firstReg','grade','km','color'].filter(k=>!car[k]).length;
  const vehPills = (miss?`<span class="q-pill warn">未入力 ${miss}</span>`:'') + (nChg?`<span class="q-pill warn">変更 ${nChg}</span>`:'') + (sobaWait(car)?'<span class="q-pill none">相場を読み込み中</span>':sobaOf(car)?'<span class="q-pill good">相場あり</span>':'<span class="q-pill none">相場なし</span>');
  const vehSum = `${esc(car.maker)} ${esc(car.model)} ${esc(car.grade)}${car.gradeSub?'・'+esc(car.gradeSub):''}・${car.firstReg?warekiYM(car.firstReg)+'（'+car.firstReg.slice(0,4)+'）':'初度登録 —'}・${car.km?(car.km/10000).toFixed(1)+'万km':'走行 —'}・${esc(car.color||'色 —')}・${esc(car.fmodel||'型式 —')}`;
  let h = cpSec('veh', true, `${I('car','🚗',14)} 車両情報`, vehSum, vehPills,
    cpRow('管理番号', `<span class="lock">${I('lock','🔒',13)} ${esc(car.num)}</span> <span class="q-why" style="display:inline">自動採番・変更不可</span>`)
    + cpRow(lab('fmodel','型式'), kataPick(car, chg('fmodel')?'chg':'', dis))
    + cpRow(lab('vin','車台番号'), `<input id="v-vin" class="q-in up-in ${chg('vin')?'chg':''}" value="${esc(car.vin||'')}" autocomplete="off" autocapitalize="characters" spellcheck="false" oninput="if(!event.isComposing)upFix(this,1)" oncompositionend="upFix(this,1)" onchange="setCar('vin',this.value)" ${dis?'disabled':''}>`)
    + cpRow(lab('firstReg','初度登録'), frPick(car, chg('firstReg')?'chg':'', dis))
    + cpRow(lab('grade','グレード'), txt('grade','例：Si'))
    + cpRow(lab('gradeSub','グレードの詳細'), txt('gradeSub','パッケージ・限定車'))
    + cpRow(lab('km','走行距離'), `<div class="km-in">${num('km','km')}</div>`)
    + cpRow(lab('color','車体色'), realRO(car, 'color'))
    + `<div class="sub">型式DB で入る所（違っていたら直す。メーカー・車名はカードの車両情報）</div>`
    + cpRow(lab('maker','メーカー'), txt('maker'))
    + cpRow(lab('model','車名'), txt('model'))
    + cpRow(lab('cc','排気量'), `<div class="km-in">${num('cc','cc')}</div>`)
    + cpRow(lab('kei','区分'), seg(car.kei?'kei':'car',[['car','普通車'],['kei','軽自動車']],`setCar('kei','$v'==='kei')`, dis))
    + cpRow(lab('fuel','動力'), seg(power,[['gas','ガソリン'],['diesel','ディーゼル'],['hv','ハイブリッド']],`setPower('$v')`, dis))
    + vehKata(car)
    + `<div class="match"><b>相場DB</b>${vehMatch(car).map(x=>`<span>${x}</span>`).join('')}</div>`
    + (nChg?`<div style="margin-top:8px"><button class="q-btn sm" onclick="vehRevert('${car.id}')">変更をカードの値に戻す（${nChg}項目）</button></div>`:''));
  const b = car.base; if (!b) return h;
  const k = calc(baseCtx(car)), bc = k.bc, R = bc.R, L0 = bc.seibiInfo, cst = b.cost, costSum = costOf(b), gross = b.price - costSum;
  h += cpSec('price', true, `${I('estimate','🧾',14)} 車両価格`, `本体 ${yen(b.price)}（税抜）・リサイクル ${yen(b.recycle)}${b.wsPrice?'・業販 '+yen(b.wsPrice):''}${b.hist.length>1?'・値下げ '+(b.hist.length-1)+'回':''}`, '',
    /* 🗣 2026-10-23「一度でも本体価格を決めた車は、手打ちで変更でも、売れそうな金額の3BOXでも、変更するときはポップアップでOKさせたい」＝打ち終わった時（離れた・Enter）に確認の窓 */
    cpRow('車両本体価格（税抜）', `<input id="b-price" class="q-in num" inputmode="numeric" value="${yen(b.price)}" onfocus="this.value=this.value.replace(/,/g,'')" onkeydown="if(event.key==='Enter'){this.blur();}" onchange="priceAsk('${car.id}', parseYen(this.value), '手入力')" onblur="this.value=yen(parseYen(this.value))" ${!QData.canEdit()?'disabled':''}>`)
    + cpRow('納車整備', `<div class="sb-pick"><div class="km-in">${money('b-seibi', L0.price, `setBase('seibi',parseYen(this.value))`, dis)}</div></div><div class="q-why" style="margin-top:2px">車両価格に含む（定期点検整備付）・${b.seibi==null ? `<b>既定の ${yen(lightPrice())}</b>（設定の値。設定を変えるとこの車も変わる）` : `<b style="color:#f59e0b">この車だけ ${yen(seibiOf(b))}</b>（既定は ${yen(lightPrice())}）${dis?'':` <button class="q-lnk" onclick="setBase('seibi',null,1)">既定に戻す</button>`}`}</div>`)
    + cpRow('車両価格（税込）', `<span class="vv">${yen(k.bodyIn)}</span> <span class="q-why" style="display:inline">＝ポータルの「車両価格」</span>`, 'tot')
    + cpRow('リサイクル預託金 <span class="q-cls h">非課税</span>', money('b-rec', b.recycle, `setBase('recycle',parseYen(this.value))`))
    + (b.sale ? `<div style="grid-column:1/-1">${saleBadge(car)}</div>` : '')
    /* 🗣 2026-10-19「価格の調整・本体価格を調整する この行も非表示でOK」＝値下げは一覧の行のメニュー・価格履歴・車両詳細カードから */
    /* 🗣 2026-10-01「業販価格は別設定する／しないのスイッチで、しないがデフォ。するの場合は金額手入れ」 */
    + cpRow('業販価格（税抜）', `<div class="sb-pick">${seg(b.wsOn||b.wsPrice>0?'on':'off',[['off','しない'],['on','別に設定する']],`setWs('${car.id}','$v'==='on')`, dis)}${b.wsOn||b.wsPrice>0?`<div class="km-in">${money('b-ws', b.wsPrice, `setBase('wsPrice',parseYen(this.value)||0)`, dis)}</div>`:''}</div><div class="q-why" style="margin-top:2px">${b.wsPrice>0?'業販（D）はこの金額・現状渡し':'業販（D）は車両本体価格と同じ '+yen(b.price)+'・現状渡し'}</div>`));
  const jbIn = [12,13,24,25,36,37].includes(+b.jibaiM);
  h += cpSec('reg', true, `${I('clipboard','📋',14)} 登録・保証`, `${b.newCar?'新車':'中古車'}・${esc(R.l)}${car.kei?'':'・'+plateClsOf(car,b)+'ナンバー'}${R.xfer?'（ナンバー'+(b.plate==='change'?'変更':'そのまま')+'）':''}・${ym(bc.rd).y}年${ym(bc.rd).m}月登録${b.regAuto?'（自動）':''}・${R.insp?'自賠責 '+bc.jibaiM+'か月':'車検 '+b.shakenEnd.replace('-','/')+'まで'}・保証 ${esc(warText(b))}・修復歴 ${esc(b.repair)}`, bc.wtMiss?'<span class="q-pill warn">重量税 未照会</span>':bc.wtStale?'<span class="q-pill warn">重量税 照会し直し</span>':'',
    cpRow('新車／中古車', seg(b.newCar?'new':'used',[['used','中古車'],['new','新車']],`setBase('newCar','$v'==='new',1)`))
    + cpRow('登録予定月', `${seg(b.regAuto?'auto':'fix',[['auto','自動'],['fix','月を決める']],`setBase('regAuto','$v'==='auto',1)`)}${b.regAuto?`<div class="q-why">いま＝${autoRegMonth().replace('-','年')}月登録（毎月 ${regCut()}日 から次の月・設定 ▸ 見積 ▸ 税・保険・手数料）</div>`:`<input id="b-regm" type="month" class="q-in" style="margin-top:5px;max-width:180px" value="${b.regMonth}" onchange="setBase('regMonth',this.value,1)">`}`)
    + cpRow('登録の種類', `${seg(b.regType, REG_TYPES.map(r=>[r.k,r.l]), `setBase('regType','$v',1)`)}<div class="q-why">${esc(R.d)}</div>`)
    + (car.kei ? '' : cpRow('ナンバー', `${seg(plateClsOf(car,b), [['5','5ナンバー'],['3','3ナンバー']], `setBase('plateCls','$v',1)`)}<div class="q-why">${R.l}の検査・登録手数料 ${yen(bc.regFee)}（陸運局へ持込）${b.plateCls?'':'・排気量から仮に選択'}</div>`))
    + (R.xfer ? cpRow('ナンバー', seg(b.plate,[['keep','変更なし'],['change','変更あり']],`setBase('plate','$v',1)`)) : '')
    + (!R.insp ? cpRow('車検の満了', `<input id="b-she" type="month" class="q-in" style="max-width:180px" value="${b.shakenEnd}" onchange="setBase('shakenEnd',this.value,1)">`)
       : !R.buyerReg ? cpRow('自動車重量税', wtUI(car, b, bc)) : '')
    + (R.insp ? cpRow('自賠責の月数', `<div class="two"><input id="b-jm" class="q-in num" style="width:60px" inputmode="numeric" value="${b.jibaiM}" onchange="setBase('jibaiM',Math.max(1,Math.min(37,Math.round(numIn(this.value))||25)),1)"><span>か月</span>${seg(jbIn?String(b.jibaiM):'',[['12','12'],['24','24'],['25','25'],['36','36']],`setBase('jibaiM',$v,1)`)}</div>`)
       + (jbIn ? '' : cpRow(`自賠責保険料（${b.jibaiM}か月）`, `${money('b-ja', bc.jibai, `setBase('jibaiAmt',parseYen(this.value))`)}<div class="q-why">${bc.jibaiSrc==='est'?'<b>目安</b>（表から近似）。保険会社の額を入れる':'入れた額'}</div>`)) : '')
    /* 🗣 2026-10-01「保証もとりあえず 3か月3千キロと3年3万キロが選べて、手打ちも可能」（保証会社のチェックは「ここでは要らない」で外した） */
    + cpRow('保証', pickIn('war', b.warranty, WAR_TPL.map(w=>[w,w]), v=>setBase('warranty', v, 1), `<input id="b-war" class="q-in" style="width:190px" value="${esc(b.warranty)}" placeholder="例：6か月または6,000km" onchange="setBase('warranty',this.value.trim(),1)" ${dis?'disabled':''}>`, dis))
    + cpRow('修復歴', `<input id="b-rep" class="q-in" value="${esc(b.repair)}" onchange="setBase('repair',this.value,1)">`));
  const fr = feeRows(bc, b, 0).filter(r=>r.id!=='garage'), fShow = fr.filter(r=>!r.hide), fHid = fr.filter(r=>r.hide), fSum = fShow.reduce((s,r)=>s+r.a,0);
  const fSumK = fShow.filter(r=>r.t!=='t').reduce((s,r)=>s+r.a,0), fSumT = fSum - fSumK;
  h += cpSec('fee', true, `${I('receipt','🧾',14)} 販売諸費用`, `${fShow.map(r=>esc(r.n.replace(/手続代行費用|代行費用|費用$/,''))+' '+yen(r.a)).join('・')||'なし'}・課税 ${yen(fSumK)}（税抜）${fSumT?'・立替 '+yen(fSumT):''}`, '',
    fShow.map(r=>cpRow(r.add ? `<input id="b-fn-${r.i}" class="q-in" value="${esc(r.n)}" placeholder="項目名" onchange="feeName(${r.i},this.value)" ${dis?'disabled':''}>` : `${esc(r.n)}${r.manual?'<span class="chg">手入力</span>':''}`,
      `<div class="sb-pick">${r.add?seg(r.t,[['k','課税'],['t','立替']],`feeAddTax(${r.i},'$v')`, dis):'<span class="q-cls k">課税</span>'}${r.id==='reg' ? pickIn('fee-reg', r.a, REG_FEE_OPT(r.def, bc.imp), v=>{ if (+v===r.def) feeAmtReset('reg'); else feeEdit(bb=>{ bb.feeAmt = Object.assign({}, bb.feeAmt, { reg:+v }); }, 1); }, `<div class="km-in">${money('b-fa-reg', r.a, `feeAmt('reg',parseYen(this.value))`, dis)}</div>`, dis)
        : `<div class="km-in">${money('b-fa-'+r.id, r.a, r.add?`feeAddAmt(${r.i},parseYen(this.value))`:`feeAmt('${r.id}',parseYen(this.value))`, dis)}</div>${r.manual?`<button class="q-btn sm" title="設定の金額（${yen(r.def)}）に戻す" onclick="feeAmtReset('${r.id}')" ${dis?'disabled':''}>↺ 設定の金額</button>`:''}`}<button class="q-del" title="この車の見積から外す" onclick="${r.add?`feeDel(${r.i})`:`feeHide('${r.id}',1)`}" ${dis?'disabled':''}>✕</button></div>`)).join('')
    /* 🗣 2026-10-19「車庫証明…あれ非表示にって言わなかったっけ」＝基本価格には車庫証明の行も案内も出さない（個別見積の「この方の条件」だけ） */
    + (fHid.length ? cpRow('外した項目', `<div class="sb-pick">${fHid.map(r=>`<button class="q-btn sm" onclick="feeHide('${r.id}',0)" ${dis?'disabled':''}>＋ ${esc(r.n)}</button>`).join('')}</div>`) : '')
    + cpRow('項目を足す', `<div class="sb-pick"><input id="b-fnew-n" class="q-in" style="width:210px" list="b-fee-list" placeholder="項目名（例：管轄外登録費用）" ${dis?'disabled':''}><datalist id="b-fee-list">${FEE_SUG.map(x=>`<option value="${x}">`).join('')}</datalist><div class="km-in">${money('b-fnew-a', 0, '', dis)}</div><button class="q-btn sm pri" onclick="feeAdd()" ${dis?'disabled':''}>＋ 足す</button></div><div class="q-why" style="margin-top:2px">この車の掲載の支払総額と、全部の見積・書類に入る。課税＝税抜（消費税は別）／立替＝そのまま（行政書士の報酬など）。直すと価格履歴に残る</div>`)
    + cpRow('販売諸費用 計', `<span class="vv">${yen(fSumK)}</span> <span class="q-why" style="display:inline">課税（税抜）</span>${fSumT?`　<span class="vv">${yen(fSumT)}</span> <span class="q-why" style="display:inline">立替</span>`:''}`, 'tot'));
  if (QData.canEdit()) h += cpSec('cost', true, `${I('lock','🔒',14)} 車両原価 <span class="q-cls in" style="margin-left:4px">社内だけ</span>`, `仕入 ${jd(car.buyDate).slice(5)}・原価 ${yen(costSum)}・粗利 <b style="color:${gross>=100000?'var(--green)':gross>=0?'var(--orange)':'var(--red)'}">${yen(gross)}</b>`, '',
    cpRow(lab('buyDate','仕入日'), realRO(car, 'buyDate'))
    + cpRow('仕入価格（落札・買取）', money('b-c-buy', cst.buy, `setCost('buy',parseYen(this.value))`))
    + cpRow('AA 手数料・落札料', aaFeeIn(car, 'b-c-aa'))
    + cpRow('陸送', money('b-c-move', cst.move, `setCost('move',parseYen(this.value))`))
    /* 🗣 2026-10-02「仕入れの他にリ代（行って来いだから金額は同じ）と、ある場合は月割りの自税金がある」 */
    + cpRow('リサイクル料金', `<span class="vv">${yen(b.recycle)}</span>`)
    /* 🗣 2026-10-19「自動車税の月割りが押せない気がする」→ 売約済みの車だけ押せなかった（ほかの原価の欄は入れられた）。AA の月割は後で請求が来るので、売約のあとでも入れられる */
    + cpRow('自動車税の月割', `<div class="sb-pick">${seg(cst.tax!=null?'on':'off',[['off','なし'],['on','あり']],`setCostTax('${car.id}','$v')`)}${cst.tax!=null?`<div class="km-in">${money('b-c-tax', cst.tax, `setCost('tax',parseYen(this.value))`)}</div>`:''}</div>`)
    + cpRow('車両原価 計', `<span class="vv">${yen(costSum)}</span>`)
    + cpRow('車体の粗利', `<span class="vv" style="color:${gross>=100000?'var(--green)':gross>=0?'var(--orange)':'var(--red)'}">${yen(gross)}</span>`, 'tot'));
  return h;
}

/* ---------- ① 基本価格（この車の掲載の支払総額と、全部の見積のもと） ---------- */
function stepBase(car){
  const b = car.base, k = calc(baseCtx(car)), bc = k.bc, R = bc.R, cst = b.cost, costSum = costOf(b), gross = b.price - costSum;
  const sold = !!car.order, L0 = tierOf('L');
  let L = (sold ? `<div class="q-note ok">${I('lock','🔒',14)} 売約済み。基本価格を直しても注文書は変わりません。</div>` : '') + leftCompact(car);
  return `<div class="q-grid split"><div id="q-colL">${L}</div><div id="q-colR">${rightPanel(car, k)}</div></div>`;
}
/* ---------- 右の列：価格相場／設定内容／基本情報（🗣 2026-10-01） ---------- */
function rightPanel(car, k){
  const tab = ['soba','conf','info'].includes(S.ui.rtab) ? S.ui.rtab : 'soba';
  const tabs = [['soba','価格相場'],['conf','設定内容'],['info','基本情報']];
  const body = tab==='conf' ? (k ? confPanel(car,k) : `<div class="q-placeholder">基本価格を作ると、掲載の支払総額の内訳がここに出ます。</div>`)
             : tab==='info' ? infoPanel(car)
             : sobaPanel(car, k || { bodyIn: car.cfPrice || 0 });
  return `<div class="q-card"><div class="bd" style="padding-top:8px"><div class="q-wtabs">${tabs.map(([id,l])=>`<button class="${tab===id?'on':''}" onclick="S.ui.rtab='${id}';save();render()">${l}</button>`).join('')}</div>${body}</div></div>`;
}
/* 設定内容：掲載の支払総額の内訳を、見積書の手前の形で確かめる一覧（入力は左。ここは見るだけ） */
function confPanel(car, k){
  const b = car.base, bc = k.bc, R = bc.R, L0 = bc.seibiInfo;
  /* 🗣 2026-10-02「フォロー文を全部カット」→ 4つめの引数（添え書き）は出さない */
  const row = (l, v, cls) => `<div class="q-row"><label>${l}${cls?` <span class="q-cls ${cls[0]}">${cls[1]}</span>`:''}</label><span class="v">${v===null?'<span style="color:var(--text3)">—</span>':yen(v)}</span></div>`;
  const K = ['k','課税'], T = ['t','立替'], H = ['h','非課税'];
  return `<div class="q-sec">この車の前提</div>
    <div class="q-copy" style="grid-template-columns:1fr auto"><span>区分・登録の種類</span><span class="v">${b.newCar?'新車':'中古車'}・${esc(R.l)}${R.xfer?'（ナンバー'+(b.plate==='change'?'変更あり':'変更なし')+'）':''}</span>
      <span>登録予定月</span><span class="v">${ym(bc.rd).y}年${ym(bc.rd).m}月${b.regAuto?'（自動）':''}</span>
      <span>車検・自賠責</span><span class="v">${R.insp?(R.buyerReg?'予備検':'2年')+'・自賠責 '+bc.jibaiM+'か月':'車検残 '+b.shakenEnd.replace('-','年')+'月まで'}</span>
      <span>納車整備・保証</span><span class="v">${esc(L0.name)}（車両価格に含む）・${esc(warText(b))}</span></div>
    <div class="q-sec">車両</div>
    ${row('車両本体価格（税抜）', b.price)}${row(esc(L0.name), L0.price, null, '定期点検整備付。車両価格に含む')}
    ${row('車両価格（税抜）', bc.body)}${row('車両価格（税込）＝ポータルの「車両価格」', bc.bodyIn)}
    <div class="q-sec">税金・保険（立替）</div>
    ${bc.kei?row('軽自動車税', null, null, '4/1 の持ち主に1年分・月割なし')
      : R.buyerReg?row('自動車税', null, null, '予備検＝登録の時にお客様側で')
      : R.xfer?row('自動車税の未経過相当額', bc.unexpTax, K, '移転＝今年度の残りを持ち主から引き継ぐ（課税）')
      : row(`自動車税（${ym(bc.rd).m}月登録・${bc.months}か月）`, bc.carTax, T, `年額 ${yen(bc.annual)}円${bc.heavy?'（13年超の重課）':''} × 月数 ÷12・100円未満切り捨て`)}
    ${row('自動車重量税', bc.wtMiss?null:bc.weight, T, R.buyerReg?'予備検＝登録の時にお客様側で':!R.insp?'車検が残っているので無し':bc.wtQ!=null?'国交省の照会 '+jd(bc.wtAt)+(bc.wtStale?'・<b>照会し直し</b>（税制の年度が変わる）':''):bc.kei?'軽・2年・'+({exempt:'免税',eco:'本則',std:'当分の間',y13:'13年経過',y18:'18年経過'}[bc.weightKey]):'<b>未照会</b>（登録・保証の「国交省で照会」）')}
    ${R.insp?row(`自賠責保険料（${bc.jibaiM}か月）`, bc.jibai, T, (bc.jibaiSrc==='est'?'<b>目安</b>・':'')+'保険の始まる日 '+jd(bc.rd)+(bc.tbFrom==='2026-11-01'?'（11/1 からの新料金）':''))
      : row(`自賠責の未経過相当額（残り ${bc.remM}か月）`, bc.unexpJb, K)}
    <div class="q-sec">法定費用（立替）</div>
    ${k.legal.map(f=>row(f[0], f[1]||null, T)).join('')}
    <div class="q-sec">代行費用（課税）</div>
    ${k.feeK.map(f=>row(f[0], f[1]||null, K)).join('')}
    <div class="q-sec">リサイクル</div>
    ${row('リサイクル預託金相当額', b.recycle, H, '金額は左の「車両価格」の欄で入れる')}
    <div class="q-sec">消費税</div>
    ${row('課税10%の対象（税抜）', k.taxable)}${row('消費税（10%・切り捨て）', k.ctax)}
    <div class="q-sum"><span>諸費用（車両価格以外）</span><span>${yen(k.cash-k.bodyIn)}</span></div>
    <div class="q-total" style="padding:10px 0 0"><span>掲載の支払総額（ベース）</span><b>${yen(k.cash)} 円</b></div>`;
}
/* 基本情報：型式DB（グーのカタログ）と、入れた車両情報の突き合わせ（人の目で確かめる用） */
function infoPanel(car){
  const L = katLookup(car.fmodel, car.firstReg, car.maker);
  if (L.state!=='ok') return `<div class="q-note warn">${I('warn','⚠',15)} ${L.state==='empty'?'型式が入っていません。左の車両情報で型式を入れると、カタログと突き合わせます。':'型式「'+esc(L.code)+'」は型式DB に見つかりません。型式を確かめてください（カタログに無い車種のこともあります）。'}</div>`;
  const nm = L.names.find(n=>n.car===car.model) || L.names.find(n=>car.model && n.car.includes(car.model)) || L.names[0];
  const G = katGrades(nm, L.y, car.firstReg), want = nfkc(car.grade+' '+(car.gradeSub||'')).trim(), g0 = nfkc(car.grade);
  const sp = G.list.find(x=>x.g===want) || G.list.find(x=>x.g===g0) || null;
  const num = s => parseInt(String(s||'').replace(/[^\d]/g,''))||0;
  const J = (ok, na) => na ? '<td class="j nac">—</td>' : ok ? '<td class="j okc">✓</td>' : '<td class="j ngc">⚠</td>';
  const w = katWarn(nm, car.firstReg);
  const rows = [
    ['メーカー', nm.mk, car.maker, J(nfkc(car.maker)===nfkc(nm.mk) || (!!CFMaker.find(car.maker) && CFMaker.find(car.maker)===CFMaker.find(nm.mk)))],
    ['車名', L.names.map(n=>n.car).join('／'), car.model, J(L.names.some(n=>n.car===car.model))],
    ['型式', nm.full, car.fmodel, J(kataCode(car.fmodel)===L.code)],
    ['発売（このモデル）', nm.first+'〜'+nm.last, car.firstReg ? '初度登録 '+car.firstReg.replace('-','/') : '—', J(!w, !car.firstReg)],
    ['グレード', sp ? sp.g : `候補 ${G.list.length}件`, (car.grade||'—')+(car.gradeSub?'・'+car.gradeSub:''), J(!!sp, !car.grade)],
    ['排気量', sp?sp.cc:'—', car.cc?ccU(car):'—', J(sp && Math.abs(num(sp.cc)-car.cc)<=20, !sp)],
    /* 車両重量の行は v4.0.5 で外した（重量税は国交省の照会の額・重さは使わない） */
    ['区分', sp?(num(sp.cc)<=660?'軽自動車':'普通車'):'—', car.kei?'軽自動車':'普通車', J(sp && (num(sp.cc)<=660)===!!car.kei, !sp)],
    ['駆動・ミッション', sp?sp.drive+'・'+sp.shift:'—', '（車両情報に無い）', J(0,1)],
    ['定員', sp?sp.seat:'—', '（車両情報に無い）', J(0,1)],
    ['燃費・寸法', sp?(sp.fuel||'—')+'・'+(sp.size||'—'):'—', '', J(0,1)],
    ['新車価格', sp&&sp.price?yen(sp.price)+'円':'—', car.base&&sp&&sp.price?'いまの車両価格は新車の '+Math.round(calc(baseCtx(car)).bodyIn/sp.price*100)+'%':'', J(0,1)],
  ];
  const ng = rows.filter(r=>r[3].includes('ngc')).length;
  return `<div class="q-why" style="margin-bottom:6px">型式DB（グーのカタログ）と、左の車両情報（＝車のカード）を並べています。⚠ は食い違い。カード作成のときの入れ間違いを、ここで目で確かめます。</div>
    ${ng?`<div class="q-note warn" style="margin-bottom:8px">${I('warn','⚠',14)} 食い違いが ${ng} か所あります。左の車両情報を確かめてください。</div>`:`<div class="q-note ok" style="margin-bottom:8px">${I('check','✓',14)} 確かめられる項目は、カタログと合っています。</div>`}
    ${w?`<div class="nc-warn" style="margin-bottom:6px">⚠ ${w}</div>`:''}
    <table class="q-chk"><tr><th>項目</th><th>カタログ（型式DB）</th><th>入れた値</th><th></th></tr>
    ${rows.map(r=>`<tr><td>${r[0]}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td>${r[3]}</tr>`).join('')}</table>
    ${sp?'':`<div class="q-sec">このモデルのグレード（${car.firstReg?car.firstReg.replace('-','/')+' までに発売':'全部'}）</div><div class="nc-chips">${G.list.map(x=>`<button type="button" class="nc-chip" onclick="setCar('grade','${jsq(x.g)}')">${esc(x.g)}<small>${esc(x.drive)}・${x.price?mk(Math.round(x.price/1000))+'万':''}</small></button>`).join('')}</div>`}
    <div class="q-sec">標準装備</div>
    <div class="q-why">カタログの標準装備はまだ取っていません（グーのグレード詳細ページから取る予定）。取れたら、カードの装備品チェックの結果と並べて「標準なのにチェックが無い」所を出します。</div>`;
}
/* 🗣 2026-10-23「小売りの方は保証有の店から合わせていかないと」「車両価格としてがっつり組ませて高いか安いかを見たい」→「とりあえずやってみて」
   ＝保証・整備付きの店（ライバル店DB の C1＝うちと同じ層）の掲載と、支払総額どうしで比べる（よその店は整備・保証を本体に入れ、うちは諸費用・パックに入れる＝総額なら差が消える）。
   車両価格どうしは参考。値は quote-data.js c1Of（相場ビューと同じ計算）。金額は千円・税込 */
/* C1 の中のどこにいるか（my・c は千円・税込の総額）。cls＝札の色・lab＝札・short＝一覧の短い札・pct＝C1 の真ん中に対する% */
function c1Judge(my, c){ const [cls, lab, short] = my < c.p25 ? ['great','安い方（下位25%より安い）','安い方'] : my <= c.total ? ['good','安め','安め'] : my <= c.p75 ? ['fair','高め','高め'] : ['high','高い方（上位25%より高い）','高い方'];
  return { cls, lab, short, pct: Math.round(my/c.total*100) }; }
/* ---------- 値付けの段（v4.2.0）
   🗣 2026-10-23「バーは2本出しておいて」「2本今までのように並べる・どっちのバーもドラッグできる・ドラッグすると連動」
   「売れそうな金額はバーの位置を変えるに使って」「総額や本体・粗利はクリックすると手打ち or 上下ボタンで変えられるように（ちょうどが難しいから）」
   「ボックス表示は要らない。そのままの感じで」→「この見本の形で本番に入れて」
   見本＝_記録\モック\モック_2026-10-23_相場の列_C1元の売れそうな金額.html
   ・上のバー＝保証・整備付きの店（C1）と支払総額（下位25%・真ん中・上位25% を 25・50・75% の所）／下のバー＝全部の店と車両価格（今までの相場比 50＋(比−1)×500）
   ・どちらの線も動かせて、本体の値が1つ決まり、もう片方の線も動く。動かしただけでは保存しない＝「この値にする」で priceAsk（確認の窓 → 値付けの履歴）
   ・総額から本体は、本物の見積の計算（calc）で逆算＝消費税の端数も合う ---------- */
let VP = null, VPD = null;   // VP＝動かし中の値 { id, price }（描き直しても残す。別の車では使わない）／VPD＝ドラッグ中
const vpCar = () => VP && carOf(VP.id);
const vpPrice = car => VP && VP.id===car.id ? VP.price : car.base.price;
const vpAt = (car, p) => calc(Object.assign({}, baseCtx(car), { b: Object.assign({}, car.base, { price: p }) }));
/* 支払総額 T（円）になる一番安い本体（1円単位）。総額は本体に対してまっすぐ（1円 → 約1.1円）なので、傾きで当たりを付けて前後を詰める */
function vpSolveT(car, T){ const p0 = car.base.price, c0 = vpAt(car, p0).cash, sl = (vpAt(car, p0+100000).cash - c0)/100000 || 1.1;
  let p = Math.max(0, Math.ceil(p0 + (T - c0)/sl)), n = 0;
  while (n++ < 40 && p > 0 && vpAt(car, p-1).cash >= T) p--;
  while (n++ < 80 && vpAt(car, p).cash < T) p++;
  return p; }
/* 上のバー（千円・税込の総額 ↔ 位置%） */
const vp1 = (c, t) => { const L = Math.max(1, c.total-c.p25), R = Math.max(1, c.p75-c.total); return t<=c.p25 ? 25-(c.p25-t)/L*25 : t<=c.total ? 25+(t-c.p25)/L*25 : t<=c.p75 ? 50+(t-c.total)/R*25 : 75+(t-c.p75)/R*25; };
const vp1i = (c, x) => { const L = Math.max(1, c.total-c.p25), R = Math.max(1, c.p75-c.total); return x<=25 ? c.p25-(25-x)/25*L : x<=50 ? c.p25+(x-25)/25*L : x<=75 ? c.total+(x-50)/25*R : c.p75+(x-75)/25*R; };
/* 下のバー（相場比 ↔ 位置%）。相場比は今までどおり 車両価格（税込）÷ 小売の成約の相場 */
const vp2 = r => 50 + (r-1)*500, vp2i = x => 1 + (x-50)/500;
const vpClip = x => Math.max(1, Math.min(99, x));
/* この本体の値での数字一式 */
function vpState(car, p){ const sb = sobaOf(car), c = sb.c1, k = vpAt(car, p), t = k.cash/1000, ratio = k.bodyIn/1000/sb.now;
  const d = c ? (t/c.total-1)*100 : (ratio-1)*100;
  const j1 = c ? c1Judge(t, c) : null, dd = c ? t - c.total : 0;
  const j2 = ratio > 1.15 ? ['warn', '全部の店より +'+Math.round((ratio-1)*100)+'%'] : ratioLabel(ratio);
  return { p, k, t, ratio, days: sobaDays(sb, Math.round(d*10)/10), gross: p - costOf(car.base), j1, dd, j2,
    x1: c ? vp1(c, t) : null, x2: vp2(ratio), pct1: c ? Math.round(t/c.total*100) : null }; }
/* 動かした時は描き直さずに、線・数字・札だけ書き換える */
function vpPaint(){ const car = vpCar(); if (!car || !$('vp-total')) return; const s = vpState(car, VP.price), c = sobaOf(car).c1, man = v => mk(v)+'万';
  const tx = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  tx('vp-total', man(s.t)); tx('vp-body', man(s.p/1000)); tx('vp-gross', yen(s.gross)); tx('vp-days', '約'+s.days+'日');
  const kn = (id, x) => { const e = $(id); if (e){ e.style.left = vpClip(x)+'%'; e.classList.toggle('edge', x<1 || x>99); } };
  if (c){ kn('vp-k1', s.x1); const p1 = $('vp-p1'); p1.className = 'q-pill '+s.j1.cls; p1.textContent = s.j1.short;
    tx('vp-t1', '真ん中より '+(s.dd>=0?'+':'−')+man(Math.abs(s.dd))+'（'+s.pct1+'%）');
    tx('vp-ctot', man(s.t)); tx('vp-cbody', man(s.k.bodyIn/1000)); tx('vp-cfee', man(s.t - s.k.bodyIn/1000)); }
  kn('vp-k2', s.x2); const p2 = $('vp-p2'); p2.className = 'q-pill '+s.j2[0]; p2.textContent = s.j2[1];
  tx('vp-t2', '相場 '+man(mktEx(car, sobaOf(car).now))+' の '+Math.round(s.ratio*100)+'%');
  const set = $('vp-set'); if (set) set.disabled = VP.price === car.base.price;
  document.querySelectorAll('.q-sugg .o[data-p]').forEach(o=>o.classList.toggle('on', +o.dataset.p === VP.price));
  ['total','body','gross'].forEach(k=>{ const i = $('vp-i-'+k); if (i && !i.hidden && document.activeElement !== i) i.value = yen(vpVal(k)); }); }
function vpSet(p, exact){ const car = vpCar(); if (!car) return; p = Math.max(1000, Math.min(99999000, p)); VP.price = exact ? Math.round(p) : Math.round(p/1000)*1000; vpPaint(); }
/* ドラッグ（バーのどこを押しても線がそこへ。もう片方のバーも連動） */
function vpDown(e, bar){ if (e.button) return; e.preventDefault(); VPD = { el: e.currentTarget, bar }; try { VPD.el.setPointerCapture(e.pointerId); } catch(_){}
  vpFromX(e); const kn = $('vp-k'+bar); if (kn) kn.focus({ preventScroll: true }); }
function vpFromX(e){ const car = vpCar(); if (!car || !VPD) return; const r = VPD.el.getBoundingClientRect(), x = (e.clientX - r.left)/r.width*100, sb = sobaOf(car);
  if (VPD.bar === 1) vpSet(vpSolveT(car, vp1i(sb.c1, x)*1000));
  else vpSet(vp2i(x)*sb.now*1000/1.1 - seibiOf(car.base)); }
document.addEventListener('pointermove', e=>{ if (VPD) vpFromX(e); });
document.addEventListener('pointerup', ()=>{ VPD = null; });
function vpKey(e){ if (e.key!=='ArrowLeft' && e.key!=='ArrowRight') return; e.preventDefault(); vpSet(VP.price + (e.key==='ArrowRight'?1:-1)*(e.shiftKey?10000:1000), true); }
/* 総額・本体・粗利：押すとその場で入力欄（1円まで）・▲▼／↑↓ で ±1,000円（Shift で ±1万）。Enter・離れたら決まる／Esc でやめる */
function vpVal(k){ const car = vpCar(); return k==='total' ? vpAt(car, VP.price).cash : k==='body' ? VP.price : VP.price - costOf(car.base); }
function vpTo(k, v){ const car = vpCar(); return k==='total' ? vpSolveT(car, v) : k==='body' ? v : v + costOf(car.base); }
function vpFit(i){ i.style.width = (String(i.value).length + 0.6)+'ch'; }
function vpEdit(k){ const b = $('vp-'+k), i = $('vp-i-'+k); if (!b || !i) return; i.value = yen(vpVal(k)); vpFit(i); b.hidden = true; i.hidden = false; b.parentNode.classList.add('editing'); i.focus(); i.select(); }
function vpApply(k){ const i = $('vp-i-'+k), v = +String(i.value).replace(/[^\d-]/g,''); if (String(i.value).trim()!=='' && isFinite(v) && v > 0) vpSet(vpTo(k, v), true); }
function vpClose(k, ok){ const b = $('vp-'+k), i = $('vp-i-'+k); if (!i || i.hidden) return; if (ok) vpApply(k); i.hidden = true; b.hidden = false; b.parentNode.classList.remove('editing'); vpPaint(); }
function vpInKey(e, k){ if (e.key==='Enter'){ e.preventDefault(); vpClose(k, true); $('vp-'+k).focus(); }
  else if (e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); vpClose(k, false); $('vp-'+k).focus(); }
  else if (e.key==='ArrowUp' || e.key==='ArrowDown'){ e.preventDefault(); vpStep(k, e.key==='ArrowUp'?1:-1, e); } }
function vpStep(k, d, e){ const i = $('vp-i-'+k); if (i && !i.hidden) vpApply(k); vpSet(vpTo(k, vpVal(k) + d*(e && e.shiftKey ? 10000 : 1000)), true);
  if (i && !i.hidden){ i.value = yen(vpVal(k)); vpFit(i); } }
function vpReset(){ const car = vpCar(); if (car) vpSet(car.base.price, true); }
function vpCommit(){ const car = vpCar(); if (car && VP.price !== car.base.price) priceAsk(car.id, VP.price, '値付け（相場の列）'); }
function vpEd(k, lab, val){ return `<span class="ed"><span class="lb">${lab}</span><b id="vp-${k}" tabindex="0" title="押すと手打ち" onclick="vpEdit('${k}')" onkeydown="if(event.key==='Enter'){event.preventDefault();vpEdit('${k}')}">${val}</b><input id="vp-i-${k}" inputmode="numeric" hidden onkeydown="vpInKey(event,'${k}')" onblur="vpClose('${k}',true)" oninput="vpFit(this)"><span class="st"><button type="button" tabindex="-1" title="+1,000円（Shift で +1万）" onmousedown="event.preventDefault()" onclick="vpStep('${k}',1,event)">▲</button><button type="button" tabindex="-1" title="−1,000円（Shift で −1万）" onmousedown="event.preventDefault()" onclick="vpStep('${k}',-1,event)">▼</button></span></span>`; }
const vpTick = (x, t) => `<span class="t" style="left:${x}%"></span><span class="l" style="left:${x}%">${t}</span>`;
/* 値付けの段（基本価格がある車）。c＝C1（無い車は下のバーだけ） */
function vpBlock(car, sb, days){ const c = sb.c1, base = car.base;
  if (!VP || VP.id !== car.id || VP.base !== base.price) VP = { id: car.id, price: base.price, base: base.price };   // 別の車・保存された値が変わった（OK・よその端末）時は、動かし中の値を捨てる
  const s = vpState(car, VP.price), s0 = vpState(car, base.price), man = v => mk(v)+'万', exS = mktEx(car, sb.now);
  const why = (c ? `<b>上のバー＝保証・整備付きの店（C1）</b>：一般店で保証あり＋法定整備付（うちと同じ層）。${c.n}台・保証あり ${c.warr!=null?Math.round(c.warr)+'%':'—'}${c.warrM?'・保証 '+c.warrM+'か月':''}・法定整備付 ${c.seibi!=null?Math.round(c.seibi)+'%':'—'}${c.days?'・掲載 '+c.days+'日':''}。
    この車の相場（グレード・年式・走行・色）× C1 の店の倍率 ${c.ratio.toFixed(3)}${c.age?'（'+c.age+'・'+c.nAge+'台）':''}。ライバル店DB ${esc(c.built)} の<b>掲載の値</b>（売れた値ではない）。
    よその店は整備・保証を車両価格に入れ、うちは諸費用・パックに入れる＝<b>支払総額どうし</b>で比べる。<br>` : `<b>保証・整備付きの店（C1）の値がありません</b>（ライバル店DB にこの車種が無い）。<br>`)
    + `<b>下のバー＝全部の店</b>：格安・現状販売の店も含む小売の成約と、車両価格（税込）どうし。保証・整備付きの店より安く出るのがふつう。全部の店より +15% を超えると札が黄色。<br>
    線はどちらもドラッグでき、もう片方も連動（← → で 1,000円・Shift で 1万円）。点線＝いま保存されている値。<br>
    ちょうどの値は、総額・本体・粗利の数字を押すと手打ち（▲▼ で ±1,000円）。動かしただけでは保存しない＝「この値にする」で確認の窓 → 値付けの履歴に残る。`;
  const bar1 = c ? `<div class="q-vlab">保証・整備付きの店と <span class="q-sub">支払総額・税込</span><span class="q-pill ${s.j1.cls}" id="vp-p1">${s.j1.short}</span><span class="q-sub" id="vp-t1">真ん中より ${s.dd>=0?'+':'−'}${man(Math.abs(s.dd))}（${s.pct1}%）</span></div>
    <div class="q-vtrack" onpointerdown="vpDown(event,1)"><div class="q-vbar"></div>${vpTick(25, man(c.p25))}${vpTick(50, '真ん中 '+man(c.total))}${vpTick(75, man(c.p75))}
      <div class="q-vghost" style="left:${vpClip(s0.x1)}%" title="いま保存されている値"></div><div class="q-vknob${s.x1<1||s.x1>99?' edge':''}" id="vp-k1" tabindex="0" role="slider" aria-label="支払総額" style="left:${vpClip(s.x1)}%" onkeydown="vpKey(event)"><i></i></div></div>` : '';
  const bar2 = `<div class="q-vlab">全部の店と <span class="q-sub">車両価格・税込の相場比</span><span class="q-pill ${s.j2[0]}" id="vp-p2">${s.j2[1]}</span><span class="q-sub" id="vp-t2">相場 ${man(exS)} の ${Math.round(s.ratio*100)}%</span></div>
    <div class="q-vtrack" onpointerdown="vpDown(event,2)"><div class="q-vbar"></div>${[[-5,'−5%'],[-2,'−2%'],[0,'相場 '+man(exS)],[3,'+3%'],[8,'+8%']].map(([d,t])=>vpTick(vp2(1+d/100), t)).join('')}
      <div class="q-vghost" style="left:${vpClip(s0.x2)}%" title="いま保存されている値"></div><div class="q-vknob${s.x2<1||s.x2>99?' edge':''}" id="vp-k2" tabindex="0" role="slider" aria-label="車両価格" style="left:${vpClip(s.x2)}%" onkeydown="vpKey(event)"><i></i></div></div>`;
  return `<div class="q-c1" style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin:8px 0;background:var(--bg2)">
    <div class="q-sh" style="margin:0 0 4px;font-size:13px">値付け <span class="q-sub">2本のバーで比べる</span>${info(why)}<span style="margin-left:auto;display:flex;gap:6px;font-weight:400"><button class="q-btn sm" onclick="vpReset()">元に戻す</button><button class="q-btn sm pri" id="vp-set" onclick="vpCommit()"${VP.price===base.price?' disabled':''}>この値にする</button></span></div>
    <div class="q-vread">${vpEd('total','総額',man(s.t))}${vpEd('body','本体',man(s.p/1000))}${vpEd('gross','粗利',yen(s.gross))}<span class="ro"><span class="lb">売れるまで</span><b id="vp-days">約${s.days}日</b></span></div>
    ${c ? '' : `<div class="q-note warn" style="margin:0 0 8px">${I('warn','⚠',14)} 保証・整備付きの店（C1）の値がありません（ライバル店DB にこの車種が無い）。全部の店の相場だけで見ています。</div>`}
    ${bar1}${bar2}
    ${c ? `<table class="q-tbl" style="margin-top:2px"><tr><th>税込</th><th class="v">C1</th><th class="v">自社</th></tr>
      <tr><td>支払総額</td><td class="v"><b>${man(c.total)}</b></td><td class="v"><b id="vp-ctot">${man(s.t)}</b></td></tr>
      <tr><td>車両価格（参考）</td><td class="v">${man(c.body)}</td><td class="v" id="vp-cbody">${man(s.k.bodyIn/1000)}</td></tr>
      <tr><td>諸費用（参考）</td><td class="v">${c.fees!=null?man(c.fees):'—'}</td><td class="v" id="vp-cfee">${man(s.t - s.k.bodyIn/1000)}</td></tr></table>` : ''}
    ${vpSugg(car, sb)}
    <div class="q-why" style="margin-top:6px">在庫 ${days}日目${days>=240?'（<b>8か月＝業販かAAに戻す時期</b>）':days>=120?'（<b>4か月＝値付けを見直す時期</b>）':''}</div></div>`; }
/* 売れそうな金額：C1 の総額の真ん中 ±2%（C1 が無い車は全部の店の相場 ±2%）。箱は線をその値に動かすだけ（保存は「この値にする」） */
function vpSugg(car, sb){ const c = sb.c1, man = v => mk(v)+'万', sK = seibiOf(car.base)/1000;
  const box = [[-2,'早く売る'],[0,'相場どおり'],[2,'粘る']].map(([d,l])=>{
    const p = c ? Math.round(vpSolveT(car, c.total*1000*(1+d/100))/1000)*1000 : Math.round(sb.now/1.1*(1+d/100) - sK)*1000, k = vpAt(car, p);
    return `<div class="o${d===0?' mid':''}${p===VP.price?' on':''}" data-p="${p}" onclick="vpSet(${p})"><div class="s">${l}${d?'（'+(d>0?'+':'−')+Math.abs(d)+'%）':''}</div><b>${man(k.cash/1000)}</b><div class="bd">本体 ${man(p/1000)} <small>税抜</small></div><div class="s">約${sobaDays(sb, d)}日・粗利 ${yen(p - costOf(car.base))}</div></div>`; }).join('');
  return `<div class="q-sh">売れそうな金額 <span class="q-sub">${c ? '保証・整備付きの店の真ん中から・支払総額' : ''}</span>${c ? '' : '<span class="q-pill warn">C1 なし・全部の店から</span>'}${info(c ? `保証・整備付きの店（C1）の支払総額の真ん中 ${man(c.total)} を「相場どおり」として ±2%。本体（税抜）は、その支払総額になる値を見積の計算で逆算。<br>押すと上の線がその値に動く（まだ保存しない）。「この値にする」で確認の窓 → 値付けの履歴に残る。<br>日数は相場カードの「売れるまでの日数」を、C1 の真ん中＝ふつう として当てた目安。` : `全部の店の小売の成約の相場（本体に直した値）を「相場どおり」として ±2%。押すと上の線がその値に動く（まだ保存しない）。`)}</div>
    <div class="q-sugg">${box}</div>`; }
function sobaPanel(car,k){
  if (!sobaOf(car) && sobaWait(car)) return `<div class="q-note info">${I('info','ℹ',15)} 相場を読み込み中…（相場ビューと同じ相場カードから、この車の条件で出しています）</div>`;
  if (!sobaOf(car)){ const L = katLookup(car.fmodel, car.firstReg, car.maker), nm = L.state==='ok' ? (L.names.find(n=>n.car===car.model) || L.names[0]) : null, G = nm ? katGrades(nm, L.y, car.firstReg).list.find(x=>x.g===car.grade) : null;
    return `<div class="q-note warn">${I('warn','⚠',15)} <b>相場なし</b>：${esc(car._sbWhy||'この車種は相場カードがまだありません')}。<br><span class="q-why">カードの車種・グレード・年式（初度登録）の名前で相場DB の車種を探しています。違う時は「相場ビューで見る」で相場カードを選び直すと、ここにも出ます（このブラウザに覚えます）。</span></div>
      <button class="q-btn sm" style="margin:0 0 8px" onclick="svFromQuote('${car.id}')">${I('signal','📶',13)} 相場ビューで見る</button>
      <table class="q-tbl"><tr><th>型式DB（グーのカタログ）</th><th></th></tr>
      <tr><td>車名</td><td>${nm?esc(nm.mk+' '+nm.car):'見つかりません'}</td></tr><tr><td>発売</td><td>${nm?esc(nm.first)+'〜'+esc(nm.last):'—'}</td></tr>
      <tr><td>新車価格</td><td>${G&&G.price?yen(G.price)+'円':'グレードを選ぶと出ます'}</td></tr><tr><td>いまの価格は新車の</td><td>${G&&G.price&&k.bodyIn?Math.round(k.bodyIn/G.price*100)+'%':'—'}</td></tr></table>`; }
  /* 🗣 2026-10-19「本体価格か、総額か、税抜きか税込みかを明確に。本体の税抜きに揃えたい」＝相場カードの数字は「車両本体（税抜）」に直して出す（ex）。
     値付けの段（v4.2.0）は 上＝支払総額（税込）／下＝今までの相場比（車両価格どうし＝一覧・値付けの履歴と同じ%） */
  const sb = sobaOf(car), days = daysBetween(car.buyDate, TODAY);
  const sK = seibiOf(car.base)/1000, ex = v => mktEx(car, v);   // 千円：小売の相場（車両価格・税込）→ 本体（税抜）
  const myEx = car.base ? car.base.price/1000 : 0;
  /* v4.1.4 ふだん見せるのは 車名・年式・信頼度だけ。グレード・色・走行・データ日・外れの目安・出し方は ⓘ */
  const tc = /^A/.test(sb.trust) ? 'good' : /^B/.test(sb.trust) ? 'fair' : 'warn';
  const cardWhy = `<b>相場カード</b>：${esc(sb.cardName)} ${sb.y}年・${sb.g!=null?esc(sb.g):'グレード指定なし'}${sb.col?'・'+esc(sb.col):''}${sb.km!=null?'・'+(sb.km/10).toFixed(1)+'万km':''}<br>
    データ ${esc(sb.built||'—')}・信頼度 ${esc(sb.trust)}${sb.pct!=null?'（外れの目安 ±'+sb.pct+'%）':''}<br>
    相場ビューと同じ相場カード（相場DB の受け渡し）を、この車の条件（年式・グレード・走行・色）で出した値。グラフはこの条件の今の値に合わせて伸縮。売れるまでの日数は、相場カードの「売れるまでの日数」をもとにした目安。`;
  /* 基本価格がまだの車：比べる自社の値が無い＝線は出さず、C1 と全部の店の相場だけ。売れそうな金額（全部の店から）は押すと「基本価格を作る」の欄に入る */
  const noBase = () => { const c = sb.c1, man = v => mk(v)+'万';
    const sugg = [[-2,'早く売る'],[0,'相場どおり'],[2,'粘る']].map(([d,l])=>{ const p = Math.round(sb.now/1.1*(1+d/100) - sK)*1000;
      return `<div class="o" onclick="$('nb-price').value=yen(${p});toast('車両本体価格（税抜）に入れました。「基本価格を作る」で確定')"><div class="s">${l}（相場${d>0?'+':''}${d}%）</div><b>${mk(p/1000)}万</b><div class="s">税込 ${mk(p/1000*1.1)}万</div><div class="s">約${sobaDays(sb,d)}日</div></div>`; }).join('');
    return `<div class="q-note info" style="margin:8px 0">${I('info','ℹ',14)} まだ基本価格がありません。基本価格を作ると、ここに値付けのバー（保証・整備付きの店と・全部の店と）が出ます。</div>
      ${c ? `<div class="q-why">保証・整備付きの店（C1）の支払総額の真ん中 <b>${man(c.total)}</b>（${man(c.p25)}〜${man(c.p75)}）</div>` : ''}
      <div class="q-why">全部の店の相場（本体・税抜）<b>${man(ex(sb.now))}</b></div>
      <div class="q-sh">売れそうな金額 <span class="q-sub">車両本体・税抜・全部の店から</span>${info('押すと「基本価格を作る」の車両本体価格（税抜）に入ります。基本価格ができたら、保証・整備付きの店の支払総額から出し直します。')}</div>
      <div class="q-sugg">${sugg}</div>`; };
  return `<button class="q-btn sm" style="float:right;margin-left:8px" onclick="svFromQuote('${car.id}')" title="カード詳細の［相場］タブと同じ画面（相場カードの選び直しもここで）">${I('signal','📶',13)} 相場ビューで見る</button>
    <div class="q-sh" style="margin:2px 0 4px;font-weight:400;font-size:12px;color:var(--text2)">${esc(sb.cardName)} ${sb.y}年 <span class="q-pill ${tc}" title="相場の信頼度">信頼度 ${esc(sb.trust)}</span>${info(cardWhy)}${car._firstRegGuess?'<span class="q-pill warn">年式は CarFlow の年式から（初度登録を入れると正確に）</span>':''}</div>
    ${car.base ? vpBlock(car, sb, days) : noBase()}
    <div class="q-sh">相場の動き（13か月） <span class="q-sub">小売 ${sb.slope}%/月・AA ${sb.slopeAA.toFixed(1)}%/月</span></div>
    ${chart(car, sb, myEx, ex)}
    <table class="q-tbl" style="margin-top:8px"><tr><th>相場カードの数字（万・税抜）${info('小売は成約・掲載の車両価格（税込）を本体（税抜）に直した値。AA は落札額（税抜）のまま。「生の真ん中」は条件を当てる前の、その年式の全グレードの真ん中。')}</th><th class="v">真ん中</th><th>件数など</th></tr>
      <tr><td>小売 掲載中（本体）</td><td class="v">${mk(ex(sb.stock))}</td><td>在庫 ${sb.days}日・90日超 ${sb.old90}%・${sb.nStock}台</td></tr>
      <tr><td>小売 新着（20日以内・本体）</td><td class="v">${mk(ex(sb.fresh))}</td><td></td></tr>
      <tr><td>小売 成約・この車の条件（本体）</td><td class="v"><b>${mk(ex(sb.now))}</b></td><td>年式・グレード・走行・色で当てた値</td></tr>
      <tr><td>　生の真ん中 1年／直近3か月（本体）</td><td class="v">${sb.rawSold12?mk(ex(sb.rawSold12)):'—'}／${sb.rawSold3?mk(ex(sb.rawSold3)):'—'}</td><td>${sb.y}年式の全グレード・${sb.nSold}台</td></tr>
      <tr><td>AA 落札・この車の条件</td><td class="v"><b>${mk(sb.aaNow)}</b></td><td>評価点4・内装Bとして</td></tr>
      <tr><td>　生の真ん中 13か月／直近2か月・ASNET 4週</td><td class="v">${sb.rawAA13?mk(sb.rawAA13):'—'}／${sb.rawAA2?mk(sb.rawAA2):'—'}・${sb.asnet?mk(sb.asnet):'—'}</td><td>${sb.y}年式の全グレード・${sb.nAA}台</td></tr>
      <tr><td>4か月後の見込み 小売（本体）／AA</td><td class="v">${mk(ex(sb.in4rt))}／${mk(sb.in4aa)}</td><td>今の動きが続いたら</td></tr></table>`;
}
/* 🗣 2026-10-19 全部「税抜」：小売の線は本体（税抜）に直す（ex＝sobaPanel の換算）・自社は車両本体（税抜）・AA は落札額（税抜）のまま */
function chart(car, sb, my, ex){
  const W=560, H=200, L=40, R=12, T=10, B=26, n = sb.m.length + 4, last = sb.m.length-1;
  const hs = car.base ? car.base.hist : [];   // sb は sobaPanel で null を外してから来る
  const hv = hs.map(x=>x.to/1000);
  sb = Object.assign({}, sb, { series: sb.series.map(ex), in4rt: ex(sb.in4rt) });
  const all = sb.series.concat(sb.aa, [sb.in4rt, sb.in4aa, my], hv);
  const lo = Math.floor(Math.min(...all)/100)*100-50, hi = Math.ceil(Math.max(...all)/100)*100+50;
  const x = i => L + (W-L-R)*i/(n-1), y = v => T + (H-T-B)*(1-(v-lo)/(hi-lo));
  const path = arr => arr.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
  let g = ''; const step = (hi-lo)>1200?200:100;
  for (let v=Math.ceil(lo/step)*step; v<=hi; v+=step){ g += `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" opacity=".12"/><text x="${L-4}" y="${y(v)+3}" font-size="9" text-anchor="end" fill="currentColor" opacity=".6">${v/10|0}</text>`; }
  sb.m.forEach((m,i)=>{ if (i%3===0||i===last) g += `<text x="${x(i)}" y="${H-8}" font-size="9" text-anchor="middle" fill="currentColor" opacity=".6">${m}</text>`; });
  g += `<text x="${x(n-1)}" y="${H-8}" font-size="9" text-anchor="middle" fill="currentColor" opacity=".6">4か月後</text>`;
  g += `<path d="${path(sb.series)}" fill="none" stroke="#22c55e" stroke-width="2.2"/><path d="${path(sb.aa)}" fill="none" stroke="#a855f7" stroke-width="2.2"/>`;
  g += `<path d="M${x(last)} ${y(sb.series[last])} L${x(n-1)} ${y(sb.in4rt)}" stroke="#22c55e" stroke-dasharray="4 4" stroke-width="2" fill="none"/><path d="M${x(last)} ${y(sb.aa[last])} L${x(n-1)} ${y(sb.in4aa)}" stroke="#a855f7" stroke-dasharray="4 4" stroke-width="2" fill="none"/>`;
  const mIdx = d => { const {y:yy,m:mm} = ym(d.slice(0,7)); return (yy-2025)*12 + (mm-9); };
  let pts = ''; hs.forEach((h2,i)=>{ const xi = Math.max(0,Math.min(last,mIdx(h2.date))); const nx = i<hs.length-1 ? Math.max(0,Math.min(last,mIdx(hs[i+1].date))) : last; pts += `${i?'L':'M'}${x(xi)} ${y(hv[i])} L${x(nx)} ${y(hv[i])} `; });
  g += `<path d="${pts}" stroke="#0ea5e9" stroke-width="2.6" fill="none"/><circle cx="${x(last)}" cy="${y(my)}" r="4.5" fill="#0ea5e9"/><circle cx="${x(last)}" cy="${y(sb.series[last])}" r="3.5" fill="#22c55e"/><circle cx="${x(last)}" cy="${y(sb.aa[last])}" r="3.5" fill="#a855f7"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;color:var(--text)">${g}</svg><div style="display:flex;gap:14px;font-size:11px;color:var(--text2);flex-wrap:wrap"><span><b style="color:#22c55e">━</b> 小売 成約（本体に直した値）</span><span><b style="color:#a855f7">━</b> AA 落札</span><span><b style="color:#0ea5e9">━</b> 自社の車両本体（値付けの履歴）</span><span>┅ 4か月後の見込み</span><span>単位：万円・税抜</span></div>`;
}
function syncPanel(car,k){
  const b = car.base, rows = [['車両価格（税込）', k.bodyIn],['諸費用', k.cash-k.bodyIn],['支払総額', k.cash]];
  const done = s => !b.changed ? !!b.portalDone[s] : (b.portalDone[s]||'') >= b.changed;
  return `<div style="font-weight:800;margin-bottom:6px">カードの金額表示 <span class="q-pill good">自動</span></div>
    <div class="q-copy"><span>総額（税込）</span><span class="v">${yen(k.cash)}</span><span></span><span>本体（税込）</span><span class="v">${yen(k.bodyIn)}</span><span></span></div>
    <div class="q-why" style="margin-top:4px">カンバンのカード・展示・商談ビュー・FlowDesk・FlowGo の金額はここから（車両カードの金額入力は廃止の想定）</div>
    ${[['goo','グーネット（MOTOR GATE）'],['cs','カーセンサー（C-MATCH）']].map(([id,nm])=>`<div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><b>${nm}</b>${done(id)?'<span class="q-pill good">そろっている</span>':'<span class="q-pill warn">未反映の変更あり</span>'}<span class="q-why" style="margin:0 0 0 auto">最後に反映 ${jd(b.portalDone[id])}</span></div>
      <div class="q-copy">${rows.map(([l,v])=>`<span>${l}</span><span class="v">${yen(v)}</span><button class="q-btn sm" onclick="copyText('${v}')">写す</button>`).join('')}
        <span>法定整備</span><span class="v">付（${esc(seibiInfo(b).name)}）</span><span></span><span>保証</span><span class="v">${warNone(b)?'なし':'付（'+esc(warText(b))+'）'}</span><span></span><span>リサイクル</span><span class="v">リ済込</span><span></span></div>
      <div style="margin-top:8px"><button class="q-btn ok sm" onclick="portalDone('${car.id}','${id}')">${I('check','✓',13)} 管理画面に入れた</button></div></div>`).join('')}
    <div class="q-why" style="margin-top:10px">公開 API が無いので「写す」→ 管理画面に貼る →「入れた」を押す運用。週1回のポータル点検でズレを拾う。</div>
    <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px"><b>プラン見積</b><div class="q-why">自動で追従：${PLANS.map(p=>p+' '+yen(calc(stdCtx(car,p)).cash)).join('／')}</div></div>`;
}

/* ---------- ② プラン見積（店のパックから自動。来店・問い合わせで渡す見積） ---------- */
/* 納車整備とパックの説明の行（PACK_HOLD の間は基本だけ） */
function tierNotes(){ return (PACK_HOLD ? S.set.seibi.tiers.slice(0,1) : S.set.seibi.tiers).map(x=>`<b>${esc(x.name)}</b> ${x.k==='L'?'車両価格に含む（既定 '+yen(x.price)+'円）':'＋'+yen(x.add)+'円'}${x.tbd?'（仮）':''}・保証 ${esc(x.war||'')}：${esc(x.note)}`).join('<br>'); }
/* 暫定の枠（🗣 2026-10-23「無くすなどではなく、グレーアウトにしてその上に付箋じゃないけど枠を置いて暫定処置」）。中身は灰色で押せない・設定は残す */
function packHold(inner, car, u){ if (!PACK_HOLD) return inner; const b = u ? u.baseSnap : car && car.base, L = tierOf('L');
  const seibi = b ? seibiOf(b) : L.price, war = b ? warText(b) : L.war;
  return `<div class="q-held"><div class="under" aria-hidden="true">${inner}</div><div class="q-heldnote"><div class="t"><span class="q-pill warn">暫定</span>スマートカーディーラーからの移行中</div>
    メンテナンスパックは使いません。どのプランも<br><b>${esc(L.name)} ${yen(seibi)}円（車両価格に含む）・保証 ${esc(war||'—')}</b>${b ? '' : '（既定）'}。<br><small>移行が済んだら、ここを戻してパックを使います。</small></div></div>`; }
function tierSeg(cur, on, dis){ return seg(cur && typeof cur === 'object' ? 'X' : cur, S.set.seibi.tiers.map(x=>[x.k, x.k==='L' ? 'なし（'+esc(x.name)+'のみ）' : esc(x.name.replace('メンテナンスパック',''))+' ＋'+(x.add/10000)+'万'+(x.tbd?'（仮）':'')]).concat([['X','カスタム']]), on, dis); }
/* カスタムの中身（ふだんは畳む）。sc＝'std'（プラン見積）／'cust'（個別見積） */
function tierXUI(sc, car, u, p, t, dis){ if (!t || typeof t !== 'object') return ''; const T = tierOf(t), id = `${sc}-${p}`, open = (S.ui.txOpen||{})[id], A = `'${sc}','${car.id}','${u?u.id:''}','${p}'`;
  return `<details class="q-tx" ${open?'open':''} ontoggle="(S.ui.txOpen=S.ui.txOpen||{})['${id}']=this.open"><summary>カスタム：<b>${esc(T.name||'（名前なし）')}</b>・${T.add?'＋'+yen(T.add)+'円':'追加料金なし'}・保証 ${esc(T.war || '基本価格の保証のまま（'+warText(u ? u.baseSnap : car.base)+'）')}</summary>
    <div class="f"><label>名前</label><input class="q-in" id="tx-n-${id}" value="${esc(T.name)}" placeholder="例：メンテナンスなし（新車保証の残り）" onchange="tierXSet(${A},'name',this.value)" ${dis?'disabled':''}>
      <label>金額（税抜）</label><div class="km-in">${money('tx-a-'+id, T.add, `tierXSet(${A},'add',parseYen(this.value),1)`, dis)}</div>
      <label>保証</label>${pickIn('txw-'+id, T.war, [['','基本価格の保証のまま']].concat(WAR_TPL.map(w=>[w,w])), v=>tierXSet(sc, car.id, u?u.id:'', p, 'war', v), `<input class="q-in" id="tx-w-${id}" style="width:200px" value="${esc(T.war)}" placeholder="例：6か月または6,000km" onchange="tierXSet(${A},'war',this.value.trim())" ${dis?'disabled':''}>`, dis)}
      <label>中身</label><textarea class="q-in" id="tx-t-${id}" placeholder="見積書に出る説明（例：走行 3,000km のため消耗品の交換は不要。メーカーの新車保証が 2027年3月まで残る）" onchange="tierXSet(${A},'note',this.value)" ${dis?'disabled':''}>${esc(T.note)}</textarea></div>
    <div class="q-why" style="margin:0 0 4px">金額は付属品・オプションの行に入る（0円なら行は出ない）。保証は見積書・注文書・プラン比較の保証に出る。</div></details>`; }
function tierHolder(sc, cid, uid){ const car = carOf(cid); if (sc==='std'){ car.std.tier = car.std.tier || {}; return car.std.tier; } const u = custOf(car, uid); u.tiers = u.tiers || {}; return u.tiers; }
function tierPick(sc, cid, uid, p, v){ snap(); const h = tierHolder(sc, cid, uid), car = carOf(cid);
  if (v === 'X'){ const cur = sc==='std' ? ((car.std.tier||{})[p] || S.set.packs.tier[p]) : h[p], T = tierOf(cur); if (!cur || typeof cur !== 'object') h[p] = { k:'X', name: T.k==='L' ? 'メンテナンス（カスタム）' : T.name+'（この車用）', add: packAdd(cur), war: T.k==='L' ? '' : (T.war||''), note: T.note||'' };
    S.ui.txOpen = S.ui.txOpen || {}; S.ui.txOpen[`${sc}-${p}`] = true; }
  else if (sc==='std' && v===S.set.packs.tier[p]) delete h[p]; else h[p] = v;
  save(); render(); }
function tierXSet(sc, cid, uid, p, k, v, soft){ const h = tierHolder(sc, cid, uid), t = h[p]; if (!t || typeof t !== 'object') return; if (!soft) snap(); t[k] = v; if (soft) renderKeep(); else { save(); renderSoon(); } }   // 確定のあと Tab で移った先にカーソルを残す
function planCard(p, k, kb, sel, rec, extra, no){
  return `<div class="q-plan ${sel?'on':''} ${p==='D'?'ws':''}" onclick="S.ui.plan='${p}';save();render()">
    ${no?`<div class="q-eno">No. ${esc(no)}</div>`:''}<div>${pb(p)}${rec?' <span class="q-pb rec" style="position:static">おすすめ</span>':''}</div>${k.tier?`<div style="margin-top:4px"><span class="q-tier ${tierOf(k.tier).tbd?'tbd':''}" style="margin-left:0">${esc(k.tier==='L'?tierOf('L').name+'のみ':tierOf(k.tier).name)}${tierOf(k.tier).tbd?'（仮）':''}</span></div>`:''}<div class="am">${yen(k.net)}</div>
    <div class="s">${p==='D'?'現状渡し・整備なし・保証なし・登録はお買い上げ側':'ベース ＋'+yen(k.cash-kb.cash)+(k.disc?'・値引 '+yen(k.disc):'')}${k.trade?'・下取 −'+yen(k.trade):''}</div>${k.loan?`<div class="s">月々 ${yen(k.loan.later)}（${k.loan.n}回・${k.loan.rate}%）</div>`:''}
    <ul>${p==='D'?'<li>車両のみ（リサイクル預託金込み）</li>':k.inPlan.map(x=>`<li>${esc(x.n)}</li>`).join('')||'<li>オプションなし</li>'}${p!=='D'&&planWar(k.tier)?`<li>保証 ${esc(planWar(k.tier))}</li>`:''}</ul>${extra||''}</div>`;
}
/* 基本見積（🗣 2026-10-02「基本の見積もりを4個に。基本見積・Aエントリー・Bスタンダード・Cプレミアム。基本見積は相手にしない＝提案はしないイメージ。
   プラン見積画面からはいじれない。何も付いていない素の状態をキープ」）＝基本価格そのまま（掲載の支払総額）。直す所は①基本価格だけ */
function baseCard(car, kb){
  return `<div class="q-plan base">
    <div class="q-eno">No. ${esc(estNo(car,'base'))}</div><div><span class="q-pb base">基本見積</span> <span class="q-cls in" style="margin-left:2px">提案しない</span></div>
    <div style="margin-top:4px"><span class="q-tier" style="margin-left:0">${esc(tierOf('L').name)}のみ・保証 ${esc(warText(car.base))}</span></div><div class="am">${yen(kb.net)}</div>
    <div class="s">掲載の支払総額・素の状態</div>
    <ul><li>オプションなし</li></ul>
    <div style="margin-top:8px;display:flex;gap:6px"><button class="q-btn sm" onclick="event.stopPropagation();S.ui.docBase=true;openDocs('quote')">${I('printer','🖨',13)} 見積書</button></div></div>`;
}
/* プラン見積の印刷：1種ずつ（🗣「上で切り替えて表示が変わるんじゃなくて、基本を印刷・A見積を印刷・B見積を…を並べる」） */
/* ---------- 追加選択（🗣 2026-10-16「デフォで選択しない物は選んで足す一覧に。増える恐れが多いから使いやすい形に」→「もっとシンプルに『追加選択』で、上とおんなじ感じで展開できた方がいい」）
   ＝どのプランにも入っていない品は、上の一覧の下の「追加選択」にたたむ。開くと上とまったく同じ行（金額・種類・A/B/C）で並ぶ。
     A/B/C を押すとそのプランに入って上へ上がる。上で A/B/C を全部外すと、ここへ戻る ---------- */
/* 🗣 2026-10-18「空行を挿入して自分でテキストも金額も決められる。追加選択をボタン化して、横に自由行」＝追加選択と自由行を横並びのボタンに */
function addSel(n, html, dis, freeJs){ const on = !!S.ui.addOpen;
  return `<div class="q-addbar"><button class="q-addsel ${on?'on':''}" onclick="S.ui.addOpen=${on?'false':'true'};save();render()"><i>${on?'▾':'▸'}</i>追加選択<span>${n}品</span><small>${on?'閉じる':'プランに入っていない品・よく足す物'}</small></button>${freeJs?`<button class="q-free" onclick="${freeJs}" ${dis?'disabled':''} title="品名も金額も自分で入れる行を、いま選んでいるプランに足す">${I('plus','＋',14)} 自由行</button>`:''}</div>${on?`<div class="q-addlist">${html||'<div class="q-why" style="padding:6px 2px">どの品もプランに入っています</div>'}</div>`:''}`; }
const qkRow = (n, sub, amt, btns) => `<div class="q-it op off"><span class="mv"></span><span class="nm"><b>${esc(n)}</b>${sub?`<span class="q-why" style="margin:0">${sub}</span>`:''}</span><span class="am">${amt}</span>${btns}<span></span></div>`;
const qkBtns = (ps, js, dis) => `<span class="q-pcs">${ps.map(p=>`<button class="q-pc ${p}" onclick="${js(p)}" ${dis?'disabled':''} title="プラン ${p} に入れる">${p}</button>`).join('')}</span>`;
/* プラン見積：外した品・取付の品のもう1行・よく足す物 */
function stdExtraRows(car, items, dis){ const R = [];
  S.set.packs.items.filter(q=>(car.std.hide||[]).includes(q.id||q.n)).forEach(q=>R.push(qkRow(q.n, 'この車から外した品', '', qkBtns(PLANS, p=>`stdUnhideTo('${car.id}','${jsq(q.id||q.n)}','${p}')`, dis))));
  items.filter(x=>x.labor && !x.dup && PLANS.some(p=>x.in[p])).forEach(x=>R.push(qkRow(x.base, 'もう1行（プランごとに機種を変える時）', '', `<span class="q-pcs"><button class="q-pc more" onclick="stdDup('${car.id}','${jsq(x.pkey)}')" ${dis?'disabled':''}>＋ もう1行</button></span>`)));
  S.set.quick.filter(([n])=>!(car.std.extra||[]).some(e=>e.n===n)).forEach(([n,a])=>R.push(qkRow(n, 'よく足す物（入れた後で金額を直せる）', `<b class="cat-a">${yen(a)}</b>`, qkBtns(PLANS, p=>`stdAddExtra('${car.id}','${jsq(n)}',${a},'${p}')`, dis))));
  return { n:R.length, html:R.join('') }; }
/* 個別見積：この方の見積にまだ無い店の品・よく足す物 */
function custExtraRows(car, u, opP, dis){ const R = [], names = new Set(u.items.map(x=>x.n));
  stdItems(car).filter(x=>!x.dup && !names.has(x.n)).forEach(x=>R.push(qkRow(x.base, x.vt==='size' ? (x.noSize ? 'サイズ未選択（プラン見積で選ぶ）' : 'サイズ '+x.vo[x.vi][0]) : '', x.noSize ? `<span class="q-why" style="margin:0">${OPT_TBD}</span>` : `<b class="cat-a">${yen(x.a)}</b>`, qkBtns(opP, p=>`custAddTpl('${car.id}','${u.id}','${jsq(x.key)}','${p}')`, dis))));
  S.set.quick.filter(([n])=>!names.has(n)).forEach(([n,a])=>R.push(qkRow(n, 'よく足す物', `<b class="cat-a">${yen(a)}</b>`, qkBtns(opP, p=>`custAdd('${car.id}','${u.id}','${jsq(n)}',${a},'${p}')`, dis))));
  return { n:R.length, html:R.join('') }; }
function stdPrint(p){ S.ui.docBase = p==='base'; if (p!=='base') S.ui.plan = p; save(); openDocs('quote'); }
function stepStd(car){ let RW;
  const kb = calc(baseCtx(car)), rec = car.std.rec || S.set.packs.rec, items = stdItems(car), dis = !!car.order, tiers = stdTiers(car), ps = plansOf(car.std.showD);
  let h = (car.order ? `<div class="q-note ok">${I('lock','🔒',14)} この車は売約済み（${esc(orderNo(car))}）なので、プラン見積は直せません（見るだけ）。直す時は ④売約 で売約を取り消します。</div>` : '') + `<div class="q-plans">${baseCard(car, kb)}${ps.map(p=>planCard(p, calc(stdCtx(car,p)), kb, S.ui.plan===p, rec===p, `<div style="margin-top:8px;display:flex;gap:6px"><button class="q-btn sm" onclick="event.stopPropagation();S.ui.plan='${p}';openDocs('quote')">${I('printer','🖨',13)} 見積書</button></div>`, estNo(car,p))).join('')}</div>`;
  h += `<div class="q-grid"><div>
    <div class="q-card"><h3>メンテナンスパック <span class="r">${PACK_HOLD ? 'いまは選べません（暫定）' : `プランごとに選ぶ（基本はこの車の${esc(tierOf('L').name)} ${yen(seibiOf(car.base))}・保証 ${esc(warText(car.base))}）`}</span></h3><div class="bd">
      ${packHold(`${PLANS.map(p=>`<div class="q-tierrow"><span>${pb(p)}</span><span>${tierSeg(PACK_HOLD ? 'L' : tiers[p], `tierPick('std','${car.id}','','${p}','$v')`, dis || PACK_HOLD)}${!PACK_HOLD&&car.std.tier&&car.std.tier[p]?' <span class="q-cls k">この車だけ</span>':''}</span>${PACK_HOLD ? '' : tierXUI('std', car, null, p, tiers[p], dis)}</div>`).join('')}
      <div class="q-why" style="margin-top:6px">${tierNotes()}</div>`, car)}</div></div>
    <div class="q-card"><h3>この車のプランの中身 <span class="r">ふだんは触らない（店のパックのまま）・必要な時だけ金額や並びを直す</span></h3><div class="bd">
    <div class="q-csz"><span class="k">ボディサイズ<br>（コーティング）${car.std.csize?'':'<span class="q-pill warn" style="display:block;margin-top:2px;text-align:center">未選択</span>'}</span>${SIZE_CLS.map(s=>`<button class="${car.std.csize===s?'on':''}" title="${esc(SIZE_EX[s]||'')}" onclick="stdCsize('${car.id}','${s}')" ${dis?'disabled':''}><b>${s}</b><small>${esc(SIZE_EX[s]||'')}</small></button>`).join('')}</div>
    ${(RW = want => items.map((x,i)=>stdUp(car, x)!==want ? '' : `<div class="q-it op ${want?'':'off'} ${want&&!dis?'dg':''}" data-dk="${esc(x.key)}" data-dkind="std" ${want&&!dis?dragAttrs(`'std','${car.id}'`):''}><span class="mv grip" title="ドラッグで並べ替え">⋮⋮</span>
      <span class="nm">${x.free?`<input id="s-fn-${esc(x.fid)}" class="q-in fn" value="${esc(x.n)}" placeholder="品名を入れる" onchange="stdFreeName('${car.id}','${jsq(x.fid)}',this.value)" ${dis?'disabled':''}>`:`<b>${esc(x.base)}</b>`}${x.dup?' <span class="q-cls in">もう1つ</span>':''}${x.manual||x.bMan||x.lMan?' <span class="q-cls k">この車だけ</span>':''}${x.extra?` <span class="q-cls in" style="align-self:flex-start">${x.free?'自由行':'追加'}</span>`:''}
        ${x.labor?''
        :x.vt==='size'?(x.noSize?'<span class="q-pill warn" style="align-self:flex-start">サイズ未選択（上で選ぶ）</span>':`<span class="q-why" style="margin:0">サイズ ${esc(x.vo[x.vi][0])}：${yen(x.calcA)}</span>`):x.vt?`<select class="q-in vsel" onchange="stdVsel('${car.id}','${jsq(x.key)}',this.value)" ${dis?'disabled':''} title="${esc(x.vl||'')}">${x.vo.map((o,j)=>`<option value="${j}" ${j===x.vi?'selected':''}>${esc(x.vl||'')}：${esc(o[0])}　${yen((x.extra?0:(S.set.packs.items.find(q=>(q.id||q.n)===x.pkey)||{}).a||0)+o[1])}</option>`).join('')}</select>`:''}</span>
      <span class="am">${x.labor?`<span class="tot">計 <b>${yen(x.a)}</b></span>`:money('s-a-'+i, x.a, `stdAmt('${car.id}','${jsq(x.key)}',parseYen(this.value))`, dis)}${x.manual?`<button class="rs" title="テンプレの金額 ${yen(x.calcA)} に戻す" onclick="stdAmtReset('${car.id}','${jsq(x.key)}')">↺</button>`:''}</span>
      <span class="q-pcs">${PLANS.map(p=>`<button class="q-pc ${x.in[p]?'on':''} ${p}" onclick="stdToggle('${car.id}',${i},'${p}')" ${dis?'disabled':''}>${p}</button>`).join('')}</span>
      <span class="del">${want ? `<button class="q-del" title="この行を消す" onclick="stdDelAsk('${car.id}','${jsq(x.key)}')" ${dis?'disabled':''}>✕</button>` : ''}</span>${x.labor?`<div class="lbw"><div class="lbg">
          ${x.bo && !x.nobody?`<select class="q-in" onchange="stdBsel('${car.id}','${jsq(x.key)}',this.value)" ${dis?'disabled':''} title="商品（機種）">${x.bo.map((o,j)=>`<option value="${j}" ${j===x.bi?'selected':''}>${esc(o[0])}</option>`).join('')}</select>`:'<span class="q-why" style="margin:0;align-self:center">本体なし（持ち込み品）</span>'}
          ${x.nobody?'<span></span>':`<span class="mb">${money('s-b-'+i, x.bodyA, `stdAmtB('${car.id}','${jsq(x.key)}',parseYen(this.value))`, dis)}${x.bMan?`<button class="rs" title="機種の金額に戻す" onclick="stdAmtBL('${car.id}','${jsq(x.key)}','amtB')">↺</button>`:''}</span>`}
          <select class="q-in" onchange="stdVsel('${car.id}','${jsq(x.key)}',this.value)" ${dis?'disabled':''} title="取付工賃">${x.vo.map((o,j)=>`<option value="${j}" ${j===x.vi?'selected':''}>工賃：${esc(o[0])}</option>`).join('')}</select>
          <span class="mb">${money('s-l-'+i, x.laborA, `stdAmtL('${car.id}','${jsq(x.key)}',parseYen(this.value))`, dis)}${x.lMan?`<button class="rs" title="工賃の種類の金額に戻す" onclick="stdAmtBL('${car.id}','${jsq(x.key)}','amtL')">↺</button>`:''}</span></div></div>`:''}</div>`).join(''))(true)}
    ${addSel(items.filter(x=>!stdUp(car, x)).length + stdExtraRows(car, items, dis).n, RW(false) + stdExtraRows(car, items, dis).html, dis, `stdAddFree('${car.id}')`)}
    <div class="q-why" style="margin-top:8px">金額・種類・並び・A/B/C はこの車だけ変わります（店のパックは変わらない）。↺ でテンプレの金額に戻す。全車に効かせる時は CarFlow の「設定 ▸ 見積 ▸ プランの中身」。</div>
    ${Object.keys(car.std.ov).length||(car.std.extra||[]).length||Object.keys(car.std.tier||{}).length||Object.keys(car.std.amt||{}).length||Object.keys(car.std.vsel||{}).length||(car.std.order||[]).length||(car.std.hide||[]).length?`<button class="q-btn sm" style="margin-top:6px" onclick="stdReset('${car.id}')">店のパックに戻す</button>`:''}
  </div></div></div><div><div class="q-card"><h3>おすすめ・業販（この車だけ）</h3><div class="bd">
    <div><label class="k" style="font-size:11px;color:var(--text3)">おすすめのプラン</label><div>${seg(rec,PLANS.map(p=>[p,p]),`stdRec('${car.id}','$v')`, dis)}</div></div>
    <label class="q-tog" style="margin-top:10px"><input type="checkbox" ${car.std.showD?'checked':''} onchange="stdShowD('${car.id}',this.checked)" ${dis?'disabled':''}><span><b>業販（D）も出す</b>　業者向けの現状渡し（納車整備・保証・登録なし）</span><span class="v">${yen(calc(stdCtx(car,'D')).cash)}</span></label></div></div>
    <div class="q-card"><h3>印刷</h3><div class="bd">
      <div class="q-prow">${['base'].concat(ps).map(p=>`<button class="q-btn" onclick="stdPrint('${p}')">${I('printer','🖨',14)} ${p==='base'?'基本':p==='D'?'業販':p+'（'+esc(planName(p))+'）'}を印刷</button>`).join('')}</div>
      <div class="q-prow" style="margin-top:8px">${eqDone(car)?`<button class="q-btn" onclick="eqPrint('${car.id}')">${I('printer','🖨',14)} 装備品一覧を印刷</button>`:`<button class="q-btn" disabled title="装備品チェックが終わっていません（カードの装備品チェックで入力）">${I('printer','🖨',14)} 装備品一覧を印刷（チェック前）</button>`}</div>
      <div class="q-prow" style="margin-top:8px"><button class="q-btn" onclick="openPick('${car.id}')">${I('printer','🖨',14)} まとめて印刷（選んで）</button><button class="q-btn" onclick="openDocs('compare')">${I('table','▦',14)} プラン比較</button><button class="q-btn" onclick="openDocs('board')">プライスボード</button></div></div></div></div></div>`;
  return h;
}

/* ---------- ③ 個別見積（お客様ごと） ---------- */
function stepCust(car){
  const list = car.custs;
  if (!S.ui.custId || !custOf(car,S.ui.custId)) S.ui.custId = list.length ? list[0].id : null;
  let h = `<div class="q-cust"><div class="q-clist">`;
  list.forEach(u=>{ const won = car.order && car.order.cust===u.id, lost = car.order && !won, stale = !car.order && staleOf(car,u);
    h += `<div class="c ${S.ui.custId===u.id?'on':''} ${lost?'dim':''}" onclick="S.ui.custId='${u.id}';save();render()">${won?'':`<button class="c-x" title="このお客様の見積を丸ごと消す" onclick="event.stopPropagation();custDelAsk('${car.id}','${u.id}')">✕</button>`}<div class="n">${esc(u.name||'（お名前未入力）')} 様${won?'<span class="q-pill sold">売約</span>':''}${lost?'<span class="q-pill none">他で売約</span>':''}${stale?'<span class="q-pill warn">基本価格の変更あり</span>':''}</div>
      ${custPlans(u).map(p=>`<div class="s">${p==='base'?'基本見積':p+'・'+esc(planName(p))} ${yen(calc(custCtx(car,u,p)).net)}${u.rec===p?' ★':''}</div>`).join('')}
      <div class="s" style="color:var(--text3)">No. ${esc(estBase(car,u))}・作成 ${jd(u.made)}・${esc(u.staff)}・${esc(payBrief(u))}</div></div>`; });
  h += `<button class="q-btn ${list.length?'':'pri'}" style="width:100%;justify-content:center" onclick="newCust('${car.id}')" ${car.order?'disabled':''}>${I('plus','＋',14)} 個別見積をつくる</button>
    <div class="q-why" style="margin-top:8px">プラン見積の A/B/C（と納車整備の段階）がそのまま写ります。本気で検討のお客様に作ります。</div></div><div>`;
  const u = S.ui.custId && custOf(car, S.ui.custId);
  if (!u){ h += `<div class="q-card"><div class="q-placeholder">まだ個別見積はありません。<br>左の「＋ 個別見積をつくる」から始めます。</div></div></div></div>`; return h; }
  if (!custPlans(u).includes(S.ui.plan)) S.ui.plan = u.rec && custPlans(u).includes(u.rec) ? u.rec : custPlans(u)[0];
  const locked = !!car.order, dis = locked, kb = calc({ car, b:u.baseSnap }), plan = S.ui.plan; let RW;
  if (!locked && staleOf(car,u)){ const now = calc(custCtx(car,u,plan,car.base)).net, was = calc(custCtx(car,u,plan)).net;
    h += `<div class="q-note warn">${I('warn','⚠',15)} 作った後に基本価格が変わりました（${plan}：いまの基本価格だと ${yen(now)}円＝${now-was>=0?'＋':''}${yen(now-was)}円）。<button class="q-btn sm" onclick="custApplyBase('${car.id}','${u.id}')">この方の見積に反映する</button><span style="color:var(--text2)">渡した見積のままにするなら何もしない</span></div>`; }
  if (locked) h += `<div class="q-note ok">${I('lock','🔒',14)} ${car.order.cust===u.id?`この方の ${car.order.plan}（${esc(planName(car.order.plan))}）で売約しました。`:'この車は他のお客様で売約しました。'}</div>`;
  const ident = identicalPlans(u);
  if (ident.length) h += `<div class="q-note warn">${I('warn','⚠',15)} ${ident.join('・')} が同じ内容になっています。違いを残すと比べやすくなります。</div>`;
  h += `<div class="q-cpl"><span class="k">この見積のプラン</span>${ALL_P.map(p=>`<button class="nc-pc sm ${custPlans(u).includes(p)?'on':''}" onclick="custPlanToggle('${car.id}','${u.id}','${p}')" ${dis?'disabled':''}>${pb(p)}</button>`).join('')}<span class="q-why" style="margin:0 0 0 6px">押すと出す／出さないを切り替え（1つ以上）</span></div>`;
  h += `<div class="q-plans">${custPlans(u).map(p=>planCard(p, calc(custCtx(car,u,p)), kb, plan===p, u.rec===p, '', estNo(car,p,u))).join('')}</div>`;
  /* 🗣 2026-10-02「納車整備とオプション、これを選択しない見積の ABC は抜けるように」＝この見積で選んだ A/B/C だけ */
  const opP = custPlans(u).filter(p=>PLANS.includes(p)), tp = opP.includes(plan) ? plan : opP[0];
  if (opP.length) h += `<div class="q-card"><h3>メンテナンスパック <span class="r">${PACK_HOLD ? 'いまは選べません（暫定）' : 'プランごとに選ぶ（保証もパックで決まる）'}</span></h3><div class="bd">
    ${packHold(`${opP.map(p=>`<div class="q-tierrow"><span>${pb(p)}</span><span>${tierSeg(PACK_HOLD ? 'L' : u.tiers[p], `tierPick('cust','${car.id}','${u.id}','${p}','$v')`, dis || PACK_HOLD)}</span>${PACK_HOLD ? '' : tierXUI('cust', car, u, p, u.tiers[p], dis)}</div>`).join('')}
    <div class="q-why" style="margin-top:6px">${tierNotes()}</div>`, car, u)}</div></div>`;
  h += `<div class="q-card"><h3><span class="q-kb o">☆</span> オプション <span class="r">${opP.length?'押したプランだけに入る（連動／非連動をここで選ぶ）':'基本見積・業販だけなのでオプションは付きません'}</span></h3><div class="bd">${opP.length?`
    ${(RW = want => u.items.map((x,i)=> (opP.some(p=>x.in[p])||!!x.keep)!==want ? '' : `<div class="q-it cu ${want?'':'off'} ${want&&!dis?'dg':''}" data-dk="${i}" data-dkind="cust" ${want&&!dis?dragAttrs(`'cust','${car.id}','${u.id}'`):''}><span class="grip" title="ドラッグで並べ替え">⋮⋮</span><span><input id="u-in-${i}" class="q-in" value="${esc(x.n)}" placeholder="品名を入れる" onchange="custItem('${car.id}','${u.id}',${i},'n',this.value)" ${dis?'disabled':''}></span>
      <span class="am">${u.cond.wish && /希望ナンバー/.test(x.n||'') ? '<span class="q-why" style="margin:0">詳細にて（この方の条件の希望ナンバー）</span>' : money('u-ia-'+i, x.a, `custItem('${car.id}','${u.id}',${i},'a',parseYen(this.value))`, dis)}${x.laborL!=null?`<small class="q-why" style="margin:0">${optLines(x).map(([n,a])=>esc(n.replace('　└ ',''))+' '+yen(a)).join('＋')}</small>`:''}</span>
      <span class="q-pcs">${opP.map(p=>`<button class="q-pc ${x.in[p]?'on':''} ${p}" onclick="custToggle('${car.id}','${u.id}',${i},'${p}')" ${dis?'disabled':''}>${p}</button>`).join('')}</span>
      <span class="del">${want ? `<button class="q-del" title="この行を消す" onclick="custRowDelAsk('${car.id}','${u.id}',${i})" ${dis?'disabled':''}>✕</button>` : ''}</span></div>`).join(''))(true)}
    ${addSel(u.items.filter(x=>!(opP.some(p=>x.in[p])||x.keep)).length + custExtraRows(car, u, opP, dis).n, RW(false) + custExtraRows(car, u, opP, dis).html, dis, `custAddFree('${car.id}','${u.id}')`)}
    <div class="q-why" style="margin-top:8px">足した品は、いま選んでいるプラン（<b>${tp}</b>）だけに入ります。${opP.length>1?'ほかのプランにも入れる時は '+opP.join('/')+' を押す。':''}✕ は全部から外す。</div>`:''}
    <div style="margin-top:8px"><label class="k" style="font-size:11px;color:var(--text3)">おすすめのプラン</label><div>${seg(u.rec,(opP.length?opP:custPlans(u)).map(p=>[p,plab(p)]),`custSet('${car.id}','${u.id}','rec','$v',1)`, dis)}</div></div>
</div></div>`;
  h += `<div class="q-grid"><div><div class="q-card"><h3><span class="q-kb c">◎</span> この方の条件 <span class="r">A/B/C 全部に効く（D は対象外）</span></h3><div class="bd">
    ${[['wish','希望ナンバー',`代行 ＋${yen(S.set.fees.wish)}（課税）・ナンバー代 ${yen(car.kei?(S.set.fees.plateKei||S.set.fees.plate):S.set.fees.plate)} → ${yen((S.set.plates||{})[car.kei?'kWishP':'wishP'])}〜${(()=>{ const wp = custPlans(u).filter(p=>PLANS.includes(p) && u.items.some(x=>x.in && x.in[p] && /希望ナンバー/.test(x.n||''))); return wp.length ? `<br><small style="color:var(--text3)">✓で ${wp.map(plab).join('・')} の希望ナンバーパックは「詳細にて」＝下の金額に切り替わる</small>` : ''; })()}`],['out','管轄外に登録（県外など）',`＋${yen(S.set.fees.out)}（課税）`],...(car.kei ? [] : [['garage','車庫証明を当店で取る',`代行 ＋${yen(S.set.fees.daikoGarage)}（課税）・手数料 ＋${yen(S.set.fees.garage)}`]]),['deliver','ご指定場所へ納車',`＋${yen(S.set.fees.deliver)}（課税）`]].map(([k2,l,d])=>`<label class="q-tog"><input type="checkbox" ${u.cond[k2]?'checked':''} onchange="custSet('${car.id}','${u.id}','cond.${k2}',this.checked,1)" ${dis?'disabled':''}><span>${l}</span><span class="v">${u.cond[k2] ? (k2==='wish' ? '<small style="color:var(--text3)">A・B・C のパックの行は「詳細にて」</small>' : '') : d}</span></label>${u.cond[k2] ? condDUI(car, u, k2, dis) : ''}`).join('')}${condFreeUI(car, u, dis)}</div></div>
    </div><div><div class="q-card"><h3>お客様</h3><div class="bd"><div class="q-f">
      <div><label class="k">お名前</label><input id="u-name" class="q-in" value="${esc(u.name)}" onchange="custSet('${car.id}','${u.id}','name',this.value,1)" ${dis?'disabled':''}></div>
      <div><label class="k">TEL</label><input id="u-tel" class="q-in" value="${esc(u.tel)}" onchange="custSet('${car.id}','${u.id}','tel',this.value,1)" ${dis?'disabled':''}></div>
      <div style="grid-column:1/-1"><label class="k">ご住所</label><input id="u-addr" class="q-in" value="${esc(u.addr)}" onchange="custSet('${car.id}','${u.id}','addr',this.value,1)" ${dis?'disabled':''}></div>
      <div><label class="k">担当</label><select id="u-staff" class="q-in" onchange="custSet('${car.id}','${u.id}','staff',this.value,1)" ${dis?'disabled':''}><option value="" ${u.staff?'':'selected'}>${S.set.staff.length ? '（担当を選ぶ）' : '（メンバー画面で「セールス」にチェックの人がいません）'}</option>${[...new Set([u.staff].filter(Boolean).concat(S.set.staff))].map(n=>`<option ${n===u.staff?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
      <div><label class="k">作成日</label><div style="padding:7px 0">${jd(u.made)}</div></div>
      <div style="grid-column:1/-1"><label class="k">商談メモ</label><textarea id="u-note" class="q-in" onchange="custSet('${car.id}','${u.id}','note',this.value,1)" ${dis?'disabled':''}>${esc(u.note)}</textarea></div></div></div></div>
</div></div>
    ${payDiscCard(car, u, dis)}
    <!-- 🗣 2026-10-19「売約を右側にハーフサイズの BOX 化して、クリックしたら ABC どれでいく？って展開。左側は印刷をまとめる」 -->
    <div class="q-grid"><div>
    <div class="q-card"><h3>印刷</h3><div class="bd">
      <div class="q-prow">${custPlans(u).map(p=>`<button class="q-btn" onclick="custPrint('${p}')">${I('printer','🖨',14)} ${p==='base'?'基本':p==='D'?'業販':p+'（'+esc(planName(p))+'）'}を印刷</button>`).join('')}</div>
      <div class="q-prow" style="margin-top:8px"><button class="q-btn" onclick="printCust('${car.id}','${u.id}')">${I('printer','🖨',14)} 全部まとめて印刷（${custPlans(u).length + (custPlans(u).filter(p=>p!=='base').length>=2 || (custPlans(u).includes('base') && custPlans(u).length>=2) ? 1 : 0)}枚）</button>${custPlans(u).filter(p=>p!=='base').length>=1?`<button class="q-btn" onclick="openDocs('compare')">${I('table','▦',14)} プラン比較</button>`:''}</div>
</div></div>
    </div><div>${ordCard(car, u)}</div></div></div></div>`;
  return h;
}


/* ---------- 個別見積の印刷：1種ずつ・全部まとめて（🗣 2026-10-02「個別見積もプランと同じく、印刷 BOX はある見積全てを印刷できるように」） ---------- */
function custPrint(p){ S.ui.docBase = false; S.ui.plan = p; save(); openDocs('quote'); }
function printCust(cid, uid){ _reprint = () => printCust(cid, uid); const car = carOf(cid), u = custOf(car, uid), ps = custPlans(u); _docNew = !!u.baseSnap.newCar;
  let papers = ps.map(p=>{ const d = { car, ctx:custCtx(car,u,p), who:u, kind:'cust' }; return quotePapers(d, calc(d.ctx)); }).join('');
  /* 🗣 2026-10-12「詳細から帳票の印刷でも、まとめてにプラン比較が入ってない」→ プランが2つ以上ならプラン比較も付ける */
  const dc = { car, ctx:custCtx(car,u,ps[0]), who:u, kind:'cust' };
  if (cmpAll(dc).length >= 2 || (cmpAll(dc).length >= 1 && ps.includes('base'))) papers += `<div class="paper qvp">${cmpShow(dc)}</div>`;
  const nP = (papers.match(/class="paper/g)||[]).length;
  $('q-docov').innerHTML = `<div class="q-docbar"><span class="t">${esc(car.num)} ${esc(car.model)} ／ ${esc(u.name||'（お名前未入力）')} 様・${nP} 枚</span><span class="sp"></span>${zoomBar()}<button onclick="window.print()">${I('printer','🖨',14)} 印刷（${nP}枚）</button><button onclick="closeDocs()">${I('close','✕',14)} 閉じる</button></div>
    <div class="q-stage" id="q-stage"><div class="q-scaler" id="q-scaler"><div class="q-papers" id="q-papers">${papers}</div></div></div>`;
  $('q-docov').hidden = false; $('q-page').textContent = '@page{size:A4 portrait;margin:0}@page a3{size:A3 landscape;margin:0}';   // A4 と A3 を1回の印刷で（紙の大きさは1枚ごと）
  const _b = typeof set==='object' && set && set.board, W = _b ? 1587 : 794, st = $('q-stage'), box = $('q-papers'), s = zoomOf(st, W, _b ? 1123 : 1123);
  box.style.transform = `scale(${s})`; $('q-scaler').style.width = W*s+'px'; $('q-scaler').style.height = box.offsetHeight*s+'px';
  if (_b) brdFit();
  document.querySelectorAll('#q-papers .paper.cmp-nobase table.cmp tr').forEach(tr=>{ if (tr.cells[1]) tr.cells[1].remove(); });   // プラン比較：ベースの列を外した時
  if (typeof icHydrate==='function') icHydrate($('q-docov'));
}
/* ---------- 売約（🗣「売約は印刷と分けて一番下にぶち抜きで。売約にした後は最終の見積がちゃんとフル内容で見れる形。OK で納車予定日とかを入れる、OR 1枚にまとめてもいい」→ 1枚にまとめた） ---------- */
function ordCard(car, u){
  if (car.order){ const won = car.order.cust===u.id, k = won ? calc(custCtx(car,u,car.order.plan)) : null;
    return `<div class="q-card q-ord"><h3>${I('check','✍',15)} 売約</h3><div class="bd">${won
      ? `<div class="q-ordrow"><span class="q-pill sold">売約</span><b>${esc(u.name)} 様・${pb(car.order.plan)}</b><span class="am">${yen(k.net)} 円</span><span class="q-why" style="margin:0">注文日 ${jd(car.order.date)}・納車予定 ${jd(car.order.delivery)}</span><span class="sp"></span><button class="q-btn pri" onclick="stepGo('order')">売約を見る →</button></div>`
      : '<div class="q-why" style="margin:0">この車はほかのお客様で売約しました。</div>'}</div></div>`; }
  /* 🗣 2026-10-19「プランを選んで、もう一回売約の確認ボタンが出るように」＝プランのボタンは選ぶだけ。選んだら下に「◯で売約する」 */
  const ps = custPlans(u), open = S.ui.ordOpen === u.id, sel = ps.includes(S.ui.ordPlan) ? S.ui.ordPlan : null;
  if (!open) return `<div class="q-card q-ord"><h3>${I('check','✍',15)} 売約</h3><div class="bd"><button class="q-btn ok" style="width:100%;justify-content:center;padding:12px" onclick="S.ui.ordOpen='${u.id}';S.ui.ordPlan=null;save();render()">${I('check','✍',15)} 売約にする ▸</button><div class="q-why" style="margin:6px 0 0;text-align:center">押すと、どのプランで売約するかを選ぶ</div></div></div>`;
  return `<div class="q-card q-ord"><h3>${I('check','✍',15)} 売約 <span class="r">どのプランでいく？</span></h3><div class="bd"><div class="q-ordpick">
    ${ps.map(p=>{ const k = calc(custCtx(car,u,p)), q = ppOf(u,p); return `<button class="nc-pc ${p===sel?'on':''}" onclick="S.ui.ordPlan='${p}';save();render()"><span>${pb(p)}${p===u.rec?' <span class="q-pb rec" style="position:static">おすすめ</span>':''}</span><b>${yen(k.net)}</b><small>${k.loan ? 'ローン 月々 '+yen(k.loan.later) : esc(q.restMethod||'支払方法 未選択')}${q.tradeIn?'・下取':''}</small></button>`; }).join('')}</div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:10px"><button class="q-btn sm" onclick="S.ui.ordOpen=null;S.ui.ordPlan=null;save();render()">閉じる</button><span class="sp" style="flex:1"></span>${sel ? `<button class="q-btn ok" style="padding:10px 16px" onclick="openClose('${car.id}','${u.id}','${sel}')">${I('check','✍',14)} ${p_lab(sel)}で売約する</button>` : '<span class="q-why" style="margin:0">プランを選ぶと、売約のボタンが出ます</span>'}</div></div></div>`;
}
const p_lab = p => p==='base' ? '基本見積' : p==='D' ? '業販' : p+'（'+planName(p)+'）';
/* ---------- ④ 売約 ---------- */
function stepOrder(car){
  const o = car.order, u = custOf(car, o.cust), k = calc(custCtx(car,u,o.plan));
  return `<div class="q-grid"><div>
    <div class="q-note info" style="margin-bottom:10px">${I('info','ℹ',15)} <b>売約は見積の上の札だけです</b>（v4.0）。カンバンの売約・納車準備・大タスクには、まだつないでいません。車を売約に進める時は、いままでどおり カンバンで。</div>
    <div class="q-card lead"><h3>${I('check','✓',15)} 売約 ${esc(car.num)}${o.ver>1?'-版'+o.ver:''} <span class="q-pill sold">売約</span><span class="r">${esc(u.name)} 様・${o.plan}・${esc(planName(o.plan))}</span></h3>
      <div class="q-total"><span>ご注文金額（税込）<br><span class="s">${k.loan?`頭金 ${yen(k.loan.down)}・${k.loan.n}回・実質年率 ${k.loan.rate}%・割賦販売価格 ${yen(k.loan.hanbai)}`:'現金'}</span></span><b>${yen(k.net)} 円</b></div></div>
    <div class="q-card"><h3>売約の控え</h3><div class="bd"><div class="q-f">
      <div><label class="k">注文日</label><input id="o-date" type="date" class="q-in" value="${o.date}" onchange="orderSet('${car.id}','date',this.value)"></div>
      <div><label class="k">納車予定日</label><input id="o-del" type="date" class="q-in" value="${o.delivery||''}" onchange="orderSet('${car.id}','delivery',this.value)"></div>
      <div style="grid-column:1/-1"><label class="k">お約束事項（納車までに行うこと）</label><textarea id="o-prom" class="q-in" onchange="orderSet('${car.id}','promise',this.value)">${esc(o.promise||'')}</textarea></div>
      ${k.loan?`<div style="grid-column:1/-1"><label class="k">信販会社の承諾前に登録・修理に着手</label>${seg(o.startBefore||'shinai',[['irai','依頼する'],['shinai','依頼しない']],`orderSet('${car.id}','startBefore','$v')`)}</div>`:''}
    </div></div></div>
    <div class="q-card"><h3>中身（固定）</h3><div class="bd">
      <div class="q-row"><label>車両価格（税込）</label><span class="v">${yen(k.bodyIn)}</span></div>
      <div class="q-row"><label>納車整備</label><span class="v">${k.ws?'なし（業販・現状渡し）':esc(tierOf(k.tier).name)}</span></div>
      <div class="q-row"><label>☆ オプション</label><span class="v">${k.inPlan.filter(x=>!x.up).map(x=>esc(x.n)).join('・')||'なし'}</span></div>
      <div class="q-row"><label>◎ 条件</label><span class="v">${k.condRows.map(r=>r[0]).join('・')||'なし'}</span></div>
      <div class="q-row"><label>値引き／下取</label><span class="v">${k.disc?'▲'+yen(k.disc):'—'}／${k.trade?'▲'+yen(k.trade):'—'}</span></div>
      <div class="q-why" style="margin-top:6px">売約した時点の中身で固定。あとから基本価格や店のパックが変わってもここは変わりません。直す時は「版を上げて直す」。</div></div></div>
  </div><div>
    <div class="q-card"><h3>帳票</h3><div class="bd" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="q-btn" onclick="openDocs('quote')">${I('printer','🖨',14)} 見積書（売約したプラン）</button></div>
      <div class="q-why" style="padding:0 14px 12px">注文書・請求書などの帳票は、この後つくります（v4.0 は見積書だけ）。</div></div>
    <div class="q-card"><h3>売約の直し</h3><div class="bd">
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="q-btn" onclick="orderBump('${car.id}')" ${QData.canEdit()?'':'disabled'}>版を上げて直す</button><button class="q-btn dan" onclick="orderCancel('${car.id}')" ${QData.canEdit()?'':'disabled'}>売約を取り消す</button></div></div></div>
  </div></div>`;
}

/* =====================================================================
   7. 帳票（窓で大きく開く）
   ===================================================================== */
function docCtx(){
  const car = carOf(S.ui.carId), u = S.ui;
  if (u.docBase && car.base) return { car, ctx:{ car, b:car.base, plan:null }, who:null, kind:'std' };   // 基本＝ベース（オプションなし・掲載の支払総額）
  if (u.step==='order' && car.order){ const cu = custOf(car, car.order.cust); return { car, ctx:custCtx(car,cu,car.order.plan), who:cu, kind:'order' }; }
  if (u.step==='cust' && u.custId){ const cu = custOf(car, u.custId); return { car, ctx:custCtx(car,cu,u.plan), who:cu, kind:'cust' }; }
  return { car, ctx: u.step==='base' ? stdCtx(car, u.plan) : stdCtx(car, u.plan), who:null, kind:'std' };
}
function openDocs(doc){ const d = docCtx(); const list = docList(d.kind); S.ui.doc = doc || list[0][0]; if (!list.some(x=>x[0]===S.ui.doc) && S.ui.doc!=='board') S.ui.doc = list[0][0]; $('q-docov').hidden = false; renderDocs(); }
function closeDocs(){ $('q-docov').hidden = true; S.ui.docBase = false; if (S.ui.bulk){ S.ui.bulk = null; } }
/* 🗣 2026-10-23「見積は今の金色のやつを暫定的に決定として印刷できるように。これはこの後変更予定」＝v4.0 は見積書（ショールーム・金の線）だけ。
   注文書・プラン比較・装備品一覧・プライスボードなどはモック（資料\モック\_見積モック_src）に残して、決まったら足す */
/* 🗣 2026-10-23「プラン比較のボタンも、ちゃんとプラン比較が出るように」→ v4.5.3 プラン比較（ショールーム＝QC[3]・金額は本物の計算）を足す */
function docList(kind){ return [['quote','見積書'],['compare','プラン比較']]; }
let _docNew = false;   // 帳票の「新車・中古車」の丸
let diffOnly = false;
/* 見積書・注文書・3案くらべ・納品書は「装備品一覧」を2枚目に付けて一緒に刷れる（🗣 ゆうた 2026-10-01「装備のチェック一覧は見積から無くして、
   カードの装備品チェック印刷をブラッシュアップして見積と一緒に印刷」）。付けるかどうかは帳票ごとに覚える */
/* 🗣 2026-10-12「セットで装備品一覧が印刷されちゃう。これは切り分けたい」→ 一緒に刷る仕組みは止める（装備品一覧は単独で刷る） */
const EQ_WITH_OK = [];
function eqWith(doc){ S.ui.eqWith = S.ui.eqWith || { quote:true, compare:true, order:true, orderH:false, delivery:true }; return EQ_WITH_OK.includes(doc) && !!S.ui.eqWith[doc]; }
function renderDocs(){ _reprint = null;
  const d = docCtx(), list = docList(d.kind), doc = S.ui.doc;
  _docNew = !!d.ctx.b.newCar;
  const showD = d.who ? d.who.showD : d.car.std.showD, dps = d.who ? custPlans(d.who) : plansOf(showD);
  const plans = (doc==='quote') ? `<span style="color:#fffa;font-size:12px;margin-left:10px">プラン</span>${d.kind==='std'?`<button class="${S.ui.docBase?'on':''}" onclick="S.ui.docBase=true;renderDocs()">基本</button>`:''}${dps.map(p=>`<button class="${!S.ui.docBase&&S.ui.plan===p?'on':''}" onclick="S.ui.docBase=false;S.ui.plan='${p}';save();renderDocs();render()">${plab(p)}</button>`).join('')}` : '';
  $('q-docov').innerHTML = `<div class="q-docbar"><span class="t">${esc(d.car.num)} ${esc(d.car.model)}${d.who?' ／ '+esc(d.who.name)+' 様':d.kind==='std'?' ／ プラン見積（お客様名は空欄）':''}</span>
    ${list.map(([k,l])=>`<button class="${doc===k?'on':''}" onclick="${k==='board'?`if(!carOf('${d.car.id}').board){openBrdPick('${d.car.id}')}else{S.ui.doc='board';renderDocs()}`:`S.ui.doc='${k}';renderDocs()`}">${l}</button>`).join('')}${plans}
    ${doc==='board'?`<span style="color:#fffa;font-size:12px;margin-left:10px">季節</span><select style="font:inherit;padding:3px 6px;border-radius:6px" onchange="brdSetSeason('${d.car.id}',this.value);renderDocs()">${brdSeasons().map(x=>`<option ${x===brdSeason(d.car)?'selected':''}>${x}</option>`).join('')}</select><button onclick="openBrdPick('${d.car.id}')">装備を選ぶ</button>`:''}
    
    ${EQ_WITH_OK.includes(doc)?`<label style="margin-left:10px"><input type="checkbox" ${eqWith(doc)?'checked':''} onchange="S.ui.eqWith['${doc}']=this.checked;save();renderDocs()"> 装備品一覧も一緒に刷る</label>`:''}
    <span class="sp"></span>${zoomBar()}<button onclick="window.print()">${I('printer','🖨',14)} 印刷${eqWith(doc)?'（2枚）':''}</button><button onclick="closeDocs()">${I('close','✕',14)} 閉じる</button></div>
    <div class="q-stage" id="q-stage"><div class="q-scaler" id="q-scaler"><div class="q-papers" id="q-papers"><div class="paper" id="q-paper"></div><div class="paper" id="q-paper2" hidden></div></div></div></div>`;
  const k = calc(d.ctx);
  const wb = k.bc.wtMiss ? '重量税が入っていません（基本価格の「国交省で照会」で入れる）' : k.bc.wtStale ? '重量税の照会し直しが要ります（税制の年度が変わる）' : '';
  if (wb) { const t = $('q-docov').querySelector('.q-docbar .t'); if (t) t.insertAdjacentHTML('afterend', `<span class="q-pill warn" style="margin-left:8px">⚠ ${wb}</span>`); }
  const html = { quote:()=>'', compare:()=>cmpShow(d,k), board:()=>docBoard(d.car), order:()=>docOrder(d,k), orderH:()=>docOrderH(d,k), equip:()=>eqShow(d,k), contract:()=>docContract(d,k), terms:()=>docTerms(), cond:()=>docCond(d,k), invoice:()=>docInvoice(d,k), delivery:()=>docDelivery(d,k) }[doc]();
  $('q-paper').innerHTML = html;
  if (doc==='compare' && !cmpBaseOn(d)) document.querySelectorAll('#q-paper table.cmp tr').forEach(tr=>{ if (tr.cells[1]) tr.cells[1].remove(); });   // ベースの列を外す
  const two = eqWith(doc); $('q-paper2').hidden = !two; if (two) $('q-paper2').innerHTML = docEquip(d,k,true);
  $('q-paper').classList.toggle('qvp', ['quote','compare','equip'].includes(doc)); $('q-paper2').classList.remove('qvp');
  if (doc==='quote'){ const v = QV[0], q = qvFold(qvData(Object.assign({ tradeModel: (d.who && d.who.tradeModel) || '' }, d), k), v);
    $('q-paper').innerHTML = v.render(q); if (q.fold){ $('q-paper2').hidden = false; $('q-paper2').classList.add('qvp'); $('q-paper2').innerHTML = qvPage2(q, v); } }
  fitPaper(); if (doc==='board') brdFit();
}
/* 帳票の拡大縮小（🗣 2026-10-05「ヘッダーに100％表示・拡大縮小が欲しい。いま全体を見れない」）。S.ui.docZoom＝'fit'（全体＝紙1枚がまるごと見える）／数字（1＝100%） */
function zoomOf(st, W, H){ const z = S.ui.docZoom; return (!z || z==='fit') ? Math.min((st.clientWidth-36)/W, (st.clientHeight-36)/H) : z; }
function zoomBar(){ const z = S.ui.docZoom, st = $('q-stage'), cur = z && z!=='fit' ? z : null;
  return `<span class="q-zoom"><button class="${!cur?'on':''}" onclick="docZoom('fit')" title="紙1枚がまるごと見える大きさ">全体</button><button class="${cur===1?'on':''}" onclick="docZoom(1)">100%</button><button onclick="docZoom(-1)" title="縮小">－</button><span id="q-zoomv">${cur ? Math.round(cur*100)+'%' : ''}</span><button onclick="docZoom(+1)" title="拡大">＋</button></span>`; }
function docZoom(v){ const steps = [0.25,0.33,0.5,0.67,0.75,0.9,1,1.25,1.5,2];
  if (v==='fit' || v===1) S.ui.docZoom = v;
  else { const st = $('q-stage'), cur = parseFloat(($('q-papers').style.transform.match(/scale\(([\d.]+)\)/)||[])[1]) || 1;
    S.ui.docZoom = v>0 ? (steps.find(x=>x>cur+0.001) || 2) : ([...steps].reverse().find(x=>x<cur-0.001) || 0.25); }
  save(); if (_reprint) _reprint(); else renderDocs(); }
let _reprint = null;   // 並べて見る（一括・選択・個別見積）の時は、その画面を描き直す
function fitPaper(){ const st = $('q-stage'); if (!st || $('q-docov').hidden) return; const pap = $('q-paper'), box = $('q-papers'), sc = $('q-scaler'); const land = S.ui.doc==='orderH', a3 = S.ui.doc==='board'; pap.classList.toggle('land', land); pap.classList.toggle('a3', a3); $('q-paper2').classList.remove('land'); $('q-page').textContent = a3 ? '@page{size:A3 landscape;margin:0}' : land ? '@page{size:A4 landscape;margin:0}' : '@page{size:A4 portrait;margin:0}'; const W = a3 ? 1587 : land ? 1123 : 794, H = a3 ? 1123 : land ? 794 : 1123; const s = zoomOf(st, W, H); box.style.transform = `scale(${s})`; sc.style.width = W*s+'px'; sc.style.height = box.offsetHeight*s+'px'; }

/* ---------- 契約確認書・約款（🗣 2026-10-03「売約時の売買契約書や約款。法的拘束力がなくても『200万の車を契約した』と落とし込めるもの」→「署名時に成立」「個別のチェックはいいから最後に署名だけ一筆」「とりあえず組み込んで」）
   文面の元：CarFlow\資料\契約書_下書き\売買約款と契約確認書_下書き_v1.html（最終文言は弁護士・行政書士の確認前）。確認書は売約した見積から自動で入る ---------- */
function docContract(d, k){
  const car = d.car, o = car.order, u = d.who, b = d.ctx.b, c = C(), L = k.loan;
  const vin4 = (car.vin||'').replace(/[^0-9A-Z]/gi,'').slice(-4);
  const vIn = Math.floor(k.vehicle*1.1), fees = k.cash - vIn;
  const blank = w => `<span class="ct-bl" style="min-width:${w||120}px"></span>`;
  return `<div class="ct"><div class="p-top"><div class="p-kind">${kindMark()}</div><div class="p-date">注文書 No：${esc(o.no||estNo(car,o.plan,u))}</div></div>
  <div class="ct-h1">ご契約内容の確認書</div>
  <div class="ct-lead">私は、本日、下記の自動車を <b>支払総額 ${yen(k.net)} 円</b> で購入する<b>売買契約を結びました</b>。<br>この契約は、注文書に署名した時点で成立し、販売店は本日から納車に向けた準備に入ります。</div>
  <table class="ct-k">
    <tr><th>ご契約日</th><td>${jd(o.date)}</td></tr>
    <tr><th>お車</th><td>${esc(car.maker)} ${esc(car.model)} ${esc(car.grade)}${car.gradeSub?'・'+esc(car.gradeSub):''}<br>年式：${car.firstReg?warekiYM(car.firstReg)+'（'+car.firstReg.slice(0,4)+'）':'—'}　走行距離：${b.newCar?'新車':(car.km||0).toLocaleString()+' km'}　色：${esc(car.color||'—')}<br>車台番号（下4桁）：${vin4?esc(vin4):blank(80)}　修復歴：${esc(b.repair||'—')}</td></tr>
    <tr><th>お支払総額（税込）</th><td><span class="ct-big">¥ ${yen(k.net)}</span><br><span class="ct-s">内訳：車両価格（オプション込み）${yen(vIn)} 円／諸費用 ${yen(fees)} 円${k.trade?`／下取 ▲${yen(k.trade)} 円`:''}${k.tradeLoan?`／下取車の残債 ＋${yen(k.tradeLoan)} 円`:''}（明細は注文書のとおり）</span></td></tr>
    <tr><th>お支払い方法</th><td>${L?`ローン（信販会社：${blank(130)}）頭金 ${yen(L.down)} 円・${L.n}回・月々 ${yen(L.later)} 円`:'現金'}　お支払い期日：${blank(110)}<br>申込金：${blank(90)} 円（代金の一部に充てます）</td></tr>
    <tr><th>納車予定日・場所</th><td>${jd(o.delivery)} ごろ　／　${u && u.cond && u.cond.deliver ? 'ご指定の場所（'+(u.addr?esc(u.addr):blank(160))+'）' : '店頭'}</td></tr>
    <tr><th>保証・整備</th><td>保証：${esc(warText(b))}　　整備：定期点検整備付（${esc(k.tier && k.tier!=='L' ? tierOf(k.tier).name : k.bc.seibiInfo.name)}）</td></tr>
    <tr><th>お約束したこと</th><td style="height:56px">${o.promise?esc(o.promise):'<span class="ct-s">（口頭でお約束したことは、すべてここに書きます）</span>'}</td></tr>
  </table>
  <div class="ct-pts"><b>ご確認いただいたこと</b><ol>
    <li>この契約は、<b>注文書に署名した時に成立</b>しました${L?'（ローンの場合は、信販会社の承認をもって確定します）':''}。</li>
    <li>自動車の購入には、<b>クーリング・オフ（無条件で取り消せる制度）はありません</b>。</li>
    <li>契約の成立後は、販売店が同意しない限り、<b>一方的に取り消すことはできません</b>。</li>
    <li>やむを得ず取り消しをお願いする場合は、それまでに<b>実際にかかった費用</b>（車庫証明・登録の手続き、陸送、ご注文の部品やオプション、着手した整備など）をご負担いただきます。費用は明細でお示しします。</li>
    <li>お車の状態と保証の内容は、説明を受け、書面で確認しました。詳しい決まりは「自動車売買約款」のとおりです。</li></ol></div>
  <div class="ct-sign"><div class="bx"><div class="t">上記の内容を確認し、契約しました。</div>ご署名（${esc(u&&u.name?u.name:'')} 様）<div class="ln"></div><div class="ct-s" style="margin-top:4px">　　　　年　　月　　日</div></div>
    <div class="bx"><div class="t">販売店</div>${esc(c.name)}<br>担当：${esc(u&&u.staff||'')}<div class="ln"></div></div></div>
  <div class="ct-co">${esc(c.name)}　${esc(c.zip||'')} ${esc(c.addr)}　TEL ${esc(c.tel)}　古物商許可 ${esc(c.kobutsu||'')}</div></div>`;
}
function docTerms(){
  const c = C(), A = (n, h, body) => `<h4>第${n}条（${h}）</h4>${body}`, P = s => `<p>${s}</p>`, O = arr => `<ol>${arr.map(x=>`<li>${x}</li>`).join('')}</ol>`;
  return `<div class="ct ct-yk"><div class="ct-h1" style="font-size:20px;letter-spacing:.3em">自動車売買約款</div>
  <div class="ct-s" style="text-align:center;margin-bottom:10px">この約款は注文書（表面）と一体となって、お客様（以下「買主」）と${esc(c.name)}（以下「販売店」）との自動車売買契約の内容となります。</div>
  <div class="ct-cols">
  ${A(1,'約款の適用',P('本約款は、注文書の表面に記載された自動車（以下「車両」）の売買に適用されます。表面に別の定めがある場合は、表面の定めが優先します。'))}
  ${A(2,'契約の成立',O(['売買契約は、買主が注文書に署名（または記名押印）し、販売店がこれを受け付けた時に成立します。','代金の全部または一部を信販会社のローンでお支払いいただく場合、信販会社の承認が得られなかったときは、契約は成立しなかったものとし、販売店はお預かりした金銭を返還します。']))}
  ${A(3,'申込金',P('注文時にお預かりする申込金は、手付金ではなく、売買代金の一部に充当します。'))}
  ${A(4,'代金の支払い',O(['買主は、注文書記載の支払総額を、注文書記載の期日までに支払います。','支払いが遅れた場合、販売店は、遅れた金額に対し年14.6％の割合による遅延損害金を請求できます。']))}
  ${A(5,'契約成立後の解除・取り消し',O(['契約成立後は、販売店の同意がない限り、買主は契約を解除できません。','買主の申し出により販売店が解除に同意した場合、買主は、解除までに販売店に生じた損害として、次の費用のうち実際に生じたものを負担します。販売店は、その明細を示し、求めに応じて根拠を説明します。<br>(1) 車庫証明・登録・名義変更・抹消などの手続費用と法定費用　(2) 陸送・回送費用　(3) 買主の注文により取り寄せ・取り付けた部品・用品の代金と工賃　(4) 着手した整備・加修の工賃と部品代　(5) その他、解除により販売店に生じた費用','前項の費用は、お預かりした申込金と差し引きして精算します。']))}
  ${A(6,'自動車はクーリング・オフの対象外',P('自動車の売買は、特定商取引に関する法律に基づくクーリング・オフの対象ではありません。'))}
  ${A(7,'車両の引渡し',O(['販売店は、代金の受領（ローンの場合は信販会社の承認と必要書類の受領）後、注文書記載の納車予定日ごろに、記載の場所で車両を引き渡します。','買主の都合で引き取りが遅れた場合、販売店は保管に要した費用を請求できます。']))}
  ${A(8,'登録・名義変更',O(['買主は、登録・名義変更・車庫証明に必要な書類を、販売店が指定する期日までに提出します。','書類の提出が遅れたことにより納車が遅れた場合、販売店はその責任を負いません。']))}
  ${A(9,'所有権',P('車両の所有権は、買主が代金の全額を支払った時に買主に移ります。ローンによる場合は、信販会社との契約の定めに従います。'))}
  ${A(10,'引渡し前の事故など',P('引渡しの前に、販売店・買主のいずれの責任でもない事由（天災・盗難など）により車両が滅失または大きく損傷した場合、契約は解除され、販売店はお預かりした金銭を返還します。'))}
  ${A(11,'車両の状態と保証',O(['販売店は、注文書・見積書・車両状態の書面に記載した車両の状態（修復歴、走行距離、要整備箇所など）を説明し、買主はこれを確認したうえで購入します。','引渡し後の不具合については、保証書に定める範囲・期間で対応します。保証の対象外とした事項でも、販売店が知りながら告げなかった不具合については、法律の定めに従い対応します。']))}
  ${A(12,'下取車',O(['買主は、下取車の状態（修復歴、走行距離、不具合、ローン残債など）を正しく申告します。','査定時から引渡し時までに下取車の状態が変わった場合、または申告と異なることが分かった場合は、下取価格を改めて協議します。']))}
  ${A(13,'販売店からの解除',P('買主が代金の支払い・書類の提出を正当な理由なく怠り、相当の期間を定めた催告に応じない場合、または買主が反社会的勢力に該当することが分かった場合、販売店は契約を解除し、生じた損害の賠償を請求できます。'))}
  ${A(14,'反社会的勢力の排除',P('買主および販売店は、自らが暴力団などの反社会的勢力に該当しないこと、今後も該当しないことを表明し、保証します。'))}
  ${A(15,'個人情報',P('販売店は、取得した個人情報を、本契約の履行、登録手続き、保証・整備のご案内、法令に基づく帳簿の作成など、必要な範囲で利用します。'))}
  ${A(16,'協議・合意管轄',P('本約款に定めのない事項は、法令に従い誠意をもって協議します。本契約に関する争いは、販売店の所在地を管轄する裁判所を第一審の管轄裁判所とします。'))}
  </div><div class="ct-s" style="margin-top:10px;border-top:1px solid #9aa6b8;padding-top:5px">${esc(c.name)}　（下書き v1・2026-10-03　※最終的な文言は弁護士・行政書士の確認を受けてから使用）</div></div>`;
}

/* 注文書（横）… SCD の横型注文書（2026-10-01 に実物を PDF で確認）の並びを下敷きにして、税の区分を正しく直したもの
   SCD との違い：整備点検費用・代書費を課税の諸費用に置かない（車両価格に含む／置かない）／立替（不課税）を別に出す／環境性能割の欄を出さない */
function docOrderH(d,k){
  const car = d.car, o = car.order, u = d.who, b = d.ctx.b, L = k.loan, c = C();
  const rows = (arr, n) => { const out = arr.slice(); while (out.length < n) out.push(['','']); return out; };
  const kRows = k.feeK.map(f=>[f[0]+'<span class="tag k">課税</span>', f[1]]).concat(k.bc.unexpTax?[['自動車税 未経過相当額<span class="tag k">課税</span>', k.bc.unexpTax]]:[], k.bc.unexpJb?[['自賠責 未経過相当額<span class="tag k">課税</span>', k.bc.unexpJb]]:[], k.condRows.filter(r=>r[2]==='k').map(r=>[r[0]+'<span class="tag c">◎</span>', r[1]]));
  const tRows = k.legal.map(f=>[f[0], f[1]]).concat(k.condRows.filter(r=>r[2]==='t').map(r=>[r[0]+'<span class="tag c">◎</span>', r[1]]));
  const taxRows = [[k.bc.kei?'軽自動車税（新たな課税なし）':'自動車税（種別割）'+(k.bc.carTax?'　'+ym(k.bc.rd).m+'月登録・'+k.bc.months+'か月':''), k.bc.carTax],['自動車重量税', k.bc.weight],['自賠責保険料'+(k.bc.jibai?'　'+k.bc.jibaiM+'か月':''), k.bc.jibai]];
  const v = n => n ? yen(n) : '';
  const down = L ? L.down : 0, remain = k.net - down;
  const opts = rows(k.inPlan.flatMap(x=>optLines(x).map(([n,a,tbd])=>[esc(n), tbd?OPT_TBD:+a?yen(a):'サービス'])), 9);   // 納車整備の段階アップもここに出る
  return `<div class="oh-top">
    <div class="oh-seller"><div class="ov">売主</div><div class="in"><div class="nm">${esc(c.name)}</div><div class="seal">小林<br>モーター<br>ス之印</div>${esc(c.zip)}<br>${esc(c.addr)}<br>TEL ${esc(c.tel)}<br>登録番号 ${esc(c.inv)}　古物商 ${esc(c.kobutsu)}<div style="text-align:right">御中</div></div></div>
    <div class="oh-title"><div class="t">注 文 書</div><div class="s">${_docNew?'（ <span style="border:1.5px solid #333;border-radius:50%;padding:0 3px">新車</span> ・ 中古車 ）':'（ 新車 ・ <span style="border:1.5px solid #333;border-radius:50%;padding:0 3px">中古車</span> ）'}</div><div class="s2">下記のとおり注文いたします。</div></div>
    <div><div class="oh-dates"><div class="ln"><span>注 文 日</span><span>${jd(o.date)}</span></div><div class="ln"><span>納車予定日</span><span>${jd(o.delivery)}</span></div><div class="ln"><span>No</span><span>${esc(car.num)}-版${o.ver}（プラン ${o.plan}）</span></div></div>
      <div class="oh-warn">この注文書および別添の契約条項（約款）をよく読んで十分納得したうえでご署名ください。ご署名をもって契約書となります。自動車の売買はクーリング・オフの適用がありません。</div></div></div>
  <table class="oh oh-car"><tr><th>車名</th><td style="width:220px">${esc(car.maker)} ${esc(car.model)}</td><th>グレード</th><td>${esc(car.grade)}</td><th>年式</th><td>${wareki(car.firstReg)}</td><th>型式</th><td>${esc(car.fmodel)}</td></tr>
    <tr><th>走行距離</th><td>${kmText(car,b)}</td><th>色</th><td>${esc(car.color)}</td><th>車歴</th><td>自家用</td><th>管理番号</th><td>${esc(car.num)}</td></tr></table>
  <div class="oh-body"><div>
    <table class="oh"><colgroup><col style="width:18px"><col><col style="width:92px"></colgroup><tr><td class="ov" rowspan="10">現金販売価格明細</td><th>① 車両本体価格（税抜）</th><td class="v">${yen(k.body)}</td></tr>
      ${k.bc.seibiIn?`<tr><th style="font-size:8.5px">　定期点検整備付（${esc(k.bc.seibiInfo.name)} ${yen(k.bc.seibiIn)} を含む）</th><td></td></tr>`:'<tr><th></th><td></td></tr>'}
      <tr><th>② 値引き</th><td class="v">${k.disc?'▲'+yen(k.disc):''}</td></tr><tr><th>③ 特別仕様・付属品計<span class="tag o">☆</span></th><td class="v">${v(k.optSum)}</td></tr>
      <tr class="sum"><th>④ 車両販売価格 ①〜③</th><td class="v">${yen(k.vehicle)}</td></tr>
      <tr><th>⑤ 課税販売諸費用計</th><td class="v">${yen(k.feeKSum+k.bc.unexpTax+k.bc.unexpJb+k.condK)}</td></tr><tr><th>⑥ 非課税諸費用（リサイクル）</th><td class="v">${yen(k.nonTax)}</td></tr>
      <tr><th>⑦ 税・保険料・法定費用（立替）</th><td class="v">${yen(k.tate)}</td></tr><tr><th>⑧ 消費税（10%）</th><td class="v">${yen(k.ctax)}</td></tr>
      <tr class="big"><th>⑨ 現金販売価格 ④〜⑧</th><td class="v">¥ ${yen(k.cash)}</td></tr></table>
    <table class="oh"><colgroup><col style="width:18px"><col><col style="width:92px"></colgroup><tr><td class="ov" rowspan="5">支払条件</td><th>⑩ 現金・頭金</th><td class="v">${v(down)}</td></tr><tr><th>⑪ 下取車価格</th><td class="v">${k.trade?'▲'+yen(k.trade):''}</td></tr><tr><th>⑫ 下取車残債</th><td class="v">${v(k.tradeLoan)}</td></tr><tr><th></th><td></td></tr>
      <tr class="sum"><th>支払残金 ⑨−⑩−⑪＋⑫</th><td class="v">${yen(remain)}</td></tr></table>
    <table class="oh"><colgroup><col style="width:18px"><col><col style="width:92px"></colgroup><tr><td class="ov" rowspan="7">賦払金明細</td><th>クレジット（実質年率）</th><td class="v">${L?L.rate+' %':''}</td></tr><tr><th>支払回数</th><td class="v">${L?L.n+' 回':''}</td></tr><tr><th>初回支払額</th><td class="v">${L?yen(L.first):''}</td></tr><tr><th>2回目以降</th><td class="v">${L?yen(L.later)+' × '+(L.n-1)+' 回':''}</td></tr><tr><th>分割払手数料</th><td class="v">${L?yen(L.fee):''}</td></tr><tr><th>割賦販売価格（支払総額）</th><td class="v">${L?yen(L.hanbai):''}</td></tr><tr><th>ローン会社</th><td></td></tr></table>
  </div><div>
    <table class="oh"><colgroup><col style="width:18px"><col style="width:18px"><col><col style="width:70px"></colgroup><tr><td class="ov" rowspan="${7+5+4+1}">登録に必要な諸費用</td><td class="ov" rowspan="7">課税</td>${rows(kRows,6).map((r,i)=>`${i?'<tr>':''}<th>${r[0]}</th><td class="v">${v(r[1])}</td></tr>`).join('')}
      <tr class="sum"><th>⑤ 課税小計</th><td class="v">${yen(k.feeKSum+k.bc.unexpTax+k.bc.unexpJb+k.condK)}</td></tr>
      <tr><td class="ov" rowspan="5">非課税・立替</td><th>リサイクル預託金相当額<span class="tag h">非課税</span></th><td class="v">${yen(k.nonTax)}</td></tr>${rows(tRows,4).map(r=>`<tr><th>${r[0]}${r[0]?'<span class="tag t">立替</span>':''}</th><td class="v">${v(r[1])}</td></tr>`).join('')}
      <tr><td class="ov" rowspan="4">税・保険</td>${taxRows.map((r,i)=>`${i?'<tr>':''}<th>${r[0]}<span class="tag t">立替</span></th><td class="v">${v(r[1])}</td></tr>`).join('')}
      <tr class="sum"><th>税・保険料 小計</th><td class="v">${yen(k.taxIns)}</td></tr>
      <tr class="sum"><td></td><th>諸費用計 ⑤＋⑥＋⑦</th><td class="v">${yen(k.cash-k.vehicle-k.ctax)}</td></tr></table>
    <table class="oh"><colgroup><col style="width:18px"><col style="width:74px"><col></colgroup><tr><td class="ov" rowspan="7">下取車明細</td><th style="width:80px">車名</th><td></td></tr><tr><th>年式 / 型式</th><td></td></tr><tr><th>車台番号</th><td></td></tr><tr><th>色</th><td></td></tr><tr><th>走行距離</th><td></td></tr><tr><th>車検期限</th><td></td></tr><tr><th>現所有者</th><td>${k.trade?'（下取 '+yen(k.trade)+' 円）':''}</td></tr></table>
  </div><div>
    <table class="oh"><colgroup><col style="width:74px"><col></colgroup><tr><th>保証</th><td>${k.ws?'なし（現状渡し）':warNone(b)?'なし':'保証付　'+esc(warText(b))}</td></tr><tr><th>納車整備</th><td>${k.ws?'なし（現状渡し）':'「'+esc(tierOf(k.tier).name)+'」を実施して渡す'}</td></tr><tr><th>登録・車検</th><td>${esc(regOf(b.regType).l)}・${shakenText(b,k)}</td></tr></table>
    <table class="oh"><colgroup><col style="width:18px"><col style="width:46px"><col></colgroup><tr><td class="ov" rowspan="4">ご購入者</td><th style="width:52px">お名前</th><td>${u?esc(u.name):''}<div class="oh-sign"></div><div style="font-size:8px;text-align:right">（自署）</div></td></tr>
      <tr><td colspan="2" class="oh-chk">☐ 私は、暴力団等の反社会的勢力ではなく、今後も関わらないことを表明し確約します。</td></tr>
      <tr><th>ご住所</th><td>${u?esc(u.addr):''}</td></tr><tr><th>TEL</th><td>${u?esc(u.tel):''}</td></tr></table>
    <table class="oh"><colgroup><col style="width:18px"><col><col style="width:70px"></colgroup><tr><td class="ov" rowspan="${opts.length+1}">特別仕様・付属品明細</td><th colspan="2" style="text-align:center">品名（☆ ご要望による・外せます）</th></tr>${opts.map(r=>`<tr><th>${r[0]}</th><td class="v">${r[1]}</td></tr>`).join('')}</table>
    <table class="oh"><colgroup><col style="width:18px"><col><col style="width:64px"></colgroup><tr><td class="ov" rowspan="4" style="font-size:7.5px">リサイクル</td><th>シュレッダーダスト料金</th><td class="v"></td></tr><tr><th>エアバッグ類料金</th><td class="v"></td></tr><tr><th>フロン類料金</th><td class="v"></td></tr><tr class="sum"><th>預託金合計</th><td class="v">${yen(k.nonTax)}</td></tr></table>
  </div></div>
  <div class="oh-foot"><div>課税10%対象（税抜 ${yen(k.taxable)}　消費税 ${yen(k.ctax)}）　非課税対象（${yen(k.nonTax)}）　不課税・立替（${yen(k.tate)}）<br>【お振込先】${esc(c.bank)}<br>${condText(b, k.ws)}</div>
    <div><b>【備考・お約束事項】</b><br>${esc(o.promise||'')}${L?`<br>信販会社の承諾前に登録・修理に着手することを ${o.startBefore==='irai'?'依頼する':'依頼しない'}`:''}</div></div>`;
}
window.addEventListener('resize', fitPaper);
const C = () => S.set.company;
const kindMark = () => _docNew ? '（ <span class="c">新車</span> ・ 中古車 ）' : '（ 新車 ・ <span class="c">中古車</span> ）';
function head(title, dates, label){ return `<div class="p-top"><div class="p-kind">${kindMark()}</div><div class="p-date">${dates}</div></div><div class="p-title">${title}</div><div class="p-no">No：${label}</div>`; }
function parties(who){ const c = C();
  return `<div class="bx hb cust"><div class="vt">お客様</div><div class="in"><div class="kv"><span class="k">お名前</span><span class="nm">${who&&who.name?esc(who.name):'　　　　　　'} 様</span><span class="k">ご住所</span><span>${who?esc(who.addr):''}</span><span class="k">TEL</span><span>${who?esc(who.tel):''}</span></div></div></div>
    <div class="comp"><div class="nm">${esc(c.name)}</div><div class="seal">小林<br>モーター<br>ス之印</div>${esc(c.zip)} ${esc(c.addr)}<br>TEL ${esc(c.tel)}<br>登録番号 ${esc(c.inv)}　古物商 ${esc(c.kobutsu)}<br><span style="color:var(--pb)">担当者：</span>${esc(who?who.staff:S.set.staff[0])}</div>`; }
function condText(b, ws){ if (ws) return '業販価格（現状渡し）です。名義変更・登録・陸送はお買い上げ側でお願いします。納車整備・保証はありません。';
  const {y,m} = ym(regDateOf(b)), R = regOf(b.regType); return `支払総額は${y}年${m}月${R.buyerReg?'予備検査（登録はお客様側）':R.l+'の手続き'}、${esc(C().area)}の場合の費用です。お客様のご要望によるオプション等の費用は含みません。`; }
const kmText = (car, b) => b && b.newCar ? '新車' : car.km.toLocaleString()+'km（実走）';
function flags(k, b, car){
  if (k.ws) return `<div class="flags"><span>現状渡し</span><span class="no">納車整備なし</span><span class="no">保証なし</span><span>リ済込</span><span>走行 ${kmText(car,b)}</span><span>修復歴 ${esc(b.repair)}</span></div>`;
  return `<div class="flags"><span>定期点検整備付（${esc(k.tier&&k.tier!=='L'?tierOf(k.tier).name:k.bc.seibiInfo.name)}）</span><span>${warNone(b)?'保証なし':'保証付 '+esc(warText(b))}</span><span>リ済込</span><span>走行 ${kmText(car,b)}</span><span>修復歴 ${esc(b.repair)}</span></div>`; }
function shakenText(b, k){ const R = regOf(b.regType);
  if (k && k.ws) return '現状のまま（登録はお買い上げ側）';
  if (!R.insp) return `車検残 ${b.shakenEnd.replace('-','年')}月まで`;
  if (R.buyerReg) return '予備検査を受けて渡す（登録はお客様側）';
  return `2年付 受渡し（${R.l}・${esc(k&&k.tier&&k.tier!=='L'?tierOf(k.tier).name:k?k.bc.seibiInfo.name:tierOf('L').name)}）`; }
function totalBox(d, k, label){ return `<div class="total"><div class="t1"><span>${label}</span><span>${k.loan?'ローンご利用':'現金'}</span></div><div class="t2"><span>お支払総額（税込）</span><b>¥ ${yen(k.net)}</b></div><div class="t3"><span>車両価格（税込）${yen(k.bodyIn)}</span><span>☆ ${yen(Math.floor(k.optSum*1.1))}</span><span>${k.trade?'下取 −'+yen(k.trade):''}</span></div><div class="cond">${condText(d.ctx.b, k.ws)}</div>${flags(k,d.ctx.b,d.car)}</div>`; }
function priceBox(k){ const sm = (k.bc.seibiIn>0);   // 納車整備（いちばん下の段）は車両本体に含む
  return `<div class="bx hb"><div class="vt">車両販売価格</div><div class="in" style="padding:3px 0">
    <div class="pr"><span class="k">① ${k.ws?'業販価格（税抜・現状渡し）':'車両本体価格（税抜）'}<span class="tag s">★</span></span><span class="v">${yen(k.body)}</span></div>
    ${sm?`<div class="pr sub"><span>　定期点検整備付（${esc(k.bc.seibiInfo.name)} ${yen(k.bc.seibiIn)}円を含む）</span><span></span></div>`:''}
    <div class="pr"><span class="k">② 値引き</span><span class="v">${k.disc?'▲'+yen(k.disc):''}</span></div>
    <div class="pr"><span class="k">③ 特別仕様・付属品計<span class="tag o">☆</span></span><span class="v">${k.optSum?yen(k.optSum):''}</span></div>
    <div class="pr hl"><span class="k">④ 車両販売価格 ①〜③</span><span class="v">${yen(k.vehicle)}</span></div>
    <div class="pr"><span class="k">⑤ 課税販売諸費用計</span><span class="v">${yen(k.feeKSum+k.bc.unexpTax+k.bc.unexpJb+k.condK)}</span></div>
    <div class="pr"><span class="k">⑥ 非課税・立替 諸費用計</span><span class="v">${yen(k.nonTax+k.legalSum+k.condT)}</span></div>
    <div class="pr"><span class="k">⑦ 税・保険料計（立替）</span><span class="v">${yen(k.taxIns)}</span></div>
    <div class="pr"><span class="k">⑧ 消費税合計　10.00%</span><span class="v">${yen(k.ctax)}</span></div>
    <div class="pr hl"><span class="k">⑨ 現金販売価格 ④〜⑧</span><span class="v">${yen(k.cash)}</span></div>
    <div class="pr sub"><span>課税10%対象 ${yen(k.taxable)}（消費税 ${yen(k.ctax)}）／非課税 ${yen(k.nonTax)}／不課税（立替）${yen(k.tate)}</span><span></span></div>
    <div class="pr"><span class="k">⑩ 下取車価格</span><span class="v">${k.trade?'▲'+yen(k.trade):''}</span></div>
    <div class="pr"><span class="k">⑪ 下取車残債</span><span class="v">${k.tradeLoan?yen(k.tradeLoan):''}</span></div>
    <div class="pr fin"><span class="k">差引お支払総額 ⑨〜⑪</span><span class="v">${yen(k.net)}</span></div></div></div>`; }
function carBox(car, b, k, small){
  const shk = shakenText(b, k);
  return `<div class="bx hb car"><div class="vt">販売車輌明細</div><div class="in"><div class="ph"${small?' style="height:56px"':''}>${carSvg(car,'車両写真（カードの写真）')}</div>
    <div class="kv"><span class="k">車名</span><span>${esc(car.maker)} ${esc(car.model)}</span><span class="k">年式</span><span>${wareki(car.firstReg)}</span><span class="k">グレード</span><span>${esc(car.grade)}</span><span class="k">色</span><span>${esc(car.color)}</span>
    <span class="k">走行距離</span><span>${kmText(car,b)}</span><span class="k">排気量</span><span>${ccU(car)}</span><span class="k">型式</span><span>${esc(car.fmodel)}</span><span class="k">管理番号</span><span>${esc(car.num)}</span>
    <span class="k">修復歴</span><span>${esc(b.repair)}</span><span class="k">記録簿</span><span>あり</span><span class="k">車検</span><span style="grid-column:span 3">${shk}</span><span class="k">保証</span><span style="grid-column:span 3">${k.ws?'なし（現状渡し）':warNone(b)?'なし':'保証付　'+esc(warText(b))}</span></div>
    ${small?'':`<div class="equip"><span style="color:var(--pb)">装備　</span>${eqPicks(car).slice(0,6).map(esc).join('・')} ほか …… <b>別紙「装備品一覧」のとおり</b></div>`}</div></div>`; }
function optsBox(k){
  if (k.ws) return `<div class="bx hb"><div class="vt">特別仕様及び付属品</div><div class="in opts"><div class="tiny">（業販・現状渡しのため、オプション・納車整備はありません）</div><div class="yohaku">以下余白</div></div></div>`;
  const L0 = k.bc.seibiInfo;
  return `<div class="bx hb"><div class="vt">特別仕様及び付属品</div><div class="in opts"><div class="hd">☆ お客様のご要望によるオプション（任意・外せます）</div>
    ${k.inPlan.map(x=>`${optLines(x).map(([n,a,tbd])=>`<div class="ln"><span>${esc(n)}</span><span>${tbd?OPT_TBD:+a?yen(a):'サービス'}</span></div>`).join('')}${x.up?`<div class="desc">「${esc(tierOf(x.up).name)}」の内容：${esc(tierOf(x.up).note)}</div>`:''}`).join('') || '<div class="tiny">（なし）</div>'}
    <div class="hd" style="margin-top:4px">${esc(L0.name)}の内容（車両価格に含む）</div><div class="desc">${esc(L0.note)}</div><div class="yohaku">以下余白</div></div></div>`; }
function feesBox(k){
  return `<div class="bx hb"><div class="vt">販売諸費用</div><div class="in" style="padding:3px 0">
    ${k.feeK.map(f=>`<div class="pr"><span class="k">${f[0]}<span class="tag s">★</span></span><span class="v">${f[1]?yen(f[1]):''}</span></div>`).join('')}
    ${k.bc.unexpTax?`<div class="pr"><span class="k">自動車税 未経過相当額</span><span class="v">${yen(k.bc.unexpTax)}</span></div>`:''}
    ${k.bc.unexpJb?`<div class="pr"><span class="k">自賠責 未経過相当額</span><span class="v">${yen(k.bc.unexpJb)}</span></div>`:''}
    ${k.condRows.filter(r=>r[2]==='k').map(r=>`<div class="pr"><span class="k">${r[0]}<span class="tag c">◎</span></span><span class="v">${yen(r[1])}</span></div>`).join('')}
    ${k.legal.map(f=>`<div class="pr"><span class="k">${f[0]}<span class="tag s">★</span></span><span class="v">${f[1]?yen(f[1]):''}</span></div>`).join('')}
    <div class="pr"><span class="k">リサイクル預託金相当額【リ済込】</span><span class="v">${yen(k.nonTax)}</span></div>
    ${k.condRows.filter(r=>r[2]==='t').map(r=>`<div class="pr"><span class="k">${r[0]}<span class="tag c">◎</span></span><span class="v">${yen(r[1])}</span></div>`).join('')}
    <div class="pr"><span class="k">${k.bc.kei?'軽自動車税（新たな課税なし）':'自動車税（'+ym(k.bc.rd).m+'月登録にて）'}</span><span class="v">${k.bc.carTax?yen(k.bc.carTax):''}</span></div>
    <div class="pr"><span class="k">自動車重量税</span><span class="v">${k.bc.weight?yen(k.bc.weight):''}</span></div>
    <div class="pr"><span class="k">自賠責保険料</span><span class="v">${k.bc.jibai?yen(k.bc.jibai):''}</span></div></div></div>`; }
function payBox(k){ const L = k.loan; return `<div class="bx hb"><div class="vt">お支払プラン</div><div class="in" style="padding:3px 0">
  <div class="pr"><span class="k">頭金</span><span class="v">${L&&L.down?yen(L.down):''}</span></div><div class="pr"><span class="k">現金・割賦元金</span><span class="v">${L?yen(L.P):yen(k.net)}</span></div>
  <div class="pr"><span class="k">回数・期間</span><span class="v">${L?L.n+'回（'+(L.n/12)+'年）':''}</span></div><div class="pr"><span class="k">初回／2回目以降</span><span class="v">${L?yen(L.first)+'／'+yen(L.later):''}</span></div>
  <div class="pr"><span class="k">分割手数料（実質年率 ${L?L.rate+'%':'—'}）</span><span class="v">${L?yen(L.fee):''}</span></div><div class="pr hl"><span class="k">割賦販売価格（支払総額）</span><span class="v">${L?yen(L.hanbai):''}</span></div></div></div>`; }
function remarkBox(car, t){ return `<div class="bx hb"><div class="vt">備考</div><div class="in remark">管理番号 ${esc(car.num)}\n【お振込先】${esc(C().bank)}${t?'\n'+t:''}</div></div>`; }
/* 見積書＝帳票サンプルの「1. ショールーム」（🗣 2026-10-16「いま使ってる帳票は一旦サンプルに覚えておく形で、サンプルから1のショールームを見積タブから使うように」）
   前の見積書は docQuoteOld（帳票サンプル ▸ 見積書の 6番に残す）。OP が多い時は2ページ目（別紙）も付く */
function quotePapers(d, k){ const v = QV[0], q = qvFold(qvData(Object.assign({ tradeModel: (d.who && d.who.tradeModel) || '' }, d), k), v);
  return `<div class="paper qvp">${v.render(q)}</div>` + (q.fold ? `<div class="paper qvp">${qvPage2(q, v)}</div>` : ''); }
/* プラン比較・装備品一覧も帳票サンプルのショールームに（🗣 2026-10-16「プラン比較、装備品も一旦ショールームに揃えて。売買契約書と約款は今のもの」）
   前の形は docCompare・docEquip（帳票サンプルの各 1番に残す） */
const sampQ = (d, k) => qvData(Object.assign({ tradeModel: (d.who && d.who.tradeModel) || '' }, d), k);
const cmpShow = (d, k) => QC[3].render(sampQ(d, k || calc(d.ctx)));
const eqShow = (d, k) => QE[1].render(sampQ(d, k || calc(d.ctx)));
function docQuoteOld(d,k){ const p = d.ctx.plan; return head('御 見 積 書',`見積日：${jd(TODAY)}　有効期限：${jd(addDays(TODAY,C().valid))}`, `${esc(estNo(d.car, p ? (p==='D'?'D':p) : 'base', d.who))}　${p?`プラン ${p}（${esc(planName(p))}）`:'基本（オプションなし・掲載の支払総額）'}`) +
  `<div class="p-grid">${parties(d.who)}${totalBox(d,k,'お見積')}<div></div>${priceBox(k)}${carBox(d.car,d.ctx.b,k)}${optsBox(k)}<div>${feesBox(k)}</div>${payBox(k)}${remarkBox(d.car)}</div>`; }
function docOrder(d,k){ const o = d.car.order; return head('注 文 書',`注文日：${jd(o.date)}　納車予定日：${jd(o.delivery)}`, `${esc(o.no || estNo(d.car, o.plan, d.who))}　プラン ${o.plan}（${esc(planName(o.plan))}）`) + (o.ver>1?`<div class="vbadge">版${o.ver}（変更あり）</div>`:'') +
  `<div class="p-grid">${parties(d.who)}${totalBox(d,k,'ご注文')}<div class="bx hb"><div class="vt">お約束</div><div class="in remark">${esc(o.promise||'（なし）')}</div></div>${priceBox(k)}${carBox(d.car,d.ctx.b,k,true)}${optsBox(k)}<div>${feesBox(k)}</div>${payBox(k)}
   <div><div class="bx hb"><div class="vt">約款</div><div class="in tiny">裏面の約款に同意のうえ注文します。自動車はクーリング・オフの対象外です。${k.loan?`<br>信販会社の承諾前に登録・修理に着手することを <b>${o.startBefore==='irai'?'依頼する':'依頼しない'}</b>（承諾が得られない時の実費はお客様負担）`:''}</div></div><div style="height:6px"></div>${remarkBox(d.car)}</div></div>
   <div class="sign"><div class="bx">ご注文者 署名・捺印</div><div class="bx">販売店 承認印</div></div>`; }
function docCond(d,k){ const b = d.ctx.b; return head('車 両 状 態 確 認 書',`作成日：${jd(TODAY)}`, esc(d.car.num)) + `<div class="p-grid">${parties(d.who)}</div><div style="margin-top:8px">${carBox(d.car,b,k)}</div>
  <div class="bx hb" style="margin-top:8px"><div class="vt">車両の状態</div><div class="in remark" style="min-height:170px;font-size:12px">修復歴 ${esc(b.repair)}。\n要整備箇所：なし\n現状の不具合：（カード詳細の車両メモから）</div></div>
  <div class="bx hb" style="margin-top:8px"><div class="vt">整備・保証</div><div class="in remark" style="font-size:11.5px">${k.ws?'納車整備なし・保証なし（現状渡し）':esc(tierOf(k.tier).name)+'：'+esc(tierOf(k.tier).note)+'\n'+(warNone(b)?'保証なし':'保証付：'+esc(warText(b))+'（保証書の範囲で保証）')}\n走行距離：${kmText(d.car,b)}</div></div>
  <div class="tiny" style="margin-top:6px">上記の状態を確認のうえ購入します。（写しを2年保存）</div><div class="sign"><div class="bx">お客様 確認署名</div><div class="bx">説明担当</div></div>`; }
function docInvoice(d,k){ const bill = k.loan ? k.loan.down : k.net; return head('ご 請 求 書',`請求日：${jd(TODAY)}　お支払期限：${jd(addDays(TODAY,10))}`, esc(d.car.num)) +
  `<div class="p-grid">${parties(d.who)}<div class="total"><div class="t1"><span>ご請求金額</span><span></span></div><div class="t2"><span>合計（税込）</span><b>¥ ${yen(bill)}</b></div>${k.loan?'<div class="cond">割賦元金はローン会社から。ここは頭金のご請求です。</div>':''}</div><div></div>${priceBox(k)}${remarkBox(d.car,'※ 振込手数料はお客様のご負担でお願いします')}</div>
  <table class="cmp"><tr><th>適格請求書の内訳</th><th>対象額</th><th>消費税</th></tr><tr><td>課税 10%</td><td class="v">${yen(k.taxable)}</td><td class="v">${yen(k.ctax)}</td></tr><tr><td>非課税（リサイクル預託金相当額）</td><td class="v">${yen(k.nonTax)}</td><td class="v">—</td></tr><tr><td>不課税（立替：税・保険・法定費用）</td><td class="v">${yen(k.tate)}</td><td class="v">—</td></tr></table>
  <div class="tiny" style="margin-top:6px">登録番号 ${esc(C().inv)}／端数処理は税率ごとに1回（切り捨て）</div>`; }
function docDelivery(d,k){ return head('納 品 書',`納品日：${jd(d.car.order.delivery)}`, esc(d.car.num)) + `<div class="p-grid">${parties(d.who)}<div></div><div></div>${carBox(d.car,d.ctx.b,k)}<div>${optsBox(k)}<div class="bx hb" style="margin-top:7px"><div class="vt">お引渡し</div><div class="in remark">・車検証 ・自賠責保険証明書 ・リサイクル券\n・保証書 ・スペアキー ・取扱説明書 ・整備記録簿</div></div></div></div>
  <div class="pr fin" style="margin-top:8px"><span class="k">お支払総額（税込）</span><span class="v">${yen(k.net)}</span></div><div class="sign"><div class="bx">上記の車両を受領しました（お客様 署名）</div><div class="bx">引渡し担当</div></div>`; }
/* プラン比較で比べるプラン（🗣 2026-10-02「プラン比較の印刷画面はどれを選択するか選べるように。最低2つから」）。S.ui.cmpSel に持つ。2つ未満なら全部 */
const cmpAll = d => (d.who ? custPlans(d.who) : plansOf(d.car.std.showD)).filter(p=>p!=='base');
/* 🗣「ベースの列も外せるように。ある程度プラン絞った後に出す可能性あるし」→ 'base' も選べる。2つ以上はベースも数に入れる（プランは最低1つ） */
function cmpCols(d){ const all = ['base'].concat(cmpAll(d)), sel = (S.ui.cmpSel||[]).filter(p=>all.includes(p)); return sel.length>=2 && sel.some(p=>p!=='base') ? all.filter(p=>sel.includes(p)) : all; }
const cmpPlans = d => cmpCols(d).filter(p=>p!=='base');
const cmpBaseOn = d => cmpCols(d).includes('base');
function cmpToggle(p){ const d = docCtx(), all = ['base'].concat(cmpAll(d)), cur = cmpCols(d).slice(), i = cur.indexOf(p);
  if (i>=0){ if (cur.length<=2) return toast('比べるのは2つ以上にしてください'); if (p!=='base' && cur.filter(x=>x!=='base').length<=1) return toast('プランは1つ以上残してください'); cur.splice(i,1); } else cur.push(p);
  S.ui.cmpSel = all.filter(x=>cur.includes(x)); save(); renderDocs(); }
function docCompare(d){
  const car = d.car, u = d.who, base = calc({ car, b: u ? u.baseSnap : car.base });
  const ctxOf = p => u ? custCtx(car,u,p) : stdCtx(car,p);
  const ps = cmpPlans(d);
  const ks = ps.map(p=>calc(ctxOf(p))), items = u ? u.items : stdItems(car), rec = u ? u.rec : (car.std.rec||S.set.packs.rec);
  const same = arr => arr.every(v=>v===arr[0]);
  const cls = i => ps[i]===rec ? 'rec' : '';
  const row = (label, vals) => (diffOnly && same(vals.map(String))) ? '' : `<tr><td>${label}</td><td class="v"><span class="no">—</span></td>${vals.map((v,i)=>`<td class="v ${cls(i)}">${v}</td>`).join('')}</tr>`;
  const n = ps.length;
  return head('お 見 積 く ら べ',`見積日：${jd(TODAY)}　有効期限：${jd(addDays(TODAY,C().valid))}`, esc(estBase(car, u))) + `<div class="p-grid">${parties(u)}</div>
  <div class="car" style="display:grid;grid-template-columns:230px 1fr;gap:14px;margin-top:8px;align-items:center"><div class="ph">${carSvg(car)}</div><div><div style="font-size:17px;font-weight:800">${esc(car.maker)} ${esc(car.model)} ${esc(car.grade)}</div><div class="tiny" style="font-size:11px">${wareki(car.firstReg)}・${kmText(car, u?u.baseSnap:car.base)}・${esc(car.color)}</div>${flags(base,u?u.baseSnap:car.base,car)}</div></div>
  <table class="cmp"><tr><th></th><th class="base">ベース（オプションなし）<br><span style="font-weight:400;font-size:9.5px">掲載の支払総額</span></th>${ps.map(p=>`<th class="${p===rec?'rec':''}">${p}・${esc(planName(p))}${p===rec?'<span class="recb">おすすめ</span>':''}</th>`).join('')}</tr>
   <tr><td>車両価格（税込）</td><td class="v">${yen(base.bodyIn)}</td>${ks.map((k,i)=>`<td class="v ${cls(i)}">${k.ws?yen(k.bodyIn)+'<span class="mo">業販価格</span>':'共通'}</td>`).join('')}</tr>
   <tr><td>諸費用・税・保険（★）</td><td class="v">${yen(base.cash-base.bodyIn)}</td>${ks.map((k,i)=>`<td class="v ${cls(i)}">${k.ws?yen(k.nonTax)+'<span class="mo">リサイクルのみ</span>':'共通'}</td>`).join('')}</tr>
   ${PACK_HOLD ? '' : row('メンテナンスパック', ks.map(k=>k.ws?'<span class="no">なし</span>':k.tier!=='L'?esc(tierOf(k.tier).name.replace('メンテナンスパック',''))+`<span class="mo">＋${yen(packAdd(k.tier))}</span>`:'<span class="no">なし（点検のみ）</span>'))}
   ${row('保証', ks.map(k=>k.ws?'<span class="no">なし</span>':esc(planWar(k.tier)||warText(u ? u.baseSnap : car.base))))}
   ${items.map(x=>row(esc(x.n), ps.map(p=>p!=='D'&&x.in[p]?`<span class="ok">✓</span> ${yen(x.a)}`:'<span class="no">—</span>'))).join('')}
   ${ks.some(k=>k.disc)?row('値引き', ks.map(k=>k.disc?'▲'+yen(k.disc):'<span class="no">—</span>')):''}
   ${u && ks[0].condRows.length?`<tr><td>この方の条件（◎）</td><td class="v"><span class="no">—</span></td><td class="all" colspan="${n}">${ks[0].condRows.map(r=>r[0]).join('・')}（D を除く）</td></tr>`:''}
   ${u && ks[0].trade?`<tr><td>下取</td><td class="v"><span class="no">—</span></td><td class="all" colspan="${n}">全プラン共通　▲${yen(ks[0].trade)}</td></tr>`:''}
   <tr class="tot"><td>お支払総額（税込）</td><td class="v">¥ ${yen(base.cash)}</td>${ks.map((k,i)=>`<td class="v ${cls(i)}">¥ ${yen(k.net)}</td>`).join('')}</tr>
   <tr><td>ベースとの差額</td><td class="v">—</td>${ks.map((k,i)=>`<td class="v ${cls(i)}">${k.cash-base.cash>=0?'＋':'−'}${yen(Math.abs(k.cash-base.cash))}${k.ws?'':`<span class="mo">☆ ${yen(Math.floor(k.optSum*1.1))}</span>`}</td>`).join('')}</tr>
   ${ks[0].loan?`<tr><td>ローン<br><span class="tiny">頭金${yen(ks[0].loan.down)}・${ks[0].loan.n}回・実質年率${ks[0].loan.rate}%</span></td><td class="v"></td>${ks.map((k,i)=>`<td class="v ${cls(i)}">月々 ${yen(k.loan.later)}<span class="mo">割賦販売価格 ${yen(k.loan.hanbai)}</span></td>`).join('')}</tr>`:''}
  </table><div class="tiny" style="margin-top:6px">※ オプション込みの金額は参考です（付けない＝ベースのままでもご購入いただけます）。※ ${condText(u?u.baseSnap:car.base)}${ps.includes('D')?'　※ D：'+condText(null,true):''}</div>`; }
/* =====================================================================
   プライスボード（🗣 2026-10-05「今自社で使ってる奴（イラレ）を再現できる？」→「1〜4でやってみていい」）
   元＝社内のイラレの型紙（ベーシック＋1〜12月・A3 横 420×297mm）と装備アイコン（装備アイコン_260623・113個）
   作り：型紙から「車ごとに変わる文字・装備アイコン・保証の枠」だけを消した背景（board\bg.json）の上に、
         変わる文字を型紙と同じ位置（mm・文字の基準線）で重ねる。数字は Impact（型紙と同じ書体）
   ⚠ 見出しの「ヒラギノ角ゴ W8/W9」はアプリで使えないので、変わる文字（車名・グレードの帯など）だけ Noto Sans JP の極太で代わりにしている
   装備アイコン：装備品チェックの「あり」→ プライスに出す10個を選ぶ（🗣「装備品チェック→ありの一覧→10個に絞る」）
   ===================================================================== */
const BRD = window.BOARD || null;
/* 装備品チェックの項目 → アイコンの名前（アイコンの一覧の表記のまま） */
const BRD_MAP = { bt:'ブルートゥース', bcam:'バックカメラ', fcam:'フロントカメラ', scam:'サイドカメラ', acam:'全周囲カメラ', ac:'エアコン', wac:'デュアルエアコン',
  acc:'レーダークルーズ', cc:'クルーズコントロール', sh:'シートヒーター', scool:'シートクーラー', lea:'レザーシート', psea:'パワーシート', row3:'3列シート', walk:'ウォークスルー',
  skey:'スマートキー', push:'プッシュスタート', pgate:'電動リアゲート', etc:'ETC', ahb:'オートハイビーム', aeb:'衝突被害軽減ブレーキ', lane:'レーンキープ', apark:'自動駐車',
  passist:'パーキングアシスト', alu:'純正アルミホイール', aero:'エアロパーツ', sun:'サンルーフ', low:'ローダウン', idle:'アイドリングストップ', own1:'ワンオーナー', nosmoke:'禁煙車',
  manual:'取扱説明書', warr:'保証書', cd:'CD再生', dvd:'DVD再生', nav:'純正ナビ' };
/* 自動で選ぶ時の順番（いまのプライスで前に出ている物から） */
const BRD_PRI = ['衝突被害軽減ブレーキ','両側電動スライドドア','両側スライド片側電動ドア','電動リアゲート','純正ナビ','フルセグTV','ワンセグTV','バックカメラ','全周囲カメラ','ブルートゥース','ETC',
  'スマートキー','LEDヘッドライト','HIDライト','レーダークルーズ','シートヒーター','レザーシート','パワーシート','3列シート','ウォークスルー','オートハイビーム','レーンキープ','ワンオーナー','禁煙車',
  'プッシュスタート','アイドリングストップ','純正アルミホイール','サンルーフ','エアロパーツ','デュアルエアコン','クルーズコントロール','パーキングアシスト','DVD再生','CD再生','取扱説明書','保証書'];
const brdIcon = label => BRD ? BRD.icons.findIndex(x=>x.label===label) : -1;
/* 装備品チェックの「あり」→ アイコン（重複なし） */
function brdAvail(car){ const s = eqStateOf(car), out = [];
  const add = l => { const i = brdIcon(l); if (i>=0 && !out.includes(i)) out.push(i); };
  Object.entries(BRD_MAP).forEach(([k,l])=>{ if (s[k]==='on') add(l); });
  if (s.tv==='フルセグ') add('フルセグTV'); else if (s.tv==='ワンセグ') add('ワンセグTV');
  if (s.psd==='両側') add('両側電動スライドドア'); else if (s.psd==='左側' || s.psd==='右側') add('両側スライド片側電動ドア');
  if (s.head==='LED') add('LEDヘッドライト'); else if (s.head==='HID') add('HIDライト');
  const pr = l => { const j = BRD_PRI.indexOf(BRD.icons[l].label); return j<0 ? 99 : j; };
  return out.sort((a,b)=>pr(a)-pr(b)); }
function brdIcons(car){ return car.board && car.board.icons ? car.board.icons : brdAvail(car).slice(0,10); }
function brdSeasons(){ return BRD ? Object.keys(BRD.bg).sort((a,b)=>(parseInt(a)||0)-(parseInt(b)||0)) : []; }
/* 絵（季節の型紙）は車ごとに持つ（car.board.season）。まだ選んでいない車は今月の絵 */
function brdMonth(){ const L = brdSeasons(), m = +TODAY.slice(5,7); return L.find(x=>x.startsWith(m+'月')) || 'ベーシック'; }
function brdSeason(car){ const L = brdSeasons(), cur = car && car.board && car.board.season; return L.includes(cur) ? cur : brdMonth(); }
function brdSetSeason(cid, key){ const car = carOf(cid); snap(); car.board = Object.assign({ icons: brdAvail(car).slice(0,10) }, car.board, { season:key }); save(); }
/* プライスに出す文字（装備品チェックの欄：ミッション・記録簿・使用歴・ナンバーの区分。本物では装備品チェックに入れる） */
function brdInfo(car){ const s = eqStateOf(car), b = car.base;
  return { tm: s.tm || (/ミニ|MINI/.test(car.model) ? 'AT' : 'CVT'), rec: s.rec || '有', use: s.use || '自家用',
    plate: s.plate3 || (car.kei ? '軽' : car.cc > 2000 ? '3 ナンバー' : '5 ナンバー') }; }
const SEN_SY = 0.86;   // 🗣「.2 の所をもうちょいつぶさないと支払総額が見切れる」→ 縦を 86% に（下の線はそのまま）
const brdYear = s => { const {y, m} = ym(s); return (y>2019 || (y===2019 && m>=5)) ? 'R'+(y-2018) : String(y-1988); };   // 型紙と同じ：令和は R、平成は数字だけ（H28 → 28）

function docBoard(car){
  if (!BRD) return '<div style="padding:40px">プライスの材料（board\\*.json）がありません。build.py を走らせ直す</div>';
  const b = car.base, k = calc(baseCtx(car)), key = brdSeason(car), bg = BRD.bg[key], col = bg.col.price || '#d71519', gold = bg.col.gold, inf = brdInfo(car);   // gold＝12月の金の縁取り
  /* 支払総額は 1,000円単位で切り上げ（表示が実際より安くならないように）。諸費用＝支払総額 − 車両価格 */
  const total = Math.ceil(k.cash/1000)*1000, man = Math.floor(total/10000), sen = Math.round(total%10000/1000), fee = total - k.bodyIn;
  const R = regOf(b.regType), insp = R.insp, se = ym(b.shakenEnd);
  const seY = (se.y>2019 || (se.y===2019 && se.m>=5)) ? 'R'+(se.y-2018) : 'H'+(se.y-1988);
  const war = warText(b), w3y = /3年|３年/.test(war), w3m = /3か月|3ヶ月|３か月|3カ月/.test(war);
  const NJ = (w) => `font-family="'Noto Sans JP','Hiragino Kaku Gothic StdN',sans-serif" font-weight="${w}"`;
  const IMP = `font-family="Impact,'Arial Narrow Bold',sans-serif"`, YG = `font-family="'Yu Gothic','YuGothic',sans-serif" font-weight="700"`;
  const icons = brdIcons(car).slice(0,10), slots = BRD.misc.slots;
  const grade = `${car.grade||''}${car.gradeSub?' '+car.gradeSub:''}`;
  const m = +TODAY.slice(5,7);
  return `<svg class="brd-svg" viewBox="0 0 420 297" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <image href="${bg.img}" x="0" y="0" width="420" height="297" preserveAspectRatio="none"/>
    <text x="119.69" y="53.59" ${IMP} font-size="31.6" fill="#fff" data-maxw="36">${brdYear(car.firstReg)}</text>
    <text x="175.25" y="39.62" ${NJ(900)} font-size="25.95" fill="#231916" data-maxw="158" letter-spacing="0.4">${esc(car.model)}</text>
    ${insp ? `<text x="206.75" y="61.9" ${NJ(900)} font-size="19.01" fill="#231916">車検なし</text>`
      : `<text x="206.71" y="64.02" fill="#231916"><tspan ${IMP} font-size="23.87">${seY}</tspan><tspan ${NJ(800)} font-size="13.35" dx="2.2">年</tspan><tspan ${IMP} font-size="23.87" dx="5">${se.m}</tspan><tspan ${NJ(800)} font-size="13.35" dx="2.2">月</tspan></text>`}
    <text x="338.33" y="63.84" ${IMP} font-size="23.07" fill="#231916" data-maxw="32">${b.newCar ? '0.0' : (car.km/10000).toFixed(1)}</text>
    ${gold ? `<path d="M119 80H338V197H119Z M160 66H338V80H160Z M338 86H412V148.5H338Z" fill="#fff"/><rect x="110.6" y="100" width="8.4" height="40" fill="#181c62"/>` : ''}
    ${(gold ? [[gold, 3.2], ['#fff', 1.3]] : []).map(([sc, sw])=>`<text x="124" y="193.23" ${IMP} font-size="144.89" fill="${col}" stroke="${sc}" stroke-width="${sw}" stroke-linejoin="round" textLength="205.7" lengthAdjust="spacingAndGlyphs">${man}</text><circle cx="345.5" cy="138.2" r="5.3" fill="${col}" stroke="${sc}" stroke-width="${sw}"/><text transform="translate(360.87 147.36) scale(1 ${SEN_SY})" ${IMP} font-size="83.71" fill="${col}" stroke="${sc}" stroke-width="${sw}" stroke-linejoin="round">${sen}</text>`).join('')}
    <text x="124" y="193.23" ${IMP} font-size="144.89" fill="${col}" textLength="205.7" lengthAdjust="spacingAndGlyphs">${man}</text>
    <circle cx="345.5" cy="138.2" r="5.3" fill="${col}"/>
    <text transform="translate(360.87 147.36) scale(1 ${SEN_SY})" ${IMP} font-size="83.71" fill="${col}">${sen}</text>
    <text x="297.7" y="211.66" ${IMP} font-size="14.09" fill="#231916" text-anchor="end">${yen(k.bodyIn)}</text>
    <text x="399.76" y="211.72" ${IMP} font-size="14.09" fill="#231916" text-anchor="end">${yen(fee)}</text>
    <text x="127.93" y="225.22" ${NJ(800)} font-size="8.85" fill="#fff" data-maxw="287" xml:space="preserve">${esc(grade)}   ・  ${esc(inf.tm)}  ・  ${car.cc ? car.cc.toLocaleString().replace(',','') : ''} cc（${esc(inf.plate)}）</text>
    ${w3y ? `<image href="${BRD.misc.w3y}" x="145" y="229.5" width="86" height="32"/>`
      : w3m ? `<image href="${BRD.misc.w3m}" x="126.2" y="230.6" width="125.8" height="27.6"/>`
      : `<text x="148" y="252.5" ${NJ(900)} font-size="8" fill="#231916">${esc(war)}</text>`}
    <text ${YG} font-size="4.1" fill="#231916"><tspan x="127.44" y="263.61">修復歴：${/なし|無/.test(b.repair) ? '無' : esc(b.repair)}</tspan><tspan x="127.44" y="269.07">前使用者の定期点検整備記録簿：${esc(inf.rec)}</tspan><tspan x="127.44" y="274.54">使用歴：${esc(inf.use)}</tspan><tspan x="127.44" y="280.0">定期点検整備：納車時</tspan></text>
    <text ${YG} font-size="2.73" fill="#231916" xml:space="preserve"><tspan x="127.77" y="284.36">※支払総額には、車両価格、保険料、税金、登録費用、整備費用、リサイクル預託金相当額等、</tspan><tspan x="127.77" y="287.78">　購入時に必要な費用が全てが含まれています。</tspan><tspan x="127.77" y="291.19">※支払総額は${m} 月現在、千葉県内登録（届出）で店頭納車を行った場合の費用です。お客様の</tspan><tspan x="127.77" y="294.61">　ご要望に基づく整備やオプション等の費用は別途申し受けます。</tspan></text>
    ${icons.map((ix,i)=>{ const s = slots[i], ic = BRD.icons[ix]; return ic && s ? `<image href="${ic.img}" x="${s[0]-0.6}" y="${s[1]-0.6}" width="${s[2]+1.2}" height="${s[3]+1.2}"/>` : ''; }).join('')}
    ${(()=>{ const q = bg.km; return `<text x="${q.x}" y="${q.y}" ${NJ(800)} font-size="${q.size}" fill="${q.fill}" ${q.fill==='#ffffff'?'stroke="#231916" stroke-width="0.9" paint-order="stroke" stroke-linejoin="round"':''}>${esc(car.num)}</text>`; })()}
  </svg>`; }
/* 文字が枠を超える時は横に詰める（イラレで長体をかけるのと同じ） */
function brdFit(){ document.querySelectorAll('.brd-svg text[data-maxw]').forEach(t=>{ const mx = +t.dataset.maxw; t.removeAttribute('textLength'); try { if (t.getComputedTextLength() > mx){ t.setAttribute('textLength', mx); t.setAttribute('lengthAdjust','spacingAndGlyphs'); } } catch(e){} }); }

/* プライスに出す装備を選ぶ（🗣「プライス印刷の前に1画面挟む。装備品チェック→ありの一覧→10個に絞る」） */
function openBrdPick(cid){ const car = carOf(cid), av = brdAvail(car), cur = brdIcons(car), inf = brdInfo(car);
  S.ui.brdTmp = cur.slice();
  const draw = () => { const sel = S.ui.brdTmp;
    $('brd-pick').innerHTML = `<div class="brd-sel">${Array.from({length:10},(_,i)=>{ const ix = sel[i]; return ix!=null ? `<div class="it on" draggable="true" ondragstart="brdDrag(event,${i})" ondragover="event.preventDefault();this.classList.add('ov')" ondragleave="this.classList.remove('ov')" ondrop="brdDrop(event,${i})" onclick="brdTog(${ix})" title="ドラッグで並び替え・押すと外す"><img src="${BRD.icons[ix].img}" draggable="false"><span class="n">${i+1}</span></div>` : `<div class="it empty" ondragover="event.preventDefault()" ondrop="brdDrop(event,${i})"></div>`; }).join('')}</div>
      <div class="q-why" style="margin-top:4px">上の10個はドラッグで並び替え（1〜5 が上の段、6〜10 が下の段）。押すと外す</div>
      <div class="q-why" style="margin:8px 0 4px">装備品チェックで「あり」の装備（${av.length}個）。押した順に並ぶ（${sel.length}/10）</div>
      <div class="brd-av">${av.map(ix=>`<div class="it ${sel.includes(ix)?'on':''}" onclick="brdTog(${ix})"><img src="${BRD.icons[ix].img}"><small>${esc(BRD.icons[ix].label)}</small></div>`).join('')}</div>
      <details style="margin-top:8px"><summary class="q-why" style="cursor:pointer">「あり」以外のアイコンから足す（全${BRD.icons.length}個）</summary><div class="brd-av all">${BRD.icons.map((x,ix)=>av.includes(ix)?'':`<div class="it ${sel.includes(ix)?'on':''}" onclick="brdTog(${ix})"><img src="${x.img}"><small>${esc(x.label)}</small></div>`).join('')}</div></details>`; };
  window._brdDraw = draw;
  ov(`<div class="hd">${I('tag','🏷',16)} プライスに出す装備 ${esc(car.num)} ${esc(car.model)}<button class="x" onclick="closeOv()">✕</button></div><div class="bd">
      <div class="q-f" style="grid-template-columns:repeat(4,1fr);margin-bottom:10px">
        <div><label class="k">ミッション</label><input id="bp-tm" class="q-in" value="${esc(inf.tm)}"></div>
        <div><label class="k">ナンバーの区分</label><input id="bp-pl" class="q-in" value="${esc(inf.plate)}"></div>
        <div><label class="k">記録簿</label><input id="bp-rec" class="q-in" value="${esc(inf.rec)}"></div>
        <div><label class="k">使用歴</label><input id="bp-use" class="q-in" value="${esc(inf.use)}"></div></div>
      <div class="q-why" style="margin:-4px 0 10px">↑ 本物では装備品チェックの欄（モックではここで直せる）</div>
      <div id="brd-pick"></div></div>
    <div class="ft"><button class="q-btn" onclick="brdAuto('${cid}')">自動で選び直す</button><span style="flex:1"></span><button class="q-btn" onclick="closeOv()">やめる</button><button class="q-btn pri" onclick="brdSave('${cid}')">${I('printer','🖨',14)} この装備でプライスを出す</button></div>`, true);
  $('q-ov').firstElementChild.classList.add('wide'); draw(); }
function brdDrag(e, i){ e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; }
function brdDrop(e, to){ e.preventDefault(); const from = +e.dataTransfer.getData('text/plain'), s = S.ui.brdTmp; if (isNaN(from) || from===to) { window._brdDraw(); return; }
  const [x] = s.splice(from, 1); s.splice(Math.min(to, s.length), 0, x); window._brdDraw(); }
function brdTog(ix){ const s = S.ui.brdTmp, i = s.indexOf(ix); if (i>=0) s.splice(i,1); else if (s.length>=10){ toast('10個までです。先にどれかを外してください'); return; } else s.push(ix); window._brdDraw(); }
function brdAuto(cid){ S.ui.brdTmp = brdAvail(carOf(cid)).slice(0,10); window._brdDraw(); }
function brdSave(cid){ const car = carOf(cid); snap(); car.board = Object.assign({}, car.board, { icons:S.ui.brdTmp.slice() });
  car.eqx = Object.assign({}, car.eqx, { tm:$('bp-tm').value.trim(), plate3:$('bp-pl').value.trim(), rec:$('bp-rec').value.trim(), use:$('bp-use').value.trim() });
  save(); closeOv(); S.ui.doc = 'board'; if ($('q-docov').hidden) openDocs('board'); else renderDocs(); }

/* ---------- 装備品一覧（カードの装備品チェック tpl_equipment と同じ並び。値は KM-0480 の実データを元に車ごとに少し変えた見本） ----------
   本物：equipment-view.js の _buildPrintSheetHtml を作り直す。直す所
   ・縦1列 → 3段組で A4 縦1枚に収める（今は2枚以上になる）
   ・見積書と同じ紙（青・会社・管理番号・見積No）にして「2枚目」として一緒に刷れる
   ・社内の点検項目（動作確認のコメント「なし」など）は出さない／タイヤ溝は「状態」欄に図で
   ・価格は ① 土台から（支払総額・車両価格）＝見積書と同じ数字
   ・説明文（item.sub）がある装備は上の「おすすめ装備」に出す */
const EQ_TPL = [
  { t:'オーディオ・ナビ', i:'🎵', items:[['nav','カーナビ','tri','ナビはツイてなきゃ！'],['navm','ナビの媒体','select'],['tv','TV','select'],['bt','Bluetooth','tri'],['bcam','バックカメラ','tri','駐車が苦手でも安心'],['fcam','フロントカメラ','tri'],['scam','サイドカメラ','tri'],['acam','全周囲カメラ','tri'],['rmon','後部モニター','tri'],['cd','CD','tri'],['dvd','DVD再生','tri'],['mp','音楽プレーヤー接続','tri']] },
  { t:'快適装備・シート', i:'🛋️', items:[['ac','エアコン','tri'],['wac','デュアルエアコン','tri'],['cc','クルーズコントロール','tri'],['acc','レーダークルコン','tri','高速道路がラク'],['sh','シートヒーター','tri'],['scool','シートクーラー','tri'],['lea','革シート','tri'],['psea','パワーシート','tri'],['bench','ベンチシート','tri'],['row3','3列シート','tri','7人乗り'],['walk','ウォークスルー','tri'],['flat','フルフラットシート','tri']] },
  { t:'電装・キー・ドア', i:'🔑', items:[['skey','スマートキー','tri'],['kless','キーレス','tri'],['push','プッシュスタート','tri'],['rstart','リモートスタート','tri'],['spare','スペアキー','tri'],['pw','パワーウィンドウ','tri'],['psd','パワースライドドア','select','両手がふさがっていても開く'],['pgate','電動リアゲート','tri'],['etc','ETC','tri'],['wel','ウェルカムライト','tri']] },
  { t:'ライト', i:'💡', items:[['head','ヘッドライト','select'],['ahb','オートハイビーム','tri']] },
  { t:'安全装備', i:'🛡️', items:[['abs','ABS','tri'],['ab','エアバッグ（運助）','tri'],['sab','サイドエアバッグ','tri'],['esc','横滑り防止','tri'],['body','衝突安全ボディ','tri'],['aeb','衝突軽減ブレーキ','tri','もしもの時に止まる'],['lane','レーンアラート','tri'],['apark','自動駐車','tri'],['passist','パーキングアシスト','tri'],['csens','コーナーセンサー','tri'],['immo','盗難防止装置','tri']] },
  { t:'外装・スタイル', i:'🚗', items:[['alu','アルミホイール','tri'],['aero','エアロ','tri'],['sun','サンルーフ','tri'],['uv','UVガラス','tri'],['low','ローダウン','tri'],['idle','アイドリングストップ','tri']] },
  { t:'来歴・付属品', i:'📋', items:[['own1','1オーナー','tri','前のオーナーは1人だけ'],['nosmoke','禁煙車','tri'],['manual','取扱説明書','tri'],['warr','保証書','tri']] },
  { t:'動作確認・コンディション', i:'⚙️', cond:true, items:[['acq','A/C 効き','select'],['acc2','A/C コメント','text',null,1],['belt','ベルト鳴き','tri',null,1],['room','ルームランプ','status',null,1],['mirror','ドアミラー動作','status',null,1],['sparek','スペアキー動作','status',null,1],['memo','その他コメント','text',null,1]] },
  { t:'タイヤ', i:'🛞', cond:true, items:[['tfr','タイヤ溝右前','select'],['tfl','タイヤ溝左前','select'],['trr','タイヤ溝右後','select'],['trl','タイヤ溝左後','select'],['tsf','タイヤサイズ前','select'],['tsr','タイヤサイズ後','select']] },
];
const EQ_BASE = { nav:'on',navm:'SSD/メモリ',tv:'フルセグ',bt:'on',bcam:'on',fcam:'off',scam:'off',acam:'off',rmon:'off',cd:'on',dvd:'on',mp:'off', ac:'on',wac:'off',cc:'off',acc:'off',sh:'off',scool:'off',lea:'off',psea:'off',bench:'off',row3:'on',walk:'on',flat:'off', skey:'on',kless:'off',push:'on',rstart:'off',spare:'off',pw:'on',psd:'両側',pgate:'off',etc:'on',wel:'off', head:'LED',ahb:'on', abs:'on',ab:'on',sab:'off',esc:'on',body:'on',aeb:'on',lane:'on',apark:'off',passist:'off',csens:'off',immo:'on', alu:'on',aero:'off',sun:'off',uv:'on',low:'off',idle:'on', own1:'off',nosmoke:'off',manual:'on',warr:'off', acq:'よく効く',acc2:'なし',belt:'off',room:'ok',mirror:'ok',sparek:'ng',memo:'なし', tfr:'7mm',tfl:'7mm',trr:'7mm',trl:'7mm',tsf:'205/60R16',tsr:'205/60R16' };
/* 装備品チェックが終わっているか（🗣 2026-10-02「終わってない場合はグレーアウト」）。本番は カードの装備品チェックの入力済みの印。
   モック：仕入れ・展示準備中の車はまだ（car.eqDone で上書きできる） */
const eqDone = car => car._f && window.QData && QData.equipDone ? QData.equipDone(car.id) : car.eqDone != null ? !!car.eqDone : !['purchase','regen'].includes(car.status);   /* v4.5.2 本物＝カードの装備品チェックに「あり」が1つでもある */
/* 🗣 2026-10-23「見積のプランで装備品の印刷をすると見積もりが出てきちゃう」＝帳票の窓は見積書だけ（docList）なので、装備品一覧はカードの装備品チェックの印刷を開く。
   見積の中の装備品一覧（docEquip・eqShow）は見本の値（eqStateOf）なので本物では使わない */
function eqPrint(cid){ if (!(window.QData && QData.printEquip && QData.printEquip(cid))) toast('装備品一覧を開けませんでした（カード詳細の装備品チェックから印刷してください）'); }
function eqStateOf(car){
  const s = Object.assign({}, EQ_BASE), n = parseInt(car.num.slice(-2),10)||0;
  const van = /ノア|ヴォクシー|セレナ|フリード|エスクァイア/.test(car.model), mini = /ミニ|MINI/.test(car.model);
  if (!van){ s.row3='off'; s.walk='off'; s.psd = car.kei && /タント|N-BOX|スペーシア/.test(car.model) ? '左側' : ''; }
  if (mini){ s.lea = 'on'; s.psea = 'off'; s.dvd = 'off'; s.tv = ''; s.tsf = s.tsr = '205/45R17'; }
  if (car.kei){ s.tsf = s.tsr = '155/65R14'; s.uv='on'; }
  if (n%3===0){ s.acc='on'; s.own1='on'; } if (n%4===1){ s.nosmoke='on'; s.sh='on'; }
  const d = ['7mm','6mm','5mm','4mm']; s.tfr = s.tfl = d[n%4]; s.trr = s.trl = d[(n+1)%4];
  if (car.eqx) Object.assign(s, car.eqx);   // プライスの準備で直した欄（ミッション・記録簿など＝本物では装備品チェック）
  return s;
}
const eqPos = (it, v) => it[2]==='tri' ? v==='on' : it[2]==='status' ? v==='ok' : !!(v && String(v).trim());
function eqPicks(car){ if (car._f) return (car._f.equip || []).slice();   /* v4.0.0 本物＝カードの装備品チェックで「あり」の物（car-quote.js equipList） */
  const s = eqStateOf(car), out = []; EQ_TPL.filter(c=>!c.cond).forEach(c=>c.items.forEach(it=>{ if (eqPos(it, s[it[0]])) out.push(it[2]==='select' && s[it[0]] ? it[1]+'（'+s[it[0]]+'）' : it[1]); })); return out; }
function docEquip(d, k, second){
  const car = d.car, s = eqStateOf(car), b = d.ctx.b, c = C(), u = d.who;
  const kb = calc({ car, b });
  const picks = []; const cats = EQ_TPL.filter(x=>!x.cond).map(x=>{ const rows = x.items.filter(it=>!it[4] && eqPos(it, s[it[0]])); rows.forEach(it=>{ if (it[3]) picks.push([it[1], it[3]]); }); return { x, rows }; }).filter(x=>x.rows.length);
  const tire = (id) => { const mm = parseFloat(s[id])||0; return `<div class="w"><b>${mm}</b> mm<div class="bar"><i style="width:${Math.min(100,mm/8*100)}%"></i></div></div>`; };
  const no = d.kind==='order' && car.order ? esc(car.order.no || estNo(car, car.order.plan, u)) : esc(estNo(car, d.ctx.plan || 'base', u));
  return `${second?`<div class="p-top"><div class="p-kind">別紙</div><div class="p-date">${d.kind==='order'?'注文書':'御見積書'} No：${no} の別紙</div></div>`:`<div class="p-top"><div class="p-kind">${kindMark()}</div><div class="p-date">発行日：${jd(TODAY)}</div></div>`}
  <div class="p-title" style="font-size:24px">装 備 品 一 覧</div>
  <div class="eq-head"><div class="ph">${carSvg(car,'車両写真（カードの写真）')}</div><div>
    <div class="nm">${esc(car.maker)} ${esc(car.model)}<small>${esc(car.grade)}</small></div>
    <div class="eq-spec"><div><b>年式</b>${wareki(car.firstReg)}</div><div><b>走行</b>${kmText(car,b)}</div><div><b>色</b>${esc(car.color)}</div>
      <div><b>排気量</b>${ccU(car)}</div><div><b>車検</b>${regOf(b.regType).insp?'2年付':b.shakenEnd.replace('-','年')+'月'}</div><div><b>修復歴</b>${esc(b.repair)}</div>
      <div><b>保証</b>${esc(warText(b))}</div><div><b>管理番号</b>${esc(car.num)}</div><div><b>型式</b>${esc(car.fmodel)}</div></div>
    <div class="eq-price"><div class="b"><div class="k">支払総額（税込・オプションなし）</div><div class="v">${yen(kb.cash)} 円</div></div><div class="b sub"><div class="k">車両価格（税込）</div><div class="v">${yen(kb.bodyIn)} 円</div></div></div>
  </div></div>
  ${picks.length?`<div class="eq-pick"><div class="t">★ おすすめ装備</div><div class="chips">${picks.map(p=>`<span>${esc(p[0])}</span>`).join('')}</div><div class="note">${picks.map(p=>`${esc(p[0])}：${esc(p[1])}`).join('　／　')}</div></div>`:''}
  <div class="eq-title">装 備</div>
  <div class="eq-cats">${cats.map(({x,rows})=>`<div class="eq-cat"><div class="h">${x.i} ${esc(x.t)}</div>${rows.map(it=>`<div class="r"><span class="c">✓</span><span>${esc(it[1])}</span>${it[2]==='select'?`<span class="v">${esc(s[it[0]])}</span>`:''}</div>`).join('')}</div>`).join('')}</div>
  <div class="eq-cond"><div class="bx"><div class="t">🛞 タイヤの残り溝（新品は約8mm）</div>
      <div class="eq-tire">${tire('tfl')}<div class="car"></div>${tire('tfr')}${tire('trl')}${tire('trr')}</div>
      <div style="font-size:10px;margin-top:4px">サイズ：前 ${esc(s.tsf)}／後 ${esc(s.tsr)}</div></div>
    <div class="bx"><div class="t">⚙️ 点検で確かめたこと</div><div style="font-size:10.5px;line-height:1.7">エアコンの効き：<b>${esc(s.acq)}</b><br>${k.ws?'現状渡し（納車整備なし）':esc(tierOf(k.tier||'L').name)+' を実施してお渡しします'}<br>修復歴：${esc(b.repair)}　走行距離：${kmText(car,b)}</div></div></div>
  <div class="eq-foot"><span>${esc(c.name)}　${esc(c.addr)}　TEL ${esc(c.tel)}</span><span>装備は ${jd(TODAY)} 時点の点検結果です</span></div>`;
}


/* =====================================================================
   型式DB と 新規車両登録（🗣 2026-10-01「モック内で新規車両登録も開けるようにして、本番のポップアップに合わせる」
   「基本は型式と初度登録から追っていく。車検証や類別は AA だと後から届くので、それを待つと止まる」）
   本番の新規車両登録（index.html の #modal-car・car-modal.js）と同じ並び：写真 → 基本情報 → 販売情報（売約スイッチ）→ メモ → 登録区分（通常仕入／オーダー／その他）→ 登録
   変えた所：型式＋初度登録を先に入れる → 型式DB（グーのカタログ）から車名・グレードの候補・諸元・新車価格 → 人は選ぶだけ。
             年式が販売時期の外なら注意。相場カードが無い車種は「相場なし」（諸元と新車価格だけ）。
             価格（本体・総額）はここで入れない＝見積タブの「基本価格」で相場を見ながら決める
   ===================================================================== */
/* 型式DB＝Storage の katashiki.json（quote-data.js が読んで window.KATA に入れる・読めるまでは空）。相場カードの型式の当て（SOBA_KEYS）は使わない＝相場は車名で当てる */
const SOBA_KEYS = {};
const kataCode = s => String(s||'').trim().toUpperCase().replace(/[‐－ー−―]/g,'-').replace(/\s/g,'').split('-').pop();
/* 行＝[発売年月, グレード, 排気量, 駆動, ミッション, 定員, 重量, 新車価格, 型式（全体）] */
function katLookup(fmodel, firstReg, maker){
  const code = kataCode(fmodel), g = (window.KATA || {})[code];
  if (code && !window.KATA && window.QData) QData.ensureKata().then(()=>refreshSoon());
  if (!code) return { code, state:'empty' };
  if (!g) return { code, state:'none', soba:[] };
  const names = Object.keys(g).map(k=>{ const rows = g[k], yms = rows.map(r=>r[0]).filter(Boolean).sort(), [mk, car] = k.split('|');
    return { k, mk, car, first:yms[0]||'', last:yms[yms.length-1]||'', rows, full:rows[0][8] }; });
  /* 🗣 2026-10-23「ヤリスで光岡のビュートストーリーが出ちゃってる。メーカーで絞ってるんだから出す必要ない」＝同じ型式の別メーカーの車は、車のメーカーで外す（合う物が無い時だけ全部） */
  if (maker){ const mk = window.CFMaker ? CFMaker.find(maker) : null, same = names.filter(n=>(mk && CFMaker.find(n.mk)===mk) || nfkc(n.mk)===nfkc(maker));
    if (same.length) names.splice(0, names.length, ...same); }
  return { code, state:'ok', names, y: firstReg ? +firstReg.slice(0,4) : null, soba: SOBA_KEYS[code] || [] };
}
/* グレードの候補：初度登録の年月までに発売されたグレード（同じ名前は一番新しい発売のもの）。カタログの全角英数は半角に */
const nfkc = s => String(s||'').normalize('NFKC');
function katGrades(nm, y, ym){
  const lim = ym ? ym.replace('-','/') : y ? y+'/12' : '9999/12';
  let rows = nm.rows.filter(r=>r[0] && r[0] <= lim); if (!rows.length) rows = nm.rows.slice();
  const by = {};
  rows.forEach(r=>{ const g = nfkc(r[1]); if (!by[g] || r[0] > by[g].ym) by[g] = { g, cc:r[2], drive:r[3], shift:r[4], seat:r[5], kg:r[6], price:+r[7]||0, kata:r[8], ym:r[0], fuel:r[9]||'', size:r[10]||'', door:r[11]||'' }; });
  const list = Object.values(by).sort((a,b)=> b.ym.localeCompare(a.ym) || a.g.localeCompare(b.g,'ja'));
  return { pick: rows.length ? rows.map(r=>r[0]).sort().pop() : '', list };
}
/* 年式の注意：発売より前／最後の発売から2年より後 */
function katWarn(nm, firstReg){
  if (!firstReg || !nm || !nm.first) return '';
  const fr = firstReg.replace('-','/'), [ly, lm] = nm.last.split('/').map(Number), lim = (ly+2)+'/'+String(lm).padStart(2,'0');
  if (fr < nm.first) return `初度登録 ${fr} は、この型式の発売（${nm.first}）より前です。型式か初度登録を確かめてください`;
  if (fr > lim) return `初度登録 ${fr} は、この型式の最後の発売（${nm.last}）から2年以上あとです。型式か初度登録を確かめてください`;
  return '';
}
const COLOR_CATS = ['パール白','白','黒','銀','グレー','青系','赤・橙','茶・金','緑','ツートン','その他'];   // 相場DB の色区分と同じ（業務ツール\車販\AA相場診断\DB\仕入れ上限\scripts\estimate.py の color）
const BODY_SIZES = ['ミニバン','リアスライド','コンパクト','軽自動車','軽スライド','ハイブリッド','SUV','輸入車','その他'];   // 本番の「ボディサイズ」と同じ
const isHV = kata => /^(DAA|[4-7]AA)-/.test(kata||'');

let NC = null;
/* 見本の相場（🗣 2026-10-18「モック上で新規の車両を登録して新しく見積もりを作れるように。相場とかはもちろんサンプルで OK」）
   ＝新車価格 × 年数と走行で下げた割合（千円・税込の車両価格）。新車価格が無い時はボディサイズの目安。本物は相場カード（cards.json）の値 */
function sampleSoba(newPrice, firstReg, km, kei, size){
  const y = firstReg ? Math.max(0, (new Date(TODAY) - new Date(firstReg+'-01')) / 3.156e10) : 5, over = Math.max(0, km - 10000*y) / 10000;
  const base = newPrice || ({ '軽自動車':1500000, '軽スライド':1800000, 'コンパクト':2000000, 'ミニバン':3200000, 'SUV':3500000, '輸入車':4500000 }[size] || (kei ? 1600000 : 2800000));
  const r = Math.max(0.08, 0.9 * Math.pow(0.91, y) * Math.max(0.7, 1 - over*0.012));
  return { now: Math.max(200, Math.round(base*r/1000/10)*10), slope: y >= 8 ? -1.1 : y >= 4 ? -0.9 : -0.7, sample:true }; }
function nextNum(){ const n = Math.max(0, ...S.cars.map(c=>parseInt(String(c.num).replace(/\D/g,''),10)||0)); return 'KM-' + String(n+1).padStart(4,'0'); }
function openNewCar(){
  NC = { num:nextNum(), fmodel:'', firstReg:'', nameK:'', maker:'', model:'', grade:'', gradeSub:'', color:'', colorCat:'', size:'ミニバン', km:'', buyDate:TODAY, memo:'', regKind:'purchase', spec:null, sizeAuto:true };
  $('modal-newcar').classList.add('open'); drawNewCar(); setTimeout(()=>{ const e = $('nc-fmodel'); if (e) e.focus(); }, 30);
}
function closeNewCar(){ $('modal-newcar').classList.remove('open'); NC = null; }
function ncSet(k, v){ NC[k] = v;
  if (k==='fmodel' || k==='firstReg'){ const L = katLookup(NC.fmodel, NC.firstReg); if (L.state==='ok' && L.names.length===1 && !NC.nameK) ncPickName(L.names[0].k, true); }
  if (k==='color' && !NC.colorCatSet) NC.colorCat = colorCat(v);
  if (k==='colorCat') NC.colorCatSet = true;
  drawNewCar();
}
function ncPickName(key, quiet){ const L = katLookup(NC.fmodel, NC.firstReg), nm = (L.names||[]).find(n=>n.k===key); if (!nm) return;
  NC.nameK = key; NC.maker = nm.mk; NC.model = nm.car; NC.grade = ''; NC.spec = null;
  if (NC.sizeAuto && CFMaker.isImport(nm.mk, nm.car)) NC.size = '輸入車';
  if (!quiet) drawNewCar(); }
function ncPickGrade(i){ const L = katLookup(NC.fmodel, NC.firstReg), nm = L.names.find(n=>n.k===NC.nameK), G = katGrades(nm, L.y, NC.firstReg).list[i]; if (!G) return;
  NC.grade = G.g; NC.spec = G;
  if (NC.sizeAuto){ const cc = parseInt(G.cc)||0, slide = /スライド|BOX|タント|スペーシア|ルークス|フリード|シエンタ|ノア|ヴォクシー|セレナ|ステップ|エスクァイア|ルーミー|タンク/.test(nm.car);
    NC.size = CFMaker.isImport(nm.mk, nm.car) ? '輸入車' : cc && cc<=660 ? (slide?'軽スライド':'軽自動車') : /ノア|ヴォクシー|セレナ|ステップ|エスクァイア|アルファード|ヴェルファイア|フリード|シエンタ/.test(nm.car) ? 'ミニバン' : /ルーミー|タンク|ソリオ|ポルテ/.test(nm.car) ? 'リアスライド' : isHV(G.kata) ? 'ハイブリッド' : /RAV|ハリアー|CX|エクストレイル|フォレスター|ヴェゼル|ライズ|ヤリスクロス|XV/.test(nm.car) ? 'SUV' : 'コンパクト'; }
  drawNewCar(); }
function ncLookHtml(){
  const L = katLookup(NC.fmodel, NC.firstReg);
  if (L.state==='empty') return `<div class="nc-look">型式と初度登録を入れると、型式DB（グーのカタログ）から <b>車名・グレードの候補・諸元・新車価格</b> を出します。車検証が届く前（AA の車）でも登録できます。</div>`;
  if (L.state==='none') return `<div class="nc-look warn">型式「${esc(L.code)}」は型式DBに見つかりません。メーカー・車種・グレードを手で入れてください。<br><span class="q-pill none">相場なし</span> 見積の相場欄は出ません（あとで型式を直せば出ます）。</div>`;
  const nm = L.names.find(n=>n.k===NC.nameK);
  let h = `<div class="nc-look"><div class="nc-h">型式DB：<b>${esc(L.code)}</b>　${L.names.length>1?`この型式の車名が ${L.names.length} つあります。選んでください`:''}</div>
    <div class="nc-chips">${L.names.map(n=>`<button type="button" class="nc-chip ${NC.nameK===n.k?'on':''}" onclick="ncPickName('${jsq(n.k)}')">${esc(n.mk)} ${esc(n.car)}<small>${esc(n.first)}〜${esc(n.last)} 発売</small></button>`).join('')}</div>`;
  if (nm){
    const w = katWarn(nm, NC.firstReg);
    if (!NC.firstReg) h += `<div class="nc-h" style="margin-top:8px">初度登録を入れると、その年のグレードにしぼります</div>`;
    if (w) h += `<div class="nc-warn">⚠ ${w}</div>`;
    const G = katGrades(nm, L.y, NC.firstReg);
    h += `<div class="nc-h" style="margin-top:8px">グレード（${NC.firstReg?NC.firstReg.replace('-','/')+' までに発売':'全部'}・${G.list.length}件・新しい発売順）</div>
      <div class="nc-chips">${G.list.map((x,i)=>`<button type="button" class="nc-chip ${NC.grade===x.g?'on':''}" onclick="ncPickGrade(${i})">${esc(x.g)}<small>${x.drive?esc(x.drive)+'・':''}${x.price?mk(Math.round(x.price/1000))+'万':''}</small></button>`).join('')}</div>`;
    if (NC.spec){ const s = NC.spec; h += `<div class="nc-spec"><span>排気量 <b>${esc(s.cc)}</b></span><span>駆動 <b>${esc(s.drive)}</b></span><span>${esc(s.shift)}</span><span>定員 <b>${esc(s.seat)}</b></span><span>重量 <b>${esc(s.kg)}</b></span><span>新車価格 <b>${s.price?yen(s.price)+'円':'—'}</b></span><span>型式 <b>${esc(s.kata)}</b></span></div>`; }
  }
  h += `<div class="nc-h" style="margin-top:8px">${L.soba.length?`<span class="q-pill good">相場あり</span> 相場カード（${L.soba.map(esc).join('・')}）があるので、見積の右にすぐ相場が出ます`:`<span class="q-pill none">相場なし</span> この型式は相場カードがまだ無い車種です（モックでは見本の相場を付けて見積まで作れます）`}</div></div>`;
  return h;
}
function drawNewCar(){
  if (!NC) return;
  const a = document.activeElement, fid = a && a.id;
  const req = '<span style="color:var(--red);font-weight:400">*</span>';
  const fld = (id, label, val, extra) => `<div class="fg"><label>${label}</label><input type="text" id="nc-${id}" value="${esc(val)}" ${extra||''} onchange="ncSet('${id}',this.value)"></div>`;
  $('nc-body').innerHTML = `
      <div class="fsec" style="border-top:none;padding-top:0">基本情報</div>
      <div class="frow">
        <div class="fg"><label>管理番号 <span style="color:var(--text3);font-weight:400">（自動採番・変更不可）</span></label><input type="text" id="nc-num" value="${NC.num}" disabled></div>
        <div class="fg"><label>仕入れ日</label><input type="date" id="nc-buyDate" value="${NC.buyDate}" onchange="ncSet('buyDate',this.value)"></div>
      </div>
      <div class="frow">
        <div class="fg"><label>型式 ${req} <span style="color:var(--text3);font-weight:400">（車検証・出品票の型式）</span></label><input type="text" id="nc-fmodel" list="nc-katas" value="${esc(NC.fmodel)}" placeholder="例：DBA-ZRR80W または ZRR80W" autocomplete="off" onchange="ncSet('fmodel',this.value)"><datalist id="nc-katas">${Object.keys(KATA).sort().map(c=>`<option value="${c}">`).join('')}</datalist></div>
        <div class="fg"><label>初度登録（年月） ${req}</label><input type="month" id="nc-firstReg" value="${NC.firstReg}" onchange="ncSet('firstReg',this.value)"></div>
      </div>
      ${ncLookHtml()}
      <div class="frow">
        ${fld('maker','メーカー '+req, NC.maker, 'placeholder="型式から入ります"')}
        ${fld('model','車種 '+req, NC.model, 'placeholder="型式から入ります"')}
      </div>
      <div class="frow">
        ${fld('grade','グレード（メイン）', NC.grade, 'placeholder="候補から選ぶ・手でも可"')}
        ${fld('gradeSub','グレードの詳細（パッケージ・限定車）', NC.gradeSub, 'placeholder="例：ダブルバイビーII"')}
      </div>
      <div class="frow">
        ${fld('color','車体色', NC.color, 'list="nc-colors" placeholder="パールホワイト"')}<datalist id="nc-colors">${Object.keys(COLORS).map(c=>`<option value="${c}">`).join('')}</datalist>
        <div class="fg"><label>色の区分 <span style="color:var(--text3);font-weight:400">（相場で使う）</span></label><select id="nc-colorCat" onchange="ncSet('colorCat',this.value)"><option value="">—</option>${COLOR_CATS.map(c=>`<option ${NC.colorCat===c?'selected':''}>${c}</option>`).join('')}</select></div>
      </div>
      <div class="frow">
        <div class="fg"><label>走行距離 (km)</label><input type="text" id="nc-km" inputmode="numeric" value="${NC.km?Number(NC.km).toLocaleString():''}" placeholder="例：35000" onchange="ncSet('km',parseYen(this.value))"></div>
        <div class="fg"><label>ボディサイズ</label><select id="nc-size" onchange="NC.sizeAuto=false;ncSet('size',this.value)">${BODY_SIZES.map(s=>`<option ${NC.size===s?'selected':''}>${s}</option>`).join('')}</select></div>
      </div>
      <div class="nc-price">${I('estimate','🧾',14)} 本体価格・総額はここでは入れません。登録したあと、<b>見積タブの「基本価格」</b>で相場を見ながら決めます（それが カードの表示・ポータルの値になります）。</div>
      <div class="fsec">販売情報</div>
      <div class="sell-block"><div class="sell-switch-row"><div><div style="font-size:13px;font-weight:600;margin-bottom:2px">売約スイッチ</div><div style="font-size:11px;color:var(--text3)">OFF：未成約（売約は見積タブの「売約」から）</div></div><div class="sell-switch"><div class="sell-switch-knob"></div></div></div></div>
      <div class="fsec">メモ</div>
      <div class="fg"><textarea id="nc-memo" rows="3" placeholder="自由記入（コアメモ：車両情報・特記事項。フェーズが変わっても残ります）" onchange="NC.memo=this.value">${esc(NC.memo)}</textarea></div>
      <div style="margin-top:14px"><div style="font-size:11px;color:var(--text2);font-weight:600;margin-bottom:6px">登録区分</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">${[['purchase','cart','🛒','通常仕入','普通の在庫車として登録'],['order','box','📦','オーダー','注文受けて仕入れる<br>在庫日数カウント無し'],['other','pencil','📝','その他','保留車両など<br>タスク対象外']].map(([v,icn,fb,l,d])=>`<label class="reg-type-card ${NC.regKind===v?'selected':''}" onclick="NC.regKind='${v}';drawNewCar()" style="${NC.regKind===v?'border-color:var(--blue);background:rgba(55,138,221,.12)':''}"><div class="reg-type-icon">${I(icn,fb,16)}</div><div class="reg-type-label">${l}</div><div class="reg-type-desc">${d}</div></label>`).join('')}</div></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap"><button class="btn-sm" onclick="closeNewCar()">キャンセル</button><button class="btn-primary" onclick="saveNewCar()">登録して見積へ</button></div>`;
  if (typeof icHydrate==='function') icHydrate($('nc-body'));
  if (fid && $(fid)) $(fid).focus();
}
function saveNewCar(){
  const miss = [['fmodel','型式'],['firstReg','初度登録'],['maker','メーカー'],['model','車種']].filter(([k])=>!String(NC[k]||'').trim()).map(x=>x[1]);
  if (miss.length){ toast(miss.join('・')+' を入れてください'); return; }
  const L = katLookup(NC.fmodel, NC.firstReg), nm = L.state==='ok' ? L.names.find(n=>n.k===NC.nameK) : null, s = NC.spec || {};
  const fullKata = s.kata || (nm && nm.full) || NC.fmodel.trim().toUpperCase();
  const cc = parseInt(String(s.cc||'').replace(/\D/g,''))||0, kg = parseInt(String(s.kg||'').replace(/\D/g,''))||0;
  const sk = L.soba && L.soba.length ? L.soba[0] : null;
  snap();
  const car = { id:'k'+NC.num.replace(/\D/g,'')+'_'+Date.now()%1000, num:NC.num, maker:NC.maker.trim(), model:NC.model.trim(), grade:NC.grade.trim(), gradeSub:NC.gradeSub.trim(), fmodel:fullKata, vin:'',
    firstReg:NC.firstReg, cc:cc||1500, weight:kg||1300, km:+NC.km||0, color:NC.color.trim(), colorCat:NC.colorCat, size:NC.size, kei:cc>0&&cc<=660, hybrid:isHV(fullKata), fuel:'gas',
    buyDate:NC.buyDate||TODAY, status:'purchase', regKind:NC.regKind, memo:NC.memo, newPrice:s.price||0,
    soba: Object.assign(sampleSoba(s.price||0, NC.firstReg, +NC.km||0, cc>0&&cc<=660, NC.size), sk ? { key:sk } : {}),   // ⚠ モックの見本：本物は相場カード（cards.json）の値
    base:null, cfPrice:0, std:{ ov:{}, extra:[], disc:{A:0,B:0,C:0,D:0}, rec:null, tier:{}, showD:false }, custs:[], order:null };
  S.cars.unshift(car); closeNewCar(); save(); openCar(car.id); toast(`${car.num} ${car.maker} ${car.model} を登録しました。次に基本価格を決めます`, true);
}


/* ---------- 一覧から見積書を直接開く・一括印刷（🗣 2026-10-01「一覧の右に基本 ABC それぞれの見積の PDF 直ビューボタン、その他見積一括印刷ボタンも」） ---------- */
function quickDoc(cid, p){ S.ui.carId = cid; S.ui.step = 'std'; S.ui.custId = null; S.ui.docBase = p==='base'; if (p!=='base') S.ui.plan = p; S.ui.doc = 'quote'; $('q-docov').hidden = false; renderDocs(); }
function selOne(id, on){ S.ui.sel = S.ui.sel || {}; if (on) S.ui.sel[id] = 1; else delete S.ui.sel[id]; save(); render(); }
function selAll(on){ S.ui.sel = S.ui.sel || {}; (S.ui.listIds||[]).forEach(id=>{ if (on) S.ui.sel[id] = 1; else delete S.ui.sel[id]; }); save(); render(); }
/* 何を刷るかの選び方（一括印刷と選択印刷で同じ）。set＝{ base, A, B, C, equip } */
const PRINT_KINDS = withD => [['base','基本（オプションなし・掲載の支払総額）'],['A','プラン A（'+planName('A')+'）'],['B','プラン B（'+planName('B')+'）'],['C','プラン C（'+planName('C')+'）']].concat(withD ? [['D', withD===2 ? '業販（D）※出している車だけ' : '業販（D・現状渡し）']] : []).concat([['compare','プラン比較']].concat(window.QData ? [] : [['equip','装備品一覧']]).concat([['board','プライスボード（A3 横）']]));   // v4.5.2 本物では装備品一覧を外す（見本の値で刷られるため。装備品一覧は［装備品一覧を印刷］＝カードの装備品チェックの印刷）
function printChecks(path, set, redraw, withD, noEq){ return `<div class="q-f" style="grid-template-columns:1fr 1fr">${PRINT_KINDS(withD).map(([k,l])=>`<label class="q-tog ${noEq&&k==='equip'?'off':''}" style="margin:4px 0" ${noEq&&k==='equip'?'title="装備品チェックが終わっていません"':''}><input type="checkbox" ${set[k]&&!(noEq&&k==='equip')?'checked':''} ${noEq&&k==='equip'?'disabled':''} onchange="${path}.${k}=this.checked?1:0;${redraw}"><span>${esc(l)}</span></label>`).join('')}</div>`; }
const sheetsOf = (n, set) => n * (['base','A','B','C','D','compare','equip','board'].filter(k=>set[k] && (k!=='equip' || !window.QData)).length);
/* 枚数の書き方（A3 のプライスは別に数える） */
const sheetsTxt = (n, set) => { const a3 = set.board ? n : 0, a4 = sheetsOf(n, set) - a3; return [a4 ? `A4 ${a4} 枚` : '', a3 ? `A3 ${a3} 枚` : ''].filter(Boolean).join('・') || '0 枚'; };
/* 一括印刷：一覧でチェックした車 */
function openBulk(){
  const cars = Object.keys(S.ui.sel||{}).filter(id=>S.ui.sel[id]).map(carOf).filter(c=>c && c.base);
  const B = S.ui.bulkSet = Object.assign({ base:1, A:0, B:1, C:0, equip:0 }, S.ui.bulkSet||{}), n = sheetsOf(cars.length, B);
  ov(`<div class="hd">${I('printer','🖨',16)} 一括印刷（${cars.length} 台）<button class="x" onclick="closeOv()">✕</button></div><div class="bd">
    <div class="q-why" style="margin-bottom:6px">${cars.map(c=>esc(c.num+' '+c.model)).join('・')}</div>
    <div class="q-sec" style="margin-top:0">1台ごとに刷るもの</div>${printChecks('S.ui.bulkSet', B, 'openBulk()', 2).replace(/<\/div>$/, (B.board ? `<div class="brd-bulk">
      <label class="q-chk" title="月をまたいだ時用：選んだ車の絵を全部変えて保存してから並べる"><input type="checkbox" ${B.newSeason?'checked':''} onchange="S.ui.bulkSet.newSeason=this.checked?(S.ui.bulkSet.newSeason||brdMonth()):'';openBulk()"> プライスの絵を変更して印刷</label>
      ${B.newSeason ? `<select class="q-in" style="width:180px" onchange="S.ui.bulkSet.newSeason=this.value;openBulk()">${brdSeasons().map(x=>`<option ${x===B.newSeason?'selected':''}>${x}</option>`).join('')}</select><span class="q-why" style="display:inline;margin:0">選んだ ${cars.length} 台の絵を全部「${esc(B.newSeason)}」に変えて保存します</span>`
        : `<span class="q-why" style="display:inline;margin:0">絵は車ごとの今の絵（${[...new Set(cars.map(c=>brdSeason(c)))].map(esc).join('・')}）</span>`}</div>` : '') + '</div>')}
    ${B.board && cars.some(c=>!c.board || !c.board.icons) ? `<div class="q-why" style="margin-top:6px">プライスの装備をまだ選んでいない車 ${cars.filter(c=>!c.board || !c.board.icons).length} 台は、装備品チェックの「あり」から自動で10個選んで出します</div>` : ''}
    <div class="q-note info" style="margin-top:10px">${cars.length} 台 × ${n/(cars.length||1)} 枚 ＝ <b>${sheetsTxt(cars.length, B)}</b>。まず画面に並べて見せ、そこから印刷します。⚠ 刷りすぎに注意（まず PDF に）。</div></div>
    <div class="ft"><button class="q-btn" onclick="closeOv()">戻る</button><button class="q-btn pri" ${n?'':'disabled'} onclick="closeOv();bulkGo(${JSON.stringify(cars.map(c=>c.id)).replace(/"/g,"'")})">${I('printer','🖨',14)} 並べて見る（${n} 枚）</button></div>`, true);
}
/* 一括印刷を並べる。「絵を変更して印刷」の時は、先に選んだ車の絵を全部変えて保存する（🗣 2026-10-05「月をまたいだ時に使用するイメージ」） */
function bulkGo(ids){ const B = S.ui.bulkSet;
  if (B.board && B.newSeason){ snap(); ids.map(carOf).forEach(c=>{ c.board = Object.assign({ icons: brdAvail(c).slice(0,10) }, c.board, { season:B.newSeason }); }); save();
    toast(`${ids.length} 台のプライスの絵を「${B.newSeason}」に変えました`, true); B.newSeason = ''; }
  printSheets(ids, B); }
/* 選択印刷：その車1台で、刷るものを選ぶ */
function openPick(cid){
  const car = carOf(cid), P = S.ui.pickSet = Object.assign({ base:0, A:1, B:0, C:1, D:0, equip:1 }, S.ui.pickSet||{}); if (!car.std.showD) P.D = 0; const n = sheetsOf(1, Object.assign({}, P, { equip: eqDone(car) ? P.equip : 0 }));
  ov(`<div class="hd">${I('printer','🖨',16)} 選択印刷　${esc(car.num)} ${esc(car.maker)} ${esc(car.model)}<button class="x" onclick="closeOv()">✕</button></div><div class="bd">
    <div class="q-sec" style="margin-top:0">刷るものを選ぶ</div>${printChecks('S.ui.pickSet', P, `openPick('${cid}')`, car.std.showD ? 1 : 0, !eqDone(car))}${window.QData?`<div class="q-why" style="margin-top:6px">装備品一覧は、プラン見積の［装備品一覧を印刷］から（カードの装備品チェックの印刷が開きます）</div>`:''}
    <div class="q-why" style="margin-top:6px">${['base','A','B','C','D'].filter(k=>P[k]).map(k=>(k==='base'?'基本':k==='D'?'業販':k)+' '+yen(calc(k==='base'?{car,b:car.base}:stdCtx(car,k)).cash)+'円').join('　')}</div>
    ${P.board && !car.board ? `<div class="q-why" style="margin-top:6px">プライスの装備をまだ選んでいません。自動で選んだ10個で出します（<a href="#" onclick="closeOv();openBrdPick('${cid}');return false">先に選ぶ</a>）</div>` : ''}
    <div class="q-note info" style="margin-top:10px"><b>${sheetsTxt(1, P)}</b>。画面に並べて見せ、そこから印刷します。</div></div>
    <div class="ft"><button class="q-btn" onclick="closeOv()">やめる</button><button class="q-btn pri" ${n?'':'disabled'} onclick="closeOv();printSheets(['${cid}'], S.ui.pickSet)">${I('printer','🖨',14)} 並べて見る（${n} 枚）</button></div>`, true);
}
/* 選んだ車 × 選んだもの を並べて、そこから印刷 */
function printSheets(ids, set){ _reprint = () => printSheets(ids, set);
  const cars = ids.map(carOf).filter(c=>c && c.base), plans = ['base','A','B','C','D'].filter(p=>set[p]);
  let papers = '';
  cars.forEach(car=>{ _docNew = !!car.base.newCar;
    plans.filter(p=>p!=='D' || car.std.showD).forEach(p=>{ const ctx = p==='base' ? { car, b:car.base, plan:null } : stdCtx(car, p), d = { car, ctx, who:null, kind:'std' };
      papers += quotePapers(d, calc(ctx)); });
    if (set.compare){ const d = { car, ctx:{ car, b:car.base, plan:null }, who:null, kind:'std' }; papers += `<div class="paper qvp">${cmpShow(d)}</div>`; }
    if (set.equip && !window.QData && eqDone(car)){ const d = { car, ctx:{ car, b:car.base, plan:null }, who:null, kind:'std' }; papers += `<div class="paper qvp">${eqShow(d)}</div>`; }
    if (set.board) papers += `<div class="paper a3">${docBoard(car)}</div>`; });
  const n = (papers.match(/class="paper[ "]/g)||[]).length;
  $('q-docov').innerHTML = `<div class="q-docbar"><span class="t">${cars.length===1?esc(cars[0].num+' '+cars[0].model)+' の選択印刷':'一括印刷　'+cars.length+' 台'}・${n} 枚</span><span class="sp"></span>${zoomBar()}<button onclick="window.print()">${I('printer','🖨',14)} 印刷（${n}枚）</button><button onclick="closeDocs()">${I('close','✕',14)} 閉じる</button></div>
    <div class="q-stage" id="q-stage"><div class="q-scaler" id="q-scaler"><div class="q-papers" id="q-papers">${papers}</div></div></div>`;
  $('q-docov').hidden = false; $('q-page').textContent = '@page{size:A4 portrait;margin:0}@page a3{size:A3 landscape;margin:0}';   // A4 と A3 を1回の印刷で（紙の大きさは1枚ごと）
  const _b = typeof set==='object' && set && set.board, W = _b ? 1587 : 794, st = $('q-stage'), box = $('q-papers'), s = zoomOf(st, W, _b ? 1123 : 1123);
  box.style.transform = `scale(${s})`; $('q-scaler').style.width = W*s+'px'; $('q-scaler').style.height = box.offsetHeight*s+'px';
  if (_b) brdFit();
  document.querySelectorAll('#q-papers .paper.cmp-nobase table.cmp tr').forEach(tr=>{ if (tr.cells[1]) tr.cells[1].remove(); });   // プラン比較：ベースの列を外した時
  if (typeof icHydrate==='function') icHydrate($('q-docov'));
}


/* ---------- 一覧の行を押した時のメニュー（🗣 2026-10-01「各行のボタン以外をクリックしたときに一度 POP アップ画面を開いてメニューを選ばせる」） ---------- */
function openRowMenu(cid){
  const car = carOf(cid), b = car.base, k = b ? calc(baseCtx(car)) : null, [st, stl] = carStatus(car), nC = car.custs.length;
  const item = (icn, fb, title, sub, act, dis) => `<button class="q-mi" ${dis?'disabled':''} onclick="${dis?'':`closeOv();${act}`}"><span class="ic">${I(icn,fb,18)}</span><span><b>${title}</b><small>${sub}</small></span><span class="go">›</span></button>`;
  const items = b ? [
      item('estimate','🧾','基本価格を変更する','車両情報・本体価格・登録の種類・保証など（基本価格の画面へ）',`menuGo('${cid}','base')`),
      item('down','↓','本体価格を調整する',`いま 本体 ${yen(b.price)}（税抜）→ 値下げ・値上げをその場で`,`openCut('${cid}')`, !!car.order),
      item('layers','▤','見積プランを調整する','A／B／C の中身・納車整備の段階・値引き（プラン見積へ）',`menuGo('${cid}','std')`, !!car.order),
      item('user','👤','顧客見積を作成する',nC?`お客様の見積をもう1つ作る（いま ${nC} 件）`:'このプランからお客様ごとの見積を作る',`openCar('${cid}');newCust('${cid}')`, !!car.order),
      nC ? item('users','👥','顧客見積を見る',car.custs.map(u=>esc(u.name||'（お名前未入力）')+' 様').join('・'),`menuGo('${cid}','cust')`) : '',
      car.order ? item('check','✓','売約を見る',`注文書 版${car.order.ver}・${esc((custOf(car,car.order.cust)||{}).name||'')} 様`,`menuGo('${cid}','order')`) : '',
    ] : [
      item('plus','＋','基本価格を作る','この車はまだ基本価格がありません。相場を見ながら値段を決める',`menuGo('${cid}','base')`),
    ];
  ov(`<div class="hd">${I('car','🚗',16)} ${esc(car.num)}　${esc(car.maker)} ${esc(car.model)} ${esc(car.grade)}<button class="x" onclick="closeOv()">✕</button></div><div class="bd">
    <div class="q-mhead"><div class="ph">${carSvg(car)}</div><div><span class="q-pill ${st}">${esc(stl)}</span><div class="q-why" style="margin:4px 0 0">${car.firstReg?wareki(car.firstReg):''}・${(car.km/10000).toFixed(1)}万km・${esc(car.color)}</div></div>
      <span style="flex:1"></span>${k?`<div style="text-align:right"><div class="q-why" style="margin:0">掲載の支払総額</div><b style="font-size:20px;font-variant-numeric:tabular-nums">${yen(k.cash)}</b></div>`:''}</div>
    <div class="q-menu">${items.join('')}</div>
    ${car.order?'<div class="q-why" style="margin-top:6px">売約済みの車は、価格・プランは直せません（注文書は固定）。</div>':''}</div>`, true);
}
function menuGo(cid, step){ openCar(cid); if (S.ui.view==='car' && carOf(cid).base) stepGo(step); }   // 一覧のメニューからの近道はタブの制限なし

/* =====================================================================
   8. 窓：値下げ・成約・設定
   ===================================================================== */
function ov(html, sm){ $('q-ov').innerHTML = `<div class="q-win ${sm?'sm':''}">${html}</div>`; $('q-ov').hidden = false; if (typeof icHydrate==='function') icHydrate($('q-ov')); }
function closeOv(){ $('q-ov').hidden = true; }
$('q-ov').addEventListener('click', e=>{ if (e.target.id==='q-ov') closeOv(); });

/* 月次の諸費用：本体を変えなくても、月が変わると登録予定月が1つ進み、自動車税の月割・自賠責（料金表）・重量税（13/18年）が変わる。
   🗣 2026-10-01「自動車税と自賠の月割りで変わるじゃん？それも履歴として残るように」→ 毎月1日に支払総額が変わった分を「自動」の行で残す（本番は月初の処理で記録） */
function cashAt(car, price, date, feeDate){ _asOf = date; try { return calc({ car, b:Object.assign({}, car.base, { price }, feeCfgAt(car.base, feeDate||date)) }); } finally { _asOf = null; } }
const FEE_PARTS = [['carTax','自動車税'],['unexpTax','自動車税（未経過分）'],['weight','重量税'],['jibai','自賠責'],['unexpJb','自賠責（未経過分）']];
function feeWhy(a, b, amt){
  return FEE_PARTS.filter(([k])=>a[k]!==b[k]).map(([k,l])=>{ const d = b[k]-a[k];
    const how = k==='carTax' && a.months!==b.months ? ` ${a.months}→${b.months}か月` : k==='jibai' && a.tbFrom!==b.tbFrom ? '（料金表の改定）' : k==='weight' && a.weightKey!==b.weightKey ? '（経過年数）' : '';
    return `${l}${how}${amt?` ${d<0?'▲':'＋'}${yen(Math.abs(d))}`:''}`; }).join('・');
}
function priceEvents(car){
  const hs = car.base.hist.slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0), ev = hs.map(h=>({...h, kind:'body'}));
  if (!hs.length) return ev;
  const priceOn = d => { let p = 0; hs.forEach(h=>{ if (h.date<=d) p = h.to; }); return p; };
  let {y, m} = ym(hs[0].date.slice(0,7)); m--; if (m < 1){ m = 12; y--; }
  const cut = regCut();   // v4.5.24 切り替え日（毎月◯日）に一斉に変わる
  for (;;){ m++; if (m>12){ m = 1; y++; } const d1 = `${y}-${String(m).padStart(2,'0')}-${String(cut).padStart(2,'0')}`; if (d1 > TODAY) break; if (d1 <= hs[0].date) continue;
    const pm = m===1 ? 12 : m-1, py = m===1 ? y-1 : y, prev = cut > 1 ? `${y}-${String(m).padStart(2,'0')}-${String(cut-1).padStart(2,'0')}` : `${py}-${String(pm).padStart(2,'0')}-${new Date(py, pm, 0).getDate()}`;   // 切り替え日の前日（addDays は時差で1日ずれるので使わない）
    const p = priceOn(prev), a = cashAt(car, p, prev), b = cashAt(car, p, d1, prev);   // 月の切り替わりは税・保険の月割だけを見る（諸費用の直しは下の feeLog で別の行）
    if (a.cash !== b.cash) ev.push({ date:d1, from:p, to:p, kind:'fee', why:'月次プライス改定（諸費用）', detail:feeWhy(a.bc, b.bc, true) }); }
  (car.base.feeLog||[]).forEach(L=>{ if (L.date<=TODAY) ev.push({ date:L.date, from:priceOn(L.date), to:priceOn(L.date), kind:'fee', why:'販売諸費用の変更', detail:'販売諸費用 '+L.detail }); });
  return ev.sort((a,b)=> a.date<b.date?-1 : a.date>b.date?1 : (a.kind==='fee'?-1:b.kind==='fee'?1:0));
}
/* ---------- 値付けの履歴（🗣 2026-10-01「本体価格調整の POP に履歴。いつ・いくら引いて（上げて）・いくらになったか・当時相場に対してどうだったか」）
   その時の相場：新しく値付けした時は h.soba（小売成約の「いま」・千円）を一緒に残す。前からある履歴は相場カードの月ごとの値から引く ---------- */
function sobaAt(car, date){
  const sb = sobaOf(car); if (!sb) return null;
  const lab = date.slice(2,4)+'/'+date.slice(5,7), idx = sb.m.indexOf(lab);   /* sb.m＝相場データの月（−12〜0）のラベル。データの月より後は今の値 */
  if (idx >= 0) return sb.series[idx];
  return lab > sb.m[sb.m.length-1] ? sb.series[sb.series.length-1] : null;
}
function priceHistHtml(car){
  const seibi = seibiOf(car.base), ev = priceEvents(car), n = ev.length, cash = ev.map(e=>cashAt(car, e.to, e.date).cash);
  const rows = ev.map((h,i)=>{ const fee = h.kind==='fee', inT = Math.floor((h.to+seibi)*1.1), mk0 = h.soba || sobaAt(car, h.date), r = mk0 ? inT/1000/mk0 : null, lab = r ? ratioLabel(r) : null;
    const d = fee ? null : h.from ? h.to - h.from : null;   // 自動の行の増減は「－」（🗣 紛らわしいので）
    const cur = i===n-1, span = daysBetween(h.date, cur ? TODAY : ev[i+1].date);
    const col = v => v==null?'var(--text3)':v<0?'var(--green)':v>0?'var(--orange)':'var(--text2)';
    return `<tr class="${fee?'fee':''}"><td>${jd(h.date)}${cur?' <span class="q-pill good">現行</span>':''}</td><td class="v">${daysBetween(car.buyDate, h.date)}日目</td><td class="v">${span}日間</td>
      <td class="v" style="color:${col(d)};font-weight:800">${fee?'<span style="color:var(--text3);font-weight:400">－</span>':d==null?'初回':(d<0?'▲':'＋')+yen(Math.abs(d))}</td>
      <td class="v">${fee?yen(h.to):`<b>${yen(h.to)}</b>`}</td>
      <td class="v"><b>${yen(cash[i])}</b></td>
      <td class="v">${mk0?mk(mktEx(car, mk0))+'万':'—'}</td><td>${lab?`<span class="q-pill ${lab[0]}">${lab[1]} ${Math.round(r*100)}%</span>`:'<span class="q-pill none">相場なし</span>'}</td>
      <td class="why">${esc(fee ? h.detail : h.why)}</td></tr>`; }).reverse().join('');
  return `<div class="cut-hs"><table class="q-tbl q-ph"><thead><tr><th>日付</th><th class="v">在庫</th><th class="v">その金額の期間</th><th class="v">増減</th><th class="v">本体（税抜）</th><th class="v">支払総額（税込）</th><th class="v">その時の相場（本体）</th><th>相場比</th><th>理由</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="q-why" style="margin-top:4px">金額は税抜（支払総額だけ税込）。その時の相場＝小売の成約の「いま」を本体（税抜）に直した値（成約の車両価格（税込）÷1.1 − 納車前点検）。相場比＝車両価格どうしで比べた値。増減が「－」の行＝本体はそのままで、月が変わって諸費用（自動車税の月割・自賠責・重量税）が変わった分（毎月1日に自動で残ります）。</div>`;
}
/* いま → ▲増減 → 新しい本体。相場比を大きく（🗣「メイン表示の価格に相場比をしっかり目に」） */
function cutFlow(car, from, to){
  const inT = v => Math.floor((v+seibiOf(car.base))*1.1), sb = sobaOf(car), cashOf = v => calc({ car, b:Object.assign({}, car.base, { price:v }) }).cash;
  const pill = v => { const r = sb ? inT(v)/1000/sb.now : null, lab = r ? ratioLabel(r) : null; return lab ? `<span class="q-pill ${lab[0]}">${lab[1]} ${Math.round(r*100)}%</span>` : '<span class="q-pill none">相場なし</span>'; };
  const d = to - from, same = !to || !d;
  return (same ? `<div class="cut-flow"><b>${yen(from)}円</b><span class="q-why" style="margin:0 0 0 8px">（変わりません）</span></div>`
    : `<div class="cut-flow"><b>${yen(from)}円</b><span class="ar">→</span><span class="dd ${d<0?'dn':'up'}">${d<0?'▲':'＋'}${yen(Math.abs(d))}円</span><span class="ar">→</span><b class="to">${yen(to)}円</b></div>`)
    + `<div class="cut-ratio"><span class="lb">相場比</span>${pill(from)}${same?'':`<span class="ar">→</span>${pill(to)}`}${sb?`<span class="q-why" style="margin:0">相場 本体 ${mk(mktEx(car, sb.now))}万（税抜）</span>`:''}</div>`
    + (sb ? (()=>{ const r = v => inT(v)/1000/sb.now, pos = v => Math.max(2, Math.min(98, 50 + (r(v)-1)*500)), dy = v => sobaDays(sb, Math.round((r(v)-1)*1000)/10);
        return `<div class="q-why cut-days">売れる見込み 約${dy(from)}日${same?'':` → <b>約${dy(to)}日</b>`}</div><div class="q-bar cut-bar">${same?'':`<div class="m old" style="left:${pos(from)}%"></div>`}<div class="m" style="left:${pos(same?from:to)}%"></div><span class="l" style="left:10%">−5%</span><span class="l" style="left:35%">−2%</span><span class="l" style="left:50%">相場</span><span class="l" style="left:65%">+3%</span><span class="l" style="left:90%">+8%</span></div>`; })() : '')
    ;
}
function cutSub(car, from, to){ const inT = v => Math.floor((v+seibiOf(car.base))*1.1), cashOf = v => calc({ car, b:Object.assign({}, car.base, { price:v }) }).cash;
  return !to || to===from ? '<span class="q-why" style="margin:0">金額は変わりません</span>' : `<span>支払総額（税込）${yen(cashOf(from))} → <b>${yen(cashOf(to))}</b>円</span>`; }
/* 月次プライス改定（諸費用）：支払総額で入れ、そこから車両本体を逆算する（🗣「月次プライス改定を選んだ場合は総額にして、直すところを表示」） */
const CUT_MONTHLY = '月次プライス改定（諸費用）';
const cutIsMonthly = () => $('cut-why').value === CUT_MONTHLY;
const cashWith = (car, price) => calc({ car, b:Object.assign({}, car.base, { price }) }).cash;
function bodyForCash(car, target){
  const p0 = car.base.price, est = p0 + Math.round((target - cashWith(car, p0))/1.1);
  let best = est, gap = Infinity;
  for (let d=-6; d<=6; d++){ const c = cashWith(car, est+d), g = target - c; if (g>=0 && g<gap){ gap = g; best = est+d; } }
  return best;
}
function cutBody(cid){ const car = carOf(cid), v = parseYen($('cut-v').value); return v && cutIsMonthly() ? bodyForCash(car, v) : v; }
function cutFix(car, target, v){
  const b = car.base, last = b.hist.slice().sort((a,c)=>a.date<c.date?-1:1).pop(), before = cashAt(car, b.price, last.date), now = calc(baseCtx(car)), parts = feeWhy(before.bc, now.bc, true), got = cashWith(car, v), d = v - b.price;
  return `<div class="cut-fix">
    <div class="r"><span class="k">前回の値付け（${jd(last.date)}）から変わった諸費用</span><b>${parts || 'なし'}</b></div>
    <div class="r"><span class="k">支払総額</span><span>${yen(before.cash)}（前回）→ ${yen(now.cash)}（いま）</span>${before.cash!==now.cash?`<button class="q-btn sm" onclick="$('cut-v').value=yen(${before.cash});cutPreview('${car.id}')">前回の総額にそろえる</button>`:''}</div>
    <div class="r fix"><span class="k">直すところ</span><span>車両本体（税抜）${yen(b.price)} → <b>${yen(v)}</b>円${d?`（${d<0?'▲':'＋'}${yen(Math.abs(d))}）`:''}</span></div>
    ${target && got!==target ? `<div class="q-why" style="margin:2px 0 0">端数の関係で、支払総額は ${yen(got)}円 になります</div>` : ''}</div>`;
}
function cutMode(cid){ const car = carOf(cid), m = cutIsMonthly();
  $('cut-other').style.display = $('cut-why').value==='その他' ? '' : 'none';
  $('cut-vl').textContent = m ? '新しい支払総額（税込）' : '新しい車両本体（税抜）';
  $('cut-v').value = yen(m ? calc(baseCtx(car)).cash : car.base.price - 50000);
  cutPreview(cid);
}
function cutPreview(cid){ const car = carOf(cid), v = cutBody(cid);
  $('cut-now').innerHTML = cutFlow(car, car.base.price, v);
  $('cut-sub').innerHTML = cutIsMonthly() ? cutFix(car, parseYen($('cut-v').value), v) : '';
  $('cut-sum').innerHTML = cutSub(car, car.base.price, v); }


/* 相場・仕入れとの差のグラフ（🗣 2026-10-01「履歴の下に相場との金額差と仕入れ金額のラインが入ったグラフ」）
   横＝日付（仕入れ日〜今日）。🗣 2026-10-19 全部税抜：自社の車両本体（値付けの履歴）／小売相場（月ごと・本体に直した値）／仕入れ原価（仕入れ＋AA手数料＋陸送＋仕上げ）／AA（落札額）。相場との差は塗り（上＝高め・下＝安め） */
/* 見出し＋右上の AA スイッチ＋グラフ（🗣「AA 相場は最初非表示で、グラフの右上にスイッチ」） */
function gapBlock(car){ return `<div class="q-sec gap-sec">相場・仕入れとの差<label class="gap-sw"><input type="checkbox" ${S.ui.gapAA?'checked':''} onchange="S.ui.gapAA=this.checked;save();$('gap-chart').innerHTML=gapChart(carOf('${car.id}'))"><i></i>AA 相場</label></div><div id="gap-chart">${gapChart(car)}</div>`; }
/* AA で手放したら：AA 落札（税抜）− 仕入れ原価（税抜：仕入れ＋AA手数料＋陸送＋仕上げ）。今と、来月から先の見込み */
function sellLine(c, aaNow, fut){
  const cost = (c.buy||0)+(c.aa||0)+(c.move||0); if (!cost) return '';
  const pl = v => { const d = v - cost; return `<b style="color:${d<0?'var(--red,#ef4444)':'var(--green)'}">${d<0?'▲':'＋'}${yen(Math.abs(d))}円</b>`; };
  const per = fut.length ? Math.round((fut[fut.length-1].v - aaNow)/fut.length/1000)*1000 : 0;
  return `<div class="cut-sell"><span class="k">AA で手放したら（仕入れ原価との差）</span><span>今 ${pl(aaNow)}</span>${fut.map(f=>`<span class="ar">→</span><span>${+f.a.slice(5,7)}月 ${pl(f.v)}</span>`).join('')}<span class="sp"></span><span class="q-why" style="margin:0">1か月待つごとに約 ${per<0?'▲':'＋'}${yen(Math.abs(per))}円（見込み）</span></div>`;
}
function gapChart(car){ const showAA = !!S.ui.gapAA;
  const b = car.base, sb = sobaOf(car), seibi = seibiOf(b), hs = b.hist.slice().sort((a,c)=>a.date<c.date?-1:1);
  const c = b.cost || {}, costIn = costOf(b);
  /* 🗣「AA スイッチを入れた場合は来月以降の推移予想値も。今手放したらいくらマイナスで、来月なら予想でどのくらいか。仕入れ値との差分で、いつ手放すかを考えさせて」
     見込み＝いまの AA × (1＋AA の月の傾き)^月数（相場カードの slopeAA）。4か月先まで */
  const FUT = sb ? 4 : 0, tm = ym(TODAY.slice(0,7));
  const futM = [...Array(FUT)].map((_,i)=>{ const d = new Date(tm.y, tm.m-1+i+1, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; });
  const endD = FUT ? (()=>{ const d = new Date(tm.y, tm.m-1+FUT+1, 0); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })() : TODAY;
  const start = [car.buyDate, hs.length?hs[0].date:TODAY].sort()[0], span = Math.max(1, daysBetween(start, endD));
  const priceOn = d => { let p = null; hs.forEach(h=>{ if (h.date<=d) p = h.to; }); return p; };
  const mktOn = d => { const v = sb ? sobaAt(car, d) : null; return v ? Math.round(mktEx(car, v)*1000) : null; };
  const aaOn = d => { if (!sb) return null; const {y, m} = ym(d.slice(0,7)), i = (y-2025)*12 + (m-9); return i>=0 && i<sb.aa.length ? sb.aa[i]*1000 : null; };   // 🗣「各価格グラフに AA 相場も」
  // 区切り：値付けの日・月初・今日
  const cuts = new Set([start, TODAY]); hs.forEach(h=>{ if (h.date>=start) cuts.add(h.date); });
  for (let {y, m} = ym(start.slice(0,7));;){ m++; if (m>12){ m = 1; y++; } const d1 = `${y}-${String(m).padStart(2,'0')}-01`; if (d1 > TODAY) break; cuts.add(d1); }
  const ds = [...cuts].sort(), segs = ds.slice(0,-1).map((d,i)=>({ a:d, z:ds[i+1], my:priceOn(d), mk:mktOn(d), aa:showAA ? aaOn(d) : null }));
  // 🗣「小売りの予想値も」：小売＝いまの小売 ×（1＋小売の月の傾き）^月数。見込みの範囲はいつも出し、AA の見込みはスイッチを入れた時だけ
  const aaNowV = FUT ? aaOn(TODAY) : null, mkNowV = FUT ? mktOn(TODAY) : null;
  const futOf = (v0, sl) => futM.map((d,i)=>({ a:d, z:futM[i+1]||endD, v:Math.round(v0*Math.pow(1+sl/100, i+1)/1000)*1000 }));
  const fut = FUT ? futOf(aaNowV, sb.slopeAA) : [], futMk = FUT ? futOf(mkNowV, sb.slope) : [];
  const vals = segs.flatMap(s=>[s.my, s.mk, s.aa]).concat([costIn], showAA ? fut.map(f=>f.v) : [], futMk.map(f=>f.v)).filter(v=>v);
  if (!vals.length) return '<div class="q-why">まだ値付けがありません</div>';
  const W = 1040, H = 210, L = 46, R = 150, T = 12, B = 24;
  const lo = Math.floor(Math.min(...vals)/100000)*100000 - 50000, hi = Math.ceil(Math.max(...vals)/100000)*100000 + 50000;
  const x = d => L + (W-L-R)*daysBetween(start, d)/span, y = v => T + (H-T-B)*(1-(v-lo)/(hi-lo));
  let g = ''; const step = (hi-lo) > 1500000 ? 200000 : 100000;
  for (let v = Math.ceil(lo/step)*step; v <= hi; v += step) g += `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" opacity=".1"/><text x="${L-5}" y="${y(v)+3}" font-size="10" text-anchor="end" fill="currentColor" opacity=".55">${v/10000}</text>`;
  ds.concat(futM).filter(d=>d.endsWith('-01')||d===start).forEach(d=>{ g += `<line x1="${x(d)}" x2="${x(d)}" y1="${T}" y2="${H-B}" stroke="currentColor" opacity=".06"/><text x="${x(d)}" y="${H-8}" font-size="10" text-anchor="middle" fill="currentColor" opacity=".55">${d===start?jd(d).slice(5):+d.slice(5,7)+'月'}</text>`; });
  // 相場との差（塗り）
  segs.forEach(s=>{ if (s.my && s.mk){ const up = s.my > s.mk; g += `<rect x="${x(s.a)}" width="${Math.max(0,x(s.z)-x(s.a))}" y="${y(Math.max(s.my,s.mk))}" height="${Math.abs(y(s.my)-y(s.mk))}" fill="${up?'#f59e0b':'#22c55e'}" opacity=".18"/>`; } });
  // 線（段々）
  const stepPath = key => { let d = '', pen = false; segs.forEach(s=>{ const v = s[key]; if (!v){ pen = false; return; } d += `${pen?'L':'M'}${x(s.a).toFixed(1)} ${y(v).toFixed(1)} L${x(s.z).toFixed(1)} ${y(v).toFixed(1)} `; pen = true; }); return d; };
  g += `<path d="${stepPath('mk')}" fill="none" stroke="#22c55e" stroke-width="2.2"/>${showAA?`<path d="${stepPath('aa')}" fill="none" stroke="#a855f7" stroke-width="2.2"/>`:''}`;
  const futPath = (v0, fs) => { let d = `M${x(TODAY).toFixed(1)} ${y(v0).toFixed(1)} `, prev = v0; fs.forEach(f=>{ d += `L${x(f.a).toFixed(1)} ${y(prev).toFixed(1)} L${x(f.a).toFixed(1)} ${y(f.v).toFixed(1)} L${x(f.z).toFixed(1)} ${y(f.v).toFixed(1)} `; prev = f.v; }); return d; };
  if (FUT){
    g += `<rect x="${x(TODAY)}" y="${T}" width="${x(endD)-x(TODAY)}" height="${H-T-B}" fill="currentColor" opacity=".04"/><line x1="${x(TODAY)}" x2="${x(TODAY)}" y1="${T}" y2="${H-B}" stroke="currentColor" opacity=".35" stroke-dasharray="3 3"/><text x="${x(TODAY)+4}" y="${T+10}" font-size="10" fill="currentColor" opacity=".6">今日</text><text x="${x(endD)-4}" y="${T+10}" font-size="10" text-anchor="end" fill="currentColor" opacity=".6">見込み</text>
      <path d="${futPath(mkNowV, futMk)}" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="5 4"/>${showAA?`<path d="${futPath(aaNowV, fut)}" fill="none" stroke="#a855f7" stroke-width="2" stroke-dasharray="5 4"/>`:''}`; }
  if (costIn) g += `<line x1="${L}" x2="${W-R}" y1="${y(costIn)}" y2="${y(costIn)}" stroke="#ef4444" stroke-width="1.8" stroke-dasharray="6 4"/>`;
  g += `<path d="${stepPath('my')}" fill="none" stroke="#0ea5e9" stroke-width="2.8"/>`;
  hs.forEach(h=>{ if (h.date>=start && h.from) g += `<circle cx="${x(h.date)}" cy="${y(h.to)}" r="3.5" fill="#0ea5e9"/>`; });
  // 右端の数字
  const last = segs[segs.length-1], myNow = last.my, mkNow = last.mk, aaNow = last.aa, xe = W-R+8;
  // 右端の数字：上から順に並べ、近すぎる時は 13px ずつ下へずらす
  const labs = [[myNow,'#0ea5e9','自社'],[mkNow,'#22c55e','相場'],[aaNow,'#a855f7','AA'],[costIn,'#ef4444','仕入れ']].filter(l=>l[0]).map(l=>({ v:l[0], col:l[1], txt:`${l[2]} ${mk(l[0]/1000)}万`, yy:y(l[0])+4 })).sort((a,c)=>a.yy-c.yy);
  labs.forEach((l,i)=>{ if (i && l.yy < labs[i-1].yy+13) l.yy = labs[i-1].yy+13; g += `<text x="${xe}" y="${l.yy}" font-size="11" font-weight="700" fill="${l.col}">${l.txt}</text>`; });
  const aaGap = myNow && aaNow ? myNow - aaNow : null;
  const gap = myNow && mkNow ? myNow - mkNow : null, room = myNow && costIn ? myNow - costIn : null;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;color:var(--text)">${g}</svg>
    <div class="cut-leg"><span><b style="color:#0ea5e9">━</b> 自社の車両本体</span><span><b style="color:#22c55e">━</b> 小売相場（本体に直した値）</span><span>┅ 見込み</span>${showAA?'<span><b style="color:#a855f7">━</b> AA 相場</span>':''}<span><b style="color:#ef4444">┅</b> 仕入れ原価</span><span>単位：万円・税抜</span>
      <span class="sp"></span>${gap!=null?`<span>相場との差 <b style="color:${gap>0?'var(--orange)':'var(--green)'}">${gap>0?'＋':'▲'}${yen(Math.abs(gap))}円</b></span>`:''}${aaGap!=null?`<span>AAとの差 <b>${yen(aaGap)}円</b></span>`:''}${room!=null?`<span>仕入れとの差 <b>${yen(room)}円</b></span>`:''}</div>${FUT && showAA ? sellLine(c, aaNowV, fut) : ''}`;
}
/* 理由は3つ（🗣「本体価格調整／月次プライス改定（諸費用）／その他 理由 だけでOK」） */
/* 🗣 2026-10-05「月次調整はないよな。やるなら基本見積から自賠の金額などを減らさなきゃいけない。選択肢としては抜いていい」→ 月ごとの税・保険の変わり目は履歴に自動の行で残るだけ */
const CUT_WHY = ['本体価格調整（値引き）','その他'];
/* 期間限定の値下げ（セール）。🗣 2026-10-05「価格変更に一時的（セール）も必要かも。最初にいつからいつで日数選んどいて、自動で戻る感じ」
   b.sale＝{ from 開始日, to 終了日, price セールの本体（税抜）, prev 元の本体, why, on 始めたか }。終了日の次の日に prev へ戻す（どちらも履歴に残す） */
const dPlus = (d, n) => { const x = new Date(d+'T00:00:00Z'); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().slice(0,10); };
const SALE_DAYS = [3,7,14,30];
function saleTick(today){ today = today || TODAY; let ch = false;
  S.cars.forEach(c=>{ const b = c.base, s = b && b.sale; if (!s || c.order) return;
    if (!s.on && s.from <= today){ b.hist.push({ date:s.from, from:b.price, to:s.price, why:`${s.why}（〜${jd(s.to).slice(5)}）`, soba: sobaOf(c) ? sobaOf(c).now : null }); s.prev = b.price; b.price = s.price; s.on = true; b.changed = s.from; ch = true; }
    if (s.on && s.to < today){ const back = dPlus(s.to, 1); b.hist.push({ date:back, from:b.price, to:s.prev, why:'セール終了（自動で元の価格に戻した）' }); b.price = s.prev; b.sale = null; b.changed = back; ch = true; } });
  return ch; }
function saleStop(cid){ const car = carOf(cid), b = car.base, s = b.sale; if (!s) return; snap();
  if (s.on){ b.hist.push({ date:TODAY, from:b.price, to:s.prev, why:'セールを途中でやめた（元の価格に戻した）' }); b.price = s.prev; b.changed = TODAY; }
  b.sale = null; save(); render(); toast(s.on ? 'セールをやめて元の価格に戻しました' : 'セールの予定を消しました', true); }
/* モックだけ：終了日まで日付を進めたことにして、自動で戻るのを確かめる */
function saleMockEnd(cid){ const s = carOf(cid).base.sale; if (!s) return; snap(); saleTick(dPlus(s.to, 1)); save(); render(); toast('（モック）終了日の次の日になったことにして、元の価格に戻しました', true); }
function saleBadge(car){ const s = car.base && car.base.sale; if (!s) return '';
  return `<div class="q-sale">${I('clock','🕗',13)} <b>${s.on?'セール中':'セール予定'}</b> ${jd(s.from).slice(5)}〜${jd(s.to).slice(5)}（${daysBetween(s.from, s.to)+1}日）・本体 ${yen(s.price)}／${jd(dPlus(s.to,1)).slice(5)} に ${yen(s.on?s.prev:car.base.price)} へ自動で戻る
    <button class="q-btn sm" onclick="saleStop('${car.id}')">${s.on?'やめて戻す':'予定を消す'}</button>${s.on?`<button class="q-btn sm" onclick="saleMockEnd('${car.id}')" title="モックだけ">（モック）終了日を過ぎたことにする</button>`:''}</div>`; }
function cutSaleUI(){ const u = S.ui.cutSale = S.ui.cutSale || { on:false, from:TODAY, days:7 }, to = u.to || dPlus(u.from, u.days-1);
  $('cut-sale').innerHTML = `<label class="k" style="display:block;margin-top:8px">期間</label>${seg(u.on?'sale':'keep',[['keep','ずっと'],['sale','期間限定（セール）']],"S.ui.cutSale.on='$v'==='sale';cutSaleUI()")}
    ${u.on?`<div class="cut-sale"><span class="k">開始</span><input type="date" class="q-in" style="width:150px" value="${u.from}" onchange="S.ui.cutSale.from=this.value;S.ui.cutSale.to=null;cutSaleUI()">
      <span class="k">日数</span>${seg(u.to?'':String(u.days), SALE_DAYS.map(n=>[String(n), n+'日']), "S.ui.cutSale.days=+'$v';S.ui.cutSale.to=null;cutSaleUI()")}
      <span class="k">終了</span><input type="date" class="q-in" style="width:150px" value="${to}" onchange="S.ui.cutSale.to=this.value;cutSaleUI()">
      <div class="q-why" style="width:100%;margin:2px 0 0">${jd(u.from)}〜${jd(to)}（${daysBetween(u.from,to)+1}日）。${jd(dPlus(to,1))} に今の価格へ自動で戻る</div></div>`:''}`; }
/* ---------- 価格履歴（見るだけ）（🗣 2026-10-01「見積ボタンの横に価格履歴ボタン。値下げ画面から数字をいじるのだけ外して、値下げの履歴、相場など現在の価格状況をしっかり把握できる画面」） ---------- */
function openPriceView(cid){ const car = carOf(cid), b = car.base, k = calc(baseCtx(car)), sb = sobaOf(car), days = daysBetween(car.buyDate, TODAY);
  const lastBody = priceEvents(car).filter(e=>e.kind==='body').pop();
  const c = b.cost || {}, costIn = costOf(b);
  const r = sb ? k.bodyIn/1000/sb.now : null, lab = r ? ratioLabel(r) : null, gap = sb ? b.price - Math.round(mktEx(car, sb.now)*1000) : null;
  const stat = (l, v, s) => `<div class="pv-s"><span class="k">${l}</span><b>${v}</b>${s?`<small>${s}</small>`:''}</div>`;
  ov(`<div class="hd">${I('down','↓',16)} 価格履歴　<span style="font-weight:600;font-size:13px;color:var(--text2)">${esc(car.num)} ${esc(car.maker)} ${esc(car.model)} ${esc(car.grade)}</span><button class="x" onclick="closeOv()">✕</button></div><div class="bd">
    <div class="pv-top">
      <div class="pv-stats">
        ${stat('車両本体（税抜）', yen(b.price)+'円')}${stat('支払総額（税込）', yen(k.cash)+'円')}
        ${stat('在庫', days+'日目', days>=240?'8か月＝業販かAAに戻す時期':days>=120?'4か月＝値付けを見直す時期':'4か月で見直し')}
        ${stat('最後の調整', lastBody?jd(lastBody.date):'—', lastBody?daysBetween(lastBody.date, TODAY)+'日前・'+esc(lastBody.why):'')}
        ${stat('仕入れとの差（本体）', costIn?yen(b.price-costIn)+'円':'—', costIn?'仕入れ原価（税抜）'+yen(costIn)+'円':'')}
      </div>
      <div class="pv-mk">${sb ? `
        <div class="cut-ratio" style="margin-top:0"><span class="lb">相場比</span><span class="q-pill ${lab[0]}">${lab[1]} ${Math.round(r*100)}%</span><span class="q-why" style="margin:0">相場 本体 ${mk(mktEx(car, sb.now))}万（税抜）・相場との差 <b style="color:${gap>0?'var(--orange)':'var(--green)'}">${gap>0?'＋':'▲'}${yen(Math.abs(gap))}円</b></span></div>
        <div class="q-why cut-days">売れる見込み 約${sobaDays(sb, Math.round((r-1)*1000)/10)}日</div>
        <div class="q-bar cut-bar" style="margin:10px 4px 18px"><div class="m" style="left:${Math.max(2,Math.min(98,50+(r-1)*500))}%"></div><span class="l" style="left:10%">−5%</span><span class="l" style="left:35%">−2%</span><span class="l" style="left:50%">相場</span><span class="l" style="left:65%">+3%</span><span class="l" style="left:90%">+8%</span></div>`
        : `<div class="q-note warn">${I('warn','⚠',15)} 相場なし：この車種は相場カードがまだありません</div>`}
        <div style="text-align:right"><button class="q-btn sm" onclick="closeOv();openCut('${cid}')">${I('down','↓',13)} 本体価格を調整する</button></div>
      </div>
    </div>
    <div class="q-sec">値付けの履歴</div><div id="cut-hist">${priceHistHtml(car)}</div>
    ${gapBlock(car)}
    </div>`); $('q-ov').firstElementChild.classList.add('wide'); }
/* =====================================================================
   車両詳細カード（4.61.0）
   🗣 2026-10-17「carflow のモック v4.60.0 に統合したい。サンプルでいいから1台ぐらい車両詳細カードを開けるように。
      価格履歴は今の PDF ドラッグ入力から、carflow 内での見積もり作成機能から価格履歴が見れるから、それが車両詳細カードから価格履歴として見れる感じに。
      かつその価格推移とともに（相場ではなく）反響数・問い合わせ数を組み合わせて統合的に判断できるビューに」
   ・並びは本番の car-detail-v3（見出し・上の帯・左＝メモ・右＝タブ）。このモックで作り込むのは［価格履歴］と［反響］だけ
   ・［価格履歴］＝見積の値付けの履歴（priceEvents・priceHistHtml＝本体価格の調整・月次の諸費用）を正にして、
     同じ時間の軸に小売相場とグー・カーセンサーの反響（生の数字）を重ねる。点数は入れない（4.63.0）
   ・［反響］＝車としての強さの点数（見られ力・決め手力・総合。店の中の順位で出す）＋媒体ごと（4.63.0）
   ・反響の数字は本番では週1回の点検で上げる（グー＝効果分析＞在庫の日ごと・カーセンサー＝登録物件の累計の差し引き）。
     このモックの反響は展示中の車に入れた「見本の数字」（作った数字。画面にも見本と出す）
   ===================================================================== */
let CDX = { id:null, tab:'price', unit:'w' };

function openDetail(cid, tab){ CDX.id = cid; if (tab) CDX.tab = tab;
  let o = document.getElementById('cdx-ov');
  if (!o){ o = document.createElement('div'); o.id = 'cdx-ov'; o.className = 'cdx-ov'; o.onclick = e => { if (e.target === o) closeDetail(); }; document.body.appendChild(o); }
  o.hidden = false; cdxDraw(); }
function closeDetail(){ const o = document.getElementById('cdx-ov'); if (o) o.hidden = true; CDX.id = null; }
function cdxTab(k){ CDX.tab = k; cdxDraw(); }
function cdxDraw(){ if (S.ui.app==='hist'){ render(); return; } const o = document.getElementById('cdx-ov'), car = CDX.id && carOf(CDX.id); if (!o || !car) return;
  const days = daysBetween(car.buyDate, TODAY), [st, stl] = carStatus(car), k = car.base ? calc(baseCtx(car)) : null, rx = rxOf(car);
  const spec = (l, v) => `<div><div class="k">${l}</div><div class="v">${v}</div></div>`;
  const tabs = [['task', car.order ? '🚗 売約後タスク' : '🔧 展示前タスク'], ['eq','📋 装備詳細'], ['price','📄 価格履歴'], ['soba','📶 相場'], ['rx','📣 反響']];
  const P = CDX.tab === 'price' ? cdxPrice(car) : CDX.tab === 'rx' ? cdxRx(car)
    : `<div class="cdx-ghost">（${CDX.tab==='soba'?'相場タブ＝いまの本番と同じ（相場ビューをこの車の条件で開く）':'いまの本番と同じ'}。このモックでは省略）</div>`;
  o.innerHTML = `<div class="cdx">
    <div class="cdx-hdr"><span class="t">車両の詳細</span><span class="sp"></span><button class="q-btn sm" onclick="closeDetail();openCar('${car.id}')">${I('estimate','🧾',13)} 見積を開く</button><button class="q-btn sm" onclick="closeDetail()">✕ 閉じる</button></div>
    <div class="cdx-band"><div class="ph">${carSvg(car)}</div>
      <div><div class="cdx-ttl"><span class="mk">${esc(car.maker)}</span><span class="md">${esc(car.model)}</span><span class="gr">${esc(car.grade)}</span></div>
      <div class="cdx-spec">${spec('管理番号', esc(car.num))}${spec('年式', car.firstReg?wareki(car.firstReg):'—')}${spec('走行', (car.km/10000).toFixed(1)+'万km')}${spec('色', esc(car.color))}${spec('状態', `<span class="q-pill ${st}">${esc(stl)}</span>`)}</div></div>
      <div class="cdx-right"><div class="cdx-days"><b>${days}</b><small>在庫日数</small></div>
      <div><div class="cdx-tot"><small>総額（税込）</small>${k?man(k.cash)+'万':'—'}</div><div style="text-align:right;font-size:12.5px;color:var(--text3);margin-top:4px">${k?'本体 '+man(car.base.price)+'万（税抜）':'基本価格なし'}</div></div></div></div>
    <div class="cdx-body">
      <div class="cdx-col l"><div class="cdx-tabs"><button class="cdx-tab on">📌 メモ・付箋</button><button class="cdx-tab">🕘 フロー</button></div><div class="cdx-cv"><div class="cdx-ghost">（左の欄はいまの本番と同じ。このモックでは省略）</div></div></div>
      <div class="cdx-split"></div>
      <div class="cdx-col r"><div class="cdx-tabs">${tabs.map(([t,l])=>`<button class="cdx-tab ${CDX.tab===t?'on':''}" onclick="cdxTab('${t}')">${l}${t==='rx'&&rx&&cdxAlerts(car).length?' <span class="dot"></span>':''}</button>`).join('')}</div>
      <div class="cdx-cv">${P}</div></div></div></div>`;
  if (typeof icHydrate==='function') icHydrate(o);
}

/* 見本の反響（展示中の車ぜんぶ・4.63.0）。本番は週1回の点検で上げる実データ（グー＝効果分析＞在庫の日ごと・カーセンサー＝点検ごとの差し引き）
   🗣 2026-10-17「グーとカーセンで集計方法も違うし、アルゴリズムを組んで A+ とか 98P とか最終的な点数化で」→ 点数は店の中の順位で出すので、比べる相手の車にも見本の数字を入れた
   車ごとに [見られやすさ, 決め手] を変えて、点数に差が出るようにしてある（作った数字） */
const RX_PROF = { k0442:[1.0,0.9], k0455:[1.3,0.45], k0460:[0.65,1.6], k0481:[1.55,1.35], k0511:[1.8,1.2], k0505:[1.1,0.95], k0497:[0.8,0.55], k0488:[1.0,1.45], k0476:[0.5,0.75], k0470:[1.25,1.0] };
function genRx(car, seed, dm, cv){
  let sd = seed; const rnd = () => { sd = (sd*16807) % 2147483647; return (sd-1)/2147483646; };
  const hs = car.base.hist.slice().sort((a,b)=>a.date<b.date?-1:1), first = hs[0].date, cuts = hs.filter(h=>h.from).map(h=>h.date);
  const csFirst = first > '2026-08-06' ? first : '2026-08-06', goo = [], cs = [];
  for (let d = first; d <= TODAY; d = dPlus(d, 1)){
    const age = daysBetween(first, d), wd = new Date(d+'T00:00:00').getDay();
    let k = 1; cuts.forEach((c,i)=>{ const s = daysBetween(c, d); if (s>=0 && s<21) k += (0.7/(i+1))*Math.exp(-s/6); });
    const base = 10*dm*Math.exp(-age/260)*(1+0.6*Math.exp(-age/10))*k*((wd===0||wd===6)?1.25:1);
    const f = Math.max(0, Math.round(base*(0.75+rnd()*0.5))), m = Math.round(f*(3.2+rnd()*1.6));
    const q = rnd() < 0.0035*cv*m/8 ? [rnd()<0.5?'見積':'電話', 1] : 0, kk = rnd() < 0.006*cv*m/8 ? 1 : 0;
    goo.push([d, f, m, q, kk]);
    if (d >= csFirst){ const v = Math.max(0, Math.round(base*0.42*(0.7+rnd()*0.6)));
      cs.push([d, v, rnd() < 0.012*cv*v/4 ? [rnd()<0.5?'メール':'電話', 1] : 0, rnd() < 0.03*cv*v/4 ? 1 : 0]); }
  }
  return { goo, cs, gooFirst:first, csFirst, kmGoo:true, kmCs:true };
}
const RX_SAMPLE = {};
/* 📣 v4.5.0 反響＝本物（companies/{会社}/carReactions/{車}＝設定 ▸ データ の「反響の取り込み」・週1回）。前の見本の数字（genRx・RX_PROF）は使わない
   形は前と同じ：goo＝[日, 一覧で見られた, 写真を開いた, 問い合わせ（['見積',件数]か0）, 検討中]／cs＝[日, 詳細閲覧（1日あたり）, 問い合わせ, お気に入り]
   カーセンサーは累計の控え＝控えどうしの差を日数で割って毎日に（最初の控えは掲載日数で割る） */
const RX_MEMO = {};
const rxOf = car => { if (!car) return null; const d = window.QData && QData.rx ? QData.rx(car.id) : null; if (!d) return null;
  const sig = JSON.stringify([d.goo ? Object.keys(d.goo).length : 0, d.cs ? Object.keys(d.cs).length : 0, d.updatedAt && d.updatedAt.seconds]);
  if (RX_MEMO[car.id] && RX_MEMO[car.id].sig === sig) return RX_MEMO[car.id].v;
  const goo = Object.keys(d.goo || {}).sort().map(k=>{ const v = d.goo[k] || []; return [k, +v[0]||0, +v[1]||0, (+v[2]||0) ? ['見積', +v[2]] : 0, +v[3]||0]; });
  const cs = [], snaps = Object.keys(d.cs || {}).sort();
  snaps.forEach((at, i)=>{ const v = d.cs[at] || [], pv = i ? d.cs[snaps[i-1]] || [] : null;
    const days = pv ? Math.max(1, daysBetween(snaps[i-1], at)) : Math.max(1, Math.min(120, +v[0] || 1));
    const dv = Math.max(0, (+v[1]||0) - (pv ? +pv[1]||0 : 0)), di = Math.max(0, (+v[2]||0) + (+v[3]||0) - (pv ? (+pv[2]||0) + (+pv[3]||0) : 0)), df = Math.max(0, (+v[5]||0) - (pv ? +pv[5]||0 : 0));
    for (let j = days - 1; j >= 0; j--){ const day = dPlus(at, -j); cs.push([day, dv/days, j===0 && di ? ['問い合わせ', di] : 0, j===0 ? df : 0]); } });
  const v = (goo.length || cs.length) ? { goo, cs, gooFirst: goo.length ? goo[0][0] : '', csFirst: cs.length ? cs[0][0] : '', kmGoo: !!goo.length, kmCs: !!cs.length, real: true } : null;
  RX_MEMO[car.id] = { sig, v }; return v; };

/* =====================================================================
   反響の点数（車としてのパワー）
   🗣 以前の「戦闘力」＝ビュー数÷在庫日数 は当てにならなかった → その理由をつぶす作りにした
     ① 累計で割らない：直近14日だけ
     ② 生の回数で比べない：同じ日に展示中で載っている自社の車の真ん中と比べた倍率を点に（真ん中＝50）。グーとカーセンサーは別々に比べてから合わせる＝数え方の違い・媒体の都合の上下が消える
        （順位にすると台数が少ない時に0や100に飛ぶので、倍率をなめらかに点にした）
     ③ 載せたての勢いを引く：載せて間もない車は見られやすいのが普通（× 1＋0.6×e^(−日数/10) で割る）
     ④ 2つに分ける：見られ力（一覧で選ばれるか）／決め手力（見た人が問い合わせ・検討中・お気に入りまで進むか）
     ⑤ 数字が少ない車はたまたまで跳ねないように真ん中へ寄せる（決め手は店全体の割合に寄せる・載せて7日未満は点数ごと寄せる）
   総合＝見られ力 45％＋決め手力 55％（売れるのに近い方を重く）。A+ 90〜／A 80〜／B+ 70〜／B 55〜／C 40〜／D
   ⚠ 本番に入れる前に、実データ（グーの日ごと・売れた車も入る）で「点数が高い車ほど早く問い合わせ・売約になったか」を答え合わせして、重みを決め直す
   ===================================================================== */
const RX_WIN = 14;
const ageAdj = age => 1 + 0.6*Math.exp(-age/10);
const sumI = (rows, i) => rows.reduce((s,r)=>s+(Array.isArray(r[i])?r[i][1]:(r[i]||0)), 0);
function rxRaw(car, end){ const rx = rxOf(car); if (!rx) return null;
  const a = dPlus(end, -RX_WIN+1), g = rx.goo.filter(r=>r[0]>=a && r[0]<=end), c = rx.cs.filter(r=>r[0]>=a && r[0]<=end);
  if (!g.length) return null;
  const ageG = daysBetween(rx.gooFirst, end), ageC = daysBetween(rx.csFirst, end);
  const gF = sumI(g,1)/g.length, gM = sumI(g,2)/g.length, cV = c.length ? sumI(c,1)/c.length : null;
  const inq = sumI(g,3) + sumI(c,2), kk = sumI(g,4), fav = sumI(c,3);
  return { n:g.length, nC:c.length, gF, gM, cV, inq, kk, fav, ageG,
    vg: gF/ageAdj(ageG), vc: cV!=null && c.length>=5 ? cV/ageAdj(ageC) : null,
    act: inq*10 + kk*3 + fav*2, base: sumI(g,2) + sumI(c,1) };
}
const median = a => { a = a.slice().sort((x,y)=>x-y); const m = a.length>>1; return a.length ? (a.length%2 ? a[m] : (a[m-1]+a[m])/2) : null; };
/* 店の真ん中と比べた倍率を 0〜100 に（真ん中＝50・2倍で約80・半分で約20）。順位だと台数が少ない時に 0 や 100 に飛ぶので、倍率をなめらかに点にする */
const relPt = (v, mid, sc) => v==null || !mid ? null : 50 + 50*Math.tanh(Math.log(Math.max(v,1e-6)/mid)/sc);
const _rxCache = {};
function rxScores(end){ if (_rxCache[end]) return _rxCache[end];
  const P = S.cars.filter(c=>c.base && phaseOf(c)==='exhibit').map(c=>({ c, r:rxRaw(c, end) })).filter(x=>x.r);
  const all = S.cars.filter(c=>c.base).map(c=>({ c, r:rxRaw(c, end) })).filter(x=>x.r);
  const tot = P.reduce((a,x)=>({ act:a.act+x.r.act, base:a.base+x.r.base }), { act:0, base:0 }), avg = tot.base ? tot.act/tot.base : 0, K = 1500;
  const rate = r => (r.act + avg*K)/(r.base + K);   // 見た回数が少ない車は店の平均に寄る（K＝見た回数 1,500回ぶんの重み）
  const mg = median(P.map(x=>x.r.vg)), mc = median(P.filter(x=>x.r.vc!=null).map(x=>x.r.vc));
  const out = {};
  all.forEach(({c, r})=>{
    const pg = relPt(r.vg, mg, 0.9), pc = r.vc!=null && mc ? relPt(r.vc, mc, 0.9) : null;
    let see = pc==null ? pg : pg*0.6 + pc*0.4, win = relPt(rate(r), avg, 0.6);
    const wt = Math.min(1, r.n/7); see = 50+(see-50)*wt; win = 50+(win-50)*wt;
    out[c.id] = { see:Math.round(see), win:Math.round(win), total:Math.round(see*0.45 + win*0.55), pg:Math.round(pg), pc:pc==null?null:Math.round(pc),
      gx:r.vg/mg, cx:pc==null?null:r.vc/mc, rate:rate(r), avgRate:avg, raw:r, thin:r.n<7 }; });
  const ord = P.map(x=>x.c.id).filter(id=>out[id]).sort((a,b)=>out[b].total-out[a].total);
  ord.forEach((id,i)=>{ out[id].rank = i+1; }); out._n = ord.length;
  return _rxCache[end] = out;
}
const rxScore = (car, end) => (rxScores(end||TODAY)[car.id]) || null;
const gradeOf = p => p>=90?'A+':p>=80?'A':p>=70?'B+':p>=55?'B':p>=40?'C':'D';
const gradeCls = p => p>=80?'g':p>=55?'b':p>=40?'m':'r';
function rxRead(s){
  const hi = v => v>=60, lo = v => v<45;
  if (hi(s.see) && hi(s.win)) return ['grn','💪 見られて、決め手もある','いまの出し方が効いている。値段を急いで下げなくてよい'];
  if (hi(s.see) && lo(s.win)) return ['org','👀 見られているのに、先へ進まない','一覧では選ばれている。開いた後で止まる＝値段・コメント・写真の中身（傷・内装・装備の見せ方）を先に見る'];
  if (lo(s.see) && hi(s.win)) return ['org','🔍 見た人は反応するのに、見られていない','一覧で選ばれていない＝1枚目の写真・タイトル・一覧に出る値段を先に見る'];
  if (lo(s.see) && lo(s.win)) return ['red','⚠ どちらも弱い','値段から見直す（相場は［価格履歴］）'];
  return ['','➖ ふつう','店の真ん中あたり'];
}

/* ---- 値付けごとの区切り（本体の値付けだけ。月次の諸費用の自動の行は区切りにしない） ---- */
function cdxPeriods(car){
  const ev = priceEvents(car).filter(e=>e.kind==='body'), seibi = seibiOf(car.base);
  return ev.map((e,i)=>({ from:e.date, to: i<ev.length-1 ? dPlus(ev[i+1].date,-1) : TODAY, body:e.to, prev:e.from, why:e.why, inT:Math.floor((e.to+seibi)*1.1), cash:cashAt(car, e.to, e.date).cash, cur:i===ev.length-1, mk:(e.soba || sobaAt(car, e.date)) })).map(p=>Object.assign(p, { mkEx: p.mk ? mktEx(car, p.mk) : null }));
}
function rxSum(rows, a, z, idx){ return sumI(rows.filter(r=>r[0]>=a && r[0]<=z), idx); }
function rxDays(rows, a, z){ return rows.filter(r=>r[0]>=a && r[0]<=z).length; }
function cdxRows(car){ const rx = rxOf(car);
  return cdxPeriods(car).map(p=>{ const nG = rx ? rxDays(rx.goo, p.from, p.to) : 0, nC = rx ? rxDays(rx.cs, p.from, p.to) : 0;
    return Object.assign(p, { days:daysBetween(p.from, p.to)+1, nG, nC,
      gF: nG ? rxSum(rx.goo, p.from, p.to, 1)/nG : null, gM: nG ? rxSum(rx.goo, p.from, p.to, 2)/nG : null, cV: nC ? rxSum(rx.cs, p.from, p.to, 1)/nC : null,
      inqG: rx ? rxSum(rx.goo, p.from, p.to, 3) : 0, inqC: rx ? rxSum(rx.cs, p.from, p.to, 2) : 0, kG: rx ? rxSum(rx.goo, p.from, p.to, 4) : 0, fC: rx ? rxSum(rx.cs, p.from, p.to, 3) : 0 }); });
}

/* ---- ［価格履歴］＝生の数字：値段の推移・相場・反響を同じ時間の軸で（点数は入れない） ----
   🗣 2026-10-17「価格履歴にはいれない。こっちはあくまで生データと値段推移と相場との相関関係を時間軸でみるって感じで」 */
function cdxPrice(car){
  if (!car.base) return `<div class="cdx-ghost">まだ基本価格がありません。見積の「① 基本価格」で値付けすると、ここに価格履歴が出ます。<br><button class="q-btn sm" style="margin-top:8px" onclick="${S.ui.app==='hist' ? `try{window.parent.CarQuote.openFor('${car.id}')}catch(e){}` : `closeDetail();openCar('${car.id}')`}">見積を開く</button></div>`;
  const b = car.base, k = calc(baseCtx(car)), rx = rxOf(car), R = cdxRows(car), sb = sobaOf(car);
  const lastBody = priceEvents(car).filter(e=>e.kind==='body').pop();
  const r = sb ? k.bodyIn/1000/sb.now : null, gap = sb ? b.price - Math.round(mktEx(car, sb.now)*1000) : null;
  const st = (l, v, s) => `<div><div class="k">${l}</div><b>${v}</b>${s?`<small>${s}</small>`:''}</div>`;
  const inqAll = rx ? R.reduce((s,x)=>s+x.inqG+x.inqC,0) : null;
  let h = `<div class="cdx-stats">${st('車両本体（税抜）', yen(b.price))}${st('支払総額（税込）', yen(k.cash))}
    ${st('相場比', r?Math.round(r*100)+'%':'—', sb?'相場 本体 '+mk(mktEx(car, sb.now))+'万（税抜）・'+(gap>0?'＋':'▲')+yen(Math.abs(gap)):'相場なし')}${st('最後の調整', lastBody?jd(lastBody.date).slice(5):'—', lastBody?daysBetween(lastBody.date, TODAY)+'日前・値下げ '+Math.max(0,R.length-1)+'回':'')}
    ${st('問い合わせ', rx?inqAll+'件':'—', rx?'掲載から・両媒体':'反響の数字なし')}</div>`;
  h += `<div class="cdx-sec">値段・相場と反響（生の数字）${rx?'<span class="cdx-sample" style="background:var(--bg3);color:var(--text2)">反響＝グー・カーセンサー（週1回の点検で取り込み）</span>':''}<span class="sp"></span>${rx?`<span class="cdx-seg">${[['w','週ごと'],['d','日ごと']].map(([u,l])=>`<button class="${CDX.unit===u?'on':''}" onclick="CDX.unit='${u}';cdxDraw()">${l}</button>`).join('')}</span>`:''}</div>
    <div class="cdx-chart">${cdxChart(car, R)}<div class="cdx-leg"><span><b style="color:#0ea5e9">━</b> 自社の車両本体</span><span><b style="color:#22c55e">━</b> 小売相場（本体に直した値・月ごと）</span><span>単位：税抜</span>${rx?`<span><i style="background:#f0a43a"></i>グー 一覧で見られた（1日あたり）</span><span><i style="background:#5aa9f0"></i>カーセンサー 詳細を見た（1日あたり）</span><span><b style="color:var(--green)">●</b> 問い合わせ</span>`:''}<span><b style="color:#0ea5e9">┆</b> 値付けを変えた日</span></div></div>`;
  h += `<div class="cdx-sec">値付けごと（生の数字）</div>${cdxPeriodTable(R, !!rx)}`;
  if (!rx) h += `<div class="cdx-ghost" style="margin-top:10px">この車は反響の数字がまだありません（週1回のポータル点検で、設定 ▸ データ ▸ 反響の取り込み から入ります）。</div>`;
  h += `<div class="cdx-sec">値付けの履歴<span class="sp"></span><button class="q-btn sm" onclick="openCut('${car.id}')">${I('down','↓',13)} 本体価格を調整する</button></div>${priceHistHtml(car)}
    <div class="cdx-foot">・価格は見積の値付けの履歴が正（本体価格の調整・セール・月次の諸費用の自動の行）。値下げすると、ここにすぐ出る<br>・反響は週1回の点検で取り込む生の数字（グー＝日ごと／カーセンサー＝控えどうしの差を日数で割った値）。点数は作らない。お客様の名前・問い合わせの中身は入れない</div>`;
  return h;
}
function cdxPeriodTable(R, withRx){
  const f1 = v => v==null ? '—' : v.toFixed(1);
  return `<div style="overflow:auto"><table class="cdx-t"><thead><tr><th>値付け</th><th class="v">期間</th><th class="v">増減</th><th class="v">本体（税抜）</th><th class="v">支払総額（税込）</th><th class="v">その時の相場（本体）</th><th class="v">相場比</th>${withRx?'<th class="v"><span class="cdx-chip">グー</span> 一覧／日</th><th class="v">写真／日</th><th class="v"><span class="cdx-chip cs">CS</span> 詳細／日</th><th class="v">問い合わせ</th><th class="v">検討中・お気に入り</th>':''}</tr></thead><tbody>`
    + R.slice().reverse().map(r=>{ const rr = r.mk ? r.inT/1000/r.mk : null;
      return `<tr class="${r.cur?'cur':''}"><td>${jd(r.from)}${r.cur?' <span class="q-pill good">現行</span>':''}<small>${esc(r.why)}</small></td>
      <td class="v">${r.days}日間<small>〜${r.cur?'今日':jd(r.to).slice(5)}</small></td>
      <td class="v" style="font-weight:800;color:${!r.prev?'var(--text3)':r.body<r.prev?'var(--green)':'var(--orange)'}">${!r.prev?'初回':(r.body<r.prev?'▲':'＋')+yen(Math.abs(r.body-r.prev))}</td>
      <td class="v"><b>${yen(r.body)}</b></td><td class="v">${yen(r.cash)}</td><td class="v">${r.mk?mk(r.mkEx)+'万':'—'}</td><td class="v">${rr?Math.round(rr*100)+'%':'—'}</td>
      ${withRx?`<td class="v"><b>${f1(r.gF)}</b></td><td class="v">${f1(r.gM)}</td><td class="v">${r.nC?f1(r.cV):'<small>掲載前</small>'}</td>
      <td class="v"><b>${r.inqG+r.inqC}</b><small>グー ${r.inqG}・CS ${r.inqC}</small></td><td class="v">${r.kG}・${r.fC}</td>`:''}</tr>`; }).join('')
    + `</tbody></table></div>`;
}
function cdxChart(car, R){
  const rx = rxOf(car), wk = CDX.unit==='w', start = [R[0].from, rx && rx.gooFirst, rx && rx.csFirst].filter(Boolean).sort()[0], span = Math.max(1, daysBetween(start, TODAY)+1);
  const W = 1040, L = 46, Rr = 70, T = 10, H1 = rx ? 120 : 190, G = rx ? 16 : 0, H2 = rx ? 140 : 0, B = 22, H = T+H1+G+H2+B;
  const x = d => L + (W-L-Rr)*daysBetween(start, d)/span;
  /* 相場（月ごと）＝その月の1日〜月末 */
  const mks = []; for (let d = start.slice(0,7)+'-01'; d <= TODAY; ){ const {y, m} = ym(d.slice(0,7)), nx = `${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}-01`, v = sobaAt(car, d); if (v) mks.push({ a: d<start?start:d, z: nx>TODAY?dPlus(TODAY,1):nx, v:Math.round(mktEx(car, v)*1000) }); d = nx; }
  const pv = R.map(r=>r.body).concat(mks.map(m=>m.v)), lo = Math.min(...pv), hi = Math.max(...pv), pad = Math.max(30000, (hi-lo)*0.12);
  const y1 = v => T + H1*(1 - (v-(lo-pad))/((hi+pad)-(lo-pad)));
  let g = '';
  for (let d = start.slice(0,7)+'-01'; d <= TODAY; ){ const {y, m} = ym(d.slice(0,7)), nx = `${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}-01`; if (d >= start) g += `<line x1="${x(d)}" x2="${x(d)}" y1="${T}" y2="${H-B}" stroke="currentColor" opacity=".07"/><text x="${x(d)+3}" y="${H-7}" font-size="10" fill="currentColor" opacity=".55">${m}月</text>`; d = nx; }
  /* 上：自社の車両本体（税抜・段々）と小売相場（本体に直した値）。相場との差を塗る（上＝相場より高い・下＝安い） */
  const priceOn = d => { let p = null; R.forEach(r=>{ if (r.from<=d) p = r.body; }); return p; };
  mks.forEach(m=>{ const my = priceOn(m.a); if (my){ const up = my > m.v; g += `<rect x="${x(m.a)}" width="${Math.max(0,x(m.z)-x(m.a))}" y="${y1(Math.max(my,m.v))}" height="${Math.abs(y1(my)-y1(m.v))}" fill="${up?'#f59e0b':'#22c55e'}" opacity=".14"/>`; } });
  let pm = ''; mks.forEach((m,i)=>{ pm += `${i?'L':'M'}${x(m.a).toFixed(1)} ${y1(m.v).toFixed(1)} L${x(m.z).toFixed(1)} ${y1(m.v).toFixed(1)} `; });
  if (pm) g += `<path d="${pm}" fill="none" stroke="#22c55e" stroke-width="2"/>`;
  let p = ''; R.forEach((r,i)=>{ p += `${i?'L':'M'}${x(r.from).toFixed(1)} ${y1(r.body).toFixed(1)} L${x(r.cur?dPlus(TODAY,1):dPlus(r.to,1)).toFixed(1)} ${y1(r.body).toFixed(1)} `; });
  g += `<path d="${p}" fill="none" stroke="#0ea5e9" stroke-width="2.6"/>`;
  R.forEach(r=>{ g += `<circle cx="${x(r.from)}" cy="${y1(r.body)}" r="3.5" fill="#0ea5e9"/><text x="${x(r.from)+4}" y="${y1(r.body)-6}" font-size="10.5" font-weight="700" fill="#0ea5e9">${mk(r.body/1000)}万</text>`;
    if (r.prev) g += `<line x1="${x(r.from)}" x2="${x(r.from)}" y1="${T}" y2="${H-B}" stroke="#0ea5e9" stroke-dasharray="3 3" opacity=".7"/>`; });
  if (mks.length){ const lm = mks[mks.length-1]; g += `<text x="${W-Rr+6}" y="${y1(lm.v)+4}" font-size="11" font-weight="700" fill="#22c55e">相場 ${mk(lm.v/1000)}万</text>`; }
  if (rx){
    const bucket = rows => { const m = {}; rows.forEach(r=>{ let key = r[0]; if (wk){ const t = new Date(r[0]+'T00:00:00'), dw = (t.getDay()+6)%7; key = dPlus(r[0], -dw); if (key < start) key = start; } (m[key] = m[key] || []).push(r); }); return m; };
    const bg = bucket(rx.goo.filter(r=>r[0]>=start)), bc = bucket(rx.cs.filter(r=>r[0]>=start)), keys = Object.keys(bg).sort();
    const av = (a, i) => a ? a.reduce((s,r)=>s+(r[i]||0),0)/a.length : 0;
    const mx = Math.max(4, ...keys.map(k2=>Math.max(av(bg[k2],1), av(bc[k2],1))));
    const y2 = v => T+H1+G + H2*(1 - v/mx);
    [0, .5, 1].forEach(t=>{ const v = Math.round(mx*t); g += `<line x1="${L}" x2="${W-Rr}" y1="${y2(v)}" y2="${y2(v)}" stroke="currentColor" opacity=".1"/><text x="${L-6}" y="${y2(v)+3}" font-size="10" text-anchor="end" fill="currentColor" opacity=".55">${v}</text>`; });
    g += `<text x="${L-6}" y="${H-7}" font-size="10" text-anchor="end" fill="currentColor" opacity=".55">回/日</text>`;
    keys.forEach((k2,i)=>{ const x0 = x(k2), x1 = i<keys.length-1 ? x(keys[i+1]) : x(dPlus(TODAY,1)), w = Math.max(1.5, (x1-x0)*0.8), half = w/2;
      const vg = av(bg[k2],1), vc = bc[k2] ? av(bc[k2],1) : null;
      g += `<rect x="${x0+(x1-x0-w)/2}" y="${y2(vg)}" width="${vc!=null?half:w}" height="${y2(0)-y2(vg)}" fill="#f0a43a" opacity=".85"><title>${jd(k2).slice(5)}${wk?'の週':''}：グー ${vg.toFixed(1)}回/日</title></rect>`;
      if (vc!=null) g += `<rect x="${x0+(x1-x0-w)/2+half}" y="${y2(vc)}" width="${half}" height="${y2(0)-y2(vc)}" fill="#5aa9f0" opacity=".9"><title>${jd(k2).slice(5)}${wk?'の週':''}：カーセンサー ${vc.toFixed(1)}回/日</title></rect>`; });
    const inq = rx.goo.filter(r=>r[3]).map(r=>[r[0],'グー '+r[3][0]]).concat(rx.cs.filter(r=>r[2]).map(r=>[r[0],'CS '+r[2][0]]));
    inq.forEach(([d, t])=>{ if (d>=start) g += `<circle cx="${x(d)}" cy="${T+H1+G+8}" r="5" fill="var(--green)"><title>${jd(d).slice(5)} ${t}</title></circle>`; });
  }
  return `<svg viewBox="0 0 ${W} ${H}" style="color:var(--text)">${g}</svg>`;
}

/* ---- ［反響］＝車としてのパワー（点数）＋媒体ごと ---- */
function cdxAlerts(car){ const A = [], rx = rxOf(car); if (!rx || !car.base) return A;
  const pd = car.base.portalDone || {};
  if (car.base.changed && (pd.goo||'') < car.base.changed) A.push('グーの価格が見積の最新の値付けにまだ合っていない（' + jd(car.base.changed).slice(5) + ' に変更）');
  if (car.base.changed && (pd.cs||'') < car.base.changed) A.push('カーセンサーの価格が見積の最新の値付けにまだ合っていない');
  return A; }
function scoreBadge(s, big){ if (!s) return ''; return `<span class="rxs-badge ${gradeCls(s.total)} ${big?'big':''}"><b>${s.total}</b><small>P</small><i>${gradeOf(s.total)}</i></span>`; }
function cdxRx(car){
  const rx = rxOf(car), s = rxScore(car);
  if (!rx || !s) return `<div class="cdx-ghost">この車は反響の数字がまだありません（週1回のポータル点検で、設定 ▸ データ ▸ 反響の取り込み から入ります）。<br><button class="q-btn sm" style="margin-top:8px" onclick="openDetail('k0442','rx')">KM-0442 で見る</button></div>`;
  const s0 = rxScore(car, dPlus(TODAY, -RX_WIN)), dlt = s0 ? s.total - s0.total : null, rd = rxRead(s), r = s.raw, A = cdxAlerts(car);
  const bar = (lb, v, sub) => `<div class="rxs-axis"><div class="rxs-al"><b>${lb}</b><span class="rxs-g ${gradeCls(v)}">${gradeOf(v)}</span><span class="rxs-v">${v}</span></div><div class="rxs-bar"><i style="width:${v}%" class="${gradeCls(v)}"></i><span style="left:50%"></span></div><div class="rxs-sub">${sub}</div></div>`;
  let h = `<div class="rxs-hero">
      <div class="rxs-tot">${scoreBadge(s, 1)}<div class="rxs-tl"><b>車としての強さ</b><span>直近${RX_WIN}日・展示中 ${rxScores(TODAY)._n}台の中で ${s.rank?s.rank+'位':'—'}</span>${dlt!=null?`<span>${RX_WIN}日前 ${s0.total}P → <b style="color:${dlt>0?'var(--green)':dlt<0?'var(--red,#ef4444)':'var(--text2)'}">${dlt>0?'↑':dlt<0?'↓':'→'}${Math.abs(dlt)}</b></span>`:''}${s.thin?'<span class="cdx-sample">載せて日が浅い＝仮の点数</span>':''}<span class="cdx-sample">見本の数字</span></div></div>
      <div class="rxs-axes">${bar('見られ力', s.see, '一覧で選ばれているか（グー 一覧で見られた・カーセンサー 詳細を見た）')}${bar('決め手力', s.win, '見た人が 問い合わせ・検討中・お気に入り まで進んでいるか')}</div></div>
    <div class="cdx-read ${rd[0]}"><b class="h">${rd[1]}</b>${rd[2]}</div>`;
  if (A.length) h += A.map(a=>`<div class="cdx-read org" style="padding:7px 12px;margin-bottom:6px">⚠ ${a}</div>`).join('');
  h += `<div class="cdx-sec">点数の推移（週ごと）<span class="sp"></span><span style="font-weight:400">┆＝値付けを変えた日</span></div><div class="cdx-chart">${rxTrend(car)}</div>`;
  const f1 = v => v==null ? '—' : v.toFixed(1), pctTxt = v => v==null ? '—' : v+'';
  h += `<div class="cdx-sec">点数の中身（直近${RX_WIN}日の生の数字）</div><table class="cdx-t"><thead><tr><th></th><th class="v">見られた／日</th><th class="v">載せて${r.ageG}日目の普通との比</th><th class="v">店の真ん中との比 → 点</th><th class="v">先へ進んだ</th></tr></thead><tbody>
    <tr><td><span class="cdx-chip">グー</span> 一覧で見られた</td><td class="v"><b>${f1(r.gF)}</b><small>写真を開いた ${f1(r.gM)}</small></td><td class="v">× ${(1/ageAdj(r.ageG)).toFixed(2)}</td><td class="v">${s.gx.toFixed(2)}倍 → <b>${s.pg}</b></td><td class="v">問い合わせ ${sumI(rx.goo.filter(x=>x[0]>dPlus(TODAY,-RX_WIN)),3)}・検討中 ${r.kk}</td></tr>
    <tr><td><span class="cdx-chip cs">CS</span> 詳細を見た</td><td class="v"><b>${f1(r.cV)}</b></td><td class="v">${r.nC?'× '+(1/ageAdj(daysBetween(rx.csFirst, TODAY))).toFixed(2):'—'}</td><td class="v">${s.pc==null?'—<small>数字が足りない</small>':s.cx.toFixed(2)+'倍 → <b>'+s.pc+'</b>'}</td><td class="v">問い合わせ ${sumI(rx.cs.filter(x=>x[0]>dPlus(TODAY,-RX_WIN)),2)}・お気に入り ${r.fav}</td></tr>
    <tr><td>決め手（両媒体）</td><td class="v" colspan="2">（問い合わせ×10＋検討中×3＋お気に入り×2）÷ 見た回数 ×100</td><td class="v">${(s.rate/s.avgRate).toFixed(2)}倍 → <b>${s.win}</b></td><td class="v">${(s.rate*100).toFixed(2)}<small>店の平均 ${(s.avgRate*100).toFixed(2)}</small></td></tr></tbody></table>`;
  const k = calc(baseCtx(car)), pd = car.base.portalDone || {};
  h += `<div class="cdx-sec">媒体ごと</div><table class="cdx-t"><thead><tr><th></th><th>掲載</th><th>管理番号</th><th class="v">支払総額</th><th>価格を合わせた日</th><th class="v">掲載から</th><th class="v">問い合わせ（掲載から）</th></tr></thead><tbody>
    <tr><td style="color:var(--text3)">自社（見積）</td><td>${esc(carStatus(car)[1])}</td><td>${esc(car.num)}</td><td class="v"><b>${yen(k.cash)}</b></td><td>${car.base.changed?jd(car.base.changed).slice(5)+' に変更':'—'}</td><td></td><td></td></tr>
    <tr><td><span class="cdx-chip">グー</span></td><td><span class="cdx-st on">掲載中</span><small>${jd(rx.gooFirst).slice(5)}〜</small></td><td>${rx.kmGoo?'✓':'<b style="color:var(--red)">空</b>'}</td><td class="v">${yen(k.cash)}</td><td>${pd.goo?jd(pd.goo).slice(5):'<b style="color:var(--red)">まだ</b>'}</td><td class="v">${daysBetween(rx.gooFirst, TODAY)+1}日</td><td class="v">${sumI(rx.goo,3)}件</td></tr>
    <tr><td><span class="cdx-chip cs">CS</span></td><td><span class="cdx-st on">掲載中</span><small>${jd(rx.csFirst).slice(5)}〜</small></td><td>${rx.kmCs?'✓':'<b style="color:var(--red)">空</b>'}</td><td class="v">${yen(k.cash)}</td><td>${pd.cs?jd(pd.cs).slice(5):'<b style="color:var(--red)">まだ</b>'}</td><td class="v">${daysBetween(rx.csFirst, TODAY)+1}日</td><td class="v">${sumI(rx.cs,2)}件</td></tr></tbody></table>
    <div class="cdx-foot"><b>点数の出し方</b>（前の「戦闘力＝ビュー数÷在庫日数」が当てにならなかった所をつぶした）<br>
    ① 累計で割らず、直近${RX_WIN}日だけ ② 生の回数ではなく、同じ日に展示中で載っている自社の車の真ん中と比べた倍率を点にする（真ん中＝50・2倍で約80・半分で約20）。グーとカーセンサーは別々に比べてから合わせる＝数え方の違い・媒体の都合の上下が消える
    ③ 載せたての勢いを引く（載せて間もない車は見られやすいのが普通） ④ 見られ力と決め手力に分ける ⑤ 数字が少ない車は真ん中に寄せる（決め手は見た回数1,500回ぶん店の平均を混ぜる・載せて7日未満は点ごと寄せる＝たまたまの1件で跳ねない）<br>
    総合＝見られ力45％＋決め手力55％。A+ 90〜／A 80〜／B+ 70〜／B 55〜／C 40〜／D。⚠ 本番に入れる前に、実データ（売れた車も入るグーの日ごと）で「点数が高い車ほど早く問い合わせ・売約になったか」を答え合わせして重みを決め直す</div>`;
  return h;
}
function rxTrend(car){
  const rx = rxOf(car), pts = [];
  for (let d = TODAY, i = 0; i < 16 && d >= dPlus(rx.gooFirst, 6); i++, d = dPlus(d, -7)){ const s = rxScore(car, d); if (s) pts.unshift([d, s]); }
  if (pts.length < 2) return '<div class="q-why" style="padding:14px">まだ点数の推移が出せるほど日がたっていません</div>';
  const W = 1040, H = 150, L = 34, R = 20, T = 12, B = 22, x = i => L + (W-L-R)*i/(pts.length-1), y = v => T + (H-T-B)*(1-v/100);
  let g = '';
  [0, 50, 100].forEach(v=>{ g += `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" opacity="${v===50?.25:.1}" ${v===50?'stroke-dasharray="4 4"':''}/><text x="${L-6}" y="${y(v)+3}" font-size="10" text-anchor="end" fill="currentColor" opacity=".55">${v}</text>`; });
  const cuts = cdxPeriods(car).filter(p=>p.prev).map(p=>p.from);
  cuts.forEach(c=>{ const i = pts.findIndex(p=>p[0]>=c); if (i>0){ const xx = x(i-1)+(x(i)-x(i-1))*daysBetween(pts[i-1][0], c)/7; g += `<line x1="${xx}" x2="${xx}" y1="${T}" y2="${H-B}" stroke="#0ea5e9" stroke-dasharray="3 3" opacity=".7"/>`; } });
  const line = (k, col, w) => `<polyline points="${pts.map((p,i)=>x(i)+','+y(p[1][k])).join(' ')}" fill="none" stroke="${col}" stroke-width="${w}"/>`;
  g += line('see', '#f0a43a', 1.6) + line('win', '#a855f7', 1.6) + line('total', 'var(--text)', 2.6);
  pts.forEach((p,i)=>{ g += `<circle cx="${x(i)}" cy="${y(p[1].total)}" r="3" fill="var(--text)"><title>${jd(p[0]).slice(5)}：総合 ${p[1].total}P（見られ力 ${p[1].see}・決め手力 ${p[1].win}）</title></circle>`; if (i%2===0 || i===pts.length-1) g += `<text x="${x(i)}" y="${H-6}" font-size="10" text-anchor="middle" fill="currentColor" opacity=".55">${jd(p[0]).slice(5)}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}" style="color:var(--text)">${g}</svg><div class="cdx-leg"><span><b>━</b> 総合</span><span><b style="color:#f0a43a">━</b> 見られ力</span><span><b style="color:#a855f7">━</b> 決め手力</span><span>点線＝店の真ん中（50）</span></div>`;
}

/* ---------- ダッシュボード（簡易・4.61.0）
   🗣 2026-10-17「ダッシュボードも超適当でいいからカードがあって詳細を開けるようにしてほしい」
   本番のダッシュボード（工程ごとの列にカード）の形だけ。カードを押すと車両詳細カード（価格履歴が先） ---------- */
function renderDash(){
  const cols = [['purchase','仕入れ'],['regen','展示準備中'],['exhibit','展示中'],['delivery','売約済み（納車準備）']];
  const card = c => { const k = c.base ? calc(baseCtx(c)) : null, d = daysBetween(c.buyDate, TODAY), sc = rxScore(c);
    return `<div class="dsh-card" onclick="openDetail('${c.id}','${sc?'rx':'price'}')" title="押すと車両詳細カード">
      <div class="dsh-ph">${carSvg(c)}</div>
      <div class="dsh-b"><div class="dsh-n">${esc(c.num)}</div><div class="dsh-m">${esc(c.maker)} ${esc(c.model)}</div>
      <div class="dsh-s">${d}日・${k?man(k.cash)+'万':'価格なし'}</div>
      ${sc?`<div class="dsh-rx">${scoreBadge(sc)}<span>見られ ${gradeOf(sc.see)}</span><span>決め手 ${gradeOf(sc.win)}</span></div>`:''}</div></div>`; };
  let h = `<div class="dsh"><div class="dsh-top"><b>ダッシュボード</b><span class="q-why" style="margin:0">（モックは簡易版。車のカードを押すと車両詳細カードが開きます。点数＝車としての強さ（反響の見本の数字から））</span></div><div class="dsh-cols">`;
  cols.forEach(([ph, lb])=>{ const list = S.cars.filter(c=>phaseOf(c)===ph);
    h += `<div class="dsh-col"><div class="dsh-ch">${lb}<span>${list.length}</span></div>${list.map(card).join('') || '<div class="q-why" style="padding:8px">なし</div>'}</div>`; });
  $('q-root').innerHTML = h + `</div></div>`;
}
/* モックだけ：URL の #detail=k0442&tab=price で開いた状態から始める（確認用） */
/* モックの「#detail=… で開く」は v4.0.0 で外した（車両詳細は CarFlow 本体の物） */
/* 見積の側で値付けを変えたら、開いている詳細カードも描き直す */
const _cdxRender0 = render;
render = function(){ const r = _cdxRender0.apply(this, arguments); if (CDX.id){ const o = document.getElementById('cdx-ov'); if (o && !o.hidden) cdxDraw(); } return r; };

function openCut(cid){ const car = carOf(cid), b = car.base;
  ov(`<div class="hd">${I('down','↓',16)} 本体価格を調整する　<span style="font-weight:600;font-size:13px;color:var(--text2)">${esc(car.num)} ${esc(car.maker)} ${esc(car.model)}</span><button class="x" onclick="closeOv()">✕</button></div><div class="bd">
    <div class="q-f cut-top"><div class="cut-l"><label class="k">いまの車両本体（税抜）</label><div id="cut-now">${cutFlow(car, b.price, b.price-50000)}</div></div>
    <div><label class="k" id="cut-vl">新しい車両本体（税抜）</label>${money('cut-v', b.price-50000, `cutPreview('${cid}')`)}<div id="cut-sub"></div>
      <label class="k" style="display:block;margin-top:8px">理由</label><select id="cut-why" class="q-in" onchange="cutMode('${cid}')">${CUT_WHY.map(w=>`<option>${w}</option>`).join('')}</select>
      <input id="cut-other" class="q-in" style="display:none;margin-top:6px" placeholder="理由を入れる（例：商談の結果・相場の下落）"><div id="cut-sale"></div></div></div>
    <div class="cut-act"><div id="cut-sum" class="sum">${cutSub(car, b.price, b.price-50000)}</div><button class="q-btn" onclick="closeOv()">やめる</button><button class="q-btn pri" onclick="doCut('${cid}')">この金額にする</button></div>
    <div class="q-sec">値付けの履歴</div><div id="cut-hist">${priceHistHtml(car)}</div>
    ${gapBlock(car)}
    </div>`); $('q-ov').firstElementChild.classList.add('wide'); S.ui.cutSale = { on:false, from:TODAY, days:7 }; cutSaleUI(); }
function doCut(cid){ const car = carOf(cid), v = cutBody(cid), sel = $('cut-why').value, other = $('cut-other').value.trim(); if (!v) return;
  if (sel==='その他' && !other){ toast('その他の理由を入れてください'); $('cut-other').focus(); return; }
  const why = sel==='その他' ? 'その他：'+other : sel;
  const sl = S.ui.cutSale;
  if (sl && sl.on){ const to = sl.to || dPlus(sl.from, sl.days-1);
    if (to < sl.from){ toast('終了日が開始日より前になっています'); return; }
    if (car.base.sale){ toast('もうセールが入っています。先に今のセールをやめてください'); return; }
    snap(); car.base.sale = { from:sl.from, to, price:v, prev:car.base.price, why:'セール：'+why, on:false }; saleTick(); closeOv(); save(); render();
    toast(`${jd(sl.from)}〜${jd(to)} のセール：本体 ${yen(v)}。${jd(dPlus(to,1))} に自動で元の価格へ戻ります`, true); return; }
  snap(); const from = car.base.price; car.base.price = v; car.base.hist.push({ date:TODAY, from, to:v, why, soba: sobaOf(car) ? sobaOf(car).now : null }); car.base.changed = TODAY; closeOv(); save(); render(); toast(`${yen(from)} → ${yen(v)} に${v<from?'値下げ':'変更'}（${why}）。プラン見積とカードの表示にそろえました`, true); }
function openClose(cid, uid, p){ const car = carOf(cid), u = custOf(car,uid); p = p || S.ui.plan; const d = { car, ctx:custCtx(car,u,p), who:u, kind:'cust' }, k = calc(d.ctx); _docNew = !!u.baseSnap.newCar;
  ov(`<div class="hd">${I('check','✍',16)} 売約にする　<span style="font-weight:600;font-size:13px;color:var(--text2)">${esc(u.name||'（お名前未入力）')} 様・${esc(p_lab(p))}</span><button class="x" onclick="closeOv()">✕</button></div><div class="bd cl-bd">
    <div class="cl-prev" onclick="this.parentNode.classList.toggle('max')" title="押すと最大化／もう一度押すと戻る"><span class="cl-max">⤢ 押すと最大化</span><div class="cl-sc">${quotePapers(d,k)}</div></div>
    <div class="cl-side">
      <div class="q-total" style="padding:0 0 10px"><span>ご注文金額（税込）</span><b>${yen(k.net)} 円</b></div>
      ${payMiss(u).length ? `<div class="q-note warn" style="margin-bottom:10px">${I('warn','⚠',14)} 下取・お支払いでまだ選んでいない所：<b>${payMiss(u, p).join('・')}</b>。このまま売約にもできます（納車の準備までに埋める）</div>` : ''}
      ${k.loan?`<div class="q-why" style="margin:-4px 0 10px">ローン：頭金 ${yen(k.loan.down)}・${k.loan.n}回・月々 ${yen(k.loan.later)}</div>`:''}
      <div class="q-f" style="grid-template-columns:1fr"><div><label class="k">注文日</label><input id="cl-date" type="date" class="q-in" value="${TODAY}"></div><div><label class="k">納車予定日</label><input id="cl-del" type="date" class="q-in" value="${addDays(TODAY,21)}"></div>
      <div><label class="k">お約束事項（納車までに行うこと）</label><textarea id="cl-prom" class="q-in" rows="4" placeholder="例：ドラレコ取付／右リアバンパーのキズ補修"></textarea></div></div>
      <div class="q-note info" style="margin-top:12px">左の見積書の内容で売約の札が付きます。同じ車のほかのお客様の見積は「他で売約」になり止まります。<b>カンバンの売約・納車準備・大タスクは動きません</b>（見積の上の札だけ。車を売約に進める時は カンバンで）。</div></div></div>
    <div class="ft"><button class="q-btn" onclick="closeOv()">やめる</button><button class="q-btn ok" onclick="doClose('${cid}','${uid}','${p}')">売約にする</button></div>`);
  $('q-ov').firstElementChild.classList.add('wide');
}
function doClose(cid, uid, p){ const car = carOf(cid); snap(); S.ui.plan = p || S.ui.plan; car.order = { no:estNo(car, S.ui.plan, custOf(car,uid)), cust:uid, plan:S.ui.plan, ver:1, date:$('cl-date').value||TODAY, delivery:$('cl-del').value, promise:$('cl-prom').value, startBefore:'shinai' }; closeOv(); S.ui.step = 'order'; car.reached = 3; editCommit(); save(); render(); toast(`${custOf(car,uid).name} 様で売約（見積の上の札）。中身を固定しました`, true); }

let setTab = 'packs';
function tplBo(i, j, f, v){ const x = S.set.packs.items[i]; if (!x.bo) x.bo = [[x.bn||x.n, x.a||0]]; if (!x.bo[j]) x.bo[j] = ['新しい機種', 0]; x.bo[j][f] = v; x.a = x.bo[0][1]; save(); render(); if (f===0 && v==='新しい機種') openSettings(); }
function tplMove(i, d){ const L = S.set.packs.items, j = i + d; if (j<0 || j>=L.length) return; [L[i], L[j]] = [L[j], L[i]]; save(); render(); openSettings(); }
function tplVt(i, v){ const x = S.set.packs.items[i]; if (v==='labor'){ x.vt = 'pick'; x.labor = 1; x.vl = '取付工賃'; x.bo = x.bo || [[x.bn || x.n, x.a||0]]; x.vo = x.vo && x.vo.length ? x.vo : [['標準取付',0]]; save(); render(); openSettings(); return; } delete x.labor;
  if (v==='none'){ delete x.vt; delete x.vo; delete x.vl; }
  else { const vt0 = x.vt; x.vt = v; if (v==='size'){ x.vl = 'ボディサイズ'; x.vo = SIZE_CLS.map((s,k)=>[s, (x.vo && x.vo[k] ? x.vo[k][1] : 0)]); } else { x.vl = x.vl && x.vl!=='ボディサイズ' ? x.vl : '工賃'; x.vo = x.vo && vt0==='pick' ? x.vo : [['標準',0]]; } }
  save(); render(); openSettings(); }
function openSettings(t){ if (t) setTab = t; const s = S.set;
  const tabs = [['packs','プランの中身'],['seibi','納車点検・パック・保証'],['fees','諸費用・代行費用'],['tables','税・保険・手数料'],['company','帳票・会社']];
  let b = '';
  if (setTab==='packs'){
    b = `<div class="q-why">全車のプラン見積のもとです。A/B/C を押すとそのプランに入ります。ここを直すと、この車だけ変えていない全車のプラン見積がそろいます（個別見積は変わりません）。業販（D）にはオプションは入りません。</div>
      <div class="q-f three" style="margin:8px 0">${['A','B','C'].map(p=>`<div><label class="k">${p} の名前</label><input id="st-pn-${p}" class="q-in" value="${esc(s.packs.names[p])}" onchange="S.set.packs.names.${p}=this.value;save();render();openSettings()"></div>`).join('')}</div>
      ${s.packs.items.map((x,i)=>`<div class="q-tpl"><div class="q-it op">
        <span class="mv"><button onclick="tplMove(${i},-1)" ${i===0?'disabled':''}>▲</button><button onclick="tplMove(${i},1)" ${i===s.packs.items.length-1?'disabled':''}>▼</button></span>
        ${sfLinked(x) ? `<span class="q-tpln">${esc(x.n)}</span>` : `<input id="st-pi-${i}" class="q-in" value="${esc(x.n)}" onchange="S.set.packs.items[${i}].n=this.value;save();render();openSettings()">`}
        <span class="am">${sfLinked(x) ? '<span class="q-sflink">StockFlow連動</span>' : x.labor?'<small class="k" style="white-space:nowrap">本体は下の機種で</small>':money('st-pa-'+i, x.a, `S.set.packs.items[${i}].a=parseYen(this.value);save();render()`)}</span>
        <span class="q-pcs">${['A','B','C'].map(p=>`<button class="q-pc ${x.in[p]?'on':''} ${p}" onclick="S.set.packs.items[${i}].in.${p}=S.set.packs.items[${i}].in.${p}?0:1;save();render();openSettings()">${p}</button>`).join('')}</span>
        ${sfLinked(x) ? '<span></span>' : `<button class="q-del" onclick="S.set.packs.items.splice(${i},1);save();render();openSettings()">✕</button>`}</div>
        ${sfLinked(x) ? '' : `<div class="q-tplv"><label class="k">種類</label>${seg(x.labor?'labor':(x.vt||'none'),[['none','金額1つ'],['size','ボディサイズで変わる'],['pick','選んで変わる'],['labor','本体＋取付工賃']],`tplVt(${i},'$v')`)}
          ${x.labor && sfBo(x) ? `<div class="q-tplo"><span class="k">機種（本体）</span><span class="q-why" style="margin:0">StockFlow の料金表の「${esc(x.sfCat)}」から読む（値段は店頭、無ければ定価・税抜。直す時は StockFlow で）：${sfBo(x).map(o=>esc(o[0])+' '+yen(o[1])).join('／')}</span></div>${x.voImp?`<div class="q-tplo"><span class="k">輸入車の工賃</span><span class="q-why" style="margin:0">${x.voImp.map(o=>esc(o[0])+' '+yen(o[1])).join('／')}</span></div>`:''}` : x.labor?`<div class="q-tplo"><span class="k">機種（本体）</span>${(x.bo||[[x.bn||x.n, x.a||0]]).map((o,j)=>`<span class="op1"><input class="q-in" style="width:230px" value="${esc(o[0])}" placeholder="見積書に出す本体の名前" onchange="tplBo(${i},${j},0,this.value)">${money(`st-bo-${i}-${j}`, o[1], `tplBo(${i},${j},1,parseYen(this.value))`)}${(x.bo||[]).length>1?`<button class="q-del" onclick="S.set.packs.items[${i}].bo.splice(${j},1);save();render();openSettings()">✕</button>`:''}</span>`).join('')}<button class="q-btn sm" onclick="tplBo(${i},${(x.bo||[]).length||1},0,'新しい機種')">＋ 機種</button><span class="q-why" style="margin:0;width:100%">プラン見積で機種を選ぶ。見積書では「機種の名前 本体」と「└ 取付工賃」の2行</span></div>`:''}
          ${x.sfCoat && sfSize(x, false) ? `<div class="q-tplo"><span class="k">${SIZE_CLS.join('・')}</span><span class="q-why" style="margin:0">StockFlow の料金表の「${esc(x.sfCoat.v)}」から読む（定価・税抜。直す時は StockFlow で）：${sfSize(x, false).map(o=>esc(o[0])+' '+(o[1]!=null?yen(o[1]):'料金表になし')).join('／')}</span></div>${x.sfCoat.imp && sfSize(x, true) ? `<div class="q-tplo"><span class="k">輸入車</span><span class="q-why" style="margin:0">「${esc(x.sfCoat.imp)}」：${sfSize(x, true).map(o=>esc(o[0])+' '+(o[1]!=null?yen(o[1]):'料金表になし')).join('／')}</span></div>` : ''}` : x.vt?`<div class="q-tplo">${x.vt==='pick'?`<input class="q-in" style="width:110px" value="${esc(x.vl||'')}" placeholder="選ぶ物の名前" onchange="S.set.packs.items[${i}].vl=this.value;save();openSettings()">`:`<span class="k">${SIZE_CLS.join('・')}</span>`}
            ${x.vo.map((o,j)=>`<span class="op1">${x.vt==='pick'?`<input class="q-in" style="width:130px" value="${esc(o[0])}" onchange="S.set.packs.items[${i}].vo[${j}][0]=this.value;save();openSettings()">`:`<b>${esc(o[0])}</b>`}${money(`st-pv-${i}-${j}`, o[1], `S.set.packs.items[${i}].vo[${j}][1]=parseYen(this.value);save();render()`)}${x.labor?`<label class="k" style="white-space:nowrap"><input type="checkbox" ${o[2]?'checked':''} onchange="S.set.packs.items[${i}].vo[${j}][2]=this.checked?1:0;save();render()"> 本体なし</label>`:''}${x.vt==='pick'&&x.vo.length>1?`<button class="q-del" onclick="S.set.packs.items[${i}].vo.splice(${j},1);save();render();openSettings()">✕</button>`:''}</span>`).join('')}
            ${x.vt==='pick'?`<button class="q-btn sm" onclick="S.set.packs.items[${i}].vo.push(['新しい種類',0]);save();openSettings()">＋ 種類</button>`:''}
            <span class="q-why" style="margin:0">金額＝上の金額（本体など）＋ここで選んだ金額</span></div>`:''}</div>`}</div>`).join('')}
      <button class="q-btn sm" style="margin-top:8px" onclick="S.set.packs.items.push({id:'i'+Date.now().toString(36),n:'新しい品',a:0,in:{A:0,B:1,C:1}});save();render();openSettings()">＋ 品を足す</button>
      <div style="margin-top:10px"><label class="k" style="font-size:11px;color:var(--text3)">おすすめのプラン（標準）</label><div>${seg(s.packs.rec,[['A','A'],['B','B'],['C','C']],"S.set.packs.rec='$v';save();render();openSettings()")}</div></div>
      <div style="margin-top:14px;font-weight:800">よく足す品（個別見積の「＋」ボタン）</div>
      ${s.quick.map((q,i)=>`<div class="q-it" style="grid-template-columns:minmax(0,1fr) 124px 26px"><input id="st-qn-${i}" class="q-in" value="${esc(q[0])}" onchange="S.set.quick[${i}][0]=this.value;save();openSettings()">${money('st-qa-'+i, q[1], `S.set.quick[${i}][1]=parseYen(this.value);save()`)}<button class="q-del" onclick="S.set.quick.splice(${i},1);save();openSettings()">✕</button></div>`).join('')}
      <button class="q-btn sm" style="margin-top:6px" onclick="S.set.quick.push(['新しい品',0]);save();openSettings()">＋ 足す</button>`;
  } else if (setTab==='fees'){
    const F = s.fees, row = (k2,l,cls) => `<div class="q-row"><label>${l} ${cls}</label>${money('st-f-'+k2, F[k2], `S.set.fees.${k2}=parseYen(this.value);save();render()`)}</div>`;
    b = `<div style="font-weight:800;margin-bottom:4px"><span class="q-kb s">★</span> 支払総額に入る費用（全車共通）</div>
      ${row('daikoReg','検査登録手続代行費用（国産車）','<span class="q-cls k">課税</span>')}${row('daikoRegImp','検査登録手続代行費用（輸入車）','<span class="q-cls k">課税</span>')}${row('daikoGarage','車庫証明手続代行費用','<span class="q-cls k">課税</span>')}
      ${row('garage','車庫証明手数料（千葉県警）','<span class="q-cls t">立替</span>')}${row('plate','ナンバープレート代（ペイント中型）','<span class="q-cls t">立替</span>')}${row('plateKei','ナンバープレート代（軽・ペイント）','<span class="q-cls t">立替</span>')}
      <div class="q-why" style="margin-top:10px">車ごとの直し・項目の追加は、基本価格の「販売諸費用」で。</div>
      <div style="font-weight:800;margin:12px 0 4px"><span class="q-kb c">◎</span> お客様の条件で足す費用</div>
      ${row('wish','希望ナンバー申込代行費用','<span class="q-cls k">課税</span>')}${row('out','管轄外登録費用','<span class="q-cls k">課税</span>')}${row('deliver','ご指定場所への納車費用','<span class="q-cls k">課税</span>')}
      <div style="font-weight:800;margin:12px 0 4px">希望ナンバーのナンバー代（立替・2枚・千葉県）</div>
      ${[['wishP','希望番号（ペイント）'],['wishJ','希望番号（字光式）'],['zug','図柄入り'],['kWishP','軽 希望番号（ペイント）'],['kWishJ','軽 希望番号（字光式）'],['kZug','軽 図柄入り']].map(([k2,l])=>`<div class="q-row"><label>${l} <span class="q-cls t">立替</span></label>${money('st-pl-'+k2, (s.plates||{})[k2], `S.set.plates.${k2}=parseYen(this.value);save();render()`)}</div>`).join('')}
      <div class="q-why" style="margin-top:4px">2025年4月7日の改定（関東運輸局）の金額。変わったらここを直す。図柄入りのフルカラー寄付金は入っていない。</div>
      <div style="font-weight:800;margin:12px 0 4px">ローンの標準</div>
      <div class="q-f"><div><label class="k">実質年率（%）</label><input id="st-lr" class="q-in num" inputmode="decimal" value="${s.loan.rate}" onchange="S.set.loan.rate=numIn(this.value)||0;save()"></div><div><label class="k">回数</label><input id="st-lc" class="q-in num" value="${s.loan.count}" onchange="S.set.loan.count=Math.round(numIn(this.value))||60;save()"></div></div>`;
  } else if (setTab==='seibi'){
    const tierCard = (x,i)=>`<div class="q-card" style="margin:8px 0"><div class="bd"><div class="q-f three">
        <div><label class="k">${i===0?'基本（車両価格に含む）':'パック'}・名前</label><input id="st-tn-${i}" class="q-in" value="${esc(x.name)}" onchange="S.set.seibi.tiers[${i}].name=this.value;save();render();openSettings()"></div>
        <div><label class="k">${i===0?'既定の金額（税抜・車ごとに変えられる）':'パックの金額（税抜・＋）'}</label>${i===0 ? money('st-tp-'+i, x.price, `S.set.seibi.tiers[${i}].price=parseYen(this.value);save();render()`) : money('st-ta-'+i, x.add, `S.set.seibi.tiers[${i}].add=parseYen(this.value);save();render()`)}</div>
        <div><label class="k">保証</label><input id="st-tw-${i}" class="q-in" value="${esc(x.war||'')}" onchange="S.set.seibi.tiers[${i}].war=this.value;save();render()"></div>
        <div><label class="k">決まり具合</label><div>${seg(x.tbd?'tbd':'ok',[['ok','確定'],['tbd','仮（未確定）']],`S.set.seibi.tiers[${i}].tbd=('$v'==='tbd');save();render();openSettings()`)}</div></div>
        <div style="grid-column:2/-1"><label class="k">内容（見積書・注文書に文章で出す）</label><textarea id="st-tt-${i}" class="q-in" onchange="S.set.seibi.tiers[${i}].note=this.value;save();render()">${esc(x.note)}</textarea></div></div></div></div>`;
    b = `<div class="q-why">基本（裸の見積）は${esc(s.seibi.tiers[0].name)}を車両価格に含めます（既定の金額・車ごとに変えられる）。${PACK_HOLD ? '' : 'その上はメンテナンスパックとして ☆ オプションの行で売ります。保証はプランのパックで決まります。'}公取協：整備は車両価格に含め「定期点検整備付」と表示。</div>
      ${tierCard(s.seibi.tiers[0], 0)}
      <div style="font-weight:800;margin:12px 0 4px">メンテナンスパック${PACK_HOLD ? '（いまは使いません・暫定）' : ''}</div>
      ${packHold(`${s.seibi.tiers.slice(1).map((x,j)=>tierCard(x, j+1)).join('')}
      <div style="font-weight:800;margin:12px 0 4px">プランごとの標準</div>
      ${['A','B','C'].map(p=>`<div class="q-tierrow"><span>${pb(p)}</span><span>${tierSeg(s.packs.tier[p], `S.set.packs.tier.${p}='$v';save();render();openSettings()`, PACK_HOLD)}</span></div>`).join('')}
      <div class="q-why" style="margin-top:6px">プランごとの段階は、車ごと（プラン見積）・お客様ごと（個別見積）にも変えられます。</div>`)}`;
  } else if (setTab==='tables'){
    const jt = (t, key) => [12,13,24,25,36,37].map(m=>`<td class="v">${yen(t[key][m])}</td>`).join('');
    b = `<div style="font-weight:800;margin:0 0 4px">月の切り替え日</div><div class="q-prow" style="align-items:center;gap:6px;margin-bottom:4px">毎月 <input id="st-regcut" class="q-in num" style="width:64px" inputmode="numeric" value="${regCut()}" onchange="S.set.regCut=Math.min(28,Math.max(1,Math.round(numIn(this.value))||23));save();render();openSettings()"> 日</div>
      <div class="q-why" style="margin-bottom:12px">登録予定月が「自動」の車は、この日の前日までは<b>今月登録</b>、この日からは<b>来月登録</b>で、自動車税の月割・未経過相当額などを出します（いま＝${autoRegMonth().replace('-','年')}月登録）。この日に見積の支払総額が一斉に変わり、価格履歴に「自動」の行で残ります。1〜28日</div>`
      + `<div class="q-why">表ごとに「始まる日」を持つ（改定の時は新しい表を足す）。見積では、自賠責＝保険の始まる日、自動車税＝登録日、重量税・手数料＝車検・登録の日で表を選ぶ。（2026/9/30 に公的資料で確認）</div>
      <div style="font-weight:800;margin:10px 0 4px">自賠責（本土）</div><div style="overflow:auto"><table class="q-tbl"><tr><th>始まる日</th><th>区分</th>${[12,13,24,25,36,37].map(m=>`<th class="v">${m}か月</th>`).join('')}</tr>
      ${JIBAI.map(t=>`<tr><td>${jd(t.from)}〜</td><td>普通車</td>${jt(t,'car')}</tr><tr><td></td><td>軽</td>${jt(t,'kei')}</tr>`).join('')}</table></div>
      <div style="font-weight:800;margin:10px 0 4px">自動車税（普通・自家用・年額・千葉県 令和8年度）</div><div style="overflow:auto"><table class="q-tbl"><tr><th>排気量</th><th class="v">2019/10以後</th><th class="v">以前</th><th class="v">以前の重課</th></tr>${TAX_CAR.map(r=>`<tr><td>${r[0]>=99999?'6L超':(r[0]/1000)+'L以下'}</td><td class="v">${yen(r[1])}</td><td class="v">${yen(r[2])}</td><td class="v">${yen(f100(r[2]*1.15))}</td></tr>`).join('')}</table></div>
      <div style="font-weight:800;margin:10px 0 4px">重量税（自家用乗用・2年・0.5t ごと／軽は定額）</div><table class="q-tbl"><tr><th></th><th class="v">本則</th><th class="v">当分の間</th><th class="v">13年</th><th class="v">18年</th></tr><tr><td>普通（0.5t）</td>${['eco','std','y13','y18'].map(k2=>`<td class="v">${yen(WEIGHT_2Y[k2])}</td>`).join('')}</tr><tr><td>軽</td>${['eco','std','y13','y18'].map(k2=>`<td class="v">${yen(WEIGHT_KEI_2Y[k2])}</td>`).join('')}</tr></table>
      <div style="font-weight:800;margin:10px 0 4px">検査・登録の手数料（立替・登録の種類ごと）</div>
      <table class="q-tbl"><tr><th>登録の種類</th><th class="v">5ナンバー</th><th class="v">3ナンバー</th><th class="v">軽自動車</th><th></th></tr>${REG_TYPES.map(r=>`<tr><td>${r.l}</td><td class="v">${money('st-rs-'+r.k, s.reg.sm[r.k], `S.set.reg.sm.${r.k}=parseYen(this.value);save();render()`)}</td><td class="v">${money('st-rc-'+r.k, s.reg.car[r.k], `S.set.reg.car.${r.k}=parseYen(this.value);save();render()`)}</td><td class="v">${money('st-rk-'+r.k, s.reg.kei[r.k], `S.set.reg.kei.${r.k}=parseYen(this.value);save();render()`)}</td><td class="q-why">${r.k==='yobi'?'<b>仮（未確認）</b>':'2026/4 改定で確認（軽は仮）'}</td></tr>`).join('')}</table>
      <div class="q-why" style="margin-top:8px">うちは認証工場＝陸運局へ<b>持込検査</b>の額（指定工場なら中古新規 3,300）。中古新規＝登録 1,300＋新規検査 5ナンバー 2,800／3ナンバー 2,900。継続移転・移転継続＝継続検査 2,500／2,600＋移転 700。移転だけ 700（2026/4/1 改定・国交省の一覧表）。予備検・軽は<b>未確認の仮の値</b>。環境性能割は 2026/3/31 廃止。</div>`;
  } else {
    const c = s.company, f = (k2,l,full) => `<div${full?' style="grid-column:1/-1"':''}><label class="k">${l}</label><input id="st-c-${k2}" class="q-in" value="${esc(c[k2])}" onchange="S.set.company.${k2}=this.value;save()"></div>`;
    b = `<div class="q-f">${f('name','会社名')}${f('inv','インボイス登録番号')}${f('zip','〒')}${f('addr','住所')}${f('tel','TEL')}${f('line','LINE（友だち追加の URL・帳票に QR で出す）')}${f('kobutsu','古物商許可番号')}${f('bank','振込先',1)}${f('area','支払総額の条件（登録地・納車）',1)}
      <div><label class="k">見積の有効日数</label><input id="st-c-valid" class="q-in num" value="${c.valid}" onchange="S.set.company.valid=Math.round(numIn(this.value))||30;save()"></div>
      <div><label class="k">担当者</label><div class="q-why" style="margin:6px 0 0">CarFlow のメンバー画面で「セールス」にチェックの人（${s.staff.length ? s.staff.map(esc).join('・') : 'いまは誰もいません'}）</div></div></div>`;
  }
  const head = `${QData.canSet()?'<div class="q-why" style="margin:0 0 8px">ここで直した値は会社全体の見積に効きます（会社の全員・全部の PC）。</div>':'<div class="q-note warn" style="margin:0 0 8px">見るだけです。設定を直せるのは 管理者・マネージャー（直しても保存されません）。</div>'}<div class="q-wtabs">${tabs.map(([id,l])=>`<button class="${setTab===id?'on':''}" onclick="openSettings('${id}')">${l}</button>`).join('')}</div>`;
  /* v4.4.0 CarFlow の設定 ▸ 見積 の中（app＝set）は画面として出す。前の「見積の設定」の窓は、見積の画面の右上から外した */
  if (S.ui.app==='set'){ const r = $('q-root'), keep = r.scrollTop; r.innerHTML = `<div class="q-wrap q-setpage">${head}<div class="q-setcard">${b}</div></div>`;   /* v4.5.10 中身はほかの設定と同じカードに */ r.scrollTop = keep; if (typeof icHydrate==='function') icHydrate(r); return; }
  ov(`<div class="hd">${I('settings','⚙',16)} 見積の設定<button class="x" onclick="closeOv()">✕</button></div><div class="bd">${head}${b}</div><div class="ft"><button class="q-btn pri" onclick="closeOv()">閉じる</button></div>`);
}

/* =====================================================================
   9. 操作
   ===================================================================== */
let hist = [], toastT = null;
function snap(){ hist.push(JSON.stringify(S)); if (hist.length>60) hist.shift(); }
function toast(msg, undo){ $('q-toast-msg').textContent = msg; $('q-toast-undo').hidden = !undo; $('q-toast').hidden = false; $('q-toast-undo').onclick = ()=>{ if (hist.length){ S = JSON.parse(hist.pop()); save(); render(); if (!$('q-docov').hidden) renderDocs(); } $('q-toast').hidden = true; }; clearTimeout(toastT); toastT = setTimeout(()=>{$('q-toast').hidden=true;}, 7000); }
/* 左右の列：高さ＝見えている所いっぱい。下へ回す時は、上の帯が残っている間はページの方を先に回す */
function splitSetup(){
  const r = $('q-root'), gap = 14; r.style.setProperty('--colgap', gap + 'px'); r.style.setProperty('--colh', (r.clientHeight - gap*2) + 'px');
  ['q-colL','q-colR'].forEach(id=>{ const c = $(id); if (!c) return;
    c.onwheel = e => { const max = r.scrollHeight - r.clientHeight; if (e.deltaY > 0 && r.scrollTop < max - 1){ e.preventDefault(); r.scrollTop = Math.min(max, r.scrollTop + e.deltaY); } }; });
}
window.addEventListener('resize', ()=>{ if ($('q-colL')) splitSetup(); });
/* =====================================================================
   相場ビュー（セールス ▸ 相場ビュー）
   🗣 2026-10-12「相場ビューだけ実際に動き出して CarFlow に実装されている。そこをもう一度現実に沿う形で作り直して」
   ＝本物の CarFlow（carflow\soba\・v3.8.0〜v3.11.1）をそのまま組み込む。build.py が SOBA_DOC（soba/index.html に css・js を入れた物）・
     SOBA_SRC（view.js・stock.js・embed.js）・SOBA_V（受け渡しの写し）を入れる。違うのはデータの読み口（soba-data.js の get）だけ
   本物と同じ所：左のメニュー「セールス ▸ 相場ビュー」で iframe／カード詳細の［相場］タブ＝同じ画面を車の条件で（embed.js・stock.js）
   ===================================================================== */
const svNorm = s => String(s||'').normalize('NFKC').toLowerCase().replace(/[\s・･]/g,'');   // 原価管理の検索でも使う
/* 親の窓口（本物の js/car-soba.js と同じ形）：iframe の embed.js が CarSoba.car(id) で車の情報を取る。金額は税込の円
   本物の CarFlow の車には型式が無い（車種・グレード・年式・走行・色だけ）＝モックでも同じ物だけ渡す */
window.CarSoba = { car(id){ const c = carOf(id); if (!c) return null; const k = c.base ? calc(baseCtx(c)) : null;
  return { id:c.id, num:c.num, maker:c.maker, model:c.model, grade:c.grade + (c.gradeSub ? ' '+c.gradeSub : ''), year:(c.firstReg||'').slice(0,4),
    km:c.km||0, color:c.color||'', bodyIncl: k ? k.bodyIn : Math.round((c.cfPrice||0)*1.1), totalIncl: k ? k.cash : 0 }; } };
/* 左のメニューの相場ビュー：本物と同じく、いちど開いたら iframe を残す（描き直さない） */
/* 左のメニューの相場ビューは CarFlow 本体の物（panel-soba）。ここからは開かない */
function renderSoba(){ }
/* 見積から：この車の相場（本物のカード詳細の［相場］タブと同じ画面） */
function openCarSoba(cid){ const car = carOf(cid);
  ov(`<div class="hd">${I('signal','📶',16)} この車の相場　<span style="font-weight:600;font-size:13px;color:var(--text2)">${esc(car.num)} ${esc(car.maker)} ${esc(car.model)} ${esc(car.grade)}</span><button class="x" onclick="closeOv()">✕</button></div><div class="bd soba-emb"><iframe id="soba-emb-f" title="この車の相場"></iframe></div>`);
  $('q-ov').firstElementChild.classList.add('wide', 'soba-win');
  /* 本物の相場ビュー（../soba/）をこの車の条件で。soba/embed.js は「親」＝この画面の CarSoba.car(id)・firebase を見る（quote-data.js が置く） */
  $('soba-emb-f').src = '../soba/index.html?v='+encodeURIComponent(QData.ver())+'&car='+encodeURIComponent(cid);
  $('q-ov').dataset.soba = cid; }

/* =====================================================================
   原価管理（セールス ▸ 原価管理）
   🗣 2026-10-04「新規ビューで原価管理画面も作成して」→「いま使ってる原価表、参考にして」
   元＝社内の「車販原価記入シート」（\\alrit\ALRIT共有\05車販\01過去販売車両データ\…\KM0481_…ノア.xlsx）の並び：
     頭（販売形態・KMナンバー・在庫期間・担当・初回／リピーター・販売価格）／基本整備内容（部品 × 銘柄の単価 × 数量・チェックで入れる）／
     外注費（税別）／登録費用・税金・保険料（非課税）／車両本体・仕入れ（オークション・下取り・買取・新車）→ 原価合計・粗利・粗利率
   考え方も原価表と同じ：販売価格＝お客様から受け取る額から消費税を引いたもの（立替・リサイクルも入る）、原価にも立替・リサイクルを入れる
   つながり：CarFlow のバックオフィスの「原価処理」（tasks-def.js bo_cost）。ここで確定すると完了になる想定。金額はすべて税抜
   car.cogs＝{ form 販売形態, src 仕入区分, rep 初回/リピーター, parts:[{k,on,br,unit,qty}], out:[{id,n,a,on,st}], done 確定日 }
   ===================================================================== */
/* 部品の単価表（原価表の Sheet1 と同じ・税抜）。銘柄を選ぶと単価が入る。「その他」は手で入れる */
const CG_BR = {
  oil:    [['EX',460],['プロステージ',672],['プロステージHV',739],['4CT',1075]],
  filter: [['KE002',557],['0101',600],['3005',540],['0014',600],['NS004',663],['NS006',663]],
  gasket: [['日産',70],['トヨタ・ダイハツ',53],['ホンダ',40],['スズキ',50],['スバル',56]],
  fluid:  [['DOT3',263],['DOT4',263]],
  lock:   [['日産・三菱',280],['スズキ・マツダ',180]],
  flare:  [['国産車',630],['輸入車',660]],
  drec:   [['73d',18750]] };
/* 基本整備内容の並び（原価表と同じ順）。on＝最初からチェック、qty＝最初の数量、br＝単価表の種類、texa＝ガス量(g)×3円＋75円 */
const CG_PARTS = [
  { k:'oil', n:'エンジンオイル', br:'oil', qty:4.2, on:1, u:'L' }, { k:'filter', n:'オイルフィルター', br:'filter', on:1 }, { k:'gasket', n:'オイルドレンガスケット', br:'gasket', on:1 },
  { k:'air', n:'エアーフィルター', on:1 }, { k:'acf', n:'ACフィルター', on:1 }, { k:'bat', n:'バッテリー', on:1 },
  { k:'fluid', n:'ブレーキフルード', br:'fluid' }, { k:'wfr', n:'Fワイパーゴム（右）', on:1 }, { k:'wfl', n:'Fワイパーゴム（左）', on:1 }, { k:'wr', n:'Rワイパーゴム', on:1 },
  { k:'plug', n:'スパークプラグ' }, { k:'texa', n:'TEXA（エアコンガス）', texa:1, qty:150, on:1, u:'g' }, { k:'lock', n:'Rロックナット', br:'lock', qty:2 },
  { k:'cool', n:'クーラントブースター', unit:1190 }, { k:'flare', n:'発煙筒', br:'flare' }, { k:'touch', n:'タッチペン' }, { k:'cat', n:'エアキャタライザ', unit:5940 },
  { k:'drec', n:'ドラレコ', br:'drec' }, { k:'navi', n:'カーナビ' }, { k:'harn', n:'ナビハーネス' },
  { k:'etc', n:'ETC本体' }, { k:'etcs', n:'ETCセットアップ', unit:550 }, { k:'tire', n:'タイヤ' }, { k:'ozone', n:'オゾン' }, { k:'fpad', n:'Fパッド' } ];
const CG_OUT = ['清掃代','BP代','行政書士'];   // 外注費の最初の行（原価表と同じ。陸送は「車両本体・仕入れ」の陸送で持つ）
const CG_FORMS = ['店頭','オーダー','新車','その他'], CG_SRCS = ['オークション','下取り','買取','新車'];
const CG_AAFEE = [[10450,9500],[11550,10500],[14850,13500]];   // 落札手数料（税込→税抜。原価表の Sheet1）
/* =====================================================================
   StockFlow の料金表とつなぐ（🗣 2026-10-13「StockFlow で在庫をカウントしない自社の在庫の金額表を作ってあり、本番で動き出している。
     原価管理は1項目ずつ StockFlow 側に紐づけて、原価を引いてこれるようにしたい。リンクの作り方や実稼働のイメージをモックに。モック上で実働はしなくていい」）
   本物の置き場：companies/{cid}/stockPriceItems/{docId}（StockFlow の料金表＝在庫を数えない品。部品・油脂は typ:'part'）
     値段は「仕切」＝cost（税抜）。量り売りは buys[]（ドラム・ペール）から1単位あたりを自動で出す。値段を変えると hist[] に残る
     読み：会社のメンバーなら読める（firestore.rules）＝CarFlow から読める。CarFlow は書かない（値段を直すのはいつも StockFlow）
   つなぎ方：原価表の部品ごとに、StockFlow の品を「ドキュメントID」で何個でも持つ（＝銘柄の選択肢）。品番は直すと変わるので使わない
   原価管理：銘柄を選ぶ→その品のいまの仕切が単価に入る。原価を確定した日に値段を写して止める（あとで StockFlow の値段が変わっても動かない）
   ⚠ モックだけ：SF_PRICE＝StockFlow の price-seed.js（2026-10 の料金表 PDF から写した初期データ）から、整備で使う品だけを写した物。
     本番の値段とは違うことがある。P 番号はモックの仮。社内の仕入値＝このモックは社外に出さない
   ===================================================================== */
/* 🔐 v4.0.0 本物の料金表＝StockFlow の stockPriceItems（部品・油脂 typ:'part'）を quote-data.js が読む（QData.sf()）。読めるまでは空。
   モックに写していた仕入値（price-seed.js）は外した＝社内の仕入値をサイトのファイルに置かない。
   前のつなぎ（モックの品の ID sf_◯◯）は、品番・品名で本物の品に読み替える（SF_KEY＝[品番, 品名, メーカー, 種類]・値段は持たない） */
let SF_PRICE = [];
const SF_KEY = {"sf_ex":["E727","EX-CS 5W-40","WAKO'S","エンジンオイル"],"sf_ps30":["E227","PRO ステージS 0W-30","WAKO'S","エンジンオイル"],"sf_ps20":["","PRO ステージS 0W-20","WAKO'S","エンジンオイル"],"sf_4ct":["EB47","4CT 0W-40","WAKO'S","エンジンオイル"],"sf_of01":["V9111-0101","オイルフィルター","","オイルフィルター"],"sf_of14":["V9111-0014","オイルフィルター","","オイルフィルター"],"sf_of35":["V9111-3005","オイルフィルター","","オイルフィルター"],"sf_ofns4":["AY100-NS004","オイルフィルター","PIT WORK","オイルフィルター"],"sf_ofns6":["AY100-NS006","オイルフィルター","PIT WORK","オイルフィルター"],"sf_ofke":["AY100-KE00201","オイルフィルター","PIT WORK","オイルフィルター"],"sf_gkn":["11026-01M02","オイルドレンガスケット（日産）","","ガスケット"],"sf_gkt":["90430-12031","オイルドレンガスケット（トヨタ）","","ガスケット"],"sf_gkh":["94109-14000","オイルドレンガスケット（ホンダ）","","ガスケット"],"sf_gks":["09168-14015","オイルドレンガスケット（スズキ）","","ガスケット"],"sf_gkb":["803916010","オイルドレンガスケット（スバル）","","ガスケット"],"sf_pc102":["PC-102B","クリーンフィルター","","エアコンフィルター"],"sf_pc213":["PC-213B","クリーンフィルター（コウキノウ）","","エアコンフィルター"],"sf_b19":["AYBGL-40B19","バッテリー B19","PIT WORK","バッテリー"],"sf_b24":["AYBGL-55B24","バッテリー B24","PIT WORK","バッテリー"],"sf_dot4":["","ブレーキオイル DOT4","PITWORK","ブレーキオイル"],"sf_mw43":["MW43GN","ワイパー（MW）","","ワイパー"],"sf_dw45":["DW45GKN","ワイパー（DW）","","ワイパー"],"sf_mb38":["MB38GN","ワイパー（MB）","","ワイパー"],"sf_tw30":["TW30GK 6mm 幅","ワイパー（TW）","","ワイパー"],"sf_vk20":["VK20","スパークプラグ","","スパークプラグ"],"sf_134a":["","A/C ガス R-134a","","A/C ガス（TEXA）"],"sf_1234":["","A/C ガス R-1234yf","","A/C ガス（TEXA）"],"sf_acoil":["527-2700","A/C オイル POE+Adv","デイトン","A/C オイル（TEXA）"],"sf_lockn":["AY920-NS002","ハブロックナット（日産系）","PIT WORK","ハブロックナット"],"sf_locks":["","ハブロックナット（スズキ系）","","ハブロックナット"],"sf_cb":["R140","クーラントブースター","WAKO'S","添加剤"],"sf_cat":["C152","エアキャタライザーキット","WAKO'S","添加剤"],"sf_flj":["SR-LH06","LED ハイフレア（国産）","","発煙筒"],"sf_fli":["KS-100E3","LED ハイフレア（輸入車）","","発煙筒"],"sf_etc":["","ETC 情報発行料（セットアップ）","","ETC"],"sf_llcg":["","LLC（冷却水クーラント）緑","PITWORK","LLC"]};
const sfN = s => String(s||'').normalize('NFKC').toUpperCase().replace(/[\s\-‐－−]/g,'');
/* 最初のつなぎ（原価表の Sheet1 の銘柄 → StockFlow の品）。設定で足し引きできる＝S.set.cgLink[部品]。TEXA はガス（g）＋ A/C オイル（1回）の2つ */
const CG_LINK0 = { oil:['sf_ex','sf_ps30','sf_ps20','sf_4ct'], filter:['sf_ofke','sf_of01','sf_of35','sf_of14','sf_ofns4','sf_ofns6'], gasket:['sf_gkn','sf_gkt','sf_gkh','sf_gks','sf_gkb'],
  acf:['sf_pc102','sf_pc213'], bat:['sf_b19','sf_b24'], fluid:['sf_dot4'], wfr:['sf_mw43','sf_dw45','sf_mb38'], wfl:['sf_mw43','sf_dw45','sf_mb38'], wr:['sf_tw30','sf_mw43'],
  plug:['sf_vk20'], texa:['sf_134a','sf_1234'], lock:['sf_lockn','sf_locks'], cool:['sf_cb'], flare:['sf_flj','sf_fli'], cat:['sf_cat'], etcs:['sf_etc'] };
const CG_TEXA_OIL = 'sf_acoil';
function sfItem(id){ if (window.QData && QData.sf().length !== SF_PRICE.length) SF_PRICE = QData.sf();
  let b = SF_PRICE.find(x=>x.id===id);
  if (!b && SF_KEY[id]){ const [code, name] = SF_KEY[id]; b = (code && SF_PRICE.find(x=>sfN(x.code)===sfN(code))) || SF_PRICE.find(x=>sfN(x.name)===sfN(name)); }
  return b || null; }
const sfLabel = it => [it.maker && !it.name.includes(it.maker) ? it.maker : '', it.name, it.code].filter(Boolean).join(' ');
const cgLinks = k => { const L = S.set.cgLink && S.set.cgLink[k]; return (L || CG_LINK0[k] || []).filter(id=>sfItem(id)); };
const sfOpen = id => { const it = sfItem(id); toast(`StockFlow の料金表の「${it ? it.no+' '+sfLabel(it) : id}」。値段は StockFlow で直します（見積からは読むだけ）`); };
function cgOf(car){ const g = car.cogs = car.cogs || {};
  if (!g.parts){ g.parts = CG_PARTS.map(p=>({ k:p.k, on:p.on?1:0, br:p.br ? CG_BR[p.br][0][0] : '', unit:p.unit || (p.br ? CG_BR[p.br][0][1] : 0), qty:p.qty || 1 }));
    g.out = CG_OUT.map((n,i)=>({ id:'o'+i, n, a:0, on:0, st:'est' }));
    (g.rows||[]).forEach((r,i)=>{ const n = (r.cat?r.cat+'：':'')+(r.n||''), hit = g.out.find(o=>!o.a && n.startsWith(o.n));
      if (hit) Object.assign(hit, { n, a:+r.a||0, on:1, st:r.st||'fix' }); else g.out.push({ id:'m'+i, n, a:+r.a||0, on:1, st:r.st||'fix' }); }); delete g.rows; }
  g.parts.forEach(p=>{ if (p.sf !== undefined) return; if (window.QData && !QData.demo && !QData.sf().length) return;   /* 料金表を読めるまで品を決めない（読む前に決めると空のまま残る） */
    const L = cgLinks(p.k), d = CG_PARTS.find(x=>x.k===p.k) || {};
    if (!L.length) { p.sf = ''; return; }
    const same = L.find(id=>sfItem(id).cost===+p.unit); p.sf = same || (d.br || d.unit || d.texa ? L[0] : ''); });
  if (!g.form) g.form = '店頭'; if (!g.src) g.src = 'オークション'; return g; }
const cgUnit = p => p.fix ? p.fix.cost : (p.sf && !p.man && sfItem(p.sf)) ? sfItem(p.sf).cost : (+p.unit||0);
const cgTexaOil = p => p.fix ? (p.fix.oil||0) : (sfItem(CG_TEXA_OIL) ? sfItem(CG_TEXA_OIL).cost : 75);
const cgPartAmt = (p, d) => d.texa ? (p.qty ? Math.round(p.qty*(p.sf||p.man||p.fix ? cgUnit(p) : 3)) + cgTexaOil(p) : 0) : Math.round(cgUnit(p) * (+p.qty||0));   // 4.2L × 単価 などは行ごとに円で丸める
/* 1台の数字（原価表の計算と同じ形） */
function cgCalc(car){
  const g = cgOf(car), b = car.base;
  if (!b) return { veh:0, parts:0, out:0, reg:0, cost:0, sale:null, gross:null, sold:!!car.order };
  const sold = !!car.order, u = sold ? custOf(car, car.order.cust) : null, k = sold ? calc(custCtx(car, u, car.order.plan)) : calc(baseCtx(car)), c = b.cost;
  const veh = (c.buy||0) + (c.aa||0) + (c.move||0) + b.recycle + (c.tax||0);
  const parts = g.parts.reduce((s,p,i)=>s+(p.on ? cgPartAmt(p, CG_PARTS.find(d=>d.k===p.k)||{}) : 0),0);
  const partMiss = g.parts.filter(p=>p.on && !cgPartAmt(p, CG_PARTS.find(d=>d.k===p.k)||{})).length;   // チェックしたのに単価が 0＝まだ入れていない
  const out = g.out.reduce((s,o)=>s+(o.on ? (+o.a||0) : 0),0), outEst = g.out.filter(o=>o.on && o.st!=='fix').reduce((s,o)=>s+(+o.a||0),0);
  const regRows = k.legal.filter(r=>r[1]).concat([[`自動車税${k.bc.months?'（'+k.bc.months+'か月）':''}`, k.bc.carTax], ['自動車重量税', k.bc.weight], ['自賠責保険', k.bc.jibai]].filter(r=>r[1]));
  const reg = regRows.reduce((s,r)=>s+r[1],0) + k.condT;
  const sale = k.cash - k.ctax, cost = veh + parts + out + reg;
  return { k, sold, veh, parts, partMiss, out, outEst, reg, regRows, cost, sale, ctax:k.ctax, gross:sale - cost, rate: sale ? (sale-cost)/sale : null }; }
function cgState(car){ const g = cgOf(car); return g.done ? ['fix','確定'] : car.order ? ['wait','処理待ち'] : ['none','在庫']; }
function cgGo(id){ S.ui.cgCar = id || null; save(); render(); $('q-root').scrollTop = 0; }
function cgEdit(fn, hard){ const car = carOf(S.ui.cgCar); if (hard) snap(); fn(cgOf(car), car); if (hard){ save(); render(); } else renderKeep(); }
function cgSet(k, v){ cgEdit(g=>{ g[k] = v; }, 1); }
function cgPart(i, k, v, hard){ cgEdit(g=>{ const p = g.parts[i], d = CG_PARTS.find(x=>x.k===p.k)||{}; p[k] = v;
  if (k==='br' && d.br){ const hit = CG_BR[d.br].find(x=>x[0]===v); if (hit) p.unit = hit[1]; }
  if (k==='sf'){ if (v==='__man'){ const it = sfItem(p.sf); p.sf = p.sf || ''; p.man = 1; if (it) p.unit = it.cost; } else { p.sf = v; p.man = 0; if (v && !p.on) p.on = 1; } }
  if (k==='qty' || k==='unit') { if (!p.on && +v) p.on = 1; } }, hard); }
function cgOut(i, k, v, hard){ cgEdit(g=>{ g.out[i][k] = v; if (k==='a' && +v && !g.out[i].on) g.out[i].on = 1; }, hard); }
function cgAddOut(){ cgEdit(g=>g.out.push({ id:'x'+Date.now(), n:'', a:0, on:1, st:'est' }), 1); setTimeout(()=>{ const e = document.querySelector('.cg-out tr.add-last .q-in'); if (e) e.focus(); }, 30); }
function cgDelOut(i){ cgEdit(g=>{ g.out.splice(i,1); }, 1); toast('行を消しました', true); }
function cgVeh(k, v){ const car = carOf(S.ui.cgCar); car.base.cost[k] = v; renderKeep(); }
function cgDone(on){ const car = carOf(S.ui.cgCar), R = cgCalc(car);
  if (on){ const go = () => { cgEdit(g=>{ g.done = TODAY; g.out.forEach(o=>{ if (o.on) o.st = 'fix'; });
      g.parts.forEach(p=>{ if (!p.on) return; const it = p.sf && !p.man ? sfItem(p.sf) : null; p.fix = { cost: cgUnit(p), at: TODAY, src: it ? it.id : '', sfAt: it ? it.at : '', oil: cgTexaOil(p) }; }); }, 1); toast('原価を確定しました（本物では CarFlow のバックオフィス「原価処理」が完了に）', true); };
    if ((R.outEst || R.partMiss) && window.UI && UI.confirm) UI.confirm('このまま原価を確定しますか？', { detail:[R.partMiss?`単価がまだの部品が ${R.partMiss}件あります（0円で数えます）。`:'', R.outEst?`外注費に見込みの行（${yen(R.outEst)}）があります。確定に変わります。`:''].join(''), ok:'確定する', cancel:'やめる' }).then(ok=>{ if (ok) go(); });
    else go(); }
  else { cgEdit(g=>{ g.done = ''; g.parts.forEach(p=>{ delete p.fix; }); }, 1); toast('確定を取り消しました（単価は StockFlow のいまの値段に戻る）', true); } }

function renderCost(){ const r = $('q-root'), car = S.ui.cgCar && carOf(S.ui.cgCar);
  if (!QData.canEdit()){ r.innerHTML = `<div class="q-wrap"><div class="q-note warn" style="margin-top:20px">${I('lock','🔒',15)} 原価管理は 管理者・マネージャー・スタッフだけが見られます。</div></div>`; return; } r.innerHTML = S.ui.cgView==='link' ? cgLinkPage() : car && car.base ? cgDetail(car) : cgList(); }
/* ---------- 部品と StockFlow のつなぎ（設定）＝v4.4.0 から CarFlow の設定 ▸ 原価 の中（app＝cgset）。原価管理の画面の右上のボタンは外した ---------- */
function cgLinkView(on){ S.ui.cgView = on === false ? '' : 'link'; save(); render(); $('q-root').scrollTop = 0; }
function cgLinkSet(k, ids){ S.set.cgLink = S.set.cgLink || {}; S.set.cgLink[k] = ids; save(); }
function cgLinkToggle(k, id, on){ const L = cgLinks(k).slice(), i = L.indexOf(id); if (on && i<0) L.push(id); if (!on && i>=0) L.splice(i,1); cgLinkSet(k, L); render(); }
function cgLinkMove(k, id, d){ const L = cgLinks(k).slice(), i = L.indexOf(id), j = i + d; if (i<0 || j<0 || j>=L.length) return; [L[i], L[j]] = [L[j], L[i]]; cgLinkSet(k, L); render(); }
/* 品を選ぶ窓：StockFlow の料金表を探して、チェックした品がこの部品の銘柄の選択肢になる */
function cgPick(k){ const d = CG_PARTS.find(x=>x.k===k) || { n:k }; S.ui.sfPk = k; S.ui.sfQ = ''; S.ui.sfKind = '';
  ov(`<div class="hd">${I('link','🔗',16)} StockFlow の品をつなぐ　<span style="font-weight:600;font-size:13px;color:var(--text2)">原価表の「${esc(d.n)}」</span><button class="x" onclick="closeOv()">✕</button></div>
    <div class="bd"><div class="q-why" style="margin-bottom:8px">StockFlow の料金表（在庫を数えない品）から選ぶ。チェックした品が、原価管理の「銘柄」の選択肢になる（何個でも）。値段は StockFlow の「仕切」（税抜）</div>
      <div class="sf-pk-bar"><input id="sf-q" class="q-in" placeholder="品名・品番・メーカーで探す" oninput="S.ui.sfQ=this.value;sfPickRows()"><span id="sf-kinds"></span></div>
      <div class="sf-pk-list"><table class="cg-tb"><thead><tr><th style="width:26px"></th><th>番号</th><th>種類</th><th>品</th><th>仕入れ先</th><th>単位</th><th class="v">仕切（税抜）</th><th>更新</th></tr></thead><tbody id="sf-rows"></tbody></table></div>
      <div class="q-why" style="margin-top:8px">StockFlow の料金表の部品・油脂（${SF_PRICE.length}品）から探せます。値段は StockFlow で直します</div></div>
    <div class="ft"><span class="sp"></span><button class="q-btn pri" onclick="closeOv()">閉じる</button></div>`);
  $('q-ov').firstElementChild.classList.add('wide'); sfPickRows(); setTimeout(()=>{ const e = $('sf-q'); if (e) e.focus(); }, 30); }
function sfPickRows(){ const k = S.ui.sfPk, L = cgLinks(k), q = svNorm(S.ui.sfQ||''), kd = S.ui.sfKind||'';
  const kinds = [...new Set(SF_PRICE.map(x=>x.kind))];
  $('sf-kinds').innerHTML = seg(kd, [['','すべて']].concat(kinds.map(x=>[x,x])), "S.ui.sfKind='$v';sfPickRows()");
  const rows = SF_PRICE.map(x=>sfItem(x.id)).filter(x=>(!kd || x.kind===kd) && (!q || svNorm(x.no+x.kind+x.maker+x.name+x.code+x.sup).includes(q)));
  rows.sort((a,b)=>(L.includes(b.id)?1:0)-(L.includes(a.id)?1:0));
  $('sf-rows').innerHTML = rows.map(x=>`<tr class="${L.includes(x.id)?'on':''}"><td><input type="checkbox" ${L.includes(x.id)?'checked':''} onchange="cgLinkToggle('${k}','${x.id}',this.checked);sfPickRows()"></td>
    <td><a class="sf-no" onclick="sfOpen('${x.id}')">${x.no}</a></td><td class="cg-nt">${esc(x.kind)}</td><td><b>${esc(sfLabel(x))}</b>${x.buy?`<small class="cg-nt" style="display:block">${esc(x.buy)}</small>`:''}</td>
    <td class="cg-nt">${esc(x.sup)}</td><td>${esc(x.unit)}</td><td class="v"><b>${yen(x.cost)}</b></td><td class="cg-nt">${jd(x.at)}</td></tr>`).join('') || '<tr><td colspan="8" class="q-placeholder">当てはまる品がありません</td></tr>'; }
/* 値段が変わった車（確定前で、StockFlow のいまの仕切が前に見た値と違う）＝v4.0 では出さない（前の値を持っていないため。確定した車は確定した日の値で止まる） */
const cgChanged = car => false;
function cgLinkPage(){
  const row = d => { const L = cgLinks(d.k);
    return `<tr><td class="nm"><b>${esc(d.n)}</b>${d.u?`<small class="cg-nt">数量は ${d.u}</small>`:''}</td>
      <td>${L.length ? L.map((id,j)=>{ const x = sfItem(id); if (!x) return `<span class="cg-chip">${QData.sf().length ? '（StockFlow に見つからない品）' : 'StockFlow を読み込み中…'}</span>`; return `<span class="cg-chip ${j===0?'first':''}"><a class="sf-no" onclick="sfOpen('${id}')">${x.no}</a>${esc(sfLabel(x))}<b>${yen(x.cost)}</b><small>/${esc(x.unit)}</small>${x.was!=null?`<i class="up">${x.cost>x.was?'↑':'↓'}</i>`:''}
          <span class="ops">${j?`<button title="前へ（選択肢の並び）" onclick="cgLinkMove('${d.k}','${id}',-1)">‹</button>`:''}<button title="つなぎを外す" onclick="cgLinkToggle('${d.k}','${id}',false)">✕</button></span></span>`; }).join('') : '<span class="cg-nolink">つなぎ無し＝毎回手で入れる</span>'}
        ${d.k==='texa' && sfItem(CG_TEXA_OIL)?`<div class="cg-nt" style="margin-top:3px">＋ A/C オイル（${sfItem(CG_TEXA_OIL).no} ${yen(sfItem(CG_TEXA_OIL).cost)}/回）を1回分たす＝原価表の「ガス量×3円＋75円」と同じ形</div>`:''}</td>
      <td style="width:96px"><button class="q-btn sm" onclick="cgPick('${d.k}')">${I('plus','＋',12)} 品を選ぶ</button></td></tr>`; };
  /* v4.5.10 設定 ▸ 原価（cgset）では上の見出しを出さない（CarFlow の設定の見出し・説明と同じ中身＝二重になる） */
  return `<div class="q-wrap"><div class="q-top"${S.ui.app==='cgset' ? ' hidden' : ''}>${S.ui.app==='cgset' ? '' : `<button class="q-btn sm" onclick="cgLinkView(false)">${I('left','←',13)} 原価管理</button>`}<div style="${S.ui.app==='cgset' ? '' : 'margin-left:10px'}"><div class="t">${I('link','🔗',18)} 部品と StockFlow のつなぎ</div>
      <div class="s">原価表の部品ごとに、StockFlow の料金表の品をつなぐ。つないだ品が原価管理の「銘柄」の選択肢になり、単価は StockFlow の仕切（税抜）を読む。先頭の品（太枠）が最初に選ばれる</div></div></div>${window.QData && !QData.demo && !QData.sf().length ? `<div class="q-note info" style="margin-bottom:10px">${I('info','ℹ',14)} StockFlow の料金表を読み込み中…（読み終わると、つないだ品が出ます）</div>` : ''}
    <div class="cg-lk-grid"><div class="q-card"><h3>原価表の部品 → StockFlow の品 <span class="r">${CG_PARTS.filter(d=>cgLinks(d.k).length).length} / ${CG_PARTS.length} 部品をつないだ</span></h3><div class="bd">
      <table class="cg-tb cg-lk"><thead><tr><th style="width:150px">部品（原価表）</th><th>つないだ StockFlow の品（＝銘柄の選択肢）</th><th></th></tr></thead><tbody>${CG_PARTS.map(row).join('')}</tbody></table>
      <div class="q-why" style="margin-top:6px">ドラレコ・カーナビ・タイヤ・ETC本体などは車ごとに物が違う＝つながずに毎回手で入れる（StockFlow の在庫を数える商品の側にある物は、後で在庫の商品にもつなげる）</div></div></div>
    <div class="cg-lk-side">
      <div class="q-card"><h3>実際の動き <span class="r">本番のイメージ</span></h3><div class="bd"><ol class="cg-flow">
        <li><b>StockFlow で値段を直す</b><span>仕入値が変わった時・WAKO'S の改定など。料金表に履歴が残る。日付を決めた切り替えの予約もできる</span></li>
        <li><b>見積が読む</b><span>原価管理を開くと、つないだ品のいまの仕切を読む（読むだけ。見積からは値段を直さない）</span></li>
        <li><b>確定前の車は新しい値段に</b><span>行に「↑ 前の値段 → いまの値段（理由）」が出る。一覧にも「値段が変わった車」</span></li>
        <li><b>原価を確定＝その日の値段で止める</b><span>確定した日の値段を車に写す。あとで StockFlow の値段が変わっても、その車の粗利は動かない</span></li>
        <li><b>分析DB へ</b><span>確定した原価は毎晩の書き出しに入る（部品ごとの原価の推移も見られる）</span></li></ol></div></div>
      <div class="q-card"><h3>つなぎ方の決まり</h3><div class="bd"><ul class="cg-rules">
        <li>品番ではなく StockFlow の<b>品の ID</b>でつなぐ。品番を直しても、つながったまま</li>
        <li>1つの部品に品を<b>何個でも</b>（＝銘柄の選択肢）。どれを使ったかは車ごとに選ぶ</li>
        <li>単位は StockFlow の<b>売る単位</b>（L・本・g・回）。オイルの L 単価はドラムの値段 ÷ 量で StockFlow が出す</li>
        <li>値段の正は<b>いつも StockFlow</b>。見積に写すのは原価を確定した時だけ</li>
        <li>StockFlow で品を消したら、その行に「つなぎが切れた」と出して手入力に戻す</li>
        <li>その車だけ違う値段の時は「その他（手で入れる）」</li></ul></div></div>
    </div></div></div>`; }
const cgCol = v => v==null ? 'var(--text3)' : v>=100000 ? 'var(--green)' : v>=0 ? 'var(--orange)' : 'var(--red)';
const cgPct = v => v==null ? '—' : (v*100).toFixed(1)+'%';

function cgList(){
  const u = S.ui, f = u.cgF || 'all', q = svNorm(u.cgQ || '');
  const rows = S.cars.map(c=>({ c, R:cgCalc(c), st:cgState(c), days:daysBetween(c.buyDate, TODAY) }));
  const inStock = rows.filter(x=>!x.c.order && x.c.base), sold = rows.filter(x=>x.c.order), wait = sold.filter(x=>!cgOf(x.c).done);
  const month = TODAY.slice(0,7), soldM = sold.filter(x=>(x.c.order.date||'').slice(0,7)===month);
  const cnt = { all:rows.length, stock:rows.filter(x=>!x.c.order).length, sold:sold.length, wait:wait.length };
  let list = f==='stock' ? rows.filter(x=>!x.c.order) : f==='sold' ? sold : f==='wait' ? wait : rows;
  if (q) list = list.filter(x=>svNorm(x.c.num+x.c.maker+x.c.model+x.c.grade).includes(q));
  list = list.slice().sort((a,b)=>b.c.num.localeCompare(a.c.num));
  const sumG = a => a.reduce((s,x)=>s+(x.R.gross||0),0);
  return `<div class="q-wrap"><div class="q-top"><div><div class="t">${I('calculator','🧮',18)} 原価管理</div><div class="s">原価表（車販原価記入シート）と同じ並び。売約した車は原価を確定する（＝バックオフィスの「原価処理」）。金額はすべて税抜。部品の単価は StockFlow の料金表から</div></div>
</div>
    ${(()=>{ const hit = S.cars.filter(c=>c.base && cgChanged(c)); return hit.length ? `<div class="q-note warn" style="margin-bottom:10px">${I('refresh','⟳',14)} StockFlow で値段が変わった部品を使っている車が <b>${hit.length}台</b>（原価の確定前＝新しい値段で計算し直しています）：${hit.map(c=>esc(c.num)).join('・')}</div>` : ''; })()}
    <div class="cg-tiles">
      <div class="cg-tile"><div class="l">在庫の原価（売約前 ${inStock.length}台）</div><div class="v">${yen(inStock.reduce((s,x)=>s+x.R.veh+x.R.parts+x.R.out,0))}</div><div class="s">車両本体・仕入れ＋整備・部品＋外注（立替は入れない）</div></div>
      <div class="cg-tile"><div class="l">見込みの粗利（在庫・掲載の支払総額で）</div><div class="v" style="color:${cgCol(sumG(inStock)/Math.max(1,inStock.length))}">${yen(sumG(inStock))}</div><div class="s">1台あたり ${yen(inStock.length?sumG(inStock)/inStock.length:0)}</div></div>
      <div class="cg-tile"><div class="l">今月の売約の粗利（${soldM.length}台）</div><div class="v">${yen(sumG(soldM))}</div><div class="s">販売価格（税抜） ${yen(soldM.reduce((s,x)=>s+(x.R.sale||0),0))}</div></div>
      <div class="cg-tile ${wait.length?'warn':''}"><div class="l">原価処理待ち</div><div class="v">${wait.length}<small> 台</small></div><div class="s">売約したが、まだ原価を確定していない車</div></div>
    </div>
    <div class="q-tools"><input id="cg-q" class="q-in" style="max-width:280px" placeholder="管理番号・車名で探す" value="${esc(u.cgQ||'')}" oninput="if(event.isComposing)return;S.ui.cgQ=this.value;renderKeep()" oncompositionend="S.ui.cgQ=this.value;renderKeep()">
      ${seg(f,[['all',`すべて ${cnt.all}`],['stock',`在庫 ${cnt.stock}`],['sold',`売約 ${cnt.sold}`],['wait',`原価処理待ち ${cnt.wait}`]],"S.ui.cgF='$v';save();render()")}</div>
    <div class="q-list cg-list"><table><thead><tr><th></th><th>車</th><th>状態</th><th class="v">在庫</th><th class="v">車両本体・仕入れ</th><th class="v">整備・部品</th><th class="v">外注費</th><th class="v">登録・税・保険</th><th class="v">原価合計</th><th class="v">販売価格</th><th class="v">粗利</th><th class="v">粗利率</th><th>原価処理</th></tr></thead><tbody>
    ${list.map(({c,R,st,days})=>{ const [cs,cl] = carStatus(c), nb = !c.base; return `<tr class="row" onclick="${nb?`toast('基本価格（車両原価）がまだの車です。見積で基本価格を作ると出ます')`:`cgGo('${c.id}')`}">
      <td><div class="ph">${carSvg(c)}</div></td>
      <td class="nm"><div class="nmw"><span class="kmno">${esc(c.num)}</span><div class="nmb"><b>${esc(c.maker)} ${esc(c.model)}</b><small>${esc(c.grade)}</small></div></div></td>
      <td><span class="q-pill ${cs}">${esc(cl)}</span></td><td class="v">${days}日</td>
      ${nb ? '<td class="v" colspan="8"><span class="q-empty">基本価格なし</span></td>' : `<td class="v">${yen(R.veh)}</td><td class="v">${yen(R.parts)}</td><td class="v">${yen(R.out)}${R.outEst?'<small class="cg-est">見込み含む</small>':''}</td><td class="v">${yen(R.reg)}</td>
      <td class="v"><b>${yen(R.cost)}</b></td><td class="v">${yen(R.sale)}<small class="cg-sub">${R.sold?'注文':'掲載の総額'}</small></td>
      <td class="v"><b style="color:${cgCol(R.gross)}">${yen(R.gross)}</b>${R.sold?'':'<small class="cg-sub">見込み</small>'}</td><td class="v">${cgPct(R.rate)}</td>`}
      <td>${st[0]==='fix'?`<span class="q-pill good">確定 ${jd(cgOf(c).done).slice(5)}</span>`:st[0]==='wait'?'<span class="q-pill warn">処理待ち</span>':'<span class="q-pill none">売約前</span>'}</td></tr>`; }).join('')}
    ${list.length?'':'<tr><td colspan="13" class="q-placeholder">当てはまる車がありません</td></tr>'}</tbody></table></div></div>`; }

function cgDetail(car){
  const g = cgOf(car), R = cgCalc(car), b = car.base, c = b.cost, dis = !!g.done, [cs, cl] = carStatus(car), days = daysBetween(car.buyDate, TODAY);
  const u = R.sold ? custOf(car, car.order.cust) : null;
  const sec = (title, sum, body, r) => `<div class="q-card cg-sec"><h3>${title}<span class="r">${r||''}</span><b class="cg-ss">${sum}</b></h3><div class="bd">${body}</div></div>`;
  /* ① 基本整備内容（部品） */
  const parts = `<div class="cg-sfbar">${I('link','🔗',13)}<span>単価は <b>StockFlow の料金表</b>（仕切・税抜）から読む。銘柄を選ぶと、その品のいまの値段が入る${g.done?'。<b>確定した日の値段で止めてある</b>':''}</span><span class="sp"></span><button class="q-btn sm" onclick="cgLinkView()">${I('settings','⚙',12)} つなぎの設定</button></div>
    <table class="cg-tb cg-parts"><thead><tr><th style="width:26px"></th><th>部品</th><th style="width:270px">銘柄（StockFlow の品）</th><th class="v" style="width:150px">単価</th><th class="v" style="width:84px">数量</th><th class="v" style="width:96px">原価</th></tr></thead><tbody>
    ${g.parts.map((p,i)=>{ const d = CG_PARTS.find(x=>x.k===p.k) || { n:p.k }, L = cgLinks(p.k), it = p.sf ? sfItem(p.sf) : null, amt = cgPartAmt(p, d);
      const brand = L.length ? `<select class="q-in" onchange="cgPart(${i},'sf',this.value,1)" ${dis?'disabled':''}>${!p.sf && !p.man ? '<option value="" selected>— 選ぶ —</option>' : ''}${L.map(id=>{ const x = sfItem(id); return `<option value="${id}" ${id===p.sf && !p.man?'selected':''}>${esc(sfLabel(x))}　${yen(x.cost)}/${esc(x.unit)}</option>`; }).join('')}<option value="__man" ${p.man?'selected':''}>その他（手で入れる）</option></select>`
        : d.br ? `<select class="q-in" onchange="cgPart(${i},'br',this.value,1)" ${dis?'disabled':''}>${CG_BR[d.br].map(x=>`<option ${x[0]===p.br?'selected':''}>${x[0]}</option>`).join('')}<option ${p.br==='その他'?'selected':''}>その他</option></select><small class="cg-nolink sm">StockFlow につなぎ無し</small>`
        : `<span class="cg-nolink">つなぎ無し（手で入れる）</span>${dis?'':`<button class="q-lnk" onclick="cgPick('${p.k}')">つなぐ</button>`}`;
      const per = d.texa ? '/g' : it ? '/'+esc(it.unit) : '';
      const unit = p.fix ? `<b>${yen(p.fix.cost)}</b><small>${per}</small><small class="cg-sfc">${p.fix.src ? '確定時の StockFlow '+esc(sfItem(p.fix.src)?sfItem(p.fix.src).no:'') : '確定時（手入力）'}</small>${p.fix.src && sfItem(p.fix.src) && sfItem(p.fix.src).cost!==p.fix.cost ? `<small class="cg-now">いまの StockFlow ${yen(sfItem(p.fix.src).cost)}</small>` : ''}`
        : it && !p.man ? `<b>${yen(it.cost)}</b><small>${per}</small><small class="cg-sfc"><a class="sf-no" onclick="sfOpen('${it.id}')">${it.no}</a>・${jd(it.at).slice(2)} 更新</small>${it.was!=null?`<small class="cg-up">${it.cost>it.was?'↑':'↓'} ${yen(it.was)} → ${yen(it.cost)}（${esc(it.why)}）</small>`:''}`
        : d.texa && !p.man && !p.sf ? '<span class="cg-nt">3円/g</span>' : L.length && !p.man && !p.sf ? '<span class="cg-pick">← 銘柄を選ぶ</span>' : money('cg-pu-'+i, p.unit, `cgPart(${i},'unit',parseYen(this.value))`, dis) + (p.man ? '<small class="cg-sfc">手入力</small>' : '');
      return `<tr class="${p.on?'':'off'}"><td><input type="checkbox" ${p.on?'checked':''} onchange="cgPart(${i},'on',this.checked?1:0,1)" ${dis?'disabled':''}></td><td>${esc(d.n)}${d.texa?'<small class="cg-nt" style="display:block">ガス量 × 単価 ＋ A/C オイル 1回</small>':''}</td>
        <td>${brand}</td><td class="v cg-unit ${p.on && !amt ? 'cg-miss' : ''}">${unit}</td>
        <td class="v"><span class="cg-qty"><input id="cg-pq-${i}" class="q-in num" inputmode="decimal" data-raw value="${p.qty}" oninput="cgPart(${i},'qty',numIn(this.value)||0)" ${dis?'disabled':''}>${d.u?`<small>${d.u}</small>`:''}</span></td>
        <td class="v">${p.on && amt ? yen(amt) : '<span class="q-empty">—</span>'}</td></tr>`; }).join('')}</tbody></table>
    <div class="q-why" style="margin-top:6px">${R.partMiss?`<b style="color:#f59e0b">単価がまだの部品 ${R.partMiss}件</b>（黄色の枠＝銘柄を選ぶか、手で入れる）。`:''}チェックした行だけ数える。銘柄の選択肢は「つなぎの設定」で StockFlow の品を足し引きする</div>`;
  /* ② 外注費 */
  const out = `<table class="cg-tb cg-out"><thead><tr><th style="width:26px"></th><th>内容</th><th class="v" style="width:120px">税別</th><th class="v" style="width:90px">消費税</th><th class="v" style="width:100px">税込</th><th style="width:118px">状態</th><th style="width:28px"></th></tr></thead><tbody>
    ${g.out.map((o,i)=>`<tr class="${o.on?'':'off'} ${i===g.out.length-1?'add-last':''}"><td><input type="checkbox" ${o.on?'checked':''} onchange="cgOut(${i},'on',this.checked?1:0,1)" ${dis?'disabled':''}></td>
      <td><input id="cg-on-${i}" class="q-in" value="${esc(o.n)}" placeholder="例：BP代（右リアバンパー）" onchange="cgOut(${i},'n',this.value,1)" ${dis?'disabled':''}></td>
      <td class="v">${money('cg-oa-'+i, o.a, `cgOut(${i},'a',parseYen(this.value))`, dis)}</td><td class="v">${o.a?yen(Math.floor(o.a*0.1)):''}</td><td class="v">${o.a?yen(Math.floor(o.a*1.1)):''}</td>
      <td>${seg(o.st==='fix'?'fix':'est',[['est','見込み'],['fix','確定']],`cgOut(${i},'st','$v',1)`, dis)}</td>
      <td>${dis?'':`<button class="q-del" title="この行を消す" onclick="cgDelOut(${i})">✕</button>`}</td></tr>`).join('')}</tbody></table>
    ${dis?'':`<button class="q-btn sm" style="margin-top:8px" onclick="cgAddOut()">${I('plus','＋',13)} 行を足す</button><span class="q-why" style="display:inline;margin-left:8px">請求書が来る前は見込みで入れ、来たら金額を直して確定に</span>`}`;
  /* ③ 登録費用・税金・保険料（非課税・立替）＝見積から自動 */
  const reg = `<table class="cg-tb"><tbody>${R.regRows.map(r=>`<tr><td>${esc(r[0])}</td><td class="v" style="width:120px">${yen(r[1])}</td></tr>`).join('')}
    ${R.k.condT?`<tr><td>この方の条件（希望ナンバーなど）</td><td class="v">${yen(R.k.condT)}</td></tr>`:''}</tbody></table>
    <div class="q-why" style="margin-top:6px">${R.sold?'注文書の金額':'掲載の支払総額の金額'}から自動。お客様から同じ額を受け取るので、販売価格にも入っている</div>`;
  /* ④ 車両本体・仕入れ */
  const vr = (l, k, v, note) => `<tr><td>${l}</td><td class="v" style="width:130px">${k ? money('cg-v-'+k, v, `cgVeh('${k}',parseYen(this.value))`, dis) : yen(v)}</td><td class="cg-nt">${note||''}</td></tr>`;
  const veh = `<div style="margin-bottom:8px">${seg(g.src, CG_SRCS.map(x=>[x,x]), `cgSet('src','$v')`, dis)}</div>
    <table class="cg-tb"><tbody>${vr('税抜車両本体','buy',c.buy)}
      <tr><td>${g.src==='オークション'?'落札料':'手数料'}</td><td colspan="2">${aaFeeIn(car, 'cg-v-aa', dis)}${g.src==='オークション' ? `<div class="cg-nt" style="margin-top:4px">よくある額（税込→税抜）：${CG_AAFEE.map(([a,x])=>`<button class="q-btn sm" onclick="cgVeh('aa',${x});render()" ${dis?'disabled':''}>${yen(a)}→${yen(x)}</button>`).join(' ')}</div>` : ''}</td></tr>
      ${vr('陸送','move',c.move)}${vr('リサイクル預託金','',b.recycle,'基本価格のリサイクル預託金と同じ')}${vr('自税預り金','tax',c.tax||0,'AA から請求された自動車税の月割')}</tbody></table>`;
  const sumHtml = `<div class="cg-kv"><span>車両本体・仕入れ</span><b>${yen(R.veh)}</b></div><div class="cg-kv"><span>整備費用（部品）</span><b>${yen(R.parts)}</b></div>
    <div class="cg-kv"><span>外注費</span><b>${yen(R.out)}</b></div><div class="cg-kv"><span>登録費用・税金・保険料</span><b>${yen(R.reg)}</b></div>
    <div class="cg-kv tot"><span>原価合計</span><b>${yen(R.cost)}</b></div>
    <div class="cg-kv"><span>販売価格（税抜）</span><b>${yen(R.sale)}</b></div><div class="cg-kv"><span>消費税</span><b>${yen(R.ctax)}</b></div>
    <div class="cg-div"></div>
    <div class="cg-big" style="color:${cgCol(R.gross)}">${yen(R.gross)}<small> 円</small></div><div class="cg-kv"><span>粗利率</span><b>${cgPct(R.rate)}</b></div>
    <div class="q-why" style="margin-top:6px">${R.sold?'販売価格＝注文の支払総額 − 消費税':'見込み：販売価格＝掲載の支払総額 − 消費税（オプション・値引きは入っていない）'}</div>`;
  return `<div class="q-wrap"><div class="q-top"><button class="q-btn sm" onclick="cgGo(null)">${I('left','←',13)} 原価管理の一覧</button><span class="sp"></span>
      <button class="q-btn sm" onclick="goApp('quote');openCar('${car.id}')">${I('estimate','🧾',13)} 見積を開く</button></div>
    <div class="q-card cg-head"><div class="ph">${carSvg(car)}</div><div style="flex:1;min-width:0"><div class="cg-no">${esc(car.num)} <span class="q-pill ${cs}">${esc(cl)}</span>${g.done?`<span class="q-pill good">原価 確定 ${jd(g.done)}</span>`:R.sold?'<span class="q-pill warn">原価処理待ち</span>':''}</div>
      <div class="cg-nm">${esc(car.maker)} ${esc(car.model)} <small>${esc(car.grade)}・${ym(car.firstReg).y}年・${(car.km/10000).toFixed(1)}万km</small></div></div>
      <div class="cg-hd">
        <div><label>販売形態</label>${seg(g.form, CG_FORMS.map(x=>[x,x]), `cgSet('form','$v')`, dis)}</div>
        <div><label>在庫期間</label><b>${Math.max(1, Math.round(days/30))} カ月</b><small>（${days}日・仕入 ${jd(car.buyDate)}）</small></div>
        <div><label>担当</label><b>${u ? esc(u.staff||'—') : '—'}</b></div>
        <div><label>お客様</label>${seg(g.rep||'', [['初回','初回'],['リピーター','リピーター']], `cgSet('rep','$v')`, dis || !R.sold)}</div></div></div>
    ${g.done?`<div class="q-note ok" style="margin-top:10px">${I('lock','🔒',14)} 原価は ${jd(g.done)} に確定済み。直す時は右の「確定を取り消す」</div>`:''}
    <div class="cg-grid"><div>
      ${sec('基本整備内容（部品）', yen(R.parts), parts, '原価表の「基本整備内容」')}
      ${sec('外注費', yen(R.out), out, '税別で入れる')}
      ${sec('登録費用・税金・保険料', yen(R.reg), reg, '非課税・立替')}
      ${sec('車両本体・仕入れ', yen(R.veh), veh, '基本価格の「車両原価」と同じ値')}
    </div><div>
      <div class="q-card cg-sum"><h3>${R.sold?'粗利':'見込みの粗利'} <span class="r">税抜</span></h3><div class="bd">${sumHtml}</div></div>
      <div class="q-card"><h3>原価処理 <span class="r">バックオフィス</span></h3><div class="bd">
        ${!R.sold ? '<div class="q-why">売約してから確定します。いまは見込みで入れておけます。</div>'
          : g.done ? `<div class="q-why" style="margin-bottom:8px">${jd(g.done)} に確定。（バックオフィスの「原価処理」とはまだつないでいません）になる想定。</div><button class="q-btn" onclick="cgDone(false)">${I('undo','↺',13)} 確定を取り消す</button>`
          : `${R.outEst||R.partMiss?`<div class="q-note warn" style="margin-bottom:8px">${[R.partMiss?`単価がまだの部品 ${R.partMiss}件`:'', R.outEst?`外注費に見込みの行 ${yen(R.outEst)}`:''].filter(Boolean).join('・')}</div>`:''}<button class="q-btn ok" onclick="cgDone(true)">${I('check','✓',13)} 原価を確定する</button><div class="q-why" style="margin-top:6px">確定すると入力が止まり、バックオフィスの「原価処理」が完了になる（本物）</div>`}
      </div></div>
    </div></div></div>`; }

/* =====================================================================
   見積書のサンプル（モックだけ）
   🗣 2026-10-12「実際の見積書の印刷後のフォーマットを仕上げたい。フラットに、色も青にとらわれずに、様々な角度から色々なバリエーション・書き方で10パターンくらい。
                  見積モックのサイドバーにサンプルを入れて、パターンごとに見れる感じに」
   🗣 2026-10-12（作り直し）「どれも作りこみが甘い。各ディーラーや大手、他ソフト、他業種も複数調査して、製品レベルの作りこみで。車両の写真はあるがメインに考えて」
   ＝調査：資料\調査_見積機能_2026-09-30\12_見積書の作り込み調査.md。写真＝NAS のグーネット掲載写真（build.py の photos_js・3台分）
   中身（金額・内訳・車・注意書き）は全部同じ（qvData）。見た目と並べ方・書き方だけを変える。A4 縦1枚
   🗣 2026-10-13「①〜⑩を同じ内容でまとめて印刷できるボタン」「フチなしだと印刷で A4 に白い縁が出てかっこよさが薄れる」
                 「下取りあり・ローンあり・OP が多くて入りきらない時の別枠や2ページ目への逃がしも。思いつく全部のパターンで綺麗にはまるように」
   ＝①事務機は紙の端から約5mmは刷れない → どの形も紙の端から 8mm 以上内側に収める（写真も白い縁を前提にした額縁の見せ方）
     ②下取あり＝大きい数字は「差引お支払額」、すぐそばに「お支払総額 − 下取車（＋残債）」。ローンあり＝月々・回数・割賦販売価格を総額のそばに
     ③OP の行が形ごとの上限（cap）を超えたら、1枚目は「付属品・オプション N点」の1行にまとめ、2ページ目（別紙）に明細を全部
   ===================================================================== */
function qvData(d, k){
  const car = d.car, b = d.ctx.b, p = d.ctx.plan, c = C(), who = d.who;
  const nz = L => L.filter(r=>+r[1]);   // 0円の行は出さない（ナンバー代が要らない登録・継続移転で0の自動車税 など）
  const feesK = nz(k.feeK.map(f=>[f[0], f[1]]).concat(k.bc.unexpTax?[['自動車税 未経過相当額', k.bc.unexpTax]]:[], k.bc.unexpJb?[['自賠責 未経過相当額', k.bc.unexpJb]]:[], k.condRows.filter(r=>r[2]==='k').map(r=>[r[0], r[1]])));
  const feesT = nz(k.legal.map(f=>[f[0], f[1]]).concat(k.condRows.filter(r=>r[2]==='t').map(r=>[r[0], r[1]])));
  const taxes = nz([[k.bc.kei ? '軽自動車税（種別割）' : `自動車税（種別割）${k.bc.months?' '+ym(k.bc.rd).m+'月登録にて':''}`   /* v4.5.22 🗣 2026-10-24「〇ヵ月分ではなく、予定している登録月で。自動車税（種別割）11月登録にて とかに」 */, k.bc.carTax], ['自動車重量税', k.bc.weight], ['自賠責保険料'+(k.bc.R.insp && +k.bc.jibaiM===25 ? ' 25か月' : ''), k.bc.jibai]]);   /* v4.5.26 🗣「自賠責が25か月の物に限り『自賠責保険料 25か月』と表示」 */
  const opts = k.inPlan.flatMap(x=>optLines(x).map(([n,a,tbd])=>({ n, a: tbd ? null : (+a||0), tbd, sub: /^\s*└/.test(n) })));
  const vehIn = Math.floor(k.vehicle*1.1), fr = car.firstReg || '';
  const hasPh = !!carPh(car);
  /* v4.5.27 🗣「写真が1枚しか入ってない時に、帳票が自動で1枚用（今だと下の4枚が無い物）に切り替わるように」＝写真タブの枚数（無ければカードの写真で1枚） */
  const phN = (car.photos||[]).filter(x=>x && x.url).length || (car.photo ? 1 : 0);
  return { d, no: estNo(car, p ? (p==='D'?'D':p) : 'base', who), p: p || 'base', plan: p ? `プラン ${p}（${planName(p)}）` : '基本（オプションなし）', planS: p ? planName(p) : '基本',
    date: jd(TODAY), valid: jd(addDays(TODAY, c.valid)), cust: who && who.name ? who.name : '', staff: who ? (who.staff||'') : '',   /* 🗣 2026-10-23「プラン見積では担当欄自体を無くして」＝お客様の無い見積書は担当を出さない */ c, car, b, k,
    title: car.maker+' '+car.model, yearW: wareki(fr), yearA: fr ? `${fr.slice(0,4)}年${+fr.slice(5,7)}月` : '', km: kmText(car,b),
    spec: [['車名', car.maker+' '+car.model], ['グレード', car.grade], ['年式', wareki(fr)+'（'+fr.slice(0,4)+'年）'], ['走行距離', kmText(car,b)], ['車体色', car.color], ['排気量', ccU(car)],
           ['型式', car.fmodel], ['修復歴', b.repair], ['車検', shakenText(b,k)], ['保証', k.ws ? 'なし（現状渡し）' : warText(b)], ['管理番号', car.num]],
    equip: eqPicks(car).filter(s=>!/媒体/.test(s)).slice(0, 10), seibi: k.tier ? tierOf(k.tier) : k.bc.seibiInfo, seibi0: k.bc.seibiInfo, opts, feesK, feesT, taxes,
    sumK: k.feeKSum + k.bc.unexpTax + k.bc.unexpJb + k.condK, sumT: k.nonTax + k.legalSum + k.condT, vehIn, feesIn: k.cash - vehIn,
    cond: condText(b, k.ws), loan: k.loan, tr: !!(k.trade || k.tradeLoan), tradeModel: d.tradeModel || '',
    headLb: (k.trade || k.tradeLoan) ? '差引お支払額' : 'お支払総額',
    headSub: (k.trade || k.tradeLoan) ? `お支払総額 ${yen(k.cash)} − 下取車 ${yen(k.trade)}${k.tradeLoan ? ' ＋ 残債 '+yen(k.tradeLoan) : ''}` : '',
    opts1: opts, fold: false, nOpt: opts.filter(o=>!o.sub).length,
    loanX: k.loan || (k.net > 0 ? loanCalc(k.net, 0, S.set.loan.rate, S.set.loan.count) : null), loanEx: !k.loan,
    hasPh, phMany: phN > 1, ph: slot => hasPh ? (carPh(car, slot) || carPh(car)) : '' };
}
const qY = v => '¥' + yen(v);
const qyz = v => v ? yen(v) : '—';
const qOptAmt = o => o.tbd ? OPT_TBD : o.a ? yen(o.a) : 'サービス';
/* 🗣 2026-10-24「プラン見積などでは＿＿＿様を無くして、LINE と電話を大きめに。LINE は QR」＝お客様の名前が無い時は、LINE の QR（quote/vendor/qrcode-generator）と電話 */
const qQR = u => { try { if (!u || typeof qrcode !== 'function') return ''; const g = qrcode(0, 'H'); g.addData(String(u)); g.make(); return g.createSvgTag({ cellSize:4, margin:0, scalable:true }); } catch (e) { return ''; } };
const qContact = q => { const l = q.c.line, qr = qQR(l);
  /* v4.5.21 🗣「ラインの ID の記載は要らない。QR の真ん中に LINE ってあるようなやつに」＝ID の行を外し、QR の真ん中に LINE の印（誤り訂正 H で真ん中を隠しても読める） */
  return `<span class="q-cta">${qr ? `<span class="qr">${qr}<span class="ln">LINE</span></span>` : ''}<span class="t"><small>${qr ? 'LINE・お電話でお気軽にご相談ください' : 'お電話でお気軽にご相談ください'}</small><b>TEL ${esc(q.c.tel)}</b></span></span>`; };
const qCustLine = q => q.cust ? esc(q.cust)+' <small>様</small>' : qContact(q);
const qPay = q => q.loan ? `ローン：頭金 ${yen(q.loan.down)}・${q.loan.n}回（初回 ${yen(q.loan.first)}／2回目以降 ${yen(q.loan.later)}）・実質年率 ${q.loan.rate}%・分割手数料 ${yen(q.loan.fee)}・割賦販売価格 ${yen(q.loan.hanbai)}` : '現金（お振込）';
/* 下取・ローンの1行（総額のそばに置く） */
const qTrLine = q => q.tr ? `<span class="trl">${esc(q.headSub)}</span>` : '';
const qLnLine = q => q.loan ? `<span class="lnl">ローン 月々 ${yen(q.loan.later)}円 × ${q.loan.n-1}回（初回 ${yen(q.loan.first)}円・頭金 ${yen(q.loan.down)}円・実質年率 ${q.loan.rate}%・割賦販売価格 ${yen(q.loan.hanbai)}円）</span>` : '';
const qTrName = q => '下取車価格' + (q.tradeModel ? '（' + esc(q.tradeModel) + '）' : '');
const qAddr = q => `${esc(q.c.zip)} ${esc(q.c.addr)}`;
const qTel = q => `TEL ${esc(q.c.tel)}`;   /* v4.5.20 FAX は出さない */
const qReg = q => `適格請求書発行事業者 登録番号 ${esc(q.c.inv)}　古物商許可 ${esc(q.c.kobutsu)}`;
/* 写真：無い置き場は主役の写真。写真の無い車は絵 */
const qI = (q, slot, cls, cap) => `<figure class="qi ${cls||''}">${q.hasPh ? `<img src="${q.ph(slot)}" alt="">` : carSvg(q.car)}${cap?`<figcaption>${cap}</figcaption>`:''}</figure>`;
/* 注意書き（どの形にも同じ物） */
const qNotes = q => [q.cond, `本見積の有効期限は ${q.valid} です。`, '自動車税・自賠責保険料は登録する月により変わります（未経過相当額を含みます）。',
  ...(q.opts.some(o=>o.tbd) ? [`「${OPT_TBD}」の品は、サイズを確認してから金額を決めます（支払総額に入っていません）。`] : []), 'お車の状態は、現車でご確認ください。'];
/* 内訳のまとまり（どの形でも同じ順番・同じ足し算）
   車両販売価格（税抜）＋販売諸費用（課税）＋消費税＋税金・保険料（立替）＋登録の法定費用（立替）＋リサイクル預託金 ＝ 現金販売価格 */
/* 🗣 2026-10-23「納車整備を本体に含むではなく、ヤリスで言えば 143+1.5 って書き方に」「車両価格に含みますの記述で」
   ＝見出しの「車両価格」はポータル・店頭の車両価格と同じ数字のまま（公正競争規約：必ず付ける整備は車両価格に含める）、その内訳として 車両本体＋納車整備（必須） */
const qVehRows = q => { const k = q.k, s0 = (k.bc && k.bc.seibiIn) || 0;
  /* 🗣 2026-10-23「たしざんはしたい。じゃあ車いくらなの？っていうシンプルな疑問に答えにくい」「必須はすごく強く感じる。（販売価格に含む）であればいいか？」
     ＝上から足すと車両販売価格になる形。車両本体価格（車そのもの）＋納車整備費（販売価格に含む）＋パック・オプション。
     ⚠「車両価格」と呼ばない（掲載の車両価格は納車整備込み＝143万を車両価格と呼ぶと、広告に整備費を足したように見える） */
  return s0 ? [['└ 車両本体価格', k.body - s0, '', 'sub'], ['└ 納車整備費（販売価格に含む）', s0, '', 'sub']] : [['└ 車両本体価格', k.body, '', 'sub']]; };
function qGroups(q){ const k = q.k;
  return [
    { h:'車両販売価格', tag:'課税', sub:k.vehicle, rows:qVehRows(q).concat(k.disc?[['お値引き', -k.disc]]:[], q.opts1.map(o=>o.fold ? [o.n, o.a, q.foldNote || '明細は別紙（2ページ目）', '', 'fold'] : [o.n.replace(/^\s*└\s*/,''), o.tbd ? null : o.a, o.tbd ? OPT_TBD : '', o.sub ? 'sub' : '', o.tbd ? 'tbd' : (!o.a ? 'svc' : '')])) },
    { h:'販売諸費用', tag:'課税', sub:q.sumK, rows:q.feesK },
    { h:'消費税（10%）', tag:'', sub:k.ctax, rows:[] },
    { h:'税金・保険料', tag:'非課税・立替', sub:k.taxIns, rows:q.taxes },
    { h:'登録の法定費用', tag:'非課税・立替', sub:q.sumT - k.nonTax, rows:q.feesT },
    { h:'リサイクル預託金相当額', tag:'対象外', sub:k.nonTax, rows:[] },
  ].filter(g=>g.sub || g.rows.length); }
const qAmt = (v, r) => r && r[4]==='tbd' ? `<span class="tbd">${OPT_TBD}</span>` : r && r[4]==='svc' ? 'サービス' : v < 0 ? '▲'+yen(-v) : yen(v);
/* 内訳の表（形ごとに CSS で見た目を変える）。o.tag＝課税/立替の札・o.note＝行の下の小さい説明・o.desc＝説明の列 */
function qBreak(q, o){ o = o || {}; const k = q.k;
  return `<div class="qb">${qGroups(q).map(g=>`<div class="g"><div class="gh"><span>${g.h}${o.tag&&g.tag?`<i class="tg">${g.tag}</i>`:''}</span><b>${yen(g.sub)}</b></div>${g.rows.map(r=>`<div class="gr ${r[3]||''}"><span>${esc(r[0])}${(o.note||r[4]==='fold')&&r[2]&&r[4]!=='tbd'?`<em>${esc(r[2])}</em>`:''}${o.desc&&r[4]!=='fold'?`<em>${esc(qExpl(r[0]))}</em>`:''}</span><b>${qAmt(r[1], r)}</b></div>`).join('')}</div>`).join('')}
    ${q.tr ? `<div class="gt cash"><span>お支払総額<small>（現金販売価格）</small></span><b>${yen(k.cash)}</b></div>
    ${k.trade?`<div class="gr tr"><span>${qTrName(q)}</span><b>▲${yen(k.trade)}</b></div>`:''}${k.tradeLoan?`<div class="gr tr"><span>下取車の残債（当店で精算）</span><b>${yen(k.tradeLoan)}</b></div>`:''}
    <div class="gt net"><span>差引お支払額</span><b>${yen(k.net)}</b></div>` : `<div class="gt net"><span>お支払総額</span><b>${yen(k.net)}</b></div>`}
    ${o.loan&&q.loan?`<div class="gl"><span>ローン（頭金 ${yen(q.loan.down)}・${q.loan.n}回・実質年率 ${q.loan.rate}%）</span><b>月々 ${yen(q.loan.later)}</b><span>分割手数料 ${yen(q.loan.fee)}・割賦販売価格 ${yen(q.loan.hanbai)}</span></div>`:''}</div>`; }
/* お客様向けの言い方（説明つきの形で使う） */
const QEXPL = [[/納車整備費（販売価格に含む）/, '納車前の点検整備の費用（車両販売価格に含みます）'], [/^└ 車両本体価格$/, 'お車そのものの価格'], [/本体/, 'お車そのものの価格。納車前の点検整備を含みます'], [/値引/, '本見積だけのお値引きです'], [/検査登録|登録手続|名義/, '名義変更・登録の手続きを当店が代わりに行う費用'], [/車庫証明手続|車庫.*代行/, '警察署への車庫証明の申請を当店が代わりに行う費用'],
  [/自動車税 未経過|自賠責 未経過/, '前の持ち主が先に払った分のうち、残りの期間の相当額'], [/種別割/, '4月1日の持ち主に毎年かかる税金。登録の翌月から3月までの月割り'], [/重量税/, '車検の時に国へ納める税金'], [/自賠責保険料/, '法律で入ることが決まっている保険（対人）'],
  [/検査.*手数料|登録手数料/, '運輸支局（国）へ納める手数料'], [/車庫証明手数料/, '警察署へ納める手数料（証紙代）'], [/ナンバー/, 'ナンバープレートの代金'], [/希望ナンバー/, 'お好きな番号のナンバーにする手続きと代金'],
  [/ボディコーティング/, 'ボディの艶を保ち、汚れを落としやすくします'], [/ドライブレコーダー|SN-/, '走行中の映像を記録するカメラ'], [/組替/, 'タイヤの組み替えとバランス調整'], [/工賃/, '取り付けの作業代'], [/延長保証/, '保証の期間を延ばします'],
  [/ETC.*車載器|ETC2/, '料金所を止まらずに通れる車載器'], [/ETC/, 'お客様の情報でETCを使えるようにします'], [/マット/, '足元の汚れを防ぐ専用マット'], [/バイザー/, '雨の日も窓を少し開けられます'], [/スタッドレス/, '冬用のタイヤとホイール'],
  [/撥水/, '雨をはじいて視界を保ちます'], [/ヘッドライト/, '黄ばみを落としてコーティング'], [/クリーニング/, 'シートや内装を洗浄します'], [/地図/, 'ナビの地図を新しくします'], [/盗難/, '車両の盗難を防ぐ装置'], [/ホイールコーティング/, 'ブレーキの汚れを落としやすくします'], [/フレーム/, 'ナンバーを縁取るフレーム'],
  [/メンテナンスパック/, 'オイル交換や消耗品の交換と、長い保証がセットになります'], [/消臭|除菌/, '車内のにおいを分解します'], [/フィルター/, 'エアコンの空気をきれいにするフィルターに交換'], [/発煙筒/, '期限の無い LED の非常信号灯に交換']];
const qExpl = n => (QEXPL.find(e=>e[0].test(n)) || [0,''])[1];
/* 回数の早見表（同じ実質年率で回数だけ変える） */
const qLoanTab = q => [36,48,60,72,84].map(n=>({ n, L: loanCalc(q.k.net, q.loanX ? q.loanX.down : 0, q.loanX ? q.loanX.rate : S.set.loan.rate, n) }));
/* プラン比較のための計算（同じお客様・同じ車で 基本・A・B・C） */
function qPlans(q){ const d = q.d, car = d.car, who = d.who;
  return ['base','A','B','C'].map(p=>{ const ctx = d.mk ? d.mk(p) : who ? custCtx(car, who, p) : (p==='base' ? { car, b:car.base, plan:null } : stdCtx(car, p)); const k = calc(ctx);
    return { p, name: p==='base' ? '基本' : 'プラン '+p, sub: p==='base' ? 'オプションなし' : planName(p), k, items: k.inPlan.flatMap(x=>optLines(x).map(([n,a,tbd])=>({ n:String(n).replace(/^\s*└\s*/,''), a, tbd, sub: /^\s*└/.test(n) }))).filter(x=>!x.sub), all: k.inPlan.flatMap(x=>optLines(x).map(([n,a,tbd])=>({ n, a, tbd, sub: /^\s*└/.test(n) }))), seibi: k.tier ? tierOf(k.tier) : k.bc.seibiInfo }; }); }
/* 登録に要る書類（普通車／軽） */
const qDocs = q => q.car.kei ? ['住民票（または印鑑証明書）', '認印'] : ['印鑑証明書（発行から3か月以内）', '実印', '車庫証明の書類（当店で代行できます）'];
const qStamp = (t) => `<span class="stamp">${t||'印'}</span>`;

const QV = [
 /* 1 ショールーム：レクサス・ポルシェの見積の見せ方。写真を上いっぱいに、名前は写真の上。総額は白いカードで写真に重ねる */
 { name:'ショールーム（見積タブで使用中）', sub:'写真を上いっぱい・名前を写真の上に・総額のカード', col:'#1c1917', render:q=>{ const k = q.k;
   return `<div class="qv q1">
   <div class="hero">${qI(q,'hero')}<div class="shade"></div>
     <div class="top"><span class="co">${esc(q.c.name)}</span><span class="doc">お見積書　<small>${esc(q.no)}</small></span></div>
     <div class="name"><small>${esc(q.car.maker)}</small><h1>${esc(q.car.model)}</h1><p>${esc(q.car.grade)}</p></div></div>
   <div class="row1${q.phMany?'':' one'}">${q.phMany?`<div class="thumbs">${qI(q,'side')}${qI(q,'rear')}${qI(q,'dash')}${qI(q,'seat')}</div>`:''}
     <div class="tot"><small>${q.headLb}<span>消費税込</span></small><b>${qY(k.net)}</b><div class="eq"><span>車両販売価格 ${yen(q.vehIn)}</span><span>諸費用 ${yen(q.feesIn)}</span>${qTrLine(q)}</div>${q.loan?`<div class="ln"><b>月々 ${yen(q.loan.later)}円</b><span>× ${q.loan.n-1}回（初回 ${yen(q.loan.first)}円）・頭金 ${yen(q.loan.down)}円<br>実質年率 ${q.loan.rate}%・割賦販売価格 ${yen(q.loan.hanbai)}円</span></div>`:''}</div></div>
   <div class="facts">${[['年式', q.yearW, q.yearA], ['走行距離', q.car.km.toLocaleString()+' km', '実走行'], ['修復歴', q.b.repair, ''], ['車検', shakenText(q.b,k).replace(/（.*$/,''), ''], ['保証', k.ws?'なし':warText(q.b), '']].map(f=>`<div><small>${f[0]}</small><b>${esc(f[1])}</b>${f[2]?`<i>${esc(f[2])}</i>`:''}</div>`).join('')}</div>
   <div class="body"><div class="l"><h3>お車</h3>${q.spec.filter(s=>!/車名|年式|走行|修復|保証|車検/.test(s[0])).map(s=>`<div class="sp"><span>${s[0]}</span><b>${esc(s[1])}</b></div>`).join('')}
       <h3>主な装備</h3><div class="eqs">${q.equip.map(e=>`<span>${esc(e)}</span>`).join('')}</div>
       <h3>納車整備</h3><div class="tx"><b>${esc(q.seibi.name)}</b>　${esc(q.seibi.note)}</div></div>
     <div class="r"><h3>お見積の内訳 <small>${esc(q.plan)}</small></h3>${qBreak(q,{note:1})}</div></div>
   <div class="foot"><div class="who"><div class="cu">${qCustLine(q)}</div><div class="m">見積日 ${q.date}　有効期限 ${q.valid}${q.staff?'　担当 '+esc(q.staff):''}</div></div>
     <div class="cp"><b>${esc(q.c.name)}</b>${qAddr(q)}<br>${qTel(q)}<br>${qReg(q)}</div></div>
   <div class="notes">${qNotes(q).map(n=>`<span>※ ${esc(n)}</span>`).join('')}</div></div>`; } },

 /* 2 物件概要（不動産のチラシ＝マイソクの型）：写真を大きく複数枚、価格は特大、細かい事は下の概要の表にまとめる */
 { name:'物件概要（チラシ型）', sub:'不動産のチラシの型・写真5枚・概要の表', col:'#b91c1c', render:q=>{ const k = q.k;
   const pts = [['修復歴 '+q.b.repair, '骨格に関わる修理の跡はありません'], [warNone(q.b) ? '保証なし' : '保証付き', warNone(q.b) ? '' : warText(q.b)], [q.seibi.name, q.seibi.k==='L'?'法定12か月点検の項目を点検':'オイル交換・消耗品の交換つき'], [q.equip.slice(0,3).join('・'), q.equip.slice(3,6).join('・')]].filter(x=>x[0]);
   return `<div class="qv q2">
   <div class="hd"><div class="tl"><span class="kd">中古車</span><div><h1>${esc(q.title)} <span>${esc(q.car.grade)}</span></h1><p>${esc(q.yearW)}（${q.car.firstReg.slice(0,4)}）　走行 ${q.car.km.toLocaleString()}km　${esc(q.car.color)}　${ccU(q.car)}</p></div></div>
     <div class="pz"><small>${q.headLb}<span>（税込）</span></small><b>${Math.floor(k.net/10000).toLocaleString()}<em>.${String(Math.floor(k.net%10000/1000))}</em><i>万円</i></b><div class="s">${q.tr ? `お支払総額 ${(k.cash/10000).toFixed(1)}万円 − 下取車 ${(k.trade/10000).toFixed(1)}万円${k.tradeLoan?' ＋ 残債 '+(k.tradeLoan/10000).toFixed(1)+'万円':''}` : `車両価格 ${(q.vehIn/10000).toFixed(1)}万円（税込）＋ 諸費用 ${(q.feesIn/10000).toFixed(1)}万円`}</div>${q.loan?`<div class="s ln">ローン 月々 ${yen(q.loan.later)}円 × ${q.loan.n-1}回・頭金 ${yen(q.loan.down)}円・実質年率 ${q.loan.rate}%</div>`:''}</div></div>
   <div class="col">${qI(q,'hero','a')}${qI(q,'side','b')}${qI(q,'back','c')}</div>
   <div class="strip">${qI(q,'dash','','運転席まわり')}${qI(q,'seat2','','後席')}${qI(q,'lug','','荷室')}${qI(q,'meter','','走行 '+q.car.km.toLocaleString()+'km')}</div>
   <div class="pts">${pts.map((p,i)=>`<div><b>${i+1}</b><span><strong>${esc(p[0])}</strong>${esc(p[1])}</span></div>`).join('')}</div>
   <div class="gaiyo"><div class="gh">車両概要</div><table>${(()=>{ const L = q.spec.concat([['納車整備', q.seibi.name], ['見積番号', q.no], ['見積日', q.date], ['有効期限', q.valid]]); let h=''; for(let i=0;i<L.length;i+=2) h+=`<tr><th>${L[i][0]}</th><td>${esc(L[i][1])}</td>${L[i+1]?`<th>${L[i+1][0]}</th><td>${esc(L[i+1][1])}</td>`:'<th></th><td></td>'}</tr>`; return h; })()}</table>
     <div class="gh">価格の内訳</div><div class="bk">${qBreak(q,{loan:1})}</div></div>
   <div class="nt">${qNotes(q).map(esc).join('　')}</div>
   <div class="ft"><div class="lb">販売店</div><div class="cp"><b>${esc(q.c.name)}</b><span>${qAddr(q)}　${qTel(q)}</span><span>${qReg(q)}${q.staff?'　担当 '+esc(q.staff):''}</span></div><div class="cu">${qCustLine(q)}</div></div></div>`; } },

 /* 3 注文の確認（Apple・テスラの注文の確認画面の型）：白・写真を中央に大きく・選んだ物を一覧・右に合計 */
 { name:'注文の確認', sub:'Apple・テスラの型・白と灰色・選んだ物の一覧', col:'#6b7280', render:q=>{ const k = q.k;
   const inc = [[q.seibi0.name, '含む'], [k.ws?'保証なし':'保証 '+warText(q.b), '含む'], ['車検 '+shakenText(q.b,k).replace(/（.*$/,''), '含む']].concat(q.opts1.filter(o=>!o.sub).map(o=>[o.n, o.fold ? yen(o.a)+'（別紙）' : qOptAmt(o)]));
   return `<div class="qv q3">
   <div class="hd"><b>${esc(q.c.name)}</b><span>お見積り　${esc(q.no)}</span></div>
   ${qI(q,'hero','hero')}
   <div class="nm"><h1>${esc(q.car.model)}</h1><p>${esc(q.car.maker)}　${esc(q.car.grade)}　·　${esc(q.yearW)}　·　${q.car.km.toLocaleString()} km　·　${esc(q.car.color)}</p></div>
   <div class="cols"><div class="l"><h3>この見積に含まれるもの</h3>${inc.map(x=>`<div class="it"><i>✓</i><span>${esc(x[0])}</span><b>${esc(x[1])}</b></div>`).join('')}
       <h3>お車の詳しい情報</h3><div class="spec">${q.spec.filter(s=>!/車名|グレード/.test(s[0])).map(s=>`<div><small>${s[0]}</small><span>${esc(s[1])}</span></div>`).join('')}</div></div>
     <div class="r"><h3>お支払い</h3><div class="sum"><div><span>車両販売価格（税込）</span><b>${qY(q.vehIn)}</b></div><div><span>販売諸費用（税込）</span><b>${qY(q.sumK + k.ctax - (q.vehIn - k.vehicle))}</b></div><div><span>税金・保険料・法定費用</span><b>${qY(k.taxIns + q.sumT - k.nonTax)}</b></div><div><span>リサイクル預託金相当額</span><b>${qY(k.nonTax)}</b></div>${q.tr?`<div class="st"><span>お支払総額</span><b>${qY(k.cash)}</b></div>`:''}${k.trade?`<div><span>${qTrName(q)}</span><b>▲${qY(k.trade)}</b></div>`:''}${k.tradeLoan?`<div><span>下取車の残債</span><b>${qY(k.tradeLoan)}</b></div>`:''}
       <div class="tt"><span>${q.headLb}</span><b>${qY(k.net)}</b></div><p class="tx">消費税 ${qY(k.ctax)} を含みます</p></div>
       ${q.loanX?`<div class="ln"><small>${q.loanEx?'ローンをご利用の場合（例）':'ローン'}</small><b>月々 ${qY(q.loanX.later)}</b><span>${q.loanX.n}回・頭金 ${yen(q.loanX.down)}・実質年率 ${q.loanX.rate}%・割賦販売価格 ${yen(q.loanX.hanbai)}</span></div>`:''}
       <div class="who"><small>お客様</small><div>${qCustLine(q)}</div><small>見積日・有効期限</small><div>${q.date} 〜 ${q.valid}</div><small>担当</small><div>${esc(q.staff)}</div></div></div></div>
   <details class="dt" open><summary>内訳の詳細</summary>${qBreak(q,{tag:1})}</details>
   <div class="ft"><div>${qNotes(q).map(esc).join('<br>')}</div><div class="cp">${esc(q.c.name)}<br>${qAddr(q)}<br>${qTel(q)}<br>登録番号 ${esc(q.c.inv)}</div></div></div>`; } },

 /* 4 正式な見積書（日本の帳票＋写真）：宛名・件名・御見積金額の枠・角印の枠。経理や法人のお客様にもそのまま通る型 */
 { name:'正式な見積書', sub:'日本の帳票の型・宛名と件名・印の枠・写真つき', col:'#14532d', render:q=>{ const k = q.k; let n = 0;
   const row = (name, kb, amt, note, cls) => `<tr class="${cls||''}"><td class="no">${cls==='st'||cls==='gt'?'':++n}</td><td>${name}</td><td class="kb">${kb||''}</td><td class="v">${amt}</td><td class="nt">${note||''}</td></tr>`;
   const body = [row('車両本体価格', '課税', yen(k.body), `${esc(q.seibi0.name)}含む`)].concat(k.disc?[row('お値引き','課税','▲'+yen(k.disc))]:[],
     q.opts1.map(o=>o.fold ? row(esc(o.n), '課税', yen(o.a), '明細は別紙（2ページ目）') : row((o.sub?'　└ ':'')+esc(o.n.replace(/^\s*└\s*/,'')), '課税', o.tbd?'—':o.a?yen(o.a):'0', o.tbd?OPT_TBD:!o.a?'サービス':'')),
     [row('車両販売価格 小計','', yen(k.vehicle), '', 'st')], q.feesK.map(r=>row(esc(r[0]),'課税',yen(r[1]))), [row('消費税（10%）','', yen(k.ctax),'課税分の合計に対して','st')],
     q.taxes.map(r=>row(esc(r[0]),'非課税',yen(r[1]),'立替')), q.feesT.map(r=>row(esc(r[0]),'非課税',yen(r[1]),'立替')), [row('リサイクル預託金相当額','対象外',yen(k.nonTax),'預託金')],
     q.tr ? [row('お支払総額（現金販売価格）','', yen(k.cash), '', 'st')] : [], k.trade?[row(qTrName(q),'','▲'+yen(k.trade),'下取車')]:[], k.tradeLoan?[row('下取車の残債','',yen(k.tradeLoan),'当店で精算')]:[], [row(q.tr?'差引お支払額':'お支払総額','', yen(k.net), '', 'gt')]).join('');
   return `<div class="qv q4"><h1>御 見 積 書</h1>
   <div class="g"><div class="l"><div class="to">${qCustLine(q)}</div><div class="sj"><span>件名</span>中古車 ${esc(q.title)} ${esc(q.car.grade)} のご購入</div><p>下記のとおり御見積申し上げます。</p>
       <div class="amt"><span>御見積金額</span><b>${qY(k.net)} −</b><small>（消費税 ${qY(k.ctax)} を含む${q.tr?'・下取車差引後':''}）</small></div>
       <table class="mt"><tr><th>お支払い方法</th><td>${q.loan?'ローン（下記）':'現金（お振込）'}</td></tr><tr><th>納車場所</th><td>${esc(q.c.area.split('・').pop())}</td></tr><tr><th>有効期限</th><td>${q.valid}</td></tr></table></div>
     <div class="r"><table class="mt"><tr><th>見積番号</th><td>${esc(q.no)}</td></tr><tr><th>見積日</th><td>${q.date}</td></tr></table>
       <div class="cp"><b>${esc(q.c.name)}</b>${qAddr(q)}<br>${qTel(q)}<br>登録番号 ${esc(q.c.inv)}<br>古物商許可 ${esc(q.c.kobutsu)}${qStamp('社印')}</div>
       <div class="stamps"><div><small>担当</small><span>${esc(q.staff.split(' ')[0])}</span></div><div><small>承認</small><span></span></div></div></div></div>
   <div class="car">${qI(q,'hero')}<table>${(()=>{ const L = q.spec; let h=''; for(let i=0;i<L.length;i+=2) h+=`<tr><th>${L[i][0]}</th><td>${esc(L[i][1])}</td>${L[i+1]?`<th>${L[i+1][0]}</th><td>${esc(L[i+1][1])}</td>`:'<th>主な装備</th><td class="eq">'+esc(q.equip.slice(0,4).join('・'))+'</td>'}</tr>`; return h; })()}</table></div>
   <table class="it"><thead><tr><th class="no">No.</th><th>項目</th><th class="kb">区分</th><th class="v">金額（円）</th><th class="nt">摘要</th></tr></thead><tbody>${body}</tbody></table>
   ${q.loan?`<div class="ln"><b>ローンのご利用</b>　${qPay(q)}</div>`:''}
   <div class="bm"><div class="bx"><div class="h">備考</div>${qNotes(q).map(t=>`<div>・${esc(t)}</div>`).join('')}</div><div class="bx"><div class="h">お振込先</div><div>${esc(q.c.bank)}</div><div class="s">振込手数料はお客様のご負担でお願いします。</div></div></div></div>`; } },

 /* 5 月々のお支払い（ローン重視）：携帯電話・住宅ローンの提案書の型。月々を主役に、回数の早見表と現金との比較 */
 { name:'月々のお支払い', sub:'ローン重視・回数の早見表・現金との比較', col:'#0f766e', render:q=>{ const k = q.k, L = q.loanX;
   if (!L) return `<div class="qv q5"><p>お支払総額が0円のため表示できません</p></div>`;
   const tab = qLoanTab(q), m0 = new Date(TODAY); m0.setMonth(m0.getMonth()+1); const ymS = d => `${d.getFullYear()}年${d.getMonth()+1}月`; const mE = new Date(m0); mE.setMonth(mE.getMonth()+L.n-1);
   return `<div class="qv q5">
   <div class="hd"><div><b>${esc(q.c.name)}</b><span>お支払いプランのご提案</span></div><div class="m">${esc(q.no)}<br>${q.date}（有効期限 ${q.valid}）</div></div>
   <div class="top">${qI(q,'hero','ph')}<div class="mo"><div class="car"><b>${esc(q.title)}</b> ${esc(q.car.grade)}<br><small>${esc(q.yearW)}・${q.car.km.toLocaleString()}km・${esc(q.car.color)}・修復歴${esc(q.b.repair)}</small></div>
       <small class="lb">${q.loanEx?'ローンをご利用の場合（例）':'ローンのお支払い'}</small><div class="big"><span>月々</span><b>${yen(L.later)}</b><span>円</span></div>
       <div class="s">× ${L.n-1}回（初回 ${yen(L.first)}円）　頭金 ${yen(L.down)}円・ボーナス払いなし</div>
       <div class="tt"><span>${q.headLb}（税込）</span><b>${qY(k.net)}</b><span>割賦販売価格 ${qY(L.hanbai)}</span>${q.tr?`<span class="w">${esc(q.headSub)}</span>`:''}</div>
       <div class="tl"><span>${ymS(m0)}</span><i></i><span>${ymS(mE)}</span></div><div class="s2">${L.n}回（${Math.round(L.n/12*10)/10}年）・実質年率 ${L.rate}%</div></div></div>
   <div class="cmp"><div class="c1"><small>現金でお支払いの場合</small><b>${qY(k.net)}</b><span>${q.headLb}（税込）</span></div><div class="vs">または</div>
     <div class="c2"><small>ローンでお支払いの場合</small><b>${qY(L.hanbai)}</b><span>割賦販売価格（頭金 ${yen(L.down)}＋分割払い ${yen(L.total)}）</span></div></div>
   <div class="g2"><div><h3>回数の早見表 <small>実質年率 ${L.rate}%・頭金 ${yen(L.down)}円</small></h3><table class="hy"><thead><tr><th>回数</th><th>月々（2回目以降）</th><th>初回</th><th>分割手数料</th><th>割賦販売価格</th></tr></thead><tbody>${tab.map(t=>`<tr class="${t.n===L.n?'on':''}"><td>${t.n}回<small>${t.n/12}年</small></td><td class="v"><b>${yen(t.L.later)}</b></td><td class="v">${yen(t.L.first)}</td><td class="v">${yen(t.L.fee)}</td><td class="v">${yen(t.L.hanbai)}</td></tr>`).join('')}</tbody></table>
       <h3>ローンの条件（割賦販売法の表示）</h3><table class="kj">${[['現金販売価格', yen(k.cash)], ['下取車価格・残債', q.tr ? `▲${yen(k.trade)}・${yen(k.tradeLoan)}` : 'なし'], ['頭金', yen(L.down)], ['割賦元金（分割する額）', yen(L.P)], ['分割手数料', yen(L.fee)], ['実質年率', L.rate+'%'], ['お支払回数・期間', `${L.n}回（${ymS(m0)}〜${ymS(mE)}）`], ['割賦販売価格', yen(L.hanbai)]].map(r=>`<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join('')}</table></div>
     <div><h3>お支払総額の内訳</h3>${qBreak(q)}</div></div>
   <div class="ft"><div class="nt">${qNotes(q).concat(q.loanEx?['ローンは例です。信販会社の審査があり、条件（実質年率・回数）は審査の結果で変わることがあります。']:['信販会社の審査があります。']).map(t=>'※ '+esc(t)).join('<br>')}</div>
     <div class="cp"><div class="cu">${qCustLine(q)}</div>${esc(q.c.name)}${q.staff?'　担当 '+esc(q.staff):''}<br>${qTel(q)}</div></div></div>`; } },

 /* 6 プラン比較：携帯の料金プラン・結婚式場の見積の型。基本・A・B・C を横に並べ、おすすめに印。いま選んでいるプランを強調 */
 { name:'プラン比較', sub:'4つの見積を横に並べる・含む物に✓', col:'#7c3aed', render:q=>{ const P = qPlans(q), sel = q.p;
   const names = []; P.forEach(x=>x.items.forEach(it=>{ const nm = it.n; if (!names.includes(nm)) names.push(nm); }));
   const nm2 = names.filter(n=>!/メンテナンスパック|^納車整備を/.test(n)), cut = nm2.length > (q.cap||99), shown = cut ? nm2.slice(0, q.cap-1) : nm2, rest = nm2.filter(n=>!shown.includes(n));
   const cell = (x, nm) => { const it = x.items.find(i=>i.n===nm); return it ? `<i class="ok">✓</i>${it.tbd?'<small>サイズ確認後</small>':''}` : '<i class="no">—</i>'; };
   return `<div class="qv q6 ${q.tr||q.fold?'tr':''}">
   <div class="band">${qI(q,'hero','bg')}<div class="sh"></div><div class="tx"><small>${esc(q.c.name)}　お見積りのご提案</small><h1>${esc(q.title)}</h1><p>${esc(q.car.grade)}・${esc(q.yearW)}・${q.car.km.toLocaleString()}km・${esc(q.car.color)}・修復歴${esc(q.b.repair)}</p></div><div class="no">${esc(q.no)}<br>${q.date}</div></div>
   <table class="cmp"><thead><tr><th class="h"><div class="cu">${qCustLine(q)}</div><small>4つのプランからお選びいただけます</small></th>${P.map(x=>`<th class="${x.p===sel?'sel':''}">${x.p==='B'?'<em>おすすめ</em>':''}<b>${x.name}</b><small>${esc(x.sub)}</small><div class="pz">${yen(x.k.net)}<span>円</span></div><small>${q.headLb}（税込）</small></th>`).join('')}</tr></thead>
     <tbody><tr class="grp"><td colspan="5">整備と保証</td></tr><tr><td>納車整備</td>${P.map(x=>`<td class="${x.p===sel?'sel':''}">${esc(x.seibi.name)}</td>`).join('')}</tr><tr><td>保証</td>${P.map(x=>`<td class="${x.p===sel?'sel':''}">${esc(warText(q.b))}${x.items.some(i=>/延長保証/.test(i.n))?'<small>＋延長保証</small>':''}</td>`).join('')}</tr>
     <tr class="grp"><td colspan="5">含まれるもの</td></tr>${shown.map(nm=>`<tr><td>${esc(nm)}</td>${P.map(x=>`<td class="${x.p===sel?'sel':''}">${cell(x,nm)}</td>`).join('')}</tr>`).join('')}
     ${cut?`<tr class="more"><td>ほか ${rest.length}点<small>明細は別紙（2ページ目）</small></td>${P.map(x=>{ const c = x.items.filter(i=>rest.includes(i.n)).length; return `<td class="${x.p===sel?'sel':''}">${c?c+'点':'<i class="no">—</i>'}</td>`; }).join('')}</tr>`:''}
     <tr class="grp"><td colspan="5">金額</td></tr>
     ${[['車両販売価格（税込）', x=>yen(Math.floor(x.k.vehicle*1.1))], ['諸費用（税込）', x=>yen(x.k.cash-Math.floor(x.k.vehicle*1.1))], ['現金販売価格', x=>yen(x.k.cash)], ...(q.k.trade?[[qTrName(q), x=>'▲'+yen(x.k.trade)]]:[]), ...(q.k.tradeLoan?[['下取車の残債', x=>yen(x.k.tradeLoan)]]:[]), [q.headLb, x=>`<b>${yen(x.k.net)}</b>`], [q.loan?`ローン月々（頭金 ${yen(q.loan.down)}）`:'ローン月々（例）', x=>{ const L = x.k.loan || loanCalc(x.k.net, 0, S.set.loan.rate, S.set.loan.count); return yen(L.later)+'<small>'+L.n+'回・割賦 '+yen(L.hanbai)+'</small>'; }]].map(r=>`<tr class="m"><td>${r[0]}</td>${P.map(x=>`<td class="${x.p===sel?'sel':''}">${r[1](x)}</td>`).join('')}</tr>`).join('')}
     </tbody></table>
   <div class="g3">${qI(q,'dash')}${qI(q,'seat2')}${qI(q,'lug')}<div class="eq"><h3>主な装備</h3>${q.equip.map(e=>`<span>${esc(e)}</span>`).join('')}</div></div>
   <div class="ft"><div>${['どのプランも、税金・保険料・登録の費用は同じです（差は オプションと整備の内容だけ）。', (q.loan?'ローンは 実質年率 '+q.loan.rate+'%・'+q.loan.n+'回・頭金 '+yen(q.loan.down)+'円で計算しています。':'ローン月々は 実質年率 '+S.set.loan.rate+'%・頭金なしの例です。')].concat(qNotes(q)).map(t=>'※ '+esc(t)).join('<br>')}</div><div class="cp"><b>${esc(q.c.name)}</b><br>${qAddr(q)}<br>${qTel(q)}${q.staff?'<br>担当 '+esc(q.staff):''}　有効期限 ${q.valid}</div></div></div>`; } },

 /* 7 写真で見る車両の状態：カーセンサーの「状態の写真」・海外の Carvana の写真の見せ方。9枚の写真に、その写真で分かる事を書く */
 { name:'写真で見る状態', sub:'9枚の写真＋説明・状態の表・総額は下に', col:'#0369a1', render:q=>{ const k = q.k;
   const P9 = [['hero','外装　前', q.car.color], ['side','外装　横', '修復歴 '+q.b.repair], ['rear','外装　後ろ', q.yearW+'登録'], ['dash','運転席まわり', q.equip.slice(0,2).join('・')], ['seat','前の席', ''], ['seat2','後ろの席', ''], ['lug','荷室', ''], ['meter','メーター', '走行 '+q.car.km.toLocaleString()+'km（実走行）'], ['nav','ナビ・バックカメラ', q.equip.filter(e=>/ナビ|カメラ|TV/.test(e)).join('・')]];
   return `<div class="qv q7">
   <div class="hd"><div><small>${esc(q.c.name)}　お見積書</small><h1>${esc(q.title)} <span>${esc(q.car.grade)}</span></h1></div><div class="tot"><small>${q.headLb}（税込）</small><b>${qY(k.net)}</b>${qTrLine(q)}${q.loan?`<span class="lnl">ローン 月々 ${yen(q.loan.later)}円 × ${q.loan.n-1}回・頭金 ${yen(q.loan.down)}円・実質年率 ${q.loan.rate}%・割賦販売価格 ${yen(q.loan.hanbai)}円</span>`:''}</div></div>
   <div class="grid">${P9.map((x,i)=>`<figure class="qi ${i===0?'big':''}">${q.hasPh?`<img src="${q.ph(x[0])}" alt="">`:carSvg(q.car)}<figcaption><b>${i+1}　${x[1]}</b>${x[2]?`<span>${esc(x[2])}</span>`:''}</figcaption></figure>`).join('')}</div>
   <div class="g2"><div class="st"><h3>お車の状態</h3><table>${[['走行距離', q.km], ['修復歴', q.b.repair], ['車検', shakenText(q.b,k)], ['保証', k.ws?'なし（現状渡し）':warText(q.b)], ['納車整備', q.seibi.name+'（'+q.seibi.note+'）'], ['年式・色', q.yearW+'・'+q.car.color], ['型式・排気量', q.car.fmodel+'・'+ccU(q.car)], ['管理番号', q.car.num]].map(r=>`<tr><th>${r[0]}</th><td>${esc(r[1])}</td></tr>`).join('')}</table></div>
     <div class="pz"><h3>お支払総額の内訳 <small>${esc(q.planS)}</small></h3>${qBreak(q)}</div></div>
   <div class="ft"><div class="cu">${qCustLine(q)}<small>${esc(q.no)}　見積日 ${q.date}　有効期限 ${q.valid}${q.staff?'　担当 '+esc(q.staff):''}</small></div><div class="cp">${esc(q.c.name)}　${qTel(q)}<br>${qAddr(q)}　登録番号 ${esc(q.c.inv)}</div></div>
   <div class="nt">${qNotes(q).map(t=>'※ '+esc(t)).join('　')}</div></div>`; } },

 /* 8 パンフレット（お車・お金・これから）：注文住宅の提案書・旅行の旅程表の型。上半分は写真、下は3つの柱 */
 { name:'パンフレット', sub:'上半分が写真・お車／お金／これからの3本', col:'#9a3412', render:q=>{ const k = q.k;
   const steps = [['ご契約', '本見積の内容で注文書を作ります'], ['書類のご準備', qDocs(q).join('・')], ['名義変更・登録', '当店が運輸支局で手続きします'], ['納車整備', q.seibi.name+' をして仕上げます'], ['ご納車', esc(q.c.area.split('・').pop())]];
   return `<div class="qv q8">
   <div class="cover">${qI(q,'hero','bg')}<div class="card"><small>${q.cust?esc(q.cust)+' 様への':''}ご提案</small><h1>${esc(q.car.model)}</h1><p>${esc(q.car.maker)}　${esc(q.car.grade)}</p><div class="tg"><span>${esc(q.yearW)}</span><span>${q.car.km.toLocaleString()} km</span><span>${esc(q.car.color)}</span><span>修復歴 ${esc(q.b.repair)}</span></div></div>
     <div class="lg">${esc(q.c.name)}</div></div>
   <div class="sub">${qI(q,'seat')}${qI(q,'dash')}${qI(q,'lug')}</div>
   <div class="three"><section><h2><i>1</i>お車のこと</h2>${q.spec.filter(s=>/型式|排気量|車検|保証|管理/.test(s[0])).map(s=>`<div class="sp"><small>${s[0]}</small><span>${esc(s[1])}</span></div>`).join('')}<div class="eqs">${q.equip.slice(0,8).map(e=>`<span>${esc(e)}</span>`).join('')}</div></section>
     <section class="mn"><h2><i>2</i>お金のこと</h2><div class="tot"><small>${q.headLb}（税込）</small><b>${qY(k.net)}</b></div>
       ${[['車両販売価格（税込）', q.vehIn], ['諸費用（税込）', q.feesIn]].concat(q.tr?[['お支払総額', k.cash]]:[], k.trade?[[qTrName(q), -k.trade]]:[], k.tradeLoan?[['下取車の残債', k.tradeLoan]]:[]).map(r=>`<div class="sp"><small>${r[0]}</small><b>${r[1]<0?'▲'+yen(-r[1]):yen(r[1])}</b></div>`).join('')}
       <div class="det">${qBreak(q)}</div>${q.fold?`<div class="sp fo"><small>付属品・オプション ${q.nOpt}点（税抜 ${yen(q.k.optSum)}）</small><b>明細は別紙</b></div>`:''}${q.loanX?`<div class="ln">${q.loanEx?'ローンなら ':'ローン '}月々 <b>${yen(q.loanX.later)}</b> 円${q.loanEx?'〜':''}<small>${q.loanX.n}回・頭金 ${yen(q.loanX.down)}円・実質年率 ${q.loanX.rate}%・割賦販売価格 ${yen(q.loanX.hanbai)}円${q.loanEx?'（例）':''}</small></div>`:''}</section>
     <section><h2><i>3</i>これからのこと</h2><ol class="steps">${steps.map(s=>`<li><b>${s[0]}</b><span>${s[1]}</span></li>`).join('')}</ol></section></div>
   <div class="ft"><div>${esc(q.no)}　見積日 ${q.date}　有効期限 ${q.valid}${q.staff?'　担当 '+esc(q.staff):''}<br>${qNotes(q).slice(0,3).map(esc).join(' ')}</div><div class="cp"><b>${esc(q.c.name)}</b><br>${qAddr(q)}　${qTel(q)}</div></div></div>`; } },

 /* 9 はじめての方へ（説明つき）：保険の設計書・携帯の料金の説明の型。1行ずつ「これは何の費用か」を書く */
 { name:'説明つき', sub:'1行ずつ「何の費用か」・課税／立替の札', col:'#4d7c0f', render:q=>{ const k = q.k;
   const pie = [['車両販売価格', q.vehIn, '#4d7c0f'], ['販売諸費用（税込）', q.feesIn - (k.taxIns + q.sumT), '#a3c46a'], ['税金・保険・預託金', k.taxIns + q.sumT, '#d9e7c0']];
   return `<div class="qv q9">
   <div class="hd"><h1>お見積書<small>はじめての方にも分かるように、1行ずつ説明を付けています</small></h1><div class="m">${esc(q.no)}<br>見積日 ${q.date}<br>有効期限 ${q.valid}</div></div>
   <div class="top">${qI(q,'hero','ph')}<div class="r"><div class="cu">${qCustLine(q)}</div><div class="car"><b>${esc(q.title)}</b>　${esc(q.car.grade)}<br><small>${esc(q.yearW)}・${q.km}・${esc(q.car.color)}・修復歴${esc(q.b.repair)}</small></div>
       <div class="tot"><small>${q.headLb}（税込）</small><b>${qY(k.net)}</b><p>${q.tr ? esc(q.headSub) : 'この金額で、ナンバーが付いて乗り出せます'}</p>${q.loan?`<p class="ln">ローン 月々 <b>${yen(q.loan.later)}</b>円 × ${q.loan.n-1}回（頭金 ${yen(q.loan.down)}円・実質年率 ${q.loan.rate}%・割賦販売価格 ${yen(q.loan.hanbai)}円）</p>`:''}</div>
       <div class="bar">${pie.map(p=>`<i style="flex:${Math.max(1,p[1])};background:${p[2]}"></i>`).join('')}</div><div class="lg">${pie.map(p=>`<span><i style="background:${p[2]}"></i>${p[0]} ${yen(p[1])}</span>`).join('')}</div></div></div>
   <div class="inc">${[[I('wrench','🔧',18),'納車整備', q.seibi.name], [I('shield','🛡',18),'保証', k.ws?'なし':warText(q.b)], [I('file','📄',18),'登録の手続き', '当店で代行'], [I('receipt','🧾',18),'税金・保険', '登録に要る分を含む']].map(x=>`<div><i>${x[0]}</i><b>${x[1]}</b><span>${esc(x[2])}</span></div>`).join('')}</div>
   <h3>お見積の内訳と説明</h3>${qBreak(q,{tag:1,desc:1,loan:1})}
   <div class="qa"><div><b>「課税」「立替」とは？</b>課税＝当店の売上で消費税がかかる物。立替＝国・県・保険会社などへ当店が代わりに納める物で、消費税はかかりません。</div><div><b>この金額のほかに要る物は？</b>任意保険（自動車保険）とガソリン代は含みません。${q.opts.some(o=>o.tbd)?'「'+OPT_TBD+'」の品もまだ入っていません。':''}</div></div>
   <div class="ft"><div class="nt">${qNotes(q).map(t=>'※ '+esc(t)).join('<br>')}</div><div class="cp"><b>${esc(q.c.name)}</b><br>${qAddr(q)}<br>${qTel(q)}${q.staff?'<br>担当 '+esc(q.staff):''}</div></div></div>`; } },

 /* 10 インボイス（Stripe・freee の請求書の型）：明細の表・税率ごとの集計・登録番号。法人のお客様・経理向け */
 { name:'インボイス', sub:'Stripe・会計ソフトの型・税率ごとの集計', col:'#4338ca', render:q=>{ const k = q.k;
   const L = [['車両本体価格（'+q.car.num+'）', 1, k.body, '10%']].concat(k.disc?[['お値引き', 1, -k.disc, '10%']]:[], q.opts1.filter(o=>!o.tbd).map(o=>[o.fold ? o.n+'（明細は別紙）' : o.n.replace(/^\s*└\s*/,'　└ '), 1, o.a||0, '10%']), q.feesK.map(r=>[r[0], 1, r[1], '10%']), q.taxes.map(r=>[r[0], 1, r[1], '非課税']), q.feesT.map(r=>[r[0], 1, r[1], '非課税']), [['リサイクル預託金相当額', 1, k.nonTax, '対象外']]);
   const t10 = k.vehicle + q.sumK;
   return `<div class="qv q10">
   <div class="hd"><div class="lg"><b>${esc(q.c.name)}</b></div><div class="ti">見積書</div></div>
   <div class="meta"><div><small>見積番号</small>${esc(q.no)}</div><div><small>発行日</small>${q.date}</div><div><small>有効期限</small>${q.valid}</div><div><small>担当</small>${esc(q.staff)}</div></div>
   <div class="pt"><div><small>宛先</small><div class="cu">${qCustLine(q)}</div></div><div><small>発行元</small><b>${esc(q.c.name)}</b><br>${qAddr(q)}<br>${qTel(q)}<br>登録番号 ${esc(q.c.inv)}</div></div>
   <div class="due"><div><small>${q.headLb}（税込）</small><b>${qY(k.net)}</b>${qTrLine(q)}</div><span>${q.loan?`ローン 月々 ${yen(q.loan.later)}円 × ${q.loan.n-1}回・頭金 ${qY(q.loan.down)}`:'お振込'}<br>${q.valid} まで有効</span></div>
   <div class="car">${qI(q,'hero')}<div><b>${esc(q.title)} ${esc(q.car.grade)}</b><span>${esc(q.yearW)}・${q.km}・${esc(q.car.color)}・修復歴${esc(q.b.repair)}</span><span>型式 ${esc(q.car.fmodel)}・${ccU(q.car)}・車検 ${esc(shakenText(q.b,k))}</span><span>保証 ${esc(k.ws?'なし':warText(q.b))}・${esc(q.seibi.name)}</span></div>${qI(q,'dash')}${qI(q,'seat2')}</div>
   <table class="it"><thead><tr><th>内容</th><th class="v">数量</th><th class="v">単価</th><th class="v">税率</th><th class="v">金額</th></tr></thead><tbody>${L.map(r=>`<tr><td>${esc(r[0])}</td><td class="v">${r[1]}</td><td class="v">${r[2]<0?'▲'+yen(-r[2]):yen(r[2])}</td><td class="v"><span class="tx t${r[3]==='10%'?1:r[3]==='非課税'?2:3}">${r[3]}</span></td><td class="v">${r[2]<0?'▲'+yen(-r[2]):yen(r[2])}</td></tr>`).join('')}
     ${q.opts1.filter(o=>o.tbd).map(o=>`<tr class="tbd"><td>${esc(o.n)}</td><td class="v">1</td><td class="v" colspan="3">${OPT_TBD}</td></tr>`).join('')}</tbody></table>
   <div class="sm"><div class="bank"><small>お振込先</small>${esc(q.c.bank)}<br><small>振込手数料はお客様のご負担でお願いします</small></div>
     <table><tr><td>10%対象 小計</td><td class="v">${yen(t10)}</td></tr><tr><td>消費税（10%）</td><td class="v">${yen(k.ctax)}</td></tr><tr><td>非課税（税金・保険料・法定費用）</td><td class="v">${yen(k.taxIns + q.sumT - k.nonTax)}</td></tr><tr><td>対象外（リサイクル預託金）</td><td class="v">${yen(k.nonTax)}</td></tr>
       ${q.tr?`<tr class="s"><td>お支払総額（現金販売価格）</td><td class="v">${yen(k.cash)}</td></tr>`:''}${k.trade?`<tr><td>${qTrName(q)}</td><td class="v">▲${yen(k.trade)}</td></tr>`:''}${k.tradeLoan?`<tr><td>下取車の残債</td><td class="v">${yen(k.tradeLoan)}</td></tr>`:''}<tr class="t"><td>${q.headLb}</td><td class="v">${qY(k.net)}</td></tr></table></div>
   <div class="nt">${(q.loan?[qPay(q)]:[]).concat(qNotes(q)).map(esc).join('<br>')}</div>
   <div class="ft"><span>${esc(q.c.name)}</span><span>${esc(q.no)}</span><span>1 / ${q.fold?2:1}</span></div></div>`; } },
];

/* 1枚目に並べられる OP の行数（形ごと）。超えたら1行にまとめて2ページ目（別紙）へ。⑥は品の数・⑧はもともと内訳の行を出さない */
/* 2ページ目（別紙）＝形ごとに1ページ目と同じ作り（🗣 2026-10-13「2P目があるのはいいが、もっと各デザインに合わせて個別に作成して」）
   どの形も：付属品・オプションの明細（全部）＋その形の言い方で合計・お支払い。q2.foldNote＝内訳の「OP N点」の行の注記 */
const qOptRows = q => { let no = 0; return q.opts.map(o=>({ no: o.sub ? '' : ++no, n: o.n.replace(/^\s*└\s*/,''), sub: o.sub, tbd: o.tbd, a: o.tbd ? 0 : (+o.a||0), amt: o.tbd ? OPT_TBD : qOptAmt(o), ex: qExpl(o.n) })); };
/* 本体＋取付工賃のように親子の行を1つにまとめる（カード・箇条書きの形で使う） */
const qOptGroups = q => qOptRows(q).reduce((L, r)=>{ if (r.sub && L.length) L[L.length-1].subs.push(r); else L.push(Object.assign({ subs: [] }, r)); return L; }, []);
const qAmtTd = r => r.tbd ? `<span class="tbd">${OPT_TBD}</span>` : r.amt;
const qOptIn = q => Math.floor(q.k.optSum * 1.1);   // 税込の目安（消費税は合計で1回なので目安）
const qP2no = q => `<span class="pg">2 / 2</span>`;
const QV_P2 = [
 /* 1 ショールーム：細い写真の帯・明朝の見出し・金の線。左に品、右に総額のカードと内訳 */
 q=>{ const k = q.k;
   return `<div class="qv q1 p2">
   <div class="hero sm">${qI(q,'dash')}<div class="shade"></div>
     <div class="top"><span class="co">${esc(q.c.name)}</span><span class="doc">お見積書 別紙　<small>${esc(q.no)}</small></span></div>
     <div class="name"><small>${esc(q.car.maker)}　${esc(q.car.model)}　${esc(q.car.grade)}</small><h1>付属品・オプション</h1></div></div>
   <div class="body p2b"><div class="l"><h3>お選びいただいた品 <small>${q.nOpt}点・税抜</small></h3>
       ${qOptGroups(q).map(g=>`<div class="op"><span><b>${esc(g.n)}</b>${g.ex?`<em>${esc(g.ex)}</em>`:''}${g.subs.map(s=>`<i>└ ${esc(s.n)}　${qAmtTd(s)}</i>`).join('')}</span><b>${qAmtTd(g)}</b></div>`).join('')}
       <div class="op tt"><span>付属品・オプション 合計（税抜）</span><b>${yen(k.optSum)}</b></div></div>
     <div class="r"><div class="tot"><small>${q.headLb}<span>消費税込</span></small><b>${qY(k.net)}</b><div class="eq"><span>車両販売価格 ${yen(q.vehIn)}</span><span>諸費用 ${yen(q.feesIn)}</span>${qTrLine(q)}</div>${q.loan?`<div class="ln"><b>月々 ${yen(q.loan.later)}円</b><span>× ${q.loan.n-1}回（初回 ${yen(q.loan.first)}円）・頭金 ${yen(q.loan.down)}円<br>実質年率 ${q.loan.rate}%・割賦販売価格 ${yen(q.loan.hanbai)}円</span></div>`:''}</div>
       <h3>お見積の内訳</h3>${qBreak(q,{note:1})}</div></div>
   <div class="foot"><div class="who"><div class="cu">${qCustLine(q)}</div><div class="m">見積日 ${q.date}　有効期限 ${q.valid}${q.staff?'　担当 '+esc(q.staff):''}</div></div>
     <div class="cp"><b>${esc(q.c.name)}</b>${qAddr(q)}<br>${qTel(q)}　${qP2no(q)}</div></div>
   <div class="notes">${qNotes(q).map(n=>`<span>※ ${esc(n)}</span>`).join('')}</div></div>`; },

 /* 2 チラシ：赤い線・縦の札「別紙」・写真の帯・黒い見出しの概要の表 */
 q=>{ const k = q.k;
   return `<div class="qv q2 p2">
   <div class="hd"><div class="tl"><span class="kd">別紙</span><div><h1>付属品・オプション <span>明細</span></h1><p>${esc(q.title)} ${esc(q.car.grade)}　${esc(q.yearW)}　走行 ${q.car.km.toLocaleString()}km　${esc(q.car.color)}　見積番号 ${esc(q.no)}</p></div></div>
     <div class="pz"><small>${q.headLb}<span>（税込）</span></small><b>${Math.floor(k.net/10000).toLocaleString()}<em>.${String(Math.floor(k.net%10000/1000))}</em><i>万円</i></b><div class="s">付属品・オプション ${q.nOpt}点 ${(k.optSum/10000).toFixed(1)}万円（税抜）を含む</div></div></div>
   <div class="strip">${qI(q,'nav','','ナビ・カメラ')}${qI(q,'seat','','前の席')}${qI(q,'lug','','荷室')}${qI(q,'wheel','','タイヤ・ホイール')}</div>
   <div class="gaiyo og"><div class="gh">付属品・オプション明細（${q.nOpt}点）</div><div class="gh g2h">価格の内訳</div>
     <table class="ot"><thead><tr><th>No.</th><th>品名</th><th class="v">金額（税抜）</th></tr></thead><tbody>${qOptRows(q).map(r=>`<tr class="${r.sub?'sub':''}"><td class="no">${r.no}</td><td>${r.sub?'└ ':''}${esc(r.n)}</td><td class="v">${qAmtTd(r)}</td></tr>`).join('')}</tbody>
       <tfoot><tr><td></td><td>合計（税抜）</td><td class="v">${yen(k.optSum)}</td></tr></tfoot></table>
     <div class="bk">${qBreak(q,{loan:1})}</div></div>
   <div class="nt">${qNotes(q).map(esc).join('　')}</div>
   <div class="ft"><div class="lb">販売店</div><div class="cp"><b>${esc(q.c.name)}</b><span>${qAddr(q)}　${qTel(q)}</span><span>${qReg(q)}${q.staff?'　担当 '+esc(q.staff):''}</span></div><div class="cu">${qCustLine(q)}<small>${qP2no(q)}</small></div></div></div>`; },

 /* 3 注文の確認：白・中央の見出し・✓の一覧・灰色の角丸の合計 */
 q=>{ const k = q.k;
   return `<div class="qv q3 p2">
   <div class="hd"><b>${esc(q.c.name)}</b><span>お見積り　${esc(q.no)}　${qP2no(q)}</span></div>
   <div class="nm"><h1>付属品・オプション</h1><p>${esc(q.car.model)}　${esc(q.car.grade)}　·　${q.nOpt}点を選んでいます</p></div>
   <div class="cols"><div class="l"><h3>選んだもの</h3>${qOptGroups(q).map(g=>`<div class="it big"><i>✓</i><span>${esc(g.n)}${g.ex?`<small>${esc(g.ex)}</small>`:''}${g.subs.map(s=>`<small class="s">＋ ${esc(s.n)}　${qAmtTd(s)}</small>`).join('')}</span><b>${qAmtTd(g)}</b></div>`).join('')}
       <div class="it tt"><i></i><span>付属品・オプション 合計（税抜）</span><b>${yen(k.optSum)}</b></div></div>
     <div class="r">${qI(q,'dash','hero2')}<h3>お支払い</h3><div class="sum"><div><span>車両販売価格（税込）</span><b>${qY(q.vehIn)}</b></div><div class="in"><span>うち付属品・オプション（税込の目安）</span><b>${qY(qOptIn(q))}</b></div><div><span>諸費用（税込）</span><b>${qY(q.feesIn)}</b></div>${q.tr?`<div class="st"><span>お支払総額</span><b>${qY(k.cash)}</b></div>`:''}${k.trade?`<div><span>${qTrName(q)}</span><b>▲${qY(k.trade)}</b></div>`:''}${k.tradeLoan?`<div><span>下取車の残債</span><b>${qY(k.tradeLoan)}</b></div>`:''}
       <div class="tt"><span>${q.headLb}</span><b>${qY(k.net)}</b></div><p class="tx">消費税 ${qY(k.ctax)} を含みます</p></div>
       ${q.loanX?`<div class="ln"><small>${q.loanEx?'ローンをご利用の場合（例）':'ローン'}</small><b>月々 ${qY(q.loanX.later)}</b><span>${q.loanX.n}回・頭金 ${yen(q.loanX.down)}・実質年率 ${q.loanX.rate}%・割賦販売価格 ${yen(q.loanX.hanbai)}</span></div>`:''}</div></div>
   <div class="ft"><div>${qNotes(q).map(esc).join('<br>')}</div><div class="cp">${esc(q.c.name)}<br>${qAddr(q)}<br>${qTel(q)}<br>登録番号 ${esc(q.c.inv)}</div></div></div>`; },

 /* 4 正式な見積書：「御見積書（別紙）」・宛名と件名の表・No. つきの明細（区分・数量・単価）・備考と社印 */
 q=>{ const k = q.k;
   return `<div class="qv q4 p2"><h1>御 見 積 書<small>（別紙）</small></h1>
   <table class="mt hd2"><tr><th>見積番号</th><td>${esc(q.no)}</td><th>見積日</th><td>${q.date}</td><th>有効期限</th><td>${q.valid}</td></tr><tr><th>宛名</th><td colspan="3">${qCustLine(q)}</td><th>担当</th><td>${esc(q.staff)}</td></tr><tr><th>件名</th><td colspan="5">中古車 ${esc(q.title)} ${esc(q.car.grade)}（${esc(q.car.num)}）のご購入　付属品・オプションの明細</td></tr></table>
   <table class="it"><thead><tr><th class="no">No.</th><th>品名</th><th class="kb">区分</th><th class="kb">数量</th><th class="v">単価（円）</th><th class="v">金額（円）</th><th class="nt">摘要</th></tr></thead><tbody>
     ${qOptRows(q).map(r=>`<tr><td class="no">${r.no}</td><td>${r.sub?'　└ ':''}${esc(r.n)}</td><td class="kb">課税</td><td class="kb">1</td><td class="v">${r.tbd?'—':yen(r.a)}</td><td class="v">${r.tbd?'—':yen(r.a)}</td><td class="nt">${r.tbd?OPT_TBD:!r.a?'サービス':''}</td></tr>`).join('')}
     <tr class="st"><td></td><td>付属品・オプション 小計（税抜）</td><td></td><td class="kb">${q.nOpt}点</td><td></td><td class="v">${yen(k.optSum)}</td><td class="nt">1枚目の「車両販売価格」に含む</td></tr>
     <tr class="gt"><td></td><td>${q.tr?'差引お支払額':'御見積金額'}（1枚目と同じ）</td><td></td><td></td><td></td><td class="v">${yen(k.net)}</td><td class="nt">消費税 ${yen(k.ctax)} を含む</td></tr></tbody></table>
   <div class="bm"><div class="bx"><div class="h">備考</div><div>・本紙は 見積番号 ${esc(q.no)} の御見積書の別紙です。</div><div>・付属品・オプションの金額は税抜です。消費税は1枚目で合計に対して計算しています。</div>${qNotes(q).slice(3).map(t=>`<div>・${esc(t)}</div>`).join('')}</div>
     <div class="bx cpb"><div class="h">販売店</div><div class="cp"><b>${esc(q.c.name)}</b>${qAddr(q)}<br>${qTel(q)}<br>登録番号 ${esc(q.c.inv)}${qStamp('社印')}</div></div></div>
   <div class="pgl">${qP2no(q)}</div></div>`; },

 /* 5 月々のお支払い：緑の見出し・「月々にするといくら」の比較・品ごとの月々の目安 */
 q=>{ const k = q.k, L = q.loanX, per = L && L.P ? L.later / L.P : 0, mo = a => Math.round(a * 1.1 * per / 10) * 10;
   return `<div class="qv q5 p2">
   <div class="hd"><div><b>${esc(q.c.name)}</b><span>付属品・オプションの明細</span></div><div class="m">${esc(q.no)}　${qP2no(q)}<br>${esc(q.title)} ${esc(q.car.grade)}</div></div>
   <div class="cmp"><div class="c1"><small>付属品・オプション ${q.nOpt}点</small><b>${qY(k.optSum)}</b><span>税抜（税込の目安 ${yen(qOptIn(q))}）</span></div><div class="vs">月々に<br>すると</div>
     <div class="c2"><small>${q.loanEx?'ローンをご利用の場合（例）':'ローン'}・${L?L.n:''}回</small><b>約 ${L?yen(mo(k.optSum)):'—'} 円</b><span>月々のうち付属品・オプションの分（目安）</span></div></div>
   <div class="g2"><div><h3>付属品・オプション <small>金額は税抜・月々は目安</small></h3><table class="hy op"><thead><tr><th>品名</th><th>金額</th><th>月々の目安</th></tr></thead><tbody>${qOptRows(q).map(r=>`<tr class="${r.sub?'sub':''}"><td>${r.sub?'└ ':''}${esc(r.n)}</td><td class="v">${qAmtTd(r)}</td><td class="v">${r.tbd||!r.a?'—':'約 '+yen(mo(r.a))}</td></tr>`).join('')}</tbody>
       <tfoot><tr><td>合計</td><td class="v">${yen(k.optSum)}</td><td class="v">約 ${L?yen(mo(k.optSum)):'—'}</td></tr></tfoot></table></div>
     <div><h3>お支払い</h3><div class="mo2"><small>${q.headLb}（税込）</small><b>${qY(k.net)}</b>${q.tr?`<span>${esc(q.headSub)}</span>`:''}${L?`<div class="lnb"><span>月々</span><b>${yen(L.later)}</b><span>円 × ${L.n-1}回（初回 ${yen(L.first)}円）</span></div><span>頭金 ${yen(L.down)}円・実質年率 ${L.rate}%・割賦販売価格 ${yen(L.hanbai)}円</span>`:''}</div>
       <h3>お支払総額の内訳</h3>${qBreak(q)}</div></div>
   <div class="ft"><div class="nt">${qNotes(q).concat(['月々の目安は、ローンの月々を金額の割合で分けた物です（実際は合計で計算します）。']).map(t=>'※ '+esc(t)).join('<br>')}</div>
     <div class="cp"><div class="cu">${qCustLine(q)}</div>${esc(q.c.name)}${q.staff?'　担当 '+esc(q.staff):''}<br>${qTel(q)}</div></div></div>`; },

 /* 6 プラン比較：紫の細い写真の帯・1ページ目と同じプランの見出し・品ごとの金額 */
 q=>{ const P = qPlans(q), sel = q.p, names = []; P.forEach(x=>x.all.forEach(it=>{ if (!names.includes(it.n)) names.push(it.n); }));
   const td = (x, inner) => `<td class="${x.p===sel?'sel':''}">${inner}</td>`;
   return `<div class="qv q6 p2">
   <div class="band sm">${qI(q,'dash','bg')}<div class="sh"></div><div class="tx"><small>${esc(q.c.name)}　お見積りのご提案　別紙</small><h1>付属品・オプションの金額</h1><p>${esc(q.title)} ${esc(q.car.grade)}・プランごとの品と金額（税抜）</p></div><div class="no">${esc(q.no)}<br>${qP2no(q)}</div></div>
   <table class="cmp"><thead><tr><th class="h"><div class="cu">${qCustLine(q)}</div></th>${P.map(x=>`<th class="${x.p===sel?'sel':''}">${x.p==='B'?'<em>おすすめ</em>':''}<b>${x.name}</b><small>${esc(x.sub)}</small><div class="pz">${yen(x.k.net)}<span>円</span></div><small>${q.headLb}（税込）</small></th>`).join('')}</tr></thead>
     <tbody><tr class="grp"><td colspan="5">付属品・オプション</td></tr>${names.map(nm=>`<tr class="${/^\s*└/.test(nm)?'sub':''}"><td>${esc(String(nm).replace(/^\s*└\s*/,'└ '))}</td>${P.map(x=>{ const it = x.all.find(a=>a.n===nm); return td(x, it ? (it.tbd ? '<small>サイズ確認後</small>' : yen(+it.a||0)) : '<i class="no">—</i>'); }).join('')}</tr>`).join('')}
     <tr class="grp"><td colspan="5">合計</td></tr><tr class="m"><td>付属品・オプション（税抜）</td>${P.map(x=>td(x, yen(x.k.optSum))).join('')}</tr><tr class="m"><td>点数</td>${P.map(x=>td(x, x.items.length+'点')).join('')}</tr><tr class="m"><td>${q.headLb}（税込）</td>${P.map(x=>td(x, `<b>${yen(x.k.net)}</b>`)).join('')}</tr></tbody></table>
   <div class="ft"><div>${['金額は税抜です。消費税は1枚目で合計に対して計算しています。'].concat(qNotes(q)).map(t=>'※ '+esc(t)).join('<br>')}</div><div class="cp"><b>${esc(q.c.name)}</b><br>${qAddr(q)}<br>${qTel(q)}${q.staff?'<br>担当 '+esc(q.staff):''}　有効期限 ${q.valid}</div></div></div>`; },

 /* 7 写真で見る状態：青の見出し・品をカード（番号・説明・金額）で並べる・残りの写真 */
 q=>{ const k = q.k;
   return `<div class="qv q7 p2">
   <div class="hd"><div><small>${esc(q.c.name)}　お見積書 別紙　${qP2no(q)}</small><h1>付属品・オプション <span>${esc(q.title)} ${esc(q.car.grade)}</span></h1></div><div class="tot"><small>${q.headLb}（税込）</small><b>${qY(k.net)}</b>${qTrLine(q)}</div></div>
   <div class="cards">${qOptGroups(q).map(g=>`<div class="cd"><i>${g.no}</i><div><b>${esc(g.n)}</b>${g.ex?`<span>${esc(g.ex)}</span>`:''}${g.subs.map(s=>`<span class="s">＋ ${esc(s.n)} ${qAmtTd(s)}</span>`).join('')}</div><em>${qAmtTd(g)}</em></div>`).join('')}</div>
   <div class="g2"><div class="st"><h3>お車の写真</h3><div class="ph2">${qI(q,'nav','','ナビ・カメラ')}${qI(q,'wheel','','タイヤ・ホイール')}</div><div class="osum"><span>付属品・オプション ${q.nOpt}点（税抜）</span><b>${yen(k.optSum)}</b></div></div>
     <div class="pz"><h3>お支払総額の内訳 <small>${esc(q.planS)}</small></h3>${qBreak(q)}</div></div>
   <div class="ft"><div class="cu">${qCustLine(q)}<small>${esc(q.no)}　見積日 ${q.date}　有効期限 ${q.valid}${q.staff?'　担当 '+esc(q.staff):''}</small></div><div class="cp">${esc(q.c.name)}　${qTel(q)}<br>${qAddr(q)}　登録番号 ${esc(q.c.inv)}</div></div>
   <div class="nt">${qNotes(q).map(t=>'※ '+esc(t)).join('　')}</div></div>`; },

 /* 8 パンフレット：表紙の小さい版・「4 付属品・オプションのこと」と「2 お金のこと（全体）」の2本 */
 q=>{ const k = q.k;
   return `<div class="qv q8 p2">
   <div class="cover sm">${qI(q,'seat','bg')}<div class="card"><small>${q.cust?esc(q.cust)+' 様への':''}ご提案　別紙</small><h1>付属品・オプション</h1><p>${esc(q.car.maker)}　${esc(q.car.model)}　${esc(q.car.grade)}</p></div><div class="lg">${esc(q.c.name)}</div></div>
   <div class="three two"><section><h2><i>1</i>付属品・オプションのこと <small>${q.nOpt}点・税抜</small></h2><ol class="ops">${qOptGroups(q).map(g=>`<li><div><b>${esc(g.n)}</b>${g.ex?`<span>${esc(g.ex)}</span>`:''}${g.subs.map(s=>`<span>＋ ${esc(s.n)} ${qAmtTd(s)}</span>`).join('')}</div><em>${qAmtTd(g)}</em></li>`).join('')}</ol><div class="osum"><span>合計（税抜）</span><b>${yen(k.optSum)}</b></div></section>
     <section class="mn"><h2><i>2</i>お金のこと（全体）</h2><div class="tot"><small>${q.headLb}（税込）</small><b>${qY(k.net)}</b></div>
       ${[['車両販売価格（税込）', q.vehIn], ['うち付属品・オプション（税込の目安）', qOptIn(q)], ['諸費用（税込）', q.feesIn]].concat(q.tr?[['お支払総額', k.cash]]:[], k.trade?[[qTrName(q), -k.trade]]:[], k.tradeLoan?[['下取車の残債', k.tradeLoan]]:[]).map(r=>`<div class="sp"><small>${r[0]}</small><b>${r[1]<0?'▲'+yen(-r[1]):yen(r[1])}</b></div>`).join('')}
       <div class="det">${qBreak(q)}</div>${q.loanX?`<div class="ln">${q.loanEx?'ローンなら ':'ローン '}月々 <b>${yen(q.loanX.later)}</b> 円${q.loanEx?'〜':''}<small>${q.loanX.n}回・頭金 ${yen(q.loanX.down)}円・実質年率 ${q.loanX.rate}%・割賦販売価格 ${yen(q.loanX.hanbai)}円${q.loanEx?'（例）':''}</small></div>`:''}</section></div>
   <div class="ft"><div>${esc(q.no)}　見積日 ${q.date}　有効期限 ${q.valid}${q.staff?'　担当 '+esc(q.staff):''}　${qP2no(q)}<br>${qNotes(q).slice(0,3).map(esc).join(' ')}</div><div class="cp"><b>${esc(q.c.name)}</b><br>${qAddr(q)}　${qTel(q)}</div></div></div>`; },

 /* 9 説明つき：緑・4つの数字の札・1行ずつ説明つきの明細・まとめの内訳は2段 */
 q=>{ const k = q.k, nt = q.opts.filter(o=>o.tbd).length;
   return `<div class="qv q9 p2">
   <div class="hd"><h1>お見積書（別紙）<small>付属品・オプションを1つずつ説明しています</small></h1><div class="m">${esc(q.no)}　${qP2no(q)}<br>${esc(q.title)} ${esc(q.car.grade)}<br>${qCustLine(q)}</div></div>
   <div class="inc">${[[I('box','📦',18),'点数', q.nOpt+'点'], [I('receipt','🧾',18),'合計（税抜）', yen(k.optSum)+'円'], [I('calculator','🧮',18),'税込の目安', yen(qOptIn(q))+'円'], [I('ruler','📏',18),'サイズ確認後に決める品', nt ? nt+'点（金額は未定）' : 'なし']].map(x=>`<div><i>${x[0]}</i><b>${x[1]}</b><span>${x[2]}</span></div>`).join('')}</div>
   <h3>付属品・オプションの内訳と説明</h3>
   <div class="qb op"><div class="g"><div class="gh"><span>付属品・オプション<i class="tg">課税</i></span><b>${yen(k.optSum)}</b></div>${qOptRows(q).map(r=>`<div class="gr ${r.sub?'sub':''}"><span>${esc(r.n)}<em>${esc(r.ex)}</em></span><b>${qAmtTd(r)}</b></div>`).join('')}</div></div>
   <h3>お見積の内訳（まとめ）</h3><div class="two">${qBreak(q,{tag:1,loan:1})}</div>
   <div class="ft"><div class="nt">${qNotes(q).map(t=>'※ '+esc(t)).join('<br>')}</div><div class="cp"><b>${esc(q.c.name)}</b><br>${qAddr(q)}<br>${qTel(q)}${q.staff?'<br>担当 '+esc(q.staff):''}</div></div></div>`; },

 /* 10 インボイス：1枚目の続き＝同じ見出し・同じ明細の表・同じ集計の表・「2 / 2」 */
 q=>{ const k = q.k, t10 = k.vehicle + q.sumK;
   return `<div class="qv q10 p2">
   <div class="hd"><div class="lg"><b>${esc(q.c.name)}</b></div><div class="ti">見積書<small>明細の続き</small></div></div>
   <div class="meta"><div><small>見積番号</small>${esc(q.no)}</div><div><small>発行日</small>${q.date}</div><div><small>宛先</small>${qCustLine(q)}</div><div><small>お車</small>${esc(q.car.model)}（${esc(q.car.num)}）</div></div>
   <table class="it"><thead><tr><th>付属品・オプション</th><th class="v">数量</th><th class="v">単価</th><th class="v">税率</th><th class="v">金額</th></tr></thead><tbody>${qOptRows(q).map(r=>r.tbd?`<tr class="tbd"><td>${esc(r.n)}</td><td class="v">1</td><td class="v" colspan="3">${OPT_TBD}</td></tr>`:`<tr><td>${r.sub?'　└ ':''}${esc(r.n)}</td><td class="v">1</td><td class="v">${yen(r.a)}</td><td class="v"><span class="tx t1">10%</span></td><td class="v">${yen(r.a)}</td></tr>`).join('')}</tbody>
     <tfoot><tr><td colspan="4">付属品・オプション 小計（${q.nOpt}点）</td><td class="v">${yen(k.optSum)}</td></tr></tfoot></table>
   <div class="sm"><div class="bank"><small>お振込先</small>${esc(q.c.bank)}<br><small>振込手数料はお客様のご負担でお願いします</small></div>
     <table><tr><td>10%対象 小計</td><td class="v">${yen(t10)}</td></tr><tr><td>消費税（10%）</td><td class="v">${yen(k.ctax)}</td></tr><tr><td>非課税（税金・保険料・法定費用）</td><td class="v">${yen(k.taxIns + q.sumT - k.nonTax)}</td></tr><tr><td>対象外（リサイクル預託金）</td><td class="v">${yen(k.nonTax)}</td></tr>
       ${q.tr?`<tr class="s"><td>お支払総額（現金販売価格）</td><td class="v">${yen(k.cash)}</td></tr>`:''}${k.trade?`<tr><td>${qTrName(q)}</td><td class="v">▲${yen(k.trade)}</td></tr>`:''}${k.tradeLoan?`<tr><td>下取車の残債</td><td class="v">${yen(k.tradeLoan)}</td></tr>`:''}<tr class="t"><td>${q.headLb}</td><td class="v">${qY(k.net)}</td></tr></table></div>
   <div class="nt">${(q.loan?[qPay(q)]:[]).concat(qNotes(q)).map(esc).join('<br>')}</div>
   <div class="ft"><span>${esc(q.c.name)}</span><span>${esc(q.no)}</span><span>2 / 2</span></div></div>`; },
];
/* 見本の条件（モックだけ）：下取・ローン・OP が多い時。数字は見本 */
const QS_MANY = [['フロアマット（車種専用）',19800],['サイドバイザー',16500],['ETC2.0車載器',19800],['　└ 取付工賃（標準取付）',10000],['スタッドレスタイヤ・ホイール 4本セット',118000],['　└ 組替・バランス工賃',8800],
  ['ガラス撥水コーティング（全面）',6600],['ヘッドライト磨き・コーティング',11000],['室内クリーニング（シート洗浄）',22000],['ナビの地図更新',16500],['盗難防止装置',88000],['　└ 取付工賃',22000],['ホイールコーティング',8800],['ナンバーフレーム（前後）',3300]];
function qsMk(car, who, p){ const u = S.ui;
  const ctx = Object.assign({}, who ? custCtx(car, who, p) : (p==='base' ? { car, b:car.base, plan:null } : stdCtx(car, p)));
  if (u.qsTr) { ctx.trade = 300000; ctx.tradeLoan = u.qsTr==='trl' ? 180000 : 0; }
  if (u.qsPay==='loan') Object.assign(ctx, { pay:'loan', down:300000, rate:S.set.loan.rate, count:S.set.loan.count });
  if (u.qsOp==='many' && ctx.plan && ctx.items) ctx.items = ctx.items.concat(QS_MANY.map((x,j)=>({ key:'qsm'+j, base:x[0], n:x[0], a:x[1], calcA:x[1], in:{A:1,B:1,C:1} })));
  return ctx; }
/* =====================================================================
   帳票の種類ごとのサンプル（🗣 2026-10-13「6のプラン比較は別枠に入れて、いままでのモックに入っていた見積を6番に。それ以外の装備詳細・旧6番のプラン比較・
     売買契約書（横ベースのやつ）・約款等の帳票類も、見積サンプルと同じレベルのガチの作りこみでサンプルをそれぞれ複数パターン」）
   どの種類も 1番＝いまのモックの帳票（比べる用・見積タブで刷っている物そのまま）。2番から＝新しい形。中身は見積と同じ計算（qvData）
   家族の型（どの種類にも同じ考え方の形を置く）：ショールーム＝黒×金・明朝・写真／正式な帳票＝深緑の罫線・印の枠／モダン＝灰色と藍・余白・角丸
   ===================================================================== */
/* ---------- 共通の部品（帳票） ---------- */
const qSeal = (t) => `<span class="seal2">${t||'小林<br>モータ<br>ース印'}</span>`;
const qLine = (w) => `<span class="wl" style="min-width:${w||140}px"></span>`;
const qOrdNo = q => q.o ? `${esc(q.car.num)}-${q.o.ver||1}（${q.o.plan==='base'?'基本':'プラン '+esc(q.o.plan)}）` : esc(q.no);
const qBuyer = q => q.u && q.u.name ? esc(q.u.name) : '';
const qDeliv = q => q.u && q.u.cond && q.u.cond.deliver ? 'ご指定の場所' + (q.u.addr ? '（' + esc(q.u.addr) + '）' : '') : '店頭';
const qSeibiNm = q => q.k.ws ? 'なし（現状渡し）' : '「' + q.seibi.name + '」';
/* 契約書の付属品の欄：多い時は max 行まで＋「ほか N点（明細は見積書のとおり）」 */
const qOptInline = (q, max) => { const R = qOptRows(q); if (!R.length) return '<span class="oi">なし</span>'; const cut = max && R.length > max, L = cut ? R.slice(0, max-1) : R;
  return L.map(r=>`<span class="oi${r.sub?' s':''}">${r.sub?'└':''}${esc(r.n)}<b>${r.tbd?'サイズ確認後':yen(r.a)}</b></span>`).join('') + (cut ? `<span class="oi more">ほか ${R.slice(max-1).filter(r=>!r.sub).length}点（明細は見積書 ${esc(q.no)} のとおり・合計 ${yen(q.k.optSum)}）</span>` : ''); };
/* 内訳の中の OP を1行にまとめた物（契約書の内訳で使う） */
const qFoldOpts = (q, n) => q.opts.length > n ? Object.assign({}, q, { opts1: [{ n: `付属品・オプション ${q.nOpt}点`, a: q.k.optSum, fold: true }], foldNote: '明細は付属品・オプションの欄' }) : q;
const qOptInline0 = q => q.opts.length ? qOptRows(q).map(r=>`<span class="oi${r.sub?' s':''}">${r.sub?'└':''}${esc(r.n)}<b>${r.tbd?'サイズ確認後':yen(r.a)}</b></span>`).join('') : '<span class="oi">なし</span>';
/* 装備：カテゴリごとに「ある物」と「ない物」 */
function qEquip(q){ const s = eqStateOf(q.car);
  const cats = EQ_TPL.filter(x=>!x.cond).map(x=>({ t:x.t, rows: x.items.filter(it=>!it[4]).map(it=>({ k:it[0], n:it[1], on: eqPos(it, s[it[0]]), v: it[2]==='select' ? s[it[0]] : '', pr: it[3]||'' })) }));
  const picks = cats.flatMap(c=>c.rows.filter(r=>r.on && r.pr));
  const has = cats.flatMap(c=>c.rows.filter(r=>r.on));
  return { s, cats, picks, has, tire: ['tfl','tfr','trl','trr'].map(id=>parseFloat(s[id])||0), size: [s.tsf, s.tsr], acq: s.acq }; }
const qTireBox = (E, cls) => `<div class="tire ${cls||''}">${['左前','右前','左後','右後'].map((l,i)=>`<div class="t${i}"><small>${l}</small><b>${E.tire[i]}<i>mm</i></b><span class="bar"><em style="width:${Math.min(100,E.tire[i]/8*100)}%"></em></span></div>`).join('')}<div class="car"></div></div>`;
/* 装備のアイコン（CoreFlow の共通アイコン） */
const EQ_IC = { nav:'map', navm:'files', tv:'monitor', bt:'signal', bcam:'camera', fcam:'camera', scam:'camera', acam:'camera', rmon:'monitor', cd:'music', dvd:'play', mp:'music', ac:'sun', wac:'sun', cc:'car', acc:'car', sh:'fire', scool:'drop', lea:'gem', psea:'sliders', bench:'bed', row3:'users', walk:'users', flat:'bed',
  skey:'key', kless:'key', push:'power', rstart:'power', spare:'key', pw:'up', psd:'swap', pgate:'up', etc:'card', wel:'bulb', head:'bulb', ahb:'bulb', abs:'shield', ab:'shield', sab:'shield', esc:'shield', body:'shield', aeb:'shield', lane:'shield', apark:'parking', passist:'parking', csens:'signal', immo:'lock',
  alu:'tire', aero:'car', sun:'sun', uv:'sunrise', low:'down', idle:'power', own1:'user', nosmoke:'ban', manual:'book', warr:'shield' };
/* 約款の本文（いまのモックの「自動車売買約款」下書き v1 と同じ文言） */
const TERMS = [
  [1,'約款の適用','本約款は、注文書の表面に記載された自動車（以下「車両」）の売買に適用されます。表面に別の定めがある場合は、表面の定めが優先します。'],
  [2,'契約の成立',['売買契約は、買主が注文書に署名（または記名押印）し、販売店がこれを受け付けた時に成立します。','代金の全部または一部を信販会社のローンでお支払いいただく場合、信販会社の承認が得られなかったときは、契約は成立しなかったものとし、販売店はお預かりした金銭を返還します。']],
  [3,'申込金','注文時にお預かりする申込金は、手付金ではなく、売買代金の一部に充当します。'],
  [4,'代金の支払い',['買主は、注文書記載の支払総額を、注文書記載の期日までに支払います。','支払いが遅れた場合、販売店は、遅れた金額に対し年14.6％の割合による遅延損害金を請求できます。']],
  [5,'契約成立後の解除・取り消し',['契約成立後は、販売店の同意がない限り、買主は契約を解除できません。','買主の申し出により販売店が解除に同意した場合、買主は、解除までに販売店に生じた損害として、次の費用のうち実際に生じたものを負担します。販売店は、その明細を示し、求めに応じて根拠を説明します。(1) 車庫証明・登録・名義変更・抹消などの手続費用と法定費用 (2) 陸送・回送費用 (3) 買主の注文により取り寄せ・取り付けた部品・用品の代金と工賃 (4) 着手した整備・加修の工賃と部品代 (5) その他、解除により販売店に生じた費用','前項の費用は、お預かりした申込金と差し引きして精算します。']],
  [6,'自動車はクーリング・オフの対象外','自動車の売買は、特定商取引に関する法律に基づくクーリング・オフの対象ではありません。'],
  [7,'車両の引渡し',['販売店は、代金の受領（ローンの場合は信販会社の承認と必要書類の受領）後、注文書記載の納車予定日ごろに、記載の場所で車両を引き渡します。','買主の都合で引き取りが遅れた場合、販売店は保管に要した費用を請求できます。']],
  [8,'登録・名義変更',['買主は、登録・名義変更・車庫証明に必要な書類を、販売店が指定する期日までに提出します。','書類の提出が遅れたことにより納車が遅れた場合、販売店はその責任を負いません。']],
  [9,'所有権','車両の所有権は、買主が代金の全額を支払った時に買主に移ります。ローンによる場合は、信販会社との契約の定めに従います。'],
  [10,'引渡し前の事故など','引渡しの前に、販売店・買主のいずれの責任でもない事由（天災・盗難など）により車両が滅失または大きく損傷した場合、契約は解除され、販売店はお預かりした金銭を返還します。'],
  [11,'車両の状態と保証',['販売店は、注文書・見積書・車両状態の書面に記載した車両の状態（修復歴、走行距離、要整備箇所など）を説明し、買主はこれを確認したうえで購入します。','引渡し後の不具合については、保証書に定める範囲・期間で対応します。保証の対象外とした事項でも、販売店が知りながら告げなかった不具合については、法律の定めに従い対応します。']],
  [12,'下取車',['買主は、下取車の状態（修復歴、走行距離、不具合、ローン残債など）を正しく申告します。','査定時から引渡し時までに下取車の状態が変わった場合、または申告と異なることが分かった場合は、下取価格を改めて協議します。']],
  [13,'販売店からの解除','買主が代金の支払い・書類の提出を正当な理由なく怠り、相当の期間を定めた催告に応じない場合、または買主が反社会的勢力に該当することが分かった場合、販売店は契約を解除し、生じた損害の賠償を請求できます。'],
  [14,'反社会的勢力の排除','買主および販売店は、自らが暴力団などの反社会的勢力に該当しないこと、今後も該当しないことを表明し、保証します。'],
  [15,'個人情報','販売店は、取得した個人情報を、本契約の履行、登録手続き、保証・整備のご案内、法令に基づく帳簿の作成など、必要な範囲で利用します。'],
  [16,'協議・合意管轄','本約款に定めのない事項は、法令に従い誠意をもって協議します。本契約に関する争いは、販売店の所在地を管轄する裁判所を第一審の管轄裁判所とします。'] ];
const qTermsHtml = (numCls) => TERMS.map(([n,h,b])=>`<div class="ar"><h4><i>第${n}条</i>${h}</h4>${Array.isArray(b) ? `<ol class="${numCls||''}">${b.map(x=>`<li>${x}</li>`).join('')}</ol>` : `<p>${b}</p>`}</div>`).join('');
const TERMS_KEY = [['handshake','契約は署名した時に成立','注文書に署名し、当店が受け付けた時に成立します（ローンは信販会社の承認で確定）'],['ban','クーリング・オフはありません','自動車の売買は、無条件で取り消せる制度の対象外です'],
  ['receipt','取り消す時は実費をご負担','手続き・陸送・取り寄せた部品・着手した整備など、実際にかかった費用だけ。明細でお示しします'],['shield','状態と保証は書面で','修復歴・走行距離などは書面で説明し、保証は保証書の範囲で対応します'],['car','引渡しと名義','代金と書類がそろってから納車。所有権は代金を全部お支払いいただいた時に移ります']];

/* =========================== プラン比較 =========================== */
const QC = [
 { name:'前のプラン比較（v4.59 まで見積タブで使用）', sub:'以前の形（覚えておく用）', col:'#1f4fb4', legacy:'compare' },
 null,   // ← 旧・見積書サンプル6番（横並び・✓）を後で入れる
 /* 3 正式な比較表（深緑の罫線）：金額の行を全部並べる＝経理・法人にも */
 { name:'正式な比較表', sub:'深緑の罫線・金額の内訳を全部・選んだプランに枠', col:'#14532d', render:q=>{ const P = qPlans(q), sel = q.p;
   const names = []; P.forEach(x=>x.items.forEach(it=>{ if (!names.includes(it.n)) names.push(it.n); }));
   const amt = (x, nm) => { const L = x.all, i = L.findIndex(a=>!a.sub && String(a.n).replace(/^\s*└\s*/,'')===nm); if (i<0) return null; let s = 0, tbd = false; for (let j=i; j<L.length; j++){ if (j>i && !L[j].sub) break; if (L[j].tbd) tbd = true; else s += +L[j].a||0; } return tbd && !s ? 'tbd' : s; };
   const td = (x, v, cls) => `<td class="v ${x.p===sel?'sel':''} ${cls||''}">${v}</td>`;
   const rows = [['車両本体価格（税抜）', x=>yen(x.k.body)]].concat(names.map(nm=>[esc(nm), x=>{ const a = amt(x, nm); return a==null ? '<span class="no">—</span>' : a==='tbd' ? '<small>サイズ確認後</small>' : yen(a); }, 'op']),
     [['車両販売価格（税抜）', x=>yen(x.k.vehicle), 'st'], ['販売諸費用（課税）', x=>yen(x.k.feeKSum + x.k.bc.unexpTax + x.k.bc.unexpJb + x.k.condK)], ['消費税（10%）', x=>yen(x.k.ctax)], ['税金・保険料（立替）', x=>yen(x.k.taxIns)], ['登録の法定費用（立替）', x=>yen(x.k.legalSum + x.k.condT)], ['リサイクル預託金相当額', x=>yen(x.k.nonTax)],
      ['お支払総額（現金販売価格）', x=>yen(x.k.cash), 'st']], q.k.trade ? [[qTrName(q), x=>'▲'+yen(x.k.trade)]] : [], q.k.tradeLoan ? [['下取車の残債', x=>yen(x.k.tradeLoan)]] : [], q.tr ? [['差引お支払額', x=>yen(x.k.net), 'gt']] : [],
     [[q.loan ? `ローン 月々（頭金 ${yen(q.loan.down)}・${q.loan.n}回）` : `ローン 月々（例：${S.set.loan.count}回・${S.set.loan.rate}%）`, x=>{ const L = x.k.loan || loanCalc(x.k.net, 0, S.set.loan.rate, S.set.loan.count); return yen(L.later); }]]);
   return `<div class="qv c3"><h1>お 見 積 比 較 表</h1>
   <table class="hd2"><tr><th>宛名</th><td>${qCustLine(q)}</td><th>見積番号</th><td>${esc(q.no)}</td><th>見積日</th><td>${q.date}</td></tr><tr><th>お車</th><td colspan="3">${esc(q.title)} ${esc(q.car.grade)}（${esc(q.car.num)}）${esc(q.yearW)}・${q.km}・${esc(q.car.color)}・修復歴${esc(q.b.repair)}</td><th>有効期限</th><td>${q.valid}</td></tr></table>
   <div class="car">${qI(q,'hero')}<div><p>4つのお見積を並べています。税金・保険料・登録の費用はどのプランも同じで、違いは<b>付属品・オプションと納車整備</b>です。選んでいるプランは太い枠です。</p>
     <table class="sp"><tr><th>納車整備</th>${P.map(x=>`<td class="${x.p===sel?'sel':''}">${esc(x.seibi.name)}</td>`).join('')}</tr><tr><th>保証</th>${P.map(x=>`<td class="${x.p===sel?'sel':''}">${esc(warText(q.b))}${x.items.some(i=>/延長保証/.test(i.n))?'＋延長':''}</td>`).join('')}</tr></table></div></div>
   <table class="it"><thead><tr><th>項目</th>${P.map(x=>`<th class="v ${x.p===sel?'sel':''}">${x.name}<small>${esc(x.sub)}</small></th>`).join('')}</tr></thead>
     <tbody>${rows.map(r=>`<tr class="${r[2]||''}"><td>${r[0]}</td>${P.map(x=>td(x, r[1](x))).join('')}</tr>`).join('')}</tbody></table>
   <div class="bm"><div class="bx"><div class="h">備考</div>${['付属品・オプションの金額は税抜です（取付工賃を含む）。'].concat(qNotes(q)).map(t=>`<div>・${esc(t)}</div>`).join('')}</div>
     <div class="bx cpb"><div class="cp"><b>${esc(q.c.name)}</b>${qAddr(q)}<br>${qTel(q)}${q.staff?'<br>担当 '+esc(q.staff):''}${qStamp('社印')}</div></div></div></div>`; } },
 /* 4 ショールーム：おすすめを1つ大きく（写真・明朝・金）。ほかのプランは細い帯で */
 { name:'ショールーム（おすすめを大きく・見積タブで使用中）', sub:'写真・明朝・金。おすすめ1つを主役に', col:'#1c1917', render:q=>{ const P = qPlans(q), rec = P.find(x=>x.p===(q.p==='base'?'B':q.p)) || P[2], base = P[0];
   const its = rec.items, cut = its.length > 16, shown = cut ? its.slice(0,15) : its, L = rec.k.loan || loanCalc(rec.k.net, 0, S.set.loan.rate, S.set.loan.count);
   return `<div class="qv c4">
   <div class="hero">${qI(q,'hero')}<div class="shade"></div><div class="top"><span>${esc(q.c.name)}</span><span>お見積りのご提案　${esc(q.no)}</span></div><div class="name"><small>${esc(q.car.maker)}　${esc(q.car.grade)}</small><h1>${esc(q.car.model)}</h1><p>${esc(q.yearW)}・${q.car.km.toLocaleString()} km・${esc(q.car.color)}・修復歴 ${esc(q.b.repair)}</p></div></div>
   <div class="rec"><div class="l"><small>${rec.p===q.p?'お選びのプラン':'おすすめのプラン'}</small><h2>${rec.name}<span>${esc(rec.sub)}</span></h2>
       <div class="tt"><small>${q.headLb}（消費税込）</small><b>${qY(rec.k.net)}</b><span>ベースから ＋${yen(rec.k.net-base.k.net)}　・　ローン 月々 ${yen(L.later)}円（${L.n}回${rec.k.loan?'':'・例'}）</span></div>
       <div class="sb">${esc(rec.seibi.name)}・保証 ${esc(warText(q.b))}${rec.items.some(i=>/延長保証/.test(i.n))?'＋延長保証':''}</div></div>
     <div class="r"><h3>このプランに含まれるもの <small>${its.length}点</small></h3><div class="its">${shown.map(it=>`<span>${esc(it.n)}</span>`).join('')}${cut?`<span class="more">ほか ${its.length-15}点</span>`:''}</div></div></div>
   ${q.phMany?`<div class="th3">${qI(q,'dash','','運転席まわり')}${qI(q,'seat2','','後ろの席')}${qI(q,'lug','','荷室')}${qI(q,'nav','','ナビ・カメラ')}</div>`:''}
   <h3 class="ot">ほかのプラン</h3>
   <div class="others">${P.filter(x=>x!==rec).map(x=>{ const Lx = x.k.loan || loanCalc(x.k.net, 0, S.set.loan.rate, S.set.loan.count), d = x.k.net - rec.k.net;
     return `<div class="o"><div class="n"><b>${x.name}</b><small>${esc(x.sub)}・${esc(x.seibi.name)}</small></div><div class="i">${x.items.length ? x.items.slice(0,5).map(i=>esc(i.n)).join('・') + (x.items.length>5?` ほか${x.items.length-5}点`:'') : 'オプションなし（掲載の支払総額）'}</div>
       <div class="p"><b>${yen(x.k.net)}</b><small>${d>=0?'＋':'−'}${yen(Math.abs(d))}・月々 ${yen(Lx.later)}</small></div></div>`; }).join('')}</div>
   <div class="foot"><div class="cu">${qCustLine(q)}<small>見積日 ${q.date}　有効期限 ${q.valid}${q.staff?'　担当 '+esc(q.staff):''}</small></div><div class="cp"><b>${esc(q.c.name)}</b>${qAddr(q)}　${qTel(q)}</div></div>
   <div class="notes">${['どのプランも、税金・保険料・登録の費用は同じです。'].concat(qNotes(q)).map(n=>`<span>※ ${esc(n)}</span>`).join('')}</div></div>`; } },
 /* 5 モダン：差額の階段（ベース → A → B → C で、増える物と増える金額） */
 { name:'モダン（差額の階段）', sub:'ベースから1段ずつ「増える物と金額」', col:'#4338ca', render:q=>{ const P = qPlans(q), sel = q.p;
   return `<div class="qv c5">
   <div class="hd"><div><b>${esc(q.c.name)}</b><h1>プランの選び方</h1><p>${esc(q.title)} ${esc(q.car.grade)}・${esc(q.yearW)}・${q.km}・${esc(q.car.color)}・修復歴 ${esc(q.b.repair)}</p><p class="ex">ベース（オプションなし）から1段ずつ、増える物と金額を並べています。税金・保険料・登録の費用はどの段も同じです。</p></div>${qI(q,'hero','ph')}</div>
   <div class="steps">${P.map((x,i)=>{ const prev = i ? P[i-1] : null, add = prev ? x.items.filter(it=>!prev.items.some(p=>p.n===it.n)) : [], gone = prev ? prev.items.filter(it=>!x.items.some(p=>p.n===it.n)) : [], up = prev && x.seibi.name!==prev.seibi.name;
     const L = x.k.loan || loanCalc(x.k.net, 0, S.set.loan.rate, S.set.loan.count), many = add.length > 18;
     return `<div class="st ${x.p===sel?'sel':''}"><div class="no">${i===0?'0':i}</div><div class="bd"><div class="h"><b>${x.name}</b><small>${esc(x.sub)}</small>${x.p===sel?'<em>お選び</em>':''}${x.p==='B'?'<em class="rc">おすすめ</em>':''}</div>
       <div class="ad">${i===0 ? `<span class="base">オプションなし・掲載の支払総額。${esc(x.seibi.name)}・保証 ${esc(warText(q.b))}</span>` : (up?`<span class="up">${esc(prev.seibi.name)} → ${esc(x.seibi.name)}</span>`:'') + (many ? add.slice(0,17) : add).map(a=>`<span>＋ ${esc(a.n)}</span>`).join('') + (many?`<span>ほか ${add.length-17}点</span>`:'') + gone.map(a=>`<span class="gone">− ${esc(a.n)}</span>`).join('') + (!add.length && !up && !gone.length ? '<span class="base">前の段と同じ</span>' : '')}</div></div>
       <div class="pr">${prev?`<span class="df">${x.k.net-prev.k.net>=0?'＋':'−'}${yen(Math.abs(x.k.net-prev.k.net))}</span>`:''}<b>${yen(x.k.net)}</b><small>${q.headLb}・月々 ${yen(L.later)}</small></div></div>`; }).join('')}</div>
   <div class="bt">${qI(q,'dash')}${qI(q,'seat2')}${qI(q,'lug')}<div class="eq"><b>主な装備</b>${q.equip.map(e=>`<span>${esc(e)}</span>`).join('')}</div></div>
   <div class="ft"><div>${(q.tr?[q.headSub]:[]).concat(['金額は消費税込。月々は '+(q.loan?q.loan.n+'回・頭金 '+yen(q.loan.down)+'円':S.set.loan.count+'回・実質年率 '+S.set.loan.rate+'%・頭金なしの例')+'です。'], qNotes(q)).map(t=>'※ '+esc(t)).join('<br>')}</div>
     <div class="cp"><div class="cu">${qCustLine(q)}</div>${esc(q.no)}　${q.date}<br>${esc(q.c.name)}　${qTel(q)}${q.staff?'<br>担当 '+esc(q.staff):''}</div></div></div>`; } },
];

/* =========================== 装備品一覧 =========================== */
const QE = [
 { name:'前の装備品一覧（v4.59 まで見積タブで使用）', sub:'以前の形（覚えておく用）', col:'#1f4fb4', legacy:'equip' },
 /* 2 ショールーム：写真・明朝・金。おすすめ装備を大きく */
 { name:'ショールーム（見積タブで使用中）', sub:'写真・明朝・金。おすすめ装備を大きく', col:'#1c1917', render:q=>{ const E = qEquip(q), kb = calc(q.d.mk ? q.d.mk('base') : { car:q.car, b:q.b });
   return `<div class="qv e2">
   <div class="hero">${qI(q,'hero')}<div class="shade"></div><div class="top"><span>${esc(q.c.name)}</span><span>装備品一覧　${esc(q.car.num)}</span></div><div class="name"><small>${esc(q.car.maker)}</small><h1>${esc(q.car.model)}</h1><p>${esc(q.car.grade)}</p></div></div>
   <div class="facts">${[['年式', q.yearW], ['走行距離', q.car.km.toLocaleString()+' km'], ['車体色', q.car.color], ['修復歴', q.b.repair], ['車検', shakenText(q.b,q.k).replace(/（.*$/,'')], ['支払総額（オプションなし）', yen(kb.cash)+' 円']].map(f=>`<div><small>${f[0]}</small><b>${esc(f[1])}</b></div>`).join('')}</div>
   ${E.picks.length?`<div class="pk"><h3>この車のおすすめ装備</h3><div class="pks">${E.picks.slice(0,6).map(p=>`<div><b>${esc(p.n)}</b><span>${esc(p.pr)}</span></div>`).join('')}</div></div>`:''}
   <div class="cats">${E.cats.map(c=>{ const on = c.rows.filter(r=>r.on); return on.length ? `<div class="ct"><h4>${esc(c.t)}</h4>${on.map(r=>`<div class="r"><i>✓</i>${esc(r.n)}${r.v?`<span>${esc(r.v)}</span>`:''}</div>`).join('')}</div>` : ''; }).join('')}</div>
   <div class="th4">${qI(q,'dash')}${qI(q,'nav')}${qI(q,'seat2')}${qI(q,'lug')}</div>
   <div class="cond"><div><h3>タイヤの残り溝 <small>新品は約8mm・サイズ 前 ${esc(E.size[0])}／後 ${esc(E.size[1])}</small></h3>${qTireBox(E)}</div>
     <div><h3>点検で確かめたこと</h3><p>エアコンの効き：<b>${esc(E.acq)}</b><br>${q.k.ws?'現状渡し（納車整備なし）':`${esc(q.seibi.name)}を実施してお渡しします`}<br>保証：${esc(q.k.ws?'なし':warText(q.b))}</p></div></div>
   <div class="foot"><span>${esc(q.c.name)}　${qTel(q)}</span><span>装備は ${q.date} 時点の点検の結果です</span></div></div>`; } },
 /* 3 正式な確認表：全部の項目に ✓ と —（ない物も出す）＋点検の結果＋確認の印 */
 { name:'正式な確認表（全項目）', sub:'深緑の罫線・ない物も「—」で全部・確認の印', col:'#14532d', render:q=>{ const E = qEquip(q), s = E.s;
   const cell = r => `<td class="nm">${esc(r.n)}</td><td class="ck ${r.on?'on':''}">${r.on?'✓':'—'}</td><td class="vl">${r.on&&r.v?esc(r.v):''}</td>`;
   const all = E.cats.flatMap(c=>[{ h:c.t }].concat(c.rows)), half = Math.ceil(all.length/2), L1 = all.slice(0, half), L2 = all.slice(half);
   const tb = L => `<table class="ck"><thead><tr><th>項目</th><th>有無</th><th>内容</th></tr></thead><tbody>${L.map(r=>r.h?`<tr class="h"><td colspan="3">${esc(r.h)}</td></tr>`:`<tr>${cell(r)}</tr>`).join('')}</tbody></table>`;
   return `<div class="qv e3"><h1>装 備 品 ・ 車 両 確 認 表</h1>
   <table class="hd2"><tr><th>管理番号</th><td>${esc(q.car.num)}</td><th>車名</th><td>${esc(q.title)} ${esc(q.car.grade)}</td><th>確認日</th><td>${q.date}</td></tr><tr><th>年式</th><td>${esc(q.yearW)}</td><th>型式・色</th><td>${esc(q.car.fmodel)}・${esc(q.car.color)}</td><th>走行距離</th><td>${q.km}</td></tr></table>
   <div class="g2">${tb(L1)}${tb(L2)}</div>
   <div class="g3"><table class="ck"><thead><tr><th colspan="2">動作・コンディション</th></tr></thead><tbody>${[['エアコンの効き', s.acq], ['ベルト鳴き', s.belt==='on'?'あり':'なし'], ['ルームランプ', s.room==='ok'?'良好':'要確認'], ['ドアミラーの動作', s.mirror==='ok'?'良好':'要確認'], ['スペアキーの動作', s.sparek==='ok'?'良好':'—'], ['その他', s.memo||'—']].map(r=>`<tr><td class="nm">${r[0]}</td><td>${esc(r[1]||'—')}</td></tr>`).join('')}</tbody></table>
     <table class="ck"><thead><tr><th>タイヤ</th><th>残り溝</th></tr></thead><tbody>${['左前','右前','左後','右後'].map((l,i)=>`<tr><td class="nm">${l}</td><td>${E.tire[i]} mm</td></tr>`).join('')}<tr><td class="nm">サイズ</td><td>前 ${esc(E.size[0])}／後 ${esc(E.size[1])}</td></tr></tbody></table>
     <div class="sg"><div class="h">確認</div><div class="bx"><div><small>点検</small><span></span></div><div><small>担当</small><span>${esc(q.staff.split(' ')[0])}</span></div><div><small>お客様</small><span></span></div></div><p>上記の装備・状態を確認しました。<br>${qCustLine(q)}</p></div></div>
   <div class="ft"><span>${esc(q.c.name)}　${qAddr(q)}　${qTel(q)}</span><span>✓＝あり　—＝なし（装備品チェックの結果）</span></div></div>`; } },
 /* 4 カタログ：写真に装備を書き込む（写真で見る装備） */
 { name:'カタログ（写真で見る装備）', sub:'写真9枚に、写っている装備を書く', col:'#0369a1', render:q=>{ const E = qEquip(q), on = k => E.has.some(r=>r.k===k), nm = ks => E.has.filter(r=>ks.includes(r.k)).map(r=>r.n+(r.v?'（'+r.v+'）':'')).join('・');
   const P9 = [['hero','外装', nm(['head','alu','aero','uv','sun'])], ['side','ドア・スライド', nm(['psd','pw','skey','push'])], ['rear','リア', nm(['pgate','bcam','idle'])], ['dash','運転席まわり', nm(['nav','tv','bt','cc','acc'])], ['nav','ナビ・カメラ', nm(['bcam','acam','fcam','dvd','cd'])],
     ['seat','前の席', nm(['lea','sh','psea','bench'])], ['seat2','後ろの席', nm(['row3','walk','flat','rmon'])], ['meter','メーター', '走行 '+q.car.km.toLocaleString()+'km'], ['wheel','タイヤ', `溝 前 ${E.tire[0]}mm／後 ${E.tire[2]}mm`]];
   return `<div class="qv e4">
   <div class="hd"><div><small>${esc(q.c.name)}　装備品一覧</small><h1>${esc(q.title)} <span>${esc(q.car.grade)}</span></h1></div><div class="sp">${esc(q.yearW)}・${q.km}・${esc(q.car.color)}・修復歴 ${esc(q.b.repair)}<br>${esc(q.car.num)}</div></div>
   <div class="grid">${P9.map((x,i)=>`<figure class="qi ${i===0?'big':''}">${q.hasPh?`<img src="${q.ph(x[0])}" alt="">`:carSvg(q.car)}<figcaption><b>${x[1]}</b>${x[2]?`<span>${esc(x[2])}</span>`:''}</figcaption></figure>`).join('')}</div>
   <div class="lst">${E.cats.map(c=>{ const o = c.rows.filter(r=>r.on); return o.length ? `<div><h4>${esc(c.t)}</h4><p>${o.map(r=>esc(r.n)+(r.v?'（'+esc(r.v)+'）':'')).join('・')}</p></div>` : ''; }).join('')}</div>
   <div class="ft"><span>${esc(q.c.name)}　${qTel(q)}</span><span>装備は ${q.date} 時点の点検の結果です</span></div></div>`; } },
 /* 5 モダン：アイコンで「ある物・ない物」 */
 { name:'モダン（アイコン）', sub:'アイコンで「ある物」と「ない物」をひと目で', col:'#4338ca', render:q=>{ const E = qEquip(q);
   return `<div class="qv e5">
   <div class="hd"><div><b>${esc(q.c.name)}</b><h1>装備</h1><p>${esc(q.title)} ${esc(q.car.grade)}・${esc(q.yearW)}・${q.km}・${esc(q.car.color)}</p></div>${qI(q,'hero','ph')}</div>
   <div class="sum"><div><b>${E.has.length}</b><small>ある装備</small></div><div><b>${E.picks.length}</b><small>おすすめ</small></div><div><b>${E.tire.reduce((a,b)=>Math.min(a,b),9)}mm</b><small>タイヤの溝（いちばん少ない所）</small></div><div><b>${esc(E.acq)}</b><small>エアコン</small></div></div>
   ${E.cats.map(c=>`<div class="ct"><h4>${esc(c.t)}</h4><div class="ics">${c.rows.map(r=>`<div class="ic ${r.on?'on':''} ${r.pr&&r.on?'pk':''}"><i>${I(EQ_IC[r.k]||'check','✓',16)}</i><span>${esc(r.n)}${r.on&&r.v?`<small>${esc(r.v)}</small>`:''}</span></div>`).join('')}</div></div>`).join('')}
   <div class="ft"><span>色の付いたアイコン＝ある装備・灰色＝ない装備・★の枠＝おすすめ</span><span>${esc(q.c.name)}　${q.date}</span></div></div>`; } },
];

/* =========================== 売買契約書（注文書・横） =========================== */
const QO = [
 { name:'いまの注文書（横・見積タブで使用中）', sub:'見積タブで刷っている今の形', col:'#1f4fb4', legacy:'orderH', land:true },
 /* 2 正式な契約書（深緑・横・3段） */
 { name:'正式な契約書（3段）', sub:'深緑の罫線・3段・売主と買主の印の枠', col:'#14532d', land:true, render:q=>{ const k = q.k, L = q.loan;
   const r = (a, b, cls) => `<tr class="${cls||''}"><th>${a}</th><td class="v">${b}</td></tr>`;
   return `<div class="qv o2"><div class="hd"><div class="sl"><div class="lb">売主</div><div><b>${esc(q.c.name)}</b>${qAddr(q)}<br>${qTel(q)}<br>登録番号 ${esc(q.c.inv)}　古物商 ${esc(q.c.kobutsu)}</div>${qSeal()}</div>
     <div class="tt"><h1>自動車売買契約書</h1><p>（注文書・中古車）</p><span>下記の自動車を、裏面の約款に同意のうえ注文します。</span></div>
     <table class="dt"><tr><th>契約日</th><td>${jd(q.o.date)}</td></tr><tr><th>納車予定日</th><td>${jd(q.o.delivery)}</td></tr><tr><th>契約番号</th><td>${qOrdNo(q)}</td></tr><tr><th>担当</th><td>${esc(q.staff)}</td></tr></table></div>
   <div class="body"><div class="c1"><div class="sec">お車</div><table class="tkv">${[['車名', q.title], ['グレード', q.car.grade], ['年式', q.yearW+'（'+q.car.firstReg.slice(0,4)+'）'], ['型式', q.car.fmodel], ['走行距離', q.km], ['車体色', q.car.color], ['修復歴', q.b.repair], ['車検', shakenText(q.b,k)], ['管理番号', q.car.num]].map(x=>`<tr><th>${x[0]}</th><td>${esc(x[1])}</td></tr>`).join('')}</table>
       <div class="sec">保証・整備</div><table class="tkv"><tr><th>保証</th><td>${esc(k.ws?'なし（現状渡し）':warText(q.b))}</td></tr><tr><th>納車整備</th><td>${esc(qSeibiNm(q))}</td></tr><tr><th>納車場所</th><td>${qDeliv(q)}</td></tr></table>
       <div class="sec">付属品・オプション（税抜）</div><div class="ol">${qOptInline(q, 9)}</div></div>
     <div class="c2"><div class="sec">お支払い金額</div><table class="tpr">${r('① 車両本体価格（税抜）', yen(k.body))}${k.disc?r('② 値引き','▲'+yen(k.disc)):''}${r('③ 付属品・オプション', yen(k.optSum))}${r('④ 車両販売価格', yen(k.vehicle), 'st')}${r('⑤ 販売諸費用（課税）', yen(q.sumK))}${r('⑥ 消費税（10%）', yen(k.ctax))}${r('⑦ 税金・保険料（立替）', yen(k.taxIns))}${r('⑧ 登録の法定費用（立替）', yen(q.sumT-k.nonTax))}${r('⑨ リサイクル預託金相当額', yen(k.nonTax))}
         ${r('お支払総額（現金販売価格）', yen(k.cash), 'gt')}${k.trade?r(qTrName(q),'▲'+yen(k.trade)):''}${k.tradeLoan?r('下取車の残債（当店で精算）', yen(k.tradeLoan)):''}${q.tr?r('差引お支払額', yen(k.net), 'gt'):''}</table>
       <div class="sec">お支払い方法</div><table class="tkv">${L?[['方法','オートローン（信販会社：'+qLine(110)+'）'],['頭金', yen(L.down)+' 円'],['割賦元金', yen(L.P)+' 円'],['回数', L.n+'回（初回 '+yen(L.first)+'円・2回目以降 '+yen(L.later)+'円）'],['実質年率・手数料', L.rate+'%・'+yen(L.fee)+'円'],['割賦販売価格', yen(L.hanbai)+' 円']].map(x=>`<tr><th>${x[0]}</th><td>${x[1]}</td></tr>`).join(''):`<tr><th>方法</th><td>現金（お振込）</td></tr><tr><th>お支払い期日</th><td>${qLine(140)}</td></tr><tr><th>お振込先</th><td>${esc(q.c.bank)}</td></tr>`}</table>
       ${q.tr?`<div class="sec">下取車</div><table class="tkv"><tr><th>車名</th><td>${esc(q.tradeModel||'')}</td></tr><tr><th>下取価格・残債</th><td>${yen(k.trade)} 円・${yen(k.tradeLoan)} 円</td></tr><tr><th>車台番号・車検</th><td>${qLine(150)}</td></tr></table>`:''}</div>
     <div class="c3"><div class="sec">ご購入者</div><table class="tkv by"><tr><th>お名前</th><td>${qBuyer(q)}<span class="sg">（自署）</span></td></tr><tr><th>ご住所</th><td>${q.u&&q.u.addr?esc(q.u.addr):''}</td></tr><tr><th>電話</th><td>${q.u&&q.u.tel?esc(q.u.tel):''}</td></tr><tr><th>生年月日</th><td>　　年　　月　　日</td></tr></table>
       <div class="sec">特約・お約束したこと</div><div class="pm">${q.o.promise?esc(q.o.promise):''}</div>
       <div class="chk"><div>☐ 裏面の「自動車売買約款」を読み、内容に同意します。</div><div>☐ 自動車の売買はクーリング・オフの対象外であることを確認しました。</div><div>☐ 私は暴力団等の反社会的勢力ではなく、今後も関わりません。</div>${L?`<div>☐ 信販会社の承認前に登録・整備に着手することを（ 依頼する ・ 依頼しない ）</div>`:''}</div>
       <div class="sig"><div><small>ご購入者 署名・印</small><span></span></div><div><small>売主 担当・印</small><span></span></div></div></div></div>
   <div class="ft">課税10%対象 ${yen(k.taxable)}（消費税 ${yen(k.ctax)}）／非課税 ${yen(k.nonTax)}／立替 ${yen(k.tate)}　　${esc(q.cond)}</div></div>`; } },
 /* 3 ショールーム（横）：左に写真、右に契約の内容（明朝・金） */
 { name:'ショールーム（横・写真）', sub:'左に写真と車名、右に契約の内容。明朝・金', col:'#1c1917', land:true, render:q=>{ const k = q.k, L = q.loan;
   return `<div class="qv o3"><div class="ph">${qI(q,'hero')}<div class="shade"></div><div class="nm"><small>${esc(q.car.maker)}</small><h1>${esc(q.car.model)}</h1><p>${esc(q.car.grade)}</p>
       <dl>${[['年式', q.yearW], ['走行距離', q.car.km.toLocaleString()+' km'], ['車体色', q.car.color], ['修復歴', q.b.repair], ['車検', shakenText(q.b,k).replace(/（.*$/,'')], ['管理番号', q.car.num]].map(x=>`<div><dt>${x[0]}</dt><dd>${esc(x[1])}</dd></div>`).join('')}</dl></div><div class="co">${esc(q.c.name)}</div></div>
   <div class="rt"><div class="hd"><div><small>AUTOMOBILE SALES CONTRACT</small><h2>自動車売買契約書</h2></div><div class="m">契約日 ${jd(q.o.date)}<br>契約番号 ${qOrdNo(q)}</div></div>
     <div class="tot"><div><small>${q.headLb}（消費税込）</small><b>${qY(k.net)}</b><span>車両販売価格 ${yen(q.vehIn)}・諸費用 ${yen(q.feesIn)}${q.tr?'・'+esc(q.headSub):''}</span></div>${L?`<div class="ln"><small>オートローン</small><b>月々 ${yen(L.later)}円</b><span>${L.n}回・頭金 ${yen(L.down)}円・実質年率 ${L.rate}%<br>割賦販売価格 ${yen(L.hanbai)}円</span></div>`:`<div class="ln"><small>お支払い</small><b>現金（お振込）</b><span>${esc(q.c.bank)}</span></div>`}</div>
     <div class="g2"><div><h3>内訳</h3>${qBreak(qFoldOpts(q, 6))}</div>
       <div><h3>お引渡し</h3><table class="tkv"><tr><th>納車予定日</th><td>${jd(q.o.delivery)}</td></tr><tr><th>納車場所</th><td>${qDeliv(q)}</td></tr><tr><th>納車整備</th><td>${esc(qSeibiNm(q))}</td></tr><tr><th>保証</th><td>${esc(k.ws?'なし':warText(q.b))}</td></tr></table>
         <h3>付属品・オプション</h3><div class="ol">${qOptInline(q, 8)}</div>
         <h3>お約束したこと</h3><div class="pm">${q.o.promise?esc(q.o.promise):''}</div></div></div>
     <div class="sg"><div class="ag">裏面の約款に同意し、上記のとおり契約します。自動車の売買はクーリング・オフの対象外です。☐ 反社会的勢力ではありません${L?'　☐ 承認前の着手を（ 依頼する ・ しない ）':''}</div>
       <div class="bx"><div><small>ご購入者</small><b>${qBuyer(q)||'　'}</b><span class="ln2"></span><small>ご住所 ${q.u&&q.u.addr?esc(q.u.addr):''}</small></div><div><small>販売店</small><b>${esc(q.c.name)}</b><span class="ln2"></span><small>${qAddr(q)}${q.staff?'　担当 '+esc(q.staff):''}</small>${qSeal()}</div></div></div></div></div>`; } },
 /* 4 モダン（横）：6つの番号カード＋署名の帯 */
 { name:'モダン（横・6つのカード）', sub:'①お車〜⑥ご署名を番号のカードで', col:'#4338ca', land:true, render:q=>{ const k = q.k, L = q.loan;
   const card = (n, t, body) => `<div class="cd"><div class="h"><i>${n}</i>${t}</div><div class="b">${body}</div></div>`;
   const kv = arr => `<table class="tkv">${arr.map(x=>`<tr><th>${x[0]}</th><td>${x[1]}</td></tr>`).join('')}</table>`;
   return `<div class="qv o4"><div class="hd"><div><b>${esc(q.c.name)}</b><h1>自動車売買契約書 <small>注文書</small></h1></div><div class="m"><span>契約日 <b>${jd(q.o.date)}</b></span><span>納車予定 <b>${jd(q.o.delivery)}</b></span><span>契約番号 <b>${qOrdNo(q)}</b></span></div></div>
   <div class="grid">
     ${card(1,'お車', `<div class="car">${qI(q,'hero')}<div><b>${esc(q.title)}</b><span>${esc(q.car.grade)}</span></div></div>`+kv([['年式', esc(q.yearW)], ['走行', q.km], ['色・型式', esc(q.car.color)+'・'+esc(q.car.fmodel)], ['修復歴・車検', esc(q.b.repair)+'・'+esc(shakenText(q.b,k).replace(/（.*$/,''))], ['管理番号', esc(q.car.num)]]))}
     ${card(2,'金額', `<div class="big"><small>${q.headLb}（税込）</small><b>${qY(k.net)}</b></div>`+kv([['車両販売価格（税抜）', yen(k.vehicle)], ['うち付属品・オプション', yen(k.optSum)], ['販売諸費用（課税）', yen(q.sumK)], ['消費税', yen(k.ctax)], ['税金・保険・法定費用', yen(k.taxIns + q.sumT - k.nonTax)], ['リサイクル預託金', yen(k.nonTax)]].concat(q.tr?[['お支払総額', yen(k.cash)], [qTrName(q), '▲'+yen(k.trade)]].concat(k.tradeLoan?[['残債', yen(k.tradeLoan)]]:[]):[])))}
     ${card(3,'お支払い', L ? `<div class="big"><small>オートローン</small><b>月々 ${yen(L.later)}円</b></div>`+kv([['頭金', yen(L.down)+'円'], ['回数', L.n+'回（初回 '+yen(L.first)+'円）'], ['実質年率', L.rate+'%'], ['分割手数料', yen(L.fee)+'円'], ['割賦販売価格', yen(L.hanbai)+'円'], ['信販会社', qLine(90)]]) : `<div class="big"><small>お支払い方法</small><b>現金（お振込）</b></div>`+kv([['お支払い期日', qLine(110)], ['お振込先', esc(q.c.bank)], ['申込金', qLine(80)+' 円']]))}
     ${card(4,'お引渡しと保証', kv([['納車予定日', jd(q.o.delivery)], ['納車場所', qDeliv(q)], ['納車整備', esc(qSeibiNm(q))], ['保証', esc(k.ws?'なし':warText(q.b))]])+`<div class="ol"><small>付属品・オプション</small>${qOptInline(q, 7)}</div>`)}
     ${card(5,'下取車とお約束', kv(q.tr?[['下取車', esc(q.tradeModel||'')], ['下取価格', yen(k.trade)+'円'], ['残債', yen(k.tradeLoan)+'円（当店で精算）']]:[['下取車','なし']])+`<div class="pm"><small>お約束したこと</small>${q.o.promise?esc(q.o.promise):''}</div>`)}
     ${card(6,'ご署名', `<div class="chk"><div>☐ 裏面の約款を読み、同意します</div><div>☐ クーリング・オフの対象外と確認しました</div><div>☐ 反社会的勢力ではありません</div>${L?'<div>☐ 承認前の着手を（ 依頼する ・ しない ）</div>':''}</div><div class="sg"><small>ご購入者（自署）</small><b>${qBuyer(q)||'　'}</b><span></span><small>ご住所・電話</small><span></span></div>`)}
   </div>
   <div class="ft"><span>売主 <b>${esc(q.c.name)}</b>　${qAddr(q)}　${qTel(q)}　登録番号 ${esc(q.c.inv)}　古物商 ${esc(q.c.kobutsu)}${q.staff?'　担当 '+esc(q.staff):''}</span>${qSeal()}</div></div>`; } },
];

/* =========================== 約款 =========================== */
const QT = [
 { name:'いまの約款（見積タブで使用中）', sub:'見積タブで刷っている今の形', col:'#1f4fb4', legacy:'terms' },
 /* 2 正式（裏面用・3段の細字） */
 { name:'正式（裏面用・3段）', sub:'注文書の裏に刷る形。3段の細字・条の見出しは太字', col:'#14532d', render:q=>`<div class="qv t2"><h1>自 動 車 売 買 約 款</h1><p class="ld">この約款は、注文書（表面）と一体となって、お客様（以下「買主」）と${esc(q.c.name)}（以下「販売店」）との自動車売買契約の内容となります。</p>
   <div class="cols">${qTermsHtml()}</div><div class="ft"><span>${esc(q.c.name)}　${qAddr(q)}　${qTel(q)}</span><span>下書き v1（2026-10-03）・最終の文言は弁護士・行政書士の確認を受けてから使う</span></div></div>` },
 /* 3 要点つき（モダン）：大事な5つを上に、全文は2段 */
 { name:'要点つき（モダン）', sub:'大事な5つを上にアイコンで・全文は2段', col:'#4338ca', render:q=>`<div class="qv t3"><div class="hd"><div><b>${esc(q.c.name)}</b><h1>自動車売買約款</h1><p>ご契約の前に、とくに大事な5つを先にご説明します。全文は下のとおりです。</p></div></div>
   <div class="keys">${TERMS_KEY.map((x,i)=>`<div><i>${I(x[0],'•',18)}</i><b>${i+1}. ${x[1]}</b><span>${x[2]}</span></div>`).join('')}</div>
   <div class="cols">${qTermsHtml()}</div><div class="ft"><span>この約款は注文書と一体で契約の内容になります</span><span>${esc(q.c.name)}　下書き v1（2026-10-03）</span></div></div>` },
 /* 4 ショールーム：明朝・金の線・2段・余白広め */
 { name:'ショールーム（明朝）', sub:'明朝・金の細い線・2段・余白を広く', col:'#1c1917', render:q=>`<div class="qv t4"><div class="hd"><small>TERMS AND CONDITIONS</small><h1>自動車売買約款</h1><p>${esc(q.c.name)}</p></div>
   <p class="ld">この約款は、注文書（表面）と一体となって、お客様（以下「買主」）と${esc(q.c.name)}（以下「販売店」）との自動車売買契約の内容となります。</p>
   <div class="cols">${qTermsHtml()}</div><div class="ft">${esc(q.c.name)}　${qAddr(q)}　${qTel(q)}　／　下書き v1（2026-10-03）</div></div>` },
];

/* =========================== そのほかの帳票 =========================== */
const QX = [
 { name:'いまのモックの契約内容の確認書', sub:'今の形（比べる用）', col:'#1f4fb4', legacy:'contract' },
 /* 契約内容の確認書（チェック式・モダン） */
 { name:'契約内容の確認書（チェック式）', sub:'大事な所をチェックで1つずつ確かめる', col:'#4338ca', render:q=>{ const k = q.k, L = q.loan;
   const ck = [['お車', `${esc(q.title)} ${esc(q.car.grade)}・${esc(q.yearW)}・${q.km}・${esc(q.car.color)}・修復歴 ${esc(q.b.repair)}`], ['お支払いの金額', `${q.headLb} <b>${qY(k.net)}</b>（消費税込）${q.tr?'・'+esc(q.headSub):''}`],
     ['お支払い方法', L?`オートローン 頭金 ${yen(L.down)}円・${L.n}回・月々 ${yen(L.later)}円・割賦販売価格 ${yen(L.hanbai)}円`:'現金（お振込）'], ['お引渡し', `${jd(q.o.delivery)} ごろ・${qDeliv(q)}`], ['保証と整備', `保証 ${esc(k.ws?'なし':warText(q.b))}・${esc(qSeibiNm(q))}`],
     ['契約の成立', '注文書に署名した時に成立しました'+(L?'（ローンは信販会社の承認で確定）':'')], ['クーリング・オフ', '自動車の購入にはありません'], ['取り消す時', '販売店の同意が要り、実際にかかった費用（手続き・陸送・部品・整備など）をご負担いただきます'], ['お約束したこと', q.o.promise?esc(q.o.promise):'（なし）']];
   return `<div class="qv x5"><div class="hd"><div><b>${esc(q.c.name)}</b><h1>ご契約内容の確認書</h1><p>ご契約の内容を、1つずつ一緒に確かめます。確かめた所に ✓ を付けてください。</p></div><div class="m">契約日 ${jd(q.o.date)}<br>契約番号 ${qOrdNo(q)}</div></div>
   <div class="car">${qI(q,'hero')}<div><small>ご購入のお車</small><b>${esc(q.title)}</b><span>${esc(q.car.grade)}</span><div class="tt"><small>${q.headLb}</small><b>${qY(k.net)}</b></div></div></div>
   <div class="list">${ck.map((x,i)=>`<div class="r"><span class="bx"></span><div><small>${i+1}. ${x[0]}</small><p>${x[1]}</p></div></div>`).join('')}</div>
   <div class="sg"><div><small>上記をすべて確認しました（ご署名）</small><b>${qBuyer(q)||'　'}</b><span></span><small>　　年　　月　　日</small></div><div><small>説明した担当</small><b>${esc(q.staff)}</b><span></span><small>${esc(q.c.name)}</small></div></div>
   <div class="ft">${esc(q.c.name)}　${qAddr(q)}　${qTel(q)}</div></div>`; } },
 { name:'いまのモックの車両状態確認書', sub:'今の形（比べる用）', col:'#1f4fb4', legacy:'cond' },
 /* 車両状態確認書（写真つき） */
 { name:'車両状態確認書（写真つき）', sub:'写真6枚・状態の表・タイヤ・確認の署名', col:'#0369a1', render:q=>{ const E = qEquip(q), s = E.s, k = q.k;
   return `<div class="qv x6"><div class="hd"><div><small>${esc(q.c.name)}</small><h1>車両状態確認書</h1></div><div class="m">${esc(q.car.num)}<br>作成日 ${q.date}</div></div>
   <div class="ph6">${[['hero','外装 前'],['side','外装 横'],['rear','外装 後ろ'],['dash','運転席'],['seat2','後ろの席'],['meter','メーター（'+q.car.km.toLocaleString()+'km）']].map(x=>qI(q,x[0],'',x[1])).join('')}</div>
   <div class="g2"><div><h3>お車の状態</h3><table class="tkv">${[['車名', q.title+' '+q.car.grade], ['年式・型式', q.yearW+'・'+q.car.fmodel], ['走行距離', q.km], ['修復歴', q.b.repair], ['車検', shakenText(q.b,k)], ['保証', k.ws?'なし（現状渡し）':warText(q.b)], ['納車整備', qSeibiNm(q)], ['エアコン', s.acq], ['ベルト鳴き', s.belt==='on'?'あり':'なし'], ['気になる所', s.memo||'なし']].map(x=>`<tr><th>${x[0]}</th><td>${esc(x[1])}</td></tr>`).join('')}</table></div>
     <div><h3>タイヤ <small>新品は約8mm・前 ${esc(E.size[0])}／後 ${esc(E.size[1])}</small></h3>${qTireBox(E,'sm')}<h3>キズ・へこみ（現車で一緒に確認）</h3><div class="dmg"><div class="car2"></div><p>見つけた所に印を付けます<br>□ なし　□ あり（　　　　　　　　）</p></div></div></div>
   <div class="sg"><p>上記の状態を、現車で一緒に確認しました。記載のない不具合が分かった時は、保証の範囲で対応します。</p><div class="bx"><div><small>お客様</small><span></span></div><div><small>担当</small><span>${esc(q.staff.split(' ')[0])}</span></div></div></div>
   <div class="ft">${esc(q.c.name)}　${qTel(q)}　／　状態は ${q.date} 時点の確認の結果です</div></div>`; } },
 { name:'いまのモックの請求書', sub:'今の形（比べる用）', col:'#1f4fb4', legacy:'invoice' },
 /* 請求書（インボイス） */
 { name:'請求書（インボイス）', sub:'Stripe・会計ソフトの型・税率ごとの集計', col:'#4338ca', render:q=>{ const k = q.k, bill = q.loan ? q.loan.down : k.net, t10 = k.vehicle + q.sumK, due = jd(addDays(TODAY, 10));
   return `<div class="qv q10 x7"><div class="hd"><div class="lg"><b>${esc(q.c.name)}</b></div><div class="ti">請求書</div></div>
   <div class="meta"><div><small>請求番号</small>${esc(q.car.num)}-INV</div><div><small>請求日</small>${q.date}</div><div><small>お支払期限</small>${due}</div><div><small>担当</small>${esc(q.staff)}</div></div>
   <div class="pt"><div><small>ご請求先</small><div class="cu">${qCustLine(q)}</div></div><div><small>請求元</small><b>${esc(q.c.name)}</b><br>${qAddr(q)}<br>${qTel(q)}<br>登録番号 ${esc(q.c.inv)}</div></div>
   <div class="due"><div><small>ご請求金額（税込）</small><b>${qY(bill)}</b>${q.loan?`<span class="trl">お支払総額 ${yen(k.net)} 円のうち頭金。残り ${yen(q.loan.P)} 円は信販会社からお支払い</span>`:qTrLine(q)}</div><span>${due} までに<br>下記へお振込みください</span></div>
   <div class="car">${qI(q,'hero')}<div><b>${esc(q.title)} ${esc(q.car.grade)}</b><span>${esc(q.yearW)}・${q.km}・${esc(q.car.color)}・${esc(q.car.num)}</span><span>契約日 ${jd(q.o.date)}・納車予定 ${jd(q.o.delivery)}</span></div></div>
   <table class="it"><thead><tr><th>内容</th><th class="v">税率</th><th class="v">金額</th></tr></thead><tbody>
     ${[['車両販売価格（付属品・オプション '+q.nOpt+'点を含む）', '10%', k.vehicle], ['販売諸費用', '10%', q.sumK], ['税金・保険料（立替）', '非課税', k.taxIns], ['登録の法定費用（立替）', '非課税', q.sumT-k.nonTax], ['リサイクル預託金相当額', '対象外', k.nonTax]].map(r=>`<tr><td>${r[0]}</td><td class="v"><span class="tx t${r[1]==='10%'?1:r[1]==='非課税'?2:3}">${r[1]}</span></td><td class="v">${yen(r[2])}</td></tr>`).join('')}</tbody></table>
   <div class="sm"><div class="bank"><small>お振込先</small>${esc(q.c.bank)}<br><small>振込手数料はお客様のご負担でお願いします</small></div>
     <table><tr><td>10%対象 小計</td><td class="v">${yen(t10)}</td></tr><tr><td>消費税（10%）</td><td class="v">${yen(k.ctax)}</td></tr><tr><td>非課税・対象外</td><td class="v">${yen(k.taxIns + q.sumT)}</td></tr><tr class="s"><td>お支払総額</td><td class="v">${yen(k.cash)}</td></tr>${k.trade?`<tr><td>${qTrName(q)}</td><td class="v">▲${yen(k.trade)}</td></tr>`:''}${k.tradeLoan?`<tr><td>下取車の残債</td><td class="v">${yen(k.tradeLoan)}</td></tr>`:''}${q.loan?`<tr><td>信販会社からのお支払い</td><td class="v">▲${yen(q.loan.P)}</td></tr>`:''}<tr class="t"><td>ご請求金額</td><td class="v">${qY(bill)}</td></tr></table></div>
   <div class="pay"><div><b>お支払いについて</b><p>${q.loan?`頭金 ${yen(q.loan.down)} 円を ${due} までにお振込みください。残りの ${yen(q.loan.P)} 円は、信販会社の承認のあと信販会社から当店へ支払われます（${q.loan.n}回・月々 ${yen(q.loan.later)} 円）。`:`お支払総額を ${due} までにお振込みください。ご入金を確かめてから、登録と納車の準備を進めます。`}</p></div>
     <div><b>ご確認ください</b><p>${qNotes(q).slice(0,2).map(esc).join('<br>')}<br>振込名義はご契約者のお名前でお願いします。</p></div></div>
   <div class="ft"><span>${esc(q.c.name)}</span><span>${esc(q.car.num)}-INV</span><span>1 / 1</span></div></div>`; } },
 { name:'いまのモックの納品書', sub:'今の形（比べる用）', col:'#1f4fb4', legacy:'delivery' },
 /* 納品書・お引渡しの確認（ショールーム） */
 { name:'お引渡しの確認（ショールーム）', sub:'写真・明朝。お渡しする物をチェック・受け取りの署名', col:'#1c1917', render:q=>{ const k = q.k;
   const its = ['自動車検査証（車検証）','自賠責保険証明書','リサイクル券','保証書','スペアキー','取扱説明書','整備記録簿'].concat(q.opts.filter(o=>!o.sub && !/メンテナンスパック|納車整備を/.test(o.n)).slice(0,8).map(o=>o.n));
   return `<div class="qv x8"><div class="hero">${qI(q,'hero')}<div class="shade"></div><div class="top"><span>${esc(q.c.name)}</span><span>${esc(q.car.num)}</span></div><div class="name"><small>ご納車おめでとうございます</small><h1>お引渡しの確認</h1><p>${esc(q.title)} ${esc(q.car.grade)}</p></div></div>
   <div class="body"><div><h3>お車</h3><table class="tkv">${[['車名', q.title+' '+q.car.grade], ['年式', q.yearW], ['走行距離', q.km], ['車体色', q.car.color], ['納車日', jd(q.o.delivery)], ['保証', k.ws||warNone(q.b)?'なし':warText(q.b)+'（本日から）'], ['納車整備', qSeibiNm(q)]].map(x=>`<tr><th>${x[0]}</th><td>${esc(x[1])}</td></tr>`).join('')}</table>
       <h3>これからのこと</h3><p class="tx">・保証の内容は保証書でご確認ください<br>・次の点検・車検の時期は、当店からご案内します<br>・気になる所があれば、いつでもご連絡ください（${esc(q.c.tel)}）</p></div>
     <div><h3>お渡しする物 <small>確かめて ✓</small></h3><div class="its">${its.map(t=>`<div><span class="bx"></span>${esc(t)}</div>`).join('')}</div></div></div>
   <div class="sg"><p>上記のお車と付属品を、確かに受け取りました。</p><div class="bx"><div><small>お客様（受領）</small><b>${qBuyer(q)||'　'}</b><span></span></div><div><small>お渡しした担当</small><b>${esc(q.staff)}</b><span></span></div></div></div>
   <div class="foot"><span>${esc(q.c.name)}　${qAddr(q)}　${qTel(q)}</span><span>${q.date}</span></div></div>`; } },
];

/* ---------- 見積書：形ごとの設定（1枚目に入る「増える行」の上限 cap・ローンの行の重み lw・2ページ目 p2）
   増える行＝OP の行＋値引き・諸費用の増え＋下取の行×1.5＋ローンの行×lw。超えたら OP を1行にまとめて2ページ目（別紙）へ ---------- */
const QV_CAP = [10, 11, 14, 10, 13, 10, 11, 10, 16, 10], QV_LW = [2, 3, 0, 1, 0, 0, 1, 0, 3, 1];
QV.forEach((v,i)=>Object.assign(v, { cap:QV_CAP[i], lw:QV_LW[i], p2:QV_P2[i], p2left:[0,1,2,4,7].includes(i) }));
/* 🗣「6のプラン比較は別枠に入れて、いままでのモックに入っていた見積を6番に」 */
QC[1] = Object.assign(QV[5], { capMode:'names', name:'横並び・✓（旧・見積書サンプル6番）' });
QV[5] = { name:'前の見積書（v4.58 まで見積タブで使用）', sub:'以前の形（覚えておく用）', col:'#1f4fb4', legacy:'quote' };
function qvFold(q, v){ const k = q.k, trR = q.tr ? 1 + (k.trade?1:0) + (k.tradeLoan?1:0) : 0;
  if (v.legacy || !v.cap || !v.render) return q;
  if (v.capMode === 'names'){ const names = []; qPlans(q).forEach(x=>x.items.forEach(it=>{ if (!/メンテナンスパック|^納車整備を/.test(it.n) && !names.includes(it.n)) names.push(it.n); }));
    q.cap = v.cap - (k.trade?1:0) - (k.tradeLoan?1:0); if (names.length > q.cap) q.fold = true; return q; }
  q.cap = v.cap; const ext = (k.disc ? 1 : 0) + Math.max(0, q.feesK.length + q.feesT.length + q.taxes.length - 7);
  if (q.opts.length + ext + trR*1.5 + (q.loan ? v.lw : 0) <= q.cap) return q;
  const tbd = q.opts.some(o=>o.tbd);
  return Object.assign(q, { fold: true, opts1: [{ n: `付属品・オプション ${q.nOpt}点${tbd ? '（サイズ確認後に決定の品を含む）' : ''}`, a: k.optSum, fold: true }] }); }
function qvPage2(q, v){ return v.p2(Object.assign({}, q, { foldNote: v.p2left ? '左の明細の合計' : '上の明細の合計' })); }

/* ---------- 装備の説明（🗣 2026-10-19「装備品チェックを客が持って帰るが、結局何が何だっけ？ってなる。車に詳しくない人もいる。一般論でいいから解説する資料。
   辞書としてずらーっと用意しておいて、その車の装備品チェックで印刷される内容に合わせて一覧として並べる。例：レーンキープアシスト……車が車線からはみ出さないように
   お知らせやハンドル操作の一部を行う機能です ※アシスト内容は車種によります」「今後も増える可能性はある。ある程度ないものをフォローするイメージで」）
   EQ_DICT＝[ 見出し, 説明, ※の注意, 別の呼び方（装備品チェックの項目名・メーカーごとの名前） ]。分類ごと。
   いまの装備品チェック（CarFlow equipment-def.js）の項目は全部入れた。それ以外（★）はこれから項目が増えた時の先回り。
   引き方：装備品チェックの項目名（プルダウンの値つき「ヘッドライト（LED）」を先に）→ 見出し・別の呼び方。辞書にない装備は名前だけ出す（画面に「辞書にない」と出る・印刷はされない）
   本物では：辞書は _shared に1つ置き、カードの装備品チェックの印刷・見積の帳票から引く想定（まだ決めていない） ---------- */
const EQ_DICT = [
 { t:'オーディオ・ナビ', items:[
  ['カーナビ','画面に地図を出して、目的地までの道順を声と画面で案内する装置です。','地図は年数がたつと古くなります。更新は機種によって有料です。',['ナビ']],
  ['ナビの媒体','地図のデータが入っている記録の種類です（HDD・SSD/メモリ・DVD など）。','SSD/メモリは読み込みが速く、振動に強いのが特長です。'],
  ['TV','ナビの画面でテレビ放送が見られます。','走行中は安全のため映像が映らず、音声だけになります。',['テレビ']],
  ['TV（フルセグ）','家のテレビと同じきれいな画質の放送を受信します。','電波の弱い所では映りにくくなります（ワンセグに切り替わる機種もあります）。走行中は映像が映りません。',['フルセグ']],
  ['TV（ワンセグ）','携帯電話向けの放送を受信します。','画質はフルセグより粗くなります。走行中は映像が映りません。',['ワンセグ']],
  ['Bluetooth','スマートフォンと線をつながずに接続し、音楽を流したり、ハンズフリーで通話したりできます。','使える機能はナビとスマートフォンの機種によります。',['ブルートゥース','BT']],
  ['バックカメラ','後ろに下がる時、車の後ろの様子をナビの画面に映します。','画面だけに頼らず、目でも周りを確かめてください。',['リアカメラ','バックモニター']],
  ['フロントカメラ','車の前の見えにくい所（鼻先の下など）を画面に映します。見通しの悪い交差点や狭い道で役立ちます。'],
  ['サイドカメラ','助手席側の側面・足もとを画面に映し、幅寄せや縁石との距離を確かめやすくします。',null,['サイドモニター']],
  ['全周囲カメラ','前後左右のカメラの映像を合わせて、車を真上から見たような映像を画面に出します。駐車や狭い道のすれ違いに便利です。','車種により「アラウンドビューモニター」「パノラミックビューモニター」などの名前です。',['アラウンドビューモニター','パノラミックビューモニター','マルチビューカメラ','360度カメラ','全方位カメラ']],
  ['後部モニター','後ろの席の天井などに付いた画面で、後ろの席の人がテレビや映像を見られます。',null,['リアモニター','フリップダウンモニター','後席モニター']],
  ['CD','音楽CDを再生できます。',null,['CDプレーヤー']],
  ['DVD再生','DVDの映像を再生できます。','走行中は映像が映らず、音声だけになります。',['DVD']],
  ['音楽プレーヤー接続','USBなどの差し込み口にスマートフォンや音楽プレーヤーをつないで、車のスピーカーで音楽を聴けます。','つなぎ方（差し込み口の形）は機種によります。',['USB接続','AUX','外部入力']],
  ['ディスプレイオーディオ','スマートフォンをつないで、地図アプリや音楽などを車の画面で使う装置です。','★ナビの機能は別売りのことがあります。',['DA']],
  ['Apple CarPlay・Android Auto','スマートフォンのアプリ（地図・音楽・電話など）を車の画面で操作できる仕組みです。','★使えるアプリは限られます。',['CarPlay','Android Auto','アップルカープレイ','アンドロイドオート']],
  ['USB電源','スマートフォンなどを充電できる差し込み口です。','★',['USB充電','USBポート']],
  ['ワイヤレス充電','対応したスマートフォンを置くだけで充電できます。','★スマートフォンが置くだけ充電に対応している必要があります。',['おくだけ充電','Qi']],
  ['AC100V電源','家庭用と同じ形のコンセントで、家電製品を使えます。','★使える電力（W数）に上限があります。',['100Vコンセント','アクセサリーコンセント','AC電源']],
  ['プレミアムサウンド','専用のスピーカーやアンプで、より良い音で音楽を楽しめます。','★',['プレミアムサウンドシステム']],
  ['ドライブレコーダー','走行中の映像を記録します。事故やトラブルの時の記録として役立ちます。','★録画する範囲（前だけ・前後）や保存のしかたは機種によります。',['ドラレコ']] ]},
 { t:'快適装備・シート', items:[
  ['エアコン','車内を冷やしたり暖めたり、窓の曇りを取ったりします。',null,['クーラー']],
  ['オートエアコン','設定した温度になるよう、風の強さや吹き出し口を自動で調節します。','★',['フルオートエアコン']],
  ['デュアルエアコン','運転席側と助手席側で、別々の温度に設定できるエアコンです。',null,['左右独立温度調整','デュアルオートエアコン']],
  ['リアエアコン','後ろの席用の吹き出し口や操作があるエアコンです。','★',['リアクーラー','後席エアコン']],
  ['クルーズコントロール','アクセルを踏み続けなくても、決めた速度を保って走ります。高速道路での疲れを減らします。','前の車に合わせた加速・減速はしません。ブレーキを踏むと解除されます。',['オートクルーズ','クルコン']],
  ['レーダークルコン','決めた速度を上限に、前の車との距離を保ちながら自動で加速・減速します。','車種によって、止まるところまで付いていくもの・一定の速度以上で働くものがあります。運転の主役は運転する人です。',['レーダークルーズコントロール','アダプティブクルーズコントロール','ACC','全車速追従機能付クルーズコントロール']],
  ['シートヒーター','座面や背もたれを電気で温めます。エアコンより早く温かさを感じられます。',null,['ヒーター付きシート']],
  ['シートクーラー','座面や背もたれから風を出し、蒸れを抑えて涼しく座れます。',null,['シートベンチレーション','ベンチレーションシート']],
  ['革シート','表面が革のシートです。高級感があり、汚れを拭き取りやすいのが特長です。','合成皮革のこともあります。夏の日差しで熱くなりやすいので、日よけをおすすめします。',['本革シート','レザーシート']],
  ['パワーシート','座る位置や背もたれの角度を、スイッチで電動で調節できます。',null,['電動シート']],
  ['メモリーシート','運転する人ごとのシートの位置を覚えさせて、ボタン一つで呼び出せます。','★',['ポジションメモリー']],
  ['ベンチシート','前の席が左右つながった形のシートです。車内を移動しやすく、ゆったり座れます。',null,['フロントベンチシート']],
  ['3列シート','座席が3列あり、6〜8人が乗れます。','乗れる人数（乗車定員）は車検証で確かめてください。',['3列']],
  ['ウォークスルー','座席の間を通って、車内で前後の席へ移れる作りです。雨の日の乗り降りや、お子さまの世話に便利です。'],
  ['フルフラットシート','背もたれを倒して座面とつなげ、平らな広い空間にできます。休憩や車中泊に便利です。','走行中はシートを戻し、シートベルトをしてください。',['フルフラット']],
  ['助手席リフトアップ','助手席が回転して車の外へ出て、下がります。足の不自由な方や高齢の方が乗り降りしやすくなります。',null,['リフトアップシート','助手席回転シート','福祉車両']],
  ['キャプテンシート','2列目が左右に分かれた1人掛けのシートです。ひじ掛けが付き、ゆったり座れます。','★',['セカンドキャプテンシート']],
  ['オットマン','シートに足をのせる台が付いていて、足を伸ばしてくつろげます。','★'],
  ['ステアリングヒーター','ハンドルを電気で温めます。冬の朝でも手が冷たくなりにくくなります。','★',['ハンドルヒーター']],
  ['空気清浄機能','エアコンの風にイオンなどを含ませ、車内の空気をきれいに保つ機能です。','★名前（ナノイー・プラズマクラスターなど）や働きはメーカーによります。',['ナノイー','プラズマクラスター','空気清浄機']] ]},
 { t:'電装・キー・ドア', items:[
  ['スマートキー','キーを持っているだけで、ドアノブやボタンに触れてカギの開け閉めができます。','キーの電池が切れた時の使い方は取扱説明書をご覧ください。',['インテリジェントキー','スマートエントリー','キーフリー']],
  ['キーレス','キーのボタンを押して、離れた所からドアのカギを開け閉めできます。',null,['キーレスエントリー']],
  ['プッシュスタート','キーを差し込まず、ブレーキを踏んでボタンを押すとエンジン（システム）がかかります。',null,['プッシュスタートシステム','エンジンスタートボタン']],
  ['リモートスタート','離れた所からエンジンをかけて、乗る前にエアコンで車内を冷やしたり暖めたりできます。','場所によっては条例でアイドリングが禁止されています。',['エンジンスターター']],
  ['スペアキー','予備のキーです。','なくすと作り直しに費用と日数がかかります。大切に保管してください。',['予備キー']],
  ['パワーウィンドウ','スイッチで窓を電動で開け閉めできます。','お子さまの手や首のはさみ込みにご注意ください。',['PW']],
  ['パワースライドドア','スライドドアを、ボタンやドアノブの操作で電動で開け閉めできます。荷物で両手がふさがっている時やお子さまの乗り降りに便利です。','はさみ込みにご注意ください。',['電動スライドドア','両側パワースライドドア','片側パワースライドドア']],
  ['ハンズフリースライドドア','キーを持って、ドアの下に足を出し入れすると、スライドドアが開け閉めします。','★'],
  ['電動リアゲート','後ろのドア（バックドア）を、ボタンで電動で開け閉めできます。','開ける前に、後ろや上（天井の低い車庫など）に十分な空間があるか確かめてください。',['パワーバックドア','パワーテールゲート','電動バックドア']],
  ['ハンズフリーバックドア','キーを持って、車の後ろの下に足を出し入れすると、バックドアが開け閉めします。','★'],
  ['ETC','有料道路の料金所を止まらずに通れます。','ETCカードの差し忘れにご注意ください。持ち主が変わった時は「再セットアップ（車の登録のし直し）」が要ります。',['ETC車載器']],
  ['ETC2.0','ETCの働きに加えて、渋滞や安全運転の情報も受け取れます。','★持ち主が変わった時は再セットアップが要ります。'],
  ['ウェルカムライト','カギを開けた時などにライトが点き、暗い所でも足もとや車のまわりを照らします。',null,['ウェルカムランプ']],
  ['電動パーキングブレーキ','駐車ブレーキを、スイッチで掛けたり外したりできます。アクセルを踏むと自動で外れるものもあります。','★',['EPB','電動パーキング']],
  ['オートブレーキホールド','信号待ちなどで止まった時、ブレーキペダルから足を離しても止まったままにします。アクセルを踏むと解除されます。','★',['ブレーキホールド']],
  ['電動格納ミラー','ドアミラーを、スイッチ（またはカギの開け閉め）でたためます。','★',['電動格納式ドアミラー','オート格納ミラー']],
  ['オートワイパー','雨を感知して、ワイパーが自動で動き、速さも調節します。','★',['雨滴感知ワイパー','レインセンサー']],
  ['デジタルインナーミラー','後ろのカメラの映像をルームミラーに映します。荷物や後ろの席の人で見えにくい時も後ろを確かめられます。','★',['デジタルルームミラー','スマートルームミラー']],
  ['寒冷地仕様','寒い地域・雪の多い地域向けに、バッテリーやヒーターなどを強めた仕様です。','★',['寒冷地']] ]},
 { t:'ライト', items:[
  ['ヘッドライト','夜や暗い所で前を照らすライトです。'],
  ['ヘッドライト（LED）','明るく白い光で、使う電気が少なく、長持ちするライトです。',null,['LEDヘッドライト','LEDヘッドランプ']],
  ['ヘッドライト（HID/キセノン）','電気の放電で光る、明るく白いライトです。','バルブが切れると、交換に費用がかかります。',['HID','キセノン','ディスチャージヘッドランプ']],
  ['ヘッドライト（ハロゲン）','昔から使われている電球のライトです。暖かみのある色の光です。',null,['ハロゲン']],
  ['オートハイビーム','前の車や対向車がいない時は自動でハイビーム（遠くまで照らす）に、いる時はロービームに切り替えます。','周りの明るさや天気によって、切り替わらないことがあります。',['AHB','ハイビームアシスト']],
  ['アダプティブハイビーム','ハイビームのまま、前の車や対向車に当たる部分だけを自動で照らさないようにします。','★',['アダプティブハイビームシステム','AHS','アダプティブドライビングビーム']],
  ['オートライト','周りの暗さに合わせて、ライトを自動で点けたり消したりします。','★'],
  ['フォグランプ','霧や雨の時に、手前の足もとを照らして見やすくするライトです。','★',['フォグライト','LEDフォグ']],
  ['デイライト','昼間に点いて、周りの車や歩く人からこちらを見つけやすくするライトです。','★',['デイタイムランニングランプ','DRL']] ]},
 { t:'安全装備', items:[
  ['ABS','急ブレーキの時にタイヤがロック（回らずに滑る）しないよう、自動でブレーキを調節します。ハンドルでよけやすくなります。','働いている時はペダルがガタガタしますが、そのまま強く踏み続けてください。'],
  ['エアバッグ（運助）','ぶつかった時、運転席と助手席の前に袋がふくらみ、頭や胸への衝撃をやわらげます。','シートベルトをしていることが前提です。',['デュアルエアバッグ','エアバッグ']],
  ['サイドエアバッグ','横からぶつかられた時、座席の横でふくらみ、体を守ります。','窓の上からふくらむカーテンエアバッグが付く車もあります。'],
  ['カーテンエアバッグ','横からぶつかられた時、窓の上からカーテンのようにふくらみ、頭を守ります。','★',['カーテンシールドエアバッグ','SRSカーテンシールドエアバッグ']],
  ['横滑り防止','カーブや滑りやすい道で車が横に滑りそうな時、ブレーキやエンジンの力を自動で調節して、向きを保ちます。','車種により「VSC」「ESC」「VDC」「DSC」などの名前です。',['VSC','ESC','VDC','DSC','ESP','横滑り防止装置']],
  ['衝突安全ボディ','ぶつかった時の衝撃を車体のつぶれ方で吸収し、乗っている人の空間を守るように作られた車体です。'],
  ['衝突軽減ブレーキ','前の車や歩く人などにぶつかりそうな時、警報で知らせ、それでも危ない時は自動でブレーキをかけて、ぶつかるのを防いだり被害を軽くしたりします。','どんな時でも止まれるわけではありません。対象（自転車・夜の歩行者など）や働く速さは車種によります。',['自動ブレーキ','衝突被害軽減ブレーキ','プリクラッシュセーフティ','エマージェンシーブレーキ']],
  ['レーンアラート','車線からはみ出しそうになると、音や表示で知らせます。','白線が見えにくい道では働かないことがあります。',['車線逸脱警報','レーンディパーチャーアラート','LDW']],
  ['レーンキープアシスト','車が車線からはみ出さないように、お知らせやハンドル操作の一部を行います。','★アシストの内容は車種によります。ハンドルから手を離さないでください。',['車線維持支援','LKA','レーントレーシングアシスト']],
  ['自動駐車','止めたい場所を決めると、ハンドル操作など（車種によってはアクセル・ブレーキも）を車が行い、駐車を手伝います。','周りの安全は運転する人が確かめてください。',['アドバンストパーク','プロパイロットパーキング']],
  ['パーキングアシスト','駐車の時、画面のガイド線やハンドル操作の手伝いで、車庫入れや縦列駐車をしやすくします。','手伝う内容は車種によります。',['パーキングアシスト機能','駐車支援']],
  ['コーナーセンサー','車の角やバンパーが壁や車に近づくと、音で知らせます。','細い物・低い物は感知しにくいことがあります。',['クリアランスソナー','パーキングセンサー','バックソナー','障害物センサー']],
  ['盗難防止装置','決められたキー以外ではエンジンがかからない仕組み（イモビライザー）などで、盗難を防ぎます。',null,['イモビライザー','セキュリティアラーム','オートアラーム']],
  ['ブラインドスポットモニター','斜め後ろの見えにくい所にいる車を感知し、ドアミラーのランプなどで知らせます。車線を変える時に役立ちます。','★',['BSM','ブラインドスポットインフォメーション','後側方車両検知警報']],
  ['後方車両接近警報','駐車場から後ろ向きに出る時、左右から近づく車を感知して知らせます。','★',['RCTA','リアクロストラフィックアラート','後退時車両接近警報']],
  ['踏み間違い加速抑制','止まっている時やゆっくり走っている時に、アクセルとブレーキを踏み間違えて急に進みそうになると、加速を抑えます。','★',['ペダル踏み間違い時加速抑制装置','誤発進抑制','インテリジェントクリアランスソナー']],
  ['先行車発進お知らせ','信号待ちなどで前の車が発進したのに気づかない時、音や表示で知らせます。','★',['先行車発進告知']],
  ['標識認識','カメラで道路標識（制限速度・一時停止など）を読み取り、メーターなどに表示します。','★',['ロードサインアシスト','標識認識機能']],
  ['ふらつき警報','運転のふらつきから疲れや眠気を感知し、休憩をすすめます。','★',['ふらつき注意喚起','ドライバーアテンションアラート']],
  ['ヘッドアップディスプレイ','速度や道案内などを、フロントガラスの先に浮かぶように映します。目線を大きく動かさずに確かめられます。','★',['HUD']],
  ['タイヤ空気圧警報','タイヤの空気が減ると、メーターの表示で知らせます。','★',['TPMS','タイヤ空気圧モニター']],
  ['ISOFIX','チャイルドシートを、車の骨組みにある専用の金具にしっかり固定できる仕組みです。','★取り付けられるのは ISOFIX に対応したチャイルドシートです。',['ISOFIX対応チャイルドシート固定専用バー']] ]},
 { t:'外装・スタイル・走り', items:[
  ['アルミホイール','鉄のホイールより軽く、見た目もよいホイールです。','タイヤを替える時は、ホイールに合ったナットを使ってください。',['アルミ','AW']],
  ['エアロ','車体の前・後ろ・横に付けた外装の部品です。見た目を引き締め、走りの安定にも役立ちます。','車高が低くなるので、段差や車止めでこすらないようご注意ください。',['エアロパーツ']],
  ['サンルーフ','屋根にガラスの窓があり、光を入れたり開けたりできます。','開け閉めのしかた・できることは車種によります。',['ムーンルーフ']],
  ['パノラマルーフ','屋根の大部分がガラスになっていて、車内が明るく開放的です。','★',['パノラミックルーフ','グラスルーフ']],
  ['UVガラス','紫外線（日焼けのもと）をカットするガラスです。','すべての紫外線を防げるわけではありません。',['UVカットガラス']],
  ['IRカットガラス','赤外線をカットして、日差しのジリジリした暑さを抑えるガラスです。','★',['スーパーUV&IRカットガラス']],
  ['プライバシーガラス','後ろの席の窓が濃い色のガラスで、外から車内が見えにくくなります。','★',['スモークガラス']],
  ['ローダウン','車高を下げてあります。見た目が引き締まり、カーブで安定します。','段差・車止め・坂の入口で下をこすらないようご注意ください。乗り心地はかためです。',['車高調','ローダウンサス']],
  ['アイドリングストップ','信号待ちなどで止まると自動でエンジンを止め、燃料と排気ガスを減らします。ブレーキを離すと再び動き出します。','スイッチで働かないようにもできます。バッテリーは専用の物が要ります。',['アイドリングストップ機能']],
  ['ルーフレール','屋根の上の左右にあるレールで、キャリアなどを取り付けられます。','★'],
  ['4WD','4つのタイヤすべてに力を伝えて走ります。雪道やぬかるみで滑りにくくなります。','★',['AWD','四輪駆動','4駆']],
  ['ターボ','排気ガスの力で空気を押し込み、小さなエンジンでも力強く走れます。','★',['ターボチャージャー']],
  ['ハイブリッド','エンジンとモーターを組み合わせて走り、燃費をよくした車です。','★',['HV']],
  ['パドルシフト','ハンドルの裏にあるレバーで、手を離さずにギアを切り替えられます。','★'],
  ['パンク修理キット','スペアタイヤの代わりに積まれている、パンクを応急で直す道具です。','★大きな傷・横の傷のパンクは直せません。',['応急修理キット']] ]},
 { t:'来歴・付属品', items:[
  ['1オーナー','新車から前のオーナーが1人だけの車です。',null,['ワンオーナー']],
  ['禁煙車','前のオーナーが車内でたばこを吸っていなかった車です。'],
  ['取扱説明書','車の使い方が書かれた本です。装備の詳しい使い方はこちらをご覧ください。','車種によっては、メーカーのホームページでも見られます。',['取説']],
  ['保証書','メーカーの保証の内容が書かれた書類です。','メーカーの保証が残っている車は、点検（保証継承）を受けると引き継げます。',['メンテナンスノート']],
  ['点検整備記録簿','これまでの点検・整備の記録です。どんな手入れをしてきたかがわかります。','★',['記録簿']] ]},
];
const _eqN = x => String(x||'').normalize('NFKC').replace(/\s/g,'').toLowerCase();
const EQ_IDX = (() => { const m = new Map(); EQ_DICT.forEach(c=>c.items.forEach(e=>{ const o = { n:e[0], d:e[1], note:e[2]==='★' ? '' : String(e[2]||'').replace(/^★/,''), soon: e[2] && /^★/.test(e[2]), al:e[3]||[], t:c.t }; [o.n].concat(o.al).forEach(k=>{ if (!m.has(_eqN(k))) m.set(_eqN(k), o); }); })); return m; })();
/* 装備品チェックの1行 → 辞書。プルダウンの値つき（「ヘッドライト（LED）」）を先に引く */
const eqDict = (n, v) => (v && EQ_IDX.get(_eqN(n+'（'+v+'）'))) || EQ_IDX.get(_eqN(n)) || null;
/* その車の「あり」の装備を、装備品チェックの並びのまま辞書で引く */
function eqExplain(q){ const E = qEquip(q), miss = [];
  const cats = E.cats.map(c=>({ t:c.t, rows: c.rows.filter(r=>r.on).map(r=>{ const e = eqDict(r.n, r.v); if (!e) miss.push(r.n); return { n: r.v ? r.n+'（'+r.v+'）' : r.n, e }; }) })).filter(c=>c.rows.length);
  return { cats, miss }; }
/* 紙に分ける：1段の幅（344px）で実際に並べて高さを測り、2段組に上から詰めたつもりで割り振る（字数の見積もりでは段の切れ目の余白が読めなかった）。
   H1＝1枚目の1段の高さ・Hn＝2枚目から。見出しは次の1行と離さない */
function exPages(cats, H1, Hn, all){ const box = document.createElement('div'); box.className = 'qv ex'; box.style.cssText = 'position:absolute;left:-99999px;top:0;width:344px;height:auto;display:block;padding:0;visibility:hidden';
  box.innerHTML = cats.map(c=>`<h4>${esc(c.t)}</h4>`+c.rows.map(r=>exItem(r, all)).join('')).join('') + '<i style="display:block;height:0"></i>'; document.body.appendChild(box);
  const el = [...box.children], top = el.map(e=>e.offsetTop); box.remove(); let n = 0; const hs = cats.map(c=>{ const h = top[n+1]-top[n]; n++; return { h, rows: c.rows.map(()=>{ const x = top[n+1]-top[n]; n++; return x; }) }; });
  const pages = [[]]; let cap = H1, col = 0, used = 0;
  const fit = h => { if (used + h <= cap) return; col++; used = 0; if (col > 1){ pages.push([]); cap = Hn; col = 0; } };
  cats.forEach((c,ci)=>{ let cur = null; c.rows.forEach((r,ri)=>{ const h = hs[ci].rows[ri], hh = hs[ci].h; const pg0 = pages.length;
    if (!cur){ fit(hh + h); } else fit(h);
    if (!cur || pages.length !== pg0){ if (cur && pages.length !== pg0){ cur = null; fit(hh + h); } cur = { t:c.t, rows:[], cont: ri>0 }; pages[pages.length-1].push(cur); used += hh; }
    cur.rows.push(r); used += h; }); });
  return pages; }
const exItem = (r, all) => `<div class="it"><b>${esc(r.n)}</b>${all && r.e && r.e.al.length ? `<span class="al">別名：${r.e.al.map(esc).join('・')}</span>` : ''}${r.e ? `<p>${esc(r.e.d)}</p>${r.e.note?`<small>※${esc(r.e.note)}</small>`:''}` : ''}</div>`;
const exBody = (pg, all) => `<div class="body">${pg.map(c=>`<h4>${esc(c.t)}${c.cont ? '（つづき）' : ''}</h4>${c.rows.map(r=>exItem(r, all)).join('')}`).join('')}</div>`;
const exFoot = (q, no, n) => `<div class="foot"><span>${esc(q.c.name)}　${qTel(q)}</span><span>装備の働きや名前は、車種・年式によって違います。詳しくは取扱説明書をご覧ください。${n>1?`　${no}/${n}`:''}</span></div>`;
const exHead = (q, sub, h1) => `<div class="hd"><div><small>${esc(q.c.name)}</small><h1>${h1||'装備のご説明'}</h1></div><div class="car"><b>${esc(q.car.maker)} ${esc(q.car.model)}</b>${esc(q.car.grade)}　${esc(q.car.num)}${sub?'<br>'+sub:''}</div></div>`;
const QEX = [
 /* 1 その車の装備品チェックの「あり」だけを、装備品一覧と同じ並びで */
 { name:'この車の装備の説明（お客様にお渡し）', sub:'装備品チェックの「あり」だけを辞書で説明・2段組', col:'#a8894f', render:q=>{ const X = eqExplain(q), P = exPages(X.cats, X.miss.length ? 866 : 900, 962); q.fold = P.length > 1; q.exP = P; q.exMiss = X.miss;
   return `<div class="qv ex">${exHead(q, q.date+' 時点の装備品チェックより')}
   <div class="lead">お渡しした「装備品一覧」に載っている装備が、それぞれどんな働きをするのかを、ふだんの言葉でまとめました。どれも一般的な説明です。この車での細かな働き・使い方は、取扱説明書やスタッフにお尋ねください。</div>
   ${exBody(P[0])}${X.miss.length?`<div class="miss">画面だけの表示（印刷されない）：辞書にない装備 ${X.miss.length}個＝${X.miss.map(esc).join('・')}。名前だけで出しています</div>`:''}${exFoot(q, 1, P.length)}</div>`; },
   p2:q=> q.exP.slice(1).map((pg,i)=>`<div class="qv ex">${exHead(q)}${exBody(pg)}${exFoot(q, i+2, q.exP.length)}</div>`).join('</div><div class="paper qvp">') },
 /* 2 辞書の全部（社内の確認用） */
 { name:'辞書の全部（社内の確認用）', sub:'説明の文を見直す用・★はまだ装備品チェックに無い項目', col:'#57534e', render:q=>{ const cats = EQ_DICT.map(c=>({ t:c.t, rows: c.items.map(e=>({ n:(EQ_IDX.get(_eqN(e[0])).soon?'★ ':'')+e[0], e:EQ_IDX.get(_eqN(e[0])) })) }));
   const P = exPages(cats, 900, 1022, true); q.fold = P.length > 1; q.exP = P; const n = cats.reduce((s,c)=>s+c.rows.length,0), soon = cats.reduce((s,c)=>s+c.rows.filter(r=>r.e.soon).length,0);
   return `<div class="qv ex">${exHead({ c:q.c, car:{ maker:'社内の確認用', model:'', grade:'', num:'' }, date:q.date }, `${n}項目（★ これからの先回り ${soon}）`, '装備の説明の辞書')}
   <div class="lead">社内の確認用。お客様にお渡しする「装備の説明」は、ここから車ごとに「あり」の装備だけを引いて作ります。★の項目はまだ装備品チェックに無い装備（項目が増えた時の先回り）。別名＝装備品チェックの項目名やメーカーごとの呼び方で、どれでも引けます。</div>
   ${exBody(P[0], true)}${exFoot(q, 1, P.length)}</div>`; },
   p2:q=> q.exP.slice(1).map((pg,i)=>`<div class="qv ex">${exBody(pg, true)}${exFoot(q, i+2, q.exP.length)}</div>`).join('</div><div class="paper qvp">') },
];

/* ---------- 帳票の種類 ---------- */
const QS_CATS = [
  { id:'quote',   name:'見積書',       list:QV },
  { id:'compare', name:'プラン比較',   list:QC },
  { id:'equip',   name:'装備品一覧',   list:QE },
  { id:'eqx',     name:'装備の説明',   list:QEX, sub:'装備品チェックの「あり」を辞書で' },
  { id:'order',   name:'売買契約書（横）', list:QO, order:true },
  { id:'terms',   name:'約款',         list:QT, order:true },
  { id:'other',   name:'そのほか',     list:QX, order:true, sub:'確認書・状態・請求・お引渡し' } ];
const qsCat = () => QS_CATS.find(c=>c.id===S.ui.qsCat) || QS_CATS[0];
/* 注文の見本：売約した車はその注文、まだの車は「いまの見積で注文した」として作る（モックだけ） */
const qsOrder = (car, p, who) => car.order && (!who || car.order.cust===who.id) ? car.order : { cust: who ? who.id : '', plan: p, ver:1, date: TODAY, delivery: addDays(TODAY, 21), promise:'', startBefore:'shinai', sample:true };
const QS_LEG = { quote:(d,k)=>docQuoteOld(d,k), compare:(d,k)=>docCompare(d), equip:(d,k)=>docEquip(d,k), orderH:(d,k)=>docOrderH(d,k), terms:(d,k)=>docTerms(), contract:(d,k)=>docContract(d,k), cond:(d,k)=>docCond(d,k), invoice:(d,k)=>docInvoice(d,k), delivery:(d,k)=>docDelivery(d,k) };
/* サンプルの画面（左のメニュー「見積書サンプル」）。最初は写真のある KM-0511 ヴォクシー */
function qsCtx(){ const u = S.ui, cars = S.cars.filter(c=>c.base), car = carOf(u.qsCar) && carOf(u.qsCar).base ? carOf(u.qsCar) : (carOf('k0511') || cars[0]);
  const p = ['base','A','B','C'].includes(u.qsPlan) ? u.qsPlan : 'B', who = u.qsCust ? (car.custs||[]).find(x=>x.id===u.qsCust) || null : null;
  const ctx = qsMk(car, who, p);
  return { d:{ car, ctx, who, kind: who?'cust':'std', mk: pp => qsMk(car, who, pp), tradeModel: u.qsTr ? 'H25 ホンダ フィット 13G' : (who && who.tradeModel) || '' }, cars, car, p, who }; }
/* 1つの形の紙（1枚、見積で OP が多ければ2枚） */
function qsPaper(i, cat){ cat = cat || qsCat(); const v = cat.list[i], x = qsCtx(), d = x.d, k = calc(d.ctx); _docNew = !!d.ctx.b.newCar;
  if (v.legacy){ const car = d.car, had = car.order, dd = Object.assign({}, d, { kind: cat.order ? 'order' : d.kind });
    if (cat.order && !had) car.order = qsOrder(car, x.p, x.who);
    try { return `<div class="paper ${v.land?'land':''} qsleg">${QS_LEG[v.legacy](dd, k)}</div>`; } finally { if (!had) car.order = null; } }
  const q = qvFold(qvData(d, k), v); q.o = qsOrder(d.car, x.p, x.who); q.u = x.who;
  return `<div class="paper qvp ${v.land?'land':''}">${v.render(q)}</div>` + (q.fold && v.p2 ? `<div class="paper qvp">${qvPage2(q, v)}</div>` : ''); }
function renderQS(){ const u = S.ui, cat = qsCat(), L = cat.list, i = Math.min(Math.max(+u.qsI||0, 0), L.length-1), x = qsCtx(), nAll = QS_CATS.reduce((s,c)=>s+c.list.length,0);
  $('q-root').innerHTML = `<div class="q-wrap qs-wrap"><div class="q-top"><div><div class="t">${I('files','📑',18)} 帳票サンプル <span class="q-mock">モックだけ・${QS_CATS.length}種類 ${nAll}パターン</span></div><div class="s">中身（金額・内訳・注意書き）は見積と同じ計算。見た目・並べ方・書き方だけを変えている。どの種類も 1番（青）＝いまのモックの帳票。写真があるのは KM-0511 ヴォクシー・KM-0525 ノア。印刷は「実際のサイズ（100%）」で</div></div></div>
    <div class="qs-cats">${QS_CATS.map(c=>`<button class="${c===cat?'on':''}" onclick="S.ui.qsCat='${c.id}';S.ui.qsI=0;save();render()"><b>${esc(c.name)}</b><small>${c.list.length}パターン${c.sub?'・'+esc(c.sub):''}</small></button>`).join('')}</div>
    <div class="qs-grid"><div class="qs-list">${L.map((v,j)=>`<button class="${j===i?'on':''} ${v.legacy?'leg':''}" onclick="S.ui.qsI=${j};save();render()"><i style="background:${v.col}"></i><span><b>${j+1}. ${esc(v.name)}${v.land?' <em>横</em>':''}</b><small>${esc(v.sub)}</small></span></button>`).join('')}
        <button class="all" onclick="qsPrintAll()">${I('printer','🖨',14)}<span><b>この種類をまとめて印刷</b><small>${esc(cat.name)} ${L.length}パターン（いまの条件のまま）</small></span></button>
        <button class="all" onclick="qsPrintAll(true)">${I('printer','🖨',14)}<span><b>全部の帳票をまとめて印刷</b><small>${QS_CATS.length}種類 ${nAll}パターン</small></span></button></div>
      <div class="qs-main"><div class="qs-bar"><label>お車 <select class="q-in" onchange="S.ui.qsCar=this.value;S.ui.qsCust='';save();render()">${x.cars.map(c=>`<option value="${c.id}" ${c.id===x.car.id?'selected':''}>${esc(c.num)} ${esc(c.model)}${carPh(c)?'（写真あり）':''}${c.order?'（売約）':''}</option>`).join('')}</select></label>
        <label>見積 ${seg(x.p,[['base','基本'],['A','A'],['B','B'],['C','C']],"S.ui.qsPlan='$v';save();render()")}</label>
        <label>お客様 <select class="q-in" onchange="S.ui.qsCust=this.value;save();render()"><option value="">（空欄・プラン見積）</option>${(x.car.custs||[]).map(c=>`<option value="${c.id}" ${x.who&&x.who.id===c.id?'selected':''}>${esc(c.name||'お名前なし')} 様（個別見積）</option>`).join('')}</select></label>
        <span class="sp"></span><button class="q-btn" onclick="S.ui.qsI=${(i+L.length-1)%L.length};save();render()">‹ 前</button><button class="q-btn" onclick="S.ui.qsI=${(i+1)%L.length};save();render()">次 ›</button><button class="q-btn pri" onclick="qsPrint()">${I('printer','🖨',14)} この形で印刷</button></div>
        <div class="qs-bar qs-sc2"><span class="lb" title="モックだけ：見本の数字で条件を変えて、どの形も崩れないかを見る">見本の条件</span>
          <label>下取 ${seg(u.qsTr||'',[['','なし'],['tr','あり'],['trl','あり＋残債']],"S.ui.qsTr='$v';save();render()")}</label>
          <label>お支払い ${seg(u.qsPay||'',[['','現金'],['loan','ローン']],"S.ui.qsPay='$v';save();render()")}</label>
          <label>付属品・オプション ${seg(u.qsOp||'',[['','見積のまま'],['many','多い（＋14行）']],"S.ui.qsOp='$v';save();render()")}</label>
          ${cat.order && !x.car.order ? '<span class="hint">この車はまだ売約していない＝いまの見積で注文した時の見本</span>' : ''}${u.qsOp==='many'&&x.p==='base'?'<span class="hint">基本はオプションなしの見積です（A・B・C で見てください）</span>':''}</div>
        <div class="qs-stage" id="qs-stage"><div class="qs-sc" id="qs-sc">${qsPaper(i, cat)}</div></div></div></div></div>`;
  qsFit(); }
function qsFit(){ const st = $('qs-stage'), sc = $('qs-sc'); if (!st || !sc) return; sc.style.transform = ''; sc.style.height = '';
  const W = Math.max(794, ...[...sc.children].map(p=>p.offsetWidth)), H = sc.scrollHeight, s = Math.min(1, (st.clientWidth-24)/W);
  sc.style.width = W+'px'; sc.style.transform = `scale(${s})`; sc.style.height = H*s+'px'; st.style.height = H*s+24+'px'; }
window.addEventListener('resize', ()=>{ if (S.ui.app==='qs') qsFit(); });
function qsShow(title, html){ $('q-docov').innerHTML = `<div class="q-docbar"><span class="t">${title}</span><span class="sp"></span>${zoomBar()}<button onclick="window.print()">${I('printer','🖨',14)} 印刷</button><button onclick="closeDocs()">${I('close','✕',14)} 閉じる</button></div>
    <div class="q-stage" id="q-stage"><div class="q-scaler" id="q-scaler"><div class="q-papers" id="q-papers">${html}</div></div></div>`;
  $('q-docov').hidden = false; $('q-page').textContent = '@page{size:A4 portrait;margin:0}@page a4l{size:A4 landscape;margin:0}';   // 縦と横を1回の印刷で（紙の向きは1枚ごと）
  const st = $('q-stage'), box = $('q-papers'), W = Math.max(794, ...[...box.children].map(p=>p.offsetWidth)), s = zoomOf(st, W, 1123); box.style.transform = `scale(${s})`; $('q-scaler').style.width = W*s+'px'; $('q-scaler').style.height = box.offsetHeight*s+'px'; }
function qsPrint(){ const cat = qsCat(), i = +S.ui.qsI||0; _reprint = () => qsPrint(); qsShow(`帳票サンプル ${esc(cat.name)} ${i+1}. ${esc(cat.list[i].name)}`, qsPaper(i, cat)); }
/* 🗣「①〜⑩を同じ内容でまとめて印刷できるボタン」＋ 種類をまたいで全部 */
function qsPrintAll(all){ _reprint = () => qsPrintAll(all); const cats = all ? QS_CATS : [qsCat()];
  const h = cats.map(c=>c.list.map((v,i)=>qsPaper(i, c)).join('')).join(''), n = (h.match(/class="paper /g)||[]).length;
  qsShow(`帳票サンプル ${all ? '全部の帳票' : esc(cats[0].name)}（${n}枚）`, h); }

/* セールスのページ切り替え（相場ビュー／見積／原価管理） */
function goApp(a){ if (a==='soba'){ try { window.parent.showPanel('soba', window.parent.document.getElementById('si-soba')); } catch(e){} return; }
  if (a!=='cost') a = 'quote';
  if (a!==S.ui.app) _hideSold = false; if (S.ui.app==='quote' && a!=='quote' && S.ui.view==='car'){ const kept = stashPending(); S.ui.view = 'list'; if (kept) toast('保存していない見積の変更は反映していません（次に開く時に続きからできます）'); }
  if (a==='quote' && S.ui.view==='car'){ S.ui.app = 'quote'; goList(); $('q-root').scrollTop = 0; return; }   /* サイドバーの［見積］＝いつも一覧へ（原価管理から来た時も） */
  if (a==='cost') { S.ui.cgCar = null; S.ui.cgView = null; }   // サイドバーの［原価管理］＝いつも一覧へ
  S.ui.app = a; save(); render(); $('q-root').scrollTop = 0; }
function svFromQuote(id){ openCarSoba(id); }

function render(){ const r = $('q-root'); const keep = r.scrollTop, kl = $('q-colL') ? $('q-colL').scrollTop : 0, kr = $('q-colR') ? $('q-colR').scrollTop : 0;
  if (!['cost','set','cgset','hist'].includes(S.ui.app)) S.ui.app = 'quote';   /* v4.0.0：この画面は見積と原価管理だけ（相場ビュー・ダッシュボードは CarFlow 本体・帳票サンプルはモックだけ） */
  if (S.ui.app==='hist'){ const id = new URLSearchParams(location.search).get('car'), car = id && carOf(id); $('soba-panel').hidden = true; r.hidden = false;
    r.innerHTML = `<div class="q-wrap cdx-page">${car ? cdxPrice(car) : '<div class="cdx-ghost">この車は見積の一覧にありません（月次で締めた車など）</div>'}</div>`; r.scrollTop = keep; if (typeof icHydrate==='function') icHydrate(r); return; }
  if (S.ui.app==='set' || S.ui.app==='cgset'){ $('soba-panel').hidden = true; r.hidden = false; if (S.ui.app==='set') openSettings(); else { S.ui.cgView = 'link'; renderCost(); } r.scrollTop = keep; if (typeof icHydrate==='function') icHydrate(r); return; }
  try { const pd = window.parent.document; if (pd.getElementById('panel-quote').classList.contains('open')) ['quote','qcost'].forEach(a=>{ const e = pd.getElementById('si-'+a); if (e) e.classList.toggle('active', (a==='qcost'?'cost':'quote')===S.ui.app); }); } catch(e){}
  $('soba-panel').hidden = true; r.hidden = false;
  if (S.ui.app==='cost') renderCost(); else if (S.ui.view==='car') renderCar(); else renderList();
  const split = !!$('q-colL'); r.classList.toggle('split', split);
  if (split) splitSetup();
  r.scrollTop = keep; if (split){ $('q-colL').scrollTop = kl; $('q-colR').scrollTop = kr; }
  if (typeof icHydrate==='function') icHydrate(r);
  if (window.QData && QData.route) QData.route(routeOf()); }
function renderKeep(){ // 入力中：描き直してもカーソルを戻す
  const a = document.activeElement, id = a && a.id, raw = a && a.value, pos = a && a.selectionStart;
  render(); if (id && $(id)){ const e = $(id); e.focus(); if (raw!=null && (e.dataset.money!==undefined || e.dataset.raw!==undefined || e.id==='q-search')) e.value = raw;   /* data-raw＝小数など、打った文字のまま戻す（🗣 2026-10-19「金利で小数点が打てない」） */ try{ e.setSelectionRange(pos,pos); }catch(x){} }
  save(); if (!$('q-docov').hidden) renderDocs();
}


/* ---------- 見積番号（🗣 2026-10-02「全見積にバージョンを付けたい。ただしそのままだと勘繰られるだろうから、見積ナンバー KM0497-1-1-1A などに。
   KM番号以下はそのままメジャー・マイナー・パッチ。基本価格をいじるとメジャー（月の自賠責の減額や値下げでも 2,3,4 と上がる）。
   マイナーはプラン見積を変更したら。パッチは個別見積を A さんに作った 1、B さんに作った 2 と作るごとに上がる。最後はプランのローマ字、基本は E。
   初版で顧客もなしのプラン見積なら 1-1-0A。プランの印刷は必ずパッチは 0」）
   メジャー＝値付けの履歴の件数（初回＋値下げ・値上げ＋毎月の諸費用の自動の行）＋基本価格を（金額以外で）直して保存した回数
   マイナー＝プラン見積を直して保存した回数＋1。個別見積は作った時のメジャー・マイナーを持つ（「いまの基本価格に反映」でメジャーを今に） ---------- */
/* 紙に出す行：取付工賃が付く品は「本体」と「└ 取付工賃（種類）」の2行。工賃＝金額 − 本体（手入力で合計を変えても合う） */
/* 🗣 2026-10-05「コーティングのサイズを選んでいないと『サービス』と出るのはやめて。『サイズ見積後金額決定』とかの文言」→ 3つ目が true＝金額は「サイズ確認後に決定」 */
const OPT_TBD = 'サイズ確認後に決定';
function optLines(x){ if (x.noSize || /（サイズ未選択）/.test(x.n||'')) return [[String(x.n).replace('（サイズ未選択）',''), 0, true]];
  if (x.laborL == null) return [[x.n, x.a]];
  const body = Math.max(0, Math.min(x.bodyA||0, x.a)), L = [];
  if (x.bn && body > 0) L.push([x.bn, body]);
  L.push([(x.bn && body > 0 ? '　└ ' : '') + `取付工賃（${x.laborL}）`, x.a - body]); return L; }
const kmNo = car => car.num.replace('-', '');
const pLetter = p => p==='base' || !p ? 'E' : p;
const majorOf = car => car.base ? priceEvents(car).length + (car.base.editVer||0) : 0;
const minorOf = car => (car.std && car.std.ver) || 1;
const custNoOf = (car, u) => u.no || (car.custs.indexOf(u) + 1);
function estNo(car, p, u){ return u ? `${kmNo(car)}-${u.major||1}-${u.minor||1}-${custNoOf(car,u)}${pLetter(p)}` : `${kmNo(car)}-${majorOf(car)}-${minorOf(car)}-0${pLetter(p)}`; }
/* 車ごとの最新の番号（🗣 2026-10-03「各車両カードとかにも最新のバージョンの表記」）＝メジャー-マイナー-いちばん新しい個別見積の番号（無ければ0） */
const latestPatch = car => car.custs.length ? Math.max(...car.custs.map(u=>custNoOf(car,u))) : 0;
const verShort = car => car.base ? `${majorOf(car)}-${minorOf(car)}-${latestPatch(car)}` : '';
/* 売約した車は「注文 〇-〇-〇字」（🗣 2026-10-03「売約に関しては決まってるわけだから、注文 5-1-1B とかの表記にしちゃっていい」） */
const orderNo = car => car.order ? (car.order.no || estNo(car, car.order.plan, custOf(car, car.order.cust))) : '';
const verLabel = car => car.order ? '注文 ' + orderNo(car).replace(/^[^-]+-/, '') : '見積 ' + verShort(car);
const verLong = car => car.order ? '注文 No. ' + orderNo(car) : '見積 No. ' + kmNo(car) + '-' + verShort(car);
const estBase = (car, u) => estNo(car, 'base', u).slice(0, -1);   // 字なし（プラン比較など）
/* 保存した時に、何が変わったかで版を上げる（editCommit から呼ぶ） */
function bumpVers(o, car){
  if (o.base && car.base){ const grew = (car.base.hist||[]).length > (o.base.hist||[]).length;
    const key = b => JSON.stringify(Object.assign({}, b, { hist:0, changed:0, portalDone:0, editVer:0, costDocs:0 }, grew ? { price:0 } : {}));
    if (key(o.base) !== key(car.base)) car.base.editVer = (car.base.editVer||0) + 1; }
  if (o.std && car.std){ const key = s => JSON.stringify(Object.assign({}, s, { ver:0 })); if (key(o.std) !== key(car.std)) car.std.ver = minorOf(car) + 1; }
}
/* =====================================================================
   保存して次へ（🗣 2026-10-02「見積作成全体の共通挙動として、保存して次へ。保存しない場合はキャンセル扱い。そっちの方が確実」）
   ・車を開いた時の中身を S.edit.orig に持つ。直すと車の中身は変わるが、「保存して次へ」の OK で orig を今の中身にそろえる＝保存
   ・上の段のタブは、保存して進んだ所（car.reached）まで。最初は①だけ
   ・直したまま 戻る／別の段 → 「保存して移動／保存しない（変更を消す）／やめる」
   ・「見積の一覧」などで直接離れた時（ショートカット）＝反映しない。中身は S.pending に取っておき、次に開く時に「続きからやりますか？」
     （PitFlow の新規予約で、作りかけのデータがある時に聞くのと同じ救済）
   ===================================================================== */
const STEPS = ['base','std','cust','order'], STEP_L = { base:'基本価格', std:'プラン見積', cust:'個別見積', order:'売約' };
const carJSON = car => JSON.stringify(car, (k, v) => k && (k[0]==='_' || k==='cf') ? undefined : v);   // 「_」で始まる画面だけの一時の値と、変更の印のもと（cf）は比べない
const reachedOf = car => car.reached != null ? car.reached : car.order ? 3 : car.custs.length ? 2 : 0;
function editBegin(car){ S.edit = { carId:car.id, orig:carJSON(car) }; }
function isDirty(){ const e = S.edit; if (!e || S.ui.view!=='car') return false; const car = carOf(e.carId); return !!car && carJSON(car) !== e.orig; }
function editCommit(){ const e = S.edit; if (!e) return; const car = carOf(e.carId); if (!car) return; try { bumpVers(JSON.parse(e.orig), car); } catch(x){} e.orig = carJSON(car); }
function editRevert(){ const e = S.edit; if (!e) return; const i = S.cars.findIndex(c=>c.id===e.carId); if (i>=0) S.cars[i] = JSON.parse(e.orig); }
function stepGo(s){ S.ui.step = s; save(); render(); $('q-root').scrollTop = 0; }
function nextOf(car, step){ return step==='base' ? (car.base ? 'std' : null) : step==='std' ? null : step==='cust' ? (car.order ? 'order' : null) : null; }
/* 保存して次へ：確かめの窓 → OK で保存して次の段へ */
function saveNext(){
  const car = curCar(), step = S.ui.step, nx = nextOf(car, step); if (!nx) return;
  ov(`<div class="hd">${I('check','✓',16)} 保存して次へ<button class="x" onclick="closeOv()">✕</button></div><div class="bd">
    <div style="font-size:14px">${STEP_L[step]}の内容を保存して、<b>${STEP_L[nx]}</b>へ進みます。よろしいですか？</div>
    ${isDirty()?'<div class="q-why" style="margin-top:6px">変更した内容が保存されます。</div>':''}</div>
    <div class="ft"><button class="q-btn" onclick="closeOv()">キャンセル</button><button class="q-btn pri" onclick="saveNextOk()">OK</button></div>`, true);
}
function saveNextOk(){
  const car = curCar(), nx = nextOf(car, S.ui.step); closeOv(); editCommit();
  car.reached = Math.max(reachedOf(car), STEPS.indexOf(nx)); editCommit();
  if (nx==='cust' && !car.custs.length){ newCust(car.id); editCommit(); save(); return; }   // 個別見積がまだ無ければ1つ作って入る
  if (nx==='cust') S.ui.custId = null;
  stepGo(nx); toast(`保存しました。${STEP_L[nx]}へ`);
}
/* プラン見積：ここでいったん終わる（🗣 2026-10-02「プランの右上は、動き的にいったんここで終了するから、戻る・保存する・印刷して保存する」） */
function saveStd(pr){
  ov(`<div class="hd">${I('check','✓',16)} ${pr?'印刷して保存する':'保存する'}<button class="x" onclick="closeOv()">✕</button></div><div class="bd">
    <div style="font-size:14px">プラン見積の内容を保存${pr?'して、見積書（基本・A・B・C、業販を出していれば業販も）を印刷へ進み':'し'}ます。終わったら見積の一覧に戻ります。よろしいですか？</div>
    ${isDirty()?'<div class="q-why" style="margin-top:6px">変更した内容が保存されます。</div>':''}</div>
    <div class="ft"><button class="q-btn" onclick="closeOv()">キャンセル</button><button class="q-btn pri" onclick="saveStdOk(${pr})">OK</button></div>`, true);
}
/* 🗣 2026-10-02「印刷保存でも保存でも、終わったら一覧に戻る。プラン見積が保存された時点で個別見積のタブもアクティブで移動できるように」 */
function saveStdOk(pr){ const car = curCar(); closeOv(); car.reached = Math.max(reachedOf(car), 2); editCommit(); S.edit = null; S.ui.view = 'list'; save(); render();
  if (pr) printSheets([car.id], { base:1, A:1, B:1, C:1, D:car.std.showD?1:0, equip:0 }); toast(`${car.num} ${car.model} のプラン見積を保存しました`); }
/* 保存だけ（次の段がまだ無い時：個別見積で売約前） */
function saveOnly(){ const car = curCar(); editCommit(); save(); render(); toast('保存しました'); }
/* 戻る・タブ：直したままなら聞く */
function moveTo(s){
  if (s===S.ui.step) return;
  if (!isDirty()) return stepGo(s);
  ov(`<div class="hd">${I('warn','⚠',16)} 保存していない変更があります<button class="x" onclick="closeOv()">✕</button></div><div class="bd">
    <div style="font-size:14px">${STEP_L[S.ui.step]}で直した内容を保存して、<b>${STEP_L[s]}</b>へ移りますか？</div>
    <div class="q-why" style="margin-top:6px">「保存しない」を選ぶと、直した内容は消えます（キャンセル扱い）。</div></div>
    <div class="ft"><button class="q-btn" onclick="closeOv()">やめる</button><button class="q-btn" onclick="closeOv();editRevert();stepGo('${s}')">保存しない</button><button class="q-btn pri" onclick="closeOv();editCommit();stepGo('${s}')">保存して移動</button></div>`, true);
}
function navBtns(car, step){
  const i = STEPS.indexOf(step), prev = i>0 ? STEPS[i-1] : null, nx = nextOf(car, step), dirty = isDirty();
  return `${dirty?'<span class="q-pill warn">未保存の変更あり</span>':''}
    ${prev?`<button class="q-btn sm" onclick="moveTo('${prev}')">${I('left','←',13)} 戻る</button>`:''}
    ${step==='std'?`<button class="q-btn sm" onclick="newCust('${car.id}')" ${car.order?'disabled':''}>${I('plus','＋',13)} 個別見積を作る</button><button class="q-btn sm" onclick="saveStd(0)">保存する</button><button class="q-btn pri sm" onclick="saveStd(1)">${I('printer','🖨',13)} 印刷して保存する</button>`
      :nx?`<button class="q-btn pri sm" onclick="saveNext()">保存して次へ ${I('right','→',13)}</button>`:(step==='cust'?`<button class="q-btn pri sm" onclick="saveOnly()" ${dirty?'':'disabled'}>保存</button>`:'')}`;
}
/* 直接離れた時：反映しないで、中身は取っておく */
function stashPending(){
  if (!isDirty()) { S.edit = null; return false; }
  const car = carOf(S.edit.carId), d = new Date();
  S.pending = { carId:car.id, data:carJSON(car), step:S.ui.step, custId:S.ui.custId, at:`${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` };
  editRevert(); S.edit = null; return true;
}
function pendingAsk(){
  const p = S.pending; if (!p) return; const car = carOf(p.carId); if (!car){ S.pending = null; save(); return; }
  ov(`<div class="hd">${I('info','ℹ',16)} 途中の見積があります<button class="x" onclick="closeOv()">✕</button></div><div class="bd">
    <div style="font-size:14px"><b>${esc(car.num)} ${esc(car.maker)} ${esc(car.model)}</b> の${STEP_L[p.step]}を、保存しないまま離れています（${esc(p.at)}）。</div>
    <div style="font-size:14px;margin-top:4px">続きからやりますか？</div>
    <div class="q-why" style="margin-top:6px">「破棄」を選ぶと、途中の内容は消えます。</div></div>
    <div class="ft"><button class="q-btn" onclick="closeOv()">あとで</button><button class="q-btn" onclick="pendingDrop()">破棄</button><button class="q-btn pri" onclick="pendingResume()">続きから</button></div>`, true);
}
function pendingResume(){ const p = S.pending; closeOv(); if (!p) return; const i = S.cars.findIndex(c=>c.id===p.carId); if (i<0) return;   // 途中の見積がもう無い時は窓を閉じるだけ
  editBegin(S.cars[i]); S.cars[i] = JSON.parse(p.data); fixGarage(S.cars[i]); fixWish(S.cars[i]);   // orig は保存済みの中身・車は途中の中身＝未保存の変更ありの状態で再開
  S.ui.view = 'car'; S.ui.carId = p.carId; S.ui.step = p.step; S.ui.custId = p.custId || null; S.pending = null; save(); render(); $('q-root').scrollTop = 0; toast('途中から再開しました。保存するまでは反映されません'); }
function pendingDrop(){ S.pending = null; closeOv(); save(); render(); toast('途中の見積を破棄しました'); }
/* 🔗 v4.5.14 🗣 2026-10-24「見積は一覧→詳細→ABC→顧客って全部個別のURLに。戻るで戻りたい」＝画面ごとの住所（親の CarFlow が #… に入れる・js/car-quote.js）
   quote＝一覧／quote/{車ID}/base＝① 基本価格／…/plan＝② プラン見積（ABC）／…/cust/{お客様ID}＝③ 顧客見積／…/order＝④ 売約／cost＝原価管理／cost/{車ID} */
const ROUTE_STEP = { base:'base', std:'plan', cust:'cust', order:'order' };
function routeOf(){
  if (S.ui.app==='cost') return S.ui.cgCar ? 'cost/'+S.ui.cgCar : 'cost';
  if (S.ui.view!=='car' || !S.ui.carId || !carOf(S.ui.carId)) return 'quote';
  const st = ROUTE_STEP[S.ui.step] || 'base';
  return 'quote/'+S.ui.carId+'/'+st+(st==='cust' && S.ui.custId ? '/'+S.ui.custId : '');
}
/* 戻る・進む・再読み込みで、住所の画面を開く。保存していない変更がある時は、いつもの確かめの窓が出る（やめたら今の画面のまま＝住所も今の画面に戻る） */
function routeGo(r){
  const a = String(r||'').split('/');
  if (a[0]==='cost'){ if (S.ui.app!=='cost') goApp('cost'); if (a[1] && carOf(a[1])) cgGo(a[1]); else if (S.ui.cgCar) cgGo(null); return; }
  if (S.ui.app!=='quote'){ S.ui.app = 'quote'; save(); }
  const id = a[1];
  if (!id){ if (S.ui.view==='car') goList(); else render(); return; }
  const car = carOf(id); if (!car){ toast('この車は見積の一覧にありません（月次で締めた車など）'); if (S.ui.view==='car') goList(); else render(); return; }
  if (S.ui.view!=='car' || S.ui.carId!==id){ openCar(id); if (S.ui.view!=='car' || S.ui.carId!==id) return; }   // 途中の見積の確かめが出た時は、ここまで
  const st = Object.keys(ROUTE_STEP).find(k=>ROUTE_STEP[k]===a[2]) || 'base';
  if (st!=='base' && !car.base){ render(); return; }   // 基本価格がまだ無い車はプラン・顧客へ進めない
  if (st==='cust'){ const uid = a[3] && custOf(car, a[3]) ? a[3] : null; if (S.ui.step==='cust'){ S.ui.custId = uid; save(); render(); return; } S.ui.custId = uid; }
  if (st===S.ui.step){ render(); return; }
  moveTo(st);
}
function goList(){ const kept = stashPending(); S.ui.view = 'list'; save(); render(); if (kept) toast('保存していない変更は反映していません（次に開く時に続きからできます）'); }
function openCar(id){ _hideSold = false; if (S.pending && S.pending.carId===id){ pendingAsk(); return; } S.ui.view = 'car'; S.ui.carId = id; const car = carOf(id); if (!car.base) S.ui.cp = {}; S.ui.pk = {}; S.ui.step = car.order ? 'order' : car.custs.length ? 'cust' : 'base'; S.ui.custId = null; render(); editBegin(carOf(id)); save(); $('q-root').scrollTop = 0; }
function goStep(s){ moveTo(s); }
function curCar(){ return carOf(S.ui.carId); }
/* 業販価格：出す／出さないは wsOn で持つ（金額を全部消して打ち直す間に欄が消えないように） */
function setWs(cid, on){ const b = carOf(cid).base; snap(); b.wsOn = on ? 1 : 0; b.wsPrice = on ? (b.wsPrice || b.price) : 0; b.changed = TODAY; save(); render(); }
function setBase(k, v, hard){ const car = curCar(); if (hard) snap(); car.base[k] = v; car.base.changed = TODAY; if (hard){ save(); render(); } else renderKeep(); }
function setCostTax(cid, v){ const car = carOf(cid); snap(); if (v==='on') car.base.cost.tax = 0; else delete car.base.cost.tax; save(); render(); if (v==='on') setTimeout(()=>{ const e = $('b-c-tax'); if (e){ e.focus(); e.select(); } }, 30); }
function setCost(k, v){ curCar().base.cost[k] = v; renderKeep(); }
/* 🗣 2026-10-23 重量税＝国交省（軽は軽自動車検査協会）の「次回自動車重量税額照会」の額。登録車は車両重量の欄を外した */
const WT_URL = { car:'https://www.nextmvtt.mlit.go.jp/nextmvtt-web/nextmvttshokai/init', kei:'https://www.kei-nextmvtt.jp/kei_nextmvtt-web/' };
function wtUI(car, b, bc){ const kei = bc.kei, dis = !QData.canEdit();
  const sel = kei ? `<select id="b-eco" class="q-in" style="max-width:260px" onchange="setBase('eco',this.value,1)" ${dis?'disabled':''}>${[['std','当分の間税率（13年・18年は自動）'],['eco','本則税率（環境性能のある車）'],['exempt','免税']].map(([v,l])=>`<option value="${v}" ${b.eco===v?'selected':''}>${l}</option>`).join('')}</select>` : '';
  const amt = `<div class="km-in"><input id="b-wtq" class="q-in num" inputmode="numeric" placeholder="照会した額" value="${bc.wtQ!=null?yen(bc.wtQ):''}" onfocus="this.value=this.value.replace(/,/g,'')" onchange="setWtQ(this.value)" ${dis?'disabled':''}><span>円</span></div>`;
  const btn = `<button type="button" class="q-btn sm" onclick="wtQuery('${car.id}')" title="${kei?'車台番号を写して、照会のページを新しいタブで開きます':'車台番号と検査予定日（登録の予定日）を入れて、国交省の照会の結果を新しいタブで開きます'}">${I('search','🔎',13)} ${kei?'軽自動車検査協会で照会':'国交省で照会'}</button>`;
  const note = bc.wtQ!=null ? `照会 ${jd(bc.wtAt)}${bc.wtStale?'　<b style="color:var(--orange)">照会し直し</b>（登録の予定月が税制の年度（5/1〜）をまたぐ）':''}`
    : kei ? `いまは区分から ${yen(bc.weight)} 円（照会した額を入れるとそちら）`
    : `<b style="color:var(--orange)">未照会</b>：照会した重量税の額を入れてください（入れるまで支払総額に重量税が入りません）`;
  return `<div class="sb-pick">${sel}${amt}${btn}${bc.wtQ!=null&&!dis?`<button type="button" class="q-btn sm" onclick="setWtQ('')">クリア</button>`:''}</div><div class="q-why">${note}</div>`; }
function setWtQ(raw){ const car = curCar(), b = car.base; snap(); const t = String(raw==null?'':raw).trim();
  if (t === '') delete b.wtQ; else b.wtQ = { amt: parseYen(t), at: TODAY };
  b.changed = TODAY; save(); render(); }
/* 🗣 2026-10-23「入ってる車体番号は自動でいれられないの？」＝登録車は、車台番号と検査予定日（登録の予定日）を入れた状態で国交省の照会まで進み、結果を新しいタブで開く
   （照会の入力欄に送るだけ＝人がボタンを押した時の1回。2026-10-23 本番から KM-0546 で試して通った＝15,000 円）。結果の額は人が「照会した額」に入れる。
   車台番号に漢字がある車（「札123」など）・軽（軽自動車検査協会）は、今までどおり車台番号を写して入力のページを開く */
function wtQuery(cid){ const car = carOf(cid), vin = String(car.vin||'').normalize('NFKC').trim().toUpperCase();
  if (!car.kei && vin && /^[A-Z0-9.\-]+$/.test(vin)){
    const rd = car.base ? regDateOf(car.base) : '', f = document.createElement('form');
    f.method = 'post'; f.action = 'https://www.nextmvtt.mlit.go.jp/nextmvtt-web/nextmvttshokai/search'; f.target = '_blank'; f.rel = 'noopener';
    [['shadaibangoShubetsu','1'], ['shadaibango', vin], ['kensayoteibi', rd ? rd.replace(/-/g,'/') : '']].forEach(([n,v])=>{ const x = document.createElement('input'); x.type = 'hidden'; x.name = n; x.value = v; f.appendChild(x); });
    document.body.appendChild(f); try { f.submit(); } finally { f.remove(); }
    toast(`国交省の照会を開きました（車台番号 ${vin}${rd?'・検査予定日 '+rd.replace(/-/g,'/'):''}）。出た重量税の額を入れてください`); return; }
  const url = car.kei ? WT_URL.kei : WT_URL.car;
  try { window.open(url, '_blank', 'noopener'); } catch(e){}
  if (!vin) { toast('照会のページを開きました。車台番号が入っていないので、車両情報の車台番号を入れると次から自動で入ります'); return; }
  try { navigator.clipboard.writeText(vin).then(()=>toast(`車台番号 ${vin} を写しました。照会のページに貼り付けて照会し、出た額を入れてください`), ()=>toast(`照会のページを開きました。車台番号 ${vin} を入れて照会してください`)); }
  catch(e){ toast(`照会のページを開きました。車台番号 ${vin} を入れて照会してください`); } }
function setCar(k, v){ const car = curCar(); if (REAL_K.includes(k)){ if (String(v??'') !== String(car[k]??'')) toast('メーカー・車名・グレード・走行・色・仕入日は カードの車両情報で直します（見積からは書きません）'); return; }
  snap(); car[k] = typeof v==='string' ? v.trim() : v; if (k==='kei') car.keiQ = !!v; if (k==='firstReg') car._firstRegGuess = false; if (car.base) car.base.changed = TODAY; save(); render(); toast('車両情報（見積の側）を直しました', true); }
function setPower(v){ const car = curCar(); snap(); car.hybrid = v==='hv'; car.fuel = v==='diesel' ? 'diesel' : 'gas'; if (car.base) car.base.changed = TODAY; save(); render(); }
function vehRevert(cid){ const car = carOf(cid); snap(); VEH_FIELDS.filter(k=>!REAL_K.includes(k)).forEach(k=>car[k]=car.cf[k]); save(); render(); toast('車両情報を最初の値に戻しました', true); }
/* 本体価格を変える前の確認の窓（手入力・売れそうな金額）。OK で値付けの履歴に1行（理由つき）。やめる＝元の金額に戻す */
function priceAsk(cid, to, why){ const car = carOf(cid), b = car.base; if (!b) return; const from = b.price;
  if (!(to > 0) || to === from){ render(); return; }
  const k0 = calc(baseCtx(car)), b2 = Object.assign({}, b, { price: to }), k1 = calc(Object.assign({}, baseCtx(car), { b: b2 }));
  ov(`<div class="hd">${I('warn','⚠',16)} 車両本体価格を変える<button class="x" onclick="priceAskNo()">✕</button></div><div class="bd">
    <div style="font-size:14px">車両本体価格（税抜）を <b>${yen(from)}</b> → <b>${yen(to)}</b>（${to<from?'▲':'＋'}${yen(Math.abs(to-from))}）に変えます。</div>
    <div class="q-why" style="margin-top:6px">支払総額（税込）${yen(k0.cash)} → <b>${yen(k1.cash)}</b>。プラン見積・見積書・カードとポータルの値に効き、値付けの履歴に「${esc(why)}」で残ります。</div></div>
    <div class="ft"><button class="q-btn" onclick="priceAskNo()">やめる</button><button class="q-btn pri" onclick="priceAskOk('${cid}',${to},'${jsq(why)}')">OK</button></div>`, true); }
function priceAskNo(){ closeOv(); render(); }
function priceAskOk(cid, to, why){ closeOv(); const car = carOf(cid); snap(); const from = car.base.price; car.base.price = to; car.base.hist.push({ date:TODAY, from, to, why, soba: sobaOf(car) ? sobaOf(car).now : null }); car.base.changed = TODAY; save(); render(); toast(`車両本体（税抜）を ${yen(to)} にしました（${why}）`, true); }
function setFromSoba(cid, ex){ return priceAsk(cid, ex, '相場から（売れそうな金額）'); }
function setFromSobaOld(cid, ex){ const car = carOf(cid); snap(); const from = car.base.price; car.base.price = ex; car.base.hist.push({ date:TODAY, from, to:ex, why:'相場から', soba: sobaOf(car) ? sobaOf(car).now : null }); car.base.changed = TODAY; save(); render(); toast(`車両本体（税抜）を ${yen(ex)} にしました。プラン見積とカード・ポータルの値がそろいます`, true); }
function makeBase(cid){ const car = carOf(cid); snap(); car.base = mkBase({ price:parseYen($('nb-price').value), recycle:parseYen($('nb-rec').value), jibaiM:25, hist:[{date:TODAY,from:0,to:parseYen($('nb-price').value),why:'基本価格を作成（車両カードの金額から）'}], changed:TODAY }); save(); render(); toast('基本価格を作りました。以後の金額はここがもとになります', true); }
function portalDone(cid, site){ const car = carOf(cid); snap(); car.base.portalDone[site] = TODAY; save(); render(); toast((site==='goo'?'グーネット':'カーセンサー')+' に入れたと記録しました', true); }
function copyText(t){ try { navigator.clipboard.writeText(String(t)).then(()=>toast('「'+yen(t)+'」を写しました')).catch(()=>toast('写せませんでした（手で選んでコピー）')); } catch(e){ toast('写せませんでした'); } }
// ②
/* 車ごと：金額の手入力・種類の選び直し・上下の入れ替え（🗣「テンプレで付いてる OP も個別で金額を手打ち。上下を入れ替えられるように」） */
function stdHide(cid, key){ const car = carOf(cid); snap(); car.std.hide = (car.std.hide||[]).filter(k=>k!==key).concat(key); save(); render(); }
function stdOff(cid, key){ const car = carOf(cid); snap(); car.std.ov[key] = {A:0,B:0,C:0}; save(); render(); }
function stdUnhideTo(cid, key, p){ const car = carOf(cid); snap(); car.std.hide = (car.std.hide||[]).filter(k=>k!==key); const inn = {A:0,B:0,C:0}; inn[p] = 1; car.std.ov[key] = inn; save(); render(); }
function stdUnhide(cid, key){ const car = carOf(cid); snap(); car.std.hide = (car.std.hide||[]).filter(k=>k!==key); save(); render(); }
function stdAmtL(cid, key, v){ const car = carOf(cid); car.std.amtL = car.std.amtL || {}; car.std.amtL[key] = v; renderKeep(); }
function stdAmtBL(cid, key, f){ const car = carOf(cid); snap(); if (car.std[f]) delete car.std[f][key]; save(); render(); }
function stdDup(cid, pkey){ const car = carOf(cid); snap(); car.std.dups = car.std.dups || {}; const L = car.std.dups[pkey] = car.std.dups[pkey] || []; const id = 'd' + Date.now().toString(36).slice(-4); L.push(id);
  const nk = pkey + '~' + id, ord = stdItems(car).map(x=>x.key); car.std.order = ord; save(); render(); toast('同じ品をもう1行足しました。A/B/C を押して、入れるプランを選んでください'); }
function stdUndup(cid, key){ const car = carOf(cid), [pkey, id] = key.split('~'); snap(); car.std.dups[pkey] = (car.std.dups[pkey]||[]).filter(d=>d!==id); ['ov','amtB','amtL','bsel','vsel'].forEach(f=>{ if (car.std[f]) delete car.std[f][key]; }); car.std.order = (car.std.order||[]).filter(k=>k!==key); save(); render(); }
function stdBsel(cid, key, i){ const car = carOf(cid); snap(); car.std.bsel = car.std.bsel || {}; car.std.bsel[key] = +i; if (car.std.amtB) delete car.std.amtB[key]; if (car.std.amt) delete car.std.amt[key]; save(); render(); }
function stdAmtB(cid, key, v){ const car = carOf(cid); car.std.amtB = car.std.amtB || {}; car.std.amtB[key] = v; if (car.std.amt) delete car.std.amt[key]; renderKeep(); }
function stdCsize(cid, s){ const car = carOf(cid); snap(); car.std.csize = car.std.csize===s ? null : s; save(); render(); }
function stdAmt(cid, key, v){ const car = carOf(cid); car.std.amt = car.std.amt || {}; if (v==null) delete car.std.amt[key]; else car.std.amt[key] = v; renderKeep(); }
function stdAmtReset(cid, key){ const car = carOf(cid); snap(); if (car.std.amt) delete car.std.amt[key]; save(); render(); }
function stdVsel(cid, key, i){ const car = carOf(cid); snap(); car.std.vsel = car.std.vsel || {}; car.std.vsel[key] = +i; if (car.std.amt) delete car.std.amt[key]; save(); render(); }
function stdMove(cid, key, d){ const car = carOf(cid), list = stdItems(car).map(x=>x.key), i = list.indexOf(key), j = i + d; if (j<0 || j>=list.length) return;
  snap(); [list[i], list[j]] = [list[j], list[i]]; car.std.order = list; save(); render(); }
/* 🗣 2026-10-19「ABC のチェックと行の消去を切り分けたい。ABC すべてのチェックを外しても消えないように。ABC× にして × をクリックすると行自体が消える。顧客見積もりでも同じ。消す時は一度ポップアップで確認」
   上の一覧に出る＝どれかのプランに入っている／足した行・増やした行／A/B/C を全部外したまま残している行（car.std.keep） */
const stdUp = (car, x) => PLANS.some(p=>x.in[p]) || !!x.extra || !!x.dup || (car.std.keep||[]).includes(x.key);
function stdToggle(cid, i, p){ const car = carOf(cid), x = stdItems(car)[i]; snap(); const key = x.n;
  const e = x.extra && (car.std.extra||[]).find(e=>x.fid ? e.fid===x.fid : e.n===x.n);
  const was = stdUp(car, x);
  if (e) e.in[p] = e.in[p]?0:1;
  else { const cur = {...x.in}; cur[p] = cur[p]?0:1; car.std.ov[x.key] = cur; }   // 増やした行（品~番号）も同じ
  const now = e ? e.in : car.std.ov[x.key];
  if (was && !PLANS.some(q=>now[q])) car.std.keep = (car.std.keep||[]).filter(k=>k!==x.key).concat(x.key);   // 全部外しても上に残す
  save(); render(); }
function rowDelAsk(name, js, back){ $('q-toast').hidden = true;   // 窓の上の「元に戻す」で行の番号がずれないように
  ov(`<div class="hd">${I('warn','⚠',16)} 行を消す<button class="x" onclick="closeOv()">✕</button></div><div class="bd">
    <div style="font-size:14px">「<b>${esc(name || '（品名なし）')}</b>」の行を消します。</div>
    <div class="q-why" style="margin-top:6px">${back?'店の品なので、下の「追加選択」からまた足せます。':''}消したあとは、すぐ出る「元に戻す」で戻せます。</div></div>
    <div class="ft"><button class="q-btn" onclick="closeOv()">やめる</button><button class="q-btn dan" onclick="closeOv();${js}">消す</button></div>`, true); }
function stdDelAsk(cid, key){ const car = carOf(cid), x = stdItems(car).find(q=>q.key===key); if (!x) return;
  rowDelAsk(x.free ? x.n : x.base, `stdDel('${cid}','${jsq(key)}')`, !x.extra && !x.dup); }
function stdDel(cid, key){ const car = carOf(cid), x = stdItems(car).find(q=>q.key===key); if (!x) return; const nm = (x.free ? x.n : x.base) || '（品名なし）';
  if (x.extra) stdRmExtra(cid, x.fid || x.base); else if (x.dup) stdUndup(cid, key); else stdOff(cid, key);
  car.std.keep = (car.std.keep||[]).filter(k=>k!==key); save(); render(); toast(`「${nm}」の行を消しました`, true); }
function stdMoveTo(cid, key, toKey, after){ const car = carOf(cid), list = stdItems(car).map(x=>x.key), i = list.indexOf(key); if (i<0 || key===toKey) return;
  list.splice(i,1); let j = list.indexOf(toKey); if (j<0) return; if (after) j++; list.splice(j,0,key); snap(); car.std.order = list; save(); render(); }
/* ドラッグで並べ替え（プラン見積・個別見積）。金額・A/B/C・入力欄・ボタンをつかんだ時は動かさない */
/* マウスで押して上下に動かし、離した所へ（HTML5 のドラッグは使わない＝入力欄の選択とぶつからない） */
const dragAttrs = args => `onmousedown="dragArm(event,this,${args})"`;
function dragArm(ev, row, kind, cid, uid){
  if (ev.button !== 0 || ev.target.closest('input,select,button,textarea,.am,.q-pcs,.lbw')) return;
  ev.preventDefault(); const st = { key: row.dataset.dk, y: ev.clientY, on: false, tgt: null, after: false };
  const mv = e => { if (!st.on){ if (Math.abs(e.clientY - st.y) < 5) return; st.on = true; row.classList.add('drg'); document.body.style.cursor = 'grabbing'; }
    document.querySelectorAll('.q-it.dov-a,.q-it.dov-b').forEach(x=>x.classList.remove('dov-a','dov-b')); st.tgt = null;
    const el = document.elementFromPoint(e.clientX, e.clientY), r = el && el.closest(`.q-it.dg[data-dkind="${kind}"]`);
    if (r && r !== row){ const b = r.getBoundingClientRect(); st.after = e.clientY > b.top + b.height/2; r.classList.add(st.after ? 'dov-a' : 'dov-b'); st.tgt = r.dataset.dk; } };
  const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); document.body.style.cursor = ''; dragEnd();
    if (st.on && st.tgt != null && st.tgt !== st.key){ if (kind === 'std') stdMoveTo(cid, st.key, st.tgt, st.after); else custMoveTo(cid, uid, +st.key, +st.tgt, st.after); } };
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); }
function dragEnd(){ document.querySelectorAll('.q-it.drg,.q-it.dov-a,.q-it.dov-b').forEach(e=>e.classList.remove('drg','dov-a','dov-b')); }
function stdAddExtra(cid, n, a, p0){ const car = carOf(cid); snap(); car.std.extra = car.std.extra||[]; const p = p0 || (S.ui.plan==='D'?'A':S.ui.plan), inn = {A:0,B:0,C:0}; inn[p] = 1; car.std.extra.push({ n, a, in:inn, extra:true }); save(); render(); toast(`「${n}」をこの車のプラン ${p} に足しました`, true); }
function stdRmExtra(cid, n){ const car = carOf(cid); snap(); car.std.extra = (car.std.extra||[]).filter(e=>(e.fid||e.n)!==n); if (car.std.amt) delete car.std.amt['x:'+n]; save(); render(); }
/* 自由行（🗣 2026-10-18「空行を挿入して自分でテキストも金額も決められる」）＝品名・金額とも空の行を、いま選んでいるプランに足す */
function stdAddFree(cid){ const car = carOf(cid); snap(); car.std.extra = car.std.extra||[]; const p = PLANS.includes(S.ui.plan) ? S.ui.plan : 'A', inn = {A:0,B:0,C:0}, fid = 'f'+Date.now().toString(36); inn[p] = 1;
  car.std.extra.push({ fid, n:'', a:0, in:inn, extra:true, free:true }); save(); render(); setTimeout(()=>{ const el = $('s-fn-'+fid); if (el) el.focus(); }, 30); toast(`自由行をプラン ${p} に足しました（品名と金額を入れる）`, true); }
/* 品名を確定したら、移った先の欄（Tab・クリック）にカーソルを戻して描き直す */
function renderSoon(){ setTimeout(()=>{ const a = document.activeElement, id = a && a.id; render(); const e = id && $(id); if (e){ e.focus(); if (e.select) e.select(); } }, 0); }   // 移った先の欄は全部選んだ状態＝打つと置き換わる（「0」の前に入らない）
function stdFreeName(cid, fid, v){ const car = carOf(cid), e = (car.std.extra||[]).find(e=>e.fid===fid); if (!e) return; snap(); e.n = String(v||'').trim(); save(); renderSoon(); }
function stdReset(cid){ const car = carOf(cid); snap(); car.std.ov = {}; car.std.keep = []; car.std.extra = []; car.std.tier = {}; car.std.amt = {}; car.std.amtB = {}; car.std.amtL = {}; car.std.bsel = {}; car.std.vsel = {}; car.std.dups = {}; car.std.order = []; car.std.csize = null; car.std.hide = []; save(); render(); toast('店のパックに戻しました', true); }
function stdTier(cid, p, v){ const car = carOf(cid); snap(); car.std.tier = car.std.tier||{}; if (v===S.set.packs.tier[p]) delete car.std.tier[p]; else car.std.tier[p] = v; save(); render(); }
function stdShowD(cid, on){ const car = carOf(cid); snap(); car.std.showD = on; if (!on && S.ui.plan==='D') S.ui.plan = 'B'; save(); render(); }
function stdDisc(cid, p, v){ carOf(cid).std.disc[p] = v; renderKeep(); }
function stdRec(cid, p){ snap(); carOf(cid).std.rec = p; save(); render(); }
// ③
/* 🗣 2026-10-02「個別見積に入る時に、どの見積りから個別見積を作るか聞く。全部なら全部、A なら A、A〜C とかも OK。その上で個別見積画面にその選択肢が残る」 */
/* 🗣 2026-10-02「個別見積には基本見積も選択できるように（実際の作成時にはオプションは選べないが）」 */
function newCust(cid){ const car = carOf(cid), ps = ['base'].concat(plansOf(car.std.showD)); S.ui.ncPlans = S.ui.ncPlans && S.ui.ncPlans.length ? S.ui.ncPlans.filter(p=>ps.includes(p)) : PLANS.slice(); if (!S.ui.ncPlans.length) S.ui.ncPlans = PLANS.slice();
  const sel = S.ui.ncPlans, k = p => calc(p==='base' ? baseCtx(car) : stdCtx(car,p)).cash;
  ov(`<div class="hd">${I('plus','＋',16)} 個別見積を作る　<span style="font-weight:600;font-size:13px;color:var(--text2)">${esc(car.num)} ${esc(car.maker)} ${esc(car.model)}</span><button class="x" onclick="closeOv()">✕</button></div><div class="bd">
    <div style="font-size:14px">どの見積から作りますか？（いくつでも）</div>
    <div class="nc-pl">${ps.map(p=>`<button class="nc-pc ${sel.includes(p)?'on':''}" onclick="ncToggle('${cid}','${p}')"><span>${pb(p)}</span><b>${yen(k(p))}</b></button>`).join('')}</div>
    <div style="margin-top:6px"><button class="q-btn sm" onclick="S.ui.ncPlans=${JSON.stringify(ps).replace(/"/g,"'")};newCust('${cid}')">全部</button></div>
    ${isDirty() && S.ui.view==='car' && S.ui.step==='std' ? '<div class="q-why" style="margin-top:8px">プラン見積で直した内容も保存されます。</div>' : ''}</div>
    <div class="ft"><button class="q-btn" onclick="closeOv()">やめる</button><button class="q-btn pri" ${sel.length?'':'disabled'} onclick="closeOv();newCustMake('${cid}')">作る（${sel.length}つ）</button></div>`, true);
}
function ncToggle(cid, p){ const s = S.ui.ncPlans; const i = s.indexOf(p); if (i>=0) s.splice(i,1); else s.push(p); S.ui.ncPlans = ALL_P.filter(x=>s.includes(x)); newCust(cid); }
function newCustMake(cid){ const car = carOf(cid); const plans = S.ui.ncPlans.slice();
  if (S.ui.view==='car' && S.ui.step==='std' && S.edit){ car.reached = Math.max(reachedOf(car), 2); editCommit(); }   // プラン見積から来た時は、プラン見積も保存
  snap(); const u = newCustObj(S, car, { name:'', made:TODAY }); u.no = Math.max(0, ...car.custs.map(x=>custNoOf(car,x))) + 1; u.major = majorOf(car); u.minor = minorOf(car); u.plans = plans; u.showD = plans.includes('D'); if (!plans.includes(u.rec)) u.rec = plans.filter(p=>p!=='D' && p!=='base')[0] || plans[0];
  car.custs.push(u); S.ui.step = 'cust'; S.ui.custId = u.id; S.ui.plan = u.rec; car.reached = Math.max(reachedOf(car), 2); save(); render(); setTimeout(()=>{ const e = $('u-name'); if (e) e.focus(); }, 30); toast('プラン見積を写して個別見積を作りました。まずお名前を', true); }
function custPlanToggle(cid, uid, p){ const car = carOf(cid), u = custOf(car, uid), cur = custPlans(u).slice(), i = cur.indexOf(p);
  if (i>=0){ if (cur.length===1) return toast('プランは1つ以上残してください'); cur.splice(i,1); } else cur.push(p);
  snap(); u.plans = ALL_P.filter(x=>cur.includes(x)); u.showD = u.plans.includes('D'); if (!u.plans.includes(u.rec)) u.rec = u.plans.filter(x=>x!=='D' && x!=='base')[0] || u.plans[0];
  if (!u.plans.includes(S.ui.plan)) S.ui.plan = u.rec; save(); render(); }
function custSet(cid, uid, path, v, hard){ const u = custOf(carOf(cid), uid); if (hard) snap(); const ks = path.split('.'); let o = u; for (let i=0;i<ks.length-1;i++) o = o[ks[i]]; o[ks[ks.length-1]] = v; if (hard){ save(); render(); } else renderKeep(); }
const NG = /納車準備|納車整備|仕上げ/;   // 🗣 2026-10-04「ロックはいらない」→ 代書は外した。納車整備はプランの段階で扱うので残す
function custItem(cid, uid, i, k, v){ const u = custOf(carOf(cid), uid); if (k==='n' && NG.test(v)){ toast(`「${v}」はオプションに置けません（納車整備は「納車整備」の段階で）`); render(); return; } u.items[i][k] = v; if (k==='n'){ save(); renderSoon(); } else renderKeep(); }
/* 🗣 2026-10-19「この方の条件も、チェックを入れると下に展開して、さらに詳細を選べたり手入力できるように。希望ナンバーでも絵柄・字光などもあるし、車庫証明も東京なら代行代が変わるなど様々なバリエーションがある」
   ＝条件ごとに 種類（プルダウン＋手入力）・課税の金額・立替の金額・メモ を u.cond.d[条件] に持つ。種類を選ぶと金額が入る。金額が決まっていない種類（null）は「金額を入れる」の札。計算は calc がこれを読む */
const CONDP = (kei) => { const F = S.set.fees, PL = S.set.plates || {}; return {
  wish:    { k:'代行費用（課税）', t:'ナンバー代（立替）', memo:'例：希望の番号・図柄の種類', ty:[['希望番号（ペイント）',F.wish,kei?PL.kWishP:PL.wishP],['希望番号（字光式）',F.wish,kei?PL.kWishJ:PL.wishJ,'光らせる器具（字光式の枠）は別。付ける時はオプションの行で'],['図柄入り',F.wish,kei?PL.kZug:PL.zug,'地方版（松戸・柏など）・全国版とも同じ金額。フルカラーの寄付金（1,000円〜）は入っていない＝付ける時は自由行で']] },
  out:     { k:'費用（課税）', t:'立替（あれば）', memo:'例：登録先（品川・横浜など）', ty:[['県外・管轄外',F.out,0]] },
  garage:  { k:'代行費用（課税）', t:'証紙代（立替）', memo:'例：警察署・保管場所', ty:[['千葉県内',F.daikoGarage,F.garage],['東京都',null,null],['その他の都道府県',null,null]] },
  deliver: { k:'費用（課税）', t:'立替（あれば）', memo:'例：納車先（〇〇市・会社）', ty:[['ご指定場所',F.deliver,0]] } }; };
const condD = (cond, key, kei) => { const d = cond && cond.d && cond.d[key]; if (d) return d; const P = CONDP(kei)[key].ty[0]; return { ty:P[0], k:P[1], t:P[2], memo:'' }; };
function condDUI(car, u, key, dis){ const P = CONDP(car.kei)[key], d = condD(u.cond, key, car.kei), note = (P.ty.find(x=>x[0]===d.ty)||[])[3], id = `cd-${key}-${u.id}`, A = `'${car.id}','${u.id}','${key}'`, miss = d.k==null || d.t==null;
  return `<div class="q-cd"><label>種類</label><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${pickIn(id, d.ty, P.ty.map(x=>[x[0], x[0]+(x[1]==null||x[2]==null?'（金額は手で）':'')]), v=>condDType(car.id, u.id, key, v), `<input class="q-in" style="width:180px" value="${esc(d.ty)}" placeholder="種類を入れる" onchange="condDSet(${A},'ty',this.value.trim())" ${dis?'disabled':''}>`, dis)}${miss?'<span class="q-pill warn">金額を入れる</span>':''}</div>${note?`<span></span><div class="q-why" style="margin:0">${note}</div>`:''}
    <label>${P.k}</label><div class="km-in">${money(id+'-k', d.k||0, `condDSet(${A},'k',parseYen(this.value),1)`, dis)}</div>
    <label>${P.t}</label><div class="km-in">${money(id+'-t', d.t||0, `condDSet(${A},'t',parseYen(this.value),1)`, dis)}</div>
    <label>メモ</label><input class="q-in" id="${id}-m" value="${esc(d.memo)}" placeholder="${P.memo}" onchange="condDSet(${A},'memo',this.value.trim())" ${dis?'disabled':''}></div>`; }
function condFreeUI(car, u, dis){ const C = car.id, U = u.id;
  return (u.cond.free||[]).map((f,i)=>{ const A = `'${C}','${U}',${i}`, id = `cf-${U}-${i}`;
    return `<div class="q-tog q-cf"><input type="checkbox" ${f.on?'checked':''} onchange="condFSet(${A},'on',this.checked)" ${dis?'disabled':''}><input class="q-in fn" id="${id}-n" value="${esc(f.n)}" placeholder="条件の名前（例：遠方への陸送）" onchange="condFSet(${A},'n',this.value.trim())" ${dis?'disabled':''}><span class="q-cls in">自由行</span><button class="q-del" tabindex="-1" title="この行を消す" onclick="condFDelAsk(${A})" ${dis?'disabled':''}>✕</button></div>
      ${f.on ? `<div class="q-cd"><label>金額（課税）</label><div class="km-in">${money(id+'-k', f.k||0, `condFSet(${A},'k',parseYen(this.value),1)`, dis)}</div>
        <label>立替（あれば）</label><div class="km-in">${money(id+'-t', f.t||0, `condFSet(${A},'t',parseYen(this.value),1)`, dis)}</div>
        <label>メモ</label><input class="q-in" id="${id}-m" value="${esc(f.memo)}" placeholder="見積書の名前の後ろに付く（例：〇〇市まで）" onchange="condFSet(${A},'memo',this.value.trim())" ${dis?'disabled':''}></div>` : ''}`; }).join('')
    + `<button class="q-btn sm" style="margin-top:4px" onclick="condFAdd('${C}','${U}')" ${dis?'disabled':''}>${I('plus','＋',13)} 自由行（条件を足す）</button>`; }
function condFAdd(cid, uid){ const u = custOf(carOf(cid), uid); snap(); u.cond.free = (u.cond.free||[]).concat([{ n:'', k:0, t:0, memo:'', on:true }]); save(); render(); const i = u.cond.free.length-1; setTimeout(()=>{ const e = $(`cf-${uid}-${i}-n`); if (e) e.focus(); }, 30); }
function condFSet(cid, uid, i, f, v, soft){ const u = custOf(carOf(cid), uid), x = (u.cond.free||[])[i]; if (!x) return; if (!soft) snap(); x[f] = v; if (soft) renderKeep(); else { save(); renderSoon(); } }
function condFDelAsk(cid, uid, i){ const x = (custOf(carOf(cid), uid).cond.free||[])[i]; if (!x) return; rowDelAsk(x.n, `condFDel('${cid}','${uid}',${i})`, false); }
function condFDel(cid, uid, i){ const u = custOf(carOf(cid), uid); snap(); const x = u.cond.free[i]; u.cond.free.splice(i,1); save(); render(); toast(`「${x.n||'（名前なし）'}」の行を消しました`, true); }
function condDHold(cid, uid, key){ const car = carOf(cid), u = custOf(car, uid); u.cond.d = u.cond.d || {}; if (!u.cond.d[key]) u.cond.d[key] = Object.assign({}, condD(u.cond, key, car.kei)); return u.cond.d[key]; }
function condDType(cid, uid, key, v){ snap(); const d = condDHold(cid, uid, key), P = CONDP(carOf(cid).kei)[key].ty.find(x=>x[0]===v); d.ty = v; if (P){ d.k = P[1]; d.t = P[2]; } save(); render(); }
function condDSet(cid, uid, key, f, v, soft){ if (!soft) snap(); const d = condDHold(cid, uid, key); d[f] = v; if (soft) renderKeep(); else { save(); renderSoon(); } }
function custToggle(cid, uid, i, p){ const u = custOf(carOf(cid), uid); snap(); const it = u.items[i]; it.in[p] = it.in[p]?0:1;
  if (!custPlans(u).filter(q=>PLANS.includes(q)).some(q=>it.in[q])) it.keep = 1;   // 全部外しても上に残す（消すのは ✕）
  save(); render(); }
function custRowDelAsk(cid, uid, i){ const car = carOf(cid), x = custOf(car, uid).items[i]; if (!x) return;
  rowDelAsk(x.n, `custRm('${cid}','${uid}',${i})`, !!x.n && stdItems(car).some(q=>q.n===x.n || q.base===x.n)); }
function custMoveTo(cid, uid, i, j, after){ const u = custOf(carOf(cid), uid), it = u.items[i], tg = u.items[j]; if (!it || !tg || i===j) return; snap();
  u.items.splice(i,1); let k = u.items.indexOf(tg); if (after) k++; u.items.splice(k,0,it); save(); render(); }
function custRm(cid, uid, i){ const u = custOf(carOf(cid), uid); snap(); const x = u.items[i]; u.items.splice(i,1); save(); render(); toast(`「${x.n||'（品名なし）'}」の行を消しました`, true); }
/* 自由行（🗣 2026-10-18）＝品名・金額とも空の行を足して、品名の欄へ（前の「テンプレに無い品を入れる」欄の代わり） */
function custAddFree(cid, uid){ custAdd(cid, uid, '', 0); const u = custOf(carOf(cid), uid), i = u.items.length-1; setTimeout(()=>{ const el = $('u-in-'+i); if (el) el.focus(); }, 30); }
function custAddTpl(cid, uid, key, p){ const car = carOf(cid), u = custOf(car, uid), x = stdItems(car).find(q=>q.key===key); if (!x) return; snap(); const inn = {A:0,B:0,C:0}; inn[p] = 1;
  u.items.push(Object.assign({ n:x.n, a:x.a, in:inn }, x.laborL!=null ? { bodyA:x.bodyA, laborL:x.laborL, bn:x.bn } : {}, x.noSize ? { noSize:true } : {})); save(); render(); toast(`「${x.base}」を ${p} に入れました`, true); }
function custAdd(cid, uid, n, a, p0){ const u = custOf(carOf(cid), uid); snap(); const inn = {A:0,B:0,C:0}; const opP = custPlans(u).filter(p=>PLANS.includes(p)), tp = p0 || (opP.includes(S.ui.plan) ? S.ui.plan : (opP[0]||'A')); inn[tp] = 1; u.items.push({ n, a, in:inn }); save(); render(); toast(`「${n||'自由行'}」を ${tp} に入れました${opP.length>1?'（ほかのプランは '+opP.join('/')+' で）':''}`, true); }
function custApplyBase(cid, uid){ const car = carOf(cid), u = custOf(car, uid); snap(); u.baseSnap = JSON.parse(JSON.stringify(car.base)); u.major = majorOf(car); save(); render(); toast('いまの基本価格にそろえました', true); }
/* 🗣 2026-10-02「消去は売約部分じゃなくて、左側の顧客のグループでその顧客に紐づいた丸ごとを消す。BOX 右上に乗せるとバツが出て、POP アップ警告で実行」 */
function custDelAsk(cid, uid){ const car = carOf(cid), u = custOf(car,uid);
  ov(`<div class="hd">${I('warn','⚠',16)} 見積を消す<button class="x" onclick="closeOv()">✕</button></div><div class="bd">
    <div style="font-size:14px"><b>${esc(u.name||'（お名前未入力）')} 様</b>の個別見積を丸ごと消します（${custPlans(u).map(plab).join('・')}・条件・下取・お支払い・メモ）。</div>
    <div class="q-why" style="margin-top:6px">消したあとは、すぐ出る「元に戻す」で戻せます。</div></div>
    <div class="ft"><button class="q-btn" onclick="closeOv()">やめる</button><button class="q-btn dan" onclick="closeOv();custDelete('${cid}','${uid}')">消す</button></div>`, true); }
function custDelete(cid, uid){ const car = carOf(cid); snap(); const u = custOf(car,uid); car.custs = car.custs.filter(x=>x.id!==uid); S.ui.custId = null; save(); render(); toast(`${u.name||'お客様'} 様の見積を消しました`, true); }
// ④
function orderSet(cid, k, v){ const car = carOf(cid); car.order[k] = v; save(); if (k==='startBefore') render(); }
function orderBump(cid){ const car = carOf(cid); snap(); car.order.ver++; save(); render(); toast(`版${car.order.ver} にしました`, true); }
function orderCancel(cid){ const car = carOf(cid); snap(); const uid = car.order.cust; car.order = null; S.ui.step = 'cust'; S.ui.custId = uid; save(); render(); toast('売約を取り消しました', true); }
/* テーマは CarFlow 本体に合わせる（quote-data.js）。ここでは切り替えない */
document.addEventListener('keydown', e=>{ if (e.key==='Escape'){ if (NC) closeNewCar(); else if (!$('q-docov').hidden) closeDocs(); else if (!$('q-ov').hidden) closeOv(); } });
if (S.edit){ if (S.ui.view==='car') stashPending(); S.edit = null; if (S.ui.view==='car' && S.pending) S.ui.view = 'list'; }
if (saleTick()) save();   // セール：開始日・終了日を過ぎていたら、始める／元に戻す（jd などの定義の後で走らせる）
render(); if (typeof icHydrate==='function') icHydrate(document.body);
if (S.ui.view==='car' && curCar() && !S.edit) editBegin(curCar());
if (S.pending) setTimeout(pendingAsk, 300);

/* =====================================================================
   CarFlow とのつなぎ（v4.0.0）：quote-data.js が読み込み・保存・相場・ほかの人の保存を受け取る。ここは描き直しの入口だけ
   ===================================================================== */
let _rfT = null;
/* 裏で何か届いた時の描き直し。打ち込み中は待つ（入力欄が消えないように） */
function refreshSoon(){ clearTimeout(_rfT); _rfT = setTimeout(()=>{ const a = document.activeElement;
  if (a && a !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { refreshSoon(); return; }
  render(); if (!$('q-docov').hidden) renderDocs(); }, 250); }
window.QApi = { cogsBlank: () => JSON.stringify(cgOf({})),   /* 原価表の空の形（画面を開いただけで作られる物＝保存しない物の見分けに使う） */
  state: () => S, refresh: () => { render(); if (!$('q-docov').hidden) renderDocs(); }, refreshSoon, toast: m => toast(m), costSum: costOf };
window.QApp = { ready: () => true, go: a => goApp(a), route: r => routeGo(r), openCar: id => { if (S.ui.app!=='quote') goApp('quote'); if (carOf(id)) openCar(id); else toast('この車は見積の一覧にありません（月次で締めた車など）'); } };
const _qb = document.getElementById('q-boot'); if (_qb) _qb.remove();
