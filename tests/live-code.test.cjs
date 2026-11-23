const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')
const acorn = require('../vendor/acorn/dist/acorn.js')

const context = vm.createContext({ acorn })
for (const name of ['engine', 'sketches']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', name + '.js'), 'utf8'), context)
}
const { compileScore, growSketch } = context

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
