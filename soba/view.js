/* ========================================
   soba/view.js ─ CarFlow 相場ビュー（画面）  v3.9.0（2026-10-10）
   ----------------------------------------
   🔴 計算はここに書かない。全部 soba-calc.js（相場DB が作る・Storage から読む）＝SobaCalc。
   中身と並びは 相場DB\相場ビューア.html（viewer_template.html）と同じ（2026-10-10 写し取り）。
   CarFlow で変えた所：
     ・データは soba-data.js が Storage（soba/v1/）から読む。カードは開いた時だけ（FULLC／openCard）
     ・サンプル・見かた（sample.js）は Storage から読む（無ければ出ない）
     ・ライバル店DB（rival.js）は Storage から読む（無ければ店のカテゴリ別の欄を出さない）
     ・この車種の注意＝カードの notes
     ・色・ボタン・スクロールは CarFlow に合わせる（index.html の上書き）
   ======================================== */
// サンプル・見かた（2026-10-10 ゆうた）：練習用の車（sample.js＝相場DB\sample_build.py が作る。本物のデータには混ぜない）を一覧の先頭に足す
const SMPD=window.SAMPLE&&Array.isArray(window.SAMPLE.cards)?window.SAMPLE:null,SMK=SMPD?SMPD.maker:'';
const D=[...(SMPD?SMPD.cards:[]),...(window.SOBA_INDEX||[])].filter(m=>Object.keys(m.years||{}).length),AV=(window.SOBA&&window.SOBA.avg)||{};   // CarFlow：本物は一覧だけ（中身は SobaData.card() で開いた時に読む）。サンプルは中身ごと
// 計算はすべて soba-calc.js（SobaCalc）。ここには書かない。D は年式が1つも無い車種（販売が終わった後の年式など）を外した一覧
const {AA_SELL,BUY_AA_PROF}=SobaCalc.CFG;

/* ライバル店DB（グー・カーセンサーの掲載。店のカテゴリ別の総額の真ん中）。2026-10-06 ゆうた「小売価格の中央値と、開くとカテゴリごとの値をバーグラフで」 */
const RV=(window.RIVAL||{cars:{}});
if(SMPD&&SMPD.rv)for(const k in SMPD.rv){const b=SMPD.rv[k];if(RV.R&&RV.R[b])RV.R[k]=RV.R[b];if(RV.RA&&RV.RA[b])RV.RA[k]=RV.RA[b];if(RV.FAM&&RV.FAM[b])RV.FAM[k]=RV.FAM[b]}   // サンプルは借りた元のカードの店のカテゴリの比を使う
const RVK=s=>String(s||'').normalize('NFKC').replace(/[\s・\-－‐_＿\/（）()]/g,'').toUpperCase();
const RVMK={'メルセデス・ベンツ':'ベンツ','フォルクスワーゲン':'VW','BMW':'BMW','アウディ':'アウディ'};
const RVAL={'MINI3ドア':'MINI35ドア','MINI5ドア':'MINI35ドア','CクラスステーションワゴンS':'','ベンツCクラスステーションワゴン':'ベンツCクラスワゴン','IS':'レクサスIS','LS':'レクサスLS','NX':'レクサスNX','RX':'レクサスRX'};
const RVCAT=[['A','ディーラー認定中古車','メーカー系の販売店'],['B','大手チェーン','ネクステージ・ガリバー等'],['B2','輸入車専門（中〜大手）','輸入車専門の複数店舗の会社'],['C1','一般店（保証・整備付）','中小の販売店。保証あり・法定整備付'],['C2','一般店（現状寄り）','中小の販売店。保証なし・整備なしが多い'],['D','未使用車専門','届出済・登録済未使用車'],['E','格安・現状販売','保証なし・整備なしの安売り'],['別①','自社ローン専門','ローン込みの値付け'],['別②','カスタム車専門','エアロ・足回り等の部品代が乗る']];
function rivalOf(M,y,km){
  const first=(M.car||'').split(/\s/)[0], pre=RVMK[M.maker]||'';
  const cands=[first,M.family,pre+M.family,pre+first].map(RVK).map(k=>RVAL[k]!=null?RVK(RVAL[k]):k).filter(Boolean);
  // 2026-10-07 輸入車のグレードの家族分け（ベース/上位/高性能）：選んだグレードの家族の箱を引く（無ければいままでの箱）。ライバル店DB\結果\輸入車のグレードの家族分け_2026-10-07.md
  const f=((RV.FAM||{})[M.key]||{})[S.g];
  const car=cands.map(k=>(f&&RV.cars[k+'#'+f])||RV.cars[k]).find(Boolean); if(!car)return null;
  const Y=car[String(y)]; if(!Y)return null;
  const b=km<30?'〜3万':km<60?'3-6万':km<100?'6-10万':'10万〜';
  const B=Y[b]&&Object.values(Y[b]).reduce((a,v)=>a+v[2],0)>=5?Y[b]:Y.all; if(!B)return null;
  return {b:B===Y.all?'全走行':b,cats:B};
}
/* 2026-10-06 夜 作り直し（グレードの混ざり調査）：カテゴリごとの総額は「この画面で選んだ車の相場DBの値（R.rt＝グレード・詳細・年式・走行・型式・色をそろえた値）×
   そのカテゴリの店の掲載の比（総額÷その掲載の相場DBの値）の真ん中」で出す。生の真ん中（グレード・走行の混ざりあり）は補足に下げる。
   比は ライバル店DB\scripts\export_viewer.py が車種カード×カテゴリ（×年数の帯）ごとに作る（RV.R・RV.RA）。Python 側の同じ計算＝export_viewer.py・check_viewer_calc.js */
const rvAge=a=>a<=1?'〜1年':a<=3?'2-3年':a<=6?'4-6年':a<=10?'7-10年':'11年〜';
function rivalAdj(M,y,R){
  const T=RV.R&&RV.R[M.key]; if(!T||!R||R.rt==null)return null;
  const A=((RV.RA||{})[M.key]||{})[rvAge((RV.yr||2026)-(+y))]||{};
  const cats={};
  for(const k in T){const v=T[k],r=A[k]?A[k][0]:v[0],sh=r/v[0];
    cats[k]=[R.rt*r,R.rt*v[1]*sh,R.rt*v[2]*sh,R.rt*v[3]*sh,v[4],v[5],v[6],v[7],v[8],v[9],r,A[k]?A[k][1]:null]}
  return {cats};
}
function rivalLine(M,y,km,R){
  const a=rivalAdj(M,y,R),r=rivalOf(M,y,km); if(!a&&!r)return '';
  const c=a?a.cats.C1:null;
  return `<div class="s">${c?`${LM(12)}<span class="muted">一般店（保証・整備付）で買うと 総額 </span><b style="color:var(--rt)">${man(c[0])}</b>`:(r&&r.cats.C1?`<br><span class="muted">一般店（保証・整備付）総額の生の真ん中 </span><b>${man(r.cats.C1[0])}</b> <span class="mx">混ざりあり</span>`:'')}</div>`;
}
let RVOPEN=false; try{RVOPEN=localStorage.getItem('rvopen')==='1'}catch(e){}
// 3つの枠の一番下の「開く」1行（2026-10-09 ゆうた「店カテゴリのボタンが見えにくい。BOXの一番下に展開の1行を。他の2つにも」）
// いまの金額は最初たたむ（見込み粗利＋3つの金額だけ）。開くと計算と詳細（2026-10-09 ゆうた）
let NOWOPEN=false;try{NOWOPEN=localStorage.getItem('nowopen')==='1'}catch(e){}
// たたんでいる時はどこを押しても開く。開いている時は大枠の空いている所（中の小分けの枠・入力・ボタン以外）だけでたたむ
function nowClick(ev){if(!NOWOPEN){nowTg();return}if(ev.target.closest('.num,.box4,.rival,.warn,.sim,input,select,button,a,.boxmore,table,[data-tip]'))return;nowTg()}
function nowTg(){NOWOPEN=!NOWOPEN;try{localStorage.setItem('nowopen',NOWOPEN?'1':'0')}catch(e){}draw()}
const BOXOPEN={aa:false,rt:false,buy:false};try{const o=JSON.parse(localStorage.getItem('boxopen')||'{}');BOXOPEN.aa=!!o.aa;BOXOPEN.buy=!!o.buy}catch(e){}
if(RVOPEN){BOXOPEN.aa=false;BOXOPEN.buy=false}else if(BOXOPEN.aa)BOXOPEN.buy=false;
const MORELAB={aa:'詳細（先の見込み・収益の比べ・実績）',rt:'店のカテゴリ別の総額',buy:'詳細（買い方ごとの上限・リサイクル料金）'};
function boxMore(k){if(k==='rt'&&!RV.R)return '<div class="bmgap"></div>';const o=k==='rt'?RVOPEN:BOXOPEN[k];return `<div class="bmgap"></div><div class="boxmore${o?' on':''}" onclick="boxTg('${k}')" role="button" tabindex="0">${o?'▴ 閉じる':'▾ '+MORELAB[k]}${k==='aa'?LM(10):''}</div>`}
function boxTg(k){   // 開けるのは1つだけ（2026-10-09 ゆうた「同時展開は認めない」）
 const was=k==='rt'?RVOPEN:BOXOPEN[k];BOXOPEN.aa=false;BOXOPEN.buy=false;
 if(k!=='rt')BOXOPEN[k]=!was;try{localStorage.setItem('boxopen',JSON.stringify(BOXOPEN))}catch(e){}
 const rt=k==='rt'?!was:false;if(RVOPEN!==rt){RVOPEN=rt;try{localStorage.setItem('rvopen',RVOPEN?'1':'0')}catch(e){}}draw()}
function rvToggle(){RVOPEN=!RVOPEN;try{localStorage.setItem("rvopen",RVOPEN?"1":"0")}catch(e){}draw()}
const RVSH={A:'ディーラー',B:'大手',B2:'輸入専門',C1:'一般店',C2:'一般店（現状）',D:'未使用車',E:'格安','別①':'自社ローン','別②':'カスタム'};
const RVMK2=['','混ざりあり','混ざり大','点検できない'];
function rvBars(ok,lo,hi){const pad=(hi-lo)*0.04||hi*0.02,L=lo-pad,H=hi+pad,X=v=>((v-L)/(H-L)*100).toFixed(1);
  return {X,mk:ok.map((x,i)=>`<div class="rvm${x.k==='C1'?' me':''} ${i%2?'dn':'up'}" style="left:${X(x.v[0])}%"><span class="rvl">${RVSH[x.k]||x.k}<b>${man(x.v[0])}</b></span><i></i></div>`).join('')}}
function rivalBox(M,y,km,R){
  if(!RVOPEN)return '';
  const a=rivalAdj(M,y,R),r=rivalOf(M,y,km); if(!a&&!r)return '';
  let h='';
  if(a){
    const all=RVCAT.filter(([k])=>a.cats[k]).map(([k,nm,ds])=>({k,nm,ds,v:a.cats[k]}));
    const ok=all.filter(x=>x.v[9]>=3).sort((p,q)=>p.v[0]-q.v[0]),few=all.filter(x=>x.v[9]<3);
    if(ok.length){
      const lo=Math.min(...ok.map(x=>x.v[1])),hi=Math.max(...ok.map(x=>x.v[2])),{X,mk}=rvBars(ok,lo,hi);
      const row=x=>{const v=x.v;return `<tr class="${x.k==='C1'?'me':''}${v[9]<10?' few':''}"><td><b>${x.nm}</b><small>${x.ds}</small></td>
       <td class="n"><b>${man(v[0])}</b><small>相場DBの${(v[10]*100).toFixed(0)}%</small></td>
       <td class="rg"><div class="rgbar"><i style="left:${X(v[1])}%;width:${Math.max(.8,X(v[2])-X(v[1]))}%"></i><em style="left:${X(v[0])}%"></em></div><small>${man(v[1])}〜${man(v[2])}</small></td>
       <td class="n">${man(v[3])}</td><td class="n">${v[4]!=null?man(v[4]):'—'}</td>
       <td class="n">${v[5]}%${v[6]?`<small>${v[6]}か月が多い</small>`:''}</td><td class="n">${v[7]}%</td>
       <td class="n">${v[8]!=null?v[8]+'日':'—'}</td><td class="n">${v[9]}台${v[9]<10?'<small>少ないので全体の傾向に寄せた</small>':''}</td></tr>`};
      // 求め方の段落は ⓘ に入れる（2026-10-10 ゆうた「長いフォローテキストは削る」。学ぶ所＝サンプル・見かた）
      const how=`求め方：この画面の「売れる値」（相場DB ${man(R.rt)}・税込）× そのカテゴリの店の「掲載の総額 ÷ 相場DBの値」の真ん中（グー／カーセンサー ${RV.built}。掲載1台ずつ、その車のグレード・年式・走行で割った比。カテゴリの比は代表の${y}年式で引く）。&lt;br&gt;グレード・走行・年式の混ざりは入らない。入っていない物＝装備・地域・店ごとの値付けの違い（範囲の棒）。掲載の値で、売れた値ではない`;
      h+=`<div class="rvh"><b>店のカテゴリ別の総額</b>　${condText()}・修復歴なし<span class="qi" data-tip="${how}">?</span><span class="rvclose" onclick="rvToggle()" role="button" tabindex="0">▴ 閉じる</span></div>
      <div class="rvline">${'<div class="rvtrack"></div>'+mk}</div><div class="rvaxis"><span>安い ${man(lo)}</span><span>高い ${man(hi)}</span></div>
      <div class="scrollx"><table class="rvt"><thead><tr><th>カテゴリ</th><th>支払総額<small>この車</small></th><th>範囲<small>店による違い（25〜75%）</small></th><th>本体<small>この車</small></th><th>諸費用<small>真ん中</small></th><th>保証あり</th><th>法定整備付</th><th>掲載日数<small>グー</small></th><th>比べた掲載</th></tr></thead>
      <tbody>${ok.map(row).join('')}${few.map(row).join('')}</tbody></table></div>`;
    }
  }
  if(r){
    const all=RVCAT.filter(([k])=>r.cats[k]).map(([k,nm])=>({k,nm,v:r.cats[k]})).filter(x=>x.v[9]>=3).sort((p,q)=>p.v[0]-q.v[0]);
    if(all.length)h+=`<details class="rvraw"${a?'':' open'}><summary>補足：生の真ん中（${y}年式・${r.b}・混ざりあり）<span class="qi" data-tip="掲載をそのまま並べた値。そのカテゴリの店がたまたま高いグレード・低走行を多く並べていると高く出る（2021年式アルファード＝2.5S とエグゼクティブラウンジが混ざる等）。値付けの物差しには上の「この車」の値を使う。点検の基準＝ライバル店DB\\scripts\\mix_check.py">?</span></summary>
     <table class="rvt"><thead><tr><th>カテゴリ</th><th>総額の真ん中</th><th>台数</th><th>混ざりの点検<small>一般店と比べて</small></th></tr></thead><tbody>${all.map(x=>`<tr><td>${x.nm}</td><td class="n">${man(x.v[0])}</td><td class="n">${x.v[9]}台</td><td class="n">${x.k==='C1'?'（比べる元）':x.v[10]?`<span class="mx">${RVMK2[x.v[10]]}</span>${x.v[11]!=null?`<small>車の中身だけで ${x.v[11]>0?'+':''}${x.v[11]}%</small>`:''}`:'—'}</td></tr>`).join('')}</tbody></table></details>`;
  }
  return h?`<div class="rival open">${h}</div>`:'';
}
const man=v=>v==null||isNaN(v)?'—':(v/10).toFixed(1)+'万';
const sman=v=>v==null||isNaN(v)?'—':(v>=0?'+':'−')+(Math.abs(v)/10).toFixed(1)+'万';
const pc=v=>v==null||isNaN(v)?'—':(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(1)+'%';
document.getElementById('stamp').textContent=window.SOBA?`データ ${SOBA.raw}・作成 ${SOBA.built}${SOBA.demo?'（見本）':''}`:'データがありません';
// 年式は 和暦/西暦 で出す
function wy(y){y=+y;return y>=2019?`令和${y-2018}/${y}`:y>=1989?`平成${y-1988}/${y}`:`昭和${y-1925}/${y}`}
const row=SobaCalc.row,pr=SobaCalc.pr;
// 税抜をメインに、税込を横に添える（ゆうた 2026-10-03）。p＝R.tax の {ex, inc}
const tx2=p=>p?`${man(p.ex)}<span class="tx">税抜</span><span class="inc">税込 ${man(p.inc)}</span>`:'—';
// いまの金額の部品：税抜を大きく、税込は下に小さく（ゆうた 2026-10-03）
const ex1=p=>p?`${(p.ex/10).toFixed(1)}<small>万</small><span class="tx">税抜</span>`:'—';
const inc1=p=>p?`税込 ${man(p.inc)}`:'';
const CFHELP='精度＝この条件の1台が見込みから外れる大きさの目安（半分の車がこの幅に入る）。A ±5%以内／B 8%／C 11%／D 15%／E 20%／F それより大きい。同じ年式・グレード・型式のばらつき・評価点・近い実績の件数から出し、AAの答え合わせで合わせている。出品票の状態（警告灯など）は入っていない。';
const cfb=c=>c?`<span class="cfb" data-tip="${CFHELP}&lt;br&gt;理由：${c.why.join('／')}"><span class="cf ${c.grade}">${c.grade}</span>±${c.pct}%<span class="q">?</span></span>`:'';
const cfl=c=>c?`<div class="s" title="${c.why.join('／')}"><span class="cf ${c.grade}">${c.grade}</span>精度・外れの目安 ±${c.pct}%</div>`:'';
let M=null,S={},CMPS=[],CDLG=null;
// 比較する車種（最大2台＝合わせて3車種）。条件は選んだ車の標準＋走行は今の車にそろえる（ゆうた 2026-10-04）
const CCOL=['var(--rt)','var(--c2)','var(--c3)'];
function cmpQ(o){const C=FULLC(o.key);if(!C||!C.years[o.y])return null;const Y=C.years[o.y];const c={m:o.m||Y.std.m,g:o.g||Y.std.grade,sb:o.sb!=null?o.sb:'__ALL__',km:o.km!=null?o.km:Y.std.km,col:o.col||(C.fit.sold&&C.fit.sold.cs[0])||'パール白',e:o.e||4.0,i:o.i||'B'};let R=null;try{R=SobaCalc.quote(C,o.y,c)}catch(e){}return R?{C,Y,c,R,y:o.y}:null}
const MK_ORDER=[SMK||'サンプル・見かた','トヨタ','日産','ホンダ','マツダ','スバル','三菱','ダイハツ','スズキ','MINI'];
// 左の一覧：同じ車名の歴代モデル（「〜（2013年以前）」なども）は1つにまとめ、押すと開く（ゆうた 2026-10-04）
const OPEN=new Set(),SHUT=new Set(),MKSHUT=new Set();   // MKSHUT＝閉じたメーカー（ゆうた 2026-10-05「メーカーで閉じれるように」）
const baseName=m=>(m.family||m.car.replace(/（[^）]*）$/,'')).trim();
const yr0=m=>Math.min(...Object.keys(m.years).map(Number)),yr1=m=>Math.max(...Object.keys(m.years).map(Number));
let MKINIT=false;   // 開いた時はメーカーを全部閉じる（2026-10-09 ゆうた）
// 全角の英数字（ＪＦ３・ＡＧＨ３０Ｗ・－）を半角に（2026-10-09 ゆうた「左の一覧のモデルコードも半角英数に」）。カタカナ・（）はそのまま
const hw=t=>String(t==null?'':t).replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/[－‐]/g,'-').replace(/＋/g,'+').replace(/＆/g,'&');
function list(){const q=document.getElementById('q').value.trim().toLowerCase();if(!MKINIT&&typeof D!=='undefined'){D.forEach(m=>MKSHUT.add(m.maker));MKINIT=true}const nav=document.getElementById('list');const st=nav.scrollTop;nav.innerHTML='';
 const L=D.filter(m=>!q||hw(m.maker+m.car+m.key+(m.mods||[]).join(' ')+((m.kn||{}).gens||[]).join(' ')).toLowerCase().includes(hw(q).toLowerCase()));
 const mks=[...new Set(L.map(m=>m.maker))].sort((a,b)=>(MK_ORDER.indexOf(a)+99)%99-(MK_ORDER.indexOf(b)+99)%99);
 const item=(m,child,c2)=>{const b=document.createElement('button');b.className=(M&&M.key===m.key?'on ':'')+(child?'child':'')+(c2?' c2':'');
  const gn=((m.kn||{}).gens||[]).join('・'),md=(m.mods||[]).includes('*')?'全型式':(m.mods||[]).slice(0,3).join('・').replace(/■/g,'');
  b.innerHTML=hw(child?`${c2&&m.sub?m.sub+(gn?' '+gn:''):m.sub&&!c2?m.sub+' '+(gn||m.car.replace(baseName(m),'').trim()):gn||m.car.replace(baseName(m),'').replace(/[（）]/g,'').trim()||md}<small>${yr0(m)}〜${yr1(m)}年式　${md}</small>`:`${m.car}<small>${md}　${Object.keys(m.years).length}年式</small>`);
  b.onclick=()=>openCard(m.key);return b};
 mks.forEach(mk=>{const shut=!q&&MKSHUT.has(mk),h=document.createElement('div');h.className='mkh'+(shut?' shut':'');const nc=new Set(L.filter(m=>m.maker===mk).map(baseName)).size;h.innerHTML=`<span class="arw">${shut?'▸':'▾'}</span>${mk}<small>${nc}車種</small>`;h.onclick=()=>{MKSHUT.has(mk)?MKSHUT.delete(mk):MKSHUT.add(mk);list()};nav.appendChild(h);
  if(shut)return;
  if(mk===SMK){L.filter(m=>m.maker===mk).forEach(m=>{const b=document.createElement('button');b.className=(M&&M.key===m.key?'on ':'')+'child';b.innerHTML=`${m.car}<small>${(m.lesson||{}).tag||''}</small>`;b.onclick=()=>{M=m;S={};lessonInit();list();draw()};nav.appendChild(b)});
   if(SMPD.study&&(!q||hw(SMPD.study.car+SMPD.study.tag).toLowerCase().includes(hw(q).toLowerCase()))){const st=SMPD.study,b=document.createElement('button');b.className=(M&&M.key===st.key?'on ':'')+'child';b.innerHTML=`${st.car}<small>${st.tag}</small>`;b.onclick=()=>{M=Object.assign({maker:SMK,study:1},st);S={};list();draw()};nav.appendChild(b)}   // サンプルG＝グラフだけのページ（年式・計算は無い）
   return}   // サンプルは1段で並べる（押せばすぐ開く）
  const G={};L.filter(m=>m.maker===mk).forEach(m=>(G[baseName(m)]=G[baseName(m)]||[]).push(m));
  Object.keys(G).sort((a,b)=>a.localeCompare(b,'ja')).forEach(n=>{const ms=G[n].sort((a,b)=>yr0(a)-yr0(b)||a.key.localeCompare(b.key));
   const id=mk+'|'+n,open=!!q||OPEN.has(id)||(ms.some(m=>M&&M.key===m.key)&&!SHUT.has(id));
   const g=document.createElement('button');g.className='grp'+(ms.some(m=>M&&M.key===m.key)?' has':'');
   g.innerHTML=`<span class="arw">${open?'▾':'▸'}</span>${hw(n)}`;   // 1階層目は車名だけ（ゆうた 2026-10-05）。1モデルしか無い車も開いて選ぶ
   g.onclick=()=>{if(open){OPEN.delete(id);SHUT.add(id)}else{OPEN.add(id);SHUT.delete(id)}list()};nav.appendChild(g);
   // 2026-10-10 輸入車：ボディ違い・高性能（sub）は、ベースの世代（under）の下に一段下げて並べる（3シリーズ → E90 → M3）。中身は完全に独立したカード
   if(open){const ks=new Set(ms.map(m=>m.key)),kid=m=>m.sub&&m.under&&ks.has(m.under);ms.filter(m=>!kid(m)).forEach(m=>{nav.appendChild(item(m,true));ms.filter(x=>kid(x)&&x.under===m.key).sort((a,b)=>(a.sub||'').localeCompare(b.sub||'','ja')).forEach(x=>{nav.appendChild(item(x,true,true));ms.filter(y=>kid(y)&&y.under===x.key).sort((a,b)=>(a.sub||'').localeCompare(b.sub||'','ja')).forEach(y=>{const b2=item(y,true,true);b2.style.paddingLeft='3em';nav.appendChild(b2)})})})}})});   // 2026-10-10 もう一段（カイエン → E3 → └クーペ → └ターボ）
 nav.scrollTop=st}
