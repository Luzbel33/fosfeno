const assert = require('node:assert/strict')
const { join } = require('node:path')
const { chromium } = require('playwright')
const { openStudio } = require('./studio-nav.cjs')

const url = process.argv[2] || 'http://127.0.0.1:8736/'
const imageLabel = 'Imagen · rojo-prueba.png'
const loopLabel = 'Loop · verde-prueba.webm'
const left = [.27, .38]
const right = [.73, .38]
const black = [0, 0, 0]
const green = [0, 255, 0]
// 64 px VP8 fixture from ffmpeg's color=0x00ff00:s=64x64:r=12:d=0.5 source.
const greenClip = Buffer.from([
  'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAJUEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHGTbuMU6uEElTDZ1OsggEiTbuMU6uEHFO7a1OsggI+7AEAAAAAAABZ',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmoCrXsYMPQkBNgIRMYXZmV0GETGF2ZkSJiEB/QAAAAAAAFlSua9euAQAAAAAAAE7XgQFz',
  'xYgAAAAAAAAAAZyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhAT3kNXgkLCBQLqBQJqBAlWwhFW5gQFV7oEA7AEAAAAAAAACAAASVMNn0HNzzWPAi2PFiAAAAAAAAAABZ8iYRaOHRU5DT0RFUkSHi0xhdmMgbGlidnB4Z8ihRaOIRFVSQVRJT05E',
  'h5MwMDowMDowMC41MDAwMDAwMDAAH0O2dUDB54EAo8SBAACA0AMAnQEqQABAAABHCIWFiIWEiAICAnWqA/gD+gIHGkZGAXDHSEvEAP7xcg//JB68nn5/5IR//Znm3/yZf/ZbAKOWgQBTANEBAAEQFAAYABhYL/QACI6AAKOWgQCnANEBAAEQ',
  'FAAYABhYL/QACI6AAKOWgQD6ANEBAAEQFAAYABhYL/QACI6AAKOWgQFNANEBAAEQFAAYABhYL/QACI6AAKOWgQGhANEBAAEQFAAYABhYL/QACI6AABxTu2uRu4+zgQC3iveBAfGCAXfwgQM='
].join(''), 'base64')
const loopFile = { name: 'verde-prueba.webm', mimeType: 'video/webm', buffer: greenClip }

async function shot(page, name) {
  if (process.env.STACK_SHOTS) await page.screenshot({ path: join(process.env.STACK_SHOTS, name) })
}

async function fixtures(page) {
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext('2d')
    context.fillStyle = '#f00'
    context.fillRect(0, 0, 64, 64)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  return {
    image: { name: 'rojo-prueba.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') },
    video: loopFile
  }
}

async function pixel(page, [x, y], expected) {
  await page.waitForFunction(({ x, y, expected }) => {
    const { canvas, regl } = hydraSynth
    hydraSynth.tick(34)
    const rgba = regl.read({
      x: Math.floor(x * canvas.width), y: Math.floor((1 - y) * canvas.height),
      width: 1, height: 1
    })
    return rgba[3] === 255 && expected.every((channel, i) => Math.abs(channel - rgba[i]) < 12)
  }, { x, y, expected }, { timeout: 8000 }).catch(error => {
    throw new Error('Estudio (' + x + ', ' + y + '): esperaba RGB ' + expected.join(', '), { cause: error })
  })
}

function point(box, [x, y]) {
  return [box.x + x * box.width, box.y + y * box.height]
}

async function drag(page, locator, from, to) {
  const box = await locator.boundingBox()
  assert.ok(box)
  await page.mouse.move(...point(box, from))
  await page.mouse.down()
  await page.mouse.move(...point(box, to), { steps: 6 })
  await page.mouse.up()
}

async function createSector(page, from, to) {
  await openStudio(page, 'sectors')
  await page.locator('#newSector').click()
  await page.locator('#sectorShapes').getByRole('button', { name: 'Rectángulo', exact: true }).click()
  await drag(page, page.locator('#sectorGuide'), from, to)
}

