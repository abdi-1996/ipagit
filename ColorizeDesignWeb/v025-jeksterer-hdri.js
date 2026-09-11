import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

// v0.25 — reliable HDRI source layer.
// Ships JekstererHDRI_23 as a built-in lightweight IBL and replaces the
// fragile iOS File/IndexedDB path with ArrayBuffer persistence.
const VERSION='0.25.0';
const KEY='colorize-hdri-source-v025';
const LIGHT_KEY='colorize-lighting-v013';
const V24_KEY='colorize-hdri-studio-v024';
const DB_NAME='colorize-hdri-v025';
const DB_STORE='files';
const DB_KEY='custom';
const BUILTIN_NAME='JekstererHDRI_23.hdr';
const BUILTIN_PARTS=[
  './assets/hdri/jeksterer23-128.part1a.b64',
  './assets/hdri/jeksterer23-128.part1b.b64',
  './assets/hdri/jeksterer23-128.part2a.b64',
  './assets/hdri/jeksterer23-128.part2b.b64',
  './assets/hdri/jeksterer23-128.part3.b64'
];
const DEFAULTS={source:'jeksterer',fileName:BUILTIN_NAME};

let sourceState=loadSourceState();
let renderer=null,scene=null;
let current=null,loading=false,loadToken=0;
let dbPromise=null,builtinBufferPromise=null;
let debug={version:VERSION,source:sourceState.source,fileName:sourceState.fileName,loaded:false,width:0,height:0,builtInBytes:0,applied:0,lastApply:0,lastImport:'',lastError:'',importPath:'arrayBuffer'};

