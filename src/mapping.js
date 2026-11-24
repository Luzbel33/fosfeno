import { formats, identity, pattern, projectionRenderer, projectorToCamera } from './mapping-output.mjs'
import { blankMap, packMap, unpackMap } from './mapping-project.mjs'

const $ = id => document.getElementById(id)
const make = tag => document.createElement(tag)
const surface = $('mapSurface'), viewport = $('mapViewport'), preview = $('mapPreview')
const guide = preview.getContext('2d'), reference = $('mapReference')
const artwork = make('canvas').getContext('2d'), ink = make('canvas').getContext('2d')
const targets = make('canvas').getContext('2d')
const history = [], future = [], media = new Map()
const mapKey = ['mapping', 'draft']
const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n))
let scene = blankMap, matrix = identity, selected = null, tool = 'select', brushLayer = null
let brushStyle = 'neon', brushColor = '#a9ff50', pending = null, gesture = null
let projection = null, blackout = false, calibration = null, frozen, lastCamera, lastReference
let dirty = true, clock = window, frame = 0, lastFrame = 0, active = true, loadRevision = 0
let hydraConnection

function status(message, error = false) {
  $('mapStatus').textContent = message || ''
  $('mapStatus').dataset.error = error
}
function errorStatus(error) { status(error.message || String(error), true) }
function button(label, action) {
  const el = make('button')
  el.type = 'button'
  el.textContent = label
  el.onclick = action
  return el
}

function studio() {
  try { return typeof opener?.connectFosfenoMapping === 'function' ? opener : null }
  catch { return null }
}
const studioWindow = studio()
if (studioWindow) $('mapStudio').onclick = event => {
  if (!studioWindow.closed) {
    event.preventDefault()
    studioWindow.focus()
  }
}

function showReference() {
  const element = frozen || camera.current?.element
  reference.replaceChildren(...(element ? [element] : []))
  $('mapClearReference').hidden = camera.current?.kind !== 'file'
  $('mapFreeze').hidden = camera.current?.kind !== 'camera'
  $('mapFreeze').textContent = frozen ? 'Volver a cámara' : 'Congelar vista'
  $('mapFreeze').setAttribute('aria-pressed', String(!!frozen))
  $('mapEmpty').hidden = !!element || !!scene.layers.length || tool !== 'select' || !!calibration
}

const camera = new VisualInput(() => {}, input => {
  frozen = null
  const id = input?.stream?.getVideoTracks()[0]?.getSettings().deviceId
  const previousReference = lastReference
  if (input?.kind === 'camera') lastReference = 'camera'
  else if (input) lastReference = input.file
  $('mapCamera').textContent = id || input?.kind === 'camera' ? 'Desconectar cámara' : 'Conectar cámara'
  if (input) {
    const element = input.element
    const aspect = clamp((element.videoWidth || element.naturalWidth || element.width) /
      (element.videoHeight || element.naturalHeight || element.height), .2, 5)
    const moved = previousReference && previousReference !== lastReference ||
      (id && lastCamera && lastCamera !== id) || Math.abs(scene.aspect - aspect) > .01
    if (moved) {
      if (calibration) calibration = []
      if (scene.calibration || scene.aspect !== aspect) {
        assignGeometry({ aspect, calibration: null })
        if (!calibration && scene.layers.length) referenceNotice = 'Cambió la referencia. Volvé a calibrar antes de proyectar.'
      }
    }
    lastCamera = id
  } else if (calibration) calibration = []
  showReference()
  if (calibration) sync()
  listCameras()
}, message => {
  $('mapCamera').textContent = camera.pending ? 'Cancelar conexión' :
    camera.current?.kind === 'camera' ? 'Desconectar cámara' : 'Conectar cámara'
  status(message || referenceNotice)
  referenceNotice = ''
})
let referenceNotice = ''

async function listCameras() {
  const devices = await cameraDevices().catch(() => [])
  const selectedId = camera.current?.stream?.getVideoTracks()[0]?.getSettings().deviceId
  const choices = devices.filter(device => device.deviceId)
  $('mapCameraChoices').hidden = !choices.length || (!selectedId && choices.length === 1)
  $('mapCameraLabel').textContent = choices.find(device => device.deviceId === selectedId)?.label || 'Elegir cámara'
  $('mapCameraList').replaceChildren(...choices.map((device, i) => {
    const item = button(device.label || 'Cámara ' + (i + 1), () => {
      $('mapCameraChoices').open = false
      if (device.deviceId !== selectedId) camera.open('camera', { choice: device.deviceId }).catch(() => {})
    })
    item.setAttribute('aria-pressed', String(device.deviceId === selectedId))
    return item
  }))
}
$('mapCamera').onclick = () => {
  if (camera.pending) {
    camera.cancel()
    $('mapCamera').textContent = camera.current?.kind === 'camera' ? 'Desconectar cámara' : 'Conectar cámara'
    status('Conexión cancelada.')
  } else if (camera.current?.kind === 'camera') camera.clear()
  else camera.open('camera').catch(() => {})
}
$('mapClearReference').onclick = () => camera.clear()
$('mapFreeze').onclick = () => {
  if (frozen) frozen = null
  else {
    const video = camera.current.element
    frozen = make('canvas')
    frozen.width = video.videoWidth
    frozen.height = video.videoHeight
    frozen.getContext('2d').drawImage(video, 0, 0)
  }
  showReference()
}
navigator.mediaDevices?.addEventListener?.('devicechange', listCameras)
listCameras()

