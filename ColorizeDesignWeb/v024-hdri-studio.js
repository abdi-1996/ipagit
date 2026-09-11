import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

// v0.24 — HDRI Studio.
// Adds real .HDR/.EXR import, IndexedDB persistence, Maya-style viewport
// rotation, background controls and live environment/reflection tuning.
const VERSION='0.24.0';
const KEY='colorize-hdri-studio-v024';
const LIGHT_KEY='colorize-lighting-v013';
const DB_NAME='colorize-hdri-v024';
const DB_STORE='files';
const DB_KEY='current';
const DEFAULTS={
  customActive:false,
  fileName:'',
  tilt:0,
  background:false,
  backgroundIntensity:1,
  backgroundBlur:0,
  reflections:1,
  fineSpeed:.12,
  normalSpeed:.38
};

let state=loadState();
let renderer=null,scene=null,camera=null;
let customEnv=null;
let loading=false,loadToken=0;
let hdriMode=false;
let drag=null;
let lastCanvas=null;
let dbPromise=null;
let debug={version:VERSION,mode:false,rotation:readLighting().hdr?.rotation||0,tilt:state.tilt,background:state.background,customLoaded:false,fileName:state.fileName||'',applied:0,lastApply:0,lastImport:'',lastError:''};

function loadState(){
  try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...DEFAULTS}}
}
function saveState(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}}
function readLighting(){
  const base={mode:'main',hdr:{intensity:1.25,rotation:0,exposure:1.05}};
  try{
    const x=JSON.parse(localStorage.getItem(LIGHT_KEY)||'{}');
    return {...base,...x,hdr:{...base.hdr,...(x.hdr||{})}};
  }catch{return base}
}
function writeLighting(next){
  try{localStorage.setItem(LIGHT_KEY,JSON.stringify(next))}catch{}
}
function clamp(v,a,b){return Math.max(a,Math.min(b,Number(v)||0))}
function normDeg(v){let x=Number(v)||0;while(x>180)x-=360;while(x<-180)x+=360;return x}
function isHdrMode(){return readLighting().mode==='hdr'||document.querySelector('[data-light-mode="hdr"]')?.classList.contains('active')}
function setLightingModeHdr(){
  const btn=document.querySelector('[data-light-mode="hdr"]');
  if(btn&&!btn.classList.contains('active'))btn.click();
  else{
    const s=readLighting();if(s.mode!=='hdr'){s.mode='hdr';writeLighting(s)}
  }
}
function setLegacyRange(id,value){
  const el=document.getElementById(id);
  if(el){el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));return}
  const s=readLighting();s.mode='hdr';
  if(id==='hdrRotation')s.hdr.rotation=value;
  if(id==='hdrIntensity')s.hdr.intensity=value;
  if(id==='hdrExposure')s.hdr.exposure=value;
  writeLighting(s);
}
function currentRotation(){return Number(readLighting().hdr?.rotation)||0}
function currentIntensity(){return Math.max(0,Number(readLighting().hdr?.intensity)||0)}
function currentExposure(){return Math.max(.1,Number(readLighting().hdr?.exposure)||1)}

function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){resolve(null);return}
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE)};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  }).catch(()=>null);
  return dbPromise;
}
async function saveBlob(file){
  const db=await openDb();if(!db)return;
  await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(file,DB_KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)}).catch(()=>{});
}
async function loadBlob(){
  const db=await openDb();if(!db)return null;
  return await new Promise(resolve=>{const tx=db.transaction(DB_STORE,'readonly');const r=tx.objectStore(DB_STORE).get(DB_KEY);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>resolve(null)});
}
async function deleteBlob(){
  const db=await openDb();if(!db)return;
  await new Promise(resolve=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete(DB_KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>resolve()});
}

