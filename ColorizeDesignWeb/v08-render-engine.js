import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

const STORE_KEYS=['colorize-design-web-v04','colorize-design-web-v03','colorize-design-web-v02','colorize-design-web-v01'];
const LIGHT_STORE='colorize-render-lighting-v08';
const FONT_SOURCES={
  helvetiker:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/helvetiker_bold.typeface.json',
  optimer:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/optimer_bold.typeface.json',
  gentilis:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/gentilis_bold.typeface.json',
  droidSans:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/droid/droid_sans_bold.typeface.json',
  droidSerif:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/droid/droid_serif_bold.typeface.json'
};
const HDR_PRESETS={
  studio:{label:'Studio IBL',url:null},
  day:{label:'HDR · День',url:'https://threejs.org/examples/textures/equirectangular/royal_esplanade_1k.hdr'},
  sunset:{label:'HDR · Закат',url:'https://threejs.org/examples/textures/equirectangular/venice_sunset_1k.hdr'},
  night:{label:'HDR · Ночь',url:'https://threejs.org/examples/textures/equirectangular/moonless_golf_1k.hdr'},
  custom:{label:'Мой HDR / EXR',url:null}
};
const ENV_DEFAULTS={
  studio:{sunIntensity:4.2,sunAngle:-35,sunHeight:50,ambient:0.9,temperature:5600,hdrIntensity:1.0,exposure:1.05},
  day:{sunIntensity:5.0,sunAngle:-25,sunHeight:55,ambient:1.05,temperature:5900,hdrIntensity:1.15,exposure:1.0},
  sunset:{sunIntensity:3.4,sunAngle:38,sunHeight:22,ambient:0.65,temperature:3600,hdrIntensity:1.25,exposure:1.08},
  night:{sunIntensity:0.8,sunAngle:-55,sunHeight:32,ambient:0.28,temperature:7600,hdrIntensity:0.72,exposure:1.22}
};
const DEFAULT_LIGHT={envPreset:'studio',showBackground:false,hdrIntensity:1,exposure:1.05,sunIntensity:4.2,sunAngle:-35,sunHeight:50,ambient:.9,temperature:5600,shadowSoftness:3};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const isMobile=()=>matchMedia('(max-width:900px)').matches;
const fontLoader=new FontLoader();
const fontCache=new Map();
let active=false,rebuildTimer=0;
let quality=isMobile()?'fast':'high';
let settings=loadLightSettings();

function loadLightSettings(){
  try{
    const raw=JSON.parse(localStorage.getItem(LIGHT_STORE)||'null');
    const s={...DEFAULT_LIGHT,...(raw||{})};
    if(s.envPreset==='custom')s.envPreset='studio';
    return s;
  }catch{return {...DEFAULT_LIGHT}}
}
function saveLightSettings(){try{localStorage.setItem(LIGHT_STORE,JSON.stringify(settings))}catch{}}
function readProject(){
  for(const key of STORE_KEYS){try{const raw=localStorage.getItem(key);if(raw)return JSON.parse(raw)}catch{}}
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
  const common={color:color(hex),side:THREE.DoubleSide};let m;
  if(kind==='metal')m=new THREE.MeshPhysicalMaterial({...common,metalness:.94,roughness:.2,clearcoat:.42,clearcoatRoughness:.14});
  else if(kind==='acm')m=new THREE.MeshPhysicalMaterial({...common,metalness:.5,roughness:.32,clearcoat:.28,clearcoatRoughness:.2});
  else if(kind==='pvc')m=new THREE.MeshPhysicalMaterial({...common,metalness:0,roughness:.76,clearcoat:.06});
  else m=new THREE.MeshPhysicalMaterial({...common,metalness:0,roughness:.18,clearcoat:.95,clearcoatRoughness:.12,transmission:.05,ior:1.49,thickness:.14});
  if(emissive){m.emissive=color(emissive);m.emissiveIntensity=intensity}
  return m;
}
function kelvinToColor(k){
  const t=clamp(Number(k)||5600,1000,40000)/100;let r,g,b;
  if(t<=66){r=255;g=99.4708025861*Math.log(t)-161.1195681661;b=t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307}
  else{r=329.698727446*Math.pow(t-60,-.1332047592);g=288.1221695283*Math.pow(t-60,-.0755148492);b=255}
  return new THREE.Color(clamp(r,0,255)/255,clamp(g,0,255)/255,clamp(b,0,255)/255);
}
function number(v,fallback){const n=Number(v);return Number.isFinite(n)?n:fallback}

