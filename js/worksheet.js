// ========================================
// worksheet.js (v1.3.1)
// 中古車作業管理票（再生 / 納車時）の専用フルスクリーン画面
//
// v1.2.1: 各項目のレイアウトを「タイトル + 概要 + ⓘ展開 / 右端に○」に変更。
// v1.2.3: 3層構造（常時：title/sub/detail / 展開：points + 将来figure）。
// v1.3.0: 展開エリアに media（写真・YouTube動画）ギャラリーを追加。
//         クリックでライトボックス表示。データ構造：
//           media: [
//             { type:'image',   url:'...',                caption:'...' },
//             { type:'youtube', videoId:'...', durationSec:..., caption:'...', startSec:0 },
//             { type:'video',   url:'...',                caption:'...' },  // 将来Firebase Storage動画
//           ]
//         このギャラリー＋ライトボックスは v1.3.3 で equipment 側でも再利用予定。
// v1.3.1: data:image/svg+xml の生Unicode を <img>/background-image 両対応にする
//         _wsImgSrc() ヘルパー追加。サムネ・ライトボックスで画像表示が安定。
// v1.3.2: 二重エンコードバグ修正。tasks-def側の SVG data URL は事前エンコード
//         なし（# は # のまま）で書く。_wsImgSrc が encodeURIComponent + ' → %27
//         まで完全にエンコードする。
// v1.3.3: ライトボックス画像が flex container 内で潰れる問題を修正。
//         <img> を <div class="cl-lb-img-wrap"> でラップし、object-fit:contain で
//         自然サイズを保持。
// v1.3.4: SVGに width/height 属性なしだと <img> の自然サイズが 0 になり潰れる
//         問題を修正。tasks-def.js の SVG に width='320' height='200' を追加。
// ========================================

let _wsActiveCarId = null;
let _wsActiveTaskId = null;
let _wsActiveCatIdx = 0;
let _wsExpanded = {}; // { itemId: true } で詳細展開フラグ
// v1.7.14: accordion モードでセクションごとの開閉状態
//   key: section.id, value: true=開 / false or undefined=閉
let _wsOpenSections = {};

// v1.7.13: Phase 3 — 小タスク詳細ページの描画元を ChecklistTemplate に切替（出来る限り）
//   優先順位：
//   (1) 該当タスクが ChecklistTemplate を持っているなら、そこから "task-shaped" 形に変換して使う
//   (2) なければ従来通り REGEN_TASKS / DELIVERY_TASKS から探す
//   phase は引数優先 → 無ければ _wsActiveCarId から推定（regen/delivery）
function _wsGetTaskDef(taskId, phaseHint) {
  let phase = phaseHint || null;
  if (!phase && _wsActiveCarId) {
    const car = cars.find(c => c.id === _wsActiveCarId);
    if (car) phase = (car.col === 'delivery' || car.col === 'done') ? 'delivery' : 'regen';
  }
  // (1) ChecklistTemplate 経由（mode='checklist' なタスク or built-in workflow）
  //   テンプレが存在する以上はそれを正とする（中身が空でも、ユーザの編集結果として尊重）
  if (phase && typeof hasTaskChecklist === 'function' && hasTaskChecklist(taskId, phase)) {
    const tplDef = _wsGetTplAsTaskDef(taskId, phase);
    if (tplDef) return tplDef;
  }
  // (2) フォールバック：REGEN_TASKS / DELIVERY_TASKS
  const all = (typeof REGEN_TASKS !== 'undefined' ? REGEN_TASKS : [])
    .concat(typeof DELIVERY_TASKS !== 'undefined' ? DELIVERY_TASKS : []);
  return all.find(t => t.id === taskId) || null;
}

// ChecklistTemplate（tpl_${phase}_${taskId}）を ws-page が読める "task-shaped" に整形する。
// _disabled の項目は除外、空セクションも除外。help は将来用に残す。
// v1.7.38: 車に「タスクパターン（variant）」が選択されていれば、そのパターンの sections を使う。
//          未選択なら null を返して呼び元で「先に選んでください」を出させる。
function _wsGetTplAsTaskDef(taskId, phase) {
  if (typeof ChecklistTemplates === 'undefined') return null;
  const tplId = (typeof templateIdForTask === 'function')
    ? templateIdForTask(taskId, phase)
    : `tpl_${phase}_${taskId}`;
  const tpl = ChecklistTemplates[tplId];
  if (!tpl) return null;
  // v1.7.38: 車のパターン選択を反映
  let rawSections = null;
  const car = _wsActiveCarId ? cars.find(c => c.id === _wsActiveCarId) : null;
  if (car && typeof window.getActiveTaskSections === 'function') {
    rawSections = window.getActiveTaskSections(car, taskId);
  }
  // フォールバック：パターン未対応の旧テンプレ or car 未確定時 → tpl.sections
  if (!Array.isArray(rawSections)) {
    if (Array.isArray(tpl.sections)) rawSections = tpl.sections;
    else return null;
  }
  const sections = rawSections.map(sec => ({
    id: sec.id,
    title: sec.title || '',
    tab: sec.tab || '', // v1.7.19: 大カテゴリ名
    icon: sec.icon || '',
    items: (sec.items || [])
      .filter(i => !i._disabled)
      .map(i => ({
        id: i.id,
        name: i.name || '',
        sub: i.sub || '',
        detail: i.detail || '',
        help: i.help || '',
        points: Array.isArray(i.points) ? i.points : [],
        media: Array.isArray(i.media) ? i.media : [],
        // v1.7.14: 入力タイプ（check/tri/status/select/text）を引き継ぐ。未指定は check。
        inputType: i.inputType || 'check',
        selectOptions: Array.isArray(i.selectOptions) ? i.selectOptions.slice() : [],
      })),
  })).filter(sec => sec.items.length > 0);
  return {
    id: taskId,
    name: tpl.name || taskId,
    icon: tpl.icon || '📋',
    type: 'workflow',
    sections,
  };
}

