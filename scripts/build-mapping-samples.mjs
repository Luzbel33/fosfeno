import { mkdir, writeFile } from 'node:fs/promises'
import { blankMap, packMap, unpackMap } from '../src/mapping-project.mjs'
import { mappingSamples } from '../src/mapping-samples.mjs'

// Work in projector pixels. Only the serialized brush coordinates use fractions.
const tau = 2 * Math.PI
const path = (segments, point) => Array.from({length:segments+1}, (_, i)=>point(i/segments))
const orbit = (cx,cy,rx,ry,detail=96) => path(detail,t=>[cx+rx*Math.cos(t*tau),cy+ry*Math.sin(t*tau)])
function stroke(color,size,points,style='solid') {
  return {color,size,style,points:points.map(([x,y])=>[Math.round(x/1280*100000)/100000,Math.round(y/720*100000)/100000])}
}
function piece(id,name,strokes) {
  return {id,name,kind:'ink',visible:true,opacity:1,strokes}
}
function iris() {
  const teal='#32cbba', deep='#247e82', jade='#95ffe1', gold='#ffb54b', coral='#ff7851'
  const lids=[], contour=[], fibers=[], pupil=[]
  const lid=(sign,width,height,phase=0)=>path(92,t=>{
    const u=2*t-1, w=Math.sin(Math.PI*t)
    return [640+width*u,356+sign*w**.91*(height+6*Math.sin(8*t+phase))+u*6]
  })
  for (const sign of [-1,1]) {
    lids.push(stroke(jade,3.6,lid(sign,383,sign<0?143:130)))
    lids.push(stroke(teal,2,lid(sign,372,sign<0?157:144)))
    // Interrupted contour lines open at the temples, like a rising tide.
    for (let i=1;i<=5;i++) {
      const line=lid(sign,391+i*13,(sign<0?164:150)+i*11,.8*i)
      const gap=8+i*3
      contour.push(stroke(i===3?teal:deep,i===3?2.5:2,line.slice(gap,92-gap)))
    }
    for (const side of [-1,1]) {
      for (let i=0;i<3;i++) {
        const plume=path(42,t=>{
          const x=640+side*(348-(163+i*20)*t)
          const y=356+sign*(9*Math.sin(Math.PI*t)+t*(14+i*14)+
            t*Math.sin(t*6.9+i*.45)*(8+i*2))
          return [x,y]
        })
        lids.push(stroke(i===2?deep:'#266571',2,plume))
      }
      for (let i=0;i<3;i++) {
        const plume=path(40,t=>{
          const a=t*(1-t)*4
          return [640+side*(373+124*t+i*6),358+sign*(12+i*9+(21+i*9)*a-9*t)]
        })
        lids.push(stroke(i===0?gold:deep,i===0?3:2,plume))
      }
    }
  }
  // The displaced annuli and radial fibres share a centre but not a phase.
  for (let ring=0;ring<5;ring++) {
    const r=111-ring*3.2
    fibers.push(stroke(ring===0?gold:ring===1?coral:deep,ring===0?3.8:2,
      path(140,t=>{const a=t*tau,n=ring<2?0:2*Math.sin(8*a+.6*ring);return [640+(r+n)*Math.cos(a),356+(r+n)*Math.sin(a)]})))
  }
  for (let i=0;i<68;i++) {
    const a=tau*i/68, inner=39+7*(1+Math.cos(9*a))/2, outer=91+6*Math.cos(a*13)
    fibers.push(stroke(i%4===0?gold:i%3===0?teal:deep,i%4===0?2.7:2,path(13,t=>{
      const r=inner+(outer-inner)*t, twist=.12*Math.sin(Math.PI*t)+.045*Math.sin(3*Math.PI*t+5*a)
      return [640+r*Math.cos(a+twist),356+r*Math.sin(a+twist)]
    })))
  }
  for (let i=0;i<3;i++) pupil.push(stroke(i===1?coral:gold,i===1?2.5:2,
    path(112,t=>{const a=t*tau,r=29+i*4+1.5*Math.cos(8*a+.4*i);return [640+r*Math.cos(a),356+r*Math.sin(a)]})))
  pupil.push(stroke(jade,4,[[631,345]],'neon'),stroke(jade,2,[[638,341]]))
  for (const start of [-.93,2.21]) pupil.push(stroke(gold,2.4,path(15,t=>{
    const a=start+.44*t
    return [640+39*Math.cos(a),356+39*Math.sin(a)]
  }),'neon'))
  const marks=[]
  for (const side of [-1,1]) {
    const x=640+side*535
    marks.push(stroke(gold,2.8,[[x-13,356],[x,348],[x+13,356],[x,364],[x-13,356]]),
      stroke(teal,2,[[x-side*22,356],[x-side*42,356]],'dots'))
  }
  return [piece('iris-curvas','Curvas de marea',contour),piece('iris-parpados','Párpados y comisuras',lids),
    piece('iris-fibras','Iris · fibras de cobre',fibers),piece('iris-pupila','Pupila y reflejos',pupil),
    piece('iris-extremos','Extremos de alineación',marks)]
}

