const mq=matchMedia('(max-width:900px)');
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
let lastState='';
let fitTimer=0;

function sheetHeight(){
  const h=window.visualViewport?.height||window.innerHeight||700;
  return Math.round(clamp(h*.34,220,340));
}

function editorPanelOpen(){
  return !!document.querySelector('#rightPanel.open');
}
function lightingOpen(){
  const p=document.getElementById('lightingPanel');
  return !!(p&&!p.hidden);
}
function facadeOpen(){
  const p=document.getElementById('facadeScanWorkspace');
  return !!(p&&!p.classList.contains('hidden'));
}
function closeEditorPanel(){
  document.getElementById('rightPanel')?.classList.remove('open');
}
function closeLighting(){
  const p=document.getElementById('lightingPanel');
  if(p)p.hidden=true;
  document.getElementById('lightingBtn')?.classList.remove('active');
}
function scheduleFit(){
  clearTimeout(fitTimer);
  fitTimer=setTimeout(()=>{
    if(!mq.matches||facadeOpen())return;
    const fit=document.getElementById('fitBtn');
    if(!fit)return;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      fit.click();
      window.dispatchEvent(new Event('resize'));
    }));
  },280);
}

function syncWorkspaceSafeArea(){
  if(!document.body)return;
  if(!mq.matches){
    document.body.classList.remove('workspace-settings-open','workspace-light-open');
    document.documentElement.style.setProperty('--workspace-sheet-h','0px');
    lastState='desktop';
    return;
  }
  const right=editorPanelOpen();
  const light=lightingOpen();
  const open=right||light;
  const h=open?sheetHeight():0;
  document.documentElement.style.setProperty('--workspace-sheet-h',`${h}px`);
  document.body.classList.toggle('workspace-settings-open',open);
  document.body.classList.toggle('workspace-light-open',light);
  const state=`${right?'r':''}${light?'l':''}:${h}`;
  if(state!==lastState){
    lastState=state;
    window.dispatchEvent(new Event('resize'));
    scheduleFit();
  }
}

function installPanelCoordination(){
  document.addEventListener('click',e=>{
    const t=e.target.closest?.('#lightingBtn,#dockLayers,#dockSign,.panel-tab,#facadeScanBtn,#mobileSheetHandle');
    if(!t)return;
    if(t.id==='lightingBtn'){
      if(!lightingOpen())closeEditorPanel();
    }else if(t.id==='facadeScanBtn'){
      closeEditorPanel();closeLighting();
    }else if(t.id==='dockLayers'||t.id==='dockSign'||t.classList.contains('panel-tab')){
      closeLighting();
    }
    setTimeout(syncWorkspaceSafeArea,0);
  },true);
}

function installObserver(){
  const observer=new MutationObserver(()=>syncWorkspaceSafeArea());
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','hidden'],childList:true});
}

window.addEventListener('DOMContentLoaded',()=>{
  installPanelCoordination();
  installObserver();
  syncWorkspaceSafeArea();
  mq.addEventListener?.('change',syncWorkspaceSafeArea);
  window.addEventListener('resize',syncWorkspaceSafeArea,{passive:true});
  window.visualViewport?.addEventListener('resize',syncWorkspaceSafeArea,{passive:true});
});
