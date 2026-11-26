const assert = require('node:assert/strict')
const {readFile} = require('node:fs/promises')
const {join} = require('node:path')
const {chromium} = require('playwright')
const {musicExample} = require('../src/music-score')

const url=process.argv[2] || 'http://127.0.0.1:8736/'
const pattern='bpm 240\nstep 1/4\nlead sine vol=.55 gate=.42 attack=.001 release=.02 cutoff=2600 pan=.15: A4 .'
const chord='bpm 120\nstep 1/8\nkeys triangle vol=.45 gate=1.6 cutoff=1800: C4+E4+G4 .\nbeat kick vol=.27 pitch=53: X .'
const button = (page,id) => page.locator('#'+id)
const click = (page,id) => button(page,id).click()

async function installedProbes(context) {
  await context.addInitScript(()=>{
    window.audioProbes=[]
    window.micRequests=0
    const devices=navigator.mediaDevices
    if (devices) {
      const getUserMedia=devices.getUserMedia.bind(devices)
      devices.getUserMedia=request=>{
        if(request.audio) window.micRequests++
        return getUserMedia(request)
      }
    }
    const audio=window.AudioContext
    const createCompressor=audio.prototype.createDynamicsCompressor
    audio.prototype.createDynamicsCompressor=function(){
      const compressor=createCompressor.call(this)
      const analyser=this.createAnalyser()
      analyser.fftSize=2048
      analyser.smoothingTimeConstant=0
      compressor.connect(analyser)
      window.audioProbes.push({analyser,context:this})
      return compressor
    }
    window.inspectMusic=()=>{
      const probe=window.audioProbes.at(-1)
      if (!probe) return null
      const {analyser,context}=probe
      const time=new Float32Array(analyser.fftSize)
      const spectrum=new Float32Array(analyser.frequencyBinCount)
      analyser.getFloatTimeDomainData(time)
      analyser.getFloatFrequencyData(spectrum)
      let peak=0
      for (let i=1;i<spectrum.length;i++) if(spectrum[i]>spectrum[peak]) peak=i
      return {
        amplitude:Math.max(...time.map(Math.abs)),
        freq:peak*context.sampleRate/analyser.fftSize,
        hydra:Array.from(window.a?.fft || []),
        beat:window.musicBeat?.() || 0
      }
    }
  })
}
async function openMusic(page,viaCode=false) {
  if (viaCode) {
    await page.locator('#studioNav [data-view=code]').click()
    await click(page,'openMusicDesk')
  } else {
    await click(page,'signalOpen')
    const section=page.locator('#musicDesk')
    if(await section.getAttribute('open')===null) await section.locator('summary').first().click()
  }
  await button(page,'musicSource').waitFor()
}
async function desktop(browser,errors) {
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'})
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)))
  await installedProbes(context)
  const page=await context.newPage()
  page.setDefaultTimeout(9000)
  await page.goto(url)
  await page.waitForFunction(()=>window.cm?.getValue() && window.hydra)
  const initialCode=await page.evaluate(()=>cm.getValue())
  const silentComposition=await page.evaluate(async()=>Array.from(new Uint8Array(await captureFosfenoMapping().arrayBuffer())))
  const initialTempo=await page.evaluate(()=>window.bpm)
  await openMusic(page,true)
  const source=button(page,'musicSource')
  assert.equal(await source.inputValue(),musicExample.source)
  assert.equal(await page.evaluate(()=>inspectMusic()),null)
  await source.fill(pattern)
  await click(page,'musicSync')
  await click(page,'musicPlay')
  await page.waitForFunction(()=>{
    const p=inspectMusic()
    return p?.amplitude>.05 && Math.abs(p.freq-440)<35 && p.hydra.some(v=>v>.005)
  })
  assert.equal(await page.evaluate(()=>window.bpm),240)
  const rhythm=await page.evaluate(async()=>{
    const samples=[]
    for(let i=0;i<38;i++){
      samples.push(inspectMusic().amplitude)
      await new Promise(resolve=>setTimeout(resolve,17))
    }
    return samples
  })
  assert.ok(rhythm.some(v=>v>.05) && rhythm.some(v=>v<.005),'La salida real alterna señal y silencio.')
  assert.equal(await page.evaluate(()=>cm.getValue()),initialCode)
  assert.equal(await page.evaluate(()=>window.micRequests),0)

  const beat=await page.evaluate(()=>window.musicBeat())
  await source.fill(pattern.replace('A4','Z9'))
  await click(page,'musicPlay')
  await button(page,'musicStatus').getByText(/Línea 3, columna/).waitFor()
  await page.waitForFunction(beat=>{
    const p=inspectMusic()
    return p?.beat > beat && p.amplitude > .05 && Math.abs(p.freq-440)<35
  },beat)

  await source.fill(chord)
  await click(page,'musicPlay')
  await button(page,'musicStatus').getByText(/120 BPM/).waitFor()
  assert.equal(await page.evaluate(()=>window.bpm),120)
  await page.waitForFunction(()=>{
    const p=inspectMusic()
    return p?.amplitude>.05 && p.hydra.some(v=>v>.005)
  })
  const blob=await page.evaluate(async()=>[...new Uint8Array(await captureFosfenoMapping().arrayBuffer())])
  await click(page,'musicStop')
  await page.waitForFunction(()=>inspectMusic()?.amplitude<.001 && window.a.fft.every(v=>v===0))
  assert.equal(await page.evaluate(()=>window.bpm),initialTempo)

  await page.locator('.music-more summary').click()
  await click(page,'musicSave')
  await button(page,'musicStatus').getByText(/guardada/).waitFor()
  const [download]=await Promise.all([page.waitForEvent('download'),click(page,'musicDownload')])
  assert.equal(download.suggestedFilename(),'partitura.fosmus')
  assert.equal(await readFile(await download.path(),'utf8'),chord)
  await click(page,'musicSample')
  assert.equal(await source.inputValue(),musicExample.source)
  assert.equal(await page.evaluate(()=>cm.getValue()),initialCode)
  assert.equal(await page.evaluate(()=>window.musicBeat()),0)
  await page.locator('#studioNav [data-view=code]').click()
  await page.evaluate(code=>cm.setValue(code),musicExample.visual)
  await click(page,'run')
  await page.locator('#codeStatus').getByText(/Sketch ejecutado/).waitFor()
  await openMusic(page)
  await click(page,'musicPlay')
  await page.waitForFunction(()=>window.musicBeat()>0 && window.a.fft.some(v=>v>.005))
  await page.evaluate(bytes=>restoreFosfenoMapping(new Blob([new Uint8Array(bytes)])),blob)
  await openMusic(page)
  assert.equal(await source.inputValue(),chord)
  assert.equal(await page.evaluate(()=>window.musicBeat()),0)

  await page.reload()
  await openMusic(page)
  assert.equal(await source.inputValue(),chord)
  assert.equal(await page.evaluate(()=>inspectMusic()),null)
  await button(page,'musicFile').setInputFiles({name:'ritmo.fosmus',mimeType:'text/plain',buffer:Buffer.from(pattern)})
  await button(page,'musicStatus').getByText(/importada/).waitFor()
  assert.equal(await source.inputValue(),pattern)
  assert.equal(await page.evaluate(()=>window.musicBeat()),0)
  if(process.env.MAP_SHOTS) await page.screenshot({path:join(process.env.MAP_SHOTS,'musica-codigo-escritorio.png')})
  await click(page,'musicPlay')
  await page.waitForFunction(()=>window.musicBeat()>0)
  await page.evaluate(bytes=>restoreFosfenoMapping(new Blob([new Uint8Array(bytes)])),silentComposition)
  assert.equal(await source.inputValue(),'')
  await page.waitForFunction(()=>window.musicBeat()===0 && inspectMusic().amplitude<.001)
  await context.close()
}
async function mobile(browser,errors) {
  const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,serviceWorkers:'block'})
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)))
  await installedProbes(context)
  const page=await context.newPage()
  await page.goto(url)
  await openMusic(page)
  await button(page,'musicPlay').tap()
  await page.waitForFunction(()=>inspectMusic()?.amplitude > .04 && window.a.fft.some(v=>v>.005))
  assert.equal(await page.evaluate(()=>document.body.scrollWidth<=document.body.clientWidth),true)
  if(process.env.MAP_SHOTS) await page.screenshot({path:join(process.env.MAP_SHOTS,'musica-codigo-movil.png')})
  await button(page,'musicStop').tap()
  await page.waitForFunction(()=>inspectMusic()?.amplitude<.001)
  await context.close()
}
async function main(){
  const browser=await chromium.launch({channel:'chromium',args:['--use-angle=d3d11','--enable-unsafe-swiftshader']})
  const errors=[]
  try{
    await desktop(browser,errors)
    await mobile(browser,errors)
    assert.deepEqual(errors,[])
    console.log('Música: señal real Web Audio con frecuencia/ritmo, a.fft, acordes/percusión, error sin cortar, sincronización y parada, composición, .fosmus, borrador y controles táctiles.')
  } finally {await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
