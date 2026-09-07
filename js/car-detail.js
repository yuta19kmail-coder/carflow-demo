// ========================================
// car-detail.js
// 車両詳細モーダルの表示と操作
// v0.8.9: その他はタスク非表示・メモ中心
// v0.9.0: 削除ボタンは編集モーダル側に移動（誤タップ防止）
// v1.7.38: 各タスク行に「タスクパターン」選択UIを追加（パターン2つ以上のテンプレ）
// v2.4.4: 登録内容バー（納車準備フェーズ用）の表示関数を追加
// ========================================

// v2.4.4: 登録内容バー（カード詳細「車両編集」ボタンの下に常時表示）
//   納車準備/納車完了フェーズの車両だけ表示。
//   reg_pattern（必須・select）でカラーバー、reg_*（tri）の「あり」項目をタグで列挙。
//   未設定なら赤めの警告バー。
function _renderRegistrationBar(car) {
  if (!car) return '';
  if (car.col !== 'delivery' && car.col !== 'done') return '';

  // 値の取得（cars/archivedCars いずれも car.deliveryTasks.d_register に保存）
  const data = (car.deliveryTasks && car.deliveryTasks.d_register) || {};
  const pattern = data.reg_pattern || '';

  // 5パターン用カラー（順番固定）
  const PATTERN_COLOR = {
    '中古新規': { bg: '#3b82f6', short: '中' },   // 青
    '継続移転': { bg: '#22c55e', short: '継' },   // 緑
    '移転継続': { bg: '#8b5cf6', short: '移' },   // 紫
    '名変':     { bg: '#f59e0b', short: '名' },   // オレンジ
    '予備検':   { bg: '#ef4444', short: '予' },   // 赤
  };

  // 未設定 → 赤め警告（v2.20.1: 「未選択」のときだけ警告。設定済みなら未知のパターン名でもバーを出す）
  if (!pattern) {
    return `
      <div class="detail-reg-bar detail-reg-bar-empty">
        <div class="detail-reg-bar-empty-head">${ic('warn','⚠️',14)} 登録内容 未設定</div>
        <div class="detail-reg-bar-empty-sub">納車準備の「${ic('clipboard','📋',16)} 登録内容設定」タスクから入力してください（書類フローに直結します）</div>
      </div>`;
  }

  // v2.20.1: 登録パターンの選択肢をカスタム/追記（例「予備検→行政書士」）した場合に
  //   5固定の色マップに一致せず「未設定」になってしまうバグを修正。
  //   完全一致が無ければ「既知キーを含むか（前方/部分一致）」で色を流用、それも無ければスレート＋先頭文字。
  let pc = PATTERN_COLOR[pattern];
  if (!pc) {
    const hit = Object.keys(PATTERN_COLOR).find(k => pattern.indexOf(k) >= 0);
    pc = hit ? PATTERN_COLOR[hit] : { bg: '#64748b', short: (pattern[0] || '?') };
  }

  // tri 項目で「あり」（'on'）のものだけタグ化（reg_* で始まる任意のキーに対応、カスタム追加にも追従）
  const KNOWN_LABELS = {
    reg_loan:      'ローン',
    reg_ownership: '所有権',
    reg_minor:     '未成年',
    reg_recycle:   'リサイクル券',
    reg_proxy:     '委任状必要',
    reg_plate:     '希望ナンバー',
  };
  const tags = [];
  Object.keys(data).forEach(k => {
    if (k === 'reg_pattern' || k.startsWith('_')) return;
    if (data[k] === 'on') {
      tags.push(KNOWN_LABELS[k] || k.replace(/^reg_/, ''));
    }
  });

  const tagsHtml = tags.length
    ? tags.map(t => `<span class="detail-reg-tag">${escapeHtml(t)}</span>`).join('')
    : '<span class="detail-reg-no-tags">オプション要素なし</span>';

  return `
    <div class="detail-reg-bar">
      <div class="detail-reg-bar-head" style="background:${pc.bg}">
        <span class="detail-reg-bar-short">${pc.short}</span>
        <span class="detail-reg-bar-label">${escapeHtml(pattern)}</span>
      </div>
      <div class="detail-reg-bar-tags">${tagsHtml}</div>
    </div>`;
}

// v1.7.38: タスクパターン変更ハンドラ
//   ・初回選択（旧データ無し）：そのまま反映
//   ・既存選択あり＆作業データあり：データリセットの確認ポップアップ
window.onCarTaskVariantChange = function (carId, taskId, selectEl) {
  const car = (typeof cars !== 'undefined') ? cars.find(c => c.id === carId) : null;
  if (!car) return;
  const newId = selectEl ? selectEl.value : '';
  const carVariants = car.taskVariants || {};
  const oldId = carVariants[taskId] || '';
  if (newId === oldId) return;
  // 作業データの有無を確認（これから消すかどうか判断）
  const isD = (car.col === 'delivery' || car.col === 'done');
  const bucket = isD ? 'deliveryTasks' : 'regenTasks';
  const taskState = (car[bucket] && car[bucket][taskId]) || null;
  const hasData = !!(taskState && typeof taskState === 'object'
    && Object.keys(taskState).filter(k => !k.startsWith('_')).length > 0);
  // 空欄に戻したケース
  if (!newId) {
    if (hasData) {
      if (!confirm('タスクパターンを「未選択」に戻すと、このタスクの現在の作業データはすべて消えます。\n本当に戻しますか？')) {
        if (selectEl) selectEl.value = oldId;
        return;
      }
      delete car[bucket][taskId];
    }
    if (car.taskVariants) delete car.taskVariants[taskId];
  } else {
    // 別パターンに切替（旧データありなら確認、無ければ即時）
    if (oldId && hasData) {
      if (!confirm('タスクパターンを変更すると、このタスクの現在の作業データはすべて消えます。\n本当に切り替えますか？')) {
        if (selectEl) selectEl.value = oldId;
        return;
      }
      delete car[bucket][taskId];
    }
    if (!car.taskVariants) car.taskVariants = {};
    car.taskVariants[taskId] = newId;
  }
  // 保存＆再描画
  // v3.0.0 下ごしらえ：触った所だけを送る（車の中身をまるごと送らない）
  if (window.saveCarPaths) {
    window.saveCarPaths(car.id, [
      { path: [bucket, taskId], value: (car[bucket] && car[bucket][taskId] !== undefined) ? car[bucket][taskId] : null },
      { path: ['taskVariants', taskId], value: (car.taskVariants && car.taskVariants[taskId]) ? car.taskVariants[taskId] : null },
    ]);
  }
  if (typeof renderDetailBody === 'function') renderDetailBody(car);
  if (typeof renderAll === 'function') renderAll();
};

// v2.1.0: 詳細モーダルのモード（'default' | 'backoffice'）
//   バックオフィスサイドパネルから開くと 'backoffice' になり、
//   納車タスクの代わりにバックオフィスタスクを納車と同じUIで描画する。
let _detailMode = 'default';

