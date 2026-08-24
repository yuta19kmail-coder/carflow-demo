// ========================================
// db-manual.js (v2.17.0)
// Firestore の manualNumbers コレクションに対する CRUD wrapper
// ----------------------------------------
// パス：companies/{companyId}/manualNumbers/{recId}
//
// 役割：
//   管理番号リストで「番号は使ったけど実車データはない」を手入力で登録するための台帳。
//   業務（タスク・カード・カンバン等）には一切影響せず、管理番号リストにのみ表示される。
//   保存フィールド: id, num, model, grade, note, createdAt, createdBy
// ========================================
(function () {
  'use strict';

  function _col() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db
      .collection('companies').doc(window.fb.currentCompanyId)
      .collection('manualNumbers');
  }

  function _normalizeForSave(rec) {
    const out = {};
    for (const k in rec) {
      const v = rec[k];
      if (v === undefined) continue;
      out[k] = v;
    }
    if (!out.createdAt) out.createdAt = window.fb.serverTimestamp();
    if (window.fb.currentUser && window.fb.currentUser.uid) {
      out.createdBy = out.createdBy || window.fb.currentUser.uid;
    }
    return out;
  }

  function _normalizeForLoad(docSnap) {
    const data = docSnap.data() || {};
    data.id = data.id || docSnap.id;
    return data;
  }

  async function loadManualNumbers() {
    const col = _col();
    if (!col) {
      console.warn('[db-manual] companyId 未確定');
      return [];
    }
    const snap = await col.get();
    const list = [];
    snap.forEach(d => list.push(_normalizeForLoad(d)));
    console.log('[db-manual] loaded', list.length, 'manual records');
    return list;
  }

  async function saveManualNumber(rec) {
    if (!rec || !rec.id) {
      console.error('[db-manual] saveManualNumber: rec.id がない', rec);
      return;
    }
    const col = _col();
    if (!col) {
      console.warn('[db-manual] saveManualNumber: companyId 未確定');
      return;
    }
    try {
      await col.doc(String(rec.id)).set(_normalizeForSave(rec), { merge: true });
    } catch (err) {
      console.error('[db-manual] saveManualNumber error:', err, rec);
      if (typeof showToast === 'function') showToast('手入力の保存に失敗しました', 'CF-0023');
      throw err;
    }
  }

  async function deleteManualNumber(recId) {
    if (!recId) return;
    const col = _col();
    if (!col) return;
    try {
      await col.doc(String(recId)).delete();
    } catch (err) {
      console.error('[db-manual] deleteManualNumber error:', err);
      if (typeof showToast === 'function') showToast('手入力の削除に失敗しました', 'CF-0024');
      throw err;
    }
  }

  function subscribeManualNumbers(onUpdate) {
    const col = _col();
    if (!col) {
      console.warn('[db-manual] subscribeManualNumbers: companyId 未確定');
      return function () {};
    }
    const unsub = col.onSnapshot(
      function (snap) {
        const list = [];
        snap.forEach(d => list.push(_normalizeForLoad(d)));
        try {
          if (typeof onUpdate === 'function') onUpdate(list);
        } catch (e) {
          console.error('[db-manual] subscribeManualNumbers callback error:', e);
        }
      },
      function (err) {
        console.error('[db-manual] subscribeManualNumbers error:', err);
      }
    );
    return unsub;
  }

  window.dbManual = {
    loadManualNumbers: loadManualNumbers,
    saveManualNumber: saveManualNumber,
    deleteManualNumber: deleteManualNumber,
    subscribeManualNumbers: subscribeManualNumbers,
  };
})();
