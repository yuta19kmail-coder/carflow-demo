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
/* 🔴 2026-08-05 修正：月次集計締めは「実績へコピー」と「在庫から削除」を
   **成功したか確かめずに同時に**走らせていた。実績への保存が失敗して削除だけ通ると、
   **売れた1台が実績にも在庫にも無くなる（完全に消える）**のに「◯台をアーカイブしました」と出ていた。
   🔴 決めごと＝**1台ずつ「実績に入ったこと」を確かめてから、その台だけ在庫から消す。**
      失敗した台は在庫に残す＝データは絶対に失わない。何台できて何台できなかったかを画面に出す。 */
async function executeCloseMonth() {
  const y = parseInt(document.getElementById('close-month-year').value, 10);
  const m = parseInt(document.getElementById('close-month-month').value, 10);
  const targets = getCloseMonthTargets(y, m);
  if (!targets.length) {
    showToast(`${y}年${m}月に納車完了の車両はありません`);
    return;
  }
  const now = new Date();
  const closedAt = now.toISOString().split('T')[0];
  targets.forEach(c => {
    c._archivedAt = closedAt;
    c._archivedYM = ymKeyFromYM(y, m);
    // v2.1.0: 月締め時の写真即削除を撤廃。
    //   旧 v1.8.36 では archivedCars 移動と同時に photo を null 化していたが、
    //   バックオフィスビュー（書類スキャン等）で archive 後も写真が必要なため、
    //   _archivedAt から 90日経過後に backoffice.js の cleanupExpiredArchivedPhotos
    //   で自動削除する方式に変更した。
  });

  /* ① 実績へコピー（1台ずつ結果を見る）。成功した台だけ次に進む。 */
  const moved = [], failed = [];
  for (const c of targets) {
    if (window.dbArchive && window.dbArchive.saveArchivedCar) {
      try {
        await window.dbArchive.saveArchivedCar(c, { initial: true });   // v3.0.0 締める時だけ実績を書き込む
      } catch (e) {
        console.error('[archive] 実績への保存に失敗', c.num, e);
        failed.push(c);
        continue;                       /* ⚠ この台は在庫に残す＝消さない */
      }
    }
    archivedCars.push(c);
    addLog(c.id, `月次集計締め（${y}年${m}月）でアーカイブ`);
    moved.push(c);
  }

  /* ② 実績に入ったことを確かめた台だけ、在庫から消す。 */
  const okIds = new Set(moved.map(c => c.id));
  const notDeleted = [];
  if (window.dbCars && window.dbCars.deleteCar) {
    for (const c of moved) {
      try {
        await window.dbCars.deleteCar(c.id);
      } catch (e) {
        /* 実績には入っているので数字は正しい。在庫にも残るので二重に見えるだけ。 */
        console.error('[archive] 在庫からの削除に失敗', c.num, e);
        okIds.delete(c.id);
        notDeleted.push(c);
      }
    }
  }
  for (let i = cars.length - 1; i >= 0; i--) {
    if (okIds.has(cars[i].id)) cars.splice(i, 1);
  }
  closeCloseMonth();
  // v2.1.0: 締めボタン押下時に 90日超え archived の写真をクリーンアップ
  let cleanedCount = 0;
  if (window.backoffice && typeof window.backoffice.cleanupExpiredArchivedPhotos === 'function') {
    try { cleanedCount = window.backoffice.cleanupExpiredArchivedPhotos() || 0; } catch (e) { console.error('[archive] cleanup failed', e); }
  }
  renderAll();
  renderDashboard();
  const cleanedMsg = cleanedCount > 0 ? `（同時に古い写真${cleanedCount}枚をクリーンアップ）` : '';
  /* 🔴 「できた数」を正直に出す。全部できた時だけ今までどおりの文言。 */
  if (failed.length || notDeleted.length) {
    let msg = `${y}年${m}月：${moved.length}台をアーカイブしました`;
    if (failed.length)     msg += `／${failed.length}台は実績に移せませんでした（在庫に残しています・もう一度お試しください）`;
    if (notDeleted.length) msg += `／${notDeleted.length}台は在庫から消せませんでした（実績には入っています）`;
    showToast(msg);
    console.warn('[archive] 実績へ移せなかった:', failed.map(c => c.num),
                 '／在庫から消せなかった:', notDeleted.map(c => c.num));
  } else {
    showToast(`${y}年${m}月の${moved.length}台をアーカイブしました${cleanedMsg}`);
  }
}

