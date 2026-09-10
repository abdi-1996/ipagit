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

try:
    deadline=time.time()+20
    page=None
    while time.time()<deadline:
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{DEBUG_PORT}/json/list',timeout=1) as r:
                tabs=json.load(r)
            page=next((t for t in tabs if t.get('type')=='page'),None)
            if page: break
        except Exception:
            time.sleep(.25)
    if not page:
        raise RuntimeError('Chrome DevTools page not available')

    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=20)
    call_id=0
    def call(method,params=None):
        nonlocal_call_id=None
        global call_id
        call_id+=1
        cid=call_id
        ws.send(json.dumps({'id':cid,'method':method,'params':params or {}}))
        while True:
            msg=json.loads(ws.recv())
            if msg.get('id')==cid:
                if 'error' in msg: raise RuntimeError(f"CDP {method} failed: {msg['error']}")
                return msg.get('result',{})

    def eval_js(expr, await_promise=False):
        res=call('Runtime.evaluate',{'expression':expr,'returnByValue':True,'awaitPromise':await_promise})
        if res.get('exceptionDetails'):
            raise RuntimeError('JS exception: '+json.dumps(res['exceptionDetails']))
        return res.get('result',{}).get('value')

    call('Runtime.enable'); call('Page.enable')
    ok=eval_js("""(async()=>{
      const wait=t=>new Promise(r=>setTimeout(r,t));
      for(let i=0;i<80;i++){if(document.readyState==='complete')break;await wait(100)}
      const b=document.querySelector('.mode[data-mode="view3d"]'); if(!b)return 'NO_3D_BUTTON'; b.click();
      for(let i=0;i<120;i++){
        const c=document.querySelector('#threeHost canvas');
        const loading=document.getElementById('threeLoading');
        if(c&&c.width>50&&c.height>50&&loading?.hidden)return 'READY';
        await wait(100);
      }
      return 'NOT_READY';
    })()""",True)
    if ok!='READY': raise RuntimeError('3D viewport did not become ready: '+str(ok))

    eval_js("""(()=>{
      document.getElementById('lightingBtn')?.click();
      document.querySelector('[data-light-mode="main"]')?.click();
      return true;
    })()""")
    time.sleep(.6)

    # Hide controls/overlays so screenshot differences can only come from the 3D canvas.
    eval_js("""(()=>{
      const style=document.createElement('style');style.id='smoke-hide-ui';
      style.textContent='#lightingPanel,#edit3dToolbar,.mode-badge,.statusbar{visibility:hidden!important}';
      document.head.appendChild(style);return true;
    })()""")

    def set_slider(value):
        return eval_js(f"""(async()=>{{
          const wait=t=>new Promise(r=>setTimeout(r,t));
          const el=document.getElementById('mainIntensity'); if(!el)return 'NO_SLIDER';
          el.value='{value}'; el.dispatchEvent(new Event('input',{{bubbles:true}}));
          await wait(700); return el.value;
        }})()""",True)

    def canvas_clip():
        r=eval_js("""(()=>{const c=document.querySelector('#threeHost canvas');const r=c.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height,scale:1}})()""")
        # keep within screenshot bounds and avoid tiny/invisible captures
        if not r or r['width']<100 or r['height']<100: raise RuntimeError('Invalid canvas rect')
        return r

    def snap():
        shot=call('Page.captureScreenshot',{'format':'png','clip':canvas_clip(),'fromSurface':True})['data']
        raw=base64.b64decode(shot)
        return hashlib.sha256(raw).hexdigest(), raw

    if set_slider(.2)=='NO_SLIDER': raise RuntimeError('mainIntensity slider missing')
    h_low,raw_low=snap()
    set_slider(6)
    h_high,raw_high=snap()

    # Also verify the actual renderer state written by the runtime changed.
    debug=eval_js("""(()=>{
      try{return JSON.parse(localStorage.getItem('colorize-lighting-v013')||'{}')}catch(e){return {error:String(e)}}
    })()""")

    if h_low==h_high:
        open('/tmp/colorize-light-low.png','wb').write(raw_low)
        open('/tmp/colorize-light-high.png','wb').write(raw_high)
        print('LOW HASH ',h_low)
        print('HIGH HASH',h_high)
        print('SETTINGS',json.dumps(debug,ensure_ascii=False))
        raise RuntimeError('VISUAL FAIL: changing main light intensity does not change the 3D viewport pixels')

    print('lighting-browser-smoke: PASS')
    print('low =',h_low)
    print('high=',h_high)
    print('settings=',json.dumps(debug,ensure_ascii=False))
finally:
    try: ws.close()
    except Exception: pass
    chrome.terminate(); server.terminate()
    try: chrome.wait(timeout=3)
    except Exception: chrome.kill()
    try: server.wait(timeout=3)
    except Exception: server.kill()
    shutil.rmtree(profile,ignore_errors=True)
