import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

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
const isMobile=()=>matchMedia('(max-width:900px)').matches;
let active=false,rebuildTimer=0;
let quality=isMobile()?'fast':'high',exposure=1.05;

function readProject(){
  for(const key of STORE_KEYS){
    try{const raw=localStorage.getItem(key);if(raw)return JSON.parse(raw)}catch{}
  }
  return null;
}
function loadFont(key){
  const k=FONT_SOURCES[key]?key:'helvetiker';
  if(fontCache.has(k))return fontCache.get(k);
  const p=new Promise((resolve,reject)=>fontLoader.load(FONT_SOURCES[k],resolve,undefined,reject));
  fontCache.set(k,p);return p;
}
function color(v,fallback='#ffffff'){try{return new THREE.Color(v||fallback)}catch{return new THREE.Color(fallback)}}
function sideKind(v){return ['aluminum','stainless','painted'].includes(v)?'metal':v}
function makeMaterial(kind,hex,{emissive=null,intensity=0}={}){
  const common={color:color(hex),side:THREE.DoubleSide};
  let m;
  if(kind==='metal')m=new THREE.MeshPhysicalMaterial({...common,metalness:.94,roughness:.22,clearcoat:.36,clearcoatRoughness:.16});
  else if(kind==='acm')m=new THREE.MeshPhysicalMaterial({...common,metalness:.48,roughness:.34,clearcoat:.26,clearcoatRoughness:.22});
  else if(kind==='pvc')m=new THREE.MeshPhysicalMaterial({...common,metalness:0,roughness:.76,clearcoat:.06});
  else m=new THREE.MeshPhysicalMaterial({...common,metalness:0,roughness:.2,clearcoat:.92,clearcoatRoughness:.13,transmission:.04,ior:1.49,thickness:.12});
  if(emissive){m.emissive=color(emissive);m.emissiveIntensity=intensity}
  return m;
}

