(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const STORE = 'colorize-design-web-v02';
  const LEGACY_STORE = 'colorize-design-web-v01';

  const MATERIALS = { acrylic:'Акрил', pvc:'ПВХ', metal:'Металл', acm:'Композит' };
  const SIDE_MATERIALS = { pvc:'ПВХ', aluminum:'Алюминий', stainless:'Нержавейка', acrylic:'Акрил', painted:'Окрашенный металл' };
  const BACK_MATERIALS = { pvc:'ПВХ', acrylic:'Акрил', acm:'Композит', metal:'Металл' };
  const PRESETS = {
    custom:null,
    acrylic:{faceMaterial:'acrylic',faceThickness:3,returnMaterial:'pvc',returnDepth:50,backMaterial:'pvc',backThickness:5,lightMode:'off'},
    pvc:{faceMaterial:'pvc',faceThickness:10,returnMaterial:'pvc',returnDepth:30,backMaterial:'pvc',backThickness:5,lightMode:'off'},
    channel:{faceMaterial:'acrylic',faceThickness:3,returnMaterial:'aluminum',returnDepth:80,backMaterial:'pvc',backThickness:5,lightMode:'face'},
    halo:{faceMaterial:'metal',faceThickness:2,returnMaterial:'stainless',returnDepth:50,backMaterial:'acrylic',backThickness:5,lightMode:'halo'},
    metal:{faceMaterial:'metal',faceThickness:2,returnMaterial:'stainless',returnDepth:40,backMaterial:'metal',backThickness:2,lightMode:'off'}
  };

  const defaultText = (id, text='COLORIZE') => ({
    id,type:'text',name:text,text,x:340,y:310,w:400,h:90,rotation:0,opacity:1,
    fontSize:76,fontFamily:'Arial Black',fontWeight:'800',letterSpacing:0,
    color:'#111827',faceColor:'#111827',sideColor:'#20252b',backColor:'#0b0d10',
    preset:'custom',faceMaterial:'acrylic',returnMaterial:'pvc',backMaterial:'pvc',
    faceThickness:3,returnDepth:50,backThickness:5,
    lightMode:'off',lightColor:'#ffffff',lightIntensity:.72
  });

  const defaultProject = () => {
    const artId=uid(), textId=uid();
    return {
      version:2,name:'Новый проект',mode:'2d',view3dRender:false,
      view:{x:160,y:110,zoom:.72},tilt:{x:0,y:0},activeArtboardId:artId,selectedObjectId:textId,
      artboards:[{id:artId,name:'Artboard 1',x:0,y:0,w:1080,h:720,bg:'#ffffff',objects:[defaultText(textId)]}]
    };
  };

  function normalizeText(o){
    if(o.type!=='text')return o;
    o.fontWeight??='800';o.letterSpacing??=0;o.faceColor??=o.color||'#111827';o.color=o.faceColor;
    o.sideColor??='#20252b';o.backColor??='#0b0d10';o.preset??='custom';o.faceMaterial??='acrylic';o.returnMaterial??='pvc';o.backMaterial??='pvc';
    o.faceThickness??=3;o.returnDepth??=50;o.backThickness??=5;o.lightMode??='off';o.lightColor??='#ffffff';o.lightIntensity??=.72;
    return o;
  }
  function normalizeProject(p){
    if(!p||!Array.isArray(p.artboards))return defaultProject();
    p.version=2;p.mode||='2d';p.view3dRender??=false;p.tilt||={x:0,y:0};p.view||={x:160,y:110,zoom:.72};
    p.artboards.forEach(a=>{a.objects||=[];a.objects.forEach(normalizeText);});return p;
  }
  function load(){try{const raw=localStorage.getItem(STORE)||localStorage.getItem(LEGACY_STORE);return raw?normalizeProject(JSON.parse(raw)):null;}catch(_){return null;}}
  function save(){try{localStorage.setItem(STORE,JSON.stringify(project));}catch(_){}}

  let project=load()||defaultProject();
  let tool='select',drag=null,resize=null;const pointers=new Map();let pinchStart=null;

  const viewport=$('#viewport'),world=$('#world'),layersList=$('#layersList'),artboardsList=$('#artboardsList');
  const properties=$('#properties'),zoomStatus=$('#zoomStatus'),coordStatus=$('#coordStatus'),toolStatus=$('#toolStatus');
  const rightPanel=$('#rightPanel'),modeBadge=$('#modeBadge'),view3dRenderBtn=$('#view3dRenderBtn');

  const activeArtboard=()=>project.artboards.find(a=>a.id===project.activeArtboardId)||project.artboards[0];
  const selectedObject=()=>activeArtboard()?.objects.find(o=>o.id===project.selectedObjectId)||null;
  const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function setTool(next){tool=next;$$('.tool').forEach(b=>b.classList.remove('active'));if(tool==='select')$('#selectTool').classList.add('active');if(tool==='pan')$('#panTool').classList.add('active');toolStatus.textContent=tool==='pan'?'Рука':'Выбор';}
  function screenToWorld(clientX,clientY){const r=viewport.getBoundingClientRect();return{x:(clientX-r.left-project.view.x)/project.view.zoom,y:(clientY-r.top-project.view.y)/project.view.zoom};}
  function applyWorldTransform(){world.style.transform=`translate(${project.view.x}px,${project.view.y}px) scale(${project.view.zoom})`;zoomStatus.textContent=`${Math.round(project.view.zoom*100)}%`;}

  function hexToRgb(hex){const m=String(hex||'#000').replace('#','');const h=m.length===3?m.split('').map(c=>c+c).join(''):m.padEnd(6,'0');return[parseInt(h.slice(0,2),16)||0,parseInt(h.slice(2,4),16)||0,parseInt(h.slice(4,6),16)||0];}
  function rgba(hex,a){const[r,g,b]=hexToRgb(hex);return`rgba(${r},${g},${b},${a})`;}
  function extrusionShadow(o,rendered=false){
    const px=clamp((Number(o.returnDepth)||0)/5,1,24),steps=Math.max(1,Math.round(px)),shadows=[];
    for(let i=1;i<=steps;i++){const t=i/steps;shadows.push(`${i}px ${Math.round(i*.72)}px 0 ${rgba(o.sideColor||'#222',.86-.22*t)}`);}
    shadows.push(`${Math.round(px*.75)}px ${Math.round(px*1.05)}px ${rendered?Math.max(5,px*.45):3}px rgba(0,0,0,${rendered?.34:.25})`);
    return shadows.join(',');
  }
  function applyTextVisual(node,o){
    normalizeText(o);const rendered=project.mode==='render'||(project.mode==='view3d'&&project.view3dRender),volume=project.mode!=='2d';
    node.dataset.text=o.text||'';node.style.fontSize=`${o.fontSize||48}px`;node.style.fontFamily=o.fontFamily||'Arial';node.style.fontWeight=o.fontWeight||'800';node.style.letterSpacing=`${o.letterSpacing||0}px`;
    node.style.setProperty('--face-color',o.faceColor);node.style.setProperty('--side-color',o.sideColor);node.style.setProperty('--back-color',o.backColor);node.style.setProperty('--light-color',o.lightColor);node.style.setProperty('--light-intensity',String(clamp(Number(o.lightIntensity)||0,0,1)));
    node.classList.toggle('rendered-face',rendered);Object.keys(MATERIALS).forEach(m=>node.classList.remove(`material-${m}`));node.classList.add(`material-${o.faceMaterial||'acrylic'}`);
    node.classList.toggle('light-halo',o.lightMode==='halo'||o.lightMode==='both');node.classList.toggle('light-face',o.lightMode==='face'||o.lightMode==='both');
    if(volume){node.style.textShadow=extrusionShadow(o,rendered);node.style.color=rendered?'transparent':o.faceColor;}else{node.style.textShadow='none';node.style.color=o.faceColor;node.classList.remove('rendered-face','light-halo','light-face');}
  }

  function renderWorld(){
    world.className=`world mode-${project.mode}${project.mode==='view3d'&&project.view3dRender?' render-on':''}`;world.style.setProperty('--tilt-x',`${project.tilt.x}deg`);world.style.setProperty('--tilt-y',`${project.tilt.y}deg`);world.innerHTML='';
    for(const a of project.artboards){
      const el=document.createElement('div');el.className=`artboard${a.id===project.activeArtboardId?' active':''}`;el.dataset.artboardId=a.id;Object.assign(el.style,{left:`${a.x}px`,top:`${a.y}px`,width:`${a.w}px`,height:`${a.h}px`,background:a.bg});
      const title=document.createElement('div');title.className='artboard-title';title.dataset.artboardHandle=a.id;title.textContent=a.name;el.appendChild(title);
      for(const o of a.objects){
        const node=document.createElement('div');node.className=`obj ${o.type}${o.id===project.selectedObjectId&&a.id===project.activeArtboardId?' selected':''}`;node.dataset.objectId=o.id;Object.assign(node.style,{left:`${o.x}px`,top:`${o.y}px`,width:`${o.w}px`,height:`${o.h}px`,transform:`rotate(${o.rotation||0}deg)`,opacity:String(o.opacity??1)});
        if(o.type==='text'){node.textContent=o.text;node.style.display='flex';node.style.alignItems='center';node.style.justifyContent='center';applyTextVisual(node,o);}else if(o.type==='rect'){node.style.background=o.fill||'#0a84ff';node.style.borderWidth=`${o.strokeWidth||0}px`;node.style.borderColor=o.stroke||'#000';node.style.borderRadius=`${o.radius||0}px`;}else if(o.type==='image'){const img=document.createElement('img');img.src=o.src;img.alt=o.name||'Image';node.appendChild(img);}
        if(o.id===project.selectedObjectId&&a.id===project.activeArtboardId&&project.mode==='2d'){const h=document.createElement('div');h.className='resize-handle';h.dataset.resizeId=o.id;node.appendChild(h);}el.appendChild(node);
      }world.appendChild(el);
    }
    view3dRenderBtn.hidden=project.mode!=='view3d';view3dRenderBtn.classList.toggle('active',!!project.view3dRender);view3dRenderBtn.textContent=project.view3dRender?'Render ON':'Render OFF';
    const labels={'2d':'2D · редактирование','3d':'3D · объём + тень','render':'Render · материалы + свет','view3d':project.view3dRender?'3D View · Render':'3D View · объёмный preview'};modeBadge.textContent=labels[project.mode]||project.mode;applyWorldTransform();
  }

  function renderLists(){const a=activeArtboard();layersList.innerHTML=a?a.objects.slice().reverse().map(o=>`<div class="list-row ${o.id===project.selectedObjectId?'active':''}" data-layer-id="${o.id}"><span>${o.type==='text'?'T':o.type==='image'?'▧':'▭'}</span><span class="name">${esc(o.name||o.text||o.type)}</span><button class="mini" data-delete-object="${o.id}" title="Удалить">×</button></div>`).join(''):'<div class="empty-note">Нет Artboard</div>';artboardsList.innerHTML=project.artboards.map(a2=>`<div class="list-row ${a2.id===project.activeArtboardId?'active':''}" data-artboard-row="${a2.id}"><span>▣</span><span class="name">${esc(a2.name)}</span><span>${Math.round(a2.w)}×${Math.round(a2.h)}</span><button class="mini" data-delete-artboard="${a2.id}" title="Удалить">×</button></div>`).join('');}

  function prop(label,key,value,type='number',extra=''){return`<label class="prop-row"><span>${label}</span><input data-prop="${key}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
  function selectProp(label,key,value,items){return`<label class="prop-row"><span>${label}</span><select data-prop="${key}">${Object.entries(items).map(([k,v])=>`<option value="${esc(k)}" ${k===value?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;}
  function section(title,html,hint=''){return`<div class="prop-section"><h4>${esc(title)}</h4>${html}${hint?`<div class="prop-hint">${esc(hint)}</div>`:''}</div>`;}
  function renderProperties(){
    const o=selectedObject(),a=activeArtboard();
    if(o){
      let html=section('Положение',prop('Имя','name',o.name||'','text')+prop('X','x',Math.round(o.x))+prop('Y','y',Math.round(o.y))+prop('Ширина','w',Math.round(o.w),'number','min="1"')+prop('Высота','h',Math.round(o.h),'number','min="1"')+prop('Поворот','rotation',o.rotation||0)+prop('Прозрачность','opacity',o.opacity??1,'number','min="0" max="1" step="0.05"'));
      if(o.type==='text'){
        normalizeText(o);
        html+=section('Текст',prop('Надпись','text',o.text||'','text')+prop('Шрифт','fontFamily',o.fontFamily||'Arial','text')+prop('Размер','fontSize',o.fontSize||48,'number','min="8" max="500"')+prop('Насыщенность','fontWeight',o.fontWeight||'800','number','min="100" max="900" step="100"')+prop('Интервал','letterSpacing',o.letterSpacing||0,'number','min="-20" max="100" step="0.5"')+prop('Цвет лица','faceColor',o.faceColor,'color'));
        html+=section('Конструкция',selectProp('Пресет','preset',o.preset||'custom',{custom:'Своя конструкция',acrylic:'Акриловая буква',pvc:'ПВХ буква',channel:'Световая объёмная',halo:'Контражурная',metal:'Металлическая'})+selectProp('Материал лица','faceMaterial',o.faceMaterial,MATERIALS)+prop('Толщина лица','faceThickness',o.faceThickness,'number','min="1" max="30" step="1"')+selectProp('Материал борта','returnMaterial',o.returnMaterial,SIDE_MATERIALS)+prop('Глубина борта','returnDepth',o.returnDepth,'number','min="5" max="300" step="5"')+prop('Цвет борта','sideColor',o.sideColor,'color')+selectProp('Задник','backMaterial',o.backMaterial,BACK_MATERIALS)+prop('Толщина задника','backThickness',o.backThickness,'number','min="1" max="30" step="1"')+prop('Цвет задника','backColor',o.backColor,'color'),'Размеры указаны в миллиметрах. Например 50 мм = 5 см.');
        html+=section('Подсветка',selectProp('Тип','lightMode',o.lightMode,{off:'Без подсветки',face:'Face Lit',halo:'Halo Lit',both:'Face + Halo'})+prop('Цвет света','lightColor',o.lightColor,'color')+prop('Яркость','lightIntensity',o.lightIntensity,'number','min="0" max="1" step="0.05"'),'Подсветка видна в 3D и особенно в Render.');
      }else if(o.type==='rect')html+=section('Фигура',prop('Заливка','fill',o.fill||'#0a84ff','color')+prop('Радиус','radius',o.radius||0));properties.className='properties';properties.innerHTML=html;
    }else if(a){properties.className='properties';properties.innerHTML=section('Artboard',prop('Название','art_name',a.name,'text')+prop('X','art_x',Math.round(a.x))+prop('Y','art_y',Math.round(a.y))+prop('Ширина','art_w',Math.round(a.w),'number','min="50"')+prop('Высота','art_h',Math.round(a.h),'number','min="50"')+prop('Фон','art_bg',a.bg||'#fff','color'));}else{properties.className='properties empty';properties.textContent='Выберите текст или Artboard';}
  }
  function renderAll(){renderWorld();renderLists();renderProperties();save();}

  function addArtboard(){const n=project.artboards.length+1,last=project.artboards.at(-1),a={id:uid(),name:`Artboard ${n}`,x:last?last.x+last.w+140:0,y:last?last.y:0,w:1080,h:720,bg:'#fff',objects:[]};project.artboards.push(a);project.activeArtboardId=a.id;project.selectedObjectId=null;renderAll();fitArtboard();}
  function addText(){const a=activeArtboard();if(!a)return;const id=uid(),o=defaultText(id,'НОВАЯ НАДПИСЬ');o.x=a.w/2-180;o.y=a.h/2-45;o.w=360;o.h=90;o.fontSize=58;a.objects.push(o);project.selectedObjectId=o.id;renderAll();}
  function addRect(){const a=activeArtboard();if(!a)return;const o={id:uid(),type:'rect',name:'Прямоугольник',x:a.w/2-120,y:a.h/2-70,w:240,h:140,rotation:0,fill:'#0a84ff',strokeWidth:0,radius:12,opacity:1};a.objects.push(o);project.selectedObjectId=o.id;renderAll();}
  function duplicateSelected(){const a=activeArtboard(),o=selectedObject();if(!a||!o)return;const copy=typeof structuredClone==='function'?structuredClone(o):JSON.parse(JSON.stringify(o));copy.id=uid();copy.name=`${copy.name||'Объект'} копия`;copy.x+=28;copy.y+=28;a.objects.push(copy);project.selectedObjectId=copy.id;renderAll();}

  function fitArtboard(){const a=activeArtboard();if(!a)return;const r=viewport.getBoundingClientRect(),margin=80,z=clamp(Math.min((r.width-margin)/a.w,(r.height-margin)/a.h),.08,3);project.view.zoom=z;project.view.x=r.width/2-(a.x+a.w/2)*z;project.view.y=r.height/2-(a.y+a.h/2)*z;applyWorldTransform();save();}
  function centerAll(){if(!project.artboards.length)return;const minX=Math.min(...project.artboards.map(a=>a.x)),minY=Math.min(...project.artboards.map(a=>a.y)),maxX=Math.max(...project.artboards.map(a=>a.x+a.w)),maxY=Math.max(...project.artboards.map(a=>a.y+a.h)),r=viewport.getBoundingClientRect(),w=maxX-minX,h=maxY-minY,z=clamp(Math.min((r.width-100)/w,(r.height-100)/h),.05,2);project.view.zoom=z;project.view.x=r.width/2-(minX+w/2)*z;project.view.y=r.height/2-(minY+h/2)*z;applyWorldTransform();save();}
  function zoomAt(factor,cx,cy){const r=viewport.getBoundingClientRect(),x=cx??(r.left+r.width/2),y=cy??(r.top+r.height/2),before=screenToWorld(x,y),nz=clamp(project.view.zoom*factor,.05,8);project.view.zoom=nz;project.view.x=(x-r.left)-before.x*nz;project.view.y=(y-r.top)-before.y*nz;applyWorldTransform();save();}

  function beginPointer(e){
    viewport.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2){const pts=[...pointers.values()],cx=(pts[0].x+pts[1].x)/2,cy=(pts[0].y+pts[1].y)/2;pinchStart={dist:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),zoom:project.view.zoom,anchor:screenToWorld(cx,cy)};drag=null;resize=null;return;}
    const objEl=e.target.closest('[data-object-id]'),resizeEl=e.target.closest('[data-resize-id]'),artHandle=e.target.closest('[data-artboard-handle]'),artEl=e.target.closest('[data-artboard-id]');
    if(resizeEl&&project.mode==='2d'){const a=activeArtboard(),o=a?.objects.find(x=>x.id===resizeEl.dataset.resizeId);if(!o)return;e.preventDefault();e.stopPropagation();project.selectedObjectId=o.id;resize={id:o.id,startX:e.clientX,startY:e.clientY,w:o.w,h:o.h};return;}
    if(objEl&&tool==='select'&&project.mode==='2d'){const art=objEl.closest('[data-artboard-id]');project.activeArtboardId=art.dataset.artboardId;const o=activeArtboard().objects.find(x=>x.id===objEl.dataset.objectId);project.selectedObjectId=o.id;drag={kind:'object',id:o.id,startX:e.clientX,startY:e.clientY,x:o.x,y:o.y};renderLists();renderProperties();renderWorld();return;}
    if(artHandle&&tool==='select'&&project.mode==='2d'){const a=project.artboards.find(x=>x.id===artHandle.dataset.artboardHandle);project.activeArtboardId=a.id;project.selectedObjectId=null;drag={kind:'artboard',id:a.id,startX:e.clientX,startY:e.clientY,x:a.x,y:a.y};renderLists();renderProperties();renderWorld();return;}
    if(artEl){project.activeArtboardId=artEl.dataset.artboardId;project.selectedObjectId=null;renderLists();renderProperties();renderWorld();}else{project.selectedObjectId=null;renderLists();renderProperties();renderWorld();}
    if(project.mode==='view3d'&&tool==='select')drag={kind:'tilt',startX:e.clientX,startY:e.clientY,x:project.tilt.x,y:project.tilt.y};else drag={kind:'pan',startX:e.clientX,startY:e.clientY,x:project.view.x,y:project.view.y};
  }
  function movePointer(e){
    if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2&&pinchStart){const pts=[...pointers.values()],dist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),factor=dist/pinchStart.dist,nz=clamp(pinchStart.zoom*factor,.05,8),cx=(pts[0].x+pts[1].x)/2,cy=(pts[0].y+pts[1].y)/2,r=viewport.getBoundingClientRect();project.view.zoom=nz;project.view.x=(cx-r.left)-pinchStart.anchor.x*nz;project.view.y=(cy-r.top)-pinchStart.anchor.y*nz;applyWorldTransform();return;}
    const p=screenToWorld(e.clientX,e.clientY);coordStatus.textContent=`X ${Math.round(p.x)} · Y ${Math.round(p.y)}`;
    if(resize){const o=selectedObject();if(!o)return;o.w=Math.max(20,resize.w+(e.clientX-resize.startX)/project.view.zoom);o.h=Math.max(20,resize.h+(e.clientY-resize.startY)/project.view.zoom);renderWorld();renderProperties();return;}
    if(!drag)return;
    if(drag.kind==='object'){const o=selectedObject();if(!o)return;o.x=drag.x+(e.clientX-drag.startX)/project.view.zoom;o.y=drag.y+(e.clientY-drag.startY)/project.view.zoom;renderWorld();}
    else if(drag.kind==='artboard'){const a=project.artboards.find(x=>x.id===drag.id);a.x=drag.x+(e.clientX-drag.startX)/project.view.zoom;a.y=drag.y+(e.clientY-drag.startY)/project.view.zoom;renderWorld();}
    else if(drag.kind==='pan'){project.view.x=drag.x+(e.clientX-drag.startX);project.view.y=drag.y+(e.clientY-drag.startY);applyWorldTransform();}
    else if(drag.kind==='tilt'){project.tilt.y=clamp(drag.y+(e.clientX-drag.startX)*.12,-55,55);project.tilt.x=clamp(drag.x-(e.clientY-drag.startY)*.12,-55,55);renderWorld();}
  }
  function endPointer(e){pointers.delete(e.pointerId);if(pointers.size<2)pinchStart=null;if(drag||resize){drag=null;resize=null;renderAll();}}

  viewport.addEventListener('pointerdown',beginPointer);viewport.addEventListener('pointermove',movePointer);viewport.addEventListener('pointerup',endPointer);viewport.addEventListener('pointercancel',endPointer);
  viewport.addEventListener('wheel',e=>{e.preventDefault();if(e.ctrlKey||e.metaKey)zoomAt(Math.exp(-e.deltaY*.0025),e.clientX,e.clientY);else{project.view.x-=e.deltaX;project.view.y-=e.deltaY;applyWorldTransform();save();}},{passive:false});

  $('#selectTool').onclick=()=>setTool('select');$('#panTool').onclick=()=>setTool('pan');$('#addArtboardBtn').onclick=addArtboard;$('#panelAddArtboardBtn').onclick=addArtboard;$('#addTextBtn').onclick=addText;$('#addRectBtn').onclick=addRect;
  $('#fitBtn').onclick=fitArtboard;$('#centerBtn').onclick=centerAll;$('#zoomInBtn').onclick=()=>zoomAt(1.2);$('#zoomOutBtn').onclick=()=>zoomAt(1/1.2);
  $('#saveBtn').onclick=()=>{save();$('#saveBtn').textContent='Сохранено';setTimeout(()=>$('#saveBtn').textContent='Сохранить',700)};$('#duplicateBtn').onclick=duplicateSelected;$('#panelToggle').onclick=()=>rightPanel.classList.toggle('open');
  view3dRenderBtn.onclick=()=>{project.view3dRender=!project.view3dRender;renderAll();};

  $$('.mode').forEach(b=>b.onclick=()=>{project.mode=b.dataset.mode;$$('.mode').forEach(x=>x.classList.toggle('active',x.dataset.mode===project.mode));renderAll();});
  $$('.panel-tab').forEach(b=>b.onclick=()=>{$$('.panel-tab').forEach(x=>x.classList.toggle('active',x===b));$$('.panel-body').forEach(x=>x.classList.toggle('active',x.id===`panel-${b.dataset.panel}`));});
  layersList.addEventListener('click',e=>{const del=e.target.closest('[data-delete-object]');if(del){const a=activeArtboard();a.objects=a.objects.filter(o=>o.id!==del.dataset.deleteObject);if(project.selectedObjectId===del.dataset.deleteObject)project.selectedObjectId=null;renderAll();return;}const row=e.target.closest('[data-layer-id]');if(row){project.selectedObjectId=row.dataset.layerId;renderAll();}});
  artboardsList.addEventListener('click',e=>{const del=e.target.closest('[data-delete-artboard]');if(del){if(project.artboards.length<=1)return alert('Должен остаться хотя бы один Artboard');project.artboards=project.artboards.filter(a=>a.id!==del.dataset.deleteArtboard);if(project.activeArtboardId===del.dataset.deleteArtboard)project.activeArtboardId=project.artboards[0].id;project.selectedObjectId=null;renderAll();return;}const row=e.target.closest('[data-artboard-row]');if(row){project.activeArtboardId=row.dataset.artboardRow;project.selectedObjectId=null;renderAll();fitArtboard();}});

  properties.addEventListener('input',e=>{
    const key=e.target.dataset.prop;if(!key)return;const o=selectedObject(),a=activeArtboard();let v=e.target.type==='number'?Number(e.target.value):e.target.value;
    if(o&&!key.startsWith('art_')){o[key]=v;if(key==='faceColor')o.color=v;if(key==='preset'&&PRESETS[v])Object.assign(o,PRESETS[v]);if(key!=='preset'&&['faceMaterial','faceThickness','returnMaterial','returnDepth','backMaterial','backThickness','lightMode'].includes(key))o.preset='custom';}
    else if(a&&key.startsWith('art_'))a[key.slice(4)]=v;
    renderWorld();renderLists();save();
  });
  properties.addEventListener('change',()=>renderProperties());

  $('#imageInput').addEventListener('change',e=>{const file=e.target.files?.[0],a=activeArtboard();if(!file||!a)return;const fr=new FileReader();fr.onload=()=>{const img=new Image();img.onload=()=>{const maxW=Math.min(a.w*.65,img.width),ratio=img.height/img.width,o={id:uid(),type:'image',name:file.name,x:a.w/2-maxW/2,y:a.h/2-(maxW*ratio)/2,w:maxW,h:maxW*ratio,rotation:0,opacity:1,src:fr.result};a.objects.push(o);project.selectedObjectId=o.id;renderAll();};img.src=fr.result;};fr.readAsDataURL(file);e.target.value='';});
  $('#exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${(project.name||'Colorize-Design').replace(/\s+/g,'-')}.colorize.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);};
  $('#importInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;const fr=new FileReader();fr.onload=()=>{try{project=normalizeProject(JSON.parse(fr.result));renderAll();fitArtboard();}catch(_){alert('Не удалось открыть проект');}};fr.readAsText(f);e.target.value='';});
  $('#newProjectBtn').onclick=()=>{if(confirm('Создать новый проект?')){project=defaultProject();renderAll();fitArtboard();}};

  window.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicateSelected();}if(e.key==='Delete'||e.key==='Backspace'){const tag=document.activeElement?.tagName;if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;const a=activeArtboard();if(project.selectedObjectId&&a){a.objects=a.objects.filter(o=>o.id!==project.selectedObjectId);project.selectedObjectId=null;renderAll();}}if(e.key===' ')setTool('pan');});
  window.addEventListener('keyup',e=>{if(e.key===' ')setTool('select')});

  $$('.mode').forEach(x=>x.classList.toggle('active',x.dataset.mode===project.mode));renderAll();requestAnimationFrame(()=>fitArtboard());
})();