function loadSourceState(){
  try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...DEFAULTS}}
}
function saveSourceState(){try{localStorage.setItem(KEY,JSON.stringify(sourceState))}catch{}}
function readLighting(){
  const base={mode:'main',hdr:{intensity:1.25,rotation:0,exposure:1.05}};
  try{const x=JSON.parse(localStorage.getItem(LIGHT_KEY)||'{}');return {...base,...x,hdr:{...base.hdr,...(x.hdr||{})}}}catch{return base}
}
function readV24(){
  const base={tilt:0,background:false,backgroundIntensity:1,backgroundBlur:0,reflections:1};
  try{return {...base,...JSON.parse(localStorage.getItem(V24_KEY)||'{}')}}catch{return base}
}
function ensureHdrMode(){
  const b=document.querySelector('[data-light-mode="hdr"]');
  if(b&&!b.classList.contains('active')){b.click();return}
  const s=readLighting();if(s.mode!=='hdr'){s.mode='hdr';try{localStorage.setItem(LIGHT_KEY,JSON.stringify(s))}catch{}}
}
function clamp(v,a,b){return Math.max(a,Math.min(b,Number(v)||0))}
function disposeCurrent(){
  try{current?.target?.dispose?.();current?.source?.dispose?.()}catch{}
  current=null;debug.loaded=false;debug.width=0;debug.height=0;
}
function base64ToArrayBuffer(text){
  const clean=String(text||'').replace(/\s+/g,'');
  const raw=atob(clean),bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes.buffer;
}
async function loadBuiltinBuffer(){
  if(builtinBufferPromise)return builtinBufferPromise;
  builtinBufferPromise=(async()=>{
    const chunks=[];
    for(const url of BUILTIN_PARTS){
      const r=await fetch(url,{cache:'force-cache'});if(!r.ok)throw new Error(`HDRI asset ${r.status}`);chunks.push(await r.text());
    }
    const buffer=base64ToArrayBuffer(chunks.join(''));
    debug.builtInBytes=buffer.byteLength;
    if(buffer.byteLength<1000)throw new Error('Built-in HDRI is incomplete');
    const head=new TextDecoder('ascii').decode(new Uint8Array(buffer,0,Math.min(64,buffer.byteLength)));
    if(!head.includes('#?RADIANCE'))throw new Error('Built-in HDRI header is invalid');
    return buffer;
  })();
  return builtinBufferPromise;
}
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
async function saveRecord(record){
  const db=await openDb();if(!db)return false;
  return await new Promise(resolve=>{try{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(record,DB_KEY);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false)}catch{resolve(false)}});
}
async function readRecord(){
  const db=await openDb();if(!db)return null;
  return await new Promise(resolve=>{try{const tx=db.transaction(DB_STORE,'readonly');const req=tx.objectStore(DB_STORE).get(DB_KEY);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>resolve(null)}catch{resolve(null)}});
}
async function clearRecord(){
  const db=await openDb();if(!db)return;
  await new Promise(resolve=>{try{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete(DB_KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>resolve()}catch{resolve()}});
}
async function textureFromBuffer(buffer,name,type){
  const blob=new Blob([buffer],{type:type||'application/octet-stream'}),url=URL.createObjectURL(blob);
  try{
    const lower=String(name||'').toLowerCase();
    const source=lower.endsWith('.exr')?await new EXRLoader().loadAsync(url):await new RGBELoader().loadAsync(url);
    source.mapping=THREE.EquirectangularReflectionMapping;
    return source;
  }finally{URL.revokeObjectURL(url)}
}
async function installEnvironment(buffer,name,type,identity){
  if(!renderer||!buffer)return false;
  const token=++loadToken;loading=true;setStatus(`Загрузка ${name}…`);
  try{
    const source=await textureFromBuffer(buffer,name,type);
    const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();const target=pmrem.fromEquirectangular(source);pmrem.dispose();
    if(token!==loadToken){target.dispose?.();source.dispose?.();return false}
    disposeCurrent();current={source,target,name,identity};
    const image=source.image||{};debug.loaded=true;debug.width=Number(image.width)||0;debug.height=Number(image.height)||0;debug.fileName=name;debug.lastError='';
    setStatus(`${name} · готово`);syncUI();apply();return true;
  }catch(err){debug.lastError=String(err?.message||err);setStatus(`Ошибка HDRI: ${debug.lastError}`);return false}
  finally{if(token===loadToken)loading=false}
}
async function useBuiltin(){
  sourceState={source:'jeksterer',fileName:BUILTIN_NAME};saveSourceState();debug.source='jeksterer';debug.fileName=BUILTIN_NAME;ensureHdrMode();syncUI();
  if(!renderer){setStatus(`${BUILTIN_NAME} · встроен · откройте 3D`);return true}
  if(current?.identity==='jeksterer'){apply();setStatus(`${BUILTIN_NAME} · готово`);return true}
  try{return await installEnvironment(await loadBuiltinBuffer(),BUILTIN_NAME,'image/vnd.radiance','jeksterer')}
  catch(err){debug.lastError=String(err?.message||err);setStatus(`Ошибка встроенного HDRI: ${debug.lastError}`);return false}
}
async function importCustom(file){
  if(!file)return false;
  const name=String(file.name||'HDRI').trim(),lower=name.toLowerCase();
  if(!lower.endsWith('.hdr')&&!lower.endsWith('.exr')){setStatus('Нужен файл .HDR или .EXR');return false}
  setStatus(`Читаем ${name}…`);
  try{
    // Important for iPhone/iPad Files and iCloud providers: fully materialize the
    // selected document while the picker security scope is still alive.
    const buffer=await file.arrayBuffer();
    if(!buffer||buffer.byteLength<64)throw new Error('Файл пустой');
    await saveRecord({name,type:file.type||'application/octet-stream',buffer,bytes:buffer.byteLength,savedAt:Date.now()});
    sourceState={source:'custom',fileName:name};saveSourceState();debug.source='custom';debug.fileName=name;debug.lastImport=name;ensureHdrMode();syncUI();
    if(!renderer){setStatus(`${name} · сохранён · откройте 3D`);return true}
    return await installEnvironment(buffer,name,file.type,'custom');
  }catch(err){debug.lastError=String(err?.message||err);setStatus(`Импорт не удался: ${debug.lastError}`);return false}
}
async function restoreSelected(){
  if(!renderer||loading)return;
  if(sourceState.source==='custom'){
    if(current?.identity==='custom')return;
    const rec=await readRecord();
    if(rec?.buffer){await installEnvironment(rec.buffer,rec.name||sourceState.fileName,rec.type,'custom');return}
    sourceState={source:'jeksterer',fileName:BUILTIN_NAME};saveSourceState();debug.source='jeksterer';syncUI();
  }
  if(!current||current.identity!=='jeksterer')await useBuiltin();
}
function tuneMaterials(s,value){
  s?.traverse?.(o=>{if(!o.isMesh||!o.material)return;for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean))if('envMapIntensity' in m)m.envMapIntensity=value});
}
function apply(){
  if(!renderer||!scene||!current)return;
  const light=readLighting();if(light.mode!=='hdr')return;
  const v24=readV24(),rot=THREE.MathUtils.degToRad(Number(light.hdr?.rotation)||0),tilt=THREE.MathUtils.degToRad(clamp(v24.tilt,-85,85));
  scene.environment=current.target.texture;scene.environmentIntensity=Math.max(0,Number(light.hdr?.intensity)||0);renderer.toneMappingExposure=Math.max(.1,Number(light.hdr?.exposure)||1);
  if(scene.environmentRotation)scene.environmentRotation.set(tilt,rot,0);
  tuneMaterials(scene,clamp(v24.reflections,0,3));
  if(v24.background){scene.background=current.source;if(scene.backgroundRotation)scene.backgroundRotation.set(tilt,rot,0);if('backgroundIntensity' in scene)scene.backgroundIntensity=clamp(v24.backgroundIntensity,0,3);if('backgroundBlurriness' in scene)scene.backgroundBlurriness=clamp(v24.backgroundBlur,0,1)}
  else scene.background=null;
  debug.applied++;debug.lastApply=performance.now();debug.source=sourceState.source;debug.fileName=sourceState.fileName;
}

