/* ========================================
   members-core.js  （CarFlow v2.35.0）
   会社の名簿を **CoreMembers（人と組織の真実）** から作る。
   ----------------------------------------
   ◎これまで（v2.18.0〜v2.34.0）
     CarFlow は `portalMembers` だけを見て、しかも **carflow.on が true の人しか**
     一覧に出していなかった。そのため
       ・CarFlow を使わない人（ログインしないアルバイト・回送要員・整備部の一部）は
         **付箋の担当に選べなかった**
       ・**呼び名（社内で普段呼んでいる名前）が出せなかった**
       ・付箋の「車販メンバー／他部署メンバー」ボタンは
         CoreFlow の `carflow.group` に**文字がぴったり入っている時だけ**動く＝実質動いていなかった
   ◎これから（PitFlow と同じ考え方）
     🔴 **名簿の元は CoreMembers。全員出す。**
        その上に「CarFlow を使えるか（CoreFlow の権限）」を**印として**乗せる。
     🔴 **車販かそれ以外かは、CoreMembers の部署から自動で決める**（兼任も見る）。
        部署名に「車販」が入っていれば車販。それ以外（整備部など）は全部「他部署」。
        ⚠ CarFlow 側で人を車販/他部署に割り当てる操作は**作らない**。直すなら CoreMembers。
   ----------------------------------------
   🔴 人の番号（uid）の決め方は **今までと1文字も変えていない**。
      ＝`portalMembers.uid` があればそれ、無ければ portalMembers のドキュメントID。
      これを変えると **既存の付箋の担当が全部外れる**ので、絶対に変えないこと。
      CoreMembers にしか居ない人（CarFlow にログインしない人）だけ `cm_〜` になる。

   読むのは3つ。どれも **読むだけ**（CarFlow からは書かない）。
     companies/{cid}/coreMembers    … 社員名簿（在籍者・呼び名・部署・入社日）
     companies/{cid}/coreDepts      … 組織図（部・課。親をたどる）
     companies/{cid}/portalMembers  … CoreFlow のログイン名簿（権限・写真）
   ======================================== */
