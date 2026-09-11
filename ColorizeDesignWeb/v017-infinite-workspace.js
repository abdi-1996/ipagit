const STORE='colorize-design-web-v04';
const UNIT=10; // internal design units per centimetre
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const num=v=>Number.parseFloat(v)||0;
const cm=v=>Number((num(v)/UNIT).toFixed(2));
let autoGuard=false;
let lastAutoSignature='';
let lastSelection='';
let refreshTimer=0;

function readProject(){try{return JSON.parse(localStorage.getItem(STORE)||'null')}catch{return null}}
function selectedData(){
  const p=readProject();if(!p)return {p:null,a:null,o:null};
  const a=p.artboards?.find(x=>x.id===p.activeArtboardId)||p.artboards?.[0]||null;
  const o=a?.objects?.find(x=>x.id===p.selectedObjectId)||null;
  return {p,a,o};
}
function rawInput(key){return $(`#properties [data-prop="${key}"]`)}
function setRaw(key,value){
  const el=rawInput(key);if(!el)return false;
  el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));return true;
}
function setTextValue(value){const el=rawInput('text');if(!el)return false;el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));return true}

function domMetrics(){
  const node=$('.artboard.active .obj.selected'),art=node?.closest('.artboard');if(!node||!art)return null;
  const ax=num(art.style.left),ay=num(art.style.top),x=num(node.style.left),y=num(node.style.top),w=num(node.style.width),h=num(node.style.height);
  return {node,art,ax,ay,x,y,w,h,xCm:(ax+x)/UNIT,yCm:(ay+y)/UNIT,wCm:w/UNIT,hCm:h/UNIT,rotation:num(rawInput('rotation')?.value)};
}
function setCmProp(key,value){
  const m=domMetrics();if(!m)return false;const v=Number(value);if(!Number.isFinite(v))return false;
  if(key==='x')setRaw('x',v*UNIT-m.ax);
  else if(key==='y')setRaw('y',v*UNIT-m.ay);
  else if(key==='w')setRaw('w',Math.max(.1,v*UNIT));
  else if(key==='h'){setRaw('h',Math.max(.1,v*UNIT));setTimeout(()=>autoSizeSelectedText(true),0)}
  else if(key==='rotation')setRaw('rotation',v);
  else if(key==='tracking'){setRaw('letterSpacing',v*UNIT);setTimeout(()=>autoSizeSelectedText(true),0)}
  else return false;
  scheduleRefresh();return true;
}

const measureCanvas=document.createElement('canvas');
const measureCtx=measureCanvas.getContext('2d');
function textMeasure(text,family,weight,fontPx,spacing){
  if(!measureCtx)return {w:Math.max(1,String(text||' ').length*fontPx*.6),h:fontPx*.75};
  const lines=String(text??'').split('\n');const safe=lines.length?lines:[' '];
  measureCtx.font=`${weight||700} ${fontPx}px ${family||'Arial'}`;
  let maxW=1,maxGlyph=.72*fontPx;
  for(const line0 of safe){const line=line0||' ';const mt=measureCtx.measureText(line);const glyph=(mt.actualBoundingBoxAscent||fontPx*.72)+(mt.actualBoundingBoxDescent||fontPx*.2);maxGlyph=Math.max(maxGlyph,glyph);maxW=Math.max(maxW,mt.width+Math.max(0,line.length-1)*spacing)}
  return {w:maxW,h:maxGlyph*Math.max(1,safe.length)};
}
function autoSizeSelectedText(force=false){
  if(autoGuard)return false;const m=domMetrics();if(!m||!m.node.classList.contains('text'))return false;
  const cs=getComputedStyle(m.node),text=m.node.dataset.text||m.node.textContent||' ',family=cs.fontFamily||'Arial',weight=cs.fontWeight||'700',spacing=num(cs.letterSpacing),targetH=Math.max(1,m.h);
  const probe=textMeasure(text,family,weight,100,0),fontSize=Math.max(1,100*targetH/Math.max(1,probe.h));const measured=textMeasure(text,family,weight,fontSize,spacing);
  const signature=[m.node.dataset.objectId,text,family,weight,spacing.toFixed(3),targetH.toFixed(3)].join('|');if(!force&&signature===lastAutoSignature)return false;lastAutoSignature=signature;
  const desiredW=Math.max(1,measured.w),currentFont=num(rawInput('fontSize')?.value);
  if(Math.abs(desiredW-m.w)<.12&&Math.abs(currentFont-fontSize)<.12)return false;
  autoGuard=true;
  try{if(Math.abs(currentFont-fontSize)>=.12)setRaw('fontSize',Number(fontSize.toFixed(3)));if(Math.abs(desiredW-m.w)>=.12)setRaw('w',Number(desiredW.toFixed(3)))}finally{setTimeout(()=>{autoGuard=false;scheduleRefresh()},0)}
  return true;
}

