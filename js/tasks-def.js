// ========================================
// tasks-def.js
// 再生タスク・納車タスクの定義
// 作業工程を増やしたい/減らしたい時はここを編集
// ========================================

// 再生（リノベーション）工程のタスク定義
const REGEN_TASKS = [
  {id:'t_equip', name:'装備品チェック', icon:'🔍', type:'workflow', sections:[
    {title:'01 外装確認', items:[
      {id:'e1', name:'ボディ全周チェック', sub:'傷・へこみ・錆',
       detail:'ボディ全周を目視確認し板金カルテに記入します。',
       points:['ルーフ・ピラーも確認','フレーム歪みの有無']},
      {id:'e2', name:'タイヤ・ホイール確認', sub:'溝・偏摩耗・傷',
       detail:'タイヤ4本の溝・製造年・偏摩耗を確認します。',
       points:['溝1.6mm以下は交換']},
    ]},
    {title:'02 内装確認', items:[
      {id:'e3', name:'シート・内張り確認', sub:'破れ・汚れ・臭い',
       detail:'シート・天井・カーペットを確認します。',
       points:['シートの破れ・沈み込み']},
      {id:'e4', name:'電装品確認', sub:'スイッチ・ナビ・エアコン',
       detail:'全電装系スイッチ類の動作を確認します。',
       points:['エアコン冷暖房の効き']},
    ]},
    {title:'03 付属品', items:[
      {id:'e5', name:'付属品確認', sub:'スペアキー・取説等',
       detail:'付属品がすべて揃っているか確認します。',
       points:['スペアキーの有無']},
    ]},
  ]},

  // v1.1.0: 中古車作業管理票（再生）に丸ごと差し替え
  // 外装26項目＋内装13項目＝39項目
  {id:'t_regen', name:'再生', icon:'🔧', type:'workflow', sections:[
    {title:'01 外装', items:[
      {id:'r1',  name:'車内のゴミ捨て', sub:'★重要',
       detail:'車内に残っているゴミ・前オーナーの私物を全部撤去します。',
       points:['シート下・ドアポケット・グローブBOXも見る','灰皿の中身も忘れずに'],
       media:[
         {type:'youtube', videoId:'KntVP1lA0MU', caption:'忘れがちな隙間チェック（参考動画）', durationSec:754}
       ]},
      {id:'r2',  name:'フロアマットをはずす、洗い', sub:'★重要',
       detail:'フロアマットを外して水洗い。乾燥もしっかり。',
       points:['泥を払ってから水洗い','戻し忘れ注意']},
      {id:'r3',  name:'タイヤホイール', sub:'',
       detail:'タイヤとホイールを洗浄します。',
       points:['鉄粉除去剤を使う','ナット周りも入念に']},
      {id:'r4',  name:'ガラスの水垢', sub:'※Fガラスだめ',
       detail:'ガラスの水垢落とし。フロントガラスはコンパウンド禁止。',
       points:['Fガラスはケミカルのみ','コーティング前提なら脱脂もここで']},
      {id:'r5',  name:'すき間（外装全体からドア内まで）', sub:'',
       detail:'外装の隙間・ドア内側の汚れを徹底清掃します。',
       points:['ドア開口部のゴム周り','ヒンジ・ストライカー周辺'],
       media:[
         {type:'image', url:"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200' viewBox='0 0 320 200'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#3a4a6c'/><stop offset='1' stop-color='#1e2a44'/></linearGradient></defs><rect width='320' height='200' fill='url(#g)'/><text x='160' y='100' font-family='sans-serif' font-size='16' font-weight='700' fill='#e8eaf6' text-anchor='middle'>ドア開口部 ゴム周り</text><text x='160' y='126' font-family='sans-serif' font-size='12' fill='#9fa8c7' text-anchor='middle'>（参考写真・差し替え予定）</text></svg>", caption:'ドア開口部のゴム周り（汚れが残りやすい箇所）'},
         {type:'image', url:"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200' viewBox='0 0 320 200'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#5c4030'/><stop offset='1' stop-color='#2e1f17'/></linearGradient></defs><rect width='320' height='200' fill='url(#g)'/><text x='160' y='100' font-family='sans-serif' font-size='16' font-weight='700' fill='#e8eaf6' text-anchor='middle'>ヒンジ・ストライカー</text><text x='160' y='126' font-family='sans-serif' font-size='12' fill='#9fa8c7' text-anchor='middle'>（参考写真・差し替え予定）</text></svg>", caption:'ヒンジ・ストライカー周辺の汚れ'},
         {type:'youtube', videoId:'fSce9VopfIU', caption:'すき間清掃のコツ（参考動画）', durationSec:922}
       ]},
      {id:'r6',  name:'エンジンルーム', sub:'※専務確認 ※ヘリも',
       detail:'エンジンルーム洗浄。専務確認してから着手。ヘリ部分も忘れず。',
       points:['電装に水かけない','専務に一声']},
      {id:'r7',  name:'シャンプー', sub:'★重要',
       detail:'外装をシャンプー洗車します。',
       points:['上から下に','すすぎ残し注意','日光厳禁']},
      {id:'r8',  name:'鉄粉', sub:'',
       detail:'鉄粉除去剤で鉄粉を浮かせて落とします。',
       points:['ボディ全体ムラなく','洗い流し徹底']},
      {id:'r9',  name:'ガラスにガラスコート', sub:'',
       detail:'ガラスにコーティング剤を施工。',
       points:['脱脂後に施工','水弾き確認']},
      {id:'r10', name:'ポリッシャー', sub:'',
       detail:'ポリッシャーで磨きを実施。',
       points:['粗目→中目→仕上げ','エッジ部分は手磨き'],
       media:[
         {type:'youtube', videoId:'fSce9VopfIU', caption:'ポリッシャーの基本操作', durationSec:922}
       ]},
      {id:'r11', name:'ヘッドライト磨き', sub:'',
       detail:'ヘッドライトの黄ばみ・くもりを磨いて除去。',
       points:['仕上げにコーティング推奨']},
      {id:'r12', name:'GYEON', sub:'',
       detail:'GYEONコーティングを施工。',
       points:['ムラなく薄く塗る','拭き上げタイミング厳守']},
      {id:'r13', name:'タイヤWAX', sub:'',
       detail:'タイヤワックスを塗布。',
       points:['side wallに均一に','地面にはつけない']},
      {id:'r14', name:'外装艶出し', sub:'',
       detail:'樹脂部・モール類の艶出し。',
       points:['ボディ部分とつや具合を合わせる']},
      {id:'r15', name:'ドアヒンジグリスアップ', sub:'',
       detail:'ドアヒンジ・ストライカーへグリス塗布。',
       points:['動きが渋い箇所優先']},
      {id:'r16', name:'タッチペン', sub:'',
       detail:'小傷をタッチアップで補修。',
       points:['色コード合っているか','在庫確認']},
      {id:'r17', name:'ビニールマットシートカバー', sub:'★重要',
       detail:'納車までシートを汚さないようビニールマット・シートカバーを装着。',
       points:['乗車時は外す手順を共有','破れに注意']},
      {id:'r18', name:'D席ステップ保護フィルム', sub:'',
       detail:'運転席ステップに保護フィルムを貼る。',
       points:['気泡が入らないように']},
      {id:'r19', name:'化粧プレート', sub:'★重要',
       detail:'化粧プレート（ナンバープレート枠など）を装着。',
       points:['取り付けゆるみなし']},
      {id:'r20', name:'プライス貼り付け', sub:'',
       detail:'プライス・装備表示シール貼り付け。',
       points:['位置揃え','曲げて貼らない']},
      {id:'r21', name:'ホイールキャップ塗る', sub:'',
       detail:'ホイールキャップに艶出しを塗布。',
       points:['取り外して塗ると楽']},
      {id:'r22', name:'ワイパーアーム塗る', sub:'',
       detail:'ワイパーアームの色褪せ補修。',
       points:['乾燥時間しっかり']},
      {id:'r23', name:'グローブBOXの中を整理', sub:'',
       detail:'グローブボックス内を整理し不要物を撤去。',
       points:['取説・点検整備記録簿は残す']},
      {id:'r24', name:'ウェザーゴムの清掃、潤滑', sub:'',
       detail:'ドア・トランクのウェザーゴムを清掃しシリコン塗布。',
       points:['切れ・はがれもチェック']},
      {id:'r25', name:'社外パーツ、配線、ネジ等処分の判断', sub:'※専務確認',
       detail:'前オーナーの社外パーツ・余分な配線・ネジ類を処分するか判断。専務確認。',
       points:['勝手に捨てない','判断ついたものから処分']},
      {id:'r26', name:'ガソリン給油', sub:'',
       detail:'最後にガソリン給油して再生完了。',
       points:['指定量入れる','給油キャップしめ忘れ注意']},
    ]},
    {title:'02 内装', items:[
      {id:'r27', name:'天井を拭く', sub:'',
       detail:'天井を拭き上げ。',
       points:['内装用クリーナー使用','力入れすぎない']},
      {id:'r28', name:'不要なステッカーを剥がす', sub:'※専務確認',
       detail:'前オーナーが貼ったステッカー類を判断して剥がす。専務確認。',
       points:['業者ステッカーは残すか相談']},
      {id:'r29', name:'掃除機', sub:'',
       detail:'車内全体を掃除機掛け。',
       points:['シートレール下も忘れずに']},
      {id:'r30', name:'洗剤を使った水拭き、激落ちくん', sub:'',
       detail:'内装の汚れを水拭き・激落ちくんで落とす。',
       points:['ダッシュボード・センターコンソール念入りに']},
      {id:'r31', name:'ドアポケットのねじ', sub:'',
       detail:'ドアポケット内のねじ・小物を整理。',
       points:['異物が無いか']},
      {id:'r32', name:'シートを拭く、シミ取り', sub:'',
       detail:'シートを拭いてシミを取る。',
       points:['素材に合った洗剤','濡らしすぎ注意']},
      {id:'r33', name:'内装全体艶出し', sub:'',
       detail:'内装全体に艶出し剤を塗布。',
       points:['ハンドル・ペダルには塗らない']},
      {id:'r34', name:'ガラスを拭く', sub:'※ガラスを下げて拭く',
       detail:'内側からガラスを拭く。サイドガラスは少し下げて拭く。',
       points:['上端の拭き残しに注意']},
      {id:'r35', name:'ルームミラー、バイザーミラーを拭く', sub:'',
       detail:'ルームミラー・サンバイザーミラーを拭く。',
       points:['指紋残さない']},
      {id:'r36', name:'シートベルトを整える', sub:'',
       detail:'シートベルトを引き出して伸ばし、整える。',
       points:['よじれていないか']},
      {id:'r37', name:'車載工具やパンク修理剤を整える', sub:'',
       detail:'車載工具・パンク修理剤を所定位置に整える。',
       points:['期限切れの修理剤は交換']},
      {id:'r38', name:'ホイールキャップやワイパーアームの取付', sub:'',
       detail:'外していたホイールキャップ・ワイパーアームを取り付ける。',
       points:['ゆるみなし']},
      {id:'r39', name:'ペーパーマット', sub:'★重要',
       detail:'ペーパーマットをセット。納車までの仮マット。',
       points:['ズレない位置に','枚数確認']},
    ]},
  ]},

  {id:'t_photo',   name:'写真撮影',   icon:'📷', type:'toggle'},
  {id:'t_estim',   name:'見積もり作成', icon:'🧮', type:'toggle'},
  {id:'t_webup',   name:'webUP',     icon:'🌐', type:'toggle'},

  {id:'t_exhibit', name:'展示', icon:'🏪', type:'workflow', sections:[
    {title:'01 クリーニング', items:[
      {id:'ex1', name:'外装洗車・下地処理', sub:'高圧洗浄・脱脂',
       detail:'高圧洗浄後、脱脂処理します。',
       points:['エンブレム周りも入念に']},
      {id:'ex2', name:'磨き・コーティング', sub:'バフ掛け・ガラスコート',
       detail:'コンパウンドで傷除去後ガラスコーティング施工。',
       points:['粗目→細目→仕上げ']},
      {id:'ex3', name:'内装クリーニング', sub:'スチーム洗浄・消臭',
       detail:'スチーム洗浄と消臭剤を施工します。',
       points:['シートレール下の清掃']},
    ]},
    {title:'02 展示準備', items:[
      {id:'ex4', name:'展示位置・POP設置', sub:'プライスカード',
       detail:'展示スペースに配置しPOPを設置。',
       points:['見やすい角度に配置']},
    ]},
  ]},

  // v1.7.17: 再生フェーズの完全完了（自動判定）。d_complete（納車側）と対称構造
  {id:'t_complete', name:'完全完了', icon:'✅', type:'toggle'},
];

