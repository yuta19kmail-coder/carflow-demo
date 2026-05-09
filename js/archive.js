// ========================================
// archive.js
// 月次集計締め、販売実績ビュー、目標達成率表示
// ========================================

// ========================================
// 月次集計締めダイアログ
// ========================================
function openCloseMonthDialog() {
  const now = new Date();
  // 年セレクト（現在-3〜現在+1）
  const ys = document.getElementById('close-month-year');
  const years = [];
  for (let y = now.getFullYear()-3; y <= now.getFullYear()+1; y++) years.push(y);
  ys.innerHTML = years.map(y => `<option value="${y}"${y===now.getFullYear()?' selected':''}>${y}年</option>`).join('');
  // 月セレクト
  const ms = document.getElementById('close-month-month');
  ms.innerHTML = [1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
    // デフォルト：今月が1日なら先月、それ以外は今月
    const def = now.getMonth() + 1;
    return `<option value="${m}"${m===def?' selected':''}>${m}月</option>`;
  }).join('');
  ys.onchange = updateClosePreview;
  ms.onchange = updateClosePreview;
  updateClosePreview();
  document.getElementById('confirm-close-month').classList.add('open');
}
function closeCloseMonth() {
  document.getElementById('confirm-close-month').classList.remove('open');
}
function getCloseMonthTargets(y, m) {
  return cars.filter(c => {
    if (c.col !== 'done') return false;
    if (!c.deliveryDate) return false;
    const d = new Date(c.deliveryDate);
    return d.getFullYear() === y && (d.getMonth()+1) === m;
  });
}
function updateClosePreview() {
  const y = parseInt(document.getElementById('close-month-year').value, 10);
  const m = parseInt(document.getElementById('close-month-month').value, 10);
  const targets = getCloseMonthTargets(y, m);
  const el = document.getElementById('close-month-preview');
  if (!targets.length) {
    el.innerHTML = `<div style="color:var(--text3)">${y}年${m}月に納車完了した車両はありません</div>`;
    return;
  }
  const totalSales = targets.reduce((s, c) => s + (Number(c.price) || 0), 0);
  el.innerHTML = `<div style="font-weight:600;color:var(--text);margin-bottom:6px">対象 ${targets.length}台 / 売上 ${(totalSales/10000).toFixed(0)}万円</div>` +
    targets.map(c => `<div style="padding:3px 0;font-size:11px">・${c.maker} ${c.model} <span style="color:var(--text3)">(${c.num}) ${fmtPrice(c.price)}</span></div>`).join('');
}
function executeCloseMonth() {
  const y = parseInt(document.getElementById('close-month-year').value, 10);
  const m = parseInt(document.getElementById('close-month-month').value, 10);
  const targets = getCloseMonthTargets(y, m);
  if (!targets.length) {
    showToast(`${y}年${m}月に納車完了の車両はありません`);
    return;
  }
  const now = new Date();
  const closedAt = now.toISOString().split('T')[0];
  let photoDeletedCount = 0;
  targets.forEach(c => {
    c._archivedAt = closedAt;
    c._archivedYM = ymKeyFromYM(y, m);
    // v1.8.36: 月締め時に写真も削除（容量節約のため）
    //   - archivedCars ドキュメントから photo フィールドを除去（壊れたURL残さない）
    //   - Firebase Storage 上の写真ファイル本体も削除
    const hadPhoto = !!c.photo;
    if (hadPhoto) {
      c.photo = null;
      photoDeletedCount++;
    }
    archivedCars.push(c);
    addLog(c.id, `月次集計締め（${y}年${m}月）でアーカイブ` + (hadPhoto ? '・写真削除' : ''));
    // v1.5.3: archivedCars コレクションへ Firestore 保存
    if (window.dbArchive) {
      window.dbArchive.saveArchivedCar(c).catch(e => console.error('[archive] save failed', e));
    }
    // v1.8.36: Storage 上の写真ファイル本体を削除（手動削除フローと挙動を統一）
    if (hadPhoto && window.dbStorage && window.dbStorage.deleteCarPhoto) {
      window.dbStorage.deleteCarPhoto(c.id).catch(e => console.error('[archive] delete photo failed', e));
    }
  });
  // cars 配列から除去
  const ids = new Set(targets.map(c => c.id));
  for (let i = cars.length - 1; i >= 0; i--) {
    if (ids.has(cars[i].id)) cars.splice(i, 1);
  }
  // v1.5.1: Firestore の cars コレクションからも削除（v1.5.3 で archivedCars に移動済み）
  if (window.dbCars) {
    ids.forEach(id => {
      window.dbCars.deleteCar(id).catch(e => console.error('[archive] delete failed', e));
    });
  }
  closeCloseMonth();
  renderAll();
  renderDashboard();
  const photoMsg = photoDeletedCount > 0 ? `（写真${photoDeletedCount}枚も削除）` : '';
  showToast(`${y}年${m}月の${targets.length}台をアーカイブしました${photoMsg}`);
}

