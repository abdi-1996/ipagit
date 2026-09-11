import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:', e); sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..')); PORT=4196; DEBUG_PORT=9246
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found'); sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v030-'); log=open('/tmp/colorize-v030-chrome.log','w+b')
chrome=subprocess.Popen([browser,'--headless=new','--no-sandbox','--disable-dev-shm-usage','--remote-allow-origins=*',f'--remote-debugging-port={DEBUG_PORT}',f'--user-data-dir={profile}','about:blank'],stdout=log,stderr=log)
ws=None
try:
    version=None
    for _ in range(100):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{DEBUG_PORT}/json/version',timeout=1) as r: version=json.load(r)
            if version.get('webSocketDebuggerUrl'): break
        except Exception: time.sleep(.2)
    if not version: raise RuntimeError('Chrome DevTools endpoint not available')
    url=f'http://127.0.0.1:{PORT}/?v030-affinity=1'
    req=urllib.request.Request(f'http://127.0.0.1:{DEBUG_PORT}/json/new?{urllib.parse.quote(url,safe=":/?=&")}',method='PUT')
    with urllib.request.urlopen(req,timeout=5) as r: page=json.load(r)
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=25); cid=0
    def call(method,params=None):
        global cid; cid+=1; my=cid
        ws.send(json.dumps({'id':my,'method':method,'params':params or {}}))
        while True:
            m=json.loads(ws.recv())
            if m.get('id')==my:
                if 'error' in m: raise RuntimeError(f"CDP {method}: {m['error']}")
                return m.get('result',{})
    def evaluate(expr,await_promise=False):
        r=call('Runtime.evaluate',{'expression':expr,'returnByValue':True,'awaitPromise':await_promise})
        if r.get('exceptionDetails'): raise RuntimeError('JS exception '+json.dumps(r['exceptionDetails']))
        return r.get('result',{}).get('value')
    call('Runtime.enable'); call('Page.enable')
    result=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));for(let i=0;i<140;i++){if(window.__colorizeAffinity30Debug?.().version==='0.30.0'&&document.querySelectorAll('[data-v030-tool]').length>=20)break;await w(100)}const before=window.__colorizeAffinity30Debug?.();const created=window.__colorizeAffinity30CreateShape?.('ellipse');await w(550);let raw=localStorage.getItem('colorize-design-web-v04'),p=raw?JSON.parse(raw):null,a=p?.artboards?.find(x=>x.id===p.activeArtboardId)||p?.artboards?.[0],o=a?.objects?.find(x=>x.id===p.selectedObjectId);const vectorBefore=o?{type:o.type,kind:o.vectorKind,fill:o.fill}:null;window.__colorizeAffinity30Convert?.();await w(450);raw=localStorage.getItem('colorize-design-web-v04');p=raw?JSON.parse(raw):null;a=p?.artboards?.find(x=>x.id===p.activeArtboardId)||p?.artboards?.[0];o=a?.objects?.find(x=>x.id===p.selectedObjectId);return {before,created:!!created,toolbar:document.querySelectorAll('[data-v030-tool]').length,shapes:document.querySelectorAll('[data-v030-shape]').length,context:!!document.getElementById('v030ToolContext'),studio:document.querySelectorAll('#v030StudioNav button').length,vectorBefore,vectorAfter:o?{type:o.type,kind:o.vectorKind,points:o.points?.length||0}:null,svg:!!document.querySelector('#world .obj.vector .v030-vector-svg')}})()""",True)
    print('V030 AFFINITY 2D',json.dumps(result,ensure_ascii=False),flush=True)
    if (result.get('before') or {}).get('version')!='0.30.0': raise RuntimeError('v0.30 editor did not load')
    if result.get('toolbar',0)<24: raise RuntimeError('full left tool rail missing')
    if result.get('shapes',0)<13: raise RuntimeError('shape flyout incomplete')
    if not result.get('context') or result.get('studio',0)<4: raise RuntimeError('Affinity navigation/context UI missing')
    if not result.get('created') or (result.get('vectorBefore') or {}).get('kind')!='ellipse': raise RuntimeError('vector shape creation failed')
    if (result.get('vectorAfter') or {}).get('kind')!='path' or (result.get('vectorAfter') or {}).get('points',0)<8: raise RuntimeError('convert to curves failed')
    if not result.get('svg'): raise RuntimeError('vector SVG renderer missing')
    print('affinity-2d-v030-browser-smoke: PASS — professional left tools, shapes and editable vectors work')
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
