import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:',e);sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT=4188;DEBUG_PORT=9237
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found');sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v0251-');log=open('/tmp/colorize-v0251-chrome.log','w+b')
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
    url=f'http://127.0.0.1:{PORT}/?v0251-hdri=1'
    req=urllib.request.Request(f'http://127.0.0.1:{DEBUG_PORT}/json/new?{urllib.parse.quote(url,safe=":/?=&")}',method='PUT')
    with urllib.request.urlopen(req,timeout=5) as r: page=json.load(r)
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=45);cid=0
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
    result=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));for(let i=0;i<220;i++){if(document.readyState==='complete'&&typeof window.__colorizeHdri251Debug==='function')break;await w(100)}document.querySelector('.mode[data-mode="view3d"]')?.click();document.getElementById('lightingBtn')?.click();for(let i=0;i<220;i++){if(document.querySelector('[data-light-mode="hdr"]'))break;await w(100)}document.querySelector('[data-light-mode="hdr"]')?.click();const ok=await window.__colorizeHdri251UseBuiltin?.();for(let i=0;i<120;i++){const d=window.__colorizeHdri251Debug?.();if(ok&&d?.loaded&&d.width===64&&d.height===32)return {ok,debug:d};await w(100)}return {ok,debug:window.__colorizeHdri251Debug?.()||null}})()""",True)
    print('V0251 BUILTIN',json.dumps(result,ensure_ascii=False))
    d=(result or {}).get('debug') or {}
    if not (result or {}).get('ok') or d.get('version')!='0.25.1' or not d.get('loaded'): raise RuntimeError('Built-in Jeksterer RGBE environment did not load: '+json.dumps(d))
    if int(d.get('width') or 0)!=64 or int(d.get('height') or 0)!=32: raise RuntimeError('Unexpected built-in dimensions')
    custom=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));const header=new TextEncoder().encode('#?RADIANCE\\nFORMAT=32-bit_rle_rgbe\\n\\n-Y 2 +X 4\\n');const px=new Uint8Array([255,180,100,129, 100,180,255,129, 255,255,255,128, 80,80,80,128, 180,255,120,129, 255,120,180,129, 120,180,255,129, 200,200,200,128]);const all=new Uint8Array(header.length+px.length);all.set(header);all.set(px,header.length);const file=new File([all],'iphone-import-test.hdr',{type:'image/vnd.radiance'});const ok=await window.__colorizeHdri251Import?.(file);for(let i=0;i<120;i++){const d=window.__colorizeHdri251Debug?.();if(ok&&d?.loaded&&d.kind==='custom'&&d.imports>0)return {ok,debug:d};await w(100)}return {ok,debug:window.__colorizeHdri251Debug?.()||null}})()""",True)
    print('V0251 CUSTOM',json.dumps(custom,ensure_ascii=False))
    cd=(custom or {}).get('debug') or {}
    if not (custom or {}).get('ok') or cd.get('kind')!='custom' or int(cd.get('imports') or 0)<1: raise RuntimeError('iOS-safe HDR custom import failed: '+json.dumps(cd))
    print('jeksterer-hdri-fixed-browser-smoke: PASS — built-in Jeksterer raw RGBE lighting and iOS-safe HDR import work')
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
