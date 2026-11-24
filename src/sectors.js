const sectorShapes = ['Rectángulo', 'Cuadrado', 'Círculo', 'Rombo', 'Triángulo', 'Libre']
const sectorEffects = {
  Invertir: [1, 0, 1, .01, (g, v) => g.invert(v)],
  Girar: [0.4, -3.14, 3.14, .01, (g, v) => g.rotate(v)],
  Caleidoscopio: [6, 2, 18, 1, (g, v) => g.kaleid(v)],
  Saturar: [1.8, 0, 4, .05, (g, v) => g.saturate(v)],
  Pixelar: [24, 2, 160, 1, (g, v) => g.pixelate(v, v)],
  Modular: [.1, 0, .7, .01, (g, v, h) => g.modulate(h.noise(3), v)],
  Teselar: [3, 1, 12, 1, (g, v) => g.repeat(v, v)],
  Posterizar: [5, 2, 24, 1, (g, v) => g.posterize(v, .7)],
  Graves: [.3, 0, 1, .01, (g, v) => g.scale(() => 1 + window.a.fft[0] * v())]
}

function regionPoints(shape, path, width, height) {
  if (shape === 'Libre') return path
  const [a, b] = [path[0], path.at(-1)]
  let dx = b[0] - a[0], dy = b[1] - a[1]
  if (shape === 'Cuadrado' || shape === 'Círculo') {
    const side = Math.min(Math.abs(dx) * width, Math.abs(dy) * height)
    dx = Math.sign(dx) * side / width
    dy = Math.sign(dy) * side / height
  }
  const x = Math.min(a[0], a[0] + dx), y = Math.min(a[1], a[1] + dy)
  const w = Math.abs(dx), h = Math.abs(dy), cx = x+w/2, cy = y+h/2
  if (shape === 'Círculo') return Array.from({length: 96}, (_, i) => {
    const theta = i * Math.PI / 48
    return [cx + w/2*Math.cos(theta), cy + h/2*Math.sin(theta)]
  })
  if (shape === 'Rombo') return [[cx,y],[x+w,cy],[cx,y+h],[x,cy]]
  if (shape === 'Triángulo') return [[cx,y],[x+w,y+h],[x,y+h]]
  return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]
}

function regionBounds(points) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const x = Math.min(...xs), y = Math.min(...ys)
  return [x, y, Math.max(...xs)-x, Math.max(...ys)-y]
}

function traceRegion(ctx, points, width, height) {
  ctx.beginPath()
  points.forEach(([x,y], i) => i ? ctx.lineTo(x*width,y*height) : ctx.moveTo(x*width,y*height))
  ctx.closePath()
}

