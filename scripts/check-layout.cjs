const { openStudio } = require('./studio-nav.cjs')
const assert = require('node:assert/strict')
const { chromium, firefox, webkit } = require('playwright')

const sizes = [[280,653],[320,568],[360,640],[375,812],[430,932],[320,360],
  [640,360],[667,375],[844,390],[700,510],[768,1024],[820,1180],[901,650],
  [1024,768],[1180,610],[1280,720],[1440,900],[1920,1080]]
const url = process.argv.find(arg => /^https?:/.test(arg)) || 'http://127.0.0.1:8736/'
const engine = process.argv.slice(2).find(arg => ['firefox','webkit'].includes(arg)) || 'chromium'

async function touchAndZoom(browser) {
  const page = await browser.newPage({viewport:{width:375,height:812},hasTouch:true,isMobile:true,deviceScaleFactor:2})
  const session = await page.context().newCDPSession(page)
  await page.goto(url)
  await page.waitForFunction(() => window.hydraSynth && window.cm)
  const layers = page.locator('#backToLayers')
  await layers.tap()
  const tap = (id) => page.locator('#'+id).tap()
  await layers.tap()
  assert.ok(await page.locator('#layerDesk').isVisible(),'tapping Sectores again keeps it open')
  await tap('closeTools')
  assert.equal(await page.locator('.studio').isVisible(),false)
  const code = page.locator('#studioNav [data-view=code]')
  await code.tap()
  await code.tap()
  assert.equal(await code.getAttribute('aria-current'),'true')
  assert.equal(await code.getAttribute('aria-pressed'),null)
  assert.ok(await page.locator('#editorPage').isVisible(),'tapping Código again keeps it open')
  await tap('closeTools')
  await layers.tap()
  const touch = (type, points) => session.send('Input.dispatchTouchEvent',{type,touchPoints:points})
  await tap('newSector')
  await page.locator('#sectorShapes').getByRole('button',{name:'Rectángulo',exact:true}).tap()
  const mask = await page.locator('#sectorGuide').boundingBox()
  const point = fraction => ({x:Math.round(mask.x+mask.width*fraction),y:Math.round(mask.y+mask.height*fraction)})
  await touch('touchStart',[point(.2)])
  await touch('touchMove',[point(.75)])
  await touch('touchEnd',[])
  assert.equal(await page.locator('#effectTarget').textContent(),'Rectángulo 1')
  assert.equal(await page.locator('#layerOverview .layer-select[aria-pressed=true]').getAttribute('aria-label'),'Rectángulo 1')
  const layerScroll = () => page.locator('#layerDesk').evaluate(el=>el.scrollTop)
  const beforePicker = await layerScroll()
  await tap('addSectorEffect')
  assert.ok(await page.locator('#effectPicker').isVisible(),'first tap after drawing opens the sector effects')
  await page.locator('#sectorFx').getByRole('button',{name:'Invertir',exact:true}).tap()
  await tap('addSectorEffect')
  assert.equal(await layerScroll(),beforePicker,'closing effects restores the layer list position')
  assert.match(await page.locator('#sectorControls').innerText(),/Invertir[\s\S]*En salida/)
  const bar = await page.locator('#splitter').boundingBox()
  const x = Math.round(bar.x + bar.width/2), y = Math.round(bar.y + bar.height/2)
  const before = await page.locator('#stage').boundingBox()
  await touch('touchStart',[{x,y}])
  await touch('touchMove',[{x,y:y+80}])
  await touch('touchEnd',[])
  const after = await page.locator('#stage').boundingBox()
  assert.ok(before.height - after.height > 50,'touch changes the space available to the editor')
  await page.locator('[data-help=efectos]').tap()
  await page.locator('#helpDialog[open]').waitFor({timeout:3000})
  await session.send('Emulation.setPageScaleFactor',{pageScaleFactor:2})
  await page.waitForFunction(() => {
    const v = visualViewport, r = document.querySelector('#helpDialog').getBoundingClientRect()
    return v.scale >= 1.99 && r.width <= v.width+1 && r.top >= v.offsetTop-1 && r.bottom <= v.offsetTop+v.height+1
  })
  const button = page.locator('#moreHelp')
  for(let i=0; i<30 && await button.isVisible() && await button.isEnabled(); i++) await button.tap()
  assert.ok(await button.isDisabled(),'reached the last definition at 200%')
  assert.ok(await page.locator('#closeHelp').evaluate(el => {
    const r = el.getBoundingClientRect(), v = visualViewport
    return r.left >= v.offsetLeft-1 && r.right <= v.offsetLeft+v.width+1 &&
      r.top >= v.offsetTop-1 && r.bottom <= v.offsetTop+v.height+1
  }),'close stays within the zoomed viewport')
  await page.locator('#closeHelp').tap()
  await session.send('Emulation.setPageScaleFactor',{pageScaleFactor:1})
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await page.context().setOffline(true)
  await page.reload()
  await page.waitForFunction(() => window.hydraSynth && window.cm?.getValue().startsWith('// Semilla '))
  await layers.tap()
  await page.locator('[data-help=efectos]').tap()
  assert.equal(await page.locator('#helpContent dd').count(),12)
  await page.close()
  console.log('Touch sector effects and divider, 200% visual viewport, offline reload and offline effects guide OK')
}

