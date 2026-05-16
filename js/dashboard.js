// ========================================
// dashboard.js
// ダッシュボード：サマリーカード／要対応アクション／着地予測／販売KPI／警告
// v1.8.67: 集計を税モード対応に。
//   - 元データ: appSettings.priceTax.dashboardSource ('body' or 'total')
//   - 表示モード: appSettings.priceTax.dashboard ('incl' or 'excl')
//   - 元データのモードと表示モードが違う場合は convertTax で換算
// ========================================

// 集計用の1台あたり金額を返す（設定考慮済み）
// v1.8.71: 納車完了済み（priceTaxSnapshot あり）の車は、その時点の税設定で計算。
//   進行中の車は現在の appSettings の税設定で計算。
function _dashAmount(car) {
  if (!car) return 0;
  const ps = (typeof appSettings !== 'undefined' && appSettings.priceTax) || {};
  const dashMode = (ps.dashboard === 'excl') ? 'excl' : 'incl';
  const source   = (ps.dashboardSource === 'total') ? 'total' : 'body';
  // スナップショットを持つ車（納車完了済み）は当時の税扱いで換算
  if (car.priceTaxSnapshot && typeof _amountFromCarWithSnapshot === 'function') {
    return _amountFromCarWithSnapshot(car, source, dashMode);
  }
  // 進行中の車：現在の設定で換算
  let amount, fromMode;
  if (source === 'total' && Number(car.totalPrice) > 0) {
    amount   = Number(car.totalPrice);
    fromMode = (ps.total === 'excl') ? 'excl' : 'incl';
  } else {
    amount   = Number(car.price) || 0;
    fromMode = (ps.body === 'excl') ? 'excl' : 'incl';
  }
  return (typeof convertTax === 'function') ? convertTax(amount, fromMode, dashMode) : amount;
}

// v1.8.79: サマリー6カード — 全体像→管理中→売約／オーダー→今月着地→累計 のフロー
function renderSummaryCards() {
  const total = cars.length;
  const active = cars.filter(c => c.col !== 'done').length;
  const contracted = cars.filter(c => c.contract && c.col !== 'done').length;
  const order = cars.filter(c => c.isOrder && c.col !== 'done').length;
  const done = cars.filter(c => c.col === 'done').length;

  // 今月納車予定（売約済 × 当月納車予定 × まだ done でない）
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const deliverThisMonth = cars.filter(c =>
    c.col !== 'done' && c.contract && c.deliveryDate && c.deliveryDate.startsWith(ym)
  ).length;

  document.getElementById('stat-grid').innerHTML = `
    <div class="stat-box"><div class="stat-num">${total}</div><div class="stat-label">総車両数</div></div>
    <div class="stat-box"><div class="stat-num" style="color:var(--orange)">${active}</div><div class="stat-label">管理中</div></div>
    <div class="stat-box"><div class="stat-num" style="color:var(--blue)">${contracted}</div><div class="stat-label">売約済</div></div>
    <div class="stat-box"><div class="stat-num" style="color:#c4b5fd">${order}</div><div class="stat-label">📦 オーダー車両</div></div>
    <div class="stat-box"><div class="stat-num" style="color:#6ee7b7">${deliverThisMonth}</div><div class="stat-label">今月納車予定</div></div>
    <div class="stat-box"><div class="stat-num" style="color:var(--text3)">${done}</div><div class="stat-label">納車完了</div></div>`;
}

// v1.8.79: 在庫日数警告 — appSettings.invWarn の tier ごとに「○日以上 N台」を1チップずつ集計表示
function _buildInventoryWarningChips() {
  const tiers = (appSettings.invWarn || []).filter(t => t.on);
  if (!tiers.length) return [];
  // 対象車両：未納車・未売約・オーダー車両以外（純粋な在庫）
  const stockCars = cars.filter(c => c.col !== 'done' && !c.contract && !c.isOrder);
  const chips = [];
  tiers.forEach(t => {
    const list = stockCars.filter(c => {
      const inv = (typeof daysSince === 'function') ? daysSince(c.purchaseDate) : 0;
      return inv >= t.days;
    });
    if (list.length === 0) return;
    const style = `background:${t.bg};border:1px solid ${t.color};color:${t.color}`;
    chips.push(`<div class="chip-count" style="${style}" title="${t.label} — 在庫${t.days}日以上">📦 在庫${t.days}日以上 <span class="chip-count-num">${list.length}台</span></div>`);
  });
  return chips;
}

