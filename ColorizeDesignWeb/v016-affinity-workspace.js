const STORE='colorize-design-web-v04';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

const ui={snap:true,grid:true,rulers:true,spaceHand:false,lastTool:'select'};
let clipboardObject=null;
let pointerEditing=false;
let pointerWasObject=false;
let rotateDrag=null;
let history=[];
let historyIndex=-1;
let historySuspended=false;
let historyTimer=0;
let lastUiSignature='';

function readProjectRaw(){return localStorage.getItem(STORE)||''}
function readProject(){try{return JSON.parse(readProjectRaw()||'null')}catch{return null}}
function activeData(){
  const p=readProject();if(!p)return {p:null,a:null,o:null};
  const a=p.artboards?.find(x=>x.id===p.activeArtboardId)||p.artboards?.[0]||null;
  const o=a?.objects?.find(x=>x.id===p.selectedObjectId)||null;
  return {p,a,o};
}
function captureHistory(){
  if(historySuspended)return;
  const raw=readProjectRaw();if(!raw)return;
  if(historyIndex>=0&&history[historyIndex]===raw)return;
  if(historyIndex<history.length-1)history=history.slice(0,historyIndex+1);
  history.push(raw);if(history.length>100)history.shift();historyIndex=history.length-1;updateHistoryButtons();
}
function scheduleCapture(delay=120){clearTimeout(historyTimer);historyTimer=setTimeout(captureHistory,delay)}
function importRaw(raw){
  const input=$('#importInput');if(!input||!raw)return false;
  try{
    const file=new File([raw],'colorize-history.colorize.json',{type:'application/json'});
    const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;
  }catch{
    try{localStorage.setItem(STORE,raw);location.reload();return true}catch{return false}
  }
}
function restoreHistory(nextIndex){
  if(nextIndex<0||nextIndex>=history.length||nextIndex===historyIndex)return;
  historySuspended=true;historyIndex=nextIndex;const raw=history[historyIndex];importRaw(raw);
  setTimeout(()=>{historySuspended=false;updateHistoryButtons();syncContext(true);drawRulers()},260);
}
function undo(){captureHistory();if(historyIndex>0)restoreHistory(historyIndex-1)}
function redo(){if(historyIndex<history.length-1)restoreHistory(historyIndex+1)}
function updateHistoryButtons(){
  $$('[data-aff-action="undo"]').forEach(b=>b.disabled=historyIndex<=0);
  $$('[data-aff-action="redo"]').forEach(b=>b.disabled=historyIndex>=history.length-1);
}

