import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const UNIT=50;
const PROJECT_KEYS=['colorize-design-web-v04','colorize-design-web-v03','colorize-design-web-v02','colorize-design-web-v01'];
const PRO_KEY='colorize-v012-pro';
const CONSTRUCTION_KEY='colorize-construction-v012';
const HDRS={
  studio:{label:'Studio',url:null},
  dayStreet:{label:'Дневная улица',url:'https://threejs.org/examples/textures/equirectangular/royal_esplanade_1k.hdr'},
  nightStreet:{label:'Ночная улица',url:'https://threejs.org/examples/textures/equirectangular/moonless_golf_1k.hdr'},
  city:{label:'Город / переход',url:'https://threejs.org/examples/textures/equirectangular/pedestrian_overpass_1k.hdr'},
  sunset:{label:'Закат',url:'https://threejs.org/examples/textures/equirectangular/venice_sunset_1k.hdr'}
};
let pro=loadPro();
let renderer=null,scene=null,camera=null,orbit=null,root=null;
let transform=null,transformHelper=null,editMode='camera',dragSnapshot=null;
let hdrToken=0,currentHdr='';

function loadPro(){try{return {hdr:'studio',...JSON.parse(localStorage.getItem(PRO_KEY)||'{}')}}catch{return {hdr:'studio'}}}
function savePro(){try{localStorage.setItem(PRO_KEY,JSON.stringify(pro))}catch{}}
function readProject(){for(const k of PROJECT_KEYS){try{const raw=localStorage.getItem(k);if(raw)return JSON.parse(raw)}catch{}}return null}
function activeArtboard(p){return p?.artboards?.find(a=>a.id===p.activeArtboardId)||p?.artboards?.[0]||null}
function getConstructionStore(){try{return JSON.parse(localStorage.getItem(CONSTRUCTION_KEY)||'{}')}catch{return {}}}
function colorToRgba(hex,a){let h=String(hex||'#ffffff').replace('#','');if(h.length===3)h=h.split('').map(x=>x+x).join('');const r=parseInt(h.slice(0,2),16)||255,g=parseInt(h.slice(2,4),16)||255,b=parseInt(h.slice(4,6),16)||255;return `rgba(${r},${g},${b},${a})`}

const previousOrbitUpdate=OrbitControls.prototype.update;
OrbitControls.prototype.update=function(...args){
  const host=document.getElementById('threeHost');
  if(host&&this.domElement&&host.contains(this.domElement))orbit=this;
  return previousOrbitUpdate.apply(this,args);
};

function disposeEnv(info){try{info?.target?.dispose?.();info?.source?.dispose?.()}catch{}}
async function applyHdr(){
  if(!renderer||!scene)return;
  const desired=pro.hdr||'studio';
  if(currentHdr===desired&&scene.userData.colorizeHdr12)return;
  currentHdr=desired;const token=++hdrToken;
  const old=scene.userData.colorizeHdr12;
  try{
    const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();
    let source=null,target=null;
    if(desired==='studio'){
      const {RoomEnvironment}=await import('three/addons/environments/RoomEnvironment.js');
      const room=new RoomEnvironment();target=pmrem.fromScene(room,.04);room.dispose?.();
    }else{
      const item=HDRS[desired]||HDRS.dayStreet;
      source=await new RGBELoader().loadAsync(item.url);source.mapping=THREE.EquirectangularReflectionMapping;target=pmrem.fromEquirectangular(source);
    }
    pmrem.dispose();
    if(token!==hdrToken){disposeEnv({target,source});return}
    disposeEnv(old);scene.environment=target.texture;
    scene.background=null;
    scene.userData.colorizeHdr12={name:desired,target,source};
  }catch(err){
    if(desired!=='studio'){pro.hdr='studio';savePro();currentHdr='';setTimeout(applyHdr,0)}
  }
}

