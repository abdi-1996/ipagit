import './boot-v029.js?v=0300';
import './v030-observer-guard.js?v=0300';
globalThis.__colorizeV030LoadState='loading';
import('./v030-affinity-2d.js?v=0300').then(()=>{globalThis.__colorizeV030LoadState='ready'}).catch(err=>{globalThis.__colorizeV030LoadState='error';globalThis.__colorizeV030LoadError=String(err?.stack||err);console.error('Colorize v0.30 editor failed to load',err)});