class StableHQRenderer{
  constructor(){
    this.host=null;this.renderer=null;this.scene=null;this.camera=null;this.root=null;this.resizeObserver=null;this.token=0;this.ready=false;
    this.env=null;this.envSource=null;this.customUrl=null;this.customType=null;this.envToken=0;this.keyLight=null;this.hemi=null;this.fill=null;this.rim=null;this.lastWall={w:20,h:14};
  }
  async mount(){
    if(this.host)return true;
    const viewport=document.getElementById('viewport');if(!viewport)return false;
    this.host=document.createElement('div');this.host.id='hqRenderHost';this.host.className='hq-render-host';this.host.hidden=true;
    this.host.innerHTML=`<div class="hq-render-loading" id="hqRenderLoading">Подготавливаем Render HQ…</div><div class="hq-render-toolbar"><strong>Render HQ</strong><span class="light-summary">PBR · HDR · ACES</span><label>Качество <select id="hqQuality"><option value="fast">Быстро</option><option value="high">Высоко</option><option value="ultra">Ultra</option></select></label><button id="hqLightPanelBtn">Свет</button><button id="hqSavePng">PNG</button></div>`;
    viewport.appendChild(this.host);
    try{this.renderer=new THREE.WebGLRenderer({antialias:!isMobile(),alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'})}
    catch{this.host.querySelector('#hqRenderLoading').textContent='Не удалось запустить WebGL Render';return false}
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=settings.exposure;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.host.prepend(this.renderer.domElement);
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#15171b');this.scene.environmentIntensity=settings.hdrIntensity;
    this.camera=new THREE.PerspectiveCamera(38,1,.03,1000);
    this.host.querySelector('#hqQuality').value=quality;
    this.host.querySelector('#hqQuality').onchange=e=>{quality=e.target.value;this.configureQuality();this.rebuild()};
    this.host.querySelector('#hqSavePng').onclick=()=>this.savePng();
    this.host.querySelector('#hqLightPanelBtn').onclick=()=>toggleLightingPanel(true);
    this.resizeObserver=new ResizeObserver(()=>{if(active)this.resize()});this.resizeObserver.observe(this.host);
    this.configureQuality();this.ready=true;await this.loadEnvironment();return true;
  }
  configureQuality(){
    if(!this.renderer)return;const dpr=devicePixelRatio||1;let ratio,shadow;
    if(isMobile()){ratio=quality==='fast'?Math.min(dpr,1):quality==='ultra'?Math.min(dpr,1.45):Math.min(dpr,1.2);shadow=quality==='ultra'?2048:1024}
    else{ratio=quality==='fast'?Math.min(dpr,1.2):quality==='ultra'?Math.min(dpr,2.1):Math.min(dpr,1.7);shadow=quality==='fast'?1024:quality==='ultra'?4096:2048}
    this.pixelRatio=ratio;this.shadowSize=shadow;this.renderer.setPixelRatio(ratio);if(active)this.resize();
  }
  async loadEnvironment(customFile=null){
    if(!this.renderer||!this.scene)return;
    const token=++this.envToken;setLightingStatus('Загрузка окружения…');
    try{
      let source=null,pmremTarget=null;
      const pmrem=new THREE.PMREMGenerator(this.renderer);pmrem.compileEquirectangularShader();
      if(customFile){
        if(this.customUrl)URL.revokeObjectURL(this.customUrl);this.customUrl=URL.createObjectURL(customFile);this.customType=customFile.name.toLowerCase().endsWith('.exr')?'exr':'hdr';
        source=this.customType==='exr'?await new EXRLoader().loadAsync(this.customUrl):await new RGBELoader().loadAsync(this.customUrl);
      }else if(settings.envPreset==='studio'){
        const {RoomEnvironment}=await import('three/addons/environments/RoomEnvironment.js');
        pmremTarget=pmrem.fromScene(new RoomEnvironment(),.04);
      }else{
        const preset=HDR_PRESETS[settings.envPreset]||HDR_PRESETS.studio;
        if(preset.url)source=await new RGBELoader().loadAsync(preset.url);
      }
      if(token!==this.envToken){source?.dispose?.();pmremTarget?.dispose?.();pmrem.dispose();return}
      if(source){source.mapping=THREE.EquirectangularReflectionMapping;pmremTarget=pmrem.fromEquirectangular(source)}
      this.env?.dispose?.();if(this.envSource&&this.envSource!==source)this.envSource.dispose?.();
      this.env=pmremTarget?.texture||null;this.envSource=source||null;this.scene.environment=this.env;this.applyLiveLighting();pmrem.dispose();
      setLightingStatus(customFile?`HDR загружен: ${customFile.name}`:`Окружение: ${HDR_PRESETS[settings.envPreset]?.label||'Studio'}`);
    }catch(err){
      setLightingStatus('HDR не загрузился — включён Studio IBL');
      if(settings.envPreset!=='studio'){settings.envPreset='studio';saveLightSettings();updateLightingUi();await this.loadEnvironment()}
    }
  }
  resize(){
    if(!this.renderer||!this.host||this.host.hidden)return;const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);
    this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.draw();
  }
  clear(){
    if(this.root){this.scene.remove(this.root);this.root.traverse(o=>{o.geometry?.dispose?.();const mats=Array.isArray(o.material)?o.material:o.material?[o.material]:[];for(const m of mats){m.map?.dispose?.();m.dispose?.()}})}
    this.root=new THREE.Group();this.scene.add(this.root);this.keyLight=this.hemi=this.fill=this.rim=null;
  }
  addLights(wallW,wallH){
    this.lastWall={w:wallW,h:wallH};
    this.hemi=new THREE.HemisphereLight(0xffffff,0x28313c,settings.ambient);this.root.add(this.hemi);
    this.keyLight=new THREE.DirectionalLight(kelvinToColor(settings.temperature),settings.sunIntensity);this.keyLight.castShadow=true;
    this.keyLight.shadow.mapSize.set(this.shadowSize||1024,this.shadowSize||1024);this.keyLight.shadow.bias=-.00012;this.keyLight.shadow.normalBias=.025;this.keyLight.shadow.radius=settings.shadowSoftness;
    const span=Math.max(wallW,wallH)*.8;this.keyLight.shadow.camera.left=-span;this.keyLight.shadow.camera.right=span;this.keyLight.shadow.camera.top=span;this.keyLight.shadow.camera.bottom=-span;this.keyLight.shadow.camera.near=.1;this.keyLight.shadow.camera.far=Math.max(50,span*5);this.root.add(this.keyLight);
    this.fill=new THREE.DirectionalLight(0xc8ddff,Math.max(.15,settings.ambient*.95));this.fill.position.set(wallW*.75,wallH*.18,8);this.root.add(this.fill);
    this.rim=new THREE.DirectionalLight(0xffd7b8,Math.max(.08,settings.ambient*.55));this.rim.position.set(-wallW*.25,-wallH*.45,6);this.root.add(this.rim);this.applyLiveLighting();
  }
  updateSunPosition(){
    if(!this.keyLight)return;const r=Math.max(8,Math.max(this.lastWall.w,this.lastWall.h)*1.15),az=THREE.MathUtils.degToRad(settings.sunAngle),el=THREE.MathUtils.degToRad(settings.sunHeight);
    const x=Math.sin(az)*Math.cos(el)*r,y=Math.sin(el)*r,z=Math.max(r*.12,Math.abs(Math.cos(az)*Math.cos(el)*r));this.keyLight.position.set(x,y,z);
  }
  applyLiveLighting(){
    if(this.renderer)this.renderer.toneMappingExposure=settings.exposure;
    if(this.scene){this.scene.environmentIntensity=settings.hdrIntensity;this.scene.backgroundIntensity=settings.hdrIntensity;this.scene.background=settings.showBackground&&this.envSource?this.envSource:new THREE.Color('#15171b')}
    if(this.keyLight){this.keyLight.intensity=settings.sunIntensity;this.keyLight.color.copy(kelvinToColor(settings.temperature));this.keyLight.shadow.radius=settings.shadowSoftness;this.updateSunPosition()}
    if(this.hemi)this.hemi.intensity=settings.ambient;if(this.fill)this.fill.intensity=Math.max(.15,settings.ambient*.95);if(this.rim)this.rim.intensity=Math.max(.08,settings.ambient*.55);this.draw();
  }
  async rebuild(){
    if(!active)return;if(!this.ready){const ok=await this.mount();if(!ok)return}
    const token=++this.token,loading=this.host.querySelector('#hqRenderLoading');loading.hidden=false;loading.textContent='Строим Render HQ…';
    const p=readProject(),a=p?.artboards?.find(x=>x.id===p.activeArtboardId)||p?.artboards?.[0];if(!p||!a){loading.textContent='Нет активного Artboard';return}
    this.clear();const unit=50,wallW=a.w/unit,wallH=a.h/unit;this.addLights(wallW,wallH);
    const wall=new THREE.Mesh(new THREE.PlaneGeometry(wallW,wallH),new THREE.MeshPhysicalMaterial({color:color(a.bg||'#f5f5f5'),roughness:.86,metalness:0,clearcoat:.025}));wall.receiveShadow=true;this.root.add(wall);
    for(const o of (a.objects||[]).filter(x=>x.type==='image'&&x.src)){
      try{const tex=await new THREE.TextureLoader().loadAsync(o.src);if(token!==this.token)return;tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(isMobile()?2:8,this.renderer.capabilities.getMaxAnisotropy());const mesh=new THREE.Mesh(new THREE.PlaneGeometry(o.w/unit,o.h/unit),new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:o.opacity??1,toneMapped:false}));mesh.position.set((o.x+o.w/2-a.w/2)/unit,(a.h/2-(o.y+o.h/2))/unit,.012);mesh.rotation.z=THREE.MathUtils.degToRad(-(o.rotation||0));this.root.add(mesh)}catch{}
    }
    for(const o of (a.objects||[]).filter(x=>x.type==='rect')){
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(o.w/unit,o.h/unit,.08),new THREE.MeshPhysicalMaterial({color:color(o.fill||'#0a84ff'),roughness:.46,clearcoat:.18}));mesh.position.set((o.x+o.w/2-a.w/2)/unit,(a.h/2-(o.y+o.h/2))/unit,.05);mesh.rotation.z=THREE.MathUtils.degToRad(-(o.rotation||0));mesh.castShadow=true;mesh.receiveShadow=true;this.root.add(mesh);
    }
    for(const o of (a.objects||[]).filter(x=>x.type==='text')){
      let font;try{font=await loadFont(o.font3D)}catch{try{font=await loadFont('helvetiker')}catch{continue}}if(token!==this.token)return;
      const depth=clamp(Number(o.returnDepth)||50,5,300)/45,bevel=clamp(Number(o.faceThickness)||3,1,30)/140,curve=quality==='fast'?5:quality==='ultra'?12:8,bevelSeg=quality==='fast'?1:quality==='ultra'?5:3;
      const geo=new TextGeometry(o.text||' ',{font,size:1,depth,curveSegments:curve,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel*.68,bevelSegments:bevelSeg});geo.computeBoundingBox();const bb=geo.boundingBox;if(!bb)continue;const rawW=Math.max(.001,bb.max.x-bb.min.x),rawH=Math.max(.001,bb.max.y-bb.min.y);geo.center();
      const lit=o.lightMode==='face'||o.lightMode==='both',face=makeMaterial(o.faceMaterial,o.faceColor,{emissive:lit?o.lightColor:null,intensity:lit?(Number(o.lightIntensity)||.7)*2:0}),side=makeMaterial(sideKind(o.returnMaterial),o.sideColor);
      const mesh=new THREE.Mesh(geo,[face,side]),tw=Math.max(.2,o.w/unit),th=Math.max(.2,o.h/unit);mesh.scale.set(tw/rawW,th/rawH,1);const x=(o.x+o.w/2-a.w/2)/unit,y=(a.h/2-(o.y+o.h/2))/unit,gap=(Number(o.wallGap)||0)/50;mesh.position.set(x,y,depth/2+gap+.05);mesh.rotation.z=THREE.MathUtils.degToRad(-(o.rotation||0));mesh.castShadow=true;mesh.receiveShadow=true;this.root.add(mesh);
      const bm=new THREE.Mesh(geo.clone(),makeMaterial(o.backMaterial,o.backColor));bm.scale.set(mesh.scale.x,mesh.scale.y,Math.max(.018,(Number(o.backThickness)||5)/150));bm.position.set(x,y,gap+.018);bm.rotation.z=mesh.rotation.z;bm.castShadow=true;this.root.add(bm);
      if(o.lightMode==='halo'||o.lightMode==='both'){const li=Math.max(.05,Number(o.lightIntensity)||.7),lc=color(o.lightColor),glow=new THREE.Mesh(geo.clone(),new THREE.MeshBasicMaterial({color:lc,transparent:true,opacity:clamp(li*.2,.05,.45),blending:THREE.AdditiveBlending,depthWrite:false}));glow.scale.set(mesh.scale.x*1.028,mesh.scale.y*1.028,.025);glow.position.set(x,y,Math.max(.025,gap*.26));glow.rotation.z=mesh.rotation.z;this.root.add(glow);const pl=new THREE.PointLight(lc,14*li,Math.max(5,tw*1.4),2);pl.position.set(x,y,Math.max(.14,gap+.1));this.root.add(pl)}
    }
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(wallW*3,wallH*2.3),new THREE.MeshPhysicalMaterial({color:0x17191d,roughness:.8,metalness:.06}));floor.rotation.x=-Math.PI/2;floor.position.set(0,-wallH/2-.28,wallH*.6);floor.receiveShadow=true;this.root.add(floor);
    this.setCamera(p,a);loading.hidden=true;this.applyLiveLighting();
  }
  setCamera(p,a){
    const unit=50,w=this.host.clientWidth||1,h=this.host.clientHeight||1;this.camera.aspect=w/h;
    if((p.mode||'2d')==='view3d'&&p.camera3d?.position?.length===3){this.camera.position.fromArray(p.camera3d.position);this.camera.lookAt(new THREE.Vector3().fromArray(p.camera3d.target||[0,0,0]))}
    else{const zoom=clamp(Number(p.view?.zoom)||.72,.05,8),fov=THREE.MathUtils.degToRad(this.camera.fov),ppu=unit*zoom,d=h/(2*Math.max(.1,ppu)*Math.tan(fov/2)),docX=(w/2-(Number(p.view?.x)||0))/zoom,docY=(h/2-(Number(p.view?.y)||0))/zoom,localX=docX-(Number(a.x)||0),localY=docY-(Number(a.y)||0),tx=(localX-a.w/2)/unit,ty=(a.h/2-localY)/unit;this.camera.position.set(tx,ty,d);this.camera.lookAt(tx,ty,0)}
    this.camera.near=.02;this.camera.far=1000;this.camera.updateProjectionMatrix();
  }
  draw(){if(!this.renderer||!active||this.host.hidden)return;this.renderer.toneMappingExposure=settings.exposure;this.renderer.render(this.scene,this.camera)}
  async show(){const ok=await this.mount();if(!ok)return;active=true;this.host.hidden=false;document.body.classList.add('hq-render-active');this.configureQuality();this.resize();await this.rebuild();syncUi()}
  hide(){active=false;if(this.host)this.host.hidden=true;document.body.classList.remove('hq-render-active');syncUi()}
  toggle(){active?this.hide():this.show()}
  savePng(){if(!this.renderer)return;this.draw();try{const a=document.createElement('a');a.download=`Colorize-Render-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.png`;a.href=this.renderer.domElement.toDataURL('image/png',1);a.click()}catch{}}
}
const hq=new StableHQRenderer();

