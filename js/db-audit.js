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

  const DEFAULT_LIMIT = 1000; // v2.27.0: 200→1000

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
  /* 📝 v3.16.4（S-29・S-48）操作ログ1件の形。車の保存と同じまとめ書き（batch）に入れる所でも使う */
  function _docOf(entry) {
    return {
      time: window.fb.serverTimestamp(),
      timeStr: entry.time || '',          // 'M/D HH:MM' 既存表示用
      uid: (window.fb.currentUser && window.fb.currentUser.uid) || null,
      userName: entry.user || (window.fb.currentUser && window.fb.currentUser.displayName) || '—',
      carId: entry.carId || null,
      carNum: entry.carNum || '—',
      action: String(entry.action || ''),
    };
  }

  async function appendAuditLog(entry) {
    if (!entry) return;
    const col = _auditCol();
    if (!col) return;

    const doc = _docOf(entry);
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
          carId: data.carId || null,
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

  /* 🗑 v3.16.8（決まり⑧＝操作ログは誰も消せない）「操作ログを消去」clearAllAuditLogs と画面のボタンは外した。
     記録は足すだけ。壊れた時に人の手で戻すための土台なので、画面から消す道は作らない */

  // -----------------------------------------
  // v2.27.0: DB全体からログを検索（手元の1000件の窓を超えて探す）
  //   ・番号（KM-XXXX）は carNum 完全一致で件数無制限に取得＝削除済みの車の履歴も全部出る
  //   ・人/内容は直近 scan 件（既定5000）をDBから引いて部分一致で絞る
  // 戻り値：renderと同じ形 {time, _ts, userUid, user, carId, carNum, action} の配列（新しい順）
  // -----------------------------------------
  function _shapeAuditDoc(d) {
    const data = d.data() || {};
    let timeStr = data.timeStr || '';
    let ts = 0;
    if (data.time && data.time.toDate) {
      const dt = data.time.toDate();
      ts = dt.getTime();
      if (!timeStr) timeStr = `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    }
    return {
      time: timeStr, _ts: ts,
      userUid: data.uid || null,
      user: data.userName || '—',
      carId: data.carId || null,
      carNum: data.carNum || '—',
      action: data.action || '',
    };
  }

  async function searchAuditLogs(term, opts) {
    const col = _auditCol();
    if (!col) { console.warn('[db-audit] searchAuditLogs: companyId 未確定'); return []; }
    term = String(term == null ? '' : term).trim();
    if (!term) return [];
    const map = new Map();

    // (a) 番号の完全一致（件数無制限＝その車の全履歴。削除済みでも残る）
    const numMatch = term.match(/(\d{1,5})/);
    if (numMatch) {
      const kmLabel = 'KM-' + String(parseInt(numMatch[1], 10)).padStart(4, '0');
      try {
        const s = await col.where('carNum', '==', kmLabel).get();
        s.forEach(d => map.set(d.id, _shapeAuditDoc(d)));
      } catch (e) { console.warn('[db-audit] searchAuditLogs carNum query:', e); }
    }

    // (b) 人・内容・番号の部分一致（直近 scan 件をDBから引いて絞る）
    const scanN = (opts && typeof opts.scan === 'number') ? opts.scan : 5000;
    try {
      const s = await col.orderBy('time', 'desc').limit(scanN).get();
      const lower = term.toLowerCase();
      s.forEach(d => {
        const x = d.data() || {};
        const hay = `${x.carNum || ''} ${x.action || ''} ${x.userName || ''}`.toLowerCase();
        if (hay.includes(lower)) map.set(d.id, _shapeAuditDoc(d));
      });
    } catch (e) { console.warn('[db-audit] searchAuditLogs scan:', e); }

    const arr = [...map.values()];
    arr.sort((a, b) => (b._ts || 0) - (a._ts || 0));
    console.log('[db-audit] searchAuditLogs', JSON.stringify(term), '→', arr.length, '件');
    return arr;
  }

  // -----------------------------------------
  // 公開
  // -----------------------------------------
  window.dbAudit = {
    docOf: _docOf,
    col: _auditCol,
    appendAuditLog,
    loadRecentAuditLogs,
    searchAuditLogs,
  };

  console.log('[db-audit] ready');
})();

/* 🗑 v3.16.8 画面から呼ぶ「操作ログを消去」（clearAuditLogsFromUI）も外した（上の説明） */