function portal() {
  const amber='#ffa329', ivory='#fee3a0', copper='#d46832', plum='#a55e9b', blue='#74aebd'
  const stone=[], tunnel=[], stairs=[], cornices=[]
  const scale=(point,s)=>[650+(point[0]-650)*s,333+(point[1]-333)*s]
  const arch=(width,top,bottom)=>{
    const shoulder=top+width*.86, side=path(50,t=>{
      // A pointed vault: nearly vertical at the springing, narrowing into a cusp.
      return [640-width*Math.cos(t*Math.PI/2),shoulder-(shoulder-top)*Math.sin(t*Math.PI/2)**.93+25*Math.sin(Math.PI*t)]
    })
    return [[640-width,bottom],...side,...side.slice(0,-1).reverse().map(([x,y])=>[1280-x,y]),[640+width,bottom]]
  }
  const face=arch(216,80,590)
  for (const [d,c,width] of [[0,ivory,4],[8,copper,2.5],[18,amber,3.2],[35,plum,2]]) {
    stone.push(stroke(c,width,arch(216+d,80-d,590+d*.22)))
  }
  const distances=[.90,.76,.64,.53,.43,.34,.26]
  for (const [i,s] of distances.entries()) {
    tunnel.push(stroke(i===6?ivory:i%2===0?blue:plum,i===6?3.5:2.2,face.map(p=>scale(p,s))))
    if (i<4) tunnel.push(stroke(copper,2,face.map(p=>scale(p,s-.009))))
  }
  for (const i of [0,1,11,24,39,51,63,78,91,101,102]) {
    const p=face[Math.min(i,face.length-1)]
    tunnel.push(stroke(i===51?ivory:plum,2,[p,scale(p,.26)]))
  }
  for (let i=0;i<12;i++) {
    const t=i/12, depth=.23+.88*t**1.65
    const left=scale([424,590],depth), right=scale([856,590],depth)
    stairs.push(stroke(i%3===0?ivory:copper,i%3===0?3:2,[left,right]))
    if (i>2) {
      const lip=3+t*5
      stairs.push(stroke(plum,2,[[left[0],left[1]+lip],[right[0],right[1]+lip]]))
    }
  }
  for (const side of [-1,1]) {
    const at=(u,y)=>[640+side*u,y]
    const lines=[]
    // Narrow panels can be moved onto the actual door jambs.
    for (const [w,high,low] of [[260,203,604],[277,220,614],[306,252,625],[317,262,625]]) {
      lines.push(stroke(w===260?amber:copper,w===260?3.3:2,[at(w,low),at(w,high),at(w+15,high+13)]))
    }
    const lantern=path(44,t=>at(286+12*Math.sin(t*tau)**3,357-49*Math.cos(t*tau)))
    lines.push(stroke(ivory,2.6,lantern),stroke(amber,2,[at(286,314),at(286,395)],'dots'))
    for (let i=0;i<5;i++) {
      const y=430+i*26
      lines.push(stroke(plum,2,[at(280,y),at(287,y+6),at(296,y-2)]))
    }
    for (const [n,y] of [[241,587],[260,603],[286,618]]) {
      lines.push(stroke(amber,2.8,[at(n,y),at(309+n-241,y),at(328+n-241,y+8)]))
    }
    cornices.push(piece('portal-jamba-'+(side<0?'i':'d'),side<0?'Jamba izquierda':'Jamba derecha',lines))
  }
  const crown=[]
  for (let j=0;j<5;j++) {
    const w=23+j*13, h=14+j*6
    crown.push(stroke(j===4?amber:copper,2,path(26,t=>[640+(2*t-1)*w,38+h*Math.abs(2*t-1)])))
  }
  crown.push(stroke(amber,2.5,[[620,47],[640,37],[660,47]],'neon'))
  return [piece('portal-bovedas','Bóvedas en perspectiva',tunnel),piece('portal-escalera','Peldaños',stairs),
    piece('portal-arco','Arco del vano',stone),...cornices,piece('portal-clave','Clave de la bóveda',crown)]
}

