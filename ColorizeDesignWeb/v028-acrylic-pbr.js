import * as THREE from 'three';

// v0.28.0 — acrylic PBR correction.
// Ordinary signage acrylic is opaque. Only explicitly transparent presets keep transmission.
// HDRI reflections are normalized per material so acrylic reads as plastic, not chrome.
const VERSION='0.28.0';
const PROJECT_KEYS=['colorize-design-web-v04','colorize-design-web-v03','colorize-design-web-v02','colorize-design-web-v01'];
const HDR_KEY='colorize-hdri-unified-v027';
const PROFILES={
  acrylic:{roughness:.24,clearcoat:.68,clearcoatRoughness:.14,specularIntensity:.72,metalness:0,transmission:0,env:.64},
  'acrylic-opal':{roughness:.34,clearcoat:.38,clearcoatRoughness:.24,specularIntensity:.55,metalness:0,transmission:0,env:.46},
  'acrylic-white':{roughness:.28,clearcoat:.52,clearcoatRoughness:.18,specularIntensity:.62,metalness:0,transmission:0,env:.52},
  'acrylic-colored-opal':{roughness:.33,clearcoat:.42,clearcoatRoughness:.22,specularIntensity:.58,metalness:0,transmission:0,env:.48},
  'acrylic-satin':{roughness:.50,clearcoat:.16,clearcoatRoughness:.46,specularIntensity:.42,metalness:0,transmission:0,env:.30},
  'acrylic-gloss':{roughness:.16,clearcoat:.88,clearcoatRoughness:.09,specularIntensity:.78,metalness:0,transmission:0,env:.72},
  'acrylic-fluorescent':{roughness:.24,clearcoat:.58,clearcoatRoughness:.14,specularIntensity:.66,metalness:0,transmission:0,env:.56},
  'acrylic-led-diffuser':{roughness:.40,clearcoat:.14,clearcoatRoughness:.32,specularIntensity:.40,metalness:0,transmission:0,env:.28},
  'acrylic-impact':{roughness:.22,clearcoat:.66,clearcoatRoughness:.13,specularIntensity:.70,metalness:0,transmission:0,env:.60},
  'acrylic-cast':{roughness:.19,clearcoat:.78,clearcoatRoughness:.11,specularIntensity:.75,metalness:0,transmission:0,env:.66},
  'acrylic-extruded':{roughness:.23,clearcoat:.62,clearcoatRoughness:.15,specularIntensity:.68,metalness:0,transmission:0,env:.56},
  'acrylic-clear':{roughness:.08,clearcoat:1,clearcoatRoughness:.04,specularIntensity:.78,metalness:0,transmission:.92,thickness:.38,env:.78,transparentPreset:true},
  'acrylic-colored-clear':{roughness:.10,clearcoat:.95,clearcoatRoughness:.055,specularIntensity:.76,metalness:0,transmission:.78,thickness:.50,env:.72,transparentPreset:true},
  'acrylic-edge-lit':{roughness:.09,clearcoat:1,clearcoatRoughness:.04,specularIntensity:.78,metalness:0,transmission:.86,thickness:.68,env:.76,transparentPreset:true},
  'acrylic-mirror-gold':{roughness:.12,clearcoat:.35,clearcoatRoughness:.07,specularIntensity:1,metalness:.94,transmission:0,env:.98,mirror:true},
  'acrylic-mirror-silver':{roughness:.09,clearcoat:.38,clearcoatRoughness:.06,specularIntensity:1,metalness:.96,transmission:0,env:1.0,mirror:true}
};
let debug={version:VERSION,applied:0,opaque:0,transparent:0,lastReflection:1,samples:[]};