function getMainRoot(s){
  const p=readProject(),a=activeArtboard(p);if(!a)return null;
  const groups=s.children.filter(x=>x.isGroup&&!x.userData?.colorizeTransform12);
  if(!groups.length)return null;
  let best=null,bestScore=-1;
  for(const g of groups){let score=0;g.traverse(o=>{if(o.geometry?.type==='TextGeometry')score+=4;else if(o.isMesh)score+=1});if(score>bestScore){best=g;bestScore=score}}
  return best;
}
function mapObjectMeshes(){
  const p=readProject(),a=activeArtboard(p);if(!p||!a||!root)return;
  const texts=(a.objects||[]).filter(o=>o.type==='text');
  const mains=root.children.filter(o=>o.isMesh&&o.geometry?.type==='TextGeometry'&&Array.isArray(o.material));
  mains.forEach((m,i)=>{const obj=texts[i];if(obj)m.userData.colorizeObjectId=obj.id});
}
function selectedMainMesh(){
  const p=readProject();if(!p||!root)return null;const id=p.selectedObjectId;
  return root.children.find(o=>o.userData?.colorizeObjectId===id)||null;
}

function makeSpillTexture(hex){
  const c=document.createElement('canvas');c.width=256;c.height=160;const x=c.getContext('2d');
  const g=x.createRadialGradient(128,80,3,128,80,118);g.addColorStop(0,colorToRgba(hex,.72));g.addColorStop(.32,colorToRgba(hex,.32));g.addColorStop(.72,colorToRgba(hex,.08));g.addColorStop(1,colorToRgba(hex,0));x.fillStyle=g;x.fillRect(0,0,c.width,c.height);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function removeAugments(){
  if(!root)return;
  [...root.children].filter(o=>o.userData?.colorizeAugment12).forEach(o=>{root.remove(o);o.geometry?.dispose?.();if(o.material?.map)o.material.map.dispose?.();o.material?.dispose?.()});
}
function addFacadePhysics(){
  if(!root)return;const p=readProject(),a=activeArtboard(p);if(!a)return;
  const key=JSON.stringify({id:a.id,w:a.w,h:a.h,sel:p.selectedObjectId,lights:(a.objects||[]).filter(o=>o.type==='text').map(o=>[o.id,o.lightMode,o.lightColor,o.lightIntensity,o.x,o.y,o.w,o.h,o.wallGap]),profiles:getConstructionStore()?.byObject||{}});
  if(root.userData.colorizeAugmentKey12===key)return;
  removeAugments();root.userData.colorizeAugmentKey12=key;
  const wallW=a.w/UNIT,wallH=a.h/UNIT;
  const shadowMat=new THREE.ShadowMaterial({color:0x000000,opacity:.33,transparent:true});shadowMat.depthWrite=false;
  const catcher=new THREE.Mesh(new THREE.PlaneGeometry(wallW,wallH),shadowMat);catcher.position.z=.019;catcher.receiveShadow=true;catcher.renderOrder=8;catcher.userData.colorizeAugment12=true;root.add(catcher);
  const store=getConstructionStore(),profiles=store.byObject||{};
  for(const o of (a.objects||[]).filter(x=>x.type==='text')){
    const lit=o.lightMode==='halo'||o.lightMode==='both'||o.lightMode==='face';
    if(lit){
      const intensity=Math.max(.05,Math.min(1.5,Number(o.lightIntensity)||.7));
      const tex=makeSpillTexture(o.lightColor||'#ffffff');
      const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:(o.lightMode==='face'?.18:.36)*intensity,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
      const w=Math.max(.25,o.w/UNIT*1.45),h=Math.max(.25,o.h/UNIT*2.15);
      const glow=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);glow.position.set((o.x+o.w/2-a.w/2)/UNIT,(a.h/2-(o.y+o.h/2))/UNIT,.022);glow.rotation.z=THREE.MathUtils.degToRad(-(o.rotation||0));glow.renderOrder=9;glow.userData.colorizeAugment12=true;root.add(glow);
    }
    const profile=profiles[o.id];
    if(profile?.backType&&profile.backType!=='none'&&profile.backType!=='internal'){
      const pad=Math.max(0,Number(profile.backOffset)||25)/UNIT;
      const bw=o.w/UNIT+pad*2,bh=o.h/UNIT+pad*2;
      const depth=Math.max(.025,(Number(profile.backThickness)||5)/UNIT);
      const mat=profile.backMaterial==='metal'?new THREE.MeshPhysicalMaterial({color:new THREE.Color(profile.backColor||'#f1f5f9'),metalness:.9,roughness:.25}):new THREE.MeshPhysicalMaterial({color:new THREE.Color(profile.backColor||'#f8fafc'),roughness:profile.backMaterial==='acrylic'?.2:.72,metalness:profile.backMaterial==='acm'?.45:0,clearcoat:profile.backMaterial==='acrylic'?.8:.05});
      const panel=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,depth),mat);panel.position.set((o.x+o.w/2-a.w/2)/UNIT,(a.h/2-(o.y+o.h/2))/UNIT,Math.max(.03,(Number(o.wallGap)||0)/UNIT*.25));panel.rotation.z=THREE.MathUtils.degToRad(-(o.rotation||0));panel.castShadow=true;panel.receiveShadow=true;panel.userData.colorizeAugment12=true;root.add(panel);
    }
    if(profile?.constructionType==='lightbox'||profile?.constructionType==='colorbox'){
      const d=Math.max(.3,(Number(profile.returnDepth)||80)/UNIT);
      const boxMat=new THREE.MeshPhysicalMaterial({color:new THREE.Color(profile.sideColor||'#f8fafc'),metalness:profile.returnMaterial==='metal'?.75:profile.returnMaterial==='acm'?.4:0,roughness:profile.returnMaterial==='pvc'?.7:.32,clearcoat:.18});
      const box=new THREE.Mesh(new THREE.BoxGeometry(o.w/UNIT*1.08,o.h/UNIT*1.45,d),boxMat);box.position.set((o.x+o.w/2-a.w/2)/UNIT,(a.h/2-(o.y+o.h/2))/UNIT,d/2+.025);box.rotation.z=THREE.MathUtils.degToRad(-(o.rotation||0));box.castShadow=true;box.receiveShadow=true;box.userData.colorizeAugment12=true;root.add(box);
    }
  }
}

