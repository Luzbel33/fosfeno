'use strict'
const $ = (id) => document.getElementById(id)
const all = (sel, root = document) => Array.from(root.querySelectorAll(sel))
const paths = {
  wave: 'M2 12h3l2-7 4 14 3-13 3 10 2-4h3',
  sliders: 'M4 6h7m4 0h5M4 12h2m4 0h10M4 18h10m4 0h2 M11 3v6m-5 0v6m8 0v6',
  expand: 'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5',
  prev: 'M6 5v14m12-13-9 6 9 6z',
  next: 'M18 5v14M6 6l9 6-9 6z',
  cycle: 'M19 9a7.5 7.5 0 1 0 .2 6M19 4v5h-5',
  bolt: 'm13 2-8 12h6l-1 8 9-13h-6z',
  shuffle: 'M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-1 5-4m2-5c2-3 3-3 5-3h3m-4-4 4 4-4 4',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  keyboard: 'M2 6h20v13H2zM5 10h1m3 0h1m3 0h1m3 0h1M7 15h10',
  close: 'm5 5 14 14M19 5 5 19',
  camera: 'M3 7h12v12H3zM15 11l6-4v12l-6-4z',
  screen: 'M2 4h20v13H2zM12 17v4m-5 0h10',
  upload: 'M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5',
  mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0m-7 7v4m-4 0h8',
  record: 'M19 12a7 7 0 1 1-14 0 7 7 0 1 1 14 0z',
  external: 'M13 3h8v8m0-8L10 14M10 6H4v14h14v-6',
  plus: 'M12 4v16M4 12h16',
  play: 'm7 4 13 8-13 8z',
  pause: 'M8 5v14m8-14v14',
  trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15'
}
function icon(name) {
  return (
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' + paths[name] + '"/></svg>'
  )
}
all('i[data-icon]').forEach((n) => (n.outerHTML = icon(n.dataset.icon)))
const state = {
  mode: 'hybrid',
  scene: 0,
  second: 4,
  layerMix: 0,
  auto: true,
  interval: 60,
  energy: 0.68,
  echo: 0.18,
  hydraMix: 0.025,
  hue: 0,
  symmetry: 0,
  mutation: 0,
  mutationTarget: 0,
  impulse: 0,
  pointer: [0.5, 0.5],
  bands: [0, 0, 0],
  fusion: 0.65,
  brush: 0.42,
  painting: false,
  bpm: 130,
  sensitivity: 1.45,
  quality: 'auto'
}
if (matchMedia('(prefers-reduced-motion:reduce)').matches) state.energy = 0.32
const canvas = $('visual'),
  stage = $('stage'),
  panel = $('panel'),
  brush = new BrushSurface()
let engine,
  source = null,
  sourceStream = null,
  sourceURL = '',
  sourceRequest = 0,
  projector = null,
  projectStream = null,
  wakeLock = null
let sceneAge = 0,
  sessionAge = 0,
  last = 0,
  lastUI = 0,
  frameCount = 0,
  frameMs = 0,
  adaptWindows = 0,
  lastUpscale = 0,
  toastTimer,
  held = false,
  bag = [],
  frameId = 0,
  editScene = 0
let frameClock = window,
  deadline = 0,
  contextLost = false
