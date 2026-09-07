// ========================================
// kanban.js
// v0.9.1: その他カード右上を「仕入N日」バッジ化、下段帯削除
// ========================================

const COMPACT_THRESHOLD = 4;
let expandedCards = {};

const COL_ORDER = ['other','purchase','regen','exhibit','delivery','done'];
const colIdx = id => COL_ORDER.indexOf(id);

// v1.0.15: 展開中、カード以外の余白クリックで縮小に戻す（一度だけ配線）
document.addEventListener('click', (e) => {
  if (!kanbanForceExpand) return;
  const view = document.getElementById('view-kanban');
  if (!view || !view.classList.contains('active')) return;
  if (!view.contains(e.target)) return;
  // ツールバー内のボタンクリックは除外（自前の処理に任せる）
  if (e.target.closest('#kanban-toolbar')) return;
  // カード本体クリックは除外（詳細を開く / 縮小→展開トグル等）
  if (e.target.closest('.car-card')) return;
  // 余白クリック → 縮小に戻す
  kanbanForceExpand = false;
  renderKanban();
});

function renderKanban() {
  expandedCards = {};
  const wrap = document.getElementById('kanban-wrap');
  wrap.innerHTML = '';

  // v2.19.0: 一番左に「仮登録車両」列（通常の cars とは別の tentativeCars から描画）
  _renderTentativeColumn(wrap);

  COLS.forEach(col => {
    let colCars = cars.filter(c => c.col === col.id);
    // v1.0.14: 全列に一斉ソート（done＝納車完了は対象外）
    if (kanbanSort.key && col.id !== 'done') {
      colCars = _sortKanbanCars(colCars, kanbanSort);
    }
    const isCompact = colCars.length >= COMPACT_THRESHOLD && !kanbanForceExpand;
    const div = document.createElement('div');
    div.className = 'k-col' + (col.id === 'other' ? ' k-col-other' : '');
    div.innerHTML = `<div class="k-col-hdr"><div class="k-col-dot" style="background:${col.color}"></div><div class="k-col-title">${col.label}</div><div class="k-col-count">${colCars.length}</div></div><div class="k-cards" id="kc-${col.id}" data-col="${col.id}"></div>`;
    wrap.appendChild(div);
    const cd = div.querySelector('.k-cards');
    colCars.forEach(car => cd.appendChild(makeCarCard(car, isCompact)));

    const spacer = document.createElement('div');
    spacer.className = 'k-col-spacer';
    cd.appendChild(spacer);

    cd.addEventListener('dragover', e => { e.preventDefault(); cd.classList.add('drag-over'); });
    cd.addEventListener('dragleave', () => cd.classList.remove('drag-over'));
    cd.addEventListener('drop', e => {
      e.preventDefault();
      cd.classList.remove('drag-over');
      // v2.19.0/1: 仮登録カードを「仕入れ」「その他」に落としたら昇格確認（管理番号採番）
      if (dragTentative) {
        if (col.id === 'purchase' || col.id === 'other') {
          askPromoteTentative(dragTentative, col.id);
        } else {
          showToast('仮登録は「仕入れ」か「その他」にだけ移せます');
        }
        return;
      }
      // v2.19.1: 登録済みカードを「仮登録」列へ落とした＝あり得ない逆流。2段階確認で戻す。
      if (dragCard && col.id === 'tentative') {
        askRevertToTentative(dragCard);
        return;
      }
      if (!dragCard || dragCard.col === col.id) return;
      handleKanbanMove(dragCard, col.id);
    });
  });
  _refreshKanbanToolbar();
}

// v1.0.14: カンバン用ソート関数（done は呼ばれない前提）
function _sortKanbanCars(arr, sort) {
  const sign = sort.dir === 'asc' ? 1 : -1;
  const key = sort.key;
  const cmp = (a, b) => {
    let av, bv;
    if (key === 'num') {
      av = (a.num || ''); bv = (b.num || '');
      return av.localeCompare(bv) * sign;
    }
    if (key === 'price') {
      av = Number(a.price) || 0; bv = Number(b.price) || 0;
    } else if (key === 'progress') {
      av = (calcProg(a)?.pct) || 0;
      bv = (calcProg(b)?.pct) || 0;
    } else if (key === 'date') {
      // 売約済みなら売約日数、それ以外は仕入日数
      av = a.contract ? daysSinceContract(a) : daysSince(a.purchaseDate);
      bv = b.contract ? daysSinceContract(b) : daysSince(b.purchaseDate);
    } else {
      return 0;
    }
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return 0;
  };
  return arr.slice().sort(cmp);
}

// v1.0.14: 並び替えキーをトグルセット
function setKanbanSort(key) {
  if (kanbanSort.key === key) {
    kanbanSort.dir = kanbanSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    kanbanSort.key = key;
    kanbanSort.dir = 'desc';
  }
  kanbanForceExpand = false;
  renderKanban();
}

// v1.0.14: 「すべてのカードを開く」トグル
function toggleKanbanExpandAll() {
  kanbanForceExpand = !kanbanForceExpand;
  renderKanban();
}

// v1.0.14: ツールバーのアクティブ状態を反映
function _refreshKanbanToolbar() {
  document.querySelectorAll('#kanban-toolbar .kt-sort-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.querySelectorAll('.kt-arrow').forEach(a => a.remove());
    if (btn.dataset.key === kanbanSort.key) {
      btn.classList.add('active');
      const arrow = document.createElement('span');
      arrow.className = 'kt-arrow';
      arrow.innerHTML = icoE(kanbanSort.dir === 'asc' ? '▲' : '▼');
      btn.appendChild(arrow);
    }
  });
  const btn = document.getElementById('kt-expand-btn');
  if (btn) {
    btn.innerHTML = icoE(kanbanForceExpand ? '▲ 縮小表示に戻す' : '▼ すべてのカードを開く');
    btn.classList.toggle('active', kanbanForceExpand);
  }
}

// ========================================
// v2.19.0: 仮登録車両 列・カード・昇格処理
// ========================================
function _tentativeReasonLabel(id) {
  const r = (typeof TENTATIVE_REASONS !== 'undefined') ? TENTATIVE_REASONS.find(x => x.id === id) : null;
  return r ? r.label : (id || '');
}

