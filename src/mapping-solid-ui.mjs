import { solidFaces } from './mapping-solids.mjs?v=3.0'
import { poseControls } from './pose-3d.mjs?v=3.0'

export function solidInspector({activeLayer, editLayer, dirty, sources, chooseLoop, openAsset, release, error}) {
  const $=id=>document.getElementById(id)
  const root=$('mapSolidPanel'), faces=$('mapSolidFaces')
  let objectId=null, face=-1, fileTarget, marker=null, poseDraft=null, revision=0
  const stylePanels=key=>{
    for (const [name,content] of [['mapFaceColor','mapFaceColors'],['mapFaceHydra','mapFaceSources']]) {
      $(content).hidden=key!==name
      $(name).setAttribute('aria-expanded',String(key===name))
    }
  }
  const updatePose=pose=>{
    const layer=activeLayer()
    if (!layer?.solid) return
    poseDraft=null
    editLayer(layer,{solid:{...layer.solid,pose}})
  }
  const syncPose=poseControls(root,pose=>{poseDraft={id:objectId,pose}; dirty()},updatePose)
  function current(solid) {
    if (!poseDraft || activeLayer()?.solid!==solid) return solid
    return {...solid,pose:poseDraft.pose}
  }
  function target() {return {id:objectId,face,version:revision}}
  function matches(t) {return activeLayer()?.id===t.id && t.face===face && t.version===revision}
  function assign(material,t=target()) {
    const layer=activeLayer()
    if (!layer?.solid || !matches(t)) return
    stylePanels(null)
    const faces=layer.solid.faces.map((existing,i)=>t.face<0 || t.face===i ? material : existing)
    editLayer(layer,{solid:{...layer.solid,faces}})
  }
  function pick(id,index) {
    if (id!==objectId || index!==face) {
      revision++; poseDraft=null; stylePanels(null)
      objectId=id; face=index
    }
  }
  function description(material) {
    if (material.type==='file') return (material.role==='loop'?'Loop · ':'')+material.file.name
    if (material.type==='hydra') return material.sector ? (sources().find(r=>r.id===material.sector)?.name || 'Sector ausente') : 'Hydra en vivo'
    return material.color.toUpperCase()
  }
  function sync(layer) {
    root.hidden=layer?.kind!=='solid'
    if (root.hidden) {if (objectId!==null) pick(null,-1); return}
    if (objectId!==layer.id) pick(layer.id,-1)
    const solid=layer.solid, labels=solidFaces(solid.shape)
    if (marker!==solid.shape) {
      marker=solid.shape
      faces.replaceChildren(...['Todas las caras',...labels].map((label,i)=>{
        const b=document.createElement('button'); b.type='button'; b.textContent=label; b.dataset.face=i-1
        b.setAttribute('aria-label',label)
        if (i>0) b.append(document.createElement('small'))
        b.onclick=()=>{pick(layerId(),i-1);sync(activeLayer())}
        return b
      }))
    }
    Array.from(faces.children).forEach((b,i)=>{
      b.setAttribute('aria-pressed',String(i-1===face))
      if (!i) return
      const material=solid.faces[i-1], preview=b.lastElementChild, name=description(material)
      b.title=labels[i-1]+' · '+name; b.setAttribute('aria-description',name)
      preview.className=material.type==='color'?'face-color':'face-source'
      if (material.type==='color') {
        preview.style.background=material.color; preview.textContent=''
      } else {
        preview.style.background=''; preview.textContent=name
      }
    })
    const options=face<0?solid.faces:[solid.faces[face]]
    const contents=new Set(options.map(description))
    $('mapFaceLabel').textContent=(face<0?'Todas las caras':labels[face])+' · '+(contents.size===1?[...contents][0]:'Materiales distintos')
    $('mapFaceHex').value=contents.size===1 && options[0].type==='color'?options[0].color:''
    syncPose(current(solid).pose)
  }
  const layerId=()=>activeLayer()?.id
  const swatches=$('mapFaceColors').querySelector('[role=group]')
  for (const [color,name] of [['#7ae2d7','Agua'],['#ff5a92','Fucsia'],['#ffa966','Ámbar'],['#9d90ff','Violeta'],['#ffffff','Blanco'],['#000000','Negro']]) {
    const b=document.createElement('button'); b.type='button'; b.className='material-swatch'; b.style.setProperty('--sample',color)
    b.setAttribute('aria-label',name); b.onclick=()=>assign({type:'color',color}); swatches.append(b)
  }
  $('mapFaceHex').onchange=e=>{
    const color=e.target.value.trim()
    if (/^#[\da-f]{6}$/i.test(color)) assign({type:'color',color})
    else {e.target.value=''; error(new Error('Ingresá seis dígitos HEX después de #.'))}
  }
  $('mapFaceColor').onclick=()=>stylePanels($('mapFaceColors').hidden?'mapFaceColor':null)
  $('mapFaceHydra').onclick=()=>{
    const panel=$('mapFaceSources')
    if (!panel.hidden) return stylePanels(null)
    panel.replaceChildren(...[{id:0,name:'Salida Hydra'},...sources().filter(r=>r.id)].map(row=>{
      const b=document.createElement('button'); b.type='button'; b.textContent=row.name
      b.onclick=()=>assign(row.id?{type:'hydra',sector:row.id}:{type:'hydra'})
      return b
    }))
    stylePanels('mapFaceHydra')
  }
  async function setFile(file,role,t) {
    if (!file || !matches(t)) return
    const asset=openAsset(file)
    asset.placing=true
    try { if (await asset.ready) assign({type:'file',file,role},t) }
    finally { asset.placing=false; release() }
  }
  $('mapFaceFile').onclick=()=>{fileTarget=target(); $('mapFaceInput').value=''; $('mapFaceInput').click()}
  $('mapFaceInput').onchange=e=>setFile(e.target.files[0],undefined,fileTarget).catch(error)
  $('mapFaceLoop').onclick=()=>{
    const t=target()
    chooseLoop($('mapFaceLoop'),file=>setFile(file,'loop',t))
  }
  return {sync,pick,current}
}