function sizeCanvases() {
  const css = getComputedStyle(viewport)
  const width = viewport.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)
  const height = viewport.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom)
  const visibleWidth = Math.max(1, Math.min(width, height * scene.aspect))
  surface.style.width = visibleWidth + 'px'
  surface.style.aspectRatio = scene.aspect
  viewport.style.setProperty('--map-aspect', scene.aspect)
  const w = Math.round(Math.min(1280, 960 * scene.aspect))
  const h = Math.round(w / scene.aspect)
  for (const { canvas } of [guide, artwork, ink]) {
    if (canvas.width === w && canvas.height === h) continue
    canvas.width = w
    canvas.height = h
  }
  const [pw, ph] = formats[scene.format]
  for (const canvas of [targets.canvas, projection?.canvas].filter(Boolean)) {
    if (canvas.width === pw && canvas.height === ph) continue
    canvas.width = pw
    canvas.height = ph
  }
  dirty = true
}
new ResizeObserver(sizeCanvases).observe(viewport)

function activeLayer() { return scene.layers.find(layer => layer.id === selected) }
function sync() {
  const layer = activeLayer()
  showReference()
  $('mapBrushOptions').hidden = tool !== 'brush' || !!calibration
  $('mapUndo').disabled = !history.length || !!calibration
  $('mapRedo').disabled = !future.length || !!calibration
  $('mapCalibrateBar').hidden = !calibration
  $('mapBackPoint').disabled = !calibration?.length
  $('mapCalibrate').textContent = scene.calibration ? 'Recalibrar' : 'Calibrar'
  $('mapBlackout').setAttribute('aria-pressed', String(blackout))
  $('mapOutput').textContent = projection ? 'Ver proyector' : 'Abrir proyector'
  $('mapState').textContent = blackout ? 'Apagón' : calibration ? 'Patrón de calibración' :
    scene.calibration ? 'Calibrado' : 'Sin calibrar · salida directa'
  $('mapState').dataset.aligned = !!scene.calibration && !blackout && !calibration
  $('mapFormatLabel').textContent = scene.format
  for (const el of document.querySelectorAll('[data-tool],[data-brush],[data-mask],[data-format]')) {
    const chosen = el.dataset.tool || el.dataset.brush || el.dataset.mask || el.dataset.format
    el.setAttribute('aria-pressed', String([tool, brushStyle, layer?.mask, scene.format].includes(chosen)))
  }
  if (calibration) {
    $('mapCalibrateStep').textContent = camera.current ?
      'Marcá el centro de la cruz ' + (calibration.length + 1) + ' de 4' :
      'Conectá la cámara o cargá una foto con las cuatro cruces'
    pattern(targets, calibration.length)
  }
  $('mapLayerControls').hidden = !layer
  $('mapMasks').hidden = layer?.kind === 'ink'
  if (layer) {
    const i = scene.layers.indexOf(layer)
    $('mapOpacity').value = Math.round(layer.opacity * 100)
    $('mapOpacityValue').value = $('mapOpacity').value + '%'
    $('mapLayerUp').disabled = i === scene.layers.length - 1
    $('mapLayerDown').disabled = i === 0
  }
  renderLayers()
  setCursor()
  dirty = true
}

function renderLayers() {
  const focused = document.activeElement
  const focusId = focused?.closest('.map-layer')?.dataset.id
  const focusClass = focused?.className
  let focus
  const rows = scene.layers.slice().reverse().map(layer => {
    const row = make('div')
    row.className = 'map-layer'
    row.dataset.id = layer.id
    row.dataset.selected = layer.id === selected
    const choose = button(layer.name, () => selectLayer(layer))
    choose.className = 'map-layer-name'
    choose.title = layer.name
    choose.setAttribute('aria-pressed', String(layer.id === selected))
    const visibility = button(layer.visible ? 'Ocultar' : 'Mostrar', () => editLayer(layer, { visible: !layer.visible }))
    visibility.className = 'map-layer-visibility'
    visibility.setAttribute('aria-label', visibility.textContent + ' ' + layer.name)
    row.append(choose, visibility)
    if (focusId === layer.id) focus = focusClass === visibility.className ? visibility : choose
    return row
  })
  if (!rows.length) {
    const empty = make('p')
    empty.textContent = 'Los trazos y recortes aparecen acá.'
    rows.push(empty)
  }
  $('mapLayers').replaceChildren(...rows)
  focus?.focus({ preventScroll: true })
}

