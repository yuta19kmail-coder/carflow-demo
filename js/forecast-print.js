// ========================================
// forecast-print.js (v1.8.83→v1.8.86)
// 着地予測の印刷オーバーレイ
// ----------------------------------------
// デザインは A：クラシック（罫線テーブル）だけ。v3.17.0 で B・C を外した
// 画面でも紙と同じ A4 1枚の高さで見せる（_fitScreen）
// ----------------------------------------
// 装備品印刷シート（equipment-view.js）と同じ方式
// 印刷時は @media print で他要素を隠す
// PDFはhtml2pdf.js
// ========================================

(function(){
  'use strict';

  let overlayEl = null;
  let currentData = null;
  const currentDesign = 'A';   // v3.17.0 B・C は外した（ゆうた 2026-10-18「A だけを詰めて」）。CSS が data-design="A" を見ている

  function _ensureOverlay(){
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.id = 'forecast-print-overlay';
    overlayEl.innerHTML = `
      <div class="fp-controls" data-no-print="1">
        <div style="flex:1"></div>
        <button type="button" class="fp-pdf-btn" onclick="window.forecastPrint.doPdf()">${ic('download','📥',16)} PDF</button>
        <!-- 🗑 v3.17.3（ゆうた 2026-10-18「印刷ボタンも要らない、PDF DL だけで OK」）印刷ボタンは外した。doPrint は残す（Ctrl+P の紙の合わせ・見張り用） -->
        <button type="button" class="fp-close-btn" onclick="window.forecastPrint.close()">${ic('close','✕',15)} 閉じる</button>
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
  // 🔐 2026-10-22 外部監査 SEC-07：車の欄は HTML に入れる前にエスケープ（ふつうの値なら同じ）
  function _h(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
  function _carName(c){
    const parts = [];
    if (c.maker) parts.push(c.maker);
    if (c.model) parts.push(c.model);
    return _h(parts.join(' ') || (c.num || '(無名車)'));
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
  function _buildLandingBlock(L, monthLabel, st){
    // 台数バー
    const goalCount = Math.max(1, L.goalCount || 1);
    // v1.8.106: ピッタリ目標達成でも金（>=）
    const fixedOverCount = L.fixed.count > 0 && L.fixed.count >= goalCount;
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
    const fixedOverSales = fxSales > 0 && fxSales >= goalSalesYen;
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

    function _segCount(pct, val){ return pct > 8 ? `${val}台` : ''; }
    function _segSales(pct, yen){ return pct > 14 ? `${Math.round(yen/10000)}万` : ''; }

    return `
      <div class="fp-landing-block">
        <div class="fp-landing-title">${monthLabel ? monthLabel + '月の' : ''}着地${st ? `<span class="fp-landing-range">（${monthLabel}/1〜${parseInt(st.monthEnd.slice(8,10),10)}日）</span>` : ''}</div>

        <div class="fp-bar-row">
          <div class="fp-bar-label">台数</div>
          <div class="fp-landing-bar-row" style="display:flex;gap:1px;align-items:stretch;flex:1;min-width:0">
            <div class="fp-landing-bar" style="flex:100;min-width:0">
              ${fixedOverCount
                ? `<div class="fp-land-overshoot" style="width:100%">${goalCount}台 ${ic('sparkle','✨',15)}</div>`
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
          <div class="fp-bar-value"><b>${L.predictLow}</b><span class="fp-bv-goal"> / ${goalCount}台</span>${fixedOverCount?' '+ic('sparkle','✨',15)+'':''}
            <div class="fp-bv-sub">${Math.round(L.predictLow / goalCount * 100)}%・${L.predictLow >= goalCount ? '+' + (L.predictLow - goalCount) + '台' : 'あと' + (goalCount - L.predictLow) + '台'}${L.predictHigh > L.predictLow ? '・予測込み' + L.predictHigh + '台' : ''}</div></div>
        </div>

        <div class="fp-bar-row">
          <div class="fp-bar-label">売上</div>
          <div class="fp-landing-bar-row" style="display:flex;gap:1px;align-items:stretch;flex:1;min-width:0">
            <div class="fp-landing-bar" style="flex:100;min-width:0">
              ${fixedOverSales
                ? `<div class="fp-land-overshoot" style="width:100%">${Math.round(goalSalesYen/10000)}万 ${ic('sparkle','✨',15)}</div>`
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
          <div class="fp-bar-value"><b>${Math.round(predictLowSales/10000).toLocaleString()}万</b><span class="fp-bv-goal"> / ${Math.round(goalSalesYen/10000).toLocaleString()}万</span>${fixedOverSales?' '+ic('sparkle','✨',15)+'':''}
            <div class="fp-bv-sub">${Math.round(predictLowSales / goalSalesYen * 100)}%・${predictLowSales >= goalSalesYen ? '+' + Math.round((predictLowSales - goalSalesYen)/10000).toLocaleString() + '万' : 'あと' + Math.round((goalSalesYen - predictLowSales)/10000).toLocaleString() + '万'}${predictHighSales > predictLowSales ? '・予測込み' + Math.round(predictHighSales/10000).toLocaleString() + '万' : ''}</div></div>
        </div>

        <div class="fp-landing-legend">
          <span><i class="dot dot-fixed"></i>実績 ${L.fixed.count}台</span>
          <span><i class="dot dot-likely"></i>月末までの納車予定 ${L.likely.count}台</span>
          <span><i class="dot dot-possible"></i>実績予測 ${L.possible.count}台</span>
        </div>
      </div>
    `;
  }

  // ===== 🪜 v3.17.0 月の着地（階段）＋スライド分（別枠） =====
  // 数え方は period-stats.js の stairs だけ（ここでは数え直さない）
  function _buildStairsBlock(data){
    const st = data.stairs;
    if (!st) return '';
    const amt = c => (typeof _dashAmount === 'function') ? _dashAmount(c) : (Number(c.price)||0);
    const k = yen => Math.round((Number(yen)||0) / 1000).toLocaleString();
    const md = s => s ? `${parseInt(s.slice(5,7),10)}/${parseInt(s.slice(8,10),10)}` : '—';
    const m = data.month;
    const goal = st.monthGoal;
    const goalYen = goal.salesYen || 0;
    const pct = v => goalYen > 0 ? Math.round(v / goalYen * 100) : 0;
    const selName = data.mode === 'month' ? `${m}月の実績`
                  : data.mode === 'half' ? `${data.periodId === '1' ? '前期' : '後期'}の実績`
                  : `${data.periodId}週目の実績`;
    const contractMode = !!(typeof appSettings !== 'undefined' && appSettings.goals && appSettings.goals.revRecog === 'contract');
    const rows = [];
    if (st.prevList.length || data.range.start > st.monthStart){
      rows.push({ label: data.mode === 'half' ? '前期の実績' : '前の週までの実績', yen: st.prevSales, n: st.prevList.length });
    }
    rows.push({ label: selName, yen: st.selSales, n: st.selList.length });
    // 選んだ期より後の実績は、もう計上がある時だけ（前期を前期中に見れば 0 が当たり前なので行ごと出さない）
    if (data.range.end < st.monthEnd && st.afterList.length){
      rows.push({ label: data.mode === 'half' ? '後期の実績' : 'その後の週の実績', yen: st.afterSales, n: st.afterList.length });
    }
    if (!contractMode && st.monthOpen){   // 月が終わっていたら納車予定は無いので行ごと出さない
      rows.push({ label: '月末までの納車予定', yen: st.likelySales, n: st.likelyList.length });
    }
    let cum = 0;
    const rowHtml = rows.map((r, i) => {
      cum += r.yen;
      return `<tr class="fp-kpi-row fp-stair-row${r.yen ? '' : ' is-zero'}">
        <td class="fp-kpi-label">${i ? '<span class="fp-stair-plus">＋</span>' : ''}${_h(r.label)}</td>
        <td class="fp-kpi-actual">${k(r.yen)}</td>
        <td class="fp-stair-n">${r.n}<span class="fp-kpi-unit"> 台</span></td>
        <td class="fp-kpi-pct">${pct(cum)}%</td>
      </tr>`;
    }).join('');
    const sr = st.slideRange;
    const li = (arr) => arr.length
      ? arr.slice().sort((a,b) => (a.deliveryDate||'').localeCompare(b.deliveryDate||'')).map(c =>
          `<li><span class="fp-car-name">${_carName(c)}</span><span class="fp-col-date">${md(c.deliveryDate)}</span><span class="fp-car-price">${_fmtYen(amt(c))}</span></li>`).join('')
      : `<li class="fp-col-empty">対象なし</li>`;

    return `
      <div class="fp-tentative-block fp-stairs">
        <div class="fp-section-title">${m}月の着地の内訳</div>
        <table class="fp-kpi-table fp-stair-table">
          <colgroup><col style="width:40%"><col><col style="width:16%"><col style="width:14%"></colgroup>
          <thead><tr class="fp-stair-head"><td></td><td>金額（千円）</td><td>台数</td><td>月目標比</td></tr></thead>
          <tbody>
            ${rowHtml}
          </tbody>
        </table>
        ${contractMode ? '' : `
        <div class="fp-cars-block fp-stair-lists">
          <div class="fp-cars-col">
            <div class="fp-cars-head">${ic('clipboard','📋',16)} 月末までの納車予定</div>
            <ul class="fp-car-list fp-car-list-flow">${li(st.likelyList)}</ul>
            <div class="fp-cars-sum">合計 ${_fmtYen(st.likelySales)}<span class="fp-cars-count">（${st.likelyList.length}台）</span></div>
          </div>
          <div class="fp-cars-col fp-slide-col">
            <div class="fp-cars-head">↪ スライド分（翌月前期 ${md(sr.start)}〜${md(sr.end)}）</div>
            <ul class="fp-car-list fp-car-list-flow">${li(st.slideList)}</ul>
            <div class="fp-cars-sum">合計 ${_fmtYen(st.slideSales)}<span class="fp-cars-count">（${st.slideList.length}台）</span></div>
          </div>
        </div>`}
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

    const stairsBlock = _buildStairsBlock(data, carListHtml, sumLeft);

    // 着地予想（CarFlow特有）— v1.8.88: 期間プルダウンに関わらず月次固定で算出
    // 半期・週次の細かい区切りでは「見込み」「実績予測」がリードタイム14日と噛み合わず実用上意味が薄いため
    const L = (window.periodStats && window.periodStats.calcLandingForPeriod)
      ? window.periodStats.calcLandingForPeriod('month', '0', data.year, data.month)
      : null;
    /* 🪜 v3.17.0 上の着地バー＝紙の「月の着地」の一本化。確定・見込みは stairs と同じ車（実績予測だけ L のまま） */
    const st = data.stairs;
    const L2 = (L && st) ? Object.assign({}, L, {
      fixed:  Object.assign({}, L.fixed,  { count: st.actCount, sales: st.actSales }),
      likely: Object.assign({}, L.likely, { count: st.likelyList.length, sales: st.likelySales }),
      predictLow:  st.landingCount,
      predictHigh: st.landingCount + L.possible.count,
    }) : L;
    const landingBlock = L2 ? _buildLandingBlock(L2, data.month, st) : '';

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

      ${stairsBlock}

      <!-- v1.8.99: 車両一覧3枠は一番下、紙の下まで伸ばす＆12行超で自動2列 -->
      <div class="fp-cars-block fp-cars-block-bottom">
        <div class="fp-cars-col">
          <div class="fp-cars-head">🎉 納車完了</div>
          <ul class="fp-car-list fp-car-list-flow${_twoColCls(leftCars)}">${carListHtml(leftCars)}</ul>
          <div class="fp-cars-sum">合計 ${_fmtYen(sumLeft)}<span class="fp-cars-count">（${leftCars.length}台）</span></div>
        </div>
        <div class="fp-cars-col">
          <div class="fp-cars-head">${ic('box','📦',16)} 仕入</div>
          <ul class="fp-car-list fp-car-list-flow${_twoColCls(rightLists.purchase)}">${_dateListItems(rightLists.purchase, c => c.purchaseDate)}</ul>
          <div class="fp-cars-sum">合計 ${rightLists.purchase.length}台</div>
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
      const taskNames = item.items.map(t => `${_h(t.icon || '')}${_h(t.name)} ${t.overdueDays >= 0 ? '+' : ''}${t.overdueDays}日`).join(' / ');
      return `<li class="fp-week-overdue-row ${sevClass}">
        <span class="fp-week-overdue-num">${_h(c.num || c.id || '')}</span>
        <span class="fp-week-overdue-car">${_h((c.maker||'') + ' ' + (c.model||''))}</span>
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
      <div class="fp-section-title">${ic('siren','🚨',16)} 要対応（タスクリミット）　計 ${week.overdue.totalCars} 件</div>
      <div class="fp-week-overdue-block">
        ${week.overdue.red.length ? `
          <div class="fp-week-overdue-group fp-week-sev-red">
            <div class="fp-week-overdue-head">${ic('dot','🔴',12)} 限界超過：${week.overdue.red.length} 件</div>
            <ul class="fp-week-overdue-list">
              ${week.overdue.red.map(x => _overdueCarRow(x, 'sev-red')).join('')}
            </ul>
          </div>
        ` : ''}
        ${week.overdue.orange.length ? `
          <div class="fp-week-overdue-group fp-week-sev-orange">
            <div class="fp-week-overdue-head">${ic('dot','🟠',12)} 限界本日：${week.overdue.orange.length} 件</div>
            <ul class="fp-week-overdue-list">
              ${week.overdue.orange.map(x => _overdueCarRow(x, 'sev-orange')).join('')}
            </ul>
          </div>
        ` : ''}
        <div class="fp-week-overdue-yellow">${ic('dot','🟡',12)} 目標超過：${week.overdue.yellow.length} 件 <span style="color:#666;font-size:11px;font-weight:400">（限界までは余裕あり）</span></div>
        ${week.overdue.totalCars === 0 ? '<div class="fp-week-overdue-empty">'+ic('check','✅',15)+' 現在 リミット超過の車両はありません</div>' : ''}
      </div>

      <!-- 📊 パイプライン在庫 -->
      <div class="fp-section-title">${ic('chart','📊',16)} パイプライン在庫スナップショット（今週末時点）</div>
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
      <div class="fp-section-title">${ic('target','🎯',16)} 月販目標までの進捗</div>
      <div class="fp-week-goal-block">
        <div class="fp-week-goal-numbers">
          <span class="fp-week-goal-actual">${week.monthly.soldCount}</span>
          <span class="fp-week-goal-slash"> / </span>
          <span class="fp-week-goal-target">${week.monthly.goalCount}</span>
          <span class="fp-week-goal-unit">台</span>
          <span class="fp-week-goal-pct">（${monthlyPctRaw}%${monthlyOverCount>0?' '+ic('sparkle','✨',15)+'':''}）</span>
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
      if (typeof showToast === 'function') showToast('集計モジュール未読込', 'CF-4004');
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
    overlayEl.classList.add('open');
    document.body.classList.add('fp-open');
    _render();
  }

  function close(){
    if (overlayEl){
      overlayEl.classList.remove('open');
      document.body.classList.remove('fp-open');
    }
  }


  // ============================================================
  // v2.36.0 (A-3) 「あと数ミリ入りきらないせいで、ほぼ真っ白な2枚目が出る」対策。
  //   印刷の直前に A4 1枚に収まるかを測り、はみ出しが小さい時だけ紙に合わせて少し縮める。
  //   🔴 縮めるのは最大15%まで。それ以上はみ出す時は縮めずに素直に2枚目へ流す
  //      ＝ 中身を切り捨てることは絶対にしない（切るくらいなら紙が増えるほうがまし）。
  //   ⚠ 画面の見た目は変えない。印刷が終わったら元に戻す。
  // ============================================================
  const _MM         = 96 / 25.4;
  const _PAGE_MM    = 287;   // A4の縦297mm − @page余白5mm×2
  const _PRINT_W_MM = 200;   // 印刷時のシート幅（A4の横210mm − 余白5mm×2）
  const _PRINT_PAD  = 14;    // 印刷時のシート内側余白 7mm×2
  const _SCREEN_PAD = 24;    // 画面のシート内側余白 12mm×2
  const _MIN_FIT    = 0.85;  // これより小さく縮めるくらいなら2枚にする
  let _fitOn = false;

  function _fitOnePage(){
    const sheet = overlayEl && overlayEl.querySelector('#fp-sheet');
    const wrap  = overlayEl && overlayEl.querySelector('.fp-sheet-wrap');
    if (!sheet || !sheet.children.length) return 1;
    _fitUndo();

    // ① 中身そのものの高さを測る。
    //    min-height を外して「下の車両リストが紙の下まで伸びる」のを一旦止めてから、
    //    先頭の子から最後の子までの実寸を見る（画面と印刷で内側余白が違うので、余白は自分で足す）。
    sheet.style.setProperty('min-height', '0', 'important');
    const kids = sheet.children;
    const top = kids[0].getBoundingClientRect().top;
    const bottom = kids[kids.length - 1].getBoundingClientRect().bottom;
    // 🔴 画面の文字サイズ設定（body の拡大）は紙には効かない（印刷では 1 に戻る）。
    //    測るときも、その拡大ぶんを割り戻しておかないと「実際よりはみ出している」と誤解する。
    const bodyZoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const naturalMm = (bottom - top) / _MM / bodyZoom + _PRINT_PAD;
    sheet.style.removeProperty('min-height');

    // ② はみ出しが小さい時だけ縮める
    let z = 1;
    if (naturalMm > _PAGE_MM){
      z = Math.floor(_PAGE_MM / naturalMm * 1000) / 1000;
      if (z < _MIN_FIT) z = 1;          // 縮めすぎになるので、素直に2枚目へ流す
    }
    if (z < 1){
      // 縮めたぶんだけ大きく作ってから縮める＝刷り上がりは 200mm × 287mm のまま、中身だけ小さくなる。
      // 🔴 紙1枚に収まることが分かっている時だけ枠で囲う（はみ出しを隠す設定は、
      //    収まらない時に中身を切ってしまうので、その時は絶対に付けない）。
      sheet.style.setProperty('width', (_PRINT_W_MM / z) + 'mm', 'important');
      sheet.style.setProperty('min-height', (_PAGE_MM / z) + 'mm', 'important');
      sheet.style.setProperty('transform', 'scale(' + z + ')', 'important');
      sheet.style.setProperty('transform-origin', 'top left', 'important');
      if (wrap){
        wrap.style.setProperty('height', _PAGE_MM + 'mm', 'important');
        wrap.style.setProperty('overflow', 'hidden', 'important');
      }
      _fitOn = true;
    }
    return z;
  }
  function _fitUndo(){
    if (!_fitOn) return;
    const sheet = overlayEl && overlayEl.querySelector('#fp-sheet');
    const wrap  = overlayEl && overlayEl.querySelector('.fp-sheet-wrap');
    if (sheet) ['width','min-height','transform','transform-origin'].forEach(k => sheet.style.removeProperty(k));
    if (wrap)  ['width','height','overflow','flex'].forEach(k => wrap.style.removeProperty(k));
    _fitOn = false;
  }
  /* 📄 v3.17.0（ゆうた 2026-10-18「A4印刷前提だから高さを固定して」）
     画面のシートも**いつも A4 1枚の高さ（297mm）**で見せる。中身が少し多い時は、紙と同じく最大15%まで縮めて収める。
     🔴 それ以上はみ出す時は縮めずに伸ばす（＝紙も2枚目へ流れる。中身は切らない＝上の決めごとと同じ）。
     印刷の直前は _fitOnePage（紙の寸法）に入れ替え、終わったらこちらに戻す。 */
  const _SHEET_MM = 297;
  function _fitScreen(){
    const sheet = overlayEl && overlayEl.querySelector('#fp-sheet');
    const wrap  = overlayEl && overlayEl.querySelector('.fp-sheet-wrap');
    if (!sheet || !sheet.children.length || !overlayEl.classList.contains('open')) return 1;
    _fitUndo();
    sheet.style.setProperty('min-height', '0', 'important');
    const kids = sheet.children;
    const top = kids[0].getBoundingClientRect().top;
    const bottom = kids[kids.length - 1].getBoundingClientRect().bottom;
    const bodyZoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const naturalMm = (bottom - top) / _MM / bodyZoom + _SCREEN_PAD;
    sheet.style.removeProperty('min-height');
    let z = 1;
    if (naturalMm > _SHEET_MM){
      z = Math.floor(_SHEET_MM / naturalMm * 1000) / 1000;
      if (z < _MIN_FIT) z = 1;
    }
    if (z < 1){
      sheet.style.setProperty('width', (210 / z) + 'mm', 'important');
      sheet.style.setProperty('min-height', (_SHEET_MM / z) + 'mm', 'important');
      sheet.style.setProperty('transform', 'scale(' + z + ')', 'important');
      sheet.style.setProperty('transform-origin', 'top left', 'important');
      if (wrap){
        wrap.style.setProperty('width', '210mm', 'important');
        wrap.style.setProperty('height', _SHEET_MM + 'mm', 'important');
        wrap.style.setProperty('overflow', 'hidden', 'important');
        wrap.style.setProperty('flex', '0 0 auto', 'important');
      }
      _fitOn = true;
    }
    return z;
  }
  window.addEventListener('afterprint', () => { _fitUndo(); _fitScreen(); });

  function doPrint(){
    _fitOnePage();
    try { window.print(); } finally { setTimeout(() => { _fitUndo(); _fitScreen(); }, 0); }
  }

  // v1.8.85: PDFダウンロード（html2pdf.js）
  // v1.8.86: A4 1枚に確実に収めるための調整
  function doPdf(){
    if (typeof html2pdf === 'undefined'){
      if (typeof showToast === 'function') showToast('PDF生成ライブラリ未読込', 'CF-4005');
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
    _fitUndo();
    const sheetWrap = overlayEl.querySelector('.fp-sheet-wrap');
    const _origWrapStyle = sheetWrap ? sheetWrap.getAttribute('style') || '' : '';
    if (sheetWrap) sheetWrap.setAttribute('style', 'display:block; padding:0; margin:0;');
    const _origSheetStyle = sheet.getAttribute('style') || '';
    // v1.8.101: 高さ制限を撤廃。複数ページに自然に渡る（3枠リストが2ページ目に継続）
    sheet.setAttribute('style', 'box-shadow:none; margin:0; max-height:none; overflow:visible;');
    /* 📄 v3.17.2（ゆうた 2026-10-18「PDFをDLした時に空白ページがついてくる」）
       シートはちょうど 297mm＝A4 の高さで、html2pdf の割り算の端数で2枚目（空白）が出ていた。
       html2pdf は撮った幅を紙の幅（210mm）に合わせて縮めるので、
       ・高さは紙より1mm短くする（端数で2枚目に行かない）
       ・中身が少し多い時は、シートを横に広げて（210mm÷z）撮る＝紙では z 倍に縮んで1枚に収まる（画面・印刷と同じ最大15%）
       ・それ以上多い時は今までどおり2枚目へ流す（切らない） */
    sheet.style.setProperty('min-height', '0', 'important');
    const _kids = sheet.children;
    const _natMm = _kids.length
      ? (_kids[_kids.length - 1].getBoundingClientRect().bottom - _kids[0].getBoundingClientRect().top) / _MM / (parseFloat(getComputedStyle(document.body).zoom) || 1) + _SCREEN_PAD
      : 0;
    let _pz = 1;
    if (_natMm > _SHEET_MM - 1){
      _pz = Math.floor((_SHEET_MM - 1) / _natMm * 1000) / 1000;
      if (_pz < _MIN_FIT) _pz = 1;
    }
    sheet.style.setProperty('width', (210 / _pz) + 'mm', 'important');
    sheet.style.setProperty('min-height', ((_SHEET_MM - 1) / _pz) + 'mm', 'important');

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
      _fitScreen();
    };
    html2pdf().set(opt).from(sheet).save()
      .then(_restore)
      .catch(err => {
        _restore();
        console.error('[forecastPrint] PDF生成エラー', err);
        if (typeof showToast === 'function') showToast('PDF生成失敗: ' + (err.message || err), 'CF-4006');
      });
  }

  function _render(){
    if (!overlayEl || !currentData) return;
    const sheet = overlayEl.querySelector('#fp-sheet');
    if (!sheet) return;
    sheet.setAttribute('data-design', currentDesign);
    sheet.setAttribute('data-mode', currentData._isWeek ? 'week' : 'period');
    sheet.innerHTML = currentData._isWeek ? _buildWeekSheetHtml(currentData) : _buildSheetHtml(currentData);
    _fitScreen();
  }

  // _fitOnePage は自動テスト（test_forecast_print.mjs）からも呼ぶので出しておく
  window.forecastPrint = { open, close, doPrint, doPdf, _fitOnePage, _fitUndo, _fitScreen };
})();
