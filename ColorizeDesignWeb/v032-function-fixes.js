// v0.32.0 — correctness fixes found by the full 2D function audit.
const VERSION='0.32.0';
const STORE='colorize-design-web-v04';
const UNIT=10;
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
let contourDrag=null,originDrag=null,lastArea=null,decoratePending=false;

function read(){try{return JSON.parse(localStorage.getItem(STORE)||'null')}catch{return null}}
function activeData(p=read()){if(!p)return {p:null,a:null,o:null};const a=p.artboards?.find(x=>x.id===p.activeArtboardId)||p.artboards?.[0]||null;const o=a?.objects?.find(x=>x.id===p.selectedObjectId)||null;return {p,a,o}}
function tool(){return $('[data-v030-tool].active')?.dataset.v030Tool||'move'}
function node(id){return id?$(`#world .obj[data-object-id="${CSS.escape(id)}"]`):null}
function importProject(p){const raw=JSON.stringify(p);localStorage.setItem(STORE,raw);const input=$('#importInput');if(!input)return false;try{const f=new File([raw],'colorize-v032.colorize.json',{type:'application/json'}),dt=new DataTransfer();dt.items.add(f);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true}catch{return false}}
function patch(id,values){const p=read();if(!p)return false;for(const a of p.artboards||[]){const o=a.objects?.find(x=>x.id===id);if(o){Object.assign(o,values);p.selectedObjectId=id;return importProject(p)}}return false}
function toast(text,ms=1700){let n=$('#v032Toast');if(!n){n=document.createElement('div');n.id='v032Toast';document.body.appendChild(n)}n.textContent=text;n.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>n.classList.remove('show'),ms)}

function polyArea(points=[]){let s=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];s+=a[0]*b[1]-b[0]*a[1]}return Math.abs(s)/2}
function regularPoints(n,star=false){const pts=[];for(let i=0;i<n;i++){const a=-Math.PI/2+i*Math.PI*2/n,r=(star&&i%2)?.215:.5;pts.push([.5+Math.cos(a)*r,.5+Math.sin(a)*r])}return pts}
function normalizedArea(o){switch(o.vectorKind){case'ellipse':return Math.PI*.25;case'triangle':return .5;case'diamond':return .5;case'trapezoid':return .78;case'donut':return Math.PI*(.25-.0441);case'pie':return Math.PI*.25*.75;case'polygon':return polyArea(regularPoints(Math.max(3,Number(o.polygonSides)||6)));case'star':return polyArea(regularPoints(Math.max(3,Number(o.starPoints)||5)*2,true));case'arrow':return polyArea([[0,.32],[.6,.32],[.6,0],[1,.5],[.6,1],[.6,.68],[0,.68]]);case'heart':return polyArea([[.5,.94],[.08,.52],[.04,.25],[.2,.07],[.4,.1],[.5,.24],[.6,.1],[.8,.07],[.96,.25],[.92,.52]]);case'path':return o.closed===false?0:polyArea(o.points||[]);default:return 1}}
function areaCm2(o){if(!o)return 0;const box=(Math.max(0,Number(o.w)||0)*Math.max(0,Number(o.h)||0))/(UNIT*UNIT);if(o.type!=='vector')return box;return box*normalizedArea(o)}
function areaAt(e){const n=e.target?.closest?.('#world .obj[data-object-id]');if(!n)return false;const p=read(),a=p?.artboards?.find(x=>x.id===p.activeArtboardId)||p?.artboards?.[0],o=a?.objects?.find(x=>x.id===n.dataset.objectId);if(!o)return false;const value=areaCm2(o);lastArea={id:o.id,type:o.type,kind:o.vectorKind||o.type,value};toast(value?`Площадь: ${value.toFixed(2)} см²`:'Площадь открытой кривой: 0 см²',2200);return true}

