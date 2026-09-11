// v0.30 stability guard: v030 already refreshes vector properties from the world observer
// and its periodic sync. Prevent a redundant #properties observer from observing its
// own innerHTML writes and causing an infinite MutationObserver feedback loop.
const NativeMutationObserver=globalThis.MutationObserver;
if(NativeMutationObserver&&!globalThis.__colorizeV030ObserverGuard){
  class ColorizeV030MutationObserver{
    constructor(callback){this._callback=callback;this._inner=new NativeMutationObserver((records)=>callback(records,this));this._skippedProperties=false}
    observe(target,options){
      if(target?.id==='properties'){this._skippedProperties=true;return}
      this._inner.observe(target,options)
    }
    disconnect(){this._inner.disconnect()}
    takeRecords(){return this._inner.takeRecords()}
  }
  globalThis.MutationObserver=ColorizeV030MutationObserver;
  globalThis.__colorizeV030ObserverGuard={native:NativeMutationObserver,active:true};
}
