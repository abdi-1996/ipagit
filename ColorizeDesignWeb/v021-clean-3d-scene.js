import * as THREE from 'three';

// v0.21.0 — clean 3D scene.
// In 3D mode the editor grid and default wall/floor are hidden. The wall/shadow
// catcher becomes visible only after a facade has actually been added through
// Facade Scan. Sign back meshes remain untouched.
const STORE_KEYS=['colorize-design-web-v04','colorize-design-web-v03','colorize-design-web-v02','colorize-design-web-v01'];
const FACADE_KEY='colorize-facade-3d-v021';
const UNIT=50;
const CLEAN_BG=new THREE.Color('#17191d');
let debug={version:'0.21.0',facade:false,gridHidden:false,wallsDetected:0,wallsVisible:0,catchersDetected:0,catchersVisible:0,floorsDetected:0,floorsVisible:0,gridHelpersHidden:0,lastSync:0,source:null};

function readProject(){
  for(const k of STORE_KEYS){try{const raw=localStorage.getItem(k);if(raw)return JSON.parse(raw)}catch{}}
  return null;
}
function activeArtboard(p){return p?.artboards?.find(a=>a.id===p.activeArtboardId)||p?.artboards?.[0]||null}
function readFacade(){try{return {enabled:false,...JSON.parse(localStorage.getItem(FACADE_KEY)||'{}')}}catch{return {enabled:false}}}
function setFacade(enabled,source='manual'){
  try{localStorage.setItem(FACADE_KEY,JSON.stringify({enabled:!!enabled,source,at:Date.now()}))}catch{}
  debug.facade=!!enabled;debug.source=source;
  window.dispatchEvent(new CustomEvent('colorize-facade-3d-change',{detail:{enabled:!!enabled,source}}));
}
function hasProjectImage(){
  const p=readProject(),a=activeArtboard(p);return !!(a?.objects||[]).find(o=>o?.type==='image'&&o.src);
}
function near(a,b,eps=.035){return Math.abs(Number(a||0)-Number(b||0))<=eps*Math.max(1,Math.abs(Number(b||0)))}
function classifySurface(o,a){
  if(!o?.isMesh||o.geometry?.type!=='PlaneGeometry'||!a)return null;
  const par=o.geometry.parameters||{},w=Number(par.width)||0,h=Number(par.height)||0;
  const wallW=a.w/UNIT,wallH=a.h/UNIT;
  const isWallSize=near(w,wallW)&&near(h,wallH);
  const isFloorSize=near(w,wallW*2.5)&&near(h,wallH*2.2);
  const rx=Math.abs(Number(o.rotation?.x)||0),z=Number(o.position?.z)||0;
  if(isFloorSize&&Math.abs(rx-Math.PI/2)<.08)return 'floor';
  if(isWallSize){
    if(o.material?.isShadowMaterial||o.material?.type==='ShadowMaterial')return 'catcher';
    if(rx<.08&&Math.abs(z)<.08)return 'wall';
  }
  return null;
}
function applyObjectVisibility(o){
  const p=readProject(),a=activeArtboard(p);if(!a)return;
  if(o?.isGridHelper||o?.type==='GridHelper'){o.visible=false;o.userData.colorizeCleanGrid21=true;return}
  const kind=classifySurface(o,a);if(!kind)return;
  o.userData.colorizeSceneSurface21=kind;
  const facade=readFacade().enabled===true;
  if(kind==='floor')o.visible=false;
  else o.visible=facade;
}

// Hide newly-created wall/catcher/floor before its first frame so there is no flash.
const previousAdd=THREE.Object3D.prototype.add;
THREE.Object3D.prototype.add=function(...objects){
  const result=previousAdd.apply(this,objects);
  for(const o of objects){try{applyObjectVisibility(o)}catch{}}
  return result;
};

function syncViewport(){
  const host=document.getElementById('threeHost'),viewport=document.getElementById('viewport');
  const active=!!host&&!host.hidden;
  viewport?.classList.toggle('colorize-clean-3d-21',active);
  debug.gridHidden=active&&getComputedStyle(document.querySelector('.viewport-grid')||document.documentElement).display==='none';
}
function syncScene(scene){
  const p=readProject(),a=activeArtboard(p);if(!scene||!a)return;
  const facade=readFacade().enabled===true;
  let walls=0,wallsVisible=0,catchers=0,catchersVisible=0,floors=0,floorsVisible=0,grids=0;
  scene.traverse?.(o=>{
    if(o?.isGridHelper||o?.type==='GridHelper'){
      o.visible=false;o.userData.colorizeCleanGrid21=true;grids++;return;
    }
    const kind=o.userData?.colorizeSceneSurface21||classifySurface(o,a);if(!kind)return;
    o.userData.colorizeSceneSurface21=kind;
    if(kind==='wall'){walls++;o.visible=facade;if(o.visible)wallsVisible++}
    else if(kind==='catcher'){catchers++;o.visible=facade;if(o.visible)catchersVisible++}
    else if(kind==='floor'){floors++;o.visible=false;if(o.visible)floorsVisible++}
  });
  scene.background=CLEAN_BG;
  syncViewport();
  debug={...debug,facade,source:readFacade().source||debug.source,wallsDetected:walls,wallsVisible,catchersDetected:catchers,catchersVisible,floorsDetected:floors,floorsVisible,gridHelpersHidden:grids,lastSync:performance.now()};
}

const previousBefore=globalThis.__colorizeBeforeThreeRender;
globalThis.__colorizeBeforeThreeRender=(renderer,scene,camera)=>{previousBefore?.(renderer,scene,camera);syncScene(scene)};

function installStyle(){
  if(document.getElementById('clean3dStyle21'))return;
  const s=document.createElement('style');s.id='clean3dStyle21';
  s.textContent=`.viewport.colorize-clean-3d-21 .viewport-grid{display:none!important}.viewport.colorize-clean-3d-21{background:#17191d}.viewport.colorize-clean-3d-21 .three-host{background:#17191d}`;
  document.head.appendChild(s);
}
function syncFacadeFromUI(){
  const info=document.getElementById('facadeInfo');
  const text=info?.textContent||'';
  if(/Фото загружено|Плоскость фасада|Автоанализ/i.test(text))setFacade(true,'facade-scan');
}
function addRemoveButton(){
  const actions=document.querySelector('.facade-scan-actions');if(!actions||document.getElementById('facadeRemove3D21'))return;
  const b=document.createElement('button');b.id='facadeRemove3D21';b.textContent='Убрать фасад';
  b.addEventListener('click',()=>setFacade(false,'remove'));
  actions.appendChild(b);
}
function installUIHooks(){
  installStyle();syncViewport();addRemoveButton();syncFacadeFromUI();
  document.addEventListener('change',e=>{if(e.target?.id==='facadeFile'&&e.target.files?.length)setFacade(true,'facade-file')},true);
  document.addEventListener('click',e=>{
    if(e.target?.closest?.('#facadeUseProject'))setTimeout(()=>{if(hasProjectImage())setFacade(true,'project-image')},0);
    if(e.target?.closest?.('#newProjectBtn'))setTimeout(()=>{const p=readProject();if(p?.name==='Новый проект')setFacade(false,'new-project')},100);
  },true);
  const obs=new MutationObserver(()=>{addRemoveButton();syncViewport();syncFacadeFromUI()});obs.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class','style']});
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',installUIHooks,{once:true});else installUIHooks();

globalThis.__colorizeSetFacade21=(enabled,source='debug')=>setFacade(enabled,source);
globalThis.__colorizeClean3D21Debug=()=>structuredClone(debug);