function _renderTentativeColumn(wrap) {
  const list = (typeof tentativeCars !== 'undefined' && Array.isArray(tentativeCars)) ? tentativeCars : [];
  const col = (typeof TENTATIVE_COL !== 'undefined') ? TENTATIVE_COL : { id:'tentative', label:'仮登録車両', color:'#ec4899' };
  const div = document.createElement('div');
  div.className = 'k-col k-col-tentative';
  div.innerHTML = `<div class="k-col-hdr"><div class="k-col-dot" style="background:${col.color}"></div><div class="k-col-title">${col.label}</div><div class="k-col-count">${list.length}</div></div><div class="k-cards" id="kc-tentative" data-col="tentative"></div>`;
  wrap.appendChild(div);
  const cd = div.querySelector('.k-cards');
  list.forEach(t => cd.appendChild(_makeTentativeCard(t)));
  const spacer = document.createElement('div');
  spacer.className = 'k-col-spacer';
  cd.appendChild(spacer);
  // 登録済みカードがこの列に落とされた場合だけ「あり得ない逆流」の確認を出す（仮登録同士は無視）
  cd.addEventListener('dragover', e => { e.preventDefault(); cd.classList.add('drag-over'); });
  cd.addEventListener('dragleave', () => cd.classList.remove('drag-over'));
  cd.addEventListener('drop', e => {
    e.preventDefault();
    cd.classList.remove('drag-over');
    if (dragTentative) return;                 // 仮登録→仮登録は何もしない
    if (dragCard) askRevertToTentative(dragCard);
  });
}

function _makeTentativeCard(t) {
  const reason = _tentativeReasonLabel(t.reason);
  const memo = (t.memo || '').trim();
  const div = document.createElement('div');
  div.className = 'car-card cc-tentative';
  div.draggable = true;
  div.dataset.tentId = t.id;
  div.innerHTML = `
    <div class="cc-body">
      <div class="cc-info-row">
        <div class="cc-info-left">
          <div class="cc-maker">${escapeHtml(t.maker || '')}</div>
          <div class="cc-model">${escapeHtml(t.model || '（車種未入力）')}</div>
        </div>
        ${reason ? `<span class="cc-reason-badge">${escapeHtml(reason)}</span>` : ''}
      </div>
      <div class="cc-tent-memo">
        <span class="cc-tent-memo-icon">${ic('pencil','📝',16)}</span>
        <span class="cc-tent-memo-body${memo ? '' : ' empty'}">${memo ? escapeHtml(memo).replace(/\n/g, '<br>') : 'メモなし'}</span>
      </div>
    </div>`;
  div.addEventListener('dragstart', () => { dragTentative = t; dragCard = null; div.classList.add('dragging'); });
  div.addEventListener('dragend', () => { dragTentative = null; div.classList.remove('dragging'); });
  div.addEventListener('click', () => openTentativeModal(t.id));
  return div;
}

// v2.19.1: 昇格の確認ダイアログ（前向き・1回）
let _pendingPromote = null;
function askPromoteTentative(t, targetCol) {
  _pendingPromote = { t, targetCol };
  let num = '';
  try { num = (window.numHelpers && window.numHelpers.nextNum) ? window.numHelpers.nextNum() : ''; } catch (e) {}
  const toLabel = COLS.find(c => c.id === targetCol)?.label || targetCol;
  const name = `${(t.maker || '')} ${(t.model || '（車種未入力）')}`.trim();
  document.getElementById('promote-sub').innerHTML =
    `<b style="color:var(--text)">${escapeHtml(name)}</b> を「${toLabel}」に登録します。<br>` +
    `この時点で管理番号 <b style="font-family:monospace;color:var(--text)">${escapeHtml(num || '（自動）')}</b> を自動で振ります。<br>在庫日数のカウントも今日から始まります。`;
  document.getElementById('confirm-promote').classList.add('open');
}
window.askPromoteTentative = askPromoteTentative;

function closePromoteConfirm(ok) {
  document.getElementById('confirm-promote').classList.remove('open');
  const p = _pendingPromote; _pendingPromote = null;
  if (!ok || !p) { showToast('キャンセルしました'); return; }
  promoteTentative(p.t, p.targetCol);
}
window.closePromoteConfirm = closePromoteConfirm;

// v2.19.1: 登録済み→仮登録への逆流（あり得ない）。2段階で確認して戻す。
let _pendingRevert = null;
function askRevertToTentative(car) {
  _pendingRevert = car;
  const name = `${(car.maker || '')} ${(car.model || '')}`.trim();
  document.getElementById('revert1-sub').innerHTML =
    `すでに登録済みの <b style="color:var(--text)">${escapeHtml(name)}</b>（${escapeHtml(car.num || '番号なし')}）を「仮登録車両」に戻そうとしています。<br><br>` +
    `<b style="color:var(--text)">仮登録から間違えて移動したのを戻したい</b>のですか？`;
  document.getElementById('confirm-revert1').classList.add('open');
}
window.askRevertToTentative = askRevertToTentative;

function closeRevert1(yes) {
  document.getElementById('confirm-revert1').classList.remove('open');
  if (!yes) { _pendingRevert = null; showToast('やめました', 'CF-2002'); return; }
  const car = _pendingRevert;
  if (!car) return;
  document.getElementById('revert2-sub').innerHTML =
    `管理番号 <b style="font-family:monospace;color:var(--text)">${escapeHtml(car.num || '番号なし')}</b> が外れ、この車は「来る前の仮の状態」に戻ります。<br>在庫日数・進捗もリセットされます。`;
  document.getElementById('confirm-revert2').classList.add('open');
}
window.closeRevert1 = closeRevert1;

