// ========================================
// demo-sample-data.js
// デモ版：起動時にサンプルデータを Firestore モックに投入
// ----------------------------------------
// 中古車整備工場っぽい状態の在庫車・販売実績・付箋・設定を生成
// ========================================

(function () {
  'use strict';

  function _today() { return new Date().toISOString().split('T')[0]; }
  function _daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  }
  function _daysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }
  function _rand(a) { return a[Math.floor(Math.random() * a.length)]; }
  function _randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  // =====================================
  // メンバー（仮名・整備工場っぽく）
  // =====================================
  const STAFF = [
    { uid: 'demo-user-001',  name: '山田太郎',   displayName: '山田太郎',   customDisplayName: '山田太郎',   role: 'admin',   active: true, photoURL: null },
    { uid: 'demo-staff-002', name: '佐藤健一',   displayName: '佐藤健一',   customDisplayName: '佐藤健一',   role: 'manager', active: true, photoURL: null },
    { uid: 'demo-staff-003', name: '鈴木一郎',   displayName: '鈴木一郎',   customDisplayName: '鈴木一郎',   role: 'manager', active: true, photoURL: null },
    { uid: 'demo-staff-004', name: '田中正',     displayName: '田中正',     customDisplayName: '田中正',     role: 'staff',   active: true, photoURL: null },
    { uid: 'demo-staff-005', name: '高橋美咲',   displayName: '高橋美咲',   customDisplayName: '高橋美咲',   role: 'staff',   active: true, photoURL: null },
    { uid: 'demo-staff-006', name: '伊藤翔',     displayName: '伊藤翔',     customDisplayName: '伊藤翔',     role: 'worker',  active: true, photoURL: null },
  ];

  // =====================================
  // 車種定義
  // =====================================
  const MAKERS = ['トヨタ', 'ホンダ', 'スズキ', 'ダイハツ', '日産', 'マツダ', 'スバル', '三菱'];
  const MODELS = {
    'トヨタ': ['ヴォクシー', 'ノア', 'カローラ', 'ヤリス', 'プリウス', 'アクア', 'ハリアー', 'シエンタ'],
    'ホンダ': ['N-BOX', 'フィット', 'フリード', 'ステップワゴン', 'ヴェゼル', 'CR-V'],
    'スズキ': ['スイフト', 'ワゴンR', 'スペーシア', 'ハスラー', 'ジムニー', 'ソリオ'],
    'ダイハツ': ['タント', 'ムーヴ', 'ミラ', 'タフト', 'キャスト'],
    '日産': ['ノート', 'セレナ', 'デイズ', 'エクストレイル', 'ルークス'],
    'マツダ': ['デミオ', 'CX-5', 'CX-3', 'アクセラ'],
    'スバル': ['フォレスター', 'インプレッサ', 'XV', 'レヴォーグ'],
    '三菱': ['eK', 'デリカ', 'アウトランダー'],
  };
  const SIZES = ['軽自動車', 'コンパクト', 'ミドル', 'ラージ', 'SUV'];
  const COLORS = ['白', '黒', 'シルバー', 'パールホワイト', 'ガンメタ', 'ブルー', 'レッド'];
  const CUSTOMERS = ['田中様', '佐藤様', '鈴木様', '高橋様', '渡辺様', '伊藤様', '山本様', '中村様', '小林様', '加藤様'];

  // =====================================
  // タスク完成度プリセット
  // =====================================
  const REGEN_TOGGLE_TASKS = ['t_photo', 't_estim', 't_webup', 't_complete'];
  const REGEN_WORKFLOW_TASKS = ['t_equip', 't_regen', 't_exhibit'];
  const DELIVERY_TOGGLE_TASKS = ['d_docs', 'd_reg', 'd_complete'];
  const DELIVERY_WORKFLOW_TASKS = ['d_prep', 'd_maint'];

  // workflow の完了データ（簡易版：完了マーカーだけ）
  function _completeWorkflow() {
    return { _all_done: true, _completed_at: _daysAgo(_randInt(1, 30)) };
  }
  function _partialWorkflow(progressPct) {
    return { _partial: true, _pct: progressPct };
  }

  // 車両ごとに「あるべき進捗状態」のタスクを設定
  function _applyTasksByCol(car, col) {
    car.regenTasks = {};
    car.deliveryTasks = {};
    car.equipment = {};

    if (col === 'other' || col === 'purchase') {
      // 何もしない（ほぼ未着手）
      return;
    }
    if (col === 'regen') {
      // 再生中：30〜70% 進捗
      const targetPct = _randInt(30, 70);
      // toggleタスクは半数くらい true
      REGEN_TOGGLE_TASKS.forEach((t) => { car.regenTasks[t] = Math.random() < (targetPct / 100); });
      // workflow も部分完了
      REGEN_WORKFLOW_TASKS.forEach((t) => {
        if (Math.random() < 0.4) car.regenTasks[t] = _completeWorkflow();
        else if (Math.random() < 0.6) car.regenTasks[t] = _partialWorkflow(_randInt(20, 80));
      });
      return;
    }
    if (col === 'exhibit') {
      // 展示：再生フェーズ 100% 完了
      REGEN_TOGGLE_TASKS.forEach((t) => { car.regenTasks[t] = true; });
      REGEN_WORKFLOW_TASKS.forEach((t) => { car.regenTasks[t] = _completeWorkflow(); });
      return;
    }
    if (col === 'delivery') {
      // 納車準備：再生フェーズ完了 + 納車フェーズ部分完了
      REGEN_TOGGLE_TASKS.forEach((t) => { car.regenTasks[t] = true; });
      REGEN_WORKFLOW_TASKS.forEach((t) => { car.regenTasks[t] = _completeWorkflow(); });
      const dPct = _randInt(20, 80);
      DELIVERY_TOGGLE_TASKS.forEach((t) => { car.deliveryTasks[t] = Math.random() < (dPct / 100); });
      DELIVERY_WORKFLOW_TASKS.forEach((t) => {
        if (Math.random() < 0.4) car.deliveryTasks[t] = _completeWorkflow();
        else if (Math.random() < 0.6) car.deliveryTasks[t] = _partialWorkflow(_randInt(30, 80));
      });
      return;
    }
  }

  // =====================================
  // 在庫車両：col ごとに台数指定＋在庫日数を警告境界周辺で分散
  // =====================================
  // col: [台数, 在庫日数の中央値]
  const CAR_PLAN = [
    { col: 'other',    count: 2, invDays: [5, 12] },
    { col: 'purchase', count: 4, invDays: [3, 8, 15, 25] },
    { col: 'regen',    count: 5, invDays: [40, 65, 75, 85, 95] },     // 警告閾値90付近
    { col: 'exhibit',  count: 6, invDays: [70, 80, 88, 95, 105, 130] }, // 警告またぐ分布
    { col: 'delivery', count: 3, invDays: [50, 70, 100] },             // 納車準備
  ];

  function _makeCarsByPlan() {
    const list = [];
    let idx = 1;
    CAR_PLAN.forEach(({ col, count, invDays }) => {
      for (let i = 0; i < count; i++) {
        const maker = _rand(MAKERS);
        const model = _rand(MODELS[maker]);
        const photoIdx = ((idx - 1) % 13) + 1;
        const num = `KM-D${String(idx).padStart(3, '0')}`;
        const daysInStock = invDays[i] || _randInt(20, 100);
        const purchaseDate = _daysAgo(daysInStock);
        const car = {
          id: 'demo-car-' + idx,
          num,
          maker,
          model,
          year: String(2018 + (idx % 7)),
          color: _rand(COLORS),
          size: _rand(SIZES),
          km: _randInt(10, 150) * 1000,
          price: _randInt(50, 350) * 10000,
          purchaseDate,
          col,
          customerName: '',
          memo: '',
          workMemo: '',
          contract: 0,
          regenTasks: {},
          deliveryTasks: {},
          equipment: {},
          logs: [],
          photo: `images/sample/car${photoIdx}.jpg`,
          createdAt: purchaseDate,
          updatedAt: _today(),
        };
        if (col === 'delivery') {
          car.deliveryDate = _daysFromNow(_randInt(2, 14));
          car.customerName = _rand(CUSTOMERS);
          car.contract = 1;
        }
        _applyTasksByCol(car, col);
        list.push(car);
        idx++;
      }
    });
    return list;
  }

  // =====================================
  // 販売実績：過去24ヶ月、各月3〜8台
  // =====================================
  function _makeArchivedCars() {
    const list = [];
    for (let mAgo = 1; mAgo <= 24; mAgo++) {
      const d = new Date();
      d.setMonth(d.getMonth() - mAgo);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const ym = `${y}-${String(m).padStart(2, '0')}`;
      const count = _randInt(3, 8);
      for (let i = 0; i < count; i++) {
        const maker = _rand(MAKERS);
        const model = _rand(MODELS[maker]);
        const num = `KM-A${String(mAgo * 100 + i).padStart(4, '0')}`;
        const delivery = `${y}-${String(m).padStart(2, '0')}-15`;
        const invMonths = _randInt(1, 6);
        const purchase = new Date(delivery);
        purchase.setDate(purchase.getDate() - invMonths * 30);
        list.push({
          id: 'demo-arc-' + ym + '-' + i,
          num,
          maker,
          model,
          size: _rand(SIZES),
          color: _rand(COLORS),
          km: _randInt(20, 150) * 1000,
          year: String(2017 + _randInt(0, 7)),
          price: _randInt(50, 300) * 10000,
          purchaseDate: purchase.toISOString().split('T')[0],
          deliveryDate: delivery,
          col: 'done',
          customerName: _rand(CUSTOMERS),
          contract: 1,
          regenTasks: {},
          deliveryTasks: {},
          equipment: {},
          logs: [],
          photo: '',
          _archivedYM: ym,
          _archivedAt: `${y}-${String(m).padStart(2, '0')}-28`,
        });
      }
    }
    return list;
  }

  // =====================================
  // 付箋
  // =====================================
  const NOTES = [
    { color: 'red',    title: 'KM-D004 エンジンチェックランプ', body: '朝一の試運転で点灯。OBDで読んだら触媒系。詳細確認要。' },
    { color: 'orange', title: '部品発注リスト',                 body: 'タイヤ4本（KM-D006）／オイルフィルター10個まとめ買い／パッド2セット' },
    { color: 'yellow', title: 'お客様アポメモ',                 body: '田中様 / 土曜10時 / N-BOX試乗' },
    { color: 'blue',   title: '今月の目標',                       body: '販売台数：8台 / 売上：¥800万' },
    { color: 'green',  title: '工場のあれこれ',                   body: '冷蔵庫の在庫補充忘れずに（飲み物）' },
  ];

  // =====================================
  // 設定
  // =====================================
  const _curYM = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
  const SETTINGS = {
    appSettings: {
      invWarn: 90,
      delWarn: 14,
      deliveryLeadDays: 10,
      notif: { enabled: true },
      goals: { sales: 10000000, count: 8 },
    },
    closedRules: [
      { id: 'r-w-3', pattern: 'weekly', dow: 3 },
      { id: 'r-bw-2', pattern: 'biweekly', dow: 2, anchorYM: _curYM },
    ],
    customHolidays: [],
    SIZES: SIZES,
    boardLabels: { red: '緊急', orange: '今日中', yellow: '今週中', green: '連絡', blue: '余裕' },
    _seedSampleDone: true,
  };

  // =====================================
  // メイン投入
  // =====================================
  async function demoSeedAll() {
    const fb = window.fb;
    if (!fb || !fb.db) { console.error('[demo-seed] fb not ready'); return; }
    const cid = fb.currentCompanyId;
    const ref = fb.db.collection('companies').doc(cid);

    console.log('[demo-seed] start');

    // staff
    for (const s of STAFF) {
      await ref.collection('staff').doc(s.uid).set(s);
    }
    console.log(`[demo-seed]   staff: ${STAFF.length}人`);

    // settings/main
    await ref.collection('settings').doc('main').set(SETTINGS);

    // cars
    const cars = _makeCarsByPlan();
    for (const c of cars) {
      await ref.collection('cars').doc(c.id).set(c);
    }
    console.log(`[demo-seed]   cars: ${cars.length}台`);

    // archivedCars
    const arc = _makeArchivedCars();
    for (const a of arc) {
      await ref.collection('archivedCars').doc(a.id).set(a);
    }
    console.log(`[demo-seed]   archived: ${arc.length}台`);

    // boardNotes
    for (let i = 0; i < NOTES.length; i++) {
      const n = NOTES[i];
      const id = 'demo-note-' + i;
      await ref.collection('boardNotes').doc(id).set({
        id,
        title: n.title,
        body: n.body,
        color: n.color,
        order: i,
        createdAt: _today(),
        createdBy: 'demo-user-001',
        createdByName: '山田太郎',
        updatedAt: _today(),
      });
    }

    // integrations/line
    await ref.collection('integrations').doc('line').set({
      enabled: true,
      channelAccessToken: 'demo●●●●●●●●●●',
      groupId: 'demo-group-id',
      triggers: {
        dailyReport: { enabled: true, time: '17:00', includeClosedDays: false },
        redBoardNote: { enabled: true },
        taskComplete: { enabled: true, mode: 'all' },
      },
    });

    console.log('[demo-seed] complete');
  }

  window.demoSeedAll = demoSeedAll;
  console.log('[demo-sample-data] ready');
})();
