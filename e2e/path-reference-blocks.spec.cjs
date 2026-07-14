const { test, expect } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

test.describe('path reference blocks (browser E2E)', () => {
  test('renders file and folder blocks and removes one block at a time', async ({ page }, testInfo) => {
    let html = fs.readFileSync(path.join(root, 'static/panel.html'), 'utf8')
      .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
      .replace(/<script src="\{\{[^}]+\}\}"[^>]*><\/script>/g, '')
      .replaceAll('{{SERVER_URL}}', 'ws://127.0.0.1:48200')
      .replaceAll('{{PROJECT_PATH}}', '/workspace')

    await page.route('http://mcp-feedback.test/panel', (route) => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: html,
    }))
    await page.goto('http://mcp-feedback.test/panel')
    await page.evaluate(() => {
      window.__mcpVscode = { postMessage() {} }
      window.acquireVsCodeApi = () => window.__mcpVscode
    })

    for (const script of [
      'panelStateMarkdown.js',
      'panelStateUx.js',
      'panelStateSessionsView.js',
      'panelStateTransport.js',
      'panelAgentResumeWatch.js',
      'panelState.js',
      'erudaPanel.js',
      'themeContrast.js',
      'panelConnection.js',
      'panelPathReferences.js',
      'panelApp.js',
    ]) {
      await page.addScriptTag({ path: path.join(root, 'static', script) })
    }

    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'browse-paths-result',
          paths: ['src/createPublicBundleZip.test.mjs', 'src/components/'],
          references: [
            { path: 'src/createPublicBundleZip.test.mjs', kind: 'file' },
            { path: 'src/components/', kind: 'folder' },
          ],
        },
      }))
    })

    const blocks = page.locator('.path-reference')
    await expect(blocks).toHaveCount(2)
    await expect(blocks.nth(0)).toContainText('FILE')
    await expect(blocks.nth(1)).toContainText('DIR')
    await page.locator('#inputArea, .input-area').first().screenshot({
      path: testInfo.outputPath('path-reference-blocks.png'),
    })

    await blocks.nth(0).getByRole('button', { name: /Remove file reference/ }).click()
    await expect(blocks).toHaveCount(1)
    await expect(blocks.first()).toContainText('src/components/')

    await page.getByRole('button', { name: 'Queue' }).click()
    await expect(blocks).toHaveCount(0)
    await expect(page.locator('#pendingList')).toContainText('@src/components/')
  })
})
