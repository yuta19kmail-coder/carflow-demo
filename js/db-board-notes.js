// ========================================
// db-board-notes.js (v1.7.0〜 / v1.8.0 リアルタイム同期)
// Firestore の boardNotes コレクション CRUD wrapper
// ----------------------------------------
// パス：companies/{companyId}/boardNotes/{noteId}
//
// 提供 API（window.dbBoardNotes 名前空間）：
//   loadBoardNotes()                : 全件取得（order asc）
//   saveBoardNote(note)             : 1件保存（merge）
//   deleteBoardNote(noteId)         : 1件削除
//   archiveOldDoneNotes(days)       : 済 で N 日経過したものを delete
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
      if (typeof showToast === 'function') showToast('付箋の保存に失敗しました');
      throw err;
    }
  }

  async function deleteBoardNote(noteId) {
    if (!noteId) return;
    const col = _col();
    if (!col) return;
    try {
      await col.doc(String(noteId)).delete();
    } catch (err) {
      console.error('[db-board-notes] deleteBoardNote error:', err);
      if (typeof showToast === 'function') showToast('付箋の削除に失敗しました');
      throw err;
    }
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
      if (typeof showToast === 'function') showToast('並び順の保存に失敗しました');
      throw err;
    }
  }

  async function archiveOldDoneNotes(days) {
    if (typeof days !== 'number' || days < 0) days = 7;
    const col = _col();
    if (!col) return [];
    try {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const snap = await col.where('status', '==', 'done').get();
      const toDelete = [];
      snap.forEach(d => {
        const data = d.data();
        const t = data.doneAt && data.doneAt.toMillis ? data.doneAt.toMillis()
                 : (data.doneAt && data.doneAt.seconds ? data.doneAt.seconds * 1000 : 0);
        if (t > 0 && t < cutoff) toDelete.push(d.id);
      });
      if (toDelete.length === 0) return [];
      const CHUNK = 450;
      for (let i = 0; i < toDelete.length; i += CHUNK) {
        const slice = toDelete.slice(i, i + CHUNK);
        const batch = window.fb.db.batch();
        slice.forEach(id => batch.delete(col.doc(id)));
        await batch.commit();
      }
      console.log('[db-board-notes] archived', toDelete.length, 'old done notes');
      return toDelete.slice();
    } catch (err) {
      console.error('[db-board-notes] archiveOldDoneNotes error:', err);
      return [];
    }
  }

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
