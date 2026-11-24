function validateLayerShader(regl, source) {
  const gl = regl._gl
  const shader = gl.createShader(gl.FRAGMENT_SHADER)
  try {
    gl.shaderSource(shader,source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {
      throw new Error('Error GLSL · '+gl.getShaderInfoLog(shader).replace(/\0/g,'').trim())
    }
  } finally { gl.deleteShader(shader) }
}

// Layer sketches keep their own Hydra outputs and transforms in the stage's WebGL context.
class SectorProgram {
  constructor(engine, base, library = false) {
    const {hydra,h,r} = engine
    this.outputs = new Map()
    this.frameSize = []
    this.scope = Object.create(null)
    const reference = hydra.o[0], Generator = hydra.generator.constructor
    const outputs = Array.from({length:4},(_,index)=>({
      precision:reference.precision,
      getTexture:()=>this.outputs.get(index)?.getTexture() || this.empty,
      render:passes=>{
        validateLayerShader(r,passes[0].frag)
        let output = this.outputs.get(index)
        if (!output) {
          output = new reference.constructor({regl:r,precision:reference.precision,width:2,height:2})
          this.outputs.set(index,output)
        }
        output.render(passes)
      }
    }))
    const generator = new Generator({defaultUniforms:reference.uniforms,defaultOutput:outputs[0],
      changeListener:({method,synth})=>{this.scope[method]=synth.generators[method]}})
    generator.sourceClass.prototype.out = function (output = outputs[0]) {
      output.render(this.glsl(output))
    }
    // Native layer programs can read shared media but manage their own writes and clocks.
    this.empty = r.texture({width:1,height:1})
    Object.assign(this.scope,generator.generators,{
      a:h.a, mouse:h.mouse, time:h.time, width:engine.canvas.width, height:engine.canvas.height,
      bpm:window.bpm, speed:1, fps:undefined, update:()=>{}, afterUpdate:()=>{},
      base:()=>generator.generators.src(base),
      render:output=>{this.index = output ? outputs.indexOf(output) : 'all'},
      setFunction:def=>generator.setFunction(def),
      setResolution:(w,h)=>{
        if (Number.isInteger(w) && Number.isInteger(h) && w>0 && h>0 && w<=4096 && h<=4096) this.resolution=[w,h]
      }
    })
    for (let i=0;i<4;i++) {
      this.scope['s'+i]={getTexture:()=>hydra.s[i].getTexture()}
      this.scope['o'+i]=library ? outputs[i] : {getTexture:()=>hydra.o[i].getCurrent()}
    }
    this.generator = generator
    this.index = 0
    this.regl = r
  }
  run(code) {
    const info=inspectScore(code,this.generator.glslTransforms)
    if (info.asyncCode || info.calls.some(c=>/^(initCam|initScreen|initStream|initVideo|initImage|init|clear|loadScript|hush)$/.test(c.callee.name || c.callee.property?.name)))
      throw new Error('Conectá las fuentes desde Imagen. Los sectores usan código síncrono y pueden leer s0–s3.')
    for (const name of info.assignments) {
      if (!Object.hasOwn(this.scope,name)) this.scope[name]=undefined
    }
    return compileScore(code,this.scope,true)()
  }
  texture(index) {
    return index==='all' ? this.mosaic : this.outputs.get(index)?.getCurrent()
  }
  image() {
    return this.generator.generators.src({getTexture:()=>this.texture(this.index) || this.empty})
  }
  frameMosaic(resolution) {
    if (!this.mosaic) {
      const r = this.regl
      this.mosaic=r.framebuffer({width:2,height:2,depthStencil:false})
      this.tile=r({
        framebuffer:this.mosaic,
        vert:'precision mediump float; attribute vec2 position; varying vec2 uv; void main(){uv=position;gl_Position=vec4(position*2.0-1.0,0.,1.);}',
        frag:`precision mediump float;
          varying vec2 uv;
          uniform sampler2D a,b,c,d;
          void main() {
            vec2 st=fract(uv*2.0);
            if (uv.y >= .5) gl_FragColor=uv.x < .5 ? texture2D(a,st) : texture2D(b,st);
            else gl_FragColor=uv.x < .5 ? texture2D(c,st) : texture2D(d,st);
          }`,
        attributes:{position:[[-2,0],[0,-2],[2,2]]},count:3,
        uniforms:Object.fromEntries(['a','b','c','d'].map((name,i)=>[name,()=>this.texture(i) || this.empty])),
        depth:{enable:false}
      })
    }
    if (this.mosaic.width!==resolution[0] || this.mosaic.height!==resolution[1]) this.mosaic.resize(...resolution)
    this.tile()
  }
  frame(props,dt) {
    const {scope} = this
    const resolution = this.resolution || props.resolution
    if (resolution.some((n,i)=>n!==this.frameSize[i])) {
      this.outputs.forEach(o=>o.resize(...resolution))
      this.frameSize = resolution
    }
    scope.time += dt*.001*(Number(scope.speed)||0)
    ;[scope.width,scope.height]=resolution
    if (!this.outputs.size) { scope.bpm=props.bpm; return }
    scope.update(dt)
    this.outputs.forEach(o=>o.tick({...props,resolution,time:scope.time,bpm:scope.bpm}))
    if (this.index==='all') this.frameMosaic(resolution)
    scope.afterUpdate(dt)
  }
  destroy() {
    this.empty.destroy()
    this.mosaic?.destroy()
    for (const output of this.outputs.values()) {
      output.positionBuffer.destroy()
      for (const fbo of output.fbos) {
        fbo.color[0].destroy()
        fbo.destroy()
      }
    }
  }
}
