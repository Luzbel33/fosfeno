const { openStudio } = require('./studio-nav.cjs')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const { visit } = require('./compare-hydra.cjs')

const local = process.argv[2] || 'http://127.0.0.1:8736/'
const official = 'https://hydra.ojack.xyz/'
const scores = [
  "// sesión · 💚\nwindow.runPath.push('verde')\nsolid(0,1,0).out()",
  "window.runPath.push('rojo')\nsolid(1,0,0).out()"
]

async function edit(page, code, line = 0) {
  await page.evaluate(({ code, line }) => {
    cm.setValue(code)
    cm.setCursor(line, 0)
    cm.focus()
  }, { code, line })
}

async function checkPixel(page, rgb) {
  await page.waitForFunction((rgb) => {
    hydraSynth.tick(1000 / 60)
    return hydraSynth.regl.read({ x: 0, y: 0, width: 1, height: 1 }).slice(0, 3)
      .every((channel, i) => channel === rgb[i])
  }, rgb)
}

async function compare(page) {
  const initial = page.url()
  if (await page.locator('#studioNav').count() && !await page.locator('#run').isVisible()) await openStudio(page,'code')
  const length = await page.evaluate(() => {
    window.runPath = []
    window.seenMark = false
    const editor = cm.getWrapperElement()
    new MutationObserver(() => {
      if (editor.querySelector('.styled-background, .executed-code')) window.seenMark = true
    }).observe(editor, { childList: true, subtree: true })
    return history.length
  })
  await edit(page, scores[0], 1)
  await page.keyboard.press('Control+Enter')
  await page.waitForFunction(() => runPath.length === 1 && seenMark)
  await page.keyboard.press('Alt+Enter')
  await page.waitForFunction(() => runPath.length === 2)
  assert.equal(page.url(), initial)
  assert.equal(await page.evaluate(() => history.length), length)

  const urls = []
  for (const [i, code] of scores.entries()) {
    await edit(page, code)
    await page.keyboard.press('Control+Shift+Enter')
    await page.waitForFunction((code) => {
      const data = new URL(location.href).searchParams.get('code')
      return data && decodeURIComponent(atob(data)) === code
    }, code)
    const url = new URL(page.url())
    assert.equal(url.searchParams.get('view'), 'test')
    assert.equal(url.searchParams.has('sketch_id'), false)
    assert.equal(await page.evaluate(() => history.length), length + i + 1)
    urls.push(url.search)
    await checkPixel(page, i ? [255, 0, 0] : [0, 255, 0])
  }
  await page.goBack()
  await page.waitForFunction((code) => cm.getValue() === code, scores[0])
  await checkPixel(page, [0, 255, 0])
  await page.goForward()
  await page.waitForFunction((code) => cm.getValue() === code, scores[1])
  await checkPixel(page, [255, 0, 0])
  assert.deepEqual(await page.evaluate(() => runPath), ['verde', 'verde', 'verde', 'rojo', 'verde', 'rojo'])
  assert.equal(await page.evaluate(() => history.length), length + 2)
  await page.goBack()
  await page.goBack()
  await page.waitForFunction(() => cm.getValue().includes('MULTIVERSE'))
  return urls
}

async function checkLocalGuards(page) {
  await edit(page, 'const =')
  const before = page.url()
  await page.keyboard.press('Control+Shift+Enter')
  await page.locator('#codeStatus.error').waitFor()
  assert.equal(page.url(), before)
  const link = new URL(local)
  const code = "window.linkRuns = (window.linkRuns || 0) + 1; solid(0,0,1).out()"
  link.searchParams.set('code', Buffer.from(encodeURIComponent(code)).toString('base64'))
  await page.goto(link.href)
  await page.waitForFunction((code) => window.cm?.getValue() === code, code)
  assert.equal(await page.evaluate(() => window.linkRuns), undefined)
  if (!await page.locator('#run').isVisible()) await openStudio(page,'code')
  await page.locator('#run').click()
  await checkPixel(page, [0, 0, 255])
  assert.equal(await page.evaluate(() => window.linkRuns), 1)
  await page.reload()
  await page.waitForFunction((code) => window.cm?.getValue() === code, code)
  assert.equal(await page.evaluate(() => window.linkRuns), undefined)

  const draft = code + '\n// unsaved edit'
  await edit(page, draft)
  await page.reload()
  await page.waitForFunction((draft) => window.cm?.getValue() === draft, draft)
  assert.equal(await page.evaluate(() => window.linkRuns), undefined)
  const pasted = await page.context().newPage()
  await pasted.goto(link.href)
  await pasted.waitForFunction((code) => window.cm?.getValue() === code, code)
  assert.equal(await pasted.evaluate(() => window.linkRuns), undefined)
  await pasted.close()

  if (!await page.locator('#run').isVisible()) await openStudio(page,'code')
  await page.locator('#liveEdit').click()
  await page.locator('#run').click()
  const length = await page.evaluate(() => history.length)
  await edit(page, 'solid(1,0,1).out()')
  await checkPixel(page, [255, 0, 255])
  assert.equal(await page.evaluate(() => history.length), length)
}

async function main() {
  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream']
  })
  try {
    const pages = await Promise.all([official, local].map((url) => {
      const target = new URL(url)
      target.searchParams.set('sketch_id', 'eerie_ear_0')
      target.searchParams.set('view', 'test')
      return visit(browser, target.href)
    }))
    const [upstream, studio] = await Promise.all(pages.map(compare))
    assert.deepEqual(studio, upstream)
    await checkLocalGuards(pages[1])
    console.log('History, editor execution marks, URL encoding, back/forward pixels agree;', browser.version())
    console.log('Local checks passed: compilation error, pasted link, explicit run, draft recovery, live edits.')
  } finally {
    await browser.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
