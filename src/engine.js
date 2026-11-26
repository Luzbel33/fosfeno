// Keep top-level live bindings across block evaluations. Acorn identifies real
// declarations, leaving GLSL strings, nested JS scopes and comments untouched.
function compileScore(code, bindings, synchronous = false) {
  const tree = acorn.parse(code, {
    ecmaVersion: 'latest',
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true
  })
  const text = (node) => code.slice(node.start, node.end)
  function declare(node) {
    if (node.type === 'Identifier') {
      if (!Object.hasOwn(bindings, node.name)) bindings[node.name] = undefined
    } else if (node.type === 'ObjectPattern')
      node.properties.forEach((p) => declare(p.value || p.argument))
    else if (node.type === 'ArrayPattern') node.elements.filter(Boolean).forEach(declare)
    else declare(node.left || node.argument)
  }
  let body = '',
    end = 0,
    hoisted = ''
  for (const node of tree.body) {
    body += code.slice(end, node.start)
    if (node.type === 'VariableDeclaration') {
      const assignments = node.declarations.map((d) => {
        declare(d.id)
        return d.init ? '(' + text(d.id) + ' = (' + text(d.init) + '))' : 'void 0'
      })
      body += ';' + assignments.join(',') + ';'
    } else if (node.type === 'FunctionDeclaration') {
      declare(node.id)
      hoisted += node.id.name + '=(' + text(node) + ');\n'
      body += ';'
    } else if (node.type === 'ClassDeclaration') {
      declare(node.id)
      body += ';' + node.id.name + '=(' + text(node) + ');'
    } else body += text(node)
    end = node.end
  }
  const program = new Function(
    'bindings',
    'with(bindings){return (' + (synchronous ? '' : 'async') + '()=>{\n' + hoisted + body + code.slice(end) + '\n})()}'
  )
  return () => program(bindings)
}
class VisualEngine {
  constructor(canvas, state, inputs, audio, room) {
    this.canvas = canvas
    this.state = state
    this.hydra = new Hydra({
      canvas,
      pb: room,
      makeGlobal: true,
      autoLoop: false,
      detectAudio: false,
      enableStreamCapture: true,
      numSources: 4,
      numOutputs: 4
    })
    this.h = this.hydra.synth
    this.r = this.hydra.regl
    this.size = [canvas.width, canvas.height]
    this.hydra.sandbox.set('setResolution', (width, height) => {
      this.hydra.setResolution(width, height)
      this.size = state.sketchResolution = [canvas.width, canvas.height]
    })
    this.autoScale = 1
    this.attached = Array(4).fill(null)
    this.clearSource = this.hydra.s.map((s, index) => {
      const clear = s.clear.bind(s)
      const tick = s.tick.bind(s)
      const input = inputs[index]
      s.tick = (time) => {
        const video = s.src
        if (video instanceof HTMLVideoElement && video === this.attached[index] && s.dynamic) {
          if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return
          if (video.videoWidth !== s.tex.width || video.videoHeight !== s.tex.height)
            s.tex.resize(video.videoWidth, video.videoHeight)
          s.tex.subimage(video)
        } else tick(time)
      }
      const open = (kind, options) => {
        const opening = input.open(kind, options).then((connected) => {
          if (!connected) throw new DOMException('Conexión de video cancelada.', 'AbortError')
        })
        // Classic Hydra sketches call initCam() without awaiting it.
        opening.catch(() => {})
        return opening
      }
      s.initCam = (choice, params) => open('camera', { choice, params, nativeSize: true })
      s.initScreen = (_index = 0, params) => open('screen', { params, captureAudio: false })
      s.initStream = (name, params) => open('peer', { receive: (signal) => room.receive(name, signal), params })
      s.clear = () => {
        const oldTexture = s.tex
        input.clear()
        if (s.tex === oldTexture) {
          clear()
          oldTexture.destroy()
        }
      }
      return clear
    })
    this.lastProgram = []
    this.running = false
    this.bindings = Object.create(null)
    window.hydra = window.hydraSynth = this.hydra
    window.bpm = state.bpm
    const engine = this
    this.scoreOutputs = new Set()
    // Upstream out() logs compilation failures. Propagate them to the editor so a
    // later bad chain cannot leave half a multi-output patch on screen.
    Object.getPrototypeOf(this.h.osc()).out = function (output = engine.h.o0) {
      const passes = this.glsl(output)
      this.synth.currentFunctions = []
      output.render(passes)
      const slot = engine.hydra.o.indexOf(output)
      engine.writing?.add(slot)
    }
    this.audioWasActive = false
    window.a = this.h.a = audio
  }
  resize(width, height) {
    if (this.state.sketchResolution) {
      const [w, h] = this.state.sketchResolution
      if (this.canvas.width !== w || this.canvas.height !== h) this.hydra.setResolution(w, h)
      this.size = [w, h]
      return
    }
    const q = this.state.quality
    const max = q === 'auto' ? 1920 * 1080 * this.autoScale ** 2 : (Number(q) ** 2 * 16) / 9
    const scale = Math.min(
      q === 'auto' ? (devicePixelRatio || 1) * this.autoScale : 2,
      Math.sqrt(max / (width * height)),
      2
    )
    const w = Math.max(2, Math.round((width * scale) / 2) * 2),
      h = Math.max(2, Math.round((height * scale) / 2) * 2)
    if (this.size[0] === w && this.size[1] === h) return
    this.hydra.setResolution(w, h)
    this.size = [w, h]
    this.r.poll()
  }
  setMedium(element, index = 0, params) {
    if (element === this.attached[index]) return
    const s = this.hydra.s[index]
    const oldTexture = s.tex
    if (element) {
      // Allocate before swapping so a rejected texture keeps the previous route live.
      s.tex = this.r.texture({ data: element, ...params })
      s.src = element
      s.dynamic = !(element instanceof HTMLImageElement)
    } else if (s.src === this.attached[index]) this.clearSource[index]()
    if (s.tex !== oldTexture) oldTexture.destroy()
    this.attached[index] = element
  }
  show(output) {
    this.h.render(output === 'all' ? undefined : this.h['o' + output])
  }
  get output() {
    return this.hydra.isRenderingAll ? 'all' : String(this.hydra.o.indexOf(this.hydra.output))
  }
  clearScore() {
    // Keep media devices, independent sector programs and the capture canvas alive.
    for (const output of this.hydra.o) {
      this.h.solid(0, 0, 0, 1).out(output)
      for (const framebuffer of output.fbos) this.r.clear({framebuffer, color:[0,0,0,1]})
    }
    window.speed = 1
    window.bpm = this.state.bpm
    window.fps = undefined
    window.update = window.afterUpdate = () => {}
    this.bindings = Object.create(null)
    this.scoreOutputs.clear()
    this.lastProgram = []
  }
  async run(code, { fresh = false, whole = true, syncOutputs = false } = {}) {
    if (this.running) throw new Error('Esperá a que termine la ejecución actual.')
    this.running = true
    const draws = this.hydra.o.map((o) => o.draw)
    const view = this.output
    const timing = [window.speed, window.bpm, window.fps, window.update, window.afterUpdate]
    const previousBindings = this.bindings,
      values = { ...this.bindings }
    try {
      if (fresh) this.bindings = Object.create(null)
      const fn = compileScore(code, this.bindings)
      if (fresh) {
        for (const o of this.hydra.o) this.h.solid(0, 0, 0, 1).out(o)
        window.speed = 1
        window.bpm = this.state.bpm
        window.fps = undefined
        window.update = window.afterUpdate = () => {}
        this.show('0')
      }
      this.writing = new Set()
      await fn()
      const written = this.writing
      this.writing = null
      if (syncOutputs) {
        for (const index of this.scoreOutputs) {
          if (!written.has(index)) this.h.solid(0, 0, 0, 1).out(this.hydra.o[index])
        }
      }
      if (whole) this.scoreOutputs = written
      else for (const index of written) this.scoreOutputs.add(index)
      if (whole) this.lastProgram = [code]
      else this.lastProgram.push(code)
    } catch (err) {
      this.bindings = previousBindings
      Object.keys(previousBindings).forEach((k) => {
        if (!Object.hasOwn(values, k)) delete previousBindings[k]
      })
      Object.assign(previousBindings, values)
      this.hydra.o.forEach((o, i) => (o.draw = draws[i]))
      ;[window.speed, window.bpm, window.fps, window.update, window.afterUpdate] = timing
      this.show(view)
      throw err
    } finally {
      this.writing = null
      this.running = false
    }
  }
  tick(ms, sound) {
    const audio = this.h.a
    if (sound.active && audio.meyda) {
      audio.tick()
      this.audioWasActive = true
    } else if (this.state.internalPulse) {
      // Explicit synthetic input uses the same per-bin controls as a live signal.
      const bands = this.state.bands
      for (let i = 0; i < audio.fft.length; i++) {
        const level = bands[Math.floor(i * bands.length / audio.fft.length)]
        const { smooth, cutoff, scale } = audio.settings[i]
        audio.prevBins[i] = audio.bins[i]
        audio.bins[i] = audio.bins[i] * smooth + 15 * level * (1 - smooth)
        audio.fft[i] = Math.max(0, (audio.bins[i] - cutoff) / scale)
      }
      if (audio.isDrawing) audio.draw()
      this.audioWasActive = true
    } else if (this.audioWasActive) {
      audio.bins.fill(0)
      audio.prevBins.fill(0)
      audio.fft.fill(0)
      audio.vol = 0
      if (audio.isDrawing) audio.draw()
      this.audioWasActive = false
    }
    this.hydra.tick(ms)
  }
}
