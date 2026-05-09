// ========================================
// dashboard.js
// ダッシュボード：サマリーカード／要対応アクション／着地予測／販売KPI／警告
// ========================================

// --- サマリー4カード＋要対応アクション ---
function renderSummaryCards() {
  const total = cars.length;
  const active = cars.filter(c => c.col !== 'done').length;
  const contracted = cars.filter(c => c.contract).length;
  const done = cars.filter(c => c.col === 'done').length;
  document.getElementById('stat-grid').innerHTML = `
    <div class="stat-box"><div class="stat-num">${total}</div><div class="stat-label">総車両数</div></div>
    <div class="stat-box"><div class="stat-num" style="color:var(--orange)">${active}</div><div class="stat-label">管理中</div></div>
    <div class="stat-box"><div class="stat-num" style="color:var(--blue)">${contracted}</div><div class="stat-label">成約済み</div></div>
    <div class="stat-box"><div class="stat-num" style="color:var(--text3)">${done}</div><div class="stat-label">納車完了</div></div>`;
}

// v1.2.4: 共通関数。要対応アクションのチップHTML配列を返す。
// ダッシュボードC と 下部要対応エリア両方から使う。
function _buildActionChipsHtml() {
  const chips = [];
  const notif = appSettings.notif;
  cars.forEach(car => {
    if (car.col === 'done') return;
    // 納車直前
    if (notif.pre.on && car.contract && car.deliveryDate) {
      const d = daysDiff(car.deliveryDate);
      if (d !== null && d <= notif.pre.days && d >= 0) {
        chips.push(`<div class="chip chip-red" onclick="openDetail('${car.id}')"><span class="chip-dot"></span>🚨 ${car.maker} ${car.model} 納車${d===0?'本日':d+'日後'}</div>`);
      }
    }
    // 長期在庫
    if (notif.stock.on) {
      const inv = daysSince(car.purchaseDate);
      if (inv >= notif.stock.days) {
        chips.push(`<div class="chip chip-orange" onclick="openDetail('${car.id}')"><span class="chip-dot"></span>📦 ${car.maker} ${car.model} 在庫${inv}日</div>`);
      }
    }
    // v1.0.35: タスク期限超過（粒度2 — 車両ごとに集約）
    if (typeof getOverdueTasks === 'function') {
      const overdue = getOverdueTasks(car);
      if (overdue.length > 0) {
        const phase = overdue[0].kind === 'delivery' ? '納車' : '再生';
        const cnt = overdue.length;
        chips.push(`<div class="chip chip-red" onclick="openDetail('${car.id}')"><span class="chip-dot"></span>⚠ ${car.maker} ${car.model} ${phase}期限超過 ${cnt}件</div>`);
      }
    }
  });
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
    // 契約主義：当月売約済 = 確定、営業努力で追加可能 = 残日数×日次ペース
    const thisMonthContracted = [...cars, ...archivedCars].filter(c => {
      return c.contractDate && c.contractDate >= firstOfMonth && c.contractDate <= lastOfMonth;
    });
    const fixedCount = thisMonthContracted.length;
    const fixedSales = thisMonthContracted.reduce((s, c) => s + (Number(c.price)||0), 0);
    const pace = fixedCount / Math.max(1, dayOfMonth);
    const addMax = Math.round(pace * daysLeft);
    return {
      mode, goal, daysLeft, dayOfMonth, daysInMonth,
      fixed: {count: fixedCount, sales: fixedSales, label:'売約済'},
      likely: {count: 0, sales: 0, label:'—'},
      possible: {count: addMax, sales: Math.round(pace * daysLeft * (fixedSales/Math.max(1,fixedCount) || 0)), label:'残日数×ペース'},
      paceNote: `日次ペース ${pace.toFixed(2)}台/日、残${daysLeft}日`,
      predictLow: fixedCount,
      predictHigh: fixedCount + addMax,
    };
  }

  // delivery mode
  // ① 確定：col==='done' かつ deliveryDate が当月
  const fixedCars = [...cars, ...archivedCars].filter(c => c.col === 'done' && c.deliveryDate && c.deliveryDate >= firstOfMonth && c.deliveryDate <= lastOfMonth);
  const fixedCount = fixedCars.length;
  const fixedSales = fixedCars.reduce((s, c) => s + (Number(c.price)||0), 0);

  // ② 見込み：col in {'delivery','regen','exhibit','purchase'} かつ contract かつ deliveryDate が当月、かつ done ではない
  const likelyCars = cars.filter(c => c.col !== 'done' && c.contract && c.deliveryDate && c.deliveryDate >= firstOfMonth && c.deliveryDate <= lastOfMonth);
  const likelyCount = likelyCars.length;
  const likelySales = likelyCars.reduce((s, c) => s + (Number(c.price)||0), 0);

  // ③ 追加余地：残日数 − リードタイム = 今からまだ売約→納車に間に合う余地
  // 追加枠 (台)：過去実績の日次売約→納車ペースから概算。ここでは直近90日の納車済み台数/90 × (daysLeft - lead) とする
  let possibleCount = 0;
  let possibleSales = 0;
  const addSlots = Math.max(0, daysLeft - lead);
  if (addSlots > 0) {
    const since = new Date(now); since.setDate(since.getDate() - 90);
    const sinceStr = since.toISOString().split('T')[0];
    const recent = [...cars, ...archivedCars].filter(c => c.col === 'done' && c.deliveryDate && c.deliveryDate >= sinceStr);
    const dailyPace = recent.length / 90;
    possibleCount = Math.round(dailyPace * addSlots);
    const avgPrice = recent.length ? recent.reduce((s, c) => s + (Number(c.price)||0), 0) / recent.length : 0;
    possibleSales = Math.round(avgPrice * possibleCount);
  }
  const note = addSlots > 0
    ? `月末まで残${daysLeft}日 − 準備リードタイム${lead}日 ＝ 追加売約余地${addSlots}日`
    : `月末まで残${daysLeft}日 ≤ 準備リードタイム${lead}日。新規売約は来月スライドの可能性が高いです`;
  return {
    mode, goal, daysLeft, dayOfMonth, daysInMonth,
    fixed: {count: fixedCount, sales: fixedSales, label:'確定（納車完了）'},
    likely: {count: likelyCount, sales: likelySales, label:'見込み（売約済×当月納車予定）'},
    possible: {count: possibleCount, sales: possibleSales, label:'追加余地（営業努力枠）'},
    paceNote: note,
    predictLow: fixedCount + likelyCount,            // 見込みまで実現しても動かない
    predictHigh: fixedCount + likelyCount + possibleCount,
  };
}

