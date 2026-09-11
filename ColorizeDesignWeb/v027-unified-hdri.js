import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

// v0.27.0 — one HDRI source for BOTH lighting and reflections.
// Replaces the older overlapping HDRI selectors with one clear library,
// one import button and an always-visible Skydome size control.
const VERSION='0.27.0';
const KEY='colorize-hdri-unified-v027';
const DB_NAME='colorize-hdri-v027';
const DB_STORE='files';
const DB_KEY='custom';
const HDR_ROOT='https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/';
const PRESETS={
  jeksterer:{label:'Jeksterer 23',sub:'Встроенный',kind:'builtin',tone:'jek'},
  studio:{label:'Студия',sub:'Studio Small 03',url:HDR_ROOT+'studio_small_03_1k.hdr',tone:'studio'},
  day:{label:'Дневной парк',sub:'Rooitou Park',url:HDR_ROOT+'rooitou_park_1k.hdr',tone:'day'},
  night:{label:'Ночь',sub:'Dikhololo Night',url:HDR_ROOT+'dikhololo_night_1k.hdr',tone:'night'},
  city:{label:'Город',sub:'Potsdamer Platz',url:HDR_ROOT+'potsdamer_platz_1k.hdr',tone:'city'},
  sunset:{label:'Закат',sub:'Venice Sunset',url:HDR_ROOT+'venice_sunset_1k.hdr',tone:'sunset'}
};
const DEFAULTS={source:'jeksterer',fileName:'JekstererHDRI_23.hdr',sphereSize:1,lightIntensity:1.25,reflectionIntensity:1,rotation:0,tilt:0,background:false};
let state=loadState();
let renderer=null,scene=null,current=null,sky=null,loading=false,token=0,dbPromise=null;
let debug={version:VERSION,source:state.source,fileName:state.fileName,sphereSize:state.sphereSize,lightIntensity:state.lightIntensity,reflectionIntensity:state.reflectionIntensity,loaded:false,activeCount:0,environmentSource:null,reflectionSource:null,applied:0,lastError:''};

function clamp(v,a,b){return Math.max(a,Math.min(b,Number(v)||0))}
function normDeg(v){let x=Number(v)||0;while(x>180)x-=360;while(x<-180)x+=360;return x}
function loadState(){try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...DEFAULTS}}}
function saveState(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}}
function setStatus(t){const el=document.getElementById('hdriStatus27');if(el)el.textContent=t||''}
function forceHdrMode(){
  const btn=document.querySelector('[data-light-mode="hdr"]');
  if(btn&&!btn.classList.contains('active'))btn.click();
  try{const k='colorize-lighting-v013',s=JSON.parse(localStorage.getItem(k)||'{}');s.mode='hdr';localStorage.setItem(k,JSON.stringify(s))}catch{}
}

function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise(resolve=>{
    if(!('indexedDB' in window)){resolve(null);return}
    const q=indexedDB.open(DB_NAME,1);
    q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains(DB_STORE))q.result.createObjectStore(DB_STORE)};
    q.onsuccess=()=>resolve(q.result);q.onerror=()=>resolve(null);
  });
  return dbPromise;
}
async function saveCustom(file){const db=await openDb();if(!db)return false;return await new Promise(resolve=>{try{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(file,DB_KEY);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false)}catch{resolve(false)}})}
async function readCustom(){const db=await openDb();if(!db)return null;return await new Promise(resolve=>{try{const tx=db.transaction(DB_STORE,'readonly'),q=tx.objectStore(DB_STORE).get(DB_KEY);q.onsuccess=()=>resolve(q.result||null);q.onerror=()=>resolve(null)}catch{resolve(null)}})}

