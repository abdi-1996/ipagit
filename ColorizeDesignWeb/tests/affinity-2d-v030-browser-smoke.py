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
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=12); cid=0
    def call(method,params=None):
        global cid; cid+=1; my=cid
        ws.send(json.dumps({'id':my,'method':method,'params':params or {}}))
        while True:
            m=json.loads(ws.recv())
            if m.get('id')==my:
                if 'error' in m: raise RuntimeError(f"CDP {method}: {m['error']}")
                return m.get('result',{})
    def evaluate(expr):
        r=call('Runtime.evaluate',{'expression':expr,'returnByValue':True})
        if r.get('exceptionDetails'): raise RuntimeError('JS exception '+json.dumps(r['exceptionDetails']))
        return r.get('result',{}).get('value')
    call('Runtime.enable'); call('Page.enable')

    ready=False
    for _ in range(90):
        try:
            state=evaluate("window.__colorizeV030LoadState||'waiting'")
            if state=='error': break
            ready=bool(evaluate("window.__colorizeAffinity30Debug?.().version==='0.30.0' && document.querySelectorAll('[data-v030-tool]').length>=20"))
            if ready: break
        except Exception: pass
        time.sleep(.15)
    if not ready:
        diag=evaluate("(()=>({state:window.__colorizeV030LoadState||null,error:window.__colorizeV030LoadError||null,tools:document.querySelectorAll('[data-v030-tool]').length,affinityBase:!!document.getElementById('affinityTools16'),bodyClass:document.body.className}))()")
        print('V030 STARTUP DIAGNOSTIC',json.dumps(diag,ensure_ascii=False),flush=True)
        raise RuntimeError('v0.30 editor did not become ready: '+str(diag))

    before=evaluate("(()=>({debug:window.__colorizeAffinity30Debug?.(),toolbar:document.querySelectorAll('[data-v030-tool]').length,shapes:document.querySelectorAll('[data-v030-shape]').length,context:!!document.getElementById('v030ToolContext'),studio:document.querySelectorAll('#v030StudioNav button').length,guard:!!window.__colorizeV030ObserverGuard?.active}))()")
    created=bool(evaluate("!!window.__colorizeAffinity30CreateShape?.('ellipse')"))
    time.sleep(.8)
    vector_before=evaluate("(()=>{const raw=localStorage.getItem('colorize-design-web-v04'),p=raw?JSON.parse(raw):null,a=p?.artboards?.find(x=>x.id===p.activeArtboardId)||p?.artboards?.[0],o=a?.objects?.find(x=>x.id===p.selectedObjectId);return o?{type:o.type,kind:o.vectorKind,fill:o.fill}:null})()")
    svg_before=bool(evaluate("!!document.querySelector('#world .obj.vector .v030-vector-svg')"))
    evaluate("window.__colorizeAffinity30Convert?.(); true")
    time.sleep(.8)
    vector_after=evaluate("(()=>{const raw=localStorage.getItem('colorize-design-web-v04'),p=raw?JSON.parse(raw):null,a=p?.artboards?.find(x=>x.id===p.activeArtboardId)||p?.artboards?.[0],o=a?.objects?.find(x=>x.id===p.selectedObjectId);return o?{type:o.type,kind:o.vectorKind,points:o.points?.length||0}:null})()")
    svg_after=bool(evaluate("!!document.querySelector('#world .obj.vector .v030-vector-svg')"))
    result={'before':before,'created':created,'vectorBefore':vector_before,'vectorAfter':vector_after,'svg':svg_before or svg_after}
    print('V030 AFFINITY 2D',json.dumps(result,ensure_ascii=False),flush=True)
    debug=(before or {}).get('debug') or {}
    if debug.get('version')!='0.30.0': raise RuntimeError('v0.30 editor did not load')
    if (before or {}).get('toolbar',0)<24: raise RuntimeError('full left tool rail missing')
    if (before or {}).get('shapes',0)<13: raise RuntimeError('shape flyout incomplete')
    if not (before or {}).get('context') or (before or {}).get('studio',0)<4: raise RuntimeError('Affinity navigation/context UI missing')
    if not (before or {}).get('guard'): raise RuntimeError('v0.30 observer stability guard missing')
    if not created or (vector_before or {}).get('kind')!='ellipse': raise RuntimeError('vector shape creation failed')
    if (vector_after or {}).get('kind')!='path' or (vector_after or {}).get('points',0)<8: raise RuntimeError('convert to curves failed')
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