function currentProp(key){return $(`#properties [data-prop="${key}"]`)}
function setProp(key,value,{record=true}={}){
  const el=currentProp(key);if(!el)return false;
  if(record)captureHistory();
  el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));scheduleCapture();syncContext();return true;
}
function selectedMetrics(){
  const node=$('.artboard.active .obj.selected');const art=$('.artboard.active');if(!node||!art)return null;
  const num=v=>Number.parseFloat(v)||0;
  return {node,art,x:num(node.style.left),y:num(node.style.top),w:num(node.style.width),h:num(node.style.height),aw:num(art.style.width),ah:num(art.style.height)};
}
function align(kind){
  const m=selectedMetrics();if(!m)return false;captureHistory();
  if(kind==='left')setProp('x',0,{record:false});
  if(kind==='hcenter')setProp('x',(m.aw-m.w)/2,{record:false});
  if(kind==='right')setProp('x',m.aw-m.w,{record:false});
  if(kind==='top')setProp('y',0,{record:false});
  if(kind==='vcenter')setProp('y',(m.ah-m.h)/2,{record:false});
  if(kind==='bottom')setProp('y',m.ah-m.h,{record:false});
  scheduleCapture();return true;
}
function nudge(dx,dy){
  const m=selectedMetrics();if(!m)return;captureHistory();if(dx)setProp('x',m.x+dx,{record:false});if(dy)setProp('y',m.y+dy,{record:false});scheduleCapture();
}
function deleteSelected(){const b=$('[data-delete-object="'+(activeData().o?.id||'')+'"]');if(b){captureHistory();b.click();scheduleCapture()}}
function duplicate(){captureHistory();$('#duplicateBtn')?.click();scheduleCapture()}
function copySelected(){const {o}=activeData();if(o)clipboardObject=structuredClone(o)}
function pasteObject(){
  if(!clipboardObject)return false;captureHistory();const p=readProject();if(!p)return false;const a=p.artboards?.find(x=>x.id===p.activeArtboardId)||p.artboards?.[0];if(!a)return false;
  const c=structuredClone(clipboardObject);c.id=crypto.randomUUID?.()||Math.random().toString(36).slice(2);c.name=`${c.name||c.text||'Объект'} копия`;c.x=(Number(c.x)||0)+24;c.y=(Number(c.y)||0)+24;a.objects.push(c);p.selectedObjectId=c.id;
  historySuspended=true;importRaw(JSON.stringify(p));setTimeout(()=>{historySuspended=false;captureHistory();syncContext(true)},240);return true;
}
function cutSelected(){copySelected();deleteSelected()}
function reorderLayer(direction){
  const {p,a,o}=activeData();if(!p||!a||!o)return;const i=a.objects.findIndex(x=>x.id===o.id);if(i<0)return;captureHistory();
  let j=i;if(direction==='front')j=a.objects.length-1;if(direction==='back')j=0;if(direction==='forward')j=Math.min(a.objects.length-1,i+1);if(direction==='backward')j=Math.max(0,i-1);if(j===i)return;
  a.objects.splice(i,1);a.objects.splice(j,0,o);historySuspended=true;importRaw(JSON.stringify(p));setTimeout(()=>{historySuspended=false;captureHistory();syncContext(true)},240);
}

function toolClick(name){
  const map={select:'#selectTool',hand:'#panTool',text:'#addTextBtn',rect:'#addRectBtn',artboard:'#addArtboardBtn',place:'#imageInput'};
  if(name==='place'){map&&$('#imageInput')?.click();return}
  $(map[name])?.click();ui.lastTool=name==='hand'?'hand':'select';setToolVisual(name);
}
function setToolVisual(name){$$('.aff-tool16').forEach(b=>b.classList.toggle('active',b.dataset.affTool===name));}

function menuMarkup(){return `<div id="affinityMenu16" class="aff-menu16">
  <div class="aff-app-title16"><span class="aff-mark16">C</span><b>Colorize Designer</b></div>
  <div class="aff-menu-items16">
    <button data-aff-menu="file">Файл</button><button data-aff-menu="edit">Правка</button><button data-aff-menu="object">Объект</button><button data-aff-menu="layer">Слой</button><button data-aff-menu="view">Вид</button>
  </div><div class="aff-doc-title16">Новый проект</div>
  <div id="affMenuPopover16" class="aff-menu-pop16" hidden></div>
</div>`}
const MENUS={
  file:[['new','Новый проект','⌘N'],['save','Сохранить','⌘S'],['export','Экспорт проекта','⌥⌘S']],
  edit:[['undo','Отменить','⌘Z'],['redo','Повторить','⇧⌘Z'],['cut','Вырезать','⌘X'],['copy','Копировать','⌘C'],['paste','Вставить','⌘V'],['duplicate','Дублировать','⌘J'],['delete','Удалить','⌫']],
  object:[['align-left','Выровнять слева',''],['align-center','По центру горизонтально',''],['align-right','Выровнять справа',''],['align-top','Выровнять сверху',''],['align-middle','По центру вертикально',''],['align-bottom','Выровнять снизу','']],
  layer:[['front','На передний план',''],['forward','Переместить вперёд',''],['backward','Переместить назад',''],['back','На задний план','']],
  view:[['fit','Вписать Artboard','⌘1'],['center-all','Показать все Artboard','⌘0'],['grid','Сетка',''],['rulers','Линейки',''],['snap','Привязка','']]
};
function openMenu(name,button){
  const pop=$('#affMenuPopover16');if(!pop)return;const list=MENUS[name]||[];
  pop.innerHTML=list.map(([a,label,key])=>`<button data-aff-action="${a}"><span>${label}</span><kbd>${key}</kbd></button>`).join('');
  const r=button.getBoundingClientRect();pop.style.left=`${Math.max(6,r.left)}px`;pop.style.top='27px';pop.hidden=false;updateHistoryButtons();
}
function closeMenu(){const p=$('#affMenuPopover16');if(p)p.hidden=true}

