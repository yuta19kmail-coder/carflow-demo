// ========================================
// checklist-templates.js (v1.3.7)
// CarFlow ChecklistTemplate 統一データ構造（引き継ぎメモ §8）
//
// worksheet（作業管理票）/ equipment（装備品チェック）/ カスタム大タスクの
// 「項目チェックリスト」をすべて同じデータ構造で扱う。
//
// このファイルは既存の REGEN_TASKS / DELIVERY_TASKS / EQUIPMENT_CATEGORIES に
// 触らず、それらをアダプタ経由で新構造に「並行生成」する。
// 既存の worksheet.js / equipment.js は当面そのまま動く。
// 将来 v1.3.8 以降、新UI から ChecklistTemplates を直接参照するよう順次移行する。
//
// データ構造（JSDoc 型定義）：
// ----------------------------------------
//
// /** @typedef {Object} ChecklistTemplate
//  *  @property {string} id                 - 例: 'tpl_regen_t_regen' / 'tpl_equipment'
//  *  @property {string} name               - 表示名（'再生' '装備品チェック' など）
//  *  @property {string} icon               - 絵文字
//  *  @property {'tabs'|'accordion'|'flat'} navigationStyle  - 項目ナビゲーションスタイル
//  *  @property {'worksheet'|'equipment'|'custom'} sourceType - 由来
//  *  @property {string} [sourceTaskId]     - worksheet 由来時の元タスクID
//  *  @property {'regen'|'delivery'} [sourcePhase]
//  *  @property {ChecklistSection[]} sections
//  */
//
// /** @typedef {Object} ChecklistSection
//  *  @property {string} id       - section ID（'exterior' など）
//  *  @property {string} title    - 中カテゴリ名（アコーディオンの見出し。空ならフラット表示）
//  *  @property {string} [tab]    - 大カテゴリ名（タブの見出し。同じ tab を持つセクションは同じタブにまとまる）
//  *  @property {string} [icon]
//  *  @property {ChecklistItem[]} items
//  */
//
// /** v1.7.19: 表示モデル（navigationStyle は廃止。中身の構造で見た目が決まる）
//  *  - 大カテゴリ（tab）が 2 種類以上 → 上部にタブが並ぶ
//  *  - 大カテゴリが 1 種類（または無し）→ タブは出ない
//  *  - 中カテゴリ（title）あり → アコーディオン（▼で開閉）
//  *  - 中カテゴリ（title）が空 → 帯なし、項目だけ並ぶ
//  */
//
// /** v1.7.33: バリアント（パターン）対応
//  *  ・1つの ChecklistTemplate に複数の variants（パターン）を持てる
//  *  ・例：再生 → A:フル / B:中程度 / C:簡易、装備品 → ミニバン用 / セダン用
//  *  ・各バリアントは独立した sections[] を持つ
//  *  ・車ごとに「どのバリアントを使うか」を選択（Phase2 で実装）
//  *  ・既存テンプレは「デフォルト」バリアント1つに自動移行
//  */
//
// /** @typedef {Object} ChecklistTemplateVariant
//  *  @property {string} id              - バリアントID（'va_default' など）
//  *  @property {string} name            - 表示名（自由命名：'A: フル' / 'ミニバン用' など）
//  *  @property {ChecklistSection[]} sections
//  */
//
// /** @typedef {Object} ChecklistItem
//  *  @property {string} id       - 不変ID（rename しても変えない／既存データ key）
//  *  @property {string} name
//  *  @property {string} [sub]
//  *  @property {string} [detail]
//  *  @property {string} [help]
//  *  @property {string[]} [points]
//  *  @property {ChecklistMedia[]} [media]
//  *  @property {'check'|'select'|'status'|'tri'|'text'} inputType
//  *  @property {string[]} [selectOptions]   - inputType='select' のとき
//  *  @property {string[]} [statusOptions]   - inputType='status' のとき（既定: none/ok/ng）
//  *  @property {string[]} [triOptions]      - inputType='tri'    のとき（既定: none/on/off）
//  *  @property {string} [group]
//  *  @property {number} order
//  *  @property {boolean} [_disabled]
//  *  @property {'default'|'custom'} _source
//  */
//
// /** @typedef {Object} ChecklistMedia
//  *  @property {'image'|'youtube'|'video'} type
//  *  @property {string}  [url]              - image / video のとき
//  *  @property {string}  [videoId]          - youtube のとき
//  *  @property {string}  [caption]
//  *  @property {number}  [durationSec]
//  *  @property {number}  [startSec]         - youtube の再生開始秒
//  */
// ========================================

