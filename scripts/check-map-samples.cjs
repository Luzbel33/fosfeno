const assert = require('node:assert/strict')
const { readFile } = require('node:fs/promises')
const { join } = require('node:path')
const { chromium } = require('playwright')

const url = process.argv[2] || 'http://127.0.0.1:8736/'
const names = ['Iris de marea', 'Umbral de ámbar', 'Deriva abisal']
const click = (scope, id) => scope.locator('#' + id).click()
const layers = map => map.locator('#mapLayers .map-layer')

async function shot(page, name) {
  if (process.env.MAP_SHOTS) await page.screenshot({ path:join(process.env.MAP_SHOTS,name) })
}

async function popupCanvas(popup) {
  const elements = await popup.locator('body > *').evaluateAll(nodes => nodes.map(node => node.tagName))
  assert.deepEqual(elements,['CANVAS'], 'La salida sólo debe contener el lienzo de proyección')
}

async function signature(popup) {
  return popup.locator('body > canvas').evaluate(source => {
    const canvas = document.createElement('canvas')
    canvas.width = 60
    canvas.height = 36
    const context = canvas.getContext('2d')
    context.drawImage(source,0,0,canvas.width,canvas.height)
    return [...context.getImageData(0,0,canvas.width,canvas.height).data]
      .filter((_, channel) => channel%4!==3).join(',')
  })
}

async function signatureChanges(popup, baseline, expected) {
  await popup.waitForFunction(({ baseline, expected }) => {
    const source = document.querySelector('body > canvas')
    if (!source?.width || !source.height) return false
    const canvas = document.createElement('canvas')
    canvas.width = 60
    canvas.height = 36
    const context = canvas.getContext('2d')
    context.drawImage(source,0,0,canvas.width,canvas.height)
    const signature = [...context.getImageData(0,0,canvas.width,canvas.height).data]
      .filter((_,channel) => channel%4!==3).join(',')
    return (signature===baseline)===expected
  },{baseline,expected})
}

async function mapFile(page, startDownload, unpack) {
  const [download] = await Promise.all([page.waitForEvent('download'),startDownload()])
  assert.ok(download.suggestedFilename().endsWith('.fosmap'))
  return unpack(new Blob([await readFile(await download.path())]))
}

async function openMapper(browser, mobile, errors) {
  const context = await browser.newContext({
    viewport: mobile ? {width:375,height:812} : {width:1440,height:900},
    hasTouch:mobile, isMobile:mobile, serviceWorkers:'block'
  })
  const fetched = []
  context.on('request',request => {
    if (request.url().includes('/media/mapas/') && request.url().endsWith('.fosmap')) fetched.push(request.url())
  })
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)))
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  await page.goto(new URL('?mode=mapeo',url).href)
  const map = page.frameLocator('#mappingFrame')
  await map.locator('#mapMain').waitFor()
  return {page,map,context,fetched}
}

async function point(map,x,y) {
  const box = await map.locator('#mapSurface').boundingBox()
  return [box.x+x*box.width,box.y+y*box.height]
}

