const assert = require('node:assert/strict')
const { readFile } = require('node:fs/promises')
const { join } = require('node:path')
const { chromium } = require('playwright')

const base = process.argv[2] || 'http://127.0.0.1:8736/'
const green = [169,255,80]
const black = [0,0,0]
const click = (map,id) => map.locator('#'+id).click()

async function coordinates(map,[x,y]) {
  const rect = await map.locator('#mapSurface').boundingBox()
  return [rect.x+rect.width*x,rect.y+rect.height*y]
}
async function drag(page,map,from,to,shift = false) {
  await page.mouse.move(...await coordinates(map,from))
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.down()
  await page.mouse.move(...await coordinates(map,to),{steps:7})
  await page.mouse.up()
  if (shift) await page.keyboard.up('Shift')
}
async function pixelInProjector(popup,x,y,expected) {
  await popup.waitForFunction(({x,y,expected})=>{
    const c=document.querySelector('body > canvas'), gl=c?.getContext('webgl')
    if (!gl) return false
    const pixel=new Uint8Array(4)
    gl.readPixels(Math.round(x*(c.width-1)),Math.round((1-y)*(c.height-1)),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel)
    return expected.every((value,i)=>Math.abs(value-pixel[i])<8)
  },{x,y,expected},{timeout:5000})
}
async function openMapper(browser,mobile,errors) {
  const context = await browser.newContext({
    viewport:mobile ? {width:375,height:812} : {width:1440,height:900},
    isMobile:mobile, hasTouch:mobile, serviceWorkers:'block'
  })
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)))
  const page=await context.newPage()
  page.setDefaultTimeout(8000)
  await page.goto(new URL('?mode=mapeo',base).href)
  const map=page.frameLocator('#mappingFrame')
  await map.locator('#mapMain').waitFor()
  await map.locator('[data-tool=line]').click()
  if (mobile) await map.locator('#mapLineStyle').tap()
  await map.locator('[data-brush=solid]').click()
  if (mobile) await map.locator('#mapLineStyle').tap()
  return {context,page,map}
}
async function shot(page,name) {
  if (process.env.MAP_SHOTS) await page.screenshot({path:join(process.env.MAP_SHOTS,name)})
}
async function desktop(browser,errors) {
  const {context,page,map}=await openMapper(browser,false,errors)
  const tap=async point=>page.mouse.click(...await coordinates(map,point))
  const [popup]=await Promise.all([page.waitForEvent('popup'),click(map,'mapOutput')])
  assert.deepEqual(await popup.locator('body > *').evaluateAll(nodes=>nodes.map(node=>node.tagName)),['CANVAS'])

  await drag(page,map,[.20,.22],[.70,.22])
  await pixelInProjector(popup,.45,.22,green)
  await click(map,'mapUndo')
  await pixelInProjector(popup,.45,.22,black)
  await click(map,'mapRedo')
  await pixelInProjector(popup,.45,.22,green)

  for (const p of [[.20,.40],[.70,.40],[.70,.70]]) await tap(p)
  await map.locator('#mapCloseLine').waitFor()
  await page.keyboard.press('Control+z')
  await map.locator('#mapCloseLine').waitFor({state:'hidden'})
  await tap([.70,.70])
  await pixelInProjector(popup,.50,.40,black)
  await shot(page,'mapeo-linea-antes-de-cerrar.png')
  await tap([.20,.40])
  await pixelInProjector(popup,.45,.55,green)
  await click(map,'mapUndo')
  await pixelInProjector(popup,.45,.55,black)
  await click(map,'mapRedo')
  await pixelInProjector(popup,.45,.55,green)

  for (const p of [[.20,.82],[.60,.82]]) await tap(p)
  await page.keyboard.press('Escape')
  await map.locator('#mapLineActions').waitFor({state:'hidden'})
  await pixelInProjector(popup,.40,.82,black)
  await drag(page,map,[.18,.85],[.57,.98],true)
  await pixelInProjector(popup,.38,.85,green)

  await map.locator('#mapStrokes summary').click()
  await map.getByRole('button',{name:'Línea 1',exact:true}).click()
  await click(map,'mapEditLine')
  await drag(page,map,[.70,.22],[.70,.30])
  await pixelInProjector(popup,.45,.26,green)
  await pixelInProjector(popup,.45,.22,black)
  await page.keyboard.press('Escape')
  assert.equal(await map.locator('#mapEditLine').getAttribute('aria-pressed'),'false')
  await shot(page,'mapeo-linea-editable.png')

  const [download]=await Promise.all([page.waitForEvent('download'),click(map,'mapExport')])
  const bytes=await readFile(await download.path())
  const {packMap,unpackMap}=await import('../src/mapping-project.mjs')
  const saved=await unpackMap(new Blob([bytes]))
  assert.equal(saved.layers.length,1)
  const strokes=saved.layers[0].strokes
  assert.deepEqual(strokes.map(s=>[s.line,s.closed,s.points.length]),[[true,false,2],[true,true,3],[true,false,2]])
  assert.ok(Math.abs(strokes[0].points[1][1]-.30)<.01)
  assert.ok(Math.abs(strokes[2].points[0][1]-strokes[2].points[1][1])<.001)
  await map.locator('#mapProjectFile').setInputFiles({name:'líneas.fosmap',mimeType:'application/octet-stream',buffer:bytes})
  await map.locator('#mapStatus').getByText(/Mapa importado/).waitFor()
  await pixelInProjector(popup,.45,.26,green)
  await pixelInProjector(popup,.45,.55,green)

  const {mapQuadPoint}=await import('../src/mapping-warp.mjs')
  const quad=[[.16,.15],[.82,.18],[.73,.85],[.21,.80]]
  const rect=[.1,.1,.8,.8]
  const [source]=saved.layers
  const warped=packMap({...saved,layers:[{...source,rect,quad}]})
  await map.locator('#mapProjectFile').setInputFiles({
    name:'deformada.fosmap',mimeType:'application/octet-stream',buffer:Buffer.from(await warped.arrayBuffer())
  })
  const toSurface=([x,y])=>mapQuadPoint([(x-rect[0])/rect[2],(y-rect[1])/rect[3]],quad)
  const first=toSurface(strokes[0].points[0]), end=toSurface(strokes[0].points[1]), after=toSurface([.65,.37])
  await pixelInProjector(popup,end[0],end[1],green)
  await map.locator('#mapLayers').getByRole('button',{name:source.name,exact:true}).click()
  if (await map.locator('#mapStrokes').getAttribute('open')===null) await map.locator('#mapStrokes summary').click()
  await map.getByRole('button',{name:'Línea 1',exact:true}).click()
  await click(map,'mapEditLine')
  await drag(page,map,end,after)
  await pixelInProjector(popup,(first[0]+after[0])/2,(first[1]+after[1])/2,green)
  await pixelInProjector(popup,end[0],end[1],black)
  await context.close()
}
async function mobile(browser,errors) {
  const {context,page,map}=await openMapper(browser,true,errors)
  const tap=async point=>page.touchscreen.tap(...await coordinates(map,point))
  for (const point of [[.20,.23],[.72,.23],[.60,.66]]) await tap(point)
  await map.locator('#mapCloseLine').waitFor()
  await shot(page,'mapeo-linea-tactil.png')
  const width=await map.locator('body').evaluate(body=>[body.scrollWidth,body.clientWidth])
  assert.ok(width[0]<=width[1],'Los controles del trazado entran a 375 píxeles')
  await map.locator('#mapCloseLine').tap()
  const frame=page.frames().find(f=>new URL(f.url()).pathname.endsWith('/mapeo.html'))
  await frame.waitForFunction(()=>{
    const c=document.getElementById('mapPreview'), p=c.getContext('2d').getImageData(c.width*.40,c.height*.445,1,1).data
    return p[1]>240 && p[3]>200
  })
  for (const point of [[.12,.8],[.68,.8]]) await tap(point)
  await map.locator('#mapFinishLine').tap()
  assert.equal(await map.locator('#mapLayerControls').isVisible(),true)
  await context.close()
}
async function main() {
  const browser=await chromium.launch({channel:'chromium',args:['--use-angle=d3d11','--enable-unsafe-swiftshader']})
  const errors=[]
  try {
    await desktop(browser,errors)
    await mobile(browser,errors)
    assert.deepEqual(errors,[])
    console.log('Mapeo: recta, polilínea y puntos editables con mouse y táctil, contorno, ajuste a 45°, deshacer/rehacer, archivo portátil y píxeles de salida limpia.')
  } finally { await browser.close() }
}
main().catch(error=>{console.error(error);process.exitCode=1})
