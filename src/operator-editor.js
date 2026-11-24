function hydraDefault(input) {
  if (input.default != null) return JSON.stringify(input.default)
  return input.type === 'sampler2D' ? 's0' : 'osc()'
}
class OperatorEditor {
  constructor(editor,transforms,insert,save,notify) {
    Object.assign(this,{editor,transforms,insert,save,notify})
    this.root = document.getElementById('operatorInspector')
    this.catalog = document.getElementById('hydraCatalog')
    this.catalog.ontoggle = () => { if (this.catalog.open) this.palette() }
    editor.on('changes',()=>{ if (!this.root.hidden) this.draw() })
  }
  palette() {
    const root = document.getElementById('hydraChoices')
    root.replaceChildren()
    const groups = {src:'Fuentes',coord:'Geometría',color:'Color',combine:'Mezcla',combineCoord:'Deformación'}
    const transforms = this.transforms()
    for (const [type,title] of Object.entries(groups)) {
      const list = document.createElement('details'), head = document.createElement('summary'), cells = document.createElement('div')
      head.textContent=title; cells.className='shape-picker'; list.append(head,cells)
      for (const [name,t] of Object.entries(transforms).filter(([,t])=>t.type===type)) {
        const b=document.createElement('button')
        b.textContent=name
        b.onclick=()=>{
          const expression=name+'('+t.inputs.map(hydraDefault).join(', ')+')'
          this.insert(expression,type==='src')
        }
        cells.append(b)
      }
      root.append(list)
    }
  }
  draw() {
    const root=this.root, cm=this.editor, code=cm.getValue(), defs=this.transforms()
    root.replaceChildren()
    let info
    try { info=inspectScore(code,defs) } catch { root.textContent='Completá la expresión para ver sus parámetros.'; return }
    const elements=info.calls.map(call=>{
      const key=call.callee.property || call.callee, name=key.name
      const effect=info.effects.find(e=>e.end===call.end && e.name===name)
      return {call,key,name,effect}
    }).filter(({name,effect,call})=>Object.hasOwn(defs,name) && (effect || call.callee.type==='Identifier'))
      .sort((a,b)=>a.key.start-b.key.start)
    if (!elements.length) { root.textContent='Agregá una fuente o un operador Hydra.'; return }
    const index=Math.max(0,Math.min(elements.length-1,this.index || 0))
    const menu=document.createElement('details'), heading=document.createElement('summary')
    const chosen=elements[index], line=el=>cm.posFromIndex(el.key.start).line+1
    heading.textContent=chosen.name+' · línea '+line(chosen)+' ▾';menu.append(heading)
    const list=document.createElement('div');list.className='shape-picker'
    elements.forEach((el,i)=>{
      const b=document.createElement('button')
      b.textContent=el.name+' · '+line(el); b.setAttribute('aria-pressed',i===index)
      b.onclick=()=>{this.index=i;this.draw()};list.append(b)
    })
    menu.append(list);root.append(menu)
    const {call,name,effect}=chosen, params=defs[name].inputs
    params.forEach((param,i)=>{
      const arg=call.arguments[i], row=document.createElement('label'), field=document.createElement('input')
      const title=param.name==='_c1'?'Imagen':param.name
      row.className='argument';row.append(document.createTextNode(title))
      field.type='text';field.spellcheck=false;field.value=arg?code.slice(arg.start,arg.end):''
      field.placeholder=param.default==null?'Fuente requerida':'Por defecto · '+hydraDefault(param)
      field.setAttribute('aria-label',name+' · '+title)
      field.onchange=()=>{
        const value=field.value.trim()
        try {
          if (cm.getValue()!==code) {this.draw();return}
          if (!value) throw new Error('Ingresá un valor o una expresión Hydra.')
          acorn.parse('('+value+'\n)',{ecmaVersion:'latest'})
          if (arg) cm.replaceRange(value,cm.posFromIndex(arg.start),cm.posFromIndex(arg.end))
          else {
            const args=params.slice(call.arguments.length,i).map(hydraDefault)
            args.push(value)
            const last=call.arguments.at(-1)
            const pos=cm.posFromIndex(last?.end ?? call.end-1)
            cm.replaceRange((last?', ':'')+args.join(', '),pos)
          }
        } catch (err) { field.value=arg?code.slice(arg.start,arg.end):'';this.notify(err.message) }
      }
      field.onkeydown=e=>{if (e.key==='Enter'){e.preventDefault();field.blur()}}
      row.append(field);root.append(row)
    })
    if (effect) {
      const b=document.createElement('button');b.textContent='Guardar este operador'
      b.onclick=async()=>{
        try {
          const fragment=code.slice(effect.start,effect.end)
          const usedNames=new Set([name])
          for (const call of info.calls) {
            const key=call.callee.property || call.callee
            if (key.start>=effect.start && key.end<=effect.end) usedNames.add(key.name)
          }
          const definitions=info.calls.filter(c=>c.callee.name==='setFunction' &&
            c.arguments[0]?.properties?.some(p=>(p.key?.name || p.key?.value)==='name' && usedNames.has(p.value?.value)))
            .map(c=>code.slice(c.start,c.end))
          const used=[...new Set([...info.assignments,...info.declarations])].filter(n=>
            new RegExp('\\b'+n.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g,'\\$&')+'\\b').test(fragment+' '+definitions.join(' ')))
          if (used.length) throw new Error('Este operador usa '+used.join(', ')+'. Guardá la composición completa para llevar sus definiciones.')
          const origin = []
          for (const line of code.split('\n')) {
            if (!line.trim()) continue
            if (!line.trimStart().startsWith('//')) break
            origin.push(line.trim())
          }
          await this.save({kind:'operator',name:name+' · '+(document.getElementById('scoreName').value || 'Mi efecto'),
            code:fragment,definitions,origin,regions:[]})
        } catch(err) { this.notify(err.message) }
      }
      root.append(b)
    }
  }
}
