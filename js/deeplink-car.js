/* ========================================
   deeplink-car.js  -  リンクから画面／「新規」の窓を開く入口  CarFlow v2.63.0
   ----------------------------------------
   ◎なにをするもの
     FlowDesk（デスクトップのアプリ）のボタンから、CarFlow の決まった場所へ直接飛べるようにする。
       ・画面   `https://carflow.kobayashi-motors.com/#/calendar`
                 → その画面（タブ）を開く
                 （kanban / calendar / exhibit / progress / table / inventory / deal）
       ・操作   `?fd=new-car`        → 新規車両登録の窓（サイドバーの「新規車両登録」と同じ）
                `?fd=new-tentative`  → 仮登録車両追加の窓（サイドバーの「仮登録車両追加」と同じ）
       ・両方   `/?fd=new-car#/kanban` → 先に画面、そのあと窓

   ◎なぜ「待つ」作りなのか
     ログイン → クラウド読み込み が終わるまで、画面も車のデータも無い。
     終わった合図＝ auth.js の _showAppUI（body に app-active が付き、ログイン画面が消える）。
     それまでは少しずつ様子を見るだけ。**ログインしていない間はずっと待つ**（あきらめない）。

   ◎なぜ画面の切り替えもここでやるのか
     共通部品 coreflow-nav.js は「アプリが最初に switchTab を呼んだ時」に住所の画面を開き直す作り。
     ところが CarFlow は起動時に switchTab を呼ばない（トップのダッシュボードが出るだけ）。
     だから再読み込みしても住所の画面に戻らなかった。ここで1回呼んで、住所どおりの画面にする。
     🔴 _shared の coreflow-nav.js は触らない（全アプリ共通のため）。

   ◎お約束
     ・既存のコードには一切触らない。サイドバーのボタンと同じ関数を呼ぶだけ。
     ・権限は今までどおり。新規車両登録ができない人（作業者・閲覧）には開かない。
     ・動くのは1回だけ。開いたらアドレスから ?fd= を消す（再読み込みで二重に開かない）。住所の #/ は残す。
     ・知らない値の ?fd= は何もしない。
     ・スマホ幅では「進捗」以外の画面へは切り替えない（auth.js が進捗に戻す作りのため）。
   ======================================== */
(function () {
  'use strict';

  var TABS = ['kanban', 'calendar', 'exhibit', 'progress', 'table', 'inventory', 'deal'];
  var MOBILE_TABS = ['progress'];
  var ACTIONS = {
    'new-car': function () {
      /* サイドバーの「新規車両登録」は canCreateCar が無い人には出ていない（role-guard.js）。同じ扱いにする */
      if (typeof window.hasPermission === 'function' && !window.hasPermission('canCreateCar')) {
        if (typeof window.showToast === 'function') window.showToast('この操作はあなたの権限ではできません', 'CF-0027');
        return;
      }
      if (typeof window.openCarModal === 'function') window.openCarModal(null);
    },
    'new-tentative': function () {
      /* 仮登録はサイドバーでも権限で隠していない。今までどおり */
      if (typeof window.openTentativeModal === 'function') window.openTentativeModal(null);
    }
  };

  function readTab() {
    var h = String(location.hash || '');
    if (h.indexOf('#/') !== 0) return '';
    var k = h.slice(2);
    try { k = decodeURIComponent(k); } catch (e) {}
    return TABS.indexOf(k) >= 0 ? k : '';
  }
  function readAction() {
    var m = /[?&]fd=([^&#]*)/.exec(location.search || '');
    if (!m) return '';
    var v = m[1];
    try { v = decodeURIComponent(v); } catch (e) {}
    return Object.prototype.hasOwnProperty.call(ACTIONS, v) ? v : '';
  }

  var tab = readTab();
  var act = readAction();
  if (!tab && !act) return;

  var STEP_MS = 300;
  var SLOW_MS = 1500;       // 1分待ってもログインしていなければ、見に行く間を空ける
  var started = Date.now();

  /* ログインとクラウド読み込みが済んだか（auth.js の _showAppUI が済んだか） */
  function ready() {
    if (!document.body || !document.body.classList.contains('app-active')) return false;
    var app = document.getElementById('app');
    if (!app || app.style.display === 'none') return false;
    var login = document.getElementById('login-screen');
    if (login && login.style.display !== 'none') return false;
    return !!(window.fb && window.fb.currentStaff);
  }

  function stripParam() {
    try {
      var u = new URL(location.href);
      u.searchParams.delete('fd');
      history.replaceState(history.state, '', u.pathname + (u.search || '') + (u.hash || ''));
    } catch (e) {}
  }

  /* 押したタブを探して渡す（index.html の CoreflowNav.wire と同じ探し方） */
  function tabEl(k) {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      if ((tabs[i].getAttribute('onclick') || '').indexOf("switchTab('" + k + "'") >= 0) return tabs[i];
    }
    return null;
  }

  function run() {
    if (tab && typeof window.switchTab === 'function') {
      var mobile = (typeof window.isMobileMode === 'function') && window.isMobileMode();
      if (!mobile || MOBILE_TABS.indexOf(tab) >= 0) {
        try { window.switchTab(tab, tabEl(tab)); } catch (e) { console.warn('[deeplink] 画面の切り替えに失敗', e); }
      }
    }
    if (act) {
      stripParam();
      try { ACTIONS[act](); } catch (e) { console.warn('[deeplink] 窓を開けませんでした', e); }
    }
  }

  function tick() {
    if (ready()) { run(); return; }
    setTimeout(tick, (Date.now() - started > 60000) ? SLOW_MS : STEP_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(tick, STEP_MS); });
  else setTimeout(tick, STEP_MS);
})();
