// ========================================
// settings.js
// 設定画面：アコーディオン、警告エディタ、通知、目標設定、定休日ルール
// ========================================

// v1.7.25: アラート初期値（state.js の appSettings の初期値と同じ内容）
//   設定画面の「↺ デフォルトに戻す」で参照する。
const DEFAULT_INV_WARN = [
  { days: 15, on: true, color: '#fcd34d', bg: 'rgba(245,210,59,.18)', label: '注意' },
  { days: 30, on: true, color: '#fb923c', bg: 'rgba(251,146,60,.20)', label: '要対応' },
  { days: 45, on: true, color: '#fca5a5', bg: 'rgba(239,68,68,.22)',  label: '危険' },
];
const DEFAULT_DEL_WARN = [
  { days: 7, on: true, color: '#93c5fd', bg: 'rgba(55,138,221,.20)',  label: '準備' },
  { days: 3, on: true, color: '#fcd34d', bg: 'rgba(245,210,59,.20)',  label: '直前' },
  { days: 0, on: true, color: '#fca5a5', bg: 'rgba(239,68,68,.22)',   label: '当日' },
];

// アコーディオン開閉（属性ベースで堅牢に）
function toggleAcc(head) {
  const card = head.closest('.acc-card');
  if (!card) return;
  const cur = card.getAttribute('data-acc-open');
  card.setAttribute('data-acc-open', cur === '1' ? '0' : '1');
}

// ========================================
// 在庫警告エディタ
// ========================================
function renderInvWarnEditor() {
  const el = document.getElementById('inv-warn-editor');
  if (!el) return;
  el.innerHTML = appSettings.invWarn.map((t, i) => `
    <div class="warn-row">
      <div class="wr-dot" style="background:${t.color}"></div>
      <div class="wr-label">${t.label}（${t.days}日以上）</div>
      <input type="number" min="1" max="365" value="${t.days}" onchange="onInvWarnDaysChange(${i}, this.value)">
      <div class="toggle${t.on?' on':''}" onclick="toggleInvWarn(${i})"></div>
    </div>
  `).join('');
}
function onInvWarnDaysChange(i, v) {
  const n = Math.max(1, parseInt(v, 10) || 1);
  appSettings.invWarn[i].days = n;
  renderInvWarnEditor();
  renderAll();
  renderDashboard();
  if (window.saveSettings) saveSettings(); // v1.5.2
}
function toggleInvWarn(i) {
  appSettings.invWarn[i].on = !appSettings.invWarn[i].on;
  renderInvWarnEditor();
  renderAll();
  renderDashboard();
  if (window.saveSettings) saveSettings(); // v1.5.2
}

// v1.7.25: 在庫警告をデフォルトに戻す
function resetInvWarnDefaults() {
  if (!confirm('在庫日数の警告を初期値に戻します。\n（注意=15日 / 要対応=30日 / 危険=45日、すべてON）\nよろしいですか？')) return;
  appSettings.invWarn = DEFAULT_INV_WARN.map(t => ({ ...t }));
  renderInvWarnEditor();
  renderAll();
  renderDashboard();
  if (window.saveSettings) saveSettings();
  if (typeof showToast === 'function') showToast('在庫日数の警告を初期値に戻しました');
}

// ========================================
// 納車残日数警告エディタ
// ========================================
function renderDelWarnEditor() {
  const el = document.getElementById('del-warn-editor');
  if (!el) return;
  el.innerHTML = appSettings.delWarn.map((t, i) => `
    <div class="warn-row">
      <div class="wr-dot" style="background:${t.color}"></div>
      <div class="wr-label">${t.label}（残${t.days}日以下）</div>
      <input type="number" min="0" max="90" value="${t.days}" onchange="onDelWarnDaysChange(${i}, this.value)">
      <div class="toggle${t.on?' on':''}" onclick="toggleDelWarn(${i})"></div>
    </div>
  `).join('');
}
function onDelWarnDaysChange(i, v) {
  const n = Math.max(0, parseInt(v, 10) || 0);
  appSettings.delWarn[i].days = n;
  renderDelWarnEditor();
  renderAll();
  renderDashboard();
  if (window.saveSettings) saveSettings(); // v1.5.2
}
function toggleDelWarn(i) {
  appSettings.delWarn[i].on = !appSettings.delWarn[i].on;
  renderDelWarnEditor();
  renderAll();
  renderDashboard();
  if (window.saveSettings) saveSettings(); // v1.5.2
}

// v1.7.25: 納車残日数の警告をデフォルトに戻す
function resetDelWarnDefaults() {
  if (!confirm('納車残日数の警告を初期値に戻します。\n（準備=7日 / 直前=3日 / 当日=0日、すべてON）\nよろしいですか？')) return;
  appSettings.delWarn = DEFAULT_DEL_WARN.map(t => ({ ...t }));
  renderDelWarnEditor();
  renderAll();
  renderDashboard();
  if (window.saveSettings) saveSettings();
  if (typeof showToast === 'function') showToast('納車残日数の警告を初期値に戻しました');
}

// ========================================
// デフォルト納車日（リードタイム）
// ========================================
function onLeadDaysChange(inp) {
  const n = Math.max(1, parseInt(inp.value, 10) || 14);
  appSettings.deliveryLeadDays = n;
  renderDashboard();
  if (window.saveSettings) saveSettings(); // v1.5.2
}
function refreshLeadDaysUI() {
  const el = document.getElementById('lead-days-inp');
  if (el) el.value = appSettings.deliveryLeadDays;
}

// v1.8.59: 金額の税扱い設定（本体/総額/ダッシュボード）
// v1.8.67: dashboardSource ('body'/'total') と rate (%) も同じハンドラで扱う
function onPriceTaxChange(field, value) {
  if (!appSettings.priceTax) {
    appSettings.priceTax = { body:'incl', total:'incl', dashboard:'incl', dashboardSource:'body', rate:10, exhibitSource:'total' };
  }
  if (field === 'dashboardSource' || field === 'exhibitSource') {
    appSettings.priceTax[field] = (value === 'total') ? 'total' : 'body';
  } else {
    // body / total / dashboard — 'incl' or 'excl'
    appSettings.priceTax[field] = (value === 'excl') ? 'excl' : 'incl';
  }
  if (typeof renderAll === 'function') renderAll();
  if (typeof renderDashboard === 'function') renderDashboard();
  if (window.saveSettings) saveSettings();
}
window.onPriceTaxChange = onPriceTaxChange;

// v1.8.67: 消費税率の変更
function onTaxRateChange(value) {
  if (!appSettings.priceTax) {
    appSettings.priceTax = { body:'incl', total:'incl', dashboard:'incl', dashboardSource:'body', rate:10 };
  }
  let r = Number(value);
  if (!Number.isFinite(r) || r < 0) r = 0;
  if (r > 100) r = 100;
  appSettings.priceTax.rate = r;
  if (typeof renderAll === 'function') renderAll();
  if (typeof renderDashboard === 'function') renderDashboard();
  if (window.saveSettings) saveSettings();
}
window.onTaxRateChange = onTaxRateChange;

// v1.8.75: 店舗情報の変更ハンドラ
function onCompanyInfoChange(field, value) {
  if (!appSettings.companyInfo) appSettings.companyInfo = { name:'', address:'', phone:'', email:'', url:'', logo:'', note:'' };
  appSettings.companyInfo[field] = String(value || '').trim();
  if (window.saveSettings) saveSettings();
  if (typeof showToast === 'function') showToast('店舗情報を保存しました');
}
window.onCompanyInfoChange = onCompanyInfoChange;

