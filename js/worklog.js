// ========================================
// worklog.js (v1.7.26)
// 作業実績ビュー — 終礼で5分、スマホで全員見る前提
//
// 中身：
//  ・期間切替（今日 / 3日 / 1週間 / 1か月）
//  ・チーム合計サマリー
//  ・MVP top 3（スタッフごとの操作件数）
//  ・動きのあった車（期間内に作業が入った車のリスト＋進捗UP表示）
//
// データソース：
//  ・operation log（globalLogs）= 件数ベース
//  ・progress snapshot（car.progressHistory）= 「○%→○%」の比較用
// ========================================

let _worklogPeriod = 'today'; // 'today' | '3day' | 'week' | 'month'

// サイドバー「作業実績」クリック時 → タブに切替
function openWorklogFromSidebar(sbItem) {
  // サイドバーの active 切替
  document.querySelectorAll('.sb-item').forEach(s => s.classList.remove('active'));
  if (sbItem) sbItem.classList.add('active');
  // 該当タブを active にして switchTab を呼ぶ
  const tab = Array.from(document.querySelectorAll('.tab')).find(t => /作業実績/.test(t.textContent));
  if (tab && typeof switchTab === 'function') {
    switchTab('worklog', tab);
  }
}
window.openWorklogFromSidebar = openWorklogFromSidebar;

// 期間切替
function switchWorklogPeriod(p) {
  _worklogPeriod = p;
  document.querySelectorAll('#worklog-period-row .worklog-period-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.period === p);
  });
  renderWorklog();
}
window.switchWorklogPeriod = switchWorklogPeriod;

// 期間に応じた開始時刻（Date オブジェクト）を返す
function _worklogPeriodStart(period) {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0); // 今日 0:00
  if (period === 'today') return t;
  const d = new Date(t);
  if (period === '3day')  d.setDate(d.getDate() - 2); // 今日 + 過去2日 = 3日分
  if (period === 'week')  d.setDate(d.getDate() - 6); // 今日 + 過去6日 = 1週間
  if (period === 'month') d.setDate(d.getDate() - 29); // 今日 + 過去29日 = 1か月
  return d;
}

// 期間ラベル（表示用）
function _worklogPeriodLabel(period) {
  if (period === 'today') return '今日';
  if (period === '3day')  return '直近3日';
  if (period === 'week')  return '直近1週間';
  if (period === 'month') return '直近1か月';
  return '';
}

// ログの time フィールド（"M/D HH:mm"）を Date に変換
//   addLog で記録される time は年情報なし。年は「現在年」とみなす。
//   ※ 1月にログを見ると「12月のログ」が翌年扱いになってしまう問題があるが、
//     1か月単位なら実用上ほぼ問題ない。後で改善するなら timestamp を別途持つ。
function _parseLogTime(timeStr) {
  if (!timeStr) return null;
  const m = String(timeStr).match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2})/);
  if (!m) return null;
  const now = new Date();
  let year = now.getFullYear();
  const mo = parseInt(m[1], 10) - 1;
  const d  = parseInt(m[2], 10);
  // 「未来の日付」になったら昨年扱い（12月→1月の年跨ぎ対策）
  const candidate = new Date(year, mo, d, parseInt(m[3], 10), parseInt(m[4], 10));
  if (candidate.getTime() > now.getTime() + 60 * 60 * 1000) {
    return new Date(year - 1, mo, d, parseInt(m[3], 10), parseInt(m[4], 10));
  }
  return candidate;
}

// 期間内のログを抽出
function _worklogFilterLogs(period) {
  if (typeof globalLogs === 'undefined' || !Array.isArray(globalLogs)) return [];
  const start = _worklogPeriodStart(period);
  return globalLogs.filter(l => {
    const t = _parseLogTime(l && l.time);
    return t && t.getTime() >= start.getTime();
  });
}

