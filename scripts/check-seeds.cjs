const assert = require('node:assert/strict')
const {chromium} = require('playwright')
const {openStudio} = require('./studio-nav.cjs')
const url = process.argv[2] || 'http://127.0.0.1:8736/'

async function check(page,width) {
  const id = name => page.locator('#'+name)
  const click = name => id(name).click()
  const code = () => page.evaluate(()=>cm.getValue())
  await page.goto(url)
  await page.waitForFunction(()=>window.hydraSynth && window.cm?.getValue().startsWith('// Semilla '))
  const initial = await code()
  await click('explore')
  const first = await code()
  await click('explore')
  const second = await code()
  assert.notEqual(first,initial)
  assert.notEqual(first,second)
  const number = second.match(/^\/\/ Semilla (\d+)/)[1]
  await click('editSeed')
  assert.equal(await id('seed').inputValue(),number)
  await page.locator('[data-fold=x]').click()
  await click('randomizeSeed')
  const roll=await id('seed').inputValue()
  assert.notEqual(roll,number)
  await id('randomizeSeed').press('Enter')
  const another=await id('seed').inputValue()
  assert.match(another,/^\d{1,10}$/)
  assert.ok(Number(another)<=4294967295)
  assert.notEqual(another,roll)
  assert.equal(await code(),second)
  assert.equal(await page.locator('[data-fold=x]').getAttribute('aria-pressed'),'true')
  await click('grow')
  assert.ok((await code()).startsWith('// Semilla '+another+' · x\n'))
  await id('seed').fill('777')
  await click('grow')
  const mirrored = await code()
  assert.match(mirrored,/^\/\/ Semilla 777 · x/)
  await click('explore')
  await id('seed').fill('777')
  await click('grow')
  assert.equal(await code(),mirrored)
  assert.ok(await id('transport').evaluate(e=>e.scrollWidth<=e.clientWidth+1))

  await openStudio(page,'sectors')
  await click('removeBase')
  await click('explore')
  await page.waitForFunction(()=>document.querySelector('#baseCard').dataset.mode==='empty' &&
    window.fosfenoStack.snapshot().rows.find(row=>!row.id).entries[0].effects.some(f=>f.name.startsWith('Semilla ')))
  await click('editSeed')
  assert.match(await id('seed').inputValue(),/^\d+$/)
  assert.equal(await code(),'')
  await click('randomizeSeed')
  const candidate=await id('seed').inputValue()
  await click('mixSeed')
  await page.waitForFunction(seed=>fosfenoStack.snapshot().rows.find(row=>!row.id).entries[0].effects
    .some(effect=>effect.name==='Semilla '+seed && effect.enabled),candidate)
  assert.equal(await code(),'')

  await click('openMapping')
  const map=page.frameLocator('#mappingFrame')
  const inside=name=>map.locator('#'+name)
  await inside('mapNewSeed').waitFor()
  assert.equal(await map.locator('[data-hydra=off]').getAttribute('aria-pressed'),'true')
  assert.ok(await inside('mapNewSeed').evaluate(e=>e.getBoundingClientRect().right<=innerWidth+1))
  if (width<1000) {
    await inside('mapNewSeed').click()
    await map.locator('[data-hydra=full][aria-pressed=true]').waitFor()
    assert.equal(await code(),'')
    await inside('mapEditSeed').click()
    assert.equal(await id('seed').isVisible(),true)
    return
  }
  // A prepared seed must leave the mapper's existing route unchanged until sent.
  await click('mappingSectors')
  await click('newSector')
  await id('sectorShapes').getByRole('button',{name:'Rectángulo',exact:true}).click()
  const box=await id('sectorGuide').boundingBox()
  await page.mouse.move(box.x+box.width*.15,box.y+box.height*.15)
  await page.mouse.down()
  await page.mouse.move(box.x+box.width*.85,box.y+box.height*.85,{steps:6})
  await page.mouse.up()
  await click('liveEdit')
  await click('mappingSurface')
  await map.locator('#mapStudioLayers button').filter({hasText:/Rectángulo 1/}).first().click()
  await inside('mapNewSeed').click()
  await inside('mapApplySeed').waitFor()
  assert.equal(await map.locator('[data-hydra=off]').getAttribute('aria-pressed'),'true')
  await inside('mapApplySeed').click()
  await map.locator('[data-hydra=sectors][aria-pressed=true]').waitFor()
  await map.locator('[data-map-view=output][aria-pressed=true]').waitFor()
  await page.waitForFunction(()=>{
    const canvas=document.querySelector('#mappingFrame').contentWindow.fosfenoMapping.preview().canvas
    const ctx=canvas.getContext('2d'), corners=ctx.getImageData(2,2,1,1).data
    if ([...corners].slice(0,3).some(v=>v>6)) return false
    for (let x=.2;x<.8;x+=.1) for (let y=.2;y<.8;y+=.1) {
      const color=ctx.getImageData(Math.floor(canvas.width*x),Math.floor(canvas.height*y),1,1).data
      if (Math.max(...color.slice(0,3))>25) return true
    }
    return false
  },null,{timeout:10000})
  assert.equal(await code(),'')
  console.log('Mapeo manual: ruta apagada hasta enviar y píxeles restringidos al sector.')
}

;(async()=>{
  const browser=await chromium.launch({channel:'chromium',args:['--use-angle=d3d11','--enable-unsafe-swiftshader']})
  try {
    for (const width of [280,375,1440]) {
      const page=await browser.newPage({viewport:{width,height:width===1440?900:720},isMobile:width<400,hasTouch:width<400,serviceWorkers:'block'})
      page.setDefaultTimeout(9000)
      const errors=[]
      page.on('pageerror',e=>errors.push(e.message))
      await check(page,width)
      assert.deepEqual(errors,[])
      console.log(width+' px: semilla aleatoria, edición reproducible, sin fondo y acceso desde Mapeo.')
      await page.close()
    }
  } finally { await browser.close() }
})().catch(error=>{console.error(error);process.exitCode=1})