function onCompanyLogoPick(inp) {
  if (!inp || !inp.files || !inp.files[0]) return;
  const file = inp.files[0];
  const reader = new FileReader();
  reader.onload = function (e) {
    const dataUrl = e.target.result;
    if (!appSettings.companyInfo) appSettings.companyInfo = { name:'', address:'', phone:'', email:'', url:'', logo:'', note:'' };
    appSettings.companyInfo.logo = dataUrl;
    _refreshCompanyLogoPreview();
    if (window.saveSettings) saveSettings();
    if (typeof showToast === 'function') showToast('ロゴを設定しました');
  };
  reader.readAsDataURL(file);
  inp.value = '';
}
window.onCompanyLogoPick = onCompanyLogoPick;

function clearCompanyLogo() {
  if (!appSettings.companyInfo) return;
  appSettings.companyInfo.logo = '';
  _refreshCompanyLogoPreview();
  if (window.saveSettings) saveSettings();
  if (typeof showToast === 'function') showToast('ロゴをクリアしました');
}
window.clearCompanyLogo = clearCompanyLogo;

function _refreshCompanyLogoPreview() {
  const el = document.getElementById('company-logo-preview');
  if (!el) return;
  const logo = (appSettings.companyInfo && appSettings.companyInfo.logo) || '';
  if (logo) {
    el.innerHTML = `<img src="${logo}" style="max-width:100%;max-height:100%;object-fit:contain">`;
  } else {
    el.innerHTML = '未設定';
  }
}

function refreshCompanyInfoUI() {
  const ci = (appSettings && appSettings.companyInfo) || {};
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal('inp-company-name', ci.name);
  setVal('inp-company-address', ci.address);
  setVal('inp-company-phone', ci.phone);
  setVal('inp-company-email', ci.email);
  setVal('inp-company-url', ci.url);
  setVal('inp-company-note', ci.note);
  _refreshCompanyLogoPreview();
}
window.refreshCompanyInfoUI = refreshCompanyInfoUI;

function refreshPriceTaxUI() {
  const ps = (appSettings && appSettings.priceTax) || {};
  ['body','total','dashboard'].forEach(f => {
    const el = document.getElementById('price-tax-' + f);
    if (el) el.value = (ps[f] === 'excl') ? 'excl' : 'incl';
  });
  const srcEl = document.getElementById('price-tax-source');
  if (srcEl) srcEl.value = (ps.dashboardSource === 'total') ? 'total' : 'body';
  const exhEl = document.getElementById('price-tax-exhibit-source');
  if (exhEl) exhEl.value = (ps.exhibitSource === 'body') ? 'body' : 'total';
  const rateEl = document.getElementById('price-tax-rate');
  if (rateEl) {
    const r = Number(ps.rate);
    rateEl.value = (Number.isFinite(r) && r >= 0) ? r : 10;
  }
}
window.refreshPriceTaxUI = refreshPriceTaxUI;

// ========================================
// 通知設定エディタ
// ========================================
function renderNotifEditor() {
  const el = document.getElementById('notif-editor');
  if (!el) return;
  // 納車直前は「納車残日数の警告」、長期在庫は「在庫日数の警告」で代替できるため
  // 通知では作業停滞アラートのみを管理する
  const rows = [
    {key:'stall', title:'作業停滞アラート'},
  ];
  el.innerHTML = rows.map(r => {
    const c = appSettings.notif[r.key];
    return `
      <div class="setting-row" style="flex-wrap:wrap">
        <div style="flex:1;min-width:160px">
          <div style="font-size:13px;font-weight:600">${r.title}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:3px;line-height:1.5">${c.desc.replace(/N/g, `<strong style="color:var(--blue)">${c.days}</strong>`)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <input type="number" min="0" max="365" value="${c.days}" onchange="onNotifDaysChange('${r.key}', this.value)" style="width:64px;padding:5px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;text-align:right"><span style="font-size:11px;color:var(--text3)">日</span>
          <div class="toggle${c.on?' on':''}" onclick="toggleNotif('${r.key}')"></div>
        </div>
      </div>
    `;
  }).join('');
}
function onNotifDaysChange(key, v) {
  const n = Math.max(0, parseInt(v, 10) || 0);
  appSettings.notif[key].days = n;
  renderNotifEditor();
  renderDashboard();
  renderActions();
  if (window.saveSettings) saveSettings(); // v1.5.2
}
function toggleNotif(key) {
  appSettings.notif[key].on = !appSettings.notif[key].on;
  renderNotifEditor();
  renderDashboard();
  renderActions();
  if (window.saveSettings) saveSettings(); // v1.5.2
}