// 納車準備工程のタスク定義
const DELIVERY_TASKS = [
  // v1.1.0: 中古車作業管理票（納車時）に丸ごと差し替え
  // 外装26＋内装13＋納車オプション3＋ステッカー4＝46項目
  {id:'d_prep', name:'納車準備', icon:'📦', type:'workflow', sections:[
    {title:'01 外装', items:[
      {id:'dp1',  name:'車内のゴミ捨て', sub:'★重要',
       detail:'納車前に車内ゴミを再確認し撤去。',
       points:['再生時から増えていないか確認']},
      {id:'dp2',  name:'フロアマットをはずす、洗い', sub:'★重要',
       detail:'フロアマットを再度洗浄。納車前のひと手間。',
       points:['乾燥もしっかり']},
      {id:'dp3',  name:'タイヤホイール', sub:'',
       detail:'タイヤ・ホイールを最終仕上げ。',
       points:['ブレーキダストを再除去']},
      {id:'dp4',  name:'ガラスの水垢', sub:'※Fガラスだめ',
       detail:'ガラス水垢の最終チェック・追加除去。',
       points:['Fガラスはケミカルのみ']},
      {id:'dp5',  name:'すき間（外装全体からドア内まで）', sub:'',
       detail:'隙間の汚れを最終確認し清掃。',
       points:['ドア開口部のゴム周り']},
      {id:'dp6',  name:'エンジンルーム', sub:'※専務確認 ※ヘリも',
       detail:'エンジンルームの最終確認。',
       points:['オイル滴下・水滴のあとなし']},
      {id:'dp7',  name:'シャンプー', sub:'★重要',
       detail:'納車前の最終シャンプー洗車。',
       points:['日光厳禁','水滴を残さない']},
      {id:'dp8',  name:'鉄粉', sub:'',
       detail:'再生から納車までの間に付いた鉄粉を再除去。',
       points:['気になる箇所中心']},
      {id:'dp9',  name:'ガラスにガラスコート', sub:'',
       detail:'ガラスコートの再施工（必要に応じて）。',
       points:['水弾き状態確認']},
      {id:'dp10', name:'ポリッシャー', sub:'',
       detail:'必要に応じて再ポリッシュ。',
       points:['再生時の仕上がりが落ちていないか']},
      {id:'dp11', name:'ヘッドライト磨き', sub:'',
       detail:'ヘッドライトの状態確認。曇っていたら再磨き。',
       points:['コーティング再施工も検討']},
      {id:'dp12', name:'GYEON', sub:'',
       detail:'GYEONメンテナンス施工。',
       points:['ムラなく薄く']},
      {id:'dp13', name:'タイヤWAX', sub:'',
       detail:'納車前のタイヤワックス再塗布。',
       points:['side wallに均一']},
      {id:'dp14', name:'外装艶出し', sub:'',
       detail:'樹脂部・モール類の艶出し再塗布。',
       points:['色合わせ確認']},
      {id:'dp15', name:'ドアヒンジグリスアップ', sub:'',
       detail:'ドアヒンジへ追加グリス。',
       points:['動きスムーズか']},
      {id:'dp16', name:'タッチペン', sub:'',
       detail:'小傷の再確認・タッチアップ。',
       points:['納車直前の小傷も忘れずに']},
      {id:'dp17', name:'ビニールマットシートカバー', sub:'★重要',
       detail:'納車時にビニール・シートカバーを撤去。',
       points:['撤去忘れ注意']},
      {id:'dp18', name:'D席ステップ保護フィルム', sub:'',
       detail:'保護フィルムを撤去（または納車後にお客様で剥がす指示）。',
       points:['粘着残しに注意']},
      {id:'dp19', name:'化粧プレート', sub:'★重要',
       detail:'化粧プレートが綺麗か最終確認。',
       points:['緩み・傷なし']},
      {id:'dp20', name:'プライス貼り付け', sub:'',
       detail:'プライスシール撤去（納車時は剥がす）。',
       points:['粘着残しに注意']},
      {id:'dp21', name:'ホイールキャップ塗る', sub:'',
       detail:'ホイールキャップの艶出し再塗布。',
       points:['']},
      {id:'dp22', name:'ワイパーアーム塗る', sub:'',
       detail:'ワイパーアーム再仕上げ。',
       points:['乾燥時間しっかり']},
      {id:'dp23', name:'グローブBOXの中を整理', sub:'',
       detail:'納車書類・取説をグローブBOXに整理。',
       points:['お客様への引き渡し物が揃っているか']},
      {id:'dp24', name:'ウェザーゴムの清掃、潤滑', sub:'',
       detail:'ウェザーゴムを再清掃・潤滑。',
       points:['切れ・はがれの最終確認']},
      {id:'dp25', name:'社外パーツ、配線、ネジ等処分の判断', sub:'※専務確認',
       detail:'判断保留分の最終処理。',
       points:['納車時に渡すかどうか']},
      {id:'dp26', name:'ガソリン給油', sub:'',
       detail:'納車直前のガソリン給油（指定量）。',
       points:['給油キャップしめ忘れ注意']},
    ]},
    {title:'02 内装', items:[
      {id:'dp27', name:'天井を拭く', sub:'',
       detail:'天井の最終拭き上げ。',
       points:['内装用クリーナー']},
      {id:'dp28', name:'不要なステッカーを剥がす', sub:'※専務確認',
       detail:'残ったステッカーの最終判断・除去。',
       points:['粘着残しに注意']},
      {id:'dp29', name:'掃除機', sub:'',
       detail:'納車前の最終掃除機掛け。',
       points:['シート溝・シートレール下']},
      {id:'dp30', name:'洗剤を使った水拭き、激落ちくん', sub:'',
       detail:'納車前の最終水拭き。',
       points:['ダッシュボード・センターコンソール']},
      {id:'dp31', name:'ドアポケットのねじ', sub:'',
       detail:'ドアポケット内最終確認。',
       points:['ゴミ・異物なし']},
      {id:'dp32', name:'シートを拭く、シミ取り', sub:'',
       detail:'シート最終拭き上げ。',
       points:['シミ残りなし']},
      {id:'dp33', name:'内装全体艶出し', sub:'',
       detail:'内装全体の艶出し再塗布。',
       points:['ハンドル・ペダルには塗らない']},
      {id:'dp34', name:'ガラスを拭く', sub:'※ガラスを下げて拭く',
       detail:'納車前の最終ガラス拭き。',
       points:['指紋残さない']},
      {id:'dp35', name:'ルームミラー、バイザーミラーを拭く', sub:'',
       detail:'ミラー類の最終拭き。',
       points:['指紋残さない']},
      {id:'dp36', name:'シートベルトを整える', sub:'',
       detail:'シートベルトの引き出し・整え。',
       points:['よじれなし']},
      {id:'dp37', name:'車載工具やパンク修理剤を整える', sub:'',
       detail:'車載工具一式の最終確認。',
       points:['期限切れの修理剤は交換']},
      {id:'dp38', name:'ホイールキャップやワイパーアームの取付', sub:'',
       detail:'納車前最終取り付け確認。',
       points:['ゆるみなし']},
      {id:'dp39', name:'ペーパーマット', sub:'★重要',
       detail:'ペーパーマットを撤去し、純正/新品マットをセット。',
       points:['納車後はマット忘れずに']},
    ]},
    {title:'03 納車オプション', items:[
      {id:'dp40', name:'GYEON or 3M or 1Y', sub:'',
       detail:'契約に応じて GYEON / 3M / 1年保証コーティング を施工。',
       points:['契約内容を再確認']},
      {id:'dp41', name:'消臭', sub:'',
       detail:'スチーム消臭・消臭剤施工。',
       points:['内装全体に行き渡らせる']},
      {id:'dp42', name:'エアコンフィルター', sub:'',
       detail:'エアコンフィルター交換。',
       points:['品番確認','在庫確認']},
    ]},
    {title:'04 ステッカー類', items:[
      {id:'dp43', name:'車検ステッカー', sub:'',
       detail:'車検ステッカーをフロントガラスに貼付。',
       points:['位置厳守']},
      {id:'dp44', name:'車庫ステッカー', sub:'',
       detail:'車庫証明ステッカーを貼付。',
       points:['']},
      {id:'dp45', name:'点検ステッカー', sub:'',
       detail:'点検ステッカーを貼付。',
       points:['次回点検日記入']},
      {id:'dp46', name:'オイルステッカー', sub:'',
       detail:'オイル交換ステッカーを貼付。',
       points:['交換距離・日付記入']},
    ]},
  ]},

  {id:'d_maint', name:'納車整備', icon:'🔧', type:'workflow', sections:[
    {title:'01 納車前点検', items:[
      {id:'dm1', name:'オイル・液量最終確認', sub:'各液量確認',
       detail:'各液量を最終確認します。',
       points:['エンジンオイル量','冷却水']},
      {id:'dm2', name:'タイヤ空気圧調整', sub:'規定値に調整',
       detail:'4輪のタイヤ空気圧を規定値に調整します。',
       points:['車両の指定空気圧を確認']},
      {id:'dm3', name:'試乗・動作確認', sub:'走行テスト',
       detail:'近隣を試乗し異常がないか確認します。',
       points:['ブレーキの効き']},
    ]},
  ]},

  {id:'d_docs',     name:'書類', icon:'📄', type:'toggle'},
  {id:'d_reg',      name:'登録', icon:'📝', type:'toggle'},
  // v1.0.38: 完全完了（全タスク完了の節目マイルストーン）
  {id:'d_complete', name:'完全完了', icon:'✅', type:'toggle'},
];