async function desktop(browser, unpack, errors) {
  const {page,map,context,fetched} = await openMapper(browser,false,errors)
  assert.equal(await layers(map).count(),0)
  assert.equal(await map.locator('[data-hydra="off"]').getAttribute('aria-pressed'),'true')
  const [popup] = await Promise.all([page.waitForEvent('popup'),click(map,'mapOutput')])
  await popup.locator('canvas').waitFor()
  await popupCanvas(popup)
  const blank = await signature(popup)
  assert.match(blank,/^0(?:,0)*$/)
  await click(map,'mapSamples')
  await map.locator('#mapSamplesDialog').waitFor()
  assert.equal(await map.locator('[data-mapping-sample]').count(),3)
  await map.locator('#mapSampleList').evaluate(async list => {
    const previews = [...list.querySelectorAll('img')]
    if (previews.length!==3) throw new Error('Faltan miniaturas del catálogo')
    await Promise.all(previews.map(image=>image.decode()))
  })
  assert.deepEqual(fetched,[],'Abrir el catálogo sólo debe cargar metadatos')
  await popupCanvas(popup)
  await page.keyboard.press('Escape')
  await map.locator('#mapSamplesDialog').waitFor({state:'hidden'})

  await page.mouse.move(...await point(map,.08,.91))
  await page.mouse.down()
  await page.mouse.move(...await point(map,.32,.91),{steps:12})
  await page.mouse.up()
  await layers(map).first().waitFor()
  assert.equal(await layers(map).count(),1)

  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const context = canvas.getContext('2d')
    context.fillStyle = '#242424'
    context.fillRect(0,0,160,90)
    return canvas.toDataURL().split(',')[1]
  })
  await map.locator('#mapPhotoFile').setInputFiles({
    name:'referencia.png', mimeType:'image/png', buffer:Buffer.from(image,'base64')
  })
  await map.locator('#mapReference img').waitFor()
  await click(map,'mapCalibrate')
  for (const [x,y] of [[.12,.12],[.87,.13],[.85,.88],[.11,.86]])
    await page.mouse.click(...await point(map,x,y))
  await map.locator('#mapState').getByText('Calibrado',{exact:true}).waitFor()
  const baseline = await mapFile(page,()=>click(map,'mapExport'),unpack)
  assert.equal(baseline.layers.length,1)
  assert.ok(baseline.calibration)
  await signatureChanges(popup,blank,false)

  for (const [index,name] of names.entries()) {
    const before = await signature(popup)
    await click(map,'mapSamples')
    const dialog = map.locator('#mapSamplesDialog')
    await dialog.waitFor()
    const sample = await mapFile(page,
      () => dialog.getByRole('link',{name:'Descargar '+name,exact:true}).click(),unpack)
    assert.ok(sample.layers.length>1 && sample.layers.every(layer => layer.kind==='ink' && layer.strokes.length>0))
    assert.equal(sample.studio,null)
    await dialog.getByRole('button',{name:'Sumar '+name,exact:true}).click()
    await dialog.waitFor({state:'hidden'})
    assert.equal(await layers(map).count(),baseline.layers.length+sample.layers.length)
    await signatureChanges(popup,before,false)
    await popupCanvas(popup)
    const combined = await mapFile(page,()=>click(map,'mapExport'),unpack)
    assert.deepEqual(combined.calibration,baseline.calibration)
    assert.deepEqual(combined.layers[0],baseline.layers[0])
    assert.equal(combined.studioMode,baseline.studioMode)
    assert.ok(await map.locator('#mapReference img').isVisible())

    if (index===0) {
      await layers(map).getByRole('button',{name:sample.layers[0].name,exact:true}).click()
      await map.locator('#mapOpacity').fill('55')
      const edited = await mapFile(page,()=>click(map,'mapExport'),unpack)
      assert.equal(edited.layers.find(layer => layer.name===sample.layers[0].name).opacity,.55)
      await click(map,'mapUndo')
      assert.equal(await map.locator('#mapOpacity').inputValue(),'100')
      if (process.env.MAP_SHOTS) {
        await map.locator('[data-map-view="output"]').click()
        await shot(page,'fosfeno-muestra-integrada.png')
        await map.locator('[data-map-view="surface"]').click()
      }
    }
    await click(map,'mapUndo')
    assert.equal(await layers(map).count(),baseline.layers.length)
    await signatureChanges(popup,before,true)
    await popupCanvas(popup)
  }
  await context.close()
}

async function mobile(browser, errors) {
  const {page,map,context} = await openMapper(browser,true,errors)
  await map.locator('#mapSamples').tap()
  const dialog = map.locator('#mapSamplesDialog')
  await dialog.waitFor()
  const box = await dialog.boundingBox()
  assert.ok(box && box.x>=0 && box.y>=0 && box.x+box.width<=375 && box.y+box.height<=812)
  assert.equal(await map.locator('html').evaluate(el => el.scrollWidth<=el.clientWidth),true)
  await shot(page,'fosfeno-muestras-movil.png')
  await dialog.getByRole('button',{name:'Sumar Deriva abisal',exact:true}).tap()
  await dialog.waitFor({state:'hidden'})
  assert.ok(await layers(map).count()>1)
  await map.locator('#mapUndo').tap()
  assert.equal(await layers(map).count(),0)
  await context.close()
}

async function main() {
  const { unpackMap } = await import('../src/mapping-project.mjs')
  const browser = await chromium.launch({
    channel:'chromium', args:['--use-angle=d3d11','--enable-unsafe-swiftshader']
  })
  const errors = []
  try {
    await desktop(browser,unpackMap,errors)
    await mobile(browser,errors)
    assert.deepEqual(errors,[])
    console.log('Muestras: tres mapas descargables y editables, foco inicial limpio, capas/calibración preservadas, deshacer, móvil y salida sólo visual.')
  } finally { await browser.close() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
