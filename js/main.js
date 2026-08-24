// ========================================
// main.js
// 全体の再描画ディスパッチャ＋リアルタイム同期適用
// v1.3.6: モーダルのオーバーレイクリックで閉じる挙動の登録
// v1.8.0: applyRealtimeCars / applyRealtimeBoardNotes 追加
// v1.8.1: ミーティングビュー対応
// ========================================

// 現在アクティブなタブ/パネルをすべて再描画
function renderAll() {
  // v2.12.2: 1つの描画が失敗しても、他のビュー（特にリアルタイム反映先）が
  //   巻き込まれて止まらないよう、各描画を個別に try/catch で保護する。
  //   以前は renderActions() が素で呼ばれており、ここで落ちると以降の
  //   renderCalendar 等が一緒に止まり、「データは届いているのに画面だけ古い
  //   （タブを切り替えると直る）」現象の原因になっていた。
  const _safe = (fn) => { try { if (typeof fn === 'function') fn(); } catch (e) { console.error('[renderAll]', e); } };

  _safe(renderActions);

  // v2.12.2: 表示中のビューは「実際に画面に出ている #view-* 要素」で判定する。
  //   以前はタブの表示文字（'カレンダー' 等）で判定していたが、確実性に欠けたため
  //   見えているビューそのものを基準に再描画する方式へ変更（別端末の変更も確実に追従）。
  const activeView = document.querySelector('.view.active');
  const vid = activeView ? activeView.id : '';
  if (vid === 'view-kanban')    _safe(renderKanban);
  if (vid === 'view-calendar')  _safe(renderCalendar);
  if (vid === 'view-exhibit')   _safe(renderExhibit);
  if (vid === 'view-progress')  _safe(renderProgress);
  if (vid === 'view-table')     _safe(renderTable);
  if (vid === 'view-inventory') _safe(renderInventory);
  if (vid === 'view-deal')      _safe(renderDeal);
  if (vid === 'view-overview')  _safe(renderOverview);
  if (vid === 'view-worklog')   _safe(renderWorklog);
  if (vid === 'view-meeting')   _safe(renderMeeting);

  // v2.1.0: バックオフィスはサイドパネル。開いていればリアルタイム再描画
  const boPanel = document.getElementById('panel-backoffice');
  if (boPanel && boPanel.classList.contains('open')) _safe(renderBackoffice);

  // v2.33.0: 整備依頼業務（PitFlow）も同じ扱い。中身は PitFlow の購読が更新するので、
  //   ここでは「開いていれば描き直す」だけでよい。
  const psPanel = document.getElementById('panel-pitsales');
  if (psPanel && psPanel.classList.contains('open') && window.PitEmbed) _safe(PitEmbed.renderPanel);
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

  // v1.8.x / v2.5.11: 保護対象の分類
  //   - strongProtect: 編集モーダル中 / 作業管理票（worksheet）中 → 全更新ブロック
  //     （ユーザーがフォーム入力中なので他端末からの上書きを避ける）
  //   - 直近ローカル書込み（2秒以内）→ 短期的に保護してフリッカ防止
  //     （以前の v1.8.50 では activeDetailCarId 全面保護にしていたが、
  //      他端末からの大タスク変更などが反映されない不具合があったので時間ベースに変更）
  const strongProtect = new Set();
  if (typeof editingCarId !== 'undefined' && editingCarId) {
    strongProtect.add(String(editingCarId));
  }
  const wsId = (typeof window.getWsActiveCarId === 'function')
    ? window.getWsActiveCarId() : null;
  if (wsId) strongProtect.add(String(wsId));

  const LOCAL_WRITE_PROTECT_MS = 2000;
  const _nowMs = Date.now();
  const _getLastWriteAt = (window.dbCars && typeof window.dbCars.getLastLocalWriteAt === 'function')
    ? window.dbCars.getLastLocalWriteAt
    : function () { return 0; };
  function isRecentLocalWrite(sid) {
    const t = _getLastWriteAt(sid);
    return t > 0 && (_nowMs - t) < LOCAL_WRITE_PROTECT_MS;
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
    // v2.5.11: 強い保護（編集中／作業管理票中）→ 全更新ブロック
    //          直近 2 秒以内に自分が書込んだ車 → 短期間保護してフリッカ防止
    //          それ以外は遠隔の更新を素直に反映
    if (strongProtect.has(sid) && localById[sid]) {
      next.push(localById[sid]);
    } else if (isRecentLocalWrite(sid) && localById[sid]) {
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
  // v2.5.11: 強い保護対象が snapshot から欠けてた場合のみローカルから復元
  //          （直近ローカル書込みだけの車は snapshot 側の事実を優先したいので含めない）
  strongProtect.forEach(pid => {
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