// ========================================
// 販売実績ビュー
// ========================================
/* 🔴 2026-09-08（v2.55.0）実績と在庫の両方に残っている車を、販売実績の一番上に出す。
   ＝ 月次締めで「実績には入ったが、在庫から消せなかった」台。
   放っておくと**ダッシュボードの数字が二重に見える元**になる（数字自体は soldPool で1回に直してある）。
   直し方＝**その月の月次締めをもう一度実行する**。実績は同じ内容で上書きされ、在庫から消える。 */
function _archDupBarHtml() {
  const dup = (typeof soldDupCars === 'function') ? soldDupCars() : [];
  if (!dup.length) return '';
  const names = dup.map(c => `${escapeHtml(c.num || '')} ${escapeHtml(c.maker || '')} ${escapeHtml(c.model || '')}`).join('／');
  return `<div class="panel-card" style="border:1px solid var(--orange);background:rgba(245,158,11,.10);margin-bottom:12px">
      <div style="font-size:13px;font-weight:700;color:var(--orange);margin-bottom:4px">
        ⚠ ${dup.length}台が「実績」と「在庫」の両方に残っています</div>
      <div style="font-size:12px;line-height:1.7">
        月次締めで<b>実績には入りましたが、在庫から消せませんでした</b>。<br>
        ${names}<br>
        <b>直し方＝その月の「月次集計締め」をもう一度実行してください。</b>
        （実績は同じ内容で上書きされ、在庫から消えます）<br>
        <span style="color:var(--text3)">※ 表示している売上・台数は、同じ車を1回だけ数えています。</span>
      </div></div>`;
}

