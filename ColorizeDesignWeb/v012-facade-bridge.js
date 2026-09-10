let lastFacadeFile=null,lastFacadeDataUrl=null;
function waitForFacadeUi(){
  const actions=document.querySelector('.facade-scan-actions');if(!actions||document.getElementById('facadeApplyProject'))return;
  const b=document.createElement('button');b.id='facadeApplyProject';b.textContent='В проект';b.title='Добавить это фото фасада на активный Artboard';actions.appendChild(b);b.onclick=applyFacadeToProject;
  const auto=document.getElementById('facadeAuto');if(auto)auto.textContent='Анализ перспективы';
}
function captureFacadeFile(e){
  if(e.target?.id!=='facadeFile')return;const f=e.target.files?.[0];if(!f)return;lastFacadeFile=f;const fr=new FileReader();fr.onload=()=>{lastFacadeDataUrl=String(fr.result||'')};fr.readAsDataURL(f);
}
function report(msg){const x=document.getElementById('facadeInfo');if(x)x.textContent=msg}
function applyFacadeToProject(){
  if(!lastFacadeFile){
    const existing=document.querySelector('.artboard.active .obj.image img,.artboard .obj.image img');
    if(existing){report('Фасад уже находится в проекте. Анализ и измерение можно продолжать здесь.');return}
    report('Сначала загрузите фото фасада.');return;
  }
  const input=document.getElementById('imageInput');if(!input){report('Не найден импорт проекта.');return}
  try{
    const dt=new DataTransfer();dt.items.add(lastFacadeFile);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));report('Фасад добавлен на Artboard. Тень и цвет подсветки будут рассчитываться поверх него в 3D.');
    setTimeout(()=>{document.getElementById('facadeClose')?.click();document.querySelector('.mode[data-mode="view3d"]')?.click()},450);
  }catch{
    report('Браузер не разрешил передать файл автоматически. Импортируйте то же фото кнопкой «Фото», анализ сохранится в Facade Scan.');
  }
}
window.addEventListener('DOMContentLoaded',()=>{
  document.addEventListener('change',captureFacadeFile,true);waitForFacadeUi();const obs=new MutationObserver(waitForFacadeUi);obs.observe(document.body,{subtree:true,childList:true});
});
