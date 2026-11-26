const assert=require('node:assert/strict')
const {chromium}=require('playwright')

async function main() {
  const browser=await chromium.launch({channel:'chromium',args:['--use-angle=d3d11','--enable-unsafe-swiftshader']})
  try {
    const page=await browser.newPage({viewport:{width:1024,height:720},serviceWorkers:'block'})
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.goto(process.argv[2] || 'http://127.0.0.1:8736/')
    await page.waitForFunction(()=>window.hydraSynth)
    if (!await page.evaluate(()=>typeof VisualParameterPreview!=='undefined')) await page.addScriptTag({url:'./src/visual-preview.js'})
    const report=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas')
      document.body.append(canvas)
      const preview=new VisualParameterPreview(canvas), pixel=(x,y)=>Array.from(canvas.getContext('2d').getImageData(x,y,1,1).data)
      const sum=()=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.reduce((s,n)=>Math.imul(31,s)+n|0,0)
      const live=()=>{
        hydraSynth.tick(32)
        return [...hydraSynth.regl.read({x:20,y:20,width:1,height:1})]
      }
      const stage=window.hydraSynth
      const match=preview.show('shape(4,.31,.001).rotate(.77).scroll(.17,-.21).out(o0)')
      shape(4,.31,.001).rotate(.77).scroll(.17,-.21).out(o0)
      hydraSynth.tick(32)
      const native=document.createElement('canvas')
      native.width=canvas.width;native.height=canvas.height
      const nc=native.getContext('2d')
      nc.drawImage(hydraSynth.canvas,0,0,native.width,native.height)
      const sampled={lit:0,dark:0,agree:0}
      for(let y=7;y<canvas.height;y+=10) for(let x=7;x<canvas.width;x+=10) {
        const actual=nc.getImageData(x,y,1,1).data[0], small=pixel(x,y)[0]
        if (actual>192) sampled.lit++;else if (actual<64) sampled.dark++
        if (Math.abs(actual-small)<20) sampled.agree++
      }
      solid(.25,.50,.75).out(o0)
      const stagePixel=live()
      const first=preview.show('solid(1,0,0).out()'), red=pixel(24,28)
      const greenScore='const v = 1 / 2\nsolid(0,v,0).out(o1)\nsrc(o1).out(o0)\nrender(o0)'
      const next=preview.show(greenScore)
      await new Promise(r=>setTimeout(r,180))
      const green=pixel(24,28)
      const applied=preview.show('.kaleid(3)',{kind:'operator'}), old=sum()
      const adjusted=preview.show('.kaleid(7)',{kind:'operator'}), change=sum()!==old
      const running=preview.show('osc(14, 2, () => 0.2 + Math.sin(time)).out()'),start=sum()
      await new Promise(r=>setTimeout(r,200))
      const anim=sum()!==start
      const waitFrame=()=>new Promise(r=>setTimeout(r,150))
      const fft='solid(() => a.fft[0], () => a.fft[1], () => a.fft[7]).out()'
      let bands=[.25,.5],samples=0
      const levels={audioLevels:()=>{samples++; return bands}}
      const stageSpeed=window.speed
      const silence=preview.show(fft),silent=pixel(3,5)
      const listening=preview.show(fft,levels),firstBands=pixel(3,5),firstSamples=samples
      bands=[.75,NaN]
      await waitFrame()
      const nextBands=pixel(3,5)
      const snapshot=preview.show('const red=a.fft[0]; solid(red,0,0).out()',levels)
      bands=[0,0]
      await waitFrame()
      const held=pixel(3,5)
      const frozen=preview.show('speed = 0; osc(10,2,1).out()'), frozenHash=sum()
      await waitFrame()
      const independent=sum()===frozenHash && window.speed===stageSpeed
      const nacar=preview.show(SKETCHES.find(s=>s.id==='nacar').code,levels)
      await waitFrame()
      const colored=()=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4!==3 && v>32)
      const nacarVisible=colored()
      const seeds=Array.from({length:20},(_,i)=>growSketch(String(i),'radial'))
      const nativeSeed=preview.show(seeds.find(code=>code.includes('// Trama de fase')),levels)
      await waitFrame()
      const seedVisible=colored()
      const customSeed=preview.show(growSketch('9','x'),levels)
      const reticula=preview.show(seeds.find(code=>code.includes('const reticula')),levels)
      const rejected=['a.fft[time]','a.fft[0+1]','a.fft[-1]','a.fft[.5]','a["fft"][1]','a.fft["1"]','a?.fft[1]','a.fft.at(1)']
        .map(expr=>preview.show('solid(() => '+expr+',0,0).out()',levels).ok)
      rejected.push(preview.show('speed += 1; osc().out()').ok,
        preview.show('speed = (()=>2)(); osc().out()').ok,
        preview.show('navigator.mediaDevices.getUserMedia({audio:true}); osc().out()').ok)
      const wrong=preview.show('s0.initCam();osc().out()').reason
      const outside=preview.show('src(s0).out()').reason
      const unavailable=preview.show('.x()', {kind:'operator',trusted:true,definitions:['window.previewTouched=true']})
      const invalid=preview.show('document.body.dataset.previewTouched = "yes"; solid().out()', {trusted:true})
      const state=[live(),stage===window.hydraSynth,window.previewTouched,document.body.dataset.previewTouched]
      const resumed=preview.show('solid(0,0,1).out()'),blue=pixel(2,9)
      const gl=preview.renderer.canvas.getContext('webgl')
      preview.stop()
      const cleared=pixel(2,9),lost=gl.isContextLost()
      canvas.remove()
      return {match,sampled,first,red,next,green,applied,adjusted,change,running,anim,wrong,outside,unavailable,invalid,state,stagePixel,resumed,blue,cleared,lost,
        silence,silent,listening,firstBands,nextBands,firstSamples,snapshot,held,frozen,independent,nacar,nacarVisible,nativeSeed,seedVisible,customSeed,reticula,rejected}
    })
    for (const key of ['match','first','next','applied','adjusted','running','resumed']) assert.equal(report[key].ok,true,key+' '+report[key].reason)
    assert.ok(report.sampled.lit>5 && report.sampled.dark>5 && report.sampled.agree>0.98*(report.sampled.lit+report.sampled.dark),JSON.stringify(report.sampled))
    for (const key of ['change','anim','lost']) assert.equal(report[key],true,key)
    assert.deepEqual(report.red,[255,0,0,255])
    assert.deepEqual(report.green,[0,128,0,255])
    assert.deepEqual(report.blue,[0,0,255,255]);assert.deepEqual(report.cleared,[0,0,0,255])
    assert.ok(report.wrong);assert.match(report.outside,/entrada/)
    assert.equal(report.invalid.ok,false);assert.equal(report.unavailable.ok,false)
    for (const key of ['silence','listening','snapshot','frozen','nacar','nativeSeed']) assert.equal(report[key].ok,true,key+' '+report[key].reason)
    assert.equal(report.firstSamples,1)
    assert.deepEqual(report.silent,[0,0,0,255])
    assert.deepEqual(report.firstBands,[64,128,0,255])
    assert.deepEqual(report.nextBands,[191,0,0,255]); assert.deepEqual(report.held,[191,0,0,255])
    assert.ok(report.nacarVisible && report.seedVisible && report.independent)
    assert.equal(report.customSeed.ok,false); assert.match(report.customSeed.reason,/GLSL/)
    assert.equal(report.reticula.ok,false); assert.match(report.reticula.reason,/reticula/)
    assert.ok(report.rejected.every(ok=>!ok))
    assert.deepEqual(report.state,[report.stagePixel,true,undefined,undefined])
    assert.deepEqual(errors,[])
    console.log('Miniatura aislada: Nácar y semilla radial con píxeles visibles; FFT dinámica y directa, silencio y speed local. GLSL personalizado, JS, acceso a dispositivos y entradas externas rechazados. La salida de Hydra conservó sus píxeles y reloj.')
  } finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
