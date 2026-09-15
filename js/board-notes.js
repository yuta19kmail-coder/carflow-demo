// ========================================
// board-notes.js - 付箋ボード（CarFlow の差し込み）CarFlow v2.60.0
// ----------------------------------------
// 🔴 v2.60.0（ゆうた指定 2026-09-13）付箋は **中身も見た目も全アプリ共通の部品**（_shared/coreflow-note-board.js）で描く。
//    🗣「付箋に関しては見ためもだけど　なかみも共通にした方がいいのでは？？」
//    ここに残すのは **CarFlow だけの事情** だけ：
//      ・保存        … dbBoardNotes（Firestore の boardNotes へ1件ずつ）
//      ・名簿        … CoreMembers 全員（ログインしない人も担当に選べる・v2.35.0）
//      ・一括で選ぶ   … CarFlow のグループ（memberGroups）
//      ・添付        … 画像・PDF を Storage へ上げる（dbStorage）
//      ・本文        … KM番号を車両リンクにする（linkifyCarNums）
//      ・自動付箋     … タスクメモから出た付箋の「編集」は車両詳細を開く
//      ・閲覧専用     … viewer は作れない・押せない
// 🔴 v2.60.0 「済」から3日で**消す**のをやめた（部品が3日で**隠す**。データは残る・戻せる）。
//    ⚠ 前は保存の前の写し（JSON）で「済にした時刻」が壊れて、実は一度も消えていなかった。
// ⚠ 付箋の決まり（自分用・済・回覧・保存の形）は部品の1本。ここに書き写さない。
// ========================================

