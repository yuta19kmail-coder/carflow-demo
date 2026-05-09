// ========================================
// db-staff.js (v1.5.5〜)
// Firestore の staff コレクションに対する CRUD wrapper
// ----------------------------------------
// パス：companies/{companyId}/staff/{uid}
//
// スキーマ（DB設計書 §2-7 + v1.5.5 拡張）：
//   uid, email, displayName, photoURL,    // Google から取得
//   customDisplayName?, customPhotoURL?,  // CarFlow 用カスタム（v1.5.5）
//   role: 'admin' | 'manager' | 'staff' | 'viewer',
//   permissions: { canEditTemplates, canEditSettings, canDeleteCars, canCloseMonth, canInviteMembers },
//   active: bool,
//   invitedAt, joinedAt, lastSeenAt
//
// 提供関数（window.dbStaff 名前空間）：
//   loadAllStaff()                           : 自社スタッフ全件取得
//   getStaff(uid)                            : 1名取得
//   saveMyProfile({customDisplayName, customPhotoURL})
//                                            : 自分のプロフィール更新（merge）
//   clearMyProfileOverride(field)            : 'name' or 'photo' or 'all' でクリア
//   updateStaff(uid, fields)                 : 他スタッフのフィールド更新（admin 用、v1.5.6 で活用）
//   touchLastSeen()                          : 自分の lastSeenAt 更新（オプション）
// ========================================

(function () {
  'use strict';

  function _staffCol() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db
      .collection('companies').doc(window.fb.currentCompanyId)
      .collection('staff');
  }

  function _myUid() {
    return window.fb && window.fb.currentUser && window.fb.currentUser.uid;
  }

  // -----------------------------------------
  // 全スタッフ取得
  // v1.7.29: sortOrder（昇順）→ 表示名 の順で並べる。
  //   sortOrder 未設定のスタッフは末尾に流す（999999）。
  // -----------------------------------------
  async function loadAllStaff() {
    const col = _staffCol();
    if (!col) return [];
    try {
      const snap = await col.get();
      const list = [];
      snap.forEach(d => {
        const data = d.data() || {};
        if (!data.uid) data.uid = d.id;
        list.push(data);
      });
      list.sort((a, b) => {
        const sa = (typeof a.sortOrder === 'number') ? a.sortOrder : 999999;
        const sb = (typeof b.sortOrder === 'number') ? b.sortOrder : 999999;
        if (sa !== sb) return sa - sb;
        const na = (typeof window.resolveStaffDisplayName === 'function')
          ? window.resolveStaffDisplayName(a, null) : (a.customDisplayName || a.displayName || '');
        const nb = (typeof window.resolveStaffDisplayName === 'function')
          ? window.resolveStaffDisplayName(b, null) : (b.customDisplayName || b.displayName || '');
        return String(na).localeCompare(String(nb), 'ja');
      });
      console.log('[db-staff] loaded', list.length, 'staff');
      return list;
    } catch (err) {
      console.error('[db-staff] loadAllStaff error:', err);
      return [];
    }
  }

  // -----------------------------------------
  // 1名取得
  // -----------------------------------------
  async function getStaff(uid) {
    if (!uid) return null;
    const col = _staffCol();
    if (!col) return null;
    try {
      const snap = await col.doc(uid).get();
      if (!snap.exists) return null;
      const data = snap.data() || {};
      if (!data.uid) data.uid = snap.id;
      return data;
    } catch (err) {
      console.error('[db-staff] getStaff error:', err);
      return null;
    }
  }

  // -----------------------------------------
  // 自分のプロフィール更新（merge）
  // patch: { customDisplayName?, customPhotoURL? }
  //   customPhotoURL は data:URL 文字列 or '' でクリア
  // -----------------------------------------
  async function saveMyProfile(patch) {
    const uid = _myUid();
    const col = _staffCol();
    if (!uid || !col) {
      console.warn('[db-staff] saveMyProfile: 未ログイン');
      return;
    }
    const out = {};
    if (typeof patch.customDisplayName !== 'undefined') {
      out.customDisplayName = patch.customDisplayName;
    }
    if (typeof patch.customPhotoURL !== 'undefined') {
      out.customPhotoURL = patch.customPhotoURL;
    }
    out.updatedAt = window.fb.serverTimestamp();
    try {
      await col.doc(uid).set(out, { merge: true });
      // window.fb.currentStaff にも反映
      if (window.fb.currentStaff) {
        Object.assign(window.fb.currentStaff, out);
      }
    } catch (err) {
      console.error('[db-staff] saveMyProfile error:', err);
      if (typeof showToast === 'function') showToast('プロフィール保存に失敗しました');
      throw err;
    }
  }

  // -----------------------------------------
  // 自分のカスタム設定をクリア（Google の値に戻す）
  // field: 'name' | 'photo' | 'all'
  // FieldValue.delete() で該当フィールドを削除する
  // -----------------------------------------
  async function clearMyProfileOverride(field) {
    const uid = _myUid();
    const col = _staffCol();
    if (!uid || !col) return;
    const del = window.fb.FieldValue.delete();
    const out = { updatedAt: window.fb.serverTimestamp() };
    if (field === 'name' || field === 'all') out.customDisplayName = del;
    if (field === 'photo' || field === 'all') out.customPhotoURL = del;
    try {
      await col.doc(uid).update(out);
      // メモリ側も削る
      if (window.fb.currentStaff) {
        if (field === 'name' || field === 'all') delete window.fb.currentStaff.customDisplayName;
        if (field === 'photo' || field === 'all') delete window.fb.currentStaff.customPhotoURL;
      }
    } catch (err) {
      console.error('[db-staff] clearMyProfileOverride error:', err);
      throw err;
    }
  }

  // -----------------------------------------
  // 他スタッフのフィールド更新（admin 用・v1.5.6 で活用）
  // -----------------------------------------
  async function updateStaff(uid, fields) {
    if (!uid || !fields) return;
    const col = _staffCol();
    if (!col) return;
    const out = { ...fields, updatedAt: window.fb.serverTimestamp() };
    try {
      await col.doc(uid).set(out, { merge: true });
    } catch (err) {
      console.error('[db-staff] updateStaff error:', err);
      throw err;
    }
  }

  // -----------------------------------------
  // 自分の lastSeenAt 更新（在席表示用、オプション）
  // -----------------------------------------
  async function touchLastSeen() {
    const uid = _myUid();
    const col = _staffCol();
    if (!uid || !col) return;
    try {
      await col.doc(uid).update({ lastSeenAt: window.fb.serverTimestamp() });
    } catch (err) {
      // 失敗しても無視
    }
  }

  // -----------------------------------------
  // 公開
  // -----------------------------------------
  window.dbStaff = {
    loadAllStaff,
    getStaff,
    saveMyProfile,
    clearMyProfileOverride,
    updateStaff,
    touchLastSeen,
  };

  console.log('[db-staff] ready');
})();

