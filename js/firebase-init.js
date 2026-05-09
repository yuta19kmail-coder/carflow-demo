// ========================================
// firebase-init.js (v1.5.0〜)
// Firebase 初期化＋グローバル window.fb 公開
// ----------------------------------------
// 設定情報は資料/Firebase接続情報.md に保管
// projectId : carflow-9d500
// region    : asia-northeast1（東京）
// ========================================

(function () {
  // --- Firebase 設定 ---
  const firebaseConfig = {
    apiKey: "AIzaSyBmhI5SzkmPvZUiuTn_ttCZ4tUikKv_iHI",
    authDomain: "carflow-9d500.firebaseapp.com",
    projectId: "carflow-9d500",
    storageBucket: "carflow-9d500.firebasestorage.app",
    messagingSenderId: "235121541987",
    appId: "1:235121541987:web:8f96dfadc23fe1de7f4956"
  };

  // --- 初期化（compat 版） ---
  if (typeof firebase === 'undefined') {
    console.error('[firebase-init] Firebase SDK が読み込まれていません');
    return;
  }
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  // --- 各サービスのインスタンス取得 ---
  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage();

  // --- Firestore 設定（オフライン対応） ---
  // ローカルキャッシュ有効化（複数タブ間でも整合性を保つ）
  db.enablePersistence({ synchronizeTabs: true })
    .catch((err) => {
      // 複数タブで同時に開いた時は片方が failed-precondition になる（無害）
      if (err.code === 'failed-precondition') {
        console.warn('[firebase-init] 別タブで永続化中（このタブはオフライン無効）');
      } else if (err.code === 'unimplemented') {
        console.warn('[firebase-init] このブラウザはオフラインキャッシュ非対応');
      } else {
        console.warn('[firebase-init] persistence error:', err);
      }
    });

  // --- グローバル公開 ---
  // window.fb.auth / db / storage で各サービスにアクセス
  // window.fb.config で設定を参照
  window.fb = {
    auth: auth,
    db: db,
    storage: storage,
    config: firebaseConfig,

    // ヘルパー：サーバータイムスタンプ
    serverTimestamp: () => firebase.firestore.FieldValue.serverTimestamp(),

    // ヘルパー：FieldValue へのショートカット
    FieldValue: firebase.firestore.FieldValue,

    // 状態（auth.js から書き込まれる）
    currentUser: null,           // Firebase Auth User
    currentCompanyId: null,      // 'kobayashi_motors'
    currentMembership: null,     // userMemberships の中身
    currentStaff: null,          // companies/{cid}/staff/{uid} の中身
  };

  console.log('[firebase-init] OK', {
    projectId: firebaseConfig.projectId,
    sdkVersion: firebase.SDK_VERSION || '(compat)',
  });
})();