// ========================================
// v1.0.32〜33: タスク ON/OFF ＋ 並び替え ＋ カスタム追加 ＋ 期日
// 設定UIで管理（メモリ上、リロードで初期化）
// ========================================

let appTaskEnabled = { regen: {}, delivery: {} };
let appCustomTasks = [];
let appTaskOrder = { regen: [], delivery: [] };
// v1.8.51: 大タスクを「選択制」にできる仕組み（Phase B）
//   appTaskOptional[phase][taskId] = true なら、その大タスクは選択制扱い。
//   選択制の大タスクは新規車両登録／編集／売約確定時のチェックUIで
//   個別に car.selectedTasks[phase][taskId] = true を立てた車だけに表示される。
//   既存（=非選択制）の大タスクはそのまま全車に表示。
let appTaskOptional = { regen: {}, delivery: {} };
// v1.6.1: 各タスクが「詳細チェックリスト」を持つかどうか
//   true  → ChecklistTemplate (tpl_${phase}_${taskId}) と紐づき、編集UIから項目を編集
//   false → 単純トグル（旧来通り）
//   未設定の builtin workflow 系（t_equip / t_regen / d_prep / d_maint）は実質 true 固定
let appTaskMode = { regen: {}, delivery: {} };
// v1.8.12: 各大タスクの「進捗ウエイト（％）」。フェーズごとに合計100％。
//   未設定なら均等割り（後方互換）。t_complete / d_complete（自動判定タスク）は対象外
let appTaskWeight = { regen: {}, delivery: {} };

