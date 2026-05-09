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

  // 装備品データを生成（exhibit / delivery / done 車両用）
  // EQUIPMENT_CATEGORIES.items 全項目に値を入れる（100%チェック完了）
  function _makeEquipmentData() {
    if (typeof EQUIPMENT_CATEGORIES === 'undefined') return {};
    const out = {};
    EQUIPMENT_CATEGORIES.forEach((cat) => {
      (cat.items || []).forEach((item) => {
        if (item.type === 'tri') {
          // 'on' = あり, 'off' = なし, 'none' = 未確認
          //  → 装備チェック「やってる」状態なので 'on'/'off' どちらかにする（'none'=未確認は出さない）
          out[item.id] = Math.random() < 0.7 ? 'on' : 'off';
        } else if (item.type === 'select' && Array.isArray(item.options)) {
          out[item.id] = _rand(item.options);
        } else if (item.type === 'text') {
          out[item.id] = '';
        } else {
          out[item.id] = 'on';
        }
      });
    });
    return out;
  }

  // tasks-def.js の REGEN_TASKS / DELIVERY_TASKS から workflow 全項目 true なオブジェクトを生成
  function _completeWorkflowFor(taskId, isDelivery) {
    const tasksDef = isDelivery ? (typeof DELIVERY_TASKS !== 'undefined' ? DELIVERY_TASKS : []) : (typeof REGEN_TASKS !== 'undefined' ? REGEN_TASKS : []);
    const task = tasksDef.find((t) => t.id === taskId);
    if (!task || !task.sections) return { _completed: true };
    const out = {};
    task.sections.forEach((sec) => {
      (sec.items || []).forEach((item) => {
        out[item.id] = true;
      });
    });
    return out;
  }
  // 部分完了：sectionsの中からランダムにX%だけtrue化
  function _partialWorkflowFor(taskId, isDelivery, pct) {
    const tasksDef = isDelivery ? (typeof DELIVERY_TASKS !== 'undefined' ? DELIVERY_TASKS : []) : (typeof REGEN_TASKS !== 'undefined' ? REGEN_TASKS : []);
    const task = tasksDef.find((t) => t.id === taskId);
    if (!task || !task.sections) return {};
    const out = {};
    task.sections.forEach((sec) => {
      (sec.items || []).forEach((item) => {
        if (Math.random() < pct / 100) out[item.id] = true;
      });
    });
    return out;
  }

  // 車両ごとに「あるべき進捗状態」のタスクを設定
  function _applyTasksByCol(car, col) {
    car.regenTasks = {};
    car.deliveryTasks = {};
    car.equipment = {};

    if (col === 'other' || col === 'purchase') {
      return;
    }
    if (col === 'regen') {
      // 再生中：50〜80% 進捗（しっかり進んでる感）
      const targetPct = _randInt(50, 80);
      REGEN_TOGGLE_TASKS.forEach((t) => { car.regenTasks[t] = Math.random() < (targetPct / 100); });
      REGEN_WORKFLOW_TASKS.forEach((t) => {
        if (Math.random() < 0.5) car.regenTasks[t] = _completeWorkflowFor(t, false);
        else car.regenTasks[t] = _partialWorkflowFor(t, false, _randInt(40, 90));
      });
      return;
    }
    if (col === 'exhibit') {
      // 展示：再生フェーズ 100% 完了（全項目 true、t_complete も true）
      REGEN_TOGGLE_TASKS.forEach((t) => { car.regenTasks[t] = true; });
      REGEN_WORKFLOW_TASKS.forEach((t) => { car.regenTasks[t] = _completeWorkflowFor(t, false); });
      // t_equip 完了用：car.equipment に EQUIPMENT_CATEGORIES の全項目値、regenTasks.t_equip に同じものをコピー
      const eqData = _makeEquipmentData();
      car.equipment = eqData;
      car.regenTasks['t_equip'] = Object.assign({}, eqData);
      return;
    }
    if (col === 'delivery') {
      // 納車準備：再生フェーズ完了 + 納車フェーズ部分完了
      REGEN_TOGGLE_TASKS.forEach((t) => { car.regenTasks[t] = true; });
      REGEN_WORKFLOW_TASKS.forEach((t) => { car.regenTasks[t] = _completeWorkflowFor(t, false); });
      const eqDataD = _makeEquipmentData();
      car.equipment = eqDataD;
      car.regenTasks['t_equip'] = Object.assign({}, eqDataD);
      const dPct = _randInt(40, 80);
      DELIVERY_TOGGLE_TASKS.forEach((t) => { car.deliveryTasks[t] = Math.random() < (dPct / 100); });
      DELIVERY_WORKFLOW_TASKS.forEach((t) => {
        if (Math.random() < 0.5) car.deliveryTasks[t] = _completeWorkflowFor(t, true);
        else car.deliveryTasks[t] = _partialWorkflowFor(t, true, _randInt(40, 80));
      });
      return;
    }
    if (col === 'done') {
      // 納車済み：全タスク完了
      REGEN_TOGGLE_TASKS.forEach((t) => { car.regenTasks[t] = true; });
      REGEN_WORKFLOW_TASKS.forEach((t) => { car.regenTasks[t] = _completeWorkflowFor(t, false); });
      const eqDataX = _makeEquipmentData();
      car.equipment = eqDataX;
      car.regenTasks['t_equip'] = Object.assign({}, eqDataX);
      DELIVERY_TOGGLE_TASKS.forEach((t) => { car.deliveryTasks[t] = true; });
      DELIVERY_WORKFLOW_TASKS.forEach((t) => { car.deliveryTasks[t] = _completeWorkflowFor(t, true); });
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
    { col: 'regen',    count: 5, invDays: [40, 65, 75, 85, 95] },
    { col: 'exhibit',  count: 6, invDays: [70, 80, 88, 95, 105, 130] },
    { col: 'delivery', count: 3, invDays: [50, 70, 100] },
    { col: 'done',     count: 2, invDays: [60, 90] },                 // 納車済み（月締め前）
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
        if (col === 'done') {
          car.deliveryDate = _daysAgo(_randInt(3, 14));
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
  // 操作ログ（auditLogs）80件・過去30日に分散
  //   作業実績ビュー（worklog）はこの globalLogs から計算される
  // =====================================
  const ACTION_TEMPLATES = [
    '装備品チェック を完了',
    '再生 を完了',
    '写真撮影 を完了',
    '見積もり作成 を完了',
    'webUP を完了',
    '展示 を完了',
    '再生完了 にチェック',
    '納車準備 を完了',
    '納車整備 を完了',
    '書類 を完了',
    '登録 を完了',
    '完全完了 にチェック',
    '車両情報を編集',
    '価格を変更',
    '展示中 → 納車準備 へ移動',
    '仕入れ → 再生中 へ移動',
    '再生中 → 展示中 へ移動',
    'お客様情報を更新',
    '作業メモを追記',
    '写真を更新',
  ];

  function _makeAuditLogs(carsList) {
    const logs = [];
    for (let i = 0; i < 80; i++) {
      const dAgo = _randInt(0, 30);
      const hour = _randInt(8, 19);
      const min = _randInt(0, 59);
      const d = new Date();
      d.setDate(d.getDate() - dAgo);
      d.setHours(hour, min, 0, 0);
      const car = _rand(carsList);
      const staff = _rand(STAFF.filter((s) => s.role !== 'viewer'));
      logs.push({
        timeJs: d, // ソート用
        time: d.toISOString(),
        timeStr: `${d.getMonth() + 1}/${d.getDate()} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
        uid: staff.uid,
        userName: staff.name,
        carId: car.id,
        carNum: car.num,
        action: _rand(ACTION_TEMPLATES),
      });
    }
    // 時刻昇順にソート（古い → 新しい）
    logs.sort((a, b) => a.timeJs - b.timeJs);
    return logs;
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

    // auditLogs（操作ログ）— 作業実績ビュー（worklog）もこれを使う
    const auditLogs = _makeAuditLogs(cars);
    for (const log of auditLogs) {
      const { timeJs, ...doc } = log;
      doc.time = timeJs; // モックは Date を Firestore Timestamp 風に扱う
      await ref.collection('auditLogs').add(doc);
    }
    console.log(`[demo-seed]   auditLogs: ${auditLogs.length}件`);

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
