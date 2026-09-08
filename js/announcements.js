// ========================================
// announcements.js (v2.7)
// 「お知らせ」：新機能の使い方などを“メール的”に配信する受信箱。
//
// ・お知らせ本体は ANNOUNCEMENTS 配列にコード定義（開発側が新機能リリース時に追記）。
// ・既読状態はアカウントごと（Firestore のスタッフドキュメント staff/{uid}.readAnnouncements）。
//     保存は _getReadAnnounce / _setReadAnnounce に集約（dbStaff.saveMyAnnounceRead 経由）。
// ・サイドバー「お知らせ」に未読件数バッジ（#announce-badge）。
// ・ログイン後、未読があればポップアップを「古い順」に1件ずつ表示し「確認」で既読化。
//   受信箱（パネル）はバージョンが新しい順に並べる。
//
// 運用ルール：新機能を追加したら MINOR（真ん中）バージョンを上げ、ここに version 付きで1件追記する。
// ========================================

// ----- お知らせデータ（version は対応バージョン、date は YYYY-MM-DD） -----
//   seed:true … 公開時点で「全員既読扱い」（過去機能のまとめ）。ポップアップは出さず受信箱では確認済み表示。
//   今後の新機能は seed を付けない → 新着ポップアップで通知される。
const ANNOUNCEMENTS = [
  {
    id: 'a-20260908-v2550',
    version: '2.55.0',
    date: '2026-09-08',
    title: '\u{1FA9C} 大タスクの丸が「1回で1工程すすむ」形になりました＋月次締めの直し',
    body: `
      <p><b>\u25BC 大タスクの丸（中タスク）</b></p>
      <ul>
        <li>工程が分かれている大タスクは、<b>丸を押すと1工程ずつオレンジに塗られます</b>。
            4工程なら25％ずつ。<b>最後まで行くと緑</b>になります。</li>
        <li>大タスクの名前の右に、<b>いまやっている工程の名前</b>が出ます。</li>
        <li><b>緑になった丸をもう一度押すと 0％ に戻ります。</b>（大タスクと同じ感覚です）</li>
        <li>その工程に細かいチェックがぶら下がっている時だけ「<b>開く →</b>」が出ます。
            出ていない工程は、その場で丸を押して進めてください。</li>
        <li>設定 → タスク・進捗 → ⋮ で、大タスクごとに
            <b>大タスク／中タスク／小タスク／中→小タスク</b> を選べます。</li>
      </ul>
      <p><b>\u25BC 月次集計締めの直し（締める人向け）</b></p>
      <ul>
        <li>🔴 <b>締めた車が在庫から消えず、実績がダブって見える不具合を直しました。</b>
            ゆうた以外が締めると「在庫から消せませんでした」で止まっていました。</li>
        <li><b>販売実績（過去車）が、他の端末の変更にその場で追いつく</b>ようになりました。
            これまではログインし直すまで古いままでした。</li>
        <li>ダブって残っている車がある場合、<b>販売実績の一番上にオレンジの案内</b>が出ます。
            <b>その月の月次締めをもう一度実行すれば片付きます。</b></li>
        <li>売上・台数の数字は、ダブっている間も<b>同じ車を1回だけ数えます</b>。</li>
      </ul>`
  },
  {
    id: 'a-20260819-fusen',
    version: '2.43.1',
    date: '2026-08-19',
    title: '\u{1F4DD} 付箋に「返信」を書けるようになりました＋PitFlow・MHS の付箋もまとめて見られます',
    body: `
      <p><b>付箋のカードの中に「返信を書く…」が出ます。</b>押すとその場で広がって書けます。</p>
      <p><b>▼ 返信</b></p>
      <ul>
        <li><b>ふつうの付箋も、回覧の付箋も、どちらも返信できます。</b>
            これまで<b>回覧の付箋には返信が出ませんでした</b>が、書けるようになりました。</li>
        <li><b>誰でも・何回でも</b>書けます。担当でなくても、回覧を確認していなくてもかまいません。</li>
        <li>🔴 <b>回覧の「✓ 自分が確認」とは別ものです。</b>返信を書いても確認したことにはなりません。
            確認は今までどおりボタンを押してください。</li>
        <li>返信には<b>書いた人と時刻</b>が残ります。<b>消せるのは自分の返信だけ</b>です（管理者は全部消せます）。</li>
        <li>今までどおり「⋮」からも書けます。</li>
      </ul>
      <p><b>▼ まとめて表示（新しいボタン）</b></p>
      <ul>
        <li>「＋ 付箋を追加」の<b>左</b>のボタンを押すと、<b>PitFlow と MHS の付箋も一緒に</b>並びます。</li>
        <li>よそのアプリの付箋には <b>「PitFlow」「MHS」の札</b>が付きます。</li>
        <li>この状態でも <b>返信</b>と<b>チェック（済にする・回覧の「✓ 自分が確認」）</b>ができます。
            押した内容は<b>そのアプリにそのまま反映されます</b>。</li>
        <li>🔴 よその付箋は<b>編集・消去・並べ替えはできません</b>。直したい時はそのアプリで開いてください。</li>
        <li><b>もう一度押すか、別の画面へ移ると元に戻ります。</b></li>
      </ul>
      <p>※ この返信は <b>PitFlow・MHS の付箋と同じ作り</b>です。3つとも同じ見た目・同じ操作になりました。</p>`
  },
  {
    id: 'a-20260805-members-core',
    version: '2.35.0',
    date: '2026-08-05',
    title: '\u{1F465} メンバーが「社員名簿（CoreMembers）の全員」になりました／呼び名で出ます',
    body: `
      <p>CarFlow のメンバーの扱いを <b>PitFlow と同じ</b>にしました。</p>
      <ul>
        <li><b>社員名簿（CoreMembers）に載っている人が全員出ます。</b>
            これまでは「CarFlow を使える人」しか出ていなかったので、
            <b>ログインしないアルバイトや回送の方を付箋の担当に選べませんでした</b>。これができるようになります。</li>
        <li><b>呼び名で出ます。</b>CoreMembers に呼び名（普段そう呼んでいる名前）を入れてある人は、
            本名ではなく<b>その呼び名</b>で出ます。</li>
        <li><b>付箋の「👥 車販メンバー」「👥 他部署メンバー」が効くようになりました。</b>
            社員名簿の<b>部署</b>から自動で振り分けます。<b>部署名に「車販」が入っていれば車販</b>（<b>兼任でも車販</b>）、
            整備部などはそれ以外。CarFlow 側で人を割り当てる操作はありません。<b>直すのは CoreMembers です。</b></li>
        <li>メンバー一覧は<b>全員が1つの並び</b>で出て、CarFlow に入れる人には <b>「CarFlow」</b>の印、
            入れない人には <b>「名簿だけ」</b>の印が付きます。</li>
      </ul>
      <p>※ 付箋の担当だけが「全員」です。車両の担当など、ほかの場所は今までどおり <b>CarFlow を使える人</b>から選びます。
      すでに担当が入っている付箋は<b>そのまま</b>です（人の番号の付け方は変えていません）。</p>
      <p><b>あわせて2つ直しました。</b>①<b>会社の名簿が社外の人にも読めた</b>状態を、社員だけに締めました。
      ②<b>CoreFlow から先に登録した人が写真を1枚も上げられなかった</b>のを直しました
      （名簿の番号とログインの番号が違う人が対象です）。</p>
    `
  },
  {
    id: 'a-20260805-pit-hover',
    version: '2.34.0',
    date: '2026-08-05',
    title: '\u{1F5B1} 整備依頼のカードに<マウスを乗せる>だけで、中身が全部見られるようになりました',
    body: `
      <p><strong>「🔧 整備依頼業務」</strong>と<strong>ダッシュボードの「今日・明日の整備依頼」</strong>で、
      カードに<strong>マウスを乗せる</strong>と、右側に<strong>詳細カード</strong>が出ます。
      PitFlow のタスクボードで出るものと<strong>同じ中身</strong>です。</p>
      <ul>
        <li>お客様名・カナ・メーカー車種・ナンバー・カルテNo・課・担当が<strong>省略なしで全部</strong></li>
        <li>付いている印を全部（代車・洗車・緊急・クレーム・試運転・ライト磨き・コーティング・保証/保険・左ハンドル・土足禁止 など）</li>
        <li><strong>預かり何日目 ／ このフェーズ何日目 ／ 代車リミット（あと何日）</strong></li>
        <li>予約内容メモ・引継ぎメモ・車販依頼メモ／完TEL待ち・返車待ちなら確定金額・返車予定日・返車時間・洗車・お礼LINE</li>
      </ul>
      <p>今までは「これ誰の車だっけ？」を確かめるのに PitFlow を開く必要がありましたが、
      <strong>乗せるだけ</strong>で分かるようになりました。</p>
      <p><strong>※ ここは見るだけです。</strong>PitFlow ではこの詳細カードに引継ぎメモや返車日を直接書き込めますが、
      CarFlow では<strong>読むだけ</strong>にしてあります。直したい時は今までどおり
      <strong>カードをクリック</strong>して PitFlow で開いてください。</p>
    `
  },
  {
    id: 'a-20260805-pit-sales',
    version: '2.33.0',
    date: '2026-08-05',
    title: '\u{1F527} 整備依頼業務（洗車・コーティング等）が CarFlow から見られる・その場で済みにできるようになりました',
    body: `
      <p>左メニューの<strong>ダッシュボードのすぐ下</strong>に <strong>「🔧 整備依頼業務」</strong> が増えました。
      PitFlow の「車販作業」の画面が<strong>そのまま</strong>出ます。</p>
      <ul>
        <li><strong>出るもの</strong>＝洗車（今日・明日／今週の予定）・車検ヘッドライト磨き・コーティング依頼・直近1か月のコーティング予定・その他依頼事項。</li>
        <li><strong>「✓ 完了」を押すと PitFlow 側でも完了になります。</strong>逆に PitFlow で完了にすれば、こちらからも消えます。どちらの画面から触っても同じです。</li>
        <li>間違えたら <strong>「↩ 戻す」</strong> で元に戻せます。</li>
        <li><strong>カードをクリックすると PitFlow が別タブで開きます</strong>（日付や内容の編集は今までどおり PitFlow 側で）。</li>
      </ul>
      <p><strong>ダッシュボードにも増えました。</strong>「🚨 要対応アクション」の<strong>すぐ上</strong>に
      <strong>「🔧 今日・明日の整備依頼」</strong>が出ます。今日・明日にやる分だけを1行ずつ並べていて、
      右端の <strong>「✓ 済」</strong> でその場で片付けられます。今週ぶん・日付未定のものは件数だけ出るので、
      「整備依頼業務をひらく」から一覧で見てください。</p>
      <p>※ CarFlow のデータが増えたわけではありません。<strong>PitFlow のデータを直接見ています</strong>。</p>
    `
  },
  {
    id: 'a-20260801-sync-lamp',
    version: '2.32.0',
    date: '2026-08-01',
    title: '\u{1F7E2} 同期ランプが「いまどうなっているか」を教えてくれるようになりました',
    body: `
      <p>画面右上の小さなランプ（今まで <b>同期</b> と出ていたところ）が、<b>状態によって色と文字が変わる</b>ようになりました。</p>
      <ul>
        <li><b>同期済み</b>（緑）… 保存が終わって、全員と同じ状態です</li>
        <li><b>同期中</b>（黄）… いま保存しています</li>
        <li><b>受信</b>（青）… 他の人の変更が届きました</li>
        <li><b>オフライン</b>（赤）… ネットが切れています。直した内容はこの画面には残っていますが、まだ全員には届いていません</li>
        <li><b>保存エラー</b>（赤・点滅）… 保存できませんでした。通信を確認してください</li>
      </ul>
      <p>ランプを<b>押すと</b>、ランプのすぐ下に <b>「全員と共有中です（最後の同期 14:32:05）」</b> と出ます（CarFlowの青いふきだし）。他のアプリも同じ見え方に揃えました。</p>
    `,
  },
  {
    id: 'a-20260628-note-created',
    version: '2.29.0',
    date: '2026-06-28',
    title: '🕒 付箋に作成日時が入るようになりました',
    body: `
      <p>付箋の <b>担当メンバーの上の点線、その右端</b> に、<b>付箋を作った日時</b> が自動で入るようになりました（例：<b>6/8 14:30</b>）。年は省いてコンパクトに表示します。</p>
      <p>これまでの付箋も、だいたいの作成日時をさかのぼって表示します。</p>
    `,
  },
  {
    id: 'a-20260623-car-note',
    version: '2.28.0',
    date: '2026-06-23',
    title: '🗒️ 車両詳細から、その車の付箋をすぐ作れるようになりました',
    body: `
      <p>車両詳細を開いた <b>右上の「×（閉じる）」の左</b> に、<b>🗒️ ボタン</b> が増えました。<br>
      押すと、<b>その車の管理番号と車名がタイトルに入った状態</b> で付箋を作れます（例：<b>KM2027 ダイハツ タント カスタム</b>）。</p>

      <h4 style="margin:14px 0 4px">使い方</h4>
      <ul>
        <li>車両詳細の右上 <b>🗒️</b> を押す → いつもの付箋作成画面が開きます。</li>
        <li>タイトルは自動で入っているので、<b>本文・回覧／実行・担当メンバー・色・期限</b> を入れて保存するだけ。</li>
        <li>タイトルの管理番号は <b>クリックでその車に飛べるリンク</b> になります。</li>
      </ul>

      <p style="margin-top:10px;color:var(--text2)">付箋の中身（回覧・実行・メンバー選定・表示・並び替えなど）は <b>これまでと全く同じ</b> です。<b>作る場所が増えただけ</b> で、できた付箋は付箋ボードにいつも通り並びます。</p>
    `
  },
  {
    id: 'a-20260612-customer-name',
    version: '2.26.0',
    date: '2026-06-12',
    title: '🧑 売約のお客様の「顧客名」を登録できるようになりました',
    body: `
      <p>売約の車両に <b>お客様の名前</b> を登録できるようになりました。<br>
      「○○さんのアクア」のように呼んだり、書類づくりの時に名前を確認するのに使えます。</p>

      <h4 style="margin:14px 0 4px">① 名前の付け方（基本）</h4>
      <ul>
        <li>カードを <b>展示 → 納車準備</b> に動かした時に出るポップアップに <b>「顧客名」欄</b> が増えました。納車予定日と一緒に入れてください。</li>
        <li>あとからでも、車両カードの <b>「車両詳細を編集」→ 売約スイッチの下</b> で入れ直せます。</li>
        <li>名前だけ入れればOK（例：<b>山田 たろう</b>）。表示時は自動で <b>「様」</b> が付きます。法人名などもそのまま入ります。<br>名前の間のスペースは、全角で打っても自動で半角に揃います。</li>
      </ul>

      <h4 style="margin:14px 0 4px">② どこに出る？</h4>
      <ul>
        <li>カードの <b>本体価格の下</b>／<b>車両詳細の車種名の右</b>／<b>販売実績の管理番号の隣</b> に出ます。</li>
        <li>長い名前は「…」で省略され、<b>マウスを乗せると全文</b>が出ます。カードが小さく畳まれている時は表示しません。</li>
      </ul>

      <p style="margin-top:12px;font-size:12.5px;color:#888">※ 入力は任意です。販売実績にも履歴として残ります。</p>
    `,
  },
  {
    id: 'a-20260609-board-pdf',
    version: '2.22.0',
    date: '2026-06-09',
    title: '📎 付箋に「PDF」も添付できるようになりました（画像に加えて）',
    body: `
      <p>これまで付箋に添付できるのは <b>画像だけ</b> でしたが、<b>PDFも添付</b> できるようになりました。<br>
      見積書・FAX・書類などをそのまま付箋に貼って共有できます。</p>

      <h4 style="margin:14px 0 4px">① やり方</h4>
      <ul>
        <li>付箋を追加／編集するときの <b>「画像・PDF（任意）」</b> から PDF ファイルを選ぶだけ。</li>
        <li>1つの付箋につき添付は <b>1点</b>（画像か PDF のどちらか）。入れ直すと前の添付と差し替わります。</li>
      </ul>

      <h4 style="margin:14px 0 4px">② 見え方</h4>
      <ul>
        <li>付箋カードに <b>📄 ファイル名</b> のリンクが出ます。<b>クリックで別タブに PDF が開きます</b>。</li>
        <li>画像は今まで通りサムネ表示＋クリックで全画面プレビュー（左右が切れないよう表示も直しました）。</li>
      </ul>

      <p style="margin-top:12px;font-size:12.5px;color:#888">※ 1ファイル10MBまで。社内メンバーのみ閲覧できます。</p>
    `
  },
  {
    id: 'a-20260605-tentative-cars',
    version: '2.19.0',
    date: '2026-06-05',
    title: '🕗 「仮登録車両」ができました（登録忘れ防止・話が出た段階で先に置いておく）',
    body: `
      <p>これまでは <b>車が入庫してから登録</b> していましたが、それだと「登録するのを忘れてた！」が起きていました。<br>
      そこで、<b>「話が出た段階」で先にカードだけ作っておける</b>場所を用意しました。</p>

      <p style="margin:10px 0;padding:8px 10px;background:rgba(236,72,153,.10);border-left:3px solid #ec4899;border-radius:4px;font-size:12.5px">
        たとえば…　<b>納車するお客さんの下取り車</b>／<b>買取の話が来ているもの</b>／<b>遠くのオートオークションで買って到着待ちの車</b>　など。<br>
        「まだ来てないけど、話はある」── そんな車をここに置いておけます。
      </p>

      <h4 style="margin:14px 0 4px">① どこにある？</h4>
      <ul>
        <li>タスク管理（カンバン）の <b>一番左に「🕗 仮登録車両」の列（ピンク色）</b>が増えました</li>
        <li>左メニューの「➕ 新規車両登録」の下に <b>「🕗 仮登録車両追加」</b>ボタンがあります。ここから登録します</li>
      </ul>

      <h4 style="margin:14px 0 4px">② 何を入れるの？</h4>
      <ul>
        <li>入れるのは <b>メーカー・車種・理由・メモ</b> だけ。写真や金額はまだ要りません（来てないので）</li>
        <li><b>理由</b>はプルダウンから選べます：買取予定／下取り予定／陸送予定／その他</li>
        <li><b>メモ</b>には「6/15頃 到着予定」「北海道のAAより」など、分かっていることを自由に書いてください</li>
        <li><b>この段階では管理番号（KM-XXXX）は付きません</b>。まだ仮だからです</li>
      </ul>

      <h4 style="margin:14px 0 4px">③ 実際に車が来たら？</h4>
      <ul>
        <li>仮登録のカードを <b>「仕入れ」か「その他」の列にドラッグ</b>してください</li>
        <li>「<b>実際に入庫しましたか？</b>」という確認が出て、OKすると <b>その時に管理番号が自動で振られて</b>、通常の登録になります</li>
        <li>在庫日数のカウントも、この「来た日」からスタートします（仮登録の間はカウントされません）</li>
      </ul>

      <p style="margin:12px 0;padding:8px 10px;background:rgba(55,138,221,.08);border-left:3px solid var(--blue);border-radius:4px;font-size:12.5px">
        💡 <b>なぜ仮の段階では番号を振らないの？</b><br>
        話が無くなってキャンセルになることもありますし、別の車が先に仕入れで入って番号が前後することもあるからです。<br>
        <b>「実際に来た順」で番号が綺麗に並ぶ</b>ように、来た時に振る仕組みにしています。
      </p>

      <h4 style="margin:14px 0 4px">④ 注意してほしいこと</h4>
      <ul>
        <li>仮登録の車は <b>ダッシュボードや販売実績、各種の台数カウントには出てきません</b>（まだ在庫ではないので）</li>
        <li>仮登録カードは <b>クリックすると編集・削除</b>できます（来なくなった話はここで消してください）</li>
        <li>逆に、すでに登録済みの車を間違えて「仮登録」に戻そうとすると <b>「通常はあり得ない操作です」と2回確認</b>が出ます。基本は触らないでください</li>
      </ul>

      <p style="margin-top:14px">まずは <b>下取りや買取の話が出た時に、その場でサッと仮登録</b>──を習慣にしてもらえると、登録漏れがぐっと減るはずです。</p>
    `,
  },
  {
    id: 'a-20260531-num-list-v2',
    version: '2.17.0',
    date: '2026-05-31',
    title: '🔢 管理番号まわりを大幅強化（リスト・自動入力・削除2択・重複検出・手入力）',
    body: `
      <p>管理番号（KM-XXXX）の<b>取りこぼし・重複・抜け</b>を減らすため、5つの仕組みを入れました。</p>

      <h4 style="margin:12px 0 4px">📋 サイドバー「管理 > 管理番号リスト」</h4>
      <ul>
        <li>全管理番号の使用状況が <b>1番上＝最新</b> の番号順で一覧表示</li>
        <li>結果欄に <b>在庫中／売約済／納車完了／削除済／欠番</b> が色付きバッジで表示</li>
        <li>上部サマリーで「最大番号」「次の番号」「各カテゴリの件数」「欠番件数」「🚨重複件数」が一目で見えます</li>
        <li>在庫中・売約済の行はクリックで車両詳細が開きます</li>
      </ul>

      <h4 style="margin:14px 0 4px">✨ 新規車両登録：次の番号を自動プリセット＋重複警告</h4>
      <ul>
        <li>新規登録モーダルを開くと <b>管理番号欄に「次の番号」（最大+1）が自動で入ります</b>。そのまま使うも、手動で書き換えるも自由</li>
        <li>入力中に <b>既存番号と被ったら赤字で警告＋登録ボタンが押せなくなる</b>（在庫中・アーカイブ済との衝突を防止）</li>
        <li>過去に「正式削除」された番号と被った場合は黄色の注意のみ（任意で再利用可）</li>
      </ul>

      <h4 style="margin:14px 0 4px">🗑️ 車両削除が「正式削除 / 取り消し」の2択に</h4>
      <p>削除ボタンを押すと、次の2択ダイアログが出ます：</p>
      <ul>
        <li><b>📋 正式に削除</b>：AA出品・売約不成立・廃車など、扱いが完了したケース。管理番号リストに「削除済」として残り、次の新規はその次の番号になる</li>
        <li><b>↩️ 取り消し</b>：間違い入力・テスト入力。番号も丸ごと取り消し、次の新規でその番号を <b>再利用できる</b>。記録も残らない</li>
      </ul>
      <p>これで <b>「テスト入力で番号を1つ消費しちゃった」が無くなる</b> 想定です。</p>

      <h4 style="margin:14px 0 4px">🚨 重複検出＋「重複扱い」ボタン</h4>
      <ul>
        <li>同じ番号が複数件あったら、行が <b>赤背景＋🚨マーク</b>でハイライト</li>
        <li>各行に「<b>重複扱い</b>」ボタンを表示。押すと「これは間違い登録」と印を付けて、次の番号計算からも除外（解除も可）</li>
        <li>サマリーに「🚨重複: N件」も常時表示</li>
      </ul>

      <h4 style="margin:14px 0 4px">🟡 手入力での番号追加（穴埋め用）</h4>
      <ul>
        <li>管理番号リストの上部にある <b>「＋ 管理番号を手入力で追加」</b> ボタンを押すと、番号・車種・グレード・メモを入れて追加できる</li>
        <li>イレギュラーで番号を使ったけど実車データが無い時の <b>記録だけ残す用</b>。<b>タスク管理・カンバン・販売実績などの実業務には一切影響なし</b>（管理番号リストにだけ「手入力」バッジで出る）</li>
        <li>既存番号と被ったら <b>「⚠ 超確認」ダイアログ</b>で確認</li>
        <li>常用しないので閉じた状態がデフォルト。必要な時だけボタンで展開してください</li>
      </ul>

      <p style="margin-top:14px;padding:8px 10px;background:rgba(55,138,221,.08);border-left:3px solid var(--blue);border-radius:4px;font-size:12px">
        💡 今までの「番号がズレる」「重複入った」「抜けが分からない」を、管理番号リスト1画面で全部見えるようにしました。
      </p>
    `,
  },
  {
    id: 'a-20260530-autocomplete',
    version: '2.15.0',
    date: '2026-05-30',
    title: '✨ 新規車両登録で「過去データ補完」が出るようになりました',
    body: `
      <p>新規車両登録・編集モーダルの <b>メーカー／車種／グレード／車体色</b> の4箇所で、入力中に <b>過去入庫データから候補リストがニュッと出る</b> ようになりました。</p>
      <ul>
        <li><b>「ぷ」と打つだけで「プリウス」を拾います</b>（ひらがな→カタカナ自動マッチ）</li>
        <li>候補は <b>入力欄の真上にビタづけ表示</b>＝Windowsの予測変換と被らない</li>
        <li><b>頻出順で並びます</b>：よく入る車種ほど入力欄に近い側（リストの一番下）に来ます。一番下がデフォルト選択＝<b>Tabキー1発で確定</b>できます</li>
        <li><b>カスケード絞り込み</b>：メーカー＝トヨタを入れた後に車種「あ」と打つと <b>アクア・アルファード</b> だけ出る（ホンダの「アコード」は混ざらない）</li>
        <li>確定：<b>Tab</b> または <b>クリック</b>　／　閉じる：<b>Esc</b> または欄外クリック</li>
        <li>候補に無い文字列はそのまま自由入力でOK（既存運用は壊さない）</li>
      </ul>
      <p>データ源は <b>在庫＋アーカイブ済の全車両</b>。CarFlow に貯まってる過去データから自動で候補を作っています（マスター登録などは不要）。</p>
    `,
  },
  {
    id: 'a-20260529-coreflow-launcher',
    version: '2.14.0',
    date: '2026-05-29',
    title: '🪐 サイドバー下に「CoreFlow アプリ切替」を追加しました',
    body: `
      <p>サイドバーの一番下に <b>「CoreFlow アプリ切替」</b> のボタンが出るようになりました。マウスを乗せる or クリックすると、右上に4つの色付き玉が <b>「ぴゅっ」</b> と展開します。</p>
      <ul>
        <li>🏠 <b>CoreFlow</b>（ポータルへ戻る）</li>
        <li>🔧 <b>PitFlow</b>（整備工場・準備中）</li>
        <li>🚙 <b>CarFlow</b>（今いるアプリ）</li>
        <li>📦 <b>StockFlow</b>（在庫・卸）</li>
      </ul>
      <p>玉にマウスを乗せると、そのアプリの色が画面いっぱいに広がる演出付き。クリックで他アプリへ1クリックで遷移できます（同じタブで開きます）。</p>
      <p>※ <b>StockFlow にも同じ仕組みを入れました</b>＝両アプリ共通の操作感です。</p>
      <p>※ サイドバー下にあった <b>「アバター＋名前」の枠（YM 山田 スタッフ）</b> は、トップバー右と重複していたため削除しました。アバターは引き続きトップバー右で確認できます。</p>
    `,
  },
  {
    id: 'a-20260525-board-secret',
    version: '2.13.0',
    date: '2026-05-25',
    title: '🔒 付箋を「自分だけのToDo（シークレット）」にできるようになりました',
    body: `
      <p>全体タスク（付箋）を、<b>自分にしか見えない自分用メモ</b>として使えるようになりました。</p>
      <ul>
        <li>付箋を作るとき、<b>担当メンバーに自分ひとりだけ</b>を選ぶと、その付箋は <b>あなたの画面にしか出ません</b>（他の人・ミーティング画面には出ません）</li>
        <li>シークレットの付箋には、タイトル横に <b>🔒 自分用</b> が付きます</li>
        <li><b>自分のほかに誰かを足すと</b>、ふつうの（みんなに見える）付箋に戻ります。あとから人を足したり外したりで切り替えできます</li>
        <li>シークレットの付箋は、<b>赤色にしてもLINE通知は飛びません</b>（自分用なので安心）</li>
      </ul>
      <p>ちょっとした自分のメモ・やることリストとして気軽に使ってください。</p>
    `,
  },
  {
    id: 'a-20260525-board-reply',
    version: '2.12.0',
    date: '2026-05-25',
    title: '💬 付箋に「返信」できるようになりました（実行タイプ）',
    body: `
      <p>全体タスク（付箋）の <b>実行タイプ</b> に <b>返信</b> ができるようになりました。</p>
      <ul>
        <li>付箋の <b>「⋮」メニュー</b> に、「済にする」に加えて <b>「💬 返信する」</b> が増えました</li>
        <li>返信すると、<b>本文の下に自分のアイコンとコメント</b>が並びます（例：「まだ途中です」「時間なかったのでさっとです」）</li>
        <li><b>「済にする」とは別</b>です。状況だけ返信したり、返信してから「済」にしたり、自由に使えます</li>
        <li><b>自分の返信は自分で消せます</b>（コメント横の「×」）。管理者・マネージャーは誰の返信でも消せます</li>
      </ul>
      <p>※ <b>回覧タイプ</b>の付箋はこれまで通り、担当各自が「✓ 自分が確認」を押す方式です（返信は出ません）。</p>
    `,
  },
  {
    id: 'a-20260524-delivery-schedule',
    version: '2.11.0',
    date: '2026-05-24',
    title: '🚚 ダッシュボードに「納車予定」を追加しました',
    body: `
      <p>ダッシュボードの一番上に <b>「納車予定」</b> を追加しました。<b>納車準備中</b>の車を、<b>納車日（早い順）</b>に横並びで表示します。</p>
      <ul>
        <li>カードに <b>納車時間</b> を直接入力できます</li>
        <li>時間が確定したら <b>「確」</b> を押すと、その日の中で先頭に並び、確定マークが付きます</li>
        <li>写真・車種・管理番号・全体進捗％・納車日 をひと目で確認できます（段取り確認用）</li>
      </ul>
      <p>カードをタップすると、これまで通り車両の詳細が開きます。</p>
    `,
  },
  {
    id: 'a-20260524-board-done-3days',
    version: '2.10.4',
    date: '2026-05-24',
    title: '🗑️ 済にした付箋の自動消去を「7日後 → 3日後」に短縮しました',
    body: `
      <p>付箋（全体タスク）を<b>「済」にしてから自動で消えるまでの日数を、7日から3日に短く</b>しました。</p>
      <ul>
        <li>済にした付箋は、これまでより早く（3日で）ボードから自動で消えます</li>
        <li>手動の付箋も、タスクから自動で出る付箋（🤖）も、どちらも対象です</li>
        <li>消える仕組みはこれまでと同じで、ログインしたタイミングでまとめて整理されます</li>
      </ul>
      <p>済んだ付箋が溜まりにくくなり、ボードがすっきり保てます。<b>未済・作業中の付箋は消えません</b>のでご安心ください。</p>
    `,
  },
  {
    id: 'a-20260523-board-circulate',
    version: '2.10',
    date: '2026-05-23',
    title: '🔁 付箋に「回覧」タイプ＆グループ宛て指定を追加',
    body: `
      <p>全体タスク（付箋）が、用途に合わせて2タイプから選べるようになりました（付箋の作成画面・色と期限の間で選択）。</p>
      <ul>
        <li><b>実行</b>：洗車などの作業向け。<b>誰か1人が「済」</b>にすれば完了（従来どおり）</li>
        <li><b>回覧</b>：連絡の確認向け。<b>担当全員が各自で「✓ 自分が確認」</b>を押し、全員そろったら完了。まだの人のアイコンが前に出て、確認済みの人はグレーの✓が付きます</li>
      </ul>
      <p>担当メンバーの選択に <b>「全員」「車販メンバー」「他部署メンバー」</b> などのグループ一括選択ボタンが付きました（メンバーグループはv2.9.0で設定）。</p>
      <p>これで「連絡を見たかどうか」が一目で分かり、「結局だれが消すの？」がなくなります。</p>
    `,
  },
  {
    id: 'a-20260523-member-groups',
    version: '2.9',
    date: '2026-05-23',
    title: '👥 メンバーを「車販／他部署」などのグループに分けられるようになりました',
    body: `
      <p>登録メンバーを<b>グループ</b>に分けて管理できるようになりました。</p>
      <ul>
        <li>最初から <b>「車販メンバー」「他部署メンバー」</b> の2グループを用意（名前は自由に変更でき、3つ目以降も追加できます）</li>
        <li>設定 → メンバー → 各メンバーのプルダウンで所属グループを選択（管理者のみ）</li>
        <li>同じ画面の <b>「👥 メンバーグループ」</b> でグループの追加・名前変更・削除ができます</li>
      </ul>
      <p>このグループは、次の付箋の機能（担当を「車販メンバー」などまとめて指定）でも使えるようになる予定です。</p>
    `,
  },
  {
    id: 'a-20260523-line-task-switch',
    version: '2.8',
    date: '2026-05-23',
    title: '🔔 大タスクごとに「LINE通知する／しない」を選べるようになりました',
    body: `
      <p>これまで「大タスク完了通知」をONにすると、<b>すべての大タスク</b>が完了するたびにLINEへ通知が飛んでいました。</p>
      <p>今回から、<b>大タスクごとに通知する／しないを切り替えられる</b>ようになりました。</p>
      <ul>
        <li>設定 → タスク・進捗 → 各大タスクの <b>⋮（設定）</b> → <b>「完了時にLINE通知」</b> のスイッチで切替</li>
        <li>最初は全タスクON（今まで通り）。通知が多すぎる大タスクをOFFにすれば、そのタスクだけ飛ばなくなります</li>
        <li>OFFにしたタスクは、設定一覧に <b>🔕 通知OFF</b> の目印が付きます</li>
      </ul>
      <p>※ LINE設定の「大タスク完了通知」自体がOFFのときは、これまで通り何も飛びません（全体ON＋個別ONの両方で飛びます）。</p>
    `,
  },
  {
    id: 'a-hist-realtime',
    seed: true,
    version: '1.8',
    date: '2026-05-16',
    title: '🔄 リアルタイム同期',
    body: `<p>複数の端末・スタッフで同時に使っても、カードの変更が<b>リアルタイムで全員の画面に反映</b>されるようになりました。</p>`,
  },
  {
    id: 'a-hist-tax',
    seed: true,
    version: '1.8',
    date: '2026-05-16',
    title: '💴 税モード（税抜／税込の切り替え）',
    body: `<p>金額を<b>税抜／税込</b>で切り替えて表示できるようになりました（設定 → 税扱い）。本体価格と総額の併記にも対応しています。</p>`,
  },
  {
    id: 'a-hist-line',
    seed: true,
    version: '1.8',
    date: '2026-05-16',
    title: '🔔 LINE通知＆2軸期日（目標ライン／限界ライン）',
    body: `<p>タスクに<b>「目標ライン」「限界ライン」</b>の2段階の期日を設定できるようになりました。期日が近づくと<b>社内LINEグループへ自動通知</b>が飛びます（設定 → 通知）。</p>`,
  },
  {
    id: 'a-hist-dashboard',
    seed: true,
    version: '1.8',
    date: '2026-05-16',
    title: '📊 ダッシュボード刷新（サマリー6カード＋着地予測）',
    body: `<p>ダッシュボード上部に在庫・売約・納車の<b>サマリー6カード</b>を追加。さらに今月の販売<b>着地予測</b>（確定／見込み／実績予測）を表示するようにしました。</p>`,
  },
  {
    id: 'a-hist-backoffice',
    seed: true,
    version: '2.1',
    date: '2026-05-18',
    title: '🗂 バックオフィス（売約後の事務処理）',
    body: `<p>売約後の事務処理（原価処理・書類整理など）を専用の<b>「🗂 バックオフィス」</b>ビューで管理できるようになりました（左メニュー）。当月／先月／先々月で整理して見られます。</p>`,
  },
  {
    id: 'a-hist-taskmemo',
    seed: true,
    version: '2.2',
    date: '2026-05-18',
    title: '📝 タスク個別メモ＋自動付箋',
    body: `<p>各大タスクに<b>個別メモ</b>（自由文／日付／時刻）を付けられるようになりました（設定 → タスク・進捗 → 📝メモ設定）。日付メモは全体タスクの<b>緑付箋に自動表示</b>されます。</p>`,
  },
  {
    id: 'a-hist-taskpattern',
    seed: true,
    version: '2.5',
    date: '2026-05-19',
    title: '📦 タスクパターン＆小タスク制',
    body: `<p>大タスクの中身（小タスクのチェックリスト）を<b>「タスクパターン」</b>として管理・編集できるようになりました（設定 → 📦タスクパターン）。各タスクの<b>小タスク制 ON/OFF</b> も自由に切り替えられます。</p>`,
  },
  {
    id: 'a-20260521-theme',
    seed: true,
    version: '2.6',
    date: '2026-05-21',
    title: '🎨 テーマが4種類になりました（ライト刷新＋リキッドガラス）',
    body: `
      <p>画面のテーマが <b>4種類</b> から選べるようになりました。</p>
      <ul>
        <li>🌙 ダーク／☀️ ライト（白グレーで見やすく刷新）</li>
        <li>✨ ダーク・リキッド／💎 ライト・リキッド（ガラス風の半透明デザイン）</li>
      </ul>
      <p><b>切り替え方</b>：画面右上の文字サイズ「AAA」の右隣のボタンを押すごとに4テーマを順番に切替できます。設定 → 表示設定 からも選べます。</p>
      <p>スマホの現場モードでは、上部の 🌙/☀️ ボタンでダーク/ライトをワンタップ切替できます。</p>
    `,
  },
  {
    id: 'a-20260521-memo',
    seed: true,
    version: '2.7',
    date: '2026-05-21',
    title: '📝 ダッシュボードに「車両メモ一覧」を追加',
    body: `
      <p>これまで車両のメモは、カードを1台ずつ開かないと確認できませんでした。</p>
      <p>ダッシュボードの「全体タスク（付箋）」の下に <b>車両メモ一覧</b> を追加し、メモのある車をまとめて確認できるようになりました。</p>
      <ul>
        <li>「その他／在庫車／売約車」の3グループで表示</li>
        <li>各行に コアメモ・作業メモ・大タスクのメモ をコンパクト表示</li>
        <li><b>管理番号をクリック</b>すると車両の詳細が開きます</li>
        <li>通常は折りたたみ。「詳細 ▼」で展開します</li>
      </ul>
    `,
  },
  {
    id: 'a-20260521-log',
    seed: true,
    version: '2.7',
    date: '2026-05-21',
    title: '📋 操作ログが見やすくなりました',
    body: `
      <p>操作ログ（管理 → 操作ログ）の表示を改善しました。</p>
      <ul>
        <li><b>管理番号をクリック</b>すると、その車両の詳細が開きます</li>
        <li>「t_webup」のような内部の記号を、<b>日本語のタスク名</b>（例：webUP）で表示するようにしました</li>
      </ul>
    `,
  },
];

