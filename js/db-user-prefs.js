// ========================================
// db-user-prefs.js (v2.18.0〜) ── ユーザー個別の永続設定
// CoreFlow一本化に伴い、お知らせ既読など「自分だけの設定」を
// 旧 staff/{uid} ドキュメントから分離して保存。
//
// パス：companies/{companyId}/userPrefs/{uid}
// スキーマ：{
//   readAnnouncements?: [id, ...],   // CarFlow お知らせの既読リスト
//   updatedAt: Timestamp
// }
// 各ユーザーは自分の uid 一致のドキュメントだけ read/write 可（ルール側で制御）。
// ========================================
(function () {
  'use strict';

  function _col() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db
      .collection('companies').doc(window.fb.currentCompanyId)
      .collection('userPrefs');
  }
  function _uid() {
    return window.fb && window.fb.currentUser && window.fb.currentUser.uid;
  }

  // 自分の設定を読み込む（存在しなければ {}）
  async function loadMyPrefs() {
    const c = _col(); const uid = _uid();
    if (!c || !uid) return {};
    try {
      const snap = await c.doc(uid).get();
      return snap.exists ? (snap.data() || {}) : {};
    } catch (e) {
      console.error('[db-userPrefs] loadMyPrefs error:', e);
      return {};
    }
  }

  // お知らせ既読リストを保存（merge）
  async function saveMyAnnounceRead(arr) {
    const c = _col(); const uid = _uid();
    if (!c || !uid) return;
    const list = Array.isArray(arr) ? arr.slice() : [];
    try {
      await c.doc(uid).set({
        readAnnouncements: list,
        updatedAt: window.fb.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error('[db-userPrefs] saveMyAnnounceRead error:', e);
    }
  }

  window.dbUserPrefs = { loadMyPrefs, saveMyAnnounceRead };
  console.log('[db-userPrefs] ready');
})();