// ========================================
// 定休日ルール
// ========================================
function renderClosedRulesList() {
  const el = document.getElementById('closed-rules-list');
  if (!el) return;
  const dowLabel = ['日','月','火','水','木','金','土'];
  const rules = closedRules.filter(r => r.pattern !== 'weekly'); // weeklyは曜日ピッカー側で表示
  if (!rules.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--text3)">追加ルールなし（毎週以外の変則定休日はここに追加）</div>';
    return;
  }
  el.innerHTML = '<div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:6px">追加ルール</div>' +
    rules.map(r => {
      let txt = '';
      if (r.pattern === 'biweekly') txt = `隔週 ${dowLabel[r.dow]}曜`;
      if (r.pattern === 'nth') txt = `第${r.nth} ${dowLabel[r.dow]}曜`;
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
        <span>${txt}</span>
        <button onclick="removeClosedRule('${r.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px">✕</button>
      </div>`;
    }).join('');
}
function removeClosedRule(id) {
  closedRules = closedRules.filter(r => r.id !== id);
  renderClosedRulesList();
  if (typeof renderCalendar === 'function') renderCalendar();
  showToast('ルールを削除しました');
  if (window.saveSettings) saveSettings(); // v1.5.2
}
function openClosedRuleForm() {
  document.getElementById('cr-pattern').value = 'biweekly';
  document.getElementById('cr-dow').value = '2';
  document.getElementById('cr-nth').value = '1';
  onClosedRulePatternChange();
  document.getElementById('confirm-closed-rule').classList.add('open');
}
function closeClosedRuleForm() {
  document.getElementById('confirm-closed-rule').classList.remove('open');
}
function onClosedRulePatternChange() {
  const p = document.getElementById('cr-pattern').value;
  document.getElementById('cr-nth-row').style.display = p === 'nth' ? 'block' : 'none';
}
function saveClosedRule() {
  const pattern = document.getElementById('cr-pattern').value;
  const dow = parseInt(document.getElementById('cr-dow').value, 10);
  const rule = {id:'r'+Date.now(), pattern, dow};
  if (pattern === 'nth') rule.nth = parseInt(document.getElementById('cr-nth').value, 10);
  if (pattern === 'biweekly') rule.anchorYM = `${new Date().getFullYear()}-01`;
  closedRules.push(rule);
  closeClosedRuleForm();
  renderClosedRulesList();
  if (typeof renderCalendar === 'function') renderCalendar();
  showToast('休業ルールを追加しました');
  if (window.saveSettings) saveSettings(); // v1.5.2
}

// ========================================
// 目標設定エディタ
// ========================================
function renderGoalsEditor() {
  const el = document.getElementById('goals-editor');
  if (!el) return;
  const g = appSettings.goals;
  const now = new Date();
  // 表示する12ヶ月は「今の会計年度の開始月」から12ヶ月
  const ys = g.yearStart;
  let fyStartYear = now.getFullYear();
  if (now.getMonth()+1 < ys) fyStartYear--;
  const months = [];
  for (let i = 0; i < 12; i++) {
    const m = ((ys - 1 + i) % 12) + 1;
    const y = fyStartYear + Math.floor((ys - 1 + i) / 12);
    months.push({y, m});
  }
  let rows = months.map(({y,m}) => {
    const key = ymKeyFromYM(y, m);
    const cur = g.monthly[key] || {...g.default};
    return `<div class="goal-row">
      <div style="font-weight:600">${y}年${m}月</div>
      <div style="display:flex;gap:4px;align-items:center"><input type="number" min="0" step="10" value="${Math.round((cur.sales||0)/10000)}" onchange="onMonthlyGoalSales('${key}', this.value)"><span style="font-size:11px;color:var(--text3)">万円</span></div>
      <div style="display:flex;gap:4px;align-items:center"><input type="number" min="0" value="${cur.count||0}" onchange="onMonthlyGoalCount('${key}', this.value)"><span style="font-size:11px;color:var(--text3)">台</span></div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="font-size:12px;color:var(--text2);margin-bottom:10px">売上計上のタイミング・年度開始月・月別目標をここで設定します</div>

    <div class="setting-row">
      <div><div style="font-size:13px;font-weight:600">売上計上モード</div>
        <div style="font-size:11px;color:var(--text3);margin-top:3px">
          契約主義：売約した月に計上 / 納車主義：納車完了した月に計上
        </div>
      </div>
      <div style="display:flex;gap:0;background:var(--bg3);border:1px solid var(--border);border-radius:7px;overflow:hidden">
        <button onclick="setRevRecog('contract')" style="padding:7px 12px;border:none;background:${g.revRecog==='contract'?'var(--blue)':'transparent'};color:${g.revRecog==='contract'?'#fff':'var(--text2)'};font-size:12px;cursor:pointer;font-weight:600">売約時</button>
        <button onclick="setRevRecog('delivery')" style="padding:7px 12px;border:none;background:${g.revRecog==='delivery'?'var(--blue)':'transparent'};color:${g.revRecog==='delivery'?'#fff':'var(--text2)'};font-size:12px;cursor:pointer;font-weight:600">納車完了時</button>
      </div>
    </div>

    <div class="setting-row">
      <div><div style="font-size:13px;font-weight:600">年度開始月</div><div style="font-size:11px;color:var(--text3);margin-top:3px">1月（暦年）／4月（一般的な決算）／任意月</div></div>
      <select onchange="setYearStart(this.value)" style="padding:6px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px">
        ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<option value="${m}"${m===ys?' selected':''}>${m}月始まり</option>`).join('')}
      </select>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 4px">
      <div style="font-size:13px;font-weight:600">月別目標</div>
      <button class="btn-sm" onclick="openBulkGoal()">一括入力</button>
    </div>
    <div class="goal-row" style="font-size:10px;color:var(--text3);padding-bottom:5px;border-bottom:2px solid var(--border)">
      <div>年月</div><div style="text-align:center">売上目標</div><div style="text-align:center">台数目標</div>
    </div>
    ${rows}
  `;
}
function setRevRecog(mode) {
  appSettings.goals.revRecog = mode;
  renderGoalsEditor();
  renderDashboard();
  if (typeof renderArchive === 'function') renderArchive();
  showToast(mode === 'contract' ? '売上計上：売約時に変更しました' : '売上計上：納車完了時に変更しました');
  if (window.saveSettings) saveSettings(); // v1.5.2
}
function setYearStart(v) {
  appSettings.goals.yearStart = parseInt(v, 10) || 1;
  renderGoalsEditor();
  renderDashboard();
  if (window.saveSettings) saveSettings(); // v1.5.2
}
function onMonthlyGoalSales(key, v) {
  const manYen = Math.max(0, parseFloat(v) || 0);
  const cur = appSettings.goals.monthly[key] || {...appSettings.goals.default};
  cur.sales = Math.round(manYen * 10000);
  appSettings.goals.monthly[key] = cur;
  renderDashboard();
  if (window.saveSettings) saveSettings(); // v1.5.2
}
function onMonthlyGoalCount(key, v) {
  const n = Math.max(0, parseInt(v, 10) || 0);
  const cur = appSettings.goals.monthly[key] || {...appSettings.goals.default};
  cur.count = n;
  appSettings.goals.monthly[key] = cur;
  renderDashboard();
  if (window.saveSettings) saveSettings(); // v1.5.2
}
function openBulkGoal() {
  document.getElementById('bulk-sales').value = Math.round((appSettings.goals.default.sales||0)/10000);
  document.getElementById('bulk-count').value = appSettings.goals.default.count || 0;
  document.getElementById('confirm-bulk-goal').classList.add('open');
}
function closeBulkGoal() {
  document.getElementById('confirm-bulk-goal').classList.remove('open');
}
function applyBulkGoal() {
  const sales = Math.round((parseFloat(document.getElementById('bulk-sales').value) || 0) * 10000);
  const count = parseInt(document.getElementById('bulk-count').value, 10) || 0;
  appSettings.goals.default = {sales, count};
  // 今年度12ヶ月に一括適用
  const ys = appSettings.goals.yearStart;
  const now = new Date();
  let fyStartYear = now.getFullYear();
  if (now.getMonth()+1 < ys) fyStartYear--;
  for (let i = 0; i < 12; i++) {
    const m = ((ys - 1 + i) % 12) + 1;
    const y = fyStartYear + Math.floor((ys - 1 + i) / 12);
    appSettings.goals.monthly[ymKeyFromYM(y, m)] = {sales, count};
  }
  closeBulkGoal();
  renderGoalsEditor();
  renderDashboard();
  if (window.saveSettings) saveSettings(); // v1.5.2
}

// ========================================
// v1.0.30: 設定パネル サイドバー型ナビ切替
// 左の項目をクリックすると、対応する section.active を切り替える
// ========================================
function selectSettingsSection(sectionId) {
  // 全 nav-item の active 解除
  document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
  // 全 section の active 解除
  document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
  // 該当を active 化
  const navBtn = document.querySelector(`.settings-nav-item[data-section="${sectionId}"]`);
  if (navBtn) navBtn.classList.add('active');
  const section = document.querySelector(`.settings-section[data-section="${sectionId}"]`);
  if (section) section.classList.add('active');
  // 右コンテンツのスクロール位置をトップに戻す
  const content = document.querySelector('.settings-content');
  if (content) content.scrollTop = 0;
}

// ナビボタンのクリックハンドラを設定（DOMContentLoaded 後 / または開く時）
function bindSettingsNav() {
  document.querySelectorAll('.settings-nav-item').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', () => {
      const sec = btn.getAttribute('data-section');
      if (sec) selectSettingsSection(sec);
    });
  });
}

// ページロード後に1回バインド
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindSettingsNav);
} else {
  bindSettingsNav();
}

