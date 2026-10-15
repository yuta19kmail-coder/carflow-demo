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

  /* ============================================================
     🔴 v3.16.7（棚卸し A-34）番号は「会社の書類1枚」を transaction で +1 して取る
     ------------------------------------------------------------
     前は nextNum()＝「その端末が知っている一番大きい番号＋1」だけだったので、
     2台がほぼ同時に新規登録すると、同じ KM-番号 が2台に付いていた（番号は PitFlow・掲載・書類で使う＝後で直すのが重い）。
     ◎置き場＝ companies/<会社>/counters/carNum の { last: 最後に振った番号(数), at, by }
     ◎claimNum(preferred, { auto })
       ・auto=true（画面が自動で入れた番号のまま保存する時）
         → max(書類の last, この端末が知っている最大) ＋1 を取り、書類の last をそれにする。
           ほかの端末が先に同じ番号を取っていたら、次の空いた番号に変わる（戻り値の changed=true）
       ・auto=false（人が番号を打った・手入力の記録）
         → その番号をそのまま使う。書類の last は「その番号より小さければ上げる」だけ（自動の番号が後でぶつからないように）
     ◎書類に書けない時（ルールがまだ許していない・通信が無い・体験版）＝今までどおり端末の最大＋1（preferred のまま）。
        登録自体は止めない（番号の取り合いの穴は残るが、今より悪くはならない）。
     ⚠ ルール（_ルール\firestore.rules）に counters/{id} の許しが要る（車を作れる人＝canCreateCar が read・create・update）
     ============================================================ */
  function _counterRef() {
    var fb = window.fb;
    if (!fb || !fb.db || !fb.currentCompanyId || typeof fb.db.runTransaction !== 'function') return null;
    return fb.db.collection('companies').doc(fb.currentCompanyId).collection('counters').doc('carNum');
  }
  function _localMax() {
    var all = collectAllNums();
    return all.length ? Math.max.apply(null, all) : 0;
  }
  function claimNum(preferred, opts) {
    var auto = !!(opts && opts.auto);
    var pref = String(preferred == null ? '' : preferred).trim();
    var p = parseNum(pref);
    var keep = { num: pref, changed: false, viaCounter: false };
    if (!pref && !auto) return Promise.resolve(keep);
    var ref = _counterRef();
    if (!ref) return Promise.resolve(auto && !pref ? { num: nextNum(), changed: false, viaCounter: false } : keep);
    var fb = window.fb;
    var uid = (fb.currentUser && fb.currentUser.uid) || null;
    var ts = (typeof fb.serverTimestamp === 'function') ? fb.serverTimestamp() : Date.now();
    return fb.db.runTransaction(function (tx) {
      return tx.get(ref).then(function (snap) {
        var last = (snap && snap.exists && snap.data && Number((snap.data() || {}).last)) || 0;
        var lm = _localMax();
        var n;
        if (auto) {
          n = Math.max(last, lm) + 1;
          /* 画面に出していた番号がまだ空いていれば、それを使う（端末の最大がまだ届いていないだけの時） */
          if (p !== null && p > Math.max(last, lm)) n = p;
        } else {
          n = p;
        }
        var newLast = Math.max(last, n || 0);
        if (newLast !== last || !(snap && snap.exists)) tx.set(ref, { last: newLast, at: ts, by: uid }, { merge: true });
        return n;
      });
    }).then(function (n) {
      if (!auto) return { num: pref, changed: false, viaCounter: true };
      var s = formatNum(n);
      return { num: s, changed: !!pref && parseNum(pref) !== n, viaCounter: true };
    }).catch(function (e) {
      try { console.warn('[num-helpers] 番号の書類に書けませんでした（端末の最大＋1で続けます）', e && (e.code || e.message || e)); } catch (x) {}
      return auto && !pref ? { num: nextNum(), changed: false, viaCounter: false } : keep;
    });
  }

  window.numHelpers = {
    parseNum: parseNum,
    formatNum: formatNum,
    collectAllNums: collectAllNums,
    nextNum: nextNum,
    claimNum: claimNum,
    findDuplicate: findDuplicate,
  };
})();
