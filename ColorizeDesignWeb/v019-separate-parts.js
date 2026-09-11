import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// v0.19 — real separate sign parts.
// Face, returns and back are rebuilt as independent meshes from the same font
// outlines. The legacy monolithic TextGeometry remains only as a hidden transform
// carrier so 3D move/scale/rotate controls continue to work exactly as before.
const STORE_KEYS=['colorize-design-web-v04','colorize-design-web-v03','colorize-design-web-v02','colorize-design-web-v01'];
const SETTINGS_KEY='colorize-separate-parts-v019';
const FONT_SOURCES={
  helvetiker:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/helvetiker_bold.typeface.json',
  optimer:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/optimer_bold.typeface.json',
  gentilis:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/gentilis_bold.typeface.json',
  droidSans:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/droid/droid_sans_bold.typeface.json',
  droidSerif:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/droid/droid_serif_bold.typeface.json'
};
const PROFILES={
  draft:{curveSegments:28,bevelSegments:3,pixelRatio:1.35,shadow:1024,crease:Math.PI/2.6},
  high:{curveSegments:64,bevelSegments:8,pixelRatio:2.0,shadow:2048,crease:Math.PI/2.35},
  ultra:{curveSegments:112,bevelSegments:14,pixelRatio:3.0,shadow:4096,crease:Math.PI/2.2}
};
const fontLoader=new FontLoader();
const fontCache=new Map();
const pending=new WeakMap();
let settings=loadSettings();
let rendererProfile='';
let debug={version:'0.19.0',objects:0,parts:0,quality:settings.quality,face:0,returns:0,back:0,lastBuild:0};