function assign(next) {
  const resized = scene.aspect !== next.aspect || scene.format !== next.format
  scene = next
  matrix = next.calibration ? projectorToCamera(next.calibration) : identity
  if (!activeLayer()) selected = null
  if (resized) sizeCanvases()
  sync()
  updateSources()
}
function assignGeometry(geometry) {
  // A composition undo must not reactivate an alignment for a moved camera.
  for (const stack of [history, future])
    stack.forEach((entry, index) => { stack[index] = { ...entry, ...geometry } })
  assign({ ...scene, ...geometry })
}
function apply(next) {
  history.push(scene)
  if (history.length > 30) history.shift()
  future.length = 0
  assign(next)
}
function step(back) {
  if (calibration || gesture) return
  const from = back ? history : future, to = back ? future : history
  if (!from.length) return
  to.push(scene)
  assign(from.pop())
}
function selectLayer(layer) {
  selected = layer.id
  brushLayer = layer.kind === 'ink' ? layer.id : null
  setTool(layer.kind === 'ink' ? 'brush' : 'select')
}
function editLayer(layer, changes) {
  apply({ ...scene, layers: scene.layers.map(item => item === layer ? { ...layer, ...changes } : item) })
}
function reorder(direction) {
  const layers = [...scene.layers], index = layers.indexOf(activeLayer())
  const other = index + direction
  if (index < 0 || other < 0 || other >= layers.length) return
  ;[layers[index], layers[other]] = [layers[other], layers[index]]
  apply({ ...scene, layers })
}
function setTool(next, update = true) {
  gesture = null
  if (next !== 'place') {
    loadRevision++
    pending = null
    updateSources()
  }
  tool = next
  if (update) sync()
}
function setCursor(point) {
  const layer = activeLayer()
  surface.dataset.cursor = calibration ? 'calibrate' :
    gesture?.kind === 'move' || gesture?.kind === 'resize' ? gesture.kind :
    tool !== 'select' ? tool :
    point && handleAt(point, layer) ? 'resize' : point && hitAt(point) ? 'grab' : 'select'
}

function nextLayer(kind, name) {
  return { id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), kind, name, opacity: 1, visible: true }
}
function addLayer(layer) {
  selected = layer.id
  apply({ ...scene, layers: [...scene.layers, layer] })
}

function openAsset(file) {
  if (media.has(file)) return media.get(file)
  const input = new VisualInput(() => {}, () => { dirty = true }, () => {})
  const ready = input.open('file', { file }).catch(error => {
    status('No se pudo abrir «' + file.name + '». ' + error.message, true)
    return false
  })
  const asset = { input, ready }
  media.set(file, asset)
  return asset
}
function updateSources() {
  const assets = new Set()
  for (const map of [scene, ...history, ...future])
    for (const layer of map.layers) if (layer.file) assets.add(layer.file)
  if (pending?.file) assets.add(pending.file)
  for (const [file, asset] of media) {
    if (!assets.has(file) && !asset.placing) {
      asset.input.clear()
      media.delete(file)
    }
  }
  for (const file of assets) openAsset(file)
  const visibleAssets = new Set(scene.layers.filter(layer => layer.visible).map(layer => layer.file))
  for (const [file, { input, ready }] of media) ready.then(() => {
    const video = input.current?.element
    if (!(video instanceof HTMLVideoElement) || !active || media.get(file)?.input !== input) return
    const inUse = scene.layers.some(layer => layer.file === file && layer.visible)
    if (inUse) video.play().catch(errorStatus)
    else if (!visibleAssets.has(file)) video.pause()
  })
  const useHydra = pending?.kind === 'hydra' || scene.layers.some(layer => layer.kind === 'hydra' && layer.visible)
  if (useHydra && studio()) connectHydra()
  else if (!useHydra) disconnectHydra()
}

const hydraVideo = make('video')
hydraVideo.muted = hydraVideo.playsInline = true
function connectHydra() {
  if (hydraConnection) return
  try {
    const parent = studio()
    if (!parent) throw new Error('Abrí Mapeo desde el Estudio Hydra para usar su señal en vivo.')
    const connection = parent.connectFosfenoMapping(window, () => projection?.window)
    hydraConnection = connection
    hydraVideo.srcObject = connection.stream
    connection.stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (hydraConnection === connection) signalLost()
    }, { once: true })
    hydraVideo.play().catch(errorStatus)
  } catch (error) { errorStatus(error) }
}
function disconnectHydra() {
  try { hydraConnection?.close() } catch {}
  hydraConnection = null
  hydraVideo.srcObject = null
  dirty = true
}
function signalLost() {
  disconnectHydra()
  status('Se cerró el estudio. Las capas Hydra esperan una señal en vivo.', true)
}

