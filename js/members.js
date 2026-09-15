// ========================================
//  CarFlow メンバー画面（js/members.js）
// ----------------------------------------
//  🔴🔴 **この画面は閲覧専用。操作ボタンは1つも出ない。**
      const isAdmin = false;             // 🔴 固定。人と権限は CoreFlow が唯一の正なので、ここからは触らせない
//     役割変更・グループ変更・招待・編集・無効化・削除は **描かれない。**
//     生きているのは **一覧の表示** と **並び替えの ▲▼**（`canSort`）だけ。
//
//  🔴 **人と権限は CoreFlow（メンバー管理）が唯一の正。** ここからは触らない。
//     2026-08 に CoreFlow へ一本化した時、ボタンを消す代わりに判定を塞いだ。
//
//  ⚠ **2026-09-11 に、そのせいで Claude が誤解した。**
//     ボタンを描くコードが残っていたので「出ている」と判断し、
//     「押すと必ず失敗する削除ボタンを外した」と報告した。**出ていなかった。**
//     → 同じ誤解を防ぐため、**開く道が無い処理21個を消した**（v2.58.0）。
//       消したもの＝招待5／グループ6／役割変更1／有効無効1／編集の窓7／削除1
//       中身は git の履歴に残っている。
//
//  ⚠ 消した処理のうち「編集の窓の保存」は、すでに廃止済みの仕組みを呼んでいて
//     **保存されないのに「更新しました」と出す**作りだった（出ていたら嘘をつく）。
// ========================================

// ========================================
// members.js (v1.5.6〜)
// メンバー画面：staff コレクション動的取得 + 招待UI + ロール変更/無効化
// ----------------------------------------
// 旧 dashboard.js の renderMembers を置き換え（v1.5.5 で動的化したものをさらに拡張）
// admin のみ表示される操作：
//   - 「+ メンバーを招待」ボタン
//   - 各メンバー行のロール変更プルダウン
//   - 各メンバー行の無効化／削除
//   - 招待中リストとキャンセル
// ========================================

// v1.5.7: 5ロール体制（worker = 作業員：詳細閲覧+チェック作業のみ）
const ROLE_LABELS = { admin: '管理者', manager: 'マネージャ', staff: 'スタッフ', worker: '作業員', viewer: '閲覧のみ' };
const ROLE_OPTIONS = ['admin', 'manager', 'staff', 'worker', 'viewer'];

// v1.7.29: 編集モーダル用のステート＋一覧キャッシュ
let _membersCache = [];
let _editMemberUid = null;
let _editMemberPendingPhotoBlob = null; // ファイル選択時に確保。保存ボタンで実アップロード
let _editMemberPendingPhotoPreview = null;
let _editMemberClearPhoto = false;
let _editMemberClearName = false;

function _isAdmin() {
  const s = window.fb && window.fb.currentStaff;
  return !!(s && s.role === 'admin');
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
}