function disposeCurrent(){try{current?.target?.dispose?.();current?.source?.dispose?.()}catch{}current=null;debug.loaded=false}
function installSource(source,name,id){
  if(!renderer||!source)return false;
  source.mapping=THREE.EquirectangularReflectionMapping;
  const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();
  const target=pmrem.fromEquirectangular(source);pmrem.dispose();disposeCurrent();
  current={source,target,name,id};
  state.source=id;state.fileName=name;saveState();
  debug.loaded=true;debug.source=id;debug.fileName=name;debug.lastError='';
  syncUI();apply();setStatus(`${name} · один HDRI для света и отражений`);return true;
}
async function makeJeksterer(){
  const fn=globalThis.__colorizeHdri251Raw;if(typeof fn!=='function')throw new Error('Jeksterer HDRI unavailable');
  const u=await fn(),w=64,h=32;if(!u||u.length!==w*h*4)throw new Error('Jeksterer HDRI invalid');
  const f=new Float32Array(w*h*4);
  for(let i=0;i<u.length;i+=4){const e=u[i+3],scale=e?Math.pow(2,e-128)/255:0;f[i]=u[i]*scale;f[i+1]=u[i+1]*scale;f[i+2]=u[i+2]*scale;f[i+3]=1}
  const tex=new THREE.DataTexture(f,w,h,THREE.RGBAFormat,THREE.FloatType);tex.needsUpdate=true;tex.flipY=true;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;tex.generateMipmaps=false;return tex;
}
async function loadPreset(id){
  const p=PRESETS[id];if(!p)return false;const my=++token;loading=true;forceHdrMode();setStatus(`Загрузка ${p.label}…`);
  try{const source=id==='jeksterer'?await makeJeksterer():await new RGBELoader().loadAsync(p.url);if(my!==token){source.dispose?.();return false}return installSource(source,p.label,id)}
  catch(e){debug.lastError=String(e?.message||e);setStatus(`Не удалось загрузить ${p.label}`);return false}
  finally{if(my===token)loading=false}
}
async function importFile(file){
  if(!file)return false;const name=String(file.name||'HDRI'),low=name.toLowerCase();
  if(!low.endsWith('.hdr')&&!low.endsWith('.exr')){setStatus('Выберите .HDR или .EXR');return false}
  const my=++token;loading=true;forceHdrMode();setStatus(`Импорт ${name}…`);
  try{
    await saveCustom(file);const url=URL.createObjectURL(file);let source;
    try{source=low.endsWith('.exr')?await new EXRLoader().loadAsync(url):await new RGBELoader().loadAsync(url)}finally{URL.revokeObjectURL(url)}
    if(my!==token){source.dispose?.();return false}return installSource(source,name,'custom');
  }catch(e){debug.lastError=String(e?.message||e);setStatus(`Импорт не удался: ${debug.lastError}`);return false}
  finally{if(my===token)loading=false}
}
async function restore(){
  if(!renderer||loading||current)return;
  if(state.source==='custom'){const f=await readCustom();if(f){await importFile(f);return}state.source='jeksterer';state.fileName='JekstererHDRI_23.hdr';saveState()}
  await loadPreset(PRESETS[state.source]?state.source:'jeksterer');
}

function ensureSky(){
  if(!scene)return null;if(sky&&sky.parent===scene)return sky;
  try{sky?.geometry?.dispose?.();sky?.material?.dispose?.()}catch{}
  sky=new THREE.Mesh(new THREE.SphereGeometry(1,64,32),new THREE.MeshBasicMaterial({side:THREE.BackSide,depthWrite:false,depthTest:true,toneMapped:true}));
  sky.name='Colorize Unified HDRI Skydome';sky.userData.colorizeUnifiedHdri27=true;sky.renderOrder=-1000;scene.add(sky);return sky;
}
function apply(){
  if(!renderer||!scene||!current)return;
  // Exactly one source drives BOTH IBL lighting and material reflections.
  scene.environment=current.target.texture;
  scene.environmentIntensity=clamp(state.lightIntensity,0,5);
  const rot=THREE.MathUtils.degToRad(normDeg(state.rotation)),tilt=THREE.MathUtils.degToRad(clamp(state.tilt,-85,85));
  if(scene.environmentRotation)scene.environmentRotation.set(tilt,rot,0);
  scene.traverse?.(o=>{
    if(!o?.isMesh||o===sky)return;
    for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean))if('envMapIntensity' in m)m.envMapIntensity=clamp(state.reflectionIntensity,0,5);
  });
  const dome=ensureSky();if(dome){dome.material.map=current.source;dome.material.needsUpdate=true;dome.rotation.set(tilt,-rot,0);dome.scale.setScalar(60*clamp(state.sphereSize,.25,5));dome.visible=!!state.background}
  scene.background=null;
  debug={...debug,source:state.source,fileName:state.fileName,sphereSize:state.sphereSize,lightIntensity:state.lightIntensity,reflectionIntensity:state.reflectionIntensity,loaded:true,environmentSource:current.id,reflectionSource:current.id,applied:debug.applied+1};
}