/* 条件の持ち方（2026-10-09 ゆうた「最初に決めるのは年式とグレードだけ。あとは指定なしから」）
   S.ys＝選んだ年式（複数可）／S.f＝絞り込み {g グレード, m 型式, kb 走行の帯, col 色区分, sb 詳細, e 評価点, i 内装}（null＝指定なし）／S.kmx＝ぴったりの走行（千km・入れた時だけ）
   値＝当てはまる実績の組ごとに式で出した値の、台数の重みの真ん中（SobaCalc.quoteMix）。
   S.y・S.g・S.m・S.sb・S.km・S.col・S.e・S.i は「代表の1台」（台数が一番多い年式・一番多い組）＝グラフの形・年式ごとの欄・比較などに使う（calc の後に入る） */
function initS(){const ys0=Object.keys(M.years).sort().reverse(),y0=ys0.find(y=>{const n=SobaCalc.cxCount(M,[y],{g:M.years[y].std.grade});return n.aa+n.rt>=1})||ys0[0],ys=[y0,...ys0.filter(y=>y!==y0)];   // 最初は実績のある一番新しい年式から開く（その年式の標準グレードで AA＋小売が1台以上。CarFlow とそろえた。2026-10-10。一番新しい年式に実績が無いと「データが足りません」で始まっていた）
 if(S.ph!=null&&!(M.phases||[])[S.ph])S.ph=null;if(S.f&&S.ph==null)S.f.ph=null;   // 期（2026-10-09）：期を押した時だけ、その期の車（初度登録の年月で振り分け）に絞る
 if(!S.ys||!S.ys.length)S.ys=[ys[0]];S.ys=S.ys.filter(y=>M.years[y]);if(!S.ys.length)S.ys=[ys[0]];S.ys.sort().reverse();
 S.f=S.f||{};if(S.f.g===undefined)S.f.g=M.years[S.ys[0]].std.grade;
 if(!S.y||!S.ys.includes(S.y))S.y=S.ys[0]}
// 選び肢ごとの台数（ほかの条件はそのまま・その条件だけ外して数える）。{値: {a: AA 台数, r: 小売 台数}}
function facet(k){const o={};['a','r'].forEach(kind=>{if(kind==='r'&&(k==='e'||k==='i'))return;SobaCalc.cxMatch(M,S.ys,S.f,kind,k).forEach(x=>{const v=x[k];if(v==null)return;(o[v]=o[v]||{a:0,r:0})[kind]+=x.n})});return o}
const KBN=SobaCalc.CX_KBN;
const ymPrev=ym=>{const m=String(ym||'').match(/(\d{4})\/(\d{1,2})/);if(!m)return '';let y=+m[1],mo=+m[2]-1;if(mo<1){mo=12;y--}return y+'/'+String(mo).padStart(2,'0')};   // 期の終わり＝次の期の始まりの前の月
// 期を選んでいる時の期（2026-10-09）。線・台数・流札率はその期の車だけ（build.py が phases[i] に入れる）
const PHSEL=()=>S.ph!=null&&(M.phases||[])[S.ph]&&M.phases[S.ph].by==='ym'?M.phases[S.ph]:null;
// 今の条件の言葉（比較の札・ライバル店の見出し）
function condText(){const f=S.f||{},p=[];p.push(S.ys.length>1?S.ys.slice().sort().join('・')+'年式':wy(S.ys[0]));p.push(f.g!=null?f.g:'グレード指定なし');if(f.sb!=null)p.push(f.sb||'詳細なし');if(f.m!=null)p.push(f.m);
 p.push(S.kmx!=null?(S.kmx/10).toFixed(1)+'万km':f.kb!=null?KBN[f.kb]:'走行指定なし');if(f.col!=null)p.push(f.col);if(f.e!=null||f.i!=null)p.push('評価'+(f.e??'—')+'/'+(f.i??'—'));return p.join('・')}
function KNCOL(){const K=M.kn||{};let cl=K.colors||[];const ph=(M.phases||[]).find(p=>p.years.includes(+S.y));if(ph&&ph.gen)cl=cl.filter(x=>!x.gen||x.gen===ph.gen||x.gen.split(/[（(\s]/)[0]===ph.gen.split(/[（(\s]/)[0]);const seen=new Set();cl=cl.filter(x=>{const k=(x.code||"")+x.name;if(seen.has(k))return false;seen.add(k);return true});if(!cl.length)return "";return `<h5>色番と正式名（${cl.length}色${ph&&ph.gen?"・"+ph.gen:""}）<span class="qi" data-tip="車種知識（メーカー資料・色番一覧で照らし合わせ）。出品票の色番と合わせて、正式な色名が分かる">?</span></h5><div class="cols">${cl.map(x=>`<span class="${x.op?"op":""}" data-tip="${x.code?"色番 "+x.code+"・":""}${x.name}${x.op?"・メーカーオプション色":x.op===false?"・標準色":""}${x.phase?"（"+x.phase+"）":""}">${x.code?`<b>${x.code}</b> `:""}${x.name}</span>`).join("")}</div>`}
// 流札率（AA・修復歴なし）。全体の平均と比べて、売り手の言い値と業者の値が合っていない車を見つける
function wyc(y){y=+y;const w=y>=2019?`令和${y-2018===1?'元':y-2018}年`:y>=1989?`平成${y-1988}年`:`昭和${y-1925}年`;return `${w}（${y}年）式の車`}
function NAG(){const N=M.nag,A=(window.SOBA&&SOBA.avg&&SOBA.avg.nag)||{};if(!N||!N.all||!A.all)return null;
 const yv=N.years&&N.years[S.y],r=(yv||N.all)[0],n=(yv||N.all)[1],av=A.all[0],x=Math.round(r/av*10)/10;
 let cls='',say='ふつう';if(x>=2.5){cls='ng';say='流札が多い：売り手の言い値に業者の値が届いていない'}else if(x>=1.5){cls='mid';say='流札がやや多い'}else if(x<=0.6){cls='ok';say='流札が少ない：相場が固まっている'}
 let tr='';if(N.r3&&N.prev&&N.r3[1]>=30&&N.prev[1]>=30){const d=N.r3[0]-N.prev[0];if(d>=4&&N.r3[0]>=N.prev[0]*1.3)tr=`直近3か月で増えている（${N.prev[0]}%→${N.r3[0]}%）。相場が下がり始めている合図のことがある`;else if(d<=-4&&N.r3[0]<=N.prev[0]*0.7)tr=`直近3か月で減っている（${N.prev[0]}%→${N.r3[0]}%）`}
 const tip=`流札率＝AAに出た車（修復歴なし）のうち売れずに流れた割合。${yv?wyc(S.y)+'の':'この車種全体の'}${n.toLocaleString()}台で ${r}%。&lt;br&gt;全体の平均 ${av}%（車種の真ん中 ${A.car_mid}%・上位4分の1 ${A.car_p75}%・上位1割 ${A.car_p90}%）。&lt;br&gt;車種全体 ${N.all[0]}%／直近3か月 ${N.r3?N.r3[0]+'%':'—'}／その前 ${N.prev?N.prev[0]+'%':'—'}。&lt;br&gt;多い車は、新型の未使用車・値付けの判断が割れる車に多い。AAに出しても流れやすいので、すぐAAに出す前提の買取は控えめに`;
 return {r,av,x,cls,say,tr,tip,lab:yv?wyc(S.y)+'の':'車種全体の'}}
// 比較する車種を選ぶ所
function cdDef(C,y){const Y=C.years[y];return {y,m:Y.std.m,g:Y.std.grade,sb:'__ALL__',col:(C.fit.sold&&C.fit.sold.cs[0])||'パール白'}}
function cdOpen(idx){if(CDLG&&idx==null){CDLG=null;draw();return}if(idx!=null){const o=CMPS[idx];CDLG={q:'',idx,key:o.key,e:4,i:'B',...o};CDLG.km=o.km}else CDLG={q:'',idx:null,key:null,km:S.km,e:S.e||4,i:S.i||'B'};draw()}
function cdSet(k,v){const C=()=>FULLC(CDLG.key);if(k==='key'&&!FULLC(v)){SobaData.card(v).then(()=>cdSet('key',v)).catch(e=>SobaData.fail(e));return}
 if(k==='km')v=Math.round(+v*10);if(k==='e')v=+v;CDLG[k]=v;
 if(k==='key'){const c=C();Object.assign(CDLG,cdDef(c,Object.keys(c.years).sort().reverse()[0]))}
 if(k==='y')Object.assign(CDLG,cdDef(C(),v));
 if(k==='m'){const gl=(C().years[CDLG.y].mg||{})[v];if(gl&&gl.length&&!gl.includes(CDLG.g)){CDLG.g=gl[0];CDLG.sb='__ALL__'}}
 if(k==='g'){CDLG.sb='__ALL__';const gm=(C().years[CDLG.y].gm||{})[v];if(gm)CDLG.m=gm}
 if(k==='q'){draw();const e=document.getElementById('cdq');if(e){e.focus();e.setSelectionRange(v.length,v.length)}return}draw()}
function cdAdd(){if(!CDLG||!CDLG.key)return;const o={key:CDLG.key,y:CDLG.y,m:CDLG.m,g:CDLG.g,sb:CDLG.sb,km:CDLG.km,col:CDLG.col,e:CDLG.e,i:CDLG.i};if(CDLG.idx!=null)CMPS[CDLG.idx]=o;else if(CMPS.length<2)CMPS.push(o);CDLG=null;draw()}
function cmpDel(i){CMPS.splice(i,1);draw()}
function CDLGH(){if(!CDLG)return '';const q=CDLG.q.trim().toLowerCase();const L=D.filter(m=>!q||(m.maker+m.car+m.key+(m.mods||[]).join(' ')).toLowerCase().includes(q)).slice(0,60);const C=CDLG.key&&FULLC(CDLG.key);
 const Y=C&&C.years[CDLG.y],o=(v,cur,lb)=>`<option value="${String(v).replace(/"/g,'&quot;')}" ${v===cur?'selected':''}>${lb==null?v:lb}</option>`;
 const cols=C?[...new Set([...((C.fit.sold||{}).cs||[]),...Y.colors.map(c=>c[0])])]:[];
 const gl=Y?((Y.mg||{})[CDLG.m]||[]):[];
 return `<div class="cmpdlg"><b>${CDLG.idx!=null?`比較の${CDLG.idx+2}台目の条件を変える`:`比較する車種を足す（あと${2-CMPS.length}台）`}</b>
  ${CDLG.idx==null?`<input id="cdq" placeholder="車種・型式でさがす" value="${CDLG.q.replace(/"/g,'&quot;')}" oninput="cdSet('q',this.value)">
  <div class="res">${L.map(m=>`<button class="${m.key===CDLG.key?'on':''}" onclick="cdSet('key','${m.key}')">${m.maker} ${m.car}<span class="muted">（${(m.mods||[]).includes('*')?'全型式':(m.mods||[]).slice(0,2).join('・')}）</span></button>`).join('')||'<span class="muted">見つかりません</span>'}</div>`:`<div>${C.maker} ${C.car}</div>`}
  ${C?`<div class="row2">
   <label>年式<select onchange="cdSet('y',this.value)">${Object.keys(C.years).sort().reverse().map(y=>o(y,CDLG.y,wy(y))).join('')}</select></label>
   <label>型式<select onchange="cdSet('m',this.value)">${(Y.models||[]).map(x=>o(x[0],CDLG.m,`${x[0]}（${x[1]}台）`)).join('')}</select></label>
   <label>グレード（メイン）<select onchange="cdSet('g',this.value)">${[...Y.grades.filter(g=>gl.includes(g[0])),...Y.grades.filter(g=>!gl.includes(g[0]))].map(g=>o(g[0],CDLG.g,`${g[0]}（${g[1]}台）${gl.length&&!gl.includes(g[0])?'・ほかの型式':''}`)).join('')}</select></label>
   <label>詳細<select onchange="cdSet('sb',this.value)">${o('__ALL__',CDLG.sb,'全体（詳細つきも含めた平均）')}${o('',CDLG.sb,'メイングレードのみ')}${((Y.subs||{})[CDLG.g]||[]).map(b=>o(b[0],CDLG.sb,`${b[0]}（${b[1]}台）`)).join('')}</select></label>
   <label>走行（万km）<input type="number" min="0" max="200" step="0.5" value="${(CDLG.km/10).toFixed(1)}" onchange="cdSet('km',this.value)" style="width:80px"></label>
   <label>色<select onchange="cdSet('col',this.value)">${cols.map(c=>o(c,CDLG.col)).join('')}</select></label>
   <label>評価点<select onchange="cdSet('e',this.value)">${[3,3.5,4,4.5,5].map(e=>o(e,CDLG.e)).join('')}</select></label>
   <label>内装<select onchange="cdSet('i',this.value)">${['A','B','C','D'].map(i=>o(i,CDLG.i)).join('')}</select></label>
   <button class="addcmp" onclick="cdAdd()">${CDLG.idx!=null?'この条件にする':'この車を足す'}</button></div>`:''}
  <div><button class="addcmp" onclick="CDLG=null;draw()">閉じる</button></div></div>`}
// 比較の時の金額（少なく）：見込み粗利・AA相場・仕入れ上限・売れる値・4か月後・買取の上限
function CMPGRID(R){if(!CMPS.length)return '';const card=(nm,cd,R2,col,i)=>`<div class="cmpc" style="--cc:${col}">${i!=null?`<button class="x" onclick="cmpDel(${i})" data-tip="比較から外す">×</button><button class="x" onclick="cdOpen(${i})" data-tip="条件を変える" style="font-size:12px">条件</button>`:''}<div class="nm">${nm}</div><div class="cd">${cd}</div>
  <div class="gp">見込み粗利 <b>${R2.gp?(R2.gp.gain/10).toFixed(1):'—'}</b>万<span class="muted">（税抜）</span></div>
  <div class="r"><span>AA相場</span><b>${man(R2.tax.aa&&R2.tax.aa.ex)}</b></div><div class="r"><span>仕入れ上限</span><b>${man(R2.tax.up&&R2.tax.up.ex)}</b></div>
  <div class="r"><span>売れる値（いま）</span><b>${man(R2.tax.rt&&R2.tax.rt.ex)}</b></div><div class="r"><span>4か月後</span><b>${man(R2.tax.rt4&&R2.tax.rt4.ex)}</b></div>
  <div class="r"><span>買取の上限（店頭）</span><b>${man(R2.tax.buy.shop&&R2.tax.buy.shop.ex)}</b></div><div class="r"><span>精度 AA／小売</span><b>${R2.conf.aa?R2.conf.aa.grade:'—'}／${R2.conf.rt?R2.conf.rt.grade:'—'}</b></div></div>`;
 let h=card(`${M.car}`,condText()+`<br><span class="muted">実績 AA ${HIT.aa}台・小売 ${HIT.rt}台の真ん中</span>`,R,CCOL[0],null);
 CMPS.forEach((o,i)=>{const q=cmpQ(o);if(q){const nos=!(q.Y.ser_sold||[]).length,noa=!(q.Y.ser_aa||[]).length;h+=card(q.C.car,`${wy(q.y)}・${q.c.m}・${q.c.g}${q.c.sb&&q.c.sb!=='__ALL__'?' '+q.c.sb:''}・${(q.c.km/10).toFixed(1)}万km・${q.c.col}・${q.c.e}/${q.c.i}${nos||noa?`<br><span style="color:var(--mid)">グラフの推移：${nos&&noa?'小売・AAとも':nos?'小売の':'AAの'}データがまだ無い（取得中の車種は取り直し後に出る）</span>`:''}`,q.R,CCOL[i+1],i)}});
 return `<div class="bh" style="margin:4px 0 6px">比較（税抜）<span class="qi" data-tip="金額はすべて税抜。上の条件を変えると1台目が変わる">?</span></div><div class="cmpgrid">${h}</div>`}

