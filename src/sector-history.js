class SectorHistory {
  constructor(desk, { notify = message => desk.note(message) } = {}) {
    this.desk = desk
    this.notify = notify
    this.past = []
    this.future = []
    this.fileIds = new WeakMap()
    this.nextFileId = 0
    this.reset()
  }

  entry() {
    const regions = this.desk.snapshot()
    const signature = JSON.stringify(regions, (key, value) => {
      if (!(value instanceof File)) return value
      if (!this.fileIds.has(value)) this.fileIds.set(value, ++this.nextFileId)
      return this.fileIds.get(value)
    })
    return {
      regions, signature, sector: this.desk.selected()?.id,
      layer: this.desk.target().layerId
    }
  }

  reset() {
    this.past.length = 0
    this.future.length = 0
    this.current = this.entry()
  }

  remember() {
    if (this.restoring) return
    const next = this.entry()
    if (this.current.signature === next.signature) {
      this.current.sector = next.sector
      this.current.layer = next.layer
      return
    }
    this.past.push(this.current)
    if (this.past.length > 25) this.past.shift()
    this.current = next
    this.future.length = 0
  }

  undo() { return this.step(this.past, this.future, 'Cambio deshecho.') }
  redo() { return this.step(this.future, this.past, 'Cambio rehecho.') }

  // Keep the playhead when undoing a move of a file that is still playing.
  async step(from, to, message) {
    if (this.busy || this.desk.drag) return
    this.remember()
    const next = from.at(-1), previous = this.current
    if (!next) return
    this.busy = true
    try {
      const prepared = await this.desk.prepare(next.regions,true)
      if (this.current !== previous) {
        this.release(prepared)
        return this.notify('La pila cambió mientras se cargaban los archivos. Volvé a intentar.')
      }
      this.restoring = true
      this.desk.groupFor = null
      this.desk.groupSelection?.clear()
      this.desk.install(prepared, next.sector)
      if (!next.sector) this.desk.id = null
      const region = this.desk.selected()
      if (region) this.desk.layerSelection.set(region, next.layer ?? 0)
      this.desk.refresh()
      from.pop()
      to.push(previous)
      this.current = this.entry()
      this.notify(message)
    } catch (error) {
      this.notify(error.message)
    } finally {
      this.restoring = false
      this.busy = false
    }
  }

  capture(kind) {
    const target = this.desk.target(), id = this.desk.selected()?.id
    const region = id && this.desk.snapshot(false).find(item => item.id === id)
    if (!region || this.desk.drag) return false
    if (kind==='sector' || (kind!=='layer' && !target.layerId)) return {region}
    const group = target.source === 'group'
    const { id: sector, shape, points, visible, style, layers, ...base } = region
    const include = layer => layer.layerId === target.layerId || (group && layer.groupId === target.layerId)
    return {
      layers: [base, ...(layers || [])].filter(include),
      groupId: group ? target.layerId : null,
      label: group ? 'Grupo' : 'Capa'
    }
  }

  async paste(item=this.clipboard) {
    if (this.busy || this.desk.drag || !item) return
    const targetRegion = this.desk.selected()
    if (!item.region && !targetRegion) return this.notify('Seleccioná un sector para pegar esta capa.')
    this.busy = true
    try {
      if (item.region) await this.pasteSector(item.region)
      else await this.pasteLayers(item, targetRegion, this.desk.target())
    } catch (error) {
      this.notify(error.message)
    } finally {
      this.busy = false
    }
  }

  async pasteSector(source) {
    const version = this.desk.documentVersion
    const [x, y, width, height] = regionBounds(source.points)
    const points=dragRegionPoints(source.points,-1,x+width>.97 ? -.03 : .03,y+height>.97 ? -.03 : .03)
    const [region] = await this.desk.prepare([{ ...source, points }])
    if (version !== this.desk.documentVersion) {
      this.release([region])
      return
    }
    region.id = this.desk.nextId++
    this.desk.regions.push(region)
    this.desk.id = region.id
    this.desk.mode = null
    this.track([region, ...(region.layers || [])])
    this.desk.changed()
    this.notify('Sector pegado.')
  }

  async pasteLayers(item, region, target) {
    const [prepared] = await this.desk.prepare([{ fx: [], layers: item.layers }])
    if (!this.desk.regions.includes(region)) {
      this.release([prepared])
      return this.notify('El sector de destino ya no existe.')
    }
    const layers = region.layers ??= []
    let id = layers.reduce((last, layer) => Math.max(last, layer.layerId), 0)
    const members = prepared.layers.map(layer => ({ ...layer, layerId: ++id }))
    const group = item.groupId != null && members.find((layer, index) => item.layers[index].layerId === item.groupId)
    const requestedGroup = target.source === 'group' ? target.layerId : target.groupId
    const siblingGroup = layers.find(layer => layer.source === 'group' && layer.layerId === requestedGroup)?.layerId
    for (const member of members) {
      member.groupId = group ? (member === group ? undefined : group.layerId) : siblingGroup
    }
    layers.push(...members)
    this.desk.id = region.id
    this.desk.layerSelection.set(region, (group || members[0]).layerId)
    this.track(members)
    this.desk.changed()
    this.notify(item.label + (group ? ' pegado.' : ' pegada.'))
  }

  track(layers) {
    for (const layer of layers) if (layer.file) this.desk.files.add(layer.file)
  }

  release(regions) {
    for (const region of regions) {
      for (const layer of [region, ...(region.layers || [])]) layer.file?.clear()
    }
  }
}