function loadSettings(){
  try{return {quality:'high',face:true,returns:true,back:true,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}}catch{return {quality:'high',face:true,returns:true,back:true}}
}
function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings))}catch{}}
function readProject(){for(const k of STORE_KEYS){try{const raw=localStorage.getItem(k);if(raw)return JSON.parse(raw)}catch{}}return null}
function activeArtboard(p){return p?.artboards?.find(a=>a.id===p.activeArtboardId)||p?.artboards?.[0]||null}
function loadFont(key){
  const k=FONT_SOURCES[key]?key:'helvetiker';
  if(!fontCache.has(k))fontCache.set(k,new Promise((resolve,reject)=>fontLoader.load(FONT_SOURCES[k],resolve,undefined,reject)));
  return fontCache.get(k);
}
function color(v,f='#ffffff'){try{return new THREE.Color(v||f)}catch{return new THREE.Color(f)}}
function disposeObject(o){
  o.traverse?.(x=>{if(x!==o){x.geometry?.dispose?.();for(const m of (Array.isArray(x.material)?x.material:[x.material]).filter(Boolean))m.dispose?.()}});
  o.parent?.remove(o);
}
function centerXY(g,cx,cy){g.translate(-cx,-cy,0);g.computeBoundingBox?.();g.computeBoundingSphere?.();return g}
function geometryBounds(g){g.computeBoundingBox?.();const b=g.boundingBox;return {w:Math.max(.00001,(b?.max.x||0)-(b?.min.x||0)),h:Math.max(.00001,(b?.max.y||0)-(b?.min.y||0)),cx:((b?.min.x||0)+(b?.max.x||0))/2,cy:((b?.min.y||0)+(b?.max.y||0))/2}}
function sideOnlyGeometry(source,crease){
  const g=source.index?source.toNonIndexed():source.clone(),p=g.getAttribute('position'),n=g.getAttribute('normal');
  const pos=[],nor=[],uv=[],u=g.getAttribute('uv');
  if(!p)return new THREE.BufferGeometry();
  for(let i=0;i<p.count;i+=3){
    let az=0;for(let j=0;j<3;j++)az+=Math.abs(n?.getZ(i+j)??1);az/=3;
    if(az>.72)continue; // drop front/back caps, keep outer and hole returns
    for(let j=0;j<3;j++){
      const k=i+j;pos.push(p.getX(k),p.getY(k),p.getZ(k));
      if(n)nor.push(n.getX(k),n.getY(k),n.getZ(k));
      if(u)uv.push(u.getX(k),u.getY(k));
    }
  }
  const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  if(nor.length)out.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));if(uv.length)out.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  out.computeVertexNormals();
  try{toCreasedNormals(out,crease)}catch{}
  out.computeBoundingBox();out.computeBoundingSphere();g.dispose?.();return out;
}
function physicalMaterial(kind,hex,role,o){
  const k=(kind||'pvc').toLowerCase();
  const common={color:color(hex),side:THREE.FrontSide,dithering:true};
  let m;
  if(k==='acrylic')m=new THREE.MeshPhysicalMaterial({...common,metalness:0,roughness:.16,clearcoat:1,clearcoatRoughness:.055,transmission:.12,thickness:.45,ior:1.49,specularIntensity:1});
  else if(k==='metal'||k==='aluminum'||k==='stainless'||k==='painted')m=new THREE.MeshPhysicalMaterial({...common,metalness:k==='painted'?.62:.9,roughness:k==='stainless'?.19:.26,clearcoat:.28,clearcoatRoughness:.12});
  else if(k==='acm')m=new THREE.MeshPhysicalMaterial({...common,metalness:.42,roughness:.34,clearcoat:.18,clearcoatRoughness:.2});
  else m=new THREE.MeshPhysicalMaterial({...common,metalness:0,roughness:role==='back'?.72:.58,clearcoat:.12,clearcoatRoughness:.35,ior:1.47});
  if(role==='face'&&(o.lightMode==='face'||o.lightMode==='both')){m.emissive=color(o.lightColor||'#ffffff');m.emissiveIntensity=Math.max(.05,Number(o.lightIntensity)||.7)*2.35}
  m.userData.colorizePart19=role;return m;
}
function mesh(g,m,name){const x=new THREE.Mesh(g,m);x.name=`Colorize ${name}`;x.userData.part19=name;x.castShadow=true;x.receiveShadow=true;return x}
function signature(primary,o,quality){return JSON.stringify([primary.geometry?.uuid,o.id,o.text,o.font3D,o.w,o.h,o.faceThickness,o.returnDepth,o.backThickness,o.faceMaterial,o.faceColor,o.returnMaterial,o.sideColor,o.backMaterial,o.backColor,o.lightMode,o.lightColor,o.lightIntensity,quality])}
function hideLegacy(primary){
  for(const mat of (Array.isArray(primary.material)?primary.material:[primary.material]).filter(Boolean))mat.visible=false;
  for(const child of primary.children){if(child.userData?.colorizeAssembly15||child.userData?.colorizeAssemblyOverlay14)child.visible=false}
}
function setPartVisibility(group){
  const map={face:settings.face,returns:settings.returns,back:settings.back};
  for(const c of group.children)if(c.userData?.part19)c.visible=map[c.userData.part19]!==false;
}
async function build(primary,o,quality,sig){
  pending.set(primary,sig);
  try{
    const font=await loadFont(o.font3D);if(pending.get(primary)!==sig||!primary.parent)return;
    const profile=PROFILES[quality]||PROFILES.high,shapes=font.generateShapes(o.text||' ',1);if(!shapes.length)return;
    const flat=new THREE.ShapeGeometry(shapes,profile.curveSegments),fb=geometryBounds(flat);flat.dispose();
    primary.geometry.computeBoundingBox?.();const sb=geometryBounds(primary.geometry);
    const returnDepth=Math.max(.025,Math.min(7,(Number(o.returnDepth)||50)/45));
    const faceT=Math.max(.012,Math.min(.55,(Number(o.faceThickness)||3)/45));
    const backT=Math.max(.012,Math.min(.55,(Number(o.backThickness)||5)/45));
    const bevelSize=Math.min(faceT*.22,.018),bevelThickness=Math.min(faceT*.22,.018);

    const returnSource=new THREE.ExtrudeGeometry(shapes,{depth:returnDepth,steps:1,curveSegments:profile.curveSegments,bevelEnabled:false});
    centerXY(returnSource,fb.cx,fb.cy);returnSource.translate(0,0,-returnDepth/2);
    const returnGeo=sideOnlyGeometry(returnSource,profile.crease);returnSource.dispose();

    const faceGeo=new THREE.ExtrudeGeometry(shapes,{depth:faceT,steps:1,curveSegments:profile.curveSegments,bevelEnabled:true,bevelSegments:profile.bevelSegments,bevelThickness,bevelSize});
    centerXY(faceGeo,fb.cx,fb.cy);faceGeo.translate(0,0,returnDepth/2+.001);
    try{toCreasedNormals(faceGeo,Math.PI/3)}catch{}

    const backGeo=new THREE.ExtrudeGeometry(shapes,{depth:backT,steps:1,curveSegments:profile.curveSegments,bevelEnabled:false});
    centerXY(backGeo,fb.cx,fb.cy);backGeo.translate(0,0,-returnDepth/2-backT-.001);

    if(pending.get(primary)!==sig||!primary.parent){returnGeo.dispose();faceGeo.dispose();backGeo.dispose();return}
    const old=primary.children.find(x=>x.userData?.colorizeSeparateParts19);if(old)disposeObject(old);
    const group=new THREE.Group();group.name='Colorize Separate Parts';group.userData.colorizeSeparateParts19=true;group.userData.signature=sig;group.userData.objectId=o.id;
    group.scale.set(sb.w/fb.w,sb.h/fb.h,1);
    group.add(mesh(faceGeo,physicalMaterial(o.faceMaterial,o.faceColor||o.color,'face',o),'face'));
    group.add(mesh(returnGeo,physicalMaterial(o.returnMaterial,o.sideColor,'returns',o),'returns'));
    group.add(mesh(backGeo,physicalMaterial(o.backMaterial,o.backColor,'back',o),'back'));
    primary.add(group);hideLegacy(primary);setPartVisibility(group);
    debug.lastBuild=performance.now();pending.delete(primary);
  }catch(err){pending.delete(primary);globalThis.__colorizeSeparateParts19Error=String(err?.stack||err)}
}
function tuneRenderer(renderer,scene,quality){
  const p=PROFILES[quality]||PROFILES.high,key=`${quality}:${Math.min(window.devicePixelRatio||1,p.pixelRatio)}`;
  if(rendererProfile!==key){renderer.setPixelRatio?.(Math.min(window.devicePixelRatio||1,p.pixelRatio));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;rendererProfile=key}
  scene.traverse?.(x=>{if(x.isLight&&x.shadow?.mapSize){if(x.shadow.mapSize.x!==p.shadow){x.shadow.mapSize.set(p.shadow,p.shadow);x.shadow.bias=-.00025;x.shadow.normalBias=.018;x.shadow.needsUpdate=true}}});
}
function apply(renderer,scene){
  const project=readProject(),a=activeArtboard(project);if(!project||!a||!scene)return;
  const quality=settings.quality in PROFILES?settings.quality:'high';tuneRenderer(renderer,scene,quality);
  const texts=(a.objects||[]).filter(o=>o.type==='text'),prim=[];
  scene.traverse(x=>{if(x.isMesh&&x.geometry?.type==='TextGeometry'&&Array.isArray(x.material)&&x.material.length>=2)prim.push(x)});
  let face=0,returns=0,back=0,parts=0;
  for(let i=0;i<Math.min(texts.length,prim.length);i++){
    const o=texts[i],primary=prim[i],sig=signature(primary,o,quality);hideLegacy(primary);
    const group=primary.children.find(x=>x.userData?.colorizeSeparateParts19);
    if(!group||group.userData.signature!==sig){if(pending.get(primary)!==sig)build(primary,o,quality,sig)}else{setPartVisibility(group);for(const c of group.children){if(c.userData?.part19==='face')face++;if(c.userData?.part19==='returns')returns++;if(c.userData?.part19==='back')back++;if(c.visible!==false)parts++}}
  }
  debug={...debug,objects:Math.min(texts.length,prim.length),parts,quality,face,returns,back};
}

