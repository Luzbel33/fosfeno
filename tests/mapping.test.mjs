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
    ...blankMap, calibration: anchors,
    layers: [
      { ...base, kind: 'ink', id: '1', name: 'Trazos', strokes: [{ style: 'dots', size: 13, color: '#123456', points: anchors }] },
      { ...base, kind: 'file', id: '2', name: 'Loop', file, mask: 'ellipse', rect: [.1, .1, .6, .4] }
    ]
  }
  const blob = packMap(map)
  const restored = await unpackMap(blob)
  assert.deepEqual(restored.calibration, map.calibration)
  assert.deepEqual(restored.layers[0], map.layers[0])
  const restoredFile = restored.layers[1].file
  assert.equal(restoredFile.name, file.name)
  assert.deepEqual(await restoredFile.arrayBuffer(), await file.arrayBuffer())
  await assert.rejects(unpackMap(blob.slice(0, -1)), /incompatible/)
})
