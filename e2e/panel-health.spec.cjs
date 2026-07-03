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

  test('autoGrowTextareaHeight increases element height', async ({ page }) => {
    await page.goto(`file://${path.join(__dirname, 'fixtures/trace-session.html')}`)
    const height = await page.evaluate(() => {
      const PS = window.PanelStateModule.PanelState
      const el = document.createElement('textarea')
      el.value = 'line1\nline2\nline3\nline4'
      document.body.appendChild(el)
      Object.defineProperty(el, 'scrollHeight', { value: 96, configurable: true })
      PS.autoGrowTextareaHeight(el, { minPx: 48, maxPx: 200 })
      return el.style.height
    })
    expect(height).toBe('96px')
  })
})