// ========================================
// v1.0.32〜33: タスク ON/OFF ＋ 並び替え ＋ 期日 ＋ カスタム追加 UI
// ========================================
function renderTasksEditor() {
  const root = document.getElementById('tasks-editor');
  if (!root) return;

  const phases = [
    { key: 'regen',    label: '🔧 展示準備フェーズ', deadlineHint: '仕入れから', deadlineSuffix: '日以内' },
    { key: 'delivery', label: '📦 納車フェーズ', deadlineHint: '納車まで',   deadlineSuffix: '日前' },
  ];

  let html = '';
  phases.forEach(ph => {
    const tasks = (typeof getAllTasksForUI === 'function') ? getAllTasksForUI(ph.key) : [];
    // v1.8.51: 進捗ウエイト機能は廃止 → 均等割り + 小タスク按分に統一（Phase B）。
    //          旧 appTaskWeight 設定は Firestore に残してても害なし（読まないだけ）。
    html += `<div class="task-edit-phase">
      <div class="task-edit-phase-head">${ph.label}</div>
      <div class="task-edit-phase-deadline-hint">期日：<strong>${ph.deadlineHint} N ${ph.deadlineSuffix}</strong>（目標 / 限界 の2段階で設定。空欄なら未設定）<br><span style="color:var(--text3);font-size:11px">目標ライン＝このペースで進めたい / 限界ライン＝これを超えたらアウト</span><br><span style="color:var(--text3);font-size:11px">※ 進捗は有効タスクの均等割り＋小タスク按分で自動計算（v1.8.51）</span></div>`;
    if (!tasks.length) {
      html += '<div class="task-edit-empty">タスクが定義されていません</div>';
    } else {
      tasks.forEach((t, idx) => {
        const customCls = t.builtin ? '' : ' task-edit-custom';
        const isFirst = idx === 0;
        const isLast  = idx === tasks.length - 1;
        const targetVal = (t.targetDays != null) ? t.targetDays : '';
        const limitVal  = (t.limitDays  != null) ? t.limitDays  : '';
        // v1.6.1: 詳細チェックリスト（hasChecklist）の状態と切替可否
        const hasChk = !!t.hasChecklist;
        const canTgl = !!t.canToggleChecklist;
        const chkTitle = canTgl
          ? '詳細チェックリストを使う / シンプルなON/OFFに戻す'
          : ((t.id === 'd_complete' || t.id === 't_complete') ? '自動判定タスクは詳細不可' : '組込のチェックリスト型は固定ON');
        html += `
          <div class="task-edit-row${customCls}" data-task-id="${escapeHtml(t.id)}" data-phase="${ph.key}">
            <div class="task-edit-order-btns">
              <button class="task-edit-order-btn" onclick="moveTaskUp('${escapeHtml(t.id)}', '${ph.key}')" ${isFirst ? 'disabled' : ''} title="上へ">▲</button>
              <button class="task-edit-order-btn" onclick="moveTaskDown('${escapeHtml(t.id)}', '${ph.key}')" ${isLast ? 'disabled' : ''} title="下へ">▼</button>
            </div>
            <span class="task-edit-icon">${t.icon || '📋'}</span>
            <span class="task-edit-name">${escapeHtml(t.name)}</span>
            ${t.builtin ? '' : '<span class="task-edit-tag custom">追加</span>'}
            ${(t.id === 'd_complete' || t.id === 't_complete') ? '<span class="task-edit-tag auto" title="他のタスク全完了で自動ON">自動</span>' : ''}
            ${t.optional ? '<span class="task-edit-tag" style="background:rgba(168,85,247,.18);color:#c084fc;border:1px solid rgba(168,85,247,.35)" title="選択制：車両ごとに使うかどうかをチェックで指定">選択</span>' : ''}
            <div class="task-edit-deadline task-edit-deadline-v2">
              <div class="task-edit-deadline-pair" title="目標ライン：このペースで進めたい">
                <span class="task-edit-deadline-lbl task-edit-deadline-lbl-target">目標</span>
                <input type="number" min="1" max="365" value="${targetVal}"
                       placeholder="—"
                       onchange="setTaskTargetDays('${escapeHtml(t.id)}', '${ph.key}', this.value)"
                       class="task-edit-deadline-inp"
                       title="目標ライン（${ph.deadlineHint} N ${ph.deadlineSuffix}）">
                <span class="task-edit-deadline-suffix">日</span>
              </div>
              <div class="task-edit-deadline-pair" title="限界ライン：これを超えたらアウト">
                <span class="task-edit-deadline-lbl task-edit-deadline-lbl-limit">限界</span>
                <input type="number" min="1" max="365" value="${limitVal}"
                       placeholder="—"
                       onchange="setTaskLimitDays('${escapeHtml(t.id)}', '${ph.key}', this.value)"
                       class="task-edit-deadline-inp"
                       title="限界ライン（${ph.deadlineHint} N ${ph.deadlineSuffix}）">
                <span class="task-edit-deadline-suffix">日</span>
              </div>
            </div>
            <!-- v1.8.13: 詳細チェックリスト/編集/削除を ⋮ メニューに集約。
                 ON/OFFトグルだけ常時表示（よく使う操作）。これで全行のレイアウトが揃う。 -->
            <label class="task-edit-toggle" title="このタスクを表示する">
              <input type="checkbox" ${t.enabled ? 'checked' : ''}
                     onchange="toggleTaskEnabled('${escapeHtml(t.id)}', '${ph.key}', this.checked)">
              <span class="task-edit-toggle-slider"></span>
            </label>
            <button class="task-edit-menu-btn" onclick="openTaskMenu('${escapeHtml(t.id)}', '${ph.key}')" title="このタスクの操作メニュー">⋮</button>
          </div>`;
      });
    }
    html += `</div>`;
  });

  // 追加フォーム
  html += `
    <div class="task-edit-add">
      <div class="task-edit-add-title">＋ チェック型タスクを追加 <span style="font-size:10px;color:var(--text3);font-weight:400">（アイコン欄でフォーカス → Win+. または Win+; で絵文字パレットが開きます）</span></div>
      <div class="task-edit-add-row">
        <input type="text" id="new-task-icon" class="settings-input task-edit-add-icon" placeholder="🔧" maxlength="4" title="絵文字を入力。Win+. または Win+; でWindowsの絵文字パレットが開きます">
        <input type="text" id="new-task-name" class="settings-input task-edit-add-name" placeholder="タスク名（例：鈑金見積）" maxlength="20">
      </div>
      <div class="task-edit-add-phase-row">
        <span class="task-edit-add-phase-label">適用フェーズ：</span>
        <label class="task-edit-add-phase">
          <input type="checkbox" id="new-task-phase-regen" checked> 再生
        </label>
        <label class="task-edit-add-phase">
          <input type="checkbox" id="new-task-phase-delivery"> 納車
        </label>
        <button class="btn-sm" onclick="addCustomTask()" style="margin-left:auto">追加する</button>
      </div>
    </div>`;

  // v1.7.36: タスクパターン一覧（テンプレ一覧）への入口
  html += `
    <div class="task-edit-templates-link">
      <button class="btn-sm btn-primary" onclick="openTemplateListFromSettings()">
        📋 タスクパターン一覧を開く（追加・複製・削除はこちら）
      </button>
    </div>`;

  root.innerHTML = html;
}

// v1.7.36: 設定画面からテンプレ一覧（L1）を開く
window.openTemplateListFromSettings = function () {
  if (window._tplEditor) {
    window._tplEditor.view = 'list';
    window._tplEditor.activeTplId = null;
    window._tplEditor.activeVariantId = null;
    window._tplEditor.expandedSectionId = null;
    window._tplEditor.backTo = 'settings';
  }
  if (typeof showPanel === 'function') {
    showPanel('templates', null);
  }
  if (typeof renderTemplateEditor === 'function') {
    renderTemplateEditor();
  }
};

