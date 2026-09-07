// ========================================
// steps.js — 中タスク（v3.0.0 の土台・2026-09-07）
// ----------------------------------------
// 大タスク（整備）と 小タスク（チェックリストの1項目）のあいだに、
// 「中タスク」という段を1つ足すためのしくみ。
//
//   大タスク  整備
//     ├ 中タスク  点検   ☑
//     ├ 中タスク  見積   ☑
//     └ 中タスク  作業   ☐  ← いまここ
//           └ 小タスク（チェックリストの項目）
//
// 🔴 中タスクの実体は、チェックリスト編集の「中カテゴリ」そのもの。
//    新しい入れ物を作らず、いまある入れ物に「順番」と「直列」の意味を足した。
//    ＝ 追加・改名・並び替え・小タスクの引っ越しは、今までの編集画面がそのまま使える。
//
// 🔴 決めごと
//   ・大タスクごとの切り替え。OFF なら今までとまったく同じ（初期値は OFF）
//   ・中タスクが済む＝その中の小タスクが全部済む。小タスクが0本の中タスクは手で押す
//   ・直列＝前の中タスクが済むまで、次の中タスクは押せない
//   ・その大タスクの進み具合＝「済んだ中タスクの数 ÷ 中タスクの数」
//   ・車に増える持ち物は、小タスクが0本の中タスクを押した印だけ（_step_◯◯）
//     ＝ ふつうの小タスクと同じ場所・同じ保存の道（押した1つだけを送る）に乗る
// ========================================

