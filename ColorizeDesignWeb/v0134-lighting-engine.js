import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const SETTINGS_KEY='colorize-lighting-v013';
const HDRS={
  studio:null,
  dayStreet:'https://threejs.org/examples/textures/equirectangular/royal_esplanade_1k.hdr',
  nightStreet:'https://threejs.org/examples/textures/equirectangular/moonless_golf_1k.hdr',
  city:'https://threejs.org/examples/textures/equirectangular/pedestrian_overpass_1k.hdr',
  sunset:'https://threejs.org/examples/textures/equirectangular/venice_sunset_1k.hdr'
};
const DEFAULTS={
  mode:'main',
  main:{intensity:3.1,ambient:.95,angle:-28,elevation:48,shadowSoftness:3,exposure:1.04},
  hdr:{preset:'dayStreet',intensity:1.25,rotation:0,exposure:1.05,shadowStrength:.82,shadowSoftness:4.2}
};

let editorRenderer=null,editorScene=null,editorCamera=null;
let envTarget=null,envSource=null,envIdentity='',envPromise=null,envToken=0,pmremBusy=false;
let hdrDominant=new THREE.Vector3(-.45,.7,.55).normalize();
let debugState={frames:0,owns:false,version:'0.13.4'};

function readSettings(){
  try{
    const s=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');
    return {...DEFAULTS,...s,main:{...DEFAULTS.main,...(s.main||{})},hdr:{...DEFAULTS.hdr,...(s.hdr||{})}};
  }catch{return structuredClone(DEFAULTS)}
}
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
function mainDirection(s){
  const a=THREE.MathUtils.degToRad(Number(s.main.angle)||0);
  const e=THREE.MathUtils.degToRad(Number(s.main.elevation)||45);
  const v=new THREE.Vector3(Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e));
  if(v.z<.08)v.z=Math.abs(v.z)+.12;
  return v.normalize();
}
function rotateY(v,deg){return v.clone().applyAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(Number(deg)||0)).normalize()}
function isLegacyWarmFill(p){
  if(!p?.isPointLight)return false;
  return p.color?.getHex?.()===0xffd5b0 && Number(p.distance)>=30 && Number(p.intensity)>=8;
}
function collectLights(s){
  const dirs=[],hems=[],points=[],ambients=[];
  s.traverse(o=>{
    if(o.isDirectionalLight)dirs.push(o);
    else if(o.isHemisphereLight)hems.push(o);
    else if(o.isPointLight)points.push(o);
    else if(o.isAmbientLight)ambients.push(o);
  });
  return {dirs,hems,points,ambients};
}
function deriveDominant(texture){
  const image=texture?.image,data=image?.data,w=image?.width,h=image?.height;
  if(!data||!w||!h)return new THREE.Vector3(-.45,.7,.55).normalize();
  let best=-Infinity,bx=Math.round(w*.35),by=Math.round(h*.3);
  const channels=Math.max(3,Math.round(data.length/(w*h))||4);
  const step=Math.max(1,Math.floor(Math.max(w,h)/320));
  for(let y=step;y<h-step;y+=step){
    const v=y/Math.max(1,h-1),solid=Math.max(.08,Math.sin(v*Math.PI));
    for(let x=0;x<w;x+=step){
      const i=(y*w+x)*channels;
      const r=Number(data[i])||0,g=Number(data[i+1])||0,b=Number(data[i+2])||0;
      const score=(.2126*r+.7152*g+.0722*b)*solid;
      if(score>best){best=score;bx=x;by=y}
    }
  }
  const u=bx/Math.max(1,w-1),v=by/Math.max(1,h-1);
  const theta=u*Math.PI*2-Math.PI,phi=v*Math.PI;
  const dir=new THREE.Vector3(Math.sin(phi)*Math.sin(theta),Math.cos(phi),Math.sin(phi)*Math.cos(theta));
  if(dir.z<.1)dir.z=Math.abs(dir.z)+.15;
  return dir.normalize();
}
function disposeEnvironment(){
  try{envTarget?.dispose?.()}catch{}
  try{envSource?.dispose?.()}catch{}
  envTarget=null;envSource=null;envIdentity='';
}
async function buildEnvironment(renderer,preset,token){
  if(preset==='studio'){
    const {RoomEnvironment}=await import('three/addons/environments/RoomEnvironment.js');
    const room=new RoomEnvironment();
    pmremBusy=true;
    let target;
    try{
      const pmrem=new THREE.PMREMGenerator(renderer);
      target=pmrem.fromScene(room,.04);
      pmrem.dispose();
    }finally{pmremBusy=false;room.dispose?.()}
    return {target,source:null,dominant:new THREE.Vector3(-.5,.68,.54).normalize(),token};
  }
  const url=HDRS[preset]||HDRS.dayStreet;
  const source=await new RGBELoader().loadAsync(url);
  source.mapping=THREE.EquirectangularReflectionMapping;
  const dominant=deriveDominant(source);
  pmremBusy=true;
  let target;
  try{
    const pmrem=new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    target=pmrem.fromEquirectangular(source);
    pmrem.dispose();
  }finally{pmremBusy=false}
  return {target,source,dominant,token};
}
function ensureEnvironment(renderer,scene,s){
  if(s.mode!=='hdr')return;
  const preset=s.hdr.preset||'dayStreet';
  // Custom file is still handled by the v0.13 uploader when available. Built-in HDRs are
  // owned here so their environment is guaranteed to reach the actual renderer.
  const identity=preset==='custom'?'custom':preset;
  if(identity==='custom')return;
  if(envIdentity===identity&&envTarget){
    if(scene.environment!==envTarget.texture)scene.environment=envTarget.texture;
    return;
  }
  if(envPromise?.identity===identity)return;
  const token=++envToken;
  const promise=buildEnvironment(renderer,identity,token);
  envPromise={identity,promise};
  promise.then(next=>{
    if(token!==envToken){next.target?.dispose?.();next.source?.dispose?.();return}
    disposeEnvironment();
    envTarget=next.target;envSource=next.source;envIdentity=identity;hdrDominant=next.dominant||hdrDominant;
    if(editorScene===scene&&readSettings().mode==='hdr')scene.environment=envTarget.texture;
  }).catch(err=>{
    debugState.envError=String(err?.message||err);
  }).finally(()=>{if(envPromise?.promise===promise)envPromise=null});
}
function tuneMaterials(scene,s){
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
}
function applyLighting(renderer,scene,camera,s){
  const {dirs,hems,points,ambients}=collectLights(scene);
  const key=dirs[0];

  // Remove legacy helper lighting that made slider changes almost invisible.
  for(let i=1;i<dirs.length;i++)dirs[i].visible=false;
  for(const p of points)if(isLegacyWarmFill(p))p.visible=false;
  for(const a of ambients)a.visible=false;

  if(key){
    key.visible=true;key.castShadow=true;
    const direction=s.mode==='hdr'?rotateY(hdrDominant,s.hdr.rotation):mainDirection(s);
    key.position.copy(direction.multiplyScalar(18));
    if(key.position.z<1.5)key.position.z=1.5;
    key.intensity=s.mode==='hdr'?clamp(s.hdr.shadowStrength,0,1.5)*2.4:clamp(s.main.intensity,.05,8);
    key.shadow.radius=s.mode==='hdr'?clamp(s.hdr.shadowSoftness,0,12):clamp(s.main.shadowSoftness,0,12);
    key.shadow.bias=-.00012;key.shadow.normalBias=.018;
    key.target?.updateMatrixWorld?.();
  }

  for(const h of hems){
    h.visible=s.mode==='main';
    if(s.mode==='main'){
      h.intensity=clamp(s.main.ambient,0,3);
      h.color.set(0xffffff);h.groundColor.set(0x343844);
    }
  }

  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=s.mode==='hdr'?clamp(s.hdr.exposure,.2,3):clamp(s.main.exposure,.2,3);
  renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=true;

  if(s.mode==='main'){
    scene.environment=null;
    scene.environmentIntensity=0;
  }else{
    ensureEnvironment(renderer,scene,s);
    if(envTarget&&envIdentity===(s.hdr.preset||'dayStreet'))scene.environment=envTarget.texture;
    scene.environmentIntensity=clamp(s.hdr.intensity,0,3);
    if(scene.environmentRotation)scene.environmentRotation.set(0,THREE.MathUtils.degToRad(Number(s.hdr.rotation)||0),0);
  }
  tuneMaterials(scene,s);

  debugState={
    version:'0.13.4',frames:(debugState.frames||0)+1,owns:true,
    mode:s.mode,keyIntensity:key?.intensity??null,ambient:hems.find(h=>h.visible)?.intensity??0,
    exposure:renderer.toneMappingExposure,envIntensity:scene.environmentIntensity??0,
    warmFillVisible:points.filter(isLegacyWarmFill).some(p=>p.visible),
    canvasParent:renderer.domElement?.parentElement?.id||renderer.domElement?.parentElement?.className||'',
    sceneLights:{directional:dirs.length,hemisphere:hems.length,point:points.length},
    at:performance.now()
  };
}

