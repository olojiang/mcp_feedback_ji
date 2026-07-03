const { test, expect } = require('@playwright/test')
const path = require('node:path')

test.describe('trace and multi-session panel (browser E2E)', () => {
  test('stores traceId on session_updated', async ({ page }) => {
    await page.goto(`file://${path.join(__dirname, 'fixtures/trace-session.html')}`)
    const result = await page.evaluate(() => window.__runTraceSession())
    expect(result.traceId).toBe('e2e-trace-99')
    expect(result.waiting).toBe(true)
    expect(result.sessionCount).toBe(1)
  })

  test('routing-mismatch for foreign project_directory', async ({ page }) => {
    await page.goto(`file://${path.join(__dirname, 'fixtures/trace-session.html')}`)
    const result = await page.evaluate(() => window.__runProjectIsolation())
    expect(result.foreignNotify).toBe(true)
    expect(result.localSession).toBe(true)
    expect(result.foreignSession).toBe(false)
  })
})
