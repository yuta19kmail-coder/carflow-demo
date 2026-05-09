// ========================================
// template-editor.js (v1.6.0〜)
// ----------------------------------------
// ChecklistTemplate（再生 / 納車 / 装備品 / 自社カスタム）の
// 追加・並び替え・名前変更・無効化・項目編集を行う管理画面。
//
// 画面構造（panel-templates 内）：
//   L1: テンプレ一覧（カード）
//   L2: 1テンプレの中身（セクションのアコーディオン → 項目一覧）
//   L3 (modal): 項目編集（name / sub / detail / points / inputType表示）
//
// 状態：
//   window._tplEditor = { view, activeTplId, expandedSectionId }
//
// 保存タイミング：
//   各 mutation の直後に dbTemplates.saveTemplate(tpl) を await（順序保証）。
//   失敗時はトーストで通知。in-memory ChecklistTemplates も常に同期。
//
// 権限：
//   admin / manager のみ（クライアント側ガード）。
//   Firestore ルール側でも write は canEditTemplates を要求。
// ========================================

(function () {
  'use strict';

  window._tplEditor = window._tplEditor || {
    view: 'list',
    activeTplId: null,
    activeVariantId: null, // v1.7.33: 編集中のバリアントID
    expandedSectionId: null,
    editingItem: null, // { sectionId, itemId }
    // v1.6.1: 戻り先（'list' | 'settings'）。
    //   'list'     → テンプレ一覧画面へ（v1.6.0 既定）
    //   'settings' → 設定パネルの「タスク・進捗」に戻る（v1.6.1 タスクから入った時）
    backTo: 'list',
    // v1.7.12: 項目編集モーダルを開いている間の media 編集用ワーキングコピー。
    //   open 時に item.media をディープコピーで載せ、追加/削除/キャプション編集はここを書き換え、
    //   保存 (saveTemplateItem) でまとめて item.media に反映。キャンセルで破棄。
    editingMedia: [],
  };

  // -----------------------------------------
  // ヘルパー
  // -----------------------------------------
  function _can() {
    if (typeof hasPermission === 'function') return hasPermission('canEditTemplates');
    return true; // フォールバック
  }

  function _toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _getTpl(id) {
    return (typeof ChecklistTemplates !== 'undefined' && ChecklistTemplates[id]) || null;
  }

  function _allTpls() {
    if (typeof ChecklistTemplates === 'undefined') return [];
    return Object.values(ChecklistTemplates).sort((a, b) => {
      // sourceType 順 → name 順
      const order = { worksheet: 0, equipment: 1, custom: 2 };
      const ao = order[a.sourceType] != null ? order[a.sourceType] : 9;
      const bo = order[b.sourceType] != null ? order[b.sourceType] : 9;
      if (ao !== bo) return ao - bo;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  function _newId(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  async function _saveTpl(tpl) {
    if (!window.dbTemplates) {
      _toast('DBモジュールが未初期化');
      return false;
    }
    try {
      await window.dbTemplates.saveTemplate(tpl);
      return true;
    } catch (e) {
      console.error('[template-editor] save', e);
      _toast('保存に失敗しました');
      return false;
    }
  }

  // -----------------------------------------
  // メインエントリ：renderTemplateEditor
  // -----------------------------------------
  function renderTemplateEditor() {
    const root = document.getElementById('tpl-editor-body');
    if (!root) return;
    if (!_can()) {
      root.innerHTML = '<div class="tpl-empty">この画面は管理者・店長クラスのみ利用できます。</div>';
      return;
    }
    if (typeof ChecklistTemplates === 'undefined' || Object.keys(ChecklistTemplates).length === 0) {
      root.innerHTML = '<div class="tpl-empty">テンプレートがまだ読み込まれていません。ログイン直後の場合は数秒待ってから再表示してください。</div>';
      return;
    }
    if (window._tplEditor.view === 'detail' && _getTpl(window._tplEditor.activeTplId)) {
      _renderDetail();
    } else {
      window._tplEditor.view = 'list';
      window._tplEditor.activeTplId = null;
      _renderList();
    }
  }

  // -----------------------------------------
  // L1: テンプレ一覧（v1.7.34：バリアント枝分かれ表示）
  // -----------------------------------------
  function _renderList() {
    const root = document.getElementById('tpl-editor-body');
    if (!root) return;
    const list = _allTpls();
    const sourceLabel = { worksheet: '作業管理票', equipment: '装備品', custom: 'カスタム' };

    const cardsHtml = list.map(t => {
      const phase = t.sourcePhase ? `<span class="tpl-phase tpl-phase-${t.sourcePhase}">${t.sourcePhase === 'regen' ? '再生' : '納車'}</span>` : '';
      // v1.7.34: variants を必ず1個以上持つよう整える（旧データの自動移行）
      if (!Array.isArray(t.variants) || t.variants.length === 0) {
        const sec = Array.isArray(t.sections) ? t.sections : [];
        t.variants = [{ id: 'va_default', name: 'デフォルト', sections: sec }];
      }
      const variantsHtml = t.variants.map((v, i) => {
        const isLast = i === t.variants.length - 1;
        const branch = isLast ? '└─' : '├─';
        const items = (v.sections || []).reduce((a, s) => a + (s.items || []).filter(i => !i._disabled).length, 0);
        const sectionCount = (v.sections || []).length;
        const tabSet = new Set();
        (v.sections || []).forEach(s => { tabSet.add(s.tab || ''); });
        const isOnly = t.variants.length <= 1;
        // v1.7.36: パターン名を大きめに、操作ボタンは2段組（名前変更 / 複製 / 削除を別行に折り返せるように）
        return `
          <div class="tpl-variant-row">
            <span class="tpl-variant-branch">${branch}</span>
            <div class="tpl-variant-row-main">
              <div class="tpl-variant-row-name">${_esc(v.name || '(無題)')}</div>
              <div class="tpl-variant-row-stats">
                <span class="tpl-variant-stat">${tabSet.size}タブ</span>
                <span class="tpl-variant-stat">${sectionCount}セクション</span>
                <span class="tpl-variant-stat">${items}項目</span>
              </div>
            </div>
            <div class="tpl-variant-row-actions">
              <button class="btn-sm btn-primary" onclick="openTemplateDetail('${_esc(t.id)}', '${_esc(v.id)}')">✏️ 中身を編集</button>
              <button class="btn-sm" onclick="renameTemplateVariantById('${_esc(t.id)}', '${_esc(v.id)}')" title="このパターン名を変更">📝 名前</button>
              <button class="btn-sm" onclick="duplicateTemplateVariantById('${_esc(t.id)}', '${_esc(v.id)}')" title="このパターンを複製">📋 複製</button>
              <button class="btn-sm" onclick="resetVariantToDefault('${_esc(t.id)}', '${_esc(v.id)}')" title="このパターンを初期状態に戻す">↺ 初期化</button>
              <button class="btn-sm btn-danger" onclick="deleteTemplateVariantById('${_esc(t.id)}', '${_esc(v.id)}')" title="このパターンを削除" ${isOnly ? 'disabled' : ''}>🗑 削除</button>
            </div>
          </div>`;
      }).join('');

      // v1.7.37: built-in（worksheet/equipment）なら「このタスクを初期化」ボタンを出す
      const isBuiltin = (t.sourceType === 'worksheet' || t.sourceType === 'equipment');
      const resetTaskBtn = isBuiltin
        ? `<button class="btn-sm" style="margin-left:auto" onclick="resetTemplateToDefault('${_esc(t.id)}')" title="このタスクを初期状態に戻す（追加パターン・カスタム編集は全部消えます）">↺ このタスクを初期化</button>`
        : '';
      return `
        <div class="tpl-card-v2">
          <div class="tpl-card-header">
            <span class="tpl-card-icon">${_esc(t.icon || '📋')}</span>
            <div style="flex:1;min-width:0">
              <div class="tpl-card-name">${_esc(t.name || '(無題)')}</div>
              <div class="tpl-card-meta">${_esc(sourceLabel[t.sourceType] || t.sourceType || '')} ${phase}</div>
            </div>
            ${resetTaskBtn}
          </div>
          <div class="tpl-variant-list">
            <div class="tpl-variant-list-label">📦 タスクパターン</div>
            ${variantsHtml}
            <div class="tpl-variant-add-row">
              <button class="btn-sm" onclick="addTemplateVariantById('${_esc(t.id)}')">+ パターンを追加</button>
            </div>
          </div>
        </div>`;
    }).join('');

    root.innerHTML = `
      <div class="tpl-list-header">
        <div>
          <div class="tpl-list-title">タスクパターン一覧</div>
          <div class="tpl-list-sub">${list.length}件のテンプレート</div>
        </div>
        <div style="margin-left:auto">
          <button class="btn-sm btn-danger" onclick="resetAllTemplatesToDefault()" title="全タスクを初期状態に戻す">↺ 全タスクを初期化</button>
        </div>
      </div>
      <div class="tpl-grid">${cardsHtml}</div>
      <div class="tpl-help">
        <strong>💡 ヒント</strong><br>
        ・「✏️ 中身を編集」でセクション・小タスクを編集できます。<br>
        ・「+ パターンを追加」で同じテンプレに複数パターン（A/B/C など）を持てます。<br>
        ・「↺ 初期化」は元の組込内容に戻します（カスタム編集は消えます）。
      </div>
    `;
  }

  // v1.7.34: 第2引数 variantId を受け取れるように。指定が無ければ variants[0] を使う。
  function openTemplateDetail(id, variantId) {
    const tpl = _getTpl(id);
    if (!tpl) return;
    window._tplEditor.view = 'detail';
    window._tplEditor.activeTplId = id;
    window._tplEditor.activeVariantId = variantId || null;
    window._tplEditor.expandedSectionId = null;
    _renderDetail();
  }
  window.openTemplateDetail = openTemplateDetail;

  function backToTemplateList() {
    window._tplEditor.view = 'list';
    window._tplEditor.activeTplId = null;
    window._tplEditor.expandedSectionId = null;
    window._tplEditor.backTo = 'list';
    _renderList();
  }
  window.backToTemplateList = backToTemplateList;

  // v1.6.1: 設定パネル（タスク・進捗セクション）に戻る
  function backToTaskSettings() {
    window._tplEditor.view = 'list';
    window._tplEditor.activeTplId = null;
    window._tplEditor.expandedSectionId = null;
    window._tplEditor.backTo = 'list';
    if (typeof showPanel === 'function') {
      const settingsItem = document.getElementById('si-settings');
      showPanel('settings', settingsItem);
      // タスク・進捗セクションをアクティブに（settings.js の switchSettingsSection を使う）
      setTimeout(() => {
        const navBtn = document.querySelector('.settings-nav-item[data-section="tasks"]');
        if (navBtn) navBtn.click();
      }, 50);
    }
  }
  window.backToTaskSettings = backToTaskSettings;

  // v1.6.1: タスク行から呼ばれる：そのタスクの ChecklistTemplate を直接開く
  //   未存在なら空テンプレを生成（settings.js の toggleTaskChecklist で先に生成済みのはず）
  async function openTemplateForTask(taskId, phase) {
    if (!_can()) {
      _toast('管理者権限が必要です');
      return;
    }
    if (typeof ChecklistTemplates === 'undefined') {
      _toast('テンプレートが読み込まれていません');
      return;
    }
    const tplId = (typeof templateIdForTask === 'function')
      ? templateIdForTask(taskId, phase)
      : ('tpl_' + phase + '_' + taskId);

    // 念のため：未存在なら空テンプレを作る（fallback）
    if (!ChecklistTemplates[tplId]) {
      let tname = taskId, ticon = '📝';
      if (typeof getAllTasksForUI === 'function') {
        const all = getAllTasksForUI(phase);
        const tt = all.find(x => x.id === taskId);
        if (tt) { tname = tt.name; ticon = tt.icon || '📝'; }
      }
      const newTpl = {
        id: tplId,
        name: tname,
        icon: ticon,
        // v1.7.19: navigationStyle 廃止（中身の構造で見た目決定）
        sourceType: 'worksheet',
        sourceTaskId: taskId,
        sourcePhase: phase,
        sections: [],
        _migrated: true,
      };
      ChecklistTemplates[tplId] = newTpl;
      if (window.dbTemplates && window.dbTemplates.saveTemplate) {
        try { await window.dbTemplates.saveTemplate(newTpl); } catch (e) { console.error(e); }
      }
    }

    // 状態セット → panel-templates を開いて L2 を直接表示
    window._tplEditor.view = 'detail';
    window._tplEditor.activeTplId = tplId;
    window._tplEditor.expandedSectionId = null;
    window._tplEditor.backTo = 'settings';

    if (typeof showPanel === 'function') {
      // si-templates は v1.6.1 で削除されているので、サイドバーの active 切替は不要
      showPanel('templates', null);
    }
  }
  window.openTemplateForTask = openTemplateForTask;

  // -----------------------------------------
  // v1.7.33: バリアント関連ヘルパー
  // -----------------------------------------
  // テンプレが variants を持っているか確認し、無ければ「デフォルト」1つを作成
  // activeVariantId を妥当な値に揃え、tpl.sections をその variant の sections に同期
  function _ensureActiveVariant(tpl) {
    if (!tpl) return;
    if (!Array.isArray(tpl.variants) || tpl.variants.length === 0) {
      // 旧データの自動移行
      const sec = Array.isArray(tpl.sections) ? tpl.sections : [];
      tpl.variants = [{ id: 'va_default', name: 'デフォルト', sections: sec }];
    }
    // activeVariantId が無効なら variants[0] にフォールバック
    let active = tpl.variants.find(v => v && v.id === window._tplEditor.activeVariantId);
    if (!active) {
      active = tpl.variants[0];
      window._tplEditor.activeVariantId = active.id;
    }
    // tpl.sections を active の sections と同じ参照に
    if (active.sections !== tpl.sections) {
      tpl.sections = active.sections;
    }
  }

  // v1.7.37: tpl.sections への代入で variant との参照ずれが起きるのを防ぐヘルパー
  //   削除や追加で「新しい配列を作って tpl.sections に代入」すると、
  //   _ensureActiveVariant で variants[0].sections に上書き戻されて変更が消える事故があったため、
  //   このヘルパー経由で variants[0].sections と tpl.sections を同時更新する。
  function _setActiveSections(tpl, newSections) {
    if (!tpl) return;
    const arr = Array.isArray(newSections) ? newSections : [];
    let active = (tpl.variants || []).find(v => v && v.id === window._tplEditor.activeVariantId);
    if (!active) active = (tpl.variants || [])[0];
    if (active) active.sections = arr;
    tpl.sections = arr;
  }

  // v1.7.34: L2 では「今編集中のバリアント」をシンプルに表示するだけ。
  //   バリアントの追加・名前変更・削除・複製は L1（一覧）側に集約。
  function _renderVariantBar(tpl) {
    const variants = (tpl && tpl.variants) || [];
    const activeId = window._tplEditor.activeVariantId;
    const cur = variants.find(v => v && v.id === activeId) || variants[0];
    if (!cur) return '';
    const otherCount = variants.length - 1;
    const otherText = otherCount > 0 ? `（他に ${otherCount} 個のパターンあり）` : '';
    return `
      <div class="tpl-variant-bar tpl-variant-bar-simple">
        <span class="tpl-variant-label">📦 編集中のパターン：</span>
        <span class="tpl-variant-current-name">${_esc(cur.name || '(無題)')}</span>
        <span class="tpl-variant-other-count">${otherText}</span>
        <span style="margin-left:auto;font-size:11px;color:var(--text3)">パターンの追加・切替はテンプレ一覧から</span>
      </div>`;
  }

  async function switchTemplateVariant(tplId, variantId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    if (!Array.isArray(tpl.variants)) return;
    const v = tpl.variants.find(x => x && x.id === variantId);
    if (!v) return;
    window._tplEditor.activeVariantId = variantId;
    window._tplEditor.expandedSectionId = null; // 開いているセクションは閉じる
    _ensureActiveVariant(tpl);
    _renderDetail();
  }
  window.switchTemplateVariant = switchTemplateVariant;

  async function addTemplateVariant(tplId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const v = prompt('新しいタスクパターン名（例：A: フル / 中程度 / 簡易 / ミニバン用 など）', '');
    if (v == null) return;
    const name = v.trim();
    if (!name) { _toast('名前は必須です'); return; }
    const newId = 'va_' + Date.now().toString(36);
    if (!Array.isArray(tpl.variants)) tpl.variants = [];
    tpl.variants.push({ id: newId, name, sections: [] });
    window._tplEditor.activeVariantId = newId;
    window._tplEditor.expandedSectionId = null;
    _ensureActiveVariant(tpl);
    if (await _saveTpl(tpl)) {
      _toast('パターンを追加しました');
      _renderDetail();
    }
  }
  window.addTemplateVariant = addTemplateVariant;

  async function duplicateTemplateVariant(tplId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const cur = (tpl.variants || []).find(v => v.id === window._tplEditor.activeVariantId);
    if (!cur) return;
    const v = prompt('複製したパターンの新しい名前', `${cur.name} のコピー`);
    if (v == null) return;
    const name = v.trim();
    if (!name) { _toast('名前は必須です'); return; }
    // ディープコピー（item.id は維持＝同じ車両データを共有したい時のため）
    const cloned = {
      id: 'va_' + Date.now().toString(36),
      name,
      sections: JSON.parse(JSON.stringify(cur.sections || [])),
    };
    tpl.variants.push(cloned);
    window._tplEditor.activeVariantId = cloned.id;
    window._tplEditor.expandedSectionId = null;
    _ensureActiveVariant(tpl);
    if (await _saveTpl(tpl)) {
      _toast('パターンを複製しました');
      _renderDetail();
    }
  }
  window.duplicateTemplateVariant = duplicateTemplateVariant;

  async function renameTemplateVariant(tplId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const cur = (tpl.variants || []).find(v => v.id === window._tplEditor.activeVariantId);
    if (!cur) return;
    const v = prompt('タスクパターン名', cur.name || '');
    if (v == null) return;
    const name = v.trim();
    if (!name) { _toast('名前は必須です'); return; }
    cur.name = name;
    if (await _saveTpl(tpl)) {
      _toast('パターン名を更新しました');
      _renderDetail();
    }
  }
  window.renameTemplateVariant = renameTemplateVariant;

  async function deleteTemplateVariant(tplId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    if (!Array.isArray(tpl.variants) || tpl.variants.length <= 1) {
      _toast('パターンは最低1つ必要です');
      return;
    }
    const cur = tpl.variants.find(v => v.id === window._tplEditor.activeVariantId);
    if (!cur) return;
    const itemCount = (cur.sections || []).reduce((a, s) => a + (s.items || []).length, 0);
    const msg = itemCount > 0
      ? `パターン「${cur.name}」を削除しますか？\n中の ${itemCount} 個の小タスク設定も全部消えます。\n（このパターンを使っている車のデータには影響しません）`
      : `パターン「${cur.name}」を削除しますか？`;
    if (!confirm(msg)) return;
    tpl.variants = tpl.variants.filter(v => v.id !== cur.id);
    window._tplEditor.activeVariantId = tpl.variants[0].id;
    window._tplEditor.expandedSectionId = null;
    _ensureActiveVariant(tpl);
    if (await _saveTpl(tpl)) {
      _toast('パターンを削除しました');
      _renderDetail();
    }
  }
  window.deleteTemplateVariant = deleteTemplateVariant;

  // -----------------------------------------
  // v1.7.37: デフォルトに戻す（3レベル：全体／タスクごと／パターンごと）
  // -----------------------------------------

  // 全テンプレを built-in 初期状態に戻す
  async function resetAllTemplatesToDefault() {
    if (!_can()) { _toast('管理者権限が必要です'); return; }
    if (!confirm('⚠️ 全タスクの中身を初期状態に戻します。\n各タスクで追加したパターン・カスタム編集はすべて消えます。\n本当に実行しますか？')) return;
    if (!confirm('もう一度確認します。\nこの操作は元に戻せません。\n本当に全タスクをデフォルトに戻しますか？')) return;
    if (typeof window.rebuildAllBuiltinTemplates !== 'function') return;
    const list = window.rebuildAllBuiltinTemplates();
    let saved = 0;
    for (const { id, tpl } of list) {
      // メモリの ChecklistTemplates も置き換え
      if (typeof ChecklistTemplates !== 'undefined') ChecklistTemplates[id] = tpl;
      try {
        if (window.dbTemplates && window.dbTemplates.saveTemplate) {
          await window.dbTemplates.saveTemplate(tpl);
          saved++;
        }
      } catch (e) { console.error('[reset-all]', id, e); }
    }
    _toast(`✅ ${saved} 件のタスクを初期状態に戻しました`);
    if (window._tplEditor) {
      window._tplEditor.view = 'list';
      window._tplEditor.activeTplId = null;
      window._tplEditor.activeVariantId = null;
      window._tplEditor.expandedSectionId = null;
    }
    if (typeof renderTemplateEditor === 'function') renderTemplateEditor();
    if (typeof renderTasksEditor === 'function') renderTasksEditor();
  }
  window.resetAllTemplatesToDefault = resetAllTemplatesToDefault;

  // 1つのテンプレを built-in 初期状態に戻す
  async function resetTemplateToDefault(tplId) {
    if (!_can()) { _toast('管理者権限が必要です'); return; }
    const tpl = _getTpl(tplId); if (!tpl) return;
    if (typeof window.rebuildBuiltinTemplate !== 'function') return;
    const fresh = window.rebuildBuiltinTemplate(tplId);
    if (!fresh) {
      _toast('このタスクは初期データを持たないため戻せません（カスタムタスク）');
      return;
    }
    if (!confirm(`⚠️「${tpl.name}」を初期状態に戻します。\nこのタスクで追加したパターン・カスタム編集はすべて消えます。\n本当に実行しますか？`)) return;
    // メモリ置換
    if (typeof ChecklistTemplates !== 'undefined') ChecklistTemplates[tplId] = fresh;
    try {
      if (window.dbTemplates && window.dbTemplates.saveTemplate) {
        await window.dbTemplates.saveTemplate(fresh);
      }
      _toast(`✅「${fresh.name}」を初期状態に戻しました`);
      window._tplEditor.activeVariantId = (fresh.variants && fresh.variants[0]) ? fresh.variants[0].id : null;
      window._tplEditor.expandedSectionId = null;
      _renderDetail();
    } catch (e) {
      console.error('[reset-template]', e);
      _toast('リセットの保存に失敗しました');
    }
  }
  window.resetTemplateToDefault = resetTemplateToDefault;

  // 1つのパターン（variant）の中身を、初期状態のデフォルトパターンの内容で上書き
  async function resetVariantToDefault(tplId, variantId) {
    if (!_can()) { _toast('管理者権限が必要です'); return; }
    const tpl = _getTpl(tplId); if (!tpl) return;
    const cur = (tpl.variants || []).find(v => v.id === variantId);
    if (!cur) return;
    if (typeof window.rebuildBuiltinTemplate !== 'function') return;
    const fresh = window.rebuildBuiltinTemplate(tplId);
    if (!fresh) {
      _toast('このタスクは初期データを持たないため、パターンも戻せません（カスタムタスク）');
      return;
    }
    const freshDefault = (fresh.variants && fresh.variants[0]) ? fresh.variants[0] : null;
    if (!freshDefault) return;
    if (!confirm(`⚠️ パターン「${cur.name}」の中身を、初期状態のデフォルト内容で上書きします。\nこのパターンの今の中身は全部消えます。\n（パターン名「${cur.name}」は維持されます）\n本当に実行しますか？`)) return;
    // 中身（sections）だけ差し替え。name と id は維持。
    cur.sections = JSON.parse(JSON.stringify(freshDefault.sections || []));
    // active なら tpl.sections も同期
    if (window._tplEditor.activeVariantId === variantId) {
      _setActiveSections(tpl, cur.sections);
    }
    if (await _saveTpl(tpl)) {
      _toast(`✅ パターン「${cur.name}」を初期状態に戻しました`);
      window._tplEditor.expandedSectionId = null;
      // L1 か L2 か、現在の view に応じて再描画
      if (window._tplEditor.view === 'detail') _renderDetail();
      else _renderList();
    }
  }
  window.resetVariantToDefault = resetVariantToDefault;

  // -----------------------------------------
  // v1.7.34: L1（一覧）から呼ばれる variantId 指定版の操作
  // -----------------------------------------
  async function addTemplateVariantById(tplId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const v = prompt('新しいタスクパターン名（例：A: フル / 中程度 / 簡易 / ミニバン用 など）', '');
    if (v == null) return;
    const name = v.trim();
    if (!name) { _toast('名前は必須です'); return; }
    if (!Array.isArray(tpl.variants)) tpl.variants = [];
    const newId = 'va_' + Date.now().toString(36);
    tpl.variants.push({ id: newId, name, sections: [] });
    if (await _saveTpl(tpl)) {
      _toast('パターンを追加しました');
      _renderList();
    }
  }
  window.addTemplateVariantById = addTemplateVariantById;

  async function duplicateTemplateVariantById(tplId, variantId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const cur = (tpl.variants || []).find(v => v.id === variantId);
    if (!cur) return;
    const v = prompt('複製したパターンの新しい名前', `${cur.name} のコピー`);
    if (v == null) return;
    const name = v.trim();
    if (!name) { _toast('名前は必須です'); return; }
    const cloned = {
      id: 'va_' + Date.now().toString(36),
      name,
      sections: JSON.parse(JSON.stringify(cur.sections || [])),
    };
    tpl.variants.push(cloned);
    if (await _saveTpl(tpl)) {
      _toast('パターンを複製しました');
      _renderList();
    }
  }
  window.duplicateTemplateVariantById = duplicateTemplateVariantById;

  async function renameTemplateVariantById(tplId, variantId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const cur = (tpl.variants || []).find(v => v.id === variantId);
    if (!cur) return;
    const v = prompt('タスクパターン名', cur.name || '');
    if (v == null) return;
    const name = v.trim();
    if (!name) { _toast('名前は必須です'); return; }
    cur.name = name;
    if (await _saveTpl(tpl)) {
      _toast('パターン名を更新しました');
      _renderList();
    }
  }
  window.renameTemplateVariantById = renameTemplateVariantById;

  async function deleteTemplateVariantById(tplId, variantId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    if (!Array.isArray(tpl.variants) || tpl.variants.length <= 1) {
      _toast('パターンは最低1つ必要です');
      return;
    }
    const cur = tpl.variants.find(v => v.id === variantId);
    if (!cur) return;
    const itemCount = (cur.sections || []).reduce((a, s) => a + (s.items || []).length, 0);
    const msg = itemCount > 0
      ? `パターン「${cur.name}」を削除しますか？\n中の ${itemCount} 個の小タスク設定も全部消えます。\n（このパターンを使っている車のデータには影響しません）`
      : `パターン「${cur.name}」を削除しますか？`;
    if (!confirm(msg)) return;
    tpl.variants = tpl.variants.filter(v => v.id !== variantId);
    if (await _saveTpl(tpl)) {
      _toast('パターンを削除しました');
      _renderList();
    }
  }
  window.deleteTemplateVariantById = deleteTemplateVariantById;

  // -----------------------------------------
  // L2: 1テンプレの中身
  // -----------------------------------------
  function _renderDetail() {
    const root = document.getElementById('tpl-editor-body');
    if (!root) return;
    const tpl = _getTpl(window._tplEditor.activeTplId);
    if (!tpl) { backToTemplateList(); return; }

    // v1.7.33: バリアントのアクティブ化＋ tpl.sections を同期
    _ensureActiveVariant(tpl);
    const variantBarHtml = _renderVariantBar(tpl);

    // v1.7.20: 大カテゴリ（tab）でグループ化して入れ子の枠で表示
    const groups = _buildTabGroups(tpl);
    const tabBlocksHtml = groups.map(g => _renderTabBlock(tpl, g)).join('');

    // v1.6.1: 戻り先によってラベル変更
    // v1.7.34: テンプレ一覧（L1）への導線も常に出すように変更
    const variants = (tpl && tpl.variants) || [];
    const cur = variants.find(v => v && v.id === window._tplEditor.activeVariantId) || variants[0];
    const variantName = cur ? (cur.name || '(無題)') : '';
    const settingsLink = (window._tplEditor.backTo === 'settings')
      ? `<a class="tpl-bc-link" onclick="backToTaskSettings()">← タスク・進捗</a><span class="tpl-bc-sep">/</span>`
      : '';
    root.innerHTML = `
      <div class="tpl-breadcrumb">
        ${settingsLink}
        <a class="tpl-bc-link" onclick="backToTemplateList()">📋 タスクパターン一覧</a>
        <span class="tpl-bc-sep">/</span>
        <span class="tpl-bc-current">${_esc(tpl.icon || '')} ${_esc(tpl.name || '(無題)')}</span>
        ${variantName ? `<span class="tpl-bc-sep">/</span><span class="tpl-bc-variant">📦 ${_esc(variantName)}</span>` : ''}
      </div>

      ${variantBarHtml}

      <div class="tpl-detail-toolbar">
        <!-- v1.6.2: テンプレ名はタスク一覧側で扱うので削除。代わりにプレビュー / インポート/エクスポートを追加 -->
        <!-- v1.7.19: 表示スタイルボタンは廃止（中身の構造で自動決定） -->
        <!-- v1.7.20: 「+ セクション追加」は廃止し、大→中→小それぞれの追加ボタンに分離 -->
        <button class="btn-sm" onclick="previewTemplate('${_esc(tpl.id)}')" title="作業画面に近い形でプレビュー">👁 プレビュー</button>
        ${(tpl.sourceType === 'worksheet' || tpl.sourceType === 'equipment')
          ? `<button class="btn-sm" onclick="resetTemplateToDefault('${_esc(tpl.id)}')" title="このタスク全体を初期状態に戻す（追加パターン含めて消えます）">↺ このタスクを初期化</button>
             <button class="btn-sm" onclick="resetVariantToDefault('${_esc(tpl.id)}', '${_esc(window._tplEditor.activeVariantId || '')}')" title="今編集中のパターンの中身を初期状態に戻す">↺ このパターンを初期化</button>`
          : ''}
        <span class="tpl-toolbar-spacer"></span>
        <!-- v1.6.2: Excel 連携（既存テンプレの構造をそのまま編集してから取込み） -->
        <button class="btn-sm" onclick="exportTemplateXlsx('${_esc(tpl.id)}')" title="現在の項目を Excel にダウンロード">⬇ Excel書き出し</button>
        <label class="btn-sm tpl-import-label" title="Excel から項目を一括取込（既存項目は置き換え）">⬆ Excel取込
          <input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="importTemplateXlsx('${_esc(tpl.id)}', this.files[0]); this.value=''">
        </label>
        <!-- v1.7.14: 書式テンプレ DL（列の説明＋記入例つき空ファイル） -->
        <button class="btn-sm" onclick="downloadTemplateBlank()" title="記入例と列の説明が入った空のテンプレを書き出す">📋 書式テンプレDL</button>
      </div>

      <div class="tpl-tab-blocks">${tabBlocksHtml || '<div class="tpl-empty">まだ何もありません。下の「+ 大カテゴリ追加」から始めてください。</div>'}</div>
      <div class="tpl-add-tab-row">
        <button class="btn-sm btn-primary" onclick="addTemplateTab('${_esc(tpl.id)}')">+ 大カテゴリ追加</button>
      </div>
    `;
  }

  // v1.7.20: tpl.sections を「大カテゴリ（tab）」でグループ化（出現順）。
  function _buildTabGroups(tpl) {
    const sections = tpl.sections || [];
    const order = [];
    const map = new Map();
    sections.forEach((sec, originalIdx) => {
      const k = sec.tab || '';
      if (!map.has(k)) {
        map.set(k, { tab: k, sections: [] });
        order.push(k);
      }
      map.get(k).sections.push({ sec, idx: originalIdx });
    });
    return order.map(k => map.get(k));
  }

  // v1.7.20: 大カテゴリ1つぶんの「大枠」を描画。中に中カテゴリ枠を並べる。
  function _renderTabBlock(tpl, grp) {
    const tabName = grp.tab || '';
    const tabDisplay = tabName ? _esc(tabName) : '<span class="tpl-tab-empty">(タブなし)</span>';
    const innerHtml = grp.sections.map(({ sec, idx }, posInTab) => {
      const isFirstInTab = posInTab === 0;
      const isLastInTab  = posInTab === grp.sections.length - 1;
      return _renderSectionBlock(tpl, sec, idx, isFirstInTab, isLastInTab);
    }).join('');
    const tabKey = _esc(tabName);
    return `
      <div class="tpl-tab-block" data-tab="${tabKey}">
        <div class="tpl-tab-block-head">
          <span class="tpl-tab-block-icon">📑</span>
          <span class="tpl-tab-block-name">${tabDisplay}</span>
          <button class="btn-sm" onclick="renameTemplateTab('${_esc(tpl.id)}', '${tabKey}')">✏️ 名前変更</button>
          <button class="btn-sm btn-danger" onclick="deleteTemplateTab('${_esc(tpl.id)}', '${tabKey}')">🗑 削除</button>
        </div>
        <div class="tpl-tab-block-body">
          ${innerHtml}
          <div class="tpl-add-section-row">
            <button class="btn-sm" onclick="addTemplateSectionInTab('${_esc(tpl.id)}', '${tabKey}')">+ 中カテゴリ追加</button>
          </div>
        </div>
      </div>`;
  }

  // v1.7.20: 中カテゴリ1つぶんの「中枠」を描画。中に小タスクを並べる。
  function _renderSectionBlock(tpl, sec, idx, isFirstInTab, isLastInTab) {
    const isOpen = window._tplEditor.expandedSectionId === sec.id;
    const itemCount = (sec.items || []).length;
    const enabledCount = (sec.items || []).filter(i => !i._disabled).length;
    const itemsHtml = isOpen
      ? (sec.items || []).map((it, i) => _renderItem(tpl, sec, it, i)).join('')
      : '';
    const titleDisplay = sec.title && sec.title.trim()
      ? _esc(sec.title)
      : '<span class="tpl-section-title-empty">(中カテゴリ名なし／フラット)</span>';

    // v1.7.21: 小タスクのドラッグ移動 — section-block 全体をドロップ先にする
    return `
      <div class="tpl-section-block ${isOpen ? 'is-open' : ''}"
           data-section-id="${_esc(sec.id)}"
           data-tpl-id="${_esc(tpl.id)}"
           ondragover="tplSectionDragOver(this, event)"
           ondragleave="tplSectionDragLeave(this, event)"
           ondrop="tplSectionDrop(this, event)">
        <div class="tpl-section-block-head" onclick="toggleTemplateSection('${_esc(tpl.id)}', '${_esc(sec.id)}')">
          <div class="tpl-section-arrows">
            <button class="tpl-arrow" onclick="event.stopPropagation();moveTemplateSectionInTab('${_esc(tpl.id)}', '${_esc(sec.id)}', -1)" ${isFirstInTab ? 'disabled' : ''}>▲</button>
            <button class="tpl-arrow" onclick="event.stopPropagation();moveTemplateSectionInTab('${_esc(tpl.id)}', '${_esc(sec.id)}', 1)" ${isLastInTab ? 'disabled' : ''}>▼</button>
          </div>
          <span class="tpl-section-block-name">${titleDisplay}</span>
          <span class="tpl-section-count">${enabledCount}/${itemCount}項目</span>
          <span class="tpl-section-toggle">${isOpen ? '▲' : '▼'}</span>
        </div>
        ${isOpen ? `
          <div class="tpl-section-toolbar">
            <button class="btn-sm" onclick="renameTemplateSection('${_esc(tpl.id)}', '${_esc(sec.id)}')">✏️ 中カテゴリ名</button>
            <button class="btn-sm btn-primary" onclick="addTemplateItem('${_esc(tpl.id)}', '${_esc(sec.id)}')">+ 小タスク追加</button>
            <button class="btn-sm btn-danger" onclick="deleteTemplateSection('${_esc(tpl.id)}', '${_esc(sec.id)}')">🗑 中カテゴリ削除</button>
          </div>
          <div class="tpl-items">${itemsHtml || '<div class="tpl-empty">小タスクがありません。「+ 小タスク追加」から作成してください。<br><span class="tpl-drop-hint">他の中カテゴリからドラッグして持ってくることもできます</span></div>'}</div>
        ` : ''}
      </div>
    `;
  }

  function _renderItem(tpl, sec, item, idx) {
    const disabled = !!item._disabled;
    const inputType = item.inputType || 'check';
    const itemTypeLabel = { check: 'チェック', select: '選択', status: '3状態', tri: '3状態', text: 'テキスト' };
    // v1.7.21: ドラッグ可能。data-* に必要な情報を持たせて、ハンドラから読み取る。
    return `
      <div class="tpl-item ${disabled ? 'is-disabled' : ''}"
           data-item-id="${_esc(item.id)}"
           data-section-id="${_esc(sec.id)}"
           data-tpl-id="${_esc(tpl.id)}"
           draggable="true"
           ondragstart="tplItemDragStart(this, event)"
           ondragend="tplItemDragEnd(this, event)">
        <div class="tpl-item-handle" title="ドラッグして移動">⋮⋮</div>
        <div class="tpl-item-arrows">
          <button class="tpl-arrow" onclick="moveTemplateItem('${_esc(tpl.id)}', '${_esc(sec.id)}', ${idx}, -1)" ${idx === 0 ? 'disabled' : ''}>▲</button>
          <button class="tpl-arrow" onclick="moveTemplateItem('${_esc(tpl.id)}', '${_esc(sec.id)}', ${idx}, 1)" ${idx === (sec.items || []).length - 1 ? 'disabled' : ''}>▼</button>
        </div>
        <div class="tpl-item-id">${_esc(item.id)}</div>
        <div class="tpl-item-body">
          <div class="tpl-item-name">${_esc(item.name || '(無題)')}</div>
          ${item.sub ? `<div class="tpl-item-sub">${_esc(item.sub)}</div>` : ''}
        </div>
        <div class="tpl-item-meta">
          <span class="tpl-item-type">${_esc(itemTypeLabel[inputType] || inputType)}</span>
          ${disabled ? '<span class="tpl-item-disabled">無効</span>' : ''}
        </div>
        <div class="tpl-item-actions">
          <button class="btn-sm" onclick="openTemplateItemEditor('${_esc(tpl.id)}', '${_esc(sec.id)}', '${_esc(item.id)}')">✏️ 編集</button>
          <button class="btn-sm" onclick="toggleTemplateItemDisabled('${_esc(tpl.id)}', '${_esc(sec.id)}', '${_esc(item.id)}')">${disabled ? '✅ 有効化' : '🚫 無効化'}</button>
        </div>
      </div>
    `;
  }

  // -----------------------------------------
  // L2 操作: テンプレ・セクション
  // -----------------------------------------
  function toggleTemplateSection(tplId, secId) {
    if (window._tplEditor.expandedSectionId === secId) {
      window._tplEditor.expandedSectionId = null;
    } else {
      window._tplEditor.expandedSectionId = secId;
    }
    _renderDetail();
  }
  window.toggleTemplateSection = toggleTemplateSection;

  async function renameTemplate(tplId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const v = prompt('テンプレート名', tpl.name || '');
    if (v == null) return;
    const trimmed = v.trim();
    if (!trimmed) { _toast('名前は必須です'); return; }
    tpl.name = trimmed;
    if (await _saveTpl(tpl)) { _toast('テンプレ名を更新しました'); _renderDetail(); }
  }
  window.renameTemplate = renameTemplate;

  // v1.7.19: changeTemplateNavStyle は廃止（表示スタイル選択は廃止）。
  //          代わりに、各セクションの「大カテゴリ名」を編集する関数を追加。
  async function renameTemplateSectionTab(tplId, secId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const sec = (tpl.sections || []).find(s => s.id === secId);
    if (!sec) return;
    const v = prompt('大カテゴリ名（タブの見出しになります。空欄ならタブなし）', sec.tab || '');
    if (v == null) return;
    sec.tab = v.trim();
    if (await _saveTpl(tpl)) { _toast('大カテゴリ名を更新しました'); _renderDetail(); }
  }
  window.renameTemplateSectionTab = renameTemplateSectionTab;

  // v1.7.20: 大カテゴリ追加。新しいタブと、その中に最初の中カテゴリ枠（フラット）を作る。
  async function addTemplateTab(tplId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const existingTabs = Array.from(new Set((tpl.sections || [])
      .map(s => (s.tab || '').trim()).filter(t => t)));
    const v = prompt('大カテゴリ名（タブの見出し）', '');
    if (v == null) return;
    const tabName = v.trim();
    if (!tabName) { _toast('大カテゴリ名は必須です'); return; }
    if (existingTabs.includes(tabName)) {
      _toast('同じ名前の大カテゴリが既にあります'); return;
    }
    if (!Array.isArray(tpl.sections)) tpl.sections = [];
    // 大カテゴリだけ作る → 中身は空のフラット枠を1つ用意して、続けて中カテゴリや小タスクを足せる導線にする
    const newSec = {
      id: _newId('sec'),
      title: '',
      tab: tabName,
      icon: '',
      items: [],
    };
    tpl.sections.push(newSec);
    if (await _saveTpl(tpl)) {
      _toast('大カテゴリを追加しました');
      window._tplEditor.expandedSectionId = newSec.id;
      _renderDetail();
    }
  }
  window.addTemplateTab = addTemplateTab;

  // v1.7.20: 指定された大カテゴリの中に新しい中カテゴリ枠を追加
  async function addTemplateSectionInTab(tplId, tabName) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const v = prompt('中カテゴリ名（空欄ならフラット表示）', '');
    if (v == null) return;
    if (!Array.isArray(tpl.sections)) tpl.sections = [];
    // 同じ大カテゴリの最後のセクション位置を求めて、その直後に挿入する
    let lastIdx = -1;
    tpl.sections.forEach((s, i) => {
      if ((s.tab || '') === tabName) lastIdx = i;
    });
    const newSec = {
      id: _newId('sec'),
      title: v.trim(),
      tab: tabName,
      icon: '',
      items: [],
    };
    if (lastIdx >= 0) tpl.sections.splice(lastIdx + 1, 0, newSec);
    else tpl.sections.push(newSec);
    if (await _saveTpl(tpl)) {
      _toast('中カテゴリを追加しました');
      window._tplEditor.expandedSectionId = newSec.id;
      _renderDetail();
    }
  }
  window.addTemplateSectionInTab = addTemplateSectionInTab;

  // v1.7.20: 大カテゴリ名を変更（同じ tab を持つ全セクションの tab を一括更新）
  async function renameTemplateTab(tplId, oldName) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const v = prompt('大カテゴリ名', oldName || '');
    if (v == null) return;
    const newName = v.trim();
    if (!newName) { _toast('大カテゴリ名は必須です'); return; }
    if (newName === oldName) return;
    const existing = Array.from(new Set((tpl.sections || []).map(s => s.tab || '')));
    if (existing.includes(newName)) {
      if (!confirm(`「${newName}」は既存の大カテゴリ名です。\n統合しますか？（このタブのセクションが既存タブの末尾に移動します）`)) return;
    }
    (tpl.sections || []).forEach(s => {
      if ((s.tab || '') === oldName) s.tab = newName;
    });
    if (await _saveTpl(tpl)) { _toast('大カテゴリ名を更新しました'); _renderDetail(); }
  }
  window.renameTemplateTab = renameTemplateTab;

  // v1.7.20: 大カテゴリを削除（中身のセクションも全部消える。確認あり）
  async function deleteTemplateTab(tplId, tabName) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const targetSecs = (tpl.sections || []).filter(s => (s.tab || '') === tabName);
    if (targetSecs.length === 0) return;
    const totalItems = targetSecs.reduce((a, s) => a + (s.items || []).length, 0);
    const label = tabName || '(タブなし)';
    if (!confirm(`大カテゴリ「${label}」を削除しますか？\n中の中カテゴリ ${targetSecs.length} 個・小タスク ${totalItems} 個も全部消えます。`)) return;
    // v1.7.37: variants[0] と tpl.sections を一緒に更新
    _setActiveSections(tpl, (tpl.sections || []).filter(s => (s.tab || '') !== tabName));
    if (await _saveTpl(tpl)) {
      _toast('大カテゴリを削除しました');
      window._tplEditor.expandedSectionId = null;
      _renderDetail();
    }
  }
  window.deleteTemplateTab = deleteTemplateTab;

  // -----------------------------------------
  // v1.7.21: 小タスクのドラッグ＆ドロップ移動
  //   - tpl-item の draggable=true
  //   - tpl-section-block 全体がドロップ先
  //   - 大カテゴリ枠を跨いでも移動できる
  //   - 状態は window._tplDragState に持つ（dataTransfer は Firefox/Safari で読みにくいケースがあるため）
  // -----------------------------------------
  function tplItemDragStart(itemEl, ev) {
    if (!itemEl) return;
    const data = {
      tplId: itemEl.dataset.tplId,
      fromSecId: itemEl.dataset.sectionId,
      itemId: itemEl.dataset.itemId,
    };
    window._tplDragState = data;
    if (ev && ev.dataTransfer) {
      try {
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', data.itemId || '');
      } catch (e) { /* ignore */ }
    }
    itemEl.classList.add('is-dragging');
  }
  window.tplItemDragStart = tplItemDragStart;

  function tplItemDragEnd(itemEl, ev) {
    if (itemEl) itemEl.classList.remove('is-dragging');
    document.querySelectorAll('.tpl-section-block.is-drop-target')
      .forEach(e => e.classList.remove('is-drop-target'));
    window._tplDragState = null;
  }
  window.tplItemDragEnd = tplItemDragEnd;

  function tplSectionDragOver(secEl, ev) {
    if (!window._tplDragState || !secEl) return;
    // 自分自身が現在の所属セクションでも、視覚フィードバックは出す（同じ枠内でのドラッグキャンセルが分かるように）
    if (ev) ev.preventDefault();
    if (ev && ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    // 既にハイライト中の他枠を解除して、この枠だけ強調
    document.querySelectorAll('.tpl-section-block.is-drop-target')
      .forEach(e => { if (e !== secEl) e.classList.remove('is-drop-target'); });
    secEl.classList.add('is-drop-target');
  }
  window.tplSectionDragOver = tplSectionDragOver;

  function tplSectionDragLeave(secEl, ev) {
    if (!secEl) return;
    // dragleave は子要素間移動でも発火するので、relatedTarget が枠内なら無視
    const rt = ev && ev.relatedTarget;
    if (rt && secEl.contains(rt)) return;
    secEl.classList.remove('is-drop-target');
  }
  window.tplSectionDragLeave = tplSectionDragLeave;

  async function tplSectionDrop(secEl, ev) {
    if (ev) ev.preventDefault();
    if (!secEl) return;
    secEl.classList.remove('is-drop-target');
    const data = window._tplDragState;
    window._tplDragState = null;
    if (!data) return;
    const toSecId = secEl.dataset.sectionId;
    if (!toSecId) return;
    if (data.fromSecId === toSecId) return; // 同じ枠内のドロップは無視（並び替えは▲▼で）
    const tpl = _getTpl(data.tplId); if (!tpl) return;
    const sections = tpl.sections || [];
    const fromSec = sections.find(s => s.id === data.fromSecId);
    const toSec   = sections.find(s => s.id === toSecId);
    if (!fromSec || !toSec) return;
    const itemIdx = (fromSec.items || []).findIndex(i => i.id === data.itemId);
    if (itemIdx < 0) return;
    const [moved] = fromSec.items.splice(itemIdx, 1);
    if (!Array.isArray(toSec.items)) toSec.items = [];
    toSec.items.push(moved);
    if (await _saveTpl(tpl)) {
      _toast('小タスクを移動しました');
      _renderDetail();
    }
  }
  window.tplSectionDrop = tplSectionDrop;

  // v1.7.20: 同じ大カテゴリ内でセクションの順序を入れ替える
  async function moveTemplateSectionInTab(tplId, secId, delta) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const sections = tpl.sections || [];
    const idx = sections.findIndex(s => s.id === secId);
    if (idx < 0) return;
    const tab = sections[idx].tab || '';
    let swapIdx = -1;
    if (delta < 0) {
      for (let i = idx - 1; i >= 0; i--) {
        if ((sections[i].tab || '') === tab) { swapIdx = i; break; }
      }
    } else {
      for (let i = idx + 1; i < sections.length; i++) {
        if ((sections[i].tab || '') === tab) { swapIdx = i; break; }
      }
    }
    if (swapIdx < 0) return;
    [sections[idx], sections[swapIdx]] = [sections[swapIdx], sections[idx]];
    if (await _saveTpl(tpl)) { _renderDetail(); }
  }
  window.moveTemplateSectionInTab = moveTemplateSectionInTab;

  // v1.7.19: セクション追加時に大カテゴリ・中カテゴリ両方を任意で入力できるように。
  // v1.7.20: 既存呼び出し互換のため残すが、UI からは呼ばれなくなる。
  async function addTemplateSection(tplId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const existingTabs = Array.from(new Set((tpl.sections || [])
      .map(s => (s.tab || '').trim()).filter(t => t)));
    const tabHint = existingTabs.length
      ? `（既存タブ：${existingTabs.join(' / ')}）` : '（空欄ならタブなし）';
    const tabIn = prompt('大カテゴリ名 ' + tabHint, existingTabs[0] || '');
    if (tabIn == null) return;
    const titleIn = prompt('中カテゴリ名（アコーディオン見出し。空欄ならフラット表示）', '');
    if (titleIn == null) return;
    if (!Array.isArray(tpl.sections)) tpl.sections = [];
    const newSec = {
      id: _newId('sec'),
      title: titleIn.trim(),
      tab: tabIn.trim(),
      icon: '',
      items: [],
    };
    tpl.sections.push(newSec);
    if (await _saveTpl(tpl)) {
      _toast('セクションを追加しました');
      window._tplEditor.expandedSectionId = newSec.id;
      _renderDetail();
    }
  }
  window.addTemplateSection = addTemplateSection;

  async function renameTemplateSection(tplId, secId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const sec = (tpl.sections || []).find(s => s.id === secId);
    if (!sec) return;
    const v = prompt('中カテゴリ名（アコーディオン見出し。空欄ならフラット表示）', sec.title || '');
    if (v == null) return;
    sec.title = v.trim();
    if (await _saveTpl(tpl)) { _toast('中カテゴリ名を更新しました'); _renderDetail(); }
  }
  window.renameTemplateSection = renameTemplateSection;

  async function deleteTemplateSection(tplId, secId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const sec = (tpl.sections || []).find(s => s.id === secId);
    if (!sec) return;
    const itemCount = (sec.items || []).length;
    if (itemCount > 0) {
      if (!confirm(`セクション「${sec.title}」には ${itemCount} 件の項目があります。\n本当に削除しますか？\n（過去の車両データに影響する可能性があります）`)) return;
    } else {
      if (!confirm(`セクション「${sec.title}」を削除しますか？`)) return;
    }
    // v1.7.37: variants[0] と tpl.sections を一緒に更新
    _setActiveSections(tpl, (tpl.sections || []).filter(s => s.id !== secId));
    if (await _saveTpl(tpl)) { _toast('セクションを削除しました'); window._tplEditor.expandedSectionId = null; _renderDetail(); }
  }
  window.deleteTemplateSection = deleteTemplateSection;

  async function moveTemplateSection(tplId, idx, delta) {
    const tpl = _getTpl(tplId); if (!tpl || !Array.isArray(tpl.sections)) return;
    const target = idx + delta;
    if (target < 0 || target >= tpl.sections.length) return;
    const arr = tpl.sections;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    if (await _saveTpl(tpl)) { _renderDetail(); }
  }
  window.moveTemplateSection = moveTemplateSection;

  // -----------------------------------------
  // L2 操作: 項目
  // -----------------------------------------
  async function addTemplateItem(tplId, secId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const sec = (tpl.sections || []).find(s => s.id === secId);
    if (!sec) return;
    const name = prompt('項目名', '');
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) { _toast('名前は必須です'); return; }
    if (!Array.isArray(sec.items)) sec.items = [];

    const idPrefix = (tpl.sourceType === 'equipment') ? 'eq' :
      (tpl.sourceType === 'worksheet' && tpl.sourcePhase === 'regen') ? 'r' :
      (tpl.sourceType === 'worksheet' && tpl.sourcePhase === 'delivery') ? 'd' : 'c';

    sec.items.push({
      id: _newId(idPrefix),
      name: trimmed,
      sub: '',
      detail: '',
      points: [],
      media: [],
      inputType: 'check',
      order: sec.items.length,
      _source: 'custom',
    });
    if (await _saveTpl(tpl)) { _toast('項目を追加しました'); _renderDetail(); }
  }
  window.addTemplateItem = addTemplateItem;

  async function moveTemplateItem(tplId, secId, idx, delta) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const sec = (tpl.sections || []).find(s => s.id === secId);
    if (!sec || !Array.isArray(sec.items)) return;
    const target = idx + delta;
    if (target < 0 || target >= sec.items.length) return;
    [sec.items[idx], sec.items[target]] = [sec.items[target], sec.items[idx]];
    if (await _saveTpl(tpl)) { _renderDetail(); }
  }
  window.moveTemplateItem = moveTemplateItem;

  async function toggleTemplateItemDisabled(tplId, secId, itemId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const sec = (tpl.sections || []).find(s => s.id === secId);
    if (!sec) return;
    const item = (sec.items || []).find(i => i.id === itemId);
    if (!item) return;
    item._disabled = !item._disabled;
    if (await _saveTpl(tpl)) {
      _toast(item._disabled ? '項目を無効化しました' : '項目を有効化しました');
      _renderDetail();
    }
  }
  window.toggleTemplateItemDisabled = toggleTemplateItemDisabled;

  // -----------------------------------------
  // L3: 項目編集モーダル
  // -----------------------------------------
  function openTemplateItemEditor(tplId, secId, itemId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const sec = (tpl.sections || []).find(s => s.id === secId);
    if (!sec) return;
    const item = (sec.items || []).find(i => i.id === itemId);
    if (!item) return;

    window._tplEditor.editingItem = { tplId, secId, itemId };

    const modal = document.getElementById('modal-tpl-item');
    if (!modal) {
      _toast('編集モーダルが見つかりません');
      return;
    }
    document.getElementById('tpl-item-id').textContent = item.id;
    document.getElementById('tpl-item-name').value = item.name || '';
    document.getElementById('tpl-item-sub').value = item.sub || '';
    document.getElementById('tpl-item-detail').value = item.detail || '';
    document.getElementById('tpl-item-points').value = (item.points || []).join('\n');
    document.getElementById('tpl-item-source').textContent = item._source || 'default';
    // v1.7.14: 入力タイプの初期値設定 + 選択肢欄の表示制御
    const itype = item.inputType || 'check';
    const sel = document.getElementById('tpl-item-input-type-sel');
    if (sel) sel.value = itype;
    const optsArea = document.getElementById('tpl-item-select-options');
    if (optsArea) optsArea.value = (Array.isArray(item.selectOptions) ? item.selectOptions : []).join('\n');
    const optsRow = document.getElementById('tpl-item-select-options-row');
    if (optsRow) optsRow.style.display = (itype === 'select') ? '' : 'none';

    // v1.7.12: media をワーキングコピーに載せて描画
    window._tplEditor.editingMedia = Array.isArray(item.media)
      ? item.media.map(m => Object.assign({}, m))
      : [];
    _renderTemplateItemMediaList();
    // 追加用入力をクリア
    const ytInp = document.getElementById('tpl-media-add-yt');
    const imgInp = document.getElementById('tpl-media-add-img');
    if (ytInp) ytInp.value = '';
    if (imgInp) imgInp.value = '';

    modal.classList.add('open');
  }
  window.openTemplateItemEditor = openTemplateItemEditor;

  function closeTemplateItemEditor() {
    const modal = document.getElementById('modal-tpl-item');
    if (modal) modal.classList.remove('open');
    window._tplEditor.editingItem = null;
    window._tplEditor.editingMedia = [];
  }
  window.closeTemplateItemEditor = closeTemplateItemEditor;

  // v1.7.14: 入力タイプ変更時に「選択肢」入力欄を出し入れ
  function onTemplateItemInputTypeChange(value) {
    const row = document.getElementById('tpl-item-select-options-row');
    if (row) row.style.display = (value === 'select') ? '' : 'none';
  }
  window.onTemplateItemInputTypeChange = onTemplateItemInputTypeChange;

  // -----------------------------------------
  // v1.7.12: media 編集ヘルパー
  // -----------------------------------------

  // YouTube URL or videoId から videoId を抽出
  function _extractYouTubeId(input) {
    if (!input) return null;
    const s = String(input).trim();
    if (!s) return null;
    // 11文字の英数字 _ - だけ → 既に videoId
    if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
    // youtu.be/ID
    let m = s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    // youtube.com/watch?v=ID
    m = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    // youtube.com/embed/ID または youtube.com/shorts/ID
    m = s.match(/youtube\.com\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    return null;
  }

  // 1件の media を表示するHTML
  function _renderMediaRow(m, idx) {
    const cap = _esc(m.caption || '');
    let preview = '';
    if (m.type === 'youtube' && m.videoId) {
      const thumb = `https://img.youtube.com/vi/${_esc(m.videoId)}/default.jpg`;
      preview = `
        <div class="tpl-media-thumb tpl-media-thumb-yt" style="background-image:url('${thumb}')">
          <span class="tpl-media-yt-badge">YT</span>
        </div>
        <div class="tpl-media-meta">
          <span class="tpl-media-type">YouTube</span>
          <span class="tpl-media-id">${_esc(m.videoId)}</span>
        </div>`;
    } else if (m.type === 'image' && m.url) {
      const safeUrl = String(m.url).replace(/'/g, "\\'");
      preview = `
        <div class="tpl-media-thumb" style="background-image:url('${safeUrl}')"></div>
        <div class="tpl-media-meta">
          <span class="tpl-media-type">画像</span>
          <span class="tpl-media-id">${_esc(String(m.url).slice(0, 40))}…</span>
        </div>`;
    } else {
      preview = `<div class="tpl-media-thumb tpl-media-thumb-broken">？</div>
        <div class="tpl-media-meta"><span class="tpl-media-type">不明</span></div>`;
    }
    return `
      <div class="tpl-media-row" data-idx="${idx}">
        ${preview}
        <input type="text" class="tpl-media-caption-inp" value="${cap}"
               placeholder="キャプション（任意）"
               oninput="updateTemplateItemMediaCaption(${idx}, this.value)">
        <button class="tpl-media-del-btn" onclick="removeTemplateItemMedia(${idx})" title="削除">🗑</button>
      </div>`;
  }

  function _renderTemplateItemMediaList() {
    const wrap = document.getElementById('tpl-item-media-list');
    if (!wrap) return;
    const list = window._tplEditor.editingMedia || [];
    if (list.length === 0) {
      wrap.innerHTML = '<div class="tpl-media-empty">写真・動画は未登録</div>';
      return;
    }
    wrap.innerHTML = list.map((m, i) => _renderMediaRow(m, i)).join('');
  }

  function addTemplateItemMediaYoutube() {
    const inp = document.getElementById('tpl-media-add-yt');
    if (!inp) return;
    const raw = inp.value;
    const vid = _extractYouTubeId(raw);
    if (!vid) {
      _toast('YouTube URL か videoId を入力してください');
      return;
    }
    window._tplEditor.editingMedia.push({ type: 'youtube', videoId: vid, caption: '' });
    inp.value = '';
    _renderTemplateItemMediaList();
  }
  window.addTemplateItemMediaYoutube = addTemplateItemMediaYoutube;

  function addTemplateItemMediaImage() {
    const inp = document.getElementById('tpl-media-add-img');
    if (!inp) return;
    const url = (inp.value || '').trim();
    if (!url) {
      _toast('画像URLを入力してください');
      return;
    }
    if (!/^https?:\/\//i.test(url) && !url.startsWith('data:image/')) {
      _toast('http(s):// で始まるURL、または data:image/... を入力してください');
      return;
    }
    window._tplEditor.editingMedia.push({ type: 'image', url, caption: '' });
    inp.value = '';
    _renderTemplateItemMediaList();
  }
  window.addTemplateItemMediaImage = addTemplateItemMediaImage;

  // v1.7.14: 端末から画像ファイルを選んで Storage にアップ → 完了したら URL を media に追加
  async function addTemplateItemMediaFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) {
      _toast('画像ファイルを選んでください');
      return;
    }
    if (!window.dbStorage || typeof window.dbStorage.uploadChecklistMedia !== 'function') {
      _toast('画像アップロード機能が初期化されていません');
      return;
    }
    const ctx = window._tplEditor.editingItem;
    if (!ctx) return;
    const hint = document.getElementById('tpl-media-upload-hint');
    if (hint) hint.textContent = `アップロード中... (${Math.round(file.size / 1024)}KB)`;
    try {
      const url = await window.dbStorage.uploadChecklistMedia(ctx.tplId, ctx.itemId, file);
      if (!url) throw new Error('upload returned null');
      window._tplEditor.editingMedia.push({ type: 'image', url, caption: '' });
      _renderTemplateItemMediaList();
      if (hint) hint.textContent = '✓ アップロード完了';
      setTimeout(() => { if (hint) hint.textContent = ''; }, 2000);
    } catch (err) {
      console.error('[addTemplateItemMediaFile]', err);
      _toast('アップロードに失敗しました');
      if (hint) hint.textContent = '✕ 失敗';
      setTimeout(() => { if (hint) hint.textContent = ''; }, 3000);
    }
  }
  window.addTemplateItemMediaFile = addTemplateItemMediaFile;

  function removeTemplateItemMedia(idx) {
    const list = window._tplEditor.editingMedia || [];
    if (idx < 0 || idx >= list.length) return;
    list.splice(idx, 1);
    _renderTemplateItemMediaList();
  }
  window.removeTemplateItemMedia = removeTemplateItemMedia;

  function updateTemplateItemMediaCaption(idx, value) {
    const list = window._tplEditor.editingMedia || [];
    if (idx < 0 || idx >= list.length) return;
    list[idx].caption = value || '';
    // 入力中なので再描画はしない（フォーカス維持のため）。値だけ更新。
  }
  window.updateTemplateItemMediaCaption = updateTemplateItemMediaCaption;

  async function saveTemplateItem() {
    const ctx = window._tplEditor.editingItem;
    if (!ctx) return;
    const tpl = _getTpl(ctx.tplId); if (!tpl) return;
    const sec = (tpl.sections || []).find(s => s.id === ctx.secId);
    if (!sec) return;
    const item = (sec.items || []).find(i => i.id === ctx.itemId);
    if (!item) return;

    const name = (document.getElementById('tpl-item-name').value || '').trim();
    if (!name) { _toast('名前は必須です'); return; }

    item.name = name;
    item.sub = (document.getElementById('tpl-item-sub').value || '').trim();
    item.detail = (document.getElementById('tpl-item-detail').value || '').trim();
    item.points = (document.getElementById('tpl-item-points').value || '')
      .split('\n').map(s => s.trim()).filter(Boolean);

    // v1.7.14: 入力タイプ + 選択肢を保存
    const sel = document.getElementById('tpl-item-input-type-sel');
    const itype = sel ? sel.value : 'check';
    item.inputType = ['check', 'tri', 'status', 'select', 'text'].includes(itype) ? itype : 'check';
    if (item.inputType === 'select') {
      item.selectOptions = (document.getElementById('tpl-item-select-options').value || '')
        .split('\n').map(s => s.trim()).filter(Boolean);
    } else {
      // select 以外は selectOptions 不要なので保存しない（既存があれば維持）
      // → 用途が変わるたびに消えると不便なので、そのまま保持する
    }

    // v1.7.12: media を確定保存（ワーキングコピーから item.media へ反映）
    const editing = (window._tplEditor && window._tplEditor.editingMedia) || [];
    item.media = editing.map(m => {
      const o = { type: m.type };
      if (m.type === 'youtube') {
        if (m.videoId) o.videoId = m.videoId;
        if (typeof m.durationSec === 'number') o.durationSec = m.durationSec;
        if (typeof m.startSec === 'number') o.startSec = m.startSec;
      } else if (m.type === 'image' || m.type === 'video') {
        if (m.url) o.url = m.url;
      }
      if (m.caption) o.caption = String(m.caption).trim();
      return o;
    }).filter(m => (m.type === 'youtube' && m.videoId) || ((m.type === 'image' || m.type === 'video') && m.url));

    if (await _saveTpl(tpl)) {
      _toast('項目を更新しました');
      closeTemplateItemEditor();
      _renderDetail();
    }
  }
  window.saveTemplateItem = saveTemplateItem;

  // =========================================
  // v1.6.2: プレビュー
  //   作業画面に近い形でテンプレを確認するモーダル
  // =========================================
  function previewTemplate(tplId) {
    const tpl = _getTpl(tplId); if (!tpl) return;
    const modal = document.getElementById('modal-tpl-preview');
    if (!modal) { _toast('プレビューモーダルが見つかりません'); return; }

    const title = (tpl.icon || '📋') + ' ' + (tpl.name || '');
    document.getElementById('tpl-preview-title').textContent = title;
    // v1.7.19: 表示メタ情報（大カテゴリ数を追加。表示スタイルは廃止）
    const tabSet = new Set();
    (tpl.sections || []).forEach(s => { tabSet.add(s.tab || ''); });
    document.getElementById('tpl-preview-meta').textContent =
      `${(tpl.sections || []).length} セクション / ${(tpl.sections || []).reduce((a, s) => a + (s.items || []).filter(i => !i._disabled).length, 0)} 有効項目 / 大カテゴリ ${tabSet.size}`;

    const body = document.getElementById('tpl-preview-body');

    // v1.7.19: プレビューも本番レンダラーと同じルールで表示
    //   - 大カテゴリ（tab）でグループ化
    //   - 大カテゴリ 2 種類以上 → タブ風の見出し
    //   - 中カテゴリ（title）あり → アコーディオン風帯
    //   - 中カテゴリ（title）なし → 帯なしフラット
    let html = '';
    if (!tpl.sections || tpl.sections.length === 0) {
      html = '<div class="tpl-preview-empty">セクションがありません</div>';
    } else {
      // tab でグループ化
      const tabOrder = [];
      const tabMap = new Map();
      tpl.sections.forEach(sec => {
        const k = sec.tab || '';
        if (!tabMap.has(k)) {
          tabMap.set(k, []);
          tabOrder.push(k);
        }
        tabMap.get(k).push(sec);
      });
      const showTabs = tabOrder.length > 1;

      const renderSecHtml = (sec, sIdx) => {
        const items = (sec.items || []);
        const hasTitle = !!(sec.title && sec.title.trim());
        const head = hasTitle ? `
          <div class="tpl-preview-section-head">
            <span class="tpl-preview-section-num">${String(sIdx + 1).padStart(2, '0')}</span>
            <span class="tpl-preview-section-icon">${_esc(sec.icon || '📂')}</span>
            <span class="tpl-preview-section-title">${_esc(sec.title)}</span>
            <span class="tpl-preview-section-count">${items.filter(i => !i._disabled).length}/${items.length}</span>
          </div>` : '';
        return `
          <div class="tpl-preview-section ${hasTitle ? '' : 'is-flat'}">
            ${head}
            <div class="tpl-preview-items">
              ${items.length === 0 ? '<div class="tpl-preview-empty">項目なし</div>' : items.map((it, iIdx) => _renderPreviewItem(it, iIdx)).join('')}
            </div>
          </div>`;
      };

      if (showTabs) {
        tabOrder.forEach(tabName => {
          const secs = tabMap.get(tabName) || [];
          html += `<div class="tpl-preview-tab-block">
            <div class="tpl-preview-tab-head">📑 ${_esc(tabName || '(タブなし)')}</div>`;
          secs.forEach((sec, sIdx) => { html += renderSecHtml(sec, sIdx); });
          html += `</div>`;
        });
      } else {
        const secs = tabMap.get(tabOrder[0]) || [];
        secs.forEach((sec, sIdx) => { html += renderSecHtml(sec, sIdx); });
      }
    }
    body.innerHTML = html;
    modal.classList.add('open');
  }
  window.previewTemplate = previewTemplate;

  function _renderPreviewItem(item, idx) {
    const disabled = !!item._disabled;
    const points = Array.isArray(item.points) ? item.points : [];
    const pointsHtml = points.length === 0
      ? ''
      : '<ul class="tpl-preview-points">' + points.map(p => `<li>${_esc(p)}</li>`).join('') + '</ul>';
    const detailHtml = item.detail ? `<div class="tpl-preview-detail">${_esc(item.detail)}</div>` : '';
    const subHtml = item.sub ? `<div class="tpl-preview-sub">${_esc(item.sub)}</div>` : '';
    const badge = disabled ? '<span class="tpl-preview-badge-disabled">無効</span>' : '';
    const itype = item.inputType || 'check';
    const mockInput = (itype === 'select')
      ? '<span class="tpl-preview-mock-select">▼ 選択</span>'
      : (itype === 'status' || itype === 'tri')
        ? '<span class="tpl-preview-mock-status">未／OK／NG</span>'
        : '<span class="tpl-preview-mock-check">○</span>';
    return `
      <div class="tpl-preview-item ${disabled ? 'is-disabled' : ''}">
        <div class="tpl-preview-item-num">${String(idx + 1).padStart(2, '0')}</div>
        <div class="tpl-preview-item-body">
          <div class="tpl-preview-item-name">${_esc(item.name || '(無題)')}${badge}</div>
          ${subHtml}
          ${detailHtml}
          ${pointsHtml}
        </div>
        <div class="tpl-preview-item-mock">${mockInput}</div>
      </div>`;
  }

  function closeTemplatePreview() {
    const modal = document.getElementById('modal-tpl-preview');
    if (modal) modal.classList.remove('open');
  }
  window.closeTemplatePreview = closeTemplatePreview;

  // =========================================
  // v1.6.2: Excel エクスポート
  // =========================================
  function _xlsxLib() {
    return (typeof XLSX !== 'undefined') ? XLSX : null;
  }

  function exportTemplateXlsx(tplId) {
    const X = _xlsxLib();
    if (!X) { _toast('Excelライブラリの読込待ち。少し待って再実行してください'); return; }
    const tpl = _getTpl(tplId); if (!tpl) return;

    // v1.7.14: select_options 列を追加
    // v1.7.19: section_tab 列（大カテゴリ名）を追加
    const headers = [
      'section_id', 'section_tab', 'section_title', 'section_icon',
      'item_id', 'item_name', 'item_sub', 'item_detail', 'item_points',
      'input_type', 'select_options', 'disabled',
    ];
    const rows = [headers];

    (tpl.sections || []).forEach(sec => {
      const items = (sec.items || []);
      if (items.length === 0) {
        rows.push([sec.id || '', sec.tab || '', sec.title || '', sec.icon || '', '', '', '', '', '', '', '', '']);
      } else {
        items.forEach(it => {
          rows.push([
            sec.id || '',
            sec.tab || '',
            sec.title || '',
            sec.icon || '',
            it.id || '',
            it.name || '',
            it.sub || '',
            it.detail || '',
            (it.points || []).join(' | '),
            it.inputType || 'check',
            (Array.isArray(it.selectOptions) ? it.selectOptions : []).join(' | '),
            it._disabled ? 'true' : '',
          ]);
        });
      }
    });

    const ws = X.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 6 },
      { wch: 14 }, { wch: 24 }, { wch: 24 }, { wch: 40 }, { wch: 40 },
      { wch: 10 }, { wch: 30 }, { wch: 8 },
    ];
    const wb = X.utils.book_new();
    const sheetName = (tpl.name || 'template').slice(0, 28).replace(/[\\\/:?*\[\]]/g, '_') || 'template';
    X.utils.book_append_sheet(wb, ws, sheetName);
    const filename = `carflow_tpl_${tpl.id}.xlsx`;
    X.writeFile(wb, filename);
    _toast('Excel を書き出しました：' + filename);
  }
  window.exportTemplateXlsx = exportTemplateXlsx;

  // v1.7.14: 書式テンプレ DL（空のひな型 + 列の説明 + 記入例）
  function downloadTemplateBlank() {
    const X = _xlsxLib();
    if (!X) { _toast('Excelライブラリの読込待ち。少し待って再実行してください'); return; }

    // 1行目：列名（取込時のキー）
    // 2行目：日本語の見出し（人間向け）
    // 3行目：説明（その列に何を入れるか）
    // 4〜n行目：記入例（チェック/3状態/状態判定/選択肢/テキスト）
    // v1.7.19: section_tab（大カテゴリ名）列を追加
    const rows = [
      // 1行目：取込キー（小文字英数）。この行が無いと取込できない
      [
        'section_id', 'section_tab', 'section_title', 'section_icon',
        'item_id', 'item_name', 'item_sub', 'item_detail', 'item_points',
        'input_type', 'select_options', 'disabled',
      ],
      // 2行目：日本語見出し（取込時は無視されますが人が読みやすいように）
      [
        'セクションID', '大カテゴリ名（タブ）', '中カテゴリ名', 'セクションアイコン',
        '項目ID', '項目名', 'サブ（短い説明）', '詳細（長い説明）', '注意点（ | 区切り）',
        '入力タイプ', '選択肢（ | 区切り）', '無効化',
      ],
      // 3行目：説明
      [
        '空欄なら自動付番（同じ名前のセクションがあれば既存IDを再利用）',
        '同じ名前を複数セクションで使うと、その大カテゴリのタブにまとまります（空欄ならタブ無し）',
        'アコーディオンの見出し名。空欄ならフラット表示（帯なし）',
        '絵文字1つ（例：🔧）。空欄でもOK',
        '空欄なら自動付番（既存と一致するIDを書けば上書き）',
        '必須。スタッフがチェックする時に画面に出る項目名',
        '画面で項目名の下に小さく出る短文（任意）',
        '画面で項目名の下に出る詳細説明（任意）',
        '注意点を「 | 」（半角パイプ）で区切って並べる（任意）',
        'check / tri / status / select / text のどれか（既定：check）',
        'input_type=select の時だけ使用。選択肢を「 | 」区切りで並べる',
        'true / 1 / yes / 無効 のどれかで「無効化」状態（無効化された項目は画面に出ない）',
      ],
      // 4行目以降：記入例
      ['ext', '外装', '', '🚗', '', '🟦 ボディ全周チェック', '傷・へこみ・錆', 'ボディ全周を目視で確認します', 'ルーフ・ピラーも確認 | フレーム歪みの有無', 'check', '', ''],
      ['ext', '外装', '', '🚗', '', '🟦 タイヤ・ホイール清掃', '', '鉄粉除去剤で洗浄', '', 'check', '', ''],
      ['eq',  '装備品', 'オーディオ・ナビ', '🎵', '', '🟩 カーナビ', '純正/社外', '画面が映るかと地図表示を確認', '', 'tri', '', ''],
      ['eq',  '装備品', 'オーディオ・ナビ', '🎵', '', '🟩 ナビ媒体', '中身がHDDかSSDかDVDか', '', '', 'select', 'HDD | SSD/メモリ | DVD | なし/不明', ''],
      ['chk', '点検', '', '🔧', '', '🟧 ブレーキ動作', 'OK/NG判定', '試乗してブレーキが効くか確認', '効きの強さ | 異音の有無', 'status', '', ''],
      ['chk', '点検', '', '🔧', '', '🟧 整備メモ', '気づいたことを自由に', '次回点検時の引き継ぎなど', '', 'text', '', ''],
      ['chk', '点検', '', '🔧', '', '🟥 廃止項目（書いても表示されない）', '', '', '', 'check', '', 'true'],
    ];

    const ws = X.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
      { wch: 14 }, { wch: 26 }, { wch: 22 }, { wch: 38 }, { wch: 38 },
      { wch: 10 }, { wch: 32 }, { wch: 8 },
    ];
    // 説明行（3行目）に背景色…は SheetJS の community 版だと完全には効かないので諦め、
    // 列幅と行構成だけ整えておく。
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'template_format');

    // 取込時に説明行（2行目=日本語、3行目=説明、4行目以降=例）を「セクションID未設定」として
    // 自動付番される事故を避けたい。importTemplateXlsx 側で「2,3行目スキップ」する仕組みを入れる
    // …のは複雑なので、運用ルールで「ダウンロードしたら 2/3 行目（説明行）と 4〜10 行目（例）を
    // 削除してから記入し、そのまま取込ボタンに突っ込む」とする。
    const filename = `carflow_template_format.xlsx`;
    X.writeFile(wb, filename);
    _toast('書式テンプレートを書き出しました：' + filename);
  }
  window.downloadTemplateBlank = downloadTemplateBlank;

  // =========================================
  // v1.6.2: Excel インポート
  // =========================================
  async function importTemplateXlsx(tplId, file) {
    const X = _xlsxLib();
    if (!X) { _toast('Excelライブラリの読込待ち'); return; }
    if (!file) return;
    const tpl = _getTpl(tplId); if (!tpl) return;
    if (!_can()) { _toast('管理者権限が必要です'); return; }

    if (!confirm(`「${tpl.name}」の項目を Excel から取り込みます。\n現在の項目はすべて上書きされます。続行しますか？`)) return;

    try {
      const data = await file.arrayBuffer();
      const wb = X.read(data, { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheetName];
      const aoa = X.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!aoa || aoa.length < 2) { _toast('行が見つかりません'); return; }

      const header = aoa[0].map(s => String(s).trim().toLowerCase());
      const idx = (k) => header.indexOf(k);
      const cSecId    = idx('section_id');
      const cSecTab   = idx('section_tab');   // v1.7.19: 大カテゴリ列
      const cSecTitle = idx('section_title');
      const cSecIcon  = idx('section_icon');
      const cItemId   = idx('item_id');
      const cItemName = idx('item_name');
      const cItemSub  = idx('item_sub');
      const cDetail   = idx('item_detail');
      const cPoints   = idx('item_points');
      const cInput    = idx('input_type');
      const cSelOpts  = idx('select_options'); // v1.7.14
      const cDisabled = idx('disabled');

      // v1.7.19: section_title は必須ではなくなった（フラット表示の場合は空欄）
      //   行が「セクションを成り立たせるか」は section_tab か section_title のどちらかが
      //   入っているかで判定する。
      if (cItemName < 0) {
        _toast('必須列（item_name）が見つかりません');
        return;
      }

      const existingItem = {};
      (tpl.sections || []).forEach(s => {
        (s.items || []).forEach(i => { existingItem[i.id] = i; });
      });

      const sectionMap = new Map();
      const sectionOrder = [];
      let autoSecCounter = 0, autoItemCounter = 0;

      for (let r = 1; r < aoa.length; r++) {
        const row = aoa[r];
        if (!row) continue;
        const secTitle = (cSecTitle >= 0) ? String(row[cSecTitle] || '').trim() : '';
        const secTab   = (cSecTab   >= 0) ? String(row[cSecTab]   || '').trim() : '';
        const itemName = (cItemName >= 0) ? String(row[cItemName] || '').trim() : '';
        // tab・title・item_name のどれもなければ空行扱いでスキップ
        if (!secTitle && !secTab && !itemName) continue;

        let secId = (cSecId >= 0) ? String(row[cSecId] || '').trim() : '';
        if (!secId) {
          // v1.7.19: 既存セクションは (tab, title) ペアで探す
          const found = (tpl.sections || []).find(s =>
            (s.title || '') === secTitle && (s.tab || '') === secTab);
          secId = found ? found.id : ('sec_' + Date.now().toString(36) + '_' + (autoSecCounter++));
        }

        let sec = sectionMap.get(secId);
        if (!sec) {
          sec = {
            id: secId,
            title: secTitle,
            tab: secTab, // v1.7.19: 大カテゴリ
            icon: (cSecIcon >= 0) ? String(row[cSecIcon] || '').trim() : '',
            items: [],
          };
          sectionMap.set(secId, sec);
          sectionOrder.push(secId);
        }

        if (!itemName) continue;

        let itemId = (cItemId >= 0) ? String(row[cItemId] || '').trim() : '';
        if (!itemId) {
          itemId = 'i_' + Date.now().toString(36) + '_' + (autoItemCounter++);
        }
        const points = (cPoints >= 0)
          ? String(row[cPoints] || '').split('|').map(s => s.trim()).filter(Boolean)
          : [];
        let inputType = (cInput >= 0) ? (String(row[cInput] || 'check').trim() || 'check') : 'check';
        if (!['check', 'tri', 'status', 'select', 'text'].includes(inputType)) inputType = 'check';
        // v1.7.14: select_options を | で分割
        const selectOptions = (cSelOpts >= 0)
          ? String(row[cSelOpts] || '').split('|').map(s => s.trim()).filter(Boolean)
          : [];
        const disabledStr = (cDisabled >= 0) ? String(row[cDisabled] || '').trim().toLowerCase() : '';
        const isDisabled = (disabledStr === 'true' || disabledStr === '1' || disabledStr === 'yes' || disabledStr === '無効');

        const prev = existingItem[itemId] || {};
        const newItem = {
          ...prev,
          id: itemId,
          name: itemName,
          sub: (cItemSub >= 0) ? String(row[cItemSub] || '').trim() : '',
          detail: (cDetail >= 0) ? String(row[cDetail] || '').trim() : '',
          points,
          inputType,
          // v1.7.14: select 用選択肢。空配列でも持たせる（次回再開時の値保持のため）
          selectOptions: (selectOptions && selectOptions.length > 0)
            ? selectOptions
            : (Array.isArray(prev.selectOptions) ? prev.selectOptions : []),
          order: sec.items.length,
          _source: prev._source || 'custom',
        };
        if (isDisabled) newItem._disabled = true; else delete newItem._disabled;
        sec.items.push(newItem);
      }

      const newSections = sectionOrder.map(id => sectionMap.get(id));
      if (newSections.length === 0) { _toast('有効な行が見つかりませんでした'); return; }

      // v1.7.37: variants[0] と tpl.sections を一緒に更新
      _setActiveSections(tpl, newSections);
      const ok = await _saveTpl(tpl);
      if (ok) {
        const totalItems = newSections.reduce((a, s) => a + s.items.length, 0);
        _toast(`✅ 取込完了：${newSections.length}セクション / ${totalItems}項目`);
        window._tplEditor.expandedSectionId = null;
        _renderDetail();
      }
    } catch (err) {
      console.error('[importTemplateXlsx]', err);
      _toast('Excel 取込に失敗しました：' + (err.message || err));
    }
  }
  window.importTemplateXlsx = importTemplateXlsx;

  // -----------------------------------------
  // 公開
  // -----------------------------------------
  window.renderTemplateEditor = renderTemplateEditor;

  console.log('[template-editor] ready');
})();
