// ========================================
// db-cars.js (v1.5.1〜 / v1.8.0 リアルタイム同期)
// Firestore の cars コレクションに対する CRUD wrapper
// ----------------------------------------
// パス：companies/{companyId}/cars/{carId}
//
// 提供関数（window.dbCars 名前空間）：
//   loadCars()                  : 自社の全 car ドキュメントを取得し配列で返す
//   saveCar(car)                : 単体 set（merge:true）でフィールド追加・更新
//   saveCarField(id, path, val) : v1.8.0 項目単位の保存（FieldPath で1点だけ更新）
//   deleteCar(carId)            : 1件削除
//   seedSampleCarsIfEmpty()     : Firestore に何も無ければ makeSampleCars() で初期投入
//   refreshCars()               : 再読み込みして window.cars を更新 + renderAll
//   subscribeCars(onUpdate)     : v1.8.0 onSnapshot 購読を開始。返り値は unsubscribe()
// ========================================

(function () {
  'use strict';

  function _carsCol() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db
      .collection('companies').doc(window.fb.currentCompanyId)
      .collection('cars');
  }

  // 🔴🔴 v3.0.0 下ごしらえ＝いちばん大事な決めごと
  //   「まるごと保存」では、チェックの記録を絶対に送らない。
  //   ＝ この端末が抱えている「未チェック」が、ほかの端末の入れたチェックを消しに行かない。
  //   チェックの記録は、押した所だけを送る道（saveCarPaths / saveCarField）でしか書かない。
  //   ⚠ 車を新しく作る時だけ opts.initial = true で、まっさらな状態を1回だけ書く。
  const CHECK_KEYS = [
    'regenTasks', 'deliveryTasks', 'backofficeTasks', 'backofficeWorkflows',
    'taskMemos', 'taskVariants', 'equipment',
  ];
  function isCheckKey(k) { return CHECK_KEYS.indexOf(String(k)) >= 0; }

  function _normalizeForSave(car, opts) {
    const initial = !!(opts && opts.initial);
    const out = {};
    for (const k in car) {
      const v = car[k];
      if (v === undefined) continue;
      if (!initial && isCheckKey(k)) continue;   // v3.0.0 チェックは まるごと保存では送らない
      out[k] = v;
    }
    if (!out.updatedAt) out.updatedAt = window.fb.serverTimestamp();
    // v1.8.58: LINE通知で「誰が更新したか」を出すため updatedBy を必ず付ける
    if (window.fb.currentUser && window.fb.currentUser.uid) {
      out.updatedBy = window.fb.currentUser.uid;
    }
    return out;
  }

  function _normalizeForLoad(docSnap) {
    const data = docSnap.data() || {};
    data.id = data.id || docSnap.id;
    return data;
  }

  // v2.5.11: 直近のローカル書込み時刻を carId 単位で記録。
  // applyRealtimeCars 側で「直近自分が書いた車だけ短期間保護」するために使う。
  // 旧来の activeDetailCarId 全面保護は他端末からの更新もブロックしていたため廃止。
  const _lastLocalWriteAt = {};
  function _markLocalWrite(carId) {
    if (!carId) return;
    _lastLocalWriteAt[String(carId)] = Date.now();
  }
  function getLastLocalWriteAt(carId) {
    if (!carId) return 0;
    return _lastLocalWriteAt[String(carId)] || 0;
  }

  async function loadCars() {
    const col = _carsCol();
    if (!col) {
      console.warn('[db-cars] companyId 未確定');
      return [];
    }
    const snap = await col.get();
    const list = [];
    snap.forEach(d => list.push(_normalizeForLoad(d)));
    console.log('[db-cars] loaded', list.length, 'cars');
    return list;
  }

  async function saveCar(car, opts) {
    if (!car || !car.id) {
      console.error('[db-cars] saveCar: car.id がない', car);
      return;
    }
    const col = _carsCol();
    if (!col) {
      console.warn('[db-cars] saveCar: companyId 未確定');
      return;
    }
    // v2.5.11: ローカル書込み時刻を記録（onSnapshot 経由の上書きフリッカ防止）
    _markLocalWrite(car.id);
    try {
      await col.doc(String(car.id)).set(_normalizeForSave(car, opts), { merge: true });
    } catch (err) {
      console.error('[db-cars] saveCar error:', err, car);
      if (typeof showToast === 'function') showToast('保存に失敗しました', 'CF-0018');
      throw err;
    }
  }

  // v1.8.0: 項目単位の保存（FieldPath で1点だけ update）
  //   path: 文字列の配列。例 ['regenTasks', 't_regen', 'item_xxx']
  //   value: null/undefined を渡すと FieldValue.delete() でキー削除。
  async function saveCarField(carId, path, value) {
    if (!carId || !Array.isArray(path) || path.length === 0) {
      console.error('[db-cars] saveCarField: 引数不正', carId, path);
      return;
    }
    const col = _carsCol();
    if (!col) {
      console.warn('[db-cars] saveCarField: companyId 未確定');
      return;
    }
    // v2.5.11: ローカル書込み時刻を記録
    _markLocalWrite(carId);
    try {
      const FieldPath = window.firebase.firestore.FieldPath;
      const FieldValue = window.firebase.firestore.FieldValue;
      const fp = new FieldPath(...path.map(String));
      const v = (value === null || value === undefined)
        ? FieldValue.delete()
        : value;
      // v1.8.58: LINE通知のために updatedBy も同時に更新
      const myUid = (window.fb.currentUser && window.fb.currentUser.uid) || null;
      if (myUid) {
        await col.doc(String(carId)).update(
          fp, v,
          new FieldPath('updatedAt'), window.fb.serverTimestamp(),
          new FieldPath('updatedBy'), myUid
        );
      } else {
        await col.doc(String(carId)).update(
          fp, v,
          new FieldPath('updatedAt'), window.fb.serverTimestamp()
        );
      }
    } catch (err) {
      console.error('[db-cars] saveCarField error:', err, carId, path);
      if (typeof showToast === 'function') showToast('保存に失敗しました', 'CF-0018');
      throw err;
    }
  }

  // v3.0.0 下ごしらえ：まとめて「1点ずつ」保存（1回の書き込みで複数の場所を書く）
  //   entries: [{ path:['regenTasks','t_regen','r5'], value:true }, ...]
  //   value に null / undefined を渡すとそのキーを消す。
  //   🔴 車の中身をまるごと送らないので、他の端末が入れたチェックを巻き戻さない。
  //      「まるごと保存（saveCar）」は、車を新しく作る時と、直し用の道具だけが使う。
  async function saveCarPaths(carId, entries) {
    if (!carId || !Array.isArray(entries) || entries.length === 0) {
      console.error('[db-cars] saveCarPaths: 引数不正', carId, entries);
      return;
    }
    const col = _carsCol();
    if (!col) {
      console.warn('[db-cars] saveCarPaths: companyId 未確定');
      return;
    }
    _markLocalWrite(carId);
    try {
      const FieldPath = window.firebase.firestore.FieldPath;
      const FieldValue = window.firebase.firestore.FieldValue;
      const args = [];
      entries.forEach(e => {
        if (!e || !Array.isArray(e.path) || e.path.length === 0) return;
        args.push(new FieldPath(...e.path.map(String)));
        args.push((e.value === null || e.value === undefined) ? FieldValue.delete() : e.value);
      });
      if (!args.length) return;
      args.push(new FieldPath('updatedAt'), window.fb.serverTimestamp());
      const myUid = (window.fb.currentUser && window.fb.currentUser.uid) || null;
      if (myUid) args.push(new FieldPath('updatedBy'), myUid);
      await col.doc(String(carId)).update(...args);
    } catch (err) {
      console.error('[db-cars] saveCarPaths error:', err, carId, entries);
      if (typeof showToast === 'function') showToast('保存に失敗しました', 'CF-0018');
      throw err;
    }
  }

  // v1.8.40: 削除直後の onSnapshot 競合で「削除済みのはずの車両が
  //          ダッシュボード見込み等に残る」現象を防ぐためのペンディングセット。
  //          deleteCar 開始時に追加 → applyRealtimeCars で除外 → snapshot から
  //          消えたことを確認してクリア（保険として 10 秒後に強制クリア）。
  const _pendingDeletes = new Set();
  function _markPendingDelete(carId) {
    if (!carId) return;
    const sid = String(carId);
    _pendingDeletes.add(sid);
    // 保険：10秒後に強制解除（snapshot がいつまでも追いつかない場合の漏れ防止）
    setTimeout(() => { _pendingDeletes.delete(sid); }, 10000);
  }
  function _confirmPendingDelete(carId) {
    if (!carId) return;
    _pendingDeletes.delete(String(carId));
  }
  function isCarPendingDelete(carId) {
    return _pendingDeletes.has(String(carId));
  }

  async function deleteCar(carId) {
    if (!carId) return;
    const col = _carsCol();
    if (!col) return;
    // v1.8.40: 楽観的に「削除中」マークを付ける。realtime 同期で再生成されないように。
    _markPendingDelete(carId);
    try {
      await col.doc(String(carId)).delete();
      // 削除自体は成功。snapshot 反映後、applyRealtimeCars 側で _confirmPendingDelete される
    } catch (err) {
      // 失敗時は再生成を許容するためマークを外す
      _confirmPendingDelete(carId);
      console.error('[db-cars] deleteCar error:', err);
      if (typeof showToast === 'function') showToast('削除に失敗しました', 'CF-0019');
      throw err;
    }
  }

  // v1.8.23: settings/main の _seedSampleDone フラグで再シード防止
  function _settingsRef() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db
      .collection('companies').doc(window.fb.currentCompanyId)
      .collection('settings').doc('main');
  }

  async function seedSampleCarsIfEmpty() {
    const col = _carsCol();
    if (!col) return false;

    // v1.8.23: フラグが立ってたら絶対に再投入しない（全消去後の復活防止）
    try {
      const sref = _settingsRef();
      if (sref) {
        const ssnap = await sref.get();
        if (ssnap.exists && ssnap.data()._seedSampleDone) {
          return false;
        }
      }
    } catch (e) { /* 取れなくてもサンプル投入優先しない */ }

    const probe = await col.limit(1).get();

    // v1.8.23: 既に車両があれば、移行のためフラグだけ立てて終了（既存ユーザー対応）
    if (!probe.empty) {
      try {
        const sref = _settingsRef();
        if (sref) await sref.set({ _seedSampleDone: true }, { merge: true });
      } catch (e) {}
      return false;
    }

    if (typeof makeSampleCars !== 'function') {
      console.warn('[db-cars] makeSampleCars が未定義');
      return false;
    }
    const sample = makeSampleCars();
    console.log('[db-cars] seeding', sample.length, 'sample cars');
    const batch = window.fb.db.batch();
    sample.forEach(c => {
      const ref = col.doc(String(c.id));
      batch.set(ref, _normalizeForSave(c, { initial: true }));   // v3.0.0 サンプル投入＝まっさらな状態を書く
    });
    await batch.commit();

    // v1.8.23: 投入完了フラグを立てて、以降の自動シードを止める
    try {
      const sref = _settingsRef();
      if (sref) await sref.set({ _seedSampleDone: true }, { merge: true });
    } catch (e) {}

    console.log('[db-cars] seeded OK');
    return true;
  }

  async function refreshCars() {
    const list = await loadCars();
    if (typeof cars !== 'undefined' && Array.isArray(cars)) {
      cars.length = 0;
      list.forEach(c => cars.push(c));
    }
    if (typeof renderAll === 'function') renderAll();
    if (typeof renderDashboard === 'function') renderDashboard();
  }

  // v1.8.0: onSnapshot 購読
  function subscribeCars(onUpdate) {
    const col = _carsCol();
    if (!col) {
      console.warn('[db-cars] subscribeCars: companyId 未確定');
      return function () {};
    }
    const unsub = col.onSnapshot(
      function (snap) {
        const list = [];
        snap.forEach(d => list.push(_normalizeForLoad(d)));
        const meta = {
          fromCache: !!(snap.metadata && snap.metadata.fromCache),
          hasPendingWrites: !!(snap.metadata && snap.metadata.hasPendingWrites),
        };
        try {
          if (typeof onUpdate === 'function') onUpdate(list, meta);
        } catch (e) {
          console.error('[db-cars] subscribeCars callback error:', e);
        }
      },
      function (err) {
        console.error('[db-cars] subscribeCars error:', err);
        if (typeof showToast === 'function') showToast('車両データの同期でエラー', 'CF-0020');
      }
    );
    return unsub;
  }

  window.dbCars = {
    loadCars: loadCars,
    saveCar: saveCar,
    saveCarField: saveCarField,
    saveCarPaths: saveCarPaths,
    deleteCar: deleteCar,
    seedSampleCarsIfEmpty: seedSampleCarsIfEmpty,
    refreshCars: refreshCars,
    subscribeCars: subscribeCars,
    // v1.8.40: realtime 同期側で削除中車両をスキップするためのフック
    isCarPendingDelete: isCarPendingDelete,
    _confirmPendingDelete: _confirmPendingDelete,
    // v2.5.11: 直近のローカル書込み時刻取得（main.js applyRealtimeCars で参照）
    getLastLocalWriteAt: getLastLocalWriteAt,
  };

  console.log('[db-cars] ready');
})();

