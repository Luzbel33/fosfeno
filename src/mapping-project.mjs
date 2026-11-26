import { formats, projectorToCamera } from './mapping-output.mjs'

const magic = 'FOSMAP1\n'
const invalid = () => { throw new Error('El archivo .fosmap está dañado o usa un formato incompatible.') }
const number = (value, min, max) => Number.isFinite(value) && value >= min && value <= max
const point = value => Array.isArray(value) && value.length === 2 && value.every(n => number(n, 0, 1))
const mediaType = value => typeof value === 'string' && /^(image|video)\//.test(value)
const studioModes = ['full', 'sectors', 'off']
export const blankMap = { format: '16:9', aspect: 16 / 9, calibration: null, layers: [], studioMode: 'sectors' }

export function packMap({ studio, ...map }) {
  const files = []
  const layers = map.layers.map(({ file, ...layer }) => {
    if (!file) return layer
    files.push(file)
    return { ...layer, asset: files.length - 1 }
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
        typeof asset.name !== 'string' || !mediaType(asset.type)) invalid()
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
    if (kind === 'ink') {
      if (!Array.isArray(layer.strokes) || !layer.strokes.length || !layer.strokes.every(stroke =>
        stroke && /^#[\da-f]{6}$/i.test(stroke.color) && ['solid', 'neon', 'dots'].includes(stroke.style) &&
        number(stroke.size, 2, 60) && Array.isArray(stroke.points) && stroke.points.length && stroke.points.every(point))) invalid()
      return { ...base, strokes: layer.strokes }
    }
    if (!['file', 'hydra'].includes(kind) || !['rect', 'ellipse'].includes(layer.mask) ||
        !Array.isArray(layer.rect) || layer.rect.length !== 4 || !layer.rect.every(n => number(n, 0, 1)) ||
        layer.rect[2] < .02 || layer.rect[3] < .02 ||
        layer.rect[0] + layer.rect[2] > 1.00001 || layer.rect[1] + layer.rect[3] > 1.00001) invalid()
    if (kind === 'file' && (!Number.isInteger(layer.asset) || !files[layer.asset])) invalid()
    return { ...base, mask: layer.mask, rect: layer.rect, file: files[layer.asset],
      mediaRole: layer.mediaRole === 'loop' ? 'loop' : undefined }
  })
  return { format: map.format, aspect: map.aspect, calibration, layers, studio,
    studioMode: map.studioMode ?? 'off' }
}
