// ========================================
// db-settings.js (v1.5.2〜)
// Firestore の settings/main ドキュメントに対する CRUD wrapper
// ----------------------------------------
// パス：companies/{companyId}/settings/main
//
// 1ドキュメントに以下を集約：
//   appTaskEnabled / appTaskOrder / appTaskDeadline / appCustomTasks (tasks-def.js)
//   ※ 定休日・営業時間は v2.38.0 で撤去（MHS の営業日カレンダーが唯一の真実）
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
    // v2.0.0: ビルトインタスクの削除フラグ／名前オーバーライド
    if (typeof appTaskDeleted  !== 'undefined') out.appTaskDeleted  = _clone(appTaskDeleted  || {});
    if (typeof appTaskRename   !== 'undefined') out.appTaskRename   = _clone(appTaskRename   || {});
    // v2.2.1: タスク個別メモの種別設定
    if (typeof appTaskMemoConfig !== 'undefined') out.appTaskMemoConfig = _clone(appTaskMemoConfig || {});
    // v2.8.0: 大タスクごとの完了時LINE通知 ON/OFF
    if (typeof appTaskNotify   !== 'undefined') out.appTaskNotify   = _clone(appTaskNotify   || {});
    if (typeof appCustomTasks  !== 'undefined') out.appCustomTasks  = _clone(appCustomTasks  || []);
    // 🔴 v2.38.0 定休日（closedRules / closedDays / customHolidays）と営業時間（appSettings.bizOpen/bizClose）は
    //    **CarFlow では持たない**。MHS の営業日カレンダーが唯一の真実。ここに書き戻さないこと。
    //    ⚠ 昔の書類に残っている分は読まないだけ（消していない）。
    if (typeof SIZES           !== 'undefined') out.SIZES           = _clone(SIZES           || []);
    if (typeof appSettings     !== 'undefined') out.appSettings     = _clone(appSettings     || {});
    if (typeof boardLabels     !== 'undefined') out.boardLabels     = _clone(boardLabels     || {});
    // v2.9.0: メンバーグループ（車販／他部署 など）
    if (typeof memberGroups    !== 'undefined') out.memberGroups    = _clone(memberGroups    || []);
    return out;
  }

  // -----------------------------------------
  // Firestore データ → メモリに反映（参照維持）
  // -----------------------------------------
  function _applyToMemory(data) {
    if (!data || typeof data !== 'object') return;

    if (data.appTaskEnabled && typeof appTaskEnabled !== 'undefined') {
      appTaskEnabled.regen      = (data.appTaskEnabled.regen)      ? {...data.appTaskEnabled.regen}      : {};
      appTaskEnabled.delivery   = (data.appTaskEnabled.delivery)   ? {...data.appTaskEnabled.delivery}   : {};
      appTaskEnabled.backoffice = (data.appTaskEnabled.backoffice) ? {...data.appTaskEnabled.backoffice} : {};
    }

    if (data.appTaskOrder && typeof appTaskOrder !== 'undefined') {
      appTaskOrder.regen      = Array.isArray(data.appTaskOrder.regen)      ? data.appTaskOrder.regen.slice()      : [];
      appTaskOrder.delivery   = Array.isArray(data.appTaskOrder.delivery)   ? data.appTaskOrder.delivery.slice()   : [];
      appTaskOrder.backoffice = Array.isArray(data.appTaskOrder.backoffice) ? data.appTaskOrder.backoffice.slice() : [];
    }

    if (data.appTaskDeadline && typeof appTaskDeadline !== 'undefined') {
      appTaskDeadline.regen      = (data.appTaskDeadline.regen)      ? {...data.appTaskDeadline.regen}      : {};
      appTaskDeadline.delivery   = (data.appTaskDeadline.delivery)   ? {...data.appTaskDeadline.delivery}   : {};
      appTaskDeadline.backoffice = (data.appTaskDeadline.backoffice) ? {...data.appTaskDeadline.backoffice} : {};
    }

    if (data.appTaskWeight && typeof appTaskWeight !== 'undefined') {
      appTaskWeight.regen      = (data.appTaskWeight.regen)      ? {...data.appTaskWeight.regen}      : {};
      appTaskWeight.delivery   = (data.appTaskWeight.delivery)   ? {...data.appTaskWeight.delivery}   : {};
      appTaskWeight.backoffice = (data.appTaskWeight.backoffice) ? {...data.appTaskWeight.backoffice} : {};
    }

    if (data.appTaskMode && typeof appTaskMode !== 'undefined') {
      appTaskMode.regen      = (data.appTaskMode.regen)      ? {...data.appTaskMode.regen}      : {};
      appTaskMode.delivery   = (data.appTaskMode.delivery)   ? {...data.appTaskMode.delivery}   : {};
      appTaskMode.backoffice = (data.appTaskMode.backoffice) ? {...data.appTaskMode.backoffice} : {};
    }

    // v1.8.51: 大タスクの「選択制」フラグ
    if (data.appTaskOptional && typeof appTaskOptional !== 'undefined') {
      appTaskOptional.regen      = (data.appTaskOptional.regen)      ? {...data.appTaskOptional.regen}      : {};
      appTaskOptional.delivery   = (data.appTaskOptional.delivery)   ? {...data.appTaskOptional.delivery}   : {};
      appTaskOptional.backoffice = (data.appTaskOptional.backoffice) ? {...data.appTaskOptional.backoffice} : {};
    }

    // v2.0.0: ビルトインタスクの削除フラグ
    if (data.appTaskDeleted && typeof appTaskDeleted !== 'undefined') {
      appTaskDeleted.regen      = (data.appTaskDeleted.regen)      ? {...data.appTaskDeleted.regen}      : {};
      appTaskDeleted.delivery   = (data.appTaskDeleted.delivery)   ? {...data.appTaskDeleted.delivery}   : {};
      appTaskDeleted.backoffice = (data.appTaskDeleted.backoffice) ? {...data.appTaskDeleted.backoffice} : {};
    }

    // v2.0.0: ビルトインタスクの名前/アイコン オーバーライド
    if (data.appTaskRename && typeof appTaskRename !== 'undefined') {
      appTaskRename.regen      = (data.appTaskRename.regen)      ? {...data.appTaskRename.regen}      : {};
      appTaskRename.delivery   = (data.appTaskRename.delivery)   ? {...data.appTaskRename.delivery}   : {};
      appTaskRename.backoffice = (data.appTaskRename.backoffice) ? {...data.appTaskRename.backoffice} : {};
    }

    // v2.2.1: タスク個別メモの種別設定
    if (data.appTaskMemoConfig && typeof appTaskMemoConfig !== 'undefined') {
      appTaskMemoConfig.regen      = (data.appTaskMemoConfig.regen)      ? {...data.appTaskMemoConfig.regen}      : {};
      appTaskMemoConfig.delivery   = (data.appTaskMemoConfig.delivery)   ? {...data.appTaskMemoConfig.delivery}   : {};
      appTaskMemoConfig.backoffice = (data.appTaskMemoConfig.backoffice) ? {...data.appTaskMemoConfig.backoffice} : {};
    }
    // v2.8.0: 大タスクごとの完了時LINE通知 ON/OFF
    if (data.appTaskNotify && typeof appTaskNotify !== 'undefined') {
      appTaskNotify.regen      = (data.appTaskNotify.regen)      ? {...data.appTaskNotify.regen}      : {};
      appTaskNotify.delivery   = (data.appTaskNotify.delivery)   ? {...data.appTaskNotify.delivery}   : {};
      appTaskNotify.backoffice = (data.appTaskNotify.backoffice) ? {...data.appTaskNotify.backoffice} : {};
    }

    if (data.boardLabels && typeof boardLabels !== 'undefined') {
      Object.keys(data.boardLabels).forEach(k => {
        boardLabels[k] = data.boardLabels[k];
      });
    }

    // v2.9.0: メンバーグループ（保存済みがあれば置換。無ければ既定の2グループのまま）
    if (Array.isArray(data.memberGroups) && typeof memberGroups !== 'undefined') {
      memberGroups.length = 0;
      data.memberGroups.forEach(g => {
        if (g && g.id) memberGroups.push({ id: String(g.id), name: String(g.name || '') });
      });
    }

    if (Array.isArray(data.appCustomTasks) && typeof appCustomTasks !== 'undefined') {
      appCustomTasks.length = 0;
      data.appCustomTasks.forEach(t => appCustomTasks.push(t));
    }

    // v2.38.0: closedRules / closedDays / customHolidays は読まない（MHS が基準）

    if (Array.isArray(data.SIZES) && typeof SIZES !== 'undefined') {
      SIZES.length = 0;
      data.SIZES.forEach(s => SIZES.push(s));
    }

    if (data.appSettings && typeof appSettings !== 'undefined') {
      const a = data.appSettings;
      if (Array.isArray(a.invWarn)) appSettings.invWarn = a.invWarn.slice();
      if (Array.isArray(a.delWarn)) appSettings.delWarn = a.delWarn.slice();
      if (typeof a.deliveryLeadDays === 'number') appSettings.deliveryLeadDays = a.deliveryLeadDays;
      // v2.38.0: bizOpen / bizClose は読まない（営業時間は MHS が基準）
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

  /* ============================================================
     🔴 v3.16.0（棚卸し S-10）会社設定は「変えた欄だけ」保存し、ほかの端末の変更を受け取る
     ------------------------------------------------------------
     ◎前まで … 起動時に1回読むだけ（購読なし）。保存は _captureFromMemory の**全部**を set(merge)。
       朝から開いている A が何か1つ変えると、昼に B が変えた月の目標・税込/税抜・タスクの締め日が
       **A の朝の値に戻っていた**。記録も残らなかった。
     ◎いま
       ・_base＝最後にサーバーと揃えた形（読んだ時・受け取った時・保存した時）
       ・保存＝今の形と _base を比べて、**違う葉っぱだけ** update（FieldPath・消えた所は FieldValue.delete()）
         配列（タスクの並び・サイズ・メンバーグループ・警告日数など）は配列ごと1つの欄として比べる
       ・settings/main を購読（subscribeSettings）。届いたらメモリに入れて描き直す
       ・何を何から何へ変えたかを操作ログ（auditLogs）に1行（S-30）
     ⚠ 書類がまだ無い時（初期投入）だけ丸ごと set
     ============================================================ */
  let _base = null;
  function _isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function _diff(base, cur, path, out) {
    const keys = {};
    Object.keys(base || {}).forEach(k => { keys[k] = 1; });
    Object.keys(cur || {}).forEach(k => { keys[k] = 1; });
    Object.keys(keys).forEach(k => {
      const b = base ? base[k] : undefined, c = cur ? cur[k] : undefined, p = path.concat([k]);
      if (_isObj(b) && _isObj(c)) { _diff(b, c, p, out); return; }
      if (JSON.stringify(b) === JSON.stringify(c)) return;
      if (_isObj(c) && b === undefined) { out.push({ path: p, value: c, before: undefined }); return; }
      out.push({ path: p, value: c, before: b });
    });
    return out;
  }
  function _short(v) {
    if (v === undefined || v === null) return '（なし）';
    let s = (typeof v === 'object') ? JSON.stringify(v) : String(v);
    if (s.length > 40) s = s.slice(0, 40) + '…';
    return s;
  }
  function _logSettingsChange(changes) {
    if (!changes.length || typeof window.addAuditLog !== 'function') return;
    const parts = changes.slice(0, 6).map(c => c.path.join('.') + ' ' + _short(c.before) + ' → ' + _short(c.value));
    const more = changes.length > 6 ? ' ほか' + (changes.length - 6) + '件' : '';
    window.addAuditLog('設定を変更：' + parts.join('／') + more);
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
      _base = _clone(_captureFromMemory());   /* v3.16.0 ここから変えた欄だけ送る */
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
  async function saveSettings(opts) {
    const ref = _settingsDoc();
    if (!ref) {
      console.warn('[db-settings] saveSettings: companyId 未確定');
      return;
    }
    const cur = _captureFromMemory();
    /* 初期投入（書類がまだ無い）・一度も読めていない時だけ丸ごと。ふだんは変えた欄だけ */
    if ((opts && opts.initial) || !_base) {
      try {
        const out = _clone(cur);
        out.updatedAt = window.fb.serverTimestamp();
        if (window.fb.currentUser && window.fb.currentUser.uid) out.updatedBy = window.fb.currentUser.uid;
        await ref.set(out, { merge: true });
        _base = _clone(cur);
      } catch (err) {
        console.error('[db-settings] saveSettings error:', err);
        if (typeof showToast === 'function') showToast('設定の保存に失敗しました', 'CF-9001');
        throw err;
      }
      return;
    }
    const changes = _diff(_base, cur, [], []);
    if (!changes.length) return;
    /* 送る前に控えを進める（続けて保存された時に同じ所を二重に送らない）。失敗したら戻す */
    const prevBase = _base;
    _base = _clone(cur);
    try {
      const FieldPath = window.firebase.firestore.FieldPath;
      const FieldValue = window.firebase.firestore.FieldValue;
      const args = [];
      changes.forEach(c => {
        args.push(new FieldPath(...c.path.map(String)));
        args.push(c.value === undefined ? FieldValue.delete() : _clone(c.value));
      });
      args.push(new FieldPath('updatedAt'), window.fb.serverTimestamp());
      if (window.fb.currentUser && window.fb.currentUser.uid) args.push(new FieldPath('updatedBy'), window.fb.currentUser.uid);
      await ref.update(...args);
      _logSettingsChange(changes);
    } catch (err) {
      _base = prevBase;
      console.error('[db-settings] saveSettings error:', err);
      if (typeof showToast === 'function') showToast('設定の保存に失敗しました', 'CF-9001');
      throw err;
    }
  }

  /* v3.16.0 settings/main を購読。ほかの端末の変更をメモリへ入れて描き直す。
     ⚠ 自分の保存が届いた時（hasPendingWrites）は読み直さない（保存の途中の形で控えを戻さない） */
  function subscribeSettings(onChange) {
    const ref = _settingsDoc();
    if (!ref) return function () {};
    let un = null, relinkT = null, waitMs = 3000;
    function link() {
      un = ref.onSnapshot(function (snap) {
        waitMs = 3000;
        if (!snap || !snap.exists) return;
        if (snap.metadata && snap.metadata.hasPendingWrites) return;
        const data = snap.data() || {};
        const before = JSON.stringify(_captureFromMemory());
        _applyToMemory(data);
        _base = _clone(_captureFromMemory());
        if (JSON.stringify(_base) !== before) {
          try { if (typeof onChange === 'function') onChange(data); } catch (e) { console.error('[db-settings] onChange', e); }
        }
      }, function (err) {
        console.error('[db-settings] 購読が落ちました', err);
        if (relinkT) return;
        relinkT = setTimeout(function () { relinkT = null; try { if (un) un(); } catch (e) {} un = null; link(); }, waitMs);
        waitMs = Math.min(waitMs * 2, 60000);
      });
    }
    link();
    return function () { if (relinkT) clearTimeout(relinkT); try { if (un) un(); } catch (e) {} un = null; };
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
      await saveSettings({ initial: true });
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
    subscribeSettings,
    seedSettingsIfEmpty,
    // v3.7.0 📊 分析用の書き出し（analytics-car.js）が借りる。毎晩サーバーが settings/main の中身を
    //   「アプリが読み込んだ時と同じ形」で入れるため（画面からは呼ばない・動きは変わらない）
    _applyToMemory,
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