function disposeCustom(){
  try{customEnv?.target?.dispose?.();customEnv?.source?.dispose?.();if(customEnv?.url)URL.revokeObjectURL(customEnv.url)}catch{}
  customEnv=null;debug.customLoaded=false;
}
async function parseEnvironmentFile(file){
  if(!renderer||!file)return null;
  const token=++loadToken;loading=true;setStatus(`Загрузка ${file.name}…`);
  const name=String(file.name||'').toLowerCase();
  const url=URL.createObjectURL(file);
  try{
    let source;
    if(name.endsWith('.exr'))source=await new EXRLoader().loadAsync(url);
    else source=await new RGBELoader().loadAsync(url);
    source.mapping=THREE.EquirectangularReflectionMapping;
    const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();const target=pmrem.fromEquirectangular(source);pmrem.dispose();
    if(token!==loadToken){target.dispose?.();source.dispose?.();URL.revokeObjectURL(url);return null}
    disposeCustom();customEnv={source,target,url,fileName:file.name};
    state.customActive=true;state.fileName=file.name;saveState();
    debug.customLoaded=true;debug.fileName=file.name;debug.lastImport=file.name;debug.lastError='';
    setLightingModeHdr();setStatus(`${file.name} · HDRI готов`);syncUI();return customEnv;
  }catch(err){
    URL.revokeObjectURL(url);debug.lastError=String(err?.message||err);setStatus('Не удалось прочитать HDRI');return null;
  }finally{if(token===loadToken)loading=false}
}
async function restoreCustom(){
  if(!state.customActive||customEnv||loading||!renderer)return;
  const blob=await loadBlob();if(blob)await parseEnvironmentFile(blob);
  else{state.customActive=false;state.fileName='';saveState();syncUI()}
}
async function importFile(file){
  if(!file)return;
  const lower=String(file.name||'').toLowerCase();
  if(!lower.endsWith('.hdr')&&!lower.endsWith('.exr')){setStatus('Выберите файл .HDR или .EXR');return}
  state.fileName=file.name;state.customActive=true;saveState();await saveBlob(file);
  if(renderer)await parseEnvironmentFile(file);else{debug.fileName=file.name;setStatus(`${file.name} сохранён · откройте 3D`);syncUI()}
}

function tuneMaterials(s){
  const value=clamp(state.reflections,0,3);
  s?.traverse?.(o=>{
    if(!o.isMesh||!o.material)return;
    for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){
      if('envMapIntensity' in m)m.envMapIntensity=value;
    }
  });
}
function applyToScene(r,s){
  if(!r||!s||!isHdrMode())return;
  if(state.customActive&&customEnv?.target?.texture)s.environment=customEnv.target.texture;
  const rot=THREE.MathUtils.degToRad(currentRotation()),tilt=THREE.MathUtils.degToRad(clamp(state.tilt,-85,85));
  if(s.environmentRotation)s.environmentRotation.set(tilt,rot,0);
  s.environmentIntensity=currentIntensity();
  r.toneMappingExposure=currentExposure();
  tuneMaterials(s);
  if(state.background){
    const bg=(state.customActive&&customEnv?.source)?customEnv.source:s.environment;
    if(bg)s.background=bg;
    if(s.backgroundRotation)s.backgroundRotation.set(tilt,rot,0);
    if('backgroundIntensity' in s)s.backgroundIntensity=clamp(state.backgroundIntensity,0,3);
    if('backgroundBlurriness' in s)s.backgroundBlurriness=clamp(state.backgroundBlur,0,1);
  }else s.background=null;
  debug.rotation=currentRotation();debug.tilt=state.tilt;debug.background=state.background;debug.customLoaded=!!customEnv;debug.applied++;debug.lastApply=performance.now();
}

const previousHook=globalThis.__colorizeBeforeThreeRender;
globalThis.__colorizeBeforeThreeRender=(r,s,c)=>{
  previousHook?.(r,s,c);
  const host=document.getElementById('threeHost');
  if(host&&!host.hidden&&r?.domElement&&host.contains(r.domElement)){
    renderer=r;scene=s;camera=c;bindCanvas(r.domElement);if(state.customActive&&!customEnv&&!loading)restoreCustom();applyToScene(r,s);
  }
};

