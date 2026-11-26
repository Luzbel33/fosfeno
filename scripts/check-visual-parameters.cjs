const assert = require('node:assert/strict')
const {chromium} = require('playwright')
const {openStudio} = require('./studio-nav.cjs')

const url = process.argv[2] || 'http://127.0.0.1:8736/'
const example = 'Cintas de moiré'
const variant = 'Moiré monocromático QA'
const title = (page,name) => page.locator('.library-row').filter({has:page.getByText(name,{exact:true})})
const dialog = page => page.locator('#visualParameters')

async function library(page,name = example) {
  await openStudio(page,'library')
  await page.locator('[data-shelf=sketches]').click()
  const row = title(page,name)
  await row.waitFor()
  return row
}

async function controls(page,value) {
  await dialog(page).locator('#visualParamSearch').fill('Saturación')
  const numbers = dialog(page).locator('input[type=number]')
  await numbers.first().waitFor()
  const index = await numbers.evaluateAll((inputs,value)=>inputs.findIndex(input=>input.valueAsNumber===value),value)
  assert.notEqual(index,-1,'El inspector debería cargar el valor real '+value)
  return numbers.nth(index)
}

async function editCatalog(page,row,touch = false) {
  const edit = row.locator('[data-action=editVisual]')
  if (touch) await edit.tap()
  else await edit.click()
  await dialog(page).waitFor()
}

function updateEffect(source,value) {
  return source.replace(/\.saturate\([\d.]+\)/,'.saturate('+value+')')
}

function project(page) {
  return page.evaluate(async()=>{
    const blob = captureFosfenoMapping(), header = 'FOSFENO1\n'.length
    const size = new DataView(await blob.slice(header,header+4).arrayBuffer()).getUint32(0)
    return JSON.parse(await blob.slice(header+4,header+4+size).text())
  })
}

async function layer(page,ref) {
  const score = await project(page)
  const region = score.regions.find(region=>region.id===ref.sectorId)
  const layer = ref.layerId ? region.layers.find(layer=>layer.layerId===ref.layerId) : region
  return {...layer,medium:score.assets[layer.file]}
}

function state(page,ref) {
  return page.evaluate(({sectorId,layerId})=>{
    const stack = fosfenoStack.snapshot()
    const sector = stack.rows.find(row=>row.id===sectorId)
    return {pending:stack.pendingOutput,effects:sector.entries.find(entry=>entry.layerId===layerId).effects}
  },ref)
}

function effectButton(page,ref) {
  return page.locator('#sector-tree-'+ref.sectorId+' .layer-tree-effect-name').filter({hasText:example})
}

async function editInstance(page,ref,touch = false) {
  await openStudio(page,'sectors')
  const effect = effectButton(page,ref)
  if (touch) {
    await effect.tap()
    assert.equal(await dialog(page).isVisible(),false)
    await page.locator('#stackParameters').tap()
    await dialog(page).waitFor()
    await submit(page,'cancelVisualParams')
    await page.locator('#stackContext').tap()
  } else await effect.click({button:'right'})
  await page.locator('#stackContextMenu [data-action=inspect]').click()
  await dialog(page).waitFor()
}

async function submit(page,id) {
  await dialog(page).locator('#'+id).click()
  await dialog(page).waitFor({state:'hidden'})
}

async function createSector(page,withMedia) {
  await openStudio(page,'sectors')
  const ref = await page.evaluate(()=>fosfenoStack.geometry.create('Rectángulo',[[.16,.16],[.7,.16],[.7,.7],[.16,.7]],'#c0ff50'))
  if (withMedia) {
    const png = await page.evaluate(()=>{
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')
      ctx.fillStyle = '#751e89'
      ctx.fillRect(0,0,canvas.width,canvas.height)
      return canvas.toDataURL().split(',')[1]
    })
    await page.evaluate(ref=>fosfenoStack.command('media',ref),ref)
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'),page.locator('#sectorFileButton').click()])
    await chooser.setFiles({name:'fondo-del-sector.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')})
    await page.locator('#sector-tree-'+ref.sectorId).getByText('Imagen · fondo-del-sector.png',{exact:true}).waitFor()
  }
  return ref
}