const sound = new SoundDesk(refreshSound, notify)
function notify(message) {
  const el = $('toast')
  ;(panel.open ? panel : document.body).append(el)
  el.textContent = message
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500)
}
function messageFor(err) {
  if (err?.name === 'NotAllowedError')
    return 'Permiso denegado o selección cancelada. Podés volver a conectar la fuente desde el panel.'
  if (err?.name === 'NotFoundError') return 'Este equipo no encontró el dispositivo solicitado.'
  if (err?.name === 'NotReadableError')
    return 'No se pudo leer el dispositivo. Revisá si otra aplicación lo está usando.'
  return err?.message || 'No se pudo abrir la fuente.'
}
function action(button, fn) {
  button.addEventListener('click', async () => {
    button.disabled = true
    try {
      await fn()
    } catch (err) {
      notify(messageFor(err))
    } finally {
      button.disabled = false
    }
  })
}
function openPanel(tab) {
  if (!panel.open) panel.showModal()
  all('[data-tab]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab)
    b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false')
  })
  all('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== tab))
  panel.querySelector('.panel-scroll').scrollTop = 0
}
$('panelOpen').onclick = () => openPanel('mix')
$('soundOpen').onclick = $('signalOpen').onclick = () => openPanel('audio')
$('helpOpen').onclick = () => openPanel('out')
$('closePanel').onclick = () => panel.close()
panel.addEventListener('click', (e) => {
  if (e.target === panel && e.clientX < panel.getBoundingClientRect().left) panel.close()
})
panel.addEventListener('close', () => document.body.append($('toast')))
all('[data-tab]').forEach((b) => (b.onclick = () => openPanel(b.dataset.tab)))

