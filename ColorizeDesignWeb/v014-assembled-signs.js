import * as THREE from 'three';

const STORE='colorize-assembled-v014';
const PROJECT_KEYS=['colorize-design-web-v04','colorize-design-web-v03','colorize-design-web-v02','colorize-design-web-v01'];
const DEFAULT={
  assemblyType:'faceLit',
  acrylicLook:'milk',
  returnFinish:'matte',
  backFinish:'matte',
  externalBacking:'none',
  backingFinish:'matte',
  backingColor:'#ffffff',
  edgeStyle:'trimcap',
  jointSeam:true
};
const ASSEMBLIES={
  flatAcrylic:'Плоская акриловая',
  flatPvc:'Плоская ПВХ',
  nonLit:'Объёмная несветовая',
  faceLit:'Face Lit',
  trimless:'Trimless Face Lit',
  halo:'Halo / контражур',
  faceHalo:'Face + Halo',
  pushThrough:'Push-through'
};
const ACRYLIC={
  clear:'Прозрачный',
  milk:'Молочный светорассеивающий',
  translucent:'Цветной полупрозрачный',
  opaqueGloss:'Непрозрачный глянцевый',
  matte:'Матовый'
};
const PVC={factory:'Заводской ПВХ',matte:'Крашеный матовый',satin:'Крашеный сатин',gloss:'Крашеный глянцевый'};

let state=load();
let debug={version:'0.14.0',objects:0,overlays:0,lastObject:null};
let lastScene=null,lastRenderer=null,lastCamera=null;

function load(){
  try{
    const s=JSON.parse(localStorage.getItem(STORE)||'{}');
    return {current:{...DEFAULT,...(s.current||{})},byObject:{...(s.byObject||{})}};
  }catch{return {current:{...DEFAULT},byObject:{}}}
}
function save(){try{localStorage.setItem(STORE,JSON.stringify(state))}catch{}}
function readProject(){
  for(const key of PROJECT_KEYS){try{const raw=localStorage.getItem(key);if(raw)return JSON.parse(raw)}catch{}}
  return null;
}
function projectInfo(){
  const p=readProject();if(!p)return {project:null,artboard:null,texts:[],selected:null};
  const a=p.artboards?.find(x=>x.id===p.activeArtboardId)||p.artboards?.[0]||null;
  const texts=a?.objects?.filter(x=>x.type==='text')||[];
  const selected=texts.find(x=>x.id===p.selectedObjectId)||null;
  return {project:p,artboard:a,texts,selected};
}
function infer(o){
  let assemblyType='nonLit';
  if(o?.lightMode==='both')assemblyType='faceHalo';
  else if(o?.lightMode==='halo')assemblyType='halo';
  else if(o?.lightMode==='face')assemblyType='faceLit';
  else if(Number(o?.returnDepth||0)<=Math.max(12,Number(o?.faceThickness||0)*2))assemblyType=o?.faceMaterial==='pvc'?'flatPvc':'flatAcrylic';
  return {...DEFAULT,assemblyType};
}
function configFor(o){return {...infer(o),...(state.byObject?.[o?.id]||{})}}
function currentConfig(){
  const {selected}=projectInfo();
  return selected?configFor(selected):{...DEFAULT,...state.current};
}
function setCurrent(next,writeObject=true){
  const cfg={...currentConfig(),...next};state.current={...cfg};
  const {selected}=projectInfo();if(writeObject&&selected){state.byObject||={};state.byObject[selected.id]={...cfg}}
  save();syncPanel(cfg);requestDraw();return cfg;
}
function color(hex,fallback='#ffffff'){try{return new THREE.Color(hex||fallback)}catch{return new THREE.Color(fallback)}}
function isTextPrimary(m){return !!(m?.isMesh&&m.geometry?.type==='TextGeometry'&&Array.isArray(m.material)&&m.material.length>=2)}
function isTextSingle(m){return !!(m?.isMesh&&m.geometry?.type==='TextGeometry'&&!Array.isArray(m.material))}
function mats(m){return Array.isArray(m)?m:[m]}
function ensurePhysical(mesh,index=0){
  if(!mesh?.material)return null;
  if(Array.isArray(mesh.material)){
    let old=mesh.material[index];if(!old)return null;if(old.isMeshPhysicalMaterial)return old;
    const next=new THREE.MeshPhysicalMaterial({color:old.color?.clone?.()||new THREE.Color(1,1,1),emissive:old.emissive?.clone?.()||new THREE.Color(0,0,0),emissiveIntensity:Number(old.emissiveIntensity)||0,opacity:old.opacity??1,transparent:!!old.transparent,side:old.side??THREE.FrontSide});
    next.userData={...(old.userData||{})};mesh.material[index]=next;old.dispose?.();return next;
  }
  const old=mesh.material;if(old.isMeshPhysicalMaterial)return old;
  const next=new THREE.MeshPhysicalMaterial({color:old.color?.clone?.()||new THREE.Color(1,1,1),emissive:old.emissive?.clone?.()||new THREE.Color(0,0,0),emissiveIntensity:Number(old.emissiveIntensity)||0,opacity:old.opacity??1,transparent:!!old.transparent,side:old.side??THREE.FrontSide});
  next.userData={...(old.userData||{})};mesh.material=next;old.dispose?.();return next;
}
function lightSettings(){try{return JSON.parse(localStorage.getItem('colorize-lighting-v013')||'{}')}catch{return {}}}
function envStrength(mult=1){const l=lightSettings();return l.mode==='hdr'?Math.max(.15,Number(l.hdr?.intensity)||1.25)*mult:.32*mult}

