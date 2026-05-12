// ========================================
// workflow.js
// 再生・納車タスクのワークフロー画面（全画面詳細）
// ========================================

// ワークフロー画面を開く
function openWorkflow(carId, taskId, isD) {
  const car = cars.find(c => c.id === carId);
  if (!car) return;
  const tasks = (isD ? getActiveDeliveryTasks(car) : getActiveRegenTasks(car));
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  wfState = {carId, taskId, isDelivery:isD};
  document.getElementById('wf-title').textContent = `${task.icon} ${task.name}`;
  const prog = calcProg(car);
  document.getElementById('wf-vehicle').innerHTML = `
    <div class="wf-thumb">${car.photo ? `<img src="${car.photo}">` : carEmoji(car.size)}</div>
    <div style="flex:1">
      <div style="font-size:13px;font-weight:600">${car.maker} ${car.model} <span style="font-size:11px;color:var(--text3)">${car.num}</span></div>
      <div class="wf-pb-track"><div class="wf-pb-fill" id="wf-ob" style="width:${prog.pct}%"></div></div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px">全体進捗 ${prog.pct}%</div>
    </div>`;
  renderWfBody(car, task, isD);
  document.getElementById('wf-page').classList.add('open');
  closeModal('modal-detail');
}

// ワークフロー本体を描画
function renderWfBody(car, task, isD) {
  const state = isD ? car.deliveryTasks : car.regenTasks;
  const taskState = state[task.id] || {};
  const body = document.getElementById('wf-body');
  body.innerHTML = '';
  const p = calcSingleProg(car, task.id, (isD ? getActiveDeliveryTasks(car) : getActiveRegenTasks(car)));
  const pd = document.createElement('div');
  pd.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-radius:9px;padding:13px;margin-bottom:14px';
  pd.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:7px"><span>このタスクの進捗</span><span>${p.done}/${p.total}</span></div><div class="pbar" style="height:7px"><div class="pfill" id="wf-tb" style="width:${p.pct}%"></div></div><div style="font-size:11px;color:var(--text3);margin-top:4px">${p.pct}%</div>`;
  body.appendChild(pd);
  task.sections.forEach(sec => {
    const sl = document.createElement('div');
    sl.className = 'wf-sec-lbl';
    sl.textContent = sec.title;
    body.appendChild(sl);
    sec.items.forEach(item => {
      const isDone = !!taskState[item.id];
      const el = document.createElement('div');
      el.className = 'wf-step';
      el.innerHTML = `
        <div class="wf-step-row" onclick="toggleWfDet('${item.id}')">
          <div class="wf-chk${isDone?' done':''}" id="wfc-${item.id}">${isDone ? '<svg width="11" height="11" viewBox="0 0 14 14" fill="none"><polyline points="2,7 5.5,11 12,3" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</div>
          <div class="wf-step-name${isDone?' done':''}" id="wfn-${item.id}">${item.name}</div>
          <div class="wf-step-sub">${item.sub}</div>
          <span class="wf-chev" id="wfv-${item.id}">›</span>
        </div>
        <div class="wf-det" id="wfd-${item.id}">
          <p>${item.detail}</p>
          <ul>${(item.points||[]).map(pt => `<li><span class="wf-dot"></span>${pt}</li>`).join('')}</ul>
          <button class="wf-cbtn${isDone?' done':''}" id="wfb-${item.id}" onclick="toggleWfStep('${item.id}')">${isDone?'完了済み ✓':'このステップを完了にする'}</button>
        </div>`;
      body.appendChild(el);
    });
  });
  updateWfBtn(car, task, isD);
}

// ワークフローの詳細アコーディオン開閉
function toggleWfDet(id) {
  const det = document.getElementById('wfd-' + id);
  const chv = document.getElementById('wfv-' + id);
  const open = det.classList.contains('open');
  document.querySelectorAll('.wf-det.open').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.wf-chev.open').forEach(d => d.classList.remove('open'));
  if (!open) { det.classList.add('open'); chv.classList.add('open'); }
}

// ワークフロー内のステップ完了切替
function toggleWfStep(itemId) {
  const {carId, taskId, isDelivery} = wfState;
  const car = cars.find(c => c.id === carId);
  if (!car) return;
  const state = isDelivery ? car.deliveryTasks : car.regenTasks;
  if (!state[taskId]) state[taskId] = {};
  state[taskId][itemId] = !state[taskId][itemId];
  if (window.saveCarById) saveCarById(car.id); // v1.5.1.2
  const tasks = (isDelivery ? getActiveDeliveryTasks(car) : getActiveRegenTasks(car));
  const task = tasks.find(t => t.id === taskId);
  const itemName = task.sections.flatMap(s => s.items).find(i => i.id === itemId)?.name || itemId;
  addLog(carId, `[${task.name}]「${itemName}」を${state[taskId][itemId]?'完了':'未完了に戻す'}`);
  const isDone = state[taskId][itemId];
  const chk = document.getElementById('wfc-' + itemId);
  const nm  = document.getElementById('wfn-' + itemId);
  const btn = document.getElementById('wfb-' + itemId);
  if (chk) {
    chk.className = 'wf-chk' + (isDone ? ' done' : '');
    chk.innerHTML = isDone ? '<svg width="11" height="11" viewBox="0 0 14 14" fill="none"><polyline points="2,7 5.5,11 12,3" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
  }
  if (nm) nm.className = 'wf-step-name' + (isDone ? ' done' : '');
  if (btn) {
    btn.className = 'wf-cbtn' + (isDone ? ' done' : '');
    btn.textContent = isDone ? '完了済み ✓' : 'このステップを完了にする';
  }
  const p = calcSingleProg(car, taskId, tasks);
  const tb = document.getElementById('wf-tb');
  if (tb) tb.style.width = p.pct + '%';
  const op = calcProg(car);
  const ob = document.getElementById('wf-ob');
  if (ob) ob.style.width = op.pct + '%';
  updateWfBtn(car, task, isDelivery);
  renderAll();
  showToast(isDone ? '✓ 完了' : '未完了に戻しました');
}

// 完了ボタンの有効/無効更新
function updateWfBtn(car, task, isD) {
  const p = calcSingleProg(car, task.id, (isD ? getActiveDeliveryTasks(car) : getActiveRegenTasks(car)));
  const btn = document.getElementById('wf-done-btn');
  btn.disabled = p.pct < 100;
  btn.textContent = p.pct === 100 ? '✓ 全完了！ボードに戻る' : '全ステップを完了してから戻る';
}

// ワークフロー完了
function finishWorkflow() {
  addLog(wfState.carId, 'ワークフロー完了');
  closeWorkflow();
  showToast('作業を完了しました！');
}

// ワークフロー画面を閉じる
function closeWorkflow() {
  document.getElementById('wf-page').classList.remove('open');
  if (wfState.carId) openDetail(wfState.carId);
}
