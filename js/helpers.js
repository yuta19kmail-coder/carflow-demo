// ========================================
// helpers.js
// 共通ヘルパー関数
// 日付計算、価格整形、トースト表示、モーダル開閉、ログ追加
// ========================================

// v2.20.1: simpleモード（チェックリスト無し）の大タスク完了判定。
//   state[taskId] は boolean（toggle）／mkTaskStateの空オブジェクト{}／旧チェックリストの{item:true,…}。
//   ⚠ 空オブジェクト{} や 全false の {item:false} は「未完了」とする（!!{}が常にtrueになる罠を回避）。
//   これがないと、納車準備に入った瞬間に simple な大タスク（納車整備/納車準備など）が
//   自動で「完了」表示になる（ログ無し）バグが起きる。
function _simpleTaskDone(v) {
  if (v === true) return true;
  if (v && typeof v === 'object') return Object.values(v).some(Boolean);
  return false;
}

// v2.26.1: 顧客名のスペースは半角に統一。全角スペース(　)も半角に、連続スペースは1個に、前後は除去。
//   （\s は全角スペース U+3000 も含むので一括で半角化できる）
function normCustomerName(name) {
  return String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
}
// v2.26.0: 顧客名の表示。保存は名前だけ（例：山田 たろう）、表示時に「様」を自動付与。
//   既に 様/さま/御中/殿/さん 等で終わる場合は二重付与しない（法人「○○御中」などに対応）。
function formatCustomerName(name) {
  const s = normCustomerName(name);
  if (!s) return '';
  if (/(様|さま|御中|殿|どの|さん|ちゃん|くん)$/.test(s)) return s;
  return s + ' 様';
}
// 顧客名チップのHTML（スレート配色・人アイコン・長い名前は…省略＋ホバーで全文）。
//   variant: 省略時=カード用 / 'title'=詳細モーダルのタイトル横。空名なら空文字を返す（＝出さない）。
function customerChipHTML(name, variant) {
  const disp = formatCustomerName(name);
  if (!disp) return '';
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (x => String(x == null ? '' : x));
  const big = variant === 'title';
  const cls = big ? 'cc-customer cc-customer-title' : 'cc-customer';
  const sz = big ? 15 : 14;
  return `<span class="${cls}" title="${esc(disp)}">`
    + `<svg class="cc-customer-ic" viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M5 21a7 7 0 0 1 14 0"></path></svg>`
    + `<span class="cc-customer-name">${esc(disp)}</span>`
    + `</span>`;
}

// タスクの初期状態を生成
function mkTaskState(tasks) {
  const s = {};
  tasks.forEach(t => {
    if (t.type === 'toggle') {
      s[t.id] = false;
    } else {
      s[t.id] = {};
      t.sections.forEach(sec => sec.items.forEach(i => s[t.id][i.id] = false));
    }
  });
  return s;
}

