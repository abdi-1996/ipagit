// v0.31.0 — stable, non-destructive viewport text editing.
// The editor lives outside the object DOM so render/decorator observers cannot eat the text.
const VERSION='0.31.0';
const STORE='colorize-design-web-v04';
let editing=null,raf=0,committing=false;
const $=(s,r=document)=>r.querySelector(s);

function project(){try{return JSON.parse(localStorage.getItem(STORE)||'null')}catch{return null}}
function objectById(id){const p=project();if(!p)return null;for(const a of p.artboards||[]){const o=a.objects?.find(x=>x.id===id);if(o)return o}return null}
function nodeById(id){return id?document.querySelector(`#world .obj.text[data-object-id="${CSS.escape(id)}"]`):null}
function selectedNode(){return document.querySelector('#world .obj.text.selected[data-object-id]')}
function textInput(){return document.querySelector('#properties input[data-prop="text"]')}
function clean(v){return String(v??'').replace(/\r/g,'').replace(/\n+/g,' ').replace(/\u00a0/g,' ').trim()}
function activeTool(){return document.querySelector('[data-v030-tool].active')?.dataset.v030Tool||'move'}
function hideLegacy(){const r=textInput()?.closest('.prop-row');if(r){r.hidden=true;r.dataset.text31Hidden='1'}}
function worldZoom(){const p=project();return Math.max(.05,Number(p?.view?.zoom)||1)}
function syncBox(){
  if(!editing)return;
  const host=nodeById(editing.id),ed=editing.editor;
  if(!host||!ed){cancel();return}
  editing.host=host;
  if(host.style.visibility!=='hidden')host.style.visibility='hidden';
  const r=host.getBoundingClientRect(),z=worldZoom(),cs=getComputedStyle(host);
  Object.assign(ed.style,{left:`${r.left}px`,top:`${r.top}px`,width:`${Math.max(26,r.width)}px`,height:`${Math.max(28,r.height)}px`,fontFamily:cs.fontFamily,fontWeight:cs.fontWeight,fontSize:`${Math.max(12,(parseFloat(cs.fontSize)||16)*z)}px`,letterSpacing:`${(parseFloat(cs.letterSpacing)||0)*z}px`,lineHeight:cs.lineHeight==='normal'?'1.12':String(cs.lineHeight),textAlign:cs.textAlign,color:editing.color});
  raf=requestAnimationFrame(syncBox);
}
function focusNow(ed){try{ed.focus({preventScroll:true})}catch{try{ed.focus()}catch{}}try{ed.setSelectionRange(ed.value.length,ed.value.length)}catch{}return document.activeElement===ed}
function restoreHost(){const h=nodeById(editing?.id);if(h)h.style.visibility=editing?.oldVisibility||''}
function start(node=selectedNode()){
  if(!node?.matches?.('#world .obj.text[data-object-id]'))return false;
  const id=node.dataset.objectId;
  if(editing?.id===id){focusNow(editing.editor);return true}
  if(editing)commit();
  hideLegacy();
  const o=objectById(id),original=String(o?.text??node.dataset.text??'');
  const color=getComputedStyle(node).color||o?.faceColor||'#111827';
  const ed=document.createElement('textarea');ed.id='colorizeTextEditor31';ed.className='colorize-text-editor31';ed.value=original;ed.rows=1;ed.spellcheck=false;ed.autocapitalize='sentences';ed.autocomplete='off';ed.inputMode='text';ed.setAttribute('enterkeyhint','done');ed.setAttribute('aria-label','Редактировать надпись');document.body.appendChild(ed);
  editing={id,host:node,editor:ed,original,color,oldVisibility:node.style.visibility||'',focusedSynchronously:false};
  node.style.visibility='hidden';
  syncBox();
  editing.focusedSynchronously=focusNow(ed);
  return true;
}
function cancel(){if(!editing)return false;cancelAnimationFrame(raf);restoreHost();editing.editor?.remove();editing=null;return true}
function importProject(p){
  const raw=JSON.stringify(p);localStorage.setItem(STORE,raw);const input=document.getElementById('importInput');if(!input)return false;
  try{const f=new File([raw],'colorize-text31.colorize.json',{type:'application/json'}),dt=new DataTransfer();dt.items.add(f);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true}catch{return false}
}
function commit(){
  if(!editing||committing)return false;committing=true;
  const id=editing.id,value=clean(editing.editor.value)||editing.original||' ';
  cancelAnimationFrame(raf);restoreHost();editing.editor.remove();editing=null;
  try{
    const input=textInput();
    if(input){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}
    else{const p=project();if(p){for(const a of p.artboards||[]){const o=a.objects?.find(x=>x.id===id);if(o){o.text=value;if(!o.name||o.name==='Новая надпись')o.name=value;break}}importProject(p)}}
  }finally{committing=false}
  return true;
}
function shouldEditOnPress(node){if(!node)return false;const t=activeTool();return t==='text'||node.classList.contains('selected')}

