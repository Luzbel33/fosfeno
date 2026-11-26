const assert = require('node:assert/strict')
const { readFile } = require('node:fs/promises')
const { chromium } = require('playwright')
const { GifWriter } = require('../vendor/omggif/omggif.js')
const { openStudio } = require('./studio-nav.cjs')

const url = process.argv[2] || 'http://127.0.0.1:8736/'
const red = [255, 0, 0]
const blue = [0, 0, 255]

function fixture(repeat = 0) {
  const bytes = Buffer.alloc(4096)
  const gif = new GifWriter(bytes,32,32,{loop:repeat,palette:[0,0xff0000,0x00ff00,0x0000ff]})
  const frame = (x,y,w,h,color,delay,disposal) =>
    gif.addFrame(x,y,w,h,new Uint8Array(w*h).fill(color),{transparent:0,delay,disposal})
  frame(0,0,16,32,1,12,1)
  frame(16,0,16,32,2,26,3)
  frame(0,0,16,16,3,10,2)
  frame(16,16,16,16,2,14,1)
  return { name:'cuatro-cuadros.gif',mimeType:'image/gif',buffer:bytes.subarray(0,gif.end()) }
}

async function boot(context, errors) {
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000})
  await page.waitForFunction(() => !!window.cm?.getValue().trim() && !!window.hydraSynth).catch(error => {
    throw new Error('El estudio no terminó de arrancar'+(errors.length ? '\n'+errors.join('\n') : ''),{cause:error})
  })
  return page
}

async function decoderTiming(page) {
  const states = await page.evaluate(bytes => {
    const animation = new GifAnimation(Uint8Array.from(bytes).buffer)
    const ctx = animation.canvas.getContext('2d')
    const inspect = ms => {
      animation.advance(animation.start+ms)
      return [animation.running,[...ctx.getImageData(8,8,1,1).data],
        [...ctx.getImageData(24,8,1,1).data],[...ctx.getImageData(8,24,1,1).data]]
    }
    const result = [10,119,120,379,380,479,480,620,1240].map(inspect)
    animation.close()
    result.push([animation.canvas.width,animation.canvas.height])
    return result
  }, Array.from(fixture(1).buffer))
  const omitted = [0,0,0,0], opaqueRed = [...red,255], opaqueBlue = [...blue,255], opaqueGreen = [0,255,0,255]
  assert.deepEqual(states,[
    [true,opaqueRed,omitted,opaqueRed],[true,opaqueRed,omitted,opaqueRed],
    [true,opaqueRed,opaqueGreen,opaqueRed],[true,opaqueRed,opaqueGreen,opaqueRed],
    [true,opaqueBlue,omitted,opaqueRed],[true,opaqueBlue,omitted,opaqueRed],
    [true,omitted,omitted,opaqueRed],[true,opaqueRed,omitted,opaqueRed],
    [false,omitted,omitted,opaqueRed],[1,1]
  ])
}

async function seeColor(page, kind, x, y, rgb) {
  await page.waitForFunction(({kind,x,y,rgb}) => {
    const studio = hydraSynth
    let pixel
    if (kind==='sector') {
      const {canvas,regl}=studio
      pixel=regl.read({x:Math.floor(x*canvas.width),y:Math.floor((1-y)*canvas.height),width:1,height:1})
    } else {
      const canvas=kind==='s0' ? studio.synth.s0.src :
        document.querySelector('#mappingFrame').contentWindow.fosfenoMapping?.preview()?.canvas
      if (!(canvas?.tagName==='CANVAS') || canvas.width<2 || canvas.height<2) return false
      pixel=canvas.getContext('2d').getImageData(Math.floor(x*canvas.width),Math.floor(y*canvas.height),1,1).data
    }
    return rgb.every((value,index) => Math.abs(value-pixel[index])<15)
  }, {kind,x,y,rgb}, {timeout:9000}).catch(error => {
    throw new Error(kind+' no mostró GIF RGB '+rgb.join(', '),{cause:error})
  })
}

async function drag(page, locator, from, to) {
  const box = await locator.boundingBox()
  const position = ([x,y]) => [box.x+x*box.width,box.y+y*box.height]
  await page.mouse.move(...position(from))
  await page.mouse.down()
  await page.mouse.move(...position(to),{steps:5})
  await page.mouse.up()
}

async function archive(page, expected) {
  const data = Buffer.from(await page.evaluate(async () =>
    Array.from(new Uint8Array(await window.captureFosfenoMapping().arrayBuffer()))))
  const header = 'FOSFENO1\n'.length
  const jsonSize = data.readUInt32BE(header)
  const start = header+4+jsonSize
  const manifest = JSON.parse(data.toString('utf8',header+4,start))
  const assets = manifest.assets.filter(asset => asset.type === 'image/gif')
  assert.ok(assets.length>0 && assets.every(asset => asset.size === expected.length))
  let offset = start
  for (const asset of manifest.assets) {
    if (asset.type==='image/gif') assert.deepEqual(data.subarray(offset,offset+asset.size),expected)
    offset += asset.size
  }
  return data
}

