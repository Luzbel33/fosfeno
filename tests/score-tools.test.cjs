const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ctx = vm.createContext({acorn:require('../vendor/acorn/dist/acorn.js')})
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/score-tools.js'),'utf8'),ctx)
const transforms = {osc:{type:'src'},solid:{type:'src'},src:{type:'src'},rotate:{type:'coord'},blend:{type:'combine'}}
const inspect = code => ctx.inspectScore(code,transforms)

test('removing a call preserves parentheses, comments, literals and unrelated Javascript',()=>{
  const code = 'const text = ".rotate(3)"\n(osc(4)). /* . */ rotate(0.2).blend(src(o1).rotate(1),.4).out()'
  const {effects} = inspect(code)
  assert.equal(effects.length,3)
  const {start,end} = effects[0]
  assert.equal(code.slice(0,start)+code.slice(end),'const text = ".rotate(3)"\n(osc(4)).blend(src(o1).rotate(1),.4).out()')
  assert.equal(effects[1].amount.value,.4)
})

test('a single-pass library layer works even with all four buffers reserved',()=>{
  const base = inspect('osc().out(o0);osc().out(o1);osc().out(o2);osc().out(o3)')
  const layer = ctx.libraryBlend(base,{name:'Azul',code:'const azul = () => solid(0,0,1)\nazul().out()'},transforms)
  const combined = vm.runInNewContext('base'+layer,{base:{blend:(rgb,w)=>[...rgb,w]},solid:(...rgb)=>rgb})
  assert.deepEqual(Array.from(combined),[0,0,1,.5])
})

test('feedback layers reuse their own remapped output, and reject unavailable buffers',()=>{
  const piece = {name:'Eco',code:'osc().blend(src(o0),.4).out()'}
  const code = ctx.libraryBlend(inspect('solid().out()'),piece,transforms)
  assert.match(code,/blend\(src\(o1\),.4\).out\(o1\)/)
  assert.throws(()=>ctx.libraryBlend(inspect('src(o1).blend(src(o2)).blend(src(o3)).out()'),piece,transforms),/salidas libres/)
  assert.throws(()=>ctx.libraryBlend(inspect('osc().out()'),{name:'Cam',code:'s0.initCam();src(s0).out()'},transforms),/Abrir/)
})
