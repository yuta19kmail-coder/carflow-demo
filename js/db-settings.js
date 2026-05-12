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
//   appSettings { invWarn, delWarn, deliveryLeadDays, notif, goals, printEquipment } (state.js)
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
    if (typeof appTaskWeight   !== 'undefined') out.appTaskWeight   = _clone(appTaskWeight   || {});
    if (typeof appTaskMode     !== 'undefined') out.appTaskMode     = _clone(appTaskMode     || {});
    // v1.8.51: 大タスクの「選択制」フラグ
    if (typeof appTaskOptional !== 'undefined') out.appTaskOptional = _clone(appTaskOptional || {});
    if (typeof appCustomTasks  !== 'undefined') out.appCustomTasks  = _clone(appCustomTasks  || []);
    if (typeof closedRules     !== 'undefined') out.closedRules     = _clone(closedRules     || []);
    if (typeof closedDays      !== 'undefined') out.closedDays      = _clone(closedDays      || []);
    if (typeof customHolidays  !== 'undefined') out.customHolidays  = _clone(customHolidays  || []);
    if (typeof SIZES           !== 'undefined') out.SIZES           = _clone(SIZES           || []);
    if (typeof appSettings     !== 'undefined') out.appSettings     = _clone(appSettings     || {});
    if (typeof boardLabels     !== 'undefined') out.boardLabels     = _clone(boardLabels     || {});
    return out;
  }

  // -----------------------------------------
  // Firestore データ → メモリに反映（参照維持）
  // -----------------------------------------
  function _applyToMemory(data) {
    if (!data || typeof data !== 'object') return;

    if (data.appTaskEnabled && typeof appTaskEnabled !== 'undefined') {
      appTaskEnabled.regen    = (data.appTaskEnabled.regen)    ? {...data.appTaskEnabled.regen}    : {};
      appTaskEnabled.delivery = (data.appTaskEnabled.delivery) ? {...data.appTaskEnabled.delivery} : {};
    }

    if (data.appTaskOrder && typeof appTaskOrder !== 'undefined') {
      appTaskOrder.regen    = Array.isArray(data.appTaskOrder.regen)    ? data.appTaskOrder.regen.slice()    : [];
      appTaskOrder.delivery = Array.isArray(data.appTaskOrder.delivery) ? data.appTaskOrder.delivery.slice() : [];
    }

    if (data.appTaskDeadline && typeof appTaskDeadline !== 'undefined') {
      appTaskDeadline.regen    = (data.appTaskDeadline.regen)    ? {...data.appTaskDeadline.regen}    : {};
      appTaskDeadline.delivery = (data.appTaskDeadline.delivery) ? {...data.appTaskDeadline.delivery} : {};
    }

    if (data.appTaskWeight && typeof appTaskWeight !== 'undefined') {
      appTaskWeight.regen    = (data.appTaskWeight.regen)    ? {...data.appTaskWeight.regen}    : {};
      appTaskWeight.delivery = (data.appTaskWeight.delivery) ? {...data.appTaskWeight.delivery} : {};
    }

    if (data.appTaskMode && typeof appTaskMode !== 'undefined') {
      appTaskMode.regen    = (data.appTaskMode.regen)    ? {...data.appTaskMode.regen}    : {};
      appTaskMode.delivery = (data.appTaskMode.delivery) ? {...data.appTaskMode.delivery} : {};
    }

    // v1.8.51: 大タスクの「選択制」フラグ
    if (data.appTaskOptional && typeof appTaskOptional !== 'undefined') {
      appTaskOptional.regen    = (data.appTaskOptional.regen)    ? {...data.appTaskOptional.regen}    : {};
      appTaskOptional.delivery = (data.appTaskOptional.delivery) ? {...data.appTaskOptional.delivery} : {};
    }

    if (data.boardLabels && typeof boardLabels !== 'undefined') {
      Object.keys(data.boardLabels).forEach(k => {
        boardLabels[k] = data.boardLabels[k];
      });
    }

    if (Array.isArray(data.appCustomTasks) && typeof appCustomTasks !== 'undefined') {
      appCustomTasks.length = 0;
      data.appCustomTasks.forEach(t => appCustomTasks.push(t));
    }

    if (Array.isArray(data.closedRules) && typeof closedRules !== 'undefined') {
      closedRules.length = 0;
      data.closedRules.forEach(r => closedRules.push(r));
    }

    if (Array.isArray(data.closedDays) && typeof closedDays !== 'undefined') {
      closedDays.length = 0;
      data.closedDays.forEach(d => closedDays.push(d));
    }

    if (Array.isArray(data.customHolidays) && typeof customHolidays !== 'undefined') {
      customHolidays.length = 0;
      data.customHolidays.forEach(h => customHolidays.push(h));
    }

    if (Array.isArray(data.SIZES) && typeof SIZES !== 'undefined') {
      SIZES.length = 0;
      data.SIZES.forEach(s => SIZES.push(s));
    }

    if (data.appSettings && typeof appSettings !== 'undefined') {
      const a = data.appSettings;
      if (Array.isArray(a.invWarn)) appSettings.invWarn = a.invWarn.slice();
      if (Array.isArray(a.delWarn)) appSettings.delWarn = a.delWarn.slice();
      if (typeof a.deliveryLeadDays === 'number') appSettings.deliveryLeadDays = a.deliveryLeadDays;
      if (a.notif && typeof a.notif === 'object') {
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
      // v1.8.45: 印刷シートの表示項目トグル（写真/メーカー/価格/説明文 など）
      //          会社共通の設定として保存・復元する。
      if (a.printEquipment && typeof a.printEquipment === 'object') {
        appSettings.printEquipment = appSettings.printEquipment || {};
        Object.assign(appSettings.printEquipment, a.printEquipment);
      }
      // v1.8.59: 金額の税扱い設定（本体/総額/ダッシュボードそれぞれ）
      if (a.priceTax && typeof a.priceTax === 'object') {
        appSettings.priceTax = appSettings.priceTax || {};
        Object.assign(appSettings.priceTax, a.priceTax);
      }
      // v1.8.75: 店舗情報（印刷シートに出す）
      if (a.companyInfo && typeof a.companyInfo === 'object') {
        appSettings.companyInfo = appSettings.companyInfo || {};
        Object.assign(appSettings.companyInfo, a.companyInfo);
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
