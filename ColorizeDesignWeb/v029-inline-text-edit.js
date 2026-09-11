// v0.29.0 — direct text editing in the 2D viewport.
// Double click / double tap a text object to edit it in place. The property-panel
// text field is hidden; the panel remains for typography, material and construction.
const VERSION='0.29.0';
let editing=null,lastTouch={id:null,time:0},committing=false;

function selectedNode(){return document.querySelector('#world .obj.text.selected[data-object-id]')}
function textInput(){return document.querySelector('#properties input[data-prop="text"]')}
function hideLegacyTextInput(){const input=textInput(),row=input?.closest('.prop-row');if(row){row.hidden=true;row.dataset.inlineText29Hidden='1'}}
function placeCaretEnd(node){try{const r=document.createRange(),s=getSelection();r.selectNodeContents(node);r.collapse(false);s.removeAllRanges();s.addRange(r)}catch{}}
function cleanText(v){return String(v??'').replace(/\r/g,'').replace(/\n+/g,' ').replace(/\u00a0/g,' ').trim()}

function start(node=selectedNode()){
  if(!node||!node.matches('.obj.text[data-object-id]'))return false;
  if(editing?.host===node)return true;
  if(editing)commit();
  hideLegacyTextInput();
  const original=node.dataset.text||'';
  // The host may receive resize/transform handles from other modules. Keep the
  // editable text in its own child so those controls can never enter the value.
  node.textContent='';
  const editor=document.createElement('span');editor.className='colorize-inline-value29';editor.textContent=original;editor.contentEditable='plaintext-only';
  if(editor.contentEditable!=='plaintext-only')editor.contentEditable='true';
  editor.spellcheck=false;editor.setAttribute('role','textbox');editor.setAttribute('aria-label','Редактировать надпись');node.prepend(editor);
  editing={host:node,editor,id:node.dataset.objectId,original,composing:false};
  node.classList.add('colorize-inline-editing29');
  requestAnimationFrame(()=>{try{editor.focus({preventScroll:true})}catch{editor.focus()}placeCaretEnd(editor)});
  return true;
}
function cancel(){
  if(!editing)return false;
  const {host,original}=editing;editing=null;
  if(host?.isConnected){host.classList.remove('colorize-inline-editing29');host.textContent=original}
  return true;
}
function commit(){
  if(!editing||committing)return false;
  committing=true;
  const {host,editor,original}=editing,value=cleanText(editor?.textContent);editing=null;
  try{
    if(host?.isConnected)host.classList.remove('colorize-inline-editing29');
    const input=textInput();if(input){input.value=value||original||' ';input.dispatchEvent(new Event('input',{bubbles:true}))}
  }finally{committing=false}
  return true;
}
function objectFromEvent(e){return e.target?.closest?.('#world .obj.text[data-object-id]')||null}

document.addEventListener('dblclick',e=>{const n=objectFromEvent(e);if(!n)return;e.preventDefault();e.stopPropagation();start(n)},true);
document.addEventListener('pointerup',e=>{
  if(e.pointerType!=='touch'||editing)return;const n=objectFromEvent(e);if(!n)return;
  const now=performance.now(),id=n.dataset.objectId;
  if(lastTouch.id===id&&now-lastTouch.time<390){lastTouch={id:null,time:0};e.preventDefault();e.stopPropagation();start(n)}else lastTouch={id,time:now};
},true);
document.addEventListener('pointerdown',e=>{if(editing&&e.target?.closest?.('.colorize-inline-value29'))e.stopImmediatePropagation()},true);
document.addEventListener('keydown',e=>{
  if(editing){
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel();return}
    if(e.key==='Enter'&&!e.shiftKey&&!editing.composing){e.preventDefault();e.stopImmediatePropagation();commit();return}
    return;
  }
  if((e.key==='Enter'||e.key==='F2')&&!e.metaKey&&!e.ctrlKey&&!e.altKey){const n=selectedNode();if(n){e.preventDefault();e.stopImmediatePropagation();start(n)}}
},true);
document.addEventListener('compositionstart',e=>{if(editing&&e.target===editing.editor)editing.composing=true},true);
document.addEventListener('compositionend',e=>{if(editing&&e.target===editing.editor)editing.composing=false},true);
document.addEventListener('focusout',e=>{if(editing&&e.target===editing.editor)setTimeout(()=>{if(editing&&document.activeElement!==editing.editor)commit()},0)},true);

for(const id of ['addTextBtn','dockText'])document.getElementById(id)?.addEventListener('click',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>start(selectedNode()))));

const style=document.createElement('style');style.id='inlineText29Style';style.textContent=`
#world .obj.text{cursor:text}
#world .obj.text.colorize-inline-editing29{cursor:text!important;z-index:999!important;touch-action:none}
#world .colorize-inline-value29{display:inline;cursor:text;user-select:text;-webkit-user-select:text;caret-color:#0a84ff;outline:2px solid #0a84ff;outline-offset:3px;white-space:pre-wrap}
#world .colorize-inline-value29::selection{background:rgba(10,132,255,.28)}
`;
document.head.appendChild(style);
hideLegacyTextInput();
const panel=document.getElementById('properties');if(panel)new MutationObserver(hideLegacyTextInput).observe(panel,{childList:true,subtree:true});

globalThis.__colorizeInlineText29Start=()=>start(selectedNode());
globalThis.__colorizeInlineText29Commit=()=>commit();
globalThis.__colorizeInlineText29Cancel=()=>cancel();
globalThis.__colorizeInlineText29Debug=()=>({version:VERSION,editing:!!editing,objectId:editing?.id||null,textFieldHidden:!!textInput()?.closest('.prop-row')?.hidden,editorIsolated:!!editing?.editor});
