import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

const STORE='colorize-construction-v012';
const PROJECT_KEYS=['colorize-design-web-v04','colorize-design-web-v03','colorize-design-web-v02','colorize-design-web-v01'];
const DEFAULT={constructionType:'letter',volume:false,faceMaterial:'acrylic',faceColor:'#ffffff',faceThickness:3,returnMaterial:'pvc',sideColor:'#ffffff',returnDepth:50,backType:'none',backMaterial:'pvc',backColor:'#ffffff',backThickness:5,backOffset:25,wallGap:8,lightMode:'off',lightColor:'#ffffff',lightIntensity:.75};
const PRESETS={
  acrylic:{...DEFAULT,constructionType:'letter',volume:false,faceMaterial:'acrylic',faceThickness:3},
  pvc:{...DEFAULT,constructionType:'letter',volume:false,faceMaterial:'pvc',faceThickness:10},
  channel:{...DEFAULT,constructionType:'letter',volume:true,faceMaterial:'acrylic',faceThickness:3,returnMaterial:'metal',returnDepth:80,backType:'internal',backMaterial:'pvc',backThickness:5,lightMode:'face'},
  halo:{...DEFAULT,constructionType:'letter',volume:true,faceMaterial:'metal',faceThickness:2,returnMaterial:'metal',returnDepth:50,backType:'internal',backMaterial:'acrylic',backThickness:5,wallGap:20,lightMode:'halo'},
  lightbox:{...DEFAULT,constructionType:'lightbox',volume:true,faceMaterial:'acrylic',faceThickness:3,returnMaterial:'acm',returnDepth:120,backType:'internal',backMaterial:'acm',backThickness:3,lightMode:'face'},
  colorbox:{...DEFAULT,constructionType:'colorbox',volume:true,faceMaterial:'acm',faceThickness:3,returnMaterial:'acm',returnDepth:100,backType:'internal',backMaterial:'acm',backThickness:3,lightMode:'off'}
};
let data=load();let cfg={...DEFAULT,...(data.current||{})};
let renderer,scene,camera,controls,root,font,raf;

function load(){try{return JSON.parse(localStorage.getItem(STORE)||'{"byObject":{}}')}catch{return {byObject:{}}}}
function save(){data.current={...cfg};data.byObject||={};localStorage.setItem(STORE,JSON.stringify(data))}
function readProject(){for(const k of PROJECT_KEYS){try{const raw=localStorage.getItem(k);if(raw)return JSON.parse(raw)}catch{}}return null}
function selectedText(){const p=readProject();const a=p?.artboards?.find(x=>x.id===p.activeArtboardId)||p?.artboards?.[0];const o=a?.objects?.find(x=>x.id===p.selectedObjectId);return o?.type==='text'?o:null}
function material(kind,hex,lit=false){
  const c=new THREE.Color(hex||'#ffffff');
  if(kind==='metal')return new THREE.MeshPhysicalMaterial({color:c,metalness:.95,roughness:.2,clearcoat:.28,clearcoatRoughness:.12,emissive:lit?c:new THREE.Color(0),emissiveIntensity:lit?.7:0});
  if(kind==='acm')return new THREE.MeshPhysicalMaterial({color:c,metalness:.48,roughness:.32,clearcoat:.22,clearcoatRoughness:.18,emissive:lit?c:new THREE.Color(0),emissiveIntensity:lit?.5:0});
  if(kind==='pvc')return new THREE.MeshPhysicalMaterial({color:c,metalness:0,roughness:.74,clearcoat:.04,emissive:lit?c:new THREE.Color(0),emissiveIntensity:lit?.5:0});
  return new THREE.MeshPhysicalMaterial({color:c,metalness:0,roughness:.16,clearcoat:1,clearcoatRoughness:.06,transmission:.08,thickness:.3,ior:1.49,emissive:lit?c:new THREE.Color(0),emissiveIntensity:lit?.85:0});
}
function sideKind(v){return v==='acm'?'acm':v==='metal'?'metal':v}

