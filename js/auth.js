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

// v2.2.12: スマホ幅でフルメニューモードの時だけ true（管理者画面のスマホ表示用）
function isMobileAdminMode() {
  return window.innerWidth <= 768 && mobileAdminMode;
}

// v2.2.12: スマホでフルメニュー時に重い編集UIをガード
function blockOnMobileAdmin(label) {
  if (document.body.classList.contains('mobile-admin')) {
    if (typeof showToast === 'function') showToast('' + label + 'はPCから操作してください');
    return true;
  }
  return false;
}

function applyMobileClass() {
  document.body.classList.toggle('mobile', isMobileMode());
  document.body.classList.toggle('mobile-admin', isMobileAdminMode());
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
  if (typeof showToast === 'function') showToast('フルメニューに切替えました');
}

function exitAdminMode() {
  mobileAdminMode = false;
  applyMobileClass();
  // v2.2.17: 戻り時に scroll 位置だけリセット
  window.scrollTo(0, 0);
  if (typeof forceProgressView === 'function') forceProgressView();
  if (typeof showToast === 'function') showToast('クイックメニューに戻りました');
}

function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed);
}

// v2.2.14: モバイル（iOS/Android）はリダイレクト方式の方が圧倒的に早い
// （signInWithPopup はタブ間 postMessage に依存していて、Safari のタブ suspend で激遅になる）
function _shouldUseRedirect() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod|Android/i.test(ua);
}

async function doLogin() {
  if (_authBusy) return;
  if (!window.fb || !window.fb.auth) {
    if (typeof showToast === 'function') showToast('Firebase 初期化エラー', 'CF-0001');
    return;
  }
  if (window.fb.auth.currentUser) return;
  _authBusy = true;
  _setLoginBusy(true);
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    if (_shouldUseRedirect()) {
      // モバイル：同タブで Google に遷移して戻る
      // ※ ここから先は戻ってこない（ページ遷移）
      await window.fb.auth.signInWithRedirect(provider);
    } else {
      await window.fb.auth.signInWithPopup(provider);
    }
  } catch (err) {
    console.error('[auth] signIn error:', err);
    let msg = 'ログインに失敗しました';
    if (err && err.code === 'auth/popup-closed-by-user') msg = 'ログインがキャンセルされました';
    else if (err && err.code === 'auth/popup-blocked') msg = 'ポップアップがブロックされました';
    else if (err && err.code === 'auth/unauthorized-domain') msg = 'このドメインは Firebase に未登録です';
    if (typeof showToast === 'function') showToast(msg);
    _authBusy = false;
    _setLoginBusy(false);
  }
  // 注意：リダイレクト方式の場合、await signInWithRedirect は遷移開始前に return することがある
  // ので finally は使わず、popup と error 時だけ busy を解除する
  if (!_shouldUseRedirect()) {
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
    if (typeof showToast === 'function') showToast('ログアウトに失敗しました', 'CF-0002');
  } finally {
    _authBusy = false;
  }
}

function _initAuthStateListener() {
  if (!window.fb || !window.fb.auth) return;
  // v2.2.14: モバイル signInWithRedirect 戻りのエラーをキャッチ
  // 正常時は onAuthStateChanged が発火するのでここでは何もしない
  if (window.fb.auth.getRedirectResult) {
    window.fb.auth.getRedirectResult().catch((err) => {
      console.error('[auth] getRedirectResult error:', err);
      if (typeof showToast === 'function') {
        showToast('ログインに失敗しました：' + (err.code || err.message || '不明'), 'CF-0003');
      }
    });
  }
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
      btn.innerHTML = icoE('✓ コピーしました');
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
  } catch (e) {
    alert('コピーに失敗しました：\n' + url);
  }
};

const DEFAULT_COMPANY_ID = 'kobayashi_motors';
const DEFAULT_COMPANY_NAME = '小林モータース';