function renderArchive() {
  const sum = document.getElementById('archive-summary');
  const list = document.getElementById('archive-list');
  if (!sum || !list) return;
  const dupBar = _archDupBarHtml();
  if (!archivedCars.length) {
    sum.innerHTML = '';
    list.innerHTML = dupBar + '<div class="panel-card"><div style="font-size:13px;color:var(--text3)">まだアーカイブされた販売実績がありません。<br>左サイドバーの「月次集計締め」から開始できます。</div></div>';
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

  // v1.8.71: 各車のスナップショットを使って表示モードに換算して集計
  const ps = (typeof appSettings !== 'undefined' && appSettings.priceTax) || {};
  const dashMode   = (ps.dashboard === 'excl') ? 'excl' : 'incl';
  const dashSource = (ps.dashboardSource === 'total') ? 'total' : 'body';
  const dashTaxLbl = (dashMode === 'excl') ? '税抜' : '税込';
  const sumCar = c => (typeof _amountFromCarWithSnapshot === 'function')
    ? _amountFromCarWithSnapshot(c, dashSource, dashMode)
    : (Number(c.price) || 0);

  // サマリー（全期間）
  const totalCars = archivedCars.length;
  const totalSales = archivedCars.reduce((s, c) => s + sumCar(c), 0);
  const avgInv = archivedCars.reduce((s, c) => {
    if (!c.purchaseDate || !c.deliveryDate) return s;
    return s + Math.max(0, Math.floor((new Date(c.deliveryDate) - new Date(c.purchaseDate))/86400000));
  }, 0) / (totalCars || 1);
  sum.innerHTML = `<div class="panel-card"><h3>累計サマリー <span style="font-size:10px;color:var(--text3);font-weight:400;margin-left:6px">金額は全て${dashTaxLbl}換算（${dashSource==='total'?'総額':'本体価格'}ベース／各車の販売時税率で計算）</span></h3>
    <div class="kpi-grid">
      <div class="kpi-box"><div class="kpi-label">累計販売台数</div><div class="kpi-value">${totalCars}<span style="font-size:12px;color:var(--text3)">台</span></div></div>
      <div class="kpi-box"><div class="kpi-label">累計売上 <span style="font-size:9px;color:var(--text3)">（${dashTaxLbl}）</span></div><div class="kpi-value">${(totalSales/10000).toFixed(0)}<span style="font-size:12px;color:var(--text3)">万円</span></div></div>
      <div class="kpi-box"><div class="kpi-label">平均販売価格 <span style="font-size:9px;color:var(--text3)">（${dashTaxLbl}）</span></div><div class="kpi-value">${(totalSales/totalCars/10000).toFixed(0)}<span style="font-size:12px;color:var(--text3)">万円</span></div></div>
      <div class="kpi-box"><div class="kpi-label">平均在庫日数</div><div class="kpi-value">${Math.round(avgInv)}<span style="font-size:12px;color:var(--text3)">日</span></div></div>
    </div>
  </div>`;

  // 年→月（v1.8.71: スナップショット考慮の sumCar を使う）
  const years = Object.keys(byYear).sort().reverse();
  list.innerHTML = dupBar + years.map(y => {
    const months = Object.keys(byYear[y]).sort().reverse();
    const yearTotal = months.reduce((s, m) => s + byYear[y][m].reduce((ss, c) => ss + sumCar(c), 0), 0);
    const yearCount = months.reduce((s, m) => s + byYear[y][m].length, 0);
    const monthsHtml = months.map(m => {
      const list = byYear[y][m];
      const sales = list.reduce((s, c) => s + sumCar(c), 0);
      const goal = monthlyGoal(parseInt(y,10), parseInt(m,10));
      const salesPct = goal.sales ? Math.round(sales / goal.sales * 100) : 0;
      const countPct = goal.count ? Math.round(list.length / goal.count * 100) : 0;
      const salesHit = salesPct >= 100;
      const countHit = countPct >= 100;
      const carRows = list.sort((a,b) => (b.deliveryDate||'').localeCompare(a.deliveryDate||'')).map(c => {
        const inv = (c.purchaseDate && c.deliveryDate) ? Math.max(0, Math.floor((new Date(c.deliveryDate) - new Date(c.purchaseDate))/86400000)) : '—';
        // v1.8.71: 表示モードへ換算した金額。当時のスナップショット税率で算出。
        const conv = sumCar(c);
        const snap = (typeof getCarPriceTax === 'function') ? getCarPriceTax(c) : null;
        const snapNote = snap
          ? `<span style="font-size:9px;color:var(--text3);margin-left:4px" title="販売時の税扱い：${dashSource==='total'?'総額':'本体'}=${(dashSource==='total'?snap.total:snap.body)==='excl'?'税抜':'税込'}／税率${snap.rate}%${snap.capturedAt?'／'+snap.capturedAt:''}">${ic('clipboard','📋',16)}</span>`
          : '';
        // v1.8.72: オーダー車両は在庫日数欄に「オーダー車両」表記
        const invDisp = c.isOrder
          ? `<span style="color:#c084fc;font-weight:600" title="オーダー車両：在庫としてカウントしない">${ic('box','📦',16)} オーダー</span>`
          : `在庫${inv}日`;
        const orderMark = c.isOrder ? '<span style="font-size:9px;color:#c084fc;margin-left:4px" title="オーダー車両">'+ic('box','📦',16)+'</span>' : '';
        const custName = (typeof formatCustomerName === 'function') ? formatCustomerName(c.customerName) : (c.customerName || '');
        const custCell = custName
          ? `<span class="arc-cust" title="${(typeof escapeHtml==='function')?escapeHtml(custName):custName}">${(typeof escapeHtml==='function')?escapeHtml(custName):custName}</span>`
          : `<span style="color:var(--text3)">—</span>`;
        return `<div class="arc-car-row">
          <span class="mono">${c.num}${orderMark}</span>
          <span>${custCell}</span>
          <span style="color:var(--text)">${c.maker} ${c.model}${c.grade?' '+c.grade:''}</span>
          <span>${c.size||'—'}</span>
          <span>${Number(c.km||0).toLocaleString()}km</span>
          <span>${(conv/10000).toFixed(1)}万円${snapNote}</span>
          <span style="text-align:right">${invDisp}</span>
        </div>`;
      }).join('');
      return `<div class="arc-month" data-month-open="0">
        <div class="arc-month-head" onclick="toggleArchiveMonth(this)">
          <span style="font-size:14px">▾</span>
          <div class="arc-month-title">${parseInt(m,10)}月</div>
          <div class="arc-month-stat">${list.length}台 / ${(sales/10000).toFixed(0)}万円</div>
          <span class="arc-achv ${salesHit?'hit':'miss'}" title="売上目標">売${salesPct}%</span>
          <span class="arc-achv ${countHit?'hit':'miss'}" title="台数目標">台${countPct}%</span>
          <button class="arc-print-btn" onclick="event.stopPropagation(); if(window.forecastPrint) window.forecastPrint.open('month','0',${y},${parseInt(m,10)})" title="この月のレポートを印刷">${ic('printer','🖨',16)}</button>
        </div>
        <div style="font-size:11px;color:var(--text3);padding:4px 0 6px">
          目標：${(goal.sales/10000).toFixed(0)}万円 / ${goal.count}台　実績：${(sales/10000).toFixed(0)}万円 / ${list.length}台
        </div>
        <div class="arc-cars" style="display:none">
          <div class="arc-car-row" style="color:var(--text3);font-weight:600;font-size:10px;border-bottom:1px solid var(--border)">
            <span>管理番号</span><span>顧客名</span><span>車両</span><span>ボディ</span><span>走行距離</span><span>販売価格（${dashTaxLbl}換算）</span><span style="text-align:right">在庫日数</span>
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
