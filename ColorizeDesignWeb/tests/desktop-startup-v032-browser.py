import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:', e); sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..')); PORT=4201; DEBUG_PORT=9251
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found'); sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v032-desktop-'); log=open('/tmp/colorize-v032-desktop.log','w+b')
chrome=subprocess.Popen([browser,'--headless=new','--no-sandbox','--disable-dev-shm-usage','--remote-allow-origins=*','--window-size=1440,1000',f'--remote-debugging-port={DEBUG_PORT}',f'--user-data-dir={profile}','about:blank'],stdout=log,stderr=log)
ws=None
try:
    version=None
    for _ in range(100):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{DEBUG_PORT}/json/version',timeout=1) as r: version=json.load(r)
            if version.get('webSocketDebuggerUrl'): break
        except Exception: time.sleep(.2)
    if not version: raise RuntimeError('Chrome DevTools endpoint not available')
    url=f'http://127.0.0.1:{PORT}/?v032-desktop-startup=1'
    req=urllib.request.Request(f'http://127.0.0.1:{DEBUG_PORT}/json/new?{urllib.parse.quote(url,safe=":/?=&")}',method='PUT')
    with urllib.request.urlopen(req,timeout=5) as r: page=json.load(r)
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=2); cid=0
    def call(method,params=None,seconds=3):
        nonlocal_dummy=None
        global cid; cid+=1; my=cid
        ws.send(json.dumps({'id':my,'method':method,'params':params or {}}))
        deadline=time.monotonic()+seconds
        while time.monotonic()<deadline:
            ws.settimeout(max(.15,min(.5,deadline-time.monotonic())))
            try: m=json.loads(ws.recv())
            except websocket.WebSocketTimeoutException: continue
            if m.get('id')==my:
                if 'error' in m: raise RuntimeError(f"CDP {method}: {m['error']}")
                return m.get('result',{})
        raise TimeoutError(f'CDP timeout: {method}')
    def evaluate(expr):
        r=call('Runtime.evaluate',{'expression':expr,'returnByValue':True},3)
        if r.get('exceptionDetails'): raise RuntimeError('JS exception '+json.dumps(r['exceptionDetails']))
        return r.get('result',{}).get('value')
    ready=False; last=''
    for i in range(50):
        try:
            value=evaluate("(()=>({state:window.__colorizeV032LoadState||'',err:window.__colorizeV032LoadError||'',tools:document.querySelectorAll('[data-v030-tool]').length,objects:document.querySelectorAll('#world .obj').length,w:innerWidth,h:innerHeight}))()")
            last=value
            print('DESKTOP POLL',i,json.dumps(value,ensure_ascii=False),flush=True)
            if value.get('state')=='ready' and value.get('tools')==24 and value.get('objects',0)>=1:
                ready=True; break
        except Exception as e:
            last=str(e); print('DESKTOP POLL',i,'ERROR',e,flush=True)
        time.sleep(.35)
    if not ready: raise RuntimeError('desktop 1440x1000 editor not responsive/ready: '+str(last))
    print('desktop-startup-v032-browser: PASS',json.dumps(last,ensure_ascii=False),flush=True)
finally:
    try:
        if ws: ws.close()
    except: pass
    for p in (chrome,server):
        try: p.terminate()
        except: pass
    for p in (chrome,server):
        try: p.wait(timeout=3)
        except:
            try: p.kill()
            except: pass
    log.close(); shutil.rmtree(profile,ignore_errors=True)