// ── 装備（小売の機械学習に入っている物だけ）と未使用車（2026-10-06）──
const EQL={q_psd:['スライドドア',[[2,'両側電動'],[1,'片側電動'],[0,'電動なし']]],q_one:['ワンオーナー',[[1,'あり'],[0,'なし']]],q_rec:['記録簿',[[1,'あり'],[0,'なし']]],q_nsm:['禁煙車',[[1,'禁煙'],[0,'表示なし']]],
 q_cold:['寒冷地仕様',[[1,'あり'],[0,'なし']]],q_aero:['エアロ',[[1,'あり'],[0,'なし']]],q_ld:['ローダウン',[[1,'あり'],[0,'なし']]],q_wel:['福祉車両',[[1,'福祉'],[0,'ふつう']]],q_dsl:['ディーゼル',[[1,'ディーゼル'],[0,'ガソリン等']]],
 q_aw:['アルミ（インチ）',[[0,'なし'],...[13,14,15,16,17,18,19,20,21].map(x=>[x,x+'インチ'])]],q_seat:['定員',[[0,'不明'],...[4,5,6,7,8,9,10].map(x=>[x,x+'人'])]],q_nav:['ナビ',[[1,'あり'],[0,'なし']]],q_tv:['TV',[[2,'フルセグ'],[1,'ワンセグ'],[0,'なし']]],
 q_shk:['車検',[[24,'整備付（2年）'],[18,'残り1年半'],[12,'残り1年'],[6,'残り半年'],[0,'なし']]],q_full:['フル装備',[[1,'あり'],[0,'なし']]]};
