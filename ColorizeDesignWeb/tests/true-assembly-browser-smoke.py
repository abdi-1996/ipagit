import base64, hashlib, json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:',e);sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT=4176;DEBUG_PORT=9225
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found');sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v015-');log=open('/tmp/colorize-v015-chrome.log','w+b')
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
    url=f'http://127.0.0.1:{PORT}/?v015-smoke=1'
    req=urllib.request.Request(f'http://127.0.0.1:{DEBUG_PORT}/json/new?{urllib.parse.quote(url,safe=":/?=&")}',method='PUT')
    with urllib.request.urlopen(req,timeout=5) as r: page=json.load(r)
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=30)
    cid=0
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
    ready=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));for(let i=0;i<200;i++){if(document.readyState==='complete'&&document.querySelector('.mode[data-mode="view3d"]')&&typeof window.__colorizeAssembly15Debug==='function')break;await w(100)}document.querySelector('.mode[data-mode="view3d"]')?.click();for(let i=0;i<260;i++){const d=window.__colorizeAssembly15Debug?.();const c=document.querySelector('#threeHost canvas');if(d?.objects>0&&c&&c.width>100&&document.getElementById('threeLoading')?.hidden){await w(600);return d}await w(100)}return null})()""",True)
    if not ready: raise RuntimeError('v0.15 assembly did not become ready')
    smooth=evaluate("""(()=>{let result=null;const prev=globalThis.__colorizeBeforeThreeRender;
      globalThis.__colorizeBeforeThreeRender=(r,s,c)=>{prev?.(r,s,c);let segments=0,varying=0,finite=true;
        s.traverse(m=>{if(m.geometry?.type==='TextGeometry')segments=Math.max(segments,m.geometry.parameters?.options?.curveSegments||0);
          if(m.userData?.part15==='return'){const n=m.geometry.getAttribute('normal');for(let i=0;i<n.count;i+=3){
            const dx=n.getX(i)-n.getX(i+1),dy=n.getY(i)-n.getY(i+1),dz=n.getZ(i)-n.getZ(i+1);
            if(dx*dx+dy*dy+dz*dz>1e-8)varying++;
            for(let j=0;j<3;j++)finite=finite&&Number.isFinite(n.getX(i+j))&&Number.isFinite(n.getY(i+j))&&Number.isFinite(n.getZ(i+j));
          }}});result={segments,varying,finite};};
      try{globalThis.__colorizeAssembly15Redraw();return result;}finally{globalThis.__colorizeBeforeThreeRender=prev;}})()""")
    print('SMOOTH CURVES',json.dumps(smooth))
    if not smooth or smooth['segments']<48 or smooth['varying']<10 or not smooth['finite']:
        raise RuntimeError('Rounded returns lack dense curves or interpolated smooth normals')
    d=ready;last=d.get('lastObject') or {}
    print('V015 DEBUG',json.dumps(d,ensure_ascii=False))
    if d.get('version')!='0.15.0': raise RuntimeError('Wrong assembly engine version')
    if int(d.get('objects') or 0)<1: raise RuntimeError('No assembled text object')
    if not last.get('sourceHidden'): raise RuntimeError('Original monolithic TextGeometry is still visible')
    fr=last.get('faceRange') or [0,0];rr=last.get('returnRange') or [0,0];br=last.get('backRange') or [0,0]
    if not (fr[0] > rr[1]): raise RuntimeError(f'Z-FIGHT FAIL: face overlaps return: face={fr}, return={rr}')
    if not (br[1] < rr[0]): raise RuntimeError(f'Z-FIGHT FAIL: back overlaps return: back={br}, return={rr}')
    def clip(): return evaluate("""(()=>{const c=document.querySelector('#threeHost canvas'),r=c.getBoundingClientRect();return{x:r.left,y:r.top,width:r.width,height:r.height,scale:1}})()""")
    def snap(): return hashlib.sha256(base64.b64decode(call('Page.captureScreenshot',{'format':'png','clip':clip(),'fromSurface':True})['data'])).hexdigest()
    trim_dbg=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));window.__colorizeAssemblySetConfig?.({assemblyType:'faceLit',edgeStyle:'trimcap',acrylicLook:'milk',returnFinish:'matte'});await w(950);return window.__colorizeAssembly15Debug?.()})()""",True)
    h1=snap()
    trimless_dbg=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));window.__colorizeAssemblySetConfig?.({assemblyType:'faceLit',edgeStyle:'trimless',acrylicLook:'milk',returnFinish:'matte'});await w(950);return window.__colorizeAssembly15Debug?.()})()""",True)
    h2=snap()
    print('V015 TRIM',json.dumps(trim_dbg,ensure_ascii=False))
    print('V015 TRIMLESS',json.dumps(trimless_dbg,ensure_ascii=False))
    if h1==h2: raise RuntimeError('VISUAL FAIL: trim-cap to trimless did not change viewport')
    print('V015 HASH TRIM/TRIMLESS',h1,h2)
    print('true-assembly-browser-smoke: PASS — face, return and back are separated and trim geometry changes the visible viewport')
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
