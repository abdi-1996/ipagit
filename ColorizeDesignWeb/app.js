import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
const clamp = (v,a,b) => Math.min(b,Math.max(a,v));
const STORE='colorize-design-web-v04';
const OLD_STORES=['colorize-design-web-v03','colorize-design-web-v02','colorize-design-web-v01'];

const MATERIALS={acrylic:'Акрил',pvc:'ПВХ',metal:'Металл',acm:'Композит'};
const SIDE_MATERIALS={pvc:'ПВХ',aluminum:'Алюминий',stainless:'Нержавейка',acrylic:'Акрил',painted:'Окрашенный металл'};
const BACK_MATERIALS={pvc:'ПВХ',acrylic:'Акрил',acm:'Композит',metal:'Металл'};
const FONT3D={
  helvetiker:{label:'Helvetiker Bold',url:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/helvetiker_bold.typeface.json',css:'Arial Black'},
  optimer:{label:'Optimer Bold',url:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/optimer_bold.typeface.json',css:'Arial'},
  gentilis:{label:'Gentilis Bold',url:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/gentilis_bold.typeface.json',css:'Georgia'},
  droidSans:{label:'Droid Sans Bold',url:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/droid/droid_sans_bold.typeface.json',css:'Arial'},
  droidSerif:{label:'Droid Serif Bold',url:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/droid/droid_serif_bold.typeface.json',css:'Georgia'}
};
const PRESETS={
  custom:null,
  acrylic:{faceMaterial:'acrylic',faceThickness:3,returnMaterial:'pvc',returnDepth:50,backMaterial:'pvc',backThickness:5,lightMode:'off'},
  pvc:{faceMaterial:'pvc',faceThickness:10,returnMaterial:'pvc',returnDepth:30,backMaterial:'pvc',backThickness:5,lightMode:'off'},
  channel:{faceMaterial:'acrylic',faceThickness:3,returnMaterial:'aluminum',returnDepth:80,backMaterial:'pvc',backThickness:5,lightMode:'face'},
  halo:{faceMaterial:'metal',faceThickness:2,returnMaterial:'stainless',returnDepth:50,backMaterial:'acrylic',backThickness:5,lightMode:'halo'},
  metal:{faceMaterial:'metal',faceThickness:2,returnMaterial:'stainless',returnDepth:40,backMaterial:'metal',backThickness:2,lightMode:'off'}
};

function defaultText(id,text='COLORIZE'){
  return {id,type:'text',name:text,text,x:340,y:310,w:400,h:90,rotation:0,opacity:1,
    fontSize:76,fontFamily:'Arial Black',fontWeight:'800',font3D:'helvetiker',letterSpacing:0,
    color:'#111827',faceColor:'#111827',sideColor:'#20252b',backColor:'#0b0d10',
    preset:'custom',faceMaterial:'acrylic',returnMaterial:'pvc',backMaterial:'pvc',
    faceThickness:3,returnDepth:50,backThickness:5,wallGap:8,
    lightMode:'off',lightColor:'#ffffff',lightIntensity:.72};
}
function defaultProject(){
  const artId=uid(),textId=uid();
  return {version:4,name:'Новый проект',mode:'2d',view3dRender:false,
    view:{x:160,y:110,zoom:.72},camera3d:null,activeArtboardId:artId,selectedObjectId:textId,
    artboards:[{id:artId,name:'Artboard 1',x:0,y:0,w:1080,h:720,bg:'#ffffff',objects:[defaultText(textId)]}]};
}
function normalizeText(o){
  if(o.type!=='text') return o;
  o.fontWeight??='800';o.font3D??='helvetiker';o.letterSpacing??=0;o.faceColor??=o.color||'#111827';o.color=o.faceColor;
  o.sideColor??='#20252b';o.backColor??='#0b0d10';o.preset??='custom';o.faceMaterial??='acrylic';o.returnMaterial??='pvc';o.backMaterial??='pvc';
  o.faceThickness??=3;o.returnDepth??=50;o.backThickness??=5;o.wallGap??=8;o.lightMode??='off';o.lightColor??='#ffffff';o.lightIntensity??=.72;
  return o;
}
function normalizeProject(p){
  if(!p||!Array.isArray(p.artboards)) return defaultProject();
  p.version=4;p.mode||='2d';p.view3dRender??=false;p.camera3d??=null;p.view||={x:160,y:110,zoom:.72};
  p.artboards.forEach(a=>{a.objects||=[];a.objects.forEach(normalizeText);});
  return p;
}
function load(){
  try{
    let raw=localStorage.getItem(STORE);
    if(!raw){for(const k of OLD_STORES){raw=localStorage.getItem(k);if(raw)break;}}
    return raw?normalizeProject(JSON.parse(raw)):null;
  }catch{return null}
}
function save(){try{localStorage.setItem(STORE,JSON.stringify(project));}catch{}}

let project=load()||defaultProject();
let tool='select',drag=null,resize=null,pinchStart=null;
const pointers=new Map();

const viewport=$('#viewport'),world=$('#world'),threeHost=$('#threeHost'),threeLoading=$('#threeLoading');
const layersList=$('#layersList'),artboardsList=$('#artboardsList'),properties=$('#properties');
const zoomStatus=$('#zoomStatus'),coordStatus=$('#coordStatus'),toolStatus=$('#toolStatus');
const rightPanel=$('#rightPanel'),modeBadge=$('#modeBadge'),view3dRenderBtn=$('#view3dRenderBtn'),reset3dBtn=$('#reset3dBtn');

const activeArtboard=()=>project.artboards.find(a=>a.id===project.activeArtboardId)||project.artboards[0];
const selectedObject=()=>activeArtboard()?.objects.find(o=>o.id===project.selectedObjectId)||null;
const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function setTool(next){
  tool=next;
  $$('.tool').forEach(b=>b.classList.remove('active'));
  if(tool==='select') $('#selectTool')?.classList.add('active');
  if(tool==='pan') $('#panTool')?.classList.add('active');
  toolStatus.textContent=tool==='pan'?'Рука':'Выбор';
}
function screenToWorld(clientX,clientY){
  const r=viewport.getBoundingClientRect();
  return {x:(clientX-r.left-project.view.x)/project.view.zoom,y:(clientY-r.top-project.view.y)/project.view.zoom};
}
function applyWorldTransform(){
  world.style.transform=`translate(${project.view.x}px,${project.view.y}px) scale(${project.view.zoom})`;
  zoomStatus.textContent=`${Math.round(project.view.zoom*100)}%`;
}
function hexToRgb(hex){
  const m=String(hex||'#000').replace('#','');const h=m.length===3?m.split('').map(c=>c+c).join(''):m.padEnd(6,'0');
  return [parseInt(h.slice(0,2),16)||0,parseInt(h.slice(2,4),16)||0,parseInt(h.slice(4,6),16)||0];
}
function rgba(hex,a){const[r,g,b]=hexToRgb(hex);return`rgba(${r},${g},${b},${a})`;}
function extrusionShadow(o,rendered=false){
  const px=clamp((Number(o.returnDepth)||0)/5,1,24),steps=Math.max(1,Math.round(px)),sh=[];
  for(let i=1;i<=steps;i++){const t=i/steps;sh.push(`${i}px ${Math.round(i*.72)}px 0 ${rgba(o.sideColor||'#222',.86-.22*t)}`)}
  sh.push(`${Math.round(px*.75)}px ${Math.round(px*1.05)}px ${rendered?Math.max(5,px*.45):3}px rgba(0,0,0,${rendered?.34:.25})`);
  return sh.join(',');
}
function applyTextVisual(node,o){
  normalizeText(o);
  const rendered=project.mode==='render',volume=project.mode==='3d'||project.mode==='render';
  node.dataset.text=o.text||'';node.style.fontSize=`${o.fontSize||48}px`;node.style.fontFamily=o.fontFamily||FONT3D[o.font3D]?.css||'Arial';
  node.style.fontWeight=o.fontWeight||'800';node.style.letterSpacing=`${o.letterSpacing||0}px`;
  node.style.setProperty('--face-color',o.faceColor);node.style.setProperty('--light-color',o.lightColor);node.style.setProperty('--light-intensity',String(clamp(Number(o.lightIntensity)||0,0,1)));
  node.classList.toggle('rendered-face',rendered);Object.keys(MATERIALS).forEach(m=>node.classList.remove(`material-${m}`));node.classList.add(`material-${o.faceMaterial||'acrylic'}`);
  node.classList.toggle('light-halo',volume&&(o.lightMode==='halo'||o.lightMode==='both'));node.classList.toggle('light-face',volume&&(o.lightMode==='face'||o.lightMode==='both'));
  if(volume){node.style.textShadow=extrusionShadow(o,rendered);node.style.color=rendered?'transparent':o.faceColor}
  else{node.style.textShadow='none';node.style.color=o.faceColor;node.classList.remove('rendered-face','light-halo','light-face')}
}

function renderWorld(){
  const isReal3D=project.mode==='view3d';
  world.hidden=isReal3D;threeHost.hidden=!isReal3D;
  world.innerHTML='';
  if(!isReal3D){
    for(const a of project.artboards){
      const el=document.createElement('div');el.className=`artboard${a.id===project.activeArtboardId?' active':''}`;el.dataset.artboardId=a.id;
      Object.assign(el.style,{left:`${a.x}px`,top:`${a.y}px`,width:`${a.w}px`,height:`${a.h}px`,background:a.bg});
      const title=document.createElement('div');title.className='artboard-title';title.dataset.artboardHandle=a.id;title.textContent=a.name;el.appendChild(title);
      for(const o of a.objects){
        const node=document.createElement('div');node.className=`obj ${o.type}${o.id===project.selectedObjectId&&a.id===project.activeArtboardId?' selected':''}`;
        node.dataset.objectId=o.id;Object.assign(node.style,{left:`${o.x}px`,top:`${o.y}px`,width:`${o.w}px`,height:`${o.h}px`,transform:`rotate(${o.rotation||0}deg)`,opacity:String(o.opacity??1)});
        if(o.type==='text'){node.textContent=o.text;applyTextVisual(node,o)}
        else if(o.type==='rect'){node.style.background=o.fill||'#0a84ff';node.style.borderRadius=`${o.radius||0}px`}
        else if(o.type==='image'){const img=document.createElement('img');img.src=o.src;img.alt=o.name||'Image';node.appendChild(img)}
        if(o.id===project.selectedObjectId&&a.id===project.activeArtboardId&&project.mode==='2d'){const h=document.createElement('div');h.className='resize-handle';h.dataset.resizeId=o.id;node.appendChild(h)}
        el.appendChild(node);
      }
      world.appendChild(el);
    }
    applyWorldTransform();
  }
  view3dRenderBtn.hidden=!isReal3D;reset3dBtn.hidden=!isReal3D;
  view3dRenderBtn.classList.toggle('active',!!project.view3dRender);view3dRenderBtn.textContent=project.view3dRender?'Render ON':'Render OFF';
  const labels={ '2d':'2D · редактирование','3d':'3D · быстрый объём','render':'Render · быстрый материал','view3d':project.view3dRender?'3D View · реальный Render':'3D View · настоящая перспектива'};
  modeBadge.textContent=labels[project.mode]||project.mode;
  if(isReal3D) threeScene.rebuild();
}

function renderLists(){
  const a=activeArtboard();
  layersList.innerHTML=a?a.objects.slice().reverse().map(o=>`<div class="list-row ${o.id===project.selectedObjectId?'active':''}" data-layer-id="${o.id}"><span>${o.type==='text'?'T':o.type==='image'?'▧':'▭'}</span><span class="name">${esc(o.name||o.text||o.type)}</span><button class="mini" data-delete-object="${o.id}">×</button></div>`).join(''):'<div class="empty-note">Нет Artboard</div>';
  artboardsList.innerHTML=project.artboards.map(a2=>`<div class="list-row ${a2.id===project.activeArtboardId?'active':''}" data-artboard-row="${a2.id}"><span>▣</span><span class="name">${esc(a2.name)}</span><span>${Math.round(a2.w)}×${Math.round(a2.h)}</span><button class="mini" data-delete-artboard="${a2.id}">×</button></div>`).join('');
}
function prop(label,key,value,type='number',extra=''){return`<label class="prop-row"><span>${label}</span><input data-prop="${key}" type="${type}" value="${esc(value)}" ${extra}></label>`}
function selectProp(label,key,value,items){return`<label class="prop-row"><span>${label}</span><select data-prop="${key}">${Object.entries(items).map(([k,v])=>`<option value="${esc(k)}" ${k===value?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`}
function section(title,html,hint=''){return`<div class="prop-section"><h4>${esc(title)}</h4>${html}${hint?`<div class="prop-hint">${esc(hint)}</div>`:''}</div>`}
function renderProperties(){
  const o=selectedObject(),a=activeArtboard();
  if(o){
    let html=section('Положение',prop('Имя','name',o.name||'','text')+prop('X','x',Math.round(o.x))+prop('Y','y',Math.round(o.y))+prop('Ширина','w',Math.round(o.w),'number','min="1"')+prop('Высота','h',Math.round(o.h),'number','min="1"')+prop('Поворот','rotation',o.rotation||0)+prop('Прозрачность','opacity',o.opacity??1,'number','min="0" max="1" step=".05"'));
    if(o.type==='text'){
      normalizeText(o);
      const fontItems=Object.fromEntries(Object.entries(FONT3D).map(([k,v])=>[k,v.label]));
      html+=section('Текст',prop('Надпись','text',o.text||'','text')+selectProp('3D шрифт','font3D',o.font3D,fontItems)+prop('Размер','fontSize',o.fontSize||48,'number','min="8" max="500"')+prop('Интервал','letterSpacing',o.letterSpacing||0,'number','min="-20" max="100" step=".5"')+prop('Цвет лица','faceColor',o.faceColor,'color'));
      html+=section('Конструкция',selectProp('Пресет','preset',o.preset||'custom',{custom:'Своя конструкция',acrylic:'Акриловая буква',pvc:'ПВХ буква',channel:'Световая объёмная',halo:'Контражурная',metal:'Металлическая'})+selectProp('Материал лица','faceMaterial',o.faceMaterial,MATERIALS)+prop('Толщина лица','faceThickness',o.faceThickness,'number','min="1" max="30" step="1"')+selectProp('Материал борта','returnMaterial',o.returnMaterial,SIDE_MATERIALS)+prop('Глубина','returnDepth',o.returnDepth,'number','min="5" max="300" step="5"')+prop('Цвет борта','sideColor',o.sideColor,'color')+selectProp('Задник','backMaterial',o.backMaterial,BACK_MATERIALS)+prop('Толщина задника','backThickness',o.backThickness,'number','min="1" max="30" step="1"')+prop('Цвет задника','backColor',o.backColor,'color')+prop('Отступ от стены','wallGap',o.wallGap,'number','min="0" max="100" step="1"'),'Размеры — в миллиметрах. 50 мм = 5 см.');
      html+=section('Подсветка',selectProp('Тип','lightMode',o.lightMode,{off:'Без подсветки',face:'Face Lit',halo:'Halo Lit',both:'Face + Halo'})+prop('Цвет света','lightColor',o.lightColor,'color')+prop('Яркость','lightIntensity',o.lightIntensity,'number','min="0" max="2" step=".05"'),'В настоящем 3D View подсветка работает как источник света.');
    }else if(o.type==='rect') html+=section('Фигура',prop('Заливка','fill',o.fill||'#0a84ff','color')+prop('Радиус','radius',o.radius||0));
    properties.className='properties';properties.innerHTML=html;
  }else if(a){
    properties.className='properties';properties.innerHTML=section('Artboard',prop('Название','art_name',a.name,'text')+prop('X','art_x',Math.round(a.x))+prop('Y','art_y',Math.round(a.y))+prop('Ширина','art_w',Math.round(a.w),'number','min="50"')+prop('Высота','art_h',Math.round(a.h),'number','min="50"')+prop('Фон','art_bg',a.bg||'#fff','color'));
  }else{properties.className='properties empty';properties.textContent='Выберите объект или Artboard'}
}
function renderAll(){renderWorld();renderLists();renderProperties();save()}

function addArtboard(){
  const n=project.artboards.length+1,last=project.artboards.at(-1);
  const a={id:uid(),name:`Artboard ${n}`,x:last?last.x+last.w+140:0,y:last?last.y:0,w:1080,h:720,bg:'#ffffff',objects:[]};
  project.artboards.push(a);project.activeArtboardId=a.id;project.selectedObjectId=null;renderAll();fitArtboard();
}
function addText(){
  const a=activeArtboard();if(!a)return;const o=defaultText(uid(),'НОВАЯ НАДПИСЬ');
  o.name='Новая надпись';o.x=a.w/2-180;o.y=a.h/2-45;o.w=360;o.h=90;o.fontSize=58;a.objects.push(o);project.selectedObjectId=o.id;renderAll();
}
function addRect(){
  const a=activeArtboard();if(!a)return;const o={id:uid(),type:'rect',name:'Прямоугольник',x:a.w/2-120,y:a.h/2-70,w:240,h:140,rotation:0,fill:'#0a84ff',radius:12,opacity:1};a.objects.push(o);project.selectedObjectId=o.id;renderAll();
}
function duplicateSelected(){const a=activeArtboard(),o=selectedObject();if(!a||!o)return;const c=structuredClone(o);c.id=uid();c.name=`${c.name||'Объект'} копия`;c.x+=28;c.y+=28;a.objects.push(c);project.selectedObjectId=c.id;renderAll()}
function fitArtboard(){
  if(project.mode==='view3d'){threeScene.resetCamera();return}
  const a=activeArtboard();if(!a)return;const r=viewport.getBoundingClientRect(),m=80,z=clamp(Math.min((r.width-m)/a.w,(r.height-m)/a.h),.08,3);
  project.view.zoom=z;project.view.x=r.width/2-(a.x+a.w/2)*z;project.view.y=r.height/2-(a.y+a.h/2)*z;applyWorldTransform();save();
}
function centerAll(){
  if(!project.artboards.length)return;const minX=Math.min(...project.artboards.map(a=>a.x)),minY=Math.min(...project.artboards.map(a=>a.y)),maxX=Math.max(...project.artboards.map(a=>a.x+a.w)),maxY=Math.max(...project.artboards.map(a=>a.y+a.h));
  const r=viewport.getBoundingClientRect(),w=maxX-minX,h=maxY-minY,z=clamp(Math.min((r.width-100)/w,(r.height-100)/h),.05,2);project.view.zoom=z;project.view.x=r.width/2-(minX+w/2)*z;project.view.y=r.height/2-(minY+h/2)*z;applyWorldTransform();save();
}
function zoomAt(factor,cx,cy){
  if(project.mode==='view3d')return;
  const r=viewport.getBoundingClientRect(),x=cx??r.left+r.width/2,y=cy??r.top+r.height/2,b=screenToWorld(x,y),nz=clamp(project.view.zoom*factor,.05,8);
  project.view.zoom=nz;project.view.x=(x-r.left)-b.x*nz;project.view.y=(y-r.top)-b.y*nz;applyWorldTransform();save();
}

const fontLoader=new FontLoader(),fontCache=new Map();
function load3DFont(key){
  const k=FONT3D[key]?key:'helvetiker';
  if(fontCache.has(k))return fontCache.get(k);
  const p=new Promise((resolve,reject)=>fontLoader.load(FONT3D[k].url,resolve,undefined,reject));
  fontCache.set(k,p);return p;
}
function colorObj(hex){return new THREE.Color(hex||'#ffffff')}
function pbrMaterial(kind,color,rendered,emissive=null,intensity=0){
  const common={color:colorObj(color),roughness:.62,metalness:0};
  if(kind==='metal'){common.metalness=.92;common.roughness=rendered?.22:.42}
  else if(kind==='acm'){common.metalness=.35;common.roughness=rendered?.35:.5}
  else if(kind==='pvc'){common.metalness=0;common.roughness=.82}
  else if(kind==='acrylic'){common.metalness=0;common.roughness=rendered?.2:.45}
  const m=rendered?new THREE.MeshPhysicalMaterial({...common,clearcoat:kind==='acrylic'?.85:.2,clearcoatRoughness:.16,transmission:kind==='acrylic'?.08:0,ior:1.49}):new THREE.MeshStandardMaterial(common);
  if(emissive){m.emissive=colorObj(emissive);m.emissiveIntensity=intensity}
  return m;
}
const sideKind=(m)=>m==='aluminum'||m==='stainless'||m==='painted'?'metal':m;
class Real3DScene{
  constructor(host){
    this.host=host;this.renderer=null;this.scene=null;this.camera=null;this.controls=null;this.root=null;this.wall=null;this.frame=0;this.rebuildToken=0;
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);
  }
  ensure(){
    if(this.renderer)return;
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.host.prepend(this.renderer.domElement);
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#17191d');
    this.camera=new THREE.PerspectiveCamera(38,1,.05,1000);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.08;this.controls.screenSpacePanning=true;this.controls.minDistance=4;this.controls.maxDistance=160;
    this.controls.addEventListener('end',()=>{project.camera3d={position:this.camera.position.toArray(),target:this.controls.target.toArray()};save()});
    this.animate();this.resize();
  }
  clear(){
    if(!this.scene)return;
    if(this.root){this.scene.remove(this.root);this.root.traverse(o=>{o.geometry?.dispose?.();if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose?.())}})}
    this.root=new THREE.Group();this.scene.add(this.root);
  }
  addLights(rendered){
    const hemi=new THREE.HemisphereLight(0xffffff,0x343844,rendered?1.25:1.55);this.root.add(hemi);
    const key=new THREE.DirectionalLight(0xffffff,rendered?3.3:2.3);key.position.set(-8,10,14);key.castShadow=true;key.shadow.mapSize.set(rendered?2048:1024,rendered?2048:1024);key.shadow.camera.near=.1;key.shadow.camera.far=60;this.root.add(key);
    const rim=new THREE.DirectionalLight(0xaac8ff,rendered?1.4:.7);rim.position.set(10,3,6);this.root.add(rim);
    if(rendered){const warm=new THREE.PointLight(0xffd5b0,10,32,2);warm.position.set(-6,-2,10);this.root.add(warm)}
  }
  async rebuild(){
    if(project.mode!=='view3d')return;
    this.ensure();const token=++this.rebuildToken;threeLoading.hidden=false;
    const a=activeArtboard();if(!a)return;
    this.clear();const rendered=!!project.view3dRender;this.addLights(rendered);
    const unit=50,wallW=a.w/unit,wallH=a.h/unit;
    const wallMat=new THREE.MeshPhysicalMaterial({color:colorObj(a.bg||'#f5f5f5'),roughness:.92,metalness:0});
    const wall=new THREE.Mesh(new THREE.PlaneGeometry(wallW,wallH),wallMat);wall.receiveShadow=true;wall.position.z=0;this.root.add(wall);this.wall=wall;
    for(const o of a.objects.filter(x=>x.type==='image'&&x.src)){
      try{
        const tex=await new THREE.TextureLoader().loadAsync(o.src);tex.colorSpace=THREE.SRGBColorSpace;
        const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:o.opacity??1});
        const mesh=new THREE.Mesh(new THREE.PlaneGeometry(o.w/unit,o.h/unit),mat);
        mesh.position.set((o.x+o.w/2-a.w/2)/unit,(a.h/2-(o.y+o.h/2))/unit,.012);mesh.rotation.z=THREE.MathUtils.degToRad(-(o.rotation||0));this.root.add(mesh);
      }catch{}
    }
    for(const o of a.objects.filter(x=>x.type==='rect')){
      const g=new THREE.BoxGeometry(o.w/unit,o.h/unit,.08),m=new THREE.MeshStandardMaterial({color:colorObj(o.fill||'#0a84ff'),roughness:.7});
      const mesh=new THREE.Mesh(g,m);mesh.position.set((o.x+o.w/2-a.w/2)/unit,(a.h/2-(o.y+o.h/2))/unit,.05);mesh.rotation.z=THREE.MathUtils.degToRad(-(o.rotation||0));mesh.castShadow=true;mesh.receiveShadow=true;this.root.add(mesh);
    }
    const textObjects=a.objects.filter(x=>x.type==='text');
    for(const o of textObjects){
      normalizeText(o);
      let font;try{font=await load3DFont(o.font3D)}catch{continue}
      if(token!==this.rebuildToken)return;
      const depthU=clamp(Number(o.returnDepth)||50,5,300)/45;
      const bevelU=clamp(Number(o.faceThickness)||3,1,30)/130;
      const geo=new TextGeometry(o.text||' ',{font,size:1,depth:depthU,curveSegments:8,bevelEnabled:true,bevelThickness:bevelU,bevelSize:bevelU*.72,bevelSegments:rendered?4:2});
      geo.computeBoundingBox();const bb=geo.boundingBox;if(!bb)continue;
      const rawW=Math.max(.001,bb.max.x-bb.min.x),rawH=Math.max(.001,bb.max.y-bb.min.y);
      geo.center();
      const faceEm=o.lightMode==='face'||o.lightMode==='both'?o.lightColor:null;
      const face=pbrMaterial(o.faceMaterial,o.faceColor,rendered,faceEm,faceEm?(Number(o.lightIntensity)||0)*2.6:0);
      const side=pbrMaterial(sideKind(o.returnMaterial),o.sideColor,rendered);
      const mesh=new THREE.Mesh(geo,[face,side]);mesh.castShadow=true;mesh.receiveShadow=true;
      const targetW=Math.max(.2,o.w/unit),targetH=Math.max(.2,o.h/unit);mesh.scale.set(targetW/rawW,targetH/rawH,1);
      const x=(o.x+o.w/2-a.w/2)/unit,y=(a.h/2-(o.y+o.h/2))/unit,gap=(Number(o.wallGap)||0)/50;
      mesh.position.set(x,y,depthU/2+gap+.05);mesh.rotation.z=THREE.MathUtils.degToRad(-(o.rotation||0));this.root.add(mesh);
      const backGeo=geo.clone(),back=pbrMaterial(o.backMaterial,o.backColor,rendered);
      const backMesh=new THREE.Mesh(backGeo,back);backMesh.scale.copy(mesh.scale);backMesh.scale.z=Math.max(.025,(Number(o.backThickness)||5)/120);backMesh.position.set(x,y,gap+.02);backMesh.rotation.z=mesh.rotation.z;backMesh.castShadow=true;this.root.add(backMesh);
      if(o.lightMode==='halo'||o.lightMode==='both'){
        const glowMat=new THREE.MeshBasicMaterial({color:colorObj(o.lightColor),transparent:true,opacity:clamp((Number(o.lightIntensity)||.7)*.28,.08,.65),blending:THREE.AdditiveBlending,depthWrite:false});
        const glow=new THREE.Mesh(geo.clone(),glowMat);glow.scale.set(mesh.scale.x*1.045,mesh.scale.y*1.045,.035);glow.position.set(x,y,Math.max(.03,gap*.35));glow.rotation.z=mesh.rotation.z;this.root.add(glow);
        const pl=new THREE.PointLight(colorObj(o.lightColor),rendered?22:12,Math.max(7,targetW*1.2),2);pl.position.set(x,y,Math.max(.18,gap+.15));this.root.add(pl);
      }
    }
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(wallW*2.5,wallH*2.2),new THREE.MeshStandardMaterial({color:0x15171b,roughness:.95}));
    floor.rotation.x=-Math.PI/2;floor.position.set(0,-wallH/2-.35,wallH*.55);floor.receiveShadow=true;this.root.add(floor);
    if(!project.camera3d)this.resetCamera(true);else this.restoreCamera();
    threeLoading.hidden=true;
  }
  restoreCamera(){
    const c=project.camera3d;if(!c)return this.resetCamera(true);
    this.camera.position.fromArray(c.position);this.controls.target.fromArray(c.target);this.controls.update();
  }
  resetCamera(silent=false){
    this.ensure();const a=activeArtboard(),w=(a?.w||1080)/50,h=(a?.h||720)/50,aspect=Math.max(.35,this.host.clientWidth/Math.max(1,this.host.clientHeight));
    const fov=THREE.MathUtils.degToRad(this.camera.fov),distH=(h/2)/Math.tan(fov/2),distW=(w/2)/(Math.tan(fov/2)*aspect),d=Math.max(distH,distW)*1.18;
    this.camera.position.set(w*.13,h*.08,d);this.controls.target.set(0,0,Math.min(1.2,d*.04));this.camera.near=Math.max(.03,d/1000);this.camera.far=d*20;this.camera.updateProjectionMatrix();this.controls.update();
    project.camera3d={position:this.camera.position.toArray(),target:this.controls.target.toArray()};if(!silent)save();
  }
  resize(){
    if(!this.renderer)return;const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  }
  animate(){
    this.frame=requestAnimationFrame(()=>this.animate());if(!this.renderer)return;this.controls?.update();this.renderer.render(this.scene,this.camera);
  }
}
const threeScene=new Real3DScene(threeHost);

function beginPointer(e){
  if(project.mode==='view3d')return;
  viewport.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2){const pts=[...pointers.values()];pinchStart={dist:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),zoom:project.view.zoom};return}
  const objEl=e.target.closest('[data-object-id]'),resizeEl=e.target.closest('[data-resize-id]'),artHandle=e.target.closest('[data-artboard-handle]'),artEl=e.target.closest('[data-artboard-id]');
  if(resizeEl){const o=selectedObject();if(!o)return;resize={startX:e.clientX,startY:e.clientY,w:o.w,h:o.h};return}
  if(objEl&&tool==='select'){const art=objEl.closest('[data-artboard-id]');project.activeArtboardId=art.dataset.artboardId;const o=activeArtboard().objects.find(x=>x.id===objEl.dataset.objectId);project.selectedObjectId=o.id;drag={kind:'object',startX:e.clientX,startY:e.clientY,x:o.x,y:o.y};renderLists();renderProperties();renderWorld();return}
  if(artHandle&&tool==='select'){const a=project.artboards.find(x=>x.id===artHandle.dataset.artboardHandle);project.activeArtboardId=a.id;project.selectedObjectId=null;drag={kind:'artboard',id:a.id,startX:e.clientX,startY:e.clientY,x:a.x,y:a.y};renderLists();renderProperties();renderWorld();return}
  if(artEl){project.activeArtboardId=artEl.dataset.artboardId;project.selectedObjectId=null}else project.selectedObjectId=null;
  renderLists();renderProperties();renderWorld();drag={kind:'pan',startX:e.clientX,startY:e.clientY,x:project.view.x,y:project.view.y};
}
function movePointer(e){
  if(project.mode==='view3d')return;
  if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2&&pinchStart){const pts=[...pointers.values()],dist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);project.view.zoom=clamp(pinchStart.zoom*dist/pinchStart.dist,.05,8);applyWorldTransform();return}
  const p=screenToWorld(e.clientX,e.clientY);coordStatus.textContent=`X ${Math.round(p.x)} · Y ${Math.round(p.y)}`;
  if(resize){const o=selectedObject();if(!o)return;o.w=Math.max(20,resize.w+(e.clientX-resize.startX)/project.view.zoom);o.h=Math.max(20,resize.h+(e.clientY-resize.startY)/project.view.zoom);renderWorld();renderProperties();return}
  if(!drag)return;
  if(drag.kind==='object'){const o=selectedObject();if(!o)return;o.x=drag.x+(e.clientX-drag.startX)/project.view.zoom;o.y=drag.y+(e.clientY-drag.startY)/project.view.zoom;renderWorld()}
  else if(drag.kind==='artboard'){const a=project.artboards.find(x=>x.id===drag.id);a.x=drag.x+(e.clientX-drag.startX)/project.view.zoom;a.y=drag.y+(e.clientY-drag.startY)/project.view.zoom;renderWorld()}
  else if(drag.kind==='pan'){project.view.x=drag.x+(e.clientX-drag.startX);project.view.y=drag.y+(e.clientY-drag.startY);applyWorldTransform()}
}
function endPointer(e){pointers.delete(e.pointerId);if(pointers.size<2)pinchStart=null;if(drag||resize){drag=null;resize=null;renderAll()}}
viewport.addEventListener('pointerdown',beginPointer);viewport.addEventListener('pointermove',movePointer);viewport.addEventListener('pointerup',endPointer);viewport.addEventListener('pointercancel',endPointer);
viewport.addEventListener('wheel',e=>{if(project.mode==='view3d')return;e.preventDefault();if(e.ctrlKey||e.metaKey)zoomAt(Math.exp(-e.deltaY*.0025),e.clientX,e.clientY);else{project.view.x-=e.deltaX;project.view.y-=e.deltaY;applyWorldTransform();save()}},{passive:false});

$('#selectTool').onclick=()=>setTool('select');$('#panTool').onclick=()=>setTool('pan');$('#addArtboardBtn').onclick=addArtboard;$('#panelAddArtboardBtn').onclick=addArtboard;$('#addTextBtn').onclick=addText;$('#addRectBtn').onclick=addRect;
$('#fitBtn').onclick=fitArtboard;$('#centerBtn').onclick=centerAll;$('#zoomInBtn').onclick=()=>zoomAt(1.2);$('#zoomOutBtn').onclick=()=>zoomAt(1/1.2);$('#duplicateBtn').onclick=duplicateSelected;$('#reset3dBtn').onclick=()=>threeScene.resetCamera();
$('#saveBtn').onclick=()=>{save();$('#saveBtn').textContent='Сохранено';setTimeout(()=>$('#saveBtn').textContent='Сохранить',650)};
$('#panelToggle').onclick=()=>rightPanel.classList.toggle('open');$('#mobileSheetHandle').onclick=()=>rightPanel.classList.remove('open');

function selectPanel(name,open=true){
  $$('.panel-tab').forEach(x=>x.classList.toggle('active',x.dataset.panel===name));$$('.panel-body').forEach(x=>x.classList.toggle('active',x.id===`panel-${name}`));if(open)rightPanel.classList.add('open');
}
$$('.panel-tab').forEach(b=>b.onclick=()=>selectPanel(b.dataset.panel,false));
$$('.mode').forEach(b=>b.onclick=()=>{project.mode=b.dataset.mode;$$('.mode').forEach(x=>x.classList.toggle('active',x.dataset.mode===project.mode));renderAll()});
view3dRenderBtn.onclick=()=>{project.view3dRender=!project.view3dRender;renderAll()};

layersList.addEventListener('click',e=>{const del=e.target.closest('[data-delete-object]');if(del){const a=activeArtboard();a.objects=a.objects.filter(o=>o.id!==del.dataset.deleteObject);if(project.selectedObjectId===del.dataset.deleteObject)project.selectedObjectId=null;renderAll();return}const row=e.target.closest('[data-layer-id]');if(row){project.selectedObjectId=row.dataset.layerId;renderAll()}});
artboardsList.addEventListener('click',e=>{const del=e.target.closest('[data-delete-artboard]');if(del){if(project.artboards.length<=1)return alert('Должен остаться хотя бы один Artboard');project.artboards=project.artboards.filter(a=>a.id!==del.dataset.deleteArtboard);if(project.activeArtboardId===del.dataset.deleteArtboard)project.activeArtboardId=project.artboards[0].id;project.selectedObjectId=null;renderAll();return}const row=e.target.closest('[data-artboard-row]');if(row){project.activeArtboardId=row.dataset.artboardRow;project.selectedObjectId=null;project.camera3d=null;renderAll();fitArtboard()}});
let rebuildTimer;
properties.addEventListener('input',e=>{
  const key=e.target.dataset.prop;if(!key)return;const o=selectedObject(),a=activeArtboard();let v=e.target.type==='number'?Number(e.target.value):e.target.value;
  if(o&&!key.startsWith('art_')){
    o[key]=v;
    if(key==='faceColor')o.color=v;
    if(key==='font3D')o.fontFamily=FONT3D[v]?.css||o.fontFamily;
    if(key==='preset'&&PRESETS[v])Object.assign(o,PRESETS[v]);
  }else if(a&&key.startsWith('art_'))a[key.slice(4)]=v;
  renderWorld();renderLists();save();clearTimeout(rebuildTimer);if(project.mode==='view3d')rebuildTimer=setTimeout(()=>threeScene.rebuild(),120);
});
$('#imageInput').addEventListener('change',e=>{const file=e.target.files?.[0],a=activeArtboard();if(!file||!a)return;const fr=new FileReader();fr.onload=()=>{const img=new Image();img.onload=()=>{const maxW=Math.min(a.w*.75,img.width),ratio=img.height/img.width,o={id:uid(),type:'image',name:file.name,x:a.w/2-maxW/2,y:a.h/2-maxW*ratio/2,w:maxW,h:maxW*ratio,rotation:0,opacity:1,src:fr.result};a.objects.push(o);project.selectedObjectId=o.id;renderAll()};img.src=fr.result};fr.readAsDataURL(file);e.target.value=''});

$('#exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${(project.name||'Colorize-Design').replace(/\s+/g,'-')}.colorize.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)};
$('#importInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;const fr=new FileReader();fr.onload=()=>{try{project=normalizeProject(JSON.parse(fr.result));project.camera3d=null;renderAll();fitArtboard()}catch{alert('Не удалось открыть проект')}};fr.readAsText(f);e.target.value=''});
$('#newProjectBtn').onclick=()=>{if(confirm('Создать новый проект?')){project=defaultProject();renderAll();fitArtboard()}};

$('#dockSelect').onclick=()=>{setTool('select');rightPanel.classList.remove('open')};
$('#dockText').onclick=()=>{addText();selectPanel('properties')};
$('#dockPhoto').onclick=()=>$('#imageInput').click();
$('#dockLayers').onclick=()=>selectPanel('layers');
$('#dockSign').onclick=()=>{if(!selectedObject()){const a=activeArtboard(),t=a?.objects.find(o=>o.type==='text');if(t)project.selectedObjectId=t.id}renderAll();selectPanel('properties')};

window.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save()}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicateSelected()}if((e.key==='Delete'||e.key==='Backspace')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){const a=activeArtboard();if(project.selectedObjectId&&a){a.objects=a.objects.filter(o=>o.id!==project.selectedObjectId);project.selectedObjectId=null;renderAll()}}});

$$('.mode').forEach(x=>x.classList.toggle('active',x.dataset.mode===project.mode));
renderAll();requestAnimationFrame(()=>{if(project.mode==='view3d')threeScene.rebuild();else fitArtboard()});