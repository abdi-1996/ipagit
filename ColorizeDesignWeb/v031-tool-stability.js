// v0.31.0 — interaction polish for the Affinity-style 2D toolset.
const VERSION='0.31.0';
const STORE='colorize-design-web-v04';
const $=(s,r=document)=>r.querySelector(s);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
let drag=null,hud=null;

function read(){try{return JSON.parse(localStorage.getItem(STORE)||'null')}catch{return null}}
function activeData(p=read()){if(!p)return {p:null,a:null,o:null};const a=p.artboards?.find(x=>x.id===p.activeArtboardId)||p.artboards?.[0]||null;const o=a?.objects?.find(x=>x.id===p.selectedObjectId)||null;return {p,a,o}}
function activeTool(){return $('[data-v030-tool].active')?.dataset.v030Tool||'move'}
function nodeById(id){return id?document.querySelector(`#world .obj[data-object-id="${CSS.escape(id)}"]`):null}
function importProject(p){const raw=JSON.stringify(p);localStorage.setItem(STORE,raw);const input=document.getElementById('importInput');if(!input)return false;try{const f=new File([raw],'colorize-tools31.colorize.json',{type:'application/json'}),dt=new DataTransfer();dt.items.add(f);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true}catch{return false}}
function patchSelected(patch){const p=read(),{a,o}=activeData(p);if(!p||!a||!o)return false;Object.assign(o,patch);p.selectedObjectId=o.id;return importProject(p)}
function showHud(text,x,y){if(!hud){hud=document.createElement('div');hud.id='v031ToolHud';document.body.appendChild(hud)}hud.textContent=text;hud.style.left=`${x+14}px`;hud.style.top=`${y+14}px`;hud.classList.add('show')}
function hideHud(){hud?.classList.remove('show')}
function selectedObjectNodeFromEvent(e){const n=e.target?.closest?.('#world .obj[data-object-id]');return n?.classList.contains('selected')?n:null}
function previewVectorStroke(node,w){node?.querySelectorAll('.v030-vector-svg [stroke-width]').forEach(el=>el.setAttribute('stroke-width',String(Math.max(0,w)*10)))}
function previewCorner(node,r){node?.querySelectorAll('.v030-vector-svg rect').forEach(el=>{el.setAttribute('rx',String(r*10));el.setAttribute('ry',String(r*10))})}
function previewGradient(node,deg){node?.querySelectorAll('.v030-vector-svg linearGradient').forEach(g=>g.setAttribute('gradientTransform',`rotate(${deg} .5 .5)`))}
function previewCrop(node,x,y){const img=$('img',node);if(img){img.style.objectFit='cover';img.style.objectPosition=`${x}% ${y}%`}}
function applyCropPositions(){const p=read();if(!p)return;for(const a of p.artboards||[])for(const o of a.objects||[]){if(o.type!=='image')continue;const n=nodeById(o.id),img=n&&$('img',n);if(!img)continue;img.style.objectFit=o.cropMode?'cover':'contain';img.style.objectPosition=`${clamp(Number(o.cropX??50),0,100)}% ${clamp(Number(o.cropY??50),0,100)}%`}}
function annotateTools(){document.querySelectorAll('[data-v030-tool]').forEach(b=>{b.dataset.v031Capability='working';b.setAttribute('aria-label',b.title||b.dataset.v030Tool)})}

