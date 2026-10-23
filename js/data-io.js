// ========================================
// data-io.js (v1.8.21 → v1.8.22)
// データ管理：完全バックアップ（JSON）（車両一括編集（Excel）・全消去は外した）
// ----------------------------------------
// 対応機能：
//   ・exportFullBackup()   → 全データをJSON書き出し（バックアップ用）
//   ・（v3.16.7 で外した）importFullBackup＝JSONで全置換
//   ・（v4.4.2 で外した）exportCarsExcel・importCarsExcel＝車両一括編集（Excel）
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

  /* 🗑 v4.4.2（2026-10-23・ゆうた「写真のストレージ移行と一括編集とかはもういらないよね？」→「両方外して」）
     車両一括編集（Excel）の exportCarsExcel・importCarsExcel は外した（取り込んだ記録が全416台で0件） */

  // ============================================================
  // 補助  // ============================================================
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

  console.log('[data-io] v1.8.22 ready');
})();
