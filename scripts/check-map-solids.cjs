const assert=require('node:assert/strict')
const {readFile}=require('node:fs/promises')
const {join}=require('node:path')
const {chromium}=require('playwright')
const {GifWriter}=require('../vendor/omggif/omggif.js')

async function main() {
  const studio=new URL(process.argv[2] || 'http://127.0.0.1:8736/')
  studio.searchParams.set('mode','mapeo')
  studio.searchParams.set('code',Buffer.from(encodeURIComponent('solid(0,1,0).out(o0)')).toString('base64'))
  const browser=await chromium.launch({channel:'chromium',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
  try {
    const p=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'})
    const errors=[]
    p.on('pageerror',e=>errors.push(String(e)))
    p.setDefaultTimeout(9000)
    await p.goto(studio.href)
    const map=p.frameLocator('#mappingFrame'), id=name=>map.locator('#'+name)
    const b=(root,name)=>root.getByRole('button',{name,exact:true})
    const face=name=>b(id('mapSolidFaces'),name).click()
    const color=async name=>{await id('mapFaceColor').click(); await b(id('mapFaceColors'),name).click()}
    const sample=()=>popup.locator('body > canvas').evaluate(src=>{
      const c=document.createElement('canvas'); c.width=100;c.height=60
      const ctx=c.getContext('2d');ctx.drawImage(src,0,0,c.width,c.height)
      const data=ctx.getImageData(0,0,c.width,c.height).data,counts={}
      let signature=2166136261
      for(let i=0;i<data.length;i+=4) {
        const [r,g,b]=[data[i],data[i+1],data[i+2]]
        const key=[r,g,b].join(','); counts[key]=(counts[key]||0)+1
        signature=Math.imul(signature^(r*65536+g*256+b),16777619)
      }
      return {counts,signature}
    })
    const until=async predicate=>{
      for(let i=0;i<60;i++){const result=await sample(); if(predicate(result))return result;await new Promise(r=>setTimeout(r,60))}
      assert.fail('El proyector no alcanzó el estado esperado. Errores: '+errors.join(', '))
    }
    const popupEvent=p.waitForEvent('popup')
    await id('mapOutput').click()
    const popup=await popupEvent
    await id('mapShape').click(); await map.locator('[data-map-solid=cube]').click()
    await until(({counts})=>counts['122,226,215']>10)
    assert.equal(await id('mapSolidFaces').getByRole('button').count(),7)
    await color('Fucsia'); await until(({counts})=>counts['255,90,146']>50)
    await face('Frente'); await color('Agua')
    await until(({counts})=>counts['255,90,146']>20 && counts['122,226,215']>20)
    const pick=p.waitForEvent('filechooser');await id('mapFaceFile').click()
    await (await pick).setFiles({name:'cara-azul.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>')})
    await until(({counts})=>counts['0,0,255']>20 && counts['255,90,146']>20)
    await id('mapUndo').click()
    await until(({counts})=>!counts['0,0,255'] && counts['122,226,215']>20)
    await id('mapRedo').click()
    await until(({counts})=>counts['0,0,255']>20)
    await id('mapSolidPanel').locator('.pose-3d summary').click()
    await b(id('mapSolidPanel'),'Continua').click()
    await b(id('mapSolidPanel'),'Órbita').click()
    const view=await sample(); await until(({signature})=>signature!==view.signature)
    const download=p.waitForEvent('download'); await id('mapExport').click()
    const bytes=await readFile(await (await download).path())
    const {unpackMap}=await import('../src/mapping-project.mjs')
    const saved=await unpackMap(new Blob([bytes]))
    const model=saved.layers.find(l=>l.kind==='solid').solid
    assert.equal(model.faces.length,6);assert.equal(model.faces[0].file.name,'cara-azul.svg')
    assert.deepEqual(model.faces.slice(1).map(m=>m.color),Array(5).fill('#ff5a92'))
    assert.equal(model.pose.spin,true);assert.equal(model.pose.path,'circle')
    await id('mapRemoveLayer').click();await until(({counts})=>counts['0,0,0']===6000)
    await id('mapProjectFile').setInputFiles({name:'cubo.fosmap',mimeType:'application/octet-stream',buffer:bytes})
    await until(({counts})=>counts['255,90,146']>10)
    assert.equal(await id('mapShape').isVisible(),true,'Recuperar debe conservar la mesa de Mapeo')
    await b(id('mapLayers'),'Ocultar Cubo 1').click()
    await id('mapShape').click();await map.locator('[data-map-solid=pyramid]').click()
    assert.equal(await id('mapSolidFaces').getByRole('button').count(),6)
    await face('Frente')
    await id('mapFaceHydra').click(); await b(id('mapFaceSources'),'Salida Hydra').click()
    await until(({counts})=>counts['0,255,0']>10)
    const gifBytes=Buffer.alloc(512)
    const gif=new GifWriter(gifBytes,8,8,{loop:0,palette:[0xff0000,0xffff00]})
    for (const shade of [0,1]) gif.addFrame(0,0,8,8,new Uint8Array(64).fill(shade),{delay:30})
    const gifPick=p.waitForEvent('filechooser');await id('mapFaceFile').click()
    await (await gifPick).setFiles({name:'cara-animada.gif',mimeType:'image/gif',buffer:gifBytes.subarray(0,gif.end())})
    await until(({counts})=>counts['255,0,0']>10)
    await until(({counts})=>counts['255,255,0']>10)
    await p.locator('#loopFile').setInputFiles({name:'loop-para-cara.gif',mimeType:'image/gif',buffer:gifBytes.subarray(0,gif.end())})
    await id('mapFaceLoop').click();await b(id('mapLoopList'),'loop-para-cara.gif').click()
    await map.getByText('Frente · Loop · loop-para-cara.gif',{exact:true}).waitFor()
    await until(({counts})=>counts['255,0,0']>10)
    await until(({counts})=>counts['255,255,0']>10)
    await face('Todas las caras'); await color('Negro'); await face('Frente')
    const glbPick=p.waitForEvent('filechooser');await id('mapFaceFile').click()
    await (await glbPick).setFiles(join(__dirname,'../media/modelos/nudo-de-cobre.glb'))
    await map.getByText('Frente · nudo-de-cobre.glb',{exact:true}).waitFor()
    await until(({counts})=>Object.keys(counts).length>20)
    assert.deepEqual(await popup.locator('body > *').evaluateAll(es=>es.map(e=>e.tagName)),['CANVAS'])
    assert.deepEqual(errors,[])
    console.log('Cubo y pirámide por cara o conjunto; píxeles de color, imagen, GIF, loop, GLB y Hydra, undo/redo, giro + órbita, archivo recuperado y proyector limpio.')
  } finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