// v1.8.80: 車両ごとに「最も切迫したタスク」を1チップにまとめる（目標/限界の2軸判定）
// 目標ライン超過=黄／限界ライン本日=橙／限界ライン超過=赤
//   - regen: 経過日数(inv) が target以上で黄、limit到達で橙、limit超で赤
//   - delivery: 納車まで残日数(remain) が target以下で黄、limit以下で橙、limit未満で赤
//   - limit 未設定なら target を限界として扱う（旧データ互換）
function _buildTaskUrgencyChips() {
  const out = [];
  if (typeof cars === 'undefined' || !Array.isArray(cars)) return out;
  cars.forEach(car => {
    if (!car || car.col === 'done' || car.col === 'other') return;
    const candidates = [];

    // 再生フェーズ：数値が大きいほど遅延
    if (car.col !== 'delivery') {
      const inv = (typeof daysSince === 'function') ? daysSince(car.purchaseDate) : 0;
      const regenTasks = (typeof getActiveRegenTasks === 'function') ? getActiveRegenTasks(car) : [];
      regenTasks.forEach(t => {
        const dl = (typeof getTaskDeadlines === 'function') ? getTaskDeadlines(t.id, 'regen') : { target: null, limit: null };
        if (dl.target == null && dl.limit == null) return;
        // 限界未設定 → target を限界として扱う（旧データ互換）
        const effTarget = (dl.target != null) ? dl.target : dl.limit;
        const effLimit  = (dl.limit  != null) ? dl.limit  : dl.target;
        if (typeof _isTaskDoneForOverdue === 'function' && _isTaskDoneForOverdue(car, t, false)) return;

        let severity;
        const toLimit = effLimit - inv; // 限界まで何日（負なら超過）
        if (inv > effLimit)        severity = 'red';
        else if (inv === effLimit) severity = 'orange';
        else if (inv >= effTarget) severity = 'yellow';
        else return; // 目標ライン内：チップ出さない
        candidates.push({ name: t.name, icon: t.icon || '📋', severity, toLimit, overdueDays: Math.max(0, -toLimit) });
      });
    }

    // 納車フェーズ：remain が小さいほど切迫
    if (car.col === 'delivery' && car.deliveryDate) {
      const remain = (typeof daysDiff === 'function') ? daysDiff(car.deliveryDate) : null;
      if (remain != null) {
        const delTasks = (typeof getActiveDeliveryTasks === 'function') ? getActiveDeliveryTasks(car) : [];
        delTasks.forEach(t => {
          const dl = (typeof getTaskDeadlines === 'function') ? getTaskDeadlines(t.id, 'delivery') : { target: null, limit: null };
          if (dl.target == null && dl.limit == null) return;
          const effTarget = (dl.target != null) ? dl.target : dl.limit;
          const effLimit  = (dl.limit  != null) ? dl.limit  : dl.target;
          if (typeof _isTaskDoneForOverdue === 'function' && _isTaskDoneForOverdue(car, t, true)) return;

          // delivery では target>=limit が想定（例：target=7日前, limit=3日前）
          let severity;
          const toLimit = remain - effLimit; // 限界まで何日（負なら超過）
          if (remain < effLimit)        severity = 'red';
          else if (remain === effLimit) severity = 'orange';
          else if (remain <= effTarget) severity = 'yellow';
          else return;
          candidates.push({ name: t.name, icon: t.icon || '📋', severity, toLimit, overdueDays: Math.max(0, -toLimit) });
        });
      }
    }

    if (!candidates.length) return;
    // severity 優先度：red > orange > yellow（同 severity 内は超過日数で）
    const sevPri = { red: 3, orange: 2, yellow: 1 };
    candidates.sort((a, b) => (sevPri[b.severity] - sevPri[a.severity]) || (b.overdueDays - a.overdueDays));
    const top = candidates[0];
    let cls, msg;
    if (top.severity === 'red') {
      cls = 'chip-red';
      msg = `${top.icon} ${car.maker} ${car.model} ${top.name} 限界ライン超過（${top.overdueDays}日）`;
    } else if (top.severity === 'orange') {
      cls = 'chip-orange';
      msg = `${top.icon} ${car.maker} ${car.model} ${top.name} 限界ライン本日`;
    } else {
      cls = 'chip-yellow';
      const daysToLimit = Math.max(0, top.toLimit);
      msg = `${top.icon} ${car.maker} ${car.model} ${top.name} 目標ライン超過（限界まであと${daysToLimit}日）`;
    }
    out.push(`<div class="chip ${cls}" onclick="openDetail('${car.id}')"><span class="chip-dot"></span>${msg}</div>`);
  });
  return out;
}

// v1.2.4 / v1.8.79: 共通関数。要対応アクションのチップHTML配列を返す。
// 並び順：在庫日数集計（tier別）→ 納車直前（車別）→ タスク期日（車別）
function _buildActionChipsHtml() {
  const chips = [];
  const notif = appSettings.notif || { pre:{on:false}, stock:{on:false} };

  // 1) 在庫日数 — tier別集計チップ
  const invChips = _buildInventoryWarningChips();
  if (invChips.length) chips.push(...invChips);

  // 2) 納車直前 — 車両ごと
  if (notif.pre && notif.pre.on) {
    cars.forEach(car => {
      if (car.col === 'done') return;
      if (!car.contract || !car.deliveryDate) return;
      const d = daysDiff(car.deliveryDate);
      if (d !== null && d <= notif.pre.days && d >= 0) {
        chips.push(`<div class="chip chip-red" onclick="openDetail('${car.id}')"><span class="chip-dot"></span>🚨 ${car.maker} ${car.model} 納車${d===0?'本日':d+'日後'}</div>`);
      }
    });
  }

  // 3) タスク期日 — 車両ごとに最重要タスク1件（黄/橙/赤）
  chips.push(..._buildTaskUrgencyChips());

  return chips;
}

function renderActionChips() {
  const chips = _buildActionChipsHtml();
  const el = document.getElementById('dash-actions');
  if (!el) return;
  el.innerHTML = chips.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:4px">${chips.join('')}</div>`
    : '<div style="font-size:13px;color:var(--text3);padding:8px 0">要対応アクションなし ✓</div>';
}

// v1.2.4: 下部アクションエリア（ダッシュボード以外でも常時表示される要対応バー）
function renderActions() {
  const chips = document.getElementById('action-chips');
  if (!chips) return;
  const list = (typeof _buildActionChipsHtml === 'function') ? _buildActionChipsHtml() : [];
  if (list.length > 0) {
    chips.innerHTML = `<div class="action-chips-inner">${list.join('')}</div>`;
    chips.style.display = 'block';
  } else {
    chips.innerHTML = '';
    chips.style.display = 'none';
  }
}