// グローバル：すべてのテンプレートを保持
// アクセス例: ChecklistTemplates['tpl_regen_t_regen']
const ChecklistTemplates = {};

// ----------------------------------------
// アダプタ：既存データ → 新構造
// ----------------------------------------

// worksheet 型タスクの section を ChecklistSection に変換
// v1.7.19: 既存 section.title を「大カテゴリ（tab）」に昇格し、中カテゴリ名は空にする。
//          → 既存の「外装/内装」タブ表示はそのまま（タブの中はフラット）。
function _ctBuildSectionFromTaskSection(taskSec, secIdx, srcTaskId) {
  return {
    id: taskSec.id || `${srcTaskId}_sec${secIdx}`,
    title: '', // 中カテゴリ名（タブ内では空＝フラット）
    tab: taskSec.title || '', // 大カテゴリ名（旧 section title をそのまま昇格）
    icon: taskSec.icon || '',
    items: (taskSec.items || []).map((item, i) => ({
      id: item.id,
      name: item.name || '',
      sub: item.sub || '',
      detail: item.detail || '',
      help: item.help || '',
      points: Array.isArray(item.points) ? item.points.slice() : [],
      media: Array.isArray(item.media) ? item.media.slice() : [],
      inputType: 'check', // worksheet 系はすべて単純トグル
      order: i,
      _source: 'default',
    })),
  };
}

// 1つの worksheet 型タスクから ChecklistTemplate を生成
// v1.7.33: variants 配列を初期化。デフォルトバリアント1つだけを持つ。
function _ctBuildTemplateFromWorksheetTask(task, sourcePhase) {
  if (!task || task.type !== 'workflow') return null;
  const sections = (task.sections || []).map((sec, i) =>
    _ctBuildSectionFromTaskSection(sec, i, task.id)
  );
  return {
    id: `tpl_${sourcePhase}_${task.id}`,
    name: task.name || '',
    icon: task.icon || '',
    sourceType: 'worksheet',
    sourceTaskId: task.id,
    sourcePhase,
    // v1.7.33: variants 必須化。sections は variants[0].sections と同じ参照（互換のため残す）
    variants: [{
      id: 'va_default',
      name: 'デフォルト',
      sections,
    }],
    sections, // ← 同一参照。読み手は variants[0].sections と等価とみなせる
    _migrated: true,
  };
}

// EQUIPMENT_CATEGORIES から1つの ChecklistTemplate を生成
// v1.7.19: 全カテゴリを大カテゴリ「装備品」ひとつにまとめ、中カテゴリ（アコーディオン）として並べる。
// v1.7.33: variants 配列を初期化（デフォルトバリアント1つ）。
function _ctBuildTemplateFromEquipment() {
  if (typeof EQUIPMENT_CATEGORIES === 'undefined') return null;
  const sections = EQUIPMENT_CATEGORIES.map(cat => ({
    id: cat.id,
    title: cat.label || '', // 中カテゴリ名（アコーディオン見出し）
    tab: '装備品',           // 大カテゴリ名（全部まとめて 1 タブ → タブは出ない）
    icon: cat.icon || '',
    items: (cat.items || []).map((it, ii) => {
      const m = {
        id: it.id,
        name: it.label || '',
        sub: '',
        detail: '',
        help: it.help || '',
        points: [],
        media: Array.isArray(it.media) ? it.media.slice() : [],
        inputType: it.type || 'tri',
        group: it.group || '',
        order: ii,
        _source: 'default',
      };
      if (it.type === 'select' && Array.isArray(it.options)) {
        m.selectOptions = it.options.slice();
      } else if (it.type === 'status') {
        m.statusOptions = ['none', 'ok', 'ng'];
      } else if (it.type === 'tri') {
        m.triOptions = ['none', 'on', 'off'];
      }
      return m;
    }),
  }));
  return {
    id: 'tpl_equipment',
    name: '装備品チェック',
    icon: '⚙️',
    sourceType: 'equipment',
    // v1.7.33: variants 必須化。sections は variants[0].sections と同じ参照
    variants: [{
      id: 'va_default',
      name: 'デフォルト',
      sections,
    }],
    sections,
    _migrated: true,
  };
}

