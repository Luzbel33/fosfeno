// The inspector interprets a small, closed set of score expressions. Its Hydra
// generator starts with stock transforms and never sees the stage's custom code.
class VisualParameterPreview {
  constructor(canvas) {
    this.canvas=canvas
    this.screen=canvas.getContext('2d',{alpha:false})
    this.canvas.width=256
    this.canvas.height=144
  }
  show(code,{kind='library',definitions=[],audioLevels}={}) {
    cancelAnimationFrame(this.animation)
    try {
      if (definitions?.length) throw Error('Este efecto usa una función GLSL personalizada. Podés editarlo en el inspector.')
      if (typeof code!=='string' || code.length>12000) throw Error('Este sketch supera el tamaño de la miniatura.')
      const Generator=window.hydraSynth?.generator?.constructor
      if (!Generator) throw Error('El motor Hydra todavía no está listo.')
      const generator=new Generator({defaultOutput:{precision:'mediump'},defaultUniforms:{}})
      const passes=VisualParameterPreview.score(code,kind,generator,audioLevels)
      this.renderer ??= VisualParameterPreview.renderer(this.canvas.width,this.canvas.height)
      const draw=this.renderer.install(passes)
      const start=performance.now()
      let previous=-100
      const frame=now=>{
        if (now-previous>=1000/20) {
          draw((now-start)/1000)
          this.screen.drawImage(this.renderer.canvas,0,0)
          previous=now
        }
        this.animation=requestAnimationFrame(frame)
      }
      frame(start)
      return {ok:true,reason:''}
    } catch (error) {
      this.stop()
      return {ok:false,reason:error.message}
    }
  }
  stop() {
    cancelAnimationFrame(this.animation)
    this.renderer?.dispose()
    this.renderer=null
    this.screen.clearRect(0,0,this.canvas.width,this.canvas.height)
  }