// 車両詳細を開く
// v2.1.0:
//   - 第2引数 fromArchive: archivedCars 由来なら true
//   - 第3引数 mode: 'backoffice' を渡すとバックオフィスモードで描画
function openDetail(carId, fromArchive, mode) {
  activeDetailCarId = carId;
  _detailMode = (mode === 'backoffice') ? 'backoffice' : 'default';
  let car = null;
  if (fromArchive && typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) {
    car = archivedCars.find(c => c && c.id === carId);
  }
  if (!car && typeof cars !== 'undefined' && Array.isArray(cars)) {
    car = cars.find(c => c && c.id === carId);
  }
  if (!car && typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) {
    car = archivedCars.find(c => c && c.id === carId);
  }
  if (!car) return;
  // v2.29.2: タスク欄が欠けている車（旧仮登録の昇格漏れ等＝F55等）を開くとき、
  //   regenTasks/deliveryTasks/logs が undefined だと詳細描画・タスクトグルで
  //   「Cannot read properties of undefined (reading 't_regen')」で落ちる。
  //   ここで欠けている欄だけ初期化して保存し、データ側も根本修復する（promoteTentative と同じ初期化）。
  const _isArchiveCar = !!(typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)
                           && archivedCars.find(c => c && c.id === carId));
  if (!_isArchiveCar) {
    // v3.0.0 下ごしらえ：直すのは「欠けている欄だけ」。
    //   前はここで車の中身をまるごと送っていたので、開いただけで
    //   ほかの端末が入れたチェックを巻き戻すことがあった。
    const _healEntries = [];
    if (!car.regenTasks || typeof car.regenTasks !== 'object') {
      car.regenTasks = (typeof mkTaskState === 'function' && typeof REGEN_TASKS !== 'undefined') ? mkTaskState(REGEN_TASKS) : {};
      _healEntries.push({ path: ['regenTasks'], value: car.regenTasks });
    }
    if (!car.deliveryTasks || typeof car.deliveryTasks !== 'object') {
      car.deliveryTasks = (typeof mkTaskState === 'function' && typeof DELIVERY_TASKS !== 'undefined') ? mkTaskState(DELIVERY_TASKS) : {};
      _healEntries.push({ path: ['deliveryTasks'], value: car.deliveryTasks });
    }
    if (!Array.isArray(car.logs)) { car.logs = []; _healEntries.push({ path: ['logs'], value: car.logs }); }
    if (_healEntries.length && window.saveCarPaths) {
      try { window.saveCarPaths(car.id, _healEntries); } catch (e) {}
    }
  }
  // archive 由来かを保持
  car._fromArchive = !!(typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)
                         && archivedCars.find(c => c && c.id === carId));
  // v2.26.0: タイトル（車種名）の右に顧客名チップ（売約のお客様・あれば）
  {
    const _esc = (typeof escapeHtml === 'function') ? escapeHtml : (x => String(x == null ? '' : x));
    const _chip = (typeof customerChipHTML === 'function') ? customerChipHTML(car.customerName, 'title') : '';
    document.getElementById('detail-title').innerHTML = `<span class="dt-name">${_esc(car.maker)} ${_esc(car.model)}</span>${_chip}`;
  }
  renderDetailBody(car);
  document.getElementById('modal-detail').classList.add('open');
}
window.getCurrentDetailMode = function () { return _detailMode; };

// v2.28.0: 車両詳細モーダルから付箋を発行する。
//   タイトルに「管理番号 メーカー 車種」をプリフィルした状態で、既存の付箋エディタを開くだけ。
//   付箋の扱い（回覧/実行・メンバー選定・表示・保存）は全て既存の付箋機能のまま（作る入口が増えるだけ）。
//   タイトル内の管理番号は既存の linkifyCarNums で自動的に車両詳細リンクになる。
function openCarNoteFromDetail() {
  const id = (typeof activeDetailCarId !== 'undefined') ? activeDetailCarId : null;
  let car = null;
  if (id && typeof cars !== 'undefined' && Array.isArray(cars)) car = cars.find(c => c && c.id === id);
  if (!car && id && typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) car = archivedCars.find(c => c && c.id === id);
  if (!car) { if (typeof toast === 'function') toast('車両が見つかりません'); return; }
  const title = [car.num, car.maker, car.model].filter(Boolean).join(' ').trim();
  if (typeof openBoardNoteModal === 'function') {
    openBoardNoteModal(null, { title: title, over: true });
  }
}
window.openCarNoteFromDetail = openCarNoteFromDetail;

// その他用の詳細：タスクなしでメモ中心
function _renderDetailBodyOther(car) {
  const inv = daysSince(car.purchaseDate);
  const colLabel = COLS.find(c => c.id === car.col)?.label || car.col;
  const coreMemo = (car.memo || '').trim();
  const workMemo = (car.workMemo || '').trim();

  const dayBlock = `
    <div class="detail-days-box dg">
      <div class="detail-days-num">${inv}<span class="detail-days-unit">日</span></div>
      <div class="detail-days-label">仕入れから</div>
    </div>`;

  const coreMemoHtml = coreMemo
    ? `<div class="core-memo" data-expanded="0" onclick="toggleCoreMemo(this)">
         <div class="core-memo-label">${ic('pin','📌',14)} メモ</div>
         <div class="core-memo-text">${escapeHtml(coreMemo).replace(/\n/g,'<br>')}</div>
       </div>`
    : `<div class="core-memo core-memo-empty">
         <div class="core-memo-label">${ic('pin','📌',14)} メモ</div>
         <div class="core-memo-text core-memo-placeholder">メモは未記入です（編集ボタンから記入）</div>
       </div>`;

  let html = `
    <div class="detail-photo">
      ${car.photo ? `<img src="${car.photo}">` : carEmoji(car.size)}
      <div class="detail-photo-edit" onclick="document.getElementById('dp-inp').click()">${ic('camera','📷',16)} 写真を変更</div>
    </div>
    <input type="file" id="dp-inp" accept="image/*" capture="environment" style="display:none" onchange="onDetailPhoto(this)">
    <div class="detail-other-status">
      <span class="pill ${pillMap[car.col]||'pill-other'}">${ic('pencil','📝',16)} ${colLabel}</span>
      <span class="detail-other-hint">身の振り方が決まっていない保留中の車両</span>
    </div>
    <div class="detail-head">
      <div class="detail-head-left">
        ${dayBlock}
      </div>
      <div class="detail-head-right">
        <div class="detail-other-msg">タスクや進捗の管理対象外。<br>展示・再生・仕入れに動かすと売り物のフローに入ります。</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="background:var(--bg3);border-radius:7px;padding:10px"><div style="color:var(--text3);font-size:10px;margin-bottom:3px">管理番号</div><div style="font-size:13px;font-weight:600">${car.num}</div></div>
      <div style="background:var(--bg3);border-radius:7px;padding:10px"><div style="color:var(--text3);font-size:10px;margin-bottom:3px">年式</div><div style="font-size:13px;font-weight:600">${fmtYearDisplay(parseYearInput(car.year)||car.year)}</div></div>
      <div style="background:var(--bg3);border-radius:7px;padding:10px"><div style="color:var(--text3);font-size:10px;margin-bottom:3px">車体色</div><div style="font-size:13px;font-weight:600">${car.color||'—'}</div></div>
      <div style="background:var(--bg3);border-radius:7px;padding:10px"><div style="color:var(--text3);font-size:10px;margin-bottom:3px">走行距離</div><div style="font-size:13px;font-weight:600">${Number(car.km||0).toLocaleString()}km</div></div>
    </div>
    ${_renderEqDetailButton(car)}
    ${coreMemoHtml}
    <button onclick="openCarModal('${car.id}')" style="width:100%;padding:9px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);color:var(--text2);font-size:13px;cursor:pointer;margin-bottom:16px">${ic('pencil','✏️',15)} 車両詳細を編集</button>
    ${_renderRegistrationBar(car)}
    <div class="work-memo" id="work-memo-wrap">
      <div class="work-memo-label">${ic('pencil','📝',16)} 作業メモ <span class="work-memo-hint">（保留中のメモ）</span></div>
      <div class="work-memo-view" onclick="startEditWorkMemo('${car.id}')">${
        workMemo
          ? escapeHtml(workMemo).replace(/\n/g,'<br>')
          : '<span class="work-memo-placeholder">タップしてメモを記入</span>'
      }</div>
    </div>`;
  document.getElementById('detail-body').innerHTML = html;
}

