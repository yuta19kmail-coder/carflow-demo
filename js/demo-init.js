// ========================================
// demo-init.js
// デモ版の Firebase 初期化置き換え
// ----------------------------------------
// 本番の firebase-init.js を完全に置き換える。
// window.fb を localStorage 不使用 in-memory モックで埋める。
// 既存の db-*.js / auth.js が「何も気づかず」動くようにする。
// ========================================

(function () {
  'use strict';

  // モックを window.fb として公開
  // 既存のすべての db-*.js が window.fb.db / .storage / .currentUser を見るので、
  // この変数の中身を本物のFirestore SDKと同じように見せる。
  window.fb = {
    db: window.__demoFirestoreMock.db,
    storage: window.__demoStorageMock,
    serverTimestamp: window.__demoFirestoreMock.serverTimestamp,
    currentUser: null,           // demo-auth-mock がログイン後にセット
    currentCompanyId: 'demo-company',
    auth: () => null,            // 必要なら mock auth に差し替え
    // arrayUnion / arrayRemove / FieldValue 系のスタブ
    arrayUnion: (...items) => ({ __op: 'arrayUnion', items }),
    arrayRemove: (...items) => ({ __op: 'arrayRemove', items }),
    increment: (n) => ({ __op: 'increment', n }),
    deleteField: () => ({ __op: 'deleteField' }),
  };

  console.log('[demo-init] window.fb prepared (demo mode)', {
    projectId: 'demo',
    sdkVersion: 'mock',
  });
})();