// v1.7.30: ユーザー別の件数集計
//   - uid があれば uid で集計（メンバーが表示名を変えても同一人物として扱える）
//   - 古いログ（uid 無し）も「名前 → スタッフ uid」を best effort で解決して同一人物に統合
//   - それでも解決できない名前は別エントリとして残す
//   - 表示名は最新のスタッフ情報から取り直す
function _aggregateByUser(logs) {
  const staffList = _getStaffCacheSafe();
  const map = new Map();
  logs.forEach(l => {
    const u = (l && l.user) || '—';
    if (u === '—' || u === '') return;
    // uid を確定：明示的にあれば使う、無ければ名前から解決
    let uid = (l && l.userUid) || null;
    if (!uid) uid = _resolveStaffUidByName(u, staffList);
    const key = uid ? `uid:${uid}` : `name:${u}`;
    if (!map.has(key)) {
      map.set(key, { uid: uid || null, fallbackName: u, count: 0 });
    }
    map.get(key).count++;
  });
  const resolveName = (entry) => {
    if (entry.uid) {
      const s = (staffList || []).find(x => x && x.uid === entry.uid);
      if (s) {
        return (typeof resolveStaffDisplayName === 'function')
          ? resolveStaffDisplayName(s, null)
          : (s.customDisplayName || s.displayName || entry.fallbackName);
      }
    }
    return entry.fallbackName;
  };
  return Array.from(map.values())
    .map(e => ({ user: resolveName(e), count: e.count, uid: e.uid }))
    .sort((a, b) => b.count - a.count);
}

// v1.7.31: スタッフキャッシュ取得のラッパー（無ければ空配列）
function _getStaffCacheSafe() {
  return (typeof window._getBoardNotesStaffCache === 'function')
    ? (window._getBoardNotesStaffCache() || []) : [];
}

// v1.7.31: 名前文字列から uid を best effort で解決。
//   照合順：
//     1. customDisplayName 完全一致
//     2. displayName 完全一致
//     3. email のローカル部（@より前）一致
//     4. customDisplayName または displayName を含む（substring）
//     5. 見つからなければ null
window._resolveStaffUidByName = _resolveStaffUidByName;
function _resolveStaffUidByName(userStr, staffList) {
  if (!userStr || !Array.isArray(staffList) || staffList.length === 0) return null;
  // 1. customDisplayName 完全一致
  let m = staffList.find(s => s && s.customDisplayName === userStr);
  if (m) return m.uid;
  // 2. displayName 完全一致
  m = staffList.find(s => s && s.displayName === userStr);
  if (m) return m.uid;
  // 3. email ローカル部
  m = staffList.find(s => s && typeof s.email === 'string' && s.email.split('@')[0] === userStr);
  if (m) return m.uid;
  // 4. 部分一致（短い名前が長い表示名に含まれる、またはその逆）
  const ulow = String(userStr).toLowerCase();
  m = staffList.find(s => {
    if (!s) return false;
    const cd = (s.customDisplayName || '').toLowerCase();
    const dn = (s.displayName || '').toLowerCase();
    if (!cd && !dn) return false;
    return (cd && (cd.includes(ulow) || ulow.includes(cd)))
        || (dn && (dn.includes(ulow) || ulow.includes(dn)));
  });
  return m ? m.uid : null;
}

// v1.7.30→v1.7.31: 車別の件数集計（動きのあった車）。
//   - uid 無しの古いログも名前マッチで uid を解決
//   - 同一人物（uid）の重複は排除し、表示名は最新のスタッフ情報から取得
function _aggregateByCar(logs) {
  const staffList = _getStaffCacheSafe();
  const resolveName = (uid, fallback) => {
    if (uid) {
      const s = staffList.find(x => x && x.uid === uid);
      if (s) {
        return (typeof resolveStaffDisplayName === 'function')
          ? resolveStaffDisplayName(s, null)
          : (s.customDisplayName || s.displayName || fallback);
      }
    }
    return fallback;
  };
  const map = new Map();
  logs.forEach(l => {
    const id = l && l.carId;
    if (!id) return;
    if (!map.has(id)) {
      map.set(id, { carId: id, count: 0, userKeys: new Map(), carNum: l.carNum || '' });
    }
    const e = map.get(id);
    e.count++;
    if (l.user || l.userUid) {
      let uid = l.userUid || null;
      if (!uid) uid = _resolveStaffUidByName(l.user, staffList);
      const key = uid ? `uid:${uid}` : `name:${l.user || ''}`;
      if (!e.userKeys.has(key)) {
        e.userKeys.set(key, resolveName(uid, l.user || ''));
      }
    }
  });
  return Array.from(map.values())
    .map(e => ({ carId: e.carId, count: e.count, carNum: e.carNum, users: Array.from(e.userKeys.values()) }))
    .sort((a, b) => b.count - a.count);
}

