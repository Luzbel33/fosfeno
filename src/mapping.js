import { formats, identity, pattern, projectionRenderer, projectorToCamera } from './mapping-output.mjs?v=3.1'
import { blankMap, packMap, unpackMap } from './mapping-project.mjs?v=3.1'
import { rectQuad, quadBounds, mapQuadPoint, validQuad, warpRenderer, coverRect } from './mapping-warp.mjs?v=3.1'
import { transformInfo, transformQuad, offCanvas } from './mapping-transform.mjs?v=3.1'
import { mappingSamples } from './mapping-samples.mjs?v=3.1'
import { makeSolid, solidFaces, solidFaceAt, solidRenderer } from './mapping-solids.mjs?v=3.1'
import { solidInspector } from './mapping-solid-ui.mjs?v=3.1'
import { makePose, poseAnimated } from './pose-3d.mjs?v=3.1'
const draftModelViews=new WeakMap()

const $ = id => document.getElementById(id)
const make = tag => document.createElement(tag)
const surface = $('mapSurface'), viewport = $('mapViewport'), preview = $('mapPreview')
const guide = preview.getContext('2d'), reference = $('mapReference')
const artwork = make('canvas').getContext('2d'), surfaceArt = make('canvas').getContext('2d')
const ink = make('canvas').getContext('2d')
const targets = make('canvas').getContext('2d')
const history = [], future = [], media = new Map()
const mapKey = ['mapping', 'draft']
const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n))
let scene = blankMap, matrix = identity, selected = null, tool = 'brush', brushLayer = null
let brushStyle = 'neon', brushColor = '#a9ff50', brushSize = 12, pending = null, gesture = null
let projection = null, blackout = false, calibration = null, calibrationView, frozen, lastCamera, lastReference
let dirty = true, clock = window, frame = 0, lastFrame = 0, active = true, loadRevision = 0, previewRevision = 0
let hydraConnection
let copiedLayer
let selectedStroke = null, sharedItem = null, loopTarget = null, replaceTarget = null
let historyScope='map', sharedRows=[]
let activeCorner=0, drawWarp
let renderSolid
const solidTools=solidInspector({activeLayer,editLayer,dirty:()=>{dirty=true},sources:()=>sharedRows,
  chooseLoop,openAsset,release:updateSources,error:errorStatus})
let displayView = 'canvas', brushOptionsOpen = false
let shapeName='Rectángulo', showShapeMenu=false, shapeTransformControls=null
// A shape can be undone or prepared in manual mode before it reaches the output.
const automaticShapeFeed=new Set()
let lineDraft = [], lineCursor = null, lineStyleOpen = false

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
  try { return parent !== window && typeof parent.connectFosfenoMapping === 'function' ? parent : null }
  catch { return null }
}
const studioWindow = studio()
const projectorCode = studioWindow?.fosfenoProjectorCode
if (projectorCode) {
  const unbind = projectorCode.bind($('mapShowCode'))
  window.addEventListener('pagehide', event => { if (!event.persisted) unbind() })
} else $('mapShowCode').hidden = true
let sharedReference, sharedAspect

function showReference() {
  const element = frozen || camera.current?.element
  if (reference.firstChild !== (element || null)) reference.replaceChildren(...(element ? [element] : []))
  if (element !== sharedReference || scene.aspect !== sharedAspect) {
    sharedReference = element
    sharedAspect = scene.aspect
    studioWindow?.updateFosfenoMapping(element, scene.aspect)
  }
  $('mapClearReference').hidden = camera.current?.kind !== 'file'
  $('mapFreeze').hidden = camera.current?.kind !== 'camera'
  $('mapFreeze').textContent = frozen ? 'Volver a cámara' : 'Congelar vista'
  $('mapFreeze').setAttribute('aria-pressed', String(!!frozen))
  reference.hidden = displayView!=='surface' && !calibration
  document.querySelector('[data-map-view="surface"]').hidden=!element && !calibration
  const state = $('mapReferenceState')
  state.textContent = frozen ? 'Cámara congelada' : camera.current?.kind==='camera' ? 'Cámara en vivo' :
    element ? 'Foto de referencia' : camera.pending ? 'Conectando cámara…' : 'Cámara desconectada'
  state.dataset.live = !!element && !frozen && camera.current?.kind==='camera'
}

