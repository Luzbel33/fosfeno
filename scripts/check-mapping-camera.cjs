const assert=require('node:assert/strict')
const { chromium }=require('playwright')
const base=process.argv.find(arg=>/^https?:/.test(arg)) || 'http://127.0.0.1:8736/'
const real=process.argv.includes('--physical')
const args=['--use-angle=swiftshader','--enable-unsafe-swiftshader',...(!real?['--use-fake-device-for-media-stream']:[])]
const id=(p,name)=>p.locator('#'+name)
const click=(p,name)=>id(p,name).click()
async function pixel(p,x,y,want) {
  await p.waitForFunction(({x,y,want})=>{
    const c=document.querySelector('canvas'), gl=c?.getContext('webgl')
    if (!gl) return false
    const b=new Uint8Array(4)
    gl.readPixels(Math.round(x*(c.width-1)),Math.round((1-y)*(c.height-1)),1,1,gl.RGBA,gl.UNSIGNED_BYTE,b)
    return want.every((n,i)=>Math.abs(n-b[i])<20)
  },{x,y,want},{timeout:10000})
}
async function drawWithoutCamera(browser, mobile) {
  const context=await browser.newContext({viewport:mobile ? {width:375,height:812} : {width:1344,height:840},
    isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'})
  try {
    const page=await context.newPage()
    const cdp=await context.newCDPSession(page)
    if (!mobile) {
      const {targetInfo}=await cdp.send('Target.getTargetInfo')
      await cdp.send('Browser.setPermission',{permission:{name:'camera'},setting:'denied',
        origin:new URL(base).origin,browserContextId:targetInfo.browserContextId})
    }
    await context.addInitScript(noDevice=>{
      const media=navigator.mediaDevices, get=media.getUserMedia.bind(media)
      if (noDevice) media.enumerateDevices=async()=>[]
      media.getUserMedia=(...args)=>{
        top.captureAttempts=(top.captureAttempts || 0)+1
        if (noDevice) return Promise.reject(new DOMException('Requested device not found','NotFoundError'))
        return get(...args)
      }
    },mobile)
    await page.goto(new URL('?mode=mapeo',base).href)
    const frame=page.frameLocator('#mappingFrame')
    await id(frame,'mapMain').waitFor()
    assert.equal(await page.evaluate(()=>top.captureAttempts || 0),0)
    assert.equal(await frame.locator('button[data-map-view=canvas]').getAttribute('aria-pressed'),'true')
    assert.equal(await frame.locator('[data-tool=brush]').getAttribute('aria-pressed'),'true')
    assert.equal(await frame.locator('[data-hydra=off]').getAttribute('aria-pressed'),'true')
    const [out]=await Promise.all([page.waitForEvent('popup'),click(frame,'mapOutput')])
    await pixel(out,.5,.5,[0,0,0])
    assert.equal(await page.evaluate(()=>top.captureAttempts || 0),0)
    await click(frame,'mapCamera')
    await frame.locator('#mapStatus[data-error],#mapStatus').filter({hasText:mobile ? /cámara.*disponible|no se encontró|no hay/i : /permiso/i}).waitFor()
    assert.equal(await page.evaluate(()=>top.captureAttempts),1)
    assert.equal(await frame.locator('button[data-map-view=canvas]').getAttribute('aria-pressed'),'true')
    const guide=id(frame,'mapPreview')
    const box=await guide.boundingBox(), pointers=[[.25,.25],[.4,.4],[.6,.6],[.75,.75]]
    const at=([x,y])=>({x:box.x+x*box.width,y:box.y+y*box.height})
    if (mobile) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[at(pointers[0])]})
      for (const point of pointers.slice(1))
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[at(point)]})
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    } else {
      const from=at(pointers[0]),to=at(pointers.at(-1))
      await page.mouse.move(from.x,from.y); await page.mouse.down()
      await page.mouse.move(to.x,to.y,{steps:15}); await page.mouse.up()
    }
    await pixel(out,.5,.5,[255,255,255])
    await frame.locator('#mapLayers .map-layer-name').first().click()
    // The editor now draws the selected stroke's bounding box. Read the entire
    // projector frame: outside the diagonal brush band every pixel must be black.
    const clean=await out.evaluate(()=>{
      const c=document.querySelector('canvas'), gl=c.getContext('webgl')
      const bytes=new Uint8Array(c.width*c.height*4)
      gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes)
      let lit=0,stray=0
      for (let y=0;y<c.height;y++) for (let x=0;x<c.width;x++) {
        const offset=4*(y*c.width+x)
        if (Math.max(bytes[offset],bytes[offset+1],bytes[offset+2])<12) continue
        lit++
        const u=x/c.width, v=1-y/c.height
        if (u<.19 || u>.81 || v<.19 || v>.81 || Math.abs(u-v)>.085) stray++
      }
      return {lit,stray}
    })
    assert.ok(clean.lit>100,'El proyector recibió el trazo')
    assert.equal(clean.stray,0,'La selección del editor no debe proyectar guías')
    await frame.locator('[data-tool=brush]').click()
    const clearCorner=await guide.evaluate(c=>{
      const bytes=c.getContext('2d').getImageData(c.width*.23,c.height*.72,1,1).data
      return bytes[3]===0
    })
    assert.equal(clearCorner,true)
    assert.equal(await page.evaluate(()=>top.captureAttempts),1)
    console.log(mobile ? 'Táctil, sin dispositivos simulados:' : 'Mouse, permiso denegado por Chromium:',clean)
  } finally { await context.close() }
}
async function main(){
  const browser=await chromium.launch({channel:'chromium',headless:!real,args})
  try {
    if (process.argv.includes('--no-camera')) {
      await drawWithoutCamera(browser,false)
      await drawWithoutCamera(browser,true)
      return
    }
    const ctx=await browser.newContext({
      viewport:{width:1440,height:900},permissions:['camera'],serviceWorkers:'block'
    })
    let loadMapper
    const mapperReady = new Promise(resolve => { loadMapper=resolve })
    await ctx.route('**/src/mapping.js?*',async route => {
      await mapperReady
      await route.continue()
    })
    await ctx.addInitScript(()=>{
      if (!navigator.mediaDevices?.getUserMedia) return
      const media=navigator.mediaDevices, native=media.getUserMedia.bind(media)
      media.getUserMedia=(...args)=>{
        top.cameraRequests=(top.cameraRequests || 0)+1
        return native(...args)
      }
    })
    const errors=[]
    ctx.on('page',page=>page.on('pageerror',e=>errors.push(e.message)))
    const p=await ctx.newPage()
    p.setDefaultTimeout(12000)
    await p.goto(base+'abrir.html?v=2.21.1')
    await p.waitForFunction(()=>!!window.cm && hydraSynth?.canvas?.width>100)
    await p.evaluate(()=>cm.setValue('solid(1,0,0).out(o0)'))
    await p.waitForFunction(()=>{
      hydraSynth.tick(34)
      const [r,g,b] = hydraSynth.regl.read({x:8,y:8,width:1,height:1})
      return r>245 && g<10 && b<10
    })
    await click(p,'openMapping')
    const f=p.frameLocator('#mappingFrame')
    await id(f,'mapBoot').waitFor()
    assert.equal(await id(f,'mapOutput').isVisible(),false)
    loadMapper()
    await id(f,'mapCamera').waitFor()
    assert.equal(await id(p,'consoleDock').isVisible(),false)
    assert.equal(await p.evaluate(()=>hydraSynth.canvas.width>100&&hydraSynth.canvas.height>100),true)
    await click(f,'mapCamera')
    const video=f.locator('#mapReference video')
    await video.waitFor({timeout:20000})
    await video.evaluate(async v=>{
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('La cámara no entregó frames')),8000)
        v.requestVideoFrameCallback(()=>{clearTimeout(timer);resolve()})
      })
      window.referenceTrack=v.srcObject.getVideoTracks()[0]
    })
    await f.getByText('Cámara en vivo',{exact:true}).waitFor()
    if(real) {
      const details=await video.evaluate(v=>({width:v.videoWidth,height:v.videoHeight,frames:v.getVideoPlaybackQuality().totalVideoFrames}))
      assert.ok(details.width>100&&details.frames>0)
      await click(p,'mappingSectors')
      await id(p,'mappingReference').waitFor()
      await click(p,'mappingSurface')
      await click(f,'mapCamera')
      assert.equal(await id(f,'mapReference').evaluate(()=>window.referenceTrack.readyState),'ended')
      console.log('PHYSICAL camera decoded frames, preserved between desks and released:',details)
      return
    }
    const [out]=await Promise.all([p.waitForEvent('popup'),click(f,'mapOutput')])
    await pixel(out,.29,.29,[0,0,0])
    const full=f.locator('[data-hydra=full]')
    await full.click()
    await pixel(out,.29,.29,[255,0,0])
    const guide=id(f,'mapPreview')
    const outside=()=>guide.evaluate(c=>[...c.getContext('2d').getImageData(c.width*.29,c.height*.29,1,1).data])
    assert.deepEqual(await outside(),[0,0,0,0])
    assert.equal(await video.isVisible(),true)
    await f.getByRole('button',{name:'Composición',exact:true}).click()
    assert.equal(await video.isVisible(),false)
    const comp=await outside()
    assert.ok(comp[0]>230 && comp[3]>230)
    await f.getByRole('button',{name:'Superficie',exact:true}).click()
    const brush=f.getByRole('button',{name:'Pincel',exact:true})
    await brush.click()
    await f.getByRole('button',{name:'Sólido',exact:true}).click()
    const r=await guide.boundingBox()
    await p.mouse.move(r.x+r.width*.4,r.y+r.height*.45)
    await p.mouse.down()
    await p.mouse.move(r.x+r.width*.7,r.y+r.height*.45,{steps:8})
    await p.mouse.up()
    await pixel(out,.55,.45,[169,255,80])
    await click(p,'mappingSectors')
    await click(p,'chooseOutput')
    await click(p,'mappingHideBase')
    await pixel(out,.29,.29,[0,0,0])
    await pixel(out,.55,.45,[169,255,80])
    await click(p,'mappingSurface')
    assert.equal(await video.isVisible(),true)
    assert.equal(await p.evaluate(()=>hydraSynth.canvas.width>300 && hydraSynth.canvas.height>170),true)
    assert.equal(await out.locator('body > *').count(),1)
    if(process.env.MAP_SHOTS) await p.screenshot({path:process.env.MAP_SHOTS+'/mapeo-camara-falsa-escritorio.png'})
    await click(p,'exitMapping')
    assert.equal(await id(f,'mapReference').evaluate(()=>window.referenceTrack.readyState),'ended')
    await click(p,'signalOpen')
    await p.locator('[data-tab=input]').click()
    if(await id(p,'autoMixInput').getAttribute('aria-pressed')==='true') await click(p,'autoMixInput')
    await click(p,'camera')
    await p.locator('#sourcePreview video').waitFor()
    const before=await p.evaluate(()=>window.cameraRequests)
    await click(p,'openMapping')
    await id(f,'mapMain').waitFor()
    assert.equal(await id(f,'mapCamera').textContent(),'Conectar cámara')
    assert.equal(await video.count(),0,'La referencia del Studio requiere elegirla al entrar')
    assert.equal(await p.evaluate(()=>window.cameraRequests),before)
    await click(f,'mapCamera')
    await video.waitFor()
    assert.equal(await p.evaluate(()=>window.cameraRequests),before,'Mapping cloned the already-open Studio camera')
    await click(f,'mapCamera')
    await f.getByText('Cámara desconectada',{exact:true}).waitFor()
    assert.equal(await p.locator('#sourcePreview video').evaluate(v=>v.srcObject.getVideoTracks()[0].readyState),'live')
    await click(p,'exitMapping')
    const mobile=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,permissions:['camera']})
    const mp=await mobile.newPage()
    await mp.goto(base+'?mode=mapeo')
    const mf=mp.frameLocator('#mappingFrame')
    await click(mf,'mapCamera')
    await mf.locator('#mapReference video').waitFor()
    assert.equal(await id(mf,'mapViewport').evaluate(el=>document.documentElement.scrollWidth===innerWidth && el.getBoundingClientRect().width<=innerWidth),true)
    if(process.env.MAP_SHOTS) await mp.screenshot({path:process.env.MAP_SHOTS+'/mapeo-camara-falsa-movil.png'})
    await mobile.close()
    await drawWithoutCamera(browser,false)
    await drawWithoutCamera(browser,true)
    assert.deepEqual(errors,[])
    console.log('Fake camera on desktop/mobile, transparent camera working view, isolated clean projection, no hidden-stage downscale, removable base, and reuse of Studio webcam checked.')
  } finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