// ========================================
// v1.8.13: タスク行の ⋮ メニュー（操作集約アクションシート）
// ========================================
window.openTaskMenu = function (taskId, phase) {
  const tasks = (typeof getAllTasksForUI === 'function') ? getAllTasksForUI(phase) : [];
  const t = tasks.find(x => x.id === taskId);
  if (!t) return;

  const titleEl = document.getElementById('task-actionsheet-title');
  if (titleEl) titleEl.textContent = (t.icon || '📋') + ' ' + (t.name || '');

  const body = document.getElementById('task-actionsheet-body');
  if (!body) return;
  body.innerHTML = '';

  function _addBtn(label, onClick, danger) {
    const btn = document.createElement('button');
    btn.className = 'bn-actionsheet-btn' + (danger ? ' bn-actionsheet-danger' : '');
    btn.textContent = label;
    btn.onclick = onClick;
    body.appendChild(btn);
  }

  // 1. ✏️ チェックリスト編集（hasChecklist=true は直接編集／false かつ canToggle=true なら自動でON＋編集）
  if (t.hasChecklist) {
    _addBtn('✏️ チェックリストを編集', function () {
      closeTaskActions();
      if (typeof openTaskTemplate === 'function') openTaskTemplate(taskId, phase);
    });
  } else if (t.canToggleChecklist) {
    // v1.8.14: 詳細無しのタスクでも「編集」を押せるように。押した時に自動で詳細ON→エディタ起動
    _addBtn('✨ 小タスクを作って編集する', function () {
      closeTaskActions();
      if (typeof toggleTaskChecklist === 'function') {
        toggleTaskChecklist(taskId, phase, true);
      }
      // toggleTaskChecklist 完了後に openTaskTemplate を呼ぶ（テンプレ生成は同期）
      setTimeout(function () {
        if (typeof openTaskTemplate === 'function') openTaskTemplate(taskId, phase);
      }, 50);
    });
  }

  // 2. 詳細トグル（canToggleChecklist の時のみ・「ON/OFFに戻す」用に残す）
  if (t.canToggleChecklist && t.hasChecklist) {
    _addBtn('📝 シンプルなON/OFFに戻す', function () {
      closeTaskActions();
      if (typeof toggleTaskChecklist === 'function') {
        toggleTaskChecklist(taskId, phase, false);
      }
    });
  }

  // v1.8.46: 名前変更（カスタムタスクのみ）
  if (!t.builtin) {
    _addBtn('✏️ 名前・アイコンを変更', function () {
      closeTaskActions();
      if (typeof renameCustomTask === 'function') renameCustomTask(taskId);
    });
  }

  // v1.8.51: 選択制トグル（自動判定タスク以外は全部対象）
  if (taskId !== 't_complete' && taskId !== 'd_complete') {
    const isOpt = (typeof isTaskOptional === 'function') && isTaskOptional(taskId, phase);
    const label = isOpt ? '◉ 選択制をやめる（常時表示に戻す）' : '◉ この大タスクを選択制にする';
    _addBtn(label, function () {
      closeTaskActions();
      if (typeof setTaskOptional === 'function') {
        setTaskOptional(taskId, phase, !isOpt);
        if (typeof renderTasksEditor === 'function') renderTasksEditor();
        if (typeof renderAll === 'function') renderAll();
        if (typeof showToast === 'function') showToast(isOpt ? '選択制を解除しました' : '選択制に変更しました');
      }
    });
  }

  // 3. 削除（カスタムタスクのみ）
  if (!t.builtin) {
    _addBtn('🗑 このタスクを削除', function () {
      closeTaskActions();
      if (typeof deleteCustomTask === 'function') deleteCustomTask(taskId);
    }, true);
  }

  // メニュー項目がない場合
  if (body.children.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:var(--text3);padding:18px 8px;text-align:center;font-size:13px';
    empty.textContent = 'このタスクで使える操作はありません';
    body.appendChild(empty);
  }

  const m = document.getElementById('modal-task-actions');
  if (m) m.classList.add('open');
};

window.closeTaskActions = function () {
  const m = document.getElementById('modal-task-actions');
  if (m) m.classList.remove('open');
};

// ========================================
// v1.8.12: 大タスクの進捗ウエイト（％）操作
// ========================================
function setTaskWeight(taskId, phase, value) {
  if (typeof appTaskWeight === 'undefined') return;
  if (!appTaskWeight[phase]) appTaskWeight[phase] = {};
  let n = parseInt(value, 10);
  if (!isFinite(n) || n < 0) n = 0;
  if (n > 100) n = 100;
  appTaskWeight[phase][taskId] = n;
  // 保存（fire-and-forget）
  if (window.dbSettings && window.dbSettings.saveSettings) {
    window.dbSettings.saveSettings().catch(e => console.error('[setTaskWeight] save failed', e));
  }
  // 全画面再描画（進捗バー反映）+ 設定UI再描画（合計バー更新）
  if (typeof renderAll === 'function') renderAll();
  if (typeof renderTasksEditor === 'function') renderTasksEditor();
  if (typeof renderDashboard === 'function') renderDashboard();
}
window.setTaskWeight = setTaskWeight;

function resetTaskWeights(phase) {
  if (typeof appTaskWeight === 'undefined') return;
  if (!appTaskWeight[phase]) appTaskWeight[phase] = {};
  const tasks = (typeof getAllTasksForUI === 'function') ? getAllTasksForUI(phase) : [];
  // 自動判定タスク・無効タスクを除いた数で 100 を均等割り
  const targets = tasks.filter(t => t.enabled && t.id !== 't_complete' && t.id !== 'd_complete');
  if (targets.length === 0) return;
  const base = Math.floor(100 / targets.length);
  const remainder = 100 - base * targets.length;
  // 一旦クリア
  appTaskWeight[phase] = {};
  targets.forEach((t, i) => {
    appTaskWeight[phase][t.id] = base + (i === 0 ? remainder : 0);
  });
  if (window.dbSettings && window.dbSettings.saveSettings) {
    window.dbSettings.saveSettings().catch(e => console.error('[resetTaskWeights] save failed', e));
  }
  if (typeof renderAll === 'function') renderAll();
  if (typeof renderTasksEditor === 'function') renderTasksEditor();
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof showToast === 'function') showToast('進捗ウエイトを均等に戻しました');
}
window.resetTaskWeights = resetTaskWeights;

// 組み込み・カスタム両方共通の ON/OFF 切替
function toggleTaskEnabled(taskId, phase, enabled) {
  if (!appTaskEnabled[phase]) appTaskEnabled[phase] = {};
  appTaskEnabled[phase][taskId] = !!enabled;
  if (typeof _refreshSizesDependentViews === 'function') _refreshSizesDependentViews();
  showToast(enabled ? 'タスクを有効化しました' : 'タスクを無効化しました');
  if (window.saveSettings) saveSettings(); // v1.5.2
}

