// ========================================
// progress.js
// 進捗計算ロジック
// 各車両のタスク進捗率を計算する関数
// ========================================

// v1.0.20: t_equip だけ装備品チェック専用ページに移行
// 完了判定は car.equipment._completed（明示宣言）を見る
function _isEquipmentCompleted(car) {
  return !!(car && car.equipment && car.equipment._completed);
}

// v1.0.24: t_equip は常に入力比例で進捗％を返す（_completed フラグは UI の✓表示にのみ利用）
// 全項目数 / 入力済み項目数 で計算。EQUIPMENT_CATEGORIES が無い時は 0/1 を返す。
function _calcEquipProgUnified(car) {
  if (typeof calcEquipmentProgress === 'function') {
    const p = calcEquipmentProgress(car);
    return { pct: p.pct, done: p.filled, total: p.total || 1 };
  }
  return { pct: 0, done: 0, total: 1 };
}

// タスクが「完了」かどうかの判定（全体進捗用、二値）
// v1.0.27: t_equip は _completed フラグを見る。それ以外は pct === 100。
// v1.0.41: d_complete は自動判定（他の有効タスク全完了で ON）
function _isTaskComplete(car, task, tasks) {
  // v1.7.17: t_equip は通常の workflow タスクと同じく ChecklistTemplate (tpl_equipment) 経由で
  //          完了判定。旧来の car.equipment._completed フラグは廃止予定。
  if (task.id === 'd_complete' && typeof isDeliveryAllOtherTasksDone === 'function') {
    return isDeliveryAllOtherTasksDone(car);
  }
  // v1.7.17: 再生側の自動完了タスク
  if (task.id === 't_complete' && typeof isRegenAllOtherTasksDone === 'function') {
    return isRegenAllOtherTasksDone(car);
  }
  const p = calcSingleProg(car, task.id, tasks);
  return p.pct >= 100;
}

// 車両全体の進捗を計算
// v1.0.27: シンプルB方式 — タスク単位の二値判定（中身の小タスク進捗は無関係）
// v1.8.12: 大タスクごとのウエイト（％）対応。設定→タスク・進捗 の重み欄から調整可能。
//   appTaskWeight[phase][taskId] = % で指定（合計100想定）。
//   未設定 / 重みゼロのみのフェーズは均等割り（後方互換）。
//   t_complete / d_complete（自動判定タスク）は分母から除外。
// v1.8.25: 二値判定→「部分反映」に変更。workflow / checklist 系の途中経過も
//   カード上の％に反映されるように（装備品チェック・再生など長いタスクで途中まで進めたとき）。
//   トグル系は引き続き 0/100 の二値（変化なし）。
function calcProg(car) {
  const isD = car.col === 'delivery' || car.col === 'done';
  // v1.0.32: 有効なタスクだけで全体進捗を計算（無効化タスクはカウントしない）
  // v1.8.51: car を渡して「選択制かつ未opt-in」のタスクも除外（Phase B）
  //          進捗ウエイト(appTaskWeight)は廃止。全タスク均等割りで partial credit を加味。
  const tasks = isD ? getActiveDeliveryTasks(car) : getActiveRegenTasks(car);
  // 自動判定タスクは分母から除外
  const targets = tasks.filter(t => t.id !== 't_complete' && t.id !== 'd_complete');

  let totalCount = 0, doneCount = 0;        // 表示用：タスク全完了数（整数）
  let totalUnits = 0, doneUnits = 0;        // pct 計算用：partial credit
  targets.forEach(t => {
    totalUnits += 1;
    const sp = calcSingleProg(car, t.id, tasks);
    const ratio = Math.max(0, Math.min(100, sp.pct || 0)) / 100;
    doneUnits += ratio;
    totalCount += 1;
    if (ratio >= 1) doneCount += 1;
  });
  return {
    pct: totalUnits ? Math.round(doneUnits / totalUnits * 100) : 0,
    done: doneCount,
    total: totalCount,
  };
}