function eqAuto(Y){const G=M.fit.sold&&M.fit.sold.gbm;return G&&G.eqm?SobaCalc.eqTop(G,+S.y,S.g):null}
function unusedOn(){if(S.un!=null)return S.un;return Math.max(...(S.ys||[S.y]).map(Number))>=new Date().getFullYear()-1&&S.kmx!=null&&S.kmx<1}
function EQH(Y){const E=M.fit.sold&&M.fit.sold.gbm&&M.fit.sold.gbm.eqm,au=eqAuto(Y)||{},q=S.q||{},un=unusedOn();
 const lab=(k,v)=>((EQL[k]||[k,[]])[1].find(x=>x[0]===v)||[v,String(v)])[1];
 const sel=E?E.f.filter(k=>EQL[k]).map(k=>`<label>${EQL[k][0]}<select data-q="${k}"><option value="" ${q[k]==null?'selected':''}>自動（多いのは${lab(k,au[k])}）</option>${EQL[k][1].map(x=>`<option value="${x[0]}" ${q[k]===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></label>`).join(''):'';
 return `<label><span>未使用車<span class="qi" data-tip="自動＝今年・去年式で走行1千km未満なら未使用車（新車価格の何%で出す）">?</span></span><select id="sun"><option value="" ${S.un==null?'selected':''}>自動（${un?'未使用車':'ふつうの中古車'}）</option><option value="1" ${S.un===true?'selected':''}>未使用車</option><option value="0" ${S.un===false?'selected':''}>ふつうの中古車</option></select></label>`+
  (sel?`<details class="eqd" ${Object.keys(q).length?'open':''}><summary>装備<span class="qi" data-tip="小売の値に効く装備。選ばない物は「この年式・グレードのよくある形」の平均">?</span></summary><div class="pick">${sel}</div></details>`:'')}
function unusedLine(R){const U=R.unused;if(!U)return '';if(!U.np&&U.paa!=null)return `<div class="note" style="margin:0 0 6px"><b>未使用車として計算</b>：新車価格が分からないので、AA＝AA の未使用車 ${U.naa}台の落札の真ん中 <b>${man(U.paa)}</b>（税抜）。小売＝機械学習（未使用車の印つき）</div>`;if(!U.np)return '';
 return `<div class="note" style="margin:0 0 6px"><b>未使用車として計算</b>：新車価格 ${man(U.np)}（税込）。AA＝新車価格 × <b>${U.raa!=null?(U.raa*100).toFixed(1)+'%':'—'}</b>${U.naa?`（AA の未使用車 ${U.naa}台の比）`:''}${U.src}。小売＝機械学習（未使用車の印つき）で、新車価格の <b>${U.rrt!=null?(U.rrt*100).toFixed(1)+'%':'—'}</b></div>`}
function calc(){const c={km:S.kmx,q:S.q||{},unused:unusedOn()};const R=SobaCalc.quoteMix(M,S.ys,S.f,c);
 if(R&&R.mix){const p=R.mix.rep;S.y=String(p.y);S.g=p.g;S.m=p.m;S.sb=p.sb;S.km=p.km;S.col=p.col;S.e=p.e;S.i=p.i}return R}
function trend(s){if(s==null)return '—';return s<=-1?'下落が速い':s<=-0.4?'ゆっくり下落':s<0.4?'横ばい':'上昇'}
function more(v,a){if(v==null||!a)return '';const r=v/a;return r>=1.5?'かなり豊富':r>=1.15?'多め':r<=0.5?'かなり少ない':r<=0.87?'少なめ':'平均並み'}
// グラフの縮尺（車を変えても残す）。rng＝見る期間（か月）、zoom＝fit（値の近くを拡大）／zero（0から）
const CH={y1:false,rng:12,zoom:'fit',mk:true,ev:true,mavg:false,gen:false,mc:false,nag:true,cnt:true,ln:true,cdl:true};
try{const o=JSON.parse(localStorage.getItem('chshow')||'{}');if(o.ln===false)CH.ln=false;if(o.cdl===false)CH.cdl=false}catch(e){}   // 折れ線・ローソク足の表示（2026-10-09 ゆうた。覚える）
function setCh(k,v){CH[k]=v;if(k==='ln'||k==='cdl')try{localStorage.setItem('chshow',JSON.stringify({ln:CH.ln,cdl:CH.cdl}))}catch(e){}draw()}
const mon=t=>{const d=new Date();d.setMonth(d.getMonth()+t);return (d.getMonth()+1)+'月'};
// モデル平均の動き：選んだ型式を含む年式（全年式が対象の車種は全部の年式）の月ごとの値を、年式ごとに「いま」を基準にした比にして、台数の重みで平均（対数）
function MIDX(card,ys,kind){const A={};ys.forEach(y=>{const s=((card.years[y]||{})['ser_'+kind])||[];if(s.length<4)return;const b=s.reduce((a,x)=>x[0]>a[0]?x:a);s.forEach(x=>{const w=Math.min(x[2],60);(A[x[0]]=A[x[0]]||[0,0,0,0])[0]+=Math.log(x[1]/b[1])*w;A[x[0]][1]+=w;A[x[0]][2]+=x[2];A[x[0]][3]++})});
 return Object.keys(A).map(Number).sort((a,b)=>a-b).filter(t=>A[t][2]>=10).map(t=>[t,A[t][0]/A[t][1],A[t][2],A[t][3]])}
function MABS(card,ys,kind){const A={};ys.forEach(y=>{const s=((card.years[y]||{})['ser_'+kind])||[];s.forEach(x=>{const w=Math.min(x[2],60);(A[x[0]]=A[x[0]]||[0,0,0,0])[0]+=Math.log(x[1])*w;A[x[0]][1]+=w;A[x[0]][2]+=x[2];A[x[0]][3]++})});
 return Object.keys(A).map(Number).sort((a,b)=>a-b).filter(t=>A[t][2]>=10).map(t=>[t,Math.exp(A[t][0]/A[t][1]),A[t][2],A[t][3]])}
/* 複数の年式を選んだ時のグラフの線（2026-10-09）：年式ごとの月・週の値を、その年式の直近の値で割った「形」にし、今の条件に当てはまる台数で重みをつけて合わせる。
   高さは下で「いまの値」（顔ぶれの真ん中）にそろえるので、形だけを使う。件数は足し合わせ */
function yMerged(){const Y=M.years[S.y];if(!S.ys||S.ys.length<2)return Y;
 const W={};S.ys.forEach(y=>{const n=SobaCalc.cxCount(M,[y],S.f);W[y]=(n.aa+n.rt)||1});const o={...Y};
 ['sold','aa'].forEach(k=>{const anc={};S.ys.forEach(y=>{const Yy=M.years[y];const w=(Yy['ser_'+k+'_w']||[]).filter(x=>x[0]>=-4).map(x=>x[1]),m=(Yy['ser_'+k]||[]).filter(x=>x[0]>=-1).map(x=>x[1]);const v=(w.length?w:m).sort((a,b)=>a-b);if(v.length)anc[y]=v[Math.floor(v.length/2)]});
  ['','_w'].forEach(sf=>{const A={};S.ys.forEach(y=>{if(!anc[y])return;(M.years[y]['ser_'+k+sf]||[]).forEach(x=>{const a=(A[x[0]]=A[x[0]]||[0,0,0]);a[0]+=Math.log(x[1]/anc[y])*W[y];a[1]+=W[y];a[2]+=x[2]})});
   o['ser_'+k+sf]=Object.keys(A).map(Number).sort((a,b)=>a-b).map(t=>[t,Math.exp(A[t][0]/A[t][1]),A[t][2]])})});
 return o}
function chart(R){const PH=PHSEL(),MULTI=S.ys&&S.ys.length>1||!!PH,Y=PH?{...M.years[S.y],ser_sold:PH.ser_sold||[],ser_aa:PH.ser_aa||[],ser_sold_w:PH.ser_sold_w||[],ser_aa_w:PH.ser_aa_w||[]}:yMerged(),F=M.fit,TX=SobaCalc.CFG.TAX,ks=R.rtStd?R.rt/R.rtStd:1,ka=R.aaStd?R.aa/R.aaStd:1,same=Math.abs(ks-1)<0.005&&Math.abs(ka-1)<0.005;
 // 月ごと（t＝月）と週ごと（w＝週→月に直す）。直近は週ごと、それより前は月ごと。小売は税込→÷1.1（グラフは税抜でそろえる）
 const WK=4.345,mix=(mon,wk,div)=>{const W=(wk||[]).map(x=>[x[0]/WK,x[1]/div,x[2]]);const cut=W.length?Math.min(...W.map(x=>x[0]))-0.3:1;return [...(mon||[]).filter(x=>x[0]<cut).map(x=>[x[0],x[1]/div,x[2]]),...W]};
 const S0=mix(Y.ser_sold,Y.ser_sold_w,TX),A0=mix(Y.ser_aa,Y.ser_aa_w,1);
 // 実際の値のローソク足（2026-10-09 ゆうた）：今の条件（年式・グレード・期・走行の帯）に当てはまる車の、月ごと（直近4か月は週ごと）の 10・25・50・75・90%
 const CDL=SobaCalc.candles(M,S.ys,S.f),cdmix=(L,div)=>{const W=L.filter(x=>x[7]),cut=W.length?Math.min(...W.map(x=>x[0]))-0.3:1;return [...L.filter(x=>!x[7]&&x[0]<cut),...W].map(x=>[x[0],...x.slice(1,6).map(v=>v/div),x[6],x[7]])};
 const CA=cdmix(CDL.a,1),CR=cdmix(CDL.r,TX);
 if(!S0.length&&!A0.length&&!CA.length&&!CR.length)return PH?`<div class="note" style="margin:8px 0">${PH.name}の車（初度登録 ${PH.ym}〜）は、まだ取引が少ない（AA ${(PH.n||{}).aa??0}台・小売 ${(PH.n||{}).sold??0}台・1か月3台未満）ので、線とローソク足は出せません。上の値は当てはまる実績から出しています。</div>`:'';
 // 線の高さを「いまの値」にそろえる（ゆうた 2026-10-05「グラフがズレてる」）：過去の線は式で作った標準の車、いまの値は機械学習なので高さがずれる。
 // 直近（1か月以内）の点の真ん中を、選んだ車＝いまの値・標準の車＝標準の車のいまの値に合わせ、形（上がり下がり）だけを使う
 const anc0=ser=>{const v=ser.filter(x=>x[0]>=-1.05).map(x=>x[1]).sort((a,b)=>a-b);return v.length?v[Math.floor(v.length/2)]:null};
 const aS=anc0(S0),aA=anc0(A0),kS=aS&&R.rt?R.rt/TX/aS:ks,kA=aA&&R.aa?R.aa/aA:ka,kS0=aS&&R.rtStd?R.rtStd/TX/aS:1,kA0=aA&&R.aaStd?R.aaStd/aA:1;
 const Ss=S0.map(x=>[x[0],x[1]*kS,x[2]]),As=A0.map(x=>[x[0],x[1]*kA,x[2]]);
 S0.forEach(x=>x[1]*=kS0);A0.forEach(x=>x[1]*=kA0);if(MULTI){S0.length=0;A0.length=0}   // 複数年式の時は標準の車の線を出さない
 // 4か月先の予測（選んだ車）：SobaCalc の式で月ごと。走行は同じまま（在庫の車は走らない＝相場の動きだけ）。帯＝精度の外れの目安
 const me={y:+S.y,m:S.m,g:S.g,sb:S.sb==null?'__ALL__':S.sb,km:S.km,col:S.col,e:S.e,i:S.i};
 const fc=(f,div)=>[0,1,2,3,4].map(t=>[t,(SobaCalc.prX(f,{...me,t},Y)||NaN)/div]).filter(x=>!isNaN(x[1]));
 // 予測の線は代表の1台の月ごとの動きを、いまの値（顔ぶれの真ん中）の高さにそろえる（2026-10-09）
 const sc0=(f,v)=>f.length&&v!=null&&f[0][1]>0?f.map(x=>[x[0],x[1]*v/f[0][1]]):f;
 const FS=F.sold?sc0(fc(F.sold,TX),R.rt!=null?R.rt/TX:null):[],FA=F.aa?sc0(fc(F.aa,1),R.aa):[];
 const bs=R.conf.rt?R.conf.rt.pct/100:0,ba=R.conf.aa?R.conf.aa.pct/100:0;
 const r0=-CH.rng,inr=x=>x[0]>=r0-0.01;
 // 比較の車：小売＝実線・AA＝破線、車ごとに色（2台目＝紫・3台目＝緑）。値そのもの（税抜）
 const CQ=CMPS.map((o,i)=>{const q=cmpQ(o);if(!q)return null;const k2=q.R.rtStd?q.R.rt/q.R.rtStd:1,a2=q.R.aaStd?q.R.aa/q.R.aaStd:1;const me2={...q.c,y:+q.y,t:0};
  const fc2=(f,div)=>f?[0,1,2,3,4].map(t=>[t,(SobaCalc.prX(f,{...me2,t},q.Y)||NaN)/div]).filter(x=>!isNaN(x[1])):[];
  return {...q,col:CCOL[i+1],S:mix(q.Y.ser_sold,q.Y.ser_sold_w,TX).map(x=>[x[0],x[1]*k2,x[2]]),A:mix(q.Y.ser_aa,q.Y.ser_aa_w,1).map(x=>[x[0],x[1]*a2,x[2]]),FS:fc2(q.C.fit.sold,TX),FA:fc2(q.C.fit.aa,1)}}).filter(Boolean);
 // 比べる線：選んだ車の線の「いま」の値にそろえて、動きだけを比べる（ゆうた 2026-10-04）
 const anc=(ser)=>{const v=(ser||[]).filter(x=>x[0]<=0.01);return v.length?v.reduce((a,x)=>x[0]>a[0]?x:a)[1]:null};
 const ancS=anc(Ss),ancA=anc(As),CMP=[];
 const addCmp=(card,ys,nm,dash,why,abs)=>[['sold',ancS,'var(--rt)','小売',TX],['aa',ancA,'var(--aa)','AA',1]].forEach(([k,a0,col,kn,dv])=>{if(a0==null&&!abs)return;
  if(abs){const I=MABS(card,ys,k);if(I.length<3)return;const L=I.map(x=>[x[0],x[1]/dv,x[2],null,x[3]]);CMP.push({L,col,dash,nm:`${nm}（${kn}）`,base:nm,why,abs:1});return}
  const I=MIDX(card,ys,k);if(I.length<3)return;const L=I.map(x=>[x[0],a0*Math.exp(x[1]),x[2],x[1],x[3]]);CMP.push({L,col,dash,nm:`${nm}（${kn}）`,base:nm,why})});
 const star=(M.mods||[]).includes('*'),myY=star?Object.keys(M.years):Object.keys(M.years).filter(y=>(M.years[y].models||[]).some(m=>m[0]===S.m));
 const gnm=c=>((c.kn||{}).gens||[]).join('・')||c.car;
 const solo=!CMPS.length;   // 比較中は、モデル平均・マイナーチェンジ前後・前のモデル・流札率・件数は出さない（ゆうた 2026-10-04）
  if(solo&&CH.mavg)addCmp(M,myY,`モデル平均 ${gnm(M)}（${myY[0]}〜${myY[myY.length-1]}年式）`,'0.1 4',`${star?'この車種の':'型式'+S.m+'を含む'}${myY.length}年式（${myY[0]}〜${myY[myY.length-1]}）の平均の動き`);
 if(solo&&CH.mc&&(M.phases||[]).length>1&&M.phases.some(p=>p.by==='ym')){   // 2026-10-09：期ごとの線＝その期の車（初度登録の年月）だけで作った線（世代全体の線を年式に合わせた物ではない）
  M.phases.forEach((p,i)=>[['sold','var(--rt)','小売',TX],['aa','var(--aa)','AA',1]].forEach(([k,col,kn,dv])=>{const L=(p['ser_'+k]||[]).filter(x=>x[2]>=3).map(x=>[x[0],x[1]/dv,x[2],null,'']);if(L.length<2)return;
   CMP.push({L,col,dash:['12 4','4 4','12 4 2 4'][i%3],nm:`${p.name}（${kn}）`,base:`${p.name}（${p.ym}〜の登録）`,why:`${p.name}の車だけ（初度登録の年月で振り分け・AA ${(p.n||{}).aa}台・小売 ${(p.n||{}).sold}台）の、${(p.rep||{}).y}年式 ${(p.rep||{}).grade} の標準の車にそろえた値${p.what?'。'+p.what.slice(0,60):''}`,abs:1,ph:1})}))}
 else if(solo&&CH.mc&&(M.phases||[]).length>1){const ph=M.phases.filter(p=>p.years.some(y=>M.years[y]));const cur=ph.find(p=>p.years.map(String).includes(S.y));const gn=cur&&cur.gen;ph.filter(p=>!gn||!p.gen||p.gen===gn).forEach((p,i)=>{const ys=p.years.map(String).filter(y=>M.years[y]&&(star||(M.years[y].models||[]).some(m=>m[0]===S.m)));if(ys.length)addCmp(M,ys,`${p.gen?p.gen+' ':''}${p.name}（${ys[0]}〜${ys[ys.length-1]}年式）`,['12 4','4 4','12 4 2 4'][i%3],`${p.name}（${ys[0]}〜${ys[ys.length-1]}年式・${p.ym||''}〜）の標準の車の値の平均${p.what?'。'+p.what.slice(0,60):''}`,1)})}
 if(solo&&CH.gen){const K=M.kn||{};[[K.prev,'前のモデル','6 3 1 3']].forEach(([k,lb,ds])=>{const c=k&&FULLC(k);if(c)addCmp(c,Object.keys(c.years),`${lb} ${gnm(c)}`,ds,`${c.car}（${gnm(c)}）全${Object.keys(c.years).length}年式（${Object.keys(c.years)[0]}〜${Object.keys(c.years).slice(-1)[0]}）の標準の車の値の平均`,1)})}
 // 3か月＝「直近の動きを見る画面」（2026-10-09 ゆうた「3か月と6か月がほぼ同じ。3か月のキャラを立たせる」）：先は1か月だけ・縦は直近に寄せる・下の棒は週ごと・直近4週とその前の4週の比べ
 const SH=CH.rng<=3&&!CH.y1,XMv=SH?1:(CH.y1?12:4),FSd=SH?FS.filter(x=>x[0]<=XMv):FS,FAd=SH?FA.filter(x=>x[0]<=XMv):FA;
 const vis=[...(SH?[]:[...S0,...A0]),...(CH.ln?[...Ss,...As]:[])].filter(inr).map(x=>x[1]).concat(CH.cdl?[...CA,...CR].filter(x=>inr(x)&&x[6]>=5).flatMap(x=>[x[1],x[5]]):[],[R.aa,R.rt!=null?R.rt/TX:null].filter(v=>v!=null)).concat(FSd.map(x=>x[1]*(1+(SH?0:bs))),FAd.map(x=>x[1]*(1-(SH?0:ba))),FSd.map(x=>x[1]*(1-(SH?0:bs))),R.up!=null&&!SH?[R.up]:[],CH.y1&&R.rt1y?[R.rt1y/TX*1.15,R.rt1y/TX*0.85]:[],CH.y1&&R.aa1y?[R.aa1y*1.15,R.aa1y*0.85]:[],...CMP.map(c=>c.L.filter(inr).map(x=>x[1])),...CQ.map(q=>[...q.S,...q.A].filter(inr).map(x=>x[1]).concat(q.FS.map(x=>x[1]),q.FA.map(x=>x[1]),[q.R.tax.rt&&q.R.tax.rt.ex,q.R.tax.aa&&q.R.tax.aa.ex].filter(v=>v!=null))));
 const W=760,H=318,L=54,Rr=18,T=14,B=58;let lo=Math.min(...vis)*(SH?0.985:0.95),hi=Math.max(...vis)*(SH?1.015:1.03);if(CH.zoom==='zero')lo=0;
 const XM=XMv,X=t=>L+(t-r0)/(XM-r0)*(W-L-Rr),Yp=v=>T+(hi-v)/(hi-lo)*(H-T-B);let g='';
 // 横線（縦軸）：きりのいい刻み
 const step=[5,10,20,50,100,200,500].find(s=>(hi-lo)/s<=7)||1000;for(let v=Math.ceil(lo/step)*step;v<=hi;v+=step)g+=`<line x1="${L}" x2="${W-Rr}" y1="${Yp(v)}" y2="${Yp(v)}" stroke="var(--line)"/><text x="${L-6}" y="${Yp(v)+4}" font-size="11" text-anchor="end" fill="var(--sub)">${(v/10).toFixed(0)}万</text>`;
 // 予測の場所に薄い色
 g+=`<rect x="${X(0)}" y="${T}" width="${X(XM)-X(0)}" height="${H-T-B}" fill="var(--chip)" opacity=".6"/><text x="${X(XM/2)}" y="${T+11}" font-size="10.5" text-anchor="middle" fill="var(--sub)">予測</text>`;
 // 抜き取りの区間（2026-10-08 ゆうた「7月の急落・AAが小売より高い所はどう見る？」）：DataLine は直近3か月が全件・それより前は抜き取り（1か月100台前後）。
 // 抜き取りの月は台数が少なく偏りもあり得るので、灰色の帯で分けて「流れの目安」として見せる
 const SMP=-3.5;if(r0<SMP)g+=`<rect x="${X(r0)}" y="${T}" width="${X(SMP)-X(r0)}" height="${H-T-B}" fill="var(--line)" opacity=".35"/><text x="${(X(r0)+X(SMP))/2}" y="${T+11}" font-size="10.5" text-anchor="middle" fill="var(--sub)" data-tip="この区間は DataLine の抜き取りのデータ（1か月100台前後）。台数が少なく偏ることがあるので、だいたいの流れとして見る。直近3か月は全件">抜き取り（台数少・流れの目安）</text><line x1="${X(SMP)}" x2="${X(SMP)}" y1="${T}" y2="${H-B}" stroke="var(--sub)" stroke-width="1" stroke-dasharray="1 3"/>`;
 // 横軸：月の目盛り（3か月表示は毎月・それ以外は期間に応じて）
 // 縦の目盛り線（2026-10-09 ゆうた「3か月・6か月は月・週の線を多く」）：月の線＝細い実線、週の線＝点線（3か月表示は日付も）
 if(CH.rng<=6){const WK=4.345;for(let t=Math.ceil(r0);t<=XM;t++)g+=`<line x1="${X(t)}" x2="${X(t)}" y1="${T}" y2="${H-B}" stroke="var(--line)" stroke-width="1"/>`;
  for(let w=Math.ceil(r0*WK);w<=XM*WK;w++){const t=w/WK;if(Math.abs(t-Math.round(t))<0.06)continue;g+=`<line x1="${X(t)}" x2="${X(t)}" y1="${T}" y2="${H-B}" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 4" opacity=".8"/>`;
   if(CH.rng<=3&&Math.abs(t-Math.round(t))>0.25){const d=new Date();d.setDate(d.getDate()+Math.round(w*7));g+=`<text x="${X(t)}" y="${H-B+16}" font-size="9" text-anchor="middle" fill="var(--sub)" opacity=".8">${d.getMonth()+1}/${d.getDate()}</text>`}}}
 const tk=CH.rng<=6?1:CH.rng<=12?2:3;for(let t=Math.ceil(r0);t<=XM;t++){if((t%tk)!==0&&t!==4&&t!==XM)continue;const d=new Date();d.setMonth(d.getMonth()+t);g+=`<line x1="${X(t)}" x2="${X(t)}" y1="${H-B}" y2="${H-B+4}" stroke="var(--sub)"/><text x="${X(t)}" y="${H-B+16}" font-size="11" text-anchor="middle" fill="var(--sub)">${t===0?'いま':(d.getMonth()+1)+'月'}</text>`}
 // 市場全体の相場が一番高かった月・一番安かった月（全車種の水準の真ん中）と、新型・マイナーチェンジ。
 // 線は細く、名前は月ラベルの下に小さな札で出す。札にマウスを乗せると詳しく（ゆうた 2026-10-03）
 const MK=(AV.mkt||{}),mkl=[],tags=[];
 if(CH.mk)[['rt','小売','var(--rt)'],['aa','AA','var(--aa)']].forEach(([k,nm,col])=>{const A=MK[k]||[],L2=A.filter(x=>x[0]>=r0&&x[0]<=0);if(L2.length<3)return;
  const hi=L2.reduce((a,b)=>b[1]>a[1]?b:a),lo=L2.reduce((a,b)=>b[1]<a[1]?b:a);
  [[hi,'高'],[lo,'安']].forEach(([x,w])=>{const prv=A.find(y=>y[0]===x[0]-1),ch=prv?((1+x[1]/100)/(1+prv[1]/100)-1)*100:null;
   g+=`<line x1="${X(x[0])}" x2="${X(x[0])}" y1="${T}" y2="${H-B}" stroke="${col}" stroke-width="1" stroke-dasharray="${w==='高'?'1 0':'2 3'}" opacity=".5"/>`;
   tags.push({t:x[0],col,txt:`${nm}${w==='高'?'↑':'↓'}`,tip:`${mon(x[0])}：${nm}の市場全体（${x[2]}車種）で、この期間で一番${w==='高'?'高い':'安い'}月。平均より ${pc(x[1])}${ch!=null?`、前の月から ${pc(ch)} の${ch>=0?'上昇':'下落'}がみられた`:''}（年式・グレード・走行などをそろえた後の値）`})});
  mkl.push(`${nm}全体は ${mon(hi[0])}が高く（${pc(hi[1])}）${mon(lo[0])}が安い（${pc(lo[1])}）`)});
 if(CH.ev)(M.events||[]).filter(e=>e.t>=r0&&e.t<=0).forEach(e=>{g+=`<line x1="${X(e.t)}" x2="${X(e.t)}" y1="${T}" y2="${H-B}" stroke="var(--mid)" stroke-width="1" stroke-dasharray="2 3" opacity=".7"/>`;
  tags.push({t:e.t,col:'var(--mid)',txt:({'フルモデルチェンジ':'新型','大型マイナーチェンジ':'MC','一部改良':'改良','特別仕様車・限定車':'特別','グレード・ボディ追加':'追加','価格改定':'価格'})[e.type]||e.type.split('・')[0],tip:`${e.ym}：${e.type}${e.codes&&e.codes.length?`（${e.codes.join('・')}）`:''}。${(e.note||'').replace(/\s+/g,' ').slice(0,120)}`})});
 // 札：月ラベルの下に、近い札は段をずらして並べる
 tags.sort((a,b)=>a.t-b.t);const rowEnd=[-1e9,-1e9];
 tags.forEach(tg=>{const x=X(tg.t),w=tg.txt.length*11+10;let r=rowEnd[0]<x-w/2-2?0:rowEnd[1]<x-w/2-2?1:0;rowEnd[r]=x+w/2;const y=H-B+24+r*16;
  g+=`<g class="ctag" data-tip="${tg.tip.replace(/"/g,'&quot;').replace(/</g,'&lt;')}"><rect x="${x-w/2}" y="${y}" width="${w}" height="14" rx="4" fill="var(--card)" stroke="${tg.col}"/><text x="${x}" y="${y+10.5}" font-size="10" font-weight="700" text-anchor="middle" fill="${tg.col}">${tg.txt}</text></g>`});

 if(R.up!=null&&R.up>=lo&&R.up<=hi)g+=`<line x1="${X(r0)}" x2="${X(XM)}" y1="${Yp(R.up)}" y2="${Yp(R.up)}" stroke="var(--ok)" stroke-width="1.5" stroke-dasharray="2 4"/><text x="${X(r0)+4}" y="${Yp(R.up)-5}" font-size="11" fill="var(--ok)">仕入れ上限 ${man(R.up)}</text>`;
 // 点の説明に「いつの分か」を足す（2026-10-09 ゆうた）：月ごとの点＝◯年◯月、週ごとの点＝◯/◯〜◯/◯の週
 // 基準＝相場DBを作った日（build.py の週＝(日付−作った日)÷7 の切り捨て。先週＝−1）
 const B0=(()=>{const m=String((window.SOBA||{}).built||'').match(/(\d{4})-(\d\d)-(\d\d)/);return m?new Date(+m[1],+m[2]-1,+m[3]):new Date()})();
 const per=t=>{if(Math.abs(t-Math.round(t))<0.01){const d=new Date(B0);d.setDate(1);d.setMonth(d.getMonth()+Math.round(t));return `${d.getFullYear()}年${d.getMonth()+1}月`}
  const w=Math.round(t*4.345),a=new Date(B0);a.setDate(a.getDate()+w*7);const e=new Date(a);e.setDate(e.getDate()+6);return `${a.getMonth()+1}/${a.getDate()}〜${e.getMonth()+1}/${e.getDate()}の週`};
 const pts=(ser,col)=>ser.filter(inr).map(x=>`<circle cx="${X(x[0])}" cy="${Yp(x[1])}" r="${x[0]>-4.3?(CH.cdl?0:2):2.6}" fill="${col}" data-tip="${per(x[0])}：${man(x[1])}（${x[2]}件・税抜）"></circle>`).join('');
 const line=(ser,col,dash)=>{const v=ser.filter(inr);return v.length?`<polyline points="${v.map(x=>X(x[0])+','+Yp(x[1])).join(' ')}" fill="none" stroke="${col}" stroke-width="${dash?1.2:1.6}" ${dash?'stroke-dasharray="5 4" opacity=".6"':''}/>`:''};
 // 週ごとの点（月の途中の位置）は1週ごとに売れた車が違うので上下する → 細い線＋前後3週の平均の太い線（2026-10-08）
 const isW=x=>Math.abs(x[0]-Math.round(x[0]))>0.01;
 const ma3=ser=>{const v=ser.filter(inr);return v.map((x,i)=>{if(!isW(x))return x;let a=0,w=0;for(let j=i-1;j<=i+1;j++){const y=v[j];if(!y||!isW(y))continue;const ww=Math.max(1,Math.min(y[2]||1,400));a+=Math.log(y[1])*ww;w+=ww}return [x[0],Math.exp(a/w),x[2]]})};
 const lineW=(ser,col)=>{const v=ser.filter(inr);if(!v.length)return '';const wi=v.findIndex(isW);if(wi<0)return line(v,col);
  const mon=v.slice(0,wi),wk=v.slice(wi),m=ma3(v).slice(wi);   // 月の線は最後の月の点で止める（最初の週の点までつなぐと平均の線と太線が2本重なる。2026-10-09 ゆうた「気持ち悪い」）
  return (mon.length>1?line(mon,col):'')+(CH.cdl?'':`<polyline points="${wk.map(x=>X(x[0])+','+Yp(x[1])).join(' ')}" fill="none" stroke="${col}" stroke-width="1" opacity=".4"/>`)+`<polyline points="${[...(wi>0?[v[wi-1]]:[]),...m].map(x=>X(x[0])+','+Yp(x[1])).join(' ')}" fill="none" stroke="${col}" stroke-width="1.8"/>`};
 // ローソク足：細い縦線＝1割〜9割・箱＝真ん中の半分（25〜75%）・横の太線＝真ん中（20台未満は真ん中の半分の平均）。AA は右・小売は左に少しずらす。上に台数。5台未満は薄く
 const cdlSvg=(L,col,sd,nm)=>L.filter(inr).map(x=>{const wk=x[7],st=wk?1/4.345:1,bw=Math.max(2,(X(st)-X(0))*(wk?0.32:0.2)),cx=X(x[0])+sd*bw*0.6,few=x[6]<5,op=few?.2:(CH.ln?.5:.85);
  const tip=`${per(x[0])}：${nm}の実際の値 真ん中 ${man(x[3])}・真ん中の半分 ${man(x[2])}〜${man(x[4])}・1〜9割 ${man(x[1])}〜${man(x[5])}（${x[6]}台）${few?'&lt;br&gt;5台未満なので薄く出している':''}`;
  return `<g opacity="${op}" data-tip="${tip}"><line x1="${cx}" x2="${cx}" y1="${Yp(x[5])}" y2="${Yp(x[1])}" stroke="${col}" stroke-width=".8"/><rect x="${cx-bw/2}" y="${Yp(x[4])}" width="${bw}" height="${Math.max(1,Yp(x[2])-Yp(x[4]))}" fill="${col}" fill-opacity=".15" stroke="${col}" stroke-width=".8"/><line x1="${cx-bw/2}" x2="${cx+bw/2}" y1="${Yp(x[3])}" y2="${Yp(x[3])}" stroke="${col}" stroke-width="1.6"/>${(X(st)-X(0))>=16?`<text x="${cx}" y="${Yp(x[5])-3}" font-size="8.5" text-anchor="middle" fill="${col}">${x[6]}</text>`:''}</g>`}).join('');
 // この車の値の横の点線（2026-10-09 ゆうた）：今の条件で出した AA相場・小売相場（税抜）を全期間に
 const hl=(v,col,nm)=>v!=null&&v>=lo&&v<=hi?`<line x1="${X(r0)}" x2="${X(XM)}" y1="${Yp(v)}" y2="${Yp(v)}" stroke="${col}" stroke-width="1.2" stroke-dasharray="1 3" opacity=".9"/><text x="${X(XM)-2}" y="${Yp(v)-3}" font-size="10" text-anchor="end" fill="${col}" data-tip="今の条件で出した${nm}（税抜）。ローソク足の箱と比べる">${nm} ${man(v)}</text>`:'';
 const band=(f,b,col)=>f.length?`<polygon points="${[...f.map(x=>X(x[0])+','+Yp(x[1]*(1+b))),...f.slice().reverse().map(x=>X(x[0])+','+Yp(x[1]*(1-b)))].join(' ')}" fill="${col}" opacity=".13"/>`:'';
 const fl=(f,col)=>f.length?`<polyline points="${f.map(x=>X(x[0])+','+Yp(x[1])).join(' ')}" fill="none" stroke="${col}" stroke-width="1.6" stroke-dasharray="6 4"/>`+f.slice(1).map(x=>`<circle cx="${X(x[0])}" cy="${Yp(x[1])}" r="3" fill="var(--card)" stroke="${col}" stroke-width="1.3" data-tip="${x[0]}か月後の予測 ${man(x[1])}（税抜）"></circle>`).join(''):'';
 const btn=(k,v,lb)=>`<button class="${CH[k]===v?'on':''}" onclick="setCh('${k}',${typeof v==='string'?`'${v}'`:v})">${lb}</button>`;
 const tg=(k,lb)=>`<button class="${CH[k]?'on':''}" onclick="setCh('${k}',${!CH[k]})">${lb}</button>`;
 const last=(f,lb)=>f.length?`${lb} ${man(f[0][1])} → 4か月後 ${man(f[f.length-1][1])}（${pc((f[f.length-1][1]/f[0][1]-1)*100)}）`:'';
 return `<div class="chart"><div class="chtool"><span class="grp">期間 ${btn('rng',3,'3か月')}${btn('rng',6,'6か月')}${btn('rng',12,'12か月')}</span><span class="grp">縦軸 ${btn('zoom','fit','拡大')}${btn('zoom','zero','0から')}</span><span class="grp">表示 ${tg('ln','折れ線')}${tg('cdl','ローソク足')}</span><span class="grp">先 ${tg('y1','1年後の目安')}</span><span class="grp">縦線 ${tg('mk','相場')}${tg('ev','車種データ')}</span>${solo?`<span class="grp">比べる ${tg('mavg','モデル平均')}${(M.phases||[]).length>1?tg('mc','マイナーチェンジ前後'):'<button disabled data-tip="前期・後期の区切りがない車種です">マイナーチェンジ前後</button>'}${(M.kn||{}).prev?tg('gen','前のモデル'):'<button disabled data-tip="前のモデルの相場カードがありません">前のモデル</button>'}${M.nag?tg('nag','流札率'):''}${M.cnt?tg('cnt','件数'):''}</span>`:''}</div>
 <div class="lgd"><span style="color:var(--rt)">● 小売</span><span style="color:var(--aa)">● AA</span><b>税抜</b>${CH.cdl?`<span data-tip="ローソク足＝実際の値（今の条件の車の月ごと・直近4か月は週ごと）。細い線＝1〜9割・箱＝真ん中の半分・太線＝真ん中（20台未満は真ん中の半分の平均）・上の数＝台数。5台未満は薄く出す。顔ぶれでぶれる">ローソク足</span>`:''}${CH.ln?`<span data-tip="${((PH?`折れ線＝${PH.name}の車だけ（初度登録 ${S.ph?PH.ym+' 以降':ymPrev((M.phases[S.ph+1]||{}).ym)+' まで'}）の条件をそろえた動き（高さは今の値）`:MULTI?`折れ線＝選んだ${S.ys.length}つの年式の線を台数の重みで合わせた形（高さは今の値）`:`折れ線＝今の条件（世代全体の動きを、この年式の標準の車に合わせた形）。薄い点線＝標準の車（${Y.std.grade}・${(Y.std.km/10).toFixed(1)}万km）`)+`&lt;br&gt;直近4か月は週ごと（${CH.cdl?'線＝前後3週の平均':'細い線＝その週に売れた車・太い線＝前後3週の平均'}）`).replace(/"/g,'&quot;')}">折れ線</span>`:''}<span data-tip="今の条件で出した相場（税抜）。ローソク足の箱と比べる">横の点線＝今の相場</span><span data-tip="${SH?'1か月先':'4か月先'}の予測。帯＝外れの目安">太い点線＝予測</span>${r0<-3.5?'<span data-tip="DataLine の抜き取りの区間（1か月100台前後）。台数が少なく偏ることがあるので、流れの目安として見る">灰色＝抜き取り</span>':''}</div>
 <svg viewBox="0 0 ${W} ${H}">${g}${band(FSd,bs,'var(--rt)')}${band(FAd,ba,'var(--aa)')}${CH.cdl?cdlSvg(CR,'var(--rt)',-1,'小売（税抜）')+cdlSvg(CA,'var(--aa)',1,'AA'):''}${hl(R.rt!=null?R.rt/TX:null,'var(--rt)','小売相場')}${hl(R.aa,'var(--aa)','AA相場')}${CH.ln?(same||SH?'':line(S0,'var(--rt)',1)+line(A0,'var(--aa)',1))+lineW(Ss,'var(--rt)')+lineW(As,'var(--aa)')+pts(Ss,'var(--rt)')+pts(As,'var(--aa)'):''}${fl(FSd,'var(--rt)')}${fl(FAd,'var(--aa)')}${CH.y1?[[FS,R.rt1y&&R.rt1y/TX,'var(--rt)','小売',bs],[FA,R.aa1y,'var(--aa)','AA',ba]].map(([f,v,col,nm,b0])=>{if(!v||!f.length)return '';
   // 4か月先の予測と同じ見た目：月ごとの点と太い点線、外れの目安の帯（4か月先の幅から1年後の ±15% へ広げる）
   const a=f[f.length-1],P=[];for(let t=a[0];t<=12;t++){const r=(t-a[0])/(12-a[0]);P.push([t,Math.exp(Math.log(a[1])*(1-r)+Math.log(v)*r),b0+(0.15-b0)*r])}
   return `<polygon points="${[...P.map(x=>X(x[0])+','+Yp(x[1]*(1+x[2]))),...P.slice().reverse().map(x=>X(x[0])+','+Yp(x[1]*(1-x[2])))].join(' ')}" fill="${col}" opacity=".13"/><polyline points="${P.map(x=>X(x[0])+','+Yp(x[1])).join(' ')}" fill="none" stroke="${col}" stroke-width="1.6" stroke-dasharray="6 4"/>`+P.slice(1).map(x=>`<circle cx="${X(x[0])}" cy="${Yp(x[1])}" r="3" fill="var(--card)" stroke="${col}" stroke-width="1.3" data-tip="${x[0]}か月後の目安（${nm}）${man(x[1])}（税抜・±${Math.round(x[2]*100)}%くらい）${x[0]===12?'&lt;br&gt;1年後＝同じ走行のまま、全車種の「この年数の車が1年で下がる割合」から出す。13か月前のデータで試した外れの真ん中は14〜18%。相場全体の上げ下げは入れていない':'&lt;br&gt;4か月先の予測から1年後の目安へなめらかにつないだ値'}"></circle>`).join('')}).join(''):''}${CQ.map(q=>{const nm=`${q.C.car} ${q.y}年式 ${q.c.g}`;const pl=(ser,ds,kn)=>{const v=ser.filter(inr);return v.length?`<polyline points="${v.map(x=>X(x[0])+','+Yp(x[1])).join(' ')}" fill="none" stroke="${q.col}" stroke-width="2" ${ds?`stroke-dasharray="${ds}"`:''}/>`+v.map(x=>`<circle cx="${X(x[0])}" cy="${Yp(x[1])}" r="${ds?2.2:2.6}" fill="${ds?'var(--card)':q.col}" stroke="${q.col}" stroke-width="1.2" data-tip="${nm}（${kn}）：${x[0]>-0.3?'いま':mon(Math.round(x[0]))} ${man(x[1])}（税抜・${x[2]}件）"></circle>`).join(''):''};
   const fp=(f,ds)=>f.length?`<polyline points="${f.map(x=>X(x[0])+','+Yp(x[1])).join(' ')}" fill="none" stroke="${q.col}" stroke-width="1.6" stroke-dasharray="${ds}" opacity=".8"/>`:'';
   const now=(v,ds,kn)=>v!=null?`<circle cx="${X(0)}" cy="${Yp(v)}" r="4.5" fill="${ds?'var(--card)':q.col}" stroke="${q.col}" stroke-width="2" data-tip="${nm}（${kn}）：いま ${man(v)}（税抜・計算した値）"></circle>`:'';
   return pl(q.S,'', '小売')+pl(q.A,'6 3','AA')+fp(q.FS,'2 3')+fp(q.FA,'2 3')+(q.S.length?'':now(q.R.tax.rt&&q.R.tax.rt.ex,'','小売'))+(q.A.length?'':now(q.R.tax.aa&&q.R.tax.aa.ex,1,'AA'))}).join('')}${CMP.map(c=>{const v=c.L.filter(inr);if(v.length<2)return '';return `<polyline points="${v.map(x=>X(x[0])+','+Yp(x[1])).join(' ')}" fill="none" stroke="${c.col}" stroke-width="2" stroke-linecap="round" stroke-dasharray="${c.dash}"/>`+v.map(x=>`<circle cx="${X(x[0])}" cy="${Yp(x[1])}" r="5" fill="transparent" data-tip="${c.abs?`${c.nm}：${x[0]===0?'いま':mon(x[0])} ${man(x[1])}（税抜・${c.ph?'その期の車 ':x[4]+'年式・'}${x[2]}件）&lt;br&gt;${c.why}`:`${c.nm}：${x[0]===0?'いま':mon(x[0])+'は いまより '+pc((Math.exp(x[3])-1)*100)}（${x[4]}年式・${x[2]}件）&lt;br&gt;${c.why}。選んだ車の「いま」の値にそろえて、動きだけを比べている`}"></circle>`).join('')}).join('')}</svg>
 ${CH.cdl&&(CDL.wide||['m','sb','col','e','i'].some(k=>S.f[k]!=null))?`<div class="fcap">${CDL.wide?'<span data-tip="条件が細かすぎる（直近3か月で10台未満）ので、走行の帯を外した年式・グレード'+(PH?'・期':'')+'の車で出している">ローソク足は走行の帯を外して表示</span>　':''}${['m','sb','col','e','i'].some(k=>S.f[k]!=null)?'<span data-tip="ローソク足は年式・グレード・期・走行の帯までで絞る。型式・詳細・色・評価点・内装は効かない">ローソク足は型式・色などで絞らない</span>':''}</div>`:''}
 ${CQ.length?`<div class="cmpleg"><span><svg class="sw" width="32" height="10" viewBox="0 0 32 10"><line x1="2" x2="30" y1="5" y2="5" stroke="var(--rt)" stroke-width="2"/></svg><svg class="sw" width="32" height="10" viewBox="0 0 32 10"><line x1="2" x2="30" y1="5" y2="5" stroke="var(--aa)" stroke-width="2"/></svg> ${M.car} ${S.y}年式 ${S.g}（青＝小売・橙＝AA）</span>${CQ.map(q=>`<span><svg class="sw" width="32" height="10" viewBox="0 0 32 10"><line x1="2" x2="30" y1="5" y2="5" stroke="${q.col}" stroke-width="2"/></svg><svg class="sw" width="32" height="10" viewBox="0 0 32 10"><line x1="2" x2="30" y1="5" y2="5" stroke="${q.col}" stroke-width="2" stroke-dasharray="6 3"/></svg> ${q.C.car} ${q.y}年式 ${q.c.g}（実線＝小売・破線＝AA）</span>`).join('')}<div class="muted" data-tip="比較の車は値そのもの（税抜）。走行は今の車にそろえ、色・評価点は標準。細い点線＝4か月先の予測">比較の車＝値そのもの（税抜）</div></div>`:''}
 ${CMP.length?`<div class="cmpleg">${[...new Set(CMP.map(c=>c.base))].map(n=>{const cs=CMP.filter(x=>x.base===n),c=cs[0];const sw=col=>`<svg class="sw" width="32" height="10" viewBox="0 0 32 10"><line x1="2" x2="30" y1="5" y2="5" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-dasharray="${c.dash}"/></svg>`;return `<span data-tip="${c.why.replace(/"/g,'&quot;')}">${cs.map(x=>sw(x.col)).join('')} ${n}<span class="muted">（${c.abs?'値そのもの':'動きだけ'}）</span></span>`}).join('')}<div class="muted" data-tip="「動きだけ」の線は選んだ車の「いま」の値にそろえて重ねている（値の高さは比べられない）。「値そのもの」は、その年式の標準の車の値を台数の重みで平均した金額（税抜）">青＝小売・橙＝AA</div></div>`:''}
 ${(()=>{if(!solo||!CH.cnt||(!M.cnt&&!SH))return '';const WK=4.345,wkc=k=>(Y['ser_'+k+'_w']||[]).map(x=>[x[0]/WK,x[2]]).filter(inr);const CN=PH&&PH.cnt?PH.cnt:M.cnt,a=SH?wkc('aa'):(CN.aa||[]).filter(inr),r=SH?wkc('sold'):(CN.sold||[]).filter(inr);if(!a.length&&!r.length)return '';const h=88,tp=10,bt=18,mx=Math.max(...a.map(x=>x[1]),...r.map(x=>x[1]))*1.12,Yn=v=>tp+(1-v/mx)*(h-tp-bt),bw=Math.max(3,(X(SH?1/WK:1)-X(0))*(SH?0.36:0.28));let q='';
  const st=[10,20,50,100,200,500,1000,2000,5000,10000].find(v=>mx/v<=3)||20000;for(let v=st;v<mx;v+=st)q+=`<line x1="${L}" x2="${X(0)}" y1="${Yn(v)}" y2="${Yn(v)}" stroke="var(--line)"/><text x="${L-6}" y="${Yn(v)+4}" font-size="10" text-anchor="end" fill="var(--sub)">${v.toLocaleString()}</text>`;
  const rough=t=>!SH&&t<-3.5;
  [[r,'var(--rt)',-1,'小売で売れた'],[a,'var(--aa)',1,'AAに出た']].forEach(([L2,col,sd,nm])=>L2.forEach(x=>q+=`<rect x="${X(x[0])+(sd<0?-bw:0)}" y="${Yn(x[1])}" width="${bw}" height="${h-bt-Yn(x[1])}" fill="${col}" opacity="${rough(x[0])?.4:.8}" data-tip="${SH?per(x[0])+'：'+nm+'件数 '+x[1]+'件（線の点の元データ）':mon(x[0])+'：'+M.car+(PH?'（'+PH.name+'の車）':'（車種全体）')+'が'+nm+'台数 約'+x[1].toLocaleString()+'台（推定）'}${rough(x[0])?'&lt;br&gt;4か月より前は、DataLine を飛び飛びのページで読んだ分からの推定なので粗い（±3割くらい）':''}"/>`));
  q+=SH?`<text x="${L}" y="${h-4}" font-size="10.5" fill="var(--sub)">週ごとの件数　青＝小売・橙＝AA</text>`:`<text x="${L}" y="${h-4}" font-size="10.5" fill="var(--sub)">月ごとの台数（${PH?PH.name+'の車':'車種全体'}・推定）　青＝小売・橙＝AA（流札含む）・薄い＝粗い推定</text>`;
  return `<svg viewBox="0 0 ${W} ${h}" style="margin-top:2px">${q}</svg>`})()}
 ${(()=>{const NG=PH&&PH.nag?PH.nag:M.nag;if(!solo||!CH.nag||!NG||!NG.ser)return '';
  // 3か月・6か月は直近4か月を週ごと（M.nag.serw＝[週, 率, 台数]）＋それより前は月ごと（2026-10-09 ゆうた）。12か月は月ごと
  const WK=4.345,WKV=CH.rng<=6&&(NG.serw||[]).length,wmix=(mo,wk)=>{if(!WKV||!(wk||[]).length)return (mo||[]).map(x=>[...x,0]);const W=wk.map(x=>[x[0]/WK,x[1],x[2],1]);const cut=Math.min(...W.map(x=>x[0]))-0.3;return [...(mo||[]).filter(x=>x[0]<cut).map(x=>[...x,0]),...W]};
  const ser=wmix(NG.ser,NG.serw).filter(inr),AS=wmix((AV.nag||{}).ser,(AV.nag||{}).serw).filter(inr);if(!ser.length)return '';const h=78,tp=10,bt=18,mx=Math.max(10,...ser.filter(x=>x[2]>=5).map(x=>x[1]),...AS.map(x=>x[1]))*1.1,Yn=v=>tp+(1-v/mx)*(h-tp-bt),bwM=Math.min(28,Math.max(4,(X(1)-X(0))*0.55)),bwW=Math.max(2,(X(1/WK)-X(0))*0.6);let q='';
  [0,Math.round(mx/2/5)*5].filter((v,i)=>i===0||v>0).forEach(v=>q+=`<line x1="${L}" x2="${X(0)}" y1="${Yn(v)}" y2="${Yn(v)}" stroke="var(--line)"/><text x="${L-6}" y="${Yn(v)+4}" font-size="10" text-anchor="end" fill="var(--sub)">${v}%</text>`);
  const av=(AV.nag||{}).all?AV.nag.all[0]:null;
  ser.forEach(x=>{const r=av?x[1]/av:1,col=r>=2.5?'var(--ng)':r>=1.5?'var(--mid)':'var(--aa)',bw=x[3]?bwW:bwM,v=Math.min(x[1],mx),few=x[3]&&x[2]<5;q+=`<rect x="${X(x[0])-bw/2}" y="${Yn(v)}" width="${bw}" height="${h-bt-Yn(v)}" fill="${col}" opacity="${few?.3:.75}" data-tip="${x[3]?per(x[0]):mon(x[0])}：${M.car}${PH?'（'+PH.name+'の車）':''}の流札率 ${x[1]}%（AAに出た${x[2]}台のうち）${few?'&lt;br&gt;台数が少ない週（5台未満）なので薄く出している':''}${av?`&lt;br&gt;全体の平均 ${av}%の${(x[1]/av).toFixed(1)}倍`:''}"/>`});
  if(AS.length>1)q+=`<polyline points="${AS.map(x=>X(x[0])+','+Yn(x[1])).join(' ')}" fill="none" stroke="var(--ink)" stroke-width="1.2" stroke-dasharray="3 3" opacity=".6"/>`+AS.map(x=>`<circle cx="${X(x[0])}" cy="${Yn(x[1])}" r="5" fill="transparent" data-tip="${x[3]?per(x[0]):mon(x[0])}：全車種の流札率 ${x[1]}%（${x[2].toLocaleString()}台）"></circle>`).join('');
  q+=`<text x="${L}" y="${h-4}" font-size="10.5" fill="var(--sub)">流札率　棒＝この車種・点線＝全車種・黄＝1.5倍〜・赤＝2.5倍〜</text>`;
  return `<svg viewBox="0 0 ${W} ${h}" style="margin-top:2px">${q}</svg>`})()}
 ${SH?(()=>{const WK=4.345,c=(ser)=>{const w=ser.filter(x=>Math.abs(x[0]-Math.round(x[0]))>0.01);const avg=(lo,hi)=>{const v=w.filter(x=>x[0]>lo&&x[0]<=hi);let a=0,n=0;v.forEach(x=>{const k=Math.max(1,x[2]||1);a+=Math.log(x[1])*k;n+=k});return n?{v:Math.exp(a/n),n}:null};const A=avg(-4/WK-0.01,0.01),B=avg(-8/WK-0.01,-4/WK-0.01);return A&&B?{d:(A.v/B.v-1)*100,a:A.n,b:B.n}:null};
  const r=c(Ss),a=c(As),f=x=>x?`<b>${pc(x.d)}</b>（${x.b}件→${x.a}件）`:'台数が足りない';
  return `<div class="fcap"><b data-tip="直近4週を、その前の4週と比べた動き。±2%くらいまでは売れた車の違いによるぶれ">直近4週の動き</b>：小売 ${f(r)}・AA ${f(a)}。${[last(FSd,'小売'),last(FAd,'AA')].filter(Boolean).join('　／　').replace(/4か月後/g,'1か月後')}</div>`})():`<div class="fcap">${[last(FS,'小売'),last(FA,'AA')].filter(Boolean).join('　／　')}</div>`}${mkl.length&&CH.mk?`<div class="fcap"><b data-tip="縦線＝市場全体（全車種）の相場が一番高かった月（↑）・安かった月（↓）と新型など。月の下の札にマウスを乗せると詳しく。平均との差は条件をそろえた後の値">市場の高安</b>：${mkl.join('　／　')}</div>`:''}</div>`}
// 絞り込みの選び肢（指定なし＋実績のある値。数＝ほかの条件はそのままで、その値にした時の台数）
let FC={},HIT={aa:0,rt:0,few:false};
function fopt(k,v,lab,aaOnly){const c=FC[k][v]||{a:0,r:0},sel=S.f[k]!=null&&String(S.f[k])===String(v);return `<option value="${String(v).replace(/"/g,'&quot;')}" ${sel?'selected':''}>${lab(v)}（${aaOnly?'AA '+c.a:'AA '+c.a+'・小売 '+c.r}台）</option>`}
function FSELIN(k,vals,lab,aaOnly){if(S.f[k]!=null&&!vals.map(String).includes(String(S.f[k])))vals=[S.f[k],...vals];return `<select data-f="${k}"><option value="" ${S.f[k]==null?'selected':''}>指定なし</option>${vals.map(v=>fopt(k,v,lab,aaOnly)).join('')}</select>`}
function FSEL(k,nm,vals,lab){return `<label>${nm}${FSELIN(k,vals,lab)}</label>`}
// いまの金額の上の1行：どの顔ぶれで出した値か
function MIXNOTE(R){const x=R&&R.mix;if(!x)return '';if(x.cAA||x.cRT)return '';   // 説明の1行は出さない（2026-10-09 ゆうた「要らない」）。実績が0の時だけ断り書き
 if(true)return `<div class="note" style="margin:0 0 4px">当てはまる実績が無いので、条件の1台を式で出した値</div>`;const p=x.rep,ph=S.ph!=null&&(M.phases||[])[S.ph];
 const how=x.cAA||x.cRT?`当てはまる実績（AA ${x.nAA.toLocaleString()}台＝${x.cAA}組・小売 ${x.nRT.toLocaleString()}台＝${x.cRT}組）を1組ずつ相場DBの式で出し、台数の重みで真ん中を取った値。AA の数字は AA の実績、小売の数字は小売の実績の顔ぶれ`:'当てはまる実績が無いので、条件の1台を式で出した値';
 return `<div class="note" style="margin:0 0 4px">${ph?`<b>${ph.name}</b>（${x.years.join('・')}年式）。`:x.years.length>1?`<b>${x.years.join('・')}年式</b>をまとめて。`:''}${how}。<span data-tip="グラフの形・年式ごとの欄（売れやすさ・カタログ・流札率など）・条件の補正は、この1台で出している">代表の1台＝${p.y}年式・${p.g}${p.sb?' '+p.sb:''}・${p.m}・${(p.km/10).toFixed(1)}万km・${p.col||'色不明'}・評価${p.e}/${p.i||'—'}</span></div>`}
