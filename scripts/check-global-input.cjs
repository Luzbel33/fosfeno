const assert = require('node:assert/strict')
const path = require('node:path')
const { chromium } = require('playwright')
const { openStudio } = require('./studio-nav.cjs')

const url = process.argv[2] || 'http://127.0.0.1:8736/'
const red = [255,0,0], green = [0,255,0], mixed = [89,166,0]
const baseCode = 'solid(1,0,0).out(o0)'
const legacyBlend = 'solid(1,0,0).blend(src(s0), 0.65).out(o0)'

async function pixels(page, left, right) {
  await page.waitForFunction(({left,right}) => {
    const { canvas,regl } = hydraSynth
    hydraSynth.tick(32)
    return [left,right].every((expected,i)=>{
      const x = i === 0 ? .25 : .75
      const actual = regl.read({x:Math.floor(canvas.width*x),y:Math.floor(canvas.height*.5),width:1,height:1})
      return expected.every((channel,j)=>Math.abs(actual[j]-channel)<4)
    })
  },{left,right},{timeout:6000}).catch(err=>{ throw new Error('Color esperado '+JSON.stringify({left,right}),{cause:err}) })
}

async function main() {
  const browser = await chromium.launch({channel:'chromium',args:['--use-angle=d3d11','--enable-unsafe-swiftshader']})
  try {
    const page = await browser.newPage({viewport:{width:1200,height:720},serviceWorkers:'block'})
    const errors = []
    page.on('pageerror',err=>errors.push(err.message))
    await page.goto(url)
    await page.waitForFunction(()=>window.hydraSynth && window.fosfenoStack)
    await page.evaluate(async () => {
      const model = await unpackComposition(window.captureFosfenoMapping())
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="lime"/></svg>'
      const input = new File([svg],'verde.svg',{type:'image/svg+xml'})
      const region = {id:1,shape:'Rectángulo',points:[[.05,.1],[.45,.1],[.45,.9],[.05,.9]],visible:true,
        source:'none',opacity:1,paint:false,fx:[]}
      window.restoreOld = (code,baseMode='visible') => restoreFosfenoMapping(packComposition({...model,code,name:'Compatibilidad',
        input,inputKind:'file',regions:[region],settings:{...model.settings,baseMode,mixStandaloneInput:true,output:'0'}}))
    })
    await page.evaluate(code=>restoreOld(code),legacyBlend)
    assert.equal(await page.evaluate(()=>cm.getValue()),baseCode)
    await pixels(page,mixed,mixed)
    const saved = await page.evaluate(async () => {
      window.savedRoute = captureFosfenoMapping()
      const p = await unpackComposition(savedRoute)
      const principal = p.regions.find(r=>!r.id)
      return {source:principal.source,sameAsset:p.input===principal.file}
    })
    assert.deepEqual(saved,{source:'file',sameAsset:true})
    await openStudio(page,'code')
    await page.locator('#liveEdit').click()
    await openStudio(page,'sectors')
    const global = {sectorId:0,layerId:0,kind:'source'}, sector = {sectorId:1,layerId:0}
    await page.evaluate(([ref,to])=>fosfenoStack.command('move',ref,to),[global,sector])
    await pixels(page,mixed,mixed)
    await page.locator('#applySectors').click()
    await pixels(page,green,red)
    await page.evaluate(()=>fosfenoStack.command('undo'))
    await pixels(page,green,red)
    await page.locator('#applySectors').click()
    await pixels(page,mixed,mixed)
    await page.evaluate(ref=>fosfenoStack.command('remove',ref),global)
    await page.locator('#applySectors').click()
    await pixels(page,red,red)
    assert.ok(await page.evaluate(()=>s0.src?.naturalWidth>0))
    await page.evaluate(()=>restoreFosfenoMapping(savedRoute))
    await pixels(page,mixed,mixed)
    await page.evaluate(ref=>fosfenoStack.command('select',ref),global)
    await openStudio(page,'signal')
    await page.locator('#visualFile').setInputFiles(path.resolve(__dirname,'../media/fosfeno-demo.mp4'))
    await page.waitForFunction(()=>s0.src instanceof HTMLVideoElement && s0.src.videoWidth)
    await page.evaluate(()=>{
      window.savedVideo = s0.src
      window.savedUrl = savedVideo.currentSrc
      window.revoked = []
      const revoke = URL.revokeObjectURL.bind(URL)
      URL.revokeObjectURL = url=>{revoked.push(url);revoke(url)}
    })
    await page.evaluate(([ref,to])=>fosfenoStack.command('move',ref,to),[global,sector])
    await openStudio(page,'sectors')
    await page.locator('#applySectors').click()
    await page.evaluate(()=>fosfenoStack.command('select',{sectorId:0,layerId:0,kind:'sector'}))
    await openStudio(page,'signal')
    await page.locator('#autoMixInput').click()
    await page.locator('#visualFile').setInputFiles({name:'nueva.svg',mimeType:'image/svg+xml',
      buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="blue"/></svg>')})
    await page.waitForFunction(()=>s0.src instanceof HTMLImageElement && s0.src.naturalWidth===8)
    const time = await page.evaluate(()=>savedVideo.currentTime)
    await page.waitForFunction(time=>savedVideo.currentTime!==time && !savedVideo.paused && !revoked.includes(savedUrl),time)
    await page.evaluate(ref=>fosfenoStack.command('remove',{...ref,kind:'source'}),sector)
    await openStudio(page,'sectors')
    await page.locator('#applySectors').click()
    await page.waitForFunction(()=>savedVideo.paused && revoked.filter(url=>url===savedUrl).length===1)
    await pixels(page,red,red)
    const custom = 'const entrada = s0\nsrc(entrada).invert().out(o0)'
    await page.evaluate(code=>restoreOld(code),custom)
    assert.equal(await page.evaluate(()=>cm.getValue()),custom)
    await pixels(page,[255,0,255],[255,0,255])
    await page.evaluate(()=>fosfenoStack.command('select',{sectorId:0,layerId:0,kind:'sector'}))
    await openStudio(page,'signal')
    await page.locator('#visualFile').setInputFiles({name:'azul.svg',mimeType:'image/svg+xml',
      buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="blue"/></svg>')})
    await page.waitForFunction(()=>s0.src?.naturalWidth===10)
    assert.ok(await page.evaluate(async ()=>!(await unpackComposition(captureFosfenoMapping()))
      .regions.some(region=>region.id===0 && region.source!=='sketch')))
    await pixels(page,[255,255,0],[255,255,0])
    await page.evaluate(code=>restoreOld(code,'hidden'),custom)
    assert.equal(await page.evaluate(()=>cm.getValue()),custom)
    await pixels(page,green,green)
    assert.deepEqual(errors,[])
    console.log('Ruteo de archivo principal, traslado manual, quitar, deshacer, guardado y migración del panel anterior verificados por píxeles. Código s0 propio preservado.')
  } finally {
    await browser.close()
  }
}
main().catch(err=>{console.error(err);process.exitCode=1})
