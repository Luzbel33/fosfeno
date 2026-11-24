class BrushSurface {
  constructor() {
    this.canvas = document.createElement('canvas')
    this.sample = document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d', { alpha: false })
    this.read = this.sample.getContext('2d', { willReadFrequently: true, alpha: false })
    this.reset()
  }
  reset() {
    this.ticks = 0
    this.stamp = -1
    this.lastPaint = -100
    this.pixels = null
  }
  paint(el, now, brush, bass) {
    if (now - this.lastPaint < 56) return this.canvas
    const w = el.videoWidth || el.naturalWidth || el.width,
      h = el.videoHeight || el.naturalHeight || el.height
    if (!w || !h) return null
    const scale = Math.min(3, 560 / Math.max(w, h))
    if (!this.ticks) {
      this.canvas.width = Math.max(4, Math.round(w * scale))
      this.canvas.height = Math.max(4, Math.round(h * scale))
      this.sample.width = Math.max(3, Math.round(this.canvas.width / 3))
      this.sample.height = Math.max(3, Math.round(this.canvas.height / 3))
      this.ctx.fillStyle = '#15101d'
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    }
    this.lastPaint = now
    const sw = this.sample.width,
      sh = this.sample.height,
      stamp = el.currentTime ?? 0
    if (stamp !== this.stamp || !this.pixels) {
      this.read.drawImage(el, 0, 0, sw, sh)
      this.pixels = this.read.getImageData(0, 0, sw, sh).data
      this.stamp = stamp
    }
    const data = this.pixels,
      ctx = this.ctx
    const light = (i) => data[i] * 0.25 + data[i + 1] * 0.6 + data[i + 2] * 0.15
    const coarse = 1 + 2.4 * Math.exp(-this.ticks / 24)
    for (let i = 0; i < 190; i++) {
      const x = 1 + Math.floor(Math.random() * (sw - 2)),
        y = 1 + Math.floor(Math.random() * (sh - 2)),
        pos = 4 * (y * sw + x)
      const dx = light(pos + 4) - light(pos - 4),
        dy = light(pos + 4 * sw) - light(pos - 4 * sw)
      const angle =
        Math.atan2(dy, dx) + Math.PI / 2 + 0.46 * Math.sin(x * 0.12 + y * 0.08 + now * 0.0004)
      const width = (0.7 + brush * 3.5) * (1 + Math.random()) * coarse * (1 + bass * 0.32)
      const len = width * (1.3 + Math.random() * 2.6),
        ax = Math.cos(angle) * len,
        ay = Math.sin(angle) * len
      const px = (x * this.canvas.width) / sw,
        py = (y * this.canvas.height) / sh
      ctx.strokeStyle = 'rgb(' + data[pos] + ',' + data[pos + 1] + ',' + data[pos + 2] + ')'
      ctx.lineCap = 'round'
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(px - ax, py - ay)
      ctx.quadraticCurveTo(px - ay * 0.28, py + ax * 0.28, px + ax, py + ay)
      ctx.stroke()
    }
    this.ticks++
    return this.canvas
  }
}

function trackStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fosfeno-audio', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('tracks', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

