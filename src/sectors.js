const sectorShapes = ['Rectángulo', 'Cuadrado', 'Círculo', 'Rombo', 'Triángulo', 'Libre']
const sectorLabel = sector => sector?.id ? sector.shape + ' ' + sector.id : 'Toda la visual'
// The original sector content is the base layer, including in older saved projects.
const sectorLayers = sector => [sector,...(sector.layers || [])]
const sectorLayerId = layer => layer.layerId ?? 0
const sectorLayerLabel = layer => layer.layerId ? 'Capa ' + (layer.layerId+1) : 'Base'
const defaultSectorStyle = {fillOn:false,fill:'#bf75ff',strokeOn:false,stroke:'#ffffff',strokeWidth:4}
const sectorStyle = sector => sector.style || defaultSectorStyle
const sectorColorPattern = /^#[\da-f]{6}$/i
const hasLayerContent = layer => layer.source!=='sketch' || layer.paint || !!layer.code || layer.fx.some(f=>f.enabled!==false)
const effectOrigin = Symbol('effect origin')
const layerOrigin = Symbol('layer origin')
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
    const r = engine.r
    this.paint = r({
      vert:hydra.o[0].vert, attributes:hydra.o[0].attributes, count:3,
      frag:`precision mediump float;
        uniform vec2 resolution;
        uniform vec4 rect;
        uniform sampler2D matte;
        uniform vec3 ink;
        void main() {
          vec2 local = (gl_FragCoord.xy/resolution-rect.xy)/rect.zw;
          if (any(lessThan(local,vec2(0.))) || any(greaterThan(local,vec2(1.)))) discard;
          gl_FragColor = vec4(ink,texture2D(matte,local).a);
        }`,
      uniforms:{resolution:r.prop('resolution'),rect:r.prop('rect'),matte:r.prop('matte'),ink:r.prop('ink')},
      framebuffer:r.prop('target'), depth:{enable:false},
      blend:{enable:true,func:{srcRGB:'src alpha',dstRGB:'one minus src alpha',srcAlpha:'one',dstAlpha:'one minus src alpha'}}
    })
    for (const key of ['renderFbo','renderAll']) {
      const present = hydra[key]
      hydra[key] = (...args) => {
        present(...args)
        if (this.passes.length) this.frame()
      }
    }
  }
  compileLayer(layer) {
    const { r, h, hydra } = this.engine
    const media = r.texture({width:1,height:1,mag:'linear'})
    const direct = layer.source === 'sketch' && !layer.paint
    const shared = layer.source === 's0' && !layer.paint
    const programs = []
    const track = {layer,media,direct,shared,programs,brush:layer.paint ? new BrushSurface() : null,
      release() { media.destroy(); programs.forEach(p=>p.destroy()) }}
    const base = {getTexture: () => direct ? this.base : shared ? h.s0.getTexture() : media}
    const patch = (code,library) => {
      const program = new SectorProgram(this.engine,base,library)
      programs.push(program)
      const graph = program.run(code)
      return {program,graph}
    }
    try {
      let graph = h.src(base)
      if (layer.code) {
        const authored=patch(layer.code,true)
        graph=authored.graph || (authored.program.outputs.size && authored.program.image())
        if (!graph?.glsl) throw new Error('Devolvé una cadena con return o escribí una imagen con .out().')
      }
      for (const [i,fx] of layer.fx.entries()) {
        if (fx.enabled===false) continue
        const value = () => track.layer.fx[i].value
        if (fx.kind === 'library') {
          const {program} = patch(fx.code,true)
          if (!program.outputs.size) throw new Error('El sketch de biblioteca necesita una salida .out().')
          graph = graph.blend(program.image(),value)
        } else if (fx.kind === 'operator') {
          const {program} = patch(fx.definitions.join('\n'),false)
          Object.setPrototypeOf(graph,program.generator.sourceClass.prototype)
          program.scope.capaActual=graph
          graph=program.run('return capaActual'+fx.code)
        } else graph = sectorEffects[fx.name][4](graph, value, h)
      }
      const pass = graph.glsl()[0]
      // DOM images start in the upper left. Flip the sampling coordinate so
      // live video can use Chromium's untransformed texture upload path.
      const uv = direct ? 'screen' : layer.source === 'sketch'
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
      if (programs.length) validateLayerShader(r,frag)
      track.draw = r({
        vert: hydra.o[0].vert, frag, attributes: hydra.o[0].attributes, count:3,
        uniforms: {...pass.uniforms, prevBuffer:()=>hydra.o[0].getTexture(), regionMask:r.prop('matte'),
          regionOpacity:()=>track.layer.opacity ?? 1, rect:r.prop('rect')},
        framebuffer:r.prop('target'),
        depth:{enable:false}, blend:{enable:true,func:{srcRGB:'src alpha',dstRGB:'one minus src alpha',srcAlpha:'one',dstAlpha:'one minus src alpha'}}
      })
      return track
    } catch (err) { track.release(); throw err }
  }
  set(regions) {
    const next = [], created = []
    const signatureFor = layer => JSON.stringify([layer.source,layer.paint,layer.code,
      layer.fx.map(f=>[f.name,f.kind,f.code,f.definitions,f.enabled])])
    try {
      for (const region of regions.filter(s => s.visible)) {
        const previous = this.passes.find(p=>p.region.id===region.id)
        const style = sectorStyle(region)
        const layers = sectorLayers(region).filter((layer,index)=>hasLayerContent(layer) || (!index && !style.fillOn))
        const tracks = layers.map(layer=>{
          const signature = signatureFor(layer)
          const current = previous?.tracks.find(t=>sectorLayerId(t.layer)===sectorLayerId(layer) && t.signature===signature)
          if (current) return current
          const track = this.compileLayer(layer)
          track.signature = signature
          created.push(track)
          return track
        })
        next.push({region,tracks,layers,geometry:previous?.geometry || {}})
      }
    } catch (err) { created.forEach(p => p.release()); throw err }
    const retained = new Set(next.flatMap(pass=>pass.tracks))
    for (const pass of this.passes) {
      for (const track of pass.tracks) if (!retained.has(track)) track.release()
      if (!next.some(p=>p.geometry===pass.geometry)) {
        pass.geometry.matte?.destroy()
        pass.geometry.border?.destroy()
      }
    }
    for (const pass of next) pass.tracks.forEach((track,i)=>{ track.layer=pass.layers[i] })
    this.passes = next
    if (this.base && ![...retained].some(track=>track.direct)) { this.base.destroy(); this.base = null }
  }
  bounds(pass) {
    const [x,y,w,h] = pass.geometry.bounds || regionBounds(pass.region.points)
    const move = this.moving?.id===pass.region.id ? this.moving : null
    return [x+(move?.x ?? 0),y+(move?.y ?? 0),w,h]
  }
  prepareMask(pass, resolution) {
    const geometry = pass.geometry, points = pass.region.points, style = sectorStyle(pass.region)
    const r = this.engine.r
    if (geometry.points!==points) {
      const [x,y,w,h] = geometry.bounds = regionBounds(points)
      geometry.local = points.map(([px,py])=>[(px-x)/w,(py-y)/h])
      geometry.points = points
      geometry.borderSize = null
      const mask = geometry.canvas || (geometry.canvas=document.createElement('canvas'))
      mask.width = mask.height = 512
      const ctx = mask.getContext('2d')
      traceRegion(ctx,geometry.local,mask.width,mask.height)
      ctx.fillStyle = 'white'
      ctx.fill('evenodd')
      const options={data:mask,flipY:true,mag:'linear'}
      if (geometry.matte) geometry.matte(options)
      else geometry.matte=r.texture(options)
    }
    if (!style.strokeOn) return
    const [, ,w,h] = geometry.bounds, width = Math.max(1,Math.round(w*resolution[0])), height = Math.max(1,Math.round(h*resolution[1]))
    const size = [width,height,style.strokeWidth].join(',')
    if (geometry.borderSize===size) return
    const scale = Math.min(1,512/Math.max(width,height)), mask = geometry.canvas
    mask.width=Math.max(1,Math.round(width*scale)); mask.height=Math.max(1,Math.round(height*scale))
    const ctx = mask.getContext('2d')
    traceRegion(ctx,geometry.local,mask.width,mask.height)
    ctx.clip('evenodd')
    ctx.strokeStyle='white'; ctx.lineJoin='round'; ctx.lineWidth=2*style.strokeWidth*scale
    ctx.stroke()
    const options={data:mask,flipY:true,mag:'linear'}
    if (geometry.border) geometry.border(options)
    else geometry.border=r.texture(options)
    geometry.borderSize=size
  }
  drawSector(pass, props) {
    this.prepareMask(pass,props.resolution)
    const style = sectorStyle(pass.region), [x,y,w,h] = this.bounds(pass)
    const rect = [x,1-y-h,w,h]
    const paint = (color,matte) => this.paint({...props,rect,matte,
      ink:[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255)})
    if (style.fillOn) paint(style.fill,pass.geometry.matte)
    for (const track of pass.tracks) if (track.ready) track.draw({...props,rect,matte:pass.geometry.matte})
    if (style.strokeOn) paint(style.stroke,pass.geometry.border)
  }
  frame() {
    const { engine } = this, { canvas, r } = engine, {width,height} = canvas
    const tracks = this.passes.flatMap(pass=>pass.tracks)
    if (tracks.some(track=>track.direct)) {
      if (!this.base) this.base = r.texture({width,height,mag:'linear'})
      if (this.base.width !== width || this.base.height !== height) this.base.resize(width,height)
      this.base.subimage({copy:true,width,height})
    }
    const props = {time:engine.h.time, resolution:[width,height], bpm:window.bpm, target:null}
    const now = performance.now(), dt = Math.min(100,now-(this.lastFrame ?? now))
    this.lastFrame = now
    const principal = this.passes.find(p=>p.region.id===0)
    if (principal) {
      for (const track of principal.tracks) {
        track.ready = true
        track.programs.forEach(program=>program.frame(props,dt))
      }
      this.drawSector(principal,props)
      if (this.base) this.base.subimage({copy:true,width,height})
    }
    // Upload before drawing any sector so sketch brushes sample the same base.
    for (const p of tracks) {
      if (principal?.tracks.includes(p)) continue
      p.ready = p.direct
      if (p.direct) continue
      if (p.shared) { p.ready = !!engine.h.s0.src || !!p.programs.length; continue }
      const layer = p.layer
      let el = layer.source === 'sketch' ? canvas : layer.source === 's0' ? this.input() : layer.file?.current?.element
      if (!el || (el instanceof HTMLVideoElement && el.readyState < 2)) {
        p.ready = !!p.programs.length
        continue
      }
      if (p.brush) el = p.brush.paint(el,now,layer.brushSize ?? .42,this.bass(),layer.brushSpeed,layer.brushDetail,layer.brushInverse)
      if (!el) continue
      const w = el.videoWidth || el.naturalWidth || el.width, h = el.videoHeight || el.naturalHeight || el.height
      if (!w || !h) continue
      if (p.lastImage !== el || p.media.width !== w || p.media.height !== h) p.media({data:el, mag:'linear'})
      else if (!(el instanceof HTMLImageElement)) p.media.subimage(el)
      p.lastImage = el
      p.ready = true
    }
    for (const pass of this.passes) if (pass!==principal) {
      for (const track of pass.tracks) if (track.ready) track.programs.forEach(program=>program.frame(props,dt))
      this.drawSector(pass,props)
    }
    this.capture?.(props)
  }
}

