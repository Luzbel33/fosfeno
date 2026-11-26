const assert=require('node:assert/strict')
const {readFile}=require('node:fs/promises')
const {chromium}=require('playwright')

async function main() {
  const browser=await chromium.launch({channel:'chromium',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
  try {
    const p=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'})
    const errors=[];p.on('pageerror',e=>errors.push(String(e)))
    p.setDefaultTimeout(10000)
    const url=process.argv[2] || 'http://127.0.0.1:8736/'
    const red='solid(1,0,0).out(o0)',green='solid(0,1,0).out(o0)'
    const id=name=>p.locator('#'+name), codeTab=p.locator('#studioNav [data-view=code]')
    const scoped=()=>id('contextCodeBox').locator('.CodeMirror').evaluate(el=>el.CodeMirror.getValue())
    const edit=text=>id('contextCodeBox').locator('.CodeMirror').evaluate((el,value)=>el.CodeMirror.setValue(value),text)
    const option=async re=>{await id('codeDestination').click();await id('codeDestinationList').getByRole('button',{name:re}).click()}
    const pixel=channel=>p.waitForFunction(channel=>{
      hydraSynth.tick(35)
      const {canvas,regl}=hydraSynth
      const rgba=regl.read({x:canvas.width>>1,y:canvas.height>>1,width:1,height:1})
      return rgba[channel]>110 && rgba[(channel+1)%3]<4 && rgba[(channel+2)%3]<4
    },channel)
    await p.addInitScript(saved=>localStorage.setItem('fosfeno:scores',JSON.stringify([saved])),{id:'context-qa',name:'Tinta de prueba',code:red})
    await p.goto(url)
    await p.waitForFunction(()=>window.hydraSynth && window.fosfenoStack)
    await id('removeBase').click();await id('baseLibrary').click()
    const row=id('mine').locator('.library-row').filter({hasText:'Tinta de prueba'})
    await row.locator('button[aria-pressed]').click()
    await codeTab.click();await pixel(0)
    assert.equal(await scoped(),red);assert.match(await id('codeDestination').innerText(),/Tinta de prueba/)
    await id('liveEdit').click();await edit(green);await id('applySectors').waitFor()
    await pixel(0);await id('applySectors').click();await pixel(1)
    const download=p.waitForEvent('download');await id('exportJS').click()
    assert.equal(await readFile(await (await download).path(),'utf8'),green)
    const saved=await p.evaluate(async()=>{
      window.qaComposition=await window.captureFosfenoMapping()
      const project=await unpackComposition(window.qaComposition)
      return {base:project.settings.baseMode,variant:project.regions.find(r=>r.id===0).fx[0],code:project.code}
    })
    assert.equal(saved.base,'empty');assert.equal(saved.variant.code,green)
    assert.ok(saved.variant.libraryId);assert.equal(saved.variant.generator,undefined)
    await edit('solid(0,0,1).out(o0)');await id('applySectors').waitFor()
    await id('applySectors').click();await pixel(2)
    await p.evaluate(()=>restoreFosfenoMapping(window.qaComposition));await pixel(1)
    await codeTab.click();assert.equal(await scoped(),green)
    await option(/Fondo · Vacío/);assert.equal(await id('baseCodeBox').isVisible(),true)
    assert.equal(await p.evaluate(()=>cm.getValue().trim()),'')
    await option(/Mezcla principal.*Tinta de prueba$/)
    assert.equal(await p.evaluate(()=>fosfenoStack.snapshot().selection.kind),'effect')
    await codeTab.click();assert.equal(await scoped(),green)
    const refs=await p.evaluate(async()=>{
      const stack=window.fosfenoStack
      const root=stack.geometry.create('Rectángulo',[[.2,.2],[.8,.2],[.8,.8],[.2,.8]],'#abcdef')
      await stack.command('addLayer',root)
      const layer=stack.snapshot().selection
      const fx=stack.choices(layer,'library','Tinta')[0]
      stack.applyChoice(layer,fx.key)
      const op=stack.choices(layer,'effects','saturate').find(r=>r.key==='hydra:saturate')
      stack.applyChoice(layer,op.key)
      return {root,layer}
    })
    await p.evaluate(ref=>fosfenoStack.command('code',ref),refs.root)
    assert.match(await id('codeDestination').innerText(),/Rectángulo/);assert.equal(await scoped(),red)
    await option(/Rectángulo.*saturate$/)
    assert.match(await scoped(),/^\.saturate\(/);await edit('.saturate(0.7)')
    await option(/Rectángulo.*Capa 2.*Configuración de capa/);assert.match(await scoped(),/"(opacidad|efectos)":/)
    assert.equal(await id('contextCodeBox').locator('.CodeMirror').evaluate(el=>el.CodeMirror.getOption('readOnly')),true)
    await p.evaluate(ref=>fosfenoStack.command('select',ref),refs.root)
    await id('groupSectorLayers').click()
    await p.getByRole('button',{name:'Marcar Base',exact:true}).click()
    await p.getByRole('button',{name:'Marcar Capa 2',exact:true}).click()
    await id('createSectorGroup').click();await codeTab.click()
    assert.match(await id('codeDestination').innerText(),/Grupo/);assert.equal(await scoped(),red)
    await p.evaluate(()=>window.openFosfenoCode({sectorId:0,layerId:0,kind:'sector'}));assert.equal(await scoped(),green)
    const mapped=new URL(url);mapped.searchParams.set('mode','mapeo')
    await p.goto(mapped.href)
    const map=p.frameLocator('#mappingFrame')
    await map.locator('#mapShape').click();await map.locator('[data-map-solid=cube]').click()
    await codeTab.click();await id('contextCodeBox').waitFor()
    assert.equal(await id('codeReturnMap').isVisible(),true);assert.ok(JSON.parse(await scoped()))
    await id('codeReturnMap').click();assert.equal(await map.locator('#mapShape').isVisible(),true)
    assert.deepEqual(errors,[])
    console.log('Código contextual: mezcla sin fondo, RGB en vivo/manual, descarga, código por sector/capa/operador, configuración nativa, Mapeo y vuelta al lienzo.')
  } finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
