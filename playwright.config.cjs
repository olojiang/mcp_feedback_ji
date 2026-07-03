const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.cjs',
  timeout: 30_000,
  retries: 0,
  use: { headless: true },
})
