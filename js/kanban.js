// ========================================
// kanban.js
// v0.9.1: その他カード右上を「仕入N日」バッジ化、下段帯削除
// ========================================

const COMPACT_THRESHOLD = 4;
let expandedCards = {};

const COL_ORDER = ['other','purchase','regen','exhibit','delivery','done'];
const colIdx = id => COL_ORDER.indexOf(id);

// v1.0.15: 展開中、カード以外の余白クリックで縮小に戻す（一度だけ配線）
document.addEventListener('click', (e) => {
  if (!kanbanForceExpand) return;
  const view = document.getElementById('view-kanban');
  if (!view || !view.classList.contains('active')) return;
  if (!view.contains(e.target)) return;
  // ツールバー内のボタンクリックは除外（自前の処理に任せる）
  if (e.target.closest('#kanban-toolbar')) return;
  // カード本体クリックは除外（詳細を開く / 縮小→展開トグル等）
  if (e.target.closest('.car-card')) return;
  // 余白クリック → 縮小に戻す
  kanbanForceExpand = false;
  renderKanban();
});

function renderKanban() {
  expandedCards = {};
  const wrap = document.getElementById('kanban-wrap');
  wrap.innerHTML = '';
  COLS.forEach(col => {
    let colCars = cars.filter(c => c.col === col.id);
    // v1.0.14: 全列に一斉ソート（done＝納車完了は対象外）
    if (kanbanSort.key && col.id !== 'done') {
      colCars = _sortKanbanCars(colCars, kanbanSort);
    }
    const isCompact = colCars.length >= COMPACT_THRESHOLD && !kanbanForceExpand;
    const div = document.createElement('div');
    div.className = 'k-col' + (col.id === 'other' ? ' k-col-other' : '');
    div.innerHTML = `<div class="k-col-hdr"><div class="k-col-dot" style="background:${col.color}"></div><div class="k-col-title">${col.label}</div><div class="k-col-count">${colCars.length}</div></div><div class="k-cards" id="kc-${col.id}" data-col="${col.id}"></div>`;
    wrap.appendChild(div);
    const cd = div.querySelector('.k-cards');
    colCars.forEach(car => cd.appendChild(makeCarCard(car, isCompact)));

    const spacer = document.createElement('div');
    spacer.className = 'k-col-spacer';
    cd.appendChild(spacer);

    cd.addEventListener('dragover', e => { e.preventDefault(); cd.classList.add('drag-over'); });
    cd.addEventListener('dragleave', () => cd.classList.remove('drag-over'));
    cd.addEventListener('drop', e => {
      e.preventDefault();
      cd.classList.remove('drag-over');
      if (!dragCard || dragCard.col === col.id) return;
      handleKanbanMove(dragCard, col.id);
    });
  });
  _refreshKanbanToolbar();
}

// v1.0.14: カンバン用ソート関数（done は呼ばれない前提）
function _sortKanbanCars(arr, sort) {
  const sign = sort.dir === 'asc' ? 1 : -1;
  const key = sort.key;
  const cmp = (a, b) => {
    let av, bv;
    if (key === 'num') {
      av = (a.num || ''); bv = (b.num || '');
      return av.localeCompare(bv) * sign;
    }
    if (key === 'price') {
      av = Number(a.price) || 0; bv = Number(b.price) || 0;
    } else if (key === 'progress') {
      av = (calcProg(a)?.pct) || 0;
      bv = (calcProg(b)?.pct) || 0;
    } else if (key === 'date') {
      // 売約済みなら売約日数、それ以外は仕入日数
      av = a.contract ? daysSinceContract(a) : daysSince(a.purchaseDate);
      bv = b.contract ? daysSinceContract(b) : daysSince(b.purchaseDate);
    } else {
      return 0;
    }
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return 0;
  };
  return arr.slice().sort(cmp);
}

// v1.0.14: 並び替えキーをトグルセット
function setKanbanSort(key) {
  if (kanbanSort.key === key) {
    kanbanSort.dir = kanbanSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    kanbanSort.key = key;
    kanbanSort.dir = 'desc';
  }
  kanbanForceExpand = false;
  renderKanban();
}

// v1.0.14: 「すべてのカードを開く」トグル
function toggleKanbanExpandAll() {
  kanbanForceExpand = !kanbanForceExpand;
  renderKanban();
}

