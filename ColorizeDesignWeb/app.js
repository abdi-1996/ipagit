(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const STORE = 'colorize-design-web-v01';

  const defaultProject = () => {
    const artId = uid();
    const textId = uid();
    return {
      version: 1,
      name: 'Новый проект',
      mode: '2d',
      view: { x: 160, y: 110, zoom: 0.72 },
      tilt: { x: 0, y: 0 },
      activeArtboardId: artId,
      selectedObjectId: textId,
      artboards: [{
        id: artId,
        name: 'Artboard 1',
        x: 0, y: 0, w: 1080, h: 720, bg: '#ffffff',
        objects: [{
          id: textId, type: 'text', name: 'COLORIZE', text: 'COLORIZE',
          x: 340, y: 310, w: 400, h: 90, rotation: 0,
          fontSize: 76, fontFamily: 'Arial Black', color: '#111827', opacity: 1
        }]
      }]
    };
  };

  let project = load() || defaultProject();
  let tool = 'select';
  let drag = null;
  let resize = null;
  const pointers = new Map();
  let pinchStart = null;

  const viewport = $('#viewport');
  const world = $('#world');
  const layersList = $('#layersList');
  const artboardsList = $('#artboardsList');
  const properties = $('#properties');
  const zoomStatus = $('#zoomStatus');
  const coordStatus = $('#coordStatus');
  const toolStatus = $('#toolStatus');
  const rightPanel = $('#rightPanel');

  function activeArtboard() {
    return project.artboards.find(a => a.id === project.activeArtboardId) || project.artboards[0];
  }
  function selectedObject() {
    const a = activeArtboard();
    return a?.objects.find(o => o.id === project.selectedObjectId) || null;
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(project)); } catch (_) {}
  }
  function load() {
    try { const raw = localStorage.getItem(STORE); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
  }
  function setTool(next) {
    tool = next;
    $$('.tool').forEach(b => b.classList.remove('active'));
    if (tool === 'select') $('#selectTool').classList.add('active');
    if (tool === 'pan') $('#panTool').classList.add('active');
    toolStatus.textContent = tool === 'pan' ? 'Рука' : 'Выбор';
  }
  function screenToWorld(clientX, clientY) {
    const r = viewport.getBoundingClientRect();
    return {
      x: (clientX - r.left - project.view.x) / project.view.zoom,
      y: (clientY - r.top - project.view.y) / project.view.zoom
    };
  }
  function applyWorldTransform() {
    world.style.transform = `translate(${project.view.x}px,${project.view.y}px) scale(${project.view.zoom})`;
    zoomStatus.textContent = `${Math.round(project.view.zoom * 100)}%`;
  }
  function esc(s='') {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderWorld() {
    world.className = `world mode-${project.mode}`;
    world.style.setProperty('--tilt-x', `${project.tilt.x}deg`);
    world.style.setProperty('--tilt-y', `${project.tilt.y}deg`);
    world.innerHTML = '';

    for (const a of project.artboards) {
      const el = document.createElement('div');
      el.className = `artboard${a.id === project.activeArtboardId ? ' active' : ''}`;
      el.dataset.artboardId = a.id;
      Object.assign(el.style, { left:`${a.x}px`, top:`${a.y}px`, width:`${a.w}px`, height:`${a.h}px`, background:a.bg });
      const title = document.createElement('div');
      title.className = 'artboard-title';
      title.dataset.artboardHandle = a.id;
      title.textContent = a.name;
      el.appendChild(title);

      for (const o of a.objects) {
        const node = document.createElement('div');
        node.className = `obj ${o.type}${o.id === project.selectedObjectId && a.id === project.activeArtboardId ? ' selected' : ''}`;
        node.dataset.objectId = o.id;
        Object.assign(node.style, {
          left:`${o.x}px`, top:`${o.y}px`, width:`${o.w}px`, height:`${o.h}px`,
          transform:`rotate(${o.rotation || 0}deg)`, opacity:String(o.opacity ?? 1), color:o.color || '#111827'
        });
        if (o.type === 'text') {
          node.textContent = o.text;
          node.style.fontSize = `${o.fontSize || 48}px`;
          node.style.fontFamily = o.fontFamily || 'Arial';
          node.style.fontWeight = o.fontWeight || '700';
          node.style.display = 'flex';
          node.style.alignItems = 'center';
          node.style.justifyContent = 'center';
        } else if (o.type === 'rect') {
          node.style.background = o.fill || '#0a84ff';
          node.style.borderWidth = `${o.strokeWidth || 0}px`;
          node.style.borderColor = o.stroke || '#000000';
          node.style.borderRadius = `${o.radius || 0}px`;
        } else if (o.type === 'image') {
          const img = document.createElement('img'); img.src = o.src; img.alt = o.name || 'Image'; node.appendChild(img);
        }
        if (o.id === project.selectedObjectId && a.id === project.activeArtboardId && project.mode === '2d') {
          const h = document.createElement('div');
          h.className = 'resize-handle'; h.dataset.resizeId = o.id; node.appendChild(h);
        }
        el.appendChild(node);
      }
      world.appendChild(el);
    }
    applyWorldTransform();
  }

  function renderLists() {
    const a = activeArtboard();
    layersList.innerHTML = a ? a.objects.slice().reverse().map(o => `
      <div class="list-row ${o.id === project.selectedObjectId ? 'active':''}" data-layer-id="${o.id}">
        <span>${o.type === 'text' ? 'T' : o.type === 'image' ? '▧' : '▭'}</span>
        <span class="name">${esc(o.name || o.text || o.type)}</span>
        <button class="mini" data-delete-object="${o.id}" title="Удалить">×</button>
      </div>`).join('') : '<div class="empty-note">Нет Artboard</div>';

    artboardsList.innerHTML = project.artboards.map(a2 => `
      <div class="list-row ${a2.id === project.activeArtboardId ? 'active':''}" data-artboard-row="${a2.id}">
        <span>▣</span><span class="name">${esc(a2.name)}</span><span>${Math.round(a2.w)}×${Math.round(a2.h)}</span>
        <button class="mini" data-delete-artboard="${a2.id}" title="Удалить">×</button>
      </div>`).join('');
  }

  function prop(label, key, value, type='number', extra='') {
    return `<label class="prop-row"><span>${label}</span><input data-prop="${key}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  }
  function renderProperties() {
    const o = selectedObject();
    const a = activeArtboard();
    if (o) {
      let html = prop('Имя','name',o.name || '', 'text') + prop('X','x',Math.round(o.x)) + prop('Y','y',Math.round(o.y)) + prop('Ширина','w',Math.round(o.w),'number','min="1"') + prop('Высота','h',Math.round(o.h),'number','min="1"') + prop('Поворот','rotation',o.rotation || 0) + prop('Прозр.','opacity',o.opacity ?? 1,'number','min="0" max="1" step="0.05"');
      if (o.type === 'text') html += prop('Текст','text',o.text || '', 'text') + prop('Размер','fontSize',o.fontSize || 48) + prop('Шрифт','fontFamily',o.fontFamily || 'Arial','text') + prop('Цвет','color',o.color || '#111827','color');
      if (o.type === 'rect') html += prop('Заливка','fill',o.fill || '#0a84ff','color') + prop('Радиус','radius',o.radius || 0);
      properties.className = 'properties'; properties.innerHTML = html;
    } else if (a) {
      properties.className = 'properties';
      properties.innerHTML = prop('Название','art_name',a.name,'text') + prop('X','art_x',Math.round(a.x)) + prop('Y','art_y',Math.round(a.y)) + prop('Ширина','art_w',Math.round(a.w),'number','min="50"') + prop('Высота','art_h',Math.round(a.h),'number','min="50"') + prop('Фон','art_bg',a.bg || '#ffffff','color');
    } else {
      properties.className = 'properties empty'; properties.textContent = 'Выберите объект или Artboard';
    }
  }
  function renderAll() { renderWorld(); renderLists(); renderProperties(); save(); }

  function addArtboard() {
    const n = project.artboards.length + 1;
    const last = project.artboards[project.artboards.length - 1];
    const a = { id:uid(), name:`Artboard ${n}`, x:last ? last.x + last.w + 140 : 0, y:last ? last.y : 0, w:1080, h:720, bg:'#ffffff', objects:[] };
    project.artboards.push(a); project.activeArtboardId = a.id; project.selectedObjectId = null; renderAll(); fitArtboard();
  }
  function addText() {
    const a = activeArtboard(); if (!a) return;
    const o = { id:uid(), type:'text', name:'Новая надпись', text:'НОВАЯ НАДПИСЬ', x:a.w/2-180, y:a.h/2-45, w:360, h:90, rotation:0, fontSize:58, fontFamily:'Arial Black', color:'#111827', opacity:1 };
    a.objects.push(o); project.selectedObjectId=o.id; renderAll();
  }
  function addRect() {
    const a = activeArtboard(); if (!a) return;
    const o = { id:uid(), type:'rect', name:'Прямоугольник', x:a.w/2-120, y:a.h/2-70, w:240, h:140, rotation:0, fill:'#0a84ff', strokeWidth:0, radius:12, opacity:1 };
    a.objects.push(o); project.selectedObjectId=o.id; renderAll();
  }
  function duplicateSelected() {
    const a = activeArtboard(), o = selectedObject(); if (!a || !o) return;
    const copy = JSON.parse(JSON.stringify(o)); copy.id=uid(); copy.name=`${copy.name || 'Объект'} копия`; copy.x+=28; copy.y+=28; a.objects.push(copy); project.selectedObjectId=copy.id; renderAll();
  }
  function fitArtboard() {
    const a = activeArtboard(); if (!a) return;
    const r = viewport.getBoundingClientRect();
    const margin = 80;
    const z = clamp(Math.min((r.width-margin)/a.w,(r.height-margin)/a.h),.08,3);
    project.view.zoom=z;
    project.view.x = r.width/2 - (a.x+a.w/2)*z;
    project.view.y = r.height/2 - (a.y+a.h/2)*z;
    applyWorldTransform(); save();
  }
  function centerAll() {
    if (!project.artboards.length) return;
    const minX=Math.min(...project.artboards.map(a=>a.x)), minY=Math.min(...project.artboards.map(a=>a.y));
    const maxX=Math.max(...project.artboards.map(a=>a.x+a.w)), maxY=Math.max(...project.artboards.map(a=>a.y+a.h));
    const r=viewport.getBoundingClientRect(), w=maxX-minX, h=maxY-minY;
    const z=clamp(Math.min((r.width-100)/w,(r.height-100)/h),.05,2);
    project.view.zoom=z; project.view.x=r.width/2-(minX+w/2)*z; project.view.y=r.height/2-(minY+h/2)*z; applyWorldTransform(); save();
  }
  function zoomAt(factor,cx,cy) {
    const r=viewport.getBoundingClientRect(); const x=cx??(r.left+r.width/2), y=cy??(r.top+r.height/2);
    const before=screenToWorld(x,y); const nz=clamp(project.view.zoom*factor,.05,8);
    project.view.zoom=nz; project.view.x=(x-r.left)-before.x*nz; project.view.y=(y-r.top)-before.y*nz; applyWorldTransform(); save();
  }

  function beginPointer(e) {
    viewport.setPointerCapture?.(e.pointerId); pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if (pointers.size===2) {
      const pts=[...pointers.values()]; pinchStart={dist:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),zoom:project.view.zoom,viewX:project.view.x,viewY:project.view.y}; return;
    }
    const objEl=e.target.closest('[data-object-id]'); const resizeEl=e.target.closest('[data-resize-id]'); const artHandle=e.target.closest('[data-artboard-handle]'); const artEl=e.target.closest('[data-artboard-id]');
    if (resizeEl) {
      const a=activeArtboard(), o=a?.objects.find(x=>x.id===resizeEl.dataset.resizeId); if(!o)return;
      e.preventDefault(); e.stopPropagation(); project.selectedObjectId=o.id; resize={id:o.id,startX:e.clientX,startY:e.clientY,w:o.w,h:o.h}; return;
    }
    if (objEl && tool==='select') {
      const art=objEl.closest('[data-artboard-id]'); project.activeArtboardId=art.dataset.artboardId; const o=activeArtboard().objects.find(x=>x.id===objEl.dataset.objectId); project.selectedObjectId=o.id;
      drag={kind:'object',id:o.id,startX:e.clientX,startY:e.clientY,x:o.x,y:o.y}; renderLists(); renderProperties(); renderWorld(); return;
    }
    if (artHandle && tool==='select') {
      const a=project.artboards.find(x=>x.id===artHandle.dataset.artboardHandle); project.activeArtboardId=a.id; project.selectedObjectId=null;
      drag={kind:'artboard',id:a.id,startX:e.clientX,startY:e.clientY,x:a.x,y:a.y}; renderLists(); renderProperties(); renderWorld(); return;
    }
    if (artEl) { project.activeArtboardId=artEl.dataset.artboardId; project.selectedObjectId=null; renderLists(); renderProperties(); renderWorld(); }
    else { project.selectedObjectId=null; renderLists(); renderProperties(); renderWorld(); }

    if (project.mode==='view3d' && tool==='select') drag={kind:'tilt',startX:e.clientX,startY:e.clientY,x:project.tilt.x,y:project.tilt.y};
    else drag={kind:'pan',startX:e.clientX,startY:e.clientY,x:project.view.x,y:project.view.y};
  }
  function movePointer(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if (pointers.size===2 && pinchStart) {
      const pts=[...pointers.values()], dist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y); const factor=dist/pinchStart.dist;
      project.view.zoom=clamp(pinchStart.zoom*factor,.05,8); applyWorldTransform(); return;
    }
    const p=screenToWorld(e.clientX,e.clientY); coordStatus.textContent=`X ${Math.round(p.x)} · Y ${Math.round(p.y)}`;
    if (resize) {
      const o=selectedObject(); if(!o)return; o.w=Math.max(20,resize.w+(e.clientX-resize.startX)/project.view.zoom); o.h=Math.max(20,resize.h+(e.clientY-resize.startY)/project.view.zoom); renderWorld(); renderProperties(); return;
    }
    if (!drag) return;
    if (drag.kind==='object') { const o=selectedObject(); if(!o)return; o.x=drag.x+(e.clientX-drag.startX)/project.view.zoom; o.y=drag.y+(e.clientY-drag.startY)/project.view.zoom; renderWorld(); }
    else if (drag.kind==='artboard') { const a=project.artboards.find(x=>x.id===drag.id); a.x=drag.x+(e.clientX-drag.startX)/project.view.zoom; a.y=drag.y+(e.clientY-drag.startY)/project.view.zoom; renderWorld(); }
    else if (drag.kind==='pan') { project.view.x=drag.x+(e.clientX-drag.startX); project.view.y=drag.y+(e.clientY-drag.startY); applyWorldTransform(); }
    else if (drag.kind==='tilt') { project.tilt.y=clamp(drag.y+(e.clientX-drag.startX)*.12,-45,45); project.tilt.x=clamp(drag.x-(e.clientY-drag.startY)*.12,-45,45); renderWorld(); }
  }
  function endPointer(e) { pointers.delete(e.pointerId); if(pointers.size<2)pinchStart=null; if(drag||resize){drag=null;resize=null;renderAll();} }

  viewport.addEventListener('pointerdown', beginPointer);
  viewport.addEventListener('pointermove', movePointer);
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY*.0025),e.clientX,e.clientY);
    else { project.view.x -= e.deltaX; project.view.y -= e.deltaY; applyWorldTransform(); save(); }
  }, {passive:false});

  $('#selectTool').onclick=()=>setTool('select'); $('#panTool').onclick=()=>setTool('pan');
  $('#addArtboardBtn').onclick=addArtboard; $('#panelAddArtboardBtn').onclick=addArtboard; $('#addTextBtn').onclick=addText; $('#addRectBtn').onclick=addRect;
  $('#fitBtn').onclick=fitArtboard; $('#centerBtn').onclick=centerAll; $('#zoomInBtn').onclick=()=>zoomAt(1.2); $('#zoomOutBtn').onclick=()=>zoomAt(1/1.2);
  $('#saveBtn').onclick=()=>{save(); $('#saveBtn').textContent='Сохранено'; setTimeout(()=>$('#saveBtn').textContent='Сохранить',700)};
  $('#duplicateBtn').onclick=duplicateSelected;
  $('#panelToggle').onclick=()=>rightPanel.classList.toggle('open');

  $$('.mode').forEach(b=>b.onclick=()=>{ project.mode=b.dataset.mode; $$('.mode').forEach(x=>x.classList.toggle('active',x.dataset.mode===project.mode)); if(project.mode!=='view3d') project.tilt={x:0,y:0}; renderAll(); });
  $$('.panel-tab').forEach(b=>b.onclick=()=>{ $$('.panel-tab').forEach(x=>x.classList.toggle('active',x===b)); $$('.panel-body').forEach(x=>x.classList.toggle('active',x.id===`panel-${b.dataset.panel}`)); });

  layersList.addEventListener('click',e=>{ const del=e.target.closest('[data-delete-object]'); if(del){const a=activeArtboard();a.objects=a.objects.filter(o=>o.id!==del.dataset.deleteObject);if(project.selectedObjectId===del.dataset.deleteObject)project.selectedObjectId=null;renderAll();return;} const row=e.target.closest('[data-layer-id]');if(row){project.selectedObjectId=row.dataset.layerId;renderAll();} });
  artboardsList.addEventListener('click',e=>{ const del=e.target.closest('[data-delete-artboard]');if(del){if(project.artboards.length<=1)return alert('Должен остаться хотя бы один Artboard');project.artboards=project.artboards.filter(a=>a.id!==del.dataset.deleteArtboard);if(project.activeArtboardId===del.dataset.deleteArtboard)project.activeArtboardId=project.artboards[0].id;project.selectedObjectId=null;renderAll();return;} const row=e.target.closest('[data-artboard-row]');if(row){project.activeArtboardId=row.dataset.artboardRow;project.selectedObjectId=null;renderAll();fitArtboard();} });

  properties.addEventListener('input',e=>{
    const key=e.target.dataset.prop;if(!key)return; const o=selectedObject(),a=activeArtboard(); let v=e.target.type==='number'?Number(e.target.value):e.target.value;
    if(o && !key.startsWith('art_')) o[key]=v;
    else if(a && key.startsWith('art_')) { const k=key.slice(4); a[k]=v; }
    renderWorld(); renderLists(); save();
  });

  $('#imageInput').addEventListener('change',e=>{ const file=e.target.files?.[0],a=activeArtboard();if(!file||!a)return;const fr=new FileReader();fr.onload=()=>{const img=new Image();img.onload=()=>{const maxW=Math.min(a.w*.65,img.width),ratio=img.height/img.width;const o={id:uid(),type:'image',name:file.name,x:a.w/2-maxW/2,y:a.h/2-(maxW*ratio)/2,w:maxW,h:maxW*ratio,rotation:0,opacity:1,src:fr.result};a.objects.push(o);project.selectedObjectId=o.id;renderAll();};img.src=fr.result;};fr.readAsDataURL(file);e.target.value=''; });

  $('#exportBtn').onclick=()=>{ const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${(project.name||'Colorize-Design').replace(/\s+/g,'-')}.colorize.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500); };
  $('#importInput').addEventListener('change',e=>{ const f=e.target.files?.[0];if(!f)return;const fr=new FileReader();fr.onload=()=>{try{const p=JSON.parse(fr.result);if(!Array.isArray(p.artboards))throw new Error();project=p;renderAll();fitArtboard();}catch(_){alert('Не удалось открыть проект');}};fr.readAsText(f);e.target.value=''; });
  $('#newProjectBtn').onclick=()=>{ if(confirm('Создать новый проект? Текущий проект останется только если он сохранён/экспортирован.')){project=defaultProject();renderAll();fitArtboard();} };

  window.addEventListener('keydown',e=>{
    if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='s'){e.preventDefault();save();}
    if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='d'){e.preventDefault();duplicateSelected();}
    if (e.key==='Delete'||e.key==='Backspace') { const tag=document.activeElement?.tagName;if(tag==='INPUT'||tag==='TEXTAREA')return;const a=activeArtboard();if(project.selectedObjectId&&a){a.objects=a.objects.filter(o=>o.id!==project.selectedObjectId);project.selectedObjectId=null;renderAll();} }
    if (e.key===' ') setTool('pan');
  });
  window.addEventListener('keyup',e=>{if(e.key===' ')setTool('select')});

  $$('.mode').forEach(x=>x.classList.toggle('active',x.dataset.mode===project.mode));
  renderAll();
  requestAnimationFrame(()=>fitArtboard());
})();