// v2.4.2: バックオフィスの workflow タスクの進捗計算
//   tpl_backoffice_{taskId} テンプレの全 item 数 / チェック済 item 数で計算
//   保存先は car.backofficeWorkflows[taskId][itemId]
function _calcBackofficeWorkflowProgress(car, task) {
  if (!car || !task) return { done: 0, total: 0, pct: 0 };
  // テンプレ取得
  let sections = null;
  if (typeof ChecklistTemplates !== 'undefined') {
    const tplId = (typeof templateIdForTask === 'function')
      ? templateIdForTask(task.id, 'backoffice')
      : `tpl_backoffice_${task.id}`;
    const tpl = ChecklistTemplates[tplId];
    if (tpl) {
      // パターン選択を考慮
      if (typeof window.getActiveTaskSections === 'function') {
        sections = window.getActiveTaskSections(car, task.id);
      }
      if (!Array.isArray(sections)) sections = tpl.sections;
    }
  }
  // フォールバック：task.sections (tasks-def 側の static 定義)
  if (!Array.isArray(sections)) sections = task.sections || [];
  const stateAll = (car.backofficeWorkflows && car.backofficeWorkflows[task.id]) || {};
  let total = 0, done = 0;
  sections.forEach(sec => {
    (sec.items || []).forEach(item => {
      if (item._disabled) return;
      total++;
      if (stateAll[item.id]) done++;
    });
  });
  return { done, total, pct: total ? Math.round(done / total * 100) : 0 };
}
window._calcBackofficeWorkflowProgress = _calcBackofficeWorkflowProgress;

