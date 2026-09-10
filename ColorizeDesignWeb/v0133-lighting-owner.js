import * as THREE from 'three';

const SETTINGS_KEY='colorize-lighting-v013';
let renderer=null,scene=null,rootSceneLight=null,last={};

function readSettings(){
  const defaults={mode:'main',main:{intensity:3.1,ambient:.95,angle:-28,elevation:48,shadowSoftness:3,exposure:1.04},hdr:{preset:'dayStreet',intensity:1.25,rotation:0,exposure:1.05,shadowStrength:.82,shadowSoftness:4.2}};
  try{const s=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');return {...defaults,...s,main:{...defaults.main,...(s.main||{})},hdr:{...defaults.hdr,...(s.hdr||{})}}}catch{return defaults}
}
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
function mainDirection(s){
  const a=THREE.MathUtils.degToRad(Number(s.main.angle)||0),e=THREE.MathUtils.degToRad(Number(s.main.elevation)||45);
  const v=new THREE.Vector3(Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e));
  if(v.z<.12)v.z=Math.abs(v.z)+.15;return v.normalize();
}
function hdrDirection(s){
  const base=scene?.userData?.colorizeLightingHdrDominant13;
  const v=(base?.isVector3?base.clone():new THREE.Vector3(-.45,.7,.55));
  return v.applyAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(Number(s.hdr.rotation)||0)).normalize();
}
function isLegacyWarmFill(p){
  if(!p?.isPointLight)return false;
  const hex=p.color?.getHex?.();
  return (hex===0xffd5b0&&Number(p.distance)>=30)||(Number(p.distance)===32&&Number(p.intensity)>=8);
}
function collectLights(s){
  const dirs=[],hems=[],points=[],ambients=[];
  s.traverse(o=>{if(o.isDirectionalLight)dirs.push(o);else if(o.isHemisphereLight)hems.push(o);else if(o.isPointLight)points.push(o);else if(o.isAmbientLight)ambients.push(o)});
  return {dirs,hems,points,ambients};
}
function applyFinalLighting(s){
  if(!renderer||!scene)return;
  const {dirs,hems,points,ambients}=collectLights(scene);
  const key=dirs[0];
  for(let i=1;i<dirs.length;i++)dirs[i].visible=false;
  for(const p of points)if(isLegacyWarmFill(p))p.visible=false;
  for(const a of ambients)a.visible=false;

  if(key){
    key.visible=true;key.castShadow=true;
    const dir=s.mode==='hdr'?hdrDirection(s):mainDirection(s);
    key.position.copy(dir.multiplyScalar(18));if(key.position.z<2)key.position.z=2;
    // Main light is deliberately wide enough to make slider movement clearly visible.
    key.intensity=s.mode==='hdr'?clamp(s.hdr.shadowStrength,0,1.5)*2.4:clamp(s.main.intensity,.05,8);
    key.shadow.radius=s.mode==='hdr'?clamp(s.hdr.shadowSoftness,0,12):clamp(s.main.shadowSoftness,0,12);
    key.shadow.bias=-.00012;key.shadow.normalBias=.018;
  }

  // Main mode uses only the requested key + controllable environment fill.
  // HDR mode disables hemisphere fill completely; HDRI is the environment source.
  for(const h of hems){
    h.visible=s.mode==='main';
    if(s.mode==='main'){
      h.intensity=clamp(s.main.ambient,0,3);
      h.color.set(0xffffff);h.groundColor.set(0x343844);
    }
  }

  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=s.mode==='hdr'?clamp(s.hdr.exposure,.2,3):clamp(s.main.exposure,.2,3);
  if(s.mode==='main'){
    scene.environment=null;scene.environmentIntensity=0;
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
      if(m.isShadowMaterial)m.opacity=s.mode==='hdr'?.20+.28*clamp(s.hdr.shadowStrength,0,1.5):.36;
      m.needsUpdate=true;
    }
  });

  last={mode:s.mode,keyIntensity:key?.intensity??null,ambient:hems[0]?.visible?hems[0].intensity:0,exposure:renderer.toneMappingExposure,envIntensity:scene.environmentIntensity,warmFillVisible:points.filter(isLegacyWarmFill).some(p=>p.visible),time:performance.now()};
  scene.userData.colorizeLightingOwner133=last;
}

// Imported before the older renderer wrappers. They run first; this wrapper is reached
// last, applies the chosen lighting, performs the real WebGL draw, then returns outward.
const rawRender=THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render=function(s,c){
  const host=document.getElementById('threeHost');
  const owns=!!(host&&!host.hidden&&host.contains(this.domElement));
  if(owns){renderer=this;scene=s;scene.userData.colorizeEnvironment11=scene.userData.colorizeEnvironment11||{externalLighting:true};applyFinalLighting(readSettings())}
  return rawRender.call(this,s,c);
};

window.__colorizeLightingDebug=()=>({...last});

function liveNow(){
  if(!renderer||!scene||document.getElementById('threeHost')?.hidden)return;
  applyFinalLighting(readSettings());
  // The editor normally renders continuously; this explicit invalidation guarantees an
  // immediate visual frame on browsers that throttle requestAnimationFrame while a range
  // control is being dragged.
  requestAnimationFrame(()=>{try{renderer.render(scene,scene.userData.__colorizeCamera133||undefined)}catch{}});
}

window.addEventListener('DOMContentLoaded',()=>{
  document.addEventListener('input',e=>{if(e.target.closest?.('.lighting-v013'))requestAnimationFrame(()=>applyFinalLighting(readSettings()))},true);
  document.addEventListener('change',e=>{if(e.target.closest?.('.lighting-v013'))requestAnimationFrame(()=>applyFinalLighting(readSettings()))},true);
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-light-mode],[data-hdr-card],.mode[data-mode="view3d"]'))setTimeout(()=>applyFinalLighting(readSettings()),0)},true);
});
