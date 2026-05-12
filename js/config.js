// ========================================
// config.js
// アプリ全体で使う定数（列定義、サイズ、色マップ、曜日、スケジュール）
// ここを変えるとカンバンの列やラベルが変わります
// ========================================

// カンバンの列定義
// v0.8.9: 'other'（その他）を仕入れの左に追加。身の振り方未確定の保留車両用
const COLS = [
  {id:'other',    label:'その他',   color:'#8a8fa8'},
  {id:'purchase', label:'仕入れ',   color:'#8b5cf6'},
  {id:'regen',    label:'展示準備中', color:'#f59e0b'},
  {id:'exhibit',  label:'展示中',   color:'#378ADD'},
  {id:'delivery', label:'納車準備', color:'#1db97a'},
  {id:'done',     label:'納車完了', color:'#6b7280'},
];

// ボディサイズの選択肢（設定画面から編集可能）
const SIZES_DEFAULT = ['軽自動車','コンパクト','ミニバン','SUV','セダン','トラック'];
let SIZES = [...SIZES_DEFAULT];

// 列ごとのピル（ラベル）色マッピング
const pillMap = {
  other:    'pill-other',
  purchase: 'pill-purple',
  regen:    'pill-orange',
  exhibit:  'pill-blue',
  delivery: 'pill-green',
  done:     'pill-gray'
};

// 曜日ラベル（日曜始まり）
const WEEK = ['日','月','火','水','木','金','土'];

// カレンダーのスケジュールポイント定義
// offset: 納車日から何日前か、bg: バー色、color: 文字色
const SCHED_POINTS = [
  {offset:0, label:'🚗 納車日',       bg:'#388e3c', color:'#fff', bold:true},
  {offset:1, label:'✅ 完全完成',     bg:'#1565c0', color:'#fff', bold:false},
  {offset:2, label:'📝 登録完了',     bg:'#6a1b9a', color:'#fff', bold:false},
  {offset:3, label:'🔧 整備完了',     bg:'#e65100', color:'#fff', bold:false},
  {offset:5, label:'📄 書類作成完了', bg:'#f9a825', color:'#333', bold:false},
];