async function picture(page, file) {
  await page.locator('#sectorMediaToggle').click()
  const [dialog] = await Promise.all([
    page.waitForEvent('filechooser'), page.locator('#sectorFileButton').click()
  ])
  await dialog.setFiles(file)
}

async function effect(page, name) {
  await page.locator('#addSectorEffect').click()
  await page.locator('#sectorFx').getByRole('button', { name, exact: true }).click()
}

async function chooseSavedLoop(page, destination, tap = false) {
  const dialog = page.locator('#stackLoopDialog')
  const act = locator => tap ? locator.tap() : locator.click()
  await dialog.waitFor()
  assert.equal(await page.locator('#stackLoopDestination').textContent(), destination)
  const preview = dialog.getByRole('button', { name: 'Vista previa de verde-prueba.webm', exact: true })
  await act(preview)
  await page.waitForFunction(() => {
    const video = document.querySelector('#stackLoopDialog .loop-preview')
    return video?.videoWidth === 64 && video.currentTime > .05
  })
  assert.equal(await preview.getAttribute('aria-pressed'), 'true')
  await act(dialog.getByRole('button', { name: 'Usar verde-prueba.webm', exact: true }))
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.locator('#stackLoopDialog video').count(), 0)
}

const tree = (page, id) => page.locator('#sector-tree-' + id)
const source = (page, id, name) => tree(page, id).getByRole('button', { name, exact: true })
const chip = (page, id, effectName) =>
  tree(page, id).getByRole('button', { name: new RegExp('^Editar ' + effectName + ' en ') })
const layerFor = (page, id, label) => tree(page, id).locator('.layer-tree-item')
  .filter({ has: page.getByRole('button', { name: label, exact: true }) })

async function assertFits(page, selectors) {
  const overflow = await page.evaluate(selectors => {
    const visible = element => !!element.getClientRects().length
    const containers = selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)))
    return containers.filter(element => visible(element) && element.scrollWidth > element.clientWidth + 1)
      .map(element => [element.id || element.tagName, element.scrollWidth, element.clientWidth])
  }, selectors)
  assert.deepEqual(overflow, [])
}

async function mapEffectControl(page, map, sectorId) {
  const selected = '[data-stack-kind="effect"][data-selected="true"][data-sector-id="' + sectorId + '"]'
  const control = map.locator('#mapStudioLayers ' + selected + ' + #mapStackInspector [data-command="amount"]')
  await control.waitFor()
  const box = await control.boundingBox()
  const viewport = page.viewportSize()
  assert.ok(box && box.x >= 0 && box.y >= 0 &&
    box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
  'El control en línea del efecto debe quedar dentro de la vista')
  return control
}

async function studioPage(browser, options, errors) {
  const page = await browser.newPage(options)
  page.on('pageerror', error => errors.push(error.message))
  page.setDefaultTimeout(12000)
  await page.addInitScript(() => {
    const start = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (...params) {
      if (this instanceof HTMLVideoElement && this.loop) window.stackTestVideo = this
      return start.apply(this, params)
    }
  })
  await page.goto(url)
  await page.waitForFunction(() => !!window.cm?.getValue().trim() && !!window.hydraSynth)
  return page
}

async function move(page, sectorId, layerId) {
  await page.locator('#stackMove').click()
  const list = page.locator('#stackDestinations')
  const matching = list.locator('button[data-sector-id="' + sectorId + '"]')
  const selector = layerId == null ? '[data-root="true"]' :
    layerId === 'new' ? '[data-new-layer="true"][data-layer-id="0"]' : '[data-layer-id="' + layerId + '"]'
  const destination = matching.and(list.locator('button' + selector))
  await destination.click()
}