// 日付文字列に日数を加算
function dateAddDays(str, n) {
  const d = new Date(str);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// 今日の日付文字列 (YYYY-MM-DD)
const todayStr = () => new Date().toISOString().split('T')[0];

// ========================================
// v1.8.83: 期間集計用の到達日（裏方データ・UI非表示）
// ----------------------------------------
// car.exhibitedAt（展示開始日）を遷移パターンに応じて自動セット/クリアする
// 既に値があれば保持（再入場でも初回日付を維持。誤操作で戻された場合のみクリア）
// ----------------------------------------
// fromCol: 遷移前の car.col（null=新規登録）
// toCol:   遷移後の car.col
function _applyColTransitionDates(car, fromCol, toCol) {
  if (!car) return;
  // 展示列に入った瞬間：初回なら今日の日付をセット
  if (toCol === 'exhibit' && !car.exhibitedAt) {
    car.exhibitedAt = todayStr();
  }
  // 展示列から「再生／仕入／その他」に戻された場合：誤操作扱いでクリア
  if (fromCol === 'exhibit' &&
      (toCol === 'regen' || toCol === 'purchase' || toCol === 'other')) {
    car.exhibitedAt = '';
  }
  // 展示 → 納車準備／納車完了 はそのまま保持（正常パイプライン）
  // 売約キャンセルで delivery/done → exhibit に戻る場合は、既存値あれば保持
}

// ユニークIDを生成
const uid = () => 'c' + Date.now() + '-' + Math.floor(Math.random()*1000);

// 日付を M/D 形式で整形
const fmtDate = s => {
  if (!s) return '—';
  const d = new Date(s);
  return `${d.getMonth()+1}/${d.getDate()}`;
};

// 指定日からの経過日数
const daysSince = s => {
  if (!s) return 0;
  return Math.floor((new Date() - new Date(s)) / 86400000);
};

// 指定日までの残り日数（負なら過ぎている）
const daysDiff = s => {
  if (!s) return null;
  return Math.ceil((new Date(s) - new Date()) / 86400000);
};

// ボディサイズから絵文字を取得
const carEmoji = s => ({
  軽自動車:'🚙',
  コンパクト:'🚗',
  ミニバン:'🚐',
  SUV:'🛻',
  セダン:'🚘',
  トラック:'🚚'
}[s] || '🚗');

// 価格を「XX.X万円」形式に整形
const fmtPrice = p => {
  if (!p) return '価格未設定';
  return `${(Number(p)/10000).toFixed(1)}万円`;
};

// v1.8.46: 「総額（本体）」のW表示用。
//   - 総額あり・本体あり → 両方の整形済み文字列を返す（呼び元で組み立てる）
//   - 総額のみ           → totalDisp のみ
//   - 本体のみ           → bodyDisp のみ（旧データ互換）
// 戻り値: { totalDisp, bodyDisp, hasTotal, hasBody }
const fmtPriceTwo = (totalP, bodyP) => {
  const hasTotal = !!totalP && Number(totalP) > 0;
  const hasBody  = !!bodyP  && Number(bodyP)  > 0;
  return {
    totalDisp: hasTotal ? `${(Number(totalP)/10000).toFixed(1)}万円` : '',
    bodyDisp:  hasBody  ? `${(Number(bodyP) /10000).toFixed(1)}万円` : '',
    hasTotal, hasBody,
  };
};

// v1.8.59: 各金額フィールドの税扱いラベル（「税込」「税抜」）を返す
//   field: 'body'（本体価格）/ 'total'（総額）/ 'dashboard'（ダッシュボード金額）
//   appSettings.priceTax[field] が 'excl' なら「税抜」、それ以外は「税込」
function getTaxLabel(field) {
  try {
    const ps = (typeof appSettings !== 'undefined' && appSettings && appSettings.priceTax) || {};
    return (ps[field] === 'excl') ? '税抜' : '税込';
  } catch (e) {
    return '税込';
  }
}

// v1.8.67: 消費税率を 0.10 形式で返す（appSettings.priceTax.rate が % 単位、デフォルト10）
function getTaxRate() {
  try {
    const ps = (typeof appSettings !== 'undefined' && appSettings && appSettings.priceTax) || {};
    const r = Number(ps.rate);
    if (Number.isFinite(r) && r >= 0 && r <= 100) return r / 100;
  } catch (e) {}
  return 0.10;
}

// v1.8.67: 金額を税モード間で換算（10% 等の比率は getTaxRate を使用）
//   fromMode / toMode は 'incl'（税込）/ 'excl'（税抜）
function convertTax(amount, fromMode, toMode) {
  const n = Number(amount) || 0;
  if (!n) return 0;
  if (fromMode === toMode) return n;
  const r = getTaxRate();
  if (fromMode === 'excl' && toMode === 'incl') return n * (1 + r);
  if (fromMode === 'incl' && toMode === 'excl') return n / (1 + r);
  return n;
}

// v1.8.71: 納車完了時に「その時の税設定」をスナップショットとして固定。
//   過去の販売実績は、設定を後から変えても当時の税扱いで集計・表示できる。
function snapshotPriceTax() {
  const ps = (typeof appSettings !== 'undefined' && appSettings && appSettings.priceTax) || {};
  return {
    body: (ps.body === 'excl') ? 'excl' : 'incl',
    total: (ps.total === 'excl') ? 'excl' : 'incl',
    rate: (typeof ps.rate === 'number' && ps.rate >= 0 && ps.rate <= 100) ? ps.rate : 10,
    capturedAt: (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0,10),
  };
}

// v1.8.71: 車に紐づく税スナップショットを取得。
//   スナップショットあり → それ
//   スナップショットなし（旧データ）→ 現在の appSettings から組み立てる（旧挙動互換）
function getCarPriceTax(car) {
  if (car && car.priceTaxSnapshot && typeof car.priceTaxSnapshot === 'object') {
    return car.priceTaxSnapshot;
  }
  const ps = (typeof appSettings !== 'undefined' && appSettings && appSettings.priceTax) || {};
  return {
    body: (ps.body === 'excl') ? 'excl' : 'incl',
    total: (ps.total === 'excl') ? 'excl' : 'incl',
    rate: (typeof ps.rate === 'number') ? ps.rate : 10,
    capturedAt: null,
  };
}

// v1.8.71: 車1台あたりの金額を取得（販売実績用）。
//   - 集計の元データ（dashboardSource）に従って本体 or 総額を選ぶ
//   - 元データの税モードは「その車のスナップショット」を参照
//   - 表示モード（dashboardMode）に変換する
//   税率も「その車のスナップショット」の rate を使う（換算式は内製）
function _amountFromCarWithSnapshot(car, dashboardSource, dashboardMode) {
  if (!car) return 0;
  const snap = getCarPriceTax(car);
  const r = (Number(snap.rate) || 10) / 100;
  let amount, fromMode;
  if (dashboardSource === 'total' && Number(car.totalPrice) > 0) {
    amount = Number(car.totalPrice);
    fromMode = snap.total;
  } else {
    amount = Number(car.price) || 0;
    fromMode = snap.body;
  }
  if (!amount) return 0;
  if (fromMode === dashboardMode) return amount;
  if (fromMode === 'excl' && dashboardMode === 'incl') return amount * (1 + r);
  if (fromMode === 'incl' && dashboardMode === 'excl') return amount / (1 + r);
  return amount;
}

// トースト通知
//   🔢 2026-08-17 第2引数＝エラー番号（'CF-0412'）。渡すと2行目の右端に error：CF-0412 と出て、押すとコピーできる。
//   ⚠ 付けるのは「通らなかった」時だけ（決めごとは js/errcode-cf.js の頭）。
const showToast = (msg, code) => {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  if (code && window.CFErr) CFErr.toast(t, code);
  setTimeout(() => t.classList.remove('show'), 2200);
};

// モーダルを閉じる
const closeModal = id => {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
};

// 操作ログ追加
// v1.7.30: userUid を一緒に保存。
//   既存ログ（uid なし）の互換性のため user 文字列も残す。
//   集計時は uid 優先、無ければ user 文字列でフォールバック。
function addLog(carId, action) {
  const car = cars.find(c => c.id === carId) || (typeof archivedCars !== 'undefined' ? archivedCars.find(c => c.id === carId) : null);
  const now = new Date();
  const time = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const myUid = (window.fb && window.fb.currentUser && window.fb.currentUser.uid) || null;
  const entry = {
    time,
    userUid: myUid,
    user: currentUser || '—',
    carNum: car ? car.num : '—',
    action,
    carId: carId || null,
  };
  if (car) {
    if (!car.logs) car.logs = [];
    car.logs.unshift(entry);
  }
  globalLogs.unshift(entry);
  if (globalLogs.length > 1000) globalLogs.length = 1000; // v2.27.0: 200→1000（読込上限と揃える）
  // v1.7.24: 操作ログの新規お知らせバッジは廃止（ゆうた指示）
  // v1.5.4: 横断 auditLogs collection にも append（fire-and-forget）
  if (window.dbAudit) {
    window.dbAudit.appendAuditLog(entry);
  }
}

// ========================================
// 管理番号の表記ゆれ吸収＆文中リンク化（付箋・操作ログで共用）
// v2.7.1 で付箋に導入したルールを v2.7.2 で共通化。
// ========================================
// 全角英数字／全角ハイフンを半角化 → 大文字化 → ハイフン・空白を除去。
//   例：KM-0100 / km-0100 / KM0100 / ＫＭ－0100 → すべて "KM0100"
//   数字はゼロ込みでそのまま保持するため、KM100 と KM-0100 は別物として扱う。
function normCarNum(s) {
  if (!s) return '';
  return String(s)
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)) // 全角英数→半角
    .replace(/[－ー−―‐]/g, '-')   // 各種ハイフンを半角ハイフンに
    .toUpperCase()
    .replace(/[-\s]/g, '');        // ハイフン・空白を除去
}

