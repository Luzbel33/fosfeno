async function openStudio(page, view) {
  if (view === 'sectors' && await page.locator('#layerDesk').isVisible()) return
  await page.locator('#studioNav button[data-view="'+view+'"]').click()
}

module.exports = { openStudio }