function injectButton(){
  const group=document.querySelector('.mode-group');if(!group||document.getElementById('constructionBtn'))return;
  const b=document.createElement('button');b.id='constructionBtn';b.className='construction-btn';b.textContent='Конструкция';group.insertBefore(b,document.getElementById('lightingBtn'));
  b.onclick=()=>togglePanel();
}
function injectPanel(){
  const viewport=document.getElementById('viewport');if(!viewport||document.getElementById('constructionPanel'))return;
  const p=document.createElement('section');p.id='constructionPanel';p.className='construction-panel';p.hidden=true;
  p.innerHTML=`<div class="construction-head"><div><strong>Конструкция</strong><span>3D сборка буквы / короба</span></div><button id="constructionClose">×</button></div>
  <div id="constructionPreview" class="construction-preview"><div class="construction-preview-label">A · реальная сборка</div></div>
  <div class="construction-presets"><button data-cpreset="acrylic">Акрил 3 мм</button><button data-cpreset="pvc">ПВХ</button><button data-cpreset="channel">Световая</button><button data-cpreset="halo">Контражур</button><button data-cpreset="lightbox">Лайтбокс</button><button data-cpreset="colorbox">Цветовой короб</button></div>
  <div class="construction-scroll">
    <div class="construction-section"><b>Тип</b><label><span>Конструкция</span><select data-c="constructionType"><option value="letter">Объёмная буква</option><option value="lightbox">Лайтбокс</option><option value="colorbox">Цветовой короб</option></select></label><label class="check"><span>Добавить объём</span><input data-c="volume" type="checkbox"></label></div>
    <div class="construction-section"><b>Лицевая часть</b><label><span>Материал</span><select data-c="faceMaterial"><option value="acrylic">Акрил</option><option value="pvc">ПВХ</option><option value="metal">Металл</option><option value="acm">Алюкобонд</option></select></label><label><span>Цвет</span><input data-c="faceColor" type="color"></label><label><span>Толщина, мм</span><input data-c="faceThickness" type="number" min="1" max="30" step="1"></label></div>
    <div class="construction-section"><b>Борт / объём</b><label><span>Материал</span><select data-c="returnMaterial"><option value="pvc">ПВХ</option><option value="metal">Металл</option><option value="acrylic">Акрил</option><option value="acm">Алюкобонд</option></select></label><label><span>Цвет</span><input data-c="sideColor" type="color"></label><label><span>Глубина, мм</span><input data-c="returnDepth" type="number" min="3" max="300" step="1"></label></div>
    <div class="construction-section"><b>Задник / подложка</b><label><span>Тип</span><select data-c="backType"><option value="none">Без задника</option><option value="internal">Внутренний</option><option value="external">Наружный</option><option value="shared">Общая подложка</option></select></label><label><span>Материал</span><select data-c="backMaterial"><option value="pvc">ПВХ</option><option value="acrylic">Акрил</option><option value="metal">Металл</option><option value="acm">Алюкобонд</option></select></label><label><span>Цвет</span><input data-c="backColor" type="color"></label><label><span>Толщина, мм</span><input data-c="backThickness" type="number" min="1" max="30" step="1"></label><label><span>Отступ, мм</span><input data-c="backOffset" type="number" min="0" max="200" step="1"></label><label><span>От стены, мм</span><input data-c="wallGap" type="number" min="0" max="150" step="1"></label></div>
    <div class="construction-section"><b>Подсветка</b><label><span>Режим</span><select data-c="lightMode"><option value="off">Выкл</option><option value="face">Лицевая</option><option value="halo">Контражур</option><option value="both">Лицо + контражур</option><option value="side">Боковая</option></select></label><label><span>Цвет света</span><input data-c="lightColor" type="color"></label><label><span>Яркость</span><input data-c="lightIntensity" type="range" min="0" max="1.5" step=".05"><output id="constructionLightOut"></output></label></div>
  </div>
  <div class="construction-footer"><button id="constructionApply" class="primary">Применить к выбранной вывеске</button><div id="constructionStatus">Настройки сохраняются вместе с проектом.</div></div>`;
  viewport.appendChild(p);
  p.querySelector('#constructionClose').onclick=()=>togglePanel(false);
  p.querySelectorAll('[data-cpreset]').forEach(b=>b.onclick=()=>{cfg={...PRESETS[b.dataset.cpreset]};syncInputs();save();rebuildPreview()});
  p.querySelectorAll('[data-c]').forEach(el=>{const key=el.dataset.c;const evt=el.type==='range'?'input':'change';el.addEventListener(evt,()=>{cfg[key]=el.type==='checkbox'?el.checked:el.type==='number'||el.type==='range'?Number(el.value):el.value;save();syncInputs(false);rebuildPreview()})});
  p.querySelector('#constructionApply').onclick=applyToProject;
  syncInputs();initPreview();
}
function syncInputs(all=true){
  const p=document.getElementById('constructionPanel');if(!p)return;
  p.querySelectorAll('[data-c]').forEach(el=>{const v=cfg[el.dataset.c];if(el.type==='checkbox')el.checked=!!v;else el.value=String(v)});
  const out=p.querySelector('#constructionLightOut');if(out)out.textContent=Number(cfg.lightIntensity||0).toFixed(2);
  if(all){p.querySelectorAll('[data-cpreset]').forEach(b=>b.classList.remove('active'))}
}
function togglePanel(force){
  const p=document.getElementById('constructionPanel');if(!p)return;const open=force===undefined?p.hidden:!!force;p.hidden=!open;document.getElementById('constructionBtn')?.classList.toggle('active',open);
  if(open){document.getElementById('rightPanel')?.classList.remove('open');const l=document.getElementById('lightingPanel');if(l)l.hidden=true;document.getElementById('lightingBtn')?.classList.remove('active');setTimeout(()=>{resizePreview();rebuildPreview();document.getElementById('fitBtn')?.click()},180)}
}
function setProp(key,val){const el=document.querySelector(`#properties [data-prop="${key}"]`);if(!el)return false;el.value=String(val);el.dispatchEvent(new Event('input',{bubbles:true}));return true}
function applyToProject(){
  const o=selectedText(),status=document.getElementById('constructionStatus');if(!o){if(status)status.textContent='Сначала выберите текстовую вывеску в проекте.';return}
  data.byObject||={};data.byObject[o.id]={...cfg};save();
  const retMap={pvc:'pvc',acrylic:'acrylic',metal:'painted',acm:'aluminum'};
  const backMap={pvc:'pvc',acrylic:'acrylic',metal:'metal',acm:'acm'};
  const lm=cfg.lightMode==='side'?'halo':cfg.lightMode;
  setProp('faceMaterial',cfg.faceMaterial);setProp('faceColor',cfg.faceColor);setProp('faceThickness',cfg.faceThickness);
  setProp('returnMaterial',retMap[cfg.returnMaterial]||'pvc');setProp('sideColor',cfg.sideColor);setProp('returnDepth',cfg.volume?cfg.returnDepth:Math.max(cfg.faceThickness,3));
  setProp('backMaterial',backMap[cfg.backMaterial]||'pvc');setProp('backColor',cfg.backColor);setProp('backThickness',cfg.backThickness);setProp('wallGap',cfg.wallGap);
  setProp('lightMode',lm);setProp('lightColor',cfg.lightColor);setProp('lightIntensity',cfg.lightIntensity);
  if(status)status.textContent=`Применено к «${o.text||o.name||'вывеске'}». 2D и 3D используют одни настройки.`;
  setTimeout(()=>document.querySelector('.mode[data-mode="view3d"]')?.click(),220);
}

