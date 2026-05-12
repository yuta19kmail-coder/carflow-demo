// ========================================
// car-detail.js
// 車両詳細モーダルの表示と操作
// v0.8.9: その他はタスク非表示・メモ中心
// v0.9.0: 削除ボタンは編集モーダル側に移動（誤タップ防止）
// v1.7.38: 各タスク行に「タスクパターン」選択UIを追加（パターン2つ以上のテンプレ）
// ========================================

// v1.7.38: タスクパターン変更ハンドラ
//   ・初回選択（旧データ無し）：そのまま反映
//   ・既存選択あり＆作業データあり：データリセットの確認ポップアップ
window.onCarTaskVariantChange = function (carId, taskId, selectEl) {
  const car = (typeof cars !== 'undefined') ? cars.find(c => c.id === carId) : null;
  if (!car) return;
  const newId = selectEl ? selectEl.value : '';
  const carVariants = car.taskVariants || {};
  const oldId = carVariants[taskId] || '';
  if (newId === oldId) return;
  // 作業データの有無を確認（これから消すかどうか判断）
  const isD = (car.col === 'delivery' || car.col === 'done');
  const bucket = isD ? 'deliveryTasks' : 'regenTasks';
  const taskState = (car[bucket] && car[bucket][taskId]) || null;
  const hasData = !!(taskState && typeof taskState === 'object'
    && Object.keys(taskState).filter(k => !k.startsWith('_')).length > 0);
  // 空欄に戻したケース
  if (!newId) {
    if (hasData) {
      if (!confirm('タスクパターンを「未選択」に戻すと、このタスクの現在の作業データはすべて消えます。\n本当に戻しますか？')) {
        if (selectEl) selectEl.value = oldId;
        return;
      }
      delete car[bucket][taskId];
    }
    if (car.taskVariants) delete car.taskVariants[taskId];
  } else {
    // 別パターンに切替（旧データありなら確認、無ければ即時）
    if (oldId && hasData) {
      if (!confirm('タスクパターンを変更すると、このタスクの現在の作業データはすべて消えます。\n本当に切り替えますか？')) {
        if (selectEl) selectEl.value = oldId;
        return;
      }
      delete car[bucket][taskId];
    }
    if (!car.taskVariants) car.taskVariants = {};
    car.taskVariants[taskId] = newId;
  }
  // 保存＆再描画
  if (typeof saveCarById === 'function') saveCarById(car.id);
  if (typeof renderDetailBody === 'function') renderDetailBody(car);
  if (typeof renderAll === 'function') renderAll();
};

// 車両詳細を開く
function openDetail(carId) {
  activeDetailCarId = carId;
  const car = cars.find(c => c.id === carId);
  if (!car) return;
  document.getElementById('detail-title').textContent = `${car.maker} ${car.model}`;
  renderDetailBody(car);
  document.getElementById('modal-detail').classList.add('open');
}