function tuneAcrylic(m,look,o){
  if(!m)return;
  m.userData.colorizeMaterialKind='acrylic';m.metalness=0;m.ior=1.49;m.specularIntensity=1;m.sheen=.03;m.sheenRoughness=.5;
  m.envMapIntensity=envStrength(look==='clear'?1.45:look==='milk'?1.08:1.2);
  m.transparent=false;m.opacity=1;
  if(look==='clear'){
    m.roughness=.055;m.clearcoat=1;m.clearcoatRoughness=.025;m.transmission=.88;m.thickness=.58;m.attenuationDistance=4.5;
  }else if(look==='milk'){
    m.roughness=.19;m.clearcoat=.92;m.clearcoatRoughness=.09;m.transmission=.18;m.thickness=1.05;m.attenuationDistance=.72;
  }else if(look==='translucent'){
    m.roughness=.13;m.clearcoat=.92;m.clearcoatRoughness=.06;m.transmission=.42;m.thickness=.82;m.attenuationDistance=1.35;
  }else if(look==='opaqueGloss'){
    m.roughness=.12;m.clearcoat=.96;m.clearcoatRoughness=.055;m.transmission=0;m.thickness=.3;m.attenuationDistance=3;
  }else{
    m.roughness=.56;m.clearcoat=.12;m.clearcoatRoughness=.45;m.transmission=.015;m.thickness=.4;m.attenuationDistance=2;
  }
  if(m.attenuationColor)m.attenuationColor.copy(m.color);
  const lit=o?.lightMode==='face'||o?.lightMode==='both';
  if(lit){m.emissive=color(o.lightColor||'#ffffff');m.emissiveIntensity=Math.max(.08,Number(o.lightIntensity)||.7)*2.15}
  else{m.emissive.set(0x000000);m.emissiveIntensity=0}
  m.needsUpdate=true;
}
function tunePvc(m,finish){
  if(!m)return;m.userData.colorizeMaterialKind='pvc';m.metalness=0;m.transmission=0;m.ior=1.47;m.specularIntensity=.55;m.envMapIntensity=envStrength(finish==='gloss'?1.05:finish==='satin'?.72:.36);
  if(finish==='gloss'){m.roughness=.16;m.clearcoat=.78;m.clearcoatRoughness=.075}
  else if(finish==='satin'){m.roughness=.43;m.clearcoat=.30;m.clearcoatRoughness=.26}
  else if(finish==='factory'){m.roughness=.64;m.clearcoat=.09;m.clearcoatRoughness=.42}
  else{m.roughness=.79;m.clearcoat=.035;m.clearcoatRoughness=.65}
  m.needsUpdate=true;
}
function tuneOther(m,kind){
  if(!m)return;
  if(kind==='acrylic')return;
  if(kind==='metal'||kind==='aluminum'||kind==='stainless'||kind==='painted')m.envMapIntensity=envStrength(1.15);
  else if(kind==='acm')m.envMapIntensity=envStrength(.72);
}
function overlayMaterial(kind,cfg,o){
  if(kind==='acrylic'){
    const m=new THREE.MeshPhysicalMaterial({color:color(o.faceColor||'#ffffff')});tuneAcrylic(m,cfg.acrylicLook,o);return m;
  }
  if(kind==='pvc'){
    const m=new THREE.MeshPhysicalMaterial({color:color(o.sideColor||'#ffffff')});tunePvc(m,cfg.returnFinish);return m;
  }
  return new THREE.MeshPhysicalMaterial({color:color(o.sideColor||'#ffffff'),metalness:.72,roughness:.24,clearcoat:.32,envMapIntensity:envStrength(1.1)});
}
function localDepth(mesh){
  const g=mesh.geometry;g.computeBoundingBox?.();const b=g.boundingBox;return Math.max(.001,(b?.max?.z||.5)-(b?.min?.z||-.5));
}
function ensureAssemblyOverlays(mesh,o,cfg){
  let group=mesh.children.find(x=>x.userData?.colorizeAssemblyOverlay14);
  if(!group){group=new THREE.Group();group.userData.colorizeAssemblyOverlay14=true;mesh.add(group)}
  const d=localDepth(mesh),faceLocal=Math.min(d*.30,Math.max(d*.025,(Number(o.faceThickness)||3)/45));
  const flat=cfg.assemblyType==='flatAcrylic'||cfg.assemblyType==='flatPvc';
  const wantsFace=cfg.assemblyType!=='halo';
  const wantsTrim=(cfg.assemblyType==='faceLit'||cfg.assemblyType==='faceHalo')&&cfg.edgeStyle==='trimcap';
  const wantsBacking=cfg.externalBacking!=='none'||cfg.assemblyType==='pushThrough';

  let trim=group.children.find(x=>x.userData?.part==='trim');
  if(!trim){
    const mat=new THREE.MeshPhysicalMaterial({color:0xf2f2ef,metalness:0,roughness:.32,clearcoat:.38,clearcoatRoughness:.16,envMapIntensity:envStrength(.65)});
    trim=new THREE.Mesh(mesh.geometry.clone(),mat);trim.userData.part='trim';trim.renderOrder=1;group.add(trim)
  }
  trim.visible=wantsTrim&&!flat;
  if(trim.visible){trim.scale.set(1.018,1.018,Math.max(.025,(faceLocal*1.35)/d));trim.position.z=d/2-faceLocal*.78;trim.material.color.copy(color(o.sideColor||'#f4f4f0'));trim.material.needsUpdate=true}

  let cap=group.children.find(x=>x.userData?.part==='faceCap');
  if(!cap){cap=new THREE.Mesh(mesh.geometry.clone(),overlayMaterial('acrylic',cfg,o));cap.userData.part='faceCap';cap.renderOrder=2;group.add(cap)}
  cap.visible=wantsFace;
  if(cap.visible){
    cap.scale.set(1,1,Math.max(.018,faceLocal/d));cap.position.z=d/2-faceLocal/2+.002;
    const cm=cap.material;if(cfg.assemblyType==='flatPvc'){cm.color.copy(color(o.faceColor));tunePvc(cm,cfg.returnFinish)}else{cm.color.copy(color(o.faceColor));tuneAcrylic(cm,cfg.acrylicLook,o)}
  }

  let seam=group.children.find(x=>x.userData?.part==='seam');
  if(!seam){const eg=new THREE.EdgesGeometry(mesh.geometry,28);seam=new THREE.LineSegments(eg,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.24,depthWrite:false}));seam.userData.part='seam';seam.renderOrder=3;group.add(seam)}
  seam.visible=!!cfg.jointSeam&&!flat;seam.material.opacity=cfg.edgeStyle==='trimless'?.14:.24;

  let backing=group.children.find(x=>x.userData?.part==='backing');
  if(!backing){backing=new THREE.Mesh(mesh.geometry.clone(),new THREE.MeshPhysicalMaterial({color:color(cfg.backingColor)}));backing.userData.part='backing';backing.renderOrder=0;group.add(backing)}
  backing.visible=wantsBacking;
  if(backing.visible){
    backing.material.color.copy(color(cfg.backingColor));tunePvc(backing.material,cfg.backingFinish);
    const panel=cfg.externalBacking==='panel'||cfg.assemblyType==='pushThrough';
    backing.scale.set(panel?1.14:1.075,panel?1.24:1.075,.035);
    backing.position.z=-d/2-.045;
  }

  for(const ch of group.children){if(ch.material?.isMeshPhysicalMaterial&&'envMapIntensity' in ch.material){
    if(ch.userData.part==='faceCap'&&cfg.assemblyType!=='flatPvc')ch.material.envMapIntensity=envStrength(cfg.acrylicLook==='clear'?1.45:1.08);
    else if(ch.userData.part==='backing')ch.material.envMapIntensity=envStrength(cfg.backingFinish==='gloss'?1.0:.38);
  }}
  return group.children.filter(x=>x.visible).length;
}
function findBackFor(primary,singles,used){
  let best=null,bestScore=Infinity;
  for(const s of singles){if(used.has(s)||s.material?.isMeshBasicMaterial)continue;const dx=s.position.x-primary.position.x,dy=s.position.y-primary.position.y,dz=s.position.z-primary.position.z;const score=Math.abs(dx)+Math.abs(dy)+Math.abs(dz)*.12;if(score<bestScore){bestScore=score;best=s}}
  if(best)used.add(best);return best;
}
function applyToScene(renderer,scene){
  const host=document.getElementById('threeHost');if(!host||host.hidden||!host.contains(renderer.domElement))return;
  lastRenderer=renderer;lastScene=scene;
  const {texts}=projectInfo();const primaries=[],singles=[];
  scene.traverse(x=>{if(isTextPrimary(x))primaries.push(x);else if(isTextSingle(x))singles.push(x)});
  const used=new Set();let overlays=0;
  for(let i=0;i<Math.min(texts.length,primaries.length);i++){
    const o=texts[i],mesh=primaries[i],cfg=configFor(o);
    const face=ensurePhysical(mesh,0),side=ensurePhysical(mesh,1);
    if(o.faceMaterial==='acrylic'||cfg.assemblyType==='faceLit'||cfg.assemblyType==='trimless'||cfg.assemblyType==='faceHalo'||cfg.assemblyType==='flatAcrylic'||cfg.assemblyType==='pushThrough')tuneAcrylic(face,cfg.acrylicLook,o);
    else if(o.faceMaterial==='pvc'||cfg.assemblyType==='flatPvc')tunePvc(face,cfg.returnFinish);
    else tuneOther(face,o.faceMaterial);
    if(o.returnMaterial==='pvc')tunePvc(side,cfg.returnFinish);else tuneOther(side,o.returnMaterial);
    const back=findBackFor(mesh,singles,used);if(back){const bm=ensurePhysical(back);if(o.backMaterial==='pvc')tunePvc(bm,cfg.backFinish);else if(o.backMaterial==='acrylic')tuneAcrylic(bm,'milk',{...o,lightMode:o.lightMode==='halo'||o.lightMode==='both'?'face':'off'});else tuneOther(bm,o.backMaterial)}
    overlays+=ensureAssemblyOverlays(mesh,o,cfg);
    mesh.userData.colorizeAssemblyType14=cfg.assemblyType;
    debug.lastObject={id:o.id,assemblyType:cfg.assemblyType,acrylicLook:cfg.acrylicLook,returnFinish:cfg.returnFinish,backFinish:cfg.backFinish,edgeStyle:cfg.edgeStyle,faceRoughness:face?.roughness??null,faceTransmission:face?.transmission??null,sideRoughness:side?.roughness??null};
  }
  debug={...debug,version:'0.14.0',objects:Math.min(texts.length,primaries.length),overlays,at:performance.now()};
}

