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
    mapping: 'm4 5 15-2 2 16-17 2zM4 5l17 14M19 3 4 21',
    screen: 'M2 4h20v13H2zM12 17v4m-5 0h10',
    upload: 'M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5',
    mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0m-7 7v4m-4 0h8',
    record: 'M19 12a7 7 0 1 1-14 0 7 7 0 1 1 14 0z',
    external: 'M13 3h8v8m0-8L10 14M10 6H4v14h14v-6',
    plus: 'M12 4v16M4 12h16',
    play: 'm7 4 13 8-13 8z',
    pause: 'M8 5v14m8-14v14',
    trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15',
    eye: 'M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    eyeOff: 'M3 3l18 18M10.5 10.5a2.2 2.2 0 0 0 3 3M9.3 6.5a11.2 11.2 0 0 1 2.7-.4c6.4 0 10 5.9 10 5.9a14 14 0 0 1-2.5 2.9M6.2 8.3A16 16 0 0 0 2 12s3.6 6 10 6a12 12 0 0 0 3.5-.5',
    layers: 'm3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5',
    code: 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16',
    more: 'M4 12h1m6 0h1m6 0h1'
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
    brushSpeed: 1,
    brushDetail: .65,
    brushInverse: false,
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
  let mappingEditor, mappingConnection
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
  function dismissToast() {
    const el = $('toast')
    el.classList.remove('show')
    el.replaceChildren()
  }
  function notify(message, action) {
    const el = $('toast')
    clearTimeout(toastTimer)
    el.textContent = message
    el.classList.add('show')
    if (action) {
      const open=document.createElement('button'), close=document.createElement('button')
      open.textContent=action.label
      open.onclick=()=>{ dismissToast(); action.run() }
      close.innerHTML=icon('close')
      close.setAttribute('aria-label','Cerrar aviso')
      close.onclick=()=>{ dismissToast(); $('openLoops').focus() }
      el.append(open,close)
    } else toastTimer = setTimeout(dismissToast,3500)
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
    view = 'sectors',
    signalTab = 'input'
  let revision = 0,
    queue = Promise.resolve(),
    pendingFresh = false
  updateLiveEdit()
  let applying = false
  let scopeId = null, scopeLayer = null
  const layout = new StudioLayout(cm)
  const libraryRows = new WeakMap()
  const sectors = new SectorDesk({
    live: () => live, input: () => inputs[0].current?.element || engine?.h.s0.src,
    bass: () => state.bands[0], connect: () => openVisual('camera', undefined, false), disconnect: () => clearVisual(),
    onUpdate: region => {
      if (layout.wide.matches || view === 'sectors' || (scopeId && !region)) setLayerScope(region)
      if (engine) {
        refreshLayerOverview()
        refreshApply()
        if (view === 'library') {
          for (const row of $('libraryPage').querySelectorAll('.library-row')) libraryRows.get(row)?.()
        }
      }
    }
  })
  function setLayerScope(region) {
    const layer = region ? sectors.content(region) : null
    const changed = scopeId !== (region?.id ?? null) || scopeLayer !== layer
    scopeId = region?.id ?? null
    scopeLayer = layer
    const destination = sectorLabel(region) + (layer ? ' · '+sectorLayerLabel(layer) : '')
    $('sectorTarget').textContent = 'Destino · '+destination
    $('operationTarget').textContent = $('sectorTarget').textContent
    $('sourceTarget').hidden = !region
    $('sourceTarget').textContent = region ? 'Destino · '+destination : ''
    $('primaryInputOptions').hidden = !!region
    if (engine) refreshLayerOverview()
    if (changed && engine && view === 'library') {
      library()
      if (!$('catalog').hidden) filterCommunity()
    }
  }
  const sectorTarget = () => sectors.regions.find(region=>region.id===scopeId)
  const layerTarget = () => sectors.content(sectorTarget())
  $('sectorLibrary').onclick = () => { setLayerScope(sectors.selected()); changeView('library') }
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
    efectos:'Sectores y efectos', biblioteca:'Abrir o mezclar un sketch', portatil:'Composiciones portátiles',
    imagen:'Fuentes de imagen',audio:'Audio y pulso',calidad:'Resolución',codigo:'Leer el código',loops:'Grabar y reutilizar loops'}
  all('[data-help]').forEach(b => {
    b.setAttribute('aria-haspopup','dialog')
    b.onclick = () => {
      const topic = b.dataset.help
      layout.helpAnchor = b
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
  function codePending() {
    const code=cm.getValue()
    return !!code.trim() && code!==appliedText
  }
  function updateLiveEdit() {
    const button=$('liveEdit')
    button.setAttribute('aria-pressed',live)
    button.querySelector('.live-label').textContent = live ? 'Edición en vivo' : 'Edición manual'
    button.querySelector('.live-compact').textContent = live ? 'En vivo' : 'Manual'
    button.title = live ? 'Pasar a edición manual' : 'Volver a editar en vivo'
  }
  function refreshApply() {
    const button=$('applySectors')
    button.hidden = live || !(applying || codePending() || sectors.dirty)
    button.disabled = applying
  }
  function refreshMix() {
    if (!engine) return
    refreshApply()
    refreshLayerOverview()
  }
  function refreshLayerOverview() {
    const root=$('layerOverview')
    const detail=$('sectorDetail')
    const layers=[sectors.principal,...[...sectors.regions].reverse()]
    const rows=layers.map(layer=>{
      const applied=sectors.applied.find(r=>r.id===layer.id)
      const count=applied?.visible ? sectorLayers(applied).flatMap(layer=>layer.fx).filter(f=>f.enabled!==false).length : 0
      const status=layer.id && !applied ? 'Pendiente' : applied?.visible===false ? 'Oculto' :
        count ? count+(count===1?' efecto':' efectos') : ''
      return {id:layer.id,name:sectorLabel(layer),visible:layer.visible,status}
    })
    const key=JSON.stringify([rows,scopeId])
    if (root.dataset.state===key) return
    root.dataset.state=key
    const existing = new Map(Array.from(root.querySelectorAll(':scope > .layer-overview-row'), row => [row.dataset.sectorId,row]))
    const ordered = []
    const selectedId = scopeId ?? 0
    detail.dataset.selection = selectedId
    for (const row of rows) {
      const line = existing.get(String(row.id)) || makeSectorRow(row.id)
      const [select,visibility] = line.children
      const [name,status] = select.children
      const selected = row.id === selectedId
      name.textContent = row.name
      status.textContent = row.status
      select.setAttribute('aria-label',row.name)
      select.setAttribute('aria-pressed',selected)
      if (visibility) {
        const label=(row.visible?'Ocultar ':'Mostrar ')+row.name
        visibility.setAttribute('aria-label',label)
        visibility.title=label
        if (visibility.dataset.visible!==String(row.visible)) {
          visibility.dataset.visible=row.visible
          visibility.innerHTML=icon(row.visible?'eye':'eyeOff')
        }
      }
      ordered.push(line)
      if (selected) ordered.push(detail)
    }
    // Keep the selected editor and its focused inputs mounted when a row's status changes.
    let cursor = root.firstElementChild
    for (const node of ordered) {
      if (node===cursor) cursor = cursor.nextElementSibling
      else root.insertBefore(node,cursor)
    }
    while (cursor) {
      const next = cursor.nextElementSibling
      cursor.remove()
      cursor = next
    }
    detail.hidden = false
  }
  function makeSectorRow(id) {
    const line=document.createElement('div'), select=document.createElement('button')
    const name=document.createElement('strong'), status=document.createElement('span')
    line.className='layer-overview-row'
    line.dataset.sectorId=id
    select.className='layer-select'
    select.setAttribute('aria-controls','sectorDetail')
    select.onclick=()=>{
      sectors.id=id || null
      if (sectors.mode || sectors.drag) sectors.note('')
      sectors.mode=null
      sectors.cancelDrag()
      sectors.panel(null)
      if (!layout.wide.matches) changeView('sectors')
      sectors.refresh()
      $('addSectorEffect').scrollIntoView({block:'nearest'})
    }
    status.className='layer-count'
    select.append(name,status)
    line.append(select)
    if (id) {
      const visibility=document.createElement('button')
      visibility.className='layer-visibility'
      visibility.onclick=()=>{
        const layer=sectors.regions.find(region=>region.id===id)
        if (layer) { layer.visible=!layer.visible; sectors.changed() }
      }
      line.append(visibility)
    }
    return line
  }
  function changeView(next, openTools = true) {
    view=next
    layout.showPanes(next)
    if (!layout.wide.matches && next!=='sectors') sectors.panel(null)
    sectors.show(layout.wide.matches ? layout.layersVisible : next==='sectors')
    if (next==='sectors') setLayerScope(sectors.selected())
    layout.activeTool = next==='signal' && signalTab==='audio' ? $('signalOpen') :
      document.querySelector('#studioNav [data-view="'+layout.activeView(next)+'"]')
    layout.open(openTools)
    if (layout.activeView(next)==='code') requestAnimationFrame(()=>cm.refresh())
    if (next==='library') library()
  }
  layout.wide.addEventListener('change',()=>changeView(view,layout.opened))
  function showLayers(on) {
    layout.setLayersVisible(on)
    if (!on) sectors.panel(null)
    sectors.show(on)
  }
  $('closeSectors').onclick = () => {
    showLayers(false)
    $('backToLayers').focus({preventScroll:true})
  }
  $('closeTools').onclick = () => {
    layout.open(false)
    layout.activeTool?.focus({preventScroll:true})
  }
  for (const id of ['newSector','addSectorEffect']) {
    $(id).addEventListener('click',()=>{
      const panel=$(id==='newSector' ? 'sectorShapes' : 'effectPicker')
      if (!panel.hidden) panel.scrollIntoView({block:'nearest'})
    })
  }
  document.addEventListener('pointerdown',event=>{
    if (!$('outputChoices').hidden && !$('outputChoices').contains(event.target) &&
        !$('chooseOutput').contains(event.target)) outputPicker(false)
  })
  document.addEventListener('keydown',event=>{
    if (event.key==='Escape' && !$('outputChoices').hidden && !$('helpDialog').open) {
      outputPicker(false)
      $('chooseOutput').focus()
    }
  })
  function openPanel(tab) {
    signalTab = tab
    changeView('signal')
    selectButtons('[data-tab]', 'tab', tab)
    all('[data-pane]').forEach((el) => (el.hidden = el.dataset.pane !== tab))
    if (tab === 'input') listCameras()
  }
  function fromToolbar(next, tab) {
    if (layout.wide.matches && next==='sectors') {
      showLayers(true)
      $('newSector').focus({preventScroll:true})
      return
    }
    if (layout.activeView(view)===next && (!tab || signalTab===tab)) layout.open(true)
    else if (tab) openPanel(tab)
    else changeView(next)
    if (next==='code' && !layout.compact.matches) cm.focus()
  }
  all('[data-view]').forEach(
    b => b.onclick = () => fromToolbar(b.dataset.view, b.dataset.view === 'signal' ? 'input' : undefined)
  )
  all('[data-tab]').forEach((b) => (b.onclick = () => openPanel(b.dataset.tab)))
  $('signalOpen').onclick = () => fromToolbar('signal','audio')
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
  function restoreEditor(reference, play, fallback) {
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
      current = reference || fallback
      setText(current.code)
      $('scoreName').value = current.name
      if (current.generator) $('seed').value=current.generator.seed
      status('Sketch en salida.')
    }
    changeView('sectors', false)
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
          status(whole ? 'Sketch ejecutado' : 'Bloque ejecutado')
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
    clearTimeout(timer)
    status(live ? (armed ? 'Actualizando la salida…' : 'Ejecutá para activar este sketch.') : 'Cambios preparados.')
    refreshApply()
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
  $('applySectors').onclick = async () => {
    if (applying || live || !(codePending() || sectors.dirty)) return
    const restoreFocus = document.activeElement===$('applySectors')
    applying=true
    refreshApply()
    try {
      if (codePending() && !await execute(cm.getValue())) return
      sectors.apply()
    } finally {
      applying=false
      refreshApply()
      if (restoreFocus && $('applySectors').hidden && document.activeElement===document.body) $('liveEdit').focus({preventScroll:true})
    }
  }
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
    updateLiveEdit()
    store('live-edit', live)
    clearTimeout(timer)
    flush()
    if (live && armed) execute(cm.getValue())
    else status(live ? 'Ejecutá para activar este sketch.' : 'Edición manual')
    refreshApply()
  }
  window.addEventListener('pagehide', flush)
  $('save').onclick = () => {
    if (archive(true)) {
      store('draft', null)
      if (view === 'library') library()
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
    const region = layerTarget()
    open.onclick = () => {
      if (!region) return load(item,play)
      sectors.toggleLibrary(region,item,true)
      changeView('sectors')
    }
    const mix = document.createElement('button')
    mix.className = 'line-button'
    mix.textContent = 'Mezclar'
    mix.setAttribute('aria-label', 'Mezclar ' + item.name)
    const target = region || sectors.principal
    const refresh = () => {
      const on = target.fx.some(f=>f.kind==='library' && f.enabled!==false && f.name===item.name && f.code===item.code)
      mix.setAttribute('aria-pressed',on)
      mix.textContent = on ? 'En mezcla' : 'Mezclar'
      strength.hidden=!on
      if (on) {
        slider.value=Math.round(target.fx.find(f=>f.kind==='library' && f.name===item.name && f.code===item.code).value*100)
        level.value=slider.value+'%'
        paintRange(slider)
      }
    }
    const strength=document.createElement('label'), slider=document.createElement('input'), level=document.createElement('output')
    strength.className='library-strength'
    slider.type='range'; slider.min=0; slider.max=100
    slider.setAttribute('aria-label','Mezcla de '+item.name)
    slider.oninput=()=>{
      const index=target.fx.findIndex(f=>f.kind==='library' && f.name===item.name && f.code===item.code)
      if (index<0) return
      sectors.effectAmount(target,index,Number(slider.value)/100)
    }
    strength.append(slider,level)
    mix.onclick = () => sectors.toggleLibrary(target,item,false)
    libraryRows.set(row,refresh)
    refresh()
    row.append(open, mix, strength)
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
  function seedSketch(seed,symmetry = 'libre') {
    return {id:'seed-'+seed,name:'Semilla '+seed,code:growSketch(seed,symmetry),generator:{seed,fold:symmetry}}
  }
  function randomSeed() {
    return crypto.getRandomValues(new Uint32Array(1))[0]
  }
  function startupSketch() {
    let seed=randomSeed()
    try {
      if (sessionStorage.getItem('fosfeno:last-seed')===String(seed)) seed=(seed+1)>>>0
      sessionStorage.setItem('fosfeno:last-seed',String(seed))
    } catch {}
    return seedSketch(seed)
  }
  function generate(fromField, manual = true) {
    const raw = fromField ? $('seed').value.trim() : ''
    if (raw && (!/^\d+$/.test(raw) || Number(raw) > 4294967295)) {
      notify('Usá una semilla entera entre 0 y 4294967295.')
      return
    }
    const seed = raw ? Number(raw) : randomSeed()
    const target = manual && layerTarget()
    if (target) {
      sectors.toggleLibrary(target,{name:'Semilla '+seed,code:growSketch(seed,fold)},true)
      changeView('sectors')
      return
    }
    load(seedSketch(seed,fold),true,manual)
  }
  $('grow').onclick = () => generate(true)
  $('explore').onclick = () => generate(false)
  $('blank').onclick = () => {
    if (layerTarget()) {
      changeView('sectors')
      sectors.panel('layerCode',true)
      $('sectorCode').focus()
      return
    }
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
      if (file && layerTarget()) {
        const content = await file.text()
        changeView('sectors')
        sectors.panel('layerCode',true)
        $('sectorCode').value=content
        $('sectorCode').focus()
      } else if (file)
        load(
          { id: 'importado', name: file.name.replace(/\.(js|txt)$/i, ''), code: await file.text() },
          false
        )
    } catch (err) {
      notify(err.message)
    }
    e.target.value = ''
  }
  let sourceMix = null, panelInputMix = false, appliedText = null, syncEdits = false
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
  function insertOperator(fragment, atCursor = true) {
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
    })
    return mark
  }
  function editAction(fn) {
    try { return fn() }
    catch (e) { status(e.message, true); notify(e.message) }
  }
  function removeEffect(effect) {
    syncEdits = true
    cm.replaceRange('',cm.posFromIndex(effect.start),cm.posFromIndex(effect.end))
  }
  const operatorEditor = new OperatorEditor(cm,()=>engine.hydra.generator.glslTransforms,(expression,source)=>editAction(()=>{
    const target=sectors.target()
    sectors.add(target,{kind:'operator',name:expression.split('(')[0],
      code:source ? '.blend('+expression+', 0.5)' : '.'+expression,definitions:[]})
  }),async item=>{
    await creations.add(item.name,packComposition(item),'operator')
    notify('Operador guardado en Biblioteca → Creaciones portátiles.')
  },removeEffect,notify)
  function showCodeInspector(open) {
    $('operatorInspector').hidden=!open
    $('effectPanel').hidden=!open
    $('adjustMode').setAttribute('aria-expanded',open)
    if (open) { operatorEditor.draw(); $('effectPanel').scrollTop=0 }
  }
  $('adjustMode').onclick=()=>showCodeInspector($('operatorInspector').hidden)
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
      sourceMix = insertOperator(cameraBlend,false)
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
  showCodeInspector(false)
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
    paintRange(el)
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
  range('inputRanges', 'brushSpeed', 'Velocidad', 25, 300, 100, (v) => (state.brushSpeed = v / 100))
  range('inputRanges', 'brushDetail', 'Definición final', 0, 100, 65, (v) => (state.brushDetail = v / 100))
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
  $('brushInverse').onclick = () => {
    state.brushInverse=!state.brushInverse
    $('brushInverse').setAttribute('aria-pressed',state.brushInverse)
  }
  function updateBrush() {
    const source = inputs[0].current
    $('inputRanges').hidden = !state.painting
    $('brushInverse').hidden = !state.painting
    $('brushProgress').hidden = !state.painting
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
    const {painting,brush,brushSpeed,brushDetail,brushInverse,internalPulse,sensitivity,quality} = state
    return {name:$('scoreName').value.trim() || 'Sin título',code:cm.getValue(),regions:sectors.snapshot(),selectedSector:sectors.id,
      input:inputs[0].current?.file, inputKind:inputs[0].current?.kind || null,
      settings:{painting,brush,brushSpeed,brushDetail,brushInverse,internalPulse,sensitivity,quality,resolution:state.sketchResolution || null,bpm:window.bpm,output:engine.output,
        autoMix:$('autoMixInput').getAttribute('aria-pressed') === 'true',fold,seed:$('seed').value}}
  }, async activate(project) {
    if (project.kind === 'operator') {
      const target = layerTarget()
      if (target) {
        sectors.add(target,{kind:'operator',name:project.name,code:project.code,definitions:project.definitions,origin:project.origin})
        changeView('sectors')
        return
      }
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
        insertOperator(project.code)
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
      for (const [id,value] of [['brushSize',settings.brush*100],['sensitivity',settings.sensitivity*100],
        ['brushSpeed',(settings.brushSpeed ?? 1)*100],['brushDetail',(settings.brushDetail ?? .65)*100]]) {
        $(id).value = value; $(id).oninput()
      }
      state.bpm = window.bpm = settings.bpm
      const tempo = $('bpm')
      tempo.min = Math.min(1,settings.bpm); tempo.max = Math.max(220,settings.bpm); tempo.value = settings.bpm
      document.querySelector('output[for="bpm"]').textContent = settings.bpm+' BPM'; meterStyle(tempo)
      state.painting = settings.painting; brush.reset(); updateBrush()
      state.brushInverse = settings.brushInverse===true
      $('brushInverse').setAttribute('aria-pressed',state.brushInverse)
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
      if (!installed) next.flatMap(sectorLayers).forEach(layer=>layer.file?.clear())
    }
  }})
  new LoopLibrary({
    store:(mode,job)=>sectors.store(mode,job), notify,
    openLibrary:()=>{
      dismissToast()
      if (document.body.classList.contains('preview-focus')) layout.focus(false)
      changeView('library')
    },
    destination:layerTarget,
    source:()=>{
      const target=sectorTarget()
      return target ? {...sectors.captureSource(target),name:target.shape+' '+target.id} : {canvas,name:'Salida'}
    },
    use:async (file,target)=>{
      if (target) {
        if (!sectors.containsLayer(target) || !await sectors.setFile(target,file)) return
        if (target!==layerTarget()) return
        if (layout.wide.matches) showLayers(true)
        changeView('sectors')
        sectors.panel('sectorMedia',true)
        $('sectorFileButton').focus()
      } else if (await inputs[0].open('file',{file})) {
        mixInput()
        if (!layerTarget()) openPanel('input')
      }
    }
  })

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
    $('clearVisual').textContent = input?.kind === 'camera' ? 'Desconectar cámara' : 'Desconectar entrada'
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
    const layer = layerTarget()
    const region = sectorTarget()
    try {
      if (!await inputs[0].open(kind, options)) return false
      if (layer && sectors.containsLayer(layer)) {
        layer.source='s0'
        layer.file=layer.request=null
        sectors.changed()
        $('routeStatus').textContent='Entrada s0 conectada a '+sectorLabel(region)+' · '+sectorLayerLabel(layer)+'.'
      } else if (!layer && mix) mixInput()
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
  $('clearVisual').onclick = clearVisual
  function clearVisual() {
    panelInputMix = false
    inputs[0].clear()
    const range = sourceMix?.find()
    if (range && /^\.blend\(src\(s0\),\s*[\d.]+\)$/.test(cm.getRange(range.from, range.to))) {
      cm.replaceRange('', range.from, range.to)
    }
    sourceMix = null
    $('routeStatus').textContent = ''
    sectors.refresh()
  }
  $('cancelVisual').onclick = () => {
    inputs[0].cancel()
    visualStatus('Conexión cancelada.')
  }
  navigator.mediaDevices?.addEventListener?.('devicechange', listCameras)
  $('fileVisual').onclick = () => $('visualFile').click()
  $('visualFile').onchange = (e) => {
    const file = e.target.files[0]
    const target = layerTarget()
    if (file && target) sectors.setFile(target,file).then(()=>{
      changeView('sectors'); sectors.panel('sectorMedia',true)
    }).catch(err=>notify(err.message))
    else if (file) openVisual('file', { file })
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
    const workerURL = new URL('sw.js?v=2.18', location.href).href
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
    const compactEdit = layout.opened && !document.body.matches('.preview-focus,.quiet,.projecting')
    // Keep the sketch at the same resolution when the compact inspector opens.
    const rect = (compactEdit ? layout.bench : stage).getBoundingClientRect()
    engine.resize(
      external ? projector.innerWidth : rect.width,
      external ? projector.innerHeight : rect.height
    )
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
    if (e.target !== canvas && (e.target !== sectors.guide || sectors.mode)) return
    if (document.body.classList.contains('quiet')) hideUI()
    else fullscreen().catch((e) => notify(messageFor(e)))
  })
  action($('project'), openOutput)
  action($('fullPanel'), fullscreen)
  $('openMapping').onclick = (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (location.protocol === 'file:') return notify('Abrí el estudio por localhost o HTTPS para usar Mapeo.')
    if (mappingEditor && !mappingEditor.closed) return mappingEditor.focus()
    mappingEditor = window.open('mapeo.html', 'fosfenoMapping')
    if (!mappingEditor) notify('Permití que Fosfeno abra la pestaña de mapeo.')
  }
  window.connectFosfenoMapping = (editor, getOutput) => {
    if (!canvas.captureStream) throw new Error('Este navegador no puede compartir la salida Hydra en vivo.')
    mappingConnection?.close()
    const stream = canvas.captureStream(30)
    const track = stream.getVideoTracks()[0]
    const visibility = editor.document
    const connection = {
      stream,
      windows: () => [getOutput(), editor],
      refresh: restartClock,
      close() {
        visibility.removeEventListener('visibilitychange', restartClock)
        track.stop()
        if (mappingConnection === connection) {
          mappingConnection = null
          restartClock()
        }
      }
    }
    mappingConnection = connection
    visibility.addEventListener('visibilitychange', restartClock)
    restartClock()
    return connection
  }
  function openOutput() {
    if (projector && !projector.closed) {
      projector.focus()
      return
    }
    if (!canvas.captureStream)
      throw new Error('Usá Pantalla completa. Este navegador no admite una segunda salida.')
    const win = window.open('', '_blank', 'popup,width=960,height=540')
    if (!win) throw new Error('Permití la ventana emergente o usá Imagen → Salida → Pantalla completa.')
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
    mappingConnection?.close()
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
    const peers = mappingConnection?.windows() || []
    frameClock = document.hidden
      ? [projector, ...peers].find(peer => peer && !peer.closed && !peer.document.hidden) || window
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
      const medium = state.painting ? brush.paint(source, now, state.brush, state.bands[0],state.brushSpeed,state.brushDetail,state.brushInverse) : source
      if (medium && engine.attached[0] !== medium)
        engine.setMedium(medium, 0, inputs[0].current.params)
    }
    engine.tick(ms, sound)
    frameCount++
    frameMs += ms
    if (now - lastUI > 120) {
      lastUI = now
      refreshMix()
      if (state.painting) paintStatus('brushProgress',brush,state.brushInverse)
      const layer=sectors.content(sectors.selected())
      if ((view==='sectors' || (layout.wide.matches && layout.layersVisible)) && layer?.paint) {
        paintStatus('sectorBrushProgress',sectors.activeBrush(),layer.brushInverse)
      }
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
        const label = selected.textContent
        if ($('outputCaption').textContent !== label) {
          $('outputCaption').textContent=label
          $('outputCompact').textContent=engine.output==='all' ? 'Mosaico' : 'Salida o'+engine.output
          $('chooseOutput').setAttribute('aria-label','Elegir salida. '+label)
        }
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
  function paintStatus(id,surface,inverse) {
    const percent=Math.floor((surface?.progress || 0)*20)*5
    const caption=(inverse ? 'Deconstrucción ' : 'Reconstrucción ')+percent+'%'
    if ($(id).textContent!==caption) $(id).textContent=caption
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
      const fallback=bundled ? item : startupSketch()
      await engine.run(fallback.code)
      appliedText = fallback.code
      restoreEditor(item,bundled,fallback)
      initialDocument = { item: current, play: armed && !pendingFresh }
      if (error) status(error, true)
      else if (location.protocol !== 'file:' && !history.state?.fosfenoEntry) {
        const url = new URL(location.href)
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