// その他用の詳細：タスクなしでメモ中心
function _renderDetailBodyOther(car) {
  const inv = daysSince(car.purchaseDate);
  const colLabel = COLS.find(c => c.id === car.col)?.label || car.col;
  const coreMemo = (car.memo || '').trim();
  const workMemo = (car.workMemo || '').trim();

  const dayBlock = `
    <div class="detail-days-box dg">
      <div class="detail-days-num">${inv}<span class="detail-days-unit">日</span></div>
      <div class="detail-days-label">仕入れから</div>
    </div>`;

  const coreMemoHtml = coreMemo
    ? `<div class="core-memo" data-expanded="0" onclick="toggleCoreMemo(this)">
         <div class="core-memo-label">📌 メモ</div>
         <div class="core-memo-text">${escapeHtml(coreMemo).replace(/\n/g,'<br>')}</div>
       </div>`
    : `<div class="core-memo core-memo-empty">
         <div class="core-memo-label">📌 メモ</div>
         <div class="core-memo-text core-memo-placeholder">メモは未記入です（編集ボタンから記入）</div>
       </div>`;

  let html = `
    <div class="detail-photo">
      ${car.photo ? `<img src="${car.photo}">` : carEmoji(car.size)}
      <div class="detail-photo-edit" onclick="document.getElementById('dp-inp').click()">📷 写真を変更</div>
    </div>
    <input type="file" id="dp-inp" accept="image/*" capture="environment" style="display:none" onchange="onDetailPhoto(this)">
    <div class="detail-other-status">
      <span class="pill ${pillMap[car.col]||'pill-other'}">📝 ${colLabel}</span>
      <span class="detail-other-hint">身の振り方が決まっていない保留中の車両</span>
    </div>
    <div class="detail-head">
      <div class="detail-head-left">
        ${dayBlock}
      </div>
      <div class="detail-head-right">
        <div class="detail-other-msg">タスクや進捗の管理対象外。<br>展示・再生・仕入れに動かすと売り物のフローに入ります。</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="background:var(--bg3);border-radius:7px;padding:10px"><div style="color:var(--text3);font-size:10px;margin-bottom:3px">管理番号</div><div style="font-size:13px;font-weight:600">${car.num}</div></div>
      <div style="background:var(--bg3);border-radius:7px;padding:10px"><div style="color:var(--text3);font-size:10px;margin-bottom:3px">年式</div><div style="font-size:13px;font-weight:600">${fmtYearDisplay(parseYearInput(car.year)||car.year)}</div></div>
      <div style="background:var(--bg3);border-radius:7px;padding:10px"><div style="color:var(--text3);font-size:10px;margin-bottom:3px">車体色</div><div style="font-size:13px;font-weight:600">${car.color||'—'}</div></div>
      <div style="background:var(--bg3);border-radius:7px;padding:10px"><div style="color:var(--text3);font-size:10px;margin-bottom:3px">走行距離</div><div style="font-size:13px;font-weight:600">${Number(car.km||0).toLocaleString()}km</div></div>
    </div>
    ${_renderEqDetailButton(car)}
    ${coreMemoHtml}
    <button onclick="openCarModal('${car.id}')" style="width:100%;padding:9px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);color:var(--text2);font-size:13px;cursor:pointer;margin-bottom:16px">✏️ 車両詳細を編集</button>
    <div class="work-memo" id="work-memo-wrap">
      <div class="work-memo-label">📝 作業メモ <span class="work-memo-hint">（保留中のメモ）</span></div>
      <div class="work-memo-view" onclick="startEditWorkMemo('${car.id}')">${
        workMemo
          ? escapeHtml(workMemo).replace(/\n/g,'<br>')
          : '<span class="work-memo-placeholder">タップしてメモを記入</span>'
      }</div>
    </div>`;
  document.getElementById('detail-body').innerHTML = html;
}