const previousHook=globalThis.__colorizeBeforeThreeRender;
globalThis.__colorizeBeforeThreeRender=(r,s,c)=>{
  previousHook?.(r,s,c);
  const host=document.getElementById('threeHost');
  if(host&&!host.hidden&&r?.domElement&&host.contains(r.domElement)){
    renderer=r;scene=s;if(!current&&!loading)restore();apply();
  }
};

function css(){return `
/* v0.27 owns HDRI selection: hide ALL older HDRI selectors/import widgets. */
.hdri-studio24,.hdri-library26,.hdri-source25,.hdri-source-status25,.hdr-upload-v013,#hdrPreset12{display:none!important}
.hdri-unified27{margin:10px 0;padding:11px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(255,255,255,.04)}
.hdri27-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}.hdri27-head strong{font-size:12px}.hdri27-head small{font-size:9px;opacity:.58}
.hdri27-presets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.hdri27-card{position:relative;min-height:54px;padding:9px 8px;border:1px solid rgba(255,255,255,.13);border-radius:10px;color:#fff;text-align:left;background:rgba(255,255,255,.045)}.hdri27-card strong{display:block;font-size:11px}.hdri27-card small{display:block;margin-top:2px;font-size:9px;opacity:.7}.hdri27-card.active{border-color:#62c7ff;box-shadow:0 0 0 1px rgba(98,199,255,.35) inset;background:rgba(28,139,210,.18)}
.hdri27-card.active:after{content:'✓';position:absolute;right:8px;top:7px;font-weight:800;color:#74d1ff}.hdri27-import{display:flex;align-items:center;justify-content:center;min-height:42px;margin-top:9px;border:1px dashed rgba(98,199,255,.7);border-radius:10px;background:rgba(28,139,210,.12);font-size:12px;color:#e9f8ff;cursor:pointer}.hdri27-active{margin:7px 1px 9px;font-size:10px;opacity:.78;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hdri27-row{display:grid;grid-template-columns:105px 1fr 54px;gap:7px;align-items:center;margin:8px 0;font-size:11px}.hdri27-row input{width:100%;min-width:0}.hdri27-row output{text-align:right;font-variant-numeric:tabular-nums}.hdri27-row.size{padding:8px;border:1px solid rgba(98,199,255,.28);border-radius:9px;background:rgba(98,199,255,.07)}
.hdri27-bg{width:100%;height:34px;margin-top:5px;border:1px solid rgba(255,255,255,.13);border-radius:9px;background:rgba(255,255,255,.06);color:#fff}.hdri27-bg.active{background:#167fbd;border-color:#62c7ff}.hdri27-note{font-size:9px;line-height:1.35;opacity:.55;margin-top:7px}.hdri27-status{font-size:9px;min-height:13px;margin-top:6px;opacity:.7}
@media(max-width:720px){.hdri27-presets{display:flex;overflow-x:auto;scrollbar-width:none}.hdri27-card{min-width:130px}.hdri27-row{grid-template-columns:95px 1fr 48px}.hdri27-row.size{position:relative;z-index:2}}
`;}
function injectUI(){
  const page=document.querySelector('#lightingPanel [data-light-page="hdr"]')||document.querySelector('[data-light-page="hdr"]');
  if(!page||document.getElementById('hdriUnified27'))return;
  if(!document.getElementById('hdriStyle27')){const st=document.createElement('style');st.id='hdriStyle27';st.textContent=css();document.head.appendChild(st)}
  const box=document.createElement('div');box.id='hdriUnified27';box.className='hdri-unified27';
  box.innerHTML=`<div class="hdri27-head"><strong>HDRI</strong><small>1 карта · свет + отражения</small></div><div class="hdri27-presets">${Object.entries(PRESETS).map(([id,p])=>`<button type="button" class="hdri27-card" data-hdri27="${id}"><strong>${p.label}</strong><small>${p.sub}</small></button>`).join('')}<button type="button" class="hdri27-card" data-hdri27="custom" id="hdriCustom27" hidden><strong>Мой HDRI</strong><small id="hdriCustomName27">Импортированный</small></button></div><label class="hdri27-import">Импорт HDRI<input id="hdriImport27" type="file" accept=".hdr,.exr,image/vnd.radiance,application/octet-stream" hidden></label><div id="hdriActive27" class="hdri27-active"></div><label class="hdri27-row size"><span>Размер HDRI</span><input id="hdriSphere27" type="range" min="0.25" max="5" step="0.05"><output></output></label><label class="hdri27-row"><span>Сила света</span><input id="hdriLight27" type="range" min="0" max="5" step="0.05"><output></output></label><label class="hdri27-row"><span>Отражения</span><input id="hdriReflect27" type="range" min="0" max="5" step="0.05"><output></output></label><label class="hdri27-row"><span>Поворот</span><input id="hdriRotation27" type="range" min="-180" max="180" step="1"><output></output></label><label class="hdri27-row"><span>Наклон</span><input id="hdriTilt27" type="range" min="-85" max="85" step="1"><output></output></label><button type="button" id="hdriBackground27" class="hdri27-bg">Показать HDRI фон: OFF</button><div class="hdri27-note">Выбранный HDRI всегда один и тот же для освещения и отражений. «Размер HDRI» меняет радиус сферы Skydome.</div><div id="hdriStatus27" class="hdri27-status"></div>`;
  page.appendChild(box);bindUI();syncUI();
}
function setRange(id,value,digits=2,suffix=''){const el=document.getElementById(id);if(!el)return;el.value=String(value);const out=el.parentElement?.querySelector('output');if(out)out.textContent=`${Number(value).toFixed(digits)}${suffix}`}
function syncUI(){
  document.querySelectorAll('[data-hdri27]').forEach(b=>{const active=b.dataset.hdri27===state.source;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
  const custom=document.getElementById('hdriCustom27');if(custom){custom.hidden=state.source!=='custom'&&!state.fileName?.toLowerCase?.().match(/\.(hdr|exr)$/);document.getElementById('hdriCustomName27').textContent=state.fileName||'Импортированный'}
  const active=document.getElementById('hdriActive27');if(active)active.textContent=`Активен: ${state.fileName||PRESETS[state.source]?.label||'HDRI'} · свет + отражения`;
  setRange('hdriSphere27',state.sphereSize,2,'×');setRange('hdriLight27',state.lightIntensity);setRange('hdriReflect27',state.reflectionIntensity);setRange('hdriRotation27',state.rotation,0,'°');setRange('hdriTilt27',state.tilt,0,'°');
  const bg=document.getElementById('hdriBackground27');if(bg){bg.textContent=`Показать HDRI фон: ${state.background?'ON':'OFF'}`;bg.classList.toggle('active',state.background)}
  debug.activeCount=document.querySelectorAll('[data-hdri27].active').length;
}
function bindUI(){
  document.querySelectorAll('[data-hdri27]').forEach(b=>{if(b.dataset.bound27)return;b.dataset.bound27='1';b.addEventListener('click',async()=>{const id=b.dataset.hdri27;if(id==='custom'){const f=await readCustom();if(f)await importFile(f);else setStatus('Сначала импортируйте HDRI')}else await loadPreset(id)})});
  const imp=document.getElementById('hdriImport27');if(imp&&!imp.dataset.bound27){imp.dataset.bound27='1';imp.addEventListener('change',async e=>{const f=e.target.files?.[0];e.target.value='';if(f)await importFile(f)})}
  const bind=(id,key,xf=v=>Number(v))=>{const el=document.getElementById(id);if(!el||el.dataset.bound27)return;el.dataset.bound27='1';el.addEventListener('input',()=>{state[key]=xf(el.value);saveState();syncUI();apply()})};
  bind('hdriSphere27','sphereSize',v=>clamp(v,.25,5));bind('hdriLight27','lightIntensity',v=>clamp(v,0,5));bind('hdriReflect27','reflectionIntensity',v=>clamp(v,0,5));bind('hdriRotation27','rotation',normDeg);bind('hdriTilt27','tilt',v=>clamp(v,-85,85));
  const bg=document.getElementById('hdriBackground27');if(bg&&!bg.dataset.bound27){bg.dataset.bound27='1';bg.onclick=()=>{state.background=!state.background;saveState();syncUI();apply()}}
}
function install(){injectUI();const obs=new MutationObserver(()=>injectUI());obs.observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',install,{once:true});else install();

globalThis.__colorizeHdri27Debug=()=>structuredClone(debug);
globalThis.__colorizeHdri27Select=id=>id==='custom'?readCustom().then(f=>f&&importFile(f)):loadPreset(id);
globalThis.__colorizeHdri27SetSphere=v=>{state.sphereSize=clamp(v,.25,5);saveState();syncUI();apply();return state.sphereSize};
globalThis.__colorizeHdri27ImportFile=importFile;
