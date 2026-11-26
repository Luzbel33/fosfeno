import { makePose, poseAnimated, poseAt } from './pose-3d.mjs?v=3.1'

function readManifest(bytes) {
  const bad = () => { throw new Error('Elegí un .glb binario válido exportado como glTF 2.0.') }
  if (bytes.byteLength < 20) bad()
  const data=new DataView(bytes)
  if (data.getUint32(0,true)!==0x46546c67 || data.getUint32(4,true)!==2 ||
      data.getUint32(8,true)!==bytes.byteLength || data.getUint32(16,true)!==0x4e4f534a) bad()
  const size=data.getUint32(12,true)
  if (size>bytes.byteLength-20) bad()
  let spec
  try { spec=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,size))) } catch { bad() }
  if (!Array.isArray(spec.meshes) || !spec.meshes.length) throw new Error('El modelo no contiene mallas para proyectar.')
  for (const item of [...(spec.buffers || []), ...(spec.images || [])]) {
    if (item.uri!=null && !/^data:(?:image\/(?:png|jpeg|webp|avif)|application\/(?:octet-stream|gltf-buffer));base64,/i.test(item.uri))
      throw new Error('El .glb usa archivos externos. Exportalo desde Blender con imágenes y geometría embebidas.')
  }
  if (spec.extensionsRequired?.some(id=>['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'].includes(id)))
    throw new Error('Exportá el .glb sin compresión Draco, Meshopt ni texturas KTX2.')
  const names=items=>({total:items.length,names:items.slice(0,24).map((item,i)=>item.name?.slice(0,120) || '#'+i)})
  return {meshes:names(spec.meshes),materials:names(spec.materials || []),animations:names(spec.animations || [])}
}

let studio, users=0
function resources(T) {
  if (studio) return studio
  const renderer=new T.WebGLRenderer({alpha:true,antialias:true})
  renderer.setSize(768,768,false)
  renderer.setClearColor(0,0)
  const room=new T.RoomEnvironment()
  const generator=new T.PMREMGenerator(renderer)
  const environment=generator.fromScene(room,0.04)
  generator.dispose()
  room.dispose()
  studio={renderer,environment}
  return studio
}

function disposeMeshes(root) {
  const textures=new Set(), materials=new Set(), geometries=new Set(), skeletons=new Set()
  root.traverse(o=>{
    if (o.geometry) geometries.add(o.geometry)
    if (o.skeleton) skeletons.add(o.skeleton)
    if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m)
  })
  for (const m of materials) {
    for (const v of Object.values(m)) if (v?.isTexture) textures.add(v)
    m.dispose()
  }
  for (const tex of textures) { tex.dispose(); tex.source?.data?.close?.() }
  for (const g of geometries) g.dispose()
  for (const skeleton of skeletons) skeleton.dispose()
}

export async function openModel(file, signal) {
  const bytes=await file.arrayBuffer()
  signal.throwIfAborted()
  const summary=readManifest(bytes)
  const T=await import('../vendor/three/three-gltf-0.187.0.min.mjs')
  signal.throwIfAborted()
  const manager=new T.LoadingManager()
  manager.setURLModifier(url=>{
    if (/^(?:blob:|data:)/i.test(url)) return url
    throw new Error('Sólo se admiten recursos embebidos en el .glb.')
  })
  const loaded=await new T.GLTFLoader(manager).parseAsync(bytes,'')
  const root=loaded.scene
  let claimed=false, closed=false
  function dispose() {
    if (closed) return
    closed=true
    disposeMeshes(root)
    if (claimed && --users===0) {
      studio.environment.dispose()
      studio.renderer.dispose()
      studio.renderer.forceContextLoss()
      studio=null
    }
  }
  try {
    signal.throwIfAborted()
    const sphere=new T.Box3().setFromObject(root,true).getBoundingSphere(new T.Sphere())
    if (!(sphere.radius>0 && Number.isFinite(sphere.radius))) throw new Error('La malla está vacía o tiene dimensiones inválidas.')
    const {renderer,environment}=resources(T)
    users++; claimed=true
    const scene=new T.Scene(), model=new T.Group(), pivot=new T.Group()
    scene.environment=environment.texture
    const sky=new T.HemisphereLight(0xffffff,0x848eac,1.4)
    const light=new T.DirectionalLight(0xffffff,2.2)
    light.position.set(3,4,3)
    scene.add(sky,light,pivot)
    pivot.add(model)
    model.scale.setScalar(.85/sphere.radius)
    root.position.sub(sphere.center)
    model.add(root)
    const orthographic=new T.OrthographicCamera(-1,1,1,-1,.1,60)
    orthographic.position.z=10
    // Match the two cameras' framing on the plane through the model's centre.
    const distance=2.5, fieldOfView=2*Math.atan(1/distance)*180/Math.PI
    const perspective=new T.PerspectiveCamera(fieldOfView,1,.1,60)
    perspective.position.z=distance
    const fallback=makePose(), frames=new WeakMap(), start=performance.now()
    function frame(view, now=performance.now(), owner=fallback) {
      view ??= fallback
      let output=frames.get(owner)
      if (!output) {
        const canvas=document.createElement('canvas')
        canvas.width=canvas.height=768
        output={canvas,ctx:canvas.getContext('2d'),last:-1}
        frames.set(owner,output)
      }
      const tick=poseAnimated(view) ? Math.floor(Math.max(0,now-start)*.03) : 0
      if (output.last!==tick || output.view!==view) {
        const pose=poseAt(view,now/1000)
        pivot.rotation.set(pose.x,pose.y,pose.z)
        pivot.scale.setScalar(pose.scale)
        pivot.position.set(2*pose.dx,-2*pose.dy,0)
        renderer.render(scene,view.projection==='perspective' ? perspective : orthographic)
        output.ctx.globalCompositeOperation='copy'
        output.ctx.drawImage(renderer.domElement,0,0)
        output.last=tick
        output.view=view
        output.canvas.modelFrame=(output.canvas.modelFrame || 0)+1
      }
      return output.canvas
    }
    return {frame,dispose,summary}
  } catch (error) { dispose(); throw error }
}
