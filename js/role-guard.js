// ========================================
// role-guard.js (v1.5.7〜)
// ロールに応じて UI を切り替えるガード。
// ----------------------------------------
// _applyRoleVisibility() を auth.js のログイン直後に呼ぶ。
// 車両詳細モーダルの「編集」ボタンは MutationObserver で動的に隠す。
//
// 5ロール体制（v1.5.7）：
//   admin    : 全権限
//   manager  : 全権限（admin と同等）
//   staff    : 車両管理＋作業すべて可（テンプレ編集・設定・削除・締め・招待 NG）
//   worker   : チェック作業のみ可（車両情報の編集・新規登録・列移動 NG）
//   viewer   : 閲覧のみ
// v1.8.10: 編集モード時の car-save-other-btn を確実に隠す
// ========================================

(function () {
  'use strict';

  function _can(perm) {
    return (typeof hasPermission === 'function') ? hasPermission(perm) : true;
  }

  function _setVisibility(el, show) {
    if (!el) return;
    el.style.display = show ? '' : 'none';
  }

  function _applyRoleVisibility() {
    const newCarItem = Array.from(document.querySelectorAll('.sb-item'))
      .find(el => el.textContent && el.textContent.includes('新規車両登録'));
    _setVisibility(newCarItem, _can('canCreateCar'));

    _setVisibility(document.getElementById('si-close'), _can('canCloseMonth'));

    const role = (window.fb && window.fb.currentStaff && window.fb.currentStaff.role) || '';
    document.body.classList.remove('role-admin', 'role-manager', 'role-staff', 'role-worker', 'role-viewer');
    if (role) document.body.classList.add('role-' + role);

    document.querySelectorAll('[data-perm]').forEach(el => {
      const perms = (el.getAttribute('data-perm') || '').split('+').map(s => s.trim()).filter(Boolean);
      const ok = perms.every(p => _can(p));
      _setVisibility(el, ok);
    });
  }

  window._applyRoleVisibility = _applyRoleVisibility;

  // 車両詳細モーダルの「✏️ 車両詳細を編集」ボタンを動的に隠す
  function _setupDetailModalGuard() {
    const modal = document.getElementById('modal-detail');
    if (!modal) return;
    const observer = new MutationObserver(() => {
      if (_can('canEditCarInfo')) return;
      modal.querySelectorAll('button, a, div[onclick]').forEach(btn => {
        const t = btn.textContent || '';
        if (/車両詳細を編集|✏️\s*編集|🗑️|削除/.test(t)) {
          btn.style.display = 'none';
        }
      });
    });
    observer.observe(modal, { childList: true, subtree: true, characterData: true });
  }

  // 車両モーダル（新規/編集）：worker/viewer なら開けても保存ボタンを隠す
  function _setupCarModalGuard() {
    const modal = document.getElementById('modal-car');
    if (!modal) return;
    const observer = new MutationObserver(() => {
      if (!modal.classList.contains('open')) return;
      const can = _can('canEditCarInfo');
      ['car-save-btn', 'car-save-other-btn', 'edit-delete-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        // v1.8.10: 「その他として登録」は新規登録専用。編集中は隠したまま
        if (id === 'car-save-other-btn'
            && typeof editingCarId !== 'undefined' && editingCarId) {
          el.style.setProperty('display', 'none', 'important');
          return;
        }
        el.style.display = can ? '' : 'none';
      });
      const dz = document.getElementById('edit-danger-zone');
      if (dz) {
        const canDel = _can('canDeleteCars');
        dz.style.display = (dz.style.display !== 'none' && canDel) ? '' : 'none';
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      _setupDetailModalGuard();
      _setupCarModalGuard();
    });
  } else {
    _setupDetailModalGuard();
    _setupCarModalGuard();
  }

  console.log('[role-guard] ready');
})();


// ========================================
// v1.5.9: ドラッグ開始の権限ガード（document レベル capture）
// ========================================
(function () {
  document.addEventListener('dragstart', function (e) {
    if (typeof hasPermission !== 'function') return;
    if (hasPermission('canMoveCar')) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof showToast === 'function') {
      showToast('この操作はあなたの権限ではできません');
    }
  }, true);
})();