// v1.7.13: 車の現在フェーズで bucket 判定する。
//   旧来は taskId.startsWith('d_') の prefix 判定だったが、custom task は同じ ID が
//   両 phase に存在し得るため誤って regen 側を見続けてしまう。car.col で判定すれば、
//   built-in / custom どちらでも安全。
//   さらに「📝 詳細」スイッチで toggle → checklist に昇格した時、旧 boolean state
//   (true/false) が残っていると state[itemId] への代入が無視されるので、ここで
//   object に変換してから返す（破壊的書き換えはこの 1 点のみ）。
function _wsGetTaskState(car, taskId) {
  const isDelivery = car && (car.col === 'delivery' || car.col === 'done');
  const bucket = isDelivery ? 'deliveryTasks' : 'regenTasks';
  if (!car[bucket]) car[bucket] = {};
  if (car[bucket][taskId] != null && typeof car[bucket][taskId] !== 'object') {
    car[bucket][taskId] = {};
  }
  if (!car[bucket][taskId]) car[bucket][taskId] = {};
  // v1.7.17: t_equip は旧来 car.equipment に値が保存されていたので、
  //          初回アクセス時に car.regenTasks.t_equip にコピーする（ワンタイム移行）。
  //          以降は ws-page 側が直接 regenTasks.t_equip を更新する。
  // v1.7.18: ワンタイム移行を _migrated フラグで管理。
  //          以前は毎回呼ばれるたびに「dst に無いキーは car.equipment からコピー」
  //          していたため、tri/select を「未」に戻して state からキーを削除しても
  //          次回描画時に復活してしまう不具合があった（ナビ・バックカメラ等）。
  //          既存データ保護のため「if not in dst」セマンティクスは残す。
  if (taskId === 't_equip' && car.equipment && typeof car.equipment === 'object') {
    const dst = car[bucket][taskId];
    if (!dst._migrated) {
      Object.keys(car.equipment).forEach(k => {
        if (k.startsWith('_')) return; // _completed / _updatedAt はスキップ
        if (!(k in dst)) dst[k] = car.equipment[k]; // 既存の編集を上書きしない
      });
      dst._migrated = true;
      if (window.saveCarById) saveCarById(car.id);
    }
  }
  return car[bucket][taskId];
}

function _wsAllItems(taskDef) {
  const out = [];
  (taskDef.sections || []).forEach(sec => {
    (sec.items || []).forEach(item => out.push({ section: sec, item }));
  });
  return out;
}

function _wsCalcProgress(car, taskDef) {
  const state = _wsGetTaskState(car, taskDef.id);
  const all = _wsAllItems(taskDef);
  const total = all.length;
  let done = 0;
  all.forEach(({ item }) => { if (state[item.id]) done++; });
  return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
}

