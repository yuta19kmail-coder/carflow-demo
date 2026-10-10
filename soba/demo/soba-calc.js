/* 相場DBの計算（1か所だけ）
 * 相場カード（出力\cards\<キー>.json）から、条件をそろえた「いまの金額」「仕入れ上限」「4か月後の収益」「お客様からの買取」を出す。
 * 使う所：相場ビューア（いまは相場DBのフォルダ）／将来 CarFlow の相場画面・見積もり画面。
 * 🔴 計算はここだけに書く。画面ごとに写して直すと金額がずれる。
 * 🔴 build.py の row()／pred() と並びをそろえる。片方を変えたら両方直す。
 *
 * 単位：千円。税の扱い：小売（DataLine 小売相場）＝税込／AA（DataLine・ASNET）＝税抜。
 *       仕入れ上限・4か月後の収益は税抜でそろえる（小売は ÷1.1）。
 *       お客様（個人）からの買取＝税抜の上限 ×1.1（払った額の10/110を仕入税額控除できる前提・本則課税）。
 */
(function (G) {
  const CFG = {
    TAX: 1.1,          // 消費税
    AA_FEE: 10,        // AAの落札経費 1万（CAA東京・自走）
    AA_SELL: 20,       // AAに出す経費（出品料・成約料・陸送）仮2万
    BUY_AA_PROF: 50,   // お客様から買ってすぐAAに出す時の目標の利益 仮5万（税抜）
    PROF: { kei: 80, normal: 100 },   // 車体の目標粗利（税抜）
    MONTHS: 4,         // 在庫期間（この先の値はここで見る）
    CONF_K: 0.75,      // 精度の予想の倍率（機械学習を入れた後の 9/29 CAA東京 253台で 0.72。1回分なので控えめに 0.75）
    CONF_K_RT: 0.97,   // 小売の倍率（2026-10-06 小売のバックテスト 3.5万台で合わせた。build.py の CONF_K_RT と同じ）
    CONF_G_OUT: 1.0,   // グレードが式に無い時の倍率（以前 1.8。2026-10-06 ASNET・小売で広すぎた → 1.0。build.py と同じ）
    CONF_GRADES: [['A', 5], ['B', 8], ['C', 11], ['D', 15], ['E', 20]],   // 外れの目安（%）の上限。超えたら F
    CONF_UN: 1.0,
    TREND_HI: 0.0, TREND_LO: -0.005,   // 先の月の動きの上限・下限（月あたり・log）。build.py の TREND_HI・TREND_LO と同じ（2026-10-07）
    /* 会場の癖（2026-10-07）：c.venue を渡した時だけ、AA の値（aa・aa1・aa4）に掛ける。[AA の値（千円・税抜）, log(相場DB÷落札) の真ん中] の点を
     * 値段の log で直線に結び（端は平ら）、exp(−値) を掛ける。CAA東京は安い車ほど全国より高く落ちる（30万未満で約4%）・高い車は少し安く落ちる。
     * 作り方：ASNET 答え合わせ（9/7〜10/3 の CAA東京 4,972台）＋10/6 CAA東京 1,204台の外れを値段の帯ごとに（台数/(台数+30) で控えめに）。
     * 確かめ：前の週までで作った表で次の週を当てる（4回）8.88%→8.68%、10/6 本番の値付け 1,256台 8.11%→7.86%（偏り −0.9%→−0.1%）。build.py の VENUE_ADJ と同じ */
    VENUE_ADJ: { 'CAA東京': [[152, -0.0358], [246, -0.0413], [382, -0.0165], [626, -0.0023], [1071, 0.0069], [2235, 0.013]] },
    CONF_THIN: [['nyg', '年式×グレード', 10, 1.0]],   // 年式×色・年式×型式は少なくても外れが大きくならなかったので注意は出さない（台数は cards の nyc・nym にある）   // 学習の台数がこれ未満なら外れの目安に掛ける（build.py の CONF_THIN と同じ）      // 未使用車の物差しの精度の倍率（比のばらつき → 外れの目安。build.py の CONF_UN と同じ）
  };
  // 回帰の並び（build.py の row と同じ）
  function row(P, d) {
    const v = [1, d.km / 10, d.t];
    P.ys.slice(1).forEach(y => v.push(d.y === y ? 1 : 0));
    P.gs.slice(1).forEach(g => v.push(d.g === g ? 1 : 0));
    P.cs.slice(1).forEach(c => v.push(d.col === c ? 1 : 0));
    (P.ms || []).slice(1).forEach(m => v.push(d.m === m ? 1 : 0));
    P.es.slice(1).forEach(e => v.push(d.e === e ? 1 : 0));
    v.push(Math.max(0, d.km - 100) / 10);
    (P.ins || []).slice(1).forEach(i => v.push(d.i === i ? 1 : 0));
    (P.sbs || ['']).slice(1).forEach(b => v.push((d.sb || '') === b ? 1 : 0));
    return v;
  }
  // 1台の条件の値（build.py の pred と同じ。近い実績での水準合わせ＝cell を件数に応じて効かせる）
  // 機械学習（判断の木）で log(値) を出す（build.py の gbm_z と同じ）。月（t）は 0 より先へは伸ばさない
  function gbmZ(G, d) {
    // 知らない値（無い・式に無い）は真ん中の番号。詳細（sb）だけは無い＝''（詳細なし）として知っている値（build.py の gbm_z と同じ。2026-10-06）
    const cat = k => { const L = G.c[k]; let x = d[k]; if (x == null && k === 'sb') x = ''; const i = x == null ? -1 : L.indexOf(String(x)); return i >= 0 ? i : (L.length - 1) / 2; };
    const v = G.f.map(k => G.c[k] ? cat(k) : (k === 't' ? Math.min(0, d.t || 0) : (d[k] || 0)));
    let z = G.b0;
    for (const [F, Th, L, R] of G.T) { let i = 0; while (F[i] >= 0) i = v[F[i]] <= Th[i] ? L[i] : R[i]; z += Th[i]; }
    return z;
  }
  /* 装備（小売だけ。2026-10-06）：選んだ物（q）はそのまま、選んでいない物は「その年式×グレードのよくある形」を台数の重みで混ぜる（build.py の eq_fill と同じ）。
   * 一番多い形1つだけで出すとバックテストで今より悪くなったので、混ぜて「装備が分からない時の平均の値」にしている。
   * q＝{q_psd: 2 両側電動スライド/1 片側/0 なし, q_one ワンオーナー, q_aw アルミのインチ, …}（G.eqm.f に入っている物だけ効く）。u＝未使用車の印 */
  function eqFill(G, y, g, q) {
    const E = G && G.eqm; if (!E) return [[{}, 1]];
    const L = E.v[y + '|' + g] || E.v[String(y)] || E.v[''];
    return L.map(([v, n]) => { const o = {}; E.f.forEach((k, j) => { o[k] = q && q[k] != null ? q[k] : v[j]; }); return [o, n]; });
  }
  function eqTop(G, y, g) { const E = G && G.eqm; if (!E) return {}; const L = E.v[y + '|' + g] || E.v[String(y)] || E.v['']; const o = {}; E.f.forEach((k, j) => o[k] = L[0][0][j]); return o; }
  /* 期（2026-10-09 区切りの作り直し）：機械学習に「期」（初度登録の年月で振り分けた前期・後期の番号 php）が入っている車種で、
   * 期が分からない時（出品は年式だけ）は、その年式の期ごとの台数（G.phy）で混ぜる（build.py の php_mix・gbm_zq と同じ） */
  function phpMix(G, y) {
    const T = G.phy; if (!T) return null;
    let L = T[String(y)];
    if (!L) { const ks = Object.keys(T); const k = ks.reduce((a, b) => { const da = Math.abs(+a - y), db = Math.abs(+b - y); return db < da || (db === da && +b > +a) ? b : a; }); L = T[k]; }
    return L;
  }
  function gbmZq(G, d, q) {
    if (G.f.includes('php') && d.php == null) {
      const L = phpMix(G, d.y);
      if (L) { if (L.length === 1) return gbmZq(G, { ...d, php: L[0][0] }, q); let z = 0, w = 0; for (const [p, n] of L) { z += gbmZq(G, { ...d, php: p }, q) * n; w += n; } return z / w; }
    }
    let z = 0, w = 0; const seen = {};
    for (const [e, n] of eqFill(G, d.y, d.g, q)) { const k = JSON.stringify(e); if (!(k in seen)) seen[k] = gbmZ(G, { ...d, ...e }); z += seen[k] * n; w += n; }
    return z / w;
  }
  function pr(P, d) {
    if (!P || !P.ys.includes(d.y)) return null;
    // 機械学習があればそちら（2026-10-05 バックテスト：式 9.6% → 8.7%）。先の月は式の「月あたりの動き」を足す
    const x = Object.assign({}, d);
    if (!P.gs.includes(x.g)) x.g = P.gs[0];
    if (!P.cs.includes(x.col)) x.col = P.cs[0];
    if (P.ms && P.ms.length && !P.ms.includes(x.m)) x.m = P.ms[0];
    if (P.ins && P.ins.length && !P.ins.includes(x.i)) x.i = P.ins[0];
    const kb = x.km < 30 ? 0 : x.km < 50 ? 1 : x.km < 70 ? 2 : x.km < 100 ? 3 : 4, k0 = x.y + '|' + x.g + '|' + x.m;
    const c = (P.cell || {})[k0 + '|' + kb] || (P.cell || {})[k0], adj = c ? c[0] * c[1] / (c[1] + 5) : 0;
    // 機械学習 0.8＋式 0.2（log で混ぜる。2026-10-06 精度の調査）。先の月は式の「月あたりの動き」を足す
    if (P.gbm) {
      const zf = row(P, { ...x, t: Math.min(0, x.t || 0) }).reduce((s, v, i) => s + v * P.b[i], 0) + adj;
      return Math.exp(0.8 * gbmZq(P.gbm, { ...d, sb: d.sb || '', u: d.q && d.q.u ? 1 : 0 }, d.q) + 0.2 * zf + fut(P, d.t));
    }
    return Math.exp(row(P, { ...x, t: Math.min(0, x.t || 0) }).reduce((s, v, i) => s + v * P.b[i], 0) + adj + fut(P, x.t));
  }
  /* 先の月の動き（2026-10-07 ゆうたOK）：式の月の係数 b[2] を [TREND_LO, TREND_HI]（月あたり・log）にしばってから t か月ぶん足す（build.py の slope_m・fut と同じ）。
   * そのまま伸ばすと古い車で小売が4か月 +12〜14% の見込みになり、仕入れ上限を押し上げていた */
  function slopeM(P) { let s = P.b[2]; if (CFG.TREND_HI != null) s = Math.min(s, CFG.TREND_HI); if (CFG.TREND_LO != null) s = Math.max(s, CFG.TREND_LO); return s; }
  /* AAが下げ始めた車（2026-10-10 答え合わせで採用）：build.py が fit.sold に dr（log・−0.01）を書く。4か月後の小売を −1%（t か月先は t/4 ぶん・4か月で頭打ち）。build.py の fut と同じ */
  function fut(P, t) { return t > 0 ? slopeM(P) * t + (P.dr || 0) * Math.min(t, 4) / 4 : 0;
  }
  /* 精度の予想（build.py の conf と同じ）：この条件の1台が、見込みから外れる大きさの目安（真ん中・%）と A〜F。
   * 効くもの（9/29 CAA東京 252台で確認）：同じ年式×グレード×型式の値段のばらつき（一番効く）／評価点（3.5以下は外れやすい）／
   * グレードが式に入っているか／近い実績の件数。出品票の状態（警告灯など）は入っていない＝その分は別に見る */
  function conf(P, d) {
    if (!P || !P.ys.includes(d.y)) return null;
    const K = CFG, g = P.gs.includes(d.g) ? d.g : d.g, k0 = d.y + '|' + g + '|' + d.m;
    const sp = (P.sprd || {})[k0];
    let s = sp ? sp[0] : (P.mad || 0.12) * 1.2;
    const kb = d.km < 30 ? 0 : d.km < 50 ? 1 : d.km < 70 ? 2 : d.km < 100 ? 3 : 4;
    const c = (P.cell || {})[k0 + '|' + kb] || (P.cell || {})[k0], n = c ? c[1] : 0;
    s = Math.sqrt(s * s + s * s / Math.max(n, 1));
    const why = [];
    if (d.e != null && P.es && P.es.length) {
      if (d.e <= 3.5) { s *= 1.4; why.push('評価' + d.e + 'は外れやすい'); } else if (d.e >= 4.5) s *= 0.85;
      if (d.e <= 3.0) s *= 1.25;
    }
    if (!P.gs.includes(d.g)) { s *= K.CONF_G_OUT; why.push('このグレードは件数が少なく式に入っていない'); }
    // 学習データの薄さ（2026-10-06）：選んだ組み合わせの学習台数が少ない時は目安を広げる（build.py の thin と同じ）
    const th = thin(P, d);
    th.forEach(x => { s *= x[3]; why.push(`学習の${x[1]}が${x[2]}台だけ`); });
    if (!sp) why.push('同じ年式・グレード・型式の実績が少ない');
    else why.push(`同じ年式・グレード・型式 ${sp[1]}台のばらつき ±${(sp[0] * 100).toFixed(0)}%`);
    why.push(`近い実績 ${n}台`);
    const pct = Math.round(s * (P.es && P.es.length ? K.CONF_K : K.CONF_K_RT) * 1000) / 10;   // 評価点があるのは AA の式
    const grade = (K.CONF_GRADES.find(x => pct <= x[1]) || ['F'])[0];
    return { pct, grade, n, why, thin: th.map(x => [x[1], x[2]]) };
  }
  function thin(P, d) {
    const o = [];
    for (const [k, nm, th, mul] of CFG.CONF_THIN) {
      if (!P[k]) continue;
      const x = { nyg: d.g, nyc: d.col, nym: d.m }[k];
      if (x == null) continue;
      const n = P[k][d.y + '|' + x] || 0;
      if (n < th) o.push([k, nm, n, mul]);
    }
    return o;
  }
  // 詳細を「全体」（'__ALL__'）にした時：そのグレードの詳細ごとの値を、台数で重みをつけて平均する
  function prX(P, d, Y) {
    if (d.sb === '' && Y) {   // 2026-10-07 棚卸し：「メイングレードのみ」でも、詳細なしの行が1台も無いグレード（シビック タイプR＝全部「ユーロ」）は一番多い詳細で出す（式の外の当て推量で 8.4万と出ていた）
      const L0 = (Y.subs || {})[d.g] || [], t0 = (Y.grades.find(x => x[0] === d.g) || [0, 0])[1];
      if (L0.length && t0 > 0 && t0 - L0.reduce((a, b) => a + b[1], 0) <= 0) return pr(P, { ...d, sb: L0[0][0] });
    }
    if (d.sb !== '__ALL__') return pr(P, d);
    const L = (Y.subs || {})[d.g] || [], tot = (Y.grades.find(x => x[0] === d.g) || [0, 0])[1], sumS = L.reduce((a, b) => a + b[1], 0);
    // 2026-10-07 棚卸し：詳細なしの行が1台も無いグレード（キャスト G SAIII＝全部「スタイル／アクティバ」等）に、無い「詳細なし」を1台ぶん混ぜていた → 0台なら混ぜない
    const parts = tot - sumS > 0 || !L.length ? [['', Math.max(tot - sumS, 1)], ...L] : [...L];
    let w = 0, z = 0;
    for (const [sb, n] of parts) { const v = pr(P, { ...d, sb }); if (v) { z += n * Math.log(v); w += n; } }
    return w ? Math.exp(z / w) : null;
  }
  /* 見積もり：card＝相場カード（1車種）、y＝年式、c＝条件 {m 型式, g グレード, sb 詳細（'__ALL__'＝全体・''＝メインのみ）, km 走行（千km）, col 色区分, e 評価点, i 内装}
   * 返り値（千円）：rt 売れる値（小売・税込）／aa AAで買える値（税抜）／stk 掲載・frs 新着（税込）／rt4・aa4 4か月後／
   *   up 仕入れ上限（AAの落札額・税抜）／room 余裕（上限−相場＝見込み粗利−目標）／gp 見込み粗利（sell・buy・gain・target）／bd 標準車からの差（税込）／sc 4か月後の収益（税抜）／buy お客様からの買取 */
  // 1つの年式の「元の値」（式から直接出る値）
  function base(card, y, c) {
    const Y = card.years[String(y)], F = card.fit, K = CFG;
    if (!Y) return null;
    y = +y;
    const me = { y, m: c.m, g: c.g, sb: c.sb == null ? '__ALL__' : c.sb, km: c.km, col: c.col, e: c.e ?? 4.0, i: c.i || 'B', t: 0, q: { ...(c.q || {}), u: c.unused ? 1 : 0 } };
    const std = { y, m: Y.std.m, g: Y.std.grade, km: Y.std.km, col: (F.sold && F.sold.cs[0]) || c.col, e: 4.0, i: 'B', t: 0 };
    const P = (f, d) => prX(f, d, Y);
    const R = { rt: P(F.sold, me), aa: P(F.aa, me), stk: P(F.stock, me), frs: P(F.fresh, me), rtStd: P(F.sold, std), aaStd: P(F.aa, std),
      // この先の値は「同じ走行のまま」で出す（在庫の車は走らない＝相場の動きだけを見る。ゆうた 2026-10-03）
      rt4: P(F.sold, { ...me, t: K.MONTHS }), aa4: P(F.aa, { ...me, t: K.MONTHS }), aa1: P(F.aa, { ...me, t: 1 }) };
    const s0 = { ...std, m: c.m }, s1 = { ...s0, g: c.g }, s2 = { ...s1, km: c.km }, s3 = { ...s2, col: c.col }, d = (a, b) => a != null && b != null ? b - a : null;
    R.bd = { model: d(P(F.sold, std), P(F.sold, s0)), grade: d(P(F.sold, s0), P(F.sold, s1)), km: d(P(F.sold, s1), P(F.sold, s2)), col: d(P(F.sold, s2), P(F.sold, s3)) };
    R.gIn = !!(F.sold && F.sold.gs.includes(c.g));
    // 精度の予想（AA＝評価点も効く／小売＝評価点なし）。pct＝この値から外れる大きさの目安（真ん中）
    R.conf = { aa: conf(F.aa, me), rt: conf(F.sold, { ...me, e: null }) };
    // 1年先の目安（同じ走行のまま）：いまの値 × 全車種の「その年数の車が1年で下がる割合」（card.y1f）
    // 2026-10-05 検証（13か月前→いま 949件）：外れの真ん中 14〜18%・偏りほぼ0。精度は低いので「目安」として出す
    const y1 = (f, k) => { if (!f) return null; const v0 = P(f, me); if (!v0) return null;
      const r = ((card.y1f || {})[k] || {})[String(y)];   // 全車種の年数ごとの1年の下がり方（隣の年式が前期/後期の境目でも段差を拾わない）
      return r != null ? v0 * Math.exp(r) : null; };
    R.rt1y = y1(F.sold, 'sold'); R.aa1y = y1(F.aa, 'aa');
    // 会場の癖（c.venue＝'CAA東京' 等。2026-10-07）：いまの AA の値の高さで倍率を決め、aa・aa1・aa4 に同じ倍率を掛ける。未使用車は下で新車価格×比に置き換わる
    if (c.venue && R.aa != null) { const k = venueAdj(c.venue, R.aa); if (k !== 1) { R.venue = { name: c.venue, k, aa0: R.aa }; R.aa *= k; if (R.aa1 != null) R.aa1 *= k; if (R.aa4 != null) R.aa4 *= k; } }
    if (c.unused) unusedQuote(card, Y, y, c, R);
    return R;
  }
  /* 未使用車（2026-10-06）：
   *  AA ＝ 新車価格（税込）× その車種・年式・グレードの「AA の未使用車（評価S・5百km未満）の落札 ÷ 新車価格」の真ん中。
   *       比は 年式×グレード → 年式 → 車種全体 → 全車種（軽／ふつう）の順（build.py の unused_ratio と同じ）。
   *       いままでの AA の式は未使用車を学習していない（評価3〜5だけ）ので低く出ていた：直近14日の AA の未使用車 2,177台で 外れ 11.0%（評価4で計算）→ 3.3%
   *  小売 ＝ 機械学習のまま（未使用車の印つき）。新車価格の何%（5.9%）より機械学習（5.1%）の方が当たった。画面には「新車価格の何%に当たるか」を添える
   *  4か月後などは式の月あたりの動きを掛ける */
  // 会場の癖の倍率（build.py の venue_adj と同じ）。会場が無い・表に無い時は 1
  function venueAdj(v, p) {
    const T = v && CFG.VENUE_ADJ[v]; if (!T || p == null || !(p > 0)) return 1;
    const x = Math.log(p), X = T.map(t => Math.log(t[0]));
    let o;
    if (x <= X[0]) o = T[0][1]; else if (x >= X[X.length - 1]) o = T[T.length - 1][1];
    else { let i = 0; while (x > X[i + 1]) i++; o = T[i][1] + (T[i + 1][1] - T[i][1]) * (x - X[i]) / (X[i + 1] - X[i]); }
    return Math.exp(-o);
  }
  function unusedRatio(T, y, g) { T = T || {}; return T[y + '|' + g] || T[String(y)] || T[''] || null; }
  /* 2026-10-10 未使用車の補正（build.py unused_aa と同じ）：
   *  ①新車価格は出品の型式の値（Y.npm[グレード][型式]。型式で値が違うグレードだけ）→ 無ければグレードの値（Y.np）。ハイエースバンのガソリン⇔ディーゼル等
   *  ②比は「その車種の一番新しい台から14日」を先に（build.py UN_RECENT_DAYS。表の中身だけの話で、ここの引き方は同じ）
   *  ③新車価格が分からない車種（アトレー・ランクル300・スーパーキャリイ・キャラバン 等）は、AA の未使用車の落札の真ん中（unused.aap：年式×グレード → 年式）
   *  1週ずつ伏せた4週の答え合わせ：①② 6,161台で外れ 3.72→3.17%、③ 394台で 10.8→5.0% */
  function unusedQuote(card, Y, y, c, R) {
    const U = card.unused || {}, np = (((Y.npm || {})[c.g] || {})[c.m]) || (Y.np || {})[c.g] || null;
    R.unused = { np };
    if (!np) {
      const pv = unusedRatio(U.aap, y, c.g); if (!pv) return;   // 落札の実績も無い＝ふつうの式（未使用車の印つき）のまま
      const F = card.fit, mv = (f, t) => f && f.b ? Math.exp(fut(f, t)) : 1, K = CFG;
      delete R.venue; R.aa = pv[0]; R.aa4 = R.aa * mv(F.aa, K.MONTHS); R.aa1 = R.aa * mv(F.aa, 1); R.rt1y = R.aa1y = null;
      const s = Math.sqrt(pv[2] * pv[2] + pv[2] * pv[2] / Math.max(pv[1], 1)) * K.CONF_UN, pct = Math.round(s * 1000) / 10;
      R.conf = { ...R.conf, aa: { pct, grade: (K.CONF_GRADES.find(z => pct <= z[1]) || ['F'])[0], n: pv[1], why: [`AA の未使用車 ${pv[1]}台の落札のばらつき ±${(pv[2] * 100).toFixed(1)}%`], thin: [] } };
      R.unused = { np: null, paa: pv[0], naa: pv[1], raa: null, rrt: null, src: '（新車価格が分からないので、AA の未使用車の落札の真ん中）' };
      return;
    }
    const own = unusedRatio(U.aa, y, c.g), ra = own || (U.g || {}).aa;
    const F = card.fit, mv = (f, t) => f && f.b ? Math.exp(fut(f, t)) : 1, K = CFG;
    if (ra) { delete R.venue; /* 未使用車は会場の癖を当てない（表はふつうの中古車から作った） */ R.aa = np * ra[0]; R.aa4 = R.aa * mv(F.aa, K.MONTHS); R.aa1 = R.aa * mv(F.aa, 1); }
    R.rt1y = R.aa1y = null;   // 1年後の目安は未使用車には当てない（年数ごとの下がり方は中古車の物）
    if (ra) { const s = Math.sqrt(ra[2] * ra[2] + ra[2] * ra[2] / Math.max(ra[1], 1)) * K.CONF_UN, pct = Math.round(s * 1000) / 10;
      R.conf = { ...R.conf, aa: { pct, grade: (K.CONF_GRADES.find(z => pct <= z[1]) || ['F'])[0], n: ra[1], why: [`AA の未使用車 ${ra[1]}台の新車価格に対する比のばらつき ±${(ra[2] * 100).toFixed(1)}%`], thin: [] } }; }
    R.unused = { np, raa: ra ? ra[0] : null, naa: ra ? ra[1] : 0, rrt: R.rt != null ? R.rt / np : null,
      src: ra ? (own ? '' : '（この車種の AA の未使用車が少ないので、全車種の比）') : '（AA の未使用車の実績が無いので AA はふつうの式）' };
  }
  // 元の値から、仕入れ上限・見込み粗利・4か月後の収益・買取・税抜/税込の組を出す
  function derive(card, R) {
    const K = CFG, prof = card.kei ? K.PROF.kei : K.PROF.normal;
    R.prof = prof;
    R.up = R.rt4 ? R.rt4 / K.TAX - K.AA_FEE - prof : null;
    R.room = R.up != null && R.aa != null ? R.up - R.aa : null;
    // 見込み粗利（税抜）：いまAA相場で買って、4か月後に小売で売った時に残る額＝4か月後の売値÷1.1 −（AA相場＋落札経費）。目標（prof）との差＝room
    R.gp = R.rt4 != null && R.aa != null ? { sell: R.rt4 / K.TAX, buy: R.aa + K.AA_FEE, gain: R.rt4 / K.TAX - R.aa - K.AA_FEE, target: prof } : null;
    // 4か月後の収益（仕入れ＝AA＋落札経費。売値は税抜）
    const buy = R.aa != null ? R.aa + K.AA_FEE : null, buy4 = R.aa4 != null ? R.aa4 + K.AA_FEE : null;
    R.sc = [
      { k: 'いま仕入れて、すぐ小売できた場合', sell: R.rt != null ? R.rt / K.TAX : null, buy, how: 'いまの売値（税抜）− いまの仕入れ。比べるための目安' },
      { k: `いま仕入れて、${K.MONTHS}か月後に小売`, sell: R.rt4 != null ? R.rt4 / K.TAX : null, buy, how: `${K.MONTHS}か月後の売値（税抜）− いまの仕入れ` },
      { k: `いま仕入れて、${K.MONTHS}か月後にAAに出す`, sell: R.aa4 != null ? R.aa4 - K.AA_SELL : null, buy, how: `${K.MONTHS}か月後のAA − 出品経費${K.AA_SELL / 10}万 − いまの仕入れ` },
      { k: `${K.MONTHS}か月後に仕入れて、すぐ小売`, sell: R.rt4 != null ? R.rt4 / K.TAX : null, buy: buy4, how: `${K.MONTHS}か月後の売値（税抜）− ${K.MONTHS}か月後の仕入れ` }];
    R.sc.forEach(x => x.gain = x.sell != null && x.buy != null ? x.sell - x.buy : null);
    // お客様からの買取（税抜の上限を出してから ×1.1 ＝ お客様に払う額）
    R.buy = { shop: R.rt4 != null ? (R.rt4 / K.TAX - prof) * K.TAX : null,                 // 店頭で売る：落札料は要らない
              aa: R.aa1 != null ? (R.aa1 - K.AA_SELL - K.BUY_AA_PROF) * K.TAX : null,      // すぐAAに出す：1か月後のAA − 出品経費 − 目標の利益
              mkt: R.aa != null ? R.aa * K.TAX : null };                                   // 業者の相場の目安（利益0）
    /* 表示用：主な金額の 税抜（ex）と 税込（inc）の組（ゆうた 2026-10-03「税抜をメインに表示、大きな所には必ず税込を横に添える」）。
     * 元の値の税の扱い：rt・stk・frs・rt4（小売）＝税込／aa・aa4・up（AA・仕入れ上限）＝税抜／buy（お客様に払う額）＝消費税なしの支払い額 */
    const pair = (v, isInc) => v == null ? null : (isInc ? { ex: v / K.TAX, inc: v } : { ex: v, inc: v * K.TAX });
    R.tax = { rt: pair(R.rt, true), stk: pair(R.stk, true), frs: pair(R.frs, true), rt4: pair(R.rt4, true), rt1y: pair(R.rt1y, true), aa1y: pair(R.aa1y, false),
              aa: pair(R.aa, false), aa4: pair(R.aa4, false), up: pair(R.up, false), room: pair(R.room, false),
              buy: { shop: pair(R.buy.shop, true), aa: pair(R.buy.aa, true), mkt: pair(R.buy.mkt, true) } };
    return R;
  }
  /* 相場DBが苦手な車の注意（2026-10-06 ゆうた「具体的な注意ポイントも」）。ASNET 過去4週 約7万台の答え合わせと出品票で、大きく外れた車の形から。
   * DataLine の AA には AT/MT・社外パーツ・出品票の状態が無いので、これらは相場DBでは当てられない＝人が出品票で見る */
  function cautions(card, y, c, aa) {
    const W = [], gr = String((c.g || '') + ' ' + (c.sb || '')).normalize('NFKC'), age = new Date().getFullYear() - y;
    if (c.mt || /(^|[^A-Z])[56]?MT\b|マニュアル/i.test(gr)) W.push('MT（マニュアル）は相場が崩れる：スポーツ系は高く、実用車は安く落ちることが多い（相場DBに AT/MT の区別が無い）');
    if (/G['’]s|GR\s?スポーツ|\bGR\b|STI|スペックB|タイプR|TYPE\s?R|ニスモ|NISMO|無限|モデューロ|TRD/i.test(gr)) W.push("走りの特別車（G's・STI・スペックB 等）はマニアの値が付き、相場DBより高く落ちることがある（出品票・人気で判断）");
    if (age >= 8 && c.km != null && c.km < 10) W.push('古い車の極端な低走行（1万km未満）は、相場DBより高く落ちやすい（真ん中で7%ほど相場DBが安め）');
    const Y = card.years && card.years[String(y)], n = Y && Y.n ? (Y.n.aa || 0) + (Y.n.sold || 0) : 0;
    if (Y && n < 30) W.push('この年式は台数が少ない（' + n + '台）。一番新しい年式は相場DBが前の年式並みに低く出ることがある');
    // 2026-10-07 小売の値が AA より極端に高い所の調べ（掲載 30万台と比べた）：年式の小売（成約）が10台未満だと外れが 15〜20%（多い所は 9%）。向きは決まっていない＝値は直さず注意だけ
    if (Y && Y.n && (Y.n.sold || 0) < 10) W.push('この年式は小売（成約）の実績が少ない（' + (Y.n.sold || 0) + '台）。小売の値・仕入れ上限は外れやすい（±15〜20%）＝掲載と比べて確かめる');
    if (c.e != null && c.e <= 3) W.push(card.maker === 'MINI' ? 'MINI の評価3以下は相場DBがかなり高めに出る（1〜2割。学習の外の3つの期間すべてで）' : '評価3以下は相場DBが高めに出やすい（4〜5%）');
    // 2026-10-07 MINI の精度の調査：10年を超えた MINI は DataLine の中の答え合わせでも外れの真ん中 22〜24%（新しい MINI は 7%）＝1台ごとの状態の差
    if (card.maker === 'MINI' && age >= 10) W.push('10年を超えた MINI は1台ごとの差が大きい（外れの真ん中 約22%）。相場DBは目安にして、出品票（警告灯・オイル漏れ・修理歴）で判断');
    if (aa != null && aa < 300) W.push(c.venue && CFG.VENUE_ADJ[c.venue] ? '30万円未満の車は外れやすい（±12%）。' + c.venue + 'の癖（安い車は全国より高く落ちる）は足してある' : '30万円未満の車は外れやすい（±15%）。会場で向きが違う（全国では相場DBが高め・CAA東京では低め）');
    W.push('社外パーツのカスタム・出品票の注意事項（警告灯・修理歴など）は相場DBに入っていない＝出品票で引く');
    return W;
  }
  // 選んだ組み合わせの学習台数が少ない時の注意（2026-10-06）。AA と小売の少ない方の台数で1行にまとめる
  function thinWarn(R) {
    const m = {};
    for (const k of ['aa', 'rt']) for (const [nm, n] of ((R.conf && R.conf[k] && R.conf[k].thin) || [])) m[nm] = Math.min(m[nm] ?? 1e9, n);
    const L = Object.keys(m);
    return L.length ? ['この組み合わせの実績が少ない（' + L.map(k => k + ' ' + m[k] + '台').join('・') + '）。外れやすいので出品票・掲載で確かめる'] : [];
  }
  function addWarn(D, card, y, c) { const W = cautions(card, y, c, D.aa); D.warn = [...W.slice(0, -1), ...thinWarn(D), ...(c.unused && D.unused && !D.unused.np && D.unused.paa == null ? ['未使用車：新車価格が分からないので、ふつうの中古車の式で出している'] : []), W[W.length - 1]]; return D; }
  function quote(card, y, c) { const R = base(card, y, c); if (!R) return null; const D = derive(card, R); if (D) addWarn(D, card, y, c); return D; }
  /* 前期・中期・後期など、いくつかの年式をまとめた値（ゆうた 2026-10-03「特定年式でも、前期でも見られるように」）。
   * 年式ごとに同じ条件（型式・グレード・詳細・走行・色・評価）で元の値を出し、その年式の台数（成約＋AA）で重みをつけて平均（対数で）する。
   * そのグレードが無い年式は入れない。標準車からの差・精度は、台数が一番多い年式のものを使う */
  function quotePhase(card, years, c) {
    const L = [];
    for (const y of years) {
      const Y = card.years[String(y)]; if (!Y) continue;
      if (!(Y.grades || []).some(g => g[0] === c.g)) continue;
      const R = base(card, y, c); if (!R) continue;
      L.push({ y, R, w: (Y.n.sold || 0) + (Y.n.aa || 0) || 1 });
    }
    if (!L.length) return null;
    const top = L.reduce((a, b) => b.w > a.w ? b : a), out = { ...top.R };
    for (const k of ['rt', 'aa', 'stk', 'frs', 'rtStd', 'aaStd', 'rt4', 'aa4', 'aa1']) {
      let z = 0, w = 0;
      for (const x of L) if (x.R[k] != null) { z += x.w * Math.log(x.R[k]); w += x.w; }
      out[k] = w ? Math.exp(z / w) : null;
    }
    out.years = L.map(x => x.y); out.rep = top.y;
    const D = derive(card, out); if (D) addWarn(D, card, top.y, c); return D;
  }
  /* ── 実績の顔ぶれで出す値（2026-10-09 ゆうた「年式とグレードだけ決めて、あとは指定なし」）──
   * cards の years[y].cx（build.py の cells_of）＝実際に取引された車の組（年式×グレード×型式×走行の帯×色区分×詳細（×評価点×内装＝AA だけ））と台数。
   * 「指定なし」の条件は、当てはまる組ごとに上の式（prX）で1台の値を出し、台数の重みで真ん中（重み付きの中央値）を取る。
   * AA の値＝AA の実績の組、小売の値＝小売（成約）の実績の組。数字ごとに別々に真ん中を取り、仕入れ上限・見込み粗利・買取は derive（quote と同じ）で出す。
   * 🔴 式そのもの（pr・prX・conf・derive）は変えていない。ここは組の選び方と真ん中の取り方だけ。 */
  const CX_KB = [10, 30, 50, 70, 100];   // 走行の帯（千km）：〜1万・1〜3万・3〜5万・5〜7万・7〜10万・10万〜（build.py の KB6 と同じ）
  const CX_KBN = ['〜1万km', '1〜3万km', '3〜5万km', '5〜7万km', '7〜10万km', '10万km〜'];
  function cxKb(km) { for (let i = 0; i < CX_KB.length; i++) if (km < CX_KB[i]) return i; return CX_KB.length; }
  // 年式ごとの組を読む（文字列 → 物の並び。1回読んだら Y に持っておく）
  function cxOf(Y) {
    const X = Y && Y.cx; if (!X) return null;
    if (Y.__cx) return Y.__cx;
    const rd = (s, w) => { const v = s ? s.split(',').map(Number) : [], o = []; for (let j = 0; j + w <= v.length; j += w) o.push(v.slice(j, j + w)); return o; };
    const g = i => X.g[i], m = i => X.m[i], s = i => X.s[i] || '', c = i => X.c[i] || null;
    // v=2（2026-10-09）：台数の前に期（0＝分からない・1〜＝期の番号＋1）
    const P2 = X.v === 2 ? 1 : 0, ph = v => P2 ? (v ? v - 1 : null) : undefined;
    const a = rd(X.a, 9 + P2).map(v => ({ g: g(v[0]), m: m(v[1]), kb: v[2], col: c(v[3]), sb: s(v[4]), e: v[5] / 2, i: v[6] < 5 ? 'ABCDE'[v[6]] : null, ph: ph(v[7]), n: v[7 + P2], km: v[8 + P2] }));
    const r = rd(X.r, 7 + P2).map(v => ({ g: g(v[0]), m: m(v[1]), kb: v[2], col: c(v[3]), sb: s(v[4]), ph: ph(v[5]), n: v[5 + P2], km: v[6 + P2] }));
    Object.defineProperty(Y, '__cx', { value: { a, r }, enumerable: false, configurable: true });
    return Y.__cx;
  }
  // 条件 f＝{g, m, kb, col, sb, e, i}（null／undefined＝指定なし）に当てはまる組。kind＝'a'（AA）／'r'（小売。評価点・内装は見ない）。skip＝数えない条件（選び肢ごとの台数を出す時）
  function cxMatch(card, years, f, kind, skip) {
    const o = [];
    for (const y of years) {
      const X = cxOf(card.years[String(y)]); if (!X) continue;
      for (const x of X[kind]) {
        let ok = true;
        for (const k of ['g', 'm', 'kb', 'col', 'sb', 'e', 'i', 'ph']) {   // ph＝期（2026-10-09。期を選んだ時は、その期の車＝登録の年月で振り分けた行だけ。分からない行は入れない）
          if (k === skip || f[k] == null) continue;
          if (kind === 'r' && (k === 'e' || k === 'i')) continue;
          if (x[k] !== f[k]) { ok = false; break; }
        }
        if (ok) o.push({ ...x, y: +y });
      }
    }
    return o;
  }
  // 当てはまる台数（AA・小売）
  function cxCount(card, years, f, skip) {
    const s = L => L.reduce((a, x) => a + x.n, 0);
    return { aa: s(cxMatch(card, years, f, 'a', skip)), rt: s(cxMatch(card, years, f, 'r', skip)) };
  }
  // 重み付きの中央値（[値, 重み] の並び）
  function wmed(L) {
    L = L.filter(x => x[0] != null && isFinite(x[0])); if (!L.length) return null;
    L.sort((a, b) => a[0] - b[0]); const W = L.reduce((a, x) => a + x[1], 0); let s = 0;
    for (const [v, w] of L) { s += w; if (s >= W / 2 - 1e-9) return v; }
    return L[L.length - 1][0];
  }
  const MIXC = typeof WeakMap !== 'undefined' ? new WeakMap() : null;   // 組ごとの値の控え（車種ごと）
  /* card＝相場カード、years＝年式の並び、f＝絞り込み（上の cxMatch）、c＝そのほかの条件 {km ぴったりの走行（千km。入れた時だけ全部の組をこの走行で出す）, q 装備, unused, venue}
   * 返り値＝quote と同じ形＋ mix＝{nAA, nRT 当てはまる台数, cAA, cRT 組の数, years, rep 代表の1台（年式は台数が一番多い年式・ほかは一番多い組）}
   * 当てはまる組が無い kind は、条件（指定なしは代表の値）の1台で出す（mix.nAA／nRT が 0 のまま） */
  function quoteMix(card, years, f, c) {
    c = c || {}; f = f || {};
    years = years.map(Number).filter(y => card.years[String(y)]);
    if (!years.length) return null;
    const F = card.fit, K = CFG;
    let A = cxMatch(card, years, f, 'a'), Rr = cxMatch(card, years, f, 'r');
    const nA = A.reduce((a, x) => a + x.n, 0), nR = Rr.reduce((a, x) => a + x.n, 0);
    // 代表：年式＝当てはまる台数が一番多い年式。グレード等＝指定があればそれ、なければその年式で一番多い組の値
    const wy = {}; [...A, ...Rr].forEach(x => wy[x.y] = (wy[x.y] || 0) + x.n);
    const ry = Object.keys(wy).length ? +Object.keys(wy).reduce((a, b) => wy[b] > wy[a] ? b : a) : years[0];
    const Yr = card.years[String(ry)];
    const top = (L, k) => { const C = {}; L.filter(x => x.y === ry).forEach(x => { const v = x[k]; C[v] = (C[v] || 0) + x.n; }); const ks = Object.keys(C); return ks.length ? ks.reduce((a, b) => C[b] > C[a] ? b : a) : null; };
    const pick = (k, L, def) => f[k] != null ? f[k] : (() => { const v = top(L, k); return v == null ? def : v; })();
    const rep = { y: ry, g: pick('g', [...Rr, ...A], Yr.std.grade), m: pick('m', [...Rr, ...A], Yr.std.m), sb: pick('sb', [...Rr, ...A], ''),
      col: pick('col', [...Rr, ...A], (F.sold && F.sold.cs[0]) || null), e: f.e != null ? f.e : (+top(A, 'e') || 4.0), i: pick('i', A, 'B') };
    if (rep.col === 'null') rep.col = null;
    rep.km = c.km != null ? c.km : (() => { const L = [...Rr, ...A].filter(x => x.y === ry && (f.kb == null || x.kb === f.kb)); return L.length ? Math.round(wmed(L.map(x => [x.km, x.n]))) : Yr.std.km; })();
    if (f.kb != null && c.km == null && cxKb(rep.km) !== f.kb) rep.km = [5, 20, 40, 60, 85, 120][f.kb];
    // 組が無い kind は代表の1台で
    if (!A.length) A = [{ ...rep, n: 1, kb: cxKb(rep.km) }];
    if (!Rr.length) Rr = [{ ...rep, n: 1, kb: cxKb(rep.km) }];
    let memo = MIXC ? MIXC.get(card) : null; if (MIXC && !memo) { memo = new Map(); MIXC.set(card, memo); }
    const qk = JSON.stringify(c.q || {}) + '|' + (c.unused ? 1 : 0) + '|' + (c.venue || '');
    const one = (kind, x) => {
      const km = c.km != null ? c.km : x.km, Y = card.years[String(x.y)];
      const key = kind + '|' + x.y + '|' + x.g + '|' + x.m + '|' + x.sb + '|' + km + '|' + x.col + '|' + (kind === 'a' ? x.e + '|' + x.i : '') + '|' + x.ph + '|' + qk;
      if (memo && memo.has(key)) return memo.get(key);
      const d = { y: x.y, m: x.m, g: x.g, sb: x.sb || '', km, col: x.col, e: kind === 'a' ? x.e : 4.0, i: kind === 'a' ? x.i : 'B', t: 0, q: { ...(c.q || {}), u: c.unused ? 1 : 0 }, php: x.ph == null ? null : x.ph };
      const P = (fit) => fit ? prX(fit, d, Y) : null, y1 = (fit, k, v) => { const r = ((card.y1f || {})[k] || {})[String(x.y)]; return v != null && r != null ? v * Math.exp(r) : null; };
      let o;
      if (kind === 'a') {
        let aa = P(F.aa); if (aa != null && c.venue) aa *= venueAdj(c.venue, aa);
        o = { aa, aa4: aa != null && F.aa ? aa * Math.exp(fut(F.aa, K.MONTHS)) : null, aa1: aa != null && F.aa ? aa * Math.exp(fut(F.aa, 1)) : null, aa1y: y1(F.aa, 'aa', aa), cf: conf(F.aa, d) };
      } else {
        const rt = P(F.sold);
        o = { rt, rt4: rt != null && F.sold ? rt * Math.exp(fut(F.sold, K.MONTHS)) : null, stk: P(F.stock), frs: P(F.fresh), rt1y: y1(F.sold, 'sold', rt), cf: conf(F.sold, { ...d, e: null }) };
      }
      if (memo) { if (memo.size > 200000) memo.clear(); memo.set(key, o); }
      return o;
    };
    const VA = A.map(x => [one('a', x), x.n]), VR = Rr.map(x => [one('r', x), x.n]);
    const md = (V, k) => wmed(V.map(([o, n]) => [o[k], n]));
    // 標準の車からの差・標準の車の値は代表の1台の quote から（グラフの高さ合わせ・条件の補正の欄）
    const R0 = base(card, ry, { m: rep.m, g: rep.g, sb: rep.sb, km: rep.km, col: rep.col, e: rep.e, i: rep.i, q: c.q, unused: c.unused, venue: c.venue }) || {};
    const out = { ...R0, rt: md(VR, 'rt'), rt4: md(VR, 'rt4'), stk: md(VR, 'stk'), frs: md(VR, 'frs'), rt1y: md(VR, 'rt1y'), aa: md(VA, 'aa'), aa4: md(VA, 'aa4'), aa1: md(VA, 'aa1'), aa1y: md(VA, 'aa1y') };
    delete out.venue;
    // 精度：組ごとの外れの目安を台数の重みで真ん中。理由は代表の1台の物＋顔ぶれの説明
    const cfm = (V, k, R0c) => { const p = wmed(V.filter(([o]) => o.cf).map(([o, n]) => [o.cf.pct, n])); if (p == null) return R0c || null;
      const b = R0c || { why: [], thin: [], n: 0 }; return { ...b, pct: p, grade: (K.CONF_GRADES.find(z => p <= z[1]) || ['F'])[0], why: [`当てはまる ${V.length}組の外れの目安の真ん中`, ...b.why] }; };
    out.conf = { aa: cfm(VA, 'aa', (R0.conf || {}).aa), rt: cfm(VR, 'rt', (R0.conf || {}).rt) };
    if (c.unused) unusedQuote(card, Yr, ry, { g: rep.g }, out);
    out.mix = { nAA: nA, nRT: nR, cAA: nA ? VA.length : 0, cRT: nR ? VR.length : 0, years, rep };
    const D = derive(card, out); if (D) addWarn(D, card, ry, { ...rep, e: f.e, km: c.km != null ? c.km : f.kb != null ? rep.km : null, venue: c.venue, unused: c.unused });   // 評価点・走行の注意は指定した時だけ
    return D;
  }
  /* ── 実際の値のローソク足（2026-10-09 ゆうた「実際の取引の値も重ねて」）──
   * years[y].cx.cd（build.py の cells_of）＝[グレード番号（−1全部）, 期（−1全部）, 走行の帯（−1全部）, とき（≦0 月・100＋週）, 10・25・50・75・90%, 台数]。
   * f＝絞り込み（g・ph・kb を見る。型式・詳細・色・評価点・内装は持っていない＝大きくしないため）。
   * 直近3か月（月の台数）が AA と小売で合わせて10台未満なら、走行の帯を外した広い条件に戻す（wide＝true）。
   * 複数の年式は、年式ごとの5つの点を台数の重みの見本として混ぜて分位を取り直す（近似）。
   * 返り値 { a: [[とき（月。週は 週÷4.345）, q10, q25, q50, q75, q90, 台数, 週か]], r: 同じ（小売は税込のまま）, wide } */
  function cdOf(Y) {
    const X = Y && Y.cx && Y.cx.cd; if (!X) return null;
    if (Y.__cd) return Y.__cd;
    const rd = s => { const v = s ? s.split(',').map(Number) : [], o = []; for (let j = 0; j + 10 <= v.length; j += 10) o.push(v.slice(j, j + 10)); return o; };
    const o = { a: rd(X.a), r: rd(X.r), g: Y.cx.g };
    Object.defineProperty(Y, '__cd', { value: o, enumerable: false, configurable: true });
    return o;
  }
  function candles(card, years, f) {
    f = f || {};
    const pick = (kb) => {
      const out = { a: {}, r: {} };
      for (const y of years) {
        const C = cdOf(card.years[String(y)]); if (!C) continue;
        const gi = f.g != null ? C.g.indexOf(f.g) : -1; if (f.g != null && gi < 0) continue;
        const ph = f.ph != null ? f.ph : -1;
        for (const k of ['a', 'r']) for (const v of C[k]) {
          if (v[0] !== gi || v[1] !== ph) continue;
          const wk = v[3] >= 50;
          if (wk ? v[2] !== -1 : v[2] !== kb) continue;
          (out[k][v[3]] = out[k][v[3]] || []).push(v);
        }
      }
      return out;
    };
    const recent = o => ['a', 'r'].reduce((s, k) => s + Object.keys(o[k]).filter(t => +t < 50 && +t >= -2).reduce((a, t) => a + o[k][t].reduce((b, v) => b + v[9], 0), 0), 0);
    let o = pick(f.kb != null ? f.kb : -1), wide = false;
    if (f.kb != null && recent(o) < 10) { o = pick(-1); wide = true; }
    const merge = L => {
      if (L.length === 1) return L[0].slice(4, 10);
      const S = []; let N = 0;
      for (const v of L) { const w = v[9] / 5; for (let j = 4; j < 9; j++) S.push([v[j], w]); N += v[9]; }
      S.sort((a, b) => a[0] - b[0]); const W = S.reduce((a, x) => a + x[1], 0);
      const q = p => { let s = 0; for (const [x, w] of S) { s += w; if (s >= p * W - 1e-9) return x; } return S[S.length - 1][0]; };
      return [q(.1), q(.25), q(.5), q(.75), q(.9), N];
    };
    const fin = O => Object.keys(O).map(Number).sort((a, b) => a - b).map(t => { const m = merge(O[t]), wk = t >= 50; return [wk ? (t - 100) / 4.345 : t, ...m, wk ? 1 : 0]; });
    return { a: fin(o.a), r: fin(o.r), wide };
  }
  G.SobaCalc = { CFG, row, pr, prX, conf, quote, quotePhase, cautions, eqFill, eqTop, gbmZ, thin, unusedRatio, venueAdj, quoteMix, cxOf, cxMatch, cxCount, cxKb, CX_KB, CX_KBN, wmed, candles, phpMix };
})(typeof window !== 'undefined' ? window : globalThis);
