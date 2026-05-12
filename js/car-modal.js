// ========================================
// car-modal.js
// 車両登録/編集モーダル
// v0.8.9: 新規登録時は「仕入れ車として登録」「その他として登録」の2ボタン
// v0.9.0: 編集時のみ削除ボタン（危険ゾーン）を表示
// v1.0.43: 写真UIをモーダル最上部にヘッダー風で配置／管理番号必須を解除／写真反映バグ修正
// ========================================

// --- ボディサイズ設定UI ---
function renderSizeEditor() {
  const el = document.getElementById('size-editor');
  if (!el) return;
  if (!SIZES.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3)">区分がありません。下から追加してください。</div>';
    return;
  }
  el.innerHTML = SIZES.map((s,i) => `
    <div style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;margin-bottom:6px">
      <input type="text" value="${s.replace(/"/g,'&quot;')}" onchange="renameSizeOption(${i}, this.value)" style="flex:1;padding:4px 7px;background:var(--bg2);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:12px;outline:none">
      <button onclick="moveSizeOption(${i},-1)" ${i===0?'disabled':''} style="padding:3px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:5px;color:var(--text2);font-size:11px;cursor:pointer">▲</button>
      <button onclick="moveSizeOption(${i},1)" ${i===SIZES.length-1?'disabled':''} style="padding:3px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:5px;color:var(--text2);font-size:11px;cursor:pointer">▼</button>
      <button onclick="removeSizeOption(${i})" style="padding:3px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:5px;color:var(--red);font-size:11px;cursor:pointer">✕</button>
    </div>
  `).join('');
}

function addSizeOption() {
  const inp = document.getElementById('size-add-inp');
  const v = (inp.value||'').trim();
  if (!v) return;
  if (SIZES.includes(v)) { showToast('同じ区分が既にあります'); return; }
  SIZES.push(v);
  inp.value = '';
  renderSizeEditor();
  _refreshSizesDependentViews();
  showToast(`「${v}」を追加しました`);
  if (window.saveSettings) saveSettings(); // v1.5.2
}

// v1.0.31: SIZES（ボディサイズ区分）に依存する全ビューを強制再描画
function _refreshSizesDependentViews() {
  if (typeof renderExhibit === 'function') try { renderExhibit(); } catch(e){}
  if (typeof renderDeal === 'function')    try { renderDeal(); } catch(e){}
  if (typeof renderKanban === 'function')  try { renderKanban(); } catch(e){}
  if (typeof renderInventory === 'function') try { renderInventory(); } catch(e){}
  if (typeof renderTable === 'function')    try { renderTable(); } catch(e){}
  if (typeof renderProgress === 'function') try { renderProgress(); } catch(e){}
}

function renameSizeOption(i, newName) {
  const v = (newName||'').trim();
  if (!v) { renderSizeEditor(); return; }
  const old = SIZES[i];
  if (old === v) return;
  SIZES[i] = v;
  cars.forEach(c => { if (c.size === old) c.size = v; });
  renderSizeEditor();
  _refreshSizesDependentViews();
  // v1.5.2: settings + 影響を受けた cars を保存
  if (window.saveSettings) saveSettings();
  cars.forEach(c => { if (c.size === v && window.saveCarById) saveCarById(c.id); });
}

function moveSizeOption(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= SIZES.length) return;
  [SIZES[i], SIZES[j]] = [SIZES[j], SIZES[i]];
  renderSizeEditor();
  _refreshSizesDependentViews();
  if (window.saveSettings) saveSettings(); // v1.5.2
}

function removeSizeOption(i) {
  const name = SIZES[i];
  const used = cars.some(c => c.size === name);
  if (used && !confirm(`「${name}」を使用中の車両があります。削除しますか？（該当車両は未分類になります）`)) return;
  SIZES.splice(i, 1);
  if (used) cars.forEach(c => { if (c.size === name) c.size = SIZES[0] || ''; });
  renderSizeEditor();
  _refreshSizesDependentViews();
  showToast('区分を削除しました');
  // v1.5.2: settings + 影響を受けた cars を保存
  if (window.saveSettings) saveSettings();
  if (used) cars.forEach(c => { if (window.saveCarById) saveCarById(c.id); });
}

function resetSizeOptions() {
  if (!confirm('ボディサイズ区分を初期値に戻しますか？')) return;
  SIZES.length = 0;
  SIZES_DEFAULT.forEach(s => SIZES.push(s));
  renderSizeEditor();
  _refreshSizesDependentViews();
  showToast('初期値に戻しました');
  if (window.saveSettings) saveSettings(); // v1.5.2
}

