const assert=require('node:assert/strict')
const {chromium}=require('playwright')
const {openStudio}=require('./studio-nav.cjs')

const url=process.argv[2] || 'http://127.0.0.1:8736/'
const code='solid(1,0,0).out(o0)'

async function composition(page) {
  await page.evaluate(async code=>{
    const model=await unpackComposition(captureFosfenoMapping())
    const video=await (await fetch('media/fosfeno-demo.mp4')).blob()
    const clip=new File([video],'Bajo-verde.mp4',{type:'video/mp4'})
    const empty={source:'none',paint:false,fx:[],opacity:1}
    const region=(id,left)=>({...empty,id,visible:true,shape:'Rectángulo',
      points:[[left,.3],[left+.2,.3],[left+.2,.7],[left,.7]]})
    const left=region(1,.15)
    left.style={fillOn:true,fill:'#00ff00',strokeOn:false,stroke:'#ffffff',strokeWidth:1}
    const right=region(2,.65)
    right.layers=[{...empty,source:'group',layerId:1,label:'Estratos'},
      {...empty,source:'file',layerId:2,groupId:1,label:'Sala sur',file:clip,mediaRole:'loop',fx:[{name:'Invertir',value:.25}]}]
    await restoreFosfenoMapping(packComposition({...model,regions:[left,right],code,
      settings:{...model.settings,baseMode:'visible',output:'0'}}))
  },code)
}

async function state(page) {
  return page.evaluate(()=>{
    const {regl,canvas}=hydraSynth
    hydraSynth.tick(34)
    const pixel=(x,y)=>[...regl.read({x,y,width:1,height:1})]
    return {background:pixel(3,3),left:pixel(Math.floor(canvas.width*.25),Math.floor(canvas.height*.5)),
      code:cm.getValue(),selection:fosfenoStack.snapshot().selection}
  })
}

async function mapObjectPixel(page) {
  await page.waitForFunction(()=>{
    const canvas=document.querySelector('#mappingFrame').contentWindow.fosfenoMapping.preview().canvas
    const pixel=canvas.getContext('2d').getImageData(canvas.width*.3,canvas.height*.3,1,1).data
    return pixel[0]===0 && pixel[1]===255 && pixel[2]===0 && pixel[3]===255
  },null,{timeout:5000})
}

async function main() {
  const browser=await chromium.launch({channel:'chromium',args:['--use-angle=d3d11','--enable-unsafe-swiftshader']})
  try {
    const page=await browser.newPage({viewport:{width:1300,height:800},hasTouch:true,serviceWorkers:'block'})
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    page.setDefaultTimeout(9000)
    await page.goto(url)
    await page.waitForFunction(()=>window.fosfenoStack)
    await openStudio(page,'sectors')
    assert.equal(await page.locator('#stackSearch').isVisible(),false)
    await composition(page)
    const tree=page.locator('#layerOverview'), search=page.locator('#stackSearch')
    await tree.getByRole('button',{name:'Rectángulo 1',exact:true}).click()
    const initial=await state(page)
    assert.deepEqual(initial.background,[255,0,0,255])
    assert.deepEqual(initial.left,[0,255,0,255])
    assert.equal(initial.selection.sectorId,1)
    await tree.getByRole('button',{name:'Plegar capas de Rectángulo 2'}).click()
    const closed=tree.getByRole('button',{name:'Ver capas de Rectángulo 2'})
    assert.equal(await closed.getAttribute('aria-expanded'),'false')
    assert.match(await tree.locator('.layer-select').filter({hasText:'Rectángulo 2'}).textContent(),/Bajo-verde.mp4/)
    await search.fill('loop bajo')
    assert.equal(await tree.getByRole('button',{name:'Rectángulo 1',exact:true}).count(),0)
    for (const name of ['Estratos','Sala sur','Loop · Bajo-verde.mp4']) await tree.getByRole('button',{name,exact:true}).waitFor()
    assert.equal(await tree.locator('.layer-tree-effect-name').count(),0)
    await search.fill('efecto invertir')
    await tree.locator('.layer-tree-effect-name').filter({hasText:'Invertir'}).waitFor()
    assert.equal(await tree.getByRole('button',{name:'Loop · Bajo-verde.mp4'}).count(),0)
    await search.fill('zzz')
    await page.locator('#stackNoResults').waitFor()
    assert.deepEqual(await state(page),initial)
    await search.press('Escape')
    assert.equal(await closed.getAttribute('aria-expanded'),'false')
    assert.deepEqual(await state(page),initial)

    await page.locator('#openMapping').click()
    const map=page.frameLocator('#mappingFrame'), stack=map.locator('#mapStudioLayers'), q=map.locator('#mapStackSearch')
    await q.waitFor()
    const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="lime"/></svg>')
    await map.locator('#mapMediaFile').setInputFiles({name:'Probeta-norte.svg',mimeType:'image/svg+xml',buffer:svg})
    const surface=map.locator('#mapSurface[data-cursor="place"]')
    await surface.waitFor()
    const bounds=await surface.boundingBox()
    await page.mouse.move(bounds.x+bounds.width*.2,bounds.y+bounds.height*.2)
    await page.mouse.down()
    await page.mouse.move(bounds.x+bounds.width*.4,bounds.y+bounds.height*.4,{steps:4})
    await page.mouse.up()
    await map.locator('#mapLayers').getByRole('button',{name:'Probeta-norte.svg',exact:true}).waitFor()
    await mapObjectPixel(page)
    await stack.getByRole('button',{name:'Invertir',exact:true}).click()
    const active=stack.locator('[data-stack-kind="effect"][data-selected="true"]')
    await active.waitFor()
    const before=await state(page)
    await stack.getByRole('button',{name:'Plegar capas de Rectángulo 2'}).tap()
    const fold=stack.getByRole('button',{name:'Ver capas de Rectángulo 2'})
    assert.equal(await fold.getAttribute('aria-expanded'),'false')
    assert.match(await stack.locator('[data-stack-kind="sector"][data-sector-id="2"]').textContent(),/Bajo-verde.mp4/)
    await q.fill('rectangulo 2 loop')
    for (const name of ['Estratos','Sala sur','Loop · Bajo-verde.mp4']) await stack.getByRole('button',{name,exact:true}).waitFor()
    assert.equal(await stack.getByRole('button',{name:'Rectángulo 1',exact:true}).count(),0)
    await q.fill('imagen probeta')
    await map.locator('#mapLayers').getByRole('button',{name:'Probeta-norte.svg',exact:true}).waitFor()
    assert.equal(await stack.locator('.map-studio-row').count(),0)
    await q.fill('zzz')
    await map.locator('#mapStackNoResults').waitFor()
    await mapObjectPixel(page)
    await q.press('Escape')
    assert.equal(await fold.getAttribute('aria-expanded'),'false')
    await fold.press('Enter')
    await active.waitFor()
    assert.equal(await stack.getByRole('button',{name:'Plegar capas de Rectángulo 2'}).evaluate(el=>el===document.activeElement),true)
    assert.deepEqual(await state(page),before)
    assert.deepEqual(errors,[])
    console.log('Estudio y Mapeo: buscar por sector, grupo, loop, nombre de archivo, efecto y objeto nativo. Plegado, selección, foco, código y píxel conservados.')
  } finally { await browser.close() }
}

main().catch(error=>{console.error(error);process.exitCode=1})