// 簡易シミュレーター（2026-10-09 ゆうた「仕入れ金額を入れると税込と利益が連動して動く方が分かりやすい」）：利益＝4か月後の売値（税抜）−（仕入れ金額＋落札経費）
function simUp(inp){const b=inp.closest('.sim');if(!b)return;const p=parseFloat(inp.value)*10,sell=+b.dataset.sell,fee=+b.dataset.fee,prof=+b.dataset.prof,tx=+b.dataset.tax,o=b.querySelector('.sres');
 if(!(p>=0)){o.innerHTML='';return}const g=sell-p-fee,cl=g>=prof?'ok':g>=0?'mid':'ng';
 o.innerHTML=`税込 <b>${(p*tx/10).toFixed(1)}</b>万円　利益 <b class="${cl}">${g>=0?'':'−'}${(Math.abs(g)/10).toFixed(1)}</b>万円`}
// 買取の簡易シミュレーター：払う額（税込）→ 税抜／店頭で売った時の利益＝4か月後の売値（税抜）−払う額÷1.1／すぐAAに出した時の利益＝1か月後のAA−出品経費−払う額÷1.1
function simBuy(inp){const b=inp.closest('.sim');if(!b)return;const pay=parseFloat(inp.value)*10,tx=+b.dataset.tax,o=b.querySelector('.sres');if(!(pay>=0)){o.innerHTML='';return}
 const ex=pay/tx,rt4=+b.dataset.rt4,aa1=b.dataset.aa1===''?null:+b.dataset.aa1,g1=rt4/tx-ex,g2=aa1==null?null:aa1-(+b.dataset.sellfee)-ex;
 const f=(g,t)=>g==null?'—':`<b class="${g>=t?'ok':g>=0?'mid':'ng'}">${g>=0?'':'−'}${(Math.abs(g)/10).toFixed(1)}</b>万円`;
 o.innerHTML=`税抜 <b>${(ex/10).toFixed(1)}</b>万円<br>店頭で売ると 利益 ${f(g1,+b.dataset.prof)}　すぐAAに出すと 利益 ${f(g2,+b.dataset.aaprof)}`}
