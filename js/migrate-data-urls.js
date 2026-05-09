// ========================================
// migrate-data-urls.js (v1.5.12〜)
// ----------------------------------------
// 既存の data:URL 画像（v1.5.10 より前にアップロードされた写真／アイコン）を
// Firebase Storage に一括移行するユーティリティ。
//
// 対象：
//   1) cars[].photo                       data:URL → cars/{carId}/main.jpg
//   2) staff の customPhotoURL（admin 時） data:URL → profiles/{uid}.jpg
//
// 提供 API（window.migrateDataUrls 名前空間）：
//   scanTargets()                : 移行対象を収集（{cars:[], staff:[]}）
//   runCarMigration(opts)        : 車両写真を移行（dryRun / onProgress）
//   runStaffMigration(opts)      : スタッフアイコンを移行（admin 限定）
//   runAll(opts)                 : 両方を順番に実行
//   summarize(result)            : 結果を1行サマリ文字列に整形
//
// 動作前提：
//   - window.fb / window.dbStorage / window.dbCars が初期化済み
//   - cars[] が読み込み済み（auth.js の loadCars 後）
//   - admin/manager（canEditTemplates 不要、Storage 書込権限さえあればOK）
//   - 1回の実行は冪等：data:URL でないものはスキップ
//
// 使い方（設定画面のボタンから呼ぶ）：
//   const result = await window.migrateDataUrls.runAll({
//     dryRun: false,
//     includeStaff: true,
//     onProgress: (msg, done, total) => showToast(msg),
//   });
//   showToast(window.migrateDataUrls.summarize(result));
// ========================================