async function closeRevert2(ok) {
  document.getElementById('confirm-revert2').classList.remove('open');
  const car = _pendingRevert; _pendingRevert = null;
  if (!ok || !car) { showToast('キャンセルしました'); return; }
  // 仮登録に戻す：tentativeCars に作り直し、cars から削除。番号は手放す。
  /* 🔴 2026-08-05 修正：昇格と同じ理由。**仮登録の保存が成功してから、本登録を消す。** */
  const rec = { id: 't' + Date.now() + Math.floor(Math.random() * 1000), maker: car.maker || '', model: car.model || '', reason: 'other', memo: car.memo || '' };
  tentativeCars.push(rec);
  if (window.dbTentative && window.dbTentative.saveTentativeCar) {
    try {
      await window.dbTentative.saveTentativeCar(rec);
    } catch (e) {
      console.error('[kanban] 仮登録への差し戻し保存に失敗', e);
      const back = tentativeCars.findIndex(x => x.id === rec.id);
      if (back >= 0) tentativeCars.splice(back, 1);
      if (typeof renderAll === 'function') renderAll();
      showToast('仮登録に戻せませんでした。元のまま残しています（通信または権限を確認してください）', 'CF-2003');
      return;                                        /* ⚠ 本登録は消さない */
    }
  }
  const idx = cars.findIndex(c => c.id === car.id);
  if (idx >= 0) cars.splice(idx, 1);
  let _carLeft = false;
  if (window.dbCars && window.dbCars.deleteCar) {
    try {
      await window.dbCars.deleteCar(car.id);
    } catch (e) {
      console.error('[kanban] 元の車両の削除に失敗', e);
      cars.push(car);
      _carLeft = true;
    }
  }
  if (typeof addLog === 'function') addLog(rec.id, `登録済み（${car.num || '番号なし'}）を仮登録に戻した`);
  if (typeof renderAll === 'function') renderAll();
  showToast(_carLeft ? '仮登録に戻しましたが、元の車が消せませんでした（両方に出ています）' : '仮登録に戻しました');
}
window.closeRevert2 = closeRevert2;

// 仮登録 → 「仕入れ」or「その他」へ昇格：この時点で管理番号を振り、通常 cars に追加。
// 在庫日数などのカウントは purchaseDate=今日 からスタート。
async function promoteTentative(t, targetCol) {
  if (!t) return;
  let num = '';
  try { num = (window.numHelpers && window.numHelpers.nextNum) ? window.numHelpers.nextNum() : ''; } catch (e) {}
  const car = {
    id: 'c' + Date.now() + Math.floor(Math.random() * 1000),
    num: num,
    maker: t.maker || '',
    model: t.model || '',
    grade: '',
    col: targetCol,                 // 'purchase' or 'other'
    purchaseDate: todayStr(),       // ★カウントはここから
    memo: t.memo || '',
    workMemo: '',
    photo: '',
    price: '', totalPrice: '',
    contract: 0,
    // v2.28.1: 昇格時に作業タスク欄を初期化（通常の新規登録と揃える）。
    //   これが無いと progress.js の進捗計算で state が undefined になり、
    //   ログイン直後にクラッシュする不具合の根本原因だった（KM-0535 で発生）。
    regenTasks: (typeof mkTaskState === 'function' && typeof REGEN_TASKS !== 'undefined') ? mkTaskState(REGEN_TASKS) : {},
    deliveryTasks: (typeof mkTaskState === 'function' && typeof DELIVERY_TASKS !== 'undefined') ? mkTaskState(DELIVERY_TASKS) : {},
    logs: [],
  };
  /* 🔴 2026-08-05 修正：ここは以前、保存の失敗を空の catch で握りつぶしたまま
     **仮登録の方を消していた**。電波が悪い・権限が足りない・端末の保存領域が不調だと、
     画面には「◯◯ で仕入れに登録しました」と出るのに、
     **次に開くと仮登録からも一覧からも車が消えている**（管理番号だけ食われる）。
     🔴 決めごと＝**新しい方の保存が成功してから、古い方を消す。**
        失敗したら何も消さずに中断して、はっきり伝える。 */
  cars.push(car);
  if (window.dbCars && window.dbCars.saveCar) {
    try {
      await window.dbCars.saveCar(car, { initial: true });   // v3.0.0 仮登録からの昇格＝まっさらな状態を1回だけ書く
    } catch (e) {
      console.error('[kanban] 昇格の保存に失敗', e);
      const back = cars.findIndex(x => x.id === car.id);
      if (back >= 0) cars.splice(back, 1);          // 画面からも戻す（幻の車を残さない）
      if (typeof renderAll === 'function') renderAll();
      if (typeof showToast === 'function') showToast('登録できませんでした。仮登録のまま残しています（通信または権限を確認してください）', 'CF-2004');
      return;                                        /* ⚠ ここで必ず止まる。仮登録は消さない */
    }
  }
  if (typeof addLog === 'function') addLog(car.id, `仮登録から${COLS.find(c=>c.id===targetCol)?.label || targetCol}へ（${num} を採番）`);
  // 仮登録を削除（★保存が成功した後だけ）
  const idx = tentativeCars.findIndex(x => x.id === t.id);
  if (idx >= 0) tentativeCars.splice(idx, 1);
  let _tentLeft = false;
  if (window.dbTentative && window.dbTentative.deleteTentativeCar) {
    try {
      await window.dbTentative.deleteTentativeCar(t.id);
    } catch (e) {
      /* 車は保存できている＝データは失われていない。仮登録の方が残るだけなので、
         画面からは消さずに戻して「両方に出ている」と分かる状態にする。 */
      console.error('[kanban] 仮登録の削除に失敗', e);
      tentativeCars.push(t);
      _tentLeft = true;
    }
  }
  if (typeof renderAll === 'function') renderAll();
  if (typeof showToast === 'function') {
    showToast(_tentLeft
      ? `${num} で登録しました（仮登録の方が消せませんでした。あとで消してください）`
      : `${num} で${COLS.find(c=>c.id===targetCol)?.label || ''}に登録しました`);
  }
}