// ----------------------------------------
// v1.7.19: 旧構造（navigationStyle ベース）→ 新構造（tab + title）への自動移行。
// v1.7.33: variants 未存在のテンプレは「デフォルト」バリアント1つに自動移行する処理も追加。
// DB から読み戻したテンプレや、旧バージョンのコードで保存された
// テンプレが届いた時に呼ばれる。idempotent：_migrated フラグで二重実行を防ぐ。
// ----------------------------------------
function _ctMigrateTemplate(tpl) {
  if (!tpl || tpl._migrated) return tpl;
  const sections = Array.isArray(tpl.sections) ? tpl.sections : [];
  const hasAnyTab = sections.some(s => s && s.tab && s.tab !== '');

  if (!hasAnyTab) {
    // 装備品チェックは特別扱い：大カテゴリは固定で「装備品」、中カテゴリは元の title を維持
    if (tpl.id === 'tpl_equipment') {
      sections.forEach(s => { if (s) s.tab = '装備品'; });
    } else {
      const navStyle = tpl.navigationStyle || 'tabs';
      if (navStyle === 'tabs') {
        // 旧 tabs：各セクションが独立したタブ → tab に title を昇格、title は空に
        sections.forEach(s => {
          if (!s) return;
          s.tab = s.title || '';
          s.title = '';
        });
      } else if (navStyle === 'flat') {
        // 旧 flat：見出しなしのフラット列 → tab・title ともに空
        sections.forEach(s => {
          if (!s) return;
          s.tab = '';
          s.title = '';
        });
      } else {
        // 旧 accordion：タブなし／title はそのまま（アコーディオン見出し）
        sections.forEach(s => {
          if (!s) return;
          if (s.tab == null) s.tab = '';
        });
      }
    }
  }
  // v1.7.33: variants が無いテンプレは「デフォルト」バリアント1つを持たせる
  if (!Array.isArray(tpl.variants) || tpl.variants.length === 0) {
    tpl.variants = [{
      id: 'va_default',
      name: 'デフォルト',
      sections, // 既存 sections と同じ参照
    }];
  } else {
    // variants がある場合は、tpl.sections と variants[0].sections の整合性を保つ
    // sections フィールドは variants[0].sections と同期させる
    if (tpl.variants[0] && Array.isArray(tpl.variants[0].sections)) {
      tpl.sections = tpl.variants[0].sections;
    }
  }
  tpl._migrated = true;
  return tpl;
}

// ----------------------------------------
// 初期化：ロード時に既存データから自動生成
// ----------------------------------------
(function _ctInit() {
  // 再生フェーズの worksheet 型タスク
  if (typeof REGEN_TASKS !== 'undefined') {
    REGEN_TASKS.forEach(t => {
      const tpl = _ctBuildTemplateFromWorksheetTask(t, 'regen');
      if (tpl) ChecklistTemplates[tpl.id] = tpl;
    });
  }
  // 納車フェーズの worksheet 型タスク
  if (typeof DELIVERY_TASKS !== 'undefined') {
    DELIVERY_TASKS.forEach(t => {
      const tpl = _ctBuildTemplateFromWorksheetTask(t, 'delivery');
      if (tpl) ChecklistTemplates[tpl.id] = tpl;
    });
  }
  // 装備品マスター
  const eqTpl = _ctBuildTemplateFromEquipment();
  if (eqTpl) ChecklistTemplates[eqTpl.id] = eqTpl;
})();

// ----------------------------------------
// 公開API
// ----------------------------------------

// テンプレートを ID で取得
function getChecklistTemplate(id) {
  return ChecklistTemplates[id] || null;
}

// 全テンプレートを配列で取得
function getAllChecklistTemplates() {
  return Object.keys(ChecklistTemplates).map(id => ChecklistTemplates[id]);
}

// 既存 worksheet タスクID → ChecklistTemplateID への橋渡し
function templateIdForWorksheetTask(taskId, phase) {
  return `tpl_${phase}_${taskId}`;
}

// 装備品テンプレートID（固定）
function templateIdForEquipment() {
  return 'tpl_equipment';
}

// テンプレートの全項目を flat 配列で取得（カウント用など）
function flattenChecklistItems(template) {
  if (!template) return [];
  const out = [];
  (template.sections || []).forEach(sec => {
    (sec.items || []).forEach(item => {
      if (item._disabled) return;
      out.push({ section: sec, item });
    });
  });
  return out;
}

// v1.7.19: DB から読み戻したテンプレを新構造に移行する公開API
window.migrateChecklistTemplate = _ctMigrateTemplate;