function clamp(v,a,b){return Math.max(a,Math.min(b,Number(v)||0))}
function readProject(){for(const k of PROJECT_KEYS){try{const raw=localStorage.getItem(k);if(raw)return JSON.parse(raw)}catch{}}return null}
function readReflection(){try{const s=JSON.parse(localStorage.getItem(HDR_KEY)||'{}');return clamp(s.reflectionIntensity??1,0,2)}catch{return 1}}
function textMap(project){const m=new Map();for(const a of project?.artboards||[])for(const o of a.objects||[])if(o?.type==='text')m.set(o.id,o);return m}
function kindFor(obj,part){if(part==='face')return obj.faceMaterial;if(part==='returns')return obj.returnMaterial;if(part==='back')return obj.backMaterial;return null}
function profileFor(kind){if(!kind)return null;return PROFILES[String(kind).toLowerCase()]||null}
function applyMaterial(m,p,kind,part,globalReflection){
  if(!m||!p)return false;
  m.opacity=1;
  m.transparent=false;
  m.depthWrite=true;
  m.metalness=p.metalness;
  m.roughness=p.roughness;
  if('clearcoat' in m)m.clearcoat=p.clearcoat;
  if('clearcoatRoughness' in m)m.clearcoatRoughness=p.clearcoatRoughness;
  if('ior' in m)m.ior=1.49;
  if('specularIntensity' in m)m.specularIntensity=p.specularIntensity;
  if('transmission' in m)m.transmission=p.transmission;
  if('thickness' in m)m.thickness=p.transmission>0?(p.thickness||.4):0;
  if('attenuationDistance' in m&&p.transmission<=0)m.attenuationDistance=Infinity;
  if('envMapIntensity' in m)m.envMapIntensity=clamp(globalReflection*p.env,0,1.35);
  m.userData.colorizeAcrylic28=true;
  m.userData.colorizeAcrylic28Kind=kind;
  m.userData.colorizeAcrylic28Part=part;
  m.needsUpdate=true;
  return true;
}
function tune(scene){
  const project=readProject();if(!scene||!project)return;
  const byId=textMap(project),globalReflection=readReflection(),samples=[];let applied=0,opaque=0,transparent=0;
  scene.traverse?.(group=>{
    if(!group.userData?.colorizeSeparateParts19)return;
    const obj=byId.get(group.userData.objectId);if(!obj)return;
    for(const child of group.children||[]){
      if(!child.isMesh)continue;
      const part=child.userData?.part19,kind=kindFor(obj,part),p=profileFor(kind);if(!p)continue;
      const mats=(Array.isArray(child.material)?child.material:[child.material]).filter(Boolean);
      for(const m of mats){
        if(!applyMaterial(m,p,kind,part,globalReflection))continue;
        applied++;if(p.transparentPreset)transparent++;else opaque++;
        if(samples.length<12)samples.push({kind,part,opacity:m.opacity,transparent:m.transparent,transmission:Number(m.transmission||0),roughness:Number(m.roughness||0),metalness:Number(m.metalness||0),envMapIntensity:Number(m.envMapIntensity||0),specularIntensity:Number(m.specularIntensity??1)});
      }
    }
  });
  debug={version:VERSION,applied,opaque,transparent,lastReflection:globalReflection,samples};
}

const previous=globalThis.__colorizeBeforeThreeRender;
globalThis.__colorizeBeforeThreeRender=(renderer,scene,camera)=>{previous?.(renderer,scene,camera);tune(scene)};

function normalizeReflectionUI(){
  const input=document.getElementById('hdriReflect27');if(!input)return;
  if(input.max!=='2')input.max='2';
  if(input.step!=='0.05')input.step='0.05';
  const row=input.closest('.hdri27-row'),label=row?.querySelector('span');
  if(label&&label.textContent!=='Отражения PBR')label.textContent='Отражения PBR';
  const current=Number(input.value)||1;
  if(current>2){input.value='1';input.dispatchEvent(new Event('input',{bubbles:true}))}
  const note=document.querySelector('#hdriUnified27 .hdri27-note');
  if(note&&!note.dataset.pbr28){note.dataset.pbr28='1';note.textContent='Один HDRI освещает сцену и даёт физически корректные отражения. Обычный акрил непрозрачный; прозрачность есть только у специальных прозрачных пресетов.'}
}
let uiQueued=false;
function queueNormalize(){
  if(uiQueued)return;uiQueued=true;
  requestAnimationFrame(()=>{uiQueued=false;normalizeReflectionUI()});
}
function installUI(){
  normalizeReflectionUI();
  new MutationObserver(queueNormalize).observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',installUI,{once:true});else installUI();

globalThis.__colorizeAcrylic28Debug=()=>({...debug});
