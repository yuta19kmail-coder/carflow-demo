// ========================================
// db-audit.js (v1.5.4〜)
// Firestore の auditLogs コレクションに対する CRUD wrapper
// ----------------------------------------
// パス：companies/{companyId}/auditLogs/{autoId}
//
// helpers.js の addLog から fire-and-forget で 1 件ずつ append される。
// ログイン時に直近 N 件だけ load して globalLogs に反映。
// 横断ログなので、誰がいつ何にどう操作したかが他スタッフからも見える。
//
// DB設計書 §2-8 のスキーマに準拠：
//   time: Timestamp（serverTimestamp）
//   timeStr: 'M/D HH:MM' （表示用、addLog で生成済みの文字列）
//   uid: string
//   userName: string
//   carId?: string
//   carNum?: string
//   action: string
//
// 提供関数（window.dbAudit 名前空間）：
//   appendAuditLog(entry)        : 1件 add（auto-id）。fire-and-forget で呼ぶ
//   loadRecentAuditLogs(limit)   : 直近 limit 件を取得（time desc）
// ========================================

(function () {
  'use strict';

  const DEFAULT_LIMIT = 200;

  function _auditCol() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db
      .collection('companies').doc(window.fb.currentCompanyId)
      .collection('auditLogs');
  }

  // -----------------------------------------
  // 1件追加（auto-id）
  // entry: { time, user, carNum, action, carId? }
  //   既存の addLog が作るオブジェクトをそのまま受け取れる形にする。
  // -----------------------------------------
  async function appendAuditLog(entry) {
    if (!entry) return;
    const col = _auditCol();
    if (!col) return;

    const doc = {
      time: window.fb.serverTimestamp(),
      timeStr: entry.time || '',          // 'M/D HH:MM' 既存表示用
      uid: (window.fb.currentUser && window.fb.currentUser.uid) || null,
      userName: entry.user || (window.fb.currentUser && window.fb.currentUser.displayName) || '—',
      carId: entry.carId || null,
      carNum: entry.carNum || '—',
      action: String(entry.action || ''),
    };
    try {
      await col.add(doc);
    } catch (err) {
      console.error('[db-audit] appendAuditLog error:', err, entry);
      // ログ系は失敗してもUIに出さない（操作邪魔しないため）
    }
  }

  // -----------------------------------------
  // 直近 N 件取得（time desc）
  // 戻り値：表示用に整形した entry 配列（addLog の形に揃える）
  //   [{time, user, carNum, action}, ...]
  // -----------------------------------------
  async function loadRecentAuditLogs(limit) {
    const col = _auditCol();
    if (!col) {
      console.warn('[db-audit] companyId 未確定のため読み込みスキップ');
      return [];
    }
    const n = (typeof limit === 'number' && limit > 0) ? limit : DEFAULT_LIMIT;
    try {
      const snap = await col.orderBy('time', 'desc').limit(n).get();
      const list = [];
      snap.forEach(d => {
        const data = d.data() || {};
        // Firestore Timestamp → 表示用 'M/D HH:MM'
        let timeStr = data.timeStr || '';
        if (!timeStr && data.time && data.time.toDate) {
          const dt = data.time.toDate();
          timeStr = `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        }
        list.push({
          time: timeStr,
          user: data.userName || '—',
          carNum: data.carNum || '—',
          action: data.action || '',
        });
      });
      console.log('[db-audit] loaded', list.length, 'audit logs');
      return list;
    } catch (err) {
      console.error('[db-audit] loadRecentAuditLogs error:', err);
      return [];
    }
  }

  // -----------------------------------------
  // 全消去（v1.8.24〜・admin/manager のみ）
  // 操作ログを全削除。Firestoreルール側で _isAdminish() ガード済み
  // -----------------------------------------
  async function clearAllAuditLogs() {
    const col = _auditCol();
    if (!col) {
      console.warn('[db-audit] clearAllAuditLogs: companyId 未確定');
      return false;
    }
    const BATCH = 400;
    let total = 0;
    while (true) {
      const snap = await col.limit(BATCH).get();
      if (snap.empty) break;
      const batch = window.fb.db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      total += snap.size;
      if (snap.size < BATCH) break;
    }
    console.log('[db-audit] cleared', total, 'logs');
    return total;
  }

  // -----------------------------------------
  // 公開
  // -----------------------------------------
  window.dbAudit = {
    appendAuditLog,
    loadRecentAuditLogs,
    clearAllAuditLogs,
  };

  console.log('[db-audit] ready');
})();

// ========================================
// グローバル：UIから呼ぶ操作ログ消去（v1.8.24〜）
// ========================================
window.clearAuditLogsFromUI = async function () {
  if (!window.dbAudit || !window.dbAudit.clearAllAuditLogs) return;
  if (!confirm('操作ログを全て消去します。\n（過去の操作履歴は復旧できません）\n\n続けますか？')) return;
  const ans = prompt('最終確認です。「消去」と入力してください：');
  if (!ans || (ans.trim() !== '消去' && ans.trim().toUpperCase() !== 'CLEAR')) {
    if (typeof showToast === 'function') showToast('操作ログ消去をキャンセルしました');
    return;
  }
  try {
    if (typeof showToast === 'function') showToast('操作ログを消去中…');
    const n = await window.dbAudit.clearAllAuditLogs();
    // メモリ上のログも空に
    if (typeof globalLogs !== 'undefined' && Array.isArray(globalLogs)) {
      globalLogs.length = 0;
    }
    if (typeof renderLogPanel === 'function') renderLogPanel();
    if (typeof showToast === 'function') showToast(`操作ログを${n}件消去しました`);
  } catch (err) {
    console.error('[clearAuditLogsFromUI] error:', err);
    if (typeof showToast === 'function') showToast('操作ログの消去に失敗しました');
  }
};
