// ========================================
// db-archive.js (v1.5.3〜)
// Firestore の archivedCars コレクションに対する CRUD wrapper
// ----------------------------------------
// パス：companies/{companyId}/archivedCars/{carId}
//
// 月次集計締めで cars → archivedCars に移動した車両を保存する。
// 過去年度の販売実績データはここに蓄積されていく。
//
// 提供関数（window.dbArchive 名前空間）：
//   loadArchivedCars()           : 自社の全 archivedCar を取得し配列で返す
//   saveArchivedCar(car)         : 単体 set（merge:true）
//   deleteArchivedCar(carId)     : 1件削除
//   seedArchivedCarsIfEmpty()    : Firestore に未存在なら makeArchivedSamples() で初期投入
//
// 各 mutation 後のショートカット：
//   window.saveArchivedCarById(carId) : archivedCars 配列から car を引いて save
// ========================================

(function () {
  'use strict';

  function _archivedCol() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db
      .collection('companies').doc(window.fb.currentCompanyId)
      .collection('archivedCars');
  }

  // Firestore 保存形式に整形
  function _normalizeForSave(car) {
    const out = {};
    for (const k in car) {
      const v = car[k];
      if (v === undefined) continue;
      out[k] = v;
    }
    if (!out.archivedAt) out.archivedAt = window.fb.serverTimestamp();
    if (!out.updatedAt) out.updatedAt = window.fb.serverTimestamp();
    return out;
  }

  function _normalizeForLoad(docSnap) {
    const data = docSnap.data() || {};
    data.id = data.id || docSnap.id;
    return data;
  }

  // -----------------------------------------
  // 全件読み込み
  // -----------------------------------------
  async function loadArchivedCars() {
    const col = _archivedCol();
    if (!col) {
      console.warn('[db-archive] companyId 未確定のため読み込みスキップ');
      return [];
    }
    const snap = await col.get();
    const list = [];
    snap.forEach(d => list.push(_normalizeForLoad(d)));
    console.log('[db-archive] loaded', list.length, 'archived cars');
    return list;
  }

  // -----------------------------------------
  // 1件保存（merge:true）
  // -----------------------------------------
  async function saveArchivedCar(car) {
    if (!car || !car.id) {
      console.error('[db-archive] saveArchivedCar: car.id がない', car);
      return;
    }
    const col = _archivedCol();
    if (!col) {
      console.warn('[db-archive] saveArchivedCar: companyId 未確定');
      return;
    }
    try {
      await col.doc(String(car.id)).set(_normalizeForSave(car), { merge: true });
    } catch (err) {
      console.error('[db-archive] saveArchivedCar error:', err, car);
      if (typeof showToast === 'function') showToast('アーカイブ保存に失敗しました');
      throw err;
    }
  }

  // -----------------------------------------
  // 削除
  // -----------------------------------------
  async function deleteArchivedCar(carId) {
    if (!carId) return;
    const col = _archivedCol();
    if (!col) return;
    try {
      await col.doc(String(carId)).delete();
    } catch (err) {
      console.error('[db-archive] deleteArchivedCar error:', err);
      if (typeof showToast === 'function') showToast('アーカイブ削除に失敗しました');
      throw err;
    }
  }

  // -----------------------------------------
  // 初期投入：Firestore が空なら makeArchivedSamples() を投入
  // 過去12ヶ月分のサンプル（120台前後）。500件以下なので1バッチでOK。
  // -----------------------------------------
  async function seedArchivedCarsIfEmpty() {
    const col = _archivedCol();
    if (!col) return false;
    // v1.8.37: settings/main の _seedSampleDone フラグで再シード防止
    //   工場出荷リセット後にリロードしても、サンプルが復活しないようにする
    try {
      const sref = window.fb.db
        .collection('companies').doc(window.fb.currentCompanyId)
        .collection('settings').doc('main');
      const ssnap = await sref.get();
      if (ssnap.exists && ssnap.data()._seedSampleDone) {
        console.log('[db-archive] _seedSampleDone=true → 初期投入スキップ');
        return false;
      }
    } catch (e) {
      console.warn('[db-archive] _seedSampleDone チェック失敗（処理は継続）:', e);
    }
    const probe = await col.limit(1).get();
    if (!probe.empty) return false;

    if (typeof makeArchivedSamples !== 'function') {
      console.warn('[db-archive] makeArchivedSamples が未定義 → 初期投入スキップ');
      return false;
    }
    const sample = makeArchivedSamples();
    console.log('[db-archive] seeding', sample.length, 'archived cars...');

    // 念のためバッチ500件超対策（Firestore batch は500件まで）
    const CHUNK = 450;
    for (let i = 0; i < sample.length; i += CHUNK) {
      const slice = sample.slice(i, i + CHUNK);
      const batch = window.fb.db.batch();
      slice.forEach(c => {
        const ref = col.doc(String(c.id));
        batch.set(ref, _normalizeForSave(c));
      });
      await batch.commit();
    }
    console.log('[db-archive] seeded OK');
    return true;
  }

  // -----------------------------------------
  // 公開
  // -----------------------------------------
  window.dbArchive = {
    loadArchivedCars,
    saveArchivedCar,
    deleteArchivedCar,
    s