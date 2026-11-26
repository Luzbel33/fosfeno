// Window handles here always belong to a public output opened by the studio.
window.fosfenoDisplay = (() => {
  const $ = id => document.getElementById(id)
  const dialog = $('displayDialog'), choices = $('displayChoices'), note = $('displayStatus')
  const manual = 'En Windows, usá Win + P → Extender. Arrastrá sólo la ventana de salida al proyector y hacé doble clic allí.'
  const key = 'fosfeno:projectorDisplay'
  let preference, details, permission, selection, publicWindow, owner, latestReport, attempted=false, generation = 0
  try { preference = JSON.parse(localStorage.getItem(key)) } catch {}

  function match() {
    if (!details || !preference?.screen) return
    const saved = preference.screen
    const names = details.screens.filter(s => s.label === saved.label)
    if (saved.label && names.length === 1) return names[0]
    return names.find(s => s.left === saved.left && s.top === saved.top)
  }
  function target() {
    if (!details || preference?.manual) return
    if (preference?.screen) return match()
    const others = details.screens.filter(s => s !== details.currentScreen)
    const external=others.filter(s=>!s.isInternal)
    if (external.length===1) return external[0]
    if (others.length===1) return others[0]
  }
  async function discover() {
    if (!window.getScreenDetails) throw new Error('Este navegador permite ubicar la salida a mano.')
    try {
      const result = await window.getScreenDetails()
      if (details !== result) {
        details?.removeEventListener('screenschange', screensChanged)
        details = result
        details.addEventListener('screenschange', screensChanged)
      }
      if (!permission) {
        try { permission = await navigator.permissions.query({name:'window-management'}) } catch {}
      }
    } catch (error) {
      details?.removeEventListener('screenschange', screensChanged)
      details = null
      const denied=['NotAllowedError','SecurityError'].includes(error.name)
      throw new Error(denied ? 'El navegador no permitió consultar las pantallas. Podés habilitar el permiso de administración de ventanas para este sitio.' :
        'Falló la detección de pantallas. Volvé a intentar en Elegir pantalla.')
    }
  }
  function label(screen) {
    const number = (details?.screens.indexOf(screen) ?? -1) + 1
    const duplicate=screen.label && details?.screens.some(s=>s!==screen && s.label===screen.label)
    const name=(duplicate ? 'Pantalla '+number+' · ' : '')+(screen.label || 'Pantalla '+number)
    return name+' · '+screen.width+' × '+screen.height
  }
  function alive(output) {
    try { return output && output !== window && !output.closed && output.location.href === 'about:blank' } catch { return false }
  }
  function onScreen(output, screen) {
    const x = output.screenX+output.outerWidth/2, y = output.screenY+output.outerHeight/2
    return x >= screen.left && x < screen.left+screen.width && y >= screen.top && y < screen.top+screen.height
  }
  function couldBeTab(output) {
    // The web platform exposes no native-window ID. Identical bounds can mean two tabs.
    return ['screenX','screenY','outerWidth','outerHeight'].every(key=>Math.abs(output[key]-window[key])<=2)
  }
  function screensChanged() {
    if (dialog.open) return renderChoices()
    if (alive(publicWindow) && !preference?.manual && permission?.state!=='denied') {
      generation++
      place(publicWindow,target(),latestReport)
    }
  }
  const separate = 'Separá la pestaña de salida arrastrándola fuera de la cabina y volvé a tocar Proyectar. '
  async function canFullscreen(output) {
    if (output.navigator.userActivation?.isActive) return true
    try {
      return (await output.navigator.permissions.query({name:'fullscreen',allowWithoutGesture:true})).state==='granted'
    } catch { return false }
  }
  async function place(output, screen, report) {
    if (!alive(output)) return
    if (!screen) {
      const hint = !window.getScreenDetails ? 'Este navegador permite ubicar la salida a mano. ' :
        preference?.screen ? 'El monitor elegido no está disponible. Revisalo en Elegir pantalla. ' :
        !preference?.manual && (details?.screens.length===1 || window.screen.isExtended===false) ? 'El navegador ve una sola pantalla. ' :
        window.getScreenDetails && !preference?.manual ? 'Podés seleccionar el monitor en Elegir pantalla. ' : ''
      report(hint+manual)
      return
    }
    const attempt = generation, page = output.document
    const current=()=>attempt===generation && alive(output) && output.document===page
    if (page.fullscreenElement) {
      if (onScreen(output,screen)) return
      if (couldBeTab(output)) return report(separate+manual)
      if (await canFullscreen(output) && current()) {
        try { await page.documentElement.requestFullscreen({screen,navigationUI:'hide'}) } catch {}
      }
      if (current()) report(onScreen(output,screen) ? 'Salida ubicada en '+label(screen)+' · Pantalla completa.' :
        'La salida sigue en el monitor anterior. Salí de pantalla completa con doble clic y volvé a tocar Proyectar.')
      return
    }
    const verify = async () => {
      if (!current() || page.fullscreenElement) return
      if (!onScreen(output,screen)) { report(separate+manual); return }
      if (screen!==details?.currentScreen && !couldBeTab(output)) {
        if (await canFullscreen(output) && current() && !page.fullscreenElement) {
          try { await page.documentElement.requestFullscreen({screen,navigationUI:'hide'}) } catch {}
        }
      }
      if (current())
        report('Salida ubicada en '+label(screen)+(page.fullscreenElement ? ' · Pantalla completa.' : '. Doble clic en la salida para pantalla completa.'))
    }
    if (onScreen(output,screen)) { verify(); return }
    if (couldBeTab(output)) { report(separate+manual); return }
    try {
      output.moveTo(screen.availLeft,screen.availTop)
      window.setTimeout(()=>{
        if (!current() || page.fullscreenElement) return
        if (onScreen(output,screen) && !couldBeTab(output)) {
          try { output.resizeTo(screen.availWidth,screen.availHeight) } catch {}
        }
        verify()
      },300)
    } catch { report(manual) }
  }
  async function fullscreen(output,report) {
    if (!alive(output)) return
    generation++
    try {
      if (output.document.fullscreenElement) { await output.document.exitFullscreen(); return }
      const screen=(!permission || permission.state==='granted') && target()
      if (screen && !onScreen(output,screen) && couldBeTab(output)) { report(separate+manual); return }
      if (screen) await output.document.documentElement.requestFullscreen({screen})
      else await output.document.documentElement.requestFullscreen()
    } catch { report('El navegador rechazó la pantalla completa. '+manual) }
  }
  function select(choice) {
    const picked = selection
    if (!picked) return
    preference = choice ? {screen:{label:choice.label,left:choice.left,top:choice.top}} : {manual:true}
    try { localStorage.setItem(key,JSON.stringify(preference)) } catch {}
    generation++
    dialog.close()
    if (alive(picked.output)) place(picked.output,choice,picked.report)
    else picked.report(choice ? 'Pantalla elegida · '+label(choice)+'. Tocá Proyectar para abrir la salida.' : manual)
  }
  function renderChoices() {
    if (!dialog.open || !selection) return
    const buttons = (details?.screens || []).map(screen => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label(screen)+(screen === details.currentScreen ? ' · Cabina' : '')
      button.setAttribute('aria-pressed',String(match() === screen))
      button.onclick = () => select(screen)
      return button
    })
    choices.replaceChildren(...buttons)
  }
  $('manualDisplay').onclick = () => select(null)
  $('cancelDisplay').onclick = () => dialog.close()
  dialog.onclose = () => { selection=null; choices.replaceChildren() }
  async function choose(report, output=current()) {
    if (dialog.open) return
    generation++
    const picking = selection = {report,output}
    dialog.showModal()
    note.textContent='Buscando pantallas…'
    try {
      await discover()
      if (picking !== selection || !dialog.open) return
      renderChoices()
      note.textContent = details.screens.length > 1 ? 'Elegí dónde mostrar la ventana de salida.' : 'Hay una sola pantalla disponible. '+manual
    } catch (error) {
      if (picking === selection && dialog.open) note.textContent=error.message+' '+manual
    }
  }
  function current() { return alive(publicWindow) ? publicWindow : null }
  function unbind(output) {
    if (owner?.output!==output) return
    const old=owner
    owner=null
    try { output.removeEventListener('pagehide',old.hide) } catch {}
    old.dispose()
  }
  function bind(output,kind,dispose,report) {
    if (owner) unbind(owner.output)
    const hide=()=>{
      if (publicWindow===output) publicWindow=null
      unbind(output)
    }
    owner={output,kind,dispose,hide}
    latestReport=report
    output.addEventListener('pagehide',hide,{once:true})
  }
  function open(current,width,height,report) {
    const attempt = ++generation
    const auto = !preference?.manual && !!window.getScreenDetails && window.screen.isExtended !== false
    const screen = permission?.state === 'granted' ? target() : null
    const features = auto && screen ? ['left='+screen.availLeft,'top='+screen.availTop,'width='+screen.availWidth,'height='+screen.availHeight]
      : ['width='+width,'height='+height]
    // Start discovery under the original click, before opening a popup consumes activation.
    const ask=auto && (permission?.state==='granted' || !attempted)
    const ready=ask ? discover().then(()=>true,error=>error.message) : (async()=>{
      if (!auto) return false
      try {
        permission=await navigator.permissions.query({name:'window-management'})
        if (permission.state!=='granted') return false
        await discover()
        return true
      } catch { return false }
    })()
    if (ask) attempted=true
    let output=alive(current) ? current : alive(publicWindow) ? publicWindow : null
    if (!output) try { output=window.open('','_blank',['popup',...features].join(',')) } catch {}
    if (!output) return null
    latestReport=report
    publicWindow=output
    const page = output.document
    if (output === current && !output.document.fullscreenElement) output.focus()
    ;(async () => {
      const allowed=await ready
      if (attempt!==generation || !alive(output) || output.document!==page) return
      if (typeof allowed==='string') return report(allowed+' '+manual)
      const screen=allowed && target()
      if (allowed && !screen && details.screens.length>1 && !dialog.open) return choose(report,output)
      place(output,screen,report)
    })()
    return output
  }
  return {choose,open,fullscreen,current,bind,unbind,owner:()=>owner?.kind}
})()
