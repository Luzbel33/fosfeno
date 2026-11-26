class LoopLibrary {
  constructor({store,source,use,notify,openLibrary,destination,documentVersion}) {
    Object.assign(this,{store,source,use,notify,openLibrary,destination,documentVersion})
    const $ = id=>document.getElementById(id)
    this.button=$('loopButton')
    this.root=$('loopList')
    this.panel=$('loopLibrary')
    this.summary=this.panel.querySelector('summary')
    $('openLoops').onclick=()=>this.reveal()
    this.button.onclick=()=>this.record().catch(e=>notify(e.message))
    this.panel.ontoggle=()=>{ if (this.panel.open) this.refresh() }
    $('importLoop').onclick=()=>$('loopFile').click()
    $('loopFile').onchange=async event=>{
      const file=event.target.files[0]
      event.target.value=''
      if (!file) return
      try { await this.save(file) } catch (e) { notify(e.message) }
    }
  }
  reveal(key) {
    this.openLibrary()
    this.focusKey=key
    if (this.panel.open) this.refresh()
    else this.panel.open=true
    this.summary.focus()
    this.summary.scrollIntoView({block:'nearest'})
  }
  async save(file) {
    if (!file.size || !file.type.startsWith('video/')) throw new Error('Elegí un archivo de video que se pueda reproducir.')
    const key=await this.store('readwrite',s=>s.add(file,['loop',Date.now(),crypto.randomUUID?.() || String(Math.random()),file.name]))
    if (this.panel.open) await this.refresh()
    this.notify('Loop guardado.',{label:'Ver loop',run:()=>this.reveal(key)})
  }
  async refresh() {
    const revision=this.listRevision=(this.listRevision || 0)+1
    try {
      const keys=await this.store('readonly',s=>s.getAllKeys(IDBKeyRange.bound(['loop'],['loop',[]])))
      if (revision!==this.listRevision) return
      let focus
      this.root.replaceChildren(...keys.reverse().map(key=>{
        const row=document.createElement('div'), play=document.createElement('button'), download=document.createElement('button')
        row.className='loop-row'
        const title=document.createElement('strong')
        title.textContent=key[3]
        const remove=document.createElement('button')
        play.textContent='Usar'
        play.setAttribute('aria-label','Usar '+key[3])
        play.setAttribute('aria-describedby','sectorTarget')
        download.textContent='Descargar'
        download.setAttribute('aria-label','Descargar '+key[3])
        remove.textContent='Eliminar'
        const get=async()=>{
          const file=await this.store('readonly',s=>s.get(key))
          if (!file) throw new Error('Este loop ya no está en la biblioteca.')
          return file
        }
        play.onclick=async()=>{
          const target=this.destination()
          const version=this.documentVersion()
          play.disabled=true
          try {
            const file=await get()
            if (version===this.documentVersion()) await this.use(file,target)
          } catch (e) { this.notify(e.message) }
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
        row.append(title,play,download,remove)
        if (this.focusKey && indexedDB.cmp(key,this.focusKey)===0) focus=play
        return row
      }))
      if (!keys.length) this.root.textContent='Tus grabaciones van a aparecer acá.'
      if (this.focusKey && this.panel.open) {
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
