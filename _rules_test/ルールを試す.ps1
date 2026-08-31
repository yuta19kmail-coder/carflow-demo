# ============================================================
# ルールを本物のエミュレータで当てる（1回押すだけ）
#   使い方: PowerShell で
#     powershell -File "D:\Claude\アプリ開発\CarFlow\carflow\_rules_test\ルールを試す.ps1"
#
#   ① Java があるか見る（Firestore のエミュレータは Java で動く）
#   ② 本番のルールをこのフォルダへ写す（firebase.json はフォルダの外を指せないため）
#   ③ 部品が無ければ入れる
#   ④ エミュレータを立てて test_rules.mjs を通し、終わったら自動で片づける
#
#   🔴 なぜ要るか
#     ..\firestore.rules の「pitCards は版番号が1つ進んでいる時だけ書ける」は、
#     2026-08-28 の事故（古い画面が他人の作業を消した）の最後の砦。
#     ところが、まだ一度も本物のルールエンジンで動かしていない（目で見て確かめただけ）。
#
#   ⚠ Claude はこれを走らせられない（エミュレータ本体を Google から落とせない環境のため）。
#      ゆうたの PC で1回だけ通すこと。
#
#   🔴🔴 このファイルは必ず「UTF-8 BOM 付き」で保存すること。
#      BOM が無いと Windows の PowerShell 5.1 は Shift-JIS として読み、日本語が化ける。
#      化けた文字が引用符を壊して、別の行がコマンドとして実行されることまである（2026-08-29 に実際に起きた）。
# ============================================================
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

Write-Host ''
Write-Host '==== 1. Java があるか ====' -ForegroundColor Cyan
$java = Get-Command java -ErrorAction SilentlyContinue
if (-not $java -and $env:JAVA_HOME) {
  $cand = Join-Path $env:JAVA_HOME 'bin\java.exe'
  if (Test-Path $cand) { $env:Path = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:Path; $java = Get-Command java -ErrorAction SilentlyContinue }
}
if (-not $java) {
  Write-Host '  Java が見つかりません。' -ForegroundColor Red
  Write-Host '  Firestore のエミュレータは Java で動くので、これが無いと1歩も進みません。' -ForegroundColor Yellow
  Write-Host ''
  Write-Host '  入れ方：下の1行をコピーして実行してください。' -ForegroundColor Yellow
  Write-Host '' 
  Write-Host '      winget install --id Microsoft.OpenJDK.21 -e' -ForegroundColor White
  Write-Host ''
  Write-Host '  winget が使えない時は https://adoptium.net から Temurin 21 の JDK を入れてください。' -ForegroundColor Yellow
  Write-Host '  入れたあとは PowerShell を開き直してから、もう一度このファイルを走らせてください。' -ForegroundColor Yellow
  exit 1
}
# ⚠ java -version は「エラー側」に書き出すので、PowerShell から直に 2>&1 すると
#    中身は正しいのに NativeCommandError という赤い塊が出る（2026-08-29 に出た）。
#    cmd をはさむと、ただの文字として受け取れる。
$ver = ''
try { $ver = (cmd /c "java -version 2>&1" | Select-Object -First 1) } catch { }
if (-not $ver) { $ver = '（版は取れませんでしたが、java はあります）' }
Write-Host ('  OK  ' + $ver) -ForegroundColor Green

Write-Host ''
Write-Host '==== 2. 本番のルールを、このフォルダへ写す ====' -ForegroundColor Cyan
# 🔴 firebase.json は **自分のフォルダの外**を指せない（「project directory の外だ」で止まる）。
#    なので走るたびに本物をここへ写してきて、エミュレータも見張りもその写しを見る。
#    ＝ 読む物差しは1本のまま。写しは毎回作り直すので、古いルールを試してしまうことはない。
$本物 = Join-Path (Split-Path -Parent $here) 'firestore.rules'
$写し = Join-Path $here '_rules-copy-autogen.rules'
if (-not (Test-Path $本物)) {
  Write-Host ('  本番のルールが見つかりません: ' + $本物) -ForegroundColor Red
  exit 1
}
Copy-Item $本物 $写し -Force
Write-Host ('  写しました（' + (Get-Item $写し).Length + ' バイト）') -ForegroundColor Green

Write-Host ''
Write-Host '==== 3. 部品をそろえる ====' -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $here 'node_modules'))) {
  Write-Host '  はじめてなので取ってきます（数分かかることがあります）...' -ForegroundColor DarkGray
  & npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host '  npm install が失敗しました。' -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host '  そろっています。' -ForegroundColor Green
}

Write-Host ''
Write-Host '==== 4. エミュレータを立てて、ルールに当てる ====' -ForegroundColor Cyan
Write-Host '  （はじめての時だけ、エミュレータ本体を Google から落とします）' -ForegroundColor DarkGray
$fbCmd = 'firebase'
if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) { $fbCmd = 'firebase.cmd' }
& $fbCmd emulators:exec --only firestore --project demo-rules-test "node test_rules.mjs"
$code = $LASTEXITCODE

Write-Host ''
if ($code -eq 0) {
  Write-Host '完了。ルールは本物のエンジンでも、思ったとおりに弾いています。' -ForegroundColor Green
  Write-Host '  （初回は 2026-08-29 に22件で通しました。ルールを直した時は、また1回これを走らせること）' -ForegroundColor DarkGray
} else {
  Write-Host '赤が出ました。上の行を見てください。' -ForegroundColor Red
  Write-Host '  ルールが違うのか、見張りの書き方が違うのか、どちらかです。' -ForegroundColor Yellow
  Write-Host '  本番のルールはもう出してあるので、赤が「古い版を弾けていない」なら急いで直すこと。' -ForegroundColor Yellow
}
exit $code
