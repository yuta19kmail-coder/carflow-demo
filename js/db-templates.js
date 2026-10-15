// ========================================
// db-templates.js (v1.5.11〜)
// Firestore の checklistTemplates コレクションに対する CRUD wrapper
// ----------------------------------------
// パス：companies/{companyId}/checklistTemplates/{templateId}
//
// 1テンプレートにつき1ドキュメント。sections / items は配列でネスト保存。
// 編集UIは v1.6.0 以降。本ファイルは「DB化」だけを行い、
// 起動時にDBから復元してメモリの ChecklistTemplates を上書きする。
//
// 提供関数（window.dbTemplates 名前空間）：
//   loadAllTemplates()           : 自社の全テンプレートを取得し配列で返す
//   saveTemplate(tpl)            : 1件保存（merge:true）
//   deleteTemplate(tplId)        : 1件削除
//   seedTemplatesIfEmpty()       : Firestore が空ならメモリ上の ChecklistTemplates を一括投入
//   replaceInMemory(list)        : 受け取った list で in-memory の ChecklistTemplates を置換
//   refreshTemplates()           : loadAllTemplates → replaceInMemory までやって反映
//
// 各 mutation 後のショートカット：
//   window.saveChecklistTemplate(tplId) : メモリから引いて save（fire-and-forget）
//
// 重要メモ：
// ・ChecklistTemplates は checklist-templates.js の IIFE で
//   既存定数（REGEN_TASKS / DELIVERY_TASKS / EQUIPMENT_CATEGORIES）から自動生成される。
//   db-templates.js はその「初期生成された値」をDBへ流し込むのが seed の役割。
// ・テンプレID は不変。`_disabled` フラグで無効化。物理削除はしない方針（v1.6.0 で UI 確定）。
// ========================================

