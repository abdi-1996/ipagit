import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:',e);sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT=4185;DEBUG_PORT=9234
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found');sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v023-');log=open('/tmp/colorize-v023-chrome.log','w+b')
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
    url=f'http://127.0.0.1:{PORT}/?v023-facefit=1'
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
    result=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));for(let i=0;i<220;i++){if(typeof window.__colorizeFaceContour23Debug==='function')break;await w(100)}document.querySelector('.mode[data-mode="view3d"]')?.click();for(let i=0;i<320;i++){const d=window.__colorizeFaceContour23Debug?.();if(d?.version==='0.23.0'&&d.corrected>0&&d.objects>0&&d.maxDelta<=0.00002){await w(300);return d}await w(100)}return window.__colorizeFaceContour23Debug?.()||null})()""",True)
    print('V023 FACE FIT',json.dumps(result,ensure_ascii=False))
    if not result or result.get('version')!='0.23.0': raise RuntimeError('v0.23 face contour module did not load')
    if int(result.get('corrected') or 0)<1: raise RuntimeError('No front face was corrected')
    max_delta=result.get('maxDelta')
    if max_delta is None or float(max_delta)>0.00002: raise RuntimeError('Front face still exceeds returns/back XY contour')
    last=result.get('last') or {}
    for a,b in [('faceW','returnsW'),('faceH','returnsH'),('faceW','backW'),('faceH','backH')]:
        if abs(float(last.get(a,0))-float(last.get(b,0)))>0.00002: raise RuntimeError(f'Contour mismatch: {a} != {b}')
    print('face-contour-fit-browser-smoke: PASS — face, returns and back share the exact same XY outline')
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
