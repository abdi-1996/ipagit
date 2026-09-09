import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const STORE_KEYS=['colorize-design-web-v04','colorize-design-web-v03','colorize-design-web-v02','colorize-design-web-v01'];
const FONT_SOURCES={
  helvetiker:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/helvetiker_bold.typeface.json',
  optimer:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/optimer_bold.typeface.json',
  gentilis:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/gentilis_bold.typeface.json',
  droidSans:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/droid/droid_sans_bold.typeface.json',
  droidSerif:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/droid/droid_serif_bold.typeface.json'
};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const fontLoader=new FontLoader();
const fontCache=new Map();
let active=false,rebuildTimer=0;
let quality='high',exposure=1.08;

function readProject(){
  for(const key of STORE_KEYS){
    try{const raw=localStorage.getItem(key);if(raw)return JSON.parse(raw)}catch{}
  }
  return null;
}
function currentStore(){
  for(const key of STORE_KEYS){try{if(localStorage.getItem(key))return key}catch{}}
  return STORE_KEYS[0];
}
function loadFont(key){
  const k=FONT_SOURCES[key]?key:'helvetiker';
  if(fontCache.has(k))return fontCache.get(k);
  const p=new Promise((resolve,reject)=>fontLoader.load(FONT_SOURCES[k],resolve,undefined,reject));
  fontCache.set(k,p);return p;
}
function color(v,fallback='#ffffff'){try{return new THREE.Color(v||fallback)}catch{return new THREE.Color(fallback)}}
function sideKind(v){return ['aluminum','stainless','painted'].includes(v)?'metal':v}
function material(kind,hex,{render=true,emissive=null,intensity=0}={}){
  const c=color(hex);
  const base={color:c,side:THREE.DoubleSide};
  let m;
  if(kind==='metal')m=new THREE.MeshPhysicalMaterial({...base,metalness:.96,roughness:.18,clearcoat:.45,clearcoatRoughness:.14});
  else if(kind==='acm')m=new THREE.MeshPhysicalMaterial({...base,metalness:.58,roughness:.28,clearcoat:.34,clearcoatRoughness:.22});
  else if(kind==='pvc')m=new THREE.MeshPhysicalMaterial({...base,metalness:0,roughness:.72,clearcoat:.08});
  else m=new THREE.MeshPhysicalMaterial({...base,metalness:0,roughness:.17,clearcoat:1,clearcoatRoughness:.11,transmission:.06,ior:1.49,thickness:.18});
  if(emissive){m.emissive=color(emissive);m.emissiveIntensity=intensity}
  if(!render){m.roughness=Math.min(1,m.roughness+.2);m.clearcoat*=.5}
  return m;
}

