class LoopLibrary {
  constructor({store,source,use,notify,openLibrary,destination,documentVersion,onRecordEnd}) {
    Object.assign(this,{store,source,use,notify,openLibrary,destination,documentVersion,onRecordEnd})
    const $ = id=>document.getElementById(id)
    this.button=$('loopButton')
    this.root=$('loopList')
    this.panel=$('loopLibrary')
    this.dialog=$('stackLoopDialog')
    this.slot=$('loopShelfSlot')
    $('closeStackLoop').onclick=()=>this.dialog.close()
    this.dialog.onclose=()=>{
      this.stopPreview()
      this.selection=null
      this.slot.append(this.panel)
      this.panel.hidden=document.querySelector('[data-shelf="loops"]').getAttribute('aria-pressed')!=='true'
      $('importLoop').textContent='Importar video o GIF'
      this.refresh()
    }
    $('openLoops').onclick=()=>this.reveal()
    this.button.onclick=()=>this.record().catch(e=>notify(e.message))
    $('importLoop').onclick=()=>$('loopFile').click()
    $('loopFile').onchange=async event=>{
      const file=event.target.files[0]
      event.target.value=''
      if (!file) return
      const picker=this.selection
      try {
        await this.save(file)
        if (picker && this.selection===picker && this.documentVersion()===picker.version) {
          if (await this.use(file,picker.target) && this.selection===picker) this.dialog.close()
        }
      } catch (e) { this.fail(e) }
    }
  }
  fail(error) {
    if (this.dialog.open) document.getElementById('loopPickStatus').textContent=error.message
    else this.notify(error.message)
  }
  stopPreview() {
    const preview=this.preview
    this.preview=null
    if (!preview) return
    preview.button.setAttribute('aria-pressed','false')
    if (preview.element) {
      preview.element.pause?.()
      preview.element.removeAttribute('src')
      preview.element.load?.()
      preview.element.remove()
    }
    if (preview.url) URL.revokeObjectURL(preview.url)
  }
  async previewFile(get,row,button) {
    const wasPlaying=this.preview?.button===button
    this.stopPreview()
    if (wasPlaying) return
    const preview={button,element:null}
    this.preview=preview
    try {
      const file=await get()
      if (preview!==this.preview || !row.isConnected) return
      const gif=isGifFile(file)
      const element=preview.element=document.createElement(gif?'img':'video')
      if (gif) element.alt='Vista previa de '+file.name
      else element.muted=element.loop=element.playsInline=true
      preview.url=URL.createObjectURL(file)
      element.src=preview.url
      element.className='loop-preview'
      element.setAttribute('aria-label','Vista previa de '+file.name)
      row.append(element)
      button.setAttribute('aria-pressed','true')
      if (gif) await element.decode()
      else await element.play()
    } catch(error) {
      if (preview===this.preview) { this.stopPreview(); this.fail(error) }
    }
  }
  pick(target,name) {
    this.selection={target,version:this.documentVersion()}
    document.getElementById('stackLoopDestination').textContent=name
    document.getElementById('loopPickStatus').textContent=''
    document.getElementById('stackLoopSlot').append(this.panel)
    document.getElementById('importLoop').textContent='Importar y usar'
    this.panel.hidden=false
    if (!this.dialog.open) this.dialog.showModal()
    return this.refresh()
  }
  reveal(key) {
    this.focusKey=key
    this.openLibrary()
  }
  async save(file) {
    file=normalizeGifFile(file)
    if (!file.size || !(file.type.startsWith('video/') || isGifFile(file))) throw new Error('Elegí un video o GIF que se pueda reproducir.')
    const key=await this.store('readwrite',s=>s.add(file,['loop',Date.now(),crypto.randomUUID?.() || String(Math.random()),file.name]))
    if (!this.panel.hidden) await this.refresh()
    if (this.dialog.open) return
    this.notify('Loop guardado.',{label:'Ver loop',run:()=>this.reveal(key)})
  }
  async refresh() {
    const revision=this.listRevision=(this.listRevision || 0)+1
    try {
      const keys=await this.store('readonly',s=>s.getAllKeys(IDBKeyRange.bound(['loop'],['loop',[]])))
      if (revision!==this.listRevision) return
      this.stopPreview()
      let focus
      this.root.replaceChildren(...keys.reverse().map(key=>{
        const row=document.createElement('div'), play=document.createElement('button'), download=document.createElement('button')
        row.className='loop-row'
        const title=document.createElement('strong')
        title.textContent=key[3]
        const remove=document.createElement('button')
        play.textContent='Usar'
        play.setAttribute('aria-label','Usar '+key[3])
        play.setAttribute('aria-describedby',this.selection ? 'stackLoopDestination' : 'sectorTarget')
        download.textContent='Descargar'
        download.setAttribute('aria-label','Descargar '+key[3])
        remove.textContent='Eliminar'
        const get=async()=>{
          const file=await this.store('readonly',s=>s.get(key))
          if (!file) throw new Error('Este loop ya no está en la biblioteca.')
          return file
        }
        play.onclick=async()=>{
          const picker=this.selection
          const target=picker ? picker.target : this.destination()
          const version=picker ? picker.version : this.documentVersion()
          play.disabled=true
          try {
            const file=await get()
            if (version!==this.documentVersion() || this.selection!==picker) return
            const used=await this.use(file,target)
            if (used && picker && this.selection===picker) this.dialog.close()
          } catch (e) { this.fail(e) }
          finally { play.disabled=false }
        }
        download.onclick=async()=>{
          try {
            const url=URL.createObjectURL(await get()), a=document.createElement('a')
            a.href=url; a.download=key[3]; a.click()
            setTimeout(()=>URL.revokeObjectURL(url),30000)
          } catch (e) { this.notify(e.message) }
        }
        remove.onclick=async()=>{
          if (remove.textContent==='Eliminar') { remove.textContent='Confirmar'; return }
          try { await this.store('readwrite',s=>s.delete(key)); await this.refresh() }
          catch (e) { this.notify(e.message) }
        }
        const preview=document.createElement('button')
        preview.textContent='Ver'
        preview.setAttribute('aria-label','Vista previa de '+key[3])
        preview.setAttribute('aria-pressed','false')
        preview.onclick=()=>this.previewFile(get,row,preview)
        row.append(title,play,preview)
        if (!this.selection) row.append(download,remove)
        if (this.focusKey && indexedDB.cmp(key,this.focusKey)===0) focus=play
        return row
      }))
      if (!keys.length) this.root.textContent='Todavía no guardaste loops. Podés grabar uno o importar un video.'
      if (this.focusKey && !this.panel.hidden) {
        this.focusKey=null
        if (focus) { focus.focus(); focus.closest('.loop-row').scrollIntoView({block:'nearest'}) }
      }
    } catch (e) { this.root.textContent='No se pudieron leer los loops.'; this.notify(e.message) }
  }
  async record() {
    if (this.active) {
      if (this.active.state==='recording') this.active.stop()
      return
    }
    if (typeof MediaRecorder!=='function') throw new Error('Este navegador no permite grabar la salida.')
    const source=this.source()
    let stream
    try {
      stream=source.canvas.captureStream(24)
      const mimeType=['video/webm;codecs=vp8','video/mp4','video/webm'].find(type=>MediaRecorder.isTypeSupported(type))
      const recorder=new MediaRecorder(stream,{...(mimeType && {mimeType}),videoBitsPerSecond:3000000})
      const chunks=[]
      const label=this.button.querySelector('span')
      let failed=false
      const stop=()=>{
        if (recorder.state==='recording') recorder.stop()
      }
      recorder.ondataavailable=e=>{if (e.data.size) chunks.push(e.data)}
      recorder.onerror=e=>{failed=true; this.notify(e.error?.message || 'No se pudo grabar el loop.')}
      recorder.onstop=async()=>{
        clearTimeout(timer)
        stream.getTracks().forEach(t=>t.stop())
        source.release?.()
        this.button.setAttribute('aria-pressed','false')
        this.button.disabled=true
        label.textContent='Guardando…'
        try {
          if (failed) return
          if (!chunks.length) throw new Error('La grabación quedó vacía. Volvé a grabar el loop.')
          const type=(recorder.mimeType || 'video/webm').split(';')[0]
          const timestamp=new Intl.DateTimeFormat('sv-SE',{dateStyle:'short',timeStyle:'medium'}).format(new Date()).replaceAll(':','-')
          const name=source.name+' '+timestamp+(type.endsWith('mp4')?'.mp4':'.webm')
          await this.save(new File(chunks,name,{type}))
        } catch (e) { this.notify(e.message) }
        finally {
          this.active=null
          this.onRecordEnd()
          label.textContent='Grabar loop'
          this.button.disabled=false
        }
      }
      recorder.start(1000)
      this.active=recorder
      label.textContent='Guardar loop'
      this.button.setAttribute('aria-pressed','true')
      const timer=setTimeout(stop,30000)
      this.notify('Grabando '+source.name+'. Tocá Guardar loop para cortar o esperá 30 segundos.')
    } catch (e) {
      stream?.getTracks().forEach(t=>t.stop())
      source.release?.()
      throw e
    }
  }
}