function contextMarkup(){return `<div id="affinityContext16" class="aff-context16">
  <div class="aff-context-tool16"><b id="affContextName16">Перемещение</b></div>
  <div class="aff-context-fields16" id="affTransformFields16">
    <label>X <input data-aff-prop="x" type="number" step="1"></label><label>Y <input data-aff-prop="y" type="number" step="1"></label>
    <label>W <input data-aff-prop="w" type="number" min="1" step="1"></label><label>H <input data-aff-prop="h" type="number" min="1" step="1"></label>
    <label>↻ <input data-aff-prop="rotation" type="number" step="1"></label>
  </div>
  <div class="aff-sep16"></div><div class="aff-align16">
    <button data-aff-align="left" title="По левому краю">▏←</button><button data-aff-align="hcenter" title="По центру горизонтально">↔</button><button data-aff-align="right" title="По правому краю">→▕</button>
    <button data-aff-align="top" title="По верхнему краю">▔↑</button><button data-aff-align="vcenter" title="По центру вертикально">↕</button><button data-aff-align="bottom" title="По нижнему краю">↓▁</button>
  </div><div class="aff-sep16"></div>
  <div id="affTextFields16" class="aff-text-fields16" hidden><label>Размер <input data-aff-prop="fontSize" type="number" min="8" max="500"></label><label>Трекинг <input data-aff-prop="letterSpacing" type="number" step=".5"></label><label class="aff-color16">Цвет <input data-aff-prop="faceColor" type="color"></label></div>
  <div class="aff-context-spacer16"></div><button id="affSnap16" class="aff-toggle16 active" title="Привязка">🧲 <span>Привязка</span></button><button id="affGrid16" class="aff-toggle16 active" title="Сетка">#</button>
</div>`}
function toolsMarkup(){return `<div id="affinityTools16" class="aff-tools16">
  <button class="aff-tool16 active" data-aff-tool="select" title="Перемещение (V)">↖</button>
  <button class="aff-tool16" data-aff-tool="artboard" title="Artboard (A)">▣</button>
  <button class="aff-tool16" data-aff-tool="text" title="Текст (T)"><b>T</b></button>
  <button class="aff-tool16" data-aff-tool="rect" title="Прямоугольник (R)">□</button>
  <button class="aff-tool16" data-aff-tool="place" title="Поместить изображение">▧</button>
  <div class="aff-tool-gap16"></div>
  <button class="aff-tool16" data-aff-tool="hand" title="Рука (H / Space)">✋</button>
  <button class="aff-tool16" data-aff-action="zoom-out" title="Уменьшить">−</button>
  <button class="aff-tool16" data-aff-action="zoom-in" title="Увеличить">+</button>
  <button class="aff-tool16" data-aff-action="fit" title="Вписать Artboard">⊙</button>
</div>`}
function rulersMarkup(){return `<div id="affRulers16" class="aff-rulers16"><canvas id="affRulerTop16"></canvas><canvas id="affRulerLeft16"></canvas><div class="aff-ruler-corner16"></div></div><div id="smartGuides16" class="aff-guides16"><i class="v" hidden></i><i class="h" hidden></i></div>`}

