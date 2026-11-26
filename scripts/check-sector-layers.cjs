const assert = require('node:assert/strict')
const { chromium } = require('playwright')

const url = process.argv[2] || 'http://127.0.0.1:8736/'
const red = [255,0,0], blue = [0,0,255], white = [255,255,255]
const baseOverFill = [0,128,128], redOverBase = [64,96,96], cyanOverBase = [0,160,160]
const pixel = (page,x,y,rgb) => page.waitForFunction(({x,y,rgb})=>{
  const {canvas,regl}=hydraSynth
  const value=regl.read({x:Math.floor(x*canvas.width),y:Math.floor((1-y)*canvas.height),width:1,height:1})
  return rgb.every((v,i)=>Math.abs(value[i]-v)<4)
},{x,y,rgb},{timeout:6000})

async function touchMove(browser) {
  const page = await browser.newPage({viewport:{width:375,height:812},isMobile:true,hasTouch:true})
  try {
    const touchSession = await page.context().newCDPSession(page)
    const tap = name => page.locator('#'+name).tap()
    const touch = (type,points) => touchSession.send('Input.dispatchTouchEvent',{type,touchPoints:points})
    const point = async (x,y) => {
      const r=await page.locator('#sectorGuide').boundingBox()
      return {x:Math.round(r.x+x*r.width),y:Math.round(r.y+y*r.height)}
    }
    await page.goto(url)
    await page.waitForFunction(()=>window.hydraSynth && window.cm?.getValue().startsWith('// Semilla '))
    await page.evaluate(()=>cm.setValue('setResolution(320,180)\nsolid(1,0,0).out(o0)'))
    await pixel(page,.5,.5,red)
    await tap('backToLayers')
    await tap('newSector')
    await page.locator('#sectorShapes').getByRole('button',{name:'Rectángulo',exact:true}).tap()
    await touch('touchStart',[await point(.2,.2)])
    await touch('touchMove',[await point(.55,.66)])
    await touch('touchEnd',[])
    await tap('sectorStyleToggle')
    await tap('sectorFillToggle')
    await page.locator('[data-sector-colors=fill]').getByRole('button',{name:'Celeste',exact:true}).tap()
    const cyan = [84,216,255]
    await pixel(page,.4,.4,cyan)
    await tap('sectorStyleToggle')
    const hint=page.locator('#touchGuideHint')
    assert.ok(await hint.isVisible())
    assert.match(await hint.textContent(),/interior/)
    await touch('touchStart',[await point(.4,.4)])
    await touch('touchMove',[await point(.64,.44)])
    assert.equal(await hint.textContent(),'Moviendo sector')
    await touch('touchCancel',[])
    await pixel(page,.25,.45,cyan)
    await pixel(page,.69,.45,red)
    assert.match(await hint.textContent(),/interior/)
    await touch('touchStart',[await point(.4,.4)])
    await touch('touchMove',[await point(.64,.44)])
    await pixel(page,.69,.45,cyan)
    await touch('touchEnd',[])
    await pixel(page,.25,.45,red)
    await tap('sectorStyleToggle')
    assert.ok(await page.locator('#sectorFillControls').isVisible(),'the first tap after moving still opens Estilo')
    await tap('closeTools')
    await page.waitForFunction(()=>{
      const guide=document.querySelector('#sectorGuide').getBoundingClientRect()
      return Math.abs(guide.width/guide.height-320/180)<.01
    },null,{timeout:4000})
  } finally { await page.close() }
}