// ========================================
// 着地予測（3層）
// mode=contract: 当月内に売約した車両で線形予測
// mode=delivery: 確定(既納車完了)・見込み(売約済で当月中納車予定)・追加余地(残日数と準備リードタイム)
// ========================================
function calcLanding() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth()+1;
  const mkey = ymKeyFromYM(y, m);
  const goal = monthlyGoal(y, m);
  const mode = appSettings.goals.revRecog;
  const lead = appSettings.deliveryLeadDays || 14;
  // 月末日
  const daysInMonth = new Date(y, m, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysLeft = daysInMonth - dayOfMonth;
  const firstOfMonth = `${y}-${String(m).padStart(2,'0')}-01`;
  const lastOfMonth = `${y}-${String(m).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`;

  if (mode === 'contract') {
    // v1.8.98: 売約ベースを新ロジックに統一（リード控除なし＝売約即計上、1年アベ、1日目に1台立つ）
    const fixedCars = [...cars, ...archivedCars].filter(c => c.contractDate && c.contractDate >= firstOfMonth && c.contractDate <= lastOfMonth);
    const fixedCount = fixedCars.length;
    const fixedSales = fixedCars.reduce((s, c) => s + _dashAmount(c), 0);

    // 売約ベースはリードタイム控除なし（今日売約 = 今日計上）
    const addSlotsC = Math.max(0, daysLeft);
    let possibleCountC = 0, possibleSalesC = 0;
    if (addSlotsC > 0) {
      const since = new Date(now); since.setDate(since.getDate() - 365);
      const sinceStr = since.toISOString().split('T')[0];
      const recent = [...cars, ...archivedCars].filter(c => c.contractDate && c.contractDate >= sinceStr);
      const dailyPace = recent.length / 365;
      if (dailyPace > 0) {
        const interval = Math.max(1, Math.ceil(1 / dailyPace));
        possibleCountC = Math.floor((addSlotsC - 1) / interval) + 1;
      }
      const avgPrice = recent.length ? recent.reduce((s, c) => s + _dashAmount(c), 0) / recent.length : 0;
      possibleSalesC = Math.round(avgPrice * possibleCountC);
    }

    return {
      mode, goal, daysLeft, dayOfMonth, daysInMonth,
      fixed: {count: fixedCount, sales: fixedSales, label:'確定（売約済み）'},
      likely: {count: 0, sales: 0, label:'—'},
      possible: {count: possibleCountC, sales: possibleSalesC, label:'実績予測（過去1年ペース）'},
      paceNote: addSlotsC > 0
        ? `月末まで残${daysLeft}日（売約即計上のためリード控除なし）<br><span style="color:var(--text3)">※実績予測：直近1年の売約ペースから「期間内に何台売約取れそうか」の希望的観測（実車両ではありません）</span>`
        : `月末まで残${daysLeft}日`,
      predictLow: fixedCount,
      predictHigh: fixedCount + possibleCountC,
    };
  }

  // delivery mode
  // ① 確定：col==='done' かつ deliveryDate が当月
  const fixedCars = [...cars, ...archivedCars].filter(c => c.col === 'done' && c.deliveryDate && c.deliveryDate >= firstOfMonth && c.deliveryDate <= lastOfMonth);
  const fixedCount = fixedCars.length;
  const fixedSales = fixedCars.reduce((s, c) => s + _dashAmount(c), 0);

  // ② 見込み：col in {'delivery','regen','exhibit','purchase'} かつ contract かつ deliveryDate が当月、かつ done ではない
  const likelyCars = cars.filter(c => c.col !== 'done' && c.contract && c.deliveryDate && c.deliveryDate >= firstOfMonth && c.deliveryDate <= lastOfMonth);
  const likelyCount = likelyCars.length;
  const likelySales = likelyCars.reduce((s, c) => s + _dashAmount(c), 0);

  // v1.8.95: 印刷シートと同じ「気合短縮3日 + 1日目に1台立つ」式に統一
  // - effectiveLead = max(1, lead - 3)
  // - addSlots = max(0, daysLeft - effectiveLead)
  // - addSlots > 0 で過去90日にペースがあれば、最低1台立つ
  let possibleCount = 0;
  let possibleSales = 0;
  const effectiveLead = Math.max(1, lead - 3);
  const addSlots = Math.max(0, daysLeft - effectiveLead);
  if (addSlots > 0) {
    // v1.8.97: 直近365日（1年）のペース・平均価格（月間バラつき吸収）
    const since = new Date(now); since.setDate(since.getDate() - 365);
    const sinceStr = since.toISOString().split('T')[0];
    const recent = [...cars, ...archivedCars].filter(c => c.col === 'done' && c.deliveryDate && c.deliveryDate >= sinceStr);
    const dailyPace = recent.length / 365;
    if (dailyPace > 0) {
      const interval = Math.max(1, Math.ceil(1 / dailyPace));
      possibleCount = Math.floor((addSlots - 1) / interval) + 1;
    }
    const avgPrice = recent.length ? recent.reduce((s, c) => s + _dashAmount(c), 0) / recent.length : 0;
    possibleSales = Math.round(avgPrice * possibleCount);
  }
  const note = addSlots > 0
    ? `月末まで残${daysLeft}日 − 気合リードタイム${effectiveLead}日（標準${lead}日−気合3日）＝ 追加売約余地 ${addSlots}日<br><span style="color:var(--text3)">※実績予測：直近1年の納車ペースから「期間内に最低何台売約取れそうか」の希望的観測（実車両ではありません）</span>`
    : `月末まで残${daysLeft}日 ≤ 気合リードタイム${effectiveLead}日。新規売約は来月スライドの可能性が高いです`;
  return {
    mode, goal, daysLeft, dayOfMonth, daysInMonth,
    fixed: {count: fixedCount, sales: fixedSales, label:'確定（納車完了）'},
    likely: {count: likelyCount, sales: likelySales, label:'見込み（売約済×当月納車予定）'},
    possible: {count: possibleCount, sales: possibleSales, label:'実績予測（過去ペースから算出）'},
    paceNote: note,
    predictLow: fixedCount + likelyCount,            // 見込みまで実現しても動かない
    predictHigh: fixedCount + likelyCount + possibleCount,
  };
}

