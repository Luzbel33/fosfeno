const assert = require('node:assert/strict')
const { readFile, stat } = require('node:fs/promises')
const { join, posix } = require('node:path')
const { chromium } = require('playwright')

const base = new URL(process.argv[2] || 'http://127.0.0.1:8736/')
const sampleNames = ['Iris de marea','Umbral de ámbar','Deriva abisal']
const read = path => readFile(join(__dirname,'..',path),'utf8')

async function assetAudit() {
  const sw = await read('sw.js')
  const list = sw.match(/const files = \[([\s\S]+?)\n\]/)[1]
  const manifest = [...list.matchAll(/'([^']+)'/g)].map(([,path])=>path)
  assert.equal(new Set(manifest).size,manifest.length,'URLs únicas en el manifiesto.')
  const include = path => assert.ok(manifest.includes(path),'Falta en el manifiesto: '+path)
  for (const path of manifest) assert.ok((await stat(join(__dirname,'..',path.split('?')[0]))).isFile(),path)
  for (const doc of ['index.html','mapeo.html']) {
    for (const [,path] of (await read(doc)).matchAll(/(?:src|href)="((?:src|vendor|assets)\/[^"]+|(?:style|mapping)\.css[^"]*)"/g))
      include(path)
  }
  for (const entry of manifest.filter(path=>/^src\/.+\.(?:js|mjs)(?:\?.*)?$/.test(path))) {
    const local = entry.split('?')[0]
    for (const [,target] of (await read(local)).matchAll(/\b(?:from\s+|import\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g))
      include(posix.join(posix.dirname(local),target))
  }
  for (const sheet of manifest.filter(path=>/\.css(?:\?.*)?$/.test(path))) {
    const local=sheet.split('?')[0]
    for (const [,target] of (await read(local)).matchAll(/url\(([^)]+)\)/g))
      include(posix.join(posix.dirname(local),target.trim().replace(/^['"]|['"]$/g,'')))
  }
  for (const [,asset] of (await read('src/mapping-samples.mjs')).matchAll(/\b(?:path|preview):'([^']+)'/g)) include(asset)
  return manifest
}

async function openMapping(page) {
  const frame=page.frameLocator('#mappingFrame')
  await frame.locator('#mapMain').waitFor()
  return frame
}
async function assertMusic(page) {
  await page.locator('#signalOpen').click()
  const music=page.locator('#musicDesk')
  if (await music.getAttribute('open')===null) await music.locator('summary').first().click()
  await page.locator('#musicSource').waitFor()
  await page.locator('#musicPlay').click()
  await page.waitForFunction(()=>window.musicBeat()>0 && window.a.fft.some(band=>band>.003))
  await page.locator('#musicStop').click()
  await page.waitForFunction(()=>window.musicBeat()===0 && window.a.fft.every(band=>band===0))
}
async function main() {
  const manifest=await assetAudit()
  const browser=await chromium.launch({channel:'chromium',args:['--use-angle=d3d11','--enable-unsafe-swiftshader']})
  try {
    const context=await browser.newContext({viewport:{width:1440,height:900}})
    const errors=[]
    context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)))
    const warm=await context.newPage()
    await warm.goto(new URL('abrir.html',base).href)
    await warm.waitForFunction(async()=>!!(await navigator.serviceWorker.ready).active && !!navigator.serviceWorker.controller)
    const cached=await warm.evaluate(async paths=>{
      const scope = (await navigator.serviceWorker.ready).scope
      const names = await caches.keys()
      const name=names.find(key=>key.startsWith('fosfeno-'))
      const store=await caches.open(name)
      const assets=await store.keys()
      const lookup=new Set(assets.map(asset=>asset.url))
      return paths.filter(path=>!lookup.has(new URL(path,scope).href))
    },manifest)
    assert.deepEqual(cached,[],'La instalación fría cacheó todas las claves exactas.')
    await warm.close()
    await context.setOffline(true)

    const page=await context.newPage()
    page.setDefaultTimeout(14000)
    await page.goto(new URL('abrir.html?mode=mapeo',base).href)
    const map=await openMapping(page)
    const frame=page.frames().find(f=>new URL(f.url()).pathname.endsWith('/mapeo.html'))
    const files=await frame.evaluate(async()=>{
      const [response,license]=await Promise.all([
        fetch('media/modelos/nudo-de-cobre.glb'),
        fetch('vendor/three/LICENSE')
      ])
      if(!response.ok || !license.ok) throw Error('No se recuperó el modelo o su licencia.')
      const model=await response.arrayBuffer()
      return {bytes:[...new Uint8Array(model)],license:await license.text()}
    })
    assert.match(files.license,/The MIT License/)
    await map.locator('#mapMediaFile').setInputFiles({
      name:'nudo-de-cobre.glb',mimeType:'model/gltf-binary',buffer:Buffer.from(files.bytes)
    })
    await map.locator('#mapSurface[data-cursor=place]').waitFor()
    const box=await map.locator('#mapSurface').boundingBox()
    await page.mouse.move(box.x+box.width*.13,box.y+box.height*.1)
    await page.mouse.down()
    await page.mouse.move(box.x+box.width*.58,box.y+box.height*.65,{steps:10})
    await page.mouse.up()
    await map.locator('#mapLayers').getByText('Modelo 3D',{exact:true}).waitFor()
    await frame.waitForFunction(()=>{
      const c=document.getElementById('mapPreview'), ctx=c.getContext('2d')
      const pixels=ctx.getImageData(c.width*.24,c.height*.24,c.width*.22,c.height*.24).data
      return pixels.some((value,i)=>i%4!==3 && value>30)
    })
    await map.locator('#mapModel summary').click()
    await map.locator('#mapModel').getByText(/Inclinación|Rotación|Giro/).first().waitFor()

    for (const name of sampleNames) {
      await map.locator('#mapSamples').click()
      const dialog=map.locator('#mapSamplesDialog')
      await dialog.waitFor()
      await dialog.locator('img').evaluateAll(previews=>Promise.all(previews.map(image=>image.decode())))
      const previous=await map.locator('#mapLayers .map-layer').count()
      await dialog.getByRole('button',{name:'Sumar '+name,exact:true}).click()
      await dialog.waitFor({state:'hidden'})
      assert.ok(await map.locator('#mapLayers .map-layer').count()>previous)
    }
    await page.locator('#exitMapping').click()
    await assertMusic(page)
    await page.reload()
    await page.waitForFunction(()=>!!window.cm?.getValue() && !!navigator.serviceWorker.controller)
    await assertMusic(page)
    assert.deepEqual(errors,[])
    console.log('Sin conexión en un contexto nuevo: recarga desde abrir.html, compositor, 3 muestras, .glb renderizado con su licencia, música y FFT tras recarga. '+manifest.length+' URLs cacheadas con clave exacta.')
  } finally {await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