function simAll(){document.querySelectorAll('.sim:not(.simb) input').forEach(simUp);document.querySelectorAll('.simb input').forEach(simBuy)}
function fReset(){S.f={g:S.f.g};S.kmx=null;S.kmMode='b';draw()}
// ── サンプル・見かた（2026-10-10 ゆうた「ローソク足・折れ線・相場・買取金額BOXの見かたを学べる場を。各ページの長い説明は削る」）──
// 練習用の車（M.lesson がある車＝sample.js）の画面だけに、番号の印（マウスを乗せる・押すと説明）・上の「この車で見る所」・グラフの下の「グラフの見かた」を出す
const LMN='①②③④⑤⑥⑦⑧⑨⑩⑪⑫';
const LT={
 1:'<b>いまの金額</b>：押すと開く（開いた後は空いている所を押すと畳む）。見込み粗利＝AA相場で仕入れて、4か月後に小売で売った時に残る額（税抜・整備や付帯の利益は入れない）',
 2:'<b>AA相場</b>＝業者オークションで落ちる値（税抜）。仕入れの物差し。横の A〜F は精度＝外れの大きさ（A ±5%以内 … F 20%超）',
 3:'<b>仕入れ金額の欄</b>：入札したい額（税抜）を入れると、税込と利益がすぐ変わる。利益＝4か月後の売値−仕入れ−落札経費1万。緑＝目標の粗利以上・黄＝黒字だが薄い・赤＝赤字。右の「上限」までなら目標の粗利が残る',
 4:'<b>小売相場</b>＝お店で実際に売れた値（成約・税抜）。掲載の値（値引き前）ではない。「4か月後」＝相場の動きを入れた、売る頃の値',
 5:'<b>買取相場</b>＝お客様から買う時に出せる上限（店頭で売る前提）。「お客様に払う額」＝税抜×1.1（個人からの買取は払った額の10/110を仕入れの消費税として引ける）',
 6:'<b>買取金額の欄</b>：お客様に払う額を入れると、「店頭で売ると」（4か月後に小売）と「すぐAAに出すと」（1か月後のAA−出品経費）の利益が出る。どちらで売るかで出せる額が変わる',
 7:'<b>流札率</b>＝AAに出て売れずに流れた割合。全体の何倍かで見る。多い車＝売り手の希望と業者の値が合っていない。すぐAAに出す前提の買取は控えめに',
 8:'<b>実績の台数</b>＝今の条件に当てはまる、実際に売れた車の数。条件を足すほど減る。10台未満で黄色＝値が外れやすい。「グレード以外の条件をはずす」で戻せる',
 9:'<b>前期・後期</b>：押すとその期の車（初度登録の年月で分ける）だけで出す。期の変わり目の年式は両方が混ざるので、期で選ぶ方が正確',
 10:'<b>▾ の1行</b>：押すとその枠の詳細が開く。開けるのは1つだけ（ほかは閉じる）',
 11:'<b>グラフ</b>：すぐ下の「グラフの見かた」に、ローソク足・折れ線・予測の帯の読み方',
 12:'<b>店のカテゴリ別</b>（小売の ▾ で開く）：この車をディーラー・大手・一般店などで買うと総額いくらか。グー・カーセンサーの掲載から出す（掲載の値で、売れた値ではない）'};
const LM=n=>M&&M.lesson?`<span class="lm" data-tip="${LT[n]}">${LMN[n-1]}</span>`:'';
function lessonInit(){const L=M&&M.lesson;if(!L||!L.init)return;const ys=(L.init.ys||[]).map(String).filter(y=>M.years[y]);if(ys.length)S.ys=ys;if(L.init.rng)CH.rng=L.init.rng}
function LESSON(){const L=M.lesson;if(!L)return '';
 return `<div class="lesson"><h3><span class="lm" style="cursor:default;box-shadow:none">${L.id}</span>練習用の車<span class="tg">${L.tag}</span></h3>
  <div><div class="lh">この車で見る所</div><ul>${(L.points||[]).map(x=>`<li>${x}</li>`).join('')}</ul></div>
  <div><div class="lh">やってみよう</div><ol>${(L.tries||[]).map(x=>`<li>${x}</li>`).join('')}</ol></div>
  <details><summary>基本の見かた（どのサンプルも同じ）</summary>
   <div class="base3"><div><b style="color:var(--aa)">AA相場</b>業者オークションで落ちる値。仕入れの物差し</div><div><b style="color:var(--rt)">小売相場</b>お店で実際に売れた値（成約）。売る時の物差し</div><div><b>買取相場</b>お客様から買う時に出せる上限。店頭で売る前提</div></div>
   <ul><li>大きい字＝<b>税抜</b>、小さい字＝税込</li><li>見込み粗利＝AA相場で仕入れ、4か月後に小売で売った時に残る額</li><li>条件は年式とグレードだけで始まる。走行・色などは選んだ時だけ絞る（絞るほど台数が減る）</li><li>3つの枠の下の「▾」で詳細が開く。開けるのは1つだけ</li><li>練習用の車は、本物の車の形を借りて名前を付け替えた物。計算は本物と同じ</li></ul></details>
  <div class="ft">青い番号の印（①〜⑫）にマウスを乗せると説明（押しても出る）。説明はサンプルの画面だけに出る</div></div>`}
// ── サンプルG 相場の動きの考察（2026-10-10 ゆうた「こういう動きの時はこう買う、のパターンを考えて確かめて。グラフ部分だけでOK」）──
// 中身は sample.js の study（相場DB\結果\相場の動きの考察_261010\sample_g.json を sample_build.py が入れる）。本物の車の区間を、車種名を伏せて写した物。数字は数えた日のまま
function stChart(p){
 const wk=p.kind==='week',W=520,H=wk?214:190,L=46,R=12,T=18,B=wk?76:30,iw=W-L-R,D=p.data||[],n=D.length;if(!n)return '';
 const X=i=>L+iw*(i+.5)/n,tx=(x,y,t,c,a,sz)=>`<text x="${x}" y="${y}" font-size="${sz||10.5}" fill="${c||'var(--sub)'}" text-anchor="${a||'middle'}">${t}</text>`;
 const hl=p.hl||[],key=wk?'w':'t',hi=D.map((d,i)=>hl.length&&d[key]>=hl[0]&&d[key]<=hl[1]?i:-1).filter(i=>i>=0);
 const band=hi.length?`<rect x="${X(hi[0])-iw/n/2}" y="${T-8}" width="${iw/n*hi.length}" height="${H-T-6}" fill="var(--chip)" rx="6"/>`:'';
 const xl=D.map((d,i)=>tx(X(i),H-6,d.l)).join('');
 if(p.kind==='bars'){const vs=D.map(d=>d.aa),mx=Math.max(4,...vs.map(Math.abs))*1.3,y0=T+(H-B-T)/2,sy=(H-B-T)/2/mx;
  const bars=D.map((d,i)=>{const v=d.aa,h=Math.abs(v)*sy;return `<rect x="${X(i)-iw/n*.3}" y="${v>=0?y0-h:y0}" width="${iw/n*.6}" height="${Math.max(h,1)}" fill="var(--aa)" opacity="${Math.abs(v)>=1?.9:.45}" data-tip="${d.l}：${p.bt||'全車種の真ん中で AA'} ${v>0?'+':''}${v}%${p.bt?'':'（前の月から）'}${d.up!=null?`&lt;br&gt;上がった車種 ${d.up}%`:''}${d.n?`（${d.n}${p.bt?'台・車種':'車種'}で数えた）`:''}"/>${tx(X(i),v>=0?y0-h-4:y0+h+12,(v>0?'+':'')+v.toFixed(1),'var(--ink)','middle',10)}`}).join('');
  return `<svg viewBox="0 0 ${W} ${H}">${band}<line x1="${L}" x2="${W-R}" y1="${y0}" y2="${y0}" stroke="var(--line)"/>${tx(L-6,y0+4,'0%','var(--sub)','end')}${bars}${xl}${tx(L,11,p.bt?p.bt+'（%）':'AA の前の月からの変化（全車種の真ん中・%）','var(--sub)','start',10)}</svg>`}
 const ser=wk?[['aa','var(--aa)','AA']]:[['aa','var(--aa)','AA'],['rt','var(--rt)','小売（税抜）']];
 const all=[].concat(...ser.map(([k])=>D.map(d=>d[k]).filter(v=>v!=null)));let lo=Math.min(...all),up=Math.max(...all);const pad=(up-lo)*.15||up*.03;lo-=pad;up+=pad;
 const Y=v=>T+(H-B-T)*(1-(v-lo)/(up-lo)),ticks=[lo+pad,(lo+up)/2,up-pad];
 const grid=ticks.map(v=>`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-dasharray="2 3"/>${tx(L-6,Y(v)+4,(v/10).toFixed(1),'var(--sub)','end')}`).join('')+tx(L-6,T-6,'万円','var(--sub)','end',9.5);
 const lines=ser.map(([k,c,nm])=>{const pts=D.map((d,i)=>d[k]!=null?[X(i),Y(d[k]),d]:null);let path='',seg=[];const fl=()=>{if(seg.length>1)path+=`<polyline points="${seg.join(' ')}" fill="none" stroke="${c}" stroke-width="2.2"/>`;seg=[]};pts.forEach(q=>{if(q)seg.push(q[0].toFixed(1)+','+q[1].toFixed(1));else fl()});fl();
  return path+pts.filter(Boolean).map(([x,y,d])=>`<circle cx="${x}" cy="${y}" r="3.8" fill="var(--card)" stroke="${c}" stroke-width="2" data-tip="${d.l}${wk?'の週':''}：${nm} ${(d[k]/10).toFixed(1)}万円${k==='aa'&&d.n?`（${d.n}台）`:''}${wk&&d.ng!=null?`&lt;br&gt;流札率 ${d.ng}%（${d.ngn}台中）`:''}"/>`).join('')}).join('');
 let nag='';if(wk){const ng=D.map(d=>d.ng).filter(v=>v!=null),mx=Math.max(8,...ng),bh=26,by=H-B+44;
  nag=`<line x1="${L}" x2="${W-R}" y1="${by}" y2="${by}" stroke="var(--line)"/>`+D.map((d,i)=>d.ng==null?'':`<rect x="${X(i)-iw/n*.2}" y="${by-d.ng/mx*bh}" width="${iw/n*.4}" height="${Math.max(d.ng/mx*bh,1)}" fill="var(--mid)" opacity=".7" data-tip="${d.l}の週：流札率 ${d.ng}%（${d.ngn}台中）"/>${tx(X(i),by-d.ng/mx*bh-3,d.ng.toFixed(1)+'%','var(--sub)','middle',9.5)}`).join('')+tx(L-6,by-4,'流札率','var(--mid)','end',9.5)}
 const lg=ser.map(([k,c,nm],i)=>`<line x1="${L+4+i*70}" x2="${L+18+i*70}" y1="7" y2="7" stroke="${c}" stroke-width="2.2"/>${tx(L+22+i*70,10.5,nm,c,'start',10)}`).join('');
 return `<svg viewBox="0 0 ${W} ${H}">${band}${grid}${lines}${nag}${xl}${lg}</svg>`}
function stCmp(p){if(!(p.cmp||[]).length)return '';const W=520,rh=42,H=p.cmp.length*rh+6,L=190,iw=W-L-70;
 return `<svg viewBox="0 0 ${W} ${H}">${p.cmp.map(([a,b,v,base],i)=>{const y=i*rh+4;return `<text x="0" y="${y+13}" font-size="11" fill="var(--ink)">${a}</text><text x="0" y="${y+29}" font-size="10" fill="var(--sub)">→ ${b}</text>
  <rect x="${L}" y="${y+2}" width="${iw*v/100}" height="14" rx="3" fill="var(--aa)" opacity=".85" data-tip="この場面 ${v}%"/><text x="${L+iw*v/100+4}" y="${y+13}" font-size="10.5" fill="var(--ink)">${Math.round(v)}%</text>
  <rect x="${L}" y="${y+19}" width="${iw*base/100}" height="14" rx="3" fill="var(--sub)" opacity=".35" data-tip="ふだん（全部の週・月） ${base}%"/><text x="${L+iw*base/100+4}" y="${y+30}" font-size="10.5" fill="var(--sub)">ふだん ${Math.round(base)}%</text>`}).join('')}</svg>`}
// 横棒（rows＝[名前, 値, ホバーの説明, 強調]）。0 を真ん中に、マイナスは左
function stHbar(p){const R=p.rows||[];if(!R.length)return '';const W=520,rh=26,H=R.length*rh+8,L=200,iw=W-L-56,vs=R.map(r=>r[1]),mn=Math.min(0,...vs),mx=Math.max(0,...vs),sp=(mx-mn)||1,X=v=>L+iw*(v-mn)/sp,u=p.unit||'';
 const fm=v=>(u==='±%'?'±'+Math.abs(v).toFixed(1)+'%':(v>0&&mn<0?'+':'')+(+v).toFixed(Math.abs(v)<10?1:0)+(u==='±%'?'':u));
 return `<svg viewBox="0 0 ${W} ${H}"><line x1="${X(0)}" x2="${X(0)}" y1="2" y2="${H-4}" stroke="var(--line)"/>${R.map(([nm,v,tip,em],i)=>{const y=i*rh+5,x0=X(Math.min(0,v)),w=Math.max(Math.abs(X(v)-X(0)),1.5);
  return `<text x="0" y="${y+13}" font-size="11" fill="var(--ink)"${em?' font-weight="700"':''}>${nm}</text><rect x="${x0}" y="${y+2}" width="${w}" height="15" rx="3" fill="${em?'var(--ng)':'var(--aa)'}" opacity="${em?.85:.55}" data-tip="${(tip||nm).replace(/"/g,'&quot;')}"/><text x="${v<0?x0-4:x0+w+4}" y="${y+14}" font-size="10.5" fill="var(--ink)" text-anchor="${v<0?'end':'start'}">${fm(v)}</text>`}).join('')}</svg>`}
// 2本の横棒（rows＝[名前, AA, 小売]）
function stPair(p){const R=p.rows||[];if(!R.length)return '';const W=520,rh=40,H=R.length*rh+22,L=200,iw=W-L-50,vs=[].concat(...R.map(r=>[r[1],r[2]])).filter(v=>v!=null),mn=Math.min(0,...vs),mx=Math.max(0,...vs),sp=(mx-mn)||1,X=v=>L+iw*(v-mn)/sp;
 const bar=(v,y,c,nm)=>{if(v==null)return `<text x="${X(0)+4}" y="${y+11}" font-size="10" fill="var(--sub)">${nm}は数えていない</text>`;const x0=X(Math.min(0,v)),w=Math.max(Math.abs(X(v)-X(0)),1.5);return `<rect x="${x0}" y="${y}" width="${w}" height="14" rx="3" fill="${c}" opacity=".8" data-tip="${nm} ${v>0?'+':''}${v}%"/><text x="${v<0?x0-4:x0+w+4}" y="${y+11}" font-size="10.5" fill="var(--ink)" text-anchor="${v<0?'end':'start'}">${v>0?'+':''}${(+v).toFixed(1)}%</text>`};
 return `<svg viewBox="0 0 ${W} ${H}"><line x1="${L}" x2="${L+14}" y1="7" y2="7" stroke="var(--aa)" stroke-width="5"/><text x="${L+18}" y="10.5" font-size="10" fill="var(--aa)">AA</text><line x1="${L+50}" x2="${L+64}" y1="7" y2="7" stroke="var(--rt)" stroke-width="5"/><text x="${L+68}" y="10.5" font-size="10" fill="var(--rt)">小売</text><line x1="${X(0)}" x2="${X(0)}" y1="16" y2="${H-2}" stroke="var(--line)"/>${R.map(([nm,a,r],i)=>{const y=i*rh+20;return `<text x="0" y="${y+17}" font-size="11" fill="var(--ink)">${nm}</text>${bar(a,y,'var(--aa)','AA')}${bar(r,y+17,'var(--rt)','小売')}`}).join('')}</svg>`}
