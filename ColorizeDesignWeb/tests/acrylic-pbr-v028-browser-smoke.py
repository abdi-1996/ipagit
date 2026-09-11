import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:',e);sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT=4192;DEBUG_PORT=9242
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found');sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v028-');log=open('/tmp/colorize-v028-chrome.log','w+b')
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
    url=f'http://127.0.0.1:{PORT}/?v028-acrylic=1'
    req=urllib.request.Request(f'http://127.0.0.1:{DEBUG_PORT}/json/new?{urllib.parse.quote(url,safe=":/?=&")}',method='PUT')
    with urllib.request.urlopen(req,timeout=5) as r: page=json.load(r)
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=50);cid=0
    def call(method,params=None):
        nonlocal_cid=None
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
    result=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));
      for(let i=0;i<220;i++){if(typeof window.__colorizeAcrylic28Debug==='function'&&document.querySelector('select[data-prop="faceMaterial"]'))break;await w(100)}
      for(const key of ['faceMaterial','returnMaterial','backMaterial']){const el=document.querySelector(`select[data-prop="${key}"]`);if(el){el.value='acrylic';el.dispatchEvent(new Event('input',{bubbles:true}))}}
      await w(350);document.querySelector('.mode[data-mode="view3d"]')?.click();
      for(let i=0;i<260;i++){const d=window.__colorizeAcrylic28Debug?.();if(d?.version==='0.28.0'&&d.applied>=1&&d.samples?.some(x=>x.kind==='acrylic'))break;await w(100)}
      const reflect=document.getElementById('hdriReflect27');
      return {debug:window.__colorizeAcrylic28Debug?.(),reflectionMax:reflect?.max,reflectionLabel:reflect?.closest('.hdri27-row')?.querySelector('span')?.textContent||''}})()""",True)
    print('V028 ACRYLIC PBR',json.dumps(result,ensure_ascii=False),flush=True)
    d=(result or {}).get('debug') or {};samples=[x for x in (d.get('samples') or []) if x.get('kind')=='acrylic']
    if d.get('version')!='0.28.0': raise RuntimeError('v0.28 acrylic module did not load')
    if not samples: raise RuntimeError('standard acrylic material was not found in 3D scene')
    for s in samples:
        if abs(float(s.get('opacity') or 0)-1)>0.001: raise RuntimeError('standard acrylic opacity is not 1')
        if bool(s.get('transparent')): raise RuntimeError('standard acrylic is using alpha transparency')
        if abs(float(s.get('transmission') or 0))>0.001: raise RuntimeError('standard acrylic still has transmission')
        if abs(float(s.get('metalness') or 0))>0.001: raise RuntimeError('standard acrylic incorrectly behaves as metal')
        if not (0.18<=float(s.get('roughness') or 0)<=0.35): raise RuntimeError('standard acrylic roughness is outside realistic range')
        if float(s.get('envMapIntensity') or 0)>1.35: raise RuntimeError('acrylic reflection intensity is too strong')
    if str(result.get('reflectionMax'))!='2': raise RuntimeError('HDRI reflection control is not normalized to max 2')
    if 'PBR' not in str(result.get('reflectionLabel') or ''): raise RuntimeError('PBR reflection label not visible')
    print('acrylic-pbr-v028-browser-smoke: PASS — ordinary acrylic is opaque and HDRI reflections are normalized')
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