// v1.8.83: 着地予測パネル右上の期間プルダウン＋印刷／集計対象ボタン用ステート
let _landingSelected = null; // { mode, periodId, year, month }

function _initLandingPeriodSelect(){
  const sel = document.getElementById('landing-period-select');
  if (!sel) return;
  // 既に options が入っているなら再構築しない
  if (sel.options && sel.options.length > 0) return;
  if (!window.periodStats) return;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const opts = window.periodStats.buildPeriodOptions(y, m);
  let html = '';
  let lastGroup = null;
  opts.forEach(o => {
    if (o.group !== lastGroup){
      if (lastGroup) html += '</optgroup>';
      if (o.group)  html += `<optgroup label="${o.group}">`;
      lastGroup = o.group;
    }
    html += `<option value="${o.value}">${o.label}</option>`;
  });
  if (lastGroup) html += '</optgroup>';
  sel.innerHTML = html;
  // v1.8.85: 境界+2日まで前期間を引っ張るデフォルト選択
  const def = window.periodStats.defaultPeriodForToday('half');
  const defVal = `${def.year}-${String(def.month).padStart(2,'0')}:${def.mode}:${def.periodId}`;
  sel.value = defVal;
  _landingSelected = { mode: def.mode, periodId: def.periodId, year: def.year, month: def.month };
}

function onLandingPeriodChange(){
  const sel = document.getElementById('landing-period-select');
  if (!sel || !sel.value) return;
  const parsed = window.periodStats.parsePeriodValue(sel.value);
  if (!parsed) return;
  _landingSelected = parsed;
}

function openForecastPrint(){
  if (!_landingSelected) _initLandingPeriodSelect();
  if (!_landingSelected || !window.forecastPrint) { showToast('印刷モジュールが読み込めません'); return; }
  window.forecastPrint.open(_landingSelected.mode, _landingSelected.periodId, _landingSelected.year, _landingSelected.month);
}

function openForecastTargets(){
  if (!_landingSelected) _initLandingPeriodSelect();
  if (!_landingSelected || !window.forecastTargets) { showToast('集計対象モジュールが読み込めません'); return; }
  window.forecastTargets.open(_landingSelected.mode, _landingSelected.periodId, _landingSelected.year, _landingSelected.month);
}

