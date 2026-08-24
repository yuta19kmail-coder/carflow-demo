// ========================================
// autocomplete.js
// 過去データ補完（メーカー/車種/グレード/車体色）
// - 既存の <input> をラッパで包んで、入力欄の上にドロップダウンを出す
// - データソースは window.cars + window.archivedCars（state.js のグローバル）
// - ひらがな→カタカナ自動マッチ（「ぷ」→「プリウス」）
// - 頻出順：使用回数の多い候補を【入力欄に近い側＝下】に配置
// - カスケード：メーカー → 車種、車種 → グレード で絞り込み
// - IME予測と衝突しないように上下キー操作は無効。確定は Tab か クリック、閉じるは Esc。
// ========================================
(function () {
  // ---------- 文字列ユーティリティ ----------
  // ひらがな → カタカナ
  function h2k(s) {
    return String(s || '').replace(/[ぁ-ゖ]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) + 0x60)
    );
  }
  // 比較用に正規化（trim + 小文字 + ひらがな→カタカナ）
  function fold(s) {
    return h2k(String(s || '').trim().toLowerCase());
  }

  // ---------- 辞書ビルダ ----------
  // 全車両（在庫＋アーカイブ）から、対象フィールドの {value: count} 辞書を作る
  function _all() {
    // state.js で `let cars = []` 宣言されているのでベア識別子で参照（window.cars はぶら下がらない）
    const a = (typeof cars !== 'undefined' && Array.isArray(cars)) ? cars : [];
    const b = (typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) ? archivedCars : [];
    return a.concat(b);
  }
  function _count(map, key) {
    if (key === undefined || key === null) return;
    const v = String(key).trim();
    if (!v) return;
    map[v] = (map[v] || 0) + 1;
  }

  function makerDict() {
    const m = {};
    _all().forEach(c => _count(m, c && c.maker));
    return m;
  }
  function modelDict(maker) {
    const m = {};
    const mf = fold(maker);
    _all().forEach(c => {
      if (!c) return;
      if (mf && fold(c.maker) !== mf) return;  // メーカー一致で絞り込み
      _count(m, c.model);
    });
    return m;
  }
  function gradeDict(maker, model) {
    const m = {};
    const mf = fold(maker);
    const mdf = fold(model);
    _all().forEach(c => {
      if (!c) return;
      if (mf && fold(c.maker) !== mf) return;
      if (mdf && fold(c.model) !== mdf) return;
      _count(m, c.grade);
    });
    return m;
  }
  function colorDict() {
    const m = {};
    _all().forEach(c => _count(m, c && c.color));
    return m;
  }

  // ---------- 入力欄ラッピング ----------
  // 既存の <input> を <div class="cf-ac-iw"> で包んで、その中に dropdown 用 div を入れる
  function _wrap(inp) {
    if (!inp) return null;
    let w = inp.parentElement;
    if (w && w.classList.contains('cf-ac-iw')) return w;
    w = document.createElement('div');
    w.className = 'cf-ac-iw';
    inp.parentNode.insertBefore(w, inp);
    const dd = document.createElement('div');
    dd.className = 'cf-ac-dd';
    w.appendChild(dd);
    w.appendChild(inp);
    return w;
  }

  // ---------- 単一入力欄に補完を取り付ける ----------
  // options.getDict() : () => {value: count}
  // options.onPick(value) : 任意。確定時に呼ばれる
  function setupAutocomplete(inputEl, options) {
    if (!inputEl || !options || typeof options.getDict !== 'function') return;
    const wrap = _wrap(inputEl);
    if (!wrap) return;
    const dd = wrap.querySelector('.cf-ac-dd');
    if (!dd) return;
    let cur = -1;
    let items = [];

    function render() {
      const q = inputEl.value;
      const qf = fold(q);
      const dict = options.getDict() || {};
      if (!q) { dd.classList.remove('show'); dd.innerHTML = ''; return; }
      // 前方一致でフィルタ
      let entries = Object.entries(dict).filter(([n]) => fold(n).indexOf(qf) === 0);
      // 件数昇順にソート → 最後（最頻）が下に来る
      entries.sort((a, b) => a[1] - b[1]);
      // 上限8件（あふれる場合は下位＝多い方を残す）
      entries = entries.slice(-8);
      items = entries.map(e => e[0]);
      if (items.length === 0) { dd.classList.remove('show'); dd.innerHTML = ''; return; }
      cur = items.length - 1;  // デフォルトは一番下（最頻）
      let html = '';
      items.forEach((n, i) => {
        let disp = n;
        if (qf.length > 0) {
          const folded = fold(n);
          const idx = folded.indexOf(qf);
          if (idx >= 0) {
            disp =
              _esc(n.slice(0, idx)) +
              '<span class="hl">' + _esc(n.slice(idx, idx + qf.length)) + '</span>' +
              _esc(n.slice(idx + qf.length));
          } else {
            disp = _esc(n);
          }
        } else {
          disp = _esc(n);
        }
        html += '<div class="cf-ac-item' + (i === cur ? ' act' : '') + '" data-i="' + i + '">' + disp + '</div>';
      });
      dd.innerHTML = html;
      dd.classList.add('show');
      dd.querySelectorAll('.cf-ac-item').forEach(el => {
        el.addEventListener('mouseenter', () => {
          cur = +el.dataset.i;
          dd.querySelectorAll('.cf-ac-item').forEach((e, i) => e.classList.toggle('act', i === cur));
        });
        el.addEventListener('mousedown', e => {
          e.preventDefault();
          _pick(+el.dataset.i);
        });
      });
    }

    function _pick(i) {
      if (i < 0 || i >= items.length) return;
      inputEl.value = items[i];
      dd.classList.remove('show'); dd.innerHTML = '';
      try { inputEl.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
      if (typeof options.onPick === 'function') options.onPick(items[i]);
    }

    inputEl.addEventListener('input', render);
    inputEl.addEventListener('focus', render);
    inputEl.addEventListener('blur', () => setTimeout(() => { dd.classList.remove('show'); }, 150));
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Escape') { dd.classList.remove('show'); return; }
      if (!dd.classList.contains('show')) return;
      if (e.key === 'Tab' && cur >= 0) {
        e.preventDefault();
        _pick(cur);
      }
    });
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------- CarFlow 用：4フィールドに一括取り付け ----------
  function attachAll() {
    const maker = document.getElementById('inp-maker');
    const model = document.getElementById('inp-model');
    const grade = document.getElementById('inp-grade');
    const color = document.getElementById('inp-color');
    if (maker) setupAutocomplete(maker, { getDict: makerDict });
    if (model) setupAutocomplete(model, {
      getDict: () => modelDict(maker ? maker.value : '')
    });
    if (grade) setupAutocomplete(grade, {
      getDict: () => gradeDict(maker ? maker.value : '', model ? model.value : '')
    });
    if (color) setupAutocomplete(color, { getDict: colorDict });
  }

  // ---------- 起動 ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachAll);
  } else {
    attachAll();
  }

  // 外部公開（必要なら他箇所から呼べるように）
  window.CarFlowAC = {
    setup: setupAutocomplete,
    makerDict: makerDict,
    modelDict: modelDict,
    gradeDict: gradeDict,
    colorDict: colorDict
  };
})();
