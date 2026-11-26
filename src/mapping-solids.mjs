import { makePose, poseAt, readPose } from './pose-3d.mjs?v=3.1'

const cubeVertices=[[-1,1,1],[1,1,1],[1,-1,1],[-1,-1,1],[-1,1,-1],[1,1,-1],[1,-1,-1],[-1,-1,-1]]
const meshes={
  cube:{name:'Cubo',vertices:cubeVertices,faces:[
    ['Frente',[0,1,2,3]],['Derecha',[1,5,6,2]],['Atrás',[5,4,7,6]],
    ['Izquierda',[4,0,3,7]],['Superior',[4,5,1,0]],['Inferior',[3,2,6,7]]]},
  pyramid:{name:'Pirámide',vertices:[[0,1.35,0],[-1,-.85,1],[1,-.85,1],[1,-.85,-1],[-1,-.85,-1]],faces:[
    ['Frente',[0,2,1]],['Derecha',[0,3,2]],['Atrás',[0,4,3]],['Izquierda',[0,1,4]],['Base',[1,2,3,4]]]}
}
export const solidFaces=kind=>meshes[kind].faces.map(([name])=>name)
export function makeSolid(shape) {
  const colors=['#7ae2d7','#fb9986','#80aaff','#ad93ff','#e6d59b','#6f8aad']
  return {shape,pose:makePose(),faces:meshes[shape].faces.map((_,i)=>({type:'color',color:colors[i]}))}
}
export function packSolid(solid,assetId) {
  return {...solid,faces:solid.faces.map(({file,...m})=>file?{...m,asset:assetId(file)}:m)}
}
export function unpackSolid(raw,files) {
  if (!raw || !Object.hasOwn(meshes,raw.shape) || !Array.isArray(raw.faces) || raw.faces.length!==meshes[raw.shape].faces.length)
    throw new Error('La figura 3D del mapa es inválida.')
  const faces=raw.faces.map(m=>{
    if (m?.type==='color' && /^#[\da-f]{6}$/i.test(m.color)) return {type:'color',color:m.color}
    if (m?.type==='hydra' && (m.sector==null || Number.isSafeInteger(m.sector) && m.sector>0))
      return m.sector ? {type:'hydra',sector:m.sector} : {type:'hydra'}
    if (m?.type==='file' && Number.isInteger(m.asset) && files[m.asset]) return {type:'file',file:files[m.asset],role:m.role==='loop'?'loop':undefined}
    throw new Error('El material de una cara es inválido.')
  })
  return {shape:raw.shape,pose:readPose(raw.pose),faces}
}
function projectedFaces(solid,seconds) {
  const mesh=meshes[solid.shape], pose=poseAt(solid.pose,seconds)
  const cx=Math.cos(pose.x),sx=Math.sin(pose.x),cy=Math.cos(pose.y),sy=Math.sin(pose.y),cz=Math.cos(pose.z),sz=Math.sin(pose.z)
  const scale=2.25*pose.scale*(solid.pose.path==='none'?1:1-1.5*solid.pose.radius/100)
  const verts=mesh.vertices.map(([x,y,z])=>{
    const u=x*cy+z*sy,v=-x*sy+z*cy
    const a=y*cx-v*sx,b=y*sx+v*cx,depth=4.3-b
    const nx=scale*(u*cz-a*sz)/depth+2*pose.dx, ny=scale*(u*sz+a*cz)/depth-2*pose.dy
    return {x:(1+nx)/2,y:(1-ny)/2,depth,clip:[nx*depth,ny*depth,depth-2,depth]}
  })
  return mesh.faces.map(([,indices],index)=>{
    const points=indices.map(i=>verts[i])
    return {index,points}
  }).filter(({points:[a,b,c]})=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)>1e-8)
}
export function solidFaceAt(solid,point,seconds) {
  const [x,y]=point
  for (const {index,points} of projectedFaces(solid,seconds)) {
    if (points.every((a,i)=>{const b=points[(i+1)%points.length]; return (b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x)>=-1e-6})) return index
  }
  return -1
}

// One GPU stage serves all convex solids. Perspective-correct interpolation uses
// the vertex depth as clip.w, including across the diagonal of a quad.
export function solidRenderer() {
  const canvas=document.createElement('canvas')
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true})
  if (!gl) throw new Error('La figura 3D necesita WebGL.')
  const program=gl.createProgram()
  for (const [kind,source] of [[gl.VERTEX_SHADER,`attribute vec4 point; attribute vec2 texel; varying vec2 uv;
    void main(){gl_Position=point;uv=texel;}`],[gl.FRAGMENT_SHADER,`precision mediump float; varying vec2 uv;
    uniform vec4 color; uniform sampler2D source; uniform bool textured; uniform vec2 crop;
    void main(){gl_FragColor=textured?texture2D(source,(uv-.5)*crop+.5):color;}`]]) {
    const s=gl.createShader(kind); gl.shaderSource(s,source); gl.compileShader(s); gl.attachShader(program,s); gl.deleteShader(s)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer())
  for (const [name,size,offset] of [['point',4,0],['texel',2,16]]) {
    const location=gl.getAttribLocation(program,name)
    gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,24,offset)
  }
  const color=gl.getUniformLocation(program,'color'), textured=gl.getUniformLocation(program,'textured'), crop=gl.getUniformLocation(program,'crop')
  gl.bindTexture(gl.TEXTURE_2D,gl.createTexture())
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true)
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4))
  const quadUV=[[0,0],[1,0],[1,1],[0,1]], triangleUV=[[.5,0],[1,1],[0,1]]
  return (solid,seconds,resolution,sourceFor)=>{
    const size=Math.max(64,Math.min(1280,Math.ceil(resolution/32)*32))
    if (canvas.width!==size || canvas.height!==size) canvas.width=canvas.height=size
    gl.viewport(0,0,size,size); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT)
    let uploaded=null, uploadedSector
    for (const {index,points} of projectedFaces(solid,seconds)) {
      const material=solid.faces[index], source=material.type==='color'?null:sourceFor(material)
      const w=source?.videoWidth||source?.naturalWidth||source?.width, h=source?.videoHeight||source?.naturalHeight||source?.height
      if (material.type!=='color' && (!w || !h || source.readyState<2)) continue
      const uv=points.length===3?triangleUV:quadUV
      const data=points.flatMap((p,i)=>[...p.clip,...uv[i]])
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STREAM_DRAW)
      gl.uniform1i(textured,source?1:0)
      if (source) {
        if (uploaded!==source || uploadedSector!==material.sector)
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source)
        uploaded=source; uploadedSector=material.sector
        gl.uniform2f(crop,Math.min(1,h/w),Math.min(1,w/h))
      } else {
        const rgb=parseInt(material.color.slice(1),16)
        gl.uniform4f(color,(rgb>>16)/255,((rgb>>8)&255)/255,(rgb&255)/255,1)
      }
      gl.drawArrays(gl.TRIANGLE_FAN,0,points.length)
    }
    return canvas
  }
}
