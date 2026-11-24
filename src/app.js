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
    bpm: 30,
    internalPulse: false,
    sensitivity: 1,
    quality: 'auto',
    bands: [0, 0, 0]
  }
  const canvas = $('visual'),
    stage = $('stage'),
    brush = new BrushSurface()
  let engine,
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
  const room = new HydraRoom(canvas, () => {
    for (const input of inputs) {
      if (input.current?.kind === 'peer') input.clear()
    }
  })
  window.pb = room
  sound.hydraAudio = new Hydra.Audio({ autoStart: false, parentEl: $('hydraMeter') })
  sound.hydraAudio.hide()
  const inputs = Array.from({ length: 4 }, (_, index) =>
    new VisualInput(
      (input) => engine?.setMedium(input?.element || null, index, input?.params),
      (input) => {
        if (index === 0) visualChanged(input)
      },
      (message) => {
        if (index === 0) {
          visualStatus(message)
          if (message && view !== 'signal' && !inputs[0].pending) notify(message)
        } else if (message) notify('s' + index + ' · ' + message)
      }
    )
  )
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
  window.cm = cm
  cm.addKeyMap({
    'Ctrl-/': (editor) => editor.toggleComment(),
    'Cmd-/': (editor) => editor.toggleComment(),
    'Shift-Ctrl-F': formatCode,
    'Shift-Cmd-F': formatCode,
    'Shift-Ctrl-S': captureSketch,
    'Shift-Cmd-S': captureSketch
  })
  function formatCode() {
    cm.setValue(js_beautify(cm.getValue(), {
      indent_size: 2, break_chained_methods: true, indent_with_tabs: true
    }))
  }
  function captureSketch() {
    engine?.h.screencap()
    $('exportJS').click()
  }
  let current = SKETCHES[0],
    modified = false,
    loading = false,
    armed = true,
    live = stored('live-edit', true) === true,
    timer,
    fold = 'libre',
    view = 'code'
  let revision = 0,
    queue = Promise.resolve(),
    pendingFresh = false
  $('liveEdit').setAttribute('aria-pressed', live)
  const sectors = new SectorDesk({
    live: () => live, input: () => inputs[0].current?.element || engine?.h.s0.src,
    bass: () => state.bands[0], connect: () => openVisual('camera', undefined, false)
  })
  const layout = new StudioLayout(cm)
  const guide = new CodeGuide(cm)
  $('copyGuide').onclick = async () => {
    try { await navigator.clipboard.writeText(guide.annotatedCopy()); notify('Código y guía copiados.'); $('helpDialog').close() }
    catch { notify('El navegador bloqueó el portapapeles. Podés seleccionar y copiar el código del editor.') }
  }
  // Only re-run history entries executed in this document. Pasted links and
  // reloads still open as editable code, even if the URL has the same format.
  const historySession = crypto.getRandomValues(new Uint32Array(4)).join('-')
  let historySequence = 0, initialDocument
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
  const guideTitles = {salidas:'Qué estás proyectando', autopiloto:'Autopiloto', edicion:'Edición en vivo',
    efectos:'Guía de efectos', sectores:'Dibujar y mezclar sectores', biblioteca:'Abrir o mezclar un sketch', portatil:'Composiciones portátiles',
    imagen:'Fuentes de imagen',audio:'Audio y pulso',calidad:'Resolución',codigo:'Leer el código'}
  all('[data-help]').forEach(b => {
    b.setAttribute('aria-haspopup','dialog')
    b.onclick = () => {
      const topic = b.dataset.help
      $('guideActions').hidden = topic !== 'codigo'
      $('helpTitle').textContent = guideTitles[topic]
      const body = $('helpContent')
      body.replaceChildren(...all('[data-guide="'+topic+'"]').map(node => {
        const p = document.createElement('p'); p.textContent = node.textContent.trim(); return p
      }))
      if (topic === 'efectos') {
        const list = document.createElement('dl')
        for (const [name, ,hint] of OPERATORS) {
          const term = document.createElement('dt'), meaning = document.createElement('dd')
          term.textContent = name; meaning.textContent = hint; list.append(term,meaning)
        }
        body.append(list)
      }
      $('moreHelp').hidden = true
      $('helpContent').scrollTop = 0
      $('helpDialog').showModal()
      layout.fitHelp()
    }
  })
  $('closeHelp').onclick = () => $('helpDialog').close()
  $('helpDialog').onclick = e => {
    if (e.target !== $('helpDialog')) return
    const r = e.target.getBoundingClientRect()
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close()
  }
  function outputPicker(open) {
    $('outputChoices').hidden = !open
    $('chooseOutput').setAttribute('aria-expanded', open)
  }
  $('chooseOutput').onclick = () => outputPicker($('outputChoices').hidden)
  function refreshMix() {
    if (!engine) return
    const output = engine.output
    const activeSectors = sectors.applied.filter(s => s.visible).length
    const head = 'Ver mezcla · ' + (output === 'all' ? 'o0–o3' : 'o' + output) +
      (inputs[0].current ? ' · s0 conectada' : '') + (activeSectors ? ' · ' + activeSectors + (activeSectors === 1 ? ' sector' : ' sectores') : '')
    if ($('mixInfo').textContent !== head) $('mixInfo').textContent = head
    if ($('mixDetail').hidden) return
    const parts = ['Proyección · ' + (output === 'all' ? 'cuatro salidas' : 'o' + output)]
    parts.push(...Array.from(engine.graphs, ([i, graph]) => 'o' + i + ' · ' + graph).sort())
    if (appliedText && appliedText.includes('function capaBiblioteca')) {
      // This text came from a completed execution, independently of pending edits.
      const names = [...appliedText.matchAll(/function capaBiblioteca\(\) \{\s*("(?:\\.|[^"\\])*");/g)]
      if (names.length) parts.push('Biblioteca · ' + names.map(m => m[1].slice(1,-1)).join(' + '))
    }
    parts.push('Entrada · ' + $('visualName').textContent, 'Audio · ' +
      [sound.micStream && 'micrófono', sound.visualNode && 'ventana', ...Array.from(sound.tracks.values())
        .filter(t => t.audio && !t.audio.paused).map(t => t.name), !sound.active && state.internalPulse && 'pulso interno'].filter(Boolean).join(' + '))
    if (parts.at(-1) === 'Audio · ') parts[parts.length - 1] += 'silencio'
    if (appliedText !== cm.getValue()) parts.push('El documento tiene cambios pendientes o se ejecutó por bloques.')
    for (const r of sectors.applied.filter(s => s.visible)) parts.push(r.shape + ' ' + r.id + ' · ' + (r.source === 'file' ? r.file?.current?.file?.name : r.source) + (r.paint ? ' · Pinceladas' : '') + ' · ' + (r.fx.map(f => f.name).join(' → ') || 'sin efectos'))
    if (sectors.dirty) parts.push('Hay sectores preparados para aplicar.')
    const text = parts.join('\n')
    if ($('mixDetail').textContent !== text) $('mixDetail').textContent = text
  }
  $('mixInfo').onclick = () => {
    $('mixDetail').hidden = !$('mixDetail').hidden
    $('mixInfo').setAttribute('aria-expanded', !$('mixDetail').hidden)
    refreshMix()
  }
  function changeView(next, openTools = true) {
    view = next
    all('[data-viewpane]').forEach((el) => (el.hidden = el.dataset.viewpane !== next))
    sectors.show(next === 'sectors')
    selectButtons('[data-view]', 'view', next)
    layout.open(openTools)
    if (next === 'code') requestAnimationFrame(() => cm.refresh())
    if (next === 'library') library()
  }
  function openPanel(tab) {
    changeView('signal')
    selectButtons('[data-tab]', 'tab', tab)
    all('[data-pane]').forEach((el) => (el.hidden = el.dataset.pane !== tab))
    if (tab === 'input') listCameras()
  }
  all('[data-view]').forEach(
    (b) =>
      (b.onclick = () => {
        if (layout.compact.matches && view === b.dataset.view) {
          layout.open(!layout.opened)
        } else if (b.dataset.view === 'signal') openPanel('input')
        else changeView(b.dataset.view)
      })
  )
  all('[data-tab]').forEach((b) => (b.onclick = () => openPanel(b.dataset.tab)))
  $('soundOpen').onclick = $('signalOpen').onclick = () => openPanel('audio')
  all('[data-output]').forEach(
    (b) =>
      (b.onclick = () => {
        engine?.show(b.dataset.output)
        selectButtons('[data-output]', 'output', b.dataset.output)
        outputPicker(false)
        $('chooseOutput').focus({preventScroll:true})
      })
  )
  function toggleAuto(on) {
    state.auto = on
    sceneAge = 0
    $('automate').setAttribute('aria-pressed', on)
    describeAuto()
  }
  function describeAuto() {
    const seconds = state.auto ? Math.max(1, Math.ceil(state.interval - sceneAge)) : state.interval
    const display = seconds + ' s '
    if ($('interval').firstChild.nodeValue !== display) $('interval').firstChild.nodeValue = display
  }
  $('automate').onclick = () => toggleAuto(!state.auto)
  const intervals = [15, 30, 60, 90, 120, 240]
  $('interval').onclick = () => {
    state.interval = intervals[(intervals.indexOf(state.interval) + 1) % intervals.length]
    sceneAge = 0
    $('interval').innerHTML = state.interval + ' s ' + icon('cycle')
    describeAuto()
  }
  function advanceSet() {
    if (engine.r.stats.shaderCount > 96) renewAutoEngine()
    generate(false, false)
  }
  function renewAutoEngine() {
    // This version of regl retains compiled shader programs until destroy().
    // Rebuild only between autonomous scores, on the same capture canvas.
    const sources = engine.hydra.s.map((s) => ({ src: s.src, dynamic: s.dynamic }))
    const attached = engine.attached,
      scale = engine.autoScale
    engine.hydra.captureStream?.getTracks().forEach((track) => track.stop())
    engine.r.destroy()
    engine = new VisualEngine(canvas, state, inputs, sound.hydraAudio, room)
    sectors.attach(engine)
    engine.autoScale = scale
    resize()
    for (const [i, entry] of sources.entries()) {
      if (entry.src && (!(entry.src instanceof HTMLVideoElement) || entry.src.readyState >= 2)) {
        if (attached[i] === entry.src) engine.setMedium(entry.src, i, inputs[i].current?.params)
        else engine.hydra.s[i].init(entry)
      }
    }
  }
  function setText(text) {
    loading = true
    cm.setValue(text)
    cm.clearHistory()
    loading = false
    refreshEffectList()
  }
  function draft() {
    return {
      id: current.id,
      name: $('scoreName').value.trim() || 'Sin título',
      code: cm.getValue(),
      generator:current.generator,
      autoEdit: armed,
      modified
    }
  }
  function flush() {
    if (modified) store('draft', { ...draft(), historyEntry: history.state?.fosfenoEntry })
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
  function restoreEditor(reference, play) {
    const recovered = stored('draft', null)
    const sameEntry = recovered?.historyEntry && recovered.historyEntry === history.state?.fosfenoEntry
    if (typeof recovered?.code === 'string' && (!reference || sameEntry)) {
      load(recovered, false, false)
      modified = true
      armed = recovered.autoEdit === true
      status(armed && live ? 'Borrador recuperado. Tu próxima edición actualizará la imagen.' : 'Borrador recuperado. Ejecutá para llevarlo a la salida.')
    } else if (reference && !play) {
      load(reference, false, false)
    } else {
      current = reference || SKETCHES[0]
      setText(current.code)
      $('scoreName').value = current.name
      status(live ? 'En vivo · Editá el código para cambiar la imagen.' : 'Modo manual · Ejecutá para actualizar la imagen.')
    }
    changeView('code', false)
  }
  function load(item, play = true, manual = true) {
    if (!item) return
    if (modified && archive() === false) return
    current = item
    if (item.generator) {
      fold = item.generator.fold
      $('seed').value = item.generator.seed
      selectButtons('[data-fold]','fold',fold)
    }
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
    if (play && panelInputMix && inputs[0].current) {
      loading = true
      try { mixInput() } finally { loading = false }
      refreshEffectList()
    }
    if (play) execute(cm.getValue(), { fresh: true })
    else status('Preparado. Ejecutá para llevar este código a la salida.')
    return true
  }
  function execute(code, { fresh = false, whole = true, remember = false } = {}) {
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
        await engine.run(code, { fresh: fresh || (pendingFresh && whole), whole, syncOutputs: whole && (live || syncEdits) })
        if (revision === requested) {
          if (whole) {
            appliedText = code
            syncEdits = false
            if (remember) sectors.apply()
          } else appliedText = null
          pendingFresh = false
          status(whole ? 'En vivo · Sketch ejecutado' : 'En vivo · Bloque ejecutado')
          if (remember && location.protocol !== 'file:') {
            try {
              const url = new URL(location.href)
              url.searchParams.delete('sketch_id')
              url.searchParams.set('code', btoa(encodeURIComponent(code)))
              history.pushState({
                fosfenoRun: historySession, fosfenoEntry: historySession + '/' + ++historySequence
              }, '', url)
            } catch {
              notify('El sketch está en vivo. El navegador no pudo guardar este paso en el historial.')
            }
          }
          return true
        }
      } catch (e) {
        if (revision === requested) {
          status('Error · ' + e.message, true)
          if (view !== 'code') notify('Se conservó la visual anterior. ' + e.message)
        }
      }
    })
    return queue
  }
  function markExecution(from, to) {
    const mark = cm.markText(from, to, { className: 'executed-code' })
    setTimeout(() => mark.clear(), 300)
  }
  function runAll() {
    markExecution({ line: 0, ch: 0 }, { line: cm.lineCount(), ch: 0 })
    return execute(cm.getValue(), { remember: true })
  }
  function runRange(from, to) {
    markExecution(from, to)
    return execute(cm.getRange(from, to), { whole: false })
  }
  function runBlock() {
    let start = cm.getCursor().line,
      end = start
    while (start > 0 && cm.getLine(start) !== '') start--
    while (end < cm.lineCount() && cm.getLine(end) !== '') end++
    return runRange({ line: start, ch: 0 }, { line: end, ch: 0 })
  }
  cm.on('change', () => {
    if (loading) return
    if (sourceMix && !sourceMix.find()) {
      panelInputMix = false
      sourceMix = null
    }
    revision++
    modified = true
    toggleAuto(false)
    refreshEffectList()
    clearTimeout(timer)
    status(armed && live ? 'Aplicando cambios…' : 'Cambios pendientes · Ejecutá para llevarlos a la salida.')
    timer = setTimeout(() => {
      flush()
      if (live && armed) execute(cm.getValue())
    }, 220)
  })
  $('scoreName').oninput = () => {
    modified = true
    flush()
  }
  $('run').onclick = runAll
  $('block').onclick = () =>
    cm.somethingSelected() ? runRange(cm.getCursor('from'), cm.getCursor('to')) : runBlock()
  $('hydraLink').onclick = () => {
    const target = new URL('https://hydra.ojack.xyz/')
    target.searchParams.set('code', btoa(encodeURIComponent(cm.getValue())))
    window.open(target.href, '_blank', 'noopener,noreferrer')
  }
  $('liveEdit').onclick = () => {
    live = !live
    if (live) sectors.apply()
    $('liveEdit').setAttribute('aria-pressed', live)
    store('live-edit', live)
    clearTimeout(timer)
    flush()
    if (live && armed) execute(cm.getValue())
    else status(armed ? 'Modo manual · Ejecutá para actualizar la imagen.' : 'Ejecutá una vez para activar este documento.')
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
  function libraryRow(item, play) {
    const row = document.createElement('div')
    row.className = 'library-row'
    const open = document.createElement('button'), label = document.createElement('strong'),
      group = document.createElement('span')
    open.className = 'library-item'
    open.setAttribute('aria-label', 'Abrir ' + item.name)
    label.textContent = item.name
    group.textContent = item.group || 'Mi biblioteca'
    open.append(label, group)
    open.onclick = () => load(item, play)
    const mix = document.createElement('button')
    mix.className = 'line-button'
    mix.textContent = 'Mezclar'
    mix.setAttribute('aria-label', 'Mezclar ' + item.name)
    mix.onclick = () => editAction(() => {
      const fragment = libraryBlend(analysis(), item, engine.hydra.generator.glslTransforms)
      insertOperator(fragment, null, false)
      notify(live && armed ? 'Capa agregada al código · ' + item.name : 'Capa en el código. Ejecutá para proyectarla.')
    })
    row.append(open, mix)
    return row
  }
  function library() {
    function list(el, items, personal) {
      el.replaceChildren(...items.map(item => libraryRow(item, !personal || live)))
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
      root.append(libraryRow(item, HYDRA_GALLERY.some(s => s.id === item.id && s.code === item.code)))
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
      entries = stored('hydra-catalog', HYDRA_EXAMPLES)
    }
    for (const row of Array.isArray(entries) ? entries : []) {
      try {
        community.push(gallerySketch(row))
      } catch {
        continue
      }
    }
    if (!community.length) community = HYDRA_GALLERY.slice()
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
    load({ id: 'seed-' + seed, name: 'Semilla ' + seed, code: growSketch(seed, fold), generator:{seed,fold} }, true, manual)
  }
  $('grow').onclick = () => generate(true)
  $('explore').onclick = () => generate(false)
  $('blank').onclick = () => {
    load({ id: 'nuevo', name: 'Sin título', code: '// Tu sketch Hydra\n\n' }, false)
    if (current.id === 'nuevo') {
      armed = true
      status(live ? 'Escribí una cadena Hydra. La salida se actualiza mientras editás.' : 'Escribí una cadena Hydra y ejecutala.')
    }
  }
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
  let removing = false, sourceMix = null, panelInputMix = false, appliedText = null, syncEdits = false
  const helperMarks = new Map()
  function analysis() {
    return inspectScore(cm.getValue(), engine.hydra.generator.glslTransforms)
  }
  function targetOutput(info, atCursor) {
    const cursor = cm.indexFromPos(cm.getCursor())
    const name = engine.output === 'all' ? 'o0' : 'o' + engine.output
    if (atCursor) {
      const candidates = info.outputs.filter(o => o.from <= cursor && cursor <= o.end)
      if (candidates.length) return candidates.sort((a,b) => (a.end-a.from) - (b.end-b.from))[0]
    }
    return info.outputs.findLast(o => o.name === name)
  }
  function insertOperator(fragment, definition, atCursor = true) {
    const info = analysis()
    const out = targetOutput(info, atCursor)
    if (!out && !info.empty) throw new Error('Elegí una cadena que termine en .out() o seleccioná su salida arriba.')
    const where = out ? out.start : cm.getValue().length
    let mark
    cm.operation(() => {
      syncEdits = true
      const prefix = out ? '' : '\nosc()'
      const pos = cm.posFromIndex(where)
      cm.replaceRange(prefix + fragment + (out ? '' : '.out(o0)'), pos)
      mark = cm.markText(cm.posFromIndex(where + prefix.length), cm.posFromIndex(where + prefix.length + fragment.length))
      if (definition && !info.calls.some(c => c.callee.name === 'setFunction' &&
        c.arguments[0]?.properties?.some(p => p.key?.name === 'name' && p.value?.value === definition))) {
        const text = MIRRORS[definition] + '\n\n'
        cm.replaceRange(text, { line: 0, ch: 0 })
        helperMarks.set(definition, cm.markText({ line: 0, ch: 0 }, cm.posFromIndex(text.length)))
      }
    })
    return mark
  }
  function editAction(fn) {
    try { return fn() }
    catch (e) { status(e.message, true); notify(e.message) }
  }
  function refreshEffectList() {
    if (!removing || !engine) return
    const root = $('activeEffects')
    root.replaceChildren()
    let info
    try { info = analysis() } catch {
      root.textContent = 'Completá la expresión para editar sus efectos.'
      return
    }
    if (!info.effects.length) root.textContent = 'Este código todavía no tiene efectos encadenados.'
    for (const effect of info.effects) {
      const b = document.createElement('button')
      const code = cm.getValue().slice(effect.start, effect.end)
      const label = effect.layer || OPERATORS.find(op => op[1] === code)?.[0] || effect.name
      const line = cm.posFromIndex(effect.start).line + 1
      b.textContent = '× ' + label
      const detail = document.createElement('small')
      detail.textContent = (effect.output || 'función') + ' · línea ' + line
      b.append(detail)
      b.title = 'Quitar ' + (effect.layer || code)
      b.setAttribute('aria-label', 'Quitar ' + label + ', ' + detail.textContent)
      b.onclick = () => {
        cm.operation(() => {
          syncEdits = true
          cm.replaceRange('', cm.posFromIndex(effect.start), cm.posFromIndex(effect.end))
          const helper = helperMarks.get(effect.name)?.find()
          if (helper && !analysis().effects.some(e => e.name === effect.name) &&
              cm.getRange(helper.from, helper.to) === MIRRORS[effect.name] + '\n\n') {
            cm.replaceRange('', helper.from, helper.to)
            helperMarks.delete(effect.name)
          }
        })
      }
      if (effect.amount && effect.amount.value >= 0 && effect.amount.value <= 1) {
        const cell = document.createElement('div'), slider = document.createElement('input')
        cell.className = 'blend-strength'
        slider.type = 'range'; slider.min = 0; slider.max = 100
        slider.value = Math.round(effect.amount.value * 100)
        slider.setAttribute('aria-label','Porcentaje de mezcla de ' + label + ', línea ' + line)
        const value = document.createElement('output')
        value.value = slider.value + '%'
        slider.oninput = () => { value.value = slider.value + '%' }
        slider.onchange = () => cm.replaceRange(String(Number(slider.value)/100),
          cm.posFromIndex(effect.amount.start),cm.posFromIndex(effect.amount.end))
        cell.append(b,slider,value); root.append(cell)
      } else root.append(b)
    }
  }
  const operatorEditor = new OperatorEditor(cm,()=>engine.hydra.generator.glslTransforms,(expression,source)=>editAction(()=>{
    if (source && analysis().empty) cm.replaceRange('\n'+expression+'.out(o0)',cm.posFromIndex(cm.getValue().length))
    else insertOperator(source ? '.blend('+expression+', 0.5)' : '.'+expression,null)
  }), async item=>{
    await creations.add(item.name,packComposition(item),'operator')
    notify('Operador guardado en Biblioteca → Creaciones portátiles.')
  },notify)
  function effectMode(mode) {
    removing = mode === 'remove'
    $('ops').hidden = $('hydraCatalog').hidden = mode !== 'add'
    $('operatorInspector').hidden = mode !== 'adjust'
    $('activeEffects').hidden = !removing
    for (const name of ['add','adjust','remove']) $(name+'Mode').setAttribute('aria-pressed',name===mode)
    if (mode==='adjust') operatorEditor.draw()
    refreshEffectList()
  }
  $('addMode').onclick = () => effectMode('add')
  $('removeMode').onclick = () => effectMode('remove')
  $('adjustMode').onclick = () => effectMode('adjust')
  for (const [label, fragment, , definition] of OPERATORS) {
    const b = document.createElement('button')
    b.textContent = label
    b.title = fragment
    b.onclick = () => editAction(() => insertOperator(fragment, definition))
    $('ops').append(b)
  }
  const cameraBlend = '.blend(src(s0), 0.65)'
  function mixInput() {
    panelInputMix = true
    if (!armed) {
      $('routeStatus').textContent = 'Entrada lista. Ejecutá el documento preparado o elegí Ver sólo la fuente.'
      return
    }
    try {
      const info = analysis(), out = targetOutput(info, false)
      if (out?.usesInput) {
        $('routeStatus').textContent = 'La salida ' + out.name + ' ya usa s0.'
        return
      }
      sourceMix = insertOperator(cameraBlend, null, false)
      $('routeStatus').textContent = live ? 'Entrada mezclada en la visual.' : 'Mezcla preparada. Ejecutá para proyectarla.'
    } catch {
      $('routeStatus').textContent = 'La entrada está lista. Para verla directamente elegí Ver sólo la fuente.'
    }
  }
  $('insertSource').onclick = mixInput
  $('sourceOnly').onclick = () => {
    load({ id: 'fuente-s0', name: 'Fuente en vivo', code: 'src(s0).out(o0)\nrender(o0)' }, true)
  }
  let editingNumber = null,
    tuning = false,
    lastTuneRun = 0
  function inspectNumber() {
    if (tuning) return
    const pos = cm.getCursor(),
      token = cm.getTokenAt(pos)
    if (token.type !== 'number' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(token.string)) {
      editingNumber = null
      $('numberRack').hidden = true
      return
    }
    let start = token.start
    const line = cm.getLine(pos.line)
    const minus = line.slice(0,start).match(/-\s*$/)
    if (minus) {
      // Only include a unary minus. In a subtraction the operator belongs to the surrounding expression.
      const at = cm.indexFromPos({line:pos.line,ch:token.start})
      try {
        const preceding = [...acorn.tokenizer(cm.getValue().slice(0,at),{ecmaVersion:'latest'})]
        if (preceding.at(-2)?.type.beforeExpr || preceding.length===1) start -= minus[0].length
      } catch {}
    }
    const literal = line.slice(start,token.end).replace(/\s+/g,'')
    const val = Number(literal), decimal = /[.e]/i.test(literal)
    if (!Number.isFinite(val)) { $('numberRack').hidden = true; editingNumber=null; return }
    const precision = Math.max(2,(literal.split(/[eE]/)[0].split('.')[1] || '').length - Number(literal.split(/[eE]/)[1] || 0))
    const step = decimal ? 10 ** -Math.min(12,precision) : 1
    const span = Math.ceil(Math.max(Math.abs(val)*2,decimal ? step*30 : 12)/step)*step
    editingNumber = { line: pos.line, start, end: token.end }
    const input = $('tune')
    input.min = val - span
    input.max = val + span
    input.step = step
    input.value = val
    $('numberRack').hidden = false
    $('numberRack').querySelector('output').textContent = literal
    meterStyle(input)
  }
  cm.on('cursorActivity', inspectNumber)
  $('tune').oninput = () => {
    if (!editingNumber) return
    const { line, start, end } = editingNumber,
      input = $('tune'),
      value = String(Number(input.value))
    tuning = true
    const replacement = value.startsWith('-') && cm.getLine(line)[start-1]==='-' ? ' '+value : value
    cm.replaceRange(replacement, { line, ch: start }, { line, ch: end })
    editingNumber.end = start + replacement.length
    tuning = false
    $('numberRack').querySelector('output').textContent = value
    meterStyle(input)
    if (armed && live && performance.now() - lastTuneRun > 100) {
      lastTuneRun = performance.now()
      flush()
      execute(cm.getValue())
    }
  }
  function openOps(open) {
    $('effectPanel').hidden = !open
    $('effectModes').hidden = !open
    $('opsToggle').setAttribute('aria-expanded', open)
    requestAnimationFrame(() => cm.refresh())
  }
  $('opsToggle').onclick = () => openOps($('effectPanel').hidden)
  openOps(!layout.compact.matches)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) runAll()
      else {
        const line = cm.getCursor().line
        runRange({ line, ch: 0 }, { line, ch: cm.getLine(line).length })
      }
    } else if (e.altKey && e.key === 'Enter') {
      e.preventDefault()
      runBlock()
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
    100,
    (v) => {
      sound.sensitivity = state.sensitivity = v / 100
      if (sound.analysisGain) sound.analysisGain.gain.value = state.sensitivity
    }
  )
  range(
    'audioRanges',
    'bpm',
    'Tempo',
    1,
    220,
    state.bpm,
    (v) => {
      state.bpm = v
      if (engine) window.bpm = v
    },
    (v) => v + ' BPM'
  )
  $('internalPulse').onclick = () => {
    state.internalPulse = !state.internalPulse
    $('internalPulse').setAttribute('aria-pressed', state.internalPulse)
    refreshSound()
  }
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
    const source = inputs[0].current
    $('brushSize').disabled = !state.painting
    $('repaint').disabled = !source || !state.painting
    $('insertSource').disabled = !source
    $('sourceOnly').disabled = !source
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
        state.sketchResolution = null
        selectButtons('[data-q]', 'q', state.quality)
        resize()
      })
  )
  selectButtons('[data-q]', 'q', 'auto')

  const creations = new CompositionLibrary({sectors, notify, capture() {
    const {painting,brush,internalPulse,sensitivity,quality} = state
    return {name:$('scoreName').value.trim() || 'Sin título',code:cm.getValue(),regions:sectors.snapshot(),selectedSector:sectors.id,
      input:inputs[0].current?.file, inputKind:inputs[0].current?.kind || null,
      settings:{painting,brush,internalPulse,sensitivity,quality,resolution:state.sketchResolution || null,bpm:window.bpm,output:engine.output,
        autoMix:$('autoMixInput').getAttribute('aria-pressed') === 'true',fold,seed:$('seed').value}}
  }, async activate(project) {
    if (project.kind === 'operator') {
      const info = analysis()
      if (!info.empty && !targetOutput(info,true)) throw new Error('Elegí una cadena con .out() antes de insertar el operador.')
      const missing = project.definitions.filter(d=>!cm.getValue().includes(d))
      const registeredName = call => call.arguments[0]?.properties?.find(p=>(p.key?.name || p.key?.value)==='name')?.value?.value
      const existing = info.calls.filter(c=>c.callee.name==='setFunction').map(registeredName)
      if (missing.some(d=>existing.includes(registeredName(acorn.parse(d,{ecmaVersion:'latest'}).body[0].expression)))) {
        throw new Error('Tu sketch ya define otro operador con ese nombre. Renombralo antes de insertar esta versión.')
      }
      const credits = project.origin.filter(line=>!cm.getValue().includes(line))
      changeView('code')
      cm.operation(()=>{
        insertOperator(project.code,null)
        const prefix = [...credits,...missing].join('\n')
        if (prefix) cm.replaceRange(prefix+'\n\n',{line:0,ch:0})
      })
      notify('Operador agregado al código.'); return
    }
    const version = revision, originalInput = inputs[0].current
    const next = await sectors.prepare(project.regions)
    let medium = project.input ? {kind:'file',file:project.input} : null
    let installed = false
    try {
      if (medium) await prepareVisual(medium,null,medium.file,new AbortController().signal)
      if (version !== revision) throw new Error('El código cambió durante la carga. Volvé a elegir la composición.')
      const item = {id:'obra',name:project.name,code:project.code}
      if (!load(item,false)) return
      if (!await execute(item.code,{fresh:true})) return
      panelInputMix = false
      sourceMix = null
      if (medium) { inputs[0].cancel(); inputs[0].replace(medium); medium=null }
      else if (inputs[0].current === originalInput && originalInput && originalInput.kind !== project.inputKind) inputs[0].clear()
      const settings = project.settings
      for (const [id,value] of [['brushSize',settings.brush*100],['sensitivity',settings.sensitivity*100]]) {
        $(id).value = value; $(id).oninput()
      }
      state.bpm = window.bpm = settings.bpm
      const tempo = $('bpm')
      tempo.min = Math.min(1,settings.bpm); tempo.max = Math.max(220,settings.bpm); tempo.value = settings.bpm
      document.querySelector('output[for="bpm"]').textContent = settings.bpm+' BPM'; meterStyle(tempo)
      state.painting = settings.painting; brush.reset(); updateBrush()
      selectButtons('[data-brush]','brush',settings.painting ? 'on' : 'off')
      state.internalPulse = settings.internalPulse; $('internalPulse').setAttribute('aria-pressed',settings.internalPulse)
      $('autoMixInput').setAttribute('aria-pressed',settings.autoMix)
      state.quality = settings.quality; state.sketchResolution=settings.resolution || null
      selectButtons('[data-q]','q',state.sketchResolution ? '' : state.quality)
      fold = settings.fold; $('seed').value = settings.seed; selectButtons('[data-fold]','fold',fold)
      engine.show(settings.output); selectButtons('[data-output]','output',settings.output)
      sectors.install(next,project.selectedSector); sectors.apply(); installed = true
      resize(); refreshMix()
      notify('Composición en salida · '+project.name)
    } finally {
      if (medium) releaseVisual(medium)
      if (!installed) next.forEach(s=>s.file?.clear())
    }
  }})

  let cameraListVersion = 0
  function visualStatus(message) {
    const status = $('cameraStatus')
    status.textContent = message
    status.hidden = !message
    $('cancelVisual').hidden = !inputs[0].pending
  }
  async function listCameras() {
    if (view !== 'signal' || document.querySelector('[data-pane="input"]').hidden) return
    const version = ++cameraListVersion
    if (!navigator.mediaDevices?.enumerateDevices) return
    let devices
    try {
      devices = await cameraDevices()
    } catch {
      // Enumeration is optional. The default-device button can still request access.
      devices = []
    }
    if (version !== cameraListVersion) return
    const current = inputs[0].current
    const activeId =
      current?.kind === 'camera' && current.stream.getVideoTracks()[0].getSettings().deviceId
    const wrap = $('cameras')
    const focused = document.activeElement?.dataset.camera
    wrap.replaceChildren()
    devices.forEach((device, i) => {
      if (!device.deviceId) return
      const button = document.createElement('button')
      button.dataset.camera = device.deviceId
      button.textContent = device.label || 'Cámara ' + (i + 1)
      button.setAttribute('aria-pressed', String(device.deviceId === activeId))
      button.onclick = () => openVisual('camera', { choice: device.deviceId })
      wrap.append(button)
      if (focused === device.deviceId) button.focus({ preventScroll: true })
    })
  }
  function visualChanged(input) {
    sound.disconnectVisual()
    brush.reset()
    const track = input?.stream?.getVideoTracks()[0]
    const info = input?.file?.name || track?.label || 'Fuente visual'
    $('visualName').textContent = input ? info + ' · s0' : 'Sin fuente conectada'
    $('clearVisual').hidden = !input
    const preview = $('sourcePreview')
    preview.replaceChildren()
    if (input?.kind === 'camera') {
      input.element.setAttribute('aria-label', 'Vista previa de la cámara en s0')
      preview.append(input.element)
    }
    updateBrush()
    refreshSound()
    listCameras()
    if (input?.stream?.getAudioTracks().length) {
      sound.start()
        .then(() => {
          if (inputs[0].current !== input) return
          sound.visualNode = sound.context.createMediaStreamSource(input.stream)
          sound.visualNode.connect(sound.analyser)
          refreshSound()
        })
        .catch((err) => notify(messageFor(err)))
    }
  }
  $('autoMixInput').onclick = () => {
    const on = $('autoMixInput').getAttribute('aria-pressed') !== 'true'
    $('autoMixInput').setAttribute('aria-pressed', on)
  }
  async function openVisual(kind, options, mix = $('autoMixInput').getAttribute('aria-pressed') === 'true') {
    try {
      if (!await inputs[0].open(kind, options)) return false
      if (mix) mixInput()
      else $('routeStatus').textContent = 'Fuente conectada en s0, disponible para el código y los sectores.'
      return true
    } catch (err) {
      if (kind !== 'camera') visualStatus(messageFor(err))
    } finally {
      listCameras()
    }
  }
  $('camera').onclick = () => openVisual('camera')
  $('screen').onclick = () => openVisual('screen')
  $('clearVisual').onclick = () => {
    panelInputMix = false
    inputs[0].clear()
    const range = sourceMix?.find()
    if (range && /^\.blend\(src\(s0\),\s*[\d.]+\)$/.test(cm.getRange(range.from, range.to))) {
      cm.replaceRange('', range.from, range.to)
    }
    sourceMix = null
    $('routeStatus').textContent = ''
  }
  $('cancelVisual').onclick = () => {
    inputs[0].cancel()
    visualStatus('Conexión cancelada.')
  }
  navigator.mediaDevices?.addEventListener?.('devicechange', listCameras)
  $('fileVisual').onclick = () => $('visualFile').click()
  $('visualFile').onchange = (e) => {
    const file = e.target.files[0]
    if (file) openVisual('file', { file })
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
    $('signalName').textContent = sound.active
      ? 'Audio en vivo'
      : state.internalPulse ? 'Pulso interno' : 'Sin audio'
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
    const workerURL = new URL('sw.js?v=2.7', location.href).href
    const showOfflineReady = () => {
      if (navigator.serviceWorker.controller?.scriptURL === workerURL)
        $('offline').textContent = '· Disponible sin conexión'
    }
    navigator.serviceWorker.addEventListener('controllerchange', showOfflineReady)
    navigator.serviceWorker.register(workerURL, { updateViaCache: 'none' }).then(showOfflineReady).catch(() => {})
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
    sectors.layout()
  }
  async function fullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen()
    else if (document.body.classList.contains('projecting')) {
      document.body.classList.remove('projecting')
      resize()
    } else {
      if (canvas.requestFullscreen) {
        await canvas.requestFullscreen()
        await holdScreen()
      } else {
        document.body.classList.add('projecting')
        await holdScreen()
        resize()
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
  action($('project'), openOutput)
  action($('fullPanel'), fullscreen)
  function openOutput() {
    if (projector && !projector.closed) {
      projector.focus()
      return
    }
    if (!canvas.captureStream)
      throw new Error('Usá Pantalla completa. Este navegador no admite una segunda salida.')
    const win = window.open('', '_blank', 'popup,width=960,height=540')
    if (!win) throw new Error('Permití la ventana emergente o usá Señal → Salida → Pantalla completa.')
    projector = win
    win.document.title = 'Fosfeno · Salida limpia'
    const v = win.document.createElement('video')
    v.autoplay = true
    v.playsInline = true
    v.muted = true
    v.controls = false
    v.disablePictureInPicture = true
    win.document.body.style.cssText = 'margin:0;background:black;overflow:hidden'
    v.style.cssText = 'display:block;width:100vw;height:100vh;object-fit:contain;cursor:none'
    win.document.body.replaceChildren(v)
    projectStream = canvas.captureStream(30)
    v.srcObject = projectStream
    v.ondblclick = () =>
      win.document.fullscreenElement ? win.document.exitFullscreen() : win.document.documentElement.requestFullscreen?.()
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
    notify('Mové la ventana de imagen al proyector. Doble clic para pantalla completa.')
  }
  action($('separate'), openOutput)
  window.addEventListener('pagehide', () => {
    projector?.close()
    room.disconnect()
    sectors.files.forEach(f => f.clear())
    inputs.forEach((input) => {
      if (input.current?.stream) input.clear()
      else input.cancel()
    })
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
    const tempo = Number.isFinite(window.bpm) ? window.bpm : state.bpm
    state.bands = sound.sample(sessionAge, tempo, state.sensitivity, ms / 1000, state.internalPulse)

    if (state.auto && !engine.running) {
      sceneAge += ms / 1000
      describeAuto()
      if (sceneAge >= state.interval) {
        sceneAge = 0
        advanceSet()
      }
    }
    // Native Hydra loaders may replace a managed texture asynchronously.
    for (let i = 0; i < inputs.length; i++) {
      if (inputs[i].current && engine.attached[i] && engine.hydra.s[i].src !== engine.attached[i])
        inputs[i].replace(null)
    }
    const source = inputs[0].current?.element
    if (source && (!(source instanceof HTMLVideoElement) || source.readyState >= 2)) {
      const medium = state.painting ? brush.paint(source, now, state.brush, state.bands[0]) : source
      if (medium && engine.attached[0] !== medium)
        engine.setMedium(medium, 0, inputs[0].current.params)
    }
    engine.tick(ms, sound)
    frameCount++
    frameMs += ms
    if (now - lastUI > 120) {
      lastUI = now
      refreshMix()
      const resolution = state.sketchResolution?.join(' × ') || ''
      if ($('codeResolution').dataset.size !== resolution) {
        $('codeResolution').dataset.size = resolution
        $('codeResolution').hidden = !resolution
        $('codeResolution').textContent = resolution ? resolution+' · definida en el código' : ''
        selectButtons('[data-q]','q',resolution ? '' : state.quality)
      }
      if (tempo !== state.bpm) {
        state.bpm = tempo
        const slider = $('bpm')
        slider.min = Math.min(1, tempo)
        slider.max = Math.max(220, tempo)
        slider.value = tempo
        document.querySelector('output[for="bpm"]').textContent = tempo + ' BPM'
        meterStyle(slider)
      }
      selectButtons('[data-output]', 'output', engine.output)
      const selected = document.querySelector('[data-output][aria-pressed="true"]')
      if (selected) {
        const label = selected.textContent + ' ▾'
        if ($('chooseOutput').textContent !== label) $('chooseOutput').textContent = label
      }
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
      previous?.hydra.captureStream?.getTracks().forEach((track) => track.stop())
      previous?.r.destroy()
      engine = new VisualEngine(canvas, state, inputs, sound.hydraAudio, room)
      sectors.attach(engine)
      resize()
      for (const [i, input] of inputs.entries()) {
        if (input.current) engine.setMedium(input.current.element, i, input.current.params)
      }
      for (const [i, code] of history.entries()) await engine.run(code, { whole: i === 0 })
      contextLost = false
      $('failure').hidden = true
      restartClock()
    } catch (err) {
      console.error(err)
      fail('No se pudo recuperar la GPU. Volvé a cargar Fosfeno.')
    }
  })
  function sketchAtURL() {
    const query = new URL(location.href).searchParams
    const id = query.get('sketch_id')
    const item = SKETCHES.find((s) => s.id === id) || HYDRA_GALLERY.find((s) => s.id === id)
    if (item) return { item, bundled: true }
    if (query.has('code')) {
      try {
        const code = decodeURIComponent(atob(query.get('code')))
        return { item: { id: 'enlace', name: 'Sketch de enlace', code } }
      } catch {
        return { error: 'El enlace no contiene código Hydra válido.' }
      }
    }
    return id ? { error: 'Este identificador no figura en el catálogo local.' } : {}
  }
  function applyURLVisibility() {
    const query = new URL(location.href).searchParams
    const hide = (query.get('showCode') || query.get('show-code')) === 'false'
    if (hide && !document.body.classList.contains('quiet')) hideUI()
  }
  function navigateHistory(event) {
    const { item, bundled, error } = sketchAtURL()
    if (error) {
      status(error, true)
      return
    }
    const play = item ? bundled || event.state?.fosfenoRun === historySession : initialDocument.play
    load(item || initialDocument.item, !!play)
    applyURLVisibility()
  }
  async function start() {
    try {
      engine = new VisualEngine(canvas, state, inputs, sound.hydraAudio, room)
      sectors.attach(engine)
      resize()
      new ResizeObserver(resize).observe(stage)
      const { item, bundled, error } = sketchAtURL()
      await engine.run((bundled ? item : SKETCHES[0]).code)
      appliedText = (bundled ? item : SKETCHES[0]).code
      restoreEditor(item, bundled)
      initialDocument = { item: current, play: armed && !pendingFresh }
      if (error) status(error, true)
      else if (location.protocol !== 'file:' && !history.state?.fosfenoEntry) {
        const url = new URL(location.href)
        if (!item && armed && !pendingFresh) url.searchParams.set('sketch_id', current.id)
        try {
          history.replaceState({ ...history.state, fosfenoEntry: historySession }, '', url)
        } catch {
          notify('El navegador no permite asociar el borrador a esta entrada del historial.')
        }
      }
      applyURLVisibility()
      window.addEventListener('popstate', navigateHistory)
      scheduleFrame()
    } catch (e) {
      console.error(e)
      fail('No se pudo iniciar la salida WebGL. ' + e.message)
    }
  }
  start()
})()