// v1.6.1: 詳細チェックリスト ON/OFF 切替
//   ON にする時：mode='checklist'。テンプレ未存在なら空テンプレ作成
//   OFF にする時：mode='simple'。テンプレ自体は削除しない（誤操作対策）
async function toggleTaskChecklist(taskId, phase, enabled) {
  if (typeof setTaskChecklistMode !== 'function') return;
  const ok = setTaskChecklistMode(taskId, phase, !!enabled);
  if (!ok) {
    showToast('このタスクは切り替えられません');
    renderTasksEditor();
    return;
  }
  // ON にする時はテンプレが無ければ空のテンプレを作る
  if (enabled && typeof ChecklistTemplates !== 'undefined' && typeof templateIdForTask === 'function') {
    const tplId = templateIdForTask(taskId, phase);
    if (!ChecklistTemplates[tplId]) {
      // タスク名・アイコンを取得
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
        // v1.7.19: navigationStyle 廃止
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
  }
  showToast(enabled ? '詳細チェックリストを有効化しました' : 'シンプルなトグルに戻しました');
  if (window.saveSettings) saveSettings();
  renderTasksEditor();
}

// v1.6.1: 編集ボタン押下：そのタスクのテンプレを直接開く
function openTaskTemplate(taskId, phase) {
  if (typeof openTemplateForTask !== 'function') {
    showToast('編集モジュールが読み込まれていません');
    return;
  }
  openTemplateForTask(taskId, phase);
}

// v1.0.33: 並び替え
function moveTaskUp(taskId, phase) {
  if (typeof moveTaskOrder === 'function') moveTaskOrder(taskId, phase, -1);
  renderTasksEditor();
  if (typeof _refreshSizesDependentViews === 'function') _refreshSizesDependentViews();
  if (window.saveSettings) saveSettings(); // v1.5.2
}
function moveTaskDown(taskId, phase) {
  if (typeof moveTaskOrder === 'function') moveTaskOrder(taskId, phase, 1);
  renderTasksEditor();
  if (typeof _refreshSizesDependentViews === 'function') _refreshSizesDependentViews();
  if (window.saveSettings) saveSettings(); // v1.5.2
}

// v1.0.33: 期日設定
// v1.8.80: setTaskTargetDays に委譲（後方互換用）
function setTaskDeadline(taskId, phase, value) {
  if (typeof setTaskTargetDays === 'function') {
    setTaskTargetDays(taskId, phase, value);
  } else {
    if (!appTaskDeadline[phase]) appTaskDeadline[phase] = {};
    const v = (value == null || value === '') ? null : Number(value);
    if (v == null || !Number.isFinite(v) || v <= 0) {
      delete appTaskDeadline[phase][taskId];
    } else {
      appTaskDeadline[phase][taskId] = v;
    }
    if (window.saveSettings) saveSettings();
  }
  if (typeof _refreshSizesDependentViews === 'function') _refreshSizesDependentViews();
}

// カスタムタスク追加
function addCustomTask() {
  const icon = (document.getElementById('new-task-icon').value || '').trim() || '📋';
  const name = (document.getElementById('new-task-name').value || '').trim();
  const useRegen    = document.getElementById('new-task-phase-regen').checked;
  const useDelivery = document.getElementById('new-task-phase-delivery').checked;
  if (!name) { showToast('タスク名を入力してください'); return; }
  if (!useRegen && !useDelivery) { showToast('適用フェーズを選んでください'); return; }
  const id = 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const phases = [];
  if (useRegen) phases.push('regen');
  if (useDelivery) phases.push('delivery');
  appCustomTasks.push({ id, name, icon, phases });
  document.getElementById('new-task-icon').value = '';
  document.getElementById('new-task-name').value = '';
  cars.forEach(c => {
    if (useRegen    && c.regenTasks    && !(id in c.regenTasks))    c.regenTasks[id] = false;
    if (useDelivery && c.deliveryTasks && !(id in c.deliveryTasks)) c.deliveryTasks[id] = false;
  });
  renderTasksEditor();
  if (typeof _refreshSizesDependentViews === 'function') _refreshSizesDependentViews();
  showToast(`「${name}」を追加しました`);
  if (window.saveSettings) saveSettings(); // v1.5.2
}

// v1.8.46: カスタムタスクの名前を変更
// v1.8.56: prompt() → HTML inputs を持つカスタムモーダルへ刷新。
//   HTML <input> にフォーカスしている時は Win+. / Win+; で Windows 絵文字パレットが開く。
//   prompt() ではこのショートカットが効かないため。
function renameCustomTask(taskId) {
  const t = appCustomTasks.find(x => x.id === taskId);
  if (!t) return;

  // 既存モーダル要素を再利用、無ければ作成
  let overlay = document.getElementById('rename-task-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'rename-task-overlay';
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" style="width:420px;max-width:94vw">
        <div class="mhdr">
          <div class="mhdr-title">タスクの名前・アイコンを変更</div>
          <button class="mclose" onclick="_closeRenameTaskModal(false)">✕</button>
        </div>
        <div class="mbody" style="padding:18px 20px">
          <div class="fg">
            <label>アイコン（絵文字）<span style="color:var(--text3);font-weight:400;font-size:10px;margin-left:6px">入力欄をクリック → Win+. または Win+; で絵文字パレット</span></label>
            <input type="text" id="rename-task-icon" maxlength="4" style="width:90px;text-align:center;font-size:22px;padding:8px">
          </div>
          <div class="fg">
            <label>タスク名</label>
            <input type="text" id="rename-task-name" maxlength="20">
          </div>
        </div>
        <div class="mfooter">
          <button class="btn-cancel" onclick="_closeRenameTaskModal(false)">キャンセル</button>
          <button class="btn-save" onclick="_closeRenameTaskModal(true)">保存</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    // オーバーレイ外クリックで閉じる
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) _closeRenameTaskModal(false);
    });
  }

  // 値を反映
  document.getElementById('rename-task-icon').value = t.icon || '📋';
  document.getElementById('rename-task-name').value = t.name || '';
  overlay.dataset.taskId = taskId;
  overlay.classList.add('open');
  // 名前にフォーカス（絵文字側にフォーカスしたい場合はユーザーがクリックする）
  setTimeout(() => {
    const nameEl = document.getElementById('rename-task-name');
    if (nameEl) { nameEl.focus(); nameEl.select(); }
  }, 50);
}
window.renameCustomTask = renameCustomTask;

function _closeRenameTaskModal(save) {
  const overlay = document.getElementById('rename-task-overlay');
  if (!overlay) return;
  if (!save) {
    overlay.classList.remove('open');
    return;
  }
  const taskId = overlay.dataset.taskId;
  const t = appCustomTasks.find(x => x.id === taskId);
  if (!t) { overlay.classList.remove('open'); return; }
  const newName = (document.getElementById('rename-task-name').value || '').trim();
  const newIcon = (document.getElementById('rename-task-icon').value || '').trim();
  if (!newName) { showToast('タスク名が空です'); return; }
  const nameChanged = newName !== t.name;
  const iconChanged = !!newIcon && newIcon !== t.icon;
  t.name = newName;
  if (newIcon) t.icon = newIcon;
  overlay.classList.remove('open');
  renderTasksEditor();
  if (typeof _refreshSizesDependentViews === 'function') _refreshSizesDependentViews();
  if (typeof renderAll === 'function') renderAll();
  const msg = (nameChanged && iconChanged) ? 'タスク名とアイコンを変更しました'
            : iconChanged ? 'アイコンを変更しました'
            : nameChanged ? 'タスク名を変更しました'
            : '変更はありません';
  showToast(msg);
  if (window.saveSettings) saveSettings();
}
window._closeRenameTaskModal = _closeRenameTaskModal;

// カスタムタスク削除
function deleteCustomTask(taskId) {
  const t = appCustomTasks.find(x => x.id === taskId);
  if (!t) return;
  if (!confirm(`「${t.name}」を削除しますか？\n（既に進捗が入っていても消えます）`)) return;
  const __idx = appCustomTasks.findIndex(x => x.id === taskId);
  if (__idx >= 0) appCustomTasks.splice(__idx, 1);
  cars.forEach(c => {
    if (c.regenTasks)    delete c.regenTasks[taskId];
    if (c.deliveryTasks) delete c.deliveryTasks[taskId];
  });
  if (appTaskEnabled.regen)    delete appTaskEnabled.regen[taskId];
  if (appTaskEnabled.delivery) delete appTaskEnabled.delivery[taskId];
  if (appTaskDeadline.regen)    delete appTaskDeadline.regen[taskId];
  if (appTaskDeadline.delivery) delete appTaskDeadline.delivery[taskId];
  // 並び順からも除外
  if (appTaskOrder.regen)    appTaskOrder.regen    = appTaskOrder.regen.filter(id => id !== taskId);
  if (appTaskOrder.delivery) appTaskOrder.delivery = appTaskOrder.delivery.filter(id => id !== taskId);
  renderTasksEditor();
  if (typeof _refreshSizesDependentViews === 'function') _refreshSizesDependentViews();
  showToast('タスクを削除しました');
  if (window.saveSettings) saveSettings(); // v1.5.2
}

// アプリ起動時の復元（appSettings 読込後に呼ぶ想定）
function restoreTasksFromSettings() {
  if (typeof appSettings === 'undefined') return;
  if (appSettings.taskEnabled) {
    appTaskEnabled = {
      regen:    appSettings.taskEnabled.regen    || {},
      delivery: appSettings.taskEnabled.delivery || {},
    };
  }
  if (Array.isArray(appSettings.customTasks)) {
    appCustomTasks = appSettings.customTasks.slice();
  }
  if (appSettings.taskOrder) {
    appTaskOrder = {
      regen:    appSettings.taskOrder.regen    || [],
      delivery: appSettings.taskOrder.delivery || [],
    };
  }
  if (appSettings.taskDeadline) {
    appTaskDeadline = {
      regen:    appSettings.taskDeadline.regen    || {},
      delivery: appSettings.taskDeadline.delivery || {},
    };
  }
}


// ========================================
// v1.5.5: プロフィール section（自分の表示名・アイコン）
// ========================================