function ensureTransform(){
  if(!renderer||!scene||!camera)return;
  if(transform&&transform.camera===camera)return;
  try{if(transformHelper?.parent)transformHelper.parent.remove(transformHelper);transform?.dispose?.()}catch{}
  transform=new TransformControls(camera,renderer.domElement);transform.userData.colorizeTransform12=true;
  transformHelper=transform.getHelper?transform.getHelper():transform;transformHelper.userData.colorizeTransform12=true;scene.add(transformHelper);
  transform.addEventListener('dragging-changed',e=>{if(orbit)orbit.enabled=!e.value});
  transform.addEventListener('mouseDown',()=>beginTransformSnapshot());
  transform.addEventListener('mouseUp',()=>commitTransform());
  configureTransformMode();
}
function configureTransformMode(){
  if(!transform)return;
  const mode=editMode==='move'?'translate':editMode==='scale'?'scale':editMode==='rotate'?'rotate':'translate';transform.setMode(mode);
  transform.showX=editMode!=='camera';transform.showY=editMode!=='camera';transform.showZ=false;
  if(editMode==='rotate'){transform.showX=false;transform.showY=false;transform.showZ=true}
  transform.enabled=editMode!=='camera';
  if(orbit)orbit.enabled=editMode==='camera';
  const mesh=selectedMainMesh();
  if(editMode==='camera'||!mesh)transform.detach();else if(transform.object!==mesh)transform.attach(mesh);
  document.querySelectorAll('.edit3d-tool').forEach(b=>b.classList.toggle('active',b.dataset.edit3d===editMode));
}
function beginTransformSnapshot(){
  const mesh=transform?.object,p=readProject(),a=activeArtboard(p);if(!mesh||!p||!a)return;
  const o=(a.objects||[]).find(x=>x.id===mesh.userData.colorizeObjectId);if(!o)return;
  dragSnapshot={id:o.id,artboard:a,object:{...o},position:mesh.position.clone(),scale:mesh.scale.clone(),rotation:mesh.rotation.clone()};
}
function setProp(key,val){
  const el=document.querySelector(`#properties [data-prop="${key}"]`);if(!el)return false;el.value=String(val);el.dispatchEvent(new Event('input',{bubbles:true}));return true;
}
function commitTransform(){
  const mesh=transform?.object,s=dragSnapshot;if(!mesh||!s)return;const o=s.object,a=s.artboard;
  if(editMode==='move'){
    const x=a.w/2+mesh.position.x*UNIT-o.w/2,y=a.h/2-mesh.position.y*UNIT-o.h/2;setProp('x',Math.round(x*10)/10);setProp('y',Math.round(y*10)/10);
  }else if(editMode==='rotate'){
    setProp('rotation',Math.round((-THREE.MathUtils.radToDeg(mesh.rotation.z))*10)/10);
  }else if(editMode==='scale'){
    const rx=s.scale.x?mesh.scale.x/s.scale.x:1,ry=s.scale.y?mesh.scale.y/s.scale.y:1;setProp('w',Math.max(20,Math.round(o.w*rx)));setProp('h',Math.max(20,Math.round(o.h*ry)));
  }
  dragSnapshot=null;setTimeout(()=>{mapObjectMeshes();configureTransformMode()},220);
}
function attachTransformToSelection(){if(!transform)return;mapObjectMeshes();configureTransformMode()}