function contextMarkup(){return `
  <div class="aff-context-tool16"><b id="affContextName16">Рабочая область</b></div>
  <div class="aff-context-fields16" id="affTransformFields16">
    <label>X <input data-v17-prop="x" type="number" step="0.1"><em>см</em></label>
    <label>Y <input data-v17-prop="y" type="number" step="0.1"><em>см</em></label>
    <label id="v17WLabel">W <input data-v17-prop="w" type="number" min="0.1" step="0.1"><em>см</em></label>
    <label id="v17HLabel">H <input data-v17-prop="h" type="number" min="0.1" step="0.1"><em>см</em></label>
    <label>↻ <input data-v17-prop="rotation" type="number" step="1"><em>°</em></label>
  </div>
  <div class="aff-sep16"></div><div class="aff-align16"></div>
  <div id="affTextFields16" class="aff-text-fields16" hidden>
    <label>Межбукв. <input data-v17-prop="tracking" type="number" step="0.1"><em>см</em></label>
    <label class="aff-color16">Цвет <input data-v17-color="faceColor" type="color"></label>
  </div>
  <div class="aff-context-spacer16"></div>
  <button id="affSnap16" class="aff-toggle16 active" title="Привязка">🧲 <span>Привязка</span></button>
  <button id="affGrid16" class="aff-toggle16 active" title="Сетка 1 см">#</button>`}

function installContext(){
  const bar=$('#affinityContext16');if(!bar)return;bar.innerHTML=contextMarkup();bar.classList.add('infinite-context17');
  bar.addEventListener('change',onContextInput);bar.addEventListener('input',onContextInput);
}
function onContextInput(e){
  const k=e.target.dataset.v17Prop;if(k){setCmProp(k,e.target.value);return}
  const c=e.target.dataset.v17Color;if(c)setRaw(c,e.target.value);
}

function decorateProperties(){
  const props=$('#properties');if(!props)return;const {o}=selectedData();
  $$('.prop-section',props).forEach(s=>s.classList.remove('legacy-position17','legacy-artboard17'));
  const pos=rawInput('x')?.closest('.prop-section');if(pos)pos.classList.add('legacy-position17');
  const art=rawInput('art_w')?.closest('.prop-section');if(art)art.classList.add('legacy-artboard17');
  for(const key of ['fontSize','letterSpacing'])rawInput(key)?.closest('.prop-row')?.classList.add('legacy-text-size17');
  let sec=$('#v17MeasureSection',props);
  if(!o){if(sec)sec.remove();if(art&&!$('#v17InfiniteNote',props)){const n=document.createElement('div');n.id='v17InfiniteNote';n.className='v17-infinite-note';n.innerHTML='<b>Бесконечная рабочая область</b><span>Размера страницы нет. Создавайте объекты и задавайте им реальные размеры в сантиметрах.</span>';props.prepend(n)}return}
  $('#v17InfiniteNote',props)?.remove();const m=domMetrics();if(!m)return;
  if(!sec){sec=document.createElement('div');sec.id='v17MeasureSection';sec.className='prop-section v17-measure-section';props.prepend(sec)}
  const isText=o.type==='text';sec.innerHTML=`<h4>${isText?'Размер надписи':'Размер объекта'} · см</h4>
    <div class="v17-grid"><label>X<input data-v17-panel="x" type="number" step="0.1"></label><label>Y<input data-v17-panel="y" type="number" step="0.1"></label>
    <label>${isText?'Ширина авто':'Ширина'}<input data-v17-panel="w" type="number" step="0.1" ${isText?'readonly':''}></label><label>${isText?'Высота букв':'Высота'}<input data-v17-panel="h" type="number" min="0.1" step="0.1"></label></div>
    ${isText?'<div class="v17-auto-note">Ширина рассчитывается автоматически по тексту, шрифту и межбуквенному интервалу.</div>':''}`;
  const vals={x:m.xCm,y:m.yCm,w:m.wCm,h:m.hCm};$$('[data-v17-panel]',sec).forEach(el=>el.value=Number(vals[el.dataset.v17Panel].toFixed(2)));
  sec.oninput=e=>{const key=e.target.dataset.v17Panel;if(key&&!e.target.readOnly)setCmProp(key,e.target.value)};
}

