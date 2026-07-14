import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pathReferences = require('../out/webview/panelPathReferences.js')

describe('panelPathReferences controller', () => {
  it('normalizes and deduplicates modern browse results', () => {
    assert.deepEqual(pathReferences.normalizeBrowseReferences({
      references: [
        { path: 'src/a.ts', kind: 'file' },
        { path: 'src/lib/', kind: 'folder' },
        { path: 'src/a.ts', kind: 'folder' },
      ],
    }), [
      { path: 'src/a.ts', kind: 'file' },
      { path: 'src/lib/', kind: 'folder' },
    ])
  })

  it('normalizes legacy browse paths and infers folder kinds', () => {
    assert.deepEqual(pathReferences.normalizeBrowseReferences({
      paths: ['README.md', 'src/', 'README.md'],
    }), [
      { path: 'README.md', kind: 'file' },
      { path: 'src/', kind: 'folder' },
    ])
  })

  it('moves a selected path out of the input into a structured reference', () => {
    assert.deepEqual(pathReferences.applyAtSelection({
      value: 'Review @src later',
      cursor: 11,
      query: { start: 7, end: 11 },
      item: { kind: 'folder', insertText: 'src/' },
    }), {
      value: 'Review  later',
      cursor: 7,
      reference: { path: 'src/', kind: 'folder' },
      lruPath: 'src/',
    })
  })

  it('keeps a selected symbol inline and does not create a path reference', () => {
    assert.deepEqual(pathReferences.applyAtSelection({
      value: 'See @Wid now',
      cursor: 8,
      query: { start: 4, end: 8 },
      item: { kind: 'symbol', insertText: 'Widget (src/a.ts:4)' },
    }), {
      value: 'See @Widget (src/a.ts:4)  now',
      cursor: 25,
      reference: null,
      lruPath: '',
    })
  })

  it('debounces input into exactly one at-search request', () => {
    const scheduled = []
    const posted = []
    const input = { value: 'Open @pane', selectionStart: 10 }
    const controller = pathReferences.createPathReferenceController({
      input,
      getAtQuery: () => ({ query: 'pane', start: 5, end: 10 }),
      postMessage: (message) => posted.push(message),
      schedule: (callback) => { scheduled.push(callback); return scheduled.length },
      cancelSchedule: () => {},
      hideDropdown: () => {},
    })

    controller.handleInput()
    controller.handleInput()
    assert.equal(scheduled.length, 2)
    scheduled.at(-1)()
    assert.deepEqual(posted, [{ type: 'at-search', query: 'pane' }])
  })

  it('adds normalized browse results to LRU and session state once', () => {
    const lru = []
    const added = []
    let focused = 0
    const controller = pathReferences.createPathReferenceController({
      addPathsToLru: (paths) => lru.push(paths),
      addPathReferences: (references) => added.push(references),
      focusInput: () => { focused++ },
    })

    controller.handleBrowseResult({ paths: ['src/', 'src/a.ts', 'src/'] })
    assert.deepEqual(lru, [['src/', 'src/a.ts']])
    assert.deepEqual(added, [[
      { path: 'src/', kind: 'folder' },
      { path: 'src/a.ts', kind: 'file' },
    ]])
    assert.equal(focused, 1)
  })
})