function jellyfish(cx,cy,scale,angle,phase,colors) {
  const [light,body,accent,deep]=colors
  const parts=[]
  const put=(color,size,pts,style)=>{
    const c=Math.cos(angle), s=Math.sin(angle)
    parts.push(stroke(color,Math.max(2,Math.min(6,size*scale)),pts.map(([x,y])=>
      [cx+scale*(x*c-y*s),cy+scale*(y*c+x*s)]),style))
  }
  // A bell is an umbrella seen slightly from below. The radial divisions land
  // on the back half of the rim; extending them onto the arms flattens the bell.
  const cap=(t,q=1)=>{
    const a=Math.PI*t
    return [-139*q*Math.cos(a),25-123*q*Math.sin(a)**.76+3*Math.sin(5*a+phase)*Math.sin(a)]
  }
  put(light,4.5,path(90,t=>cap(t)))
  put(body,2.6,path(76,t=>cap(t,.955)))
  put(light,2.6,path(30,t=>cap(.22+t*.22)),'neon')
  for (const k of [-.83,-.64,-.42,-.19,.10,.34,.58,.8]) {
    put(Math.abs(k)>.7 ? deep:body,2.3,path(32,t=>{
      const a=Math.PI*t/2, x=133*k*Math.sin(a)**.9
      return [x, -90+112*(1-Math.cos(a))+10*Math.sin(Math.PI*t)*k]
    }))
  }
  for (let n=0;n<3;n++) {
    put(n===0?light:n===1?accent:body,n===0?3.8:2.2,path(110,t=>{
      const x=2*t-1, arch=Math.max(0,1-x*x)**.65
      return [139*x,25+(12+n*4)*arch+(5+n)*Math.sin(t*tau*10+phase)*arch]
    }))
  }
  for (let i=0;i<12;i++) {
    const u=(i+.5)/12, x=(2*u-1)*123
    put(i%4===0?accent:body,2,path(16,t=>[x+(t-.5)*10,26+7*Math.cos(Math.PI*t)+1.5*Math.sin(i)]))
  }
  for (let i=0;i<10;i++) {
    const origin=-110+i*24, phi=phase+i*1.71
    const length=175+69*(.5+.5*Math.sin(phi))+63*(1-Math.abs(origin)/120)
    const arm=t=>[origin*(1-.29*t)+12*t+Math.sin(phi+6.6*t)*(8+16*t)+6*Math.sin(13*t+phi)*t,
      42+length*t]
    put(i%4===0?accent:i%3===0?light:body,i%3===0?3:2,path(67,arm))
    if (i===3 || i===5 || i===6) {
      for (const side of [-1,1]) {
        put(i===5?accent:deep,2.4,path(86,t=>{
          const [x,y]=arm(t), width=(4+8*Math.sin(t*Math.PI))*Math.sin(17*t+phi)*(1-t)**.52
          return [x+side*width,y+side*2*Math.cos(17*t+phi)]
        }))
      }
    }
  }
  // Broken bands of bioluminescent spots leave the membrane transparent.
  for (const [y,w] of [[-47,65],[-28,91]]) {
    for (let i=0;i<9;i++) {
      const x=w*(i-4)/4
      put(i===0||i===8?accent:light,i%3===0?3.8:2.5,[[x,y+12*(x/w)**2+2*Math.sin(i+phase)]])
    }
  }
  for (let i=0;i<4;i++) {
    const x=(i-1.5)*27
    put(accent,2,path(24,t=>[x+7*Math.cos(t*tau),-5+4*Math.sin(t*tau)+3*Math.sin(t*tau*2+phase)]))
  }
  return parts
}
function drift() {
  const colors=['#b7fff1','#48b8b8','#ff927a','#316c95']
  const lavender=['#f1d8ff','#a888d7','#ffe49e','#655394']
  const flotsam=[]
  for (const [x,y,r] of [[98,292,4],[162,394,2.4],[403,162,3],[452,380,2.5],[503,299,5],
    [320,542,3],[772,93,2.3],[903,251,3],[900,473,3.5],[1142,546,2.5],[1101,214,4.3]]) {
    if (r>3) flotsam.push(stroke('#6eb9ad',2,orbit(x,y,r,r,14)))
    else flotsam.push(stroke('#867fb8',2.8,[[x,y]]))
  }
  return [piece('deriva-plancton','Plancton',flotsam),
    piece('deriva-medusa-violeta','Medusa violeta',jellyfish(292,228,.72,.24,1.2,lavender)),
    piece('deriva-medusa-principal','Medusa de cristal',jellyfish(682,229,1.1,-.16,.25,colors)),
    piece('deriva-medusa-satelite','Medusa satélite',jellyfish(1028,361,.59,.29,2.38,
      ['#ffe5c1','#ef8c77','#bbadff','#916678']))]
}

const builders = {'iris-de-marea':iris,'umbral-de-ambar':portal,'deriva-abisal':drift}
await mkdir(new URL('../media/mapas/',import.meta.url),{recursive:true})
for (const sample of mappingSamples) {
  const blob=packMap({...blankMap,layers:builders[sample.id]()})
  await unpackMap(blob)
  await writeFile(new URL('../'+sample.path,import.meta.url),new Uint8Array(await blob.arrayBuffer()))
}
