// ========================================
// forecast-targets.js (v1.8.83)
// 着地予測「集計対象」モーダル
// ----------------------------------------
// プルダウンで選択した期間における、各KPI項目の対象車両一覧を表示する
// 「あれ、なんで○台になってる？」を確認するための補助ビュー
// ========================================

(function(){
  'use strict';

  let modalEl = null;
  let currentData = null;

  function _ensureModal(){
    if (modalEl) return;
    modalEl = document.createElement('div');
    modalEl.id = 'forecast-targets-modal';
    modalEl.innerHTML = `
      <div class="ft-backdrop" onclick="window.forecastTargets.close()"></div>
      <div class="ft-dialog">
        <div class="ft-header">
          <h3 id="ft-title">集計対象</h3>
          <button class="ft-close-btn" onclick="window.forecastTargets.close()">✕</button>
        </div>
        <div class="ft-body" id="ft-body"></div>
      </div>
    `;
    document.body.appendChild(modalEl);
    document.addEventListener('keydown', function(ev){
      if (modalEl && modalEl.classList.contains('open') && ev.key === 'Escape'){
        close();
      }
    });
  }

  function _fmtYen(n){ return '¥' + Math.round(Number(n)||0).toLocaleString(); }
  function _carLabel(c){
    const parts = [];
    if (c.num) parts.push(c.num);
    if (c.maker) parts.push(c.maker);
    if (c.model) parts.push(c.model);
    return parts.join(' ') || '(無名車)';
  }

  function _section(title, items, dateField, dateGetter){
    let lines = '';
    if (!items.length){
      lines = `<div class="ft-empty">対象なし</div>`;
    } else {
      lines = items.map(c => {
        const d = dateGetter ? dateGetter(c) : c[dateField];
        const amt = (typeof _dashAmount === 'function') ? _dashAmount(c) : (Number(c.price)||0);
        return `<div class="ft-row">
          <span class="ft-row-date">${d || '—'}</span>
          <span class="ft-row-name">${_carLabel(c)}</span>
          <span class="ft-row-price">${_fmtYen(amt)}</span>
        </div>`;
      }).join('');
    }
    return `
      <div class="ft-section">
        <h4 class="ft-section-title">${title} <span class="ft-section-count">${items.length}台</span></h4>
        <div class="ft-list">${lines}</div>
      </div>
    `;
  }

  function open(mode, periodId, year, month){
    if (!window.periodStats){
      if (typeof showToast === 'function') showToast('集計モジュール未読込');
      return;
    }
    _ensureModal();
    currentData = window.periodStats.calcPeriodReport(mode, periodId, year, month);
    const title = document.getElementById('ft-title');
    const body  = document.getElementById('ft-body');
    if (title) title.textContent = `集計対象車両 — ${currentData.longLabel}`;
    if (body){
      const exhibitedGetter = c => window.periodStats.carExhibitedAt(c);
      body.innerHTML = `
        <div class="ft-range-info">期間：${currentData.range.start} 〜 ${currentData.range.end}</div>
        ${_section('① 仕入台数', currentData.lists.purchase, 'purchaseDate')}
        ${_section('② 店頭展示台数', currentData.lists.exhibit, null, exhibitedGetter)}
        ${_section('③ 売約台数', currentData.lists.contract, 'contractDate')}
        ${_section('④ 納車完了台数', currentData.lists.delivery, 'deliveryDate')}
        <div class="ft-section">
          <h4 class="ft-section-title">来期 納車予定（売約済） <span class="ft-section-count">${currentData.nextPeriodCars.length}台</span></h4>
          <div class="ft-section-hint">期間：${currentData.nextRange.start} 〜 ${currentData.nextRange.end}</div>
          <div class="ft-list">${
            currentData.nextPeriodCars.length
              ? currentData.nextPeriodCars.map(c => {
                  const amt = (typeof _dashAmount === 'function') ? _dashAmount(c) : (Number(c.price)||0);
                  return `<div class="ft-row">
                    <span class="ft-row-date">${c.deliveryDate || '—'}</span>
                    <span class="ft-row-name">${_carLabel(c)}</span>
                    <span class="ft-row-price">${_fmtYen(amt)}</span>
                  </div>`;
                }).join('')
              : '<div class="ft-empty">対象なし</div>'
          }</div>
        </div>
      `;
    }
    modalEl.classList.add('open');
  }

  function close(){
    if (modalEl) modalEl.classList.remove('open');
  }

  window.forecastTargets = { open, close };
})();
