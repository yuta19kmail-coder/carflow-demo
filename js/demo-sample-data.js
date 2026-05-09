// ========================================
// demo-sample-data.js
// デモ版：起動時にサンプルデータを Firestore モックに投入
// ----------------------------------------
// cars / archivedCars / boardNotes / settings / staff / templates
// それっぽい中古車整備工場のデータを生成
// ========================================

(function () {
  'use strict';

  function _today() {
    return new Date().toISOString().split('T')[0];
  }
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

  // =====================================
  // メンバー（デモスタッフ）
  // =====================================
  const STAFF = [
    { uid: 'demo-user-001', name: 'ゆうた（デモ）', role: 'admin',   active: true, photoURL: null },
    { uid: 'demo-staff-02', name: '社長',           role: 'manager', active: true, photoURL: null },
    { uid: 'demo-staff-03', name: '専務',           role: 'manager', active: true, photoURL: null },
    { uid: 'demo-staff-04', name: '整備士A',       role: 'staff',   active: true, photoURL: null },
    { uid: 'demo-staff-05', name: '整備士B',       role: 'worker',  active: true, photoURL: null },
  ];

  // =====================================
  // 在庫車両（cars）20台
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
  const COLS = ['other', 'purchase', 'regen', 'exhibit', 'delivery'];

  function _rand(a) { return a[Math.floor(Math.random() * a.length)]; }
  function _randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  function _makeCar(idx) {
    const maker = _rand(MAKERS);
    const model = _rand(MODELS[maker]);
    const col = COLS[Math.min(idx % COLS.length, COLS.length - 1)];
    const num = `KM-D${String(idx).padStart(3, '0')}`;
    const purchaseDate = _daysAgo(_randInt(10, 180));
    // 写真：images/sample/car1.jpg 〜 car13.jpg をローテーション
    const photoIdx = ((idx - 1) % 13) + 1;
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
      car.customerName = _rand(['田中', '佐藤', '鈴木', '高橋', '渡辺']) + '様';
      car.contract = 1;
    }
    return car;
  }

  // =====================================
  // 販売実績（archivedCars）= 過去24ヶ月、各月3〜8台
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
          customerName: _rand(['田中', '佐藤', '鈴木', '高橋', '渡辺', '伊藤', '山本']) + '様',
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
  // 付箋（boardNotes）
  // =====================================
  const NOTES = [
    { color: 'red',    title: 'KM-D004 エンジンチェックランプ', body: '朝一の試運転で点灯。OBDで読んだら触媒系。詳細確認要。' },
    { color: 'yellow', title: '部品発注リスト',                    body: 'タイヤ4本（KM-D006）／オイルフィルター10個まとめ買い／パッド2セット' },
    { color: 'blue',   title: 'お客様アポメモ',                    body: '田中様 / 土曜10時 / N-BOX試乗' },
    { color: 'green',  title: '今月の目標',                          body: '販売台数：8台 / 売上：¥800万' },
    { color: 'pink',   title: '工場のあれこれ',                      body: '冷蔵庫の在庫補充忘れずに（飲み物）' },
  ];

  // =====================================
  // 設定（settings/main）
  //   ※ appTaskEnabled 等は設定しない → tasks-def.js のメモリ既定値を活かす
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
    // 🚫 定休日：水曜（毎週）+ 火曜（隔週）
    closedRules: [
      { id: 'r-w-3', pattern: 'weekly', dow: 3 },                                  // 毎週水曜
      { id: 'r-bw-2', pattern: 'biweekly', dow: 2, anchorYM: _curYM },             // 隔週火曜
    ],
    customHolidays: [],
    SIZES: SIZES,
    boardLabels: { red: '緊急', orange: '今日中', yellow: '今週中', green: '連絡', blue: '余裕' },
    _seedSampleDone: true,
  };

  // =====================================
  // メイン投入関数
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

    // settings/main
    await ref.collection('settings').doc('main').set(SETTINGS);

    // cars (在庫車両 20台)
    for (let i = 1; i <= 20; i++) {
      const c = _makeCar(i);
      await ref.collection('cars').doc(c.id).set(c);
    }

    // archivedCars (過去24ヶ月分)
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
        createdAt: _today(),
        createdBy: 'demo-user-001',
        createdByName: 'ゆうた（デモ）',
        updatedAt: _today(),
      });
    }

    // integrations/line（LINE設定 - 何か入ってる風）
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
