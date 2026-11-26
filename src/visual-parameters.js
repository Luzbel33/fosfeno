const visualParameterNames = {
  frequency:'Frecuencia', freq:'Frecuencia', sync:'Velocidad de fase', offset:'Desfase',
  speed:'Velocidad', speedX:'Velocidad horizontal', speedY:'Velocidad vertical',
  scale:'Escala', xMult:'Escala horizontal', yMult:'Escala vertical',
  offsetX:'Desfase horizontal', offsetY:'Desfase vertical', scrollX:'Desplazamiento horizontal',
  scrollY:'Desplazamiento vertical', blending:'Mezcla', sides:'Lados', nSides:'Lados',
  radius:'Radio', smoothing:'Suavizado', angle:'Ángulo (rad)', multiple:'Multiplicador',
  pixelX:'Píxeles horizontales', pixelY:'Píxeles verticales', bins:'Niveles', gamma:'Gamma',
  repeatX:'Repeticiones horizontales', repeatY:'Repeticiones verticales', reps:'Repeticiones',
  threshold:'Umbral', tolerance:'Tolerancia', hue:'Tono', r:'Rojo', g:'Verde', b:'Azul', a:'Alfa'
}
const visualAmountNames = {
  blend:'Mezcla', modulate:'Intensidad', invert:'Inversión', brightness:'Brillo',
  contrast:'Contraste', saturate:'Saturación', scale:'Escala', colorama:'Ciclo de color'
}
const visualSequenceInputs = {
  fast:[['Velocidad de secuencia',1]],
  smooth:[['Suavizado de secuencia',1]],
  offset:[['Desfase de secuencia',.5]],
  fit:[['Mínimo de secuencia',0],['Máximo de secuencia',1]]
}

function parseVisualParameters(code) {
  const options = {ecmaVersion:'latest',locations:true,allowAwaitOutsideFunction:true,allowReturnOutsideFunction:true}
  const offset = acorn.tokenizer(code,options).getToken().type.label === '.' ? 6 : 0
  const source = offset ? 'base()'+code : code
  const tokens = []
  return {tree:acorn.parse(source,{...options,onToken:tokens}),offset,tokens}
}
function visualChildNodes(node, visit) {
  for (const [key,value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      for (const [i,child] of value.entries()) if (child?.type) visit(child,key+'/'+i)
    } else if (value?.type) visit(value,key)
  }
}
function visualProperty(object, key) {
  return object?.properties?.find(prop=>prop.type==='Property' && !prop.computed &&
    (prop.key.name ?? prop.key.value)===key)?.value
}
function visualScalar(node) {
  if (node?.type === 'Literal' && (Number.isFinite(node.value) || typeof node.value === 'boolean'))
    return node.value
  if (node?.type === 'UnaryExpression' && ['+','-'].includes(node.operator) &&
      node.argument.type === 'Literal' && Number.isFinite(node.argument.value))
    return node.operator === '-' ? -node.argument.value : node.argument.value
}
function visualMemberName(member) {
  if (member.type!=='MemberExpression') return undefined
  return member.computed ? (typeof member.property.value==='string' ? member.property.value : undefined) : member.property.name
}
function visualParameterRange(value, name, operator) {
  let suggested
  if (operator==='blend' && name==='amount' || name==='a') suggested=[0,1,.01]
  else if (['nSides','sides','reps','repeatX','repeatY','bins'].includes(name)) suggested=[1,32,1]
  else if (['pixelX','pixelY','frequency','freq'].includes(name)) suggested=[1,120,1]
  else if (name==='angle') suggested=[-Math.PI,Math.PI,.01]
  else if (name==='bpm') suggested=[24,240,1]
  else if (['r','g','b','radius','smoothing','threshold','tolerance'].includes(name)) suggested=[0,2,.01]
  else if (['speed','speedX','speedY','sync','hue'].includes(name)) suggested=[-1,1,.001]
  else {
    const magnitude=Math.abs(value)
    const extent=magnitude ? Math.min(Number.MAX_VALUE,magnitude*2) : 1
    const precision=magnitude ? Math.max(Number.MIN_VALUE,10 ** (Math.floor(Math.log10(magnitude))-2)) : .01
    suggested=[value<0 || !value ? -extent : 0,extent,precision]
  }
  const [min,max,step]=suggested
  return {min:Math.min(min,value),max:Math.max(max,value),step}
}

