import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const SETTINGS_KEY='colorize-lighting-v013';
const HDRS={
  studio:{label:'Studio',kind:'studio',note:'Нейтральная студия'},
  dayStreet:{label:'Дневная улица',kind:'hdr',url:'https://threejs.org/examples/textures/equirectangular/royal_esplanade_1k.hdr',note:'Городской дневной свет'},
  nightStreet:{label:'Ночная улица',kind:'hdr',url:'https://threejs.org/examples/textures/equirectangular/moonless_golf_1k.hdr',note:'Ночное окружение'},
  city:{label:'Город',kind:'hdr',url:'https://threejs.org/examples/textures/equirectangular/pedestrian_overpass_1k.hdr',note:'Городские отражения'},
  sunset:{label:'Закат',kind:'hdr',url:'https://threejs.org/examples/textures/equirectangular/venice_sunset_1k.hdr',note:'Тёплый вечерний свет'}
};
const DEFAULTS={
  mode:'main',
  main:{intensity:3.1,ambient:.95,angle:-28,elevation:48,shadowSoftness:3.0,exposure:1.04},
  hdr:{preset:'dayStreet',intensity:1.25,rotation:0,exposure:1.05,shadowStrength:.82,shadowSoftness:4.2}
};
let settings=loadSettings();
let renderer=null,scene=null,camera=null;
let envInfo=null,envLoading='',envToken=0,customHdrUrl=null;
let hdrDominant=new THREE.Vector3(-.45,.7,.55).normalize();

