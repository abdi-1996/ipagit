// v0.22.0 — project Undo / Redo history for desktop + iPhone/iPad.
// Desktop: Ctrl/Cmd+Z = undo, Ctrl+Y or Cmd/Ctrl+Shift+Z = redo.
// Touch: double tap with 2 fingers = undo, double tap with 3 fingers = redo.
const PROJECT_KEY='colorize-design-web-v04';
const SESSION_KEY='colorize-history-v022';
const TOAST_KEY='colorize-history-toast-v022';
const MAX_HISTORY=80;
const COMMIT_DELAY=240;
const nativeSetItem=Storage.prototype.setItem;

let pending=null,commitTimer=0,internalWrite=false;
let touchGesture=null;
let lastTap={fingers:0,time:0,x:0,y:0};

function loadState(){
  try{
    const s=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
    if(s&&Array.isArray(s.items)&&Number.isInteger(s.index))return s;
  }catch{}
  return {version:1,items:[],index:-1,undoCount:0,redoCount:0,lastAction:null};
}
function saveState(s){
  try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(s))}catch{}
}
function currentRaw(){try{return localStorage.getItem(PROJECT_KEY)}catch{return null}}
function normalizeState(){
  const s=loadState(),raw=currentRaw();
  if(!raw)return s;
  if(s.index>=0&&s.items[s.index]===raw)return s;
  const cut=s.index>=0?s.items.slice(0,s.index+1):[];
  if(cut[cut.length-1]!==raw)cut.push(raw);
  if(cut.length>MAX_HISTORY)cut.splice(0,cut.length-MAX_HISTORY);
  s.items=cut;s.index=cut.length-1;saveState(s);return s;
}
function commitRaw(raw){
  if(!raw)return;
  const s=loadState();
  if(s.index>=0&&s.items[s.index]===raw)return;
  let items=s.index>=0?s.items.slice(0,s.index+1):[];
  if(items[items.length-1]!==raw)items.push(raw);
  if(items.length>MAX_HISTORY)items.splice(0,items.length-MAX_HISTORY);
  s.items=items;s.index=items.length-1;s.lastAction='edit';saveState(s);
}
function flushPending(){
  clearTimeout(commitTimer);commitTimer=0;
  if(pending){const raw=pending;pending=null;commitRaw(raw)}
}
function scheduleCommit(raw){
  pending=String(raw);clearTimeout(commitTimer);
  commitTimer=setTimeout(flushPending,COMMIT_DELAY);
}

Storage.prototype.setItem=function(key,value){
  const out=nativeSetItem.call(this,key,value);
  if(this===localStorage&&key===PROJECT_KEY&&!internalWrite)scheduleCommit(value);
  return out;
};