const STG={move:['週・月の動き','いつ買うか'],ng:['注意すべき','この車種は危ない'],ok:['狙い目になりうる','この車種は得をしやすい'],sub:['確かめたが外れ・分からない','信じなくてよい']};
function STUDY(){const G=M,rg=r=>r?`${r[0]}〜${r[1]}%`:'—',me=G.meta||{};
 const card=p=>`<div class="stc"><h4><span class="no">${p.id}</span>${p.title}<span class="smk ${p.cls||''}">${p.mark}</span></h4>
  <div class="q">確かめたこと：${p.q}</div>
  ${p.rl?`<div class="rl">${p.rl}</div>`:''}${p.kind==='none'?stCmp(p):p.kind==='hbar'?stHbar(p):p.kind==='pair'?stPair(p):p.kind==='text'?'':stChart(p)}
  ${(p.ex||[]).length?`<div class="q" style="margin:4px 0 0">${p.ex.join('')}${p.hl?'（色の付いた所）':''}</div>`:''}
  <div class="key">${(p.say||[])[0]||''}</div>
  ${p.buy&&p.buy!=='—'?`<div class="buy"><b>買い方</b>${p.buy}</div>`:''}
  ${(p.say||[]).length>1||(p.stats||[]).length?`<details><summary>くわしい数字</summary><ul>`:'<div hidden><ul>'}${(p.say||[]).slice(1).map(x=>`<li>${x}</li>`).join('')}</ul>
   ${(p.stats||[]).length?`<div class="tw"><table><tr><th>場面</th><th>数</th><th>当てはまる</th><th>たまたまの幅</th><th>その後（真ん中）</th></tr>${p.stats.map(([nm,n,sh,r,md])=>`<tr><td>${nm}</td><td>${(n||0).toLocaleString()}</td><td>${sh==null?'—':Math.round(sh)+'%'}</td><td>${rg(r)}</td><td>${md==null?'—':(md>0?'+':'')+md.toFixed(1)+'%'}</td></tr>`).join('')}</table></div>`:''}${(p.say||[]).length>1||(p.stats||[]).length?'</details>':'</div>'}</div>`;
 document.getElementById('main').innerHTML=`<div class="h2row"><h2 style="margin:0 0 8px"><span class="muted" style="font-size:14px">${G.maker}</span> ${G.car}</h2></div>
 <div class="stdy-top">「こういう動きの時・こういう車種は、こう買う」を、全車種（${me.cards||'約800'}車種）の実績で数えて確かめた。グラフは本物の車の区間（車種名は伏せた）で、<b>色の付いた所</b>がその形。車種ごとに当てはまる物は、その車種の画面の名前の横に<b>札</b>で出る。
  印：<span class="smk ng">よく当たる</span> <span class="smk mid">半分当たり</span> <span class="smk ok">狙い目</span> <span class="smk">外れ・参考</span>
  <details><summary>数え方</summary>${me.how||''}。${me.weeks||''}。数えた日 ${me.built||''}（ビューアを作り直しても変わらない）。グラフの点・棒にマウスを乗せると値が出る</details></div>
 <div class="stdy">${(()=>{let g0='';return (G.patterns||[]).map(p=>{const g=p.grp||'move',h=g!==g0&&STG[g]?`<h3 class="stg">${STG[g][0]}<small>${STG[g][1]}</small></h3>`:'';g0=g;return h+card(p)}).join('')})()}</div>`}
// この車種の注意（2026-10-10）：本物の車の画面の名前の横に、当てはまる物だけ短い札（1〜3個）。説明はホバー。サンプルの車には出さない
function CNOTE(){const N=SMPD&&SMPD.notes,a=M&&!M.lesson&&(M.notes||(N&&N[M.key]));if(!a||!a.length)return '';
 return `<span class="cnote">${a.map(x=>`<span class="${x.c==='ok'?'ok':''}" data-tip="${(x.tip+'&lt;br&gt;（2026-10-10 の数え。くわしくは サンプルG）').replace(/"/g,'&quot;')}">${x.t}</span>`).join('')}</span>`}
function GUIDE(){if(!M||!M.lesson)return '';
 const tx=(x,y,t,c,a)=>`<text x="${x}" y="${y}" font-size="10.5" fill="${c||'var(--sub)'}" text-anchor="${a||'start'}">${t}</text>`,ld=(x1,y1,x2,y2)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--sub)" stroke-width=".6" stroke-dasharray="2 2"/>`;
 const cdl=(x,a,b,c,d,e,n,op)=>`<g opacity="${op}"><line x1="${x}" x2="${x}" y1="${a}" y2="${e}" stroke="var(--rt)" stroke-width="1"/><rect x="${x-11}" y="${b}" width="22" height="${d-b}" fill="var(--rt)" fill-opacity=".15" stroke="var(--rt)"/><line x1="${x-11}" x2="${x+11}" y1="${c}" y2="${c}" stroke="var(--rt)" stroke-width="2.4"/>${tx(x,a-4,n,'var(--rt)','middle')}</g>`;
 const s1=`<svg viewBox="0 0 240 140">${cdl(46,22,46,66,92,124,'24台',1)}${[[22,'9割まで（上のひげ）'],[46,'75%（箱の上）'],[66,'真ん中（太線）'],[92,'25%（箱の下）'],[124,'1割まで（下のひげ）']].map(([y,t])=>ld(60,y,92,y)+tx(96,y+4,t)).join('')}</svg>`;
 const P=[[10,40],[40,48],[70,52],[100,66],[130,72],[150,80]],F=[[150,80],[175,86],[200,92],[225,97]];
 const s2=`<svg viewBox="0 0 240 140"><rect x="150" y="12" width="85" height="100" fill="var(--chip)"/>${tx(192,24,'予測','var(--sub)','middle')}<polygon points="${[...F.map(p=>p[0]+','+(p[1]-6-(p[0]-150)*.12)),...F.slice().reverse().map(p=>p[0]+','+(p[1]+6+(p[0]-150)*.12))].join(' ')}" fill="var(--rt)" opacity=".18"/><polyline points="${P.map(p=>p.join(',')).join(' ')}" fill="none" stroke="var(--rt)" stroke-width="2"/><polyline points="${F.map(p=>p.join(',')).join(' ')}" fill="none" stroke="var(--rt)" stroke-width="1.6" stroke-dasharray="6 4"/><line x1="10" x2="235" y1="80" y2="80" stroke="var(--rt)" stroke-width="1.1" stroke-dasharray="1 3"/>${tx(12,32,'条件をそろえた動き（線）','var(--rt)')}${tx(12,96,'横の点線＝今の相場')}${tx(232,128,'点線＝予測・帯＝外れの目安','var(--sub)','end')}</svg>`;
 const B=[[20,30],[50,34],[80,26],[110,40],[140,52],[170,60],[200,58]];
 const s3=`<svg viewBox="0 0 240 140"><rect x="8" y="10" width="62" height="70" fill="var(--line)" opacity=".35"/>${tx(39,22,'抜き取り','var(--sub)','middle')}<polyline points="12,44 40,40 70,46 100,52 130,50 160,60 190,64 228,66" fill="none" stroke="var(--aa)" stroke-width="2"/><line x1="130" x2="130" y1="10" y2="70" stroke="var(--mid)" stroke-dasharray="2 3"/><rect x="113" y="70" width="34" height="14" rx="4" fill="var(--card)" stroke="var(--mid)"/>${tx(130,80,'新型','var(--mid)','middle')}${B.map(([x,h])=>`<rect x="${x}" y="${134-h*.5}" width="10" height="${h*.5}" fill="${h>=55?'var(--ng)':h>=38?'var(--mid)':'var(--aa)'}" opacity=".75"/>`).join('')}${tx(12,100,'下の棒＝流札率（黄・赤＝多い）')}</svg>`;
 return `<div class="guide"><div><h5>ローソク足＝実際に売れた値の散らばり</h5>${s1}<p>1本＝1か月（直近4か月は1週）。箱に真ん中の半分の車が入る。箱が長い＝値がばらばら。上の数字＝台数。薄い＝5台未満</p></div>
  <div><h5>折れ線＝相場の流れ</h5>${s2}<p>年式・グレード・走行をそろえた値の動き。右下がりなら値下がり中。予測は4か月先まで、帯が広いほど外れやすい</p></div>
  <div><h5>灰色・縦線・下の棒</h5>${s3}<p>灰色＝昔の月（抜き取りで台数少・流れの目安）。縦線と札＝相場の高安・新型など（札にマウス）。下の棒＝台数・流札率</p></div></div>`}