function sceneUI() {
  const native = state.mode === 'hydra'
  $('sceneName').textContent = (native ? PATCHES : WORLDS)[state.scene].name
  $('family').textContent = native ? 'Síntesis Hydra' : WORLDS[state.scene].family
  $('sceneId').textContent = 'ESCENA ' + String(state.scene + 1).padStart(2, '0') + ' / 06'
  $('engineLabel').textContent = native ? 'Hydra puro' : 'Hydra + GLSL'
  if (document.activeElement !== $('code') || !panel.open) {
    editScene = state.scene
    $('code').value = engine?.patchText[editScene] || PATCHES[editScene].code
    $('codeStatus').textContent = PATCHES[editScene].name
  }
  all('.scene-card').forEach((card, i) => {
    card.setAttribute('aria-pressed', String(i === state.scene))
    card.querySelector('.name').textContent = (native ? PATCHES : WORLDS)[i].name
    const path = 'assets/' + (native ? 'patch' : 'scene') + '-' + (i + 1) + '.webp'
    if (card.querySelector('img').getAttribute('src') !== path) card.querySelector('img').src = path
  })
}
WORLDS.forEach((world, i) => {
  const b = document.createElement('button')
  b.className = 'scene-card'
  b.dataset.scene = i
  b.innerHTML =
    '<span class="thumb"><img alt=""><span class="num">' +
    String(i + 1).padStart(2, '0') +
    '</span></span><span class="card-title"><span class="name"></span><span class="playing" aria-hidden="true"><i></i><i></i><i></i></span></span>'
  b.onclick = () => go(i)
  $('sceneBank').append(b)
})
function go(i) {
  if (!engine) return
  i = (i + 6) % 6
  if (i === state.scene) return
  state.scene = i
  sceneAge = 0
  bag = bag.filter((n) => n !== i)
  engine.scene(i, Math.random() * 4.8)
  sceneUI()
}
function nextAuto() {
  if (!bag.length) {
    bag = WORLDS.map((_, i) => i).filter((i) => i !== state.scene)
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }
  }
  go(bag.pop())
}
function mutate() {
  state.mutationTarget += 1.4 + Math.random() * 3
  state.impulse = 1
  notify('Nueva variación de ' + $('sceneName').textContent)
}
$('mutate').onclick = $('panelMutate').onclick = mutate
$('prev').onclick = () => go(state.scene - 1)
$('next').onclick = () => go(state.scene + 1)
$('automate').onclick = () => {
  state.auto = !state.auto
  $('automate').setAttribute('aria-pressed', state.auto)
}
const intervals = [15, 30, 60, 90, 120, 240]
$('interval').onclick = () => {
  state.interval = intervals[(intervals.indexOf(state.interval) + 1) % intervals.length]
  sceneAge = 0
  $('interval').innerHTML = state.interval + ' s ' + icon('cycle')
}
function meterStyle(el) {
  el.style.setProperty('--amount', (100 * (+el.value - el.min)) / (el.max - el.min) + '%')
}
function bindRange(el, fn, format) {
  const out = document.querySelector('output[for="' + el.id + '"]')
  const update = () => {
    fn(+el.value)
    out.textContent = format(+el.value)
    meterStyle(el)
  }
  el.oninput = update
  update()
}
function range(parent, key, label, min, max, value, fn, format = (v) => v + '%') {
  const l = document.createElement('label')
  l.className = 'param'
  l.innerHTML =
    '<span class="param-name">' +
    label +
    '<output for="' +
    key +
    '"></output></span><input type="range" id="' +
    key +
    '" min="' +
    min +
    '" max="' +
    max +
    '" value="' +
    value +
    '">'
  $(parent).append(l)
  bindRange($(key), fn, format)
}
$('energy').value = Math.round(state.energy * 100)
bindRange(
  $('energy'),
  (v) => (state.energy = v / 100),
  (v) => v + '%'
)
range('mixRanges', 'echo', 'Eco de video', 0, 100, 18, (v) => (state.echo = v / 100))
range('mixRanges', 'hydraMix', 'Capa Hydra', 0, 100, 3, (v) => (state.hydraMix = v / 100))
range('mixRanges', 'symmetry', 'Pliegue de simetría', 0, 100, 0, (v) => (state.symmetry = v / 100))
range('layerRange', 'layerMix', 'Cruce de escenas', 0, 100, 0, (v) => {
  const had = state.layerMix > 0
  state.layerMix = v / 100
  if (had !== v > 0) engine?.compose()
})
WORLDS.forEach((world, i) => {
  const b = document.createElement('button')
  b.textContent = world.name
  b.dataset.second = String(i)
  b.onclick = () => {
    state.second = i
    selectButtons('[data-second]', 'second', String(i))
  }
  $('secondWorld').append(b)
})
selectButtons('[data-second]', 'second', String(state.second))
range('inputRanges', 'fusion', 'Fusión de la fuente', 0, 100, 65, (v) => (state.fusion = v / 100))
range('inputRanges', 'brushSize', 'Grosor del pincel', 0, 100, 42, (v) => (state.brush = v / 100))
range('audioRanges', 'sensitivity', 'Sensibilidad', 20, 300, 145, (v) => (state.sensitivity = v / 100))
range(
  'audioRanges',
  'bpm',
  'Pulso interno',
  55,
  220,
  130,
  (v) => (state.bpm = v),
  (v) => v + ' BPM'
)
function selectButtons(sel, attr, value) {
  all(sel).forEach((b) => {
    const on = b.dataset[attr] === value
    b.classList.toggle('active', on)
    b.setAttribute('aria-pressed', on)
  })
}
all('[data-mode]').forEach(
  (b) =>
    (b.onclick = () => {
      state.mode = b.dataset.mode
      selectButtons('[data-mode]', 'mode', state.mode)
      engine?.compose()
      sceneUI()
      const native = state.mode === 'hydra'
      $('hydraMix').closest('label').hidden = native
      $('crossDesk').hidden = native
      $('patchDesk').hidden = !native
      $('modeHint').textContent = native
        ? 'Banco de seis patches de osciladores, ruido y realimentación del sintetizador Hydra.'
        : 'Escenas procedurales con una segunda capa de síntesis y memoria de video.'
    })
)
selectButtons('[data-mode]', 'mode', 'hybrid')
function applyPatch(reset) {
  try {
    const text = reset ? PATCHES[editScene].code : $('code').value
    engine.editPatch(editScene, text)
    $('code').value = text
    $('codeStatus').textContent = 'Patch aplicado a ' + PATCHES[editScene].name + '.'
    $('codeStatus').classList.remove('error')
  } catch (err) {
    $('codeStatus').textContent = 'Revisá el patch. ' + err.message
    $('codeStatus').classList.add('error')
  }
}
$('applyCode').onclick = () => applyPatch(false)
$('restoreCode').onclick = () => applyPatch(true)
;[
  ['Espectral', 0, '#ef4597,#56dad1,#eea157'],
  ['Ácido', 2.1, '#d1ed4d,#50dfa3,#dc56af'],
  ['Ultravioleta', 4.1, '#7765e4,#ee4b93,#5dcefa']
].forEach(([label, val, sw], i) => {
  const b = document.createElement('button')
  b.dataset.palette = String(i)
  b.innerHTML = '<b style="--swatch:linear-gradient(90deg,' + sw + ')"></b>' + label
  b.onclick = () => {
    state.hue = val
    selectButtons('[data-palette]', 'palette', String(i))
  }
  $('palettes').append(b)
})
selectButtons('[data-palette]', 'palette', '0')
all('[data-brush]').forEach(
  (b) =>
    (b.onclick = () => {
      state.painting = b.dataset.brush === 'on'
      brush.reset()
      selectButtons('[data-brush]', 'brush', b.dataset.brush)
      updateBrush()
    })
)
function updateBrush() {
  $('brushSize').disabled = !state.painting
  $('repaint').disabled = !source || !state.painting
}
selectButtons('[data-brush]', 'brush', 'off')
updateBrush()
$('repaint').onclick = () => {
  brush.reset()
  notify('Reconstrucción reiniciada.')
}
all('[data-q]').forEach(
  (b) =>
    (b.onclick = () => {
      state.quality = b.dataset.q
      selectButtons('[data-q]', 'q', state.quality)
      resize()
    })
)
selectButtons('[data-q]', 'q', 'auto')

