import * as THREE from 'three';

const PROJECT_KEYS=['colorize-design-web-v04','colorize-design-web-v03','colorize-design-web-v02','colorize-design-web-v01'];
const SETTINGS_KEY='colorize-realtime-3d-v011';
const mobile=()=>matchMedia('(max-width:900px)').matches;

const PRESETS={
  studio:{exposure:1.03,reflections:1.30,key:3.25,ambient:.92,shadow:3.0,keyColor:'#fff7ee',rimColor:'#bfd8ff'},
  day:{exposure:1.00,reflections:1.10,key:3.75,ambient:1.08,shadow:2.4,keyColor:'#fffaf0',rimColor:'#d2e4ff'},
  evening:{exposure:1.08,reflections:1.22,key:2.65,ambient:.58,shadow:4.0,keyColor:'#ffc98f',rimColor:'#91aaff'},
  night:{exposure:1.15,reflections:.88,key:1.35,ambient:.34,shadow:5.0,keyColor:'#b7d0ff',rimColor:'#758fff'}
};
const DEFAULTS={preset:'studio',quality:'balanced',...PRESETS.studio};
let settings=loadSettings();
let capturedRenderer=null,capturedScene=null,capturedCamera=null;
let applying=false;

function loadSettings(){
  try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}}catch{return {...DEFAULTS}}
}
function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings))}catch{}}

// Use the old engine's internal high-quality branch permanently, but do not expose
// a separate Render mode to the user. It gives denser bevels and physical base materials.
for(const key of PROJECT_KEYS){
  try{
    const raw=localStorage.getItem(key);if(!raw)continue;
    const p=JSON.parse(raw);if(p&&p.view3dRender!==true){p.view3dRender=true;localStorage.setItem(key,JSON.stringify(p))}
    break;
  }catch{}
}

function materialKind(m){
  if(m?.userData?.colorizeMaterialKind)return m.userData.colorizeMaterialKind;
  const metal=Number(m?.metalness)||0,rough=Number(m?.roughness)||0;
  if(metal>=.72)return 'metal';
  if(metal>=.18)return 'acm';
  if(rough>=.62)return 'pvc';
  return 'acrylic';
}
function physicalFrom(source,kind){
  if(source?.isMeshPhysicalMaterial){source.userData.colorizeMaterialKind=kind;return source}
  const m=new THREE.MeshPhysicalMaterial({
    color:source?.color?.clone?.()||new THREE.Color('#ffffff'),
    emissive:source?.emissive?.clone?.()||new THREE.Color('#000000'),
    emissiveIntensity:Number(source?.emissiveIntensity)||0,
    opacity:source?.opacity??1,
    transparent:!!source?.transparent,
    side:source?.side??THREE.FrontSide
  });
  m.userData.colorizeMaterialKind=kind;
  source?.dispose?.();
  return m;
}
function tuneMaterial(source){
  if(!source||source.isMeshBasicMaterial)return source;
  const kind=materialKind(source),m=physicalFrom(source,kind);
  m.envMapIntensity=settings.reflections;
  if(kind==='acrylic'){
    m.metalness=0;m.roughness=.16;m.clearcoat=1;m.clearcoatRoughness=.055;
    m.transmission=.10;m.thickness=.34;m.ior=1.49;m.specularIntensity=1.0;
    m.sheen=.05;m.sheenRoughness=.42;
    if(m.attenuationColor)m.attenuationColor.copy(m.color);
    m.attenuationDistance=3.2;
  }else if(kind==='pvc'){
    m.metalness=0;m.roughness=.70;m.clearcoat=.045;m.clearcoatRoughness=.52;
    m.transmission=0;m.specularIntensity=.48;m.sheen=.07;m.sheenRoughness=.86;
  }else if(kind==='metal'){
    m.metalness=.97;m.roughness=.19;m.clearcoat=.32;m.clearcoatRoughness=.12;
    m.transmission=0;m.specularIntensity=1.0;
  }else{
    m.metalness=.54;m.roughness=.31;m.clearcoat=.26;m.clearcoatRoughness=.17;
    m.transmission=0;m.specularIntensity=.88;
  }
  m.needsUpdate=true;return m;
}
function enhanceTextMesh(mesh){
  if(mesh.userData?.colorizePBR11)return;
  if(mesh.geometry?.type!=='TextGeometry')return;
  if(Array.isArray(mesh.material))mesh.material=mesh.material.map(tuneMaterial);
  else mesh.material=tuneMaterial(mesh.material);
  mesh.castShadow=true;mesh.receiveShadow=true;
  mesh.userData.colorizePBR11=true;
}

