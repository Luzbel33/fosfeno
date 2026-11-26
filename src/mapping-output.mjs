import { squareToQuad, textureRenderer } from './mapping-warp.mjs?v=3.0'

export const anchors = [[.1, .1], [.9, .1], [.9, .9], [.1, .9]]
export const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
export const formats = { '16:9': [1280, 720], '16:10': [1280, 800], '4:3': [1024, 768] }

// The inverse mapping samples the camera-space artwork for each projector pixel.
export function projectorToCamera(points) {
  const square = squareToQuad(points, .0001)
  if (!square || points.some(point=>point.some(n=>n<0 || n>1))) return null
  const start = anchors[0][0], span = anchors[1][0] - start
  const matrix = [0, 3, 6].flatMap(i => {
    const a = square[i] / span, b = square[i + 1] / span
    return [a, b, square[i + 2] - start * (a + b)]
  })
  // Reject calibrations with a projective pole anywhere in the output.
  return [matrix[8], matrix[6] + matrix[8], matrix[7] + matrix[8],
    matrix[6] + matrix[7] + matrix[8]].every(n => n > .001) ? matrix : null
}

export function pattern(ctx, index) {
  const { width, height } = ctx.canvas
  ctx.fillStyle = '#101211'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = '#3b4933'
  ctx.lineWidth = 2
  ctx.strokeRect(width * .1, height * .1, width * .8, height * .8)
  for (const [i, [u, v]] of anchors.entries()) {
    const x = u * width, y = v * height
    ctx.beginPath()
    ctx.arc(x, y, 19, 0, 2 * Math.PI)
    ctx.fillStyle = index === i ? '#c6fc55' : '#f8fcf3'
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x - 12, y)
    ctx.lineTo(x + 12, y)
    ctx.moveTo(x, y - 12)
    ctx.lineTo(x, y + 12)
    ctx.strokeStyle = '#101211'
    ctx.stroke()
    ctx.font = 'bold 27px sans-serif'
    ctx.fillText(String(i + 1), x + 24, y + 9)
  }
}

export function projectionRenderer(canvas) {
  return textureRenderer(canvas)
}
