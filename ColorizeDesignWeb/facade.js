const STORAGE_KEY='colorize-facade-scan-v06';
const $=(s,r=document)=>r.querySelector(s);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

const state={
  open:false, image:null, imageSrc:null, quad:null, dragIndex:-1, mode:'adjust',
  calibPoints:[], measurePoints:[], mmPerPlanePx:null, referenceMM:1000,
  planeW:1000, planeH:700, HimgToPlane:null, HplaneToImg:null, showGrid:true,
  sign:{enabled:false,text:'COLORIZE',color:'#111827',font:'Arial Black',weight:'800',ratio:4.2,widthMM:3000,cx:null,cy:null},
  info:'Загрузите фото фасада или используйте фото из проекта.'
};

function loadPrefs(){
  try{
    const p=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(!p)return;
    state.referenceMM=Number(p.referenceMM)||1000;
    state.showGrid=p.showGrid!==false;
    if(p.sign)Object.assign(state.sign,p.sign,{enabled:false,cx:null,cy:null});
  }catch{}
}
function savePrefs(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify({referenceMM:state.referenceMM,showGrid:state.showGrid,sign:{text:state.sign.text,color:state.sign.color,font:state.sign.font,weight:state.sign.weight,ratio:state.sign.ratio,widthMM:state.sign.widthMM}}))}catch{}
}
loadPrefs();

function injectUI(){
  const top=$('.top-actions');
  if(top&&!$('#facadeScanBtn')){
    const b=document.createElement('button');b.id='facadeScanBtn';b.textContent='Facade Scan';
    top.insertBefore(b,$('#saveBtn'));
    b.onclick=toggleWorkspace;
  }
  const viewport=$('#viewport');if(!viewport||$('#facadeScanWorkspace'))return;
  const root=document.createElement('div');root.id='facadeScanWorkspace';root.className='facade-scan hidden';
  root.innerHTML=`
    <canvas id="facadeScanCanvas"></canvas>
    <div class="facade-scan-panel">
      <div class="facade-scan-head"><strong>Facade Scan</strong><button id="facadeClose">×</button></div>
      <div class="facade-scan-actions">
        <label class="facade-file">Фото фасада<input id="facadeFile" type="file" accept="image/*" hidden></label>
        <button id="facadeUseProject">Фото из проекта</button>
        <button id="facadeAuto">Автоанализ</button>
      </div>
      <div class="facade-step"><b>1. Плоскость фасада</b><span>Перетащите 4 точки по углам плоскости вывески.</span><button id="facadeAdjust" class="active">4 точки</button></div>
      <div class="facade-step"><b>2. Реальный размер</b><span>Отметьте 2 точки на объекте известного размера.</span><div class="facade-inline"><input id="facadeRefMM" type="number" min="1" step="1"><span>мм</span><button id="facadeCalibrate">Калибровка</button></div><button id="facadeApplyScale">Применить размер</button></div>
      <div class="facade-step"><b>3. Измерение</b><div class="facade-inline"><button id="facadeMeasure">Измерить</button><button id="facadeGrid">Сетка ON</button></div><div id="facadeSizeReadout" class="facade-readout">Масштаб не задан</div></div>
      <div class="facade-step"><b>4. Вывеска</b><span>Берём выбранную надпись и ставим её в правильную перспективу.</span><div class="facade-inline"><input id="facadeSignWidth" type="number" min="10" step="10"><span>мм</span></div><div class="facade-inline"><button id="facadeCopySign">Из выбранного текста</button><button id="facadePlaceSign">Поставить</button></div></div>
      <div id="facadeInfo" class="facade-info"></div>
    </div>`;
  viewport.appendChild(root);
  bindUI();
}

