import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:',e);sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT=4184;DEBUG_PORT=9233
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found');sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v022-');log=open('/tmp/colorize-v022-chrome.log','w+b')
chrome=subprocess.Popen([browser,'--headless=new','--no-sandbox','--disable-dev-shm-usage','--remote-allow-origins=*',f'--remote-debugging-port={DEBUG_PORT}',f'--user-data-dir={profile}','about:blank'],stdout=log,stderr=log)
ws=None
try:
    version=None
    for _ in range(120):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{DEBUG_PORT}/json/version',timeout=1) as r: version=json.load(r)
            if version.get('webSocketDebuggerUrl'): break
        except Exception: time.sleep(.25)
    if not version: raise RuntimeError('Chrome DevTools endpoint not available')
    url=f'http://127.0.0.1:{PORT}/?v022-history-smoke=1'
    req=urllib.request.Request(f'http://127.0.0.1:{DEBUG_PORT}/json/new?{urllib.parse.quote(url,safe=":/?=&")}',method='PUT')
    with urllib.request.urlopen(req,timeout=5) as r: page=json.load(r)
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=30);cid=0
    def call(method,params=None):
        global cid;cid+=1;my=cid;ws.send(json.dumps({'id':my,'method':method,'params':params or {}}))
        while True:
            m=json.loads(ws.recv())
            if m.get('id')==my:
                if 'error' in m: raise RuntimeError(f"CDP {method}: {m['error']}")
                return m.get('result',{})
    call('Runtime.enable');call('Page.enable')
    def evaluate(expr,await_promise=False):
        r=call('Runtime.evaluate',{'expression':expr,'returnByValue':True,'awaitPromise':await_promise})
        if r.get('exceptionDetails'): raise RuntimeError('JS exception '+json.dumps(r['exceptionDetails']))
        return r.get('result',{}).get('value')
    ready=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));for(let i=0;i<180;i++){const d=window.__colorizeHistory22Debug?.();const input=document.querySelector('[data-prop="text"]');if(d?.version==='0.22.0'&&input){await w(700);return window.__colorizeHistory22Debug?.()}await w(100)}return null})()""",True)
    if not ready: raise RuntimeError('v0.22 history module did not become ready')
    result=evaluate("""(async()=>{
      const w=t=>new Promise(r=>setTimeout(r,t));
      window.__COLORIZE_HISTORY_TEST_NO_RELOAD=true;
      const key='colorize-design-web-v04';
      const input=document.querySelector('[data-prop="text"]');
      const before=localStorage.getItem(key);const beforeDebug=window.__colorizeHistory22Debug();
      input.value='UNDO REDO TEST';input.dispatchEvent(new Event('input',{bubbles:true}));await w(450);
      const changed=localStorage.getItem(key);const afterEdit=window.__colorizeHistory22Debug();
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));await w(80);
      const undone=localStorage.getItem(key);const afterUndo=window.__colorizeHistory22Debug();
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'y',ctrlKey:true,bubbles:true,cancelable:true}));await w(80);
      const redone=localStorage.getItem(key);const afterRedo=window.__colorizeHistory22Debug();
      window.__colorizeHistory22SimulateGesture(2);await w(50);const gestureUndo=localStorage.getItem(key);const afterGestureUndo=window.__colorizeHistory22Debug();
      window.__colorizeHistory22SimulateGesture(3);await w(50);const gestureRedo=localStorage.getItem(key);const afterGestureRedo=window.__colorizeHistory22Debug();
      const textOf=raw=>{try{const p=JSON.parse(raw);const a=p.artboards?.find(x=>x.id===p.activeArtboardId)||p.artboards?.[0];return a?.objects?.find(o=>o.id===p.selectedObjectId)?.text||null}catch{return null}};
      return {beforeText:textOf(before),changedText:textOf(changed),undoneText:textOf(undone),redoneText:textOf(redone),gestureUndoText:textOf(gestureUndo),gestureRedoText:textOf(gestureRedo),before,changed,undone,redone,gestureUndo,gestureRedo,beforeDebug,afterEdit,afterUndo,afterRedo,afterGestureUndo,afterGestureRedo};
    })()""",True)
    print('V022 HISTORY DIAG',json.dumps({k:result[k] for k in ('beforeText','changedText','undoneText','redoneText','gestureUndoText','gestureRedoText','beforeDebug','afterEdit','afterUndo','afterRedo','afterGestureUndo','afterGestureRedo')},ensure_ascii=False),flush=True)
    if not result or result['before']==result['changed']: raise RuntimeError('Editing did not create a new project snapshot')
    if result['undone']!=result['before']: raise RuntimeError('Ctrl+Z did not restore previous project snapshot')
    if result['redone']!=result['changed']: raise RuntimeError('Ctrl+Y did not restore redone project snapshot')
    if result['gestureUndo']!=result['before']: raise RuntimeError('Two-finger double-tap logic did not undo')
    if result['gestureRedo']!=result['changed']: raise RuntimeError('Three-finger double-tap logic did not redo')
    if result['afterUndo'].get('undoCount',0)<1 or result['afterRedo'].get('redoCount',0)<1: raise RuntimeError('Undo/redo counters did not advance')
    print('history-undo-redo-browser-smoke: PASS — Ctrl+Z/Ctrl+Y and 2/3-finger double-tap undo/redo logic work')
finally:
    try:
        if ws: ws.close()
    except: pass
    for p in (chrome,server):
        try:p.terminate()
        except:pass
    for p in (chrome,server):
        try:p.wait(timeout=3)
        except:
            try:p.kill()
            except:pass
    log.close();shutil.rmtree(profile,ignore_errors=True)