function installUI(){
  document.body.classList.add('affinity-v016');const app=$('#app');const top=$('.topbar'),grid=$('.main-grid'),viewport=$('#viewport');if(!app||!top||!grid||!viewport)return;
  if(!$('#affinityMenu16'))top.insertAdjacentHTML('beforebegin',menuMarkup());
  if(!$('#affinityContext16'))grid.insertAdjacentHTML('beforebegin',contextMarkup());
  if(!$('#affinityTools16'))grid.insertAdjacentHTML('afterbegin',toolsMarkup());
  if(!$('#affRulers16'))viewport.insertAdjacentHTML('beforeend',rulersMarkup());
  $('.leftbar')?.classList.add('legacy-tools16');
  const design=$('.mode[data-mode="2d"]');if(design)design.textContent='Дизайн';const three=$('.mode[data-mode="view3d"]');if(three)three.textContent='3D';
  const construction=$('#constructionBtn');if(construction)construction.textContent='Конструкция';const light=$('#lightingBtn');if(light)light.textContent='Свет';
  const facade=$('#facadeScanBtn');if(facade){facade.textContent='Фасад';$('.mode-group')?.appendChild(facade)}
  if(!$('#exportPersona16')){const b=document.createElement('button');b.id='exportPersona16';b.className='aff-persona-export16';b.textContent='Экспорт';b.onclick=()=>$('#exportBtn')?.click();$('.mode-group')?.appendChild(b)}
  $('.mode-group')?.classList.add('aff-personas16');$('.right-panel')?.classList.add('aff-studio16');
  const rp=$('#rightPanel');if(rp&&!$('.aff-studio-label16',rp)){const h=document.createElement('div');h.className='aff-studio-label16';h.innerHTML='<b>СТУДИЯ</b><span>Слои · Artboards · Свойства</span>';rp.insertBefore(h,rp.firstChild)}
  bindUI();captureHistory();syncContext(true);drawRulers();
}