class SectorDesk {
  constructor({live, input, bass, connect, disconnect, onUpdate}) {
    this.live = live
    this.input = input
    this.bass = bass
    this.onUpdate = onUpdate
    this.effectControls = new WeakMap()
    this.layerSelection = new WeakMap()
    this.principal = this.makePrincipal()
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
    $('newSector').onclick = () => this.panel('sectorShapes')
    let effectScroll = 0, styleScroll = 0
    $('addSectorEffect').onclick = () => {
      const desk = $('layerDesk'), open = $('effectPicker').hidden
      if (open) effectScroll = desk.scrollTop
      this.panel('effectPicker',open)
      if (!open) desk.scrollTop = effectScroll
    }
    $('sectorMediaToggle').onclick = () => this.panel('sectorMedia')
    $('sectorStyleToggle').onclick = () => {
      const desk = $('layerDesk'), panel = $('sectorStyle'), open = panel.hidden
      if (open) styleScroll = desk.scrollTop
      this.panel('sectorStyle',open)
      if (open) panel.scrollIntoView({block:'nearest'})
      else desk.scrollTop = styleScroll
    }
    $('sectorCodeToggle').onclick = () => {
      this.panel('layerCode')
      if (!$('layerCode').hidden) $('sectorCode').focus()
    }
    $('addSectorLayer').onclick = () => {
      const region = selected(), layers = region.layers ??= []
      const layerId = 1+layers.reduce((id,layer)=>Math.max(id,layer.layerId),0)
      layers.push({layerId,opacity:1,source:'sketch',paint:false,fx:[]})
      this.layerSelection.set(region,layerId)
      this.changed()
    }
    $('raiseSectorLayer').onclick = () => this.moveLayer(1)
    $('lowerSectorLayer').onclick = () => this.moveLayer(-1)
    $('removeSectorLayer').onclick = () => {
      const region = selected(), layers = region.layers
      const index = layers.indexOf(this.target())
      if (index < 0) return
      layers.splice(index,1)
      this.layerSelection.set(region,layers[index-1]?.layerId ?? 0)
      this.changed()
    }
    this.installStyleControls($)
    for (const shape of sectorShapes) button($('sectorShapes'),shape,() => {
      this.panel(null); this.arm(shape)
    })
    for (const [name, def] of Object.entries(sectorEffects)) button($('sectorFx'), name, () => {
      const fx = this.target().fx, index = fx.findIndex(f=>!f.kind && f.name===name)
      if (index>=0) fx[index].enabled=fx[index].enabled===false
      else fx.push({name, value:def[0]})
      this.changed()
    })
    for (const [name,code,,definition] of OPERATORS.filter(([name])=>!Object.hasOwn(sectorEffects,name))) {
      button($('sectorFx'),name,()=>this.toggleQuick(this.target(),name,code,definition))
    }
    $('sectorRedraw').onclick = () => this.arm(selected().shape, this.id)
    $('sectorDeform').onclick = () => {
      this.cancelDrag()
      this.mode = this.mode?.edit ? null : {edit:true}
      this.note(this.mode ? 'Arrastrá un punto para deformar, un borde para agregar un punto o el interior para mover.' : '')
      this.refresh()
    }
    $('sectorDelete').onclick = () => {
      this.regions = this.regions.filter(s => s.id !== this.id)
      this.id = this.regions.at(-1)?.id
      this.mode = null
      this.cancelDrag()
      this.changed()
    }
    $('sectorRaise').onclick = () => {
      const index = this.regions.indexOf(selected())
      if (index < this.regions.length-1) this.regions.splice(index+1,0,this.regions.splice(index,1)[0])
      this.changed()
    }
    $('sectorPaint').onclick = () => { const layer=this.target(); layer.paint=!layer.paint; this.changed() }
    $('sectorApplyCode').onclick = () => {
      this.target().code = $('sectorCode').value.trim()
      this.changed()
    }
    for (const [control,key,output] of [['sectorOpacity','opacity','opacityValue'],['sectorBrushSize','brushSize','sectorBrushValue'],
      ['sectorBrushSpeed','brushSpeed','sectorSpeedValue'],['sectorBrushDetail','brushDetail','sectorDetailValue']]) {
      $(control).oninput = e => {
        const layer = this.target()
        layer[key] = Number(e.target.value)/100
        $(output).value = e.target.value+'%'
        paintRange(e.target)
        const applied = this.live() && this.appliedLayer(layer)
        if (applied) applied[key] = layer[key]
        else this.dirty=true
        this.onUpdate(selected())
      }
    }
    $('sectorRepaint').onclick = () => this.activeBrush()?.reset()
    $('sectorBrushInverse').onclick = () => {
      const layer = this.target()
      layer.brushInverse=!layer.brushInverse
      this.changed()
    }
    $('sectorClearInput').onclick = () => {
      const layer = this.target()
      layer.source='sketch'; layer.file=layer.request=null
      this.changed()
    }
    $('sectorDisconnect').onclick = () => { disconnect(); this.refresh() }
    for (const b of document.querySelectorAll('[data-sector-src]')) b.onclick = () => {
      const layer = this.target()
      layer.source = b.dataset.sectorSrc
      layer.file = layer.request = null
      this.changed()
      if (layer.source === 's0' && !this.input()) this.note('Conectá la webcam aquí o elegí otra fuente en Imagen.')
    }
    $('sectorCamera').onclick = async () => {
      $('sectorCamera').disabled = true
      try { this.note(await connect() ? 'Webcam conectada en s0.' : $('cameraStatus').textContent) }
      finally { $('sectorCamera').disabled = false; this.refresh() }
    }
    $('sectorFileButton').onclick = () => { this.fileTarget = this.target(); $('sectorFile').click() }
    $('sectorFile').onchange = e => {
      const file = e.target.files[0], region = this.fileTarget
      e.target.value = ''
      if (file && region) this.setFile(region,file).catch(err=>this.note(err.message))
    }
    $('saveSectors').onclick = () => this.save().catch(e => this.note(e.message))
    $('loadSectors').onclick = () => this.restore().catch(e => this.note(e.message))
    // Drawing owns this gesture. A native touch gesture can consume the next tap.
    this.guide.addEventListener('touchstart', event => {
      if (this.mode || this.drag?.moveOnly) event.preventDefault()
    }, {passive:false})
    this.guide.onpointerdown = e => this.down(e)
    this.guide.onpointermove = e => this.move(e)
    this.guide.onpointerup = e => this.up(e)
    this.guide.onpointerleave = () => { this.pointer=null; this.paintGuide(false) }
    this.guide.onpointercancel = this.guide.onlostpointercapture = e => {
      if (this.drag?.pointer!==e.pointerId) return
      this.pointer=null
      this.cancelDrag()
      this.paintGuide()
    }
    document.addEventListener('keydown',e=>{
      if (e.key!=='Escape' || (!this.drag && !this.mode) || $('helpDialog').open) return
      this.cancelDrag()
      this.mode=null
      this.note('')
      this.refresh()
    })
    new ResizeObserver(() => this.layout()).observe($('stage'))
    // A sketch can resize its framebuffer without resizing the preview element.
    new MutationObserver(() => this.layout()).observe($('visual'), {attributes:true,attributeFilter:['width','height']})
    this.refresh()
  }
  selected() { return this.regions.find(s => s.id === this.id) }
  content(region) {
    if (!region) return null
    return region.layers?.find(layer=>layer.layerId===this.layerSelection.get(region)) || region
  }
  target() { return this.content(this.selected()) || this.principal }
  containsLayer(layer) { return layer===this.principal || this.regions.some(s=>sectorLayers(s).includes(layer)) }
  appliedLayer(layer) { return this.applied.flatMap(sectorLayers).find(s=>s[layerOrigin]===layer) }
  activeBrush() {
    const layer = this.appliedLayer(this.target())
    return this.renderer?.passes.find(pass=>pass.region.id===this.id)?.tracks.find(track=>track.layer===layer)?.brush
  }
  moveLayer(step) {
    const layers = this.selected().layers
    const index = layers.indexOf(this.target()), next = index+step
    if (index<0 || next<0 || next>=layers.length) return
    layers.splice(next,0,layers.splice(index,1)[0])
    this.changed()
  }
  installStyleControls($) {
    const colors = [['Violeta','#bf75ff'],['Rosa','#ff629e'],['Naranja','#ff773f'],['Amarillo','#ffd659'],
      ['Verde','#b9ec51'],['Celeste','#54d8ff'],['Blanco','#ffffff'],['Negro','#000000']]
    const update = value => {
      const region = this.selected()
      if (!region) return
      const current = sectorStyle(region)
      if (Object.keys(value).every(key=>current[key]===value[key])) return
      region.style = {...current,...value}
      this.changed()
    }
    for (const [key,type] of [['fill','Fill'],['stroke','Stroke']]) {
      const input = $('sector'+type+'Color'), toggle = $('sector'+type+'Toggle')
      toggle.onclick = () => update({[key+'On']:!sectorStyle(this.selected())[key+'On']})
      input.onchange = () => {
        const value = '#'+input.value.trim().replace(/^#/,'')
        if (sectorColorPattern.test(value)) update({[key]:value.toLowerCase()})
        else {
          input.value=sectorStyle(this.selected())[key]
          this.note('Usá un color de seis dígitos, por ejemplo #54d8ff.')
        }
      }
      for (const [name,color] of colors) {
        const swatch = document.createElement('button')
        swatch.title=name
        swatch.setAttribute('aria-label',name)
        swatch.style.setProperty('--swatch',color)
        swatch.onclick=()=>update({[key]:color})
        document.querySelector('[data-sector-colors="'+key+'"]').append(swatch)
      }
    }
    $('sectorStrokeWidth').oninput = e => update({strokeWidth:Number(e.target.value)})
  }
  panel(id,open) {
    const $=id=>document.getElementById(id)
    open = open ?? (id && $(id).hidden)
    for (const [control,content] of [['newSector','sectorShapes'],['addSectorEffect','effectPicker'],
      ['sectorMediaToggle','sectorMedia'],['sectorCodeToggle','layerCode'],['sectorStyleToggle','sectorStyle']]) {
      const active = !!open && id===content
      $(content).hidden = !active
      $(control).setAttribute('aria-expanded',active)
    }
    const search=$('effectSearch')
    if (open && id==='effectPicker') {
      if (matchMedia('(pointer:fine)').matches) search.focus()
    } else if (search.value) {
      search.value=''
      search.dispatchEvent(new Event('input'))
    }
  }
  makePrincipal() {
    return {id:0,shape:'Principal',points:[[0,0],[1,0],[1,1],[0,1]],source:'sketch',visible:true,opacity:1,paint:false,fx:[]}
  }
  add(region,effect,replace = false) {
    if (!this.containsLayer(region)) return
    if (replace) region.fx = region.fx.filter(f=>f.kind!=='library')
    region.fx.push(effect)
    this.changed()
  }
  toggleLibrary(region,item,replace) {
    const index = region.fx.findIndex(f=>f.kind==='library' && f.name===item.name && f.code===item.code)
    if (index!==-1 && !replace) {
      region.fx[index].enabled=region.fx[index].enabled===false
      this.changed()
    } else this.add(region,{kind:'library',name:item.name,code:item.code,value:replace ? 1 : .5},replace)
  }
  toggleQuick(region,name,code,definition) {
    const index=region.fx.findIndex(f=>f.preset===name)
    if (index>=0) { region.fx[index].enabled=region.fx[index].enabled===false; this.changed(); return }
    this.add(region,{kind:'operator',preset:name,name,code,definitions:definition ? [MIRRORS[definition]] : []})
  }
  effectAmount(region,index,value) {
    const fx=region.fx[index]
    fx.value=value
    const applied = this.appliedLayer(region)?.fx.find(f=>f[effectOrigin]===fx)
    if (this.live() && applied) applied.value=value
    else if (!this.live() || fx.enabled!==false) this.dirty=true
    this.effectControls.get(fx)?.(value)
    this.onUpdate(this.selected())
  }
  async setFile(region,file) {
    const request = Symbol()
    region.request = request
    const source = new VisualInput(() => {}, () => {}, () => {})
    try {
      await source.open('file', { file })
      if (region.request !== request || !this.containsLayer(region)) { source.clear(); return }
      this.files.add(source)
      region.file = source
      region.source = 'file'
      this.changed()
      return true
    } catch (err) { source.clear(); throw err }
  }
  note(message) { document.getElementById('sectorStatus').textContent = message }
  attach(engine) {
    this.renderer = new SectorRenderer(engine, this.input, this.bass)
    this.renderer.set(this.applied)
  }
  captureSource(region) {
    const renderer = this.renderer, {r} = renderer.engine
    let pass = renderer.passes.find(p=>p.region.id===region.id)
    const ready = pass => !!pass && (pass.tracks.some(track=>track.ready) || sectorStyle(pass.region).fillOn || sectorStyle(pass.region).strokeOn)
    if (!ready(pass)) throw new Error('Aplicá el sector y esperá a que su imagen esté en salida.')
    const canvas = document.createElement('canvas'), pixels = document.createElement('canvas')
    const context = canvas.getContext('2d'), buffer = pixels.getContext('2d')
    const target = r.framebuffer({width:2,height:2,depthStencil:false})
    let frameTime = 0
    const dimensions = props => {
      const [width,height] = props.resolution
      const [x,y,w,h] = renderer.bounds(pass)
      const left = Math.round(x*width), top = Math.round((1-y-h)*height)
      return {left,top,width:Math.max(1,Math.min(width-left,Math.round(w*width))),
        height:Math.max(1,Math.min(height-top,Math.round(h*height)))}
    }
    const capture = props => {
      pass = renderer.passes.find(p=>p.region.id===region.id)
      const now = performance.now()
      if (now-frameTime < 1000/24 || !ready(pass)) return
      frameTime = now
      const [width,height] = props.resolution
      if (target.width!==width || target.height!==height) target.resize(width,height)
      r.clear({framebuffer:target,color:[0,0,0,1]})
      renderer.drawSector(pass,{...props,target})
      const crop = dimensions(props)
      if (pixels.width!==crop.width || pixels.height!==crop.height) {
        pixels.width=crop.width; pixels.height=crop.height
      }
      const data = r.read({framebuffer:target,x:crop.left,y:crop.top,width:crop.width,height:crop.height})
      buffer.putImageData(new ImageData(new Uint8ClampedArray(data.buffer),crop.width,crop.height),0,0)
      context.setTransform(1,0,0,-1,0,canvas.height)
      context.drawImage(pixels,0,0,canvas.width,canvas.height)
    }
    const props = {resolution:[renderer.engine.canvas.width,renderer.engine.canvas.height],time:renderer.engine.h.time,bpm:window.bpm}
    const crop = dimensions(props), scale = Math.min(1,720/Math.max(crop.width,crop.height))
    canvas.width = Math.max(2,Math.round(crop.width*scale/2)*2)
    canvas.height = Math.max(2,Math.round(crop.height*scale/2)*2)
    capture(props)
    renderer.capture = capture
    return {canvas, release() { renderer.capture=null; target.destroy() }}
  }
  show(on) {
    if (this.guide.hidden === !on) return
    this.guide.hidden = !on
    this.pointer=null
    if (!on && this.mode) this.note('')
    this.cancelDrag()
    this.mode = null
    if (on) { this.refresh(); this.layout() }
  }
  layout() {
    if (this.guide.hidden) return
    const canvas = document.getElementById('visual'), rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const scale=Math.min(rect.width/canvas.width,rect.height/canvas.height)
    const w=canvas.width*scale, h=canvas.height*scale
    Object.assign(this.guide.style, {left:(rect.width-w)/2+'px',top:(rect.height-h)/2+'px',width:w+'px',height:h+'px'})
    const width=Math.round(w * devicePixelRatio), height=Math.round(h * devicePixelRatio)
    if (this.guide.width!==width) this.guide.width=width
    if (this.guide.height!==height) this.guide.height=height
    this.paintGuide()
  }
  point(e, insideOnly=false) {
    const r = this.guide.getBoundingClientRect()
    if (insideOnly && (!r.width || !r.height || e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom)) return null
    const unit = v => Math.min(1,Math.max(0,v))
    return [unit((e.clientX-r.left)/r.width),unit((e.clientY-r.top)/r.height)]
  }
  arm(shape, target = null) {
    this.mode = {shape,target}
    this.cancelDrag()
    this.note('Arrastrá en la visual para dibujar ' + shape.toLowerCase() + '.')
    this.refresh()
  }
  cancelDrag() {
    const pointer=this.drag?.pointer
    this.drag = null
    if (pointer!=null && this.guide.hasPointerCapture(pointer)) this.guide.releasePointerCapture(pointer)
    if (this.renderer) this.renderer.moving = null
  }
  guideHit(p) {
    if (!p || this.mode?.shape) return null
    const contains=region=>{
      traceRegion(this.ctx,region.points,this.guide.width,this.guide.height)
      return this.ctx.isPointInPath(p[0]*this.guide.width,p[1]*this.guide.height,'evenodd')
    }
    if (this.mode?.edit) {
      const region=this.selected(), points=region?.points
      if (!points) return null
      const w = this.guide.clientWidth, h = this.guide.clientHeight
      const distance = (a,b) => Math.hypot((a[0]-b[0])*w,(a[1]-b[1])*h)
      const anchors = this.handles(points)
      let index = anchors.reduce((best,i) => distance(p,points[i]) < distance(p,points[best]) ? i : best)
      if (distance(p,points[index]) <= 13) return {region,index}
      if (points.length < 4096) {
        index = -1
        let nearest = 10
        points.forEach((a,i) => {
          const b = points[(i+1)%points.length], dx = (b[0]-a[0])*w, dy = (b[1]-a[1])*h
          const t = Math.max(0,Math.min(1,((p[0]-a[0])*w*dx+(p[1]-a[1])*h*dy)/(dx*dx+dy*dy || 1)))
          const dist = distance(p,[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])])
          if (dist < nearest) { nearest = dist; index = i+1 }
        })
        if (index>=0) return {region,index,insert:true}
      }
      return contains(region) ? {region,index:-1} : null
    }
    for (let i=this.regions.length-1;i>=0;i--) {
      const region=this.regions[i]
      if (region.visible && contains(region)) return {region,index:-1}
    }
    return null
  }
  down(e) {
    if (this.drag || e.button !== 0) return
    const p=this.point(e)
    this.pointer=e.pointerType==='touch' ? null : e
    if (!this.mode?.shape) {
      const hit=this.guideHit(p)
      if (hit) {
        const {region,index,insert}=hit
        const original=insert ? [...region.points.slice(0,index),p,...region.points.slice(index)] : region.points
        this.id=region.id
        this.guide.setPointerCapture(e.pointerId)
        this.drag={pointer:e.pointerId,edit:true,moveOnly:!this.mode,origin:p,index,original,points:original,id:region.id}
        this.refresh()
      }
      return
    }
    this.guide.setPointerCapture(e.pointerId)
    this.drag = {pointer:e.pointerId,path:[p]}
    this.paintGuide()
  }
  move(e) {
    if (this.drag && this.drag.pointer !== e.pointerId) return
    this.pointer=e.pointerType==='touch' ? null : e
    if (!this.drag) { this.paintGuide(false); return }
    if (this.drag.edit) {
      const {origin,index,original} = this.drag, p = this.point(e)
      let dx = p[0]-origin[0], dy = p[1]-origin[1]
      if (this.drag.moveOnly && !this.drag.moved &&
          Math.hypot(dx*this.guide.clientWidth,dy*this.guide.clientHeight)<3) return
      this.drag.moved = true
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
      if (this.drag.moveOnly) {
        this.drag.offset = dx!==0 || dy!==0
        if (this.renderer) this.renderer.moving = this.live() ? {id:this.drag.id,x:dx,y:dy} : null
      }
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
      const {points,moveOnly,offset} = this.drag, [, ,w,h] = regionBounds(points)
      this.cancelDrag()
      if ((moveOnly && !offset) || w*this.guide.width < 4 || h*this.guide.height < 4) { this.paintGuide(); return }
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
    this.note('')
    this.changed()
    if (!target) document.getElementById('addSectorEffect').scrollIntoView({block:'nearest'})
  }
  handles(points) {
    const step = Math.ceil(points.length/16)
    return points.map((_,i) => i).filter(i => i%step === 0)
  }
  paintGuide(force=true) {
    const {ctx,guide} = this, w = guide.width, h = guide.height
    const selected=this.selected()
    const hit=!this.drag && this.pointer && this.guideHit(this.point(this.pointer,true))
    let state='empty'
    let hint=selected?.visible ? 'Arrastrá el interior para mover' : ''
    if (this.mode?.shape) {
      state='draw'
      hint='Dibujá '+this.mode.shape.toLowerCase()
    } else if (this.drag) {
      state='dragging'
      hint=this.drag.index<0 ? 'Moviendo sector' : 'Deformando sector'
    } else if (this.mode?.edit) {
      state='deform'
      if (hit?.insert) state='insert'
      else if (hit) state=hit.index<0 ? 'move' : 'handle'
      hint='Arrastrá un punto o un borde'
    } else if (hit) state='grab'
    const hovered=hit?.region
    if (!force && guide.dataset.gesture===state && hovered===this.hovered) return
    this.hovered=hovered
    guide.dataset.gesture=state
    document.getElementById('touchGuideHint').textContent=hint
    ctx.clearRect(0,0,w,h)
    if (hovered && hovered!==selected) {
      traceRegion(ctx,hovered.points,w,h)
      ctx.setLineDash([]); ctx.fillStyle='#ffffff18'; ctx.fill('evenodd')
      ctx.strokeStyle='#101210'; ctx.lineWidth=3*devicePixelRatio; ctx.stroke()
      ctx.strokeStyle='#ffffff'; ctx.lineWidth=1.5*devicePixelRatio; ctx.stroke()
    }
    let points=selected?.visible || this.mode?.edit ? selected?.points : null
    if (this.drag) points=this.drag.edit ? this.drag.points : regionPoints(this.mode.shape,this.drag.path,w,h)
    if (!points) return
    traceRegion(ctx, points,w,h)
    if (this.drag?.edit) { ctx.fillStyle='#c6fc5528'; ctx.fill('evenodd') }
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
    else this.refresh()
  }
  apply() {
    if (!this.dirty || !this.renderer) return
    const working = this.principal.fx.some(f=>f.enabled!==false) ? [this.principal,...this.regions] : this.regions
    const copyLayer = layer => ({...layer,[layerOrigin]:layer,fx:layer.fx.map(f => ({...f,[effectOrigin]:f}))})
    const next = working.map(s => ({...copyLayer(s),style:s.style && {...s.style},layers:s.layers?.map(copyLayer)}))
    const issue = document.getElementById('layerIssue')
    try { this.renderer.set(next) }
    catch (err) {
      issue.textContent='No se aplicó el cambio. '+err.message
      issue.hidden=false
      this.refresh()
      return
    }
    issue.hidden=true
    this.applied = next
    this.dirty = false
    this.cleanFiles()
    this.note('')
    this.refresh()
  }
  cleanFiles() {
    for (const file of this.files) {
      if (![...this.regions,...this.applied].some(s=>sectorLayers(s).some(l=>l.file===file))) {
        file.clear(); this.files.delete(file)
      }
    }
  }
  refreshLayerControls(region,layer) {
    const $ = id => document.getElementById(id), list = $('sectorLayerList')
    const layers = sectorLayers(region), index = layers.indexOf(layer)
    const key = JSON.stringify([region.id,layers.map(sectorLayerId),index])
    if (list.dataset.state!==key) {
      list.dataset.state=key
      const focused = list.contains(document.activeElement)
      list.replaceChildren(...layers.slice().reverse().map(item=>{
        const button = document.createElement('button')
        button.textContent = sectorLayerLabel(item)
        button.setAttribute('aria-pressed',item===layer)
        button.onclick = () => {
          this.layerSelection.set(region,sectorLayerId(item))
          this.refresh()
        }
        return button
      }))
      if (focused) list.querySelector('[aria-pressed=true]')?.focus({preventScroll:true})
    }
    $('sectorLayerActions').hidden = index===0
    $('raiseSectorLayer').disabled = index===layers.length-1
    $('lowerSectorLayer').disabled = index<=1
    const style = sectorStyle(region)
    for (const [key,type] of [['fill','Fill'],['stroke','Stroke']]) {
      $('sector'+type+'Toggle').setAttribute('aria-pressed',style[key+'On'])
      $('sector'+type+'Controls').hidden = !style[key+'On']
      $('sector'+type+'Color').value=style[key]
      $('sector'+type+'Sample').style.backgroundColor=style[key]
    }
    $('sectorStrokeWidth').value=style.strokeWidth
    $('sectorStrokeValue').value=style.strokeWidth+' px'
    paintRange($('sectorStrokeWidth'))
  }
  refresh() {
    const $ = id => document.getElementById(id)
    const s = this.selected()
    this.onUpdate(s)
    for (const b of $('sectorShapes').children) b.setAttribute('aria-pressed',this.mode?.shape === b.textContent)
    $('sectorEdit').hidden = !s
    $('effectTarget').textContent = sectorLabel(s)
    if (s) {
      const layer = this.content(s)
      this.refreshLayerControls(s,layer)
      $('sectorDeform').setAttribute('aria-pressed',!!this.mode?.edit)
      $('sectorOpacity').value = Math.round((layer.opacity ?? 1)*100)
      $('opacityValue').value = $('sectorOpacity').value+'%'
      paintRange($('sectorOpacity'))
      $('sectorRaise').disabled = s === this.regions.at(-1)
      for (const b of document.querySelectorAll('[data-sector-src]')) b.setAttribute('aria-pressed',b.dataset.sectorSrc === layer.source)
      $('sectorFileButton').setAttribute('aria-pressed',layer.source === 'file')
      $('sectorFileButton').textContent = layer.file?.current?.file?.name || 'Foto o video'
      $('sectorCamera').hidden = layer.source !== 's0' || !!this.input()
      $('sectorSourceActions').hidden = layer.source === 'sketch'
      $('sectorDisconnect').hidden = layer.source!=='s0' || !this.input()
      $('sectorPaint').setAttribute('aria-pressed',layer.paint)
      $('sectorBrushInverse').setAttribute('aria-pressed',!!layer.brushInverse)
      $('sectorBrushControl').hidden = !layer.paint
      for (const [control,key,output,fallback] of [['sectorBrushSize','brushSize','sectorBrushValue',.42],
        ['sectorBrushSpeed','brushSpeed','sectorSpeedValue',1],['sectorBrushDetail','brushDetail','sectorDetailValue',.65]]) {
        $(control).value = Math.round((layer[key] ?? fallback)*100)
        $(output).value = $(control).value+'%'
        paintRange($(control))
      }
      if (this.codeTarget !== layer) {
        $('sectorCode').value = layer.code || ''
        this.panel(null)
        this.codeTarget = layer
      }
    }
    const target = this.target()
    for (const b of $('sectorFx').children) b.setAttribute('aria-pressed',
      target.fx.some(f=>f.enabled!==false && (f.preset===b.textContent || (!f.kind && f.name===b.textContent))))
    this.renderEffects(target)
    this.paintGuide()
  }
  renderEffects(target) {
    const root = document.getElementById('sectorControls')
    const s = target
    const region = this.selected() || this.principal
    const appliedRegion = this.applied.find(layer=>layer.id===region.id)
    const rendered = this.appliedLayer(s)
    const entries = s.fx.map((fx,i) => {
        const row = document.createElement('div'), label = document.createElement('label'), slider = document.createElement('input'),
          remove = document.createElement('button'), val = document.createElement('output')
        const applied = rendered?.fx.find(effect=>effect[effectOrigin]===fx)
        const playing = applied && applied.enabled!==false && appliedRegion?.visible
        const current = playing ? 'En salida' : fx.enabled===false ? 'Pausado' : appliedRegion?.visible===false ? 'Sector oculto' : 'Pendiente'
        const queued = this.dirty && playing && (fx.enabled===false || applied.code!==fx.code ||
          applied.value!==fx.value || rendered.fx.indexOf(applied)!==i)
        row.className = 'mixer-effect'
        row.dataset.playing=!!playing
        const heading = document.createElement('strong'), status = document.createElement('span')
        heading.textContent=fx.name; status.textContent=queued ? 'Cambio pendiente' : current
        status.className='effect-status'
        slider.type = 'range'
        if (fx.kind==='operator') {
          slider.type='text'; slider.value=fx.code; slider.spellcheck=false
          slider.onchange=()=>{
            fx.code=slider.value.trim(); this.changed()
          }
        } else {
          const [,min,max,step] = fx.kind==='library' ? [.5,0,1,.01] : sectorEffects[fx.name]
          Object.assign(slider,{min,max,step,value:fx.value})
          const format = value => fx.kind==='library' ? Math.round(value*100)+'%' : String(value)
          val.value = format(fx.value)
          paintRange(slider)
          this.effectControls.set(fx, value => {
            slider.value = value
            val.value = format(value)
            paintRange(slider)
            if (!this.live() && playing) status.textContent='En salida · pendiente'
          })
          slider.oninput = () => this.effectAmount(s,i,Number(slider.value))
        }
        slider.setAttribute('aria-label',fx.kind==='library' ? 'Mezcla de '+fx.name : 'Parámetro de '+fx.name)
        remove.textContent = '×'; remove.setAttribute('aria-label','Quitar ' + fx.name + (region.id ? ' del sector' : ' de toda la visual'))
        remove.title = remove.getAttribute('aria-label')
        remove.onclick = () => { s.fx.splice(i,1); this.changed() }
        const enabled=document.createElement('button')
        const indicator=document.createElement('span')
        indicator.className='switch'
        enabled.className='effect-switch auto'
        enabled.append(indicator)
        enabled.setAttribute('aria-label','Activación de '+fx.name)
        enabled.setAttribute('aria-pressed',fx.enabled!==false)
        enabled.onclick=()=>{fx.enabled=fx.enabled===false; this.changed()}
        const controls=document.createElement('div')
        controls.className='effect-commands'
        for (const [direction,arrow,action] of [[-1,'↑','Subir'],[1,'↓','Bajar']]) {
          const move=document.createElement('button')
          move.textContent=arrow
          move.disabled=!s.fx[i+direction]
          move.title=action+' en la cadena'
          move.setAttribute('aria-label',action+' '+fx.name+' en la cadena')
          move.onclick=()=>{ s.fx.splice(i+direction,0,s.fx.splice(i,1)[0]); this.changed() }
          controls.append(move)
        }
        controls.append(remove)
        const header=document.createElement('div')
        header.className='effect-row-heading'
        header.append(enabled,heading,status,controls)
        label.className='effect-parameter'
        label.append(slider,val)
        row.append(header,label)
        return row
    })
    for (const previous of rendered?.fx || []) {
      if (!appliedRegion?.visible || previous.enabled===false || s.fx.includes(previous[effectOrigin])) continue
      const pending=document.createElement('p')
      pending.className='effect-pending'
      pending.textContent=previous.name+' · en salida hasta aplicar'
      entries.push(pending)
    }
    root.replaceChildren(...entries)
  }
  async store(mode, action) {
    return studioStore(mode, action)
  }
  snapshot(includePrincipal = true) {
    const regions = includePrincipal && this.principal.fx.length ? [this.principal,...this.regions] : this.regions
    const content = ({layerId,opacity,source,paint,brushSize,brushSpeed,brushDetail,brushInverse,code,fx,file}) =>
      ({layerId,opacity:opacity ?? 1,source,paint,brushSize:brushSize ?? .42,brushSpeed,brushDetail,brushInverse,code,fx,file:file?.current?.file})
    return regions.map(s=>({id:s.id,shape:s.shape,points:s.points,visible:s.visible,style:s.style,
      ...content(s),layers:s.layers?.map(content)}))
  }
  async save() {
    await this.store('readwrite',s => s.put(this.snapshot(false),'actual'))
    this.note('Sectores y archivos guardados en este navegador.')
  }
  async restore() {
    const data = await this.store('readonly',s => s.get('actual'))
    if (!data) { this.note('Todavía no guardaste sectores.'); return }
    this.install(await this.prepare(data),undefined,true)
  }
  async prepare(data) {
    const next = [], opened = []
    try {
      for (const entry of data) {
        const region = {...entry,layers:entry.layers?.map(layer=>({...layer}))}
        for (const layer of sectorLayers(region)) {
          const file = layer.file
          layer.file = null
          if (file) {
            layer.file = new VisualInput(() => {},() => {},() => {})
            opened.push(layer.file)
            await layer.file.open('file',{file})
          }
        }
        next.push(region)
      }
    } catch (e) { opened.forEach(s => s.clear()); throw e }
    return next
  }
  install(next,selection,keepPrincipal = false) {
    for (const layer of next.flatMap(sectorLayers)) if (layer.file) this.files.add(layer.file)
    if (!keepPrincipal) this.principal = next.find(s=>s.id===0) || this.makePrincipal()
    this.regions = next.filter(s=>s.id!==0)
    this.id = this.regions.find(s=>s.id===selection)?.id ?? this.regions.at(-1)?.id
    this.nextId = Math.max(0,...this.regions.map(s => s.id))+1
    this.mode = null
    this.cancelDrag()
    this.changed()
  }
}
