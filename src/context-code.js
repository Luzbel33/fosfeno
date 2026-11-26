// The background editor owns the main Hydra runtime. Other programs are compiled
// in SectorProgram, where outputs, operator definitions and undo belong to the layer.
class StudioCodeBrowser {
  constructor({base,desk,stack,baseInfo,signal,project,live,returnMap,writeEffectCode,select}) {
    Object.assign(this,{base,desk,stack,baseInfo,signal,project,live,writeEffectCode,select})
    const $=id=>document.getElementById(id)
    this.page=$('editorPage'); this.box=$('contextCodeBox'); this.list=$('codeDestinationList')
    this.menu=$('codeDestinations'); this.button=$('codeDestination'); this.status=$('contextCodeStatus')
    this.back=$('codeReturnMap'); this.back.onclick=()=>{this.flush();returnMap()}
    this.exportButton=$('exportJS'); this.fileline=this.exportButton.parentElement
    this.cm=CodeMirror.fromTextArea($('contextCode'),{
      mode:'javascript',lineNumbers:true,lineWrapping:true,matchBrackets:true,indentUnit:2,tabSize:2,
      screenReaderLabel:'Código o configuración de la selección'
    })
    const comment=editor=>{if(this.current?.write) editor.toggleComment()}
    this.cm.addKeyMap({'Ctrl-/':comment,'Cmd-/':comment,'Ctrl-Shift-S':()=>this.download(),'Cmd-Shift-S':()=>this.download()})
    this.current=null; this.external=null; this.pending=null
    this.cm.on('change',()=>{
      if (this.syncing || !this.current?.write) return
      this.current.write(this.cm.getValue())
      this.pending=this.current
      clearTimeout(this.timer)
      this.timer=setTimeout(()=>this.flush(),350)
      this.status.textContent=this.live()?'Editando…':'Preparado · Enviar a salida para proyectar.'
      this.project()
    })
    this.cm.on('cursorActivity',()=>{if (!this.syncing && this.scoped) this.project()})
    this.menu.ontoggle=()=>{if (this.menu.open) this.fill()}
    document.addEventListener('pointerdown',e=>{if(this.menu.open && !this.menu.contains(e.target)) this.menu.open=false})
    this.menu.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();this.menu.open=false;this.button.focus()}}
  }
  get scoped(){return !!this.current && this.current.key!=='base'}
  get projected(){return this.scoped && this.current.format!=='json' && !this.page.hidden}
  flush() {
    clearTimeout(this.timer)
    const entry=this.pending
    if (!entry) return
    this.pending=null
    if (this.desk.containsLayer(entry.layer) && (!entry.effect || entry.layer.fx.includes(entry.effect))) this.desk.changed()
    this.updateStatus()
  }
  describe() {
    const base=this.baseInfo()
    const entries=[{key:'base',name:'Fondo · '+(base.present?base.name:'Vacío'),title:base.name || 'Fondo',
      format:'js',read:()=>this.base.getValue(),ref:{sectorId:0,layerId:0,kind:'base'}}]
    for (const region of [this.desk.principal,...this.desk.regions]) for (const layer of sectorLayers(region)) {
      const layerId=sectorLayerId(layer), prefix=region.id?sectorLabel(region):'Mezcla principal'
      const group=layer.groupId && sectorLayers(region).find(s=>s.layerId===layer.groupId)
      const path=[prefix,group && sectorLayerLabel(group),region.id && sectorLayerLabel(layer)].filter(Boolean).join(' › ')
      const source=layer.source==='s0'?this.signal():layer.file?.current
      const ref={sectorId:region.id,layerId}, root=region.id+'/'+layerId+'/'
      const item=(id,title,kind,format,read,options={})=>entries.push({key:root+id,title,name:path+' › '+title,
        layer,groupId:layer.groupId,format,read,ref:{...ref,kind},...options})
      const json=get=>()=>JSON.stringify(get(),null,2)
      const media={tipo:layer.source,entrada:source?.kind,archivo:source?.file?.name,formato:source?.file?.type,
        uso:source?.role,vista3D:layer.modelView || source?.modelView}
      item('code',layer.code?'Código de capa':'Nuevo código de capa','code','js',()=>layer.code || '',
        {empty:!layer.code,write:text=>{layer.code=text},hint:'Programa de capa · Usá return base() o una cadena con .out().'})
      if (source || !['none','group','sketch'].includes(layer.source) || region.id && layer.source==='sketch') {
        item('source',source?.file?.name || (layer.source==='sketch'?'Fuente · Mezcla principal':'Fuente · '+layer.source),
          'source','json',json(()=>media))
      }
      if (layer.paint) item('paint','Pinceladas','paint','json',json(()=>({activas:layer.paint,grosor:layer.brushSize,
        velocidad:layer.brushSpeed,detalle:layer.brushDetail,inversas:!!layer.brushInverse})))
      for (const [index,effect] of layer.fx.entries()) {
        const effectId=this.stack.effectKey(effect), id='effect/'+effectId
        const effectRef={...ref,kind:'effect',effectId,index}
        const opts={effect,ref:effectRef}
        if (['operator','library'].includes(effect.kind)) {
          item(id,effect.name,'effect','js',()=>effect.code,{...opts,write:text=>this.writeEffectCode(effect,text),
            hint:effect.kind==='operator'?'Operador de la capa · La cadena empieza con un punto.':'Sketch de biblioteca · Esta copia pertenece a la capa.'})
          for (const [i,definition] of (effect.definitions || []).entries()) {
            const name=definition.match(/name\s*:\s*['"]([^'"]+)/)?.[1]
            item(id+'/def/'+i,'Definición · '+(name || i+1),'effect','js',()=>effect.definitions[i],
              {...opts,write:text=>{effect.definitions=effect.definitions.map((d,n)=>n===i?text:d)},hint:'Definición Hydra del operador.'})
          }
        } else {
          const params=sectorEffects[effect.name]
          item(id,effect.name,'effect','json',json(()=>({efecto:effect.name,valor:effect.value,activo:effect.enabled!==false,
            mínimo:params?.[1],máximo:params?.[2],paso:params?.[3],funciónHydra:params?.[4]?.toString()})),opts)
        }
      }
      if (region.id || layerId) item('settings','Configuración de '+(layer.source==='group'?'grupo':'capa'),layer.source==='group'?'group':'layer',
        'json',json(()=>({nombre:sectorLayerLabel(layer),opacidad:layer.opacity ?? 1,visible:!layer.hidden,fuente:media,
          ...(layer===region?{forma:region.shape,puntos:region.points,estilo:region.style}:{}),
          efectos:layer.fx.map(f=>({nombre:f.name,tipo:f.kind || 'parámetro',activo:f.enabled!==false}))})))
    }
    if (this.external) entries.unshift(this.external)
    return entries
  }
  preferred(entries,ref) {
    if (this.external && ref?.language==='json') return this.external
    const base=entries.find(e=>e.key==='base')
    if (!ref || ref.kind==='base') return base
    const same=entries.filter(e=>e.key!=='base' && e.ref?.sectorId===ref.sectorId)
    const direct=same.filter(e=>e.ref.layerId===(ref.layerId ?? 0))
    const exact=direct.find(e=>e.ref.kind===ref.kind && (ref.kind!=='effect' ||
      (ref.effectId ? e.ref.effectId===ref.effectId : e.ref.index===ref.index)))
    if (exact && !['group','layer','sector'].includes(ref.kind)) return exact
    const scope=ref.kind==='sector'?same:ref.kind==='group'?[...direct,...same.filter(e=>e.groupId===ref.layerId)]:direct
    const populated=items=>items.find(e=>e.format==='js' && !e.empty) || items.find(e=>['source','paint','effect'].includes(e.ref.kind))
    return populated(scope) || (!ref.sectorId && (this.baseInfo().present?base:populated(entries.filter(e=>e.ref && e!==base)) || base)) ||
      scope.find(e=>e.format==='json') || scope[0] || base
  }
  open(ref,fromMap=false) {
    this.flush(); this.back.hidden=!fromMap
    this.external=ref?.language==='json'?{key:'map-object',title:ref.title,name:'Mapeo › '+ref.title,format:'json',
      read:()=>ref.text,hint:ref.description}:null
    this.scope=ref; this.chosen=false
    const entries=this.describe()
    this.show(this.preferred(entries,ref))
  }
  refresh() {
    if (!this.current || this.current.key==='map-object' || this.page.hidden) return
    const entries=this.describe(), previous=this.current
    let next=entries.find(e=>e.key===previous.key)
    if (!next || !this.chosen) next=this.preferred(entries,this.scope)
    this.show(next)
    if (this.menu.open) this.fill(entries)
  }
  show(entry) {
    if (!entry) return
    const changed=this.current?.key!==entry.key
    this.current=entry; this.button.textContent=entry.name; this.button.title=entry.name
    document.querySelector('#codeHeading h2').textContent=entry.format==='json'?'Configuración':'Código Hydra'
    this.page.toggleAttribute('data-scoped',this.scoped)
    const host=this.scoped?this.menu.parentElement:this.fileline
    if (this.exportButton.parentElement!==host) host.append(this.exportButton)
    const download=entry.format==='json'?'Descargar configuración JSON':this.scoped?'Descargar código de la selección':'Descargar sketch'
    this.exportButton.setAttribute('aria-label',download); this.exportButton.title=download
    this.box.hidden=this.status.hidden=!this.scoped
    if (this.scoped) {
      const value=entry.read()
      if(changed || this.cm.getValue()!==value) {
        this.syncing=true
        try {this.cm.setValue(value);this.cm.clearHistory()}
        finally {this.syncing=false}
      }
      if(changed) {
        this.cm.setOption('readOnly',!entry.write)
        this.cm.setOption('mode',entry.format==='json'?{name:'javascript',json:true}:'javascript')
      }
      this.updateStatus()
    }
    if (changed) {requestAnimationFrame(()=>(this.scoped?this.cm:this.base).refresh());this.project()}
  }
  updateStatus() {
    if (!this.scoped || this.pending) return
    this.status.textContent=this.current.format==='json'?'Configuración nativa · Sólo lectura. '+(this.current.hint || '') :
      (this.current.hint || '')+(this.desk.dirty && !this.live()?' Pendiente de enviar.':'')
  }
  fill(entries=this.describe()) {
    const scope=this.scope
    const near=entry=>scope && entry.ref && scope.sectorId===entry.ref.sectorId &&
      (scope.kind==='sector' || scope.layerId===entry.ref.layerId || scope.kind==='group' && scope.layerId===entry.groupId)
    const sorted=[...entries.filter(near),...entries.filter(e=>!near(e))]
    this.list.replaceChildren(...sorted.map(entry=>{
      const b=document.createElement('button');b.type='button';b.textContent=entry.name
      b.setAttribute('aria-pressed',String(this.current?.key===entry.key))
      b.onclick=()=>{
        this.flush()
        if (entry.ref) {this.select(entry.ref);this.scope=entry.ref}
        this.chosen=true;this.show(entry);this.menu.open=false;this.button.focus()
      }
      return b
    }))
  }
  download() {
    this.flush()
    const a=document.createElement('a')
    a.href=URL.createObjectURL(new Blob([this.current.read()],{type:this.current.format==='json'?'application/json':'text/javascript'}))
    a.download=this.current.title+'.'+this.current.format; a.click()
    setTimeout(()=>URL.revokeObjectURL(a.href),30000)
  }
}
