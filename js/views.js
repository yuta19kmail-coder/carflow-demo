// ========================================
// views.js
// 展示／進捗／全体一覧／在庫日数／エクスポート
// v0.9.5: 進捗ビュー：補足sub削除、「販売前」短縮、スマホ用グループ切替タブ
// ========================================

// ========================================
// 展示ビュー
// ========================================
function setExhibitSort(key) {
  if (exhibitSort.key === key) {
    exhibitSort.dir = exhibitSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    exhibitSort.key = key;
    exhibitSort.dir = 'desc';
  }
  // v1.0.18: アクティブなビューを再描画（展示／商談どちらでも動くように）
  const dealView = document.getElementById('view-deal');
  if (dealView && dealView.classList.contains('active')) {
    if (typeof renderDeal === 'function') renderDeal();
  } else {
    renderExhibit();
  }
}

function _exhibitSorter() {
  const {key, dir} = exhibitSort;
  const sign = dir === 'asc' ? 1 : -1;
  return (a, b) => {
    let av, bv;
    if (key === 'price') {
      av = Number(a.price) || 0;
      bv = Number(b.price) || 0;
    } else if (key === 'invDays') {
      av = daysSince(a.purchaseDate);
      bv = daysSince(b.purchaseDate);
    } else if (key === 'year') {
      av = parseYearInput(a.year) || 0;
      bv = parseYearInput(b.year) || 0;
    } else {
      return 0;
    }
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return 0;
  };
}

function _makeExhibitCard(car) {
  const inv = daysSince(car.purchaseDate);
  const wt = invWarnTier(inv);
  const invCls = wt ? (wt.days >= 45 ? 'dr' : wt.days >= 30 ? 'dw' : 'dg') : 'dg';
  const km = Number(car.km || 0).toLocaleString();
  const yr = fmtYearDisplay(parseYearInput(car.year) || car.year);
  const card = document.createElement('div');
  card.className = 'ex-card';
  card.innerHTML = `
    <div class="ex-card-thumb">${car.photo ? `<img src="${car.photo}">` : carEmoji(car.size)}</div>
    <div class="ex-card-body">
      <div class="ex-card-title">${car.maker} ${car.model}</div>
      <div class="ex-card-meta">
        <span class="ex-card-meta-item ex-card-color" title="${(car.color || '').replace(/"/g,'&quot;')}">${car.color || '—'}</span>
        <span class="ex-card-meta-item">${yr}</span>
      </div>
      <div class="ex-card-meta ex-card-meta-km-row">
        <span class="ex-card-meta-item ex-card-km">${km}km</span>
      </div>
      <div class="ex-card-bottom">
        ${(() => {
          // v1.8.68: 展示ビューはシンプルに1金額のみ（緑字）。
          //   設定 priceTax.exhibitSource で「総額」or「本体価格」を選択。
          //   選んだ側が未入力なら、もう一方にフォールバック。
          const ps  = (typeof appSettings !== 'undefined' && appSettings.priceTax) || {};
          const pref = (ps.exhibitSource === 'body') ? 'body' : 'total';
          const pt = fmtPriceTwo(car.totalPrice, car.price);
          let amount = '';
          if (pref === 'total') {
            amount = pt.hasTotal ? pt.totalDisp : (pt.hasBody ? pt.bodyDisp : '');
          } else {
            amount = pt.hasBody ? pt.bodyDisp : (pt.hasTotal ? pt.totalDisp : '');
          }
          return amount
            ? `<span class="ex-card-price">${amount}</span>`
            : `<span class="ex-card-price ex-card-price-empty">価格未設定</span>`;
        })()}
        <span class="ex-card-inv ${invCls}">${inv}日</span>
      </div>
    </div>`;
  card.onclick = () => openDetail(car.id);
  return card;
}

function _makeExhibitColumn(opts) {
  const col = document.createElement('div');
  col.className = 'ex-col' + (opts.isStock ? ' stock' : '');
  const pctHtml = opts.isStock ? '' : `<span class="ex-col-pct">${opts.pct.toFixed(1)}%</span>`;
  col.innerHTML = `
    <div class="ex-col-hdr">
      <div class="ex-col-name"><span class="ex-col-icon">${opts.icon}</span>${opts.name}</div>
      <div class="ex-col-stats">
        <span class="ex-col-count">${opts.count}</span>
        <span class="ex-col-count-unit">台</span>
        ${pctHtml}
      </div>
    </div>
    <div class="ex-col-body"></div>`;
  const body = col.querySelector('.ex-col-body');
  if (opts.cars.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ex-col-empty';
    empty.textContent = opts.isStock ? '対象の車両はありません' : 'この区分の在庫はありません';
    body.appendChild(empty);
  } else {
    opts.cars.forEach(c => body.appendChild(_makeExhibitCard(c)));
  }
  return col;
}