function refreshContext(){
  const {o}=selectedData(),bar=$('#affinityContext16');if(!bar)return;const m=domMetrics();
  $('#affContextName16').textContent=o?.type==='text'?'Текст · реальные размеры':o?.type==='rect'?'Фигура · реальные размеры':o?.type==='image'?'Изображение · реальные размеры':'Бесконечная область';
  $('#affTransformFields16').style.display=o&&m?'flex':'none';$('.aff-align16',bar).style.display='none';$('.aff-sep16',bar).style.display=o?'block':'none';$('#affTextFields16').hidden=o?.type!=='text';
  if(o&&m){const vals={x:m.xCm,y:m.yCm,w:m.wCm,h:m.hCm,rotation:m.rotation};$$('[data-v17-prop]',bar).forEach(el=>{if(document.activeElement!==el){const v=el.dataset.v17Prop==='tracking'?num(rawInput('letterSpacing')?.value)/UNIT:vals[el.dataset.v17Prop];el.value=Number((v||0).toFixed(2))}});const wi=$('[data-v17-prop="w"]',bar);if(wi)wi.readOnly=o.type==='text';const hl=$('#v17HLabel');if(hl)hl.firstChild.textContent=o.type==='text'?'Высота ': 'H ';const col=$('[data-v17-color="faceColor"]',bar);if(col&&rawInput('faceColor')&&document.activeElement!==col)col.value=rawInput('faceColor').value}
  const badge=$('#modeBadge');if(badge&&readProject()?.mode==='2d')badge.textContent='Бесконечная область · см';
}

function installRulers(){
  $('#affRulers16')?.classList.add('v17-hide-old-rulers');const viewport=$('#viewport');if(!viewport||$('#infiniteRulers17'))return;
  const r=document.createElement('div');r.id='infiniteRulers17';r.className='v17-rulers';r.innerHTML='<canvas id="v17RulerTop"></canvas><canvas id="v17RulerLeft"></canvas><i></i>';viewport.appendChild(r)
}
function viewTransform(){
  const w=$('#world'),t=w?.style.transform||'';let m=t.match(/translate\(([-+\d.e]+)px,\s*([-+\d.e]+)px\)\s*scale\(([-+\d.e]+)\)/);if(m)return {x:Number(m[1]),y:Number(m[2]),zoom:Number(m[3])||1};
  const p=readProject();return {x:num(p?.view?.x),y:num(p?.view?.y),zoom:num(p?.view?.zoom)||1}
}
function rulerStep(zoom){const px=UNIT*zoom;if(px>=18)return 1;if(px*5>=18)return 5;if(px*10>=18)return 10;if(px*50>=18)return 50;return 100}
function drawAxis(canvas,vertical=false){
  const viewport=$('#viewport');if(!canvas||!viewport)return;const rect=viewport.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2),cw=vertical?24:rect.width,ch=vertical?rect.height:24;canvas.width=Math.max(1,Math.round(cw*d));canvas.height=Math.max(1,Math.round(ch*d));canvas.style.width=cw+'px';canvas.style.height=ch+'px';const c=canvas.getContext('2d');c.setTransform(d,0,0,d,0,0);c.clearRect(0,0,cw,ch);c.fillStyle='#f4f4f4';c.fillRect(0,0,cw,ch);c.strokeStyle='#b8bcc2';c.fillStyle='#555b63';c.font='9px -apple-system,sans-serif';c.lineWidth=1;
  const v=viewTransform(),step=rulerStep(v.zoom),screenLength=vertical?rect.height:rect.width,offset=vertical?v.y:v.x,worldStart=(0-offset)/v.zoom/UNIT,worldEnd=(screenLength-offset)/v.zoom/UNIT,start=Math.floor(Math.min(worldStart,worldEnd)/step)*step,end=Math.ceil(Math.max(worldStart,worldEnd)/step)*step;
  for(let value=start;value<=end;value+=step){const pos=offset+value*UNIT*v.zoom;if(pos<-30||pos>screenLength+30)continue;const major=Math.abs(value%(step*5))<.0001;if(vertical){c.beginPath();c.moveTo(major?8:15,pos+.5);c.lineTo(24,pos+.5);c.stroke();if(major){c.save();c.translate(3,pos-3);c.rotate(-Math.PI/2);c.fillText(String(Number(value.toFixed(1))),0,0);c.restore()}}else{c.beginPath();c.moveTo(pos+.5,major?8:15);c.lineTo(pos+.5,24);c.stroke();if(major)c.fillText(String(Number(value.toFixed(1))),pos+3,9)}}
}
function drawRulers(){drawAxis($('#v17RulerTop'));drawAxis($('#v17RulerLeft'),true);updateGrid()}
function updateGrid(){
  const grid=$('.viewport-grid');if(!grid)return;const v=viewTransform(),step=rulerStep(v.zoom),px=Math.max(4,step*UNIT*v.zoom);grid.style.backgroundSize=`${px}px ${px}px`;grid.style.backgroundPosition=`${v.x}px ${v.y}px`;
}

