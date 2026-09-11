import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:',e);sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT=4178;DEBUG_PORT=9227
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found');sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v017-');log=open('/tmp/colorize-v017-chrome.log','w+b')
chrome=subprocess.Popen([browser,'--headless=new','--no-sandbox','--disable-dev-shm-usage','--remote-allow-origins=*',f'--remote-debugging-port={DEBUG_PORT}',f'--user-data-dir={profile}','about:blank'],stdout=log,stderr=log)
ws=None
try:
    version=None
    for _ in range(180):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{DEBUG_PORT}/json/version',timeout=1) as r: version=json.load(r)
            if version.get('webSocketDebuggerUrl'): break
        except Exception: time.sleep(.25)
    if not version: raise RuntimeError('Chrome DevTools endpoint not available')
    url=f'http://127.0.0.1:{PORT}/?v017-smoke=1'
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
    ready=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));for(let i=0;i<300;i++){if(document.readyState==='complete'&&window.__colorizeInfinite17&&document.querySelector('.artboard.active .obj.selected')&&document.getElementById('v17RulerTop')){await w(900);return true}await w(100)}return false})()""",True)
    if not ready: raise RuntimeError('v0.17 infinite workspace did not become ready')
    ui=evaluate("""(()=>{const v=document.getElementById('viewport'),a=document.querySelector('.artboard.active'),t=document.querySelector('.artboard-title'),tab=document.querySelector('.panel-tab[data-panel="artboards"]'),d=window.__colorizeInfinite17.debug();return{debug:d,viewport:getComputedStyle(v).backgroundColor,artboard:getComputedStyle(a).backgroundColor,shadow:getComputedStyle(a).boxShadow,outline:getComputedStyle(a).outlineStyle,title:t?getComputedStyle(t).display:null,artboards:tab?getComputedStyle(tab).display:null,ruler:!!document.getElementById('v17RulerTop'),measure:!!document.getElementById('v17MeasureSection')}})()""")
    print('V017 UI',json.dumps(ui,ensure_ascii=False))
    if ui['debug'].get('version')!='0.17.0' or ui['debug'].get('unit')!='cm' or not ui['debug'].get('infinite'): raise RuntimeError('Wrong v0.17 workspace state')
    if ui['viewport'] not in ('rgb(255, 255, 255)','rgba(255, 255, 255, 1)'): raise RuntimeError('Workspace is not solid white')
    if ui['artboard'] not in ('rgba(0, 0, 0, 0)','transparent'): raise RuntimeError('Visible Artboard background still exists')
    if ui['shadow']!='none' or ui['outline']!='none' or ui['title']!='none' or ui['artboards']!='none': raise RuntimeError('Artboard/page chrome is still visible')
    if not ui['ruler'] or not ui['measure']: raise RuntimeError('Centimeter ruler or measurement controls are missing')

    sized=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));window.__colorizeInfinite17.setCm('x',12.5);window.__colorizeInfinite17.setCm('h',15);await w(850);window.__colorizeInfinite17.autoText();await w(550);return window.__colorizeInfinite17.debug()})()""",True)
    print('V017 TEXT SIZE',json.dumps(sized,ensure_ascii=False))
    m=sized.get('metrics') or {}
    if abs(float(m.get('xCm',0))-12.5)>.12 or abs(float(m.get('hCm',0))-15)>.12: raise RuntimeError('Centimeter transform did not map to real object dimensions')
    w1=float(m.get('wCm',0))

    changed=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));window.__colorizeInfinite17.setText('COLORIZE DESIGN STUDIO');await w(950);window.__colorizeInfinite17.autoText();await w(600);return window.__colorizeInfinite17.debug()})()""",True)
    print('V017 TEXT AUTO',json.dumps(changed,ensure_ascii=False))
    m2=changed.get('metrics') or {};w2=float(m2.get('wCm',0));h2=float(m2.get('hCm',0))
    if w2<=w1+1: raise RuntimeError('Text width did not grow automatically from glyph/font content')
    if abs(h2-15)>.15: raise RuntimeError('Text physical height changed while editing text')

    rect=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));document.getElementById('addRectBtn').click();await w(600);window.__colorizeInfinite17.setCm('w',120);window.__colorizeInfinite17.setCm('h',40);await w(650);return window.__colorizeInfinite17.debug()})()""",True)
    print('V017 RECT',json.dumps(rect,ensure_ascii=False))
    rm=rect.get('metrics') or {}
    if rect.get('selectedType')!='rect' or abs(float(rm.get('wCm',0))-120)>.15 or abs(float(rm.get('hCm',0))-40)>.15: raise RuntimeError('Object dimensions are not editable in centimetres')

    print('infinite-workspace-browser-smoke: PASS — white infinite canvas, centimetre dimensions and font-driven text sizing work live')
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
