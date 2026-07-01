/**
 * Eruda panel height helpers — pure, testable, no DOM side effects.
 */
(function (exports) {
  'use strict'

  var STORAGE_KEY = 'mcp-feedback-eruda-height'
  var MIN_VIEWPORT_RATIO = 0.25
  var MAX_VIEWPORT_RATIO = 0.5
  var DEFAULT_VIEWPORT_RATIO = 0.33
  var ABS_MIN_PX = 120

  function bounds(viewportHeight) {
    var vh = viewportHeight > 0 ? viewportHeight : 600
    return {
      min: Math.max(ABS_MIN_PX, Math.round(vh * MIN_VIEWPORT_RATIO)),
      max: Math.round(vh * MAX_VIEWPORT_RATIO),
      defaultHeight: Math.round(vh * DEFAULT_VIEWPORT_RATIO),
    }
  }

  function clampHeight(height, viewportHeight) {
    var b = bounds(viewportHeight)
    var h = Math.round(Number(height))
    if (!isFinite(h) || h <= 0) return b.defaultHeight
    return Math.max(b.min, Math.min(b.max, h))
  }

  function defaultHeight(viewportHeight) {
    return clampHeight(bounds(viewportHeight).defaultHeight, viewportHeight)
  }

  function loadHeight(storage, viewportHeight) {
    if (!storage || typeof storage.getItem !== 'function') {
      return defaultHeight(viewportHeight)
    }
    try {
      var raw = storage.getItem(STORAGE_KEY)
      if (raw == null || raw === '') return defaultHeight(viewportHeight)
      return clampHeight(parseInt(raw, 10), viewportHeight)
    } catch (_e) {
      return defaultHeight(viewportHeight)
    }
  }

  function saveHeight(storage, height, viewportHeight) {
    if (!storage || typeof storage.setItem !== 'function') return
    try {
      storage.setItem(STORAGE_KEY, String(clampHeight(height, viewportHeight)))
    } catch (_e) { /* quota / private mode */ }
  }

  function applyContainerHeight(container, heightPx) {
    if (!container || !container.style) return
    container.style.height = String(heightPx) + 'px'
  }

  exports.STORAGE_KEY = STORAGE_KEY
  exports.bounds = bounds
  exports.clampHeight = clampHeight
  exports.defaultHeight = defaultHeight
  exports.loadHeight = loadHeight
  exports.saveHeight = saveHeight
  exports.applyContainerHeight = applyContainerHeight
})(typeof window !== 'undefined'
  ? (window.ErudaPanelModule = {})
  : (typeof module !== 'undefined' ? module.exports : {}))
