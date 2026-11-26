const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')
const acorn = require('../vendor/acorn/dist/acorn.js')

const read = name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8')
const context = vm.createContext({acorn,atob})
for (const name of ['vendor/hydra-gallery/examples.js','src/sketches.js','src/visual-parameters.js'])
  vm.runInContext(read(name),context)

const bundle=read('vendor/dist/hydra-synth.js')
const header='],15:[function(require,module,exports){'
const start=bundle.indexOf(header)+header.length
const end=bundle.indexOf('},{}],16:[function',start)
const glslContext=vm.createContext({exports:{}})
vm.runInContext(bundle.slice(start,end),glslContext)
const transforms=Object.fromEntries(glslContext.exports.default().map(def=>[
  def.name,{...def,inputs:def.type.startsWith('combine') ? [{name:'_image',type:'vec4'},...def.inputs] : def.inputs}
]))
const find = (list, label, value) => list.find(entry=>entry.label===label && (value===undefined || Object.is(entry.value,value)))
const inspect = code=>Array.from(context.inspectVisualParameters(code,transforms))
const edit = (code,parameter,value)=>context.setVisualParameter(code,transforms,parameter.id,value)
const file = id=>vm.runInContext('SKETCHES.find(row=>row.id==='+JSON.stringify(id)+').code',context)
const attribution=src=>src.split(/\r?\n/).filter(line=>line.trimStart().startsWith('//'))

test('MULTIVERSE: cambia un divisor sin reescribir feedback, secuencias ni atribución',()=>{
  const original=file('eerie_ear_0')
  const controls=inspect(original)
  const divisor=find(controls,'Frecuencia · divisor',16)
  const step=find(controls,'Intensidad · paso 3',.4) || controls.find(entry=>entry.label.endsWith('paso 3') && entry.value===.4)
  assert.ok(divisor)
  assert.ok(step)
  const changed=edit(original,divisor,22)
  assert.equal(changed,original.replace('time/16','time/22'))
  assert.deepEqual(attribution(changed),attribution(original))
  assert.equal(inspect(changed).find(entry=>entry.id===divisor.id).value,22)
  const sequenced=edit(changed,step,.37)
  assert.equal(sequenced,changed.replace('[0.7,0.6,0.4,0.6]','[0.7,0.6,0.37,0.6]'))
  assert.ok(sequenced.includes('src(o0)'))
})

test('Glitch River: números signados, armónicos dinámicos y valores omitidos',()=>{
  const original=file('flor_2')
  const controls=inspect(original)
  const scroll=find(controls,'Desplazamiento vertical',-.01)
  const factor=controls.find(entry=>entry.label.endsWith('factor') && entry.value===3 && entry.group.startsWith('osc'))
  assert.ok(scroll)
  assert.ok(factor)
  let changed=edit(original,scroll,.023)
  assert.equal(changed,original.replace('scrollY(-0.01)','scrollY(0.023)'))
  changed=edit(changed,factor,4.1)
  assert.equal(changed,original.replace('scrollY(-0.01)','scrollY(0.023)').replace('Math.sin(time)*3','Math.sin(time)*4.1'))
  assert.deepEqual(attribution(changed),attribution(original))
  assert.equal(inspect(changed).find(entry=>entry.id===scroll.id).value,.023)
  const amount=controls.find(entry=>entry.group.startsWith('scale') && entry.label==='Escala horizontal')
  assert.equal(amount.value,1)
})

test('fragmentos, comentarios en negativos y coma terminal conservan el contexto',()=>{
  const fragment='// crédito de prueba\n.rotate(- /* calibración */ .25).scale(1, /* para el lado X */)'
  const original=inspect(fragment)
  const angle=find(original,'Ángulo (rad)',-.25)
  assert.ok(angle)
  let changed=edit(fragment,angle,.37)
  assert.equal(changed,'// crédito de prueba\n.rotate( /* calibración */ 0.37).scale(1, /* para el lado X */)')
  const x=find(original,'Escala horizontal',1)
  changed=edit(changed,x,1.3)
  assert.match(changed,/scale\(1, \/\* para el lado X \*\/ 1\.3\)$/)
  assert.equal(inspect(changed).find(entry=>entry.id===x.id).value,1.3)
  const draft='.rotate(2'
  assert.deepEqual(inspect(draft),[])
})

test('las referencias de audio y buffers no se convierten en perillas',()=>{
  const original="const enabled=true;\nconst seq=[.2,.6].fast(2);\nconst note='osc(999)';\nother.scale(99);\nosc(()=>time-2+a.fft[0]*.2,seq).blend(src(o1),.4).out(o2)"
  const controls=inspect(original)
  assert.ok(find(controls,'enabled',true))
  const turn=find(controls,'Frecuencia · resta',2)
  const sequence=find(controls,'seq · paso 2',.6)
  const speed=find(controls,'Velocidad de secuencia',2)
  assert.ok(turn && sequence && speed)
  assert.ok(!controls.some(entry=>entry.value===0 && entry.label.endsWith('paso 1')))
  assert.ok(!controls.some(entry=>entry.value===99 || entry.value===999))
  assert.equal(edit(original,turn,-17),original.replace('time-2','time-(-17)'))
  assert.equal(edit(original,sequence,.8),original.replace('[.2,.6]','[.2,0.8]'))
  assert.equal(edit(original,find(controls,'enabled',true),false),original.replace('enabled=true','enabled=false'))
  assert.equal(inspect('osc(1).blend().out()').some(entry=>entry.label==='Mezcla'),false)
})

test('setFunction local, ajuste seguro de exponentes y entrada numérica sin tope',()=>{
  const original="setFunction({ name:'bucle', type:'coord', inputs:[{ name:'activo', type:'bool', default:true }], glsl:'return _st;' }); osc(()=>2**3).bucle().out()"
  const controls=inspect(original)
  const active=find(controls,'activo',true)
  assert.ok(active)
  const changed=edit(original,active,false)
  assert.equal(changed,original.replace('.bucle()','.bucle(false)'))
  assert.equal(inspect(changed).find(entry=>entry.id===active.id).value,false)
  const left=controls.find(entry=>entry.value===2 && entry.group.startsWith('osc'))
  assert.equal(edit(changed,left,-21),changed.replace('2**3','(-21)**3'))
  const value=2e100
  assert.equal(inspect(edit(changed,left,value)).find(entry=>entry.id===left.id).value,value)
  assert.throws(()=>edit(changed,left,Infinity),/válido/)
})

test('las semillas conservan rutas y fórmulas cuando ajustás cada valor numérico',()=>{
  for(let i=0;i<15;i++) {
    const before=vm.runInContext('growSketch('+(i*2654435761>>>0)+')',context)
    const entries=inspect(before)
    assert.ok(entries.length>14)
    const param=entries.find(entry=>entry.kind==='number' && entry.group.startsWith('osc'))
    if (!param) continue
    const next=edit(before,param,-.777)
    assert.deepEqual(attribution(next),attribution(before))
    assert.deepEqual(next.match(/\b[os][0-3]\b/g),before.match(/\b[os][0-3]\b/g))
    assert.equal(inspect(next).find(entry=>entry.id===param.id).value,-.777)
  }
})