// 車の現在進捗% を取得（progress.js の calcProg を使う）
function _carCurrentProgressPct(car) {
  if (!car || typeof calcProg !== 'function') return null;
  try {
    const p = calcProg(car); // { done, total, pct }
    return (p && typeof p.pct === 'number') ? p.pct : null;
  } catch (e) {
    return null;
  }
}

// v2.36.0 (A-2): 1本にまとめた記録（appSummaries/carflowProgress）を画面が持っておく置き場。
//   形：{ days: { 'YYYY-MM-DD': { carId: pct } } }
//   🔴 ここに無い日は、昔の車ごとの記録（car.progressHistory）で我慢する。
//      昔のぶんを書き換えたり、代わりの値で埋めたりはしない。
let _progSnapDoc = null;   // 読めていなければ null（＝「まだ分かっていない」）

function _progSnapDayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function _progSnapRef() {
  if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
  return window.fb.db
    .collection('companies').doc(window.fb.currentCompanyId)
    .collection('appSummaries').doc('carflowProgress');
}

// 期間先頭時点のスナップショット％ を取得（無ければ null）
function _carSnapshotPct(car, period) {
  if (!car) return null;
  const start = _worklogPeriodStart(period);
  const startMs = start.getTime();

  // ① まず1本にまとめた記録から。期間の開始日「以前」で いちばん新しい日を探す。
  if (_progSnapDoc && _progSnapDoc.days) {
    const startKey = _progSnapDayKey(start);
    let bestKey = null;
    for (const k in _progSnapDoc.days) {
      if (k >= startKey) continue;              // 期間に入ってからの記録は「前の値」ではない
      if (!bestKey || k > bestKey) bestKey = k;
    }
    if (bestKey) {
      const v = _progSnapDoc.days[bestKey][car.id];
      if (typeof v === 'number') return v;
    }
  }

  // ② 無ければ昔の車ごとの記録（v2.35.1 まではこちらに書いていた）
  if (!Array.isArray(car.progressHistory)) return null;
  let best = null;
  car.progressHistory.forEach(s => {
    if (!s || typeof s.snapshotAt !== 'number') return;
    if (s.snapshotAt <= startMs) {
      if (!best || s.snapshotAt > best.snapshotAt) best = s;
    }
  });
  return best ? (typeof best.pct === 'number' ? best.pct : null) : null;
}

