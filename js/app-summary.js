/* ========================================
   app-summary.js — CoreFlowダッシュボードへ概況を配信（appSummaries/carflow）v2.30.0
   ----------------------------------------
   ・契約＝D:\アプリ開発\引き継ぎ_CoreFlowダッシュボード.md：{updatedAt, metrics[{label,value,tone}], items[{main,sub,right,warn}]}
   ・自己完結（既存コードには一切触らない）：ログイン＆車両ロード完了を5秒間隔で検知→3秒後に初回配信→以降10分ごと。
   ・機微情報は載せない（価格・顧客名なし。台数・在庫日数・車名のみ）。
   ・書けない時（ルール未反映等）は console.warn のみ＝画面には出さない。
   ======================================== */
(function () {
  'use strict';
  var KEY = 'carflow', INTERVAL = 10 * 60 * 1000;

  function colLabel(id) {
    try { var c = (typeof COLS !== 'undefined' ? COLS : []).find(function (x) { return x.id === id; }); return c ? c.label : String(id || ''); }
    catch (e) { return String(id || ''); }
  }
  function invDaysOf(c) {
    var d = c && (c.purchaseDate || c.createdAt); if (!d) return null;
    var t = new Date(d); if (isNaN(t)) return null;
    var n = Math.floor((Date.now() - t.getTime()) / 86400000);
    return (n >= 0 && n < 3650) ? n : null;
  }
  function build() {
    var list = (typeof cars !== 'undefined' && Array.isArray(cars)) ? cars : [];
    var active = list.filter(function (c) { return c && c.col !== 'done'; });
    var exhibit = active.filter(function (c) { return c.col === 'exhibit'; }).length;
    var delivery = active.filter(function (c) { return c.col === 'delivery'; }).length;
    var days = active.map(invDaysOf).filter(function (n) { return n != null; });
    var avg = days.length ? Math.round(days.reduce(function (a, b) { return a + b; }, 0) / days.length) : null;
    var metrics = [
      { label: '在庫台数（納車完了除く）', value: String(active.length) + '台', tone: 'info' },
      { label: '展示中', value: String(exhibit) + '台', tone: 'good' },
      { label: '納車準備', value: String(delivery) + '台', tone: 'purple' }
    ];
    if (avg != null) metrics.push({ label: '平均在庫日数', value: String(avg) + '日', tone: (avg >= 45 ? 'warn' : 'info') });
    var items = active.map(function (c) { return { c: c, d: invDaysOf(c) }; })
      .filter(function (x) { return x.d != null; })
      .sort(function (a, b) { return b.d - a.d; }).slice(0, 10)
      .map(function (x) {
        var c = x.c;
        return { main: ((c.num != null && c.num !== '') ? ('#' + c.num + ' ') : '') + String(c.maker || '') + ' ' + String(c.model || ''), sub: colLabel(c.col), right: String(x.d) + '日', warn: x.d >= 45 };
      });
    return { metrics: metrics, items: items };
  }
  window._carflowSummaryBuild = build;   // 検証用フック

  function publish() {
    if (!(window.fb && window.fb.db && window.fb.currentUser)) return;
    try {
      var doc = build(); doc.updatedAt = window.fb.serverTimestamp();
      var cid = window.fb.currentCompanyId || 'kobayashi_motors';
      window.fb.db.collection('companies').doc(cid).collection('appSummaries').doc(KEY)
        .set(doc, { merge: false })
        .catch(function (e) { console.warn('[appSummary:carflow] 配信不可', e && e.code); });
    } catch (e) { console.warn('[appSummary:carflow]', e); }
  }
  var tries = 0;
  var boot = setInterval(function () {
    tries++;
    var ok = (window.fb && window.fb.currentUser && typeof cars !== 'undefined' && Array.isArray(cars) && cars.length > 0);
    if (ok) { clearInterval(boot); setTimeout(publish, 3000); setInterval(publish, INTERVAL); }
    else if (tries > 240) { clearInterval(boot); }   // 20分ログインなしなら諦め（次回リロードで再試行）
  }, 5000);
})();