async function placeFile(file) {
  if (!file?.size || !/^(image|video)\//.test(file.type)) {
    status('Elegí una imagen o un video que el navegador pueda abrir.', true)
    return
  }
  const ticket = ++loadRevision
  const asset = openAsset(file)
  asset.placing = true
  status('Abriendo «' + file.name + '»…')
  const ready = await asset.ready
  asset.placing = false
  if (ready && ticket === loadRevision && active) place({ ...nextLayer('file', file.name), file })
  else updateSources()
}
function place(layer) {
  if (calibration) endCalibration()
  pending = { ...layer, mask: 'rect' }
  setTool('place')
  updateSources()
  status('Arrastrá para definir el área. Un toque coloca un recorte centrado ahí.')
}

function hitAt([x, y]) {
  return scene.layers.findLast(layer => {
    if (!layer.visible || !layer.rect) return false
    const [left, top, w, h] = layer.rect
    if (layer.mask === 'ellipse') return ((x - left - w / 2) / (w / 2)) ** 2 + ((y - top - h / 2) / (h / 2)) ** 2 <= 1
    return x >= left && y >= top && x <= left + w && y <= top + h
  })
}
function handleAt(point, layer) {
  if (!layer?.visible || !layer.rect) return false
  const [x, y, w, h] = layer.rect
  return Math.abs(point[0] - x - w) * surface.clientWidth < 17 &&
    Math.abs(point[1] - y - h) * surface.clientHeight < 17
}
function pointer(event) {
  const rect = preview.getBoundingClientRect()
  return [clamp((event.clientX - rect.left) / rect.width), clamp((event.clientY - rect.top) / rect.height)]
}
function area(start, end) {
  const [x, y] = start, [u, v] = end
  return [Math.min(x, u), Math.min(y, v), Math.abs(x - u), Math.abs(y - v)]
}
function gestureRect() {
  const { start, end, kind, layer } = gesture
  if (kind === 'place') return area(start, end)
  const [x, y, w, h] = layer.rect
  if (kind === 'resize') return [x, y, clamp(end[0] - x, .02, 1 - x), clamp(end[1] - y, .02, 1 - y)]
  return [clamp(x + end[0] - start[0], 0, 1 - w), clamp(y + end[1] - start[1], 0, 1 - h), w, h]
}
function mark(point) {
  calibration.push(point)
  if (calibration.length < 4) return sync()
  const points = calibration
  if (!projectorToCamera(points)) {
    calibration = []
    sync()
    return status('No se pudo alinear. Marcá las cruces del 1 al 4 en orden y verificá que se vean las cuatro.', true)
  }
  calibration = null
  assignGeometry({ calibration: points })
  status('Alineación aplicada. Dibujá sobre la vista de la superficie.')
}
surface.onpointerdown = event => {
  if (event.button !== 0 || !event.isPrimary || gesture || event.target.closest('button')) return
  const at = pointer(event)
  if (calibration) {
    if (!camera.current) return
    gesture = { kind: 'mark', id: event.pointerId, start: at }
  } else if (tool === 'brush') {
    const stroke = { color: brushColor, style: brushStyle, size: Number($('mapBrushSize').value), points: [at] }
    gesture = { kind: 'brush', id: event.pointerId, stroke, target: brushLayer }
  } else if (tool === 'place') {
    gesture = { kind: 'place', id: event.pointerId, start: at, end: at }
  } else {
    const current = activeLayer(), resize = handleAt(at, current)
    const layer = resize ? current : hitAt(at)
    selected = layer?.id || null
    if (layer) gesture = { kind: resize ? 'resize' : 'move', id: event.pointerId, start: at, end: at, layer }
    sync()
  }
  if (gesture) surface.setPointerCapture(event.pointerId)
  setCursor(at)
  dirty = true
}
surface.onpointermove = event => {
  const at = pointer(event)
  if (gesture?.id === event.pointerId && gesture.kind !== 'mark') {
    if (gesture.kind === 'brush') {
      const { points } = gesture.stroke
      const last = points.at(-1)
      if (Math.hypot((at[0] - last[0]) * preview.width, (at[1] - last[1]) * preview.height) >= 1.5)
        points.push(at)
    } else gesture.end = at
    dirty = true
  }
  setCursor(at)
}
surface.onpointerleave = () => { if (!gesture) setCursor() }
surface.onpointerup = event => {
  if (gesture?.id !== event.pointerId) return
  const at = pointer(event)
  const done = gesture
  done.end = at
  const rect = ['place', 'move', 'resize'].includes(done.kind) ? gestureRect() : null
  gesture = null
  if (done.kind === 'mark' && calibration) mark(at)
  if (done.kind === 'brush') {
    const target = scene.layers.find(layer => layer.id === done.target && layer.visible)
    if (target) editLayer(target, { strokes: [...target.strokes, done.stroke] })
    else {
      const n = scene.layers.filter(layer => layer.kind === 'ink').length + 1
      const layer = { ...nextLayer('ink', 'Trazos ' + n), strokes: [done.stroke] }
      brushLayer = layer.id
      addLayer(layer)
    }
  }
  if (done.kind === 'place' && pending) {
    const [x, y] = at
    const bounds = rect[2] >= .02 && rect[3] >= .02 ? rect :
      [clamp(x - .18, 0, .64), clamp(y - .16, 0, .68), .36, .32]
    const layer = { ...pending, rect: bounds }
    pending = null
    tool = 'select'
    addLayer(layer)
    status('Recorte colocado. Arrastrá desde el interior para moverlo.')
  }
  if (rect && done.layer && rect.some((value, i) => value !== done.layer.rect[i])) editLayer(done.layer, { rect })
  setCursor(at)
  dirty = true
}
function cancelGesture(event) {
  if (gesture?.id !== event.pointerId) return
  gesture = null
  setCursor()
  dirty = true
}
surface.onpointercancel = surface.onlostpointercapture = cancelGesture