async function ensureEnvironment(renderer,scene){
  if(scene.userData.colorizeEnvironment11||scene.userData.colorizeEnvironmentLoading11)return;
  scene.userData.colorizeEnvironmentLoading11=true;
  try{
    const {RoomEnvironment}=await import('three/addons/environments/RoomEnvironment.js');
    if(capturedScene!==scene||capturedRenderer!==renderer){scene.userData.colorizeEnvironmentLoading11=false;return}
    const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();
    const room=new RoomEnvironment();const rt=pmrem.fromScene(room,.04);
    room.dispose?.();pmrem.dispose();
    scene.environment=rt.texture;scene.environmentIntensity=settings.reflections;
    scene.userData.colorizeEnvironment11=rt;
    scene.userData.colorizeEnvironmentLoading11=false;
  }catch{scene.userData.colorizeEnvironmentLoading11=false}
}
function configureQuality(renderer,scene){
  const high=settings.quality==='high';
  const dpr=devicePixelRatio||1;
  const ratio=mobile()?(high?Math.min(dpr,1.75):Math.min(dpr,1.28)):(high?Math.min(dpr,2):Math.min(dpr,1.55));
  if(renderer.userData.colorizePixelRatio11!==ratio){renderer.userData.colorizePixelRatio11=ratio;renderer.setPixelRatio(ratio)}
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=settings.exposure;
  const shadowSize=high?(mobile()?2048:4096):(mobile()?1024:2048);
  const dirs=[];scene.traverse(o=>{if(o.isDirectionalLight)dirs.push(o)});
  for(const l of dirs){
    if(l.shadow.mapSize.width!==shadowSize||l.shadow.mapSize.height!==shadowSize){
      l.shadow.mapSize.set(shadowSize,shadowSize);if(l.shadow.map){l.shadow.map.dispose();l.shadow.map=null}
    }
    l.shadow.radius=settings.shadow;l.shadow.bias=-.00012;l.shadow.normalBias=.018;
  }
}
function applyLighting(scene){
  const preset=PRESETS[settings.preset]||PRESETS.studio;
  scene.environmentIntensity=settings.reflections;
  const dirs=[],hems=[];
  scene.traverse(o=>{if(o.isDirectionalLight)dirs.push(o);else if(o.isHemisphereLight)hems.push(o)});
  if(hems[0]){hems[0].intensity=settings.ambient;hems[0].color.set('#ffffff');hems[0].groundColor.set(settings.preset==='night'?'#111827':'#39404a')}
  if(dirs[0]){dirs[0].intensity=settings.key;dirs[0].color.set(preset.keyColor);dirs[0].shadow.radius=settings.shadow}
  if(dirs[1]){dirs[1].intensity=Math.max(.25,settings.key*.34);dirs[1].color.set(preset.rimColor)}
}
function applyScene(renderer,scene){
  if(applying)return;applying=true;
  try{
    configureQuality(renderer,scene);applyLighting(scene);
    scene.traverse(o=>{if(o.isMesh)enhanceTextMesh(o)});
    ensureEnvironment(renderer,scene);
  }finally{applying=false}
}

// Capture only the editor's real 3D canvas. v0.5 still owns the exact 2D→3D camera framing.
const previousRender=THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render=function(scene,camera){
  const host=document.getElementById('threeHost');
  if(host&&!host.hidden&&host.contains(this.domElement)){
    capturedRenderer=this;capturedScene=scene;capturedCamera=camera;applyScene(this,scene);
  }
  return previousRender.call(this,scene,camera);
};

