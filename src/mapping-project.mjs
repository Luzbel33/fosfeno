import { formats, projectorToCamera } from './mapping-output.mjs?v=3.1'
import { validQuad } from './mapping-warp.mjs?v=3.1'
import { readPose } from './pose-3d.mjs?v=3.1'
import { packSolid, unpackSolid } from './mapping-solids.mjs?v=3.1'

const magic = 'FOSMAP1\n'
const invalid = () => { throw new Error('El archivo .fosmap está dañado o usa un formato incompatible.') }
const number = (value, min, max) => Number.isFinite(value) && value >= min && value <= max
const point = value => Array.isArray(value) && value.length === 2 && value.every(n => number(n, 0, 1))
const validRect = (rect, minSize) => Array.isArray(rect) && rect.length === 4 && rect.every(n => number(n, 0, 1)) &&
  rect[2] >= minSize && rect[3] >= minSize && rect[0]+rect[2] <= 1.00001 && rect[1]+rect[3] <= 1.00001
const mediaType = file => typeof file.type === 'string' &&
  (/^(image|video)\//.test(file.type) || file.type==='model/gltf-binary' || /\.glb$/i.test(file.name))
const studioModes = ['full', 'sectors', 'off']
export const blankMap = { format: '16:9', aspect: 16 / 9, calibration: null, layers: [], studioMode: 'off' }

export function packMap({ studio, ...map }) {
  const files = []
  const index = new Map()
  const assetId = file => {
    if (!index.has(file)) { index.set(file,files.length); files.push(file) }
    return index.get(file)
  }
  const layers = map.layers.map(({ file, ...layer }) => {
    if (layer.kind==='solid') return {...layer,solid:packSolid(layer.solid,assetId)}
    if (!file) return layer
    return { ...layer, asset: assetId(file) }
  })
  const data = new TextEncoder().encode(JSON.stringify({
    ...map, layers, studioBytes: studio?.size || 0, assets: files.map(({ name, type, size }) => ({ name, type, size }))
  }))
  const length = new DataView(new ArrayBuffer(4))
  length.setUint32(0, data.byteLength)
  return new Blob([magic, length, data, ...files, ...(studio ? [studio] : [])], { type: 'application/octet-stream' })
}

export async function unpackMap(blob) {
  const header = magic.length + 4
  if (!blob || blob.size < header || await blob.slice(0, magic.length).text() !== magic) invalid()
  const length = new DataView(await blob.slice(magic.length, header).arrayBuffer()).getUint32(0)
  if (length > 24 * 1024 * 1024 || header + length > blob.size) invalid()
  let map
  try { map = JSON.parse(await blob.slice(header, header + length).text()) } catch { invalid() }
  if (!map || !Object.hasOwn(formats, map.format) || !number(map.aspect, .2, 5) ||
      !Array.isArray(map.layers) || !Array.isArray(map.assets)) invalid()
  const { calibration } = map
  if (calibration !== null && (!Array.isArray(calibration) || !calibration.every(point) ||
      !projectorToCamera(calibration))) invalid()
  let offset = header + length
  const files = map.assets.map(asset => {
    if (!asset || !Number.isSafeInteger(asset.size) || asset.size < 1 || offset + asset.size > blob.size ||
        typeof asset.name !== 'string' || !mediaType(asset)) invalid()
    const file = new File([blob.slice(offset, offset + asset.size)], asset.name, { type: asset.type })
    offset += asset.size
    return file
  })
  const studioBytes = map.studioBytes ?? 0
  if (!Number.isSafeInteger(studioBytes) || studioBytes < 0 || offset + studioBytes !== blob.size ||
      (map.studioMode != null && !studioModes.includes(map.studioMode))) invalid()
  const studio = studioBytes ? blob.slice(offset) : null
  const ids = new Set()
  const layers = map.layers.map(layer => {
    if (!layer || typeof layer.id !== 'string' || ids.has(layer.id) || typeof layer.name !== 'string' ||
        typeof layer.visible !== 'boolean' || !number(layer.opacity, 0, 1)) invalid()
    ids.add(layer.id)
    const { id, name, visible, opacity, kind } = layer
    const base = { id, name, visible, opacity, kind }
    if (layer.quad != null) {
      if (!validQuad(layer.quad)) invalid()
      base.quad = layer.quad
    }
    if (kind === 'solid') {
      if (!validRect(layer.rect,.02)) invalid()
      return {...base,rect:layer.rect,mask:'rect',solid:unpackSolid(layer.solid,files)}
    }
    if (kind === 'ink') {
      if (!Array.isArray(layer.strokes) || !layer.strokes.length || !layer.strokes.every(stroke =>
        stroke && /^#[\da-f]{6}$/i.test(stroke.color) && ['solid', 'neon', 'dots'].includes(stroke.style) &&
        number(stroke.size, 2, 60) && Array.isArray(stroke.points) && stroke.points.length && stroke.points.every(point) &&
        (stroke.line === undefined || stroke.line === true && stroke.points.length >= 2) &&
        (stroke.closed === undefined || typeof stroke.closed === 'boolean' && stroke.line === true &&
          (!stroke.closed || stroke.points.length >= 3)))) invalid()
      if (layer.rect != null) {
        if (!validRect(layer.rect, Number.EPSILON)) invalid()
        base.rect = layer.rect
      }
      return { ...base, strokes: layer.strokes }
    }
    if (!['file', 'hydra'].includes(kind) || !['rect', 'ellipse'].includes(layer.mask) ||
        !validRect(layer.rect, .02)) invalid()
    if (kind === 'file' && (!Number.isInteger(layer.asset) || !files[layer.asset])) invalid()
    if (kind === 'file' && layer.modelView!=null) base.modelView=readPose(layer.modelView)
    return { ...base, mask: layer.mask, rect: layer.rect, file: files[layer.asset],
      mediaRole: layer.mediaRole === 'loop' ? 'loop' : undefined }
  })
  return { format: map.format, aspect: map.aspect, calibration, layers, studio,
    studioMode: map.studioMode ?? 'off' }
}