function _refreshExhibitSortBtns() {
  // v1.0.18: 展示ビューと商談ビューの両方のソートボタンを更新
  document.querySelectorAll('#view-exhibit .ex-sort-btn, #view-deal .ex-sort-btn').forEach(btn => {
    const k = btn.dataset.key;
    btn.classList.remove('active');
    const ar = btn.querySelector('.sort-arrow');
    if (ar) ar.remove();
    if (k === exhibitSort.key) {
      btn.classList.add('active');
      const arrow = document.createElement('span');
      arrow.className = 'sort-arrow';
      arrow.textContent = exhibitSort.dir === 'asc' ? '▲' : '▼';
      btn.appendChild(arrow);
    }
  });
}

function renderExhibit() {
  const cols = document.getElementById('ex-cols');
  if (!cols) return;
  cols.innerHTML = '';

  const otherCars = cars.filter(c => c.col === 'other');
  // v1.8.72: オーダー車両はストック・展示中 列に出さず、別の専用列にまとめる
  const stockCars = cars.filter(c => (c.col === 'purchase' || c.col === 'regen') && !c.isOrder);
  const exhibitCars = cars.filter(c => c.col === 'exhibit' && !c.isOrder);
  const orderCars = cars.filter(c => c.isOrder && c.col !== 'done');

  const sorter = _exhibitSorter();
  otherCars.sort(sorter);
  stockCars.sort(sorter);
  orderCars.sort(sorter);
  const exhibitTotal = exhibitCars.length;

  const otherCol = _makeExhibitColumn({
    key: 'other', name: 'その他', icon: '📝',
    isStock: true, count: otherCars.length, pct: 0, cars: otherCars,
  });
  otherCol.classList.add('other');
  cols.appendChild(otherCol);

  const stockCol = _makeExhibitColumn({
    key: 'stock', name: 'ストック車両', icon: '📦',
    isStock: true, count: stockCars.length, pct: 0, cars: stockCars,
  });
  cols.appendChild(stockCol);

  SIZES.forEach(size => {
    const sized = exhibitCars.filter(c => c.size === size).sort(sorter);
    const pct = exhibitTotal > 0 ? (sized.length / exhibitTotal * 100) : 0;
    const col = _makeExhibitColumn({
      key: size, name: size, icon: carEmoji(size),
      isStock: false, count: sized.length, pct, cars: sized,
    });
    cols.appendChild(col);
  });

  // v1.8.72: オーダー車両の専用列（一番右）
  if (orderCars.length > 0) {
    const orderCol = _makeExhibitColumn({
      key: 'order', name: 'オーダー車両', icon: '📦',
      isStock: true, count: orderCars.length, pct: 0, cars: orderCars,
    });
    orderCol.classList.add('order');
    cols.appendChild(orderCol);
  }

  const totalLabel = document.getElementById('ex-total-label');
  if (totalLabel) {
    totalLabel.textContent = `その他 ${otherCars.length}台 / ストック ${stockCars.length}台 / 展示中 ${exhibitTotal}台${orderCars.length?' / オーダー '+orderCars.length+'台':''}`;
  }
  _refreshExhibitSortBtns();
}

// ========================================
// ガントチャートビュー（v0.8.9 で削除）
// ========================================
function renderGantt() { /* removed in v0.8.9 */ }