function disposeSource() {
  sound.disconnectVisual()
  sourceStream?.getTracks().forEach((t) => t.stop())
  if (source instanceof HTMLVideoElement) {
    source.pause()
    source.srcObject = null
    source.removeAttribute('src')
    source.load()
  }
  if (sourceURL) URL.revokeObjectURL(sourceURL)
  source = null
  sourceStream = null
  sourceURL = ''
  brush.reset()
  engine?.setMedium(null)
}
function clearVisual() {
  sourceRequest++
  disposeSource()
  $('visualName').textContent = 'Sin fuente conectada'
  $('clearVisual').hidden = true
  updateBrush()
  refreshSound()
}
async function loadVisual(kind, file, deviceId) {
  const request = ++sourceRequest
  let candidate,
    stream,
    url = ''
  try {
    if (kind === 'file' && !file) return
    if (kind === 'file') url = URL.createObjectURL(file)
    if (file?.type.startsWith('image/')) {
      candidate = new Image()
      candidate.src = url
      await candidate.decode()
      const scale = 1920 / Math.max(candidate.naturalWidth, candidate.naturalHeight)
      if (scale < 1) {
        const sheet = document.createElement('canvas')
        sheet.width = Math.max(1, Math.round(candidate.naturalWidth * scale))
        sheet.height = Math.max(1, Math.round(candidate.naturalHeight * scale))
        sheet.getContext('2d').drawImage(candidate, 0, 0, sheet.width, sheet.height)
        candidate = sheet
      }
    } else {
      candidate = document.createElement('video')
      candidate.muted = true
      candidate.playsInline = true
      candidate.loop = kind === 'file'
      if (kind === 'screen') {
        if (!navigator.mediaDevices?.getDisplayMedia)
          throw new Error('Este navegador no permite compartir ventanas. Probá desde una computadora.')
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      } else if (kind === 'camera') {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error('La webcam requiere localhost o HTTPS y permiso del navegador.')
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { width: { ideal: 960 }, height: { ideal: 540 } },
          audio: false
        })
      }
      if (stream) candidate.srcObject = stream
      else candidate.src = url
      await candidate.play()
    }
    if (request !== sourceRequest) {
      candidate.pause?.()
      stream?.getTracks().forEach((t) => t.stop())
      if (url) URL.revokeObjectURL(url)
      return
    }
    disposeSource()
    source = candidate
    sourceStream = stream
    sourceURL = url
    engine?.setMedium(candidate)
    if (stream)
      stream.getVideoTracks()[0].onended = () => {
        if (sourceStream === stream) {
          clearVisual()
          notify('La entrada de video se desconectó.')
        }
      }
    $('visualName').textContent = file?.name || stream?.getVideoTracks()[0]?.label || 'Fuente visual'
    $('clearVisual').hidden = false
    updateBrush()
    if (kind === 'camera') await listCameras()
    if (stream?.getAudioTracks().length) {
      await sound.start()
      sound.visualNode = sound.context.createMediaStreamSource(stream)
      sound.visualNode.connect(sound.analyser)
      refreshSound()
    }
  } catch (e) {
    if (candidate !== source) {
      candidate?.pause?.()
      stream?.getTracks().forEach((t) => t.stop())
      if (url) URL.revokeObjectURL(url)
    }
    throw e
  }
}
async function listCameras() {
  let wrap = $('cameras')
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
    (d) => d.kind === 'videoinput'
  )
  if (!wrap) {
    wrap = document.createElement('div')
    wrap.id = 'cameras'
    wrap.className = 'action-list'
    $('visualName').parentElement.after(wrap)
  }
  wrap.replaceChildren()
  if (devices.length > 1)
    devices.forEach((d, i) => {
      const b = document.createElement('button')
      b.textContent = d.label || 'Cámara ' + (i + 1)
      action(b, () => loadVisual('camera', null, d.deviceId))
      wrap.append(b)
    })
}
action($('camera'), () => loadVisual('camera'))
action($('screen'), () => loadVisual('screen'))
$('clearVisual').onclick = clearVisual
$('fileVisual').onclick = () => $('visualFile').click()
$('visualFile').onchange = async (e) => {
  try {
    await loadVisual('file', e.target.files[0])
  } catch (err) {
    notify(messageFor(err))
  }
  e.target.value = ''
}