function renderLanding() {
  _initLandingPeriodSelect(); // v1.8.83
  const L = calcLanding();
  const g = L.goal;
  const el = document.getElementById('dash-landing');
  const totalGoalCount = g.count || 1;
  const totalGoalSales = g.sales || 1;

  // v1.8.105: 金バーは「確定（fixed）が目標到達」した時のみ。緑バーが金に変わるイメージ
  const fixedOverCount = L.fixed.count > totalGoalCount;
  const overshootCount = Math.max(0, L.fixed.count - totalGoalCount); // 確定の超過分のみ
  const overshootCountRatio = overshootCount / totalGoalCount * 100;
  let pctFixed, pctLikely, pctPoss, pctRemain;
  if (fixedOverCount){
    // 確定で目標達成済み → バー全部金
    pctFixed = 100; pctLikely = 0; pctPoss = 0; pctRemain = 0;
  } else {
    pctFixed   = Math.min(100, L.fixed.count / totalGoalCount * 100);
    pctLikely  = Math.min(100 - pctFixed, L.likely.count / totalGoalCount * 100);
    pctPoss    = Math.min(100 - pctFixed - pctLikely, L.possible.count / totalGoalCount * 100);
    pctRemain  = Math.max(0, 100 - pctFixed - pctLikely - pctPoss);
  }

  const remainToGoal = Math.max(0, totalGoalCount - L.predictLow);
  const remainSalesToGoal = Math.max(0, totalGoalSales - (L.fixed.sales + L.likely.sales));
  const dashTax = (typeof getTaxLabel === 'function') ? getTaxLabel('dashboard') : '税込';

  // 売上バー：fixed sales が目標到達 → 金バー
  const fxSales = Math.round(L.fixed.sales);
  const lkSales = Math.round(L.likely.sales);
  const psSales = Math.round(L.possible.sales);
  const predictHighSales = fxSales + lkSales + psSales;
  const fixedOverSales = fxSales > totalGoalSales;
  const overshootSales = Math.max(0, fxSales - totalGoalSales);
  const overshootSalesRatio = overshootSales / totalGoalSales * 100;
  let slFx, slLk, slPs, slRm;
  if (fixedOverSales){
    slFx = 100; slLk = 0; slPs = 0; slRm = 0;
  } else {
    slFx = Math.min(100, fxSales / totalGoalSales * 100);
    slLk = Math.min(100 - slFx, lkSales / totalGoalSales * 100);
    slPs = Math.min(100 - slFx - slLk, psSales / totalGoalSales * 100);
    slRm = Math.max(0, 100 - slFx - slLk - slPs);
  }

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div style="font-size:12px;color:var(--text2)">目標 ${totalGoalCount}台 / ${(totalGoalSales/10000).toFixed(0)}万円<span style="font-size:10px;color:var(--text3);margin-left:4px">（${dashTax}）</span></div>
      <div style="font-size:11px;color:var(--text3)">${L.mode==='contract'?'売約時計上':'納車完了計上'}</div>
    </div>
    <div style="display:grid;grid-template-columns:32px 1fr 120px;gap:8px;align-items:center;margin-bottom:4px">
      <div style="font-size:11px;font-weight:600;color:var(--text2);text-align:right">台数</div>
      <div class="land-bar-row" style="display:flex;gap:1px;align-items:stretch">
        <div class="land-bar" style="flex:100; min-width:0">
          ${fixedOverCount
            ? `<div class="land-overshoot" style="width:100%" title="確定で目標達成：${L.fixed.count}台">${totalGoalCount}台 ✨</div>`
            : `
              ${L.fixed.count   ? `<div class="land-fixed"   style="width:${pctFixed}%"  title="${L.fixed.label}：${L.fixed.count}台">${L.fixed.count>0&&pctFixed>10?L.fixed.count+'台':''}</div>`   : ''}
              ${L.likely.count  ? `<div class="land-likely"  style="width:${pctLikely}%" title="${L.likely.label}：${L.likely.count}台">${L.likely.count>0&&pctLikely>10?L.likely.count+'台':''}</div>`  : ''}
              ${L.possible.count? `<div class="land-possible"style="width:${pctPoss}%"   title="${L.possible.label}：${L.possible.count}台">${L.possible.count>0&&pctPoss>10?L.possible.count+'台':''}</div>`: ''}
              ${pctRemain > 0   ? `<div class="land-remain"  style="width:${pctRemain}%">残${remainToGoal}台</div>` : ''}
            `
          }
        </div>
        ${fixedOverCount && overshootCount > 0 ? `<div class="land-overshoot" style="flex:${overshootCountRatio}; min-width:32px" title="目標超過 +${overshootCount}台">+${overshootCount}</div>` : ''}
      </div>
      <div style="font-size:11px;color:var(--text2);text-align:right;font-variant-numeric:tabular-nums">${L.predictLow}〜${L.predictHigh}台 / ${totalGoalCount}台${fixedOverCount?' ✨':''}</div>
    </div>
    <div style="display:grid;grid-template-columns:32px 1fr 120px;gap:8px;align-items:center;margin-bottom:8px">
      <div style="font-size:11px;font-weight:600;color:var(--text2);text-align:right">売上</div>
      <div class="land-bar-row" style="display:flex;gap:1px;align-items:stretch">
        <div class="land-bar" style="flex:100; min-width:0">
          ${fixedOverSales
            ? `<div class="land-overshoot" style="width:100%" title="確定売上で目標達成：${Math.round(fxSales/10000)}万円">${Math.round(totalGoalSales/10000)}万 ✨</div>`
            : `
              ${fxSales ? `<div class="land-fixed"    style="width:${slFx}%" title="確定売上：${Math.round(fxSales/10000)}万円">${slFx>14?Math.round(fxSales/10000)+'万':''}</div>` : ''}
              ${lkSales ? `<div class="land-likely"   style="width:${slLk}%" title="見込み売上：${Math.round(lkSales/10000)}万円">${slLk>14?Math.round(lkSales/10000)+'万':''}</div>` : ''}
              ${psSales ? `<div class="land-possible" style="width:${slPs}%" title="実績予測売上：${Math.round(psSales/10000)}万円">${slPs>14?Math.round(psSales/10000)+'万':''}</div>` : ''}
              ${slRm > 0 ? `<div class="land-remain"   style="width:${slRm}%">残${Math.round(Math.max(0,totalGoalSales-predictHighSales)/10000)}万</div>` : ''}
            `
          }
        </div>
        ${fixedOverSales && overshootSales > 0 ? `<div class="land-overshoot" style="flex:${overshootSalesRatio}; min-width:40px" title="目標超過 +${Math.round(overshootSales/10000)}万">+${Math.round(overshootSales/10000)}万</div>` : ''}
      </div>
      <div style="font-size:11px;color:var(--text2);text-align:right;font-variant-numeric:tabular-nums">${Math.round((fxSales+lkSales)/10000).toLocaleString()}〜${Math.round(predictHighSales/10000).toLocaleString()}万 / ${Math.round(totalGoalSales/10000).toLocaleString()}万${fixedOverSales?' ✨':''}</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--text2);margin-bottom:10px">
      <span><span style="display:inline-block;width:10px;height:10px;background:#1db97a;border-radius:2px;vertical-align:middle;margin-right:4px"></span>確定 ${L.fixed.count}台</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#378ADD;border-radius:2px;vertical-align:middle;margin-right:4px"></span>見込み ${L.likely.count}台</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:2px;vertical-align:middle;margin-right:4px"></span>実績予測 ${L.possible.count}台</span>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi-box"><div class="kpi-label">確定売上 <span style="font-size:9px;color:var(--text3)">（${dashTax}）</span></div><div class="kpi-value">${(L.fixed.sales/10000).toFixed(0)}<span style="font-size:12px;color:var(--text3)">万円</span></div>
        <div class="kpi-sub">納車完了 ${L.fixed.count}台</div></div>
      <div class="kpi-box"><div class="kpi-label">売上見込み <span style="font-size:9px;color:var(--text3)">（${dashTax}）</span></div><div class="kpi-value">${((L.fixed.sales+L.likely.sales)/10000).toFixed(0)}<span style="font-size:12px;color:var(--text3)">万円</span></div>
        <div class="kpi-sub">目標まで ${(remainSalesToGoal/10000).toFixed(0)}万円</div></div>
      <div class="kpi-box"><div class="kpi-label">着地予想（レンジ）</div><div class="kpi-value">${L.predictLow}〜${L.predictHigh}<span style="font-size:12px;color:var(--text3)">台</span></div>
        <div class="kpi-sub">目標達成まで<strong style="color:${remainToGoal===0?'#6ee7b7':'#fcd34d'}">${remainToGoal}台</strong></div></div>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-top:8px;line-height:1.5">${L.paceNote}</div>
  `;

  // 詳細：確定・見込みの内訳
  const fixedList = [...cars, ...archivedCars].filter(c => c.col === 'done' && c.deliveryDate && c.deliveryDate >= `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`);
  const likelyList = cars.filter(c => c.col !== 'done' && c.contract && c.deliveryDate && c.deliveryDate.startsWith(`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`));
  const renderList = (arr, label) => arr.length ? arr.map(c => `<div style="font-size:11px;padding:3px 0;color:var(--text2)">・${c.maker} ${c.model} <span style="color:var(--text3)">${c.num}・${fmtPrice(c.price)}${c.deliveryDate?'・納車'+fmtDate(c.deliveryDate):''}</span></div>`).join('') : `<div style="font-size:11px;color:var(--text3)">${label}なし</div>`;
  // スライド売上（売約済だが来月以降納車）
  const slideList = cars.filter(c => c.contract && c.deliveryDate && c.col !== 'done' && c.deliveryDate > `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate()).padStart(2,'0')}`);

  const detailEl = document.getElementById('dash-detail-landing');
  if (detailEl) {
    detailEl.innerHTML = `
      <div style="font-size:12px;font-weight:600;color:var(--text);margin-top:4px">確定（${fixedList.length}台）</div>
      ${renderList(fixedList, '確定')}
      <div style="font-size:12px;font-weight:600;color:var(--text);margin-top:10px">見込み（${likelyList.length}台）</div>
      ${renderList(likelyList, '見込み')}
      ${L.mode === 'delivery' ? `
        <div style="font-size:12px;font-weight:600;color:var(--text);margin-top:10px">来月以降にスライド（${slideList.length}台）<span style="font-size:10px;color:var(--text3);font-weight:400">売約済だが納車予定が翌月以降</span></div>
        ${renderList(slideList, 'スライド')}
      ` : ''}
    `;
  }
}

// ========================================
// 販売・在庫KPI
// ========================================
function renderKPIs() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth()+1;
  const mode = appSettings.goals.revRecog;

  // 期間集計ヘルパ：aから bまでに計上された車両
  const inPeriod = (car, from, to) => {
    const d = recogDateAny(car);
    return d && d >= from && d <= to;
  };
  const monthRange = (y, m) => {
    const dim = new Date(y, m, 0).getDate();
    return [`${y}-${String(m).padStart(2,'0')}-01`, `${y}-${String(m).padStart(2,'0')}-${String(dim).padStart(2,'0')}`];
  };
  const sumBy = (arr, fn) => arr.reduce((s, c) => s + (fn(c) || 0), 0);

  // 今月
  const [mf, mt] = monthRange(y, m);
  const thisMonth = [...cars, ...archivedCars].filter(c => inPeriod(c, mf, mt));
  // 先月
  const prev = new Date(y, m-2, 1);
  const [pf, pt] = monthRange(prev.getFullYear(), prev.getMonth()+1);
  const lastMonth = [...cars, ...archivedCars].filter(c => inPeriod(c, pf, pt));
  // 昨年同月
  const [yf, yt] = monthRange(y-1, m);
  const lastYear = [...cars, ...archivedCars].filter(c => inPeriod(c, yf, yt));

  // 現在の在庫（未納車）
  // v1.8.72: 在庫評価から「オーダー車両」を除外（在庫ではないため）
  const inv = cars.filter(c => c.col !== 'done' && !c.isOrder);
  const invAvgPrice = inv.length ? sumBy(inv, c => _dashAmount(c)) / inv.length : 0;

  // 全アーカイブ平均販売価格
  const allSold = [...archivedCars, ...cars.filter(c => c.col === 'done')];
  const avgSoldPrice = allSold.length ? sumBy(allSold, c => _dashAmount(c)) / allSold.length : 0;

  // 平均在庫日数（売れた車基準）
  // v1.8.72: オーダー車両は「在庫」ではないので分母から除外して計算
  const invDaysSrc = allSold.filter(c => !c.isOrder);
  const avgInvDays = invDaysSrc.length ? sumBy(invDaysSrc, c => {
    if (!c.purchaseDate || !c.deliveryDate) return 0;
    return Math.max(0, Math.floor((new Date(c.deliveryDate) - new Date(c.purchaseDate))/86400000));
  }) / invDaysSrc.length : 0;

  // 月次平均販売台数（アーカイブの年月ユニーク数で割る）
  const monthsSeen = new Set([...archivedCars.map(c => c._archivedYM || (c.deliveryDate?ymKey(c.deliveryDate):''))].filter(Boolean));
  const avgMonthlyCount = monthsSeen.size ? archivedCars.length / monthsSeen.size : 0;

  // 昨対比・先月比
  const yoy = lastYear.length ? Math.round((thisMonth.length - lastYear.length) / lastYear.length * 100) : null;
  const mom = lastMonth.length ? Math.round((thisMonth.length - lastMonth.length) / lastMonth.length * 100) : null;

  const pctLabel = v => v == null ? '—' : `${v>=0?'+':''}${v}%`;
  const pctClass = v => v == null ? '' : (v>=0 ? 'kpi-positive' : 'kpi-negative');

  const thisSales = sumBy(thisMonth, c => _dashAmount(c));
  const lastSales = sumBy(lastMonth, c => _dashAmount(c));
  const yearSales = sumBy(lastYear, c => _dashAmount(c));
  const yoySales = yearSales ? Math.round((thisSales - yearSales)/yearSales*100) : null;
  const momSales = lastSales ? Math.round((thisSales - lastSales)/lastSales*100) : null;

  // v1.8.59: ダッシュボード金額の税扱いラベル
  const dashTax = (typeof getTaxLabel === 'function') ? getTaxLabel('dashboard') : '税込';
  document.getElementById('dash-kpi').innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="kpi-label">今月の販売台数</div>
        <div class="kpi-value">${thisMonth.length}<span style="font-size:12px;color:var(--text3)">台</span></div>
        <div class="kpi-sub">売上 ${(thisSales/10000).toFixed(0)}万円<span style="font-size:9px;color:var(--text3);margin-left:3px">（${dashTax}）</span></div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">先月比</div>
        <div class="kpi-value ${pctClass(mom)}">${pctLabel(mom)}</div>
        <div class="kpi-sub">台数: 先月${lastMonth.length}台</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">昨対比</div>
        <div class="kpi-value ${pctClass(yoy)}">${pctLabel(yoy)}</div>
        <div class="kpi-sub">台数: 昨年同月${lastYear.length}台</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">平均月次販売台数</div>
        <div class="kpi-value">${avgMonthlyCount.toFixed(1)}<span style="font-size:12px;color:var(--text3)">台/月</span></div>
        <div class="kpi-sub">アーカイブ累計から算出</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">在庫平均価格 <span style="font-size:9px;color:var(--text3)">（${dashTax}）</span></div>
        <div class="kpi-value">${(invAvgPrice/10000).toFixed(0)}<span style="font-size:12px;color:var(--text3)">万円</span></div>
        <div class="kpi-sub">現在${inv.length}台</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">売約平均価格 <span style="font-size:9px;color:var(--text3)">（${dashTax}）</span></div>
        <div class="kpi-value">${(avgSoldPrice/10000).toFixed(0)}<span style="font-size:12px;color:var(--text3)">万円</span></div>
        <div class="kpi-sub">累計${allSold.length}台から算出</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">平均在庫日数</div>
        <div class="kpi-value">${Math.round(avgInvDays)}<span style="font-size:12px;color:var(--text3)">日</span></div>
        <div class="kpi-sub">仕入→納車までの平均</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">売上先月比</div>
        <div class="kpi-value ${pctClass(momSales)}">${pctLabel(momSales)}</div>
        <div class="kpi-sub">先月${(lastSales/10000).toFixed(0)}万円</div>
      </div>
    </div>
  `;

  // 詳細：サイズ別・価格帯別
  const sizeBreakdown = {};
  allSold.forEach(c => {
    const k = c.size || '—';
    if (!sizeBreakdown[k]) sizeBreakdown[k] = {count:0, sales:0};
    sizeBreakdown[k].count++;
    sizeBreakdown[k].sales += _dashAmount(c);
  });
  const priceBands = [
    {label:'〜100万', min:0, max:1000000},
    {label:'100〜200万', min:1000000, max:2000000},
    {label:'200〜300万', min:2000000, max:3000000},
    {label:'300万〜', min:3000000, max:Infinity},
  ];
  const bandStat = priceBands.map(b => {
    const list = allSold.filter(c => _dashAmount(c) >= b.min && _dashAmount(c) < b.max);
    return {...b, count: list.length};
  });
  const maxBand = Math.max(1, ...bandStat.map(b => b.count));
  const detailKpi = document.getElementById('dash-detail-kpi');
  if (detailKpi) {
    detailKpi.innerHTML = `
      <div style="font-size:12px;font-weight:600;margin-bottom:8px">ボディサイズ別 販売実績</div>
      ${Object.keys(sizeBreakdown).sort((a,b)=>sizeBreakdown[b].count-sizeBreakdown[a].count).map(k => {
        const s = sizeBreakdown[k];
        const pct = allSold.length ? Math.round(s.count / allSold.length * 100) : 0;
        return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px"><div style="width:80px">${k}</div><div style="flex:1"><div class="pbar" style="height:6px"><div class="pfill" style="width:${pct}%;background:var(--blue)"></div></div></div><div style="width:50px;text-align:right;color:var(--text3)">${s.count}台(${pct}%)</div></div>`;
      }).join('')}
      <div style="font-size:12px;font-weight:600;margin:12px 0 8px">価格帯別 販売実績</div>
      ${bandStat.map(b => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px"><div style="width:80px">${b.label}</div><div style="flex:1"><div class="pbar" style="height:6px"><div class="pfill" style="width:${Math.round(b.count/maxBand*100)}%;background:var(--green)"></div></div></div><div style="width:50px;text-align:right;color:var(--text3)">${b.count}台</div></div>`).join('')}
    `;
  }
}

// ========================================
// 警告サマリー
// ========================================
function renderWarningsSummary() {
  const el = document.getElementById('dash-warnings');
  if (!el) return;
  const tiers = appSettings.invWarn.filter(t => t.on);
  const delTiers = appSettings.delWarn.filter(t => t.on);
  const rows = [];
  tiers.forEach(t => {
    const list = cars.filter(c => c.col !== 'done' && !c.contract && daysSince(c.purchaseDate) >= t.days);
    if (list.length) rows.push(`<div style="display:flex;align-items:center;gap:9px;padding:6px 0;border-bottom:1px solid var(--border)"><div class="wr-dot" style="background:${t.color}"></div><div style="flex:1;font-size:12px">在庫${t.days}日以上・${t.label}</div><div style="font-size:12px;font-weight:700;color:${t.color}">${list.length}台</div></div>`);
  });
  delTiers.forEach(t => {
    const list = cars.filter(c => c.col !== 'done' && c.contract && c.deliveryDate && (()=>{const d=daysDiff(c.deliveryDate); return d!=null && d<=t.days && d>=0;})());
    if (list.length) rows.push(`<div style="display:flex;align-items:center;gap:9px;padding:6px 0;border-bottom:1px solid var(--border)"><div class="wr-dot" style="background:${t.color}"></div><div style="flex:1;font-size:12px">納車残${t.days}日以下・${t.label}</div><div style="font-size:12px;font-weight:700;color:${t.color}">${list.length}台</div></div>`);
  });
  el.innerHTML = rows.length ? rows.join('') : '<div style="font-size:13px;color:var(--text3);padding:8px 0">警告対象の車両はありません ✓</div>';
}

// ========================================
// 詳細トグル
// ========================================
function toggleDashDetail(key) {
  const el = document.getElementById('dash-detail-' + key);
  if (!el) return;
  el.classList.toggle('open');
}

// ========================================
// ダッシュボード全体
// ========================================
function renderDashboard() {
  if (!document.getElementById('stat-grid')) return;
  renderSummaryCards();
  // v1.7.2: 順序入れ替え — 全体タスクが上、要対応アクションが下
  if (typeof renderBoardNotes === 'function') renderBoardNotes();
  renderActionChips();
  renderLanding();
  renderKPIs();
  renderWarningsSummary();
}

// v1.7.2: 重要ビュー（タブ「📌 重要」用）— 全体タスク + 要対応アクションのみ表示
function renderOverview() {
  // 付箋は renderBoardNotes が #overview-board-notes-area にも描画する
  if (typeof renderBoardNotes === 'function') renderBoardNotes();
  // 要対応アクション
  const el = document.getElementById('overview-actions');
  if (el) {
    const chips = (typeof _buildActionChipsHtml === 'function') ? _buildActionChipsHtml() : [];
    el.innerHTML = chips.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:4px">${chips.join('')}</div>`
      : '<div style="font-size:13px;color:var(--text3);padding:8px 0">要対応アクションなし ✓</div>';
  }
}