// 詳細モーダルの本体を描画
function renderDetailBody(car) {
  if (car.col === 'other') return _renderDetailBodyOther(car);

  const isD = car.col === 'delivery' || car.col === 'done';
  const tasks = (isD ? getActiveDeliveryTasks(car) : getActiveRegenTasks(car));
  const prog = calcProg(car);
  const inv = daysSince(car.purchaseDate);
  const contractedDays = daysSinceContract(car);
  const delDiff = car.deliveryDate ? daysDiff(car.deliveryDate) : null;
  let dayBlock = '';
  if (car.isOrder) {
    // v1.8.72: オーダー車両の表示（在庫日数の代わりに「オーダー車両」バッジ）
    dayBlock = `
      <div class="detail-days-box" style="background:rgba(168,85,247,.18);color:#c084fc;border:1px solid rgba(168,85,247,.4)">
        <div class="detail-days-num" style="font-size:18px">📦</div>
        <div class="detail-days-label">オーダー車両</div>
        <div class="detail-days-sub" style="color:#c084fc;opacity:.85">在庫日数カウントなし</div>
      </div>`;
  } else if (car.contract) {
    const wt = delWarnTier(delDiff);
    const delLabel = (delDiff != null) ? (delDiff === 0 ? '納車本日' : delDiff > 0 ? `納車まで${delDiff}日` : `納車超過${-delDiff}日`) : '';
    dayBlock = `
      <div class="detail-days-box db">
        <div class="detail-days-num">${contractedDays}<span class="detail-days-unit">日</span></div>
        <div class="detail-days-label">売約から</div>
        ${delLabel ? `<div class="detail-days-sub${wt?' warn':''}">${delLabel}</div>` : ''}
      </div>`;
  } else {
    const wt = invWarnTier(inv);
    const cls = wt ? (wt.days >= 45 ? 'dr' : wt.days >= 30 ? 'dw' : 'dg') : 'dg';
    dayBlock = `
      <div class="detail-days-box ${cls}"${wt?` style="background:${wt.bg};color:${wt.color}"`:''}>
        <div class="detail-days-num">${inv}<span class="detail-days-unit">日</span></div>
        <div class="detail-days-label">在庫</div>
      </div>`;
  }
  const coreMemo = (car.memo || '').trim();
  const coreMemoHtml = coreMemo
    ? `<div class="core-memo" data-expanded="0" onclick="toggleCoreMemo(this)">
         <div class="core-memo-label">📌 メモ</div>
         <div class="core-memo-text">${escapeHtml(coreMemo).replace(/\n/g,'<br>')}</div>
       </div>`
    : `<div class="core-memo core-memo-empty">
         <div class="core-memo-label">📌 メモ</div>
         <div class="core-memo-text core-memo-placeholder">メモは未記入です（編集ボタンから記入）</div>
       </div>`;
  const workMemo = (car.workMemo || '').trim();
  let html = `
    <div class="detail-photo">
      ${car.photo ? `<img src="${car.photo}">` : carEmoji(car.size)}
      <div class="detail-photo-edit" onclick="document.getElementById('dp-inp').click()">📷 写真を変更</div>
    </div>
    <input type="file" id="dp-inp" accept="image/*" capture="environment" style="display:none" onchange="onDetailPhoto(this)">
    <div class="detail-head">
      <div class="detail-head-left">
        ${dayBlock}
      </div>
      <div class="detail-head-right">
        ${(() => {
          // v1.8.63: 緑（総額メイン）側の税ラベルは緑に。本体（サブ）はグレーのまま。
          const tlb = (typeof getTaxLabel === 'function') ? getTaxLabel('body')  : '税込';
          const tlt = (typeof getTaxLabel === 'function') ? getTaxLabel('total') : '税込';
          const pt = fmtPriceTwo(car.totalPrice, car.price);
          if (pt.hasTotal && pt.hasBody) {
            return `<div class="detail-price-wrap"><div class="detail-price">総額 ${pt.totalDisp}<span class="detail-price-tax-green">（${tlt}）</span></div><div class="detail-price-body">本体 ${pt.bodyDisp}<span class="detail-price-tax">（${tlb}）</span></div></div>`;
          } else if (pt.hasTotal) {
            return `<div class="detail-price">総額 ${pt.totalDisp}<span class="detail-price-tax-green">（${tlt}）</span></div>`;
          } else if (pt.hasBody) {
            return `<div class="detail-price">本体 ${pt.bodyDisp}<span class="detail-price-tax-green">（${tlb}）</span></div>`;
          }
          return '';
        })()}
        ${car.deliveryDate ? `<div class="detail-deldate">納車予定: ${fmtDate(car.deliveryDate)}</div>` : ''}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="background:var(--bg3);border-radius:7px;padding:10px"><div style="color:var(--text3);font-size:10px;margin-bottom:3px">管理番号</div><div style="font-size:13px;font-weight:600">${car.num}</div></div>
      <div style="background:var(--bg3);border-radius:7px;padding:10px"><div style="color:var(--text3);font-size:10px;margin-bottom:3px">年式</div><div style="font-size:13px;font-weight:600">${fmtYearDisplay(parseYearInput(car.year)||car.year)}</div></div>
      <div style="background:var(--bg3);border-radius:7px;padding:10px"><div style="color:var(--text3);font-size:10px;margin-bottom:3px">車体色</div><div style="font-size:13px;font-weight:600">${car.color}</div></div>
      <div style="background:var(--bg3);border-radius:7px;padding:10px"><div style="color:var(--text3);font-size:10px;margin-bottom:3px">走行距離</div><div style="font-size:13px;font-weight:600">${Number(car.km||0).toLocaleString()}km</div></div>
    </div>
    ${_renderEqDetailButton(car)}
    ${coreMemoHtml}
    <button onclick="openCarModal('${car.id}')" style="width:100%;padding:9px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);color:var(--text2);font-size:13px;cursor:pointer;margin-bottom:16px">✏️ 車両詳細を編集</button>
    <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">${isD?'納車準備':'業務タスク'}</div>
    <div class="detail-overall">
      <div class="detail-overall-label"><span>全体進捗</span><span>${prog.done}/${prog.total} (${prog.pct}%)</span></div>
      <div class="detail-overall-bar"><div class="detail-overall-fill" style="width:${prog.pct}%;background:${prog.pct>=100?'var(--green)':prog.pct>0?'var(--orange)':'var(--bg4)'}"></div></div>
    </div>
    <div class="task-items">`;
  // v1.0.35: 期日超過タスクのマップを準備
  const _overdueList = (typeof getOverdueTasks === 'function') ? getOverdueTasks(car) : [];
  const _overdueMap = {};
  _overdueList.forEach(o => { _overdueMap[o.taskId] = o; });
  function _overdueBadge(taskId) {
    const o = _overdueMap[taskId];
    if (!o) return '';
    return `<span class="task-overdue-badge" title="期限超過">⚠ 超過${o.overdueDays}日</span>`;
  }
  // v1.0.36: 列を固定幅で揃える共通フォーマット
  // [chk(30)] [info(flex:1)] [badge(可変・無くても占有なし)] [pct(56右寄)] [open(64 or プレースホルダー)]
  function _badgeCol(taskId) {
    const o = _overdueMap[taskId];
    return `<div class="task-item-badge">${o ? `<span class="task-overdue-badge" title="期限超過">⚠ 超過${o.overdueDays}日</span>` : ''}</div>`;
  }
  // v1.7.13: Phase 3 — 「📝 詳細」ON のトグルタスクは項目チェック式に昇格、ws-page で開く
  const _phaseStr = isD ? 'delivery' : 'regen';
  const _isCheckMode = (taskId) =>
    (typeof hasTaskChecklist === 'function' && hasTaskChecklist(taskId, _phaseStr));
  // v1.7.41: パターン選択UIを2行目（控えめ）に戻す。スマホや期限切れバッジとの干渉を回避。
  function _renderTaskVariantRow(task) {
    if (typeof ChecklistTemplates === 'undefined') return '';
    const tplId = (task.id === 't_equip') ? 'tpl_equipment' : `tpl_${_phaseStr}_${task.id}`;
    const tpl = ChecklistTemplates[tplId];
    if (!tpl) return '';
    const variants = Array.isArray(tpl.variants) ? tpl.variants : [];
    if (variants.length <= 1) return ''; // パターン1つなら不要
    const carVariants = (car && car.taskVariants) || {};
    const sel = carVariants[task.id] || '';
    const opts = variants.map(v =>
      `<option value="${escapeHtml(v.id)}" ${v.id === sel ? 'selected' : ''}>${escapeHtml(v.name || '(無題)')}</option>`
    ).join('');
    const placeholder = sel ? '' : '<option value="">パターン未選択</option>';
    return `
      <div class="task-item-variant-row">
        <select class="task-item-variant-sel"
                onchange="onCarTaskVariantChange('${car.id}','${task.id}',this)">
          ${placeholder}${opts}
        </select>
      </div>`;
  }

  tasks.forEach(task => {
    const p = calcSingleProg(car, task.id, tasks);
    const isDone = p.pct === 100, isPartial = p.pct > 0 && p.pct < 100;
    const state = isD ? car.deliveryTasks : car.regenTasks;
    // 単純トグル：type='toggle' かつ mode='checklist' ではない（d_complete / t_complete はここに残る）
    if (task.type === 'toggle' && !_isCheckMode(task.id)) {
      // v1.0.41 / v1.7.17: d_complete / t_complete は自動判定（他の有効タスク全完了で ON）。手動チェック不可
      const isAuto = (task.id === 'd_complete' || task.id === 't_complete');
      let autoChecked = false;
      if (isAuto) {
        if (task.id === 'd_complete' && typeof isDeliveryAllOtherTasksDone === 'function') {
          autoChecked = isDeliveryAllOtherTasksDone(car);
        } else if (task.id === 't_complete' && typeof isRegenAllOtherTasksDone === 'function') {
          autoChecked = isRegenAllOtherTasksDone(car);
        }
      }
      const checked = isAuto ? autoChecked : !!state[task.id];
      const onclickAttr = isAuto ? '' : ` onclick="toggleTaskToggle('${car.id}','${task.id}',${isD})"`;
      const subText = isAuto
        ? (checked ? '✓ 自動完了（他タスク全完了）' : '他タスク完了で自動ON')
        : (checked ? '完了' : '未完了');
      const chkExtraCls = isAuto ? ' auto' : '';
      html += `<div class="task-item"><div class="task-item-row">
        <div class="task-chk${checked?' done':''}${chkExtraCls}"${onclickAttr}>
          ${checked ? '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><polyline points="2,7 5.5,11 12,3" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
        </div>
        <div class="task-item-info"><div class="task-item-name">${task.icon} ${task.name}</div><div class="task-item-sub">${subText}</div></div>
        ${_badgeCol(task.id)}
        <div class="task-item-pct">${checked?'100':'0'}%</div>
        <div class="task-item-open"></div>
      </div></div>`;
    } else {
      // v1.7.41: パターン選択を2行目に戻す（控えめなスタイル）
      const variantRow = _renderTaskVariantRow(task);
      // パターン未選択の場合「開く」を無効化
      const tplId2 = (task.id === 't_equip') ? 'tpl_equipment' : `tpl_${_phaseStr}_${task.id}`;
      const tpl2 = (typeof ChecklistTemplates !== 'undefined') ? ChecklistTemplates[tplId2] : null;
      const variants2 = (tpl2 && Array.isArray(tpl2.variants)) ? tpl2.variants : [];
      const needsSelect = variants2.length > 1;
      const carVariants2 = (car && car.taskVariants) || {};
      const hasSelection = !needsSelect || !!carVariants2[task.id];
      const openBtnHtml = hasSelection
        ? `<button class="task-open-btn" onclick="openWorksheet('${car.id}','${task.id}')">開く →</button>`
        : `<button class="task-open-btn" disabled title="先にタスクパターンを選んでください" style="opacity:.4;cursor:not-allowed">開く →</button>`;
      html += `<div class="task-item"><div class="task-item-row">
        <div class="task-chk${isDone?' done':isPartial?' partial':''}">
          ${isDone ? '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><polyline points="2,7 5.5,11 12,3" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : isPartial ? '<div style="width:7px;height:7px;border-radius:50%;background:#fff"></div>' : ''}
        </div>
        <div class="task-item-info"><div class="task-item-name">${task.icon} ${task.name}</div><div class="task-item-sub">${p.done}/${p.total} 完了</div></div>
        ${_badgeCol(task.id)}
        <div class="task-item-pct">${p.pct}%</div>
        <div class="task-item-open">${openBtnHtml}</div>
      </div>${variantRow}</div>`;
    }
  });
  html += `</div>`;
  html += `
    <div class="work-memo" id="work-memo-wrap">
      <div class="work-memo-label">📝 作業メモ ${isD ? '<span class="work-memo-hint">（納車準備中のメモ）</span>' : '<span class="work-memo-hint">（再生中のメモ）</span>'}</div>
      <div class="work-memo-view" onclick="startEditWorkMemo('${car.id}')">${
        workMemo
          ? escapeHtml(workMemo).replace(/\n/g,'<br>')
          : '<span class="work-memo-placeholder">タップしてメモを記入</span>'
      }</div>
    </div>`;
  document.getElementById('detail-body').innerHTML = html;
}

