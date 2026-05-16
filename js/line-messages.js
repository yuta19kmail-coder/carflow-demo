// ========================================
// line-messages.js
// v1.8.80: タスク完了時の LINE 通知文言テーブル + ランダム選択ロジック
//
// 設計：
//   - 3カテゴリ：within_target（目標内）/ between（中間）/ over_limit（限界超）
//   - 各カテゴリに normal（通常）と rare（レア）の2バリエーション
//   - レア出現率は appSettings.lineMessages.rareRate（デフォ 0.10）
//   - テキスト内変数：
//       [T]      → タスク名
//       [車両]   → メーカー＋モデル
//       [作業者] → 作業者の表示名
//       [日数]   → 完了までかかった日数（テンプレに無ければ単に未差し込み）
//   - カスタマイズ：appSettings.lineMessages.table で上書き可能（設定UI / CSVから）
// ========================================

// ----- デフォルト文言テーブル -----
const DEFAULT_LINE_MESSAGES = {
  // 🟢 目標ライン内で完了
  within_target: {
    normal: [
      '[作業者] [車両] [T]完了 ✨\n[日数]日でクリア、順調！この調子！',
      '[車両] [T]完了 by [作業者] 💯\n理想ペースで決めた、ナイス！',
      '[作業者] [車両] [T]完了 🚀\n早ばや完了、さすが現場の鑑',
      '[作業者] [車両] [T]完了 👍\n[日数]日でフィニッシュ、お見事',
      '[車両] [T]完了 ([作業者]) ⭐\nサクッとクリア！',
      '[作業者] [車両] [T]完了 🎯\n完璧、読み通りの仕事',
      '[車両] [T]完了 by [作業者] ✅\n余裕クリア。お見事！',
    ],
    rare: [
      '[作業者] [車両] [T]完了 ⚡\n神…！爆速で仕留めた',
      '[作業者] [車両] [T]完了 🌟\nそれは神の仕事…！',
      '[車両] [T]完了 ([作業者]) 🎮\nチートかな？速すぎ',
      '[作業者] [車両] [T]完了 🦅\n鷹が獲物を仕留めるが如し',
      '[作業者] [車両] [T]完了 👑\n[作業者]様、瞬殺おつかれさまでございます',
    ],
  },

  // 🟡 目標超〜限界内で完了
  between: {
    normal: [
      '[作業者] [車両] [T]完了 💪\nちょい巻きで次は目標ライン狙お',
      '[車両] [T]完了 ([作業者]) 🆗\nなんとかクリア、お疲れさま',
      '[作業者] [車両] [T]完了 👌\n次はワンテンポ早く行けたら◎',
      '[車両] [T]完了 ([作業者]) ⚙️\nOK、流れ止めずに次へ',
      '[作業者] [車両] [T]完了 📈\n目標ラインまであと一歩、惜しい',
      '[車両] [T]完了 ([作業者]) 🎌\n次のタスクで取り返してこう',
      '[作業者] [車両] [T]完了 🙌\nフィニッシュ！次は先回りで',
    ],
    rare: [
      '[作業者] [車両] [T]完了 😅\n「ふぅ…」ギリギリ完了',
      '[作業者] [車両] [T]完了 🤝\nギリ間に合った系の漢',
      '[車両] [T]完了 ([作業者]) 🎢\nジェットコースター並みのハラハラ',
      '[作業者] [車両] [T]完了 🍜\n締切とラーメンは伸びる前が美味い',
      '[作業者] [車両] [T]完了 😂\n「セーフ…セーフだよね？」',
    ],
  },

  // 🔴 限界値超で完了
  over_limit: {
    normal: [
      '[作業者] [車両] [T]完了 ⚠️\n判定：激おこレベル MAX',
      '[車両] [T]完了 by [作業者] 😤\n明日は作戦本部に緊急招集！',
      '[作業者] [車両] [T]完了 💢\n…ねぇ、こういうのって…さ？',
      '[車両] [T]完了 ([作業者]) 🚨\n机トントン中（※私に机はない）',
      '[作業者] [車両] [T]完了 👔\n検出：眉間にシワ（※私に眉間は…）',
      '[車両] [T]完了 by [作業者] 📋\n明日の朝礼でログ公開予定',
      '[作業者] [車両] [T]完了 🙄\nま、終わったから…ヨシ？',
    ],
    rare: [
      '[作業者] [車両] [T]完了 🦖\nえ？化石になるのを待ってるんだと思ってた',
      '[作業者] [車両] [T]完了 🌍\nあれ？これ終わるまでに地球何回か回ってない？？',
      '[車両] [T]完了 ([作業者]) 🍜\n三日寝かせた豚骨スープより熟成しとるやんけ',
      '[作業者] [車両] [T]完了 🤖\nこれが人類の限界…って煽りすぎたかな',
      '[作業者] [車両] [T]完了 🐢\nウサギとカメで言うとどっち側？',
      '[車両] [T]完了 ([作業者]) 🎬\n大河ドラマ何話まで進んだ？',
      '[車両] [T]完了 ([作業者]) 💤\n工場の妖精にも先越されてますよ',
      '[作業者] [車両] [T]完了 📺\n完結編まで何巻使った？',
    ],
  },
};

