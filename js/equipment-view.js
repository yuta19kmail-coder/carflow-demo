// ========================================
// equipment-view.js (v1.8.27〜)
// 装備詳細 閲覧ビュー（カタログ風レイアウト）
//
// 旧 equipment.js（_unused 移行済み）から「閲覧用」機能だけを抽出し、
// データソースを新方式 ChecklistTemplate (tpl_equipment) に刷新したもの。
//   ・section.title  → カタログのカテゴリ見出し（中タイトル）
//   ・section.icon   → カテゴリ見出しのアイコン
//   ・section.items[].name → 各行のラベル（小項目）
//   ・state[item.id] + item.inputType → 値の表示（○/×/OK/NG/選択値/テキスト/✓）
//
// テンプレートエディタでカスタム編集（中タイトル/小項目の追加削除/
// パターン variants 切替）してもそのまま追従する。
// state は car.regenTasks.t_equip / car.deliveryTasks.t_equip を参照。
// ========================================

// 装備品 state を取得（フェーズに応じて regenTasks / deliveryTasks の t_equip）
function getEquipmentState(car) {
  if (!car) return {};
  const isDelivery = (car.col === 'delivery' || car.col === 'done');
  const bucket = isDelivery ? 'deliveryTasks' : 'regenTasks';
  if (!car[bucket]) car[bucket] = {};
  if (!car[bucket].t_equip || typeof car[bucket].t_equip !== 'object') {
    car[bucket].t_equip = {};
  }
  return car[bucket].t_equip;
}

// 車に紐づく現在の装備セクション（variant 反映）
//   未選択 multi-variant の場合は null を返す（呼び元はプレースホルダ表示）
function _eqActiveSections(car) {
  if (typeof window.getActiveTaskSections === 'function') {
    return window.getActiveTaskSections(car, 't_equip');
  }
  // フォールバック：tpl_equipment.sections をそのまま
  if (typeof ChecklistTemplates !== 'undefined') {
    const tpl = ChecklistTemplates['tpl_equipment'];
    if (tpl && Array.isArray(tpl.sections)) return tpl.sections;
  }
  return null;
}

// 全項目数と入力済み数（_disabled 除外、特殊キーは無視）
//   進捗バッジ「○/△ 入力済」表示や、car-detail.js の _renderEqDetailButton から呼ばれる
function calcEquipmentProgress(car) {
  const sections = _eqActiveSections(car);
  if (!Array.isArray(sections)) {
    return { total: 0, filled: 0, pct: 0, _noVariant: true };
  }
  const state = getEquipmentState(car);
  let total = 0, filled = 0;
  sections.forEach(sec => {
    (sec.items || []).forEach(it => {
      if (it._disabled) return;
      total++;
      const v = state[it.id];
      if (_eqIsFilled(it, v)) filled++;
    });
  });
  const pct = total ? Math.round(filled / total * 100) : 0;
  return { total, filled, pct };
}

// 値が「入力済」とみなせるかの判定（inputType 別）
function _eqIsFilled(item, value) {
  if (value == null || value === '') return false;
  const t = item.inputType || 'tri';
  if (t === 'check') return value === true;
  if (t === 'tri')   return value === 'on' || value === 'off';
  if (t === 'status')return value === 'ok' || value === 'ng';
  if (t === 'select')return String(value).length > 0;
  if (t === 'text')  return String(value).trim().length > 0;
  // 想定外型：truthy なら入力済
  return !!value;
}

// 値を表示用に整形 → { html, cls }
function _eqFormatValue(item, value) {
  const t = item.inputType || 'tri';
  if (value == null || value === '') return { html: '—', cls: 'none' };
  if (t === 'tri') {
    if (value === 'on')  return { html: '○', cls: 'on' };
    if (value === 'off') return { html: '×', cls: 'off' };
    return { html: '—', cls: 'none' };
  }
  if (t === 'status') {
    if (value === 'ok') return { html: 'OK', cls: 'ok' };
    if (value === 'ng') return { html: 'NG', cls: 'ng' };
    return { html: '—', cls: 'none' };
  }
  if (t === 'check') {
    return value === true ? { html: '✓', cls: 'on' } : { html: '—', cls: 'none' };
  }
  if (t === 'select') {
    const s = String(value);
    if (!s) return { html: '—', cls: 'none' };
    return { html: _eqEscape(s), cls: 'sel' };
  }
  if (t === 'text') {
    const s = String(value).trim();
    if (!s) return { html: '—', cls: 'none' };
    return { html: _eqEscape(s), cls: 'txt' };
  }
  // 想定外
  return { html: _eqEscape(String(value)), cls: 'txt' };
}