function bindUI(){
  $('#affinityMenu16')?.addEventListener('click',e=>{const m=e.target.closest('[data-aff-menu]');if(m){openMenu(m.dataset.affMenu,m);return}const a=e.target.closest('[data-aff-action]');if(a){runAction(a.dataset.affAction);closeMenu()}});
  $('#affinityContext16')?.addEventListener('input',e=>{const k=e.target.dataset.affProp;if(k)setProp(k,e.target.type==='number'?Number(e.target.value):e.target.value)});
  $('#affinityContext16')?.addEventListener('click',e=>{const a=e.target.closest('[data-aff-align]');if(a)align(a.dataset.affAlign);if(e.target.closest('#affSnap16'))toggleSnap();if(e.target.closest('#affGrid16'))toggleGrid()});
  $('#affinityTools16')?.addEventListener('click',e=>{const t=e.target.closest('[data-aff-tool]');if(t){toolClick(t.dataset.affTool);return}const a=e.target.closest('[data-aff-action]');if(a)runAction(a.dataset.affAction)});
  document.addEventListener('pointerdown',e=>{
    if(e.target.closest('.aff-menu16,.aff-context16,.aff-tools16,.right-panel,.construction-panel,.lighting-panel'))return;
    closeMenu();if(e.target.closest('[data-object-id]')&&!e.target.closest('[data-resize-id]')){pointerEditing=true;pointerWasObject=true;captureHistory()}else{pointerWasObject=false}
  },true);
  document.addEventListener('pointermove',()=>{if(pointerEditing&&pointerWasObject&&ui.snap)requestAnimationFrame(()=>snapSelection(false))},false);
  document.addEventListener('pointerup',()=>{if(pointerEditing){pointerEditing=false;hideGuides();scheduleCapture(80);syncContext()}},true);
  document.addEventListener('input',e=>{if(e.target.closest('#properties')){captureHistory();scheduleCapture();setTimeout(syncContext,0)}},true);
  document.addEventListener('click',e=>{if(e.target.closest('.mode,.list-row,[data-object-id],[data-artboard-id]'))setTimeout(()=>{syncContext(true);drawRulers()},0)},true);
  window.addEventListener('resize',drawRulers,{passive:true});$('#viewport')?.addEventListener('wheel',()=>requestAnimationFrame(drawRulers),{passive:true});
  new MutationObserver(()=>{syncContext();decorateSelection();}).observe($('#world')||document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class']});
  setInterval(()=>{syncContext();drawRulers()},500);
}
function runAction(a){
  const map={undo,redo,copy:copySelected,paste:pasteObject,cut:cutSelected,duplicate,delete:deleteSelected,front:()=>reorderLayer('front'),forward:()=>reorderLayer('forward'),backward:()=>reorderLayer('backward'),back:()=>reorderLayer('back')};
  if(map[a])return map[a]();if(a==='new')return $('#newProjectBtn')?.click();if(a==='save')return $('#saveBtn')?.click();if(a==='export')return $('#exportBtn')?.click();if(a==='fit')return $('#fitBtn')?.click();if(a==='center-all')return $('#centerBtn')?.click();if(a==='zoom-in')return $('#zoomInBtn')?.click();if(a==='zoom-out')return $('#zoomOutBtn')?.click();
  if(a==='grid')return toggleGrid();if(a==='rulers')return toggleRulers();if(a==='snap')return toggleSnap();
  if(a.startsWith('align-')){const m={left:'left',center:'hcenter',right:'right',top:'top',middle:'vcenter',bottom:'bottom'};return align(m[a.slice(6)])}
}

function syncContext(force=false){
  const {p,a,o}=activeData();const bar=$('#affinityContext16');if(!bar)return;
  const sig=[p?.mode,a?.id,o?.id,o?.x,o?.y,o?.w,o?.h,o?.rotation,o?.fontSize,o?.letterSpacing,o?.faceColor].join('|');if(!force&&sig===lastUiSignature)return;lastUiSignature=sig;
  const has=!!o;$('#affTransformFields16').style.display=has?'flex':'none';$('.aff-align16').style.display=has?'flex':'none';$('.aff-sep16').style.display=has?'block':'none';
  $('#affTextFields16').hidden=!(o?.type==='text');$('#affContextName16').textContent=o?.type==='text'?'Текст':o?.type==='image'?'Изображение':o?.type==='rect'?'Фигура':a?'Artboard':'Перемещение';
  $$('[data-aff-prop]',bar).forEach(el=>{const src=currentProp(el.dataset.affProp);if(src&&document.activeElement!==el)el.value=src.value});
  $('.aff-doc-title16').textContent=p?.name||'Colorize Design';
  const is2d=p?.mode==='2d';bar.classList.toggle('disabled3d',!is2d);$('#affinityTools16')?.classList.toggle('disabled3d',!is2d);
}
function toggleSnap(){ui.snap=!ui.snap;$('#affSnap16')?.classList.toggle('active',ui.snap);if(!ui.snap)hideGuides()}
function toggleGrid(){ui.grid=!ui.grid;$('#affGrid16')?.classList.toggle('active',ui.grid);$('#viewport')?.classList.toggle('aff-grid-off16',!ui.grid)}
function toggleRulers(){ui.rulers=!ui.rulers;$('#affRulers16')?.classList.toggle('hidden',!ui.rulers);drawRulers()}

function snapSelection(force=false){
  if(!ui.snap||(!pointerEditing&&!force))return false;const m=selectedMetrics();if(!m)return false;
  const art=m.art,artRect=art.getBoundingClientRect(),viewRect=$('#viewport').getBoundingClientRect(),zoom=artRect.width/Math.max(1,m.aw),tol=7/Math.max(.05,zoom);
  const peers=$$('.obj',art).filter(n=>n!==m.node);const xTargets=[{v:0,type:'left'},{v:m.aw/2,type:'center'},{v:m.aw,type:'right'}],yTargets=[{v:0,type:'top'},{v:m.ah/2,type:'center'},{v:m.ah,type:'bottom'}];
  for(const n of peers){const x=Number.parseFloat(n.style.left)||0,y=Number.parseFloat(n.style.top)||0,w=Number.parseFloat(n.style.width)||0,h=Number.parseFloat(n.style.height)||0;xTargets.push({v:x,type:'peer'},{v:x+w/2,type:'peer'},{v:x+w,type:'peer'});yTargets.push({v:y,type:'peer'},{v:y+h/2,type:'peer'},{v:y+h,type:'peer'})}
  let bx=null,by=null;const ax=[{v:m.x,off:0},{v:m.x+m.w/2,off:m.w/2},{v:m.x+m.w,off:m.w}],ay=[{v:m.y,off:0},{v:m.y+m.h/2,off:m.h/2},{v:m.y+m.h,off:m.h}];
  for(const s of ax)for(const t of xTargets){const d=Math.abs(s.v-t.v);if(d<=tol&&(!bx||d<bx.d))bx={d,x:t.v-s.off,target:t.v}}
  for(const s of ay)for(const t of yTargets){const d=Math.abs(s.v-t.v);if(d<=tol&&(!by||d<by.d))by={d,y:t.v-s.off,target:t.v}}
  if(bx&&Math.abs(bx.x-m.x)>.001)setProp('x',Number(bx.x.toFixed(2)),{record:false});if(by&&Math.abs(by.y-m.y)>.001)setProp('y',Number(by.y.toFixed(2)),{record:false});
  showGuides(bx?artRect.left-viewRect.left+bx.target*zoom:null,by?artRect.top-viewRect.top+by.target*zoom:null);return !!(bx||by);
}
function showGuides(x,y){const g=$('#smartGuides16');if(!g)return;const v=$('.v',g),h=$('.h',g);if(x!=null){v.hidden=false;v.style.left=`${x}px`}else v.hidden=true;if(y!=null){h.hidden=false;h.style.top=`${y}px`}else h.hidden=true}
function hideGuides(){const g=$('#smartGuides16');if(g)$$('i',g).forEach(x=>x.hidden=true)}

function decorateSelection(){
  const n=$('.artboard.active .obj.selected');if(!n||n.querySelector('.aff-rotate16'))return;const h=document.createElement('button');h.className='aff-rotate16';h.type='button';h.title='Повернуть';h.textContent='●';n.appendChild(h);
  h.addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();captureHistory();const r=n.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,src=currentProp('rotation');rotateDrag={pointer:e.pointerId,cx,cy,startAngle:Math.atan2(e.clientY-cy,e.clientX-cx),rotation:Number(src?.value)||0};h.setPointerCapture?.(e.pointerId)},true);
}
document.addEventListener('pointermove',e=>{if(!rotateDrag||rotateDrag.pointer!==e.pointerId)return;e.preventDefault();const a=Math.atan2(e.clientY-rotateDrag.cy,e.clientX-rotateDrag.cx),deg=rotateDrag.rotation+(a-rotateDrag.startAngle)*180/Math.PI;setProp('rotation',Number(deg.toFixed(1)),{record:false})},true);
document.addEventListener('pointerup',e=>{if(rotateDrag?.pointer===e.pointerId){rotateDrag=null;scheduleCapture()}},true);