function styleText(){return `
.hdri-studio24{margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.11);border-radius:12px;background:rgba(255,255,255,.035)}
.hdri-studio24 .hdri24-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.hdri24-head strong{font-size:12px}.hdri24-head small{opacity:.58;font-size:10px}
.hdri24-import{display:flex;align-items:center;justify-content:center;min-height:36px;padding:0 10px;border:1px dashed rgba(89,183,255,.55);border-radius:9px;background:rgba(41,132,210,.12);color:#dff2ff;font-size:12px;cursor:pointer}.hdri24-file{margin:7px 2px 9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px;opacity:.72}
.hdri24-row{display:grid;grid-template-columns:1fr minmax(120px,1.3fr) 42px;gap:7px;align-items:center;margin:7px 0;font-size:11px}.hdri24-row input[type=range]{width:100%;min-width:0}.hdri24-row output{text-align:right;font-variant-numeric:tabular-nums;opacity:.8}
.hdri24-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.hdri24-actions button{height:31px;padding:0 9px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:rgba(255,255,255,.07);color:#fff;font-size:11px}.hdri24-actions button.active{background:#1688d8;border-color:#55bfff}
#hdriGizmo24{position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);z-index:45;pointer-events:none;display:none;min-width:138px;padding:9px 12px;border:1px solid rgba(104,194,255,.65);border-radius:999px;background:rgba(9,14,22,.76);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#e9f7ff;text-align:center;font:600 12px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3)}
#threeHost.hdri-drag24 canvas{cursor:ew-resize!important;touch-action:none}.edit3d-tool.hdri24.active{background:#1688d8!important;border-color:#55bfff!important}
@media(max-width:720px){.hdri-studio24{padding:9px}.hdri24-row{grid-template-columns:92px 1fr 40px}.hdri24-import{min-height:40px}}
`;}
function injectPanel(){
  const panel=document.getElementById('lightingPanel');if(!panel||panel.querySelector('.hdri-studio24'))return;
  const hdrPage=panel.querySelector('[data-light-page="hdr"]');if(!hdrPage)return;
  panel.querySelector('.hdr-upload-v013')?.setAttribute('hidden','');
  const style=document.createElement('style');style.textContent=styleText();document.head.appendChild(style);
  const box=document.createElement('div');box.className='hdri-studio24';box.innerHTML=`
    <div class="hdri24-head"><strong>HDRI Studio</strong><small>Maya-style IBL</small></div>
    <label class="hdri24-import">Импорт .HDR / .EXR<input id="hdriUpload24" type="file" accept=".hdr,.exr,image/vnd.radiance,application/octet-stream" hidden></label>
    <div id="hdriFile24" class="hdri24-file">HDRI не импортирован</div>
    <label class="hdri24-row"><span>Наклон</span><input id="hdriTilt24" type="range" min="-85" max="85" step="1"><output>0°</output></label>
    <label class="hdri24-row"><span>Отражения</span><input id="hdriReflect24" type="range" min="0" max="3" step="0.05"><output>1.00</output></label>
    <label class="hdri24-row"><span>Яркость фона</span><input id="hdriBgIntensity24" type="range" min="0" max="3" step="0.05"><output>1.00</output></label>
    <label class="hdri24-row"><span>Blur фона</span><input id="hdriBgBlur24" type="range" min="0" max="1" step="0.01"><output>0.00</output></label>
    <div class="hdri24-actions"><button id="hdriBackground24">Фон OFF</button><button id="hdriReset24">Сброс</button><button id="hdriDelete24">Удалить HDRI</button></div>
    <div id="hdriStatus24" class="hdr-status-v013"></div>`;
  hdrPage.appendChild(box);bindPanel();syncUI();
}
function setStatus(t){const el=document.getElementById('hdriStatus24');if(el)el.textContent=t||''}
function setRange(id,value,digits=2,suffix=''){
  const el=document.getElementById(id);if(!el)return;el.value=String(value);const out=el.parentElement?.querySelector('output');if(out)out.textContent=`${Number(value).toFixed(digits)}${suffix}`;
}
function syncUI(){
  setRange('hdriTilt24',state.tilt,0,'°');setRange('hdriReflect24',state.reflections);setRange('hdriBgIntensity24',state.backgroundIntensity);setRange('hdriBgBlur24',state.backgroundBlur);
  const f=document.getElementById('hdriFile24');if(f)f.textContent=state.fileName||'HDRI не импортирован';
  const bg=document.getElementById('hdriBackground24');if(bg){bg.textContent=`Фон ${state.background?'ON':'OFF'}`;bg.classList.toggle('active',state.background)}
  const b=document.getElementById('hdriModeBtn24');if(b)b.classList.toggle('active',hdriMode);
  debug.mode=hdriMode;debug.fileName=state.fileName||'';debug.background=state.background;debug.tilt=state.tilt;
}
function bindPanel(){
  const up=document.getElementById('hdriUpload24');if(up&&!up.dataset.bound24){up.dataset.bound24='1';up.addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(file)await importFile(file)})}
  const bind=(id,key)=>{const el=document.getElementById(id);if(!el||el.dataset.bound24)return;el.dataset.bound24='1';el.addEventListener('input',()=>{state[key]=Number(el.value);saveState();syncUI();if(scene&&renderer)applyToScene(renderer,scene)})};
  bind('hdriTilt24','tilt');bind('hdriReflect24','reflections');bind('hdriBgIntensity24','backgroundIntensity');bind('hdriBgBlur24','backgroundBlur');
  const bg=document.getElementById('hdriBackground24');if(bg&&!bg.dataset.bound24){bg.dataset.bound24='1';bg.onclick=()=>{state.background=!state.background;saveState();syncUI();if(scene&&renderer)applyToScene(renderer,scene)}}
  const reset=document.getElementById('hdriReset24');if(reset&&!reset.dataset.bound24){reset.dataset.bound24='1';reset.onclick=()=>{state={...state,tilt:0,background:false,backgroundIntensity:1,backgroundBlur:0,reflections:1};saveState();setLegacyRange('hdrRotation',0);setLegacyRange('hdrIntensity',1.25);setLegacyRange('hdrExposure',1.05);syncUI();setStatus('Настройки HDRI сброшены')}}
  const del=document.getElementById('hdriDelete24');if(del&&!del.dataset.bound24){del.dataset.bound24='1';del.onclick=async()=>{state.customActive=false;state.fileName='';saveState();disposeCustom();await deleteBlob();syncUI();setStatus('Импортированный HDRI удалён')}}
}

