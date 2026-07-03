const { test, expect } = require('@playwright/test')
const path = require('node:path')

test.describe('panel reconnect timing (browser E2E)', () => {
  test('debounces rapid forceReconnect to a single hub-connect', async ({ page }) => {
    await page.goto(`file://${path.join(__dirname, 'fixtures/panel-reconnect.html')}`)
    await page.click('#trigger-double-reconnect')
    const count = await page.evaluate(() => window.__hubConnectCount)
    expect(count).toBe(1)
  })

  test('BridgeSessionGate allows only one register on duplicate connect', async ({ page }) => {
    await page.goto(`file://${path.join(__dirname, 'fixtures/panel-reconnect.html')}`)
    const result = await page.evaluate(() => {
      const gate = new window.PanelStateModule.BridgeSessionGate()
      const first = gate.onBridgeConnected()
      const second = gate.onBridgeConnected()
      return { first, second }
    })
    expect(result.first.register).toBe(true)
    expect(result.second.register).toBe(false)
    expect(result.second.stateSync).toBe(false)
  })
})
