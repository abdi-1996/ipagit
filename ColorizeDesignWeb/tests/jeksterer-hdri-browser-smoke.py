import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:',e);sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT=4187;DEBUG_PORT=9236
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found');sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v025-');log=open('/tmp/colorize-v025-chrome.log','w+b')
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
    url=f'http://127.0.0.1:{PORT}/?v025-hdri=1'
    req=urllib.request.Request(f'http://127.0.0.1:{DEBUG_PORT}/json/new?{urllib.parse.quote(url,safe=":/?=&")}',method='PUT')
    with urllib.request.urlopen(req,timeout=5) as r: page=json.load(r)
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=40);cid=0
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

    ui=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));for(let i=0;i<220;i++){if(document.readyState==='complete'&&typeof window.__colorizeHdri25Debug==='function')break;await w(100)}document.querySelector('.mode[data-mode="view3d"]')?.click();document.getElementById('lightingBtn')?.click();for(let i=0;i<220;i++){if(document.querySelector('[data-light-mode="hdr"]')&&document.getElementById('jekstererHdri25')&&document.getElementById('hdriUpload25'))break;await w(100)}document.querySelector('[data-light-mode="hdr"]')?.click();const input=document.getElementById('hdriUpload25');return {module:typeof window.__colorizeHdri25Debug==='function',button:!!document.getElementById('jekstererHdri25'),input:{exists:!!input,accept:input?.accept||''}}})()""",True)
    print('V025 UI',json.dumps(ui,ensure_ascii=False))
    if not ui or not ui.get('module') or not ui.get('button'): raise RuntimeError('Jeksterer HDRI source UI is missing')
    inp=ui.get('input') or {}
    if not inp.get('exists') or '.hdr' not in inp.get('accept','') or '.exr' not in inp.get('accept',''): raise RuntimeError('Reliable HDR/EXR import input is missing')

    built=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));const ok=await window.__colorizeHdri25UseBuiltin?.();for(let i=0;i<180;i++){const d=window.__colorizeHdri25Debug?.();if(d?.loaded&&d.source==='jeksterer')return {ok,debug:d};await w(100)}return {ok,debug:window.__colorizeHdri25Debug?.()||null}})()""",True)
    print('V025 BUILTIN',json.dumps(built,ensure_ascii=False))
    bd=(built or {}).get('debug') or {}
    if not (built or {}).get('ok') or bd.get('version')!='0.25.0' or bd.get('source')!='jeksterer' or not bd.get('loaded'): raise RuntimeError('Built-in Jeksterer HDRI did not load: '+json.dumps(bd))
    if int(bd.get('builtInBytes') or 0)<25000: raise RuntimeError('Built-in Jeksterer HDRI asset is incomplete')
    if int(bd.get('width') or 0)!=128 or int(bd.get('height') or 0)!=64: raise RuntimeError('Unexpected built-in HDRI dimensions')

    custom=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));const ab=await window.__colorizeHdri25BuiltInBuffer?.();const file=new File([ab],'iphone-import-test.hdr',{type:'image/vnd.radiance'});const ok=await window.__colorizeHdri25ImportForTest?.(file);for(let i=0;i<180;i++){const d=window.__colorizeHdri25Debug?.();if(d?.loaded&&d.source==='custom'&&d.lastImport==='iphone-import-test.hdr')return {ok,debug:d};await w(100)}return {ok,debug:window.__colorizeHdri25Debug?.()||null}})()""",True)
    print('V025 CUSTOM',json.dumps(custom,ensure_ascii=False))
    cd=(custom or {}).get('debug') or {}
    if not (custom or {}).get('ok') or cd.get('source')!='custom' or cd.get('lastImport')!='iphone-import-test.hdr': raise RuntimeError('ArrayBuffer custom import path failed: '+json.dumps(cd))
    if cd.get('importPath')!='arrayBuffer': raise RuntimeError('Custom import is not using the iPhone-safe ArrayBuffer path')

    evaluate("window.__colorizeHdri25UseBuiltin?.()",False)
    print('jeksterer-hdri-browser-smoke: PASS — built-in Jeksterer HDRI loads and custom HDR import uses ArrayBuffer persistence')
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
