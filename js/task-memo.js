// ========================================
// task-memo.js (v2.2.0 / v2.2.1)
// タスク別個別メモの「値編集」
//
// データ:
//   car.taskMemos[taskId] = {
//     value: string,
//     createdAt, updatedAt, createdBy
//   }
//   メモ種別（freeword/date/time）は appTaskMemoConfig[phase][taskId].type で決まる（タスクに固定）
//
// 公開API:
//   window.taskMemo.openModal(carId, taskId, phase)
//   window.taskMemo.closeModal()
//   window.taskMemo.save()
//   window.taskMemo.delete()
//   window.taskMemo.renderTaskMemoCellHtml(car, task, phase)
//     → タスク行の右側 inline に入れるメモセル HTML（空 or 「ラベル: 値」）
// ========================================

(function () {
  'use strict';

  const _ctx = {
    carId: null,
    taskId: null,
    phase: null,
    fromArchive: false,
    type: 'freeword',
    label: '',
  };

  function _esc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _findCar(carId) {
    if (typeof cars !== 'undefined' && Array.isArray(cars)) {
      const c = cars.find(x => x && x.id === carId);
      if (c) return { car: c, fromArchive: false };
    }
    if (typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) {
      const c = archivedCars.find(x => x && x.id === carId);
      if (c) return { car: c, fromArchive: true };
    }
    return null;
  }

  function _saveCar(car, fromArchive) {
    if (fromArchive) {
      if (window.dbArchive && window.dbArchive.saveArchivedCar) {
        window.dbArchive.saveArchivedCar(car).catch(e => console.error('[task-memo] save archived failed', e));
      }
    } else {
      if (window.saveCarById) saveCarById(car.id);
    }
  }

  function _getMemo(car, taskId) {
    if (!car || !car.taskMemos) return null;
    return car.taskMemos[taskId] || null;
  }

  // ----------------------------------------
  // タスク行右側に入れるメモセル HTML
  // - 設定が OFF → 空文字（表示なし＝従来通り）
  // - 値なし     → 薄い「+ ラベル」追加プロンプト
  // - 値あり     → 「ラベル: 値」inline、長文は…省略、ホバーで全文
  // ----------------------------------------
  function renderTaskMemoCellHtml(car, task, phase) {
    if (typeof isTaskMemoEnabled !== 'function' || !isTaskMemoEnabled(task.id, phase)) return '';
    // 自動判定タスクは対象外
    if (task.id === 't_complete' || task.id === 'd_complete') return '';
    const cfg = getTaskMemoConfig(task.id, phase);
    const label = (typeof getTaskMemoLabel === 'function') ? getTaskMemoLabel(task.id, phase) : (cfg.label || 'メモ');
    const memo = _getMemo(car, task.id);
    const handlerAttr = `onclick="event.stopPropagation();window.taskMemo.openModal('${_esc(car.id)}','${_esc(task.id)}','${_esc(phase)}')"`;

    if (!memo || !memo.value) {
      // 値なし → 薄い追加プロンプト
      return `<span class="task-memo-cell task-memo-empty" ${handlerAttr} title="メモを追加（${_esc(label)}）">
        <span class="task-memo-empty-lbl">+ ${_esc(label)}</span>
      </span>`;
    }
    // 値あり：「ラベル: 値」表示
    let displayValue;
    if (cfg.type === 'date') {
      // YYYY-MM-DD → M/D に短縮（fmtDate があればそれを使う）
      try {
        const d = new Date(memo.value);
        if (!isNaN(d.getTime())) {
          displayValue = `${d.getMonth() + 1}/${d.getDate()}`;
        } else displayValue = memo.value;
      } catch (e) { displayValue = memo.value; }
    } else if (cfg.type === 'time') {
      displayValue = memo.value;
    } else {
      // freeword: 改行を空白に、ホバーで全文
      displayValue = String(memo.value || '').replace(/\n/g, ' ');
    }
    const fullText = `${label}: ${memo.value || ''}`;
    const typeCls = cfg.type === 'date' ? 'task-memo-date'
                  : cfg.type === 'time' ? 'task-memo-time'
                  : 'task-memo-freeword';
    return `<span class="task-memo-cell task-memo-filled ${typeCls}" ${handlerAttr} title="${_esc(fullText)}">
      <span class="task-memo-lbl">${_esc(label)}:</span>
      <span class="task-memo-val">${_esc(displayValue)}</span>
    </span>`;
  }

  // ----------------------------------------
  // 値編集モーダル
  // ----------------------------------------
  function openModal(carId, taskId, phase) {
    if (typeof isTaskMemoEnabled === 'function' && !isTaskMemoEnabled(taskId, phase)) {
      if (typeof showToast === 'function') showToast('このタスクはメモ設定がOFFです');
      return;
    }
    const found = _findCar(carId);
    if (!found) return;
    _ctx.carId = carId;
    _ctx.taskId = taskId;
    _ctx.phase = phase;
    _ctx.fromArchive = found.fromArchive;

    const cfg = (typeof getTaskMemoConfig === 'function') ? getTaskMemoConfig(taskId, phase) : { type: 'freeword', label: '' };
    _ctx.type = cfg.type;
    _ctx.label = (typeof getTaskMemoLabel === 'function') ? getTaskMemoLabel(taskId, phase) : (cfg.label || 'メモ');

    const memo = _getMemo(found.car, taskId);

    // モーダルタイトル
    const titleEl = document.getElementById('tm-modal-title');
    if (titleEl) {
      const ico = cfg.type === 'date' ? '📅' : cfg.type === 'time' ? '⏰' : '📝';
      titleEl.textContent = `${ico} ${_ctx.label}`;
    }

    // タスク名表示
    let taskName = taskId;
    if (typeof _allTasksForPhase === 'function') {
      const tasks = _allTasksForPhase(phase);
      const t = tasks.find(x => x.id === taskId);
      if (t) taskName = `${t.icon || ''} ${t.name || taskId}`.trim();
    }
    const nameEl = document.getElementById('tm-task-name');
    if (nameEl) nameEl.textContent = taskName;

    // 入力欄ラベル
    const inpLabelEl = document.getElementById('tm-input-label');
    if (inpLabelEl) inpLabelEl.textContent = _ctx.label;

    _updateInputArea(memo ? memo.value : '');

    // 削除ボタン表示制御
    const delBtn = document.getElementById('tm-btn-delete');
    if (delBtn) delBtn.style.visibility = memo ? 'visible' : 'hidden';

    const modal = document.getElementById('modal-task-memo');
    if (modal) modal.classList.add('open');

    // フォーカス
    setTimeout(() => {
      const inp = document.getElementById('tm-input');
      if (inp) inp.focus();
    }, 80);
  }

  function _updateInputArea(currentValue) {
    const area = document.getElementById('tm-input-area');
    if (!area) return;
    const v = String(currentValue || '');
    // v2.2.10: value は HTML 属性で渡さず、JS で明示的にセット（autocomplete=off で意図しない補完を防止）
    //          一部ブラウザで空属性なのに yy/mm/dd 風のデフォルトが出る現象を抑える
    if (_ctx.type === 'date') {
      area.innerHTML = `<input id="tm-input" type="date" class="tm-input-field" autocomplete="off">`;
      const inp = document.getElementById('tm-input');
      if (inp) inp.value = v;
    } else if (_ctx.type === 'time') {
      // step=60 で秒を非表示、autocomplete=off で意図しない補完を抑制
      area.innerHTML = `<input id="tm-input" type="time" class="tm-input-field" autocomplete="off" step="60">`;
      const inp = document.getElementById('tm-input');
      if (inp) inp.value = v;
    } else {
      area.innerHTML = `<textarea id="tm-input" rows="5" placeholder="自由メモ" class="tm-input-field tm-input-ta" autocomplete="off">${_esc(v)}</textarea>`;
    }
  }

  function closeModal() {
    const modal = document.getElementById('modal-task-memo');
    if (modal) modal.classList.remove('open');
    _ctx.carId = null;
    _ctx.taskId = null;
  }

  function save() {
    const found = _findCar(_ctx.carId);
    if (!found) return;
    const inp = document.getElementById('tm-input');
    if (!inp) return;
    const value = String(inp.value || '').trim();
    if (!value) {
      if (typeof showToast === 'function') showToast('内容を入力してください', 'CF-3002');
      return;
    }
    const car = found.car;
    if (!car.taskMemos) car.taskMemos = {};
    const prev = car.taskMemos[_ctx.taskId] || null;
    const nowIso = new Date().toISOString();
    car.taskMemos[_ctx.taskId] = {
      value: value,
      createdAt: (prev && prev.createdAt) || nowIso,
      updatedAt: nowIso,
      createdBy: (prev && prev.createdBy) || ((window.fb && window.fb.currentUser && window.fb.currentUser.uid) || null),
    };
    _saveCar(car, found.fromArchive);
    if (typeof addLog === 'function') {
      addLog(car.id, `タスク「${_ctx.taskId}」のメモを${prev ? '更新' : '作成'}`);
    }
    if (typeof showToast === 'function') showToast('メモを保存しました');
    // v2.2.7: 自動付箋を同期（date型なら作成/更新、それ以外なら削除）
    if (window.taskMemoAutoNote && window.taskMemoAutoNote.sync) {
      window.taskMemoAutoNote.sync(car, _ctx.taskId, _ctx.phase);
    }
    closeModal();
    if (typeof renderDetailBody === 'function') renderDetailBody(car);
  }

  function del() {
    if (!confirm('このメモを削除しますか？')) return;
    const found = _findCar(_ctx.carId);
    if (!found) return;
    const car = found.car;
    if (car.taskMemos && car.taskMemos[_ctx.taskId]) {
      delete car.taskMemos[_ctx.taskId];
      _saveCar(car, found.fromArchive);
      if (typeof addLog === 'function') {
        addLog(car.id, `タスク「${_ctx.taskId}」のメモを削除`);
      }
      if (typeof showToast === 'function') showToast('メモを削除しました');
    }
    // v2.2.7: メモ削除に伴い自動付箋も削除
    if (window.taskMemoAutoNote && window.taskMemoAutoNote.sync) {
      window.taskMemoAutoNote.sync(car, _ctx.taskId, _ctx.phase);
    }
    closeModal();
    if (typeof renderDetailBody === 'function') renderDetailBody(car);
  }

  window.taskMemo = {
    openModal,
    closeModal,
    save,
    delete: del,
    renderTaskMemoCellHtml,
    // 旧API互換のためにスタブ
    renderTaskMemoRowHtml: function () { return ''; },
  };
})();
