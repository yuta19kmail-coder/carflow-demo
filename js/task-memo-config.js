// ========================================
// task-memo-config.js (v2.2.1〜)
// タスク個別メモの「種別設定」モーダル
// 設定→タスク・進捗→各タスクの ⋮ → 「📝 メモ設定」から開く
//
// データ: appTaskMemoConfig[phase][taskId] = { type, label }
//   type: 'off' | 'freeword' | 'date' | 'time'
//   label: string（date/time のみ使用、空ならデフォの「日付」「時刻」）
// ========================================

(function () {
  'use strict';

  const _ctx = { taskId: null, phase: null };

  function _esc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function openTaskMemoConfigModal(taskId, phase) {
    _ctx.taskId = taskId;
    _ctx.phase = phase;

    const cfg = (typeof getTaskMemoConfig === 'function')
      ? getTaskMemoConfig(taskId, phase)
      : { type: 'off', label: '' };

    // タスク名表示
    let taskName = taskId;
    if (typeof _allTasksForPhase === 'function') {
      const tasks = _allTasksForPhase(phase);
      const t = tasks.find(x => x.id === taskId);
      if (t) taskName = `${t.icon || ''} ${t.name || taskId}`.trim();
    }
    const nameEl = document.getElementById('tmc-task-name');
    if (nameEl) nameEl.textContent = taskName;

    // 種別ラジオ
    document.querySelectorAll('input[name="tmc-type"]').forEach(r => {
      r.checked = (r.value === cfg.type);
    });

    // ラベル
    const labelInp = document.getElementById('tmc-label');
    if (labelInp) labelInp.value = cfg.label || '';
    labelInp.oninput = _updatePreview;

    _updateLabelAreaVisibility(cfg.type);
    _updatePreview();

    const m = document.getElementById('modal-task-memo-config');
    if (m) m.classList.add('open');
  }

  function closeTaskMemoConfigModal() {
    const m = document.getElementById('modal-task-memo-config');
    if (m) m.classList.remove('open');
    _ctx.taskId = null;
    _ctx.phase = null;
  }

  function onTaskMemoConfigTypeChange(value) {
    _updateLabelAreaVisibility(value);
    _updatePreview();
  }

  function _updateLabelAreaVisibility(type) {
    const area = document.getElementById('tmc-label-area');
    if (!area) return;
    // date / time のときだけラベル入力欄を出す
    area.style.display = (type === 'date' || type === 'time') ? '' : 'none';
  }

  function _updatePreview() {
    const sel = document.querySelector('input[name="tmc-type"]:checked');
    const type = sel ? sel.value : 'off';
    const labelInp = document.getElementById('tmc-label');
    const customLabel = labelInp ? (labelInp.value || '').trim() : '';
    const preview = document.getElementById('tmc-preview');
    if (!preview) return;
    if (type === 'date') {
      preview.textContent = `${customLabel || '日付'}: 5/25`;
    } else if (type === 'time') {
      preview.textContent = `${customLabel || '時刻'}: 11:00`;
    } else {
      preview.textContent = '日付: 5/25';
    }
  }

  function saveTaskMemoConfig() {
    if (!_ctx.taskId || !_ctx.phase) return;
    const sel = document.querySelector('input[name="tmc-type"]:checked');
    const type = sel ? sel.value : 'off';
    const labelInp = document.getElementById('tmc-label');
    const label = labelInp ? (labelInp.value || '').trim() : '';

    if (typeof appTaskMemoConfig === 'undefined') {
      console.error('[task-memo-config] appTaskMemoConfig is not defined');
      return;
    }
    if (!appTaskMemoConfig[_ctx.phase]) appTaskMemoConfig[_ctx.phase] = {};

    if (type === 'off') {
      // OFF にする場合は設定エントリ自体を削除（既存テナント無破壊）
      delete appTaskMemoConfig[_ctx.phase][_ctx.taskId];
    } else {
      appTaskMemoConfig[_ctx.phase][_ctx.taskId] = {
        type: type,
        label: (type === 'date' || type === 'time') ? label : '',
      };
    }

    // 保存
    if (window.dbSettings && window.dbSettings.saveSettings) {
      window.dbSettings.saveSettings().catch(e => console.error('[task-memo-config] save failed', e));
    }
    if (typeof addLog === 'function') {
      addLog(null, `メモ設定変更：${_ctx.phase}/${_ctx.taskId} → ${type}${label ? `（${label}）` : ''}`);
    }
    if (typeof showToast === 'function') showToast('メモ設定を保存しました');

    closeTaskMemoConfigModal();

    // 再描画
    if (typeof renderTasksEditor === 'function') renderTasksEditor();
    // 詳細モーダルが開いていれば再描画
    if (typeof renderDetailBody === 'function' && typeof activeDetailCarId !== 'undefined' && activeDetailCarId) {
      const car = (typeof cars !== 'undefined') ? cars.find(c => c && c.id === activeDetailCarId) : null;
      const arc = (typeof archivedCars !== 'undefined') ? archivedCars.find(c => c && c.id === activeDetailCarId) : null;
      const target = car || arc;
      if (target) renderDetailBody(target);
    }
  }

  window.openTaskMemoConfigModal = openTaskMemoConfigModal;
  window.closeTaskMemoConfigModal = closeTaskMemoConfigModal;
  window.onTaskMemoConfigTypeChange = onTaskMemoConfigTypeChange;
  window.saveTaskMemoConfig = saveTaskMemoConfig;
})();
