// ========================================
// forecast-print.js (v1.8.83→v1.8.86)
// 着地予測の印刷オーバーレイ
// ----------------------------------------
// 3デザイン切替トグル（A/B/C）付き
// A：クラシック（現行PDF踏襲・罫線テーブル）
// B：CarFlow風モダン（角丸ボックス・緑アクセント）
// C：ミニマル（罫線最小・大きな数字）
// ----------------------------------------
// 装備品印刷シート（equipment-view.js）と同じ方式
// 印刷時は @media print で他要素を隠す
// PDFはhtml2pdf.js
// ========================================

(function(){
  'use strict';

  let overlayEl = null;
  let currentData = null;
  let currentDesign = 'A';

  function _ensureOverlay(){
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.id = 'forecast-print-overlay';
    overlayEl.innerHTML = `
      <div class="fp-controls" data-no-print="1">
        <div class="fp-design-toggle">
          <span style="font-size:11px;color:#888">📐 デザイン:</span>
          <button type="button" data-design="A" onclick="window.forecastPrint.setDesign('A')">A クラシック</button>
          <button type="button" data-design="B" onclick="window.forecastPrint.setDesign('B')">B モダン</button>
          <button type="button" data-design="C" onclick="window.forecastPrint.setDesign('C')">C ミニマル</button>
        </div>
        <div style="flex:1"></div>
        <button type="button" class="fp-pdf-btn" onclick="window.forecastPrint.doPdf()">📥 PDF</button>
        <button type="button" class="fp-print-btn" onclick="window.forecastPrint.doPrint()">🖨 印刷</button>
        <button type="button" class="fp-close-btn" onclick="window.forecastPrint.close()">✕ 閉じる</button>
      </div>
      <div class="fp-sheet-wrap">
        <div class="fp-sheet" id="fp-sheet" data-design="A"></div>
      </div>
    `;
    document.body.appendChild(overlayEl);
    // ESC で閉じる
    document.addEventListener('keydown', function(ev){
      if (overlayEl && overlayEl.classList.contains('open') && ev.key === 'Escape'){
        if (!ev.target || ev.target.tagName !== 'INPUT') close();
      }
    });
  }

  function _fmtYen(n){
    // v1.8.86: 税モード逆算で小数になるケースを Math.round() で整数化
    return '¥' + Math.round(Number(n)||0).toLocaleString();
  }
  function _fmtThousand(yen){
    return Math.round((Number(yen)||0) / 1000).toLocaleString();
  }
  function _todayJa(){
    const d = new Date();
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
  }
  function _carName(c){
    const parts = [];
    if (c.maker) parts.push(c.maker);
    if (c.model) parts.push(c.model);
    return parts.join(' ') || (c.num || '(無名車)');
  }

  // ===== 左列：納車完了の車両リスト（販売実績）=====
  function _buildLeftList(data){
    const cars = (data.thisPeriodCars || []).slice();
    cars.sort((a,b) => (a.deliveryDate||'').localeCompare(b.deliveryDate||''));
    return cars;
  }
  // ===== 右列：同期間の仕入＋店頭展示の車両リスト（v1.8.92 新設） =====
  function _buildRightLists(data){
    // 仕入：purchaseDate が期間内
    const purchase = (data.lists && data.lists.purchase) ? data.lists.purchase.slice() : [];
    purchase.sort((a,b) => (a.purchaseDate||'').localeCompare(b.purchaseDate||''));
    // 店頭展示：exhibitedAt が期間内
    const exhibit = (data.lists && data.lists.exhibit) ? data.lists.exhibit.slice() : [];
    exhibit.sort((a,b) => {
      const da = window.periodStats.carExhibitedAt(a) || '';
      const db = window.periodStats.carExhibitedAt(b) || '';
      return da.localeCompare(db);
    });
    return { purchase, exhibit };
  }

  // ===== 着地予想ブロック生成 =====
  // v1.8.105: 確定（fixed）が目標到達 → 緑バーが金に変わる
  function _buildLandingBlock(L, monthLabel){
    // 台数バー
    const goalCount = Math.max(1, L.goalCount || 1);
    const fixedOverCount = L.fixed.count > goalCount;
    const overCnt = Math.max(0, L.fixed.count - goalCount);
    const overCntRatio = overCnt / goalCount * 100;
    let cntFx, cntLk, cntPs, cntRm;
    if (fixedOverCount){
      cntFx = 100; cntLk = 0; cntPs = 0; cntRm = 0;
    } else {
      cntFx  = Math.min(100, L.fixed.count / goalCount * 100);
      cntLk  = Math.min(100 - cntFx, L.likely.count / goalCount * 100);
      cntPs  = Math.min(100 - cntFx - cntLk, L.possible.count / goalCount * 100);
      cntRm  = Math.max(0, 100 - cntFx - cntLk - cntPs);
    }
    const cntRemainToGoal = Math.max(0, goalCount - L.predictHigh);

    // 売上バー
    const goalSalesYen = Math.max(1, L.goalSalesYen || 1);
    const fxSales = Math.round(L.fixed.sales);
    const lkSales = Math.round(L.likely.sales);
    const psSales = Math.round(L.possible.sales);
    const predictHighSales = fxSales + lkSales + psSales;
    const predictLowSales  = fxSales + lkSales;
    const fixedOverSales = fxSales > goalSalesYen;
    const overSales = Math.max(0, fxSales - goalSalesYen);
    const overSalesRatio = overSales / goalSalesYen * 100;
    let slFx, slLk, slPs, slRm;
    if (fixedOverSales){
      slFx = 100; slLk = 0; slPs = 0; slRm = 0;
    } else {
      slFx = Math.min(100, fxSales / goalSalesYen * 100);
      slLk = Math.min(100 - slFx, lkSales / goalSalesYen * 100);
      slPs = Math.min(100 - slFx - slLk, psSales / goalSalesYen * 100);
      slRm = Math.max(0, 100 - slFx - slLk - slPs);
    }
    const salesRemainToGoal = Math.max(0, goalSalesYen - predictHighSales);

    function _segCount(pct, val){ return pct > 12 ? `${val}台` : ''; }
    function _segSales(pct, yen){ return pct > 14 ? `${Math.round(yen/10000)}万` : ''; }

    return `
      <div class="fp-landing-block">
        <div class="fp-landing-title">${monthLabel ? monthLabel + '月 ' : ''}着地予想</div>

        <div class="fp-bar-row">
          <div class="fp-bar-label">台数</div>
          <div class="fp-landing-bar-row" style="display:flex;gap:1px;align-items:stretch;flex:1;min-width:0">
            <div class="fp-landing-bar" style="flex:100;min-width:0">
              ${fixedOverCount
                ? `<div class="fp-land-overshoot" style="width:100%">${goalCount}台 ✨</div>`
                : `
                  ${L.fixed.count    ? `<div class="fp-land-fixed"    style="width:${cntFx}%">${_segCount(cntFx, L.fixed.count)}</div>` : ''}
                  ${L.likely.count   ? `<div class="fp-land-likely"   style="width:${cntLk}%">${_segCount(cntLk, L.likely.count)}</div>` : ''}
                  ${L.possible.count ? `<div class="fp-land-possible" style="width:${cntPs}%">${_segCount(cntPs, L.possible.count)}</div>` : ''}
                  ${cntRm > 0        ? `<div class="fp-land-remain"   style="width:${cntRm}%">${cntRemainToGoal > 0 ? '残'+cntRemainToGoal+'台' : ''}</div>` : ''}
                `
              }
            </div>
            ${fixedOverCount && overCnt > 0 ? `<div class="fp-land-overshoot" style="flex:${overCntRatio};min-width:28px">+${overCnt}</div>` : ''}
          </div>
          <div class="fp-bar-value">${L.predictLow}〜${L.predictHigh}台 / ${goalCount}台${fixedOverCount?' ✨':''}</div>
        </div>

        <div class="fp-bar-row">
          <div class="fp-bar-label">売上</div>
          <div class="fp-landing-bar-row" style="display:flex;gap:1px;align-items:stretch;flex:1;min-width:0">
            <div class="fp-landing-bar" style="flex:100;min-width:0">
              ${fixedOverSales
                ? `<div class="fp-land-overshoot" style="width:100%">${Math.round(goalSalesYen/10000)}万 ✨</div>`
                : `
                  ${fxSales ? `<div class="fp-land-fixed"    style="width:${slFx}%">${_segSales(slFx, fxSales)}</div>` : ''}
                  ${lkSales ? `<div class="fp-land-likely"   style="width:${slLk}%">${_segSales(slLk, lkSales)}</div>` : ''}
                  ${psSales ? `<div class="fp-land-possible" style="width:${slPs}%">${_segSales(slPs, psSales)}</div>` : ''}
                  ${slRm > 0 ? `<div class="fp-land-remain"   style="width:${slRm}%">${salesRemainToGoal > 0 ? '残'+Math.round(salesRemainToGoal/10000)+'万' : ''}</div>` : ''}
                `
              }
            </div>
            ${fixedOverSales && overSales > 0 ? `<div class="fp-land-overshoot" style="flex:${overSalesRatio};min-width:36px">+${Math.round(overSales/10000)}万</div>` : ''}
          </div>
          <div class="fp-bar-value">${Math.round(predictLowSales/10000).toLocaleString()}〜${Math.round(predictHighSales/10000).toLocaleString()}万 / ${Math.round(goalSalesYen/10000).toLocaleString()}万${fixedOverSales?' ✨':''}</div>
        </div>

        <div class="fp-landing-legend">
          <span><i class="dot dot-fixed"></i>確定 ${L.fixed.count}台</span>
          <span><i class="dot dot-likely"></i>見込み ${L.likely.count}台</span>
          <span><i class="dot dot-possible"></i>実績予測 ${L.possible.count}台</span>
        </div>
      </div>
    `;
  }

  // ===== シートHTML生成 =====
  function _buildSheetHtml(data){
    // v1.8.92: 左=納車完了リスト、右=仕入＋店頭展示リスト
    const leftCars = _buildLeftList(data);
    const rightLists = _buildRightLists(data);
    const dashTax = (typeof getTaxLabel === 'function') ? getTaxLabel('dashboard') : '税込';

    const goalCount = data.goal.count || 1;
    const goalSalesYen = data.sales.goalYen;
    const goalSalesThousand = Math.round(goalSalesYen / 1000);
    const actualThousand = Math.round(data.sales.actualYen / 1000);
    const salesDiff = actualThousand - goalSalesThousand;
    const salesPct = goalSalesThousand > 0 ? Math.round(actualThousand / goalSalesThousand * 100) : 0;

    function row(label, actual, goal, unit){
      const diff = actual - goal;
      const pct = goal > 0 ? Math.round(actual / goal * 100) : 0;
      const diffCls = diff < 0 ? 'neg' : (diff > 0 ? 'pos' : '');
      const diffStr = diff > 0 ? `+${diff}` : String(diff);
      return `
        <tr class="fp-kpi-row">
          <td class="fp-kpi-label">${label}</td>
          <td class="fp-kpi-actual">${actual}<span class="fp-kpi-unit"> / ${goal} ${unit}</span></td>
          <td class="fp-kpi-diff ${diffCls}">${diffStr}</td>
          <td class="fp-kpi-pct">${pct}%</td>
        </tr>
      `;
    }

    // v1.8.99: 件数分だけ表示。呼び出し側で <ul> に two-col クラスを付与してCSSで2列化
    function carListHtml(items /* maxRows は無視 */){
      if (!items.length) return `<li class="fp-col-empty">対象なし</li>`;
      return items.map(c => {
        const amt = (typeof _dashAmount === 'function') ? _dashAmount(c) : (Number(c.price)||0);
        return `<li><span class="fp-car-name">${_carName(c)}</span><span class="fp-car-price">${_fmtYen(amt)}</span></li>`;
      }).join('');
    }
    function _dateListItems(items, dateGetter){
      if (!items.length) return `<li class="fp-col-empty">対象なし</li>`;
      return items.map(c => {
        const d = dateGetter ? dateGetter(c) : '';
        const dStr = (d || '').slice(5).replace('-','/');
        return `<li class="fp-col-item"><span class="fp-car-name">${_carName(c)}</span><span class="fp-col-date">${dStr}</span></li>`;
      }).join('');
    }
    // v1.8.101: 2列折り返しを廃止。行数増えても1列のまま、PDF/印刷時は2ページ目に自然継続
    const _twoColCls = () => '';
    const sumLeft = leftCars.reduce((s,c) => s + ((typeof _dashAmount === 'function') ? _dashAmount(c) : (Number(c.price)||0)), 0);

    const nextPid = window.periodStats.nextPeriod(data.mode, data.periodId, data.year, data.month);
    const nextCount = (data.nextPeriodCars||[]).length;
    const nextSalesThousand = Math.round(data.nextPeriodSales / 1000);
    const tentativeSalesThousand = Math.round(data.tentativeSales / 1000);
    // v1.8.87: tentGoal は「円」単位なので、千円表示に変換
    const tentGoalYen = (data.goal.salesYen || 0) + (data.nextGoal.salesYen || 0);
    const tentGoalThousand = Math.round(tentGoalYen / 1000);
    const tentGoalCount = (data.goal.count || 0) + (data.nextGoal.count || 0);

    // 着地予想（CarFlow特有）— v1.8.88: 期間プルダウンに関わらず月次固定で算出
    // 半期・週次の細かい区切りでは「見込み」「実績予測」がリードタイム14日と噛み合わず実用上意味が薄いため
    const L = (window.periodStats && window.periodStats.calcLandingForPeriod)
      ? window.periodStats.calcLandingForPeriod('month', '0', data.year, data.month)
      : null;
    const landingBlock = L ? _buildLandingBlock(L, data.month) : '';

    // v1.8.99: 来期 or スライド車両（後期/月次/週次4週目はスライド）
    // v1.8.100: ラベルは説明なしの1行表記
    const isSlide = !!data.isLastInUnit;
    const slideCount = (data.slideList || []).length;
    const slideThousand = Math.round((data.slideSales || 0) / 1000);
    const nextLabel = isSlide ? 'スライド車両' : '来期予定';
    const nextDisplayCount = isSlide ? slideCount : nextCount;
    const nextDisplaySales = isSlide ? slideThousand : nextSalesThousand;
    const nextDisplayList = isSlide ? (data.slideList || []) : (data.nextPeriodCars || []);

    return `
      <div class="fp-header">
        <h1 class="fp-title">車販部門　<span class="fp-title-month">${data.month}月</span> <span class="fp-title-period">${data.mode === 'month' ? '月次' : (data.mode === 'half' ? (data.periodId === '1' ? '1/2期' : '2/2期') : `${data.periodId}週目`)} 結果</span></h1>
        <div class="fp-date">${_todayJa()}</div>
      </div>

      ${landingBlock}

      <div class="fp-section-title">${data.shortLabel}</div>

      <table class="fp-kpi-table">
        <tbody>
          <tr class="fp-kpi-row fp-kpi-row-sales">
            <td class="fp-kpi-label">売上実績（千円）</td>
            <td class="fp-kpi-actual">${actualThousand.toLocaleString()}<span class="fp-kpi-unit"> / ${goalSalesThousand.toLocaleString()} 千円</span></td>
            <td class="fp-kpi-diff ${salesDiff < 0 ? 'neg' : (salesDiff > 0 ? 'pos' : '')}">${salesDiff > 0 ? '+' : ''}${salesDiff.toLocaleString()}</td>
            <td class="fp-kpi-pct">${salesPct}%</td>
          </tr>
          ${row('仕入台数（台）',     data.counts.purchase, data.goal.count, '台')}
          ${row('店頭展示台数（台）', data.counts.exhibit,  data.goal.count, '台')}
          ${row('納車完了台数（台）', data.counts.delivery, data.goal.count, '台')}
        </tbody>
      </table>

      <div class="fp-tentative-block">
        <div class="fp-section-title">当期実績＋${nextLabel}</div>
        <table class="fp-kpi-table">
          <tbody>
            <tr class="fp-kpi-row">
              <td class="fp-kpi-label">当期実績額（千円）／台数</td>
              <td class="fp-kpi-actual" colspan="3">${actualThousand.toLocaleString()} <span class="fp-kpi-unit">千円 / ${data.counts.delivery} 台</span></td>
            </tr>
            <tr class="fp-kpi-row">
              <td class="fp-kpi-label">${nextLabel}</td>
              <td class="fp-kpi-actual" colspan="3">${nextDisplaySales.toLocaleString()} <span class="fp-kpi-unit">千円 / ${nextDisplayCount} 台</span></td>
            </tr>
            <tr class="fp-kpi-row fp-kpi-row-emph">
              <td class="fp-kpi-label">暫定売上額（千円）／目標</td>
              <td class="fp-kpi-actual" colspan="3">${tentativeSalesThousand.toLocaleString()} <span class="fp-kpi-unit">千円 / ${tentGoalThousand.toLocaleString()} 千円</span></td>
            </tr>
            <tr class="fp-kpi-row fp-kpi-row-emph">
              <td class="fp-kpi-label">暫定販売台数／目標</td>
              <td class="fp-kpi-actual" colspan="3">${(data.tentativeCount).toLocaleString()} <span class="fp-kpi-unit">台 / ${tentGoalCount} 台</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- v1.8.99: 車両一覧3枠は一番下、紙の下まで伸ばす＆12行超で自動2列 -->
      <div class="fp-cars-block fp-cars-block-3 fp-cars-block-bottom">
        <div class="fp-cars-col">
          <div class="fp-cars-head">🎉 納車完了</div>
          <ul class="fp-car-list fp-car-list-flow${_twoColCls(leftCars)}">${carListHtml(leftCars)}</ul>
          <div class="fp-cars-sum">合計 ${_fmtYen(sumLeft)}<span class="fp-cars-count">（${leftCars.length}台）</span></div>
        </div>
        <div class="fp-cars-col">
          <div class="fp-cars-head">📦 仕入</div>
          <ul class="fp-car-list fp-car-list-flow${_twoColCls(rightLists.purchase)}">${_dateListItems(rightLists.purchase, c => c.purchaseDate)}</ul>
          <div class="fp-cars-sum">合計 ${rightLists.purchase.length}台</div>
        </div>
        <div class="fp-cars-col">
          <div class="fp-cars-head">🏪 店頭展示</div>
          <ul class="fp-car-list fp-car-list-flow${_twoColCls(rightLists.exhibit)}">${_dateListItems(rightLists.exhibit, c => window.periodStats.carExhibitedAt(c))}</ul>
          <div class="fp-cars-sum">合計 ${rightLists.exhibit.length}台</div>
        </div>
      </div>

      <div class="fp-footer">税扱い：${dashTax}</div>
    `;
  }

  // v1.8.103: 週次レポート専用シート生成
  function _buildWeekSheetHtml(week){
    const colLabels = { purchase:'仕入', regen:'再生', exhibit:'展示', delivery:'納車準備', done:'納車完了' };
    const colIcons  = { purchase:'📥', regen:'🔧', exhibit:'🏪', delivery:'📋', done:'🎉' };
    const cnt = week.pipeline.counts;
    const avg = week.pipeline.daysAvg;

    // 要対応の車両カードHTML
    function _overdueCarRow(item, sevClass){
      const c = item.car;
      const taskNames = item.items.map(t => `${t.icon || ''}${t.name} ${t.overdueDays >= 0 ? '+' : ''}${t.overdueDays}日`).join(' / ');
      return `<li class="fp-week-overdue-row ${sevClass}">
        <span class="fp-week-overdue-num">${c.num || c.id || ''}</span>
        <span class="fp-week-overdue-car">${(c.maker||'') + ' ' + (c.model||'')}</span>
        <span class="fp-week-overdue-task">${taskNames}</span>
      </li>`;
    }

    const pipeMax = Math.max(cnt.purchase, cnt.regen, cnt.exhibit, cnt.delivery, cnt.done, 1);
    // v1.8.104: 100%固定バグ修正 → 実数表示。金バー対応
    const monthlyPctRaw = Math.round(week.monthly.soldCount / Math.max(1, week.monthly.goalCount) * 100);
    const monthlyPctInner = Math.min(100, monthlyPctRaw);
    const monthlyOverPct = Math.max(0, monthlyPctRaw - 100);
    const monthlyOverCount = Math.max(0, week.monthly.soldCount - week.monthly.goalCount);

    return `
      <div class="fp-header">
        <h1 class="fp-title">車販部門　<span class="fp-title-month">${week.month}月</span> <span class="fp-title-period">${week.periodId}週目 進捗管理</span></h1>
        <div class="fp-date">${_todayJa()}<br><span style="font-size:11px;color:#555">${week.range.start} 〜 ${week.range.end}</span></div>
      </div>

      <!-- 🚨 要対応 -->
      <div class="fp-section-title">🚨 要対応（タスクリミット）　計 ${week.overdue.totalCars} 件</div>
      <div class="fp-week-overdue-block">
        ${week.overdue.red.length ? `
          <div class="fp-week-overdue-group fp-week-sev-red">
            <div class="fp-week-overdue-head">🔴 限界超過：${week.overdue.red.length} 件</div>
            <ul class="fp-week-overdue-list">
              ${week.overdue.red.map(x => _overdueCarRow(x, 'sev-red')).join('')}
            </ul>
          </div>
        ` : ''}
        ${week.overdue.orange.length ? `
          <div class="fp-week-overdue-group fp-week-sev-orange">
            <div class="fp-week-overdue-head">🟠 限界本日：${week.overdue.orange.length} 件</div>
            <ul class="fp-week-overdue-list">
              ${week.overdue.orange.map(x => _overdueCarRow(x, 'sev-orange')).join('')}
            </ul>
          </div>
        ` : ''}
        <div class="fp-week-overdue-yellow">🟡 目標超過：${week.overdue.yellow.length} 件 <span style="color:#666;font-size:11px;font-weight:400">（限界までは余裕あり）</span></div>
        ${week.overdue.totalCars === 0 ? '<div class="fp-week-overdue-empty">✅ 現在 リミット超過の車両はありません</div>' : ''}
      </div>

      <!-- 📊 パイプライン在庫 -->
      <div class="fp-section-title">📊 パイプライン在庫スナップショット（今週末時点）</div>
      <table class="fp-week-pipeline">
        <tbody>
          <tr class="fp-week-pipeline-head">
            <td>${colIcons.purchase} ${colLabels.purchase}</td>
            <td>${colIcons.regen} ${colLabels.regen}</td>
            <td>${colIcons.exhibit} ${colLabels.exhibit}</td>
            <td>${colIcons.delivery} ${colLabels.delivery}</td>
            <td>${colIcons.done} ${colLabels.done}</td>
          </tr>
          <tr class="fp-week-pipeline-count">
            <td>${cnt.purchase} 台</td>
            <td>${cnt.regen} 台</td>
            <td>${cnt.exhibit} 台</td>
            <td>${cnt.delivery} 台</td>
            <td>${cnt.done} 台</td>
          </tr>
          <tr class="fp-week-pipeline-bar">
            <td><div class="fp-week-bar"><div class="fp-week-bar-fill" style="width:${cnt.purchase/pipeMax*100}%"></div></div></td>
            <td><div class="fp-week-bar"><div class="fp-week-bar-fill" style="width:${cnt.regen/pipeMax*100}%"></div></div></td>
            <td><div class="fp-week-bar"><div class="fp-week-bar-fill" style="width:${cnt.exhibit/pipeMax*100}%"></div></div></td>
            <td><div class="fp-week-bar"><div class="fp-week-bar-fill" style="width:${cnt.delivery/pipeMax*100}%"></div></div></td>
            <td><div class="fp-week-bar"><div class="fp-week-bar-fill" style="width:${cnt.done/pipeMax*100}%"></div></div></td>
          </tr>
          <tr class="fp-week-pipeline-days">
            <td>平均 ${avg.purchase} 日</td>
            <td>平均 ${avg.regen} 日</td>
            <td>平均 ${avg.exhibit} 日</td>
            <td>平均 ${avg.delivery} 日</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>

      <!-- 🎯 月販目標進捗 -->
      <div class="fp-section-title">🎯 月販目標までの進捗</div>
      <div class="fp-week-goal-block">
        <div class="fp-week-goal-numbers">
          <span class="fp-week-goal-actual">${week.monthly.soldCount}</span>
          <span class="fp-week-goal-slash"> / </span>
          <span class="fp-week-goal-target">${week.monthly.goalCount}</span>
          <span class="fp-week-goal-unit">台</span>
          <span class="fp-week-goal-pct">（${monthlyPctRaw}%${monthlyOverCount>0?' ✨':''}）</span>
        </div>
        <div class="fp-week-goal-bar-row" style="display:flex;gap:1px;align-items:stretch">
          <div class="fp-week-goal-bar" style="flex:100;min-width:0">
            <div class="fp-week-goal-bar-fill" style="width:${monthlyPctInner}%"></div>
          </div>
          ${monthlyOverCount > 0 ? `<div class="fp-week-goal-overshoot" style="flex:${monthlyOverPct};min-width:40px" title="目標超過 +${monthlyOverCount}台">+${monthlyOverCount}台</div>` : ''}
        </div>
        <div class="fp-week-goal-remain">
          ${monthlyOverCount > 0
            ? `🎉 月販目標達成！ <strong style="color:#0a8050">+${monthlyOverCount}台 超過</strong>。月末まで残${week.monthly.remainDays}日 → 上振れ継続を狙う`
            : `残り <strong>${week.monthly.remain} 台</strong> 月末まで <strong>${week.monthly.remainDays} 日</strong>（${week.monthly.remainWeeks} 週） → <strong style="color:#c01010">1週あたり ${week.monthly.paceNeeded} 台ペース</strong>が必要`
          }
        </div>
      </div>

      <div class="fp-footer">税扱い：${(typeof getTaxLabel === 'function') ? getTaxLabel('dashboard') : '税込'}</div>
    `;
  }

  function open(mode, periodId, year, month){
    if (!window.periodStats){
      if (typeof showToast === 'function') showToast('集計モジュール未読込');
      return;
    }
    _ensureOverlay();
    // v1.8.103: 週次は専用集計＋専用シート
    if (mode === 'week'){
      currentData = window.periodStats.calcWeekReport(periodId, year, month);
      currentData._isWeek = true;
    } else {
      currentData = window.periodStats.calcPeriodReport(mode, periodId, year, month);
      currentData._isWeek = false;
    }
    _render();
    overlayEl.classList.add('open');
    document.body.classList.add('fp-open');
  }

  function close(){
    if (overlayEl){
      overlayEl.classList.remove('open');
      document.body.classList.remove('fp-open');
    }
  }

  function setDesign(d){
    currentDesign = d;
    _render();
  }

  function doPrint(){
    window.print();
  }

  // v1.8.85: PDFダウンロード（html2pdf.js）
  // v1.8.86: A4 1枚に確実に収めるための調整
  function doPdf(){
    if (typeof html2pdf === 'undefined'){
      if (typeof showToast === 'function') showToast('PDF生成ライブラリ未読込');
      return;
    }
    const sheet = overlayEl && overlayEl.querySelector('#fp-sheet');
    if (!sheet || !currentData) return;
    const periodTag = currentData.mode === 'month' ? '月次'
                    : currentData.mode === 'half'  ? (currentData.periodId === '1' ? '前期' : '後期')
                    : `${currentData.periodId}週目進捗`;
    const filename = `CarFlow_${currentData.year}年${currentData.month}月_${periodTag}.pdf`;
    // v1.8.91: windowWidth指定が原因で左切れしていたので撤去
    // PDF生成中はオーバーレイの中央配置を一旦解除して、シート要素を素直にキャプチャできるようにする
    const sheetWrap = overlayEl.querySelector('.fp-sheet-wrap');
    const _origWrapStyle = sheetWrap ? sheetWrap.getAttribute('style') || '' : '';
    if (sheetWrap) sheetWrap.setAttribute('style', 'display:block; padding:0; margin:0;');
    const _origSheetStyle = sheet.getAttribute('style') || '';
    // v1.8.101: 高さ制限を撤廃。複数ページに自然に渡る（3枠リストが2ページ目に継続）
    sheet.setAttribute('style', 'box-shadow:none; margin:0; max-height:none; overflow:visible;');

    const opt = {
      margin: 0,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
      // v1.8.101: CSS の page-break-* を尊重して自然な複数ページ
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.fp-car-list li', '.fp-kpi-row', '.fp-landing-block'] },
    };
    if (typeof showToast === 'function') showToast('PDF生成中…');
    const _restore = () => {
      if (sheetWrap) sheetWrap.setAttribute('style', _origWrapStyle);
      sheet.setAttribute('style', _origSheetStyle);
    };
    html2pdf().set(opt).from(sheet).save()
      .then(_restore)
      .catch(err => {
        _restore();
        console.error('[forecastPrint] PDF生成エラー', err);
        if (typeof showToast === 'function') showToast('PDF生成失敗: ' + (err.message || err));
      });
  }

  function _render(){
    if (!overlayEl || !currentData) return;
    const sheet = overlayEl.querySelector('#fp-sheet');
    if (!sheet) return;
    sheet.setAttribute('data-design', currentDesign);
    sheet.setAttribute('data-mode', currentData._isWeek ? 'week' : 'period');
    sheet.innerHTML = currentData._isWeek ? _buildWeekSheetHtml(currentData) : _buildSheetHtml(currentData);
    overlayEl.querySelectorAll('.fp-design-toggle button').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-design') === currentDesign);
    });
  }

  window.forecastPrint = { open, close, setDesign, doPrint, doPdf };
})();