// レア出現率（0.0 - 1.0）
const DEFAULT_RARE_RATE = 0.10;

// カテゴリのラベル（UI 表示用）
const LINE_MESSAGE_CATEGORY_LABELS = {
  within_target: { label: '🟢 目標ライン内', desc: '理想ペースで完了。褒め系' },
  between:       { label: '🟡 中間', desc: '目標超〜限界内。励まし系' },
  over_limit:    { label: '🔴 限界超', desc: '限界ライン超過。AI 辛辣ツッコミ系' },
};

// ----- 設定からテーブル＆レア率を取得 -----
function getLineMessageTable() {
  const cfg = (typeof appSettings !== 'undefined' && appSettings.lineMessages) || null;
  if (cfg && cfg.table && typeof cfg.table === 'object') return cfg.table;
  return DEFAULT_LINE_MESSAGES;
}

function getLineMessageRareRate() {
  const cfg = (typeof appSettings !== 'undefined' && appSettings.lineMessages) || null;
  if (cfg && typeof cfg.rareRate === 'number' && cfg.rareRate >= 0 && cfg.rareRate <= 1) {
    return cfg.rareRate;
  }
  return DEFAULT_RARE_RATE;
}

function setLineMessageTable(table) {
  if (!appSettings.lineMessages) appSettings.lineMessages = {};
  appSettings.lineMessages.table = table;
  if (window.saveSettings) saveSettings();
}

function setLineMessageRareRate(rate) {
  if (!appSettings.lineMessages) appSettings.lineMessages = {};
  const n = Number(rate);
  if (Number.isFinite(n) && n >= 0 && n <= 1) {
    appSettings.lineMessages.rareRate = n;
    if (window.saveSettings) saveSettings();
  }
}

function resetLineMessageTableToDefault() {
  if (!appSettings.lineMessages) appSettings.lineMessages = {};
  // table を消すと getLineMessageTable() が DEFAULT_LINE_MESSAGES を返す
  delete appSettings.lineMessages.table;
  if (window.saveSettings) saveSettings();
}

// ----- 変数差し込み -----
function _interpolateLineMessage(template, vars) {
  let s = String(template || '');
  vars = vars || {};
  s = s.replace(/\[T\]/g,      vars.T       || '');
  s = s.replace(/\[車両\]/g,   vars.vehicle || '');
  s = s.replace(/\[作業者\]/g, vars.worker  || '');
  // [日数] が未指定なら「[日数]日で 」のような前後を可能な範囲で取り除く
  if (vars.days != null && vars.days !== '') {
    s = s.replace(/\[日数\]/g, String(vars.days));
  } else {
    s = s.replace(/\[日数\]日で/g, '').replace(/\[日数\]/g, '');
  }
  return s;
}

// ----- メイン API -----
// カテゴリ判定：所要日数 と target / limit から
//   days <= target → 'within_target'
//   target < days <= limit → 'between'
//   days > limit → 'over_limit'
// target / limit のどちらかが null の場合は他方で代用する。両方 null なら null を返す。
function judgeLineMessageCategory(days, target, limit) {
  if (days == null || !Number.isFinite(Number(days))) return null;
  const t = (target != null) ? Number(target) : (limit != null ? Number(limit) : null);
  const l = (limit  != null) ? Number(limit)  : (target != null ? Number(target) : null);
  if (t == null || l == null) return null;
  if (days <= t) return 'within_target';
  if (days <= l) return 'between';
  return 'over_limit';
}