// HTML エスケープ（helpers.js の escapeHtml が無くても動くようローカル定義）
function _eqEscape(s) {
  if (typeof escapeHtml === 'function') return escapeHtml(s);
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// ====================================================================
// カタログ風 閲覧ビュー HTML 生成
// ====================================================================
//
// opts.backHandler … 「← 戻る」ボタンに割り当てる JS 文字列（商談ポップアップ等）
function renderEquipmentView(car, opts) {
  opts = opts || {};
  const sections = _eqActiveSections(car);

  let html = '';
  if (opts.backHandler) {
    html += `<div class="deal-eq-back" onclick="${opts.backHandler}">← 戻る</div>`;
  }

  // パターン未選択（multi-variant）
  if (sections === null) {
    html += `
      <div class="eq-view-empty">
        <div class="big">📋</div>
        <div>先にタスクパターンを選んでください</div>
        <div style="margin-top:6px;font-size:11px">装備品チェックを開いてパターンを選択すると、ここに装備一覧が表示されます</div>
      </div>`;
    return `<div class="eq-view">${html}</div>`;
  }

  if (!Array.isArray(sections) || sections.length === 0) {
    html += `
      <div class="eq-view-empty">
        <div class="big">📋</div>
        <div>装備品チェックの項目が定義されていません</div>
        <div style="margin-top:6px;font-size:11px">設定 → タスク・進捗 → 装備品チェック から項目を編集できます</div>
      </div>`;
    return `<div class="eq-view">${html}</div>`;
  }

  const state = getEquipmentState(car);
  const prog = calcEquipmentProgress(car);

  // 何も入力されていない
  if (prog.filled === 0) {
    html += `
      <div class="eq-view-empty">
        <div class="big">📋</div>
        <div>まだ装備品チェックが行われていません</div>
        <div style="margin-top:6px;font-size:11px">スマホでチェックを開始してください</div>
      </div>`;
    return `<div class="eq-view">${html}</div>`;
  }

  // セクション（中カテゴリ）ごとにブロック描画
  sections.forEach(sec => {
    const items = (sec.items || []).filter(it => !it._disabled);
    if (items.length === 0) return;
    const rows = items.map(it => {
      const v = state[it.id];
      const { html: valHtml, cls } = _eqFormatValue(it, v);
      return `<div class="eq-view-row"><span class="label">${_eqEscape(it.name || '')}</span><span class="val ${cls}">${valHtml}</span></div>`;
    }).join('');
    const title = sec.title || '';
    const icon = sec.icon || '';
    const headInner = `${icon ? `<span class="icon">${_eqEscape(icon)}</span>` : ''}${_eqEscape(title)}`;
    html += `
      <div class="eq-view-cat">
        <div class="eq-view-cat-head">${headInner}</div>
        <div class="eq-view-grid">${rows}</div>
      </div>`;
  });

  return `<div class="eq-view">${html}</div>`;
}

// ====================================================================
// カード詳細モーダル内：アコーディオン開閉
// ====================================================================
function toggleEquipmentAccordion(carId, forceOpen) {
  const wrap = document.getElementById(`eq-acc-${carId}`);
  const btn  = document.getElementById(`eq-acc-btn-${carId}`);
  if (!wrap || !btn) return;
  const isOpen = wrap.getAttribute('data-open') === '1';
  const next = (typeof forceOpen === 'boolean') ? forceOpen : !isOpen;
  if (next) {
    const car = (typeof cars !== 'undefined') ? cars.find(c => c.id === carId) : null;
    if (!car) return;
    wrap.innerHTML = renderEquipmentView(car, {});
    wrap.setAttribute('data-open', '1');
    btn.setAttribute('data-open', '1');
  } else {
    wrap.setAttribute('data-open', '0');
    btn.setAttribute('data-open', '0');
    wrap.innerHTML = '';
  }
}

// ====================================================================
// 商談ポップアップ用：装備詳細モード切替
// ====================================================================
function dealShowEquipment(carId) {
  const body = document.getElementById('deal-popup-body');
  if (!body) return;
  body.setAttribute('data-eq-mode', '1');
  const panel = body.querySelector('.deal-eq-panel');
  if (!panel) return;
  const car = (typeof cars !== 'undefined') ? cars.find(c => c.id === carId) : null;
  if (car) {
    panel.innerHTML = renderEquipmentView(car, { backHandler: 'dealHideEquipment()' });
  }
}

function dealHideEquipment() {
  const body = document.getElementById('deal-popup-body');
  if (!body) return;
  body.setAttribute('data-eq-mode', '0');
  const panel = body.querySelector('.deal-eq-panel');
  if (panel) panel.innerHTML = '';
}

// ====================================================================
// 公開（既存呼び出しコードからアクセスできるように window へぶら下げる）
// ====================================================================
window.getEquipmentState        = getEquipmentState;
window.calcEquipmentProgress    = calcEquipmentProgress;
window.renderEquipmentView      = renderEquipmentView;
window.toggleEquipmentAccordion = toggleEquipmentAccordion;
window.dealShowEquipment        = dealShowEquipment;
window.dealHideEquipment        = dealHideEquipment;
