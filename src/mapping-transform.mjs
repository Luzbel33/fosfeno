const radians = degrees => degrees*Math.PI/180

// Work in pixels relative to canvas height so that a 90° rotation preserves lengths.
export function transformInfo(quad, sourceRect, aspect) {
  const cx=quad.reduce((sum,[x])=>sum+x/4,0), cy=quad.reduce((sum,[,y])=>sum+y/4,0)
  const angle=Math.atan2(quad[1][1]-quad[0][1], (quad[1][0]-quad[0][0])*aspect)
  const cos=Math.cos(angle), sin=Math.sin(angle)
  const axes=quad.map(([x,y])=>{
    const dx=(x-cx)*aspect, dy=y-cy
    return [dx*cos+dy*sin,dy*cos-dx*sin]
  })
  const size=i=>Math.max(...axes.map(p=>p[i]))-Math.min(...axes.map(p=>p[i]))
  const twiceArea=axes.reduce((sum,[x,y],i)=>{
    const [nx,ny]=axes[(i+1)%4]
    return sum+x*ny-y*nx
  },0)
  return {cx,cy,angle:angle*180/Math.PI,width:size(0)/aspect,height:size(1),
    scale:Math.sqrt(Math.abs(twiceArea)/(2*aspect*sourceRect[2]*sourceRect[3])),axes}
}

export function transformQuad(quad,sourceRect,aspect,action,value) {
  const info=transformInfo(quad,sourceRect,aspect)
  let {cx,cy,angle}=info, sx=1, sy=1
  if (action==='nudge') { cx+=value[0]; cy+=value[1] }
  else if (action==='center') cx=cy=.5
  else if (action==='x') cx=value/100
  else if (action==='y') cy=value/100
  else if (action==='rotate') angle=value
  else if (action==='scale') sx=sy=value/(100*info.scale)
  else if (action==='width') sx=value/(100*info.width)
  else if (action==='height') sy=value/(100*info.height)
  else return null
  if (![cx,cy,angle,sx,sy].every(Number.isFinite) || sx<=0 || sy<=0) return null
  const cos=Math.cos(radians(angle)), sin=Math.sin(radians(angle))
  return info.axes.map(([u,v])=>[cx+(u*sx*cos-v*sy*sin)/aspect,cy+u*sx*sin+v*sy*cos])
}

export function offCanvas([x,y,w,h]) {
  return x+w<=0 || x>=1 || y+h<=0 || y>=1
}