// ========================================
// 商談ビュー（v1.0.16）
// 顧客と話す時の「アテ」ビジュアル。キオスク的UI
// ========================================
function _makeDealCard(car) {
  const km = Number(car.km || 0).toLocaleString();
  const yr = fmtYearDisplay(parseYearInput(car.year) || car.year);
  const card = document.createElement('div');
  card.className = 'deal-card';
  card.innerHTML = `
    <div class="deal-card-thumb">${car.photo ? `<img src="${car.photo}">` : carEmoji(car.size)}</div>
    <div class="deal-card-body">
      <div class="deal-card-title">${car.maker} ${car.model}</div>
      <div class="deal-card-stats">
        <div class="deal-stat">
          <div class="deal-stat-num">${yr}</div>
          <div class="deal-stat-lbl">年式</div>
        </div>
        <div class="deal-stat">
          <div class="deal-stat-num">${km}<span class="deal-stat-unit">km</span></div>
          <div class="deal-stat-lbl">走行距離</div>
        </div>
      </div>
      ${(() => {
        // v1.8.63: 商談ビューもW金額表示
        const tlb = (typeof getTaxLabel === 'function') ? getTaxLabel('body')  : '税込';
        const tlt = (typeof getTaxLabel === 'function') ? getTaxLabel('total') : '税込';
        const shortB = (tlb === '税抜') ? '抜' : '込';
        const shortT = (tlt === '税抜') ? '抜' : '込';
        const pt = fmtPriceTwo(car.totalPrice, car.price);
        if (pt.hasTotal && pt.hasBody) {
          return `<div class="deal-card-price">総額 ${pt.totalDisp} <span class="deal-card-tax">${shortT}</span><div class="deal-card-price-sub">本体 ${pt.bodyDisp} <span class="deal-card-tax-sub">${shortB}</span></div></div>`;
        } else if (pt.hasTotal) {
          return `<div class="deal-card-price">総額 ${pt.totalDisp} <span class="deal-card-tax">${shortT}</span></div>`;
        } else if (pt.hasBody) {
          return `<div class="deal-card-price">本体 ${pt.bodyDisp} <span class="deal-card-tax">${shortB}</span></div>`;
        }
        return `<div class="deal-card-price">価格未設定</div>`;
      })()}
    </div>`;
  card.onclick = () => openDealPopup(car);
  return card;
}

function _makeDealColumn(opts) {
  const col = document.createElement('div');
  col.className = 'deal-col' + (opts.isStock ? ' stock' : '');
  col.innerHTML = `
    <div class="deal-col-hdr">
      <div class="deal-col-name"><span class="deal-col-icon">${opts.icon}</span>${opts.name}</div>
    </div>
    <div class="deal-col-body"></div>`;
  const body = col.querySelector('.deal-col-body');
  opts.cars.forEach(c => body.appendChild(_makeDealCard(c)));
  return col;
}

function renderDeal() {
  const cols = document.getElementById('deal-cols');
  if (!cols) return;
  cols.innerHTML = '';

  // ストック車両（仕入れ・再生中）→ 「展示前」と表記
  // v1.8.72: オーダー車両は商談ビューから除外（既にお客がついてるため）
  const stockCars = cars.filter(c => (c.col === 'purchase' || c.col === 'regen') && !c.isOrder);
  const exhibitCars = cars.filter(c => c.col === 'exhibit' && !c.isOrder);

  const sorter = _exhibitSorter();
  stockCars.sort(sorter);

  // ストック（展示前）：0台でも非表示にしない方が運用上わかりやすいか？
  // 仕様：「商談ビューに限っては在庫が0の枠は非表示」 → 0台なら非表示
  if (stockCars.length > 0) {
    const stockCol = _makeDealColumn({
      key: 'stock', name: '展示前', icon: '📦',
      isStock: true, cars: stockCars,
    });
    cols.appendChild(stockCol);
  }

  SIZES.forEach(size => {
    const sized = exhibitCars.filter(c => c.size === size).sort(sorter);
    if (sized.length === 0) return; // 0台枠は非表示
    const col = _makeDealColumn({
      key: size, name: size, icon: carEmoji(size),
      isStock: false, cars: sized,
    });
    cols.appendChild(col);
  });

  _refreshExhibitSortBtns();
}

