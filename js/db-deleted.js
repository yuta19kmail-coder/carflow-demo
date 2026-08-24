// ========================================
// db-deleted.js (v2.16.0)
// Firestore の deletedCars コレクションに対する CRUD wrapper
// ----------------------------------------
// パス：companies/{companyId}/deletedCars/{carId}
//
// 役割：
//   削除フローで「正式に削除（AA出品・売約不成立・廃車など）」を選んだ車両を、
//   管理番号リストで「削除済」として残すための最小限の台帳。
//   保存フィールド: id, num, maker, model, grade, deletedAt, deletedBy
//   写真・装備・タスク等の重いデータは持たない（番号管理が目的なので軽量）。
//
//   「取り消し（間違い・テスト入力）」を選んだ削除はこのコレクションには残さず、
//   cars コレクションから完全削除されるだけ＝番号は次の新規でそのまま再利用される。
//
// 提供関数（window.dbDeleted 名前空間）：
//   loadDeletedCars()           : 全 deletedCar を取得し配列で返す
//   saveDeletedCar(car)         : 1件保存（merge:true）
//   deleteDeletedCar(carId)     : 1件削除（基本は使わない・台帳の改ざん用）
//   subscribeDeletedCars(cb)    : onSnapshot 購読を開始。返り値は unsubscribe()
// ========================================
(function () {
  'use strict';

  function _col() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db
      .collection('companies').doc(window.fb.currentCompanyId)
      .collection('deletedCars');
  }

  function _normalizeForSave(rec) {
    const out = {};
    for (const k in rec) {
      const v = rec[k];
      if (v === undefined) continue;
      out[k] = v;
    }
    if (!out.deletedAt) out.deletedAt = window.fb.serverTimestamp();
    if (window.fb.currentUser && window.fb.currentUser.uid) {
      out.deletedBy = out.deletedBy || window.fb.currentUser.uid;
    }
    return out;
  }

  function _normalizeForLoad(docSnap) {
    const data = docSnap.data() || {};
    data.id = data.id || docSnap.id;
    return data;
  }

  async function loadDeletedCars() {
    const col = _col();
    if (!col) {
      console.warn('[db-deleted] companyId 未確定');
      return [];
    }
    const snap = await col.get();
    const list = [];
    snap.forEach(d => list.push(_normalizeForLoad(d)));
    console.log('[db-deleted] loaded', list.length, 'deleted records');
    return list;
  }

  async function saveDeletedCar(rec) {
    if (!rec || !rec.id) {
      console.error('[db-deleted] saveDeletedCar: rec.id がない', rec);
      return;
    }
    const col = _col();
    if (!col) {
      console.warn('[db-deleted] saveDeletedCar: companyId 未確定');
      return;
    }
    try {
      await col.doc(String(rec.id)).set(_normalizeForSave(rec), { merge: true });
    } catch (err) {
      console.error('[db-deleted] saveDeletedCar error:', err, rec);
      if (typeof showToast === 'function') showToast('削除記録の保存に失敗しました', 'CF-0022');
      throw err;
    }
  }

  async function deleteDeletedCar(carId) {
    if (!carId) return;
    const col = _col();
    if (!col) return;
    try {
      await col.doc(String(carId)).delete();
    } catch (err) {
      console.error('[db-deleted] deleteDeletedCar error:', err);
      throw err;
    }
  }

  function subscribeDeletedCars(onUpdate) {
    const col = _col();
    if (!col) {
      console.warn('[db-deleted] subscribeDeletedCars: companyId 未確定');
      return function () {};
    }
    const unsub = col.onSnapshot(
      function (snap) {
        const list = [];
        snap.forEach(d => list.push(_normalizeForLoad(d)));
        try {
          if (typeof onUpdate === 'function') onUpdate(list);
        } catch (e) {
          console.error('[db-deleted] subscribeDeletedCars callback error:', e);
        }
      },
      function (err) {
        console.error('[db-deleted] subscribeDeletedCars error:', err);
      }
    );
    return unsub;
  }

  window.dbDeleted = {
    loadDeletedCars: loadDeletedCars,
    saveDeletedCar: saveDeletedCar,
    deleteDeletedCar: deleteDeletedCar,
    subscribeDeletedCars: subscribeDeletedCars,
  };
})();
