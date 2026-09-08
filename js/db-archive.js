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

  // v3.0.0 下ごしらえ：締めた車の「実績」は、あとからの保存で書き換えない。
  //   月次で締めた時点の 金額・日付・列 が正。以降にこの車を開いて何かを触っても、
  //   ここは1文字も送らない（バックオフィスのチェックやメモは今までどおり保存される）。
  //   🔴 締める時だけ opts.initial = true で全部書く（archive.js の月次締め）。
  const LOCKED_KEYS = [
    'price', 'totalPrice', 'deliveryDate', 'contractDate', 'purchaseDate',
    'col', 'contract', 'num', 'priceTaxSnapshot', '_archivedAt', '_archivedYM',
  ];
  function isLockedKey(k) { return LOCKED_KEYS.indexOf(String(k)) >= 0; }

  // 🔴 v3.0.0 下ごしらえ：まるごと保存ではチェックの記録を送らない（在庫の車と同じ決めごと）
  const CHECK_KEYS = [
    'regenTasks', 'deliveryTasks', 'backofficeTasks', 'backofficeWorkflows',
    'taskMemos', 'taskVariants', 'equipment',
  ];
  function isCheckKey(k) { return CHECK_KEYS.indexOf(String(k)) >= 0; }

  // Firestore 保存形式に整形
  function _normalizeForSave(car, opts) {
    const initial = !!(opts && opts.initial);
    const out = {};
    for (const k in car) {
      const v = car[k];
      if (v === undefined) continue;
      if (!initial && isLockedKey(k)) continue;   // v3.0.0 実績は守る
      if (!initial && isCheckKey(k)) continue;    // v3.0.0 チェックは1点ずつの道でしか書かない
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
  async function saveArchivedCar(car, opts) {
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
      await col.doc(String(car.id)).set(_normalizeForSave(car, opts), { merge: true });
    } catch (err) {
      console.error('[db-archive] saveArchivedCar error:', err, car);
      if (typeof showToast === 'function') showToast('アーカイブ保存に失敗しました', 'CF-0012');
      throw err;
    }
  }

  // -----------------------------------------
  // v3.0.0 下ごしらえ：過去の車も「1点ずつ」保存できるようにする
  //   これまで過去の車は、何を触っても中身をまるごと送っていた（＝2人で開くと巻き戻る）。
  //   守る項目（金額・日付・列）は、ここからは絶対に書かない。
  // -----------------------------------------
  async function saveArchivedCarPaths(carId, entries) {
    if (!carId || !Array.isArray(entries) || entries.length === 0) {
      console.error('[db-archive] saveArchivedCarPaths: 引数不正', carId, entries);
      return;
    }
    const col = _archivedCol();
    if (!col) {
      console.warn('[db-archive] saveArchivedCarPaths: companyId 未確定');
      return;
    }
    try {
      const FieldPath = window.firebase.firestore.FieldPath;
      const FieldValue = window.firebase.firestore.FieldValue;
      const args = [];
      entries.forEach(e => {
        if (!e || !Array.isArray(e.path) || e.path.length === 0) return;
        if (isLockedKey(e.path[0])) {
          console.warn('[db-archive] 締めた車の実績は書き換えません:', e.path.join('.'));
          return;
        }
        args.push(new FieldPath(...e.path.map(String)));
        args.push((e.value === null || e.value === undefined) ? FieldValue.delete() : e.value);
      });
      if (!args.length) return;
      args.push(new FieldPath('updatedAt'), window.fb.serverTimestamp());
      const myUid = (window.fb.currentUser && window.fb.currentUser.uid) || null;
      if (myUid) args.push(new FieldPath('updatedBy'), myUid);
      await col.doc(String(carId)).update(...args);
    } catch (err) {
      console.error('[db-archive] saveArchivedCarPaths error:', err, carId, entries);
      if (typeof showToast === 'function') showToast('アーカイブ保存に失敗しました', 'CF-0012');
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
      if (typeof showToast === 'function') showToast('アーカイブ削除に失敗しました', 'CF-0013');
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
        batch.set(ref, _normalizeForSave(c, { initial: true }));   // v3.0.0 サンプル投入＝まっさらな状態を書く
      });
      await batch.commit();
    }
    console.log('[db-archive] seeded OK');
    return true;
  }

  // -----------------------------------------
  // 公開
  // -----------------------------------------
  /* ============================================================
     🔴 2026-09-08（v2.55.0）販売実績（archivedCars）を**リアルタイム購読**にする
     ------------------------------------------------------------
     ◎これまで：ログインした時に1回読むだけだった。
       ＝ **別の端末で月次締めをしても、こちらの画面はリロードするまで古いまま。**
       本番でそれが「締めたのに実績が増えない」「ダブりが消えたように見える」の正体になった。
     ◎これから：cars と同じように onSnapshot で購読する。
     ⚠ 車1台ずつではなく**コレクション全体**を購読する（実績は台数が増え続けるので、
        重くなってきたら「直近◯ヶ月だけ」に絞ること）。
     ============================================================ */
  /* ⚠ 2026-09-08（v2.56.0）cars と同じで、**落ちたら自動で張り直す**。
        張りっぱなしにして落ちたら、その画面は一生更新が来ない（リロードするまで）。 */
  function subscribeArchivedCars(onUpdate) {
    var un = null, relinkT = null, waitMs = 3000;

    function link() {
      const col = _archivedCol();
      if (!col) { console.warn('[db-archive] companyId 未確定のため購読スキップ'); return; }
      un = col.onSnapshot(
        function (snap) {
          waitMs = 3000;
          const list = [];
          snap.forEach(d => list.push(_normalizeForLoad(d)));
          try { onUpdate(list); } catch (e) { console.error('[db-archive] onUpdate error', e); }
        },
        function (err) {
          console.error('[db-archive] subscribe error:', err);
          relink();
        }
      );
    }
    function relink() {
      if (relinkT) return;
      relinkT = setTimeout(function () {
        relinkT = null;
        try { if (un) un(); } catch (e) {}
        un = null;
        console.log('[db-archive] 購読を張り直します（' + waitMs + 'ms 待った）');
        link();
      }, waitMs);
      waitMs = Math.min(waitMs * 2, 60000);
    }

    link();
    return function () {
      if (relinkT) { clearTimeout(relinkT); relinkT = null; }
      try { if (un) un(); } catch (e) {}
      un = null;
    };
  }

  window.dbArchive = {
    loadArchivedCars,
    subscribeArchivedCars,
    saveArchivedCar,
    saveArchivedCarPaths,
    isLockedKey,
    deleteArchivedCar,
    seedArchivedCarsIfEmpty,
  };

  console.log('[db-archive] ready');
})();

// ========================================
// グローバルショートカット：window.saveArchivedCarById(carId)
// archivedCars 配列から car を引いて save（fire-and-forget）
// ========================================
window.saveArchivedCarById = function (carId) {
  if (!window.dbArchive || !carId) return;
  if (typeof archivedCars === 'undefined' || !Array.isArray(archivedCars)) return;
  const car = archivedCars.find(x => x && x.id === carId);
  if (!car) return;
  window.dbArchive.saveArchivedCar(car).catch(e => console.error('[saveArchivedCarById] failed', carId, e));
};

// v3.0.0 下ごしらえ：過去の車も、変えた所だけをまとめて保存する
window.saveArchivedCarPaths = function (carId, entries) {
  if (!window.dbArchive || !window.dbArchive.saveArchivedCarPaths) {
    return window.saveArchivedCarById ? window.saveArchivedCarById(carId) : undefined;
  }
  return window.dbArchive.saveArchivedCarPaths(carId, entries)
    .catch(e => console.error('[saveArchivedCarPaths] failed', carId, e));
};
