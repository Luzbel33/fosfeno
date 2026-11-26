const assert = require('node:assert/strict')
const path = require('node:path')
const { chromium } = require('playwright')
const { openStudio } = require('./studio-nav.cjs')

const url = process.argv[2] || 'http://127.0.0.1:8736/'
const blue = 'solid(0,0,1).out(o0)'
const red = 'solid(1,0,0).out(o1)\nsrc(o1).out(o0)'
const fixture = 'Azul de prueba'

async function pixel(page, x, y, expected) {
  await page.waitForFunction(({ x, y, expected }) => {
    const { canvas, regl } = hydraSynth
    hydraSynth.tick(34)
    const value = regl.read({
      x: Math.floor(canvas.width * x), y: Math.floor(canvas.height * (1 - y)),
      width: 1, height: 1
    })
    return value[3] === 255 && expected.every((channel, i) => Math.abs(channel - value[i]) < 5)
  }, { x, y, expected }, { timeout: 8000 }).catch(error => {
    throw new Error('Píxel (' + x + ', ' + y + ') esperado RGB ' + expected.join(', '), {cause:error})
  })
}

async function drawGreenSector(page) {
  await openStudio(page, 'sectors')
  await page.locator('#newSector').click()
  await page.locator('#sectorShapes').getByRole('button', {name:'Rectángulo', exact:true}).click()
  const box = await page.locator('#sectorGuide').boundingBox()
  await page.mouse.move(box.x + box.width * .25, box.y + box.height * .25)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * .7, box.y + box.height * .7, {steps:5})
  await page.mouse.up()
  await page.locator('#sectorCodeToggle').click()
  await page.locator('#sectorCode').fill('return solid(0,1,0)')
  await page.locator('#sectorApplyCode').click()
  await pixel(page, .5, .5, [0,255,0])
  await page.locator('#layerOverview').getByRole('button', {name:'Toda la visual', exact:true}).click()
}

async function checkProjector(popup, expected) {
  await popup.waitForFunction(expected => {
    const video = document.querySelector('video')
    if (!video || video.readyState < 2) return false
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 24
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video,0,0,24,24)
    const actual = ctx.getImageData(12,12,1,1).data
    return expected.every((channel,i) => Math.abs(channel-actual[i]) < 14)
  },expected,{timeout:9000})
}

async function waitForGeneratedVisual(page) {
  await page.waitForFunction(() => {
    hydraSynth.tick(34)
    const {regl,canvas} = hydraSynth
    return [.2,.45,.7].some(n => {
      const [red,green] = regl.read({x:Math.floor(canvas.width*n),y:Math.floor(canvas.height*n),width:1,height:1})
      return red + green > 15
    })
  })
}

