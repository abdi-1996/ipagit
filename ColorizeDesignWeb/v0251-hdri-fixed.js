import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

// v0.25.1 — fixed built-in Jeksterer HDRI + reliable iOS/iPadOS import.
const VERSION='0.25.1';
const FIXED_ASSET='./assets/hdri/JekstererHDRI_23.hdr';
const LIGHT_KEY='colorize-lighting-v013';
const V24_KEY='colorize-hdri-studio-v024';
const SRC_KEY='colorize-hdri-source-v0251';
let renderer=null,scene=null,current=null,loading=false,token=0;
let source={kind:'builtin',name:'JekstererHDRI_23.hdr'};
let debug={version:VERSION,loaded:false,kind:'builtin',name:source.name,width:0,height:0,bytes:0,lastError:'',imports:0,applied:0};

function readJSON(k,f={}){try{return {...f,...JSON.parse(localStorage.getItem(k)||'{}')}}catch{return {...f}}}
function writeJSON(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function light(){return readJSON(LIGHT_KEY,{mode:'main',hdr:{intensity:1.25,rotation:0,exposure:1.05}})}
function studio(){return readJSON(V24_KEY,{tilt:0,background:false,backgroundIntensity:1,backgroundBlur:0,reflections:1})}
function status(t){const el=document.getElementById('hdriSourceStatus25')||document.getElementById('hdriStatus24');if(el)el.textContent=t||''}
async function fixedBuffer(){const r=await fetch(FIXED_ASSET,{cache:'force-cache'});if(!r.ok)throw new Error(`HDRI asset ${r.status}`);const b=await r.arrayBuffer();debug.bytes=b.byteLength;return b}
function dispose(){try{current?.target?.dispose?.();current?.texture?.dispose?.()}catch{}current=null;debug.loaded=false}
async function parseBuffer(buffer,name){
  if(!renderer)throw new Error('3D renderer is not ready');
  const my=++token;loading=true;status(`Загрузка ${name}…`);
  try{
    const blob=new Blob([buffer],{type:'application/octet-stream'}),url=URL.createObjectURL(blob);let tex;
    try{tex=String(name).toLowerCase().endsWith('.exr')?await new EXRLoader().loadAsync(url):await new RGBELoader().loadAsync(url)}finally{URL.revokeObjectURL(url)}
    tex.mapping=THREE.EquirectangularReflectionMapping;
    const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();const target=pmrem.fromEquirectangular(tex);pmrem.dispose();
    if(my!==token){target.dispose();tex.dispose();return false}
    dispose();current={texture:tex,target,name};const im=tex.image||{};debug.loaded=true;debug.width=Number(im.width)||0;debug.height=Number(im.height)||0;debug.lastError='';debug.name=name;status(`${name} · готово`);apply();return true;
  }catch(e){debug.lastError=String(e?.message||e);status(`Ошибка HDRI: ${debug.lastError}`);return false}finally{if(my===token)loading=false}
}
async function useBuiltin(){
  source={kind:'builtin',name:'JekstererHDRI_23.hdr'};writeJSON(SRC_KEY,source);debug.kind='builtin';debug.name=source.name;
  if(!renderer){status('JekstererHDRI_23.hdr · встроен · откройте 3D');return true}
  return await parseBuffer(await fixedBuffer(),source.name);
}
async function importFile(file){
  if(!file)return false;const n=String(file.name||'HDRI'),l=n.toLowerCase();if(!l.endsWith('.hdr')&&!l.endsWith('.exr')){status('Нужен файл .HDR или .EXR');return false}
  try{const b=await file.arrayBuffer();if(!b||b.byteLength<64)throw new Error('Файл пустой');source={kind:'custom',name:n};writeJSON(SRC_KEY,source);debug.kind='custom';debug.name=n;debug.bytes=b.byteLength;debug.imports++;
    if(!renderer){status(`${n} · прочитан · откройте 3D`);return true}return await parseBuffer(b,n);
  }catch(e){debug.lastError=String(e?.message||e);status(`Импорт не удался: ${debug.lastError}`);return false}
}
function apply(){if(!renderer||!scene||!current)return;const l=light();if(l.mode!=='hdr')return;const s=studio();const rot=THREE.MathUtils.degToRad(Number(l.hdr?.rotation)||0),tilt=THREE.MathUtils.degToRad(Number(s.tilt)||0);scene.environment=current.target.texture;scene.environmentIntensity=Math.max(0,Number(l.hdr?.intensity)||0);renderer.toneMappingExposure=Math.max(.1,Number(l.hdr?.exposure)||1);if(scene.environmentRotation)scene.environmentRotation.set(tilt,rot,0);scene.traverse?.(o=>{if(!o.isMesh)return;for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean))if('envMapIntensity'in m)m.envMapIntensity=Math.max(0,Number(s.reflections)||1)});if(s.background){scene.background=current.texture;if(scene.backgroundRotation)scene.backgroundRotation.set(tilt,rot,0);if('backgroundIntensity'in scene)scene.backgroundIntensity=Math.max(0,Number(s.backgroundIntensity)||1);if('backgroundBlurriness'in scene)scene.backgroundBlurriness=Math.max(0,Math.min(1,Number(s.backgroundBlur)||0))}else scene.background=null;debug.applied++}

const prev=globalThis.__colorizeBeforeThreeRender;
globalThis.__colorizeBeforeThreeRender=(r,s,c)=>{prev?.(r,s,c);const host=document.getElementById('threeHost');if(host&&!host.hidden&&r?.domElement&&host.contains(r.domElement)){renderer=r;scene=s;if(!current&&!loading&&source.kind==='builtin')useBuiltin();apply()}};

document.addEventListener('click',e=>{const b=e.target.closest?.('#jekstererHdri25');if(!b)return;e.preventDefault();e.stopImmediatePropagation();useBuiltin()},true);
document.addEventListener('change',e=>{const input=e.target;if(input?.id!=='hdriUpload25'&&input?.id!=='hdriUpload24')return;const f=input.files?.[0];if(!f)return;e.stopImmediatePropagation();input.value='';importFile(f)},true);
window.addEventListener('DOMContentLoaded',()=>{const saved=readJSON(SRC_KEY,{kind:'builtin',name:'JekstererHDRI_23.hdr'});if(saved.kind==='builtin')source=saved;setTimeout(()=>status(source.kind==='builtin'?'JekstererHDRI_23.hdr · встроенный HDRI готов к загрузке':''),500)});

globalThis.__colorizeHdri251Debug=()=>structuredClone(debug);
globalThis.__colorizeHdri251UseBuiltin=useBuiltin;
globalThis.__colorizeHdri251Import=importFile;
globalThis.__colorizeHdri251Buffer=fixedBuffer;