function inject3DToolbar(){
  const host=document.getElementById('threeHost');if(!host||document.getElementById('edit3dToolbar'))return;
  const bar=document.createElement('div');bar.id='edit3dToolbar';bar.className='edit3d-toolbar';bar.innerHTML='<button class="edit3d-tool active" data-edit3d="camera">Камера</button><button class="edit3d-tool" data-edit3d="move">Двигать</button><button class="edit3d-tool" data-edit3d="scale">Размер</button><button class="edit3d-tool" data-edit3d="rotate">Поворот</button><button id="edit3dFront">Спереди</button>';host.appendChild(bar);
  bar.addEventListener('click',e=>{const b=e.target.closest('[data-edit3d]');if(b){editMode=b.dataset.edit3d;configureTransformMode()}if(e.target.closest('#edit3dFront'))document.getElementById('reset3dBtn')?.click()});
}
function extendLightingPanel(){
  const p=document.getElementById('lightingPanel');if(!p||p.querySelector('#hdrPreset12'))return;
  const first=p.querySelector('.lighting-section');if(!first)return;
  const wrap=document.createElement('label');wrap.className='lighting-row wide';wrap.innerHTML=`<span>HDR</span><select id="hdrPreset12">${Object.entries(HDRS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select>`;first.prepend(wrap);
  wrap.querySelector('select').value=pro.hdr;
  wrap.querySelector('select').onchange=e=>{pro.hdr=e.target.value;savePro();currentHdr='';applyHdr()};
}

const previousRender=THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render=function(s,c){
  const host=document.getElementById('threeHost');
  if(host&&!host.hidden&&host.contains(this.domElement)){
    renderer=this;scene=s;camera=c;root=getMainRoot(s)||root;
    if(root){mapObjectMeshes();addFacadePhysics()}
    ensureTransform();attachTransformToSelection();applyHdr();
  }
  return previousRender.call(this,s,c);
};

window.addEventListener('DOMContentLoaded',()=>{
  inject3DToolbar();extendLightingPanel();
  const obs=new MutationObserver(()=>{extendLightingPanel();inject3DToolbar();const host=document.getElementById('threeHost');if(host&&!host.hidden)setTimeout(()=>{mapObjectMeshes();attachTransformToSelection()},80)});obs.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class']});
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-layer-id],.mode'))setTimeout(()=>{mapObjectMeshes();attachTransformToSelection()},120)},true);
});