async function main() {
  const browser = await chromium.launch({channel:'chromium',args:['--use-angle=d3d11','--enable-unsafe-swiftshader']})
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}})
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const id = name => page.locator('#'+name)
    const click = name => id(name).click()
    const sample = (x,y,rgb) => pixel(page,x,y,rgb)
    const point = async (x,y) => {
      const r = await id('sectorGuide').boundingBox()
      return [r.x+x*r.width,r.y+y*r.height]
    }
    const beginDrag = async (x,y,toX,toY) => {
      await page.mouse.move(...await point(x,y))
      await page.mouse.down()
      await page.mouse.move(...await point(toX,toY),{steps:7})
    }
    const cursor=()=>id('sectorGuide').evaluate(el=>getComputedStyle(el).cursor)
    const hover=async(x,y)=>page.mouse.move(...await point(x,y))

    await page.goto(url)
    await page.waitForFunction(()=>window.hydraSynth && window.cm?.getValue().startsWith('// Semilla '))
    await page.evaluate(()=>cm.setValue('setResolution(320,180)\nsolid(1,0,0).out(o0)'))
    await sample(.5,.5,red)
    assert.equal(await id('backToLayers').isVisible(),false)
    await click('closeSectors')
    assert.ok(await id('backToLayers').isVisible())
    await click('backToLayers')
    assert.equal(await id('backToLayers').isVisible(),false)

    await click('newSector')
    await id('sectorShapes').getByRole('button',{name:'Rectángulo',exact:true}).click()
    await hover(.2,.2)
    assert.equal(await cursor(),'crosshair')
    await beginDrag(.2,.2,.6,.65)
    await page.mouse.up()
    await click('sectorStyleToggle')
    await click('sectorFillToggle')
    await id('sectorFillColor').fill('#0000ff')
    await id('sectorFillColor').press('Tab')
    await click('sectorStrokeToggle')
    await sample(.4,.4,blue)
    await sample(.207,.4,white)
    await sample(.12,.4,red)
    await hover(.1,.4)
    assert.equal(await cursor(),'default')
    await hover(.4,.4)
    assert.equal(await cursor(),'grab')
    await beginDrag(.4,.4,.7,.4)
    assert.equal(await cursor(),'grabbing')
    await sample(.7,.4,blue)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    assert.equal(await cursor(),'default')
    await sample(.4,.4,blue)
    await sample(.7,.4,red)
    await click('sectorDeform')
    await hover(.4,.4)
    assert.equal(await cursor(),'move')
    await hover(.2,.2)
    assert.equal(await cursor(),'grab')
    await hover(.4,.2)
    assert.equal(await cursor(),'copy')
    await page.keyboard.press('Escape')
    assert.equal(await id('sectorDeform').getAttribute('aria-pressed'),'false')

    await click('sectorCodeToggle')
    await id('sectorCode').fill('return solid(0,1,0)')
    await click('sectorApplyCode')
    await id('sectorOpacity').fill('50')
    await sample(.4,.4,baseOverFill)
    await click('addSectorLayer')
    const base = id('sector-tree-1').getByRole('button',{name:'Base',exact:true})
    const upper = id('sector-tree-1').getByRole('button',{name:'Capa 2',exact:true})
    assert.equal(await upper.getAttribute('aria-pressed'),'true')
    await sample(.4,.4,baseOverFill)

    await click('sectorMediaToggle')
    const png = await page.evaluate(()=>{
      const canvas=document.createElement('canvas'); canvas.width=canvas.height=8
      const ctx=canvas.getContext('2d'); ctx.fillStyle='red'; ctx.fillRect(0,0,8,8)
      return canvas.toDataURL().split(',')[1]
    })
    const chooser = page.waitForEvent('filechooser')
    await click('sectorFileButton')
    await (await chooser).setFiles({name:'rojo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')})
    await page.waitForFunction(()=>document.querySelector('#sectorFileButton').textContent==='rojo.png')
    await id('sectorOpacity').fill('25')
    await sample(.4,.4,redOverBase)
    await click('addSectorEffect')
    await id('sectorFx').getByRole('button',{name:'Invertir',exact:true}).click()
    await click('addSectorEffect')
    await sample(.4,.4,cyanOverBase)
    await base.click()
    assert.equal(await id('sectorOpacity').inputValue(),'50')
    assert.equal(await id('sectorControls').locator('.mixer-effect').count(),0)
    await upper.click()
    assert.equal(await id('sectorOpacity').inputValue(),'25')
    assert.match(await id('sectorControls').innerText(),/Invertir[\s\S]*En salida/)

    await click('addSectorLayer')
    await click('sectorCodeToggle')
    await id('sectorCode').fill('return solid(1,1,1)')
    await click('sectorApplyCode')
    await sample(.4,.4,white)
    await click('lowerSectorLayer')
    await sample(.4,.4,[191,255,255])
    await click('removeSectorLayer')
    await sample(.4,.4,cyanOverBase)
    await upper.click()

    await beginDrag(.4,.4,.65,.47)
    await sample(.25,.45,red)
    await sample(.7,.45,cyanOverBase)
    await page.mouse.up()
    await sample(.457,.45,white)
    assert.equal(await cursor(),'grab')

    await id('sectorStorage').locator('summary').click()
    await click('saveSectors')
    await page.waitForFunction(()=>document.querySelector('#sectorStatus').textContent.includes('guardados'))
    const saved = await page.evaluate(async()=>{
      const data = await new Promise((resolve,reject)=>{
        const req=indexedDB.open('fosfeno-sectores',1)
        req.onerror=()=>reject(req.error)
        req.onsuccess=()=>{
          const db=req.result, read=db.transaction('sesion').objectStore('sesion').get('actual')
          read.onsuccess=()=>{ db.close(); resolve(read.result) }
          read.onerror=()=>{ db.close(); reject(read.error) }
        }
      })
      const project={name:'Relleno y capas',code:cm.getValue(),regions:data,settings:{output:'0',quality:'auto',
        brush:.42,sensitivity:1,bpm:30,painting:false,internalPulse:false,autoMix:true,fold:'libre',seed:''}}
      const {regions:[sector]} = await unpackComposition(packComposition(project))
      return {style:sector.style,base:sector.opacity,layer:sector.layers[0].opacity,
        source:sector.layers[0].file.name,effect:sector.layers[0].fx[0].name}
    })
    assert.deepEqual(saved,{style:{fillOn:true,fill:'#0000ff',strokeOn:true,stroke:'#ffffff',strokeWidth:4},
      base:.5,layer:.25,source:'rojo.png',effect:'Invertir'})
    await click('loadSectors')
    await sample(.7,.45,cyanOverBase)

    await click('liveEdit')
    await beginDrag(.65,.47,.45,.47)
    await sample(.32,.45,red)
    await page.mouse.up()
    await sample(.32,.45,red)
    await click('applySectors')
    await sample(.32,.45,cyanOverBase)
    await click('liveEdit')
    await click('newSector')
    await id('sectorShapes').getByRole('button',{name:'Rectángulo',exact:true}).click()
    await beginDrag(.3,.3,.55,.6)
    await page.mouse.up()
    const pickAt=async(x,y)=>page.mouse.click(...await point(x,y))
    await id('layerOverview').getByRole('button',{name:'Toda la visual',exact:true}).click()
    await pickAt(.42,.45)
    assert.equal(await id('effectTarget').textContent(),'Rectángulo 2')
    await id('layerOverview').getByRole('button',{name:'Ocultar Rectángulo 2'}).click()
    await pickAt(.42,.45)
    assert.equal(await id('effectTarget').textContent(),'Rectángulo 1')
    assert.deepEqual(errors,[])
    await page.close()
    await touchMove(browser)
    console.log('Sector fill, border, image layers, reorder, opacity, live/manual drag, touch drag and portable state passed.')
  } finally { await browser.close() }
}

main().catch(error=>{ console.error(error); process.exitCode=1 })