async function main() {
  const browser = await {chromium,firefox,webkit}[engine].launch(engine === 'chromium'
    ? {channel:'chromium',args:['--use-angle=d3d11','--enable-unsafe-swiftshader']} : {})
  try {
    const page = await browser.newPage({viewport:{width:375,height:812}})
    await page.addInitScript(() => localStorage.removeItem('fosfeno:draft'))
    const id = text => page.locator('#'+text)
    const audit = async label => {
      const overflow = await page.evaluate(()=>{
        const containers = document.querySelectorAll('html,body,main,.studio,#inspectorDesk,#studioNav,#sessionActions,.mixer-effect,.transport,.output-head,.panel-scroll,#helpContent,#editorPage,.runline,.sector-control,.fileline,.operator-head,.seedline')
        const clipped = [...containers].filter(el=>el.clientWidth && el.scrollWidth>el.clientWidth+2)
          .map(el=>[el.id || el.className || el.tagName,el.scrollWidth,el.clientWidth])
        for (const el of document.querySelectorAll('button,.section-line label,#helpContent dd')) {
          const r = el.getBoundingClientRect()
          if (r.width && (r.left < -1 || r.right > innerWidth+1)) clipped.push(el.id || el.textContent)
        }
        return clipped
      })
      assert.deepEqual(overflow,[],label)
    }
    for (const [width,height] of engine === 'chromium' ? sizes : [[320,568],[375,812],[844,390],[1440,900]]) {
      await page.setViewportSize({width,height})
      await page.goto(url)
      await page.waitForFunction(()=>window.cm?.getValue().startsWith('// Semilla '))
      await page.evaluate(()=>document.fonts.ready)
      await page.evaluate(()=>setResolution(160,100))
      const compact = await page.evaluate(()=>matchMedia('(max-width:700px), (max-width:980px) and (max-height:560px)').matches)
      const original = await id('stage').boundingBox()
      if (compact) assert.ok(original.height>height*.48,'visual-first at '+width+'x'+height)
      const footer = await id('consoleDock').boundingBox()
      const top = await page.locator('.topbar').boundingBox()
      const wide = width>=1180 && height>=610
      assert.ok(await id('backToLayers').isVisible(),'Pila is available in every layout')
      if (wide) {
        const mix = await id('layerDesk').boundingBox(), code = await id('editorPage').boundingBox()
        assert.ok(mix && !code && mix.x+mix.width<=original.x,'start with the stack and a large monitor')
        assert.ok(await id('layerDesk').isVisible())
        await id('closeSectors').click()
        assert.equal(await id('backToLayers').getAttribute('aria-expanded'),'false')
        assert.equal(await id('layerDesk').isVisible(),false)
        assert.ok((await id('stage').boundingBox()).width>original.width)
        await id('backToLayers').click()
        assert.equal(await id('backToLayers').getAttribute('aria-expanded'),'true')
        assert.equal(await id('backToLayers').isVisible(),true)
        assert.deepEqual(await id('stage').boundingBox(),original)
      }
      const topControls = '#studioNav button:visible'
      for (const button of await page.locator(topControls).all()) {
        const rect=await button.boundingBox()
        assert.ok(rect && rect.y>=top.y && rect.y+rect.height<=top.y+top.height+1,'visible navigation at '+width)
      }
      assert.ok(Math.abs(original.y-top.y-top.height)<2,'preview starts directly below the toolbar')
      for (const control of ['automate','liveEdit']) {
        const rect=await id(control).boundingBox()
        assert.ok(rect && rect.y>=footer.y && rect.y+rect.height<=footer.y+footer.height+1,'session control '+control)
      }
      const loop = await id('loopButton').boundingBox(), recordBar = width>=1280 ? top : footer
      assert.ok(loop && loop.y>=recordBar.y && loop.y+loop.height<=recordBar.y+recordBar.height+1 && loop.width>=79,'visible loop action '+width)
      assert.equal(await id('applySectors').isVisible(),false,'live edition has no send button')
      if ([280,375,1440].includes(width)) {
        const source=await page.evaluate(()=>cm.getValue())
        await id('liveEdit').click()
        assert.equal(await id('applySectors').isVisible(),false,'there is nothing prepared yet')
        await page.evaluate(code=>cm.setValue(code+'\n// Cambios preparados'),source)
        await id('applySectors').waitFor()
        assert.equal(await id('applySectors').getAttribute('aria-label'),'Enviar a salida')
        await audit('manual edition '+width)
        await page.evaluate(code=>cm.setValue(code),source)
        assert.equal(await id('applySectors').isVisible(),false)
        await id('liveEdit').click()
      }
      await audit('home '+width)
      await id('chooseOutput').click()
      await audit('output options '+width)
      await page.locator('[data-output="0"]').click()
      const score = await page.evaluate(()=>cm.getValue())
      await id('focusPreview').click()
      const large = await id('stage').boundingBox()
      assert.ok(large.width>=width-2 && large.height>=height-52,'large preview '+width)
      assert.equal(await page.locator('.studio').isVisible(),false)
      assert.equal(await id('inspectorDesk').isVisible(),false)
      if (width === 1440) await page.keyboard.press('Escape')
      else await id('focusPreview').click()
      assert.equal(await page.evaluate(()=>cm.getValue()),score)
      if (compact) await openStudio(page,'sectors')
      if (width===1180) {
        await id('addSectorEffect').click()
        await id('sectorFx').getByRole('button',{name:'Caleidoscopio',exact:true}).click()
        await id('addSectorEffect').click()
        const label = id('sectorControls').getByText('Caleidoscopio',{exact:true})
        assert.equal(await label.evaluate(el=>{
          const text = document.createRange()
          text.selectNodeContents(el)
          return text.getClientRects().length
        }),1,'keep the effect label intact in the permanent mixer')
      }
      await page.locator('[data-help=efectos]').click()
      const dialog = await id('helpDialog').boundingBox(), close = await id('closeHelp').boundingBox()
      const fragments = await id('helpContent').getByText('Caleidoscopio',{exact:true}).evaluate(el => {
        const range = document.createRange()
        range.selectNodeContents(el)
        return range.getClientRects().length
      })
      assert.equal(fragments,1,'keep the effect name readable at '+width)
      assert.ok(dialog.x>=-1 && dialog.y>=-1 && dialog.x+dialog.width<=width+1 && dialog.y+dialog.height<=height+1,'help bounds '+width)
      assert.ok(close.y>=dialog.y && close.y+close.height<=dialog.y+dialog.height)
      for(let i=0;i<24 && await id('moreHelp').isVisible() && await id('moreHelp').isEnabled();i++) {
        await id('moreHelp').click()
      }
      const last = await page.locator('#helpContent dd').last().boundingBox()
      const inside = await id('helpContent').boundingBox()
      assert.ok(last.y>=inside.y-1 && last.y+last.height<=inside.y+inside.height+2,'last definition '+width)
      await audit('guide '+width)
      await id('closeHelp').click()
      await openStudio(page,'base')
      const editStage = await id('stage').boundingBox()
      if (compact && !(width>=551 && width>height)) {
        const editor = await id('editorPage').boundingBox()
        assert.ok(editor && editor.y+editor.height<=editStage.y,'portrait inspector stays above the monitor')
      }
      await id('adjustMode').click()
      await audit('operator parameters '+width)
      for (const name of ['library','signal','sectors']) {
        await openStudio(page,name)
        if (name==='library') await page.locator('[data-shelf=projects]').click()
        await audit(name+' '+width)
        if (wide && name!=='sectors') {
          const inspector = await id('inspectorDesk').boundingBox(), stage = await id('stage').boundingBox()
          assert.ok(inspector && inspector.x>=stage.x+stage.width-1)
          assert.deepEqual(stage,editStage,name+' preserves the visual')
          assert.ok(await id('layerDesk').isVisible() && !await id('editorPage').isVisible(),name+' keeps the mix visible')
        }
        if (compact) assert.deepEqual(await id('stage').boundingBox(),editStage,name+' preserves the compact monitor')
        if (name==='signal') {
          for (const tab of ['audio','out']) {
            if (tab==='out') await id('chooseOutput').click()
            await page.locator('[data-tab='+tab+']').click()
            await audit(tab+' '+width)
          }
        }
      }
      if (wide) {
        await id('signalOpen').click()
        assert.ok(await page.locator('[data-pane=audio]').isVisible())
        await openStudio(page,'base')
        assert.ok(await id('editorPage').isVisible() && !await id('panel').isVisible())
        assert.deepEqual(await id('stage').boundingBox(),editStage,'Code replaces Audio in the inspector')
      }
      const divider = id('splitter')
      const vertical = await divider.getAttribute('aria-orientation') === 'vertical'
      if (width === 1440 || width === 375) {
        const bar = await divider.boundingBox(), stage = await id('stage').boundingBox()
        const x = bar.x + bar.width/2, y = bar.y + bar.height/2
        await page.mouse.move(x,y)
        await page.mouse.down()
        await page.mouse.move(vertical ? x-64 : x,vertical ? y : y+64,{steps:6})
        await page.mouse.up()
        const resized = await id('stage').boundingBox()
        assert.ok((vertical ? stage.width-resized.width : stage.height-resized.height) > 40,'drag '+width)
      }
      await divider.focus()
      await divider.press(await divider.getAttribute('aria-orientation')==='vertical'?'ArrowLeft':'ArrowDown')
      await audit('resized '+width)
      if (width === 320 && height === 360) {
        await divider.press('Home')
        assert.ok((await id('stage').boundingBox()).height >= 60,'keep a usable preview on short screens')
      }
      console.log(width+'×'+height,compact?'compact':'desktop','OK')
    }
    if (engine === 'chromium') await touchAndZoom(browser)
  } finally { await browser.close() }
}
main().catch(e=>{console.error(e);process.exitCode=1})