function bindUI(){
  const canvas=$('#facadeScanCanvas');
  $('#facadeClose').onclick=()=>setOpen(false);
  $('#facadeFile').onchange=e=>{const f=e.target.files?.[0];if(!f)return;const fr=new FileReader();fr.onload=()=>loadImage(fr.result);fr.readAsDataURL(f);e.target.value=''};
  $('#facadeUseProject').onclick=useProjectImage;
  $('#facadeAuto').onclick=autoAnalyze;
  $('#facadeAdjust').onclick=()=>setMode('adjust');
  $('#facadeCalibrate').onclick=()=>{state.calibPoints=[];setMode('calibrate');state.info='Коснитесь двух точек известного размера на фасаде.';draw()};
  $('#facadeApplyScale').onclick=applyReferenceScale;
  $('#facadeMeasure').onclick=()=>{state.measurePoints=[];setMode('measure');state.info='Коснитесь двух точек — покажу расстояние с учётом перспективы.';draw()};
  $('#facadeGrid').onclick=()=>{state.showGrid=!state.showGrid;savePrefs();syncUI();draw()};
  $('#facadeCopySign').onclick=copySelectedSign;
  $('#facadePlaceSign').onclick=()=>{if(!state.mmPerPlanePx){state.info='Сначала задайте реальный масштаб фасада.';draw();return}state.sign.enabled=true;setMode('place');state.info='Коснитесь фасада, куда поставить центр вывески.';draw()};
  $('#facadeRefMM').oninput=e=>{state.referenceMM=Math.max(1,Number(e.target.value)||1);savePrefs()};
  $('#facadeSignWidth').oninput=e=>{state.sign.widthMM=Math.max(10,Number(e.target.value)||10);savePrefs();draw()};
  canvas.addEventListener('pointerdown',onPointerDown);
  canvas.addEventListener('pointermove',onPointerMove);
  canvas.addEventListener('pointerup',onPointerUp);
  canvas.addEventListener('pointercancel',onPointerUp);
  new ResizeObserver(()=>resizeCanvas()).observe($('#viewport'));
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.open)setOpen(false)});
  document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.mode==='view3d'&&state.open)setOpen(false)}));
  syncUI();resizeCanvas();
}

function toggleWorkspace(){setOpen(!state.open)}
function setOpen(v){
  state.open=!!v;$('#facadeScanWorkspace')?.classList.toggle('hidden',!state.open);$('#facadeScanBtn')?.classList.toggle('active',state.open);
  if(state.open&&!state.image)useProjectImage(true);
  resizeCanvas();draw();
}
function setMode(m){state.mode=m;['facadeAdjust','facadeCalibrate','facadeMeasure','facadePlaceSign'].forEach(id=>$('#'+id)?.classList.remove('active'));const map={adjust:'facadeAdjust',calibrate:'facadeCalibrate',measure:'facadeMeasure',place:'facadePlaceSign'};$('#'+map[m])?.classList.add('active');draw()}
function syncUI(){
  if($('#facadeRefMM'))$('#facadeRefMM').value=String(Math.round(state.referenceMM));
  if($('#facadeSignWidth'))$('#facadeSignWidth').value=String(Math.round(state.sign.widthMM));
  if($('#facadeGrid'))$('#facadeGrid').textContent=state.showGrid?'Сетка ON':'Сетка OFF';
  const out=$('#facadeSizeReadout');if(out){if(state.mmPerPlanePx)out.textContent=`Плоскость ≈ ${fmtMM(state.planeW*state.mmPerPlanePx)} × ${fmtMM(state.planeH*state.mmPerPlanePx)}`;else out.textContent='Масштаб не задан'}
  if($('#facadeInfo'))$('#facadeInfo').textContent=state.info||'';
}
function fmtMM(mm){return mm>=1000?`${(mm/1000).toFixed(2)} м`:`${Math.round(mm)} мм`}

function resizeCanvas(){const c=$('#facadeScanCanvas'),v=$('#viewport');if(!c||!v)return;const r=v.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);c.width=Math.max(1,Math.round(r.width*d));c.height=Math.max(1,Math.round(r.height*d));c.style.width=r.width+'px';c.style.height=r.height+'px';draw()}
function canvasCtx(){const c=$('#facadeScanCanvas');if(!c)return null;const d=c.width/Math.max(1,c.clientWidth);const ctx=c.getContext('2d');ctx.setTransform(d,0,0,d,0,0);return ctx}
function imageFit(){const c=$('#facadeScanCanvas');if(!c||!state.image)return null;const cw=c.clientWidth,ch=c.clientHeight,iw=state.image.naturalWidth,ih=state.image.naturalHeight,s=Math.min(cw/iw,ch/ih);return {s,x:(cw-iw*s)/2,y:(ch-ih*s)/2,w:iw*s,h:ih*s}}
function imageToCanvas(p){const f=imageFit();return f?{x:f.x+p.x*f.s,y:f.y+p.y*f.s}:{x:0,y:0}}
function canvasToImage(x,y){const f=imageFit();return f?{x:clamp((x-f.x)/f.s,0,state.image.naturalWidth),y:clamp((y-f.y)/f.s,0,state.image.naturalHeight)}:{x:0,y:0}}