const camera = new VisualInput(() => {}, input => {
  frozen = null
  const id = input?.stream?.getVideoTracks()[0]?.getSettings().deviceId
  const previousReference = lastReference
  if (input?.kind === 'camera') lastReference = 'camera'
  else if (input) lastReference = input.file
  $('mapCamera').textContent = input?.kind === 'camera' ? 'Desconectar cámara' : 'Conectar cámara'
  if (input) {
    displayView='surface'
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
  } else {
    if (calibration) calibration = []
    if (displayView==='surface') displayView='canvas'
  }
  sync()
  listCameras()
}, message => {
  $('mapCamera').textContent = camera.pending ? 'Cancelar conexión' :
    camera.current?.kind === 'camera' ? 'Desconectar cámara' : 'Conectar cámara'
  status(message || referenceNotice)
  referenceNotice = ''
  showReference()
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
    showReference()
  } else if (camera.current?.kind === 'camera') camera.clear()
  else connectReference()
}
function connectReference() {
  const sharedCamera = studioWindow?.fosfenoStudioCamera()
  return camera.open('camera',{sharedCamera}).catch(() => {})
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
navigator.mediaDevices?.addEventListener?.('devicechange',()=>{
  if ($('mapSetup').open || camera.current) listCameras()
})
$('mapSetup').addEventListener('toggle',()=>{ if ($('mapSetup').open) listCameras() })

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
  for (const { canvas } of [guide, artwork, surfaceArt, ink]) {
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
function fillTrack(input) {
  input.style.setProperty('--amount',100*(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))+'%')
}
function objectType(layer) {
  if (isModelFile(layer.file)) return 'Modelo 3D'
  if (layer.kind==='solid') return (layer.solid.shape==='cube'?'Cubo 3D':'Pirámide 3D')+' · '+layer.solid.faces.length+' caras'
  if (layer.kind === 'ink') return layer.strokes.length === 1 ? '1 trazo' : layer.strokes.length + ' trazos'
  if (layer.kind === 'hydra') return 'Recorte Hydra'
  if (layer.mediaRole === 'loop') return 'Loop'
  if (isGifFile(layer.file)) return 'GIF animado'
  return layer.file?.type.startsWith('video/') ? 'Video' : 'Foto'
}
function hydraOrigin(layer,face=solidTools.selectedFace(layer?.id)) {
  let sector=0
  if (layer?.kind==='solid') {
    const faces=face<0 ? layer.solid.faces : [layer.solid.faces[face]]
    if (!faces.length || faces.some(m=>m?.type!=='hydra' || m.sector!==faces[0].sector)) return null
    sector=faces[0].sector || 0
    if (sector && !sharedRows.some(row=>row.id===sector)) return null
  } else if (layer?.kind!=='hydra') return null
  return {sectorId:sector,layerId:0,kind:'sector'}
}
function mapDefinition(layer,face=solidTools.selectedFace(layer.id)) {
  const asset=file=>{
    if (!file) return
    const meta={name:file.name,type:file.type || (isModelFile(file)?'model/gltf-binary':'desconocido'),size:file.size}
    const info=media.get(file)?.input.current?.model?.summary
    if (info) meta.model=info
    return meta
  }
  const {id,name,kind,visible,opacity,rect,mask,quad}=layer
  const data={id,name,kind,visible,opacity,rect,mask,quad}
  let selection=''
  if (kind==='file') {
    data.file=asset(layer.file)
    if (layer.mediaRole) data.mediaRole=layer.mediaRole
    if (isModelFile(layer.file)) data.modelView=layer.modelView || makePose()
  } else if (kind==='hydra') data.source='Salida compuesta del estudio Hydra'
  else if (kind==='solid') {
    const {shape,pose,faces}=layer.solid,labels=solidFaces(shape)
    data.solid={shape,pose,faces:faces.map((material,index)=>({face:labels[index],...material,file:asset(material.file)}))}
    if (face>=0) {data.selectedFace=labels[face];selection=' · '+labels[face]}
  } else if (kind==='ink') {
    const focus=layer.id===selected && selectedStroke!=null ? selectedStroke : -1
    if (focus>=0) {data.selectedStroke=focus;selection=' · Trazo '+(focus+1)}
    const strokes=focus>=0 ? [layer.strokes[focus]] : layer.strokes.slice(0,24)
    data.strokeCount=layer.strokes.length
    data.strokes=strokes.map(({points,...style})=>({...style,pointCount:points.length,points:points.slice(0,24),
      ...(points.length>24 ? {omittedPoints:points.length-24} : {})}))
    if (strokes.length<layer.strokes.length) data.omittedStrokes=layer.strokes.length-strokes.length
  }
  return {title:name+selection,description:objectType(layer)+' · Coordenadas relativas al lienzo.',
    language:'json',text:JSON.stringify(data,null,2)}
}
function selectedMapCode() {
  const layer=activeLayer()
  return layer ? hydraOrigin(layer) || mapDefinition(layer) : sharedItem
}
function showMapDefinition(layer,source=false,face=solidTools.selectedFace(layer.id)) {
  const target=source && hydraOrigin(layer,face) || mapDefinition(layer,face)
  if (!studioWindow?.openFosfenoCode) return status('El editor de Código todavía está iniciando.',true)
  return studioWindow.openFosfenoCode(target)
}
function syncCodeButtons(layer) {
  const origin=hydraOrigin(layer)
  const button=$('mapCodeOrigin')
  button.hidden=!origin || !studioWindow?.openFosfenoCode
  if (origin) button.title='Abrir '+(origin.sectorId ? sharedRows.find(row=>row.id===origin.sectorId)?.name : 'la mezcla del estudio')+' en Código'
}
$('mapObjectCode').onclick=()=>{const layer=activeLayer();if (layer) showMapDefinition(layer)}
$('mapCodeOrigin').onclick=()=>{const layer=activeLayer();if (layer) showMapDefinition(layer,true)}
$('mapSolidFaces').addEventListener('click',()=>syncCodeButtons(activeLayer()))
function inkBounds(layer) {
  let x0=1, y0=1, x1=0, y1=0
  for (const stroke of layer.strokes) {
    const radius = (stroke.style === 'neon' ? 3 : .7) * stroke.size / 1280
    const dx = radius * Math.max(1,1/scene.aspect), dy = radius * Math.max(1,scene.aspect)
    for (const [x,y] of stroke.points) {
      x0=Math.min(x0,x-dx); y0=Math.min(y0,y-dy); x1=Math.max(x1,x+dx); y1=Math.max(y1,y+dy)
    }
  }
  return [clamp(x0),clamp(y0),clamp(x1)-clamp(x0),clamp(y1)-clamp(y0)]
}
const inkBoxes=new WeakMap()
function boundsOf(layer) {
  if (!layer || layer.rect || layer.kind!=='ink') return layer?.rect
  let cached=inkBoxes.get(layer.strokes)
  if (!cached || cached.aspect!==scene.aspect) {
    cached={aspect:scene.aspect,rect:inkBounds(layer)}
    inkBoxes.set(layer.strokes,cached)
  }
  return cached.rect
}
function inkPoint(layer,point,inverse=false) {
  if (!layer?.quad) return point
  const [x,y,w,h]=boundsOf(layer)
  if (!inverse) return mapQuadPoint([(point[0]-x)/w,(point[1]-y)/h],layer.quad)
  const uv=mapQuadPoint(point,layer.quad,true)
  return uv && [x+uv[0]*w,y+uv[1]*h]
}
function brushPoint(layer,point) {
  if (!layer?.quad) return point
  const uv=mapQuadPoint(point,layer.quad,true)
  if (!uv || uv.some(n=>n<0 || n>1)) return null
  const [x,y,w,h]=boundsOf(layer)
  return [x+uv[0]*w,y+uv[1]*h]
}
const actualBox=layer=>layer.quad ? quadBounds(layer.quad) : boundsOf(layer)
function changedBox(layer,from,to) {
  const rect=boundsOf(layer), initial=layer.quad || rectQuad(rect)
  const quad=initial.map(([x,y])=>[to[0]+(x-from[0])*to[2]/from[2],to[1]+(y-from[1])*to[3]/from[3]])
  return {rect,quad}
}
function displayQuad(layer) {
  if (gesture?.layer===layer) {
    if (gesture.kind==='warp') return gesture.quad
    if (gesture.kind==='move' || gesture.kind==='resize') return changedBox(layer,gesture.original,gestureRect()).quad
  }
  return layer.quad
}
function updateHandles(layer) {
  const handles=$('mapHandles')
  const show=layer?.visible && tool==='deform' && !calibration && displayView!=='output'
  handles.hidden=!show
  if (!show) return
  const quad=displayQuad(layer) || rectQuad(boundsOf(layer))
  quad.forEach(([x,y],i)=>{
    const handle=handles.children[i]
    handle.style.left=x*100+'%'; handle.style.top=y*100+'%'
    handle.hidden=x<0 || y<0 || x>1 || y>1
    handle.setAttribute('aria-pressed',String(activeCorner===i))
  })
}
function syncTransform(layer) {
  if (!layer) return
  const rect=boundsOf(layer), {cx,cy,width,height,angle,scale}=transformInfo(layer.quad || rectQuad(rect),rect,scene.aspect)
  for (const [id,value] of Object.entries({mapX:cx*100,mapY:cy*100,mapWidth:width*100,mapHeight:height*100,mapRotate:angle,mapScale:scale*100})) {
    const input=$(id), formatted=String(Number(value.toFixed(3)))
    if (input.dataset.current!==formatted || document.activeElement!==input) input.value=formatted
    input.dataset.current=formatted
  }
}
function sync() {
  if (projection) projectorCode?.refresh()
  const layer = activeLayer()
  if (!layer?.strokes?.[selectedStroke]) selectedStroke = null
  const stroke = layer?.strokes?.[selectedStroke]
  $('mapShapeOptions').hidden = tool!=='shape' || !showShapeMenu || !!calibration
  $('mapShape').setAttribute('aria-expanded',String(!$('mapShapeOptions').hidden))
  syncSectorHandles()
  showReference()
  $('mapBrushOptions').hidden = (!stroke && tool !== 'line' && (tool !== 'brush' || !brushOptionsOpen)) || !!calibration
  document.querySelector('[data-tool="brush"]').setAttribute('aria-expanded',String(tool === 'brush' && !$('mapBrushOptions').hidden))
  $('mapBrushTarget').textContent = editableLine() ? 'Arrastrá los puntos' :
    stroke ? 'Trazo ' + (selectedStroke + 1) : tool === 'line' ?
      'Arrastrá una recta o tocá para unir puntos' : 'Nuevo trazo'
  $('mapBrushSize').value = stroke?.size ?? brushSize
  fillTrack($('mapBrushSize'))
  $('mapBrushValue').value = $('mapBrushSize').value
  $('mapBrushColor').value = stroke?.color || brushColor
  syncLine()
  syncHistory()
  $('mapCalibrateBar').hidden = !calibration
  $('mapBackPoint').disabled = !calibration?.length
  $('mapCalibrate').textContent = scene.calibration ? 'Recalibrar' : 'Calibrar'
  $('mapSamples').disabled = !!calibration
  $('mapBlackout').setAttribute('aria-pressed', String(blackout))
  $('mapOutput').textContent = projection ? 'Ver proyector' : 'Proyectar'
  $('mapState').textContent = blackout ? 'Apagón' : calibration ? 'Patrón de calibración' :
    scene.calibration ? 'Calibrado' : 'Salida directa'
  $('mapState').dataset.aligned = !!scene.calibration && !blackout && !calibration
  $('mapFormatLabel').textContent = scene.format
  surface.dataset.mapView = calibration ? 'surface' : displayView
  for (const button of document.querySelectorAll('button[data-map-view]')) {
    button.setAttribute('aria-pressed',String(button.dataset.mapView===surface.dataset.mapView))
    button.disabled=!!calibration && button.dataset.mapView!=='surface'
  }
  studioWindow?.updateFosfenoMappingFeed(scene.studioMode)
  for (const el of document.querySelectorAll('[data-tool],[data-brush],[data-mask],[data-format],[data-hydra]')) {
    const chosen = el.dataset.tool || el.dataset.brush || el.dataset.mask || el.dataset.format || el.dataset.hydra
    el.setAttribute('aria-pressed', String([tool, stroke?.style || brushStyle, layer?.mask, scene.format, scene.studioMode].includes(chosen)))
  }
  if (calibration) {
    $('mapCalibrateStep').textContent = camera.current ?
      'Marcá el centro de la cruz ' + (calibration.length + 1) + ' de 4' :
      'Conectá la cámara o cargá una foto con las cuatro cruces'
    pattern(targets, calibration.length)
  }
  $('mapLayerControls').hidden = !layer
  modelViewControls($('mapModel'),draftModelViews.get(layer) || layer?.modelView,view=>{
    draftModelViews.set(layer,view)
    dirty=true
  }, isModelFile(layer?.file) ? view=>{
    draftModelViews.delete(layer)
    editLayer(layer,{modelView:view})
  } : null)
  $('mapDeform').setAttribute('aria-pressed',String(tool==='deform'))
  $('mapDeform').disabled=!layer?.visible
  $('mapMoveObject').disabled=!layer?.visible
  $('mapResetQuad').hidden=!layer?.quad
  syncTransform(layer)
  updateHandles(layer)
  solidTools.sync(layer)
  syncCodeButtons(layer)
  $('mapMasks').hidden = layer?.kind === 'ink' || layer?.kind === 'solid'
  $('mapToSector').hidden = !studioWindow?.copyFosfenoMappingLayer || !layer || layer.kind==='solid'
  $('mapReplaceMedia').hidden = layer?.kind === 'ink' || layer?.kind === 'solid'
  $('mapStrokes').hidden = layer?.kind !== 'ink'
  if (layer) {
    const i = scene.layers.indexOf(layer)
    if (document.activeElement !== $('mapLayerName')) $('mapLayerName').value = layer.name
    $('mapToSector').textContent=layer.kind==='ink' ? 'Copiar trazos a un sector Hydra…' : 'Copiar a un sector Hydra…'
    if ($('mapStrokes').open && layer.strokes) renderStrokes(layer)
    $('mapOpacity').value = Math.round(layer.opacity * 100)
    fillTrack($('mapOpacity'))
    $('mapOpacityValue').value = $('mapOpacity').value + '%'
    $('mapLayerUp').disabled = i === scene.layers.length - 1
    $('mapLayerDown').disabled = i === 0
  }
  renderLayers()
  renderStudioStack()
  setCursor()
  dirty = true
}

function renderLayers() {
  const focused = document.activeElement
  const properties=$('mapLayerControls')
  const focusId = focused?.closest('.map-layer')?.dataset.id
  const focusClass = focused?.className
  let focus
  const filter=studioWindow?.filterStudioStack([],{},$('mapStackSearch').value)
  const rows = scene.layers.slice().reverse().filter(layer=>!filter || mapObjectMatches(filter,layer)).map(layer => {
    const row = make('div')
    row.className = 'map-layer'
    row.dataset.id = layer.id
    row.dataset.selected = layer.id === selected
    const choose = button('', () => selectLayer(layer))
    const name=make('strong'), type=make('small')
    name.textContent=layer.name
    type.textContent=[objectType(layer),layer.file?.name!==layer.name && layer.file?.name,
      offCanvas(actualBox(layer)) && 'Fuera del lienzo'].filter(Boolean).join(' · ')
    choose.append(name,type)
    choose.className = 'map-layer-name'
    choose.title = layer.name
    choose.setAttribute('aria-label',layer.name)
    choose.setAttribute('aria-pressed', String(layer.id === selected))
    const visibility = button(layer.visible ? 'Ocultar' : 'Mostrar', () => editLayer(layer, { visible: !layer.visible }))
    visibility.className = 'map-layer-visibility'
    visibility.setAttribute('aria-label', visibility.textContent + ' ' + layer.name)
    row.append(choose, visibility)
    if (focusId === layer.id) focus = focusClass === visibility.className ? visibility : choose
    return row
  })
  $('mapObjectsTitle').hidden=!!filter && !rows.length
  if (!rows.length && !filter) {
    const empty = make('p')
    empty.textContent = 'Sin objetos en el mapa'
    rows.push(empty)
  }
  $('mapLayers').replaceChildren(...rows)
  const active=rows.find(row=>row.dataset.selected==='true')
  properties.hidden=!active
  if (active) active.after(properties)
  else $('mapLayers').after(properties)
  if (properties.contains(focused)) focused.focus({preventScroll:true})
  else focus?.focus({ preventScroll: true })
}
function mapObjectMatches(filter,layer) {
  const media = file=>file && (isModelFile(file) ? 'Modelo 3D GLB' : file.type.startsWith('image/') ? 'Imagen foto' : 'Video')
  const fields=['Objeto del mapa',layer.name,objectType(layer),media(layer.file),layer.file?.name]
  if (filter.matches(...fields)) return true
  return layer.solid?.faces.some(face=>filter.matches(...fields,'Cara',face.role,media(face.file),face.file?.name))
}
function renderStrokes(layer) {
  const list=$('mapStrokeList')
  const labels = layer.strokes.map((stroke,index) => (stroke.line ? 'Línea ' : 'Trazo ') + (index+1))
  if (list.dataset.id !== layer.id || list.dataset.labels !== labels.join('/')) {
    list.dataset.id=layer.id
    list.dataset.labels=labels.join('/')
    list.replaceChildren(...labels.map((label,index) => button(label,()=>{
      setTool('select',false)
      selectedStroke=index
      sync()
    })))
  }
  Array.from(list.children).forEach((b,i)=>b.setAttribute('aria-pressed',String(i===selectedStroke)))
  $('mapEditLine').hidden = !layer.strokes[selectedStroke]?.line
  $('mapEditLine').setAttribute('aria-pressed', String(!!editableLine()))
  $('mapRemoveStroke').hidden=selectedStroke == null
}
function changeStroke(changes) {
  const layer=activeLayer()
  if (!layer?.strokes?.[selectedStroke]) return false
  editLayer(layer,{strokes:layer.strokes.map((s,i)=>i===selectedStroke ? {...s,...changes} : s)})
  return true
}
const sharedStack=studioWindow?.fosfenoStack
const shapeGeometry=sharedStack?.geometry
for (const name of shapeGeometry?.shapes || []) {
  const choice=button(name,()=>{
    shapeName=name
    showShapeMenu=false
    sync()
    surface.focus({preventScroll:true})
    status(name+' · Arrastrá sobre el lienzo para crear el sector.')
  })
  choice.dataset.mapShape=name
  $('mapShapeKinds').append(choice)
}
function chooseShape() {
  if (calibration) endCalibration()
  if (displayView==='output') displayView=camera.current?'surface':'canvas'
  showShapeMenu=tool!=='shape' || !showShapeMenu
  selected=selectedStroke=sharedItem=null
  setTool('shape')
  if (showShapeMenu) {
    const popup=$('mapShapeOptions'), trigger=$('mapShape').getBoundingClientRect()
    const width=Math.min(310,innerWidth-16)
    popup.style.width=width+'px'
    popup.style.left=clamp(trigger.left,8,innerWidth-width-8)+'px'
    const below=innerHeight-trigger.bottom
    popup.style.top=below>145 ? trigger.bottom+3+'px' : 'auto'
    popup.style.bottom=below>145 ? 'auto' : innerHeight-trigger.top+3+'px'
    for (const choice of $('mapShapeKinds').children)
      choice.setAttribute('aria-pressed',String(choice.dataset.mapShape===shapeName))
  }
}
function chosenRegion() {
  return sharedItem?.sectorId && sharedRows.find(row=>row.id===sharedItem.sectorId)
}
function syncSectorHandles() {
  const zone=$('mapSectorHandles'), row=chosenRegion()
  zone.hidden=tool!=='sector-deform' || !row?.visible || !!calibration || displayView==='output'
  if (zone.hidden) return
  const points=gesture?.kind==='region-edit' ? gesture.points : row.points
  const indices=shapeGeometry.handles(points)
  if (zone.dataset.layout!==indices.join(',')) {
    zone.dataset.layout=indices.join(',')
    zone.replaceChildren(...indices.map((index,i)=>{
      const handle=make('button')
      handle.type='button'; handle.dataset.vertex=index
      handle.setAttribute('aria-label','Vértice '+(i+1))
      return handle
    }))
  }
  for (const handle of zone.children) {
    const [x,y]=points[Number(handle.dataset.vertex)]
    handle.style.left=x*100+'%'; handle.style.top=y*100+'%'
  }
}
function updateShapeGesture(drag,at) {
  if (drag.kind==='region-edit') {
    drag.points=shapeGeometry.drag(drag.original,drag.vertex,at[0]-drag.start[0],at[1]-drag.start[1])
    return
  }
  if (drag.shape==='Libre') {
    if (drag.path.length<4096 && lineDistance(drag.path.at(-1),at)>2) drag.path.push(at)
  } else drag.path[1]=at
  drag.points=shapeGeometry.outline(drag.shape,drag.path,preview.width,preview.height)
}
$('mapSectorHandles').onkeydown=event=>{
  const handle=event.target.closest('button[data-vertex]'), row=chosenRegion()
  const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key]
  if (!handle || !direction || !row || event.ctrlKey || event.metaKey || event.altKey) return
  event.preventDefault()
  event.stopPropagation()
  const step=event.shiftKey?10:1, [dx,dy]=direction
  const next=shapeGeometry.drag(row.points,Number(handle.dataset.vertex),dx*step/preview.width,dy*step/preview.height)
  try { shapeGeometry.update(row.id,row.points,next) } catch (error) { errorStatus(error) }
}
function finishShapeGesture(drag,at) {
  updateShapeGesture(drag,at)
  if (drag.kind==='region-edit' && lineDistance(drag.start,at)<2) return
  const xs=drag.points.map(p=>p[0]), ys=drag.points.map(p=>p[1])
  if (drag.points.length<3 || (Math.max(...xs)-Math.min(...xs))*surface.clientWidth<4 ||
      (Math.max(...ys)-Math.min(...ys))*surface.clientHeight<4)
    return status('Arrastrá un poco más para definir el área.')
  try {
    if (drag.kind==='region-edit') {
      shapeGeometry.update(drag.regionId,drag.original,drag.points)
      syncSectorHandles()
      return
    }
    const ref=shapeGeometry.create(drag.shape,drag.points,$('mapShapeColor').value)
    if (scene.studioMode==='off' || automaticShapeFeed.size) {
      automaticShapeFeed.add(ref.sectorId)
      syncShapeFeed()
    }
    $('mapStackSearch').value=''
    selectStudio(ref,false)
    status(shapeGeometry.projected(ref.sectorId) ? 'Sector creado. Arrastrá el interior para moverlo.' :
      'Sector en edición manual. Aplicá los cambios para proyectarlo.')
  } catch (error) { errorStatus(error) }
}
function syncShapeFeed() {
  if (!automaticShapeFeed.size) return
  if (scene.studioMode==='full') { automaticShapeFeed.clear(); return }
  const mode=[...automaticShapeFeed].some(id=>shapeGeometry.applied(id))?'sectors':'off'
  if (mode!==scene.studioMode) assign({...scene,studioMode:mode})
}
let studioRowsKey, availableItems=new Map(), actionVersion=0, revealItem=null
const foldedSectors=new Set()
$('mapStackSearch').oninput=()=>{ renderLayers(); renderStudioStack() }
$('mapStackSearch').onkeydown=event=>{
  if (event.key==='Escape' && event.currentTarget.value) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.value=''
    event.currentTarget.oninput()
  }
}
function revealProperties(panel) {
  const row=panel.previousElementSibling
  if (!row) return
  const scroller=panel.closest('.map-inspector')
  const limit=getComputedStyle(scroller).overflowY==='auto' ? Math.min(innerHeight,scroller.getBoundingClientRect().bottom) : innerHeight
  const bounds=row.getBoundingClientRect()
  if (bounds.top<0 || Math.min(bounds.bottom+125,panel.getBoundingClientRect().bottom)>limit)
    row.scrollIntoView({block:'start',inline:'nearest'})
}
function syncHistory(snapshot) {
  const studio=historyScope==='studio' && sharedStack
  if (studio) snapshot ??= sharedStack.snapshot()
  for (const [id,on] of [['mapUndo',studio ? snapshot.canUndo : history.length],['mapRedo',studio ? snapshot.canRedo : future.length]]) {
    const b=$(id)
    b.disabled=!!calibration || (lineDraft.length ? id==='mapRedo' : !on)
    b.title=lineDraft.length && id==='mapUndo' ? 'Deshacer punto' :
      (id==='mapUndo' ? 'Deshacer' : 'Rehacer')+(studio ? ' en el estudio' : ' en el mapa')
  }
}
function useHistory(back) {
  if (calibration || gesture) return
  if (lineDraft.length) {
    if (back) {
      lineDraft.pop()
      lineCursor=null
      syncLine()
      syncHistory()
      dirty=true
    }
    return
  }
  if (historyScope==='studio' && sharedStack) sharedStack.command(back?'undo':'redo').catch(errorStatus)
  else step(back)
}
function selectStudio(ref,reveal=true) {
  historyScope='studio'
  sharedItem=ref
  revealItem=reveal ? itemKey(ref) : null
  selected=selectedStroke=brushLayer=null
  setTool('select')
  sharedStack.command('select',ref).catch(errorStatus)
}
function itemKey(ref) {
  return ref && [ref.sectorId, ref.layerId ?? 0, ref.kind, ref.effectId ?? ref.index ?? ''].join('/')
}
function renderStudioStack() {
  if (!sharedStack) return
  const snapshot=sharedStack.snapshot()
  sharedRows=snapshot.rows
  const search=$('mapStackSearch'), query=search.value
  const filter=studioWindow.filterStudioStack(snapshot.rows,snapshot.base,query)
  search.hidden=!query && !scene.layers.length && !snapshot.rows.some(row=>row.hasTree)
  $('mapStackNoResults').hidden=!filter || filter.any || scene.layers.some(layer=>mapObjectMatches(filter,layer))
  const key=JSON.stringify([snapshot.rows,snapshot.base,itemKey(sharedItem),scene.studioMode,query,[...foldedSectors]])
  if (key===studioRowsKey) return
  studioRowsKey=key
  const list=$('mapStudioLayers'), fragment=document.createDocumentFragment()
  const panel=$('mapStackInspector')
  const focusedCommand=panel.contains(document.activeElement) ? document.activeElement.dataset.command : null
  const focus=list.contains(document.activeElement) ? document.activeElement.closest('[data-item]')?.dataset.item : null
  const foldFocus=document.activeElement?.dataset.foldSector
  availableItems=new Map()
  let parent=fragment
  const entry=(ref,label,depth,category,state='',amount=null,muted=false)=>{
    const key=itemKey(ref)
    availableItems.set(key,{ref,label,category,amount,muted})
    if (filter && (ref.kind==='base' ? !filter.showBase :
      !filter.has(ref.sectorId,ref.layerId??0,ref.kind==='group'?'layer':ref.kind,ref.index))) return
    const line=make('div'), choose=button('',()=>selectStudio(ref))
    Object.assign(line.dataset,{stackKind:ref.kind,sectorId:ref.sectorId,layerId:ref.layerId??0,item:key})
    if (ref.index!=null) line.dataset.index=ref.index
    const title=make('strong'), meta=make('small')
    title.textContent=label; meta.textContent=category+(state ? ' · '+state : '')
    choose.className='map-layer-name'; choose.append(title,meta)
    choose.setAttribute('aria-label',label)
    choose.title=label
    line.dataset.selected=String(key===itemKey(sharedItem))
    choose.setAttribute('aria-pressed',line.dataset.selected)
    line.dataset.muted=String(muted)
    line.style.setProperty('--indent',depth*9+'px')
    line.className='map-studio-row'
    line.append(choose); parent.append(line)
    if (key===focus && foldFocus==null) queueMicrotask(()=>{ if (choose.isConnected) choose.focus({preventScroll:true}) })
    return line
  }
  for (const row of [...snapshot.rows.filter(r=>r.id),...snapshot.rows.filter(r=>!r.id)]) {
    parent=fragment
    const ref={sectorId:row.id,layerId:0,kind:'sector'}
    const closed=!filter && foldedSectors.has(row.id)
    const heading=entry(ref,row.name,0,row.id?'Sector':'Composición',closed ? row.summary || row.status : row.status,null,row.visible===false)
    if (row.id) {
      const group=make('div')
      group.id='map-sector-tree-'+row.id
      group.className='map-sector-contents'
      group.hidden=closed
      if (heading) fragment.append(group)
      parent=group
      if (heading && !filter) {
        const toggle=button(closed?'▸':'▾',()=>{
          if (foldedSectors.has(row.id)) foldedSectors.delete(row.id)
          else foldedSectors.add(row.id)
          renderStudioStack()
        })
        toggle.dataset.foldSector=String(row.id)
        toggle.setAttribute('aria-controls',group.id)
        toggle.setAttribute('aria-expanded',String(!closed))
        toggle.setAttribute('aria-label',(closed?'Ver capas de ':'Plegar capas de ')+row.name)
        if (closed && row.summary) {
          toggle.setAttribute('aria-description',row.summary)
          heading.firstChild.title=row.name+' · '+row.summary
        }
        heading.append(toggle)
        if (foldFocus===String(row.id)) queueMicrotask(()=>toggle.focus({preventScroll:true}))
      }
    }
    const renderLayer=(layer,depth)=>{
      const item={sectorId:row.id,layerId:layer.layerId}
      if (row.id) entry({...item,kind:layer.group?'group':'layer'},layer.name,depth,layer.group?'Grupo':'Capa',
        layer.hidden?'Oculta':'',{value:layer.opacity,min:0,max:1,step:.01},layer.hidden)
      const subDepth=depth+(row.id ? 1 : 0)
      if (layer.source) entry({...item,kind:'source'},layer.source,subDepth,'Fuente',layer.sourcePending?'Pendiente':'')
      if (layer.code) entry({...item,kind:'code'},'Código Hydra',subDepth,'Programa')
      if (layer.paint) entry({...item,kind:'paint'},'Pinceladas',subDepth,'Tratamiento')
      layer.effects.forEach((fx,index)=>{
        if (fx.effectId==null) {
          // An unapplied deletion is still projected but no longer editable.
          if (!filter || filter.has(row.id,layer.layerId,'effect',index)) {
            const pending=make('p'); pending.textContent=fx.name+' · '+fx.state; parent.append(pending)
          }
          return
        }
        entry({...item,kind:'effect',index,effectId:fx.effectId},fx.name,subDepth,'Efecto',fx.state,
          Number.isFinite(fx.min) ? {value:fx.value,min:fx.min,max:fx.max,step:fx.step} : null,!fx.enabled)
      })
      if (layer.group) row.entries.filter(l=>l.groupId===layer.layerId).slice().reverse().forEach(child=>renderLayer(child,depth+1))
    }
    row.entries.filter(l=>!l.groupId).slice().reverse().forEach(l=>renderLayer(l,1))
  }
  parent=fragment
  const base=snapshot.base
  entry({sectorId:0,layerId:0,kind:'base'},base.name || 'Sin fondo',0,'Fondo',
    base.pending ? 'Pendiente' : !base.present ? '' : !base.visible ? 'Oculto' :
      scene.studioMode==='full' ? 'En proyección' : 'Fuera de la proyección',null,!base.visible)
  const chosen=availableItems.get(itemKey(sharedItem))
  const activeRow=fragment.querySelector('[data-selected=true]')
  const row=activeRow?.closest('[hidden]') ? null : activeRow
  list.replaceChildren(fragment)
  if (row) row.after(panel)
  else list.after(panel)
  if (!chosen) sharedItem=null
  renderSharedProperties(row ? chosen : null,focusedCommand)
}
let stackPalette=null
function mapStackPicker(ref,action,host,trigger) {
  const key=itemKey(ref)
  const form=make('div'), search=make('input'), results=make('div')
  form.className='map-stack-palette'
  search.type='search'
  search.placeholder=action==='library'?'Buscar en la biblioteca':'Buscar efecto u operador Hydra'
  search.setAttribute('aria-label',search.placeholder)
  search.value=stackPalette.query
  results.className='map-stack-choices'
  const draw=()=>{
    if (stackPalette?.key!==key || stackPalette.action!==action) return
    stackPalette.query=search.value
    const choices=sharedStack.choices(ref,action,search.value)
    results.replaceChildren(...choices.map(choice=>{
      const el=button(choice.name,()=>{
        try {
          sharedStack.applyChoice(ref,choice.key)
          draw()
        } catch (error) { errorStatus(error) }
      })
      el.setAttribute('aria-pressed',String(choice.active))
      if (action==='library') {
        const pair=make('div'), edit=button('Editar',()=>{
          try { sharedStack.editLibraryChoice(ref,choice.key) } catch (error) { errorStatus(error) }
        })
        pair.className='map-choice-pair'
        edit.setAttribute('aria-label','Editar parámetros de '+choice.name)
        edit.setAttribute('aria-haspopup','dialog')
        pair.append(el,edit)
        return pair
      }
      return el
    }))
    if (!choices.length) results.textContent='Sin coincidencias.'
  }
  search.oninput=draw
  search.onkeydown=e=>{ if (e.key==='Escape') { e.stopPropagation(); trigger.click(); trigger.focus() } }
  form.append(search,results); host.append(form)
  draw()
  return search
}
async function renderSharedProperties(node,focus) {
  const panel=$('mapStackInspector'), version=++actionVersion
  panel.hidden=!node
  if (!node) { stackPalette=null; panel.replaceChildren(); return }
  const {ref,label,amount}=node
  if (stackPalette?.key!==itemKey(ref)) stackPalette=null
  const actions=await sharedStack.command('capabilities',ref).catch(()=>[])
  if (version!==actionVersion) return
  const fragment=document.createDocumentFragment(), bar=make('div')
  panel.setAttribute('role','group')
  panel.setAttribute('aria-label','Propiedades de '+label)
  bar.className='map-controls'
  const run=async(action,value)=>{
    try {
      const result=await sharedStack.command(action,ref,value)
      if (action==='move' && result) sharedItem=result
      if (action==='remove') sharedItem=null
      studioRowsKey=null
      sync()
    } catch (error) { errorStatus(error) }
  }
  if (actions.includes('amount') && amount) {
    const field=make('label'), input=make('input'), out=make('output')
    const isOpacity=ref.kind!=='effect'
    field.className='map-slider'; field.textContent=isOpacity?'Opacidad':'Intensidad'
    input.type='range'; input.min=amount.min; input.max=amount.max; input.step=amount.step
    input.value=amount.value; input.dataset.command='amount'
    const display=()=>{ out.value=isOpacity ? Math.round(input.value*100)+'%' : input.value; fillTrack(input) }
    display()
    input.oninput=display
    input.onchange=()=>run('amount',Number(input.value))
    field.append(input,out); fragment.append(field)
  }
  const names={inspect:'Inspector del estudio',toggle:node.muted?'Activar':'Ocultar',up:'Subir',down:'Bajar',move:'Mover a…',
    remove:ref.kind==='group'?'Desagrupar':'Quitar',media:'Cambiar fuente',library:'Biblioteca',effects:'Añadir efecto',loop:'Elegir loop',addLayer:'Añadir capa',code:'Código'}
  if (ref.kind==='effect') names.toggle=node.muted?'Activar':'Pausar'
  if (ref.kind==='base' || ref.kind==='code' || ref.kind==='effect' &&
      sharedRows.find(r=>r.id===ref.sectorId)?.entries.find(l=>l.layerId===ref.layerId)?.effects
        .some(fx=>fx.effectId===ref.effectId && ['library','operator'].includes(fx.kind))) names.inspect='Editar parámetros'
  let destinations
  for (const action of ['inspect','toggle','up','down','move','remove']) {
    if (!actions.includes(action)) continue
    const control=button(names[action],async()=>{
      if (action!=='move') return run(action)
      if (destinations) { destinations.remove(); destinations=null; control.setAttribute('aria-expanded','false'); return }
      const choices=await sharedStack.command('destinations',ref).catch(()=>[])
      if (!control.isConnected) return
      destinations=make('div'); destinations.className='map-destinations'
      destinations.setAttribute('aria-label','Destino de '+label)
      for (const choice of choices) destinations.append(button(choice.label,()=>run('move',choice.target)))
      panel.append(destinations)
      control.setAttribute('aria-expanded','true')
    })
    control.dataset.command=action
    if (action==='move') control.setAttribute('aria-expanded','false')
    if (action==='remove') control.className='map-remove'
    bar.append(control)
  }
  fragment.append(bar)
  const tools=make('div'); tools.className='map-controls'
  if (ref.sectorId && ref.kind==='sector') {
    const deform=button('Deformar',()=>{
      if (displayView==='output') displayView=camera.current?'surface':'canvas'
      setTool(tool==='sector-deform'?'select':'sector-deform')
      deform.setAttribute('aria-pressed',String(tool==='sector-deform'))
      if (tool==='sector-deform') surface.scrollIntoView({block:'nearest',inline:'nearest'})
      surface.focus({preventScroll:true})
      status(tool==='sector-deform'?'Arrastrá los vértices. Con el teclado, elegí un vértice con Tab y usá las flechas.':'')
    })
    deform.dataset.command='deformShape'
    deform.setAttribute('aria-pressed',String(tool==='sector-deform')); tools.append(deform)
    if (shapeTransformControls?.dataset.sector!==String(ref.sectorId))
      shapeTransformControls=shapeGeometry.controls(document,ref.sectorId,()=>scene.aspect,message=>status(message,true))
    tools.append(shapeTransformControls)
  }
  const shortcuts=ref.kind==='base' ? ['library','code'] : ref.kind==='source' ? ['media','loop'] :
    ['sector','layer','group'].includes(ref.kind) ? ['effects','library','media','loop','addLayer','code'] : []
  const pickHere=action=>ref.kind!=='base' && ['effects','library'].includes(action)
  const palette=make('div')
  for (const action of shortcuts.filter(a=>actions.includes(a))) {
    const control=button(names[action],()=>{
      if (pickHere(action)) {
        const open=stackPalette?.action!==action
        stackPalette=open ? {key:itemKey(ref),action,query:''} : null
        tools.querySelectorAll('button[data-picker]').forEach(el=>el.setAttribute('aria-expanded',String(open && el===control)))
        palette.replaceChildren()
        if (open) {
          const search=mapStackPicker(ref,action,palette,control)
          if (matchMedia('(pointer:fine)').matches) search.focus({preventScroll:true})
        }
      } else if (action==='media') {
        const picker=make('input')
        picker.type='file'; picker.accept=$('mapMediaFile').accept
        picker.onchange=async()=>{
          if (!picker.files.length) return
          try { await sharedStack.file(ref,picker.files[0]) } catch (error) { errorStatus(error) }
        }
        picker.click()
      } else run(action)
    })
    control.dataset.command=action
    if (pickHere(action)) {
      const open=stackPalette?.action===action
      control.dataset.picker=action; control.setAttribute('aria-expanded',String(open))
      if (open) mapStackPicker(ref,action,palette,control)
    }
    tools.append(control)
  }
  if (tools.childElementCount) fragment.append(tools)
  fragment.append(palette)
  panel.replaceChildren(fragment)
  if (focus) panel.querySelector('[data-command="'+focus+'"]')?.focus({preventScroll:true})
  if (revealItem===itemKey(ref)) { revealItem=null; revealProperties(panel) }
}
const stopWatchingStack=sharedStack?.subscribe(state=>{
  if (!active) return
  $('mapApplySeed').hidden=!state.pendingOutput
  syncShapeFeed()
  if (sharedItem && state.selection) sharedItem=state.selection
  renderStudioStack()
  syncSectorHandles()
  syncHistory(state)
  dirty=true
})
window.addEventListener('pagehide',event=>{ if (!event.persisted) stopWatchingStack?.() })

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
  historyScope='map'
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
  historyScope='map'
  sharedItem = null
  selectedStroke = null
  selected = layer.id
  brushLayer = layer.kind === 'ink' ? layer.id : null
  setTool('select')
  status('Arrastrá para mover. Las flechas ajustan un píxel y Mayús + flecha ajusta diez.')
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
  if (next !== 'line') resetLine()
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
    gesture?.kind==='region-edit' ? 'move' :
    tool==='sector-deform' ? 'grab' :
    gesture?.kind==='warp' ? 'corner' :
    tool==='deform' ? (gesture ? 'move' : point && hitAt(point) ? 'grab' : 'select') :
    gesture?.kind === 'line-vertex' ? 'move' :
    point && tool === 'line' && vertexAt(point,editableLine(),false) >= 0 ? 'grab' :
    gesture?.kind === 'move' || gesture?.kind === 'resize' ? gesture.kind :
    tool !== 'select' ? tool :
    point && handleAt(point, layer) ? 'resize' : point && hitAt(point) ? 'grab' :
    point && studioSectorAt(point) ? 'grab' : 'select'
}