(function () {
  'use strict';

  const DEF_LABELS = { red: '緊急', orange: '今日中', yellow: '今週中', green: '連絡', blue: '余裕' };
  let _staffCache = null;
  let _staffLoading = false;

  function _toast(msg) { if (typeof showToast === 'function') showToast(msg); }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function _role() { return window.fb && window.fb.currentStaff && window.fb.currentStaff.role; }
  function _canMutate() { const r = _role(); return !!r && r !== 'viewer'; }

  /* 🔴 v2.43.0「まとめて表示」＝ PitFlow・MHS の付箋も一緒に並べる。
     ⚠ `boardNotes` は **CarFlow 自身の付箋の配列（書く用）**。ここに よその付箋を混ぜないこと。 */
  function _all() {
    const mine = boardNotes || [];
    if (!window.CFNoteAll || !CFNoteAll.isOn()) return mine;
    return mine.concat(CFNoteAll.foreign());
  }
  function _foreign(n) { return !!(window.CFNoteAll && CFNoteAll.isForeign(n)); }
  function _denyForeign(n) {
    if (!_foreign(n)) return false;
    _toast('まとめて表示中です。' + (window.CFNoteAll ? CFNoteAll.labelOf(n) : 'よそのアプリ') + 'の付箋は、そのアプリで直してください');
    return true;
  }

  /* 「自分」。🔴 担当に保存される番号（名簿の uid または書類の番号）を先頭に。ログインIDも自分として照らす */
  function _myIds() {
    const f = window.fb || {};
    return [f.currentStaff && f.currentStaff.uid, f.currentMember && f.currentMember.id, f.currentUser && f.currentUser.uid]
      .filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
  }

  /* v2.35.0：付箋の担当は【CoreMembers 全員】から選ぶ（ログインしない人も伝達の相手に選べる） */
  function _loadStaff() {
    if (_staffCache || _staffLoading || !window.dbStaff) return;
    const load = window.dbStaff.loadAllMembers || window.dbStaff.loadAllStaff;
    if (!load) return;
    _staffLoading = true;
    Promise.resolve(load.call(window.dbStaff)).then(list => {
      _staffCache = Array.isArray(list) ? list : [];
      renderBoardNotes();
    }).catch(e => console.error('[board-notes] 名簿の読み込みに失敗', e)).then(() => { _staffLoading = false; });
  }
  /* v1.7.1: auth.js から先読み済みのスタッフ一覧をセット／v1.7.30: worklog などから取り出す */
  window._setBoardNotesStaffCache = function (list) { if (Array.isArray(list)) _staffCache = list; };
  window._getBoardNotesStaffCache = function () { return _staffCache; };

  function _uid(s) { return s.uid || s.id; }
  function _name(s) { return (typeof resolveStaffDisplayName === 'function') ? resolveStaffDisplayName(s, null) : (s.customDisplayName || s.displayName || s.name || ''); }
  function _photo(s) { return ((typeof resolveStaffPhotoURL === 'function') ? resolveStaffPhotoURL(s, null) : (s.customPhotoURL || s.photoURL)) || ''; }
  function _members() {
    _loadStaff();
    const so = s => (typeof s.sortOrder === 'number' ? s.sortOrder : 999999);
    return (_staffCache || []).filter(s => s.active !== false).slice().sort((a, b) => so(a) - so(b))
      .map(s => ({ id: _uid(s), name: _name(s), photo: _photo(s) }));
  }
  function _member(id) {
    const s = (_staffCache || []).find(x => _uid(x) === id);
    return s ? { name: _name(s), photo: _photo(s) } : null;
  }
  function _labels() {
    if (typeof boardLabels === 'undefined') return DEF_LABELS;
    Object.keys(DEF_LABELS).forEach(c => { if (boardLabels[c] == null) boardLabels[c] = DEF_LABELS[c]; });
    return boardLabels;
  }

  /* 保存先は付箋の出どころで変わる。**よその付箋を CarFlow の boardNotes に書かない。**
     🔴 v2.60.0 保存する形は部品の cleanForSave を通す（壊れた時刻の印を数字に直す） */
  function _saveNote(note) {
    if (_foreign(note) && window.CFNoteAll) return new Promise(res => CFNoteAll.save(note, res));
    if (!window.dbBoardNotes) return Promise.resolve();
    const clean = window.CFNoteBoard ? CFNoteBoard.rules.cleanForSave(note) : note;
    return Promise.resolve(window.dbBoardNotes.saveBoardNote(clean));
  }

  function _allBtnHtml() {
    if (!window.CFNoteAll || !CFNoteAll.available()) return '';
    const on = CFNoteAll.isOn();
    const n = on ? CFNoteAll.count() : 0;
    return `<button type="button" class="cfa-btn${on ? ' on' : ''}" onclick="cfNoteAllToggle()"
      title="${on ? 'PitFlow・MHS の付箋も一緒に出しています。もう一度押すと CarFlow だけに戻ります'
                  : 'PitFlow・MHS の付箋も一緒に出す（別の画面へ移ると戻ります）'}"
      >まとめて表示${on && n ? `<span class="cfa-n">+${n}</span>` : ''}</button>`;
  }
  window.cfNoteAllToggle = function () { if (window.CFNoteAll) CFNoteAll.toggle(); };

  if (window.CFNoteBoard) {
    CFNoteBoard.mount({
      app: 'carflow',
      me: _myIds,
      notes: _all,
      members: _members,
      member: _member,
      /* v2.18.1: グループ判定は名前ベース（CoreFlow の portalMembers.carflow.group）＋旧 groupId も見る */
      quickGroups: () => {
        const groups = (typeof memberGroups !== 'undefined' && Array.isArray(memberGroups)) ? memberGroups : [];
        const act = (_staffCache || []).filter(s => s.active !== false);
        return groups.map(g => ({ label: g.name, ids: act.filter(s => s.group === g.name || s.groupId === g.id).map(_uid) }));
      },
      labels: () => _labels(),
      save: (note, info) => {
        if (info && info.isNew && !_foreign(note)) boardNotes.push(note);
        return _saveNote(note);
      },
      remove: async note => {
        if (window.dbBoardNotes) await window.dbBoardNotes.deleteBoardNote(note.id);
        /* 添付のファイルは共通部品が消す（v2.61.0） */
        const i = boardNotes.findIndex(x => x.id === note.id);
        if (i >= 0) boardNotes.splice(i, 1);
      },
      reorder: list => {
        boardNotes.length = 0;
        list.forEach(n => boardNotes.push(n));
        return window.dbBoardNotes ? window.dbBoardNotes.reorderBoardNotes(list.map(n => n.id)) : Promise.resolve();
      },
      /* 添付（画像 または PDF。1つの付箋に1点）。🔴 v2.61.0 上げ下ろしは共通部品が1本でやる（置き場＝今までと同じ companies/{会社}/boardNotes/） */
      attach: {
        accept: 'image/*,application/pdf,.pdf',
        storage: { folder: 'boardNotes', company: () => window.fb && window.fb.currentCompanyId }
      },
      canMutate: _canMutate,
      /* v2.12.0：返信を消せるのは自分の返信 or admin/manager */
      canDeleteReply: () => { const r = _role(); return r === 'admin' || r === 'manager'; },
      isForeign: _foreign,
      badgeHtml: n => (window.CFNoteAll ? CFNoteAll.badgeHtml(n) : ''),
      /* 本文中の管理番号（例 KM-0100）を車両詳細リンクに（helpers.js の linkifyCarNums・操作ログと同じ決まり） */
      formatText: t => (typeof linkifyCarNums === 'function' ? linkifyCarNums(t || '') : _esc(t || '')),
      headerExtraHtml: _allBtnHtml,
      /* v1.7.2: ダッシュボード（#board-notes-area）と重要タブ（#overview-board-notes-area）の両方に描く */
      targets: () => [document.getElementById('board-notes-area'), document.getElementById('overview-board-notes-area')],
      /* v2.2.7: 自動付箋は編集の窓を開かず、車両詳細を開く（タスクメモが元データ） */
      onAutoEdit: n => {
        if (!(n.autoSource && n.autoSource.type === 'taskMemo')) return false;
        if (typeof openDetail === 'function') openDetail(n.autoSource.carId);
        if (typeof showToast === 'function') showToast('自動付箋は車両詳細のタスクメモから編集してください', 'CF-2001');
        return true;
      },
      onLog: msg => { if (typeof addLog === 'function') addLog(null, msg); },
      ask: (msg, opt) => (window.UI && UI.confirm ? UI.confirm(msg, opt || {}) : Promise.resolve(confirm(msg))),
      toast: _toast
    });
  }

  function renderBoardNotes() { if (window.CFNoteBoard) CFNoteBoard.render(); }
  window.renderBoardNotes = renderBoardNotes;
  /* 前からある呼び口（car-detail.js・main.js などが使う）。中身は部品へ渡すだけ
     v2.28.0: opts＝{ title:新規時の題, over:車両詳細の上に重ねる } */
  window.openBoardNoteModal = function (noteId, opts) {
    if (!_canMutate()) { _toast('閲覧専用ロールでは作成できません'); return; }
    const n = noteId ? _all().find(x => x.id === noteId) : null;
    if (n && _denyForeign(n)) return;
    if (window.CFNoteBoard) CFNoteBoard.openEditor(noteId || null, opts);
  };
  /* v1.8.0: リアルタイム同期用 — 「いま編集の窓で開いている付箋ID」（main.js が上書きを避けるのに使う） */
  window.getEditingBoardNoteId = function () { return window.CFNoteBoard ? CFNoteBoard.editingId() : null; };
  window.openBoardNoteActions = id => window.CFNoteBoard && CFNoteBoard.menu(id);
  window.markBoardNoteDone = id => window.CFNoteBoard && CFNoteBoard.markDone(id);
  window.markBoardNoteUndone = id => window.CFNoteBoard && CFNoteBoard.markUndone(id);
  window.markCirculationSelf = id => window.CFNoteBoard && CFNoteBoard.circulate(id);
  window.deleteBoardNoteFromCard = function (id) {
    const n = _all().find(x => x.id === id);
    if (n && _denyForeign(n)) return;
    if (window.CFNoteBoard) CFNoteBoard.remove(id);
  };
  window.openImagePreview = url => window.CFNoteBoard && CFNoteBoard.preview(url);
  window.closeImagePreview = () => window.CFNoteBoard && CFNoteBoard._close('cfnb-image');

  /* =========================================
     🔴 v2.43.0 「まとめて表示」＝全アプリ共通の部品（_shared/coreflow-note-all.js）につなぐ。
     ⚠ 別のビューへ移ったら解除（switchView を包むだけ＝本体は触らない）。**持ち越さない。**
     ========================================= */
  if (window.CFNoteAll) {
    CFNoteAll.setup({
      self:     'carflow',
      db:       function () { return window.fb && window.fb.db; },
      /* ⚠ **CarFlow に `fb.company()` は無い。** currentCompanyId から自分で組み立てる（db-board-notes.js の _col と同じ形） */
      company:  function () {
        if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
        return window.fb.db.collection('companies').doc(window.fb.currentCompanyId);
      },
      ready:    function () { return !!(window.fb && window.fb.db && window.fb.currentCompanyId); },
      onChange: function () { renderBoardNotes(); },
      toast:    function (msg) { _toast(msg); }
    });
    ['switchView', 'showView', 'setView'].forEach(function (name) {
      var orig = window[name];
      if (typeof orig !== 'function') return;
      window[name] = function () {
        if (CFNoteAll.isOn()) CFNoteAll.off(true);   /* ここでは描き直さない＝これから描く画面に任せる */
        return orig.apply(this, arguments);
      };
    });
  }

  console.log('[board-notes] ready（CarFlow・共通部品につないだ）');
})();
