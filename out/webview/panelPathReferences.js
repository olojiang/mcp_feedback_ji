/**
 * Composer path references, path LRU, and @ autocomplete controller.
 */
(function (exports) {
  'use strict'

  function normalizeBrowseReferences(message) {
    var source = message && Array.isArray(message.references)
      ? message.references
      : (message && Array.isArray(message.paths) ? message.paths : [])
    var seen = {}
    var result = []
    for (var i = 0; i < source.length; i++) {
      var item = source[i]
      var rawPath = typeof item === 'string' ? item : (item && item.path)
      var referencePath = String(rawPath || '').trim()
      if (!referencePath || seen[referencePath]) continue
      seen[referencePath] = true
      var requestedKind = item && typeof item === 'object' ? item.kind : ''
      result.push({
        path: referencePath,
        kind: requestedKind === 'folder' || /\/$/.test(referencePath) ? 'folder' : 'file',
      })
    }
    return result
  }

  function applyAtSelection(options) {
    var value = String(options.value || '')
    var cursor = Number(options.cursor) || 0
    var query = options.query
    var item = options.item
    if (!query || !item) return null
    var before = value.substring(0, query.start)
    var after = value.substring(cursor)
    var isPath = item.kind === 'file' || item.kind === 'folder'
    var insert = isPath ? '' : ('@' + item.insertText + ' ')
    return {
      value: before + insert + after,
      cursor: before.length + insert.length,
      reference: isPath ? { path: item.insertText, kind: item.kind } : null,
      lruPath: isPath ? item.insertText : '',
    }
  }

  function createPathReferenceController(ctx) {
    ctx = ctx || {}
    var input = ctx.input
    var atDropdown = ctx.atDropdown
    var atItems = []
    var atActiveIndex = -1
    var atVisible = false
    var searchTimer = null
    var searchGeneration = 0
    var schedule = ctx.schedule || function (callback) { return setTimeout(callback, 150) }
    var cancelSchedule = ctx.cancelSchedule || function (timer) { clearTimeout(timer) }

    function debug(message) {
      if (ctx.debugLog) ctx.debugLog(message)
    }

    function getAtQuery() {
      if (ctx.getAtQuery) return ctx.getAtQuery()
      if (!ctx.PanelState || !input) return null
      return ctx.PanelState.getAtQuery(input.value, input.selectionStart)
    }

    function postMessage(message) {
      if (ctx.postMessage) ctx.postMessage(message)
    }

    function pathLruKey() {
      return String(ctx.storageKey || '') + '-path-lru'
    }

    function loadPathLru() {
      try {
        var raw = ctx.storage && ctx.storage.getItem(pathLruKey())
        var parsed = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed) ? parsed : []
      } catch (error) {
        debug('loadPathLru error: ' + (error && error.message ? error.message : String(error)))
        return []
      }
    }

    function savePathLru(list) {
      try {
        if (ctx.storage) ctx.storage.setItem(pathLruKey(), JSON.stringify(list))
        debug('savePathLru key=' + pathLruKey() + ' n=' + list.length)
      } catch (error) {
        debug('savePathLru error: ' + (error && error.message ? error.message : String(error)))
      }
    }

    function removePathFromLru(referencePath) {
      if (!ctx.PanelState) return
      savePathLru(ctx.PanelState.removeFromPathLru(loadPathLru(), referencePath))
      renderLruInline()
    }

    function addPathsToLru(paths) {
      if (ctx.addPathsToLru) {
        ctx.addPathsToLru(paths)
        return
      }
      if (!ctx.PanelState || !paths || !paths.length) return
      try {
        var before = loadPathLru()
        var list = ctx.PanelState.addPathsToLru(before, paths, ctx.pathLruMax || 20)
        savePathLru(list)
        renderLruInline()
        debug('addPathsToLru in=' + JSON.stringify(paths)
          + ' before_n=' + before.length + ' after_n=' + list.length)
      } catch (error) {
        debug('addPathsToLru error: ' + (error && error.message ? error.message : String(error)))
      }
    }

    function addPathReferences(references) {
      if (ctx.addPathReferences) {
        ctx.addPathReferences(references)
      } else if (ctx.state && ctx.exec) {
        ctx.exec(ctx.state.addPathReferences(references))
      }
    }

    function renderLruInline() {
      var container = ctx.lruPaths
      var doc = ctx.document
      if (!container || !doc) return
      var list = loadPathLru()
      container.innerHTML = ''
      list.forEach(function (referencePath) {
        var chip = doc.createElement('span')
        chip.className = 'lru-chip'
        chip.title = referencePath
        var icon = doc.createElement('span')
        icon.className = 'lru-chip-icon'
        icon.textContent = /\/$/.test(referencePath) ? '\uD83D\uDCC1' : '\uD83D\uDCC4'
        var pathElement = doc.createElement('span')
        pathElement.className = 'lru-chip-path'
        pathElement.textContent = referencePath
        var remove = doc.createElement('span')
        remove.className = 'lru-chip-del'
        remove.textContent = '\u00D7'
        remove.title = 'Remove'
        remove.addEventListener('click', function (event) {
          event.stopPropagation()
          removePathFromLru(referencePath)
        })
        chip.addEventListener('click', function () {
          addPathReferences([{
            path: referencePath,
            kind: /\/$/.test(referencePath) ? 'folder' : 'file',
          }])
          if (input && input.focus) input.focus()
        })
        chip.appendChild(icon)
        chip.appendChild(pathElement)
        chip.appendChild(remove)
        container.appendChild(chip)
      })
    }

    function renderPathReferences() {
      var container = ctx.pathReferences
      var doc = ctx.document
      if (!container || !doc || !ctx.state) return
      var references = ctx.state.getPathReferences()
      container.innerHTML = ''
      for (var i = 0; i < references.length; i++) {
        (function (reference) {
          var block = doc.createElement('div')
          block.className = 'path-reference'
          block.setAttribute('role', 'listitem')
          block.title = reference.path
          var kind = doc.createElement('span')
          kind.className = 'path-reference-kind'
          kind.textContent = reference.kind === 'folder' ? 'DIR' : 'FILE'
          kind.setAttribute('aria-hidden', 'true')
          var label = doc.createElement('span')
          label.className = 'path-reference-path'
          label.textContent = reference.path
          var remove = doc.createElement('button')
          remove.type = 'button'
          remove.className = 'path-reference-remove'
          remove.textContent = '\u00D7'
          remove.title = 'Remove reference'
          remove.setAttribute('aria-label', 'Remove ' + reference.kind + ' reference ' + reference.path)
          remove.addEventListener('click', function () {
            if (ctx.exec) ctx.exec(ctx.state.removePathReference(reference.path))
            if (input && input.focus) input.focus()
          })
          block.appendChild(kind)
          block.appendChild(label)
          block.appendChild(remove)
          container.appendChild(block)
        })(references[i])
      }
    }

    function hideDropdown() {
      if (ctx.hideDropdown) ctx.hideDropdown()
      if (atDropdown && atDropdown.classList) atDropdown.classList.remove('visible')
      atVisible = false
      atItems = []
      atActiveIndex = -1
    }

    function setAtActive(index) {
      if (!atDropdown || !atDropdown.querySelectorAll) return
      var elements = atDropdown.querySelectorAll('.at-dropdown-item')
      elements.forEach(function (element) { element.classList.remove('active') })
      if (index >= 0 && index < elements.length) {
        atActiveIndex = index
        elements[index].classList.add('active')
        elements[index].scrollIntoView({ block: 'nearest' })
      }
    }

    function selectAtItem(index) {
      var item = atItems[index]
      var query = getAtQuery()
      if (!item || !query || !input) {
        hideDropdown()
        return false
      }
      var selection = applyAtSelection({
        value: input.value,
        cursor: input.selectionStart,
        query: query,
        item: item,
      })
      input.value = selection.value
      input.selectionStart = input.selectionEnd = selection.cursor
      if (input.focus) input.focus()
      hideDropdown()
      if (selection.reference) {
        addPathsToLru([selection.lruPath])
        addPathReferences([selection.reference])
      }
      if (ctx.dispatchInput) ctx.dispatchInput()
      if (ctx.onSelectionSaved) ctx.onSelectionSaved()
      return true
    }

    function showDropdown(items) {
      atItems = Array.isArray(items) ? items : []
      atActiveIndex = -1
      if (!atItems.length || !atDropdown || !ctx.document) {
        hideDropdown()
        return
      }
      atDropdown.innerHTML = ''
      atItems.forEach(function (item, index) {
        var row = ctx.document.createElement('div')
        row.className = 'at-dropdown-item'
        row.dataset.index = index
        var icon = ctx.document.createElement('span')
        icon.className = 'kind-icon'
        icon.textContent = item.kind === 'file' ? '\uD83D\uDCC4'
          : (item.kind === 'folder' ? '\uD83D\uDCC1' : '\uD83D\uDD23')
        var label = ctx.document.createElement('span')
        label.className = 'at-label'
        label.textContent = item.label
        var detail = ctx.document.createElement('span')
        detail.className = 'at-detail'
        detail.textContent = item.detail
        row.appendChild(icon)
        row.appendChild(label)
        row.appendChild(detail)
        row.addEventListener('click', function () { selectAtItem(index) })
        atDropdown.appendChild(row)
      })
      atDropdown.classList.add('visible')
      atVisible = true
    }

    function triggerAtSearch(expectedGeneration) {
      if (expectedGeneration !== undefined && expectedGeneration !== searchGeneration) return
      var query = getAtQuery()
      if (!query || !query.query) {
        hideDropdown()
        return
      }
      postMessage({ type: 'at-search', query: query.query })
    }

    function handleInput() {
      cancelSchedule(searchTimer)
      searchGeneration++
      var generation = searchGeneration
      var query = getAtQuery()
      if (!query || !query.query) {
        hideDropdown()
        return
      }
      searchTimer = schedule(function () { triggerAtSearch(generation) }, 150)
    }

    function handleKeydown(event) {
      if (!atVisible) return false
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setAtActive(atActiveIndex < atItems.length - 1 ? atActiveIndex + 1 : 0)
        return true
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setAtActive(atActiveIndex > 0 ? atActiveIndex - 1 : atItems.length - 1)
        return true
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && atActiveIndex >= 0) {
        event.preventDefault()
        selectAtItem(atActiveIndex)
        return true
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        hideDropdown()
        return true
      }
      return false
    }

    function handleBrowseResult(message) {
      var references = normalizeBrowseReferences(message)
      if (!references.length) return
      addPathsToLru(references.map(function (reference) { return reference.path }))
      addPathReferences(references)
      if (ctx.focusInput) ctx.focusInput()
      else if (input && input.focus) input.focus()
      debug('browse-paths-result paths=' + JSON.stringify(
        references.map(function (reference) { return reference.path }),
      ))
    }

    return {
      addPathsToLru: addPathsToLru,
      handleBrowseResult: handleBrowseResult,
      handleInput: handleInput,
      handleKeydown: handleKeydown,
      hideDropdown: hideDropdown,
      loadPathLru: loadPathLru,
      renderLruInline: renderLruInline,
      renderPathReferences: renderPathReferences,
      selectAtItem: selectAtItem,
      showDropdown: showDropdown,
      triggerAtSearch: triggerAtSearch,
    }
  }

  exports.normalizeBrowseReferences = normalizeBrowseReferences
  exports.applyAtSelection = applyAtSelection
  exports.createPathReferenceController = createPathReferenceController
})(typeof window !== 'undefined'
  ? (window.PanelPathReferencesModule = {})
  : (typeof module !== 'undefined' ? module.exports : {}))