function drawRuler(canvas,vertical=false){
  if(!canvas||!ui.rulers)return;const art=$('.artboard.active'),viewport=$('#viewport');if(!art||!viewport)return;const ar=art.getBoundingClientRect(),vr=viewport.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2),cssW=vertical?22:vr.width,cssH=vertical?vr.height:22;canvas.width=Math.round(cssW*d);canvas.height=Math.round(cssH*d);canvas.style.width=cssW+'px';canvas.style.height=cssH+'px';const c=canvas.getContext('2d');c.setTransform(d,0,0,d,0,0);c.clearRect(0,0,cssW,cssH);c.fillStyle='#24272c';c.fillRect(0,0,cssW,cssH);c.strokeStyle='rgba(255,255,255,.26)';c.fillStyle='rgba(255,255,255,.58)';c.lineWidth=1;c.font='9px -apple-system,sans-serif';
  const aw=Number.parseFloat(art.style.width)||1080,ah=Number.parseFloat(art.style.height)||720,zoom=ar.width/Math.max(1,aw);let step=100;if(zoom>.9)step=50;if(zoom>.18&&zoom<.45)step=200;if(zoom<=.18)step=500;const max=vertical?ah:aw;
  for(let v=0;v<=max;v+=step){const pos=(vertical?ar.top-vr.top:ar.left-vr.left)+v*zoom;if(vertical){if(pos<-20||pos>cssH+20)continue;c.beginPath();c.moveTo(14,pos+.5);c.lineTo(22,pos+.5);c.stroke();c.save();c.translate(3,pos+3);c.rotate(-Math.PI/2);c.fillText(String(Math.round(v)),0,0);c.restore()}else{if(pos<-20||pos>cssW+20)continue;c.beginPath();c.moveTo(pos+.5,14);c.lineTo(pos+.5,22);c.stroke();c.fillText(String(Math.round(v)),pos+3,10)}}
}
function drawRulers(){if(!ui.rulers)return;drawRuler($('#affRulerTop16'),false);drawRuler($('#affRulerLeft16'),true)}