// ----- 既読状態（アカウントごと＝Firestore のスタッフドキュメント） -----
function _getReadAnnounce() {
  const s = window.fb && window.fb.currentStaff;
  const r = s && s.readAnnouncements;
  return Array.isArray(r) ? r.slice() : [];
}
function _setReadAnnounce(arr) {
  const list = Array.isArray(arr) ? arr.slice() : [];
  if (window.fb && window.fb.currentStaff) {
    window.fb.currentStaff.readAnnouncements = list;   // ローカル即時反映
  }
  if (window.dbStaff && typeof window.dbStaff.saveMyAnnounceRead === 'function') {
    window.dbStaff.saveMyAnnounceRead(list);            // Firestore へ保存（非同期・待たない）
  }
}
// seed:true（公開時点で全員既読扱い）か、保存済み既読に含まれていれば「既読」とみなす
function _isAncRead(id, readArr) {
  if (readArr && readArr.indexOf(id) !== -1) return true;
  const a = ANNOUNCEMENTS.find(x => x.id === id);
  return !!(a && a.seed);
}
function announceUnreadCount() {
  const read = _getReadAnnounce();
  return ANNOUNCEMENTS.filter(a => !_isAncRead(a.id, read)).length;
}
function _markAnnounceRead(id) {
  const read = _getReadAnnounce();
  if (read.indexOf(id) === -1) { read.push(id); _setReadAnnounce(read); }
  refreshAnnounceBadge();
}
function markAllAnnounceRead() {
  _setReadAnnounce(ANNOUNCEMENTS.map(a => a.id));
  refreshAnnounceBadge();
  renderAnnounce();
}

