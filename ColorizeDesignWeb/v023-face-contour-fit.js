import * as THREE from 'three';

// v0.23.0 — exact front-face contour fit.
// The visible front face is rebuilt from the same non-bevelled contour used by
// the rear panel. This guarantees that face / returns / back share one XY
// outline and prevents the front acrylic from protruding beyond the returns.
const STORE_KEYS=['colorize-design-web-v04','colorize-design-web-v03','colorize-design-web-v02','colorize-design-web-v01'];
let debug={version:'0.23.0',corrected:0,objects:0,maxDelta:0,last:null,lastFrame:0};

function readProject(){
  for(const key of STORE_KEYS){
    try{const raw=localStorage.getItem(key);if(raw)return JSON.parse(raw)}catch{}
  }
  return null;
}
function activeArtboard(p){return p?.artboards?.find(a=>a.id===p.activeArtboardId)||p?.artboards?.[0]||null}
function bounds(g){
  g?.computeBoundingBox?.();const b=g?.boundingBox;
  if(!b)return null;
  return {minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y,minZ:b.min.z,maxZ:b.max.z,w:b.max.x-b.min.x,h:b.max.y-b.min.y,d:b.max.z-b.min.z};
}
function sameXY(a,b,tol=1e-5){
  if(!a||!b)return false;
  return Math.max(Math.abs(a.minX-b.minX),Math.abs(a.maxX-b.maxX),Math.abs(a.minY-b.minY),Math.abs(a.maxY-b.maxY))<=tol;
}
function deltaXY(a,b){
  if(!a||!b)return Infinity;
  return Math.max(Math.abs(a.minX-b.minX),Math.abs(a.maxX-b.maxX),Math.abs(a.minY-b.minY),Math.abs(a.maxY-b.maxY));
}
function objectMap(){
  const p=readProject(),a=activeArtboard(p),m=new Map();
  for(const o of (a?.objects||[]))if(o?.id)m.set(o.id,o);
  return m;
}
function rebuildFace(group,o){
  const face=group.children.find(x=>x.userData?.part19==='face');
  const returns=group.children.find(x=>x.userData?.part19==='returns');
  const back=group.children.find(x=>x.userData?.part19==='back');
  if(!face?.geometry||!returns?.geometry||!back?.geometry)return false;

  const rb=bounds(returns.geometry),bb=bounds(back.geometry),fb=bounds(face.geometry);
  if(!rb||!bb||!fb)return false;
  const faceT=Math.max(.012,Math.min(.55,(Number(o?.faceThickness)||3)/45));
  const stamp=`${back.geometry.uuid}:${returns.geometry.uuid}:${faceT.toFixed(6)}`;
  if(face.userData?.faceContourFit23===stamp&&sameXY(bounds(face.geometry),bb,2e-5))return false;

  // Clone the exact, non-bevelled back contour and move it to the front.
  // Only Z is remapped; X/Y vertices remain byte-for-byte on the same outline.
  const g=back.geometry.clone();
  const gb=bounds(g),pos=g.getAttribute?.('position');
  if(!gb||!pos){g.dispose?.();return false}
  const srcD=Math.max(1e-9,gb.d);
  const frontZ=rb.maxZ+.001;
  for(let i=0;i<pos.count;i++){
    const t=(pos.getZ(i)-gb.minZ)/srcD;
    pos.setZ(i,frontZ+t*faceT);
  }
  pos.needsUpdate=true;
  g.computeBoundingBox?.();g.computeBoundingSphere?.();

  face.geometry.dispose?.();face.geometry=g;
  face.position.set(0,0,0);face.scale.set(1,1,1);
  face.userData.faceContourFit23=stamp;
  face.userData.exactSharedContour=true;

  const nf=bounds(face.geometry),nr=bounds(returns.geometry),nb=bounds(back.geometry);
  const d=Math.max(deltaXY(nf,nr),deltaXY(nf,nb));
  debug.corrected++;
  debug.maxDelta=Math.max(debug.maxDelta,Number.isFinite(d)?d:0);
  debug.last={objectId:group.userData?.objectId||null,faceW:nf?.w||0,faceH:nf?.h||0,returnsW:nr?.w||0,returnsH:nr?.h||0,backW:nb?.w||0,backH:nb?.h||0,delta:Number.isFinite(d)?d:null};
  return true;
}
function apply(scene){
  if(!scene)return;
  const objects=objectMap();let count=0,max=0;
  scene.traverse?.(x=>{
    if(!x.userData?.colorizeSeparateParts19)return;
    count++;
    const o=objects.get(x.userData.objectId);
    rebuildFace(x,o);
    const f=x.children.find(c=>c.userData?.part19==='face'),r=x.children.find(c=>c.userData?.part19==='returns'),b=x.children.find(c=>c.userData?.part19==='back');
    if(f&&r&&b){const d=Math.max(deltaXY(bounds(f.geometry),bounds(r.geometry)),deltaXY(bounds(f.geometry),bounds(b.geometry)));if(Number.isFinite(d))max=Math.max(max,d)}
  });
  debug.objects=count;debug.maxDelta=max;debug.lastFrame=performance.now();
}

const previous=globalThis.__colorizeBeforeThreeRender;
globalThis.__colorizeBeforeThreeRender=(renderer,scene,camera)=>{previous?.(renderer,scene,camera);apply(scene)};

globalThis.__colorizeFaceContour23Debug=()=>structuredClone(debug);