function loadImage(src){
  const img=new Image();img.onload=()=>{state.image=img;state.imageSrc=src;state.mmPerPlanePx=null;state.calibPoints=[];state.measurePoints=[];state.sign.cx=null;state.sign.cy=null;defaultQuad();recomputeHomography();state.info='Фото загружено. Нажмите «Автоанализ» или поправьте 4 точки вручную.';syncUI();draw()};img.onerror=()=>{state.info='Не удалось открыть изображение.';syncUI()};img.src=src;
}
function useProjectImage(silent=false){
  const img=$('.artboard.active .obj.image img')||$('.artboard .obj.image img');
  if(img?.src){loadImage(img.src);return true}
  if(!silent){state.info='На текущем Artboard нет фотографии. Нажмите «Фото фасада».';syncUI();draw()}return false;
}
function defaultQuad(){if(!state.image)return;const w=state.image.naturalWidth,h=state.image.naturalHeight,mx=w*.08,my=h*.08;state.quad=[{x:mx,y:my},{x:w-mx,y:my},{x:w-mx,y:h-my},{x:mx,y:h-my}]}

function draw(){
  const ctx=canvasCtx(),c=$('#facadeScanCanvas');if(!ctx||!c)return;ctx.clearRect(0,0,c.clientWidth,c.clientHeight);
  if(!state.open){return}syncUI();
  if(!state.image){ctx.fillStyle='rgba(255,255,255,.55)';ctx.font='15px -apple-system,sans-serif';ctx.textAlign='center';ctx.fillText('Загрузите фото фасада',c.clientWidth/2,c.clientHeight/2);return}
  const f=imageFit();ctx.drawImage(state.image,f.x,f.y,f.w,f.h);
  ctx.fillStyle='rgba(0,0,0,.28)';ctx.fillRect(0,0,c.clientWidth,c.clientHeight);
  const q=state.quad.map(imageToCanvas);
  ctx.save();ctx.beginPath();q.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.clip();ctx.drawImage(state.image,f.x,f.y,f.w,f.h);ctx.restore();
  if(state.showGrid)drawPerspectiveGrid(ctx);
  drawQuad(ctx,q);drawCalibration(ctx);drawMeasurement(ctx);if(state.sign.enabled)drawWarpedSign(ctx);
}
function drawQuad(ctx,q){ctx.save();ctx.strokeStyle='#0a84ff';ctx.lineWidth=2;ctx.beginPath();q.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();q.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,9,0,Math.PI*2);ctx.fillStyle=i===state.dragIndex?'#fff':'#0a84ff';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke()});ctx.restore()}
function drawPerspectiveGrid(ctx){if(!state.HplaneToImg)return;ctx.save();ctx.strokeStyle='rgba(10,132,255,.48)';ctx.lineWidth=1;const n=8;for(let i=1;i<n;i++){const u=state.planeW*i/n,a=imageToCanvas(applyH(state.HplaneToImg,{x:u,y:0})),b=imageToCanvas(applyH(state.HplaneToImg,{x:u,y:state.planeH}));ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}for(let i=1;i<n;i++){const v=state.planeH*i/n,a=imageToCanvas(applyH(state.HplaneToImg,{x:0,y:v})),b=imageToCanvas(applyH(state.HplaneToImg,{x:state.planeW,y:v}));ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}ctx.restore()}
function drawLinePoints(ctx,pts,color,label){if(!pts.length)return;ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;const cp=pts.map(imageToCanvas);cp.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fill()});if(cp.length===2){ctx.beginPath();ctx.moveTo(cp[0].x,cp[0].y);ctx.lineTo(cp[1].x,cp[1].y);ctx.stroke();if(label){const mx=(cp[0].x+cp[1].x)/2,my=(cp[0].y+cp[1].y)/2;ctx.font='600 13px -apple-system,sans-serif';const w=ctx.measureText(label).width+14;ctx.fillStyle='rgba(17,19,23,.92)';ctx.fillRect(mx-w/2,my-24,w,21);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(label,mx,my-9)}}ctx.restore()}
function drawCalibration(ctx){let label='';if(state.calibPoints.length===2&&state.mmPerPlanePx)label=`Эталон ${fmtMM(state.referenceMM)}`;drawLinePoints(ctx,state.calibPoints,'#ffd60a',label)}
function drawMeasurement(ctx){let label='';if(state.measurePoints.length===2&&state.mmPerPlanePx){const d=planeDistance(state.measurePoints[0],state.measurePoints[1])*state.mmPerPlanePx;label=fmtMM(d)}drawLinePoints(ctx,state.measurePoints,'#30d158',label)}