function nextLayer(kind, name) {
  return { id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), kind, name, opacity: 1, visible: true }
}
for (const b of document.querySelectorAll('[data-map-solid]')) b.onclick=()=>{
  if (calibration) return
  const shape=b.dataset.mapSolid, height=.68, width=Math.min(.68,height/scene.aspect)
  const name=shape==='cube'?'Cubo':'Pirámide'
  const number=scene.layers.filter(layer=>layer.solid?.shape===shape).length+1
  showShapeMenu=false
  setTool('select',false)
  addLayer({...nextLayer('solid',name+' '+number),solid:makeSolid(shape),mask:'rect',
    rect:[(1-width)/2,(1-height)/2,width,height]})
  status('Tocá una cara para cambiar su contenido. Arrastrá la figura para moverla.')
}
function addLayer(layer) {
  sharedItem = null
  selectedStroke = null
  selected = layer.id
  apply({ ...scene, layers: [...scene.layers, layer] })
}

function commitStroke(stroke, targetId) {
  const target = scene.layers.find(layer => layer.id === targetId && layer.visible)
  if (target) {
    selected = target.id
    editLayer(target, { strokes: [...target.strokes, stroke] })
  }
  else {
    const n = scene.layers.filter(layer => layer.kind === 'ink').length + 1
    const layer = { ...nextLayer('ink', 'Trazos ' + n), strokes: [stroke] }
    brushLayer = layer.id
    addLayer(layer)
  }
}

