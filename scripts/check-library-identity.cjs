const assert=require('node:assert/strict')
const { chromium }=require('playwright')
const url=new URL(process.argv[2] || 'http://127.0.0.1:8736/')
url.searchParams.set('sketch_id','nacar')

async function main() {
  const browser=await chromium.launch({channel:'chromium',args:['--use-angle=d3d11','--enable-unsafe-swiftshader']})
  try {
    const page=await browser.newPage({serviceWorkers:'block'})
    await page.addInitScript(()=>{
      if (!localStorage.getItem('fosfeno:scores')) {
        localStorage.setItem('fosfeno:scores',JSON.stringify([{id:'qa-versión',name:'Nácar en fuga',code:'solid(0,1,0).out(o0)'}]))
      }
    })
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.goto(url.href)
    await page.waitForFunction(()=>window.hydraSynth && window.fosfenoStack)
    const initial=await page.evaluate(async()=>{
      const snapshot=await unpackComposition(captureFosfenoMapping())
      window.basePiece=SKETCHES.find(s=>s.id==='nacar')
      return [snapshot.libraryId,snapshot.code===basePiece.code]
    })
    assert.deepEqual(initial,['sketch:nacar',true])
    for (const folds of [9,12]) {
      await page.evaluate(folds=>{
        cm.setValue(basePiece.code.replace('const pliegues = 5','const pliegues = '+folds))
        document.querySelector('#run').click()
      },folds)
      await page.waitForFunction(folds=>{
        const source=new URL(location.href).searchParams.get('code')
        return history.state?.fosfenoLibrary?.libraryId==='sketch:nacar' && source &&
          decodeURIComponent(atob(source)).includes('const pliegues = '+folds)
      },folds)
    }
    await page.goBack()
    await page.waitForFunction(()=>cm.getValue().includes('const pliegues = 9'))
    const base=await page.evaluate(async()=>{
      const project=await unpackComposition(captureFosfenoMapping())
      return [project.libraryId,project.name]
    })
    assert.deepEqual(base,['sketch:nacar','Nácar en fuga'])
    await page.goForward()
    await page.waitForFunction(()=>cm.getValue().includes('const pliegues = 12'))
    assert.equal(await page.evaluate(async()=>(await unpackComposition(captureFosfenoMapping())).libraryId),'sketch:nacar')

    const old=await page.evaluate(async()=>{
      const project=await unpackComposition(captureFosfenoMapping())
      const principal={id:0,shape:'Principal',points:[[0,0],[1,0],[1,1],[0,1]],visible:true,
        opacity:1,source:'sketch',paint:false,fx:[{kind:'library',name:'Título anterior',code:basePiece.code,value:.35}]}
      await restoreFosfenoMapping(packComposition({...project,regions:[principal]}))
      window.ref={sectorId:0,layerId:0,kind:'sector'}
      window.choice=key=>fosfenoStack.choices(ref,'library').find(row=>row.key===key)
      const state=await unpackComposition(captureFosfenoMapping())
      return [state.regions[0].fx[0].libraryId,choice('builtin:nacar').assigned,choice('saved:qa-versión').assigned]
    })
    assert.deepEqual(old,['sketch:nacar',true,false])

    const changes=await page.evaluate(async()=>{
      const project=await unpackComposition(captureFosfenoMapping())
      const fx=project.regions[0].fx[0]
      fx.code='solid(0,0,1).out(o0)'
      fx.generator={seed:'81',fold:'x'}
      fx.name=basePiece.name
      await restoreFosfenoMapping(packComposition(project))
      const entry=choice('builtin:nacar')
      const captured=()=>unpackComposition(captureFosfenoMapping())
      await fosfenoStack.command('amount',entry.effect,.72)
      fosfenoStack.applyChoice(ref,'builtin:nacar')
      const paused=choice('builtin:nacar')
      const p=(await captured()).regions[0].fx[0]
      fosfenoStack.applyChoice(ref,'saved:qa-versión')
      const together=(await captured()).regions[0].fx.map(f=>f.libraryId)
      await fosfenoStack.command('remove',paused.effect)
      const onlySaved=[choice('builtin:nacar').assigned,choice('saved:qa-versión').assigned]
      await fosfenoStack.command('undo',ref)
      const back=(await captured()).regions[0].fx[0]
      const portable=captureFosfenoMapping()
      await restoreFosfenoMapping(portable)
      const loaded=choice('builtin:nacar')
      return {original:[entry.assigned,entry.modified],paused:[paused.assigned,paused.active,p.value,p.code,p.generator??null],
        together,onlySaved,back:[back.libraryId,back.code,back.enabled,back.value],loaded:[loaded.assigned,loaded.active,loaded.modified]}
    })
    assert.deepEqual(changes,{original:[true,true],paused:[true,false,.72,'solid(0,0,1).out(o0)',null],
      together:['sketch:nacar','saved:qa-versión'],onlySaved:[false,true],back:['sketch:nacar','solid(0,0,1).out(o0)',false,.72],loaded:[true,false,true]})
    const collisions=await page.evaluate(async()=>{
      const project=await unpackComposition(captureFosfenoMapping())
      const layer=project.regions[0]
      layer.fx[1].code=layer.fx[0].code
      await restoreFosfenoMapping(packComposition(project))
      fosfenoStack.applyChoice(ref,'builtin:nacar')
      const first=[choice('builtin:nacar').active,choice('saved:qa-versión').active]
      fosfenoStack.applyChoice(ref,'saved:qa-versión')
      const second=[choice('builtin:nacar').active,choice('saved:qa-versión').active]
      layer.fx=[{kind:'library',name:basePiece.name,code:'solid(.7,.2,.8).out()',value:.5}]
      await restoreFosfenoMapping(packComposition(project))
      return [first,second,[choice('builtin:nacar').assigned,choice('saved:qa-versión').assigned]]
    })
    assert.deepEqual(collisions,[[true,true],[true,false],[false,false]])
    assert.deepEqual(errors,[])
    console.log('Biblioteca: fondo ajustado atrás/adelante en historial, migración por código exacto, visuales homónimas independientes; mezcla variada ajustada, pausada, quitada, deshecha y reabierta desde .fosfeno sin atribuir semilla.')
  } finally { await browser.close() }
}
main().catch(error=>{console.error(error);process.exitCode=1})
