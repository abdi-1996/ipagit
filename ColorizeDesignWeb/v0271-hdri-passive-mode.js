// v0.27.1 — keep unified HDRI passive until the user explicitly selects HDR mode/source.
const LIGHT_KEY='colorize-lighting-v013';
function readMode(){try{return JSON.parse(localStorage.getItem(LIGHT_KEY)||'{}').mode||'main'}catch{return 'main'}}
function writeMode(mode){try{const s=JSON.parse(localStorage.getItem(LIGHT_KEY)||'{}');s.mode=mode;localStorage.setItem(LIGHT_KEY,JSON.stringify(s))}catch{}}
function restoreUiMode(mode){
  writeMode(mode);
  const b=document.querySelector(`[data-light-mode="${mode}"]`);
  if(b&&!b.classList.contains('active')){try{b.click()}catch{}}
}
const previous=globalThis.__colorizeBeforeThreeRender;
globalThis.__colorizeBeforeThreeRender=(renderer,scene,camera)=>{
  const before=readMode();
  previous?.(renderer,scene,camera);
  const after=readMode();
  // Only an automatic restore can change main -> hdr inside the render hook.
  // A real user selection changes the mode before the next frame, so it is preserved.
  if(before!=='hdr'&&after==='hdr')restoreUiMode(before);
  if(readMode()!=='hdr'&&scene){
    if('environmentIntensity' in scene)scene.environmentIntensity=0;
  }
};
globalThis.__colorizeHdri271Debug=()=>({version:'0.27.1',mode:readMode()});
