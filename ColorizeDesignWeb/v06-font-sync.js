const FONT_SOURCES={
  helvetiker:{label:'Helvetiker Bold',url:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/helvetiker_bold.typeface.json'},
  optimer:{label:'Optimer Bold',url:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/optimer_bold.typeface.json'},
  gentilis:{label:'Gentilis Bold',url:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/gentilis_bold.typeface.json'},
  droidSans:{label:'Droid Sans Bold',url:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/droid/droid_sans_bold.typeface.json'},
  droidSerif:{label:'Droid Serif Bold',url:'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/droid/droid_serif_bold.typeface.json'}
};
const STORE_KEYS=['colorize-design-web-v04','colorize-design-web-v03','colorize-design-web-v02','colorize-design-web-v01'];
const fontCache=new Map();
const parsedGlyphCache=new WeakMap();
let paintGeneration=0;

function readProject(){
  for(const k of STORE_KEYS){
    try{const raw=localStorage.getItem(k);if(raw)return JSON.parse(raw)}catch{}
  }
  return null;
}
function getObject(project,id){
  for(const a of project?.artboards||[]){const o=(a.objects||[]).find(x=>x.id===id);if(o)return o}
  return null;
}
function loadFont(key){
  const k=FONT_SOURCES[key]?key:'helvetiker';
  if(fontCache.has(k))return fontCache.get(k);
  const p=fetch(FONT_SOURCES[k].url,{cache:'force-cache'}).then(r=>{if(!r.ok)throw new Error('font');return r.json()});
  fontCache.set(k,p);return p;
}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function parseGlyph(font,glyph){
  if(!glyph)return null;
  let map=parsedGlyphCache.get(font);if(!map){map=new Map();parsedGlyphCache.set(font,map)}
  if(map.has(glyph))return map.get(glyph);
  const t=String(glyph.o||'').trim().split(/\s+/);let i=0,d='',minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const point=(x,y)=>{minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)};
  while(i<t.length){
    const c=t[i++];
    if(c==='m'||c==='l'){
      const x=num(t[i++]),y=num(t[i++]);point(x,y);d+=`${c==='m'?'M':'L'}${x} ${y} `;
    }else if(c==='q'){
      const ex=num(t[i++]),ey=num(t[i++]),cx=num(t[i++]),cy=num(t[i++]);point(ex,ey);point(cx,cy);d+=`Q${cx} ${cy} ${ex} ${ey} `;
    }else if(c==='b'){
      const ex=num(t[i++]),ey=num(t[i++]),c1x=num(t[i++]),c1y=num(t[i++]),c2x=num(t[i++]),c2y=num(t[i++]);point(ex,ey);point(c1x,c1y);point(c2x,c2y);d+=`C${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey} `;
    }else if(c==='z') d+='Z ';
    else break;
  }
  const out={d:d.trim(),minX:Number.isFinite(minX)?minX:0,minY:Number.isFinite(minY)?minY:0,maxX:Number.isFinite(maxX)?maxX:0,maxY:Number.isFinite(maxY)?maxY:0};
  map.set(glyph,out);return out;
}
function buildWord(font,text){
  const glyphs=font.glyphs||{},fallback=glyphs['?']||glyphs['□']||null;
  let pen=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,paths='';
  for(const ch of String(text||' ')){
    const g=glyphs[ch]||fallback;if(!g){pen+=(font.resolution||1000)*.55;continue}
    const p=parseGlyph(font,g);
    if(p?.d){
      const gx0=pen+p.minX,gx1=pen+p.maxX;minX=Math.min(minX,gx0);maxX=Math.max(maxX,gx1);minY=Math.min(minY,p.minY);maxY=Math.max(maxY,p.maxY);
      paths+=`<path d="${p.d}" transform="translate(${pen} 0)"/>`;
    }
    pen+=num(g.ha)||(font.resolution||1000)*.55;
  }
  if(!Number.isFinite(minX)){minX=0;maxX=Math.max(1,pen);minY=0;maxY=font.resolution||1000}
  return {paths,minX,minY,maxX,maxY,width:Math.max(1,maxX-minX),height:Math.max(1,maxY-minY)};
}
function svgMarkup(word,fill,gradientId=null){
  const y=-word.maxY;
  const paint=gradientId?`url(#${gradientId})`:fill;
  return `<svg class="colorize-glyph-layer" viewBox="${word.minX} ${y} ${word.width} ${word.height}" preserveAspectRatio="none" aria-hidden="true"><g transform="scale(1 -1)" fill="${paint}" fill-rule="nonzero">${word.paths}</g></svg>`;
}
function renderGradient(id,kind,face){
  if(kind==='metal')return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#292929"/><stop offset=".17" stop-color="#f6f6f6"/><stop offset=".35" stop-color="${face}"/><stop offset=".52" stop-color="#ffffff"/><stop offset=".68" stop-color="${face}"/><stop offset=".84" stop-color="#555"/><stop offset="1" stop-color="#eee"/></linearGradient></defs>`;
  if(kind==='acrylic')return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".82"/><stop offset=".24" stop-color="${face}"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".34"/><stop offset=".72" stop-color="${face}"/><stop offset="1" stop-color="${face}"/></linearGradient></defs>`;
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${face}"/><stop offset=".48" stop-color="${face}"/><stop offset="1" stop-color="#111" stop-opacity=".28"/></linearGradient></defs>`;
}
function appendSvg(node,html,cls,dx=0,dy=0,filter=''){
  const box=document.createElement('div');box.innerHTML=html;const svg=box.firstElementChild;if(!svg)return;
  svg.classList.add(cls);svg.style.transform=`translate(${dx}px,${dy}px)`;if(filter)svg.style.filter=filter;node.appendChild(svg);
}
async function syncNode(node,obj,project,generation){
  const key=obj.font3D||'helvetiker';let font;try{font=await loadFont(key)}catch{return}
  if(generation!==paintGeneration||!node.isConnected)return;
  const word=buildWord(font,obj.text||' '),mode=project.mode||'2d';
  node.querySelectorAll('.colorize-glyph-layer').forEach(x=>x.remove());
  node.classList.add('colorize-font-synced');
  node.style.setProperty('color','transparent','important');node.style.setProperty('text-shadow','none','important');
  const face=obj.faceColor||obj.color||'#111827',side=obj.sideColor||'#20252b';
  if(mode==='3d'||mode==='render'){
    const depth=Math.max(1,Math.min(24,Math.round((Number(obj.returnDepth)||50)/5)));
    for(let i=depth;i>=1;i--){const html=svgMarkup(word,side);appendSvg(node,html,'colorize-glyph-side',i,i*.72)}
  }
  let html=svgMarkup(word,face);
  if(mode==='render'){
    const gid=`cg-${String(obj.id).replace(/[^a-zA-Z0-9]/g,'')}-${generation}`;
    html=svgMarkup(word,face,gid).replace('<g ',`${renderGradient(gid,obj.faceMaterial||'acrylic',face)}<g `);
  }
  let filter='';
  const li=Math.max(0,Number(obj.lightIntensity)||0),lc=obj.lightColor||'#ffffff';
  if(obj.lightMode==='face'||obj.lightMode==='both')filter+=`drop-shadow(0 0 ${Math.max(2,5*li)}px ${lc}) `;
  if(obj.lightMode==='halo'||obj.lightMode==='both')filter+=`drop-shadow(0 5px ${Math.max(5,12*li)}px ${lc}) `;
  appendSvg(node,html,'colorize-glyph-front',0,0,filter.trim());
}
function refresh(){
  const generation=++paintGeneration,project=readProject();if(!project)return;
  document.querySelectorAll('#world .obj.text[data-object-id]').forEach(node=>{const obj=getObject(project,node.dataset.objectId);if(obj)syncNode(node,obj,project,generation)});
  const props=document.getElementById('properties');
  if(props){
    props.querySelectorAll('.prop-row span').forEach(s=>{if(s.textContent.trim()==='3D шрифт')s.textContent='Шрифт'});
    const textSection=[...props.querySelectorAll('.prop-section')].find(x=>x.querySelector('h4')?.textContent.trim()==='ТЕКСТ');
    if(textSection&&!textSection.querySelector('.colorize-font-note')){
      const n=document.createElement('div');n.className='colorize-font-note';n.textContent='Один и тот же контур используется в 2D, 3D, Render и 3D View — форма букв больше не меняется.';textSection.appendChild(n);
    }
  }
}
let queued=false;
function queueRefresh(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;refresh()})}
window.addEventListener('DOMContentLoaded',()=>{
  const world=document.getElementById('world'),props=document.getElementById('properties');
  if(world)new MutationObserver(queueRefresh).observe(world,{childList:true,subtree:true});
  if(props)new MutationObserver(queueRefresh).observe(props,{childList:true,subtree:true});
  document.addEventListener('input',queueRefresh,true);document.addEventListener('change',queueRefresh,true);document.addEventListener('click',queueRefresh,true);
  queueRefresh();
});