function strokeBrush(points) {
  return { points, color: brushColor, style: brushStyle, size: Number($('mapBrushSize').value) }
}
function resetLine() { lineDraft = []; lineCursor = null }
function syncLine() {
  $('mapBrushOptions').dataset.line = tool === 'line'
  $('mapBrushOptions').dataset.style = lineStyleOpen
  $('mapLineStyle').hidden = tool !== 'line'
  $('mapLineStyle').setAttribute('aria-expanded', String(lineStyleOpen))
  $('mapLineActions').hidden = tool !== 'line' || !lineDraft.length || !!calibration
  $('mapFinishLine').disabled = lineDraft.length < 2
  $('mapCloseLine').hidden = lineDraft.length < 3
  preview.setAttribute('aria-label', tool === 'line' ?
    'Lienzo de mapeo. Arrastrá para una recta o tocá para unir puntos.' :
    'Lienzo de mapeo. Arrastrá para dibujar con el pincel.')
}
function editableLine() {
  if (tool !== 'line') return null
  const layer = activeLayer(), stroke = layer?.strokes?.[selectedStroke]
  return layer?.visible && stroke?.line ? { layer, stroke } : null
}
function lineDistance([x,y], [u,v]) {
  return Math.hypot((x-u)*surface.clientWidth, (y-v)*surface.clientHeight)
}
function closesLine(point, touch = false) {
  return lineDraft.length >= 3 && lineDistance(lineDraft[0], point) < (touch ? 22 : 13)
}
function snapLine(start, point, snap) {
  if (!snap || !start) return point
  const [x,y] = start
  const w = surface.clientWidth, h = surface.clientHeight
  const dx = (point[0]-x)*w, dy = (point[1]-y)*h
  const angle = Math.round(Math.atan2(dy,dx)/(Math.PI/4)) * Math.PI/4
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const u = Math.abs(cos)<1e-8 ? 0 : cos/w, v = Math.abs(sin)<1e-8 ? 0 : sin/h
  const distance = Math.min(Math.hypot(dx,dy), u ? (u>0 ? 1-x : -x)/u : Infinity,
    v ? (v>0 ? 1-y : -y)/v : Infinity)
  return [clamp(x+u*distance),clamp(y+v*distance)]
}
function completeLine(points, closed = false) {
  resetLine()
  const target = scene.layers.find(layer => layer.id === brushLayer && layer.visible)
  const source = target?.quad ? points.map(point=>brushPoint(target,point)) : points
  const fits = source.every(Boolean)
  commitStroke({ ...strokeBrush(fits ? source : points), line: true, closed }, fits ? target?.id : null)
  status('')
}
function finishLine(closed = false) {
  if (lineDraft.length < (closed ? 3 : 2)) return
  completeLine(lineDraft, closed)
}
function vertexAt(point, editing, touch) {
  if (!editing) return -1
  const { layer, stroke } = editing
  let hit = -1, closest = touch ? 21 : 12
  for (const [index,vertex] of stroke.points.entries()) {
    const mapped = layer.quad ? inkPoint(layer,vertex) : vertex
    if (!mapped) continue
    const distance = lineDistance(mapped,point)
    if (distance < closest) { hit=index; closest=distance }
  }
  return hit
}
function lineVertex(layer, point) {
  if (!layer.quad) return point
  const source = inkPoint(layer,point,true)
  if (!source?.every(Number.isFinite)) return null
  const [x,y,w,h] = boundsOf(layer)
  return [clamp(source[0],x,x+w),clamp(source[1],y,y+h)]
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
function filesOf(layer) {
  if (layer.kind==='solid') return layer.solid.faces.flatMap(m=>m.file?[m.file]:[])
  return layer.file?[layer.file]:[]
}
function updateSources() {
  if (!active) return
  const assets = new Set()
  for (const map of [scene, ...history, ...future])
    for (const layer of map.layers) for (const file of filesOf(layer))
      if (map===scene || !isGifFile(file) && !isModelFile(file)) assets.add(file)
  if (pending?.file) assets.add(pending.file)
  for (const [file, asset] of media) {
    if (!assets.has(file) && !asset.placing) {
      asset.input.clear()
      media.delete(file)
    }
  }
  for (const file of assets) openAsset(file)
  const visibleAssets = new Set(scene.layers.filter(layer => layer.visible).flatMap(filesOf))
  for (const [file, { input, ready }] of media) ready.then(() => {
    const video = input.current?.element
    if (!(video instanceof HTMLVideoElement) || !active || media.get(file)?.input !== input) return
    const inUse = scene.layers.some(layer => layer.visible && filesOf(layer).includes(file))
    if (inUse) video.play().catch(errorStatus)
    else if (!visibleAssets.has(file)) video.pause()
  })
  const useHydra = scene.studioMode !== 'off' || pending?.kind === 'hydra' ||
    scene.layers.some(layer => layer.visible && (layer.kind === 'hydra' || layer.solid?.faces.some(m=>m.type==='hydra')))
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

async function placeFile(file, mediaRole, replaceId = null) {
  file = normalizeGifFile(file)
  if (!file?.size || (!/^(image|video)\//.test(file.type) && !isModelFile(file))) {
    status('Elegí una imagen, un video o un modelo .glb de Blender.', true)
    return
  }
  const ticket = ++loadRevision
  const asset = openAsset(file)
  asset.placing = true
  status('Abriendo «' + file.name + '»…')
  const ready = await asset.ready
  asset.placing = false
  if (ready && ticket === loadRevision && active && replaceId) {
    const target=scene.layers.find(l=>l.id===replaceId)
    if (target && target.kind!=='ink') {
      editLayer(target,{kind:'file',file,mediaRole,modelView:isModelFile(file) ? target.modelView : undefined,name:target.name===target.file?.name ? file.name : target.name})
      status('Archivo reemplazado. Se conservaron su posición, recorte y opacidad.')
    }
    updateSources()
  }
  else if (ready && ticket === loadRevision && active) place({ ...nextLayer('file', file.name), file, mediaRole })
  else updateSources()
}
function place(layer) {
  if (calibration) endCalibration()
  pending = { ...layer, mask: 'rect' }
  setTool('place')
  updateSources()
  status('Arrastrá para definir el área. Un toque coloca un recorte centrado ahí.')
}

function faceAtMap(layer,point) {
  const [x,y,w,h]=layer.rect
  const uv=layer.quad ? mapQuadPoint(point,layer.quad,true) : [(point[0]-x)/w,(point[1]-y)/h]
  return uv && uv.every(n=>n>=0 && n<=1) ? solidFaceAt(solidTools.current(layer.solid),uv,performance.now()/1000) : -1
}
function hitAt(point) {
  return scene.layers.findLast(layer => {
    if (!layer.visible) return false
    if (layer.kind==='solid') return faceAtMap(layer,point)>=0
    const coords=inkPoint(layer,point,true)
    if (!coords) return false
    const [x,y]=coords
    const [left, top, w, h] = boundsOf(layer)
    if (layer.kind === 'ink') {
      if (x<left || x>left+w || y<top || y>top+h) return false
      if (selected===layer.id) return true
      const c=inkLayer(layer).getContext('2d')
      return !!c.getImageData(Math.min(c.canvas.width-1,Math.floor(x*c.canvas.width)),
        Math.min(c.canvas.height-1,Math.floor(y*c.canvas.height)),1,1).data[3]
    }
    if (layer.mask === 'ellipse') return ((x - left - w / 2) / (w / 2)) ** 2 + ((y - top - h / 2) / (h / 2)) ** 2 <= 1
    return x >= left && y >= top && x <= left + w && y <= top + h
  })
}
function handleAt(point, layer) {
  if (!layer?.visible) return false
  const [x, y, w, h] = actualBox(layer)
  return Math.abs(point[0] - x - w) * surface.clientWidth < 17 &&
    Math.abs(point[1] - y - h) * surface.clientHeight < 17
}
function studioSectorAt([x,y]) {
  if (scene.studioMode==='off' && !automaticShapeFeed.size) return
  return sharedRows.find(row=>{
    if (!row.id || !row.visible || !row.points || scene.studioMode==='off' && !automaticShapeFeed.has(row.id)) return false
    let inside=false
    for (let i=0,j=row.points.length-1;i<row.points.length;j=i++) {
      const [u,v]=row.points[i], [a,b]=row.points[j]
      if ((v>y)!==(b>y) && x<(a-u)*(y-v)/(b-v)+u) inside=!inside
    }
    return inside
  })
}
function pointer(event,bounded=true) {
  const rect = preview.getBoundingClientRect()
  const raw=[(event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height]
  return bounded ? raw.map(value=>clamp(value)) : raw
}
function area(start, end) {
  const [x, y] = start, [u, v] = end
  return [Math.min(x, u), Math.min(y, v), Math.abs(x - u), Math.abs(y - v)]
}
function gestureRect() {
  const { start, end, kind, lockAspect } = gesture
  if (kind === 'place') return area(start, end)
  const [x, y, w, h] = gesture.original
  if (kind === 'resize') {
    const width=Math.max(.002,w+end[0]-start[0]), height=Math.max(.002,h+end[1]-start[1])
    if (lockAspect) {
      const ratio=Math.max(width/w,height/h)
      return [x,y,w*ratio,h*ratio]
    }
    return [x,y,width,height]
  }
  return [x + end[0] - start[0], y + end[1] - start[1], w, h]
}
function pullCorner(drag, at) {
  const dx=at[0]-drag.start[0], dy=at[1]-drag.start[1]
  const next=drag.initial.map((p,i)=>i===drag.corner ? [p[0]+dx,p[1]+dy] : p)
  if (validQuad(next)) drag.quad=next
}
function commitQuad(layer,quad) {
  editLayer(layer,{rect:boundsOf(layer),quad})
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
  finishCalibrationView()
  assignGeometry({ calibration: points })
  status('Alineación aplicada. Dibujá sobre la vista de la superficie.')
}
surface.onpointerdown = event => {
  const handle=event.target.closest('button[data-corner]')
  const vertex=event.target.closest('#mapSectorHandles button')
  if (event.button !== 0 || !event.isPrimary || gesture || (event.target.closest('button') && !handle && !vertex)) return
  const at = pointer(event)
  if (calibration) {
    if (!camera.current) return
    gesture = { kind: 'mark', id: event.pointerId, start: at }
  } else if (tool==='shape') {
    showShapeMenu=false
    sync()
    gesture={id:event.pointerId,kind:'region-create',shape:shapeName,start:at,path:[at],points:[at]}
    surface.focus({preventScroll:true})
  } else if (vertex && tool==='sector-deform') {
    const row=chosenRegion()
    if (!row?.visible) return
    gesture={id:event.pointerId,kind:'region-edit',vertex:Number(vertex.dataset.vertex),regionId:row.id,
      start:at,original:row.points,points:row.points}
    vertex.focus({preventScroll:true})
  } else if (tool === 'line') {
    if (displayView === 'output') return status('Volvé a Lienzo o Superficie para dibujar.')
    surface.focus({preventScroll:true})
    const editing = editableLine()
    const touch = event.pointerType === 'touch'
    if (editing) {
      const vertex = vertexAt(at,editing,touch)
      if (vertex < 0) return
      gesture = { kind: 'line-vertex', id: event.pointerId, vertex, editing, start: at, end: at }
    } else gesture = { kind: 'line', id: event.pointerId, start: at, end: at, touch }
  } else if (handle && tool==='deform') {
    const layer=activeLayer()
    if (!layer?.visible) return
    activeCorner=Number(handle.dataset.corner)
    const initial=layer.quad || rectQuad(boundsOf(layer))
    gesture={kind:'warp',id:event.pointerId,start:at,layer,initial,quad:initial,corner:activeCorner}
    handle.focus({preventScroll:true})
    updateHandles(layer)
  } else if (tool === 'brush') {
    const target=scene.layers.find(l=>l.id===brushLayer && l.visible)
    const point=brushPoint(target,at)
    const stroke=strokeBrush([point || at])
    gesture={kind:'brush',id:event.pointerId,stroke,target:point ? target?.id : null,layerSource:point ? target : null}
  } else if (tool === 'place') {
    gesture = { kind: 'place', id: event.pointerId, start: at, end: at }
  } else {
    const current = activeLayer(), resize = tool==='select' && displayView!=='output' && handleAt(at, current)
    const layer = resize ? current : hitAt(at)
    if (!layer) {
      const row=studioSectorAt(at)
      if (row && displayView!=='output') {
        if (sharedItem?.sectorId!==row.id || sharedItem.kind!=='sector')
          selectStudio({sectorId:row.id,layerId:0,kind:'sector'},false)
        historyScope='studio'
        gesture={id:event.pointerId,kind:'region-edit',vertex:-1,regionId:row.id,
          start:at,original:row.points,points:row.points}
        surface.focus({preventScroll:true})
        surface.setPointerCapture(event.pointerId)
        setCursor(at)
        return
      }
    }
    historyScope='map'
    if (tool==='sector-deform') setTool('select',false)
    selected = layer?.id || null
    selectedStroke = null
    sharedItem = null
    if (layer) {
      if (!resize && tool==='select' && layer.kind==='solid') solidTools.pick(layer.id,faceAtMap(layer,at))
      gesture={kind:resize?'resize':'move',id:event.pointerId,start:at,end:at,layer,original:actualBox(layer)}
      surface.focus({preventScroll:true})
    }
    sync()
  }
  if (gesture) surface.setPointerCapture(event.pointerId)
  setCursor(at)
  dirty = true
}
surface.onpointermove = event => {
  const at = pointer(event,!['warp','move','resize'].includes(gesture?.kind))
  if (tool === 'line' && !calibration && !editableLine()) {
    const start = lineDraft.at(-1) || (gesture?.kind === 'line' ? gesture.start : null)
    lineCursor = closesLine(at,event.pointerType === 'touch') ? lineDraft[0] : snapLine(start,at,event.shiftKey)
    if (start) dirty = true
  }
  if (gesture?.id === event.pointerId && gesture.kind !== 'mark') {
    if (gesture.kind === 'brush') {
      const { points } = gesture.stroke
      const last = points.at(-1)
      const point=brushPoint(gesture.layerSource,at)
      if (point && Math.hypot((point[0]-last[0])*preview.width,(point[1]-last[1])*preview.height)>=1.5) points.push(point)
    } else if (gesture.kind.startsWith('region-')) {
      updateShapeGesture(gesture,gesture.kind==='region-edit' ? pointer(event,false) : at)
      syncSectorHandles()
    } else if (gesture.kind==='warp') pullCorner(gesture,at)
    else {
      gesture.end = at
      if (gesture.kind==='resize') gesture.lockAspect=event.shiftKey
    }
    dirty = true
  }
  setCursor(at)
}
surface.onpointerleave = () => {
  if (gesture) return
  if (tool === 'line' && lineCursor) {
    lineCursor=null
    dirty=true
  }
  setCursor()
}
surface.onpointerup = event => {
  if (gesture?.id !== event.pointerId) return
  const at = pointer(event,!['warp','move','resize'].includes(gesture.kind))
  const done = gesture
  done.end = at
  if (done.kind==='resize') done.lockAspect=event.shiftKey
  if (done.kind==='warp') pullCorner(done,at)
  const rect = ['place', 'move', 'resize'].includes(done.kind) ? gestureRect() : null
  gesture = null
  if (done.kind.startsWith('region-')) finishShapeGesture(done,done.kind==='region-edit' ? pointer(event,false) : at)
  if (done.kind === 'mark' && calibration) mark(at)
  if (done.kind === 'brush') commitStroke(done.stroke,done.target)
  if (done.kind === 'line') {
    const last = lineDraft.at(-1)
    const endpoint = snapLine(last || done.start,at,event.shiftKey)
    lineCursor = null
    if (closesLine(at,done.touch)) finishLine(true)
    else if (!last && lineDistance(done.start,at) >= 7) completeLine([done.start,endpoint])
    else if (lineDraft.length === 2 && lineDistance(lineDraft[0],endpoint) < 5)
      status('Marcá un tercer punto para cerrar el contorno.')
    else if (!last || lineDistance(last,endpoint) >= 5) {
      lineDraft.push(last ? endpoint : done.start)
      syncLine()
      syncHistory()
      status(lineDraft.length >= 3 ? 'Volvé al inicio para cerrar o tocá Finalizar.' :
        'Marcá otro punto para seguir.')
    }
  }
  if (done.kind === 'line-vertex' && done.editing.layer === activeLayer() &&
      lineDistance(done.start,at) >= 2) {
    const { layer, stroke } = done.editing
    const point = lineVertex(layer,at)
    if (point) changeStroke({points:stroke.points.map((vertex,i)=>i===done.vertex ? point : vertex)})
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
  if (done.kind==='warp' && done.quad.some(([x,y],i)=>x!==done.initial[i][0] || y!==done.initial[i][1]))
    commitQuad(done.layer,done.quad)
  if (rect && done.layer && rect.some((value, i) => value !== done.original[i])) editLayer(done.layer,changedBox(done.layer,done.original,rect))
  setCursor(at)
  dirty = true
}
function cancelGesture(event) {
  if (gesture?.id !== event.pointerId) return
  gesture = null
  lineCursor = null
  syncSectorHandles()
  setCursor()
  dirty = true
}
surface.onpointercancel = surface.onlostpointercapture = cancelGesture

function drawStroke(ctx, stroke) {
  const { points, style, color, size, closed } = stroke
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
    for (const [u, v] of closed ? [...points.slice(1),points[0]] : points.slice(1)) {
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
    if (closed) ctx.closePath()
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
  ink.drawImage(cached.canvas, 0, 0)
  drawStroke(ink, transient)
  return ink.canvas
}
let faceCrop
function faceSource(m) {
  if (m.type==='file') {
    const input=media.get(m.file)?.input.current
    input?.animation?.advance()
    return input?.model ? input.model.frame(null) : input?.element
  }
  if (!m.sector || hydraVideo.readyState<2) return hydraVideo
  const row=sharedRows.find(r=>r.id===m.sector && r.visible)
  if (!row?.points?.length) return null
  const xs=row.points.map(p=>p[0]),ys=row.points.map(p=>p[1])
  const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y
  if (w<.00001 || h<.00001) return null
  faceCrop ??= document.createElement('canvas').getContext('2d')
  const canvas=faceCrop.canvas,W=Math.max(1,Math.round(w*hydraVideo.videoWidth)),H=Math.max(1,Math.round(h*hydraVideo.videoHeight))
  if (canvas.width!==W || canvas.height!==H) {canvas.width=W;canvas.height=H}
  faceCrop.clearRect(0,0,W,H); faceCrop.save(); faceCrop.beginPath()
  row.points.forEach(([px,py],i)=>{if (i) faceCrop.lineTo((px-x)*W/w,(py-y)*H/h); else faceCrop.moveTo((px-x)*W/w,(py-y)*H/h)})
  faceCrop.closePath(); faceCrop.clip('evenodd')
  faceCrop.drawImage(hydraVideo,x*hydraVideo.videoWidth,y*hydraVideo.videoHeight,w*hydraVideo.videoWidth,h*hydraVideo.videoHeight,0,0,W,H)
  faceCrop.restore()
  return canvas
}
function drawMedia(layer, bounds, quad) {
  if (layer.kind==='solid') {
    renderSolid ??= solidRenderer()
    const [left,top,width,height]=bounds
    const w=surfaceArt.canvas.width,h=surfaceArt.canvas.height
    const canvas=renderSolid(solidTools.current(layer.solid),performance.now()/1000,Math.max(width*w,height*h),faceSource)
    if (quad) {
      drawWarp ??= warpRenderer()
      drawWarp(surfaceArt,canvas,[0,0,1,1],quad)
    } else surfaceArt.drawImage(canvas,left*w,top*h,width*w,height*h)
    return
  }
  const input = media.get(layer.file)?.input.current
  input?.animation?.advance()
  const el = layer.kind === 'hydra' ? hydraVideo : input?.model ? input.model.frame(draftModelViews.get(layer) || layer.modelView,undefined,layer) : input?.element
  if (!el || (el instanceof HTMLVideoElement && el.readyState < 2)) return
  const sw = el.videoWidth || el.naturalWidth || el.width
  const sh = el.videoHeight || el.naturalHeight || el.height
  const w = surfaceArt.canvas.width, h = surfaceArt.canvas.height
  const [x, y, dw, dh] = [bounds[0] * w, bounds[1] * h, bounds[2] * w, bounds[3] * h]
  if (!sw || !sh || !dw || !dh) return
  if (quad) {
    drawWarp ??= warpRenderer()
    drawWarp(surfaceArt,el,coverRect(sw/sh,dw/dh),quad,{ellipse:layer.mask==='ellipse'})
    return
  }
  const scale = Math.max(dw / sw, dh / sh)
  const cw = dw / scale, ch = dh / scale
  surfaceArt.save()
  if (layer.mask === 'ellipse') {
    surfaceArt.beginPath()
    surfaceArt.ellipse(x + dw / 2, y + dh / 2, dw / 2, dh / 2, 0, 0, Math.PI * 2)
    surfaceArt.clip()
  }
  surfaceArt.drawImage(el, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, dw, dh)
  surfaceArt.restore()
}
function drawStudio(context = artwork) {
  const {width,height}=context.canvas
  if (scene.studioMode==='sectors') {
    const sectors=hydraConnection?.sectorImage()
    if (sectors) context.drawImage(sectors,0,0,width,height)
  } else if (scene.studioMode==='full' && hydraVideo.readyState>=2) {
    context.drawImage(hydraVideo,0,0,width,height)
  }
}
function drawScene() {
  const { width, height } = artwork.canvas
  surfaceArt.clearRect(0, 0, width, height)
  const stroke = gesture?.kind === 'brush' ? gesture.stroke : null
  for (const id of inkCache.keys()) {
    if (!scene.layers.some(layer => layer.id === id)) inkCache.delete(id)
  }
  for (const layer of scene.layers) {
    if (!layer.visible || layer.opacity === 0) continue
    surfaceArt.globalAlpha = layer.opacity
    const quad=displayQuad(layer)
    if (layer.kind === 'ink') {
      const source=inkLayer(layer,gesture?.target===layer.id ? stroke : null)
      if (quad) {
        drawWarp ??= warpRenderer()
        drawWarp(surfaceArt,source,boundsOf(layer),quad)
        continue
      }
      surfaceArt.drawImage(source,0,0)
    }
    else drawMedia(layer, !quad && gesture?.layer === layer ? gestureRect() : layer.rect,quad)
  }
  surfaceArt.globalAlpha = 1
  if (stroke && !scene.layers.some(layer => layer.id === gesture.target && layer.visible)) drawStroke(surfaceArt, stroke)
  if (pending && gesture?.kind === 'place') drawMedia(pending, gestureRect())
  artwork.clearRect(0, 0, width, height)
  drawStudio()
  artwork.drawImage(surfaceArt.canvas, 0, 0)
}
function drawLineGuide() {
  const editing = editableLine()
  const { width, height } = preview
  let points, drawn
  if (editing) {
    const {layer,stroke} = editing
    points = stroke.points.map(vertex=>layer.quad ? inkPoint(layer,vertex) || vertex : vertex)
    if (gesture?.kind === 'line-vertex') {
      const source = lineVertex(layer,gesture.end)
      if (source) points[gesture.vertex] = inkPoint(layer,source) || points[gesture.vertex]
      guide.save()
      guide.beginPath()
      points.forEach(([x,y],i)=>i ? guide.lineTo(x*width,y*height) : guide.moveTo(x*width,y*height))
      if (stroke.closed) guide.closePath()
      guide.lineWidth=2
      guide.strokeStyle='#c6fc55'
      guide.setLineDash([7,5])
      guide.stroke()
      guide.restore()
    }
  } else {
    points = lineDraft.length ? lineDraft : gesture?.kind === 'line' ? [gesture.start] : []
    drawn = lineCursor && points.length ? [...points,lineCursor] : points
    if (drawn.length >= 2) {
      guide.save()
      guide.globalAlpha=.8
      drawStroke(guide,strokeBrush(drawn))
      guide.restore()
    }
  }
  if (!points.length) return
  const ratio=width/Math.max(1,surface.clientWidth)
  guide.lineWidth=2*ratio
  guide.strokeStyle='#111510'
  guide.fillStyle='#c6fc55'
  for (const [i,[x,y]] of points.entries()) {
    const closing = !editing && i === 0 && lineDraft.length >= 3
    guide.beginPath()
    guide.arc(x*width,y*height,(closing ? 7 : 4.5)*ratio,0,Math.PI*2)
    guide.fill()
    guide.stroke()
  }
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
  if (displayView!=='output') {
    if (scene.studioMode==='sectors') drawStudio(guide)
    guide.drawImage(surfaceArt.canvas, 0, 0)
  }
  else if (!blackout) guide.drawImage(artwork.canvas, 0, 0)
  if (tool === 'line' && displayView !== 'output') drawLineGuide()
  if (tool === 'line') return
  if (tool==='brush' || displayView==='output') return
  const selectedRegion=chosenRegion()
  const outline=gesture?.kind.startsWith('region-') ? gesture.points : selectedRegion?.points
  if (outline?.length) {
    guide.save()
    guide.beginPath()
    outline.forEach(([u,v],i)=>i ? guide.lineTo(u*width,v*height) : guide.moveTo(u*width,v*height))
    guide.closePath(); guide.lineWidth=3; guide.strokeStyle=tool==='shape' ? $('mapShapeColor').value : '#c6fc55'
    guide.setLineDash([8,5]); guide.stroke(); guide.restore()
  }
  const layer = activeLayer()
  updateHandles(layer)
  const quad=layer?.visible && (tool==='select' || tool==='deform') &&
    (displayQuad(layer) || (tool==='deform' && rectQuad(boundsOf(layer))))
  if (quad) {
    guide.beginPath()
    quad.forEach(([u,v],i)=>i ? guide.lineTo(u*width,v*height) : guide.moveTo(u*width,v*height))
    guide.closePath()
    guide.strokeStyle='#c6fc55'; guide.lineWidth=2; guide.stroke()
    if (tool==='select') {
      const [x,y,w,h]=quadBounds(quad), grip=clamp(width/Math.max(1,surface.clientWidth)*6,6,16)
      guide.fillStyle='#c6fc55'
      guide.fillRect((x+w)*width-grip,(y+h)*height-grip,2*grip,2*grip)
    }
    return
  }
  const rect = gesture && ['move', 'resize', 'place'].includes(gesture.kind) ? gestureRect() :
    tool === 'select' && layer?.visible ? boundsOf(layer) : null
  if (!rect) return
  const [x, y, w, h] = [rect[0] * width, rect[1] * height, rect[2] * width, rect[3] * height]
  guide.strokeStyle = guide.fillStyle = '#c6fc55'
  guide.lineWidth = 2
  guide.strokeRect(x, y, w, h)
  const grip = clamp(width / Math.max(1, surface.clientWidth) * 6, 6, 16)
  guide.fillRect(x + w - grip, y + h - grip, grip * 2, grip * 2)
}
function dynamic() {
  return (scene.studioMode !== 'off' && !!hydraConnection) || scene.layers.some(layer => {
    if (!layer.visible) return false
    if (layer.solid) return poseAnimated(solidTools.current(layer.solid).pose) || layer.solid.faces.some(m=>{
      const input=media.get(m.file)?.input.current
      return m.type==='hydra' && !!hydraConnection || input?.element instanceof HTMLVideoElement || input?.animation?.running
    })
    const input = media.get(layer.file)?.input.current
    return (layer.kind === 'hydra' && hydraConnection) || input?.element instanceof HTMLVideoElement ||
      input?.animation?.running || input?.model && poseAnimated(layer.modelView)
  })
}
function render(now) {
  frame = 0
  if (!active) return
  if (displayView === 'surface') camera.current?.animation?.advance()
  if (projection?.window.closed) closeProjection()
  if (hydraConnection && !studio()) signalLost()
  if (dirty || (!calibration && dynamic() && now - lastFrame >= 1000 / 30)) {
    lastFrame = now
    if (!calibration) { drawScene(); previewRevision++ }
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
  clock = document.hidden && output && !output.closed && !output.document.hidden ? output : studioWindow || window
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

function chooseDisplay() {
  studioWindow?.fosfenoDisplay.choose(status,projection?.window)
}
function openProjection() {
  const display=studioWindow.fosfenoDisplay
  const previous=display.current()
  const output = display.open(projection?.window,1000,620,status)
  if (!output) return status('Permití la ventana emergente para abrir el proyector.', true)
  if (output===projection?.window) return true
  try {
    const doc = output.document
    const canvas = doc.createElement('canvas')
    canvas.style.cssText = 'display:block;width:100vw;height:100dvh;object-fit:contain;cursor:none'
    const draw = projectionRenderer(canvas)
    const handback = previous===output && display.owner()==='studio'
    const contextLost=event=>{
      event.preventDefault()
      closeProjection(true)
      status('Se interrumpió WebGL. Volvé a abrir el proyector.',true)
    }
    let detachCode
    display.bind(output,'mapping',()=>{
      canvas.ondblclick=null
      canvas.removeEventListener('webglcontextlost',contextLost)
      doc.removeEventListener('visibilitychange',restartClock)
      detachCode?.()
      canvas.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
      projection=null
      if (calibration) finishCalibrationView()
      sync()
      if (active && clock!==window) restartClock()
      else try { hydraConnection?.refresh() } catch {}
    },status)
    projection = { window: output, canvas, draw, handback }
    doc.title = 'Fosfeno · Proyector de mapeo'
    doc.body.style.cssText = 'margin:0;background:#000;overflow:hidden'
    doc.body.replaceChildren(canvas)
    detachCode = projectorCode?.attach(doc.body,()=>!blackout && !calibration)
    canvas.ondblclick = () => studioWindow.fosfenoDisplay.fullscreen(output,status)
    canvas.addEventListener('webglcontextlost',contextLost)
    doc.addEventListener('visibilitychange', restartClock)
    sizeCanvases()
    sync()
    restartClock()
    return true
  } catch (error) {
    if (projection?.window===output) closeProjection(true)
    else if (output!==previous) output.close()
    errorStatus(error)
  }
}
function closeProjection(closeWindow = false) {
  const output = projection?.window
  if (!output) return
  const display=studioWindow.fosfenoDisplay
  display.unbind(output)
  if (closeWindow && display.current()===output) output.close()
}
function finishCalibrationView() {
  calibration = null
  gesture = null
  displayView=calibrationView?.view==='surface' && !camera.current ? 'canvas' : calibrationView?.view || 'canvas'
  tool=['brush','line'].includes(calibrationView?.tool) ? calibrationView.tool : 'select'
  calibrationView=null
}
function endCalibration() {
  finishCalibrationView()
  sync()
}
function startCalibration() {
  if (!projection || projection.window.closed) return status('Abrí el proyector y ponelo en pantalla completa para calibrar.', true)
  calibrationView ??= {view:displayView,tool}
  if (camera.current?.kind === 'camera' && frozen) {
    frozen = null
    showReference()
  }
  setTool('select', false)
  displayView = 'surface'
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
filePicker('mapReplace','mapReplaceFile',file=>placeFile(file,undefined,replaceTarget))
$('mapReplace').onclick=()=>{
  replaceTarget=selected
  if (replaceTarget) $('mapReplaceFile').click()
}
filePicker('mapReferenceFile', 'mapPhotoFile', file => {
  if (!file.type.startsWith('image/')) return status('Elegí una imagen como referencia.', true)
  return camera.open('file', { file }).catch(() => {})
})
let mapTransfer = false
async function openMap(file) {
  const next = await unpackMap(file)
  automaticShapeFeed.clear()
  if (next.studio && studioWindow) await studioWindow.restoreFosfenoMapping(next.studio)
  if (calibration) endCalibration()
  camera.clear()
  lastCamera = lastReference = null
  setTool('select', false)
  selected = null
  apply(next)
}
function packCurrent() {
  return packMap({ ...scene, studio: studioWindow?.captureFosfenoMapping() || scene.studio })
}
async function transfer(action) {
  if (mapTransfer) return
  mapTransfer = true
  const buttons = ['mapImport', 'mapSave', 'mapRestore', 'mapExport'].map($)
  buttons.forEach(control => { control.disabled = true })
  try {
    await action()
  } catch (error) {
    errorStatus(error)
  } finally {
    mapTransfer = false
    buttons.forEach(control => { control.disabled = false })
  }
}
filePicker('mapImport', 'mapProjectFile', file => transfer(async () => {
  await openMap(file)
  status('Mapa importado. Guardalo si querés actualizar la copia de este navegador.')
}))
$('mapSave').onclick = () => transfer(async () => {
  await studioStore('readwrite', store => store.put(packCurrent(), mapKey))
  status('Mapa y sectores guardados en este navegador.')
})
$('mapRestore').onclick = () => transfer(async () => {
  const saved = await studioStore('readonly', store => store.get(mapKey))
  if (!saved) return status('Todavía no guardaste un mapa.')
  await openMap(saved)
  status('Mapa y sectores recuperados.')
})
$('mapExport').onclick = () => transfer(() => {
  const url = URL.createObjectURL(packCurrent()), link = make('a')
  link.href = url
  link.download = 'Fosfeno-mapa.fosmap'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
})

const sampleDialog = $('mapSamplesDialog')
const sampleStatus = $('mapSamplesStatus')
let sampleRequest
function reportSample(message = '', error = false) {
  sampleStatus.textContent = message
  sampleStatus.dataset.error = error
  sampleStatus.hidden = !message
}
async function addSample(sample) {
  if (sampleRequest || !sampleDialog.open || !active || calibration) return
  const request = new AbortController()
  sampleRequest = request
  const choices = $('mapSampleList').querySelectorAll('button')
  choices.forEach(choice => { choice.disabled = true })
  reportSample('Cargando ' + sample.name + '…')
  try {
    const response = await fetch(sample.path, { signal:request.signal })
    if (!response.ok) throw new Error('No se pudo cargar la muestra.')
    const map = await unpackMap(await response.blob())
    if (request.signal.aborted || !sampleDialog.open || !active || calibration) return
    if (!map.layers.length || map.studio || map.layers.some(layer => layer.kind !== 'ink'))
      throw new Error('La muestra no contiene trazos editables.')
    const layers = map.layers.map(layer => ({ ...layer, id:nextLayer(layer.kind,layer.name).id }))
    sharedItem = selected = selectedStroke = brushLayer = null
    setTool(tool === 'brush' ? 'brush' : 'select', false)
    apply({ ...scene, layers:[...scene.layers,...layers] })
    sampleDialog.close()
    status(sample.name + ' se sumó al mapa.')
  } catch {
    if (!request.signal.aborted) reportSample('No se pudo cargar la muestra. Volvé a intentar.',true)
  } finally {
    if (sampleRequest === request) {
      sampleRequest = null
      choices.forEach(choice => { choice.disabled = false })
    }
  }
}
$('mapSampleList').append(...mappingSamples.map(sample => {
  const row = make('li')
  const choose = button('', () => addSample(sample)), text = make('span'), title = make('strong'), detail = make('small')
  const preview = make('img'), add = make('span')
  choose.className = 'map-sample-choice'
  choose.dataset.mappingSample = sample.id
  choose.setAttribute('aria-label','Sumar ' + sample.name)
  title.textContent = sample.name
  detail.textContent = sample.description
  preview.src = sample.preview
  preview.alt = ''
  preview.loading = 'lazy'
  preview.decoding = 'async'
  add.className = 'map-sample-action'
  add.textContent = 'Sumar al lienzo'
  text.append(title,detail,add)
  choose.append(preview,text)
  const download = make('a')
  download.href = sample.path
  download.download = sample.id + '.fosmap'
  download.textContent = 'Descargar'
  download.className = 'map-sample-download'
  download.setAttribute('aria-label','Descargar ' + sample.name)
  row.append(choose,download)
  return row
}))
$('mapSamples').onclick = () => {
  reportSample()
  sampleDialog.showModal()
}
$('mapCloseSamples').onclick = () => sampleDialog.close()
sampleDialog.addEventListener('close', () => sampleRequest?.abort())

const loopList = $('mapLoopList')
function toggleLoops(open) {
  loopList.hidden = !open
  $('mapLoops').setAttribute('aria-expanded', String(open))
  $('mapReplaceLoop').setAttribute('aria-expanded',String(open && !!loopTarget))
}
async function chooseLoop(trigger, targetId) {
  const open = loopList.hidden || loopTarget !== targetId
  loopTarget=targetId
  toggleLoops(open)
  if (!open) return
  const width=Math.min(350,innerWidth-20), rect=trigger.getBoundingClientRect()
  loopList.style.width=width+'px'
  loopList.style.left=clamp(rect.left,10,innerWidth-width-10)+'px'
  const below=innerHeight-rect.bottom
  loopList.style.top=below>145 ? (rect.bottom+3)+'px' : 'auto'
  loopList.style.bottom=below>145 ? 'auto' : (innerHeight-rect.top+3)+'px'
  loopList.textContent = 'Cargando loops…'
  try {
    const keys = await studioStore('readonly', store => store.getAllKeys(IDBKeyRange.bound(['loop'], ['loop', []])))
    const rows = keys.reverse().map(key => button(key[3], async () => {
      toggleLoops(false)
      try {
        const file = await studioStore('readonly', store => store.get(key))
        if (!file) throw new Error('Este loop ya no está en la biblioteca.')
        if (typeof targetId==='function') await targetId(file)
        else await placeFile(file, 'loop', targetId)
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
$('mapLoops').onclick=()=>chooseLoop($('mapLoops'),null)
$('mapReplaceLoop').onclick=()=>chooseLoop($('mapReplaceLoop'),selected)
document.addEventListener('pointerdown', event => {
  if (showShapeMenu && !event.target.closest('#mapShapeOptions,#mapShape')) {
    showShapeMenu=false
    $('mapShapeOptions').hidden=true
    $('mapShape').setAttribute('aria-expanded','false')
  }
  if (!loopList.hidden && !event.target.closest('#mapLoopList, #mapLoops, #mapReplaceLoop, #mapFaceLoop')) toggleLoops(false)
  for (const menu of document.querySelectorAll('.map-choice[open]'))
    if (!menu.contains(event.target)) menu.open = false
})

function chooseBrush(newLayer = false) {
  if (calibration) endCalibration()
  brushOptionsOpen=newLayer || tool!=='brush' || !brushOptionsOpen
  const layer = activeLayer()
  brushLayer = !newLayer && layer?.kind === 'ink' ? layer.id : null
  selected = brushLayer
  selectedStroke = null
  sharedItem=null
  setTool('brush')
  status('Arrastrá o tocá la superficie para pintar.')
}
function chooseLine() {
  if (calibration) endCalibration()
  const layer = activeLayer()
  brushLayer = layer?.kind === 'ink' ? layer.id : null
  selected = brushLayer
  selectedStroke = null
  sharedItem = null
  historyScope = 'map'
  if (displayView === 'output') displayView = 'canvas'
  setTool('line')
  status('')
}
function cancelLine() {
  resetLine()
  gesture = null
  if (editableLine()) setTool('select')
  else sync()
  status('')
}
for (const [id, action] of [['mapFinishLine',()=>finishLine()],['mapCloseLine',()=>finishLine(true)],['mapCancelLine',cancelLine]]) {
  $(id).onclick=()=>{
    action()
    document.querySelector('[data-tool="line"]').focus()
  }
}
$('mapEditLine').onclick = () => {
  if (editableLine()) {
    setTool('select')
    status('')
    return
  }
  resetLine()
  if (displayView === 'output') displayView = 'canvas'
  setTool('line')
  status('')
  viewport.scrollIntoView({block:'nearest'})
}
$('mapLineStyle').onclick = () => {
  lineStyleOpen = !lineStyleOpen
  syncLine()
}
function selectDisplay(view) {
  displayView = view
  sync()
}
for (const button of document.querySelectorAll('button[data-map-view]'))
  button.onclick = () => selectDisplay(button.dataset.mapView)
$('mapNewInk').onclick = () => chooseBrush(true)
$('mapAddHydra').onclick=()=>place(nextLayer('hydra','Recorte Hydra'))
$('mapBrushColor').oninput = event => {
  const value = event.target.value
  const valid = /^#[\da-f]{6}$/i.test(value)
  event.target.setAttribute('aria-invalid', String(!valid))
  if (valid && !changeStroke({color:value})) brushColor = value
}
$('mapBrushSize').oninput = event => { $('mapBrushValue').value = event.target.value; fillTrack(event.target) }
$('mapBrushSize').onchange=event=>{
  const size=Number(event.target.value)
  if (!changeStroke({size})) brushSize=size
}
$('mapLayerName').onchange=event=>{
  const layer=activeLayer()
  if (!layer) return
  const name=event.target.value.trim() || layer.name
  event.target.value=name
  if (name!==layer.name) editLayer(layer,{name})
}
$('mapLayerName').onkeydown=event=>{ if (event.key==='Enter') event.target.blur() }
$('mapStrokes').ontoggle=()=>{
  if (!$('mapStrokes').open) selectedStroke=null
  sync()
}
$('mapRemoveStroke').onclick=()=>{
  const layer=activeLayer()
  if (!layer?.strokes?.[selectedStroke]) return
  const strokes=layer.strokes.filter((_,i)=>i!==selectedStroke)
  selectedStroke=null
  if (strokes.length) editLayer(layer,{strokes})
  else $('mapRemoveLayer').click()
}
$('mapChooseDisplay').onclick = chooseDisplay
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
$('mapUndo').onclick = () => useHistory(true)
$('mapRedo').onclick = () => useHistory(false)
$('mapRemoveLayer').onclick = () => objectAction('delete')
$('mapLayerUp').onclick = () => reorder(1)
$('mapLayerDown').onclick = () => reorder(-1)
function bringSurfaceIntoView() {
  const box=surface.getBoundingClientRect()
  if (box.top<0 || box.bottom>innerHeight) surface.scrollIntoView({block:'center',inline:'nearest'})
}
$('mapMoveObject').onclick=()=>{
  if (displayView==='output') displayView=camera.current ? 'surface' : 'canvas'
  selectLayer(activeLayer())
  bringSurfaceIntoView()
  surface.focus({preventScroll:true})
}
$('mapDeform').onclick=()=>{
  const layer=activeLayer()
  if (!layer?.visible) return
  const on=tool!=='deform'
  if (calibration) endCalibration()
  if (displayView==='output') displayView=camera.current ? 'surface' : 'canvas'
  activeCorner=0
  selectedStroke=null
  setTool(on ? 'deform' : 'select')
  status(on ? 'Arrastrá las esquinas. Las flechas ajustan la esquina elegida.' : 'Arrastrá el objeto o usá las flechas para moverlo.')
  if (on) {
    bringSurfaceIntoView()
    $('mapHandles').children[0].focus({preventScroll:true})
  }
}
for (const button of $('mapHandles').children) {
  button.onfocus=()=>{ activeCorner=Number(button.dataset.corner); updateHandles(activeLayer()) }
}
function cloneObject(source) {
  const original=actualBox(source), [x,y,w,h]=original
  const position=changedBox(source,original,[x+.025,y+.025,w,h])
  addLayer({...source,...position,id:nextLayer(source.kind,source.name).id,name:source.name+' · copia'})
}
function objectAction(action,value,repeat=false) {
  const layer=activeLayer()
  if (action==='paste' && copiedLayer) { cloneObject(copiedLayer); return true }
  if (!layer || sharedItem || calibration) return false
  if (action==='copy') { copiedLayer=layer; status('Objeto copiado.'); return true }
  if (action==='duplicate') { cloneObject(layer); return true }
  if (action==='delete') { apply({...scene,layers:scene.layers.filter(l=>l!==layer)}); return true }
  if (action==='toggle') { editLayer(layer,{visible:!layer.visible}); return true }
  if (action==='front' || action==='back') {
    const others=scene.layers.filter(l=>l!==layer)
    if ((action==='front' ? scene.layers.at(-1) : scene.layers[0])===layer) return false
    apply({...scene,layers:action==='front' ? [...others,layer] : [layer,...others]})
    return true
  }
  if (action==='move') { $('mapMoveObject').click(); return true }
  if (action==='deform') { if (tool!=='deform') $('mapDeform').click(); return true }
  if (action==='resetTransform') {
    if (!layer.quad) return false
    editLayer(layer,{quad:undefined,...(layer.kind==='ink' ? {rect:undefined} : {})})
    return true
  }
  const rect=boundsOf(layer), initial=layer.quad || rectQuad(rect)
  const quad=action==='corner' ? initial.map(([x,y],i)=>i===activeCorner ? [x+value[0],y+value[1]] : [x,y]) :
    transformQuad(initial,rect,scene.aspect,action,value)
  if (!quad || !validQuad(quad) || quad.every(([x,y],i)=>Math.abs(x-initial[i][0])+Math.abs(y-initial[i][1])<1e-12)) return false
  const layers=scene.layers.map(l=>l===layer ? {...l,rect,quad} : l)
  if (repeat) assign({...scene,layers})
  else apply({...scene,layers})
  return true
}
$('mapCenter').onclick=()=>objectAction('center')
$('mapResetQuad').onclick=()=>objectAction('resetTransform')
for (const [id,action] of Object.entries({mapX:'x',mapY:'y',mapWidth:'width',mapHeight:'height',mapRotate:'rotate',mapScale:'scale'})) {
  const input=$(id)
  input.onchange=()=>{
    if (!input.validity.valid || !objectAction(action,input.valueAsNumber)) input.value=input.dataset.current
  }
  input.onkeydown=event=>{ if (event.key==='Enter') { event.preventDefault(); input.blur() } }
}
let sectorCopySource
function sectorCopyRect(layer) {
  if (!layer.quad) return boundsOf(layer)
  const rect=quadBounds(layer.quad)
  if (rect[0]<0 || rect[1]<0 || rect[0]+rect[2]>1 || rect[1]+rect[3]>1) return null
  return rectQuad(rect).every(([x,y],i)=>Math.abs(x-layer.quad[i][0])+Math.abs(y-layer.quad[i][1])<1e-8) ? rect : null
}
$('mapToSector').onclick=()=>{
  sectorCopySource=activeLayer()
  if (!sectorCopySource) return
  let info=sectorCopySource.kind==='ink' ?
    'Los trazos se copian como una imagen transparente. El original queda editable en el mapa. El sector empieza oculto.' :
    'El sector conserva el archivo, el recorte y la opacidad. Empieza oculto para que puedas preparar los efectos. El original sigue en el mapa.'
  if (!sectorCopyRect(sectorCopySource)) info+=' El sector usa el rectángulo original. La transformación de cuatro esquinas se conserva en Mapeo.'
  $('mapCopyInfo').textContent=info
  $('mapCopyDialog').showModal()
  $('mapCancelCopy').focus()
}
$('mapCancelCopy').onclick=()=>$('mapCopyDialog').close()
$('mapConfirmCopy').onclick = async () => {
  const layer=sectorCopySource
  if (!layer || !scene.layers.includes(layer)) { $('mapCopyDialog').close(); return }
  $('mapConfirmCopy').disabled = true
  try {
    let object={...layer,visible:false}
    if (layer.kind==='ink') {
      const rect=boundsOf(layer)
      const source=inkLayer(layer), crop=make('canvas')
      crop.width=Math.max(1,Math.round(rect[2]*source.width))
      crop.height=Math.max(1,Math.round(rect[3]*source.height))
      crop.getContext('2d').drawImage(source,rect[0]*source.width,rect[1]*source.height,rect[2]*source.width,rect[3]*source.height,0,0,crop.width,crop.height)
      const png=await new Promise(resolve=>crop.toBlob(resolve,'image/png'))
      if (!png) throw new Error('No se pudo copiar la imagen de los trazos.')
      object={...object,kind:'file',file:new File([png],layer.name+'.png',{type:'image/png'}),rect,mask:'rect'}
    }
    object.rect=sectorCopyRect(layer) || boundsOf(layer)
    $('mapCopyDialog').close()
    const copied=await studioWindow.copyFosfenoMappingLayer(object)
    if (copied) { sharedItem=copied; selected=null; sync() }
    status('Sector copiado. El original sigue en el mapa.')
  } catch (error) { errorStatus(error) }
  finally { $('mapConfirmCopy').disabled = false }
}
let opacityStart
$('mapOpacity').oninput = event => {
  const layer = activeLayer()
  if (!layer) return
  opacityStart ??= scene
  const value = Number(event.target.value)
  fillTrack(event.target)
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

for (const el of document.querySelectorAll('[data-tool],[data-brush],[data-color],[data-mask],[data-format],[data-hydra]')) el.onclick = () => {
  const { tool: next, brush, color, mask, format, hydra } = el.dataset
  if (next === 'brush') chooseBrush()
  else if (next==='shape') chooseShape()
  else if (next === 'line') chooseLine()
  else if (next) {
    if (calibration) endCalibration()
    setTool(next)
    status('')
  } else if (brush) {
    if (!changeStroke({style:brush})) { brushStyle=brush; sync() }
  } else if (color) {
    if (!changeStroke({color})) brushColor = $('mapBrushColor').value = color
    $('mapBrushColor').setAttribute('aria-invalid', 'false')
  } else if (hydra) {
    automaticShapeFeed.clear()
    if (hydra===scene.studioMode) return
    apply({ ...scene, studioMode: hydra })
    status(hydra==='full' ? 'Fondo Hydra activado en el proyector.' :
      hydra==='sectors' ? 'Sólo los sectores de Hydra van al proyector.' : 'Señal del Estudio apagada en el proyector.')
  }
  else if (mask && activeLayer()) editLayer(activeLayer(), { mask })
  else if (format) {
    $('mapFormatChoice').open = false
    if (format === scene.format) return
    if (calibration) endCalibration()
    assignGeometry({ format, calibration: null })
    status('Formato actualizado. Calibrá con este formato para alinear la salida.')
  }
}
new EditorMenu($('mapContext'),(node,event,opening)=>{
  if (!active || calibration || gesture || !node.closest('#mapSurface,#mapLayers,#mapLayerControls,#mapStudioLayers,#mapStackInspector,#mapContext') &&
      (opening || !node.closest('#mapMain') && node!==document.body)) return null
  const onSurface=node.closest('#mapSurface')
  const at=onSurface && event && pointer(event)
  const nativeRow=node.closest('.map-layer[data-id]')
  const treeRef=availableItems.get(node.closest('[data-item]')?.dataset.item)?.ref
  const native=at ? hitAt(at) : nativeRow ? scene.layers.find(l=>l.id===nativeRow.dataset.id) : treeRef ? null : activeLayer()
  const strokeButton=node.closest('#mapStrokeList button'), faceButton=node.closest('#mapSolidFaces button')
  const editMaterial=(layer,face)=>{
    const material=layer.solid.faces[face]
    const button=$(material?.type==='file' ? 'mapFaceFile' : material?.type==='hydra' ? 'mapFaceHydra' : 'mapFaceColor')
    if (button.getAttribute('aria-expanded')==='false') button.click()
    const field=button.id==='mapFaceColor' ? $('mapFaceColors').querySelector('button') :
      button.id==='mapFaceHydra' ? $('mapFaceSources').querySelector('button') : button
    field.focus()
  }
  if (native && (strokeButton || faceButton)) {
    const control=strokeButton || faceButton
    const stroke=strokeButton && native.strokes[Array.from($('mapStrokeList').children).indexOf(strokeButton)]
    const face=faceButton && Number(faceButton.dataset.face)
    return {name:control.textContent,menu:stroke ? ['inspect','remove'] : ['inspect','code'],
      keys:stroke ? ['remove'] : [],labels:{inspect:stroke ? 'Editar trazo' : 'Editar material',remove:'Quitar trazo',code:'Ver definición'},
      choose:()=>control.click(),run:action=>{
        const layer=activeLayer()
        if (layer?.id!==native.id) throw new Error('La selección del mapa cambió.')
        if (stroke) {
          selectedStroke=layer.strokes.indexOf(stroke)
          if (selectedStroke<0) throw new Error('Ese trazo ya no está en el objeto.')
          if (action==='remove') return $('mapRemoveStroke').click()
          sync();$('mapBrushSize').focus()
        } else if (action==='code') showMapDefinition(layer,false,face)
        else editMaterial(layer,face)
      }}
  }
  const hit=at && !native && studioSectorAt(at)
  const ref=at ? (hit && {sectorId:hit.id,layerId:0,kind:'sector'}) : treeRef || (!native && sharedItem)
  const tools=['select','brush','line']
  if (ref && sharedStack) {
    const entry=availableItems.get(itemKey(ref))
    const spec=EditorMenu.stack(ref,sharedStack.capabilities(ref),entry?.muted,sharedStack.snapshot())
    if (node.closest('#mapSectorHandles')) spec.keys=spec.keys.filter(key=>key!=='nudge')
    spec.keys.push('brush','line')
    const anchor=()=>treeRef && $('mapStudioLayers').querySelector('[data-item="'+CSS.escape(itemKey(ref))+'"] .map-layer-name')
    return {...spec,name:entry?.label || 'Sector',anchor,choose:()=>selectStudio(ref,false),run:async(action,delta)=>{
      if (['inspect','code','effects','library'].includes(action)) return sharedStack.command(action,ref)
      if (tools.includes(action)) return document.querySelector('[data-tool="'+action+'"]').click()
      if (action==='deform') {
        if (displayView==='output') displayView=camera.current?'surface':'canvas'
        setTool('sector-deform'); surface.focus({preventScroll:true}); return
      }
      if (action==='center') return shapeGeometry.transform(ref.sectorId,'center')
      if (action==='nudge') {
        const row=sharedRows.find(r=>r.id===ref.sectorId)
        return shapeGeometry.update(row.id,row.points,shapeGeometry.drag(row.points,-1,delta[0]/preview.width,delta[1]/preview.height))
      }
      const next=await sharedStack.command(action,ref)
      if (action==='copy') copiedLayer=null
      if (next && ['duplicate','paste'].includes(action)) selectStudio(next)
      if (action==='remove') sharedItem=null
      studioRowsKey=null;sync()
    }}
  }
  const keys=[...tools], choices=[]
  const face=native?.kind==='solid' && at ? faceAtMap(native,at) : solidTools.selectedFace(native?.id)
  if (native) {
    choices.push('inspect','rename','code')
    if (studioWindow?.openFosfenoCode && hydraOrigin(native,face)) choices.push('origin')
    if (native.visible) choices.push('deform','center')
    if (native.quad) choices.push('resetTransform')
    choices.push('toggle','duplicate','copy')
    if (scene.layers.indexOf(native)<scene.layers.length-1) choices.push('up')
    if (scene.layers.indexOf(native)>0) choices.push('down')
    keys.push('duplicate','remove',...choices.filter(k=>k==='up' || k==='down'))
  } else choices.push(...tools,'shape')
  if (copiedLayer) choices.push('paste')
  if (native) choices.push('remove')
  else if (history.length || future.length) choices.push(...(history.length?['undo']:[]),...(future.length?['redo']:[]))
  const anchor=()=>nativeRow && $('mapLayers').querySelector('[data-id="'+CSS.escape(nativeRow.dataset.id)+'"] .map-layer-name')
  return {menu:choices,keys,anchor,labels:{inspect:native?.kind==='ink'?'Editar trazos':native?.kind==='solid'?'Editar caras':'Editar propiedades',
    rename:'Renombrar',code:'Ver definición',origin:'Código de origen',toggle:native?.visible?'Ocultar':'Mostrar'},name:native?.name || 'Lienzo',
    choose:()=>{if (native && native!==activeLayer()) selectLayer(native)},run:async action=>{
      if (tools.includes(action) || action==='shape') return document.querySelector('[data-tool="'+action+'"]').click()
      if (action==='undo' || action==='redo') return useHistory(action==='undo')
      if (native && native!==activeLayer()) {
        const live=scene.layers.find(layer=>layer.id===native.id)
        if (!live) throw new Error('Ese objeto ya no está en el mapa.')
        selectLayer(live)
      }
      if (native && (action==='code' || action==='origin')) return showMapDefinition(activeLayer(),action==='origin',face)
      if (action==='rename') {
        const name=$('mapLayerName')
        name.focus();name.select();return
      }
      if (action==='inspect') {
        const layer=activeLayer()
        let field=$('mapOpacity')
        if (layer.kind==='ink' && layer.strokes.length) {
          $('mapStrokes').open=true
          renderStrokes(layer)
          field=$('mapStrokeList').querySelector('button[aria-pressed=true]') || $('mapStrokeList').firstElementChild
          field.click()
          field=$('mapBrushSize')
        } else if (layer.kind==='solid') {
          field=$('mapSolidFaces').querySelector('[data-face="'+face+'"]') || $('mapSolidFaces').firstElementChild
          field?.click()
          return editMaterial(layer,face)
        }
        field.focus()
        return
      }
      if (action==='up' || action==='down') return reorder(action==='up'?1:-1)
      await window.fosfenoMapping.action(action==='remove'?'delete':action)
    }}
},errorStatus)
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.isComposing || EditorMenu.editing(event.target)) return
  const field = event.target.closest('input:not([type=range]),textarea,[contenteditable]')
  if (event.key === 'Enter' && lineDraft.length >= 2 &&
      !event.target.closest('input,textarea,[contenteditable],button')) {
    event.preventDefault()
    finishLine()
    return
  }
  if (event.key === 'Escape') {
    if (calibration) $('mapCancel').click()
    else if (!loopList.hidden) { toggleLoops(false); $('mapLoops').focus() }
    else if (tool === 'line' && (lineDraft.length || gesture || editableLine())) cancelLine()
    else if (tool === 'place' || tool==='shape' || tool==='sector-deform' || gesture) { setTool('select'); status('') }
    for (const menu of document.querySelectorAll('.map-choice[open]')) {
      menu.open = false
      menu.querySelector('summary').focus()
    }
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !calibration && !gesture &&
      ['select','deform'].includes(tool) && event.key.startsWith('Arrow') && activeLayer()?.visible &&
      !event.target.closest('input,textarea,[contenteditable],dialog') &&
      event.target.closest('#mapSurface,#mapLayers,#mapLayerControls,button[data-tool="select"]')) {
    const [vx,vy]=({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]})[event.key]
    const step=event.shiftKey ? 10 : 1
    const dx=vx*step/preview.width, dy=vy*step/preview.height
    event.preventDefault()
    objectAction(tool==='deform' ? 'corner' : 'nudge',[dx,dy],event.repeat)
    return
  }
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.repeat || calibration ||
      field ||
      window.getSelection()?.isCollapsed === false) return
  const key = event.key.toLowerCase()
  if (key === 'z' || key === 'y') {
    event.preventDefault()
    useHistory(key==='z' && !event.shiftKey)
  } else if (key==='c' && activeLayer()) {
    event.preventDefault()
    objectAction('copy')
  } else if (key==='v' && copiedLayer) {
    event.preventDefault()
    objectAction('paste')
  }
})

function deactivate(returnToStudio=false) {
  active = false
  resetLine()
  if (sampleDialog.open) sampleDialog.close()
  displayView = 'canvas'
  if (!clock.closed) clock.cancelAnimationFrame(frame)
  frame = 0
  const publicWindow=returnToStudio===true && projection?.handback && studioWindow.fosfenoDisplay.current()
  closeProjection(!publicWindow)
  disconnectHydra()
  camera.clear()
  for (const { input } of media.values()) input.clear()
  media.clear()
  return publicWindow
}
function activate() {
  if (!active) {
    active = true
    updateSources()
    sync()
    restartClock()
  }
}
const seedScope = () => sharedItem || {sectorId:0,layerId:0,kind:'sector'}
$('mapNewSeed').onclick = () => {
  try {
    const item = studioWindow.fosfenoSeeds.generate(seedScope())
    if (item && !$('mapApplySeed').hidden) status(item.name+' preparada. Enviar a salida la proyecta.')
  } catch (error) { errorStatus(error) }
}
$('mapEditSeed').onclick = () => {
  try { studioWindow.fosfenoSeeds.edit(seedScope()) }
  catch (error) { errorStatus(error) }
}
$('mapApplySeed').onclick = () => studioWindow.fosfenoSeeds.send().catch(errorStatus)
window.fosfenoMapping = { activate, deactivate, openProjection, chooseDisplay, action:objectAction, codeTarget:selectedMapCode,
  canPaste:()=>!!copiedLayer,
  pendingSeed(pending) { $('mapApplySeed').hidden=!pending },
  showSeed(sectorId,name,visibility) {
    const mode = sectorId ? (scene.studioMode==='off' ? 'sectors' : scene.studioMode) : 'full'
    if (!calibration) displayView='output'
    if (mode!==scene.studioMode) apply({...scene,studioMode:mode})
    else sync()
    const location = sharedRows.find(row=>row.id===sectorId)?.name || 'Toda la visual'
    status([name,location,visibility,blackout ? 'Apagón activo' : calibration ? 'Calibrando' : ''].filter(Boolean).join(' · '))
  },
  size: () => [artwork.canvas.width, artwork.canvas.height],
  hideBase: () => {
    if (scene.studioMode !== 'full') return
    apply({ ...scene, studioMode: 'sectors' })
    status('Fondo Hydra quitado. Los sectores siguen en salida.')
  },
  preview: () => ({canvas:artwork.canvas, frame:scene.studioMode==='full' && !blackout && hydraVideo.readyState<2 ? 0 : previewRevision, blackout}) }
window.addEventListener('pagehide', deactivate)
window.addEventListener('pageshow', event => { if (event.persisted) activate() })
$('mapBoot').hidden = true
$('mapHeader').hidden = $('mapMain').hidden = false
sizeCanvases()
sync()
updateSources()
schedule()
