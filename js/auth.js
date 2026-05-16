// ========================================
// auth.js
// ログイン/ログアウト
// v1.5.0: Firebase Authentication（Google サインイン）
// v1.5.1〜v1.5.4: cars / settings / archivedCars / auditLogs の DB 連携
// v1.5.5: ヘッダーのアバター・表示名を _refreshHeaderAvatars に集約
// v1.8.0: cars / boardNotes を onSnapshot 購読化
// ========================================

let mobileAdminMode = false;
let sidebarCollapsed = false;
let _authBusy = false;

function isMobileMode() {
  return window.innerWidth <= 768 && !mobileAdminMode;
}

function applyMobileClass() {
  document.body.classList.toggle('mobile', isMobileMode());
  refreshAdminToggleButtons();
}

function refreshAdminToggleButtons() {
  const adminBtn = document.getElementById('mobile-admin-toggle');
  const backBtn = document.getElementById('mobile-back-mobile');
  const isLogin = document.getElementById('app').style.display !== 'none';
  const narrow = window.innerWidth <= 768;
  if (!adminBtn || !backBtn) return;
  if (!isLogin) {
    adminBtn.style.display = 'none';
    backBtn.style.display = 'none';
    return;
  }
  if (narrow && !mobileAdminMode) {
    adminBtn.style.display = '';
    backBtn.style.display = 'none';
  } else if (narrow && mobileAdminMode) {
    adminBtn.style.display = 'none';
    backBtn.style.display = '';
  } else {
    adminBtn.style.display = 'none';
    backBtn.style.display = 'none';
  }
}

function enterAdminMode() {
  mobileAdminMode = true;
  applyMobileClass();
  if (typeof renderAll === 'function') renderAll();
  if (typeof showToast === 'function') showToast('🗂️ フルメニューに切替えました');
}

function exitAdminMode() {
  mobileAdminMode = false;
  applyMobileClass();
  if (typeof forceProgressView === 'function') forceProgressView();
  if (typeof showToast === 'function') showToast('⚡ クイックメニューに戻りました');
}

function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed);
}

async function doLogin() {
  if (_authBusy) return;
  if (!window.fb || !window.fb.auth) {
    if (typeof showToast === 'function') showToast('Firebase 初期化エラー');
    return;
  }
  if (window.fb.auth.currentUser) return;
  _authBusy = true;
  _setLoginBusy(true);
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await window.fb.auth.signInWithPopup(provider);
  } catch (err) {
    console.error('[auth] signInWithPopup error:', err);
    let msg = 'ログインに失敗しました';
    if (err && err.code === 'auth/popup-closed-by-user') msg = 'ログインがキャンセルされました';
    else if (err && err.code === 'auth/popup-blocked') msg = 'ポップアップがブロックされました';
    else if (err && err.code === 'auth/unauthorized-domain') msg = 'このドメインは Firebase に未登録です';
    if (typeof showToast === 'function') showToast(msg);
  } finally {
    _authBusy = false;
    _setLoginBusy(false);
  }
}

async function doLogout() {
  if (_authBusy) return;
  if (!window.fb || !window.fb.auth) { _onSignedOut(); return; }
  _authBusy = true;
  try {
    await window.fb.auth.signOut();
  } catch (err) {
    console.error('[auth] signOut error:', err);
    if (typeof showToast === 'function') showToast('ログアウトに失敗しました');
  } finally {
    _authBusy = false;
  }
}

function _initAuthStateListener() {
  if (!window.fb || !window.fb.auth) return;
  window.fb.auth.onAuthStateChanged(async (user) => {
    if (user) {
      await _onSignedIn(user);
    } else {
      const loadingEl = document.getElementById('login-loading');
      const btnEl = document.getElementById('btn-login');
      const warnEl = document.getElementById('inapp-warning');
      if (loadingEl) loadingEl.style.display = 'none';
      // v1.8.11: アプリ内ブラウザ判定 → ログインボタンの代わりに警告を出す
      if (_isInAppBrowser()) {
        if (warnEl) warnEl.style.display = 'block';
        if (btnEl) btnEl.style.display = 'none';
      } else {
        if (warnEl) warnEl.style.display = 'none';
        if (btnEl) btnEl.style.display = 'flex';
      }
      _onSignedOut();
    }
  });
}

