// ========================================
// board-notes.js (v1.7.0〜)
// ----------------------------------------
// ダッシュボードの「全体タスク（付箋ボード）」UI。
// 各作業者は個別タスクと同時にこの全体タスクを見て業務を把握する。
//
// 構造：
//   ・付箋カード（5色）。タイトル / 本文 / 期限 / メンバーアイコン / 画像 / 作成者
//   ・付箋の「⋮」メニューで「済」「消去」
//   ・「済」スタンプは大きく押される（やったよ感）
//   ・DnD で並び替え可能（admin/manager 以上）
//   ・画像はカード内サムネ → クリックで全画面プレビュー
//   ・本文中の「KM0354」等は自動で車両詳細リンクに
//   ・色ごとのラベル（緊急 / 今日中 / 連絡 等）は会社共通設定（settings/main.boardLabels）
//
// 権限：
//   ・閲覧：メンバー全員
//   ・新規作成・編集・済・消去・並び替え：viewer 以外（canMutateWork）
//
// グローバル：
//   window.renderBoardNotes()
//   window.openBoardNoteModal(noteId | null)
//   window.closeBoardNoteModal()
//   window.saveBoardNoteFromModal()
//   window.deleteBoardNoteFromCard(noteId)
//   window.markBoardNoteDone(noteId)
//   window.toggleNoteMenu(noteId)
//   window.openImagePreview(url)
//   window.closeImagePreview()
//   window.boardNoteOnDragStart / DragOver / Drop / DragEnd
// ========================================

