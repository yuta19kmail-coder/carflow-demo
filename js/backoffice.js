// ========================================
// backoffice.js (v2.1.0〜)
// バックオフィスサイドパネル本体
//
// 設計:
//   - サイドパネル（ダッシュボードと新規車両登録の間）
//   - 上から「当月 / 先月 / 先々月 / それより前」の4段、各段は横スクロール
//   - カードはカンバン風（タスク管理と同等のスタイル）、クリックで openDetail
//   - バックオフィスタスクのチェックはカード詳細モーダル内（car-detail.js）で行う
//
// 表示対象:
//   1) cars のうち col='delivery' or col='done' かつ !c.backofficeCompleted（v2.26.2: オーダー車両も対象に含める）
//   2) archivedCars のうち !c.backofficeCompleted
//   → 納車日（deliveryDate）の年月で 4 段に振り分け
//
// アーカイブ車両クリーンアップ:
//   - cleanupExpiredArchivedPhotos() : archive 後 90 日経過の写真を削除
//   - アプリ起動時（auth.js）と月次締めボタン押下時（archive.js）に呼ばれる
// ========================================

(function () {
  'use strict';

  // ----------------------------------------
  // ヘルパ
  // ----------------------------------------
  function _esc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 当月の 1 日（00:00:00 ローカル）
  function _firstOfMonth(year, monthIdx0) {
    return new Date(year, monthIdx0, 1, 0, 0, 0, 0);
  }

  // 月別グループ分類: 0=当月, 1=先月, 2=先々月, 3=それより前
  function _bucketIndex(deliveryDate) {
    if (!deliveryDate) return 3; // 納車日未設定はとりあえず「それより前」へ
    const d = new Date(deliveryDate);
    if (isNaN(d.getTime())) return 3;
    const now = new Date();
    const cur  = _firstOfMonth(now.getFullYear(), now.getMonth());
    const prev = _firstOfMonth(now.getFullYear(), now.getMonth() - 1);
    const prev2= _firstOfMonth(now.getFullYear(), now.getMonth() - 2);
    const dMonthStart = _firstOfMonth(d.getFullYear(), d.getMonth());
    if (dMonthStart.getTime() >= cur.getTime())  return 0;
    if (dMonthStart.getTime() >= prev.getTime()) return 1;
    if (dMonthStart.getTime() >= prev2.getTime())return 2;
    return 3;
  }

  // 4段ラベル
  function _bucketLabel(idx) {
    const now = new Date();
    const fmt = (y, m) => `${m}月`;
    if (idx === 0) return `当月（${fmt(now.getFullYear(), now.getMonth() + 1)}）`;
    if (idx === 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return `先月（${fmt(d.getFullYear(), d.getMonth() + 1)}）`;
    }
    if (idx === 2) {
      const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return `先々月（${fmt(d.getFullYear(), d.getMonth() + 1)}）`;
    }
    return 'それより前';
  }

  // 対象車両リスト
  function _targetCars() {
    const out = [];
    if (Array.isArray(typeof cars !== 'undefined' ? cars : null)) {
      cars.forEach(c => {
        if (!c) return;
        if (c.backofficeCompleted) return;
        // v2.26.2: オーダー車両も「販売が決まったお客様の車」なので、納車準備/納車完了に来たら書類対象に含める（旧版は除外していた）。
        if (c.col !== 'delivery' && c.col !== 'done') return;
        out.push(c);
      });
    }
    if (Array.isArray(typeof archivedCars !== 'undefined' ? archivedCars : null)) {
      archivedCars.forEach(c => {
        if (!c) return;
        if (c.backofficeCompleted) return;
        // archived 由来をマーク（カードクリック等で挙動を分けるため）
        const copy = Object.assign({}, c, { _fromArchive: true });
        out.push(copy);
      });
    }
    return out;
  }

  // 1段分のラベル＋カード描画
  function _renderBucket(idx, list) {
    // 古い順（古いほど優先・滞留警告）
    list.sort((a, b) => {
      const da = a.deliveryDate ? new Date(a.deliveryDate).getTime() : 0;
      const db = b.deliveryDate ? new Date(b.deliveryDate).getTime() : 0;
      return da - db;
    });
    const label = _bucketLabel(idx);
    const countCls = list.length === 0 ? ' bo-row-empty' : '';
    const isOldRow = idx === 3 ? ' bo-row-old' : '';
    const cards = list.length
      ? list.map(c => _cardWrapHtml(c)).join('')
      : '<div class="bo-row-empty-msg">該当なし</div>';
    return `<div class="bo-row${countCls}${isOldRow}">
      <div class="bo-row-head">
        <span class="bo-row-label">${_esc(label)}</span>
        <span class="bo-row-count">${list.length}台</span>
        ${idx === 3 && list.length > 0 ? '<span class="bo-row-warn">'+ic('warn','⚠',14)+' 3ヶ月以上経過</span>' : ''}
      </div>
      <div class="bo-row-scroll">${cards}</div>
    </div>`;
  }

  // カード（縦長・カンバン風）
  //   購入者名は CarFlow に入力欄がないため非表示（v2.1.0 で削除）
  //   各情報を大きめに表示
  function _cardWrapHtml(car) {
    const photo = car.photo
      ? `<img src="${_esc(car.photo)}" alt="">`
      : (typeof carEmoji === 'function' ? carEmoji(car.size) : '🚗');

    // 納車日（M/D 表記の大きな表示）
    let deliveryBigHtml = '';
    if (car.deliveryDate) {
      const d = new Date(car.deliveryDate);
      if (!isNaN(d.getTime())) {
        deliveryBigHtml = `<div class="bo-card-deliveryday">
          <span class="bo-card-deliveryday-md">${d.getMonth()+1}/${d.getDate()}</span>
          <span class="bo-card-deliveryday-suf">納車</span>
        </div>`;
      }
    }

    // ステータスpill
    let statusPill;
    if (car._fromArchive) {
      statusPill = '<span class="bo-status-pill bo-pill-archived">'+ic('box','📦',16)+' アーカイブ済</span>';
    } else if (car.col === 'done') {
      statusPill = '<span class="bo-status-pill bo-pill-done">'+ic('check','✅',15)+' 納車完了</span>';
    } else {
      statusPill = '<span class="bo-status-pill bo-pill-prep">'+ic('wrench','🔧',16)+' 納車準備中</span>';
    }

    // バックオフィスタスクの進捗（ドット＋％）
    // v2.4.2: workflow 型は backofficeWorkflows ベースで done/partial/none 判定
    const tasks = (typeof getActiveBackofficeTasks === 'function') ? getActiveBackofficeTasks(car) : [];
    const store = car.backofficeTasks || {};
    // 'done'（全完了）/ 'partial'（途中）/ 'none'（未着手）の三値
    function _boTaskState(t) {
      const isChecklistTask = (t.type === 'workflow') ||
        (typeof hasTaskChecklist === 'function' && hasTaskChecklist(t.id, 'backoffice'));
      if (isChecklistTask && typeof window._calcBackofficeWorkflowProgress === 'function') {
        const wp = window._calcBackofficeWorkflowProgress(car, t);
        if (wp.total <= 0) return 'none';
        if (wp.done >= wp.total) return 'done';
        if (wp.done > 0) return 'partial';
        return 'none';
      }
      return store[t.id] === true ? 'done' : 'none';
    }
    const states = tasks.map(_boTaskState);
    const doneCount = states.filter(s => s === 'done').length;
    const totalCount = tasks.length;
    // 部分反映：done=1, partial=0.5 で計算
    const doneUnits = states.reduce((a, s) => a + (s === 'done' ? 1 : s === 'partial' ? 0.5 : 0), 0);
    const dots = tasks.map((t, i) => {
      const s = states[i];
      const cls = s === 'done' ? 'done' : (s === 'partial' ? 'partial' : '');
      return `<span class="bo-card-dot ${cls}" title="${_esc(t.name)}"></span>`;
    }).join('');
    const pct = totalCount > 0 ? Math.round(doneUnits / totalCount * 100) : 0;

    // 価格（総額：緑大、本体：グレー小で併記）
    let priceHtml = '';
    if (typeof fmtPriceTwo === 'function' && (car.totalPrice || car.price)) {
      const pt = fmtPriceTwo(car.totalPrice, car.price);
      const tlt = (typeof getTaxLabel === 'function') ? getTaxLabel('total') : '税込';
      const tlb = (typeof getTaxLabel === 'function') ? getTaxLabel('body')  : '税込';
      const shortT = (tlt === '税抜') ? '抜' : '込';
      const shortB = (tlb === '税抜') ? '抜' : '込';
      if (pt.hasTotal && pt.hasBody) {
        // 総額（緑大）＋本体（グレー小）併記
        priceHtml = `<div class="bo-card-price">
          <div class="bo-card-price-main">
            <span class="bo-card-price-lbl">総額</span>
            <span class="bo-card-price-amt">${pt.totalDisp}</span>
            <span class="bo-card-price-tax">${shortT}</span>
          </div>
          <div class="bo-card-price-sub">
            <span class="bo-card-price-sub-lbl">本体</span>
            <span class="bo-card-price-sub-amt">${pt.bodyDisp}</span>
            <span class="bo-card-price-sub-tax">${shortB}</span>
          </div>
        </div>`;
      } else if (pt.hasTotal) {
        priceHtml = `<div class="bo-card-price"><div class="bo-card-price-main"><span class="bo-card-price-lbl">総額</span><span class="bo-card-price-amt">${pt.totalDisp}</span><span class="bo-card-price-tax">${shortT}</span></div></div>`;
      } else if (pt.hasBody) {
        priceHtml = `<div class="bo-card-price"><div class="bo-card-price-main"><span class="bo-card-price-lbl">本体</span><span class="bo-card-price-amt">${pt.bodyDisp}</span><span class="bo-card-price-tax">${shortB}</span></div></div>`;
      }
    }

    const fromArchiveLit = car._fromArchive ? 'true' : 'false';
    return `<div class="bo-card" onclick="window.backoffice.openDetail('${_esc(car.id)}',${fromArchiveLit})">
      <div class="bo-card-thumb">${photo}</div>
      <div class="bo-card-body">
        <div class="bo-card-maker">${_esc(car.maker || '')}</div>
        <div class="bo-card-model">${_esc(car.model || '')}${car.grade ? ' ' + _esc(car.grade) : ''}</div>
        <div class="bo-card-meta">
          <span class="bo-card-num">${_esc(car.num || '')}</span>
          ${statusPill}
        </div>
        ${priceHtml}
        ${deliveryBigHtml}
        <div class="bo-card-prog">
          <div class="bo-card-prog-row">
            <span class="bo-card-prog-pct">${pct}%</span>
            <span class="bo-card-prog-lbl">事務処理 ${doneCount}/${totalCount}</span>
          </div>
          <div class="bo-card-dots">${dots}</div>
        </div>
      </div>
    </div>`;
  }

  // ----------------------------------------
  // メイン描画
  // ----------------------------------------
  function renderBackoffice() {
    const rows = document.getElementById('bo-rows');
    const total = document.getElementById('bo-total-label');
    if (!rows) return;
    const list = _targetCars();
    if (total) total.textContent = `対応中 ${list.length}台`;

    // 4段に振り分け
    const buckets = [[], [], [], []];
    list.forEach(c => {
      const idx = _bucketIndex(c.deliveryDate);
      buckets[idx].push(c);
    });

    if (!list.length) {
      rows.innerHTML = '<div class="bo-empty">対応待ちのバックオフィスタスクはありません</div>';
      return;
    }
    rows.innerHTML = buckets.map((b, i) => _renderBucket(i, b)).join('');
  }

  // ----------------------------------------
  // カードクリック: バックオフィスモードで詳細を開く
  //   - openDetail(carId, fromArchive, 'backoffice') で表示分岐
  //   - 詳細モーダル内で納車タスクの代わりにバックオフィスタスクを納車と同じUIで描画
  // ----------------------------------------
  function openDetailFromCard(carId, fromArchive) {
    if (typeof openDetail === 'function') {
      openDetail(carId, !!fromArchive, 'backoffice');
    }
  }

  // ----------------------------------------
  // バックオフィスタスクのチェックトグル（car-detail.js から呼ばれる）
  // ----------------------------------------
  function toggleTask(carId, taskId, checked) {
    let car = (typeof cars !== 'undefined' && Array.isArray(cars))
      ? cars.find(c => c && c.id === carId) : null;
    let fromArchive = false;
    if (!car && typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) {
      car = archivedCars.find(c => c && c.id === carId);
      if (car) fromArchive = true;
    }
    if (!car) {
      console.error('[backoffice] car not found', carId);
      return;
    }
    if (!car.backofficeTasks) car.backofficeTasks = {};
    car.backofficeTasks[taskId] = !!checked;
    if (fromArchive) {
      if (window.dbArchive && window.dbArchive.saveArchivedCar) {
        window.dbArchive.saveArchivedCar(car).catch(e => console.error('[backoffice] save archived failed', e));
      }
    } else {
      if (typeof saveCarById === 'function') {
        saveCarById(carId);
      } else if (window.dbCars && window.dbCars.saveCar) {
        window.dbCars.saveCar(car).catch(e => console.error('[backoffice] save failed', e));
      }
    }
    if (typeof addLog === 'function') {
      addLog(carId, `バックオフィス: ${taskId} を ${checked ? '完了' : '未完了'}`);
    }
    // モーダル内のタスクセクションだけ再描画＋パネルがあれば再描画
    // v2.1.0: 詳細モーダルが開いている場合は renderDetailBody で再描画（バックオフィスモード保持）
    if (typeof renderDetailBody === 'function'
        && document.getElementById('modal-detail')
        && document.getElementById('modal-detail').classList.contains('open')) {
      renderDetailBody(car);
    }
    renderBackoffice();
  }

  // ----------------------------------------
  // バックオフィス完了ボタン押下（car-detail.js から呼ばれる）
  // ----------------------------------------
  function markComplete(carId) {
    if (!confirm('バックオフィス処理を完了しますか？\nバックオフィス一覧から消えます（販売実績データは残ります）')) return;
    let car = (typeof cars !== 'undefined' && Array.isArray(cars))
      ? cars.find(c => c && c.id === carId) : null;
    let fromArchive = false;
    if (!car && typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) {
      car = archivedCars.find(c => c && c.id === carId);
      if (car) fromArchive = true;
    }
    if (!car) return;
    car.backofficeCompleted = true;
    car.backofficeCompletedAt = new Date().toISOString();
    if (fromArchive) {
      if (window.dbArchive && window.dbArchive.saveArchivedCar) {
        window.dbArchive.saveArchivedCar(car).catch(e => console.error('[backoffice] save archived failed', e));
      }
    } else {
      if (typeof saveCarById === 'function') {
        saveCarById(carId);
      } else if (window.dbCars && window.dbCars.saveCar) {
        window.dbCars.saveCar(car).catch(e => console.error('[backoffice] save failed', e));
      }
    }
    if (typeof addLog === 'function') {
      addLog(carId, 'バックオフィス処理を完了');
    }
    if (typeof showToast === 'function') {
      showToast('バックオフィス処理を完了しました');
    }
    // v2.1.0: バックオフィス完了後は詳細モーダルを自動で閉じる
    if (typeof closeModal === 'function') {
      closeModal('modal-detail');
    } else {
      const m = document.getElementById('modal-detail');
      if (m) m.classList.remove('open');
    }
    renderBackoffice();
  }

  // ----------------------------------------
  // バックオフィス完了の取り消し（モーダル「完了済み」表示からの復元）
  // ----------------------------------------
  function unmarkComplete(carId) {
    if (!confirm('バックオフィス完了を取り消しますか？\nバックオフィス一覧に戻ります')) return;
    let car = (typeof cars !== 'undefined' && Array.isArray(cars))
      ? cars.find(c => c && c.id === carId) : null;
    let fromArchive = false;
    if (!car && typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) {
      car = archivedCars.find(c => c && c.id === carId);
      if (car) fromArchive = true;
    }
    if (!car) return;
    car.backofficeCompleted = false;
    delete car.backofficeCompletedAt;
    if (fromArchive) {
      if (window.dbArchive && window.dbArchive.saveArchivedCar) {
        window.dbArchive.saveArchivedCar(car).catch(e => console.error('[backoffice] save archived failed', e));
      }
    } else {
      if (typeof saveCarById === 'function') {
        saveCarById(carId);
      } else if (window.dbCars && window.dbCars.saveCar) {
        window.dbCars.saveCar(car).catch(e => console.error('[backoffice] save failed', e));
      }
    }
    if (typeof addLog === 'function') {
      addLog(carId, 'バックオフィス完了を取り消し');
    }
    // v2.1.0: 詳細モーダルが開いている場合は renderDetailBody で再描画（バックオフィスモード保持）
    if (typeof renderDetailBody === 'function'
        && document.getElementById('modal-detail')
        && document.getElementById('modal-detail').classList.contains('open')) {
      renderDetailBody(car);
    }
    renderBackoffice();
  }

  // ----------------------------------------
  // 90 日超え archived 写真クリーンアップ
  // ----------------------------------------
  function cleanupExpiredArchivedPhotos() {
    if (!Array.isArray(typeof archivedCars !== 'undefined' ? archivedCars : null)) return 0;
    const now = Date.now();
    const NINE_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    let deleted = 0;
    archivedCars.forEach(c => {
      if (!c || !c.photo) return;
      if (!c._archivedAt) return;
      const t = new Date(c._archivedAt).getTime();
      if (isNaN(t)) return;
      if (now - t < NINE_DAYS_MS) return;
      c.photo = null;
      deleted++;
      if (window.dbArchive && window.dbArchive.saveArchivedCar) {
        window.dbArchive.saveArchivedCar(c).catch(e => console.error('[backoffice] cleanup save failed', e));
      }
      if (window.dbStorage && window.dbStorage.deleteCarPhoto) {
        window.dbStorage.deleteCarPhoto(c.id).catch(e => console.error('[backoffice] cleanup delete photo failed', e));
      }
      if (typeof addLog === 'function') {
        addLog(c.id, 'archive後3ヶ月経過のため写真を自動削除');
      }
    });
    if (deleted > 0) console.log('[backoffice] cleanup: deleted', deleted, 'expired archived photo(s)');
    return deleted;
  }

  // ----------------------------------------
  // 既存テナント無破壊：backoffice タスクの初期化（保存しない、メモリ上のみ）
  // ----------------------------------------
  function ensureBackofficeTasksObject(car) {
    if (!car) return;
    if (!car.backofficeTasks || typeof car.backofficeTasks !== 'object') {
      car.backofficeTasks = {};
    }
  }


  // ----------------------------------------
  // エクスポート
  // ----------------------------------------
  window.backoffice = {
    render: renderBackoffice,
    openDetail: openDetailFromCard,
    toggleTask,
    markComplete,
    unmarkComplete,
    cleanupExpiredArchivedPhotos,
    ensureBackofficeTasksObject,
  };
  window.renderBackoffice = renderBackoffice;
  window.cleanupExpiredArchivedPhotos = cleanupExpiredArchivedPhotos;
})();