// メンバー画面：renderMembers の v1.5.6 版（dashboard.js の旧版を上書き）
// v2.18.0：閲覧専用化。編集系（招待・ロール変更・編集・削除・無効化・並び替え・グループ）は撤去。
//          管理は CoreFlow（coreflow.kobayashi-motors.com）一本に集約。
async function renderMembers() {
  const list = document.getElementById('member-list');
  if (!list) return;

  // v2.18.0：管理者にも「CoreFlowへ」誘導ボタンを出す（全員に表示）
  const inviteBtn = document.getElementById('btn-invite-member');
  if (inviteBtn) inviteBtn.style.display = '';

  if (!window.dbStaff) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text3)">DB 未接続</div>';
    return;
  }
  list.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 0">読み込み中...</div>';
  try {
    /* v2.35.0：CoreMembers に載っている【全員】を出す。
       CarFlow を使えるかどうかは「印」で区別する（PitFlow と同じ考え方）。 */
    const staffList = await (window.dbStaff.loadAllMembers
      ? window.dbStaff.loadAllMembers()
      : window.dbStaff.loadAllStaff());
    // v2.18.0：誘導バナー（編集はCoreFlowへ）
    const banner = '<div style="background:rgba(55,138,221,.10);border:1px solid rgba(55,138,221,.4);color:var(--text);padding:10px 12px;border-radius:8px;font-size:12px;line-height:1.7;margin-bottom:10px">'
      + ''+ic('link','🔗',15)+' <b>メンバーの追加・削除・編集・権限・グループは CoreFlow で一括管理</b>します。<br>'
      + '<a href="https://coreflow.kobayashi-motors.com/" target="_blank" style="color:#fff;background:#378ADD;padding:3px 10px;border-radius:5px;text-decoration:none;display:inline-block;margin-top:5px;font-weight:600">CoreFlow メンバー管理を開く →</a>'
      + '<span style="color:var(--text3);margin-left:8px">この画面は閲覧専用です</span>'
      + '<div style="color:var(--text3);margin-top:6px;font-size:11px">名簿は CoreMembers（社員名簿）が元です。'
      + '<b>ここには社員全員が出ます</b>。CarFlow に入れる人には「CarFlow」の印が付きます。'
      + '呼び名・部署（車販かどうか）も CoreMembers の内容がそのまま出ます。</div>'
      + '</div>';
    if (!staffList.length) {
      list.innerHTML = banner + '<div style="font-size:12px;color:var(--text3)">登録メンバーがいません</div>';
      const card = document.getElementById('pending-invite-card');
      if (card) card.style.display = 'none';
      return;
    } else {
      const myUid = (window.fb && window.fb.currentUser && window.fb.currentUser.uid);
      // v2.18.2：並び替えだけ admin に開放。それ以外の編集UIは引き続き CoreFlow 側で。
      const isAdminReal = _isAdmin();
      const canSort = isAdminReal;       // 並び替え▲▼ボタン
      const isAdmin = false;             // 役割変更/グループ変更/招待/編集/削除/無効化は全部 false
      _membersCache = staffList;

      list.innerHTML = banner + staffList.map((s, idx) => {
        const name = (typeof resolveStaffDisplayName === 'function') ? resolveStaffDisplayName(s, null) : (s.customDisplayName || s.displayName || '—');
        const photo = (typeof resolveStaffPhotoURL === 'function') ? resolveStaffPhotoURL(s, null) : (s.customPhotoURL || s.photoURL || null);
        const init = (typeof staffInitial === 'function') ? staffInitial(name) : String(name).slice(0, 2);
        const avHtml = photo
          ? `<div class="m-av" style="background-image:url('${_esc(photo)}');background-size:cover;background-position:center;color:transparent">${_esc(init)}</div>`
          : `<div class="m-av">${_esc(init)}</div>`;
        const isMe = s.uid === myUid;
        const inactive = (s.active === false);

        // 並び替え矢印（v2.18.2：admin のみ表示・編集UIロックでも残す）
        let arrowsHtml = '';
        /* 🔴 並び順は portalMembers に書くので、CoreFlow の名簿に居ない人（CoreMembers だけの人）
           には矢印を出さない。出すと空のドキュメントを作ってしまう。 */
        if (canSort && s._pmDocId) {
          const isFirst = idx === 0;
          const isLast = idx === staffList.length - 1;
          arrowsHtml = `<div style="display:flex;flex-direction:column;gap:2px">
            <button class="m-arrow" onclick="moveMember('${_esc(s.uid)}', -1)" ${isFirst ? 'disabled' : ''} title="上に移動">${ic('chevUp','▲',14)}</button>
            <button class="m-arrow" onclick="moveMember('${_esc(s.uid)}', 1)" ${isLast ? 'disabled' : ''} title="下に移動">${ic('chevDown','▼',14)}</button>
          </div>`;
        }

        // ロール表示部
        let roleHtml;
        /* 🔴 役割は表示するだけ。変える道は無い（人と権限は CoreFlow が唯一の正）。
           v2.58.0（2026-09-11）ここにあった「役割を選び直す」は、描かれないまま
           残っていたので消した。 */
          roleHtml = `<div style="font-size:11px;color:var(--text3)">${_esc(ROLE_LABELS[s.role] || s.role || 'スタッフ')}${isMe ? '（自分）' : ''}</div>`;

        // v2.35.0：所属は CoreMembers の部署から自動で決まる（CarFlow では変えられない）。
        //   s.group ＝「車販メンバー」か「他部署メンバー」／s.deptNames ＝ 実際の部署名
        const deptTxt = (Array.isArray(s.deptNames) && s.deptNames.length) ? s.deptNames.join('・') : '';
        const groupHtml = s.group
          ? `<div style="font-size:11px;color:var(--text3)">${ic('users','👥',16)} ${_esc(s.group)}${deptTxt ? '（' + _esc(deptTxt) + '）' : ''}</div>`
          : '';

        // ステータス（v1.8.24: 「在席」→「有効」に表記統一）
        /* v2.35.0：CarFlow に入れるか（CoreFlow の権限）を印で出す。
           🔴 「名簿だけ」の人も付箋の担当には選べる＝居ないことにはしない。 */
        const usePill = (s.canUse === false)
          ? '<span class="pill" style="background:var(--bg3);color:var(--text3);border:1px solid var(--border)" title="CoreFlow で CarFlow＝使える をオンにすると入れます">名簿だけ</span>'
          : '<span class="pill" style="background:rgba(55,138,221,.16);color:#378ADD;border:1px solid rgba(55,138,221,.5)">CarFlow</span>';
        const statusPill = (inactive
          ? '<span class="pill" style="background:#666;color:#fff">無効</span>'
          : '<span class="pill pill-green">有効</span>') + ' ' + usePill;

        // 操作ボタン（admin かつ自分以外。v1.7.29 で「✏️ 編集」を追加）
        let actionsHtml = '';
        /* 🔴 操作ボタンは出さない。出すのは「有効／無効」の札だけ。
           v2.58.0（2026-09-11）ここにあった 編集／有効無効／削除 の3つは、
           描かれないまま残っていた（isAdmin が false 固定）。消した。
           人と権限は CoreFlow（メンバー管理）が唯一の正。上のバナーで案内している。 */
          actionsHtml = `<div style="margin-left:auto">${statusPill}</div>`;

        return `<div class="member-row" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
          ${arrowsHtml}
          ${avHtml}
          <div style="display:flex;flex-direction:column;gap:2px">
            <div style="font-size:13px;font-weight:500">${_esc(name)}${(s.realName && s.realName !== name) ? `<span style="font-size:10px;color:var(--text3);margin-left:6px">${_esc(s.realName)}</span>` : ''}</div>
            ${roleHtml}
            ${groupHtml}
          </div>
          ${actionsHtml}
        </div>`;
      }).join('');
    }
  } catch (err) {
    console.error('[members] renderMembers error:', err);
    list.innerHTML = '<div style="font-size:12px;color:var(--red)">読み込みエラー</div>';
  }

  // v2.18.3：メンバーグループ作成/編集UI 撤去、招待中リスト撤去（CoreFlowへ集約）
  // 🔴 メンバーグループの一覧は出さない（v2.18.3 で撤去）。その一式は v2.58.0 で消した
  // await _renderPendingInvites();  // ← 撤去
}



