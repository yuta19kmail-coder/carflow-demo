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
        window.dbCars.saveCarField(id, 'isDuplicate', isDup);
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

  window.numListAddManual = function () {
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
      const ok = confirm(
        '⚠ 超確認：' + formattedNum + ' は既に存在します。\n\n' +
        '  ' + (labelMap[dup.source] || dup.source) + '：' +
        (r.maker || '') + ' ' + (r.model || '') + ' ' + (r.grade || '') + '\n\n' +
        'それでも追加しますか？（重複として 🚨 表示されます）'
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

    // ローカル即時反映
    manualNumbers.push(rec);
    // Firestore 保存
    if (window.dbManual && window.dbManual.saveManualNumber) {
      window.dbManual.saveManualNumber(rec).catch(e => console.error('[num-list] manual save failed', e));
    }
    // フォームクリア
    numInp.value = ''; modelInp.value = '';
    if (gradeInp) gradeInp.value = '';
    if (noteInp) noteInp.value = '';
    if (typeof showToast === 'function') showToast(formattedNum + ' を追加しました');
    renderNumList();
  };

  window.numListDeleteManual = function (id) {
    if (!id) return;
    if (!confirm('この手入力レコードを削除します。元に戻せません。よろしいですか？')) return;
    const idx = manualNumbers.findIndex(m => String(m.id) === String(id));
    if (idx < 0) return;
    const removed = manualNumbers[idx];
    manualNumbers.splice(idx, 1);
    if (window.dbManual && window.dbManual.deleteManualNumber) {
      window.dbManual.deleteManualNumber(id).catch(e => console.error('[num-list] manual delete failed', e));
    }
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
      '</div>';
  }

  window.renderNumList = renderNumList;
})();