function requestDraw(){
  globalThis.__colorizeLightingUseStored?.();
  requestAnimationFrame(()=>{if(lastRenderer&&lastScene&&lastCamera)try{lastRenderer.render(lastScene,lastCamera)}catch{}});
}
function setBase(key,value){
  const el=document.querySelector(`#constructionPanel [data-c="${key}"]`);if(!el)return;
  if(el.type==='checkbox')el.checked=!!value;else el.value=String(value);
  el.dispatchEvent(new Event(el.type==='range'?'input':'change',{bubbles:true}));
}
function applyAssemblyToBase(type){
  if(type==='flatAcrylic'){setBase('constructionType','letter');setBase('volume',false);setBase('faceMaterial','acrylic');setBase('backType','none');setBase('lightMode','off')}
  else if(type==='flatPvc'){setBase('constructionType','letter');setBase('volume',false);setBase('faceMaterial','pvc');setBase('backType','none');setBase('lightMode','off')}
  else if(type==='nonLit'){setBase('constructionType','letter');setBase('volume',true);setBase('returnMaterial','pvc');setBase('backType','internal');setBase('backMaterial','pvc');setBase('lightMode','off')}
  else if(type==='halo'){setBase('constructionType','letter');setBase('volume',true);setBase('faceMaterial','metal');setBase('returnMaterial','pvc');setBase('backType','internal');setBase('backMaterial','acrylic');setBase('wallGap',20);setBase('lightMode','halo')}
  else if(type==='faceHalo'){setBase('constructionType','letter');setBase('volume',true);setBase('faceMaterial','acrylic');setBase('returnMaterial','pvc');setBase('backType','internal');setBase('backMaterial','acrylic');setBase('wallGap',20);setBase('lightMode','both')}
  else if(type==='pushThrough'){setBase('constructionType','letter');setBase('volume',true);setBase('faceMaterial','acrylic');setBase('returnMaterial','pvc');setBase('backType','shared');setBase('backMaterial','pvc');setBase('lightMode','face')}
  else {setBase('constructionType','letter');setBase('volume',true);setBase('faceMaterial','acrylic');setBase('returnMaterial','pvc');setBase('backType','internal');setBase('backMaterial','pvc');setBase('lightMode','face')}
}
function options(map){return Object.entries(map).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
function injectPanel(){
  const scroll=document.querySelector('#constructionPanel .construction-scroll');if(!scroll||document.getElementById('assemblyType14'))return;
  const sec=document.createElement('div');sec.className='construction-section construction-material-v014';
  sec.innerHTML=`<b>Реальный вид собранной буквы <em>v0.14</em></b>
    <label><span>Тип сборки</span><select id="assemblyType14" data-v014="assemblyType">${options(ASSEMBLIES)}</select></label>
    <label><span>Акрил</span><select id="acrylicLook14" data-v014="acrylicLook">${options(ACRYLIC)}</select></label>
    <label><span>Борт ПВХ</span><select id="returnFinish14" data-v014="returnFinish">${options(PVC)}</select></label>
    <label><span>Задник ПВХ</span><select id="backFinish14" data-v014="backFinish">${options(PVC)}</select></label>
    <label><span>Наружная подложка</span><select id="externalBacking14" data-v014="externalBacking"><option value="none">Нет</option><option value="contour">Контурная ПВХ</option><option value="panel">Панель ПВХ</option></select></label>
    <label><span>Подложка ПВХ</span><select id="backingFinish14" data-v014="backingFinish">${options(PVC)}</select></label>
    <label><span>Цвет подложки</span><input id="backingColor14" data-v014="backingColor" type="color"></label>
    <label><span>Кромка лица</span><select id="edgeStyle14" data-v014="edgeStyle"><option value="trimcap">Trim-cap</option><option value="trimless">Trimless</option></select></label>
    <label class="check"><span>Показывать стык</span><input id="jointSeam14" data-v014="jointSeam" type="checkbox"></label>
    <div class="assembly-note14">Акрил реагирует на HDR и свет сильнее ПВХ. Глянец отражает окружение, сатин размывает отражение, матовый ПВХ показывает широкий мягкий блик. Лицевая панель, борт, задник и подложка визуально разделены.</div>`;
  scroll.insertBefore(sec,scroll.children[1]||scroll.firstChild);
  sec.querySelectorAll('[data-v014]').forEach(el=>{
    const evt=el.type==='color'||el.type==='checkbox'?'input':'change';
    el.addEventListener(evt,()=>{
      const key=el.dataset.v014,val=el.type==='checkbox'?el.checked:el.value;
      const cfg=setCurrent({[key]:val});if(key==='assemblyType'){applyAssemblyToBase(val);if(val==='trimless')setCurrent({edgeStyle:'trimless'});else if(val==='faceLit'&&cfg.edgeStyle==='trimless')setCurrent({edgeStyle:'trimcap'})}
    });
  });
  syncPanel();
}
function syncPanel(cfg=currentConfig()){
  document.querySelectorAll('#constructionPanel [data-v014]').forEach(el=>{const v=cfg[el.dataset.v014];if(el.type==='checkbox')el.checked=!!v;else if(v!=null)el.value=String(v)});
  const label=document.querySelector('#constructionPreview .construction-preview-label');if(label)label.textContent=`A · ${ASSEMBLIES[cfg.assemblyType]||'реальная сборка'}`;
}
function watchSelection(){
  let last='';setInterval(()=>{const id=projectInfo().selected?.id||'';if(id!==last){last=id;syncPanel()}},350);
}

const previousBefore=globalThis.__colorizeBeforeThreeRender;
globalThis.__colorizeBeforeThreeRender=(renderer,scene,camera)=>{
  previousBefore?.(renderer,scene,camera);lastCamera=camera;applyToScene(renderer,scene);
};

globalThis.__colorizeAssemblyDebug=()=>structuredClone(debug);
globalThis.__colorizeAssemblySetConfig=(next)=>{const cfg=setCurrent(next||{});return {...cfg}};

window.addEventListener('DOMContentLoaded',()=>{
  injectPanel();
  const obs=new MutationObserver(()=>injectPanel());obs.observe(document.body,{subtree:true,childList:true});
  document.addEventListener('click',e=>{if(e.target.closest?.('#constructionBtn,[data-cpreset],.mode[data-mode="view3d"]'))setTimeout(()=>{injectPanel();syncPanel();requestDraw()},80)},true);
  watchSelection();
});