// ---------------------------------------------------------------
// 開閉
// ---------------------------------------------------------------
function openWorksheet(carId, taskId) {
  const car = cars.find(c => c.id === carId);
  if (!car) return;
  // v1.7.13: phase を明示的に推定して _wsGetTaskDef に渡す（ChecklistTemplate ID 解決用）
  const phase = (car.col === 'delivery' || car.col === 'done') ? 'delivery' : 'regen';
  // v1.7.38: パターン未選択チェック（パターン2つ以上のテンプレで未選択なら開けない）
  if (typeof ChecklistTemplates !== 'undefined') {
    const tplId = (taskId === 't_equip') ? 'tpl_equipment' : `tpl_${phase}_${taskId}`;
    const tpl = ChecklistTemplates[tplId];
    if (tpl && Array.isArray(tpl.variants) && tpl.variants.length > 1) {
      const sel = (typeof window.getCarTaskVariantId === 'function')
        ? window.getCarTaskVariantId(car, taskId) : null;
      if (!sel) {
        if (typeof showToast === 'function') {
          showToast('先にタスクパターンを選んでください');
        } else {
          alert('先にタスクパターンを選んでください');
        }
        return;
      }
    }
  }
  _wsActiveCarId = carId;
  // v1.7.38: タスク取得（_wsGetTaskDef は _wsActiveCarId を参照するため、設定後に呼ぶ）
  const taskDef = _wsGetTaskDef(taskId, phase);
  if (!taskDef) {
    _wsActiveCarId = null;
    return;
  }
  _wsActiveTaskId = taskId;
  _wsActiveCatIdx = 0;
  _wsExpanded = {};
  // v1.7.14: accordion 用初期化（最初のセクションだけ開く）
  _wsOpenSections = {};
  const firstSec = (taskDef.sections || [])[0];
  if (firstSec && firstSec.id) _wsOpenSections[firstSec.id] = true;
  _renderWorksheetPage(car, taskDef);
  document.getElementById('ws-page').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeWorksheet() {
  document.getElementById('ws-page').classList.remove('open');
  document.body.style.overflow = '';
  const targetCarId = _wsActiveCarId;
  _wsActiveCarId = null;
  _wsActiveTaskId = null;
  _wsExpanded = {};
  if (targetCarId) {
    const car = cars.find(c => c.id === targetCarId);
    if (car && typeof activeDetailCarId !== 'undefined' && activeDetailCarId === targetCarId) {
      const dbody = document.getElementById('detail-body');
      if (dbody && typeof renderDetailBody === 'function') {
        try { renderDetailBody(car); } catch(e) {}
      }
    }
  }
  if (typeof renderAll === 'function') renderAll();
}

function markWorksheetComplete() {
  if (!_wsActiveCarId || !_wsActiveTaskId) return;
  const car = cars.find(c => c.id === _wsActiveCarId);
  const taskDef = _wsGetTaskDef(_wsActiveTaskId);
  if (!car || !taskDef) return;
  const p = _wsCalcProgress(car, taskDef);
  if (p.done < p.total) {
    if (typeof showToast === 'function') showToast(`あと ${p.total - p.done} 項目残っています`);
    return;
  }
  if (typeof addLog === 'function') addLog(car.id, `${taskDef.name}を完了`);
  if (typeof showToast === 'function') showToast(`✓ ${taskDef.name}を完了にしました`);
  closeWorksheet();
}

// ---------------------------------------------------------------
// レンダリング
// ---------------------------------------------------------------
function _renderWorksheetPage(car, taskDef) {
  document.getElementById('ws-title').textContent = `${taskDef.icon || ''} ${taskDef.name}`;
  const thumb = document.getElementById('ws-vehicle-thumb');
  if (thumb) {
    if (car.photo) {
      thumb.style.backgroundImage = `url("${car.photo}")`;
      thumb.textContent = '';
    } else {
      thumb.style.backgroundImage = '';
      thumb.textContent = (typeof carEmoji === 'function') ? carEmoji(car.size) : '🚗';
    }
  }
  document.getElementById('ws-vehicle-name').textContent = `${car.maker || ''} ${car.model || ''}`.trim();
  const ymd = [];
  if (car.year) ymd.push(car.year);
  if (car.color) ymd.push(car.color);
  if (car.km != null) ymd.push(`${Number(car.km).toLocaleString()}km`);
  document.getElementById('ws-vehicle-sub').textContent = ymd.join(' ・ ');

  _wsUpdateProgressBadge();

  // v1.7.19: 中身の構造で見た目が決まる（navigationStyle 廃止）
  //   - 大カテゴリ（tab）が 2 種類以上 → タブ表示
  //   - 大カテゴリが 1 種類（または無し）→ タブ非表示、セクションだけ並べる
  //   - 中カテゴリ（title）あり → アコーディオン
  //   - 中カテゴリ（title）が空 → 帯なしフラット
  const tabGroups = _wsBuildTabGroups(taskDef);
  const showTabs = tabGroups.length > 1;

  const wsPage = document.getElementById('ws-page');
  if (wsPage) wsPage.setAttribute('data-tabs', showTabs ? '1' : '0');

  const tabs = document.getElementById('ws-tabs');
  if (showTabs) {
    if (_wsActiveCatIdx >= tabGroups.length) _wsActiveCatIdx = 0;
    tabs.innerHTML = tabGroups.map((grp, i) => {
      const total = grp.sections.reduce((a, s) => a + (s.items || []).length, 0);
      const filled = grp.sections.reduce((a, s) => a + _wsCountSectionFilled(car, s), 0);
      return `<button class="ws-tab ${i === _wsActiveCatIdx ? 'active' : ''}" onclick="switchWorksheetTab(${i})">
        <span class="ws-tab-label">${escapeHtml(grp.tab || '(無題)')}</span>
        <span class="ws-tab-count">${filled}/${total}</span>
      </button>`;
    }).join('');
    const activeGroup = tabGroups[_wsActiveCatIdx] || tabGroups[0];
    _renderWsSections(car, taskDef, activeGroup ? activeGroup.sections : []);
  } else {
    tabs.innerHTML = '';
    const allSections = (tabGroups[0] && tabGroups[0].sections) || [];
    _renderWsSections(car, taskDef, allSections);
  }

  _refreshWsCompleteBtn(car, taskDef);
  _refreshWsNavBtns(taskDef, showTabs ? tabGroups.length : 0);
}

// v1.7.19: sections を「大カテゴリ（tab）」でグループ化。
//   返り値: [{ tab: '01 外装', sections: [...] }, ...]
//   tab が空文字のものは「(タブなし)」として 1 つにまとまる。
function _wsBuildTabGroups(taskDef) {
  const sections = (taskDef && taskDef.sections) || [];
  const order = [];
  const map = new Map();
  sections.forEach(sec => {
    const key = sec.tab || '';
    if (!map.has(key)) {
      map.set(key, { tab: key, sections: [] });
      order.push(key);
    }
    map.get(key).sections.push(sec);
  });
  return order.map(k => map.get(k));
}

// v1.7.19: 渡された sections を順に描画する統一レンダラー。
//   - section.title あり → アコーディオン（▼で開閉、開いた中だけ描画）
//   - section.title なし → 帯なしフラット（常に項目だけ並べる）
function _renderWsSections(car, taskDef, sections) {
  const body = document.getElementById('ws-body-inner');
  if (!body) return;
  if (!sections || sections.length === 0) {
    body.innerHTML = '<div class="ws-empty">項目がまだ登録されていません</div>';
    return;
  }
  body.innerHTML = sections.map((sec, sIdx) => {
    const hasTitle = !!(sec.title && sec.title.trim());
    const filled = _wsCountSectionFilled(car, sec);
    const total = (sec.items || []).length;
    const isOpen = hasTitle ? !!_wsOpenSections[sec.id] : true;
    const itemsHtml = isOpen
      ? (sec.items || []).map(item => _renderWsItemHtml(car, taskDef, item)).join('')
      : '';

    if (!hasTitle) {
      // 中カテゴリ名なし → フラット（帯なし）
      return `
        <div class="ws-section ws-section-flat" data-section-id="${escapeHtml(sec.id)}" data-open="1">
          <div class="ws-section-body">${itemsHtml}</div>
        </div>`;
    }

    // 中カテゴリ名あり → アコーディオン
    return `
      <div class="ws-section ws-section-accordion" data-section-id="${escapeHtml(sec.id)}" data-open="${isOpen ? 1 : 0}">
        <div class="ws-section-head" onclick="toggleWsSection('${escapeHtml(sec.id)}')">
          ${sec.icon ? `<span class="ws-section-icon">${escapeHtml(sec.icon)}</span>` : ''}
          <span class="ws-section-num">${String(sIdx + 1).padStart(2, '0')}</span>
          <span class="ws-section-title">${escapeHtml(sec.title)}</span>
          <span class="ws-section-count">${filled}/${total}</span>
          <span class="ws-section-toggle">${isOpen ? '▲' : '▼'}</span>
        </div>
        <div class="ws-section-body">${itemsHtml}</div>
      </div>`;
  }).join('');
}

// v1.7.19: アコーディオンの開閉トグル。再描画は現在のタブ内だけで OK。
function toggleWsSection(secId) {
  if (!secId) return;
  _wsOpenSections[secId] = !_wsOpenSections[secId];
  const car = cars.find(c => c.id === _wsActiveCarId);
  const taskDef = _wsGetTaskDef(_wsActiveTaskId);
  if (!car || !taskDef) return;
  const groups = _wsBuildTabGroups(taskDef);
  const showTabs = groups.length > 1;
  const targetSections = showTabs
    ? ((groups[_wsActiveCatIdx] || groups[0]).sections)
    : ((groups[0] && groups[0].sections) || []);
  _renderWsSections(car, taskDef, targetSections);
}

// v1.7.19: 旧 _renderWorksheetSectionItems は廃止（_renderWsSections に統合）。

// v1.7.14: 入力タイプ（check/tri/status/select/text）に応じた1項目分のHTML
function _renderWsItemHtml(car, taskDef, item) {
  const state = _wsGetTaskState(car, taskDef.id);
  const value = state[item.id];
  const inputType = item.inputType || 'check';

  // 「完了相当か（filled）」の判定 — 現状は truthy 判定で全タイプ統一
  const filled = !!value;
  const expanded = !!_wsExpanded[item.id];
  const validPoints = (item.points || []).filter(p => p);
  const validMedia = (item.media || []).filter(m => m && m.type);
  const hasExpandable = validPoints.length > 0 || validMedia.length > 0;

  const subHtml = item.sub
    ? `<div class="ws-item-sub">${escapeHtml(item.sub)}</div>`
    : '';
  const detailHtml = item.detail
    ? `<div class="ws-item-detail-summary">${escapeHtml(item.detail)}</div>`
    : '';
  const pointsHtml = validPoints.length
    ? `<div class="ws-item-points-label">注意点</div>
       <ul>${validPoints.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
    : '';
  const mediaHtml = validMedia.length ? _wsBuildMediaGalleryHtml(item.id, validMedia) : '';
  const expandHtml = hasExpandable
    ? `<div class="ws-item-expand ${expanded ? 'open' : ''}" id="ws-detail-${item.id}">
         ${pointsHtml}
         ${mediaHtml}
       </div>`
    : '';
  const infoBtn = hasExpandable
    ? `<button class="ws-info-btn ${expanded ? 'open' : ''}" onclick="toggleWsExpand('${item.id}')" aria-label="さらに詳しく">ⓘ</button>`
    : '';

  // 入力部 ＆ オプション行
  let controlHtml = '';
  let extraRow = '';
  const itemIdAttr = escapeHtml(item.id);

  if (inputType === 'check') {
    controlHtml = `
      <button class="ws-item-chk-btn" onclick="toggleWsItem('${itemIdAttr}')" aria-label="完了切替">
        <div class="ws-item-chk">${filled ? '✓' : ''}</div>
      </button>`;
  } else if (inputType === 'tri') {
    const cur = (value === 'on' || value === 'off') ? value : 'none';
    const states = ['none', 'on', 'off'];
    const labels = { none: '未', on: 'あり', off: 'なし' };
    controlHtml = `
      <div class="ws-tri" onclick="cycleWsTri('${itemIdAttr}')">
        ${states.map(s => `<span class="ws-tri-btn" data-state="${s}" data-active="${s === cur ? 1 : 0}">${labels[s]}</span>`).join('')}
      </div>`;
  } else if (inputType === 'status') {
    const cur = (value === 'ok' || value === 'ng') ? value : 'none';
    const states = ['none', 'ok', 'ng'];
    const labels = { none: '未確認', ok: 'OK', ng: 'NG' };
    controlHtml = `
      <div class="ws-status" onclick="cycleWsStatus('${itemIdAttr}')">
        ${states.map(s => `<span class="ws-status-btn" data-state="${s}" data-active="${s === cur ? 1 : 0}">${labels[s]}</span>`).join('')}
      </div>`;
  } else if (inputType === 'select') {
    // v1.7.18: select も他の単純チェックと同様に行の右にインライン表示
    const opts = Array.isArray(item.selectOptions) ? item.selectOptions : [];
    controlHtml = `
      <div class="ws-select-row" data-item="${itemIdAttr}">
        ${opts.map(opt =>
          `<button type="button" class="ws-select-btn" data-active="${value === opt ? 1 : 0}"
              data-item="${itemIdAttr}" data-opt="${escapeHtml(opt)}"
              onclick="onWsSelectClick(this)">${escapeHtml(opt)}</button>`
        ).join('')}
      </div>`;
  } else if (inputType === 'text') {
    // v1.7.18: text も行の右にインライン表示（一行テキストボックス）
    controlHtml = `
      <div class="ws-text-row">
        <input type="text" class="ws-text-input" placeholder="記入"
          value="${escapeHtml(value || '')}"
          oninput="onWsTextInput('${itemIdAttr}', this.value)">
      </div>`;
  }

  // v1.7.18: select / text もインライン化したため、縦並びクラスは廃止
  const verticalCls = '';

  return `
    <div class="ws-item${verticalCls} ${filled ? 'done' : ''}" data-id="${item.id}" data-input-type="${inputType}">
      <div class="ws-item-row">
        <div class="ws-item-body">
          <div class="ws-item-name">${escapeHtml(item.name || '')}</div>
          ${subHtml}
          ${detailHtml}
        </div>
        ${infoBtn}
        ${controlHtml}
      </div>
      ${extraRow}
      ${expandHtml}
    </div>`;
}

// ---------------------------------------------------------------
// v1.3.0: メディアギャラリー＋ライトボックス
// ---------------------------------------------------------------

// 表示するメディア配列を window に保持（ライトボックスから参照）
let _wsMediaRegistry = {}; // { itemId: [media,...] }

// data:image/svg+xml の生Unicode を <img src> でも CSS background-image でも
// 確実に動く形式（percent-encoded）に正規化する。
// encodeURIComponent は ' をエンコードしないため、CSS url('...') 内で壊れる。
// 明示的に %27 に変換することで、CSSとHTMLの両方で安全に使える。
// 通常の http(s) URL や既にエンコード済みの data URL はそのまま返す。
function _wsImgSrc(url) {
  if (typeof url !== 'string' || !url) return '';
  const rawPrefix = 'data:image/svg+xml;utf8,';
  const altPrefix = 'data:image/svg+xml,';
  function enc(svg) {
    return encodeURIComponent(svg).replace(/'/g, '%27');
  }
  if (url.startsWith(rawPrefix)) {
    return 'data:image/svg+xml;charset=utf-8,' + enc(url.slice(rawPrefix.length));
  }
  // 生SVGがそのまま入っている場合（"<svg" を含む）も同様に変換
  if (url.startsWith(altPrefix) && url.indexOf('<svg') !== -1) {
    return 'data:image/svg+xml;charset=utf-8,' + enc(url.slice(altPrefix.length));
  }
  return url;
}

function _wsBuildMediaGalleryHtml(itemId, mediaList) {
  _wsMediaRegistry[itemId] = mediaList;
  const tiles = mediaList.map((m, idx) => {
    const cap = escapeHtml(m.caption || '');
    if (m.type === 'youtube' && m.videoId) {
      const thumbUrl = `https://img.youtube.com/vi/${m.videoId}/hqdefault.jpg`;
      const dur = (typeof m.durationSec === 'number' && m.durationSec > 0) ? _wsFormatDuration(m.durationSec) : '';
      return `
        <button type="button" class="cl-media-tile" onclick="openWsLightbox('${itemId}', ${idx})" aria-label="動画を再生">
          <div class="cl-media-thumb thumb-video" style="background-image:url('${thumbUrl}')">
            <div class="yt-badge">YouTube</div>
            <div class="play-icon"></div>
            ${dur ? `<div class="duration">${escapeHtml(dur)}</div>` : ''}
          </div>
          <div class="cl-media-caption">${cap}</div>
        </button>`;
    }
    if (m.type === 'image' && m.url) {
      // CSS background で表示。data:image/svg+xml の生Unicode は percent-encode して
      // <img>でも background-image でも動く形式にする（_wsImgSrc）
      const normalized = _wsImgSrc(m.url);
      const safeUrl = normalized.replace(/'/g, "\\'");
      return `
        <button type="button" class="cl-media-tile" onclick="openWsLightbox('${itemId}', ${idx})" aria-label="写真を拡大">
          <div class="cl-media-thumb thumb-image" style="background-image:url('${safeUrl}')"></div>
          <div class="cl-media-caption">${cap}</div>
        </button>`;
    }
    if (m.type === 'video' && m.url) {
      // 将来の Firebase Storage 動画用（v1.5.4+）
      return `
        <button type="button" class="cl-media-tile" onclick="openWsLightbox('${itemId}', ${idx})" aria-label="動画を再生">
          <div class="cl-media-thumb thumb-video">
            <div class="play-icon"></div>
          </div>
          <div class="cl-media-caption">${cap}</div>
        </button>`;
    }
    return '';
  }).join('');
  return `
    <div class="cl-media">
      <div class="cl-media-label">写真・動画（${mediaList.length}件）</div>
      <div class="cl-media-gallery">${tiles}</div>
    </div>`;
}

