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
  const _editor = { editingId: null, photoData: null, photoChanged: false, attachType: '', attachName: '', members: [] };

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

  /* 🔴 v2.43.0（ゆうた指定 2026-08-19）「まとめて表示」＝ PitFlow・MHS の付箋も一緒に並べる。
     ⚠ `boardNotes` は **CarFlow 自身の付箋の配列（書く用）**。ここに よその付箋を混ぜないこと。
     ⚠ 読む時は `_all()`／1件引く時は `_find()` を通す。 */
  function _all() {
    const mine = boardNotes || [];
    if (!window.CFNoteAll || !CFNoteAll.isOn()) return mine;
    return mine.concat(CFNoteAll.foreign());
  }
  function _find(id) { return _all().find(x => x && x.id === id) || null; }
  function _foreign(n) { return !!(window.CFNoteAll && CFNoteAll.isForeign(n)); }
  /* よその付箋にできるのは「返信」と「チェック」だけ（ゆうた指定）。編集・消去・並び替えは止める。 */
  function _denyForeign(n) {
    if (!_foreign(n)) return false;
    _toast('まとめて表示中です。' + (window.CFNoteAll ? CFNoteAll.labelOf(n) : 'よそのアプリ') + 'の付箋は、そのアプリで直してください');
    return true;
  }
  /* 保存先は付箋の出どころで変わる。**よその付箋を CarFlow の boardNotes に書かない。** */
  function _saveNote(note) {
    if (_foreign(note) && window.CFNoteAll) return new Promise(function (res) { CFNoteAll.save(note, res); });
    if (window.dbBoardNotes) return Promise.resolve(window.dbBoardNotes.saveBoardNote(note));
    return Promise.resolve();
  }

  // v1.7.6: タッチデバイス判定（iPhone/Androidなど）
  function _isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
  }
  // v2.19.4: 本人判定は「担当割当に保存されるID」と同じ基準（CoreFlow名簿の uid/docId）に揃える。
  //   付箋の担当(memberUids)は _staffCache の (uid || docId) で保存されるため、自分チェックの
  //   本人判定も currentStaff.uid（= portalMembers の uid || docId）を優先する。
  //   旧メンバーは currentStaff.uid == 認証uid なので従来どおり。CoreFlowで後から追加した人
  //   （uidフィールド未設定でdocId基準）でも担当割当と一致し、自分チェックが出るようになる。
  function _myUid() {
    const st = window.fb && window.fb.currentStaff;
    if (st && st.uid) return st.uid;
    return window.fb && window.fb.currentUser && window.fb.currentUser.uid;
  }
  function _newId() { return 'bn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // v2.13.0: シークレット付箋判定。
  //   制作者が「自分ひとりだけ」を担当者に選んだ付箋 ＝ 本人だけに見えるシークレット。
  //   複数人を選んでいる場合は（自分が含まれていても）通常の付箋。担当なしも通常。
  //   保存済みの secret フラグがあればそれを優先しつつ、無い既存付箋は担当構成から判定する。
  function _isSecretNote(note) {
    if (!note) return false;
    const m = Array.isArray(note.memberUids) ? note.memberUids : [];
    return m.length === 1 && !!note.authorUid && m[0] === note.authorUid;
  }
  // v2.12.0: 返信ID
  function _newReplyId() { return 'rep_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  // 付箋の作成時刻(ms)。数値／Firestore Timestamp（旧付箋＝serverTimestampで保存）／id復元 の順で解決
  function _noteCreatedMs(note) {
    const c = note && note.createdAt;
    if (typeof c === 'number' && isFinite(c)) return c;
    if (c && typeof c === 'object') {
      if (typeof c.toMillis === 'function') return c.toMillis();           // Firestore Timestamp
      if (typeof c.seconds === 'number')  return c.seconds * 1000;          // {seconds,nanoseconds}
      if (typeof c._seconds === 'number') return c._seconds * 1000;
    }
    const mm = /^bn_([0-9a-z]{8})/i.exec((note && note.id) || '');          // それも無ければ id から復元
    if (mm) { const ms = parseInt(mm[1], 36); if (ms > 1.4e12 && ms < 4e12) return ms; }
    return null;
  }
  // 作成日時を「6/8 14:30」形式（年なし・時分0埋め）に
  function _fmtCreated(ms) {
    if (ms == null) return '';
    const d = new Date(ms); if (isNaN(d.getTime())) return '';
    const p = n => (n < 10 ? '0' : '') + n;
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // v2.12.0: 返信の時刻表示（M/D HH:MM）
  function _formatReplyTime(ms) {
    if (!ms) return '';
    try {
      const d = new Date(ms);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
    } catch (e) { return ''; }
  }

  // v2.12.0: 返信を削除できるか（自分の返信 or admin/manager）
  function _canDeleteReply(reply) {
    if (!reply) return false;
    const myUid = _myUid();
    if (reply.uid && myUid && reply.uid === myUid) return true;
    const role = window.fb && window.fb.currentStaff && window.fb.currentStaff.role;
    return role === 'admin' || role === 'manager';
  }

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

  // 本文中の管理番号（例 KM-0100）を車両詳細リンクに（v1.7.0〜）。
  //   v2.7.2: 表記ゆれ吸収のロジックを helpers.js の linkifyCarNums() に共通化。
  //           付箋・操作ログとも全く同じルールでリンク化される。
  function _linkifyCarIds(text) {
    if (!text) return '';
    if (typeof linkifyCarNums === 'function') return linkifyCarNums(text);
    return _esc(text); // フォールバック（通常は到達しない）
  }

  /* v2.35.0：付箋の担当は【CoreMembers 全員】から選ぶ。
     🔴 CarFlow にログインしない人（アルバイト・回送要員・整備部の一部）も
        伝達の相手として名前を選べないと困るため。車両の担当など他の場所は今までどおり。 */
  async function _loadStaffOnce() {
    if (_staffCache) return _staffCache;
    if (!window.dbStaff) return [];
    const load = window.dbStaff.loadAllMembers || window.dbStaff.loadAllStaff;
    if (!load) return [];
    try { _staffCache = await load.call(window.dbStaff); return _staffCache; }
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

  /* 🔴 v2.40.0（ゆうた指定 2026-08-18）返信は **全アプリ共通の部品**（_shared/coreflow-note-reply.js）に寄せた。
     　 「通常の付箋で返信が入れられるように。**回覧でも返信を入れられるように**したい。
     　　 またこれは**ピット、MHS、CarFlow 全部の付箋に実装**して」
     ⚠ **回覧かどうかで出し分けない。** v2.39 まではここで `circulate` を弾いて、回覧には返信を出していなかった。
     ⚠ 本文の車両リンク化（KM0354 → 車両へ飛ぶ）は残す＝部品に `formatText` で渡している。
     ⚠ 部品が読み込めていない時のための保険だけ残してある（下の _repliesFallback）。 */
  function _renderReplies(note) {
    if (window.CFNoteReply) return CFNoteReply.html(note);
    return _repliesFallback(note);
  }
  function _repliesFallback(note) {
    const replies = (note && Array.isArray(note.replies)) ? note.replies : [];
    if (replies.length === 0) return '';
    const rows = replies.map(r => {
      const av = _renderMemberAvatar(r.uid, 22);
      const time = _formatReplyTime(r.at);
      return `<div class="bn-reply">
        <span class="bn-reply-av">${av}</span>
        <div class="bn-reply-bubble">
          <div class="bn-reply-text">${_linkifyCarIds(r.text || '')}</div>
          ${time ? `<span class="bn-reply-time">${_esc(time)}</span>` : ''}
        </div>
      </div>`;
    }).join('');
    return `<div class="bn-replies">${rows}</div>`;
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

    // v2.13.0: シークレット付箋は作成者本人以外には出さない（ミーティング画面はこの描画結果を複製するので一括で隠れる）
    const _myU = _myUid();
    /* 🔴 v2.43.0 出すのは _all()＝自分の付箋＋（まとめて表示ONなら）よそのアプリの付箋。
       ⚠ **よその付箋は後ろにまとめる**＝CarFlow の盤の順番が崩れない。 */
    const cards = _all()
      .filter(n => !(_isSecretNote(n) && n.authorUid !== _myU))
      .sort((a, b) => {
        const fa = _foreign(a) ? 1 : 0, fb2 = _foreign(b) ? 1 : 0;
        if (fa !== fb2) return fa - fb2;
        return (a.order || 0) - (b.order || 0);
      });
    // v1.7.1: 1個の付箋がエラーでも全体が壊れないよう try/catch で個別保護
    const cardsHtml = cards.length === 0
      ? '<div class="bn-empty">付箋はまだありません。「＋ 付箋を追加」から最初の1枚を作りましょう。</div>'
      : cards.map(n => {
          try { return _renderNoteCard(n, canMut); }
          catch (err) {
            console.error('[board-notes] render error for note', n && n.id, err);
            return `<div class="bn-card bn-color-yellow"><div class="bn-title">${ic('warn','⚠',14)} 表示エラー（${_esc(n && n.id || '?')}）</div></div>`;
          }
        }).join('');

    const html = `
      <div class="bn-header">
        <div class="bn-header-left">
          <span class="bn-header-icon">${ic('pin','📌',14)}</span>
          <span class="bn-header-title">全体タスク</span>
          <div class="bn-label-chips">${labelChipsHtml}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${_allBtnHtml()}
          ${canMut ? `<button class="btn-sm btn-primary" onclick="openBoardNoteModal(null)">＋ 付箋を追加</button>` : ''}
        </div>
      </div>
      <div class="bn-grid"
           ondragover="boardNoteOnDragOver(event)"
           ondrop="boardNoteOnDropArea(event)">${cardsHtml}</div>
    `;
    targets.forEach(t => { t.innerHTML = html; });
  }
  window.renderBoardNotes = renderBoardNotes;

  /* 🔴 v2.43.0（ゆうた指定 2026-08-19）「まとめて表示」のボタン。
     🗣「新規付箋の横にボタン。押すと MHS・PitFlow・CarFlow 全アプリの付箋が集合して一斉表示。
     　　もう一度押すか、ビューを切り替えたらデフォルトに戻る。**ボタンは新規より目立たない形がいい**」
     ⚠ 中身は _shared/coreflow-note-all.js。ここは呼ぶだけ。 */
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
    const createdTxt = _fmtCreated(_noteCreatedMs(note));   // 作成日時（点線の右端に出す）
    // v1.7.30: メンバーアイコンの並びは staff の sortOrder に従う
    const sortedMemberUids = _sortUidsBySortOrder(note.memberUids || []);
    const memberAvatars = sortedMemberUids.map(uid => _renderMemberAvatar(uid, 22)).join('');

    const labelText = (boardLabels && boardLabels[color]) || '';
    // v2.13.0: シークレット付箋（自分ひとり担当）はタイトル横に「🔒 自分用」バッジ
    const isSecret = _isSecretNote(note);
    const secretBadge = isSecret
      ? `<span class="bn-secret-badge" title="あなただけに見える付箋です（他の人の画面には出ません）">${ic('lock','🔒',15)} 自分用</span>`
      : '';
    // v1.7.7: タイトルにも car-ID 自動リンクを適用
    const titleHtml = note.title ? _linkifyCarIds(note.title) : '<span class="bn-empty-title">(無題)</span>';
    const bodyHtml = _linkifyCarIds(note.body || '');
    const imgHtml = note.imageURL
      ? `<img class="bn-img" src="${_esc(note.imageURL)}" alt="" onclick="event.stopPropagation();openImagePreview('${_esc(note.imageURL)}')">`
      : (note.pdfURL
        ? `<a class="bn-pdf" href="${_esc(note.pdfURL)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="${_esc(note.pdfName || 'PDF')}">${ic('fileText','📄',16)} ${_esc(note.pdfName || 'PDF')}</a>`
        : '');
    const deadlineHtml = note.deadline
      ? `<div class="bn-deadline ${overdue ? 'is-overdue' : ''}">${overdue ? ''+ic('siren','🚨',16)+' ' : '⏰ '}${_esc(_formatDeadline(note.deadline))}</div>`
      : '';

    // v1.7.6: タッチデバイスでは draggable=true を付けない（kebab タップを邪魔しない）
    /* 🔴 v2.43.0 よその付箋は**並び替えできない**（順番はそのアプリのものだから） */
    const dragAttrs = (canMut && !_isTouchDevice() && !_foreign(note))
      ? `draggable="true"
           ondragstart="boardNoteOnDragStart(event, '${_esc(note.id)}')"
           ondragover="boardNoteOnDragOver(event)"
           ondrop="boardNoteOnDrop(event, '${_esc(note.id)}')"
           ondragend="boardNoteOnDragEnd(event)"`
      : '';
    // v2.2.7: 自動付箋判定（タスクメモから自動生成された付箋）
    // v2.2.8: バッジは footer 内の制作者の左側にインライン配置（タイトルかぶり解消）
    const isAuto = !!(note.autoSource && note.autoSource.type === 'taskMemo');
    const autoBadge = isAuto
      ? `<span class="bn-auto-badge" title="自動付箋（タスクメモから生成）">${ic('robot','🤖',16)} 自動</span>`
      : '';

    // v2.10.0: 回覧（circulate）は担当各自が「済」を入れる方式
    const isCirculate = note.noteType === 'circulate';
    let membersHtml, circRow = '';
    if (isCirculate) {
      const doneSet = new Set(note.doneByUids || []);
      const uids = note.memberUids || [];
      const notDone = _sortUidsBySortOrder(uids.filter(u => !doneSet.has(u)));
      const doneU   = _sortUidsBySortOrder(uids.filter(u => doneSet.has(u)));
      const ordered = notDone.concat(doneU); // 未対応を前に
      membersHtml = ordered.length
        ? ordered.map((uid, i) => {
            const isD = doneSet.has(uid);
            const av = _renderMemberAvatar(uid, 22);
            const check = isD
              ? `<span style="position:absolute;right:-3px;bottom:-3px;width:13px;height:13px;border-radius:50%;background:#9ca3af;color:#fff;font-size:9px;line-height:13px;text-align:center;border:1.5px solid var(--bg2)">${ic('check','✓',14)}</span>`
              : '';
            return `<span style="position:relative;display:inline-block;margin-left:${i ? -6 : 0}px;z-index:${isD ? 1 : 2}"><span style="display:inline-block;opacity:${isD ? 0.4 : 1}">${av}</span>${check}</span>`;
          }).join('')
        : '<span class="bn-no-member">担当なし</span>';
      const total = uids.length;
      const dn = uids.filter(u => doneSet.has(u)).length;
      const typeChip = `<span style="font-size:10px;padding:2px 7px;border-radius:7px;background:rgba(99,102,241,.18);color:#a5b4fc;border:1px solid rgba(99,102,241,.35)">${ic('refresh','🔁',15)} 回覧 ${dn}/${total}</span>`;
      let selfBtn = '';
      const myUid = _myUid();
      // v2.10.1: 完成（done）後でも自分の確認を取り消せるよう、!done 条件を外す
      if (myUid && uids.includes(myUid)) {
        const iAmDone = doneSet.has(myUid);
        selfBtn = `<button class="btn-sm" onclick="event.stopPropagation();markCirculationSelf('${_esc(note.id)}')" style="font-size:11px;padding:3px 8px;${iAmDone ? 'color:var(--text3)' : ''}">${iAmDone ? '確認済み（取消）' : ''+ic('check','✓',14)+' 自分が確認'}</button>`;
      }
      circRow = `<div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap">${typeChip}${selfBtn}</div>`;
    } else {
      membersHtml = memberAvatars || '<span class="bn-no-member">担当なし</span>';
    }

    return `
      <div class="bn-card bn-color-${color} ${done ? 'is-done' : ''} ${overdue ? 'is-overdue' : ''} ${isAuto ? 'is-auto' : ''} ${_foreign(note) ? 'cfa-foreign' : ''}"
           data-note-id="${_esc(note.id)}"
           ${done ? 'onclick="bnToggleDonePeek(event)"' : ''}
           ${dragAttrs}>
        ${done ? '<div class="bn-done-stamp">済</div>' : ''}
        ${labelText ? `<div class="bn-card-label">${_esc(labelText)}</div>` : ''}
        ${canMut ? `
          <button class="bn-menu-btn" onclick="event.stopPropagation();openBoardNoteActions('${_esc(note.id)}')" title="メニュー">⋮</button>` : ''}

        <div class="bn-title">${(window.CFNoteAll ? CFNoteAll.badgeHtml(note) : '')}${secretBadge}${titleHtml}</div>
        ${imgHtml}
        ${bodyHtml ? `<div class="bn-body">${bodyHtml}</div>` : ''}
        ${deadlineHtml}
        ${circRow}
        ${/* 🔴 返信は「回覧の確認」の下。確認ボタンより上に置くと、回覧の車が押す所を見失う */''}
        ${_renderReplies(note)}

        <div class="bn-footer">
          <div class="bn-members">${membersHtml}</div>
          <div class="bn-foot-right">
            ${createdTxt ? `<div class="bn-created">${_esc(createdTxt)}</div>` : ''}
            <div class="bn-author">
              ${autoBadge}
              ${authorAv}
              <span class="bn-author-name">${_esc(authorName)}</span>
            </div>
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
    const note = _find(noteId);
    const t = document.getElementById('bn-actionsheet-title');
    if (t) t.textContent = note && note.title ? note.title : '付箋メニュー';
    // v2.10.1: 済なら「未済に戻す」、未済なら「済にする」を表示
    const isDone = !!(note && note.status === 'done');
    const dEl = document.getElementById('bn-action-done');
    const uEl = document.getElementById('bn-action-undone');
    if (dEl) dEl.style.display = isDone ? 'none' : '';
    if (uEl) uEl.style.display = isDone ? '' : 'none';
    /* 🔴 v2.40.0 **回覧でも返信できる**（ゆうた指定）。v2.39 まではここで隠していた。
       ⚠ 「済にする／戻す」は回覧では出さないまま＝回覧の完了は各自の「✓ 自分が確認」で決まる。 */
    /* 🔴 v2.43.0 まとめて表示中の「よその付箋」にできるのは返信とチェックだけ（ゆうた指定）。
       ⚠ ボタンを消すだけにしない＝実行する関数の中でも _denyForeign で止めている。 */
    const isFgn = _foreign(note);
    const eEl = document.getElementById('bn-action-edit');
    const xEl = document.getElementById('bn-action-delete');
    if (eEl) eEl.style.display = isFgn ? 'none' : '';
    if (xEl) xEl.style.display = isFgn ? 'none' : '';
    const rEl = document.getElementById('bn-action-reply');
    if (rEl) rEl.style.display = '';
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
    if (!id) return;
    // v2.2.7: 自動付箋は編集モーダルを開かず、車両詳細を開く（タスクメモが元データ）
    const note = _find(id);
    if (note && _denyForeign(note)) return;
    if (note && note.autoSource && note.autoSource.type === 'taskMemo') {
      if (typeof openDetail === 'function') openDetail(note.autoSource.carId);
      if (typeof showToast === 'function') showToast('自動付箋は車両詳細のタスクメモから編集してください', 'CF-2001');
      return;
    }
    openBoardNoteModal(id);
  };
  window.bnActionDone = function () {
    const id = _activeMenuNoteId;
    closeBoardNoteActions();
    if (id) markBoardNoteDone(id);
  };
  // v2.10.1: 済を取り消して未済に戻す
  window.bnActionUndone = function () {
    const id = _activeMenuNoteId;
    closeBoardNoteActions();
    if (id) markBoardNoteUndone(id);
  };
  window.bnActionDelete = function () {
    const id = _activeMenuNoteId;
    closeBoardNoteActions();
    if (id) deleteBoardNoteFromCard(id);
  };
  // v2.12.0: 返信する（実行型のみ）
  window.bnActionReply = function () {
    const id = _activeMenuNoteId;
    closeBoardNoteActions();
    if (id) openBoardNoteReply(id);
  };

  // 旧 toggleNoteMenu の互換用 stub（古いキャッシュ対策）
  window.toggleNoteMenu = function (noteId) { openBoardNoteActions(noteId); };

  // -----------------------------------------
  // v2.12.0: 返信モーダル＋送信＋削除
  // -----------------------------------------
  let _activeReplyNoteId = null;

  function openBoardNoteReply(noteId) {
    if (!_canMutate()) { _toast('閲覧専用ロールでは返信できません'); return; }
    const note = _find(noteId);
    if (!note) return;
    _activeReplyNoteId = noteId;
    const t = document.getElementById('bn-reply-note-title');
    if (t) t.textContent = note.title || note.body || '付箋';
    const ta = document.getElementById('bn-reply-text');
    if (ta) ta.value = '';
    const m = document.getElementById('modal-bn-reply');
    if (m) m.classList.add('open');
    setTimeout(() => { if (ta) ta.focus(); }, 50);
  }
  window.openBoardNoteReply = openBoardNoteReply;

  function closeBoardNoteReply() {
    const m = document.getElementById('modal-bn-reply');
    if (m) m.classList.remove('open');
    _activeReplyNoteId = null;
  }
  window.closeBoardNoteReply = closeBoardNoteReply;

  async function submitBoardNoteReply() {
    if (!_canMutate()) { _toast('閲覧専用ロールでは返信できません'); return; }
    const id = _activeReplyNoteId;
    const n = _find(id);
    if (!n) { closeBoardNoteReply(); return; }
    const ta = document.getElementById('bn-reply-text');
    const text = ((ta && ta.value) || '').trim();
    if (!text) { _toast('返信内容を入力してください'); return; }
    if (!Array.isArray(n.replies)) n.replies = [];
    n.replies.push({ id: _newReplyId(), uid: _myUid() || null, text: text, at: Date.now() });
    try { await _saveNote(n); } catch (e) { return; }
    if (typeof addLog === 'function') {
      const short = text.length > 20 ? text.slice(0, 20) + '…' : text;
      addLog(null, `付箋「${n.title || '(無題)'}」に返信しました：${short}`);
    }
    closeBoardNoteReply();
    renderBoardNotes();
  }
  window.submitBoardNoteReply = submitBoardNoteReply;

  async function deleteBoardNoteReply(noteId, replyId) {
    const n = _find(noteId);
    if (!n || !Array.isArray(n.replies)) return;
    const r = n.replies.find(x => x.id === replyId);
    if (!r) return;
    if (!_canDeleteReply(r)) { _toast('自分の返信だけ消せます'); return; }
    if (!confirm('この返信を消しますか？')) return;
    n.replies = n.replies.filter(x => x.id !== replyId);
    try { await _saveNote(n); } catch (e) { return; }
    if (typeof addLog === 'function') addLog(null, `付箋「${n.title || '(無題)'}」の返信を消しました`);
    renderBoardNotes();
  }
  window.deleteBoardNoteReply = deleteBoardNoteReply;

  // v2.12.1: 済の付箋をクリック（タップ）したら「済」スタンプを薄く透かして中身を読めるように。
  //          もう一度クリックで元に戻る。⋮ボタン・画像・KMリンク・返信削除のクリックは対象外。
  window.bnToggleDonePeek = function (e) {
    try {
      const tgt = e && e.target;
      if (tgt && tgt.closest && tgt.closest('a,button,.bn-carlink,.bn-img,.bn-reply-del')) return;
      const card = e && e.currentTarget;
      if (card) card.classList.toggle('bn-peek');
    } catch (err) { /* noop */ }
  };

  // -----------------------------------------
  // 操作
  // -----------------------------------------
  async function markBoardNoteDone(noteId) {
    const n = _find(noteId);
    if (!n) return;
    n.status = 'done';
    n.doneAt = window.fb.serverTimestamp();
    // v1.8.82: 対応者uidを記録（LINE通知の「対応した人」名に使用）
    n.doneByUid = _myUid() || null;
    try { await _saveNote(n); } catch (e) { return; }
    if (typeof addLog === 'function') addLog(null, `付箋「${n.title || '(無題)'}」を済にしました`);
    renderBoardNotes();
  }
  window.markBoardNoteDone = markBoardNoteDone;

  // v2.10.1: 「済」を取り消して未済（open）に戻す。間違って済にした時用。
  async function markBoardNoteUndone(noteId) {
    const n = _find(noteId);
    if (!n) return;
    if (!_canMutate()) { _toast('閲覧専用ロールでは操作できません'); return; }
    n.status = 'open';
    n.doneAt = null;
    n.doneByUid = null;
    // 回覧付箋は全員の確認状態もリセット（もう一度各自で確認し直す）
    if (n.noteType === 'circulate') n.doneByUids = [];
    try { await _saveNote(n); } catch (e) { return; }
    if (typeof addLog === 'function') addLog(null, `付箋「${n.title || '(無題)'}」を未済に戻しました`);
    renderBoardNotes();
  }
  window.markBoardNoteUndone = markBoardNoteUndone;

  // v2.10.0: 回覧付箋で「自分が確認した」を記録（トグル）。担当全員が済んだら付箋を完成（status=done）に
  async function markCirculationSelf(noteId) {
    const n = _find(noteId);
    if (!n) return;
    if (!_canMutate()) { _toast('閲覧専用ロールでは操作できません'); return; }
    const uid = _myUid();
    if (!uid) return;
    if (!Array.isArray(n.doneByUids)) n.doneByUids = [];
    const i = n.doneByUids.indexOf(uid);
    if (i >= 0) n.doneByUids.splice(i, 1);   // 取消
    else n.doneByUids.push(uid);             // 確認
    // 担当全員が済んだら完成
    const uids = n.memberUids || [];
    const allDone = uids.length > 0 && uids.every(u => n.doneByUids.includes(u));
    if (allDone) {
      n.status = 'done';
      n.doneAt = window.fb.serverTimestamp();
      n.doneByUid = uid;
    } else {
      n.status = 'open';
      n.doneAt = null;
    }
    try { await _saveNote(n); } catch (e) { return; }
    if (typeof addLog === 'function') {
      addLog(null, allDone
        ? `回覧付箋「${n.title || '(無題)'}」が全員確認済みになりました`
        : `回覧付箋「${n.title || '(無題)'}」を確認しました`);
    }
    renderBoardNotes();
  }
  window.markCirculationSelf = markCirculationSelf;

  async function deleteBoardNoteFromCard(noteId) {
    const n = _find(noteId);
    if (!n) return;
    if (_denyForeign(n)) return;
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
  // v2.28.0: opts（任意）＝ { title:プリフィルするタイトル（新規時のみ）, over:車両モーダル等の上に重ねて開く }
  async function openBoardNoteModal(noteId, opts) {
    if (!_canMutate()) { _toast('閲覧専用ロールでは作成できません'); return; }
    await _loadStaffOnce();
    opts = opts || {};

    _editor.editingId = noteId || null;
    _editor.photoData = null;
    _editor.photoChanged = false;
    _editor.attachType = '';
    _editor.attachName = '';
    _editor.members = [];

    const note = noteId ? (boardNotes || []).find(x => x.id === noteId) : null;
    const isNew = !note;

    document.getElementById('bn-modal-title').textContent = isNew ? '付箋を追加' : '付箋を編集';
    document.getElementById('bn-inp-title').value = note ? (note.title || '') : (opts.title || '');
    document.getElementById('bn-inp-body').value = note ? (note.body || '') : '';
    document.getElementById('bn-inp-deadline').value = note ? (note.deadline || '') : '';
    _editor.members = note ? (note.memberUids || []).slice() : [];

    // 色ラジオ
    const initialColor = note ? (note.color || 'yellow') : 'yellow';
    NOTE_COLORS.forEach(c => {
      const r = document.getElementById('bn-color-' + c);
      if (r) r.checked = (c === initialColor);
    });

    // v2.10.0: 種類（実行／回覧）ラジオ
    const initialType = (note && note.noteType === 'circulate') ? 'circulate' : 'execute';
    const rExec = document.getElementById('bn-type-execute');
    const rCirc = document.getElementById('bn-type-circulate');
    if (rExec) rExec.checked = (initialType === 'execute');
    if (rCirc) rCirc.checked = (initialType === 'circulate');

    // 添付プレビュー（画像 / PDF）
    _renderPhotoPreview(note);

    // メンバー選択
    _renderMemberPicker();

    // v2.28.0: 車両詳細など他のモーダルの上から開く時は重なり順を上げる
    //          （全 .overlay は z-index:100 で DOM順依存。付箋モーダルは詳細モーダルより前にあるため明示的に上げる）
    const _ov = document.getElementById('modal-board-note');
    _ov.style.zIndex = opts.over ? '120' : '';
    _ov.classList.add('open');
  }
  window.openBoardNoteModal = openBoardNoteModal;

  // v1.8.0: リアルタイム同期用 — 「いま編集モーダルで開いている付箋ID」を外部公開
  window.getEditingBoardNoteId = function () { return _editor.editingId; };

  function closeBoardNoteModal() {
    const _ov = document.getElementById('modal-board-note');
    _ov.classList.remove('open');
    _ov.style.zIndex = ''; // v2.28.0: over で上げた重なり順をリセット
    _editor.editingId = null;
    _editor.photoData = null;
    _editor.photoChanged = false;
    _editor.attachType = '';
    _editor.attachName = '';
  }
  window.closeBoardNoteModal = closeBoardNoteModal;

  // 画像のプレビューHTML
  function _imgPreviewHtml(src) {
    return `<img src="${_esc(src)}" alt="" style="max-width:100%;max-height:200px;border-radius:6px"><br>
      <button class="btn-sm" onclick="bnRemovePhoto()" style="margin-top:6px">削除</button>`;
  }
  // PDFのプレビューHTML（サムネは出さずチップ表示。href があれば開けるリンクに）
  function _pdfPreviewHtml(name, href) {
    const label = _esc(name || 'PDF');
    const inner = href
      ? `<a href="${_esc(href)}" target="_blank" rel="noopener" style="text-decoration:none">${ic('fileText','📄',16)} ${label}</a>`
      : `📄 ${label}`;
    return `<div class="bn-pdf-chip" style="display:inline-flex;align-items:center;gap:6px;background:var(--bg3,#f1efe8);border:1px solid var(--border,#ccc);border-radius:6px;padding:6px 10px;font-size:12px;max-width:100%">${inner}</div><br>
      <button class="btn-sm" onclick="bnRemovePhoto()" style="margin-top:6px">削除</button>`;
  }
  // 既存の添付（画像 or PDF）を編集モーダルに表示
  function _renderPhotoPreview(note) {
    const wrap = document.getElementById('bn-inp-photo-preview');
    if (!wrap) return;
    if (note && note.imageURL) {
      wrap.innerHTML = _imgPreviewHtml(note.imageURL);
    } else if (note && note.pdfURL) {
      wrap.innerHTML = _pdfPreviewHtml(note.pdfName, note.pdfURL);
    } else {
      wrap.innerHTML = '';
    }
  }

  // 画像 / PDF 選択時
  window.bnOnPhotoChange = async function (input) {
    const file = input && input.files && input.files[0];
    if (!file) return;
    const isPdf = (file.type === 'application/pdf') || /\.pdf$/i.test(file.name || '');
    _editor.photoData = file;         // 保存時に使う File
    _editor.photoChanged = true;
    _editor.attachType = isPdf ? 'pdf' : 'image';
    _editor.attachName = file.name || '';
    const wrap = document.getElementById('bn-inp-photo-preview');
    if (isPdf) {
      if (wrap) wrap.innerHTML = _pdfPreviewHtml(file.name, '');   // アップ前なので開けない
    } else {
      const reader = new FileReader();
      reader.onload = e => { if (wrap) wrap.innerHTML = _imgPreviewHtml(e.target.result); };
      reader.readAsDataURL(file);
    }
  };

  window.bnRemovePhoto = function () {
    _editor.photoData = null;
    _editor.photoChanged = true; // 「削除する」意思を保持
    _editor.attachType = '';
    _editor.attachName = '';
    const wrap = document.getElementById('bn-inp-photo-preview');
    if (wrap) wrap.innerHTML = '';
  };

  // v2.13.0: 編集中の担当構成だと「シークレットになるか」を判定して案内を出し入れ
  function _editorWouldBeSecret() {
    const m = _editor.members || [];
    let authorUid = _myUid();
    if (_editor.editingId) {
      const note = (boardNotes || []).find(x => x.id === _editor.editingId);
      if (note && note.authorUid) authorUid = note.authorUid;
    }
    return m.length === 1 && !!authorUid && m[0] === authorUid;
  }
  function _updateSecretHint() {
    const el = document.getElementById('bn-secret-hint');
    if (!el) return;
    el.style.display = _editorWouldBeSecret() ? '' : 'none';
  }

  function _renderMemberPicker() {
    const wrap = document.getElementById('bn-inp-members');
    if (!wrap) return;
    const list = _staffCache || [];

    // v2.10.0: グループ一括選択ボタン（全員／クリア／各グループ）
    const quick = document.getElementById('bn-group-quick');
    if (quick) {
      const groups = (typeof memberGroups !== 'undefined' && Array.isArray(memberGroups)) ? memberGroups : [];
      const btn = (label, onclick, extra) => `<button type="button" class="btn-sm" style="font-size:11px;padding:3px 8px;${extra || ''}" onclick="${onclick}">${label}</button>`;
      let qhtml = btn('全員', 'bnQuickSelectAll()')
                + btn('クリア', 'bnQuickClear()', 'color:var(--text3)');
      groups.forEach(g => {
        qhtml += btn('👥 ' + _esc(g.name), `bnQuickSelectGroup('${_esc(g.id)}')`);
      });
      quick.innerHTML = qhtml;
    }

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
    _updateSecretHint();
  }

  // v2.10.0: グループ一括選択
  function _activeStaffUids() {
    return (_staffCache || []).filter(s => s.active !== false).map(s => s.uid || s.id);
  }
  window.bnQuickSelectAll = function () {
    _editor.members = _activeStaffUids();
    _renderMemberPicker();
  };
  window.bnQuickClear = function () {
    _editor.members = [];
    _renderMemberPicker();
  };
  window.bnQuickSelectGroup = function (groupId) {
    // v2.18.1: グループ判定をid→名前ベースに変更（CoreFlow一本化）
    //   旧 staff.groupId（CarFlow memberGroups の id）から
    //   新 staff.group（CoreFlow portalMembers.carflow.group の名前）へ移行。
    //   ボタンは memberGroups の {id,name} で生成されているので、
    //   groupId から name を逆引きして、両方で比較する。
    const groups = (typeof memberGroups !== 'undefined' && Array.isArray(memberGroups)) ? memberGroups : [];
    const grpName = (groups.find(g => g.id === groupId) || {}).name || groupId;
    const inGroup = (_staffCache || [])
      .filter(s => s.active !== false && (s.group === grpName || s.groupId === groupId))
      .map(s => s.uid || s.id);
    if (!inGroup.length) { _toast('このグループに所属するメンバーがいません'); return; }
    // 既に全員入っていればトグルで外す、そうでなければ追加
    const allIn = inGroup.every(u => _editor.members.includes(u));
    if (allIn) {
      _editor.members = _editor.members.filter(u => !inGroup.includes(u));
    } else {
      inGroup.forEach(u => { if (!_editor.members.includes(u)) _editor.members.push(u); });
    }
    _renderMemberPicker();
  };

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
    _updateSecretHint();
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

    // v2.10.0: 種類（実行／回覧）
    const rCirc = document.getElementById('bn-type-circulate');
    const noteType = (rCirc && rCirc.checked) ? 'circulate' : 'execute';

    if (!title && !body) { _toast('タイトルか本文のどちらかは入力してください'); return; }

    const isNew = !_editor.editingId;
    let note = isNew
      ? { id: _newId(), createdAt: Date.now(), title, body, color, noteType, deadline: deadline || null, memberUids: _editor.members.slice(), doneByUids: [], authorUid: _myUid(), status: 'open', order: _maxOrder() + 1, imageURL: '', pdfURL: '', pdfName: '' }
      : (boardNotes || []).find(x => x.id === _editor.editingId);
    if (!note) { _toast('対象の付箋が見つかりません'); return; }

    if (!isNew) {
      note.title = title;
      note.body = body;
      note.color = color;
      note.noteType = noteType;
      note.deadline = deadline || null;
      note.memberUids = _editor.members.slice();
      if (!Array.isArray(note.doneByUids)) note.doneByUids = [];
    }

    // v2.13.0: シークレット判定をフラグとして保存（サーバ側のLINE通知抑止などで使う）
    note.secret = _isSecretNote(note);

    // 添付処理（画像 または PDF。1つの付箋に1点）
    if (_editor.photoChanged) {
      const ds = window.dbStorage || {};
      try {
        if (_editor.photoData && _editor.attachType === 'pdf') {
          // PDF を上げる → 画像があれば消す
          if (ds.uploadBoardNotePdf) {
            const url = await ds.uploadBoardNotePdf(note.id, _editor.photoData);
            note.pdfURL = url || '';
            note.pdfName = _editor.attachName || 'PDF';
          }
          if (note.imageURL && ds.deleteBoardNoteImage) { await ds.deleteBoardNoteImage(note.id).catch(()=>{}); }
          note.imageURL = '';
        } else if (_editor.photoData) {
          // 画像を上げる → PDFがあれば消す
          if (ds.uploadBoardNoteImage) {
            const url = await ds.uploadBoardNoteImage(note.id, _editor.photoData);
            note.imageURL = url || '';
          }
          if (note.pdfURL && ds.deleteBoardNotePdf) { await ds.deleteBoardNotePdf(note.id).catch(()=>{}); }
          note.pdfURL = ''; note.pdfName = '';
        } else {
          // 削除指示（両方消す）
          if (ds.deleteBoardNoteImage) { await ds.deleteBoardNoteImage(note.id).catch(()=>{}); }
          if (ds.deleteBoardNotePdf)   { await ds.deleteBoardNotePdf(note.id).catch(()=>{}); }
          note.imageURL = ''; note.pdfURL = ''; note.pdfName = '';
        }
      } catch (e) {
        console.error('[board-notes] attachment upload failed', e);
        _toast((_editor.attachType === 'pdf' ? 'PDF' : '画像') + 'のアップロードに失敗しました');
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

  /* =========================================
     🔴 v2.40.0 付箋の返信＝全アプリ共通の部品（_shared/coreflow-note-reply.js）につなぐ。
     ⚠ **アプリごとに違うところだけを関数で渡す。** 部品の中に CarFlow の事情を書かない。
        ・「自分」    … 名簿の uid（_myUid＝担当に保存されるIDと同じ物差し・v2.19.4）
        ・保存        … dbBoardNotes.saveBoardNote（Firestore の boardNotes へ1件保存）
        ・消せる人    … 自分の返信 or admin/manager（_canDeleteReply・今までどおり）
        ・書ける人    … 閲覧専用ロールは書けない（_canMutate・今までどおり）
        ・本文        … KM番号を車両リンクにする（_linkifyCarIds）
     ========================================= */
  if (window.CFNoteReply) {
    CFNoteReply.setup({
      getNote:    function (id) { return _find(id); },
      getMe:      function () { return _myUid(); },
      avatarHtml: function (uid, px) { return _renderMemberAvatar(uid, px); },
      formatText: function (t) { return _linkifyCarIds(t || ''); },
      canWrite:   function () { return _canMutate(); },
      canDelete:  function (r) { return _canDeleteReply(r); },
      /* 🔴 v2.43.0 まとめて表示中は、よその付箋への返信を**そのアプリの入れ物**へ書く（_saveNote が振り分ける） */
      save:       function (note, done) {
        _saveNote(note)
          .then(function () { if (done) done(); })
          .catch(function (e) { console.error('[board-notes] 返信の保存に失敗', e); _toast('返信を保存できませんでした'); });
      },
      rerender:   function () { renderBoardNotes(); },
      toast:      function (msg) { _toast(msg); },
      ask:        function (msg, cb) {
        if (window.UI && UI.confirm) UI.confirm(msg, { ok: '消す', danger: true }).then(function (y) { cb(!!y); });
        else cb(true);
      }
    });
  }

  /* =========================================
     🔴 v2.43.0 「まとめて表示」＝全アプリ共通の部品（_shared/coreflow-note-all.js）につなぐ。
     ⚠ 別のビューへ移ったら解除（switchView を包むだけ＝本体は触らない）。**持ち越さない。**
     ========================================= */
  if (window.CFNoteAll) {
    CFNoteAll.setup({
      self:     'carflow',
      db:       function () { return window.fb && window.fb.db; },
      /* 🔴 2026-08-19（ゆうた報告「PitFlow には出たが CarFlow には出ない」）
         ⚠ **CarFlow に `fb.company()` は無い。** PitFlow だけが持っているヘルパーで、
            CarFlow は `fb.db.collection('companies').doc(fb.currentCompanyId)` と自分で組み立てる
            （`db-board-notes.js` の `_col()` と同じ形）。
            そこを写し間違えて `fb.company()` を呼んでいたので、いつも null＝**ボタンが出なかった**。
         ⚠ アプリをまたぐ部品を足す時は、**そのアプリでの入口の作りを必ず確かめること。** */
      company:  function () {
        if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
        return window.fb.db.collection('companies').doc(window.fb.currentCompanyId);
      },
      /* ⚠ `currentUser` まで見ると、名簿の読み込み待ちでボタンが消えることがある。
         　 出す・出さないは「Firestore に繋がっていて、会社が決まっているか」だけで決める。 */
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

  console.log('[board-notes] ready');
})();
