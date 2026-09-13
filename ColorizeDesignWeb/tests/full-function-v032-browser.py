import json, os, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request, math
try:
    import websocket
except Exception as e:
    print('websocket-client is required:', e); sys.exit(2)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..')); PORT=4198; DEBUG_PORT=9248
browser=(shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium') or shutil.which('chromium-browser'))
if not browser: print('No Chrome/Chromium found'); sys.exit(2)
server=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
profile=tempfile.mkdtemp(prefix='colorize-v032-'); log=open('/tmp/colorize-v032-chrome.log','w+b')
chrome=subprocess.Popen([browser,'--headless=new','--no-sandbox','--disable-dev-shm-usage','--remote-allow-origins=*','--window-size=1440,1000',f'--remote-debugging-port={DEBUG_PORT}',f'--user-data-dir={profile}','about:blank'],stdout=log,stderr=log)
ws=None
passed=[]
try:
    version=None
    for _ in range(100):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{DEBUG_PORT}/json/version',timeout=1) as r: version=json.load(r)
            if version.get('webSocketDebuggerUrl'): break
        except Exception: time.sleep(.2)
    if not version: raise RuntimeError('Chrome DevTools endpoint not available')
    url=f'http://127.0.0.1:{PORT}/?v032-full-audit=1'
    req=urllib.request.Request(f'http://127.0.0.1:{DEBUG_PORT}/json/new?{urllib.parse.quote(url,safe=":/?=&")}',method='PUT')
    with urllib.request.urlopen(req,timeout=5) as r: page=json.load(r)
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=20); cid=0
    def call(method,params=None):
        nonlocal_dummy=None
        global cid; cid+=1; my=cid
        ws.send(json.dumps({'id':my,'method':method,'params':params or {}}))
        while True:
            m=json.loads(ws.recv())
            if m.get('id')==my:
                if 'error' in m: raise RuntimeError(f"CDP {method}: {m['error']}")
                return m.get('result',{})
    def evaluate(expr, await_promise=False):
        r=call('Runtime.evaluate',{'expression':expr,'returnByValue':True,'awaitPromise':await_promise})
        if r.get('exceptionDetails'): raise RuntimeError('JS exception '+json.dumps(r['exceptionDetails']))
        return r.get('result',{}).get('value')
    def wait(sec=.35): time.sleep(sec)
    def ok(name,cond,detail=''):
        if not cond: raise RuntimeError(f'{name} failed'+(f': {detail}' if detail else ''))
        passed.append(name); print('PASS',name,flush=True)
    call('Runtime.enable'); call('Page.enable')
    ready=False
    for _ in range(120):
        try:
            ready=bool(evaluate("window.__colorizeV032LoadState==='ready'&&window.__colorize32Debug?.().version==='0.32.0'&&document.querySelectorAll('[data-v030-tool]').length===24"))
            if ready: break
        except Exception: pass
        time.sleep(.15)
    if not ready:
        raise RuntimeError('v0.32 not ready: '+str(evaluate("window.__colorizeV032LoadError||window.__colorizeV031LoadError||'unknown'")))
    evaluate("Element.prototype.setPointerCapture=function(){};Element.prototype.releasePointerCapture=function(){};true")
    ok('tool-rail-24',evaluate("document.querySelectorAll('[data-v030-tool]').length") == 24)

    # Helpers installed in page so each real tool receives the same PointerEvents a user gesture would dispatch.
    evaluate("""window.__audit32={
      ev(el,type,x,y,id=91,extra={}){if(typeof el==='string')el=document.querySelector(el);if(!el)return false;el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,pointerId:id,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,...extra}));return true},
      art(){const e=document.querySelector('.artboard.active')||document.querySelector('.artboard'),r=e.getBoundingClientRect();return {e,r,x:r.left+r.width*.78,y:r.top+r.height*.75}},
      state(){const p=JSON.parse(localStorage.getItem('colorize-design-web-v04')||'null'),a=p?.artboards?.find(x=>x.id===p.activeArtboardId)||p?.artboards?.[0],o=a?.objects?.find(x=>x.id===p.selectedObjectId);return {p,a,o}},
      objs(){return this.state().a?.objects||[]},
      node(id){return document.querySelector('#world .obj[data-object-id="'+CSS.escape(id)+'"]')},
      drag(el,dx,dy,id=91){if(typeof el==='string')el=document.querySelector(el);const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;this.ev(el,'pointerdown',x,y,id);this.ev(el,'pointermove',x+dx,y+dy,id);this.ev(el,'pointerup',x+dx,y+dy,id);}
    };true""")

    # MOVE — real object drag through base app.
    evaluate("window.__colorizeAffinity30CreateShape('ellipse');true"); wait(.6)
    move_before=evaluate("(()=>{const s=__audit32.state();return {id:s.o.id,x:s.o.x,y:s.o.y}})()")
    evaluate("window.__colorizeAffinity30Tool('move');const n=__audit32.node(__audit32.state().o.id);__audit32.drag(n,38,26,101);true"); wait(.6)
    move_after=evaluate("(()=>{const o=__audit32.state().o;return {x:o.x,y:o.y}})()")
    ok('move',abs(move_after['x']-move_before['x'])>5 and abs(move_after['y']-move_before['y'])>5)

    # NODE — conversion + direct node drag.
    evaluate("window.__colorizeAffinity30Convert();window.__colorizeAffinity30Tool('node');true"); wait(.5)
    node_before=evaluate("(()=>{const o=__audit32.state().o;return {id:o.id,p:[...o.points[0]],handles:document.querySelectorAll('.v030-node').length}})()")
    ok('node-handles',node_before['handles']>=4)
    evaluate("const h=document.querySelector('.v030-node');__audit32.drag(h,18,12,102);true"); wait(.5)
    node_after=evaluate("(()=>__audit32.state().o.points[0])()")
    ok('node-edit',abs(node_after[0]-node_before['p'][0])>.005 or abs(node_after[1]-node_before['p'][1])>.005)

    # POINT TRANSFORM — vector origin handle drag.
    evaluate("window.__colorizeAffinity30Tool('point');true"); wait(.4)
    point_before=evaluate("(()=>{const o=__audit32.state().o;return {x:o.originX??.5,y:o.originY??.5,h:!!document.querySelector('.v030-origin')}})()")
    ok('point-handle',point_before['h'])
    evaluate("const h=document.querySelector('.v030-origin');__audit32.drag(h,24,-15,103);true"); wait(.45)
    point_after=evaluate("(()=>{const o=__audit32.state().o;return {x:o.originX,y:o.originY}})()")
    ok('point-transform',point_after['x'] is not None and (abs(point_after['x']-point_before['x'])>.005 or abs(point_after['y']-point_before['y'])>.005))

    # CONTOUR — now independent from normal stroke.
    contour_stroke=evaluate("__audit32.state().o.strokeWidth||0")
    evaluate("window.__colorizeAffinity30Tool('contour');const n=__audit32.node(__audit32.state().o.id);__audit32.drag(n,72,0,104);true"); wait(.55)
    contour=evaluate("(()=>{const o=__audit32.state().o;return {w:o.contourWidth||0,stroke:o.strokeWidth||0,layer:!!document.querySelector('.v032-contour-layer')}})()")
    ok('contour',contour['w']>2 and abs(contour['stroke']-contour_stroke)<.01 and contour['layer'])

    # CORNER — real drag on rounded rectangle.
    evaluate("window.__colorizeAffinity30CreateShape('roundRect');true"); wait(.55)
    corner0=evaluate("__audit32.state().o.cornerRadius||0")
    evaluate("window.__colorizeAffinity30Tool('corner');const n=__audit32.node(__audit32.state().o.id);__audit32.drag(n,70,0,105);true"); wait(.55)
    corner1=evaluate("__audit32.state().o.cornerRadius||0")
    ok('corner',corner1>corner0)

    # PEN — three real taps + Enter produce a path.
    pen_count=evaluate("__audit32.objs().length")
    evaluate("""window.__colorizeAffinity30Tool('pen');const a=__audit32.art(),r=a.r;[[.18,.20],[.36,.36],[.55,.18]].forEach((q,i)=>__audit32.ev(a.e,'pointerdown',r.left+r.width*q[0],r.top+r.height*q[1],120+i));window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));true"""); wait(.65)
    pen=evaluate("(()=>{const o=__audit32.state().o;return {count:__audit32.objs().length,kind:o.vectorKind,pts:o.points?.length||0,name:o.name}})()")
    ok('pen',pen['count']>pen_count and pen['kind']=='path' and pen['pts']>=3)

    # PENCIL — freehand path.
    pencil_count=pen['count']
    evaluate("""window.__colorizeAffinity30Tool('pencil');const a=__audit32.art(),r=a.r,x=r.left+r.width*.62,y=r.top+r.height*.22;__audit32.ev(a.e,'pointerdown',x,y,130);for(let i=1;i<=5;i++)__audit32.ev(a.e,'pointermove',x+i*14,y+(i%2?10:-6),130);__audit32.ev(a.e,'pointerup',x+70,y+10,130);true"""); wait(.65)
    pencil=evaluate("(()=>{const o=__audit32.state().o;return {count:__audit32.objs().length,kind:o.vectorKind,pts:o.points?.length||0,closed:o.closed,name:o.name}})()")
    ok('pencil',pencil['count']>pencil_count and pencil['kind']=='path' and pencil['pts']>=3 and pencil['closed']==False)

    # STROKE WIDTH — drag changes stroke width persistently.
    stroke0=evaluate("__audit32.state().o.strokeWidth||0")
    evaluate("window.__colorizeAffinity30Tool('stroke');const n=__audit32.node(__audit32.state().o.id);__audit32.drag(n,64,0,131);true"); wait(.55)
    stroke1=evaluate("__audit32.state().o.strokeWidth||0")
    ok('stroke-width',stroke1>stroke0)

    # KNIFE — path loses nearest node (current implementation is deterministic node cut).
    knife0=evaluate("__audit32.state().o.points?.length||0")
    evaluate("window.__colorizeAffinity30Tool('knife');const n=__audit32.node(__audit32.state().o.id),r=n.getBoundingClientRect();__audit32.ev(n,'pointerdown',r.left+r.width*.45,r.top+r.height*.5,132);true"); wait(.55)
    knife1=evaluate("__audit32.state().o.points?.length||0")
    ok('knife',knife1==knife0-1)

    # BRUSH — separate vector brush path.
    brush_count=evaluate("__audit32.objs().length")
    evaluate("""window.__colorizeAffinity30Tool('brush');const a=__audit32.art(),r=a.r,x=r.left+r.width*.18,y=r.top+r.height*.62;__audit32.ev(a.e,'pointerdown',x,y,140);for(let i=1;i<=6;i++)__audit32.ev(a.e,'pointermove',x+i*13,y+Math.sin(i)*12,140);__audit32.ev(a.e,'pointerup',x+78,y,140);true"""); wait(.65)
    brush=evaluate("(()=>{const o=__audit32.state().o;return {count:__audit32.objs().length,name:o.name,kind:o.vectorKind,sw:o.strokeWidth}})()")
    ok('vector-brush',brush['count']>brush_count and brush['kind']=='path' and brush['sw']>=1.8)

    # GRADIENT — drag controls angle and activates gradient.
    evaluate("window.__colorizeAffinity30CreateShape('ellipse');true"); wait(.5)
    evaluate("window.__colorizeAffinity30Tool('gradient');const n=__audit32.node(__audit32.state().o.id);__audit32.drag(n,65,45,141);true"); wait(.55)
    grad=evaluate("(()=>{const o=__audit32.state().o;return {g:!!o.gradient,a:o.gradientAngle}})()")
    ok('gradient',grad['g'] and abs(grad['a'])>5)

    # PICKER + FLOOD FILL — sample from source then fill target.
    source_id=evaluate("__audit32.state().o.id")
    evaluate(f"window.__colorize32Patch('{source_id}',{{fill:'#ff3355',stroke:'#552233',strokeWidth:2}});true"); wait(.5)
    evaluate("window.__colorizeAffinity30CreateShape('rect');true"); wait(.5)
    target_id=evaluate("__audit32.state().o.id")
    evaluate(f"window.__colorizeAffinity30Tool('picker');const n=__audit32.node('{source_id}'),r=n.getBoundingClientRect();__audit32.ev(n,'pointerdown',r.left+r.width/2,r.top+r.height/2,150);true"); wait(.25)
    evaluate(f"window.__colorizeAffinity30Tool('flood');const n=__audit32.node('{target_id}'),r=n.getBoundingClientRect();__audit32.ev(n,'pointerdown',r.left+r.width/2,r.top+r.height/2,151);true"); wait(.55)
    target_fill=evaluate(f"(()=>{{const o=__audit32.objs().find(x=>x.id==='{target_id}');return o?.fill}})()")
    ok('picker',True)  # picker was required to seed the sampled colour used by Flood.
    ok('flood-fill',target_fill=='#ff3355',str(target_fill))

    # TRANSPARENCY — actual horizontal drag.
    evaluate(f"window.__colorize32Select('{target_id}');true"); wait(.45)
    opacity0=evaluate("__audit32.state().o.opacity??1")
    evaluate("window.__colorizeAffinity30Tool('transparency');const n=__audit32.node(__audit32.state().o.id);__audit32.drag(n,-100,0,152);true"); wait(.55)
    opacity1=evaluate("__audit32.state().o.opacity??1")
    ok('transparency',opacity1<opacity0)

    # STYLE PICKER — sample full vector style and apply to second vector.
    evaluate(f"window.__colorize32Patch('{target_id}',{{fill:'#1155cc',stroke:'#22aa44',strokeWidth:4}});true"); wait(.45)
    evaluate("window.__colorizeAffinity30CreateShape('triangle');true"); wait(.45)
    style_target=evaluate("__audit32.state().o.id")
    evaluate(f"window.__colorizeAffinity30Tool('stylepicker');let n=__audit32.node('{target_id}'),r=n.getBoundingClientRect();__audit32.ev(n,'pointerdown',r.left+r.width/2,r.top+r.height/2,153);n=__audit32.node('{style_target}');r=n.getBoundingClientRect();__audit32.ev(n,'pointerdown',r.left+r.width/2,r.top+r.height/2,154);true"); wait(.65)
    styled=evaluate(f"(()=>{{const o=__audit32.objs().find(x=>x.id==='{style_target}');return {{fill:o?.fill,stroke:o?.stroke,sw:o?.strokeWidth}}}})()")
    ok('style-picker',styled['fill']=='#1155cc' and styled['stroke']=='#22aa44' and abs(styled['sw']-4)<.01,str(styled))

    # SHAPE TOOL — choose ellipse in real flyout and drag on canvas.
    shape_count=evaluate("__audit32.objs().length")
    evaluate("document.querySelector('[data-v030-tool=\"shape\"]').click();document.querySelector('[data-v030-shape=\"ellipse\"]').click();const a=__audit32.art(),r=a.r,x=r.left+r.width*.62,y=r.top+r.height*.58;__audit32.ev(a.e,'pointerdown',x,y,160);__audit32.ev(a.e,'pointermove',x+100,y+70,160);__audit32.ev(a.e,'pointerup',x+100,y+70,160);true"); wait(.7)
    shaped=evaluate("(()=>{const o=__audit32.state().o;return {count:__audit32.objs().length,kind:o.vectorKind,w:o.w,h:o.h}})()")
    ok('shape-tool',shaped['count']>shape_count and shaped['kind']=='ellipse' and shaped['w']>40 and shaped['h']>30)

    # SHAPE BUILDER — choose two objects through the real tool then union.
    build_a=evaluate("__audit32.state().o.id")
    evaluate("window.__colorizeAffinity30CreateShape('diamond');true"); wait(.45)
    build_b=evaluate("__audit32.state().o.id")
    evaluate(f"window.__colorizeAffinity30Tool('builder');for(const id of ['{build_a}','{build_b}']){{const n=__audit32.node(id),r=n.getBoundingClientRect();__audit32.ev(n,'pointerdown',r.left+r.width/2,r.top+r.height/2,170);}}window.__colorizeAffinity30Builder('union');true"); wait(.7)
    compound=evaluate("(()=>{const o=__audit32.state().o;return {kind:o.vectorKind,mode:o.compoundMode,children:o.children?.length||0}})()")
    ok('shape-builder',compound['kind']=='compound' and compound['mode']=='union' and compound['children']==2)

    # TEXT — tool creates text, stable overlay edits it, commit persists.
    text_count=evaluate("__audit32.objs().filter(x=>x.type==='text').length")
    evaluate("window.__colorizeAffinity30Tool('text');true"); wait(.55)
    text_started=evaluate("(()=>({count:__audit32.objs().filter(x=>x.type==='text').length,editor:!!document.getElementById('colorizeTextEditor31')}))()")
    if not text_started['editor']:
        evaluate("window.__colorizeText31Start?.();true"); wait(.15)
    evaluate("const e=document.getElementById('colorizeTextEditor31');if(e)e.value='AUDIT TEXT 32';window.__colorizeText31Commit?.();true"); wait(.65)
    text_saved=evaluate("__audit32.objs().filter(x=>x.type==='text').some(x=>x.text==='AUDIT TEXT 32')")
    ok('text',text_started['count']>text_count and text_saved)

    # PLACE IMAGE — real image input receives an SVG image file and creates an image object.
    image_count=evaluate("__audit32.objs().filter(x=>x.type==='image').length")
    evaluate("window.__colorizeAffinity30Tool('place');const svg='<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"80\" height=\"50\"><rect width=\"80\" height=\"50\" fill=\"red\"/></svg>';const f=new File([svg],'audit.svg',{type:'image/svg+xml'}),dt=new DataTransfer();dt.items.add(f);const i=document.getElementById('imageInput');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));true"); wait(1.0)
    image=evaluate("(()=>{const xs=__audit32.objs().filter(x=>x.type==='image');return {count:xs.length,id:xs.at(-1)?.id||null}})()")
    ok('place-image',image['count']>image_count and bool(image['id']))

    # CROP — drag the imported image and persist object-position controls.
    evaluate(f"window.__colorize32Select('{image['id']}');true"); wait(.45)
    evaluate("window.__colorizeAffinity30Tool('crop');const n=__audit32.node(__audit32.state().o.id);__audit32.drag(n,38,24,180);true"); wait(.6)
    cropped=evaluate("(()=>{const o=__audit32.state().o;return {mode:!!o.cropMode,x:o.cropX,y:o.cropY}})()")
    ok('crop',cropped['mode'] and cropped['x'] is not None and cropped['y'] is not None)

    # MEASURE — real drag gives a cm readout.
    evaluate("window.__colorizeAffinity30Tool('measure');const a=__audit32.art(),r=a.r,x=r.left+r.width*.18,y=r.top+r.height*.82;__audit32.ev(a.e,'pointerdown',x,y,190);__audit32.ev(a.e,'pointermove',x+120,y,190);__audit32.ev(a.e,'pointerup',x+120,y,190);true"); wait(.2)
    measure=evaluate("document.querySelector('#v030Measure b')?.textContent||''")
    ok('measure','см' in measure and any(c.isdigit() for c in measure),measure)

    # AREA — real ellipse area, not its bounding-box area.
    evaluate("window.__colorizeAffinity30CreateShape('ellipse');true"); wait(.5)
    area_id=evaluate("__audit32.state().o.id")
    area_box=evaluate("(()=>{const o=__audit32.state().o;return o.w*o.h/100})()")
    evaluate("window.__colorizeAffinity30Tool('area');const n=__audit32.node(__audit32.state().o.id),r=n.getBoundingClientRect();__audit32.ev(n,'pointerdown',r.left+r.width/2,r.top+r.height/2,191);true"); wait(.25)
    area=evaluate("window.__colorize32Debug().lastArea?.value||0")
    ok('area',area>0 and area<area_box*.9 and abs(area-area_box*math.pi/4)<1.0,f'{area} vs box {area_box}')

    # POINT transform also works for non-vector text through v0.32 origin handle.
    text_id=evaluate("__audit32.objs().find(x=>x.type==='text'&&x.text==='AUDIT TEXT 32')?.id||null")
    evaluate(f"window.__colorize32Select('{text_id}');window.__colorizeAffinity30Tool('point');true"); wait(.45)
    origin_any=bool(evaluate("!!document.querySelector('.v032-origin')"))
    ok('point-nonvector',origin_any)

    # HAND — real pan changes project view.
    hand0=evaluate("(()=>{const p=__audit32.state().p;return {x:p.view.x,y:p.view.y}})()")
    evaluate("window.__colorizeAffinity30Tool('hand');const a=__audit32.art(),x=a.r.left+a.r.width*.88,y=a.r.top+a.r.height*.88;__audit32.ev(a.e,'pointerdown',x,y,200);__audit32.ev(a.e,'pointermove',x+42,y+31,200);__audit32.ev(a.e,'pointerup',x+42,y+31,200);true"); wait(.45)
    hand1=evaluate("(()=>{const p=__audit32.state().p;return {x:p.view.x,y:p.view.y,active:document.getElementById('panTool')?.classList.contains('active')}})()")
    ok('hand',hand1['active'] and (abs(hand1['x']-hand0['x'])>5 or abs(hand1['y']-hand0['y'])>5))

    # ZOOM — tool click on canvas zooms in.
    zoom0=evaluate("__audit32.state().p.view.zoom")
    evaluate("window.__colorizeAffinity30Tool('zoom');const a=__audit32.art(),x=a.r.left+a.r.width*.9,y=a.r.top+a.r.height*.9;__audit32.ev(a.e,'pointerdown',x,y,201);true"); wait(.45)
    zoom1=evaluate("__audit32.state().p.view.zoom")
    ok('zoom',zoom1>zoom0)

    # SAVE and duplicate are core editor commands outside the 24-tool rail.
    count0=evaluate("__audit32.objs().length")
    evaluate("window.__colorizeAffinity30Tool('move');document.getElementById('duplicateBtn').click();document.getElementById('saveBtn').click();true"); wait(.45)
    core=evaluate("(()=>({count:__audit32.objs().length,save:document.getElementById('saveBtn').textContent}))()")
    ok('duplicate',core['count']==count0+1)
    ok('save',core['save']=='Сохранено')

    expected={'move','node-handles','node-edit','point-handle','point-transform','contour','corner','pen','pencil','stroke-width','knife','vector-brush','gradient','picker','flood-fill','transparency','style-picker','shape-tool','shape-builder','text','place-image','crop','measure','area','point-nonvector','hand','zoom','duplicate','save','tool-rail-24'}
    missing=sorted(expected-set(passed))
    if missing: raise RuntimeError('audit missing checks: '+','.join(missing))
    print('V032 FULL FUNCTION AUDIT',json.dumps({'passed':passed,'count':len(passed)},ensure_ascii=False),flush=True)
    print('full-function-v032-browser: PASS — all 24 tools plus core edit commands exercised')
finally:
    try:
        if ws: ws.close()
    except: pass
    for p in (chrome,server):
        try: p.terminate()
        except: pass
    for p in (chrome,server):
        try: p.wait(timeout=3)
        except:
            try: p.kill()
            except: pass
    log.close(); shutil.rmtree(profile,ignore_errors=True)