class HQRenderer{
  constructor(){
    this.host=null;this.renderer=null;this.scene=null;this.camera=null;this.composer=null;this.bloom=null;this.root=null;this.env=null;this.token=0;this.resizeObserver=null;
  }
  mount(){
    if(this.host)return;
    const viewport=document.getElementById('viewport');if(!viewport)return;
    this.host=document.createElement('div');this.host.id='hqRenderHost';this.host.className='hq-render-host';this.host.hidden=true;
    this.host.innerHTML=`<div class="hq-render-loading" id="hqRenderLoading">Подготавливаем Render HQ…</div><div class="hq-render-toolbar"><strong>Render HQ</strong><span>PBR · IBL · ACES</span><label>Качество <select id="hqQuality"><option value="fast">Быстро</option><option value="high" selected>Высоко</option><option value="ultra">Ultra</option></select></label><label>Экспозиция <input id="hqExposure" type="range" min="0.65" max="1.65" step="0.01" value="1.08"></label><button id="hqSavePng">PNG</button></div>`;
    viewport.appendChild(this.host);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=exposure;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.host.prepend(this.renderer.domElement);
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#15171b');
    this.camera=new THREE.PerspectiveCamera(38,1,.03,1000);
    const pmrem=new THREE.PMREMGenerator(this.renderer);this.env=pmrem.fromScene(new RoomEnvironment(),.04).texture;pmrem.dispose();this.scene.environment=this.env;
    this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.34,.48,.9);this.composer.addPass(this.bloom);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.host);
    this.host.querySelector('#hqQuality').onchange=e=>{quality=e.target.value;this.configureQuality();this.rebuild()};
    this.host.querySelector('#hqExposure').oninput=e=>{exposure=Number(e.target.value)||1.08;this.renderer.toneMappingExposure=exposure;this.draw()};
    this.host.querySelector('#hqSavePng').onclick=()=>this.savePng();
    this.configureQuality();this.resize();
  }
  configureQuality(){
    if(!this.renderer)return;
    const mobile=matchMedia('(max-width:900px)').matches;
    const base=quality==='fast'?1:quality==='ultra'?2.25:1.6;
    const cap=mobile?(quality==='ultra'?1.8:1.45):(quality==='ultra'?2.4:2);
    this.renderer.setPixelRatio(Math.min((devicePixelRatio||1)*base,cap));
    this.bloom.strength=quality==='fast'?.22:quality==='ultra'?.42:.32;
    this.resize();
  }
  resize(){
    if(!this.renderer||this.host.hidden)return;
    const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);
    this.renderer.setSize(w,h,false);this.composer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.draw();
  }
  clear(){
    if(this.root){this.scene.remove(this.root);this.root.traverse(o=>{o.geometry?.dispose?.();if(o.material){for(const m of (Array.isArray(o.material)?o.material:[o.material]))m?.dispose?.()}if(o.material?.map)o.material.map.dispose?.()})}
    this.root=new THREE.Group();this.scene.add(this.root);
  }
  addLights(wallW,wallH){
    const hemi=new THREE.HemisphereLight(0xffffff,0x27303c,.8);this.root.add(hemi);
    const key=new THREE.DirectionalLight(0xfff8ef,4.8);key.position.set(-wallW*.55,wallH*.75,Math.max(12,wallW*.8));key.castShadow=true;
    const sm=quality==='ultra'?4096:quality==='fast'?1024:2048;key.shadow.mapSize.set(sm,sm);key.shadow.bias=-.00015;key.shadow.normalBias=.025;
    const span=Math.max(wallW,wallH)*.75;key.shadow.camera.left=-span;key.shadow.camera.right=span;key.shadow.camera.top=span;key.shadow.camera.bottom=-span;key.shadow.camera.near=.1;key.shadow.camera.far=Math.max(60,span*5);this.root.add(key);
    const fill=new THREE.DirectionalLight(0xbfd8ff,1.45);fill.position.set(wallW*.7,wallH*.2,8);this.root.add(fill);
    const rim=new THREE.DirectionalLight(0xffd7b8,1.15);rim.position.set(-wallW*.2,-wallH*.5,5);this.root.add(rim);
  }
  async rebuild(){
    if(!active)return;
    this.mount();const token=++this.token;const loading=this.host.querySelector('#hqRenderLoading');loading.hidden=false;
    const p=readProject(),a=p?.artboards?.find(x=>x.id===p.activeArtboardId)||p?.artboards?.[0];if(!p||!a){loading.textContent='Нет активного Artboard';return}
    this.clear();const unit=50,wallW=a.w/unit,wallH=a.h/unit;this.addLights(wallW,wallH);
    const wallMat=new THREE.MeshPhysicalMaterial({color:color(a.bg||'#f5f5f5'),roughness:.84,metalness:0,clearcoat:.03});
    const wall=new THREE.Mesh(new THREE.PlaneGeometry(wallW,wallH),wallMat);wall.receiveShadow=true;this.root.add(wall);
    for(const o of (a.objects||[]).filter(x=>x.type==='image'&&x.src)){
      try{const tex=await new THREE.TextureLoader().loadAsync(o.src);if(token!==this.token)return;tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
        const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:o.opacity??1,toneMapped:false});const mesh=new THREE.Mesh(new THREE.PlaneGeometry(o.w/unit,o.h/unit),mat);
        mesh.position.set((o.x+o.w/2-a.w/2)/unit,(a.h/2-(o.y+o.h/2))/unit,.012);mesh.rotation.z=THREE.MathUtils.degToRad(-(o.rotation||0));this.root.add(mesh)}catch{}
    }
    for(const o of (a.objects||[]).filter(x=>x.type==='rect')){
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(o.w/unit,o.h/unit,.09),new THREE.MeshPhysicalMaterial({color:color(o.fill||'#0a84ff'),roughness:.42,clearcoat:.22}));
      mesh.position.set((o.x+o.w/2-a.w/2)/unit,(a.h/2-(o.y+o.h/2))/unit,.055);mesh.rotation.z=THREE.MathUtils.degToRad(-(o.rotation||0));mesh.castShadow=true;mesh.receiveShadow=true;this.root.add(mesh);
    }
    for(const o of (a.objects||[]).filter(x=>x.type==='text')){
      let font;try{font=await loadFont(o.font3D)}catch{font=await loadFont('helvetiker')}if(token!==this.token)return;
      const depth=clamp(Number(o.returnDepth)||50,5,300)/45,bevel=clamp(Number(o.faceThickness)||3,1,30)/135;
      const geo=new TextGeometry(o.text||' ',{font,size:1,depth,curveSegments:quality==='fast'?6:quality==='ultra'?16:10,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel*.7,bevelSegments:quality==='fast'?2:quality==='ultra'?7:4});
      geo.computeBoundingBox();const bb=geo.boundingBox;if(!bb)continue;const rawW=Math.max(.001,bb.max.x-bb.min.x),rawH=Math.max(.001,bb.max.y-bb.min.y);geo.center();
      const lit=o.lightMode==='face'||o.lightMode==='both';const face=material(o.faceMaterial,o.faceColor,{emissive:lit?o.lightColor:null,intensity:lit?(Number(o.lightIntensity)||.7)*2.2:0});const side=material(sideKind(o.returnMaterial),o.sideColor);
      const mesh=new THREE.Mesh(geo,[face,side]);const tw=Math.max(.2,o.w/unit),th=Math.max(.2,o.h/unit);mesh.scale.set(tw/rawW,th/rawH,1);const x=(o.x+o.w/2-a.w/2)/unit,y=(a.h/2-(o.y+o.h/2))/unit,gap=(Number(o.wallGap)||0)/50;
      mesh.position.set(x,y,depth/2+gap+.05);mesh.rotation.z=THREE.MathUtils.degToRad(-(o.rotation||0));mesh.castShadow=true;mesh.receiveShadow=true;this.root.add(mesh);
      const back=material(o.backMaterial,o.backColor);const bg=geo.clone(),bm=new THREE.Mesh(bg,back);bm.scale.set(mesh.scale.x,mesh.scale.y,Math.max(.018,(Number(o.backThickness)||5)/150));bm.position.set(x,y,gap+.018);bm.rotation.z=mesh.rotation.z;bm.castShadow=true;this.root.add(bm);
      if(o.lightMode==='halo'||o.lightMode==='both'){
        const intensity=Math.max(.05,Number(o.lightIntensity)||.7),lc=color(o.lightColor);
        const glowMat=new THREE.MeshBasicMaterial({color:lc,transparent:true,opacity:clamp(intensity*.24,.06,.55),blending:THREE.AdditiveBlending,depthWrite:false});const glow=new THREE.Mesh(geo.clone(),glowMat);glow.scale.set(mesh.scale.x*1.035,mesh.scale.y*1.035,.028);glow.position.set(x,y,Math.max(.025,gap*.28));glow.rotation.z=mesh.rotation.z;this.root.add(glow);
        const pl=new THREE.PointLight(lc,18*intensity,Math.max(6,tw*1.5),2);pl.position.set(x,y,Math.max(.16,gap+.12));this.root.add(pl);
      }
    }
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(wallW*3,wallH*2.4),new THREE.MeshPhysicalMaterial({color:0x16181c,roughness:.78,metalness:.08}));floor.rotation.x=-Math.PI/2;floor.position.set(0,-wallH/2-.28,wallH*.62);floor.receiveShadow=true;this.root.add(floor);
    this.setCamera(p,a);loading.hidden=true;this.draw();
  }
  setCamera(p,a){
    const unit=50,w=this.host.clientWidth||1,h=this.host.clientHeight||1;this.camera.aspect=w/h;
    if((p.mode||'2d')==='view3d'&&p.camera3d?.position?.length===3){
      this.camera.position.fromArray(p.camera3d.position);const target=new THREE.Vector3().fromArray(p.camera3d.target||[0,0,0]);this.camera.lookAt(target);
    }else{
      const zoom=clamp(Number(p.view?.zoom)||.72,.05,8),fov=THREE.MathUtils.degToRad(this.camera.fov),ppu=unit*zoom,d=h/(2*Math.max(.1,ppu)*Math.tan(fov/2));
      const docX=(w/2-(Number(p.view?.x)||0))/zoom,docY=(h/2-(Number(p.view?.y)||0))/zoom;const localX=docX-(Number(a.x)||0),localY=docY-(Number(a.y)||0);
      const tx=(localX-a.w/2)/unit,ty=(a.h/2-localY)/unit;this.camera.position.set(tx,ty,d);this.camera.lookAt(tx,ty,0);
    }
    this.camera.near=.02;this.camera.far=1000;this.camera.updateProjectionMatrix();
  }
  draw(){if(!this.renderer||this.host.hidden)return;this.renderer.toneMappingExposure=exposure;this.composer.render()}
  show(){this.mount();active=true;this.host.hidden=false;document.body.classList.add('hq-render-active');this.configureQuality();requestAnimationFrame(()=>this.rebuild())}
  hide(){active=false;if(this.host)this.host.hidden=true;document.body.classList.remove('hq-render-active')}
  toggle(){active?this.hide():this.show();syncButton()}
  savePng(){if(!this.renderer)return;this.draw();const a=document.createElement('a');a.download=`Colorize-Render-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.png`;a.href=this.renderer.domElement.toDataURL('image/png',1);a.click()}
}
const hq=new HQRenderer();

