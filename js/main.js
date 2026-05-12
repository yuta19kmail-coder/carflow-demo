// ========================================
// main.js
// 全体の再描画ディスパッチャ＋リアルタイム同期適用
// v1.3.6: モーダルのオーバーレイクリックで閉じる挙動の登録
// v1.8.0: applyRealtimeCars / applyRealtimeBoardNotes 追加
// v1.8.1: ミーティングビュー対応
// ========================================

// 現在アクティブなタブ/パネルをすべて再描画
function renderAll() {
  renderActions();
  const activeTab = document.querySelector('.tab.active');
  if (activeTab) {
    const t = activeTab.textContent;
    if (t.includes('タスク'))     renderKanban();
    if (t.includes('カレンダー')) renderCalendar();
    if (t.includes('展示'))       renderExhibit();
    if (t.includes('進捗'))       renderProgress();
    if (t.includes('全体'))       renderTable();
    if (t.includes('在庫'))       renderInventory();
    if (t.includes('商談'))       renderDeal();
  }
  // v1.8.1: ミーティングビュー（サイドバー経由で開かれた時、view-meeting が active なら更新）
  const meetingView = document.getElementById('view-meeting');
  if (meetingView && meetingView.classList.contains('active') && typeof renderMeeting === 'function') {
    renderMeeting();
  }
}

// ========================================
// v1.8.0: リアルタイム同期の差し込み
// ========================================
function applyRealtimeCars(list, meta) {
  if (!Array.isArray(list)) return;

  if (meta && typeof setSyncStatus === 'function') {
    if (!navigator.onLine) setSyncStatus('offline');
    else if (meta.fromCache) setSyncStatus('cache');
    else setSyncStatus('online');
  }

  const protectedIds = new Set();
  if (typeof editingCarId !== 'undefined' && editingCarId) {
    protectedIds.add(String(editingCarId));
  }
  const wsId = (typeof window.getWsActiveCarId === 'function')
    ? window.getWsActiveCarId() : null;
  if (wsId) protectedIds.add(String(wsId));
  // v1.8.50: カード詳細モーダルが開いてる車も保護。
  //   詳細内で大タスクをトグルした直後に snapshot のキャッシュ反映で
  //   旧 state が戻り、kanban のドット色が反映されない不具合を防ぐ。
  if (typeof activeDetailCarId !== 'undefined' && activeDetailCarId) {
    protectedIds.add(String(activeDetailCarId));
  }

  const localById = {};
  for (let i = 0; i < cars.length; i++) {
    if (cars[i] && cars[i].id) localById[String(cars[i].id)] = cars[i];
  }

  // v1.8.40: 「直前にローカルで削除した車両」は snapshot のキャッシュ反映前だと
  //          まだ list に残っていることがあり、再生成されてダッシュボード見込み等に
  //          数字が残る不具合があった（特に納車準備→削除の流れ）。
  //          db-cars.isCarPendingDelete でフィルタして混入を防ぐ。
  const isPendingDelete = (sid) => !!(window.dbCars
    && typeof window.dbCars.isCarPendingDelete === 'function'
    && window.dbCars.isCarPendingDelete(sid));

  const next = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c || !c.id) continue;
    const sid = String(c.id);
    // v1.8.40: 削除中の車両は snapshot に残っていてもスキップ
    if (isPendingDelete(sid)) continue;
    seen.add(sid);
    if (protectedIds.has(sid) && localById[sid]) {
      next.push(localById[sid]);
    } else {
      next.push(c);
    }
  }
  // v1.8.40: snapshot から消えたことを確認できた = 削除完了。pending を解除する。
  if (window.dbCars && typeof window.dbCars._confirmPendingDelete === 'function') {
    const sidsInSnap = new Set();
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].id) sidsInSnap.add(String(list[i].id));
    }
    // localById には残っていない & snapshot にも残っていない ID は削除確定
    Object.keys(localById).forEach(lid => {
      if (!sidsInSnap.has(lid) && isPendingDelete(lid)) {
        window.dbCars._confirmPendingDelete(lid);
      }
    });
  }
  protectedIds.forEach(pid => {
    // v1.8.40: 削除予約中の ID は protect 対象としても復活させない
    if (isPendingDelete(pid)) return;
    if (!seen.has(pid) && localById[pid]) next.push(localById[pid]);
  });

  cars.length = 0;
  next.forEach(c => cars.push(c));

  if (typeof activeDetailCarId !== 'undefined' && activeDetailCarId) {
    const car = cars.find(x => x && x.id === activeDetailCarId);
    if (car && typeof renderDetailBody === 'function') {
      try { renderDetailBody(car); } catch (e) {}
    }
  }

  if (typeof renderAll === 'function') renderAll();
  if (typeof renderDashboard === 'function') renderDashboard();
}
window.applyRealtimeCars = applyRealtimeCars;

function applyRealtimeBoardNotes(list) {
  if (!Array.isArray(list)) return;
  if (typeof boardNotes === 'undefined' || !Array.isArray(boardNotes)) return;

  const editingId = (typeof window.getEditingBoardNoteId === 'function')
    ? window.getEditingBoardNoteId() : null;

  const localById = {};
  for (let i = 0; i < boardNotes.length; i++) {
    if (boardNotes[i] && boardNotes[i].id) localById[String(boardNotes[i].id)] = boardNotes[i];
  }

  const next = [];
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (!n || !n.id) continue;
    const sid = String(n.id);
    if (editingId && sid === String(editingId) && localById[sid]) {
      next.push(localById[sid]);
    } else {
      next.push(n);
    }
  }

  boardNotes.length = 0;
  next.forEach(n => boardNotes.push(n));

  if (typeof renderBoardNotes === 'function') renderBoardNotes();
}
window.applyRealtimeBoardNotes = applyRealtimeBoardNotes;

// ========================================
// v1.8.0: 同期ステータスインジケータ
// ========================================
function setSyncStatus(state, label) {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  el.classList.remove('sync-online', 'sync-cache', 'sync-offline');
  if (state === 'offline') {
    el.classList.add('sync-offline');
    el.title = 'ネット接続が切れています。復帰時に自動同期します';
  } else if (state === 'cache') {
    el.classList.add('sync-cache');
    el.title = 'キャッシュ表示中。サーバーと同期待ち';
  } else {
    el.classList.add('sync-online');
    el.title = '他のスタッフの変更がリアルタイムで反映されます';
  }
  const txt = el.querySelector('.sync-text');
  if (txt) txt.textContent = label || (state === 'offline' ? 'オフライン'
                                      : state === 'cache' ? 'キャッシュ'
                                      : '同期');
}
window.setSyncStatus = setSyncStatus;

window.addEventListener('online', function () { setSyncStatus('online'); });
window.addEventListener('offline', function () { setSyncStatus('offline'); });

// ========================================
// v1.3.6: 車両詳細モーダルをオーバーレイクリックで閉じる
// ========================================
document.addEventListener('DOMContentLoaded', function () {
  const detailOverlay = document.getElementById('modal-detail');
  if (detailOverlay) {
    detailOverlay.addEventListener('click', function (e) {
      if (e.target === detailOverlay) closeModal('modal-detail');
    });
  }
});