// 仮登録モーダル：追加（id無し）／編集（id有り）
let _editingTentId = null;
function openTentativeModal(tentId) {
  _editingTentId = tentId || null;
  const t = _editingTentId ? (tentativeCars || []).find(x => x.id === _editingTentId) : null;
  /* ⚠ textContent はアイコン（<i data-ic>）ごと中身を消してしまい、絵文字に戻る。innerHTML でアイコンを入れ直す。 */
  document.getElementById('tent-modal-title').innerHTML = ic('clock', '🕗', 15) + ' 仮登録車両を' + (t ? '編集' : '追加');
  document.getElementById('tent-maker').value  = t ? (t.maker || '') : '';
  document.getElementById('tent-model').value  = t ? (t.model || '') : '';
  document.getElementById('tent-reason').value = t ? (t.reason || 'trade') : 'trade';
  document.getElementById('tent-memo').value   = t ? (t.memo || '') : '';
  document.getElementById('tent-del-btn').style.display = t ? '' : 'none';
  document.getElementById('modal-tentative').classList.add('open');
  _setupTentativeAutocomplete();   // メーカー・車種の過去データ補完（他フォームと同じ）
}
window.openTentativeModal = openTentativeModal;

// E201（端末にオフライン保存できない）でやむなく再読み込みした場合、入力中だった仮登録を復元する。
//   再読み込み後はネット直書きモードなので、そのまま「保存」を押せば確実に登録できる。
(function () {
  function _restoreTentDraft() {
    var raw;
    try { raw = sessionStorage.getItem('cf_tent_draft'); } catch (_) { return; }
    if (!raw) return;
    try { sessionStorage.removeItem('cf_tent_draft'); } catch (_) {}
    var d; try { d = JSON.parse(raw); } catch (_) { return; }
    if (!d) return;
    try {
      if (typeof openTentativeModal === 'function') openTentativeModal(null);
      var set = function (id, v) { var el = document.getElementById(id); if (el) el.value = v || ''; };
      set('tent-maker', d.maker); set('tent-model', d.model);
      set('tent-reason', d.reason || 'trade'); set('tent-memo', d.memo);
      if (typeof showToast === 'function') showToast('オフライン保存を切替えました。もう一度「保存」を押してください');
    } catch (_) {}
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(_restoreTentDraft, 1400);
  else window.addEventListener('DOMContentLoaded', function () { setTimeout(_restoreTentDraft, 1400); });
})();

// 仮登録モーダルのメーカー/車種にオートコンプリートを付ける（1回だけ配線）
let _tentAcDone = false;
function _setupTentativeAutocomplete() {
  if (_tentAcDone || !window.CarFlowAC || !window.CarFlowAC.setup) return;
  const maker = document.getElementById('tent-maker');
  const model = document.getElementById('tent-model');
  if (maker) window.CarFlowAC.setup(maker, { getDict: window.CarFlowAC.makerDict });
  if (model) window.CarFlowAC.setup(model, { getDict: () => window.CarFlowAC.modelDict(maker ? maker.value : '') });
  _tentAcDone = true;
}

function closeTentativeModal() {
  document.getElementById('modal-tentative').classList.remove('open');
  _editingTentId = null;
}
window.closeTentativeModal = closeTentativeModal;

async function saveTentativeFromModal() {
  const maker  = document.getElementById('tent-maker').value.trim();
  const model  = document.getElementById('tent-model').value.trim();
  const reason = document.getElementById('tent-reason').value;
  const memo   = document.getElementById('tent-memo').value.trim();
  if (!maker && !model) { showToast('メーカーか車種を入れてください', 'CF-2005'); return; }
  // v2.24.0：成功表示はサーバー保存が確認できた時だけ。失敗はコード付きで通知し、
  //          画面に幽霊カードを残さない（新規は成功時のみ一覧に足す）。
  const isNew = !_editingTentId;
  let rec, _bak = null;
  if (_editingTentId) {
    rec = (tentativeCars || []).find(x => x.id === _editingTentId);
    if (!rec) { closeTentativeModal(); return; }
    _bak = { maker: rec.maker, model: rec.model, reason: rec.reason, memo: rec.memo };
    rec.maker = maker; rec.model = model; rec.reason = reason; rec.memo = memo;
  } else {
    rec = { id: 't' + Date.now() + Math.floor(Math.random() * 1000), maker, model, reason, memo };
  }
  if (!(window.dbTentative && window.dbTentative.saveTentativeCar)) { closeTentativeModal(); return; }
  try {
    window.__appBusy = true;
    await window.dbTentative.saveTentativeCar(rec);
  } catch (e) {
    // 失敗：成功表示は出さない。入力中の編集は元に戻す。モーダルは開いたまま再試行可。
    if (_editingTentId && _bak) { rec.maker = _bak.maker; rec.model = _bak.model; rec.reason = _bak.reason; rec.memo = _bak.memo; }
    const code = window.CoreSave ? window.CoreSave.toastError(e) : (showToast('保存に失敗しました', 'CF-0018'), 0);
    // E201＝この端末はオフライン保存(IndexedDB)が使えない。core-saveが既に「次回はネット直書き」に
    //   切替済みなので、入力内容を退避して再読み込みすれば確実に保存できる。入力は引き継ぐ。
    if (code === 201 && window.CoreSave && window.CoreSave.offlineDisabled && window.CoreSave.offlineDisabled()) {
      try { sessionStorage.setItem('cf_tent_draft', JSON.stringify({ maker: maker, model: model, reason: reason, memo: memo })); } catch (_) {}
      setTimeout(function () {
        if (confirm('この端末はオフライン保存が使えないようです。\n設定を切り替えました（次回からネット直書き）。\n\n画面を再読み込みすると確実に保存できます。今すぐ再読み込みしますか？\n（入力内容は引き継がれます）')) {
          location.reload();
        }
      }, 150);
    }
    return;
  } finally {
    window.__appBusy = false;
  }
  // 成功（サーバー保存を確認済み）
  if (isNew) tentativeCars.push(rec);
  closeTentativeModal();
  if (typeof renderKanban === 'function') renderKanban();
  showToast(isNew ? '仮登録を追加しました' : '仮登録を更新しました');
}
window.saveTentativeFromModal = saveTentativeFromModal;

async function deleteTentativeFromModal() {
  if (!_editingTentId) return;
  if (!confirm('この仮登録を削除しますか？')) return;
  const id = _editingTentId;
  if (!(window.dbTentative && window.dbTentative.deleteTentativeCar)) { closeTentativeModal(); return; }
  try {
    window.__appBusy = true;
    await window.dbTentative.deleteTentativeCar(id);
  } catch (e) {
    // 失敗：サーバーで消せていない。一覧からは外さず、コード付きで通知。
    if (window.CoreSave) window.CoreSave.toastError(e); else showToast('削除に失敗しました', 'CF-0019');
    return;
  } finally {
    window.__appBusy = false;
  }
  // 成功（サーバーで削除を確認済み）
  const idx = (tentativeCars || []).findIndex(x => x.id === id);
  if (idx >= 0) tentativeCars.splice(idx, 1);
  closeTentativeModal();
  if (typeof renderKanban === 'function') renderKanban();
  showToast('仮登録を削除しました');
}
window.deleteTentativeFromModal = deleteTentativeFromModal;

// v0.9.1: その他カード（右上は仕入Nバッジのみ、下段帯なし）
function _makeOtherCard(car, isCompact) {
  const inv = daysSince(car.purchaseDate);
  const coreMemo = (car.memo || '').trim();
  const workMemo = (car.workMemo || '').trim();

  const memoBlock = `
    <div class="cc-other-memos">
      <div class="cc-other-memo-row">
        <span class="cc-other-memo-icon">${ic('pin','📌',14)}</span>
        <span class="cc-other-memo-body${coreMemo ? '' : ' empty'}">${coreMemo ? escapeHtml(coreMemo).replace(/\n/g,' ') : '未記入'}</span>
      </div>
      <div class="cc-other-memo-row">
        <span class="cc-other-memo-icon">${ic('pencil','📝',16)}</span>
        <span class="cc-other-memo-body${workMemo ? '' : ' empty'}">${workMemo ? escapeHtml(workMemo).replace(/\n/g,' ') : '未記入'}</span>
      </div>
    </div>`;

  const div = document.createElement('div');
  div.className = 'car-card cc-other' + (isCompact ? ' compact' : '');
  div.draggable = true;
  div.dataset.carId = car.id;
  div.dataset.col = car.col;
  div.innerHTML = `
    <div class="cc-thumb">${car.photo ? `<img src="${car.photo}">` : carEmoji(car.size)}</div>
    <div class="cc-body">
      <div class="cc-info-row">
        <div class="cc-info-left">
          <div class="cc-maker">${car.maker}</div>
          <div class="cc-model">${car.model}${car.grade ? ' ' + car.grade : ''}</div>
        </div>
        <div class="cc-info-right">
          <div class="cc-bigday cc-other-day">仕入<span class="cc-bigday-num">${inv}</span>日</div>
        </div>
      </div>
      ${memoBlock}
    </div>`;
  div.addEventListener('dragstart', () => { dragCard = car; div.classList.add('dragging'); });
  div.addEventListener('dragend', () => { dragCard = null; div.classList.remove('dragging'); });
  div.addEventListener('click', () => {
    if (!isCompact) { openDetail(car.id); return; }
    const colId = car.col;
    const currentExpanded = expandedCards[colId];
    if (currentExpanded === div) {
      openDetail(car.id);
    } else {
      if (currentExpanded) currentExpanded.classList.remove('expanded');
      div.classList.add('expanded');
      expandedCards[colId] = div;
    }
  });
  return div;
}

function makeCarCard(car, isCompact) {
  if (car.col === 'other') return _makeOtherCard(car, isCompact);
  const isD = car.col === 'delivery' || car.col === 'done';
  const tasks = (isD ? getActiveDeliveryTasks(car) : getActiveRegenTasks(car));
  const prog = calcProg(car);
  const inv = daysSince(car.purchaseDate);
  const dots = tasks.map(t => {
    const p = calcSingleProg(car, t.id, tasks);
    const cls = p.pct === 100 ? 'done' : p.pct > 0 ? 'partial' : '';
    return `<div class="cc-dot ${cls}" title="${t.name} ${p.pct}%"></div>`;
  }).join('');

  const contractedDays = daysSinceContract(car);
  let topDayTag;
  if (car.col === 'done' && car.deliveryDate) {
    // v1.0.14: 納車完了は日数→納車日付（M/D 納車）固定表示
    const d = new Date(car.deliveryDate);
    const md = `${d.getMonth() + 1}/${d.getDate()}`;
    topDayTag = `<div class="cc-bigday cc-done-day">${md}<span class="cc-done-suffix">納車</span></div>`;
  } else if (car.isOrder) {
    // v1.8.72: オーダー車両は在庫扱いせず「オーダー車両」固定表示
    topDayTag = `<div class="cc-bigday cc-order-day" title="オーダー車両：在庫日数にカウントしない">${ic('box','📦',16)} オーダー</div>`;
  } else if (car.contract) {
    topDayTag = `<div class="cc-bigday db">売約<span class="cc-bigday-num">${contractedDays}</span>日</div>`;
  } else {
    const wt = invWarnTier(inv);
    const cls = wt ? (wt.days >= 45 ? 'dr' : wt.days >= 30 ? 'dw' : 'dg') : 'dg';
    topDayTag = `<div class="cc-bigday ${cls}"${wt?` style="background:${wt.bg};color:${wt.color}"`:''}>在庫<span class="cc-bigday-num">${inv}</span>日</div>`;
  }

  let bottomBar = '';
  if (car.col === 'purchase' || car.col === 'stock' || car.col === 'regen') {
    bottomBar = `<div class="cc-bottom-bar">仕入れから${inv}日</div>`;
  } else if (car.col === 'delivery') {
    const delDiff = car.deliveryDate ? daysDiff(car.deliveryDate) : null;
    if (delDiff != null) {
      const dt = delWarnTier(delDiff);
      const cls = dt ? (delDiff < 0 ? 'br' : delDiff <= 1 ? 'br' : delDiff <= 3 ? 'bw' : 'bb') : 'bb';
      const label = delDiff === 0 ? '納車本日' : delDiff > 0 ? `納車まで${delDiff}日` : `納車超過${-delDiff}日`;
      bottomBar = `<div class="cc-bottom-bar ${cls}"${dt?` style="background:${dt.bg};color:${dt.color}"`:''}>${label}</div>`;
    } else {
      bottomBar = `<div class="cc-bottom-bar">納車日未設定</div>`;
    }
  }

  const div = document.createElement('div');
  div.className = 'car-card' + (isCompact ? ' compact' : '');
  div.draggable = true;
  div.dataset.carId = car.id;
  div.dataset.col = car.col;
  div.innerHTML = `
    <div class="cc-thumb">${car.photo ? `<img src="${car.photo}">` : carEmoji(car.size)}</div>
    <div class="cc-body">
      <div class="cc-info-row">
        <div class="cc-info-left">
          <div class="cc-maker">${car.maker}</div>
          <div class="cc-model">${car.model}${car.grade ? ' ' + car.grade : ''}</div>
          ${(() => {
            // v1.8.61: 両方ありの時は1行にまとめる（総額ラベル小・本体は括弧内）。
            //   片方のみ → そちらが緑として表示、税ラベルも緑。
            const tlb = (typeof getTaxLabel === 'function') ? getTaxLabel('body')  : '税込';
            const tlt = (typeof getTaxLabel === 'function') ? getTaxLabel('total') : '税込';
            const shortB = (tlb === '税抜') ? '抜' : '込';
            const shortT = (tlt === '税抜') ? '抜' : '込';
            const pt = fmtPriceTwo(car.totalPrice, car.price);
            if (pt.hasTotal && pt.hasBody) {
              return `<div class="cc-price-wrap cc-price-wrap-both"><span class="cc-price-mini-lbl">総額</span><span class="cc-price-total">${pt.totalDisp}</span><span class="cc-price-tax-total">${shortT}</span><span class="cc-price-body-inline"><span class="cc-price-body-amt">${pt.bodyDisp}</span><span class="cc-price-tax-body">${shortB}</span></span></div>`;
            } else if (pt.hasTotal) {
              return `<div class="cc-price-wrap"><span class="cc-price-mini-lbl">総額</span><span class="cc-price-total">${pt.totalDisp}</span><span class="cc-price-tax-total">${shortT}</span></div>`;
            } else if (pt.hasBody) {
              return `<div class="cc-price-wrap"><span class="cc-price-mini-lbl">本体</span><span class="cc-price-total">${pt.bodyDisp}</span><span class="cc-price-tax-total">${shortB}</span></div>`;
            }
            return `<div class="cc-price-wrap"><span class="cc-price cc-price-empty">価格未設定</span></div>`;
          })()}
          ${(typeof customerChipHTML === 'function') ? customerChipHTML(car.customerName) : ''}
        </div>
        <div class="cc-info-right">
          ${topDayTag}
          <div class="cc-num-tag">${car.num || ''}</div>
          <div class="cc-tag">${car.size}</div>
          <div class="cc-tag">${fmtYearDisplay(parseYearInput(car.year)||car.year)}</div>
        </div>
      </div>
      <div class="cc-mid">
        <div class="cc-pct-wrap"><span class="cc-pct">${prog.pct}%</span><span class="cc-pct-label">全体進捗</span></div>
        <div class="cc-dots">${dots}</div>
      </div>
    </div>
    ${bottomBar}`;
  div.addEventListener('dragstart', () => { dragCard = car; div.classList.add('dragging'); });
  div.addEventListener('dragend', () => { dragCard = null; div.classList.remove('dragging'); });

  div.addEventListener('click', () => {
    if (!isCompact) { openDetail(car.id); return; }
    const colId = car.col;
    const currentExpanded = expandedCards[colId];
    if (currentExpanded === div) {
      openDetail(car.id);
    } else {
      if (currentExpanded) currentExpanded.classList.remove('expanded');
      div.classList.add('expanded');
      expandedCards[colId] = div;
    }
  });
  return div;
}

function handleKanbanMove(car, targetCol) {
  const fromLabel = COLS.find(c => c.id === car.col)?.label || car.col;
  const toLabel = COLS.find(c => c.id === targetCol)?.label || targetCol;

  if ((car.col === 'other' && (targetCol === 'delivery' || targetCol === 'done')) ||
      ((car.col === 'delivery' || car.col === 'done') && targetCol === 'other')) {
    showToast(`${fromLabel}と${toLabel}の間は移動できません`, 'CF-2006');
    return;
  }

  if ((car.col === 'purchase' || car.col === 'regen' || car.col === 'exhibit') && targetCol === 'delivery') {
    pendingDragCar = car;
    pendingTargetCol = targetCol;
    const lead = (typeof appSettings !== 'undefined' && appSettings.deliveryLeadDays) || 14;
    document.getElementById('sell-date').value = car.deliveryDate || dateAddDays(todayStr(), lead);
    { const _cn = document.getElementById('sell-customer-name'); if (_cn) _cn.value = car.customerName || ''; } // v2.26.0
    _renderSellOptionalTaskPickers(car); // v1.8.57
    document.getElementById('confirm-sell').classList.add('open');
    return;
  }

  if ((car.col === 'purchase' || car.col === 'regen' || car.col === 'exhibit') && targetCol === 'done') {
    pendingDragCar = car;
    pendingTargetCol = targetCol;
    const lead = (typeof appSettings !== 'undefined' && appSettings.deliveryLeadDays) || 14;
    document.getElementById('sell-date').value = car.deliveryDate || dateAddDays(todayStr(), lead);
    { const _cn = document.getElementById('sell-customer-name'); if (_cn) _cn.value = car.customerName || ''; } // v2.26.0
    _renderSellOptionalTaskPickers(car); // v1.8.57
    document.getElementById('confirm-sell').classList.add('open');
    return;
  }

  if (car.col === 'delivery' && targetCol === 'done') {
    pendingDragCar = car;
    pendingTargetCol = targetCol;
    document.getElementById('confirm-deliver').classList.add('open');
    return;
  }

  if ((car.col === 'delivery' || car.col === 'done') &&
      (targetCol === 'purchase' || targetCol === 'regen' || targetCol === 'exhibit')) {
    pendingDragCar = car;
    pendingTargetCol = targetCol;
    const sub = document.getElementById('uncontract-sub');
    if (sub) sub.innerHTML = icoE(`${fromLabel} → ${toLabel} に戻します。売約日・納車予定日・納車準備の進捗もすべてリセットされます。`);
    document.getElementById('confirm-uncontract').classList.add('open');
    return;
  }

  if (car.col === 'done' && targetCol === 'delivery') {
    pendingDragCar = car;
    pendingTargetCol = targetCol;
    document.getElementById('confirm-undeliver').classList.add('open');
    return;
  }

  applyKanbanMove(car, targetCol);
}

function applyKanbanMove(car, targetCol) {
  const fromLabel = COLS.find(c => c.id === car.col)?.label || car.col;
  const toLabel = COLS.find(c => c.id === targetCol)?.label || targetCol;
  if (targetCol === 'delivery' && car.col !== 'delivery') car.workMemo = '';
  // v1.8.83: 展示開始日の自動セット/クリア（裏方データ）
  const _fromColAK = car.col;
  if (typeof _applyColTransitionDates === 'function') _applyColTransitionDates(car, _fromColAK, targetCol);
  car.col = targetCol;
  addLog(car.id, `ステータス変更: ${fromLabel}→${toLabel}`);
  kanbanForceExpand = false; // v1.0.14: 何かを触ったら元のルールに戻る
  // v3.0.0 下ごしらえ：変えた欄だけを送る（車の中身をまるごと送らない）
  if (window.saveCarPaths) {
    window.saveCarPaths(car.id, [
      { path: ['col'], value: car.col },
      { path: ['workMemo'], value: car.workMemo || '' },
      { path: ['exhibitedAt'], value: car.exhibitedAt },
      { path: ['logs'], value: car.logs },
    ]);
  }
  renderAll();
  showToast('ステータスを更新しました');
}

function closeSellConfirm(sell) {
  document.getElementById('confirm-sell').classList.remove('open');
  if (!pendingDragCar) return;
  const car = pendingDragCar;
  const target = pendingTargetCol;
  pendingDragCar = null;
  pendingTargetCol = null;
  if (!sell) {
    showToast('キャンセルしました');
    return;
  }
  car.contract = 1;
  if (!car.contractDate) car.contractDate = todayStr();
  car.deliveryDate = document.getElementById('sell-date').value || '';
  // v2.26.0: 売約のお客様（顧客名）。空入力なら既存値は消さず維持。
  { const _cn = document.getElementById('sell-customer-name'); if (_cn) { const v = (typeof normCustomerName === 'function') ? normCustomerName(_cn.value) : _cn.value.trim(); if (v) car.customerName = v; } }
  car.workMemo = '';
  // v1.8.57: ポップアップで選択された選択制タスクを保存
  _saveSellOptionalTaskSelection(car);
  const fromLabel = COLS.find(c => c.id === car.col)?.label || car.col;
  const toLabel = COLS.find(c => c.id === target)?.label || target;
  // v1.8.83: 展示開始日の自動セット/クリア（裏方データ）
  const _fromColSC = car.col;
  if (typeof _applyColTransitionDates === 'function') _applyColTransitionDates(car, _fromColSC, target);
  car.col = target;
  // v1.8.71: 納車完了（done）にする時、その時の税設定をスナップショット保存
  if (target === 'done' && typeof snapshotPriceTax === 'function' && !car.priceTaxSnapshot) {
    car.priceTaxSnapshot = snapshotPriceTax();
  }
  if (target === 'done') {
    addLog(car.id, `売約＆納車完了：${fromLabel}→${toLabel}（特例）`);
  } else {
    addLog(car.id, `売約設定：${fromLabel}→${toLabel}`);
  }
  // v3.0.0 下ごしらえ：変えた欄だけを送る（車の中身をまるごと送らない）
  if (window.saveCarPaths) {
    window.saveCarPaths(car.id, [
      { path: ['contract'], value: car.contract },
      { path: ['contractDate'], value: car.contractDate || '' },
      { path: ['deliveryDate'], value: car.deliveryDate || '' },
      { path: ['customerName'], value: car.customerName || '' },
      { path: ['workMemo'], value: car.workMemo || '' },
      { path: ['selectedTasks'], value: car.selectedTasks },
      { path: ['exhibitedAt'], value: car.exhibitedAt },
      { path: ['col'], value: car.col },
      { path: ['priceTaxSnapshot'], value: car.priceTaxSnapshot },
      { path: ['logs'], value: car.logs },
    ]);
  }
  renderAll();
  if (target === 'done') {
    celebrateDelivery(car);
  } else {
    showToast('売約にしました!');
  }
}

function closeDeliverConfirm(deliver) {
  document.getElementById('confirm-deliver').classList.remove('open');
  if (!pendingDragCar) return;
  const car = pendingDragCar;
  const target = pendingTargetCol;
  pendingDragCar = null;
  pendingTargetCol = null;
  if (!deliver) {
    showToast('キャンセルしました');
    return;
  }
  car.col = target;
  // v1.8.71: 納車完了 → 税設定スナップショット保存
  if (target === 'done' && typeof snapshotPriceTax === 'function' && !car.priceTaxSnapshot) {
    car.priceTaxSnapshot = snapshotPriceTax();
  }
  addLog(car.id, '納車完了：納車準備→納車完了');
  // v3.0.0 下ごしらえ：変えた欄だけを送る（車の中身をまるごと送らない）
  if (window.saveCarPaths) {
    window.saveCarPaths(car.id, [
      { path: ['col'], value: car.col },
      { path: ['priceTaxSnapshot'], value: car.priceTaxSnapshot },
      { path: ['logs'], value: car.logs },
    ]);
  }
  renderAll();
  celebrateDelivery(car);
}

function closeUncontractConfirm(uncontract) {
  document.getElementById('confirm-uncontract').classList.remove('open');
  if (!pendingDragCar) return;
  const car = pendingDragCar;
  const target = pendingTargetCol;
  pendingDragCar = null;
  pendingTargetCol = null;
  if (!uncontract) {
    showToast('キャンセルしました');
    return;
  }
  car.contract = 0;
  car.contractDate = '';
  car.deliveryDate = '';
  car.workMemo = '';
  if (typeof DELIVERY_TASKS !== 'undefined' && typeof mkTaskState === 'function') {
    car.deliveryTasks = mkTaskState(DELIVERY_TASKS);
  }
  const fromLabel = COLS.find(c => c.id === car.col)?.label || car.col;
  const toLabel = COLS.find(c => c.id === target)?.label || target;
  // v1.8.83: 展示開始日の自動セット/クリア（裏方データ）
  const _fromColUC = car.col;
  if (typeof _applyColTransitionDates === 'function') _applyColTransitionDates(car, _fromColUC, target);
  car.col = target;
  addLog(car.id, `売約キャンセル：${fromLabel}→${toLabel}（売約・納車準備データをリセット）`);
  // v3.0.0 下ごしらえ：変えた欄だけを送る（車の中身をまるごと送らない）
  if (window.saveCarPaths) {
    window.saveCarPaths(car.id, [
      { path: ['contract'], value: car.contract },
      { path: ['contractDate'], value: '' },
      { path: ['deliveryDate'], value: '' },
      { path: ['workMemo'], value: '' },
      { path: ['deliveryTasks'], value: car.deliveryTasks },
      { path: ['exhibitedAt'], value: car.exhibitedAt },
      { path: ['col'], value: car.col },
      { path: ['logs'], value: car.logs },
    ]);
  }
  renderAll();
  showToast('売約をキャンセルしました');
}

function closeUndeliverConfirm(undeliver) {
  document.getElementById('confirm-undeliver').classList.remove('open');
  if (!pendingDragCar) return;
  const car = pendingDragCar;
  const target = pendingTargetCol;
  pendingDragCar = null;
  pendingTargetCol = null;
  if (!undeliver) {
    showToast('キャンセルしました');
    return;
  }
  // v1.8.83: 展示開始日の自動セット/クリア（裏方データ）
  const _fromColUD = car.col;
  if (typeof _applyColTransitionDates === 'function') _applyColTransitionDates(car, _fromColUD, target);
  car.col = target;
  addLog(car.id, '納車完了を取り消し：納車完了→納車準備');
  // v3.0.0 下ごしらえ：変えた欄だけを送る（車の中身をまるごと送らない）
  if (window.saveCarPaths) {
    window.saveCarPaths(car.id, [
      { path: ['exhibitedAt'], value: car.exhibitedAt },
      { path: ['col'], value: car.col },
      { path: ['logs'], value: car.logs },
    ]);
  }
  renderAll();
  showToast('納車完了を取り消しました');
}

function celebrateDelivery(car) {
  const overlay = document.getElementById('celebrate-overlay');
  if (!overlay) return;
  const conf = document.getElementById('celebrate-confetti');
  const carEl = document.getElementById('celebrate-car');
  if (carEl) carEl.textContent = `${car.maker} ${car.model}（${car.num}）`;
  if (conf) conf.innerHTML = '';
  const colors = ['#fcd34d','#fb923c','#f87171','#60a5fa','#34d399','#a78bfa','#f472b6','#facc15'];
  const count = 120;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const left = Math.random() * 100;
    const drift = (Math.random() - 0.5) * 300;
    const spin = (Math.random() * 1080 + 360) * (Math.random() < 0.5 ? -1 : 1);
    const dur = 2.4 + Math.random() * 1.6;
    const delay = Math.random() * 0.4;
    const w = 6 + Math.random() * 8;
    const h = 8 + Math.random() * 12;
    piece.style.left = left + '%';
    piece.style.width = w + 'px';
    piece.style.height = h + 'px';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.borderRadius = Math.random() < 0.3 ? '50%' : '2px';
    piece.style.setProperty('--drift', drift + 'px');
    piece.style.setProperty('--spin', spin + 'deg');
    piece.style.animationDuration = dur + 's';
    piece.style.animationDelay = delay + 's';
    if (conf) conf.appendChild(piece);
  }
  overlay.classList.remove('fade-out');
  overlay.classList.add('show');
  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => {
      overlay.classList.remove('show', 'fade-out');
      if (conf) conf.innerHTML = '';
    }, 500);
  }, 3000);
}

