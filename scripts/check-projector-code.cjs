const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const { openStudio } = require('./studio-nav.cjs')

const url = process.argv[2] || 'http://127.0.0.1:8736/'
const red = [255, 0, 0]
const sample = [.8, .3]
const initialCode = [
  'setResolution(640, 360)',
  'solid(1, 0, 0).out(o0)',
  '// <b id="probeMarkup">Mostrá el texto literal</b>'
].join('\n')
const draftCode = initialCode.replace('1, 0, 0', '0, 1, 0') + '\n// Borrador sin ejecutar'
const mapDraft = draftCode + '\n// Editado durante Mapeo'
const layerDraft = 'return solid(0, 0, 1)\n// Capa sin aplicar'

function click(scope, id) { return scope.locator('#' + id).click() }

async function popProjector(page, scope, id) {
  const [projection] = await Promise.all([page.waitForEvent('popup'), click(scope, id)])
  return projection
}

async function visualPixel(projector, rgb, position = sample) {
  await projector.waitForFunction(({ rgb, position }) => {
    const video = document.querySelector('video')
    let actual
    if (video?.readyState >= 2) {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 40
      const context = canvas.getContext('2d')
      context.drawImage(video, 0, 0, 40, 40)
      actual = context.getImageData(
        Math.floor(position[0] * canvas.width), Math.floor(position[1] * canvas.height), 1, 1
      ).data
    } else {
      const canvas = document.querySelector('canvas')
      const gl = canvas?.getContext('webgl')
      if (!gl) return false
      actual = new Uint8Array(4)
      gl.readPixels(Math.floor(position[0] * canvas.width), Math.floor((1 - position[1]) * canvas.height),
        1, 1, gl.RGBA, gl.UNSIGNED_BYTE, actual)
    }
    return rgb.every((channel, i) => Math.abs(channel - actual[i]) < 12)
  }, { rgb, position }, { timeout: 10000 }).catch(error => {
    throw new Error('La proyección no mostró el RGB esperado: ' + rgb.join(', '), { cause: error })
  })
}

async function clean(projector, medium = 'video,canvas') {
  await projector.locator('#projectedCode').waitFor({ state: 'detached' })
  assert.equal(await projector.locator('body > *').count(), 1)
  assert.equal(await projector.locator(medium).count(), 1)
}

async function showsCode(projector, code) {
  const overlay = projector.locator('pre#projectedCode')
  await overlay.waitFor()
  await projector.waitForFunction(code => {
    return document.querySelector('pre#projectedCode')?.textContent.includes(code)
  }, code)
  assert.equal(await projector.locator('#probeMarkup').count(), 0)
  assert.equal(await overlay.isVisible(), true)
}

async function openOutputChoices(page) {
  const toggle = page.locator('#showProjectorCode')
  if (!(await toggle.isVisible())) await click(page, 'chooseOutput')
  await toggle.waitFor()
  return toggle
}

async function editCode(page, code, moveCaret = false) {
  await page.evaluate(({ code, moveCaret }) => {
    cm.setValue(code)
    if (moveCaret) cm.setCursor({ line: 1, ch: 3 })
  }, { code, moveCaret })
}