async function mapPixel(page, [x, y], expected) {
  await page.waitForFunction(({ x, y, expected }) => {
    const canvas = document.querySelector('#mappingFrame').contentWindow.fosfenoMapping?.preview().canvas
    if (!canvas?.width || !canvas.height) return false
    const rgba = canvas.getContext('2d').getImageData(
      Math.floor(x * canvas.width), Math.floor(y * canvas.height), 1, 1
    ).data
    return rgba[3] > 220 && expected.every((channel, i) => Math.abs(channel - rgba[i]) < 18)
  }, { x, y, expected }, { timeout: 9000 }).catch(error => {
    throw new Error('Mapeo (' + x + ', ' + y + '): esperaba RGB ' + expected.join(', '), { cause: error })
  })
}

async function desktop(browser) {
  const errors = []
  const page = await studioPage(browser, { viewport: { width: 1480, height: 900 } }, errors)
  const files = await fixtures(page)
  const code = 'setResolution(640,360)\nsolid(0,0,0).out(o0)'
  await openStudio(page, 'code')
  await page.evaluate(text => cm.setValue(text), code)
  await pixel(page, left, black)

  await createSector(page, [.09, .13], [.45, .65])
  await page.locator('#addSectorLayer').click()
  await picture(page, files.image)
  await source(page, 1, imageLabel).waitFor()
  await pixel(page, left, [255, 0, 0])
  await page.locator('#sectorOpacity').fill('75')
  await effect(page, 'Invertir')
  await pixel(page, left, [0, 191, 191])

  await createSector(page, [.54, .13], [.92, .65])
  await page.locator('#addSectorLayer').click()
  await page.locator('#openLoops').click()
  assert.match(await page.locator('#sectorTarget').textContent(), /Rectángulo 2 · Capa 2/)
  await page.locator('#loopFile').setInputFiles(files.video)
  await page.locator('#loopList').getByRole('button', { name: 'Usar verde-prueba.webm', exact: true }).waitFor()
  await page.locator('#stackLoop').click()
  assert.equal(await source(page, 2, loopLabel).count(), 0)
  await chooseSavedLoop(page, 'Rectángulo 2 · Capa 2')
  await source(page, 2, loopLabel).waitFor({ timeout: 17000 }).catch(async error => {
    const media = await page.evaluate(() => {
      const video = window.stackTestVideo
      return video && [video.readyState, video.videoWidth, video.currentTime, video.error?.message]
    })
    throw new Error('El loop no apareció en la segunda pila: ' +
      (await page.locator('#toast').textContent()) + ' | ' + JSON.stringify(media) + ' | ' +
      (await page.locator('#layerOverview').innerText()).slice(-450), { cause: error })
  })
  await page.waitForFunction(() => window.stackTestVideo?.currentTime > 0 && window.stackTestVideo.videoWidth === 64)
  await pixel(page, right, green)

  await layerFor(page, 1, imageLabel).locator('.layer-tree-name').click()
  await move(page, 2)
  await source(page, 2, imageLabel).waitFor()
  await source(page, 1, imageLabel).waitFor({ state: 'hidden' })
  assert.ok(await chip(page, 2, 'Invertir').isVisible())
  assert.ok(await source(page, 2, loopLabel).isVisible())
  await pixel(page, left, black)
  await pixel(page, right, [0, 255, 191])
  await page.keyboard.press('Control+z')
  await source(page, 1, imageLabel).waitFor()
  await source(page, 2, imageLabel).waitFor({ state: 'hidden' })
  await pixel(page, left, [0, 191, 191])
  await pixel(page, right, green)

  await chip(page, 1, 'Invertir').click()
  const amount = page.getByRole('slider', { name: 'Parámetro de Invertir', exact: true })
  await amount.fill('0.25')
  await pixel(page, left, [143, 48, 48])
  await chip(page, 1, 'Invertir').click()
  await move(page, 2, 1)
  await chip(page, 2, 'Invertir').waitFor()
  await chip(page, 1, 'Invertir').waitFor({ state: 'hidden' })
  await pixel(page, left, [191, 0, 0])
  await pixel(page, right, [64, 191, 64])
  await chip(page, 2, 'Invertir').click()
  await shot(page, 'fosfeno-pila-estudio.png')
  await chip(page, 2, 'Invertir').click()
  assert.equal(Number(await amount.inputValue()), .25)
  await page.locator('#stackRemove').click()
  await chip(page, 2, 'Invertir').waitFor({ state: 'hidden' })
  await pixel(page, right, green)
  await page.keyboard.press('Control+z')
  await chip(page, 2, 'Invertir').waitFor()
  await pixel(page, right, [64, 191, 64])
  await source(page, 2, loopLabel).click()
  await move(page, 1, 'new')
  await source(page, 1, loopLabel).waitFor()
  await source(page, 2, loopLabel).waitFor({ state: 'hidden' })
  assert.ok(await chip(page, 2, 'Invertir').isVisible())
  await pixel(page, left, green)
  await pixel(page, right, black)
  await page.keyboard.press('Control+z')
  await source(page, 2, loopLabel).waitFor()
  await source(page, 1, loopLabel).waitFor({ state: 'hidden' })
  await pixel(page, left, [191, 0, 0])
  await pixel(page, right, [64, 191, 64])
  console.log('Estudio: capas, imagen y loop; movimiento de capa, efecto y fuente; píxeles, parámetros y deshacer.')

  await mappingStudio(page, files.image)
  assert.ok(await source(page, 1, imageLabel).isVisible())
  assert.ok(await source(page, 2, loopLabel).isVisible())
  assert.ok(await chip(page, 2, 'Invertir').isVisible())
  assert.equal(await page.evaluate(() => cm.getValue()), code)
  await pixel(page, left, [191, 0, 0])
  await pixel(page, right, [64, 191, 64])
  assert.deepEqual(errors, [])
  await page.close()
}