// 操作ログパネル描画
// v1.7.31: 古い user 文字列も最新のスタッフ表示名に解決して表示する
function renderLogPanel() {
  document.getElementById('log-badge').style.display = 'none';
  const staffList = (typeof window._getBoardNotesStaffCache === 'function')
    ? (window._getBoardNotesStaffCache() || []) : [];
  const resolveByLog = (l) => {
    let uid = l && l.userUid;
    if (!uid && l && l.user && typeof _resolveStaffUidByName === 'function') {
      uid = _resolveStaffUidByName(l.user, staffList);
    }
    if (uid) {
      const s = staffList.find(x => x && x.uid === uid);
      if (s && typeof resolveStaffDisplayName === 'function') {
        return resolveStaffDisplayName(s, null);
      }
    }
    return (l && l.user) || '—';
  };
  document.getElementById('log-list').innerHTML = globalLogs.length
    ? globalLogs.map(l => `<div class="log-row"><span class="log-time">${l.time}</span><span class="log-user">${resolveByLog(l)}</span><span style="color:var(--text2)">${l.carNum} — ${l.action}</span></div>`).join('')
    : '<div style="font-size:13px;color:var(--text3)">ログなし</div>';
}

// メンバー一覧描画
// v1.5.5: Firestore staff コレクションから動的取得に切替（旧 MEMBERS 配列は廃止）
async function renderMembers() {
  const list = document.getElementById('member-list');
  if (!list) return;
  if (!window.dbStaff) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text3)">DB 未接続</div>';
    return;
  }
  list.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 0">読み込み中...</div>';
  try {
    const staffList = await window.dbStaff.loadAllStaff();
    if (!staffList.length) {
      list.innerHTML = '<div style="font-size:12px;color:var(--text3)">登録メンバーがいません</div>';
      return;
    }
    const roleLabels = { admin: '管理者', manager: 'マネージャ', staff: 'スタッフ', viewer: '閲覧のみ' };
    const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
    list.innerHTML = staffList.map(s => {
      const name = (typeof resolveStaffDisplayName === 'function') ? resolveStaffDisplayName(s, null) : (s.customDisplayName || s.displayName || '—');
      const photo = (typeof resolveStaffPhotoURL === 'function') ? resolveStaffPhotoURL(s, null) : (s.customPhotoURL || s.photoURL || null);
      const init = (typeof staffInitial === 'function') ? staffInitial(name) : String(name).slice(0, 2);
      const avHtml = photo
        ? `<div class="m-av" style="background-image:url('${esc(photo)}');background-size:cover;background-position:center;color:transparent">${esc(init)}</div>`
        : `<div class="m-av">${esc(init)}</div>`;
      const roleLabel = roleLabels[s.role] || s.role || 'スタッフ';
      const statusPill = (s.active === false)
        ? '<span class="pill" style="background:#666;color:#fff;margin-left:auto">無効</span>'
        : '<span class="pill pill-green" style="margin-left:auto">在席</span>';
      return `<div class="member-row">${avHtml}<div><div style="font-size:13px;font-weight:500">${esc(name)}</div><div style="font-size:11px;color:var(--text3)">${esc(roleLabel)}</div></div>${statusPill}</div>`;
    }).join('');
  } catch (err) {
    console.error('[renderMembers]', err);
    list.innerHTML = '<div style="font-size:12px;color:var(--red)">読み込みに失敗しました</div>';
  }
}
