class StudioLayout {
  constructor(editor) {
    this.editor = editor
    this.compact = matchMedia('(max-width:700px), (max-width:980px) and (max-height:560px)')
    this.bench = document.querySelector('.workbench')
    this.studio = document.querySelector('.studio')
    this.divider = document.getElementById('splitter')
    this.focusButton = document.getElementById('focusPreview')
    // The divider owns this gesture. A native fling can otherwise consume the next tap.
    this.divider.addEventListener('touchstart', event => event.preventDefault(), {passive:false})
    this.divider.onpointerdown = e => {
      if (e.button !== 0) return
      this.drag = {id:e.pointerId, vertical:this.verticalSplit(), pendingOpen:!this.opened && this.sideDrawer(), startY:e.clientY}
      this.divider.setPointerCapture(e.pointerId)
    }
    this.divider.onpointermove = e => {
      if (e.pointerId !== this.drag?.id) return
      if (this.drag.pendingOpen) {
        if (this.drag.startY - e.clientY > 12) this.open(true)
        return
      }
      const bounds = this.bench.getBoundingClientRect()
      const fraction = this.drag.vertical
        ? (e.clientX-bounds.left)/bounds.width : (e.clientY-bounds.top)/bounds.height
      this.setPreviewShare(fraction)
    }
    this.divider.onlostpointercapture = () => { this.drag = null }
    this.divider.onkeydown = e => {
      const delta = {ArrowLeft:-.05,ArrowUp:-.05,ArrowRight:.05,ArrowDown:.05}[e.key]
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
    this.compact.addEventListener('change', () => this.open(false))
    new ResizeObserver(() => {
      this.divider.setAttribute('aria-orientation', this.verticalSplit() ? 'vertical' : 'horizontal')
      if (!this.studio.getBoundingClientRect().width) return
      const percent = Math.round(this.share()*100)
      this.divider.setAttribute('aria-valuenow', percent)
      this.divider.setAttribute('aria-valuetext', percent + '% para la visual')
      this.editor.refresh()
    }).observe(this.studio)
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
  }
  get opened() { return document.body.classList.contains('tools-open') }
  sideDrawer() {
    return this.compact.matches && matchMedia('(min-width:551px) and (orientation:landscape)').matches
  }
  verticalSplit() {
    return !this.compact.matches || (this.opened && this.sideDrawer())
  }
  share() {
    const dimension = this.verticalSplit() ? 'width' : 'height'
    return document.getElementById('previewArea').getBoundingClientRect()[dimension] /
      Math.max(1,this.bench.getBoundingClientRect()[dimension])
  }
  setPreviewShare(fraction) {
    if (this.compact.matches && !this.verticalSplit() && fraction > .85) { this.open(false); return }
    this.open(true)
    const vertical = this.verticalSplit()
    const clamped = Math.max(vertical ? .3 : .2, Math.min(vertical ? .8 : .74,fraction))
    this.bench.style.setProperty(vertical ? '--studio-width' : '--studio-height', (100*(1-clamped))+'%')
  }
  open(on) {
    const showDrawer = this.compact.matches && on
    document.body.classList.toggle('tools-open',showDrawer)
    for (const tab of document.querySelectorAll('.workspace-tabs button')) {
      if (this.compact.matches) tab.setAttribute('aria-expanded', on && tab.classList.contains('active'))
      else tab.removeAttribute('aria-expanded')
    }
  }
  focus(on) {
    document.body.classList.toggle('preview-focus',on)
    this.focusButton.setAttribute('aria-pressed',on)
    this.focusButton.querySelector('span').textContent = on ? 'Volver a editar' : 'Ampliar'
    if (!on) this.editor.refresh()
  }
  fitHelp() {
    const dialog = document.getElementById('helpDialog')
    if (!dialog.open) return
    const viewport = window.visualViewport
    const height = viewport?.height || innerHeight, width = viewport?.width || innerWidth
    const panel = this.studio.getBoundingClientRect()
    const small = this.compact.matches || panel.width < 360 || (viewport?.scale || 1) > 1
    const offsetX = viewport?.offsetLeft || 0, offsetY = viewport?.offsetTop || 0
    const top = small ? offsetY + Math.min(74,height*.09) : Math.max(offsetY,panel.top)
    const left = small ? offsetX + Math.max(0,(width-620)/2) : Math.max(offsetX,panel.left)
    dialog.classList.toggle('help-sheet',small)
    Object.assign(dialog.style, {left:left+'px',top:top+'px',
      width:(small ? Math.min(width,620) : Math.min(panel.width,offsetX+width-left))+'px',
      maxHeight:Math.max(0,offsetY+height-top)+'px'})
    this.moreHelp()
    if (small) dialog.style.top = offsetY + height - dialog.getBoundingClientRect().height + 'px'
  }
  moreHelp() {
    const c = document.getElementById('helpContent'), more = document.getElementById('moreHelp')
    // Keep the footer height stable at the end of a long list.
    more.hidden = c.scrollHeight <= c.clientHeight + 2
    more.disabled = c.scrollTop + c.clientHeight >= c.scrollHeight - 2
    more.textContent = more.disabled ? 'Fin de la guía' : 'Seguir leyendo ↓'
  }
}