// ========================================
// 表示名・アイコンの解決ヘルパー（auth.js / dashboard.js / settings.js から呼ぶ）
// staff オブジェクト + 認証ユーザー（user）から、表示すべき名前・アイコンを返す
// ========================================
window.resolveStaffDisplayName = function (staff, user) {
  if (staff && staff.customDisplayName) return staff.customDisplayName;
  if (staff && staff.displayName) return staff.displayName;
  if (user && user.displayName) return user.displayName;
  return 'ゲスト';
};

window.resolveStaffPhotoURL = function (staff, user) {
  if (staff && staff.customPhotoURL) return staff.customPhotoURL;
  if (staff && staff.photoURL) return staff.photoURL;
  if (user && user.photoURL) return user.photoURL;
  return null;
};

// イニシャル（先頭2文字）。displayName が日本語なら最初の1〜2文字
window.staffInitial = function (name) {
  if (!name) return '?';
  return String(name).slice(0, 2).toUpperCase();
};


// ========================================
// v1.5.6: メンバー招待関連 API
// ----------------------------------------
// pendingInvites コレクション：
//   companies/{cid}/pendingInvites/{emailLower} = {
//     email, role, invitedBy, invitedAt, note?
//   }
// 初回ログイン時に email で検索して、該当あれば staff として自動登録する。
// ========================================

function _pendingCol() {
  if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
  return window.fb.db
    .collection('companies').doc(window.fb.currentCompanyId)
    .collection('pendingInvites');
}

function _normEmail(s) {
  return String(s || '').trim().toLowerCase();
}

// v1.5.7: 権限テーブル（5ロール × 8フラグ）
// canEditCarInfo : 車両情報の編集（メーカー・色・価格・売約日・納車日など）と削除UI表示
// canCreateCar   : 新規車両登録ボタン
// canMoveCar     : カンバンの列移動（売約・納車完了などの状態変更）
const DEFAULT_PERMISSIONS = {
  admin:   { canEditTemplates: true,  canEditSettings: true,  canDeleteCars: true,  canCloseMonth: true,  canInviteMembers: true,  canEditCarInfo: true,  canCreateCar: true,  canMoveCar: true  },
  manager: { canEditTemplates: true,  canEditSettings: true,  canDeleteCars: true,  canCloseMonth: true,  canInviteMembers: true,  canEditCarInfo: true,  canCreateCar: true,  canMoveCar: true  },
  staff:   { canEditTemplates: false, canEditSettings: false, canDeleteCars: false, canCloseMonth: false, canInviteMembers: false, canEditCarInfo: true,  canCreateCar: true,  canMoveCar: true  },
  worker:  { canEditTemplates: false, canEditSettings: false, canDeleteCars: false, canCloseMonth: false, canInviteMembers: false, canEditCarInfo: false, canCreateCar: false, canMoveCar: false },
  viewer:  { canEditTemplates: false, canEditSettings: false, canDeleteCars: false, canCloseMonth: false, canInviteMembers: false, canEditCarInfo: false, canCreateCar: false, canMoveCar: false },
};

