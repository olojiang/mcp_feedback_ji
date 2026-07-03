const { test, expect } = require('@playwright/test')
const path = require('node:path')

test.describe('panel UX features (browser E2E)', () => {
  test('scroll-bottom visibility follows messagesScrolledUp', async ({ page }) => {
    await page.goto(`file://${path.join(__dirname, 'fixtures/trace-session.html')}`)
    const result = await page.evaluate(() => {
      const PS = window.PanelStateModule.PanelState
      const el = { scrollTop: 0, scrollHeight: 500, clientHeight: 100 }
      return {
        up: PS.messagesScrolledUp(el, 40),
        down: PS.messagesScrolledUp({ scrollTop: 360, scrollHeight: 500, clientHeight: 100 }, 40),
      }
    })
    expect(result.up).toBe(true)
    expect(result.down).toBe(false)
  })

  test('version skew banner text is non-empty when warnings exist', async ({ page }) => {
    await page.goto(`file://${path.join(__dirname, 'fixtures/trace-session.html')}`)
    const text = await page.evaluate(() => {
      return window.PanelStateModule.PanelState.versionSkewBannerText([
        'Other window pid=200 on ji.40',
      ])
    })
    expect(text).toMatch(/ji\.40/)
  })
})
