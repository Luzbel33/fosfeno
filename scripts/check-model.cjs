const assert=require('node:assert/strict')
const {readFile}=require('node:fs/promises')
const {createHash}=require('node:crypto')
const path=require('node:path')
const {chromium}=require('playwright')
const {openStudio}=require('./studio-nav.cjs')

const url=new URL(process.argv[2] || 'http://127.0.0.1:8736/')
const knot=path.join(__dirname,'../media/modelos/nudo-de-cobre.glb')
const sha=b=>createHash('sha256').update(b).digest('hex')
// Sample the source or the clean projection canvas, excluding editor handles.
function signature(source) {
  const c=document.createElement('canvas'); c.width=c.height=80
  const ctx=c.getContext('2d'); ctx.drawImage(source,0,0,80,80)
  const data=ctx.getImageData(0,0,80,80).data
  let count=0,hash=5381
  for (let i=0;i<data.length;i+=4) {
    if (data[i+3]>50 && data[i]+data[i+1]+data[i+2]>30) count++
    for (let j=0;j<4;j++) hash=(hash*33+data[i+j])>>>0
  }
  return {count,hash}
}
async function setRange(control,v) {
  await control.fill(String(v))
  await control.dispatchEvent('change')
}
async function main() {
  const original=await readFile(knot), digest=sha(original)
  const browser=await chromium.launch({channel:'chromium',args:['--use-angle=d3d11','--enable-unsafe-swiftshader']})
  try {
    const page=await browser.newPage({viewport:{width:1440,height:940},serviceWorkers:'block'})
    const errors=[],external=[]
    page.on('pageerror',e=>errors.push(e.message))
    page.on('request',r=>{if(r.url().includes('denied.invalid'))external.push(r.url())})
    await page.addInitScript('window.modelSignature='+signature.toString())
    await page.goto(url.href)
    await page.waitForFunction(()=>window.hydraSynth && window.fosfenoStack)
    await page.locator('#visualFile').setInputFiles(knot)
    await page.waitForFunction(()=>window.s0?.src?.modelFrame>0,null,{timeout:45000}).catch(async e=>{throw Error(await page.locator('#cameraStatus').textContent(),{cause:e})})
    const fixed=await page.evaluate(()=>({frame:s0.src.modelFrame,...modelSignature(s0.src)}))
    assert.ok(fixed.count>150 && fixed.count<4000,JSON.stringify(fixed))
    await page.waitForTimeout(180)
    assert.deepEqual(await page.evaluate(()=>({frame:s0.src.modelFrame,...modelSignature(s0.src)})),fixed)
    await openStudio(page,'sectors')
    const global={sectorId:0,layerId:0,kind:'source'}
    await page.evaluate(r=>fosfenoStack.command('select',r),global)
    const controls=page.locator('#stackModel')
    await controls.locator('summary').click()
    assert.equal(await controls.getByRole('button',{name:'Ortográfica'}).getAttribute('aria-pressed'),'true')
    await controls.getByRole('button',{name:'Perspectiva'}).click()
    await page.waitForFunction(hash=>modelSignature(s0.src).hash!==hash,fixed.hash)
    const perspective=await page.evaluate(()=>modelSignature(s0.src).hash)
    await setRange(controls.locator('[data-pose=size]'),120)
    await page.waitForFunction(hash=>modelSignature(s0.src).hash!==hash,perspective)
    const scaled=await page.evaluate(()=>modelSignature(s0.src).hash)
    await setRange(controls.locator('[data-pose=y]'),-96)
    await page.waitForFunction(hash=>modelSignature(s0.src).hash!==hash,scaled)
    await controls.getByRole('button',{name:'Continua'}).click()
    await controls.getByRole('button',{name:'Vertical'}).click()
    await setRange(controls.locator('[data-pose=speed]'),88)
    const before=await page.evaluate(()=>modelSignature(s0.src).hash)
    await page.waitForFunction(hash=>modelSignature(s0.src).hash!==hash,before)
    const saved=await page.evaluate(async ()=>{
      window.savedModelProject=captureFosfenoMapping()
      const p=await unpackComposition(savedModelProject), layer=p.regions.find(r=>!r.id)
      const hash=await crypto.subtle.digest('SHA-256',await layer.file.arrayBuffer())
      return {view:layer.modelView,digest:Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join(''),shared:layer.file===p.input}
    })
    assert.equal(saved.digest,digest); assert.equal(saved.shared,true)
    assert.equal(saved.view.projection,'perspective'); assert.equal(saved.view.size,120)
    assert.equal(saved.view.speed,88); assert.equal(saved.view.path,'vertical'); assert.equal(saved.view.spin,true)
    await page.evaluate(async ()=>{
      const p=await unpackComposition(savedModelProject),layer=p.regions.find(r=>!r.id)
      p.input=null
      p.regions=[{...layer,id:1,shape:'Rectángulo',points:[[.1,.15],[.6,.15],[.6,.85],[.1,.85]],opacity:1,modelView:{...layer.modelView,spin:false,path:'none'}}]
      p.code='solid(0,0,0).out(o0)'; p.settings.baseMode='visible'
      await restoreFosfenoMapping(packComposition(p))
    })
    await page.evaluate(()=>fosfenoStack.command('select',{sectorId:1,layerId:0,kind:'source'}))
    await controls.waitFor()
    assert.equal(await controls.locator('[data-pose=speed]').inputValue(),'88')
    await page.waitForFunction(()=>{
      hydraSynth.tick(33)
      const {canvas,regl}=hydraSynth
      const samples=regl.read({x:Math.floor(canvas.width*.18),y:Math.floor(canvas.height*.36),width:Math.floor(canvas.width*.3),height:Math.floor(canvas.height*.25)})
      let n=0; for(let i=0;i<samples.length;i+=4) if(samples[i]+samples[i+1]+samples[i+2]>100) n++
      return n>100
    })
    // Invalid external reference must fail before a loader issues any request.
    const rejection=await page.evaluate(async ()=>{
      const manifest=JSON.stringify({asset:{version:'2.0'},meshes:[{}],images:[{uri:'https://denied.invalid/test.png'}]})
      const bytes=new Uint8Array(20+manifest.length),h=new DataView(bytes.buffer)
      for(const [i,v] of [0x46546c67,2,bytes.length,manifest.length,0x4e4f534a].entries()) h.setUint32(i*4,v,true)
      bytes.set(new TextEncoder().encode(manifest),20)
      const {openModel}=await import('./src/model-source.mjs?v=3.0')
      try { await openModel(new File([bytes],'externo.glb'),new AbortController().signal); return 'ok' } catch(e) {return e.message}
    })
    assert.match(rejection,/externos/); assert.deepEqual(external,[])
    url.searchParams.set('mode','mapeo')
    await page.goto(url.href)
    const m=page.frameLocator('#mappingFrame'), id=n=>m.locator('#'+n)
    await id('mapMain').waitFor()
    await id('mapMediaFile').setInputFiles(knot)
    await m.locator('#mapSurface[data-cursor=place]').waitFor()
    const b=await id('mapPreview').boundingBox()
    await page.mouse.move(b.x+b.width*.10,b.y+b.height*.12)
    await page.mouse.down(); await page.mouse.move(b.x+b.width*.88,b.y+b.height*.83,{steps:8}); await page.mouse.up()
    const desk=page.frames().find(f=>f.url().includes('mapeo.html'))
    const map=()=>desk.evaluate(()=>modelSignature(document.getElementById('mapPreview')))
    await desk.waitForFunction(()=>modelSignature(document.getElementById('mapPreview')).count>30)
    const flat=await map()
    await id('mapModel').locator('summary').click()
    await id('mapModel').getByRole('button',{name:'Perspectiva'}).click()
    await setRange(id('mapModel').locator('[data-pose=y]'),98)
    await desk.waitForFunction(v=>modelSignature(document.getElementById('mapPreview')).hash!==v,flat.hash)
    await id('mapModel').getByRole('button',{name:'Continua'}).click()
    await id('mapModel').getByRole('button',{name:'Órbita'}).click()
    const dp=page.waitForEvent('download'); await id('mapExport').click()
    const bytes=await readFile(await (await dp).path())
    const {unpackMap}=await import('../src/mapping-project.mjs')
    const model=(await unpackMap(new Blob([bytes]))).layers.find(l=>l.kind==='file')
    assert.equal(sha(Buffer.from(await model.file.arrayBuffer())),digest)
    assert.equal(model.modelView.spin,true);assert.equal(model.modelView.path,'circle')
    assert.equal(model.modelView.projection,'perspective')
    await id('mapRemoveLayer').click()
    await id('mapProjectFile').setInputFiles({name:'modelo.fosmap',mimeType:'application/octet-stream',buffer:bytes})
    await id('mapLayers').getByRole('button',{name:path.basename(knot),exact:true}).click()
    await desk.waitForFunction(()=>modelSignature(document.getElementById('mapPreview')).count>30)
    const moved=await map()
    await desk.waitForFunction(h=>modelSignature(document.getElementById('mapPreview')).hash!==h,moved.hash)
    assert.deepEqual(errors,[])
    console.log('GLB Blender: s0 y sector con píxeles, reposo y giro, trayectoria y escala editables, fuente original SHA-256 en composición y mapa reabierto, URI externa rechazada.',fixed)
  } finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