// ----- サイドバーの未読バッジ -----
function refreshAnnounceBadge() {
  const el = document.getElementById('announce-badge');
  if (!el) return;
  const n = announceUnreadCount();
  // .sb-badge は CSS で display:none 固定なので、表示時は明示的に inline-block にする
  if (n > 0) { el.textContent = String(n); el.style.display = 'inline-block'; }
  else { el.textContent = ''; el.style.display = 'none'; }
}

// ----- 受信箱の描画 -----
function _ancEsc(s) {
  if (typeof escapeHtml === 'function') return escapeHtml(s);
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// バージョン比較（"2.7" > "2.6"）。昇順差分を返す。
function _verNum(v) {
  const p = String(v == null ? '0' : v).split('.').map(n => parseInt(n, 10) || 0);
  return (p[0] || 0) * 10000 + (p[1] || 0) * 100 + (p[2] || 0);
}
function _verCmp(a, b) { return _verNum(a) - _verNum(b); }
function renderAnnounce() {
  const host = document.getElementById('announce-list');
  if (!host) return;
  const read = _getReadAnnounce();
  // 受信箱：バージョンが新しい順（同点は日付が新しい順）
  const items = ANNOUNCEMENTS.slice().sort((a, b) => _verCmp(b.version, a.version) || String(b.date || '').localeCompare(String(a.date || '')));
  if (!items.length) {
    host.innerHTML = '<div class="anc-empty">お知らせはありません</div>';
    refreshAnnounceBadge();
    return;
  }
  host.innerHTML = items.map(a => {
    const isRead = _isAncRead(a.id, read);
    const isOpen = window._ancOpen === a.id;
    const verTag = a.version ? '<span class="anc-ver">v' + _ancEsc(a.version) + '</span>' : '';
    const footer = isRead
      ? '<div class="anc-footer"><span class="anc-confirmed">✓ 確認済み</span></div>'
      : '<div class="anc-footer"><button type="button" class="anc-confirm-btn" onclick="confirmAnnounce(\'' + a.id + '\')">✓ 確認する（OK）</button></div>';
    return '<div class="anc-item ' + (isRead ? 'is-read' : 'is-unread') + (isOpen ? ' is-open' : '') + '">'
      + '<div class="anc-head" onclick="toggleAnnounce(\'' + a.id + '\')">'
      + '<span class="anc-dot"></span>'
      + verTag
      + '<span class="anc-title">' + _ancEsc(a.title) + '</span>'
      + '<span class="anc-date">' + _ancEsc(a.date || '') + '</span>'
      + '<span class="anc-caret">' + (isOpen ? '▲' : '▼') + '</span>'
      + '</div>'
      + '<div class="anc-body" style="' + (isOpen ? '' : 'display:none') + '">' + (a.body || '') + footer + '</div>'
      + '</div>';
  }).join('');
  refreshAnnounceBadge();
}
function toggleAnnounce(id) {
  // 開閉のみ。既読化は「確認する（OK）」ボタンで明示的に行う。
  window._ancOpen = (window._ancOpen === id) ? null : id;
  renderAnnounce();
}
function confirmAnnounce(id) {
  _markAnnounceRead(id);
  renderAnnounce();
}

// ----- ログイン後の「新着お知らせ」ポップアップ（よくあるソフトの What's New 挙動） -----
function _ancPopupEl() {
  let el = document.getElementById('announce-popup-overlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'announce-popup-overlay';
    document.body.appendChild(el);
  }
  return el;
}
// 未読を「古い順（バージョン昇順→日付昇順）」で返す
function _unreadAncSorted() {
  const read = _getReadAnnounce();
  return ANNOUNCEMENTS.filter(a => !_isAncRead(a.id, read))
    .sort((a, b) => _verCmp(a.version, b.version) || String(a.date || '').localeCompare(String(b.date || '')));
}
// 未読があればポップアップを出す（ログイン直後・1回）。複数あれば「古い順」に1件ずつ表示。
function maybeShowAnnouncePopup() {
  if (window._ancPopupShown) return;
  // v2.10.6: スマホ（画面幅≤768）では新着ポップアップを出さない。受信箱と未読バッジは残るので見たい時は自分で開ける
  if (window.innerWidth <= 768) return;
  const unread = _unreadAncSorted();
  if (!unread.length) return;
  window._ancPopupShown = true;
  window._ancQueue = unread;
  window._ancQueueIdx = 0;
  _showAncQueueItem();
}
function showAnnouncePopup() {
  const unread = _unreadAncSorted();
  if (!unread.length) return;
  window._ancQueue = unread;
  window._ancQueueIdx = 0;
  _showAncQueueItem();
}
// キューの現在位置の1件を表示
function _showAncQueueItem() {
  const q = window._ancQueue || [];
  const i = window._ancQueueIdx || 0;
  if (i >= q.length) { closeAnnouncePopup(); return; }
  const a = q[i];
  const verTag = a.version ? '<span class="anc-ver">v' + _ancEsc(a.version) + '</span>' : '';
  const progress = (q.length > 1) ? '<span class="anc-popup-progress">' + (i + 1) + ' / ' + q.length + '</span>' : '';
  const okLabel = (i + 1 < q.length) ? '確認して次へ ▶' : '確認';
  const el = _ancPopupEl();
  el.innerHTML = '<div class="modal anc-popup">'
    + '<div class="anc-popup-head"><span class="anc-popup-icon">📢</span>'
    + '<span class="anc-popup-title">新着のお知らせ</span>' + progress + '</div>'
    + '<div class="anc-popup-body">'
    + '<div class="anc-popup-item-head">' + verTag
    + '<span class="anc-popup-item-title">' + _ancEsc(a.title) + '</span>'
    + '<span class="anc-popup-item-date">' + _ancEsc(a.date || '') + '</span></div>'
    + '<div class="anc-popup-item-body">' + (a.body || '') + '</div>'
    + '</div>'
    + '<div class="anc-popup-foot">'
    + '<button type="button" class="anc-popup-later" onclick="closeAnnouncePopup()">後で</button>'
    + '<button type="button" class="anc-popup-ok" onclick="confirmAnnouncePopup()">' + okLabel + '</button>'
    + '</div></div>';
  el.classList.add('open');
}
function closeAnnouncePopup() {
  const el = document.getElementById('announce-popup-overlay');
  if (el) el.classList.remove('open');
}
// 「確認」：今表示中の1件を既読にし、次の1件（より新しい方）へ。なければ閉じる。
function confirmAnnouncePopup() {
  const q = window._ancQueue || [];
  const i = window._ancQueueIdx || 0;
  if (q[i]) _markAnnounceRead(q[i].id);
  window._ancQueueIdx = i + 1;
  if (window._ancQueueIdx < q.length) {
    _showAncQueueItem();
  } else {
    closeAnnouncePopup();
    if (typeof renderAnnounce === 'function') renderAnnounce();
  }
}
