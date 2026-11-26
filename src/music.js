class MusicPlayer {
  constructor(sound, changed) {
    this.sound = sound
    this.changed = changed
    this.voices = new Set()
    this.session = 0
  }
  async play(score, source) {
    if (this.playing) {
      this.pending = {score,source}
      return
    }
    const session = ++this.session
    await this.sound.start()
    if (session!==this.session) return
    const {context,output,analyser} = this.sound
    if (context.state!=='running') throw new Error('El navegador no pudo iniciar la salida de audio.')
    this.bus = context.createGain()
    this.bus.gain.value = .74
    this.bus.connect(output)
    this.bus.connect(analyser)
    this.playing = true
    this.nextAt = context.currentTime + .04
    this.selectScore(score,source)
    this.timer = window.setInterval(()=>this.tick(),25)
    this.tick()
  }
  selectScore(score, source) {
    this.previousClock = this.clock
    this.clock = {at:this.nextAt,bpm:score.bpm}
    this.score = score
    this.source = source
    this.step = 0
    this.pending = null
    this.changed()
  }
  beat() {
    if (!this.playing || !this.clock) return 0
    const now = this.sound.context.currentTime
    const clock = now<this.clock.at && this.previousClock ? this.previousClock : this.clock
    return Math.max(0,(now-clock.at)*clock.bpm/60)
  }
  tick() {
    if (!this.playing) return
    const now = this.sound.context.currentTime
    const duration = () => 240/(this.score.bpm*this.score.subdivision)
    if (this.nextAt<now-.025) {
      // Skip missed steps after tab throttling instead of playing a burst of late notes.
      const missed = Math.ceil((now-this.nextAt)/duration())
      this.step = (this.step+missed)%this.score.length
      this.nextAt += missed*duration()
    }
    while (this.nextAt < now+.12) {
      const stepsPerBeat = Math.max(1,this.score.subdivision/4)
      if (this.pending && this.step%stepsPerBeat===0)
        this.selectScore(this.pending.score,this.pending.source)
      const length = duration()
      for (const track of this.score.tracks) {
        const event = track.events[this.step%track.events.length]
        if (event && track.vol) this.playStep(track,event,Math.max(now,this.nextAt),length)
      }
      this.step = (this.step+1)%this.score.length
      this.nextAt += length
    }
  }
  playStep(track, event, at, stepLength) {
    if (event.frequencies) {
      const volume = track.vol/Math.sqrt(event.frequencies.length)
      for (const frequency of event.frequencies) {
        const osc = this.sound.context.createOscillator()
        osc.type = track.instrument
        osc.frequency.value = frequency
        this.voice(osc,track,volume,at,stepLength*track.gate,'lowpass')
      }
    } else if (track.instrument==='kick') {
      const osc = this.sound.context.createOscillator()
      osc.frequency.setValueAtTime(track.pitch*2.7,at)
      osc.frequency.exponentialRampToValueAtTime(track.pitch,at+.08)
      this.voice(osc,track,track.vol*event.accent,at,stepLength*track.gate,'lowpass')
    } else {
      const {context} = this.sound
      if (!this.noise) {
        this.noise = context.createBuffer(1,context.sampleRate,context.sampleRate)
        const data = this.noise.getChannelData(0)
        for (let i=0;i<data.length;i++) data[i] = Math.random()*2-1
      }
      const noise = context.createBufferSource()
      noise.buffer = this.noise
      noise.loop = true
      this.voice(noise,track,track.vol*event.accent*.75,at,stepLength*track.gate,
        track.instrument==='hat' ? 'highpass' : 'bandpass')
    }
  }
  voice(source, track, volume, at, duration, filterType) {
    const {context} = this.sound
    const gain = context.createGain(), filter = context.createBiquadFilter()
    filter.type = filterType
    filter.frequency.value = Math.min(track.cutoff,context.sampleRate*.48)
    const pan = context.createStereoPanner?.()
    source.connect(filter)
    filter.connect(gain)
    if (pan) { pan.pan.value=track.pan; gain.connect(pan); pan.connect(this.bus) }
    else gain.connect(this.bus)
    const attack = Math.min(Math.max(.002,track.attack),duration*.72)
    const release = Math.max(.004,track.release)
    gain.gain.setValueAtTime(.0001,at)
    gain.gain.exponentialRampToValueAtTime(Math.max(.0001,volume),at+attack)
    if (track.instrument==='kick' || track.instrument==='snare' || track.instrument==='hat')
      gain.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*.2),at+duration)
    else gain.gain.setValueAtTime(Math.max(.0001,volume),at+duration)
    gain.gain.exponentialRampToValueAtTime(.0001,at+duration+release)
    const voice = {source,nodes:[source,filter,gain,...(pan ? [pan] : [])]}
    this.voices.add(voice)
    source.onended = ()=>this.release(voice)
    source.start(at)
    source.stop(at+duration+release+.008)
  }
  release(voice) {
    this.voices.delete(voice)
    for (const node of voice.nodes) node.disconnect()
  }
  stop() {
    ++this.session
    clearInterval(this.timer)
    if (!this.playing) return
    this.playing = false
    this.pending = null
    this.bus.disconnect()
    for (const voice of this.voices) {
      voice.source.onended = null
      voice.source.stop()
      this.release(voice)
    }
    this.changed()
  }
}

