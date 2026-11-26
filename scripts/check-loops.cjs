const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.launch({channel:'chromium',args:['--use-angle=d3d11','--enable-unsafe-swiftshader']})
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}})
    page.setDefaultTimeout(12000)
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.addInitScript(()=>{
      // Observe real encoded chunks and the video element used by each renderer.
      const start=MediaRecorder.prototype.start, play=HTMLMediaElement.prototype.play
      MediaRecorder.prototype.start=function(...args) {
        window.hasChunk=false
        this.addEventListener('dataavailable',e=>{ if (e.data.size) window.hasChunk=true })
        return start.apply(this,args)
      }
      HTMLMediaElement.prototype.play=function(...args) {
        if (this instanceof HTMLVideoElement && this.loop) window.loopVideo=this
        return play.apply(this,args)
      }
    })
    const id=name=>page.locator('#'+name)
    const pixel=(x,y,rgb)=>page.waitForFunction(({x,y,rgb})=>{
      const {regl,canvas}=hydraSynth
      const sample=regl.read({x:Math.floor(canvas.width*x),y:Math.floor(canvas.height*(1-y)),width:1,height:1})
      return rgb.every((n,i)=>Math.abs(n-sample[i])<10)
    },{x,y,rgb},{timeout:10000})
    const record=async()=>{
      await id('loopButton').click()
      await page.waitForFunction(()=>window.hasChunk)
      await id('loopButton').click()
      await id('toast').getByRole('button',{name:'Ver loop'}).click()
      await page.waitForFunction(()=>document.activeElement.matches('.loop-row button:first-of-type'))
      return page.locator('.loop-row:focus-within strong').textContent()
    }
    const row=name=>page.locator('.loop-row').filter({has:page.getByText(name,{exact:true})})
    const edition=color=>'setResolution(320,180)\nsolid('+color+').out(o0)'
    const draw=async()=>{
      await id('newSector').click()
      await id('sectorShapes').getByRole('button',{name:'Rectángulo'}).click()
      const r=await id('sectorGuide').boundingBox()
      await page.mouse.move(r.x+r.width*.2,r.y+r.height*.2)
      await page.mouse.down()
      await page.mouse.move(r.x+r.width*.7,r.y+r.height*.7)
      await page.mouse.up()
    }
    await page.goto(process.argv[2] || 'http://127.0.0.1:8736/?v=2.16')
    await page.waitForFunction(()=>window.cm?.getValue().startsWith('// Semilla') && window.hydraSynth)
    await page.evaluate(code=>cm.setValue(code),edition('1,0,0'))
    await pixel(.5,.5,[255,0,0])
    const whole=await record()
    assert.match(whole,/^Salida /)
    assert.equal(await id('sectorTarget').textContent(),'Destino · Toda la visual')
    const download=page.waitForEvent('download')
    await row(whole).getByRole('button',{name:/^Descargar /}).click()
    const file=await download
    assert.equal(file.suggestedFilename(),whole)
    assert.ok((await fs.stat(await file.path())).size>100)

    await draw()
    await id('sectorCodeToggle').click()
    await id('sectorCode').fill('return solid(0,1,0)')
    await id('sectorApplyCode').click()
    await pixel(.5,.5,[0,255,0])
    const sector=await record()
    assert.match(sector,/^Rectángulo 1 /)
    assert.match(await id('sectorTarget').textContent(),/Rectángulo 1 · Base/)

    await page.reload()
    await page.waitForFunction(()=>window.cm && window.hydraSynth)
    await id('openLoops').click()
    await row(whole).waitFor()
    await row(sector).waitFor()
    await page.evaluate(code=>cm.setValue(code),edition('0,0,1'))
    await pixel(.5,.5,[0,0,255])
    await row(whole).getByRole('button',{name:/^Usar /}).click()
    await pixel(.5,.5,[166,0,89])
    await page.waitForFunction(()=>window.loopVideo?.videoWidth===320 && loopVideo.currentTime>0)
    assert.equal(await id('visualName').textContent(),whole+' · s0')

    await draw()
    await id('addSectorLayer').click()
    await id('openLoops').click()
    assert.match(await id('sectorTarget').textContent(),/Rectángulo 1 · Capa 2/)
    await id('liveEdit').click()
    await row(sector).getByRole('button',{name:/^Usar /}).click()
    await page.waitForFunction(name=>document.querySelector('#sectorFileButton').textContent===name,sector)
    await pixel(.5,.5,[166,0,89])
    await id('applySectors').click()
    await pixel(.5,.5,[0,255,0])
    await pixel(.05,.05,[166,0,89])
    await page.waitForFunction(()=>window.loopVideo?.videoWidth===160 && loopVideo.currentTime>0)
    // A short capture must actually restart after the last frame.
    await page.evaluate(()=>new Promise((resolve,reject)=>{
      const video=window.loopVideo
      const timeout=setTimeout(()=>reject(new Error('El loop no volvió al inicio')),10000)
      video.addEventListener('seeking',()=>{clearTimeout(timeout); resolve()},{once:true})
    }))
    await id('sector-tree-1').getByRole('button',{name:'Base',exact:true}).click()
    assert.equal(await id('sectorFileButton').textContent(),'Archivo')
    assert.deepEqual(errors,[])
    console.log('Output and sector recordings, saved-row focus, download, reload, global mix, selected layer and repeated playback passed.')
  } finally { await browser.close() }
}

main().catch(e=>{ console.error(e); process.exitCode=1 })