function refreshSizeOptions(selected) {
  const sel = document.getElementById('inp-size');
  if (!sel) return;
  const prev = selected ?? sel.value;
  sel.innerHTML = SIZES.map(s => `<option${s===prev?' selected':''}>${s}</option>`).join('');
}

function refreshYearDatalist() {
  const dl = document.getElementById('dl-year');
  if (!dl) return;
  const cur = new Date().getFullYear();
  let html = '';
  for (let y = cur + 1; y >= cur - 30; y--) html += `<option value="${fmtYearDisplay(y)}">`;
  dl.innerHTML = html;
}

function refreshKmDatalist() {
  const dl = document.getElementById('dl-km');
  if (!dl) return;
  let html = '';
  for (let km = 5000; km <= 200000; km += 5000) {
    const label = km < 10000 ? `${km/1000}千km`
                             : (km % 10000 === 0 ? `${km/10000}万km` : `${(km/10000).toFixed(1)}万km`);
    html += `<option value="${km}" label="${label}">`;
  }
  dl.innerHTML = html;
}

function onYearBlur(inp) {
  if (!inp.value.trim()) return;
  inp.value = normalizeYear(inp.value);
}

function onKmBlur(inp) {
  const v = String(inp.value || '').replace(/[,\s]/g, '').replace(/km$/i, '');
  if (!v) return;
  const n = parseInt(v, 10);
  if (!isNaN(n) && n >= 0) inp.value = String(n);
}

function updateSellUI() {
  const sw = document.getElementById('sell-switch');
  const on = sw.classList.contains('on');
  document.getElementById('inp-contract-date').disabled = !on;
  document.getElementById('inp-delivery').disabled = !on;
  document.getElementById('sell-switch-hint').textContent = on ? 'ON：売約済み（日付を入力できます）' : 'OFF：未成約（売約日・納車予定日は編集できません）';
  if (!on) {
    document.getElementById('inp-contract-date').value = '';
    document.getElementById('inp-delivery').value = '';
  } else {
    if (!document.getElementById('inp-contract-date').value) {
      document.getElementById('inp-contract-date').value = todayStr();
    }
    if (!document.getElementById('inp-delivery').value) {
      const lead = (typeof appSettings !== 'undefined' && appSettings.deliveryLeadDays) || 14;
      document.getElementById('inp-delivery').value = dateAddDays(todayStr(), lead);
    }
  }
}

function onSellSwitchClick() {
  const sw = document.getElementById('sell-switch');
  const goingOn = !sw.classList.contains('on');
  if (goingOn) {
    const car = editingCarId ? cars.find(c => c.id === editingCarId) : null;
    const col = car ? car.col : 'purchase';
    if (!isDeliveryPhase(col)) {
      showEarlySellConfirm(col);
      return;
    }
  }
  sw.classList.toggle('on');
  updateSellUI();
}

function showEarlySellConfirm(col) {
  const label = COLS.find(c => c.id === col)?.label || col;
  document.getElementById('early-sell-sub').innerHTML =
    `まだ「${label}」ステータスです。<br>このタイミングで売約フラグを立てますか？`;
  document.getElementById('confirm-early-sell').classList.add('open');
}

function closeEarlySellConfirm(ok) {
  document.getElementById('confirm-early-sell').classList.remove('open');
  if (ok) {
    document.getElementById('sell-switch').classList.add('on');
    updateSellUI();
  }
}

