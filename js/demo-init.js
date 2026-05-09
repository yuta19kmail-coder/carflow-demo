// ========================================
// demo-init.js
// デモ版の Firebase 初期化置き換え（本番 firebase-init.js の代替）
// ----------------------------------------
// window.fb と window.firebase を完全モックで埋める。
// 本番 auth.js もこれで動くようにし、
// onAuthStateChanged は「never fire」状態に。
// 実際のログインは demo-auth-mock.js が制御。
// ========================================

(function () {
  'use strict';

  // ===== Auth モック =====
  const mockAuth = {
    currentUser: null,
    onAuthStateChanged: function (cb) {
      // 何もしない（本物のFirebase認証は走らない）
      // unsubscribe 関数を返す
      return () => {};
    },
    signInWithPopup: function () {
      return Promise.reject(new Error('demo mode: use the start button'));
    },
    signOut: function () {
      return Promise.resolve();
    },
  };

  // ===== window.firebase グローバル（auth.js で `new firebase.auth.GoogleAuthProvider()` するので）
  window.firebase = window.firebase || {};
  window.firebase.auth = function () { return mockAuth; };
  window.firebase.auth.GoogleAuthProvider = function () { this.providerId = 'google.com'; };
  window.firebase.firestore = function () { return window.__demoFirestoreMock.db; };
  window.firebase.firestore.FieldValue = {
    serverTimestamp: () => new Date(),
    arrayUnion: (...items) => ({ __op: 'arrayUnion', items }),
    arrayRemove: (...items) => ({ __op: 'arrayRemove', items }),
    increment: (n) => ({ __op: 'increment', n }),
    delete: () => ({ __op: 'deleteField' }),
  };
  window.firebase.storage = function () { return { ref: window.__demoStorageMock.ref.bind(window.__demoStorageMock) }; };
  window.firebase.functions = function () {
    return {
      httpsCallable: function (name) {
        return async function (data) {
          console.log(`[demo] Cloud Function called: ${name}`, data);
          // LINE通知系はトーストで代替
          if (typeof window.demoShowLineToast === 'function' && data && data.message) {
            window.demoShowLineToast(data.message, { label: '（デモ）' + name });
          }
          return { data: { ok: true } };
        };
      },
    };
  };

  // ===== window.fb （本番 firebase-init.js が作る形）
  window.fb = {
    db: window.__demoFirestoreMock.db,
    storage: window.__demoStorageMock,
    auth: mockAuth,
    serverTimestamp: window.__demoFirestoreMock.serverTimestamp,
    currentUser: null,
    currentCompanyId: 'demo-company',
    currentStaff: null,
    currentMembership: null,
    arrayUnion: (...items) => ({ __op: 'arrayUnion', items }),
    arrayRemove: (...items) => ({ __op: 'arrayRemove', items }),
    increment: (n) => ({ __op: 'increment', n }),
    deleteField: () => ({ __op: 'deleteField' }),
  };

  console.log('[demo-init] mock window.fb / window.firebase ready (demo mode)');
})();