// 文中の管理番号（例 KM-0100）を車両詳細リンクに変換する共通関数。
//   ・付箋（タイトル/本文）・操作ログのメッセージで共用
//   ・該当する在庫車（cars）がある場合のみリンク化。なければただの文字のまま
//   ・引数は未エスケープの生文字列を渡す（内部で HTML エスケープしてから処理）
function linkifyCarNums(text) {
  const esc = (typeof escapeHtml === 'function')
    ? escapeHtml(text == null ? '' : text)
    : String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (typeof cars === 'undefined' || !Array.isArray(cars)) return esc;
  // K/M（半角・全角・大小）＋任意のハイフン＋数字（半角/全角）を拾う
  const re = /[KkＫｋ][MmＭｍ][-－ー−―‐]?[0-9０-９]{1,6}/g;
  return esc.replace(re, (m) => {
    const norm = normCarNum(m);
    const car = cars.find(c => normCarNum(c.num) === norm);
    if (!car) return m;
    return `<a class="bn-carlink" onclick="event.stopPropagation();if(typeof openDetail==='function')openDetail('${car.id}');">${m}</a>`;
  });
}

// ========================================
// 年式（西暦↔和暦）変換
// ========================================
function seirekiToWareki(y) {
  y = Number(y);
  if (!y) return null;
  if (y >= 2019) return {era:'令和', n:y - 2018};
  if (y >= 1989) return {era:'平成', n:y - 1988};
  if (y >= 1926) return {era:'昭和', n:y - 1925};
  return null;
}
function warekiToSeireki(era, n) {
  n = Number(n);
  if (!n) return null;
  if (era === '令和' || era === 'R' || era === 'r') return 2018 + n;
  if (era === '平成' || era === 'H' || era === 'h') return 1988 + n;
  if (era === '昭和' || era === 'S' || era === 's') return 1925 + n;
  return null;
}
function parseYearInput(str) {
  if (!str) return null;
  const s = String(str).trim();
  const m1 = s.match(/(\d{4})/);
  if (m1 && Number(m1[1]) >= 1900 && Number(m1[1]) <= 2100) return Number(m1[1]);
  if (/^\d{2,4}$/.test(s)) {
    const n = Number(s);
    if (n >= 1900 && n <= 2100) return n;
  }
  const m2 = s.match(/^(令和|平成|昭和|R|r|H|h|S|s)\s*(\d{1,2})年?$/);
  if (m2) return warekiToSeireki(m2[1], m2[2]);
  return null;
}
function fmtYearDisplay(y) {
  const n = Number(y);
  if (!n) return String(y || '');
  const w = seirekiToWareki(n);
  return w ? `${w.era}${w.n}｜${n}` : String(n);
}
function normalizeYear(input) {
  const y = parseYearInput(input);
  if (!y) return input || '';
  return fmtYearDisplay(y);
}