// ========================================
// グローバルショートカット
// ========================================
/* 🔴 2026-08-05 修正：どちらも失敗を console に出すだけで、**画面には何も出していなかった**。
   チェック作業（丸付け）・作業シート・詳細の各欄はここを通るので、
   保存できていないのに画面はチェックが入ったままになり、
   **翌朝リロードすると全部外れている**、が起こりうる。
   → 失敗したら画面に1回だけ知らせる。⚠ 連打で何度も出ないよう、6秒に1回だけにまとめる。
   ⚠ 画面の値は戻さない（作業中に勝手に外れる方が混乱するため）。
     「まだ全員には反映されていない」ことだけを伝えて、やり直せるようにする。 */
let _saveWarnAt = 0;
function _warnSaveFailed(e) {
  console.error('[saveCar] failed', e);
  const now = Date.now();
  if (now - _saveWarnAt < 6000) return;
  _saveWarnAt = now;
  if (typeof showToast === 'function') {
    showToast('保存できていません。この端末には残っていますが、まだ全員には反映されていません（通信または権限を確認してください）', 'CF-0021');
  }
}

window.saveCarById = function (carId) {
  if (!window.dbCars || !carId) return;
  const car = (typeof cars !== 'undefined' && Array.isArray(cars))
    ? cars.find(x => x && x.id === carId)
    : null;
  if (!car) return;
  return window.dbCars.saveCar(car).catch(_warnSaveFailed);
};

// v1.8.0: 項目単位の保存ショートカット
window.saveCarField = function (carId, path, value) {
  if (!window.dbCars || !window.dbCars.saveCarField) return;
  return window.dbCars.saveCarField(carId, path, value).catch(_warnSaveFailed);
};

// v3.0.0 下ごしらえ：変えた所だけをまとめて保存するショートカット
//   使い方 window.saveCarPaths(carId, [{path:['col'],value:'delivery'},{path:['logs'],value:car.logs}])
// v3.0.0 下ごしらえ：在庫の車でも、締めた過去の車でも、変えた所だけを保存する
window.saveCarAnyPaths = function (carId, fromArchive, entries) {
  if (fromArchive) {
    return window.saveArchivedCarPaths ? window.saveArchivedCarPaths(carId, entries) : undefined;
  }
  return window.saveCarPaths ? window.saveCarPaths(carId, entries) : undefined;
};

window.saveCarPaths = function (carId, entries) {
  if (!window.dbCars || !window.dbCars.saveCarPaths) {
    // 万一この版が古い端末で読まれた時のための逃げ道
    return window.saveCarById ? window.saveCarById(carId) : undefined;
  }
  return window.dbCars.saveCarPaths(carId, entries).catch(_warnSaveFailed);
};
