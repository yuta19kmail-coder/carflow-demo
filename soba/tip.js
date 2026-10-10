// マウスを乗せた所の説明（data-tip）。SVG の title が出ない環境があるので自前で出す（クリックでも出る）
(function(){const tip=document.getElementById('tip');
 const show=(el,x,y)=>{tip.innerHTML=el.getAttribute('data-tip');tip.style.display='block';const w=tip.offsetWidth,h=tip.offsetHeight;let a=x+14,b=y+16;if(a+w>innerWidth-8)a=x-w-14;if(b+h>innerHeight-8)b=y-h-12;tip.style.left=Math.max(8,a)+'px';tip.style.top=Math.max(8,b)+'px'};
 document.addEventListener('mousemove',e=>{const el=e.target.closest&&e.target.closest('[data-tip]');if(!el){tip.style.display='none';return}show(el,e.clientX,e.clientY)});
 document.addEventListener('click',e=>{const el=e.target.closest&&e.target.closest('[data-tip]');if(el)show(el,e.clientX,e.clientY)});
})();