// 単一タスクの進捗を計算
function calcSingleProg(car, taskId, tasks) {
  const isD = car.col === 'delivery' || car.col === 'done';
  const state = isD ? car.deliveryTasks : car.regenTasks;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return {pct:0, done:0, total:0};
  // v1.7.17: t_equip も通常の workflow と同じく ChecklistTemplate 経由で計算（特殊扱い撤去）
  // v1.0.41: d_complete は自動判定（他タスク全完了で 100%）
  if (taskId === 'd_complete' && typeof isDeliveryAllOtherTasksDone === 'function') {
    const ok = isDeliveryAllOtherTasksDone(car);
    return { pct: ok ? 100 : 0, done: ok ? 1 : 0, total: 1 };
  }
  // v1.7.17: t_complete も同じく自動判定
  if (taskId === 't_complete' && typeof isRegenAllOtherTasksDone === 'function') {
    const ok = isRegenAllOtherTasksDone(car);
    return { pct: ok ? 100 : 0, done: ok ? 1 : 0, total: 1 };
  }
  if (task.type === 'toggle') {
    // v1.7.11: 「📝 詳細」スイッチ ON のトグルタスク（mode='checklist'）は
    // ChecklistTemplate の項目チェック数で進捗を計算する。
    // 詳細 OFF のままなら従来通り ON/OFF の二値で 0% or 100%。
    const phase = isD ? 'delivery' : 'regen';
    if (typeof hasTaskChecklist === 'function' && hasTaskChecklist(taskId, phase)) {
      const cp = _calcChecklistProg(car, taskId, phase);
      if (cp) return cp;
    }
    return {pct: state[taskId] ? 100 : 0, done: state[taskId] ? 1 : 0, total:1};
  }
  // v1.8.25: workflow タスクも ChecklistTemplate ベースを優先（t_equip 等）
  // 旧来の task.sections は item 数が定義時点の static で、実際の運用は
  // tpl_equipment / tpl_regen_xxx テンプレの sections.items で動いている。
  // テンプレが見つかれば tplベース、なければ task.sections フォールバック。
  const phaseW = isD ? 'delivery' : 'regen';
  const cpW = _calcChecklistProg(car, taskId, phaseW);
  if (cpW && cpW.total > 0) return cpW;

  // フォールバック：task.sections ベース（テンプレ未生成時）
  let total = 0, done = 0;
  task.sections.forEach(s => s.items.forEach(i => {
    total++;
    if (state[taskId] && state[taskId][i.id]) done++;
  }));
  return {pct: total ? Math.round(done/total*100) : 0, done, total};
}

// v1.7.11: ChecklistTemplate ベースの進捗計算（mode='checklist' のトグル用）
// テンプレが未生成・未読み込みなら null を返し、呼び出し側で従来ロジックにフォールバック。
// _disabled が立っている項目はカウント対象外。
// v1.7.38: 車に「タスクパターン（variant）」が選択されていれば、そのパターンの sections で計算する。
//          パターン未選択 → 0/0 を返す（進捗0%扱い）。
function _calcChecklistProg(car, taskId, phase) {
  if (typeof ChecklistTemplates === 'undefined') return null;
  const tplId = (typeof templateIdForTask === 'function')
    ? templateIdForTask(taskId, phase)
    : `tpl_${phase}_${taskId}`;
  const tpl = ChecklistTemplates[tplId];
  if (!tpl) return null;
  // v1.7.38: 車のパターン選択を反映
  let sections = null;
  if (typeof window.getActiveTaskSections === 'function') {
    sections = window.getActiveTaskSections(car, taskId);
  }
  if (!Array.isArray(sections)) {
    if (Array.isArray(tpl.sections)) sections = tpl.sections;
    else return null;
  }
  const isDelivery = phase === 'delivery';
  const state = isDelivery ? (car.deliveryTasks || {}) : (car.regenTasks || {});
  const taskState = state[taskId];
  // 旧 toggle 状態（boolean）が残っている場合は object 化して扱う（参照のみ）
  const checkMap = (taskState && typeof taskState === 'object') ? taskState : {};
  let total = 0, done = 0;
  sections.forEach(sec => {
    (sec.items || []).forEach(item => {
      if (item._disabled) return;
      total++;
      if (checkMap[item.id]) done++;
    });
  });
  return { pct: total ? Math.round(done / total * 100) : 0, done, total };
}
