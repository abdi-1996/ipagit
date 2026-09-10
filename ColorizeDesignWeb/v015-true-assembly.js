import * as THREE from 'three';

const PROJECT_KEYS=['colorize-design-web-v04','colorize-design-web-v03','colorize-design-web-v02','colorize-design-web-v01'];
const ASSEMBLY_KEY='colorize-assembled-v014';
let debug={version:'0.15.0',objects:0,parts:0,zFightingGuard:true,lastObject:null};
let lastRenderer=null,lastScene=null,lastCamera=null;

function readProject(){for(const k of PROJECT_KEYS){try{const r=localStorage.getItem(k);if(r)return JSON.parse(r)}catch{}}return null}
function readAssembly(){try{return JSON.parse(localStorage.getItem(ASSEMBLY_KEY)||'{}')}catch{return {}}}
function configFor(o){
  const s=readAssembly();const d={assemblyType:o?.lightMode==='both'?'faceHalo':o?.lightMode==='halo'?'halo':o?.lightMode==='face'?'faceLit':'nonLit',acrylicLook:'milk',returnFinish:'matte',backFinish:'matte',externalBacking:'none',backingFinish:'matte',backingColor:'#ffffff',edgeStyle:'trimcap',jointSeam:true};
  return {...d,...(s.current||{}),...(s.byObject?.[o?.id]||{})};
}
function info(){const p=readProject();const a=p?.artboards?.find(x=>x.id===p.activeArtboardId)||p?.artboards?.[0];return {texts:a?.objects?.filter(x=>x.type==='text')||[]}}
function col(v,f='#ffffff'){try{return new THREE.Color(v||f)}catch{return new THREE.Color(f)}}
function envStrength(mult=1){try{const l=JSON.parse(localStorage.getItem('colorize-lighting-v013')||'{}');return (l.mode==='hdr'?Math.max(.15,Number(l.hdr?.intensity)||1.25):.42)*mult}catch{return .42*mult}}

function pvcMaterial(color,finish='matte'){
  const m=new THREE.MeshPhysicalMaterial({color:col(color),metalness:0,transmission:0,ior:1.47,specularIntensity:.55});
  if(finish==='gloss'){m.roughness=.16;m.clearcoat=.78;m.clearcoatRoughness=.075;m.envMapIntensity=envStrength(1.05)}
  else if(finish==='satin'){m.roughness=.43;m.clearcoat=.30;m.clearcoatRoughness=.26;m.envMapIntensity=envStrength(.72)}
  else if(finish==='factory'){m.roughness=.64;m.clearcoat=.09;m.clearcoatRoughness=.42;m.envMapIntensity=envStrength(.44)}
  else{m.roughness=.79;m.clearcoat=.035;m.clearcoatRoughness=.65;m.envMapIntensity=envStrength(.34)}
  m.userData.colorizeMaterialKind='pvc';return m;
}
function acrylicMaterial(color,look='milk',o={}){
  const m=new THREE.MeshPhysicalMaterial({color:col(color),metalness:0,ior:1.49,specularIntensity:1,sheen:.03,sheenRoughness:.5});
  if(look==='clear'){m.roughness=.055;m.clearcoat=1;m.clearcoatRoughness=.025;m.transmission=.88;m.thickness=.58;m.attenuationDistance=4.5;m.envMapIntensity=envStrength(1.45)}
  else if(look==='translucent'){m.roughness=.13;m.clearcoat=.92;m.clearcoatRoughness=.06;m.transmission=.42;m.thickness=.82;m.attenuationDistance=1.35;m.envMapIntensity=envStrength(1.2)}
  else if(look==='opaqueGloss'){m.roughness=.12;m.clearcoat=.96;m.clearcoatRoughness=.055;m.transmission=0;m.thickness=.3;m.envMapIntensity=envStrength(1.2)}
  else if(look==='matte'){m.roughness=.56;m.clearcoat=.12;m.clearcoatRoughness=.45;m.transmission=.015;m.thickness=.4;m.envMapIntensity=envStrength(.55)}
  else{m.roughness=.19;m.clearcoat=.92;m.clearcoatRoughness=.09;m.transmission=.18;m.thickness=1.05;m.attenuationDistance=.72;m.envMapIntensity=envStrength(1.08)}
  if(m.attenuationColor)m.attenuationColor.copy(m.color);
  if(o.lightMode==='face'||o.lightMode==='both'){m.emissive=col(o.lightColor||'#ffffff');m.emissiveIntensity=Math.max(.08,Number(o.lightIntensity)||.7)*2.15}
  m.userData.colorizeMaterialKind='acrylic';return m;
}
function metalMaterial(color){const m=new THREE.MeshPhysicalMaterial({color:col(color),metalness:.88,roughness:.24,clearcoat:.28,clearcoatRoughness:.14,envMapIntensity:envStrength(1.15)});m.userData.colorizeMaterialKind='metal';return m}
function materialFor(kind,color,finish,look,o){if(kind==='acrylic')return acrylicMaterial(color,look,o);if(kind==='pvc')return pvcMaterial(color,finish);if(kind==='metal'||kind==='aluminum'||kind==='stainless'||kind==='painted')return metalMaterial(color);return new THREE.MeshPhysicalMaterial({color:col(color),metalness:.38,roughness:.34,clearcoat:.22,envMapIntensity:envStrength(.72)})}