function openCarModal(carId) {
  editingCarId = carId || null;
  formPhotoData = null;
  const car = carId ? cars.find(c => c.id === carId) : null;
  refreshSizeOptions(car?.size || 'コンパクト');
  refreshYearDatalist();
  refreshKmDatalist();
  document.getElementById('inp-num').value      = car?.num || '';
  document.getElementById('inp-maker').value    = car?.maker || '';
  document.getElementById('inp-model').value    = car?.model || '';
  const gradeEl = document.getElementById('inp-grade');
  if (gradeEl) gradeEl.value = car?.grade || '';
  document.getElementById('inp-year').value     = car?.year ? normalizeYear(car.year) : '';
  document.getElementById('inp-color').value    = car?.color || '';
  document.getElementById('inp-size').value     = car?.size || SIZES[0] || 'コンパクト';
  document.getElementById('inp-km').value       = car?.km || '';
  document.getElementById('inp-price').value    = car?.price || '';
  const totalEl = document.getElementById('inp-total-price');
  if (totalEl) totalEl.value = car?.totalPrice || '';
  // v1.8.59: 税ラベルをフォームのラベルに動的反映
  // v1.8.66: ボタン文言「税込で逆入力」「税抜で逆入力」も動的に
  const tlb = (typeof getTaxLabel === 'function') ? getTaxLabel('body')  : '税込';
  const tlt = (typeof getTaxLabel === 'function') ? getTaxLabel('total') : '税込';
  const lblP = document.getElementById('lbl-price');
  const lblT = document.getElementById('lbl-total-price');
  if (lblP) lblP.textContent = `本体価格 (${tlb}・円)`;
  if (lblT) lblT.textContent = `総額 (${tlt}・円)`;
  const btnP = document.getElementById('btn-alt-price');
  const btnT = document.getElementById('btn-alt-total-price');
  if (btnP) btnP.textContent = (tlb === '税抜' ? '税込で逆入力 ⇄' : '税抜で逆入力 ⇄');
  if (btnT) btnT.textContent = (tlt === '税抜' ? '税込で逆入力 ⇄' : '税抜で逆入力 ⇄');
  // v1.8.51: 選択制タスクのチェックUI（Phase B）
  _renderOptionalTaskPickers(car);
  document.getElementById('inp-purchase').value = car?.purchaseDate || todayStr();
  document.getElementById('inp-contract-date').value = car?.contractDate || '';
  document.getElementById('inp-delivery').value = car?.deliveryDate || '';
  document.getElementById('inp-memo').value     = car?.memo || '';
  const sw = document.getElementById('sell-switch');
  if (car?.contract) sw.classList.add('on'); else sw.classList.remove('on');
  updateSellUI();
  // v1.0.43: ヘッダー風プレビュー（モーダル最上部）。新規・編集 両方で表示
  _updateFormPhotoPreview(car?.photo || null);
  // ファイル input をリセット（同じファイルを連続で選んでも change が発火するように）
  const fileInp = document.getElementById('inp-photo-file');
  if (fileInp) fileInp.value = '';
  // v1.8.9: 編集モード判定を carId ベースに統一（cars 配列から find できない瞬間でも誤動作しない）
  const isEdit = !!carId;
  document.getElementById('car-modal-title').textContent = isEdit ? '車両情報を編集' : '新規車両登録';

  // v1.8.73: 新規登録は「登録区分カード3つ＋登録ボタン1つ」、編集時は更新ボタン1つ＋削除ボタン
  // v1.8.74: 編集時も区分カードを表示（オーダー⇔通常仕入⇔その他 を切替可能に）
  const saveBtn = document.getElementById('car-save-btn');
  const dangerZone = document.getElementById('edit-danger-zone');
  const regTypeRow = document.getElementById('register-type-row');
  const regTypeLabel = regTypeRow ? regTypeRow.querySelector('div') : null;
  if (isEdit) {
    if (saveBtn) {
      saveBtn.textContent = '更新する';
      saveBtn.setAttribute('onclick', `saveCarModal()`);
    }
    if (regTypeRow) regTypeRow.style.display = '';
    if (regTypeLabel) regTypeLabel.textContent = '登録区分（変更すると分類が切り替わります）';
    // 現在の状態から初期選択を決定
    let initType = 'purchase';
    if (car && car.col === 'other') initType = 'other';
    else if (car && car.isOrder) initType = 'order';
    _selectRegisterType(initType);
    if (dangerZone) dangerZone.style.display = '';
  } else {
    if (saveBtn) {
      saveBtn.textContent = '登録';
      saveBtn.setAttribute('onclick', `saveCarModal()`);
    }
    if (regTypeRow) regTypeRow.style.display = '';
    if (regTypeLabel) regTypeLabel.textContent = '登録区分';
    // 区分は「通常仕入」をデフォルト選択にリセット
    _selectRegisterType('purchase');
    if (dangerZone) dangerZone.style.display = 'none';
  }
  document.getElementById('modal-car').classList.add('open');
}

function onEditDeleteClick() {
  if (!editingCarId) return;
  if (typeof confirmDeleteCar === 'function') {
    confirmDeleteCar(editingCarId);
  }
}

