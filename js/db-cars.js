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

  /* 🔴 2026-09-08（v2.56.0）**サーバーから**読み直す。
     ⚠ ふつうの get は「端末の中の写し」から返ってくることがある
        （PitFlow で実測 0.001 秒で返った＝古いまま「読み直したつもり」になる）。
        つながりが戻った時の読み直しは、必ず source:'server' で取る。 */
  async function refreshCarsFromServer() {
    const col = _carsCol();
    if (!col) return;
    const snap = await col.get({ source: 'server' });
    const list = [];
    snap.forEach(d => list.push(_normalizeForLoad(d)));
    if (typeof cars !== 'undefined' && Array.isArray(cars)) {
      cars.length = 0;
      list.forEach(c => cars.push(c));
    }
    if (typeof renderAll === 'function') renderAll();
    if (typeof renderDashboard === 'function') renderDashboard();
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

  /* ============================================================
     🔴 2026-09-08（v2.56.0）リアルタイム購読の作り直し
     ------------------------------------------------------------
     🗣 ゆうた「リアルタイムはどう？俺の肌感で PitFlow とかより全然ないような気がする」
     ◎前はこうだった（＝肌感の正体）
       ① `includeMetadataChanges` を付けていなかった
          → snapshot は **中身が変わった時しか来ない**。
            つながりが「写しから → サーバーから」に戻った瞬間が**見えない**。
            画面の同期ランプも、誰かがデータを変えるまで動かない。
       ② 購読が落ちた時、**console に出してトーストを1回出すだけ**だった。
          → 張り直さないので、**その画面はリロードするまで一生更新が来ない**。
            しかも画面は普通に動いているので、**本人は気づけない**。
          🔴 PitFlow は 2026-08-28 の事故（古い画面が他人の作業を6件消した）を受けて
             v2.24.0 で「つながり監視 → 落ちたら張り直す → 戻ったら読み直す」を入れた。
             CarFlow には**それが無かった**。
       ③ 戻ってきた時に**読み直していなかった**
          → 切れている間に他の端末が変えたぶんが、抜けたままになる余地があった。
     ◎いまの作り（PitFlow と同じ考え方）
       ・`includeMetadataChanges: true` ＝ つながりの変化そのものを受け取る
       ・写しから返ってきたら、少し待ってから「同期待ち」に落とす（一瞬の揺れでは騒がない）
       ・サーバーから返るようになったら「同期」に戻し、**1回だけ読み直す**
       ・購読が落ちたら **秒数を伸ばしながら自動で張り直す**（3秒→6秒→…最大60秒）
     ⚠ 「張り直しています」を画面に出す。**黙って壊れているのが一番まずい。**
     ============================================================ */
  var _carsUn = null;          /* いまの購読 */
  var _carsRelinkT = null;     /* 張り直しの予約 */
  var _carsRelinkMs = 3000;    /* 次に張り直すまでの待ち（伸びていく） */
  var _carsWasCache = false;   /* 直前が「写しから」だったか */
  var _carsOffT = null;        /* 「同期待ち」に落とすまでの猶予 */
  var _CARS_OFF_WAIT = 6000;   /* 一瞬の揺れでは騒がない */

  function _carsClearTimers() {
    if (_carsRelinkT) { clearTimeout(_carsRelinkT); _carsRelinkT = null; }
    if (_carsOffT)    { clearTimeout(_carsOffT);    _carsOffT = null; }
  }

  function subscribeCars(onUpdate) {
    const col = _carsCol();
    if (!col) {
      console.warn('[db-cars] subscribeCars: companyId 未確定');
      return function () {};
    }

    function link() {
      const c = _carsCol();
      if (!c) { _scheduleRelink(onUpdate); return; }
      _carsUn = c.onSnapshot(
        { includeMetadataChanges: true },
        function (snap) {
          _carsRelinkMs = 3000;                       /* つながったので待ち時間を戻す */
          const fromCache = !!(snap.metadata && snap.metadata.fromCache);

          if (fromCache) {
            /* 端末の中の写しから返っている＝サーバーから届いていない。
               一瞬のことも多いので、少し待ってから画面に出す。 */
            if (!_carsOffT) {
              _carsOffT = setTimeout(function () {
                _carsOffT = null;
                _carsWasCache = true;
                if (typeof setSyncStatus === 'function') setSyncStatus('cache', '同期待ち');
              }, _CARS_OFF_WAIT);
            }
          } else {
            if (_carsOffT) { clearTimeout(_carsOffT); _carsOffT = null; }
            if (typeof setSyncStatus === 'function') setSyncStatus('online');
            if (_carsWasCache) {
              /* 🔴 戻ってきた＝切れている間のぶんを取りこぼしていないか、1回読み直す */
              _carsWasCache = false;
              console.log('[db-cars] つながりが戻ったのでサーバーから読み直します');
              try { refreshCarsFromServer(); } catch (e) { console.error('[db-cars] 読み直し失敗', e); }
            }
          }

          /* 中身が変わっていない「つながりの知らせだけ」の時は、画面を描き直さない */
          if (snap.metadata && snap.metadata.fromCache === _carsLastFromCache
              && snap.docChanges && snap.docChanges().length === 0) {
            _carsLastFromCache = fromCache;
            return;
          }
          _carsLastFromCache = fromCache;

          const list = [];
          snap.forEach(d => list.push(_normalizeForLoad(d)));
          const meta = {
            fromCache: fromCache,
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
          _scheduleRelink(onUpdate);
        }
      );
    }

    function _scheduleRelink(cb) {
      if (_carsRelinkT) return;
      if (typeof setSyncStatus === 'function') setSyncStatus('offline', '同期が切れました');
      if (typeof showToast === 'function') {
        showToast('同期が切れました。つなぎ直しています…', 'CF-0020');
      }
      _carsRelinkT = setTimeout(function () {
        _carsRelinkT = null;
        try { if (_carsUn) _carsUn(); } catch (e) {}
        _carsUn = null;
        _carsWasCache = true;              /* 張り直したら必ず1回読み直す */
        console.log('[db-cars] 購読を張り直します（' + _carsRelinkMs + 'ms 待った）');
        link();
      }, _carsRelinkMs);
      _carsRelinkMs = Math.min(_carsRelinkMs * 2, 60000);   /* 3→6→12→24→48→60秒 */
    }

    link();

    /* 端末がネットに戻った／タブが前面に戻った時も、一度確かめる */
    function _wake() {
      if (document.visibilityState === 'hidden') return;
      if (!_carsUn) { _carsRelinkMs = 3000; _scheduleRelink(onUpdate); return; }
      try { refreshCarsFromServer(); } catch (e) { console.error('[db-cars] 読み直し失敗', e); }
    }
    window.addEventListener('online', _wake);
    document.addEventListener('visibilitychange', _wake);

    return function () {
      _carsClearTimers();
      window.removeEventListener('online', _wake);
      document.removeEventListener('visibilitychange', _wake);
      try { if (_carsUn) _carsUn(); } catch (e) {}
      _carsUn = null;
    };
  }
  var _carsLastFromCache = null;

  window.dbCars = {
    loadCars: loadCars,
    saveCar: saveCar,
    saveCarField: saveCarField,
    saveCarPaths: saveCarPaths,
    deleteCar: deleteCar,
    seedSampleCarsIfEmpty: seedSampleCarsIfEmpty,
    refreshCars: refreshCars,
    refreshCarsFromServer: refreshCarsFromServer,
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
