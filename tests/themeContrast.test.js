import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  parseCssColor,
  relativeLuminance,
  detectThemeFromBackground,
} = require('../out/webview/themeContrast.js')

describe('themeContrast', () => {
  it('detects light theme from white background', () => {
    assert.equal(detectThemeFromBackground('#ffffff'), 'light')
    assert.equal(detectThemeFromBackground('rgb(255, 255, 255)'), 'light')
  })

  it('detects dark theme from dark background', () => {
    assert.equal(detectThemeFromBackground('#0d1117'), 'dark')
    assert.equal(detectThemeFromBackground('#161b22'), 'dark')
  })

  it('parseCssColor supports hex and rgb', () => {
    assert.deepEqual(parseCssColor('#abc'), { r: 170, g: 187, b: 204 })
    assert.deepEqual(parseCssColor('rgb(31, 35, 40)'), { r: 31, g: 35, b: 40 })
  })

  it('relativeLuminance ranks white above black', () => {
    assert.ok(relativeLuminance({ r: 255, g: 255, b: 255 }) > relativeLuminance({ r: 0, g: 0, b: 0 }))
  })
})
