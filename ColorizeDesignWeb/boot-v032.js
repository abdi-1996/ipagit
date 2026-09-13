import './boot-v028.js?v=0320';
import './v031-text-editor.js?v=0320';
import './v030-observer-guard.js?v=0320';
globalThis.__colorizeV032LoadState='loading';
import('./v030-affinity-2d.js?v=0320').then(async()=>{
  // Register correctness fixes before the v0.31 enhanced pointer layer so
  // Contour and Area own their gestures instead of falling through to old behavior.
  await import('./v032-function-fixes.js?v=0320');
  await import('./v031-tool-stability.js?v=0320');
  globalThis.__colorizeV032LoadState='ready';
}).catch(err=>{
  globalThis.__colorizeV032LoadState='error';
  globalThis.__colorizeV032LoadError=String(err?.stack||err);
  console.error('Colorize v0.32 editor failed to load',err);
});