function injectToolbar(){
  const bar=document.getElementById('edit3dToolbar');if(!bar||document.getElementById('hdriModeBtn24'))return;
  const b=document.createElement('button');b.id='hdriModeBtn24';b.className='edit3d-tool hdri24';b.textContent='HDRI';b.title='Вращать HDRI прямо во viewport';bar.insertBefore(b,bar.querySelector('#edit3dFront')||null);
  b.onclick=e=>{e.preventDefault();e.stopPropagation();setHdriMode(!hdriMode)};syncUI();
}
function injectGizmo(){
  const host=document.getElementById('threeHost');if(!host||document.getElementById('hdriGizmo24'))return;
  const g=document.createElement('div');g.id='hdriGizmo24';host.appendChild(g);
}
function setHdriMode(on){
  hdriMode=!!on;setLightingModeHdr();
  document.querySelectorAll('#edit3dToolbar .edit3d-tool').forEach(x=>{if(x.id!=='hdriModeBtn24')x.classList.toggle('active',false)});
  document.getElementById('threeHost')?.classList.toggle('hdri-drag24',hdriMode);syncUI();
  if(hdriMode)setStatus('HDRI режим: тяните по viewport для вращения');
}
function showGizmo(show=true){
  const g=document.getElementById('hdriGizmo24');if(!g)return;
  g.style.display=show?'block':'none';if(show)g.textContent=`↺ HDRI ${Math.round(currentRotation())}° · ↕ ${Math.round(state.tilt)}°`;
}
function applyDrag(dx,dy,fine=false){
  const speed=fine?state.fineSpeed:state.normalSpeed;
  const rot=normDeg(currentRotation()+dx*speed);state.tilt=clamp(state.tilt-dy*speed*.6,-85,85);saveState();setLegacyRange('hdrRotation',Math.round(rot*10)/10);syncUI();showGizmo(true);if(scene&&renderer)applyToScene(renderer,scene);
}
function bindCanvas(canvas){
  if(!canvas||canvas===lastCanvas)return;lastCanvas=canvas;
  const stop=e=>{if(!hdriMode)return false;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();return true};
  canvas.addEventListener('pointerdown',e=>{if(!hdriMode||e.button>0)return;stop(e);drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture?.(e.pointerId);showGizmo(true)},true);
  canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId||!hdriMode)return;stop(e);const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;applyDrag(dx,dy,e.shiftKey)},true);
  const end=e=>{if(!drag||drag.id!==e.pointerId)return;if(hdriMode)stop(e);drag=null;setTimeout(()=>showGizmo(false),350)};
  canvas.addEventListener('pointerup',end,true);canvas.addEventListener('pointercancel',end,true);
}

document.addEventListener('click',e=>{
  const normal=e.target.closest?.('#edit3dToolbar .edit3d-tool[data-edit3d]');if(normal&&normal.id!=='hdriModeBtn24'&&hdriMode){hdriMode=false;document.getElementById('threeHost')?.classList.remove('hdri-drag24');syncUI()}
},true);
window.addEventListener('DOMContentLoaded',()=>{
  injectPanel();injectToolbar();injectGizmo();
  const obs=new MutationObserver(()=>{injectPanel();injectToolbar();injectGizmo();bindPanel()});obs.observe(document.body,{childList:true,subtree:true});
});

globalThis.__colorizeHdriStudio24Debug=()=>structuredClone({...debug,rotation:currentRotation(),tilt:state.tilt,background:state.background,customLoaded:!!customEnv,fileName:state.fileName||''});
globalThis.__colorizeHdriStudio24TestRotate=(dx=20,dy=0)=>{setHdriMode(true);applyDrag(Number(dx)||0,Number(dy)||0,false);return globalThis.__colorizeHdriStudio24Debug()};
globalThis.__colorizeHdriStudio24SetBackground=(v)=>{state.background=!!v;saveState();syncUI();if(scene&&renderer)applyToScene(renderer,scene);return state.background};
