import base64, hashlib, json, os, shutil, subprocess, sys, tempfile, time, urllib.request

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
chrome=subprocess.Popen([
    browser,'--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-webgl',
    '--use-gl=angle','--use-angle=swiftshader','--remote-allow-origins=*',
    f'--remote-debugging-port={DEBUG_PORT}',f'--user-data-dir={profile}',
    f'http://127.0.0.1:{PORT}/?lighting-smoke=1'
],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
ws=None

try:
    deadline=time.time()+20; page=None
    while time.time()<deadline:
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{DEBUG_PORT}/json/list',timeout=1) as r: tabs=json.load(r)
            page=next((t for t in tabs if t.get('type')=='page'),None)
            if page: break
        except Exception: time.sleep(.25)
    if not page: raise RuntimeError('Chrome DevTools page not available')

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

    call('Runtime.enable'); call('Page.enable')
    ok=eval_js("""(async()=>{
      const wait=t=>new Promise(r=>setTimeout(r,t));
      for(let i=0;i<80;i++){if(document.readyState==='complete')break;await wait(100)}
      const b=document.querySelector('.mode[data-mode="view3d"]'); if(!b)return 'NO_3D_BUTTON'; b.click();
      for(let i=0;i<120;i++){
        const c=document.querySelector('#threeHost canvas'),loading=document.getElementById('threeLoading');
        if(c&&c.width>50&&c.height>50&&loading?.hidden){await wait(500);return 'READY'}
        await wait(100)
      }
      return 'NOT_READY'
    })()""",True)
    if ok!='READY': raise RuntimeError('3D viewport did not become ready: '+str(ok))

    eval_js("""(()=>{document.getElementById('lightingBtn')?.click();document.querySelector('[data-light-mode="main"]')?.click();return true})()""")
    time.sleep(.5)
    eval_js("""(()=>{const s=document.createElement('style');s.id='smoke-hide-ui';s.textContent='#lightingPanel,#edit3dToolbar,.mode-badge,.statusbar{visibility:hidden!important}';document.head.appendChild(s);return true})()""")

    def set_slider(id,value,wait_ms=800):
        return eval_js(f"""(async()=>{{const wait=t=>new Promise(r=>setTimeout(r,t));const el=document.getElementById('{id}');if(!el)return 'NO_SLIDER';el.value='{value}';el.dispatchEvent(new Event('input',{{bubbles:true}}));await wait({wait_ms});return el.value}})()""",True)
    def debug(): return eval_js("typeof window.__colorizeLightingDebug==='function'?window.__colorizeLightingDebug():null")
    def canvas_clip():
        r=eval_js("""(()=>{const c=document.querySelector('#threeHost canvas');const r=c.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height,scale:1}})()""")
        if not r or r['width']<100 or r['height']<100: raise RuntimeError('Invalid canvas rect')
        return r
    def snap():
        raw=base64.b64decode(call('Page.captureScreenshot',{'format':'png','clip':canvas_clip(),'fromSurface':True})['data'])
        return hashlib.sha256(raw).hexdigest(),raw

    if set_slider('mainIntensity',.2)=='NO_SLIDER': raise RuntimeError('mainIntensity slider missing')
    d_low=debug(); h_low,raw_low=snap()
    set_slider('mainIntensity',6)
    d_high=debug(); h_high,raw_high=snap()

    set_slider('mainExposure',.65)
    d_exp_low=debug(); h_exp_low,_=snap()
    set_slider('mainExposure',1.6)
    d_exp_high=debug(); h_exp_high,_=snap()

    print('DEBUG LOW ',json.dumps(d_low,ensure_ascii=False))
    print('DEBUG HIGH',json.dumps(d_high,ensure_ascii=False))
    print('DEBUG EXP LOW ',json.dumps(d_exp_low,ensure_ascii=False))
    print('DEBUG EXP HIGH',json.dumps(d_exp_high,ensure_ascii=False))
    print('INTENSITY HASH LOW/HIGH',h_low,h_high)
    print('EXPOSURE HASH LOW/HIGH ',h_exp_low,h_exp_high)

    state_ok=(d_low and d_high and float(d_low.get('keyIntensity') or -1)<1 and float(d_high.get('keyIntensity') or -1)>5)
    exposure_state_ok=(d_exp_low and d_exp_high and float(d_exp_low.get('exposure') or -1)<.8 and float(d_exp_high.get('exposure') or -1)>1.4)
    visual_ok=(h_low!=h_high) and (h_exp_low!=h_exp_high)
    if not state_ok: raise RuntimeError('STATE FAIL: renderer light intensity does not follow the slider')
    if not exposure_state_ok: raise RuntimeError('STATE FAIL: renderer exposure does not follow the slider')
    if not visual_ok:
        open('/tmp/colorize-light-low.png','wb').write(raw_low);open('/tmp/colorize-light-high.png','wb').write(raw_high)
        raise RuntimeError('VISUAL FAIL: renderer state changes, but the visible 3D viewport pixels do not')

    print('lighting-browser-smoke: PASS — state and visible canvas both change live')
finally:
    try:
        if ws: ws.close()
    except Exception: pass
    chrome.terminate();server.terminate()
    try: chrome.wait(timeout=3)
    except Exception: chrome.kill()
    try: server.wait(timeout=3)
    except Exception: server.kill()
    shutil.rmtree(profile,ignore_errors=True)
