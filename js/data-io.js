// ========================================
// data-io.js (v1.8.21 → v1.8.22)
// データ管理：完全バックアップ（JSON）／車両一括編集（Excel）／全消去
// ----------------------------------------
// 対応機能：
//   ・exportFullBackup()   → 全データをJSON書き出し（バックアップ用）
//   ・（v3.16.7 で外した）importFullBackup＝JSONで全置換
//   ・exportCarsExcel()    → 在庫車両をxlsx書き出し（一括編集用・状態は日本語ラベル）
//   ・importCarsExcel()    → xlsx取り込み（IDで突合、ID空欄なら新規登録、状態は日英両対応）
//   ・（v3.16.7 で外した）clearAllData＝全削除
//
// v1.8.22 修正点：
//   ・カラムID修正：'sale'（誤）→ 'exhibit'（正）
//   ・状態列をExcel上は日本語表示（その他/仕入れ/再生中/展示中/納車準備/納車完了）
//   ・確認文字列を日本語化（DELETE ALL → 全消去 / RESTORE → 復元）。英語も互換受け
//   ・ステータス表示をプロミネントなバナーに変更（実行中／成功／失敗が一目で分かる）
// ========================================

(function () {
  'use strict';

  const BATCH_SIZE = 400;

  // 状態（カンバンの col）の双方向マッピング
  const COL_LABELS = {
    other:    'その他',
    purchase: '仕入れ',
    regen:    '展示準備中',
    exhibit:  '展示中',
    delivery: '納車準備',
    done:     '納車完了',
  };
  const COL_LABEL_TO_ID = {};
  Object.keys(COL_LABELS).forEach(k => { COL_LABEL_TO_ID[COL_LABELS[k]] = k; });
  const VALID_COL_IDS = Object.keys(COL_LABELS);

  function _toLabel(colId) { return COL_LABELS[colId] || colId || ''; }
  function _yen(v) { const n = Number(String(v == null ? '' : v).replace(/[,\s]/g, '')); return (v === '' || v == null || !isFinite(n)) ? '未設定' : n.toLocaleString('ja-JP') + '円'; }
  function _toColId(value) {
    if (!value) return '';
    const v = String(value).trim();
    if (VALID_COL_IDS.includes(v)) return v;        // 英語ID直接
    if (COL_LABEL_TO_ID[v]) return COL_LABEL_TO_ID[v]; // 日本語ラベル
    return null; // 不正
  }

  // ----------------------------------------
  // Firestore 参照
  // ----------------------------------------
  function _companyRef() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db.collection('companies').doc(window.fb.currentCompanyId);
  }

  function _toast(msg) { if (typeof showToast === 'function') showToast(msg); }

  // ============================================================
  // 完全バックアップ（JSON）エクスポート
  // ============================================================
  async function exportFullBackup() {
    const ref = _companyRef();
    if (!ref) { _toast('会社情報が取れません'); return; }

    if (!(await cfAsk('完全バックアップをJSONで書き出します。\n（写真本体は含みません。URL/参照のみ）\nよろしいですか？', { ok: '書き出す' }))) return;   /* v3.16.7（B-03） */

    _setStatus('バックアップ取得中…', 'info');
    try {
      const carsSnap = await ref.collection('cars').get();
      const archivedSnap = await ref.collection('archivedCars').get();
      const boardNotesSnap = await ref.collection('boardNotes').get();
      const settingsSnap = await ref.collection('settings').doc('main').get();
      const tplSnap = await ref.collection('checklistTemplates').get();
      const customTasksSnap = await ref.collection('customTasks').get();

      const data = {
        _meta: {
          format: 'carflow-backup',
          version: 1,
          exportedAt: new Date().toISOString(),
          exportedBy: (window.fb.currentUser && window.fb.currentUser.email) || null,
          companyId: window.fb.currentCompanyId,
          appVersion: 'v1.8.22',
          counts: {
            cars: carsSnap.size,
            archivedCars: archivedSnap.size,
            boardNotes: boardNotesSnap.size,
            checklistTemplates: tplSnap.size,
            customTasks: customTasksSnap.size,
          },
        },
        cars: carsSnap.docs.map(d => Object.assign({ _id: d.id }, d.data())),
        archivedCars: archivedSnap.docs.map(d => Object.assign({ _id: d.id }, d.data())),
        boardNotes: boardNotesSnap.docs.map(d => Object.assign({ _id: d.id }, d.data())),
        settingsMain: settingsSnap.exists ? settingsSnap.data() : null,
        checklistTemplates: tplSnap.docs.map(d => Object.assign({ _id: d.id }, d.data())),
        customTasks: customTasksSnap.docs.map(d => Object.assign({ _id: d.id }, d.data())),
      };

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const fileName = `carflow_backup_${_dateStamp()}.json`;
      _downloadBlob(blob, fileName);

      _setStatus(`バックアップ書き出し完了（${(json.length / 1024).toFixed(1)} KB）`, 'ok');
      _toast('バックアップを書き出しました');
    } catch (err) {
      console.error('[data-io] exportFullBackup error', err);
      _setStatus('バックアップ失敗：' + (err.message || err), 'err');
    }
  }

  /* 🗑 v3.16.7（棚卸し A-36・ゆうた 2026-10-15「B＝無くす」）「取り込み（全置換）」importFullBackup は外した。
     既存の車・実績・付箋・テンプレを全部消して控えで置き換える道だった（使っていない・間違えると戻せない）。
     もしもの時に戻す手順＝_ルール\メモ.md の「🛟 戻す手順」（管理者が行う） */

  // ============================================================
  // 車両一括編集Excel エクスポート
  // ============================================================
  async function exportCarsExcel() {
    if (typeof XLSX === 'undefined') { _toast('Excelライブラリ未読込'); return; }
    const ref = _companyRef();
    if (!ref) { _toast('会社情報が取れません'); return; }

    _setStatus('Excel書き出し中…', 'info');
    try {
      const carsSnap = await ref.collection('cars').get();
      const cars = carsSnap.docs.map(d => Object.assign({ _id: d.id }, d.data()));

      const headers = [
        'ID（編集禁止）', '管理番号', 'メーカー', 'モデル', '年式', '色', 'サイズ',
        '走行距離', '価格', '仕入日', '納車予定日', '状態',
        'お客様名', 'メモ', '作業メモ',
      ];

      const rows = cars.map(c => [
        c._id || c.id || '',
        c.num || '',
        c.maker || '',
        c.model || '',
        c.year || '',
        c.color || '',
        c.size || '',
        c.km || '',
        c.price || '',
        c.purchaseDate || '',
        c.deliveryDate || '',
        _toLabel(c.col),  // 日本語表示
        c.customerName || '',
        c.memo || '',
        c.workMemo || '',
      ]);

      // 説明行（ID列は触らない、状態の選択肢など）
      const note1 = [
        '※ID列は編集禁止', '', '', '', '', '', '', '', '', '', '',
        '※状態：その他/仕入れ/再生中/展示中/納車準備/納車完了',
        '', '', '',
      ];

      const aoa = [headers, note1].concat(rows);
      const ws = XLSX.utils.aoa_to_sheet(aoa);

      ws['!cols'] = [
        {wch:24},{wch:10},{wch:12},{wch:18},{wch:8},{wch:10},{wch:12},
        {wch:10},{wch:12},{wch:12},{wch:12},{wch:14},
        {wch:14},{wch:30},{wch:30},
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '車両一括編集');

      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      _downloadBlob(blob, `carflow_cars_${_dateStamp()}.xlsx`);

      _setStatus(`Excel書き出し完了（${cars.length}台）`, 'ok');
      _toast('Excelで書き出しました');
    } catch (err) {
      console.error('[data-io] exportCarsExcel error', err);
      _setStatus('Excel書き出し失敗：' + (err.message || err), 'err');
    }
  }

  // ============================================================
  // 車両一括編集Excel インポート
  // ============================================================
  async function importCarsExcel() {
    if (typeof XLSX === 'undefined') { _toast('Excelライブラリ未読込'); return; }
    const ref = _companyRef();
    if (!ref) { _toast('会社情報が取れません'); return; }

    const file = await _pickFile('.xlsx,.xls');
    if (!file) return;

    let parsed;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      parsed = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    } catch (err) {
      _setStatus('Excel読み込み失敗：' + err.message, 'err');
      return;
    }

    if (!Array.isArray(parsed) || parsed.length < 2) {
      _setStatus('シートに行がありません', 'err'); return;
    }

    // 1行目=ヘッダ、2行目=説明行（無視）、3行目以降=データ
    const dataRows = parsed.slice(2).filter(r => Array.isArray(r) && r.some(v => v != null && v !== ''));
    if (!dataRows.length) {
      _setStatus('データ行がありません', 'err'); return;
    }

    const carsSnap = await ref.collection('cars').get();
    const existingIds = new Set(carsSnap.docs.map(d => d.id));
    const existingById = {};
    carsSnap.docs.forEach(d => { existingById[d.id] = d.data() || {}; });
    const XL_LABEL = { num: '管理番号', maker: 'メーカー', model: '車種', year: '年式', color: '色', size: 'サイズ', km: '走行距離',
      price: '本体価格', purchaseDate: '仕入日', deliveryDate: '納車日', col: '状態', customerName: 'お客様', memo: 'メモ', workMemo: '作業メモ' };

    const ops = [];
    const errors = [];

    dataRows.forEach((row, idx) => {
      const lineNo = idx + 3;
      const [
        idCell, num, maker, model, year, color, size,
        km, price, purchaseDate, deliveryDate, colCell,
        customerName, memo, workMemo,
      ] = row;

      const cleanId = String(idCell || '').trim();
      const colInput = String(colCell || '').trim();
      const colId = colInput ? _toColId(colInput) : 'other';

      if (colInput && colId === null) {
        errors.push(`${lineNo}行目：状態 "${colInput}" は無効（その他/仕入れ/再生中/展示中/納車準備/納車完了 のいずれか）`);
        return;
      }
      if (purchaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(purchaseDate))) {
        errors.push(`${lineNo}行目：仕入日 "${purchaseDate}" の形式不正（YYYY-MM-DD）`);
        return;
      }
      if (deliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(deliveryDate))) {
        errors.push(`${lineNo}行目：納車予定日 "${deliveryDate}" の形式不正（YYYY-MM-DD）`);
        return;
      }

      const editable = {
        num: String(num || '').trim(),
        maker: String(maker || '').trim(),
        model: String(model || '').trim(),
        year: String(year || '').trim(),
        color: String(color || '').trim(),
        size: String(size || '').trim(),
        km: String(km || '').trim(),
        price: String(price || '').trim(),
        purchaseDate: String(purchaseDate || '').trim(),
        deliveryDate: String(deliveryDate || '').trim(),
        col: colId || 'other',
        customerName: String(customerName || '').trim(),
        memo: String(memo || '').trim(),
        workMemo: String(workMemo || '').trim(),
      };

      if (cleanId && existingIds.has(cleanId)) {
        /* 📝 v3.16.0（棚卸し S-30・決まり⑥）更新は「Excel で変わった欄だけ」書き、その車のフローに「前 → 後」を1行。
           前は全部の欄を書き直し、記録も残らなかった */
        const cur = existingById[cleanId] || {};
        const changed = {};
        const notes = [];
        Object.keys(editable).forEach(k => {
          const a = String(cur[k] == null ? '' : cur[k]).trim(), b = editable[k];
          if (a === b) return;
          changed[k] = b;
          notes.push((XL_LABEL[k] || k) + ' ' + (a || '未設定') + '→' + (b || '未設定'));
        });
        if (notes.length) ops.push({ type: 'update', id: cleanId, data: changed, note: notes.join('・'), num: editable.num || cur.num || '' });
      } else if (cleanId && !existingIds.has(cleanId)) {
        errors.push(`${lineNo}行目：ID "${cleanId}" の車両が存在しません → 新規登録扱い`);
        ops.push({ type: 'create', id: cleanId, data: editable });
      } else {
        const newId = 'c' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        ops.push({ type: 'create', id: newId, data: editable });
      }
    });

    const updates = ops.filter(o => o.type === 'update').length;
    const creates = ops.filter(o => o.type === 'create').length;
    let summary = `Excelの内容で以下を反映します：\n\n・更新：${updates}件\n・新規登録：${creates}件\n`;
    if (errors.length) summary += `\n⚠️ 警告 ${errors.length}件あり：\n` + errors.slice(0, 5).join('\n');
    summary += `\n\n更新行のチェック状況・装備品・写真は保持されます。\n本当に反映しますか？`;
    if (!(await cfAsk(summary, { ok: '反映する' }))) { _toast('反映をキャンセルしました'); return; }   /* v3.16.7（B-03） */

    _setStatus('Excel取り込み中…', 'info');
    try {
      let pending = ops.slice();
      while (pending.length) {
        /* 📝 v3.16.4 1台につき「車」と「操作ログ1件」の2つを書く＝まとめ書きの上限（500）に収まるよう半分ずつ */
        const chunk = pending.splice(0, Math.floor(BATCH_SIZE / 2));
        const batch = window.fb.db.batch();
        chunk.forEach(op => {
          const docRef = ref.collection('cars').doc(op.id);
          const now = new Date();
          const entry = {
            time: `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
            at: now.getTime(),
            userUid: (window.fb.currentUser && window.fb.currentUser.uid) || null,
            user: (typeof currentUser !== 'undefined' && currentUser) || '—',
            carNum: (op.type === 'update' ? op.num : op.data.num) || '—',
            action: op.type === 'update'
              ? '車両情報を編集：Excel取り込み（' + op.note + '）'
              : '新規登録（Excel取り込み）：本体価格 ' + _yen(op.data.price) + '・納車日 ' + (op.data.deliveryDate || '未定') + '・状態 ' + _toLabel(op.data.col),
            carId: op.id,
          };
          /* 📝 v3.16.4 操作ログ（auditLogs）にも1台ずつ「前 → 後」を、車と同じ1回のまとめ書きで（前は「更新◯件」の1行だけ） */
          if (window.dbAudit && window.dbAudit.docOf) batch.set(ref.collection('auditLogs').doc(), window.dbAudit.docOf(entry));
          if (op.type === 'update') {
            batch.update(docRef, Object.assign({}, op.data, {
              logs: window.firebase.firestore.FieldValue.arrayUnion(entry),
              updatedAt: window.fb.serverTimestamp(),
              updatedBy: (window.fb.currentUser && window.fb.currentUser.uid) || null,
            }));
          } else {
            const baseDoc = Object.assign({}, op.data, {
              id: op.id,
              contract: 0,
              regenTasks: {},
              deliveryTasks: {},
              equipment: {},
              logs: [entry],
              photo: '',
              createdAt: window.fb.serverTimestamp(),
              updatedAt: window.fb.serverTimestamp(),
              createdBy: (window.fb.currentUser && window.fb.currentUser.uid) || null,
            });
            batch.set(docRef, baseDoc);
          }
        });
        await batch.commit();
      }

      /* 📝 v3.16.0（S-30）取り込みを操作ログに1行 */
      if (typeof addAuditLog === 'function') addAuditLog(`Excel取り込み（更新${updates}件・新規${creates}件・警告${errors.length}件）`);
      _setStatus(`取り込み完了（更新${updates}件 / 新規${creates}件 / 警告${errors.length}件）。リロードします…`, 'ok');
      setTimeout(() => location.reload(), 1800);
    } catch (err) {
      console.error('[data-io] importCarsExcel error', err);
      _setStatus('取り込み失敗：' + (err.message || err), 'err');
    }
  }

  /* 🗑 v3.16.7（棚卸し A-36）「全データを消去」clearAllData と、それと全置換だけが使っていた
     _deleteCollection・_writeDocs は外した */

  // ============================================================
  // 補助
  // ============================================================
  function _pickFile(accept) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        document.body.removeChild(input);
        resolve(f || null);
      });
      input.click();
    });
  }

  function _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function _dateStamp() {
    const n = new Date();
    return `${n.getFullYear()}${String(n.getMonth()+1).padStart(2,'0')}${String(n.getDate()).padStart(2,'0')}_${String(n.getHours()).padStart(2,'0')}${String(n.getMinutes()).padStart(2,'0')}`;
  }

  // ============================================================
  // ステータス表示（プロミネントなバナー）
  // ============================================================
  function _setStatus(text, kind) {
    const banner = document.getElementById('data-io-banner');
    const icon = document.getElementById('data-io-banner-icon');
    const txt = document.getElementById('data-io-banner-text');
    if (!banner) return;
    if (!text) {
      banner.style.display = 'none';
      return;
    }
    let bg, border, color, iconText, label;
    if (kind === 'ok') {
      bg = 'rgba(34,197,94,.14)';
      border = 'rgba(34,197,94,.6)';
      color = '#22c55e';
      iconText = '✅';
      label = '成功';
    } else if (kind === 'err') {
      bg = 'rgba(239,68,68,.14)';
      border = 'rgba(239,68,68,.6)';
      color = '#ef4444';
      iconText = '❌';
      label = '失敗';
    } else {
      // info / 実行中
      bg = 'rgba(59,130,246,.14)';
      border = 'rgba(59,130,246,.6)';
      color = '#60a5fa';
      iconText = '⏳';
      label = '実行中';
    }
    banner.style.display = 'flex';
    banner.style.background = bg;
    banner.style.borderColor = border;
    if (icon) {
      icon.textContent = iconText;
      icon.style.color = color;
    }
    if (txt) {
      txt.innerHTML = `<strong style="color:${color};margin-right:8px">${label}</strong>${_esc(text)}`;
    }
    try { banner.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 公開
  window.exportFullBackup = exportFullBackup;
  window.exportCarsExcel = exportCarsExcel;
  window.importCarsExcel = importCarsExcel;

  console.log('[data-io] v1.8.22 ready');
})();