async function mappingStudio(page, image) {
  await page.locator('#openMapping').click()
  const map = page.frameLocator('#mappingFrame')
  await map.locator('#mapMain').waitFor()
  await map.locator('[data-hydra="sectors"]').click()
  await map.locator('#mapMediaFile').setInputFiles({ ...image, name: 'superficie-prueba.png' })
  const surface = map.locator('#mapSurface')
  await map.locator('#mapSurface[data-cursor="place"]').waitFor()
  await drag(page, surface, [.23, .75], [.57, .93])
  await map.locator('#mapLayers').getByRole('button', { name: 'superficie-prueba.png', exact: true }).click()
  assert.ok(await map.locator('#mapOpacity').isVisible())
  await mapPixel(page, [.39, .85], [255, 0, 0])
  const mapStack = map.locator('#mapStudioLayers')
  const target = mapStack.locator('[data-stack-kind="effect"][data-sector-id="2"][data-layer-id="1"][data-index="0"]')
  await target.waitFor()
  await target.click()
  const inspector = map.locator('#mapStackInspector')
  await inspector.waitFor()
  const control = await mapEffectControl(page, map, 2)
  assert.equal(Number(await control.inputValue()), .25)
  await control.fill('0.5')
  await pixel(page, right, [128, 128, 128])
  await mapPixel(page, right, [128, 128, 128])
  await control.focus()
  await page.keyboard.press('Control+z')
  assert.equal(Number(await control.inputValue()), .5)
  await target.locator('.map-layer-name').focus()
  await page.keyboard.press('Control+z')
  await pixel(page, right, [64, 191, 64])
  await mapPixel(page, [.39, .85], [255, 0, 0])
  await page.keyboard.press('Control+Shift+z')
  await pixel(page, right, [128, 128, 128])
  await map.locator('#mapUndo').click()
  await pixel(page, right, [64, 191, 64])
  assert.ok(await map.locator('#mapLayers').getByRole('button', { name: 'superficie-prueba.png', exact: true }).isVisible())
  if (process.env.STACK_SHOTS) {
    await map.locator('[data-map-view="output"]').click()
    await target.click()
    await map.locator('.map-inspector').evaluate(element => { element.scrollTop = 0 })
    await shot(page, 'fosfeno-pila-mapeo.png')
  }
  await mapStack.locator('[data-stack-kind="layer"][data-sector-id="2"][data-layer-id="1"] button').click()
  await inspector.locator('[data-command="loop"]').click()
  await page.locator('#stackLoopDialog').waitFor()
  assert.ok(await page.locator('#mappingFrame').isVisible())
  await chooseSavedLoop(page, 'Rectángulo 2 · Capa 2')
  assert.ok(await page.locator('#mappingFrame').isVisible())
  await mapPixel(page, right, [64, 191, 64])
  await page.locator('#exitMapping').click()
  await page.locator('#mappingNav').waitFor({ state: 'hidden' })
  await openStudio(page, 'sectors')
  console.log('Mapeo: pieza de superficie, efecto del Estudio con historial propio y selector de loop sin salir del mapa.')
}

