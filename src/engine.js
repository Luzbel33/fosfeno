// Keep top-level live bindings across block evaluations. Acorn identifies real
// declarations, leaving GLSL strings, nested JS scopes and comments untouched.
function compileScore(code, bindings) {
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
    'with(bindings){return (async()=>{\n' + hoisted + body + code.slice(end) + '\n})()}'
  )
  return () => program(bindings)
}
class VisualEngine {
  constructor(canvas, state) {
    this.canvas = canvas
    this.state = state
    this.hydra = new Hydra({
      canvas,
      makeGlobal: true,
      autoLoop: false,
      detectAudio: false,
      enableStreamCapture: false,
      numSources: 4,
      numOutputs: 4,
      precision: 'highp'
    })
    this.h = this.hydra.synth
    this.r = this.hydra.regl
    this.size = [canvas.width, canvas.height]
    this.autoScale = 1
    this.medium = null
    this.lastProgram = []
    this.running = false
    this.bindings = Object.create(null)
    window.hydra = this.hydra
    window.bpm = state.bpm
    const engine = this
    // Upstream out() logs compilation failures. Propagate them to the editor so a
    // later bad chain cannot leave half a multi-output patch on screen.
    Object.getPrototypeOf(this.h.osc()).out = function (output = engine.h.o0) {
      const passes = this.glsl(output)
      this.synth.currentFunctions = []
      output.render(passes)
    }
    const audio = {
      fft: [0, 0, 0],
      cutoff: 0,
      scale: 1,
      smooth: 0,
      setBins(n) {
        this.fft = Array(Math.max(1, Math.min(64, Math.round(Number(n) || 3)))).fill(0)
        return this
      },
      setSmooth(n) {
        this.smooth = Math.max(0, Math.min(0.99, Number(n) || 0))
        return this
      },
      setScale(n) {
        this.scale = Math.max(0.01, Number(n) || 1)
        return this
      },
      setCutoff(n) {
        this.cutoff = Math.max(0, Number(n) || 0)
        return this
      }
    }
    window.a = this.h.a = audio
  }
  resize(width, height) {
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
  setMedium(element) {
    if (element === this.medium) return
    const s = this.h.s0
    const oldTexture = s.tex
    if (element) {
      const ready = !(element instanceof HTMLVideoElement) || element.readyState >= 2
      if (!ready) return
      s.init({ src: element, dynamic: !(element instanceof HTMLImageElement) })
    } else if (s.src === this.medium) s.clear()
    if (s.tex !== oldTexture) oldTexture.destroy()
    this.medium = element
  }
  show(output) {
    this.h.render(output === 'all' ? undefined : this.h['o' + output])
  }
  get output() {
    return this.hydra.isRenderingAll ? 'all' : String(this.hydra.o.indexOf(this.hydra.output))
  }
  async run(code, { fresh = false, whole = true } = {}) {
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
      await fn()
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
      this.running = false
    }
  }
  tick(ms, sound) {
    const audio = this.h.a,
      n = audio.fft.length,
      bands = this.state.bands
    for (let i = 0; i < n; i++) {
      let level = bands[Math.min(2, Math.floor((i * 3) / n))]
      if (n !== 3 && sound.active && sound.bins) {
        const range = sound.context.sampleRate / sound.analyser.fftSize
        const lo = Math.max(1, Math.floor((35 * Math.pow(400, i / n)) / range))
        const hi = Math.min(
          sound.bins.length,
          Math.max(lo + 1, Math.ceil((35 * Math.pow(400, (i + 1) / n)) / range))
        )
        let power = 0
        for (let j = lo; j < hi; j++) power += (sound.bins[j] / 255) ** 2
        level = Math.min(1, Math.sqrt(power / Math.max(1, hi - lo)) * this.state.sensitivity)
      }
      const target = Math.max(0, (level - audio.cutoff / 100) / audio.scale)
      audio.fft[i] = audio.fft[i] * audio.smooth + target * (1 - audio.smooth)
    }
    this.hydra.tick(Math.min(ms, 150))
  }
}
