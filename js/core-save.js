/* ============================================================
   core-save.js — CoreFlow共通「保存はサーバー確認できた時だけ成功」＋統一エラーコード
   ------------------------------------------------------------
   方針（CoreFlow全アプリ共通の標準）：
     ・オフラインキャッシュ有効下では set()/update()/delete() は「端末に書けた時点」で
       成功扱いになり、サーバーに届いたかは別問題。だから成功表示はサーバー確認後だけ出す。
     ・失敗は3桁エラーコード付きで通知して原因を切り分けやすくする。
   エラーコード体系（3桁）：
     E1xx 入力・準備（保存前にクライアントで止まった）  ※各アプリ側で投げる
     E2xx 端末に保存できない（ローカルキャッシュ書込失敗・IndexedDB不可/プライベートbrowズ等）
     E3xx サーバーに届かない（通信不可・オフライン・タイムアウト・Safari制限など）
     E4xx サーバーが拒否（権限・ルール）
     E9xx その他・不明
   使い方：
     await CoreSave.confirmSet(ref, data, {merge:true});   // 成功で resolve、失敗で coded error throw
     try { ... } catch(e){ CoreSave.toastError(e); }       // 統一トースト（E○○○付き）
   依存なし・自己完結。auto-update.js と同じく各アプリの js/ に同一内容を配置する共通部品。
   ============================================================ */
(function () {
  'use strict';

  var CONFIRM_TIMEOUT_MS = 8000; // サーバー応答待ちの上限

  function _timeout(ms) {
    return new Promise(function (_, rej) {
      setTimeout(function () { rej({ code: 'deadline-exceeded', __timeout: true }); }, ms);
    });
  }
  function _mapCode(e) {
    var c = e && e.code;
    if (c === 'permission-denied') return 401;
    if (c === 'unavailable' || c === 'deadline-exceeded') return 301;
    return 901;
  }
  function _mkErr(code, label, orig) {
    var e = new Error(label + '（コード E' + code + '）');
    e.coreCode = code; e.coreLabel = label; e.orig = orig;
    return e;
  }
  function _db() { return window.fb && window.fb.db; }

  // 端末がオフライン保存(IndexedDB)を使えない時の切替フラグ。
  //   一度ローカル書込に失敗したら立てる → 次回読み込みから firebase-init が
  //   enablePersistence をスキップ＝ネット直書き（サーバー確認）モードになり、
  //   端末の保存が壊れていても登録が通るようになる。
  function _markOfflineBroken() {
    try { window.localStorage.setItem('cf_no_persist', '1'); } catch (_) {}
  }
  function _offlineDisabled() {
    try { return window.localStorage.getItem('cf_no_persist') === '1'; } catch (_) { return false; }
  }

  // ローカル書込（set/update/delete）を実行。iOS Safari 等で IndexedDB が一時的に弾く事があるので
  //   1回だけ間を置いて再試行 → それでもダメなら「次回からネット直書き」に切替フラグを立てて E201 を投げる。
  //   op = 書込を行って Promise を返す関数。
  function _localWrite(op, failLabel) {
    return op().catch(function () {
      return new Promise(function (res) { setTimeout(res, 500); })
        .then(op)
        .catch(function (e2) {
          _markOfflineBroken();
          throw _mkErr(201, failLabel + '。お手数ですが画面を再読み込みしてもう一度お試しください', e2);
        });
    });
  }

  // 書き込み後、サーバーに本当に反映されたかを確認する。
  //   expectExists=true … 保存（存在するはず） / false … 削除（消えているはず）
  function _confirm(ref, expectExists) {
    var d = _db();
    if (!d || typeof d.waitForPendingWrites !== 'function') {
      // 万一 waitForPendingWrites 非対応でもサーバー読み取りで確認する
      return ref.get({ source: 'server' }).then(function (snap) {
        if (expectExists && !snap.exists) throw _mkErr(401, 'サーバーが保存を拒否しました（権限の可能性）');
        if (!expectExists && snap.exists) throw _mkErr(401, 'サーバーが削除を拒否しました（権限の可能性）');
        return true;
      }).catch(function (e) {
        if (e && e.coreCode) throw e;
        throw _mkErr(_mapCode(e), 'サーバー保存の確認が取れませんでした', e);
      });
    }
    return Promise.race([d.waitForPendingWrites(), _timeout(CONFIRM_TIMEOUT_MS)])
      .catch(function (e) { throw _mkErr(301, 'サーバーに保存できませんでした（通信）', e); })
      .then(function () { return ref.get({ source: 'server' }); })
      .catch(function (e) {
        if (e && e.coreCode) throw e;
        throw _mkErr(_mapCode(e), 'サーバー保存の確認が取れませんでした', e);
      })
      .then(function (snap) {
        if (expectExists && !snap.exists) throw _mkErr(401, 'サーバーが保存を拒否しました（権限の可能性）');
        if (!expectExists && snap.exists) throw _mkErr(401, 'サーバーが削除を拒否しました（権限の可能性）');
        return true;
      });
  }

  function confirmSet(ref, data, opts) {
    return _localWrite(function () { return ref.set(data, opts || {}); }, '端末に保存できませんでした')
      .then(function () { return _confirm(ref, true); });
  }
  function confirmUpdate(ref, data) {
    return _localWrite(function () { return ref.update(data); }, '端末に保存できませんでした')
      .then(function () { return _confirm(ref, true); });
  }
  function confirmDelete(ref) {
    return _localWrite(function () { return ref.delete(); }, '端末で削除できませんでした')
      .then(function () { return _confirm(ref, false); });
  }

  // 統一の失敗トースト（E○○○ 付き）。戻り値はコード番号。
  function toastError(e) {
    var code = (e && e.coreCode) || 901;
    var label = (e && e.coreLabel) || '保存に失敗しました';
    if (typeof showToast === 'function') showToast('' + label + '（E' + code + '）');
    if (window.console) console.error('[core-save] E' + code + ' ' + label, e);
    return code;
  }

  window.CoreSave = {
    confirmSet: confirmSet,
    confirmUpdate: confirmUpdate,
    confirmDelete: confirmDelete,
    toastError: toastError,
    error: _mkErr,                 // 各アプリが E1xx 等を投げる用：CoreSave.error(101,'…')
    codeOf: function (e) { return (e && e.coreCode) || 901; },
    offlineDisabled: _offlineDisabled  // E201でオフライン保存を切替済みか（呼び出し側が再読み込み誘導に使う）
  };
  console.log('[core-save] ready');
})();