const meterBars = Array.from({ length: 11 }, () => $('meter').appendChild(document.createElement('i')))
const specBars = Array.from({ length: 26 }, () =>
  $('spectrum').appendChild(document.createElement('i'))
)
function refreshSound() {
  const recording = sound.recorder?.state === 'recording'
  $('mic').querySelector('span').textContent = sound.micStream
    ? 'Apagar micrófono'
    : 'Activar micrófono'
  $('mic').classList.toggle('active', !!sound.micStream)
  $('record').classList.toggle('active', recording)
  $('record').querySelector('span').textContent = recording ? 'Detener y guardar' : 'Grabar muestra'
  $('soundOpen').querySelector('b').classList.toggle('on', sound.active)
  $('signalName').textContent = sound.active ? 'Audio en vivo' : 'Pulso interno'
  const root = $('tracks')
  root.replaceChildren()
  if (!sound.tracks.size) {
    const p = document.createElement('p')
    p.className = 'hint'
    p.textContent = sound.storageOK
      ? 'Todavía no hay pistas.'
      : 'Almacenamiento desactivado. Las pistas duran esta sesión.'
    root.append(p)
  }
  for (const tr of sound.tracks.values()) {
    const row = document.createElement('div')
    row.className = 'track'
    row.innerHTML =
      '<button class="iconbutton"></button><span class="track-name"></span><button class="download"></button><button class="remove"></button><input type="range" min="0" max="100">'
    const [play, download, remove] = all('button', row),
      slider = row.querySelector('input'),
      running = tr.audio && !tr.audio.paused
    play.innerHTML = icon(running ? 'pause' : 'play')
    play.setAttribute('aria-label', (running ? 'Pausar ' : 'Reproducir ') + tr.name)
    row.querySelector('.track-name').textContent = tr.name
    remove.innerHTML = icon('trash')
    remove.setAttribute('aria-label', 'Eliminar ' + tr.name)
    slider.setAttribute('aria-label', 'Volumen de ' + tr.name)
    slider.value = tr.volume * 100
    meterStyle(slider)
    slider.oninput = () => {
      sound.volume(tr.id, +slider.value / 100)
      meterStyle(slider)
    }
    slider.onchange = () =>
      sound
        .store('put', { id: tr.id, name: tr.name, blob: tr.blob, volume: tr.volume })
        .catch(() => notify('El volumen queda ajustado en esta sesión.'))
    download.innerHTML = icon('upload')
    download.setAttribute('aria-label', 'Descargar ' + tr.name)
    download.title = 'Descargar pista'
    download.onclick = () => {
      const a = document.createElement('a'),
        link = URL.createObjectURL(tr.blob)
      a.href = link
      const ext = tr.blob.type.includes('mp4') ? 'm4a' : tr.blob.type.includes('ogg') ? 'ogg' : 'webm'
      a.download = tr.name.startsWith('Toma ') ? tr.name.replaceAll(':', '-') + '.' + ext : tr.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(link), 30000)
    }
    let armed = false
    remove.title = 'Eliminar pista'
    action(play, () => sound.play(tr.id))
    action(remove, async () => {
      if (armed) {
        await sound.remove(tr.id)
        return
      }
      armed = true
      remove.textContent = '¿Sí?'
      remove.setAttribute('aria-label', 'Confirmar eliminación de ' + tr.name)
      setTimeout(() => {
        armed = false
        remove.innerHTML = icon('trash')
        remove.setAttribute('aria-label', 'Eliminar ' + tr.name)
      }, 3500)
    })
    root.append(row)
  }
}
action($('mic'), () => (sound.micStream ? sound.stopMic() : sound.mic()))
action($('record'), () => sound.record())
$('importAudio').onclick = () => $('audioFile').click()
$('audioFile').onchange = async (e) => {
  try {
    for (const f of e.target.files) await sound.add(f, f.name)
  } catch (err) {
    notify(messageFor(err))
  }
  e.target.value = ''
}
sound.restore()
if (location.protocol === 'file:') $('offline').textContent = '· Local'
else if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      $('offline').textContent = '· Disponible sin conexión'
    })
    .catch(() => {})
}