function deepMerge(base,extra){
  return {...base,...extra,main:{...base.main,...(extra?.main||{})},hdr:{...base.hdr,...(extra?.hdr||{})}};
}
function loadSettings(){
  try{return deepMerge(DEFAULTS,JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'))}catch{return structuredClone(DEFAULTS)}
}
function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings))}catch{}}
function clamp(v,a,b){return Math.min(b,Math.max(a,Number(v)||0))}
function actual3D(){const host=document.getElementById('threeHost');return !!(host&&!host.hidden)}
function getLights(s){
  const dirs=[],hems=[];s?.traverse?.(o=>{if(o.isDirectionalLight)dirs.push(o);else if(o.isHemisphereLight)hems.push(o)});return {dirs,hems};
}
function setLegacy(id,value,eventName='input'){
  const el=document.getElementById(id);if(!el)return;
  const next=String(value);if(el.value===next)return;
  el.value=next;el.dispatchEvent(new Event(eventName,{bubbles:true}));
}
function syncLegacyEngine(){
  // v0.11 remains the material renderer. These hidden controls are its public bridge,
  // so the viewport updates without rebuilding the whole 3D scene.
  setLegacy('rtScenePreset','studio','change');
  if(settings.mode==='main'){
    setLegacy('rtExposure',settings.main.exposure);
    setLegacy('rtReflections',.04);
    setLegacy('rtKey',settings.main.intensity);
    setLegacy('rtAmbient',settings.main.ambient);
    setLegacy('rtShadow',settings.main.shadowSoftness);
  }else{
    setLegacy('rtExposure',settings.hdr.exposure);
    setLegacy('rtReflections',settings.hdr.intensity);
    setLegacy('rtKey',Math.max(.25,settings.hdr.shadowStrength*3.0));
    setLegacy('rtAmbient',.1);
    setLegacy('rtShadow',settings.hdr.shadowSoftness);
  }
}
function disposeEnv(info){
  try{info?.target?.dispose?.();info?.source?.dispose?.()}catch{}
}
function deriveDominant(texture){
  const image=texture?.image,data=image?.data,w=image?.width,h=image?.height;
  if(!data||!w||!h)return new THREE.Vector3(-.45,.7,.55).normalize();
  let best=-1,bx=Math.round(w*.35),by=Math.round(h*.28);
  const step=Math.max(1,Math.floor(Math.max(w,h)/420));
  for(let y=0;y<h;y+=step){
    // Avoid the extreme poles where single hot pixels can dominate an equirectangular map.
    const v=y/Math.max(1,h-1);if(v<.025||v>.975)continue;
    for(let x=0;x<w;x+=step){
      const i=(y*w+x)*4;const r=data[i]||0,g=data[i+1]||0,b=data[i+2]||0;
      const lum=.2126*r+.7152*g+.0722*b;
      const solid=Math.max(.08,Math.sin(v*Math.PI));
      const score=lum*solid;
      if(score>best){best=score;bx=x;by=y}
    }
  }
  const u=bx/Math.max(1,w-1),v=by/Math.max(1,h-1);
  const theta=u*Math.PI*2-Math.PI,phi=v*Math.PI;
  const dir=new THREE.Vector3(Math.sin(phi)*Math.sin(theta),Math.cos(phi),Math.sin(phi)*Math.cos(theta));
  if(dir.z<.12)dir.z=Math.abs(dir.z)+.18;
  return dir.normalize();
}
async function makeStudioEnv(r){
  const {RoomEnvironment}=await import('three/addons/environments/RoomEnvironment.js');
  const pmrem=new THREE.PMREMGenerator(r);const room=new RoomEnvironment();const target=pmrem.fromScene(room,.04);room.dispose?.();pmrem.dispose();
  return {target,source:null,dominant:new THREE.Vector3(-.5,.65,.58).normalize()};
}
async function makeHdrEnv(r,url){
  const loader=new RGBELoader();loader.setDataType?.(THREE.FloatType);
  const source=await loader.loadAsync(url);source.mapping=THREE.EquirectangularReflectionMapping;
  const dominant=deriveDominant(source);
  const pmrem=new THREE.PMREMGenerator(r);pmrem.compileEquirectangularShader();const target=pmrem.fromEquirectangular(source);pmrem.dispose();
  return {target,source,dominant};
}
async function loadEnvironment(force=false){
  if(!renderer||!scene||settings.mode!=='hdr')return;
  const key=settings.hdr.preset||'dayStreet';
  const item=HDRS[key];
  const identity=key==='custom'?`custom:${customHdrUrl||''}`:key;
  if(!force&&envInfo?.identity===identity){scene.environment=envInfo.target.texture;return}
  if(envLoading===identity)return;
  envLoading=identity;const token=++envToken;setHdrStatus('Загрузка HDR…');
  try{
    let next;
    if(key==='custom'){
      if(!customHdrUrl)throw new Error('custom HDR missing');
      next=await makeHdrEnv(renderer,customHdrUrl);
    }else if(item?.kind==='studio')next=await makeStudioEnv(renderer);
    else next=await makeHdrEnv(renderer,item?.url||HDRS.dayStreet.url);
    if(token!==envToken){disposeEnv(next);return}
    disposeEnv(envInfo);envInfo={...next,identity};hdrDominant=next.dominant||hdrDominant;
    scene.environment=next.target.texture;scene.background=null;
    setHdrStatus(key==='custom'?'Мой HDR загружен':`${item?.label||'HDR'} · готово`);
    applyLive();
  }catch(err){
    setHdrStatus('Не удалось загрузить HDR');
  }finally{if(token===envToken)envLoading=''}
}
function rotateY(v,deg){
  const r=THREE.MathUtils.degToRad(deg);return v.clone().applyAxisAngle(new THREE.Vector3(0,1,0),r);
}
function mainDirection(){
  const a=THREE.MathUtils.degToRad(settings.main.angle),e=THREE.MathUtils.degToRad(settings.main.elevation);
  const v=new THREE.Vector3(Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e));
  if(v.z<.12)v.z=Math.abs(v.z)+.15;return v.normalize();
}
function tuneMaterials(s){
  const strength=settings.mode==='hdr'?settings.hdr.intensity:.04;
  s?.traverse?.(o=>{
    if(!o.isMesh||!o.material)return;
    const list=Array.isArray(o.material)?o.material:[o.material];
    for(const m of list){if('envMapIntensity' in m)m.envMapIntensity=strength}
    if(o.material?.isShadowMaterial)o.material.opacity=settings.mode==='hdr'?.30+.20*settings.hdr.shadowStrength:.30;
    if(Array.isArray(o.material))for(const m of o.material)if(m?.isShadowMaterial)m.opacity=settings.mode==='hdr'?.30+.20*settings.hdr.shadowStrength:.30;
  });
}
function applyLive(){
  if(!scene||!renderer)return;
  const {dirs,hems}=getLights(scene);
  const main=dirs[0];
  for(let i=1;i<dirs.length;i++)dirs[i].visible=false;
  if(main){
    main.visible=true;main.castShadow=true;
    const dir=settings.mode==='hdr'?rotateY(hdrDominant,settings.hdr.rotation):mainDirection();
    main.position.copy(dir.multiplyScalar(18));
    if(main.position.z<2)main.position.z=2;
    main.shadow.radius=settings.mode==='hdr'?settings.hdr.shadowSoftness:settings.main.shadowSoftness;
    main.shadow.bias=-.00012;main.shadow.normalBias=.018;
  }
  for(const h of hems)h.visible=settings.mode==='main';
  if(settings.mode==='main'){
    scene.environmentIntensity=.04;
    renderer.toneMappingExposure=settings.main.exposure;
  }else{
    scene.environmentIntensity=settings.hdr.intensity;
    renderer.toneMappingExposure=settings.hdr.exposure;
    if(scene.environmentRotation)scene.environmentRotation.set(0,THREE.MathUtils.degToRad(settings.hdr.rotation),0);
    if(envInfo?.target?.texture&&scene.environment!==envInfo.target.texture)scene.environment=envInfo.target.texture;
    loadEnvironment();
  }
  tuneMaterials(scene);
}