function onPointerDown(e){if(!state.open||!state.image)return;const r=e.currentTarget.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,p=canvasToImage(x,y);if(state.mode==='adjust'){const q=state.quad.map(imageToCanvas);let best=-1,bd=22;for(let i=0;i<4;i++){const d=Math.hypot(q[i].x-x,q[i].y-y);if(d<bd){bd=d;best=i}}state.dragIndex=best;if(best>=0)e.currentTarget.setPointerCapture?.(e.pointerId)}else if(state.mode==='calibrate'){state.calibPoints.push(p);if(state.calibPoints.length>2)state.calibPoints=[p];if(state.calibPoints.length===2)state.info='Введите реальный размер и нажмите «Применить размер».';draw()}else if(state.mode==='measure'){state.measurePoints.push(p);if(state.measurePoints.length>2)state.measurePoints=[p];if(state.measurePoints.length===2&&state.mmPerPlanePx){const d=planeDistance(...state.measurePoints)*state.mmPerPlanePx;state.info=`Измерение: ${fmtMM(d)}`;}draw()}else if(state.mode==='place'){const pp=applyH(state.HimgToPlane,p);state.sign.cx=clamp(pp.x,0,state.planeW);state.sign.cy=clamp(pp.y,0,state.planeH);state.info=`Вывеска ${fmtMM(state.sign.widthMM)} установлена в перспективе фасада.`;draw()}}
function onPointerMove(e){if(state.mode!=='adjust'||state.dragIndex<0||!state.image)return;const r=e.currentTarget.getBoundingClientRect(),p=canvasToImage(e.clientX-r.left,e.clientY-r.top);state.quad[state.dragIndex]=p;recomputeHomography();draw()}
function onPointerUp(){state.dragIndex=-1;draw()}

function applyReferenceScale(){if(state.calibPoints.length!==2){state.info='Сначала отметьте две точки эталонного размера.';draw();return}const d=planeDistance(state.calibPoints[0],state.calibPoints[1]);if(d<1){state.info='Точки слишком близко.';draw();return}state.mmPerPlanePx=state.referenceMM/d;state.info=`Масштаб рассчитан. Плоскость ≈ ${fmtMM(state.planeW*state.mmPerPlanePx)} × ${fmtMM(state.planeH*state.mmPerPlanePx)}.`;syncUI();draw()}
function planeDistance(a,b){const p1=applyH(state.HimgToPlane,a),p2=applyH(state.HimgToPlane,b);return Math.hypot(p2.x-p1.x,p2.y-p1.y)}

function copySelectedSign(){
  const node=$('.artboard.active .obj.selected')||$('.artboard.active .obj.text')||$('.artboard .obj.text');if(!node){state.info='Не нашёл текст на Artboard.';draw();return}
  const cs=getComputedStyle(node),r=node.getBoundingClientRect();state.sign.text=(node.dataset.text||node.textContent||'COLORIZE').trim();state.sign.color=cs.color&&cs.color!=='rgba(0, 0, 0, 0)'?rgbToHex(cs.color):'#111827';state.sign.font=cs.fontFamily||'Arial Black';state.sign.weight=cs.fontWeight||'800';state.sign.ratio=Math.max(.5,r.width/Math.max(1,r.height));state.sign.enabled=true;if(state.sign.cx==null){state.sign.cx=state.planeW/2;state.sign.cy=state.planeH/2}state.info=`Надпись «${state.sign.text}» готова. Укажите ширину и нажмите «Поставить».`;savePrefs();draw()}
function rgbToHex(rgb){const m=rgb.match(/\d+(?:\.\d+)?/g);if(!m||m.length<3)return '#111827';return '#'+m.slice(0,3).map(v=>clamp(Math.round(Number(v)),0,255).toString(16).padStart(2,'0')).join('')}

