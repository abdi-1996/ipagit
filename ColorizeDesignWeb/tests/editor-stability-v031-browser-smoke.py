import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:', e); sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..')); PORT=4197; DEBUG_PORT=9247
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found'); sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v031-'); log=open('/tmp/colorize-v031-chrome.log','w+b')
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
    url=f'http://127.0.0.1:{PORT}/?v031-stability=1'
    req=urllib.request.Request(f'http://127.0.0.1:{DEBUG_PORT}/json/new?{urllib.parse.quote(url,safe=":/?=&")}',method='PUT')
    with urllib.request.urlopen(req,timeout=5) as r: page=json.load(r)
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=14); cid=0
    def call(method,params=None):
        nonlocal_dummy=None
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
    for _ in range(100):
        try:
            ready=bool(evaluate("window.__colorizeV031LoadState==='ready' && window.__colorizeText31Debug?.().version==='0.31.0' && window.__colorizeTools31Debug?.().toolCount>=24"))
            if ready: break
        except Exception: pass
        time.sleep(.15)
    if not ready:
        err=evaluate("window.__colorizeV031LoadError||window.__colorizeV030LoadError||'not ready'")
        raise RuntimeError('v0.31 editor did not become ready: '+str(err))

    before=evaluate("(()=>({objects:document.querySelectorAll('#world .obj').length,texts:document.querySelectorAll('#world .obj.text').length,tools:window.__colorizeTools31Debug?.(),aff:window.__colorizeAffinity30Debug?.()}))()")
    if before.get('objects',0)<1 or before.get('texts',0)<1: raise RuntimeError('initial canvas objects missing')
    if (before.get('tools') or {}).get('toolCount',0)<24: raise RuntimeError('tool rail incomplete')

    started=bool(evaluate("window.__colorizeText31Start?.()"))
    if not started: raise RuntimeError('stable text editor did not start')
    editing=evaluate("window.__colorizeText31Debug?.()") or {}
    if not editing.get('editorConnected') or not editing.get('hostHidden'): raise RuntimeError('non-destructive editor overlay not active')
    evaluate("document.getElementById('colorizeTextEditor31').value='COLORIZE STABLE 31'; true")
    time.sleep(2.1)
    stable=evaluate("(()=>({debug:window.__colorizeText31Debug?.(),editor:!!document.getElementById('colorizeTextEditor31'),objects:document.querySelectorAll('#world .obj').length}))()")
    if not stable.get('editor') or not (stable.get('debug') or {}).get('editorConnected'): raise RuntimeError('text editor disappeared during observer activity')
    if stable.get('objects',0)<1: raise RuntimeError('canvas blinked/emptied during text editing')
    evaluate("window.__colorizeText31Commit?.(); true")
    time.sleep(.8)
    saved=evaluate("(()=>{const p=JSON.parse(localStorage.getItem('colorize-design-web-v04')||'null');const a=p?.artboards?.find(x=>x.id===p.activeArtboardId)||p?.artboards?.[0];const o=a?.objects?.find(x=>x.id===p.selectedObjectId);return {text:o?.text,dom:document.querySelector('#world .obj.text.selected')?.dataset.text||'',editor:!!document.getElementById('colorizeTextEditor31'),objects:document.querySelectorAll('#world .obj').length}})()")
    if saved.get('text')!='COLORIZE STABLE 31': raise RuntimeError('edited text was not saved')
    if saved.get('editor'): raise RuntimeError('editor overlay remained after commit')
    if saved.get('objects',0)<1: raise RuntimeError('canvas empty after text commit')

    created=bool(evaluate("!!window.__colorizeAffinity30CreateShape?.('roundRect')")); time.sleep(.7)
    if not created: raise RuntimeError('vector creation failed')
    patched=bool(evaluate("window.__colorizeTools31Patch?.({strokeWidth:3.2,opacity:.73,cornerRadius:22,gradient:true,gradientAngle:35})")); time.sleep(.7)
    vec=evaluate("(()=>{const p=JSON.parse(localStorage.getItem('colorize-design-web-v04')||'null');const a=p?.artboards?.find(x=>x.id===p.activeArtboardId)||p?.artboards?.[0],o=a?.objects?.find(x=>x.id===p.selectedObjectId);return o?{type:o.type,kind:o.vectorKind,strokeWidth:o.strokeWidth,opacity:o.opacity,cornerRadius:o.cornerRadius,gradient:o.gradient,angle:o.gradientAngle}:null})()")
    if not patched or not vec or vec.get('type')!='vector' or vec.get('kind')!='roundRect': raise RuntimeError('vector tool target failed')
    if abs(vec.get('strokeWidth',0)-3.2)>.01 or abs(vec.get('opacity',0)-.73)>.01 or vec.get('cornerRadius')!=22 or not vec.get('gradient') or vec.get('angle')!=35: raise RuntimeError('enhanced tool properties did not persist')
    print('V031 STABILITY',json.dumps({'before':before,'editing':editing,'stable':stable,'saved':saved,'vector':vec},ensure_ascii=False),flush=True)
    print('editor-stability-v031-browser-smoke: PASS — text stays visible/stable and enhanced 2D tools persist')
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
