// The working copy belongs to this dialog; only its footer writes to the studio.
class VisualParameterInspector {
  static operators={
    osc:'Franjas',noise:'Ruido',shape:'Polígono',solid:'Color plano',gradient:'Gradiente',
    voronoi:'Celdas',kaleid:'Caleidoscopio',rotate:'Rotación',scale:'Escala',repeat:'Repetición',
    scrollX:'Desplazamiento horizontal',scrollY:'Desplazamiento vertical',pixelate:'Pixelado',
    color:'Color',hue:'Tono',colorama:'Ciclo de color',saturate:'Saturación',contrast:'Contraste',
    brightness:'Brillo',posterize:'Posterización',thresh:'Umbral',luma:'Luminosidad',invert:'Inversión',
    modulate:'Deformación',modulateRotate:'Rotación por señal',modulateScale:'Escala por señal',
    blend:'Mezcla',layer:'Superposición',mask:'Máscara',mult:'Multiplicar',add:'Sumar',diff:'Diferencia'
  }
  groupName(group) {
    const [operator,...location]=group.split(' · ')
    return [VisualParameterInspector.operators[operator] || operator,...location].join(' · ')
  }
  constructor(transforms) {
    this.transforms=transforms
    const get=id=>document.getElementById(id)
    this.dialog=get('visualParameters')
    this.fields=get('visualParamFields')
    this.search=get('visualParamSearch')
    this.status=get('visualParamStatus')
    this.canvas=get('visualParamPreview')
    this.notice=get('visualPreviewNotice')
    this.apply=get('applyVisualParams')
    this.mix=get('mixVisualParams')
    this.save=get('saveVisualVariant')
    this.saveSection=get('visualParamSave')
    this.name=get('visualVariantName')
    this.source=get('visualVariantCode')
    this.sourceSection=get('visualParamSource')
    this.source.oninput=()=>{
      this.code=this.source.value
      this.draw()
      this.status.textContent=''
      this.schedulePreview()
    }
    this.preview=new VisualParameterPreview(this.canvas)
    get('cancelVisualParams').onclick=()=>this.dialog.close()
    this.search.oninput=()=>this.draw()
    this.dialog.addEventListener('close',()=>{
      clearTimeout(this.timer)
      this.preview.stop()
      this.target=null
    })
    this.apply.onclick=()=>this.submit('apply')
    this.mix.onclick=()=>this.submit('mix')
    this.save.onclick=()=>this.submit('save')
  }
  open(target) {
    if (this.dialog.open) return
    this.target=target
    this.code=target.code
    this.source.value=target.code
    this.sourceSection.open=false
    this.search.value=''
    this.status.textContent=''
    this.name.value=(target.name.slice(0,74)+' · variante').slice(0,85)
    this.saveSection.open=false
    this.saveSection.hidden=!target.save
    this.apply.textContent=target.action
    this.mix.hidden=!target.mix
    document.getElementById('visualParamTitle').textContent=target.name
    document.getElementById('visualParamTarget').textContent=target.destination
    this.draw()
    this.dialog.showModal()
    this.refreshPreview()
  }
  refreshPreview() {
    this.timer=null
    const target=this.target
    if (!target || !this.dialog.open) return
    let result
    try { result=this.preview.show(this.code,{kind:target.kind,definitions:target.definitions || [],
      audioLevels:()=>window.a?.fft || []}) }
    catch { result={ok:false,reason:'Vista previa no disponible para esta visual.'} }
    this.canvas.hidden=!result.ok
    this.dialog.classList.toggle('vp-no-preview',!result.ok)
    this.notice.textContent=result.ok ? (target.kind==='operator'?'Vista previa · señal de muestra':'Vista previa') : result.reason
  }
  schedulePreview() {
    if (!this.timer) this.timer=setTimeout(()=>this.refreshPreview(),110)
  }
  async submit(action) {
    const target=this.target
    if (!target || this.busy) return
    const invalid=this.fields.querySelector('input:invalid')
    if (invalid) { invalid.closest('details').open=true; invalid.reportValidity(); return }
    this.busy=true
    try {
      if (action==='save') {
        const name=this.name.value.trim()
        if (!name) { this.status.textContent='Escribí un nombre para la variante.'; this.name.focus(); return }
        const message=await target.save(this.code,name)
        if (this.target===target) this.status.textContent=message
      } else {
        if (this.code!==target.code) {
          const source=target.kind==='operator'?'base()'+this.code:this.code
          acorn.parse(source,{ecmaVersion:'latest',allowReturnOutsideFunction:true,allowAwaitOutsideFunction:true})
        }
        await target[action](this.code)
        if (this.target===target) this.dialog.close()
      }
    } catch (error) {
      if (this.target===target) this.status.textContent=error.message || String(error)
    } finally { this.busy=false }
  }
  draw() {
    const controls=inspectVisualParameters(this.code,this.transforms())
    const groups=new Map()
    const query=this.search.value.trim().toLocaleLowerCase()
    this.search.hidden=!controls.length
    for (const param of controls) {
      if (query && !(param.group+' '+this.groupName(param.group)+' '+param.label).toLocaleLowerCase().includes(query)) continue
      if (!groups.has(param.group)) groups.set(param.group,[])
      groups.get(param.group).push(param)
    }
    const items=document.createDocumentFragment()
    const sections=[...groups]
    const authored=sections.findIndex(([name])=>name==='Constantes y secuencias')
    if (authored>0) sections.unshift(...sections.splice(authored,1))
    for (const [name,params] of sections) {
      const section=document.createElement('details'), heading=document.createElement('summary')
      section.open=!!query || !items.firstChild
      heading.textContent=this.groupName(name)
      heading.title=hydraExplanations[name.split(' · ')[0]] || name
      section.append(heading)
      for (const param of params) section.append(this.control(param))
      items.append(section)
    }
    if (!groups.size) {
      const p=document.createElement('p')
      p.textContent=query?'Sin coincidencias.':'Esta visual no expone parámetros numéricos o lógicos. Podés editar sus expresiones en «Ver o editar código».'
      items.append(p)
    }
    this.fields.replaceChildren(items)
  }
  control(param) {
    const row=document.createElement('div'), label=document.createElement('label')
    const field=document.createElement('input')
    row.className='vp-field'
    label.htmlFor=field.id='vp-field-'+param.id
    label.textContent=param.label
    row.append(label)
    const change=value=>{
      try {
        this.code=setVisualParameter(this.code,this.transforms(),param.id,value)
        this.source.value=this.code
        this.status.textContent=''
        this.schedulePreview()
      } catch (error) { this.status.textContent=error.message }
    }
    if (param.kind==='boolean') {
      field.type='checkbox'; field.checked=param.value
      field.onchange=()=>change(field.checked)
    } else {
      field.type='number'; field.step='any'; field.required=true; field.value=param.value
      const slider=document.createElement('input')
      slider.type='range'
      slider.min=Math.min(param.min ?? 0,param.value)
      slider.max=Math.max(param.max ?? 1,param.value)
      slider.step=param.step ?? 'any'
      slider.value=param.value
      slider.setAttribute('aria-label',param.label+' · deslizador')
      paintRange(slider)
      slider.oninput=()=>{
        field.value=slider.value; paintRange(slider); change(slider.valueAsNumber)
      }
      field.oninput=()=>{
        const value=field.valueAsNumber
        if (!Number.isFinite(value)) return
        if (value<Number(slider.min)) slider.min=value
        if (value>Number(slider.max)) slider.max=value
        slider.value=value; paintRange(slider); change(value)
      }
      row.append(slider)
    }
    row.append(field)
    return row
  }
}