function drawStroke(ctx, stroke) {
  const { points, style, color, size } = stroke
  const w = ctx.canvas.width, h = ctx.canvas.height
  const thickness = size * Math.max(w, h) / 1280
  ctx.strokeStyle = ctx.fillStyle = color
  const dot = (x, y, r) => {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  if (style === 'dots') {
    let [x, y] = [points[0][0] * w, points[0][1] * h], carry = 0
    const interval = thickness * 1.75
    dot(x, y, thickness / 2)
    for (const [u, v] of points.slice(1)) {
      const nx = u * w, ny = v * h, distance = Math.hypot(nx - x, ny - y)
      for (let step = interval - carry; step <= distance; step += interval)
        dot(x + (nx - x) * step / distance, y + (ny - y) * step / distance, thickness / 2)
      carry = (carry + distance) % interval
      x = nx
      y = ny
    }
    return
  }
  ctx.lineCap = ctx.lineJoin = 'round'
  ctx.lineWidth = thickness
  if (style === 'neon') {
    ctx.shadowBlur = Math.min(38, thickness * 1.7)
    ctx.shadowColor = color
    ctx.strokeStyle = ctx.fillStyle = '#ffffff'
  }
  if (points.length === 1) dot(points[0][0] * w, points[0][1] * h, thickness / 2)
  else {
    ctx.beginPath()
    ctx.moveTo(points[0][0] * w, points[0][1] * h)
    for (const [x, y] of points.slice(1)) ctx.lineTo(x * w, y * h)
    ctx.stroke()
  }
  ctx.shadowBlur = 0
}

const inkCache = new Map()
function inkLayer(layer, transient) {
  const { width, height } = ink.canvas
  let cached = inkCache.get(layer.id)
  if (!cached || cached.canvas.width !== width || cached.canvas.height !== height) {
    const ctx = make('canvas').getContext('2d')
    ctx.canvas.width = width
    ctx.canvas.height = height
    cached = { ctx, canvas: ctx.canvas, strokes: [] }
    inkCache.set(layer.id, cached)
  }
  if (cached.strokes !== layer.strokes) {
    const append = cached.strokes.every((stroke, i) => layer.strokes[i] === stroke)
    if (!append) cached.ctx.clearRect(0, 0, width, height)
    for (const stroke of layer.strokes.slice(append ? cached.strokes.length : 0)) drawStroke(cached.ctx, stroke)
    cached.strokes = layer.strokes
  }
  if (!transient) return cached.canvas
  ink.clearRect(0, 0, width, height)
  ink.drawImage(cached, 0, 0)
  drawStroke(ink, transient)
  return ink.canvas
}
function drawMedia(layer, bounds) {
  const el = layer.kind === 'hydra' ? hydraVideo : media.get(layer.file)?.input.current?.element
  if (!el || (el instanceof HTMLVideoElement && el.readyState < 2)) return
  const sw = el.videoWidth || el.naturalWidth || el.width
  const sh = el.videoHeight || el.naturalHeight || el.height
  const w = artwork.canvas.width, h = artwork.canvas.height
  const [x, y, dw, dh] = [bounds[0] * w, bounds[1] * h, bounds[2] * w, bounds[3] * h]
  if (!sw || !sh || !dw || !dh) return
  const scale = Math.max(dw / sw, dh / sh)
  const cw = dw / scale, ch = dh / scale
  artwork.save()
  if (layer.mask === 'ellipse') {
    artwork.beginPath()
    artwork.ellipse(x + dw / 2, y + dh / 2, dw / 2, dh / 2, 0, 0, Math.PI * 2)
    artwork.clip()
  }
  artwork.drawImage(el, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, dw, dh)
  artwork.restore()
}
function drawScene() {
  const { width, height } = artwork.canvas
  artwork.clearRect(0, 0, width, height)
  const stroke = gesture?.kind === 'brush' ? gesture.stroke : null
  for (const id of inkCache.keys()) {
    if (!scene.layers.some(layer => layer.id === id)) inkCache.delete(id)
  }
  for (const layer of scene.layers) {
    if (!layer.visible || layer.opacity === 0) continue
    artwork.globalAlpha = layer.opacity
    if (layer.kind === 'ink') artwork.drawImage(inkLayer(layer, gesture?.target === layer.id ? stroke : null), 0, 0)
    else drawMedia(layer, gesture?.layer === layer ? gestureRect() : layer.rect)
  }
  artwork.globalAlpha = 1
  if (stroke && !scene.layers.some(layer => layer.id === gesture.target && layer.visible)) drawStroke(artwork, stroke)
  if (pending && gesture?.kind === 'place') drawMedia(pending, gestureRect())
}
function drawPreview() {
  const { width, height } = preview
  guide.clearRect(0, 0, width, height)
  if (calibration) {
    guide.font = 'bold 28px sans-serif'
    guide.fillStyle = '#c6fc55'
    for (const [i, [x, y]] of calibration.entries()) {
      guide.beginPath()
      guide.arc(x * width, y * height, 6, 0, Math.PI * 2)
      guide.fill()
      guide.fillText(i + 1, x * width + 12, y * height - 7)
    }
    return
  }
  guide.drawImage(artwork.canvas, 0, 0)
  const layer = activeLayer()
  const rect = gesture && ['move', 'resize', 'place'].includes(gesture.kind) ? gestureRect() :
    tool === 'select' && layer?.visible ? layer.rect : null
  if (!rect) return
  const [x, y, w, h] = [rect[0] * width, rect[1] * height, rect[2] * width, rect[3] * height]
  guide.strokeStyle = guide.fillStyle = '#c6fc55'
  guide.lineWidth = 2
  guide.strokeRect(x, y, w, h)
  const grip = clamp(width / Math.max(1, surface.clientWidth) * 6, 6, 16)
  guide.fillRect(x + w - grip, y + h - grip, grip * 2, grip * 2)
}
function dynamic() {
  return scene.layers.some(layer => layer.visible && (layer.kind === 'hydra' && hydraConnection ||
    media.get(layer.file)?.input.current?.element instanceof HTMLVideoElement))
}
function render(now) {
  frame = 0
  if (!active) return
  if (projection?.window.closed) closeProjection()
  if (hydraConnection && !studio()) signalLost()
  if (dirty || (!calibration && dynamic() && now - lastFrame >= 1000 / 30)) {
    lastFrame = now
    if (!calibration) drawScene()
    drawPreview()
    if (projection) {
      try {
        projection.draw(blackout ? null : calibration ? targets.canvas : artwork.canvas, calibration ? identity : matrix)
      } catch (error) {
        closeProjection(true)
        errorStatus(error)
      }
    }
    dirty = false
  }
  schedule()
}
function schedule() {
  if (!active || frame) return
  const output = projection?.window
  clock = document.hidden && output && !output.closed && !output.document.hidden ? output : window
  frame = clock.requestAnimationFrame(render)
}
function restartClock() {
  if (!clock.closed) clock.cancelAnimationFrame(frame)
  frame = 0
  lastFrame = -Infinity
  schedule()
  try { hydraConnection?.refresh() } catch {}
}
document.addEventListener('visibilitychange', restartClock)

function openProjection() {
  if (projection && !projection.window.closed) return projection.window.focus()
  const output = window.open('', '_blank', 'popup,width=1000,height=620')
  if (!output) return status('Permití la ventana emergente para abrir el proyector.', true)
  try {
    const doc = output.document
    doc.title = 'Fosfeno · Proyector de mapeo'
    doc.body.style.cssText = 'margin:0;background:#000;overflow:hidden'
    const canvas = doc.createElement('canvas')
    canvas.style.cssText = 'display:block;width:100vw;height:100dvh;object-fit:contain;cursor:none'
    doc.body.append(canvas)
    const draw = projectionRenderer(canvas)
    projection = { window: output, canvas, draw }
    canvas.ondblclick = async () => {
      try {
        if (doc.fullscreenElement) await doc.exitFullscreen()
        else await doc.documentElement.requestFullscreen()
      } catch { status('El navegador bloqueó la pantalla completa. Podés maximizar la ventana del proyector.', true) }
    }
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault()
      closeProjection(true)
      status('Se interrumpió WebGL. Volvé a abrir el proyector.', true)
    })
    doc.addEventListener('visibilitychange', restartClock)
    output.addEventListener('pagehide', () => {
      if (projection?.window === output) closeProjection()
    }, { once: true })
    sizeCanvases()
    sync()
    restartClock()
    status('Mové la ventana al proyector y hacé doble clic ahí para entrar en pantalla completa.')
  } catch (error) {
    output.close()
    errorStatus(error)
  }
}
function closeProjection(closeWindow = false) {
  const output = projection?.window
  projection = null
  if (closeWindow) output?.close()
  if (calibration) endCalibration()
  sync()
  if (active && clock !== window) restartClock()
  else try { hydraConnection?.refresh() } catch {}
}
function endCalibration() {
  calibration = null
  gesture = null
  sync()
}
function startCalibration() {
  if (!projection || projection.window.closed) return status('Abrí el proyector y ponelo en pantalla completa para calibrar.', true)
  if (camera.current?.kind === 'camera' && frozen) {
    frozen = null
    showReference()
  }
  setTool('select', false)
  blackout = false
  calibration = []
  sync()
  status(camera.current ? 'Elegí el centro de cada cruz en esta vista.' : 'Patrón listo para fotografiar.')
}

