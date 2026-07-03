const { test, expect } = require('@playwright/test')
const path = require('node:path')

test.describe('panel health render helpers', () => {
  test('buildHealthSignature enables skip when unchanged', async ({ page }) => {
    await page.goto(`file://${path.join(__dirname, 'fixtures/trace-session.html')}`)
    const same = await page.evaluate(() => {
      const PS = window.PanelStateModule.PanelState
      const h = { level: 'ok', label: 'Connected', detail: 'Agent: live', portPid: ' pid=1', issues: [] }
      const sig = PS.buildHealthSignature(h, {})
      return PS.shouldSkipHealthRender(sig, sig)
    })
    expect(same).toBe(true)
  })
})
