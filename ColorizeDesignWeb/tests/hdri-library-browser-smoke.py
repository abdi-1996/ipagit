import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:',e);sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT=4190;DEBUG_PORT=9239
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found');sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v026-');log=open('/tmp/colorize-v026-chrome.log','w+b')
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
    url=f'http://127.0.0.1:{PORT}/?v026-hdri=1'
    req=urllib.request.Request(f'http://127.0.0.1:{DEBUG_PORT}/json/new?{urllib.parse.quote(url,safe=":/?=&")}',method='PUT')
    with urllib.request.urlopen(req,timeout=5) as r: page=json.load(r)
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=45);cid=0
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
    ready=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));for(let i=0;i<260;i++){if(document.readyState==='complete'&&typeof window.__colorizeHdri26Debug==='function')break;await w(100)}document.querySelector('.mode[data-mode="view3d"]')?.click();await w(700);document.getElementById('lightingBtn')?.click();for(let i=0;i<220;i++){if(document.querySelector('[data-light-mode="hdr"]')&&document.querySelector('.hdri-library26'))break;await w(100)}document.querySelector('[data-light-mode="hdr"]')?.click();const ok=await window.__colorizeHdri26SelectPreset?.('jeksterer');for(let i=0;i<180;i++){const d=window.__colorizeHdri26Debug?.();if(ok&&d?.loaded)return d;await w(100)}return window.__colorizeHdri26Debug?.()||null})()""",True)
    if not ready or ready.get('version')!='0.26.0' or not ready.get('loaded'): raise RuntimeError('HDRI Library v0.26 did not load: '+json.dumps(ready))
    ui=evaluate("""(()=>{const old=[...document.querySelectorAll('.hdri24-import,.hdri-source25')].filter(x=>getComputedStyle(x).display!=='none').length;return {cards:document.querySelectorAll('[data-hdri26]').length,importBtn:!!document.querySelector('.hdri26-import'),oldVisible:old,sphere:!!document.getElementById('hdriSphere26'),file:document.getElementById('hdriFile26')?.textContent||''}})()""")
    print('V026 UI',json.dumps(ui,ensure_ascii=False))
    if ui.get('cards',0)<5 or not ui.get('importBtn') or ui.get('oldVisible')!=0 or not ui.get('sphere'): raise RuntimeError('HDRI templates/import/sphere UI is wrong: '+json.dumps(ui))
    sphere=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));window.__colorizeHdriStudio24SetBackground?.(true);const before=window.__colorizeHdri26Debug?.();const value=window.__colorizeHdri26SetSphereSize?.(2.5);await w(250);const after=window.__colorizeHdri26Debug?.();return {value,before,after}})()""",True)
    print('V026 SPHERE',json.dumps(sphere,ensure_ascii=False))
    a=(sphere or {}).get('after') or {}
    if abs(float(a.get('sphereSize') or 0)-2.5)>.01 or not a.get('sphereVisible'): raise RuntimeError('Skydome size did not apply: '+json.dumps(sphere))
    print('hdri-library-browser-smoke: PASS — real HDRI templates, single import and adjustable Skydome size work')
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
