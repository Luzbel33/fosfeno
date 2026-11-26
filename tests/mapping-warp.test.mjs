import assert from 'node:assert/strict'
import test from 'node:test'
import { coverRect, mapQuadPoint, quadBounds, rectQuad, validQuad } from '../src/mapping-warp.mjs'
import { blankMap, packMap, unpackMap } from '../src/mapping-project.mjs'

const quad = [[.1,.1],[.9,.1],[.7,.9],[.3,.9]]
function near(actual, expected) {
  assert.ok(actual.every((x,i) => Math.abs(x-expected[i]) < 1e-9), actual + ' ≠ ' + expected)
}

test('a corner pin maps the four vertices and the intersection of the diagonals in both directions', () => {
  const unit = rectQuad([0,0,1,1])
  for (let i=0; i<4; i++) {
    near(mapQuadPoint(unit[i],quad),quad[i])
    near(mapQuadPoint(quad[i],quad,true),unit[i])
  }
  near(mapQuadPoint([.5,.5],quad),[.5,.1+.8*2/3])
  near(mapQuadPoint([.5,.1+.8*2/3],quad,true),[.5,.5])
  near(quadBounds(quad),[.1,.1,.8,.8])
  near(coverRect(2,1),[.25,0,.5,1])
  near(coverRect(1,2),[0,.25,1,.5])
})

test('offscreen corners are valid while crossed, concave, flat and reversed pins are rejected', () => {
  assert.ok(validQuad(rectQuad([-.4,.3,2,1])))
  for (const bad of [[],null,[quad[0],quad[2],quad[1],quad[3]],[...quad].reverse(),
    [quad[0],quad[0],quad[2],quad[3]],[quad[0],quad[1],[.2,.15],quad[3]],
    [quad[0],quad[1],[Infinity,.7],quad[3]],[quad[0],quad[1],[NaN,.6],quad[3]]]) {
    assert.equal(validQuad(bad),false)
    assert.equal(mapQuadPoint([.3,.6],bad),null)
  }
})

test('a portable map round-trips pinned ink, images and Hydra while preserving original texture bounds', async () => {
  const image = new File(['asset'],'original.png',{type:'image/png'})
  const common = {name:'Mapped object',opacity:.73,visible:true,quad}
  const ink = {...common, id:'a',kind:'ink',rect:[.41,.2,.004,.003],
    strokes:[{style:'neon',size:4,color:'#db5674',points:[[.412,.201]]}]}
  const layers = [ink,
    {...common,id:'b',kind:'hydra',rect:[.2,.2,.4,.3],mask:'rect'},
    {...common,id:'c',kind:'file',rect:[0,0,.8,.4],mask:'ellipse',file:image}]
  const restored = await unpackMap(packMap({...blankMap,layers}))
  for (let i=0;i<layers.length;i++) {
    assert.deepEqual(restored.layers[i].quad,quad)
    assert.deepEqual(restored.layers[i].rect,layers[i].rect)
  }
  assert.equal(await restored.layers[2].file.text(),'asset')
  for (const bad of [{...ink,quad:[...quad].reverse()},{...ink,rect:[0,0,0,.5]}])
    await assert.rejects(unpackMap(packMap({...blankMap,layers:[bad]})), /incompatible/)
})