async function initPreview(){
  const host=document.getElementById('constructionPreview');if(!host||renderer)return;
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.prepend(renderer.domElement);
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(34,1,.05,100);camera.position.set(3.8,2.7,7.2);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.target.set(0,.6,.3);
  const hemi=new THREE.HemisphereLight(0xffffff,0x30343b,1.25);scene.add(hemi);const key=new THREE.DirectionalLight(0xffffff,4.0);key.position.set(-4,7,8);key.castShadow=true;key.shadow.mapSize.set(1024,1024);scene.add(key);const rim=new THREE.DirectionalLight(0xb8d6ff,1.1);rim.position.set(6,2,5);scene.add(rim);
  try{const {RoomEnvironment}=await import('three/addons/environments/RoomEnvironment.js');const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),rt=pmrem.fromScene(room,.04);scene.environment=rt.texture;room.dispose?.();pmrem.dispose()}catch{}
  try{font=await new Promise((res,rej)=>new FontLoader().load('https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/helvetiker_bold.typeface.json',res,undefined,rej))}catch{}
  new ResizeObserver(resizePreview).observe(host);resizePreview();rebuildPreview();animate();
}
function clearRoot(){if(root){scene.remove(root);root.traverse(o=>{o.geometry?.dispose?.();const ms=Array.isArray(o.material)?o.material:o.material?[o.material]:[];ms.forEach(m=>m.dispose?.())})}root=new THREE.Group();scene.add(root)}
function rebuildPreview(){
  if(!scene||!font)return;clearRoot();const litFace=cfg.lightMode==='face'||cfg.lightMode==='both';
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(7,5),new THREE.MeshPhysicalMaterial({color:0xe8e6e1,roughness:.92}));wall.position.set(0,.6,-.18);wall.receiveShadow=true;root.add(wall);
  if(cfg.constructionType==='letter'){
    const depth=cfg.volume?Math.max(.06,cfg.returnDepth/65):Math.max(.035,cfg.faceThickness/90);const g=new TextGeometry('A',{font,size:3,depth,curveSegments:48,bevelEnabled:true,bevelThickness:.035,bevelSize:.025,bevelSegments:6});toCreasedNormals(g, Math.PI / 6);g.computeBoundingBox();g.center();
    const face=material(cfg.faceMaterial,cfg.faceColor,litFace),side=material(sideKind(cfg.returnMaterial),cfg.sideColor,false);const m=new THREE.Mesh(g,[face,side]);m.castShadow=true;m.receiveShadow=true;m.position.z=.08+depth/2+cfg.wallGap/90;root.add(m);
    if(cfg.backType!=='none')addBacking(3.25,3.55);
  }else{
    const w=5,h=2.6,d=Math.max(.25,cfg.returnDepth/70);const side=material(sideKind(cfg.returnMaterial),cfg.sideColor,false);const box=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),side);box.position.z=d/2+.06;box.castShadow=true;box.receiveShadow=true;root.add(box);
    const fm=material(cfg.faceMaterial,cfg.faceColor,litFace);const face=new THREE.Mesh(new THREE.PlaneGeometry(w*.96,h*.92),fm);face.position.z=d+.065;root.add(face);if(cfg.backType!=='none')addBacking(w,h);
  }
  if(cfg.lightMode!=='off'){
    const c=new THREE.Color(cfg.lightColor);const p=new THREE.PointLight(c,18*Math.max(.1,cfg.lightIntensity),7,2);p.position.set(0,.4,.25);root.add(p);
    if(cfg.lightMode==='halo'||cfg.lightMode==='both'||cfg.lightMode==='side'){const ring=new THREE.Mesh(new THREE.PlaneGeometry(5,3.8),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.08*Math.max(.2,cfg.lightIntensity),blending:THREE.AdditiveBlending,depthWrite:false}));ring.position.z=-.12;root.add(ring)}
  }
}
function addBacking(w,h){const pad=Math.max(.03,cfg.backOffset/100);const mat=material(cfg.backMaterial,cfg.backColor,false),d=Math.max(.025,cfg.backThickness/80);const b=new THREE.Mesh(new THREE.BoxGeometry(w+pad,h+pad,d),mat);b.position.z=-.02;b.castShadow=true;b.receiveShadow=true;root.add(b)}
function resizePreview(){const host=document.getElementById('constructionPreview');if(!renderer||!host)return;const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
function animate(){raf=requestAnimationFrame(animate);controls?.update();renderer?.render(scene,camera)}

window.addEventListener('DOMContentLoaded',()=>{injectButton();injectPanel();const obs=new MutationObserver(()=>{injectButton();injectPanel()});obs.observe(document.body,{subtree:true,childList:true})});