function redStage(page) {
  return page.waitForFunction(()=>{
    const {regl,canvas} = hydraSynth
    const [r,g,b] = regl.read({x:Math.floor(canvas.width/2),y:Math.floor(canvas.height/2),width:1,height:1})
    return r>250 && g<5 && b<5
  })
}

async function desktop(page) {
  await openStudio(page,'code')
  await page.evaluate(()=>cm.setValue('solid(1,0,0).out(o0)'))
  await redStage(page)
  const initial = await project(page)
  let item = await library(page)
  await editCatalog(page,item)
  await (await controls(page,1.9)).fill('0.27')
  await redStage(page)
  await submit(page,'cancelVisualParams')
  assert.equal((await project(page)).code,initial.code)
  assert.deepEqual((await project(page)).regions,initial.regions)
  await editCatalog(page,item)
  await (await controls(page,1.9)).fill('0')
  await dialog(page).locator('#visualParamSave summary').click()
  await dialog(page).locator('#visualVariantName').fill(variant)
  await dialog(page).locator('#saveVisualVariant').click()
  await dialog(page).getByText('Variante guardada en Biblioteca → Mis sketches.').waitFor()
  if (await dialog(page).isVisible()) await submit(page,'cancelVisualParams')
  await title(page,variant).waitFor()
  await redStage(page)

  await page.reload({waitUntil:'domcontentloaded'})
  const copy = await library(page,variant)
  await editCatalog(page,copy)
  await controls(page,0)
  await submit(page,'applyVisualParams')
  assert.match((await project(page)).code,/\.saturate\(0\)/)
  await page.waitForFunction(()=>{
    const {regl,canvas} = hydraSynth
    const pixels = regl.read({x:Math.floor(canvas.width/2),y:Math.floor(canvas.height/2),width:16,height:16})
    let lit = false
    for (let i=0;i<pixels.length;i+=4) {
      const [r,g,b] = pixels.subarray(i,i+3)
      if (Math.max(r,g,b)-Math.min(r,g,b)>1) return false
      if (r>20) lit = true
    }
    return lit
  })
  await page.locator('#baseCard').click({button:'right'})
  await page.locator('#stackContextMenu [data-action=inspect]').click()
  await controls(page,0)
  await submit(page,'cancelVisualParams')
  await editCatalog(page,await library(page))
  await controls(page,1.9)
  await submit(page,'cancelVisualParams')

  const ref = await createSector(page,true)
  item = await library(page)
  await editCatalog(page,item)
  await (await controls(page,1.9)).fill('1.4')
  await submit(page,'mixVisualParams')
  const mixed = await layer(page,ref)
  assert.equal(mixed.medium.name,'fondo-del-sector.png')
  assert.equal(mixed.fx.length,1)
  assert.match(mixed.fx[0].code,/\.saturate\(1\.4\)/)
  await editInstance(page,ref)
  const input=await controls(page,1.4)
  const slider=input.locator('..').locator('input[type=range]')
  await slider.evaluate(el=>{el.value='0.4'; el.dispatchEvent(new Event('input',{bubbles:true}))})
  await page.waitForFunction(async sectorId=>{
    const composition=await unpackComposition(captureFosfenoMapping())
    return composition.regions.find(region=>region.id===sectorId)?.fx
      .some(effect=>effect.code.includes('.saturate(0.4)'))
  },ref.sectorId)
  await slider.dispatchEvent('change')
  assert.equal(await page.locator('#applyVisualParams').isVisible(),false)
  assert.equal(await page.locator('#previewArea').isVisible(),true)
  await submit(page,'cancelVisualParams')
  assert.deepEqual(await layer(page,ref),{...mixed,fx:[{...mixed.fx[0],code:updateEffect(mixed.fx[0].code,.4)}]})
  await page.locator('#stackContext').focus()
  await page.keyboard.press('Control+z')
  await page.getByText('Cambio deshecho.',{exact:true}).waitFor()
  assert.deepEqual(await layer(page,ref),mixed)
  await page.locator('#stackContext').focus()
  await page.keyboard.press('Control+Shift+z')
  await page.getByText('Cambio rehecho.',{exact:true}).waitFor()
  assert.match((await layer(page,ref)).fx[0].code,/\.saturate\(0\.4\)/)

  await page.locator('#liveEdit').click()
  await page.locator('#openMapping').click()
  const map = page.frameLocator('#mappingFrame')
  const mapped = map.locator('#mapStudioLayers [data-stack-kind=effect][data-sector-id="'+ref.sectorId+'"] .map-layer-name')
  await mapped.click({button:'right'})
  await map.locator('#mapContextMenu [data-action=inspect]').click()
  await dialog(page).waitFor()
  assert.equal(await page.locator('#mappingFrame').isVisible(),true)
  await (await controls(page,.4)).fill('0.6')
  await submit(page,'applyVisualParams')
  assert.equal(await page.locator('#mappingFrame').isVisible(),true)
  assert.match((await layer(page,ref)).fx[0].code,/\.saturate\(0\.6\)/)
  assert.equal((await state(page,ref)).pending,true)
  assert.equal((await state(page,ref)).effects[0].state,'Cambio pendiente')
  await map.locator('#mapApplySeed').click()
  await map.locator('#mapApplySeed').waitFor({state:'hidden'})
  assert.equal((await state(page,ref)).pending,false)
  assert.equal((await state(page,ref)).effects[0].state,'En salida')
}