// ========================================
// 販売実績ビュー
// ========================================
function renderArchive() {
  const sum = document.getElementById('archive-summary');
  const list = document.getElementById('archive-list');
  if (!sum || !list) return;
  if (!archivedCars.length) {
    sum.innerHTML = '';
    list.innerHTML = '<div class="panel-card"><div style="font-size:13px;color:var(--text3)">まだアーカイブされた販売実績がありません。<br>左サイドバーの「月次集計締め」から開始できます。</div></div>';
    return;
  }
  // 年→月 に集計
  const byYear = {};
  archivedCars.forEach(c => {
    const key = c._archivedYM || (c.deliveryDate ? ymKey(c.deliveryDate) : '未分類');
    const [y, m] = key.split('-');
    if (!byYear[y]) byYear[y] = {};
    if (!byYear[y][m]) byYear[y][m] = [];
    byYear[y][m].push(c);
  });

  // サマリー（全期間）
  const totalCars = archivedCars.length;
  const totalSales = archivedCars.reduce((s, c) => s + (Number(c.price) || 0), 0);
  const avgInv = archivedCars.reduce((s, c) => {
    if (!c.purchaseDate || !c.deliveryDate) return s;
    return s + Math.max(0, Math.floor((new Date(c.deliveryDate) - new Date(c.purchaseDate))/86400000));
  }, 0) / (totalCars || 1);
  sum.innerHTML = `<div class="panel-card"><h3>累計サマリー</h3>
    <div class="kpi-grid">
      <div class="kpi-box"><div class="kpi-label">累計販売台数</div><div class="kpi-value">${totalCars}<span style="font-size:12px;color:var(--text3)">台</span></div></div>
      <div class="kpi-box"><div class="kpi-label">累計売上</div><div class="kpi-value">${(totalSales/10000).toFixed(0)}<span style="font-size:12px;color:var(--text3)">万円</span></div></div>
      <div class="kpi-box"><div class="kpi-label">平均販売価格</div><div class="kpi-value">${(totalSales/totalCars/10000).toFixed(0)}<span style="font-size:12px;color:var(--text3)">万円</span></div></div>
      <div class="kpi-box"><div class="kpi-label">平均在庫日数</div><div class="kpi-value">${Math.round(avgInv)}<span style="font-size:12px;color:var(--text3)">日</span></div></div>
    </div>
  </div>`;

  // 年→月
  const years = Object.keys(byYear).sort().reverse();
  list.innerHTML = years.map(y => {
    const months = Object.keys(byYear[y]).sort().reverse();
    const yearTotal = months.reduce((s, m) => s + byYear[y][m].reduce((ss, c) => ss + (Number(c.price)||0), 0), 0);
    const yearCount = months.reduce((s, m) => s + byYear[y][m].length, 0);
    const monthsHtml = months.map(m => {
      const list = byYear[y][m];
      const sales = list.reduce((s, c) => s + (Number(c.price)||0), 0);
      const goal = monthlyGoal(parseInt(y,10), parseInt(m,10));
      const salesPct = goal.sales ? Math.round(sales / goal.sales * 100) : 0;
      const countPct = goal.count ? Math.round(list.length / goal.count * 100) : 0;
      const salesHit = salesPct >= 100;
      const countHit = countPct >= 100;
      const carRows = list.sort((a,b) => (b.deliveryDate||'').localeCompare(a.deliveryDate||'')).map(c => {
        const inv = (c.purchaseDate && c.deliveryDate) ? Math.max(0, Math.floor((new Date(c.deliveryDate) - new Date(c.purchaseDate))/86400000)) : '—';
        return `<div class="arc-car-row">
          <span class="mono">${c.num}</span>
          <span style="color:var(--text)">${c.maker} ${c.model}</span>
          <span>${c.size||'—'}</span>
          <span>${Number(c.km||0).toLocaleString()}km</span>
          <span>${fmtPrice(c.price)}</span>
          <span style="text-align:right">在庫${inv}日</span>
        </div>`;
      }).join('');
      return `<div class="arc-month" data-month-open="0">
        <div class="arc-month-head" onclick="toggleArchiveMonth(this)">
          <span style="font-size:14px">▾</span>
          <div class="arc-month-title">${parseInt(m,10)}月</div>
          <div class="arc-month-stat">${list.length}台 / ${(sales/10000).toFixed(0)}万円</div>
          <span class="arc-achv ${salesHit?'hit':'miss'}" title="売上目標">売${salesPct}%</span>
          <span class="arc-achv ${countHit?'hit':'miss'}" title="台数目標">台${countPct}%</span>
        </div>
        <div style="font-size:11px;color:var(--text3);padding:4px 0 6px">
          目標：${(goal.sales/10000).toFixed(0)}万円 / ${goal.count}台　実績：${(sales/10000).toFixed(0)}万円 / ${list.length}台
        </div>
        <div class="arc-cars" style="display:none">
          <div class="arc-car-row" style="color:var(--text3);font-weight:600;font-size:10px;border-bottom:1px solid var(--border)">
            <span>管理番号</span><span>車両</span><span>ボディ</span><span>走行距離</span><span>販売価格</span><span style="text-align:right">在庫日数</span>
          </div>
          ${carRows}
        </div>
      </div>`;
    }).join('');
    return `<div class="arc-year">
      <div class="arc-year-head" onclick="toggleArchiveYear(this)">
        <h3>${y}年</h3>
        <div style="font-size:12px;color:var(--text3)">${yearCount}台 / ${(yearTotal/10000).toFixed(0)}万円</div>
      </div>
      <div class="arc-year-body">${monthsHtml}</div>
    </div>`;
  }).join('');
}
function toggleArchiveYear(head) {
  const body = head.nextElementSibling;
  body.style.display = body.style.display === 'none' ? 'block' : 'none';
}
function toggleArchiveMonth(head) {
  // v1.8.38: nextElementSibling は「目標vs実績の薄字行」を指してしまっていたバグを修正。
  //          親 .arc-month を辿って、その中の .arc-cars を対象にする。
  const parent = head.closest('.arc-month');
  if (!parent) return;
  const body = parent.querySelector('.arc-cars');
  if (!body) return;
  body.style.display = body.style.display === 'none' ? 'block' : 'none';
}
