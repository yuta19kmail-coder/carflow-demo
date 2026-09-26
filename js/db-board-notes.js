// ========================================
// db-board-notes.js (v1.7.0〜 / v1.8.0 リアルタイム同期)
// Firestore の boardNotes コレクション CRUD wrapper
// ----------------------------------------
// パス：companies/{companyId}/boardNotes/{noteId}
//
// 提供 API（window.dbBoardNotes 名前空間）：
//   loadBoardNotes()                : 全件取得（order asc）
//   saveBoardNote(note)             : 1件保存（merge）
//   deleteBoardNote(noteId)         : 🔴 2026-09-26 何もしない（付箋に「消去」は無い＝アーカイブ。消すのはサーバーだけ）
//   archiveOldDoneNotes()           : 🔴 v2.60.0 何もしない（済んだ付箋は消さない・部品が3日で隠す）
//   reorderBoardNotes(idList)       : 渡された ID 順に order を 0..N-1 に再付番
//   subscribeBoardNotes(onUpdate)   : v1.8.0 onSnapshot 購読
//
// ショートカット:
//   window.saveBoardNoteById(id)
// ========================================

(function () {
  'use strict';

  function _col() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db
      .collection('companies').doc(window.fb.currentCompanyId)
      .collection('boardNotes');
  }

  function _clone(o) {
    if (o == null) return o;
    try { return JSON.parse(JSON.stringify(o)); } catch (e) { return o; }
  }

  function _normalizeForSave(note) {
    const out = _clone(note) || {};
    if (note && note.id) out.id = note.id;
    out.updatedAt = window.fb.serverTimestamp();
    if (window.fb.currentUser && window.fb.currentUser.uid) {
      out.updatedBy = window.fb.currentUser.uid;
    }
    if (!out.createdAt) out.createdAt = window.fb.serverTimestamp();
    return out;
  }

  function _normalizeForLoad(snap) {
    const data = snap.data() || {};
    data.id = data.id || snap.id;
    return data;
  }

  async function loadBoardNotes() {
    const col = _col();
    if (!col) {
      console.warn('[db-board-notes] companyId 未確定');
      return [];
    }
    try {
      const snap = await col.orderBy('order', 'asc').get();
      const list = [];
      snap.forEach(d => list.push(_normalizeForLoad(d)));
      console.log('[db-board-notes] loaded', list.length, 'notes');
      return list;
    } catch (err) {
      try {
        const snap = await col.get();
        const list = [];
        snap.forEach(d => list.push(_normalizeForLoad(d)));
        list.sort((a, b) => (a.order || 0) - (b.order || 0));
        console.log('[db-board-notes] loaded (fallback)', list.length, 'notes');
        return list;
      } catch (e2) {
        console.error('[db-board-notes] loadBoardNotes error:', e2);
        throw e2;
      }
    }
  }

  async function saveBoardNote(note) {
    if (!note || !note.id) {
      console.error('[db-board-notes] saveBoardNote: note.id がない', note);
      return;
    }
    const col = _col();
    if (!col) return;
    try {
      await col.doc(String(note.id)).set(_normalizeForSave(note), { merge: true });
    } catch (err) {
      console.error('[db-board-notes] saveBoardNote error:', err, note.id);
      if (typeof showToast === 'function') showToast('付箋の保存に失敗しました', 'CF-0015');
      throw err;
    }
  }

  /* 🔴 2026-09-26（ゆうた確定）**付箋に「消去」は無い。**全部アーカイブ（共通部品の patchArchive を save で書く）。
     済から3か月で添付・1年で本文を消すのはサーバー（_サーバー\functions\note-retention.js）だけ。
     ⚠ 呼び口だけ残す＝古いキャッシュの画面や、どこかに残った呼び出しから呼ばれても何も消さない。
     ⚠ ルール（firestore.rules）でも付箋の delete は管理者だけ（バックアップの復元・全消去のため） */
  async function deleteBoardNote(noteId) {
    console.warn('[db-board-notes] deleteBoardNote は使いません（付箋は消さずにアーカイブ）', noteId);
  }

  async function reorderBoardNotes(idList) {
    if (!Array.isArray(idList) || idList.length === 0) return;
    const col = _col();
    if (!col) return;
    try {
      const batch = window.fb.db.batch();
      idList.forEach((id, i) => {
        if (!id) return;
        batch.update(col.doc(String(id)), {
          order: i,
          updatedAt: window.fb.serverTimestamp(),
        });
      });
      await batch.commit();
    } catch (err) {
      console.error('[db-board-notes] reorderBoardNotes error:', err);
      if (typeof showToast === 'function') showToast('並び順の保存に失敗しました', 'CF-0017');
      throw err;
    }
  }

  /* 🔴 v2.60.0（ゆうた指定 2026-09-13）**済んだ付箋はもう消さない。**
     済から3日たったら盤面から隠すだけ（共通部品 coreflow-note-board.js）。データは残る・「済んだ付箋」から戻せる。
     ⚠ 前はここで本当に削除していた（ただし保存の写しで doneAt が壊れていて、実は一度も消えていなかった）。
     ⚠ 呼び口だけ残す＝古いキャッシュの画面から呼ばれても何も消さない。 */
  async function archiveOldDoneNotes() { return []; }

  // v1.8.0: onSnapshot 購読（order asc）
  function subscribeBoardNotes(onUpdate) {
    const col = _col();
    if (!col) {
      console.warn('[db-board-notes] subscribeBoardNotes: companyId 未確定');
      return function () {};
    }
    const unsub = col.orderBy('order', 'asc').onSnapshot(
      function (snap) {
        const list = [];
        snap.forEach(d => list.push(_normalizeForLoad(d)));
        try {
          if (typeof onUpdate === 'function') onUpdate(list);
        } catch (e) {
          console.error('[db-board-notes] subscribeBoardNotes callback error:', e);
        }
      },
      function (err) {
        console.error('[db-board-notes] subscribeBoardNotes error:', err);
      }
    );
    return unsub;
  }

  window.dbBoardNotes = {
    loadBoardNotes: loadBoardNotes,
    saveBoardNote: saveBoardNote,
    deleteBoardNote: deleteBoardNote,
    reorderBoardNotes: reorderBoardNotes,
    archiveOldDoneNotes: archiveOldDoneNotes,
    subscribeBoardNotes: subscribeBoardNotes,
  };

  console.log('[db-board-notes] ready');
})();

window.saveBoardNoteById = function (noteId) {
  if (!window.dbBoardNotes || !noteId) return;
  if (typeof boardNotes === 'undefined' || !Array.isArray(boardNotes)) return;
  const note = boardNotes.find(x => x && x.id === noteId);
  if (!note) return;
  window.dbBoardNotes.saveBoardNote(note).catch(e => console.error('[saveBoardNoteById] failed', noteId, e));
};
