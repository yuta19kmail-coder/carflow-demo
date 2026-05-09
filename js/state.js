// ========================================
// state.js
// アプリの状態（グローバル変数）
// 現在ログイン中のユーザー、編集中の車両ID、
// ドラッグ中のオブジェクトなどを保持
// ========================================

let currentUser = '';              // ログインユーザー名
// v1.5.1〜: cars はここで空配列で初期化。ログイン後 db-cars.loadCars() で Firestore から取得して上書き
let cars = [];
let formPhotoData = null;          // 車両登録フォームで選択中の写真
let editingCarId = null;           // 編集中の車両ID
let calYear, calMonth;             // カレンダー表示中の年月
let dragCard = null;               // ドラッグ中の車両カード
let dragDeliveryCarId = null;      // カレンダーで納車バーをドラッグ中の車両ID
let pendingDragCar = null;         // 売却確認ダイアログで保留中の車両
let pendingTargetCol = null;       // 同上の移動先列
let globalLogs = [];               // 全操作ログ
let activeDetailCarId = null;      // 現在詳細モーダル表示中の車両ID
let wfState = {carId:null, taskId:null, isDelivery:false}; // ワークフロー状態
let closedDays = [3];              // 定休日の曜日（初期：水曜） ※互換用（毎週のみ）
let closedRules = [                // 定休日ルール（拡張版）
  // id, pattern:'weekly'|'biweekly'|'nth', dow:0-6, nth?:1-5, anchorYM?:'YYYY-MM'
  {id:'r-default', pattern:'weekly', dow:3}
];
let customHolidays = [];           // カスタム休業日リスト
let jpHolidays = {};               // 日本の祝日（APIから取得）
let archivedCars = [];             // 月次集計締めでアーカイブされた車両

// v1.7.0: 全体タスク（付箋ボード）
let boardNotes = [];               // 付箋ボードの全件（order asc）
let boardLabels = {                // 色ごとのラベル（会社共通）。設定→表示で編集可
  red:    '緊急',
  orange: '今日中',
  yellow: '今週中',
  green:  '連絡',
  blue:   '余裕',
};
let dragBoardNoteId = null;        // 付箋 DnD 中の id

// 展示ビューのソート設定（key: 'price'|'invDays'|'year'、dir: 'asc'|'desc'）
let exhibitSort = { key: 'invDays', dir: 'desc' };

// 全体一覧ビューのソート設定（v0.8.7）
// key: 'num'|'purchaseDate'|'status'|'progress'|'deliveryDate'、dir: 'asc'|'desc'
let tableSort = { key: 'purchaseDate', dir: 'desc' };

// 進捗ビューの枠ごとの展開状態（v1.0.11）
// 4枚以上で自動的に縮小、ユーザーが「すべて展開」を押すと true になりトグルで保持
let progressExpanded = { other:false, before:false, delivery:false };

// カンバン全列のソート設定（v1.0.14）
// key: null|'num'|'price'|'progress'|'date'|'status'、dir: 'asc'|'desc'
// 'date' は売約済みなら売約日数、未売約なら在庫日数で自動判定
// 納車完了列（done）は対象外
let kanbanSort = { key: null, dir: 'desc' };

// 「すべてのカードを開く」フラグ。true の間は4台以上でも縮小せず通常表示
// 何かの操作（並び替え変更／カード移動／新規登録など）があると false に戻る
let kanbanForceExpand = false;

// ========== 会社ごとの設定 ==========
let appSettings = {
  // 在庫警告3段階（日数・ON/OFF）
  invWarn: [
    {days:15, on:true,  color:'#fcd34d', bg:'rgba(245,210,59,.18)', label:'注意'},
    {days:30, on:true,  color:'#fb923c', bg:'rgba(251,146,60,.20)', label:'要対応'},
    {days:45, on:true,  color:'#fca5a5', bg:'rgba(239,68,68,.22)',  label:'危険'},
  ],
  // 納車残日数警告3段階（日数・ON/OFF）
  delWarn: [
    {days:7, on:true,  color:'#93c5fd', bg:'rgba(55,138,221,.20)',  label:'準備'},
    {days:3, on:true,  color:'#fcd34d', bg:'rgba(245,210,59,.20)',  label:'直前'},
    {days:0, on:true,  color:'#fca5a5', bg:'rgba(239,68,68,.22)',   label:'当日'},
  ],
  // デフォルト納車日＝今日+N日（=リードタイム日数）
  deliveryLeadDays: 14,
  // 通知設定（日数とON/OFF、説明）
  notif: {
    pre: {on:true, days:3, desc:'納車予定のN日前からダッシュボードと下部チップに表示'},
    stock: {on:true, days:45, desc:'N日以上在庫している車両をアラート'},
    stall: {on:true, days:7, desc:'同一ステータスでN日以上動きが無い車両を検出'},
  },
  // 店舗目標
  goals: {
    yearStart: 1,           // 年度開始月（1=1月始まり、4=4月始まり、など）
    revRecog: 'delivery',   // 'contract' | 'delivery'  売上計上タイミング
    monthly: {              // 月別目標。keyは"YYYY-MM"
    },
    annual: {               // 年度別目標
    },
    default: {sales: 3.0e7, count: 15}
  }
};