// v1.2.5: 再生フェーズのデフォルト期日を入れて、期限超過アラートが発火する状態に
let appTaskDeadline = {
  regen: {
    t_equip:   3,
    t_regen:  14,
    t_photo:   5,
    t_estim:   7,
    t_webup:   7,
    t_exhibit:14,
  },
  delivery: {
    d_docs:     5,
    d_maint:    3,
    d_reg:      2,
    d_prep:     1,
    d_complete: 1,
  },
};

function isTaskActive(taskId, phase) {
  const map = (appTaskEnabled && appTaskEnabled[phase]) || {};
  if (taskId in map) return map[taskId] !== false;
  return true;
}

// v1.8.51: タスクが「選択制」かどうか
function isTaskOptional(taskId, phase) {
  // 自動判定タスクは選択制対象外（常に通常タスク）
  if (taskId === 't_complete' || taskId === 'd_complete') return false;
  const map = (appTaskOptional && appTaskOptional[phase]) || {};
  return !!map[taskId];
}

// v1.8.51: その車でこの選択制タスクが選ばれているかどうか
//   - 非選択制タスク → 常に true（全車表示対象）
//   - 選択制タスク → car.selectedTasks[phase][taskId] === true なら true
function isTaskOptedInForCar(car, taskId, phase) {
  if (!isTaskOptional(taskId, phase)) return true;
  if (!car || !car.selectedTasks || !car.selectedTasks[phase]) return false;
  return car.selectedTasks[phase][taskId] === true;
}

