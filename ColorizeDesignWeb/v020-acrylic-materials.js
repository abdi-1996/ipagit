import * as THREE from 'three';

// v0.20.0 — production acrylic material library.
// Adds real acrylic presets to the existing material selectors and applies
// distinct PBR parameters to the separate face / return / back meshes.
const STORE_KEYS=['colorize-design-web-v04','colorize-design-web-v03','colorize-design-web-v02','colorize-design-web-v01'];

const ACRYLICS={
  'acrylic-clear':{label:'Акрил — прозрачный',color:'#f4f8ff',metalness:0,roughness:.07,clearcoat:1,clearcoatRoughness:.035,transmission:.94,thickness:.38,ior:1.49,envMapIntensity:1.18},
  'acrylic-opal':{label:'Акрил — молочный / Opal',color:'#f5f5f0',metalness:0,roughness:.27,clearcoat:.48,clearcoatRoughness:.18,transmission:.34,thickness:.62,ior:1.49,envMapIntensity:.9},
  'acrylic-white':{label:'Акрил — белый непрозрачный',color:'#ffffff',metalness:0,roughness:.22,clearcoat:.58,clearcoatRoughness:.12,transmission:.015,thickness:.5,ior:1.49,envMapIntensity:.92},
  'acrylic-colored-clear':{label:'Акрил — цветной прозрачный',useObjectColor:true,metalness:0,roughness:.09,clearcoat:1,clearcoatRoughness:.045,transmission:.78,thickness:.5,ior:1.49,envMapIntensity:1.08},
  'acrylic-colored-opal':{label:'Акрил — цветной светорассеивающий',useObjectColor:true,metalness:0,roughness:.28,clearcoat:.44,clearcoatRoughness:.18,transmission:.3,thickness:.66,ior:1.49,envMapIntensity:.88},
  'acrylic-satin':{label:'Акрил — матовый / Satin',useObjectColor:true,metalness:0,roughness:.56,clearcoat:.1,clearcoatRoughness:.58,transmission:.1,thickness:.5,ior:1.49,envMapIntensity:.65},
  'acrylic-gloss':{label:'Акрил — глянцевый',useObjectColor:true,metalness:0,roughness:.1,clearcoat:1,clearcoatRoughness:.045,transmission:.06,thickness:.48,ior:1.49,envMapIntensity:1.12},
  'acrylic-mirror-gold':{label:'Акрил — зеркало золото',color:'#d7aa4a',metalness:.94,roughness:.105,clearcoat:.46,clearcoatRoughness:.055,transmission:0,thickness:.4,ior:1.49,envMapIntensity:1.35,mirror:true},
  'acrylic-mirror-silver':{label:'Акрил — зеркало серебро',color:'#e9edf2',metalness:.96,roughness:.075,clearcoat:.5,clearcoatRoughness:.045,transmission:0,thickness:.4,ior:1.49,envMapIntensity:1.42,mirror:true},
  'acrylic-fluorescent':{label:'Акрил — флуоресцентный',useObjectColor:true,metalness:0,roughness:.16,clearcoat:.72,clearcoatRoughness:.08,transmission:.48,thickness:.46,ior:1.49,envMapIntensity:1.0,fluorescent:true},
  'acrylic-edge-lit':{label:'Акрил — для торцевой подсветки',color:'#eefaff',metalness:0,roughness:.065,clearcoat:1,clearcoatRoughness:.03,transmission:.9,thickness:.72,ior:1.49,envMapIntensity:1.18,edgeLit:true},
  'acrylic-led-diffuser':{label:'Акрил — LED рассеиватель',color:'#f7f6ef',metalness:0,roughness:.38,clearcoat:.18,clearcoatRoughness:.28,transmission:.24,thickness:.82,ior:1.49,envMapIntensity:.72,diffuser:true},
  'acrylic-impact':{label:'Акрил — ударопрочный',useObjectColor:true,metalness:0,roughness:.13,clearcoat:.7,clearcoatRoughness:.085,transmission:.72,thickness:.58,ior:1.49,envMapIntensity:.96},
  'acrylic-cast':{label:'Акрил — литой (Cast)',useObjectColor:true,metalness:0,roughness:.105,clearcoat:.9,clearcoatRoughness:.06,transmission:.66,thickness:.52,ior:1.49,envMapIntensity:1.04},
  'acrylic-extruded':{label:'Акрил — экструзионный',useObjectColor:true,metalness:0,roughness:.15,clearcoat:.72,clearcoatRoughness:.09,transmission:.58,thickness:.48,ior:1.49,envMapIntensity:.94}
};

let applied=0;
let last=null;

