// ========================================
// demo-auth-mock.js
// デモ版用：認証フローを簡略化
// ----------------------------------------
// ログイン画面の Google ボタンを「デモを始める」ボタンに改造。
// クリックするとモックユーザーをセット → サンプルデータ投入 → アプリ起動。
// 本番 auth.js は読み込まない（index.html 側で除外）。
// ========================================

(function () {
  'use strict';

  // デモ用固定ユーザー
  const DEMO_USER = {
    uid: 'demo-user-001',
    email: 'demo@carflow.local',
    displayName: 'デモユーザー',
    photoURL: null,
  };

  // -----------------------------------
  // ログイン処理
  // -----------------------------------
  async function doDemoLogin() {
    console.log('[demo-auth] starting demo login...');

    // window.fb にユーザーをセット
    window.fb.currentUser = DEMO_USER;
    window.fb.currentCompanyId = 'demo-company';

    // 1. サンプルデータ投入
    if (typeof window.demoSeedAll === 'function') {
      console.log('[demo-auth] seeding sample data...');
      await window.demoSeedAll();
    }

    // 2. 各 db モジュールが提供する load 系を呼んでメモリに読み込む
    try {
      if (window.dbCars && window.dbCars.loadCars) {
        const list = await window.dbCars.loadCars();
        if (typeof cars !== 'undefined') { cars.length = 0; list.forEach((c) => cars.push(c)); }
      }
      if (window.dbSettings && window.dbSettings.loadSettings) {
        await window.dbSettings.loadSettings();
      }
      if (window.dbArchive && window.dbArchive.loadArchivedCars) {
        const aList = await window.dbArchive.loadArchivedCars();
        if (typeof archivedCars !== 'undefined') { archivedCars.length = 0; aList.forEach((c) => archivedCars.push(c)); }
      }
      if (window.dbTemplates && window.dbTemplates.refreshTemplates) {
        await window.dbTemplates.refreshTemplates();
      }
      if (window.dbBoardNotes && window.dbBoardNotes.loadBoardNotes) {
        const list = await window.dbBoardNotes.loadBoardNotes();
        if (typeof boardNotes !== 'undefined') { boardNotes.length = 0; list.forEach((n) => boardNotes.push(n)); }
      }
      if (window.dbStaff && window.dbStaff.loadAllStaff) {
        await window.dbStaff.loadAllStaff();
      }
    } catch (err) {
      console.warn('[demo-auth] data load partial failure:', err);
    }

    // 3. ログイン画面を隠してアプリ画面を表示
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app-screen');
    if (loginScreen) loginScreen.style.display = 'none';
    if (appScreen) appScreen.style.display = '';

    // 4. UI 全体描画
    if (typeof renderAll === 'function') renderAll();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof renderActions === 'function') renderActions();

    // 5. デモモードバナー表示
    _showDemoBanner();

    console.log('[demo-auth] demo login complete');
  }

  // -----------------------------------
  // デモモードバナー（画面上部に常時表示）
  // -----------------------------------
  function _showDemoBanner() {
    if (document.getElementById('demo-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'demo-banner';
    banner.innerHTML = `
      <span>🧪 <strong>デモ版</strong>　保存されません・本物のLINE通知も飛びません　</span>
      <button onclick="location.reload()">最初からやり直す</button>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
    document.body.classList.add('demo-mode');
  }

  // -----------------------------------
  // ログイン画面に「デモを始める」ボタンを描画
  // -----------------------------------
  function _renderDemoLoginUI() {
    // 本番のログインUI を全部消して、デモ用 1ボタンに置き換える
    const loginScreen = document.getElementById('login-screen');
    if (!loginScreen) return;

    loginScreen.innerHTML = `
      <div class="login-card">
        <div class="login-logo">🚗</div>
        <div class="login-title">CarFlow</div>
        <div class="login-ver">CarFlow v1.8.39 — デモ版</div>
        <p class="login-desc">
          中古車販売店・整備工場のための<br>
          車両管理・販売実績ツール
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
        <div class="login-credit">
          🏭 KOBAYASHI MOTORS
        </div>
      </div>
    `;
  }

  // -----------------------------------
  // 起動時：ログインUI差し替え
  // -----------------------------------
  function _init() {
    _renderDemoLoginUI();
    console.log('[demo-auth] login UI replaced');
  }

  // 公開
  window.demoLogin = doDemoLogin;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
