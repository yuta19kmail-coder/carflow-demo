/* ========================================
   soba/stock.js ─ 在庫車 → 相場カード（車種・年式・グレード・走行・色）の当て方  v3.10.0（2026-10-12）
   ----------------------------------------
   🗣 2026-10-12 ゆうた「車両詳細カードに相場タブを追加し、直近で入っている相場ビューの情報を基に在庫車両の情報で引いた情報を表示」
   ◎ CarFlow の車には型式が無い（メーカー・車種・グレード・年式・走行・色だけ。しかも手で書いた名前＝「VOXY ZS煌Ⅱ」「MINIR56」「ﾉｰﾄ」など）
     ＝ 名前の「骨」（全角半角・ヴ/ボ・小さいカナ・伸ばし棒・記号をそろえた物）で、相場カードの車名の頭と突き合わせる
   ◎ 当て方
     ① 車種＋グレードをつないだ骨の頭に、カードの車名の頭（「タントカスタム」「N-BOXカスタム」「フリードハイブリッド」…）が
        一番長く合うカード（＝タントカスタムをタントに、N-BOX カスタムターボを N-BOX カスタムに）。MINI は型式（F56・R56…）で
     ② その中で年式が入っているカード。世代の境目の年式（アクア 2021 など）で2つ残ったら、グレードが当たる方 → 台数の多い方
     ③ グレード＝①で使った残り（グレードの欄が空なら車種の欄の残り）で、名前が同じ → 頭が同じ（ZS煌Ⅱ → ZS）→ 頭が入っている（2.0GT-S → 2.0GT-Sアイサイト）
        当たらなければ「グレード指定なし」
     ④ 色＝相場DB の11区分に読みかえ（カードに無い区分なら指定なし）。走行＝千km（0 は未入力として指定なし）
   🔴 計算はしない（soba-calc.js の仕事）。ここは「どのカードの、どの条件で開くか」を決めるだけ。node でも動く（test_soba_stock.mjs）
   ======================================== */
