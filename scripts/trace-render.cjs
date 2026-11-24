// Compare actual shader programs, active uniforms and framebuffer routing at draw time.
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { chromium } = require('playwright')
const { visit } = require('./compare-hydra.cjs')

const cases = [
  {
    name: 'fixed oscillator',
    code: 'osc(7,0,0.4).kaleid(3).out(o0)\nrender(o0)',
    outputs: [0],
    composite: 'one'
  },
  {
    name: 'uniform and feedback',
    code: [
      'osc(() => window.traceFrequency,0,0.4).kaleid(3).out(o0)',
      'src(o0).blend(src(o1).scale(1.01),0.45).out(o1)',
      'render()'
    ].join('\n'),
    outputs: [0, 1],
    composite: 'all'
  }
]

// This function runs inside each disposable browser context.
function installProbe() {
  window.freezeFrames = true
  const h = window.hydraSynth
  const gl = h.regl._gl
  hush()
  h.setResolution(96, 64)
  h.regl.poll()
  window.speed = 0
  window.fps = undefined
  h.sandbox.set('time', 2)
  const trace = window.renderTrace = { programs: [], passes: [], frames: [], events: [], draws: [] }
  const fbos = new Map([[null, 'canvas']])
  const textures = new Map()
  const programs = new Map()

  for (const [i, output] of h.o.entries()) {
    output.pingPongIndex = 0
    for (const [j, framebuffer] of output.fbos.entries()) {
      h.regl.clear({ framebuffer, color: [0, 0, 0, 0] })
      framebuffer.use(() => {
        const label = 'o' + i + '/' + j
        fbos.set(gl.getParameter(gl.FRAMEBUFFER_BINDING), label)
        const color = gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
          gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME)
        textures.set(color, label)
      })
    }
    const render = output.render
    output.render = function (passes) {
      trace.passes.push(...passes.map(pass => ({
        output: i, frag: pass.frag, vert: output.vert, uniforms: Object.keys(pass.uniforms).sort()
      })))
      return render.apply(this, arguments)
    }
  }
  for (const [label, obj, method] of [
    ...h.s.map((s, i) => ['s' + i, s, 'tick']),
    ...h.o.map((o, i) => ['o' + i, o, 'tick']),
    ['one', h, 'renderFbo'], ['all', h, 'renderAll']
  ]) {
    const original = obj[method]
    obj[method] = function () {
      trace.events.push(label)
      return original.apply(this, arguments)
    }
  }

  function describeProgram(program) {
    if (programs.has(program)) return programs.get(program)
    const description = {}
    for (const shader of gl.getAttachedShaders(program)) {
      const key = gl.getShaderParameter(shader, gl.SHADER_TYPE) === gl.VERTEX_SHADER ? 'vert' : 'frag'
      description[key] = gl.getShaderSource(shader)
    }
    const uniforms = []
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const { name, type } = gl.getActiveUniform(program, i)
      uniforms.push({ name, type, location: gl.getUniformLocation(program, name) })
    }
    const index = trace.programs.push(description) - 1
    const info = { index, uniforms }
    programs.set(program, info)
    return info
  }
  const draw = gl.drawArrays
  gl.drawArrays = function (mode, first, count) {
    const program = gl.getParameter(gl.CURRENT_PROGRAM)
    const { index, uniforms } = describeProgram(program)
    const values = {}
    const unit = gl.getParameter(gl.ACTIVE_TEXTURE)
    for (const { name, type, location } of uniforms) {
      const value = gl.getUniform(program, location)
      if (type === gl.SAMPLER_2D) {
        gl.activeTexture(gl.TEXTURE0 + value)
        values[name] = textures.get(gl.getParameter(gl.TEXTURE_BINDING_2D)) || 'external'
      } else values[name] = ArrayBuffer.isView(value) ? Array.from(value) : value
    }
    gl.activeTexture(unit)
    trace.draws.push({
      framebuffer: fbos.get(gl.getParameter(gl.FRAMEBUFFER_BINDING)), program: index,
      mode, first, count, values
    })
    return draw.apply(this, arguments)
  }
}