function draw(){if(!M)return;if(M.study){STUDY();return}initS();
 FC={};['g','m','kb','col','sb','e','i'].forEach(k=>FC[k]=facet(k));
 {const n=SobaCalc.cxCount(M,S.ys,S.f);HIT={aa:n.aa,rt:n.rt,few:n.aa<10||n.rt<10}}
 const R=calc(),Y=M.years[S.y],F=M.fit,Fs=F.sold||{},Fa=F.aa||{},tot=Y.tot||{};
 const ys=Object.keys(M.years).sort().reverse(),YL=S.ys.length>1?`<span class="note">（代表の${S.y}年式）</span>`:'';
 const cls=R.room==null?'mid':R.room>=50?'ok':R.room>=0?'mid':'ng';
 const judge=!R.gp?'データが足りません':R.gp.gain<0?'相場で買うと赤字':R.room<0?'目標の粗利に届かない':R.room<50?'買える（目標ぎりぎり）':'買える';
 const say=R.room==null?'データが足りません':R.room>=100?`買える。余裕 ${man(R.room)}`:R.room>=50?`買えるが薄い。余裕 ${man(R.room)}`:R.room>=0?`ほぼ利益が出ない。余裕 ${man(R.room)}`:`相場で買うと赤字。${man(-R.room)} 足りない`;
 const sr=Fs.slope,sa=Fa.slope;let flow=`小売は<b>${trend(sr)}</b>（月${pc(sr)}）、AAは<b>${trend(sa)}</b>（月${pc(sa)}）。`;
 if(sr!=null&&sa!=null)flow+=sa<sr-0.3?'AAの方が速く下がっている＝<b>仕入れには追い風</b>。':sa>sr+0.3?'小売の方が速く下がっている＝<b>仕入れは慎重に</b>。':'小売とAAは同じくらいの動き。';
 const best=R.sc.filter(x=>x.gain!=null).slice(1).sort((a,b)=>b.gain-a.gain)[0];
 const nA=AV.n?`全${AV.n}車種の平均`:'全車平均';
 // 文言（ブロックの頭）
 const w_bd=(()=>{const p=[];if(Math.abs(R.bd.model||0)>=5)p.push(`型式（${S.m}）で${sman(R.bd.model)}`);if(Math.abs(R.bd.grade||0)>=5)p.push(`グレードで${sman(R.bd.grade)}`);if(Math.abs(R.bd.km||0)>=5)p.push(`走行（${S.km>Y.std.km?'+':'−'}${(Math.abs(S.km-Y.std.km)/10).toFixed(1)}万km）で${sman(R.bd.km)}`);if(Math.abs(R.bd.col||0)>=5)p.push(`色（${S.col}）で${sman(R.bd.col)}`);
  const sum=(R.bd.model||0)+(R.bd.grade||0)+(R.bd.km||0)+(R.bd.col||0);return p.length?`標準の車より ${p.join('、')}。合わせて <b>${sman(sum)}</b>（${pc(sum/R.rtStd*100)}）。`:'標準の車とほぼ同じ条件。'})();
 const gapS=R.stk&&R.rt?R.stk-R.rt:null,gapF=R.frs&&R.stk?R.frs-R.stk:null;
 const w_mk=(gapS==null?'掲載の値はまだ計算できていない。':`この条件の掲載の値は、実際に売れた値より <b>${sman(gapS)}</b>（${pc(gapS/R.rt*100)}）＝値引きと売れ残りの幅。`)+(gapF==null?'':Math.abs(gapF)<5?'新着も掲載全体とほぼ同じ値付け。':gapF>0?`新着はさらに${man(gapF)}高く付けて出ている。`:`新着は掲載全体より${man(-gapF)}安く出てきている＝<b>値付けが下がり始めている</b>。`);
 const w_sell=[tot.stock!=null&&AV.stock?`球数は<b>${more(tot.stock,AV.stock)}</b>（掲載 約${tot.stock}台・${nA} ${Math.round(AV.stock)}台）。`:'',
  Y.stock.old90!=null&&AV.old90?`90日超の売れ残り${Y.stock.old90}%は、${nA}（${AV.old90}%）${Y.stock.old90>AV.old90*1.15?'より高く、<b>売りにくい車</b>といえる':Y.stock.old90<AV.old90*0.87?'より低く、<b>売りやすい車</b>':'と同じくらい'}。`:'',
  Y.sold.z!=null&&AV.z_sold?`売れるまで${Y.sold.z}日（平均${AV.z_sold}日）。`:''].join('');
 const w_mv=sr==null?'値動きはまだ計算できていない。':`小売は月${pc(sr)}で、${nA}（${pc(AV.slope_rt)}）${sr<AV.slope_rt-0.2?'より<b>速く下がる</b>':sr>AV.slope_rt+0.2?'より<b>下がりにくい</b>':'と同じくらい'}。AAは月${pc(sa)}（平均${pc(AV.slope_aa)}）。走行1万kmで小売${pc(Fs.km10)}（平均${pc(AV.km10_rt)}）。`;
 document.getElementById('main').innerHTML=`
 <div class="h2row"><h2 style="margin:0 0 8px"><span class="muted" style="font-size:14px">${M.maker}</span> ${M.car} <span class="muted" style="font-size:13px;font-weight:400">${M.lesson?(M.kei?'軽':''):(M.mods||[]).join('・')+(M.kei?'・軽':'')}</span>${CNOTE()}</h2><button class="addcmp" onclick="cdOpen()" ${CMPS.length>=2&&!CDLG?'disabled data-tip="比較は3車種まで"':''}>＋ 比較する車種を足す${CMPS.length?`（${CMPS.length+1}/3）`:''}</button></div>
 ${LESSON()}
 ${CDLGH()}
 <div class="pick">
  ${(M.phases||[]).length?`<div class="yl"><span>期${LM(9)}<span class="qi" data-tip="押すとその期の車（初度登録の年月で振り分け）だけで出す">?</span></span><div class="years phs">${M.phases.map((p,i)=>`<button class="${S.ph===i?'on':''}" data-ph="${i}" data-tip="${(p.ym||'')}〜 ${(p.what||'').replace(/"/g,'&quot;')}${p.by==='ym'?`&lt;br&gt;初度登録の年月で振り分け（${i?p.ym+' 以降の登録':ymPrev((M.phases[i+1]||{}).ym)+' までの登録'}）。AA ${(p.n||{}).aa??'—'}台・小売 ${(p.n||{}).sold??'—'}台${(p.n||{}).unk?`（登録の月が分からず期を決められない ${(p.n||{}).unk}台は入れない）`:''}`:''}">${p.name}（${p.by==='ym'?(i?p.ym+'〜':'〜'+ymPrev((M.phases[i+1]||{}).ym)):p.years[0]+'〜'+p.years[p.years.length-1]}）</button>`).join('')}</div></div>`:''}
  <div class="yl">年式<div class="years">${ys.map(y=>`<button class="${S.ys.includes(y)?'on':''}" data-y="${y}">${wy(y)}</button>`).join('')}</div></div>
  ${FSEL('g','グレード（メイン）',Object.keys(FC.g).sort((a,b)=>(FC.g[b].a+FC.g[b].r)-(FC.g[a].a+FC.g[a].r)),v=>v)}
  ${FSEL('sb','詳細（トリム・パッケージ・限定車）',Object.keys(FC.sb).sort((a,b)=>(a===''?-1:b===''?1:(FC.sb[b].a+FC.sb[b].r)-(FC.sb[a].a+FC.sb[a].r))),v=>v===''?'詳細なし（メイングレードのみ）':v)}
  ${FSEL('m','型式',Object.keys(FC.m).sort((a,b)=>(FC.m[b].a+FC.m[b].r)-(FC.m[a].a+FC.m[a].r)),v=>{const k=(M.kata||{})[v];return v+(k?(k.one?`＝${k.main}${k.phase?'・'+k.phase:''}`:`（${k.mains.slice(0,3).join('・')}など）`):'')})}
  <label><span class="kmh">走行<span class="kmsw"><button type="button" class="${S.kmMode==='x'?'':'on'}" data-km="b">帯で選ぶ</button><button type="button" class="${S.kmMode==='x'?'on':''}" data-km="x">ぴったり</button></span></span>${S.kmMode==='x'?`<span class="kmrow"><input id="skn" type="number" min="0" max="200" step="0.1" placeholder="例 3.5" value="${S.kmx!=null?(S.kmx/10).toFixed(1):''}"><span class="muted">万km</span>${S.f.kb!=null?`<span class="muted" style="white-space:nowrap">（${KBN[S.f.kb]}の帯）</span>`:''}</span>`:FSELIN('kb',[0,1,2,3,4,5].filter(v=>FC.kb[v]||S.f.kb===v),v=>KBN[v])}</label>
  ${FSEL('col','色',Object.keys(FC.col).sort((a,b)=>(FC.col[b].a+FC.col[b].r)-(FC.col[a].a+FC.col[a].r)),v=>v)}
  <label>評価点・内装（AA だけ）<span style="display:flex;gap:6px">${FSELIN('e',[3,3.5,4,4.5,5].filter(v=>FC.e[v]||S.f.e===v),v=>'評価 '+v,1)}${FSELIN('i',['A','B','C','D','E'].filter(v=>FC.i[v]||S.f.i===v),v=>'内装 '+v,1)}</span></label>
  ${EQH(Y)}
  <div class="hit ${HIT.few?'few':''}"><span${S.f.e!=null||S.f.i!=null?' data-tip="小売は評価点・内装なしで数える"':''}>${LM(8)}当てはまる実績 <b>AA ${HIT.aa.toLocaleString()}台</b>・<b>小売 ${HIT.rt.toLocaleString()}台</b></span>${HIT.few?`<span class="hw">⚠ 実績が少ない（10台未満${!HIT.aa||!HIT.rt?'・'+(!HIT.aa&&!HIT.rt?'AA・小売とも':!HIT.aa?'AA':'小売')+'は0台＝式で出した値':''}）。値は外れやすい</span>`:''}<button class="addcmp" onclick="fReset()" ${Object.keys(S.f).some(k=>k!=='g'&&S.f[k]!=null)||S.kmx!=null?'':'disabled'}>グレード以外の条件をはずす</button></div>
 </div>
 ${CMPGRID(R)}
 <div class="verdict ${cls}${NOWOPEN?' vopen':' vshut'}" ${CMPS.length?'hidden':''} onclick="nowClick(event)" title="${NOWOPEN?'空いている所を押すとたたむ':'押すと計算と詳細を開く'}">
  <div class="bh">いまの金額${LM(1)}</div>
  ${MIXNOTE(R)}
  <div class="vtop">${R.gp?`<div class="gp">見込み粗利 <b>${(R.gp.gain/10).toFixed(1)}<small>万</small></b><span class="tx">税抜</span></div>`:'<div class="judge">データが足りません</div>'}</div>
  ${NOWOPEN?`  ${unusedLine(R)}
  ${(()=>{const W=(R.warn||[]).slice(0,-1);   // 最後の1行は全部の車に出る決まり文句（社外パーツ・出品票）＝画面の一番下の注記に1回だけ（2026-10-09 ゆうた）
   return W.length?`<div class="warn"><b>⚠ 相場DBが苦手な条件</b>${W.map(w=>`<div>・${w}</div>`).join('')}</div>`:''})()}
  <div class="main3">
   <div class="num"><div class="h">AA相場${LM(2)}${cfb(R.conf.aa)}</div>
    <div class="v" style="color:var(--aa)">${ex1(R.tax.aa)}</div><div class="inc">${inc1(R.tax.aa)}</div>
    ${R.gp?`<div class="sim" data-sell="${R.gp.sell}" data-fee="${SobaCalc.CFG.AA_FEE}" data-prof="${R.prof}" data-tax="${SobaCalc.CFG.TAX}"><label>仕入れ金額${LM(3)}<input type="number" step="0.1" min="0" value="${((R.tax.aa&&R.tax.aa.ex)/10).toFixed(1)}" oninput="simUp(this)"><span>万円</span></label><span class="sres"></span><span class="muted sup">上限 ${man(R.tax.up&&R.tax.up.ex)}</span></div>`:''}
    ${Y.asnet.n?`<div class="s" data-tip="ASNET の同じ年式の落札の生の真ん中。グレード・評価点が混ざる">ASNET 直近4週 ${man(Y.asnet.p)}（${S.y}年式 ${Y.asnet.n}台・生の真ん中）</div>`:''}
    ${(()=>{const g=NAG();if(!g)return '';return `<div class="nag ${g.cls}" data-tip="${g.tip}">${LM(7)}${g.lab}流札率 <b>${g.r}%</b><span class="muted">（全体 ${g.av}%の${g.x.toFixed(1)}倍）</span> ${g.say}${g.tr?`<br><span class="tr">${g.tr}</span>`:''}</div>`})()}${boxMore('aa')}</div>
   <div class="num"><div class="h">小売相場${LM(4)}${cfb(R.conf.rt)}</div>
    <div class="v" style="color:var(--rt)">${ex1(R.tax.rt)}</div><div class="inc">${inc1(R.tax.rt)}</div>
    <div class="sub2"><span>4か月後</span><b>${man(R.tax.rt4&&R.tax.rt4.ex)}</b><span class="muted">税込 ${man(R.tax.rt4&&R.tax.rt4.inc)}</span></div>
    <div class="s">掲載 ${man(R.tax.stk&&R.tax.stk.ex)}／新着 ${man(R.tax.frs&&R.tax.frs.ex)}（税抜）</div>${rivalLine(M,S.y,S.km,R)}${R.tax.rt1y?`<div class="s" data-tip="1年後（同じ走行のまま）の目安。同じ世代の1年古い年式のいまの値（無ければ全車種の年数ごとの1年の下がり方）から出す。13か月前のデータで試した外れの真ん中は14〜18%なので、目安として見る">1年後の目安 ${man(R.tax.rt1y.ex)}（±15%くらい）／AA ${man(R.tax.aa1y&&R.tax.aa1y.ex)}</div>`:''}${boxMore('rt')}</div>
   <div class="num"><div class="h">買取相場${LM(5)}</div>
    <div class="v">${ex1(R.tax.buy.shop)}</div><div class="inc">お客様に払う額 ${man(R.tax.buy.shop&&R.tax.buy.shop.inc)}</div>
    ${R.buy.shop!=null?`<div class="sim simb" data-rt4="${R.rt4}" data-aa1="${R.aa1==null?'':R.aa1}" data-sellfee="${SobaCalc.CFG.AA_SELL}" data-prof="${R.prof}" data-aaprof="${SobaCalc.CFG.BUY_AA_PROF}" data-tax="${SobaCalc.CFG.TAX}"><label>買取金額${LM(6)}<input type="number" step="0.1" min="0" value="${(R.buy.shop/10).toFixed(1)}" oninput="simBuy(this)"><span>万円（お客様に払う額）</span></label><span class="sres"></span></div>`:''}${(()=>{const g=NAG();return g&&g.x>=1.5?`<div class="s" style="color:var(--${g.cls})">流札率 ${g.r}%（全体の${g.x.toFixed(1)}倍）。AAに出しても流れやすい</div>`:''})()}
    ${boxMore('buy')}</div>
  </div>
  ${BOXOPEN.aa?`<div class="box4"><div class="bh">AA相場の詳細</div><table class="sc"><tr><th>いつ</th><th class="n">AA相場（税抜）</th></tr><tr><td>いま</td><td class="n g">${man(R.tax.aa&&R.tax.aa.ex)}</td></tr><tr><td>1か月後</td><td class="n">${man(R.aa1)}</td></tr><tr><td>4か月後</td><td class="n">${man(R.aa4)}</td></tr>${R.tax.aa1y?`<tr><td>1年後の目安（±15%くらい）</td><td class="n">${man(R.tax.aa1y.ex)}</td></tr>`:''}</table><div class="note">精度 ${R.conf.aa?R.conf.aa.grade+'（外れの目安 ±'+R.conf.aa.pct+'%）':'—'}／今の条件に当てはまる実績 AA ${typeof HIT!=='undefined'?HIT.aa:'—'}台${Y.asnet.n?`／ASNET 直近4週 ${man(Y.asnet.p)}（${S.y}年式 ${Y.asnet.n}台・生の真ん中）`:''}</div></div>
 <div class="box4">
  <div class="bh">4か月後の収益</div>
  <div class="lead">${best?`4か月後で一番残るのは「${best.k}」で <b>${man(best.gain)}</b>。`:''}</div>
  <table class="sc"><tr><th>やり方</th><th class="n">売り（税抜）</th><th class="n">仕入れ（税抜）</th><th class="n">残る額（税抜）</th></tr>
  ${R.sc.map(x=>`<tr${x===best?' class="best"':''}><td>${x.k}<div class="how">${x.how}</div></td><td class="n">${man(x.sell)}</td><td class="n">${man(x.buy)}</td><td class="n g ${x.gain==null?'':x.gain>=100?'pos':x.gain>=0?'':'neg'}">${man(x.gain)}</td></tr>`).join('')}
  </table>
  <div class="note">税抜<span class="qi" data-tip="金額はすべて税抜（小売の値は ÷1.1）。残る額＝車体差額（整備・付帯利益は入れていない）。仕入れはAA＋落札経費1万。AAの出品経費は仮に2万">?</span></div>
 </div>
`:''}
  ${rivalBox(M,S.y,S.km,R)}
  ${BOXOPEN.buy?` <div class="box4">
  <div class="bh">買取相場の詳細<span class="qi" data-tip="お客様（個人）への支払いに消費税は付かないが、店は払った額の10/110を仕入れの消費税として差し引ける前提（本則課税）。だから「税抜の上限×1.1」がお客様に払える額。法人・課税事業者から買う時は、相手に払う額は「税抜の額＋消費税」。整備・付帯利益は入れていない">?</span></div>
  ${(()=>{const K=M.kn||{},gr=(K.grade_recycle||{})[S.g],rc=K.recycle||[];const f=v=>Array.isArray(v)?(v[0]===v[1]?man(v[0]/1000):man(v[0]/1000)+"〜"+man(v[1]/1000)):man(v/1000);if(gr)return `<div class="note" style="margin:0 0 6px">リサイクル料金（このグレード）：<b>${f(gr)}</b>。買取の時は、お客様に払う額とは別に預託金として扱う</div>`;if(rc.length)return `<div class="note" style="margin:0 0 6px">リサイクル料金：${rc.slice(0,3).map(r=>`${r.scope} <b>${f(r.yen)}</b>`).join("／")}。買取の時は、お客様に払う額とは別に預託金として扱う</div>`;return ""})()}
  ${R.buy.shop!=null?'':'<div class="lead">データが足りません。</div>'}
  <table class="sc"><tr><th>買い方</th><th class="n">税抜</th><th class="n">お客様に払う額（税込）</th></tr>
   <tr><td>店頭で売る前提（4か月後に小売）<div class="how">4か月後の売値（税込）÷1.1 − 粗利${M.kei?8:10}万。AAの落札料は要らない</div></td><td class="n g">${man(R.tax.buy.shop&&R.tax.buy.shop.ex)}</td><td class="n">${man(R.tax.buy.shop&&R.tax.buy.shop.inc)}</td></tr>
   <tr><td>すぐAAに出す前提（1か月後のAA）<div class="how">1か月後のAA（税抜）− 出品経費${AA_SELL/10}万 − 利益${BUY_AA_PROF/10}万（仮）</div></td><td class="n g">${man(R.tax.buy.aa&&R.tax.buy.aa.ex)}</td><td class="n">${man(R.tax.buy.aa&&R.tax.buy.aa.inc)}</td></tr>
   <tr><td>業者の相場の目安（AA相場そのまま・利益0）<div class="how">ほかの買取店が出せる上の方の目安。これより上は赤字</div></td><td class="n">${man(R.tax.buy.mkt&&R.tax.buy.mkt.ex)}</td><td class="n">${man(R.tax.buy.mkt&&R.tax.buy.mkt.inc)}</td></tr>
  </table>
 </div>
`:''}
`:`  <div class="mini3"><div class="mini"><div class="h">AA相場</div><div class="v" style="color:var(--aa)">${ex1(R.tax.aa)}</div><div class="inc">${inc1(R.tax.aa)}</div></div><div class="mini"><div class="h">小売相場</div><div class="v" style="color:var(--rt)">${ex1(R.tax.rt)}</div><div class="inc">${inc1(R.tax.rt)}</div></div><div class="mini"><div class="h">買取相場</div><div class="v">${ex1(R.tax.buy.shop)}</div><div class="inc">お客様に払う額 ${man(R.tax.buy.shop&&R.tax.buy.shop.inc)}</div></div></div>
`}
  ${NOWOPEN?`<div class="flow">${flow}</div>`:''}
 </div>
 <div class="sech">グラフ${LM(11)}</div>
 ${chart(R)}${GUIDE()}
 <div class="sech">詳細</div>
 <div class="blocks">
${(()=>{   // 詳細の1段目＝カタログ・純正色・主な諸元・装備（2026-10-09 ゆうた「カタログを3つに分けて2段で」）
  const c=(Y.cat||{})[S.g],DT=window.SOBA&&SOBA.det,d=c&&c.match&&DT&&c.did&&DT.pages[c.did],B=(t,h)=>`<div class="blk"><h4>${t}</h4>${h}</div>`,none='<p class="note">—</p>';
  let cat;
  if(!c)cat='<p class="note">この型式・グレードはカタログと突き合わせできていません。</p>';
  else if(!c.match)cat=`<p>${wy(S.y)}の型式${c.kata}では、カタログに「${S.g}」という名前のグレードが見つかりません。カタログのグレード：${c.grades.slice(0,12).join('／')}</p>`;
  else{const np=(S.sb&&S.sb!=='__ALL__'&&c.sub_price&&c.sub_price[S.sb])||c.pmin;const rr=R.rt&&np?R.rt/np*100:null;
   const TXc=SobaCalc.CFG.TAX,rg=(a,z,k)=>man(a/k)+(z&&z!==a?'〜'+man(z/k):'');   // 新車価格は税抜をメインに・税込を添える（2026-10-09 ゆうた）
   cat=`<div class="row"><span>正式名</span><b>${c.name}${c.exact?'':'<small class="muted">（近い名前で突き合わせ）</small>'}</b></div><div class="row"><span>発売・型式</span><b>${c.ym}発売・${c.kata}</b></div><div class="row"><span>新車価格</span><b>${rg(c.pmin,c.pmax,TXc)} <small class="muted">税抜</small></b></div><div class="row"><span></span><span class="muted">税込 ${rg(c.pmin,c.pmax,1)}</span></div>${rr?`<div class="row"><span>いまの小売相場は新車の</span><b>${rr.toFixed(0)}%</b></div>`:''}${c.id?`<div class="row"><span>カタログ</span><b><a href="https://www.goo-net.com${c.url}" target="_blank" rel="noopener">グーネットで見る</a></b></div>`:''}<p class="note">この年式のカタログのグレード：${c.grades.slice(0,20).join('／')}</p>`}
  const cl=d?(DT.colors[d.col]||[]):[],kn=KNCOL();
  const col=(cl.length?`<p class="note" style="margin-top:0">${cl.length}色・${c.ym}発売・型式${c.kata}（グーネット）</p><div class="cols">${cl.map(x=>`<span class="${x[1]?'op':''}" title="${x[2]}${x[1]?'・オプション':''}">${x[0].replace(/or/g,' または ')}${x[1]?'（OP）':''}</span>`).join('')}</div><p class="note" style="margin-top:0">点線＝OP色・A／B＝2トーン（屋根／車体）</p>`:'')+(kn||'')||none;
  const sp=c&&c.match?`<div class="row"><span>排気量・駆動・ミッション</span><b>${c.cc}・${c.drive}・${c.shift}</b></div><div class="row"><span>定員・燃費</span><b>${c.seat}・${c.fuel}</b></div><div class="row"><span>寸法</span><b>${c.size}</b></div>${d?Object.entries(d.sp).map(([k,v])=>`<div class="row"><span>${k}</span><b>${v}</b></div>`).join(''):''}`:none;
  const eq=d?`${c.didg?`<p class="note" style="margin-top:0">「${c.didg}」のページ（同じ発売月・型式）</p>`:''}<h5>標準</h5><div class="eq">${d.std.map(i=>DT.eq[i]).join('・')||'—'}</div>${d.opt.length?`<h5>オプション</h5><div class="eq">${d.opt.map(i=>DT.eq[i]).join('・')}</div>`:''}`:none;
  return `<div class="blk4">${B('カタログ<span class="note">（グーネット）</span>',cat)}${B('純正色',col)}${B('主な諸元',sp)}${B('装備',eq)}</div><div class="blk4">`})()}

  <div class="blk"><h4>条件の補正<span class="note">（小売・税込・標準の車との差）</span><span class="qi" data-tip="代表の1台＝${S.y}年式 ${String(S.g).replace(/"/g,'&quot;')}・${(S.km/10).toFixed(1)}万km と、標準の車の差">?</span></h4><p>${w_bd}</p>
   <div class="row"><span>標準の車</span><b>${Y.std.grade}・${(Y.std.km/10).toFixed(1)}万km・${Fs.cs?Fs.cs[0]:''}</b></div>
   <div class="row"><span>標準の車の売れる値</span><b>${man(R.rtStd)}</b></div>
   <div class="row"><span>型式</span><b>${sman(R.bd.model)}</b></div><div class="row"><span>グレード</span><b>${sman(R.bd.grade)}</b></div><div class="row"><span>走行</span><b>${sman(R.bd.km)}</b></div><div class="row"><span>色</span><b>${sman(R.bd.col)}</b></div>
   ${R.gIn?'':'<p class="note">このグレードは件数が少ないので、グレード差は入れていません。</p>'}</div>
  <div class="blk"><h4>掲載と成約<span class="note">（小売・税込）</span></h4><p>${w_mk}</p>
   <div class="row"><span>掲載中（この条件）</span><b>${man(R.stk)}</b></div><div class="row"><span>新着・出て20日以内（この条件）</span><b>${man(R.frs)}</b></div><div class="row"><span>実際に売れた値（この条件）</span><b>${man(R.rt)}</b></div></div>
  <div class="blk"><h4>売れやすさ${YL}</h4><p>${w_sell}</p>
   <div class="row"><span>いま掲載中（この年式）</span><b>約${tot.stock??'—'}台</b></div><div class="row"><span>1年で売れた（この年式）</span><b>約${tot.sold??'—'}台</b></div>
   <div class="row"><span>90日超の売れ残り</span><b>${Y.stock.old90??'—'}%</b></div><div class="row"><span>売れるまでの日数</span><b>${Y.sold.z??'—'}日</b></div></div>
  <div class="blk"><h4>値動き${YL}</h4><p>${w_mv}</p>
   <div class="row"><span>小売 月あたり</span><b>${pc(sr)}</b></div><div class="row"><span>AA 月あたり</span><b>${pc(sa)}</b></div><div class="row"><span>AAの台数（13か月・この年式）</span><b>約${tot.aa??'—'}台</b></div></div>
  </div>
 </div>
 <p class="note">${(R.warn||[]).length?R.warn[R.warn.length-1]:'社外パーツのカスタム・出品票の注意事項（警告灯・修理歴など）は相場DBに入っていない＝出品票で引く'}。<span data-tip="税抜をメインに出し、大きな金額には税込を横に添える（DataLineの小売・グーの新車価格は元が税込なので÷1.1、AA・ASNETは元が税抜）。4か月後の収益は税抜。お客様からの買取の「税込」は、お客様に払う額そのもの（個人からの買取は消費税が付かない支払い）。&lt;br&gt;金額はすべて、年式・グレード・走行・色・評価点・月をそろえて計算した値。DataLine の「成約」は掲載を下げた時の値で、値引きは入っていない。全車平均は、このDBに入っている車種の真ん中" style="border-bottom:1px dotted var(--sub)">税の表記・計算の前提</span></p>`;
 const m=document.getElementById('main');
 // 年式を変えた後、選んだ年式に無くなった条件ははずす（グレードは一番新しい年式の標準に）
 const fixF=()=>{['g','m','sb','col','kb','e','i'].forEach(k=>{if(S.f[k]==null)return;const c=facet(k)[S.f[k]];if(!c||!(c.a+c.r)){if(k==='g'){const Y0=M.years[S.ys.slice().sort().reverse()[0]];S.f.g=Y0.std.grade}else S.f[k]=null}})};
 m.querySelectorAll('.years button[data-y]').forEach(b=>b.onclick=()=>{S.ph=null;S.f.ph=null;const y=b.dataset.y;if(S.ys.includes(y)){if(S.ys.length>1)S.ys=S.ys.filter(x=>x!==y)}else S.ys=[...S.ys,y];fixF();draw()});
 m.querySelectorAll('.years button[data-ph]').forEach(b=>b.onclick=()=>{const i=+b.dataset.ph,p=M.phases[i];if(S.ph===i){S.ph=null;S.f.ph=null;S.ys=[S.y];fixF();draw();return}const L=p.years.map(String).filter(y=>M.years[y]);if(!L.length)return;S.ph=i;S.ys=L;S.f.ph=p.by==='ym'?i:null;fixF();draw()});   // 2026-10-09：年式を選ぶだけでなく、その期の車（初度登録の年月）だけに絞る（S.f.ph）
 m.querySelectorAll('select[data-f]').forEach(el=>el.onchange=e=>{const k=e.target.dataset.f,v=e.target.value;S.f[k]=v===''?null:(k==='kb'||k==='e')?+v:v;
  if(k==='kb'&&S.kmx!=null&&(S.f.kb==null||SobaCalc.cxKb(S.kmx)!==S.f.kb))S.kmx=null;
  if(k==='g'&&S.f.sb!=null){const c=facet('sb')[S.f.sb];if(!c)S.f.sb=null}draw()});
 m.querySelectorAll('select[data-q]').forEach(el=>el.onchange=e=>{S.q=S.q||{};const k=e.target.dataset.q;if(e.target.value==='')delete S.q[k];else S.q[k]=+e.target.value;draw()});
 const su=m.querySelector('#sun');if(su)su.onchange=e=>{S.un=e.target.value===''?null:e.target.value==='1';draw()};
 m.querySelectorAll('.kmsw button').forEach(b=>b.onclick=()=>{const x=b.dataset.km==='x';if(x===(S.kmMode==='x'))return;S.kmMode=x?'x':'b';if(!x)S.kmx=null;draw()});   // 走行の帯⇔ぴったりの切り替え（2026-10-09 ゆうた）
 {const kn=m.querySelector('#skn');if(kn)kn.onchange=e=>{const v=e.target.value.trim();if(v===''){S.kmx=null}else{S.kmx=Math.max(0,Math.round(+v*10));S.f.kb=SobaCalc.cxKb(S.kmx)}draw()}}};
document.getElementById('q').oninput=list;
{const _d=draw;draw=function(){_d.apply(this,arguments);try{simAll()}catch(e){}}}   // 描いた後に計算の欄を埋める
list();   // 開いた時は車を選ばない（空欄から。2026-10-09 ゆうた。前は一覧の先頭＝アトレーを自動で選んでいた）

function sobaRedraw(){if(M)draw()}   // det.json（カタログ）が後から来た時
/* ---- CarFlow：カードを開く ---- */
function FULLC(k){const s=D.find(x=>x.key===k&&x.fit);if(s)return s;const c=SobaData.cached(k);if(!c&&k)SobaData.card(k).then(()=>draw()).catch(()=>{});return c}
function openCard(k){const mm=document.getElementById('main');const was=M;
 const c=SobaData.cached(k);if(c){M=c;S={};list();draw();return}
 mm.innerHTML='<p class="muted">読み込み中…</p>';
 SobaData.card(k).then(c=>{M=c;S={};CDLG=null;list();draw();mm.scrollTop=0}).catch(e=>{M=was;SobaData.fail(e)})}