// ========================================
// 売約関連ヘルパー
// ========================================
const isDeliveryPhase = col => col === 'delivery' || col === 'done';
const daysSinceContract = car => {
  if (!car.contract) return 0;
  const base = car.contractDate || car.purchaseDate;
  return daysSince(base);
};

// ========================================
// 警告段階の判定
// ========================================
// 在庫日数から警告段階（しきい値オブジェクト）を返す。該当なしはnull
function invWarnTier(days) {
  const tiers = (appSettings?.invWarn || []).filter(t => t.on).sort((a,b) => b.days - a.days);
  for (const t of tiers) if (days >= t.days) return t;
  return null;
}
// 納車残日数から警告段階（しきい値オブジェクト）を返す。該当なしはnull
// 配列の日数は「以下」判定。小さい日数ほど緊急
function delWarnTier(diff) {
  if (diff == null || diff < 0) return null;
  const tiers = (appSettings?.delWarn || []).filter(t => t.on).sort((a,b) => a.days - b.days);
  for (const t of tiers) if (diff <= t.days) return t;
  return null;
}

// ========================================
// 定休日の判定は CarFlow では持たない（v2.38.0）
// ========================================
// 🔴 休みかどうかは MHS の営業日カレンダー 1本＝ PitCal.isClosed(日付)（js/cal-pit.js）。
//    毎週の定休だけでなく、臨時休業・お盆・年末年始・特別営業・午前休み／早締めまで入っている。
//    ⚠ ここに自前の判定を作り直さないこと（二重管理に戻る）。撤去＝ isClosedByRules()