async function mobile(browser) {
  const errors = []
  const page = await studioPage(browser, {
    viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1
  }, errors)
  await page.locator('#backToLayers').tap()
  await page.locator('#layerDesk').waitFor()
  await page.locator('#newSector').tap()
  await page.locator('#sectorShapes').getByRole('button', { name: 'Rectángulo', exact: true }).tap()
  const box = await page.locator('#sectorGuide').boundingBox()
  const touch = await page.context().newCDPSession(page)
  const points = [point(box, [.2, .2]), point(box, [.72, .7])].map(([x, y]) => ({ x, y }))
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [points[1]] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.locator('#layerOverview').getByRole('button', { name: 'Rectángulo 1', exact: true }).waitFor()
  await page.locator('#addSectorLayer').tap()
  await page.locator('#openLoops').tap()
  await page.locator('#loopFile').setInputFiles(loopFile)
  await page.locator('#loopList').getByRole('button', { name: 'Usar verde-prueba.webm', exact: true }).waitFor()
  await page.locator('#backToLayers').tap()
  await page.locator('#stackLoop').tap()
  await chooseSavedLoop(page, 'Rectángulo 1 · Capa 2', true)
  await source(page, 1, loopLabel).waitFor()
  await page.locator('#addSectorEffect').tap()
  await page.locator('#sectorFx').getByRole('button', { name: 'Invertir', exact: true }).tap()
  await chip(page, 1, 'Invertir').waitFor()
  await chip(page, 1, 'Invertir').tap()
  if (process.env.STACK_SHOTS) {
    const back = page.locator('#stackBack')
    if (await back.isVisible()) await back.tap()
    await source(page, 1, loopLabel).scrollIntoViewIfNeeded()
    await shot(page, 'fosfeno-pila-estudio-movil.png')
  }
  await assertFits(page, ['html', 'body', '#studioNav', '#layerDesk', '#layerOverview'])
  await page.locator('#openMapping').tap()
  const map = page.frameLocator('#mappingFrame')
  await map.locator('#mapMain').waitFor()
  const frame = map.locator('html')
  assert.equal(await frame.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true)
  const entry = map.locator('#mapStudioLayers [data-stack-kind="effect"][data-sector-id="1"] button')
  await entry.tap()
  const control = await mapEffectControl(page, map, 1)
  assert.equal(Number(await control.inputValue()), 1)
  await shot(page, 'fosfeno-pila-mapeo-movil.png')
  await page.locator('#mappingSectors').tap()
  await page.locator('#stage').waitFor()
  await page.locator('#exitMapping').tap()
  await page.locator('#mappingNav').waitFor({ state: 'hidden' })
  await assertFits(page, ['html', 'body', '#studioNav', '#layerDesk'])
  assert.deepEqual(errors, [])
  await page.close()
  console.log('Móvil táctil 375 px: sector dibujado, efecto seleccionable en Estudio y Mapeo, regreso sin desborde horizontal.')
}

async function main() {
  const browser = await chromium.launch({
    channel: 'chromium', args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader']
  })
  try {
    await desktop(browser)
    await mobile(browser)
  } finally {
    await browser.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
