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

  // 登録内容（d_register）の小タスク（選択式＋あり/なし/該当なし）をランダム生成
  //   → 「登録内容バー」＋多様な入力タイプの小タスク（小タスクバリエーション）を実演
  function _makeRegisterData() {
    const patterns = ['中古新規', '継続移転', '移転継続', '名変', '予備検'];
    const tri = (onRate) => { const r = Math.random(); return r < onRate ? 'on' : (r < onRate + 0.45 ? 'off' : 'none'); };
    const pat = _rand(patterns);
    const loan = tri(0.4);
    return {
      reg_pattern: pat,
      reg_loan: loan,
      reg_ownership: loan === 'on' ? 'on' : tri(0.3),  // ローンありなら所有権ありになりやすい
      reg_minor: tri(0.12),
      reg_recycle: tri(0.75),
      reg_proxy: tri(0.35),
      reg_plate: tri(0.3),
    };
  }

  // v2.7-demo: 小タスクのパターン（タスクパターン＝variant）をデモ用に注入
  //   再生(t_regen)・展示(t_exhibit)に「簡易/フル」などのバリアントを追加（既存アイテムの部分集合なので進捗計算と整合）
  //   デモはテンプレを Firestore に seed せず in-memory の ChecklistTemplates をそのまま使うため、ここで足せば反映される。
  function _injectDemoVariants() {
    if (typeof ChecklistTemplates === 'undefined') return;
    const addVariants = (tplId, defs) => {
      const tpl = ChecklistTemplates[tplId];
      if (!tpl || !Array.isArray(tpl.variants) || !tpl.variants[0]) return;
      if (tpl.variants.length > 1) return; // 既に注入済みならスキップ（多重防止）
      const baseItems = [];
      (tpl.variants[0].sections || []).forEach((s) => (s.items || []).forEach((it) => baseItems.push(it)));
      defs.forEach((def) => {
        const items = (def.count ? baseItems.slice(0, def.count) : baseItems.slice()).map((it) => ({ ...it }));
        tpl.variants.push({ id: def.id, name: def.name, sections: [{ title: def.name, items }] });
      });
    };
    addVariants('tpl_regen_t_regen', [
      { id: 'regen_quick', name: '簡易コース', count: 4 },
      { id: 'regen_full',  name: '入念フルコース' },
    ]);
    addVariants('tpl_regen_t_exhibit', [
      { id: 'exh_basic', name: '基本セット', count: 2 },
      { id: 'exh_full',  name: 'フル展示' },
    ]);
  }
  // バリアントの小タスクid一覧（variantId未指定/未存在ならデフォルト=variants[0]）
  function _variantItemIds(tplId, variantId) {
    if (typeof ChecklistTemplates === 'undefined') return [];
    const tpl = ChecklistTemplates[tplId];
    if (!tpl || !Array.isArray(tpl.variants) || !tpl.variants.length) return [];
    const v = (variantId && tpl.variants.find((x) => x.id === variantId)) || tpl.variants[0];
    const ids = [];
    (v.sections || []).forEach((s) => (s.items || []).forEach((it) => ids.push(it.id)));
    return ids;
  }
  // 車に variant を割当て、完了状態（complete/partial/none）の小タスクデータを作る
  function _applyVariantState(car, phaseKey, taskId, tplId, variantId, state) {
    car.taskVariants = car.taskVariants || {};
    if (variantId && variantId !== 'default') car.taskVariants[taskId] = variantId;
    else if (car.taskVariants[taskId]) delete car.taskVariants[taskId];
    const ids = _variantItemIds(tplId, variantId);
    const obj = {};
    if (state === 'complete') ids.forEach((id) => { obj[id] = true; });
    else if (state === 'partial') ids.forEach((id, k) => { if (k % 2 === 0) obj[id] = true; });
    // 'none' は空（やってない）
    car[phaseKey] = car[phaseKey] || {};
    car[phaseKey][taskId] = obj;
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
      car.deliveryTasks['d_register'] = _makeRegisterData();  // 登録内容（小タスクバリエーション）
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
      car.deliveryTasks['d_register'] = _makeRegisterData();  // 登録内容（小タスクバリエーション）
      return;
    }
  }

  // =====================================
  // 在庫車両：col ごとに台数指定＋在庫日数を警告境界周辺で分散
  // =====================================
  // col: [台数, 在庫日数の中央値]
  const CAR_PLAN = [
    { col: 'other',    count: 3, invDays: [5, 12, 22] },
    { col: 'purchase', count: 6, invDays: [3, 7, 12, 18, 25, 33] },
    { col: 'regen',    count: 7, invDays: [38, 52, 62, 72, 82, 92, 100] },
    { col: 'exhibit',  count: 9, invDays: [55, 68, 78, 88, 95, 105, 115, 125, 140] },
    { col: 'delivery', count: 5, invDays: [25, 45, 65, 85, 105] },
    { col: 'done',     count: 3, invDays: [55, 75, 95] },             // 納車済み（月締め前）
  ];

  function _makeCarsByPlan() {
    _injectDemoVariants();   // 小タスクのパターン（variant）を ChecklistTemplates に注入
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
    // v2.7-demo: 新機能モリモリのサンプルデータを投入
    //   大タスクメモ（日付/自由/時刻）・緑付箋自動付与の元データ・カレンダー日付メモ・選択制大タスク
    const _stamp = { createdAt: _today(), updatedAt: _today() };
    const byCol = (c) => list.filter((x) => x.col === c);

    const CORE_MEMOS = [
      '名義変更書類を要確認。前オーナーと連絡待ち。',
      '内装の臭いが気になる。再施工を検討。',
      '右リアドアに小傷。展示前に補修済みか確認。',
      'ワンオーナー・記録簿あり。アピール材料に。',
      '納車時にフロアマット・ETCセットアップ忘れずに。',
    ];
    const WORK_MEMOS = [
      'バッテリー弱め→交換見積り',
      '商談2件あり。価格交渉中。',
      '車検整備の見積り待ち（部品取り寄せ）',
      'タイヤ残溝少なめ→交換を提案',
      '車検証の住所変更が未対応',
    ];
    const ESTIM_MEMOS = [
      '下取り込みで端数値引きの相談あり',
      '社外ナビ取付の追加見積りを提示予定',
      '保証プラン（1年）込みで提案',
    ];
    // コアメモ／作業メモを散らす
    list.forEach((c, i) => {
      if (i % 3 === 0) c.memo = CORE_MEMOS[i % CORE_MEMOS.length];
      if (i % 4 === 1) c.workMemo = WORK_MEMOS[i % WORK_MEMOS.length];
    });

    // 再生車：大タスクメモ「掲載予定日(日付)」＋「見積メモ(自由)」。掲載前なので t_webup は未完了に。
    byCol('regen').forEach((c, i) => {
      c.taskMemos = c.taskMemos || {};
      c.taskMemos.t_webup = { value: _daysFromNow(3 + i * 2), createdBy: 'demo-staff-004', ..._stamp };
      if (c.regenTasks) c.regenTasks.t_webup = false;
      if (i % 2 === 0) c.taskMemos.t_estim = { value: ESTIM_MEMOS[i % ESTIM_MEMOS.length], createdBy: 'demo-staff-002', ..._stamp };
    });
    // 展示車の一部：掲載済みなので t_webup 日付は過去
    byCol('exhibit').slice(0, 3).forEach((c, i) => {
      c.taskMemos = c.taskMemos || {};
      c.taskMemos.t_webup = { value: _daysAgo(2 + i), createdBy: 'demo-staff-005', ..._stamp };
    });
    // 選択制大タスク「下取り査定」：再生車の先頭3台だけ選択ON（1台は完了）
    byCol('regen').slice(0, 3).forEach((c, i) => {
      c.selectedTasks = c.selectedTasks || {};
      c.selectedTasks.regen = c.selectedTasks.regen || {};
      c.selectedTasks.regen.c_appraisal = true;
      c.regenTasks = c.regenTasks || {};
      c.regenTasks.c_appraisal = (i === 0);
    });
    // 納車準備車：「登録予定日(日付)」→ カレンダーの車両バーに表示＋緑付箋自動生成。「入庫予定(時刻)」も一部。
    byCol('delivery').forEach((c, i) => {
      c.taskMemos = c.taskMemos || {};
      c.taskMemos.d_register = { value: _daysFromNow(2 + i * 2), createdBy: 'demo-staff-003', ..._stamp };
      if (i % 2 === 0) c.taskMemos.d_maint = { value: ['09:30', '13:00', '15:30'][i % 3], createdBy: 'demo-staff-006', ..._stamp };
    });

    // 小タスクのパターン（variant）×進捗状態（完了/やりかけ/やってない）のバリエーション
    //   再生車：再生中なので 完了・やりかけ・未着手 を散らす（パターンも複数）
    const REGEN_SPREAD = [
      { v: 'default',     s: 'complete' },
      { v: 'regen_quick', s: 'partial' },
      { v: 'regen_full',  s: 'none' },
      { v: 'regen_quick', s: 'complete' },
      { v: 'default',     s: 'partial' },
      { v: 'regen_full',  s: 'partial' },
      { v: 'default',     s: 'none' },
    ];
    const EXHIBIT_SPREAD = [
      { v: 'exh_full',  s: 'partial' },
      { v: 'default',   s: 'none' },
      { v: 'exh_basic', s: 'complete' },
      { v: 'exh_full',  s: 'complete' },
      { v: 'default',   s: 'partial' },
      { v: 'exh_basic', s: 'none' },
      { v: 'exh_full',  s: 'complete' },
    ];
    byCol('regen').forEach((c, j) => {
      const rg = REGEN_SPREAD[j % REGEN_SPREAD.length];
      _applyVariantState(c, 'regenTasks', 't_regen', 'tpl_regen_t_regen', rg.v, rg.s);
      const ex = EXHIBIT_SPREAD[j % EXHIBIT_SPREAD.length];
      _applyVariantState(c, 'regenTasks', 't_exhibit', 'tpl_regen_t_exhibit', ex.v, ex.s);
    });
    // 展示車：再生は完了済みだが、使ったパターンは多様に（complete のまま）
    byCol('exhibit').forEach((c, j) => {
      _applyVariantState(c, 'regenTasks', 't_regen', 'tpl_regen_t_regen', ['default', 'regen_quick', 'regen_full'][j % 3], 'complete');
      _applyVariantState(c, 'regenTasks', 't_exhibit', 'tpl_regen_t_exhibit', ['default', 'exh_basic', 'exh_full'][j % 3], 'complete');
    });
    return list;
  }

  // 日付型の大タスクメモ（t_webup / d_register）から「緑付箋（自動）」を生成
  //   board-notes は note.autoSource.type==='taskMemo' で 🤖自動 と判定し、読み取り専用＋車両詳細リンクになる
  function _makeAutoStickies(carsList) {
    const DATE_TASKS = [
      { taskId: 't_webup',    phase: 'regen',    label: '掲載予定日', taskName: 'webUP' },
      { taskId: 'd_register', phase: 'delivery', label: '登録予定日', taskName: '登録内容設定' },
    ];
    const out = [];
    carsList.forEach((c) => {
      if (!c.taskMemos) return;
      DATE_TASKS.forEach((dt) => {
        const m = c.taskMemos[dt.taskId];
        if (!m || !m.value || !/^\d{4}-\d{2}-\d{2}$/.test(String(m.value))) return;
        const d = new Date(m.value);
        const disp = !isNaN(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}` : m.value;
        out.push({
          id: 'auto_tm_' + c.id + '_' + dt.taskId,
          title: [c.num, c.model].filter(Boolean).join(' '),
          body: [dt.taskName, dt.label, disp].filter(Boolean).join(' '),
          color: 'green',
          deadline: m.value,
          memberUids: [],
          imageURL: '',
          order: 100 + out.length,
          autoSource: { type: 'taskMemo', carId: String(c.id), taskId: dt.taskId, phase: dt.phase },
          createdAt: _today(),
          createdBy: 'demo-user-001',
        });
      });
    });
    return out;
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
    'タスク「webUP」のメモを更新',
    'タスク「登録内容設定」のメモを更新',
    '下取り査定 を選択タスクに追加',
    '登録内容（登録パターン）を設定',
    'バックオフィス処理を完了',
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
    // v2.7-demo: 大タスクメモの種別設定（日付/自由/時刻）
    appTaskMemoConfig: {
      regen: {
        t_webup: { type: 'date', label: '掲載予定日' },
        t_estim: { type: 'freeword', label: '' },
      },
      delivery: {
        d_register: { type: 'date', label: '登録予定日' },
        d_maint:    { type: 'time', label: '入庫予定' },
      },
      backoffice: {},
    },
    // v2.7-demo: 選択制大タスク（選択した車だけに表示）
    appTaskOptional: {
      regen: { c_appraisal: true },
      delivery: {},
      backoffice: {},
    },
    // v2.7-demo: カスタム大タスク（選択制で使う「下取り査定」）
    appCustomTasks: [
      { id: 'c_appraisal', name: '下取り査定', icon: '🚗', phases: ['regen'] },
    ],
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

    // v2.7-demo: 日付メモ由来の「緑付箋（自動）」を投入
    const autoStickies = _makeAutoStickies(cars);
    for (const n of autoStickies) {
      await ref.collection('boardNotes').doc(n.id).set(n);
    }
    console.log(`[demo-seed]   autoStickies: ${autoStickies.length}件`);

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
