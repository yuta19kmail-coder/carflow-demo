// ========================================
// ios-safe-pad.js (v1.8.3)
// ----------------------------------------
// iPhone Safari ブラウザモードでは env(safe-area-inset-top) が 0 を返すため、
// Dynamic Island / ノッチに被ることがある。
// ここで iOS デバイスを検出して body.ios-safe-pad クラスを付け、
// CSS 側で max(env(safe-area-inset-top), 47px) のハードコード最小値を効かせる。
// ----------------------------------------
// 検出条件：
//  - iOS（iPhone / iPad）の UA
//  - もしくは iPad の新しい UA（Macintosh + ontouchend）
// ========================================

(function () {
  'use strict';

  function isIOS() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPod/.test(ua)) return true;
    // iPad を「Macintosh + Touch」として偽装してくる新 UA 対策
    if (/iPad/.test(ua)) return true;
    if (/Macintosh/.test(ua) && 'ontouchend' in document) return true;
    return false;
  }

  if (isIOS()) {
    document.documentElement.classList.add('ios-safe-pad');
    // body にも付ける（DOM 構築前に html 要素にだけ付けて、DOMContentLoaded で body にも反映）
    function _applyBody() {
      if (document.body) document.body.classList.add('ios-safe-pad');
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _applyBody);
    } else {
      _applyBody();
    }
    console.log('[ios-safe-pad] iOS detected, applying max-padding fallback for Dynamic Island');
  }
})();