(function () {
  'use strict';

  // -----------------------------------------
  // ヘルパー
  // -----------------------------------------
  function _isDataUrl(s) {
    return typeof s === 'string' && s.startsWith('data:');
  }

  function _byteLen(dataUrl) {
    if (!_isDataUrl(dataUrl)) return 0;
    // base64 部の文字数 × 0.75 ≒ バイト数
    const i = dataUrl.indexOf(',');
    if (i < 0) return 0;
    return Math.round((dataUrl.length - i - 1) * 0.75);
  }

  function _readBlob(dataUrl) {
    if (!window.dbStorage || typeof window.dbStorage._dataUrlToBlob !== 'function') return null;
    return window.dbStorage._dataUrlToBlob(dataUrl);
  }

  function _toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }

  function _isAdminish() {
    const role = window.fb && window.fb.currentStaff && window.fb.currentStaff.role;
    return role === 'admin' || role === 'manager';
  }

  // -----------------------------------------
  // 対象スキャン（dry-run の入力 / 確認ダイアログ用）
  // -----------------------------------------
  function scanTargets() {
    const out = { cars: [], staff: [] };

    // cars
    if (typeof cars !== 'undefined' && Array.isArray(cars)) {
      cars.forEach(c => {
        if (c && _isDataUrl(c.photo)) {
          out.cars.push({
            id: c.id,
            label: (c.maker || '') + ' ' + (c.name || c.car || ''),
            sizeBytes: _byteLen(c.photo),
          });
        }
      });
    }

    // staff （admin/manager のみ取得済みの場合に対応）
    // dashboard.js が staff を抱えてないので、必要なら dbStaff.loadAllStaff() で取得する想定。
    // ここではメモリ上のリストには触らない（実行時に直接 Firestore を見る）。

    return out;
  }

  // -----------------------------------------
  // 1) 車両写真の移行
  // -----------------------------------------
  async function runCarMigration(opts) {
    opts = opts || {};
    const dryRun = !!opts.dryRun;
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

    if (!window.dbStorage) {
      return { ok: false, processed: 0, skipped: 0, errors: 0, reason: 'dbStorage 未初期化' };
    }
    if (typeof cars === 'undefined' || !Array.isArray(cars)) {
      return { ok: false, processed: 0, skipped: 0, errors: 0, reason: 'cars 配列が未読み込み' };
    }

    const targets = cars.filter(c => c && _isDataUrl(c.photo));
    const total = targets.length;
    let processed = 0, skipped = 0, errors = 0;

    if (total === 0) {
      return { ok: true, processed: 0, skipped: 0, errors: 0, total: 0 };
    }

    if (onProgress) onProgress(`移行対象：${total}件`, 0, total);

    for (let i = 0; i < targets.length; i++) {
      const car = targets[i];
      const dataUrl = car.photo;
      try {
        if (dryRun) {
          processed++;
          if (onProgress) onProgress(`[dry-run] ${i + 1}/${total} ${car.id}`, i + 1, total);
          continue;
        }

        const blob = _readBlob(dataUrl);
        if (!blob) {
          skipped++;
          if (onProgress) onProgress(`スキップ：blob 変換失敗 ${car.id}`, i + 1, total);
          continue;
        }

        const url = await window.dbStorage.uploadCarPhoto(car.id, blob);
        if (!url) {
          errors++;
          if (onProgress) onProgress(`失敗：URL 取得不可 ${car.id}`, i + 1, total);
          continue;
        }

        car.photo = url;
        // Firestore に反映（fire-and-forget ではなく await して順序保証）
        if (window.dbCars && window.dbCars.saveCar) {
          await window.dbCars.saveCar(car);
        }
        processed++;
        if (onProgress) onProgress(`${i + 1}/${total} 完了 ${car.id}`, i + 1, total);
      } catch (err) {
        errors++;
        console.error('[migrate-data-urls] car', car && car.id, err);
        if (onProgress) onProgress(`エラー ${car.id}：${(err && err.message) || err}`, i + 1, total);
      }
    }

    return { ok: true, processed, skipped, errors, total };
  }

  // -----------------------------------------
  // 2) スタッフアイコンの移行（admin 限定）
  // -----------------------------------------
  async function runStaffMigration(opts) {
    opts = opts || {};
    const dryRun = !!opts.dryRun;
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

    if (!_isAdminish()) {
      return { ok: false, reason: 'admin/manager 権限が必要' };
    }
    if (!window.dbStorage || !window.dbStaff) {
      return { ok: false, reason: 'dbStorage / dbStaff 未初期化' };
    }

    let staffList = [];
    try {
      staffList = await window.dbStaff.loadAllStaff();
    } catch (e) {
      return { ok: false, reason: 'staff 取得失敗：' + e.message };
    }

    const targets = (staffList || []).filter(s => s && _isDataUrl(s.customPhotoURL));
    const total = targets.length;
    let processed = 0, skipped = 0, errors = 0;

    if (total === 0) {
      return { ok: true, processed: 0, skipped: 0, errors: 0, total: 0 };
    }

    if (onProgress) onProgress(`スタッフ移行対象：${total}件`, 0, total);

    for (let i = 0; i < targets.length; i++) {
      const s = targets[i];
      const dataUrl = s.customPhotoURL;
      try {
        if (dryRun) {
          processed++;
          if (onProgress) onProgress(`[dry-run] ${i + 1}/${total} ${s.uid || s.id}`, i + 1, total);
          continue;
        }

        const blob = _readBlob(dataUrl);
        if (!blob) {
          skipped++;
          if (onProgress) onProgress(`スキップ：blob 変換失敗 ${s.uid || s.id}`, i + 1, total);
          continue;
        }

        const uid = s.uid || s.id;
        const url = await window.dbStorage.uploadProfilePhoto(uid, blob);
        if (!url) {
          errors++;
          continue;
        }

        if (window.dbStaff.updateStaff) {
          await window.dbStaff.updateStaff(uid, { customPhotoURL: url });
        }
        processed++;
        if (onProgress) onProgress(`${i + 1}/${total} 完了 ${uid}`, i + 1, total);
      } catch (err) {
        errors++;
        console.error('[migrate-data-urls] staff', s && (s.uid || s.id), err);
        if (onProgress) onProgress(`エラー ${s && (s.uid || s.id)}`, i + 1, total);
      }
    }

    return { ok: true, processed, skipped, errors, total };
  }

  // -----------------------------------------
  // 3) 全部まとめて実行
  // -----------------------------------------
  async function runAll(opts) {
    opts = opts || {};
    const result = { cars: null, staff: null };
    result.cars = await runCarMigration(opts);
    if (opts.includeStaff !== false) {
      result.staff = await runStaffMigration(opts);
    }
    return result;
  }

  // -----------------------------------------
  // サマリ整形
  // -----------------------------------------
  function summarize(result) {
    if (!result) return '結果なし';
    const parts = [];
    if (result.cars) {
      const r = result.cars;
      if (r.ok) {
        parts.push(`車両: ${r.processed}/${r.total} 成功（skip ${r.skipped} / err ${r.errors}）`);
      } else {
        parts.push(`車両: ${r.reason || '失敗'}`);
      }
    }
    if (result.staff) {
      const r = result.staff;
      if (r.ok) {
        parts.push(`スタッフ: ${r.processed}/${r.total} 成功（skip ${r.skipped} / err ${r.errors}）`);
      } else {
        parts.push(`スタッフ: ${r.reason || '失敗'}`);
      }
    }
    return parts.join(' / ') || '対象なし';
  }

  // -----------------------------------------
  // 公開
  // -----------------------------------------
  window.migrateDataUrls = {
    scanTargets,
    runCarMigration,
    runStaffMigration,
    runAll,
    summarize,
  };

  console.log('[migrate-data-urls] ready');
})();