async function run(browser, url, test) {
  const page = await visit(browser, url)
  try {
    await page.evaluate(installProbe)
    await page.evaluate(code => {
      window.traceFrequency = 4
      cm.setValue(code)
      cm.focus()
    }, test.code)
    await page.keyboard.press('Control+Shift+Enter')
    await page.waitForFunction(count => renderTrace.passes.length >= count, test.outputs.length,
      { polling: 40, timeout: 8000 })
    const trace = await page.evaluate(async () => {
      for (const value of [4, 7, 7, 11]) {
        window.traceFrequency = value
        renderTrace.events = []
        renderTrace.draws = []
        hydraSynth.tick(1000 / 60)
        const rgba = hydraSynth.regl.read()
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', rgba))
        renderTrace.frames.push({ events: renderTrace.events, draws: renderTrace.draws,
          hash: Array.from(hash, v => v.toString(16).padStart(2, '0')).join('') })
      }
      return { programs: renderTrace.programs, passes: renderTrace.passes, frames: renderTrace.frames }
    })
    // Keep mismatch diagnostics compact while comparing every byte of the two shader stages.
    for (const shader of [...trace.programs, ...trace.passes]) {
      for (const stage of ['vert', 'frag']) {
        shader[stage] = createHash('sha256').update(shader[stage]).digest('hex')
      }
    }
    return trace
  } finally {
    await page.context().close()
  }
}

function verify(trace, test) {
  assert.deepEqual(trace.passes.map(pass => pass.output), test.outputs)
  for (const [i, frame] of trace.frames.entries()) {
    assert.deepEqual(frame.events, ['s0', 's1', 's2', 's3', 'o0', 'o1', 'o2', 'o3', test.composite])
    const slot = (i + 1) % 2
    assert.deepEqual(frame.draws.map(draw => draw.framebuffer),
      ['o0/' + slot, 'o1/' + slot, 'o2/' + slot, 'o3/' + slot, 'canvas'])
    for (const draw of frame.draws) {
      assert.deepEqual([draw.mode, draw.first, draw.count], [4, 0, 3]) // GL_TRIANGLES
    }
    for (const pass of trace.passes) {
      const linked = trace.programs[frame.draws[pass.output].program]
      assert.equal(linked.frag, pass.frag)
      assert.equal(linked.vert, pass.vert)
    }
    if (test.composite === 'all') {
      assert.ok(Object.values(frame.draws[0].values).includes([4, 7, 7, 11][i]))
      const inputs = Object.values(frame.draws[1].values)
      assert.ok(inputs.includes('o1/' + (1 - slot)), 'feedback must sample the opposite texture')
      assert.ok(inputs.some(input => typeof input === 'string' && input.startsWith('o0/')))
    }
  }
  const uniqueImages = new Set(trace.frames.map(frame => frame.hash)).size
  if (test.composite === 'one') assert.equal(uniqueImages, 1)
  else assert.ok(uniqueImages > 1)
}

async function main() {
  const local = process.argv[2] || 'http://127.0.0.1:8736/'
  const official = 'https://hydra.ojack.xyz/?sketch_id=eerie_ear_0'
  const browser = await chromium.launch({ channel: 'chromium',
    args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream'] })
  try {
    for (const test of cases) {
      const [upstream, studio] = await Promise.all([official, local].map(url => run(browser, url, test)))
      verify(upstream, test)
      assert.deepEqual(studio, upstream, test.name)
      const frame = upstream.frames[0]
      console.log(test.name, '|', upstream.passes.length, 'compiled passes |',
        upstream.frames.length, 'ticks x', frame.draws.length, 'WebGL draws |',
        new Set(upstream.frames.map(item => item.hash)).size, 'distinct composite hashes')
    }
    console.log('Chromium', browser.version(), '| shader pairs, uniform values, FBO routing and pixels agree')
  } finally {
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
