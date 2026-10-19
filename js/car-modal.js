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
      <button onclick="moveSizeOption(${i},-1)" ${i===0?'disabled':''} style="padding:3px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:5px;color:var(--text2);font-size:11px;cursor:pointer">${ic('chevUp','▲',14)}</button>
      <button onclick="moveSizeOption(${i},1)" ${i===SIZES.length-1?'disabled':''} style="padding:3px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:5px;color:var(--text2);font-size:11px;cursor:pointer">${ic('chevDown','▼',14)}</button>
      <button onclick="removeSizeOption(${i})" style="padding:3px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:5px;color:var(--red);font-size:11px;cursor:pointer">${ic('close','✕',15)}</button>
    </div>
  `).join('');
}

function addSizeOption() {
  const inp = document.getElementById('size-add-inp');
  const v = (inp.value||'').trim();
  if (!v) return;
  if (SIZES.includes(v)) { showToast('同じ区分が既にあります', 'CF-1002'); return; }
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
  const hit = cars.filter(c => c.size === old);
  hit.forEach(c => { c.size = v; });
  renderSizeEditor();
  _refreshSizesDependentViews();
  // v1.5.2: settings + 影響を受けた cars を保存
  if (window.saveSettings) saveSettings();
  // v3.0.0 区分の欄だけを送る／📝 v3.16.5 車ごとに記録（フロー＋操作ログ）も同じまとめ書きで
  _cfSaveSizeChange(hit.map(c => ({ car: c, from: old, to: v })), '区分の名前変更');
}

/* 📝 v3.16.5 ボディサイズ区分の名前変更・削除で書き換えた車ごとに、size と「区分 ◯→◯（理由）」の1行を
   車のフロー（logs）と操作ログ（auditLogs）へ、1回のまとめ書きで送る（前は欄だけ書いて記録が無かった）。
   ⚠ 1台につき2件書く＝まとめ書きの上限（500）に収まるよう 200台ずつ */
async function _cfSaveSizeChange(list, why) {
  if (!list || !list.length) return;
  const db = window.fb && window.fb.db;
  const FV = window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue;
  const auditCol = window.dbAudit && window.dbAudit.col ? window.dbAudit.col() : null;
  if (!db || !FV || typeof window._cfMakeLogEntry !== 'function') {
    list.forEach(x => { if (window.saveCarPaths) window.saveCarPaths(x.car.id, [{ path: ['size'], value: x.car.size }]); });
    return;
  }
  const carsCol = db.collection('companies').doc(window.fb.currentCompanyId).collection('cars');
  for (let k = 0; k < list.length; k += 200) {
    const part = list.slice(k, k + 200);
    const batch = db.batch();
    const done = [];
    part.forEach(x => {
      const entry = window._cfMakeLogEntry(x.car.id, `区分 ${x.from || '未分類'}→${x.to || '未分類'}（${why}）`);
      batch.update(carsCol.doc(String(x.car.id)), {
        size: x.to || '', logs: FV.arrayUnion(entry),
        updatedAt: window.fb.serverTimestamp(), updatedBy: (window.fb.currentUser && window.fb.currentUser.uid) || null,
      });
      if (auditCol) batch.set(auditCol.doc(), window.dbAudit.docOf(entry));
      done.push([x.car, entry]);
    });
    try {
      await batch.commit();
      done.forEach(([c, e]) => window._cfLogCommitted(c, e));
    } catch (e) {
      console.error('[car-modal] 区分の書き換えを保存できませんでした', e);
      showToast('区分の書き換えを保存できませんでした（通信または権限を確認してください）', 'CF-1025');
      return;
    }
  }
}

function moveSizeOption(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= SIZES.length) return;
  [SIZES[i], SIZES[j]] = [SIZES[j], SIZES[i]];
  renderSizeEditor();
  _refreshSizesDependentViews();
  if (window.saveSettings) saveSettings(); // v1.5.2
}

async function removeSizeOption(i) {
  const name = SIZES[i];
  const used = cars.some(c => c.size === name);
  if (used && !(await cfAsk(`「${name}」を使用中の車両があります。削除しますか？`, { detail: '該当車両は未分類になります', ok: '削除する', danger: true }))) return;   /* v3.16.7（B-03） */
  i = SIZES.indexOf(name);   /* 窓を開いている間に並びが変わっていても、名前で消す */
  if (i < 0) return;
  SIZES.splice(i, 1);
  const hit = used ? cars.filter(c => c.size === name) : [];
  hit.forEach(c => { c.size = SIZES[0] || ''; });
  renderSizeEditor();
  _refreshSizesDependentViews();
  showToast('区分を削除しました');
  // v1.5.2: settings + 影響を受けた cars を保存
  if (window.saveSettings) saveSettings();
  // v3.0.0 区分の欄だけを送る（前は区分を使っていない車まで全部送っていた）／📝 v3.16.5 記録も同じまとめ書きで
  _cfSaveSizeChange(hit.map(c => ({ car: c, from: name, to: c.size })), '区分の削除');
}

async function resetSizeOptions() {
  if (!(await cfAsk('ボディサイズ区分を初期値に戻しますか？', { ok: '初期値に戻す' }))) return;   /* v3.16.7（B-03） */
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
  /* 🔐 v3.16.4（S-29）保存済みの売約を外す時だけ止める（この画面で入れたばかりの ON を戻すのは自由） */
  if (!goingOn && editingCarId && _editBase && _editBase.contract) {
    const car = cars.find(c => c.id === editingCarId);
    if (car && _cfIsDeliveredCol(car.col)) {
      showToast('納車準備・納車完了の車は、スイッチでは売約を外せません。下の［売約取消］を使います（管理者だけ）', 'CF-0027');
      return;
    }
    if (car && !cfCanUnsell(car)) { showToast(cfUnsellDenyText(car), 'CF-0027'); return; }
  }
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

// v2.10.8: 納車準備前フェーズで売約ONにした時の2段階確認
//   1段目「納車準備に移動しますか？」→ はい＝移動して売約 / いいえ＝2段目へ / キャンセル＝戻る
//   2段目「このフェーズのまま売約にしますか？」→ はい＝フェーズ据え置きで売約（従来挙動）/ キャンセル＝戻る
let _sellMoveToDelivery = false;

function showEarlySellConfirm(col) {
  _sellMoveToDelivery = false;
  _earlySellStep1(col);
  document.getElementById('confirm-early-sell').classList.add('open');
}
function _earlySellStep1(col) {
  const label = COLS.find(c => c.id === col)?.label || col;
  document.getElementById('early-sell-title').textContent = '売約にしますか？';
  document.getElementById('early-sell-sub').innerHTML =
    `いまは「${label}」です。<br>売約にすると同時に「納車準備」へ移動しますか？`;
  document.getElementById('early-sell-btns').innerHTML =
    '<button class="btn-sm" onclick="closeEarlySellConfirm(false)">キャンセル</button>'
    + '<button class="btn-sm" onclick="_earlySellStep2()">いいえ</button>'
    + '<button class="btn-primary" onclick="_earlySellChooseMove()">はい、納車準備へ</button>';
}
function _earlySellStep2() {
  const car = editingCarId ? cars.find(c => c.id === editingCarId) : null;
  const col = car ? car.col : 'purchase';
  const label = COLS.find(c => c.id === col)?.label || col;
  document.getElementById('early-sell-title').textContent = 'このまま売約にしますか？';
  document.getElementById('early-sell-sub').innerHTML =
    `「${label}」の状態のまま、売約だけ立てます。<br>（フェーズは移動しません）`;
  document.getElementById('early-sell-btns').innerHTML =
    '<button class="btn-sm" onclick="closeEarlySellConfirm(false)">キャンセル</button>'
    + '<button class="btn-primary" onclick="_earlySellChooseStay()">このまま売約にする</button>';
}
function _earlySellChooseMove() { _sellMoveToDelivery = true;  _earlySellApplyOn(); }
function _earlySellChooseStay() { _sellMoveToDelivery = false; _earlySellApplyOn(); }
function _earlySellApplyOn() {
  document.getElementById('confirm-early-sell').classList.remove('open');
  document.getElementById('sell-switch').classList.add('on');
  updateSellUI();
}
function closeEarlySellConfirm(ok) {
  // ok=false：キャンセル（変更なし＝車両詳細に戻る）。ok=true は旧互換（このまま売約）
  document.getElementById('confirm-early-sell').classList.remove('open');
  if (ok) {
    _sellMoveToDelivery = false;
    document.getElementById('sell-switch').classList.add('on');
    updateSellUI();
  }
}

/* 🔴 v3.16.0（棚卸し S-08）編集を開いた時の値の控え。保存は「ここから変えた欄だけ」を送る。
   ＝開いている間にほかの人が変えた納車日・状態・フロー・見積などを、古い中身で書き戻さない。 */
const _EDIT_KEYS = ['num', 'maker', 'model', 'grade', 'selectedTasks', 'col', 'isOrder', 'year', 'color', 'size', 'km',
  'price', 'totalPrice', 'purchaseDate', 'contract', 'contractDate', 'deliveryDate', 'customerName', 'memo', 'photo',
  'origin', 'keiHand'];   /* v3.18.0 🚗 国産／輸入・軽を手で直した印（js/car-class-ui.js・空＝自動） */
let _editBase = null;
let _formPhotoCleared = false;
let _autoNumShown = null;   /* v3.16.7（A-34）新規登録で画面が自動で入れた管理番号 */
function _cloneVal(v) { return (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v; }
function _stableJson(v) {
  if (Array.isArray(v)) return '[' + v.map(_stableJson).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + _stableJson(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function _sameVal(a, b) {
  /* 空・未設定・false・0・空の箱は同じ扱い（古い車に欄が無いだけで「変えた」にしない） */
  const n = v => {
    if (v === undefined || v === null || v === false || v === 0 || v === '') return '';
    if (v === true) return 1;   /* v3.16.2 古い車の contract:true と画面の 1 を同じに（「売約 あり → あり」を出さない） */
    if (typeof v === 'object' && !Array.isArray(v)) {   /* 中の空の欄は落として比べる（{ regen:{}, delivery:{} } も空） */
      const o = {};
      Object.keys(v).forEach(k => { const x = n(v[k]); if (x !== '') o[k] = x; });
      return Object.keys(o).length ? o : '';
    }
    if (Array.isArray(v) && !v.length) return '';
    return v;
  };
  a = n(a); b = n(b);
  if (typeof a === 'object' || typeof b === 'object') return _stableJson(a) === _stableJson(b);
  return String(a) === String(b);
}

function openCarModal(carId) {
  editingCarId = carId || null;
  formPhotoData = null;
  _formPhotoCleared = false;
  _sellMoveToDelivery = false;
  const car = carId ? cars.find(c => c.id === carId) : null;
  _editBase = null;
  if (car) { _editBase = {}; _EDIT_KEYS.forEach(k => { _editBase[k] = _cloneVal(car[k]); }); }
  refreshSizeOptions(car?.size || 'コンパクト');
  refreshYearDatalist();
  refreshKmDatalist();
  // v2.16.0: 新規登録なら「次の番号」を自動プリセット。編集時は既存値を維持。
  const numInp = document.getElementById('inp-num');
  if (!carId) {
    numInp.value = (window.numHelpers && typeof window.numHelpers.nextNum === 'function')
      ? window.numHelpers.nextNum() : '';
    _autoNumShown = numInp.value;   /* v3.16.7（A-34）保存の時に「自動の番号のままか」を見るための控え */
  } else {
    _autoNumShown = null;
    numInp.value = car?.num || '';
  }
  _attachNumDupCheck();
  _runNumDupCheck();
  document.getElementById('inp-maker').value    = car?.maker || '';
  document.getElementById('inp-model').value    = car?.model || '';
  const gradeEl = document.getElementById('inp-grade');
  if (gradeEl) gradeEl.value = car?.grade || '';
  document.getElementById('inp-year').value     = car?.year ? normalizeYear(car.year) : '';
  document.getElementById('inp-color').value    = car?.color || '';
  document.getElementById('inp-size').value     = car?.size || SIZES[0] || 'コンパクト';
  if (window.ccUi) window.ccUi.open(car);   /* v3.18.0 🚗 国産／輸入・軽（メーカー・ボディを入れた後に描く） */
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
  if (btnP) btnP.innerHTML = icoE((tlb === '税抜' ? '税込で逆入力 ⇄' : '税抜で逆入力 ⇄'));
  if (btnT) btnT.innerHTML = icoE((tlt === '税抜' ? '税込で逆入力 ⇄' : '税抜で逆入力 ⇄'));
  // v1.8.51: 選択制タスクのチェックUI（Phase B）
  _renderOptionalTaskPickers(car);
  document.getElementById('inp-purchase').value = car?.purchaseDate || todayStr();
  document.getElementById('inp-contract-date').value = car?.contractDate || '';
  document.getElementById('inp-delivery').value = car?.deliveryDate || '';
  { const _cn = document.getElementById('inp-customer-name'); if (_cn) _cn.value = car?.customerName || ''; } // v2.26.0
  document.getElementById('inp-memo').value     = car?.memo || '';
  const sw = document.getElementById('sell-switch');
  if (car?.contract) sw.classList.add('on'); else sw.classList.remove('on');
  updateSellUI();
  /* 🔐 v3.16.4（S-29）売約を外せる人・外し方の説明と［売約取消］（納車済みの車・管理者だけ） */
  {
    const note = document.getElementById('sell-lock-note');
    const ub = document.getElementById('btn-unsell');
    let txt = '', showBtn = false;
    if (car && car.contract) {
      if (_cfIsDeliveredCol(car.col)) {
        showBtn = cfCanUnsell(car);
        txt = showBtn ? '納車準備・納車完了の車の売約は、スイッチではなく［売約取消］で外します（理由が必要）'
                      : '納車準備・納車完了の車の売約取消は、管理者だけができます';
      } else if (!cfCanUnsell(car)) {
        txt = '売約を外せるのはマネージャー以上です';
      }
    }
    if (note) { note.textContent = txt; note.style.display = txt ? '' : 'none'; }
    if (ub) ub.style.display = showBtn ? '' : 'none';
  }
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
    hero.innerHTML = '<div class="hero-empty">'+ic('camera','📷',16)+'<br><span>写真未設定</span></div>';
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
  // 編集時：すでに保存済みの photo もクリアの意思表示（v3.16.0 車には直接書かず印だけ＝保存の時に変えた欄として送る）
  if (editingCarId) _formPhotoCleared = true;
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

/* 🔴 v3.16.9 保存ボタンの二度押し止め。管理番号の書類（transaction）や保存を待つ間に、もう一度押すと
   車が2台できていた（新規）。保存中はボタンを押せなくし、終わったら（失敗しても）戻す */
let _carSaveBusy = false;
async function saveCarModal(initialCol) {
  if (_carSaveBusy) return;
  _carSaveBusy = true;
  const btn = document.getElementById('car-save-btn');
  if (btn) btn.disabled = true;
  try {
    return await _saveCarModalBody(initialCol);
  } finally {
    _carSaveBusy = false;
    if (btn) btn.disabled = false;
  }
}
async function _saveCarModalBody(initialCol) {
  let _saveFailed = false;
  let _numMoved = '';   /* v3.16.7（A-34）番号が変わった時の知らせ */
  const _wasEdit = !!editingCarId;   /* v3.16.0 閉じると editingCarId が空になるので先に控える */   /* 🔴 2026-08-05：保存できたかどうか。最後のメッセージを正直に出すために使う */
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
  const customerName = (typeof normCustomerName === 'function') ? normCustomerName(document.getElementById('inp-customer-name')?.value || '') : (document.getElementById('inp-customer-name')?.value || '').trim(); // v2.26.0/2.26.1: スペース半角化
  const yearNorm = normalizeYear(document.getElementById('inp-year').value);
  const kmInp = String(document.getElementById('inp-km').value || '').replace(/[,\s]/g, '').replace(/km$/i, '');

  if (editingCarId) {
    const car = cars.find(c => c.id === editingCarId);
    if (!car) {
      /* v3.16.0 開いている間に、ほかの端末で締められた・消された車＝作り直さない */
      closeModal('modal-car');
      showToast('この車は、ほかの端末で締められたか削除されたため保存できませんでした', 'CF-1015');
      return;
    }
    const base = _editBase || {};
    const editId = editingCarId;
    /* 🔴🔴 v3.16.0（棚卸し S-08）**開いた時から変えた欄だけ**を送る（saveCarPaths＝update）。
       前は車の中身を手元の写しで丸ごと set(merge) していたので、開いている間にほかの人が変えた
       納車日・状態・フロー・見積・展示開始日などを古い値に戻していた（消えた車も作り直していた）。
       ・新しい値は「開いた時の値（base）＋フォーム」から作る。手元の car に届いた他人の変更は触らない
       ・update なので、サーバーに無い車は作らない */
    const next = {};
    next.num = num; next.maker = maker; next.model = model; next.grade = grade;
    next.selectedTasks = _readOptionalTaskSelection();   // v1.8.51: 選択制タスクのopt-in
    // v1.8.74: 編集時の区分変更（カード）。今の列は「開いた時の列」から決める
    const newType = _getSelectedRegisterType();
    let col = base.col, isOrder = base.isOrder;
    if (newType === 'other') {
      col = 'other'; isOrder = false;
    } else if (newType === 'order') {
      if (col === 'other') col = 'purchase';
      isOrder = true;
    } else {
      if (col === 'other') col = 'purchase';
      isOrder = false;
    }
    next.year         = yearNorm || base.year;
    /* 開いた時の年式を整えただけ（書き方の違いだけ）なら「変えた」にしない */
    if (yearNorm && base.year && normalizeYear(base.year) === yearNorm) next.year = base.year;
    next.color        = document.getElementById('inp-color').value || base.color;
    next.size         = document.getElementById('inp-size').value;
    next.km           = kmInp || base.km;
    next.price        = document.getElementById('inp-price').value || '';
    next.totalPrice   = totalPrice;
    next.purchaseDate = document.getElementById('inp-purchase').value || base.purchaseDate;
    next.contract     = sellOn ? 1 : 0;
    next.contractDate = contractDate;
    next.deliveryDate = deliveryDate;
    next.customerName = customerName; // v2.26.0: 売約のお客様（名前のみ保存・表示時に「様」付与）
    next.memo         = document.getElementById('inp-memo').value;
    if (window.ccUi) { const cc = window.ccUi.read(); next.origin = cc.origin || ''; next.keiHand = cc.keiHand || ''; }   /* v3.18.0 */
    let moved = false;
    // v2.10.8: 売約と同時に「納車準備」へ移動を選んだ場合だけフェーズを動かす（手動ドラッグと同じ状態）
    if (sellOn && _sellMoveToDelivery && car.col !== 'delivery' && car.col !== 'done') {
      col = 'delivery';
      moved = true;
    }
    _sellMoveToDelivery = false;
    next.col = col;
    next.isOrder = isOrder;
    if (formPhotoData) {
      // v1.5.10: 新規 data:URL なら Storage にアップロード
      if (window.dbStorage && formPhotoData.startsWith && formPhotoData.startsWith('data:')) {
        try {
          const blob = window.dbStorage._dataUrlToBlob(formPhotoData);
          if (blob) next.photo = await window.dbStorage.uploadCarPhoto(car.id, blob);
          else next.photo = formPhotoData;
        } catch (e) {
          console.warn('[car-modal] Storage アップロード失敗、data:URL で保存:', e);
          next.photo = formPhotoData;
        }
      } else {
        next.photo = formPhotoData;
      }
    } else if (_formPhotoCleared) {
      next.photo = '';
    } else {
      next.photo = base.photo;
    }
    _formPhotoCleared = false;

    let changed = _EDIT_KEYS.filter(k => !_sameVal(next[k], base[k]));
    /* 🔐 v3.16.4（S-29）保存済みの売約を外す＝売約取消。権限と理由を確かめ、売約の3欄だけは記録と同じ1回で先に送る */
    if (base.contract && !next.contract) {
      if (_cfIsDeliveredCol(car.col)) {
        showToast('納車準備・納車完了の車は、スイッチでは売約を外せません。［売約取消］を使います（管理者だけ）', 'CF-0027');
        return;
      }
      if (!cfCanUnsell(car)) { showToast(cfUnsellDenyText(car), 'CF-0027'); return; }
      const reason = await cfAskText('売約取消の理由', '', { detail: '売約日・納車予定日を空にします。前の値は記録に残ります。', placeholder: '例：お客様都合でキャンセル', danger: true, ok: '売約取消' });   /* v3.16.7（B-03） */
      if (reason == null) return;
      if (!String(reason).trim()) { showToast('売約取消の理由を入れてください', 'CF-1020'); return; }
      const done = await cfUnsellCar(editId, null, reason, '車両情報の編集');
      if (!done) return;
      changed = changed.filter(k => ['contract', 'contractDate', 'deliveryDate'].indexOf(k) < 0);
      if (!changed.length) {
        closeModal('modal-car');
        if (document.getElementById('modal-detail').classList.contains('open')) renderDetailBody(car);
        renderAll();
        showToast('売約を取り消しました');
        return;
      }
    }
    if (!changed.length) {
      closeModal('modal-car');
      showToast('変更はありませんでした');
      return;
    }
    /* 画面にもすぐ出す（変えた欄だけ手元の車へ） */
    changed.forEach(k => { car[k] = _cloneVal(next[k]); });

    /* 📝 v3.16.0（棚卸し S-29 の記録の部分）変えた欄ごとに「前 → 後」を1行。
       ⚠ 売約スイッチを切った時に日付を消すか残すかは今の動きのまま（ゆうたの判断待ち）。記録だけ残す */
    _logEditChanges(editId, base, next, changed, moved);

    const entries = changed.map(k => ({ path: [k], value: (next[k] === undefined) ? null : _cloneVal(next[k]) }));
    entries.push({ path: ['logs'], value: car.logs });   /* フローは足すだけ（db-cars.js が控えの行だけ送る） */
    /* 🔴 2026-08-05 修正：保存の結果を待たずに「更新しました」と出していた。
       → **サーバーに届いたか確かめてから**メッセージを出す。 */
    if (window.dbCars && window.dbCars.saveCarPaths) {
      try {
        await window.dbCars.saveCarPaths(car.id, entries);
      } catch (e) {
        console.error('[car-modal] save failed', e);
        _saveFailed = true;
      }
    }
    closeModal('modal-car');
    if (document.getElementById('modal-detail').classList.contains('open')) renderDetailBody(car);
  } else {
    // v1.8.72: 'order' は購入列スタート＋ isOrder=true。売約フラグは自動セットしない（手動）。
    const isOrder = (initialCol === 'order');
    let startCol = (initialCol === 'other') ? 'other' : 'purchase';
    // v2.10.8: 新規でも「納車準備へ移動して売約」を選んだ場合はそのフェーズで作る
    if (sellOn && _sellMoveToDelivery) startCol = 'delivery';
    _sellMoveToDelivery = false;
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
    /* 🔴 v3.16.7（棚卸し A-34）番号は会社の書類1枚で取る（2台同時に登録しても同じ番号にならない）。
       画面が自動で入れた番号のままなら、ほかの端末が先に取っていた時は次の番号に変わる。人が打った番号はそのまま */
    let numFinal = num, numChangedFrom = '';
    if (window.numHelpers && typeof window.numHelpers.claimNum === 'function') {
      const isAuto = !!num && _autoNumShown !== null && num === _autoNumShown;
      const r = await window.numHelpers.claimNum(num, { auto: isAuto });
      if (r && r.num !== undefined) {
        if (r.changed) { numChangedFrom = num; _numMoved = `（${num} はほかの端末が先に使ったので ${r.num} にしました）`; }
        numFinal = r.num;
      }
    }
    _autoNumShown = null;
    const car = {
      id: newId, num: numFinal, maker, model, grade,
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
      customerName, // v2.26.0
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
    /* v3.18.0 🚗 国産／輸入・軽を手で直した時だけ車に書く（空＝メーカー表・ボディで読む） */
    if (window.ccUi) { const cc = window.ccUi.read(); if (cc.origin) car.origin = cc.origin; if (cc.keiHand) car.keiHand = cc.keiHand; }
    const regKind = isOrder ? 'オーダー車両' : (startCol === 'other' ? 'その他' : '仕入れ');
    cars.push(car);   /* v3.16.0 先に一覧へ入れてから記録（前は addLog が車を見つけられず、フローに「新規登録」が残っていなかった） */
    /* 📝 v3.16.4 金額は最初の値も残す（未設定→◯円）。売約して登録した時は売約日・納車日も */
    addLog(car.id, `新規登録（${regKind}として）：本体価格 ${_fmtYenLog(car.price)}・総額 ${_fmtYenLog(car.totalPrice)}`
      + (car.contract ? `・売約日 ${_fmtDayLog(car.contractDate)}・納車日 ${_fmtDayLog(car.deliveryDate)}` : '')
      + (numChangedFrom ? `・管理番号 ${numChangedFrom} → ${car.num}（ほかの端末が先に ${numChangedFrom} を使ったため）` : ''));
    /* 🔴 2026-08-05 修正：新規登録も同じ。**保存できていないのに「登録しました」**が出ると、
       その端末にだけ車がある状態になり、リロードで消える＝入力し直しになる。
       ここでは画面からも取り消して「登録できませんでした」と伝える。 */
    if (window.dbCars) {
      try {
        await window.dbCars.saveCar(car, { initial: true });   // v3.0.0 新規登録＝まっさらな状態を1回だけ書く
      } catch (e) {
        console.error('[car-modal] save failed', e);
        const back = cars.findIndex(x => x.id === car.id);
        if (back >= 0) cars.splice(back, 1);        // 幻の車を残さない
        closeModal('modal-car');
        renderAll();
        renderDashboard();
        showToast('登録できませんでした。もう一度お試しください（通信または権限を確認してください）', 'CF-1003');
        return;
      }
    }
    closeModal('modal-car');
    renderDashboard();
  }
  renderAll();
  if (_saveFailed) {
    showToast('保存できませんでした。画面の内容は端末に残っていますが、まだ全員には反映されていません（通信または権限を確認してください）', 'CF-1004');
    return;
  }
  const okMsg = _wasEdit
    ? '情報を更新しました'
    : (initialCol === 'other' ? `${maker} ${model} を「その他」として登録しました`
       : initialCol === 'order' ? `${maker} ${model} を「オーダー車両」として登録しました`
       : `${maker} ${model} を仕入れ車として登録しました`);
  showToast(okMsg + _numMoved);
}

/* ============================================================
   🔐 v3.16.4（S-29 の B＋権限・ゆうたの判断 2026-10-15）売約を外す（売約取消）
   ------------------------------------------------------------
   ・売約後・納車前（状態が納車準備／納車完了でない）… 外せるのはマネージャー以上（CarFlow の役割＝マネージャー・管理者）
   ・納車済み（状態＝納車準備／納車完了）… 「車両情報の編集」のスイッチでは外せない。専用の［売約取消］＝管理者だけ（マスターも可）
   ・どちらも理由が必須。売約日・納車日は空にする（今までの「切った時」と同じ）。前の値は記録に必ず残す
   ・記録は車のフロー（logs）と操作ログ（auditLogs）の両方へ、**車の保存と同じ1回のまとめ書き**で
   🔴 サーバー（_ルール\firestore.rules の _cfUnsells）でも同じ線で弾く。片方だけ変えないこと
   ============================================================ */
function _cfIsDeliveredCol(col) { return col === 'delivery' || col === 'done'; }
function _cfMyCarRole() { return (window.fb && window.fb.currentStaff && window.fb.currentStaff.role) || ''; }
function _cfIsMasterUser() { return (typeof _isCarflowMaster === 'function') && _isCarflowMaster(); }
/* この車の売約を、いまの人が外せるか */
function cfCanUnsell(car) {
  if (!car) return false;
  const r = _cfMyCarRole();
  if (_cfIsDeliveredCol(car.col)) return r === 'admin' || _cfIsMasterUser();
  return r === 'admin' || r === 'manager' || _cfIsMasterUser();
}
function cfUnsellDenyText(car) {
  return (car && _cfIsDeliveredCol(car.col))
    ? '納車準備・納車完了の車の売約取消は、管理者だけができます'
    : '売約を外せるのはマネージャー以上です';
}
window.cfCanUnsell = cfCanUnsell;
window.cfUnsellDenyText = cfUnsellDenyText;

/* 売約取消の本体。targetCol＝戻す状態（null＝今の状態のまま。納車前の車はこちら）。from＝どこから（記録に出す）
   戻り値 true＝保存できた */
async function cfUnsellCar(carId, targetCol, reason, from) {
  const car = cars.find(c => c.id === carId);
  if (!car) return false;
  reason = String(reason || '').trim();
  if (!reason) { showToast('売約取消の理由を入れてください', 'CF-1020'); return false; }
  if (!cfCanUnsell(car)) { showToast(cfUnsellDenyText(car), 'CF-0027'); return false; }
  const colLabel = id => { const c = (typeof COLS !== 'undefined') ? COLS.find(x => x.id === id) : null; return c ? c.label : (id || '—'); };
  const fromCol = car.col;
  const toCol = targetCol || car.col;
  /* 新しい値（まだ手元の車には入れない＝保存できてから入れる） */
  const tmp = { col: fromCol, exhibitedAt: car.exhibitedAt };
  if (toCol !== fromCol && typeof _applyColTransitionDates === 'function') _applyColTransitionDates(tmp, fromCol, toCol);
  const upd = { contract: 0, contractDate: '', deliveryDate: '', col: toCol };
  if (toCol !== fromCol) upd.exhibitedAt = (tmp.exhibitedAt === undefined) ? null : tmp.exhibitedAt;
  if (_cfIsDeliveredCol(fromCol)) {
    /* 納車準備から外す時は、今までのカンバンの「売約キャンセル」と同じく納車準備の進捗と作業メモも戻す */
    upd.workMemo = '';
    if (typeof DELIVERY_TASKS !== 'undefined' && typeof mkTaskState === 'function') upd.deliveryTasks = mkTaskState(DELIVERY_TASKS);
  }
  const action = `売約取消（${reason}）：売約日 ${_fmtDayLog(car.contractDate)}→空・納車日 ${_fmtDayLog(car.deliveryDate)}→空・状態 ${colLabel(fromCol)}→${colLabel(toCol)}（${from || '—'}）`;
  const entry = window._cfMakeLogEntry(car.id, action);
  /* 車の保存＋フローの1行＋操作ログ1件＝1回のまとめ書き */
  try {
    const FV = window.firebase.firestore.FieldValue;
    const db = window.fb.db;
    const carRef = db.collection('companies').doc(window.fb.currentCompanyId).collection('cars').doc(String(car.id));
    const auditCol = window.dbAudit && window.dbAudit.col ? window.dbAudit.col() : null;
    const batch = db.batch();
    const payload = Object.assign({}, upd, {
      logs: FV.arrayUnion(entry),
      updatedAt: window.fb.serverTimestamp(),
      updatedBy: (window.fb.currentUser && window.fb.currentUser.uid) || null,
    });
    if (payload.exhibitedAt === null) payload.exhibitedAt = FV.delete();
    batch.update(carRef, payload);
    if (auditCol) batch.set(auditCol.doc(), window.dbAudit.docOf(entry));
    await batch.commit();
  } catch (e) {
    console.error('[car-modal] 売約取消の保存に失敗', e);
    showToast('売約取消を保存できませんでした（通信または権限を確認してください）', 'CF-1021');
    return false;
  }
  /* 保存できた＝画面にも入れる */
  Object.keys(upd).forEach(k => {
    if (upd[k] === null) delete car[k]; else car[k] = (typeof upd[k] === 'object') ? _cloneVal(upd[k]) : upd[k];
  });
  window._cfLogCommitted(car, entry);
  return true;
}
window.cfUnsellCar = cfUnsellCar;

/* 車両情報の編集の［売約取消］（納車済みの車・管理者だけ）。理由を聞いて展示中へ戻す */
async function startUnsellFromModal() {
  const car = editingCarId ? cars.find(c => c.id === editingCarId) : null;
  if (!car || !car.contract) return;
  if (!cfCanUnsell(car)) { showToast(cfUnsellDenyText(car), 'CF-0027'); return; }
  const reason = await cfAskText('売約取消の理由', '', { detail: '売約日・納車予定日を空にして「展示中」に戻します。納車準備の進捗も戻ります。前の値は記録に残ります。', placeholder: '例：お客様都合でキャンセル', danger: true, ok: '売約取消' });   /* v3.16.7（B-03） */
  if (reason == null) return;
  if (!String(reason).trim()) { showToast('売約取消の理由を入れてください', 'CF-1020'); return; }
  const done = await cfUnsellCar(car.id, 'exhibit', reason, '車両情報の編集の売約取消');
  if (!done) return;
  closeModal('modal-car');
  if (document.getElementById('modal-detail').classList.contains('open') && typeof renderDetailBody === 'function') renderDetailBody(car);
  renderAll();
  showToast('売約を取り消しました');
}
window.startUnsellFromModal = startUnsellFromModal;

/* 📝 v3.16.0（棚卸し S-29 の記録の部分）編集で変えた欄を、フローに「前 → 後」で残す。
   ・本体価格・総額・仕入日・売約・売約日・納車日・お客様・状態（列）は1行ずつ
   ・それ以外（番号・車名・走行距離・色・メモ・写真など）はまとめて「車両情報を編集（走行距離・色）」の1行
   ⚠ 条件付きで書かない（決まり⑧の考え方）。変わった欄は必ずどこかの行に出る */
const _EDIT_LABEL = {
  num: '管理番号', maker: 'メーカー', model: '車種', grade: 'グレード', selectedTasks: '選択タスク', isOrder: 'オーダー',
  year: '年式', color: '色', size: 'サイズ', km: '走行距離', memo: 'メモ', photo: '写真',
};
function _fmtYenLog(v) {
  const n = Number(String(v == null ? '' : v).replace(/[,\s]/g, ''));
  return (v === '' || v == null || !isFinite(n)) ? '未設定' : n.toLocaleString('ja-JP') + '円';
}
function _fmtDayLog(v) { return v ? String(v) : '未定'; }
function _logEditChanges(carId, base, next, changed, moved) {
  if (typeof addLog !== 'function') return;
  const colLabel = id => { const c = (typeof COLS !== 'undefined') ? COLS.find(x => x.id === id) : null; return c ? c.label : (id || '—'); };
  const has = k => changed.indexOf(k) >= 0;
  const lines = [];
  if (has('price'))        lines.push(`車両情報を編集：本体価格 ${_fmtYenLog(base.price)} → ${_fmtYenLog(next.price)}`);
  if (has('totalPrice'))   lines.push(`車両情報を編集：総額 ${_fmtYenLog(base.totalPrice)} → ${_fmtYenLog(next.totalPrice)}`);
  if (has('purchaseDate')) lines.push(`車両情報を編集：仕入日 ${_fmtDayLog(base.purchaseDate)} → ${_fmtDayLog(next.purchaseDate)}`);
  if (has('contract'))     lines.push(`車両情報を編集：売約 ${base.contract ? 'あり' : 'なし'} → ${next.contract ? 'あり' : 'なし'}`);
  if (has('contractDate')) lines.push(`車両情報を編集：売約日 ${_fmtDayLog(base.contractDate)} → ${_fmtDayLog(next.contractDate)}`);
  if (has('deliveryDate')) lines.push(`納車日変更: ${_fmtDayLog(base.deliveryDate)}→${_fmtDayLog(next.deliveryDate)}（車両情報の編集）`);
  if (has('customerName')) lines.push(`車両情報を編集：お客様 ${base.customerName || '未設定'} → ${next.customerName || '未設定'}`);
  /* v3.18.0 🚗 区分を手で直した・自動に戻した */
  const _oL = v => v === 'dom' ? '国産（手で直した）' : v === 'imp' ? '輸入（手で直した）' : '自動（メーカー表）';
  const _kL = v => v === 'kei' ? '軽（手で直した）' : v === 'normal' ? '普通車（手で直した）' : '自動（ボディ）';
  if (has('origin'))       lines.push(`車両情報を編集：国産／輸入 ${_oL(base.origin)} → ${_oL(next.origin)}`);
  if (has('keiHand'))      lines.push(`車両情報を編集：軽 ${_kL(base.keiHand)} → ${_kL(next.keiHand)}`);
  if (has('col')) {
    lines.push(moved ? `売約に伴い納車準備へ移動（${colLabel(base.col)}→${colLabel(next.col)}）`
                     : `ステータス変更: ${colLabel(base.col)}→${colLabel(next.col)}（車両情報の編集）`);
  }
  const rest = changed.filter(k => _EDIT_LABEL[k]).map(k => _EDIT_LABEL[k]);
  if (rest.length) lines.push(`車両情報を編集（${rest.join('・')}）`);
  lines.forEach(t => addLog(carId, t));
}

// ====================================================================
// v1.8.66: 価格欄の「逆入力」ボタン
//   その欄が税抜設定なら → 税込金額を入れて自動で税抜に換算
//   その欄が税込設定なら → 税抜金額を入れて自動で税込に換算
//   消費税率は 10%（固定）。後で変えたい場合は TAX_RATE を変更。
// ====================================================================
async function promptAltPrice(which) {
  // v1.8.67: 税率は設定 (appSettings.priceTax.rate %) から取得
  const TAX_RATE = (typeof getTaxRate === 'function') ? getTaxRate() : 0.10;
  const setting = (typeof appSettings !== 'undefined' && appSettings.priceTax) || {};
  const fieldMode = (setting[which] === 'excl') ? 'excl' : 'incl';   // 現在の欄の扱い
  const fieldLabel = fieldMode === 'excl' ? '税抜' : '税込';
  const altLabel   = fieldMode === 'excl' ? '税込' : '税抜';
  const fieldName  = which === 'body' ? '本体価格' : '総額';
  const inputId    = which === 'body' ? 'inp-price' : 'inp-total-price';

  const raw = await cfAskText(`${fieldName} の ${altLabel} 金額を入力してください`, '', { detail: `消費税${Math.round(TAX_RATE * 100)}%で自動換算して ${fieldLabel} の値を入れます`, placeholder: '例：1100000' });   /* v3.16.7（B-03） */
  if (raw == null) return;
  const cleaned = String(raw).replace(/[,\s]/g, '').replace(/円$/, '');
  const n = parseInt(cleaned, 10);
  if (!Number.isFinite(n) || n <= 0) {
    if (typeof showToast === 'function') showToast('数値を入力してください', 'CF-1005');
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
          <span style="font-size:14px">${icoE(t.icon) || ic('clipboard','📋',16)}</span>
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

// ========================================
// v2.16.0: 管理番号の重複リアルタイム警告＋保存ボタン制御
// ========================================
let _numDupCheckAttached = false;

function _attachNumDupCheck() {
  if (_numDupCheckAttached) return;
  const inp = document.getElementById('inp-num');
  if (!inp) return;
  inp.addEventListener('input', _runNumDupCheck);
  _numDupCheckAttached = true;
}

function _runNumDupCheck() {
  const inp = document.getElementById('inp-num');
  const warn = document.getElementById('inp-num-warn');
  const saveBtn = document.getElementById('car-save-btn');
  if (!inp || !warn) return;

  const value = (inp.value || '').trim();
  if (!value) {
    warn.style.display = 'none';
    warn.textContent = '';
    warn.classList.remove('error', 'soft');
    if (saveBtn) saveBtn.disabled = false;
    return;
  }
  if (!window.numHelpers) return;

  const dup = window.numHelpers.findDuplicate(value, editingCarId);
  if (!dup) {
    warn.style.display = 'none';
    warn.textContent = '';
    warn.classList.remove('error', 'soft');
    if (saveBtn) saveBtn.disabled = false;
    return;
  }

  if (dup.source === 'deleted') {
    // 過去に「正式削除」された番号への上書き＝警告のみ（保存はできる）
    warn.style.display = 'block';
    warn.className = 'inp-num-warn soft';
    warn.innerHTML = icoE('⚠ この番号は過去に「正式削除」されています。再利用すると管理番号リストに重複表示されます。');
    if (saveBtn) saveBtn.disabled = false;
  } else {
    // 在庫中 or アーカイブ済の番号と被ったら保存ブロック
    const label = dup.source === 'cars' ? '在庫中' : 'アーカイブ済';
    const r = dup.record || {};
    warn.style.display = 'block';
    warn.className = 'inp-num-warn error';
    warn.innerHTML = icoE(`❌ この番号は既に使われています（${label}：${r.maker || ''} ${r.model || ''}）`);
    if (saveBtn) saveBtn.disabled = true;
  }
}