// v1.0.14: ツールバーのアクティブ状態を反映
function _refreshKanbanToolbar() {
  document.querySelectorAll('#kanban-toolbar .kt-sort-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.querySelectorAll('.kt-arrow').forEach(a => a.remove());
    if (btn.dataset.key === kanbanSort.key) {
      btn.classList.add('active');
      const arrow = document.createElement('span');
      arrow.className = 'kt-arrow';
      arrow.textContent = kanbanSort.dir === 'asc' ? '▲' : '▼';
      btn.appendChild(arrow);
    }
  });
  const btn = document.getElementById('kt-expand-btn');
  if (btn) {
    btn.textContent = kanbanForceExpand ? '▲ 縮小表示に戻す' : '▼ すべてのカードを開く';
    btn.classList.toggle('active', kanbanForceExpand);
  }
}

// v0.9.1: その他カード（右上は仕入Nバッジのみ、下段帯なし）
function _makeOtherCard(car, isCompact) {
  const inv = daysSince(car.purchaseDate);
  const coreMemo = (car.memo || '').trim();
  const workMemo = (car.workMemo || '').trim();

  const memoBlock = `
    <div class="cc-other-memos">
      <div class="cc-other-memo-row">
        <span class="cc-other-memo-icon">📌</span>
        <span class="cc-other-memo-body${coreMemo ? '' : ' empty'}">${coreMemo ? escapeHtml(coreMemo).replace(/\n/g,' ') : '未記入'}</span>
      </div>
      <div class="cc-other-memo-row">
        <span class="cc-other-memo-icon">📝</span>
        <span class="cc-other-memo-body${workMemo ? '' : ' empty'}">${workMemo ? escapeHtml(workMemo).replace(/\n/g,' ') : '未記入'}</span>
      </div>
    </div>`;

  const div = document.createElement('div');
  div.className = 'car-card cc-other' + (isCompact ? ' compact' : '');
  div.draggable = true;
  div.dataset.carId = car.id;
  div.dataset.col = car.col;
  div.innerHTML = `
    <div class="cc-thumb">${car.photo ? `<img src="${car.photo}">` : carEmoji(car.size)}</div>
    <div class="cc-body">
      <div class="cc-info-row">
        <div class="cc-info-left">
          <div class="cc-maker">${car.maker}</div>
          <div class="cc-model">${car.model}${car.grade ? ' ' + car.grade : ''}</div>
        </div>
        <div class="cc-info-right">
          <div class="cc-bigday cc-other-day">仕入<span class="cc-bigday-num">${inv}</span>日</div>
        </div>
      </div>
      ${memoBlock}
    </div>`;
  div.addEventListener('dragstart', () => { dragCard = car; div.classList.add('dragging'); });
  div.addEventListener('dragend', () => { dragCard = null; div.classList.remove('dragging'); });
  div.addEventListener('click', () => {
    if (!isCompact) { openDetail(car.id); return; }
    const colId = car.col;
    const currentExpanded = expandedCards[colId];
    if (currentExpanded === div) {
      openDetail(car.id);
    } else {
      if (currentExpanded) currentExpanded.classList.remove('expanded');
      div.classList.add('expanded');
      expandedCards[colId] = div;
    }
  });
  return div;
}