(function () {
  'use strict';

  function _col() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db
      .collection('companies').doc(window.fb.currentCompanyId)
      .collection('checklistTemplates');
  }

  function _clone(o) {
    if (o == null) return o;
    try { return JSON.parse(JSON.stringify(o)); } catch (e) { return o; }
  }

  // Firestore 保存形式に整形（serverTimestamp は clone の後に付ける）
  function _normalizeForSave(tpl) {
    const out = _clone(tpl) || {};
    if (tpl && tpl.id) out.id = tpl.id;
    out.updatedAt = window.fb.serverTimestamp();
    if (window.fb.currentUser && window.fb.currentUser.uid) {
      out.updatedBy = window.fb.currentUser.uid;
    }
    return out;
  }

  function _normalizeForLoad(snap) {
    const data = snap.data() || {};
    data.id = data.id || snap.id;
    return data;
  }

  // -----------------------------------------
  // 全件読み込み
  // -----------------------------------------
  async function loadAllTemplates() {
    const col = _col();
    if (!col) {
      console.warn('[db-templates] companyId 未確定のため読み込みスキップ');
      return [];
    }
    try {
      const snap = await col.get();
      const list = [];
      snap.forEach(d => list.push(_normalizeForLoad(d)));
      console.log('[db-templates] loaded', list.length, 'templates');
      return list;
    } catch (err) {
      console.error('[db-templates] loadAllTemplates error:', err);
      throw err;
    }
  }

  /* ============================================================
     🔴 v3.16.0（棚卸し S-10）タスクパターンも「変えた欄だけ」保存し、ほかの端末の変更を受け取る
     ・_base[id]＝最後にサーバーと揃えた形。保存は今の形と比べて違う欄だけ update
       （sections などの配列は配列ごと1つの欄。同じパターンの同じ欄を2人が同時に直すと後の人が勝つ）
     ・まだ一度も揃えていないパターン（新しく作った物）だけ丸ごと set
     ・checklistTemplates を購読（subscribeTemplates）。届いたら差し替えて描き直す
     ・何を変えたかを操作ログに1行（S-30）
     ============================================================ */
  const _base = {};
  function _isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function _diff(base, cur, path, out) {
    const keys = {};
    Object.keys(base || {}).forEach(k => { keys[k] = 1; });
    Object.keys(cur || {}).forEach(k => { keys[k] = 1; });
    Object.keys(keys).forEach(k => {
      if (k === 'updatedAt' || k === 'updatedBy') return;
      const b = base ? base[k] : undefined, c = cur ? cur[k] : undefined, p = path.concat([k]);
      if (_isObj(b) && _isObj(c)) { _diff(b, c, p, out); return; }
      if (JSON.stringify(b) === JSON.stringify(c)) return;
      out.push({ path: p, value: c });
    });
    return out;
  }
  function _remember(tpl) { if (tpl && tpl.id) { const c = _clone(tpl); delete c.updatedAt; delete c.updatedBy; _base[tpl.id] = c; } }

  // -----------------------------------------
  // 1件保存（変えた欄だけ。初めての物は丸ごと）
  // -----------------------------------------
  async function saveTemplate(tpl) {
    if (!tpl || !tpl.id) {
      console.error('[db-templates] saveTemplate: tpl.id がない', tpl);
      return;
    }
    const col = _col();
    if (!col) {
      console.warn('[db-templates] saveTemplate: companyId 未確定');
      return;
    }
    const id = String(tpl.id);
    const prev = _base[id];
    const cur = _clone(tpl); delete cur.updatedAt; delete cur.updatedBy;
    try {
      if (!prev) {
        await col.doc(id).set(_normalizeForSave(tpl), { merge: true });
        _base[id] = cur;
        if (typeof window.addAuditLog === 'function') window.addAuditLog('タスクパターン「' + (tpl.name || id) + '」を保存');
        return;
      }
      const changes = _diff(prev, cur, [], []);
      if (!changes.length) return;
      _base[id] = cur;
      const FieldPath = window.firebase.firestore.FieldPath;
      const FieldValue = window.firebase.firestore.FieldValue;
      const args = [];
      changes.forEach(c => {
        args.push(new FieldPath(...c.path.map(String)));
        args.push(c.value === undefined ? FieldValue.delete() : _clone(c.value));
      });
      args.push(new FieldPath('updatedAt'), window.fb.serverTimestamp());
      if (window.fb.currentUser && window.fb.currentUser.uid) args.push(new FieldPath('updatedBy'), window.fb.currentUser.uid);
      await col.doc(id).update(...args);
      if (typeof window.addAuditLog === 'function') {
        window.addAuditLog('タスクパターン「' + (tpl.name || id) + '」を変更（' + changes.map(c => c.path.join('.')).slice(0, 6).join('・') + (changes.length > 6 ? ' ほか' : '') + '）');
      }
    } catch (err) {
      if (prev) _base[id] = prev;
      console.error('[db-templates] saveTemplate error:', err, tpl.id);
      if (typeof showToast === 'function') showToast('テンプレートの保存に失敗しました', 'CF-0025');
      throw err;
    }
  }

  /* v3.16.0 checklistTemplates を購読して、ほかの端末の変更を差し替える */
  function subscribeTemplates(onChange) {
    const col = _col();
    if (!col) return function () {};
    let un = null, relinkT = null, waitMs = 3000;
    function link() {
      un = col.onSnapshot(function (snap) {
        waitMs = 3000;
        if (snap.metadata && snap.metadata.hasPendingWrites) return;
        const list = [];
        snap.forEach(d => list.push(_normalizeForLoad(d)));
        if (!list.length) return;
        const sig = x => JSON.stringify(Object.keys(x).sort().map(k => [k, x[k]]));
        const before = (typeof ChecklistTemplates !== 'undefined') ? sig(ChecklistTemplates) : '';
        replaceInMemory(list);
        const after = (typeof ChecklistTemplates !== 'undefined') ? sig(ChecklistTemplates) : '';
        if (before !== after) {
          try { if (typeof onChange === 'function') onChange(list); } catch (e) { console.error('[db-templates] onChange', e); }
        }
      }, function (err) {
        console.error('[db-templates] 購読が落ちました', err);
        if (relinkT) return;
        relinkT = setTimeout(function () { relinkT = null; try { if (un) un(); } catch (e) {} un = null; link(); }, waitMs);
        waitMs = Math.min(waitMs * 2, 60000);
      });
    }
    link();
    return function () { if (relinkT) clearTimeout(relinkT); try { if (un) un(); } catch (e) {} un = null; };
  }

  // -----------------------------------------
  // 1件削除
  // -----------------------------------------
  async function deleteTemplate(tplId) {
    if (!tplId) return;
    const col = _col();
    if (!col) return;
    try {
      await col.doc(String(tplId)).delete();
    } catch (err) {
      console.error('[db-templates] deleteTemplate error:', err);
      if (typeof showToast === 'function') showToast('テンプレートの削除に失敗しました', 'CF-0026');
      throw err;
    }
  }

  // -----------------------------------------
  // 初期投入：Firestore が空ならメモリの ChecklistTemplates を一括投入
  // バッチ500件まで（普通は数件〜十数件なので余裕）
  // -----------------------------------------
  async function seedTemplatesIfEmpty() {
    const col = _col();
    if (!col) return false;
    try {
      // v1.8.37: settings/main の _seedSampleDone フラグで再シード防止
      //   工場出荷リセット後にリロードしても、デフォルトテンプレが復活しないようにする
      try {
        const sref = window.fb.db
          .collection('companies').doc(window.fb.currentCompanyId)
          .collection('settings').doc('main');
        const ssnap = await sref.get();
        if (ssnap.exists && ssnap.data()._seedSampleDone) {
          console.log('[db-templates] _seedSampleDone=true → 初期投入スキップ');
          return false;
        }
      } catch (e) {
        console.warn('[db-templates] _seedSampleDone チェック失敗（処理は継続）:', e);
      }
      const probe = await col.limit(1).get();
      if (!probe.empty) return false;

      if (typeof ChecklistTemplates === 'undefined') {
        console.warn('[db-templates] ChecklistTemplates 未定義 → seed スキップ');
        return false;
      }
      const ids = Object.keys(ChecklistTemplates);
      if (ids.length === 0) {
        console.warn('[db-templates] in-memory templates が空 → seed スキップ');
        return false;
      }

      console.log('[db-templates] seeding', ids.length, 'templates...');
      const CHUNK = 450;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const batch = window.fb.db.batch();
        slice.forEach(id => {
          const tpl = ChecklistTemplates[id];
          if (!tpl) return;
          const ref = col.doc(String(id));
          batch.set(ref, _normalizeForSave(tpl));
        });
        await batch.commit();
      }
      console.log('[db-templates] seeded OK');
      return true;
    } catch (err) {
      console.error('[db-templates] seedTemplatesIfEmpty error:', err);
      throw err;
    }
  }

  // -----------------------------------------
  // 既存 in-memory ChecklistTemplates を DB の内容で置き換える（参照は保つ）
  // -----------------------------------------
  function replaceInMemory(list) {
    if (typeof ChecklistTemplates === 'undefined') {
      console.warn('[db-templates] ChecklistTemplates 未定義のため置換スキップ');
      return;
    }
    if (!Array.isArray(list)) return;
    // 既存キー削除（参照は維持）
    Object.keys(ChecklistTemplates).forEach(k => { delete ChecklistTemplates[k]; });
    // v1.7.19: DB から読み戻した旧構造テンプレを新構造（tab + title）に自動移行
    const migrate = (typeof window.migrateChecklistTemplate === 'function')
      ? window.migrateChecklistTemplate : (x => x);
    list.forEach(tpl => {
      if (tpl && tpl.id) { ChecklistTemplates[tpl.id] = migrate(tpl); _remember(ChecklistTemplates[tpl.id]); }
    });
    // v2.4.4: DBに無い builtin テンプレを補完（新規追加タスクが消える問題対策）
    //   補完したものはバックグラウンドで Firestore にも保存して、次回以降は通常ロード
    if (typeof window.ensureBuiltinTemplates === 'function') {
      const added = window.ensureBuiltinTemplates();
      if (added && added.length) {
        console.log('[db-templates] 補完した builtin テンプレ:', added.map(t => t.id));
        added.forEach(tpl => {
          saveTemplate(tpl).catch(e => console.error('[db-templates] 補完 save 失敗', tpl.id, e));
        });
      }
    }
  }

  // -----------------------------------------
  // 読み込み + 反映（auth.js / 設定 UI から呼ぶ）
  // -----------------------------------------
  async function refreshTemplates() {
    const list = await loadAllTemplates();
    if (Array.isArray(list) && list.length > 0) {
      replaceInMemory(list);
    }
    return list;
  }

  // -----------------------------------------
  // 公開
  // -----------------------------------------
  window.dbTemplates = {
    loadAllTemplates,
    saveTemplate,
    deleteTemplate,
    seedTemplatesIfEmpty,
    replaceInMemory,
    refreshTemplates,
    subscribeTemplates,
  };

  console.log('[db-templates] ready');
})();

// ========================================
// グローバルショートカット：window.saveChecklistTemplate(tplId)
// ChecklistTemplates から引いて save（fire-and-forget）
// ========================================
window.saveChecklistTemplate = function (tplId) {
  if (!window.dbTemplates || !tplId) return;
  if (typeof ChecklistTemplates === 'undefined') return;
  const tpl = ChecklistTemplates[tplId];
  if (!tpl) return;
  window.dbTemplates.saveTemplate(tpl).catch(e => console.error('[saveChecklistTemplate] failed', tplId, e));
};
