/**
 * CarFlow 装備品マスター（v1.0.20〜）
 *
 * このファイルは「装備品チェック」の項目定義です。
 * カテゴリ・項目・入力タイプ・説明文をすべてここで管理します。
 *
 * ▼ 項目を追加する：該当カテゴリの items 配列に追加
 * ▼ 項目を削除する：該当 items から削除（既存データのキーが残っていても無視されるだけ）
 * ▼ 項目を並べ替え：配列の順序をいじる
 * ▼ カテゴリを増やす：EQUIPMENT_CATEGORIES に追加
 *
 * type の種類：
 *   - 'tri'    … 3状態トグル（未チェック / あり(緑) / なし(赤)）。基本これ
 *   - 'select' … 選択肢から1つ選ぶ（例：フルセグ/ワンセグ/なし）
 *   - 'status' … OK / NG / 未確認 の3択（動作確認用）
 *   - 'text'   … 自由記述（任意、コメント欄）
 *
 * group：同じ group 文字列を持つ項目は UI 上でひとまとまりに表示される
 * help：分からない人向けの説明（洗車スタッフが見ても分かる言葉で）
 */

const EQUIPMENT_CATEGORIES = [
  // ─────────────────────────────────────────
  // 🎵 オーディオ・ナビ系
  // ─────────────────────────────────────────
  {
    id: 'audio',
    label: 'オーディオ・ナビ',
    icon: '🎵',
    items: [
      { id: 'navi',       label: 'カーナビ',       type: 'tri',    help: 'ダッシュボード中央にある画面のこと。地図が出るやつ。社外品の後付ナビでもOK。',
        media: [
          { type:'youtube', videoId:'fSce9VopfIU', caption:'純正ナビと社外ナビの見分け方（参考動画）', durationSec:342 }
        ] },
      { id: 'navi_media', label: 'ナビの媒体',     type: 'select', options: ['HDD', 'SSD/メモリ', 'DVD', 'なし/不明'], group: 'navi_g',
        help: 'ナビの中身が何でできているか。ナビの設定画面か取説で確認。分からなければ「なし/不明」でOK。' },
      { id: 'tv',         label: 'TV',             type: 'select', options: ['フルセグ', 'ワンセグ', 'なし'], group: 'navi_g',
        help: 'ナビ画面でTVが映るか。「フルセグ」は地デジで綺麗、「ワンセグ」は携帯みたいな粗い画質。映らなければ「なし」。' },
      { id: 'bt',         label: 'Bluetooth',      type: 'tri', group: 'navi_g',
        help: 'スマホとナビをワイヤレスで繋げる機能。ナビの設定で「Bluetooth」項目があれば「あり」。' },
      { id: 'bcamera',    label: 'バックカメラ',   type: 'tri', group: 'navi_g',
        help: 'シフトをRに入れた時、ナビ画面に後ろの映像が出る機能。',
        media: [
          { type:'youtube', videoId:'KntVP1lA0MU', caption:'バックカメラの動作確認方法', durationSec:215 }
        ] },
      { id: 'fcamera',    label: 'フロントカメラ', type: 'tri',
        help: '車の前方を映すカメラ。狭い駐車場とかで使う。' },
      { id: 'scamera',    label: 'サイドカメラ',   type: 'tri',
        help: '助手席側のドアミラー下とかに付いてる、横を映すカメラ。' },
      { id: 'allcamera',  label: '全周囲カメラ',   type: 'tri',
        help: '画面に車を真上から見たような映像が出る機能。「アラウンドビュー」「マルチビュー」とか呼ばれることも。' },
      { id: 'rmonitor',   label: '後部モニター',   type: 'tri',
        help: '後ろの席用に付いてる別画面。天井からぶら下がってたり、ヘッドレストの後ろに付いてたり。' },
      { id: 'cd',         label: 'CD',             type: 'tri',
        help: 'CDが入れられる機能。最近の車にはない場合も多い。' },
      { id: 'dvd',        label: 'DVD再生',        type: 'tri',
        help: 'DVDが見られる機能。ナビにDVD挿入口があるか確認。' },
      { id: 'music_in',   label: '音楽プレーヤー接続', type: 'tri',
        help: 'AUX端子やUSBで、iPodやスマホの音楽が再生できるか。' },
    ]
  },

  // ─────────────────────────────────────────
  // 🛋️ 快適装備・シート
  // ─────────────────────────────────────────
  {
    id: 'comfort',
    label: '快適装備・シート',
    icon: '🛋️',
    items: [
      { id: 'ac',          label: 'エアコン',        type: 'tri',
        help: '冷房・暖房が出るか。ほぼ全部の車に付いてる。' },
      { id: 'wac',         label: 'デュアルエアコン', type: 'tri',
        help: '運転席と助手席で別々の温度設定ができるエアコン。スイッチが左右別々にあれば「あり」。' },
      { id: 'auto_cruise', label: 'クルーズコントロール', type: 'tri', group: 'cruise_g',
        help: '高速で速度を一定に保つ機能。ハンドル付近に「CRUISE」ボタンがあれば「あり」。' },
      { id: 'radar_cruise',label: 'レーダークルコン', type: 'tri', group: 'cruise_g',
        help: '前の車との距離を自動で保つ進化版のクルコン。「ACC」とか書いてあることも。' },
      { id: 'seat_heater', label: 'シートヒーター',  type: 'tri', group: 'seat_temp_g',
        help: 'シートが温かくなる機能。シート横にスイッチがあるか確認。' },
      { id: 'seat_cooler', label: 'シートクーラー',  type: 'tri', group: 'seat_temp_g',
        help: 'シートが涼しくなる（送風される）機能。高級車に多い。' },
      { id: 'leather',     label: '革シート',        type: 'tri',
        help: 'シート表皮が革（本革または合皮）かどうか。布地っぽくなければ「あり」。' },
      { id: 'power_seat',  label: 'パワーシート',    type: 'tri',
        help: 'シートの位置をボタンで電動調整できる。手動レバーじゃなければ「あり」。' },
      { id: 'bench',       label: 'ベンチシート',    type: 'tri', group: 'seat_layout_g',
        help: '前席が左右繋がってる長いシート（軽トラとか軽の一部）。' },
      { id: 'row3',        label: '3列シート',       type: 'tri', group: 'seat_layout_g',
        help: 'ミニバン等で席が3列ある車。' },
      { id: 'walkthru',    label: 'ウォークスルー',  type: 'tri', group: 'seat_layout_g',
        help: '運転席から後部座席まで歩いて移動できる構造。サイドブレーキが足踏み式の車に多い。' },
      { id: 'fullflat',    label: 'フルフラットシート', type: 'tri', group: 'seat_layout_g',
        help: '後ろの席を倒すとほぼ平らになって寝られる構造。' },
      { id: 'lift_seat',   label: '助手席リフトアップ', type: 'tri',
        help: '福祉車両。助手席が車外にせり出す機能。普通の車にはない。' },
    ]
  },

  // ─────────────────────────────────────────
  // 🔑 電装・キー・ドア
  // ─────────────────────────────────────────
  {
    id: 'electric',
    label: '電装・キー・ドア',
    icon: '🔑',
    items: [
      { id: 'smart_key',   label: 'スマートキー',    type: 'tri', group: 'key_g',
        help: 'キーをポケットに入れたままドア開閉・エンジン始動できる機能。鍵に物理ボタンがあれば大体これ。' },
      { id: 'keyless',     label: 'キーレス',        type: 'tri', group: 'key_g',
        help: 'リモコンでドアの鍵を開け閉めできる機能。スマートキーじゃなくてもボタンで開けばOK。' },
      { id: 'push_start',  label: 'プッシュスタート', type: 'tri', group: 'key_g',
        help: 'ボタンでエンジン始動するタイプ。鍵を回さない車。' },
      { id: 'remote_start',label: 'リモートスタート', type: 'tri',
        help: '離れた場所からエンジンをかけられる機能。社外品の後付けでもOK。' },
      { id: 'spare_keyless', label: 'スペアキー',    type: 'tri',
        help: '鍵が2本あるか。1本しかなければ「なし」。' },
      { id: 'pw',          label: 'パワーウィンドウ', type: 'tri',
        help: '窓がボタンで開け閉めできる。手回しハンドルじゃなければ「あり」。' },
      { id: 'pslide',      label: 'パワースライドドア', type: 'select', options: ['両側', '片側', 'なし'],
        help: 'スライドドアがボタンで自動開閉するか。ミニバン・軽の一部。両側電動か、片側だけかを選択。' },
      { id: 'power_gate',  label: '電動リアゲート',  type: 'tri',
        help: '後ろのバックドアがボタンで自動で開く機能。SUVや高級ミニバンに多い。' },
      { id: 'etc',         label: 'ETC',             type: 'tri',
        help: '高速料金を自動で払う機械。ダッシュボードの中や下に箱が付いてる。' },
      { id: 'welcome',     label: 'ウェルカムライト', type: 'tri',
        help: 'キーを近づけるとミラー下や室内が光る機能。' },
    ]
  },

  // ─────────────────────────────────────────
  // 💡 ライト
  // ─────────────────────────────────────────
  {
    id: 'light',
    label: 'ライト',
    icon: '💡',
    items: [
      { id: 'headlight', label: 'ヘッドライト',     type: 'select', options: ['LED', 'HID/キセノン', 'ハロゲン'],
        help: 'ヘッドライトの種類。点けて色を見る：白くて鮮やか=LED、白っぽい=HID、黄色っぽい=ハロゲン。分からなければ整備の方に聞いて。' },
      { id: 'auto_high', label: 'オートハイビーム', type: 'tri',
        help: '対向車が来ると自動でハイビーム⇔ロービーム切替する機能。「AUTO HIGH」表示があれば「あり」。' },
    ]
  },

  // ─────────────────────────────────────────
  // 🛡️ 安全装備
  // ─────────────────────────────────────────
  {
    id: 'safety',
    label: '安全装備',
    icon: '🛡️',
    items: [
      { id: 'abs',          label: 'ABS',             type: 'tri',
        help: 'ブレーキを強く踏んでもタイヤがロックしない機能。ほぼ全部の車に標準装備。' },
      { id: 'airbag_fr',    label: 'エアバッグ（運助）', type: 'tri', group: 'airbag_g',
        help: '運転席・助手席のエアバッグ。ハンドル中央とダッシュボード助手席側にあれば「あり」。' },
      { id: 'airbag_side',  label: 'サイドエアバッグ', type: 'tri', group: 'airbag_g',
        help: '横からの衝突用エアバッグ。シート横や天井付近に「AIRBAG」表示があれば「あり」。' },
      { id: 'esc',          label: '横滑り防止',      type: 'tri',
        help: 'カーブでスリップを防ぐ機能。「VSC」「VDC」「ESP」とか呼ばれる。スイッチを探す。' },
      { id: 'safe_body',    label: '衝突安全ボディ',  type: 'tri',
        help: 'メーカーの安全ボディ規格。カタログ・取説で確認、不明なら「未チェック」のままでOK。' },
      { id: 'aeb',          label: '衝突軽減ブレーキ', type: 'tri',
        help: '前の車に近づきすぎると自動でブレーキがかかる機能。フロントガラス上部にカメラがあることが多い。' },
      { id: 'lane_alert',   label: 'レーンアラート',  type: 'tri',
        help: '車線をはみ出すと警告音が鳴る機能。ハンドル付近にスイッチがあるか確認。' },
      { id: 'auto_park',    label: '自動駐車',        type: 'tri',
        help: 'ボタン操作で勝手に駐車する機能。「パーキングアシスト」と呼ばれることも。' },
      { id: 'park_assist',  label: 'パーキングアシスト', type: 'tri',
        help: '駐車時のハンドル操作を補助する機能。完全自動じゃないやつ。' },
      { id: 'corner_sensor',label: 'コーナーセンサー', type: 'tri',
        help: '車の角が壁などに近づくとピーピー鳴る機能。バンパーの四隅に小さい丸があれば「あり」。' },
      { id: 'anti_theft',   label: '盗難防止装置',    type: 'tri',
        help: 'イモビライザー等。鍵にチップが入ってるタイプ。社外セキュリティでもOK。' },
    ]
  },

  // ─────────────────────────────────────────
  // 🚗 外装・スタイル
  // ─────────────────────────────────────────
  {
    id: 'exterior',
    label: '外装・スタイル',
    icon: '🚗',
    items: [
      { id: 'alumi',     label: 'アルミホイール', type: 'tri',
        help: 'ホイールが鉄ホイール（鉄チンに樹脂カバー）じゃなく、アルミ製。ピカピカ光ってたり凝った形状ならアルミ。' },
      { id: 'aero',      label: 'エアロ',         type: 'tri',
        help: 'バンパーやサイドに社外品っぽい派手なパーツが付いてるか。純正でも「エアロ仕様」グレードあり。' },
      { id: 'sunroof',   label: 'サンルーフ',     type: 'tri',
        help: '屋根に窓がある。開閉スイッチが天井近くにあるか確認。' },
      { id: 'uv_glass',  label: 'UVガラス',       type: 'tri',
        help: '紫外線カットガラス。窓の隅に「UV」マークがあるか確認。最近の車はほぼ標準。' },
      { id: 'lowdown',   label: 'ローダウン',     type: 'tri',
        help: '車高が純正より下がってる。タイヤとフェンダーの隙間が極端に狭ければ「あり」。' },
      { id: 'idle_stop', label: 'アイドリングストップ', type: 'tri',
        help: '信号待ちでエンジンが自動的に止まる機能。「i-stop」「アイドルストップ」スイッチがあれば「あり」。' },
    ]
  },

  // ─────────────────────────────────────────
  // 📋 来歴・付属品
  // ─────────────────────────────────────────
  {
    id: 'history',
    label: '来歴・付属品',
    icon: '📋',
    items: [
      { id: 'one_owner', label: '1オーナー',  type: 'tri',
        help: '前オーナーが1人だけだった車。車検証で確認。分からなければ整備担当に確認。' },
      { id: 'no_smoke',  label: '禁煙車',     type: 'tri',
        help: 'タバコ臭がしない、シガーライターに焦げ跡なし、灰皿にヤニなし。匂いを嗅ぐ。' },
      { id: 'manual',    label: '取扱説明書', type: 'tri',
        help: 'グローブボックス（助手席前の収納）の中に冊子があるか。' },
      { id: 'warranty',  label: '保証書',     type: 'tri',
        help: 'メーカーの保証書。取扱説明書と一緒に入っていることが多い。' },
    ]
  },

  // ─────────────────────────────────────────
  // ⚙️ 動作確認・コンディション
  // ─────────────────────────────────────────
  // 商談用というより整備・洗車時のチェック用
  {
    id: 'condition',
    label: '動作確認・コンディション',
    icon: '⚙️',
    items: [
      { id: 'ac_status',   label: 'A/C 効き',       type: 'select', options: ['よく効く', 'ぬるい', '音がする', '効かない'], group: 'ac_g',
        help: 'エアコンを最強にして、運転席・助手席両方に冷たい風が来るか。風量も確認。' },
      { id: 'ac_comment',  label: 'A/C コメント',   type: 'text', group: 'ac_g',
        help: '気になる症状を自由記述（例：「最初効くが30分で弱くなる」など）。空欄でOK。' },
      { id: 'belt_noise',  label: 'ベルト鳴き',     type: 'tri',
        help: 'エンジンをかけた瞬間「キュルキュル」音がするか。した場合は「あり」。' },
      { id: 'roomlamp',    label: 'ルームランプ',   type: 'status',
        help: '車内灯が点くか。ドアを開けて確認。一部だけ切れてる場合は「NG」。' },
      { id: 'door_mirror', label: 'ドアミラー動作', type: 'status',
        help: '電動でミラーが動くか、格納できるか。手で動かすタイプなら「未確認」のまま。' },
      { id: 'spare_action',label: 'スペアキー動作', type: 'status',
        help: 'スペアキーで実際にドアの開閉・エンジン始動できるか確認。1本しかない場合は「未確認」。' },
      { id: 'note',        label: 'その他コメント', type: 'text',
        help: 'ここまでのカテゴリで拾いきれない気付きを自由記述。空欄でOK。' },
    ]
  },
];

// 入力タイプ定義（UI 側で参照）
const EQUIPMENT_TYPES = {
  tri:    { states: ['none', 'on', 'off'], labels: { none: '未', on: 'あり', off: 'なし' } },
  select: { /* options は item ごとに定義 */ },
  status: { states: ['none', 'ok', 'ng'],  labels: { none: '未確認', ok: 'OK', ng: 'NG' } },
  text:   { /* 自由記述 */ },
};

// グループ表示用ラベル（任意。group 文字列に対応する見出しを表示したい時に使う）
const EQUIPMENT_GROUP_LABELS = {
  navi_g:        'ナビまわり',
  cruise_g:      'クルーズ系',
  seat_temp_g:   'シート温度',
  seat_layout_g: 'シート配置',
  key_g:         'キー・始動',
  airbag_g:      'エアバッグ',
  ac_g:          'エアコン状態',
};
