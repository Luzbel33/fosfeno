function filterStudioStack(rows,base,query) {
  const normal = text=>text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()
  const words = normal(query).trim().split(/\s+/).filter(Boolean)
  if (!words.length) return null
  const matches = (...labels)=>{
    const text=normal(labels.filter(Boolean).join(' '))
    return words.every(word=>text.includes(word))
  }
  const found = new Set()
  const key = (id,layer,kind,index)=>[id,layer,kind,index].join('/')
  const aliases={image:'Foto imagen',video:'Video',loop:'Loop video',model:'Modelo 3D GLB',camera:'Cámara webcam',sketch:'Sketch'}
  for (const row of rows) {
    const sector = [row.id?'Sector':'Composición',row.name].join(' ')
    const root=key(row.id,0,'sector')
    if (matches(sector)) found.add(root)
    for (const entry of row.entries) {
      const group = entry.groupId && row.entries.find(parent=>parent.layerId===entry.groupId)
      const path = [sector,group && 'Grupo '+group.name,row.id && (entry.group?'Grupo ':'Capa ')+entry.name].filter(Boolean).join(' ')
      let showLayer = matches(path)
      const add = (kind,index,...fields)=>{
        if (!matches(path,...fields)) return
        found.add(key(row.id,entry.layerId,kind,index))
        showLayer=true
      }
      if (entry.source) add('source',null,'Fuente',entry.source,aliases[entry.sourceKind])
      if (entry.code) add('code',null,'Código Hydra programa')
      if (entry.paint) add('paint',null,'Pinceladas tratamiento')
      entry.effects.forEach((fx,i)=>add('effect',i,'Efecto',fx.name,fx.kind==='library'?'Biblioteca mezcla':fx.kind==='operator'?'Operador Hydra':''))
      if (showLayer) {
        found.add(root)
        found.add(key(row.id,entry.layerId,'layer'))
        if (group) found.add(key(row.id,group.layerId,'layer'))
      }
    }
  }
  const showBase = base.present && matches('Fondo sketch Hydra',base.name)
  if (showBase) found.add(key(0,0,'sector'))
  return {matches,showBase,any:found.size>0,has:(...args)=>found.has(key(...args))}
}