function renderLanding() {
  const L = calcLanding();
  const g = L.goal;
  const el = document.getElementById('dash-landing');
  const totalGoalCount = g.count || 1;
  const totalGoalSales = g.sales || 1;

  // バー比率（台数ベース）
  const barMax = Math.max(totalGoalCount, L.predictHigh, 1);
  const pctFixed   = Math.min(100, L.fixed.count / barMax * 100);
  const pctLikely  = Math.min(100 - pctFixed, L.likely.count / barMax * 100);
  const pctPoss    = Math.min(100 - pctFixed - pctLikely, L.possible.count / barMax * 100);
  const pctRemain  = Math.max(0, 100 - pctFixed - pctLikely - pctPoss);

  const remainToGoal = Math.max(0, totalGoalCount - L.predictLow);
  const remainSalesToGoal = Math.max(0, totalGoalSales - (L.fixed.sales + L.likely.sales));

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div style="font-size:12px;color:var(--text2)">目標 ${totalGoalCount}台 / ${(totalGoalSales/10000).toFixed(0)}万円</div>
      <div style="font-size:11px;color:var(--text3)">${L.mode==='contract'?'売約時計上':'納車完了計上'}</div>
    </div>
    <div class="land-bar">
      ${L.fixed.count   ? `<div class="land-fixed"   style="width:${pctFixed}%"  title="${L.fixed.label}：${L.fixed.count}台">${L.fixed.count>0&&pctFixed>10?L.fixed.count+'台':''}</div>`   : ''}
      ${L.likely.count  ? `<div class="land-likely"  style="width:${pctLikely}%" title="${L.likely.label}：${L.likely.count}台">${L.likely.count>0&&pctLikely>10?L.likely.count+'台':''}</div>`  : ''}
      ${L.possible.count? `<div class="land-possible"style="width:${pctPoss}%"   title="${L.possible.label}：${L.possible.count}台">${L.possible.count>0&&pctPoss>10?L.possible.count+'台':''}</div>`: ''}
      ${pctRemain > 0   ? `<div class="land-remain"  style="width:${pctRemain}%">残${Math.max(0, totalGoalCount-L.predictHigh)}台</div>` : ''}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--text2);margin-bottom:10px">
      <span><span style="display:inline-block;width:10px;height:10px;background:#1db97a;border-radius:2px;vertical-align:middle;margin-right:4px"></span>確定 ${L.fixed.count}台</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#378ADD;border-radius:2px;vertical-align:middle;margin-right:4px"></span>見込み ${L.likely.count}台</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:2px;vertical-align:middle;margin-right:4px"></span>追加余地 ${L.possible.count}台</span>
    </div>
    <div class="kpi-grid">
      <div class="kpi-box"><div class="kpi-label">着地予測（レンジ）</div><div class="kpi-value">${L.predictLow}〜${L.predictHigh}<span style="font-size:12px;color:var(--text3)">台</span></div>
        <div class="kpi-sub">目標達成まで<strong style="color:${remainToGoal===0?'#6ee7b7':'#fcd34d'}">${remainToGoal}台</strong></div></div>
      <div class="kpi-box"><div class="kpi-label">売上見込み</div><div class="kpi-value">${((L.fixed.sales+L.likely.sales)/10000).toFixed(0)}<span style="font-size:12px;color:var(--text3)">万円</span></div>
        <div class="kpi-sub">目標まで ${(remainSalesToGoal/10000).toFixed(0)}万円</div></div>
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
  const inv = cars.filter(c => c.col !== 'done');
  const invAvgPrice = inv.length ? sumBy(inv, c => Number(c.price)||0) / inv.length : 0;

  // 全アーカイブ平均販売価格
  const allSold = [...archivedCars, ...cars.filter(c => c.col === 'done')];
  const avgSoldPrice = allSold.length ? sumBy(allSold, c => Number(c.price)||0) / allSold.length : 0;

  // 平均在庫日数（売れた車基準）
  const avgInvDays = allSold.length ? sumBy(allSold, c => {
    if (!c.purchaseDate || !c.deliveryDate) return 0;
    return Math.max(0, Math.floor((new Date(c.deliveryDate) - new Date(c.purchaseDate))/86400000));
  }) / allSold.length : 0;

  // 月次平均販売台数（アーカイブの年月ユニーク数で割る）
  const monthsSeen = new Set([...archivedCars.map(c => c._archivedYM || (c.deliveryDate?ymKey(c.deliveryDate):''))].filter(Boolean));
  const avgMonthlyCount = monthsSeen.size ? archivedCars.length / monthsSeen.size : 0;

  // 昨対比・先月比
  const yoy = lastYear.length ? Math.round((thisMonth.length - lastYear.length) / lastYear.length * 100) : null;
  const mom = lastMonth.length ? Math.round((thisMonth.length - lastMonth.length) / lastMonth.length * 100) : null;

  const pctLabel = v => v == null ? '—' : `${v>=0?'+':''}${v}%`;
  const pctClass = v => v == null ? '' : (v>=0 ? 'kpi-positive' : 'kpi-negative');

  const thisSales = sumBy(thisMonth, c => Number(c.price)||0);
  const lastSales = sumBy(lastMonth, c => Number(c.price)||0);
  const yearSales = sumBy(lastYear, c => Number(c.price)||0);
  const yoySales = yearSales ? Math.round((thisSales - yearSales)/yearSales*100) : null;
  const momSales = lastSales ? Math.round((thisSales - lastSales)/lastSales*100) : null;

  document.getElementById('dash-kpi').innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="kpi-label">今月の販売台数</div>
        <div class="kpi-value">${thisMonth.length}<span style="font-size:12px;color:var(--text3)">台</span></div>
        <div class="kpi-sub">売上 ${(thisSales/10000).toFixed(0)}万円</div>
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
        <div class="kpi-label">在庫平均価格</div>
        <div class="kpi-value">${(invAvgPrice/10000).toFixed(0)}<span style="font-size:12px;color:var(--text3)">万円</span></div>
        <div class="kpi-sub">現在${inv.length}台</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">売約平均価格</div>
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
    sizeBreakdown[k].sales += (Number(c.price)||0);
  });
  const priceBands = [
    {label:'〜100万', min:0, max:1000000},
    {label:'100〜200万', min:1000000, max:2000000},
    {label:'200〜300万', min:2000000, max:3000000},
    {label:'300万〜', min:3000000, max:Infinity},
  ];
  const bandStat = priceBands.map(b => {
    const list = allSold.filter(c => (Number(c.price)||0) >= b.min && (Number(c.price)||0) < b.max);
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