function toNonIndexed(g){return g.index?g.toNonIndexed():g.clone()}
function triGeometry(src,pick,transformZ=null){
  const g=toNonIndexed(src),p=g.getAttribute('position'),n=g.getAttribute('normal');if(!p)return new THREE.BufferGeometry();
  const pos=[],nor=[];let uv=[];const u=g.getAttribute('uv');
  for(let i=0;i<p.count;i+=3){
    let cz=0,nz=0;for(let j=0;j<3;j++){cz+=p.getZ(i+j);nz+=n?n.getZ(i+j):0}cz/=3;nz/=3;
    if(!pick(cz,nz,i,g))continue;
    for(let j=0;j<3;j++){
      const k=i+j,x=p.getX(k),y=p.getY(k),z=p.getZ(k);pos.push(x,y,transformZ?transformZ(z):z);
      if(n)nor.push(n.getX(k),n.getY(k),n.getZ(k));if(u)uv.push(u.getX(k),u.getY(k));
    }
  }
  const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));if(nor.length)out.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));if(uv.length)out.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));out.computeBoundingBox();out.computeBoundingSphere();g.dispose?.();return out;
}
function bounds(g){g.computeBoundingBox?.();const b=g.boundingBox;return {min:b?.min?.z??0,max:b?.max?.z??1,depth:Math.max(.001,(b?.max?.z??1)-(b?.min?.z??0))}}
function zRange(g){g.computeBoundingBox?.();return [Number(g.boundingBox?.min?.z?.toFixed?.(5)??0),Number(g.boundingBox?.max?.z?.toFixed?.(5)??0)]}
function meshPart(group,name,geo,mat){let m=group.children.find(x=>x.userData?.part15===name);if(!m){m=new THREE.Mesh(geo,mat);m.userData.part15=name;m.castShadow=true;m.receiveShadow=true;group.add(m)}return m}
function disposeGroup(g){g.traverse(x=>{if(x!==g){x.geometry?.dispose?.();(Array.isArray(x.material)?x.material:[x.material]).filter(Boolean).forEach(m=>m.dispose?.())}});g.clear()}