  static score(code,kind,generator,audioLevels) {
    const unsupported=()=>{throw Error('La miniatura admite cadenas Hydra nativas y cálculos de tiempo. Podés editar este sketch en el inspector.')}
    const external=()=>{throw Error('La miniatura necesita una entrada en vivo para mostrar este sketch. Podés ajustar sus parámetros en el inspector.')}
    if (kind==='operator') code='osc(12,0.07,1.5).modulate(noise(3,0.09),0.14)'+code.trim()
    let tree
    try {tree=acorn.parse(code,{ecmaVersion:2022})} catch {throw Error('Completá la expresión para ver su miniatura.')}
    const passes=new Map(), constants=new Map(), callbacks=new Map(), slots=new Set(), definitions=generator.glslTransforms
    const locals=new Set(tree.body.filter(line=>line.type==='VariableDeclaration').flatMap(line=>line.declarations.map(d=>d.id.name)))
    let operations=0,selected=0,hasRender=false,speed=1
    const outputIndex=n=>n?.type==='Identifier' && /^o[0-3]$/.test(n.name) ? Number(n.name[1]) : unsupported()
    const nameOf=c=>c.type==='MemberExpression' && !c.optional && !c.computed ? c.property.name : null
    const math=new Set(['sin','cos','tan','abs','min','max','sqrt','pow','floor','ceil','round','atan','atan2','log','exp','sign'])
    const binary={'+':(a,b)=>a+b,'-':(a,b)=>a-b,'*':(a,b)=>a*b,'/':(a,b)=>a/b,'%':(a,b)=>a%b,'**':(a,b)=>a**b}
    // Compile only numeric expressions into closures. No source text is passed to eval().
    function number(n) {
      if (n.type==='Literal' && typeof n.value==='number' && Number.isFinite(n.value)) return ()=>n.value
      if (n.type==='Identifier') {
        if (constants.has(n.name)) return constants.get(n.name)
        if (n.name==='time') return p=>p.time
        if (['a','mouse'].includes(n.name)) external()
      }
      if (n.type==='MemberExpression') {
        const fft=n.object
        if (!n.optional && n.computed && n.property.type==='Literal' && Number.isSafeInteger(n.property.value) &&
            n.property.value>=0 && fft.type==='MemberExpression' && nameOf(fft)==='fft' &&
            fft.object.type==='Identifier' && fft.object.name==='a' && !locals.has('a')) {
          const index=n.property.value
          return p=>{
            p.bands ??= audioLevels?.() || []
            const value=p.bands[index]
            return Number.isFinite(value) ? value : 0
          }
        }
        const head=n.object?.name || n.object?.object?.name
        if (['a','mouse'].includes(head)) external()
        if (head==='Math' && !n.computed && ['PI','E'].includes(n.property.name)) return ()=>Math[n.property.name]
      }
      if (n.type==='UnaryExpression' && ['+','-'].includes(n.operator)) {
        const operand=number(n.argument)
        return n.operator==='-' ? p=>-operand(p) : operand
      }
      if (n.type==='BinaryExpression' && Object.hasOwn(binary,n.operator)) {
        const left=number(n.left),right=number(n.right),op=binary[n.operator]
        return p=>op(left(p),right(p))
      }
      if (n.type==='CallExpression' && n.callee.object?.name==='Math' && math.has(nameOf(n.callee)) && n.arguments.length<=4) {
        const fn=Math[nameOf(n.callee)],args=n.arguments.map(number)
        return p=>fn(...args.map(arg=>arg(p)))
      }
      unsupported()
    }
    const initial={time:0,bpm:30}
    function argument(n,input) {
      if (n.type==='Identifier' && /^s[0-3]$/.test(n.name)) external()
      if (input.type==='sampler2D') {
        const index=outputIndex(n)
        slots.add(index)
        return {getTexture:()=>index}
      }
      if (n.type==='Identifier' && callbacks.has(n.name)) return callbacks.get(n.name)
      if (n.type==='ArrowFunctionExpression' && !n.async && !n.params.length) return number(n.body)
      if (n.type==='ArrayExpression' && n.elements.length && n.elements.length<=32) return n.elements.map(el=>number(el)(initial))
      if (input.type==='vec4' || n.type==='CallExpression' && n.callee.object?.name!=='Math') return chain(n)
      return number(n)(initial)
    }
    function chain(n) {
      if (n.type!=='CallExpression' || n.optional || ++operations>50) unsupported()
      const source=n.callee.type==='Identifier', name=source ? n.callee.name : nameOf(n.callee)
      const def=Object.hasOwn(definitions,name) && definitions[name]
      if (!def || (def.type==='src')!==source || n.arguments.length>def.inputs.length) {
        if (/^s[0-3]$/.test(n.callee.object?.name)) external()
        unsupported()
      }
      if (name==='src' && n.arguments.length!==1) external()
      const args=n.arguments.map((el,i)=>argument(el,def.inputs[i]))
      return source ? generator.generators[name](...args) : chain(n.callee.object)[name](...args)
    }
    for (const line of tree.body) {
      if (line.type==='EmptyStatement') continue
      if (line.type==='VariableDeclaration' && line.kind==='const') {
        for (const item of line.declarations) {
          if (item.id.type!=='Identifier' || !item.init || constants.has(item.id.name) || callbacks.has(item.id.name) || ['time','Math'].includes(item.id.name)) unsupported()
          if (item.init.type==='ArrowFunctionExpression') {
            if (item.init.async || item.init.params.length)
              throw Error('Este sketch define '+item.id.name+' como función propia. La miniatura admite fórmulas numéricas sin argumentos.')
            callbacks.set(item.id.name,number(item.init.body))
            continue
          }
          // Evaluate constants once, avoiding exponential reference expansion and matching JS declarations.
          const value=number(item.init)(initial)
          constants.set(item.id.name,()=>value)
        }
        continue
      }
      const n=line.expression
      if (n?.type==='AssignmentExpression' && n.left.type==='Identifier' && n.left.name==='speed') {
        const signed=n.right.type==='UnaryExpression' && ['-','+'].includes(n.right.operator)
        const literal=signed ? n.right.argument : n.right
        if (locals.has('speed') || n.operator!=='=' || literal.type!=='Literal' || !Number.isFinite(literal.value))
          throw Error('La miniatura admite speed con un número literal. Podés editar esta expresión en el inspector.')
        speed=signed && n.right.operator==='-' ? -literal.value : literal.value
        continue
      }
      if (n?.type==='CallExpression' && n.callee.type==='Identifier' && n.callee.name==='setFunction')
        throw Error('Este sketch define una función GLSL personalizada. Podés editarlo en el inspector.')
      if (line.type!=='ExpressionStatement' || n?.type!=='CallExpression' || n.optional) unsupported()
      if (n.callee.type==='Identifier' && n.callee.name==='render') {
        if (n.arguments.length!==1) unsupported()
        selected=outputIndex(n.arguments[0]); hasRender=true
        continue
      }
      const out=nameOf(n.callee)==='out'
      if (out && n.arguments.length>1) unsupported()
      const target=out && n.arguments.length ? outputIndex(n.arguments[0]) : 0
      const source=chain(out ? n.callee.object : n)
      const shader=source.glsl()[0]
      if (!shader || shader.frag.length>90000) unsupported()
      passes.set(target,shader)
      slots.add(target)
    }
    if (!passes.size) unsupported()
    if (!passes.has(selected) && !hasRender && passes.size===1) selected=passes.keys().next().value
    slots.add(selected)
    return {passes,slots,selected,speed}
  }

