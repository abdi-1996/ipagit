import * as THREE from 'three';

const SETTINGS_KEY='colorize-lighting-v013';
let renderer=null,scene=null;

function readSettings(){
  const defaults={mode:'main',main:{intensity:3.1,ambient:.95,angle:-28,elevation:48,shadowSoftness:3,exposure:1.04},hdr:{preset:'dayStreet',intensity:1.25,rotation:0,exposure:1.05,shadowStrength:.82,shadowSoftness:4.2}};
  try{
    const s=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');
    return {...defaults,...s,main:{...defaults.main,...(s.main||{})},hdr:{...defaults.hdr,...(s.hdr||{})}};
  }catch{return defaults}
}
function clamp(v,a,b){return Math.min(b,Math.max(a,Number(v)||0))}
function active3D(){const host=document.getElementById('threeHost');return !!(host&&!host.hidden)}
function mainDirection(s){
  const a=THREE.MathUtils.degToRad(Number(s.main.angle)||0),e=THREE.MathUtils.degToRad(Number(s.main.elevation)||45);
  const v=new THREE.Vector3(Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e));
  if(v.z<.12)v.z=Math.abs(v.z)+.15;
  return v.normalize();
}
function hdrDirection(s){
  const base=scene?.userData?.colorizeLightingHdrDominant13;
  const v=(base?.isVector3?base.clone():new THREE.Vector3(-.45,.7,.55));
  return v.applyAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(Number(s.hdr.rotation)||0)).normalize();
}
function applyFinalLighting(s){
  if(!renderer||!scene)return;
  const dirs=[],hems=[];
  scene.traverse(o=>{if(o.isDirectionalLight)dirs.push(o);else if(o.isHemisphereLight)hems.push(o)});
  const key=dirs[0];

  for(let i=1;i<dirs.length;i++)dirs[i].visible=false;
  if(key){
    key.visible=true;
    key.castShadow=true;
    const dir=s.mode==='hdr'?hdrDirection(s):mainDirection(s);
    key.position.copy(dir.multiplyScalar(18));
    if(key.position.z<2)key.position.z=2;
    key.intensity=s.mode==='hdr'?clamp(s.hdr.shadowStrength,0,1.5)*3:clamp(s.main.intensity,.05,8);
    key.shadow.radius=s.mode==='hdr'?clamp(s.hdr.shadowSoftness,0,12):clamp(s.main.shadowSoftness,0,12);
    key.shadow.bias=-.00012;
    key.shadow.normalBias=.018;
  }

  for(const h of hems){
    h.visible=s.mode==='main';
    if(s.mode==='main')h.intensity=clamp(s.main.ambient,0,3);
  }

  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=s.mode==='hdr'?clamp(s.hdr.exposure,.2,3):clamp(s.main.exposure,.2,3);

  if(s.mode==='main'){
    scene.environment=null;
    scene.environmentIntensity=0;
  }else{
    scene.environmentIntensity=clamp(s.hdr.intensity,0,3);
    if(scene.environmentRotation)scene.environmentRotation.set(0,THREE.MathUtils.degToRad(Number(s.hdr.rotation)||0),0);
  }

  const envStrength=s.mode==='hdr'?clamp(s.hdr.intensity,0,3):0;
  scene.traverse(o=>{
    if(!o.isMesh||!o.material)return;
    const mats=Array.isArray(o.material)?o.material:[o.material];
    for(const m of mats){
      if('envMapIntensity' in m)m.envMapIntensity=envStrength;
      if(m.isShadowMaterial)m.opacity=s.mode==='hdr'?.22+.24*clamp(s.hdr.shadowStrength,0,1.5):.34;
      m.needsUpdate=true;
    }
  });

  scene.userData.colorizeLightingOwner132={
    mode:s.mode,
    mainIntensity:key?.intensity??null,
    exposure:renderer.toneMappingExposure,
    envIntensity:scene.environmentIntensity,
    appliedAt:performance.now()
  };
}

// IMPORTANT: this module is imported BEFORE v0.11/v0.12/v0.13 lighting wrappers.
// Their pre-render hooks run first, then this hook runs immediately before the real WebGL draw.
// That makes this the final lighting owner for every visible frame.
const previousRender=THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render=function(s,c){
  const host=document.getElementById('threeHost');
  const owns=!!(host&&!host.hidden&&host.contains(this.domElement));
  if(owns){
    renderer=this;
    scene=s;
    scene.userData.colorizeEnvironment11=scene.userData.colorizeEnvironment11||{externalLighting:true};
    applyFinalLighting(readSettings());
  }
  return previousRender.call(this,s,c);
};

function liveNow(){if(!active3D()||!renderer||!scene)return;applyFinalLighting(readSettings())}
window.addEventListener('DOMContentLoaded',()=>{
  document.addEventListener('input',e=>{if(e.target.closest?.('.lighting-v013'))requestAnimationFrame(liveNow)},true);
  document.addEventListener('change',e=>{if(e.target.closest?.('.lighting-v013'))requestAnimationFrame(liveNow)},true);
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-light-mode],[data-hdr-card],.mode[data-mode="view3d"]'))setTimeout(liveNow,0)},true);
  window.addEventListener('resize',()=>requestAnimationFrame(liveNow),{passive:true});
});