// ========================================
// 年月キー関連
// ========================================
// Date または 日付文字列 → "YYYY-MM"
function ymKey(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
}
// 年月数値 → "YYYY-MM"
function ymKeyFromYM(y, m) {
  return `${y}-${String(m).padStart(2,'0')}`;
}
// 年度キー (e.g. yearStart=4 なら 2026年4月〜2027年3月 は FY2026)
function fyKey(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  const ys = (appSettings?.goals?.yearStart) || 1;
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const fy = (m >= ys) ? y : y - 1;
  return `FY${fy}`;
}
// 月次目標を取得（未設定ならデフォルト）
function monthlyGoal(y, m) {
  const key = ymKeyFromYM(y, m);
  const g = appSettings?.goals;
  if (!g) return {sales: 0, count: 0};
  if (g.monthly && g.monthly[key]) return g.monthly[key];
  return g.default || {sales: 0, count: 0};
}

// ========================================
// 売上計上日（モード別）
// ========================================
// 設定モードに応じて、売上計上日を返す
function recogDate(car) {
  const mode = appSettings?.goals?.revRecog || 'delivery';
  if (mode === 'contract') return car.contract ? car.contractDate : null;
  // delivery
  return (car.col === 'done' && car.deliveryDate) ? car.deliveryDate : null;
}
// アーカイブ済みも含めた売上計上日（アーカイブはdeliveryDate=売上確定）
function recogDateAny(car) {
  const mode = appSettings?.goals?.revRecog || 'delivery';
  if (mode === 'contract') return car.contractDate || null;
  // delivery
  if (car._archivedAt || car.col === 'done') return car.deliveryDate || null;
  return null;
}

// ========================================
// v1.0.35: タスク期日超過判定
// ========================================

// タスクが「完了」かどうか（getOverdueTasks 内部用）
// v1.7.17: 計算ロジックを progress.js の _isTaskComplete に委譲して統一。
//          これで mode='checklist' の toggle / t_equip / t_complete も自動で正しく判定される。
function _isTaskDoneForOverdue(car, task, isDelivery) {
  if (typeof _isTaskComplete === 'function') {
    const phase = isDelivery ? 'delivery' : 'regen';
    // v1.8.51: car を渡して選択制タスクのopt-in判定も加味
    const tasks = (phase === 'delivery'
      ? (typeof getActiveDeliveryTasks === 'function' ? getActiveDeliveryTasks(car) : [])
      : (typeof getActiveRegenTasks === 'function' ? getActiveRegenTasks(car) : [])
    );
    return _isTaskComplete(car, task, tasks);
  }
  // フォールバック（_isTaskComplete が未ロードの極端なケース）
  const state = isDelivery ? car.deliveryTasks : car.regenTasks;
  if (!state) return false;
  if (task.type === 'toggle') return !!state[task.id];
  if (task.type === 'workflow' && Array.isArray(task.sections)) {
    let allDone = true;
    task.sections.forEach(s => s.items.forEach(i => {
      if (!state[task.id] || !state[task.id][i.id]) allDone = false;
    }));
    return allDone;
  }
  return !!state[task.id];
}