(function () {
  'use strict';

  // 5色（CSS で塗り分け）
  const NOTE_COLORS = ['red', 'orange', 'yellow', 'green', 'blue'];
  // スタッフキャッシュ（モーダル開く時にロード）
  let _staffCache = null;
  // 編集モーダルのコンテキスト
  const _editor = { editingId: null, photoData: null, photoChanged: false, members: [] };

  // -----------------------------------------
  // ヘルパー
  // -----------------------------------------
  function _toast(msg) { if (typeof showToast === 'function') showToast(msg); }
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function _canMutate() {
    const role = window.fb && window.fb.currentStaff && window.fb.currentStaff.role;
    return !!role && role !== 'viewer';
  }

  // v1.7.6: タッチデバイス判定（iPhone/Androidなど）
  function _isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
  }
  function _myUid() { return window.fb && window.fb.currentUser && window.fb.currentUser.uid; }
  function _newId() { return 'bn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function _maxOrder() {
    let m = -1;
    (boardNotes || []).forEach(n => { if (typeof n.order === 'number' && n.order > m) m = n.order; });
    return m;
  }

  function _ensureLabels() {
    if (typeof boardLabels === 'undefined') return {};
    const def = { red: '緊急', orange: '今日中', yellow: '今週中', green: '連絡', blue: '余裕' };
    NOTE_COLORS.forEach(c => { if (boardLabels[c] == null || boardLabels[c] === undefined) boardLabels[c] = def[c]; });
    return boardLabels;
  }

  function _formatDeadline(d) {
    if (!d) return '';
    // d: 'YYYY-MM-DD'
    try {
      const dt = new Date(d + 'T00:00:00');
      const today = new Date(); today.setHours(0,0,0,0);
      const diff = Math.round((dt - today) / 86400000);
      const md = `${dt.getMonth() + 1}/${dt.getDate()}`;
      if (diff === 0) return md + '（本日）';
      if (diff === 1) return md + '（明日）';
      if (diff > 0) return md + `（あと${diff}日）`;
      return md + `（${-diff}日経過）`;
    } catch (e) { return d; }
  }

  function _isOverdue(d) {
    if (!d) return false;
    try {
      const dt = new Date(d + 'T00:00:00');
      const today = new Date(); today.setHours(0,0,0,0);
      return (dt - today) < 0;
    } catch (e) { return false; }
  }

  // 本文中の KM0354 等を車両詳細リンクに（v1.7.0 nice-to-have）
  function _linkifyCarIds(text) {
    if (!text) return '';
    const escaped = _esc(text);
    // 管理番号は 'KM' + 数字 / 'km' + 数字 / 'カー' なし数字 など色々ありうるが、KM＋数字に限定
    return escaped.replace(/(KM\d{2,6})/g, (m) => {
      // 該当する car があるかチェック（cars[] か archivedCars[]）
      const exists = (typeof cars !== 'undefined' && cars.some(c => (c.num || '').toUpperCase() === m.toUpperCase()));
      if (!exists) return m;
      return `<a class="bn-carlink" onclick="(function(){const c=cars.find(x=>(x.num||'').toUpperCase()==='${m.toUpperCase()}');if(c&&typeof openDetail==='function')openDetail(c.id);})();event.stopPropagation();">${m}</a>`;
    });
  }

  async function _loadStaffOnce() {
    if (_staffCache) return _staffCache;
    if (!window.dbStaff || !window.dbStaff.loadAllStaff) return [];
    try { _staffCache = await window.dbStaff.loadAllStaff(); return _staffCache; }
    catch (e) { console.error(e); return []; }
  }

  // v1.7.1: auth.js から先読み済みのスタッフ一覧をセット（renderBoardNotes 1回目から avatar が出るように）
  window._setBoardNotesStaffCache = function (list) {
    if (Array.isArray(list)) _staffCache = list;
  };
  // v1.7.30: worklog などから staff キャッシュを取り出すためのゲッター
  window._getBoardNotesStaffCache = function () {
    return _staffCache;
  };

  function _staffByUid(uid) {
    if (!_staffCache) return null;
    return _staffCache.find(s => (s.uid || s.id) === uid) || null;
  }

  // v1.7.30: 与えられた uid 配列を staff の sortOrder で並べ替える（不明 uid は末尾）
  function _sortUidsBySortOrder(uids) {
    if (!Array.isArray(uids) || uids.length === 0) return [];
    const cache = _staffCache || [];
    const order = uids.map(uid => {
      const s = cache.find(x => (x.uid || x.id) === uid);
      const so = (s && typeof s.sortOrder === 'number') ? s.sortOrder : 999999;
      return { uid, sortOrder: so };
    });
    order.sort((a, b) => a.sortOrder - b.sortOrder);
    return order.map(x => x.uid);
  }

  function _renderMemberAvatar(uid, sizePx) {
    const s = _staffByUid(uid) || {};
    const photo = (typeof resolveStaffPhotoURL === 'function') ? resolveStaffPhotoURL(s, null) : (s.customPhotoURL || s.photoURL || null);
    const name  = (typeof resolveStaffDisplayName === 'function') ? resolveStaffDisplayName(s, null) : (s.customDisplayName || s.displayName || '?');
    const init  = (typeof staffInitial === 'function') ? staffInitial(name) : String(name).slice(0, 2).toUpperCase();
    const sz = sizePx || 22;
    const style = `width:${sz}px;height:${sz}px;font-size:${Math.round(sz * 0.42)}px`;
    if (photo) {
      return `<span class="bn-av" title="${_esc(name)}" style="${style};background-image:url('${_esc(photo)}');background-size:cover;background-position:center;color:transparent">${_esc(init)}</span>`;
    }
    return `<span class="bn-av" title="${_esc(name)}" style="${style}">${_esc(init)}</span>`;
  }

  // =========================================
  // メイン：ダッシュボードに描画
  // v1.7.2: ダッシュボード（#board-notes-area）と
  //         重要タブ（#overview-board-notes-area）の両方に描画
  // =========================================
  function renderBoardNotes() {
    const targets = [
      document.getElementById('board-notes-area'),
      document.getElementById('overview-board-notes-area'),
    ].filter(Boolean);
    if (targets.length === 0) return;

    _ensureLabels();
    const labels = boardLabels || {};
    const canMut = _canMutate();

    // ヘッダ：タイトル + ラベル凡例 + 新規ボタン
    const labelChipsHtml = NOTE_COLORS
      .filter(c => labels[c])
      .map(c => `<span class="bn-label-chip bn-label-${c}">${_esc(labels[c])}</span>`)
      .join('');

    const cards = (boardNotes || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    // v1.7.1: 1個の付箋がエラーでも全体が壊れないよう try/catch で個別保護
    const cardsHtml = cards.length === 0
      ? '<div class="bn-empty">付箋はまだありません。「＋ 付箋を追加」から最初の1枚を作りましょう。</div>'
      : cards.map(n => {
          try { return _renderNoteCard(n, canMut); }
          catch (err) {
            console.error('[board-notes] render error for note', n && n.id, err);
            return `<div class="bn-card bn-color-yellow"><div class="bn-title">⚠ 表示エラー（${_esc(n && n.id || '?')}）</div></div>`;
          }
        }).join('');

    const html = `
      <div class="bn-header">
        <div class="bn-header-left">
          <span class="bn-header-icon">📌</span>
          <span class="bn-header-title">全体タスク</span>
          <div class="bn-label-chips">${labelChipsHtml}</div>
        </div>
        ${canMut ? `<button class="btn-sm btn-primary" onclick="openBoardNoteModal(null)">＋ 付箋を追加</button>` : ''}
      </div>
      <div class="bn-grid"
           ondragover="boardNoteOnDragOver(event)"
           ondrop="boardNoteOnDropArea(event)">${cardsHtml}</div>
    `;
    targets.forEach(t => { t.innerHTML = html; });
  }
  window.renderBoardNotes = renderBoardNotes;

  // 単一カードのHTML
  function _renderNoteCard(note, canMut) {
    const color = NOTE_COLORS.includes(note.color) ? note.color : 'yellow';
    const done = note.status === 'done';
    const overdue = !done && _isOverdue(note.deadline);
    const author = _staffByUid(note.authorUid);
    const authorName = author
      ? ((typeof resolveStaffDisplayName === 'function') ? resolveStaffDisplayName(author, null) : (author.customDisplayName || author.displayName || ''))
      : '';
    const authorAv = note.authorUid ? _renderMemberAvatar(note.authorUid, 18) : '';
    // v1.7.30: メンバーアイコンの並びは staff の sortOrder に従う
    const sortedMemberUids = _sortUidsBySortOrder(note.memberUids || []);
    const memberAvatars = sortedMemberUids.map(uid => _renderMemberAvatar(uid, 22)).join('');

    const labelText = (boardLabels && boardLabels[color]) || '';
    // v1.7.7: タイトルにも car-ID 自動リンクを適用
    const titleHtml = note.title ? _linkifyCarIds(note.title) : '<span class="bn-empty-title">(無題)</span>';
    const bodyHtml = _linkifyCarIds(note.body || '');
    const imgHtml = note.imageURL
      ? `<img class="bn-img" src="${_esc(note.imageURL)}" alt="" onclick="event.stopPropagation();openImagePreview('${_esc(note.imageURL)}')">`
      : '';
    const deadlineHtml = note.deadline
      ? `<div class="bn-deadline ${overdue ? 'is-overdue' : ''}">${overdue ? '🚨 ' : '⏰ '}${_esc(_formatDeadline(note.deadline))}</div>`
      : '';

    // v1.7.6: タッチデバイスでは draggable=true を付けない（kebab タップを邪魔しない）
    const dragAttrs = (canMut && !_isTouchDevice())
      ? `draggable="true"
           ondragstart="boardNoteOnDragStart(event, '${_esc(note.id)}')"
           ondragover="boardNoteOnDragOver(event)"
           ondrop="boardNoteOnDrop(event, '${_esc(note.id)}')"
           ondragend="boardNoteOnDragEnd(event)"`
      : '';
    return `
      <div class="bn-card bn-color-${color} ${done ? 'is-done' : ''} ${overdue ? 'is-overdue' : ''}"
           data-note-id="${_esc(note.id)}"
           ${dragAttrs}>
        ${done ? '<div class="bn-done-stamp">済</div>' : ''}
        ${labelText ? `<div class="bn-card-label">${_esc(labelText)}</div>` : ''}
        ${canMut ? `
          <button class="bn-menu-btn" onclick="event.stopPropagation();openBoardNoteActions('${_esc(note.id)}')" title="メニュー">⋮</button>` : ''}

        <div class="bn-title">${titleHtml}</div>
        ${imgHtml}
        ${bodyHtml ? `<div class="bn-body">${bodyHtml}</div>` : ''}
        ${deadlineHtml}

        <div class="bn-footer">
          <div class="bn-members">${memberAvatars || '<span class="bn-no-member">担当なし</span>'}</div>
          <div class="bn-author">
            ${authorAv}
            <span class="bn-author-name">${_esc(authorName)}</span>
          </div>
        </div>
      </div>
    `;
  }

  // -----------------------------------------
  // v1.7.8: ⋮ メニュー → 下から出るアクションシート（モーダル）
  // -----------------------------------------
  let _activeMenuNoteId = null;

  function openBoardNoteActions(noteId) {
    _activeMenuNoteId = noteId;
    const note = (boardNotes || []).find(x => x.id === noteId);
    const t = document.getElementById('bn-actionsheet-title');
    if (t) t.textContent = note && note.title ? note.title : '付箋メニュー';
    const m = document.getElementById('modal-bn-actions');
    if (m) m.classList.add('open');
  }
  window.openBoardNoteActions = openBoardNoteActions;

  function closeBoardNoteActions() {
    const m = document.getElementById('modal-bn-actions');
    if (m) m.classList.remove('open');
    _activeMenuNoteId = null;
  }
  window.closeBoardNoteActions = closeBoardNoteActions;

  window.bnActionEdit = function () {
    const id = _activeMenuNoteId;
    closeBoardNoteActions();
    if (id) openBoardNoteModal(id);
  };
  window.bnActionDone = function () {
    const id = _activeMenuNoteId;
    closeBoardNoteActions();
    if (id) markBoardNoteDone(id);
  };
  window.bnActionDelete = function () {
    const id = _activeMenuNoteId;
    closeBoardNoteActions();
    if (id) deleteBoardNoteFromCard(id);
  };

  // 旧 toggleNoteMenu の互換用 stub（古いキャッシュ対策）
  window.toggleNoteMenu = function (noteId) { openBoardNoteActions(noteId); };

  // -----------------------------------------
  // 操作
  // -----------------------------------------
  async function markBoardNoteDone(noteId) {
    const n = (boardNotes || []).find(x => x.id === noteId);
    if (!n) return;
    n.status = 'done';
    n.doneAt = window.fb.serverTimestamp();
    if (window.dbBoardNotes) {
      try { await window.dbBoardNotes.saveBoardNote(n); } catch (e) { return; }
    }
    if (typeof addLog === 'function') addLog(null, `付箋「${n.title || '(無題)'}」を済にしました`);
    renderBoardNotes();
  }
  window.markBoardNoteDone = markBoardNoteDone;

  async function deleteBoardNoteFromCard(noteId) {
    const n = (boardNotes || []).find(x => x.id === noteId);
    if (!n) return;
    if (!confirm(`付箋「${n.title || '(無題)'}」を消去しますか？`)) return;
    if (window.dbBoardNotes) {
      try { await window.dbBoardNotes.deleteBoardNote(noteId); } catch (e) { return; }
    }
    if (window.dbStorage && window.dbStorage.deleteBoardNoteImage) {
      window.dbStorage.deleteBoardNoteImage(noteId).catch(()=>{});
    }
    const i = boardNotes.findIndex(x => x.id === noteId);
    if (i >= 0) boardNotes.splice(i, 1);
    if (typeof addLog === 'function') addLog(null, `付箋を消去しました`);
    renderBoardNotes();
  }
  window.deleteBoardNoteFromCard = deleteBoardNoteFromCard;

  // =========================================
  // 編集モーダル
  // =========================================
  async function openBoardNoteModal(noteId) {
    if (!_canMutate()) { _toast('閲覧専用ロールでは作成できません'); return; }
    await _loadStaffOnce();

    _editor.editingId = noteId || null;
    _editor.photoData = null;
    _editor.photoChanged = false;
    _editor.members = [];

    const note = noteId ? (boardNotes || []).find(x => x.id === noteId) : null;
    const isNew = !note;

    document.getElementById('bn-modal-title').textContent = isNew ? '付箋を追加' : '付箋を編集';
    document.getElementById('bn-inp-title').value = note ? (note.title || '') : '';
    document.getElementById('bn-inp-body').value = note ? (note.body || '') : '';
    document.getElementById('bn-inp-deadline').value = note ? (note.deadline || '') : '';
    _editor.members = note ? (note.memberUids || []).slice() : [];

    // 色ラジオ
    const initialColor = note ? (note.color || 'yellow') : 'yellow';
    NOTE_COLORS.forEach(c => {
      const r = document.getElementById('bn-color-' + c);
      if (r) r.checked = (c === initialColor);
    });

    // 画像プレビュー
    _renderPhotoPreview(note ? note.imageURL : '');

    // メンバー選択
    _renderMemberPicker();

    document.getElementById('modal-board-note').classList.add('open');
  }
  window.openBoardNoteModal = openBoardNoteModal;

  // v1.8.0: リアルタイム同期用 — 「いま編集モーダルで開いている付箋ID」を外部公開
  window.getEditingBoardNoteId = function () { return _editor.editingId; };

  function closeBoardNoteModal() {
    document.getElementById('modal-board-note').classList.remove('open');
    _editor.editingId = null;
    _editor.photoData = null;
    _editor.photoChanged = false;
  }
  window.closeBoardNoteModal = closeBoardNoteModal;

  function _renderPhotoPreview(url) {
    const wrap = document.getElementById('bn-inp-photo-preview');
    if (!wrap) return;
    if (url) {
      wrap.innerHTML = `<img src="${_esc(url)}" alt="" style="max-width:100%;max-height:200px;border-radius:6px"><br>
        <button class="btn-sm" onclick="bnRemovePhoto()" style="margin-top:6px">画像を削除</button>`;
    } else {
      wrap.innerHTML = '';
    }
  }

  // 画像選択時
  window.bnOnPhotoChange = async function (input) {
    const file = input && input.files && input.files[0];
    if (!file) return;
    // 画面プレビュー用に DataURL を保持
    const reader = new FileReader();
    reader.onload = e => {
      _editor.photoData = file; // 保存時に使う File
      _editor.photoChanged = true;
      const wrap = document.getElementById('bn-inp-photo-preview');
      if (wrap) {
        wrap.innerHTML = `<img src="${e.target.result}" alt="" style="max-width:100%;max-height:200px;border-radius:6px"><br>
          <button class="btn-sm" onclick="bnRemovePhoto()" style="margin-top:6px">画像を削除</button>`;
      }
    };
    reader.readAsDataURL(file);
  };

  window.bnRemovePhoto = function () {
    _editor.photoData = null;
    _editor.photoChanged = true; // 「削除する」意思を保持
    const wrap = document.getElementById('bn-inp-photo-preview');
    if (wrap) wrap.innerHTML = '';
  };

  function _renderMemberPicker() {
    const wrap = document.getElementById('bn-inp-members');
    if (!wrap) return;
    const list = _staffCache || [];
    wrap.innerHTML = list
      .filter(s => s.active !== false)
      .map(s => {
        const uid = s.uid || s.id;
        const checked = _editor.members.includes(uid);
        const name = (typeof resolveStaffDisplayName === 'function') ? resolveStaffDisplayName(s, null) : (s.customDisplayName || s.displayName || '');
        return `<label class="bn-member-pick ${checked ? 'is-checked' : ''}">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="bnToggleMember('${_esc(uid)}', this.checked)">
          ${_renderMemberAvatar(uid, 24)}
          <span>${_esc(name)}</span>
        </label>`;
      }).join('');
    if (!list.length) {
      wrap.innerHTML = '<div style="font-size:11px;color:var(--text3)">メンバー情報を読み込み中…</div>';
    }
  }

  window.bnToggleMember = function (uid, checked) {
    if (checked) {
      if (!_editor.members.includes(uid)) _editor.members.push(uid);
    } else {
      _editor.members = _editor.members.filter(x => x !== uid);
    }
    // v1.7.7: ビジュアル class も更新（:has() 非対応ブラウザ用フォールバック）
    const wrap = document.getElementById('bn-inp-members');
    if (wrap) {
      wrap.querySelectorAll('.bn-member-pick').forEach(el => {
        const inp = el.querySelector('input[type="checkbox"]');
        if (!inp) return;
        const isMatch = inp.getAttribute('onchange') && inp.getAttribute('onchange').indexOf("'" + uid + "'") >= 0;
        if (isMatch) el.classList.toggle('is-checked', checked);
      });
    }
  };

  // 保存
  async function saveBoardNoteFromModal() {
    if (!_canMutate()) return;
    const title = (document.getElementById('bn-inp-title').value || '').trim();
    const body = (document.getElementById('bn-inp-body').value || '').trim();
    const deadline = (document.getElementById('bn-inp-deadline').value || '').trim();
    let color = 'yellow';
    NOTE_COLORS.forEach(c => {
      const r = document.getElementById('bn-color-' + c);
      if (r && r.checked) color = c;
    });

    if (!title && !body) { _toast('タイトルか本文のどちらかは入力してください'); return; }

    const isNew = !_editor.editingId;
    let note = isNew
      ? { id: _newId(), title, body, color, deadline: deadline || null, memberUids: _editor.members.slice(), authorUid: _myUid(), status: 'open', order: _maxOrder() + 1, imageURL: '' }
      : (boardNotes || []).find(x => x.id === _editor.editingId);
    if (!note) { _toast('対象の付箋が見つかりません'); return; }

    if (!isNew) {
      note.title = title;
      note.body = body;
      note.color = color;
      note.deadline = deadline || null;
      note.memberUids = _editor.members.slice();
    }

    // 画像処理
    if (_editor.photoChanged) {
      try {
        if (_editor.photoData) {
          if (window.dbStorage && window.dbStorage.uploadBoardNoteImage) {
            const url = await window.dbStorage.uploadBoardNoteImage(note.id, _editor.photoData);
            note.imageURL = url || '';
          }
        } else {
          // 削除指示
          if (window.dbStorage && window.dbStorage.deleteBoardNoteImage) {
            await window.dbStorage.deleteBoardNoteImage(note.id).catch(()=>{});
          }
          note.imageURL = '';
        }
      } catch (e) {
        console.error('[board-notes] image upload failed', e);
        _toast('画像のアップロードに失敗しました');
        return;
      }
    }

    if (isNew) {
      boardNotes.push(note);
    }

    // DB 保存
    if (window.dbBoardNotes) {
      try { await window.dbBoardNotes.saveBoardNote(note); }
      catch (e) { return; }
    }

    if (typeof addLog === 'function') {
      addLog(null, isNew ? `付箋を追加しました：${title}` : `付箋を更新しました：${title}`);
    }
    closeBoardNoteModal();
    renderBoardNotes();
  }
  window.saveBoardNoteFromModal = saveBoardNoteFromModal;

  // =========================================
  // DnD 並び替え
  // =========================================
  function boardNoteOnDragStart(e, noteId) {
    if (!_canMutate()) { e.preventDefault(); return; }
    dragBoardNoteId = noteId;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', noteId); } catch (err) {}
    e.currentTarget.classList.add('is-dragging');
  }
  window.boardNoteOnDragStart = boardNoteOnDragStart;

  function boardNoteOnDragOver(e) {
    if (!dragBoardNoteId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
  window.boardNoteOnDragOver = boardNoteOnDragOver;

  function boardNoteOnDrop(e, targetNoteId) {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = dragBoardNoteId;
    if (!sourceId || sourceId === targetNoteId) return;

    const list = (boardNotes || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const fromIdx = list.findIndex(x => x.id === sourceId);
    const toIdx = list.findIndex(x => x.id === targetNoteId);
    if (fromIdx < 0 || toIdx < 0) return;

    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);

    // order を 0..N-1 に再付番
    list.forEach((n, i) => { n.order = i; });

    // メモリの boardNotes を新しい順に再構築
    boardNotes.length = 0;
    list.forEach(n => boardNotes.push(n));

    // DB 反映（batch）
    if (window.dbBoardNotes) {
      window.dbBoardNotes.reorderBoardNotes(list.map(n => n.id)).catch(()=>{});
    }

    renderBoardNotes();
  }
  window.boardNoteOnDrop = boardNoteOnDrop;

  // 空きスペースに drop した場合：末尾に
  function boardNoteOnDropArea(e) {
    e.preventDefault();
    if (!dragBoardNoteId) return;
    // カードの上で drop された場合は boardNoteOnDrop が呼ばれて stopPropagation するのでここには来ない
    // 何もしない or 末尾移動：仕様揺れを避けて何もしない
  }
  window.boardNoteOnDropArea = boardNoteOnDropArea;

  function boardNoteOnDragEnd(e) {
    dragBoardNoteId = null;
    document.querySelectorAll('.bn-card.is-dragging').forEach(c => c.classList.remove('is-dragging'));
  }
  window.boardNoteOnDragEnd = boardNoteOnDragEnd;

  // =========================================
  // 画像プレビュー（拡大）
  // =========================================
  function openImagePreview(url) {
    if (!url) return;
    const m = document.getElementById('modal-image-preview');
    const img = document.getElementById('image-preview-img');
    if (img) img.src = url;
    if (m) m.classList.add('open');
  }
  window.openImagePreview = openImagePreview;

  function closeImagePreview() {
    const m = document.getElementById('modal-image-preview');
    if (m) m.classList.remove('open');
  }
  window.closeImagePreview = closeImagePreview;

  console.log('[board-notes] ready');
})();
