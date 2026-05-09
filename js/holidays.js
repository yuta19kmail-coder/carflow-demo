// ========================================
// holidays.js
// 祝日・休業日・定休日の管理
// ========================================

// 日本の祝日をAPIから取得（失敗時はフォールバック）
async function fetchJpHolidays() {
  try {
    const res = await fetch('https://holidays-jp.github.io/api/v1/date.json');
    if (res.ok) jpHolidays = await res.json();
    else throw new Error();
  } catch(e) {
    // APIが取れない場合の予備データ（2025〜2026年）
    jpHolidays = {
      '2025-01-01':'元日','2025-01-13':'成人の日','2025-02-11':'建国記念の日','2025-02-23':'天皇誕生日',
      '2025-03-20':'春分の日','2025-04-29':'昭和の日','2025-05-03':'憲法記念日','2025-05-04':'みどりの日',
      '2025-05-05':'こどもの日','2025-07-21':'海の日','2025-08-11':'山の日','2025-09-15':'敬老の日',
      '2025-09-23':'秋分の日','2025-10-13':'スポーツの日','2025-11-03':'文化の日','2025-11-23':'勤労感謝の日',
      '2026-01-01':'元日','2026-01-12':'成人の日','2026-02-11':'建国記念の日','2026-02-23':'天皇誕生日',
      '2026-03-20':'春分の日','2026-04-29':'昭和の日','2026-05-03':'憲法記念日','2026-05-04':'みどりの日',
      '2026-05-05':'こどもの日','2026-07-20':'海の日','2026-08-11':'山の日','2026-09-21':'敬老の日',
      '2026-09-23':'秋分の日','2026-10-12':'スポーツの日','2026-11-03':'文化の日','2026-11-23':'勤労感謝の日',
    };
  }
  if (document.querySelector('.tab.active')?.textContent.includes('カレンダー')) renderCalendar();
}

// 休業日追加フォームの表示切替
function toggleHolidayForm() {
  const f = document.getElementById('cal-holiday-form');
  f.style.display = f.style.display === 'block' ? 'none' : 'block';
  renderHolidayMiniList();
}

// 休業日を期間で追加
function saveHolidayRange() {
  const start = document.getElementById('h-start').value;
  const end = document.getElementById('h-end').value || start;
  const name = document.getElementById('h-name').value.trim() || '休業日';
  if (!start) { showToast('開始日を選択してください'); return; }
  if (new Date(start) > new Date(end)) { showToast('終了日は開始日以降にしてください'); return; }
  let added = 0;
  for (let d = new Date(start); d <= new Date(end); d.setDate(d.getDate()+1)) {
    const ds = d.toISOString().split('T')[0];
    if (!customHolidays.find(h => h.date === ds)) {
      customHolidays.push({date:ds, name});
      added++;
    }
  }
  document.getElementById('h-start').value = '';
  document.getElementById('h-end').value = '';
  document.getElementById('h-name').value = '';
  renderHolidayMiniList();
  renderCalendar();
  showToast(`${added}日間の休業日を追加しました`);
  if (window.saveSettings) saveSettings(); // v1.5.2
}

// 登録済み休業日の一覧表示
function renderHolidayMiniList() {
  const el = document.getElementById('holiday-mini-list');
  if (!el) return;
  if (!customHolidays.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--text3)">登録済みの休業日はありません</div>';
    return;
  }
  const sorted = [...customHolidays].sort((a,b) => a.date.localeCompare(b.date));
  const groups = [];
  let cur = null;
  sorted.forEach(h => {
    if (cur && cur.name === h.name) {
      const nxt = dateAddDays(cur.end, 1);
      if (nxt === h.date) { cur.end = h.date; return; }
    }
    cur = {name:h.name, start:h.date, end:h.date};
    groups.push(cur);
  });
  el.innerHTML = '<div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:6px">登録済み休業日</div>' +
    groups.map(g => `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">
      <span style="font-weight:600">${g.name}</span>
      <span style="color:var(--text3)">${g.start===g.end ? g.start : `${g.start} ～ ${g.end}`}</span>
      <button onclick="removeHolidayGroup('${g.name}','${g.start}','${g.end}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px">✕</button>
    </div>`).join('');
}

// 休業日グループを削除
function removeHolidayGroup(name, start, end) {
  const s = new Date(start), e = new Date(end);
  customHolidays = customHolidays.filter(h => {
    const d = new Date(h.date);
    return !(h.name === name && d >= s && d <= e);
  });
  renderHolidayMiniList();
  renderCalendar();
  showToast('削除しました');
  if (window.saveSettings) saveSettings(); // v1.5.2
}

// 定休日ピッカー描画
function renderClosedDaysPicker() {
  const el = document.getElementById('closed-days-picker');
  if (!el) return;
  el.innerHTML = WEEK.map((d,i) =>
    `<span class="closed-chip${closedDays.includes(i)?' active':''}" onclick="toggleClosedDay(${i})">${d}</span>`
  ).join('');
}

// 定休日の曜日を切替（毎週ルールも同期）
function toggleClosedDay(i) {
  const has = closedDays.includes(i);
  closedDays = has ? closedDays.filter(d => d !== i) : [...closedDays, i];
  // closedRules 側の weekly ルールを同期
  if (typeof closedRules !== 'undefined') {
    if (has) {
      closedRules = closedRules.filter(r => !(r.pattern === 'weekly' && r.dow === i));
    } else if (!closedRules.find(r => r.pattern === 'weekly' && r.dow === i)) {
      closedRules.push({id:'r-w-'+i, pattern:'weekly', dow:i});
    }
  }
  renderClosedDaysPicker();
  if (document.querySelector('.tab.active')?.textContent.includes('カレンダー')) renderCalendar();
  if (window.saveSettings) saveSettings(); // v1.5.2
}