const previousHook=globalThis.__colorizeBeforeThreeRender;
globalThis.__colorizeBeforeThreeRender=(r,s,c)=>{
  previousHook?.(r,s,c);
  const host=document.getElementById('threeHost');
  if(host&&!host.hidden&&r?.domElement&&host.contains(r.domElement)){
    renderer=r;scene=s;
    if(!current&&!loading)restoreSelected();
    apply();
  }
};

function css(){return `
.hdri-studio24 .hdri24-import{display:none!important}
.hdri-source25{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:8px 0}.hdri-source25 button,.hdri-import25{min-height:38px;border:1px solid rgba(255,255,255,.15);border-radius:9px;background:rgba(255,255,255,.06);color:#fff;font:11px -apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;text-align:center;padding:5px 8px}.hdri-source25 button.active{border-color:#55bfff;background:rgba(22,136,216,.28);box-shadow:inset 0 0 0 1px rgba(85,191,255,.2)}.hdri-import25{border-style:dashed;border-color:rgba(89,183,255,.55);color:#dff2ff;cursor:pointer}.hdri-source-status25{font:10px -apple-system,BlinkMacSystemFont,sans-serif;opacity:.7;margin:-2px 2px 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media(max-width:720px){.hdri-source25{grid-template-columns:1fr}.hdri-source25 button,.hdri-import25{min-height:42px}}
`;}
function injectUI(){
  const box=document.querySelector('.hdri-studio24');if(!box||document.getElementById('jekstererHdri25'))return;
  if(!document.getElementById('hdriSourceStyle25')){const st=document.createElement('style');st.id='hdriSourceStyle25';st.textContent=css();document.head.appendChild(st)}
  const wrap=document.createElement('div');wrap.innerHTML=`<div class="hdri-source25"><button id="jekstererHdri25" type="button">Jeksterer HDRI 23<br><small>встроенный</small></button><label class="hdri-import25">Импорт HDR / EXR<input id="hdriUpload25" type="file" accept=".hdr,.exr" hidden></label></div><div id="hdriSourceStatus25" class="hdri-source-status25"></div>`;
  const head=box.querySelector('.hdri24-head');while(wrap.firstChild)head?.after(wrap.lastChild);bindUI();syncUI();
}
function bindUI(){
  const built=document.getElementById('jekstererHdri25');if(built&&!built.dataset.bound25){built.dataset.bound25='1';built.addEventListener('click',()=>useBuiltin())}
  const up=document.getElementById('hdriUpload25');if(up&&!up.dataset.bound25){up.dataset.bound25='1';up.addEventListener('change',async e=>{const file=e.target.files?.[0]||null;e.target.value='';if(file)await importCustom(file)})}
}
function setStatus(text){const el=document.getElementById('hdriSourceStatus25');if(el)el.textContent=text||''}
function syncUI(){
  const built=document.getElementById('jekstererHdri25');if(built)built.classList.toggle('active',sourceState.source==='jeksterer');
  const oldFile=document.getElementById('hdriFile24');if(oldFile)oldFile.textContent=sourceState.source==='custom'?(sourceState.fileName||'Мой HDRI'):`${BUILTIN_NAME} · встроенный`;
  if(!document.getElementById('hdriSourceStatus25')?.textContent)setStatus(sourceState.source==='custom'?`${sourceState.fileName||'Мой HDRI'} · сохранён`:`${BUILTIN_NAME} · встроен`);
}

window.addEventListener('DOMContentLoaded',()=>{
  injectUI();
  new MutationObserver(()=>{injectUI();bindUI();syncUI()}).observe(document.body,{subtree:true,childList:true});
});

globalThis.__colorizeHdri25Debug=()=>structuredClone(debug);
globalThis.__colorizeHdri25UseBuiltin=useBuiltin;
globalThis.__colorizeHdri25ImportForTest=importCustom;
globalThis.__colorizeHdri25BuiltInBuffer=loadBuiltinBuffer;
globalThis.__colorizeHdri25ClearCustom=async()=>{await clearRecord();sourceState={source:'jeksterer',fileName:BUILTIN_NAME};saveSourceState();disposeCurrent();syncUI();if(renderer)await useBuiltin()};
