/**
 * PanelState markdown / clipboard static helpers.
 */
(function (exports) {
  'use strict'

  function attachPanelStateMarkdown(PanelState) {
    PanelState.md = function md(text) {
      if (!text) return ''
      var codeBlocks = []
      var escapeHtml = function (s) {
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
      }
      var inlineMd = function (s) {
        var t = escapeHtml(s)
        t = t.replace(/``\s*(`([^`]+)`)\s*``/g, '&#96;$2&#96;')
        t = t.replace(/`([^`]+)`/g, function (_m, inner) {
          var body = inner.trim()
          if (!body) return ''
          return '<code>' + body + '</code>'
        })
        t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        t = t.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
        return t
      }
      var src = String(text)
      src = src.replace(/```[^\n]*\n?([\s\S]*?)```/g, function (_m, code) {
        var trimmed = String(code).replace(/^\n+|\n+$/g, '')
        var idx = codeBlocks.length
        codeBlocks.push('<pre><code>' + escapeHtml(trimmed) + '</code></pre>')
        return '\x00CODE' + idx + '\x00'
      })
      var lines = src.split('\n')
      var out = []
      var listItems = []
      var paraLines = []
      var flushList = function () {
        if (!listItems.length) return
        out.push('<ul>' + listItems.map(function (li) {
          return '<li>' + inlineMd(li) + '</li>'
        }).join('') + '</ul>')
        listItems = []
      }
      var flushPara = function () {
        if (!paraLines.length) return
        out.push('<p>' + inlineMd(paraLines.join(' ')) + '</p>')
        paraLines = []
      }
      var flushBlocks = function () {
        flushPara()
        flushList()
      }
      for (var i = 0; i < lines.length; i++) {
        var rawLine = lines[i]
        var line = rawLine.trim()
        var codeMatch = line.match(/^\x00CODE(\d+)\x00$/)
        if (codeMatch) {
          flushBlocks()
          out.push(codeBlocks[Number(codeMatch[1])])
          continue
        }
        if (line.indexOf('\x00CODE') >= 0) {
          flushBlocks()
          out.push(inlineMd(rawLine))
          continue
        }
        if (!line) {
          flushBlocks()
          continue
        }
        if (/^- (.+)$/.test(line)) {
          flushPara()
          listItems.push(line.replace(/^- /, ''))
          continue
        }
        flushList()
        if (/^### (.+)$/.test(line)) {
          flushPara()
          out.push('<h4>' + escapeHtml(line.slice(4)) + '</h4>')
          continue
        }
        if (/^## (.+)$/.test(line)) {
          flushPara()
          out.push('<h3>' + escapeHtml(line.slice(3)) + '</h3>')
          continue
        }
        if (/^# (.+)$/.test(line)) {
          flushPara()
          out.push('<h2>' + escapeHtml(line.slice(2)) + '</h2>')
          continue
        }
        paraLines.push(line)
      }
      flushBlocks()
      return out.join('')
    }

    PanelState.htmlToPlainText = function (html) {
      if (!html) return ''
      return String(html)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li>/gi, '- ')
        .replace(/<\/ul>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/pre>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    }

    PanelState.plainCopyText = function (markdownSource, renderedHtml) {
      if (markdownSource) return markdownSource
      return PanelState.htmlToPlainText(renderedHtml)
    }

    PanelState.selectionCopyText = function (selected, raw, fullTextLen) {
      if (!selected) return raw || ''
      if (raw && fullTextLen > 0 && selected.length >= fullTextLen * 0.8) return raw
      return selected
    }

    PanelState.extractClipboardImages = function (clipboardData) {
      var images = []
      if (!clipboardData) return images
      if (clipboardData.items) {
        for (var i = 0; i < clipboardData.items.length; i++) {
          var item = clipboardData.items[i]
          if (item.type && item.type.indexOf('image/') === 0) {
            var file = item.getAsFile && item.getAsFile()
            if (file) images.push(file)
          }
        }
      }
      if (images.length) return images
      if (clipboardData.files) {
        for (var j = 0; j < clipboardData.files.length; j++) {
          var f = clipboardData.files[j]
          if (f && f.type && f.type.indexOf('image/') === 0) images.push(f)
        }
      }
      return images
    }

    PanelState.shouldBlockDuplicatePaste = function (pending, pasteAt, now) {
      if (pending) return true
      if (pasteAt && now - pasteAt < 800) return true
      return false
    }
  }

  exports.attachPanelStateMarkdown = attachPanelStateMarkdown
})(typeof window !== 'undefined'
  ? (window.PanelStateMarkdownModule = {})
  : (typeof module !== 'undefined' ? module.exports : {}))
