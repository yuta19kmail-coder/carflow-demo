/* ========================================
   car-soba.js ─ 車両詳細の［相場］タブ  CarFlow v3.10.0（2026-10-12）
   ----------------------------------------
   🗣 2026-10-12 ゆうた「車両詳細カードに相場タブを追加し、直近で入っている相場ビューの情報を基に在庫車両の情報で引いた情報を表示」
   ◎ 中身は相場ビュー（soba/）を iframe で開くだけ＝soba/index.html?car=<車のID>
     ・相場データは相場ビューと同じ物（Storage soba/v1/＝いちばん新しく上げた受け渡し）。計算も同じ soba-calc.js
     ・車の情報は iframe 側から CarSoba.car(id) で取る（URL に車の中身を載せない）
     ・当て方は soba/stock.js、条件のはめ方と上の1枚は soba/embed.js
   ◎ PC・タブレットのカード詳細（car-detail-v3.js）の右のタブだけ。スマホ・1カラム表示には出さない
   🔴 iframe は描き直すと読み直しになるので、car-detail-v3.js は［相場］タブを開いている間、右の中身を描き直さない（render の keepSoba）
   ======================================== */
(function () {
  'use strict';

  function findCar(id) {
    var c = null;
    if (typeof cars !== 'undefined' && Array.isArray(cars)) c = cars.find(function (x) { return x && x.id === id; });
    if (!c && typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) c = archivedCars.find(function (x) { return x && x.id === id; });
    return c || null;
  }
  function incl(amount, field) {
    var n = Number(amount) || 0; if (!n) return 0;
    var lab = (typeof getTaxLabel === 'function') ? getTaxLabel(field) : '税込';
    return (lab === '税抜' && typeof convertTax === 'function') ? Math.round(convertTax(n, 'excl', 'incl')) : n;
  }

  /* iframe（soba/embed.js）に渡す車の情報。金額は税込の円にそろえる */
  function car(id) {
    var c = findCar(id); if (!c) return null;
    var y = (typeof parseYearInput === 'function' ? parseYearInput(c.year) : null) || c.year || '';
    return {
      id: c.id, num: c.num || '', maker: c.maker || '', model: c.model || '', grade: c.grade || '',
      year: y, km: Number(c.km) || 0, color: c.color || '',
      bodyIncl: incl(c.price, 'body'), totalIncl: incl(c.totalPrice, 'total')
    };
  }

  function ver() {
    var m = document.querySelector('meta[name="app-version"]');
    return m ? m.getAttribute('content') : '';
  }
  /* 相場の引き方に効く欄。これが変わった時だけ iframe を読み直す（car-detail-v3.js の keepSoba） */
  function sig(c) {
    return [c.maker, c.model, c.grade, c.year, c.km, c.color, c.price, c.totalPrice].map(function (v) { return v == null ? '' : String(v); }).join('|');
  }
  function attr(v) { return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function panel(c) {
    return '<iframe class="cd3-soba-f" data-car="' + attr(c.id) + '" data-sig="' + attr(sig(c)) + '" title="この車の相場" src="soba/index.html?v=' + encodeURIComponent(ver()) + '&car=' + encodeURIComponent(c.id) + '"></iframe>';
  }

  window.CarSoba = { car: car, panel: panel, sig: sig };
})();