class SoundDesk {
  constructor(change, message) {
    this.change = change
    this.message = message
    this.tracks = new Map()
    this.micStream = null
    this.recorder = null
    this.db = trackStore().catch(() => null)
    this.levels = [0, 0, 0]
    this.visualNode = null
    this.storageOK = true
  }
  async start() {
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext
      this.context = new Audio()
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = 2048
      this.analyser.smoothingTimeConstant = 0.72
      this.bins = new Uint8Array(this.analyser.frequencyBinCount)
      this.analysisGain = this.context.createGain()
      this.analysisGain.gain.value = this.sensitivity
      this.analyser.connect(this.analysisGain)
      this.hydraAudio.connectSource(this.context, this.analysisGain)
      this.output = this.context.createDynamicsCompressor()
      this.output.connect(this.context.destination)
    }
    if (this.context.state !== 'running') await this.context.resume()
  }
  async store(action, value) {
    const db = await this.db
    if (!db) throw new Error('Almacenamiento local no disponible')
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tracks', action === 'getAll' ? 'readonly' : 'readwrite')
      const store = tx.objectStore('tracks'),
        rq = value === undefined ? store[action]() : store[action](value)
      tx.oncomplete = () => resolve(rq.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }
  async restore() {
    try {
      for (const entry of await this.store('getAll')) this.tracks.set(entry.id, entry)
    } catch {
      this.storageOK = false
    }
    this.change()
  }
  async add(blob, name) {
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      name,
      blob,
      volume: 0.7
    }
    try {
      await this.store('put', entry)
    } catch {
      this.storageOK = false
      this.message('La pista queda en esta sesión. El navegador no pudo guardarla.')
    }
    this.tracks.set(entry.id, entry)
    this.change()
  }
  async play(id) {
    const tr = this.tracks.get(id)
    if (!tr) return
    if (tr.audio && !tr.audio.paused) {
      tr.audio.pause()
      this.change()
      return
    }
    await this.start()
    if (!tr.audio) {
      tr.url = URL.createObjectURL(tr.blob)
      tr.audio = new Audio(tr.url)
      tr.audio.loop = true
      tr.node = this.context.createMediaElementSource(tr.audio)
      tr.gain = this.context.createGain()
      tr.node.connect(tr.gain)
      tr.gain.connect(this.output)
      tr.gain.connect(this.analyser)
    }
    tr.gain.gain.value = tr.volume
    await tr.audio.play()
    this.change()
  }
  volume(id, value) {
    const tr = this.tracks.get(id)
    tr.volume = value
    if (tr.gain) tr.gain.gain.setTargetAtTime(value, this.context.currentTime, 0.025)
  }
  async remove(id) {
    const tr = this.tracks.get(id)
    if (await this.db) await this.store('delete', id)
    tr.audio?.pause()
    tr.node?.disconnect()
    tr.gain?.disconnect()
    if (tr.url) URL.revokeObjectURL(tr.url)
    this.tracks.delete(id)
    this.change()
  }
  async mic() {
    if (this.micStream) return this.micStream
    if (!this.pendingMic) this.pendingMic = this.connectMic().finally(() => (this.pendingMic = null))
    return this.pendingMic
  }
  async connectMic() {
    await this.start()
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error('Abrí Fosfeno en localhost o HTTPS para usar el micrófono.')
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    })
    this.micStream = stream
    this.micNode = this.context.createMediaStreamSource(stream)
    this.micNode.connect(this.analyser)
    stream.getAudioTracks()[0].onended = () => this.stopMic()
    this.change()
    return stream
  }
  stopMic() {
    if (this.recorder?.state === 'recording') this.recorder.stop()
    this.micNode?.disconnect()
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.micStream = null
    this.change()
  }
  async record() {
    if (this.recorder?.state === 'recording') {
      this.recorder.stop()
      return
    }
    if (!window.MediaRecorder) throw new Error('Este navegador no ofrece grabación de micrófono.')
    const stream = await this.mic(),
      rec = new MediaRecorder(stream),
      chunks = []
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    rec.onstop = async () => {
      if (chunks.length) {
        await this.add(
          new Blob(chunks, { type: rec.mimeType }),
          'Toma ' + new Date().toLocaleTimeString('es-AR', { hour12: false })
        )
        this.message(
          this.storageOK ? 'Toma guardada en la biblioteca.' : 'Toma disponible en esta sesión.'
        )
      }
      this.recorder = null
      this.change()
    }
    rec.onerror = () => this.message('Se interrumpió la grabación. Revisá la entrada de audio.')
    this.recorder = rec
    rec.start(500)
    this.change()
  }
  disconnectVisual() {
    this.visualNode?.disconnect()
    this.visualNode = null
  }
  get active() {
    return (
      !!this.micStream ||
      !!this.visualNode ||
      Array.from(this.tracks.values()).some((t) => t.audio && !t.audio.paused)
    )
  }
  sample(seconds, bpm, sensitivity, dt, internalPulse = false) {
    let values
    if (this.active && this.analyser) {
      this.analyser.getByteFrequencyData(this.bins)
      const hz = this.context.sampleRate / this.analyser.fftSize
      values = [
        [35, 180],
        [180, 2200],
        [2200, 13500]
      ].map(([lo, hi]) => {
        let sum = 0
        const end = Math.min(this.bins.length, Math.ceil(hi / hz)),
          start = Math.floor(lo / hz)
        for (let k = start; k < end; k++) sum += (this.bins[k] / 255) ** 2
        return Math.min(1, Math.sqrt(sum / Math.max(1, end - start)) * sensitivity)
      })
    } else if (internalPulse) {
      const beats = (seconds * bpm) / 60
      values = [
        0.44 * Math.exp(-(beats % 1) * 6),
        0.21 + 0.15 * Math.sin(beats * 1.57),
        0.24 * Math.exp(-((beats * 2) % 1) * 5)
      ]
    } else {
      return this.levels.fill(0)
    }
    this.levels = this.levels.map(
      (v, i) => v + (values[i] - v) * (1 - Math.exp(-dt * (values[i] > v ? 18 : 5)))
    )
    return this.levels
  }
}