async function main() {
  const {unpackMap} = await import('../src/mapping-project.mjs')
  const browser = await chromium.launch({channel:'chromium',args:['--use-angle=d3d11','--enable-unsafe-swiftshader']})
  try {
    const context = await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'})
    const errors = []
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)))
    const file = fixture()
    const page = await boot(context,errors)
    await decoderTiming(page)
    await openStudio(page,'code')
    await page.evaluate(() => cm.setValue('setResolution(640,360)\nsolid(0,0,0).out(o0)'))
    await openStudio(page,'signal')
    await page.locator('#visualFile').setInputFiles(file)
    await seeColor(page,'s0',.25,.25,red)
    await seeColor(page,'s0',.25,.25,blue)
    await page.evaluate(() => { window.gifForRelease = hydraSynth.synth.s0.src })
    const studio = await archive(page,file.buffer)
    await page.locator('#clearVisual').click()
    await page.waitForFunction(() => window.gifForRelease.width===1)
    await page.evaluate(async bytes => {
      await window.restoreFosfenoMapping(new Blob([Uint8Array.from(bytes)]))
    },Array.from(studio))
    await seeColor(page,'s0',.25,.25,blue)

    await openStudio(page,'sectors')
    await page.locator('#newSector').click()
    await page.locator('#sectorShapes').getByRole('button',{name:'Rectángulo',exact:true}).click()
    await drag(page,page.locator('#sectorGuide'),[.18,.17],[.66,.65])
    await page.locator('#openLoops').click()
    await page.locator('#loopFile').setInputFiles(file)
    const loop = page.locator('#loopList')
    await loop.getByRole('button',{name:'Vista previa de '+file.name}).click()
    const preview = loop.getByRole('img',{name:'Vista previa de '+file.name})
    await preview.waitFor()
    await preview.evaluate(img => img.decode())
    await loop.getByRole('button',{name:'Usar '+file.name,exact:true}).click()
    await page.locator('#sector-tree-1').getByText('Loop · '+file.name,{exact:true}).waitFor()
    await seeColor(page,'sector',.29,.27,red)
    await seeColor(page,'sector',.29,.27,blue)
    await archive(page,file.buffer)

    await page.locator('#openMapping').click()
    const map = page.frameLocator('#mappingFrame')
    await map.locator('#mapMain').waitFor()
    await map.locator('#mapMediaFile').setInputFiles({...file,mimeType:'application/octet-stream'})
    await map.locator('#mapSurface[data-cursor="place"]').waitFor()
    await drag(page,map.locator('#mapSurface'),[.22,.22],[.55,.8])
    await map.locator('#mapLayers').getByText('GIF animado',{exact:true}).waitFor()
    await seeColor(page,'mapping',.29,.30,red)
    await seeColor(page,'mapping',.29,.30,blue)
    const [download] = await Promise.all([page.waitForEvent('download'),map.locator('#mapExport').click()])
    const portable = await readFile(await download.path())
    const project = await unpackMap(new Blob([portable]))
    assert.equal(project.layers[0].file.type,'image/gif')
    assert.deepEqual(Buffer.from(await project.layers[0].file.arrayBuffer()),file.buffer)
    await map.locator('#mapProjectFile').setInputFiles({
      name:'gif.fosmap', mimeType:'application/octet-stream', buffer:portable
    })
    await map.locator('#mapStatus').getByText(/Mapa importado/).waitFor({state:'attached'})
    await seeColor(page,'mapping',.29,.30,blue)
    await map.locator('#mapMain').evaluate(() => {
      window.closedGif = 0
      const close = GifAnimation.prototype.close
      GifAnimation.prototype.close = function () {
        window.closedGif++
        return close.call(this)
      }
    })
    await map.locator('#mapLayers .map-layer-name').filter({hasText:'GIF animado'}).click()
    await map.locator('#mapRemoveLayer').click()
    assert.ok(await map.locator('#mapMain').evaluate(() => window.closedGif>0))
    await seeColor(page,'mapping',.29,.30,[0,0,0])
    await map.locator('#mapUndo').click()
    await seeColor(page,'mapping',.29,.30,blue)
    assert.deepEqual(errors,[])
    console.log('GIF: demoras, transparencia, disposición y repeticiones; s0, sectores, Loops, Mapeo, liberación y portabilidad.')
  } finally { await browser.close() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