function drawWarpedSign(ctx){
  if(!state.HplaneToImg||state.sign.cx==null||!state.mmPerPlanePx)return;
  const widthPlane=state.sign.widthMM/state.mmPerPlanePx,heightPlane=widthPlane/Math.max(.5,state.sign.ratio);
  const x0=state.sign.cx-widthPlane/2,y0=state.sign.cy-heightPlane/2;
  const src=document.createElement('canvas');src.width=1200;src.height=Math.max(120,Math.round(1200/Math.max(.5,state.sign.ratio)));const sctx=src.getContext('2d');sctx.clearRect(0,0,src.width,src.height);sctx.fillStyle=state.sign.color;sctx.textAlign='center';sctx.textBaseline='middle';sctx.font=`${state.sign.weight} ${Math.round(src.height*.72)}px ${state.sign.font}`;sctx.shadowColor='rgba(0,0,0,.32)';sctx.shadowBlur=10;sctx.shadowOffsetX=5;sctx.shadowOffsetY=7;sctx.fillText(state.sign.text,src.width/2,src.height/2);
  const strips=24;for(let i=0;i<strips;i++){const t0=i/strips,t1=(i+1)/strips,px0=x0+widthPlane*t0,px1=x0+widthPlane*t1;const a=imageToCanvas(applyH(state.HplaneToImg,{x:px0,y:y0})),b=imageToCanvas(applyH(state.HplaneToImg,{x:px1,y:y0})),c=imageToCanvas(applyH(state.HplaneToImg,{x:px1,y:y0+heightPlane})),d=imageToCanvas(applyH(state.HplaneToImg,{x:px0,y:y0+heightPlane}));const sx0=src.width*t0,sx1=src.width*t1;drawImageTriangle(ctx,src,[{x:sx0,y:0},{x:sx1,y:0},{x:sx1,y:src.height}],[a,b,c]);drawImageTriangle(ctx,src,[{x:sx0,y:0},{x:sx1,y:src.height},{x:sx0,y:src.height}],[a,c,d])}
}
function drawImageTriangle(ctx,img,s,d){
  const [s0,s1,s2]=s,[d0,d1,d2]=d;const den=s0.x*(s1.y-s2.y)+s1.x*(s2.y-s0.y)+s2.x*(s0.y-s1.y);if(Math.abs(den)<1e-6)return;
  const a=(d0.x*(s1.y-s2.y)+d1.x*(s2.y-s0.y)+d2.x*(s0.y-s1.y))/den;
  const c=(d0.x*(s2.x-s1.x)+d1.x*(s0.x-s2.x)+d2.x*(s1.x-s0.x))/den;
  const e=(d0.x*(s1.x*s2.y-s2.x*s1.y)+d1.x*(s2.x*s0.y-s0.x*s2.y)+d2.x*(s0.x*s1.y-s1.x*s0.y))/den;
  const b=(d0.y*(s1.y-s2.y)+d1.y*(s2.y-s0.y)+d2.y*(s0.y-s1.y))/den;
  const dd=(d0.y*(s2.x-s1.x)+d1.y*(s0.x-s2.x)+d2.y*(s1.x-s0.x))/den;
  const f=(d0.y*(s1.x*s2.y-s2.x*s1.y)+d1.y*(s2.x*s0.y-s0.x*s2.y)+d2.y*(s0.x*s1.y-s1.x*s0.y))/den;
  ctx.save();ctx.beginPath();ctx.moveTo(d0.x,d0.y);ctx.lineTo(d1.x,d1.y);ctx.lineTo(d2.x,d2.y);ctx.closePath();ctx.clip();ctx.transform(a,b,c,dd,e,f);ctx.drawImage(img,0,0);ctx.restore();
}

function recomputeHomography(){if(!state.quad)return;const [q0,q1,q2,q3]=state.quad;state.planeW=Math.max(100,(Math.hypot(q1.x-q0.x,q1.y-q0.y)+Math.hypot(q2.x-q3.x,q2.y-q3.y))/2);state.planeH=Math.max(100,(Math.hypot(q3.x-q0.x,q3.y-q0.y)+Math.hypot(q2.x-q1.x,q2.y-q1.y))/2);const plane=[{x:0,y:0},{x:state.planeW,y:0},{x:state.planeW,y:state.planeH},{x:0,y:state.planeH}];state.HimgToPlane=homography(state.quad,plane);state.HplaneToImg=homography(plane,state.quad)}
function homography(src,dst){const A=[],B=[];for(let i=0;i<4;i++){const u=src[i].x,v=src[i].y,x=dst[i].x,y=dst[i].y;A.push([u,v,1,0,0,0,-u*x,-v*x]);B.push(x);A.push([0,0,0,u,v,1,-u*y,-v*y]);B.push(y)}const h=solve(A,B);return h?[h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1]:[1,0,0,0,1,0,0,0,1]}
function solve(A,b){const n=b.length,M=A.map((r,i)=>[...r,b[i]]);for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;if(Math.abs(M[p][c])<1e-10)return null;[M[c],M[p]]=[M[p],M[c]];const div=M[c][c];for(let j=c;j<=n;j++)M[c][j]/=div;for(let r=0;r<n;r++){if(r===c)continue;const k=M[r][c];for(let j=c;j<=n;j++)M[r][j]-=k*M[c][j]}}return M.map(r=>r[n])}
function applyH(H,p){if(!H)return p;const d=H[6]*p.x+H[7]*p.y+H[8];return {x:(H[0]*p.x+H[1]*p.y+H[2])/d,y:(H[3]*p.x+H[4]*p.y+H[5])/d}}

