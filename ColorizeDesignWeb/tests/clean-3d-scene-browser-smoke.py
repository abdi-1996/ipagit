import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:',e);sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT=4182;DEBUG_PORT=9231
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found');sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v021-');log=open('/tmp/colorize-v021-chrome.log','w+b')
chrome=subprocess.Popen([browser,'--headless=new','--no-sandbox','--disable-dev-shm-usage','--remote-allow-origins=*',f'--remote-debugging-port={DEBUG_PORT}',f'--user-data-dir={profile}','about:blank'],stdout=log,stderr=log)
ws=None
try:
    version=None
    for _ in range(80):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{DEBUG_PORT}/json/version',timeout=1) as r: version=json.load(r)
            if version.get('webSocketDebuggerUrl'): break
        except Exception: time.sleep(.25)
    if not version: raise RuntimeError('Chrome DevTools endpoint not available')
    url=f'http://127.0.0.1:{PORT}/?v021-clean-scene=1'
    req=urllib.request.Request(f'http://127.0.0.1:{DEBUG_PORT}/json/new?{urllib.parse.quote(url,safe=":/?=&")}',method='PUT')
    with urllib.request.urlopen(req,timeout=5) as r: page=json.load(r)
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=35);cid=0
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
    clean=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));for(let i=0;i<160;i++){if(typeof window.__colorizeClean3D21Debug==='function'&&document.querySelector('.mode[data-mode=\"view3d\"]'))break;await w(100)}window.__colorizeSetFacade21(false,'test-start');document.querySelector('.mode[data-mode=\"view3d\"]')?.click();for(let i=0;i<180;i++){const d=window.__colorizeClean3D21Debug?.();if(d?.version==='0.21.0'&&d.gridHidden&&d.wallsDetected>0&&d.wallsVisible===0&&d.floorsVisible===0)return d;await w(100)}return window.__colorizeClean3D21Debug?.()||null})()""",True)
    print('V021 CLEAN',json.dumps(clean,ensure_ascii=False))
    if not clean or clean.get('version')!='0.21.0': raise RuntimeError('Clean 3D module did not load')
    if not clean.get('gridHidden'): raise RuntimeError('2D grid is still visible in 3D mode')
    if int(clean.get('wallsDetected') or 0)<1: raise RuntimeError('Default wall was not detected')
    if int(clean.get('wallsVisible') or 0)!=0 or int(clean.get('floorsVisible') or 0)!=0: raise RuntimeError('Default wall/floor is visible without facade')
    facade=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));window.__colorizeSetFacade21(true,'test-facade');for(let i=0;i<180;i++){const d=window.__colorizeClean3D21Debug?.();if(d?.facade&&d.wallsVisible>0&&d.gridHidden)return d;await w(100)}return window.__colorizeClean3D21Debug?.()||null})()""",True)
    print('V021 FACADE',json.dumps(facade,ensure_ascii=False))
    if not facade or not facade.get('facade') or int(facade.get('wallsVisible') or 0)<1: raise RuntimeError('Facade wall did not appear after facade was enabled')
    if not facade.get('gridHidden'): raise RuntimeError('Grid reappeared after facade was enabled')
    evaluate("window.__colorizeSetFacade21(false,'test-end')")
    print('clean-3d-scene-browser-smoke: PASS — grid is hidden, default wall/floor stay hidden, and wall appears only after facade is added')
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