// 車両の期日超過タスク一覧を返す
// 戻り値：[{ taskId, name, icon, phase, target, limit, deadline, overdueDays, severity, kind }, ...]
//   regen: 仕入れから N 日経過 → overdueDays = (経過日数 - target)
//   delivery: 納車予定まで残 N 日切ってる → overdueDays = (target - 残日数)
// 完了済みタスク／期日設定なしは含めない
// v1.8.80: target/limit の2軸判定に対応。severity: 'yellow'（目標超）/'orange'（限界本日）/'red'（限界超）
function getOverdueTasks(car) {
  if (!car) return [];
  // その他列・納車完了は対象外
  if (car.col === 'other' || car.col === 'done') return [];
  const result = [];

  const pushIfOver = (t, phase, base, effTarget, effLimit) => {
    // 完了済みは除外
    if (_isTaskDoneForOverdue(car, t, phase === 'delivery')) return;
    // base = 経過日数（regen）or 残日数（delivery）
    let overdue, severity;
    if (phase === 'regen') {
      overdue = base - effTarget; // 目標 から N日 超過
      if (overdue <= 0) return;
      if (base > effLimit)        severity = 'red';
      else if (base === effLimit) severity = 'orange';
      else                        severity = 'yellow';
    } else {
      overdue = effTarget - base; // 目標 から N日 超過（base=remain）
      if (overdue <= 0) return;
      if (base < effLimit)        severity = 'red';
      else if (base === effLimit) severity = 'orange';
      else                        severity = 'yellow';
    }
    result.push({
      taskId: t.id, name: t.name, icon: t.icon || '📋',
      phase, target: effTarget, limit: effLimit,
      deadline: effTarget,  // 後方互換
      overdueDays: overdue, severity, kind: phase,
    });
  };

  // === 再生フェーズ ===
  if (car.col !== 'delivery') {
    const inv = (typeof daysSince === 'function') ? daysSince(car.purchaseDate) : 0;
    const regenTasks = (typeof getActiveRegenTasks === 'function') ? getActiveRegenTasks(car) : [];
    regenTasks.forEach(t => {
      const dl = (typeof getTaskDeadlines === 'function') ? getTaskDeadlines(t.id, 'regen') : { target: null, limit: null };
      if (dl.target == null && dl.limit == null) return;
      const effTarget = (dl.target != null) ? dl.target : dl.limit;
      const effLimit  = (dl.limit  != null) ? dl.limit  : dl.target;
      pushIfOver(t, 'regen', inv, effTarget, effLimit);
    });
  }

  // === 納車フェーズ ===
  if (car.col === 'delivery' && car.deliveryDate) {
    const remain = (typeof daysDiff === 'function') ? daysDiff(car.deliveryDate) : null;
    if (remain != null) {
      const delTasks = (typeof getActiveDeliveryTasks === 'function') ? getActiveDeliveryTasks(car) : [];
      delTasks.forEach(t => {
        const dl = (typeof getTaskDeadlines === 'function') ? getTaskDeadlines(t.id, 'delivery') : { target: null, limit: null };
        if (dl.target == null && dl.limit == null) return;
        const effTarget = (dl.target != null) ? dl.target : dl.limit;
        const effLimit  = (dl.limit  != null) ? dl.limit  : dl.target;
        pushIfOver(t, 'delivery', remain, effTarget, effLimit);
      });
    }
  }

  return result;
}

// 全車両を走査して、期日超過タスクを持つ車両のリストを返す
// 戻り値：[{ car, overdueTasks: [...] }, ...]（overdueTasks.length>0 の車両のみ）
function getCarsWithOverdueTasks() {
  if (typeof cars === 'undefined' || !Array.isArray(cars)) return [];
  const result = [];
  cars.forEach(c => {
    const overdue = getOverdueTasks(c);
    if (overdue.length > 0) result.push({ car: c, overdueTasks: overdue });
  });
  return result;
}

// v1.0.41: 「完全完了」(d_complete) の自動判定
// 有効な納車タスク（d_complete を除く）が全部完了していれば true
// v1.7.17: 中身を _isTaskComplete に委譲。これで mode='checklist' の toggle も
//          ChecklistTemplate ベースで「全項目チェック済み」を判定できるようになる。
function isDeliveryAllOtherTasksDone(car) {
  return _isAllOtherTasksDone(car, 'delivery', 'd_complete');
}

// v1.7.17: 再生側の自動判定（t_complete 用）
function isRegenAllOtherTasksDone(car) {
  return _isAllOtherTasksDone(car, 'regen', 't_complete');
}

// v1.7.17: delivery / regen 共通の「自分以外の有効タスクが全完了か」判定
function _isAllOtherTasksDone(car, phase, selfTaskId) {
  if (!car) return false;
  const getActive = (phase === 'delivery')
    ? (typeof getActiveDeliveryTasks === 'function' ? getActiveDeliveryTasks : null)
    : (typeof getActiveRegenTasks === 'function' ? getActiveRegenTasks : null);
  const tasks = getActive ? getActive(car) : [];
  const others = tasks.filter(t => t.id !== selfTaskId);
  if (!others.length) return false;
  return others.every(t => {
    if (typeof _isTaskComplete === 'function') return _isTaskComplete(car, t, tasks);
    if (typeof calcSingleProg === 'function') {
      const p = calcSingleProg(car, t.id, tasks);
      return p && p.pct >= 100;
    }
    return false;
  });
}