// 詳細モーダルの本体を描画
function renderDetailBody(car) {
  if (car.col === 'other') return _renderDetailBodyOther(car);

  // v2.1.0: バックオフィスモードでは納車タスクの代わりにバックオフィスタスクを描画
  const isBackofficeMode = (_detailMode === 'backoffice');
  const isD = car.col === 'delivery' || car.col === 'done';
  let tasks, prog;
  if (isBackofficeMode) {
    if (!car.backofficeTasks) car.backofficeTasks = {};
    // v3.0.0 下ごしらえ：数え方は progress.js の1本だけ（一覧とまったく同じ数字になる）
    const _bo = (typeof calcBackofficeProg === 'function')
      ? calcBackofficeProg(car)
      : { pct: 0, done: 0, total: 0, tasks: [] };
    tasks = _bo.tasks || [];
    prog = { done: _bo.done, total: _bo.total, pct: _bo.pct };
  } else {
    tasks = (isD ? getActiveDeliveryTasks(car) : getActiveRegenTasks(car));
    prog = calcProg(car);
  }
  const inv = daysSince(car.purchaseDate);
  const contractedDays = daysSinceContract(car);
  const delDiff = car.deliveryDate ? daysDiff(car.deliveryDate) : null;
  let dayBlock = '';
  if (car.isOrder) {
    // v1.8.72: オーダー車両の表示（在庫日数の代わりに「オーダー車両」バッジ）
    dayBlock = `
      <div class="detail-days-box" style="background:rgba(168,85,247,.18);color:#c084fc;border:1px solid rgba(168,85,247,.4)">
        <div class="detail-days-num" style="font-size:18px">${ic('box','📦',16)}</div>
        <div class="detail-days-label">オーダー車両</div>
        <div class="detail-days-sub" style="color:#c084fc;opacity:.85">在庫日数カウントなし</div>
      </div>`;
  } else if (car.contract) {
    const wt = delWarnTier(delDiff);
    const delLabel = (delDiff != null) ? (delDiff === 0 ? '納車本日' : delDiff > 0 ? `納車まで${delDiff}日` : `納車超過${-delDiff}日`) : '';
    dayBlock = `
      <div class="detail-days-box db">
        <div class="detail-days-num">${contractedDays}<span class="detail-days-unit">日</span></div>
        <div class="detail-days-label">売約から</div>
        ${delLabel ? `<div class="detail-days-sub${wt?' warn':''}">${delLabel}</div>` : ''}
      </div>`;
  } else {
    const wt = invWarnTier(inv);
    const cls = wt ? (wt.days >= 45 ? 'dr' : wt.days >= 30 ? 'dw' : 'dg') : 'dg';
    dayBlock = `
      <div class="detail-days-box ${cls}"${wt?` style="background:${wt.bg};color:${wt.color}"`:''}>
        <div class="detail-days-num">${inv}<span class="detail-days-unit">日</span></div>
        <div class="detail-days-label">在庫</div>
      </div>`;
  }
  const coreMemo = (car.memo || '').trim();
  const coreMemoHtml = coreMemo
    ? `<div class="core-memo" data-expanded="0" onclick="toggleCoreMemo(this)">
         <div class="core-memo-label">${ic('pin','📌',14)} メモ</div>
         <div class="core-memo-text">${escapeHtml(coreMemo).replace(/\n/g,'<br>')}</div>
       </div>`
    : `<div class="core-memo core-memo-empty">
         <div class="core-memo-label">${ic('pin','📌',14)} メモ</div>
         <div class="core-memo-text core-memo-placeholder">メモは未記入です（編集ボタンから記入）</div>
       </div>`;
  const workMemo = (car.workMemo || '').trim();
  let html = `
    <div class="detail-photo">
      ${car.photo ? `<img src="${car.photo}">` : carEmoji(car.size)}
      <div class="detail-photo-edit" onclick="document.getElementById('dp-inp').click()">${ic('camera','📷',16)} 写真を変更</div>
    </div>
    <input type="file" id="dp-inp" accept="image/*" capture="environment" style="display:none" onchange="onDetailPhoto(this)">
    <div class="detail-head">
      <div class="detail-head-left">
        ${dayBlock}
      </div>
      <div class="detail-head-right">
        ${(() => {
          // v1.8.63: 緑（総額メイン）側の税ラベルは緑に。本体（サブ）はグレーのまま。
          const tlb = (typeof getTaxLabel === 'function') ? getTaxLabel('body')  : '税込';
          const tlt = (typeof getTaxLabel === 'function') ? getTaxLabel('total') : '税込';
          const pt = fmtPriceTwo(car.totalPrice, car.price);
          if (pt.hasTotal && pt.hasBody) {
            return `<div class="detail-price-wrap"><div class="detail-price">総額 ${pt.totalDisp}<span class="detail-price-tax-green">（${tlt}）</span></div><div class="detail-price-body">本体 ${pt.bodyDisp}<span class="detail-price-tax">（${tlb}）</span></div></div>`;
          } else if (pt.hasTotal) {
            return `<div class="detail-price">総額 ${pt.totalDisp}<span class="detail-price-tax-green">（${tlt}）</span></div>`;
          } else if (pt.hasBody) {
            return `<div class="detail-price">本体 ${pt.bodyDisp}<span class="detail-price-tax-green">（${tlb}）</span></div>`;
          }
          return '';
        })()}
        ${car.deliveryDate ? `<div class="detail-deldate">納車予定: ${fmtDate(car.deliveryDate)}</div>` : ''}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="background:var(--bg3);border-radius:7px;padding:10px"><div style="color:var(--text3);font-size:10px;margin-bottom:3px">管理番号</div><div style="font-size:13px;font-weight:600">${car.num}</div></div>
      <div style="background:var(--bg3);border-radius:7px;padding:10px"><div style="color:var(--text3);font-size:10px;margin-bottom:3px">年式</div><div style="font-size:13px;font-weight:600">${fmtYearDisplay(parseYearInput(car.year)||car.year)}</div></div>
      <div style="background:var(--bg3);border-radius:7px;padding:10px"><div style="color:var(--text3);font-size:10px;margin-bottom:3px">車体色</div><div style="font-size:13px;font-weight:600">${car.color}</div></div>
      <div style="background:var(--bg3);border-radius:7px;padding:10px"><div style="color:var(--text3);font-size:10px;margin-bottom:3px">走行距離</div><div style="font-size:13px;font-weight:600">${Number(car.km||0).toLocaleString()}km</div></div>
    </div>
    ${_renderEqDetailButton(car)}
    ${coreMemoHtml}
    <button onclick="openCarModal('${car.id}')" style="width:100%;padding:9px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);color:var(--text2);font-size:13px;cursor:pointer;margin-bottom:16px">${ic('pencil','✏️',15)} 車両詳細を編集</button>
    ${_renderRegistrationBar(car)}
    <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">${isBackofficeMode ? ''+ic('files','🗂',16)+' バックオフィス（事務処理）' : (isD ? '納車準備' : '業務タスク')}</div>
    <div class="detail-overall">
      <div class="detail-overall-label"><span>全体進捗</span><span>${prog.done}/${prog.total} (${prog.pct}%)</span></div>
      <div class="detail-overall-bar"><div class="detail-overall-fill" style="width:${prog.pct}%;background:${prog.pct>=100?'var(--green)':prog.pct>0?'var(--orange)':'var(--bg4)'}"></div></div>
    </div>
    <div class="task-items">`;
  // v1.0.35: 期日超過タスクのマップを準備
  const _overdueList = (typeof getOverdueTasks === 'function') ? getOverdueTasks(car) : [];
  const _overdueMap = {};
  _overdueList.forEach(o => { _overdueMap[o.taskId] = o; });
  function _overdueBadge(taskId) {
    const o = _overdueMap[taskId];
    if (!o) return '';
    return `<span class="task-overdue-badge" title="期限超過">${ic('warn','⚠',14)} 超過${o.overdueDays}日</span>`;
  }
  // v1.0.36: 列を固定幅で揃える共通フォーマット
  // [chk(30)] [info(flex:1)] [badge(可変・無くても占有なし)] [pct(56右寄)] [open(64 or プレースホルダー)]
  function _badgeCol(taskId) {
    const o = _overdueMap[taskId];
    return `<div class="task-item-badge">${o ? `<span class="task-overdue-badge" title="期限超過">${ic('warn','⚠',14)} 超過${o.overdueDays}日</span>` : ''}</div>`;
  }
  // v1.7.13: Phase 3 — 「📝 詳細」ON のトグルタスクは項目チェック式に昇格、ws-page で開く
  // v2.1.0: バックオフィスモードでは phaseStr='backoffice'
  const _phaseStr = isBackofficeMode ? 'backoffice' : (isD ? 'delivery' : 'regen');
  const _isCheckMode = (taskId) =>
    (typeof hasTaskChecklist === 'function' && hasTaskChecklist(taskId, _phaseStr));
  // v2.2.2: パターン選択を task-item-row 内に inline 配置（メモ連携で2行になっていたのを解消）
  //         未選択 placeholder は「パターン」だけにシンプル化
  function _renderTaskVariantRow(task) {
    if (typeof ChecklistTemplates === 'undefined') return '';
    const tplId = (task.id === 't_equip') ? 'tpl_equipment' : `tpl_${_phaseStr}_${task.id}`;
    const tpl = ChecklistTemplates[tplId];
    if (!tpl) return '';
    const variants = Array.isArray(tpl.variants) ? tpl.variants : [];
    if (variants.length <= 1) return ''; // パターン1つなら不要
    const carVariants = (car && car.taskVariants) || {};
    const sel = carVariants[task.id] || '';
    const opts = variants.map(v =>
      `<option value="${escapeHtml(v.id)}" ${v.id === sel ? 'selected' : ''}>${escapeHtml(v.name || '(無題)')}</option>`
    ).join('');
    const placeholder = sel ? '' : '<option value="">パターン</option>';
    return `<select class="task-item-variant-sel"
              onclick="event.stopPropagation()"
              onchange="onCarTaskVariantChange('${car.id}','${task.id}',this)">
        ${placeholder}${opts}
      </select>`;
  }

  tasks.forEach(task => {
    // v2.1.0: バックオフィスモードでは独自進捗計算
    // v2.4.2: workflow 型 / mode='checklist' なら car.backofficeWorkflows ベースで計算
    //   （元 toggle 型タスクでもチェックリスト編集をONにしてれば workflow 扱い）
    let p, state;
    if (isBackofficeMode) {
      const isChecklistTask = (task.type === 'workflow') || _isCheckMode(task.id);
      if (isChecklistTask) {
        p = _calcBackofficeWorkflowProgress(car, task);
        state = (car.backofficeWorkflows && car.backofficeWorkflows[task.id]) || {};
      } else {
        const _bst = car.backofficeTasks || {};
        const _done = (_bst[task.id] === true) ? 1 : 0;
        p = { done: _done, total: 1, pct: _done * 100 };
        state = _bst;
      }
    } else {
      p = calcSingleProg(car, task.id, tasks);
      // v2.29.2: 欄が欠けた車でも落ちないよう防御（|| {}）
      state = (isD ? car.deliveryTasks : car.regenTasks) || {};
    }
    const isDone = p.pct === 100, isPartial = p.pct > 0 && p.pct < 100;

    // 単純トグル：チェックリストモードでないタスク（type='toggle' の通常 / d_complete / t_complete /
    // v2.5.10: 解放対象 workflow で simple に設定したもの）
    if (!_isCheckMode(task.id)) {
      // v1.0.41 / v1.7.17: d_complete / t_complete は自動判定。手動チェック不可
      const isAuto = !isBackofficeMode && (task.id === 'd_complete' || task.id === 't_complete');
      let autoChecked = false;
      if (isAuto) {
        if (task.id === 'd_complete' && typeof isDeliveryAllOtherTasksDone === 'function') {
          autoChecked = isDeliveryAllOtherTasksDone(car);
        } else if (task.id === 't_complete' && typeof isRegenAllOtherTasksDone === 'function') {
          autoChecked = isRegenAllOtherTasksDone(car);
        }
      }
      const checked = isAuto ? autoChecked : ((typeof _simpleTaskDone === 'function') ? _simpleTaskDone(state[task.id]) : (state[task.id] === true));
      // v2.1.0: バックオフィスモードは toggleBackofficeTaskToggle（cars/archivedCars 両対応）
      const onclickAttr = isAuto
        ? ''
        : (isBackofficeMode
            ? ` onclick="toggleBackofficeTaskToggle('${car.id}','${task.id}')"`
            : ` onclick="toggleTaskToggle('${car.id}','${task.id}',${isD})"`);
      const subText = isAuto
        ? (checked ? '✓ 自動完了（他タスク全完了）' : '他タスク完了で自動ON')
        : (checked ? '完了' : '未完了');
      const chkExtraCls = isAuto ? ' auto' : '';
      // v2.2.1: タスク個別メモのインラインセル（OFFタスクなら空文字＝従来通り）
      const memoCell = (typeof window.taskMemo !== 'undefined' && window.taskMemo.renderTaskMemoCellHtml)
        ? window.taskMemo.renderTaskMemoCellHtml(car, task, _phaseStr) : '';
      html += `<div class="task-item"><div class="task-item-row">
        <div class="task-chk${checked?' done':''}${chkExtraCls}"${onclickAttr}>
          ${checked ? '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><polyline points="2,7 5.5,11 12,3" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
        </div>
        <div class="task-item-info"><div class="task-item-name">${icoE(task.icon)} ${task.name}</div><div class="task-item-sub">${subText}</div></div>
        ${memoCell}
        ${_badgeCol(task.id)}
        <div class="task-item-pct">${checked?'100':'0'}%</div>
        <div class="task-item-open"></div>
      </div></div>`;
    } else {
      // workflow / checklist 型
      // v2.1.0: バックオフィスの workflow/checklist は worksheet 側が未対応のため
      //         「未対応」を表示。将来バックオフィス用 worksheet を拡張する想定。
      const variantRow = _renderTaskVariantRow(task);
      const tplId2 = (task.id === 't_equip') ? 'tpl_equipment' : `tpl_${_phaseStr}_${task.id}`;
      const tpl2 = (typeof ChecklistTemplates !== 'undefined') ? ChecklistTemplates[tplId2] : null;
      const variants2 = (tpl2 && Array.isArray(tpl2.variants)) ? tpl2.variants : [];
      const needsSelect = variants2.length > 1;
      const carVariants2 = (car && car.taskVariants) || {};
      const hasSelection = !needsSelect || !!carVariants2[task.id];
      let openBtnHtml;
      // v2.4.1: バックオフィスでも workflow タスクを開けるように対応（worksheet.js が backoffice phase をサポート）
      if (isBackofficeMode) {
        openBtnHtml = hasSelection
          ? `<button class="task-open-btn" onclick="openWorksheet('${car.id}','${task.id}','backoffice')">開く →</button>`
          : `<button class="task-open-btn" disabled title="先にタスクパターンを選んでください" style="opacity:.4;cursor:not-allowed">開く →</button>`;
      } else {
        openBtnHtml = hasSelection
          ? `<button class="task-open-btn" onclick="openWorksheet('${car.id}','${task.id}')">開く →</button>`
          : `<button class="task-open-btn" disabled title="先にタスクパターンを選んでください" style="opacity:.4;cursor:not-allowed">開く →</button>`;
      }
      // v2.2.1: タスク個別メモのインラインセル
      const memoCell = (typeof window.taskMemo !== 'undefined' && window.taskMemo.renderTaskMemoCellHtml)
        ? window.taskMemo.renderTaskMemoCellHtml(car, task, _phaseStr) : '';
      // v2.2.2: variantRow を task-item-row 内に inline 配置（1行化）
      // v2.2.3: メモを左、パターンを右の順に
      // v2.2.4: メモとパターンが両方あるときは縦stack（0.5行ずつ）にまとめて高さ温存
      let mvHtml;
      if (memoCell && variantRow) {
        mvHtml = `<div class="task-item-mv-stack">${memoCell}${variantRow}</div>`;
      } else {
        mvHtml = `${memoCell}${variantRow}`;
      }
      // 🔴 v3.0.0 中タスク：丸を「分円」にして、いまの中タスクを名前の行に出す。
      //   ・小タスクが無い中タスク … 丸を押すと1つ進む（行の高さは変えない）
      //   ・小タスクがある中タスク … 「開く →」で作業管理票へ
      //   ・全部おわった丸をもう一度押すと 0% に戻る（大タスクのスイッチと同じ感覚）
      let chkHtml, nameHtml, subHtml, openHtml = openBtnHtml;
      const _steps = (window.CarStep && !isBackofficeMode)
        ? window.CarStep.stepsOf(car, task.id, _phaseStr) : null;
      if (_steps && _steps.length) {
        const _cur = _steps.find(x => !x.isDone) || null;
        const _all = !_cur;
        chkHtml = _all
          ? `<div class="task-chk done" onclick="advanceStep('${car.id}','${task.id}')" title="もう一度押すと 0% に戻ります">
               <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><polyline points="2,7 5.5,11 12,3" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
             </div>`
          : `<div class="task-chk task-chk-ring" onclick="advanceStep('${car.id}','${task.id}')"
                  style="background:${window.CarStep.ringBackground(p.done, p.total)}"
                  title="${_cur.manual ? '押すと1工程すすみます' : '「開く →」から進めてください'}"><i></i></div>`;
        nameHtml = _all
          ? `${icoE(task.icon)} ${task.name}<span class="ti-sep">─</span><span class="ti-mid done">ぜんぶ完了</span>`
          : `${icoE(task.icon)} ${task.name}<span class="ti-sep">─</span><span class="ti-mid">${escapeHtml(_cur.name)}</span>`;
        subHtml = `中タスク ${p.done}/${p.total} 完了`
          + (_cur && !_cur.manual ? `　（${escapeHtml(_cur.name)} ${_cur.done}/${_cur.total}）` : '');
        openHtml = (_cur && !_cur.manual) ? openBtnHtml : '';
      } else {
        chkHtml = `<div class="task-chk${isDone?' done':isPartial?' partial':''}">
          ${isDone ? '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><polyline points="2,7 5.5,11 12,3" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : isPartial ? '<div style="width:7px;height:7px;border-radius:50%;background:#fff"></div>' : ''}
        </div>`;
        nameHtml = `${icoE(task.icon)} ${task.name}`;
        subHtml = `${p.done}/${p.total} 完了`;
      }
      html += `<div class="task-item"><div class="task-item-row">
        ${chkHtml}
        <div class="task-item-info"><div class="task-item-name">${nameHtml}</div><div class="task-item-sub">${subHtml}</div></div>
        ${mvHtml}
        ${_badgeCol(task.id)}
        <div class="task-item-pct">${p.pct}%</div>
        <div class="task-item-open">${openHtml}</div>
      </div></div>`;
    }
  });
  html += `</div>`;
  // v2.1.0: バックオフィスモードでは作業メモ（再生/納車準備のメモ）は出さない
  if (!isBackofficeMode) {
    html += `
      <div class="work-memo" id="work-memo-wrap">
        <div class="work-memo-label">${ic('pencil','📝',16)} 作業メモ ${isD ? '<span class="work-memo-hint">（納車準備中のメモ）</span>' : '<span class="work-memo-hint">（再生中のメモ）</span>'}</div>
        <div class="work-memo-view" onclick="startEditWorkMemo('${car.id}')">${
          workMemo
            ? escapeHtml(workMemo).replace(/\n/g,'<br>')
            : '<span class="work-memo-placeholder">タップしてメモを記入</span>'
        }</div>
      </div>`;
  }
  // v2.1.0: バックオフィスモードでは「バックオフィス専用メモ」（大きめ）を追加
  if (isBackofficeMode) {
    html += _renderBackofficeMemoHtml(car);
  }
  // v2.1.0: バックオフィスモード時の完了ボタン or 完了済みバナー
  // v2.4.2: workflow 型タスクは backofficeWorkflows ベースで全項目完了判定
  if (isBackofficeMode) {
    const completed = !!car.backofficeCompleted;
    const allDone = tasks.length > 0 && tasks.every(t => {
      const isChecklistTask = (t.type === 'workflow') || _isCheckMode(t.id);
      if (isChecklistTask) {
        const wp = _calcBackofficeWorkflowProgress(car, t);
        return wp.total > 0 && wp.done >= wp.total;
      }
      const _bst = car.backofficeTasks || {};
      return _bst[t.id] === true;
    });
    if (completed) {
      const at = car.backofficeCompletedAt
        ? (typeof fmtDate === 'function' ? fmtDate(car.backofficeCompletedAt) : car.backofficeCompletedAt)
        : '';
      html += `<div class="detail-bo-done-banner" style="margin-top:14px">
        ✅ バックオフィス完了済み${at ? `（${escapeHtml(at)}）` : ''}
        <button class="detail-bo-unmark-btn" onclick="window.backoffice.unmarkComplete('${car.id}')">完了を取り消す</button>
      </div>`;
    } else if (allDone) {
      html += `<button class="detail-bo-complete-btn" style="margin-top:14px" onclick="window.backoffice.markComplete('${car.id}')">
        ✅ バックオフィス完了
      </button>`;
    }
  }
  document.getElementById('detail-body').innerHTML = html;
}