function makeLightingPanel(){
  if(document.getElementById('lightingPanel'))return;const viewport=document.getElementById('viewport');if(!viewport)return;
  const panel=document.createElement('section');panel.id='lightingPanel';panel.className='lighting-panel';panel.hidden=true;
  panel.innerHTML=`<div class="lighting-head"><strong>Освещение / HDR</strong><button id="lightingClose">×</button></div>
  <div class="lighting-section"><label class="lighting-row wide"><span>Окружение</span><select id="envPreset"><option value="studio">Studio IBL</option><option value="day">HDR · День</option><option value="sunset">HDR · Закат</option><option value="night">HDR · Ночь</option><option value="custom">Мой HDR / EXR</option></select></label><div class="hdr-upload"><label>Загрузить HDR / EXR<input id="hdrFileInput" type="file" accept=".hdr,.exr" hidden></label></div><label class="lighting-check"><span>Показывать HDR как фон</span><input id="showHdrBackground" type="checkbox"></label><div id="lightingStatus" class="lighting-status"></div></div>
  <div class="lighting-section"><label class="lighting-row"><span>HDR яркость</span><input id="hdrIntensity" type="range" min="0" max="3" step=".05"><output></output></label><label class="lighting-row"><span>Экспозиция</span><input id="lightExposure" type="range" min=".5" max="2" step=".01"><output></output></label><label class="lighting-row"><span>Общий свет</span><input id="ambientLight" type="range" min="0" max="3" step=".05"><output></output></label></div>
  <div class="lighting-section"><label class="lighting-row"><span>Солнце</span><input id="sunIntensity" type="range" min="0" max="8" step=".1"><output></output></label><label class="lighting-row"><span>Угол</span><input id="sunAngle" type="range" min="-180" max="180" step="1"><output></output></label><label class="lighting-row"><span>Высота</span><input id="sunHeight" type="range" min="5" max="85" step="1"><output></output></label><label class="lighting-row"><span>Температура</span><input id="lightTemperature" type="range" min="2500" max="9000" step="100"><output></output></label><label class="lighting-row"><span>Мягкость тени</span><input id="shadowSoftness" type="range" min="0" max="8" step=".25"><output></output></label></div>
  <div class="lighting-section"><button id="lightingReset">Сбросить свет</button><div class="lighting-note">HDR влияет на отражения акрила, металла и композита. Свой .HDR или .EXR хранится только в текущем сеансе браузера.</div></div>`;
  viewport.appendChild(panel);
  panel.querySelector('#lightingClose').onclick=()=>toggleLightingPanel(false);panel.querySelector('#lightingReset').onclick=()=>{settings={...DEFAULT_LIGHT};saveLightSettings();updateLightingUi();if(active){hq.loadEnvironment();hq.rebuild()}};
  panel.querySelector('#envPreset').onchange=e=>{settings.envPreset=e.target.value;if(ENV_DEFAULTS[settings.envPreset])Object.assign(settings,ENV_DEFAULTS[settings.envPreset]);saveLightSettings();updateLightingUi();if(active)hq.loadEnvironment();};
  panel.querySelector('#showHdrBackground').onchange=e=>{settings.showBackground=e.target.checked;saveLightSettings();hq.applyLiveLighting()};
  const bindRange=(id,key,format=v=>String(v))=>{const input=panel.querySelector('#'+id),out=input.parentElement.querySelector('output');input.oninput=()=>{settings[key]=number(input.value,DEFAULT_LIGHT[key]);out.textContent=format(settings[key]);saveLightSettings();hq.applyLiveLighting()}};
  bindRange('hdrIntensity','hdrIntensity',v=>v.toFixed(2));bindRange('lightExposure','exposure',v=>v.toFixed(2));bindRange('ambientLight','ambient',v=>v.toFixed(2));bindRange('sunIntensity','sunIntensity',v=>v.toFixed(1));bindRange('sunAngle','sunAngle',v=>`${Math.round(v)}°`);bindRange('sunHeight','sunHeight',v=>`${Math.round(v)}°`);bindRange('lightTemperature','temperature',v=>`${Math.round(v)}K`);bindRange('shadowSoftness','shadowSoftness',v=>v.toFixed(1));
  panel.querySelector('#hdrFileInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;settings.envPreset='custom';saveLightSettings();updateLightingUi();const ok=await hq.mount();if(ok)await hq.loadEnvironment(f);if(active)hq.rebuild();e.target.value=''};
  updateLightingUi();
}
function setLightingStatus(text){const el=document.getElementById('lightingStatus');if(el)el.textContent=text}
function updateLightingUi(){
  const p=document.getElementById('lightingPanel');if(!p)return;const set=(id,val,txt)=>{const i=p.querySelector('#'+id);if(!i)return;i.value=val;const o=i.parentElement.querySelector('output');if(o)o.textContent=txt};
  p.querySelector('#envPreset').value=settings.envPreset;p.querySelector('#showHdrBackground').checked=!!settings.showBackground;
  set('hdrIntensity',settings.hdrIntensity,Number(settings.hdrIntensity).toFixed(2));set('lightExposure',settings.exposure,Number(settings.exposure).toFixed(2));set('ambientLight',settings.ambient,Number(settings.ambient).toFixed(2));set('sunIntensity',settings.sunIntensity,Number(settings.sunIntensity).toFixed(1));set('sunAngle',settings.sunAngle,`${Math.round(settings.sunAngle)}°`);set('sunHeight',settings.sunHeight,`${Math.round(settings.sunHeight)}°`);set('lightTemperature',settings.temperature,`${Math.round(settings.temperature)}K`);set('shadowSoftness',settings.shadowSoftness,Number(settings.shadowSoftness).toFixed(1));
}
function toggleLightingPanel(force){const p=document.getElementById('lightingPanel');if(!p)return;const show=force===undefined?p.hidden:!!force;p.hidden=!show;document.getElementById('lightingBtn')?.classList.toggle('active',show)}
function desiredLabel(){const p=readProject();if(active)return (p?.mode==='view3d'?'3D':'2D')+' · Render HQ';return p?.mode==='view3d'?'3D · реальная перспектива':'2D · редактирование'}
function syncUi(){const b=document.getElementById('globalRenderBtn');if(b){b.classList.toggle('active',active);b.textContent=active?'Render ON':'Render'}const badge=document.getElementById('modeBadge'),label=desiredLabel();if(badge&&badge.textContent!==label)badge.textContent=label}
function scheduleRebuild(e){if(e?.target?.closest?.('#lightingPanel'))return;clearTimeout(rebuildTimer);rebuildTimer=setTimeout(()=>{syncUi();if(active)hq.rebuild()},260)}

window.addEventListener('DOMContentLoaded',()=>{
  makeLightingPanel();const renderBtn=document.getElementById('globalRenderBtn');if(renderBtn)renderBtn.onclick=()=>hq.toggle();const lightingBtn=document.getElementById('lightingBtn');if(lightingBtn)lightingBtn.onclick=()=>toggleLightingPanel();
  const old=document.getElementById('view3dRenderBtn');if(old)old.style.display='none';document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>setTimeout(()=>{syncUi();if(active)hq.rebuild()},100)));
  document.addEventListener('input',scheduleRebuild,true);document.addEventListener('change',scheduleRebuild,true);syncUi();updateLightingUi();
});
