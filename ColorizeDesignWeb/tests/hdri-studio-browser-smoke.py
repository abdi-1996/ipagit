import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:',e);sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT=4186;DEBUG_PORT=9235
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found');sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v024-');log=open('/tmp/colorize-v024-chrome.log','w+b')
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
    url=f'http://127.0.0.1:{PORT}/?v024-hdri=1'
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
        last=None
        for _ in range(20):
            try:
                r=call('Runtime.evaluate',{'expression':expr,'returnByValue':True,'awaitPromise':await_promise})
                if r.get('exceptionDetails'): raise RuntimeError('JS exception '+json.dumps(r['exceptionDetails']))
                return r.get('result',{}).get('value')
            except RuntimeError as e:
                last=e
                if 'Execution context was destroyed' not in str(e): raise
                time.sleep(.25)
        raise last
    ready=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));for(let i=0;i<240;i++){if(document.readyState==='complete'&&typeof window.__colorizeHdriStudio24Debug==='function')break;await w(100)}document.querySelector('.mode[data-mode="view3d"]')?.click();for(let i=0;i<320;i++){const d=window.__colorizeHdriStudio24Debug?.();if(d?.version==='0.24.0'&&document.getElementById('hdriModeBtn24')&&document.getElementById('hdriUpload24')){await w(350);return d}await w(100)}return null})()""",True)
    if not ready: raise RuntimeError('HDRI Studio v0.24 did not become ready')
    ui=evaluate("""(()=>{const u=document.getElementById('hdriUpload24');return {panel:!!document.querySelector('.hdri-studio24'),button:!!document.getElementById('hdriModeBtn24'),upload:!!u,accept:u?.accept||'',tilt:!!document.getElementById('hdriTilt24'),reflect:!!document.getElementById('hdriReflect24'),bg:!!document.getElementById('hdriBackground24')}})()""")
    print('V024 UI',json.dumps(ui,ensure_ascii=False))
    if not ui or not all(ui.get(k) for k in ('panel','button','upload','tilt','reflect','bg')): raise RuntimeError('HDRI Studio controls are missing')
    if '.hdr' not in ui.get('accept','').lower() or '.exr' not in ui.get('accept','').lower(): raise RuntimeError('HDR/EXR import is not enabled')
    before=float(ready.get('rotation') or 0)
    after=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));const d=window.__colorizeHdriStudio24TestRotate?.(80,12);await w(180);return window.__colorizeHdriStudio24Debug?.()||d})()""",True)
    print('V024 ROTATE',json.dumps({'before':before,'after':after},ensure_ascii=False))
    if not after or not after.get('mode'): raise RuntimeError('HDRI viewport mode did not activate')
    if abs(float(after.get('rotation') or 0)-before)<5: raise RuntimeError('HDRI viewport drag did not rotate environment')
    bg=evaluate("""(()=>{const on=window.__colorizeHdriStudio24SetBackground?.(true);const d1=window.__colorizeHdriStudio24Debug?.();const off=window.__colorizeHdriStudio24SetBackground?.(false);const d2=window.__colorizeHdriStudio24Debug?.();return {on,onState:d1?.background,off,offState:d2?.background}})()""")
    print('V024 BACKGROUND',json.dumps(bg,ensure_ascii=False))
    if not bg or bg.get('onState') is not True or bg.get('offState') is not False: raise RuntimeError('HDRI background toggle failed')
    print('hdri-studio-browser-smoke: PASS — HDR/EXR import UI, Maya-style viewport rotation and background controls work')
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