// ====================================================================
// v1.8.57: 売約確認ポップアップ内の「選択制タスク」チェックUI
// ====================================================================
//   納車準備フェーズの選択制タスクを取得して、車両既存の selectedTasks 状態を
//   反映したチェックボックスを描画。なければセクション自体を非表示。
function _renderSellOptionalTaskPickers(car) {
  const head = document.getElementById('sell-optional-tasks-head');
  const body = document.getElementById('sell-optional-tasks-body');
  if (!head || !body) return;
  const tasks = (typeof getAllTasksForUI === 'function') ? getAllTasksForUI('delivery') : [];
  const optTasks = tasks.filter(t => t.enabled && t.optional);
  if (optTasks.length === 0) {
    head.style.display = 'none';
    body.style.display = 'none';
    body.innerHTML = '';
    return;
  }
  const sel = (car && car.selectedTasks && car.selectedTasks.delivery) || {};
  let html = '';
  optTasks.forEach(t => {
    const checked = sel[t.id] === true;
    html += `
      <label style="display:flex;align-items:center;gap:8px;padding:5px 4px;cursor:pointer;font-size:13px;border-bottom:1px dashed var(--border)">
        <input type="checkbox" data-task-id="${(t.id || '').replace(/"/g,'&quot;')}" ${checked ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer">
        <span style="font-size:14px">${icoE(t.icon) || ic('clipboard','📋',16)}</span>
        <span>${(t.name || '').replace(/</g,'&lt;')}</span>
      </label>`;
  });
  head.style.display = '';
  body.style.display = '';
  body.innerHTML = html + '<div style="font-size:11px;color:var(--text3);margin-top:4px">※ あとからカード詳細→「'+ic('pencil','✏️',15)+' 車両情報を編集」でも変更できます</div>';
}

function _saveSellOptionalTaskSelection(car) {
  if (!car) return;
  const body = document.getElementById('sell-optional-tasks-body');
  if (!body) return;
  if (!car.selectedTasks) car.selectedTasks = { regen: {}, delivery: {} };
  if (!car.selectedTasks.delivery) car.selectedTasks.delivery = {};
  // delivery 側だけリセットして上書き
  car.selectedTasks.delivery = {};
  const checks = body.querySelectorAll('input[type=checkbox][data-task-id]');
  checks.forEach(chk => {
    const tid = chk.getAttribute('data-task-id');
    if (!tid) return;
    if (chk.checked) car.selectedTasks.delivery[tid] = true;
  });
}