function syncButton(){const b=document.getElementById('globalRenderBtn');if(!b)return;b.classList.toggle('active',active);b.textContent=active?'Render ON':'Render'}
function syncModeLabel(){
  const badge=document.getElementById('modeBadge'),p=readProject();if(!badge||!p)return;
  if(active)badge.textContent=(p.mode==='view3d'?'3D':'2D')+' · Render HQ';
  else if(p.mode==='view3d')badge.textContent='3D · реальная перспектива';
  else badge.textContent='2D · редактирование';
}
function schedule(){clearTimeout(rebuildTimer);rebuildTimer=setTimeout(()=>{syncModeLabel();if(active)hq.rebuild()},140)}

window.addEventListener('DOMContentLoaded',()=>{
  const renderBtn=document.getElementById('globalRenderBtn');if(renderBtn)renderBtn.onclick=()=>{hq.toggle();syncModeLabel()};
  const old=document.getElementById('view3dRenderBtn');if(old)old.style.display='none';
  document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>{setTimeout(()=>{syncModeLabel();if(active)hq.rebuild()},90)}));
  document.addEventListener('input',schedule,true);document.addEventListener('change',schedule,true);
  const badge=document.getElementById('modeBadge');if(badge)new MutationObserver(()=>{if(active||readProject()?.mode==='view3d')syncModeLabel()}).observe(badge,{childList:true,characterData:true,subtree:true});
  syncButton();syncModeLabel();
});
