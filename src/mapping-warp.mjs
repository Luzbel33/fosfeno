export function rectQuad([x, y, width, height]) {
  return [[x,y], [x+width,y], [x+width,y+height], [x,y+height]]
}

export function quadBounds(quad) {
  const x = quad.map(p => p[0]), y = quad.map(p => p[1])
  const left = Math.min(...x), top = Math.min(...y)
  return [left, top, Math.max(...x)-left, Math.max(...y)-top]
}

export function validQuad(quad, minCross = 1e-8) {
  if (!Array.isArray(quad) || quad.length !== 4 || !quad.every(p =>
    Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && Math.abs(n) <= 1e6))) return false
  return quad.every(([x,y], i) => {
    const [bx,by] = quad[(i+1)%4], [cx,cy] = quad[(i+2)%4]
    return (bx-x)*(cy-by) - (by-y)*(cx-bx) > minCross
  })
}

// Projectively map the unit square to four ordered corners, in top-left UV space.
export function squareToQuad(quad, minCross) {
  if (!validQuad(quad, minCross)) return null
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] = quad
  const dx1=x1-x2, dx2=x3-x2, dx3=x0-x1+x2-x3
  const dy1=y1-y2, dy2=y3-y2, dy3=y0-y1+y2-y3
  const det=dx1*dy2-dx2*dy1
  const g=(dx3*dy2-dx2*dy3)/det, h=(dx1*dy3-dx3*dy1)/det
  return [x1-x0+g*x1,x3-x0+h*x3,x0, y1-y0+g*y1,y3-y0+h*y3,y0, g,h,1]
}

function inverse([a,b,c,d,e,f,g,h,i]) {
  // Homogeneous coordinates cancel the common 1/determinant factor.
  return [e*i-f*h,c*h-b*i,b*f-c*e, f*g-d*i,a*i-c*g,c*d-a*f, d*h-e*g,b*g-a*h,a*e-b*d]
}

export function mapQuadPoint([x,y], quad, backwards = false) {
  const matrix = squareToQuad(quad)
  if (!matrix) return null
  const [a,b,c,d,e,f,g,h,i] = backwards ? inverse(matrix) : matrix
  const z = g*x+h*y+i
  return Math.abs(z) < 1e-12 ? null : [(a*x+b*y+c)/z, (d*x+e*y+f)/z]
}

export function coverRect(sourceAspect, destinationAspect) {
  const scale = destinationAspect / sourceAspect
  const w = Math.min(1,scale), h = Math.min(1,1/scale)
  return [(1-w)/2,(1-h)/2,w,h]
}

function shader(gl, type, source) {
  const handle = gl.createShader(type)
  gl.shaderSource(handle, source)
  gl.compileShader(handle)
  if (!gl.getShaderParameter(handle, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(handle))
  return handle
}

export function textureRenderer(canvas, transparent = false) {
  const gl = canvas.getContext('webgl', {alpha:transparent, antialias:false, preserveDrawingBuffer:true})
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
    uniform vec4 crop;
    uniform bool ellipse;
    uniform sampler2D artwork;
    void main() {
      vec3 p = warp * vec3(uv, 1.0);
      vec2 unit = p.xy / p.z;
      vec2 delta = unit - 0.5;
      if (abs(p.z) < 1e-12 || any(lessThan(unit,vec2(0.0))) || any(greaterThan(unit,vec2(1.0)))
          || (ellipse && dot(delta,delta)>0.25)) {
        gl_FragColor = vec4(0.0,0.0,0.0,${transparent ? '0.0' : '1.0'});
      } else {
        vec4 color = texture2D(artwork, crop.xy + unit*crop.zw);
        gl_FragColor = vec4(color.rgb,${transparent ? 'color.a' : '1.0'});
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
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0)
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  // Filter premultiplied pixels so transparent edges keep their original color.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true)
  const warp = gl.getUniformLocation(program,'warp')
  const crop = gl.getUniformLocation(program,'crop')
  const ellipse = gl.getUniformLocation(program,'ellipse')
  return (source, matrix, region = [0,0,1,1], oval = false, clip) => {
    gl.viewport(0,0,canvas.width,canvas.height)
    if (clip) {
      gl.enable(gl.SCISSOR_TEST)
      gl.scissor(clip[0],canvas.height-clip[1]-clip[3],clip[2],clip[3])
    } else gl.disable(gl.SCISSOR_TEST)
    if (!source) {
      gl.clearColor(0,0,0,transparent ? 0 : 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      return
    }
    gl.uniformMatrix3fv(warp,false,[matrix[0],matrix[3],matrix[6],matrix[1],matrix[4],matrix[7],matrix[2],matrix[5],matrix[8]])
    gl.uniform4fv(crop,region)
    gl.uniform1i(ellipse,oval ? 1 : 0)
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source)
    gl.drawArrays(gl.TRIANGLES,0,3)
  }
}

// One lazily allocated WebGL pass serves every warped layer in a composition.
export function warpRenderer() {
  let canvas, render
  return (ctx, source, sourceRect, quad, {ellipse = false} = {}) => {
    const matrix = squareToQuad(quad)
    if (!matrix || !source) return false
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); render=null })
      canvas.addEventListener('webglcontextrestored', () => { render=textureRenderer(canvas,true) })
      render = textureRenderer(canvas,true)
    }
    if (!render) return false
    const {width,height} = ctx.canvas
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    const [x,y,w,h] = quadBounds(quad)
    const left=Math.max(0,Math.floor(x*width)), top=Math.max(0,Math.floor(y*height))
    const right=Math.min(width,Math.ceil((x+w)*width)), bottom=Math.min(height,Math.ceil((y+h)*height))
    if (right<=left || bottom<=top) return false
    const clip=[left,top,right-left,bottom-top]
    render(source,inverse(matrix),sourceRect,ellipse,clip)
    ctx.drawImage(canvas,...clip,...clip)
    return true
  }
}