function makeCarCard(car, isCompact) {
  if (car.col === 'other') return _makeOtherCard(car, isCompact);
  const isD = car.col === 'delivery' || car.col === 'done';
  const tasks = (isD ? getActiveDeliveryTasks(car) : getActiveRegenTasks(car));
  const prog = calcProg(car);
  const inv = daysSince(car.purchaseDate);
  const dots = tasks.map(t => {
    const p = calcSingleProg(car, t.id, tasks);
    const cls = p.pct === 100 ? 'done' : p.pct > 0 ? 'partial' : '';
    return `<div class="cc-dot ${cls}" title="${t.name} ${p.pct}%"></div>`;
  }).join('');

  const contractedDays = daysSinceContract(car);
  let topDayTag;
  if (car.col === 'done' && car.deliveryDate) {
    // v1.0.14: 納車完了は日数→納車日付（M/D 納車）固定表示
    const d = new Date(car.deliveryDate);
    const md = `${d.getMonth() + 1}/${d.getDate()}`;
    topDayTag = `<div class="cc-bigday cc-done-day">${md}<span class="cc-done-suffix">納車</span></div>`;
  } else if (car.isOrder) {
    // v1.8.72: オーダー車両は在庫扱いせず「オーダー車両」固定表示
    topDayTag = `<div class="cc-bigday cc-order-day" title="オーダー車両：在庫日数にカウントしない">📦 オーダー</div>`;
  } else if (car.contract) {
    topDayTag = `<div class="cc-bigday db">売約<span class="cc-bigday-num">${contractedDays}</span>日</div>`;
  } else {
    const wt = invWarnTier(inv);
    const cls = wt ? (wt.days >= 45 ? 'dr' : wt.days >= 30 ? 'dw' : 'dg') : 'dg';
    topDayTag = `<div class="cc-bigday ${cls}"${wt?` style="background:${wt.bg};color:${wt.color}"`:''}>在庫<span class="cc-bigday-num">${inv}</span>日</div>`;
  }

  let bottomBar = '';
  if (car.col === 'purchase' || car.col === 'stock' || car.col === 'regen') {
    bottomBar = `<div class="cc-bottom-bar">仕入れから${inv}日</div>`;
  } else if (car.col === 'delivery') {
    const delDiff = car.deliveryDate ? daysDiff(car.deliveryDate) : null;
    if (delDiff != null) {
      const dt = delWarnTier(delDiff);
      const cls = dt ? (delDiff < 0 ? 'br' : delDiff <= 1 ? 'br' : delDiff <= 3 ? 'bw' : 'bb') : 'bb';
      const label = delDiff === 0 ? '納車本日' : delDiff > 0 ? `納車まで${delDiff}日` : `納車超過${-delDiff}日`;
      bottomBar = `<div class="cc-bottom-bar ${cls}"${dt?` style="background:${dt.bg};color:${dt.color}"`:''}>${label}</div>`;
    } else {
      bottomBar = `<div class="cc-bottom-bar">納車日未設定</div>`;
    }
  }

  const div = document.createElement('div');
  div.className = 'car-card' + (isCompact ? ' compact' : '');
  div.draggable = true;
  div.dataset.carId = car.id;
  div.dataset.col = car.col;
  div.innerHTML = `
    <div class="cc-thumb">${car.photo ? `<img src="${car.photo}">` : carEmoji(car.size)}</div>
    <div class="cc-body">
      <div class="cc-info-row">
        <div class="cc-info-left">
          <div class="cc-maker">${car.maker}</div>
          <div class="cc-model">${car.model}${car.grade ? ' ' + car.grade : ''}</div>
          ${(() => {
            // v1.8.61: 両方ありの時は1行にまとめる（総額ラベル小・本体は括弧内）。
            //   片方のみ → そちらが緑として表示、税ラベルも緑。
            const tlb = (typeof getTaxLabel === 'function') ? getTaxLabel('body')  : '税込';
            const tlt = (typeof getTaxLabel === 'function') ? getTaxLabel('total') : '税込';
            const shortB = (tlb === '税抜') ? '抜' : '込';
            const shortT = (tlt === '税抜') ? '抜' : '込';
            const pt = fmtPriceTwo(car.totalPrice, car.price);
            if (pt.hasTotal && pt.hasBody) {
              return `<div class="cc-price-wrap cc-price-wrap-both"><span class="cc-price-mini-lbl">総額</span><span class="cc-price-total">${pt.totalDisp}</span><span class="cc-price-tax-total">${shortT}</span><span class="cc-price-body-inline"><span class="cc-price-body-amt">${pt.bodyDisp}</span><span class="cc-price-tax-body">${shortB}</span></span></div>`;
            } else if (pt.hasTotal) {
              return `<div class="cc-price-wrap"><span class="cc-price-mini-lbl">総額</span><span class="cc-price-total">${pt.totalDisp}</span><span class="cc-price-tax-total">${shortT}</span></div>`;
            } else if (pt.hasBody) {
              return `<div class="cc-price-wrap"><span class="cc-price-mini-lbl">本体</span><span class="cc-price-total">${pt.bodyDisp}</span><span class="cc-price-tax-total">${shortB}</span></div>`;
            }
            return `<div class="cc-price-wrap"><span class="cc-price cc-price-empty">価格未設定</span></div>`;
          })()}
        </div>
        <div class="cc-info-right">
          ${topDayTag}
          <div class="cc-num-tag">${car.num || ''}</div>
          <div class="cc-tag">${car.size}</div>
          <div class="cc-tag">${fmtYearDisplay(parseYearInput(car.year)||car.year)}</div>
        </div>
      </div>
      <div class="cc-mid">
        <div class="cc-pct-wrap"><span class="cc-pct">${prog.pct}%</span><span class="cc-pct-label">全体進捗</span></div>
        <div class="cc-dots">${dots}</div>
      </div>
    </div>
    ${bottomBar}`;
  div.addEventListener('dragstart', () => { dragCard = car; div.classList.add('dragging'); });
  div.addEventListener('dragend', () => { dragCard = null; div.classList.remove('dragging'); });

  div.addEventListener('click', () => {
    if (!isCompact) { openDetail(car.id); return; }
    const colId = car.col;
    const currentExpanded = expandedCards[colId];
    if (currentExpanded === div) {
      openDetail(car.id);
    } else {
      if (currentExpanded) currentExpanded.classList.remove('expanded');
      div.classList.add('expanded');
      expandedCards[colId] = div;
    }
  });
  return div;
}

