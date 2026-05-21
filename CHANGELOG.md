# CarFlow-Demo 変更履歴

> **⚡ これは CarFlow のデモ版です**（GitHub Pages 配信、Firebase未接続、ログインなし、mockデータで動作）。
> 本体（`D:\アプリ開発\CarFlow\carflow`）の最新機能を「触って試せる」状態に保つことが目的のリポジトリです。
> **詳細な仕様変更履歴は本体の `CHANGELOG.md` を参照してください。** こちらにはデモ版への反映状況のみ記録します。

---

## 📦 デモ版の位置づけ

- **本番URL**: https://yuta19kmail-coder.github.io/carflow-demo/
- **GitHub**: https://github.com/yuta19kmail-coder/carflow-demo
- **コードルート**: `D:\アプリ開発\CarFlow-Demo\demo-carflow\`
- **リリース方法**: `git push` するだけ（GitHub Pages が自動再ビルド、Firebase不要）

### デモ版固有のファイル（同期時は触らない）
- `js/demo-firestore-mock.js` … Firestore モック
- `js/demo-storage-mock.js` … Storage モック
- `js/demo-init.js` … 初期化（**冒頭で `window.__DEMO_MODE = true` を立てる**：安全装置）
- `js/demo-sample-data.js` … サンプルデータ
- `js/demo-line-toast.js` … LINE通知をトースト表示に置換
- `js/demo-auth-mock.js` … ログイン UI をモック化
- `js/firebase-init.js` … ★no-op スタブ★（本体の同名ファイルを絶対に上書きしないこと）

### 本体と置き換わるもの
- `js/line-notify.js` → `js/demo-line-toast.js` に差し替え（index.html で`<!-- デモ版：line-notify.js は demo-line-toast.js に置き換え済み -->` のコメントだけ残す）
- `js/auth.js` → `js/demo-auth-mock.js` が後乗りでログイン関連を上書き
- `js/firebase-init.js` → demo-firestore-mock.js が `window.fb.*` を mock 実装

---

## 📝 反映履歴

### 2026-05-21：ライトの`--text1`漏れ修正＋サマリー数字色を可読に（v2.5.17-demo）

**重大バグ**：`:root[data-theme="light"]` / `light-liquid` のブロックに **`--text1` が未定義**だったため、ベースの `:root{--text1:#e8eaf6}`（ダークのほぼ白）が漏れて適用されていた。`var(--text1)` を使う「全体タスク」見出し（board-notes）など計16箇所が白背景でほぼ見えない状態だった。

**修正**（`css/base.css` `?v=288`）：
- light / light-liquid 両ブロックに `--text1` を追加（light=`#1A2230`、light-liquid=`#1F2937`）
- ついでに light / light-liquid の `--text3` を `#6E7A8A` に少し濃く（小さなグレーラベルの可読性向上、階層は維持）

**サマリー6カードの数字色**（`js/dashboard.js` `?v=348` ＋ `css/panels.css` `?v=363`）：
- 各 `.stat-num` に `sn-total/active/contract/order/deliver/done` クラスを付与
- ライト時のみ `!important` で可読色に上書き：管理中=`#D97706`、オーダー=`#7C3AED`、納車予定=`#059669`、納車完了=`#64748B`（白に沈む淡い色 #c4b5fd / #6ee7b7 等を置換）。ダーク時はインライン色のまま

バージョン表記：`v2.5.17-demo`

---

### 2026-05-21：ライト標準のベース色を「くっきりSaaS」に調整（v2.5.16-demo）

**背景**：白グレーのライトは、ページ背景(#F4F6F9)とカード白(#FFFFFF)の差が僅かで、枠線(#E5E8EE)も薄すぎてカードの輪郭が背景に溶け、全体が「ぼやっと」して見えた。色相ではなくサーフェス間コントラスト不足＋弱い枠線＋影なしが原因。

**変更**（`css/base.css` `?v=287`、`:root[data-theme="light"]` のみ。light-liquid のガラス表現は不変）：
- ページ背景を少し濃いグレーへ：`--bg`/`--bg1` `#F4F6F9`→`#EBEEF3`、`--bg3` `#E3E7EE`、`--bg4` `#D6DCE5`
- カードは白のまま：`--bg2 #FFFFFF`
- 枠線をはっきり：`--border` `#E5E8EE`→`#D4DAE3`、`--border2` `#B6BFCC`
- 文字を少し深く：`--text #1A2230` / `--text2 #5A6677` / `--text3 #8B95A6`
- 影を追加してカードを浮かせる：`--shadow-card` を `0 1px 3px rgba(16,24,40,.10), 0 1px 2px rgba(16,24,40,.06)`
- 青を一段深く：`--blue`/`--accent` `#3A82F6`→`#2563EB`（白背景での可読性）

バージョン表記：`v2.5.16-demo`

---

### 2026-05-21：ライトモードのバッジ・チップを白背景で読みやすく刷新（v2.5.15-demo）

**背景**：白グレーのライト配色に戻した結果、ダーク用に作られた「薄い半透明色（rgba alpha 0.12〜0.22）」のバッジ／チップが白背景に溶けてくすみ、淡い文字色（#fcd34d 黄・#fca5a5 赤・#93c5fd 青）はコントラスト不足で読みにくかった。さらにベージュ時代の上書きが進捗ドットを茶色(#9a4a05)に潰し、緑/オレンジの区別が消えていた。

**方針**：ライト系（`light` / `light-liquid` 両方。`[data-theme^="light"]` でマッチ）だけ、薄い半透明色を「淡色ベタ塗り＋濃い文字＋細い枠線」のSaaS風バッジに置換。ダーク・リキッド系は一切不変。タスク進捗の緑/オレンジの意味分けも維持。

**変更ファイル**：
- `css/base.css`（`?v=286`）：ライト上書きブロックを全面刷新。
  - 進捗ドットの茶色上書き(`.cc-dot.done/.partial`)を**撤去** → `var(--green)`/`var(--orange)` のビビッドに戻す（完了=緑・途中=オレンジ）
  - 在庫日数バッジ：dg=緑(#047857/#D1FAE5)・dw=琥珀(#B45309/#FEF3C7)・dr=赤(#B91C1C/#FEE2E2)
  - 売約バッジ db：淡い水色文字 → 濃い青(#1D4ED8/#DBEAFE)。ライト用overrideを新規追加
  - 下段帯(bw/br/bb)・tbl-group/inv-group・arc-achv・cc-other-day・help-wip も同パレットに統一
- `css/components.css`（`?v=321`）：要対応チップのライト用override追加。`.chip-red/orange/yellow` ＋ `.chip-count.sev-*` に濃い文字＋淡色ベタ塗り
- `js/dashboard.js`（`?v=347`）：在庫集計チップ(`.chip-count`)に tier 色→severity クラス(`sev-warn/action/danger/prep`)を付与（`_chipCountSevClass()` 追加）。ダーク時はインライン色のまま、ライト時のみCSSが上書き
- バージョン表記：`v2.5.15-demo`

**⚠️ 同期時の注意**：これらはライト配色とセットのデモ独自調整。本体 base.css / components.css をバルクコピーすると消えるので再注入すること。

---

### 2026-05-21：消えていた4テーマ（ライト白グレー＋リキッド2種）を復元（v2.5.14-demo）

**背景**：v2.5.13-demo の全面反映時、本体 `css/base.css` をバルクコピーしたことで、デモ独自の以下が巻き添えで消えていた（本体には存在しない要素のため）。

- **ライト・スタンダードの配色**：デモ独自のモダンSaaS風 白グレー系（`--bg:#F4F6F9` 等）が、本体のベージュ系（`#f5f1ea`）に上書きされていた
- **ダーク・リキッド / ライト・リキッド**：配色2ブロック＋ `:root[data-theme$="-liquid"]` のガラス効果（背景グラデ＋ `backdrop-filter: blur`）が丸ごと消失
- **テーマピッカー**：`index.html` のボタンが dark/light の2つに減り、`.theme-picker-4`（2×2グリッド）CSS も消失

`theme.js`（4テーマロジック）は v2.5.13-demo のマージ時に維持されていたため、リキッドを選んでも対応CSSが無く表示が壊れる状態だった。

**復元方法**：旧コミット `1ac6878 v2.4.0-demo` から該当CSS／HTMLを正確に復元。

- `css/base.css`：dark/light に `--liquid-bg-image` 等のリキッド用変数を再追加、light を白グレーに戻し、`dark-liquid` / `light-liquid` ブロックと `[data-theme$="-liquid"]` 共通ルールを復元（`?v=285`）
- `css/panels.css`：`.theme-picker-4`（2列グリッド）を復元（`?v=362`）
- `index.html`：テーマピッカーに ✨ダーク・リキッド / 💎ライト・リキッド の2ボタンを再追加、`theme-picker-4` クラス付与
- バージョン表記：`v2.5.14-demo`

**⚠️ 次回同期時の注意**：本体 `base.css` をバルクコピーすると、また 4テーマ（白グレーライト＋リキッド）が消える。同期後は必ず base.css の `dark-liquid`/`light-liquid` ブロックと panels.css の `.theme-picker-4`、index.html のリキッド2ボタンを再注入すること。

---

### 2026-05-19：本体 v2.4.1 〜 v2.5.13 を全面反映（v2.5.13-demo）

**反映方法**：本体 `carflow/` の `js/` `css/` 配下を `demo-carflow/` にバルクコピー（`demo-*.js` と `demo.css` は除外）。`theme.js` は 4 テーマ実装を維持しつつ本体 v2.5.7+ の `toggleTheme()` と `tb-theme-toggle` 連動を手動マージ。`index.html` は本体ファイルを丸ごとコピーした上で以下のデモ差分を再注入：
- `<link rel="stylesheet" href="css/demo.css?v=285">`（`login.css` の直後）
- Firebase SDK 直前に mock スクリプト 5 本（`demo-firestore-mock.js` / `demo-storage-mock.js` / `demo-init.js` / `demo-sample-data.js` / `demo-line-toast.js`）
- `<script src="js/line-notify.js?v=349"></script>` → コメント置換
- `</body>` 直前に `<script src="js/demo-auth-mock.js"></script>`
- `login-ver` と topbar version badge を `v2.5.13-demo` に

**主な機能反映（v2.4.1 〜 v2.5.13）**：
- v2.5.13：タスク・進捗一覧に「📝 小タスク」バッジ追加（自動／選択／メモと同列）
- v2.5.12：タスクパターン画面ヘッダー2段化＋小タスク制トグル（タスク・進捗側と連動）
- v2.5.11：カード詳細でのリアルタイム同期欠落を修正（保護を時間ベースに）
- v2.5.10：workflow タスク 4 つ（再生／展示／納車準備／納車整備）の小タスク制 ON/OFF 解放
- v2.5.9：小タスク制 ON→OFF 戻し制限を撤廃
- v2.5.8：現場モード TOP（topbar）にダーク/ライト切替トグル（リキッド suffix は維持）
- v2.5.6：⋮メニューを設定モーダル化（トグル/入力欄/保存ボタン）
- v2.5.0：タスクパターン画面の独立化（設定→📦タスクパターン）
- v2.4.1：バックオフィスフェーズ（売約以降の裏方業務）基盤

**画面バージョン表記**：`v2.5.13-demo`

**theme.js デモ独自実装**：
- `VALID_THEMES = ['dark','light','dark-liquid','light-liquid']` を保持
- `toggleTheme()` は base のみ反転（dark↔light、リキッド suffix は維持）
- `refreshThemePickerUI()` で `#tb-theme-toggle` の表示も同期（isLight 判定でアイコン切替）

---

### 2026-05-18：v2.3.0-demo「登録内容バー」試作（デモ先行）

**目的**：販売車の登録作業は車検付き/車検切れ/ローン/未成年など複数バリエーションがあり、抜け漏れが大きなミスに直結する。これを「カード詳細を開けば誰でも登録内容を目視できる」状態にして防ぐ。

**新規実装**：
- **`d_register`（登録内容設定）** … 納車準備フェーズの新規大タスク（**保護対象**：装備品チェックと同じく名前変更・削除不可）
  - 選択式（必須）：登録パターン（中古新規 / 継続移転 / 移転継続 / 名変 / 予備検）
  - tri 項目：ローン / 所有権 / 未成年 / リサイクル券 / 委任状必要 / 希望ナンバー（カスタム追加可）
- **「登録内容バー」**（カード詳細「✏️ 車両詳細を編集」ボタンの下に常時表示）
  - 納車準備/納車完了フェーズの車だけ表示
  - 設定済み：色付きカラーバー（5パターン色分け：中=青、継=緑、移=紫、名=橙、予=赤）＋「あり」タグ列挙
  - 未設定：赤めの警告「⚠️ 登録内容 未設定」を表示

**影響ファイル**：
- `js/tasks-def.js`（DELIVERY_TASKS に d_register 追加）
- `js/settings.js`（保護対象判定に d_register を追加）
- `js/car-detail.js`（`_renderRegistrationBar()` 追加＋既存「車両詳細を編集」ボタン直後に挿入）
- `css/panels.css`（`.detail-reg-bar*` スタイル一式追加）
- `index.html`（バージョン表記＋`?v=` bump）

**ステータス**：デモ先行リリース。実装を試して感触を確認したら本体反映する想定。

---

### 2026-05-18：本体 v1.8.80 〜 v2.2.19 を全面反映

**反映方法**：本体 `carflow/` の js / css / manuals 配下を demo-carflow にバルクコピー＋ index.html の差分パッチ再適用（demo-* スクリプトと line-notify 差し替えコメントを再注入）。

**新規ファイル追加**：
- `js/backoffice.js`（v2.1.0：バックオフィスサイドパネル本体）
- `js/task-memo.js`（v2.2.0：タスク個別メモの値編集モーダル）
- `js/task-memo-config.js`（v2.2.1：メモ種別設定モーダル）
- `js/task-memo-auto-note.js`（v2.2.7：date/time メモから緑付箋を自動同期）

**主な機能反映**：
- 🎯 目標ライン／限界ラインの2軸期日（v1.8.80）
- 🔔 タスク完了 LINE 通知（v1.8.80、デモではトーストに置換）
- 🗂 バックオフィスサイドパネル（v2.1.0）
- ⋮メニュー一本化（v2.0.0：行内のON/OFFトグル廃止、全操作をアクションシートに集約）
- 保護対象タスクの縮小（v2.0.0：自動完了2つ＋装備品の3つだけ）
- ビルトインタスクの名前変更・削除可（v2.0.0）
- 📝 タスク個別メモ＋自動付箋（v2.2.0〜v2.2.11）
- 📱 スマホでフルメニュー時の管理者画面ベース最適化（v2.2.12〜）
- 📱 スマホログイン高速化（v2.2.14：signInWithRedirect 切替）
  - **デモではモックログインなので無関係、ただし本体コードは引き継いでいる**
- 「⚡ クイックメニューに戻る」ボタンを下部移動（v2.2.17）
- ヘルプ全面リライト＋新セクション3つ追加（v2.2.18）
- タスク管理PDFマニュアル v5 → v6 刷新（v2.2.19）

**画面バージョン表記**：本体に合わせて `v2.2.19` に統一済み

---

### 2026-05-12（前回反映）：本体 v1.8.42 〜 v1.8.79

git show 経由で v1.8.78 を一括転送＋差分 Read+Write で v1.8.79 まで反映。Phase A/B 大型UI改修／税モード／オーダー車両／装備印刷リッチ化／ダッシュボード6カード／アバタークロッパー など。

---

### 2026-05-10：本体 v1.8.41

装備詳細ビュー復活など微調整。

---

### 2026-05-08：v1.8.39（初回公開）

CarFlow 本体の体験版として GitHub Pages 配信開始。

---

## 🛠 次回 同期する時のチェックリスト

⚠️ **CRITICAL：本物の Firestore に接続しないために、絶対に守ること** ⚠️

1. 新規追加された JS / CSS / manuals を確認
2. `cp` で本体から demo へバルクコピー（`demo-*.js` と `firebase-init.js` は **絶対に触らない**）
   - **重要**：bash の `cp` は virtiofs mount stale で末尾欠落することがある。コピー後は必ず Read で末尾を確認するか、本体の Edit ツールで個別パッチを当てる方が安全。
3. `index.html` は本体ベースで作り直し、以下のデモ差分を再注入：
   - 冒頭の `<link rel="stylesheet" href="css/demo.css?v=...">`（login.css 直後）
   - Firebase SDK 直前に mock スクリプト 5 本（`demo-firestore-mock.js` / `demo-storage-mock.js` / `demo-init.js` / `demo-sample-data.js` / `demo-line-toast.js`）
   - **★最重要★**：`<script src="js/firebase-init.js?v=..."></script>` → **コメント置換**（本物のFirebase初期化を絶対に走らせない）
   - `<script src="js/line-notify.js?v=..."></script>` → コメント置換
   - `</body>` 前に `<script src="js/demo-auth-mock.js"></script>`
4. PDFマニュアルがあれば `manuals/` にも反映
5. このファイル（`CHANGELOG.md`）の反映履歴に追記
6. `git add -A && git commit && git push`（GitHub Pages 自動再ビルド）

### 🛡 デモが本物Firestoreに接続しない 3 層防御

1. **index.html**：`firebase-init.js` をコメントアウト（ロードしない）
2. **本体 firebase-init.js**：冒頭で `if (window.__DEMO_MODE === true) return;` ガード
3. **デモ側 firebase-init.js**：no-op スタブ（中身は警告ログのみ）

`demo-init.js` 冒頭で `window.__DEMO_MODE = true` を立てているので、どの層を破られても本物のFirebaseに接続しない。**この3層のどれかが消えていたら同期作業を即中止すること。**

---

## 📞 ハマったらここを見る

- 本体 CHANGELOG（`D:\アプリ開発\CarFlow\carflow\CHANGELOG.md`）— バージョン番号と機能の対応
- `D:\アプリ開発\開発全体メモ.md` — 開発体制・共通ルール
- mount staleness の問題：bash 経由で本体ファイルを読むと古い断面しか取れないことがある。確実な読み出しは Read ツール経由で