(function () {
  'use strict';

  var _core = [], _depts = [], _portal = [];
  /* 🔴 v2.35.1：3つ**そろってから**「準備できた」にする。
     以前は「どれか1つでも返事が来た時点」で準備できた扱いにしていたため、
     組織図（小さいので先に届く）だけが来た瞬間の名簿＝**社員名簿がまだ無い状態**を
     付箋に配ってしまい、**呼び名ではなく本名が出たまま残る**ことがあった。
     ⚠ 読めなかった（権限エラー等）ものは「返事は来た」とみなす＝止まらない。 */
  var _got = { coreMembers: false, coreDepts: false, portalMembers: false };
  var _rows = [], _ready = false;
  var _unsub = [];
  var _listeners = [];

  /* 🔴 車販の判定＝部署名に「車販」が入っているか。親（部）もたどる。
     ゆうた確定（2026-08-05）＝「車販で大丈夫。車販部と兼任車販が全て」
     ⚠ ここを増やしたい時（例：営業部も車販扱い）は、この1行だけ直す。 */
  var SALES_RE = /車販/;
  var GROUP_SALES = '車販メンバー';
  var GROUP_OTHER = '他部署メンバー';

  /* 名前の照合キー（異体字ゆらぎを吸収）。PitFlow members-pit.js の keyOf の写し。 */
  var VARIANT = { '﨑': '崎', '髙': '高', '冨': '富', '濵': '浜', '濱': '浜', '邊': '辺', '邉': '辺', '齋': '斎', '齊': '斉', '曻': '昇', '德': '徳', '瀨': '瀬' };
  function keyOf(name) {
    var t = String(name == null ? '' : name);
    try { t = t.normalize('NFKC'); } catch (e) {}
    t = t.replace(/[\s　]/g, '');
    return t.replace(/[﨑髙冨濵濱邊邉齋齊曻德瀨]/g, function (c) { return VARIANT[c] || c; });
  }

  function _co() {
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db.collection('companies').doc(window.fb.currentCompanyId);
  }

  /* ---- 組織図をたどる（PitFlow の bucketOfDept / divisionsOf と同じ考え方） ---- */
  function deptById(id) {
    if (!id) return null;
    return _depts.find(function (d) { return d.id === id; }) || null;
  }
  /* この部署（または親の部）が車販か */
  function isSalesDept(id, seen) {
    var d = deptById(id);
    if (!d) return false;
    seen = seen || {};
    if (seen[id]) return false;
    seen[id] = 1;
    if (SALES_RE.test(String(d.name || ''))) return true;
    return d.parentId ? isSalesDept(d.parentId, seen) : false;
  }
  /* その人の部署ぜんぶ（主所属＋課＋兼任）。返り値＝{ sales:true/false, names:['整備部',…] } */
  function deptsOf(cm) {
    if (!cm) return { sales: false, names: [] };
    var ids = [];
    if (cm.sectionDeptId) ids.push(cm.sectionDeptId);
    if (cm.primaryDeptId) ids.push(cm.primaryDeptId);
    (Array.isArray(cm.subDeptIds) ? cm.subDeptIds : []).forEach(function (x) { ids.push(x); });
    var sales = false, names = [];
    ids.forEach(function (id) {
      var d = deptById(id);
      if (d && d.name && names.indexOf(d.name) < 0) names.push(d.name);
      if (isSalesDept(id)) sales = true;   /* 🔴 兼任で1つでも車販なら車販 */
    });
    return { sales: sales, names: names };
  }

  /* portalMembers の日本語ロール → CarFlow 内部ロール（db-staff.js と同じ表） */
  var ROLE_JP_TO_EN = {
    '管理者': 'admin', 'マネージャー': 'manager', 'マネージャ': 'manager',
    'スタッフ': 'staff', '作業者': 'worker', '閲覧': 'viewer', '閲覧のみ': 'viewer'
  };

  /* ---- 3つを1つに合成する ---- */
  function rebuild() {
    var portalById = {}, portalByKey = {};
    _portal.forEach(function (p) {
      portalById[p.id] = p;
      var k = keyOf(p.name); if (k) portalByKey[k] = p;
    });

    var rows = [], usedPortal = {};

    _core.forEach(function (cm) {
      var pm = (cm.portalMemberId && portalById[cm.portalMemberId])
            || portalByKey[keyOf(cm.dispName)] || portalByKey[keyOf(cm.name)] || null;
      /* 🔴 先に「この名簿レコードは使った」印を付けてから、退職者を落とす。
         順番を逆にすると、**退職者が CoreFlow の名簿に残っている場合に
         「名簿だけの人」として下のループで復活してしまう**（1回ハマった）。 */
      if (pm) usedPortal[pm.id] = 1;
      /* 退職・在籍なしは出さない */
      if (cm.status === 'left' || cm.active === false) return;
      rows.push(_row(cm, pm));
    });

    /* CoreMembers に居ないのに CoreFlow の名簿には居る人（紐付け漏れ）も落とさない。
       🔴 落とすと、その人が担当になっている既存の付箋のアバターが消える。 */
    _portal.forEach(function (pm) {
      if (usedPortal[pm.id]) return;
      if (pm.active === false) return;
      rows.push(_row(null, pm));
    });

    /* 並び＝① CarFlow の並び順（carflow.sortOrder。管理者が並び替えた分）
             ② 入っていない人は入社日が古い順
             ③ それも無ければ本名の五十音
       ⚠ CoreMembers にしか居ない人は sortOrder を持たないので後ろに並ぶ。 */
    rows.sort(function (a, b) {
      var sa = (typeof a.sortOrder === 'number') ? a.sortOrder : 1e9;
      var sb = (typeof b.sortOrder === 'number') ? b.sortOrder : 1e9;
      if (sa !== sb) return sa - sb;
      var aj = a.joinedAt || '', bj = b.joinedAt || '';
      if (aj && bj) { if (aj < bj) return -1; if (aj > bj) return 1; }
      else if (aj && !bj) return -1;
      else if (!aj && bj) return 1;
      return String(a.realName || a.customDisplayName || '').localeCompare(String(b.realName || b.customDisplayName || ''), 'ja');
    });

    _rows = rows;
    if (_got.coreMembers && _got.coreDepts && _got.portalMembers) _ready = true;
    _fire();
  }

  /* 1人ぶん。🔴 CarFlow の既存コードが期待する「staff オブジェクト」の形をそのまま守る。 */
  function _row(cm, pm) {
    cm = cm || {};
    var cf = (pm && pm.carflow) || {};
    var roleJp = cf.role || 'スタッフ';
    var dv = deptsOf(cm.id ? cm : null);

    /* 🔴 ここが人の番号。今までと同じ決め方（変えると既存の付箋の担当が外れる）。 */
    var uid = (pm && (pm.uid || pm.id)) || ('cm_' + (cm.id || ''));

    /* 表示名＝呼び名（CoreMembers dispName）が最優先。PitFlow と同じ。 */
    var disp = String(cm.dispName || '').trim()
            || String(cm.name || '').trim()
            || String((pm && pm.name) || '').trim()
            || '(名前なし)';

    return {
      /* --- 既存コードが見るもの（形は今までどおり） --- */
      uid: uid,
      _pmDocId: (pm && pm.id) || '',
      email: (pm && pm.email) || '',
      displayName: (pm && pm.gname) || disp,
      photoURL: null,
      customDisplayName: disp,                       /* ← resolveStaffDisplayName が最優先で見る */
      customPhotoURL: (pm && pm.photo) || cm.photo || null,
      role: ROLE_JP_TO_EN[roleJp] || 'staff',
      active: (cm.active !== false) && (!pm || pm.active !== false),
      /* 🔴 車販／他部署は CoreMembers の部署から自動で決める（CoreFlow の carflow.group は見ない）。
         付箋の「👥 車販メンバー」ボタンは state.js の memberGroups の“名前”で照合するので、
         ここに同じ名前を入れておけば、ボタンは無改修でそのまま効く。 */
      group: dv.sales ? GROUP_SALES : GROUP_OTHER,
      sortOrder: (typeof cf.sortOrder === 'number') ? cf.sortOrder : undefined,
      name: disp, dept: dv.names[0] || '', title: (pm && pm.title) || '',

      /* --- ここから CoreMembers 由来の新しい情報 --- */
      cmId: cm.id || '',
      realName: String(cm.name || '').trim() || String((pm && pm.name) || '').trim() || '',
      lastName: String(cm.lastName || '').trim(),
      dispName: String(cm.dispName || '').trim(),
      deptNames: dv.names,
      isSales: !!dv.sales,
      joinedAt: String(cm.joinedAt || ''),
      /* 🔴 CarFlow に入れるか（CoreFlow の権限）。一覧の印と、担当候補の絞り込みに使う。 */
      canUse: !!(pm && pm.active !== false && pm.carflow && pm.carflow.on === true)
    };
  }

  /* ---- 購読 ---- */
  function _watch(name, setter) {
    var co = _co(); if (!co) return;
    try {
      var un = co.collection(name).onSnapshot(function (snap) {
        var arr = [];
        snap.forEach(function (d) { var o = d.data() || {}; o.id = d.id; arr.push(o); });
        setter(arr);
        _got[name] = true;
        rebuild();
      }, function (e) {
        /* 🔴 読めなくても止めない。読めた分だけで名簿を作る。
           （coreMembers が読めない＝CoreFlow の名簿だけの、v2.34.0 までと同じ状態になる） */
        console.warn('[members-core] ' + name + ' を読めませんでした（読めた分で続けます）', e && e.code);
        _got[name] = true;
        rebuild();
      });
      _unsub.push(un);
    } catch (e) {
      console.warn('[members-core] ' + name + ' の購読に失敗', e);
    }
  }

  function start() {
    if (_unsub.length) return;
    _watch('coreDepts', function (a) { _depts = a; });
    _watch('coreMembers', function (a) { _core = a; });
    _watch('portalMembers', function (a) { _portal = a; });
  }
  function stop() {
    _unsub.forEach(function (u) { try { u(); } catch (e) {} });
    _unsub = []; _core = []; _depts = []; _portal = []; _rows = []; _ready = false;
    _got = { coreMembers: false, coreDepts: false, portalMembers: false };
  }

  function _fire() {
    _listeners.forEach(function (f) { try { f(_rows.slice()); } catch (e) { console.error('[members-core] 通知でエラー', e); } });
  }

  /* 名簿が届くまで待つ（最大 ms ミリ秒）。届かなくても必ず返る＝画面を止めない。 */
  function whenReady(ms) {
    return new Promise(function (res) {
      if (_ready) return res(true);
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; res(false); } }, ms || 6000);
      /* 🔴 3つそろう（＝_ready）まで解決しない。1つ来ただけで解決すると、
         本名のままの名簿が付箋に配られてしまう（v2.35.1 で直した所）。 */
      _listeners.push(function () { if (!done && _ready) { done = true; clearTimeout(t); res(true); } });
    });
  }

  window.CFMembers = {
    start: start,
    stop: stop,
    whenReady: whenReady,
    ready: function () { return _ready; },
    /* 全員（CoreMembers にいる在籍者＋CoreFlow 名簿だけの人）。付箋・メンバー一覧はこちら。 */
    all: function () { return _rows.slice(); },
    /* CarFlow に入れる人だけ。車両の担当などはこちら（今までと同じ顔ぶれ）。 */
    usable: function () { return _rows.filter(function (r) { return r.canUse; }); },
    byUid: function (uid) { return _rows.find(function (r) { return r.uid === uid; }) || null; },
    /* 名簿が更新されたら教えてもらう */
    onChange: function (f) { if (typeof f === 'function') { _listeners.push(f); if (_ready) { try { f(_rows.slice()); } catch (e) {} } } },
    /* テスト用（本体からは使わない） */
    _debug: {
      keyOf: keyOf, isSalesDept: isSalesDept, deptsOf: deptsOf, rebuild: rebuild,
      set: function (core, depts, portal) { _core = core || []; _depts = depts || []; _portal = portal || []; rebuild(); },
      GROUP_SALES: GROUP_SALES, GROUP_OTHER: GROUP_OTHER
    }
  };

  console.log('[members-core] ready');
})();