function handleKanbanMove(car, targetCol) {
  const fromLabel = COLS.find(c => c.id === car.col)?.label || car.col;
  const toLabel = COLS.find(c => c.id === targetCol)?.label || targetCol;

  if ((car.col === 'other' && (targetCol === 'delivery' || targetCol === 'done')) ||
      ((car.col === 'delivery' || car.col === 'done') && targetCol === 'other')) {
    showToast(`${fromLabel}と${toLabel}の間は移動できません`);
    return;
  }

  if ((car.col === 'purchase' || car.col === 'regen' || car.col === 'exhibit') && targetCol === 'delivery') {
    pendingDragCar = car;
    pendingTargetCol = targetCol;
    const lead = (typeof appSettings !== 'undefined' && appSettings.deliveryLeadDays) || 14;
    document.getElementById('sell-date').value = car.deliveryDate || dateAddDays(todayStr(), lead);
    _renderSellOptionalTaskPickers(car); // v1.8.57
    document.getElementById('confirm-sell').classList.add('open');
    return;
  }

  if ((car.col === 'purchase' || car.col === 'regen' || car.col === 'exhibit') && targetCol === 'done') {
    pendingDragCar = car;
    pendingTargetCol = targetCol;
    const lead = (typeof appSettings !== 'undefined' && appSettings.deliveryLeadDays) || 14;
    document.getElementById('sell-date').value = car.deliveryDate || dateAddDays(todayStr(), lead);
    _renderSellOptionalTaskPickers(car); // v1.8.57
    document.getElementById('confirm-sell').classList.add('open');
    return;
  }

  if (car.col === 'delivery' && targetCol === 'done') {
    pendingDragCar = car;
    pendingTargetCol = targetCol;
    document.getElementById('confirm-deliver').classList.add('open');
    return;
  }

  if ((car.col === 'delivery' || car.col === 'done') &&
      (targetCol === 'purchase' || targetCol === 'regen' || targetCol === 'exhibit')) {
    pendingDragCar = car;
    pendingTargetCol = targetCol;
    const sub = document.getElementById('uncontract-sub');
    if (sub) sub.textContent = `${fromLabel} → ${toLabel} に戻します。売約日・納車予定日・納車準備の進捗もすべてリセットされます。`;
    document.getElementById('confirm-uncontract').classList.add('open');
    return;
  }

  if (car.col === 'done' && targetCol === 'delivery') {
    pendingDragCar = car;
    pendingTargetCol = targetCol;
    document.getElementById('confirm-undeliver').classList.add('open');
    return;
  }

  applyKanbanMove(car, targetCol);
}

function applyKanbanMove(car, targetCol) {
  const fromLabel = COLS.find(c => c.id === car.col)?.label || car.col;
  const toLabel = COLS.find(c => c.id === targetCol)?.label || targetCol;
  if (targetCol === 'delivery' && car.col !== 'delivery') car.workMemo = '';
  car.col = targetCol;
  addLog(car.id, `ステータス変更: ${fromLabel}→${toLabel}`);
  kanbanForceExpand = false; // v1.0.14: 何かを触ったら元のルールに戻る
  if (window.saveCarById) saveCarById(car.id); // v1.5.1.2
  renderAll();
  showToast('ステータスを更新しました');
}

