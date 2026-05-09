// ========================================
// db-settings.js (v1.5.2〜)
// Firestore の settings/main ドキュメントに対する CRUD wrapper
// ----------------------------------------
// パス：companies/{companyId}/settings/main
//
// 1ドキュメントに以下を集約：
//   appTaskEnabled / appTaskOrder / appTaskDeadline / appCustomTasks (tasks-def.js)
//   closedRules / closedDays / customHolidays                       (state.js)
//   SIZES                                                            (config.js)
//   appSettings { invWarn, delWarn, deliveryLeadDays, notif, goals } (state.js)
//
// 提供関数（window.dbSettings 名前空間）：
//   loadSettings()             : settings/main を取得しメモリに反映
//   saveSettings()             : メモリの全 settings を1ドキュメントに保存（merge:true）
//   seedSettingsIfEmpty()      : Firestore に未存在なら現在のデフォルト値で初期投入
//
// 各 mutation 後のショートカット：
//   window.saveSettings()      : 各UIから呼ぶ fire-and-forget
//
// 重要メモ：
// ・state.js / tasks-def.js の `let xxx` は window の property にはならないが、
//   同じ realm 内の別 script から `typeof xxx` で参照できる。
// ・配列・オブジェクトは「参照維持＋中身入れ替え」で更新する
//   （他コードが代入しているケースも一部あるが、ロード直後の置換タイミングなら影響なし）
// ・theme / fontSize は個人別なので localStorage のまま。settings/main には保存しない。
// ========================================

