const assert=require('node:assert/strict')
const {chromium}=require('playwright')
const base=process.argv[2] || 'http://127.0.0.1:8736/'

async function guideFreeProjection(popup,center) {
  await popup.waitForFunction(([x,y])=>{
    const source=document.querySelector('body>canvas')
    if (!source?.width || !source.height) return false
    const raster=document.createElement('canvas')
    raster.width=320
    raster.height=180
    const context=raster.getContext('2d')
    context.drawImage(source,0,0,320,180)
    const rgba=context.getImageData(0,0,320,180).data
    let count=0, totalX=0, totalY=0
    for (let offset=0;offset<rgba.length;offset+=4) {
      if (rgba[offset+1]<20) continue
      // The oval is an empty sector with a green edge. Editor handles must stay off air.
      const [r,g,b]=rgba.subarray(offset,offset+3)
      if (g<=r || g<=b) return false
      count++
      totalX+=(offset/4)%320
      totalY+=Math.floor(offset/4/320)
    }
    const interior=(Math.round(y*180)*320+Math.round(x*320))*4
    return count>50 && count<1400 && rgba[interior+1]<5 &&
      Math.abs(totalX/count/320-x)<.02 && Math.abs(totalY/count/180-y)<.02
  },center)
  assert.deepEqual(await popup.locator('body>*').evaluateAll(nodes=>nodes.map(node=>node.tagName)),['CANVAS'])
}