// v2.18.0：CoreFlow一本化。staff/userMemberships 廃止。入室判定は portalMembers 一本に。
// portalMembers の日本語ロール → CarFlow 内部ロール
const ROLE_JP_TO_EN = {
  '管理者':'admin','マネージャー':'manager','マネージャ':'manager',
  'スタッフ':'staff','作業者':'worker','閲覧':'viewer','閲覧のみ':'viewer'
};
function _normEmailForLookup(s){
  if (typeof s !== 'string') return '';
  return s.normalize('NFKC').toLowerCase().trim();
}
// portalMembers ドキュメント → CarFlow 内部の仮想 staff オブジェクトに翻訳
function _portalMemberToStaff(m, user) {
  const cf = m.carflow || {};
  const roleJp = cf.role || 'スタッフ';
  const role = ROLE_JP_TO_EN[roleJp] || 'staff';
  return {
    uid: m.uid || m.id || (user && user.uid),
    email: m.email || (user && user.email) || '',
    displayName: m.gname || (user && user.displayName) || '',
    photoURL: (user && user.photoURL) || null,
    customDisplayName: m.name || '',
    customPhotoURL: m.photo || null,
    role: role,
    active: m.active !== false,
    group: cf.group || '（なし）',
    // v2.18.6：CarFlow は carflow.sortOrder だけ見る（CoreFlow全社並びへのフォールバックは廃止）。
    //          不足分はログイン時の auto-seed が補完する。
    sortOrder: (typeof cf.sortOrder === 'number') ? cf.sortOrder : undefined,
    // permissions は undefined のまま → hasPermission() が DEFAULT_PERMISSIONS にフォールバック
    readAnnouncements: [],   // 後で userPrefs から読込
    // 互換のため補足フィールドを残す
    name: m.name, dept: m.dept, title: m.title,
  };
}
// portalMembers から自分のレコードを探す（uid → email → 大文字小文字違い救済）
async function _findMyPortalMember(user, companyId) {
  const coll = window.fb.db.collection('companies').doc(companyId).collection('portalMembers');
  // ①uid 一致
  try {
    const doc = await coll.doc(user.uid).get();
    if (doc.exists) { const m = doc.data() || {}; m.id = doc.id; return m; }
  } catch (e) { console.warn('[auth] portalMembers uid lookup failed:', e); }
  // ②email 一致
  if (user.email) {
    const norm = _normEmailForLookup(user.email);
    try {
      // ②-a 完全一致
      let snap = await coll.where('email','==',user.email).limit(1).get();
      // ②-b 小文字一致
      if (snap.empty && norm !== user.email) {
        snap = await coll.where('email','==',norm).limit(1).get();
      }
      if (!snap.empty) { const m = snap.docs[0].data() || {}; m.id = snap.docs[0].id; return m; }
      // ②-c 全件スキャンで大文字小文字／全角＠違い救済
      // 🔴 v2.35.0：名簿の一覧取得を「会社メンバーだけ」に締めたので、
      //    **まだ入室していない人（初回ログイン）ではここは通らなくなった**。
      //    ②-a／②-b（自分のメールで絞った検索）が正規のルート。
      //    ここが必要になるのは「CoreFlow の名簿のメールが Google のメールと表記違い」の時だけ。
      //    その場合は下の _onSignedIn がその旨を伝えるので、CoreFlow 側で直してもらう。
      const all = await coll.limit(200).get();
      let matched = null;
      all.forEach(d => {
        if (matched) return;
        const e = _normEmailForLookup(String((d.data()||{}).email||''));
        if (e && e === norm) matched = d;
      });
      if (matched) { const m = matched.data() || {}; m.id = matched.id; return m; }
    } catch (e) { console.warn('[auth] portalMembers email lookup failed:', e); }
  }
  return null;
}