function closeSellConfirm(sell) {
  document.getElementById('confirm-sell').classList.remove('open');
  if (!pendingDragCar) return;
  const car = pendingDragCar;
  const target = pendingTargetCol;
  pendingDragCar = null;
  pendingTargetCol = null;
  if (!sell) {
    showToast('キャンセルしました');
    return;
  }
  car.contract = 1;
  if (!car.contractDate) car.contractDate = todayStr();
  car.deliveryDate = document.getElementById('sell-date').value || '';
  car.workMemo = '';
  // v1.8.57: ポップアップで選択された選択制タスクを保存
  _saveSellOptionalTaskSelection(car);
  const fromLabel = COLS.find(c => c.id === car.col)?.label || car.col;
  const toLabel = COLS.find(c => c.id === target)?.label || target;
  car.col = target;
  // v1.8.71: 納車完了（done）にする時、その時の税設定をスナップショット保存
  // ★デモ版：priceTaxSnapshot 機能は除外（Firestore保存しないため）
  // if (target === 'done' && typeof snapshotPriceTax === 'function' && !car.priceTaxSnapshot) {
  //   car.priceTaxSnapshot = snapshotPriceTax();
  // }
  if (window.saveCarById) saveCarById(car.id); // v1.5.1.2
  if (target === 'done') {
    addLog(car.id, `売約＆納車完了：${fromLabel}→${toLabel}（特例）`);
    renderAll();
    celebrateDelivery(car);
  } else {
    addLog(car.id, `売約設定：${fromLabel}→${toLabel}`);
    renderAll();
    showToast('売約にしました!');
  }
}

function closeDeliverConfirm(deliver) {
  document.getElementById('confirm-deliver').classList.remove('open');
  if (!pendingDragCar) return;
  const car = pendingDragCar;
  const target = pendingTargetCol;
  pendingDragCar = null;
  pendingTargetCol = null;
  if (!deliver) {
    showToast('キャンセルしました');
    return;
  }
  car.col = target;
  // v1.8.71: 納車完了 → 税設定スナップショット保存
  // ★デモ版：priceTaxSnapshot 機能は除外（Firestore保存しないため）
  // if (target === 'done' && typeof snapshotPriceTax === 'function' && !car.priceTaxSnapshot) {
  //   car.priceTaxSnapshot = snapshotPriceTax();
  // }
  if (window.saveCarById) saveCarById(car.id); // v1.5.1.2
  addLog(car.id, '納車完了：納車準備→納車完了');
  renderAll();
  celebrateDelivery(car);
}

function closeUncontractConfirm(uncontract) {
  document.getElementById('confirm-uncontract').classList.remove('open');
  if (!pendingDragCar) return;
  const car = pendingDragCar;
  const target = pendingTargetCol;
  pendingDragCar = null;
  pendingTargetCol = null;
  if (!uncontract) {
    showToast('キャンセルしました');
    return;
  }
  car.contract = 0;
  car.contractDate = '';
  car.deliveryDate = '';
  car.workMemo = '';
  if (typeof DELIVERY_TASKS !== 'undefined' && typeof mkTaskState === 'function') {
    car.deliveryTasks = mkTaskState(DELIVERY_TASKS);
  }
  const fromLabel = COLS.find(c => c.id === car.col)?.label || car.col;
  const toLabel = COLS.find(c => c.id === target)?.label || target;
  car.col = target;
  if (window.saveCarById) saveCarById(car.id); // v1.5.1.2
  addLog(car.id, `売約キャンセル：${fromLabel}→${toLabel}（売約・納車準備データをリセット）`);
  renderAll();
  showToast('売約をキャンセルしました');
}

function closeUndeliverConfirm(undeliver) {
  document.getElementById('confirm-undeliver').classList.remove('open');
  if (!pendingDragCar) return;
  const car = pendingDragCar;
  const target = pendingTargetCol;
  pendingDragCar = null;
  pendingTargetCol = null;
  if (!undeliver) {
    showToast('キャンセルしました');
    return;
  }
  car.col = target;
  if (window.saveCarById) saveCarById(car.id); // v1.5.1.2
  addLog(car.id, '納車完了を取り消し：納車完了→納車準備');
  renderAll();
  showToast('納車完了を取り消しました');
}

