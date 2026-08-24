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
      + ''+ic('link','🔗',15)+' <b>メンバーの追加・編集・権限・グループは CoreFlow で一括管理</b>します。<br>'
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
        if (isAdmin && !isMe) {
          roleHtml = `<select onchange="changeStaffRole('${_esc(s.uid)}', this.value)" style="padding:3px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:11px;outline:none">`
            + ROLE_OPTIONS.map(r => `<option value="${r}"${r===s.role?' selected':''}>${ROLE_LABELS[r]}</option>`).join('')
            + `</select>`;
        } else {
          roleHtml = `<div style="font-size:11px;color:var(--text3)">${_esc(ROLE_LABELS[s.role] || s.role || 'スタッフ')}${isMe ? '（自分）' : ''}</div>`;
        }

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
        if (isAdmin && !isMe) {
          actionsHtml = `<div style="display:flex;gap:4px;margin-left:auto;flex-wrap:wrap">`
            + `<button class="btn-sm" onclick="openEditMemberModal('${_esc(s.uid)}')" title="表示名と写真を編集">${ic('pencil','✏️',15)} 編集</button>`
            + `<button class="btn-sm" onclick="toggleStaffActive('${_esc(s.uid)}', ${inactive ? 'false' : 'true'})" title="${inactive ? '有効化' : '無効化'}">${inactive ? ''+ic('chevRight','▶',14)+' 有効化' : '⏸ 無効化'}</button>`
            + `<button class="btn-sm" onclick="removeMember('${_esc(s.uid)}', '${_esc(name)}')" style="color:var(--red)" title="削除">${ic('trash','🗑️',16)}</button>`
            + `</div>`;
        } else {
          actionsHtml = `<div style="margin-left:auto">${statusPill}</div>`;
        }

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
  // renderMemberGroups();  // ← 撤去
  // await _renderPendingInvites();  // ← 撤去
}

