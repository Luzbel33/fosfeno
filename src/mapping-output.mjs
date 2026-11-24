export const anchors = [[.1, .1], [.9, .1], [.9, .9], [.1, .9]]
export const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
export const formats = { '16:9': [1280, 720], '16:10': [1280, 800], '4:3': [1024, 768] }

// The inverse mapping samples the camera-space artwork for each projector pixel.
export function projectorToCamera(points) {
  if (points.length !== 4) return null
  const crosses = points.map(([x, y], i) => {
    const [bx, by] = points[(i + 1) % 4], [cx, cy] = points[(i + 2) % 4]
    return (bx - x) * (cy - by) - (by - y) * (cx - bx)
  })
  if (!crosses.every(n => n > .0001)) return null
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = points
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3
  const determinant = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / determinant
  const h = (dx1 * dy3 - dx3 * dy1) / determinant
  const square = [x1 - x0 + g * x1, x3 - x0 + h * x3, x0,
    y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1]
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

function shader(gl, type, source) {
  const handle = gl.createShader(type)
  gl.shaderSource(handle, source)
  gl.compileShader(handle)
  if (!gl.getShaderParameter(handle, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(handle))
  return handle
}

export function projectionRenderer(canvas) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true })
  if (!gl) throw new Error('La salida de mapeo necesita WebGL. Revisá la aceleración gráfica del navegador.')
  const vertex = shader(gl, gl.VERTEX_SHADER, `
    attribute vec2 position;
    varying vec2 uv;
    void main() {
      uv = vec2(position.x + 1.0, 1.0 - position.y) * 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `)
  const fragment = shader(gl, gl.FRAGMENT_SHADER, `
    precision highp float;
    varying vec2 uv;
    uniform mat3 warp;
    uniform sampler2D artwork;
    void main() {
      vec3 p = warp * vec3(uv, 1.0);
      vec2 sampleAt = p.xy / p.z;
      if (sampleAt.x < 0.0 || sampleAt.y < 0.0 || sampleAt.x > 1.0 || sampleAt.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      } else {
        vec4 color = texture2D(artwork, sampleAt);
        gl_FragColor = vec4(color.rgb * color.a, 1.0);
      }
    }
  `)
  const program = gl.createProgram()
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  gl.useProgram(program)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const uniform = gl.getUniformLocation(program, 'warp')
  return (source, matrix) => {
    gl.viewport(0, 0, canvas.width, canvas.height)
    if (!source) {
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      return
    }
    gl.uniformMatrix3fv(uniform, false, [matrix[0], matrix[3], matrix[6], matrix[1], matrix[4],
      matrix[7], matrix[2], matrix[5], matrix[8]])
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}