// v1.0.43: event/this 両対応に修正。プレビューはヘッダー風（モーダル最上部）
function onFormPhoto(inpOrEvent) {
  const inp = (inpOrEvent && inpOrEvent.target) ? inpOrEvent.target : inpOrEvent;
  if (!inp || !inp.files) return;
  const file = inp.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    formPhotoData = e.target.result;
    _updateFormPhotoPreview(formPhotoData);
  };
  r.readAsDataURL(file);
}

// v1.0.43: ヘッダー風プレビューを更新
function _updateFormPhotoPreview(src) {
  const hero = document.getElementById('inp-photo-hero');
  if (!hero) return;
  if (src) {
    hero.innerHTML = `<img src="${src}" style="width:100%;height:100%;object-fit:cover;display:block">`;
    hero.classList.add('has-photo');
  } else {
    hero.innerHTML = '<div class="hero-empty">📷<br><span>写真未設定</span></div>';
    hero.classList.remove('has-photo');
  }
}

// v1.0.43: 写真変更ボタン経由で hidden input をクリック
function triggerFormPhotoPick() {
  const inp = document.getElementById('inp-photo-file');
  if (inp) inp.click();
}

// v1.0.43: 写真をクリアして未設定に戻す
function clearFormPhoto() {
  formPhotoData = null;
  const inp = document.getElementById('inp-photo-file');
  if (inp) inp.value = '';
  // 編集時：すでに保存済みの photo もクリアの意思表示として null マーク
  if (editingCarId) {
    const car = cars.find(c => c.id === editingCarId);
    if (car) car.photo = '';
  }
  _updateFormPhotoPreview(null);
}

// v1.8.73: 登録区分カードのクリックハンドラ
function _selectRegisterType(value) {
  document.querySelectorAll('#register-type-options .reg-type-card').forEach(card => {
    const v = card.getAttribute('data-value');
    if (v === value) {
      card.classList.add('selected');
      const r = card.querySelector('input[type=radio]');
      if (r) r.checked = true;
    } else {
      card.classList.remove('selected');
    }
  });
}
window._selectRegisterType = _selectRegisterType;

// クリックでカードを選択（ラジオの代わり）
document.addEventListener('click', function (e) {
  const card = e.target.closest('#register-type-options .reg-type-card');
  if (!card) return;
  const v = card.getAttribute('data-value');
  if (v) _selectRegisterType(v);
});

function _getSelectedRegisterType() {
  const checked = document.querySelector('#register-type-options input[name=register-type]:checked');
  return (checked && checked.value) || 'purchase';
}