async function _onSignedIn(user) {
  try {
    // 1) CoreFlow 名簿で自分を探す（uid → email 順）
    const companyId = DEFAULT_COMPANY_ID;
    const member = await _findMyPortalMember(user, companyId);
    if (!member) {
      if (typeof showToast === 'function') showToast('CoreFlow名簿に登録がありません。CoreFlowで追加してもらってください（すでに登録済みなら、名簿のメールアドレスがログインに使ったものと同じ表記か確認してください）', 'CF-0004');
      await window.fb.auth.signOut();
      return;
    }
    if (member.active === false) {
      if (typeof showToast === 'function') showToast('このアカウントは無効化されています', 'CF-0005');
      await window.fb.auth.signOut();
      return;
    }
    if (!member.carflow || member.carflow.on !== true) {
      if (typeof showToast === 'function') showToast('CarFlowの利用権限がありません。CoreFlowの名簿で「CarFlow＝使える」をオンにしてもらってください', 'CF-0006');
      await window.fb.auth.signOut();
      return;
    }
    // 2) 仮想 staff オブジェクトに変換
    const staff = _portalMemberToStaff(member, user);
    const membership = { role: staff.role, companyId: companyId };  // 互換

    window.fb.currentUser = user;
    window.fb.currentCompanyId = companyId;
    window.fb.currentMembership = membership;
    window.fb.currentMember = member;
    window.fb.currentStaff = staff;
    currentUser = staff.customDisplayName || staff.displayName || user.displayName || 'ゲスト';

    // v2.20.0: 本人↔CoreFlow名簿の橋渡しを userPrefs/{uid} に記録する。
    //   Firestoreルールの“追加判定”が、この memberId が指す名簿レコードの email と
    //   本人の検証済みGoogleメールの一致を見てメンバー認可する（staffドキュメント不要に）。
    //   staffを持つ既存メンバーには影響なし（ルールはstaff判定を優先・これは将来用の保険）。
    try {
      await window.fb.db.collection('companies').doc(companyId)
        .collection('userPrefs').doc(user.uid)
        .set({ memberId: member.id, memberEmail: (member.email || user.email || '') }, { merge: true });
    } catch (e) { console.warn('[auth] userPrefs への memberId 記録に失敗（処理は継続）:', e); }

    // 3) お知らせ既読など個人設定を userPrefs から読込
    if (window.dbUserPrefs && window.dbUserPrefs.loadMyPrefs) {
      try {
        const prefs = await window.dbUserPrefs.loadMyPrefs();
        if (prefs && Array.isArray(prefs.readAnnouncements)) {
          staff.readAnnouncements = prefs.readAnnouncements;
        }
      } catch (e) { console.warn('[auth] userPrefs load failed:', e); }
    }
    // 4) v2.18.6：admin の時、carflow.sortOrder が未設定の人を自動で補完
    //    （新メンバー追加直後でも、admin が CarFlow を開いた瞬間に独立化が成立する）
    if (staff.role === 'admin') {
      _autoSeedAppSortOrder('carflow').catch(e => console.warn('[auth] auto-seed carflow.sortOrder failed:', e));
    }

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
        if (typeof showToast === 'function') showToast('車両データの読み込みに失敗しました', 'CF-0007');
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
        if (typeof showToast === 'function') showToast('設定の読み込みに失敗しました', 'CF-0008');
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
        /* 🔴 2026-09-08（v2.55.0）ここから**実績もリアルタイム購読**する。
           別の端末で月次締めをしたら、こちらの画面もその場で追いつく。 */
        if (typeof window._archUnsub === 'function') {
          try { window._archUnsub(); } catch (e) {}
          window._archUnsub = null;
        }
        if (typeof window.dbArchive.subscribeArchivedCars === 'function') {
          window._archUnsub = window.dbArchive.subscribeArchivedCars(function (list) {
            if (typeof archivedCars === 'undefined' || !Array.isArray(archivedCars)) return;
            archivedCars.length = 0;
            list.forEach(c => archivedCars.push(c));
            if (typeof renderAll === 'function')       { try { renderAll(); }       catch (e) {} }
            if (typeof renderDashboard === 'function') { try { renderDashboard(); } catch (e) {} }
          });
        }
        // v2.1.0: アプリ起動時に「archive 後 90 日超え写真」をクリーンアップ
        if (window.backoffice && typeof window.backoffice.cleanupExpiredArchivedPhotos === 'function') {
          try { window.backoffice.cleanupExpiredArchivedPhotos(); } catch (e) { console.error('[auth] cleanupExpiredArchivedPhotos failed', e); }
        }
        // v2.2.7: 完了から3日経過した done 付箋を削除（自動付箋＋手動付箋とも対象）※v2.10.4で7日→3日
        // boardNotes の読み込み完了を待つため少し遅延
        if (window.taskMemoAutoNote && typeof window.taskMemoAutoNote.cleanup === 'function') {
          setTimeout(() => {
            try { window.taskMemoAutoNote.cleanup(); } catch (e) { console.error('[auth] taskMemoAutoNote.cleanup failed', e); }
          }, 2000);
        }
      } catch (e) {
        console.error('[auth] archivedCars 読み込み失敗:', e);
        if (typeof showToast === 'function') showToast('販売実績の読み込みに失敗しました', 'CF-0009');
      }
    }

    // v2.17.0: manualNumbers（管理番号リストの手入力記録）
    if (window.dbManual) {
      try {
        const mList = await window.dbManual.loadManualNumbers();
        if (typeof manualNumbers !== 'undefined' && Array.isArray(manualNumbers)) {
          manualNumbers.length = 0;
          mList.forEach(m => manualNumbers.push(m));
        }
        try {
          window.dbManual.subscribeManualNumbers(function (list) {
            if (typeof manualNumbers === 'undefined' || !Array.isArray(manualNumbers)) return;
            manualNumbers.length = 0;
            list.forEach(m => manualNumbers.push(m));
            if (typeof renderNumList === 'function' && document.getElementById('panel-numlist') &&
                document.getElementById('panel-numlist').classList.contains('open')) {
              renderNumList();
            }
          });
        } catch (eSub) {
          console.warn('[auth] subscribeManualNumbers failed (非致命)', eSub);
        }
      } catch (e) {
        console.error('[auth] manualNumbers 読み込み失敗:', e);
      }
    }

    // v2.19.0: tentativeCars（仮登録車両・業務カウント対象外）
    if (window.dbTentative) {
      try {
        const tList = await window.dbTentative.loadTentativeCars();
        if (typeof tentativeCars !== 'undefined' && Array.isArray(tentativeCars)) {
          tentativeCars.length = 0;
          tList.forEach(t => tentativeCars.push(t));
        }
        try {
          window.dbTentative.subscribeTentativeCars(function (list) {
            if (typeof tentativeCars === 'undefined' || !Array.isArray(tentativeCars)) return;
            tentativeCars.length = 0;
            list.forEach(t => tentativeCars.push(t));
            if (typeof renderKanban === 'function' &&
                document.getElementById('view-kanban') &&
                document.getElementById('view-kanban').classList.contains('active')) {
              renderKanban();
            }
          });
        } catch (eSub) {
          console.warn('[auth] subscribeTentativeCars failed (非致命)', eSub);
        }
      } catch (e) {
        console.error('[auth] tentativeCars 読み込み失敗:', e);
      }
    }

    // v2.16.0: deletedCars（管理番号台帳：「正式に削除」された車両の最小情報）
    if (window.dbDeleted) {
      try {
        const dList = await window.dbDeleted.loadDeletedCars();
        if (typeof deletedCars !== 'undefined' && Array.isArray(deletedCars)) {
          deletedCars.length = 0;
          dList.forEach(d => deletedCars.push(d));
        }
        // 以降の他端末からの追加もリアルタイムで反映（軽量データなので常時購読でOK）
        try {
          window.dbDeleted.subscribeDeletedCars(function (list) {
            if (typeof deletedCars === 'undefined' || !Array.isArray(deletedCars)) return;
            deletedCars.length = 0;
            list.forEach(d => deletedCars.push(d));
            if (typeof renderNumList === 'function' && document.getElementById('panel-numlist') &&
                document.getElementById('panel-numlist').classList.contains('open')) {
              renderNumList();
            }
          });
        } catch (eSub) {
          console.warn('[auth] subscribeDeletedCars failed (非致命)', eSub);
        }
      } catch (e) {
        console.error('[auth] deletedCars 読み込み失敗:', e);
      }
    }

    if (window.dbAudit) {
      try {
        const lList = await window.dbAudit.loadRecentAuditLogs(1000); // v2.27.0: 200→1000（軽いテキストなので余裕を持って表示）
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
        if (typeof showToast === 'function') showToast('チェックリストテンプレートの読み込みに失敗しました', 'CF-0010');
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
        window.dbBoardNotes.archiveOldDoneNotes(3).then(deletedIds => {
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

    /* v2.35.0：名簿は CoreMembers が元。ログインできたらすぐ購読を始める。 */
    if (window.CFMembers) {
      try {
        window.CFMembers.start();
        /* 🔴 付箋には【CoreMembers 全員】を渡す（ログインしない人も担当に選べる）。
           名簿が変わったら付箋も描き直す＝呼び名や部署を直したら CarFlow にもすぐ出る。 */
        window.CFMembers.onChange(function (list) {
          if (typeof window._setBoardNotesStaffCache === 'function') {
            window._setBoardNotesStaffCache(list);
            if (typeof renderBoardNotes === 'function') renderBoardNotes();
          }
        });
      } catch (e) { console.warn('[auth] CFMembers.start 失敗', e); }
    }
    if (window.dbStaff && window.dbStaff.loadAllMembers) {
      window.dbStaff.loadAllMembers().then(list => {
        if (typeof window._setBoardNotesStaffCache === 'function') {
          window._setBoardNotesStaffCache(list);
          if (typeof renderBoardNotes === 'function') renderBoardNotes();
        }
      }).catch(() => {});
    }

    _showAppUI(user, staff, membership);
  } catch (err) {
    console.error('[auth] _onSignedIn error:', err);
    if (typeof showToast === 'function') showToast('ログイン処理中にエラーが発生しました', 'CF-0011');
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

  // v2.38.0: 祝日は共通部品 js/holidays.js（window.Holidays）が自分で取りに行く＝呼び出し不要

  mobileAdminMode = false;
  sidebarCollapsed = false;
  document.body.classList.remove('sidebar-collapsed');
  applyMobileClass();

  if (typeof renderAll === 'function') renderAll();
  if (typeof renderDashboard === 'function') renderDashboard();
  // v2.7: お知らせ — 未読バッジ更新＋新着ポップアップ（ログイン後・currentStaff確定後）
  if (typeof refreshAnnounceBadge === 'function') refreshAnnounceBadge();
  if (typeof maybeShowAnnouncePopup === 'function') {
    setTimeout(function () { try { maybeShowAnnouncePopup(); } catch (e) { console.warn('[auth] announce popup:', e); } }, 600);
  }
  document.body.classList.add('panel-dashboard-active');
  if (typeof refreshTopbarFontSizeLabel === 'function') refreshTopbarFontSizeLabel();
  if (isMobileMode()) forceProgressView();

  console.log('[auth] signed in as', { uid: user.uid, companyId: window.fb.currentCompanyId, role: staff.role });
}

// ============================================================
// v2.18.6：アプリ別 sortOrder の自動シード（admin専用）
// ----------------------------------------
// 各アプリは「自分のapp.sortOrderだけ」を見る（フォールバックなし）。
// admin がそのアプリにログインした時、未設定の人がいたら
// CoreFlow全社並び（m.sortOrder）から一度だけコピーして固定する。
//
// 効果：
//   - admin が一度ログインすれば、新規メンバーも独立した並び順を持つ
//   - 以降 CoreFlow をいくらドラッグしてもそのアプリの並びは影響を受けない
//
// 将来 PitFlow / MoneyFlow / GrowFlow なども同じ呼び出しで対応可。
//   _autoSeedAppSortOrder('pitflow') / ('moneyflow') / ...
// ============================================================
async function _autoSeedAppSortOrder(appKey) {
  if (!appKey) return;
  if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return;
  if (!window.fb.currentStaff || window.fb.currentStaff.role !== 'admin') return;
  const coll = window.fb.db
    .collection('companies').doc(window.fb.currentCompanyId)
    .collection('portalMembers');
  try {
    const snap = await coll.get();
    const todos = [];
    snap.forEach(d => {
      const m = d.data() || {};
      const app = m[appKey] || {};
      if (app.on !== true) return;                           // そのアプリを使わない人はスキップ
      if (typeof app.sortOrder === 'number') return;         // 既に独自並びがあればスキップ
      const src = (typeof m.sortOrder === 'number') ? m.sortOrder : 999999;
      todos.push({ id: d.id, name: m.name || d.id, src });
    });
    if (!todos.length) return;
    console.log('[auth] auto-seeding ' + appKey + '.sortOrder for', todos.length, 'members');
    await Promise.all(todos.map(t =>
      coll.doc(t.id).set({
        [appKey]: { sortOrder: t.src },
        updatedAt: window.fb.serverTimestamp()
      }, { merge: true })
    ));
    console.log('[auth] auto-seed done:', todos.map(t => t.name + '→' + t.src).join(', '));
  } catch (e) {
    console.warn('[auth] _autoSeedAppSortOrder failed for ' + appKey + ':', e);
  }
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
  /* v2.35.0：名簿（CoreMembers）の購読も解除する */
  if (window.CFMembers) { try { window.CFMembers.stop(); } catch (e) {} }
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
  // ⚠ v2.50.0：ここで btn.textContent を書くと Googleロゴの<svg>ごと消える。
  //    文字は中の .pl-label だけ差し替える（PitFlow v1.18.1 と同じ直し）。
  const lab = btn.querySelector('.pl-label');
  if (lab) {
    if (busy) {
      lab.dataset._origText = lab.dataset._origText || lab.textContent;
      lab.textContent = 'ログイン中…';
    } else if (lab.dataset._origText) {
      lab.textContent = lab.dataset._origText;
    }
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