function contourLayer(n,o){let layer=$('.v032-contour-layer',n);const w=Math.max(0,Number(o.contourWidth)||0);if(o.type!=='vector'||w<=0){layer?.remove();return}const source=$('.v030-vector-svg',n);if(!source)return;if(!layer){layer=document.createElement('div');layer.className='v032-contour-layer';n.prepend(layer)}const sig=JSON.stringify([w,o.contourColor,o.fill,o.stroke,o.vectorKind,o.points,o.children]);if(layer.dataset.sig===sig)return;layer.dataset.sig=sig;const svg=source.cloneNode(true);svg.removeAttribute('class');svg.classList.add('v032-contour-svg');const color=o.contourColor||o.stroke||o.fill||'#111827';svg.querySelectorAll('rect,ellipse,path,polygon,polyline').forEach(s=>{if(s.closest('defs'))return;s.setAttribute('fill','none');s.setAttribute('stroke',color);s.setAttribute('stroke-width',String(w*20));s.setAttribute('stroke-linejoin','round');s.setAttribute('stroke-linecap','round')});layer.replaceChildren(svg)}
function decorateContours(){const p=read();if(!p)return;for(const a of p.artboards||[])for(const o of a.objects||[]){const n=node(o.id);if(n)contourLayer(n,o)}}
function previewContour(n,w,o){contourLayer(n,{...o,contourWidth:w})}
function startContour(e){if(tool()!=='contour'||read()?.mode!=='2d'||$('#colorizeTextEditor31'))return false;const n=e.target?.closest?.('#world .obj.vector.selected[data-object-id]');if(!n)return false;const {o}=activeData();if(!o||o.id!==n.dataset.objectId)return false;e.preventDefault();e.stopImmediatePropagation();contourDrag={id:o.id,node:n,pointer:e.pointerId,startX:e.clientX,start:Number(o.contourWidth)||0,o};n.setPointerCapture?.(e.pointerId);toast('Контур: тяните вправо/влево',900);return true}
function moveContour(e){const d=contourDrag;if(!d||d.pointer!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();const w=clamp(d.start+(e.clientX-d.startX)/18,0,20);d.value=w;previewContour(d.node,w,d.o)}
function endContour(e){const d=contourDrag;if(!d||d.pointer!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();contourDrag=null;if(d.value!=null)patch(d.id,{contourWidth:d.value,contourColor:d.o.contourColor||d.o.stroke||d.o.fill||'#111827'})}

function decorateOriginAny(){
  const {o}=activeData(),active=tool()==='point'&&o&&o.type!=='vector',host=active?node(o.id):null;
  $$('.v032-origin').forEach(h=>{if(!host||h.parentElement!==host)h.remove()});
  if(!host)return;
  const x=clamp(o.originX??.5,0,1),y=clamp(o.originY??.5,0,1);host.style.transformOrigin=`${x*100}% ${y*100}%`;
  let h=$('.v032-origin',host);if(!h){h=document.createElement('button');h.className='v032-origin';h.title='Центр трансформации';host.appendChild(h)}
  h.style.left=`${x*100}%`;h.style.top=`${y*100}%`;
}
function startOrigin(e){const h=e.target?.closest?.('.v032-origin');if(!h||tool()!=='point')return false;const n=h.closest('.obj[data-object-id]');if(!n)return false;e.preventDefault();e.stopImmediatePropagation();originDrag={id:n.dataset.objectId,node:n,h,pointer:e.pointerId};h.setPointerCapture?.(e.pointerId);return true}
function moveOrigin(e){const d=originDrag;if(!d||d.pointer!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();const r=d.node.getBoundingClientRect(),x=clamp((e.clientX-r.left)/Math.max(1,r.width),0,1),y=clamp((e.clientY-r.top)/Math.max(1,r.height),0,1);d.xy=[x,y];d.h.style.left=x*100+'%';d.h.style.top=y*100+'%';d.node.style.transformOrigin=`${x*100}% ${y*100}%`}
function endOrigin(e){const d=originDrag;if(!d||d.pointer!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();originDrag=null;if(d.xy)patch(d.id,{originX:d.xy[0],originY:d.xy[1]})}

window.addEventListener('pointerdown',e=>{if(startOrigin(e))return;if(tool()==='area'&&areaAt(e)){e.preventDefault();e.stopImmediatePropagation();return}startContour(e)},true);
window.addEventListener('pointermove',e=>{if(originDrag)moveOrigin(e);else moveContour(e)},true);
window.addEventListener('pointerup',e=>{if(originDrag)endOrigin(e);else endContour(e)},true);
window.addEventListener('pointercancel',e=>{if(originDrag)endOrigin(e);else endContour(e)},true);

const style=document.createElement('style');style.id='v032FixStyle';style.textContent=`
.v032-contour-layer{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:visible}.v032-contour-layer svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.obj.vector>.v030-render{position:relative;z-index:1}.v032-origin{position:absolute;z-index:40;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid #fff;border-radius:50%;background:#ff375f;box-shadow:0 0 0 2px #111;touch-action:none}.v032-origin:after{content:'';position:absolute;inset:5px;border-radius:50%;background:#fff}#v032Toast{position:fixed;left:50%;bottom:64px;z-index:11000;transform:translate(-50%,8px);padding:7px 11px;border-radius:8px;background:rgba(19,22,27,.94);color:#fff;font:11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;opacity:0;pointer-events:none;transition:.15s}#v032Toast.show{opacity:1;transform:translate(-50%,0)}
`;
document.head.appendChild(style);
function decorate(){decoratePending=false;decorateContours();decorateOriginAny()}
function scheduleDecorate(){if(decoratePending)return;decoratePending=true;requestAnimationFrame(decorate)}
decorate();new MutationObserver(scheduleDecorate).observe($('#world')||document.body,{childList:true,subtree:true});setInterval(scheduleDecorate,750);

globalThis.__colorize32Area=id=>{const p=read();for(const a of p?.artboards||[]){const o=a.objects?.find(x=>x.id===id);if(o)return areaCm2(o)}return 0};
globalThis.__colorize32Patch=(id,values)=>patch(id,values);
globalThis.__colorize32Select=id=>{const p=read();if(!p)return false;for(const a of p.artboards||[])if(a.objects?.some(o=>o.id===id)){p.activeArtboardId=a.id;p.selectedObjectId=id;return importProject(p)}return false};
globalThis.__colorize32Debug=()=>({version:VERSION,tool:tool(),contourDragging:!!contourDrag,originDragging:!!originDrag,lastArea,contours:$$('.v032-contour-layer').length,originAny:!!$('.v032-origin')});