function beginEnhanced(e){
  if(read()?.mode!=='2d'||document.getElementById('colorizeTextEditor31'))return;
  const tool=activeTool();if(!['stroke','contour','corner','transparency','gradient','crop'].includes(tool))return;
  const node=selectedObjectNodeFromEvent(e);if(!node)return;
  const {o}=activeData();if(!o||o.id!==node.dataset.objectId)return;
  if((tool==='stroke'||tool==='contour'||tool==='corner'||tool==='gradient')&&o.type!=='vector')return;
  if(tool==='corner'&&o.vectorKind!=='roundRect'){showHud('Углы: выберите скруглённый прямоугольник',e.clientX,e.clientY);setTimeout(hideHud,1100);return}
  if(tool==='crop'&&o.type!=='image')return;
  e.preventDefault();e.stopImmediatePropagation();
  drag={tool,id:o.id,node,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,startStroke:Number(o.strokeWidth)||0,startCorner:Number(o.cornerRadius)||0,startOpacity:Number(o.opacity??1),startAngle:Number(o.gradientAngle)||0,startCropX:Number(o.cropX??50),startCropY:Number(o.cropY??50),value:null};
  node.setPointerCapture?.(e.pointerId);
  showHud(tool,e.clientX,e.clientY);
}
function moveEnhanced(e){
  const d=drag;if(!d||d.pointer!==e.pointerId)return;
  e.preventDefault();e.stopImmediatePropagation();
  const dx=e.clientX-d.startX,dy=e.clientY-d.startY;
  if(d.tool==='stroke'||d.tool==='contour'){
    const v=clamp(d.startStroke+dx/18,0,20);d.value={strokeWidth:v};previewVectorStroke(d.node,v);showHud(`${d.tool==='contour'?'Контур':'Обводка'} ${v.toFixed(1)}`,e.clientX,e.clientY);
  }else if(d.tool==='corner'){
    const v=clamp(d.startCorner+dx/4,0,50);d.value={cornerRadius:v};previewCorner(d.node,v);showHud(`Угол ${v.toFixed(0)}`,e.clientX,e.clientY);
  }else if(d.tool==='transparency'){
    const v=clamp(d.startOpacity+dx/260,0,1);d.value={opacity:v};d.node.style.opacity=String(v);showHud(`Opacity ${Math.round(v*100)}%`,e.clientX,e.clientY);
  }else if(d.tool==='gradient'){
    const deg=Math.atan2(dy,dx)*180/Math.PI;d.value={gradient:true,gradientAngle:deg};previewGradient(d.node,deg);showHud(`Градиент ${Math.round(deg)}°`,e.clientX,e.clientY);
  }else if(d.tool==='crop'){
    const r=d.node.getBoundingClientRect(),x=clamp(d.startCropX+dx/Math.max(1,r.width)*100,0,100),y=clamp(d.startCropY+dy/Math.max(1,r.height)*100,0,100);d.value={cropMode:true,cropX:x,cropY:y};previewCrop(d.node,x,y);showHud(`Crop ${Math.round(x)} / ${Math.round(y)}`,e.clientX,e.clientY);
  }
}
function endEnhanced(e){const d=drag;if(!d||d.pointer!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();drag=null;hideHud();if(d.value)patchSelected(d.value)}

// Window capture precedes the v0.30 document handler, so enhanced drags don't trigger
// the older one-click actions and don't rebuild the whole world on every pointer move.
window.addEventListener('pointerdown',beginEnhanced,true);
window.addEventListener('pointermove',moveEnhanced,true);
window.addEventListener('pointerup',endEnhanced,true);
window.addEventListener('pointercancel',endEnhanced,true);

const style=document.createElement('style');style.id='v031ToolStyle';style.textContent=`
#v031ToolHud{position:fixed;z-index:10060;pointer-events:none;padding:5px 8px;border-radius:7px;background:rgba(20,23,28,.92);border:1px solid rgba(255,255,255,.16);color:#fff;font:11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;opacity:0;transform:translateY(3px);transition:opacity .1s,transform .1s}#v031ToolHud.show{opacity:1;transform:translateY(0)}
[data-v030-tool][data-v031-capability="working"]{touch-action:manipulation}
`;
document.head.appendChild(style);
annotateTools();applyCropPositions();
const obs=new MutationObserver(()=>{annotateTools();applyCropPositions()});obs.observe(document.getElementById('world')||document.body,{childList:true,subtree:true});
setInterval(applyCropPositions,900);

globalThis.__colorizeTools31Debug=()=>({version:VERSION,tool:activeTool(),toolCount:document.querySelectorAll('[data-v030-tool][data-v031-capability="working"]').length,enhanced:['stroke','contour','corner','transparency','gradient','crop'],dragging:!!drag});
globalThis.__colorizeTools31Patch=patchSelected;