function autoAnalyze(){
  if(!state.image){state.info='Сначала загрузите фотографию.';draw();return}
  state.info='Анализируем основные линии фасада…';draw();setTimeout(()=>{
    try{const q=detectFacadeQuad(state.image);if(q){state.quad=q;recomputeHomography();state.info='Плоскость найдена приблизительно. Если нужно — подвиньте 4 синие точки по фасаду.'}else{defaultQuad();recomputeHomography();state.info='Автоанализ не нашёл уверенные линии. Я поставил стартовую рамку — поправьте 4 точки вручную.'}}catch{defaultQuad();recomputeHomography();state.info='Автоанализ не смог определить плоскость. Поправьте 4 точки вручную.'}draw()},40)
}
function detectFacadeQuad(img){
  const max=320,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(80,Math.round(img.naturalWidth*scale)),h=Math.max(80,Math.round(img.naturalHeight*scale));const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);const data=ctx.getImageData(0,0,w,h).data,g=new Float32Array(w*h);for(let i=0;i<w*h;i++){const k=i*4;g[i]=.299*data[k]+.587*data[k+1]+.114*data[k+2]}
  const gx=new Float32Array(w*h),gy=new Float32Array(w*h);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;gx[i]=-g[i-w-1]-2*g[i-1]-g[i+w-1]+g[i-w+1]+2*g[i+1]+g[i+w+1];gy[i]=-g[i-w-1]-2*g[i-w]-g[i-w+1]+g[i+w-1]+2*g[i+w]+g[i+w+1]}
  const top=sampleHorizontal(0.05,0.45),bottom=sampleHorizontal(0.55,0.95),left=sampleVertical(0.04,0.45),right=sampleVertical(0.55,0.96);if(!top||!bottom||!left||!right)return null;
  const tl=intersectYX(top,left),tr=intersectYX(top,right),br=intersectYX(bottom,right),bl=intersectYX(bottom,left);if(!tl||!tr||!br||!bl)return null;const pts=[tl,tr,br,bl].map(p=>({x:clamp(p.x/scale,0,img.naturalWidth),y:clamp(p.y/scale,0,img.naturalHeight)}));const area=Math.abs(polyArea(pts));if(area<img.naturalWidth*img.naturalHeight*.08)return null;return pts;
  function sampleHorizontal(ya,yb){const pts=[];for(let x=2;x<w-2;x+=3){let best=null,bs=0;for(let y=Math.floor(h*ya);y<Math.floor(h*yb);y++){const s=Math.abs(gy[y*w+x]);if(s>bs){bs=s;best={x,y,w:bs}}}if(best&&bs>45)pts.push(best)}return weightedFit(pts,'y')}
  function sampleVertical(xa,xb){const pts=[];for(let y=2;y<h-2;y+=3){let best=null,bs=0;for(let x=Math.floor(w*xa);x<Math.floor(w*xb);x++){const s=Math.abs(gx[y*w+x]);if(s>bs){bs=s;best={x,y,w:bs}}}if(best&&bs>45)pts.push(best)}return weightedFit(pts,'x')}
}
function weightedFit(pts,dep){if(pts.length<8)return null;let sw=0,sx=0,sy=0,sxx=0,sxy=0;for(const p of pts){const X=dep==='y'?p.x:p.y,Y=dep==='y'?p.y:p.x,w=p.w||1;sw+=w;sx+=w*X;sy+=w*Y;sxx+=w*X*X;sxy+=w*X*Y}const den=sw*sxx-sx*sx;if(Math.abs(den)<1e-6)return null;const a=(sw*sxy-sx*sy)/den,b=(sy-a*sx)/sw;return {a,b,dep}}
function intersectYX(yLine,xLine){const den=1-xLine.a*yLine.a;if(Math.abs(den)<1e-6)return null;const x=(xLine.a*yLine.b+xLine.b)/den;return {x,y:yLine.a*x+yLine.b}}
function polyArea(p){let a=0;for(let i=0;i<p.length;i++){const j=(i+1)%p.length;a+=p[i].x*p[j].y-p[j].x*p[i].y}return a/2}

injectUI();