(function () {
  'use strict';

  function _phaseOf(car) {
    return (car && (car.col === 'delivery' || car.col === 'done')) ? 'delivery' : 'regen';
  }

  function _tplOf(taskId, phase) {
    if (typeof ChecklistTemplates === 'undefined') return null;
    const id = (typeof templateIdForTask === 'function')
      ? templateIdForTask(taskId, phase)
      : ('tpl_' + phase + '_' + taskId);
    return ChecklistTemplates[id] || null;
  }

  // 🔴 この大タスクを「どこまで使うか」＝設定のプルダウンで選ぶ4つ
  //   'task'      … 大タスク（スイッチだけ。中も小も無し）
  //   'step'      … 中タスク（順番に進める中タスクだけ。小タスクは使わない）
  //   'item'      … 小タスク（今までのチェックリスト。中タスクは使わない）
  //   'step_item' … 中→小タスク（中タスクの下に小タスクがぶら下がる）
  // ⚠ 中タスクは「小タスクを持てる」だけで、持たなくてもよい。
  function levelOf(taskId, phase) {
    // まず「大タスクだけ」かどうかは、今までの小タスク制の設定で決まる
    if (typeof hasTaskChecklist === 'function' && !hasTaskChecklist(taskId, phase)) return 'task';
    const t = _tplOf(taskId, phase);
    if (!t) return 'item';
    if (t.taskLevel === 'step' || t.taskLevel === 'step_item' || t.taskLevel === 'item') return t.taskLevel;
    if (t.stepMode) return 'step_item';        // v2.52 の古い印からの読み替え
    return 'item';
  }

  // この大タスクは中タスクを使うか
  function isStepMode(taskId, phase) {
    const lv = levelOf(taskId, phase);
    return lv === 'step' || lv === 'step_item';
  }

  // 中タスクの下に小タスクを持つか
  function usesItems(taskId, phase) {
    return levelOf(taskId, phase) !== 'step';
  }

  function _sectionsOf(car, taskId, phase) {
    let sections = null;
    if (typeof window.getActiveTaskSections === 'function') {
      try { sections = window.getActiveTaskSections(car, taskId); } catch (e) { sections = null; }
    }
    if (!Array.isArray(sections)) {
      const t = _tplOf(taskId, phase);
      sections = (t && Array.isArray(t.sections)) ? t.sections : null;
    }
    return Array.isArray(sections) ? sections : null;
  }

  function _bucketName(phase) {
    return (phase === 'delivery') ? 'deliveryTasks' : 'regenTasks';
  }

  function manualKeyOf(secId) { return '_step_' + secId; }

  // その大タスクの中タスク一覧。中タスクを使っていなければ null。
  //   返すもの：{ index, id, name, icon, items, total, done, pct,
  //              manual（小タスクが0本）, isDone, locked（前がまだ）, blockedBy（前の中タスクの名前） }
  function stepsOf(car, taskId, phase) {
    if (!car || !taskId) return null;
    phase = phase || _phaseOf(car);
    if (!isStepMode(taskId, phase)) return null;
    const secs = _sectionsOf(car, taskId, phase);
    if (!secs || !secs.length) return null;

    const bucket = car[_bucketName(phase)] || {};
    const st = bucket[taskId];
    const map = (st && typeof st === 'object') ? st : {};

    // 「中タスクだけ」の時は、小タスクを持っていても使わない＝全部が手で押す中タスクになる
    const useItems = usesItems(taskId, phase);

    const out = [];
    let prevDone = true;
    let prevName = '';
    secs.forEach((sec, i) => {
      const items = useItems ? (sec.items || []).filter(it => it && !it._disabled) : [];
      let done = 0;
      items.forEach(it => { if (map[it.id]) done++; });
      const manual = (items.length === 0);
      const isDone = manual ? !!map[manualKeyOf(sec.id)] : (items.length > 0 && done >= items.length);
      const name = (sec.title && sec.title.trim())
        || (sec.tab && sec.tab.trim())
        || ('中タスク' + (i + 1));
      out.push({
        index: i,
        id: sec.id,
        name: name,
        icon: sec.icon || '',
        items: items,
        total: items.length,
        done: done,
        manual: manual,
        manualKey: manualKeyOf(sec.id),
        isDone: isDone,
        locked: !prevDone,
        blockedBy: prevDone ? '' : prevName,
        pct: items.length ? Math.round(done / items.length * 100) : (isDone ? 100 : 0),
      });
      if (!isDone && prevDone) prevName = name;
      prevDone = prevDone && isDone;
    });
    return out;
  }

  // その大タスクの進み具合（中タスクの数で数える）。中タスクを使っていなければ null。
  function progOf(car, taskId, phase) {
    const steps = stepsOf(car, taskId, phase);
    if (!steps || !steps.length) return null;
    const d = steps.filter(s => s.isDone).length;
    return { pct: Math.round(d / steps.length * 100), done: d, total: steps.length, steps: steps };
  }

  // いま手をつける中タスク（全部済んでいれば null）
  function currentStep(car, taskId, phase) {
    const steps = stepsOf(car, taskId, phase);
    if (!steps) return null;
    return steps.find(s => !s.isDone) || null;
  }

  // その小タスクが入っている中タスク
  function stepOfItem(car, taskId, phase, itemId) {
    const steps = stepsOf(car, taskId, phase);
    if (!steps) return null;
    return steps.find(s => s.items.some(it => it.id === itemId)) || null;
  }

  // いま押せない小タスクか（前の中タスクが終わっていない）
  function isItemLocked(car, taskId, phase, itemId) {
    const s = stepOfItem(car, taskId, phase, itemId);
    return !!(s && s.locked);
  }

  // 画面に出す「押せない理由」
  function lockReason(step) {
    if (!step || !step.locked) return '';
    return step.blockedBy
      ? `前の「${step.blockedBy}」が終わってから`
      : '前の中タスクが終わってから';
  }

  // カンバンのカードなどに出す「いまどこ」。例＝{ taskName:'整備', stepName:'作業', done:1, total:3 }
  function currentPlace(car) {
    if (!car) return null;
    const phase = _phaseOf(car);
    const tasks = (phase === 'delivery')
      ? ((typeof getActiveDeliveryTasks === 'function') ? getActiveDeliveryTasks(car) : [])
      : ((typeof getActiveRegenTasks === 'function') ? getActiveRegenTasks(car) : []);
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (!t || t.id === 't_complete' || t.id === 'd_complete') continue;
      const p = progOf(car, t.id, phase);
      if (!p) continue;
      if (p.done >= p.total) continue;         // この大タスクは終わっている
      const cur = currentStep(car, t.id, phase);
      if (!cur) continue;
      return {
        taskId: t.id, taskName: t.name || '', taskIcon: t.icon || '',
        stepId: cur.id, stepName: cur.name,
        manual: !!cur.manual,             // 小タスクが0本＝その場で押せる
        stepDone: cur.done, stepTotal: cur.total,
        done: p.done, total: p.total, pct: p.pct,
      };
    }
    return null;
  }

  // 小タスクが0本の中タスクを、手で「済／未」にする
  function toggleManualStep(carId, taskId, secId) {
    const car = (typeof cars !== 'undefined' && Array.isArray(cars)) ? cars.find(c => c && c.id === carId) : null;
    const fromArchive = !car && (typeof archivedCars !== 'undefined' && Array.isArray(archivedCars));
    const target = car || ((typeof archivedCars !== 'undefined' && Array.isArray(archivedCars))
      ? archivedCars.find(c => c && c.id === carId) : null);
    if (!target) return;
    const phase = _phaseOf(target);
    const bucketName = _bucketName(phase);
    if (!target[bucketName] || typeof target[bucketName] !== 'object') target[bucketName] = {};
    if (!target[bucketName][taskId] || typeof target[bucketName][taskId] !== 'object') target[bucketName][taskId] = {};

    const steps = stepsOf(target, taskId, phase) || [];
    const me = steps.find(s => s.id === secId);
    if (!me) return;
    if (me.locked) {
      if (typeof showToast === 'function') showToast(lockReason(me) + '押せます', 'CF-1008');
      return;
    }
    const key = manualKeyOf(secId);
    const next = !target[bucketName][taskId][key];
    if (next) target[bucketName][taskId][key] = true;
    else delete target[bucketName][taskId][key];

    if (typeof addLog === 'function') {
      addLog(carId, `中タスク「${me.name}」を${next ? '完了' : '未完了に戻す'}`);
    }
    // 押した1つだけを送る（車の中身をまるごと送らない）
    if (window.saveCarAnyPaths) {
      window.saveCarAnyPaths(carId, !!fromArchive, [
        { path: [bucketName, taskId, key], value: next ? true : null },
        { path: ['logs'], value: target.logs },
      ]);
    }
    if (typeof renderAll === 'function') renderAll();
    if (typeof window.refreshWorksheetView === 'function') window.refreshWorksheetView();
    if (typeof renderDetailBody === 'function'
        && document.getElementById('modal-detail')
        && document.getElementById('modal-detail').classList.contains('open')) {
      renderDetailBody(target);
    }
    if (typeof showToast === 'function') showToast(next ? '完了にしました' : '未完了に戻しました');
  }

  window.CarStep = {
    levelOf: levelOf,
    usesItems: usesItems,
    isStepMode: isStepMode,
    stepsOf: stepsOf,
    progOf: progOf,
    currentStep: currentStep,
    stepOfItem: stepOfItem,
    isItemLocked: isItemLocked,
    lockReason: lockReason,
    currentPlace: currentPlace,
    manualKeyOf: manualKeyOf,
    phaseOf: _phaseOf,
  };
  window.toggleManualStep = toggleManualStep;

  console.log('[steps] ready（中タスク）');
})();
