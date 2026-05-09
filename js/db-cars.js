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

  function _normalizeForSave(car) {
    const out = {};
    for (const k in car) {
      const v = car[k];
      if (v === undefined) continue;
      out[k] = v;
    }
    if (!out.updatedAt) out.updatedAt = window.fb.serverTimestamp();
    return out;
  }

  function _normalizeForLoad(docSnap) {
    const data = docSnap.data() || {};
    data.id = data.id || docSnap.id;
    return data;
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

  async function saveCar(car) {
    if (!car || !car.id) {
      console.error('[db-cars] saveCar: car.id がない', car);
      return;
    }
    const col = _carsCol();
    if (!col) {
      console.warn('[db-cars] saveCar: companyId 未確定');
      return;
    }
    try {
      await col.doc(String(car.id)).set(_normalizeForSave(car), { merge: true });
    } catch (err) {
      console.error('[db-cars] saveCar error:', err, car);
      if (typeof showToast === 'function') showToast('保存に失敗しました');
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
    try {
      const FieldPath = window.firebase.firestore.FieldPath;
      const FieldValue = window.firebase.firestore.FieldValue;
      const fp = new FieldPath(...path.map(String));
      const v = (value === null || value === undefined)
        ? FieldValue.delete()
        : value;
      await col.doc(String(carId)).update(
        fp, v,
        new FieldPath('updatedAt'), window.fb.serverTimestamp()
      );
    } catch (err) {
      console.error('[db-cars] saveCarField error:', err, carId, path);
      if (typeof showToast === 'function') showToast('保存に失敗しました');
      throw err;
    }
  }

  async function deleteCar(carId) {
    if (!carId) return;
    const col = _carsCol();
    if (!col) return;
    try {
      await col.doc(String(carId)).delete();
    } catch (err) {
      console.error('[db-cars] deleteCar error:', err);
      if (typeof showToast === 'function') showToast('削除に失敗しました');
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
      batch.set(ref, _normalizeForSave(c));
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
        if (typeof showToast === 'function') showToast('車両データの同期でエラー');
      }
    );
    return unsub;
  }

  window.dbCars = {
    loadCars: loadCars,
    saveCar: saveCar,
    saveCarField: saveCarField,
    deleteCar: deleteCar,
    seedSampleCarsIfEmpty: seedSampleCarsIfEmpty,
    refreshCars: refreshCars,
    subscribeCars: subscribeCars,
  };

  console.log('[db-cars] ready');
})();

// ========================================
// グローバルショートカット
// ========================================
window.saveCarById = function (carId) {
  if (!window.dbCars || !carId) return;
  const car = (typeof cars !== 'undefined' && Array.isArray(cars))
    ? cars.find(x => x && x.id === carId)
    : null;
  if (!car) return;
  window.dbCars.saveCar(car).catch(e => console.error('[saveCarById] failed for', carId, e));
};

// v1.8.0: 項目単位の保存ショートカット
window.saveCarField = function (carId, path, value) {
  if (!window.dbCars || !window.dbCars.saveCarField) return;
  return window.dbCars.saveCarField(carId, path, value)
    .catch(e => console.error('[saveCarField] failed', carId, path, e));
};