// v1.8.11: アプリ内ブラウザ（LINE / Instagram / Facebook 等）の判定
function _isInAppBrowser() {
  const ua = navigator.userAgent || '';
  // 既知のアプリ内ブラウザの UA
  if (/Line\//i.test(ua)) return true;
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return true;       // Facebook / Messenger
  if (/Instagram/i.test(ua)) return true;
  if (/Twitter/i.test(ua)) return true;               // X (Twitter)
  if (/Slack\//i.test(ua)) return true;
  if (/MicroMessenger/i.test(ua)) return true;        // WeChat
  if (/KAKAOTALK/i.test(ua)) return true;
  // iOS 系：UA に Safari/ がない → WKWebView 経由（純正 Safari なら必ず Safari/）
  if (/iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua)) return true;
  return false;
}

// v1.8.11: URL コピー用ヘルパー（警告内のボタンから呼ばれる）
window.copyAppUrl = async function (btn) {
  const url = window.location.href;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      // フォールバック
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ コピーしました';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
  } catch (e) {
    alert('コピーに失敗しました：\n' + url);
  }
};

const DEFAULT_COMPANY_ID = 'kobayashi_motors';
const DEFAULT_COMPANY_NAME = '小林モータース';

async function _onSignedIn(user) {
  try {
    let memSnap = await window.fb.db
      .collection('userMemberships').doc(user.uid)
      .collection('memberships').get();

    if (memSnap.empty) {
      if (window.dbStaff && window.dbStaff.consumePendingInviteOnLogin) {
        const result = await window.dbStaff.consumePendingInviteOnLogin(
          user, DEFAULT_COMPANY_ID, DEFAULT_COMPANY_NAME
        );
        if (result && result.created) {
          if (typeof showToast === 'function') showToast('招待を承認しました。CarFlow へようこそ！');
          memSnap = await window.fb.db
            .collection('userMemberships').doc(user.uid)
            .collection('memberships').get();
        }
      }
      if (memSnap.empty) {
        if (typeof showToast === 'function') showToast('このアカウントはまだ登録されていません。管理者の招待が必要です');
        await window.fb.auth.signOut();
        return;
      }
    }

    const memDoc = memSnap.docs[0];
    const membership = memDoc.data();
    const companyId = memDoc.id;

    const staffSnap = await window.fb.db
      .collection('companies').doc(companyId)
      .collection('staff').doc(user.uid).get();

    if (!staffSnap.exists) {
      if (typeof showToast === 'function') showToast('スタッフ登録がありません。管理者にお問合せください');
      await window.fb.auth.signOut();
      return;
    }
    const staff = staffSnap.data();
    if (staff.active === false) {
      if (typeof showToast === 'function') showToast('このアカウントは無効化されています');
      await window.fb.auth.signOut();
      return;
    }

    window.fb.currentUser = user;
    window.fb.currentCompanyId = companyId;
    window.fb.currentMembership = membership;
    window.fb.currentStaff = staff;
    currentUser = staff.customDisplayName || staff.displayName || user.displayName || 'ゲスト';

    if (window.dbCars) {
      try {
        const seeded = await window.dbCars.seedSampleCarsIfEmpty();
        if (seeded) console.log('[auth] サンプル50台を Firestore に投入しました');
        // v1.8.0: 初回 get → そのまま subscribeCars でリアルタイム購読開始
        const list = await window.dbCars.loadCars();
        cars.length = 0;
        list.forEach(c => cars.push(c));
        if (typeof captureProgressSnapshotsIfNew === 'function') {
          try { captureProgressSnapshotsIfNew(); } catch (e) { console.error('[auth] snapshot 失敗', e); }
        }
        // v1.8.80: タスク完了通知ストアを初期化（既存完了タスクは「過去」として記録、ロード時通知は発火しない）
        if (typeof initTaskCompletionStoreForAllCars === 'function') {
          try { initTaskCompletionStoreForAllCars(); } catch (e) { console.error('[auth] task notify init 失敗', e); }
        }
        if (typeof window._carsUnsub === 'function') {
          try { window._carsUnsub(); } catch (e) {}
          window._carsUnsub = null;
        }
        window._carsUnsub = window.dbCars.subscribeCars(function (list, meta) {
          if (typeof applyRealtimeCars === 'function') {
            applyRealtimeCars(list, meta);
          }
        });
      } catch (e) {
        console.error('[auth] cars 読み込み失敗:', e);
        if (typeof showToast === 'function') showToast('車両データの読み込みに失敗しました');
        cars.length = 0;
      }
    }

    if (window.dbSettings) {
      try {
        const seededS = await window.dbSettings.seedSettingsIfEmpty();
        if (seededS) console.log('[auth] settings/main をデフォルト値で初期投入しました');
        await window.dbSettings.loadSettings();
      } catch (e) {
        console.error('[auth] settings 読み込み失敗:', e);
        if (typeof showToast === 'function') showToast('設定の読み込みに失敗しました');
      }
    }

    if (window.dbArchive) {
      try {
        const seededA = await window.dbArchive.seedArchivedCarsIfEmpty();
        if (seededA) console.log('[auth] アーカイブサンプルを Firestore に投入しました');
        const aList = await window.dbArchive.loadArchivedCars();
        if (typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) {
          archivedCars.length = 0;
          aList.forEach(c => archivedCars.push(c));
        }
      } catch (e) {
        console.error('[auth] archivedCars 読み込み失敗:', e);
        if (typeof showToast === 'function') showToast('販売実績の読み込みに失敗しました');
      }
    }

    if (window.dbAudit) {
      try {
        const lList = await window.dbAudit.loadRecentAuditLogs(200);
        if (typeof globalLogs !== 'undefined' && Array.isArray(globalLogs)) {
          globalLogs.length = 0;
          lList.forEach(l => globalLogs.push(l));
        }
      } catch (e) {
        console.error('[auth] auditLogs 読み込み失敗:', e);
      }
    }

    if (window.dbTemplates) {
      try {
        const seededT = await window.dbTemplates.seedTemplatesIfEmpty();
        if (seededT) console.log('[auth] チェックリストテンプレートを Firestore に投入しました');
        await window.dbTemplates.refreshTemplates();
      } catch (e) {
        console.error('[auth] checklistTemplates 読み込み失敗:', e);
        if (typeof showToast === 'function') showToast('チェックリストテンプレートの読み込みに失敗しました');
      }
    }

    if (window.dbBoardNotes) {
      try {
        // v1.8.0: 初回 get → subscribeBoardNotes で購読開始
        const list = await window.dbBoardNotes.loadBoardNotes();
        if (typeof boardNotes !== 'undefined' && Array.isArray(boardNotes)) {
          boardNotes.length = 0;
          list.forEach(n => boardNotes.push(n));
        }
        window.dbBoardNotes.archiveOldDoneNotes(7).then(deletedIds => {
          if (Array.isArray(deletedIds) && deletedIds.length > 0
              && typeof boardNotes !== 'undefined' && Array.isArray(boardNotes)) {
            const set = new Set(deletedIds);
            for (let i = boardNotes.length - 1; i >= 0; i--) {
              if (set.has(boardNotes[i].id)) boardNotes.splice(i, 1);
            }
            if (typeof renderBoardNotes === 'function') renderBoardNotes();
          }
        }).catch(() => {});
        if (typeof window._boardNotesUnsub === 'function') {
          try { window._boardNotesUnsub(); } catch (e) {}
          window._boardNotesUnsub = null;
        }
        window._boardNotesUnsub = window.dbBoardNotes.subscribeBoardNotes(function (list) {
          if (typeof applyRealtimeBoardNotes === 'function') {
            applyRealtimeBoardNotes(list);
          }
        });
      } catch (e) {
        console.error('[auth] boardNotes 読み込み失敗:', e);
      }
    }

    if (window.dbStaff && window.dbStaff.loadAllStaff) {
      window.dbStaff.loadAllStaff().then(list => {
        if (typeof window._setBoardNotesStaffCache === 'function') {
          window._setBoardNotesStaffCache(list);
          if (typeof renderBoardNotes === 'function') renderBoardNotes();
        }
      }).catch(() => {});
    }

    _showAppUI(user, staff, membership);
  } catch (err) {
    console.error('[auth] _onSignedIn error:', err);
    if (typeof showToast === 'function') showToast('ログイン処理中にエラーが発生しました');
    try { await window.fb.auth.signOut(); } catch (e) {}
  }
}

