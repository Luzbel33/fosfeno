const PATCHES = [
  {
    name: 'Vitral ácido',
    code: 'voronoi(7, .28, .45).mult(osc(23, .06, 1.3).kaleid(9)).modulate(noise(2.1, .12), .18).colorama(() => .015 + a.fft[2] * .025)'
  },
  {
    name: 'Galería de fase',
    code: 'osc(39, .045, 1.7).modulate(shape(4, .45, .35).repeat(3, 2).rotate(.4, .08), () => .2 + a.fft[0] * .16).kaleid(4).rotate(.1, .028)'
  },
  {
    name: 'Líquenes',
    code: 'voronoi(11, .29, .44).modulatePixelate(noise(3, .08), 35, 8).color(.19, .92, .65).modulate(osc(3, .025, 0), () => .16 + a.fft[1] * .15)'
  },
  {
    name: 'Interferencia',
    code: 'osc(28, .05, 1.6).diff(osc(33, -.035, 1.3).rotate(.84)).kaleid(() => 4 + a.fft[0] * .4).modulateScale(noise(2, .09), .42)'
  },
  {
    name: 'Delta cromático',
    code: 'voronoi(6, .38, .31).mult(osc(13, .07, 1.8).kaleid(31)).modulate(o0, () => .12 + a.fft[0] * .2).scrollY(-.009).scale(.993)'
  },
  {
    name: 'Retina múltiple',
    code: 'shape(29, .33, .13).repeat(5, 3).diff(osc(18, .08, 1.5).kaleid(7)).modulateRotate(noise(2.2, .14), () => 1.4 + a.fft[1]).color(.9, .47, .79)'
  }
]

