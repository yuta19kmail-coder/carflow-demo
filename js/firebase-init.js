// ========================================
// firebase-init.js (v1.5.0〜 / v2.5.13: デモモードガード追加)
// Firebase 初期化＋グローバル window.fb 公開
// ----------------------------------------
// 設定情報は資料/Firebase接続情報.md に保管
// projectId : carflow-9d500
// region    : asia-northeast1（東京）
// ========================================

(function () {
  // v2.5.13: デモモードガード（CRITICAL 安全装置）
  //   demo-init.js が window.__DEMO_MODE = true を立てている場合は
  //   本物の Firebase 初期化を絶対にしない。これがないと、
  //   index.html で誤ってこのスクリプトをロードしてしまった時に、
  //   demo-init.js のモック window.fb / window.firebase を上書きして
  //   本物のFirestoreに接続してしまい、デモ操作が本番データを汚染する。
  if (typeof window !== 'undefined' && window.__DEMO_MODE === true) {
    console.warn('[firebase-init] skipped: demo mode detected (window.__DEMO_MODE=true)');
    return;
  }

  // --- Firebase 設定 ---
  const firebaseConfig = {
    apiKey: "AIzaSyBmhI5SzkmPvZUiuTn_ttCZ4tUikKv_iHI",
    authDomain: "carflow.kobayashi-motors.com",  // v2.18.12: アプリと同一サブドメインに戻す（スマホのログイン無限ループ再発を修正）。v2.13.1で見た目統一のためcoreflowに変えたが、別サブドメインだとiOS Safariのリダイレクト戻り時にログイン情報を受け渡せず（ITP/ストレージ分離）ループする。アプリと同一ドメインなら/__/auth/handlerが同一オリジンになりファーストパーティで安全（v2.10.5と同じ対応）。※OAuthリダイレクトURI https://carflow.kobayashi-motors.com/__/auth/handler が登録済みであること
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
  // ローカルキャッシュ有効化（複数タブ間でも整合性を保つ）。
  // ⚠ ただし iOS Safari 等では端末内の保存領域（IndexedDB）が壊れる/追い出されることがあり、
  //    その端末では保存(set)がローカル書込で弾かれて E201「端末に保存できません」になる。
  //    一度 E201 を踏んだ端末は core-save.js が cf_no_persist=1 を立てる。そのフラグが立っていれば
  //    オフライン保存を使わず「ネット直書き（サーバー確認）」で動く＝端末の保存が壊れていても登録が通る。
  var _skipPersist = false;
  try { _skipPersist = window.localStorage.getItem('cf_no_persist') === '1'; } catch (e) {}
  if (_skipPersist) {
    console.warn('[firebase-init] オフライン保存は無効（cf_no_persist）。ネット直書きモードで動作します。');
  } else {
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
  }

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