// v1.8.51: 設定→「選択制にする」トグル
function setTaskOptional(taskId, phase, optional) {
  if (!appTaskOptional[phase]) appTaskOptional[phase] = {};
  if (optional) appTaskOptional[phase][taskId] = true;
  else delete appTaskOptional[phase][taskId];
  if (window.saveSettings) saveSettings();
}
window.isTaskOptional = isTaskOptional;
window.isTaskOptedInForCar = isTaskOptedInForCar;
window.setTaskOptional = setTaskOptional;

// v1.8.80: 各大タスクの期日は { target: 目標ライン日数, limit: 限界ライン日数 } の2値構造。
//   後方互換：appTaskDeadline[phase][taskId] が「数値」の場合は target のみ設定された旧データ扱い。
//   limit が未設定の場合、要対応判定は旧挙動（target 超過＝赤一発）と等価になる。
function _readDeadlineEntry(taskId, phase) {
  const map = (appTaskDeadline && appTaskDeadline[phase]) || {};
  const v = map[taskId];
  if (v == null || v === '') return { target: null, limit: null };
  if (typeof v === 'object') {
    const t = (v.target == null || v.target === '') ? null : Number(v.target);
    const l = (v.limit  == null || v.limit  === '') ? null : Number(v.limit);
    return {
      target: Number.isFinite(t) && t > 0 ? Math.floor(t) : null,
      limit:  Number.isFinite(l) && l > 0 ? Math.floor(l) : null,
    };
  }
  // 数値 or 文字列の旧フォーマット
  const n = Number(v);
  return {
    target: Number.isFinite(n) && n > 0 ? Math.floor(n) : null,
    limit:  null,
  };
}

