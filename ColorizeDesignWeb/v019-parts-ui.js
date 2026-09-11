// v0.19.2 — UI bridge for the separate-parts renderer.
// This module is loaded after v019-separate-parts so its visibility pass runs last.
const KEY='colorize-separate-parts-v019';
function read(){try{return {quality:'high',face:true,returns:true,back:true,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {quality:'high',face:true,returns:true,back:true}}}
let state=read();
function write(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}}
function applyVisibility(scene){
  if(!scene)return;
  scene.traverse?.(o=>{const p=o.userData?.part19;if(p==='face')o.visible=state.face!==false;else if(p==='returns')o.visible=state.returns!==false;else if(p==='back')o.visible=state.back!==false});
}
const prev=globalThis.__colorizeBeforeThreeRender;
globalThis.__colorizeBeforeThreeRender=(r,s,c)=>{prev?.(r,s,c);applyVisibility(s)};

let panel=null;
function sync(){
  if(!panel)return;
  for(const k of ['face','returns','back'])panel.querySelector(`[data-part19="${k}"]`)?.classList.toggle('off',state[k]===false);
  const q=panel.querySelector('#quality19');if(q)q.value=state.quality||'high';
}
function init(){
  const host=document.getElementById('threeHost');if(!host)return;
  const old=document.getElementById('partsPanel19');if(old){panel=old;sync();return}
  if(!document.getElementById('partsPanel19Style')){
    const style=document.createElement('style');style.id='partsPanel19Style';style.textContent=`#partsPanel19{position:absolute;left:12px;bottom:48px;z-index:40;display:flex;gap:6px;align-items:center;padding:7px 8px;border-radius:12px;background:rgba(20,22,26,.82);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 8px 24px rgba(0,0,0,.26);font:12px -apple-system,BlinkMacSystemFont,sans-serif;color:#fff}#partsPanel19 button,#partsPanel19 select{height:30px;border:1px solid rgba(255,255,255,.15);border-radius:8px;background:rgba(255,255,255,.09);color:#fff;padding:0 9px;font:inherit}#partsPanel19 button.off{opacity:.4;text-decoration:line-through}#partsPanel19 select option{color:#111;background:#fff}@media(max-width:720px){#partsPanel19{left:8px;right:8px;bottom:70px;justify-content:center;flex-wrap:wrap}}`;
    document.head.appendChild(style);
  }
  panel=document.createElement('div');panel.id='partsPanel19';panel.innerHTML='<span>Детали</span><button data-part19="face">Лицо</button><button data-part19="returns">Борт</button><button data-part19="back">Задник</button><select id="quality19" aria-label="Качество"><option value="draft">Draft</option><option value="high">High</option><option value="ultra">Ultra</option></select>';
  host.appendChild(panel);sync();
  panel.addEventListener('click',e=>{const b=e.target.closest('[data-part19]');if(!b)return;const k=b.dataset.part19;state[k]=state[k]===false;write();sync()});
  panel.querySelector('#quality19')?.addEventListener('change',e=>{const q=e.target.value;if(!['draft','high','ultra'].includes(q))return;state.quality=q;write();sync();setTimeout(()=>location.reload(),80)});
}
function boot(){init();const host=document.getElementById('threeHost');if(host)new MutationObserver(init).observe(host,{attributes:true,attributeFilter:['hidden','class','style']})}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
globalThis.__colorizePartsUI19Debug=()=>({version:'0.19.2',...state,panel:!!document.getElementById('partsPanel19')});
