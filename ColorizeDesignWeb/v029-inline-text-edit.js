// v0.29.0 — direct text editing in the 2D viewport.
// Double click / double tap a text object to edit it in place. The property-panel
// text field is hidden; the panel remains for typography, material and construction.
const VERSION='0.29.0';
let editing=null,lastTouch={id:null,time:0},committing=false;

function selectedNode(){return document.querySelector('#world .obj.text.selected[data-object-id]')}
function textInput(){return document.querySelector('#properties input[data-prop="text"]')}
function hideLegacyTextInput(){
  const input=textInput();
  const row=input?.closest('.prop-row');
  if(row){row.hidden=true;row.dataset.inlineText29Hidden='1'}
}
function stripHandles(node){node?.querySelectorAll?.('.resize-handle').forEach(x=>x.remove())}
function placeCaretEnd(node){
  try{const r=document.createRange(),s=getSelection();r.selectNodeContents(node);r.collapse(false);s.removeAllRanges();s.addRange(r)}catch{}
}
function cleanText(v){return String(v??'').replace(/\r/g,'').replace(/\n+/g,' ').replace(/\u00a0/g,' ').trim()}

function start(node=selectedNode()){
  if(!node||!node.matches('.obj.text[data-object-id]'))return false;
  if(editing?.node===node)return true;
  if(editing)commit();
  hideLegacyTextInput();
  stripHandles(node);
  const original=node.textContent||node.dataset.text||'';
  editing={node,id:node.dataset.objectId,original,composing:false};
  node.classList.add('colorize-inline-editing29');
  node.contentEditable='plaintext-only';
  if(node.contentEditable!=='plaintext-only')node.contentEditable='true';
  node.spellcheck=false;
  node.setAttribute('role','textbox');
  node.setAttribute('aria-label','Редактировать надпись');
  requestAnimationFrame(()=>{try{node.focus({preventScroll:true})}catch{node.focus()}placeCaretEnd(node)});
  return true;
}
function cancel(){
  if(!editing)return false;
  const {node,original}=editing;editing=null;
  if(node?.isConnected){node.textContent=original;node.contentEditable='false';node.classList.remove('colorize-inline-editing29');node.removeAttribute('role');node.removeAttribute('aria-label')}
  return true;
}
function commit(){
  if(!editing||committing)return false;
  committing=true;
  const {node,original}=editing;
  const value=cleanText(node?.textContent);
  editing=null;
  try{
    if(node?.isConnected){node.contentEditable='false';node.classList.remove('colorize-inline-editing29');node.removeAttribute('role');node.removeAttribute('aria-label')}
    const input=textInput();
    if(input){input.value=value||original||' ';input.dispatchEvent(new Event('input',{bubbles:true}))}
  }finally{committing=false}
  return true;
}

function objectFromEvent(e){const n=e.target?.closest?.('#world .obj.text[data-object-id]');return n||null}

// Desktop: double click directly on the lettering.
document.addEventListener('dblclick',e=>{
  const n=objectFromEvent(e);if(!n)return;
  e.preventDefault();e.stopPropagation();start(n);
},true);

// iPhone/iPad: reliable double tap independent of browser dblclick synthesis.
document.addEventListener('pointerup',e=>{
  if(e.pointerType!=='touch'||editing)return;
  const n=objectFromEvent(e);if(!n)return;
  const now=performance.now(),id=n.dataset.objectId;
  if(lastTouch.id===id&&now-lastTouch.time<390){lastTouch={id:null,time:0};e.preventDefault();e.stopPropagation();start(n)}
  else lastTouch={id,time:now};
},true);

// While editing, the canvas must not start drag/resize/pan gestures.
document.addEventListener('pointerdown',e=>{
  if(editing&&e.target?.closest?.('.colorize-inline-editing29'))e.stopImmediatePropagation();
},true);

document.addEventListener('keydown',e=>{
  if(editing){
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel();return}
    if(e.key==='Enter'&&!e.shiftKey&&!editing.composing){e.preventDefault();e.stopImmediatePropagation();commit();return}
    return;
  }
  if((e.key==='Enter'||e.key==='F2')&&!e.metaKey&&!e.ctrlKey&&!e.altKey){
    const n=selectedNode();if(n){e.preventDefault();e.stopImmediatePropagation();start(n)}
  }
},true);
document.addEventListener('compositionstart',e=>{if(editing&&e.target===editing.node)editing.composing=true},true);
document.addEventListener('compositionend',e=>{if(editing&&e.target===editing.node)editing.composing=false},true);
document.addEventListener('focusout',e=>{if(editing&&e.target===editing.node)setTimeout(()=>{if(editing&&document.activeElement!==editing.node)commit()},0)},true);

// Newly inserted text starts editing immediately, so the user never has to visit the panel.
for(const id of ['addTextBtn','dockText'])document.getElementById(id)?.addEventListener('click',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>start(selectedNode()))));

const style=document.createElement('style');style.id='inlineText29Style';style.textContent=`
#world .obj.text{cursor:text}
#world .obj.text.colorize-inline-editing29{cursor:text!important;user-select:text!important;-webkit-user-select:text!important;caret-color:#0a84ff;outline:2px solid #0a84ff!important;outline-offset:3px;z-index:999!important;white-space:pre-wrap!important;touch-action:none}
#world .obj.text.colorize-inline-editing29::selection{background:rgba(10,132,255,.28)}
`;
document.head.appendChild(style);

hideLegacyTextInput();
const panel=document.getElementById('properties');if(panel)new MutationObserver(hideLegacyTextInput).observe(panel,{childList:true,subtree:true});

globalThis.__colorizeInlineText29Start=()=>start(selectedNode());
globalThis.__colorizeInlineText29Commit=()=>commit();
globalThis.__colorizeInlineText29Cancel=()=>cancel();
globalThis.__colorizeInlineText29Debug=()=>({version:VERSION,editing:!!editing,objectId:editing?.id||null,textFieldHidden:!!textInput()?.closest('.prop-row')?.hidden});
