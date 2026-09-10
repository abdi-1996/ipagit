import * as Core from 'three-core';
export * from 'three-core';

// Three.js WebGLRenderer defines render on each instance, so prototype monkey-patches
// do not reliably see frames. This wrapper gives Colorize one guaranteed pre-render hook.
export class WebGLRenderer extends Core.WebGLRenderer {
  constructor(parameters={}){
    super(parameters);
    globalThis.__colorizeThreeRenderers ||= new Set();
    globalThis.__colorizeThreeRenderers.add(this);
  }
  render(scene,camera){
    try{globalThis.__colorizeBeforeThreeRender?.(this,scene,camera)}catch(err){
      globalThis.__colorizeLightingHookError=String(err?.stack||err);
    }
    return super.render(scene,camera);
  }
  dispose(){
    try{globalThis.__colorizeThreeRenderers?.delete(this)}catch{}
    return super.dispose();
  }
}