// 商談用ポップアップ（カードクリック）
// v1.0.20: 装備詳細を見る ボタンを追加。data-eq-mode で .deal-main / .deal-eq-panel を切替
function openDealPopup(car) {
  const body = document.getElementById('deal-popup-body');
  if (!body) return;
  const km = Number(car.km || 0).toLocaleString();
  const yr = fmtYearDisplay(parseYearInput(car.year) || car.year);
  // 装備詳細ボタンの表示文言（v1.0.20）
  let eqBtnHtml = '';
  if (typeof calcEquipmentProgress === 'function') {
    const p = calcEquipmentProgress(car);
    if (p.filled > 0) {
      eqBtnHtml = `<button class="deal-eq-trigger" onclick="dealShowEquipment('${car.id}')">📋 装備詳細を見る（${p.filled}/${p.total}）</button>`;
    }
  }
  body.setAttribute('data-eq-mode', '0');
  body.innerHTML = `
    <div class="deal-main">
      <div class="deal-popup-photo">${car.photo ? `<img src="${car.photo}">` : `<div class="deal-popup-emoji">${carEmoji(car.size)}</div>`}</div>
      <div class="deal-popup-info">
        <div class="deal-popup-title">${car.maker} ${car.model}</div>
        <div class="deal-popup-stats">
          <div class="deal-popup-stat"><div class="deal-popup-stat-lbl">年式</div><div class="deal-popup-stat-val">${yr}</div></div>
          <div class="deal-popup-stat"><div class="deal-popup-stat-lbl">走行距離</div><div class="deal-popup-stat-val">${km}<span class="deal-popup-stat-unit">km</span></div></div>
          <div class="deal-popup-stat"><div class="deal-popup-stat-lbl">ボディ</div><div class="deal-popup-stat-val">${car.size || '—'}</div></div>
          <div class="deal-popup-stat"><div class="deal-popup-stat-lbl">色</div><div class="deal-popup-stat-val">${car.color || '—'}</div></div>
        </div>
        ${(() => {
          // v1.8.63: 商談ポップアップもW金額表示
          const tlb = (typeof getTaxLabel === 'function') ? getTaxLabel('body')  : '税込';
          const tlt = (typeof getTaxLabel === 'function') ? getTaxLabel('total') : '税込';
          const shortB = (tlb === '税抜') ? '抜' : '込';
          const shortT = (tlt === '税抜') ? '抜' : '込';
          const pt = fmtPriceTwo(car.totalPrice, car.price);
          if (pt.hasTotal && pt.hasBody) {
            return `<div class="deal-popup-price">総額 ${pt.totalDisp} <span class="deal-card-tax">${shortT}</span><div class="deal-popup-price-sub">本体 ${pt.bodyDisp} <span class="deal-card-tax-sub">${shortB}</span></div></div>`;
          } else if (pt.hasTotal) {
            return `<div class="deal-popup-price">総額 ${pt.totalDisp} <span class="deal-card-tax">${shortT}</span></div>`;
          } else if (pt.hasBody) {
            return `<div class="deal-popup-price">本体 ${pt.bodyDisp} <span class="deal-card-tax">${shortB}</span></div>`;
          }
          return `<div class="deal-popup-price">価格未設定</div>`;
        })()}
        ${eqBtnHtml}
      </div>
    </div>
    <div class="deal-eq-panel"></div>`;
  document.getElementById('modal-deal').classList.add('open');
}

// 商談モード入退出
function enterDealMode() {
  document.body.classList.add('deal-mode');
}
function askExitDealMode() {
  document.getElementById('confirm-exit-deal').classList.add('open');
}
function confirmExitDealMode() {
  document.getElementById('confirm-exit-deal').classList.remove('open');
  document.body.classList.remove('deal-mode');
  // タスク管理タブに戻す
  const kanbanTab = document.querySelector('.tab[onclick*="kanban"]');
  if (kanbanTab) {
    if (typeof switchTab === 'function') switchTab('kanban', kanbanTab);
  }
}

// ========================================
// 進捗ビュー（v0.9.0で3枠化、v0.9.5で補足sub削除＋スマホ用タブ追加）
// ========================================
function _makeProgressCardOther(car, compact) {
  const inv = daysSince(car.purchaseDate);
  const colLabel = COLS.find(c => c.id === car.col)?.label || car.col;
  const coreMemo = (car.memo || '').trim();
  const workMemo = (car.workMemo || '').trim();
  const card = document.createElement('div');
  card.className = 'pv-card pv-card-other' + (compact ? ' is-compact' : '');
  card.dataset.carId = car.id;
  const bodyHtml = compact ? '' : `
    <div class="pv-body">
      <div class="pv-other-memo">
        <div class="pv-other-memo-label">📌 メモ</div>
        <div class="pv-other-memo-text">${coreMemo ? escapeHtml(coreMemo).replace(/\n/g,'<br>') : '<span class="cc-other-empty">未記入</span>'}</div>
      </div>
      <div class="pv-other-memo">
        <div class="pv-other-memo-label">📝 作業メモ</div>
        <div class="pv-other-memo-text">${workMemo ? escapeHtml(workMemo).replace(/\n/g,'<br>') : '<span class="cc-other-empty">未記入</span>'}</div>
      </div>
      <div style="margin-top:9px;font-size:11px;color:var(--text3)">仕入れから ${inv} 日経過</div>
    </div>`;
  card.innerHTML = `
    <div class="pv-drag" title="ドラッグして並び替え">⋮⋮</div>
    <div class="pv-head">
      <div class="pv-thumb">${car.photo?`<img src="${car.photo}">`:carEmoji(car.size)}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${car.maker} ${car.model}</div>
        <div style="font-size:11px;color:var(--text2)">${car.num}</div>
      </div>
      <span class="pill ${pillMap[car.col]||'pill-gray'}">${colLabel}</span>
    </div>${bodyHtml}
    <div class="pv-btn" onclick="openDetail('${car.id}')">▶ カードを開く</div>`;
  return card;
}

