const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

// Model tests only. Browser checks exercise decoded media, shaders and playback.
class TestInput {
  async open(kind,{file,role}) { this.current = {kind,file,role} }
  replace(input) { this.current = input }
  clear() { this.current = null }
}
const context = vm.createContext({
  Blob,File,TextDecoder,TextEncoder,VisualInput:TestInput,retainVisual:input=>input,document:{addEventListener(){}}
})
for (const name of ['sectors','sector-history','compositions']) {
  vm.runInContext(readFileSync(path.join(__dirname,'../src/'+name+'.js'),'utf8'),context)
}
const {SectorDesk,SectorHistory,packComposition,unpackComposition} =
  vm.runInContext('({SectorDesk,SectorHistory,packComposition,unpackComposition})',context)
const emptyLayer = (layerId,options) => ({source:'none',paint:false,fx:[],layerId, ...options})
const region = (id,options) => ({id,source:'sketch',paint:false,visible:true,fx:[],shape:'Rectángulo',
  points:[[0,0],[1,0],[1,1],[0,1]],layers:[],...options})
const ref = (sectorId,layerId,kind,index) => ({sectorId,layerId,kind,index})
function deskWith(regions) {
  const desk = Object.assign(Object.create(SectorDesk.prototype),{
    regions,applied:[],files:new Set(),layerSelection:new WeakMap(),groupSelection:new Set(),
    live:()=>false,refresh(){},cancelDrag(){},note(){},documentVersion:0
  })
  desk.principal=desk.makePrincipal()
  desk.history=new SectorHistory(desk)
  return desk
}
const settings={output:'0',quality:'auto',brush:.42,sensitivity:1,bpm:30,painting:false,
  internalPulse:false,autoMix:true,fold:'libre',seed:''}

test('moving a file never overwrites another source; source removal keeps the effect chain',async()=>{
  const desk=deskWith([region(1),region(2,{source:'none'})])
  const clip=new File(['clip'],'show.webm',{type:'video/webm'})
  const [one,two]=desk.regions
  const fx={name:'Girar',value:1.5}
  desk.principal.fx.push(fx)
  await desk.setFile(desk.principal,clip,'loop')
  const player=desk.principal.file
  assert.throws(()=>desk.moveStackItem(ref(0,0,'source'),ref(1,0)))
  assert.equal(one.source,'sketch')
  assert.equal(desk.principal.file,player)
  desk.moveStackItem(ref(0,0,'source'),ref(2,0))
  assert.equal(two.file,player)
  assert.equal(desk.principal.source,'sketch')
  assert.equal(desk.principal.file,null)
  assert.equal(desk.principal.fx[0],fx)
  const dest=desk.moveStackItem(ref(2,0,'source'),{...ref(1,0),newLayer:true})
  assert.equal(two.source,'none')
  assert.equal(desk.stackTarget(dest).layer.file,player)
  desk.moveStackItem(ref(0,0,'effect',0),dest)
  desk.removeStackSource(dest)
  assert.equal(desk.stackTarget(dest).layer.source,'none')
  assert.equal(desk.stackTarget(dest).layer.fx[0],fx)
  await desk.history.undo()
  assert.equal(desk.stackTarget(dest).layer.file.current.file,clip)
  assert.equal(desk.stackTarget(dest).layer.file.current,player.current)
  assert.equal(desk.stackTarget(dest).layer.file.current.role,'loop')
  await desk.history.redo()
  assert.equal(desk.stackTarget(dest).layer.source,'none')
})

test('effect order and settings survive transfers between composition, layer and group',()=>{
  const desk=deskWith([region(1,{layers:[emptyLayer(1,{source:'group'})]})])
  const group=desk.regions[0].layers[0]
  const a={name:'Invertir',value:.7}, b={kind:'operator',name:'spin',code:'.rotate(2)',definitions:[],enabled:false}
  const c={kind:'library',name:'clip',code:'solid().out()',value:.4}
  group.fx=[a,b,c]
  desk.moveStackItem(ref(1,1,'effect',0),{...ref(1,1),index:2})
  assert.deepEqual(group.fx,[b,c,a])
  const dest=desk.moveStackItem(ref(1,1,'effect',0),ref(0,0))
  assert.equal(desk.principal.fx[0],b)
  assert.equal(dest.index,0)
  assert.equal(b.enabled,false)
  desk.moveStackItem(dest,{...ref(1,1),index:1})
  assert.deepEqual(group.fx,[c,b,a])
  assert.equal(desk.principal.fx.length,0)
})

test('moving code or brush settings preserves other items and refuses occupied destinations',()=>{
  const base=region(1,{code:'return solid(1,0,0)',paint:true,brushSize:.7,brushDetail:.9,
    brushInverse:true,brushSpeed:2.5})
  const other=region(2,{code:'return noise()',paint:true})
  const desk=deskWith([base,other])
  assert.equal(desk.canMoveStackItem(ref(1,0,'paint'),ref(2,0)),false)
  assert.equal(desk.canMoveStackItem(ref(1,0,'code'),ref(2,0)),false)
  desk.moveStackItem(ref(1,0,'paint'),ref(0,0))
  assert.equal(base.paint,false)
  assert.equal(base.code,'return solid(1,0,0)')
  assert.equal(desk.principal.brushInverse,true)
  assert.equal(desk.principal.brushSpeed,2.5)
  const code=desk.moveStackItem(ref(1,0,'code'),{...ref(2,0),newLayer:true})
  assert.equal(desk.stackTarget(code).layer.code,'return solid(1,0,0)')
  assert.equal(base.code,undefined)
  assert.equal(other.code,'return noise()')
})

test('moving a group detaches its base-layer member without moving the sector mask or sharing IDs',async()=>{
  const fx={name:'Girar',value:1}
  const group=emptyLayer(2,{label:'Tinta',source:'group',fx:[fx],opacity:.42})
  const child=emptyLayer(5,{label:'Secundaria',groupId:2,source:'s0',paint:true,brushDetail:.9})
  const one=region(1,{groupId:2,layers:[group,child]})
  const occupied=emptyLayer(2,{source:'group'})
  const desk=deskWith([one,region(2,{groupId:2,layers:[occupied]})])
  const file=new File(['image'],'map.png',{type:'image/png'})
  await desk.setFile(one,file)
  assert.equal(desk.canMoveStackItem(ref(1,2,'group'),ref(2,2)),false)
  const dest=desk.moveStackItem(ref(1,2,'group'),{...ref(2,0),root:true})
  assert.equal(one.source,'none')
  assert.equal(one.groupId,undefined)
  assert.equal(one.layers.length,0)
  assert.equal(one.points.length,4)
  const layers=desk.regions[1].layers
  assert.equal(new Set(layers.map(l=>l.layerId)).size,layers.length)
  assert.equal(desk.stackTarget(dest).layer,group)
  assert.equal(group.fx[0],fx)
  assert.equal(group.opacity,.42)
  const moved=layers.filter(l=>l.groupId===dest.layerId)
  assert.equal(moved.length,2)
  assert.equal(moved[0].file.current.file,file)
  assert.equal(moved[1],child)
  const project=await unpackComposition(packComposition({name:'Mapa',code:'',settings,regions:desk.snapshot()}))
  assert.equal(project.regions[0].source,'none')
  const recovered=project.regions[1].layers.find(l=>l.source==='file')
  assert.equal(recovered.file.name,file.name)
  assert.equal(recovered.groupId,dest.layerId)
  await desk.history.undo()
  assert.equal(desk.regions[0].file.current.file,file)
  assert.equal(desk.regions[0].groupId,2)
  assert.equal(desk.regions[1].layers.length,1)
})