// 装備詳細ボタン＋アコーディオンパネルの描画
// v1.0.20: 新規追加 / v1.0.21: アコーディオン化 / v1.0.24: ラベル統一 / v1.0.33: タスクOFF時は非表示
function _renderEqDetailButton(car) {
  if (typeof calcEquipmentProgress !== 'function') return '';
  // v1.0.33: 装備品チェックタスクが OFF なら、ボタン自体を出さない
  // t_equip は再生フェーズの組み込みタスクなので、再生で OFF なら隠す
  if (typeof isTaskActive === 'function' && !isTaskActive('t_equip', 'regen')) {
    return '';
  }
  const p = calcEquipmentProgress(car);
  const completed = !!(car.equipment && car.equipment._completed);
  let label, cls = 'detail-eq-btn';
  if (p.filled === 0) {
    label = '📋 装備詳細を見る（未入力）';
    cls += ' detail-eq-btn-empty';
  } else if (completed) {
    label = `📋 装備詳細を見る（✓ 確認済 ${p.filled}/${p.total}）`;
  } else {
    label = `📋 装備詳細を見る（${p.filled}/${p.total} 入力済）`;
  }
  return `
    <button id="eq-acc-btn-${car.id}" class="${cls}" data-open="0" onclick="toggleEquipmentAccordion('${car.id}')">
      <span class="detail-eq-btn-label">${label}</span>
      <span class="detail-eq-btn-arrow">▼</span>
    </button>
    <div id="eq-acc-${car.id}" class="detail-eq-accordion" data-open="0"></div>`;
}