class MusicDesk {
  constructor(sound, { readTempo, writeTempo, readSaved, writeSaved }) {
    this.sound = sound
    this.readTempo = readTempo
    this.writeTempo = writeTempo
    this.readSaved = readSaved
    this.writeSaved = writeSaved
    this.player = new MusicPlayer(sound,()=>this.playbackChanged())
    const $ = id => document.getElementById(id)
    this.editor = $('musicSource')
    this.statusLine = $('musicStatus')
    this.playButton = $('musicPlay')
    this.stopButton = $('musicStop')
    this.syncButton = $('musicSync')
    const saved = this.readSaved()
    this.editor.value = validMusicDraft(saved) ? saved.source : musicExample.source
    this.sync = validMusicDraft(saved) && saved.sync
    this.authored = validMusicDraft(saved)
    this.editor.oninput = ()=>{
      this.authored = true
      this.status('')
      this.render()
    }
    this.playButton.onclick = ()=>this.play()
    this.stopButton.onclick = ()=>this.stop()
    this.editor.onkeydown = event=>{
      if (event.key==='Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        event.stopPropagation()
        this.play()
      }
    }
    this.syncButton.onclick = ()=>{
      this.sync = !this.sync
      this.authored = true
      this.followTempo()
      this.render()
    }
    $('musicSave').onclick = ()=>{
      this.authored = true
      const ok = this.writeSaved(this.capture())
      this.status(ok ? 'Partitura guardada en este navegador.' : 'El navegador no pudo guardar la partitura.',!ok)
    }
    $('musicRestore').onclick = ()=>{
      const draft = this.readSaved()
      if (validMusicDraft(draft)) this.restore(draft)
      else this.status('Todavía no guardaste una partitura.',true)
    }
    $('musicDownload').onclick = ()=>{
      const link = document.createElement('a')
      const url = URL.createObjectURL(new Blob([this.editor.value],{type:'text/plain;charset=utf-8'}))
      link.href=url
      link.download='partitura.fosmus'
      link.click()
      setTimeout(()=>URL.revokeObjectURL(url),2000)
    }
    $('musicImport').onclick = ()=>$('musicFile').click()
    $('musicFile').onchange = async event=>{
      const [file] = event.target.files
      event.target.value = ''
      if (!file) return
      if (file.size>musicMaxSourceLength*4) return this.status('La partitura es demasiado larga.',true)
      try {
        const source = await file.text()
        parseMusicScore(source)
        this.setSource(source,'Partitura importada. Tocá Reproducir para escuchar.')
      } catch (error) { this.status(error.message,true) }
    }
    $('musicSample').onclick = ()=>this.setSource(musicExample.source,'Muestra cargada. Tocá Reproducir para escuchar.')
    $('musicCopyVisual').onclick = async ()=>{
      try {
        await navigator.clipboard.writeText(musicExample.visual)
        this.status('Sketch copiado. Pegalo en Código para usarlo.')
      } catch {
        const visual = $('musicVisualSource')
        visual.hidden = false
        visual.value = musicExample.visual
        visual.focus()
        visual.select()
      }
    }
    this.render()
  }
  get playing() { return !!this.player.playing }
  beat() { return this.player.beat() }
  capture() {
    return this.authored ? {source:this.editor.value,sync:this.sync} : undefined
  }
  restore(draft) {
    if (draft==null) {
      this.stop(false)
      this.sync=false
      this.authored=false
      this.editor.value=''
      this.status('')
      this.render()
      return
    }
    if (!validMusicDraft(draft)) return
    this.stop(false)
    this.sync = draft.sync
    this.setSource(draft.source,'Partitura recuperada. Tocá Reproducir para escuchar.')
  }
  setSource(source, message) {
    this.editor.value = source
    this.authored = true
    this.status(message)
    this.render()
  }
  status(message, error = false) {
    this.statusLine.textContent = message
    this.statusLine.dataset.error = error
    this.editor.setAttribute('aria-invalid',String(error))
  }
  async play() {
    if (this.starting) return
    const source = this.editor.value
    let score
    try { score=parseMusicScore(source) }
    catch (error) { this.status(error.message,true); return }
    this.authored = true
    if (this.playing) {
      if (source!==this.player.source) {
        await this.player.play(score,source)
        this.status('Los cambios entran en el próximo pulso.')
      }
      return
    }
    const request = Symbol()
    this.startRequest = request
    this.starting = true
    this.render()
    try { await this.player.play(score,source) }
    catch (error) {
      if (this.startRequest===request) this.status(error.message || 'No se pudo reproducir la partitura.',true)
    } finally {
      if (this.startRequest===request) {
        this.startRequest = null
        this.starting = false
        this.render()
      }
    }
  }
  stop(report = true) {
    this.startRequest = null
    this.starting = false
    this.player.stop()
    this.followTempo()
    if (report) this.status('Música detenida.')
    this.render()
  }
  followTempo() {
    if (this.sync && this.playing) {
      if (this.savedTempo===undefined) this.savedTempo=this.readTempo()
      this.syncedTempo=this.player.score.bpm
      this.writeTempo(this.syncedTempo)
    } else if (this.savedTempo!==undefined) {
      if (this.readTempo()===this.syncedTempo) this.writeTempo(this.savedTempo)
      this.savedTempo=this.syncedTempo=undefined
    }
  }
  playbackChanged() {
    this.followTempo()
    if (this.playing && this.statusLine.dataset.error!=='true') this.status('En reproducción · '+this.player.score.bpm+' BPM')
    this.render()
    this.sound.change()
  }
  render() {
    const modified = this.editor.value !== (this.player.pending?.source ?? this.player.source)
    this.playButton.disabled = this.starting || (this.playing && !modified)
    this.playButton.textContent = this.starting ? 'Preparando…' : this.playing ?
      (modified ? 'Aplicar música' : 'Reproduciendo') : 'Reproducir'
    this.stopButton.hidden = !this.playing && !this.starting
    this.syncButton.setAttribute('aria-pressed',String(this.sync))
  }
}
