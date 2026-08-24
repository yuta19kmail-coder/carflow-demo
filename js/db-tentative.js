// ========================================
// db-tentative.js (v2.19.0)
// Firestore の tentativeCars コレクションに対する CRUD wrapper
// ----------------------------------------
// パス：companies/{companyId}/tentativeCars/{tId}
//
// 役割：
//   「話が出た段階」で仮登録しておく車両。管理番号は振らない。
//   実際に到着して「仕入れ」「その他」へ移すと、その時点で管理番号が振られ
//   通常の cars に昇格してここから削除される。
//   保存フィールド: id, maker, model, reason, memo, createdAt, createdBy
//   ※ 業務（タスク・カンバンの実列・ダッシュボード・実績・各日数カウント）には一切影響しない。
// ========================================
(function () {
  'use strict';

  function _col() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db
      .collection('companies').doc(window.fb.currentCompanyId)
      .collection('tentativeCars');
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

  async function loadTentativeCars() {
    const col = _col();
    if (!col) { console.warn('[db-tentative] companyId 未確定'); return []; }
    const snap = await col.get();
    const list = [];
    snap.forEach(d => list.push(_normalizeForLoad(d)));
    console.log('[db-tentative] loaded', list.length, 'tentative cars');
    return list;
  }

  // v2.24.0：CoreFlow共通標準。保存は「サーバー確認できた時だけ成功」＋失敗は3桁コード。
  //   呼び出し側（kanban）が成功表示／失敗トースト(CoreSave.toastError)を出す。
  async function saveTentativeCar(rec) {
    if (!rec || !rec.id) {
      throw (window.CoreSave ? window.CoreSave.error(101, '保存内容が不正です') : new Error('E101'));
    }
    const col = _col();
    if (!col) {
      throw (window.CoreSave ? window.CoreSave.error(102, 'アプリの準備中です') : new Error('E102'));
    }
    const ref = col.doc(String(rec.id));
    if (window.CoreSave) {
      return window.CoreSave.confirmSet(ref, _normalizeForSave(rec), { merge: true });
    }
    // フォールバック（共通部品未読込時＝従来動作）
    await ref.set(_normalizeForSave(rec), { merge: true });
    return true;
  }

  async function deleteTentativeCar(tId) {
    if (!tId) {
      throw (window.CoreSave ? window.CoreSave.error(101, '削除対象が不正です') : new Error('E101'));
    }
    const col = _col();
    if (!col) {
      throw (window.CoreSave ? window.CoreSave.error(102, 'アプリの準備中です') : new Error('E102'));
    }
    const ref = col.doc(String(tId));
    if (window.CoreSave) {
      return window.CoreSave.confirmDelete(ref);
    }
    await ref.delete();
    return true;
  }

  function subscribeTentativeCars(onUpdate) {
    const col = _col();
    if (!col) { console.warn('[db-tentative] subscribe: companyId 未確定'); return function () {}; }
    return col.onSnapshot(
      function (snap) {
        const list = [];
        snap.forEach(d => list.push(_normalizeForLoad(d)));
        try { if (typeof onUpdate === 'function') onUpdate(list); }
        catch (e) { console.error('[db-tentative] subscribe callback error:', e); }
      },
      function (err) { console.error('[db-tentative] subscribe error:', err); }
    );
  }

  window.dbTentative = {
    loadTentativeCars: loadTentativeCars,
    saveTentativeCar: saveTentativeCar,
    deleteTentativeCar: deleteTentativeCar,
    subscribeTentativeCars: subscribeTentativeCars,
  };
  console.log('[db-tentative] ready');
})();