// 後方互換：従来通り target（目標ライン日数）を返す
function getTaskDeadline(taskId, phase) {
  return _readDeadlineEntry(taskId, phase).target;
}

// v1.8.80: 目標ライン日数
function getTaskTargetDays(taskId, phase) {
  return _readDeadlineEntry(taskId, phase).target;
}

// v1.8.80: 限界ライン日数（未設定なら null）
function getTaskLimitDays(taskId, phase) {
  return _readDeadlineEntry(taskId, phase).limit;
}

// v1.8.80: { target, limit } をまとめて取得
function getTaskDeadlines(taskId, phase) {
  return _readDeadlineEntry(taskId, phase);
}

function _sortByTaskOrder(tasks, phase) {
  const order = (appTaskOrder && appTaskOrder[phase]) || [];
  if (!order.length) return tasks;
  const indexed = tasks.map((t, i) => {
    const oi = order.indexOf(t.id);
    return { t, key: oi >= 0 ? oi : 1000 + i };
  });
  indexed.sort((a, b) => a.key - b.key);
  return indexed.map(x => x.t);
}

function _allTasksForPhase(phase) {
  const builtin = (phase === 'delivery' ? DELIVERY_TASKS : REGEN_TASKS).map(t => ({
    id: t.id, name: t.name, icon: t.icon, type: t.type, sections: t.sections, builtin: true,
  }));
  const custom = (appCustomTasks || [])
    .filter(t => (t.phases || []).includes(phase))
    .map(t => ({ id: t.id, name: t.name, icon: t.icon, type: 'toggle', _custom: true, builtin: false }));
  return _sortByTaskOrder(builtin.concat(custom), phase);
}

