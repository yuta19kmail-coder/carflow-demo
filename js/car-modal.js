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
  document.getElementById('inp-year').value     = car?.year ? normalizeYear(car.year) : '';
  document.getElementById('inp-color').value    = car?.color || '';
  document.getElementById('inp-size').value     = car?.size || SIZES[0] || 'コンパクト';
  document.getElementById('inp-km').value       = car?.km || '';
  document.getElementById('inp-price').value    = car?.price || '';
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

  // 新規登録時は2ボタン、編集時は更新ボタン1つ＋削除ボタン
  const saveBtn = document.getElementById('car-save-btn');
  const otherBtn = document.getElementById('car-save-other-btn');
  const dangerZone = document.getElementById('edit-danger-zone');
  if (isEdit) {
    if (saveBtn) {
      saveBtn.textContent = '更新する';
      saveBtn.setAttribute('onclick', `saveCarModal('__edit__')`);
    }
    // v1.8.9: 「その他として登録」は新規登録専用。編集中は確実に隠す（!important で念入り）
    if (otherBtn) otherBtn.style.setProperty('display', 'none', 'important');
    if (dangerZone) dangerZone.style.display = '';
  } else {
    if (saveBtn) {
      saveBtn.textContent = '仕入れ車として登録';
      saveBtn.setAttribute('onclick', `saveCarModal('purchase')`);
    }
    if (otherBtn) otherBtn.style.removeProperty('display');
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

async function saveCarModal(initialCol) {
  // 新規登録時は initialCol で 'purchase' か 'other' を指定。編集時は無視。
  // v1.0.43: 管理番号は必須を解除（空欄でもOK）
  // v1.0.44: 自動採番もやめ、空欄なら空欄のまま保存
  const num = document.getElementById('inp-num').value.trim();
  const maker = document.getElementById('inp-maker').value.trim();
  const model = document.getElementById('inp-model').value.trim();
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
    car.year         = yearNorm || car.year;
    car.color        = document.getElementById('inp-color').value    || car.color;
    car.size         = document.getElementById('inp-size').value;
    car.km           = kmInp || car.km;
    car.price        = document.getElementById('inp-price').value    || '';
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
      id: newId, num, maker, model,
      year : yearNorm || '—',
      color: document.getElementById('inp-color').value    || '—',
      size : document.getElementById('inp-size').value,
      km   : kmInp || '0',
      price: document.getElementById('inp-price').value    || '',
      purchaseDate: document.getElementById('inp-purchase').value || todayStr(),
      contract: sellOn ? 1 : 0,
      contractDate,
      deliveryDate,
      memo : document.getElementById('inp-memo').value,
      photo: photoUrl,
      col: startCol,
      regenTasks: mkTaskState(REGEN_TASKS),
      deliveryTasks: mkTaskState(DELIVERY_TASKS),
      logs: []
    };
    addLog(car.id, `新規登録（${startCol === 'other' ? 'その他' : '仕入れ'}として）`);
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
    : (initialCol === 'other' ? `${maker} ${model} を「その他」として登録しました` : `${maker} ${model} を仕入れ車として登録しました`);
  showToast(okMsg);
}
