// ========================================
// num-helpers.js (v2.16.0)
// 管理番号（KM-XXXX）まわりの共通ロジック
// ----------------------------------------
//   parseNum(str)       : 'KM-0234' / 'km0234' / '234' などから整数 234 を取り出す（失敗時 null）
//   formatNum(n)        : 整数 → 'KM-XXXX'（4桁ゼロ詰め）
//   collectAllNums()    : cars + archivedCars + deletedCars から全番号の整数配列を返す
//   nextNum()           : 次に使うべき番号文字列（最大+1）。空なら 'KM-0001'
//   findDuplicate(num, excludeId)
//                       : 既存番号と被ったらカテゴリ/車両情報を返す。
//                         戻り値: { source: 'cars'|'archived'|'deleted', record: {...} } / null
// ========================================
(function () {
  'use strict';

  // 'KM-0234' / 'km-234' / '0234' / 234 などから整数を抽出
  function parseNum(s) {
    if (s === null || s === undefined) return null;
    const str = String(s).trim();
    if (!str) return null;
    // 数字以外を全部削ぎ落として整数化
    const m = str.match(/\d+/);
    if (!m) return null;
    const n = parseInt(m[0], 10);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  // 整数 234 → 'KM-0234'
  function formatNum(n) {
    if (!Number.isFinite(n) || n < 0) return '';
    return 'KM-' + String(n).padStart(4, '0');
  }

  // cars + archivedCars + deletedCars から全番号の整数配列を返す
  // v2.16.1: isDuplicate:true マーク済みは除外（=「重複扱い」されたものは無かったことにする）
  function collectAllNums() {
    const out = [];
    const push = arr => {
      if (!Array.isArray(arr)) return;
      arr.forEach(c => {
        if (!c) return;
        if (c.isDuplicate === true) return;     // 重複扱いは除外
        const n = parseNum(c.num);
        if (n !== null) out.push(n);
      });
    };
    if (typeof cars !== 'undefined') push(cars);
    if (typeof archivedCars !== 'undefined') push(archivedCars);
    if (typeof deletedCars !== 'undefined') push(deletedCars);
    if (typeof manualNumbers !== 'undefined') push(manualNumbers);
    return out;
  }

  // 次に使うべき番号文字列（最大+1）
  function nextNum() {
    const all = collectAllNums();
    if (all.length === 0) return formatNum(1);
    const max = Math.max.apply(null, all);
    return formatNum(max + 1);
  }

  // 既存と重複しているかチェック。被ってたら情報を返す。
  // excludeId は自分自身を除外したい時（編集中の自車両）に渡す
  function findDuplicate(num, excludeId) {
    const target = parseNum(num);
    if (target === null) return null;
    const ex = excludeId !== undefined && excludeId !== null ? String(excludeId) : null;

    function scan(arr, source) {
      if (!Array.isArray(arr)) return null;
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (!c) continue;
        if (ex && String(c.id) === ex) continue;
        if (c.isDuplicate === true) continue;   // v2.16.1: 重複扱い済みは衝突対象から除外
        if (parseNum(c.num) === target) return { source: source, record: c };
      }
      return null;
    }

    return scan(typeof cars !== 'undefined' ? cars : null, 'cars')
        || scan(typeof archivedCars !== 'undefined' ? archivedCars : null, 'archived')
        || scan(typeof deletedCars !== 'undefined' ? deletedCars : null, 'deleted')
        || scan(typeof manualNumbers !== 'undefined' ? manualNumbers : null, 'manual');
  }

  window.numHelpers = {
    parseNum: parseNum,
    formatNum: formatNum,
    collectAllNums: collectAllNums,
    nextNum: nextNum,
    findDuplicate: findDuplicate,
  };
})();
