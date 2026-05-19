// ========================================
// firebase-init.js (デモ版 no-op スタブ)
// ----------------------------------------
// このファイルはデモ版用の「絶対に何もしない」空ファイルです。
// 本来の Firebase 初期化は demo-init.js / demo-firestore-mock.js が代替します。
//
// なぜスタブにするか：
//   index.html で誤ってこのファイルを <script> ロードしてしまっても、
//   本物の Firebase 初期化が走らないように物理的にコードを空にしておく
//   ことで、デモ操作が本物の Firestore を汚染する事故を防ぐ。
//
// 3層の防御の最後の壁：
//   1) index.html で firebase-init.js をロードしない（コメントアウト）
//   2) 本チャン firebase-init.js 冒頭の window.__DEMO_MODE ガード（多重防御）
//   3) このスタブファイル（最終防衛）
//
// 次回 main から js/ を bulk cp して同期する時は、このスタブを上書きしないよう注意。
// CHANGELOG.md の「デモ版固有のファイル」リストにも追加した。
// ========================================

if (typeof console !== 'undefined') {
  console.warn('[firebase-init] demo stub: no-op (本物のFirebase初期化はスキップ)');
}
