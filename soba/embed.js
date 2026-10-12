/* ========================================
   soba/embed.js ─ 車両詳細の［相場］タブ（相場ビューを在庫車の条件で開く）  v3.10.0（2026-10-12）
   ----------------------------------------
   🗣 2026-10-12 ゆうた「車両詳細カードに相場タブを追加し、直近で入っている相場ビューの情報を基に在庫車両の情報で引いた情報を表示」
   ◎ soba/index.html?car=<車のID> の時だけ、soba-data.js が view.js の後に読む
     ・左の一覧と上の検索は出さない（body.emb）。中身は相場ビュー（view.js）そのもの＝金額・グラフ・絞り込みも同じ
     ・車の情報は親（CarFlow）の CarSoba.car(id) から（URL に車の中身を載せない）
     ・当て方は stock.js（SobaStock.match）。グレード・色・走行を絞り込みにはめて開く
     ・上に1枚＝「この車 → 当てた相場カードと条件」「本体価格と小売相場の差」。条件を触ったら「この車の条件に戻す」
   ◎ 当てた車種を人が選び直した時は、このブラウザに覚える（localStorage cf_soba_pick_<車のID>）
   🔴 view.js は相場ビューアの写しなので手を入れない。ここから M・S・draw・calc（view.js の外に見える名前）を使う
   ======================================== */
