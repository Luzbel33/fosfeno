const { openStudio } = require('./studio-nav.cjs')
// Start Fosfeno on loopback first. Pass --physical to also use a real camera.
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

const physical = process.argv.includes('--physical')
const url = new URL(process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'http://127.0.0.1:8736/')
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Use a loopback Fosfeno URL')

async function checkNativeReplacements(page) {
  for (const kind of ['canvas', 'img', 'video']) {
    await page.evaluate(async (kind) => {
      await s0.initCam(0)
      window.replacedCamera = s0.src.srcObject.getVideoTracks()[0]
      const canvas = document.createElement('canvas')
      if (kind === 'canvas') s0.init({ src: canvas })
      if (kind === 'img') s0.initImage(canvas.toDataURL())
      if (kind === 'video') s0.initVideo('media/fosfeno-demo.mp4')
    }, kind)
    await page.waitForFunction((kind) => replacedCamera.readyState === 'ended'
      && s0.src?.localName === kind && !document.querySelector('#sourcePreview video'), kind)
  }
}

async function checkCamera(real) {
  const args = ['--use-angle=d3d11', '--enable-unsafe-swiftshader']
  if (!real) args.push('--use-fake-device-for-media-stream=device-count=2')
  const browser = await chromium.launch({ channel: 'chromium', args })
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 960, height: 640 } })
    await context.route('**/*', (route) => new URL(route.request().url()).origin === url.origin
      ? route.continue() : route.abort())
    await context.routeWebSocket('**/*', (socket) => socket.close())
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.addInitScript(() => {
      window.cameraRequests = []
      const devices = navigator.mediaDevices
      const acquire = devices.getUserMedia.bind(devices)
      devices.getUserMedia = (constraints) => {
        cameraRequests.push({ audio: !!constraints.audio, exact: !!constraints.video?.deviceId?.exact })
        return acquire(constraints)
      }
    })
    await page.goto(url.href)
    await page.waitForFunction(() => window.cm && window.hydraSynth && window.a)
    await page.evaluate(() => cm.setValue('solid(1,0,0).out(o0)'))
    await page.waitForFunction(() => document.querySelector('#codeStatus').textContent.includes('Sketch ejecutado'))
    await openStudio(page,'signal')
    assert.deepEqual(await page.evaluate(() => cameraRequests), [])
    if (!real) {
      await page.locator('[data-tab="audio"]').click()
      const toggle = page.locator('#internalPulse')
      assert.equal(await toggle.getAttribute('aria-pressed'), 'false')
      assert.ok(await page.evaluate(() => a.fft.length && a.fft.every((v) => v === 0)))
      await toggle.click()
      await page.waitForFunction(() => a.fft.some((v) => v > 0))
      await toggle.click()
      await page.waitForFunction(() => a.fft.every((v) => v === 0))
      assert.deepEqual(await page.evaluate(() => cameraRequests), [])
      await page.locator('[data-tab="input"]').click()
      await context.grantPermissions([], { origin: url.origin })
      await page.locator('#camera').click()
      await page.waitForFunction(() => /permiso.*denegado/i.test(document.querySelector('#cameraStatus').textContent))
      assert.equal(await page.locator('#sourcePreview video').count(), 0)
    }
    await context.grantPermissions(['camera'], { origin: url.origin })
    // Refresh enumeration through the same tab action used by an operator.
    await page.locator('[data-tab="input"]').click()
    const choices = page.locator('#cameras button')
    await choices.first().waitFor({ timeout: 10000 })
    const available = await choices.count()
    if (!real) {
      assert.equal(available, 2)
      await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const stream = canvas.captureStream(15)
        window.priorScreen = stream.getVideoTracks()[0]
        window.drawScreen = setInterval(() => ctx.fillRect(0, 0, 30, 30), 60)
        navigator.mediaDevices.getDisplayMedia = async (constraints) => {
          window.screenRequestedAudio = !!constraints?.audio
          return stream
        }
        s0.initScreen(0, { flipY: true })
      })
      await page.waitForFunction(() => s0.src?.videoWidth && s0.src.srcObject.getVideoTracks()[0] === priorScreen)
      assert.equal(await page.evaluate(() => screenRequestedAudio), false)
    }
    await choices.first().click()
    const active = page.locator('#cameras button[aria-pressed="true"]')
    try { await active.waitFor() } catch (err) {
      throw new Error('La cámara no abrió: ' + await page.locator('#cameraStatus').textContent(), { cause:err })
    }
    const chosen = await active.textContent()
    await page.waitForFunction(() => s0.src?.videoWidth && s0.src === document.querySelector('#sourcePreview video'))
    await page.waitForFunction(() => cm.getValue().includes('.blend(src(s0)') &&
      document.querySelector('#codeStatus').textContent.includes('Sketch ejecutado'))
    // Compare both buffers from the same frame without keeping any camera pixels.
    const matches = await page.evaluate(() => {
      src(s0).out(o3)
      hydraSynth.tick(40)
      const pixel = (output) => hydraSynth.regl.read({framebuffer:output.getCurrent(),
        x:Math.floor(width/2),y:Math.floor(height/2),width:1,height:1})
      const a = pixel(o0), b = pixel(o3)
      return [0,1,2].every(i => Math.abs(a[i] - (.65*b[i] + (i === 0 ? .35*255 : 0))) <= 2)
    })
    assert.ok(matches, 'The panel connection must appear in the projected mix without pressing Run')
    await page.evaluate(() => {
      window.firstTrack = s0.src.srcObject.getVideoTracks()[0]
      window.firstDevice = firstTrack.getSettings().deviceId
      window.firstFrameTime = s0.src.currentTime
    })
    await page.waitForFunction(() => s0.src.currentTime > firstFrameTime)
    if (!real) {
      assert.equal(await page.evaluate(() => {
        clearInterval(drawScreen)
        return priorScreen.readyState
      }), 'ended', 'Switching from sketch screen capture to camera must release the screen')
      await choices.nth(1).click()
      await page.waitForFunction(() => firstTrack.readyState === 'ended' && s0.src.srcObject.getVideoTracks()[0].getSettings().deviceId !== firstDevice)
    }
    await openStudio(page,'code')
    await page.evaluate(() => {
      window.inputVerificationFrames = 0
      cm.setValue('setResolution(96,64)\nsrc(s0).out(o0)\nrender(o0)\nafterUpdate = () => window.inputVerificationFrames++')
      cm.focus()
    })
    await page.keyboard.press('Control+Shift+Enter')
    await page.waitForFunction(() => hydraSynth.canvas.width === 96 && inputVerificationFrames >= 2)
    const reading = await page.evaluate(() => {
      const video = s0.src
      window.lastTrack = video.srcObject.getVideoTracks()[0]
      const rendered = hydraSynth.regl.read({ framebuffer: o0.getCurrent() })
      return {
        dimensions: [video.videoWidth, video.videoHeight],
        texture: [s0.tex.width, s0.tex.height],
        activeVideo: lastTrack.readyState === 'live',
        audioTracks: video.srcObject.getAudioTracks().length,
        nonblack: rendered.some((v, i) => i % 4 !== 3 && v > 0)
      }
    })
    assert.deepEqual(reading.dimensions, reading.texture)
    assert.ok(reading.activeVideo)
    assert.equal(reading.audioTracks, 0)
    if (!real) assert.ok(reading.nonblack)
    await openStudio(page,'signal')
    await page.locator('#clearVisual').click()
    await page.waitForFunction(() => lastTrack.readyState === 'ended' && !s0.src)
    assert.equal(await page.locator('#sourcePreview video').count(), 0)
    if (!real) await checkNativeReplacements(page)
    const requests = await page.evaluate(() => cameraRequests)
    assert.ok(requests.every((req) => !req.audio) && requests.some((req) => req.exact))
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ mode: real ? 'physical' : 'simulated', browser: browser.version(), available,
      chosen, ...reading, released: true, cameraRequests: requests.length }))
  } finally {
    await browser.close()
  }
}

;(async () => {
  await checkCamera(false)
  if (physical) await checkCamera(true)
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