function _showAppUI(user, staff, membership) {
  document.querySelectorAll('.overlay.open, .confirm-overlay.open').forEach(el => el.classList.remove('open'));
  // v1.8.0: 同期インジケータをアプリ画面の時のみ出すためのフラグ
  document.body.classList.add('app-active');
  if (typeof setSyncStatus === 'function') {
    setSyncStatus(navigator.onLine ? 'online' : 'offline');
  }

  if (typeof _refreshHeaderAvatars === 'function') _refreshHeaderAvatars();
  if (typeof _applyRoleVisibility === 'function') _applyRoleVisibility();

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  calYear = new Date().getFullYear();
  calMonth = new Date().getMonth();

  if (typeof fetchJpHolidays === 'function') fetchJpHolidays();

  mobileAdminMode = false;
  sidebarCollapsed = false;
  document.body.classList.remove('sidebar-collapsed');
  applyMobileClass();

  if (typeof renderAll === 'function') renderAll();
  if (typeof renderDashboard === 'function') renderDashboard();
  document.body.classList.add('panel-dashboard-active');
  if (typeof refreshTopbarFontSizeLabel === 'function') refreshTopbarFontSizeLabel();
  if (isMobileMode()) forceProgressView();

  console.log('[auth] signed in as', { uid: user.uid, companyId: window.fb.currentCompanyId, role: staff.role });
}