async function main() {
  const browser = await chromium.launch({channel:'chromium', args:['--use-angle=d3d11','--enable-unsafe-swiftshader']})
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}})
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const id = name => page.locator('#' + name)
    const click = name => id(name).click()
    const composition = () => openStudio(page, 'sectors')
    const library = () => openStudio(page, 'library')
    const addBlue = () => id('mine').locator('.library-row').filter({hasText:fixture}).locator('button[aria-pressed]').click()
    const atEdge = expected => pixel(page, .1, .1, expected)
    const green = () => pixel(page, .5, .5, [0,255,0])

    await page.goto(url)
    await page.waitForFunction(() => window.cm?.getValue().startsWith('// Semilla') && hydraSynth?.canvas.width > 100)
    await composition()
    const original = await page.evaluate(() => cm.getValue())
    await click('removeBase')
    await atEdge([0,0,0])
    await id('toast').getByRole('button',{name:'Deshacer'}).click()
    assert.equal(await page.evaluate(() => cm.getValue()),original)
    await waitForGeneratedVisual(page)
    await click('removeBase')
    await atEdge([0,0,0])
    await page.reload()
    await page.waitForFunction(() => window.cm && window.hydraSynth)
    await atEdge([0,0,0])
    await id('baseLibrary').waitFor()
    await click('baseLibrary')
    await id('seed').fill('4107')
    await click('mixSeed')
    assert.equal(await id('mixSeed').getAttribute('aria-pressed'),'true')
    await waitForGeneratedVisual(page)
    assert.equal(await id('baseCard').getAttribute('data-mode'),'empty')
    await click('mixSeed')
    assert.equal(await id('mixSeed').getAttribute('aria-pressed'),'false')
    await atEdge([0,0,0])
    await click('grow')
    await composition()
    assert.match(await id('baseTitle').innerText(), /4107/)
    await library()
    await id('grow').getByText('Quitar fondo').click()
    await atEdge([0,0,0])
    await openStudio(page, 'code')
    await page.evaluate(text => cm.setValue(text), blue)
    await atEdge([0,0,255])
    await id('scoreName').fill(fixture)
    await click('save')

    await click('liveEdit')
    await library()
    await id('seed').fill('4107')
    await click('grow')
    await id('applySectors').waitFor()
    assert.equal(await id('libraryPage').isVisible(),true)
    await atEdge([0,0,255])
    await click('applySectors')
    await waitForGeneratedVisual(page)
    const useBlue = () => id('mine').locator('.library-row').filter({hasText:fixture}).locator('.library-item').click()
    await useBlue()
    await id('applySectors').waitFor()
    assert.equal(await id('libraryPage').isVisible(),true)
    await waitForGeneratedVisual(page)
    await click('applySectors')
    await atEdge([0,0,255])
    const plates = id('sketchList').locator('.library-row').filter({hasText:'Placas de Chladni'})
    await plates.locator('.library-item').click()
    await id('applySectors').waitFor()
    await atEdge([0,0,255])
    await click('liveEdit')
    await waitForGeneratedVisual(page)
    await plates.getByRole('button',{name:'Quitar fondo · Placas de Chladni'}).click()
    await atEdge([0,0,0])
    await openStudio(page,'code')
    await page.evaluate(text => cm.setValue(text), red)
    await atEdge([255,0,0])
    await library()
    await addBlue()
    await atEdge([128,0,128])
    await drawGreenSector(page)
    await click('baseVisibility')
    await atEdge([0,0,128])
    await green()
    assert.equal(await page.evaluate(() => cm.getValue()), red)
    await click('baseVisibility')
    await atEdge([128,0,128])
    await green()
    await click('liveEdit')
    await click('removeBase')
    await id('applySectors').waitFor()
    await atEdge([128,0,128])
    await click('applySectors')
    await atEdge([0,0,128])
    await green()
    await click('liveEdit')
    await library()
    await addBlue()
    await atEdge([0,0,0])
    await addBlue()
    await atEdge([0,0,128])
    await green()
    console.log('Base inicial y semilla removibles. Mezcla, visibilidad, edición manual y sector verificadas por píxeles.')

    const loopName = 'fosfeno-demo.mp4'
    await click('openLoops')
    await id('loopFile').setInputFiles(path.join(__dirname,'../media',loopName))
    const loop = id('loopList').getByRole('button', {name:'Usar ' + loopName, exact:true})
    await loop.waitFor({state:'attached'})
    await composition()
    await click('newComposition')
    await id('newCompositionDialog').waitFor()
    await click('cancelNewComposition')
    await atEdge([0,0,128])
    await green()
    const [popup] = await Promise.all([page.waitForEvent('popup'), click('project')])
    await checkProjector(popup, [0,255,0])
    assert.deepEqual(await popup.locator('body > *').evaluateAll(nodes => nodes.map(node => node.tagName)),['VIDEO'])
    await click('newComposition')
    await click('confirmNewComposition')
    await atEdge([0,0,0])
    await pixel(page, .5, .5, [0,0,0])
    await checkProjector(popup, [0,0,0])
    await popup.close()
    assert.equal(await id('layerOverview').locator('[data-sector-id]:not([data-sector-id="0"])').count(), 0)
    assert.equal(await id('layerOverview').getByText(fixture, {exact:true}).isVisible(), false)
    await library()
    await loop.waitFor({state:'attached'})
    assert.equal(await id('mine').locator('.library-row').filter({hasText:fixture}).count(), 1)
    await addBlue()
    await atEdge([0,0,128])
    await addBlue()
    await atEdge([0,0,0])
    await useBlue()
    await atEdge([0,0,255])
    await openStudio(page, 'signal')
    if (await id('autoMixInput').getAttribute('aria-pressed') !== 'true') await click('autoMixInput')
    await id('visualFile').setInputFiles({
      name:'verde.svg', mimeType:'image/svg+xml',
      buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="lime"/></svg>')
    })
    await page.waitForFunction(() => document.getElementById('visualName').textContent.includes('verde.svg'))
    await composition()
    await click('removeBase')
    await atEdge([0,255,0])
    await openStudio(page, 'signal')
    await click('clearVisual')
    await atEdge([0,0,0])
    assert.deepEqual(errors, [])
    console.log('Reinicio cancelado y confirmado. Sketch y loop conservados. Entrada de imagen visible al quitar el fondo y desconectable.')
  } finally {
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