// 権限チェック共通ヘルパー：window.hasPermission('canEditCarInfo') 等
// admin は全 true・viewer/worker は読み取り中心
window.hasPermission = function (perm) {
  const staff = window.fb && window.fb.currentStaff;
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  // staff.permissions が個別オーバーライドされてればそちらを優先
  if (staff.permissions && typeof staff.permissions[perm] !== 'undefined') {
    return !!staff.permissions[perm];
  }
  // フォールバック：ロールのデフォルト
  const def = DEFAULT_PERMISSIONS[staff.role];
  return !!(def && def[perm]);
};

// viewer 以外（最低でもタスクチェックや写真変更はできる）かを判定するヘルパー
// 主に「タスクチェック・写真変更・メモ追記」など、worker でも可な作業 mutation のガード
window.canMutateWork = function () {
  const staff = window.fb && window.fb.currentStaff;
  if (!staff) return false;
  return staff.role !== 'viewer';
};

async function addPendingInvite({ email, role, note }) {
  const col = _pendingCol();
  if (!col) throw new Error('not authenticated');
  const e = _normEmail(email);
  if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('invalid_email');
  const r = (['admin','manager','staff','worker','viewer'].includes(role)) ? role : 'staff';
  const doc = {
    email: e,
    role: r,
    note: note || '',
    invitedAt: window.fb.serverTimestamp(),
    invitedBy: (window.fb.currentUser && window.fb.currentUser.uid) || null,
    invitedByName: (window.fb.currentStaff && (window.fb.currentStaff.customDisplayName || window.fb.currentStaff.displayName)) || null,
  };
  // 既に staff として参加してるなら拒否
  // （クライアント側でチェック。サーバー側はセキュリティルールで担保）
  await col.doc(e).set(doc, { merge: true });
}

async function loadPendingInvites() {
  const col = _pendingCol();
  if (!col) return [];
  try {
    const snap = await col.get();
    const list = [];
    snap.forEach(d => {
      const data = d.data() || {};
      data._id = d.id;
      list.push(data);
    });
    return list;
  } catch (err) {
    console.error('[db-staff] loadPendingInvites:', err);
    return [];
  }
}

async function removePendingInvite(email) {
  const col = _pendingCol();
  if (!col) return;
  const e = _normEmail(email);
  if (!e) return;
  try {
    await col.doc(e).delete();
  } catch (err) {
    console.error('[db-staff] removePendingInvite:', err);
    throw err;
  }
}

// 招待消費：ユーザーの email にマッチする pendingInvite を探して staff/userMemberships を作成
// 戻り値：{ created: bool, role?, role が見つかった場合 staff レコードを返す }
async function consumePendingInviteOnLogin(user, companyId, companyName) {
  if (!window.fb || !window.fb.db || !user) return { created: false };
  const col = window.fb.db
    .collection('companies').doc(companyId)
    .collection('pendingInvites');
  const e = _normEmail(user.email);
  if (!e) return { created: false };
  try {
    const snap = await col.doc(e).get();
    if (!snap.exists) return { created: false };
    const inv = snap.data() || {};
    const role = (['admin','manager','staff','worker','viewer'].includes(inv.role)) ? inv.role : 'staff';
    const permissions = DEFAULT_PERMISSIONS[role];

    // staff/{uid} 作成
    const staffRef = window.fb.db
      .collection('companies').doc(companyId)
      .collection('staff').doc(user.uid);
    const staff = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      role,
      permissions,
      active: true,
      invitedAt: inv.invitedAt || window.fb.serverTimestamp(),
      joinedAt: window.fb.serverTimestamp(),
    };
    await staffRef.set(staff, { merge: true });

    // userMemberships/{uid}/memberships/{cid}
    await window.fb.db
      .collection('userMemberships').doc(user.uid)
      .collection('memberships').doc(companyId)
      .set({
        companyId,
        companyName: companyName || companyId,
        role,
        joinedAt: window.fb.serverTimestamp(),
      }, { merge: true });

    // pendingInvites を削除
    await col.doc(e).delete();

    return { created: true, role, staff };
  } catch (err) {
    console.error('[db-staff] consumePendingInviteOnLogin:', err);
    return { created: false, error: err };
  }
}

// 公開
window.dbStaff.addPendingInvite = addPendingInvite;
window.dbStaff.loadPendingInvites = loadPendingInvites;
window.dbStaff.removePendingInvite = removePendingInvite;
window.dbStaff.consumePendingInviteOnLogin = consumePendingInviteOnLogin;
window.dbStaff.DEFAULT_PERMISSIONS = DEFAULT_PERMISSIONS;