// カテゴリと変数を渡してメッセージ1つを返す（ランダム選択＋変数差し込み）
function pickLineMessage(category, vars) {
  const table = getLineMessageTable();
  const cat = table && table[category];
  if (!cat) return '';
  const rareRate = getLineMessageRareRate();
  const useRare = Array.isArray(cat.rare) && cat.rare.length > 0 && Math.random() < rareRate;
  const pool = useRare ? cat.rare : (Array.isArray(cat.normal) ? cat.normal : []);
  if (!pool.length) {
    // 通常空、レアあり、みたいなアンバランスはレアを必ず使う
    const fb = !useRare && Array.isArray(cat.rare) ? cat.rare : [];
    if (!fb.length) return '';
    const tpl = fb[Math.floor(Math.random() * fb.length)];
    return _interpolateLineMessage(tpl, vars);
  }
  const template = pool[Math.floor(Math.random() * pool.length)];
  return _interpolateLineMessage(template, vars);
}

// ========================================
// 設定UI ハンドラ群
// ========================================

// 現在のレア率と件数サマリーを UI に反映
function renderLineMessageSummary() {
  const rateEl = document.getElementById('line-msg-rare-rate');
  if (rateEl) rateEl.value = Math.round(getLineMessageRareRate() * 100);
  const sumEl = document.getElementById('line-msg-summary');
  if (sumEl) {
    const table = getLineMessageTable();
    const lines = [];
    Object.keys(LINE_MESSAGE_CATEGORY_LABELS).forEach(cat => {
      const lbl = LINE_MESSAGE_CATEGORY_LABELS[cat].label;
      const n = (table[cat] && Array.isArray(table[cat].normal)) ? table[cat].normal.length : 0;
      const r = (table[cat] && Array.isArray(table[cat].rare))   ? table[cat].rare.length   : 0;
      lines.push(`${lbl}：通常 ${n}件 ／ レア ${r}件`);
    });
    sumEl.innerHTML = lines.join('<br>');
  }
}

// レア出現率の変更
function onLineMsgRareRateChange(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    if (typeof showToast === 'function') showToast('0〜100 の数値を入力してください');
    return;
  }
  setLineMessageRareRate(n / 100);
  renderLineMessageSummary();
  if (typeof showToast === 'function') showToast(`レア出現率を ${n}% に設定しました`);
}

// デフォルトに戻す
function resetLineMessagesToDefault() {
  if (typeof window.confirm === 'function' && !window.confirm('文言テーブルをデフォルト（同梱の39パターン）に戻します。よろしいですか？')) return;
  resetLineMessageTableToDefault();
  renderLineMessageSummary();
  if (typeof showToast === 'function') showToast('文言をデフォルトに戻しました');
}

// ========================================
// CSV エクスポート/インポート
// ========================================