(function (G) {
  'use strict';

  /* 名前の骨：全角→半角・大文字・ひらがな→カタカナ・ヴ行→バ行・小さいカナと「イ」と伸ばし棒と記号を外す
     （エブリィ＝エブリイ、バンディット＝バンデット、レヴォーグ＝レボーグ を同じにするため） */
  function bone(s) {
    s = String(s == null ? '' : s).normalize('NFKC').toUpperCase()
      .replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60))
      .replace(/ヴァ/g, 'バ').replace(/ヴィ/g, 'ビ').replace(/ヴェ/g, 'ベ').replace(/ヴォ/g, 'ボ').replace(/ヴ/g, 'ブ')
      .replace(/煌/g, 'キラメキ');
    return s.replace(/[ァィゥェォャュョッヮイー\s・･\-－‐−―_／/()（）［］\[\]「」.,、。+＋]/g, '');
  }
  /* 英字の車名（手で英字で書かれやすい物）→ カードの車名 */
  const ALIAS = [[/^VOXY/, 'ヴォクシー'], [/^NOAH/, 'ノア'], [/^ALPHARD/, 'アルファード'], [/^VELLFIRE/, 'ヴェルファイア'],
    [/^PRIUS/, 'プリウス'], [/^AQUA/, 'アクア'], [/^SIENTA/, 'シエンタ'], [/^ESQUIRE/, 'エスクァイア'], [/^HIACE/, 'ハイエース'],
    [/^FIT/, 'フィット'], [/^エスクァイヤ/, 'エスクァイア'], [/^ステップW(?!ゴン|ァゴン|AGON)/, 'ステップワゴン'],
    [/^\d{2,3}(?=[ァ-ヴ])/, '']];   // 「50プリウス」＝世代は年式で決まる
  function alias(s) {
    let t = String(s || '').normalize('NFKC').toUpperCase().trim()
      .replace(/([ァ-ヴ])二/g, '$1ニ').replace(/([ァ-ヴ])一/g, '$1ー');   // 「ジム二ー」（漢字の二）
    ALIAS.forEach(([re, to]) => { t = t.replace(re, to); });
    return t;
  }
  /* 車名の後ろにくっついていてよいカナ（「フリードスパイクハイブリッド」「ハスラー新車」）。これ以外のカナが空白なしで続いたら別の車
     （「ミラトコット」を「ミラ」にしない） */
  const GLUE_OK = ['ハブリド', 'カスタム', 'タボ', 'プラス', 'ワゴン', 'バン', 'ニスモ'];
  const head = e => String(e.car || '').normalize('NFKC').split(/\s+/)[0];   // 「タントカスタム 4代目 LA650S」→「タントカスタム」
  function miniCode(s) { const m = String(s || '').normalize('NFKC').toUpperCase().match(/([FRJU])\s?(\d{2})/); return m ? m[1] + m[2] : null; }

  /* 色 → 相場DB の11区分（パール白／白／黒／銀／グレー／青系／赤・橙／茶・金／緑／ツートン／その他） */
  function colorCat(c) {
    const s = String(c || '').normalize('NFKC').toUpperCase();
    if (!s.trim()) return null;
    if (/ツートン|2トーン|ツートーン|2TONE/.test(s)) return 'ツートン';
    if (/パール/.test(s) && /白|ホワイト|WHITE/.test(s)) return 'パール白';
    if (/^パール$/.test(s.trim())) return 'パール白';
    if (/白|ホワイト|シロ|WHITE/.test(s)) return '白';
    if (/黒|ブラック|クロ|BLACK/.test(s)) return '黒';
    if (/銀|シルバー|SILVER/.test(s)) return '銀';
    if (/グレー|グレイ|灰|ガンメタ|GRAY|GREY/.test(s)) return 'グレー';
    if (/青|ブルー|水色|紺|ネイビー|アオ|BLUE/.test(s)) return '青系';
    if (/赤|レッド|アカ|オレンジ|橙|ワイン|ピンク|RED|ORANGE/.test(s)) return '赤・橙';
    if (/茶|ブラウン|ベージュ|金|ゴールド|ブロンズ|BROWN|BEIGE|GOLD/.test(s)) return '茶・金';
    if (/緑|グリーン|カーキ|GREEN/.test(s)) return '緑';
    return 'その他';
  }

  /* 年式：数字4桁（2019）・和暦（R1・H30・令和元）を西暦に */
  function yearOf(y) {
    const s = String(y == null ? '' : y).normalize('NFKC').trim();
    let m = s.match(/(19|20)\d{2}/); if (m) return m[0];
    m = s.match(/^(令和|R)\s*(元|\d{1,2})/i); if (m) return String(2018 + (m[2] === '元' ? 1 : +m[2]));
    m = s.match(/^(平成|H)\s*(元|\d{1,2})/i); if (m) return String(1988 + (m[2] === '元' ? 1 : +m[2]));
    return null;
  }

  /* グレード：L＝[[名前, 台数], …]。hint＝骨にする前の文字 */
  function gradeOf(L, hint) {
    const h = bone(hint);
    if (!h) return { g: null, how: 'none' };
    const list = (L || []).filter(x => x[0] && !/^（/.test(x[0])).map(x => ({ g: x[0], n: x[1] || 0, b: bone(x[0]) })).filter(x => x.b);
    const ex = list.find(x => x.b === h); if (ex) return { g: ex.g, how: 'exact' };
    // 頭が同じ（「ZSキラメキ2」→「ZS」）：グレードの骨が hint の頭。一番長い物
    const pre = list.filter(x => h.startsWith(x.b)).sort((a, b) => b.b.length - a.b.length || b.n - a.n)[0];
    // 頭が入っている（「2.0GT-S」→「2.0GT-Sアイサイト」）：hint がグレードの頭。一番多い物
    const sub = h.length >= 2 ? list.filter(x => x.b.startsWith(h)).sort((a, b) => b.n - a.n)[0] : null;
    if (pre && (!sub || pre.b.length >= 2)) return { g: pre.g, how: 'near' };
    if (sub) return { g: sub.g, how: 'near' };
    return { g: null, how: 'miss' };
  }

  /* 車種の候補（年式で絞る前）。idx＝index.json（SOBA_INDEX でも可：years が配列でも {年式:1} でも良い） */
  function candidates(car, idx) {
    const mk = String(car.maker || '').trim();
    const model = alias(car.model), grade = String(car.grade || '');
    const all = (idx || []).filter(e => e && e.key && e.car);
    const sameMk = mk ? all.filter(e => bone(e.maker) === bone(mk)) : all;
    const pool = sameMk.length ? sameMk : all;
    // MINI：型式（F56 など）で
    const isMini = /MINI|ミニ/i.test(mk) || /^(MINI|ミニ)/i.test(model) || /^[FRJU]\d{2}/.test(model.normalize('NFKC'));
    if (isMini) {
      const code = miniCode(model) || miniCode(grade);
      if (code) {
        const jcw = /JCW|ジョンクーパー/i.test(model + ' ' + grade);
        // v3.15.1 「（J01・電気）」のように型式の後ろに「・」が付くカードもある（第16回〜 mini_j01）
        const reC = new RegExp('[（(/]' + code + '[）)/・]');
        let L = pool.filter(e => reC.test(String(e.car).normalize('NFKC')));
        if (!L.length) L = all.filter(e => reC.test(String(e.car).normalize('NFKC')));
        const pickJ = L.filter(e => /JCW/.test(e.car) === jcw);
        L = pickJ.length ? pickJ : L;
        const rest = String(model + ' ' + grade).normalize('NFKC').replace(/MINI|ミニ/ig, '').replace(new RegExp(code.replace(/(\D)(\d+)/, '$1\\s?$2'), 'i'), '').replace(/JCW/i, '');
        return { list: L, hint: grade.trim() ? grade.replace(/JCW/i, '') : rest, how: 'mini' };
      }
    }
    const full = bone(model + grade), mb = bone(model), spaced = /\s/.test(model);
    let best = 0, L = [];
    pool.forEach(e => {
      const hs = [bone(head(e)), bone(e.family)].filter(Boolean);
      hs.forEach(hb => {
        if (!hb || !(full.startsWith(hb))) return;
        if (!spaced && mb.length > hb.length) {
          const rest = mb.slice(hb.length);
          if (/^[ァ-ヶ]/.test(rest) && !GLUE_OK.some(w => rest.startsWith(w))) return;
        }
        if (hb.length > best) { best = hb.length; L = [e]; }
        else if (hb.length === best && !L.includes(e)) L.push(e);
      });
    });
    if (!L.length) return { list: [], hint: '', how: 'none' };
    // グレードの手がかり＝つないだ骨から車名の頭を外した残り（グレード欄が空でも車種の欄の残りが使える）
    // 骨では元の文字に戻せないので、グレード欄がある時はグレード欄＋車種の欄の残り、無ければ車種の欄の残り
    const extra = mb.length > best ? mb.slice(best) : '';
    const gb = bone(grade);
    // 「VOXY ZS」＋「ZS」を ZSZS に、「シエンタハイブリッド」＋「ハイブリッドG」をハイブリッドハイブリッドG にしない
    const hint = best > mb.length ? full.slice(best) : (gb && extra.includes(gb) ? extra : gb && extra && gb.startsWith(extra) ? gb : extra + gb);
    return { list: L, hint, how: 'name' };
  }

  const yrs = e => Array.isArray(e.years) ? e.years.map(String) : Object.keys(e.years || {});

  /* 本体。loadCard(key) → Promise<card>。返り値：
     { ok, key, car(表示名), y, g, how(グレードの当て方), col, km, cands(同じ名前の候補・年式違いも), why(当たらなかった理由) } */
  async function match(car, idx, loadCard, opt) {
    opt = opt || {};
    const y = yearOf(car.year);
    const C = candidates(car, idx);
    const out = { ok: false, y, cands: C.list.map(e => ({ key: e.key, car: e.car, years: yrs(e) })), hint: C.hint };
    const km = Number(car.km) > 0 ? Math.round(Number(car.km) / 1000) : null;
    out.km = km;
    if (opt.key) {   // 人が選んだカード
      const e = (idx || []).find(x => x.key === opt.key);
      if (e) { C.list = [e]; if (!out.cands.some(x => x.key === e.key)) out.cands.unshift({ key: e.key, car: e.car, years: yrs(e) }); }
    }
    if (!C.list.length) { out.why = '車種が相場DBに見つかりません'; return out; }
    if (!y) { out.why = '年式が入っていません'; return out; }
    const inY = C.list.filter(e => yrs(e).includes(y));
    if (!inY.length) { out.why = y + '年式の相場がありません（' + C.list.map(e => e.car).join('／') + '）'; return out; }
    // 年式の入っているカードを読む（世代の境目で2つ以上なら、グレードが当たる方 → 台数の多い方）
    const cards = [];
    for (const e of inY.slice(0, 4)) { try { const c = await loadCard(e.key); if (c && c.years && c.years[y]) cards.push(c); } catch (err) {} }
    // v3.13.0 希少車（rare＝式が無い・幅の目安だけ）は在庫車の自動の値付けに使わない
    if (!cards.length) { out.why = inY.some(e => e.rare) ? '希少車（目安）のため自動では出しません。相場ビューで幅を見てください' : '相場カードを読めませんでした'; return out; }
    const scored = cards.map(c => {
      const Y = c.years[y], gr = gradeOf(Y.grades, C.hint);
      const n = (Y.grades || []).reduce((a, x) => a + (x[1] || 0), 0);
      return { c, gr, n, s: (gr.how === 'exact' ? 2 : gr.how === 'near' ? 1 : 0) };
    }).sort((a, b) => b.s - a.s || b.n - a.n);
    const B = scored[0], M = B.c, Y = M.years[y];
    const cat = colorCat(car.color), cs = ((M.fit && M.fit.sold && M.fit.sold.cs) || []).concat((Y.colors || []).map(x => x[0]));
    Object.assign(out, { ok: true, key: M.key, car: M.car, card: M, g: B.gr.g, how: B.gr.how, col: cat && cs.includes(cat) ? cat : null, colRaw: car.color || '', colCat: cat });
    return out;
  }

  G.SobaStock = { match, bone, colorCat, yearOf, gradeOf, candidates };
})(typeof window !== 'undefined' ? window : globalThis);