function _wsFormatDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function _wsEnsureLightboxEl() {
  let lb = document.getElementById('ws-lightbox');
  if (lb) return lb;
  lb = document.createElement('div');
  lb.id = 'ws-lightbox';
  lb.className = 'cl-lightbox';
  lb.innerHTML = `
    <button type="button" class="cl-lightbox-close" onclick="closeWsLightbox()" aria-label="閉じる">×</button>
    <div class="cl-lightbox-content" id="ws-lightbox-content"></div>
    <div class="cl-lightbox-caption" id="ws-lightbox-caption"></div>
  `;
  document.body.appendChild(lb);
  // 背景クリックで閉じる
  lb.addEventListener('click', e => {
    if (e.target === lb) closeWsLightbox();
  });
  // Esc キーで閉じる
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && lb.classList.contains('open')) closeWsLightbox();
  });
  return lb;
}

function openWsLightbox(itemId, idx) {
  const list = _wsMediaRegistry[itemId];
  if (!list) return;
  const m = list[idx];
  if (!m) return;
  const lb = _wsEnsureLightboxEl();
  const content = document.getElementById('ws-lightbox-content');
  const caption = document.getElementById('ws-lightbox-caption');
  if (m.type === 'youtube' && m.videoId) {
    const start = (typeof m.startSec === 'number' && m.startSec > 0) ? `&start=${m.startSec}` : '';
    content.innerHTML = `<div class="cl-lb-yt"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(m.videoId)}?autoplay=1&rel=0${start}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
  } else if (m.type === 'image' && m.url) {
    const normalized = _wsImgSrc(m.url);
    const safeUrl = normalized.replace(/"/g, '&quot;');
    // flex container 内で <img> が潰れることがあるため div でラップ
    content.innerHTML = `<div class="cl-lb-img-wrap"><img class="cl-lb-img" src="${safeUrl}" alt=""></div>`;
  } else if (m.type === 'video' && m.url) {
    const safeUrl = String(m.url).replace(/"/g, '&quot;');
    content.innerHTML = `<video class="cl-lb-video" src="${safeUrl}" controls autoplay></video>`;
  } else {
    content.innerHTML = '';
  }
  caption.textContent = m.caption || '';
  lb.classList.add('open');
}

function closeWsLightbox() {
  const lb = document.getElementById('ws-lightbox');
  if (!lb) return;
  lb.classList.remove('open');
  const content = document.getElementById('ws-lightbox-content');
  const caption = document.getElementById('ws-lightbox-caption');
  if (content) content.innerHTML = ''; // YouTubeを止める
  if (caption) caption.textContent = '';
}

// v1.7.19: タブ切替（大カテゴリ index ベース）
function switchWorksheetTab(idx) {
  _wsActiveCatIdx = idx;
  const car = cars.find(c => c.id === _wsActiveCarId);
  const taskDef = _wsGetTaskDef(_wsActiveTaskId);
  if (!car || !taskDef) return;
  document.querySelectorAll('#ws-tabs .ws-tab').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
  const groups = _wsBuildTabGroups(taskDef);
  const target = (groups[idx] && groups[idx].sections) || [];
  // タブ切替時はそのタブの中の最初のアコーディオン（titleあり）を開く
  _wsOpenSections = {};
  const firstWithTitle = target.find(s => s.title && s.title.trim());
  if (firstWithTitle) _wsOpenSections[firstWithTitle.id] = true;
  _renderWsSections(car, taskDef, target);
  _refreshWsNavBtns(taskDef, groups.length);
  const inner = document.getElementById('ws-body-inner');
  if (inner && inner.parentElement) inner.parentElement.scrollTop = 0;
}

function toggleWsItem(itemId) {
  _wsSetItemValue(itemId, (cur) => !cur);
}

// v1.7.14: tri (なし/あり/未) 巡回
function cycleWsTri(itemId) {
  _wsSetItemValue(itemId, (cur) => {
    if (cur === 'on') return 'off';
    if (cur === 'off') return null; // none
    return 'on';
  });
}
window.cycleWsTri = cycleWsTri;

// v1.7.14: status (未/OK/NG) 巡回
function cycleWsStatus(itemId) {
  _wsSetItemValue(itemId, (cur) => {
    if (cur === 'ok') return 'ng';
    if (cur === 'ng') return null;
    return 'ok';
  });
}
window.cycleWsStatus = cycleWsStatus;

// v1.7.14: select クリック（同じ選択肢を再クリックすると解除）
function onWsSelectClick(el) {
  if (!el) return;
  const itemId = el.getAttribute('data-item');
  const opt = el.getAttribute('data-opt');
  if (!itemId || opt == null) return;
  _wsSetItemValue(itemId, (cur) => (cur === opt ? null : opt));
}
window.onWsSelectClick = onWsSelectClick;

// v1.7.14: text 入力（debounce 不要、入力ごとに保存）
// v1.8.0: 項目単位の保存（saveCarField）に切替。同時編集に強くなる。
let _wsTextSaveTimers = {};
function onWsTextInput(itemId, value) {
  const car = cars.find(c => c.id === _wsActiveCarId);
  const taskDef = _wsGetTaskDef(_wsActiveTaskId);
  if (!car || !taskDef) return;
  const state = _wsGetTaskState(car, taskDef.id);
  const v = (value == null) ? null : String(value);
  if (v && v.length > 0) state[itemId] = v;
  else delete state[itemId];
  // 行の filled 表示だけ即時更新
  const row = document.querySelector(`.ws-item[data-id="${itemId}"]`);
  if (row) row.classList.toggle('done', !!state[itemId]);
  // 連打入力で書き込みが荒れないよう 400ms デバウンス
  if (_wsTextSaveTimers[itemId]) clearTimeout(_wsTextSaveTimers[itemId]);
  _wsTextSaveTimers[itemId] = setTimeout(() => {
    const isDelivery = car && (car.col === 'delivery' || car.col === 'done');
    const bucket = isDelivery ? 'deliveryTasks' : 'regenTasks';
    const writeVal = (v && v.length > 0) ? v : null;
    if (window.saveCarField) {
      window.saveCarField(car.id, [bucket, taskDef.id, itemId], writeVal);
    } else if (window.saveCarById) {
      saveCarById(car.id);
    }
    _wsRefreshSectionCounts(car, taskDef);
    _wsUpdateProgressBadge();
    _refreshWsCompleteBtn(car, taskDef);
    // v1.8.49: kanban 側もデバウンス完了タイミングで更新
    if (typeof renderAll === 'function') renderAll();
    delete _wsTextSaveTimers[itemId];
  }, 400);
}
window.onWsTextInput = onWsTextInput;

// v1.7.14: 値変更を一元化（updater は現在値を受け取り新値を返す関数。null/false/'' は未入力扱い）
// v1.8.0: 項目単位保存（saveCarField）。他のスタッフが同じ車・別項目を触っても消えない。
function _wsSetItemValue(itemId, updater) {
  const car = cars.find(c => c.id === _wsActiveCarId);
  const taskDef = _wsGetTaskDef(_wsActiveTaskId);
  if (!car || !taskDef) return;
  const state = _wsGetTaskState(car, taskDef.id);
  const cur = state[itemId];
  const next = updater(cur);
  let writeVal;
  if (next === null || next === undefined || next === '' || next === false) {
    delete state[itemId];
    writeVal = null;
  } else {
    state[itemId] = next;
    writeVal = next;
  }
  const isDelivery = car && (car.col === 'delivery' || car.col === 'done');
  const bucket = isDelivery ? 'deliveryTasks' : 'regenTasks';
  if (window.saveCarField) {
    window.saveCarField(car.id, [bucket, taskDef.id, itemId], writeVal);
  } else if (window.saveCarById) {
    saveCarById(car.id);
  }

  // 該当行を再描画（入力タイプによってボタンの active 状態などが変わるので itemHtml 再生成）
  const row = document.querySelector(`.ws-item[data-id="${itemId}"]`);
  if (row) {
    const item = _wsFindItem(taskDef, itemId);
    if (item) {
      const tmp = document.createElement('div');
      tmp.innerHTML = _renderWsItemHtml(car, taskDef, item);
      const newRow = tmp.firstElementChild;
      if (newRow) row.replaceWith(newRow);
    }
  }
  _wsRefreshSectionCounts(car, taskDef);
  _wsUpdateProgressBadge();
  _refreshWsCompleteBtn(car, taskDef);
  // v1.8.49: 背面の kanban / 進捗% / dot もリアルタイムに更新（閉じる時の renderAll を待たない）
  if (typeof renderAll === 'function') renderAll();
}

function _wsFindItem(taskDef, itemId) {
  const secs = taskDef.sections || [];
  for (let i = 0; i < secs.length; i++) {
    const it = (secs[i].items || []).find(x => x.id === itemId);
    if (it) return it;
  }
  return null;
}

// v1.7.19: 大カテゴリタブの件数 + 中カテゴリ（アコーディオン帯）の件数を更新
function _wsRefreshSectionCounts(car, taskDef) {
  const groups = _wsBuildTabGroups(taskDef);
  const showTabs = groups.length > 1;
  if (showTabs) {
    groups.forEach((grp, i) => {
      const tab = document.querySelectorAll('#ws-tabs .ws-tab')[i];
      if (!tab) return;
      const total = grp.sections.reduce((a, s) => a + (s.items || []).length, 0);
      const filled = grp.sections.reduce((a, s) => a + _wsCountSectionFilled(car, s), 0);
      const cnt = tab.querySelector('.ws-tab-count');
      if (cnt) cnt.textContent = `${filled}/${total}`;
    });
  }
  // 中カテゴリ（アコーディオン帯）の件数も更新
  (taskDef.sections || []).forEach(sec => {
    const head = document.querySelector(`.ws-section[data-section-id="${CSS.escape(sec.id)}"] .ws-section-count`);
    if (head) head.textContent = `${_wsCountSectionFilled(car, sec)}/${(sec.items || []).length}`;
  });
}

// v1.2.1: 詳細を展開／折りたたみ
function toggleWsExpand(itemId) {
  _wsExpanded[itemId] = !_wsExpanded[itemId];
  const detail = document.getElementById(`ws-detail-${itemId}`);
  if (detail) detail.classList.toggle('open', !!_wsExpanded[itemId]);
  const btn = document.querySelector(`.ws-item[data-id="${itemId}"] .ws-info-btn`);
  if (btn) btn.classList.toggle('open', !!_wsExpanded[itemId]);
}

function _wsCountSectionFilled(car, sec) {
  const state = _wsGetTaskState(car, _wsActiveTaskId);
  return (sec.items || []).filter(i => state[i.id]).length;
}

function _wsUpdateProgressBadge() {
  const car = cars.find(c => c.id === _wsActiveCarId);
  const taskDef = _wsGetTaskDef(_wsActiveTaskId);
  if (!car || !taskDef) return;
  const p = _wsCalcProgress(car, taskDef);
  const badge = document.getElementById('ws-progress-badge');
  if (badge) badge.textContent = `${p.done}/${p.total}`;
  const bar = document.getElementById('ws-progress-fill');
  if (bar) bar.style.width = `${p.pct}%`;
}

function _refreshWsCompleteBtn(car, taskDef) {
  const btn = document.getElementById('ws-complete-btn');
  if (!btn) return;
  const p = _wsCalcProgress(car, taskDef);
  const allDone = (p.total > 0 && p.done >= p.total);
  if (allDone) {
    btn.disabled = false;
    btn.classList.remove('disabled');
    btn.textContent = `✓ 完了する（全${p.total}項目）`;
  } else {
    btn.disabled = true;
    btn.classList.add('disabled');
    const remain = p.total - p.done;
    btn.textContent = `あと ${remain} 項目`;
  }
}

// v1.7.19: 第2引数は「タブグループ数」（タブが出ない場合は 0 や 1）
function _refreshWsNavBtns(taskDef, tabGroupsCount) {
  const prev = document.getElementById('ws-prev-btn');
  const next = document.getElementById('ws-next-btn');
  const total = (typeof tabGroupsCount === 'number') ? tabGroupsCount : 0;
  // タブ表示が無いとき（大カテゴリ 0 または 1）は前/次ボタンを隠す
  const hide = total <= 1;
  if (prev) {
    prev.style.display = hide ? 'none' : '';
    prev.disabled = (_wsActiveCatIdx <= 0);
  }
  if (next) {
    next.style.display = hide ? 'none' : '';
    next.disabled = (_wsActiveCatIdx >= total - 1);
  }
}

function wsPrevTab() {
  if (_wsActiveCatIdx > 0) switchWorksheetTab(_wsActiveCatIdx - 1);
}
function wsNextTab() {
  const taskDef = _wsGetTaskDef(_wsActiveTaskId);
  if (!taskDef) return;
  // v1.7.19: 大カテゴリのタブグループ数で判定
  const total = _wsBuildTabGroups(taskDef).length;
  if (_wsActiveCatIdx < total - 1) switchWorksheetTab(_wsActiveCatIdx + 1);
}

// v1.8.0: リアルタイム同期用 — 「今この車の小タスク詳細を開いているか」を外部公開
window.getWsActiveCarId = function () { return _wsActiveCarId; };