function updatePointerCoordinates(e){
  const v=$('#viewport'),out=$('#coordStatus');if(!v||!out||readProject()?.mode!=='2d')return;const r=v.getBoundingClientRect(),t=viewTransform(),x=(e.clientX-r.left-t.x)/t.zoom/UNIT,y=(e.clientY-r.top-t.y)/t.zoom/UNIT;out.textContent=`X ${x.toFixed(1)} см · Y ${y.toFixed(1)} см`;
}
function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refreshAll(false),30)}
function refreshAll(force=false){
  const {o}=selectedData(),id=o?.id||'';if(force||id!==lastSelection){lastSelection=id;lastAutoSignature=''}
  if(o?.type==='text')autoSizeSelectedText(force);refreshContext();decorateProperties();drawRulers();
}

function cleanArtboardUI(){
  $('.panel-tab[data-panel="artboards"]')?.setAttribute('hidden','');$('#panel-artboards')?.setAttribute('hidden','');$('#addArtboardBtn')?.setAttribute('hidden','');$('[data-aff-tool="artboard"]')?.setAttribute('hidden','');
  const studio=$('.aff-studio-label16 span');if(studio)studio.textContent='Слои · Свойства';const fit=$('#fitBtn');if(fit)fit.textContent='Вписать объекты';
}
function repositionNewSelection(){
  const m=domMetrics(),p=readProject();if(!m||!p)return;const v=$('#viewport')?.getBoundingClientRect(),t=viewTransform();if(!v)return;const cx=(v.width/2-t.x)/t.zoom,cy=(v.height/2-t.y)/t.zoom;setRaw('x',cx-m.ax-m.w/2);setRaw('y',cy-m.ay-m.h/2);setTimeout(()=>autoSizeSelectedText(true),10)
}
function bind(){
  const viewport=$('#viewport');viewport?.addEventListener('pointermove',e=>{updatePointerCoordinates(e);requestAnimationFrame(drawRulers)},{passive:true});viewport?.addEventListener('wheel',()=>requestAnimationFrame(drawRulers),{passive:true});window.addEventListener('resize',drawRulers,{passive:true});
  document.addEventListener('click',e=>{const add=e.target.closest('#addTextBtn,#addRectBtn');if(add)setTimeout(()=>{repositionNewSelection();refreshAll(true)},40);if(e.target.closest('.mode,.list-row,[data-object-id]'))setTimeout(()=>refreshAll(true),30)},true);
  document.addEventListener('input',e=>{if(e.target.closest('#properties'))setTimeout(()=>refreshAll(false),0)},true);
  const world=$('#world');if(world)new MutationObserver(()=>scheduleRefresh()).observe(world,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','data-text']});
  setInterval(()=>refreshAll(false),450);
}
function install(){
  document.body.classList.add('infinite-v017');const ver=$('.brand span');if(ver)ver.textContent='Web v0.17.1';installContext();installRulers();cleanArtboardUI();bind();setTimeout(()=>refreshAll(true),100);setTimeout(()=>refreshAll(true),650)
}

window.__colorizeInfinite17={
  debug:()=>{const m=domMetrics(),{o}=selectedData();return {version:'0.17.1',unit:'cm',unitsPerCm:UNIT,infinite:true,white:getComputedStyle($('#viewport')).backgroundColor,selectedType:o?.type||null,metrics:m?{xCm:m.xCm,yCm:m.yCm,wCm:m.wCm,hCm:m.hCm}:null,textAuto:o?.type==='text'}},
  setCm:setCmProp,setText:setTextValue,autoText:()=>autoSizeSelectedText(true),refresh:()=>refreshAll(true)
};

if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
