// v0.32 stability guard for the Affinity-style editor.
// Prevent observers from feeding back on DOM that the editor itself regenerates.
const NativeMutationObserver=globalThis.MutationObserver;
if(NativeMutationObserver&&!globalThis.__colorizeV030ObserverGuard){
  const isInternalRecord=r=>{
    const t=r?.target;
    return !!(t?.nodeType===1&&(
      t.matches?.('.v030-node-layer,.v030-node-layer *')||
      t.matches?.('.v032-contour-layer,.v032-contour-layer *')||
      t.matches?.('.v031-tool-ui,.v031-tool-ui *')
    ));
  };
  class ColorizeV030MutationObserver{
    constructor(callback){
      this._callback=callback;
      this._skippedProperties=false;
      this._inner=new NativeMutationObserver((records)=>{
        const meaningful=records.filter(r=>!isInternalRecord(r));
        if(meaningful.length)callback(meaningful,this);
      });
    }
    observe(target,options){
      // v030 already refreshes vector properties from its world observer and periodic
      // sync. Observing #properties would react to its own innerHTML writes forever.
      if(target?.id==='properties'){this._skippedProperties=true;return}
      this._inner.observe(target,options)
    }
    disconnect(){this._inner.disconnect()}
    takeRecords(){return this._inner.takeRecords().filter(r=>!isInternalRecord(r))}
  }
  globalThis.MutationObserver=ColorizeV030MutationObserver;
  globalThis.__colorizeV030ObserverGuard={native:NativeMutationObserver,active:true,nodeLayerFiltered:true};
}