function toggleCoreMemo(el) {
  const cur = el.getAttribute('data-expanded') === '1';
  el.setAttribute('data-expanded', cur ? '0' : '1');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function startEditWorkMemo(carId) {
  const car = cars.find(c => c.id === carId);
  if (!car) return;
  const wrap = document.getElementById('work-memo-wrap');
  if (!wrap) return;
  const cur = car.workMemo || '';
  wrap.innerHTML = `
    <div class="work-memo-label">📝 作業メモ</div>
    <textarea id="work-memo-ta" class="work-memo-input" rows="4" placeholder="作業の進捗・申し送りなど">${escapeHtml(cur)}</textarea>
    <div class="work-memo-btns">
      <button class="btn-sm" onclick="cancelEditWorkMemo('${carId}')">キャンセル</button>
      <button class="btn-sm btn-primary" onclick="saveWorkMemo('${carId}')">保存</button>
    </div>`;
  const ta = document.getElementById('work-memo-ta');
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

function cancelEditWorkMemo(carId) {
  const car = cars.find(c => c.id === carId);
  if (!car) return;
  renderDetailBody(car);
}

function saveWorkMemo(carId) {
  const car = cars.find(c => c.id === carId);
  if (!car) return;
  const ta = document.getElementById('work-memo-ta');
  const v = ta ? ta.value.trim() : '';
  car.workMemo = v;
  if (window.saveCarById) saveCarById(car.id); // v1.5.1.2
  addLog(carId, '作業メモを更新');
  renderDetailBody(car);
  renderAll();
  showToast('作業メモを保存しました');
}

async function onDetailPhoto(inp) {
  const car = cars.find(c => c.id === activeDetailCarId);
  if (!car) return;
  const file = inp.files[0];
  if (!file) return;
  // v1.5.10: Storage アップロード（フォールバック：data:URL）
  try {
    if (window.dbStorage && window.dbStorage.uploadCarPhoto) {
      showToast('写真をアップロード中...');
      car.photo = await window.dbStorage.uploadCarPhoto(car.id, file);
    } else {
      car.photo = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = e => resolve(e.target.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    }
    if (window.saveCarById) saveCarById(car.id);
    renderDetailBody(car);
    renderAll();
    showToast('写真を更新しました');
  } catch (err) {
    console.error('[car-detail] photo upload failed:', err);
    showToast('写真のアップロードに失敗しました');
  }
}

function toggleTaskToggle(carId, taskId, isD) {
  const car = cars.find(c => c.id === carId);
  if (!car) return;
  const state = isD ? car.deliveryTasks : car.regenTasks;
  state[taskId] = !state[taskId];
  if (window.saveCarById) saveCarById(car.id); // v1.5.1.2
  addLog(carId, `「${taskId}」を${state[taskId]?'完了':'未完了に戻す'}`);
  renderDetailBody(car);
  renderAll();
  showToast(state[taskId] ? '✓ 完了しました' : '未完了に戻しました');
}

// ========================================
// v0.8.9: 車両削除フロー
// v0.9.0: 削除ボタンは編集モーダル内（誤タップ防止）
// ========================================
let _deletingCarId = null;

function confirmDeleteCar(carId) {
  const car = cars.find(c => c.id === carId);
  if (!car) return;
  _deletingCarId = carId;
  const sub = document.getElementById('confirm-delete-sub');
  if (sub) {
    sub.innerHTML = `<strong>${escapeHtml(car.maker)} ${escapeHtml(car.model)}</strong>（${escapeHtml(car.num)}）<br>このデータは復元できません。本当に削除しますか？`;
  }
  document.getElementById('confirm-delete-car').classList.add('open');
}

function closeDeleteCarConfirm(doDelete) {
  document.getElementById('confirm-delete-car').classList.remove('open');
  if (!doDelete || !_deletingCarId) {
    _deletingCarId = null;
    return;
  }
  const idx = cars.findIndex(c => c.id === _deletingCarId);
  if (idx < 0) { _deletingCarId = null; return; }
  const removed = cars[idx];
  cars.splice(idx, 1);
  // v1.5.1: Firestore からも削除
  if (window.dbCars) {
    window.dbCars.deleteCar(removed.id).catch(e => console.error('[car-detail] delete failed', e));
  }
  // v1.5.10: Storage の写真も削除（fire-and-forget）
  if (window.dbStorage && window.dbStorage.deleteCarPhoto) {
    window.dbStorage.deleteCarPhoto(removed.id);
  }
  // v1.8.40: 編集中／詳細表示中の車両IDが削除済みの ID を指したままだと、
  //          以降の realtime 同期で「保護対象」と誤判定されて再生成される恐れがある。
  //          念のため両方クリアしておく（納車準備→削除でダッシュボード見込みが残る不具合の対策）。
  if (typeof editingCarId !== 'undefined' && String(editingCarId) === String(removed.id)) {
    editingCarId = null;
  }
  if (typeof activeDetailCarId !== 'undefined' && String(activeDetailCarId) === String(removed.id)) {
    activeDetailCarId = null;
  }
  // 開いているモーダルを両方閉じる
  closeModal('modal-car');
  closeModal('modal-detail');
  if (typeof renderDashboard === 'function') renderDashboard();
  renderAll();
  showToast(`${removed.maker} ${removed.model} を削除しました`);
  _deletingCarId = null;
}
