import base64, hashlib, json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request

try:
    import websocket
except Exception as e:
    print('websocket-client is required:', e)
    sys.exit(2)

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
PORT=4173
DEBUG_PORT=9222
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser:
    print('No Chrome/Chromium found')
    sys.exit(2)

server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-chrome-')
chrome_log=open('/tmp/colorize-chrome.log','w+b')
chrome=subprocess.Popen([
    browser,'--headless=new','--no-sandbox','--disable-dev-shm-usage','--remote-allow-origins=*',
    f'--remote-debugging-port={DEBUG_PORT}',f'--user-data-dir={profile}','about:blank'
],stdout=chrome_log,stderr=chrome_log)
ws=None

try:
    # GitHub hosted runners can occasionally take 30-50 seconds to expose CDP while
    # Chromium is already starting. Give the real browser enough time instead of
    # treating runner startup latency as a lighting regression.
    deadline=time.time()+75; version=None
    while time.time()<deadline:
        if chrome.poll() is not None:
            chrome_log.flush();chrome_log.seek(0)
            raise RuntimeError('Chrome exited early:\n'+chrome_log.read().decode('utf-8','replace')[-4000:])
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{DEBUG_PORT}/json/version',timeout=1) as r: version=json.load(r)
            if version.get('webSocketDebuggerUrl'): break
        except Exception: time.sleep(.25)
    if not version:
        chrome_log.flush();chrome_log.seek(0)
        raise RuntimeError('Chrome DevTools endpoint not available:\n'+chrome_log.read().decode('utf-8','replace')[-4000:])

    target_url=f'http://127.0.0.1:{PORT}/?lighting-smoke=1'
    req=urllib.request.Request(f'http://127.0.0.1:{DEBUG_PORT}/json/new?{urllib.parse.quote(target_url,safe=":/?=&")}',method='PUT')
    with urllib.request.urlopen(req,timeout=5) as r: page=json.load(r)
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=20)

    call_id=0
    def call(method,params=None):
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
    ok=eval_js("""(async()=>{
      const wait=t=>new Promise(r=>setTimeout(r,t));
      for(let i=0;i<120;i++){if(document.readyState==='complete'&&document.querySelector('.mode[data-mode="view3d"]'))break;await wait(100)}
      const b=document.querySelector('.mode[data-mode="view3d"]');if(!b)return 'NO_3D_BUTTON';b.click();
      for(let i=0;i<180;i++){
        const c=document.querySelector('#threeHost canvas');
        const loading=document.getElementById('threeLoading');
        const d=window.__colorizeLightingDebug?.();
        if(c&&c.width>80&&c.height>80&&loading?.hidden&&d?.owns){await wait(500);return 'READY'}
        await wait(100)
      }
      return JSON.stringify({loading:document.getElementById('threeLoading')?.hidden,debug:window.__colorizeLightingDebug?.()||null,hook:window.__colorizeLightingHookError||null})
    })()""",True)
    if ok!='READY': raise RuntimeError('3D editor did not become ready: '+str(ok))

    def set_slider(selector,value):
        return eval_js(f"""(async()=>{{const wait=t=>new Promise(r=>setTimeout(r,t));const e=document.querySelector('{selector}');if(!e)return 'NO';e.value='{value}';e.dispatchEvent(new Event('input',{{bubbles:true}}));await wait(650);return JSON.stringify(window.__colorizeLightingDebug?.())}})()""",True)

    def canvas_rect():
        r=eval_js("""(()=>{const c=document.querySelector('#threeHost canvas');const r=c.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height,scale:1}})()""")
        if not r or r['width']<100 or r['height']<100: raise RuntimeError('Invalid canvas rect')
        return r

    def snap_hash():
        shot=call('Page.captureScreenshot',{'format':'png','clip':canvas_rect(),'fromSurface':True})
        raw=base64.b64decode(shot['data']);return hashlib.sha256(raw).hexdigest()

    low=json.loads(set_slider('#mainIntensity',0.2)); low_hash=snap_hash()
    high=json.loads(set_slider('#mainIntensity',6)); high_hash=snap_hash()
    exp_low=json.loads(set_slider('#mainExposure',0.65)); exp_low_hash=snap_hash()
    exp_high=json.loads(set_slider('#mainExposure',1.6)); exp_high_hash=snap_hash()
    set_slider('#mainExposure',1.04);set_slider('#mainIntensity',4)
    angle_left=json.loads(set_slider('#mainAngle',-75)); angle_left_hash=snap_hash()
    angle_right=json.loads(set_slider('#mainAngle',75)); angle_right_hash=snap_hash()

    print('DEBUG LOW ',json.dumps(low));print('DEBUG HIGH',json.dumps(high))
    print('DEBUG EXP LOW ',json.dumps(exp_low));print('DEBUG EXP HIGH',json.dumps(exp_high))
    print('DEBUG ANGLE LEFT ',json.dumps(angle_left));print('DEBUG ANGLE RIGHT',json.dumps(angle_right))
    print('INTENSITY HASH LOW/HIGH',low_hash,high_hash)
    print('EXPOSURE HASH LOW/HIGH ',exp_low_hash,exp_high_hash)
    print('ANGLE HASH LEFT/RIGHT ',angle_left_hash,angle_right_hash)

    if abs(float(low.get('keyIntensity') or 0)-0.2)>0.02 or abs(float(high.get('keyIntensity') or 0)-6)>0.02: raise RuntimeError('STATE FAIL: main intensity did not reach the real renderer')
    if abs(float(exp_low.get('exposure') or 0)-0.65)>0.02 or abs(float(exp_high.get('exposure') or 0)-1.6)>0.02: raise RuntimeError('STATE FAIL: exposure did not reach the real renderer')
    if float(angle_left.get('keyPosition',[0])[0])>=-2 or float(angle_right.get('keyPosition',[0])[0])<=2: raise RuntimeError('STATE FAIL: light angle did not move the real key light across the sign')
    if low_hash==high_hash: raise RuntimeError('PIXEL FAIL: changing light intensity did not change the visible WebGL viewport')
    if exp_low_hash==exp_high_hash: raise RuntimeError('PIXEL FAIL: changing exposure did not change the visible WebGL viewport')
    if angle_left_hash==angle_right_hash: raise RuntimeError('PIXEL FAIL: changing light angle did not change the visible WebGL viewport')
    print('lighting-browser-smoke: PASS — intensity, exposure and angle change the visible viewport in realtime')
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
