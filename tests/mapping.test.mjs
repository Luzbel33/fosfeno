import assert from 'node:assert/strict'
import test from 'node:test'
import { anchors, projectorToCamera } from '../src/mapping-output.mjs'
import { blankMap, packMap, unpackMap } from '../src/mapping-project.mjs'

function sample([a, b, c, d, e, f, g, h, i], [x, y]) {
  const z = g * x + h * y + i
  return [(a * x + b * y + c) / z, (d * x + e * y + f) / z]
}

test('calibration connects all four projector marks to the chosen camera points', () => {
  const camera = [[.18, .19], [.82, .12], [.89, .82], [.13, .88]]
  const transform = projectorToCamera(camera)
  assert.ok(transform)
  for (const [i, mark] of anchors.entries()) {
    const actual = sample(transform, mark)
    assert.ok(actual.every((coordinate, axis) => Math.abs(coordinate - camera[i][axis]) < 1e-9))
  }
  assert.ok(transform[6] || transform[7], 'A skewed surface requires a projective term')
})

test('calibration rejects misordered, flat, or near-coincident camera points', () => {
  for (const points of [
    [anchors[0], anchors[2], anchors[1], anchors[3]],
    [[.1, .3], [.9, .3], [.9, .3], [.1, .3]],
    [[.1, .1], [.10003, .1], [.10003, .10003], [.1, .10003]]
  ]) assert.equal(projectorToCamera(points), null)
})

test('portable mapping preserves composition and binary assets and rejects truncation', async () => {
  const base = { visible: true, opacity: .7 }
  const file = new File([Uint8Array.of(2, 0, 3, 4)], 'Loop.webm', { type: 'video/webm' })
  const map = {
    ...blankMap, calibration: anchors, studioMode: 'sectors',
    studio: new Blob(['FOSFENO1\n', Uint8Array.of(0, 1, 2)]),
    layers: [
      { ...base, kind: 'ink', id: '1', name: 'Trazos', strokes: [{ style: 'dots', size: 13, color: '#123456', points: anchors }] },
      { ...base, kind: 'file', id: '2', name: 'Loop', file, mask: 'ellipse', rect: [.1, .1, .6, .4] }
    ]
  }
  const blob = packMap(map)
  const restored = await unpackMap(blob)
  assert.deepEqual(restored.calibration, map.calibration)
  assert.equal(restored.studioMode, 'sectors')
  assert.deepEqual(await restored.studio.arrayBuffer(), await map.studio.arrayBuffer())
  assert.deepEqual(restored.layers[0], map.layers[0])
  const restoredFile = restored.layers[1].file
  assert.equal(restoredFile.name, file.name)
  assert.deepEqual(await restoredFile.arrayBuffer(), await file.arrayBuffer())
  await assert.rejects(unpackMap(blob.slice(0, -1)), /incompatible/)
})

test('maps saved before the shared Studio keep their original projection stack', async () => {
  const original = {
    format: '16:9', aspect: 16 / 9, calibration: null, assets: [],
    layers: [{ kind: 'hydra', id: 's', name: 'Hydra en vivo', opacity: 1, visible: true, mask: 'rect', rect: [.1, .1, .8, .8] }]
  }
  const data = new TextEncoder().encode(JSON.stringify(original))
  const size = new DataView(new ArrayBuffer(4))
  size.setUint32(0, data.length)
  const restored = await unpackMap(new Blob(['FOSMAP1\n', size, data]))
  assert.equal(restored.studio, null)
  assert.equal(restored.studioMode, 'off')
  assert.deepEqual(restored.layers[0].rect, original.layers[0].rect)
})
