// v0.32 stability guard for the Affinity-style editor.
// The editor already performs direct refreshes after interactions and periodic syncs.
// Observing its own regenerated #world/#properties subtrees creates feedback loops,
// so those two internal roots are deliberately not observed.
const NativeMutationObserver=globalThis.MutationObserver;
if(NativeMutationObserver&&!globalThis.__colorizeV030ObserverGuard){
  class ColorizeV030MutationObserver{
    constructor(callback){
      this._callback=callback;
      this._inner=new NativeMutationObserver((records)=>callback(records,this));
      this._skipped=[];
    }
    observe(target,options){
      if(target?.id==='properties'||target?.id==='world'){
        this._skipped.push(target.id);
        return;
      }
      this._inner.observe(target,options)
    }
    disconnect(){this._inner.disconnect()}
    takeRecords(){return this._inner.takeRecords()}
  }
  globalThis.MutationObserver=ColorizeV030MutationObserver;
  globalThis.__colorizeV030ObserverGuard={native:NativeMutationObserver,active:true,worldObserverDisabled:true,propertiesObserverDisabled:true};
}
