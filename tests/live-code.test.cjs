const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')
const acorn = require('../vendor/acorn/dist/acorn.js')

const context = vm.createContext({ acorn, atob })
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '../vendor/hydra-gallery/examples.js'), 'utf8'),
  context
)
for (const name of ['engine', 'sketches']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', name + '.js'), 'utf8'), context)
}
const { compileScore, growSketch } = context

test('numeric seeds keep their historic scores and all significant decimal digits', () => {
  const hash=require('node:crypto').createHash('sha256')
  for (const n of [0,1,777,2147483648,4294967295]) {
    for (const fold of ['libre','x','y','radial']) {
      const code=growSketch(n,fold)
      hash.update(code+'\n')
      assert.deepEqual({...context.seedRecipe({code})},{seed:String(n),fold})
    }
  }
  assert.equal(hash.digest('hex'),'47fc6de7f27df3ecf6932e7a7a37b7037b9d20e4fe7ff628a56aee42080bf9dd')
  assert.equal(growSketch('-000,000'),growSketch(0))
  assert.equal(growSketch('+0000777.0'),growSketch(777))
  assert.equal(growSketch('−000,057000','y'),growSketch('-.057','y'))
  for (const invalid of ['+','.',',','- 1','1.2,3','1e3','Infinity','123\n456']) {
    assert.equal(context.canonicalSeed(invalid),null)
    assert.throws(()=>growSketch(invalid))
  }
  const recipeSeed='-987654321098765432109876543210.'+'0'.repeat(4096)
  const body=score=>score.slice(score.indexOf('\n')+1)
  for (const [a,b] of [[recipeSeed+'5',recipeSeed+'6'],['9007199254740992','9007199254740993'],['4294967296','0']])
    assert.notEqual(body(growSketch(a)),body(growSketch(b)))
  const decimal=recipeSeed+'5'
  for (const fold of ['libre','x','y','radial']) {
    const code=growSketch(decimal,fold)
    assert.equal(growSketch(decimal.replace('.',',')+'00',fold),code)
    assert.deepEqual({...context.seedRecipe({code})},{seed:decimal,fold})
    assert.equal(context.seedRecipe({code:code+'\nosc().out()'}),null)
    assert.doesNotThrow(()=>compileScore(code,Object.create(null)))
  }
})

test('the initial score is byte-identical to the captured Hydra editor document', () => {
  const { createHash } = require('node:crypto')
  const initial = vm.runInContext('SKETCHES[0]', context)
  assert.equal(initial.id, 'eerie_ear_0')
  assert.equal(
    createHash('sha256').update(initial.code).digest('hex'),
    'dc19d3a78597e4611844e73f6775700ee004031c504d8821a02871e46a43076d'
  )
})

test('live bindings survive evaluation units, including destructuring, functions and await', async () => {
  const env = Object.create(null)
  await compileScore(
    'const {amount, nested:[pitch]} = {amount:3,nested:[8]}; let result = read(); function read(){return amount*pitch}',
    env
  )()
  assert.equal(env.result, 24)
  await compileScore('let amount = await Promise.resolve(7); result = read()', env)()
  assert.equal(env.result, 56)
  await compileScore('const last = (2, 5); const glsl = "let untouched = 9;"; result = last', env)()
  assert.equal(env.result, 5)
  assert.equal(env.glsl, 'let untouched = 9;')
})

test('seeds reconstruct executable source and respect explicit mirror operators', () => {
  const topologies = new Set()
  for (let i = 0; i < 200; i++) {
    const seed = Math.imul(i + 1, 2654435761) >>> 0
    const score = growSketch(seed, 'x')
    assert.equal(score, growSketch(seed, 'x'))
    assert.match(score, /\.espejoX\(\)/)
    assert.match(score, /\.out\(o0\)/)
    assert.doesNotThrow(() => compileScore(score, Object.create(null)))
    topologies.add(
      score.includes('planoInverso')
        ? 'fold'
        : score.includes('tintaOrbital')
          ? 'orbit'
          : score.includes('reticula')
            ? 'weave'
            : score.includes('diferencia entre')
              ? 'memory'
              : 'phase'
    )
  }
  assert.equal(topologies.size, 5)
})