function renderProfileSection() {
  const staff = (window.fb && window.fb.currentStaff) || {};
  const user = (window.fb && window.fb.currentUser) || {};

  // アイコンプレビュー
  const photoURL = (typeof resolveStaffPhotoURL === 'function') ? resolveStaffPhotoURL(staff, user) : null;
  const dispName = (typeof resolveStaffDisplayName === 'function') ? resolveStaffDisplayName(staff, user) : 'ゲスト';
  const init = (typeof staffInitial === 'function') ? staffInitial(dispName) : String(dispName).slice(0, 2).toUpperCase();

  const av = document.getElementById('profile-avatar-preview');
  if (av) {
    if (photoURL) {
      av.style.backgroundImage = `url('${photoURL}')`;
      av.style.color = 'transparent';
      av.textContent = init;
    } else {
      av.style.backgroundImage = '';
      av.style.color = '';
      av.textContent = init;
    }
  }

  // 表示名 input
  const inp = document.getElementById('profile-displayname-inp');
  if (inp) {
    inp.value = staff.customDisplayName || '';
    inp.placeholder = staff.displayName || user.displayName || '（未設定）';
  }
  const hint = document.getElementById('profile-displayname-hint');
  if (hint) {
    if (staff.customDisplayName) {
      hint.textContent = `カスタム表示名「${staff.customDisplayName}」を使用中。Google の名前は「${staff.displayName || user.displayName || '—'}」です。`;
    } else {
      hint.textContent = `現在は Google の名前「${staff.displayName || user.displayName || '—'}」が使われています。`;
    }
  }

  // アカウント情報
  const emailEl = document.getElementById('profile-email');
  if (emailEl) emailEl.textContent = staff.email || user.email || '—';
  const roleEl = document.getElementById('profile-role');
  if (roleEl) {
    const labels = { admin: '管理者', manager: 'マネージャ', staff: 'スタッフ', viewer: '閲覧のみ' };
    roleEl.textContent = labels[staff.role] || staff.role || '—';
  }
  const uidEl = document.getElementById('profile-uid');
  if (uidEl) uidEl.textContent = (user.uid || staff.uid || '—');
}

// v1.5.10: 画像選択 → Storage アップロード → URL を staff.customPhotoURL に保存
// v1.8.76: 写真選択時はそのまま保存せず、クロッパーモーダルを開く
async function onProfilePhotoPick(input) {
  if (!input || !input.files || !input.files[0]) return;
  const file = input.files[0];
  if (file.size > 5 * 1024 * 1024) {
    showToast('画像が大きすぎます（5MB以下にしてください）');
    input.value = '';
    return;
  }
  // クロッパーを開く
  openAvatarCrop(file);
  input.value = '';
}

// ====================================================================
// v1.8.76: アバター画像クロッパー（円形トリミング + 拡大縮小 + ドラッグ）
// ====================================================================
const _avatarCropState = {
  imgWidth: 0, imgHeight: 0,
  offsetX: 0, offsetY: 0, scale: 1,
  isDragging: false, dragStartX: 0, dragStartY: 0,
  startOffsetX: 0, startOffsetY: 0,
  originalFile: null,
};
const AVATAR_CROP_SIZE = 240; // 円の直径（px、SVG座標）

// v1.8.77: callback(blob, dataUrl) を渡すと、適用時にそちらに委譲する。
//   省略時は従来通り「自分のプロフィール写真」として Firestore に直接保存。
function openAvatarCrop(file, onApply) {
  _avatarCropState.originalFile = file;
  _avatarCropState.onApply = (typeof onApply === 'function') ? onApply : null;
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = document.getElementById('avatar-crop-img');
    if (!img) return;
    img.onload = function () {
      _avatarCropState.imgWidth = img.naturalWidth;
      _avatarCropState.imgHeight = img.naturalHeight;
      // 初期スケール：短い辺が円（240px）にぴったり収まる
      const fit = Math.max(AVATAR_CROP_SIZE / img.naturalWidth, AVATAR_CROP_SIZE / img.naturalHeight);
      _avatarCropState.scale = fit;
      _avatarCropState.offsetX = 0;
      _avatarCropState.offsetY = 0;
      const slider = document.getElementById('avatar-crop-zoom');
      if (slider) {
        slider.min = String(fit);
        slider.max = String(fit * 4);
        slider.value = String(fit);
      }
      _avatarCropApplyTransform();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  document.getElementById('modal-avatar-crop').classList.add('open');
  _setupAvatarCropDrag();
}
window.openAvatarCrop = openAvatarCrop;

function _avatarCropApplyTransform() {
  const img = document.getElementById('avatar-crop-img');
  if (!img) return;
  const s = _avatarCropState;
  img.style.width = s.imgWidth + 'px';
  img.style.height = 'auto';
  img.style.transform = `translate(-50%, -50%) translate(${s.offsetX}px, ${s.offsetY}px) scale(${s.scale})`;
}

function onAvatarCropZoom(v) {
  _avatarCropState.scale = Number(v);
  _avatarCropApplyTransform();
}
window.onAvatarCropZoom = onAvatarCropZoom;

function closeAvatarCrop() {
  const m = document.getElementById('modal-avatar-crop');
  if (m) m.classList.remove('open');
}
window.closeAvatarCrop = closeAvatarCrop;

function _setupAvatarCropDrag() {
  const area = document.getElementById('avatar-crop-area');
  if (!area || area.dataset.cropBound === '1') return;
  area.dataset.cropBound = '1';
  const onDown = (clientX, clientY) => {
    _avatarCropState.isDragging = true;
    _avatarCropState.dragStartX = clientX;
    _avatarCropState.dragStartY = clientY;
    _avatarCropState.startOffsetX = _avatarCropState.offsetX;
    _avatarCropState.startOffsetY = _avatarCropState.offsetY;
    area.classList.add('dragging');
  };
  const onMove = (clientX, clientY) => {
    if (!_avatarCropState.isDragging) return;
    const dx = clientX - _avatarCropState.dragStartX;
    const dy = clientY - _avatarCropState.dragStartY;
    _avatarCropState.offsetX = _avatarCropState.startOffsetX + dx;
    _avatarCropState.offsetY = _avatarCropState.startOffsetY + dy;
    _avatarCropApplyTransform();
  };
  const onUp = () => {
    _avatarCropState.isDragging = false;
    area.classList.remove('dragging');
  };
  area.addEventListener('mousedown', e => { e.preventDefault(); onDown(e.clientX, e.clientY); });
  document.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  document.addEventListener('mouseup', onUp);
  area.addEventListener('touchstart', e => {
    if (e.touches.length === 1) onDown(e.touches[0].clientX, e.touches[0].clientY);
  });
  area.addEventListener('touchmove', e => {
    if (e.touches.length === 1) {
      e.preventDefault();
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });
  area.addEventListener('touchend', onUp);
}

async function applyAvatarCrop() {
  const s = _avatarCropState;
  if (!s.imgWidth || !s.imgHeight) { showToast('画像が読み込めていません'); return; }
  const img = document.getElementById('avatar-crop-img');
  if (!img) return;
  // 円（240px in SVG/CSS座標）の中身を出力サイズ256×256に書き出す
  const OUT = 256;
  const canvas = document.createElement('canvas');
  canvas.width = OUT; canvas.height = OUT;
  const ctx = canvas.getContext('2d');
  // 円形クリップ
  ctx.beginPath();
  ctx.arc(OUT/2, OUT/2, OUT/2, 0, Math.PI*2);
  ctx.clip();
  // ソース矩形の計算：画面上 240px の正方形に対応する画像内領域
  const sw = AVATAR_CROP_SIZE / s.scale;
  const sh = AVATAR_CROP_SIZE / s.scale;
  const sx = (s.imgWidth  / 2) - (s.offsetX / s.scale) - sw / 2;
  const sy = (s.imgHeight / 2) - (s.offsetY / s.scale) - sh / 2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT, OUT);
  // v1.8.77: コールバックが指定されていればそちらに委譲（メンバー編集等）
  if (typeof _avatarCropState.onApply === 'function') {
    canvas.toBlob((blob) => {
      if (!blob) { showToast('画像処理に失敗しました'); return; }
      const dataUrl = canvas.toDataURL('image/png');
      try {
        _avatarCropState.onApply(blob, dataUrl);
      } catch (err) {
        console.error('[avatar-crop] callback error:', err);
      }
      closeAvatarCrop();
    }, 'image/png');
    return;
  }
  // Blob → upload（自分のプロフィール写真：従来挙動）
  canvas.toBlob(async (blob) => {
    if (!blob) { showToast('画像処理に失敗しました'); return; }
    const uid = window.fb && window.fb.currentUser && window.fb.currentUser.uid;
    if (!uid) { showToast('未ログイン'); return; }
    try {
      showToast('アイコンを保存中...');
      let url;
      if (window.dbStorage && window.dbStorage.uploadProfilePhoto) {
        const f = new File([blob], 'avatar.png', { type: 'image/png' });
        url = await window.dbStorage.uploadProfilePhoto(uid, f);
      } else {
        url = await new Promise(r => {
          const reader = new FileReader();
          reader.onload = () => r(reader.result);
          reader.readAsDataURL(blob);
        });
      }
      await window.dbStaff.saveMyProfile({ customPhotoURL: url });
      showToast('アイコンを更新しました');
      renderProfileSection();
      if (typeof _refreshHeaderAvatars === 'function') _refreshHeaderAvatars();
      if (typeof renderMembers === 'function') renderMembers();
      closeAvatarCrop();
    } catch (err) {
      console.error('[avatar-crop] save error:', err);
      showToast('保存に失敗しました');
    }
  }, 'image/png');
}
window.applyAvatarCrop = applyAvatarCrop;

// 画像をリサイズして data:URL（jpeg）にする
function _resizeImageToDataUrl(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        const m = maxSize || 256;
        if (w >= h && w > m) { h = Math.round(h * m / w); w = m; }
        else if (h > m) { w = Math.round(w * m / h); h = m; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality || 0.85));
        } catch (err) { reject(err); }
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function resetProfilePhoto() {
  if (!confirm('Google アカウントのアイコンに戻しますか？')) return;
  try {
    await window.dbStaff.clearMyProfileOverride('photo');
    showToast('Google のアイコンに戻しました');
    renderProfileSection();
    if (typeof _refreshHeaderAvatars === 'function') _refreshHeaderAvatars();
    if (typeof renderMembers === 'function') renderMembers();
  } catch (err) {
    console.error(err);
    showToast('リセットに失敗しました');
  }
}