// v1.8.51: car を渡すと、選択制かつ未opt-in のタスクが除外される。
//          car 省略時は「非選択制タスクのみ」を返す（設定UI等で安全に列挙する用途）。
function getActiveRegenTasks(car) {
  return _allTasksForPhase('regen').filter(t => {
    if (!isTaskActive(t.id, 'regen')) return false;
    if (isTaskOptional(t.id, 'regen') && !isTaskOptedInForCar(car, t.id, 'regen')) return false;
    return true;
  });
}

function getActiveDeliveryTasks(car) {
  return _allTasksForPhase('delivery').filter(t => {
    if (!isTaskActive(t.id, 'delivery')) return false;
    if (isTaskOptional(t.id, 'delivery') && !isTaskOptedInForCar(car, t.id, 'delivery')) return false;
    return true;
  });
}

function getAllTasksForUI(phase) {
  return _allTasksForPhase(phase).map(t => {
    const dl = getTaskDeadlines(t.id, phase);
    return {
      id: t.id, name: t.name, icon: t.icon, type: t.type,
      enabled: isTaskActive(t.id, phase),
      builtin: t.builtin,
      // 後方互換：deadline は目標ライン日数（旧 getTaskDeadline と等価）
      deadline: dl.target,
      // v1.8.80: 目標ライン日数 / 限界ライン日数
      targetDays: dl.target,
      limitDays:  dl.limit,
      // v1.6.1: 詳細チェックリストを持つかどうか
      hasChecklist: hasTaskChecklist(t.id, phase),
      // 詳細作成の切替が許可されているか（worksheet系・自動判定系は固定）
      canToggleChecklist: canToggleTaskChecklist(t.id, phase),
      // v1.8.51: 選択制かどうか
      optional: isTaskOptional(t.id, phase),
    };
  });
}

// v1.6.1: 詳細チェックリストを持つかどうか
//   builtin の type='workflow' は常に true（強制）
//   d_complete は常に false（自動判定）
//   それ以外は appTaskMode[phase][taskId] === 'checklist' or appCustomTasks[].mode を見る
function hasTaskChecklist(taskId, phase) {
  // builtin workflow → 常に true
  const builtinList = (phase === 'delivery' ? DELIVERY_TASKS : REGEN_TASKS);
  const b = builtinList.find(t => t.id === taskId);
  if (b && b.type === 'workflow') return true;
  // d_complete / t_complete は自動判定なので常に false（v1.7.17）
  if (taskId === 'd_complete' || taskId === 't_complete') return false;
  // appTaskMode（builtin の toggle 系を checklist 化したケース）
  const m = (appTaskMode && appTaskMode[phase]) || {};
  if (m[taskId] === 'checklist') return true;
  // カスタムタスクの mode
  const c = (appCustomTasks || []).find(t => t.id === taskId);
  if (c && c.mode === 'checklist') return true;
  return false;
}

