// ========================================
// equipment-view.js (v1.8.27〜)
// 装備詳細 閲覧ビュー（カタログ風）＋ お客様用「装備品一覧」印刷シート
//
// データソース：新方式 ChecklistTemplate (tpl_equipment) → variant の sections
//   ・section.title  → カテゴリ見出し（中タイトル）
//   ・section.icon   → カテゴリ見出し横のアイコン
//   ・section.items[].name → 行のラベル（小項目）
//   ・section.items[].sub / .detail → 説明文（印刷シートで使用）
//   ・state[item.id] + item.inputType → 値表示
//
// v1.8.43: 印刷シート機能 追加
// v1.8.44: 戻るボタン挙動修正（不完全）
// v1.8.45: 印刷シートをCarFlow本体上のオーバーレイ方式へ全面刷新。
//          戻るボタンが確実に動作。表示項目トグル＋装備品の説明文サポート追加。
// ========================================

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

function _eqActiveSections(car) {
  if (typeof window.getActiveTaskSections === 'function') {
    return window.getActiveTaskSections(car, 't_equip');
  }
  if (typeof ChecklistTemplates !== 'undefined') {
    const tpl = ChecklistTemplates['tpl_equipment'];
    if (tpl && Array.isArray(tpl.sections)) return tpl.sections;
  }
  return null;
}

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

function _eqIsFilled(item, value) {
  if (value == null || value === '') return false;
  const t = item.inputType || 'tri';
  if (t === 'check') return value === true;
  if (t === 'tri')   return value === 'on' || value === 'off';
  if (t === 'status')return value === 'ok' || value === 'ng';
  if (t === 'select')return String(value).length > 0;
  if (t === 'text')  return String(value).trim().length > 0;
  return !!value;
}

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
  return { html: _eqEscape(String(value)), cls: 'txt' };
}

