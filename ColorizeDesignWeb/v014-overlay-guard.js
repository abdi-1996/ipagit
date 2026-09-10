// v0.14 guard: generated face/trim/backing overlays must never be mistaken for the
// source TextGeometry on the next frame. Mark their cloned geometry with a distinct type.
const previous=globalThis.__colorizeBeforeThreeRender;
globalThis.__colorizeBeforeThreeRender=(renderer,scene,camera)=>{
  previous?.(renderer,scene,camera);
  scene?.traverse?.(o=>{
    if(o?.userData?.colorizeAssemblyOverlay14){
      for(const child of o.children||[]){
        if(child?.geometry?.type==='TextGeometry')child.geometry.type='ColorizeAssemblyOverlayGeometry';
      }
    }
  });
};