// v2.1.0: バックオフィス用 toggle ハンドラ（cars / archivedCars 両対応）
function toggleBackofficeTaskToggle(carId, taskId) {
  let car = null, fromArchive = false;
  if (typeof cars !== 'undefined' && Array.isArray(cars)) {
    car = cars.find(c => c && c.id === carId);
  }
  if (!car && typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) {
    car = archivedCars.find(c => c && c.id === carId);
    if (car) fromArchive = true;
  }
  if (!car) return;
  if (!car.backofficeTasks) car.backofficeTasks = {};
  car.backofficeTasks[taskId] = !car.backofficeTasks[taskId];
  if (typeof addLog === 'function') {
    addLog(carId, `バックオフィス「${taskId}」を${car.backofficeTasks[taskId]?'完了':'未完了に戻す'}`);
  }
  // v3.0.0 下ごしらえ：押した1つだけを送る
  if (window.saveCarAnyPaths) {
    window.saveCarAnyPaths(car.id, fromArchive, [
      { path: ['backofficeTasks', taskId], value: car.backofficeTasks[taskId] },
      { path: ['logs'], value: car.logs },
    ]);
  }
  // v2.2.7: 自動付箋を完了/未完了に同期
  if (window.taskMemoAutoNote && window.taskMemoAutoNote.markDone) {
    window.taskMemoAutoNote.markDone(car, taskId, !!car.backofficeTasks[taskId]);
  }
  renderDetailBody(car);
  if (typeof renderBackoffice === 'function') renderBackoffice();
  if (typeof showToast === 'function') {
    showToast(car.backofficeTasks[taskId] ? '完了しました' : '未完了に戻しました');
  }
}
window.toggleBackofficeTaskToggle = toggleBackofficeTaskToggle;

