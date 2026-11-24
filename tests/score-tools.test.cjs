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