(function () {
  'use strict';
  const P = (function () { try { return window.parent; } catch (e) { return null; } })();
  const ID = new URLSearchParams(location.search).get('car');
  const LSK = 'cf_soba_pick_' + ID;
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const man = v => v == null || isNaN(v) ? '—' : (v / 10).toFixed(1) + '万';           // 千円 → 万
  const manY = v => v == null || isNaN(v) ? '—' : (v / 10000).toFixed(1) + '万';       // 円 → 万
  const sg = v => (v >= 0 ? '+' : '−') + (Math.abs(v) / 10).toFixed(1) + '万';

  let CAR = null, HIT = null, BASE = null, LASTR = null;

  function carInfo() {
    try { return P && P.CarSoba && P.CarSoba.car(ID); } catch (e) { return null; }
  }

  /* この車の条件（当てた時の物）。S をこれにして描く */
  function baseS(m) {
    const f = { g: m.g == null ? null : m.g };
    if (m.col) f.col = m.col;
    const s = { ys: [m.y], f };
    // 走行は「ぴったり」に入れる（view.js の #skn に入れた時と同じ＝kmx と帯 kb）
    if (m.km != null) { s.kmMode = 'x'; s.kmx = m.km; f.kb = SobaCalc.cxKb(m.km); }
    return s;
  }
  const sameAsBase = () => {
    if (!BASE || typeof S === 'undefined') return true;
    const f = S.f || {}, b = BASE.f;
    if ((S.ys || []).join() !== BASE.ys.join()) return false;
    if ((S.kmx == null ? null : S.kmx) !== (BASE.kmx == null ? null : BASE.kmx)) return false;
    if ((S.kmMode || 'b') !== (BASE.kmMode || 'b')) return false;
    for (const k of ['g', 'col', 'm', 'sb', 'kb', 'e', 'i', 'ph']) {
      const a = f[k] == null ? null : f[k], c = b[k] == null ? null : b[k];
      if (a !== c) return false;
    }
    return S.ph == null;
  };

  function pickSelect(m) {
    const idx = window.SOBA_INDEX || [];
    const mk = CAR && CAR.maker ? SobaStock.bone(CAR.maker) : '';
    const near = (m.cands || []).map(c => c.key);
    const same = idx.filter(e => !near.includes(e.key) && (!mk || SobaStock.bone(e.maker) === mk));
    const others = mk ? idx.filter(e => !near.includes(e.key) && SobaStock.bone(e.maker) !== mk) : [];
    const opt = e => `<option value="${esc(e.key)}"${e.key === m.key ? ' selected' : ''}>${esc(e.car)}</option>`;
    const sortN = L => L.slice().sort((a, b) => String(a.car).localeCompare(String(b.car), 'ja'));
    const groups = {};
    others.forEach(e => (groups[e.maker] = groups[e.maker] || []).push(e));
    return `<select id="emb-pick" title="相場カードを選び直す（このブラウザに覚えます）">`
      + (m.ok ? '' : '<option value="">車種を選ぶ…</option>')
      + (near.length ? `<optgroup label="名前が合う車種">${near.map(k => idx.find(e => e.key === k)).filter(Boolean).map(opt).join('')}</optgroup>` : '')
      + (same.length ? `<optgroup label="${esc(CAR.maker || 'ほかの車種')}">${sortN(same).map(opt).join('')}</optgroup>` : '')
      + Object.keys(groups).map(g => `<optgroup label="${esc(g)}">${sortN(groups[g]).map(opt).join('')}</optgroup>`).join('')
      + `</select>` + (ls(LSK) ? ` <button type="button" class="emb-lnk" id="emb-auto">自動に戻す</button>` : '');
  }

  function carLine() {
    const c = CAR || {};
    const p = [[c.maker, c.model, c.grade].filter(Boolean).join(' '), c.year ? c.year + '年' : '年式なし',
      Number(c.km) > 0 ? (Number(c.km) / 10000).toFixed(1) + '万km' : '走行なし', c.color || '色なし'];
    return (c.num ? `<b>${esc(c.num)}</b> ` : '') + esc(p.join('・'));
  }

  function gradeNote(m) {
    if (m.g == null) return CAR.grade || m.hint ? `<span class="emb-w" data-tip="「${esc(CAR.grade || m.hint)}」に合うグレードが相場DBに無いので、グレードを絞らずに出しています。下の「グレード」で選べます">グレード指定なし</span>` : 'グレード指定なし';
    return esc(m.g) + (m.how === 'near' ? ` <span class="emb-w" data-tip="「${esc(CAR.grade || m.hint)}」と同じ名前が無いので、近い名前のグレードで出しています">近い名前</span>` : '');
  }

  /* 本体価格と小売相場（どちらも税込）の差 */
  function priceBox(R) {
    const b = CAR.bodyIncl, t = CAR.totalIncl;
    if (!R || R.rt == null) return '';
    const rt = R.rt * 1000;   // 千円 → 円
    if (!b) return `<div class="emb-px"><div><span class="k">小売相場（税込）</span><b>${man(R.rt)}</b></div><div class="muted">この車の本体価格が入っていないので、比べられません</div></div>`;
    const d = b - rt, r = d / rt * 100;
    const cls = r >= 10 ? 'ng' : r >= 3 ? 'mid' : r <= -10 ? 'ok2' : 'ok';
    const say = r >= 10 ? '相場より高い' : r >= 3 ? '相場よりやや高い' : r <= -10 ? '相場よりかなり安い' : r <= -3 ? '相場よりやや安い' : '相場どおり';
    return `<div class="emb-px">`
      + `<div><span class="k">この車の本体（税込）</span><b>${manY(b)}</b>${t ? `<small>総額 ${manY(t)}</small>` : ''}</div>`
      + `<div><span class="k">小売相場（税込）</span><b style="color:var(--rt)">${man(R.rt)}</b></div>`
      + `<div><span class="k">相場との差</span><b class="emb-${cls}">${sg(d / 1000)}（${(r >= 0 ? '+' : '−') + Math.abs(r).toFixed(1)}%）</b><small class="emb-${cls}">${say}</small></div>`
      + `</div>`;
  }

  function strip() {
    const m = HIT;
    if (!m) return '';
    if (!m.ok) {
      return `<div class="emb-card"><div class="emb-row"><span class="emb-lb">この車</span>${carLine()}</div>`
        + `<div class="emb-row emb-miss">⚠ ${esc(m.why || '相場が引けませんでした')}</div>`
        + `<div class="emb-row"><span class="emb-lb">相場カード</span>${pickSelect(m)}</div>`
        + `<div class="emb-hint">CarFlow の車には型式が無いので、メーカー・車種・グレード・年式の名前で相場DBの車種を探しています。名前が違う時は上で選ぶと、このブラウザに覚えます。</div></div>`;
    }
    const cond = [m.y + '年式', gradeNote(m), m.col ? esc(m.col) : (CAR.color ? `<span class="emb-w" data-tip="「${esc(CAR.color)}」は相場DBの色の区分に無いので、色を絞らずに出しています">色指定なし</span>` : '色指定なし'),
      m.km != null ? (m.km / 10).toFixed(1) + '万km' : '走行指定なし'];
    const moved = !sameAsBase();
    return `<div class="emb-card">`
      + `<div class="emb-row"><span class="emb-lb">この車</span>${carLine()}</div>`
      + `<div class="emb-row"><span class="emb-lb">相場カード</span>${pickSelect(m)}<span class="emb-cond">${cond.join('・')}</span></div>`
      + (moved ? `<div class="emb-row emb-moved">条件を変えて見ています（下の金額はこの車の条件ではありません）<button type="button" class="emb-btn" id="emb-back">この車の条件に戻す</button></div>` : '')
      + (moved ? '' : priceBox(LASTR))
      + `</div>`;
  }

  function paint() {
    const main = document.getElementById('main'); if (!main) return;
    const old = document.getElementById('emb-top'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'emb-top'; d.innerHTML = strip();
    main.insertBefore(d, main.firstChild);
    const st = document.getElementById('stamp'), r1 = d.querySelector('.emb-row');   // 相場データの日付（上の帯は隠しているので、ここに小さく）
    if (st && st.textContent && r1) r1.insertAdjacentHTML('beforeend', `<span class="emb-stamp">相場 ${esc(st.textContent)}</span>`);
    const sel = document.getElementById('emb-pick');
    if (sel) sel.onchange = () => { if (!sel.value) return; ls(LSK, sel.value); start(); };
    const au = document.getElementById('emb-auto'); if (au) au.onclick = () => { ls(LSK, null); start(); };
    const bk = document.getElementById('emb-back'); if (bk) bk.onclick = () => { S = JSON.parse(JSON.stringify(BASE)); draw(); };
  }

  // view.js の calc と draw にかぶせる（calc＝最後の金額を控える／draw＝描いた後に上の1枚を差し込む）
  const _calc = calc, _draw = draw;
  calc = function () { const R = _calc.apply(this, arguments); LASTR = R; return R; };
  draw = function () { const r = _draw.apply(this, arguments); try { paint(); } catch (e) { console.error('[soba embed]', e); } return r; };

  async function start() {
    CAR = carInfo();
    const main = document.getElementById('main');
    if (!CAR) { main.innerHTML = '<div class="sbmsg">車の情報を読めませんでした（車両詳細を開き直してください）</div>'; return; }
    main.innerHTML = '<div class="sbmsg">この車の相場を探しています…</div>';
    try {
      HIT = await SobaStock.match(CAR, window.SOBA_INDEX || [], SobaData.card, { key: ls(LSK) || null });
    } catch (e) { SobaData.fail(e); return; }
    if (!HIT.ok) { M = null; main.innerHTML = ''; paint(); return; }
    M = HIT.card; BASE = baseS(HIT); S = JSON.parse(JSON.stringify(BASE)); CMPS = [];
    try { list(); } catch (e) {}
    draw();
    main.scrollTop = 0;
  }

  document.body.classList.add('emb');
  window.SobaEmbed = { start, hit: () => HIT, last: () => LASTR };
  start();
})();