function panelMarkup(){
  return `<div class="lighting-v013">
    <div class="light-mode-switch" role="tablist">
      <button data-light-mode="main">Основной свет</button>
      <button data-light-mode="hdr">HDR</button>
    </div>
    <section class="light-mode-page" data-light-page="main">
      <div class="light-explain">Обычный источник света сцены. HDR полностью отключён.</div>
      ${rangeRow('Яркость','mainIntensity',.2,6,.05)}
      ${rangeRow('Угол','mainAngle',-180,180,1,'°')}
      ${rangeRow('Высота','mainElevation',5,85,1,'°')}
      ${rangeRow('Мягкость тени','mainShadow',0,8,.25)}
      ${rangeRow('Общий свет','mainAmbient',.1,2.5,.05)}
      ${rangeRow('Экспозиция','mainExposure',.65,1.6,.01)}
    </section>
    <section class="light-mode-page" data-light-page="hdr">
      <div class="light-explain">Настоящий HDRI: окружение, отражения и направление тени обновляются прямо во viewport.</div>
      <div class="hdr-card-grid">
        ${Object.entries(HDRS).map(([k,v])=>`<button class="hdr-card" data-hdr-card="${k}"><span>${v.label}</span><small>${v.kind==='hdr'?'.HDR · ':''}${v.note}</small></button>`).join('')}
      </div>
      <label class="hdr-upload-v013">Мой .HDR<input id="hdrUpload13" type="file" accept=".hdr,image/vnd.radiance" hidden></label>
      <div id="hdrStatus13" class="hdr-status-v013"></div>
      ${rangeRow('Интенсивность','hdrIntensity',0,2.5,.05)}
      ${rangeRow('Поворот HDR','hdrRotation',-180,180,1,'°')}
      ${rangeRow('Экспозиция','hdrExposure',.65,1.6,.01)}
      ${rangeRow('Сила тени','hdrShadowStrength',0,1.5,.05)}
      ${rangeRow('Мягкость тени','hdrShadowSoftness',0,8,.25)}
    </section>
  </div>`;
}
function rangeRow(label,id,min,max,step,suffix=''){
  return `<label class="lighting-row live-light-row"><span>${label}</span><input id="${id}" type="range" min="${min}" max="${max}" step="${step}"><output data-suffix="${suffix}"></output></label>`;
}
function buildPanel(){
  const p=document.getElementById('lightingPanel');if(!p||p.querySelector('.lighting-v013'))return;
  p.classList.add('lighting-v013-panel');
  const title=p.querySelector('.lighting-head strong');if(title)title.textContent='Освещение';
  // Keep old controls alive as a bridge to the existing renderer, but do not show them.
  [...p.children].filter(x=>x.classList?.contains('lighting-section')).forEach(x=>x.classList.add('legacy-lighting-v013'));
  p.insertAdjacentHTML('beforeend',panelMarkup());
  const oldHdr=document.getElementById('hdrPreset12');
  if(oldHdr){oldHdr.value='studio';oldHdr.dispatchEvent(new Event('change',{bubbles:true}))}
  bindPanel();syncPanel();syncLegacyEngine();
}
function bindRange(id,get,set,formatter){
  const el=document.getElementById(id);if(!el)return;
  el.addEventListener('input',()=>{set(Number(el.value));saveSettings();syncLegacyEngine();syncPanel(false);applyLive()});
}
function bindPanel(){
  document.querySelectorAll('[data-light-mode]').forEach(b=>b.addEventListener('click',()=>{
    settings.mode=b.dataset.lightMode;saveSettings();syncLegacyEngine();syncPanel();applyLive();if(settings.mode==='hdr')loadEnvironment(true);
  }));
  document.querySelectorAll('[data-hdr-card]').forEach(b=>b.addEventListener('click',()=>{
    settings.mode='hdr';settings.hdr.preset=b.dataset.hdrCard;saveSettings();syncLegacyEngine();syncPanel();loadEnvironment(true);applyLive();
  }));
  bindRange('mainIntensity',()=>settings.main.intensity,v=>settings.main.intensity=v);
  bindRange('mainAngle',()=>settings.main.angle,v=>settings.main.angle=v);
  bindRange('mainElevation',()=>settings.main.elevation,v=>settings.main.elevation=v);
  bindRange('mainShadow',()=>settings.main.shadowSoftness,v=>settings.main.shadowSoftness=v);
  bindRange('mainAmbient',()=>settings.main.ambient,v=>settings.main.ambient=v);
  bindRange('mainExposure',()=>settings.main.exposure,v=>settings.main.exposure=v);
  bindRange('hdrIntensity',()=>settings.hdr.intensity,v=>settings.hdr.intensity=v);
  bindRange('hdrRotation',()=>settings.hdr.rotation,v=>settings.hdr.rotation=v);
  bindRange('hdrExposure',()=>settings.hdr.exposure,v=>settings.hdr.exposure=v);
  bindRange('hdrShadowStrength',()=>settings.hdr.shadowStrength,v=>settings.hdr.shadowStrength=v);
  bindRange('hdrShadowSoftness',()=>settings.hdr.shadowSoftness,v=>settings.hdr.shadowSoftness=v);
  const upload=document.getElementById('hdrUpload13');
  if(upload)upload.addEventListener('change',e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(customHdrUrl)URL.revokeObjectURL(customHdrUrl);customHdrUrl=URL.createObjectURL(file);
    HDRS.custom={label:'Мой HDR',kind:'hdr',note:file.name};settings.mode='hdr';settings.hdr.preset='custom';saveSettings();
    let custom=document.querySelector('[data-hdr-card="custom"]');
    if(!custom){custom=document.createElement('button');custom.className='hdr-card';custom.dataset.hdrCard='custom';custom.innerHTML=`<span>Мой HDR</span><small>${file.name}</small>`;document.querySelector('.hdr-card-grid')?.appendChild(custom);custom.onclick=()=>{settings.mode='hdr';settings.hdr.preset='custom';saveSettings();syncPanel();loadEnvironment(true)}}
    else custom.querySelector('small').textContent=file.name;
    syncLegacyEngine();syncPanel();loadEnvironment(true);e.target.value='';
  });
}
function setOutput(id,value,digits=2){
  const el=document.getElementById(id);if(!el)return;el.value=String(value);const out=el.parentElement.querySelector('output');if(out){const suffix=out.dataset.suffix||'';out.textContent=`${Number(value).toFixed(digits)}${suffix}`}
}
function syncPanel(full=true){
  document.querySelectorAll('[data-light-mode]').forEach(b=>b.classList.toggle('active',b.dataset.lightMode===settings.mode));
  document.querySelectorAll('[data-light-page]').forEach(p=>p.hidden=p.dataset.lightPage!==settings.mode);
  document.querySelectorAll('[data-hdr-card]').forEach(b=>b.classList.toggle('active',b.dataset.hdrCard===settings.hdr.preset));
  if(!full)return;
  setOutput('mainIntensity',settings.main.intensity);setOutput('mainAngle',settings.main.angle,0);setOutput('mainElevation',settings.main.elevation,0);setOutput('mainShadow',settings.main.shadowSoftness,1);setOutput('mainAmbient',settings.main.ambient);setOutput('mainExposure',settings.main.exposure);
  setOutput('hdrIntensity',settings.hdr.intensity);setOutput('hdrRotation',settings.hdr.rotation,0);setOutput('hdrExposure',settings.hdr.exposure);setOutput('hdrShadowStrength',settings.hdr.shadowStrength);setOutput('hdrShadowSoftness',settings.hdr.shadowSoftness,1);
}
function setHdrStatus(text){const el=document.getElementById('hdrStatus13');if(el)el.textContent=text||''}

const previousRender=THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render=function(s,c){
  const host=document.getElementById('threeHost');
  if(host&&!host.hidden&&host.contains(this.domElement)){
    renderer=this;scene=s;camera=c;
    // Stop legacy environment loaders from owning the scene after this version takes over.
    scene.userData.colorizeEnvironment11=scene.userData.colorizeEnvironment11||{v013:true};
    applyLive();
  }
  return previousRender.call(this,s,c);
};

window.addEventListener('DOMContentLoaded',()=>{
  buildPanel();syncLegacyEngine();
  const observer=new MutationObserver(()=>{buildPanel();syncPanel(false)});observer.observe(document.body,{subtree:true,childList:true});
  document.addEventListener('click',e=>{if(e.target.closest?.('.mode[data-mode="view3d"]'))setTimeout(()=>{syncLegacyEngine();applyLive();if(settings.mode==='hdr')loadEnvironment()},100)},true);
  window.addEventListener('resize',()=>{if(actual3D())applyLive()},{passive:true});
});