async function saveCarModal(initialCol) {
  // v1.8.73: 引数省略時は登録区分カードから選択値を読む（新規登録）
  if (!initialCol) {
    initialCol = editingCarId ? '__edit__' : _getSelectedRegisterType();
  }
  // v1.0.43: 管理番号は必須を解除（空欄でもOK）
  // v1.0.44: 自動採番もやめ、空欄なら空欄のまま保存
  const num = document.getElementById('inp-num').value.trim();
  const maker = document.getElementById('inp-maker').value.trim();
  const model = document.getElementById('inp-model').value.trim();
  const gradeInp = document.getElementById('inp-grade');
  const grade = gradeInp ? gradeInp.value.trim() : '';
  const totalInp = document.getElementById('inp-total-price');
  const totalPrice = totalInp ? totalInp.value.trim() : '';
  if (!maker || !model) {
    showToast('メーカー・車種は必須です');
    return;
  }
  const sellOn = document.getElementById('sell-switch').classList.contains('on');
  const contractDate = sellOn ? (document.getElementById('inp-contract-date').value || todayStr()) : '';
  const deliveryDate = sellOn ? (document.getElementById('inp-delivery').value || '') : '';
  const yearNorm = normalizeYear(document.getElementById('inp-year').value);
  const kmInp = String(document.getElementById('inp-km').value || '').replace(/[,\s]/g, '').replace(/km$/i, '');

  if (editingCarId) {
    const car = cars.find(c => c.id === editingCarId);
    if (!car) return;
    car.num = num; car.maker = maker; car.model = model;
    car.grade = grade;
    // v1.8.51: 選択制タスクのopt-in状態を保存
    car.selectedTasks = _readOptionalTaskSelection();
    // v1.8.74: 編集時の区分変更（カード）を反映
    const newType = _getSelectedRegisterType();
    if (newType === 'other') {
      car.col = 'other';
      car.isOrder = false;
    } else if (newType === 'order') {
      if (car.col === 'other') car.col = 'purchase';
      car.isOrder = true;
    } else {
      // 'purchase' = 通常仕入
      if (car.col === 'other') car.col = 'purchase';
      car.isOrder = false;
    }
    car.year         = yearNorm || car.year;
    car.color        = document.getElementById('inp-color').value    || car.color;
    car.size         = document.getElementById('inp-size').value;
    car.km           = kmInp || car.km;
    car.price        = document.getElementById('inp-price').value    || '';
    car.totalPrice   = totalPrice;
    car.purchaseDate = document.getElementById('inp-purchase').value || car.purchaseDate;
    car.contract     = sellOn ? 1 : 0;
    car.contractDate = contractDate;
    car.deliveryDate = deliveryDate;
    car.memo         = document.getElementById('inp-memo').value;
    if (formPhotoData) {
      // v1.5.10: 新規 data:URL なら Storage にアップロード
      if (window.dbStorage && formPhotoData.startsWith && formPhotoData.startsWith('data:')) {
        try {
          const blob = window.dbStorage._dataUrlToBlob(formPhotoData);
          if (blob) car.photo = await window.dbStorage.uploadCarPhoto(car.id, blob);
          else car.photo = formPhotoData;
        } catch (e) {
          console.warn('[car-modal] Storage アップロード失敗、data:URL で保存:', e);
          car.photo = formPhotoData;
        }
      } else {
        car.photo = formPhotoData;
      }
    }
    addLog(editingCarId, '車両情報を編集');
    if (window.dbCars) {
      window.dbCars.saveCar(car).catch(e => console.error('[car-modal] save failed', e));
    }
    closeModal('modal-car');
    if (document.getElementById('modal-detail').classList.contains('open')) renderDetailBody(car);
  } else {
    // v1.8.72: 'order' は購入列スタート＋ isOrder=true。売約フラグは自動セットしない（手動）。
    const isOrder = (initialCol === 'order');
    const startCol = (initialCol === 'other') ? 'other' : 'purchase';
    const newId = uid();
    let photoUrl = formPhotoData;
    // v1.5.10: 新規登録時も Storage 化
    if (formPhotoData && window.dbStorage && formPhotoData.startsWith && formPhotoData.startsWith('data:')) {
      try {
        const blob = window.dbStorage._dataUrlToBlob(formPhotoData);
        if (blob) photoUrl = await window.dbStorage.uploadCarPhoto(newId, blob);
      } catch (e) {
        console.warn('[car-modal] Storage アップロード失敗、data:URL で保存:', e);
      }
    }
    const car = {
      id: newId, num, maker, model, grade,
      year : yearNorm || '—',
      color: document.getElementById('inp-color').value    || '—',
      size : document.getElementById('inp-size').value,
      km   : kmInp || '0',
      price: document.getElementById('inp-price').value    || '',
      totalPrice,
      purchaseDate: document.getElementById('inp-purchase').value || todayStr(),
      contract: sellOn ? 1 : 0,
      contractDate,
      deliveryDate,
      memo : document.getElementById('inp-memo').value,
      photo: photoUrl,
      isOrder: isOrder, // v1.8.72: オーダー車両フラグ
      col: startCol,
      regenTasks: mkTaskState(REGEN_TASKS),
      deliveryTasks: mkTaskState(DELIVERY_TASKS),
      // v1.8.51: 選択制タスクのopt-in（Phase B）
      selectedTasks: _readOptionalTaskSelection(),
      logs: []
    };
    const regKind = isOrder ? 'オーダー車両' : (startCol === 'other' ? 'その他' : '仕入れ');
    addLog(car.id, `新規登録（${regKind}として）`);
    cars.push(car);
    if (window.dbCars) {
      window.dbCars.saveCar(car).catch(e => console.error('[car-modal] save failed', e));
    }
    closeModal('modal-car');
    renderDashboard();
  }
  renderAll();
  const okMsg = editingCarId
    ? '情報を更新しました'
    : (initialCol === 'other' ? `${maker} ${model} を「その他」として登録しました`
       : initialCol === 'order' ? `${maker} ${model} を「オーダー車両」として登録しました`
       : `${maker} ${model} を仕入れ車として登録しました`);
  showToast(okMsg);
}

