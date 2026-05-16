// ========================================
// task-completion-notify.js
// v1.8.80: 大タスクの完了瞬間を検知して LINE 通知を送る
//
// 仕組み：
//   - 各車両に car.notifiedCompletedTasks = { regen: [taskId,...], delivery: [taskId,...] } を持つ
//   - checkTaskCompletionAndNotify(car) を呼ぶと、未通知の完了済み大タスクを検出 → LINE 送信 → 記録
//   - 呼び出しタイミング：worksheet.js / car-modal.js / kanban.js でチェック状態が変わった後など
//   - LINE 送信先：line-notify.js の sendLineMessage（既存ヘルパー）に委譲。
//     未定義の場合は console.log にフォールバック（開発時）
// ========================================

// 既通知ストア初期化
//   - 構造を保証するのみ。_init フラグは初回チェック時に立てる。
function _ensureNotifiedStore(car) {
  if (!car) return null;
  if (!car.notifiedCompletedTasks || typeof car.notifiedCompletedTasks !== 'object') {
    car.notifiedCompletedTasks = { regen: [], delivery: [], _init: false };
  }
  if (!Array.isArray(car.notifiedCompletedTasks.regen))    car.notifiedCompletedTasks.regen    = [];
  if (!Array.isArray(car.notifiedCompletedTasks.delivery)) car.notifiedCompletedTasks.delivery = [];
  return car.notifiedCompletedTasks;
}

// 作業者名の解決：直近の操作ログから取得 or 現在のユーザー
function _resolveWorkerName(car) {
  // 1) car.logs（最新が先頭）に user が記録されていればそれ
  if (car && Array.isArray(car.logs) && car.logs.length) {
    const last = car.logs[0];
    if (last && last.user) return last.user;
  }
  // 2) 現在のユーザー
  if (typeof currentUser !== 'undefined' && currentUser) return currentUser;
  // 3) フォールバック
  return '担当';
}

// 車両表示名（メーカー + モデル）
function _resolveVehicleName(car) {
  if (!car) return '';
  const m = (car.maker || '').trim();
  const n = (car.model || '').trim();
  return [m, n].filter(Boolean).join(' ');
}

// 大タスク1個の完了通知を送る
function _sendTaskCompletionNotification(car, task, phase) {
  // 所要日数 / カテゴリ判定
  let days = null;
  let category = null;
  const dl = (typeof getTaskDeadlines === 'function') ? getTaskDeadlines(task.id, phase) : { target: null, limit: null };
  const target = (dl.target != null) ? dl.target : dl.limit;
  const limit  = (dl.limit  != null) ? dl.limit  : dl.target;

  if (phase === 'regen') {
    // regen: 仕入からの経過日数
    days = (typeof daysSince === 'function') ? daysSince(car.purchaseDate) : null;
    category = (typeof judgeLineMessageCategory === 'function') ? judgeLineMessageCategory(days, target, limit) : null;
  } else if (phase === 'delivery') {
    // delivery: 納車予定までの残日数（大きいほど早期完了＝良い）
    if (!car.deliveryDate) return; // 納車日未設定なら通知しない
    const remain = (typeof daysDiff === 'function') ? daysDiff(car.deliveryDate) : null;
    if (remain == null) return;
    days = remain;
    // delivery 用判定：days が大きいほど良い → target/limit と「以上」「以下」で判定
    if (target != null && limit != null) {
      if (days >= target)      category = 'within_target';
      else if (days >= limit)  category = 'between';
      else                     category = 'over_limit';
    }
  }
  if (!category) return; // 期日未設定 → 通知しない

  // 変数組み立て
  const vars = {
    T: task.name || '',
    vehicle: _resolveVehicleName(car),
    worker: _resolveWorkerName(car),
    // delivery の「N日前完了」は文脈的に変なので days を出さない
    days: (phase === 'regen' && days != null && Number.isFinite(days)) ? days : null,
  };

  // メッセージ取得
  const message = (typeof pickLineMessage === 'function') ? pickLineMessage(category, vars) : '';
  if (!message) return;

  // LINE 送信
  if (typeof sendLineMessage === 'function') {
    try {
      sendLineMessage(message);
    } catch (e) {
      console.warn('[task-completion-notify] sendLineMessage failed:', e);
      console.log('[task-completion-notify] message (fallback):', message);
    }
  } else if (window.lineNotify && typeof window.lineNotify.sendMessage === 'function') {
    Promise.resolve(window.lineNotify.sendMessage(message)).catch(err => {
      console.warn('[task-completion-notify] lineNotify.sendMessage failed:', err);
    });
  } else {
    // 開発フォールバック：コンソールに出力
    console.log('[task-completion-notify simulated]\n' + message);
  }
}

// 車両の全大タスクをチェックし、未通知の完了タスクを LINE 通知する
//   - 初回チェック（store._init === false）時は通知をスキップし、既存完了タスクは「過去のもの」として記録のみ
//     （Firestore からロード直後の "既に完了している" タスク分が通知連投にならないように）
//   - 以降の呼び出しで、新規に完了したタスクのみ通知される
function checkTaskCompletionAndNotify(car) {
  if (!car) return;
  // other 列はスキップ
  if (car.col === 'other') return;
  const store = _ensureNotifiedStore(car);
  if (!store) return;
  const isFirstCheck = !store._init;

  ['regen', 'delivery'].forEach(phase => {
    const tasks = (phase === 'delivery')
      ? ((typeof getActiveDeliveryTasks === 'function') ? getActiveDeliveryTasks(car) : [])
      : ((typeof getActiveRegenTasks === 'function')    ? getActiveRegenTasks(car)    : []);
    if (!tasks.length) return;
    tasks.forEach(t => {
      if (store[phase].includes(t.id)) return; // 既通知
      const isComplete = (typeof _isTaskComplete === 'function')
        ? _isTaskComplete(car, t, tasks)
        : false;
      if (!isComplete) return;
      // 新たに完了 → 初回チェックでなければ通知、必ず記録
      if (!isFirstCheck) {
        _sendTaskCompletionNotification(car, t, phase);
      }
      store[phase].push(t.id);
    });
  });
  store._init = true;
}

// 全車両のストアを初期化（ロード時に呼ぶ。これにより既存の完了タスクが「過去」として記録される）
function initTaskCompletionStoreForAllCars() {
  if (typeof cars === 'undefined' || !Array.isArray(cars)) return;
  cars.forEach(car => {
    if (!car) return;
    if (car.col === 'other') return;
    const store = _ensureNotifiedStore(car);
    if (store._init) return;
    // 初回チェック相当：通知しないが既存完了は記録
    ['regen', 'delivery'].forEach(phase => {
      const tasks = (phase === 'delivery')
        ? ((typeof getActiveDeliveryTasks === 'function') ? getActiveDeliveryTasks(car) : [])
        : ((typeof getActiveRegenTasks === 'function')    ? getActiveRegenTasks(car)    : []);
      tasks.forEach(t => {
        if (store[phase].includes(t.id)) return;
        const isComplete = (typeof _isTaskComplete === 'function') ? _isTaskComplete(car, t, tasks) : false;
        if (isComplete) store[phase].push(t.id);
      });
    });
    store._init = true;
  });
}

// グローバル公開
window.checkTaskCompletionAndNotify     = checkTaskCompletionAndNotify;
window.initTaskCompletionStoreForAllCars = initTaskCompletionStoreForAllCars;