function _onSignedOut() {
  // v1.8.0: 購読を解除してリーク防止
  if (typeof window._carsUnsub === 'function') {
    try { window._carsUnsub(); } catch (e) {}
    window._carsUnsub = null;
  }
  if (typeof window._boardNotesUnsub === 'function') {
    try { window._boardNotesUnsub(); } catch (e) {}
    window._boardNotesUnsub = null;
  }
  document.body.classList.remove('app-active');
  if (window.fb) {
    window.fb.currentUser = null;
    window.fb.currentCompanyId = null;
    window.fb.currentMembership = null;
    window.fb.currentStaff = null;
  }
  currentUser = '';
  mobileAdminMode = false;
  sidebarCollapsed = false;
  document.body.classList.remove('sidebar-collapsed');
  const loginEl = document.getElementById('login-screen');
  const appEl = document.getElementById('app');
  if (loginEl) loginEl.style.display = 'flex';
  if (appEl) appEl.style.display = 'none';
  refreshAdminToggleButtons();
}

function _setLoginBusy(busy) {
  const btn = document.querySelector('.btn-login');
  if (!btn) return;
  btn.disabled = !!busy;
  btn.style.opacity = busy ? '0.6' : '1';
  btn.style.pointerEvents = busy ? 'none' : '';
  if (busy) {
    btn.dataset._origText = btn.dataset._origText || btn.textContent;
    btn.textContent = 'ログイン中…';
  } else if (btn.dataset._origText) {
    btn.textContent = btn.dataset._origText;
  }
}

function forceProgressView() {
  document.querySelectorAll('.side-panel,.view').forEach(v => {
    v.classList.remove('open','active');
    v.style.display = 'none';
  });
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const progressTab = Array.from(document.querySelectorAll('.tab')).find(t => t.textContent.includes('進捗'));
  if (progressTab) progressTab.classList.add('active');
  const view = document.getElementById('view-progress');
  if (view) {
    view.style.display = 'flex';
    view.classList.add('active');
  }
  document.body.classList.remove('panel-dashboard-active');
  if (typeof renderProgress === 'function') renderProgress();
}

window.addEventListener('resize', () => {
  applyMobileClass();
  const appEl = document.getElementById('app');
  if (appEl && appEl.style.display !== 'none' && isMobileMode()) {
    const activeTab = document.querySelector('.tab.active');
    const txt = (activeTab && activeTab.textContent) || '';
    const isMobileAllowed = txt.includes('進捗') || txt.includes('重要') || txt.includes('作業実績');
    if (!isMobileAllowed) forceProgressView();
  }
});

function _bootAuth() {
  if (window.fb && window.fb.auth) _initAuthStateListener();
  else setTimeout(_bootAuth, 50);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _bootAuth);
} else {
  _bootAuth();
}

// v1.5.5: トップバー / サイドバーのアバター・表示名を再描画
// v1.7.42: サイドバー下のロール表示も動的化
function _refreshHeaderAvatars() {
  const user = window.fb && window.fb.currentUser;
  const staff = window.fb && window.fb.currentStaff;
  if (!user) return;

  const name = (staff && (staff.customDisplayName || staff.displayName))
    || user.displayName
    || (user.email ? user.email.split('@')[0] : 'ゲスト');

  const photoURL = (staff && (staff.customPhotoURL || staff.photoURL)) || user.photoURL || '';

  function _initials(s) {
    if (!s) return '?';
    const t = String(s).trim();
    const m = t.match(/[A-Za-z]+/g);
    if (m && m.length >= 2) return (m[0][0] + m[1][0]).toUpperCase();
    if (m && m.length === 1) return m[0].slice(0, 2).toUpperCase();
    return t.slice(0, 2);
  }

  const ini = _initials(name);
  const roleLabels = { admin: '管理者', manager: 'マネージャ', staff: 'スタッフ', viewer: '閲覧のみ' };
  const role = (staff && staff.role) || 'staff';
  const roleLabel = roleLabels[role] || 'スタッフ';

  function _setAvatar(elId, ini, photoURL) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (photoURL) {
      el.textContent = '';
      el.style.backgroundImage = 'url("' + photoURL + '")';
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    } else {
      el.textContent = ini;
      el.style.backgroundImage = '';
    }
  }

  _setAvatar('u-av', ini, photoURL);
  _setAvatar('sb-av', ini, photoURL);

  const uName = document.getElementById('u-name');
  if (uName) uName.textContent = name;
  const sbName = document.getElementById('sb-name');
  if (sbName) sbName.textContent = name;
  const sbRole = document.getElementById('sb-role');
  if (sbRole) sbRole.textContent = roleLabel;
}