function _makeProgressCard(car, compact) {
  if (car.col === 'other') return _makeProgressCardOther(car, compact);
  const isD = car.col === 'delivery';
  const tasks = (isD ? getActiveDeliveryTasks(car) : getActiveRegenTasks(car));
  const prog = calcProg(car);
  const colLabel = COLS.find(c => c.id === car.col)?.label || car.col;
  const card = document.createElement('div');
  card.className = 'pv-card' + (compact ? ' is-compact' : '');
  card.dataset.carId = car.id;
  const taskRows = compact ? '' : tasks.map(t => {
    const p = calcSingleProg(car, t.id, tasks);
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)"><span style="font-size:14px">${t.icon}</span><div style="flex:1;font-size:12px">${t.name}</div><div class="pbar" style="width:52px"><div class="pfill" style="width:${p.pct}%"></div></div><div style="font-size:11px;color:var(--text3);width:30px;text-align:right">${p.pct}%</div></div>`;
  }).join('');
  card.innerHTML = `<div class="pv-drag" title="ドラッグして並び替え">⋮⋮</div><div class="pv-head"><div class="pv-thumb">${car.photo?`<img src="${car.photo}">`:carEmoji(car.size)}</div><div style="flex:1"><div style="font-size:13px;font-weight:600">${car.maker} ${car.model}</div><div style="font-size:11px;color:var(--text2)">${car.num} · ${fmtYearDisplay(parseYearInput(car.year)||car.year)}</div></div><span class="pill ${pillMap[car.col]||'pill-gray'}">${colLabel}</span></div><div class="pv-body">${taskRows}<div style="margin-top:${compact?'0':'9px'};display:flex;justify-content:space-between;font-size:12px;color:var(--text2)"><span>全体</span><span style="font-weight:700;color:var(--green)">${prog.pct}%</span></div><div class="pbar" style="height:6px;margin-top:5px"><div class="pfill" style="width:${prog.pct}%"></div></div></div><div class="pv-btn" onclick="openDetail('${car.id}')">▶ カードを開く</div>`;
  return card;
}

// v0.9.5: 進捗ビューのグループ選択（スマホ用、PCでは縦並び全表示）
// v1.3.6: スマホ初期表示は「販売前」グループから（その他は対象外作業が多いため）
let progressActiveGroup = 'before';

// v1.0.11: 進捗ビューの枠ごとの展開トグル
function toggleProgressGroup(groupId) {
  progressExpanded[groupId] = !progressExpanded[groupId];
  renderProgress();
}

function setProgressGroup(groupId) {
  progressActiveGroup = groupId;
  document.querySelectorAll('.pv-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.group === groupId);
  });
  document.querySelectorAll('.pv-group').forEach(g => {
    g.classList.toggle('pv-active', g.dataset.group === groupId);
  });
}

function renderProgress() {
  const wrap = document.getElementById('pv-grid');
  if (!wrap) return;
  wrap.innerHTML = '';

  const otherCars = cars.filter(c => c.col === 'other');
  const beforeSale = cars.filter(c => ['purchase','regen','exhibit'].includes(c.col));
  const inDelivery = cars.filter(c => c.col === 'delivery');

  const groups = [
    {id:'other',    label:'📝 その他',   cars: otherCars,   emptyMsg:'その他の車両はありません'},
    {id:'before',   label:'🏷️ 販売前',   cars: beforeSale,  emptyMsg:'販売前の車両はありません'},
    {id:'delivery', label:'📦 納車準備', cars: inDelivery,  emptyMsg:'納車準備中の車両はありません'},
  ];

  // スマホ用切替タブ（CSSでスマホ時のみ表示）
  const tabBar = document.createElement('div');
  tabBar.className = 'pv-tabs';
  tabBar.innerHTML = groups.map(g =>
    `<button class="pv-tab${g.id === progressActiveGroup ? ' active' : ''}" data-group="${g.id}" onclick="setProgressGroup('${g.id}')">${g.label}<span class="pv-tab-count">${g.cars.length}</span></button>`
  ).join('');
  wrap.appendChild(tabBar);

  groups.forEach(g => {
    const isMany = g.cars.length >= 4;
    const expanded = !!progressExpanded[g.id];
    const compact = isMany && !expanded;
    const toggleBtn = isMany
      ? `<button class="pv-toggle-btn" onclick="toggleProgressGroup('${g.id}')">${expanded ? '▲ 縮小表示に戻す' : '▼ すべて展開'}</button>`
      : '';
    const sec = document.createElement('div');
    sec.className = 'pv-group' + (g.id === progressActiveGroup ? ' pv-active' : '');
    sec.dataset.group = g.id;
    sec.innerHTML = `
      <div class="pv-group-head">
        <div class="pv-group-title">${g.label} <span class="pv-group-count">${g.cars.length}台</span></div>
        ${toggleBtn}
      </div>
      <div class="pv-group-body"></div>`;
    const body = sec.querySelector('.pv-group-body');
    body.dataset.group = g.id;
    if (!g.cars.length) {
      const empty = document.createElement('div');
      empty.className = 'pv-group-empty';
      empty.textContent = g.emptyMsg;
      body.appendChild(empty);
    } else {
      g.cars.forEach(car => body.appendChild(_makeProgressCard(car, compact)));
    }
    wrap.appendChild(sec);
  });

  _attachProgressDnD();
}

