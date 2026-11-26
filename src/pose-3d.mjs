const defaults = {x:-19,y:31,z:0,size:100,spin:false,axis:'y',speed:25,path:'none',radius:14,period:8}
const limits = {x:[-180,180],y:[-180,180],z:[-180,180],size:[20,160],speed:[-180,180],radius:[0,40],period:[1,60]}
export const makePose = () => ({...defaults})
export function readPose(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Pose 3D inválida.')
  const pose = {...defaults}
  for (const [key,[min,max]] of Object.entries(limits)) if (raw[key] !== undefined) {
    if (!Number.isFinite(raw[key]) || raw[key]<min || raw[key]>max) throw new Error('Valor 3D fuera de rango.')
    pose[key]=raw[key]
  }
  for (const [key,values] of Object.entries({axis:['x','y','z'],path:['none','circle','horizontal','vertical'],
    projection:['orthographic','perspective'],spin:[true,false]})) {
    if (raw[key] !== undefined && !values.includes(raw[key])) throw new Error('Movimiento 3D desconocido.')
    if (raw[key] !== undefined) pose[key]=raw[key]
  }
  if (raw.spinSince!==undefined) {
    if (!Number.isFinite(raw.spinSince) || raw.spinSince<0 || raw.spinSince>1e12) throw new Error('Inicio del giro inválido.')
    pose.spinSince=raw.spinSince
  }
  return pose
}
export const poseAnimated = p => !!p && ((p.spin && p.speed!==0) || (p.path!=='none' && p.path && p.radius>0))
const epoch = seconds=>performance.timeOrigin/1000+seconds
const degrees = n=>((n+180)%360+360)%360-180
const spinAngle=(p,t)=>degrees(p[p.axis]+(p.spinSince===undefined?t:epoch(t)-p.spinSince)*p.speed)
function adjust(p,key,newValue) {
  if (p[key]===newValue) return p
  const next={...p,[key]:newValue}
  if (key==='spin' || key==='axis' || key==='speed') {
    // Preserve the rendered orientation when changing speed, direction or motion state.
    const t=performance.now()/1000
    if (p.spin) next[p.axis]=spinAngle(p,t)
    if (next.spin) next.spinSince=epoch(t)
    else delete next.spinSince
  }
  return next
}
export function poseAt(p,seconds) {
  p = p || defaults
  const rad = Math.PI/180, angle=seconds*2*Math.PI/p.period, distance=p.radius/100
  const pose={x:p.x*rad,y:p.y*rad,z:p.z*rad,scale:p.size/100,dx:0,dy:0}
  if (p.spin) pose[p.axis]=spinAngle(p,seconds)*rad
  if (p.path==='horizontal' || p.path==='circle') pose.dx=distance*Math.sin(angle)
  if (p.path==='vertical') pose.dy=distance*Math.sin(angle)
  if (p.path==='circle') pose.dy=distance*Math.cos(angle)
  return pose
}

// Preview callbacks never create undo entries; commit fires once per slider gesture.
export function poseControls(host,onPreview,onCommit,{camera=false}={}) {
  const make=tag=>host.ownerDocument.createElement(tag)
  const fold=make('details'), title=make('summary'), form=make('div')
  title.textContent='Orientación y movimiento'
  fold.className='pose-3d'
  fold.append(title,form); host.append(fold)
  const controls=new Map(), blocks=new Map()
  let value=makePose()
  function field(key,label,suffix='',block=form) {
    const row=make('label'), text=make('span'), slider=make('input'), output=make('output')
    row.className='pose-field'; text.textContent=label
    slider.type='range'; slider.min=limits[key][0]; slider.max=limits[key][1]; slider.step=1
    slider.setAttribute('aria-label',label); slider.dataset.pose=key
    const display=n=>{
      slider.value=n; output.value=Math.round(n)+suffix
      slider.style.setProperty('--amount',(n-slider.min)*100/(slider.max-slider.min)+'%')
    }
    slider.oninput=()=>{value=adjust(value,key,Number(slider.value)); display(value[key]); onPreview({...value})}
    slider.onchange=()=>onCommit({...value})
    row.append(text,slider,output); block.append(row); controls.set(key,display)
  }
  function choices(key,label,options,block=form) {
    const row=make('div'), legend=make('span'); row.className='pose-choice'; row.setAttribute('role','group')
    row.setAttribute('aria-label',label); legend.textContent=label; row.append(legend)
    for (const [id,name] of options) {
      const btn=make('button'); btn.type='button'; btn.textContent=name; btn.dataset.value=String(id)
      btn.onclick=()=>{if(value[key]===id)return;value=adjust(value,key,id); sync(value); onCommit({...value})}
      row.append(btn)
    }
    block.append(row)
    controls.set(key,v=>{for (const b of row.querySelectorAll('button')) b.setAttribute('aria-pressed',String(b.dataset.value===String(v)))})
  }
  function group(key) {const d=make('div'); form.append(d); blocks.set(key,d); return d}
  field('x','Inclinación X','°'); field('y','Orientación Y','°'); field('z','Giro Z','°'); field('size','Escala','%')
  if (camera) choices('projection','Cámara',[['orthographic','Ortográfica'],['perspective','Perspectiva']])
  choices('spin','Rotación',[[false,'Fija'],[true,'Continua']])
  const spin=group('spin'); choices('axis','Eje',[['x','X'],['y','Y'],['z','Z']],spin); field('speed','Velocidad de giro','°/s',spin)
  choices('path','Trayectoria',[['none','Fija'],['circle','Órbita'],['horizontal','Horizontal'],['vertical','Vertical']])
  const path=group('path'); field('radius','Recorrido','%',path); field('period','Duración de vuelta',' s',path)
  function sync(p) {
    value=readPose(p || {})
    for (const [key,display] of controls) display(key==='projection' ? value.projection ?? 'orthographic' : value[key])
    blocks.get('spin').hidden=!value.spin; blocks.get('path').hidden=value.path==='none'
  }
  sync(value)
  return sync
}
