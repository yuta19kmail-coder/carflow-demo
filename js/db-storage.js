// ========================================
// db-storage.js (v1.5.10〜)
// Firebase Storage に画像をアップロードする wrapper
// ----------------------------------------
// パス命名（DB設計書 §5 準拠）：
//   gs://{bucket}/companies/{companyId}/
//     ├── cars/{carId}/main.jpg
//     └── profiles/{uid}.jpg
//
// 提供関数（window.dbStorage 名前空間）：
//   uploadCarPhoto(carId, fileOrBlob)      : 車両メイン写真（最大1600px）
//   uploadProfilePhoto(uid, fileOrBlob)    : プロフィールアイコン（最大256px）
//   deleteCarPhoto(carId)                  : 車両写真を削除
//   _resizeImageBlob(file, max, quality)   : リサイズして Blob 返す
//   _dataUrlToBlob(dataUrl)                : 旧 data:URL → Blob 変換（移行用）
//
// 既存の data:URL は当面そのまま動くようにする（<img src=...> はどちらでもOK）
// 新規アップロードは Storage URL になり、Firestore 容量を節約できる。
// ========================================

(function () {
  'use strict';

  function _bucket() {
    if (!window.fb || !window.fb.storage) return null;
    return window.fb.storage;
  }

  function _companyRoot() {
    const cid = window.fb && window.fb.currentCompanyId;
    if (!cid) return null;
    return _bucket().ref('companies/' + cid);
  }

  // dataURL を Blob に変換（旧形式の写真を Storage にアップする時に使う）
  function _dataUrlToBlob(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:')) return null;
    try {
      const arr = dataUrl.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) u8arr[n] = bstr.charCodeAt(n);
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      console.error('[db-storage] _dataUrlToBlob:', e);
      return null;
    }
  }

  // 画像 File をリサイズして Blob に
  function _resizeImageBlob(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          const m = maxSize || 1600;
          if (w >= h && w > m) { h = Math.round(h * m / w); w = m; }
          else if (h > m) { w = Math.round(w * m / h); h = m; }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('toBlob failed'));
          }, 'image/jpeg', quality || 0.85);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 車両メイン写真をアップロード
  async function uploadCarPhoto(carId, fileOrBlob) {
    const root = _companyRoot();
    if (!root || !carId || !fileOrBlob) return null;
    const blob = (fileOrBlob instanceof File)
      ? await _resizeImageBlob(fileOrBlob, 1600, 0.85)
      : fileOrBlob;
    const ref = root.child('cars/' + carId + '/main.jpg');
    try {
      await ref.put(blob, { contentType: 'image/jpeg' });
      return await ref.getDownloadURL();
    } catch (err) {
      console.error('[db-storage] uploadCarPhoto:', err);
      throw err;
    }
  }

  // プロフィールアイコンをアップロード
  async function uploadProfilePhoto(uid, fileOrBlob) {
    const root = _companyRoot();
    if (!root || !uid || !fileOrBlob) return null;
    const blob = (fileOrBlob instanceof File)
      ? await _resizeImageBlob(fileOrBlob, 256, 0.85)
      : fileOrBlob;
    const ref = root.child('profiles/' + uid + '.jpg');
    try {
      await ref.put(blob, { contentType: 'image/jpeg' });
      return await ref.getDownloadURL();
    } catch (err) {
      console.error('[db-storage] uploadProfilePhoto:', err);
      throw err;
    }
  }

  // 車両写真を削除（車両削除時に呼ぶ。失敗しても無視）
  async function deleteCarPhoto(carId) {
    const root = _companyRoot();
    if (!root || !carId) return;
    try {
      await root.child('cars/' + carId + '/main.jpg').delete();
    } catch (err) {
      // not-found は無視（最初から無いケース）
      if (err && err.code !== 'storage/object-not-found') {
        console.warn('[db-storage] deleteCarPhoto:', err);
      }
    }
  }

  // プロフィールアイコンを削除
  async function deleteProfilePhoto(uid) {
    const root = _companyRoot();
    if (!root || !uid) return;
    try {
      await root.child('profiles/' + uid + '.jpg').delete();
    } catch (err) {
      if (err && err.code !== 'storage/object-not-found') {
        console.warn('[db-storage] deleteProfilePhoto:', err);
      }
    }
  }

  // v1.7.0: 付箋ボードの画像アップロード（最大1200px）
  async function uploadBoardNoteImage(noteId, fileOrBlob) {
    const root = _companyRoot();
    if (!root || !noteId || !fileOrBlob) return null;
    const blob = (fileOrBlob instanceof File)
      ? await _resizeImageBlob(fileOrBlob, 1200, 0.85)
      : fileOrBlob;
    const ref = root.child('boardNotes/' + noteId + '.jpg');
    try {
      await ref.put(blob, { contentType: 'image/jpeg' });
      return await ref.getDownloadURL();
    } catch (err) {
      console.error('[db-storage] uploadBoardNoteImage:', err);
      throw err;
    }
  }

  // v1.7.0: 付箋ボード画像の削除
  async function deleteBoardNoteImage(noteId) {
    const root = _companyRoot();
    if (!root || !noteId) return;
    try {
      await root.child('boardNotes/' + noteId + '.jpg').delete();
    } catch (err) {
      if (err && err.code !== 'storage/object-not-found') {
        console.warn('[db-storage] deleteBoardNoteImage:', err);
      }
    }
  }

  // v1.7.14: チェックリスト項目に貼る写真のアップロード（最大1600px、項目編集モーダルから呼ばれる）
  //   path: companies/{cid}/checklistMedia/{tplId}/{itemId}/{ts}_{rand}.jpg
  //   tplId / itemId が無い場合は misc/ に投入。返り値は downloadURL。
  async function uploadChecklistMedia(tplId, itemId, fileOrBlob) {
    const root = _companyRoot();
    if (!root || !fileOrBlob) return null;
    const blob = (fileOrBlob instanceof File)
      ? await _resizeImageBlob(fileOrBlob, 1600, 0.85)
      : fileOrBlob;
    const safe = (s) => String(s || 'misc').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    const fname = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7) + '.jpg';
    const path = 'checklistMedia/' + safe(tplId) + '/' + safe(itemId) + '/' + fname;
    const ref = root.child(path);
    try {
      await ref.put(blob, { contentType: 'image/jpeg' });
      return await ref.getDownloadURL();
    } catch (err) {
      console.error('[db-storage] uploadChecklistMedia:', err);
      throw err;
    }
  }

  window.dbStorage = {
    uploadCarPhoto,
    uploadProfilePhoto,
    deleteCarPhoto,
    deleteProfilePhoto,
    uploadBoardNoteImage,    // v1.7.0
    deleteBoardNoteImage,    // v1.7.0
    uploadChecklistMedia,    // v1.7.14
    _resizeImageBlob,
    _dataUrlToBlob,
  };

  console.log('[db-storage] ready');
})();
