import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:',e);sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT=4191;DEBUG_PORT=9241
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found');sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v027-');log=open('/tmp/colorize-v027-chrome.log','w+b')
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
    url=f'http://127.0.0.1:{PORT}/?v027-unified-hdri=1'
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
    result=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));for(let i=0;i<220;i++){if(typeof window.__colorizeHdri27Debug==='function'&&document.getElementById('hdriUnified27'))break;await w(100)}document.getElementById('lightingBtn')?.click();document.querySelector('[data-light-mode="hdr"]')?.click();document.querySelector('.mode[data-mode="view3d"]')?.click();for(let i=0;i<220;i++){const d=window.__colorizeHdri27Debug?.();if(d?.version==='0.27.0'){await window.__colorizeHdri27Select('jeksterer');break}await w(100)}for(let i=0;i<180;i++){const d=window.__colorizeHdri27Debug?.();if(d?.loaded&&d.environmentSource==='jeksterer'&&d.reflectionSource==='jeksterer')break;await w(100)}window.__colorizeHdri27SetSphere(2.5);await w(250);const size=document.getElementById('hdriSphere27');const box=document.getElementById('hdriUnified27');const active=[...document.querySelectorAll('[data-hdri27].active')].map(x=>x.dataset.hdri27);const oldVisible=[...document.querySelectorAll('.hdri-studio24,.hdri-library26,.hdri-source25,.hdr-upload-v013,#hdrPreset12')].filter(x=>getComputedStyle(x).display!=='none').length;return {debug:window.__colorizeHdri27Debug?.(),sizeExists:!!size,sizeVisible:!!size&&getComputedStyle(size).display!=='none',sizeValue:size?.value,boxVisible:!!box&&getComputedStyle(box).display!=='none',active,oldVisible,importCount:document.querySelectorAll('#hdriUnified27 input[type="file"]').length}})()""",True)
    print('V027 UNIFIED HDRI',json.dumps(result,ensure_ascii=False),flush=True)
    d=(result or {}).get('debug') or {}
    if d.get('version')!='0.27.0': raise RuntimeError('v0.27 unified HDRI module did not load')
    if not result.get('boxVisible') or not result.get('sizeExists') or not result.get('sizeVisible'): raise RuntimeError('HDRI size control is not visible')
    if abs(float(result.get('sizeValue') or 0)-2.5)>.01 or abs(float(d.get('sphereSize') or 0)-2.5)>.01: raise RuntimeError('HDRI sphere size does not apply')
    if result.get('active')!=['jeksterer'] or int(d.get('activeCount') or 0)!=1: raise RuntimeError('More than one HDRI is selected')
    if d.get('environmentSource')!='jeksterer' or d.get('reflectionSource')!='jeksterer': raise RuntimeError('Lighting and reflections do not share the same HDRI source')
    if int(result.get('importCount') or 0)!=1: raise RuntimeError('There must be exactly one HDRI import input')
    if int(result.get('oldVisible') or 0)!=0: raise RuntimeError('Old HDRI selectors are still visible')
    print('unified-hdri-browser-smoke: PASS — one HDRI drives lighting/reflections and size control is visible')
finally:
    try:
        if ws: ws.close()
    except: pass
    for p in (chrome,server):
        try:p.terminate()
        except: pass
    for p in (chrome,server):
        try:p.wait(timeout=3)
        except:
            try:p.kill()
            except: pass
    log.close();shutil.rmtree(profile,ignore_errors=True)
