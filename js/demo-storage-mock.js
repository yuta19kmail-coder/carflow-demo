// ========================================
// demo-storage-mock.js
// デモ版用：Firebase Storage SDK モック
// ----------------------------------------
// 写真アップロードを data URL に変換して in-memory で保持。
// 既存の db-storage.js は何も変更せず動く。
// ========================================

(function () {
  'use strict';

  const _files = {}; // path -> data URL

  function _ref(path) {
    return {
      fullPath: path,
      async put(blob, metadata) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            _files[path] = e.target.result;
            resolve({ ref: this });
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      },
      async getDownloadURL() {
        return _files[path] || '';
      },
      async delete() {
        delete _files[path];
      },
      async listAll() {
        const items = [];
        const prefixSet = new Set();
        Object.keys(_files).forEach((p) => {
          if (p.startsWith(path + '/') || p === path) {
            const rest = p.slice(path.length + 1);
            if (rest.includes('/')) {
              prefixSet.add(path + '/' + rest.split('/')[0]);
            } else if (rest) {
              items.push(_ref(p));
            }
          }
        });
        return {
          items,
          prefixes: Array.from(prefixSet).map((p) => _ref(p)),
        };
      },
      child(sub) { return _ref(path + '/' + sub); },
    };
  }

  const storage = {
    ref(path) { return _ref(path || ''); },
  };

  window.__demoStorageMock = storage;
  window.__demoStorageFiles = _files; // デバッグ用

  console.log('[demo-storage-mock] ready');
})();