function forceRealtimeQuality(){
  const b=document.getElementById('view3dRenderBtn');
  if(b&&!b.classList.contains('active'))b.click();
}
function setPreset(name){
  const p=PRESETS[name]||PRESETS.studio;settings={...settings,preset:name,...p};saveSettings();syncPanel();if(capturedRenderer&&capturedScene)applyScene(capturedRenderer,capturedScene)
}
function updateSetting(key,value){
  settings[key]=value;saveSettings();syncPanel();if(capturedRenderer&&capturedScene)applyScene(capturedRenderer,capturedScene)
}
function lightingPanelMarkup(){return `
  <div class="lighting-head"><strong>3D · материалы и свет</strong><button id="lightingClose">×</button></div>
  <div class="lighting-section">
    <label class="lighting-row wide"><span>Сцена</span><select id="rtScenePreset"><option value="studio">Studio</option><option value="day">День</option><option value="evening">Вечер</option><option value="night">Ночь</option></select></label>
    <label class="lighting-row wide"><span>Качество</span><select id="rtQuality"><option value="balanced">Balanced</option><option value="high">High</option></select></label>
  </div>
  <div class="lighting-section">
    <label class="lighting-row"><span>Экспозиция</span><input id="rtExposure" type="range" min=".65" max="1.6" step=".01"><output></output></label>
    <label class="lighting-row"><span>Отражения</span><input id="rtReflections" type="range" min="0" max="2.5" step=".05"><output></output></label>
    <label class="lighting-row"><span>Основной свет</span><input id="rtKey" type="range" min=".2" max="6" step=".05"><output></output></label>
    <label class="lighting-row"><span>Общий свет</span><input id="rtAmbient" type="range" min=".1" max="2.5" step=".05"><output></output></label>
    <label class="lighting-row"><span>Мягкость тени</span><input id="rtShadow" type="range" min="0" max="8" step=".25"><output></output></label>
  </div>
  <div class="lighting-section material-guide">
    <div><b>Акрил</b><span>глянец · прозрачность · глубокий блик</span></div>
    <div><b>ПВХ</b><span>матовая плотная поверхность</span></div>
    <div><b>Металл</b><span>реальные отражения и металлический блеск</span></div>
    <div><b>Композит</b><span>полуматовая окрашенная поверхность</span></div>
    <div class="lighting-note">Отдельного Render больше нет: материалы, отражения, подсветка и тени отображаются сразу в 3D.</div>
  </div>`}
function makePanel(){
  if(document.getElementById('lightingPanel'))return;
  const viewport=document.getElementById('viewport');if(!viewport)return;
  const p=document.createElement('section');p.id='lightingPanel';p.className='lighting-panel realtime-lighting-panel';p.hidden=true;p.innerHTML=lightingPanelMarkup();viewport.appendChild(p);
  p.querySelector('#lightingClose').onclick=()=>togglePanel(false);
  p.querySelector('#rtScenePreset').onchange=e=>setPreset(e.target.value);
  p.querySelector('#rtQuality').onchange=e=>updateSetting('quality',e.target.value);
  const ranges={rtExposure:['exposure',Number],rtReflections:['reflections',Number],rtKey:['key',Number],rtAmbient:['ambient',Number],rtShadow:['shadow',Number]};
  for(const [id,[key,cast]] of Object.entries(ranges))p.querySelector('#'+id).oninput=e=>updateSetting(key,cast(e.target.value));
  syncPanel();
}
function syncPanel(){
  const p=document.getElementById('lightingPanel');if(!p)return;
  const set=(id,val,digits=2)=>{const el=p.querySelector('#'+id);if(!el)return;el.value=String(val);const out=el.parentElement.querySelector('output');if(out)out.textContent=Number(val).toFixed(digits)};
  p.querySelector('#rtScenePreset').value=settings.preset;p.querySelector('#rtQuality').value=settings.quality;
  set('rtExposure',settings.exposure);set('rtReflections',settings.reflections);set('rtKey',settings.key);set('rtAmbient',settings.ambient);set('rtShadow',settings.shadow,1);
}
function togglePanel(force){
  const p=document.getElementById('lightingPanel');if(!p)return;
  const show=force===undefined?p.hidden:!!force;p.hidden=!show;document.getElementById('lightingBtn')?.classList.toggle('active',show);
}
function cleanUi(){
  document.getElementById('globalRenderBtn')?.remove();
  const internal=document.getElementById('view3dRenderBtn');if(internal)internal.style.display='none';
  const text='Один и тот же контур используется в 2D и 3D — форма букв не меняется.';
  const note=document.querySelector('.colorize-font-note');if(note&&note.textContent!==text)note.textContent=text;
  const host=document.getElementById('threeHost');
  const badge=document.getElementById('modeBadge');
  if(host&&!host.hidden&&badge&&badge.textContent!=='3D · реалистичные PBR материалы')badge.textContent='3D · реалистичные PBR материалы';
}

window.addEventListener('DOMContentLoaded',()=>{
  makePanel();cleanUi();forceRealtimeQuality();
  const lightBtn=document.getElementById('lightingBtn');if(lightBtn)lightBtn.onclick=()=>togglePanel();
  document.addEventListener('click',e=>{
    const mode=e.target.closest?.('.mode');if(mode?.dataset.mode==='view3d')setTimeout(()=>{forceRealtimeQuality();cleanUi()},0);
  },true);
  const obs=new MutationObserver(()=>cleanUi());obs.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class']});
  window.addEventListener('resize',()=>{if(capturedRenderer&&capturedScene)applyScene(capturedRenderer,capturedScene)},{passive:true});
});
