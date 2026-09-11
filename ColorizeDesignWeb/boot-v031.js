import './boot-v028.js?v=0310';
import './v031-text-editor.js?v=0310';
import './v030-observer-guard.js?v=0310';
globalThis.__colorizeV031LoadState='loading';
import('./v030-affinity-2d.js?v=0310').then(async()=>{
  await import('./v031-tool-stability.js?v=0310');
  globalThis.__colorizeV031LoadState='ready';
}).catch(err=>{
  globalThis.__colorizeV031LoadState='error';
  globalThis.__colorizeV031LoadError=String(err?.stack||err);
  console.error('Colorize v0.31 editor failed to load',err);
});