// Composite after Hydra presents its selected output. Its four feedback
// buffers stay available to the sketch. A project with no sectors adds no draw.
class SectorRenderer {
  constructor(engine, input, bass) {
    this.engine = engine
    this.input = input
    this.bass = bass
    this.passes = []
    const hydra = engine.hydra
    for (const key of ['renderFbo','renderAll']) {
      const present = hydra[key]
      hydra[key] = (...args) => {
        present(...args)
        if (this.passes.length) this.frame()
      }
    }
  }
  compile(region) {
    const { r, h, hydra } = this.engine
    const bounds = regionBounds(region.points)
    const mask = document.createElement('canvas')
    mask.width = mask.height = 512
    const mc = mask.getContext('2d')
    const points = region.points.map(([x,y]) => [(x-bounds[0])/bounds[2], (y-bounds[1])/bounds[3]])
    traceRegion(mc, points, mask.width, mask.height)
    mc.fillStyle = 'white'
    mc.fill('evenodd')
    const matte = r.texture({data: mask, flipY:true, mag:'linear'})
    const media = r.texture({width:1,height:1,mag:'linear'})
    const direct = region.source === 'sketch' && !region.paint
    const shared = region.source === 's0' && !region.paint
    try {
      let graph = h.src({getTexture: () => direct ? this.base : shared ? h.s0.getTexture() : media})
      for (const fx of region.fx) graph = sectorEffects[fx.name][4](graph, () => fx.value, h)
      const pass = graph.glsl()[0]
      // DOM images start in the upper left. Flip the sampling coordinate so
      // live video can use Chromium's untransformed texture upload path.
      const uv = direct ? 'screen' : region.source === 'sketch'
        ? 'vec2(screen.x, 1.0-screen.y)' : 'vec2(local.x, 1.0-local.y)'
      const frag = pass.frag.replace('void main () {', 'uniform sampler2D regionMask;\nuniform float regionOpacity;\nuniform vec4 rect;\nvoid main () {')
        .replace('vec2 st = gl_FragCoord.xy/resolution.xy;', `
          vec2 screen = gl_FragCoord.xy/resolution.xy;
          vec2 local = (screen - rect.xy) / rect.zw;
          if (any(lessThan(local,vec2(0.))) || any(greaterThan(local,vec2(1.)))) discard;
          float coverage = texture2D(regionMask, local).a;
          if (coverage <= 0.) discard;
          vec2 st = ${uv};`)
        .replace('gl_FragColor = c;', 'gl_FragColor = vec4(c.rgb, c.a * coverage * regionOpacity);')
      const draw = r({
        vert: hydra.o[0].vert, frag, attributes: hydra.o[0].attributes, count:3,
        uniforms: {...pass.uniforms, regionMask: matte, regionOpacity:()=>region.opacity ?? 1,
          rect: [bounds[0],1-bounds[1]-bounds[3],bounds[2],bounds[3]]},
        depth:{enable:false}, blend:{enable:true,func:{srcRGB:'src alpha',dstRGB:'one minus src alpha',srcAlpha:'one',dstAlpha:'one minus src alpha'}}
      })
      return {region, draw, media, direct, shared, brush: region.paint ? new BrushSurface() : null,
        release() { matte.destroy(); media.destroy() }}
    } catch (err) { matte.destroy(); media.destroy(); throw err }
  }
  set(regions) {
    const next = []
    try {
      for (const region of regions.filter(s => s.visible)) next.push(this.compile(region))
    } catch (err) { next.forEach(p => p.release()); throw err }
    this.passes.forEach(p => p.release())
    this.passes = next
    if (this.base && !next.some(p => p.direct)) { this.base.destroy(); this.base = null }
  }
  frame() {
    const { engine } = this, { canvas, r } = engine, {width,height} = canvas
    if (this.passes.some(p => p.direct)) {
      if (!this.base) this.base = r.texture({width,height,mag:'linear'})
      if (this.base.width !== width || this.base.height !== height) this.base.resize(width,height)
      this.base.subimage({copy:true,width,height})
    }
    const props = {time:engine.h.time, resolution:[width,height], bpm:window.bpm}
    // Upload before drawing any region so every sketch brush samples the same base.
    for (const p of this.passes) {
      p.ready = p.direct
      if (p.direct) continue
      if (p.shared) { p.ready = !!engine.h.s0.src; continue }
      let el = p.region.source === 'sketch' ? canvas : p.region.source === 's0' ? this.input() : p.region.file?.current?.element
      if (!el || (el instanceof HTMLVideoElement && el.readyState < 2)) continue
      if (p.brush) el = p.brush.paint(el, performance.now(), p.region.brushSize ?? .42, this.bass())
      if (!el) continue
      const w = el.videoWidth || el.naturalWidth || el.width, h = el.videoHeight || el.naturalHeight || el.height
      if (!w || !h) continue
      if (p.lastImage !== el || p.media.width !== w || p.media.height !== h) p.media({data:el, mag:'linear'})
      else if (!(el instanceof HTMLImageElement)) p.media.subimage(el)
      p.lastImage = el
      p.ready = true
    }
    for (const p of this.passes) if (p.ready) p.draw(props)
  }
}