function filePicker(buttonId, inputId, action) {
  const picker = $(inputId)
  $(buttonId).onclick = () => picker.click()
  picker.onchange = () => {
    const file = picker.files[0]
    picker.value = ''
    if (file) Promise.resolve(action(file)).catch(errorStatus)
  }
}
filePicker('mapAddMedia', 'mapMediaFile', placeFile)
filePicker('mapReferenceFile', 'mapPhotoFile', file => {
  if (!file.type.startsWith('image/')) return status('Elegí una imagen como referencia.', true)
  return camera.open('file', { file }).catch(() => {})
})
let mapTransfer = false
filePicker('mapImport', 'mapProjectFile', async file => {
  if (mapTransfer) return
  mapTransfer = true
  $('mapImport').disabled = $('mapSave').disabled = true
  try {
    const next = await unpackMap(file)
    if (calibration) endCalibration()
    camera.clear()
    lastCamera = lastReference = null
    setTool('select', false)
    selected = null
    apply(next)
    status('Mapa abierto. Guardá el mapa si querés recuperarlo al volver.')
  } finally {
    mapTransfer = false
    $('mapImport').disabled = $('mapSave').disabled = false
  }
})
$('mapSave').onclick = async () => {
  if (mapTransfer) return
  mapTransfer = true
  $('mapSave').disabled = $('mapImport').disabled = true
  try {
    await studioStore('readwrite', store => store.put(packMap(scene), mapKey))
    status('Mapa guardado en este navegador.')
  } catch (error) { errorStatus(error) }
  finally {
    mapTransfer = false
    $('mapSave').disabled = $('mapImport').disabled = false
  }
}
$('mapExport').onclick = () => {
  const url = URL.createObjectURL(packMap(scene)), link = make('a')
  link.href = url
  link.download = 'Fosfeno-mapa.fosmap'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

const loopList = $('mapLoopList')
function toggleLoops(open) {
  loopList.hidden = !open
  $('mapLoops').setAttribute('aria-expanded', String(open))
}
$('mapLoops').onclick = async () => {
  const open = loopList.hidden
  toggleLoops(open)
  if (!open) return
  loopList.textContent = 'Cargando loops…'
  try {
    const keys = await studioStore('readonly', store => store.getAllKeys(IDBKeyRange.bound(['loop'], ['loop', []])))
    const rows = keys.reverse().map(key => button(key[3], async () => {
      toggleLoops(false)
      try {
        const file = await studioStore('readonly', store => store.get(key))
        if (!file) throw new Error('Este loop ya no está en la biblioteca.')
        await placeFile(file)
      } catch (error) { errorStatus(error) }
    }))
    if (!rows.length) {
      const empty = make('p')
      empty.textContent = 'Los loops que guardes en el Estudio Hydra aparecen acá.'
      rows.push(empty)
    }
    loopList.replaceChildren(...rows)
  } catch (error) { loopList.textContent = error.message }
}
document.addEventListener('pointerdown', event => {
  if (!loopList.hidden && !event.target.closest('#mapLoopList, #mapLoops')) toggleLoops(false)
  for (const menu of document.querySelectorAll('.map-choice[open]'))
    if (!menu.contains(event.target)) menu.open = false
})

function chooseBrush(newLayer = false) {
  if (calibration) endCalibration()
  const layer = activeLayer()
  brushLayer = !newLayer && layer?.kind === 'ink' ? layer.id : null
  selected = brushLayer
  setTool('brush')
  status('Arrastrá o tocá la superficie para pintar.')
}
$('mapAddHydra').onclick = () => {
  if (!studio()) return status('Abrí Mapeo desde el Estudio Hydra para usar su señal en vivo.', true)
  place(nextLayer('hydra', 'Hydra en vivo'))
}
$('mapStartBrush').onclick = () => chooseBrush()
$('mapNewInk').onclick = () => chooseBrush(true)
$('mapBrushColor').oninput = event => {
  const value = event.target.value
  const valid = /^#[\da-f]{6}$/i.test(value)
  event.target.setAttribute('aria-invalid', String(!valid))
  if (valid) brushColor = value
}
$('mapBrushSize').oninput = event => { $('mapBrushValue').value = event.target.value }
$('mapOutput').onclick = openProjection
$('mapBlackout').onclick = () => {
  if (calibration) endCalibration()
  blackout = !blackout
  sync()
  status(blackout ? 'La salida quedó en negro. Tocá Apagón para volver.' : '')
}
$('mapCalibrate').onclick = startCalibration
$('mapCancel').onclick = () => { endCalibration(); status('Calibración cancelada.') }
$('mapBackPoint').onclick = () => { calibration?.pop(); sync() }
$('mapHelp').onclick = () => {
  const help = $('mapInstructions')
  help.hidden = !help.hidden
  $('mapHelp').setAttribute('aria-expanded', String(!help.hidden))
}
$('mapUndo').onclick = () => step(true)
$('mapRedo').onclick = () => step(false)
$('mapRemoveLayer').onclick = () => apply({ ...scene, layers: scene.layers.filter(layer => layer.id !== selected) })
$('mapLayerUp').onclick = () => reorder(1)
$('mapLayerDown').onclick = () => reorder(-1)
let opacityStart
$('mapOpacity').oninput = event => {
  const layer = activeLayer()
  if (!layer) return
  opacityStart ??= scene
  const value = Number(event.target.value)
  $('mapOpacityValue').value = value + '%'
  scene = { ...scene, layers: scene.layers.map(item => item === layer ? { ...layer, opacity: value / 100 } : item) }
  dirty = true
}
$('mapOpacity').onchange = () => {
  if (!opacityStart) return
  const next = scene
  scene = opacityStart
  opacityStart = null
  apply(next)
}

for (const el of document.querySelectorAll('[data-tool],[data-brush],[data-color],[data-mask],[data-format]')) el.onclick = () => {
  const { tool: next, brush, color, mask, format } = el.dataset
  if (next === 'brush') chooseBrush()
  else if (next) {
    if (calibration) endCalibration()
    setTool(next)
    status('')
  } else if (brush) {
    brushStyle = brush
    sync()
  } else if (color) {
    brushColor = $('mapBrushColor').value = color
    $('mapBrushColor').setAttribute('aria-invalid', 'false')
  } else if (mask && activeLayer()) editLayer(activeLayer(), { mask })
  else if (format) {
    $('mapFormatChoice').open = false
    if (format === scene.format) return
    if (calibration) endCalibration()
    assignGeometry({ format, calibration: null })
    status('Formato actualizado. Calibrá con este formato para alinear la salida.')
  }
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (calibration) $('mapCancel').click()
    else if (!loopList.hidden) { toggleLoops(false); $('mapLoops').focus() }
    else if (tool === 'place' || gesture) { setTool('select'); status('') }
    for (const menu of document.querySelectorAll('.map-choice[open]')) {
      menu.open = false
      menu.querySelector('summary').focus()
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' &&
      !event.target.matches('input,textarea')) {
    event.preventDefault()
    step(!event.shiftKey)
  }
})

window.addEventListener('pagehide', () => {
  active = false
  if (!clock.closed) clock.cancelAnimationFrame(frame)
  frame = 0
  closeProjection(true)
  disconnectHydra()
  camera.clear()
  for (const { input } of media.values()) input.clear()
  media.clear()
})
window.addEventListener('pageshow', event => {
  if (!event.persisted) return
  active = true
  updateSources()
  sync()
  restartClock()
})
sizeCanvases()
sync()
schedule()
const initial = scene
studioStore('readonly', store => store.get(mapKey)).then(async blob => {
  if (!blob) return
  const saved = await unpackMap(blob)
  if (scene !== initial || !active) return
  assign(saved)
  status(saved.layers.some(layer => layer.kind === 'hydra') && !studio() ?
    'Mapa recuperado. Abrí Mapeo desde el Estudio para recuperar la señal Hydra.' : 'Mapa recuperado.')
}).catch(errorStatus)
