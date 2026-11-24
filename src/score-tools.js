// Locate actual Hydra calls so editing a chain leaves strings, comments,
// grouping parentheses and unrelated JavaScript methods intact.
function inspectScore(code, transforms) {
  const tokens = []
  const tree = acorn.parse(code, {
    ecmaVersion: 'latest', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true,
    onToken: tokens
  })
  const preceding = new Map(tokens.slice(1).map((t, i) => [t.start, tokens[i]]))
  const calls = [], identifiers = [], assignments = new Set(), declarations = new Set()
  let asyncCode = false
  function visit(node) {
    if (!node || !node.type) return
    if (node.type === 'CallExpression') calls.push(node)
    if (node.type === 'Identifier') identifiers.push(node)
    if (node.type === 'AwaitExpression') asyncCode = true
    if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') assignments.add(node.left.name)
    if (node.id?.name) declarations.add(node.id.name)
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value === 'object') visit(value)
    }
  }
  visit(tree)
  const sources = new Set(), effects = new Set()
  for (const [name, def] of Object.entries(transforms)) {
    ;(def.type === 'src' ? sources : effects).add(name)
  }
  for (const call of calls.filter(c => c.callee.name === 'setFunction')) {
    const props = call.arguments[0]?.properties || []
    const field = key => props.find(p => (p.key?.name || p.key?.value) === key)?.value?.value
    if (field('name')) (field('type') === 'src' ? sources : effects).add(field('name'))
  }
  const outputs = [], links = [], chainMembers = new Set()
  for (const call of calls) {
    const m = call.callee
    if (m.type !== 'MemberExpression' || m.computed) continue
    const name = m.property.name
    if (name !== 'out' && !effects.has(name)) continue
    const start = preceding.get(m.property.start).start
    if (name === 'out') {
      const name = call.arguments.length ? call.arguments[0].name : 'o0'
      outputs.push({ start, end: call.end, from: call.start, name, implicit: !call.arguments.length, usesInput: false,
        standalone:tree.body.some(s => s.expression === call) })
      for (let c = m.object; c?.type === 'CallExpression'; c = c.callee.object) chainMembers.add(c)
    } else links.push({ call, name, start, end: call.end })
  }
  const owner = call => outputs.filter(o => o.from <= call.start && o.start >= call.end)
    .sort((a,b) => (a.end-a.from) - (b.end-b.from))[0]
  for (const c of calls) {
    if (c.callee.name === 'src' && c.arguments[0]?.name === 's0') {
      const o = owner(c)
      if (o) o.usesInput = true
    }
  }
  return {
    outputs, calls, identifiers, assignments, declarations, asyncCode, empty: tree.body.length === 0,
    effects: links.filter(({ call }) => {
      if (chainMembers.has(call)) return true
      let root = call
      while (root?.callee?.object) root = root.callee.object
      return sources.has(root?.callee?.name)
    }).map(({ call, name, start, end }) => ({
      name, start, end, output: owner(call)?.name,
      amount: name === 'blend' && typeof call.arguments[1]?.value === 'number' ? call.arguments[1] : null,
      layer: call.arguments[0]?.callee?.id?.name === 'capaBiblioteca'
        ? call.arguments[0].callee.body.body[0]?.expression?.value : null
    })).sort((a, b) => a.start - b.start)
  }
}

// A layer is a single removable blend expression. Its code and credits travel
// with the sketch, and its feedback reads from its own physical Hydra buffers.
function libraryBlend(base, item, transforms) {
  const layer = inspectScore(item.code, transforms)
  const buffers = info => new Set([
    ...info.identifiers.map(n => n.name).filter(n => /^o[0-3]$/.test(n)),
    ...info.outputs.map(o => o.name)
  ])
  if (!layer.outputs.length || layer.outputs.some(o => !/^o[0-3]$/.test(o.name)) ||
      layer.asyncCode || layer.calls.some(c => /^(hush|setResolution|initCam|initScreen|initStream|initVideo|initImage|init|clear)$/.test(c.callee.name || c.callee.property?.name)))
    throw new Error('Este sketch controla las entradas o la salida por código. Usá Abrir para tocarlo por separado.')
  const used = buffers(base), needed = buffers(layer)
  const single = layer.outputs[0]
  const inline = layer.outputs.length === 1 && single.standalone &&
    layer.identifiers.every(n => !/^o[0-3]$/.test(n.name) || n.start > single.start && n.end < single.end)
  const free = ['o1','o2','o3','o0'].filter(o => !used.has(o))
  if (!inline && needed.size > free.length) throw new Error('La capa necesita ' + needed.size + ' salidas libres y quedan ' + free.length + '. Quitá una capa o elegí un sketch más chico.')
  const mapping = new Map([...needed].map((name, i) => [name, free[i]]))
  const edits = layer.identifiers.filter(n => mapping.has(n.name)).map(n => [n.start, n.end, mapping.get(n.name)])
  for (const o of layer.outputs.filter(o => o.implicit)) edits.push([o.end - 1, o.end - 1, mapping.get('o0')])
  let body = item.code
  let captured = 'imagenDeCapa'
  while (layer.identifiers.some(n => n.name === captured)) captured += '_'
  if (inline) edits.splice(0,edits.length,
    [single.start,single.end,')'],[single.from,single.from,captured + ' = ('])
  const seen = new Set()
  for (const [start, end, text] of edits.sort((a,b) => b[0]-a[0])) {
    if (!seen.has(start)) body = body.slice(0,start) + text + body.slice(end)
    seen.add(start)
  }
  const renders = layer.calls.filter(c => c.callee.name === 'render')
  const selected = renders.at(-1)?.arguments[0]?.name || 'o0'
  const output = mapping.get(selected) || mapping.get(layer.outputs.at(-1).name)
  const locals = [...layer.assignments].filter(n => !layer.declarations.has(n))
  if (inline) locals.push(captured)
  return '.blend((function capaBiblioteca() {\n' + JSON.stringify(item.name) + ';\n' +
    '// Adaptado por Fosfeno para combinar las salidas de este sketch.\n' +
    (locals.length ? 'let ' + locals.join(', ') + ';\n' : '') +
    (renders.length ? 'const render = () => {};\n' : '') + body +
    '\nreturn ' + (inline ? captured : 'src(' + output + ')') + '\n})(), 0.5)'
}
