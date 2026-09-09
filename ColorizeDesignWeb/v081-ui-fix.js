function protectScrollablePanels(){
  const selectors=['#lightingPanel','.right-panel .panel-body'];
  for(const selector of selectors){
    document.querySelectorAll(selector).forEach(el=>{
      if(el.dataset.scrollFix==='1')return;
      el.dataset.scrollFix='1';
      el.addEventListener('wheel',e=>{
        e.stopPropagation();
      },{passive:true});
      el.addEventListener('touchmove',e=>{
        e.stopPropagation();
      },{passive:true});
    });
  }
}

function enableDesktopTabScrolling(){
  document.querySelectorAll('.panel-body').forEach(el=>{
    el.style.minHeight='0';
    el.style.overflowY='auto';
    el.style.overscrollBehavior='contain';
  });
}

window.addEventListener('DOMContentLoaded',()=>{
  protectScrollablePanels();
  enableDesktopTabScrolling();
  const observer=new MutationObserver(()=>{
    protectScrollablePanels();
    enableDesktopTabScrolling();
  });
  observer.observe(document.body,{childList:true,subtree:true});
});
