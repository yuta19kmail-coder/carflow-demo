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
// 定休日・営業時間の設定は CarFlow から撤去した（v2.38.0）
// ========================================
// 🔴 直す場所は **MHS の 管理 ▸ 定休日カレンダー／設定** だけ。
//    設定「店舗運営」には「いま何が届いているか」を見るだけのカードを出す
//    ＝ js/cal-pit.js の pitCalCardHtml()（差し込みは js/navigation.js の settings 分岐）。
//    ⚠ ここに入力欄を作り直さないこと（二重管理に戻る）。
//    撤去＝ renderClosedRulesList / removeClosedRule / openClosedRuleForm /
//          closeClosedRuleForm / onClosedRulePatternChange / saveClosedRule / onBizHoursChange

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
  // v2.5.0: タスクパターンセクションを開いたら、template-editor のリストを描画
  if (sectionId === 'task-patterns' && typeof window.renderTaskPatternsInSettings === 'function') {
    window.renderTaskPatternsInSettings();
  }
  // v2.38.0: 店舗運営を開いたら「MHSから届いている営業日・営業時間」を出す（見るだけ）
  if (sectionId === 'store' && typeof window.renderMhsCalCard === 'function') window.renderMhsCalCard();
}
window.selectSettingsSection = selectSettingsSection;

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

  // v1.8.112: バックオフィスフェーズ追加。納車期日は1軸（目標のみ・限界欄廃止）
  const phases = [
    { key: 'regen',      label: '🔧 展示準備フェーズ', deadlineHint: '仕入れから', deadlineSuffix: '日以内', dlMode: 'dual' },
    { key: 'delivery',   label: '📦 納車フェーズ',     deadlineHint: '納車から',   deadlineSuffix: '日前',   dlMode: 'single' },
    { key: 'backoffice', label: '🗂 バックオフィス',   deadlineHint: '',           deadlineSuffix: '',       dlMode: 'none' },
  ];

  let html = '';
  phases.forEach(ph => {
    const tasks = (typeof getAllTasksForUI === 'function') ? getAllTasksForUI(ph.key) : [];
    let deadlineHintHtml = '';
    if (ph.dlMode === 'dual') {
      deadlineHintHtml = `<div class="task-edit-phase-deadline-hint">期日：<strong>${ph.deadlineHint} N ${ph.deadlineSuffix}</strong>（目標 / 限界 の2段階で設定。空欄なら未設定）<br><span style="color:var(--text3);font-size:11px">目標ライン＝このペースで進めたい / 限界ライン＝これを超えたらアウト</span><br><span style="color:var(--text3);font-size:11px">※ 進捗は有効タスクの均等割り＋小タスク按分で自動計算</span></div>`;
    } else if (ph.dlMode === 'single') {
      deadlineHintHtml = `<div class="task-edit-phase-deadline-hint">期日：<strong>${ph.deadlineHint} N ${ph.deadlineSuffix}</strong>（納車カレンダーに自動でマーカー表示。空欄なら未設定）</div>`;
    } else {
      deadlineHintHtml = `<div class="task-edit-phase-deadline-hint" style="color:var(--text3);font-size:11px">納車後の裏方業務（原価処理・書類整理など）。期限なし。</div>`;
    }
    html += `<div class="task-edit-phase">
      <div class="task-edit-phase-head">${ph.label}</div>
      ${deadlineHintHtml}`;
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
              <button class="task-edit-order-btn" onclick="moveTaskUp('${escapeHtml(t.id)}', '${ph.key}')" ${isFirst ? 'disabled' : ''} title="上へ">${ic('chevUp','▲',14)}</button>
              <button class="task-edit-order-btn" onclick="moveTaskDown('${escapeHtml(t.id)}', '${ph.key}')" ${isLast ? 'disabled' : ''} title="下へ">${ic('chevDown','▼',14)}</button>
            </div>
            <span class="task-edit-icon">${icoE(t.icon) || ic('clipboard','📋',16)}</span>
            <span class="task-edit-name">${escapeHtml(t.name)}</span>
            ${(t.id === 'd_complete' || t.id === 't_complete') ? '<span class="task-edit-tag auto" title="他のタスク全完了で自動ON">自動</span>' : ''}
            ${t.hasChecklist ? '<span class="task-edit-tag" style="background:rgba(34,197,94,.18);color:#22c55e;border:1px solid rgba(34,197,94,.35)" title="小タスク制：詳細チェックリストが有効">'+ic('pencil','📝',16)+' 小タスク</span>' : ''}
            ${t.optional ? '<span class="task-edit-tag" style="background:rgba(168,85,247,.18);color:#c084fc;border:1px solid rgba(168,85,247,.35)" title="選択制：車両ごとに使うかどうかをチェックで指定">選択</span>' : ''}
            ${(() => {
              // v2.2.1: メモ設定がOFF以外ならバッジ表示（選択バッジと同じ見た目）
              if (typeof isTaskMemoEnabled !== 'function' || !isTaskMemoEnabled(t.id, ph.key)) return '';
              const cfg = getTaskMemoConfig(t.id, ph.key);
              const detail = cfg.type === 'freeword' ? 'フリーテキスト'
                          : cfg.type === 'date'     ? '日付' + (cfg.label ? `「${cfg.label}」` : '')
                          : cfg.type === 'time'     ? '時刻' + (cfg.label ? `「${cfg.label}」` : '')
                          : '';
              return `<span class="task-edit-tag" style="background:rgba(96,165,250,.18);color:#93c5fd;border:1px solid rgba(96,165,250,.35)" title="メモ設定：${escapeHtml(detail)}">メモ</span>`;
            })()}
            ${(() => {
              // v2.8.0: 完了時LINE通知が OFF のタスクだけバッジ表示（既定はONなので、OFFのときだけ目印）
              if (ph.key === 'backoffice') return '';
              if (typeof isTaskNotifyEnabled === 'function' && !isTaskNotifyEnabled(t.id, ph.key)) {
                return '<span class="task-edit-tag" style="background:rgba(148,163,184,.18);color:#cbd5e1;border:1px solid rgba(148,163,184,.35)" title="このタスクは完了してもLINE通知しません">'+ic('bell','🔕',15)+' 通知OFF</span>';
              }
              return '';
            })()}
            ${ph.dlMode === 'dual' ? `
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
            </div>` : ph.dlMode === 'single' ? `
            <div class="task-edit-deadline task-edit-deadline-v2">
              <div class="task-edit-deadline-pair" title="納車から何日前に行うか">
                <span class="task-edit-deadline-lbl">納車</span>
                <input type="number" min="1" max="365" value="${targetVal}"
                       placeholder="—"
                       onchange="setTaskTargetDays('${escapeHtml(t.id)}', '${ph.key}', this.value)"
                       class="task-edit-deadline-inp"
                       title="納車から N 日前">
                <span class="task-edit-deadline-suffix">日前</span>
              </div>
            </div>` : ''}
            <!-- v2.0.0: ON/OFFトグルを廃止し、すべての操作（ON/OFF含む）を ⋮ メニューに集約。
                 ⋮ボタンの見た目は「OFFのときグレーアウト」で視覚的にON/OFFも判別できる。 -->
            <button class="task-edit-menu-btn${t.enabled ? '' : ' task-edit-menu-off'}"
                    onclick="openTaskMenu('${escapeHtml(t.id)}', '${ph.key}')"
                    title="${t.enabled ? 'ON' : 'OFF'}（クリックで操作メニュー）">⋮</button>
          </div>`;
      });
    }
    // v1.8.112: 各フェーズ末尾に「+タスク追加」ボタン
    html += `
      <div class="task-edit-add-inline" style="margin-top:10px;padding:10px;background:var(--bg3);border-radius:8px">
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px">＋ このフェーズに新しいタスクを追加</div>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="text" id="new-task-icon-${ph.key}" class="settings-input" placeholder="" maxlength="4" style="width:48px;text-align:center">
          <input type="text" id="new-task-name-${ph.key}" class="settings-input" placeholder="タスク名" maxlength="20" style="flex:1">
          <button class="btn-sm" onclick="addCustomTaskForPhase('${ph.key}')">追加</button>
        </div>
      </div>`;
    html += `</div>`;
  });

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
// v2.5.1: panel-templates 経由をやめ、設定パネル内の task-patterns セクションへ遷移
//         （タスク・進捗下の「タスクパターン一覧を開く」ボタンと設定サイドバー「タスクパターン」を同一画面に統一）
window.openTemplateListFromSettings = function () {
  if (window._tplEditor) {
    window._tplEditor.view = 'list';
    window._tplEditor.activeTplId = null;
    window._tplEditor.activeVariantId = null;
    window._tplEditor.expandedSectionId = null;
    window._tplEditor.backTo = 'settings';
  }
  // 設定パネル内の「タスクパターン」セクションを開く
  if (typeof selectSettingsSection === 'function') {
    selectSettingsSection('task-patterns');
    // セクション切替後、右コンテンツのスクロールをトップへ
    setTimeout(() => {
      const content = document.querySelector('.settings-content');
      if (content) content.scrollTop = 0;
    }, 30);
  }
};

// ========================================
// v2.5.6: タスク行の ⋮ メニュー（設定モーダル）
//   - 旧 v1.8.13 アクションシート（クリック即実行）から、設定モーダルに変更
//   - 各項目はトグル/入力欄/select で編集 → 「保存して閉じる」で一括適用
//   - 「📦 タスクパターンを編集」「🗑 削除」は画面遷移するので即実行
// ========================================
window._taskSettingsModal = null;

window.openTaskMenu = function (taskId, phase) {
  const tasks = (typeof getAllTasksForUI === 'function') ? getAllTasksForUI(phase) : [];
  const t = tasks.find(x => x.id === taskId);
  if (!t) return;

  const isAutoTask  = (taskId === 't_complete' || taskId === 'd_complete');
  const isEquip     = (taskId === 't_equip');
  const isRegister  = (taskId === 'd_register');
  const isProtected = isAutoTask || isEquip || isRegister;

  // 現在値スナップショット
  const currentEnabled   = !!t.enabled;
  const currentOptional  = (typeof isTaskOptional === 'function') ? !!isTaskOptional(taskId, phase) : false;
  const currentChecklist = !!t.hasChecklist;
  const currentName      = t.name || '';
  const currentIcon      = t.icon || '📋';
  const memoCfg          = (typeof getTaskMemoConfig === 'function') ? getTaskMemoConfig(taskId, phase) : { type: 'off', label: '' };
  // v2.8.0: 完了時LINE通知 ON/OFF（既定 ON）
  const currentNotify    = (typeof isTaskNotifyEnabled === 'function') ? !!isTaskNotifyEnabled(taskId, phase) : true;
  // v3.0.0：この大タスクを「どこまで使うか」（大タスク / 中タスク / 小タスク / 中→小タスク）
  const _stepTpl = (typeof ChecklistTemplates !== 'undefined' && typeof templateIdForTask === 'function')
    ? ChecklistTemplates[templateIdForTask(taskId, phase)] : null;
  const currentLevel = (window.CarStep && window.CarStep.levelOf)
    ? window.CarStep.levelOf(taskId, phase)
    : (currentChecklist ? 'item' : 'task');
  const stepSectionCount = _stepTpl && Array.isArray(_stepTpl.sections) ? _stepTpl.sections.length : 0;

  window._taskSettingsModal = {
    taskId, phase,
    isProtected, isAutoTask, isEquip, isRegister,
    canToggleChecklist: !!t.canToggleChecklist,
    enabled: currentEnabled,
    optional: currentOptional,
    hasChecklist: currentChecklist,
    name: currentName,
    icon: currentIcon,
    memoType: memoCfg.type || 'off',
    memoLabel: memoCfg.label || '',
    notify: currentNotify,
    level: currentLevel,
    stepSectionCount: stepSectionCount,
    _initial: {
      enabled: currentEnabled,
      optional: currentOptional,
      hasChecklist: currentChecklist,
      name: currentName,
      icon: currentIcon,
      memoType: memoCfg.type || 'off',
      memoLabel: memoCfg.label || '',
      notify: currentNotify,
      level: currentLevel,
    },
  };

  const titleEl = document.getElementById('task-actionsheet-title');
  if (titleEl) titleEl.innerHTML = icoE((t.icon || '📋') + ' ' + (t.name || '') + ' の設定');

  _renderTaskSettingsForm();

  const m = document.getElementById('modal-task-actions');
  if (m) m.classList.add('open');
};

function _renderTaskSettingsForm() {
  const body = document.getElementById('task-actionsheet-body');
  if (!body) return;
  const s = window._taskSettingsModal;
  if (!s) { body.innerHTML = ''; return; }

  const row = (label, desc, controlHtml, extraClass) => `
    <div class="ts-row${extraClass ? ' ' + extraClass : ''}">
      <div class="ts-row-left">
        <div class="ts-row-label">${label}</div>
        ${desc ? `<div class="ts-row-desc">${desc}</div>` : ''}
      </div>
      <div class="ts-row-control">${controlHtml}</div>
    </div>`;
  const toggleHtml = (key, on, extraClass) => `
    <div class="toggle ${on ? 'on' : ''}${extraClass ? ' ' + extraClass : ''}" onclick="_toggleTaskSettingsField('${key}')" role="switch" aria-checked="${on}"></div>`;
  const memoOptions = ['off', 'freeword', 'date', 'time'].map(v => {
    const label = v === 'off' ? 'OFF（メモ無効）'
               : v === 'freeword' ? 'フリーテキスト'
               : v === 'date' ? '日付ピッカー'
               : '時刻ピッカー';
    return `<option value="${v}" ${s.memoType === v ? 'selected' : ''}>${label}</option>`;
  }).join('');
  const escAttr = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  let html = '';

  // 1. ON/OFF
  html += row('大タスクを表示する', 'OFFにするとカード詳細・進捗計算・カンバンから除外されます', toggleHtml('enabled', s.enabled));

  // 2. 名前・アイコン（保護対象以外）
  if (!s.isProtected) {
    html += `
      <div class="ts-row">
        <div class="ts-row-left">
          <div class="ts-row-label">名前・アイコン</div>
          <div class="ts-row-desc">カード・カンバンで表示される名前。アイコンは絵文字1〜2文字推奨</div>
        </div>
        <div class="ts-row-control ts-row-control-stack">
          <div class="ts-name-row">
            <input type="text" class="settings-input ts-icon-input" id="ts-icon" value="${escAttr(s.icon)}" maxlength="4" placeholder="" oninput="_setTaskSettingsField('icon', this.value)">
            <input type="text" class="settings-input ts-name-input" id="ts-name" value="${escAttr(s.name)}" maxlength="30" placeholder="タスク名" oninput="_setTaskSettingsField('name', this.value)">
          </div>
        </div>
      </div>`;
  }

  // 3. v3.0.0：この大タスクを「どこまで使うか」（大 / 中 / 小 / 中→小）
  //    ⚠ 中タスクは「小タスクを持てる」だけ。持たない使い方（中タスクだけ）も選べる。
  if (!s.isAutoTask) {
    const LV = [
      { v: 'task',      label: '大タスク（スイッチだけ）',     desc: 'このタスクは「完了」を押すだけ。中タスクも小タスクも出しません' },
      { v: 'step',      label: '中タスク',                     desc: '「点検 ▸ 見積 ▸ 作業」のように順番に進めます。小タスクは使いません' },
      { v: 'item',      label: '小タスク',                     desc: '今までのチェックリスト。項目を上から埋めていきます' },
      { v: 'step_item', label: '中→小タスク',                  desc: '中タスクの下に小タスクがぶら下がります。中タスクの小タスクが全部済むと、次の中タスクへ' },
    ];
    const cur = LV.find(x => x.v === s.level) || LV[2];
    const opts = LV.map(x => {
      // 保護タスク（装備品・登録内容設定など）は「大タスク（スイッチだけ）」に戻せない
      const dis = (x.v === 'task' && !s.canToggleChecklist) ? ' disabled' : '';
      return `<option value="${x.v}"${s.level === x.v ? ' selected' : ''}${dis}>${x.label}</option>`;
    }).join('');
    const selHtml = `<select class="settings-input" style="min-width:190px"
        onchange="_setTaskLevel(this.value)">${opts}</select>`;
    html += row('このタスクの作り', cur.desc, selHtml);

    // 中タスクを使う時の注意と、パターン編集への入口
    const usesStep = (s.level === 'step' || s.level === 'step_item');
    let sub = '';
    if (usesStep && s.stepSectionCount === 0) {
      sub = `<div class="ts-row-desc">${ic('warn','⚠',15)} 中タスクが1つもありません。「タスクパターンを編集」で作ってください</div>`;
    } else if (usesStep) {
      sub = `<div class="ts-row-desc">中タスクは ${s.stepSectionCount} 個。<b>前が終わるまで次は押せません。</b>進み具合は中タスクの数で数えます</div>`;
    }
    if (s.level !== 'task') {
      html += `
        <div class="ts-row ts-row-sub">
          <div class="ts-row-left">${sub}</div>
          <div class="ts-row-control">
            <button class="btn-sm" onclick="_openPatternsFromTaskSettings()">${ic('box','📦',16)} タスクパターンを編集（別画面）</button>
          </div>
        </div>`;
    }
  } else if (s.hasChecklist) {
    html += `
      <div class="ts-row">
        <div class="ts-row-left">
          <div class="ts-row-label">このタスクの作り</div>
          <div class="ts-row-desc">${ic('lock','🔒',15)} このタスクは自動判定です</div>
        </div>
        <div class="ts-row-control"></div>
      </div>`;
  }

  // 4. 選択制
  if (!s.isAutoTask) {
    html += row('選択制にする', 'ONにすると、車ごとに「使う／使わない」を選べる任意タスクになります（既定OFF＝全車に表示）', toggleHtml('optional', s.optional));
  }

  // 5. メモ設定
  if (!s.isAutoTask) {
    html += `
      <div class="ts-row">
        <div class="ts-row-left">
          <div class="ts-row-label">タスク個別メモ</div>
          <div class="ts-row-desc">カード詳細で、このタスク専用のメモ欄を出します</div>
        </div>
        <div class="ts-row-control ts-row-control-stack">
          <select class="settings-input ts-memo-type" onchange="_setTaskSettingsField('memoType', this.value); _renderTaskSettingsForm()">${memoOptions}</select>
          ${(s.memoType === 'date' || s.memoType === 'time')
            ? `<input type="text" class="settings-input ts-memo-label" value="${escAttr(s.memoLabel)}" maxlength="20" placeholder="ラベル（例：登録日／入庫時刻）" oninput="_setTaskSettingsField('memoLabel', this.value)">`
            : ''}
        </div>
      </div>`;
  }

  // 6. 完了時LINE通知（v2.8.0）。バックオフィスはLINE通知の対象外なので出さない
  if (s.phase !== 'backoffice') {
    html += row(
      '完了時にLINE通知',
      'このタスクが完了したとき、社内LINEに自動で完了通知を送ります。<br>※ LINE設定の「大タスク完了通知」が全体ONのときだけ有効。OFFにすると、全体がONでもこのタスクは飛びません。',
      toggleHtml('notify', s.notify)
    );
  }

  // 7. 削除
  if (!s.isProtected) {
    html += `
      <div class="ts-row ts-row-danger">
        <div class="ts-row-left">
          <div class="ts-row-label">このタスクを削除</div>
          <div class="ts-row-desc">削除すると進捗計算・カードから完全に消えます（復元不可）</div>
        </div>
        <div class="ts-row-control">
          <button class="btn-sm btn-danger" onclick="_deleteTaskFromSettings()">${ic('trash','🗑',16)} 削除</button>
        </div>
      </div>`;
  }

  // 保護対象の注記
  if (s.isProtected) {
    const noteText = s.isAutoTask
      ? '🔒 自動判定タスクは、他タスクの完了で自動的にON/OFFします。名前変更・削除はできません。'
      : s.isEquip
        ? '🔒 装備品チェックは、装備品閲覧シート（カタログ印刷）と連動しています。名前変更・削除はできません。'
        : '🔒 登録内容設定は、カード詳細の登録内容バー表示と連動しています。名前変更・削除はできません。';
    html += `<div class="ts-note">${noteText}</div>`;
  }

  body.innerHTML = html;
}
window._renderTaskSettingsForm = _renderTaskSettingsForm;

window._setTaskSettingsField = function (key, value) {
  const s = window._taskSettingsModal;
  if (!s) return;
  s[key] = value;
};

// v3.0.0：このタスクの作り（大 / 中 / 小 / 中→小）を選ぶ
window._setTaskLevel = function (v) {
  const s = window._taskSettingsModal;
  if (!s) return;
  const before = s.level;
  if (v === before) return;
  const usesStep = (v === 'step' || v === 'step_item');
  if (usesStep && !s.stepSectionCount) {
    if (typeof showToast === 'function') {
      showToast('先に「タスクパターンを編集」で中タスクを作ってください', 'CF-1009');
    }
    _renderTaskSettingsForm();
    return;
  }
  if (usesStep) {
    const n = s.stepSectionCount;
    const msg = (v === 'step')
      ? `「中タスク」にしますか？\n\n・中タスク ${n} 個を、上から順に押していく形になります\n・小タスクは使いません（中タスクを直接「完了にする」で押します）\n・前の中タスクが終わるまで、次は押せません\n\n※ 入れてあるチェックは1つも消えません。戻せば元どおりです。`
      : `「中→小タスク」にしますか？\n\n・中タスク ${n} 個が、上から順に並びます\n・それぞれの中タスクの下に、小タスクがぶら下がります\n・前の中タスクが終わるまで、次は押せません\n・進み具合は「済んだ中タスクの数 ÷ ${n}」で出ます\n\n※ 入れてあるチェックは1つも消えません。戻せば元どおりです。`;
    if (!confirm(msg)) { _renderTaskSettingsForm(); return; }
  }
  if (v === 'task' && before !== 'task') {
    if (!confirm('「大タスク（スイッチだけ）」に戻しますか？\n\nカード詳細では「完了」を押すだけになります。\n中タスク・小タスクの中身は消えないので、戻せばそのまま使えます。')) {
      _renderTaskSettingsForm(); return;
    }
  }
  s.level = v;
  s.hasChecklist = (v !== 'task');
  _renderTaskSettingsForm();
};

window._toggleTaskSettingsField = function (key, forceValue) {
  const s = window._taskSettingsModal;
  if (!s) return;
  if (forceValue === true) {
    if (key === 'hasChecklist') {
      if (!confirm('小タスク制を ON にしますか？\n\nカード詳細で小タスク（チェックリスト）が展開されるようになります。\n後からOFFに戻してもパターンの中身は保持されます。')) return;
    }
    s[key] = true;
  } else if (forceValue === false) {
    // v2.5.9: ON→OFF を許可（パターンは Firestore 上に保持されたまま）
    if (key === 'hasChecklist') {
      if (!confirm('小タスク制を OFF に戻しますか？\n\nカード詳細では「完了」トグルだけのシンプル表示に戻ります。\nパターン（variants）の中身は保持されるので、もう一度ONにすればそのまま使えます。')) return;
    }
    s[key] = false;
  } else {
    s[key] = !s[key];
  }
  _renderTaskSettingsForm();
};

// v2.5.9: ロックトーストは廃止。互換のため空関数だけ残す
window._taskSettingsLockedToast = function () {};

window._openPatternsFromTaskSettings = function () {
  closeTaskActions();
  if (typeof selectSettingsSection === 'function') {
    selectSettingsSection('task-patterns');
  } else if (typeof openTaskTemplate === 'function') {
    openTaskTemplate(window._taskSettingsModal.taskId, window._taskSettingsModal.phase);
  }
};

window._deleteTaskFromSettings = function () {
  const s = window._taskSettingsModal;
  if (!s) return;
  if (typeof deleteCustomTask === 'function') {
    closeTaskActions();
    deleteCustomTask(s.taskId, s.phase);
  }
};

// 保存して閉じる：作業バッファの値を実際の設定に反映
window.saveTaskSettingsModal = async function () {
  const s = window._taskSettingsModal;
  if (!s) { closeTaskActions(); return; }
  const init = s._initial || {};
  const { taskId, phase } = s;
  let changed = false;

  // 1. ON/OFF
  if (s.enabled !== init.enabled) {
    if (typeof toggleTaskEnabled === 'function') {
      toggleTaskEnabled(taskId, phase, s.enabled);
    }
    changed = true;
  }

  // 2. 名前・アイコン（保護対象以外）
  if (!s.isProtected) {
    const newName = (s.name || '').trim();
    const newIcon = (s.icon || '').trim() || '📋';
    if (newName && (newName !== init.name || newIcon !== init.icon)) {
      if (typeof appTaskRename !== 'undefined') {
        if (!appTaskRename[phase]) appTaskRename[phase] = {};
        appTaskRename[phase][taskId] = { name: newName, icon: newIcon };
        const c = (typeof appCustomTasks !== 'undefined') ? (appCustomTasks || []).find(x => x.id === taskId) : null;
        if (c) { c.name = newName; c.icon = newIcon; }
        if (window.saveSettings) saveSettings();
        changed = true;
      }
    }
  }

  // 3. v3.0.0：このタスクの作り（大 / 中 / 小 / 中→小）
  if (s.level !== init.level) {
    const wantChecklist = (s.level !== 'task');
    if (s.canToggleChecklist && (init.level === 'task') !== (s.level === 'task')) {
      if (typeof toggleTaskChecklist === 'function') {
        await toggleTaskChecklist(taskId, phase, wantChecklist);
      }
    }
    if (wantChecklist) {
      const tplId = (typeof templateIdForTask === 'function') ? templateIdForTask(taskId, phase) : null;
      const tpl = (tplId && typeof ChecklistTemplates !== 'undefined') ? ChecklistTemplates[tplId] : null;
      if (tpl) {
        tpl.taskLevel = s.level;              // 'item' / 'step' / 'step_item'
        delete tpl.stepMode;                  // v2.52 の古い印はもう使わない
        if (window.dbTemplates && window.dbTemplates.saveTemplate) {
          try { await window.dbTemplates.saveTemplate(tpl); } catch (e) { console.error('[タスクの作り] 保存に失敗', e); }
        }
      }
    }
    changed = true;
  }

  // 4. 選択制
  if (!s.isAutoTask && s.optional !== init.optional) {
    if (typeof setTaskOptional === 'function') {
      setTaskOptional(taskId, phase, s.optional);
      changed = true;
    }
  }

  // 5. メモ設定
  if (!s.isAutoTask && (s.memoType !== init.memoType || s.memoLabel !== init.memoLabel)) {
    if (typeof setTaskMemoConfig === 'function') {
      setTaskMemoConfig(taskId, phase, { type: s.memoType, label: s.memoLabel });
      changed = true;
    }
  }

  // 6. 完了時LINE通知（v2.8.0）
  if (s.phase !== 'backoffice' && s.notify !== init.notify) {
    if (typeof setTaskNotify === 'function') {
      setTaskNotify(taskId, phase, s.notify);
      changed = true;
    }
  }

  if (changed) {
    if (typeof renderTasksEditor === 'function') renderTasksEditor();
    if (typeof renderAll === 'function') renderAll();
    if (typeof showToast === 'function') showToast('設定を保存しました');
  }
  closeTaskActions();
};

window.closeTaskActions = function () {
  const m = document.getElementById('modal-task-actions');
  if (m) m.classList.remove('open');
  window._taskSettingsModal = null;
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
// v2.0.0: ⋮メニュー経由に統一されたため、UI反映用に renderTasksEditor を呼ぶ
function toggleTaskEnabled(taskId, phase, enabled) {
  if (!appTaskEnabled[phase]) appTaskEnabled[phase] = {};
  appTaskEnabled[phase][taskId] = !!enabled;
  if (typeof renderTasksEditor === 'function') renderTasksEditor();
  if (typeof _refreshSizesDependentViews === 'function') _refreshSizesDependentViews();
  if (typeof renderAll === 'function') renderAll();
  showToast(enabled ? 'タスクを有効化しました' : 'タスクを無効化しました');
  if (window.saveSettings) saveSettings();
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
  if (!name) { showToast('タスク名を入力してください', 'CF-9002'); return; }
  if (!useRegen && !useDelivery) { showToast('適用フェーズを選んでください', 'CF-9003'); return; }
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

// v1.8.112: 各フェーズ専用の追加ボタン
function addCustomTaskForPhase(phase) {
  const iconEl = document.getElementById('new-task-icon-' + phase);
  const nameEl = document.getElementById('new-task-name-' + phase);
  if (!iconEl || !nameEl) return;
  const icon = (iconEl.value || '').trim() || '📋';
  const name = (nameEl.value || '').trim();
  if (!name) { showToast('タスク名を入力してください', 'CF-9002'); return; }
  const id = 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  appCustomTasks.push({ id, name, icon, phases: [phase] });
  iconEl.value = '';
  nameEl.value = '';
  // 各車両のタスク状態を初期化
  if (typeof cars !== 'undefined' && Array.isArray(cars)){
    cars.forEach(c => {
      if (phase === 'regen' && c.regenTasks && !(id in c.regenTasks)) c.regenTasks[id] = false;
      if (phase === 'delivery' && c.deliveryTasks && !(id in c.deliveryTasks)) c.deliveryTasks[id] = false;
      if (phase === 'backoffice'){
        if (!c.backofficeTasks) c.backofficeTasks = {};
        if (!(id in c.backofficeTasks)) c.backofficeTasks[id] = false;
      }
    });
  }
  renderTasksEditor();
  if (typeof _refreshSizesDependentViews === 'function') _refreshSizesDependentViews();
  showToast(`「${name}」を追加しました`);
  if (window.saveSettings) saveSettings();
}
window.addCustomTaskForPhase = addCustomTaskForPhase;

// v1.8.46: カスタムタスクの名前を変更
// v1.8.56: prompt() → HTML inputs を持つカスタムモーダルへ刷新。
//   HTML <input> にフォーカスしている時は Win+. / Win+; で Windows 絵文字パレットが開く。
//   prompt() ではこのショートカットが効かないため。
// v2.0.0: ビルトインタスクも編集可能に。phase 引数を受け取り、カスタム/ビルトインで分岐。
//   保護対象は t_complete / d_complete（自動判定）と t_equip（装備品ビュー連動）のみ。
function renameCustomTask(taskId, phase) {
  // 自動判定タスクはガード
  if (taskId === 't_complete' || taskId === 'd_complete') {
    if (typeof showToast === 'function') showToast('自動判定タスクは名前変更できません', 'CF-9004');
    return;
  }
  // 装備品チェックはガード（閲覧用装備品シートに連動）
  if (taskId === 't_equip') {
    if (typeof showToast === 'function') showToast('装備品チェックは装備品ビュー連動のため名前変更できません', 'CF-9005');
    return;
  }
  // v2.4.4: 登録内容設定はガード（登録内容バーに連動）
  if (taskId === 'd_register') {
    if (typeof showToast === 'function') showToast('登録内容設定は登録内容バー連動のため名前変更できません', 'CF-9006');
    return;
  }
  // カスタムかビルトインかを判定
  const cust = (appCustomTasks || []).find(x => x.id === taskId);
  let curName = '', curIcon = '📋';
  if (cust) {
    curName = cust.name || '';
    curIcon = cust.icon || '📋';
  } else {
    // ビルトイン：適用済みオーバーライド → 元定義の順で初期値
    const ov = (appTaskRename && appTaskRename[phase] && appTaskRename[phase][taskId]) || null;
    const builtinSrc = (phase === 'delivery') ? DELIVERY_TASKS
                     : (phase === 'backoffice') ? BACKOFFICE_TASKS
                     : REGEN_TASKS;
    const b = (builtinSrc || []).find(x => x.id === taskId);
    if (!b) return; // 見つからなければ何もしない
    curName = (ov && ov.name) ? ov.name : (b.name || '');
    curIcon = (ov && ov.icon) ? ov.icon : (b.icon || '📋');
  }

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
          <button class="mclose" onclick="_closeRenameTaskModal(false)">${ic('close','✕',15)}</button>
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

  // 値を反映（v2.0.0: builtin/custom 両対応）
  document.getElementById('rename-task-icon').value = curIcon;
  document.getElementById('rename-task-name').value = curName;
  overlay.dataset.taskId = taskId;
  overlay.dataset.phase  = phase || '';
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
  const phase  = overlay.dataset.phase || '';
  const newName = (document.getElementById('rename-task-name').value || '').trim();
  const newIcon = (document.getElementById('rename-task-icon').value || '').trim();
  if (!newName) { showToast('タスク名が空です', 'CF-9007'); return; }

  // v2.0.0: カスタム or ビルトインで分岐
  const cust = (appCustomTasks || []).find(x => x.id === taskId);
  let nameChanged = false, iconChanged = false;
  if (cust) {
    nameChanged = newName !== cust.name;
    iconChanged = !!newIcon && newIcon !== cust.icon;
    cust.name = newName;
    if (newIcon) cust.icon = newIcon;
  } else {
    // ビルトイン → override をセット
    if (!appTaskRename[phase]) appTaskRename[phase] = {};
    const ov = appTaskRename[phase][taskId] || {};
    const builtinSrc = (phase === 'delivery') ? DELIVERY_TASKS
                     : (phase === 'backoffice') ? BACKOFFICE_TASKS
                     : REGEN_TASKS;
    const b = (builtinSrc || []).find(x => x.id === taskId) || {};
    const origName = (ov.name) ? ov.name : (b.name || '');
    const origIcon = (ov.icon) ? ov.icon : (b.icon || '');
    nameChanged = newName !== origName;
    iconChanged = !!newIcon && newIcon !== origIcon;
    appTaskRename[phase][taskId] = {
      name: newName,
      icon: newIcon || ov.icon || b.icon || '',
    };
  }
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

// v2.0.0: ビルトイン/カスタム両対応のタスク削除
//   ビルトインは「削除フラグ」を立てて非表示化（不可逆扱い・元データは温存）
//   保護対象は t_complete / d_complete（自動判定）と t_equip（装備品ビュー連動）のみ
function deleteCustomTask(taskId, phase) {
  if (taskId === 't_complete' || taskId === 'd_complete') {
    if (typeof showToast === 'function') showToast('自動判定タスクは削除できません', 'CF-9008');
    return;
  }
  if (taskId === 't_equip') {
    if (typeof showToast === 'function') showToast('装備品チェックは装備品ビュー連動のため削除できません', 'CF-9009');
    return;
  }
  // v2.4.4: 登録内容設定はガード
  if (taskId === 'd_register') {
    if (typeof showToast === 'function') showToast('登録内容設定は登録内容バー連動のため削除できません', 'CF-9010');
    return;
  }
  const cust = (appCustomTasks || []).find(x => x.id === taskId);
  // 表示名（確認ダイアログ用）
  let displayName = taskId;
  if (cust) {
    displayName = cust.name || taskId;
  } else {
    const ov = (appTaskRename && appTaskRename[phase] && appTaskRename[phase][taskId]) || null;
    const builtinSrc = (phase === 'delivery') ? DELIVERY_TASKS
                     : (phase === 'backoffice') ? BACKOFFICE_TASKS
                     : REGEN_TASKS;
    const b = (builtinSrc || []).find(x => x.id === taskId);
    if (!b) return;
    displayName = (ov && ov.name) ? ov.name : (b.name || taskId);
  }
  if (!confirm(`「${displayName}」を削除しますか？\n（既に進捗が入っていても消えます。\n　ビルトインタスクは設定画面から非表示になります）`)) return;

  if (cust) {
    const __idx = appCustomTasks.findIndex(x => x.id === taskId);
    if (__idx >= 0) appCustomTasks.splice(__idx, 1);
    cars.forEach(c => {
      if (c.regenTasks)    delete c.regenTasks[taskId];
      if (c.deliveryTasks) delete c.deliveryTasks[taskId];
    });
    ['regen', 'delivery', 'backoffice'].forEach(ph => {
      if (appTaskEnabled[ph])  delete appTaskEnabled[ph][taskId];
      if (appTaskDeadline[ph]) delete appTaskDeadline[ph][taskId];
      if (appTaskOrder[ph])    appTaskOrder[ph]    = appTaskOrder[ph].filter(id => id !== taskId);
      if (appTaskOptional[ph]) delete appTaskOptional[ph][taskId];
      if (appTaskWeight[ph])   delete appTaskWeight[ph][taskId];
      if (appTaskMode[ph])     delete appTaskMode[ph][taskId];
    });
  } else {
    // ビルトイン → 削除フラグ
    if (!appTaskDeleted[phase]) appTaskDeleted[phase] = {};
    appTaskDeleted[phase][taskId] = true;
    // 有効フラグも OFF にしておく（既存の有効タスク扱いから抜く）
    if (!appTaskEnabled[phase]) appTaskEnabled[phase] = {};
    appTaskEnabled[phase][taskId] = false;
  }
  renderTasksEditor();
  if (typeof _refreshSizesDependentViews === 'function') _refreshSizesDependentViews();
  if (typeof renderAll === 'function') renderAll();
  showToast('タスクを削除しました');
  if (window.saveSettings) saveSettings();
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
    showToast('画像が大きすぎます（5MB以下にしてください）', 'CF-9011');
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
      if (!blob) { showToast('画像処理に失敗しました', 'CF-9012'); return; }
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
    if (!blob) { showToast('画像処理に失敗しました', 'CF-9012'); return; }
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
      showToast('保存に失敗しました', 'CF-0018');
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
    showToast('リセットに失敗しました', 'CF-9013');
  }
}

async function saveProfileDisplayName() {
  const inp = document.getElementById('profile-displayname-inp');
  const v = (inp && inp.value || '').trim();
  if (!v) {
    showToast('表示名を入力してください（または「Google に戻す」を押してください）', 'CF-9014');
    return;
  }
  if (v.length > 30) {
    showToast('表示名は30文字以内にしてください', 'CF-9015');
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
    showToast('保存に失敗しました', 'CF-0018');
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
    showToast('リセットに失敗しました', 'CF-9013');
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
    showToast('この操作には管理者権限が必要です', 'CF-9016');
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
    showToast('この操作には管理者権限が必要です', 'CF-9016');
    return;
  }
  const targets = window.migrateDataUrls.scanTargets();
  const carCount = (targets.cars || []).length;
  if (carCount === 0) {
    showToast('移行対象の写真はありません', 'CF-9017');
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
    showToast('移行完了：' + summary);
    if (typeof renderAll === 'function') renderAll();
    if (typeof _refreshHeaderAvatars === 'function') _refreshHeaderAvatars();
  } catch (err) {
    console.error('[runMigratePhotos]', err);
    _setMigrateStatus('失敗：' + (err.message || err));
    showToast('移行に失敗しました', 'CF-9018');
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


// ========================================
// v2.51.1: 体験版（デモ）サイト
// ----------------------------------------
// 本番とまったく同じ画面を、ぜんぶサンプルの車で試せる場所。
// 中身は本番を出すたびに make-demo-carflow.ps1 が作り直すので、いつも本番と同じ版。
// 🔴 体験版の中では、このカードを出さない（自分自身へのリンクになってしまうため）。
// ========================================
const CF_DEMO_SITE_URL = 'https://yuta19kmail-coder.github.io/carflow-demo/';

function openDemoSite() {
  window.open(CF_DEMO_SITE_URL, '_blank', 'noopener');
}

async function copyDemoSiteUrl() {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(CF_DEMO_SITE_URL);
    } else {
      // 古いブラウザ・非セキュアな接続むけの逃げ道
      const ta = document.createElement('textarea');
      ta.value = CF_DEMO_SITE_URL;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (typeof showToast === 'function') showToast('体験版のリンクをコピーしました');
  } catch (e) {
    console.error('[demo-site] コピーに失敗', e);
    if (typeof showToast === 'function') showToast('コピーできませんでした。表示されているリンクを手で選んでください', 'CF-1007');
  }
}
window.openDemoSite = openDemoSite;
window.copyDemoSiteUrl = copyDemoSiteUrl;

function _setupDemoSiteCard() {
  const card = document.getElementById('settings-card-demo');
  if (!card) return;
  if (window.__DEMO_MODE === true) { card.style.display = 'none'; return; }
  const label = document.getElementById('demo-site-url');
  if (label && !label.textContent) label.textContent = CF_DEMO_SITE_URL;
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _setupDemoSiteCard);
} else {
  _setupDemoSiteCard();
}