// ====================================================================
// v1.8.66: 価格欄の「逆入力」ボタン
//   その欄が税抜設定なら → 税込金額を入れて自動で税抜に換算
//   その欄が税込設定なら → 税抜金額を入れて自動で税込に換算
//   消費税率は 10%（固定）。後で変えたい場合は TAX_RATE を変更。
// ====================================================================
function promptAltPrice(which) {
  // v1.8.67: 税率は設定 (appSettings.priceTax.rate %) から取得
  const TAX_RATE = (typeof getTaxRate === 'function') ? getTaxRate() : 0.10;
  const setting = (typeof appSettings !== 'undefined' && appSettings.priceTax) || {};
  const fieldMode = (setting[which] === 'excl') ? 'excl' : 'incl';   // 現在の欄の扱い
  const fieldLabel = fieldMode === 'excl' ? '税抜' : '税込';
  const altLabel   = fieldMode === 'excl' ? '税込' : '税抜';
  const fieldName  = which === 'body' ? '本体価格' : '総額';
  const inputId    = which === 'body' ? 'inp-price' : 'inp-total-price';

  const raw = prompt(`${fieldName} の ${altLabel} 金額を入力してください\n（消費税10%で自動換算して ${fieldLabel} の値を入れます）`, '');
  if (raw == null) return;
  const cleaned = String(raw).replace(/[,\s]/g, '').replace(/円$/, '');
  const n = parseInt(cleaned, 10);
  if (!Number.isFinite(n) || n <= 0) {
    if (typeof showToast === 'function') showToast('数値を入力してください');
    return;
  }
  let converted;
  if (fieldMode === 'excl') {
    // 税込 → 税抜
    converted = Math.round(n / (1 + TAX_RATE));
  } else {
    // 税抜 → 税込
    converted = Math.round(n * (1 + TAX_RATE));
  }
  const el = document.getElementById(inputId);
  if (el) el.value = String(converted);
  if (typeof showToast === 'function') {
    showToast(`${altLabel} ${n.toLocaleString()}円 → ${fieldLabel} ${converted.toLocaleString()}円 で入力しました`);
  }
}
window.promptAltPrice = promptAltPrice;

// ====================================================================
// v1.8.51: 選択制タスクのチェックUI（Phase B）
// 編集時は既存 car.selectedTasks をチェック反映。新規時は全部OFF。
// ====================================================================
function _renderOptionalTaskPickers(car) {
  const head = document.getElementById('inp-optional-tasks-head');
  const body = document.getElementById('inp-optional-tasks-body');
  if (!head || !body) return;

  const phases = [
    { key: 'regen',    label: '🔧 展示準備フェーズ' },
    { key: 'delivery', label: '📦 納車準備フェーズ' },
  ];
  const sel = (car && car.selectedTasks) || {};
  let html = '';
  let anyOptional = false;
  phases.forEach(ph => {
    const tasks = (typeof getAllTasksForUI === 'function') ? getAllTasksForUI(ph.key) : [];
    const optTasks = tasks.filter(t => t.enabled && t.optional);
    if (optTasks.length === 0) return;
    anyOptional = true;
    html += `<div style="font-size:11px;color:var(--text3);font-weight:700;margin:6px 0 4px">${ph.label}</div>`;
    optTasks.forEach(t => {
      const carSel = (sel[ph.key] && sel[ph.key][t.id] === true);
      html += `
        <label style="display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:pointer;font-size:13px;border-bottom:1px dashed var(--border)">
          <input type="checkbox" data-phase="${ph.key}" data-task-id="${t.id.replace(/"/g,'&quot;')}" ${carSel ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer">
          <span style="font-size:14px">${t.icon || '📋'}</span>
          <span>${(t.name || '').replace(/</g,'&lt;')}</span>
        </label>`;
    });
  });

  if (!anyOptional) {
    head.style.display = 'none';
    body.style.display = 'none';
    body.innerHTML = '';
    return;
  }
  head.style.display = '';
  body.style.display = '';
  body.innerHTML = html + '<div style="font-size:11px;color:var(--text3);margin-top:6px">※ チェックを入れた大タスクだけが、この車両のリストに表示されます</div>';
}

// モーダルの状態を読み取って selectedTasks 形式に変換する
function _readOptionalTaskSelection() {
  const body = document.getElementById('inp-optional-tasks-body');
  const out = { regen: {}, delivery: {} };
  if (!body) return out;
  body.querySelectorAll('input[type="checkbox"][data-phase]').forEach(inp => {
    const ph = inp.getAttribute('data-phase');
    const id = inp.getAttribute('data-task-id');
    if (!ph || !id) return;
    if (!out[ph]) out[ph] = {};
    if (inp.checked) out[ph][id] = true;
  });
  return out;
}
