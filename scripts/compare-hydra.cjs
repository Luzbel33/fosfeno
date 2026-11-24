const { openStudio } = require('./studio-nav.cjs')
// Run with a local Fosfeno server and Playwright/Chromium already installed.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { chromium } = require('playwright')

const official = 'https://hydra.ojack.xyz/?sketch_id=eerie_ear_0'
const target = new URL(process.argv[2] || 'http://127.0.0.1:8736/')
target.searchParams.set('sketch_id','eerie_ear_0')
const local = target.href
const initialHash = 'dc19d3a78597e4611844e73f6775700ee004031c504d8821a02871e46a43076d'

function cameraFixture(file) {
  const width = 96,
    height = 64
  const plane = Buffer.alloc(width * height)
  for (let i = 0; i < plane.length; i++) plane[i] = 32 + (i % width) * 2
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from('YUV4MPEG2 W96 H64 F30:1 Ip A1:1 C420jpeg\nFRAME\n'),
      plane,
      Buffer.alloc(plane.length / 4, 94),
      Buffer.alloc(plane.length / 4, 155)
    ])
  )
}

async function visit(browser, url) {
  const context = await browser.newContext({
    viewport: { width: 680, height: 510 },
    serviceWorkers: 'block',
    permissions: ['camera']
  })
  await context.routeWebSocket('**/*', (socket) => socket.close())
  await context.route('https://api.hydrasynth.xyz/socket.io/**', (route) => route.abort())
  await context.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (fn) =>
      raf((t) => {
        if (!window.freezeFrames) fn(t)
      })
  })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'load', timeout: 60000 })
  await page.waitForFunction(() => window.hydraSynth && window.cm?.getValue().includes('MULTIVERSE'))
  // Compare the same explicit line/block/all actions as the official manual editor.
  const live = page.locator('#liveEdit[aria-pressed=true]')
  if (await live.count()) {
    if (!await page.locator('#run').isVisible()) await openStudio(page,'code')
    await live.click()
  }
  await page.mouse.move(47, 28)
  return page
}

async function instrument(page) {
  await page.evaluate(() => {
    window.freezeFrames = true
    window.savedAudio = window.a
    window.testErrors = []
    navigator.mediaDevices.getDisplayMedia = async () => {
      const screen = document.createElement('canvas')
      screen.width = 96
      screen.height = 64
      const ctx = screen.getContext('2d')
      const stream = screen.captureStream(10)
      const draw = () => {
        ctx.fillStyle = '#1878da'
        ctx.fillRect(0, 0, 96, 64)
      }
      draw()
      const interval = setInterval(() => {
        if (stream.getVideoTracks()[0].readyState === 'ended') clearInterval(interval)
        else draw()
      }, 80)
      return stream
    }
    if (window._reportError) {
      const report = window._reportError
      window._reportError = (err) => {
        testErrors.push(String(err))
        report(err)
      }
    }
    for (const output of hydraSynth.o) {
      const render = output.render.bind(output)
      output.render = (...args) => {
        window.testDraws++
        return render(...args)
      }
    }
  })
}

async function runScore(page, { code, ready }) {
  await page.evaluate((code) => {
    const h = hydraSynth
    window.a = savedAudio
    hush()
    speed = 1
    bpm = 30
    fps = undefined
    h.setResolution(96, 64)
    h.regl.poll()
    h.sandbox.set('time', 3.75)
    h.synth.time = 3.75
    h.timeSinceLastUpdate = 0
    mouse.x = 47
    mouse.y = 28
    a.setBins(4)
    a.fft = [0.15, 0.27, 0.34, 0.22]
    let seed = 93
    Math.random = () => (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296
    for (const output of h.o) {
      output.pingPongIndex = 0
      for (const framebuffer of output.fbos) h.regl.clear({ framebuffer, color: [0, 0, 0, 0] })
    }
    window.testDraws = 0
    testErrors.length = 0
    cm.setValue(code)
    cm.focus()
  }, code)
  await page.keyboard.press('Control+Shift+Enter')
  await page.waitForFunction(
    () => testDraws || testErrors.length || document.querySelector('#codeStatus.error'),
    null,
    { polling: 40, timeout: 6000 }
  )
  if (ready) await page.waitForFunction(ready, null, { polling: 40, timeout: 10000 })
  return page.evaluate(async () => {
    const h = hydraSynth
    const frames = []
    let lit = false
    for (let frame = 1; frame <= 12; frame++) {
      h.tick(1000 / 60)
      if ([1, 6, 12].includes(frame)) {
        const composite = h.regl.read()
        if (composite.some((v, i) => i % 4 !== 3 && v > 0)) lit = true
        frames.push(composite, ...h.o.map((o) => h.regl.read({ framebuffer: o.getCurrent() })))
      }
    }
    const hashes = await Promise.all(
      frames.map(async (bytes) => {
        const digest = await crypto.subtle.digest('SHA-256', bytes)
        return Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, '0')).join('')
      })
    )
    return {
      hashes,
      lit,
      view: h.isRenderingAll ? 'all' : h.o.indexOf(h.output),
      camera: s0.src?.srcObject ? [s0.src.videoWidth, s0.src.videoHeight] : null,
      errors: testErrors.concat(
        Array.from(document.querySelectorAll('#codeStatus.error'), (n) => n.textContent)
      )
    }
  })
}