async function holdScreen() {
  try {
    if (navigator.wakeLock && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen')
      wakeLock.onrelease = () => (wakeLock = null)
    }
  } catch {}
}
function resize() {
  if (!engine) return
  const external = projector && !projector.closed
  const rect = stage.getBoundingClientRect()
  engine.resize(
    external ? projector.innerWidth : rect.width,
    external ? projector.innerHeight : rect.height
  )
  canvas.style.objectFit = external ? 'contain' : 'fill'
}
async function fullscreen() {
  if (panel.open) panel.close()
  if (document.fullscreenElement) await document.exitFullscreen()
  else if (document.body.classList.contains('projecting')) {
    document.body.classList.remove('projecting')
    resize()
  } else {
    if (stage.requestFullscreen) {
      await stage.requestFullscreen()
      await holdScreen()
    } else {
      document.body.classList.add('projecting')
      await holdScreen()
      resize()
      notify('Doble toque para volver a la cabina.')
    }
  }
}
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) wakeLock?.release()
  resize()
})
stage.addEventListener('dblclick', (e) => {
  if (e.target === canvas) fullscreen().catch((e) => notify(messageFor(e)))
})
action($('project'), fullscreen)
action($('fullPanel'), fullscreen)
function openOutput() {
  if (projector && !projector.closed) {
    projector.focus()
    return
  }
  if (!canvas.captureStream)
    throw new Error('Usá Pantalla completa. Este navegador no admite una segunda salida.')
  const win = window.open('', 'fosfeno-output', 'popup,width=960,height=540')
  if (!win) throw new Error('Permití ventanas emergentes para abrir la salida.')
  projector = win
  win.document.title = 'Fosfeno · Salida limpia'
  const v = win.document.createElement('video')
  v.autoplay = true
  v.playsInline = true
  v.muted = true
  win.document.body.style.cssText = 'margin:0;background:black;overflow:hidden'
  v.style.cssText = 'display:block;width:100vw;height:100vh;object-fit:contain;cursor:none'
  win.document.body.replaceChildren(v)
  projectStream = canvas.captureStream(30)
  v.srcObject = projectStream
  v.ondblclick = () =>
    win.document.fullscreenElement ? win.document.exitFullscreen() : v.requestFullscreen?.()
  win.addEventListener('resize', resize)
  win.addEventListener(
    'pagehide',
    () => {
      projectStream?.getTracks().forEach((t) => t.stop())
      projectStream = null
      projector = null
      resize()
      restartClock()
    },
    { once: true }
  )
  win.document.addEventListener('visibilitychange', restartClock)
  v.play().catch(() => notify('Tocá la salida para iniciar el video.'))
  v.onclick = () => v.play()
  resize()
  holdScreen()
}
action($('separate'), openOutput)
window.addEventListener('pagehide', () => {
  projector?.close()
  sourceStream?.getTracks().forEach((t) => t.stop())
  sound.stopMic()
})
document.addEventListener('visibilitychange', () => {
  restartClock()
  if (!document.hidden && (document.fullscreenElement || projector)) holdScreen()
})
function point(e) {
  const rect = canvas.getBoundingClientRect()
  state.pointer = [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height]
}
canvas.onpointerdown = (e) => {
  held = true
  point(e)
  state.impulse = 1
  canvas.setPointerCapture(e.pointerId)
}
canvas.onpointermove = (e) => {
  if (held) point(e)
}
canvas.onpointerup = canvas.onpointercancel = () => (held = false)
document.addEventListener('keydown', (e) => {
  if (
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    e.repeat ||
    panel.open ||
    e.target.matches('input,textarea')
  )
    return
  if (/^[1-6]$/.test(e.key)) go(+e.key - 1)
  else if (e.key === 'ArrowRight') go(state.scene + 1)
  else if (e.key === 'ArrowLeft') go(state.scene - 1)
  else if (e.code === 'Space') {
    if (e.target.closest('button')) return
    e.preventDefault()
    $('automate').click()
  } else if (e.key.toLowerCase() === 'm') mutate()
  else if (e.key.toLowerCase() === 'f') fullscreen().catch((e) => notify(messageFor(e)))
  else if (e.key === 'Escape' && document.body.classList.contains('projecting')) fullscreen()
})
function scheduleFrame() {
  frameClock =
    document.hidden && projector && !projector.closed && !projector.document.hidden ? projector : window
  frameId = frameClock.requestAnimationFrame(frame)
}
function restartClock() {
  if (!frameClock.closed) frameClock.cancelAnimationFrame(frameId)
  last = 0
  deadline = 0
  if (engine && !contextLost) scheduleFrame()
}
function frame() {
  const now = performance.now()
  if (now + 0.75 < deadline) {
    scheduleFrame()
    return
  }
  deadline = (deadline && now - deadline < 33 ? deadline : now) + 1000 / 60
  const ms = last ? Math.min(now - last, 1000) : 16
  last = now
  sessionAge += ms / 1000
  state.bands = sound.sample(sessionAge, state.bpm, state.sensitivity, ms / 1000)
  state.mutation += (state.mutationTarget - state.mutation) * (1 - Math.exp(-ms / 950))
  state.impulse = held ? 1 : state.impulse * Math.exp(-ms / 640)
  if (state.auto && !(panel.open && !$('patchDesk').hidden && document.activeElement === $('code'))) {
    sceneAge += ms / 1000
    if (sceneAge >= state.interval) nextAuto()
  }
  if (source) {
    const medium = state.painting ? brush.paint(source, now, state.brush, state.bands[0]) : source
    if (medium && engine.medium !== medium) engine.setMedium(medium)
    if (state.painting && engine.medium === brush.canvas) engine.canvasVersion = brush.ticks
  }
  engine.tick(ms)
  frameCount++
  frameMs += ms
  if (now - lastUI > 120) {
    lastUI = now
    $('progress').style.transform = 'scaleX(' + Math.min(1, sceneAge / state.interval) + ')'
    const sec = Math.floor(sessionAge)
    $('timecode').textContent = [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60]
      .map((n) => String(n).padStart(2, '0'))
      .join(':')
    const bar = (i, n) => {
      const band = state.bands[Math.min(2, Math.floor((i / n) * 3))]
      return Math.min(1, 0.12 + band * (1.5 + 0.48 * Math.sin(i * 2.4 + sessionAge * 2)))
    }
    meterBars.forEach((b, i) => (b.style.transform = 'scaleY(' + bar(i, 11) + ')'))
    if (panel.open && !document.querySelector('[data-pane="audio"]').hidden)
      specBars.forEach((b, i) => {
        const n = sound.bins?.length || 0
        const v =
          sound.active && n
            ? sound.bins[Math.min(n - 1, Math.round(2 * Math.pow(n / 2, i / 25)))] / 255
            : bar(i, 26)
        b.style.transform = 'scaleY(' + Math.max(0.08, v) + ')'
      })
  }
  if (frameMs >= 1800) {
    const fps = (frameCount * 1000) / frameMs
    if (state.quality === 'auto') {
      adaptWindows = fps < 24 ? adaptWindows + 1 : 0
      if (adaptWindows >= 2 && engine.autoScale > 0.36) {
        engine.autoScale = Math.max(0.36, engine.autoScale * 0.8)
        adaptWindows = 0
        lastUpscale = now
        resize()
      }
      if (fps > 53 && now - lastUpscale > 25000 && engine.autoScale < 1) {
        engine.autoScale = Math.min(1, engine.autoScale + 0.08)
        lastUpscale = now
        resize()
      }
    }
    $('resolution').textContent = engine.size.join(' × ') + '  /  ' + Math.round(fps) + ' FPS'
    frameCount = 0
    frameMs = 0
  }
  scheduleFrame()
}
sceneUI()
function fail(text) {
  $('failure').textContent = text
  $('failure').hidden = false
}
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault()
  contextLost = true
  frameClock.cancelAnimationFrame(frameId)
  fail('Se interrumpió la GPU. Reconectando la señal…')
})
canvas.addEventListener('webglcontextrestored', () => {
  // Rebuild vertex data and media textures after the driver discards GPU memory.
  const previous = engine
  try {
    previous?.r.destroy()
    engine = new VisualEngine(canvas, state)
    resize()
    engine.age = previous?.age || 0
    engine.slots[engine.active] = {
      scene: state.scene,
      seed: previous?.slots[previous.active].seed || 0.18
    }
    previous?.patchText.forEach((code, i) => {
      if (code !== PATCHES[i].code) engine.editPatch(i, code)
    })
    engine.compose()
    engine.setMedium(source)
    contextLost = false
    $('failure').hidden = true
    restartClock()
  } catch (err) {
    console.error(err)
    fail('No se pudo recuperar la GPU. Volvé a cargar Fosfeno.')
  }
})
try {
  engine = new VisualEngine(canvas, state)
  resize()
  new ResizeObserver(resize).observe(stage)
  scheduleFrame()
} catch (e) {
  console.error(e)
  fail('No se pudo iniciar la salida WebGL. Activá la aceleración gráfica y volvé a abrir Fosfeno.')
}
