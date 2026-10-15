// ========================================
// num-list.js (v2.16.1)
// 管理番号リスト：KM-XXXX の使用状況を一覧表示＋重複検出
// ----------------------------------------
// データソース：
//   cars         （在庫中 / 売約済 / その他 / オーダー）
//   archivedCars （納車完了）
//   deletedCars  （正式削除）
//
//   欠番：min〜max の間で、どこにも存在しない番号
//   重複：同じ番号に複数件マッチした番号
//
// 「重複扱い」フラグ（isDuplicate:true）：
//   ユーザーが手動で「これは間違い登録」と印を付けた行。
//   - 次の番号計算からは除外（無かったことに）
//   - 表示には残す（薄表示＋badge）
// ========================================
(function () {
  'use strict';

  function _escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _fmtDateStr(v) {
    if (!v) return '';
    if (typeof v === 'string') return v.slice(0, 10);
    if (v && typeof v.toDate === 'function') {
      const d = v.toDate();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    if (v instanceof Date) {
      return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
    }
    return '';
  }

  function _statusOfCar(c) {
    if (!c) return { key: 'unknown', label: '不明', color: '' };
    if (c.col === 'other') return { key: 'other', label: 'その他', color: 'gray' };
    if (c.isOrder || c.col === 'order') return { key: 'order', label: 'オーダー', color: 'purple' };
    if (c.contract === true) return { key: 'contract', label: '売約済', color: 'yellow' };
    return { key: 'stock', label: '在庫中', color: 'blue' };
  }

  function _dateOfCar(c, status) {
    if (!c) return '';
    if (status.key === 'contract') return _fmtDateStr(c.contractDate) || _fmtDateStr(c.purchaseDate);
    return _fmtDateStr(c.purchaseDate);
  }
  function _dateOfArchived(c) {
    if (!c) return '';
    return _fmtDateStr(c.deliveryDate) || _fmtDateStr(c.archivedAt) || _fmtDateStr(c.contractDate);
  }
  function _dateOfDeleted(d) {
    return _fmtDateStr(d && d.deletedAt);
  }

  // 1件分のエントリを作る共通関数
  function _entryFromCar(c, source) {
    if (source === 'cars') {
      const st = _statusOfCar(c);
      return { source: 'cars', record: c, status: st, date: _dateOfCar(c, st) };
    }
    if (source === 'archived') {
      return { source: 'archived', record: c, status: { key: 'archived', label: '納車完了', color: 'green' }, date: _dateOfArchived(c) };
    }
    if (source === 'manual') {
      return { source: 'manual', record: c, status: { key: 'manual', label: '手入力', color: 'amber' }, date: _fmtDateStr(c.createdAt) };
    }
    return { source: 'deleted', record: c, status: { key: 'deleted', label: '削除済', color: 'red' }, date: _dateOfDeleted(c) };
  }

  // 番号 → [entry, entry, ...] の多重インデックス（重複保持）
  function _buildIndex() {
    const idx = {};
    function add(arr, source) {
      if (!Array.isArray(arr)) return;
      arr.forEach(c => {
        if (!c) return;
        const n = window.numHelpers.parseNum(c.num);
        if (n === null) return;
        if (!idx[n]) idx[n] = [];
        idx[n].push(_entryFromCar(c, source));
      });
    }
    add(cars, 'cars');
    add(archivedCars, 'archived');
    add(deletedCars, 'deleted');
    add(manualNumbers, 'manual');
    return idx;
  }

  // 集計
  function _summary(idx) {
    const sum = { stock: 0, contract: 0, archived: 0, deleted: 0, other: 0, order: 0, manual: 0, gap: 0, dup: 0, dupMarked: 0 };
    let max = 0;
    Object.keys(idx).forEach(k => {
      const n = +k;
      const list = idx[k];
      // 重複扱い済みは max 計算から除外
      const liveList = list.filter(e => !(e.record && e.record.isDuplicate === true));
      if (liveList.length > 0 && n > max) max = n;
      // 重複検出（liveList が2件以上）
      if (liveList.length > 1) sum.dup += liveList.length;
      // 重複扱い済みカウント
      list.forEach(e => {
        if (e.record && e.record.isDuplicate === true) {
          sum.dupMarked++;
        } else {
          const st = e.status.key;
          if (sum[st] !== undefined) sum[st]++;
        }
      });
    });
    if (max > 0) {
      for (let i = 1; i <= max; i++) {
        const list = idx[i];
        const live = list ? list.filter(e => !(e.record && e.record.isDuplicate === true)) : [];
        if (live.length === 0) sum.gap++;
      }
    }
    return { sum: sum, max: max };
  }

  // 行のクリック動作（cars のみ車両詳細を開く）
  function _rowOnClick(entry) {
    if (!entry || !entry.record) return '';
    if (entry.source === 'cars') {
      const id = _escHtml(entry.record.id);
      return `onclick="event.target.closest('.nl-mark-btn')||openDetail('${id}')"`;
    }
    return '';
  }

  function _badgeClass(status) {
    return 'nl-badge nl-badge-' + (status.color || 'gray');
  }

  // ---------- 重複扱いフラグの保存 ----------
  // source: 'cars'|'archived'|'deleted', isDup: true/false
  window.numListMarkDup = function (id, source, isDup) {
    if (!id || !source) return;
    /* 🔐 v3.16.4（S-48）番号の重複扱いは車両情報＝作業者・閲覧は変えられない（サーバーのルールと同じ線） */
    if (typeof hasPermission === 'function' && !hasPermission('canEditCarInfo')) {
      if (typeof showToast === 'function') showToast('この操作はあなたの権限ではできません', 'CF-0027');
      return;
    }
    isDup = !!isDup;
    let arr = null;
    if (source === 'cars')     arr = cars;
    if (source === 'archived') arr = archivedCars;
    if (source === 'deleted')  arr = deletedCars;
    if (!arr) return;
    const rec = arr.find(c => String(c.id) === String(id));
    if (!rec) return;
    rec.isDuplicate = isDup;

    // Firestore に保存
    try {
      if (source === 'cars' && window.dbCars && window.dbCars.saveCarField) {
        window.dbCars.saveCarField(id, ['isDuplicate'], isDup);   // v3.0.0 場所は配列で渡す（前は文字列で、保存されずに素通りしていた）
      } else if (source === 'archived' && window.dbArchive && window.dbArchive.saveArchivedCar) {
        window.dbArchive.saveArchivedCar({ id: id, isDuplicate: isDup });
      } else if (source === 'deleted' && window.dbDeleted && window.dbDeleted.saveDeletedCar) {
        window.dbDeleted.saveDeletedCar({ id: id, num: rec.num || '', maker: rec.maker || '', model: rec.model || '', grade: rec.grade || '', isDuplicate: isDup });
      }
    } catch (e) {
      console.error('[num-list] markDup save failed', e);
      if (typeof showToast === 'function') showToast('重複扱いの保存に失敗しました', 'CF-1006');
    }

    if (typeof showToast === 'function') {
      showToast(isDup ? '重複扱いにしました' : '重複扱いを解除しました');
    }
    renderNumList();
  };

  // ---------- 手入力フォームの開閉状態 ----------
  let _addFormOpen = false;
  window.numListToggleAddForm = function () {
    _addFormOpen = !_addFormOpen;
    renderNumList();
    // フォームを開いた直後は番号欄にフォーカス
    if (_addFormOpen) {
      setTimeout(() => {
        const el = document.getElementById('nl-add-num');
        if (el) el.focus();
      }, 50);
    }
  };

  // ---------- 手入力レコードの追加・削除 ----------
  function _genManualId() {
    return 'manual-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* 🔴 v3.16.9 二度押し止め（保存と番号の書類を待つ間に、同じ番号が2件入らないように） */
  let _addBusy = false;
  window.numListAddManual = async function () {
    if (_addBusy) return;
    _addBusy = true;
    const b = document.querySelector('.nl-add-btn');
    if (b) b.disabled = true;
    try { return await _numListAddManualBody(); }
    finally { _addBusy = false; if (b) b.disabled = false; }
  };
  async function _numListAddManualBody() {
    const numInp   = document.getElementById('nl-add-num');
    const modelInp = document.getElementById('nl-add-model');
    const gradeInp = document.getElementById('nl-add-grade');
    const noteInp  = document.getElementById('nl-add-note');
    if (!numInp || !modelInp) return;

    const num   = (numInp.value || '').trim();
    const model = (modelInp.value || '').trim();
    const grade = (gradeInp ? gradeInp.value : '').trim();
    const note  = (noteInp ? noteInp.value : '').trim();

    if (!num) { if (typeof showToast === 'function') showToast('管理番号を入れてください', 'CF-1007'); return; }
    if (!model) { if (typeof showToast === 'function') showToast('車種を入れてください', 'CF-1008'); return; }

    const n = window.numHelpers.parseNum(num);
    if (n === null) { if (typeof showToast === 'function') showToast('管理番号の形式が不正です', 'CF-1009'); return; }
    const formattedNum = window.numHelpers.formatNum(n);

    // 既存番号チェック
    const dup = window.numHelpers.findDuplicate(formattedNum, null);
    if (dup) {
      const r = dup.record || {};
      const labelMap = { cars: '在庫中', archived: 'アーカイブ済', deleted: '削除済', manual: '手入力' };
      const ok = await cfAsk(
        '⚠ 超確認：' + formattedNum + ' は既に存在します。',
        { detail: (labelMap[dup.source] || dup.source) + '：' +
          (r.maker || '') + ' ' + (r.model || '') + ' ' + (r.grade || '') + '\n\n' +
          'それでも追加しますか？（重複として 🚨 表示されます）', ok: '追加する', danger: true }
      );
      if (!ok) return;
    }

    const rec = {
      id: _genManualId(),
      num: formattedNum,
      model: model,
      grade: grade,
      note: note,
    };

    /* 🔴 v3.16.7（棚卸し B-13）保存の結果を待ってから「追加しました」。前は待たずに出していた（失敗しても成功に見えた） */
    if (window.dbManual && window.dbManual.saveManualNumber) {
      try {
        await window.dbManual.saveManualNumber(rec);
      } catch (e) {
        console.error('[num-list] manual save failed', e);
        if (typeof showToast === 'function') showToast(formattedNum + ' を追加できませんでした（通信または権限を確認してください）', 'CF-1027');
        return;
      }
    }
    manualNumbers.push(rec);
    /* v3.16.7（A-34）手で使った番号も会社の番号の書類に入れる（自動の番号があとでぶつからないように） */
    if (window.numHelpers && window.numHelpers.claimNum) { try { await window.numHelpers.claimNum(formattedNum, { auto: false }); } catch (e) {} }
    /* 📝 v3.16.7（⑧）手入力の番号も操作ログに1行 */
    if (typeof addAuditLog === 'function') addAuditLog('管理番号を手入力で追加（' + model + (grade ? ' ' + grade : '') + (note ? '・' + note : '') + '）', formattedNum);
    // フォームクリア
    numInp.value = ''; modelInp.value = '';
    if (gradeInp) gradeInp.value = '';
    if (noteInp) noteInp.value = '';
    if (typeof showToast === 'function') showToast(formattedNum + ' を追加しました');
    renderNumList();
  }

  window.numListDeleteManual = async function (id) {
    if (!id) return;
    if (!(await cfAsk('この手入力レコードを削除します。元に戻せません。よろしいですか？', { ok: '削除する', danger: true }))) return;
    const idx = manualNumbers.findIndex(m => String(m.id) === String(id));
    if (idx < 0) return;
    const removed = manualNumbers[idx];
    /* 🔴 v3.16.7（棚卸し B-13）消せたのを確かめてから画面から外し「削除しました」。
       前は結果を待たずに出していた＝消せていなくても消えたように見え、開き直すと戻っていた */
    if (window.dbManual && window.dbManual.deleteManualNumber) {
      try {
        await window.dbManual.deleteManualNumber(id);
      } catch (e) {
        console.error('[num-list] manual delete failed', e);
        if (typeof showToast === 'function') showToast((removed.num || '手入力') + ' を削除できませんでした（通信または権限を確認してください）', 'CF-1028');
        return;
      }
    }
    const i2 = manualNumbers.findIndex(m => String(m.id) === String(id));
    if (i2 >= 0) manualNumbers.splice(i2, 1);
    /* 📝 v3.16.7（⑧）消す前の中身を操作ログに残す（番号・車種・グレード・メモ） */
    if (typeof addAuditLog === 'function') addAuditLog('手入力の管理番号を削除（' + (removed.model || '') + (removed.grade ? ' ' + removed.grade : '') + (removed.note ? '・' + removed.note : '') + '）', removed.num || '—');
    if (typeof showToast === 'function') showToast((removed.num || '手入力') + ' を削除しました');
    renderNumList();
  };

  function renderNumList() {
    const panel = document.getElementById('panel-numlist');
    if (!panel) return;
    if (!window.numHelpers) {
      panel.innerHTML = '<div class="panel-title">管理番号リスト</div><div class="panel-sub">起動中…</div>';
      return;
    }
    const idx = _buildIndex();
    const { sum, max } = _summary(idx);
    const nextStr = window.numHelpers.nextNum();
    const maxStr = max > 0 ? window.numHelpers.formatNum(max) : 'なし';

    // 重複が複数件ある番号の集合（liveList >= 2）
    const dupNumbers = new Set();
    Object.keys(idx).forEach(k => {
      const live = idx[k].filter(e => !(e.record && e.record.isDuplicate === true));
      if (live.length > 1) dupNumbers.add(+k);
    });

    const rows = [];
    for (let n = max; n >= 1; n--) {
      const list = idx[n] || [];
      if (list.length === 0) {
        const numStr = window.numHelpers.formatNum(n);
        rows.push(
          '<tr class="nl-row nl-gap">' +
            '<td class="nl-num">' + _escHtml(numStr) + '</td>' +
            '<td>―</td><td>―</td>' +
            '<td><span class="nl-badge nl-badge-gap">欠番</span></td>' +
            '<td class="nl-date">―</td>' +
            '<td></td>' +
          '</tr>'
        );
        continue;
      }
      // 同じ番号の複数エントリを並べる
      list.forEach((entry, idxInGroup) => {
        const r = entry.record;
        const numStr = window.numHelpers.formatNum(n);
        const isDupGroup = dupNumbers.has(n);
        const isMarked = r && r.isDuplicate === true;
        const clickAttr = isMarked ? '' : _rowOnClick(entry);
        const cls = [
          'nl-row',
          clickAttr ? 'nl-clickable' : '',
          isDupGroup ? 'nl-dup' : '',
          isMarked ? 'nl-marked-dup' : '',
        ].filter(Boolean).join(' ');

        // 重複バッジ（複数エントリのうち2件目以降は番号セルにバッジ）
        const numCell = idxInGroup === 0
          ? _escHtml(numStr) + (isDupGroup ? ' <span class="nl-dup-mark" title="重複あり">'+ic('siren','🚨',16)+'</span>' : '')
          : '<span class="nl-num-sub">↳ ' + _escHtml(numStr) + '</span>';

        // 結果バッジ
        let statusHTML = '<span class="' + _badgeClass(entry.status) + '">' + _escHtml(entry.status.label) + '</span>';
        if (isMarked) {
          statusHTML += ' <span class="nl-badge nl-badge-marked">重複扱い</span>';
        }

        // アクション（重複扱いトグル＋手入力削除）
        let actionHTML = '';
        if (entry.source === 'manual') {
          actionHTML = '<button class="nl-mark-btn nl-mark-undo" onclick="window.numListDeleteManual(\'' + _escHtml(r.id) + '\')">削除</button>';
        } else if (isDupGroup || isMarked) {
          if (isMarked) {
            actionHTML = '<button class="nl-mark-btn nl-mark-undo" onclick="window.numListMarkDup(\'' + _escHtml(r.id) + '\',\'' + _escHtml(entry.source) + '\',false)">解除</button>';
          } else {
            actionHTML = '<button class="nl-mark-btn" onclick="window.numListMarkDup(\'' + _escHtml(r.id) + '\',\'' + _escHtml(entry.source) + '\',true)">重複扱い</button>';
          }
        }

        // 手入力の場合は note を補助表示
        const noteHTML = (entry.source === 'manual' && r.note)
          ? '<span class="nl-note">（' + _escHtml(r.note) + '）</span>'
          : '';

        rows.push(
          '<tr class="' + cls + '" ' + clickAttr + '>' +
            '<td class="nl-num">' + numCell + '</td>' +
            '<td>' + _escHtml(r.maker || '') + ' ' + _escHtml(r.model || '') + noteHTML + '</td>' +
            '<td>' + _escHtml(r.grade || '') + '</td>' +
            '<td>' + statusHTML + '</td>' +
            '<td class="nl-date">' + _escHtml(entry.date || '') + '</td>' +
            '<td class="nl-action">' + actionHTML + '</td>' +
          '</tr>'
        );
      });
    }

    const addFormHTML = _addFormOpen
      ? (
        '<div class="nl-add-row">' +
          '<div class="nl-add-title-row">' +
            '<div class="nl-add-title">＋ 管理番号を手入力で追加 <span class="nl-add-sub">（穴埋め・微調整用。実業務には影響なし）</span></div>' +
            '<button class="nl-add-close" onclick="window.numListToggleAddForm()" title="閉じる">'+ic('close','✕',15)+'</button>' +
          '</div>' +
          '<div class="nl-add-fields">' +
            '<input id="nl-add-num"   class="nl-add-inp nl-add-inp-num"   type="text" placeholder="KM-0000"  autocomplete="off">' +
            '<input id="nl-add-model" class="nl-add-inp"                  type="text" placeholder="車種"     autocomplete="off">' +
            '<input id="nl-add-grade" class="nl-add-inp nl-add-inp-grade" type="text" placeholder="グレード（任意）" autocomplete="off">' +
            '<input id="nl-add-note"  class="nl-add-inp nl-add-inp-note"  type="text" placeholder="メモ（任意）" autocomplete="off">' +
            '<button class="nl-add-btn" onclick="window.numListAddManual()">＋ 追加</button>' +
          '</div>' +
        '</div>'
      )
      : (
        '<div class="nl-add-collapsed">' +
          '<button class="nl-add-toggle" onclick="window.numListToggleAddForm()">＋ 管理番号を手入力で追加</button>' +
          '<span class="nl-add-collapsed-hint">穴埋め・微調整用（通常は使いません）</span>' +
        '</div>'
      );

    panel.innerHTML =
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px">' +
        '<div><div class="panel-title">管理番号リスト</div>' +
          '<div class="panel-sub">全管理番号の使用状況。在庫中・売約済はクリックで詳細を開きます。重複は '+ic('siren','🚨',16)+' マークで表示。</div></div>' +
      '</div>' +
      '<div class="nl-summary">' +
        '<div class="nl-sum-box"><div class="nl-sum-label">最大番号</div><div class="nl-sum-val">' + _escHtml(maxStr) + '</div></div>' +
        '<div class="nl-sum-box"><div class="nl-sum-label">次の番号</div><div class="nl-sum-val nl-sum-next">' + _escHtml(nextStr) + '</div></div>' +
        '<div class="nl-sum-box"><div class="nl-sum-label">在庫中</div><div class="nl-sum-val">' + sum.stock + '</div></div>' +
        '<div class="nl-sum-box"><div class="nl-sum-label">売約済</div><div class="nl-sum-val">' + sum.contract + '</div></div>' +
        '<div class="nl-sum-box"><div class="nl-sum-label">納車完了</div><div class="nl-sum-val">' + sum.archived + '</div></div>' +
        '<div class="nl-sum-box"><div class="nl-sum-label">削除済</div><div class="nl-sum-val">' + sum.deleted + '</div></div>' +
        (sum.other ? '<div class="nl-sum-box"><div class="nl-sum-label">その他</div><div class="nl-sum-val">' + sum.other + '</div></div>' : '') +
        (sum.order ? '<div class="nl-sum-box"><div class="nl-sum-label">オーダー</div><div class="nl-sum-val">' + sum.order + '</div></div>' : '') +
        (sum.manual ? '<div class="nl-sum-box"><div class="nl-sum-label">手入力</div><div class="nl-sum-val">' + sum.manual + '</div></div>' : '') +
        '<div class="nl-sum-box"><div class="nl-sum-label">欠番</div><div class="nl-sum-val">' + sum.gap + '</div></div>' +
        '<div class="nl-sum-box nl-sum-warn"><div class="nl-sum-label">'+ic('siren','🚨',16)+'重複</div><div class="nl-sum-val">' + sum.dup + '</div></div>' +
        (sum.dupMarked ? '<div class="nl-sum-box"><div class="nl-sum-label">重複扱い</div><div class="nl-sum-val">' + sum.dupMarked + '</div></div>' : '') +
      '</div>' +
      addFormHTML +
      '<div class="panel-card nl-card">' +
        '<table class="nl-table">' +
          '<thead><tr>' +
            '<th class="nl-num">管理番号</th>' +
            '<th>車種</th>' +
            '<th>グレード</th>' +
            '<th>結果</th>' +
            '<th class="nl-date">日付</th>' +
            '<th class="nl-action"></th>' +
          '</tr></thead>' +
          '<tbody>' + rows.join('') + '</tbody>' +
        '</table>' +
      '</div>' +
      _trashHtml();
  }

  /* ============================================================
     🗑 v3.16.0（棚卸し S-19）ゴミ箱＝消した車・仮登録に戻した車（db-deleted.js の頭を読む）
     ・［元に戻す］車を消せる人（canDeleteCars）。中身（価格・見積・フロー・チェック）ごと在庫に戻る
     ・［完全に消す］マスターだけ。中身・写真・見積PDF を消す（番号台帳の行は残る）
     ⚠ 見た目は管理番号リストの表をそのまま借りる（新しく作らない）
     ============================================================ */
  const TRASH_MODE = { formal: '正式に削除', cancel: '取り消し', revert: '仮登録に戻した' };
  function _trashHtml() {
    const list = (typeof trashCars !== 'undefined' && Array.isArray(trashCars)) ? trashCars.slice() : [];
    const ts = r => { const v = r && r.deletedAt; return (v && typeof v.toMillis === 'function') ? v.toMillis() : 0; };
    list.sort((a, b) => ts(b) - ts(a));
    const canRestore = (typeof hasPermission === 'function') ? (hasPermission('canDeleteCars') && hasPermission('canCreateCar')) : false;   /* v3.16.2 戻す＝車を作り直す＝両方の権限がある人だけ */
    const isMaster = (typeof _isCarflowMaster === 'function') ? _isCarflowMaster() : false;
    let body;
    if (!list.length) {
      body = '<tr class="nl-row"><td colspan="6" class="nl-date">ゴミ箱は空です</td></tr>';
    } else {
      body = list.map(r => {
        const t = r.trash || {};
        let act = '';
        if (canRestore) act += '<button class="nl-mark-btn nl-mark-undo" onclick="window.numListRestoreTrash(\'' + _escHtml(r.id) + '\')">元に戻す</button>';
        if (isMaster) act += ' <button class="nl-mark-btn" onclick="window.numListPurgeTrash(\'' + _escHtml(r.id) + '\')">完全に消す</button>';
        return '<tr class="nl-row">' +
          '<td class="nl-num">' + _escHtml(r.num || t.num || '―') + '</td>' +
          '<td data-cf-noen>' + _escHtml(r.maker || t.maker || '') + ' ' + _escHtml(r.model || t.model || '') + '</td>' +
          '<td>' + _escHtml(TRASH_MODE[r.mode] || '削除') + '</td>' +
          '<td data-cf-noen>' + _escHtml(r.deletedByName || '') + '</td>' +
          '<td class="nl-date">' + _escHtml(_fmtDateStr(r.deletedAt)) + '</td>' +
          '<td class="nl-action">' + act + '</td>' +
        '</tr>';
      }).join('');
    }
    return '<div class="panel-title" style="margin-top:18px">ゴミ箱</div>' +
      '<div class="panel-sub">消した車・仮登録に戻した車。中身ごと元に戻せます。</div>' +
      '<div class="panel-card nl-card"><table class="nl-table">' +
        '<thead><tr><th class="nl-num">管理番号</th><th>車種</th><th>消し方</th><th>消した人</th><th class="nl-date">消した日</th><th class="nl-action"></th></tr></thead>' +
        '<tbody>' + body + '</tbody></table></div>';
  }

  let _trashBusy = false;
  window.numListRestoreTrash = async function (id) {
    if (!id || _trashBusy || !window.dbDeleted || !window.dbDeleted.restoreFromTrash) return;
    if (typeof hasPermission === 'function' && !(hasPermission('canDeleteCars') && hasPermission('canCreateCar'))) return;
    const r = (typeof trashCars !== 'undefined' ? trashCars : []).find(x => String(x.id) === String(id));
    if (!r) return;
    if ((typeof cars !== 'undefined') && cars.some(c => c && String(c.id) === String(id))) {
      if (typeof showToast === 'function') showToast('この車はもう在庫にあります');
      return;
    }
    /* 🔴 v3.16.1 番号を使い直した後で戻すと、同じ番号が2台になる。戻す前に今の番号を確かめ、
       ぶつかる時は止めて理由を出し、新しい番号を振って戻すかを選んでもらう（黙って2台にしない） */
    const num = r.num || (r.trash && r.trash.num) || '';
    let newNum = null;
    const dup = (num && window.numHelpers && window.numHelpers.findDuplicate) ? window.numHelpers.findDuplicate(num, id) : null;
    if (dup) {
      const where = { cars: '在庫', archived: '販売実績', deleted: '削除済の台帳', manual: '手入力の番号' }[dup.source] || dup.source;
      const who = ((dup.record && dup.record.maker) || '') + ' ' + ((dup.record && dup.record.model) || '');
      const next = window.numHelpers.nextNum();
      if (!(await cfAsk(num + ' は今、ほかの車（' + where + '：' + who.trim() + '）が使っています。',
        { detail: 'このまま戻すと同じ番号が2台になります。\n新しい番号（いまなら ' + next + '）を振って戻しますか？', ok: '新しい番号で戻す', cancel: '戻さない' }))) {
        if (typeof showToast === 'function') showToast('戻すのをやめました（同じ番号が2台にならないよう止めました）', 'CF-1019');
        return;
      }
      newNum = next;
      /* 🔴 v3.16.7（A-34）新しい番号も会社の番号の書類から取る（2台同時に戻しても同じ番号にならない） */
      if (window.numHelpers.claimNum) {
        try { const cr = await window.numHelpers.claimNum(next, { auto: true }); if (cr && cr.num) newNum = cr.num; } catch (e) {}
      }
    } else if (!(await cfAsk(num + ' ' + (r.maker || '') + ' ' + (r.model || '') + ' を在庫に戻します。よろしいですか？', { ok: '戻す' }))) return;
    _trashBusy = true;
    try {
      const car = await window.dbDeleted.restoreFromTrash(id, newNum ? { num: newNum } : null);
      if (car && typeof cars !== 'undefined' && !cars.some(c => c && String(c.id) === String(id))) cars.push(car);
      if (typeof showToast === 'function') showToast(newNum ? (num + ' を ' + newNum + ' に振り直して在庫に戻しました') : (num + ' を在庫に戻しました'));
      if (typeof renderAll === 'function') renderAll();
      if (typeof renderDashboard === 'function') renderDashboard();
    } catch (e) {
      console.error('[num-list] ゴミ箱から戻せませんでした', e);
      if (typeof showToast === 'function') showToast('ゴミ箱から戻せませんでした（通信または権限を確認してください）', 'CF-1017');
    } finally {
      _trashBusy = false;
      renderNumList();
    }
  };
  window.numListPurgeTrash = async function (id) {
    if (!id || _trashBusy || !window.dbDeleted || !window.dbDeleted.purgeTrash) return;
    if (!((typeof _isCarflowMaster === 'function') && _isCarflowMaster())) return;
    const r = (typeof trashCars !== 'undefined' ? trashCars : []).find(x => String(x.id) === String(id));
    if (!r) return;
    if (!(await cfAsk((r.num || '') + ' ' + (r.maker || '') + ' ' + (r.model || '') + ' をゴミ箱から完全に消します。\n写真・見積PDF も消え、元に戻せません。よろしいですか？', { ok: '完全に消す', danger: true }))) return;
    _trashBusy = true;
    try {
      await window.dbDeleted.purgeTrash(id);
      if (typeof addAuditLog === 'function') addAuditLog('ゴミ箱から完全に消した（' + (r.maker || '') + ' ' + (r.model || '') + '）', r.num || '—');
      if (typeof showToast === 'function') showToast('完全に消しました');
    } catch (e) {
      console.error('[num-list] ゴミ箱から消せませんでした', e);
      if (typeof showToast === 'function') showToast('ゴミ箱から消せませんでした', 'CF-1018');
    } finally {
      _trashBusy = false;
      renderNumList();
    }
  };

  window.renderNumList = renderNumList;
})();
