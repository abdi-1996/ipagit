import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// v0.18 visual-quality pass.
// Keeps the existing 2D/3D geometry pipeline, but removes construction/debug
// seams from the customer render, smooths curved returns and reduces z-fighting.
const tunedGeometry=new WeakSet();
const tunedMaterial=new WeakSet();
const tunedRenderer=new WeakSet();
let debug={version:'0.18.0',seamsHidden:0,smoothed:0,materials:0,pixelRatio:0,lastFrame:0};

function smoothGeometry(geometry,angle=Math.PI/3){
  if(!geometry||tunedGeometry.has(geometry)||!geometry.getAttribute?.('position'))return;
  try{
    toCreasedNormals(geometry,angle);
    geometry.normalizeNormals?.();
    geometry.computeBoundingBox?.();
    geometry.computeBoundingSphere?.();
    tunedGeometry.add(geometry);
    debug.smoothed++;
  }catch{}
}

function tuneMaterial(material,part){
  if(!material||tunedMaterial.has(material))return;
  try{
    material.flatShading=false;
    if(part==='face'){
      material.polygonOffset=true;
      material.polygonOffsetFactor=-2;
      material.polygonOffsetUnits=-2;
    }else if(part==='faceEdge'||part==='trim'){
      material.polygonOffset=true;
      material.polygonOffsetFactor=-1;
      material.polygonOffsetUnits=-1;
    }
    if(material.isMeshPhysicalMaterial||material.isMeshStandardMaterial){
      material.dithering=true;
    }
    material.needsUpdate=true;
    tunedMaterial.add(material);
    debug.materials++;
  }catch{}
}

function tuneRenderer(renderer){
  if(!renderer||tunedRenderer.has(renderer))return;
  try{
    const dpr=Math.min(window.devicePixelRatio||1,2.35);
    renderer.setPixelRatio?.(dpr);
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    if(renderer.domElement){
      renderer.domElement.style.imageRendering='auto';
      renderer.domElement.style.transform='translateZ(0)';
    }
    tunedRenderer.add(renderer);
    debug.pixelRatio=dpr;
  }catch{}
}

function applyQuality(renderer,scene){
  tuneRenderer(renderer);
  if(!scene)return;
  scene.traverse?.(obj=>{
    const part=obj.userData?.part15;

    // Technical seam lines are useful for construction diagnostics but should
    // never appear as white scratches in the normal 3D visualization.
    if(part==='seam'){
      if(obj.visible!==false)debug.seamsHidden++;
      obj.visible=false;
      if(obj.material){obj.material.transparent=true;obj.material.opacity=0;obj.material.depthWrite=false}
      return;
    }

    // Returns and rounded face edges need smooth shading across neighbouring
    // curve segments while 90° construction corners remain hard.
    if(obj.isMesh&&(part==='return'||part==='faceEdge'))smoothGeometry(obj.geometry,Math.PI/3);

    if(obj.isMesh&&part){
      const mats=Array.isArray(obj.material)?obj.material:[obj.material];
      mats.filter(Boolean).forEach(m=>tuneMaterial(m,part));
    }
  });
  debug.lastFrame=performance.now();
}

const previous=globalThis.__colorizeBeforeThreeRender;
globalThis.__colorizeBeforeThreeRender=(renderer,scene,camera)=>{
  previous?.(renderer,scene,camera);
  applyQuality(renderer,scene,camera);
};

// Entering 3D should start from the same composition framing as 2D instead of
// restoring an accidentally zoomed-in camera from an earlier editing session.
let wasVisible=false;
let fitTimer=0;
function sync3DEntry(){
  const host=document.getElementById('threeHost');
  if(!host)return;
  const visible=!host.hidden;
  if(visible&&!wasVisible){
    clearTimeout(fitTimer);
    fitTimer=setTimeout(()=>{
      const reset=document.getElementById('reset3dBtn');
      if(reset&&!host.hidden)reset.click();
    },120);
  }
  wasVisible=visible;
}

window.addEventListener('DOMContentLoaded',()=>{
  const host=document.getElementById('threeHost');
  if(host)new MutationObserver(sync3DEntry).observe(host,{attributes:true,attributeFilter:['hidden','class','style']});
  sync3DEntry();
});

globalThis.__colorizeGeometryQuality18Debug=()=>structuredClone(debug);
