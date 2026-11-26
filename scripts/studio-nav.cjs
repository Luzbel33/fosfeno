async function openStudio(page, view) {
  if (view==='base') {
    await openStudio(page,'code')
    if (await page.locator('#contextCodeBox').isVisible()) {
      await page.locator('#codeDestination').click()
      await page.locator('#codeDestinationList').getByRole('button',{name:/^Fondo · /}).click()
    }
    return
  }
  if (view === 'sectors' && await page.locator('#layerDesk').isVisible()) return
  await page.locator('#studioNav button[data-view="'+view+'"]').click()
}

module.exports = { openStudio }
