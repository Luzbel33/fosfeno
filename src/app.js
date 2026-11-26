;(() => {
  'use strict'
  const edition = '3.1.9'
  const blankScore = '// Tu sketch Hydra'
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
    chevron: 'm9 5 7 7-7 7',
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
  const initialSettings = { ...state, autoMix: true, output: '0', fold: 'libre', seed: '' }
  const canvas = $('visual'),
    stage = $('stage'),
    brush = new BrushSurface()
  let engine,
    projector = null,
    wakeLock = null
  let mappingConnection, mappingMode = false, mappingBench = false, mappingReference, mappingAspect
  let pendingMapSeed = null
  let drawMappingReference = true, mappingPreviewFrame
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
  const layerEditor = $('sectorCode')
  let projectedLayer = null, codeBrowser=null, codeSelection='', openingCode=false
  const projectorCode = new ProjectorCode(() => codeBrowser?.scoped && !codeBrowser.page.hidden && !projectedLayer
    ? {text:codeBrowser.projected ? codeBrowser.cm.getValue() : '',cursor:codeBrowser.cm.indexFromPos(codeBrowser.cm.getCursor())}
    : projectedLayer
    ? {text:layerEditor.value,cursor:layerEditor.selectionDirection==='backward' ? layerEditor.selectionStart : layerEditor.selectionEnd}
    : {text:cm.getValue(),cursor:cm.indexFromPos(cm.getCursor())})
  window.fosfenoProjectorCode = projectorCode
  projectorCode.bind($('showProjectorCode'))
  projectorCode.bind($('showCodeSettings'))
  projectorCode.attach(stage,()=>document.fullscreenElement===stage || document.body.classList.contains('projecting'))
  function showDraft(layer) {
    projectedLayer = layer ? sectors.target() : null
    projectorCode.refresh()
  }
  cm.on('focus',()=>showDraft(false))
  cm.on('change',()=>{ if (!projectedLayer || cm.hasFocus()) showDraft(false) })
  cm.on('cursorActivity',()=>{ if (!projectedLayer) projectorCode.refresh() })
  for (const event of ['focus','input','select','selectionchange','keyup','pointerup']) {
    layerEditor.addEventListener(event,()=>{ if (document.activeElement===layerEditor) showDraft(true) })
  }
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
  let baseMode = 'visible', outputBaseMode = 'empty', outputBaseName = ''
  updateLiveEdit()
  let applying = false
  let scopeId = null, scopeLayer = null
  const layout = new StudioLayout(cm)
  const libraryRows = new WeakMap()
  const sectors = new SectorDesk({
    linkLibraryInstance,seedRecipe,
    live: () => live, input: () => inputs[0].current?.element || engine?.h.s0.src,
    inputFile: () => inputs[0].current?.file,
    bass: () => state.bands[0], connect: () => openVisual('camera', undefined, false), disconnect: () => clearVisual(),
    onUpdate: region => {
      if (projectedLayer) queueMicrotask(()=>{
        if (projectedLayer!==sectors.target()) projectedLayer=null
        projectorCode.refresh()
      })
      if (layout.wide.matches || view === 'sectors' || (scopeId && !region)) setLayerScope(region)
      if (engine) {
        refreshMix()
        refreshLibraryIndicators()
      }
    }
  })
  sectors.history = new SectorHistory(sectors,{notify})
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
      if (!$('shelfSeed').hidden) restoreSeedControls()
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
  else saved=saved.map(item=>({...item,personal:true}))
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
      if (topic === 'codigo') body.append($('codeShortcuts').content.cloneNode(true))
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
    return baseMode !== outputBaseMode || (hasSketch(code) && code!==appliedText)
  }
  function getStudioBase() {
    return {name:baseMode==='empty' ? '' : $('scoreName').value.trim() || 'Sin título',
      present:baseMode!=='empty',visible:baseMode==='visible',pending:codePending(),
      outputMode:outputBaseMode,outputName:outputBaseName}
  }
  function setOutputBase(mode, name = outputBaseName) {
    outputBaseMode = mode
    outputBaseName = mode === 'empty' ? '' : name
    state.baseVisible = mode === 'visible'
    refreshMix()
  }
  function markBaseEntry() {
    if (location.protocol === 'file:') return
    if (outputBaseMode==='visible' && !history.state?.fosfenoBase) return
    const url = new URL(location.href), entry = {...history.state}
    if (outputBaseMode === 'visible') delete entry.fosfenoBase
    else entry.fosfenoBase = outputBaseMode
    if (outputBaseMode === 'hidden') entry.fosfenoHiddenScore = draft()
    else delete entry.fosfenoHiddenScore
    if (outputBaseMode === 'empty') {
      url.searchParams.delete('sketch_id')
      url.searchParams.delete('code')
    }
    try { history.replaceState(entry,'',url) } catch {}
  }
  function prepareEmptyBase() {
    revision++
    clearTimeout(timer)
    toggleAuto(false)
    baseMode = 'empty'
    current = {id:'nuevo',name:'Sin título',code:''}
    setText('')
    $('scoreName').value = current.name
    pendingFresh = true
    modified = false
    armed = true
    store('draft',null)
    refreshMix()
    refreshLibraryIndicators()
  }
  function applyEmptyBase() {
    // Mute the old score even while its asynchronous JS is finishing.
    appliedText = ''
    syncEdits = false
    pendingFresh = true
    setOutputBase('empty')
    markBaseEntry()
    status('Sin fondo.')
    const previous = engine
    if (!previous) return Promise.resolve(false)
    if (!previous.running) {
      previous.clearScore()
      return Promise.resolve(true)
    }
    queue = queue.then(() => {
      if (engine === previous) previous.clearScore()
      return true
    })
    return queue
  }
  function clearStudioBase() {
    prepareEmptyBase()
    $('seed').value = ''
    return applyEmptyBase()
  }
  function removeStudioBase() {
    if (baseMode === 'empty') return
    const previous = {...current,name:$('scoreName').value,code:cm.getValue(),baseMode}
    const play = armed
    prepareEmptyBase()
    if (live) applyEmptyBase()
    else status('Fondo quitado en la edición. Aplicá para actualizar la salida.')
    const cleared = revision
    notify(live ? 'Fondo quitado.' : 'Fondo listo para quitar.',{label:'Deshacer',run:()=>{
      if (revision !== cleared || baseMode !== 'empty') return notify('La edición ya cambió.')
      load(previous,live && play,false)
      if (!live) { armed=play; refreshMix() }
    }})
  }
  function toggleStudioBase() {
    if (baseMode === 'empty') return
    baseMode = baseMode === 'hidden' ? 'visible' : 'hidden'
    if (baseMode==='hidden') toggleAuto(false)
    if (live && baseMode==='visible' && (pendingFresh || !engine?.lastProgram.length)) execute(cm.getValue(),{fresh:true})
    else if (live && outputBaseMode !== 'empty') {
      setOutputBase(baseMode)
      markBaseEntry()
    } else if (live && armed) execute(cm.getValue())
    refreshMix()
  }
  async function applyStudioEdits() {
    if (baseMode === 'empty') return outputBaseMode === 'empty' || applyEmptyBase()
    if (appliedText !== cm.getValue() || outputBaseMode === 'empty') return execute(cm.getValue())
    setOutputBase(baseMode)
    markBaseEntry()
    return true
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
    syncMapSeed()
    refreshApply()
    refreshLayerOverview()
  }
  function refreshLibraryIndicators() {
    if (view === 'library') {
      const baseCode = baseMode==='empty' ? '' : cm.getValue()
      for (const row of $('libraryPage').querySelectorAll('.library-row')) libraryRows.get(row)?.(baseCode)
      refreshSeedMix()
    }
  }
  const layerTreeOpen = new Map()
  const studioStack = new StudioStack(sectors,{
    snapshot:()=>({rows:stackRows(true),selection:studioStack.active(),base:getStudioBase(),
      pendingOutput:!live && (sectors.dirty || codePending()),
      canUndo:!!sectors.history?.past.length,canRedo:!!sectors.history?.future.length}),
    base:getStudioBase,
    baseAction:action=>action==='toggle' ? toggleStudioBase() : removeStudioBase(),
    open:openStackItem
  })
  function writeEffectCode(effect,code) {
    if (effect.kind==='library') effect.libraryId ??= linkLibraryInstance(effect)
    effect.code=code
    delete effect.generator
  }
  codeBrowser=new StudioCodeBrowser({base:cm,desk:sectors,stack:studioStack,baseInfo:getStudioBase,live:()=>live,writeEffectCode,
    signal:()=>inputs[0].current,project:()=>projectorCode.refresh(),returnMap:()=>{if(mappingMode) mappingView(true)},
    select:ref=>{
      openingCode=true
      try {
        studioStack.select(ref)
        sectors.refresh()
        codeSelection=JSON.stringify(studioStack.active())
      } finally { openingCode=false }
    }})
  function openSelectionCode(ref) {
    const fromMap=mappingMode && mappingBench
    ref ??= (fromMap && mappingDesk()?.codeTarget?.()) || studioStack.active()
    openingCode=true
    try {
      if (ref.language!=='json') {
        try { studioStack.resolve(ref) }
        catch (error) { notify(error.message); return }
        studioStack.select(ref)
        sectors.refresh()
      }
      if (fromMap) mappingView(false)
      changeView('code',true,true)
      codeBrowser.open(ref,fromMap)
      codeSelection=JSON.stringify(studioStack.active())
      showDraft(false)
      if (!layout.compact.matches) (codeBrowser.scoped ? codeBrowser.cm : cm).focus()
    } finally { openingCode=false }
  }
  window.openFosfenoCode=openSelectionCode
  window.fosfenoStack={
    capabilities:ref=>studioStack.capabilities(ref),
    snapshot:studioStack.actions.snapshot,
    subscribe:callback=>studioStack.subscribe(callback),
    choices(ref,mode,query='') {
      const {layer,effect}=studioStack.resolve(ref)
      const normalize=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
      const term=normalize(query.trim())
      const matches=(...fields)=>fields.some(field=>normalize(field).includes(term))
      if (mode==='library') {
        const rows=(items,collection)=>items.filter(item=>matches(item.name,item.group || '')).map(item=>{
          const instance=findLibraryEffect(layer,item,ref.kind==='effect' && effect)
          return {key:collection+':'+item.id,name:item.name,active:!!instance && instance.enabled!==false,
            assigned:!!instance,modified:isLibraryVariation(item,instance),
            effect:instance ? {sectorId:ref.sectorId,layerId:ref.layerId??0,kind:'effect',
              index:layer.fx.indexOf(instance),effectId:studioStack.effectKey(instance)} : null}
        })
        return [...rows(saved,'saved'),...rows(SKETCHES,'builtin')]
      }
      const rows=quickSectorEffects().filter(name=>matches(name)).map(name=>({
        key:'quick:'+name,name,active:layer.fx.some(f=>(f.preset===name || !f.kind && f.name===name) && f.enabled!==false)
      }))
      if (term) for (const [name,op] of Object.entries(engine.hydra.generator.glslTransforms)) {
        if (!['src','coord','color','combine','combineCoord'].includes(op.type) || !matches(name)) continue
        const code=stackOperatorCode(name,op)
        rows.push({key:'hydra:'+name,name:name+'()',active:layer.fx.some(f=>f.kind==='operator' && f.code===code && f.enabled!==false)})
      }
      return rows
    },
    applyChoice(ref,key) {
      const {layer,effect:preferred}=studioStack.resolve(ref)
      const split=key.indexOf(':'), family=key.slice(0,split), id=key.slice(split+1)
      studioStack.select(ref)
      if (family==='quick' && quickSectorEffects().includes(id)) sectors.toggleNamedEffect(layer,id)
      else if (family==='hydra') {
        const op=engine.hydra.generator.glslTransforms[id]
        if (!op) throw new Error('El operador ya no está disponible.')
        const code=stackOperatorCode(id,op)
        const effect=layer.fx.find(f=>f.kind==='operator' && f.code===code)
        if (effect) { effect.enabled=effect.enabled===false; sectors.changed() }
        else sectors.add(layer,{kind:'operator',name:id,code,definitions:[]})
      } else {
        const item=(family==='saved' ? saved : family==='builtin' ? SKETCHES : []).find(item=>String(item.id)===id)
        if (!item) throw new Error('El elemento ya no está en la biblioteca.')
        sectors.toggleLibrary(layer,item,false,ref.kind==='effect' && preferred)
      }
    },
    editLibraryChoice(ref,key) {
      studioStack.select(ref)
      setLayerScope(sectors.selected())
      const separator=key.indexOf(':'), collection=key.slice(0,separator), id=key.slice(separator+1)
      const item=(collection==='saved'?saved:SKETCHES).find(entry=>String(entry.id)===id)
      if (!item) throw new Error('La visual ya no está en la biblioteca.')
      openLibraryParameters(item,true,layerTarget())
    },
    async file(ref,file) {
      const {layer}=studioStack.resolve(ref)
      const assigned=await sectors.setFile(layer,file)
      if (!assigned) throw new Error('La capa cambió antes de que terminara la carga.')
    },
    geometry:{
      shapes:[...sectorShapes], outline:regionPoints, drag:dragRegionPoints, handles:points=>sectors.handles(points),
      projected:id=>sectors.applied.some(region=>region.id===id && region.visible),
      applied:id=>sectors.applied.some(region=>region.id===id),
      transform:(...args)=>sectors.transformRegion(...args),
      controls:(...args)=>sectors.transformControls(...args),
      create(shape,points,color) {
        if (!sectorShapes.includes(shape) || !sectorColorPattern.test(color)) throw new Error('Forma o color inválido.')
        const area=mapSectorPoints(points)
        const region={...emptyLayer(),id:sectors.nextId++,visible:true,shape,points:area,
          style:{...defaultSectorStyle,strokeOn:true,stroke:color}}
        sectors.regions.push(region)
        const ref={sectorId:region.id,layerId:0,kind:'sector'}
        studioStack.select(ref)
        sectors.changed()
        return ref
      },
      update(id,original,points) {
        const region=sectors.regions.find(item=>item.id===id)
        if (!region || region.points.length!==original.length ||
            region.points.some(([x,y],i)=>x!==original[i][0] || y!==original[i][1]))
          throw new Error('El sector cambió. Volvé a seleccionarlo.')
        region.points=mapSectorPoints(points)
        sectors.changed()
      }
    },
    command:(action,ref,value)=>studioStack.command(action,ref,value)
  }
  function stackOperatorCode(name,transform) {
    const expression=name+'('+transform.inputs.map(hydraDefault).join(', ')+')'
    return transform.type==='src' ? '.blend('+expression+', 0.5)' : '.'+expression
  }
  function mapSectorPoints(points) {
    if (!Array.isArray(points) || points.length<3 || points.length>4096 ||
        points.some(p=>!Array.isArray(p) || p.length!==2 || p.some(v=>!Number.isFinite(v) || Math.abs(v)>sectorExtent)))
      throw new Error('La geometría del sector no es válida.')
    const [,,w,h]=regionBounds(points)
    if (w<.001 || h<.001) throw new Error('La forma es demasiado pequeña.')
    return points.map(([x,y])=>[x,y])
  }
  let layerDrag
  let lastStackGeometry=[]
  let browserScroll=0
  function openStackItem(action,ref) {
    if (action==='code') return openSelectionCode(ref)
    const {layer,effect,index}=studioStack.resolve(ref)
    if (action==='inspect' && ((ref.kind==='base' && getStudioBase().present && hasSketch(cm.getValue())) ||
        (ref.kind==='code' && layer.code) || (ref.kind==='effect' && effect.code && ['library','operator'].includes(effect.kind))))
      return openEffectParameters(ref)
    setLayerScope(sectors.selected())
    if (action==='loop') return chooseStackLoop()
    if (mappingMode && mappingBench) mappingView(false)
    if (!layout.layersVisible) showLayers(true)
    if (!layout.wide.matches) changeView('sectors')
    if (action==='library') { changeView('library'); showLibraryShelf('sketches'); return }
    if (action==='effects') return sectors.panel('effectPicker',true)
    let control
    if (action==='media' || ['source','paint'].includes(ref.kind)) {
      if (!ref.sectorId && (action==='media' || (ref.kind==='source' && layer.source==='s0'))) {
        openPanel('input')
        control=$('camera')
      } else if (!ref.sectorId && ref.kind==='source') control=$('stackMedia')
      else {
        sectors.panel('sectorMedia',true)
        control=ref.kind==='paint' ? $('sectorBrushSize') : layer.source==='file' ? $('sectorFileButton') :
          document.querySelector('[data-sector-src][aria-pressed=true]') || $('sectorFileButton')
      }
    } else if (['code','base'].includes(ref.kind)) {
      if (!ref.sectorId && ref.kind!=='code') { changeView('code'); cm.focus(); return }
      sectors.panel('layerCode',true)
      control=$('sectorCode')
    } else if (ref.kind==='effect') {
      control=$('sectorControls').querySelector('[data-effect-index="'+index+'"] input')
    } else if (ref.sectorId && ref.kind==='sector') {
      sectors.panel('sectorStyle',true)
      control=$('sectorFillToggle')
    } else if (ref.sectorId && ['layer','group'].includes(ref.kind)) {
      sectors.panel(null)
      control=$('sectorOpacity')
    } else {
      control=$('sectorControls').querySelector('input') || $('addSectorEffect')
    }
    if (control) {
      control.scrollIntoView({block:'nearest',inline:'nearest'})
      control.focus({preventScroll:true})
    }
  }
  function selectSectorLayer(id, layerId, action, effectIndex) {
    const region = sectors.regions.find(item => item.id === id)
    const layer = region && (layerId==null ? sectors.content(region) : sectorLayers(region).find(x=>sectorLayerId(x)===layerId))
    const kind = !action || action==='select' ?
      (layerId==null || !id ? 'sector' : layer?.source==='group'?'group':'layer') : action
    const ref = {sectorId:id || 0,layerId:layer ? sectorLayerId(layer) : 0,kind,index:effectIndex}
    studioStack.select(ref)
    if (sectors.mode || sectors.drag) sectors.note('')
    sectors.mode=null
    sectors.cancelDrag()
    sectors.panel(null)
    if (!layout.layersVisible) showLayers(true)
    if (!layout.wide.matches) changeView('sectors')
    sectors.refresh()
    if (action && action!=='select') openStackItem('select',ref)
  }
  function describeLayer(layer, applied, region) {
    const rendered = sectors.appliedLayer(layer)
    const parent = layer.groupId && sectorLayers(applied || region).find(item=>item.layerId===layer.groupId)
    const visible = applied && !!(applied.visible && !rendered?.hidden && !parent?.hidden)
    const input = layer.source==='s0' ? inputs[0].current :
      layer.source==='file' ? layer.file?.current : null
    let source = ''
    if (input?.file) {
      if (input.model) source = 'Modelo 3D · '
      else if (input.role==='loop') source = 'Loop · '
      else if (isGifFile(input.file)) source = 'GIF animado · '
      else source = input.file.type.startsWith('video/') ? 'Video en loop · ' : 'Imagen · '
      source += input.file.name
    }
    else if (input) source = input.kind==='camera' ? 'Cámara · s0' : 'Señal · s0'
    else if (layer.source==='s0') source = 's0 · sin señal'
    else if (region.id && layer.source==='sketch') source = 'Mezcla principal'
    const sourcePending = !!(region.id && input && (!rendered || rendered.source!==layer.source ||
      (layer.source==='file' && rendered.file!==layer.file)))
    const effects = layer.fx.map((fx,index)=>{
      const bounds = fx.kind==='operator' ? [] : fx.kind==='library' ? [0,0,1,.01] : sectorEffects[fx.name]
      return {name:fx.name,kind:fx.kind || 'parameter',effectId:studioStack.effectKey(fx),
        value:fx.value,min:bounds[1],max:bounds[2],step:bounds[3],enabled:fx.enabled!==false,
        ...sectorEffectStatus(fx,index,rendered,visible)}
    })
    for (const fx of rendered?.fx || []) if (visible && fx.enabled!==false && !layer.fx.includes(fx[effectOrigin]))
      effects.push({name:fx.name, state:'En salida hasta aplicar', playing:true})
    const sourceKind=input?.role==='loop' ? 'loop' : input?.model ? 'model' : input?.file?.type.startsWith('video/') ? 'video' :
      input?.file ? 'image' : input?.kind || layer.source
    return {layerId:sectorLayerId(layer),name:sectorLayerLabel(layer),groupId:layer.groupId,opacity:layer.opacity ?? 1,sourceKind,
      group:layer.source==='group', hidden:!!layer.hidden, source, sourcePending, code:!!layer.code, paint:layer.paint, effects,
      selected: layer===sectors.target(), mark:sectors.groupSelection.has(layer)}
  }
  function stackRows(includePoints=false) {
    const layers=[sectors.principal,...[...sectors.regions].reverse()]
    return layers.map(layer=>{
      const applied=sectors.applied.find(r=>r.id===layer.id)
      const entries = sectorLayers(layer).map(item=>describeLayer(item,applied,layer))
      const count=entries.flatMap(entry=>entry.effects).filter(effect=>effect.playing).length
      const status=layer.id && !applied ? 'Pendiente' : applied?.visible===false ? 'Oculto' :
        count ? count+(count===1?' efecto':' efectos') : layer.id ? '' : 'Sin efectos activos'
      const hasTree = !!layer.id || entries.some(item=>item.source || item.effects.length || item.paint || item.code)
      const open = sectors.groupFor===layer.id || (layerTreeOpen.get(layer.id) ?? true)
      const summary = entries.flatMap(entry=>[entry.layerId && entry.name,entry.source,entry.code && 'Código',entry.paint && 'Pinceladas',
        ...entry.effects.map(fx=>fx.name)]).filter(Boolean).join(' · ') || (layer.id ? 'Capa base' : '')
      return {id:layer.id,name:sectorLabel(layer),visible:layer.visible,status,entries,hasTree,open,
        points:includePoints && layer.id ? layer.points.map(p=>[...p]) : undefined,
        summary,grouping:sectors.groupFor===layer.id}
    })
  }
  function refreshLayerOverview() {
    const base=refreshBaseCard()
    const root=$('layerOverview'), detail=$('sectorDetail')
    const rows=stackRows(), selection=studioStack.active()
    syncModelInspectors(selection)
    const geometry=sectors.regions.map(region=>region.points)
    if (geometry.length!==lastStackGeometry.length || geometry.some((points,i)=>points!==lastStackGeometry[i])) {
      studioStack.notify()
      lastStackGeometry=geometry
    }
    const query=$('stackSearch').value
    const key=JSON.stringify([rows,scopeId,selection,base,sectors.history?.past.length,sectors.history?.future.length])
    if (root.dataset.state===key && root.dataset.query===query) return
    if (!openingCode && codeBrowser && !$('editorPage').hidden && !mappingBench) {
      const signature=JSON.stringify(selection)
      if (codeSelection!==signature) {
        codeSelection=signature
        codeBrowser.open(selection,!codeBrowser.back.hidden && mappingMode)
      } else codeBrowser.refresh()
    }
    if (root.dataset.state!==key) studioStack.notify()
    root.dataset.state=key
    root.dataset.query=query
    const filter=filterStudioStack(rows,base,query)
    $('stackSearch').hidden=!query && !rows.some(row=>row.hasTree)
    $('baseCard').hidden=!!filter && !filter.showBase
    $('stackNoResults').hidden=!filter || filter.any
    const existing = new Map(Array.from(root.querySelectorAll(':scope > .layer-overview-row'), row => [row.dataset.sectorId,row]))
    const ordered = []
    const selectedId = scopeId ?? 0
    detail.dataset.selection = selectedId
    refreshStackActions(selection)
    for (const row of rows) {
      if (filter && !filter.has(row.id,0,'sector')) continue
      const line = existing.get(String(row.id)) || makeSectorRow(row.id)
      const [select,toggle,visibility,tree] = line.children
      const [name,status] = select.children
      const selected = row.id === selectedId
      name.textContent = row.name
      const open=!!filter || row.open
      status.textContent = open ? row.status : row.summary || row.status
      status.title=status.textContent
      select.setAttribute('aria-label',row.name)
      select.setAttribute('aria-pressed',selected)
      toggle.hidden = !!filter || !row.hasTree
      toggle.setAttribute('aria-expanded',String(open))
      toggle.setAttribute('aria-label',(open?'Plegar capas de ':'Ver capas de ')+row.name)
      if (!open && row.summary) toggle.setAttribute('aria-description',row.summary)
      else toggle.removeAttribute('aria-description')
      if (row.id) {
        const label=(row.visible?'Ocultar ':'Mostrar ')+row.name
        visibility.setAttribute('aria-label',label)
        visibility.title=label
        if (visibility.dataset.visible!==String(row.visible)) {
          visibility.dataset.visible=row.visible
          visibility.innerHTML=icon(row.visible?'eye':'eyeOff')
        }
      }
      tree.hidden = !row.hasTree || !open
      if (!tree.hidden) renderLayerTree(tree,row,selection,filter,query)
      ordered.push(line)
    }
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
    detail.hidden = !!filter && (selection.kind==='base' ? !filter.showBase :
      !filter.has(selection.sectorId,selection.layerId??0,selection.kind==='group'?'layer':selection.kind,selection.kind==='effect'?selection.index:null))
  }
  $('stackSearch').oninput=refreshLayerOverview
  $('stackSearch').onkeydown=event=>{
    if (event.key==='Escape' && event.currentTarget.value) {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.value=''
      refreshLayerOverview()
    }
  }
  function refreshBaseCard() {
    const base = getStudioBase()
    const mode = base.present ? (base.visible ? 'visible' : 'hidden') : 'empty'
    const card = $('baseCard')
    const status = base.pending ? (base.outputMode === 'visible' ? 'En salida · '+base.outputName :
      base.outputMode === 'hidden' ? 'En salida · fondo oculto' : 'En salida · sin fondo') :
      base.present ? (base.visible ? 'En salida' : 'Oculto') : ''
    if (card.dataset.mode !== mode) {
      card.dataset.mode = mode
      $('baseVisibility').hidden = !base.present
      $('baseVisibility').setAttribute('aria-pressed', String(base.visible))
      $('baseVisibility').setAttribute('aria-label',base.visible ? 'Ocultar fondo' : 'Mostrar fondo')
      $('baseVisibility').innerHTML = icon(base.visible ? 'eye' : 'eyeOff') + (base.visible ? 'Ocultar' : 'Mostrar')
      $('removeBase').hidden = !base.present
      $('baseLibrary').hidden = base.present
      $('baseParameters').hidden = !base.present
    }
    const name = base.present ? base.name : 'Sin fondo'
    if ($('baseTitle').textContent !== name) $('baseTitle').textContent = name
    if ($('baseStatus').textContent !== status) $('baseStatus').textContent = status
    if (card.dataset.pending !== String(base.pending)) card.dataset.pending = String(base.pending)
    return base
  }
  $('baseVisibility').onclick = toggleStudioBase
  $('baseParameters').onclick=()=>openEffectParameters({sectorId:0,layerId:0,kind:'base'})
  $('removeBase').onclick = () => {
    removeStudioBase()
    if ($('removeBase').hidden) $('baseLibrary').focus({preventScroll:true})
  }
  $('baseLibrary').onclick = () => {
    selectSectorLayer(0)
    changeView('library')
    showLibraryShelf('sketches')
    $('findScore').focus({preventScroll:true})
  }
  function refreshStackActions(ref) {
    const {sector,layer,effect}=studioStack.resolve(ref)
    $('stackParameters').hidden=!(ref.kind==='effect' && effect.code || ref.kind==='code' && layer.code)
    const capabilities=studioStack.capabilities(ref)
    const label=ref.kind==='effect' ? effect.name : ref.kind==='source' ? describeLayer(layer,null,sector).source :
      ref.kind==='code' ? 'Código Hydra' : ref.kind==='paint' ? 'Pinceladas' :
      ref.kind==='sector' ? sectorLabel(sector) : sectorLayerLabel(layer)
    const detail=$('sectorDetail')
    detail.dataset.stackKind=ref.kind
    const transform=$('sectorTransform')
    transform.hidden=!sector.id || ref.kind!=='sector'
    if (!transform.hidden && transform.firstElementChild?.dataset.sector!==String(sector.id))
      transform.replaceChildren(sectors.transformControls(document,sector.id,null,message=>sectors.note(message)))
    $('layerSelectionCaption').textContent=label
    const context=sectorLabel(sector)+(sector.id && ref.kind!=='sector' ? ' · '+sectorLayerLabel(layer) : '')
    $('layerSelectionCaption').title=context
    const nested=['effect','source','code','paint'].includes(ref.kind)
    const desk=$('layerDesk')
    if (desk.dataset.stackDetail!==String(nested)) {
      if (nested) browserScroll=desk.scrollTop
      desk.dataset.stackDetail=String(nested)
    }
    $('stackBack').hidden=!nested
    if (nested) {
      $('stackBack').textContent='← '+context
      $('stackBack').setAttribute('aria-label','Volver a '+context)
    }
    const signature=JSON.stringify(ref)
    if (detail.dataset.stackRef!==signature) {
      detail.dataset.stackRef=signature
      closeStackDestinations()
    }
    for (const [id,action] of [['stackMove','move'],['stackUp','up'],['stackDown','down'],['stackRemove','remove']]) {
      $(id).hidden=!capabilities.includes(action)
    }
    const rem=ref.kind==='group' ? 'Desagrupar' : ref.kind==='layer' && layer===sector ? 'Vaciar' : 'Quitar'
    $('stackRemove').textContent=rem
    $('stackRemove').setAttribute('aria-label',rem+' '+label)
    $('stackMedia').hidden=!!sector.id
    $('stackMedia').textContent=layer.source==='file' || layer.source==='s0' ? 'Cambiar archivo' : 'Archivo'
    $('stackSignalSettings').hidden=sector.id!==0 || ref.kind!=='source' || layer.source!=='s0'
    $('stackActions').hidden=!['move','up','down','remove'].some(action=>capabilities.includes(action))
    if (!$('stackDestinations').hidden) showStackDestinations()
    filterEffectControls()
  }
  function filterEffectControls() {
    const selection=studioStack.active()
    for (const row of $('sectorControls').children) {
      row.hidden=selection.kind==='effect' && row.dataset.effectIndex!==String(selection.index)
    }
  }
  new MutationObserver(filterEffectControls).observe($('sectorControls'),{childList:true})
  function closeStackDestinations() {
    $('stackDestinations').hidden=true
    $('stackMove').setAttribute('aria-expanded','false')
  }
  function runStack(action,ref,value) {
    return studioStack.command(action,ref,value).catch(error=>notify(error.message))
  }
  function showStackDestinations() {
    const root=$('stackDestinations'), from=studioStack.active()
    const options=studioStack.destinations(from), signature=JSON.stringify([from,options])
    if (!options.length) { closeStackDestinations(); return }
    if (root.dataset.state!==signature) {
      root.dataset.state=signature
      const buttons=options.map(({label,target})=>{
        const button=document.createElement('button')
        button.type='button'; button.textContent=label
        Object.assign(button.dataset,target)
        button.onclick=()=>{
          closeStackDestinations()
          runStack('move',from,target).then(result=>{
            if (!result) return
            notify('Movido a '+label+'.')
            focusStackSelection()
          })
        }
        return button
      })
      root.replaceChildren(...buttons)
    }
    $('stackMove').setAttribute('aria-expanded','true')
    root.hidden=false
  }
  function focusStackSelection() {
    if (!layout.wide.matches && $('layerDesk').dataset.stackDetail==='true') {
      $('stackBack').focus({preventScroll:true})
      return
    }
    keepStackItemVisible()?.focus({preventScroll:true})
  }
  function keepStackItemVisible() {
    const ref=studioStack.active(), row=$('sector-tree-'+ref.sectorId)
    const selected=row?.querySelector('[data-current-item=true]') || row?.parentElement.querySelector('.layer-select')
    if (!selected?.getClientRects().length) return
    const panel=$(layout.wide.matches ? 'stackBrowser' : 'layerDesk')
    const rect=selected.getBoundingClientRect(), bounds=panel.getBoundingClientRect()
    const top=bounds.top+(layout.wide.matches ? 0 : $('layerDesk').querySelector('.sector-header').offsetHeight)
    if (rect.top<top) panel.scrollTop+=rect.top-top
    else if (rect.bottom>bounds.bottom) panel.scrollTop+=rect.bottom-bounds.bottom
    return selected
  }
  $('stackMove').onclick=()=>{
    if (!$('stackDestinations').hidden) return closeStackDestinations()
    showStackDestinations()
    $('stackDestinations').firstElementChild?.focus({preventScroll:true})
  }
  $('stackBack').onclick=()=>{
    const {sectorId,layerId}=studioStack.active()
    selectSectorLayer(sectorId,sectorId ? layerId : undefined,'select')
    if (!layout.wide.matches) $('layerDesk').scrollTop=browserScroll
    focusStackSelection()
  }
  $('backToLayers').addEventListener('click',()=>{
    if (!layout.wide.matches && $('layerDesk').dataset.stackDetail==='true') $('stackBack').click()
  })
  $('stackDestinations').onkeydown=e=>{
    if (e.key==='Escape') { e.stopPropagation(); closeStackDestinations(); $('stackMove').focus() }
  }
  $('stackMedia').onclick=()=>{
    sectors.fileTarget=sectors.principal
    $('sectorFile').click()
  }
  $('stackSignalSettings').onclick=()=>openPanel('input')
  $('stackParameters').onclick=()=>openEffectParameters(studioStack.active())
  for (const [id,action] of [['stackUp','up'],['stackDown','down'],['stackRemove','remove'],['stackLoop','loop']]) {
    $(id).onclick=()=>runStack(action).then(()=>{
      if (action==='remove' || $(id).hidden) focusStackSelection()
    })
  }
  new EditorMenu($('stackContext'),(node,pointer,opening)=>{
    if (!mappingBench && node.closest('#libraryPage') && typeof libraryMenuContext==='function') {
      const catalog=libraryMenuContext(node,pointer,opening)
      if (catalog) return catalog
    }
    if (mappingBench || sectors.drag || !node.closest('#layerDesk,#stage,#stackContext') &&
        !(node===document.body && !opening)) return null
    const branch=node.closest('.layer-tree-effect,.layer-tree-head,.layer-tree-item,.layer-overview-row')
    const item=node.closest('[data-stack-item]') || branch?.querySelector('[data-stack-item]')
    if (item?.disabled || node.closest('.effect-pending')) return null
    const numberRow=node.closest('#sectorControls [data-effect-index]')
    const stage=node.closest('#stage')
    if (stage && document.fullscreenElement===stage) return null
    let ref=item ? JSON.parse(item.dataset.stackItem) : studioStack.active()
    if (node.closest('#baseCard')) ref={sectorId:0,layerId:0,kind:'base'}
    if (numberRow) {
      const index=Number(numberRow.dataset.effectIndex),fx=sectors.target().fx[index]
      if (!fx) return null
      ref={...ref,kind:'effect',index,effectId:studioStack.effectKey(fx)}
    }
    if (stage && pointer) {
      const canvas=$('visual'), bounds=canvas.getBoundingClientRect()
      const fit=Math.min(bounds.width/canvas.width,bounds.height/canvas.height)
      const w=canvas.width*fit, h=canvas.height*fit
      const x=(pointer.clientX-bounds.left-(bounds.width-w)/2)/w
      const y=(pointer.clientY-bounds.top-(bounds.height-h)/2)/h
      const hit=x>=0 && x<=1 && y>=0 && y<=1 && sectors.regions.findLast(region=>{
        if (!region.visible) return false
        traceRegion(sectors.ctx,region.points,canvas.width,canvas.height)
        return sectors.ctx.isPointInPath(x*canvas.width,y*canvas.height,'evenodd')
      })
      ref={sectorId:hit?.id ?? 0,layerId:0,kind:!hit && getStudioBase().present ? 'base' : 'sector'}
    }
    const {sector,layer,effect}=studioStack.resolve(ref)
    const muted=ref.kind==='effect'? effect.enabled===false : ref.kind==='sector' ? !sector.visible :
      ref.kind==='base' ? !getStudioBase().visible : !!layer.hidden
    const history={canUndo:!!sectors.history.past.length,canRedo:!!sectors.history.future.length}
    const spec=EditorMenu.stack(ref,studioStack.capabilities(ref),muted,history)
    if (!ref.sectorId && (ref.kind==='sector' || stage)) spec.menu.splice(1,0,'shape')
    const name=ref.kind==='base' ? 'Fondo' : ref.kind==='effect' ? effect.name : ref.kind==='sector' ? sectorLabel(sector) :
      ({source:'Fuente',paint:'Pinceladas',code:'Código Hydra'})[ref.kind] || sectorLayerLabel(layer)
    const anchor=()=>{
      if (item) return $('layerOverview').querySelector('[data-stack-item="'+CSS.escape(item.dataset.stackItem)+'"]')
      if (numberRow) return $('sectorControls').querySelector('[data-effect-index="'+sectors.target().fx.indexOf(effect)+'"] input')
      if (stage) {
        stage.tabIndex=-1
        return stage
      }
    }
    return {...spec,name,anchor,choose:()=>{
      studioStack.select(ref)
      sectors.refresh()
    },run:async(action,delta)=>{
      if (action==='nudge') {
        const box=$('visual').getBoundingClientRect()
        if (box.width && box.height) window.fosfenoStack.geometry.update(sector.id,sector.points,
          dragRegionPoints(sector.points,-1,delta[0]/box.width,delta[1]/box.height))
      } else if (action==='center') sectors.transformRegion(sector.id,'center')
      else if (['shape','deform','select'].includes(action)) {
        studioStack.select(ref)
        if (!layout.layersVisible) showLayers(true)
        if (!layout.wide.matches) changeView('sectors')
        sectors.cancelDrag(); sectors.mode=action==='deform'?{edit:true}:null
        sectors.refresh()
        if (action==='shape') sectors.panel('sectorShapes',true)
        else $('sectorGuide').focus({preventScroll:true})
      } else {
        const next=await studioStack.command(action,ref)
        if (['remove','duplicate','paste','up','down'].includes(action)) focusStackSelection()
        return next
      }
    }}
  },e=>notify(e.message))
  function dragStackItem(button,ref,label) {
    button.draggable=true
    button.ondragstart=event=>{
      layerDrag=ref
      event.dataTransfer.effectAllowed='move'
      event.dataTransfer.setData('text/plain',label)
    }
    button.ondragend=()=>{layerDrag=null}
  }
  function dropStackItem(element,targetAt) {
    element.ondragover=event=>{
      if (!layerDrag || !sectors.canMoveStackItem(layerDrag,targetAt(event))) return
      event.preventDefault()
      element.dataset.drop='true'
    }
    element.ondragleave=()=>{delete element.dataset.drop}
    element.ondrop=event=>{
      delete element.dataset.drop
      const target=targetAt(event)
      if (!layerDrag || !sectors.canMoveStackItem(layerDrag,target)) return
      event.preventDefault()
      runStack('move',layerDrag,target)
      layerDrag=null
    }
  }
  function makeSectorRow(id) {
    const line=document.createElement('div'), select=document.createElement('button')
    const name=document.createElement('strong'), status=document.createElement('span')
    line.className='layer-overview-row'
    line.dataset.sectorId=id
    select.className='layer-select'
    select.dataset.stackItem=JSON.stringify({sectorId:id,layerId:0,kind:'sector'})
    select.setAttribute('aria-controls','sectorDetail')
    select.setAttribute('aria-describedby','sector-summary-'+id)
    select.onclick=()=>selectSectorLayer(id,undefined,'select')
    dropStackItem(select,()=>({sectorId:id,layerId:0,root:true}))
    status.className='layer-count'
    status.id='sector-summary-'+id
    select.append(name,status)
    const toggle=document.createElement('button'), visibility=document.createElement('button'), tree=document.createElement('div')
    toggle.className='layer-tree-toggle'
    toggle.innerHTML=icon('chevron')
    tree.className='layer-tree'
    tree.id='sector-tree-'+id
    toggle.setAttribute('aria-controls',tree.id)
    toggle.onclick=()=>{
      layerTreeOpen.set(id,toggle.getAttribute('aria-expanded')!=='true')
      refreshLayerOverview()
    }
    visibility.hidden=!id
    visibility.className='layer-visibility'
    visibility.onclick=()=>{
      const layer=sectors.regions.find(region=>region.id===id)
      if (layer) { layer.visible=!layer.visible; sectors.changed() }
    }
    line.append(select,toggle,visibility,tree)
    return line
  }
  function renderLayerTree(tree,row,selection,filter,query) {
    const key = JSON.stringify([row.entries,row.grouping,selection.sectorId===row.id ? selection : null,query])
    if (tree.dataset.state===key) return
    tree.dataset.state=key
    const focus = tree.contains(document.activeElement) && document.activeElement.dataset.treeAction
    const button = (entry, kind, label, action, a11y) => {
      const b=document.createElement('button')
      b.type='button'
      b.className='layer-tree-'+kind
      b.textContent=label
      b.dataset.treeAction=entry.layerId+'-'+kind+'-'+(a11y || label)
      if (a11y) { b.setAttribute('aria-label',a11y); b.title=a11y }
      b.onclick=action
      return b
    }
    const getLayer = key => sectorLayers(sectors.regions.find(item=>item.id===row.id) || sectors.principal)
      .find(item=>sectorLayerId(item)===key)
    const render = entry => {
      const {layerId,name,group,hidden,source,code,paint,effects} = entry
      const show=(kind,index)=>!filter || filter.has(row.id,layerId,kind,index)
      const item = document.createElement('div'), head = document.createElement('div'), signals = document.createElement('div')
      item.className='layer-tree-item'
      item.dataset.selected=entry.selected
      item.dataset.layerId=layerId
      head.className='layer-tree-head'
      signals.className='layer-tree-signals'
      const choose=button(entry,'name',row.id ? name : 'Composición',()=>selectSectorLayer(row.id,layerId,'select'))
      choose.insertAdjacentHTML('afterbegin',icon(group ? 'layers' : 'screen'))
      choose.setAttribute('aria-pressed',String(entry.selected))
      const markCurrent=(button,kind,index)=>{
        button.dataset.stackItem=JSON.stringify({sectorId:row.id,layerId,kind,index,
          effectId:kind==='effect' ? effects[index].effectId : undefined})
        const current=selection.sectorId===row.id && selection.layerId===layerId && selection.kind===kind &&
          (kind!=='effect' || selection.index===index)
        button.dataset.currentItem=current
        if (current) button.setAttribute('aria-current','true')
      }
      markCurrent(choose,group?'group':'layer')
      if (row.id) {
        choose.title='Seleccionar o arrastrar '+name
        dragStackItem(choose,{sectorId:row.id,layerId,kind:group?'group':'layer'},name)
        dropStackItem(head,event=>{
          const rect=head.getBoundingClientRect()
          return {sectorId:row.id,layerId,above:event.clientY<rect.y+rect.height/2}
        })
      }
      if (row.id) head.append(choose)
      if (row.id && !group && !source && !code && !paint && !effects.length) {
        const empty=document.createElement('small')
        empty.className='layer-tree-state'; empty.textContent='Vacía'
        head.append(empty)
      }
      if (row.grouping && !entry.groupId && !group) {
        const mark=button(entry,'mark',entry.mark?'✓':'□',()=>sectors.toggleGroupMember(getLayer(layerId)),'Marcar '+name)
        mark.setAttribute('aria-pressed',String(entry.mark))
        head.append(mark)
      }
      if (row.id) {
        const visibility=button(entry,'eye','',()=>{
          const layer=getLayer(layerId)
          layer.hidden=!layer.hidden
          sectors.changed()
        },(hidden?'Mostrar capa ':'Ocultar capa ')+name)
        visibility.innerHTML=icon(hidden?'eyeOff':'eye')
        head.append(visibility)
      }
      if (source && show('source')) {
        const label=entry.sourcePending ? source+' · pendiente' : source
        const sourceButton=button(entry,'source',label,()=>selectSectorLayer(row.id,layerId,'source'))
        const sourceIcon={loop:'cycle',video:'play',image:'screen',model:'mapping',camera:'camera',s0:'camera',sketch:'layers'}
        sourceButton.insertAdjacentHTML('afterbegin',icon(sourceIcon[entry.sourceKind] || 'screen'))
        sourceButton.title=label
        markCurrent(sourceButton,'source')
        dragStackItem(sourceButton,{sectorId:row.id,layerId,kind:'source'},label)
        signals.append(sourceButton)
      }
      for (const [on,title,kind] of [[code,'Código Hydra','code'],[paint,'Pinceladas','paint']]) if (on && show(kind)) {
        const detail=button(entry,'source',title,()=>selectSectorLayer(row.id,layerId,kind))
        detail.insertAdjacentHTML('afterbegin',icon(kind==='code' ? 'code' : 'sliders'))
        markCurrent(detail,kind)
        dragStackItem(detail,{sectorId:row.id,layerId,kind},title)
        signals.append(detail)
      }
      for (const [i,effect] of effects.entries()) {
        if (!show('effect',i)) continue
        const line=document.createElement('div')
        line.className='layer-tree-effect'
        line.dataset.playing=effect.playing
        const label=button(entry,'effect-name',effect.name,()=>selectSectorLayer(row.id,layerId,'effect',i),
          'Editar '+effect.name+' en '+name+' · '+effect.state)
        label.insertAdjacentHTML('afterbegin',icon(effect.kind==='library' ? 'grid' : 'sliders'))
        label.dataset.treeAction=layerId+'-effect-'+i
        markCurrent(label,'effect',i)
        const ref={sectorId:row.id,layerId,kind:'effect',index:i,effectId:effect.effectId}
        if (effect.enabled===undefined) label.disabled=true
        else {
          dragStackItem(label,ref,effect.name)
          dropStackItem(line,()=>({sectorId:row.id,layerId,index:i}))
        }
        line.append(label)
        if (effect.state!=='En salida') {
          const state=document.createElement('span')
          state.className='layer-tree-state'
          state.textContent=effect.state==='Cambio pendiente' || effect.state==='En salida hasta aplicar' ? 'Pend.' : effect.state
          state.title=effect.state
          line.append(state)
        }
        if (effect.enabled!==undefined) {
          const power=button(entry,'power','',()=>runStack('toggle',ref),
            (effect.enabled?'Pausar ':'Activar ')+effect.name+' en '+name+' · '+effect.state)
          power.innerHTML=icon(effect.enabled ? 'eye' : 'eyeOff')
          power.dataset.treeAction=layerId+'-power-'+i
          power.setAttribute('aria-pressed',String(effect.enabled))
          line.append(power)
        }
        signals.append(line)
      }
      if (head.childElementCount) item.append(head)
      if (signals.children.length) item.append(signals)
      if (group) {
        const children = document.createElement('div')
        children.className='layer-tree-children'
        children.append(...visibleEntries.filter(child=>child.groupId===layerId).map(render))
        item.append(children)
      }
      return item
    }
    const visibleEntries=row.entries.slice().reverse().filter(entry=>!filter || filter.has(row.id,entry.layerId,'layer'))
    tree.replaceChildren(...visibleEntries.filter(entry=>!entry.groupId).map(render))
    if (focus) Array.from(tree.querySelectorAll('[data-tree-action]')).find(button=>button.dataset.treeAction===focus)?.focus({preventScroll:true})
  }
  function changeView(next, openTools = true, preserveCode = false) {
    if (next!=='code') codeBrowser?.flush()
    if (mappingBench && openTools && next!=='sectors') mappingView(false)
    if (next==='code') {
      if (!preserveCode && codeBrowser) {
        codeBrowser.open({sectorId:0,layerId:0,kind:'base'})
        codeSelection=JSON.stringify(studioStack.active())
      }
      showDraft(false)
    }
    if (view==='library' && next!=='library') loops.stopPreview()
    view=next
    if (next!=='sectors' && layout.wide.matches) layout.setInspectorVisible(true)
    layout.showPanes(next)
    if (!layout.wide.matches && next!=='sectors') sectors.panel(null)
    sectors.show(layout.wide.matches ? layout.layersVisible : next==='sectors')
    if (next==='sectors') setLayerScope(sectors.selected())
    $('mappingSectors').setAttribute('aria-pressed',String(mappingMode && !mappingBench && next==='sectors'))
    layout.activeTool = mappingMode && next==='sectors' ? $('mappingSectors') :
      next==='signal' && signalTab==='out' ? $('chooseOutput') : next==='signal' && signalTab==='audio' ? $('signalOpen') :
      document.querySelector('#studioNav [data-view="'+layout.activeView(next)+'"]')
    layout.open(openTools)
    if (layout.activeView(next)==='code') requestAnimationFrame(()=>(codeBrowser?.scoped ? codeBrowser.cm : cm).refresh())
    if (next==='library') library()
  }
  layout.wide.addEventListener('change',()=>changeView(view,layout.opened,true))
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
    if (mappingBench) mappingView(false)
    signalTab = tab
    outputPicker(false)
    $('signalTitle').textContent = {input:'Imagen',audio:'Audio',out:'Ajustes de salida'}[tab]
    changeView('signal')
    all('[data-pane]').forEach((el) => (el.hidden = el.dataset.pane !== tab))
    if (tab === 'input') listCameras()
  }
  function fromToolbar(next, tab) {
    visualInspector.close()
    if (next==='code') return openSelectionCode()
    if (mappingBench) mappingView(false)
    if (layout.wide.matches && next==='sectors') {
      showLayers(true)
      const selected=keepStackItemVisible() || $('newSector')
      selected.focus({preventScroll:true})
      return
    }
    if (layout.wide.matches) layout.setInspectorVisible(true)
    if (layout.activeView(view)===next && (!tab || signalTab===tab)) layout.open(true)
    else if (tab) openPanel(tab)
    else changeView(next)
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
  function linkLibraryInstance(instance) {
    if (!instance) return
    if (instance.personal && instance.id!=null) return libraryItemId(instance)
    if (instance.libraryId) return instance.libraryId
    if (!hasSketch(instance.code)) return
    const exact=[...SKETCHES,...saved,...HYDRA_GALLERY,...community].filter(item=>item.code===instance.code)
    const match=exact.find(item=>item.id===instance.id) || exact.find(item=>item.name===instance.name) || exact[0]
    if (match) return libraryItemId(match)
    const recipe=seedRecipe(instance)
    if (recipe) return libraryItemId({generator:recipe})
  }
  function linkedScore(item) {
    const libraryId=linkLibraryInstance(item)
    const generator=seedRecipe(item) || undefined
    return {...item,libraryId,generator}
  }
  function baseMatchesLibrary(item,code=cm.getValue()) {
    return baseMode!=='empty' && matchesLibraryItem(item,{libraryId:current.libraryId,code})
  }
  function draft() {
    const code=cm.getValue()
    return {
      id: current.id,
      personal:current.personal,
      libraryId:current.libraryId,
      name: $('scoreName').value.trim() || 'Sin título',
      code,
      generator:seedRecipe({code,generator:current.generator}) || undefined,
      baseMode,
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
    entry.libraryId=libraryItemId(entry)
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
    if (!reference && history.state?.fosfenoBase === 'empty' && !(sameEntry && hasSketch(recovered?.code))) {
      prepareEmptyBase()
    } else if (history.state?.fosfenoBase==='hidden' && hasSketch(history.state.fosfenoHiddenScore?.code) && !sameEntry) {
      load(history.state.fosfenoHiddenScore,false,false)
      armed=true
    } else if (hasSketch(recovered?.code) && (!reference || sameEntry)) {
      load(recovered, false, false)
      modified = true
      armed = recovered.autoEdit === true
      status(armed && live ? 'Borrador recuperado. Tu próxima edición actualizará la imagen.' : 'Borrador recuperado. Ejecutá para llevarlo a la salida.')
    } else if (reference && !play) {
      load(reference, false, false)
    } else {
      current = linkedScore(reference || fallback)
      setText(current.code)
      $('scoreName').value = current.name
      if (current.generator) $('seed').value=current.generator.seed
      status('Preparando salida…')
    }
    changeView('sectors', false)
  }
  function load(item, play = true, manual = true, {openCode = true, armOnLive = play} = {}) {
    if (!item) return
    if (modified && archive() === false) return
    current = linkedScore(item)
    baseMode = hasSketch(item.code) ? (item.baseMode === 'hidden' ? 'hidden' : 'visible') : 'empty'
    if (current.generator) {
      fold = current.generator.fold
      $('seed').value = current.generator.seed
      selectButtons('[data-fold]','fold',fold)
    }
    revision++
    clearTimeout(timer)
    modified = false
    armed = armOnLive
    pendingFresh = !play
    if (manual) {
      toggleAuto(false)
      if (openCode) changeView('code')
    }
    setText(item.code)
    $('scoreName').value = item.name
    refreshLibraryIndicators()
    if (manual) store('draft', null)
    if (play) execute(cm.getValue(), { fresh: true })
    else status('Preparado. Ejecutá para llevar este código a la salida.')
    if (engine) refreshMix()
    return true
  }
  function execute(code, { fresh = false, whole = true, remember = false } = {}) {
    const requested = revision
    clearTimeout(timer)
    if (engine && whole && !hasSketch(code)) {
      baseMode='empty'
      return applyEmptyBase()
    }
    if (!engine || !hasSketch(code)) {
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
          if (baseMode === 'empty') baseMode = 'visible'
          setOutputBase(baseMode, $('scoreName').value.trim() || 'Sin título')
          pendingFresh = false
          markBaseEntry()
          status(whole ? 'Sketch ejecutado' : 'Bloque ejecutado')
          if (remember && location.protocol !== 'file:') {
            try {
              const url = new URL(location.href)
              url.searchParams.delete('sketch_id')
              url.searchParams.set('code', btoa(encodeURIComponent(code)))
              history.pushState({
                fosfenoRun: historySession, fosfenoEntry: historySession + '/' + ++historySequence,
                fosfenoLibrary:current.libraryId ? {libraryId:current.libraryId,name:$('scoreName').value,
                  id:current.id,personal:current.personal} : undefined
              }, '', url)
              if (baseMode==='hidden') markBaseEntry()
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
    revision++
    if (!hasSketch(cm.getValue())) baseMode='empty'
    else if (baseMode==='empty') baseMode='visible'
    modified = true
    toggleAuto(false)
    clearTimeout(timer)
    status(live ? (armed ? 'Actualizando la salida…' : 'Ejecutá para activar este sketch.') : 'Cambios preparados.')
    refreshApply()
    refreshLayerOverview()
    timer = setTimeout(() => {
      flush()
      if (live && armed) execute(cm.getValue())
    }, 220)
  })
  $('scoreName').oninput = () => {
    modified = true
    if (!codePending() && outputBaseMode !== 'empty') outputBaseName = $('scoreName').value.trim() || 'Sin título'
    flush()
    refreshLayerOverview()
  }
  $('run').onclick = runAll
  $('applySectors').onclick = async () => {
    codeBrowser.flush()
    if (applying || live || !(codePending() || sectors.dirty)) return
    const restoreFocus = document.activeElement===$('applySectors')
    applying=true
    refreshApply()
    try {
      if (codePending() && !await applyStudioEdits()) return
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
    visualInspector.finishGesture()
    live = !live
    if (live) sectors.apply()
    updateLiveEdit()
    visualInspector.syncMode()
    if (view==='library') {
      library()
      if (!$('catalog').hidden) filterCommunity()
    }
    store('live-edit', live)
    clearTimeout(timer)
    flush()
    if (live && armed && codePending()) applyStudioEdits()
    else if (live && armed) status(baseMode==='empty' ? 'Sin fondo.' : 'Edición en vivo.')
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
    if (codeBrowser.scoped) return codeBrowser.download()
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
    const title = document.createElement('button'), open = document.createElement('button'),
      label = document.createElement('strong'), group = document.createElement('small')
    title.className = 'library-title'
    title.type='button'
    title.dataset.action='editVisual'
    title.setAttribute('aria-label','Editar parámetros de '+item.name)
    title.setAttribute('aria-haspopup','dialog')
    const region = layerTarget()
    open.className = 'library-item'
    const intent = region ? 'Usar en capa' : play && live ? 'Usar de fondo' : 'Preparar fondo'
    label.textContent = item.name
    group.textContent = item.group || 'Mi biblioteca'
    const edit=document.createElement('span')
    edit.className='library-edit-label'
    edit.innerHTML=icon('sliders')
    const editText=document.createTextNode('Editar')
    edit.append(editText)
    title.append(label,group,edit)
    title.onclick=()=>openLibraryParameters(item,play,region)
    open.onclick = () => {
      if (!region && open.classList.contains('assigned-base')) return removeStudioBase()
      if (!region) return load(item,play && live,true,{openCode:!play,armOnLive:play})
      sectors.toggleLibrary(region,item,true)
    }
    const mix = document.createElement('button')
    mix.className = 'line-button'
    mix.textContent = 'Mezclar'
    mix.setAttribute('aria-label', 'Mezclar ' + item.name)
    const target = region || sectors.principal
    const refresh = baseCode => {
      const isBase = !region && baseMatchesLibrary(item,baseCode)
      open.classList.toggle('assigned-base', !!isBase)
      open.textContent = isBase ? 'Quitar fondo' : region ? 'En capa' : play && live ? 'De fondo' : 'Preparar'
      open.title = (isBase ? 'Quitar fondo' : intent) + ' · ' + item.name
      open.setAttribute('aria-label',open.title)
      const effect=findLibraryEffect(target,item)
      const on=effect && effect.enabled!==false
      const adjusted=isBase && baseCode!==item.code || isLibraryVariation(item,effect)
      const caption=adjusted?'Editar variante':'Editar'
      if (editText.data!==caption) editText.data=caption
      mix.setAttribute('aria-pressed',String(!!on))
      mix.textContent = on ? 'En mezcla' : 'Mezclar'
      strength.hidden=!on
      if (on) {
        slider.value=Math.round(effect.value*100)
        level.value=slider.value+'%'
        paintRange(slider)
      }
    }
    const strength=document.createElement('label'), slider=document.createElement('input'), level=document.createElement('output')
    strength.className='library-strength'
    slider.type='range'; slider.min=0; slider.max=100
    slider.setAttribute('aria-label','Mezcla de '+item.name)
    slider.oninput=()=>{
      const index=target.fx.indexOf(findLibraryEffect(target,item))
      if (index<0) return
      sectors.effectAmount(target,index,Number(slider.value)/100)
    }
    strength.append(slider,level)
    mix.onclick = () => sectors.toggleLibrary(target,item,false)
    libraryRows.set(row,refresh)
    refresh(baseMode==='empty' ? '' : cm.getValue())
    row.append(title, open, mix, strength)
    return row
  }
  function libraryMenuContext(node) {
    const row=node.closest('.library-row')
    if (!row) return null
    const title=row.querySelector('[data-action="editVisual"]'), open=row.querySelector('.library-item'), mix=row.querySelector('.line-button')
    if (!title || !open || !mix) return null
    return {name:title.querySelector('strong').textContent,menu:['inspect','use','mix'],keys:[],
      labels:{inspect:'Editar parámetros',use:open.textContent,mix:mix.getAttribute('aria-pressed')==='true'?'Pausar mezcla':'Mezclar'},
      run:action=>({inspect:title,use:open,mix})[action]?.click()}
  }
  function saveVisualCopy(code,name) {
    const id='local-'+(crypto.randomUUID?.() || Date.now().toString(36))
    const entry={id,name,code,personal:true}
    const next=[entry,...saved]
    if (!store('scores',next)) throw new Error('No se pudo guardar la variante en este navegador.')
    saved=next
    if (view==='library') library()
    return 'Variante guardada en Biblioteca → Mis sketches.'
  }
  const visualInspector=new VisualParameterInspector(()=>engine?.hydra.generator.glslTransforms || {},()=>live,resize)
  function targetCaption(region,layer) {
    return region?.id ? sectorLabel(region)+' · '+sectorLayerLabel(layer) : 'Toda la visual'
  }
  function openEffectParameters(ref) {
    const {sector,layer,effect}=studioStack.resolve(ref)
    const base=ref.kind==='base', layerCode=ref.kind==='code'
    const original=base?cm.getValue():layerCode?layer.code:effect?.code
    if (!original) return
    let priorBase=current, expected=original, gesture=false
    const name=base?($('scoreName').value || 'Fondo'):layerCode?sectorLayerLabel(layer):effect.name
    const kind=effect?.kind || 'library'
    const save=kind==='operator' ? async(code,title)=>{
      await creations.add(title,packComposition({kind,name:title,code,definitions:effect.definitions || [],
        origin:effect.origin || [],regions:[]}),'operator')
      return 'Operador guardado en Biblioteca → Proyectos.'
    } : layerCode ? null : saveVisualCopy
    if (mappingBench) mappingDesk()?.viewParameters()
    visualInspector.open({name,kind,definitions:effect?.definitions,code:original,save,realtime:true,
      destination:base?'Fondo':targetCaption(sector,layer)+(layerCode?' · Código de capa':' · Efecto'),
      finish() {
        if (gesture) {
          sectors.history?.remember()
          studioStack.notify()
        }
        gesture=false
      },
      apply(code, realtime=false) {
        if (base ? current!==priorBase || cm.getValue()!==expected :
            !sectors.containsLayer(layer) || (layerCode?layer.code!==expected:!layer.fx.includes(effect) || effect.code!==expected))
          throw new Error('El contenido cambió durante la edición. Volvé a abrir sus parámetros.')
        if (code===expected) return
        if (base) {
          current={...current,libraryId:linkLibraryInstance(current),generator:undefined}
          priorBase=current
          cm.replaceRange(code,{line:0,ch:0},cm.posFromIndex(expected.length),'visual-parameters')
          if (realtime) { flush(); execute(code) }
          refreshLibraryIndicators()
        } else {
          if (layerCode) layer.code=code
          else writeEffectCode(effect,code)
          if (realtime) {
            gesture=true
            sectors.dirty=true
            sectors.apply()
          } else sectors.changed()
        }
        expected=code
      }})
  }
  function openLibraryParameters(item,play,region) {
    const sector=sectorTarget(), layer=region || sectors.principal
    const ref={sectorId:sector?.id || 0,layerId:sectorLayerId(layer)}
    const selected=studioStack.active()
    const preferred=selected.kind==='effect' && selected.sectorId===ref.sectorId && selected.layerId===ref.layerId
      ? studioStack.resolve(selected).effect : null
    const effect=findLibraryEffect(layer,item,preferred)
    if (!region && baseMatchesLibrary(item) && !(preferred && preferred===effect))
      return openEffectParameters({...ref,kind:'base'})
    if (effect) return openEffectParameters({...ref,kind:'effect',effectId:studioStack.effectKey(effect)})
    function variant(code) {
      if (!sectors.containsLayer(layer)) throw new Error('El destino ya no está en la composición.')
      return {...item,code,libraryId:libraryItemId(item),generator:code===item.code?item.generator:undefined}
    }
    visualInspector.open({name:item.name,code:item.code,kind:'library',destination:targetCaption(sector,layer),
      action:region?'Usar en capa':live && play?'Usar de fondo':'Preparar fondo',save:saveVisualCopy,
      apply(code) {
        const edited=variant(code)
        if (region) sectors.toggleLibrary(region,edited,true)
        else if (!load(edited,play && live,true,{openCode:!play,armOnLive:play}))
          throw new Error('No se pudo preparar el fondo.')
      },
      mix:code=>sectors.toggleLibrary(layer,variant(code),false)})
  }
  function showLibraryShelf(name) {
    if (name!=='loops') loops.stopPreview()
    selectButtons('[data-shelf]','shelf',name)
    for (const pane of all('[data-collection]',$('libraryPage'))) pane.hidden = pane.dataset.collection!==name
    $('libraryPage').scrollTop = 0
    if (name==='loops') loops.refresh()
    if (name==='projects') creations.list().catch(e=>notify(e.message))
    if (name==='seed') restoreSeedControls()
  }
  all('[data-shelf]').forEach(button=>button.onclick=()=>showLibraryShelf(button.dataset.shelf))
  const searchText = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase()
  function matchesSearch(item) {
    return searchText([item.name,item.group,item.id].join(' ')).includes(searchText($('findScore').value.trim()))
  }
  function library() {
    $('blank').textContent = layerTarget() ? 'Editar código de capa' : 'Nuevo borrador'
    refreshSeedMix()
    function list(el, items) {
      el.replaceChildren(...items.filter(matchesSearch).map(item => libraryRow(item, true)))
      if (!items.length && !$('findScore').value) {
        const p = document.createElement('p')
        p.className = 'hint'
        p.textContent = 'Todavía no guardaste sketches.'
        el.append(p)
      }
    }
    list($('mine'), saved)
    list($('sketchList'), SKETCHES)
    $('shelfNoResults').hidden = !!(SKETCHES.some(matchesSearch) || saved.some(matchesSearch))
  }
  let community = [], catalogLimit = 40
  function filterCommunity() {
    const matches = community.filter(matchesSearch)
    const root = $('communityList')
    root.replaceChildren()
    for (const item of matches.slice(0,catalogLimit)) {
      root.append(libraryRow(item, HYDRA_GALLERY.some(s => s.id === item.id && s.code === item.code)))
    }
    if (!matches.length) root.textContent = 'Sin coincidencias.'
    $('moreScores').hidden = matches.length <= catalogLimit
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
  $('findScore').oninput = () => {
    catalogLimit=40
    library()
    if (!$('catalog').hidden) filterCommunity()
  }
  $('moreScores').onclick = () => { catalogLimit+=40; filterCommunity() }
  all('[data-fold]').forEach(
    (b) =>
      (b.onclick = () => {
        fold = b.dataset.fold
        selectButtons('[data-fold]', 'fold', fold)
        refreshSeedMix()
      })
  )
  selectButtons('[data-fold]', 'fold', 'libre')
  function seedSketch(seed,symmetry = 'libre') {
    seed=canonicalSeed(seed)
    return {id:'seed-'+seed,name:'Semilla '+seed,code:growSketch(seed,symmetry),generator:{seed,fold:symmetry}}
  }
  function randomSeed(previous) {
    const roll=crypto.getRandomValues(new Uint32Array(1))[0]
    return String(roll)===canonicalSeed(previous) ? (roll+1)>>>0 : roll
  }
  function selectedSeedEffect(layer) {
    const ref = studioStack.active()
    const chosen = ref.kind==='effect' && sectors.target()===layer && layer.fx[ref.index]
    return chosen && seedRecipe(chosen) ? chosen : null
  }
  function seedEffect(layer) {
    return selectedSeedEffect(layer) || layer.fx.findLast(effect=>effect.kind==='library' && seedRecipe(effect))
  }
  function restoreSeedControls() {
    const target = layerTarget()
    const currentBase = baseMode!=='empty' && current.code===cm.getValue() ? current : null
    const item = target ? seedEffect(target) : selectedSeedEffect(sectors.principal) ||
      (baseMode!=='visible' && seedEffect(sectors.principal)) || currentBase
    const recipe = seedRecipe(item)
    $('seed').value = recipe?.seed ?? ''
    fold = recipe?.fold ?? 'libre'
    selectButtons('[data-fold]','fold',fold)
    refreshSeedMix()
  }
  function openSeedEditor() {
    if (mappingMode && mappingBench) mappingView(false)
    if (document.body.classList.contains('preview-focus')) layout.focus(false)
    changeView('library')
    showLibraryShelf('seed')
    $('seed').focus({preventScroll:true})
  }
  function syncMapSeed() {
    if (!pendingMapSeed) return
    const {item,layer,effect} = pendingMapSeed
    const active = layer ? sectors.containsLayer(layer) && layer.fx.includes(effect) && effect.code===item.code && effect.enabled!==false :
      baseMode==='visible' && cm.getValue()===item.code
    const inOutput = layer ? sectors.appliedLayer(layer)?.fx.some(f=>f[effectOrigin]===effect && f.code===item.code && f.enabled!==false) :
      outputBaseMode==='visible' && appliedText===item.code
    const desk = mappingDesk()
    if (active && mappingMode && (!inOutput || !desk)) return
    pendingMapSeed=null
    desk?.pendingSeed(false)
    if (active && mappingMode && inOutput) {
      const region = layer && sectors.regions.find(r=>sectorLayers(r).includes(layer))
      const group = layer?.groupId && region?.layers?.find(l=>l.layerId===layer.groupId)
      const hidden = region?.visible===false || layer?.hidden || group?.hidden
      const transparent = layer?.opacity===0 || group?.opacity===0 || effect?.value===0
      desk?.showSeed(region?.id ?? 0,item.name,hidden ? 'Selección oculta' : transparent ? 'Opacidad en cero' : '')
    }
  }
  function selectSeedScope(ref) {
    studioStack.select(ref || {sectorId:0,layerId:0,kind:'sector'})
    sectors.refresh()
    setLayerScope(sectors.selected())
  }
  window.fosfenoSeeds = {
    generate(ref) { selectSeedScope(ref); return generate(false) },
    edit(ref) { selectSeedScope(ref); openSeedEditor() },
    send: () => $('applySectors').onclick()
  }
  function startupSketch() {
    let seed=randomSeed()
    try {
      if (sessionStorage.getItem('fosfeno:last-seed')===String(seed)) seed=(seed+1)>>>0
      sessionStorage.setItem('fosfeno:last-seed',String(seed))
    } catch {}
    return seedSketch(seed)
  }
  function refreshSeedMix() {
    const seed = canonicalSeed($('seed').value)
    if (seed!==null || !$('seed').value.trim()) $('seed').removeAttribute('aria-invalid')
    const chosen = selectedSeedEffect(sectors.principal)
    const baseRecipe=!chosen && !layerTarget() && baseMode!=='empty' && current.code===cm.getValue() && seedRecipe(current)
    const isBase = baseRecipe && baseRecipe.seed===seed && baseRecipe.fold===fold
    $('grow').textContent = isBase ? 'Quitar fondo' : chosen ? 'Actualizar efecto' :
      layerTarget() ? 'Usar en capa' : live ? 'Usar de fondo' : 'Preparar fondo'
    $('grow').dataset.assigned = String(!!isBase)
    const layer=layerTarget() || sectors.principal
    const effect=seed!==null && layer.fx.some(fx=>fx.kind==='library') && findLibraryEffect(layer,seedSketch(seed,fold))
    const mixed=!!effect && effect.enabled!==false
    $('mixSeed').textContent = mixed ? 'En mezcla' : 'Mezclar'
    $('mixSeed').setAttribute('aria-pressed',String(mixed))
  }
  function generate(fromField, manual = true, mix = false) {
    const raw = fromField ? $('seed').value.trim() : ''
    const seed = raw ? canonicalSeed(raw) : String(randomSeed($('seed').value))
    if (seed===null) {
      $('seed').setAttribute('aria-invalid','true')
      notify('Escribí un número como -123,456 o 98765432109876543210.')
      return
    }
    const scoped = manual && (layerTarget() || (selectedSeedEffect(sectors.principal) && sectors.principal))
    const target = scoped || (manual && (mix || !fromField && baseMode!=='visible') ? sectors.principal : null)
    const item = seedSketch(seed,fold)
    let effect
    if (target) {
      toggleAuto(false)
      $('seed').value = seed
      if (mix) {
        sectors.toggleLibrary(target,item,false)
        effect=findLibraryEffect(target,item)
      } else {
        effect=seedEffect(target)
        if (effect) Object.assign(effect,{name:item.name,code:item.code,generator:item.generator,libraryId:libraryItemId(item),enabled:true})
        else {
          effect={kind:'library',name:item.name,code:item.code,value:1,generator:item.generator,libraryId:libraryItemId(item)}
          target.fx.push(effect)
        }
        sectors.changed()
      }
      refreshSeedMix()
    } else if (!load(item,!manual || live,manual,{openCode:false,armOnLive:true})) return
    if (manual && mappingMode && (!effect || effect.enabled!==false)) {
      pendingMapSeed={item,layer:target,effect}
      mappingDesk()?.pendingSeed(!live)
      syncMapSeed()
    }
    return item
  }
  $('grow').onclick = () => $('grow').dataset.assigned === 'true' ? removeStudioBase() : generate(true)
  $('mixSeed').onclick = () => generate(true,true,true)
  $('seed').oninput = ()=>{ $('seed').removeAttribute('aria-invalid'); refreshSeedMix() }
  $('randomizeSeed').onclick = () => {
    const field=$('seed')
    field.value=randomSeed(field.value.trim())
    refreshSeedMix()
    $('seedRollStatus').textContent='Semilla '+field.value
  }
  $('explore').onclick = () => generate(false)
  $('editSeed').onclick = openSeedEditor
  $('blank').onclick = () => {
    if (layerTarget()) {
      changeView('sectors')
      sectors.panel('layerCode',true)
      $('sectorCode').focus()
      return
    }
    removeStudioBase()
    changeView('code')
    cm.focus()
  }
  $('importCode').onclick = () => $('jsFile').click()
  $('jsFile').onchange = async (e) => {
    const file = e.target.files[0]
    try {
      if (!file) return
      const version = sectors.documentVersion, target = layerTarget()
      const content = await file.text()
      if (version !== sectors.documentVersion || target !== layerTarget()) return
      if (target) {
        changeView('sectors')
        sectors.panel('layerCode',true)
        $('sectorCode').value=content
        $('sectorCode').focus()
      } else
        load(
          { id: 'importado', name: file.name.replace(/\.(js|txt)$/i, ''), code: content },
          false
        )
    } catch (err) {
      notify(err.message)
    }
    e.target.value = ''
  }
  let appliedText = null, syncEdits = false
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
  async function routeInput(layer) {
    const input = inputs[0].current
    if (!input || !sectors.containsLayer(layer)) return false
    if (input.file) {
      if (layer.source!=='file' || layer.file?.current !== input) {
        if (!await sectors.setFile(layer,input.file,input.role,input)) return false
      }
    } else {
      if (layer.source==='group') {
        const region = sectors.regions.find(region=>sectorLayers(region).includes(layer))
        layer = sectors.addLayer(region,layer)
      }
      if (!sectors.setSource(layer,'s0')) return false
    }
    $('routeStatus').textContent = live ? 'Entrada en la composición.' : 'Entrada preparada. Aplicá para proyectarla.'
    return true
  }
  $('insertSource').onclick = () => routeInput(sectors.principal).catch(err=>visualStatus(err.message))
  $('sourceOnly').onclick = async () => {
    try {
      if (await routeInput(sectors.principal) && baseMode==='visible') toggleStudioBase()
    } catch (err) { visualStatus(err.message) }
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
    if (e.defaultPrevented || e.isComposing || document.querySelector('dialog[open]') ||
        (EditorMenu.editing(e.target) && !e.target.closest('.CodeMirror'))) return
    if (codeBrowser.scoped && !$('editorPage').hidden && e.key==='Enter' && (e.ctrlKey || e.metaKey || e.altKey)) {
      e.preventDefault()
      codeBrowser.flush()
      return
    }
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

  function applyCompositionSettings(settings) {
    for (const [id,value] of [['brushSize',settings.brush*100],['sensitivity',settings.sensitivity*100],
      ['brushSpeed',(settings.brushSpeed ?? 1)*100],['brushDetail',(settings.brushDetail ?? .65)*100]]) {
      $(id).value = value
      $(id).oninput()
    }
    state.bpm = window.bpm = settings.bpm
    const tempo = $('bpm')
    tempo.min = Math.min(1,settings.bpm)
    tempo.max = Math.max(220,settings.bpm)
    tempo.value = settings.bpm
    document.querySelector('output[for="bpm"]').textContent = settings.bpm+' BPM'
    meterStyle(tempo)
    state.painting = settings.painting
    brush.reset()
    updateBrush()
    state.brushInverse = settings.brushInverse===true
    $('brushInverse').setAttribute('aria-pressed',state.brushInverse)
    selectButtons('[data-brush]','brush',settings.painting ? 'on' : 'off')
    state.internalPulse = settings.internalPulse
    $('internalPulse').setAttribute('aria-pressed',settings.internalPulse)
    $('autoMixInput').setAttribute('aria-pressed',settings.autoMix)
    state.quality = settings.quality
    state.sketchResolution=settings.resolution || null
    selectButtons('[data-q]','q',state.sketchResolution ? '' : state.quality)
    fold = settings.fold
    $('seed').value = settings.seed
    selectButtons('[data-fold]','fold',fold)
    engine?.show(settings.output)
    selectButtons('[data-output]','output',settings.output)
    refreshSound()
  }

  function captureComposition() {
    const {painting,brush,brushSpeed,brushDetail,brushInverse,internalPulse,sensitivity,quality} = state
    const {name,code,libraryId,generator}=draft()
    return {name,code,libraryId,generator,regions:sectors.snapshot(),selectedSector:sectors.id,
      input:inputs[0].current?.file, inputRole:inputs[0].current?.role, inputKind:inputs[0].current?.kind || null,
      music:sound.music.capture(),
      inputModelView:inputs[0].current?.modelView,
      settings:{baseMode,painting,brush,brushSpeed,brushDetail,brushInverse,internalPulse,sensitivity,quality,resolution:state.sketchResolution || null,bpm:window.bpm,output:engine.output,
        autoMix:$('autoMixInput').getAttribute('aria-pressed') === 'true',fold,seed:$('seed').value}}
  }
  function migrateInputRoute(project) {
    if (!project.settings.mixStandaloneInput || (!project.input && !project.inputKind)) return project
    let code = project.code
    const prior = project.regions.find(region=>region.id===0)
    if (prior && prior.source!=='sketch') return project
    const info = inspectScore(code,engine.hydra.generator.glslTransforms)
    const references = info.identifiers.filter(node=>node.name==='s0')
    if (references.length) {
      // Old projects recorded the panel switch, but not whether a user wrote the code.
      // Only split the exact, terminal blend emitted by the old panel on a single output.
      const output = info.outputs[0], fragment = '.blend(src(s0), 0.65)'
      const oldBlend = references.length===1 && info.outputs.length===1 && output.standalone &&
        output.name==='o'+project.settings.output && code.slice(0,output.start).endsWith(fragment) &&
        !info.calls.some(call=>call.callee.name==='prev' || call.callee.name==='src' && /^o[0-3]$/.test(call.arguments[0]?.name))
      if (oldBlend) code = code.slice(0,output.start-fragment.length)+code.slice(output.start)
      else if (project.settings.baseMode!=='hidden') return project
    }
    const principal = {...(prior || sectors.makePrincipal()),source:project.input?'file':'s0',
      file:project.input || null,mediaRole:project.inputRole}
    return {...project,code,regions:[principal,...project.regions.filter(region=>region.id!==0)]}
  }
  const creations = new CompositionLibrary({sectors, notify, capture: captureComposition, async activate(project, {openCode=true}={}) {
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
    project = migrateInputRoute(project)
    const version = revision, originalInput = inputs[0].current
    const next = await sectors.prepare(project.regions)
    const shared = project.input && next.flatMap(sectorLayers).map(layer=>layer.file?.current)
      .find(input=>input?.file===project.input)
    let medium = shared ? retainVisual(shared) : project.input ? {kind:'file',file:project.input,role:project.inputRole} : null
    let installed = false
    try {
      if (medium) medium.modelView=project.inputModelView
      if (medium && !shared) await prepareVisual(medium,null,medium.file,new AbortController().signal)
      if (version !== revision) throw new Error('El código cambió durante la carga. Volvé a elegir la composición.')
      const item = {id:'obra',name:project.name,code:project.code,libraryId:project.libraryId,
        generator:project.generator,baseMode:project.settings.baseMode}
      if (!load(item,false,true,{openCode})) return
      if (!await execute(item.code,{fresh:true})) return
      if (medium) { inputs[0].cancel(); inputs[0].replace(medium); medium=null }
      else if (inputs[0].current === originalInput && originalInput && originalInput.kind !== project.inputKind) inputs[0].clear()
      sound.music.restore(project.music)
      applyCompositionSettings(project.settings)
      sectors.install(next,project.selectedSector); sectors.apply(); installed = true
      resize(); refreshMix()
      notify('Composición en salida · '+project.name)
      return true
    } finally {
      if (medium) releaseVisual(medium)
      if (!installed) next.flatMap(sectorLayers).forEach(layer=>layer.file?.clear())
    }
  }})
  const loops = new LoopLibrary({
    store:(mode,job)=>sectors.store(mode,job), notify, onRecordEnd:resize,
    documentVersion: () => sectors.documentVersion,
    openLibrary:()=>{
      dismissToast()
      if (document.body.classList.contains('preview-focus')) layout.focus(false)
      changeView('library')
      showLibraryShelf('loops')
    },
    destination:layerTarget,
    source:()=>{
      const target=sectorTarget()
      if (target) return {...sectors.captureSource(target),name:sectorLabel(target)}
      const mapped = mappingMode && mappingDesk()?.preview()
      return mapped?.frame ? {canvas:mapped.canvas,name:'Mapeo'} : {canvas,name:'Salida'}
    },
    use:async (file,target)=>{
      if (target) {
        if (!sectors.containsLayer(target)) throw new Error('La capa elegida ya no está en la composición.')
        const assigned = await sectors.setFile(target,file,'loop')
        if (!assigned) return false
        const region = sectors.regions.find(item=>sectorLayers(item).includes(assigned))
        const ref={sectorId:region.id,layerId:sectorLayerId(assigned),kind:'source'}
        const show = () => window.fosfenoStack.command('inspect',ref).catch(e=>notify(e.message))
        if (!loops.dialog.open && (target===layerTarget() || assigned===layerTarget())) show()
        notify('Loop cargado en '+sectorLabel(region)+' · '+sectorLayerLabel(assigned)+'.',{label:'Ver capa',run:show})
        return true
      } else if (await openVisual('file',{file,role:'loop'},true,null)) {
        refreshLayerOverview()
        notify('Loop cargado en la entrada de toda la visual.',{label:'Ver entrada',run:()=>selectSectorLayer(0,0,'source')})
        return true
      }
      return false
    }
  })
  function chooseStackLoop() {
    const region=sectorTarget(), target=layerTarget()
    const name=sectorLabel(region)+(target ? ' · '+sectorLayerLabel(target) : '')
    return loops.pick(target,name)
  }

  async function newComposition() {
    sectors.documentVersion++
    dismissToast()
    if (loops.active?.state === 'recording') loops.active.stop()
    sound.stopSession()
    room.disconnect()
    for (const [index,input] of inputs.entries()) {
      input.clear()
      const source = engine?.hydra.s[index]
      if (source?.src) source.clear()
    }
    visualStatus('')
    $('routeStatus').textContent = ''
    sectors.groupFor = null
    sectors.groupSelection.clear()
    sectors.install([])
    sectors.apply()
    sectors.history.reset()
    layerTreeOpen.clear()
    setLayerScope(null)
    state.interval = initialSettings.interval
    state.bands = [0, 0, 0]
    applyCompositionSettings(initialSettings)
    const clearing = clearStudioBase()
    sectors.panel(null)
    changeView('sectors')
    resize()
    refreshMix()
    const version = revision, emptyLayers = sectors.history.current
    const canReloadEmpty = () => revision === version && sectors.history.current === emptyLayers &&
      !mappingDesk() && !loops.active && !sound.recorder && !sound.active &&
      !inputs.some(input => input.current || input.pending) && (!projector || projector.closed)
    if (engine?.running) {
      const reload = canReloadEmpty() && {label:'Recargar en blanco',run:()=>{
        if (canReloadEmpty()) location.reload()
        else notify('La sesión cambió. Se conservó tu trabajo.')
      }}
      notify('Salida vacía. El código anterior sigue en ejecución.',reload)
    }
    if (await clearing && revision === version) notify('Composición en blanco.')
  }
  const newDialog = $('newCompositionDialog')
  $('newComposition').onclick = () => {
    newDialog.showModal()
    $('cancelNewComposition').focus()
  }
  $('cancelNewComposition').onclick = () => newDialog.close()
  $('confirmNewComposition').onclick = () => {
    newDialog.close()
    $('newComposition').focus({preventScroll:true})
    newComposition().catch(error => notify(messageFor(error)))
  }

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
  function modelLayerPose(layer,view,commit) {
    if (!sectors.containsLayer(layer)) return
    layer.modelView=view
    const applied=sectors.appliedLayer(layer)
    if (live && applied) applied.modelView=view
    if (commit) sectors.changed()
  }
  function inputModelPose(input,view,commit) {
    if (inputs[0].current!==input) return
    const layer=sectors.principal
    if (layer.file?.current===input) modelLayerPose(layer,view,commit)
    else input.modelView=view
  }
  function syncModelInspectors(ref) {
    const {layer}=studioStack.resolve(ref)
    const target=layer.file?.current?.model && ['sector','layer','source'].includes(ref.kind) ? layer : null
    modelViewControls($('stackModel'),target?.modelView,
      view=>modelLayerPose(target,view,false),target ? view=>modelLayerPose(target,view,true) : null)
    const input=inputs[0].current
    const view=sectors.principal.file?.current===input ? sectors.principal.modelView : input?.modelView
    modelViewControls($('inputModel'),view,
      pose=>inputModelPose(input,pose,false),input?.model ? pose=>inputModelPose(input,pose,true) : null)
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
  async function openVisual(kind, options, mix = $('autoMixInput').getAttribute('aria-pressed') === 'true', layer = layerTarget()) {
    const destination = layer || sectors.principal
    try {
      if (!await inputs[0].open(kind, options)) return false
      if (layer || mix) {
        if (!sectors.containsLayer(destination)) return false
        // A hand-written route can transform s0 far beyond a simple blend. Do not cover it.
        if (!layer && destination.source==='sketch' && !options?.role && baseMode==='visible') {
          try {
            if (analysis().identifiers.some(node=>node.name==='s0')) {
              $('routeStatus').textContent='El código del sketch ya usa s0.'
              return true
            }
          } catch { /* The panel stays usable while an edited line is incomplete. */ }
        }
        return await routeInput(destination)
      }
      $('routeStatus').textContent = 'Fuente conectada en s0, disponible para el código y los sectores.'
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
    const layer = sectors.principal, file = inputs[0].current?.file
    if (layer.source==='s0' || (file && layer.source==='file' && layer.file?.current?.file===file))
      sectors.setSource(layer,'sketch')
    inputs[0].clear()
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
    $('musicIndicator').hidden = !sound.music?.playing
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
  sound.music = new MusicDesk(sound,{
    readTempo:()=>window.bpm ?? state.bpm,
    writeTempo:tempo=>{ window.bpm=tempo },
    readSaved:()=>stored('music',null),
    writeSaved:draft=>store('music',draft)
  })
  window.musicBeat = ()=>sound.music.beat()
  $('openMusicDesk').onclick = ()=>{
    fromToolbar('signal','audio')
    $('musicDesk').open = true
    $('musicSource').focus({preventScroll:true})
    $('musicDesk').scrollIntoView({block:'nearest'})
  }
  window.addEventListener('pagehide',()=>sound.music.stop(false))
  sound.restore()
  if (location.protocol === 'file:') $('offline').textContent = '· Local'
  else if ('serviceWorker' in navigator) {
    const workerURL = new URL('sw.js?v='+edition, location.href).href
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
    const mapSize = mappingMode && mappingBench ? mappingDesk()?.size() : null
    const [width,height] = mapSize || (external ? [projector.innerWidth,projector.innerHeight] : [rect.width,rect.height])
    // The workbench has no layout box while the surface editor is visible.
    if (width < 2 || height < 2) return
    if (loops.active?.state === 'recording') {
      // The encoder must keep the frame size it started recording.
      sectors.layout()
      return
    }
    if (mappingMode && mappingAspect) {
      const w = Math.min(width, height * mappingAspect)
      engine.resize(Math.max(2, w), Math.max(2, w / mappingAspect))
    } else engine.resize(width, height)
    sectors.layout()
  }
  async function fullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen()
    else if (document.body.classList.contains('projecting')) {
      document.body.classList.remove('projecting')
      projectorCode.refresh()
      resize()
    } else {
      if (stage.requestFullscreen) {
        await stage.requestFullscreen()
        await holdScreen()
      } else {
        document.body.classList.add('projecting')
        projectorCode.refresh(true)
        await holdScreen()
        resize()
      }
    }
  }
  document.addEventListener('fullscreenchange', () => {
    projectorCode.refresh(true)
    if (!document.fullscreenElement) wakeLock?.release()
    resize()
  })
  stage.addEventListener('dblclick', (e) => {
    if (e.target !== canvas && (e.target !== sectors.guide || sectors.mode)) return
    if (document.body.classList.contains('quiet')) hideUI()
    else fullscreen().catch((e) => notify(messageFor(e)))
  })
  function mappingDesk() { return $('mappingFrame').contentWindow?.fosfenoMapping }
  function projectCurrent() {
    if (!mappingMode) return openOutput()
    if (!mappingDesk()) return notify('Mapeo está iniciando. Volvé a tocar Proyectar en un momento.')
    if (!mappingDesk().openProjection()) notify('No se pudo abrir la salida. Permití las ventanas emergentes y volvé a intentar.')
  }
  action($('project'), projectCurrent)
  $('settingsDisplay').onclick = $('chooseDisplay').onclick = () => {
    outputPicker(false)
    if (mappingMode && mappingDesk()) mappingDesk().chooseDisplay()
    else window.fosfenoDisplay.choose(notify,projector)
  }
  action($('fullPanel'), () => mappingMode ? projectCurrent() : fullscreen())
  function mappingView(surfacePage) {
    mappingBench = surfacePage
    document.body.classList.toggle('mapping-surface', surfacePage)
    $('mappingFrame').hidden = !surfacePage
    $('mappingSectors').setAttribute('aria-pressed', String(!surfacePage))
    $('mappingSurface').setAttribute('aria-pressed', String(surfacePage))
    if (surfacePage) {
      $('mappingSurface').setAttribute('aria-current','true')
      for (const other of $('studioNav').querySelectorAll('[aria-current]')) {
        if (other!==$('mappingSurface')) other.removeAttribute('aria-current')
      }
    } else $('mappingSurface').removeAttribute('aria-current')
    showMappingReference()
    if (!surfacePage) {
      if (!layout.layersVisible) layout.setLayersVisible(true)
      changeView('sectors', true)
    }
    resize()
  }
  function setMapping(on) {
    if (mappingMode === on) return
    mappingMode = on
    document.body.classList.toggle('mapping-active', on)
    const url = new URL(location.href)
    if (on) url.searchParams.set('mode', 'mapeo')
    else url.searchParams.delete('mode')
    history.replaceState(history.state, '', url)
    $('mappingNav').hidden = !on
    $('mappingSurface').hidden = $('mappingSectors').hidden = !on
    $('openMapping').hidden = $('backToLayers').hidden = on
    if (on) $('openMapping').setAttribute('aria-current', 'true')
    else $('openMapping').removeAttribute('aria-current')
    if (on) {
      if (!$('mappingFrame').hasAttribute('src')) $('mappingFrame').src = 'mapeo.html?embedded=1'
      mappingView(true)
      mappingDesk()?.activate()
    } else {
      const publicWindow=mappingDesk()?.deactivate(true)
      mappingBench = false
      $('mappingFrame').hidden = true
      document.body.classList.remove('mapping-surface')
      showMappingReference()
      resize()
      if (publicWindow) {
        try { openOutput(publicWindow) } catch (error) { notify(messageFor(error)) }
      }
      $('openMapping').focus()
    }
  }
  $('openMapping').onclick = (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (location.protocol === 'file:') return notify('Abrí el estudio por localhost o HTTPS para usar Mapeo.')
    setMapping(!mappingMode)
  }
  $('exitMapping').onclick = () => setMapping(false)
  $('mappingSectors').onclick = () => mappingView(false)
  $('mappingSurface').onclick = () => mappingView(true)
  $('mappingFrame').addEventListener('load', () => {
    if (mappingMode) {
      mappingDesk()?.activate()
      resize()
    }
    else mappingDesk()?.deactivate()
  })
  $('mappingHideBase').onclick = () => mappingDesk()?.hideBase()
  $('mappingReferenceToggle').onclick = () => {
    drawMappingReference = !drawMappingReference
    mappingPreviewFrame = undefined
    showMappingReference()
  }
  function showMappingReference() {
    $('mappingProgram').hidden = !mappingMode || mappingBench || mappingPreviewFrame === undefined
    const showReference = !!(mappingMode && !mappingBench && drawMappingReference && mappingReference)
    $('mappingReference').hidden = !showReference
    document.body.classList.toggle('mapping-reference-on',showReference)
    $('mappingReferenceToggle').hidden = !mappingMode || mappingBench || !mappingReference
    $('mappingReferenceToggle').setAttribute('aria-pressed', String(drawMappingReference))
  }
  window.updateFosfenoMapping = (source, aspect) => {
    mappingReference = source
    mappingAspect = aspect
    mappingPreviewFrame = undefined
    showMappingReference()
    if (mappingMode) resize()
  }
  window.updateFosfenoMappingFeed = mode => {
    $('mappingHideBase').hidden = mode!=='full'
    if (mode!=='sectors') sectors.renderer?.sectorFeed(false)
  }
  window.fosfenoStudioCamera = () => {
    const source = inputs[0].current
    const track = source?.kind==='camera' && source.stream.getVideoTracks()[0]
    return track?.readyState==='live' ? track : null
  }
  window.captureFosfenoMapping = () => packComposition(captureComposition())
  window.restoreFosfenoMapping = async blob => {
    const version = sectors.documentVersion
    const project = await unpackComposition(blob)
    if (version !== sectors.documentVersion) throw new Error('La composición cambió mientras se abría el mapa.')
    if (project.kind === 'operator' || !await creations.activate(project,{openCode:!mappingBench}))
      throw new Error('No se pudo recuperar el código y los sectores del mapa.')
  }
  window.copyFosfenoMappingLayer = async layer => {
    const version = sectors.documentVersion
    const [x, y, w, h] = layer.rect
    const round = layer.mask === 'ellipse'
    const points = round ? Array.from({length: 96}, (_, i) => {
      const angle = i * Math.PI / 48
      return [x + w / 2 * (1 + Math.cos(angle)), y + h / 2 * (1 + Math.sin(angle))]
    }) : [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]
    const [region] = await sectors.prepare([{
      shape: round ? 'Círculo' : 'Rectángulo', points, visible: layer.visible, opacity: layer.opacity,
        source: layer.file ? 'file' : 'sketch', label:layer.name?.slice(0,60), file: layer.file, mediaRole: layer.mediaRole, modelView:layer.modelView, paint: false, fx: []
    }])
    if (!mappingMode || version !== sectors.documentVersion) {
      region.file?.clear()
      throw new Error('Volvé a elegir el recorte en Mapeo.')
    }
    region.id = sectors.nextId++
    if (region.file) sectors.files.add(region.file)
    sectors.regions.push(region)
    sectors.id = region.id
    sectors.changed()
    mappingView(false)
    return {sectorId:region.id,layerId:0,kind:'layer'}
  }
  window.moveFosfenoMappingLayer = window.copyFosfenoMappingLayer
  function drawReference() {
    const reference = $('mappingReference')
    if (reference.hidden || !mappingReference || (mappingReference.tagName === 'VIDEO' && mappingReference.readyState < 2)) return
    if (reference.width !== canvas.width) reference.width = canvas.width
    if (reference.height !== canvas.height) reference.height = canvas.height
    reference.getContext('2d').drawImage(mappingReference, 0, 0, reference.width, reference.height)
  }
  function drawMappingPreview() {
    if (!mappingMode || mappingBench) return
    const preview = mappingDesk()?.preview()
    if (!preview?.frame) return
    const program = $('mappingProgram')
    const resized = program.width !== canvas.width || program.height !== canvas.height
    if (resized) { program.width = canvas.width; program.height = canvas.height }
    if (resized || mappingPreviewFrame !== preview.frame) {
      const context = program.getContext('2d')
      context.clearRect(0, 0, program.width, program.height)
      if ($('mappingReference').hidden) {
        context.fillStyle = '#000'
        context.fillRect(0, 0, program.width, program.height)
      }
      if (!preview.blackout) context.drawImage(preview.canvas, 0, 0, program.width, program.height)
      mappingPreviewFrame = preview.frame
      program.hidden = false
    }
  }
  window.connectFosfenoMapping = (editor, getOutput) => {
    if (!canvas.captureStream) throw new Error('Este navegador no puede compartir la salida Hydra en vivo.')
    mappingConnection?.close()
    const stream = canvas.captureStream(30)
    const track = stream.getVideoTracks()[0]
    const visibility = editor.document
    const connection = {
      stream,
      sectorImage: () => sectors.renderer?.sectorFeed(true),
      windows: () => [getOutput(), editor],
      refresh: restartClock,
      close() {
        visibility.removeEventListener('visibilitychange', restartClock)
        track.stop()
        if (mappingConnection === connection) {
          sectors.renderer?.sectorFeed(false)
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
  function openOutput(resumeWindow) {
    if (!canvas.captureStream)
      throw new Error('Este navegador no puede enviar el lienzo a una ventana de proyección. Abrí el Estudio en un navegador con captura de video del lienzo.')
    const display=window.fosfenoDisplay
    const win = resumeWindow || display.open(projector,960,540,notify)
    if (!win) throw new Error('Permití las ventanas emergentes para este sitio y volvé a tocar Proyectar.')
    if (win===projector) return
    const doc=win.document
    const v = doc.createElement('video')
    v.autoplay = true
    v.playsInline = true
    v.muted = true
    v.controls = false
    v.disablePictureInPicture = true
    v.style.cssText = 'display:block;width:100vw;height:100vh;object-fit:contain;cursor:none'
    const stream=canvas.captureStream(30)
    let detachCode
    display.bind(win,'studio',()=>{
      win.removeEventListener('resize',resize)
      doc.removeEventListener('visibilitychange',restartClock)
      detachCode?.()
      v.onclick=v.ondblclick=null
      v.pause()
      v.srcObject=null
      stream.getTracks().forEach(track=>track.stop())
      v.remove()
      projector=null
      resize()
      restartClock()
    },notify)
    projector=win
    doc.title='Fosfeno · Salida limpia'
    doc.body.style.cssText='margin:0;background:black;overflow:hidden'
    doc.body.replaceChildren(v)
    detachCode=projectorCode.attach(doc.body)
    v.srcObject = stream
    v.ondblclick = () => window.fosfenoDisplay.fullscreen(win,notify)
    win.addEventListener('resize', resize)
    doc.addEventListener('visibilitychange', restartClock)
    v.play().catch(() => { if (v.isConnected) notify('Tocá la salida para iniciar el video.') })
    v.onclick = () => v.play()
    resize()
    holdScreen()
  }
  action($('separate'), projectCurrent)
  window.addEventListener('pagehide', () => {
    window.fosfenoDisplay.current()?.close()
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
      else inputs[i].current?.animation?.advance()
    }
    const input=inputs[0].current
    if (input?.model) {
      const active=sectors.applied.find(layer=>layer.id===0 && layer.file?.current===input)
      input.element=input.model.frame(active?.modelView ?? input.modelView,now)
    }
    const source = input?.element
    if (source && (!(source instanceof HTMLVideoElement) || source.readyState >= 2)) {
      const medium = state.painting ? brush.paint(source, now, state.brush, state.bands[0],state.brushSpeed,state.brushDetail,state.brushInverse) : source
      if (medium && engine.attached[0] !== medium)
        engine.setMedium(medium, 0, inputs[0].current.params)
    }
    engine.tick(ms, sound)
    drawMappingPreview()
    drawReference()
    frameCount++
    frameMs += ms
    if (now - lastUI > 120) {
      lastUI = now
      refreshMix()
      if (state.painting) paintStatus('brushProgress',brush,state.brushInverse)
      const layer=sectors.target()
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
  function hasSketch(code) {
    const text = typeof code === 'string' ? code.trim() : ''
    return !!text && text !== blankScore
  }
  function normalizeEditionURL({ emptyTemplate } = {}) {
    if (location.protocol==='file:') return
    const url = new URL(location.href)
    if (url.searchParams.has('v')) url.searchParams.set('v',edition)
    if (emptyTemplate) url.searchParams.delete('code')
    if (url.href === location.href) return
    try { history.replaceState(history.state,'',url) } catch {}
  }
  function sketchAtURL() {
    const query = new URL(location.href).searchParams
    const id = query.get('sketch_id')
    const item = SKETCHES.find((s) => s.id === id) || HYDRA_GALLERY.find((s) => s.id === id)
    if (item) return { item, bundled: true }
    if (query.has('code')) {
      try {
        const code = decodeURIComponent(atob(query.get('code')))
        if (!code.trim()) return { error: 'El enlace no contiene código Hydra para abrir.' }
        if (code.trim() === blankScore) return { emptyTemplate: true }
        const origin=history.state?.fosfenoLibrary
        return { item: {id:'enlace',name:'Sketch de enlace',...origin,code} }
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
    setMapping(new URL(location.href).searchParams.get('mode') === 'mapeo')
    const sketch = sketchAtURL()
    normalizeEditionURL(sketch)
    const { item, bundled, error } = sketch
    if (error) {
      status(error, true)
      return
    }
    const play = item ? bundled || event.state?.fosfenoRun === historySession : initialDocument.play
    if (event.state?.fosfenoBase==='hidden' && event.state.fosfenoHiddenScore) {
      const hidden = event.state.fosfenoHiddenScore
      load(hidden,false,false)
      setOutputBase('hidden',hidden.name)
      // The previous entry may still be rendering a different graph.
      pendingFresh = true
      appliedText = null
    } else if (!item && event.state?.fosfenoBase==='empty') clearStudioBase()
    else load(item || initialDocument.item, !!play)
    applyURLVisibility()
  }
  async function start() {
    const sketch = sketchAtURL()
    normalizeEditionURL(sketch)
    const { item, bundled, error } = sketch
    const fallback = bundled ? item : startupSketch()
    // The editor stays usable even when WebGL or the initial sketch fails.
    restoreEditor(item,bundled,fallback)
    initialDocument = { item: current, play: armed && !pendingFresh }
    try {
      engine = new VisualEngine(canvas, state, inputs, sound.hydraAudio, room)
      sectors.attach(engine)
      resize()
      new ResizeObserver(resize).observe(stage)
      if (history.state?.fosfenoBase==='empty' || (baseMode==='empty' && !hasSketch(cm.getValue()))) {
        engine.clearScore()
        appliedText = ''
        setOutputBase('empty')
        status(hasSketch(cm.getValue()) ? 'Sin fondo en salida. Código preparado.' : 'Sin fondo.')
      } else if (history.state?.fosfenoBase==='hidden') {
        // Restore the document, but never execute stored or shared JavaScript on reload.
        engine.clearScore()
        appliedText = null
        baseMode = 'hidden'
        pendingFresh = true
        setOutputBase('hidden', current.name)
        status('Fondo oculto.')
      } else {
        await engine.run(fallback.code)
        appliedText = fallback.code
        setOutputBase('visible',fallback.name)
        if (cm.getValue() === fallback.code) status('Sketch en salida.')
      }
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
      if (new URL(location.href).searchParams.get('mode') === 'mapeo') setMapping(true)
      window.addEventListener('popstate', navigateHistory)
      scheduleFrame()
    } catch (e) {
      console.error(e)
      status('Salida WebGL indisponible. Podés editar y copiar el código.', true)
      fail('No se pudo iniciar la salida WebGL. ' + e.message)
    }
  }
  start().catch(error=>{
    console.error(error)
    fail('No se pudo abrir el estudio. Recargá Fosfeno para reintentar.')
  }).finally(()=>{ $('studioBoot').hidden=true })
})()
