// ========================================
// db-staff.js (v2.18.0：CoreFlow一本化・portalMembers経由)
// ----------------------------------------
// 旧来は companies/{cid}/staff/{uid} を CRUD していたが、
// v2.18.0 で staff コレクションは廃止し、すべて
//   companies/{cid}/portalMembers/{uid|autoId}
// を読み書きするように変更。
//
// CarFlow 内部のコードは「staff オブジェクト」のスキーマを期待しているため、
// portalMembers ドキュメントを仮想 staff に翻訳して返す。
//
// 編集系（saveMyProfile / updateStaff / clearMyProfileOverride / touchLastSeen）は
// すべて廃止。「人と権限は CoreFlow で」というガイダンスを表示。
//
// お知らせ既読（readAnnouncements）の保存先は userPrefs/{uid} へ分離（db-user-prefs.js）。
// ========================================

(function () {
  'use strict';

  // v2.18.0：portalMembers を真実のソースに
  function _pmCol() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db
      .collection('companies').doc(window.fb.currentCompanyId)
      .collection('portalMembers');
  }

  function _myUid() {
    return window.fb && window.fb.currentUser && window.fb.currentUser.uid;
  }

  // portalMembers の日本語ロール → CarFlow 内部ロール
  const ROLE_JP_TO_EN = {
    '管理者':'admin','マネージャー':'manager','マネージャ':'manager',
    'スタッフ':'staff','作業者':'worker','閲覧':'viewer','閲覧のみ':'viewer'
  };

  // portalMembers ドキュメント → 仮想 staff オブジェクト
  // v2.18.2：_pmDocId（portalMembers のドキュメントID）も付与しておく。
  // v2.18.4：並び順はアプリ別フィールド（carflow.sortOrder）を優先。
  function _toStaff(m) {
    const cf = m.carflow || {};
    const roleJp = cf.role || 'スタッフ';
    return {
      uid: m.uid || m.id,
      _pmDocId: m.id,                              // ← portalMembers の docId
      email: m.email || '',
      displayName: m.gname || m.name || '',
      photoURL: null,
      customDisplayName: m.name || '',
      customPhotoURL: m.photo || null,
      role: ROLE_JP_TO_EN[roleJp] || 'staff',
      active: m.active !== false,
      group: cf.group || '（なし）',
      // v2.18.6：CarFlow は carflow.sortOrder だけ見る（CoreFlowの並びにフォールバックしない）。
      //          不足分は admin ログイン時の auto-seed が一気に補完する。
      sortOrder: (typeof cf.sortOrder === 'number') ? cf.sortOrder : undefined,
      // 互換用フィールド
      name: m.name, dept: m.dept, title: m.title,
    };
  }

  // -----------------------------------------
  // v2.35.0：名簿の元は CoreMembers（members-core.js）に移した。
  //   loadAllStaff()   … CarFlow を【使える人だけ】。車両の担当など、今までどおりの顔ぶれ。
  //   loadAllMembers() … CoreMembers に載っている【全員】。付箋の担当・メンバー一覧はこちら。
  //   🔴 どちらも人の番号（uid）の決め方は今までと同じ＝既存の付箋の担当は外れない。
  //   ⚠ CoreMembers が読めない時は、v2.34.0 までと同じ portalMembers 直読みに落ちる。
  // -----------------------------------------
  async function _fromCore(which) {
    if (!window.CFMembers) return null;
    try {
      window.CFMembers.start();
      await window.CFMembers.whenReady(6000);
      if (!window.CFMembers.ready()) return null;
      const list = (which === 'all') ? window.CFMembers.all() : window.CFMembers.usable();
      if (!list.length) return null;      // 1人も居ない＝読めていないとみなして従来ルートへ
      return list;
    } catch (e) {
      console.warn('[db-staff] CoreMembers から名簿を作れませんでした（従来の方法で続けます）', e);
      return null;
    }
  }

  async function loadAllMembers() {
    const fromCore = await _fromCore('all');
    if (fromCore) {
      console.log('[db-staff] loaded', fromCore.length, 'members (CoreMembers 全員)');
      return fromCore;
    }
    return loadAllStaff();               // 落ちた時は「使える人だけ」で我慢する（空にしない）
  }

  async function loadAllStaff() {
    const fromCore = await _fromCore('usable');
    if (fromCore) {
      console.log('[db-staff] loaded', fromCore.length, 'staff (CoreMembers 経由)');
      return fromCore;
    }
    const col = _pmCol();
    if (!col) return [];
    try {
      const snap = await col.get();
      const list = [];
      snap.forEach(d => {
        const m = d.data() || {};
        m.id = d.id;
        if (m.active === false) return;
        if (!m.carflow || m.carflow.on !== true) return;
        list.push(_toStaff(m));
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
      console.log('[db-staff] loaded', list.length, 'staff (from portalMembers)');
      return list;
    } catch (err) {
      console.error('[db-staff] loadAllStaff error:', err);
      return [];
    }
  }

  // -----------------------------------------
  // 1名取得（uid 一致のみ・email検索は不要）
  // -----------------------------------------
  async function getStaff(uid) {
    if (!uid) return null;
    const col = _pmCol();
    if (!col) return null;
    try {
      const snap = await col.doc(uid).get();
      if (!snap.exists) return null;
      const m = snap.data() || {};
      m.id = snap.id;
      return _toStaff(m);
    } catch (err) {
      console.error('[db-staff] getStaff error:', err);
      return null;
    }
  }

  // -----------------------------------------
  // v2.18.0：編集系はすべて廃止。CoreFlow に誘導する。
  // -----------------------------------------
  async function saveMyProfile(patch) {
    if (typeof showToast === 'function') {
      showToast('プロフィールの編集は CoreFlow（メンバー管理）から行ってください', 'CF-8001');
    }
    console.warn('[db-staff] saveMyProfile is deprecated. Edit in CoreFlow.');
  }
  async function clearMyProfileOverride(field) {
    if (typeof showToast === 'function') {
      showToast('プロフィールの編集は CoreFlow（メンバー管理）から行ってください', 'CF-8001');
    }
    console.warn('[db-staff] clearMyProfileOverride is deprecated.');
  }
  async function updateStaff(uid, fields) {
    if (typeof showToast === 'function') {
      showToast('メンバー情報の編集は CoreFlow（メンバー管理）から行ってください', 'CF-8002');
    }
    console.warn('[db-staff] updateStaff is deprecated. Edit in CoreFlow.');
  }
  async function touchLastSeen() { /* v2.18.0: 廃止 */ }

  // -----------------------------------------
  // お知らせ既読の保存（保存先は userPrefs/{uid} に変更）
  // -----------------------------------------
  async function saveMyAnnounceRead(arr) {
    const list = Array.isArray(arr) ? arr.slice() : [];
    if (window.dbUserPrefs && window.dbUserPrefs.saveMyAnnounceRead) {
      try {
        await window.dbUserPrefs.saveMyAnnounceRead(list);
        if (window.fb.currentStaff) window.fb.currentStaff.readAnnouncements = list;
      } catch (err) {
        console.error('[db-staff] saveMyAnnounceRead error:', err);
      }
    } else {
      console.warn('[db-staff] dbUserPrefs not loaded; cannot save announce read');
    }
  }

  // -----------------------------------------
  // 公開
  // -----------------------------------------
  window.dbStaff = {
    loadAllStaff,
    loadAllMembers,
    getStaff,
    saveMyProfile,
    clearMyProfileOverride,
    updateStaff,
    touchLastSeen,
    saveMyAnnounceRead,
  };

  console.log('[db-staff] ready (v2.18.0 / portalMembers)');
})();

// ========================================
// 表示名・アイコンの解決ヘルパー（v2.18.0 でも形は不変）
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
// 権限テーブル（5ロール × 8フラグ）── v2.18.0 でも内部は不変
// permissions は portalMembers には無いので、常に DEFAULT_PERMISSIONS を使う
// ========================================
const DEFAULT_PERMISSIONS = {
  admin:   { canEditTemplates: true,  canEditSettings: true,  canDeleteCars: true,  canCloseMonth: true,  canInviteMembers: true,  canEditCarInfo: true,  canCreateCar: true,  canMoveCar: true  },
  manager: { canEditTemplates: true,  canEditSettings: true,  canDeleteCars: true,  canCloseMonth: true,  canInviteMembers: true,  canEditCarInfo: true,  canCreateCar: true,  canMoveCar: true  },
  staff:   { canEditTemplates: false, canEditSettings: false, canDeleteCars: false, canCloseMonth: false, canInviteMembers: false, canEditCarInfo: true,  canCreateCar: true,  canMoveCar: true  },
  worker:  { canEditTemplates: false, canEditSettings: false, canDeleteCars: false, canCloseMonth: false, canInviteMembers: false, canEditCarInfo: false, canCreateCar: false, canMoveCar: false },
  viewer:  { canEditTemplates: false, canEditSettings: false, canDeleteCars: false, canCloseMonth: false, canInviteMembers: false, canEditCarInfo: false, canCreateCar: false, canMoveCar: false },
};

window.hasPermission = function (perm) {
  const staff = window.fb && window.fb.currentStaff;
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  if (staff.permissions && typeof staff.permissions[perm] !== 'undefined') {
    return !!staff.permissions[perm];
  }
  const def = DEFAULT_PERMISSIONS[staff.role];
  return !!(def && def[perm]);
};

window.canMutateWork = function () {
  const staff = window.fb && window.fb.currentStaff;
  if (!staff) return false;
  return staff.role !== 'viewer';
};

// ========================================
// 招待関連 API ── v2.18.0：すべて廃止（CoreFlow で追加）
// ========================================
async function addPendingInvite(_x) {
  if (typeof showToast === 'function') {
    showToast('メンバー招待は CoreFlow（メンバー管理）から行ってください', 'CF-8003');
  }
  throw new Error('deprecated: use CoreFlow to add members');
}
async function loadPendingInvites() { return []; }
async function consumePendingInviteOnLogin() { return { created: false }; }
async function deletePendingInvite(_x) { /* no-op */ }
async function setStaffActive(_x, _y) {
  if (typeof showToast === 'function') {
    showToast('メンバーの有効/無効は CoreFlow（メンバー管理）から行ってください', 'CF-8004');
  }
  throw new Error('deprecated: use CoreFlow');
}

// 公開（互換のためAPI形を残す）
window.dbStaffInvites = {
  addPendingInvite, loadPendingInvites, consumePendingInviteOnLogin,
  deletePendingInvite, setStaffActive,
};