const previous=globalThis.__colorizeBeforeThreeRender;
globalThis.__colorizeBeforeThreeRender=(renderer,scene,camera)=>{previous?.(renderer,scene,camera);apply(renderer,scene,camera)};

function injectUI(){
  const host=document.getElementById('threeHost');if(!host||document.getElementById('partsPanel19'))return;
  const style=document.createElement('style');style.textContent=`
  #partsPanel19{position:absolute;left:12px;bottom:48px;z-index:28;display:flex;gap:6px;align-items:center;padding:7px 8px;border-radius:12px;background:rgba(20,22,26,.78);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 8px 24px rgba(0,0,0,.24);font:12px -apple-system,BlinkMacSystemFont,sans-serif;color:#fff}
  #partsPanel19 button,#partsPanel19 select{height:30px;border:1px solid rgba(255,255,255,.15);border-radius:8px;background:rgba(255,255,255,.08);color:#fff;padding:0 9px;font:inherit}
  #partsPanel19 button.off{opacity:.42;text-decoration:line-through}#partsPanel19 select option{color:#111;background:#fff}
  @media(max-width:720px){#partsPanel19{left:8px;right:8px;bottom:70px;justify-content:center;flex-wrap:wrap}}
  `;document.head.appendChild(style);
  const p=document.createElement('div');p.id='partsPanel19';p.innerHTML=`<span>Детали</span><button data-part19="face">Лицо</button><button data-part19="returns">Борт</button><button data-part19="back">Задник</button><select id="quality19" aria-label="Качество"><option value="draft">Draft</option><option value="high">High</option><option value="ultra">Ultra</option></select>`;host.appendChild(p);
  const sync=()=>{p.querySelector('[data-part19="face"]').classList.toggle('off',!settings.face);p.querySelector('[data-part19="returns"]').classList.toggle('off',!settings.returns);p.querySelector('[data-part19="back"]').classList.toggle('off',!settings.back);p.querySelector('#quality19').value=settings.quality};sync();
  p.addEventListener('click',e=>{const b=e.target.closest('[data-part19]');if(!b)return;settings[b.dataset.part19]=!settings[b.dataset.part19];saveSettings();sync()});
  p.querySelector('#quality19').addEventListener('change',e=>{settings.quality=e.target.value;saveSettings();rendererProfile='';sync()});
}
window.addEventListener('DOMContentLoaded',()=>{injectUI();new MutationObserver(injectUI).observe(document.body,{childList:true,subtree:true})});

globalThis.__colorizeSeparateParts19Debug=()=>structuredClone(debug);
globalThis.__colorizeSeparateParts19Settings=()=>structuredClone(settings);
