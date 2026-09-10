import base64, hashlib, json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request

try:
    import websocket
except Exception as e:
    print('websocket-client is required:', e)
    sys.exit(2)

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
PORT=4174
DEBUG_PORT=9223
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser:
    print('No Chrome/Chromium found')
    sys.exit(2)

server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-assembly-chrome-')
chrome_log=open('/tmp/colorize-assembly-chrome.log','w+b')
chrome=subprocess.Popen([
    browser,'--headless=new','--no-sandbox','--disable-dev-shm-usage','--remote-allow-origins=*',
    f'--remote-debugging-port={DEBUG_PORT}',f'--user-data-dir={profile}','about:blank'
],stdout=chrome_log,stderr=chrome_log)
ws=None

try:
    deadline=time.time()+30; version=None
    while time.time()<deadline:
        if chrome.poll() is not None:
            chrome_log.flush();chrome_log.seek(0)
            raise RuntimeError('Chrome exited early:\n'+chrome_log.read().decode('utf-8','replace')[-4000:])
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{DEBUG_PORT}/json/version',timeout=1) as r: version=json.load(r)
            if version.get('webSocketDebuggerUrl'): break
        except Exception: time.sleep(.25)
    if not version: raise RuntimeError('Chrome DevTools endpoint not available')

    target_url=f'http://127.0.0.1:{PORT}/?assembly-smoke=1'
    req=urllib.request.Request(f'http://127.0.0.1:{DEBUG_PORT}/json/new?{urllib.parse.quote(target_url,safe=":/?=&")}',method='PUT')
    with urllib.request.urlopen(req,timeout=5) as r: page=json.load(r)
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=20)

    call_id=0
    def call(method,params=None):
        nonlocal_call={'value':None}
        global call_id
        call_id+=1; cid=call_id
        ws.send(json.dumps({'id':cid,'method':method,'params':params or {}}))
        while True:
            msg=json.loads(ws.recv())
            if msg.get('id')==cid:
                if 'error' in msg: raise RuntimeError(f"CDP {method} failed: {msg['error']}")
                return msg.get('result',{})

    def eval_js(expr, await_promise=False):
        res=call('Runtime.evaluate',{'expression':expr,'returnByValue':True,'awaitPromise':await_promise})
        if res.get('exceptionDetails'): raise RuntimeError('JS exception: '+json.dumps(res['exceptionDetails']))
        return res.get('result',{}).get('value')

    call('Runtime.enable');call('Page.enable')
    ready=eval_js("""(async()=>{
      const wait=t=>new Promise(r=>setTimeout(r,t));
      for(let i=0;i<160;i++){
        if(document.readyState==='complete'&&document.querySelector('.mode[data-mode="view3d"]'))break;
        await wait(100);
      }
      document.querySelector('.mode[data-mode="view3d"]')?.click();
      for(let i=0;i<220;i++){
        const c=document.querySelector('#threeHost canvas'),loading=document.getElementById('threeLoading');
        if(c&&c.width>80&&c.height>80&&loading?.hidden&&typeof window.__colorizeAssemblyDebug==='function'){
          await wait(700);return 'READY';
        }
        await wait(100);
      }
      return 'NOT_READY';
    })()""",True)
    if ready!='READY': raise RuntimeError('3D assembled-sign viewport did not become ready: '+str(ready))

    def set_cfg(js_obj):
        payload=json.dumps(js_obj)
        return eval_js(f"""(async()=>{{const wait=t=>new Promise(r=>setTimeout(r,t));window.__colorizeAssemblySetConfig({payload});await wait(750);return window.__colorizeAssemblyDebug();}})()""",True)

    def canvas_clip():
        r=eval_js("""(()=>{const c=document.querySelector('#threeHost canvas');const r=c.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height,scale:1}})()""")
        if not r or r['width']<100 or r['height']<100: raise RuntimeError('Invalid canvas rect')
        return r

    def snap():
        raw=base64.b64decode(call('Page.captureScreenshot',{'format':'png','clip':canvas_clip(),'fromSurface':True})['data'])
        return hashlib.sha256(raw).hexdigest()

    clear_dbg=set_cfg({'assemblyType':'faceLit','acrylicLook':'clear','returnFinish':'gloss','backFinish':'matte','edgeStyle':'trimcap','externalBacking':'none'})
    clear_hash=snap()
    matte_dbg=set_cfg({'assemblyType':'trimless','acrylicLook':'matte','returnFinish':'matte','backFinish':'matte','edgeStyle':'trimless','externalBacking':'panel','backingFinish':'gloss'})
    matte_hash=snap()

    print('ASSEMBLY CLEAR',json.dumps(clear_dbg,ensure_ascii=False))
    print('ASSEMBLY MATTE',json.dumps(matte_dbg,ensure_ascii=False))
    print('ASSEMBLY HASH CLEAR/MATTE',clear_hash,matte_hash)

    a=(clear_dbg or {}).get('lastObject') or {}
    b=(matte_dbg or {}).get('lastObject') or {}
    if int((clear_dbg or {}).get('objects') or 0)<1: raise RuntimeError('ASSEMBLY FAIL: no source text mesh was enhanced')
    if int((clear_dbg or {}).get('overlays') or 0)<2: raise RuntimeError('ASSEMBLY FAIL: face/trim assembly overlays missing')
    if float(a.get('faceTransmission') or 0)<.70: raise RuntimeError('MATERIAL FAIL: clear acrylic is not transmissive')
    if float(a.get('sideRoughness') or 1)>.30: raise RuntimeError('MATERIAL FAIL: glossy painted PVC return is not glossy enough')
    if float(b.get('faceRoughness') or 0)<.45: raise RuntimeError('MATERIAL FAIL: matte acrylic is not matte enough')
    if float(b.get('sideRoughness') or 0)<.70: raise RuntimeError('MATERIAL FAIL: matte PVC return is not matte enough')
    if clear_hash==matte_hash: raise RuntimeError('VISUAL FAIL: assembled material/trim changes do not alter visible 3D viewport')

    print('assembled-sign-browser-smoke: PASS — acrylic, PVC finishes and assembly parts change the visible 3D viewport')
finally:
    try:
        if ws: ws.close()
    except Exception: pass
    for p in (chrome,server):
        try:p.terminate()
        except Exception:pass
    for p in (chrome,server):
        try:p.wait(timeout=3)
        except Exception:
            try:p.kill()
            except Exception:pass
    chrome_log.close();shutil.rmtree(profile,ignore_errors=True)