async function editorControls(page) {
  await page.evaluate(() => {
    window.typed = []
    cm.setValue('typed.push(1)\ntyped.push(2)\n\ntyped.push(3)')
    cm.setCursor({ line: 1, ch: 1 })
    cm.focus()
  })
  await page.waitForTimeout(500)
  assert.deepEqual(await page.evaluate(() => typed), [])
  for (const [key, expected] of [
    ['Control+Enter', [2]],
    ['Alt+Enter', [2, 1, 2]],
    ['Control+Shift+Enter', [2, 1, 2, 1, 2, 3]]
  ]) {
    await page.keyboard.press(key)
    assert.deepEqual(await page.evaluate(() => typed), expected)
  }
  await page.keyboard.press('Control+/')
  assert.match(await page.evaluate(() => cm.getLine(1)), /^\s*\/\//)
  await page.keyboard.press('Control+/')
  assert.equal(await page.evaluate(() => cm.getLine(1)), 'typed.push(2)')
  await page.evaluate(() => cm.setValue('osc().rotate().out()'))
  await page.keyboard.press('Control+Shift+F')
  return page.evaluate(() => cm.getValue())
}

async function audioControls(page) {
  return page.evaluate(() => {
    const audio = window.a
    const previous = audio.meyda
    const loudness = { total: 70, specific: Array.from({ length: 24 }, (_, i) => i / 3) }
    audio.meyda = { get: () => ({ loudness }) }
    let beats = 0
    audio.onBeat = () => beats++
    audio.setBins(8)
    audio.setCutoff(1.5)
    audio.setSmooth(0.25)
    audio.setScale(7)
    audio.settings[2].scale = 3
    audio.show()
    const showing = getComputedStyle(audio.canvas).display !== 'none'
    audio.tick()
    audio.tick()
    audio.hide()
    const result = {
      showing,
      hidden: getComputedStyle(audio.canvas).display === 'none',
      beats,
      bins: audio.bins.slice(),
      fft: audio.fft.slice(),
      value: a2(3, 0.1)(),
      volume: audio.vol
    }
    audio.meyda = previous
    audio.setBins(4)
    return result
  })
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fosfeno-parity-'))
  const camera = path.join(dir, 'camera.y4m')
  cameraFixture(camera)
  let browser
  try {
    browser = await chromium.launch({
      channel: 'chromium',
      args: [
        '--use-angle=d3d11',
        '--enable-unsafe-swiftshader',
        '--use-fake-device-for-media-stream',
        '--use-file-for-fake-video-capture=' + camera
      ]
    })
    const pages = await Promise.all([official, local].map((url) => visit(browser, url)))
    const [upstream, studio] = await Promise.all(
      pages.map((page) =>
        page.evaluate(() => ({
          code: cm.getValue(),
          bpm,
          precision: hydraSynth.precision,
          transforms: Object.values(hydraSynth.generator.glslTransforms),
          bands: a.fft.length,
          synthGlobals: Object.keys(hydraSynth.synth).sort()
        }))
      )
    )
    assert.deepEqual(studio, upstream)
    assert.equal(crypto.createHash('sha256').update(studio.code).digest('hex'), initialHash)
    console.log(
      'Chromium',
      browser.version(),
      '| initial document,',
      studio.transforms.length,
      'transforms and defaults agree'
    )
    const formats = await Promise.all(pages.map(editorControls))
    assert.equal(formats[0], formats[1])
    console.log('Manual editing, line, block, whole document, comment and format agree')
    await Promise.all(pages.map(instrument))
    const audio = await Promise.all(pages.map(audioControls))
    assert.deepEqual(audio[0], audio[1])
    assert.ok(audio[0].beats === 1 && audio[0].showing && audio[0].hidden && audio[0].value > 0.1)
    console.log('Audio bin settings, smoothing, scale, cutoff, beat callback, helper and display agree')
    const scores = await pages[1].evaluate(() => HYDRA_GALLERY.map(({ id, code }) => ({ id, code })))
    scores.find((score) => score.id === 'flor_1').ready = () => s0.src?.videoWidth > 0
    const video = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'smptebars=size=96x64:rate=10',
      '-t',
      '1',
      '-c:v',
      'libvpx',
      '-f',
      'webm',
      'pipe:1'
    ]).toString('base64')
    const cases = [
      { id: 'osc-rotate-pixelate', code: 'osc(20, 0.1, 0.8).rotate(0.8).pixelate(20, 30).out()' },
      {
        id: 'four outputs',
        code: 'osc().out(o0);noise().out(o1);shape(3).out(o2);voronoi().out(o3);render()'
      },
      {
        id: 'shader, arrays and callbacks',
        code: "setFunction({name:'qaFlip',type:'coord',inputs:[],glsl:'return vec2(1.-_st.x,_st.y);'}); osc([3,9].fast(2).smooth(),()=>mouse.x/100,1).qaFlip().out()"
      },
      { id: 'audio callback helpers', code: 'a.setBins(8);a.fft[5]=0.63;solid(a5(0.5,0.1),0,0).out()' },
      {
        id: 'P5 source',
        code: 'qaP=new P5({width:32,height:24});qaP.hide();qaP.background(19,177,82);qaP.noStroke();qaP.fill(222,71,14);qaP.rect(8,4,10,14);s3.init({src:qaP.canvas});src(s3).repeat().out()'
      },
      {
        id: 'image source',
        code: "qaCanvas=document.createElement('canvas');qaCanvas.width=qaCanvas.height=8;qaCtx=qaCanvas.getContext('2d');qaCtx.fillStyle='#207bdd';qaCtx.fillRect(0,0,8,8);s1.initImage(qaCanvas.toDataURL());src(s1).out()",
        ready: () => s1.src?.naturalWidth === 8
      },
      {
        id: 'video source',
        code: "s2.initVideo('data:video/webm;base64," + video + "');src(s2).out()",
        ready: () => s2.src?.videoWidth === 96
      },
      {
        id: 'camera with texture parameters',
        code: 's0.initCam(0,{flipY:true});src(s0).kaleid(4).out()',
        ready: () => s0.src?.videoWidth > 0
      },
      {
        id: 'simulated screen',
        code: 's2.initScreen();src(s2).out()',
        ready: () => s2.src?.srcObject?.active && s2.src.videoWidth > 0
      },
      {
        id: 'sketch resolution and time controls',
        code: 'setResolution(80,48); speed=.7; bpm=93; fps=30; qaSteps=0; update=()=>qaSteps++; afterUpdate=()=>qaSteps++; osc([3,11].fast(2),.11,()=>qaSteps/17).out()'
      },
      {
        id: 'await loadScript',
        code: "await loadScript('data:text/javascript,window.qaTint%3D0.675');solid(.1,qaTint,.3).out()"
      }
    ]
    const operators = upstream.transforms.map(({ name, type }) => {
      let code
      if (name === 'src') code = 'osc(5).out(o1);src(o1).out()'
      else if (name === 'prev') code = 'prev().add(osc(5),0.2).out()'
      else if (type === 'src') code = name + '().out()'
      else {
        const other = type.startsWith('combine') ? 'gradient().rotate(0.2)' : ''
        code = 'osc(6,0.1,1.2).' + name + '(' + other + ').out()'
      }
      return { id: 'operator ' + name, code }
    })
    let passed = 0,
      lit = 0
    const comparisons = [...scores, ...cases, ...operators]
    for (const test of comparisons) {
      try {
        const [ref, actual] = await Promise.all(pages.map((page) => runScore(page, test)))
        assert.deepEqual(ref.errors, [])
        assert.deepEqual(actual, ref)
        if (cases.includes(test)) assert.ok(actual.lit, 'empty composite')
        if (actual.lit) lit++
        passed++
      } catch (err) {
        console.error(test.id, err.message.slice(0, 1100))
        process.exitCode = 1
      }
    }
    console.log(
      passed,
      '/',
      comparisons.length,
      'pixel comparisons passed;',
      lit,
      'nonblack composites'
    )
  } finally {
    await browser?.close()
    fs.unlinkSync(camera)
    fs.rmdirSync(dir)
  }
}
module.exports = { visit }
if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