// ========================================
// 招待モーダル
// ========================================









// ========================================
// メンバー操作（admin 用）
// ========================================

















// ========================================
// v1.7.29: 並び替え（管理者）
// ========================================
async function moveMember(uid, delta) {
  if (!_isAdmin()) return;
  if (!Array.isArray(_membersCache) || _membersCache.length < 2) return;
  const idx = _membersCache.findIndex(s => s.uid === uid);
  if (idx < 0) return;
  const target = idx + delta;
  if (target < 0 || target >= _membersCache.length) return;

  const a = _membersCache[idx];
  const b = _membersCache[target];
  /* 🔴 並び順は portalMembers に書く。CoreFlow の名簿に居ない人は動かせない
     （動かすと空のメンバー記録を作ってしまう）。 */
  if (!a._pmDocId || !b._pmDocId) {
    showToast('この人は CoreFlow の名簿にまだ居ないので、並び替えできません', 'CF-8015');
    return;
  }
  // 既存 sortOrder。未設定なら現在の表示位置に基づいて初期化
  let aOrder = (typeof a.sortOrder === 'number') ? a.sortOrder : idx * 100;
  let bOrder = (typeof b.sortOrder === 'number') ? b.sortOrder : target * 100;
  // 同値なら強制差別化
  if (aOrder === bOrder) { aOrder = idx * 100; bOrder = target * 100; }
  try {
    // v2.18.4：書込先は portalMembers/{docId}.carflow.sortOrder（CarFlow専用・CoreFlowを侵食しない）
    const pmCol = window.fb.db
      .collection('companies').doc(window.fb.currentCompanyId)
      .collection('portalMembers');
    const aRef = pmCol.doc(a._pmDocId || a.uid);
    const bRef = pmCol.doc(b._pmDocId || b.uid);
    await Promise.all([
      aRef.set({ carflow: { sortOrder: bOrder }, updatedAt: window.fb.serverTimestamp() }, { merge: true }),
      bRef.set({ carflow: { sortOrder: aOrder }, updatedAt: window.fb.serverTimestamp() }, { merge: true }),
    ]);
    // v1.7.30: 付箋ボードのスタッフキャッシュも更新（並び順を即時反映）
    if (window.dbStaff) {
      try {
        const load = window.dbStaff.loadAllMembers || window.dbStaff.loadAllStaff;
        const list = await load.call(window.dbStaff);
        if (typeof window._setBoardNotesStaffCache === 'function') {
          window._setBoardNotesStaffCache(list);
        }
        if (typeof renderBoardNotes === 'function') renderBoardNotes();
      } catch (e) { /* ignore */ }
    }
    renderMembers();
  } catch (err) {
    console.error('[members] moveMember:', err);
    showToast('並び替えに失敗しました', 'CF-8016');
  }
}
window.moveMember = moveMember;











