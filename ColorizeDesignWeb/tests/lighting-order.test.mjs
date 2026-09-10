import fs from 'node:fs';
import assert from 'node:assert/strict';

const boot=fs.readFileSync(new URL('../boot-v0132.js',import.meta.url),'utf8');
const owner=fs.readFileSync(new URL('../v0132-lighting-owner.js',import.meta.url),'utf8');

const ownerImport=boot.indexOf("./v0132-lighting-owner.js");
const legacyImport=boot.indexOf("./v011-realtime-3d.js");
assert(ownerImport>=0,'v0.13.2 lighting owner is missing from boot');
assert(legacyImport>=0,'legacy realtime renderer is missing from boot');
assert(ownerImport<legacyImport,'final lighting owner must be imported before legacy wrappers so it runs closest to the real draw');

const applyPos=owner.indexOf('applyFinalLighting(readSettings())');
const drawPos=owner.indexOf('return previousRender.call(this,s,c)');
assert(applyPos>=0&&drawPos>=0&&applyPos<drawPos,'lighting must be applied before the underlying WebGL draw');

// Reproduce the old bug and prove the fixed wrapper order.
let light=0;
const original=()=>light;
const wrap=(prev,before,after)=>()=>{before?.();const seen=prev();after?.();return seen};

let broken=original;
broken=wrap(broken,()=>{light=3.25});          // v0.11 legacy write
broken=wrap(broken,()=>{light=5});             // v0.13 requested value
broken=wrap(broken,null,()=>{light=5});        // v0.13.1 post-draw fix
light=0;
assert.equal(broken(),3.25,'regression fixture should reproduce the invisible live-lighting bug');

let fixed=original;
fixed=wrap(fixed,()=>{light=5});               // v0.13.2 owner: deepest/pre-draw
fixed=wrap(fixed,()=>{light=3.25});            // v0.11 legacy wrapper
fixed=wrap(fixed,()=>{light=5});               // v0.13 UI wrapper
light=0;
assert.equal(fixed(),5,'visible frame must see the latest lighting value');

console.log('lighting-order.test: PASS — viewport draw sees current lighting values');
