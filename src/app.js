;(() => {
  'use strict'
  const $ = (id) => document.getElementById(id)
  const all = (sel, root = document) => Array.from(root.querySelectorAll(sel))
  const paths = {
    save: 'M4 3h12l4 4v14H4zM8 3v6h8V3M8 21v-8h8v8',
    download: 'M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5',
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
    auto: false,
    interval: 60,
    painting: false,
    brush: 0.42,
    bpm: 130,
    sensitivity: 1.45,
    quality: 'auto',
    bands: [0, 0, 0]
  }
  const canvas = $('visual'),
    stage = $('stage'),
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
    frameId = 0,
    frameClock = window,
    deadline = 0,
    contextLost = false
  const sound = new SoundDesk(refreshSound, notify)
  function notify(message) {
    const el = $('toast')

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
  const cm = CodeMirror.fromTextArea($('code'), {
    mode: 'javascript',
    lineNumbers: true,
    lineWrapping: true,
    matchBrackets: true,
    indentUnit: 2,
    screenReaderLabel: 'Código del sketch Hydra',
    tabSize: 2
  })
  let current = SKETCHES[0],
    modified = false,
    loading = false,
    armed = true,
    live = true,
    timer,
    fold = 'libre',
    view = 'code'
  let revision = 0,
    queue = Promise.resolve(),
    pendingFresh = false
  function stored(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem('fosfeno:' + key)) ?? fallback
    } catch {
      return fallback
    }
  }
  function store(key, value) {
    try {
      localStorage.setItem('fosfeno:' + key, JSON.stringify(value))
      return true
    } catch {
      notify('No pude guardar en este navegador. Podés descargar el .js.')
      return false
    }
  }
  let saved = stored('scores', [])
  if (!Array.isArray(saved)) saved = []
  function status(text, error = false) {
    $('codeStatus').textContent = text
    $('codeStatus').classList.toggle('error', error)
  }
  function changeView(next) {
    view = next
    all('[data-viewpane]').forEach((el) => (el.hidden = el.dataset.viewpane !== next))
    selectButtons('[data-view]', 'view', next)
    if (next === 'code') requestAnimationFrame(() => cm.refresh())
    if (next === 'library') library()
  }
  function openPanel(tab) {
    changeView('signal')
    selectButtons('[data-tab]', 'tab', tab)
    all('[data-pane]').forEach((el) => (el.hidden = el.dataset.pane !== tab))
  }
  all('[data-view]').forEach(
    (b) =>
      (b.onclick = () =>
        b.dataset.view === 'signal' ? openPanel('input') : changeView(b.dataset.view))
  )
  all('[data-tab]').forEach((b) => (b.onclick = () => openPanel(b.dataset.tab)))
  $('soundOpen').onclick = $('signalOpen').onclick = () => openPanel('audio')
  all('[data-output]').forEach(
    (b) =>
      (b.onclick = () => {
        engine?.show(b.dataset.output)
        selectButtons('[data-output]', 'output', b.dataset.output)
      })
  )
  function toggleAuto(on) {
    state.auto = on
    sceneAge = 0
    $('automate').setAttribute('aria-pressed', on)
  }
  $('automate').onclick = () => toggleAuto(!state.auto)
  const intervals = [15, 30, 60, 90, 120, 240]
  $('interval').onclick = () => {
    state.interval = intervals[(intervals.indexOf(state.interval) + 1) % intervals.length]
    sceneAge = 0
    $('interval').innerHTML = state.interval + ' s ' + icon('cycle')
  }
  function advanceSet() {
    if (engine.r.stats.shaderCount > 96) renewAutoEngine()
    generate(false, false)
  }
  function renewAutoEngine() {
    // This version of regl retains compiled shader programs until destroy().
    // Rebuild only between autonomous scores, on the same capture canvas.
    const sources = engine.hydra.s.map((s) => ({ src: s.src, dynamic: s.dynamic }))
    const attached = engine.medium,
      scale = engine.autoScale
    engine.r.destroy()
    engine = new VisualEngine(canvas, state)
    engine.autoScale = scale
    resize()
    for (const [i, entry] of sources.entries()) {
      if (entry.src && (!(entry.src instanceof HTMLVideoElement) || entry.src.readyState >= 2))
        engine.hydra.s[i].init(entry)
    }
    engine.medium = attached
  }
  function setText(text) {
    loading = true
    cm.setValue(text)
    cm.clearHistory()
    loading = false
  }
  function draft() {
    return {
      id: current.id,
      name: $('scoreName').value.trim() || 'Sin título',
      code: cm.getValue(),
      modified
    }
  }
  function flush() {
    if (modified) store('draft', draft())
  }
  function archive(force = false) {
    if (!force && !modified) return
    const entry = draft()
    if (!current.personal) entry.id = 'local-' + (crypto.randomUUID?.() || Date.now().toString(36))
    entry.personal = true
    const next = [entry, ...saved.filter((s) => s.id !== entry.id)]
    if (store('scores', next)) {
      saved = next
      current = entry
      modified = false
      return true
    }
    return false
  }
  function restoreEditor(reference) {
    const recovered = reference ? null : stored('draft', null)
    if (recovered && typeof recovered.code === 'string') {
      load(recovered, false, false)
      modified = true
      armed = false
      status('Borrador recuperado. Ejecutá para llevarlo a la salida.')
    } else {
      current = reference || SKETCHES[0]
      setText(current.code)
      $('scoreName').value = current.name
      status('En vivo · Ctrl + Enter ejecuta un bloque.')
    }
    changeView('code')
  }
  function load(item, play = true, manual = true) {
    if (!item) return
    if (modified && archive() === false) return
    current = item
    revision++
    clearTimeout(timer)
    modified = false
    armed = play
    pendingFresh = !play
    if (manual) {
      toggleAuto(false)
      changeView('code')
    }
    setText(item.code)
    $('scoreName').value = item.name
    if (manual) store('draft', null)
    if (play) execute(item.code, { fresh: true })
    else status('Preparado. Ejecutá para llevar este código a la salida.')
  }
  function execute(code, { fresh = false, whole = true } = {}) {
    const requested = revision
    clearTimeout(timer)
    if (!engine || !code.trim()) {
      status('Escribí una cadena y terminala con .out().')
      return
    }
    armed = true
    queue = queue.then(async () => {
      if (revision !== requested) return
      try {
        await engine.run(code, { fresh: fresh || (pendingFresh && whole), whole })
        if (revision === requested) {
          pendingFresh = false
          status(whole ? 'En vivo · Sketch ejecutado' : 'En vivo · Bloque ejecutado')
        }
      } catch (e) {
        if (revision === requested) status('Error · ' + e.message, true)
      }
    })
    return queue
  }
  function runAll() {
    return execute(cm.getValue())
  }
  function runBlock() {
    let text = cm.getSelection()
    if (!text) {
      let start = cm.getCursor().line,
        end = start
      while (start > 0 && cm.getLine(start - 1).trim()) start--
      while (end < cm.lastLine() && cm.getLine(end + 1).trim()) end++
      text = cm.getRange({ line: start, ch: 0 }, { line: end, ch: cm.getLine(end).length })
    }
    return execute(text, { whole: false })
  }
  cm.on('change', () => {
    if (loading) return
    revision++
    modified = true
    toggleAuto(false)
    clearTimeout(timer)
    status(armed && live ? 'Editando…' : 'Cambios pendientes · Ejecutar')
    timer = setTimeout(() => {
      flush()
      if (live && armed) runAll()
    }, 420)
  })
  $('scoreName').oninput = () => {
    modified = true
    flush()
  }
  $('run').onclick = runAll
  $('block').onclick = runBlock
  $('hydraLink').onclick = () => {
    const target = new URL('https://hydra.ojack.xyz/')
    target.searchParams.set('code', btoa(encodeURIComponent(cm.getValue())))
    window.open(target.href, '_blank', 'noopener,noreferrer')
  }
  $('liveEdit').onclick = () => {
    live = !live
    $('liveEdit').setAttribute('aria-pressed', live)
    clearTimeout(timer)
    flush()
    if (live && armed) runAll()
  }
  window.addEventListener('pagehide', flush)
  $('save').onclick = () => {
    if (archive(true)) {
      store('draft', null)
      status('Guardado en Biblioteca → Mis sketches.')
    }
  }
  $('exportJS').onclick = () => {
    const link = document.createElement('a'),
      url = URL.createObjectURL(new Blob([cm.getValue()], { type: 'text/javascript' }))
    link.href = url
    link.download = ($('scoreName').value.trim() || 'sketch') + '.js'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  }
  function library() {
    function list(el, items, personal) {
      el.replaceChildren()
      for (const item of items) {
        const button = document.createElement('button')
        button.className = 'library-item'
        const label = document.createElement('strong'),
          group = document.createElement('span')
        label.textContent = item.name
        group.textContent = personal ? 'Abrir borrador' : item.group
        button.append(label, group)
        button.onclick = () => load(item, !personal)
        el.append(button)
      }
      if (!items.length) {
        const p = document.createElement('p')
        p.className = 'hint'
        p.textContent = 'Guardá un sketch con el botón junto a su nombre.'
        el.append(p)
      }
    }
    list($('mine'), saved, true)
    list($('sketchList'), SKETCHES, false)
  }
  let community = []
  function filterCommunity() {
    const term = $('findScore').value.toLocaleLowerCase()
    const matches = community.filter((s) =>
      (s.name + ' ' + s.group + ' ' + s.id).toLocaleLowerCase().includes(term)
    )
    const root = $('communityList')
    root.replaceChildren()
    for (const item of matches) {
      const b = document.createElement('button'),
        name = document.createElement('strong'),
        author = document.createElement('span')
      b.className = 'library-item'
      name.textContent = item.name
      author.textContent = item.group
      b.append(name, author)
      b.onclick = () => load(item, false)
      root.append(b)
    }
    if (!matches.length) root.textContent = 'Sin coincidencias.'
  }
  action($('fetchCatalog'), async () => {
    if (community.length) {
      $('catalog').hidden = !$('catalog').hidden
      return
    }
    const url = 'https://raw.githubusercontent.com/hydra-synth/hydra/main/src/stores/examples.json'
    let entries
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!response.ok) throw new Error(String(response.status))
      entries = await response.json()
      if (!Array.isArray(entries)) throw new Error('Catálogo inválido')
      store('hydra-catalog', entries)
    } catch {
      entries = stored('hydra-catalog', [])
    }
    for (const row of entries) {
      try {
        const code = decodeURIComponent(atob(row.code))
        const comments = code
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.startsWith('//'))
          .map((l) => l.slice(2).trim())
        const title = comments[0] && !comments[0].startsWith('http') ? comments[0] : row.sketch_id
        const group = [
          comments[1] && !comments[1].includes('http') ? comments[1].slice(0, 45) : '',
          row.sketch_id
        ]
          .filter(Boolean)
          .join(' · ')
        community.push({ id: row.sketch_id, name: title.slice(0, 85), group, code })
      } catch {
        continue
      }
    }
    if (!community.length)
      throw new Error('La primera carga del catálogo de Hydra necesita conexión.')
    $('catalog').hidden = false
    $('fetchCatalog').textContent = community.length + ' sketches'
    filterCommunity()
  })
  $('findScore').oninput = filterCommunity
  all('[data-fold]').forEach(
    (b) =>
      (b.onclick = () => {
        fold = b.dataset.fold
        selectButtons('[data-fold]', 'fold', fold)
      })
  )
  selectButtons('[data-fold]', 'fold', 'libre')
  function generate(fromField, manual = true) {
    const raw = fromField ? $('seed').value.trim() : ''
    if (raw && (!/^\d+$/.test(raw) || Number(raw) > 4294967295)) {
      notify('Usá una semilla entera entre 0 y 4294967295.')
      return
    }
    const seed = raw ? Number(raw) : crypto.getRandomValues(new Uint32Array(1))[0]
    load({ id: 'seed-' + seed, name: 'Semilla ' + seed, code: growSketch(seed, fold) }, true, manual)
  }
  $('grow').onclick = () => generate(true)
  $('explore').onclick = () => generate(false)
  $('blank').onclick = () =>
    load({ id: 'nuevo', name: 'Sin título', code: '// Tu sketch Hydra\n\n' }, false)
  $('importCode').onclick = () => $('jsFile').click()
  $('jsFile').onchange = async (e) => {
    const file = e.target.files[0]
    try {
      if (file)
        load(
          { id: 'importado', name: file.name.replace(/\.(js|txt)$/i, ''), code: await file.text() },
          false
        )
    } catch (err) {
      notify(err.message)
    }
    e.target.value = ''
  }
  function insertOperator(label, fragment, definition) {
    const code = cm.getValue(),
      cursor = cm.indexFromPos(cm.getCursor())
    const targets = Array.from(code.matchAll(/\.out\s*\(\s*(o[0-3])?\s*\)/g)).filter((m) => {
      const token = cm.getTokenTypeAt(cm.posFromIndex(m.index + 2)) || ''
      return !/comment|string/.test(token)
    })
    const blockStart = code.lastIndexOf('\n\n', cursor)
    const target =
      targets.find(
        (m) =>
          m.index >= blockStart && m.index >= cursor && !code.slice(cursor, m.index).includes('\n\n')
      ) ||
      targets.findLast((m) => !m[1] || m[1] === 'o0') ||
      targets.at(-1)
    if (!target) {
      status('Agregá una cadena con .out() para insertar ' + label + '.', true)
      return
    }
    cm.operation(() => {
      cm.replaceRange(fragment + '\n  ', cm.posFromIndex(target.index))
      if (definition && !code.includes("name:'" + definition + "'"))
        cm.replaceRange(MIRRORS[definition] + '\n\n', { line: 0, ch: 0 })
    })
    changeView('code')
  }
  for (const [label, fragment, definition] of OPERATORS) {
    const b = document.createElement('button')
    b.textContent = label
    b.title = fragment
    b.onclick = () => insertOperator(label, fragment, definition)
    $('ops').append(b)
  }
  $('insertSource').onclick = () => insertOperator('Fuente s0', '.blend(src(s0), 0.55)')
  let editingNumber = null,
    tuning = false,
    lastTuneRun = 0
  function inspectNumber() {
    if (tuning) return
    const pos = cm.getCursor(),
      token = cm.getTokenAt(pos)
    if (token.type !== 'number' || !/^\d*\.?\d+$/.test(token.string)) {
      editingNumber = null
      $('numberRack').hidden = true
      return
    }
    const val = Number(token.string),
      decimal = token.string.includes('.')
    const step = decimal ? 10 ** -Math.min(5, Math.max(2, token.string.split('.')[1].length)) : 1
    const span = decimal ? Math.max(Math.abs(val) * 2, step * 30) : Math.max(12, Math.abs(val) * 2)
    editingNumber = { line: pos.line, start: token.start, end: token.end }
    const input = $('tune')
    input.min = 0
    input.max = val + span
    input.step = step
    input.value = val
    $('numberRack').hidden = false
    $('numberRack').querySelector('output').textContent = token.string
    meterStyle(input)
  }
  cm.on('cursorActivity', inspectNumber)
  $('tune').oninput = () => {
    if (!editingNumber) return
    const { line, start, end } = editingNumber,
      input = $('tune'),
      value = String(Number(input.value))
    tuning = true
    cm.replaceRange(value, { line, ch: start }, { line, ch: end })
    editingNumber.end = start + value.length
    tuning = false
    $('numberRack').querySelector('output').textContent = value
    meterStyle(input)
    if (armed && live && performance.now() - lastTuneRun > 100) {
      lastTuneRun = performance.now()
      flush()
      runAll()
    }
  }
  function openOps(open) {
    $('ops').hidden = !open
    $('opsToggle').setAttribute('aria-expanded', open)
    requestAnimationFrame(() => cm.refresh())
  }
  $('opsToggle').onclick = () => openOps($('ops').hidden)
  openOps(!matchMedia('(max-width:700px)').matches)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      e.shiftKey ? runAll() : runBlock()
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
      e.preventDefault()
      hideUI()
    }
    if (e.key === 'Escape' && document.body.classList.contains('quiet')) hideUI()
  })
  function hideUI() {
    const quiet = document.body.classList.toggle('quiet')
    resize()
    if (!quiet) cm.refresh()
  }
  window.visualViewport?.addEventListener('resize', () =>
    document.documentElement.style.setProperty('--app-height', window.visualViewport.height + 'px')
  )
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
  range('inputRanges', 'brushSize', 'Grosor del pincel', 0, 100, 42, (v) => (state.brush = v / 100))
  range(
    'audioRanges',
    'sensitivity',
    'Sensibilidad',
    20,
    300,
    145,
    (v) => (state.sensitivity = v / 100)
  )
  range(
    'audioRanges',
    'bpm',
    'Pulso interno',
    55,
    220,
    130,
    (v) => {
      state.bpm = v
      if (engine) window.bpm = v
    },
    (v) => v + ' BPM'
  )
  function selectButtons(sel, attr, value) {
    all(sel).forEach((b) => {
      const on = b.dataset[attr] === value
      b.classList.toggle('active', on)
      b.setAttribute('aria-pressed', on)
    })
  }
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
    $('insertSource').disabled = !source
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
            throw new Error(
              'Este navegador no permite compartir ventanas. Probá desde una computadora.'
            )
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

  const meterBars = Array.from({ length: 11 }, () =>
    $('meter').appendChild(document.createElement('i'))
  )
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
    if (e.target !== canvas) return
    if (document.body.classList.contains('quiet')) hideUI()
    else fullscreen().catch((e) => notify(messageFor(e)))
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
  function scheduleFrame() {
    frameClock =
      document.hidden && projector && !projector.closed && !projector.document.hidden
        ? projector
        : window
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

    if (state.auto && !engine.running) {
      sceneAge += ms / 1000
      if (sceneAge >= state.interval) {
        sceneAge = 0
        advanceSet()
      }
    }
    if (source) {
      const medium = state.painting ? brush.paint(source, now, state.brush, state.bands[0]) : source
      if (medium && engine.medium !== medium) engine.setMedium(medium)
    }
    engine.tick(ms, sound)
    frameCount++
    frameMs += ms
    if (now - lastUI > 120) {
      lastUI = now
      selectButtons('[data-output]', 'output', engine.output)
      const bar = (i, n) => {
        const band = state.bands[Math.min(2, Math.floor((i / n) * 3))]
        return Math.min(1, 0.12 + band * (1.5 + 0.48 * Math.sin(i * 2.4 + sessionAge * 2)))
      }
      meterBars.forEach((b, i) => (b.style.transform = 'scaleY(' + bar(i, 11) + ')'))
      if (!$('panel').hidden && !document.querySelector('[data-pane="audio"]').hidden)
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
      $('resolution').textContent =
        [canvas.width, canvas.height].join(' × ') + '  /  ' + Math.round(fps) + ' FPS'
      frameCount = 0
      frameMs = 0
    }
    scheduleFrame()
  }

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
  canvas.addEventListener('webglcontextrestored', async () => {
    const previous = engine,
      history = previous?.lastProgram.slice() || []
    try {
      previous?.r.destroy()
      engine = new VisualEngine(canvas, state)
      resize()
      for (const [i, code] of history.entries()) await engine.run(code, { whole: i === 0 })
      engine.setMedium(source)
      contextLost = false
      $('failure').hidden = true
      restartClock()
    } catch (err) {
      console.error(err)
      fail('No se pudo recuperar la GPU. Volvé a cargar Fosfeno.')
    }
  })
  async function start() {
    try {
      engine = new VisualEngine(canvas, state)
      resize()
      new ResizeObserver(resize).observe(stage)
      const id = new URL(location.href).searchParams.get('sketch_id')
      const reference = SKETCHES.find((item) => item.id === id)
      await engine.run((reference || SKETCHES[0]).code)
      restoreEditor(reference)
      scheduleFrame()
    } catch (e) {
      console.error(e)
      fail('No se pudo iniciar la salida WebGL. ' + e.message)
    }
  }
  start()
})()