class StableHQRenderer{
  constructor(){
    this.host=null;this.renderer=null;this.scene=null;this.camera=null;this.root=null;this.env=null;this.resizeObserver=null;this.token=0;this.ready=false;
  }
  async mount(){
    if(this.host)return true;
    const viewport=document.getElementById('viewport');if(!viewport)return false;
    this.host=document.createElement('div');this.host.id='hqRenderHost';this.host.className='hq-render-host';this.host.hidden=true;
    this.host.innerHTML=`<div class="hq-render-loading" id="hqRenderLoading">Подготавливаем Render HQ…</div><div class="hq-render-toolbar"><strong>Render HQ</strong><span>PBR · IBL · ACES</span><label>Качество <select id="hqQuality"><option value="fast">Быстро</option><option value="high">Высоко</option><option value="ultra">Ultra</option></select></label><label>Экспозиция <input id="hqExposure" type="range" min="0.70" max="1.45" step="0.01" value="1.05"></label><button id="hqSavePng">PNG</button></div>`;
    viewport.appendChild(this.host);
    try{
      this.renderer=new THREE.WebGLRenderer({antialias:!isMobile(),alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    }catch(err){
      this.host.querySelector('#hqRenderLoading').textContent='Не удалось запустить WebGL Render';return false;
    }
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=exposure;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.host.prepend(this.renderer.domElement);
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#15171b');
    this.camera=new THREE.PerspectiveCamera(38,1,.03,1000);
    this.host.querySelector('#hqQuality').value=quality;
    this.host.querySelector('#hqQuality').onchange=e=>{quality=e.target.value;this.configureQuality();this.rebuild()};
    this.host.querySelector('#hqExposure').oninput=e=>{exposure=Number(e.target.value)||1.05;this.renderer.toneMappingExposure=exposure;this.draw()};
    this.host.querySelector('#hqSavePng').onclick=()=>this.savePng();
    this.resizeObserver=new ResizeObserver(()=>{if(active)this.resize()});this.resizeObserver.observe(this.host);
    this.configureQuality();this.resize();
    this.ready=true;
    this.prepareEnvironment();
    return true;
  }
  async prepareEnvironment(){
    try{
      const {RoomEnvironment}=await import('three/addons/environments/RoomEnvironment.js');
      if(!this.renderer||!this.scene)return;
      const pmrem=new THREE.PMREMGenerator(this.renderer);
      this.env=pmrem.fromScene(new RoomEnvironment(),.04).texture;pmrem.dispose();this.scene.environment=this.env;
      if(active)this.draw();
    }catch{}
  }
  configureQuality(){
    if(!this.renderer)return;
    const dpr=devicePixelRatio||1;
    let ratio,shadow;
    if(isMobile()){
      ratio=quality==='fast'?Math.min(dpr,1):quality==='ultra'?Math.min(dpr,1.5):Math.min(dpr,1.25);
      shadow=quality==='ultra'?2048:1024;
    }else{
      ratio=quality==='fast'?Math.min(dpr,1.25):quality==='ultra'?Math.min(dpr,2.25):Math.min(dpr,1.8);
      shadow=quality==='fast'?1024:quality==='ultra'?4096:2048;
    }
    this.pixelRatio=ratio;this.shadowSize=shadow;this.renderer.setPixelRatio(ratio);
    if(active)this.resize();
  }
  resize(){
    if(!this.renderer||!this.host||this.host.hidden)return;
    const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);
    this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.draw();
  }
  clear(){
    if(this.root){
      this.scene.remove(this.root);
      this.root.traverse(o=>{o.geometry?.dispose?.();const mats=Array.isArray(o.material)?o.material:o.material?[o.material]:[];for(const m of mats){m.map?.dispose?.();m.dispose?.()}});
    }
    this.root=new THREE.Group();this.scene.add(this.root);
  }
  addLights(wallW,wallH){
    this.root.add(new THREE.HemisphereLight(0xffffff,0x28313c,.88));
    const key=new THREE.DirectionalLight(0xfff8ef,4.2);key.position.set(-wallW*.5,wallH*.7,Math.max(10,wallW*.75));key.castShadow=true;
    key.shadow.mapSize.set(this.shadowSize||1024,this.shadowSize||1024);key.shadow.bias=-.00012;key.shadow.normalBias=.025;
    const span=Math.max(wallW,wallH)*.8;key.shadow.camera.left=-span;key.shadow.camera.right=span;key.shadow.camera.top=span;key.shadow.camera.bottom=-span;key.shadow.camera.near=.1;key.shadow.camera.far=Math.max(50,span*5);this.root.add(key);
    const fill=new THREE.DirectionalLight(0xc3dbff,1.3);fill.position.set(wallW*.7,wallH*.2,8);this.root.add(fill);
    const rim=new THREE.DirectionalLight(0xffd8bc,.95);rim.position.set(-wallW*.2,-wallH*.4,5);this.root.add(rim);
  }
  async rebuild(){
    if(!active)return;
    if(!this.ready){const ok=await this.mount();if(!ok)return}
    const token=++this.token,loading=this.host.querySelector('#hqRenderLoading');loading.hidden=false;loading.textContent='Строим Render HQ…';
    const p=readProject(),a=p?.artboards?.find(x=>x.id===p.activeArtboardId)||p?.artboards?.[0];
    if(!p||!a){loading.textContent='Нет активного Artboard';return}
    this.clear();const unit=50,wallW=a.w/unit,wallH=a.h/unit;this.addLights(wallW,wallH);
    const wall=new THREE.Mesh(new THREE.PlaneGeometry(wallW,wallH),new THREE.MeshPhysicalMaterial({color:color(a.bg||'#f5f5f5'),roughness:.86,metalness:0,clearcoat:.025}));wall.receiveShadow=true;this.root.add(wall);
    for(const o of (a.objects||[]).filter(x=>x.type==='image'&&x.src)){
      try{
        const tex=await new THREE.TextureLoader().loadAsync(o.src);if(token!==this.token)return;tex.colorSpace=THREE.SRGBColorSpace;
        const maxA=this.renderer.capabilities.getMaxAnisotropy();tex.anisotropy=Math.min(isMobile()?2:8,maxA);
        const mesh=new THREE.Mesh(new THREE.PlaneGeometry(o.w/unit,o.h/unit),new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:o.opacity??1,toneMapped:false}));
        mesh.position.set((o.x+o.w/2-a.w/2)/unit,(a.h/2-(o.y+o.h/2))/unit,.012);mesh.rotation.z=THREE.MathUtils.degToRad(-(o.rotation||0));this.root.add(mesh);
      }catch{}
    }
    for(const o of (a.objects||[]).filter(x=>x.type==='rect')){
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(o.w/unit,o.h/unit,.08),new THREE.MeshPhysicalMaterial({color:color(o.fill||'#0a84ff'),roughness:.46,clearcoat:.18}));
      mesh.position.set((o.x+o.w/2-a.w/2)/unit,(a.h/2-(o.y+o.h/2))/unit,.05);mesh.rotation.z=THREE.MathUtils.degToRad(-(o.rotation||0));mesh.castShadow=true;mesh.receiveShadow=true;this.root.add(mesh);
    }
    for(const o of (a.objects||[]).filter(x=>x.type==='text')){
      let font;try{font=await loadFont(o.font3D)}catch{try{font=await loadFont('helvetiker')}catch{continue}}if(token!==this.token)return;
      const depth=clamp(Number(o.returnDepth)||50,5,300)/45,bevel=clamp(Number(o.faceThickness)||3,1,30)/140;
      const curve=quality==='fast'?5:quality==='ultra'?12:8,bevelSeg=quality==='fast'?1:quality==='ultra'?5:3;
      const geo=new TextGeometry(o.text||' ',{font,size:1,depth,curveSegments:curve,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel*.68,bevelSegments:bevelSeg});
      geo.computeBoundingBox();const bb=geo.boundingBox;if(!bb)continue;const rawW=Math.max(.001,bb.max.x-bb.min.x),rawH=Math.max(.001,bb.max.y-bb.min.y);geo.center();
      const lit=o.lightMode==='face'||o.lightMode==='both';const face=makeMaterial(o.faceMaterial,o.faceColor,{emissive:lit?o.lightColor:null,intensity:lit?(Number(o.lightIntensity)||.7)*2:0});const side=makeMaterial(sideKind(o.returnMaterial),o.sideColor);
      const mesh=new THREE.Mesh(geo,[face,side]);const tw=Math.max(.2,o.w/unit),th=Math.max(.2,o.h/unit);mesh.scale.set(tw/rawW,th/rawH,1);
      const x=(o.x+o.w/2-a.w/2)/unit,y=(a.h/2-(o.y+o.h/2))/unit,gap=(Number(o.wallGap)||0)/50;
      mesh.position.set(x,y,depth/2+gap+.05);mesh.rotation.z=THREE.MathUtils.degToRad(-(o.rotation||0));mesh.castShadow=true;mesh.receiveShadow=true;this.root.add(mesh);
      const bm=new THREE.Mesh(geo.clone(),makeMaterial(o.backMaterial,o.backColor));bm.scale.set(mesh.scale.x,mesh.scale.y,Math.max(.018,(Number(o.backThickness)||5)/150));bm.position.set(x,y,gap+.018);bm.rotation.z=mesh.rotation.z;bm.castShadow=true;this.root.add(bm);
      if(o.lightMode==='halo'||o.lightMode==='both'){
        const li=Math.max(.05,Number(o.lightIntensity)||.7),lc=color(o.lightColor);
        const glow=new THREE.Mesh(geo.clone(),new THREE.MeshBasicMaterial({color:lc,transparent:true,opacity:clamp(li*.2,.05,.45),blending:THREE.AdditiveBlending,depthWrite:false}));
        glow.scale.set(mesh.scale.x*1.028,mesh.scale.y*1.028,.025);glow.position.set(x,y,Math.max(.025,gap*.26));glow.rotation.z=mesh.rotation.z;this.root.add(glow);
        const pl=new THREE.PointLight(lc,14*li,Math.max(5,tw*1.4),2);pl.position.set(x,y,Math.max(.14,gap+.1));this.root.add(pl);
      }
    }
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(wallW*3,wallH*2.3),new THREE.MeshPhysicalMaterial({color:0x17191d,roughness:.8,metalness:.06}));floor.rotation.x=-Math.PI/2;floor.position.set(0,-wallH/2-.28,wallH*.6);floor.receiveShadow=true;this.root.add(floor);
    this.setCamera(p,a);loading.hidden=true;this.draw();
  }
  setCamera(p,a){
    const unit=50,w=this.host.clientWidth||1,h=this.host.clientHeight||1;this.camera.aspect=w/h;
    if((p.mode||'2d')==='view3d'&&p.camera3d?.position?.length===3){
      this.camera.position.fromArray(p.camera3d.position);this.camera.lookAt(new THREE.Vector3().fromArray(p.camera3d.target||[0,0,0]));
    }else{
      const zoom=clamp(Number(p.view?.zoom)||.72,.05,8),fov=THREE.MathUtils.degToRad(this.camera.fov),ppu=unit*zoom,d=h/(2*Math.max(.1,ppu)*Math.tan(fov/2));
      const docX=(w/2-(Number(p.view?.x)||0))/zoom,docY=(h/2-(Number(p.view?.y)||0))/zoom;const localX=docX-(Number(a.x)||0),localY=docY-(Number(a.y)||0);
      const tx=(localX-a.w/2)/unit,ty=(a.h/2-localY)/unit;this.camera.position.set(tx,ty,d);this.camera.lookAt(tx,ty,0);
    }
    this.camera.near=.02;this.camera.far=1000;this.camera.updateProjectionMatrix();
  }
  draw(){if(!this.renderer||!active||this.host.hidden)return;this.renderer.toneMappingExposure=exposure;this.renderer.render(this.scene,this.camera)}
  async show(){
    const ok=await this.mount();if(!ok)return;active=true;this.host.hidden=false;document.body.classList.add('hq-render-active');this.configureQuality();this.resize();await this.rebuild();syncUi();
  }
  hide(){active=false;if(this.host)this.host.hidden=true;document.body.classList.remove('hq-render-active');syncUi()}
  toggle(){active?this.hide():this.show()}
  savePng(){if(!this.renderer)return;this.draw();try{const a=document.createElement('a');a.download=`Colorize-Render-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.png`;a.href=this.renderer.domElement.toDataURL('image/png',1);a.click()}catch{}}
}
const hq=new StableHQRenderer();

function desiredLabel(){const p=readProject();if(active)return (p?.mode==='view3d'?'3D':'2D')+' · Render HQ';return p?.mode==='view3d'?'3D · реальная перспектива':'2D · редактирование'}
function syncUi(){
  const b=document.getElementById('globalRenderBtn');if(b){b.classList.toggle('active',active);b.textContent=active?'Render ON':'Render'}
  const badge=document.getElementById('modeBadge'),label=desiredLabel();if(badge&&badge.textContent!==label)badge.textContent=label;
}
function scheduleRebuild(){clearTimeout(rebuildTimer);rebuildTimer=setTimeout(()=>{syncUi();if(active)hq.rebuild()},260)}

window.addEventListener('DOMContentLoaded',()=>{
  const renderBtn=document.getElementById('globalRenderBtn');if(renderBtn)renderBtn.onclick=()=>hq.toggle();
  const old=document.getElementById('view3dRenderBtn');if(old)old.style.display='none';
  document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>setTimeout(()=>{syncUi();if(active)hq.rebuild()},100)));
  document.addEventListener('input',scheduleRebuild,true);document.addEventListener('change',scheduleRebuild,true);
  syncUi();
});
