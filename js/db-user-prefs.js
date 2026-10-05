// ========================================
// db-user-prefs.js (v2.18.0〜) ── ユーザー個別の永続設定
// CoreFlow一本化に伴い、お知らせ既読など「自分だけの設定」を
// 旧 staff/{uid} ドキュメントから分離して保存。
//
// パス：companies/{companyId}/userPrefs/{uid}
// スキーマ：{
//   carflowReadAnnouncements?: [id, ...], // CarFlow お知らせの既読リスト（v3.7.1〜・足すだけ＝arrayUnion）
//   readAnnouncements?: [id, ...],   // 🔴 古い欄（MHS と共用で上書きし合っていた）。読むだけ・書き換えない・消さない
//   ※ 既読は端末ごとではない（どの端末でも同じ）
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

  // v3.7.1：CarFlow 専用の欄。古い欄 readAnnouncements は読むだけ（今までの既読を失わない）
  const READ_KEY = 'carflowReadAnnouncements';
  const READ_OLD = 'readAnnouncements';
  // 新しい欄と古い欄を合わせた既読の一覧（古い欄には MHS の id も混ざるが、CarFlow は自分の id しか見ないので害はない）
  function readAnnounceFrom(prefs) {
    const out = [];
    [prefs && prefs[READ_KEY], prefs && prefs[READ_OLD]].forEach(l => {
      (Array.isArray(l) ? l : []).forEach(x => { if (out.indexOf(x) === -1) out.push(x); });
    });
    return out;
  }

  // お知らせ既読を「足す」（merge＋arrayUnion）。
  // 🔴 丸ごと上書きしない＝MHS や同じ人の別の端末の既読を消さない。古い欄には書かない
  async function saveMyAnnounceRead(ids) {
    const c = _col(); const uid = _uid();
    if (!c || !uid) return;
    const add = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (!add.length) return;
    const FV = window.fb.FieldValue;
    try {
      await c.doc(uid).set({
        [READ_KEY]: (FV && FV.arrayUnion) ? FV.arrayUnion.apply(null, add) : readAnnounceFrom({ [READ_KEY]: add, [READ_OLD]: (window.fb.currentStaff && window.fb.currentStaff.readAnnouncements) }),
        updatedAt: window.fb.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error('[db-userPrefs] saveMyAnnounceRead error:', e);
    }
  }

  window.dbUserPrefs = { loadMyPrefs, saveMyAnnounceRead, readAnnounceFrom };
  console.log('[db-userPrefs] ready');
})();
