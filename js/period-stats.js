// ========================================
// period-stats.js (v1.8.83)
// 着地予測 期間別レポート用の集計ロジック
// ----------------------------------------
// 期間モード：'month' / 'half' / 'week'
// 期間ID：
//   month: '0'（その月全体）
//   half:  '1' / '2'（前期 / 後期）
//   week:  '1' / '2' / '3' / '4'（その月の四等分）
// ========================================

(function(){
  'use strict';

  // ===== 日付ユーティリティ =====
  function _zp(n){ return String(n).padStart(2, '0'); }
  function _ymd(y, m, d){ return `${y}-${_zp(m)}-${_zp(d)}`; }
  function _daysInMonth(y, m){ return new Date(y, m, 0).getDate(); }

  // ===== 期間範囲算出 =====
  // 引数：(mode, periodId, year, month)
  // 戻り値：{ start:'YYYY-MM-DD', end:'YYYY-MM-DD' }
  function _periodRange(mode, periodId, year, month){
    const dim = _daysInMonth(year, month);
    if (mode === 'month'){
      return { start: _ymd(year, month, 1), end: _ymd(year, month, dim) };
    }
    if (mode === 'half'){
      const pid = String(periodId);
      if (pid === '1') return { start: _ymd(year, month, 1), end: _ymd(year, month, 15) };
      return { start: _ymd(year, month, 16), end: _ymd(year, month, dim) };
    }
    // week：1〜7, 8〜14, 15〜21, 22〜末
    const pid = parseInt(periodId, 10);
    if (pid === 1) return { start: _ymd(year, month, 1),  end: _ymd(year, month, 7) };
    if (pid === 2) return { start: _ymd(year, month, 8),  end: _ymd(year, month, 14) };
    if (pid === 3) return { start: _ymd(year, month, 15), end: _ymd(year, month, 21) };
    return         { start: _ymd(year, month, 22), end: _ymd(year, month, dim) };
  }

  // ===== 期間ラベル =====
  function _periodLabel(mode, periodId, year, month){
    const r = _periodRange(mode, periodId, year, month);
    const ms = String(month);
    const sd = parseInt(r.start.slice(8,10), 10);
    const ed = parseInt(r.end.slice(8,10), 10);
    if (mode === 'month') return `${ms}月 月次（1〜${ed}日）`;
    if (mode === 'half')  return `${ms}月 ${periodId === '1' ? '前期' : '後期'}（${sd}〜${ed}日）`;
    return `${ms}月 ${periodId}週目（${sd}〜${ed}日）`;
  }

  // ===== 短いラベル（印刷物見出し用） =====
  function _periodShortLabel(mode, periodId, year, month){
    const ms = String(month);
    if (mode === 'month') return `${ms}月 月次 結果`;
    if (mode === 'half')  return `${ms}月 ${periodId === '1' ? '1/2期' : '2/2期'} 結果`;
    return `${ms}月 ${periodId}週目 結果`;
  }

  // ===== 来期判定 =====
  function _nextPeriod(mode, periodId, year, month){
    if (mode === 'month'){
      // 次の月
      let nm = month + 1, ny = year;
      if (nm > 12){ nm = 1; ny++; }
      return { mode:'month', periodId:'0', year:ny, month:nm };
    }
    if (mode === 'half'){
      if (periodId === '1') return { mode:'half', periodId:'2', year, month };
      let nm = month + 1, ny = year;
      if (nm > 12){ nm = 1; ny++; }
      return { mode:'half', periodId:'1', year:ny, month:nm };
    }
    // week
    const pid = parseInt(periodId, 10);
    if (pid < 4) return { mode:'week', periodId:String(pid+1), year, month };
    let nm = month + 1, ny = year;
    if (nm > 12){ nm = 1; ny++; }
    return { mode:'week', periodId:'1', year:ny, month:nm };
  }

  // ===== 今日の日付からデフォルト期間IDを返す（旧API） =====
  // mode に応じて期間IDだけを返す（年月は呼び出し側）
  function _defaultPeriodIdForToday(mode, year, month){
    const r = _defaultPeriodForToday(mode);
    return r.periodId;
  }

  // ===== 今日の日付から「期間ID＋対象年月」を返す（新API） =====
  // 境界日+2日までは前期間を引っ張る（月初2日は前月、半期は17日まで前期、週次は境界後2日まで前週）
  function _defaultPeriodForToday(mode){
    const today = new Date();
    const ty = today.getFullYear();
    const tm = today.getMonth() + 1;
    const td = today.getDate();
    const buffer = 2;

    function _prevMonth(){
      let pm = tm - 1, py = ty;
      if (pm === 0) { pm = 12; py--; }
      return { y: py, m: pm };
    }

    if (mode === 'month'){
      // 月初2日は前月扱い
      if (td <= 1 + buffer - 1){ // 1〜2日
        const pm = _prevMonth();
        return { mode:'month', periodId:'0', year: pm.y, month: pm.m };
      }
      return { mode:'month', periodId:'0', year: ty, month: tm };
    }
    if (mode === 'half'){
      // 月初2日は前月の後期（16〜末）扱い
      if (td <= 2){
        const pm = _prevMonth();
        return { mode:'half', periodId:'2', year: pm.y, month: pm.m };
      }
      // 16日が境界。+2日まで前期を引っ張る → 17日までは前期、18日から後期
      if (td <= 17) return { mode:'half', periodId:'1', year: ty, month: tm };
      return { mode:'half', periodId:'2', year: ty, month: tm };
    }
    // week：境界 1, 8, 15, 22。+2日まで前の週を引っ張る
    if (td <= 2){
      // 月初2日は前月の4週目
      const pm = _prevMonth();
      return { mode:'week', periodId:'4', year: pm.y, month: pm.m };
    }
    if (td <= 9)  return { mode:'week', periodId:'1', year: ty, month: tm };
    if (td <= 16) return { mode:'week', periodId:'2', year: ty, month: tm };
    if (td <= 23) return { mode:'week', periodId:'3', year: ty, month: tm };
    return         { mode:'week', periodId:'4', year: ty, month: tm };
  }

  // ===== プルダウン用 optgroup 構成 =====
  // 戻り値：選択肢配列 [{ group:'...', value:'YYYY-MM:mode:periodId', label:'...' }, ...]
  // value 形式：年月込み（前月分も同じプルダウンに含めるため）
  function _buildPeriodOptions(curYear, curMonth){
    const opts = [];
    function _ym(y, m){ return `${y}-${_zp(m)}`; }
    function _addMonth(y, m, groupLabel){
      opts.push({ group: groupLabel, value: `${_ym(y,m)}:month:0`, label: _periodLabel('month','0', y, m) });
      opts.push({ group: groupLabel, value: `${_ym(y,m)}:half:1`,  label: _periodLabel('half','1',  y, m) });
      opts.push({ group: groupLabel, value: `${_ym(y,m)}:half:2`,  label: _periodLabel('half','2',  y, m) });
      for (let i=1; i<=4; i++){
        opts.push({ group: groupLabel, value: `${_ym(y,m)}:week:${i}`, label: _periodLabel('week', String(i), y, m) });
      }
    }
    _addMonth(curYear, curMonth, `${curMonth}月（今月）`);
    let pm = curMonth - 1, py = curYear;
    if (pm === 0){ pm = 12; py--; }
    _addMonth(py, pm, `${pm}月（前月）`);
    return opts;
  }

  // ===== 選択値 'YYYY-MM:mode:periodId' をパース =====
  function _parsePeriodValue(value){
    const parts = String(value || '').split(':');
    if (parts.length !== 3) return null;
    const ym = parts[0].split('-');
    return {
      year:  parseInt(ym[0], 10),
      month: parseInt(ym[1], 10),
      mode:  parts[1],
      periodId: parts[2],
    };
  }

  // ===== car.exhibitedAt：実体 or 推定 =====
  // 集計対象になる「展示開始日」を返す。null なら集計対象外
  function _carExhibitedAt(car){
    if (!car) return null;
    if (car.exhibitedAt) return car.exhibitedAt;
    // 推定：exhibit/delivery/done のいずれかに到達した車のみ
    if (car.col !== 'exhibit' && car.col !== 'delivery' && car.col !== 'done') return null;
    if (!car.purchaseDate) return null;
    // 推定式：仕入日 + 30日（再生期間想定）
    let est = (typeof dateAddDays === 'function')
      ? dateAddDays(car.purchaseDate, 30)
      : _addDaysFallback(car.purchaseDate, 30);
    // 納車日があれば、納車日より3日以上前にクリップ
    if (car.deliveryDate && est >= car.deliveryDate){
      est = (typeof dateAddDays === 'function')
        ? dateAddDays(car.deliveryDate, -3)
        : _addDaysFallback(car.deliveryDate, -3);
    }
    // 仕入日より前にならない
    if (est < car.purchaseDate) est = car.purchaseDate;
    return est;
  }
  function _addDaysFallback(str, n){
    const d = new Date(str);
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }

  // ===== 期間内判定 =====
  function _inRange(ymdStr, range){
    if (!ymdStr) return false;
    return ymdStr >= range.start && ymdStr <= range.end;
  }

  // ===== 月販目標を期間サイズで均等割り =====
  // 月販目標(台/千円) → 月次=÷1, 半期=÷2, 週次=÷4 四捨五入
  function _periodGoal(mode, periodId, year, month){
    const divisor = (mode === 'month') ? 1 : (mode === 'half') ? 2 : 4;
    let monthlyCount = 10, monthlySalesYen = 0;
    try {
      const goalsBlock = (typeof appSettings !== 'undefined' && appSettings.goals) || {};
      const ymKey = `${year}-${_zp(month)}`;
      const mg = (goalsBlock.monthly && goalsBlock.monthly[ymKey]) || goalsBlock.default || {};
      if (mg.count != null) monthlyCount = Number(mg.count) || 0;
      if (mg.sales != null) monthlySalesYen = Number(mg.sales) || 0;
    } catch(e){}
    return {
      count: Math.round(monthlyCount / divisor),
      salesYen: Math.round(monthlySalesYen / divisor),
    };
  }

  // ===== メイン：期間レポート集計 =====
  // 戻り値：着地予測印刷物に必要な全データ
  function calcPeriodReport(mode, periodId, year, month){
    const range = _periodRange(mode, periodId, year, month);
    const nextP = _nextPeriod(mode, periodId, year, month);
    const nextRange = _periodRange(nextP.mode, nextP.periodId, nextP.year, nextP.month);
    const goal = _periodGoal(mode, periodId, year, month);
    // v1.8.83 fix: typeof チェック付き（IIFE + strict mode で未定義参照を避ける）
    const _carsArr = (typeof cars !== 'undefined' && Array.isArray(cars)) ? cars : [];
    const _archArr = (typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) ? archivedCars : [];
    const allCars = [].concat(_carsArr, _archArr);
    // デバッグログ：データが取れてるかコンソール確認用
    try {
      console.log('[period-stats] calcPeriodReport', mode, periodId, year, month,
        '/ cars:', _carsArr.length, '/ archivedCars:', _archArr.length);
    } catch(_){}

    // ① 仕入：purchaseDate が期間内
    const purchaseList = allCars.filter(c => c.purchaseDate && _inRange(c.purchaseDate, range));

    // ② 店頭展示：_carExhibitedAt が期間内
    const exhibitList = allCars.filter(c => {
      const d = _carExhibitedAt(c);
      return d && _inRange(d, range);
    });

    // ③ 売約：contractDate が期間内
    const contractList = allCars.filter(c => c.contractDate && _inRange(c.contractDate, range));

    // ④ 納車完了：col='done' で deliveryDate が期間内（archivedCarsは全て done 相当）
    const deliveryList = allCars.filter(c => {
      const isDone = c.col === 'done' || c._archivedAt;
      return isDone && c.deliveryDate && _inRange(c.deliveryDate, range);
    });

    // 売上金額（税モード適用）— v1.8.98: 売上計上モードで集計対象切替
    const _amt = (typeof _dashAmount === 'function') ? _dashAmount : (c => Number(c.price)||0);
    const recogMode = (typeof appSettings !== 'undefined' && appSettings.goals && appSettings.goals.revRecog === 'contract') ? 'contract' : 'delivery';
    const salesSourceList = (recogMode === 'contract') ? contractList : deliveryList;
    const salesYen = salesSourceList.reduce((s, c) => s + _amt(c), 0);

    // ⑤ 来期実績：v1.8.98 売上計上モードで切替
    // - delivery：期末時点で contract=1 かつ deliveryDate が来期内
    // - contract：来期に contractDate が予約済みの車（通常はゼロ）
    const nextPeriodCars = (recogMode === 'contract')
      ? _carsArr.filter(c => c.contractDate && _inRange(c.contractDate, nextRange))
      : _carsArr.filter(c => c.contract && c.deliveryDate && _inRange(c.deliveryDate, nextRange));
    const nextPeriodSales = nextPeriodCars.reduce((s, c) => s + _amt(c), 0);

    // v1.8.99: スライド車両（後期・月次・週次の場合に表示）
    // 「期末を過ぎた deliveryDate を持つ売約済み車 = 来月以降に納車する車」
    // 後期：当月末以降の納車予定（=次月以降）
    // 月次：当月末以降の納車予定（=次月以降）
    // 前期：来期=後期があるので、スライドは出さない（nextPeriodCars が「来期」として有効）
    const isLastInUnit = (mode === 'half' && periodId === '2')
                      || (mode === 'month')
                      || (mode === 'week' && periodId === '4');
    let slideList = [];
    let slideSales = 0;
    if (isLastInUnit){
      // 次月の末日まで
      let nm = month + 1, ny = year;
      if (nm > 12){ nm = 1; ny++; }
      const nmEnd = _ymd(ny, nm, _daysInMonth(ny, nm));
      slideList = _carsArr.filter(c =>
        c.contract && c.deliveryDate &&
        c.deliveryDate > range.end &&
        c.deliveryDate <= nmEnd
      );
      slideSales = slideList.reduce((s, c) => s + _amt(c), 0);
    }

    // 暫定：当期実績＋来期予定（後期・月次なら来期=スライド）
    const tentativeBaseCars = isLastInUnit ? slideList : nextPeriodCars;
    const tentativeBaseSales = isLastInUnit ? slideSales : nextPeriodSales;
    const tentativeSales = salesYen + tentativeBaseSales;
    const tentativeCount = salesSourceList.length + tentativeBaseCars.length;

    // 来期分の目標
    const nextGoal = _periodGoal(nextP.mode, nextP.periodId, nextP.year, nextP.month);

    return {
      mode, periodId, year, month,
      range, nextRange,
      shortLabel: _periodShortLabel(mode, periodId, year, month),
      longLabel: _periodLabel(mode, periodId, year, month),

      goal,
      nextGoal,

      // 5項目（v1.8.87: goal.salesYen は既に「円」単位。× 1000 は不要）
      sales: { actualYen: salesYen, goalYen: goal.salesYen },
      counts: {
        purchase: purchaseList.length,
        exhibit:  exhibitList.length,
        contract: contractList.length,
        delivery: deliveryList.length,
      },

      // 内訳リスト（集計対象モーダル＆販売車両リスト用）
      lists: {
        purchase: purchaseList,
        exhibit:  exhibitList,
        contract: contractList,
        delivery: deliveryList,
      },

      // 当期実績＋来期予定
      thisPeriodCars: salesSourceList,      // 当期で計上した（売上ベース）
      nextPeriodCars,                        // 来期に納車予定で売約済み
      thisPeriodSales: salesYen,
      nextPeriodSales,
      tentativeSales,
      tentativeCount,
      // v1.8.99: スライド車両（後期・月次・週次4週目のとき有効）
      isLastInUnit,
      slideList,
      slideSales,
    };
  }

  // ===== 期間別の着地予想（過去の実績ペースから残期間の実績予測を出す） =====
  // 確定（fixed）：col='done'/_archivedAt で deliveryDate が期間内
  // 見込み（likely）：col != 'done' && contract=true && deliveryDate が期間内
  // 実績予測（possible）：期間が今を含む場合のみ、過去90日の納車ペース × (期間残日数 - リードタイム)
  function _calcLandingForPeriod(mode, periodId, year, month){
    const range = _periodRange(mode, periodId, year, month);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${_zp(today.getMonth()+1)}-${_zp(today.getDate())}`;
    const isFuture = todayStr < range.start;
    const isPast = todayStr > range.end;
    const isCurrent = !isFuture && !isPast;

    const _carsArr = (typeof cars !== 'undefined' && Array.isArray(cars)) ? cars : [];
    const _archArr = (typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) ? archivedCars : [];
    const allCars = [].concat(_carsArr, _archArr);
    const _amt = (typeof _dashAmount === 'function') ? _dashAmount : (c => Number(c.price)||0);

    // v1.8.98: 売上計上モード（delivery / contract）に応じて集計対象を切替
    const recogMode = (typeof appSettings !== 'undefined' && appSettings.goals && appSettings.goals.revRecog === 'contract') ? 'contract' : 'delivery';
    let fixedList, likelyList;
    if (recogMode === 'contract') {
      // 売約ベース：fixed=当期 contractDate / likely=なし
      fixedList = allCars.filter(c => c.contractDate && _inRange(c.contractDate, range));
      likelyList = [];
    } else {
      fixedList = allCars.filter(c => {
        const isDone = c.col === 'done' || c._archivedAt;
        return isDone && c.deliveryDate && _inRange(c.deliveryDate, range);
      });
      likelyList = _carsArr.filter(c =>
        c.col !== 'done' && c.contract && c.deliveryDate && _inRange(c.deliveryDate, range)
      );
    }
    // v1.8.86 検証ログ：likely=0 になる原因切り分け用
    try {
      const contractCars = _carsArr.filter(c => c.contract);
      const contractWithDate = contractCars.filter(c => c.deliveryDate);
      console.log('[period-stats] landing detail:',
        'range=', range.start, '〜', range.end,
        '/ cars total:', _carsArr.length,
        '/ contract=true:', contractCars.length,
        '/ contract&deliveryDate:', contractWithDate.length,
        '/ likely(in range):', likelyList.length,
        '/ fixed:', fixedList.length);
      if (contractWithDate.length > 0 && likelyList.length === 0){
        console.log('[period-stats] 売約済の deliveryDate サンプル:',
          contractWithDate.slice(0,5).map(c => ({num:c.num, col:c.col, dd:c.deliveryDate})));
      }
    } catch(_){}
    const fixedSales  = fixedList.reduce((s,c) => s + _amt(c), 0);
    const likelySales = likelyList.reduce((s,c) => s + _amt(c), 0);

    // v1.8.94: 実績予測（リードタイム考慮＋「1日目に1台立つ」式）
    // v1.8.95: リードタイムはあくまで標準。気合で3日短縮できる前提（effectiveLead = lead - 3）
    // 「今日売約 → 気合短縮後のリード日数で納車できるか」で判定。
    //   addSlots = max(0, daysLeft - effectiveLead)
    //   addSlots > 0 なら「1日目に1台立つ」式で最低1台立つ
    let possibleCount = 0, possibleSales = 0, addSlots = 0;
    const lead = (typeof appSettings !== 'undefined' && appSettings.deliveryLeadDays) || 14;
    const effectiveLead = Math.max(1, lead - 3); // 気合で3日短縮の前提
    if (isCurrent){
      const todayDate = new Date(todayStr);
      const endDate = new Date(range.end);
      const daysLeft = Math.max(0, Math.floor((endDate - todayDate) / 86400000) + 1); // 今日を含む
      // v1.8.98: 売上計上モードに応じてリード控除の有無を切替
      addSlots = (recogMode === 'contract')
        ? Math.max(0, daysLeft)               // 売約即計上：リード控除なし
        : Math.max(0, daysLeft - effectiveLead); // 納車ベース：気合リード控除
      if (addSlots > 0){
        // 直近365日（1年）のペース・平均価格
        const since = (typeof dateAddDays === 'function') ? dateAddDays(todayStr, -365) : todayStr;
        // 集計対象も売上計上モードで切替（売約ベース＝contractDate / 納車ベース＝deliveryDate+done）
        const recent = (recogMode === 'contract')
          ? allCars.filter(c => c.contractDate && c.contractDate >= since)
          : allCars.filter(c => {
              const isDone = c.col === 'done' || c._archivedAt;
              return isDone && c.deliveryDate && c.deliveryDate >= since;
            });
        const dailyPace = recent.length / 365;
        if (dailyPace > 0){
          const interval = Math.max(1, Math.ceil(1 / dailyPace));
          possibleCount = Math.floor((addSlots - 1) / interval) + 1;
        }
        const avgPrice = recent.length ? recent.reduce((s,c) => s + _amt(c), 0) / recent.length : 0;
        possibleSales = Math.round(avgPrice * possibleCount);
      }
    }

    const predictLow  = fixedList.length + likelyList.length;
    const predictHigh = predictLow + possibleCount;

    const goal = _periodGoal(mode, periodId, year, month);

    return {
      range,
      isCurrent, isPast, isFuture,
      fixed:    { count: fixedList.length,  sales: fixedSales,  label: '確定（納車完了）' },
      likely:   { count: likelyList.length, sales: likelySales, label: '見込み（売約済×当期納車予定）' },
      possible: { count: possibleCount,     sales: possibleSales, label: '実績予測（過去90日ペース）' },
      predictLow, predictHigh,
      addSlots, lead,
      goalCount: goal.count,
      goalSalesYen: goal.salesYen, // v1.8.87: 円単位のまま
    };
  }

  // ===== 週次レポート用：実務ベースのデータ集計 =====
  // v1.8.103: 週次専用。タスクリミット超過車／パイプライン在庫／月販進捗
  function _calcWeekReport(periodId, year, month){
    const range = _periodRange('week', periodId, year, month);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${_zp(today.getMonth()+1)}-${_zp(today.getDate())}`;

    const _carsArr = (typeof cars !== 'undefined' && Array.isArray(cars)) ? cars : [];
    const _archArr = (typeof archivedCars !== 'undefined' && Array.isArray(archivedCars)) ? archivedCars : [];
    const allCars = [].concat(_carsArr, _archArr);
    const _amt = (typeof _dashAmount === 'function') ? _dashAmount : (c => Number(c.price)||0);

    // 🚨 要対応：タスクリミット超過車（severity 別）
    const overdueByCar = []; // [{car, items:[overdue tasks], topSeverity}]
    if (typeof getOverdueTasks === 'function'){
      _carsArr.forEach(c => {
        if (c.col === 'other' || c.col === 'done') return;
        const tasks = getOverdueTasks(c) || [];
        if (!tasks.length) return;
        let top = 'yellow';
        tasks.forEach(t => {
          if (t.severity === 'red') top = 'red';
          else if (t.severity === 'orange' && top !== 'red') top = 'orange';
        });
        overdueByCar.push({ car: c, items: tasks, topSeverity: top });
      });
    }
    const overdueRed    = overdueByCar.filter(x => x.topSeverity === 'red');
    const overdueOrange = overdueByCar.filter(x => x.topSeverity === 'orange');
    const overdueYellow = overdueByCar.filter(x => x.topSeverity === 'yellow');

    // 📊 パイプライン在庫スナップショット（今週末時点≒現時点）
    const colCounts = {
      purchase: 0, regen: 0, exhibit: 0, delivery: 0, done: 0,
    };
    const colDaysSum = { purchase: 0, regen: 0, exhibit: 0, delivery: 0 };
    const colDaysCnt = { purchase: 0, regen: 0, exhibit: 0, delivery: 0 };
    _carsArr.forEach(c => {
      if (c.isOrder) return; // オーダー車両は在庫から除外
      if (c.col && colCounts[c.col] !== undefined){
        colCounts[c.col]++;
        if (c.purchaseDate && colDaysSum[c.col] !== undefined){
          const days = Math.max(0, Math.floor((today - new Date(c.purchaseDate)) / 86400000));
          colDaysSum[c.col] += days;
          colDaysCnt[c.col]++;
        }
      }
    });
    const colDaysAvg = {
      purchase: colDaysCnt.purchase ? Math.round(colDaysSum.purchase / colDaysCnt.purchase) : 0,
      regen:    colDaysCnt.regen    ? Math.round(colDaysSum.regen    / colDaysCnt.regen)    : 0,
      exhibit:  colDaysCnt.exhibit  ? Math.round(colDaysSum.exhibit  / colDaysCnt.exhibit)  : 0,
      delivery: colDaysCnt.delivery ? Math.round(colDaysSum.delivery / colDaysCnt.delivery) : 0,
    };

    // 🎯 月販目標進捗
    const recogMode = (typeof appSettings !== 'undefined' && appSettings.goals && appSettings.goals.revRecog === 'contract') ? 'contract' : 'delivery';
    const monthStart = _ymd(year, month, 1);
    const monthEnd   = _ymd(year, month, _daysInMonth(year, month));
    const monthSold = (recogMode === 'contract')
      ? allCars.filter(c => c.contractDate && c.contractDate >= monthStart && c.contractDate <= monthEnd)
      : allCars.filter(c => {
          const isDone = c.col === 'done' || c._archivedAt;
          return isDone && c.deliveryDate && c.deliveryDate >= monthStart && c.deliveryDate <= monthEnd;
        });
    const monthSoldCount = monthSold.length;
    const monthGoal = _periodGoal('month', '0', year, month);
    const monthGoalCount = monthGoal.count || 1;
    const remainDaysOfMonth = Math.max(0, Math.floor((new Date(monthEnd) - today) / 86400000) + 1);
    const remainWeeksOfMonth = Math.max(1, Math.ceil(remainDaysOfMonth / 7));
    const remainToGoal = Math.max(0, monthGoalCount - monthSoldCount);

    return {
      mode: 'week',
      periodId,
      year, month,
      range,
      overdue: {
        red: overdueRed,
        orange: overdueOrange,
        yellow: overdueYellow,
        totalCars: overdueByCar.length,
      },
      pipeline: {
        counts: colCounts,
        daysAvg: colDaysAvg,
      },
      monthly: {
        soldCount: monthSoldCount,
        goalCount: monthGoalCount,
        remain: remainToGoal,
        remainDays: remainDaysOfMonth,
        remainWeeks: remainWeeksOfMonth,
        paceNeeded: remainWeeksOfMonth > 0 ? Math.ceil(remainToGoal / remainWeeksOfMonth) : 0,
      },
    };
  }

  // 公開
  window.periodStats = {
    periodRange:        _periodRange,
    periodLabel:        _periodLabel,
    periodShortLabel:   _periodShortLabel,
    nextPeriod:         _nextPeriod,
    defaultPeriodId:    _defaultPeriodIdForToday,
    defaultPeriodForToday: _defaultPeriodForToday,
    buildPeriodOptions: _buildPeriodOptions,
    parsePeriodValue:   _parsePeriodValue,
    carExhibitedAt:     _carExhibitedAt,
    calcPeriodReport,
    calcLandingForPeriod: _calcLandingForPeriod,
    calcWeekReport:     _calcWeekReport,
  };
})();
