import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
try:
    import websocket
except Exception as e:
    print('websocket-client is required:',e);sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT=4194;DEBUG_PORT=9244
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found');sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v0291-');log=open('/tmp/colorize-v0291-chrome.log','w+b')
chrome=subprocess.Popen([browser,'--headless=new','--no-sandbox','--disable-dev-shm-usage','--remote-allow-origins=*',f'--remote-debugging-port={DEBUG_PORT}',f'--user-data-dir={profile}','about:blank'],stdout=log,stderr=log)
ws=None
try:
    version=None
    for _ in range(100):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{DEBUG_PORT}/json/version',timeout=1) as r: version=json.load(r)
            if version.get('webSocketDebuggerUrl'): break
        except Exception: time.sleep(.2)
    if not version: raise RuntimeError('Chrome DevTools endpoint not available')
    url=f'http://127.0.0.1:{PORT}/?v0291-inline=1'
    req=urllib.request.Request(f'http://127.0.0.1:{DEBUG_PORT}/json/new?{urllib.parse.quote(url,safe=":/?=&")}',method='PUT')
    with urllib.request.urlopen(req,timeout=5) as r: page=json.load(r)
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=20);cid=0
    def call(method,params=None):
        global cid;cid+=1;my=cid
        ws.send(json.dumps({'id':my,'method':method,'params':params or {}}))
        while True:
            m=json.loads(ws.recv())
            if m.get('id')==my:
                if 'error' in m: raise RuntimeError(f"CDP {method}: {m['error']}")
                return m.get('result',{})
    def evaluate(expr,await_promise=False):
        r=call('Runtime.evaluate',{'expression':expr,'returnByValue':True,'awaitPromise':await_promise})
        if r.get('exceptionDetails'): raise RuntimeError('JS exception '+json.dumps(r['exceptionDetails']))
        return r.get('result',{}).get('value')
    call('Runtime.enable');call('Page.enable')
    result=evaluate("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));for(let i=0;i<120;i++){if(window.__colorizeInlineText29Debug?.().version==='0.29.1'&&document.querySelector('#world .obj.text.selected'))break;await w(100)}const before=window.__colorizeInlineText29Debug?.();const node=document.querySelector('#world .obj.text.selected');if(!node)return {error:'no selected text',before};window.__colorizeInlineText29Start();const immediate=window.__colorizeInlineText29Debug?.();const edit=document.querySelector('#world .colorize-inline-value29');if(!edit)return {error:'editor did not start',before,immediate};const activeImmediately=document.activeElement===edit;const isolated=edit.parentElement?.classList.contains('colorize-inline-editing29')&&edit.childNodes.length===1&&edit.firstChild?.nodeType===Node.TEXT_NODE;edit.textContent='ПРЯМО ВО VIEWPORT';window.__colorizeInlineText29Commit();await w(120);const raw=localStorage.getItem('colorize-design-web-v04');const p=raw?JSON.parse(raw):null;const a=p?.artboards?.find(x=>x.id===p.activeArtboardId)||p?.artboards?.[0];const o=a?.objects?.find(x=>x.id===p.selectedObjectId);const field=document.querySelector('#properties input[data-prop="text"]');const rendered=document.querySelector('#world .obj.text.selected');return {before,immediate,after:window.__colorizeInlineText29Debug?.(),activeImmediately,stored:o?.text,fieldHidden:!!field?.closest('.prop-row')?.hidden,renderedDataText:rendered?.dataset.text||'',isolated}})()""",True)
    print('V0291 INLINE TEXT',json.dumps(result,ensure_ascii=False),flush=True)
    if result.get('error'): raise RuntimeError(result['error'])
    if (result.get('before') or {}).get('version')!='0.29.1': raise RuntimeError('v0.29.1 inline editor did not load')
    if not result.get('activeImmediately'): raise RuntimeError('inline editor was not focused synchronously')
    if not (result.get('immediate') or {}).get('focusedSynchronously'): raise RuntimeError('synchronous focus flag was not set')
    if result.get('stored')!='ПРЯМО ВО VIEWPORT': raise RuntimeError('edited text was not saved to project state')
    if not result.get('fieldHidden'): raise RuntimeError('legacy text field is still visible in properties')
    if result.get('renderedDataText')!='ПРЯМО ВО VIEWPORT': raise RuntimeError('viewport did not render committed text')
    if not result.get('isolated'): raise RuntimeError('editable text is not isolated from viewport handles')
    print('inline-text-v029-browser-smoke: PASS — synchronous focus opens inline editor immediately')
finally:
    try:
        if ws: ws.close()
    except: pass
    for p in (chrome,server):
        try:p.terminate()
        except: pass
    for p in (chrome,server):
        try:p.wait(timeout=3)
        except:
            try:p.kill()
            except: pass
    log.close();shutil.rmtree(profile,ignore_errors=True)