// CSV 書き出し
function exportLineMessagesCSV() {
  const table = getLineMessageTable();
  const rows = [['category', 'type', 'index', 'template']];
  ['within_target', 'between', 'over_limit'].forEach(cat => {
    ['normal', 'rare'].forEach(type => {
      const list = (table[cat] && Array.isArray(table[cat][type])) ? table[cat][type] : [];
      list.forEach((tpl, i) => {
        rows.push([cat, type, String(i + 1), String(tpl)]);
      });
    });
  });
  // CSV シリアライズ（簡易実装：" でクォート、内部 " は "" にエスケープ）
  const csv = rows.map(r => r.map(c => {
    const s = String(c).replace(/"/g, '""');
    return /[,"\n\r]/.test(s) ? `"${s}"` : s;
  }).join(',')).join('\r\n');
  // BOM 付き UTF-8（Excel で直接開いた時に文字化けしない）
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ymd = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `carflow_line_messages_${ymd}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (typeof showToast === 'function') showToast('CSV を書き出しました');
}

// CSV ファイル選択（input[type=file] の onchange）
function onLineMsgCSVFileSelected(input) {
  if (!input || !input.files || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = String(e.target.result || '');
      const parsed = _parseLineMessagesCSV(text);
      if (!parsed) {
        if (typeof showToast === 'function') showToast('CSV の形式が不正です（ヘッダ：category,type,index,template）');
        input.value = '';
        return;
      }
      const total = ['within_target', 'between', 'over_limit'].reduce((s, cat) => s + parsed[cat].normal.length + parsed[cat].rare.length, 0);
      if (total === 0) {
        if (typeof showToast === 'function') showToast('有効な文言が0件でした');
        input.value = '';
        return;
      }
      const msg = `CSV を取り込んで文言テーブルを上書きします。よろしいですか？\n\n`
        + `🟢 目標内：通常${parsed.within_target.normal.length}件／レア${parsed.within_target.rare.length}件\n`
        + `🟡 中間：通常${parsed.between.normal.length}件／レア${parsed.between.rare.length}件\n`
        + `🔴 限界超：通常${parsed.over_limit.normal.length}件／レア${parsed.over_limit.rare.length}件`;
      if (typeof window.confirm === 'function' && !window.confirm(msg)) {
        input.value = '';
        return;
      }
      setLineMessageTable(parsed);
      renderLineMessageSummary();
      if (typeof showToast === 'function') showToast('文言を CSV から取り込みました');
    } catch (err) {
      console.error('[line-messages] CSV import error:', err);
      if (typeof showToast === 'function') showToast('CSV の読み込みに失敗しました');
    } finally {
      input.value = '';
    }
  };
  reader.onerror = () => {
    if (typeof showToast === 'function') showToast('ファイルの読み込みに失敗しました');
    input.value = '';
  };
  reader.readAsText(file, 'utf-8');
}

// CSV パース（簡易実装：" 囲み・"" エスケープ・\r\n / \n 改行対応）
function _parseLineMessagesCSV(text) {
  const rows = [];
  let row = [], field = '', i = 0, inQ = false;
  const s = String(text || '').replace(/^﻿/, ''); // BOM除去
  while (i < s.length) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length < 2) return null;
  const header = rows[0].map(h => String(h || '').trim().toLowerCase());
  const iCat = header.indexOf('category');
  const iTyp = header.indexOf('type');
  const iTpl = header.indexOf('template');
  if (iCat < 0 || iTyp < 0 || iTpl < 0) return null;
  const out = {
    within_target: { normal: [], rare: [] },
    between:       { normal: [], rare: [] },
    over_limit:    { normal: [], rare: [] },
  };
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells || cells.length === 0) continue;
    const cat = String(cells[iCat] || '').trim();
    const typ = String(cells[iTyp] || '').trim();
    const tpl = String(cells[iTpl] || '');
    if (!cat || !typ || !tpl) continue;
    if (!out[cat]) continue;
    if (typ !== 'normal' && typ !== 'rare') continue;
    out[cat][typ].push(tpl);
  }
  return out;
}

// ----- グローバル公開 -----
window.DEFAULT_LINE_MESSAGES        = DEFAULT_LINE_MESSAGES;
window.DEFAULT_RARE_RATE            = DEFAULT_RARE_RATE;
window.LINE_MESSAGE_CATEGORY_LABELS = LINE_MESSAGE_CATEGORY_LABELS;
window.getLineMessageTable          = getLineMessageTable;
window.getLineMessageRareRate       = getLineMessageRareRate;
window.setLineMessageTable          = setLineMessageTable;
window.setLineMessageRareRate       = setLineMessageRareRate;
window.resetLineMessageTableToDefault = resetLineMessageTableToDefault;
window.judgeLineMessageCategory     = judgeLineMessageCategory;
window.pickLineMessage              = pickLineMessage;
// UI ハンドラ
window.renderLineMessageSummary     = renderLineMessageSummary;
window.onLineMsgRareRateChange      = onLineMsgRareRateChange;
window.resetLineMessagesToDefault   = resetLineMessagesToDefault;
// CSV
window.exportLineMessagesCSV        = exportLineMessagesCSV;
window.onLineMsgCSVFileSelected     = onLineMsgCSVFileSelected;