async function run(browser,mobile) {
  const context=await browser.newContext({viewport:mobile ? {width:375,height:812} : {width:1400,height:880},
    isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'})
  const page=await context.newPage(), errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  page.setDefaultTimeout(8000)
  const client=mobile && await context.newCDPSession(page)
  try {
    await page.goto(new URL('?mode=mapeo',base).href,{waitUntil:'domcontentloaded',timeout:20000})
    const map=page.frameLocator('#mappingFrame'), surface=map.locator('#mapSurface')
    await surface.waitFor()
    const rows=()=>page.evaluate(()=>fosfenoStack.snapshot().rows.filter(r=>r.id))
    async function draw(name,path) {
      const before=(await rows()).length
      await map.locator('#mapShape').click()
      await map.locator('[data-map-shape="'+name+'"]').click()
      await surface.scrollIntoViewIfNeeded()
      const box=await surface.boundingBox()
      const pixels=path.map(([u,v])=>[box.x+box.width*u,box.y+box.height*v])
      if (mobile) {
        for (const [i,[x,y]] of pixels.entries()) await client.send('Input.dispatchTouchEvent',
          {type:i?'touchMove':'touchStart',touchPoints:[{x,y,id:1}]})
        await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
      } else {
        await page.mouse.move(...pixels[0]); await page.mouse.down()
        for (const at of pixels.slice(1)) await page.mouse.move(...at,{steps:4})
        await page.mouse.up()
      }
      await page.waitForFunction(count=>fosfenoStack.snapshot().rows.filter(r=>r.id).length===count,before+1)
      const [row]=await rows()
      assert.equal(row.name.split(' ')[0],name)
      return row
    }
    const span=points=>[0,1].map(i=>Math.max(...points.map(p=>p[i]))-Math.min(...points.map(p=>p[i])))
    if (!mobile) await page.locator('#liveEdit').evaluate(button=>button.click())
    const first=await draw('Óvalo',[[.18,.2],[.76,.49]])
    assert.equal(first.points.length,96)
    assert.ok(Math.abs(span(first.points)[0]-.58)<.014)
    assert.ok(Math.abs(span(first.points)[1]-.29)<.014)
    if (!mobile) {
      assert.equal(await map.locator('[data-hydra=off]').getAttribute('aria-pressed'),'true')
      assert.equal(await page.evaluate(id=>fosfenoStack.geometry.projected(id),first.id),false)
      await map.locator('#mapApplySeed').click()
      await page.waitForFunction(id=>fosfenoStack.geometry.projected(id),first.id)
      await page.locator('#liveEdit').evaluate(button=>button.click())
    }
    assert.equal(await map.locator('[data-hydra=sectors]').getAttribute('aria-pressed'),'true')
    if (!mobile) {
      const [popup]=await Promise.all([page.waitForEvent('popup'),map.locator('#mapOutput').click()])
      await guideFreeProjection(popup,[.47,.345])
      const box=await surface.boundingBox()
      const move=([x,y])=>page.mouse.move(box.x+box.width*x,box.y+box.height*y,{steps:6})
      await move([.47,.345])
      assert.equal(await surface.getAttribute('data-cursor'),'grab')
      await page.mouse.down()
      assert.equal(await surface.getAttribute('data-cursor'),'move')
      await move([.59,.445])
      await page.mouse.up()
      const [moved]=await rows()
      assert.ok(moved.points.every(([x,y],i)=>Math.abs(x-first.points[i][0]-.12)<.01 &&
        Math.abs(y-first.points[i][1]-.10)<.01))
      await guideFreeProjection(popup,[.59,.445])
      await map.locator('#mapUndo').click()
      assert.deepEqual((await rows())[0].points,first.points)
      await guideFreeProjection(popup,[.47,.345])
      await popup.close()
    }
    const ref=await draw('Libre',[[.2,.3],[.38,.18],[.62,.37],[.52,.64],[.24,.67]])
    assert.ok(ref.points.length>=5)
    await map.locator('[data-command=deformShape]').click()
    const handle=map.locator('#mapSectorHandles button').first()
    await handle.focus()
    await page.keyboard.press('Shift+ArrowRight')
    await page.waitForFunction(x=>fosfenoStack.snapshot().rows[1].points[0][0]>x,ref.points[0][0])
    await map.locator('#mapUndo').click()
    assert.deepEqual((await rows())[0].points,ref.points)
    // The layer palette acts on the freehand sector without leaving its canvas.
    const properties=map.locator('#mapStackInspector')
    await properties.locator('[data-command=effects]').click()
    const choices=properties.locator('.map-stack-choices')
    await choices.getByRole('button',{name:'Caleidoscopio',exact:true}).click()
    await map.locator('[data-stack-kind=effect] button[aria-label=Caleidoscopio]').waitFor()
    assert.equal(await choices.getByRole('button',{name:'Caleidoscopio',exact:true}).getAttribute('aria-pressed'),'true')
    await choices.getByRole('button',{name:'Caleidoscopio',exact:true}).click()
    await properties.getByRole('searchbox').fill('hue')
    await choices.getByRole('button',{name:'hue()',exact:true}).click()
    await map.locator('[data-stack-kind=effect] button[aria-label=hue]').waitFor()
    await properties.locator('[data-command=library]').click()
    await choices.getByRole('button',{name:'Nácar en fuga',exact:true}).click()
    await map.locator('[data-stack-kind=effect] button[aria-label="Nácar en fuga"]').waitFor()
    assert.equal(await page.locator('#mappingFrame').isVisible(),true)
    const updated=(await rows()).find(row=>row.id===ref.id)
    assert.deepEqual(updated.entries[0].effects.map(f=>[f.name,f.enabled]),[
      ['Caleidoscopio',false],['hue',true],['Nácar en fuga',true]
    ])
    if (!mobile) {
      for (const [name,total] of [['Triángulo',3],['Cuadrado',4],['Rombo',4],['Rectángulo',4],['Círculo',96]]) {
        const shape=await draw(name,[[.2,.25],[.81,.66]])
        assert.equal(shape.points.length,total)
        if (name==='Cuadrado' || name==='Círculo') {
          const [w,h]=span(shape.points), box=await surface.boundingBox()
          assert.ok(Math.abs(w*box.width-h*box.height)<2)
        }
      }
      const snapshot=await page.evaluate(async()=>{
        const g=fosfenoStack.geometry, row=fosfenoStack.snapshot().rows[1]
        const outside=g.drag(row.points,-1,-1,-.9)
        g.update(row.id,row.points,outside)
        const blob=await captureFosfenoMapping()
        await restoreFosfenoMapping(blob)
        const recovered=fosfenoStack.snapshot().rows.find(r=>r.id===row.id)
        if (!g.transform(row.id,'center')) throw new Error('No se pudo centrar')
        return {outside,restored:recovered.points,center:fosfenoStack.snapshot().rows.find(r=>r.id===row.id).points}
      })
      assert.ok(snapshot.outside.every(([x,y])=>x<0 && y<0))
      assert.deepEqual(snapshot.outside,snapshot.restored)
      for (const i of [0,1]) {
        const axis=snapshot.center.map(p=>p[i])
        assert.ok(Math.abs((Math.min(...axis)+Math.max(...axis))/2-.5)<.0001)
      }
    }
    assert.deepEqual(errors,[])
    console.log(mobile?'375 px, dibujo táctil y vértice con teclado OK':'7 geometrías, proporciones, vértices, arrastre, proyector limpio, Undo y portabilidad OK')
  } finally { await context.close() }
}
;(async()=>{
  const browser=await chromium.launch({channel:'chromium',args:['--use-angle=d3d11','--enable-unsafe-swiftshader']})
  try { await run(browser,false); await run(browser,true) }
  finally { await browser.close() }
})().catch(error=>{ console.error(error); process.exitCode=1 })