// ========================================
// v2.1.0: バックオフィス専用メモ
//   - データ: car.backofficeMemo (string)
//   - cars / archivedCars 両対応
//   - 既存の作業メモ（workMemo）とは別データ
// ========================================
function _findCarAnyCollection(carId) {
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

function _renderBackofficeMemoHtml(car) {
  const memo = (car.backofficeMemo || '').trim();
  return `
    <div class="bo-memo" id="bo-memo-wrap">
      <div class="bo-memo-label">${ic('pencil','📝',16)} バックオフィスメモ <span class="bo-memo-hint">（事務処理用の申し送り）</span></div>
      <div class="bo-memo-view" onclick="startEditBackofficeMemo('${car.id}')">${
        memo
          ? escapeHtml(memo).replace(/\n/g,'<br>')
          : '<span class="bo-memo-placeholder">タップしてメモを記入</span>'
      }</div>
    </div>`;
}

function startEditBackofficeMemo(carId) {
  const found = _findCarAnyCollection(carId);
  if (!found) return;
  const wrap = document.getElementById('bo-memo-wrap');
  if (!wrap) return;
  const cur = found.car.backofficeMemo || '';
  wrap.innerHTML = `
    <div class="bo-memo-label">${ic('pencil','📝',16)} バックオフィスメモ <span class="bo-memo-hint">（事務処理用の申し送り）</span></div>
    <textarea id="bo-memo-ta" class="bo-memo-input" rows="6" placeholder="原価処理の進捗・書類の所在・申し送りなど">${escapeHtml(cur)}</textarea>
    <div class="bo-memo-btns">
      <button class="btn-sm" onclick="cancelEditBackofficeMemo('${carId}')">キャンセル</button>
      <button class="btn-sm btn-primary" onclick="saveBackofficeMemo('${carId}')">保存</button>
    </div>`;
}

function saveBackofficeMemo(carId) {
  const found = _findCarAnyCollection(carId);
  if (!found) return;
  const ta = document.getElementById('bo-memo-ta');
  if (!ta) return;
  const newVal = ta.value;
  found.car.backofficeMemo = newVal;
  if (typeof addLog === 'function') addLog(carId, 'バックオフィスメモを更新');
  // v3.0.0 下ごしらえ：メモの欄だけを送る
  if (window.saveCarAnyPaths) {
    window.saveCarAnyPaths(found.car.id, found.fromArchive, [
      { path: ['backofficeMemo'], value: found.car.backofficeMemo },
      { path: ['logs'], value: found.car.logs },
    ]);
  }
  if (typeof showToast === 'function') showToast('メモを保存しました');
  renderDetailBody(found.car);
}

function cancelEditBackofficeMemo(carId) {
  const found = _findCarAnyCollection(carId);
  if (!found) return;
  renderDetailBody(found.car);
}

window.startEditBackofficeMemo = startEditBackofficeMemo;
window.saveBackofficeMemo = saveBackofficeMemo;
window.cancelEditBackofficeMemo = cancelEditBackofficeMemo;

// ----------------------------------------
// v2.1.0: バックオフィスタスクセクション（詳細モーダル末尾）
// ----------------------------------------
function _renderBackofficeSectionHtml(car) {
  // タスク取得
  const tasks = (typeof getActiveBackofficeTasks === 'function')
    ? getActiveBackofficeTasks(car) : [];
  if (!tasks.length) {
    return `<div class="detail-bo-section">
      <div class="detail-bo-head">${ic('files','🗂',16)} バックオフィス（事務処理）</div>
      <div class="detail-bo-empty">バックオフィスタスクが設定されていません。<br>設定 → タスク・進捗 → ${ic('files','🗂',16)}バックオフィス で追加できます。</div>
    </div>`;
  }
  const store = car.backofficeTasks || {};
  const renameMap = (typeof appTaskRename !== 'undefined' && appTaskRename && appTaskRename.backoffice) || {};
  const completed = !!car.backofficeCompleted;
  // v2.4.2: workflow 型 / mode='checklist' なら全項目完了で done 判定
  const doneCount = tasks.filter(t => {
    const isChecklistTask = (t.type === 'workflow') ||
      (typeof hasTaskChecklist === 'function' && hasTaskChecklist(t.id, 'backoffice'));
    if (isChecklistTask) {
      const wp = _calcBackofficeWorkflowProgress(car, t);
      return wp.total > 0 && wp.done >= wp.total;
    }
    return store[t.id] === true;
  }).length;
  const allDone = doneCount >= tasks.length;

  const itemsHtml = tasks.map(t => {
    const done = store[t.id] === true;
    const ov = renameMap[t.id];
    const name = (ov && ov.name) || t.name || '';
    const icon = (ov && ov.icon) || t.icon || '✅';
    const disabledAttr = completed ? 'disabled' : '';
    const lockedCls = completed ? ' bo-locked' : '';
    return `<label class="detail-bo-item${done ? ' is-done' : ''}${lockedCls}">
      <input type="checkbox" ${done ? 'checked' : ''} ${disabledAttr}
        onchange="window.backoffice.toggleTask('${escapeHtml(car.id)}','${escapeHtml(t.id)}',this.checked)">
      <span class="detail-bo-item-icon">${icoE(escapeHtml(icon))}</span>
      <span class="detail-bo-item-name">${escapeHtml(name)}</span>
    </label>`;
  }).join('');

  let actionHtml = '';
  if (completed) {
    const at = car.backofficeCompletedAt
      ? (typeof fmtDate === 'function' ? fmtDate(car.backofficeCompletedAt) : car.backofficeCompletedAt)
      : '';
    actionHtml = `<div class="detail-bo-done-banner">
      ✅ バックオフィス完了済み${at ? `（${escapeHtml(at)}）` : ''}
      <button class="detail-bo-unmark-btn" onclick="window.backoffice.unmarkComplete('${escapeHtml(car.id)}')">完了を取り消す</button>
    </div>`;
  } else if (allDone) {
    actionHtml = `<button class="detail-bo-complete-btn" onclick="window.backoffice.markComplete('${escapeHtml(car.id)}')">
      ✅ バックオフィス完了
    </button>`;
  }

  return `<div class="detail-bo-section" id="detail-bo-section-${escapeHtml(car.id)}">
    <div class="detail-bo-head">
      🗂 バックオフィス（事務処理）
      <span class="detail-bo-count">${doneCount}/${tasks.length}</span>
    </div>
    <div class="detail-bo-items">${itemsHtml}</div>
    ${actionHtml}
  </div>`;
}

// v2.1.0: トグル後にバックオフィスセクションだけ差し替え（全体 renderDetailBody を再呼びすると
// メモ編集中の状態などが飛ぶため、必要な部分だけ最小差分で再描画する）
function renderDetailBackofficeSection(car) {
  if (!car || !car.id) return;
  const sec = document.getElementById('detail-bo-section-' + car.id);
  if (!sec) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = _renderBackofficeSectionHtml(car);
  const fresh = wrap.firstElementChild;
  if (fresh) sec.replaceWith(fresh);
}
window.renderDetailBackofficeSection = renderDetailBackofficeSection;

// 装備詳細ボタン＋アコーディオンパネルの描画
// v1.0.20: 新規追加 / v1.0.21: アコーディオン化 / v1.0.24: ラベル統一 / v1.0.33: タスクOFF時は非表示
function _renderEqDetailButton(car) {
  if (typeof calcEquipmentProgress !== 'function') return '';
  // v1.0.33: 装備品チェックタスクが OFF なら、ボタン自体を出さない
  // t_equip は再生フェーズの組み込みタスクなので、再生で OFF なら隠す
  if (typeof isTaskActive === 'function' && !isTaskActive('t_equip', 'regen')) {
    return '';
  }
  const p = calcEquipmentProgress(car);
  const completed = !!(car.equipment && car.equipment._completed);
  let label, cls = 'detail-eq-btn';
  if (p.filled === 0) {
    label = '📋 装備詳細を見る（未入力）';
    cls += ' detail-eq-btn-empty';
  } else if (completed) {
    label = `📋 装備詳細を見る（✓ 確認済 ${p.filled}/${p.total}）`;
  } else {
    label = `📋 装備詳細を見る（${p.filled}/${p.total} 入力済）`;
  }
  return `
    <button id="eq-acc-btn-${car.id}" class="${cls}" data-open="0" onclick="toggleEquipmentAccordion('${car.id}')">
      <span class="detail-eq-btn-label">${label}</span>
      <span class="detail-eq-btn-arrow">${ic('chevDown','▼',14)}</span>
    </button>
    <div id="eq-acc-${car.id}" class="detail-eq-accordion" data-open="0"></div>`;
}

function toggleCoreMemo(el) {
  const cur = el.getAttribute('data-expanded') === '1';
  el.setAttribute('data-expanded', cur ? '0' : '1');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function startEditWorkMemo(carId) {
  const car = cars.find(c => c.id === carId);
  if (!car) return;
  const wrap = document.getElementById('work-memo-wrap');
  if (!wrap) return;
  const cur = car.workMemo || '';
  wrap.innerHTML = `
    <div class="work-memo-label">${ic('pencil','📝',16)} 作業メモ</div>
    <textarea id="work-memo-ta" class="work-memo-input" rows="4" placeholder="作業の進捗・申し送りなど">${escapeHtml(cur)}</textarea>
    <div class="work-memo-btns">
      <button class="btn-sm" onclick="cancelEditWorkMemo('${carId}')">キャンセル</button>
      <button class="btn-sm btn-primary" onclick="saveWorkMemo('${carId}')">保存</button>
    </div>`;
  const ta = document.getElementById('work-memo-ta');
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

function cancelEditWorkMemo(carId) {
  const car = cars.find(c => c.id === carId);
  if (!car) return;
  renderDetailBody(car);
}

function saveWorkMemo(carId) {
  const car = cars.find(c => c.id === carId);
  if (!car) return;
  const ta = document.getElementById('work-memo-ta');
  const v = ta ? ta.value.trim() : '';
  car.workMemo = v;
  addLog(carId, '作業メモを更新');
  // v3.0.0 下ごしらえ：作業メモの欄だけを送る
  if (window.saveCarPaths) {
    window.saveCarPaths(car.id, [
      { path: ['workMemo'], value: car.workMemo },
      { path: ['logs'], value: car.logs },
    ]);
  }
  renderDetailBody(car);
  renderAll();
  showToast('作業メモを保存しました');
}

async function onDetailPhoto(inp) {
  const car = cars.find(c => c.id === activeDetailCarId);
  if (!car) return;
  const file = inp.files[0];
  if (!file) return;
  // v1.5.10: Storage アップロード（フォールバック：data:URL）
  try {
    if (window.dbStorage && window.dbStorage.uploadCarPhoto) {
      showToast('写真をアップロード中...');
      car.photo = await window.dbStorage.uploadCarPhoto(car.id, file);
    } else {
      car.photo = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = e => resolve(e.target.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    }
    // v3.0.0 下ごしらえ：写真の欄だけを送る
    if (window.saveCarPaths) window.saveCarPaths(car.id, [{ path: ['photo'], value: car.photo }]);
    renderDetailBody(car);
    renderAll();
    showToast('写真を更新しました');
  } catch (err) {
    console.error('[car-detail] photo upload failed:', err);
    showToast('写真のアップロードに失敗しました');
  }
}

function toggleTaskToggle(carId, taskId, isD) {
  const car = cars.find(c => c.id === carId);
  if (!car) return;
  // v2.29.2: 欄欠落車の保険。欠けていれば初期化してから操作（トグルで落ちない）
  const _bucket = isD ? 'deliveryTasks' : 'regenTasks';
  if (!car[_bucket] || typeof car[_bucket] !== 'object') {
    car[_bucket] = (isD
      ? ((typeof mkTaskState === 'function' && typeof DELIVERY_TASKS !== 'undefined') ? mkTaskState(DELIVERY_TASKS) : {})
      : ((typeof mkTaskState === 'function' && typeof REGEN_TASKS !== 'undefined') ? mkTaskState(REGEN_TASKS) : {}));
  }
  const state = isD ? car.deliveryTasks : car.regenTasks;
  // v2.20.1: 初期値が空オブジェクト{}だと !state[taskId] が false になり「完了にできない／外したログだけ出る」
  //   バグの原因。_simpleTaskDoneで現在の完了状態を正しく判定し、その反転をbooleanで保存する。
  const _cur = (typeof _simpleTaskDone === 'function') ? _simpleTaskDone(state[taskId]) : (state[taskId] === true);
  state[taskId] = !_cur;
  addLog(carId, `「${taskId}」を${state[taskId]?'完了':'未完了に戻す'}`);
  // 🔴 v3.0.0 下ごしらえ：押した1つだけを送る。
  //   前はここで車の中身をまるごと送っていたので、この端末が持っている「未チェック」まで
  //   一緒に届き、ほかの端末が入れたチェックが外れていた。
  if (window.saveCarPaths) {
    window.saveCarPaths(car.id, [
      { path: [_bucket, taskId], value: state[taskId] },
      { path: ['logs'], value: car.logs },
    ]);
  }
  // v2.2.7: 自動付箋を完了/未完了に同期（dateメモの付箋があれば反映）
  if (window.taskMemoAutoNote && window.taskMemoAutoNote.markDone) {
    window.taskMemoAutoNote.markDone(car, taskId, !!state[taskId]);
  }
  renderDetailBody(car);
  renderAll();
  showToast(state[taskId] ? '完了しました' : '未完了に戻しました');
}

// ========================================
// v0.8.9: 車両削除フロー
// v0.9.0: 削除ボタンは編集モーダル内（誤タップ防止）
// ========================================
let _deletingCarId = null;

// v2.27.0: 「売れた車」（納車完了/納車準備）を削除できるのはマスター（ゆうた）だけ。
//          他の管理者・スタッフは弾く（サーバー側 firestore.rules でも同じuidで二重ガード）。
const CARFLOW_MASTER_UID = 'cIZsMOEsaaWWVVM957TFe6tvql53'; // ゆうた（yk19kobamo@gmail.com）
function _isCarflowMaster() {
  return !!(window.fb && window.fb.currentUser && window.fb.currentUser.uid === CARFLOW_MASTER_UID);
}

function confirmDeleteCar(carId) {
  const car = cars.find(c => c.id === carId);
  if (!car) return;
  // v2.27.0: 納車完了/納車準備（売れた車）の削除はマスターのみ。それ以外は開かずに弾く。
  if ((car.col === 'done' || car.col === 'delivery') && !_isCarflowMaster()) {
    const phase = (car.col === 'done') ? '納車完了' : '納車準備（売約済み）';
    showToast(`「${phase}」の車（売れた車）の削除は、ゆうたさんのアカウントだけができます`);
    return;
  }
  _deletingCarId = carId;
  const sub = document.getElementById('confirm-delete-sub');
  if (sub) {
    // v2.27.0: 売れた車（納車完了/納車準備）を削除しようとした時は強い警告を出す。
    //          納車完了の車を削除すると販売実績の集計から消える（実績アーカイブにも残らない）。
    let warn = '';
    if (car.col === 'done') {
      warn = `<div style="background:#fef2f2;border:2px solid #dc2626;color:#b91c1c;border-radius:8px;padding:10px 12px;margin:8px 0;font-weight:700;line-height:1.6">${ic('warn','⚠',14)} この車は「納車完了」＝<u>売れた車</u>です。<br>削除すると<u>販売実績の集計から消えます</u>。<br>実績に残すには削除しないでください（不要でも月締めで自動的に実績へ移ります）。</div>`;
    } else if (car.col === 'delivery') {
      warn = `<div style="background:#fff7ed;border:2px solid #ea580c;color:#c2410c;border-radius:8px;padding:10px 12px;margin:8px 0;font-weight:700;line-height:1.6">${ic('warn','⚠',14)} この車は「納車準備」＝<u>売約済み</u>です。<br>削除すると売れた1台が記録から消えます。よく確認してください。</div>`;
    }
    sub.innerHTML = `${warn}<strong>${escapeHtml(car.maker)} ${escapeHtml(car.model)}</strong>（${escapeHtml(car.num)}）<br>このデータは復元できません。本当に削除しますか？`;
  }
  document.getElementById('confirm-delete-car').classList.add('open');
}

// v2.16.0: mode 引数化 — null/false=キャンセル、'formal'=正式削除（deletedCarsに記録）、'cancel'=取り消し（記録なし）
/* 🔴 2026-08-05 修正：以前は Firestore の削除を待たずに「削除しました」と出していた。
   サーバーが拒否した（権限・通信）場合、**番号台帳には「削除済」・在庫にも残る二重状態**になり、
   リアルタイム同期で車が復活してきて「消したのに戻ってきた」になっていた。
   → **サーバーの削除が通ってから**画面とメッセージを確定させる。失敗したら元に戻す。 */
async function closeDeleteCarConfirm(mode) {
  document.getElementById('confirm-delete-car').classList.remove('open');
  if (!mode || !_deletingCarId) {
    _deletingCarId = null;
    return;
  }
  const idx = cars.findIndex(c => c.id === _deletingCarId);
  if (idx < 0) { _deletingCarId = null; return; }
  const removed = cars[idx];

  // v2.27.0: 削除も操作ログ（auditLogs）に残す。これまで削除は一切ログに残らず
  //          「誰がいつ消したか」を追えなかった。splice前に記録（addLogがcars内のcarNumを拾えるように）。
  if (typeof addLog === 'function') {
    const soldMark = (removed.col === 'done') ? '【納車完了＝売れた車】' : (removed.col === 'delivery' ? '【納車準備＝売約済み】' : '');
    const actLabel = (mode === 'formal')
      ? `車両を正式に削除（管理番号リストに残す）${soldMark}`
      : `車両を削除・取り消し（番号は再利用可）${soldMark}`;
    try { addLog(removed.id, actLabel); } catch (e) { console.error('[car-detail] 削除ログ記録に失敗', e); }
  }

  // v2.16.0: 「正式に削除」なら deletedCars コレクションに最小情報を記録（番号台帳）
  let _delRec = null;
  if (mode === 'formal' && window.dbDeleted) {
    const rec = {
      id: removed.id,
      num: removed.num || '',
      maker: removed.maker || '',
      model: removed.model || '',
      grade: removed.grade || '',
    };
    _delRec = rec;   /* ★台帳への記録は「本体の削除が通ってから」書く（下） */
  }
  // 'cancel'（取り消し）の場合は何も記録に残さない＝番号は再利用可

  // 🔴 まず本体を消す。ここが通らなければ、台帳にも書かないし画面からも消さない。
  if (window.dbCars) {
    try {
      await window.dbCars.deleteCar(removed.id);
    } catch (e) {
      console.error('[car-detail] delete failed', e);
      _deletingCarId = null;
      showToast('削除できませんでした。そのまま残しています（通信または権限を確認してください）', 'CF-1001');
      return;
    }
  }
  cars.splice(idx, 1);
  // 台帳（管理番号リスト）への記録＝本体が消えたあとに書く
  if (_delRec && window.dbDeleted) {
    window.dbDeleted.saveDeletedCar(_delRec).catch(e => console.error('[car-detail] saveDeletedCar failed', e));
  }
  // v1.5.10: Storage の写真も削除（fire-and-forget）
  if (window.dbStorage && window.dbStorage.deleteCarPhoto) {
    window.dbStorage.deleteCarPhoto(removed.id);
  }
  // v1.8.40: 編集中／詳細表示中の車両IDが削除済みの ID を指したままだと、
  //          以降の realtime 同期で「保護対象」と誤判定されて再生成される恐れがある。
  //          念のため両方クリアしておく（納車準備→削除でダッシュボード見込みが残る不具合の対策）。
  if (typeof editingCarId !== 'undefined' && String(editingCarId) === String(removed.id)) {
    editingCarId = null;
  }
  if (typeof activeDetailCarId !== 'undefined' && String(activeDetailCarId) === String(removed.id)) {
    activeDetailCarId = null;
  }
  // 開いているモーダルを両方閉じる
  closeModal('modal-car');
  closeModal('modal-detail');
  if (typeof renderDashboard === 'function') renderDashboard();
  renderAll();
  const label = (mode === 'formal') ? '正式に削除しました（管理番号リストに残ります）' : '取り消しました（番号は再利用できます）';
  showToast(`${removed.maker} ${removed.model} を${label}`);
  _deletingCarId = null;
}
