const KEY='colorize-lighting-v013';
const MAP={
  mainIntensity:['main','intensity'],mainAngle:['main','angle'],mainElevation:['main','elevation'],
  mainShadow:['main','shadowSoftness'],mainAmbient:['main','ambient'],mainExposure:['main','exposure'],
  hdrIntensity:['hdr','intensity'],hdrRotation:['hdr','rotation'],hdrExposure:['hdr','exposure'],
  hdrShadowStrength:['hdr','shadowStrength'],hdrShadowSoftness:['hdr','shadowSoftness']
};
const DEFAULTS={
  mode:'main',
  main:{intensity:3.1,ambient:.95,angle:-28,elevation:48,shadowSoftness:3,exposure:1.04},
  hdr:{preset:'dayStreet',intensity:1.25,rotation:0,exposure:1.05,shadowStrength:.82,shadowSoftness:4.2}
};

function read(){
  try{
    const s=JSON.parse(localStorage.getItem(KEY)||'{}');
    return {...DEFAULTS,...s,main:{...DEFAULTS.main,...(s.main||{})},hdr:{...DEFAULTS.hdr,...(s.hdr||{})}};
  }catch{return structuredClone(DEFAULTS)}
}
function write(s){try{localStorage.setItem(KEY,JSON.stringify(s))}catch{}}
function currentFromUI(){
  const s=read();
  const active=document.querySelector('[data-light-mode].active');
  if(active?.dataset.lightMode)s.mode=active.dataset.lightMode;
  for(const [id,[group,key]] of Object.entries(MAP)){
    const el=document.getElementById(id);if(el&&el.value!=='')s[group][key]=Number(el.value);
  }
  const hdr=document.querySelector('[data-hdr-card].active');
  if(hdr?.dataset.hdrCard)s.hdr.preset=hdr.dataset.hdrCard;
  return s;
}
function updateOutput(el){
  if(!el?.parentElement)return;
  const out=el.parentElement.querySelector('output');if(!out)return;
  const suffix=out.dataset.suffix||'';
  const id=el.id;
  const digits=(id==='mainAngle'||id==='mainElevation'||id==='hdrRotation')?0:(id==='mainShadow'||id==='hdrShadowSoftness')?1:2;
  out.textContent=`${Number(el.value).toFixed(digits)}${suffix}`;
}
function pushNow(){
  const s=currentFromUI();write(s);
  globalThis.__colorizeLightingSetSettings?.(s);
  const panel=document.querySelector('.lighting-v013');
  if(panel){panel.dataset.live='1';panel.style.setProperty('--live-pulse',String(performance.now()))}
}
function pushAfterUI(){queueMicrotask(pushNow);setTimeout(pushNow,0)}

function relevant(el){return !!(el?.id&&MAP[el.id])}

document.addEventListener('input',e=>{
  if(!relevant(e.target))return;
  updateOutput(e.target);
  pushAfterUI();
},false);
document.addEventListener('change',e=>{
  if(!relevant(e.target))return;
  updateOutput(e.target);
  pushAfterUI();
},false);
document.addEventListener('click',e=>{
  const mode=e.target.closest?.('[data-light-mode]');
  const hdr=e.target.closest?.('[data-hdr-card]');
  if(mode||hdr)setTimeout(pushNow,0);
  if(e.target.closest?.('.mode[data-mode="view3d"]'))setTimeout(pushNow,180);
},false);

window.addEventListener('DOMContentLoaded',()=>{
  setTimeout(pushNow,350);
  const panel=document.querySelector('#lightingPanel');
  if(panel&&!panel.querySelector('.colorize-live-state')){
    const badge=document.createElement('div');badge.className='colorize-live-state';badge.textContent='LIVE · свет меняется прямо во viewport';
    panel.querySelector('.lighting-head')?.appendChild(badge);
  }
});