// 切替可能か（false なら UI で disabled）
function canToggleTaskChecklist(taskId, phase) {
  // builtin workflow は固定ON、変更不可
  const builtinList = (phase === 'delivery' ? DELIVERY_TASKS : REGEN_TASKS);
  const b = builtinList.find(t => t.id === taskId);
  if (b && b.type === 'workflow') return false;
  // d_complete / t_complete は自動判定なので変更不可（v1.7.17）
  if (taskId === 'd_complete' || taskId === 't_complete') return false;
  return true;
}

// 詳細作成スイッチを切り替える
//   ON にする時：mode を 'checklist' に。テンプレ未存在なら空テンプレを作る
//   OFF にする時：mode を 'simple' に。テンプレ自体は削除しない（誤操作対策）
function setTaskChecklistMode(taskId, phase, hasChecklist) {
  if (!canToggleTaskChecklist(taskId, phase)) return false;
  const newMode = hasChecklist ? 'checklist' : 'simple';
  // カスタムタスクの場合は appCustomTasks 側
  const c = (appCustomTasks || []).find(t => t.id === taskId);
  if (c) {
    c.mode = newMode;
  } else {
    // builtin の toggle 系
    if (!appTaskMode[phase]) appTaskMode[phase] = {};
    appTaskMode[phase][taskId] = newMode;
  }
  return true;
}

// このタスクに紐づく ChecklistTemplate ID を返す（規約：tpl_${phase}_${taskId}）
// v1.7.17: t_equip だけは EQUIPMENT_CATEGORIES から生成される 'tpl_equipment' を使う
//          （装備品チェックの中身を再利用するため）
function templateIdForTask(taskId, phase) {
  if (taskId === 't_equip') return 'tpl_equipment';
  return 'tpl_' + phase + '_' + taskId;
}

function moveTaskOrder(taskId, phase, dir) {
  if (!appTaskOrder[phase]) appTaskOrder[phase] = [];
  let order = appTaskOrder[phase];
  const builtin = (phase === 'delivery' ? DELIVERY_TASKS : REGEN_TASKS).map(t => t.id);
  const custom = (appCustomTasks || []).filter(t => (t.phases || []).includes(phase)).map(t => t.id);
  const all = builtin.concat(custom);
  if (!order.length) order = all.slice();
  if (!order.includes(taskId)) order.push(taskId);
  const idx = order.indexOf(taskId);
  const j = idx + dir;
  if (j < 0 || j >= order.length) return;
  [order[idx], order[j]] = [order[j], order[idx]];
  appTaskOrder[phase] = order;
  if (window.saveSettings) saveSettings();
}

// v1.8.80: target/limit を共通保存ロジックで書き込む
//   - 両方 null → エントリ自体削除
//   - target のみ（limit=null）→ 旧形式（数値）で保存
//   - 両方ある or limit のみ → { target, limit } オブジェクト形式で保存
function _writeDeadlineEntry(taskId, phase, target, limit) {
  if (!appTaskDeadline[phase]) appTaskDeadline[phase] = {};
  const t = (target == null) ? null : Math.floor(Number(target));
  const l = (limit  == null) ? null : Math.floor(Number(limit));
  const tValid = t != null && Number.isFinite(t) && t > 0;
  const lValid = l != null && Number.isFinite(l) && l > 0;
  if (!tValid && !lValid) {
    delete appTaskDeadline[phase][taskId];
  } else if (tValid && !lValid) {
    // 旧フォーマット互換：target のみ → 数値で保存
    appTaskDeadline[phase][taskId] = t;
  } else {
    // limit あり（target がなくても）→ オブジェクト形式
    appTaskDeadline[phase][taskId] = {
      target: tValid ? t : null,
      limit:  lValid ? l : null,
    };
  }
}

// 後方互換：従来通り target（目標ライン日数）を設定（旧挙動）
function setTaskDeadline(taskId, phase, value) {
  setTaskTargetDays(taskId, phase, value);
}

// v1.8.80: 目標ライン日数を設定
function setTaskTargetDays(taskId, phase, value) {
  const entry = _readDeadlineEntry(taskId, phase);
  const v = (value == null || value === '') ? null : Number(value);
  const t = (v == null || !Number.isFinite(v) || v <= 0) ? null : Math.floor(v);
  _writeDeadlineEntry(taskId, phase, t, entry.limit);
  if (window.saveSettings) saveSettings();
}

// v1.8.80: 限界ライン日数を設定
function setTaskLimitDays(taskId, phase, value) {
  const entry = _readDeadlineEntry(taskId, phase);
  const v = (value == null || value === '') ? null : Number(value);
  const l = (v == null || !Number.isFinite(v) || v <= 0) ? null : Math.floor(v);
  _writeDeadlineEntry(taskId, phase, entry.target, l);
  if (window.saveSettings) saveSettings();
}
