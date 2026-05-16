// ========================================
// demo-auth-mock.js
// デモ版用：認証フローを簡略化（本番 auth.js の代替）
// ----------------------------------------
// ・ログイン画面の Google ボタンを「デモを始める」ボタンに改造
// ・クリック → モックユーザーセット → サンプル投入 → アプリ起動
// ・本番 _showAppUI() がやってることを再現
// ========================================

(function () {
  'use strict';

  const DEMO_USER = {
    uid: 'demo-user-001',
    email: 'demo@carflow.local',
    displayName: '山田太郎',
    photoURL: null,
  };
  const DEMO_STAFF = {
    uid: 'demo-user-001',
    name: '山田太郎',
    displayName: '山田太郎',
    customDisplayName: '山田太郎',
    role: 'admin',
    active: true,
    permissions: {
      canEditSettings: true,
      canEditTemplates: true,
      canCloseMonth: true,
      canInviteMember: true,
      canDeleteCar: true,
    },
    photoURL: null,
  };
  const DEMO_MEMBERSHIP = {
    companyId: 'demo-company',
    role: 'admin',
  };

  // -----------------------------------
  // ログイン処理
  // -----------------------------------
  async function doDemoLogin() {
    console.log('[demo-auth] starting demo login...');
    const btn = document.getElementById('demo-login-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 起動中…'; }

    // window.fb にユーザー情報セット
    window.fb.currentUser = DEMO_USER;
    window.fb.currentCompanyId = 'demo-company';
    window.fb.currentStaff = DEMO_STAFF;
    window.fb.currentMembership = DEMO_MEMBERSHIP;

    // グローバル currentUser（state.js 由来、いろんな箇所で参照）もセット
    if (typeof currentUser !== 'undefined') {
      currentUser = DEMO_STAFF.customDisplayName;
    } else {
      window.currentUser = DEMO_STAFF.customDisplayName;
    }

    try {
      // 1. サンプルデータ投入
      if (typeof window.demoSeedAll === 'function') {
        await window.demoSeedAll();
      }

      // 2. メモリへ各データを読み込み
      if (window.dbSettings && window.dbSettings.loadSettings) {
        await window.dbSettings.loadSettings();
      }
      if (window.dbCars && window.dbCars.loadCars) {
        const list = await window.dbCars.loadCars();
        if (typeof cars !== 'undefined') { cars.length = 0; list.forEach((c) => cars.push(c)); }
      }
      if (window.dbArchive && window.dbArchive.loadArchivedCars) {
        const aList = await window.dbArchive.loadArchivedCars();
        if (typeof archivedCars !== 'undefined') { archivedCars.length = 0; aList.forEach((c) => archivedCars.push(c)); }
      }
      if (window.dbTemplates && window.dbTemplates.refreshTemplates) {
        try { await window.dbTemplates.refreshTemplates(); } catch (e) { console.warn(e); }
      }
      if (window.dbBoardNotes && window.dbBoardNotes.loadBoardNotes) {
        const list = await window.dbBoardNotes.loadBoardNotes();
        if (typeof boardNotes !== 'undefined') { boardNotes.length = 0; list.forEach((n) => boardNotes.push(n)); }
      }
      if (window.dbStaff && window.dbStaff.loadAllStaff) {
        try { await window.dbStaff.loadAllStaff(); } catch (e) { console.warn(e); }
      }
    } catch (err) {
      console.error('[demo-auth] data load error:', err);
    }

    // 3. UIを切り替え（_showAppUI 相当）
    document.querySelectorAll('.overlay.open, .confirm-overlay.open').forEach((el) => el.classList.remove('open'));
    document.body.classList.add('app-active');
    document.body.classList.add('panel-dashboard-active');
    document.getElementById('login-screen').style.display = 'none';
    const appEl = document.getElementById('app');
    if (appEl) appEl.style.display = 'flex';

    // calendar 初期値
    try { calYear = new Date().getFullYear(); } catch (e) { window.calYear = new Date().getFullYear(); }
    try { calMonth = new Date().getMonth(); } catch (e) { window.calMonth = new Date().getMonth(); }

    // 祝日（外部APIなのでスキップ。デモには不要）
    // if (typeof fetchJpHolidays === 'function') fetchJpHolidays();

    // モバイル表示判定
    if (typeof mobileAdminMode !== 'undefined') mobileAdminMode = false;
    if (typeof sidebarCollapsed !== 'undefined') sidebarCollapsed = false;
    document.body.classList.remove('sidebar-collapsed');
    if (typeof applyMobileClass === 'function') { try { applyMobileClass(); } catch (e) {} }

    // 描画
    if (typeof renderAll === 'function') { try { renderAll(); } catch (e) { console.warn(e); } }
    if (typeof renderDashboard === 'function') { try { renderDashboard(); } catch (e) { console.warn(e); } }

    // ロール表示制御
    if (typeof _applyRoleVisibility === 'function') { try { _applyRoleVisibility(); } catch (e) {} }
    if (typeof _refreshHeaderAvatars === 'function') { try { _refreshHeaderAvatars(); } catch (e) {} }

    // 初期タブを「タスク管理（カンバン）」に設定して、ダッシュボードから1ステップで何か見せる
    try {
      const kanbanTab = document.querySelector('.tab[onclick*="kanban"]');
      if (kanbanTab && typeof switchTab === 'function') {
        switchTab('kanban', kanbanTab);
      }
    } catch (e) { console.warn('[demo-auth] initial tab setup:', e); }

    // バナー
    _showDemoBanner();

    console.log('[demo-auth] demo login complete');
  }

  // -----------------------------------
  // デモバナー（画面上部に常時表示）
  // -----------------------------------
  function _showDemoBanner() {
    if (document.getElementById('demo-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'demo-banner';
    banner.innerHTML = `
      <span>🧪 <strong>デモ版</strong>　保存されません・本物のLINE通知は飛びません　</span>
      <button onclick="location.reload()">最初からやり直す</button>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
    document.body.classList.add('demo-mode');
  }

  // -----------------------------------
  // ログイン画面の差し替え
  // -----------------------------------
  function _renderDemoLoginUI() {
    const loginScreen = document.getElementById('login-screen');
    if (!loginScreen) return;
    loginScreen.innerHTML = `
      <div class="login-card" style="max-width:480px;margin:auto;padding:30px 28px;background:var(--bg2,#1a1a1a);border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.3);text-align:center">
        <div class="login-logo" style="font-size:48px;margin-bottom:6px">🚗</div>
        <div class="login-title" style="font-size:32px;font-weight:800;margin-bottom:4px;color:var(--text,#fff)">CarFlow</div>
        <div class="login-ver" style="font-size:13px;color:var(--text3,#999);margin-bottom:8px">v1.8.105 — デモ版</div>
        <p style="font-size:13px;color:var(--text2,#ccc);margin:8px 0 16px;line-height:1.6">
          中古車整備工場・販売店向け<br>業務管理ツール
        </p>
        <div class="demo-login-note">
          <strong>🧪 これはデモ版です</strong><br>
          サンプルデータが入った状態で起動します。<br>
          自由に触ってもらってOK。<br>
          保存はされません（リロードでリセット）。
        </div>
        <button id="demo-login-btn" class="demo-login-btn" onclick="window.demoLogin()">
          ▶ デモを始める
        </button>
        <div style="font-size:11px;color:var(--text3,#999);margin-top:12px">
          🏭 KOBAYASHI MOTORS
        </div>
      </div>
    `;
    loginScreen.style.display = 'flex';
    loginScreen.style.alignItems = 'center';
    loginScreen.style.justifyContent = 'center';
    loginScreen.style.minHeight = '100vh';
  }

  function _init() {
    _renderDemoLoginUI();
    console.log('[demo-auth] login UI replaced');
  }

  window.demoLogin = doDemoLogin;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
