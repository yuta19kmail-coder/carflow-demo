// ========================================
// task-memo-auto-note.js (v2.2.7〜)
// date型タスクメモから「緑付箋」を自動作成/同期/削除
//
// データ:
//   note.id = `auto_tm_{carId}_{taskId}` （決定論的IDなのでupsert可能）
//   note.autoSource = { type: 'taskMemo', carId, taskId, phase }
//   note.title = `${taskIcon} ${taskName}`
//   note.body = `${管理番号} ${メーカー} ${車種}\n${label}: ${value}`
//   note.color = 'green'
//   note.deadline = メモのvalue (YYYY-MM-DD)
//
// 公開API:
//   window.taskMemoAutoNote.sync(car, taskId, phase)
//     - date型メモが存在: 付箋を作成 or 更新
//     - メモが存在しない or 型がdateじゃない: 付箋を削除
//   window.taskMemoAutoNote.markDone(car, taskId, isDone)
//     - タスク完了で付箋に status='done' をセット（archiveOldDoneNotes(7)で7日後に自動削除）
//   window.taskMemoAutoNote.cleanup()
//     - 完了から7日以上経った付箋を削除（自動付箋に限らず全done付箋対象）
// ========================================

(function () {
  'use strict';

  function _esc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _autoNoteId(carId, taskId) {
    return 'auto_tm_' + String(carId) + '_' + String(taskId);
  }

  function _findAutoNote(carId, taskId) {
    if (typeof boardNotes === 'undefined' || !Array.isArray(boardNotes)) return null;
    const id = _autoNoteId(carId, taskId);
    return boardNotes.find(n => n && n.id === id) || null;
  }

  function _getTaskInfo(taskId, phase) {
    let name = taskId, icon = '';
    if (typeof _allTasksForPhase === 'function') {
      const tasks = _allTasksForPhase(phase);
      const t = tasks.find(x => x.id === taskId);
      if (t) { name = t.name || taskId; icon = t.icon || ''; }
    }
    const label = (typeof getTaskMemoLabel === 'function') ? getTaskMemoLabel(taskId, phase) : '';
    return { name, icon, label };
  }

  function _nextOrder() {
    if (typeof boardNotes === 'undefined' || !Array.isArray(boardNotes)) return 0;
    let m = -1;
    boardNotes.forEach(n => { if (typeof n.order === 'number' && n.order > m) m = n.order; });
    return m + 1;
  }

  // ----------------------------------------
  // メモと付箋を同期
  //   - date型メモあり: 付箋を作成 or 更新
  //   - メモなし / dateじゃない: 付箋を削除
  // ----------------------------------------
  async function syncAutoNote(car, taskId, phase) {
    if (!car || !taskId || !phase) return;

    // メモ設定がdate型 or time型かチェック
    // v2.2.9: time型も自動付箋対象に追加（freeword は対象外＝本文ベースなので付箋自動生成しない）
    const cfg = (typeof getTaskMemoConfig === 'function') ? getTaskMemoConfig(taskId, phase) : null;
    const memo = car.taskMemos && car.taskMemos[taskId];
    const existing = _findAutoNote(car.id, taskId);

    // date型 or time型 メモがある場合だけ付箋を作成/更新する
    const isAutoType = !!(cfg && (cfg.type === 'date' || cfg.type === 'time'));
    const shouldExist = isAutoType && !!(memo && memo.value);

    if (!shouldExist) {
      if (existing) await _deleteAutoNote(existing);
      return;
    }

    const { name: taskName, label } = _getTaskInfo(taskId, phase);
    // v2.2.8/v2.2.9: フォーマット
    //   タイトル：管理番号 車種（例：「KM-0123 アクア」）
    //   本文：大タスク名 ラベル 値（date は M/D、time は HH:MM そのまま）
    const title = [car.num || '', car.model || ''].filter(Boolean).join(' ').trim()
                  || (car.maker || '') || '(車種未設定)';
    let valueDisp = memo.value;
    let deadlineValue = null;
    if (cfg.type === 'date') {
      try {
        const d = new Date(memo.value);
        if (!isNaN(d.getTime())) valueDisp = `${d.getMonth() + 1}/${d.getDate()}`;
      } catch (e) { /* noop */ }
      deadlineValue = memo.value; // YYYY-MM-DD として付箋のdeadlineに使う
    } else if (cfg.type === 'time') {
      // HH:MM そのまま。time だけだと日付が決まらないので付箋の deadline には入れない
      deadlineValue = null;
    }
    const body = [taskName, label, valueDisp].filter(Boolean).join(' ');

    if (existing) {
      // 更新（status は触らない＝完了済みなら維持）
      existing.title = title;
      existing.body = body;
      existing.color = 'green';
      existing.deadline = deadlineValue; // date=YYYY-MM-DD, time=null
      existing.autoSource = { type: 'taskMemo', carId: String(car.id), taskId: String(taskId), phase: String(phase) };
      if (window.dbBoardNotes && window.dbBoardNotes.saveBoardNote) {
        try { await window.dbBoardNotes.saveBoardNote(existing); }
        catch (e) { console.error('[auto-note] update failed', e); }
      }
    } else {
      // 新規作成
      const note = {
        id: _autoNoteId(car.id, taskId),
        title: title,
        body: body,
        color: 'green',
        deadline: deadlineValue,
        memberUids: [],
        imageURL: '',
        order: _nextOrder(),
        autoSource: { type: 'taskMemo', carId: String(car.id), taskId: String(taskId), phase: String(phase) },
        authorUid: (window.fb && window.fb.currentUser && window.fb.currentUser.uid) || null,
      };
      boardNotes.push(note);
      if (window.dbBoardNotes && window.dbBoardNotes.saveBoardNote) {
        try { await window.dbBoardNotes.saveBoardNote(note); }
        catch (e) { console.error('[auto-note] create failed', e); }
      }
    }
    if (typeof renderBoardNotes === 'function') renderBoardNotes();
  }

  async function _deleteAutoNote(note) {
    if (!note || !note.id) return;
    const idx = (boardNotes || []).findIndex(n => n && n.id === note.id);
    if (idx >= 0) boardNotes.splice(idx, 1);
    if (window.dbBoardNotes && window.dbBoardNotes.deleteBoardNote) {
      try { await window.dbBoardNotes.deleteBoardNote(note.id); }
      catch (e) { console.error('[auto-note] delete failed', e); }
    }
    if (typeof renderBoardNotes === 'function') renderBoardNotes();
  }

  // ----------------------------------------
  // タスクの完了/未完了に合わせて付箋ステータスを同期
  //   isDone=true: status='done' をセット（doneAt 時点から 7日後に自動削除）
  //   isDone=false: status を解除（再アクティブ化）
  // ----------------------------------------
  async function markDoneIfNeeded(car, taskId, isDone) {
    if (!car || !taskId) return;
    const note = _findAutoNote(car.id, taskId);
    if (!note) return;

    if (isDone) {
      if (note.status === 'done') return;
      note.status = 'done';
      note.doneAt = (window.fb && window.fb.serverTimestamp) ? window.fb.serverTimestamp() : new Date().toISOString();
      note.doneByUid = (window.fb && window.fb.currentUser && window.fb.currentUser.uid) || null;
      if (window.dbBoardNotes && window.dbBoardNotes.saveBoardNote) {
        try { await window.dbBoardNotes.saveBoardNote(note); }
        catch (e) { console.error('[auto-note] mark done failed', e); }
      }
    } else {
      if (note.status !== 'done') return;
      delete note.status;
      delete note.doneAt;
      delete note.doneByUid;
      if (window.dbBoardNotes && window.dbBoardNotes.saveBoardNote) {
        try { await window.dbBoardNotes.saveBoardNote(note); }
        catch (e) { console.error('[auto-note] unmark done failed', e); }
      }
    }
    if (typeof renderBoardNotes === 'function') renderBoardNotes();
  }

  // ----------------------------------------
  // 起動時クリーンアップ：完了から7日以上経過したdone付箋を削除
  //   自動付箋に限らず全done付箋が対象（既存仕様）
  // ----------------------------------------
  async function cleanup() {
    if (!window.dbBoardNotes || !window.dbBoardNotes.archiveOldDoneNotes) return 0;
    try {
      const ids = await window.dbBoardNotes.archiveOldDoneNotes(7);
      if (Array.isArray(ids) && ids.length && Array.isArray(boardNotes)) {
        ids.forEach(id => {
          const idx = boardNotes.findIndex(n => n && n.id === id);
          if (idx >= 0) boardNotes.splice(idx, 1);
        });
        if (typeof renderBoardNotes === 'function') renderBoardNotes();
        console.log('[auto-note] cleaned up', ids.length, 'old done notes');
      }
      return (ids || []).length;
    } catch (e) {
      console.error('[auto-note] cleanup failed', e);
      return 0;
    }
  }

  window.taskMemoAutoNote = {
    sync: syncAutoNote,
    markDone: markDoneIfNeeded,
    cleanup: cleanup,
    isAutoNote: (note) => !!(note && note.autoSource && note.autoSource.type === 'taskMemo'),
  };
})();
