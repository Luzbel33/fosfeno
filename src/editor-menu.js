// Both desks expose the same menu, keyboard navigation and shortcut vocabulary.
class EditorMenu {
  static labels = {inspect:'Editar',effects:'Añadir efecto',library:'Abrir biblioteca',code:'Editar código',shape:'Crear sector',
    duplicate:'Duplicar',copy:'Copiar',paste:'Pegar',toggle:'Cambiar visibilidad',up:'Subir',down:'Bajar',
    center:'Centrar en el lienzo',deform:'Deformar',resetTransform:'Restablecer geometría',
    select:'Mover',brush:'Pincel',line:'Línea',undo:'Deshacer',redo:'Rehacer',remove:'Quitar'}
  static keys = {duplicate:'Mod D',copy:'Mod C',paste:'Mod V',undo:'Mod Z',redo:'Mod Mayús Z',
    up:'Alt ↑',down:'Alt ↓',remove:'Supr',select:'V',brush:'B',line:'L'}
  static editing(target) {
    return target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false]),.CodeMirror,[role=textbox]') ||
      document.querySelector('dialog[open]')
  }
  static stack(ref,allowed,muted,history) {
    const options=['inspect',...(['sector','group','layer'].includes(ref.kind) ? ['effects'] : []),
      'toggle','duplicate','copy','paste','up','down','remove'].filter(id=>allowed.includes(id))
    if (ref.kind==='base' && !options.length) options.push(...['library','code'].filter(id=>allowed.includes(id)))
    if (ref.kind==='sector' && ref.sectorId) options.splice(1,0,'deform','center')
    const keys=[...options,'select']
    if (ref.kind==='sector' && ref.sectorId) keys.push('nudge')
    if (history.canUndo) keys.push('undo')
    if (history.canRedo) keys.push('redo')
    const labels={toggle:ref.kind==='effect' ? (muted?'Activar efecto':'Pausar efecto') : (muted?'Mostrar':'Ocultar')}
    if (ref.kind==='group') labels.remove='Desagrupar'
    return {menu:options,keys,labels}
  }
  constructor(trigger,context,onError) {
    this.trigger=trigger
    this.context=context
    this.onError=onError
    this.el=document.createElement('div')
    this.el.className='editor-action-menu'
    this.el.id=trigger.id+'Menu'
    this.el.setAttribute('role','menu')
    this.el.hidden=true
    document.body.append(this.el)
    trigger.setAttribute('aria-controls',this.el.id)
    trigger.setAttribute('aria-expanded','false')
    trigger.setAttribute('aria-haspopup','menu')
    trigger.onclick=()=>this.el.hidden ? this.open(trigger,null) : this.close(true)
    document.addEventListener('contextmenu',event=>{
      if (EditorMenu.editing(event.target) || this.el.contains(event.target)) return
      if (this.open(event.target,event)) event.preventDefault()
    })
    document.addEventListener('keydown',event=>this.key(event),true)
    document.addEventListener('pointerdown',event=>{
      if (!this.el.hidden && !this.el.contains(event.target) && !trigger.contains(event.target)) this.close(false)
    },true)
    window.addEventListener('resize',()=>this.close(false))
    window.addEventListener('blur',()=>this.close(false))
  }
  open(target,event) {
    const spec=this.context(target,event,true)
    if (!spec?.menu.length) return false
    this.returnTo=target.closest('button,[tabindex]') || this.trigger
    const rect=this.returnTo.getBoundingClientRect()
    spec.choose?.()
    const title=document.createElement('strong')
    title.textContent=spec.name
    title.setAttribute('role','presentation')
    this.el.replaceChildren(title)
    this.el.setAttribute('aria-label','Acciones de '+spec.name)
    const mod=/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
    for (const action of spec.menu) {
      const button=document.createElement('button')
      button.type='button'
      button.setAttribute('role','menuitem')
      button.tabIndex=-1
      button.dataset.action=action
      button.textContent=spec.labels?.[action] || EditorMenu.labels[action]
      const key=EditorMenu.keys[action]
      if (key) {
        const kbd=document.createElement('kbd')
        kbd.textContent=key.replace('Mod',mod).replaceAll(' ',' + ')
        button.append(kbd)
      }
      button.onclick=()=>{this.close(true);this.invoke(spec,action)}
      this.el.append(button)
    }
    const help=document.createElement('button')
    help.type='button'
    help.tabIndex=-1
    help.setAttribute('role','menuitem')
    help.dataset.action='shortcuts'
    help.textContent='Atajos de teclado'
    help.onclick=()=>this.showShortcuts(mod)
    this.el.append(help)
    this.el.hidden=false
    this.trigger.setAttribute('aria-expanded','true')
    const viewport=window.visualViewport
    const left=viewport?.offsetLeft || 0, top=viewport?.offsetTop || 0
    const width=viewport?.width ?? innerWidth, height=viewport?.height ?? innerHeight
    this.el.style.maxWidth=Math.max(1,width-12)+'px'
    this.el.style.maxHeight=Math.max(1,height-12)+'px'
    const box=this.el.getBoundingClientRect()
    this.el.style.left=Math.max(left+6,Math.min(left+width-box.width-6,event?.clientX ?? rect.left))+'px'
    this.el.style.top=Math.max(top+6,Math.min(top+height-box.height-6,event?.clientY ?? rect.bottom))+'px'
    this.el.querySelector('button').focus({preventScroll:true})
    return true
  }
  showShortcuts(mod) {
    this.close(true)
    const dialog=document.createElement('dialog'),title=document.createElement('h2'),list=document.createElement('dl')
    dialog.className='editor-shortcuts'
    title.textContent='Atajos de edición'
    dialog.setAttribute('aria-label',title.textContent)
    const entries=[['Menú de la selección','Mayús + F10'],['Duplicar',mod+' + D'],['Copiar / Pegar',mod+' + C / V'],
      ['Quitar','Supr'],['Deshacer',mod+' + Z'],['Rehacer',mod+' + Y / '+mod+' + Mayús + Z'],
      ['Subir / Bajar en la pila','Alt + ↑ / ↓'],['Mover un píxel','Flechas'],['Mover diez píxeles','Mayús + flecha'],
      ['Herramienta Mover','V']]
    if (this.trigger.id==='mapContext') entries.push(['Pincel','B'],['Línea','L'])
    for (const [label,key] of entries) {
      const dt=document.createElement('dt'),dd=document.createElement('dd')
      dt.textContent=label;dd.textContent=key;list.append(dt,dd)
    }
    const close=document.createElement('button')
    close.type='button';close.textContent='Cerrar';close.onclick=()=>dialog.close()
    dialog.onclose=()=>{dialog.remove();this.trigger.focus({preventScroll:true})}
    dialog.append(title,list,close);document.body.append(dialog)
    dialog.showModal();close.focus()
  }
  close(restore) {
    if (this.el.hidden) return
    this.el.hidden=true
    this.trigger.setAttribute('aria-expanded','false')
    if (restore) (this.returnTo?.isConnected ? this.returnTo : this.trigger).focus({preventScroll:true})
  }
  invoke(spec,action,delta) {
    try { Promise.resolve(spec.run(action,delta)).catch(this.onError) } catch(error) { this.onError(error) }
  }
  key(event) {
    if (event.defaultPrevented || event.isComposing || EditorMenu.editing(event.target)) return
    if (!this.el.hidden) {
      const buttons=Array.from(this.el.querySelectorAll('button')),i=buttons.indexOf(document.activeElement)
      if (event.key==='Tab') {this.close(true);return}
      if (event.key==='Escape') this.close(true)
      else if (event.key==='Home') buttons[0].focus()
      else if (event.key==='End') buttons.at(-1).focus()
      else if (['ArrowDown','ArrowUp'].includes(event.key))
        buttons[(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus()
      else return
    } else if ((event.shiftKey && event.key==='F10') || event.key==='ContextMenu') {
      if (!this.open(event.target,null)) return
    } else {
      const k=event.key.toLowerCase(),mod=event.metaKey || event.ctrlKey
      let action=mod && !event.altKey ? ({d:'duplicate',c:'copy',v:'paste',z:event.shiftKey?'redo':'undo',y:'redo'})[k] :
        event.altKey && !mod ? ({arrowup:'up',arrowdown:'down'})[k] : !mod && !event.altKey ?
        ({delete:'remove',v:'select',b:'brush',l:'line',arrowup:'nudge',arrowleft:'nudge',arrowright:'nudge',arrowdown:'nudge'})[k] : null
      if (!action || (event.repeat && action!=='nudge') ||
          (event.shiftKey && !['nudge','redo'].includes(action)) || (['copy','paste'].includes(action) && !window.getSelection()?.isCollapsed)) return
      const spec=this.context(event.target,null,false)
      if (!spec || !(spec.keys || spec.menu).includes(action)) return
      const direction=action==='nudge' && ({arrowup:[0,-1],arrowdown:[0,1],arrowleft:[-1,0],arrowright:[1,0]})[k]
      this.invoke(spec,action,direction && direction.map(n=>n*(event.shiftKey?10:1)))
    }
    event.preventDefault()
    event.stopImmediatePropagation()
  }
}