// Guaranteed hook installed by three-colorize.js. Unlike the previous prototype patches,
// this is invoked by the actual WebGLRenderer instance on every editor frame.
globalThis.__colorizeBeforeThreeRender=(renderer,scene,camera)=>{
  if(pmremBusy)return;
  const host=document.getElementById('threeHost');
  const owns=!!(host&&!host.hidden&&host.contains(renderer.domElement));
  if(!owns){
    debugState.nonEditorFrames=(debugState.nonEditorFrames||0)+1;
    return;
  }
  editorRenderer=renderer;editorScene=scene;editorCamera=camera;
  applyLighting(renderer,scene,camera,readSettings());
};

globalThis.__colorizeLightingDebug=()=>({...debugState,hookError:globalThis.__colorizeLightingHookError||null});

function forceFrame(){
  if(!editorRenderer||!editorScene||!editorCamera)return;
  // The normal editor loop is continuous. Calling render here makes dragging a slider
  // visually immediate even on browsers that throttle animation frames during pointer input.
  try{editorRenderer.render(editorScene,editorCamera)}catch(err){debugState.forceFrameError=String(err?.message||err)}
}
window.addEventListener('DOMContentLoaded',()=>{
  const refresh=e=>{
    if(!e.target.closest?.('.lighting-v013,[data-light-mode],[data-hdr-card]'))return;
    requestAnimationFrame(forceFrame);
  };
  document.addEventListener('input',refresh,true);
  document.addEventListener('change',refresh,true);
  document.addEventListener('click',e=>{
    if(e.target.closest?.('[data-light-mode],[data-hdr-card],.mode[data-mode="view3d"]'))setTimeout(forceFrame,0);
  },true);
});