class SectorDesk {
  constructor({live, input, bass, connect}) {
    this.live = live
    this.input = input
    this.bass = bass
    this.regions = []
    this.applied = []
    this.files = new Set()
    this.nextId = 1
    this.guide = document.getElementById('sectorGuide')
    this.ctx = this.guide.getContext('2d')
    const $ = id => document.getElementById(id)
    const selected = () => this.selected()
    const button = (root, text, click) => {
      const b = document.createElement('button')
      b.textContent = text
      b.onclick = click
      root.append(b)
    }
    function toggleGroup(control, group, open = $(group).hidden) {
      $(group).hidden = !open
      $(control).setAttribute('aria-expanded', open)
    }
    $('newSector').onclick = () => toggleGroup('newSector','sectorShapes')
    $('addSectorEffect').onclick = () => toggleGroup('addSectorEffect','sectorFx')
    for (const shape of sectorShapes) button($('sectorShapes'),shape,() => {
      toggleGroup('newSector','sectorShapes',false); this.arm(shape)
    })
    for (const [name, def] of Object.entries(sectorEffects)) button($('sectorFx'), name, () => {
      selected().fx.push({name, value:def[0]})
      toggleGroup('addSectorEffect','sectorFx',false)
      this.changed()
    })
    $('sectorRedraw').onclick = () => this.arm(selected().shape, this.id)
    $('sectorDeform').onclick = () => {
      this.drag = null
      this.mode = this.mode?.edit ? null : {edit:true}
      if (this.mode) this.note('Arrastrá un punto para deformar, un borde para agregar un punto o el interior para mover.')
      this.refresh()
    }
    $('sectorDelete').onclick = () => {
      this.regions = this.regions.filter(s => s.id !== this.id)
      this.id = this.regions.at(-1)?.id
      this.mode = null
      this.changed()
    }
    $('sectorVisible').onclick = () => { selected().visible = !selected().visible; this.changed() }
    $('sectorRaise').onclick = () => {
      const index = this.regions.indexOf(selected())
      if (index < this.regions.length-1) this.regions.splice(index+1,0,this.regions.splice(index,1)[0])
      this.changed()
    }
    $('sectorPaint').onclick = () => { selected().paint = !selected().paint; this.changed() }
    for (const [control,key,output] of [['sectorOpacity','opacity','opacityValue'],['sectorBrushSize','brushSize','sectorBrushValue']]) {
      $(control).oninput = e => {
        const region = selected()
        region[key] = Number(e.target.value)/100
        $(output).value = e.target.value+'%'
        const applied = this.live() && this.applied.find(r=>r.id===region.id)
        if (applied) applied[key] = region[key]
        else { this.dirty=true; $('applySectors').hidden=false }
      }
    }
    for (const b of document.querySelectorAll('[data-sector-src]')) b.onclick = () => {
      selected().source = b.dataset.sectorSrc
      selected().file = selected().request = null
      this.changed()
      if (selected().source === 's0' && !this.input()) this.note('Conectá la webcam aquí o elegí otra entrada en Señal → Imagen.')
    }
    $('sectorCamera').onclick = async () => {
      $('sectorCamera').disabled = true
      try { this.note(await connect() ? 'Webcam conectada en s0.' : $('cameraStatus').textContent) }
      finally { $('sectorCamera').disabled = false; this.refresh() }
    }
    $('sectorFileButton').onclick = () => { this.fileTarget = selected(); $('sectorFile').click() }
    $('sectorFile').onchange = async e => {
      const file = e.target.files[0], region = this.fileTarget
      e.target.value = ''
      if (!file || !region) return
      const request = Symbol()
      region.request = request
      const source = new VisualInput(() => {}, () => {}, () => {})
      try {
        await source.open('file', { file })
        if (region.request !== request || !this.regions.includes(region)) { source.clear(); return }
        this.files.add(source)
        region.file = source
        region.source = 'file'
        this.changed()
      } catch (err) { source.clear(); this.note(err.message) }
    }
    $('applySectors').onclick = () => this.apply()
    $('saveSectors').onclick = () => this.save().catch(e => this.note(e.message))
    $('loadSectors').onclick = () => this.restore().catch(e => this.note(e.message))
    this.guide.onpointerdown = e => this.down(e)
    this.guide.onpointermove = e => this.move(e)
    this.guide.onpointerup = e => this.up(e)
    this.guide.onpointercancel = () => { this.drag = null; this.paintGuide() }
    new ResizeObserver(() => this.layout()).observe($('stage'))
    this.refresh()
  }
  selected() { return this.regions.find(s => s.id === this.id) }
  note(message) { document.getElementById('sectorStatus').textContent = message }
  attach(engine) {
    this.renderer = new SectorRenderer(engine, this.input, this.bass)
    this.renderer.set(this.applied)
  }
  show(on) {
    if (this.guide.hidden === !on) return
    this.guide.hidden = !on
    this.drag = this.mode = null
    if (on) { this.refresh(); this.layout() }
  }
  layout() {
    if (this.guide.hidden) return
    const canvas = document.getElementById('visual'), rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    let w = rect.width, h = rect.height
    if (canvas.style.objectFit === 'contain') {
      const scale = Math.min(w/canvas.width, h/canvas.height)
      w = canvas.width*scale; h = canvas.height*scale
    }
    Object.assign(this.guide.style, {left:(rect.width-w)/2+'px',top:(rect.height-h)/2+'px',width:w+'px',height:h+'px'})
    this.guide.width = Math.round(w * devicePixelRatio)
    this.guide.height = Math.round(h * devicePixelRatio)
    this.paintGuide()
  }
  point(e) {
    const r = this.guide.getBoundingClientRect()
    const unit = v => Math.min(1,Math.max(0,v))
    return [unit((e.clientX-r.left)/r.width),unit((e.clientY-r.top)/r.height)]
  }
  arm(shape, target = null) {
    this.mode = {shape,target}
    this.drag = null
    this.note('Arrastrá en la visual para dibujar ' + shape.toLowerCase() + '.')
    this.refresh()
  }
  down(e) {
    if (this.drag || e.button !== 0) return
    const p = this.point(e)
    if (this.mode?.edit) {
      const shape = this.selected(), points = shape?.points
      if (!points) return
      const w = this.guide.clientWidth, h = this.guide.clientHeight
      const distance = (a,b) => Math.hypot((a[0]-b[0])*w,(a[1]-b[1])*h)
      const anchors = this.handles(points)
      let index = anchors.reduce((best,i) => distance(p,points[i]) < distance(p,points[best]) ? i : best)
      let original = points
      if (distance(p,points[index]) > 13) {
        index = -1
        let nearest = 10
        points.forEach((a,i) => {
          const b = points[(i+1)%points.length], dx = (b[0]-a[0])*w, dy = (b[1]-a[1])*h
          const t = Math.max(0,Math.min(1,((p[0]-a[0])*w*dx+(p[1]-a[1])*h*dy)/(dx*dx+dy*dy || 1)))
          const dist = distance(p,[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])])
          if (dist < nearest) { nearest = dist; index = i+1 }
        })
        if (index >= 0 && points.length < 4096) {
          original = [...points.slice(0,index),p,...points.slice(index)]
        } else {
          index = -1
          traceRegion(this.ctx,points,this.guide.width,this.guide.height)
          if (!this.ctx.isPointInPath(p[0]*this.guide.width,p[1]*this.guide.height,'evenodd')) return
        }
      }
      this.guide.setPointerCapture(e.pointerId)
      this.drag = {pointer:e.pointerId,edit:true,origin:p,index,original,points:original}
      return
    }
    if (!this.mode) {
      for (const s of [...this.regions].reverse()) {
        traceRegion(this.ctx,s.points,this.guide.width,this.guide.height)
        if (this.ctx.isPointInPath(p[0]*this.guide.width,p[1]*this.guide.height,'evenodd')) {
          this.id = s.id; this.refresh(); break
        }
      }
      return
    }
    this.guide.setPointerCapture(e.pointerId)
    this.drag = {pointer:e.pointerId,path:[p]}
    this.paintGuide()
  }
  move(e) {
    if (!this.drag || this.drag.pointer !== e.pointerId) return
    if (this.drag.edit) {
      const {origin,index,original} = this.drag, p = this.point(e)
      let dx = p[0]-origin[0], dy = p[1]-origin[1]
      if (index < 0) {
        const [x,y,w,h] = regionBounds(original)
        dx = Math.max(-x,Math.min(1-x-w,dx)); dy = Math.max(-y,Math.min(1-y-h,dy))
      }
      const span = Math.ceil(original.length/16)
      this.drag.points = original.map(([x,y],i) => {
        const diff = Math.abs(i-index)
        const weight = index < 0 ? 1 : Math.max(0,1-Math.min(diff,original.length-diff)/span)
        return [Math.max(0,Math.min(1,x+dx*weight)),Math.max(0,Math.min(1,y+dy*weight))]
      })
      this.paintGuide()
      return
    }
    const p = this.point(e), path = this.drag.path, prev = path.at(-1)
    if (this.mode.shape !== 'Libre') path[1] = p
    else if (Math.hypot((p[0]-prev[0])*this.guide.width,(p[1]-prev[1])*this.guide.height) > 2 && path.length < 4096) path.push(p)
    this.paintGuide()
  }
  up(e) {
    if (!this.drag || this.drag.pointer !== e.pointerId) return
    this.move(e)
    if (this.drag.edit) {
      const {points} = this.drag, [, ,w,h] = regionBounds(points)
      this.drag = null
      if (w*this.guide.width < 4 || h*this.guide.height < 4) { this.paintGuide(); return }
      this.selected().points = points
      this.changed()
      return
    }
    const {shape,target} = this.mode
    const points = regionPoints(shape,this.drag.path,this.guide.width,this.guide.height)
    const [, ,w,h] = regionBounds(points)
    this.drag = null
    if (points.length < 3 || w*this.guide.width < 4 || h*this.guide.height < 4) {
      this.note('Arrastrá un poco más para crear un área.'); this.paintGuide(); return
    }
    this.mode = null
    if (target) this.regions.find(s => s.id === target).points = points
    else {
      this.id = this.nextId++
      this.regions.push({id:this.id,shape,points,source:'sketch',visible:true,paint:false,fx:[]})
    }
    this.changed()
    if (this.live()) this.note('Sector listo. Elegí un efecto o una imagen para cambiar su interior.')
  }
  handles(points) {
    const step = Math.ceil(points.length/16)
    return points.map((_,i) => i).filter(i => i%step === 0)
  }
  paintGuide() {
    const {ctx,guide} = this, w = guide.width, h = guide.height
    ctx.clearRect(0,0,w,h)
    const points = this.drag?.edit ? this.drag.points : this.drag ? regionPoints(this.mode.shape,this.drag.path,w,h) : this.selected()?.points
    if (!points) return
    traceRegion(ctx, points,w,h)
    ctx.setLineDash([]); ctx.strokeStyle = '#101210'; ctx.lineWidth = 3*devicePixelRatio; ctx.stroke()
    ctx.setLineDash([5*devicePixelRatio,4*devicePixelRatio]); ctx.strokeStyle='#c6fc55'; ctx.lineWidth=1.5*devicePixelRatio; ctx.stroke()
    if (this.mode?.edit) {
      ctx.setLineDash([]); ctx.fillStyle='#c6fc55'; ctx.strokeStyle='#101210'
      for (const i of this.handles(points)) {
        ctx.beginPath(); ctx.arc(points[i][0]*w,points[i][1]*h,4*devicePixelRatio,0,Math.PI*2); ctx.fill(); ctx.stroke()
      }
    }
  }
  changed() {
    this.dirty = true
    if (this.live()) this.apply()
    else { this.note('Sectores preparados. Aplicá los cambios cuando quieras proyectarlos.'); this.refresh() }
  }
  apply() {
    if (!this.dirty || !this.renderer) return
    const next = this.regions.map(s => ({...s,fx:s.fx.map(f => ({...f}))}))
    try { this.renderer.set(next) }
    catch (err) { this.note('Se conservó la mezcla anterior. ' + err.message); this.refresh(); return }
    this.applied = next
    this.dirty = false
    this.cleanFiles()
    this.note('Sectores actualizados en la salida.')
    this.refresh()
  }
  cleanFiles() {
    for (const file of this.files) {
      if (![...this.regions,...this.applied].some(s => s.file === file)) { file.clear(); this.files.delete(file) }
    }
  }
  refresh() {
    const $ = id => document.getElementById(id)
    const s = this.selected()
    for (const b of $('sectorShapes').children) b.setAttribute('aria-pressed',this.mode?.shape === b.textContent)
    $('sectorList').replaceChildren(...this.regions.map(r => {
      const b = document.createElement('button')
      b.textContent = r.id + ' · ' + r.shape + (r.visible ? '' : ' · oculto')
      b.setAttribute('aria-pressed',r === s)
      b.onclick = () => { this.id = r.id; this.mode = null; this.refresh() }
      return b
    }))
    $('sectorEdit').hidden = !s
    $('applySectors').hidden = !this.dirty
    if (s) {
      $('sectorDeform').setAttribute('aria-pressed',!!this.mode?.edit)
      $('sectorTitle').textContent = s.shape + ' ' + s.id
      $('sectorOpacity').value = Math.round((s.opacity ?? 1)*100)
      $('opacityValue').value = $('sectorOpacity').value+'%'
      $('sectorVisible').textContent = s.visible ? 'Ocultar' : 'Mostrar'
      $('sectorRaise').disabled = s === this.regions.at(-1)
      for (const b of document.querySelectorAll('[data-sector-src]')) b.setAttribute('aria-pressed',b.dataset.sectorSrc === s.source)
      $('sectorFileButton').setAttribute('aria-pressed',s.source === 'file')
      $('sectorFileButton').textContent = s.file?.current?.file?.name || 'Foto o video'
      $('sectorCamera').hidden = s.source !== 's0' || !!this.input()
      $('sectorPaint').setAttribute('aria-pressed',s.paint)
      $('sectorBrushControl').hidden = !s.paint
      $('sectorBrushSize').value = Math.round((s.brushSize ?? .42)*100)
      $('sectorBrushValue').value = $('sectorBrushSize').value+'%'
      $('sectorControls').replaceChildren(...s.fx.map((fx,i) => {
        const row = document.createElement('div'), label = document.createElement('label'), slider = document.createElement('input'),
          remove = document.createElement('button'), val = document.createElement('output')
        row.className = 'sector-control'
        label.textContent = fx.name; slider.type = 'range'
        const [,min,max,step] = sectorEffects[fx.name]
        Object.assign(slider,{min,max,step,value:fx.value})
        val.value = fx.value
        slider.oninput = () => {
          val.value = slider.value; fx.value = Number(slider.value)
          const applied = this.live() && this.applied.find(r=>r.id===s.id)?.fx[i]
          if (applied?.name === fx.name) applied.value=fx.value
          else { this.dirty=true; $('applySectors').hidden=false }
        }
        slider.onchange = () => { fx.value = Number(slider.value); this.changed() }
        remove.textContent = 'Quitar'; remove.setAttribute('aria-label','Quitar ' + fx.name + ' del sector')
        remove.onclick = () => { s.fx.splice(i,1); this.changed() }
        label.append(slider); row.append(label,val,remove); return row
      }))
    }
    this.paintGuide()
  }
  async store(mode, action) {
    const db = await new Promise((resolve,reject) => {
      const req = indexedDB.open('fosfeno-sectores',1)
      req.onupgradeneeded = () => req.result.createObjectStore('sesion')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    try {
      return await new Promise((resolve,reject) => {
        const tx = db.transaction('sesion',mode), req = action(tx.objectStore('sesion'))
        tx.oncomplete = () => resolve(req.result)
        tx.onabort = tx.onerror = () => reject(tx.error || new Error('No se pudo acceder a los sectores guardados.'))
      })
    } finally { db.close() }
  }
  snapshot() {
    return this.regions.map(({id,shape,points,visible,opacity,source,paint,brushSize,fx,file}) =>
      ({id,shape,points,visible,opacity:opacity ?? 1,source,paint,brushSize:brushSize ?? .42,fx,file:file?.current?.file}))
  }
  async save() {
    await this.store('readwrite',s => s.put(this.snapshot(),'actual'))
    this.note('Sectores y archivos guardados en este navegador.')
  }
  async restore() {
    const data = await this.store('readonly',s => s.get('actual'))
    if (!data) { this.note('Todavía no guardaste sectores.'); return }
    this.install(await this.prepare(data))
  }
  async prepare(data) {
    const next = [], opened = []
    try {
      for (const entry of data) {
        const region = {...entry,file:null}
        if (entry.file) {
          region.file = new VisualInput(() => {},() => {},() => {})
          opened.push(region.file)
          await region.file.open('file',{file:entry.file})
        }
        next.push(region)
      }
    } catch (e) { opened.forEach(s => s.clear()); throw e }
    return next
  }
  install(next,selection) {
    next.forEach(s => { if (s.file) this.files.add(s.file) })
    this.regions = next
    this.id = next.find(s=>s.id===selection)?.id ?? next.at(-1)?.id
    this.nextId = Math.max(0,...next.map(s => s.id))+1
    this.mode = this.drag = null
    this.changed()
  }
}
