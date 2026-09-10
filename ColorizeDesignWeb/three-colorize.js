import * as Core from 'three-core';
export * from 'three-core';

// WebGLRenderer installs render/dispose as own instance functions inside the Three.js
// constructor. Overriding the subclass prototype is therefore not enough: replace the
// instance functions immediately after super() so every real frame reaches Colorize.
export class WebGLRenderer extends Core.WebGLRenderer {
  constructor(parameters={}){
    super(parameters);
    const coreRender=this.render.bind(this);
    const coreDispose=this.dispose.bind(this);
    globalThis.__colorizeThreeRenderers ||= new Set();
    globalThis.__colorizeThreeRenderers.add(this);
    this.render=(scene,camera)=>{
      try{globalThis.__colorizeBeforeThreeRender?.(this,scene,camera)}catch(err){
        globalThis.__colorizeLightingHookError=String(err?.stack||err);
      }
      return coreRender(scene,camera);
    };
    this.dispose=()=>{
      try{globalThis.__colorizeThreeRenderers?.delete(this)}catch{}
      return coreDispose();
    };
  }
}