// 進捗ビューのドラッグ&ドロップ並び替え（同じ枠内のみ、再描画でリセット）
function _attachProgressDnD() {
  const bodies = document.querySelectorAll('#pv-grid .pv-group-body');
  bodies.forEach(body => {
    const groupId = body.dataset.group;
    body.querySelectorAll('.pv-card').forEach(card => {
      if (card.dataset.dndBound === '1') return; // 二重配線防止
      card.dataset.dndBound = '1';
      const handle = card.querySelector('.pv-drag');
      if (!handle) return;
      // ハンドルにマウスダウンしたときだけドラッグ可能化
      handle.addEventListener('mousedown', () => { card.draggable = true; });
      handle.addEventListener('mouseup',   () => { card.draggable = false; });
      card.addEventListener('dragend',     () => {
        card.draggable = false;
        card.classList.remove('pv-dragging');
      });
      card.addEventListener('dragstart', (e) => {
        card.classList.add('pv-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/x-pv-group', groupId);
        e.dataTransfer.setData('text/x-pv-id', card.dataset.carId || '');
      });
      // クリックでカード単体の縮小⇄展開をトグル（drag/カードを開くボタンは除外）
      card.addEventListener('click', (e) => {
        if (e.target.closest('.pv-drag')) return;
        if (e.target.closest('.pv-btn')) return;
        const carId = card.dataset.carId;
        const car = cars.find(c => c.id === carId);
        if (!car) return;
        const isCompact = card.classList.contains('is-compact');
        const newCard = _makeProgressCard(car, !isCompact);
        card.replaceWith(newCard);
        _attachProgressDnD();
      });
    });

    body.addEventListener('dragover', (e) => {
      const dragging = document.querySelector('.pv-card.pv-dragging');
      if (!dragging) return;
      // 別枠は受け付けない
      const srcGroup = dragging.closest('.pv-group-body')?.dataset.group;
      if (srcGroup !== groupId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      // ドラッグ中のカードをリアルタイムで挿入し直し（ぷいっと動く）
      const target = e.target.closest('.pv-card');
      if (target && target !== dragging) {
        const r = target.getBoundingClientRect();
        const before = (e.clientY - r.top) < r.height / 2;
        const ref = before ? target : target.nextSibling;
        if (dragging.nextSibling !== ref && dragging !== ref) {
          target.parentNode.insertBefore(dragging, ref);
        }
      } else if (!target && body.lastElementChild !== dragging) {
        // 空白部分にホバー → 末尾へ
        body.appendChild(dragging);
      }
    });

    body.addEventListener('drop', (e) => {
      const srcGroup = e.dataTransfer.getData('text/x-pv-group');
      if (srcGroup !== groupId) return;
      e.preventDefault();
      // 既に dragover で並びは確定しているので何もしない
    });
  });
}

// ========================================
// 全体一覧ビュー
// ========================================
function setTableSort(key) {
  if (tableSort.key === key) {
    tableSort.dir = tableSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    tableSort.key = key;
    tableSort.dir = (key === 'num' || key === 'status' || key === 'progress') ? 'asc' : 'desc';
  }
  renderTable();
}

function _tableSorter() {
  const {key, dir} = tableSort;
  const sign = dir === 'asc' ? 1 : -1;
  const colOrder = {};
  COLS.forEach((c, i) => { colOrder[c.id] = i; });
  return (a, b) => {
    let av, bv;
    if (key === 'num') {
      av = (a.num || '').toString();
      bv = (b.num || '').toString();
      return av.localeCompare(bv) * sign;
    } else if (key === 'purchaseDate') {
      av = a.purchaseDate || '';
      bv = b.purchaseDate || '';
      return av.localeCompare(bv) * sign;
    } else if (key === 'status') {
      av = colOrder[a.col] != null ? colOrder[a.col] : 99;
      bv = colOrder[b.col] != null ? colOrder[b.col] : 99;
    } else if (key === 'progress') {
      av = calcProg(a).pct;
      bv = calcProg(b).pct;
    } else if (key === 'deliveryDate') {
      av = a.deliveryDate || '';
      bv = b.deliveryDate || '';
      return av.localeCompare(bv) * sign;
    } else {
      return 0;
    }
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return 0;
  };
}

function _renderTableSortBar() {
  const bar = document.getElementById('table-toolbar');
  if (!bar) return;
  bar.innerHTML = '';
  const items = [
    {key:'num', label:'管理番号', icon:'🔢'},
    {key:'purchaseDate', label:'仕入れ日', icon:'📅'},
    {key:'status', label:'ステータス', icon:'🏷️'},
    {key:'progress', label:'進捗％', icon:'⚡'},
    {key:'deliveryDate', label:'納車予定日', icon:'🚗'},
  ];
  bar.innerHTML = `
    <div class="ex-toolbar-label">並び替え</div>
    ${items.map(it => `<button class="ex-sort-btn" data-key="${it.key}" onclick="setTableSort('${it.key}')">${it.icon} ${it.label}</button>`).join('')}
    <div class="ex-toolbar-spacer"></div>
    <div class="ex-total-label" id="table-total-label"></div>`;
  bar.querySelectorAll('.ex-sort-btn').forEach(btn => {
    if (btn.dataset.key === tableSort.key) {
      btn.classList.add('active');
      const arrow = document.createElement('span');
      arrow.className = 'sort-arrow';
      arrow.textContent = tableSort.dir === 'asc' ? '▲' : '▼';
      btn.appendChild(arrow);
    }
  });
}

function renderTable() {
  _renderTableSortBar();
  const wrap = document.getElementById('table-body-wrap');
  if (!wrap) return;
  const sorter = _tableSorter();
  const sorted = cars.slice().sort(sorter);
  let rows = '';
  sorted.forEach(car => {
    const prog = calcProg(car);
    const colLabel = COLS.find(c => c.id === car.col)?.label || car.col;
    const inv = car.purchaseDate ? daysSince(car.purchaseDate) : '—';
    const wt = car.purchaseDate ? invWarnTier(daysSince(car.purchaseDate)) : null;
    const invCls = wt ? (wt.days >= 45 ? 'dr' : wt.days >= 30 ? 'dw' : 'dg') : 'dg';
    const invHtml = car.purchaseDate
      ? `<span class="ex-card-inv ${invCls}" style="font-size:11px">${inv}日</span>`
      : '—';
    // v1.8.63: 総額/本体の2列表示
    const pt = (typeof fmtPriceTwo === 'function')
      ? fmtPriceTwo(car.totalPrice, car.price)
      : { totalDisp:'', bodyDisp: car.price?fmtPrice(car.price):'', hasTotal:false, hasBody:!!car.price };
    const totalCell = pt.hasTotal ? pt.totalDisp : '—';
    const bodyCell  = pt.hasBody  ? pt.bodyDisp  : '—';
    rows += `<tr onclick="openDetail('${car.id}')" style="cursor:pointer">
      <td style="font-weight:600;color:var(--blue)">${car.num}</td>
      <td>${car.maker} ${car.model}${car.grade?' '+car.grade:''}</td>
      <td>${fmtYearDisplay(parseYearInput(car.year)||car.year)}</td>
      <td>${car.size||'—'}</td>
      <td>${Number(car.km||0).toLocaleString()}km</td>
      <td style="color:var(--green);font-weight:600">${totalCell}</td>
      <td style="color:var(--text2);font-weight:500">${bodyCell}</td>
      <td>${car.purchaseDate?fmtDate(car.purchaseDate):'—'}</td>
      <td>${invHtml}</td>
      <td><span class="pill ${pillMap[car.col]||'pill-gray'}">${colLabel}</span></td>
      <td>${car.contract?'<span class="pill pill-green">成約</span>':'<span class="pill pill-gray">未成約</span>'}</td>
      <td>${car.deliveryDate?fmtDate(car.deliveryDate):'—'}</td>
      <td><div style="display:flex;align-items:center;gap:5px"><div class="pbar" style="width:56px"><div class="pfill" style="width:${prog.pct}%"></div></div><span style="font-size:11px;color:var(--text3)">${prog.pct}%</span></div></td>
    </tr>`;
  });
  // v1.8.63: 見出しに税ラベル表記を入れる
  const tlbH = (typeof getTaxLabel === 'function') ? getTaxLabel('body')  : '税込';
  const tltH = (typeof getTaxLabel === 'function') ? getTaxLabel('total') : '税込';
  wrap.innerHTML = `<div style="overflow-x:auto"><table class="dtable">
    <thead><tr>
      <th>管理番号</th><th>メーカー/車種</th><th>年式</th><th>ボディ</th>
      <th>走行距離</th><th>総額<span style="font-size:10px;color:var(--text3);margin-left:3px">（${tltH}）</span></th><th>本体<span style="font-size:10px;color:var(--text3);margin-left:3px">（${tlbH}）</span></th><th>仕入日</th><th>在庫日数</th>
      <th>ステータス</th><th>成約</th><th>納車予定</th><th>進捗</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
  const totalEl = document.getElementById('table-total-label');
  if (totalEl) totalEl.textContent = `合計 ${cars.length}台`;
}

// ========================================
// 在庫日数ビュー
// ========================================
function _invCardHtml(car) {
  const inv = daysSince(car.purchaseDate);
  const dc  = inv > 30 ? '#ef4444' : inv > 14 ? '#f59e0b' : '#1db97a';
  return `<div class="inv-card" onclick="openDetail('${car.id}')">
    <div class="inv-thumb">${car.photo?`<img src="${car.photo}">`:carEmoji(car.size)}</div>
    <div class="inv-body">
      <div class="inv-row">
        <div class="inv-info">
          <div class="inv-name">${car.maker} ${car.model}</div>
          <div class="inv-num">${car.num}</div>
          <span class="pill ${pillMap[car.col]||'pill-gray'}" style="margin-top:5px;display:inline-block">${COLS.find(c=>c.id===car.col)?.label||car.col}</span>
        </div>
        <div class="inv-day-big" style="color:${dc}">${inv}<span class="inv-day-unit">日</span></div>
      </div>
    </div>
  </div>`;
}

function _invGroupCls(label) {
  if (label === 'OK') return 'g-ok';
  if (label === '注意') return 'g-warn';
  if (label === '要対応') return 'g-action';
  if (label === '危険') return 'g-danger';
  return 'g-warn';
}
function _invGroupIcon(label) {
  if (label === 'OK') return '✅';
  if (label === '注意') return '⚠️';
  if (label === '要対応') return '🔶';
  if (label === '危険') return '🔴';
  return '⚠️';
}

function renderInventory() {
  const grid = document.getElementById('inv-grid');
  if (!grid) return;
  grid.innerHTML = '';
  // v1.8.72: 在庫日数ビューはオーダー車両を除外（在庫ではない）
  const list = cars
    .filter(c => c.col !== 'done' && c.col !== 'other' && c.col !== 'delivery' && !c.isOrder)
    .slice()
    .sort((a,b) => daysSince(b.purchaseDate) - daysSince(a.purchaseDate));
  const onTiers = (appSettings?.invWarn || [])
    .filter(t => t.on)
    .slice()
    .sort((a,b) => a.days - b.days);
  const groupDefs = [
    {key:'OK', threshold:null},
    ...onTiers.map(t => ({key: t.label || `${t.days}日〜`, threshold: t.days, tier: t}))
  ];
  const buckets = {};
  groupDefs.forEach(g => buckets[g.key] = []);
  list.forEach(car => {
    const days = daysSince(car.purchaseDate);
    const wt = invWarnTier(days);
    const key = wt ? (wt.label || 'OK') : 'OK';
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(car);
  });
  groupDefs.forEach(g => {
    const arr = buckets[g.key] || [];
    const cls = _invGroupCls(g.key);
    const icon = _invGroupIcon(g.key);
    let desc = '';
    if (g.key === 'OK') {
      desc = '警告閾値内（まだ余裕あり）';
    } else if (g.threshold != null) {
      desc = `仕入れから ${g.threshold} 日以上`;
    }
    const sec = document.createElement('div');
    sec.className = 'inv-group ' + cls + (arr.length ? '' : ' is-empty');
    const bodyHtml = arr.length
      ? arr.map(_invCardHtml).join('')
      : '<div class="inv-empty">該当なし</div>';
    sec.innerHTML = `
      <div class="inv-group-head">
        <span class="tbl-group-icon">${icon}</span>
        <span class="tbl-group-name">${g.key}</span>
        <span class="tbl-group-desc">${desc}</span>
        <span class="tbl-group-count">${arr.length}台</span>
      </div>
      <div class="inv-group-body">
        ${bodyHtml}
      </div>`;
    grid.appendChild(sec);
  });
  if (!list.length && !groupDefs.length) {
    grid.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:20px 4px">在庫車両がありません</div>';
  }
}