// The Studio tree and the mapping desk address the same items. Never expose live
// layer objects: mapping can keep a snapshot while the Studio edits the stack.
class StudioStack {
  constructor(desk, actions) {
    this.desk = desk
    this.actions = actions
    this.subscribers = new Set()
    this.effectIds = new WeakMap()
    this.sequence = 0
  }
  effectKey(fx) {
    if (!this.effectIds.has(fx)) this.effectIds.set(fx,++this.sequence)
    return this.effectIds.get(fx)
  }
  resolve(ref) {
    const sector = ref.sectorId === 0 ? this.desk.principal : this.desk.regions.find(r=>r.id===ref.sectorId)
    const layer = sector && sectorLayers(sector).find(l=>sectorLayerId(l)===(ref.layerId ?? 0))
    if (!layer) throw new Error('Ese destino ya no está en la composición.')
    const index = ref.effectId == null ? ref.index : layer.fx.findIndex(fx=>this.effectKey(fx)===ref.effectId)
    const effect = layer.fx[index]
    if (ref.kind==='effect' && !effect) throw new Error('Ese efecto ya no está en la capa.')
    return {sector,layer,effect,index}
  }
  active() {
    const sectorId = this.desk.selected()?.id ?? 0
    const layer = this.desk.target(), layerId = sectorLayerId(layer)
    const ref = this.cursor
    if (ref && ref.sectorId===sectorId && ref.layerId===layerId) {
      if (ref.kind==='effect') {
        const index=layer.fx.findIndex(fx=>this.effectKey(fx)===ref.effectId)
        if (index>=0) return {...ref,index}
      } else if ((ref.kind!=='source' || !['none','group'].includes(layer.source) && (sectorId || layer.source!=='sketch')) &&
          (ref.kind!=='code' || layer.code) && (ref.kind!=='paint' || layer.paint)) return ref
    }
    return {sectorId,layerId,kind:layerId ? layer.source==='group'?'group':'layer' : 'sector'}
  }
  select(ref) {
    const {sector,layer,effect,index} = this.resolve(ref)
    this.desk.id = sector.id || null
    if (sector.id) this.desk.layerSelection.set(sector,sectorLayerId(layer))
    this.cursor = {sectorId:sector.id,layerId:sectorLayerId(layer),kind:ref.kind || 'layer'}
    if (ref.kind==='effect') Object.assign(this.cursor,{index,effectId:this.effectKey(effect)})
  }
  notify() {
    if (this.scheduled || !this.subscribers.size) return
    this.scheduled = true
    queueMicrotask(()=>{
      this.scheduled = false
      const state = this.actions.snapshot()
      for (const callback of this.subscribers) callback(state)
    })
  }
  subscribe(callback) {
    this.subscribers.add(callback)
    return ()=>this.subscribers.delete(callback)
  }
  destinations(ref) {
    const {desk}=this, result=[]
    if (!desk.canMoveStackItem) return result
    const add=(label,target)=>{
      if (desk.canMoveStackItem(ref,target)) result.push({label,target})
    }
    for (const sector of [desk.principal,...desk.regions]) {
      const name=sectorLabel(sector)
      if (['layer','group'].includes(ref.kind)) {
        if (sector.id) add(name,{sectorId:sector.id,layerId:0,root:true})
        for (const layer of sector.layers || []) if (layer.source==='group')
          add(name+' · '+sectorLayerLabel(layer),{sectorId:sector.id,layerId:sectorLayerId(layer)})
        continue
      }
      for (const layer of sectorLayers(sector)) {
        const target={sectorId:sector.id,layerId:sectorLayerId(layer)}
        if (ref.sectorId!==target.sectorId || ref.layerId!==target.layerId) {
          add(name+(sector.id ? ' · '+sectorLayerLabel(layer) : ''),target)
        }
        if (sector.id && (layer===sector || layer.source==='group')) {
          const label = layer===sector ? name : name+' · '+sectorLayerLabel(layer)
          add(label+' · Nueva capa',{...target,newLayer:true})
        }
      }
    }
    return result
  }
  capabilities(ref) {
    const {sector,layer,effect,index}=this.resolve(ref), kind=ref.kind, id=sector.id
    if (kind==='base') {
      const base=this.actions.base()
      return base.present ? ['inspect','toggle','remove','library','code'] : ['library','code']
    }
    const ops=['inspect','effects','library','loop']
    if (kind!=='effect' || effect.code && ['library','operator'].includes(effect.kind)) ops.push('code')
    const clip=this.desk.history?.clipboard
    if (clip && (clip.region || clip.layers && id || clip.component==='effect' ||
        clip.component==='source' && layer.source!=='group' && ['none','sketch'].includes(layer.source) ||
        clip.component==='code' && !layer.code || clip.component==='paint' && !layer.paint)) ops.push('paste')
    if (kind==='effect' || id && ['sector','layer','group'].includes(kind)) ops.push('copy','duplicate')
    else if (['source','code','paint'].includes(kind)) ops.push('copy')
    if (layer.source!=='group') ops.push('media')
    if (id) ops.push('addLayer')
    if (kind==='sector' && id) {
      const ix=this.desk.regions.indexOf(sector)
      ops.push('toggle','remove')
      if (ix<this.desk.regions.length-1) ops.push('up')
      if (ix>0) ops.push('down')
    } else if (kind==='effect') {
      ops.push('toggle','remove')
      if (effect.kind!=='operator') ops.push('amount')
      if (index>0) ops.push('up')
      if (index<layer.fx.length-1) ops.push('down')
    } else if ((kind==='layer' || kind==='group') && id) {
      ops.push('toggle','amount')
      if (layer===sector && (layer.paint || layer.code || layer.fx.length || layer.source!=='none')) ops.push('remove')
      if (layer!==sector) {
        ops.push('remove')
        const peers=sectorPeers(sector,layer),ix=peers.indexOf(layer)
        if (ix<peers.length-1) ops.push('up')
        if (ix>0) ops.push('down')
      }
    } else if (['source','paint','code'].includes(kind)) ops.push('remove')
    if (['effect','layer','group','source','paint','code'].includes(kind) && this.destinations(ref).length) ops.push('move')
    return ops
  }
  capture(ref,layer,effect) {
    const component=ref.kind
    if (component==='effect') return {component,fx:structuredClone(effect)}
    if (component==='source') return {component,source:layer.source,file:layer.file?.current?.file,role:layer.file?.current?.role}
    if (component==='code') return {component,code:layer.code}
    if (component==='paint') return {component,settings:Object.fromEntries(['paint','brushSize','brushSpeed','brushDetail','brushInverse'].map(k=>[k,layer[k]]))}
    return this.desk.history.capture(component)
  }
  async paste(clip,ref,layer,index) {
    const desk=this.desk
    if (!clip) return
    if (!clip.component) {
      await desk.history.paste(clip)
      this.cursor=null
    } else if (clip.component==='effect') {
      const at=ref.kind==='effect' ? index+1 : layer.fx.length
      layer.fx.splice(at,0,structuredClone(clip.fx))
      this.select({...ref,kind:'effect',index:at,effectId:undefined})
      desk.changed()
    } else if (clip.component==='source') {
      if (clip.file) await desk.setFile(layer,clip.file,clip.role)
      else desk.setSource(layer,clip.source)
      this.select({...ref,kind:'source'})
    } else {
      if (clip.component==='code') layer.code=clip.code
      else Object.assign(layer,clip.settings)
      this.select({...ref,kind:clip.component})
      desk.changed()
    }
    desk.refresh()
    return this.active()
  }
  async command(action, ref=this.active(), value) {
    if (action==='undo' || action==='redo') {
      await this.desk.history[action]()
      this.notify()
      return
    }
    const {desk}=this, {sector,layer,effect,index}=this.resolve(ref)
    if (ref.kind==='effect') ref={...ref,index}
    if (action==='destinations') return this.destinations(ref)
    const allowed=this.capabilities(ref)
    if (action==='capabilities') return allowed
    if (action!=='select' && !allowed.includes(action)) throw new Error('Esa acción no está disponible para la selección.')
    this.select(ref)
    if (action==='select') { desk.refresh(); return }
    if (action==='paste') return this.paste(desk.history.clipboard,ref,layer,index)
    if (action==='copy' || action==='duplicate') {
      const clip=this.capture(ref,layer,effect)
      if (!clip) return
      if (action==='duplicate') return this.paste(clip,ref,layer,index)
      desk.history.clipboard=clip
      desk.note('Selección copiada.')
      this.notify()
      return
    }
    if (['inspect','media','code','library','loop','effects'].includes(action)) {
      desk.refresh()
      return this.actions.open(action,ref)
    }
    if (ref.kind==='base') return this.actions.baseAction(action)
    if (action==='move') {
      const target = await desk.moveStackItem({...ref,index},value)
      this.select(target)
      desk.refresh()
      return target
    }
    if (action==='addLayer') { desk.addLayer(sector,layer); desk.changed(); return }
    if (action==='amount') {
      const n=Number(value)
      if (!Number.isFinite(n)) throw new Error('Ingresá un número válido.')
      if (ref.kind==='effect') {
        const [,min,max]=effect.kind==='library' ? [0,0,1] : sectorEffects[effect.name]
        desk.effectAmount(layer,index,Math.max(min,Math.min(max,n)))
        desk.history?.remember()
        return
      }
      layer.opacity=Math.max(0,Math.min(1,n))
    } else if (action==='toggle') {
      if (ref.kind==='effect') effect.enabled=effect.enabled===false
      else if (ref.kind==='sector') sector.visible=!sector.visible
      else layer.hidden=!layer.hidden
    } else if (action==='remove') {
      if (ref.kind==='source') { desk.removeStackSource(ref); return }
      if (ref.kind==='code') layer.code=''
      else if (ref.kind==='paint') layer.paint=false
      else if (ref.kind==='effect') layer.fx.splice(index,1)
      else if (ref.kind==='sector') { document.getElementById('sectorDelete').click(); return }
      else if (layer===sector) {
        const {groupId,label,opacity,hidden} = layer
        detachSectorBase(layer)
        Object.assign(layer,{groupId,label,opacity,hidden})
      }
      else { document.getElementById('removeSectorLayer').click(); return }
    } else if (action==='up' || action==='down') {
      const delta=action==='up' ? 1 : -1
      if (ref.kind==='effect') layer.fx.splice(index-delta,0,layer.fx.splice(index,1)[0])
      else if (ref.kind==='sector') {
        const ix=desk.regions.indexOf(sector)
        desk.regions.splice(ix+delta,0,desk.regions.splice(ix,1)[0])
      } else { desk.moveLayer(delta); return }
    }
    desk.changed()
  }
}
