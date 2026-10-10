/* ========================================
   soba/soba-data.js ─ 相場ビューのデータの読み込み  v3.8.0（2026-10-10）
   ----------------------------------------
   ◎ 置き場＝Firebase Storage の soba/v1/（相場DB の 出力\ をそのまま）
       meta.json・index.json・cards/<キー>.json・det.json・soba-calc.js（katashiki.json は見積もりで使う）
     上げるのは D:\Claude\CoreFlowアプリ\deploy-soba.ps1（画面からは書かない）
   🔴 DataLine のデータが元なので Hosting には置かない。読めるのは CarFlow にログインした人だけ（storage.rules の /soba/）
     ＝ Storage の窓口に、ログインの通行証（ID トークン）を付けて読む。ダウンロード URL（誰でも開ける鍵つき URL）は作らない
   ◎ この画面は CarFlow の中の iframe（同じサイト）。ログインは親（CarFlow）の firebase を借りる
   ◎ デモ版（親に window.__DEMO_MODE）は本物を読まない。soba/demo/ に見本の値があればそれ、無ければ「デモ版では出さない」
   ◎ 計算は soba-calc.js をファイルごと読み込む（写して書き直さない＝相場DB の決まり）
   ======================================== */
(function () {
  const BUCKET = 'carflow-9d500.firebasestorage.app';
  const PREFIX = 'soba/v1/';
  const P = (function () { try { return window.parent; } catch (e) { return null; } })();
  const DEMO = !!(P && P.__DEMO_MODE === true);
  // 手元の確かめ用（localhost の時だけ）：?src=http://127.0.0.1:8899/ で 出力\ を直接読む
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? new URLSearchParams(location.search).get('src') : null;

  let token = null, tokenAt = 0;
  async function idToken() {
    if (token && Date.now() - tokenAt < 10 * 60 * 1000) return token;
    const fb = P && P.firebase;
    const u = fb && fb.apps && fb.apps.length && fb.auth().currentUser;
    if (!u) throw new Error('ログインしていません（CarFlow を開き直してください）');
    token = await u.getIdToken(); tokenAt = Date.now();
    return token;
  }

  async function get(path, kind) {
    let r;
    if (LOCAL) r = await fetch(LOCAL.replace(/\/?$/, '/') + path, { cache: 'no-store' });
    else if (DEMO) r = await fetch('demo/' + path, { cache: 'no-store' });
    else {
      const url = 'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/' + encodeURIComponent(PREFIX + path) + '?alt=media';
      r = await fetch(url, { headers: { Authorization: 'Firebase ' + await idToken() }, cache: path === 'meta.json' ? 'no-store' : 'default' });
      if (r.status === 401 || r.status === 403) { token = null; throw new Error('相場データを読む権限がありません（' + r.status + '）'); }
    }
    if (r.status === 404) { const e = new Error('相場データが見つかりません：' + path); e.notFound = true; throw e; }
    if (!r.ok) throw new Error('相場データを読めませんでした（' + r.status + '）：' + path);
    return kind === 'text' ? r.text() : r.json();
  }

  function addScript(src, text) {
    return new Promise((ok, ng) => {
      const s = document.createElement('script');
      if (text != null) { s.textContent = text; document.head.appendChild(s); ok(); return; }
      s.src = src; s.onload = ok; s.onerror = () => ng(new Error('読み込めませんでした：' + src));
      document.head.appendChild(s);
    });
  }

  // カードは開いた時だけ。読んだ物は持っておく（多すぎたら古い物から捨てる）
  const CACHE = new Map(), WAIT = new Map(), KEEP = 40;
  function card(k) {
    if (CACHE.has(k)) return Promise.resolve(CACHE.get(k));
    if (WAIT.has(k)) return WAIT.get(k);
    const p = get('cards/' + encodeURIComponent(k) + '.json').then(c => {
      CACHE.set(k, c); WAIT.delete(k);
      while (CACHE.size > KEEP) CACHE.delete(CACHE.keys().next().value);   // 開いている車は view.js が M で持っているので消えても困らない
      return c;
    }, e => { WAIT.delete(k); throw e; });
    WAIT.set(k, p);
    return p;
  }

  function msg(html) { const m = document.getElementById('main'); if (m) m.innerHTML = '<div class="sbmsg">' + html + '</div>'; }
  function fail(e) { console.error('[soba]', e); msg('⚠ ' + String((e && e.message) || e).replace(/</g, '&lt;')); }

  async function start() {
    msg('相場データを読み込み中…');
    let meta;
    try { meta = await get('meta.json'); }
    catch (e) {
      if (DEMO) { msg('<b>デモ版では相場データを出していません。</b><br>本番の CarFlow では、ここに AA相場・小売相場・買取相場が出ます。'); return; }
      if (e.notFound) { msg('<b>相場データがまだ上がっていません。</b><br>相場DBの「出力」を上げると表示されます。'); return; }
      fail(e); return;
    }
    if (meta.schema !== 1) { fail(new Error('相場データの形が変わりました（schema ' + meta.schema + '）。CarFlow 側の対応が要ります')); return; }
    try {
      const [idx, calc] = await Promise.all([get('index.json'), get('soba-calc.js', 'text')]);
      await addScript(null, calc + '\n//# sourceURL=soba-calc.js');
      if (!window.SobaCalc) throw new Error('計算（soba-calc.js）を読み込めませんでした');
      window.SOBA = { built: meta.built, raw: meta.raw, avg: meta.avg || {}, tax: meta.tax, notes: meta.notes || {}, n: meta.n, det: null, demo: DEMO };
      window.SOBA_INDEX = idx.map(e => Object.assign({}, e, { years: Object.fromEntries((e.years || []).map(y => [String(y), 1])) }));
      document.getElementById('main').innerHTML = '<p class="muted">左の一覧から車種を選ぶか、上の欄でさがす。</p>';
      await addScript('view.js?v=3.8.0');
    } catch (e) { fail(e); return; }
    // カタログの装備・色（1.4〜2.4MB）は後から。来たら今の車を描き直す
    get('det.json').then(d => { window.SOBA.det = d; if (typeof window.sobaRedraw === 'function') try { window.sobaRedraw(); } catch (e) {} })
      .catch(e => console.warn('[soba] det.json', e));
  }

  window.SobaData = { card, cached: k => CACHE.get(k) || null, fail, demo: DEMO };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