function build(mesh,o,cfg){
  const old14=mesh.children.find(x=>x.userData?.colorizeAssemblyOverlay14);if(old14)old14.visible=false;
  let g=mesh.children.find(x=>x.userData?.colorizeAssembly15);if(g){disposeGroup(g);mesh.remove(g)}
  g=new THREE.Group();g.userData.colorizeAssembly15=true;mesh.add(g);
  const b=bounds(mesh.geometry),front=b.max,back=b.min,faceT=Math.max(b.depth*.012,Math.min(b.depth*.18,(Number(o.faceThickness)||3)/45));
  const backT=Math.max(b.depth*.008,Math.min(b.depth*.10,(Number(o.backThickness)||5)/80));
  const eps=Math.max(.0007,b.depth*.0015);
  const frontBase=triGeometry(mesh.geometry,(cz,nz)=>cz>front-b.depth*.10&&nz>.82);
  const backBase=triGeometry(mesh.geometry,(cz,nz)=>cz<back+b.depth*.10&&nz<-.82);
  const sideBase=triGeometry(mesh.geometry,(cz,nz)=>!(cz>front-b.depth*.10&&nz>.82)&&!(cz<back+b.depth*.10&&nz<-.82));
  const flat=cfg.assemblyType==='flatAcrylic'||cfg.assemblyType==='flatPvc';
  const sideVisible=!flat;
  const faceKind=cfg.assemblyType==='halo'?(o.faceMaterial==='acrylic'?'metal':o.faceMaterial):(cfg.assemblyType==='flatPvc'?'pvc':(o.faceMaterial||'acrylic'));
  const sideKind=o.returnMaterial||'pvc',backKind=o.backMaterial||'pvc';

  const returnMesh=meshPart(g,'return',sideBase,materialFor(sideKind,o.sideColor,cfg.returnFinish,cfg.acrylicLook,o));returnMesh.visible=sideVisible;

  const faceEdgeGeo=triGeometry(sideBase,()=>true,z=>front+((z-back)/b.depth)*faceT);
  const faceEdge=meshPart(g,'faceEdge',faceEdgeGeo,materialFor(faceKind,o.faceColor,cfg.returnFinish,cfg.acrylicLook,o));
  const face=meshPart(g,'face',frontBase,materialFor(faceKind,o.faceColor,cfg.returnFinish,cfg.acrylicLook,o));face.position.z=faceT+eps;face.renderOrder=3;
  faceEdge.visible=cfg.assemblyType!=='halo'||faceKind!=='metal';

  const backGeo=triGeometry(backBase,()=>true,z=>z-backT-eps);
  const backMesh=meshPart(g,'back',backGeo,materialFor(backKind,o.backColor,cfg.backFinish,'milk',{...o,lightMode:o.lightMode==='halo'||o.lightMode==='both'?'face':'off'}));backMesh.visible=!flat;

  if((cfg.assemblyType==='faceLit'||cfg.assemblyType==='faceHalo')&&cfg.edgeStyle==='trimcap'){
    const trim=meshPart(g,'trim',frontBase.clone(),pvcMaterial(o.sideColor||'#ffffff',cfg.returnFinish));trim.scale.set(1.018,1.018,1);trim.position.z=faceT+eps*.35;trim.renderOrder=2;
  }
  if(cfg.jointSeam&&!flat){const eg=new THREE.EdgesGeometry(sideBase,35),line=new THREE.LineSegments(eg,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.12,depthWrite:false}));line.userData.part15='seam';line.renderOrder=4;g.add(line)}
  if(cfg.externalBacking!=='none'||cfg.assemblyType==='pushThrough'){
    const panel=meshPart(g,'externalBacking',backBase.clone(),pvcMaterial(cfg.backingColor||'#ffffff',cfg.backingFinish));const isPanel=cfg.externalBacking==='panel'||cfg.assemblyType==='pushThrough';panel.scale.set(isPanel?1.14:1.075,isPanel?1.24:1.075,1);panel.position.z=-backT-eps*3;panel.renderOrder=0;
  }

  for(const m of (Array.isArray(mesh.material)?mesh.material:[mesh.material]))if(m)m.visible=false;
  const parts=g.children.filter(x=>x.visible!==false);
  return {parts:parts.length,faceRange:zRange(face.geometry).map(v=>Number((v+face.position.z).toFixed(5))),returnRange:zRange(returnMesh.geometry),backRange:zRange(backMesh.geometry).map(v=>Number((v+backMesh.position.z).toFixed(5))),faceThickness:faceT,assemblyType:cfg.assemblyType};
}
function hideLegacyBacks(scene,primaries){
  const singles=[];scene.traverse(x=>{if(x.isMesh&&x.geometry?.type==='TextGeometry'&&!Array.isArray(x.material)&&!x.material?.isMeshBasicMaterial)singles.push(x)});
  for(const s of singles){if(s.parent?.userData?.colorizeAssembly15||s.parent?.userData?.colorizeAssemblyOverlay14)continue;if(primaries.includes(s))continue;if(s.material)s.material.visible=false}
}
function apply(renderer,scene,camera){
  const host=document.getElementById('threeHost');if(!host||host.hidden||!host.contains(renderer.domElement))return;
  lastRenderer=renderer;lastScene=scene;lastCamera=camera;
  const {texts}=info(),prim=[];scene.traverse(x=>{if(x.isMesh&&x.geometry?.type==='TextGeometry'&&Array.isArray(x.material)&&x.material.length>=2)prim.push(x)});
  let parts=0,last=null;for(let i=0;i<Math.min(texts.length,prim.length);i++){last=build(prim[i],texts[i],configFor(texts[i]));parts+=last.parts}
  hideLegacyBacks(scene,prim);
  debug={version:'0.15.0',objects:Math.min(texts.length,prim.length),parts,zFightingGuard:true,lastObject:last,at:performance.now()};
}
const prev=globalThis.__colorizeBeforeThreeRender;
globalThis.__colorizeBeforeThreeRender=(r,s,c)=>{prev?.(r,s,c);apply(r,s,c)};
globalThis.__colorizeAssembly15Debug=()=>structuredClone(debug);
globalThis.__colorizeAssembly15Redraw=()=>{if(lastRenderer&&lastScene&&lastCamera)lastRenderer.render(lastScene,lastCamera)};
window.addEventListener('DOMContentLoaded',()=>{document.addEventListener('input',e=>{if(e.target.closest?.('#constructionPanel'))requestAnimationFrame(()=>globalThis.__colorizeAssembly15Redraw?.())},true);document.addEventListener('change',e=>{if(e.target.closest?.('#constructionPanel'))requestAnimationFrame(()=>globalThis.__colorizeAssembly15Redraw?.())},true)});