// v1.7.37: 組み込みテンプレを「初期状態」に再構築する公開API。
//   tplId に対応する built-in を取り出し、新規テンプレオブジェクトを返す。
//   custom テンプレや存在しない id は null。
window.rebuildBuiltinTemplate = function (tplId) {
  if (!tplId) return null;
  if (tplId === 'tpl_equipment') {
    return _ctBuildTemplateFromEquipment();
  }
  // tpl_<phase>_<taskId> の形式から復元
  const m = String(tplId).match(/^tpl_(regen|delivery)_(.+)$/);
  if (!m) return null;
  const phase = m[1];
  const taskId = m[2];
  const list = (phase === 'regen')
    ? (typeof REGEN_TASKS !== 'undefined' ? REGEN_TASKS : [])
    : (typeof DELIVERY_TASKS !== 'undefined' ? DELIVERY_TASKS : []);
  const task = list.find(t => t && t.id === taskId);
  if (!task) return null;
  return _ctBuildTemplateFromWorksheetTask(task, phase);
};

// v1.7.38: 車ごとに選ばれている「タスクパターン（variant）」を取得・設定するAPI。
//   ・車には car.taskVariants = { [taskId]: variantId } を持たせる。
//   ・パターンが1つしか無いテンプレ（≒既存テンプレ）は、自動的にそれを選択扱いに。
//   ・パターンが2つ以上あるのに未選択 → null を返す（呼び元で「先に選んでください」を出す）。
window.getCarTaskVariantId = function (car, taskId) {
  if (!car || !taskId) return null;
  if (typeof ChecklistTemplates === 'undefined') return null;
  const isDelivery = car && (car.col === 'delivery' || car.col === 'done');
  const phase = isDelivery ? 'delivery' : 'regen';
  let tplId = `tpl_${phase}_${taskId}`;
  if (taskId === 't_equip') tplId = 'tpl_equipment';
  const tpl = ChecklistTemplates[tplId];
  if (!tpl) return null;
  const variants = Array.isArray(tpl.variants) ? tpl.variants : [];
  if (variants.length === 0) return null;
  // パターン1つ：自動選択
  if (variants.length === 1) return variants[0].id;
  // 車に保存された選択
  const carVariants = (car && car.taskVariants) || {};
  const sel = carVariants[taskId];
  if (sel && variants.find(v => v.id === sel)) return sel;
  return null; // 未選択
};

// パターン選択を保存。第4引数 clearState=true なら旧の作業データをクリア。
window.setCarTaskVariantId = function (car, taskId, variantId, clearState) {
  if (!car || !taskId) return;
  if (!car.taskVariants) car.taskVariants = {};
  car.taskVariants[taskId] = variantId;
  if (clearState) {
    const isDelivery = car && (car.col === 'delivery' || car.col === 'done');
    const bucket = isDelivery ? 'deliveryTasks' : 'regenTasks';
    if (car[bucket] && car[bucket][taskId]) {
      delete car[bucket][taskId];
    }
  }
};

// 車・タスクに対して「いま使うべき sections 配列」を返す。
// 未選択なら null（呼び元は「パターンを選んでね」UIを出す）。
window.getActiveTaskSections = function (car, taskId) {
  if (!car || !taskId) return null;
  if (typeof ChecklistTemplates === 'undefined') return null;
  const isDelivery = car && (car.col === 'delivery' || car.col === 'done');
  const phase = isDelivery ? 'delivery' : 'regen';
  let tplId = `tpl_${phase}_${taskId}`;
  if (taskId === 't_equip') tplId = 'tpl_equipment';
  const tpl = ChecklistTemplates[tplId];
  if (!tpl) return null;
  const variants = Array.isArray(tpl.variants) ? tpl.variants : [];
  if (variants.length === 0) {
    return Array.isArray(tpl.sections) ? tpl.sections : [];
  }
  if (variants.length === 1) return variants[0].sections || [];
  const sel = window.getCarTaskVariantId(car, taskId);
  if (!sel) return null;
  const v = variants.find(x => x.id === sel);
  return v ? (v.sections || []) : null;
};

// 全 built-in テンプレを初期状態に再構築（戻り値：[{id, tpl}] 配列）
window.rebuildAllBuiltinTemplates = function () {
  const out = [];
  if (typeof REGEN_TASKS !== 'undefined') {
    REGEN_TASKS.forEach(t => {
      const tpl = _ctBuildTemplateFromWorksheetTask(t, 'regen');
      if (tpl) out.push({ id: tpl.id, tpl });
    });
  }
  if (typeof DELIVERY_TASKS !== 'undefined') {
    DELIVERY_TASKS.forEach(t => {
      const tpl = _ctBuildTemplateFromWorksheetTask(t, 'delivery');
      if (tpl) out.push({ id: tpl.id, tpl });
    });
  }
  const eq = _ctBuildTemplateFromEquipment();
  if (eq) out.push({ id: eq.id, tpl: eq });
  return out;
};
