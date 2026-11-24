// Files follow a length-prefixed UTF-8 manifest. Large videos stay Blob slices.
const compositionMagic = 'FOSFENO1\n'
function packComposition(project) {
  const blobs = [], assets = []
  function index(file) {
    if (!file) return null
    const existing = blobs.indexOf(file)
    if (existing !== -1) return existing
    blobs.push(file)
    assets.push({name:file.name, type:file.type, size:file.size})
    return blobs.length-1
  }
  const manifest = {...project, input:index(project.input),
    regions:project.regions.map(r=>({...r,file:index(r.file)})), assets}
  const json = new TextEncoder().encode(JSON.stringify(manifest))
  const length = new DataView(new ArrayBuffer(4))
  length.setUint32(0,json.byteLength)
  return new Blob([compositionMagic,length,json,...blobs],{type:'application/octet-stream'})
}

async function unpackComposition(blob) {
  const invalid = () => { throw new Error('El archivo está incompleto o tiene una configuración de Fosfeno incompatible.') }
  const header = compositionMagic.length+4
  if (blob.size < header || await blob.slice(0,header-4).text() !== compositionMagic) invalid()
  const bytes = new DataView(await blob.slice(header-4,header).arrayBuffer()).getUint32(0)
  if (bytes > 32*1024*1024 || bytes+header > blob.size) invalid()
  let p
  try { p = JSON.parse(await blob.slice(header,header+bytes).text()) } catch { invalid() }
  if (!p || typeof p.name !== 'string' || !p.name.trim() || typeof p.code !== 'string' ||
      !Array.isArray(p.regions) || !Array.isArray(p.assets)) invalid()
  if (p.kind === 'operator') {
    if (p.assets.length || p.regions.length || header+bytes !== blob.size ||
        !Array.isArray(p.definitions) || !p.definitions.every(d=>typeof d === 'string') ||
        !Array.isArray(p.origin) || !p.origin.every(line=>typeof line === 'string' && line.startsWith('//') && !/[\r\n\u2028\u2029]/.test(line))) invalid()
    try {
      const tree=acorn.parse('base'+p.code,{ecmaVersion:'latest'})
      const call=tree.body[0]?.expression
      if (tree.body.length!==1 || call?.type!=='CallExpression' ||
          call.callee.object?.name!=='base' || call.callee.computed) invalid()
      for (const d of p.definitions) {
        const def=acorn.parse(d,{ecmaVersion:'latest'}).body
        if (def.length!==1 || def[0].expression?.callee?.name!=='setFunction') invalid()
      }
    } catch { invalid() }
    return p
  }
  if (p.kind != null && p.kind!=='composition') invalid()
  let offset = header+bytes
  const files = p.assets.map(a => {
    if (!a || !Number.isSafeInteger(a.size) || a.size < 0 || offset+a.size > blob.size ||
        typeof a.name !== 'string' || typeof a.type !== 'string' || !/^(image|video)\//.test(a.type)) invalid()
    const file = new File([blob.slice(offset,offset+a.size)],a.name,{type:a.type})
    offset += a.size
    return file
  })
  if (offset !== blob.size) invalid()
  const fileAt = i => i === null ? null : Number.isInteger(i) && files[i] ? files[i] : invalid()
  const finite = (v,min,max) => Number.isFinite(v) && v>=min && v<=max
  const ids = new Set()
  for (const r of p.regions) {
    if (!r || !Number.isSafeInteger(r.id) || r.id < 1 || ids.has(r.id) || !sectorShapes.includes(r.shape) ||
        !Array.isArray(r.points) || r.points.length<3 || r.points.length>4096 ||
        !r.points.every(v=>Array.isArray(v) && v.length===2 && v.every(n=>finite(n,0,1))) ||
        !['file','sketch','s0'].includes(r.source) || typeof r.visible !== 'boolean' || typeof r.paint !== 'boolean' ||
        (r.opacity != null && !finite(r.opacity,0,1)) ||
        (r.brushSize != null && !finite(r.brushSize,0,1)) ||
        !Array.isArray(r.fx) || !r.fx.every(f=>f && Object.hasOwn(sectorEffects,f.name) &&
          finite(f.value,sectorEffects[f.name][1],sectorEffects[f.name][2]))) invalid()
    const [, ,w,h] = regionBounds(r.points)
    if (!w || !h || (r.source==='file') !== (r.file!==null)) invalid()
    r.file = fileAt(r.file)
    ids.add(r.id)
  }
  const m = p.settings
  if (m?.resolution != null && (!Array.isArray(m.resolution) || m.resolution.length!==2 ||
      !m.resolution.every(n=>Number.isSafeInteger(n) && n>0 && n<=32768))) invalid()
  if (!m || !['0','1','2','3','all'].includes(m.output) ||
      !['auto','540','720','1080'].includes(m.quality) || !finite(m.brush,0,1) ||
      !finite(m.sensitivity,.2,3) || !Number.isFinite(m.bpm) || typeof m.painting!=='boolean' ||
      typeof m.internalPulse!=='boolean' || typeof m.autoMix!=='boolean' ||
      !['libre','x','y','radial'].includes(m.fold) || typeof m.seed!=='string') invalid()
  return {...p,input:fileAt(p.input)}
}

class CompositionLibrary {
  constructor({sectors,capture,activate,notify}) {
    this.sectors = sectors
    this.activate = activate
    this.notify = notify
    const $ = id => document.getElementById(id)
    this.root = $('projectList')
    $('projectLibrary').ontoggle = () => {
      if ($('projectLibrary').open) this.list().catch(e=>notify(e.message))
    }
    $('projectSave').onclick = () => this.task(async () => {
      const project = capture()
      await this.add(project.name,packComposition(project))
      notify('Composición guardada. Abrí su nombre para descargarla.')
    })
    $('projectImport').onclick = () => $('projectFile').click()
    $('projectFile').onchange = event => {
      const file = event.target.files[0]
      event.target.value = ''
      if (file) this.task(async () => {
        const project = await unpackComposition(file)
        await this.add(project.name,file,project.kind)
        notify(project.kind==='operator' ? 'Operador importado. Insertar lo agrega a tu cadena.' : 'Importada. Activar lleva su código y sus sectores a la salida.')
      })
    }
  }
  async task(fn) {
    if (this.busy) return
    this.busy = true
    try { await fn() } catch (e) { this.notify(e.message) } finally { this.busy = false }
  }
  async add(name,blob,kind='composition') {
    const key = ['obra', Date.now(), crypto.randomUUID?.() || String(Math.random()), name, kind]
    await this.sectors.store('readwrite',s=>s.add(blob,key))
    await this.list()
  }
  async list() {
    const keys = await this.sectors.store('readonly',s=>s.getAllKeys(IDBKeyRange.bound(['obra'],['obra',[]])))
    const rows = keys.reverse().map(key => {
      const row = document.createElement('details'), name = document.createElement('summary')
      const actions = document.createElement('div')
      name.textContent = key[3]
      actions.className = 'segments'
      row.append(name,actions)
      const get = () => this.sectors.store('readonly',s=>s.get(key))
      const activateLabel=key[4]==='operator' ? 'Insertar' : 'Activar'
      for (const label of [activateLabel,'Descargar','Eliminar']) {
        const b = document.createElement('button')
        b.textContent = label
        b.onclick = () => this.task(async () => {
          if (label === activateLabel) await this.activate(await unpackComposition(await get()))
          if (label === 'Descargar') {
            const file = await get(), link = document.createElement('a')
            const url = URL.createObjectURL(file)
            link.href=url; link.download=key[3]+'.fosfeno'; link.click()
            setTimeout(()=>URL.revokeObjectURL(url),30000)
          }
          if (label === 'Eliminar') {
            if (b.textContent !== 'Confirmar') { b.textContent = 'Confirmar'; return }
            await this.sectors.store('readwrite',s=>s.delete(key))
            await this.list()
          }
        })
        actions.append(b)
      }
      return row
    })
    this.root.replaceChildren(...rows)
  }
}