  static renderer(width,height) {
    const canvas=document.createElement('canvas')
    canvas.width=width; canvas.height=height
    const gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false})
    if (!gl) throw Error('La miniatura necesita WebGL disponible en el navegador.')
    let programs=[],surfaces=[]
    const shader=(type,source)=>{
      const s=gl.createShader(type)
      gl.shaderSource(s,source); gl.compileShader(s)
      if (!gl.getShaderParameter(s,gl.COMPILE_STATUS)) {gl.deleteShader(s);throw Error('WebGL no pudo compilar la miniatura de este sketch.')}
      return s
    }
    const vert=shader(gl.VERTEX_SHADER,'attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}')
    function link(source) {
      const frag=shader(gl.FRAGMENT_SHADER,source), program=gl.createProgram()
      gl.attachShader(program,vert); gl.attachShader(program,frag)
      gl.bindAttribLocation(program,0,'position')
      gl.linkProgram(program); gl.deleteShader(frag)
      if (!gl.getProgramParameter(program,gl.LINK_STATUS)) {gl.deleteProgram(program);throw Error('WebGL no pudo preparar la miniatura de este sketch.')}
      return program
    }
    const screen=link('precision mediump float; varying vec2 uv; uniform sampler2D tex; void main(){gl_FragColor=texture2D(tex,vec2(uv.x,1.-uv.y));}')
    const triangle=gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER,triangle)
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0)
    function target() {
      const tex=gl.createTexture(),fbo=gl.createFramebuffer()
      gl.bindTexture(gl.TEXTURE_2D,tex)
      for (const param of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D,param,gl.NEAREST)
      for (const param of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D,param,gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null)
      gl.bindFramebuffer(gl.FRAMEBUFFER,fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0)
      surfaces.push({fbo,tex})
      return {fbo,tex}
    }
    function reset() {
      for (const p of programs) gl.deleteProgram(p)
      for (const {fbo,tex} of surfaces) {gl.deleteFramebuffer(fbo);gl.deleteTexture(tex)}
      programs=[]; surfaces=[]
    }
    return {canvas,install({passes,slots,selected,speed}) {
      reset()
      const outputs=new Map([...slots].map(i=>[i,[target(),target()]])),draw=[]
      for (const [index,pass] of [...passes].sort(([a],[b])=>a-b)) {
        const program=link(pass.frag),uniforms=[]
        programs.push(program)
        for (let i=0;i<gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS);i++) {
          const {name,type}=gl.getActiveUniform(program,i)
          uniforms.push({name,type,loc:gl.getUniformLocation(program,name)})
        }
        draw.push(props=>{
          const pair=outputs.get(index)
          gl.bindFramebuffer(gl.FRAMEBUFFER,pair[1].fbo); gl.useProgram(program)
          let unit=0
          for (const {name,type,loc} of uniforms) {
            if (name==='time') gl.uniform1f(loc,props.time)
            else if (name==='resolution') gl.uniform2f(loc,width,height)
            else if (type===gl.SAMPLER_2D) {
              const src=name==='prevBuffer' ? pair[0] : outputs.get(pass.uniforms[name]())[0]
              gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,src.tex);gl.uniform1i(loc,unit++)
            } else {
              const value=pass.uniforms[name](null,props)
              gl.uniform1f(loc,Number.isFinite(value)?value:0)
            }
          }
          gl.drawArrays(gl.TRIANGLES,0,3); pair.reverse()
        })
      }
      return time=>{
        const props={time:time*speed,bpm:30}
        for (const pass of draw) pass(props)
        gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.useProgram(screen)
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,outputs.get(selected)[0].tex)
        gl.drawArrays(gl.TRIANGLES,0,3)
      }
    },dispose() {
      reset();gl.deleteProgram(screen);gl.deleteShader(vert);gl.deleteBuffer(triangle)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }}
  }
}
