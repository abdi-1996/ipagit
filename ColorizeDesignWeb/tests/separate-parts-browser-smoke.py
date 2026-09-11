import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:',e);sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT=4179;DEBUG_PORT=9228
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found');sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v019-');log=open('/tmp/colorize-v019-chrome.log','w+b')
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
    url=f'http://127.0.0.1:{PORT}/?v019-smoke=1'
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
    ready=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));for(let i=0;i<220;i++){if(document.readyState==='complete'&&typeof window.__colorizeSeparateParts19Debug==='function')break;await w(100)}document.querySelector('.mode[data-mode="view3d"]')?.click();for(let i=0;i<300;i++){const d=window.__colorizeSeparateParts19Debug?.();if(d?.objects>0&&d?.face>0&&d?.returns>0&&d?.back>0&&document.getElementById('threeLoading')?.hidden){await w(500);return d}await w(100)}return null})()""",True)
    if not ready: raise RuntimeError('v0.19 separate-parts engine did not become ready')
    print('V019 DEBUG',json.dumps(ready,ensure_ascii=False))
    if ready.get('version')!='0.19.0': raise RuntimeError('Wrong separate-parts engine version')
    if min(int(ready.get('face') or 0),int(ready.get('returns') or 0),int(ready.get('back') or 0))<1: raise RuntimeError('Face, returns and back were not created separately')
    ui=evaluate("""(()=>{const q=document.getElementById('quality19');return {panel:!!document.getElementById('partsPanel19'),face:!!document.querySelector('[data-part19="face"]'),returns:!!document.querySelector('[data-part19="returns"]'),back:!!document.querySelector('[data-part19="back"]'),quality:!!q,options:q?[...q.options].map(o=>o.value):[]}})()""")
    print('V019 UI',json.dumps(ui,ensure_ascii=False))
    if not ui or not all(ui.get(k) for k in ('panel','face','returns','back','quality')) or 'ultra' not in ui.get('options',[]): raise RuntimeError('Separate part visibility / quality controls are missing')
    print('separate-parts-browser-smoke: PASS — face, returns and back are independent meshes; individual controls and Ultra quality are available')
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
