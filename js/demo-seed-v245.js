// ========================================
// demo-seed-v245.js
// デモ版：v2.34.0〜v2.45.0 で増えた「入れ物」ぶんの種
// ----------------------------------------
// ◎なぜ要るか
//   demo-sample-data.js は CarFlow v2.5.x の頃に書いたもので、
//   そのあと本体に増えた入れ物には何も入らない＝画面が空になる。
//     ・メンバー画面 … 名簿の出どころが CoreMembers（coreMembers / coreDepts / portalMembers）に変わった
//     ・整備依頼業務 … PitFlow の入庫カード（pitCards / pitSettings / pitLoaners …）を読む
//
// ◎やり方
//   demo-sample-data.js の `demoSeedAll` を **包んで**、そのあとに足す。
//   ＝もとの種ファイルを1行も触らずに、増えた入れ物だけを埋められる。
//   🔴 このファイルは demo-sample-data.js より **後ろ** に読むこと。
//
// 🔴 本体（CarFlow\carflow）には1行も置かない。ここは
//    D:\Claude\アプリ開発\_tools\carflow-demo\js\ に置き、
//    make-demo-carflow.ps1 がコピーで入れる。
// ========================================
(function (w) {
  'use strict';

  /* ---------------- 組織図（CoreMembers の coreDepts） ---------------- */
  var DEPTS = [
    { id: 'd-sales', name: '車販部',     parentId: '' },
    { id: 'd-pit',   name: '整備部',     parentId: '' },
    { id: 'd-front', name: 'フロント課', parentId: 'd-pit' }
  ];

  /* ---------------- 人（demo-sample-data.js の STAFF と同じ6人） ----------------
     ⚠ uid は STAFF と揃える。ずらすと付箋や担当の紐づけが切れる。 */
  var PEOPLE = [
    { uid: 'demo-user-001',  name: '山田太郎', disp: '山田', dept: 'd-sales', role: '管理者' },
    { uid: 'demo-staff-002', name: '佐藤健一', disp: '佐藤', dept: 'd-sales', role: 'マネージャー' },
    { uid: 'demo-staff-003', name: '鈴木一郎', disp: '鈴木', dept: 'd-front', role: 'マネージャー' },
    { uid: 'demo-staff-004', name: '田中正',   disp: '田中', dept: 'd-front', role: 'スタッフ' },
    { uid: 'demo-staff-005', name: '高橋美咲', disp: '高橋', dept: 'd-sales', role: 'スタッフ' },
    { uid: 'demo-staff-006', name: '伊藤翔',   disp: '伊藤', dept: 'd-pit',   role: '作業者' }
  ];

  /* ---------------- PitFlow 側（整備依頼業務が読む） ---------------- */
  var PIT_SETTINGS = {
    workTypes: [
      { id: 'shaken',  label: '車検',   color: '#ef4444' },
      { id: '12pt',    label: '12点',   color: '#f97316' },
      { id: 'general', label: '一般',   color: '#84cc16' },
      { id: 'oil',     label: 'オイル', color: '#eab308' },
      { id: 'bp',      label: 'B.P',    color: '#3b82f6', combinable: true },
      { id: 'coat1y',  label: '1Y',     color: '#8b5cf6', combinable: true },
      { id: 'coat3m',  label: '3M',     color: '#a855f7', combinable: true },
      { id: 'carsale', label: '車販',   color: '#06b6d4', combinable: true }
    ]
  };

  function ymd(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function shift(n) { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return ymd(d); }

  /* 洗車・コーティング・その他依頼が1つずつ出るように作る（画面が空にならないように） */
  function pitCards() {
    return [
      { id: 'pd-1', resNo: 'R-2401', customer: '井上 健',   kana: 'イノウエ ケン',   car: 'ノア',       maker: 'トヨタ',
        boardId: 'default', status: 'workDone', returnStage: 'returnWait',
        workTypes: ['shaken'], workType: 'shaken',
        reserveDate: shift(-2), returnDate: shift(0), needWash: true },
      { id: 'pd-2', resNo: 'R-2402', customer: '大野 里美', kana: 'オオノ サトミ',   car: 'フィット',   maker: 'ホンダ',
        boardId: 'default', status: 'work', returnStage: '',
        workTypes: ['12pt'], workType: '12pt',
        reserveDate: shift(-1), returnDate: shift(1), needWash: true },
      { id: 'pd-3', resNo: 'R-2403', customer: '木村 亮',   kana: 'キムラ リョウ',   car: 'ハスラー',   maker: 'スズキ',
        boardId: 'default', status: 'parts', returnStage: '',
        workTypes: ['shaken'], workType: 'shaken',
        reserveDate: shift(-3), returnDate: shift(4), headlight: true },
      { id: 'pd-4', resNo: 'R-2404', customer: '斉藤 直子', kana: 'サイトウ ナオコ', car: 'CX-5',      maker: 'マツダ',
        boardId: 'import', status: 'work', returnStage: '',
        workTypes: ['general', 'coat3m'], workType: 'general',
        reserveDate: shift(-1), returnDate: shift(3), coatingOK: true },
      { id: 'pd-5', resNo: 'R-2405', customer: '中村 拓也', kana: 'ナカムラ タクヤ', car: 'ヴェゼル',   maker: 'ホンダ',
        boardId: 'default', status: 'reserved', returnStage: '',
        workTypes: ['coat1y'], workType: 'coat1y',
        reserveDate: shift(6), returnDate: '' },
      { id: 'pd-6', resNo: 'R-2406', customer: '林 恵子',   kana: 'ハヤシ ケイコ',   car: 'タント',     maker: 'ダイハツ',
        boardId: 'default', status: 'contact', returnStage: '',
        workTypes: ['carsale'], workType: 'carsale',
        reserveDate: shift(-1), returnDate: shift(2),
        salesReq: true, salesReqMemo: 'ルームクリーニング（納車前）' }
    ];
  }

  var LOANERS = [
    { id: 'L01', name: '代車1', model: 'タント',  plate: '習志野 500 あ 11-11' },
    { id: 'L02', name: '代車2', model: 'N-BOX',   plate: '習志野 500 あ 22-22' }
  ];
  var ASSIGNS = [
    { id: 'la-1', loanerId: 'L01', cardId: 'pd-2', fromDate: shift(-1), toDate: shift(1) }
  ];

  async function seed() {
    var fb = w.fb;
    if (!fb || !fb.db) { console.error('[demo-seed-v245] fb がまだです'); return; }
    var ref = fb.db.collection('companies').doc(fb.currentCompanyId);

    /* ① 名簿（CoreMembers 基準） */
    for (var i = 0; i < DEPTS.length; i++) {
      await ref.collection('coreDepts').doc(DEPTS[i].id).set(DEPTS[i]);
    }
    for (var j = 0; j < PEOPLE.length; j++) {
      var p = PEOPLE[j];
      await ref.collection('coreMembers').doc('cm-' + p.uid).set({
        name: p.name, dispName: p.disp, lastName: p.name.split(' ')[0] || p.disp,
        primaryDeptId: p.dept, subDeptIds: [], active: true,
        joinedAt: '2020-04-01', portalMemberId: 'pm-' + p.uid
      });
      await ref.collection('portalMembers').doc('pm-' + p.uid).set({
        uid: p.uid, name: p.name, gname: p.name, email: p.uid + '@example.com',
        active: true, photo: null,
        carflow: { on: true, role: p.role, sortOrder: j }
      });
    }
    console.log('[demo-seed-v245]   名簿: ' + PEOPLE.length + '人 / 部署 ' + DEPTS.length);

    /* ② PitFlow 側（整備依頼業務） */
    await ref.collection('pitSettings').doc('main').set(PIT_SETTINGS);
    var cards = pitCards();
    for (var k = 0; k < cards.length; k++) {
      await ref.collection('pitCards').doc(cards[k].id).set(cards[k]);
    }
    for (var m = 0; m < LOANERS.length; m++) {
      await ref.collection('pitLoaners').doc(LOANERS[m].id).set(LOANERS[m]);
    }
    for (var n = 0; n < ASSIGNS.length; n++) {
      await ref.collection('pitLoanerAssigns').doc(ASSIGNS[n].id).set(ASSIGNS[n]);
    }
    console.log('[demo-seed-v245]   PitFlow: 入庫カード ' + cards.length + '件 / 代車 ' + LOANERS.length + '台');
  }

  /* もとの種を包む（demo-sample-data.js は1行も触らない） */
  var orig = w.demoSeedAll;
  w.demoSeedAll = async function () {
    if (typeof orig === 'function') { try { await orig(); } catch (e) { console.error('[demo-seed] もとの種で失敗', e); } }
    try { await seed(); } catch (e) { console.error('[demo-seed-v245] 失敗', e); }
    console.log('[demo-seed-v245] complete');
  };
  w.demoSeedV245 = seed;
  console.log('[demo-seed-v245] ready');
})(window);