function visualParameterEntries(code, transforms) {
  const {tree,offset,tokens} = parseVisualParameters(code)
  const definitions = new Map(Object.entries(transforms || {}))
  const nodes = [], bindings = new Map(), parents = new WeakMap(), keys = new WeakMap()
  const outputChain = new Set(), records = [], emitted = new Set()
  function collect(node, path, parent) {
    nodes.push(node)
    keys.set(node,path)
    parents.set(node,parent)
    if (node.type==='VariableDeclarator' && node.id.type==='Identifier') {
      bindings.set(node.id.name,node.init)
    } else if (node.type==='AssignmentExpression' && node.operator==='=' && node.left.type==='Identifier' &&
      parent.type==='ExpressionStatement' && parents.get(parent)===tree) {
      bindings.set(node.left.name,node.right)
    } else if (node.type==='FunctionDeclaration' && node.id) {
      bindings.set(node.id.name,node)
    }
    visualChildNodes(node,(child,key)=>collect(child,path+'/'+key,node))
  }
  collect(tree,'',null)
  for (const node of nodes) {
    if (node.type!=='CallExpression') continue
    if (node.callee.name==='setFunction') {
      const definition=node.arguments[0]
      const name=visualProperty(definition,'name')?.value, type=visualProperty(definition,'type')?.value
      const inputs=visualProperty(definition,'inputs')?.elements
      if (typeof name==='string' && ['src','coord','color','combine','combineCoord'].includes(type) && inputs) {
        const prefix=type.startsWith('combine') ? [{name:'Imagen',type:'vec4'}] : []
        definitions.set(name,{type,inputs:[...prefix,...inputs.map(input=>({
          name:visualProperty(input,'name')?.value,type:visualProperty(input,'type')?.value,
          default:visualScalar(visualProperty(input,'default'))
        }))]})
      }
    }
    if (visualMemberName(node.callee)==='out' &&
        (!node.arguments.length || /^o[0-3]$/.test(node.arguments[0]?.name))) {
      for (let chain=node.callee.object;chain?.type==='CallExpression';chain=chain.callee.object)
        outputChain.add(chain)
    }
  }
  const closingTokens=new Map(tokens.slice(1).map((t,i)=>[t.start-offset,tokens[i].type.label]))
  function hasHydraValue(node,seen=new Set()) {
    if (!node || seen.has(node)) return false
    seen.add(node)
    if (node.type==='Identifier') return hasHydraValue(bindings.get(node.name),seen)
    if (node.type==='CallExpression') {
      const callee=node.callee
      if (callee.type==='Identifier') {
        const name=callee.name
        return name==='base' || (!bindings.has(name) && definitions.get(name)?.type==='src') ||
          hasHydraValue(bindings.get(name),seen)
      }
      if (callee.type==='MemberExpression') return hasHydraValue(callee.object,seen) || outputChain.has(node)
    }
    if (node.type==='ArrowFunctionExpression' || node.type==='FunctionExpression' || node.type==='FunctionDeclaration')
      return hasHydraValue(node.body,seen)
    if (node.type==='BlockStatement') return node.body.some(path=>path.type==='ReturnStatement' && hasHydraValue(path.argument,seen))
    if (node.type==='ChainExpression') return hasHydraValue(node.expression,seen)
    return false
  }
  const calls=nodes.filter(node=>node.type==='CallExpression' && (node.callee.property || node.callee).start>=offset)
    .map(call=>{
      const {callee}=call
      const name=callee.type==='Identifier' ? callee.name : visualMemberName(callee)
      const def=definitions.get(name)
      const valid=callee.type==='Identifier' ? def?.type==='src' && !bindings.has(name) :
        def?.type!=='src' && hasHydraValue(call)
      return {call,def:valid ? def : null,name,line:(callee.property || callee).loc.start.line}
    }).filter(({def})=>def?.inputs).sort((a,b)=>(a.call.callee.property || a.call.callee).start-(b.call.callee.property || b.call.callee).start)
  const groups=new Map()
  for (const hit of calls) {
    const base=hit.name+' · línea '+hit.line
    groups.set(base,(groups.get(base) || 0)+1)
  }
  const ordinals=new Map()
  function add(id,label,group,value,name,operator,from,to,write) {
    const kind=typeof value==='boolean' ? 'boolean' : 'number'
    records.push({
      item:{id,label,group,value,kind,...(kind==='number' ? visualParameterRange(value,name,operator) : {})},
      from,to,write
    })
  }
  function addScalar(node,id,label,group,name,operator,value) {
    const from=node.start-offset,to=node.end-offset
    if (emitted.has(from+':'+to)) return
    emitted.add(from+':'+to)
    add(id,label,group,value,name,operator,from,to,next=>{
      if (typeof next==='boolean') return String(next)
      const negative=next<0 || Object.is(next,-0), abs=String(Math.abs(next))
      let result
      if (node.type==='UnaryExpression') {
        const middle=code.slice(from+1,node.argument.start-offset), end=code.slice(node.argument.end-offset,to)
        const sign=negative ? '-' : node.operator==='+' ? '+' : ''
        result=sign+middle+abs+end
      } else result=negative ? '-'+abs : abs
      const parent=parents.get(node)
      // Unary negatives cannot be the left operand of ** or merge with a preceding minus.
      if (result.startsWith('-') && (code[from-1]==='-' || parent?.operator==='**' && parent.left===node))
        result='('+result+')'
      if (/^[\d]/.test(result) && /[\w$]/.test(code[from-1] || '')) result=' '+result
      return result
    })
  }
  const visitedBindings=new Set()
  function values(node,id,label,group,name,operator,kind,detail='',resolve=true) {
    if (!node || node.start<offset) return
    const value=visualScalar(node)
    if (typeof value===kind && value!==undefined) {
      const title=detail ? label+' · '+detail : label
      addScalar(node,id,title,group,name,operator,value)
      return
    }
    const walk=(child,key,tag=detail)=>values(child,id+'/'+key,label,group,name,operator,kind,tag,resolve)
    switch (node.type) {
      case 'Identifier': {
        if (!resolve) break
        const binding=bindings.get(node.name)
        if (!binding || visitedBindings.has(binding)) break
        visitedBindings.add(binding)
        values(binding,keys.get(binding),node.name,'Constantes y secuencias',node.name,operator,kind,'')
        break
      }
      case 'ArrayExpression':
        node.elements.forEach((entry,i)=>walk(entry,'step/'+i,'paso '+(i+1)))
        break
      case 'BinaryExpression':
      case 'LogicalExpression':
        walk(node.left,'left',node.operator==='*' ? 'factor' : detail)
        walk(node.right,'right',{'*':'factor','/':'divisor','+':'suma','-':'resta','%':'módulo','**':'exponente'}[node.operator] || detail)
        break
      case 'ConditionalExpression':
        walk(node.test,'test','condición')
        walk(node.consequent,'yes','si se cumple')
        walk(node.alternate,'no','si no se cumple')
        break
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
      case 'FunctionDeclaration':
        walk(node.body,'body')
        break
      case 'BlockStatement':
        node.body.forEach((statement,i)=>{
          if (statement.type==='ReturnStatement') walk(statement.argument,'return/'+i)
        })
        break
      case 'UnaryExpression':
        if (['+','-','!'].includes(node.operator)) walk(node.argument,'unary')
        break
      case 'CallExpression': {
        const method=visualMemberName(node.callee)
        const object=node.callee.object
        if (method && object?.type==='Identifier' && object.name==='Math') {
          node.arguments.forEach((arg,i)=>walk(arg,'math/'+i,method+(node.arguments.length>1 ? ' '+(i+1) : '')))
        } else if (Object.hasOwn(visualSequenceInputs,method) || method==='ease' || method==='reverse') {
          walk(object,'sequence')
          visualSequenceInputs[method]?.forEach(([label,def],i)=>{
            const arg=node.arguments[i]
            if (arg) values(arg,id+'/sequence/'+method+'/'+i,label,group,label,operator,'number')
            else addDefault(node,id+'/sequence/'+method+'/'+i,label,group,label,operator,def,
              visualSequenceInputs[method].slice(node.arguments.length,i).map(([,value])=>value))
          })
        }
        break
      }
    }
  }
  function addDefault(call,id,label,group,name,operator,value,previous) {
    if ((!Number.isFinite(value) && typeof value!=='boolean') ||
        previous.some(v=>!Number.isFinite(v) && typeof v!=='boolean')) return
    const position=call.end-1-offset
    const comma=call.arguments.length ? closingTokens.get(position)===',' ? ' ' : ', ' : ''
    add(id,label,group,value,name,operator,position,position,next=>
      comma+[...previous,next].map(v=>Object.is(v,-0) ? '-0' : String(v)).join(', '))
  }
  for (const {call,def,name,line} of calls) {
    const base=name+' · línea '+line, order=(ordinals.get(base) || 0)+1
    ordinals.set(base,order)
    const group=groups.get(base)>1 ? base+' · '+order : base
    const path=keys.get(call)
    if (call.arguments.some(arg=>arg.type==='SpreadElement')) continue
    for (const [index,param] of def.inputs.entries()) {
      if (!param || ['sampler2D','vec4','texture'].includes(param.type)) continue
      const kind=param.type==='bool' || typeof param.default==='boolean' ? 'boolean' : 'number'
      const label=(param.name==='amount' && visualAmountNames[name]) || visualParameterNames[param.name] || param.name || 'Parámetro '+(index+1)
      const id=path+'/arg/'+index, arg=call.arguments[index]
      if (arg) values(arg,id,label,group,param.name,name,kind)
      else addDefault(call,id,label,group,param.name,name,param.default,
        def.inputs.slice(call.arguments.length,index).map(input=>input?.default))
    }
  }
  for (const statement of tree.body) {
    const entries=statement.type==='VariableDeclaration' ? statement.declarations :
      statement.type==='ExpressionStatement' && statement.expression.type==='AssignmentExpression' &&
      statement.expression.operator==='=' ? [statement.expression] : []
    for (const entry of entries) {
      const name=(entry.id || entry.left)?.name, node=entry.init || entry.right, value=visualScalar(node)
      if (name && value!==undefined && !/^[so][0-3]$/.test(name)) {
        const label=({speed:'Velocidad global',bpm:'Tempo (BPM)'})[name] || name
        addScalar(node,keys.get(node),label,'Constantes y secuencias',name,null,value)
      }
    }
  }
  return records
}

function inspectVisualParameters(code, transforms) {
  try { return visualParameterEntries(code,transforms).map(({item})=>item) }
  catch (error) { if (error.name==='SyntaxError') return []; throw error }
}
function setVisualParameter(code, transforms, id, value) {
  const entry=visualParameterEntries(code,transforms).find(({item})=>item.id===id)
  if (!entry) throw new Error('El parámetro cambió de lugar. Volvé a elegirlo.')
  if (typeof value!==entry.item.kind || entry.item.kind==='number' && !Number.isFinite(value))
    throw new Error('Ingresá un valor válido para '+entry.item.label+'.')
  if (Object.is(value,entry.item.value)) return code
  const result=code.slice(0,entry.from)+entry.write(value)+code.slice(entry.to)
  parseVisualParameters(result)
  return result
}
