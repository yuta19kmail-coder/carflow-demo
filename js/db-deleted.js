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

  /* 🔴 v3.16.2 ゴミ箱の中身（車まるごと）は別の文書「~t_{車id}」に置く。起動時に読む・購読するのは
     台帳の行だけ（id が「~」より前＝中身の文書を外す）＝消した台数が増えても全端末が重くならない。
     中身は戻す時・完全に消す時にだけ1件読む */
  const BODY_PREFIX = '~t_';
  function _ledgerQuery(col) {
    try {
      const FP = window.firebase && window.firebase.firestore && window.firebase.firestore.FieldPath;
      if (FP && FP.documentId && col.orderBy) return col.orderBy(FP.documentId()).endBefore('~');
    } catch (e) {}
    return col;
  }
  function _isBodyId(id) { return String(id || '').indexOf(BODY_PREFIX) === 0; }

  async function loadDeletedCars() {
    const col = _col();
    if (!col) {
      console.warn('[db-deleted] companyId 未確定');
      return [];
    }
    const snap = await _ledgerQuery(col).get();
    const list = [];
    snap.forEach(d => { if (!_isBodyId(d.id)) list.push(_normalizeForLoad(d)); });
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
    const unsub = _ledgerQuery(col).onSnapshot(
      function (snap) {
        const list = [];
        snap.forEach(d => { if (!_isBodyId(d.id)) list.push(_normalizeForLoad(d)); });
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

  /* ============================================================
     🗑 v3.16.0（棚卸し S-19）車の「ゴミ箱」
     ------------------------------------------------------------
     ◎前まで … 車の削除・「仮登録に戻す」は、価格・見積・フロー・チェックごと**その場で物理削除**。
       戻す道が無かった（6/13 の KM-0521 と同じ形が、売れる前の車には残っていた）。
     ◎いま … 消す前に、車の中身を**まるごと**この台帳（deletedCars/{車id}）の `trash` に写してから消す。
       管理番号リストの下の「ゴミ箱」から［元に戻す］で cars に作り直せる。
       ［完全に消す］はマスターだけ（中身・写真・見積PDF を消して、台帳の行だけ残す）。
     ◎台帳の行の種類（mode）
       'formal' … 正式に削除（管理番号リストに「削除済」で残る＝今まで通り）。mode が無い昔の行もこれ
       'cancel' … 取り消し（番号は再利用できる＝番号台帳には数えない）
       'revert' … 仮登録に戻した（番号は手放す＝番号台帳には数えない）
       restoredAt がある行 … 戻した＝どこにも数えない
     ⚠ 新しい入れ物は作らない（ルールの書き足しが要らない）。書ける人＝車を消せる人（canDeleteCars）
     ⚠ 番号台帳・分析は「formal で、戻していない行」だけを見る（isLedger）。
     ============================================================ */
  function isLedger(rec) {
    return !!rec && !rec.restoredAt && !_isBodyId(rec.id) && (!rec.mode || rec.mode === 'formal');
  }
  /* ゴミ箱に出す行＝戻していない・完全に消していない・中身がある（v3.16.2 は inTrash の印＋別の文書。v3.16.0 の形 trash も読む） */
  function isInTrash(rec) {
    if (!rec || rec.restoredAt || rec.purgedAt || _isBodyId(rec.id)) return false;
    return !!rec.inTrash || (!!rec.trash && typeof rec.trash === 'object');
  }
  function _clean(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return o; } }
  function _myName() {
    try {
      if (window.CFUser && window.fb) return window.CFUser.fullName(window.fb.currentMember, window.fb.currentUser) || '';
    } catch (e) {}
    return (typeof currentUser !== 'undefined' && currentUser) || '';
  }
  function _bytes(o) {
    const s = JSON.stringify(o || {});
    try { if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length; } catch (e) {}
    return s.length * 3;
  }
  /* 🔴 v3.16.2 写しを「必ず入る大きさ」にする（1文書 1MB の上限で消せなくなる道を塞ぐ）
     ① data:URL のまま持っている画像（古い車の写真など）は写しから外す＝Storage にある物は path/URL のまま残る
     ② それでも大きい時は、フローを新しい 300 行に
     ③ それでも大きい時は、車の基本の欄だけ（戻すと価格・日付・状態・お客様・メモは戻る。チェックは戻らない）
     どれをしたかは dropped に残し、戻した時のフローに書く */
  const MAX_BYTES = 900 * 1024;
  function _slim(full) {
    const dropped = [];
    const walk = (o, path) => {
      if (!o || typeof o !== 'object') return;
      Object.keys(o).forEach(k => {
        const v = o[k];
        if (typeof v === 'string' && v.indexOf('data:') === 0 && v.length > 2048) { o[k] = ''; dropped.push((path ? path + '.' : '') + k); }
        else if (v && typeof v === 'object') walk(v, (path ? path + '.' : '') + k);
      });
    };
    walk(full, '');
    if (dropped.length) dropped.unshift('画像（data:URL）');
    if (_bytes(full) > MAX_BYTES && Array.isArray(full.logs) && full.logs.length > 300) {
      full.logs = full.logs.slice(0, 300);
      dropped.push('古いフロー');
    }
    if (_bytes(full) > MAX_BYTES) {
      const keep = {};
      ['id', 'num', 'maker', 'model', 'grade', 'year', 'color', 'size', 'km', 'price', 'totalPrice', 'purchaseDate', 'contract',
       'contractDate', 'deliveryDate', 'customerName', 'memo', 'col', 'isOrder', 'exhibitedAt', 'priceTaxSnapshot', 'estimates']
        .forEach(k => { if (full[k] !== undefined) keep[k] = full[k]; });
      keep.logs = Array.isArray(full.logs) ? full.logs.slice(0, 50) : [];
      dropped.push('チェック・装備など（大きすぎたので基本の欄だけ）');
      return { car: keep, dropped: dropped };
    }
    return { car: full, dropped: dropped };
  }

  /* 車をゴミ箱に写す（消す前に呼ぶ）。サーバーの今の中身を読んで写す（手元の写しが古くても失わない）。
     ① 中身＝別の文書 deletedCars/~t_{車id}（起動時には読まない）
     ② 台帳の行＝deletedCars/{車id}（小さい・inTrash の印）
     通らなければ throw（呼ぶ側は車を消さない）。 */
  async function trashCar(car, mode, opts) {
    if (!car || !car.id) throw new Error('trashCar: car.id がない');
    const col = _col();
    if (!col) throw new Error('trashCar: companyId 未確定');
    let full = null;
    try {
      const carsCol = window.fb.db.collection('companies').doc(window.fb.currentCompanyId).collection('cars');
      const snap = await carsCol.doc(String(car.id)).get();
      if (snap && snap.exists) full = snap.data();
    } catch (e) { console.warn('[db-deleted] 車をサーバーから読めなかったので手元の中身を写します', e); }
    if (!full) full = car;
    full = _clean(full) || {};
    full.id = String(car.id);
    delete full.updatedAt;
    /* 消す直前に足した記録（「車両を削除」など）も、手元の写しから拾って入れる */
    if (Array.isArray(car.logs)) {
      const have = Array.isArray(full.logs) ? full.logs : [];
      const key = e => (e && (e.at || '') + '|' + (e.action || '') + '|' + (e.time || ''));
      const seen = {}; have.forEach(e => { seen[key(e)] = 1; });
      car.logs.forEach(e => { if (e && !seen[key(e)]) have.push(_clean(e)); });
      full.logs = (typeof window._cfSortLogs === 'function') ? window._cfSortLogs(have) : have;
    }
    const slim = _slim(full);
    const stamp = window.fb.serverTimestamp();
    const me = (window.fb.currentUser && window.fb.currentUser.uid) || null;
    /* ① 中身を先に（これが入らなければ台帳も書かない＝車も消さない） */
    await col.doc(BODY_PREFIX + String(car.id)).set({
      id: BODY_PREFIX + String(car.id), carId: String(car.id), kind: 'trashBody', mode: 'body',
      car: slim.car, dropped: slim.dropped, deletedAt: stamp, deletedBy: me,
    });
    /* ② 台帳の行（小さい）。前に戻した・消した行が同じ id で残っていても置き換える（restoredAt も消える） */
    const rec = {
      id: String(car.id),
      num: car.num || '',
      maker: car.maker || '',
      model: car.model || '',
      grade: car.grade || '',
      mode: mode || 'formal',
      inTrash: true,
      deletedAt: stamp,
      deletedBy: me,
      deletedByName: _myName(),
      fromCol: car.col || '',
    };
    if (slim.dropped.length) rec.dropped = slim.dropped;
    if (opts && opts.note) rec.note = String(opts.note);
    if (opts && opts.tentId) rec.tentId = String(opts.tentId);
    await col.doc(String(car.id)).set(rec);
  }

  /* 車を消せなかった時：写したゴミ箱の行を「戻した」扱いにして無かったことにする */
  async function untrashOnFail(carId) {
    const col = _col();
    if (!col || !carId) return;
    const FV = window.firebase.firestore.FieldValue;
    try {
      await col.doc(String(carId)).update({ restoredAt: window.fb.serverTimestamp(), inTrash: false, trash: FV.delete(), note: '削除できなかったので取り消し' });
    } catch (e) { console.error('[db-deleted] 取り消しの印を書けませんでした', carId, e); }
    try { await col.doc(BODY_PREFIX + String(carId)).update({ car: FV.delete(), cancelledAt: window.fb.serverTimestamp() }); } catch (e) {}
  }

  async function _readBody(col, carId) {
    const rec = (typeof deletedCarsAll !== 'undefined' ? deletedCarsAll : []).find(r => r && String(r.id) === String(carId));
    if (rec && rec.trash && typeof rec.trash === 'object') return { car: rec.trash, dropped: [], rec: rec };   /* v3.16.0 の形 */
    const snap = await col.doc(BODY_PREFIX + String(carId)).get();
    const b = snap && snap.exists ? (snap.data() || {}) : {};
    return { car: b.car || null, dropped: b.dropped || [], rec: rec };
  }

  /* ゴミ箱から戻す：cars に作り直してから、台帳の行に「戻した」を付ける
     opts.num … 番号がほかの車とぶつかる時に、振り直す新しい番号（呼ぶ側＝num-list.js が確かめて渡す） */
  async function restoreFromTrash(carId, opts) {
    const col = _col();
    if (!col || !carId) throw new Error('restoreFromTrash: 引数');
    const body = await _readBody(col, carId);
    if (!body.car) throw new Error('ゴミ箱に中身がありません');
    const car = _clean(body.car);
    car.id = String(carId);
    const oldNum = car.num || '';
    const reNum = !!(opts && opts.num && opts.num !== oldNum);
    if (reNum) car.num = opts.num;
    const now = new Date();
    const tm = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    let action = reNum ? `ゴミ箱から元に戻した（番号 ${oldNum || 'なし'} はほかの車が使っていたので ${car.num} に振り直し）` : 'ゴミ箱から元に戻した';
    if (body.dropped && body.dropped.length) action += `（写しに入れられなかった物：${body.dropped.join('・')}）`;
    const entry = {
      time: tm, at: now.getTime(),
      userUid: (window.fb.currentUser && window.fb.currentUser.uid) || null,
      user: (typeof currentUser !== 'undefined' && currentUser) || '—',
      carNum: car.num || '—', action: action, carId: car.id,
    };
    car.logs = [entry].concat(Array.isArray(car.logs) ? car.logs : []);
    /* 作り直す＝まっさらな形で1回だけ書く（チェックも含めて写した時のまま） */
    await window.dbCars.saveCar(car, { initial: true });
    const FV = window.firebase.firestore.FieldValue;
    await col.doc(String(carId)).update({
      restoredAt: window.fb.serverTimestamp(),
      restoredBy: (window.fb.currentUser && window.fb.currentUser.uid) || null,
      restoredByName: _myName(),
      inTrash: false,
      trash: FV.delete(),
    });
    try { await col.doc(BODY_PREFIX + String(carId)).update({ car: FV.delete(), restoredAt: window.fb.serverTimestamp() }); } catch (e) {}
    if (window.dbAudit) window.dbAudit.appendAuditLog(entry);
    /* 📝 v3.16.2「仮登録に戻した」車を戻したら、その時に作った仮登録を片づける（両方に出さない）。記録を残す */
    const rec = body.rec;
    if (rec && rec.mode === 'revert' && rec.tentId && window.dbTentative && window.dbTentative.deleteTentativeCar) {
      try {
        await window.dbTentative.deleteTentativeCar(rec.tentId);
        if (typeof tentativeCars !== 'undefined' && Array.isArray(tentativeCars)) {
          const k = tentativeCars.findIndex(t => t && String(t.id) === String(rec.tentId));
          if (k >= 0) tentativeCars.splice(k, 1);
        }
        if (typeof window.addAuditLog === 'function') window.addAuditLog(`仮登録を片づけた（${car.maker || ''} ${car.model || ''}＝ゴミ箱から ${car.num || ''} に戻したため）`, car.num || '—');
      } catch (e) { console.warn('[db-deleted] 仮登録を片づけられませんでした（仮登録の方が残ります）', e); }
    }
    return car;
  }

  /* ゴミ箱から完全に消す（マスターだけ）。中身・写真・見積PDF を消し、台帳の行だけ残す */
  async function purgeTrash(carId) {
    const col = _col();
    if (!col || !carId) return;
    let t = null;
    try { t = (await _readBody(col, carId)).car; } catch (e) {}
    const FV = window.firebase.firestore.FieldValue;
    await col.doc(String(carId)).update({
      inTrash: false,
      trash: FV.delete(),
      purgedAt: window.fb.serverTimestamp(),
      purgedBy: (window.fb.currentUser && window.fb.currentUser.uid) || null,
    });
    try { await col.doc(BODY_PREFIX + String(carId)).update({ car: FV.delete(), purgedAt: window.fb.serverTimestamp() }); } catch (e) {}
    /* ファイルは台帳を書けてから消す（失敗しても中身は残らないだけ＝黙って続ける） */
    try { if (window.dbStorage && window.dbStorage.deleteCarPhoto) window.dbStorage.deleteCarPhoto(String(carId)); } catch (e) {}
    const st = window.fb && window.fb.storage;
    if (st && t && Array.isArray(t.estimates)) {
      t.estimates.forEach(x => {
        if (!x || !x.path) return;
        try { st.ref(x.path).delete().catch(() => {}); } catch (e) {}
      });
    }
  }

  window.dbDeleted = {
    isLedger: isLedger,
    isInTrash: isInTrash,
    trashCar: trashCar,
    untrashOnFail: untrashOnFail,
    restoreFromTrash: restoreFromTrash,
    purgeTrash: purgeTrash,
    loadDeletedCars: loadDeletedCars,
    saveDeletedCar: saveDeletedCar,
    deleteDeletedCar: deleteDeletedCar,
    subscribeDeletedCars: subscribeDeletedCars,
  };
})();