function _eqEscape(s) {
  if (typeof escapeHtml === 'function') return escapeHtml(s);
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function renderEquipmentView(car, opts) {
  opts = opts || {};
  const sections = _eqActiveSections(car);
  let html = '';
  if (opts.backHandler) {
    html += '<div class="deal-eq-back" onclick="' + opts.backHandler + '">← 戻る</div>';
  }
  if (sections === null) {
    html += '<div class="eq-view-empty"><div class="big">📋</div><div>先にタスクパターンを選んでください</div></div>';
    return '<div class="eq-view">' + html + '</div>';
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    html += '<div class="eq-view-empty"><div class="big">📋</div><div>装備品チェックの項目が定義されていません</div></div>';
    return '<div class="eq-view">' + html + '</div>';
  }
  const state = getEquipmentState(car);
  const prog = calcEquipmentProgress(car);
  if (prog.filled === 0) {
    html += '<div class="eq-view-empty"><div class="big">📋</div><div>まだ装備品チェックが行われていません</div><div style="margin-top:6px;font-size:11px">スマホでチェックを開始してください</div></div>';
    return '<div class="eq-view">' + html + '</div>';
  }
  // v1.8.46: 商談モード（opts.hidePrint）では印刷ボタンを出さない
  if (!opts.hidePrint) {
    html += '<div class="eq-print-bar"><button class="eq-print-btn" onclick="printEquipmentSheet(\'' + car.id + '\')">🖨️ お客様用に印刷</button></div>';
  }
  sections.forEach(sec => {
    const items = (sec.items || []).filter(it => !it._disabled);
    if (items.length === 0) return;
    const rows = items.map(it => {
      const v = state[it.id];
      const f = _eqFormatValue(it, v);
      return '<div class="eq-view-row"><span class="label">' + _eqEscape(it.name || '') + '</span><span class="val ' + f.cls + '">' + f.html + '</span></div>';
    }).join('');
    const title = sec.title || '';
    const icon = sec.icon || '';
    const headInner = (icon ? '<span class="icon">' + _eqEscape(icon) + '</span>' : '') + _eqEscape(title);
    html += '<div class="eq-view-cat"><div class="eq-view-cat-head">' + headInner + '</div><div class="eq-view-grid">' + rows + '</div></div>';
  });
  return '<div class="eq-view">' + html + '</div>';
}

// ====================================================================
// お客様用「装備品一覧」印刷シート（v1.8.45: オーバーレイ方式）
// ====================================================================
//
// CarFlow本体の上に position:fixed のオーバーレイとして表示。
// @media print で本体側を隠してこのシートだけ印刷する。
// 「← 戻る」はオーバーレイを閉じるだけ → 確実に元の画面へ戻る。
// 表示項目は appSettings.printEquipment で個別ON/OFFできる。
// 装備項目に登録された説明文（item.sub / item.detail）はリード文として表示。
// ====================================================================

function _getPrintCfg() {
  const ps = (typeof appSettings !== 'undefined' && appSettings.printEquipment) || {};
  return {
    photo:        ps.photo        !== false,
    maker:        ps.maker        !== false,
    grade:        ps.grade        !== false,   // v1.8.75
    year:         ps.year         !== false,
    km:           ps.km           !== false,
    color:        ps.color        !== false,
    size:         ps.size         !== false,
    num:          ps.num          !== false,
    price:        ps.price        !== false,
    totalPrice:   ps.totalPrice   !== false,   // v1.8.75
    bodyPrice:    ps.bodyPrice    !== false,   // v1.8.75
    taxLabel:     ps.taxLabel     !== false,   // v1.8.75
    descriptions: ps.descriptions !== false,
    companyInfo:  ps.companyInfo  !== false,   // v1.8.75
  };
}

// 現在オーバーレイで表示している車両ID（再描画用に保持）
let _psActiveCarId = null;

function printEquipmentSheet(carId) {
  const car = (typeof cars !== 'undefined') ? cars.find(c => c.id === carId) : null;
  if (!car) return;
  const sections = _eqActiveSections(car);
  if (!Array.isArray(sections)) {
    if (typeof showToast === 'function') showToast('先にタスクパターンを選んでください');
    return;
  }
  _psActiveCarId = carId;

  // オーバーレイ要素を確保
  let overlay = document.getElementById('print-sheet-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'print-sheet-overlay';
    overlay.className = 'ps-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = _buildPrintSheetHtml(car);
  overlay.classList.add('open');
  // 本体スクロール抑制
  document.body.style.overflow = 'hidden';
  // 上にスクロール
  overlay.scrollTop = 0;
}

function closePrintSheet() {
  const overlay = document.getElementById('print-sheet-overlay');
  if (overlay) {
    overlay.classList.remove('open');
    overlay.innerHTML = '';
  }
  document.body.style.overflow = '';
  _psActiveCarId = null;
}

function togglePrintOptions() {
  const opt = document.getElementById('ps-options');
  if (!opt) return;
  opt.classList.toggle('open');
}

// チェックボックスから呼ばれる：印刷項目のON/OFFを切替
function setPrintField(field, on) {
  if (typeof appSettings === 'undefined') return;
  if (!appSettings.printEquipment) appSettings.printEquipment = {};
  appSettings.printEquipment[field] = !!on;
  if (typeof saveSettings === 'function') saveSettings();
  // シート本体を再描画（オプション欄は開いたまま）
  if (_psActiveCarId) {
    const car = (typeof cars !== 'undefined') ? cars.find(c => c.id === _psActiveCarId) : null;
    if (car) {
      const overlay = document.getElementById('print-sheet-overlay');
      if (overlay) {
        overlay.innerHTML = _buildPrintSheetHtml(car);
        // オプション欄を開いたまま再描画
        const opt = document.getElementById('ps-options');
        if (opt) opt.classList.add('open');
      }
    }
  }
}

// 印刷シートのHTMLを組み立て
function _buildPrintSheetHtml(car) {
  const sections = _eqActiveSections(car);
  const state = getEquipmentState(car);
  const cfg = _getPrintCfg();

  const isPositive = (item, value) => {
    if (value == null || value === '') return false;
    const t = item.inputType || 'tri';
    if (t === 'check')  return value === true;
    if (t === 'tri')    return value === 'on';
    if (t === 'status') return value === 'ok';
    if (t === 'select') return String(value).length > 0;
    if (t === 'text')   return String(value).trim().length > 0;
    return !!value;
  };
  const formatPositive = (item, value) => {
    const t = item.inputType || 'tri';
    if (t === 'select') return _eqEscape(String(value));
    if (t === 'text')   return _eqEscape(String(value).trim());
    return '';
  };
  // 説明文：sub（短い説明）優先、無ければ detail（長い説明）
  const getDesc = (item) => {
    if (!cfg.descriptions) return '';
    const s = (item.sub || '').trim();
    if (s) return s;
    const d = (item.detail || '').trim();
    if (d) return d;
    return '';
  };

  // ポジティブ項目だけ抽出
  const cats = [];
  (sections || []).forEach(sec => {
    const items = (sec.items || []).filter(it => !it._disabled && isPositive(it, state[it.id]));
    if (items.length === 0) return;
    cats.push({
      title: sec.title || '',
      icon: sec.icon || '',
      rows: items.map(it => ({
        name: it.name || '',
        value: formatPositive(it, state[it.id]),
        desc: getDesc(it),
      })),
    });
  });

  // 車両情報
  const maker = _eqEscape(car.maker || '');
  const model = _eqEscape(car.model || '');
  const grade = _eqEscape(car.grade || '');
  const yr = (typeof fmtYearDisplay === 'function')
    ? fmtYearDisplay((typeof parseYearInput === 'function') ? (parseYearInput(car.year) || car.year) : car.year)
    : (car.year || '');
  const color = _eqEscape(car.color || '');
  const km = car.km != null ? Number(car.km).toLocaleString() + 'km' : '';
  const num = _eqEscape(car.num || '');
  const photo = car.photo || '';
  const today = new Date();
  const dateStr = today.getFullYear() + '年' + (today.getMonth()+1) + '月' + today.getDate() + '日';
  // v1.8.75: 価格（総額・本体それぞれ）と税ラベル
  const pp = (typeof fmtPriceTwo === 'function') ? fmtPriceTwo(car.totalPrice, car.price) : { hasTotal:false, hasBody:false, totalDisp:'', bodyDisp:'' };
  const taxBody  = (typeof getTaxLabel === 'function') ? getTaxLabel('body')  : '税込';
  const taxTotal = (typeof getTaxLabel === 'function') ? getTaxLabel('total') : '税込';
  // v1.8.75: 店舗情報
  const ci = (typeof appSettings !== 'undefined' && appSettings.companyInfo) || {};

  // ツールバー
  let toolbar = '';
  toolbar += '<div class="ps-toolbar no-print">';
  toolbar += '<button class="ps-btn" onclick="closePrintSheet()">← 戻る</button>';
  toolbar += '<button class="ps-btn ps-btn-options" onclick="togglePrintOptions()">⚙️ 表示項目</button>';
  toolbar += '<div class="ps-toolbar-spacer"></div>';
  toolbar += '<button class="ps-btn ps-btn-print" onclick="window.print()">🖨️ 印刷する</button>';
  toolbar += '</div>';

  // オプションパネル
  const chk = (field, label) => '<label><input type="checkbox" ' + (cfg[field] ? 'checked' : '') + ' onchange="setPrintField(\'' + field + '\',this.checked)"> ' + label + '</label>';
  let options = '';
  options += '<div class="ps-options no-print" id="ps-options">';
  options += chk('photo', '写真');
  options += chk('maker', 'メーカー');
  options += chk('grade', 'グレード');
  options += chk('year', '年式');
  options += chk('km', '走行距離');
  options += chk('color', '車体色');
  options += chk('size', 'ボディタイプ');
  options += chk('num', '管理番号');
  options += chk('price', '価格セクション');
  options += chk('totalPrice', '└ 総額');
  options += chk('bodyPrice', '└ 本体');
  options += chk('taxLabel', '└ 税表記');
  options += chk('descriptions', '装備の説明文');
  options += chk('companyInfo', '店舗情報');
  options += '</div>';

  // ヘッダー（車両情報）
  const photoHtml = photo
    ? '<img src="' + _eqEscape(photo) + '" alt="vehicle">'
    : '<div class="ps-photo-fallback">🚗</div>';

  let statsHtml = '';
  if (cfg.year && yr)        statsHtml += '<div class="ps-stat"><span class="ps-stat-lbl">年式</span><span class="ps-stat-val">' + _eqEscape(String(yr)) + '</span></div>';
  if (cfg.km && km)          statsHtml += '<div class="ps-stat"><span class="ps-stat-lbl">走行距離</span><span class="ps-stat-val">' + km + '</span></div>';
  if (cfg.color && color)    statsHtml += '<div class="ps-stat"><span class="ps-stat-lbl">車体色</span><span class="ps-stat-val">' + color + '</span></div>';
  if (cfg.size && car.size)  statsHtml += '<div class="ps-stat"><span class="ps-stat-lbl">ボディ</span><span class="ps-stat-val">' + _eqEscape(car.size) + '</span></div>';

  // v1.8.75: 自社情報ヘッダー（最上部）
  let companyHdr = '';
  if (cfg.companyInfo && (ci.logo || ci.name || ci.phone || ci.address)) {
    const logoBlock = ci.logo ? `<div class="ps-company-logo"><img src="${_eqEscape(ci.logo)}" alt="logo"></div>` : '';
    const nameBlock = ci.name ? `<div class="ps-company-name">${_eqEscape(ci.name)}</div>` : '';
    const lines = [];
    if (ci.address) lines.push(_eqEscape(ci.address));
    const ph = [];
    if (ci.phone) ph.push('TEL: ' + _eqEscape(ci.phone));
    if (ci.email) ph.push('Mail: ' + _eqEscape(ci.email));
    if (ph.length) lines.push(ph.join('　'));
    if (ci.url) lines.push(_eqEscape(ci.url));
    if (ci.note) lines.push(_eqEscape(ci.note));
    const linesHtml = lines.map(l => `<div class="ps-company-line">${l}</div>`).join('');
    companyHdr = `<div class="ps-company-hdr">${logoBlock}<div class="ps-company-info">${nameBlock}${linesHtml}</div></div>`;
  }

  // v1.8.75: 価格ブロック（総額・本体・税表記をそれぞれ独立トグル）
  let priceBlock = '';
  if (cfg.price && (pp.hasTotal || pp.hasBody)) {
    const tlbT = cfg.taxLabel ? `<span class="ps-price-tax">（${taxTotal}）</span>` : '';
    const tlbB = cfg.taxLabel ? `<span class="ps-price-tax">（${taxBody}）</span>` : '';
    if (cfg.totalPrice && pp.hasTotal && cfg.bodyPrice && pp.hasBody) {
      priceBlock = `<div class="ps-price-box"><div class="ps-price-main">総額 ${pp.totalDisp}${tlbT}</div><div class="ps-price-sub">本体 ${pp.bodyDisp}${tlbB}</div></div>`;
    } else if (cfg.totalPrice && pp.hasTotal) {
      priceBlock = `<div class="ps-price-box"><div class="ps-price-main">総額 ${pp.totalDisp}${tlbT}</div></div>`;
    } else if (cfg.bodyPrice && pp.hasBody) {
      priceBlock = `<div class="ps-price-box"><div class="ps-price-main">本体 ${pp.bodyDisp}${tlbB}</div></div>`;
    }
  }

  // 車両ヘッダー
  const titleParts = [];
  if (cfg.maker && maker) titleParts.push(maker);
  if (model) titleParts.push(model);
  if (cfg.grade && grade) titleParts.push(grade);
  const titleStr = titleParts.join(' ');
  let header = '';
  header += '<div class="ps-header">';
  if (cfg.photo) header += '<div class="ps-photo">' + photoHtml + '</div>';
  header += '<div class="ps-info">';
  header += '<div class="ps-title">' + titleStr + '</div>';
  if (cfg.num && num) header += '<div class="ps-num">管理番号: ' + num + '</div>';
  if (statsHtml) header += '<div class="ps-stats">' + statsHtml + '</div>';
  header += priceBlock;
  header += '</div></div>';

  // 装備品一覧
  let catsHtml = '';
  if (cats.length === 0) {
    catsHtml = '<div class="ps-empty">装備品データがありません</div>';
  } else {
    cats.forEach(c => {
      let rowsHtml = '';
      c.rows.forEach(r => {
        const valPart = r.value ? '：<span class="ps-val">' + r.value + '</span>' : '';
        let row = '<div class="ps-row">';
        row += '<div class="ps-row-main"><span class="ps-check">✓</span><span class="ps-name">' + _eqEscape(r.name) + valPart + '</span></div>';
        if (r.desc) row += '<div class="ps-desc">' + _eqEscape(r.desc) + '</div>';
        row += '</div>';
        rowsHtml += row;
      });
      const head = (c.icon ? _eqEscape(c.icon) + ' ' : '') + _eqEscape(c.title);
      catsHtml += '<div class="ps-cat"><div class="ps-cat-head">' + head + '</div><div class="ps-grid">' + rowsHtml + '</div></div>';
    });
  }

  // v1.8.75: フッター（店舗情報があれば連絡先を入れる）
  let footerInfo = '';
  if (cfg.companyInfo && (ci.name || ci.phone || ci.address)) {
    const parts = [];
    if (ci.name) parts.push(_eqEscape(ci.name));
    if (ci.phone) parts.push('TEL: ' + _eqEscape(ci.phone));
    if (ci.address) parts.push(_eqEscape(ci.address));
    footerInfo = `<span class="ps-footer-co">${parts.join(' / ')}</span>`;
  }

  let body = '';
  body += toolbar;
  body += options;
  body += '<div class="ps-content">';
  body += companyHdr; // v1.8.75: 自社情報ヘッダー
  body += header;
  body += '<div class="ps-section-head">装備品一覧</div>';
  body += catsHtml;
  body += `<div class="ps-footer">${footerInfo}<span>発行日: ${dateStr}</span></div>`;
  body += '</div>';

  return body;
}

function toggleEquipmentAccordion(carId, forceOpen) {
  const wrap = document.getElementById('eq-acc-' + carId);
  const btn  = document.getElementById('eq-acc-btn-' + carId);
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

function dealShowEquipment(carId) {
  const body = document.getElementById('deal-popup-body');
  if (!body) return;
  body.setAttribute('data-eq-mode', '1');
  const panel = body.querySelector('.deal-eq-panel');
  if (!panel) return;
  const car = (typeof cars !== 'undefined') ? cars.find(c => c.id === carId) : null;
  if (car) {
    // v1.8.46: 商談中は印刷ボタンを出さない
    panel.innerHTML = renderEquipmentView(car, { backHandler: 'dealHideEquipment()', hidePrint: true });
  }
}

function dealHideEquipment() {
  const body = document.getElementById('deal-popup-body');
  if (!body) return;
  body.setAttribute('data-eq-mode', '0');
  const panel = body.querySelector('.deal-eq-panel');
  if (panel) panel.innerHTML = '';
}

window.getEquipmentState        = getEquipmentState;
window.calcEquipmentProgress    = calcEquipmentProgress;
window.renderEquipmentView      = renderEquipmentView;
window.toggleEquipmentAccordion = toggleEquipmentAccordion;
window.dealShowEquipment        = dealShowEquipment;
window.dealHideEquipment        = dealHideEquipment;
window.printEquipmentSheet      = printEquipmentSheet;
window.closePrintSheet          = closePrintSheet;
window.togglePrintOptions       = togglePrintOptions;
window.setPrintField            = setPrintField;