class VisualEngine {
  constructor(canvas, state) {
    this.canvas = canvas
    this.state = state
    this.hydra = new Hydra({
      canvas,
      makeGlobal: false,
      autoLoop: false,
      detectAudio: false,
      enableStreamCapture: false,
      numSources: 0,
      numOutputs: 1,
      precision: 'highp'
    })
    this.h = this.hydra.synth
    this.r = this.hydra.regl
    const r = this.r
    this.targets = [0, 1].map(() =>
      r.framebuffer({
        width: 2,
        height: 2,
        depthStencil: false,
        color: r.texture({ width: 2, height: 2, min: 'linear', mag: 'linear' })
      })
    )
    this.mediaTex = r.texture({
      width: 1,
      height: 1,
      data: [0, 0, 0, 255],
      min: 'linear',
      mag: 'linear'
    })
    this.source = { getTexture: () => this.mediaTex }
    this.h.s0 = this.source
    this.h.a = {
      get fft() {
        return state.bands
      }
    }
    this.patchText = PATCHES.map((p) => p.code)
    this.patchFns = this.patchText.map((code) => this.compilePatch(code))
    const uniforms = {}
    for (const key of [
      'clock',
      'seed',
      'size',
      'pointer',
      'sound',
      'energy',
      'hue',
      'impulse',
      'fusion',
      'symmetry',
      'mediaAspect'
    ])
      uniforms[key] = r.prop(key)
    uniforms.imageIn = this.mediaTex
    this.programs = SHADERS.map((body) =>
      r({
        vert: VERTEX,
        frag: SHARED + body + FINISH,
        attributes: {
          position: [
            [-1, -1],
            [3, -1],
            [-1, 3]
          ]
        },
        count: 3,
        depth: { enable: false },
        framebuffer: r.prop('target'),
        uniforms
      })
    )
    this.slots = [
      { scene: 0, seed: 0.18 },
      { scene: 0, seed: 0.18 }
    ]
    this.active = 0
    this.fade = 1
    this.age = 0
    this.autoScale = 1
    this.medium = null
    this.mediaStamp = -1
    this.canvasVersion = 0
    this.size = [0, 0]
    this.pipelines = new Map()
    this.compose()
  }
  compilePatch(text) {
    // Match live Hydra's time and FFT lookups inside functions. Only the operator's
    // explicit Apply action evaluates editor text. Incoming media cannot supply code.
    const expression = text
      .trim()
      .replace(/;\s*$/, '')
      .replace(/\.out\(\s*(?:o0)?\s*\)\s*$/, '')
    return new Function('scope', 'with(scope){return (\n' + expression + '\n)}')
  }
  editPatch(index, text) {
    const fn = this.compilePatch(text),
      old = this.patchFns[index],
      oldCache = this.pipelines
    const trial = fn(this.h)
    if (trial?.type !== 'GlslSource')
      throw new Error('Ingresá una expresión que produzca una señal, por ejemplo osc(12).kaleid(5).')
    this.patchFns[index] = fn
    this.pipelines = new Map()
    try {
      this.compose()
      this.patchText[index] = text
    } catch (e) {
      this.patchFns[index] = old
      this.pipelines = oldCache
      this.compose()
      throw e
    }
  }
  resize(width, height) {
    const s = this.state
    const maxPixels =
      s.quality === 'auto'
        ? 1920 * 1080 * this.autoScale * this.autoScale
        : (Number(s.quality) * Number(s.quality) * 16) / 9
    const scale = Math.min(
      s.quality === 'auto' ? (devicePixelRatio || 1) * this.autoScale : 2,
      Math.sqrt(maxPixels / (width * height)),
      2
    )
    const w = Math.max(2, Math.round((width * scale) / 2) * 2),
      h = Math.max(2, Math.round((height * scale) / 2) * 2)
    if (this.size[0] === w && this.size[1] === h) return
    this.hydra.setResolution(w, h)
    this.targets.forEach((tex) => tex.resize(w, h))
    this.layerTarget?.resize(w, h)
    this.size = [w, h]
    this.r.poll()
  }
  compose() {
    const s = this.state,
      h = this.h
    // Hydra compiles on out(). Reuse the finite bank of cue pairs throughout a set.
    const fading = this.fade < 1
    const second = s.mode === 'hybrid' && s.layerMix > 0
    const key = [
      s.mode,
      this.active,
      this.slots[this.active].scene,
      fading ? this.slots[1 - this.active].scene : 'steady',
      second
    ].join('/')
    if (this.pipelines.has(key)) {
      h.o0.draw = this.pipelines.get(key)
      return
    }
    const layer = (slot) => {
      const patch = this.patchFns[this.slots[slot].scene](h)
        .rotate(() => s.symmetry * 0.55 + 0.24 * Math.sin(s.mutation))
        .scale(() => 1 + 0.055 * s.bands[0] * s.energy + 0.09 * Math.sin(s.mutation * 0.65))
        .hue(() => s.hue / 6.283)
      if (s.mode === 'hydra') {
        return patch
          .modulate(h.src(this.source), () => (this.medium ? s.fusion * 0.22 : 0))
          .blend(h.src(this.source), () => (this.medium ? s.fusion * 0.57 : 0))
      }
      const image = h.src({ getTexture: () => this.targets[slot] })
      return image.add(patch, () => s.hydraMix * 0.38)
    }
    const current = layer(this.active)
    let composite =
      this.fade < 1
        ? layer(1 - this.active).blend(current, () => this.fade * this.fade * (3 - 2 * this.fade))
        : current
    if (second) {
      if (!this.layerTarget)
        this.layerTarget = this.r.framebuffer({
          width: this.size[0] || 2,
          height: this.size[1] || 2,
          depthStencil: false
        })
      const overlay = h.src({ getTexture: () => this.layerTarget })
      composite = composite.modulate(overlay, () => s.layerMix * 0.09).blend(overlay, () => s.layerMix)
    }
    composite = composite.blend(
      h
        .src(h.o0)
        .scale(() => 1.012 + 0.009 * s.bands[0])
        .rotate(() => 0.0016 + 0.0022 * Math.sin(this.age * 0.21)),
      () => s.echo * 0.84
    )
    h.o0.render(composite.glsl())
    this.pipelines.set(key, h.o0.draw)
  }
  scene(index, seed) {
    this.active = 1 - this.active
    this.slots[this.active] = { scene: index, seed }
    this.fade = 0
    this.compose()
  }
  setMedium(element) {
    this.medium = element
    this.mediaStamp = -1
    if (!element) this.mediaTex({ width: 1, height: 1, data: [0, 0, 0, 255] })
  }
  tick(ms) {
    const s = this.state,
      dt = Math.min(ms / 1000, 0.12)
    this.age += dt * (0.46 + s.energy * 0.75 + s.bands[1] * 0.3)
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + ms / 2800)
      if (this.fade === 1) this.compose()
    }
    const el = this.medium,
      isVideo = el instanceof HTMLVideoElement
    if (el && (!isVideo || el.readyState >= 2)) {
      const stamp = isVideo ? el.currentTime : el instanceof HTMLCanvasElement ? this.canvasVersion : 1
      if (stamp !== this.mediaStamp) {
        const w = el.videoWidth || el.naturalWidth || el.width,
          h = el.videoHeight || el.naturalHeight || el.height
        if (w && h) {
          if (this.mediaTex.width !== w || this.mediaTex.height !== h)
            this.mediaTex({ data: el, min: 'linear', mag: 'linear', flipY: false })
          else this.mediaTex.subimage(el)
          this.mediaStamp = stamp
        }
      }
    }
    if (s.mode !== 'hydra') {
      const draw = (item, target) => {
        const drift = s.auto ? 0.5 - 0.5 * Math.cos(this.age * 0.052) : 0
        this.programs[item.scene]({
          target,
          clock: this.age,
          seed: item.seed + s.mutation + drift * 0.64,
          size: this.size,
          pointer: s.pointer,
          sound: s.bands,
          energy: s.energy,
          hue: s.hue + drift * 0.34,
          impulse: s.impulse,
          fusion: el ? s.fusion : 0,
          symmetry: s.symmetry,
          mediaAspect: this.mediaTex.width / this.mediaTex.height
        })
      }
      if (this.fade < 1) draw(this.slots[1 - this.active], this.targets[1 - this.active])
      draw(this.slots[this.active], this.targets[this.active])
      if (s.layerMix > 0) draw({ scene: s.second, seed: 2.4 }, this.layerTarget)
    }
    this.hydra.tick(dt * 1000)
  }
}