function toast(text){
  let el=document.getElementById('historyToast22');
  if(!el){
    el=document.createElement('div');el.id='historyToast22';
    Object.assign(el.style,{position:'fixed',left:'50%',top:'calc(env(safe-area-inset-top) + 72px)',transform:'translateX(-50%)',zIndex:'99999',padding:'9px 14px',borderRadius:'999px',background:'rgba(20,22,26,.86)',color:'#fff',font:'600 13px -apple-system,BlinkMacSystemFont,sans-serif',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',boxShadow:'0 8px 28px rgba(0,0,0,.25)',pointerEvents:'none',opacity:'0',transition:'opacity .15s ease'});
    document.body.appendChild(el);
  }
  el.textContent=text;el.style.opacity='1';clearTimeout(el._timer);el._timer=setTimeout(()=>el.style.opacity='0',850);
}
function reloadWithToast(text){
  if(globalThis.__COLORIZE_HISTORY_TEST_NO_RELOAD){toast(text);return}
  try{sessionStorage.setItem(TOAST_KEY,text)}catch{}
  setTimeout(()=>location.reload(),20);
}
function applyIndex(nextIndex,action,source){
  flushPending();const s=loadState();
  if(nextIndex<0||nextIndex>=s.items.length)return false;
  const raw=s.items[nextIndex];if(!raw)return false;
  internalWrite=true;
  try{nativeSetItem.call(localStorage,PROJECT_KEY,raw)}finally{internalWrite=false}
  s.index=nextIndex;s.lastAction={action,source,at:Date.now()};
  if(action==='undo')s.undoCount=(s.undoCount||0)+1;else s.redoCount=(s.redoCount||0)+1;
  saveState(s);reloadWithToast(action==='undo'?'↶ Назад':'↷ Вперёд');return true;
}
function undo(source='command'){
  flushPending();const s=loadState();
  if(s.index<=0){toast('Нет действий для отмены');return false}
  return applyIndex(s.index-1,'undo',source);
}
function redo(source='command'){
  flushPending();const s=loadState();
  if(s.index<0||s.index>=s.items.length-1){toast('Нет действий для повтора');return false}
  return applyIndex(s.index+1,'redo',source);
}

function center(list){
  const a=[...list];if(!a.length)return{x:0,y:0};
  return{x:a.reduce((n,t)=>n+t.clientX,0)/a.length,y:a.reduce((n,t)=>n+t.clientY,0)/a.length};
}
function registerTap(fingers,x,y,source='touch'){
  const now=performance.now();
  const second=lastTap.fingers===fingers&&now-lastTap.time<430&&Math.hypot(x-lastTap.x,y-lastTap.y)<90;
  if(second){lastTap={fingers:0,time:0,x:0,y:0};if(fingers===2)undo(source);else if(fingers===3)redo(source);return true}
  lastTap={fingers,time:now,x,y};return false;
}
function onTouchStart(e){
  const n=e.touches.length;if(n!==2&&n!==3)return;
  const c=center(e.touches);touchGesture={fingers:n,start:performance.now(),x:c.x,y:c.y,moved:false};
}
function onTouchMove(e){
  if(!touchGesture)return;const c=center(e.touches.length?e.touches:e.changedTouches);
  if(Math.hypot(c.x-touchGesture.x,c.y-touchGesture.y)>28)touchGesture.moved=true;
}
function onTouchEnd(e){
  if(!touchGesture||e.touches.length)return;
  const g=touchGesture;touchGesture=null;
  if(g.moved||performance.now()-g.start>340)return;
  if(registerTap(g.fingers,g.x,g.y,'gesture'))e.preventDefault();
}

document.addEventListener('touchstart',onTouchStart,{capture:true,passive:true});
document.addEventListener('touchmove',onTouchMove,{capture:true,passive:true});
document.addEventListener('touchend',onTouchEnd,{capture:true,passive:false});
document.addEventListener('touchcancel',()=>{touchGesture=null},{capture:true,passive:true});

document.addEventListener('keydown',e=>{
  const mod=e.ctrlKey||e.metaKey;if(!mod||e.altKey)return;
  const k=String(e.key||'').toLowerCase();
  if(k==='z'&&!e.shiftKey){e.preventDefault();e.stopPropagation();undo('keyboard');return}
  if(k==='y'||(k==='z'&&e.shiftKey)){e.preventDefault();e.stopPropagation();redo('keyboard')}
},{capture:true});

function ensureBaseline(){
  let raw=currentRaw();
  if(!raw){
    document.getElementById('saveBtn')?.click();raw=currentRaw();
  }
  if(raw){pending=null;clearTimeout(commitTimer);commitRaw(raw)}
  normalizeState();
  try{const t=sessionStorage.getItem(TOAST_KEY);if(t){sessionStorage.removeItem(TOAST_KEY);setTimeout(()=>toast(t),80)}}catch{}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureBaseline,{once:true});else ensureBaseline();

// Public commands are also useful for future toolbar buttons and automated tests.
globalThis.__colorizeUndo=()=>undo('api');
globalThis.__colorizeRedo=()=>redo('api');
globalThis.__colorizeHistory22SimulateGesture=(fingers)=>{registerTap(fingers,100,100,'gesture-test');return registerTap(fingers,100,100,'gesture-test')};
globalThis.__colorizeHistory22Debug=()=>{flushPending();const s=loadState();return{version:'0.22.0',length:s.items.length,index:s.index,canUndo:s.index>0,canRedo:s.index>=0&&s.index<s.items.length-1,undoCount:s.undoCount||0,redoCount:s.redoCount||0,lastAction:s.lastAction}};