async function studioProjection(page) {
  await openStudio(page, 'base')
  await editCode(page, initialCode)
  let projector = await popProjector(page, page, 'project')
  await visualPixel(projector, red)
  await clean(projector)

  const toggle = await openOutputChoices(page)
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false')
  await toggle.click()
  await showsCode(projector, initialCode)

  if (await page.locator('#liveEdit').getAttribute('aria-pressed') === 'true') await click(page, 'liveEdit')
  await editCode(page, draftCode, true)
  await showsCode(projector, draftCode)
  await visualPixel(projector, red)

  await openStudio(page, 'sectors')
  await click(page, 'newSector')
  await page.locator('#sectorShapes').getByRole('button', { name: 'Rectángulo', exact: true }).click()
  const stage = await page.locator('#sectorGuide').boundingBox()
  await page.mouse.move(stage.x + stage.width * .1, stage.y + stage.height * .3)
  await page.mouse.down()
  await page.mouse.move(stage.x + stage.width * .3, stage.y + stage.height * .6, { steps: 5 })
  await page.mouse.up()
  await click(page, 'sectorCodeToggle')
  await page.locator('#sectorCode').fill(layerDraft)
  await showsCode(projector, layerDraft)
  await visualPixel(projector, red)

  await openStudio(page, 'base')
  await page.evaluate(() => cm.focus())
  await showsCode(projector, draftCode)
  await projector.close()
  projector = await popProjector(page, page, 'project')
  await showsCode(projector, draftCode)
  await openOutputChoices(page)
  await click(page, 'outputSettings')
  const settings = page.locator('#showCodeSettings')
  assert.equal(await settings.getAttribute('aria-pressed'), 'true')
  await settings.click()
  await clean(projector)
  await projector.close()
  await settings.click()
  await click(page, 'fullPanel')
  await page.waitForFunction(() => document.fullscreenElement?.id === 'stage')
  await showsCode(page, draftCode)
  assert.equal(await page.locator('#stage #sectorGuide').isVisible(), false)
  await page.evaluate(() => document.exitFullscreen())
  await page.locator('#stage #projectedCode').waitFor({ state: 'detached' })
  await settings.click()
  console.log('Estudio: proyección limpia, código literal de sketch/capa, edición manual, ajustes sincronizados, reapertura y pantalla completa.')
}

async function mappingProjection(page) {
  await click(page, 'openMapping')
  const map = page.frameLocator('#mappingFrame')
  await map.locator('[data-hydra="full"]').click()
  const toggle = map.locator('#mapShowCode')
  let projector = await popProjector(page, map, 'mapOutput')
  await visualPixel(projector, red)
  await clean(projector, 'canvas')
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false')

  await toggle.click()
  await showsCode(projector, draftCode)
  await click(page, 'mappingSectors')
  await openStudio(page, 'base')
  await editCode(page, mapDraft, true)
  await showsCode(projector, mapDraft)
  await visualPixel(projector, red)
  await click(page, 'mappingSurface')

  await click(map, 'mapBlackout')
  await clean(projector, 'canvas')
  await visualPixel(projector, [0, 0, 0])
  await click(map, 'mapBlackout')
  await showsCode(projector, mapDraft)

  await click(map, 'mapCalibrate')
  await map.locator('#mapCalibrateBar').waitFor()
  await clean(projector, 'canvas')
  await visualPixel(projector, [16, 18, 17])
  await click(map, 'mapCancel')
  await showsCode(projector, mapDraft)
  await visualPixel(projector, red)

  await projector.close()
  projector = await popProjector(page, map, 'mapOutput')
  await showsCode(projector, mapDraft)
  await toggle.click()
  await clean(projector, 'canvas')
  await toggle.click()
  await showsCode(projector, mapDraft)
  await projector.close()
  await click(page, 'exitMapping')
  assert.equal(await (await openOutputChoices(page)).getAttribute('aria-pressed'), 'true')
  projector = await popProjector(page, page, 'project')
  await showsCode(projector, mapDraft)
  await (await openOutputChoices(page)).click()
  await clean(projector)
  await projector.close()
  console.log('Mapeo: espejo de código compartido, reapertura, ocultamiento durante apagón/calibración y vuelta al Estudio.')
}

async function main() {
  const browser = await chromium.launch({
    channel: 'chromium', args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader']
  })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
    const errors = []
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)))
    const page = await context.newPage()
    page.setDefaultTimeout(9000)
    await page.goto(url)
    await page.waitForFunction(() => !!window.cm?.getValue().trim() && window.hydraSynth?.canvas.width > 100)
    await studioProjection(page)
    await mappingProjection(page)
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
