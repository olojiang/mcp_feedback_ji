const { test, expect } = require('@playwright/test')
const path = require('node:path')

const fixture = path.join(__dirname, 'fixtures/panel-dbg-buttons.html')

test.describe('panel DBG buttons (fixture)', () => {
  test('Prune test hubs posts prune-test-registry', async ({ page }) => {
    await page.goto(`file://${fixture}`)
    await page.click('#debugPruneTestBtn')
    const messages = await page.evaluate(() => window.__getPostedMessages())
    expect(messages.some((m) => m.type === 'prune-test-registry')).toBe(true)
  })

  test('Export MD posts markdown copy-debug-json', async ({ page }) => {
    await page.goto(`file://${fixture}`)
    await page.click('#debugExportMdBtn')
    const messages = await page.evaluate(() => window.__getPostedMessages())
    const copy = messages.find((m) => m.type === 'copy-debug-json')
    expect(copy).toBeTruthy()
    expect(copy.json).toMatch(/# MCP Feedback Sessions/)
    expect(copy.json).toMatch(/DBG export test/)
  })
})
