// ========================================
// demo-firestore-mock.js
// デモ版用：Firestore SDK の最低限の API を in-memory で再現
// ----------------------------------------
// 既存の db-*.js は何も変更せず、window.fb 経由で動く。
// メモリ保持のみ。リロードで消える（永続化なし）。
//
// 🔴 2026-08-24 作り直し（本体 v2.45 に追いつかせるため）
//   ① **onSnapshot を本物の購読にした。**
//      前は「呼んだ瞬間に1回だけ」発火して終わりだった。
//      本体は v2.34.0 以降、起動時に購読を張るものが増えている
//      （members-core.js の名簿、pit-embed.js の PitFlow カード…）。
//      種を入れるより先に購読が張られると **永久に空のまま** になる。
//      → 書き込みがあった入れ物の購読を、そのつど呼び直す形にした。
//   ② **snap.metadata を持たせた**（fromCache / hasPendingWrites）。
//      同期ランプ（coreflow-sync.js）と db-cars.js が見ている。
//   ③ **docChanges() を持たせた**（added / modified / removed）。
//   ④ **FieldValue の合図を効かせた**（deleteField / arrayUnion / arrayRemove / increment）。
//      前はそのまま `{__op:'deleteField'}` という値が保存されていた。
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

  const _clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  // -----------------------------------
  // 🔔 購読（onSnapshot）の置き場
  //   { colPath, fire } … 入れ物ごとに持つ。書き込みがあったら fire を呼び直す。
  // -----------------------------------
  const _subs = [];
  let _pending = null;
  function _touch(colPath) {
    /* 種入れのように連続で書く時に何度も描き直さないよう、ひと呼吸おいてまとめて流す */
    if (_pending) { _pending.add(colPath); return; }
    _pending = new Set([colPath]);
    Promise.resolve().then(() => {
      const paths = _pending; _pending = null;
      _subs.slice().forEach((s) => {
        if (!paths.has(s.colPath)) return;
        try { s.fire(); } catch (e) { console.warn('[demo-firestore-mock] 購読先でエラー', e); }
      });
    });
  }
  function _addSub(colPath, fire) {
    const s = { colPath: colPath, fire: fire };
    _subs.push(s);
    return function unsubscribe() {
      const i = _subs.indexOf(s);
      if (i >= 0) _subs.splice(i, 1);
    };
  }

  // -----------------------------------
  // FieldValue の合図を実際の値に直す
  // -----------------------------------
  function _applyOps(cur, patch) {
    const out = Object.assign({}, cur || {});
    Object.keys(patch || {}).forEach((k) => {
      const v = patch[k];
      if (v && typeof v === 'object' && v.__op) {
        if (v.__op === 'deleteField') { delete out[k]; return; }
        if (v.__op === 'increment')   { out[k] = (Number(out[k]) || 0) + Number(v.n || 0); return; }
        if (v.__op === 'arrayUnion') {
          const a = Array.isArray(out[k]) ? out[k].slice() : [];
          (v.items || []).forEach((x) => { if (a.indexOf(x) < 0) a.push(x); });
          out[k] = a; return;
        }
        if (v.__op === 'arrayRemove') {
          const a = Array.isArray(out[k]) ? out[k].slice() : [];
          out[k] = a.filter((x) => (v.items || []).indexOf(x) < 0); return;
        }
      }
      out[k] = _clone(v);
    });
    return out;
  }

  // -----------------------------------
  // メタ情報（本物と同じ形。デモは常に「サーバーと合っている」あつかい）
  // -----------------------------------
  const META = { fromCache: false, hasPendingWrites: false };

  // -----------------------------------
  // ドキュメントスナップショット
  // -----------------------------------
  function _docSnap(id, data) {
    const exists = data !== undefined;
    return {
      id: id,
      exists: exists,
      metadata: META,
      data: () => (exists ? _clone(data) : undefined),
      get: (field) => (exists && data ? data[field] : undefined),
      ref: null, // 必要なら後で詰める
    };
  }

  // -----------------------------------
  // クエリスナップショット
  //   changes … 前回との差（added / modified / removed）。渡されなければ全部 added。
  // -----------------------------------
  function _querySnap(docs, changes) {
    return {
      empty: docs.length === 0,
      size: docs.length,
      docs: docs,
      metadata: META,
      forEach: (cb) => docs.forEach(cb),
      docChanges: () => (changes || docs.map((d) => ({ type: 'added', doc: d }))),
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
        return _docSnap(docId, _getCol(colPath)[docId]);
      },
      async set(data, opts) {
        const col = _getCol(colPath);
        const merge = opts && opts.merge;
        col[docId] = (merge && col[docId]) ? _applyOps(col[docId], data) : _applyOps(null, data);
        _touch(colPath);
      },
      async update(data) {
        const col = _getCol(colPath);
        col[docId] = _applyOps(col[docId] || {}, data);
        _touch(colPath);
      },
      async delete() {
        delete _getCol(colPath)[docId];
        _touch(colPath);
      },
      // サブコレクション（プロフィール等で使う）
      collection(subPath) {
        return _colRef(colPath + '/' + docId + '/' + subPath);
      },
      // 🔔 本物の購読（書き込みがあったら呼び直す）
      onSnapshot(cb, errCb) {
        const fire = () => {
          try { cb(_docSnap(docId, _getCol(colPath)[docId])); }
          catch (e) { if (errCb) errCb(e); }
        };
        fire();
        return _addSub(colPath, fire);
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

    function _snapNow() {
      const col = _getCol(path);
      return _filter(Object.keys(col).map((id) => _docSnap(id, col[id])));
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
        return _querySnap(_snapNow());
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
      // 🔔 本物の購読（書き込みがあったら呼び直す＋前回との差を渡す）
      onSnapshot(cb, errCb) {
        let prev = {};   // id -> JSON
        const fire = () => {
          try {
            const docs = _snapNow();
            const now = {}, changes = [];
            docs.forEach((d) => {
              const js = JSON.stringify(d.data());
              now[d.id] = js;
              if (prev[d.id] === undefined) changes.push({ type: 'added', doc: d });
              else if (prev[d.id] !== js)   changes.push({ type: 'modified', doc: d });
            });
            Object.keys(prev).forEach((id) => {
              if (now[id] === undefined) changes.push({ type: 'removed', doc: _docSnap(id, undefined) });
            });
            prev = now;
            cb(_querySnap(docs, changes));
          } catch (e) { if (errCb) errCb(e); }
        };
        fire();
        return _addSub(path, fire);
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
    /* 本体はいま使っていないが、増えた時に落ちないように最低限だけ */
    async runTransaction(fn) {
      const t = {
        get: (r) => r.get(),
        set: (r, d, o) => { r.set(d, o); return t; },
        update: (r, d) => { r.update(d); return t; },
        delete: (r) => { r.delete(); return t; },
      };
      return fn(t);
    },
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
    _subs: _subs,                       // デバッグ用（いま張っている購読）
  };

  console.log('[demo-firestore-mock] ready（購読つき）');
})();