async function _renderPendingInvites() {
  const card = document.getElementById('pending-invite-card');
  const listEl = document.getElementById('pending-invite-list');
  if (!card || !listEl) return;
  if (!_isAdmin()) {
    card.style.display = 'none';
    return;
  }
  if (!window.dbStaff || !window.dbStaff.loadPendingInvites) {
    card.style.display = 'none';
    return;
  }
  try {
    const invites = await window.dbStaff.loadPendingInvites();
    if (!invites.length) {
      card.style.display = 'none';
      return;
    }
    card.style.display = '';
    listEl.innerHTML = invites.map(inv => {
      const role = ROLE_LABELS[inv.role] || inv.role || 'スタッフ';
      const note = inv.note ? `<span style="color:var(--text3);margin-left:6px">（${_esc(inv.note)}）</span>` : '';
      const inviter = inv.invitedByName ? `<span style="color:var(--text3);margin-left:6px;font-size:10px">by ${_esc(inv.invitedByName)}</span>` : '';
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:200px">
          <div style="font-size:12px;font-weight:500">${_esc(inv.email)}</div>
          <div style="font-size:11px;color:var(--text2)">${_esc(role)}${note}${inviter}</div>
        </div>
        <button class="btn-sm" onclick="cancelPendingInvite('${_esc(inv.email)}')" style="color:var(--red)">取消</button>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('[members] _renderPendingInvites:', err);
  }
}

// ========================================
// 招待モーダル
// ========================================

function openInviteMemberModal() {
  if (typeof blockOnMobileAdmin === 'function' && blockOnMobileAdmin('メンバー招待')) return;
  if (!_isAdmin()) {
    showToast('管理者のみ招待できます', 'CF-8005');
    return;
  }
  document.getElementById('invite-email-inp').value = '';
  document.getElementById('invite-role-sel').value = 'staff';
  document.getElementById('invite-note-inp').value = '';
  document.getElementById('confirm-invite-member').classList.add('open');
  setTimeout(() => document.getElementById('invite-email-inp').focus(), 50);
}

function closeInviteMemberModal() {
  document.getElementById('confirm-invite-member').classList.remove('open');
}

async function submitInviteMember() {
  const email = (document.getElementById('invite-email-inp').value || '').trim();
  const role = document.getElementById('invite-role-sel').value;
  const note = (document.getElementById('invite-note-inp').value || '').trim();
  if (!email) {
    showToast('メールアドレスを入力してください', 'CF-8006');
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    showToast('メールアドレスの形式が不正です', 'CF-8007');
    return;
  }
  try {
    await window.dbStaff.addPendingInvite({ email, role, note });
    showToast('招待を作成しました');
    closeInviteMemberModal();
    renderMembers();
  } catch (err) {
    console.error('[members] submitInviteMember:', err);
    if (err && err.message === 'invalid_email') showToast('メールアドレスの形式が不正です', 'CF-8007');
    else showToast('招待の作成に失敗しました', 'CF-8008');
  }
}

async function cancelPendingInvite(email) {
  if (!_isAdmin()) return;
  if (!confirm(`「${email}」への招待を取り消しますか？`)) return;
  try {
    await window.dbStaff.removePendingInvite(email);
    showToast('招待を取り消しました');
    renderMembers();
  } catch (err) {
    console.error('[members] cancelPendingInvite:', err);
    showToast('取消に失敗しました', 'CF-8009');
  }
}

// ========================================
// メンバー操作（admin 用）
// ========================================

async function changeStaffRole(uid, newRole) {
  if (!_isAdmin()) return;
  if (!ROLE_OPTIONS.includes(newRole)) return;
  const myUid = window.fb && window.fb.currentUser && window.fb.currentUser.uid;
  if (uid === myUid) {
    showToast('自分の権限は変更できません', 'CF-8010');
    return;
  }
  if (!confirm(`このメンバーの権限を「${ROLE_LABELS[newRole]}」に変更しますか？`)) {
    renderMembers(); // セレクトをリセット
    return;
  }
  try {
    const perms = (window.dbStaff.DEFAULT_PERMISSIONS && window.dbStaff.DEFAULT_PERMISSIONS[newRole]) || {};
    await window.dbStaff.updateStaff(uid, { role: newRole, permissions: perms });
    showToast('権限を更新しました');
    renderMembers();
  } catch (err) {
    console.error('[members] changeStaffRole:', err);
    showToast('権限の更新に失敗しました', 'CF-8011');
    renderMembers();
  }
}

// ========================================
// v2.9.0: メンバーグループ（車販／他部署 など）
// ========================================
// メンバーのグループを変更（admin のみ。自分も変更可）
async function changeStaffGroup(uid, groupId) {
  if (!_isAdmin()) return;
  try {
    await window.dbStaff.updateStaff(uid, { groupId: groupId || '' });
    showToast(groupId ? 'グループを設定しました' : 'グループを外しました');
    renderMembers();
  } catch (err) {
    console.error('[members] changeStaffGroup:', err);
    showToast('グループの更新に失敗しました', 'CF-8012');
    renderMembers();
  }
}

function _genGroupId() {
  return 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// グループ管理カードの描画
function renderMemberGroups() {
  const host = document.getElementById('member-groups-list');
  if (!host) return;
  const isAdmin = _isAdmin();
  const groups = (typeof memberGroups !== 'undefined' && Array.isArray(memberGroups)) ? memberGroups : [];
  const addBtn = document.getElementById('btn-add-member-group');
  if (addBtn) addBtn.style.display = isAdmin ? '' : 'none';

  if (!groups.length) {
    host.innerHTML = '<div style="font-size:12px;color:var(--text3)">グループがありません</div>';
    return;
  }
  if (!isAdmin) {
    host.innerHTML = groups.map(g => `<div style="font-size:13px;padding:4px 0">${ic('users','👥',16)} ${_esc(g.name)}</div>`).join('');
    return;
  }
  host.innerHTML = groups.map(g => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:14px">${ic('users','👥',16)}</span>
      <input type="text" value="${_esc(g.name)}" maxlength="20"
             onchange="renameMemberGroup('${_esc(g.id)}', this.value)"
             style="flex:1;min-width:120px;padding:4px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:13px;outline:none">
      <button class="btn-sm" onclick="deleteMemberGroup('${_esc(g.id)}')" style="color:var(--red)" title="このグループを削除">${ic('trash','🗑️',16)}</button>
    </div>`).join('');
}

function addMemberGroup() {
  if (!_isAdmin()) return;
  const name = (prompt('追加するグループ名を入力してください', '') || '').trim();
  if (!name) return;
  if (typeof memberGroups === 'undefined') return;
  memberGroups.push({ id: _genGroupId(), name });
  if (window.saveSettings) saveSettings();
  renderMemberGroups();
  renderMembers(); // メンバー行のプルダウンに新グループを反映
  showToast('グループを追加しました');
}

function renameMemberGroup(id, newName) {
  if (!_isAdmin()) return;
  const name = (newName || '').trim();
  const g = (typeof memberGroups !== 'undefined' ? memberGroups : []).find(x => x.id === id);
  if (!g) return;
  if (!name) { renderMemberGroups(); return; } // 空名は無視（元に戻す）
  g.name = name;
  if (window.saveSettings) saveSettings();
  renderMemberGroups();
  renderMembers(); // メンバー行のプルダウン名も更新
  showToast('グループ名を更新しました');
}

async function deleteMemberGroup(id) {
  if (!_isAdmin()) return;
  if (typeof memberGroups === 'undefined') return;
  const g = memberGroups.find(x => x.id === id);
  if (!g) return;
  if (!confirm(`グループ「${g.name}」を削除しますか？\nこのグループのメンバーは「未所属」に戻ります。`)) return;
  const idx = memberGroups.findIndex(x => x.id === id);
  if (idx >= 0) memberGroups.splice(idx, 1);
  if (window.saveSettings) saveSettings();
  // 所属していたメンバーの groupId を外す
  try {
    if (window.dbStaff && window.dbStaff.loadAllStaff) {
      const list = await window.dbStaff.loadAllStaff();
      await Promise.all(
        list.filter(s => s.groupId === id).map(s => window.dbStaff.updateStaff(s.uid, { groupId: '' }))
      );
    }
  } catch (err) { console.error('[members] deleteMemberGroup cleanup:', err); }
  renderMemberGroups();
  renderMembers();
  showToast('グループを削除しました');
}

async function toggleStaffActive(uid, makeInactive) {
  if (!_isAdmin()) return;
  const myUid = window.fb && window.fb.currentUser && window.fb.currentUser.uid;
  if (uid === myUid) {
    showToast('自分は無効化できません', 'CF-8013');
    return;
  }
  const action = makeInactive ? '無効化' : '有効化';
  if (!confirm(`このメンバーを${action}しますか？`)) return;
  try {
    await window.dbStaff.updateStaff(uid, { active: !makeInactive });
    showToast(`${action}しました`);
    renderMembers();
  } catch (err) {
    console.error('[members] toggleStaffActive:', err);
    showToast(`${action}に失敗しました`, 'CF-8014');
  }
}

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

// ========================================
// v1.7.29: 管理者によるメンバー編集（表示名・写真の上書き）
// ========================================
function openEditMemberModal(uid) {
  if (!_isAdmin()) {
    showToast('管理者のみ編集できます', 'CF-8017');
    return;
  }
  const myUid = window.fb && window.fb.currentUser && window.fb.currentUser.uid;
  if (uid === myUid) {
    showToast('自分のプロフィールは設定画面から編集してください', 'CF-8018');
    return;
  }
  const s = (_membersCache || []).find(x => x.uid === uid);
  if (!s) { showToast('メンバーが見つかりません', 'CF-8019'); return; }

  _editMemberUid = uid;
  _editMemberPendingPhotoBlob = null;
  _editMemberPendingPhotoPreview = null;
  _editMemberClearPhoto = false;
  _editMemberClearName = false;

  // モーダル中の値をセット
  const nameInp = document.getElementById('edit-member-name-inp');
  const targetEl = document.getElementById('edit-member-target');
  if (nameInp) nameInp.value = s.customDisplayName || s.displayName || '';
  if (targetEl) targetEl.textContent = `${s.email || s.uid} のプロフィールを編集します`;

  _refreshEditMemberAvatar(s);

  // ファイルピッカーをリセット
  const photoInp = document.getElementById('edit-member-photo-inp');
  if (photoInp) photoInp.value = '';

  document.getElementById('confirm-edit-member').classList.add('open');
}
window.openEditMemberModal = openEditMemberModal;

function closeEditMemberModal() {
  document.getElementById('confirm-edit-member').classList.remove('open');
  _editMemberUid = null;
  _editMemberPendingPhotoBlob = null;
  _editMemberPendingPhotoPreview = null;
}
window.closeEditMemberModal = closeEditMemberModal;

// アバタープレビューを更新
function _refreshEditMemberAvatar(staffOrNull) {
  const av = document.getElementById('edit-member-av-preview');
  if (!av) return;
  const s = staffOrNull || (_membersCache || []).find(x => x.uid === _editMemberUid);
  let url;
  if (_editMemberPendingPhotoPreview) {
    url = _editMemberPendingPhotoPreview;
  } else if (_editMemberClearPhoto) {
    // 「Google の写真に戻す」を押した状態：素の displayName から作り直す
    url = (s && s.photoURL) || null;
  } else {
    url = (typeof resolveStaffPhotoURL === 'function') ? resolveStaffPhotoURL(s, null) : null;
  }
  const name = (s && (s.customDisplayName || s.displayName)) || '?';
  const init = (typeof staffInitial === 'function') ? staffInitial(name) : String(name).slice(0, 2);
  if (url) {
    av.style.backgroundImage = `url('${url}')`;
    av.style.backgroundSize = 'cover';
    av.style.backgroundPosition = 'center';
    av.style.color = 'transparent';
    av.textContent = init;
  } else {
    av.style.backgroundImage = '';
    av.style.color = '';
    av.textContent = init;
  }
}

// v1.8.77: ファイル選択 → クロッパーを開いて円形トリミング → 適用結果を pending に保存
async function onEditMemberPhotoPick(input) {
  if (!input || !input.files || !input.files[0]) return;
  const file = input.files[0];
  if (file.size > 5 * 1024 * 1024) {
    showToast('画像が大きすぎます（5MB 以下）', 'CF-8020');
    input.value = '';
    return;
  }
  if (typeof openAvatarCrop === 'function') {
    openAvatarCrop(file, (croppedBlob, dataUrl) => {
      _editMemberPendingPhotoBlob = croppedBlob;
      _editMemberPendingPhotoPreview = dataUrl;
      _editMemberClearPhoto = false;
      _refreshEditMemberAvatar(null);
    });
  } else {
    // フォールバック（旧挙動：クロッパーなしで生ファイル保持）
    _editMemberPendingPhotoBlob = file;
    _editMemberClearPhoto = false;
    const reader = new FileReader();
    reader.onload = (e) => {
      _editMemberPendingPhotoPreview = e.target.result;
      _refreshEditMemberAvatar(null);
    };
    reader.readAsDataURL(file);
  }
  input.value = '';
}
window.onEditMemberPhotoPick = onEditMemberPhotoPick;

// 「Google の写真に戻す」（customPhotoURL を消す予約）
function resetEditMemberPhoto() {
  _editMemberClearPhoto = true;
  _editMemberPendingPhotoBlob = null;
  _editMemberPendingPhotoPreview = null;
  const photoInp = document.getElementById('edit-member-photo-inp');
  if (photoInp) photoInp.value = '';
  _refreshEditMemberAvatar(null);
  showToast('保存すると Google の写真に戻ります');
}
window.resetEditMemberPhoto = resetEditMemberPhoto;

// 「Google の名前に戻す」（customDisplayName を消す予約）
function resetEditMemberName() {
  _editMemberClearName = true;
  const s = (_membersCache || []).find(x => x.uid === _editMemberUid);
  const nameInp = document.getElementById('edit-member-name-inp');
  if (nameInp && s) nameInp.value = s.displayName || '';
  showToast('保存すると Google の名前に戻ります');
}
window.resetEditMemberName = resetEditMemberName;

async function saveEditMemberProfile() {
  if (!_isAdmin()) return;
  if (!_editMemberUid) return;
  const uid = _editMemberUid;
  const nameInp = document.getElementById('edit-member-name-inp');
  const newName = nameInp ? (nameInp.value || '').trim() : '';

  try {
    const updates = {};
    // 表示名
    if (_editMemberClearName) {
      updates.customDisplayName = window.fb.FieldValue.delete();
    } else if (newName) {
      updates.customDisplayName = newName;
    } else {
      // 空欄保存はクリア扱い
      updates.customDisplayName = window.fb.FieldValue.delete();
    }
    // 写真
    if (_editMemberPendingPhotoBlob) {
      // Storage にアップロード
      let url = null;
      if (window.dbStorage && window.dbStorage.uploadProfilePhoto) {
        url = await window.dbStorage.uploadProfilePhoto(uid, _editMemberPendingPhotoBlob);
      }
      if (url) {
        updates.customPhotoURL = url;
      }
    } else if (_editMemberClearPhoto) {
      updates.customPhotoURL = window.fb.FieldValue.delete();
    }
    await window.dbStaff.updateStaff(uid, updates);
    showToast('プロフィールを更新しました');
    closeEditMemberModal();
    renderMembers();
    if (typeof renderBoardNotes === 'function') {
      // 付箋ボードのアバター表示も更新
      if (window.dbStaff && window.dbStaff.loadAllStaff) {
        const list = await window.dbStaff.loadAllStaff();
        if (typeof window._setBoardNotesStaffCache === 'function') {
          window._setBoardNotesStaffCache(list);
        }
        renderBoardNotes();
      }
    }
  } catch (err) {
    console.error('[members] saveEditMemberProfile:', err);
    showToast('プロフィールの保存に失敗しました', 'CF-8021');
  }
}
window.saveEditMemberProfile = saveEditMemberProfile;

async function removeMember(uid, name) {
  if (!_isAdmin()) return;
  const myUid = window.fb && window.fb.currentUser && window.fb.currentUser.uid;
  if (uid === myUid) {
    showToast('自分は削除できません', 'CF-8022');
    return;
  }
  if (!confirm(`「${name}」をメンバーから削除しますか？\n（staff レコードと userMemberships を削除します。データは復元できません）`)) return;
  try {
    // staff/{uid}
    await window.fb.db
      .collection('companies').doc(window.fb.currentCompanyId)
      .collection('staff').doc(uid).delete();
    // userMemberships/{uid}/memberships/{cid}
    await window.fb.db
      .collection('userMemberships').doc(uid)
      .collection('memberships').doc(window.fb.currentCompanyId).delete();
    showToast('メンバーを削除しました');
    renderMembers();
  } catch (err) {
    console.error('[members] removeMember:', err);
    showToast('削除に失敗しました', 'CF-0019');
  }
}
