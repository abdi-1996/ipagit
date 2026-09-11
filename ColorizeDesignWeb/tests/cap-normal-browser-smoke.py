import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:',e);sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT=4180;DEBUG_PORT=9229
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found');sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-capnorm-');log=open('/tmp/colorize-capnorm-chrome.log','w+b')
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
    url=f'http://127.0.0.1:{PORT}/?v019-smoke=capnorm'
    req=urllib.request.Request(f'http://127.0.0.1:{DEBUG_PORT}/json/new?{urllib.parse.quote(url,safe=":/?=&")}',method='PUT')
    with urllib.request.urlopen(req,timeout=5) as r: page=json.load(r)
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=30);cid=0
    def call(method,params=None):
        nonlocal_dummy=None
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
    result=evaluate("""(async()=>{
      const w=t=>new Promise(r=>setTimeout(r,t));
      for(let i=0;i<220;i++){if(document.readyState==='complete'&&typeof window.__colorizeSeparateParts19Debug==='function')break;await w(100)}
      document.querySelector('.mode[data-mode="view3d"]')?.click();
      for(let i=0;i<300;i++){
        const d=window.__colorizeSeparateParts19Debug?.();
        if(d?.face>0&&d?.capNormalsFixed>0&&document.getElementById('threeLoading')?.hidden)break;
        await w(100)
      }
      let sample=null;
      const prev=globalThis.__colorizeBeforeThreeRender;
      globalThis.__colorizeBeforeThreeRender=(r,s,c)=>{
        prev?.(r,s,c);
        if(sample)return;
        let face=null;s.traverse?.(o=>{if(!face&&o.isMesh&&o.userData?.part19==='face')face=o});
        if(!face)return;
        const g=face.geometry;g.computeBoundingBox?.();const p=g.getAttribute('position'),n=g.getAttribute('normal'),b=g.boundingBox;
        if(!p||!n||!b)return;
        const span=Math.max(1e-6,b.max.z-b.min.z),eps=Math.max(1e-6,span*.0016);
        let count=0,bad=0,maxXY=0,minNZ=1;
        for(let i=0;i<p.count;i++){
          if(Math.abs(p.getZ(i)-b.max.z)>eps)continue;
          count++;const xy=Math.hypot(n.getX(i),n.getY(i));maxXY=Math.max(maxXY,xy);minNZ=Math.min(minNZ,n.getZ(i));
          if(xy>0.002||n.getZ(i)<0.999)bad++;
        }
        sample={count,bad,maxXY,minNZ,debug:window.__colorizeSeparateParts19Debug?.()};
      };
      for(let i=0;i<120&&!sample;i++)await w(100);
      return sample;
    })()""",True)
    print('CAP NORMALS',json.dumps(result,ensure_ascii=False))
    if not result: raise RuntimeError('Could not inspect v0.19 face mesh normals')
    if int(result.get('count') or 0)<20: raise RuntimeError('Too few front-cap vertices were detected')
    if int(result.get('bad') or 0)!=0: raise RuntimeError('Front cap contains non-planar normals that can create star-shaped highlights')
    dbg=result.get('debug') or {}
    if dbg.get('version')!='0.19.3': raise RuntimeError('Wrong separate-parts renderer version')
    print('cap-normal-browser-smoke: PASS — glossy front cap is planar-shaded without triangulation stars')
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