(function () {
  'use strict';

  function _settingsDoc() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db
      .collection('companies').doc(window.fb.currentCompanyId)
      .collection('settings').doc('main');
  }

  function _clone(o) {
    if (o == null) return o;
    try { return JSON.parse(JSON.stringify(o)); } catch (e) { return o; }
  }

  // -----------------------------------------
  // メモリ → 保存形式に変換
  // -----------------------------------------
  function _captureFromMemory() {
    const out = {};
    if (typeof appTaskEnabled  !== 'undefined') out.appTaskEnabled  = _clone(appTaskEnabled  || {});
    if (typeof appTaskOrder    !== 'undefined') out.appTaskOrder    = _clone(appTaskOrder    || {});
    if (typeof appTaskDeadline !== 'undefined') out.appTaskDeadline = _clone(appTaskDeadline || {});
    if (typeof appTaskWeight   !== 'undefined') out.appTaskWeight   = _clone(appTaskWeight   || {}); // v1.8.12
    if (typeof appTaskMode     !== 'undefined') out.appTaskMode     = _clone(appTaskMode     || {}); // v1.6.1
    if (typeof appCustomTasks  !== 'undefined') out.appCustomTasks  = _clone(appCustomTasks  || []);
    if (typeof closedRules     !== 'undefined') out.closedRules     = _clone(closedRules     || []);
    if (typeof closedDays      !== 'undefined') out.closedDays      = _clone(closedDays      || []);
    if (typeof customHolidays  !== 'undefined') out.customHolidays  = _clone(customHolidays  || []);
    if (typeof SIZES           !== 'undefined') out.SIZES           = _clone(SIZES           || []);
    if (typeof appSettings     !== 'undefined') out.appSettings     = _clone(appSettings     || {});
    // v1.7.0: 付箋ボードの色ラベル（会社共通）
    if (typeof boardLabels     !== 'undefined') out.boardLabels     = _clone(boardLabels     || {});
    return out;
  }

  // -----------------------------------------
  // Firestore データ → メモリに反映（参照維持）
  // -----------------------------------------
  function _applyToMemory(data) {
    if (!data || typeof data !== 'object') return;

    // appTaskEnabled（オブジェクトの中身入れ替え）
    if (data.appTaskEnabled && typeof appTaskEnabled !== 'undefined') {
      appTaskEnabled.regen    = (data.appTaskEnabled.regen)    ? {...data.appTaskEnabled.regen}    : {};
      appTaskEnabled.delivery = (data.appTaskEnabled.delivery) ? {...data.appTaskEnabled.delivery} : {};
    }

    // appTaskOrder
    if (data.appTaskOrder && typeof appTaskOrder !== 'undefined') {
      appTaskOrder.regen    = Array.isArray(data.appTaskOrder.regen)    ? data.appTaskOrder.regen.slice()    : [];
      appTaskOrder.delivery = Array.isArray(data.appTaskOrder.delivery) ? data.appTaskOrder.delivery.slice() : [];
    }

    // appTaskDeadline
    if (data.appTaskDeadline && typeof appTaskDeadline !== 'undefined') {
      appTaskDeadline.regen    = (data.appTaskDeadline.regen)    ? {...data.appTaskDeadline.regen}    : {};
      appTaskDeadline.delivery = (data.appTaskDeadline.delivery) ? {...data.appTaskDeadline.delivery} : {};
    }

    // v1.8.12: appTaskWeight（各大タスクの進捗ウエイト％）
    if (data.appTaskWeight && typeof appTaskWeight !== 'undefined') {
      appTaskWeight.regen    = (data.appTaskWeight.regen)    ? {...data.appTaskWeight.regen}    : {};
      appTaskWeight.delivery = (data.appTaskWeight.delivery) ? {...data.appTaskWeight.delivery} : {};
    }

    // v1.6.1: appTaskMode（'simple' | 'checklist'）
    if (data.appTaskMode && typeof appTaskMode !== 'undefined') {
      appTaskMode.regen    = (data.appTaskMode.regen)    ? {...data.appTaskMode.regen}    : {};
      appTaskMode.delivery = (data.appTaskMode.delivery) ? {...data.appTaskMode.delivery} : {};
    }

    // v1.7.0: boardLabels（付箋ボードの色ラベル）
    if (data.boardLabels && typeof boardLabels !== 'undefined') {
      Object.keys(data.boardLabels).forEach(k => {
        boardLabels[k] = data.boardLabels[k];
      });
    }

    // appCustomTasks（配列の中身入れ替え）
    if (Array.isArray(data.appCustomTasks) && typeof appCustomTasks !== 'undefined') {
      appCustomTasks.length = 0;
      data.appCustomTasks.forEach(t => appCustomTasks.push(t));
    }

    // closedRules（配列の中身入れ替え）
    if (Array.isArray(data.closedRules) && typeof closedRules !== 'undefined') {
      closedRules.length = 0;
      data.closedRules.forEach(r => closedRules.push(r));
    }

    // closedDays（互換用）
    if (Array.isArray(data.closedDays) && typeof closedDays !== 'undefined') {
      closedDays.length = 0;
      data.closedDays.forEach(d => closedDays.push(d));
    }

    // customHolidays
    if (Array.isArray(data.customHolidays) && typeof customHolidays !== 'undefined') {
      customHolidays.length = 0;
      data.customHolidays.forEach(h => customHolidays.push(h));
    }

    // SIZES
    if (Array.isArray(data.SIZES) && typeof SIZES !== 'undefined') {
      SIZES.length = 0;
      data.SIZES.forEach(s => SIZES.push(s));
    }

    // appSettings（参照維持、各ネストキーを慎重に上書き）
    if (data.appSettings && typeof appSettings !== 'undefined') {
      const a = data.appSettings;
      if (Array.isArray(a.invWarn)) appSettings.invWarn = a.invWarn.slice();
      if (Array.isArray(a.delWarn)) appSettings.delWarn = a.delWarn.slice();
      if (typeof a.deliveryLeadDays === 'number') appSettings.deliveryLeadDays = a.deliveryLeadDays;
      if (a.notif && typeof a.notif === 'object') {
        // notif は { pre, stock, stall } 等のネスト。既存キーと深いマージ
        appSettings.notif = appSettings.notif || {};
        for (const k in a.notif) {
          appSettings.notif[k] = {...(appSettings.notif[k] || {}), ...a.notif[k]};
        }
      }
      if (a.goals && typeof a.goals === 'object') {
        appSettings.goals = appSettings.goals || {};
        if (typeof a.goals.yearStart === 'number') appSettings.goals.yearStart = a.goals.yearStart;
        if (typeof a.goals.revRecog === 'string')  appSettings.goals.revRecog  = a.goals.revRecog;
        if (a.goals.monthly && typeof a.goals.monthly === 'object') appSettings.goals.monthly = {...a.goals.monthly};
        if (a.goals.annual  && typeof a.goals.annual  === 'object') appSettings.goals.annual  = {...a.goals.annual};
        if (a.goals.default && typeof a.goals.default === 'object') appSettings.goals.default = {...a.goals.default};
      }
    }
  }

  // -----------------------------------------
  // 読み込み
  // -----------------------------------------
  async function loadSettings() {
    const ref = _settingsDoc();
    if (!ref) {
      console.warn('[db-settings] companyId 未確定のため読み込みスキップ');
      return null;
    }
    try {
      const snap = await ref.get();
      if (!snap.exists) {
        console.log('[db-settings] settings/main なし（未投入）');
        return null;
      }
      const data = snap.data();
      _applyToMemory(data);
      console.log('[db-settings] loaded');
      return data;
    } catch (err) {
      console.error('[db-settings] loadSettings error:', err);
      throw err;
    }
  }

  // -----------------------------------------
  // 保存（merge:true）
  // -----------------------------------------
  async function saveSettings() {
    const ref = _settingsDoc();
    if (!ref) {
      console.warn('[db-settings] saveSettings: companyId 未確定');
      return;
    }
    try {
      const out = _captureFromMemory();
      out.updatedAt = window.fb.serverTimestamp();
      if (window.fb.currentUser && window.fb.currentUser.uid) {
        out.updatedBy = window.fb.currentUser.uid;
      }
      await ref.set(out, { merge: true });
    } catch (err) {
      console.error('[db-settings] saveSettings error:', err);
      if (typeof showToast === 'function') showToast('設定の保存に失敗しました');
      throw err;
    }
  }

  // -----------------------------------------
  // 初期投入：未存在なら現在のメモリ値（デフォルト）を投入
  // -----------------------------------------
  async function seedSettingsIfEmpty() {
    const ref = _settingsDoc();
    if (!ref) return false;
    try {
      const probe = await ref.get();
      if (probe.exists) return false;
      console.log('[db-settings] settings/main を初期投入...');
      await saveSettings();
      console.log('[db-settings] 初期投入完了');
      return true;
    } catch (err) {
      console.error('[db-settings] seedSettingsIfEmpty error:', err);
      throw err;
    }
  }

  // -----------------------------------------
  // 公開
  // -----------------------------------------
  window.dbSettings = {
    loadSettings,
    saveSettings,
    seedSettingsIfEmpty,
  };

  console.log('[db-settings] ready');
})();

// ========================================
// グローバルショートカット：window.saveSettings()
// 各 mutation 直後に1行で呼ぶ（fire-and-forget）
// ========================================
window.saveSettings = function () {
  if (!window.dbSettings) return;
  window.dbSettings.saveSettings().catch(e => console.error('[saveSettings] failed', e));
};