async function mobile(page) {
  const ref = await createSector(page,false)
  await editCatalog(page,await library(page),true)
  const box = await dialog(page).boundingBox(), viewport = page.viewportSize()
  assert.ok(box.x>=0 && box.y>=0 && box.x+box.width<=viewport.width+1 && box.y+box.height<=viewport.height+1)
  await (await controls(page,1.9)).fill('1.2')
  assert.deepEqual(await dialog(page).locator('.vp-body,.vp-controls').evaluateAll(panes=>panes.map(pane=>pane.scrollWidth<=pane.clientWidth+1)),[true,true])
  await dialog(page).locator('#mixVisualParams').tap()
  await dialog(page).waitFor({state:'hidden'})
  await editInstance(page,ref,true)
  await page.keyboard.press('Escape')
  await dialog(page).waitFor({state:'hidden'})
  assert.match((await layer(page,ref)).fx[0].code,/\.saturate\(1\.2\)/)

  await page.locator('#openMapping').tap()
  const map = page.frameLocator('#mappingFrame')
  await map.locator('#mapStudioLayers [data-stack-kind=effect][data-sector-id="'+ref.sectorId+'"] .map-layer-name').tap()
  await map.locator('#mapStackInspector').getByRole('button',{name:'Editar parámetros',exact:true}).tap()
  await (await controls(page,1.2)).fill('0.59')
  assert.equal(await dialog(page).locator('#applyVisualParams').isVisible(),false)
  const frame=await page.locator('#mappingFrame').boundingBox()
  const params=await dialog(page).boundingBox()
  assert.ok(frame.y+frame.height<=params.y+1)
  await dialog(page).locator('#cancelVisualParams').tap()
  await dialog(page).waitFor({state:'hidden'})
  assert.equal(await page.locator('#mappingFrame').isVisible(),true)
  assert.match((await layer(page,ref)).fx[0].code,/\.saturate\(0\.59\)/)
}

;(async()=>{
  const browser = await chromium.launch({channel:'chromium',args:['--use-angle=d3d11','--enable-unsafe-swiftshader']})
  try {
    for (const touch of [false,true]) {
      const page = await browser.newPage({viewport:touch ? {width:375,height:760} : {width:1440,height:900},
        isMobile:touch,hasTouch:touch,serviceWorkers:'block'})
      page.setDefaultTimeout(13000)
      const errors = []
      page.on('pageerror',error=>errors.push(error.message))
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000})
      await page.waitForFunction(()=>!!window.hydraSynth && !!window.fosfenoStack)
      await (touch ? mobile : desktop)(page)
      assert.deepEqual(errors,[])
      console.log(touch ? '375 px táctil: inspector sin desborde, mezcla, edición y cancelar en Estudio, aplicar en Mapeo.' :
        'Biblioteca: variante persistente, píxeles Hydra, contexto, archivo conservado, historial y aplicar desde Mapeo.')
      await page.close()
    }
  } finally { await browser.close() }
})().catch(error=>{ console.error(error); process.exitCode=1 })
