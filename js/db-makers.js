/* ================================================================================
   db-makers.js  -  🚗 メーカー表のうち「会社で足した行」の読み書き   CarFlow v3.18.0
   ================================================================================
   パス：companies/{cid}/carMakers/{鍵}（1行＝1文書。鍵＝CFMaker.key(名前)）
     { name, origin:'dom'|'imp', group?, by, byName, at, updatedBy?, updatedByName?, updatedAt? }
     書き方違いとして既存の行に足した物＝ { aliasOf:'正式名', alias:'打った文字', by, byName, at }（鍵は 'alias_'＋鍵）
   🔴 表の本体（最初からある約60行）は car-class.js。ここは足した行・直した行だけ。
   🔴 ルール（_ルール\firestore.rules の carMakers）：読む＝会社のメンバー／足す＝車を作れる人・車両情報を直せる人／直す＝設定を直せる人
      ＝「国産？輸入？」には登録した人が答えられる。間違いは管理者が設定の「メーカー表」で直す。消す道は作らない
   🔴 足した・直したは操作ログ（auditLogs）に「前 → 後・誰が」で1行
   ================================================================================ */
(function (w) {
  'use strict';

  var LIST = [], unsub = null, listeners = [];

  function col(){
    if (!w.fb || !w.fb.db || !w.fb.currentCompanyId) return null;
    return w.fb.db.collection('companies').doc(w.fb.currentCompanyId).collection('carMakers');
  }
  function me(){
    var uid = (w.fb && w.fb.currentUser && w.fb.currentUser.uid) || '';
    var name = (typeof currentUser !== 'undefined' && currentUser) || '';
    return { uid: uid, name: String(name || '') };
  }
  function apply(list){
    LIST = list;
    if (w.CFMaker) w.CFMaker.setExtra(list);
    listeners.slice().forEach(function (fn) { try { fn(list); } catch (e) { console.error('[db-makers] onChange', e); } });
  }
  function log(text){ if (typeof w.addAuditLog === 'function') w.addAuditLog(text); }

  /* 購読（起動時に auth.js から1回）。届くたびに表を組み直す */
  function subscribe(){
    var c = col(); if (!c) return function () {};
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    var waitMs = 3000, relinkT = null;
    function link(){
      unsub = c.onSnapshot(function (snap) {
        waitMs = 3000;
        var list = [];
        snap.forEach(function (d) { var x = d.data() || {}; x.id = d.id; list.push(x); });
        apply(list);
      }, function (err) {
        console.error('[db-makers] 購読が落ちました', err);
        if (relinkT) return;
        relinkT = setTimeout(function () { relinkT = null; try { if (unsub) unsub(); } catch (e) {} unsub = null; link(); }, waitMs);
        waitMs = Math.min(waitMs * 2, 60000);
      });
    }
    link();
    return function () { if (relinkT) clearTimeout(relinkT); try { if (unsub) unsub(); } catch (e) {} unsub = null; };
  }

  /* 表に無いメーカーを足す（「国産？輸入？」の答え）。成功で true */
  async function add(name, origin){
    name = String(name || '').trim();
    if (!name || (origin !== 'dom' && origin !== 'imp')) return false;
    var c = col(); if (!c) return false;
    var k = w.CFMaker.key(name), u = me();
    var rec = { name: name, origin: origin, by: u.uid, byName: u.name, at: w.fb.serverTimestamp() };
    await c.doc(k).set(rec);   /* 🔴 新しい文書だけ（ルールで「足す」）。もうある行を書き換えるのは setOrigin（管理者） */
    log('メーカー表に足した：「' + name + '」＝' + w.CFMaker.ORIGIN_LABEL[origin]);
    return true;
  }
  /* 書き方違いとして既存の行に足す（「マセラテイ」→ マセラティ） */
  async function addAlias(alias, toName){
    alias = String(alias || '').trim(); toName = String(toName || '').trim();
    if (!alias || !toName) return false;
    var c = col(); if (!c) return false;
    var u = me();
    await c.doc('alias_' + w.CFMaker.key(alias)).set({ alias: alias, aliasOf: toName, by: u.uid, byName: u.name, at: w.fb.serverTimestamp() });
    log('メーカー表に書き方を足した：「' + alias + '」＝「' + toName + '」と同じ');
    return true;
  }
  /* 管理者：行の区分を直す（最初からある行も、ここで直した値が勝つ） */
  async function setOrigin(name, origin, before){
    name = String(name || '').trim();
    if (!name || (origin !== 'dom' && origin !== 'imp')) return false;
    var c = col(); if (!c) return false;
    var k = w.CFMaker.key(name), u = me();
    var cur = LIST.filter(function (x) { return x.id === k; })[0];
    if (cur) await c.doc(k).update({ origin: origin, updatedBy: u.uid, updatedByName: u.name, updatedAt: w.fb.serverTimestamp() });
    else await c.doc(k).set({ name: name, origin: origin, by: u.uid, byName: u.name, at: w.fb.serverTimestamp() });
    log('メーカー表を直した：「' + name + '」' + (w.CFMaker.ORIGIN_LABEL[before] || 'わからない') + ' → ' + w.CFMaker.ORIGIN_LABEL[origin]);
    return true;
  }

  function onChange(fn){ if (typeof fn === 'function') listeners.push(fn); }

  w.dbMakers = { subscribe: subscribe, add: add, addAlias: addAlias, setOrigin: setOrigin, onChange: onChange, list: function () { return LIST.slice(); } };
})(window);
