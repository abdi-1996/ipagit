import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:',e);sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT=4181;DEBUG_PORT=9230
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found');sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v020-');log=open('/tmp/colorize-v020-chrome.log','w+b')
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
    url=f'http://127.0.0.1:{PORT}/?v019-smoke=1&v020-acrylic=1'
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
    ready=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));for(let i=0;i<220;i++){const d=window.__colorizeAcrylic20Debug?.();const s=document.querySelector('select[data-prop="faceMaterial"]');if(d?.version==='0.20.0'&&s&&[...s.options].some(o=>o.value==='acrylic-mirror-gold'))return {d,opts:[...s.options].map(o=>o.value)};await w(100)}return null})()""",True)
    if not ready: raise RuntimeError('v0.20 acrylic material library did not become ready')
    required=['acrylic-clear','acrylic-opal','acrylic-white','acrylic-colored-clear','acrylic-colored-opal','acrylic-satin','acrylic-gloss','acrylic-mirror-gold','acrylic-mirror-silver','acrylic-fluorescent','acrylic-edge-lit','acrylic-led-diffuser','acrylic-impact','acrylic-cast','acrylic-extruded']
    missing=[k for k in required if k not in ready['d'].get('profiles',[]) or k not in ready.get('opts',[])]
    if missing: raise RuntimeError('Missing acrylic profiles/options: '+','.join(missing))
    applied=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));const s=document.querySelector('select[data-prop="faceMaterial"]');s.value='acrylic-mirror-gold';s.dispatchEvent(new Event('input',{bubbles:true}));await w(350);document.querySelector('.mode[data-mode="view3d"]')?.click();for(let i=0;i<260;i++){const d=window.__colorizeAcrylic20Debug?.();if(d?.last?.key==='acrylic-mirror-gold'&&d.applied>0)return d;await w(100)}return null})()""",True)
    if not applied: raise RuntimeError('Mirror Gold acrylic was not applied to the 3D mesh')
    print('V020 ACRYLIC',json.dumps(applied,ensure_ascii=False))
    print('acrylic-materials-browser-smoke: PASS — 15 acrylic presets are available and a selected preset is applied to the separate 3D face mesh')
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