async function saveProfileDisplayName() {
  const inp = document.getElementById('profile-displayname-inp');
  const v = (inp && inp.value || '').trim();
  if (!v) {
    showToast('表示名を入力してください（または「Google に戻す」を押してください）');
    return;
  }
  if (v.length > 30) {
    showToast('表示名は30文字以内にしてください');
    return;
  }
  try {
    await window.dbStaff.saveMyProfile({ customDisplayName: v });
    showToast('表示名を更新しました');
    renderProfileSection();
    if (typeof _refreshHeaderAvatars === 'function') _refreshHeaderAvatars();
    if (typeof renderMembers === 'function') renderMembers();
  } catch (err) {
    console.error(err);
    showToast('保存に失敗しました');
  }
}

async function resetProfileDisplayName() {
  if (!confirm('Google アカウントの表示名に戻しますか？')) return;
  try {
    await window.dbStaff.clearMyProfileOverride('name');
    showToast('Google の表示名に戻しました');
    renderProfileSection();
    if (typeof _refreshHeaderAvatars === 'function') _refreshHeaderAvatars();
    if (typeof renderMembers === 'function') renderMembers();
  } catch (err) {
    console.error(err);
    showToast('リセットに失敗しました');
  }
}


// ========================================
// v1.5.12: 写真 data:URL → Storage 一括移行
// ========================================
function _setMigrateStatus(msg) {
  const el = document.getElementById('migrate-photos-status');
  if (el) el.textContent = msg || '';
}

async function dryRunMigratePhotos() {
  if (!window.migrateDataUrls) {
    showToast('移行モジュールが読み込まれていません');
    return;
  }
  if (typeof window.hasPermission === 'function' && !window.hasPermission('canEditTemplates')) {
    showToast('この操作には管理者権限が必要です');
    return;
  }
  _setMigrateStatus('対象を確認中…');
  const targets = window.migrateDataUrls.scanTargets();
  const carCount = (targets.cars || []).length;
  const sizeMb = ((targets.cars || []).reduce((a, b) => a + (b.sizeBytes || 0), 0) / (1024 * 1024)).toFixed(2);
  const msg = `車両写真：${carCount}件（合計 約${sizeMb}MB）`;
  _setMigrateStatus(msg);
  showToast('dry-run: ' + msg);
}

async function runMigratePhotos() {
  if (!window.migrateDataUrls) {
    showToast('移行モジュールが読み込まれていません');
    return;
  }
  if (typeof window.hasPermission === 'function' && !window.hasPermission('canEditTemplates')) {
    showToast('この操作には管理者権限が必要です');
    return;
  }
  const targets = window.migrateDataUrls.scanTargets();
  const carCount = (targets.cars || []).length;
  if (carCount === 0) {
    showToast('移行対象の写真はありません');
    _setMigrateStatus('対象なし');
    return;
  }
  if (!confirm(`車両写真 ${carCount}件 を Firebase Storage に移行します。\n通信に時間がかかる場合があります。実行しますか？`)) {
    return;
  }
  _setMigrateStatus('移行中…0/' + carCount);
  try {
    const result = await window.migrateDataUrls.runAll({
      dryRun: false,
      includeStaff: true,
      onProgress: (msg, done, total) => {
        if (typeof done === 'number' && typeof total === 'number') {
          _setMigrateStatus(`移行中…${done}/${total}`);
        }
      },
    });
    const summary = window.migrateDataUrls.summarize(result);
    _setMigrateStatus('完了：' + summary);
    showToast('✅ 移行完了：' + summary);
    if (typeof renderAll === 'function') renderAll();
    if (typeof _refreshHeaderAvatars === 'function') _refreshHeaderAvatars();
  } catch (err) {
    console.error('[runMigratePhotos]', err);
    _setMigrateStatus('失敗：' + (err.message || err));
    showToast('移行に失敗しました');
  }
}


// ========================================
// v1.7.0: 付箋ボードの色ラベル編集（会社共通）
// ========================================
function renderBoardLabelsEditor() {
  const root = document.getElementById('board-labels-editor');
  if (!root) return;
  if (typeof boardLabels === 'undefined') return;
  const colors = [
    { key: 'red',    css: 'bn-sw-red' },
    { key: 'orange', css: 'bn-sw-orange' },
    { key: 'yellow', css: 'bn-sw-yellow' },
    { key: 'green',  css: 'bn-sw-green' },
    { key: 'blue',   css: 'bn-sw-blue' },
  ];
  root.innerHTML = colors.map(c => {
    const v = (boardLabels[c.key] != null) ? boardLabels[c.key] : '';
    return `<div class="bn-labels-editor-row">
      <span class="bn-labels-editor-swatch ${c.css}"></span>
      <input type="text" maxlength="12" placeholder="ラベル名" value="${escapeHtml(v)}"
             onchange="onBoardLabelChange('${c.key}', this.value)">
    </div>`;
  }).join('');
}

function onBoardLabelChange(colorKey, value) {
  if (typeof boardLabels === 'undefined') return;
  const v = (value || '').trim();
  boardLabels[colorKey] = v;
  if (window.saveSettings) saveSettings();
  if (typeof renderBoardNotes === 'function') renderBoardNotes();
}
