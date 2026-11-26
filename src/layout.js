function paintRange(input) {
  const span = Number(input.max) - Number(input.min)
  const amount = span ? 100 * (Number(input.value)-Number(input.min))/span : 0
  input.style.setProperty('--amount',amount+'%')
}

class StudioLayout {
  constructor(editor) {
    this.editor = editor
    this.wide = matchMedia('(min-width:1180px) and (min-height:610px)')
    this.compact = matchMedia('(max-width:700px), (max-width:980px) and (max-height:560px)')
    this.recordBar = matchMedia('(min-width:1280px)')
    this.bench = document.querySelector('.workbench')
    this.studio = document.querySelector('.studio')
    this.preview = document.getElementById('previewArea')
    this.inspector = document.getElementById('inspectorDesk')
    this.codeHeading = document.getElementById('codeHeading')
    this.closeInspector = document.getElementById('closeInspector')
    this.closeInspector.onclick = () => {
      this.setInspectorVisible(false)
      this.activeTool?.focus({preventScroll:true})
    }
    this.divider = document.getElementById('splitter')
    this.focusButton = document.getElementById('focusPreview')
    // The divider owns this gesture. A native fling can otherwise consume the next tap.
    this.divider.addEventListener('touchstart', event => event.preventDefault(), {passive:false})
    this.divider.onpointerdown = e => {
      if (e.button !== 0) return
      this.drag = {id:e.pointerId, vertical:this.verticalSplit()}
      this.divider.setPointerCapture(e.pointerId)
    }
    this.divider.onpointermove = e => {
      if (e.pointerId !== this.drag?.id) return
      const bounds = this.splitBounds()
      const fraction = this.drag.vertical
        ? (e.clientX-bounds.left)/bounds.width : (bounds.bottom-e.clientY)/bounds.height
      this.setPreviewShare(fraction)
    }
    this.divider.onlostpointercapture = () => { this.drag = null }
    this.divider.onkeydown = e => {
      const delta = {ArrowLeft:-.05,ArrowUp:.05,ArrowRight:.05,ArrowDown:-.05}[e.key]
      if (delta === undefined && !['Home','End','Enter'].includes(e.key)) return
      e.preventDefault()
      if (e.key === 'Enter' && this.compact.matches) this.open(!this.opened)
      else this.setPreviewShare(e.key === 'Home' ? 0 : e.key === 'End' ? 1 : this.share() + (delta || 0))
    }
    this.focusButton.onclick = () => this.focus(!document.body.classList.contains('preview-focus'))
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !document.getElementById('helpDialog').open &&
          document.body.classList.contains('preview-focus')) this.focus(false)
    })
    this.compact.addEventListener('change', () => {
      this.open(false)
      this.arrangeChrome()
    })
    this.recordBar.addEventListener('change',()=>this.arrangeChrome())
    const resize = new ResizeObserver(() => {
      this.divider.setAttribute('aria-orientation', this.verticalSplit() ? 'vertical' : 'horizontal')
      const percent = Math.round(this.share()*100)
      this.divider.setAttribute('aria-valuenow', percent)
      this.divider.setAttribute('aria-valuetext', percent + '% para la visual')
      if (this.wide.matches || this.studio.getBoundingClientRect().width) this.editor.refresh()
    })
    resize.observe(this.studio)
    resize.observe(this.inspector)
    const viewport = () => {
      const v = window.visualViewport
      if (v && v.scale === 1) document.documentElement.style.setProperty('--app-height',v.height+'px')
      this.fitHelp()
    }
    window.visualViewport?.addEventListener('resize',viewport)
    window.visualViewport?.addEventListener('scroll',() => this.fitHelp())
    window.addEventListener('resize',viewport)
    viewport()
    const content = document.getElementById('helpContent')
    content.onscroll = () => this.moreHelp()
    document.getElementById('moreHelp').onclick = () => {
      content.scrollTop += Math.max(1, Math.floor(content.clientHeight * .8))
      this.moreHelp()
    }
    this.open(false)
    this.arrangeChrome()
    this.showPanes('sectors')
  }
  activeView(view) { return this.wide.matches && view === 'sectors' ? 'code' : view }
  showPanes(view) {
    const wide = this.wide.matches
    const active = this.activeView(view)
    document.body.classList.toggle('three-pane',wide)
    for (const pane of document.querySelectorAll('[data-viewpane]')) {
      const type = pane.dataset.viewpane
      const parent = wide && type !== 'sectors' ? this.inspector : this.studio
      if (pane.parentElement !== parent) parent.append(pane)
      pane.hidden = type !== active && !(wide && type === 'sectors')
    }
    this.inspector.hidden = !wide
    this.codeHeading.hidden = active !== 'code'
    if (wide) {
      const header = active === 'library' ? document.querySelector('.library-heading .section-line') :
        active === 'signal' ? document.querySelector('#panel > .tabs') : this.codeHeading
      if (this.closeInspector.parentElement !== header) header.append(this.closeInspector)
    }
  }
  setInspectorVisible(show) {
    document.body.classList.toggle('tool-collapsed',!show)
    this.open(this.opened)
    if (show) this.editor.refresh()
  }
  arrangeChrome() {
    const $ = id => document.getElementById(id)
    const editing = !document.body.classList.contains('preview-focus')
    const place = (id,parent) => {
      const element=$(id)
      if (element.parentElement!==parent) parent.append(element)
    }
    place('previewActions',editing ? $('previewDock') : document.querySelector('.output-head'))
    place('outputChoices',editing ? $('previewDock') : $('previewArea'))
    place('loopActions',$(this.recordBar.matches ? 'recordTop' : 'recordBottom'))
  }
  get opened() { return document.body.classList.contains('tools-open') }
  get layersVisible() { return !document.body.classList.contains('layers-collapsed') }
  setLayersVisible(on) {
    document.body.classList.toggle('layers-collapsed',!on)
    this.open(this.opened)
  }
  sideDrawer() {
    return this.compact.matches && matchMedia('(min-width:551px) and (orientation:landscape)').matches
  }
  verticalSplit() {
    return !this.compact.matches || (this.opened && this.sideDrawer())
  }
  splitBounds() {
    const bounds = this.bench.getBoundingClientRect()
    if (!this.wide.matches) return bounds
    const left = this.preview.getBoundingClientRect().left
    return {left, width: bounds.right-left}
  }
  share() {
    const dimension = this.verticalSplit() ? 'width' : 'height'
    return this.preview.getBoundingClientRect()[dimension] / Math.max(1,this.splitBounds()[dimension])
  }
  setPreviewShare(fraction) {
    if (this.compact.matches && !this.verticalSplit() && fraction > .85) { this.open(false); return }
    this.open(true)
    const vertical = this.verticalSplit()
    const clamped = Math.max(vertical ? .3 : .2, Math.min(vertical ? .8 : .74,fraction))
    if (this.wide.matches) {
      document.body.style.setProperty('--code-width',(this.splitBounds().width*(1-clamped))+'px')
    } else {
      document.body.style.setProperty(vertical ? '--studio-width' : '--studio-height',(100*(1-clamped))+'%')
    }
  }
  open(on) {
    const showDrawer = this.compact.matches && on
    document.body.classList.toggle('tools-open',showDrawer)
    const close = document.getElementById('closeTools')
    close.hidden = !showDrawer
    close.setAttribute('aria-label','Cerrar panel')
    const header = document.querySelector('#layerDesk .sector-header')
    if (showDrawer && !document.getElementById('layerDesk').hidden) {
      if (close.parentElement!==header) header.append(close)
    } else if (close.parentElement!==this.studio) this.studio.prepend(close)
    for (const button of document.querySelectorAll('#studioNav button')) {
      const active = button === this.activeTool && (!this.compact.matches || showDrawer) &&
        !(this.wide.matches && document.body.classList.contains('tool-collapsed'))
      if (active) button.setAttribute('aria-current','true')
      else button.removeAttribute('aria-current')
      if (this.compact.matches) {
        button.setAttribute('aria-expanded',String(active))
      } else if (this.wide.matches && button.id==='backToLayers') {
        button.setAttribute('aria-expanded',String(this.layersVisible))
      } else button.removeAttribute('aria-expanded')
    }
  }
  focus(on) {
    document.body.classList.toggle('preview-focus',on)
    this.arrangeChrome()
    this.focusButton.setAttribute('aria-pressed',on)
    this.focusButton.setAttribute('aria-label',on ? 'Volver a editar' : 'Ampliar visual')
    this.focusButton.title=on ? 'Volver a editar' : 'Ampliar visual'
    this.focusButton.querySelector('span').textContent = on ? 'Volver a editar' : 'Ampliar'
    this.focusButton.focus({preventScroll:true})
    if (!on) this.editor.refresh()
  }
  fitHelp() {
    const dialog = document.getElementById('helpDialog')
    if (!dialog.open) return
    const viewport = window.visualViewport
    const height = viewport?.height || innerHeight, width = viewport?.width || innerWidth
    const anchor = this.helpAnchor?.getBoundingClientRect()
    const small = this.compact.matches || width < 480 || (viewport?.scale || 1) > 1
    const offsetX = viewport?.offsetLeft || 0, offsetY = viewport?.offsetTop || 0
    const gap = 10
    const size = Math.min(width - (small ? 0 : 2*gap),small ? 620 : 405)
    const left = offsetX + (small ? (width-size)/2 :
      Math.max(gap,Math.min(width-size-gap,(anchor?.left ?? offsetX)-offsetX)))
    const top = offsetY + (small ? Math.min(74,height*.09) : gap)
    dialog.classList.toggle('help-sheet',small)
    Object.assign(dialog.style, {left:left+'px',top:top+'px',
      width:size+'px', maxHeight:Math.max(0,offsetY+height-top-(small ? 0 : gap))+'px'})
    this.moreHelp()
    const actual = dialog.getBoundingClientRect().height
    if (small) dialog.style.top = offsetY + height - actual + 'px'
    else if (anchor) {
      const below = anchor.bottom + gap, above = anchor.top - gap - actual
      dialog.style.top = Math.max(top,below+actual <= offsetY+height-gap ? below : above)+'px'
    }
  }
  moreHelp() {
    const c = document.getElementById('helpContent'), more = document.getElementById('moreHelp')
    // Keep the footer height stable at the end of a long list.
    more.hidden = c.scrollHeight <= c.clientHeight + 2
    more.disabled = c.scrollTop + c.clientHeight >= c.scrollHeight - 2
    more.textContent = more.disabled ? 'Fin de la guía' : 'Seguir leyendo ↓'
  }
}