function celebrateDelivery(car) {
  const overlay = document.getElementById('celebrate-overlay');
  if (!overlay) return;
  const conf = document.getElementById('celebrate-confetti');
  const carEl = document.getElementById('celebrate-car');
  if (carEl) carEl.textContent = `${car.maker} ${car.model}(${car.num})`;
  if (conf) conf.innerHTML = '';
  const colors = ['#fcd34d','#fb923c','#f87171','#60a5fa','#34d399','#a78bfa','#f472b6','#facc15'];
  const count = 120;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const left = Math.random() * 100;
    const drift = (Math.random() - 0.5) * 300;
    const spin = (Math.random() * 1080 + 360) * (Math.random() < 0.5 ? -1 : 1);
    const dur = 2.4 + Math.random() * 1.6;
    const delay = Math.random() * 0.4;
    const w = 6 + Math.random() * 8;
    const h = 8 + Math.random() * 12;
    piece.style.left = left + '%';
    piece.style.width = w + 'px';
    piece.style.height = h + 'px';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.borderRadius = Math.random() < 0.3 ? '50%' : '2px';
    piece.style.setProperty('--drift', drift + 'px');
    piece.style.setProperty('--spin', spin + 'deg');
    piece.style.animationDuration = dur + 's';
    piece.style.animationDelay = delay + 's';
    if (conf) conf.appendChild(piece);
  }
  overlay.classList.remove('fade-out');
  overlay.classList.add('show');
  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => {
      overlay.classList.remove('show', 'fade-out');
      if (conf) conf.innerHTML = '';
    }, 500);
  }, 3000);
}

// ====================================================================
// v1.8.57: 売約確認ポップアップ内の「選択制タスク」チェックUI
// ====================================================================
//   納車準備フェーズの選択制タスクを取得して、車両既存の selectedTasks 状態を
//   反映したチェックボックスを描画。なければセクション自体を非表示。
function _renderSellOptionalTaskPickers(car) {
  const head = document.getElementById('sell-optional-tasks-head');
  const body = document.getElementById('sell-optional-tasks-body');
  if (!head || !body) return;
  const tasks = (typeof getAllTasksForUI === 'function') ? getAllTasksForUI('delivery') : [];
  const optTasks = tasks.filter(t => t.enabled && t.optional);
  if (optTasks.length === 0) {
    head.style.display = 'none';
    body.style.display = 'none';
    body.innerHTML = '';
    return;
  }
  const sel = (car && car.selectedTasks && car.selectedTasks.delivery) || {};
  let html = '';
  optTasks.forEach(t => {
    const checked = sel[t.id] === true;
    html += `
      <label style="display:flex;align-items:center;gap:8px;padding:5px 4px;cursor:pointer;font-size:13px;border-bottom:1px dashed var(--border)">
        <input type="checkbox" data-task-id="${(t.id || '').replace(/"/g,'&quot;')}" ${checked ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer">
        <span style="font-size:14px">${t.icon || '📋'}</span>
        <span>${(t.name || '').replace(/</g,'&lt;')}</span>
      </label>`;
  });
  head.style.display = '';
  body.style.display = '';
  body.innerHTML = html + '<div style="font-size:11px;color:var(--text3);margin-top:4px">※ あとからカード詳細→「✏️ 車両情報を編集」でも変更できます</div>';
}

function _saveSellOptionalTaskSelection(car) {
  if (!car) return;
  const body = document.getElementById('sell-optional-tasks-body');
  if (!body) return;
  if (!car.selectedTasks) car.selectedTasks = { regen: {}, delivery: {} };
  if (!car.selectedTasks.delivery) car.selectedTasks.delivery = {};
  // delivery 側だけリセットして上書き
  car.selectedTasks.delivery = {};
  const checks = body.querySelectorAll('input[type=checkbox][data-task-id]');
  checks.forEach(chk => {
    const tid = chk.getAttribute('data-task-id');
    if (!tid) return;
    if (chk.checked) car.selectedTasks.delivery[tid] = true;
  });
}
