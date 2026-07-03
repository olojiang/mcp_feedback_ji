const { test, expect } = require('@playwright/test')
const path = require('node:path')

test.describe('panel quick UX (browser E2E)', () => {
  test('DEFAULT_QUICK_REPLIES includes Looks Good and Test Verify', async ({ page }) => {
    await page.goto(`file://${path.join(__dirname, 'fixtures/trace-session.html')}`)
    const labels = await page.evaluate(() => {
      return window.PanelStateModule.PanelState.DEFAULT_QUICK_REPLIES.map((q) => q.label)
    })
    expect(labels).toContain('Looks Good')
    expect(labels).toContain('Test Verify')
    expect(labels).not.toContain('LGTM')
  })
})