window.addEventListener('keydown',e=>{
  const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);const mod=e.metaKey||e.ctrlKey,k=e.key.toLowerCase();
  if(mod&&k==='z'){e.preventDefault();e.shiftKey?redo():undo();return}if(mod&&k==='c'&&!editing){e.preventDefault();copySelected();return}if(mod&&k==='v'&&!editing){e.preventDefault();pasteObject();return}if(mod&&k==='x'&&!editing){e.preventDefault();cutSelected();return}if(mod&&k==='j'&&!editing){e.preventDefault();duplicate();return}if(mod&&e.key==='1'){e.preventDefault();$('#fitBtn')?.click();return}if(mod&&e.key==='0'){e.preventDefault();$('#centerBtn')?.click();return}
  if(editing)return;if(e.code==='Space'&&!ui.spaceHand){e.preventDefault();ui.spaceHand=true;ui.lastTool=$('#panTool')?.classList.contains('active')?'hand':'select';toolClick('hand');return}
  if(e.key==='ArrowLeft'){e.preventDefault();nudge(e.shiftKey?-10:-1,0)}if(e.key==='ArrowRight'){e.preventDefault();nudge(e.shiftKey?10:1,0)}if(e.key==='ArrowUp'){e.preventDefault();nudge(0,e.shiftKey?-10:-1)}if(e.key==='ArrowDown'){e.preventDefault();nudge(0,e.shiftKey?10:1)}
  if(!mod&&k==='v')toolClick('select');if(!mod&&k==='h')toolClick('hand');if(!mod&&k==='t')toolClick('text');if(!mod&&k==='r')toolClick('rect');if(!mod&&k==='a')toolClick('artboard');if(e.key==='Escape'){closeMenu();hideGuides()}
});
window.addEventListener('keyup',e=>{if(e.code==='Space'&&ui.spaceHand){ui.spaceHand=false;toolClick(ui.lastTool==='hand'?'hand':'select')}});

window.__colorizeAffinity16={version:'0.16.0',align,setProp,undo,redo,snapSelection:()=>snapSelection(true),toggleSnap,toggleGrid,toggleRulers,reorderLayer,copySelected,pasteObject,debug:()=>({version:'0.16.0',snap:ui.snap,grid:ui.grid,rulers:ui.rulers,history:history.length,historyIndex,selected:activeData().o?.id||null,context:$('#affContextName16')?.textContent||''})};
window.addEventListener('DOMContentLoaded',()=>{installUI();setTimeout(()=>{installUI();decorateSelection();syncContext(true);drawRulers()},250)});