// メインレンダリング
function renderWorklog() {
  const summaryEl = document.getElementById('worklog-summary');
  const mvpEl = document.getElementById('worklog-mvp-list');
  const carsEl = document.getElementById('worklog-cars-list');
  if (!summaryEl || !mvpEl || !carsEl) return;

  const logs = _worklogFilterLogs(_worklogPeriod);
  const periodLabel = _worklogPeriodLabel(_worklogPeriod);

  // チーム合計サマリー
  const totalTasks = logs.length;
  const carIds = new Set(logs.map(l => l && l.carId).filter(Boolean));
  const movedCarsCount = carIds.size;
  // 完成（納車完了）した車の件数 — action に「完了」「納車」が含まれているログから推定（ヒューリスティック）
  // 厳密には別フラグが必要だが、最初はざっくりで OK。
  const completedCount = logs.filter(l =>
    l && typeof l.action === 'string' && /(納車を完了|completion|完成)/.test(l.action)
  ).length;

  // (1) チーム合計サマリー（一番上、ここが主役） ────────────────────
  //     ワイワイ感を出すため、件数に応じた応援フレーズを表示。
  let cheerMsg = '';
  if (totalTasks === 0) cheerMsg = '🌱 これから動き出すぞ！';
  else if (totalTasks < 10) cheerMsg = '🍃 コツコツいこう！';
  else if (totalTasks < 30) cheerMsg = '🔥 いい感じ！';
  else if (totalTasks < 60) cheerMsg = '🚀 みんな絶好調！';
  else cheerMsg = '🎉 神回！お疲れさま！';

  summaryEl.innerHTML = `
    <div class="worklog-summary-title">${ic('handshake','🤝',16)} ${periodLabel}のチームの動き</div>
    <div class="worklog-summary-stats">
      <div class="worklog-stat">
        <div class="worklog-stat-icon">${ic('check','✅',15)}</div>
        <div class="worklog-stat-num">${totalTasks}</div>
        <div class="worklog-stat-label">完了タスク</div>
      </div>
      <div class="worklog-stat">
        <div class="worklog-stat-icon">${ic('car','🚗',16)}</div>
        <div class="worklog-stat-num">${movedCarsCount}</div>
        <div class="worklog-stat-label">動いた車</div>
      </div>
      ${completedCount > 0 ? `
      <div class="worklog-stat worklog-stat-shine">
        <div class="worklog-stat-icon">${ic('sparkle','✨',15)}</div>
        <div class="worklog-stat-num">${completedCount}</div>
        <div class="worklog-stat-label">完成した車</div>
      </div>` : ''}
    </div>
    <div class="worklog-cheer">${cheerMsg}</div>`;

  // (2) 動きのあった車（中段、これが終礼の話題のメイン） ─────────────
  const carAgg = _aggregateByCar(logs);
  if (carAgg.length === 0) {
    carsEl.innerHTML = '<div class="worklog-empty">'+ic('bed','😴',15)+' この期間はまだ動きがないみたい。<br>明日いっしょにがんばろう！</div>';
  } else {
    carsEl.innerHTML = carAgg.map(c => {
      const car = (typeof cars !== 'undefined') ? cars.find(x => x.id === c.carId) : null;
      const isCompletedDelivery = car && (car.col === 'done');
      const carName = car ? `${car.maker || ''} ${car.model || ''}`.trim() : '(削除済み)';
      const carNum = car ? (car.num || '') : (c.carNum || '');
      const userBadges = c.users.slice(0, 4).map(u => `<span class="worklog-car-user">${escapeHtml(u)}</span>`).join('');
      const moreUsers = c.users.length > 4 ? `<span class="worklog-car-user-more">+${c.users.length - 4}</span>` : '';
      // 進捗 % 比較 + 応援フレーズ
      let pctHtml = '';
      let oneMore = '';
      if (car) {
        const cur = _carCurrentProgressPct(car);
        const prev = _carSnapshotPct(car, _worklogPeriod);
        if (cur != null && prev != null && cur !== prev) {
          const diff = cur - prev;
          const sign = diff > 0 ? '+' : '';
          const cls = diff > 0 ? 'worklog-pct-up' : (diff < 0 ? 'worklog-pct-down' : '');
          const arrow = diff > 0 ? '📈' : (diff < 0 ? '📉' : '➡️');
          pctHtml = `<div class="worklog-car-pct ${cls}">${arrow} ${prev}% → ${cur}% <span class="worklog-pct-diff">(${sign}${diff})</span></div>`;
        } else if (cur != null) {
          pctHtml = `<div class="worklog-car-pct">進捗 ${cur}%</div>`;
        }
        // 「あと一息」フレーズ
        if (cur != null && cur >= 90 && cur < 100) {
          oneMore = '<span class="worklog-car-onemore">💪 あと一息！</span>';
        }
      }
      const cheer = isCompletedDelivery ? '<span class="worklog-car-shine">'+ic('sparkle','✨',15)+' 完成！おめでとう</span>' : oneMore;
      return `
        <div class="worklog-car-row" onclick="openWorklogCar('${escapeHtml(c.carId)}')">
          <div class="worklog-car-main">
            <div class="worklog-car-name">${escapeHtml(carName)} ${cheer}</div>
            <div class="worklog-car-meta">
              ${carNum ? `<span class="worklog-car-num">#${escapeHtml(String(carNum))}</span>` : ''}
              ${pctHtml}
            </div>
          </div>
          <div class="worklog-car-right">
            <div class="worklog-car-count">${c.count}<span class="worklog-car-count-unit">件</span></div>
            <div class="worklog-car-users">${userBadges}${moreUsers}</div>
          </div>
        </div>`;
    }).join('');
  }

  // (3) 個人別（一番下、控えめにみんなで称え合う雰囲気） ──────────
  //     順位やメダルは外し、シンプルに「人＋件数」を横並びで。
  const userAgg = _aggregateByUser(logs);
  if (userAgg.length === 0) {
    mvpEl.innerHTML = '<div class="worklog-empty-sub">記録待ち '+ic('sparkle','🌱',15)+'</div>';
  } else {
    mvpEl.innerHTML = userAgg.map(u => `
      <div class="worklog-person">
        <span class="worklog-person-name">${escapeHtml(u.user)}</span>
        <span class="worklog-person-count">${u.count}件</span>
      </div>
    `).join('');
  }
}
window.renderWorklog = renderWorklog;

// 車のクリックで詳細を開く
function openWorklogCar(carId) {
  if (!carId) return;
  if (typeof openDetail === 'function') openDetail(carId);
}
window.openWorklogCar = openWorklogCar;

// ========================================
// 進捗スナップショット（毎日0時時点の進捗を保存）
// ========================================

// v2.36.0 (A-2) 🔴 ここが「朝いちばんに開いた人の画面が数秒固まる」の元だった。
//
//   【前】ログインするたび、在庫の車を1台ずつ保存し直していた（50台なら50回の書き込み）。
//         しかも1台保存するたびに updatedAt / updatedBy が変わるので、
//         自分の書き込みが跳ね返ってきて描き直しが50回連発していた。
//         全員がログインするので、1日に何百回も同じことが起きていた。
//
//   【今】記録は会社で1本の書類（appSummaries/carflowProgress）にまとめた。
//         ・その日のぶんが既にあれば **1文字も書かない**（＝2人目以降はタダ）
//         ・無ければ **1回だけ** まとめて書く（何台あっても1回）
//         ・🔴 車のデータには一切触らない ＝ 跳ね返りの描き直しがゼロになる
//
//   ⚠ 昔の車ごとの記録（car.progressHistory）は **消していない**。読む側が今も見に行く。
//      新しく書き足さないだけ。
async function captureProgressSnapshotsIfNew() {
  const ref = _progSnapRef();
  if (!ref) return;

  // まず読む（読めなければ何もしない。からっぽを本物として扱わない）
  let doc = null;
  try {
    const snap = await ref.get();
    doc = snap.exists ? (snap.data() || {}) : { days: {} };
  } catch (e) {
    console.warn('[worklog] 進捗の記録が読めなかったので、今日のぶんは書かない', e);
    return;
  }
  if (!doc.days) doc.days = {};
  _progSnapDoc = doc;   // 画面が使う

  const todayKey = _progSnapDayKey(new Date());
  if (doc.days[todayKey]) return;               // 🔴 今日のぶんは誰かが書いた ＝ 書き込みゼロ

  if (typeof cars === 'undefined' || !Array.isArray(cars)) return;
  const today = {};
  cars.forEach(car => {
    if (!car || !car.id) return;
    const pct = _carCurrentProgressPct(car);
    if (pct == null) return;
    today[car.id] = pct;
  });
  if (Object.keys(today).length === 0) return;

  // 古い日を落とす（60日ぶんで頭打ち。書類が無限に太らないように）
  const keys = Object.keys(doc.days).sort();
  const drop = keys.slice(0, Math.max(0, keys.length - 59));

  const payload = { days: {} };
  payload.days[todayKey] = today;
  try {
    await ref.set(payload, { merge: true });    // 🔴 1回だけ
    doc.days[todayKey] = today;
    if (drop.length) {
      const FieldValue = window.firebase.firestore.FieldValue;
      const del = {};
      drop.forEach(k => { del['days.' + k] = FieldValue.delete(); delete doc.days[k]; });
      await ref.update(del);
    }
    console.log('[worklog] 進捗の記録を1本にまとめて保存しました（' + Object.keys(today).length + '台ぶん・書き込み1回）');
  } catch (e) {
    console.warn('[worklog] 進捗の記録を保存できなかった', e);
  }
}
window.captureProgressSnapshotsIfNew = captureProgressSnapshotsIfNew;