// Window capture runs before the legacy viewport drag handler. A selected text object
// therefore opens the editor without the base app rebuilding the world first.
window.addEventListener('pointerdown',e=>{
  if(editing){if(e.target===editing.editor)return;e.preventDefault();e.stopImmediatePropagation();commit();return}
  const node=e.target?.closest?.('#world .obj.text[data-object-id]');if(!node||e.target?.closest?.('[data-resize-id],.aff-rotate16'))return;
  if(!shouldEditOnPress(node))return;
  e.preventDefault();e.stopImmediatePropagation();start(node);
},true);
window.addEventListener('dblclick',e=>{const n=e.target?.closest?.('#world .obj.text[data-object-id]');if(!n)return;e.preventDefault();e.stopImmediatePropagation();start(n)},true);
window.addEventListener('pointermove',e=>{if(editing&&e.target!==editing.editor)e.stopImmediatePropagation()},true);
window.addEventListener('pointerup',e=>{if(editing&&e.target!==editing.editor)e.stopImmediatePropagation()},true);
window.addEventListener('keydown',e=>{
  if(!editing)return;
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel();return}
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.stopImmediatePropagation();commit()}
},true);
document.addEventListener('focusout',e=>{if(editing&&e.target===editing.editor)setTimeout(()=>{if(editing&&document.activeElement!==editing.editor)commit()},0)},true);
for(const id of ['addTextBtn','dockText'])document.getElementById(id)?.addEventListener('click',()=>{requestAnimationFrame(()=>{const n=selectedNode();if(n)start(n)})});

const style=document.createElement('style');style.id='textEditor31Style';style.textContent=`
.colorize-text-editor31{position:fixed;z-index:10050;box-sizing:border-box;margin:0;padding:0 2px;overflow:hidden;resize:none;background:transparent;border:2px solid #0a84ff;border-radius:3px;outline:none;box-shadow:0 0 0 2px rgba(10,132,255,.15);caret-color:#0a84ff;white-space:pre;touch-action:manipulation;-webkit-appearance:none}
.colorize-text-editor31::selection{background:rgba(10,132,255,.28)}
#world .obj.text{cursor:text}
`;
document.head.appendChild(style);hideLegacy();
const props=document.getElementById('properties');if(props)new MutationObserver(hideLegacy).observe(props,{childList:true,subtree:true});

globalThis.__colorizeText31Start=()=>start(selectedNode());
globalThis.__colorizeText31Commit=commit;
globalThis.__colorizeText31Cancel=cancel;
globalThis.__colorizeText31Debug=()=>({version:VERSION,editing:!!editing,id:editing?.id||null,focusedSynchronously:!!editing?.focusedSynchronously,editorConnected:!!editing?.editor?.isConnected,hostConnected:!!nodeById(editing?.id),hostHidden:editing?nodeById(editing.id)?.style.visibility==='hidden':false});
