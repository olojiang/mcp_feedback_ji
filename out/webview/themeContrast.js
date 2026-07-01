/**
 * Detect editor light/dark from VS Code background and set data-mcp-theme on <html>.
 * Used by panel.html for guaranteed markdown contrast (inline code, strong, pre, etc.).
 */
(function (root) {
  function parseCssColor(input) {
    var c = String(input || '').trim()
    if (!c) return null
    var m = c.match(/^#([0-9a-f]{3,8})$/i)
    if (m) {
      var h = m[1]
      if (h.length === 3) {
        return {
          r: parseInt(h[0] + h[0], 16),
          g: parseInt(h[1] + h[1], 16),
          b: parseInt(h[2] + h[2], 16),
        }
      }
      if (h.length === 6) {
        return {
          r: parseInt(h.slice(0, 2), 16),
          g: parseInt(h.slice(2, 4), 16),
          b: parseInt(h.slice(4, 6), 16),
        }
      }
    }
    m = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
    if (m) {
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
    }
    return null
  }

  function relativeLuminance(rgb) {
    var parts = [rgb.r, rgb.g, rgb.b].map(function (v) {
      var c = Math.max(0, Math.min(255, v)) / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]
  }

  function detectThemeFromBackground(bg) {
    var rgb = parseCssColor(bg)
    if (!rgb) return 'dark'
    return relativeLuminance(rgb) > 0.45 ? 'light' : 'dark'
  }

  function applyMcpTheme(doc) {
    var d = doc || (typeof document !== 'undefined' ? document : null)
    if (!d || !d.documentElement) return 'dark'
    var style = getComputedStyle(d.documentElement)
    var bg = style.getPropertyValue('--vscode-editor-background').trim()
      || style.getPropertyValue('--bg').trim()
      || '#0d1117'
    var theme = detectThemeFromBackground(bg)
    d.documentElement.setAttribute('data-mcp-theme', theme)
    return theme
  }

  var api = {
    parseCssColor: parseCssColor,
    relativeLuminance: relativeLuminance,
    detectThemeFromBackground: detectThemeFromBackground,
    applyMcpTheme: applyMcpTheme,
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
  root.McpThemeContrast = api
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {})
