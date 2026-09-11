import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:',e);sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT=4177;DEBUG_PORT=9226
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found');sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v016-');log=open('/tmp/colorize-v016-chrome.log','w+b')
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
    url=f'http://127.0.0.1:{PORT}/?v016-smoke=1'
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
    def evaluate(expr,await_promise=False,retries=12):
        for i in range(retries):
            try:
                r=call('Runtime.evaluate',{'expression':expr,'returnByValue':True,'awaitPromise':await_promise})
                if r.get('exceptionDetails'): raise RuntimeError('JS exception '+json.dumps(r['exceptionDetails']))
                return r.get('result',{}).get('value')
            except RuntimeError as e:
                if 'Execution context was destroyed' in str(e) and i<retries-1: time.sleep(.35);continue
                raise
    ready=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));for(let i=0;i<260;i++){if(document.readyState==='complete'&&window.__colorizeAffinity16&&document.querySelector('.artboard.active .obj.selected')&&document.getElementById('affinityContext16')){await w(700);return true}await w(100)}return false})()""",True)
    if not ready: raise RuntimeError('v0.16 workspace did not become ready')
    state=evaluate("""(()=>{const a=document.querySelector('.artboard.active'),o=a?.querySelector('.obj.selected');return{debug:window.__colorizeAffinity16.debug(),tools:document.querySelectorAll('.aff-tool16').length,menus:document.querySelectorAll('[data-aff-menu]').length,rulers:!!document.getElementById('affRulerTop16'),x:parseFloat(o.style.left),w:parseFloat(o.style.width),aw:parseFloat(a.style.width)}})()""")
    print('V016 UI',json.dumps(state,ensure_ascii=False))
    if state['debug'].get('version')!='0.16.0': raise RuntimeError('Wrong v0.16 workspace version')
    if state['tools']<8 or state['menus']<5 or not state['rulers']: raise RuntimeError('Affinity-style navigation UI is incomplete')
    if not str(state['debug'].get('context') or '').startswith('Текст'): raise RuntimeError('Context toolbar did not detect selected text')

    centered=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));window.__colorizeAffinity16.align('hcenter');await w(450);const a=document.querySelector('.artboard.active'),o=a.querySelector('.obj.selected');return{x:parseFloat(o.style.left),expected:(parseFloat(a.style.width)-parseFloat(o.style.width))/2}})()""",True)
    print('V016 ALIGN',json.dumps(centered))
    if abs(centered['x']-centered['expected'])>.6: raise RuntimeError('ALIGN FAIL: horizontal center did not update live')

    snapped=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));const a=document.querySelector('.artboard.active'),o=a.querySelector('.obj.selected');const target=(parseFloat(a.style.width)-parseFloat(o.style.width))/2;window.__colorizeAffinity16.setProp('x',target+3);await w(180);window.__colorizeAffinity16.snapSelection();await w(420);const n=document.querySelector('.artboard.active .obj.selected');return{x:parseFloat(n.style.left),target,snap:window.__colorizeAffinity16.debug().snap}})()""",True)
    print('V016 SNAP',json.dumps(snapped))
    if not snapped['snap'] or abs(snapped['x']-snapped['target'])>.6: raise RuntimeError('SNAP FAIL: smart guide did not snap object to Artboard center')

    pasted=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));const before=document.querySelectorAll('.artboard.active .obj').length;window.__colorizeAffinity16.copySelected();window.__colorizeAffinity16.pasteObject();await w(700);const after=document.querySelectorAll('.artboard.active .obj').length;return{before,after,debug:window.__colorizeAffinity16.debug()}})()""",True)
    print('V016 COPY PASTE',json.dumps(pasted,ensure_ascii=False))
    if pasted['after']!=pasted['before']+1: raise RuntimeError('COPY/PASTE FAIL: pasted object not added to active Artboard')

    print('affinity-workspace-browser-smoke: PASS — navigation, contextual transform, alignment, snapping and copy/paste work in the real 2D viewport')
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
