function isGifFile(file) {
  return !!file && (file.type === 'image/gif' || /\.gif$/i.test(file.name))
}

function normalizeGifFile(file) {
  return isGifFile(file) && file.type !== 'image/gif'
    ? new File([file],file.name,{type:'image/gif',lastModified:file.lastModified})
    : file
}

// A canvas texture needs composited GIF frames. Uploading an HTMLImageElement
// repeatedly sends its first frame even when the browser animates that element.
class GifAnimation {
  constructor(data) {
    let reader
    try { reader = new GifReader(new Uint8Array(data)) }
    catch { throw new Error('El archivo GIF no se pudo leer.') }
    this.reader = reader
    const width = reader.width, height = reader.height, count = reader.numFrames()
    if (!width || !height || !count) throw new Error('El GIF está vacío o dañado.')
    if (width * height > 16777216) throw new Error('El GIF es demasiado grande para animarlo en el lienzo.')
    this.frames = Array.from({length:count}, (_,index) => reader.frameInfo(index))
    this.ends = []
    let duration = 0
    for (const frame of this.frames) {
      if (!frame.width || !frame.height || frame.x + frame.width > width || frame.y + frame.height > height ||
          frame.palette_offset == null) throw new Error('El GIF tiene un cuadro inválido.')
      duration += frame.delay ? frame.delay * 10 : 100
      this.ends.push(duration)
    }
    this.cycleDuration = duration
    const repeats = reader.loopCount()
    this.cycles = repeats === 0 ? Infinity : (repeats ?? 0) + 1
    this.canvas = document.createElement('canvas')
    const scale = Math.min(1,1920 / Math.max(width,height))
    this.canvas.width = Math.max(1,Math.round(width * scale))
    this.canvas.height = Math.max(1,Math.round(height * scale))
    this.context = this.canvas.getContext('2d')
    this.raw = this.canvas
    if (scale < 1) {
      this.raw = document.createElement('canvas')
      this.raw.width = width
      this.raw.height = height
    }
    this.rawContext = this.raw.getContext('2d')
    this.pixels = this.rawContext.createImageData(width,height)
    this.frame = -1
    this.cycle = 0
    this.backup = null
    this.render(0,0)
    this.start = performance.now()
    this.running = count > 1
    if (!this.running) this.releasePixels()
  }

  rows(frame, change) {
    const row = frame.width * 4, stride = this.pixels.width * 4
    for (let y = 0; y < frame.height; y++) {
      const start = (frame.y + y) * stride + frame.x * 4
      change(start,row,y * row)
    }
  }

  composite(index) {
    const previous = this.frames[this.frame], frame = this.frames[index], pixels = this.pixels.data
    // Browsers clear disposal-2 rectangles to transparent for GIF textures.
    if (previous?.disposal === 2) this.rows(previous,(start,row) => pixels.fill(0,start,start+row))
    else if (previous?.disposal === 3 && this.backup)
      this.rows(previous,(start,row,offset) => pixels.set(this.backup.subarray(offset,offset+row),start))
    this.backup = null
    if (frame.disposal === 3) {
      this.backup = new Uint8ClampedArray(frame.width * frame.height * 4)
      this.rows(frame,(start,row,offset) => this.backup.set(pixels.subarray(start,start+row),offset))
    }
    this.reader.decodeAndBlitFrameRGBA(index,pixels)
    this.frame = index
  }

  render(cycle,index) {
    if (cycle !== this.cycle || index < this.frame) {
      this.pixels.data.fill(0)
      this.backup = null
      this.frame = -1
      this.cycle = cycle
    }
    if (index === this.frame) return
    while (this.frame < index) this.composite(this.frame + 1)
    this.rawContext.putImageData(this.pixels,0,0)
    if (this.raw !== this.canvas) {
      this.context.clearRect(0,0,this.canvas.width,this.canvas.height)
      this.context.drawImage(this.raw,0,0,this.canvas.width,this.canvas.height)
    }
  }

  advance(now = performance.now()) {
    if (!this.running) return
    const elapsed = Math.max(0,now-this.start)
    const cycle = Math.floor(elapsed / this.cycleDuration)
    if (cycle >= this.cycles) {
      this.render(this.cycles-1,this.frames.length-1)
      this.releasePixels()
      return
    }
    const time = elapsed - cycle * this.cycleDuration
    const index = this.ends.findIndex(end => time < end)
    this.render(cycle,index)
  }

  releasePixels() {
    this.running = false
    this.reader = this.pixels = this.backup = this.frames = this.ends = null
    if (this.raw !== this.canvas) this.raw.width = this.raw.height = 1
  }

  close() {
    this.releasePixels()
    this.canvas.width = this.canvas.height = 1
  }
}
