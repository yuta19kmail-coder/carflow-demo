// ========================================
// demo-firestore-mock.js
// デモ版用：Firestore SDK の最低限の API を in-memory で再現
// ----------------------------------------
// 既存の db-*.js は何も変更せず、window.fb 経由で動く。
// メモリ保持のみ。リロードで消える（永続化なし）。
// ========================================

(function () {
  'use strict';

  // -----------------------------------
  // 内部ストア（パス -> {docId: data}）
  // -----------------------------------
  const _store = {};

  function _getCol(path) {
    if (!_store[path]) _store[path] = {};
    return _store[path];
  }

  function _genId() {
    return 'demo_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  }

  // -----------------------------------
  // ドキュメントスナップショット
  // -----------------------------------
  function _docSnap(id, data) {
    const exists = data !== undefined;
    return {
      id: id,
      exists: exists,
      data: () => (exists ? JSON.parse(JSON.stringify(data)) : undefined),
      get: (field) => (exists && data ? data[field] : undefined),
      ref: null, // 必要なら後で詰める
    };
  }

  // -----------------------------------
  // クエリスナップショット
  // -----------------------------------
  function _querySnap(docs) {
    return {
      empty: docs.length === 0,
      size: docs.length,
      docs: docs,
      forEach: (cb) => docs.forEach(cb),
    };
  }

  // -----------------------------------
  // doc 参照
  // -----------------------------------
  function _docRef(colPath, docId) {
    const ref = {
      id: docId,
      path: colPath + '/' + docId,
      parent: null,
      async get() {
        const col = _getCol(colPath);
        const data = col[docId];
        return _docSnap(docId, data);
      },
      async set(data, opts) {
        const col = _getCol(colPath);
        const merge = opts && opts.merge;
        if (merge && col[docId]) {
          col[docId] = Object.assign({}, col[docId], JSON.parse(JSON.stringify(data)));
        } else {
          col[docId] = JSON.parse(JSON.stringify(data));
        }
      },
      async update(data) {
        const col = _getCol(colPath);
        if (!col[docId]) col[docId] = {};
        col[docId] = Object.assign({}, col[docId], JSON.parse(JSON.stringify(data)));
      },
      async delete() {
        const col = _getCol(colPath);
        delete col[docId];
      },
      // サブコレクション（プロフィール等で使う）
      collection(subPath) {
        return _colRef(colPath + '/' + docId + '/' + subPath);
      },
      // リアルタイム購読（メモリなので「初回だけ」発火）
      onSnapshot(cb, errCb) {
        // 初回呼び出し
        try { cb(_docSnap(docId, _getCol(colPath)[docId])); } catch (e) { if (errCb) errCb(e); }
        // unsubscribe 関数
        return () => {};
      },
    };
    return ref;
  }

  // -----------------------------------
  // collection 参照
  // -----------------------------------
  function _colRef(path) {
    const queryConstraints = { where: [], orderBy: [], limit: null };

    function _filter(docs) {
      let res = docs.slice();
      // where 適用
      queryConstraints.where.forEach(([field, op, val]) => {
        res = res.filter((d) => {
          const v = d.data()[field];
          switch (op) {
            case '==': return v === val;
            case '!=': return v !== val;
            case '<': return v < val;
            case '<=': return v <= val;
            case '>': return v > val;
            case '>=': return v >= val;
            case 'in': return Array.isArray(val) && val.includes(v);
            case 'array-contains': return Array.isArray(v) && v.includes(val);
            default: return true;
          }
        });
      });
      // orderBy 適用
      queryConstraints.orderBy.forEach(([field, dir]) => {
        res.sort((a, b) => {
          const va = a.data()[field], vb = b.data()[field];
          if (va < vb) return dir === 'desc' ? 1 : -1;
          if (va > vb) return dir === 'desc' ? -1 : 1;
          return 0;
        });
      });
      // limit 適用
      if (queryConstraints.limit != null) {
        res = res.slice(0, queryConstraints.limit);
      }
      return res;
    }

    const ref = {
      path: path,
      doc(id) {
        return _docRef(path, id || _genId());
      },
      async add(data) {
        const id = _genId();
        await _docRef(path, id).set(data);
        return _docRef(path, id);
      },
      async get() {
        const col = _getCol(path);
        const docs = Object.keys(col).map((id) => _docSnap(id, col[id]));
        return _querySnap(_filter(docs));
      },
      where(field, op, val) {
        queryConstraints.where.push([field, op, val]);
        return ref;
      },
      orderBy(field, dir) {
        queryConstraints.orderBy.push([field, dir || 'asc']);
        return ref;
      },
      limit(n) {
        queryConstraints.limit = n;
        return ref;
      },
      onSnapshot(cb, errCb) {
        // 初回だけ発火、購読なし
        ref.get().then((snap) => {
          try { cb(snap); } catch (e) { if (errCb) errCb(e); }
        });
        return () => {};
      },
    };
    return ref;
  }

  // -----------------------------------
  // batch
  // -----------------------------------
  function _batch() {
    const ops = [];
    return {
      set(ref, data, opts) { ops.push({ type: 'set', ref, data, opts }); return this; },
      update(ref, data) { ops.push({ type: 'update', ref, data }); return this; },
      delete(ref) { ops.push({ type: 'delete', ref }); return this; },
      async commit() {
        for (const op of ops) {
          if (op.type === 'set') await op.ref.set(op.data, op.opts);
          else if (op.type === 'update') await op.ref.update(op.data);
          else if (op.type === 'delete') await op.ref.delete();
        }
      },
    };
  }

  // -----------------------------------
  // db オブジェクト
  // -----------------------------------
  const db = {
    collection(path) { return _colRef(path); },
    doc(path) {
      const idx = path.lastIndexOf('/');
      return _docRef(path.slice(0, idx), path.slice(idx + 1));
    },
    batch() { return _batch(); },
  };

  // -----------------------------------
  // serverTimestamp（即時 Date を返すだけ）
  // -----------------------------------
  function serverTimestamp() {
    return new Date();
  }

  // -----------------------------------
  // 公開（window.fb の中身をモックで埋める）
  // -----------------------------------
  window.__demoFirestoreStore = _store; // デバッグ用
  window.__demoFirestoreMock = {
    db: db,
    serverTimestamp: serverTimestamp,
  };

  console.log('[demo-firestore-mock] ready');
})();