function readProject(){
  for(const k of STORE_KEYS){
    try{const raw=localStorage.getItem(k);if(raw)return JSON.parse(raw)}catch{}
  }
  return null;
}
function textMap(project){
  const m=new Map();
  for(const a of project?.artboards||[])for(const o of a.objects||[])if(o?.type==='text')m.set(o.id,o);
  return m;
}
function selectedText(project){
  if(!project?.selectedObjectId)return null;
  for(const a of project.artboards||[]){const o=(a.objects||[]).find(x=>x.id===project.selectedObjectId&&x.type==='text');if(o)return o}
  return null;
}
function safeColor(v,f='#ffffff'){try{return new THREE.Color(v||f)}catch{return new THREE.Color(f)}}
function materialColor(profile,hex){return profile.useObjectColor?safeColor(hex,'#ffffff'):safeColor(profile.color,'#ffffff')}
function applyLight(material,profile,obj,role,baseColor){
  let e=0;let c=baseColor;
  if(profile.fluorescent){e=.22}
  if(profile.edgeLit){e=.08}
  if(role==='face'&&(obj.lightMode==='face'||obj.lightMode==='both')){
    c=safeColor(obj.lightColor||'#ffffff');
    const gain=profile.diffuser?3.0:profile.edgeLit?2.65:2.25;
    e=Math.max(e,Math.max(.05,Number(obj.lightIntensity)||.7)*gain);
  }
  if(e>0){material.emissive=c.clone();material.emissiveIntensity=e}
}
function makeMaterial(kind,hex,role,obj){
  const p=ACRYLICS[kind];if(!p)return null;
  const c=materialColor(p,hex);
  const m=new THREE.MeshPhysicalMaterial({
    color:c,side:THREE.FrontSide,dithering:true,
    metalness:p.metalness,roughness:p.roughness,
    clearcoat:p.clearcoat,clearcoatRoughness:p.clearcoatRoughness,
    transmission:p.transmission,thickness:p.thickness,ior:p.ior,
    specularIntensity:p.mirror?1.2:1,envMapIntensity:p.envMapIntensity
  });
  if(p.transmission>.35){m.attenuationDistance=profileDistance(kind);m.attenuationColor=c.clone()}
  applyLight(m,p,obj,role,c);
  m.userData.colorizePart19=role;
  m.userData.colorizeAcrylic20=kind;
  m.userData.colorizeAcrylic20Label=p.label;
  return m;
}
function profileDistance(kind){
  if(kind==='acrylic-edge-lit')return 3.2;
  if(kind==='acrylic-clear')return 5.0;
  if(kind==='acrylic-colored-clear')return 2.3;
  return 1.7;
}
function materialKey(obj,part){
  if(part==='face')return obj.faceMaterial;
  if(part==='returns')return obj.returnMaterial;
  if(part==='back')return obj.backMaterial;
  return null;
}
function materialHex(obj,part){
  if(part==='face')return obj.faceColor||obj.color||'#ffffff';
  if(part==='returns')return obj.sideColor||'#ffffff';
  return obj.backColor||'#ffffff';
}
function tuneScene(scene){
  const project=readProject();if(!scene||!project)return;
  const byId=textMap(project);
  scene.traverse?.(group=>{
    if(!group.userData?.colorizeSeparateParts19)return;
    const obj=byId.get(group.userData.objectId);if(!obj)return;
    for(const child of group.children||[]){
      const part=child.userData?.part19;if(!part||!child.isMesh)continue;
      const key=materialKey(obj,part);if(!ACRYLICS[key])continue;
      const wanted=JSON.stringify([key,materialHex(obj,part),obj.lightMode,obj.lightColor,obj.lightIntensity]);
      if(child.material?.userData?.colorizeAcrylic20Signature===wanted)continue;
      const next=makeMaterial(key,materialHex(obj,part),part,obj);if(!next)continue;
      next.userData.colorizeAcrylic20Signature=wanted;
      child.material?.dispose?.();child.material=next;
      applied++;last={objectId:obj.id,part,key,label:ACRYLICS[key].label};
    }
  });
}

const previous=globalThis.__colorizeBeforeThreeRender;
globalThis.__colorizeBeforeThreeRender=(renderer,scene,camera)=>{previous?.(renderer,scene,camera);tuneScene(scene)};

function injectOptions(){
  const project=readProject(),obj=selectedText(project);
  for(const key of ['faceMaterial','returnMaterial','backMaterial']){
    const select=document.querySelector(`select[data-prop="${key}"]`);if(!select)continue;
    let group=select.querySelector('optgroup[data-acrylic20]');
    if(!group){
      group=document.createElement('optgroup');group.label='Акрил — специальные';group.dataset.acrylic20='1';
      for(const [value,p] of Object.entries(ACRYLICS)){
        const option=document.createElement('option');option.value=value;option.textContent=p.label.replace('Акрил — ','');group.appendChild(option);
      }
      const acrylicOption=[...select.options].find(o=>o.value==='acrylic');
      if(acrylicOption)acrylicOption.textContent='Акрил — стандартный';
      select.appendChild(group);
    }
    if(obj&&obj[key]&&select.value!==obj[key]&&[...select.options].some(o=>o.value===obj[key]))select.value=obj[key];
  }
}
let uiQueued=false;
function queueInject(){
  if(uiQueued)return;uiQueued=true;
  requestAnimationFrame(()=>{uiQueued=false;injectOptions()});
}
function installUI(){
  injectOptions();
  const root=document.getElementById('properties')||document.body;
  new MutationObserver(queueInject).observe(root,{childList:true,subtree:true});
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',installUI,{once:true});else installUI();

globalThis.__colorizeAcrylic20Debug=()=>({version:'0.20.0',profiles:Object.keys(ACRYLICS),labels:Object.fromEntries(Object.entries(ACRYLICS).map(([k,v])=>[k,v.label])),applied,last});
