import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { AtSearchService } = require('../out/atSearchService.js')

const resource = (path) => ({ path })

function dependencies(overrides = {}) {
  return {
    findFiles: async () => [],
    findSymbols: async () => [],
    ...overrides,
  }
}

describe('AtSearchService', () => {
  it('does not post results from a stale asynchronous query', async () => {
    let releaseOld
    const oldFiles = new Promise((resolve) => { releaseOld = resolve })
    const posted = []
    const service = new AtSearchService(dependencies({
      findFiles: async (pattern) => pattern.includes('old') ? oldFiles : [resource('new.ts')],
    }))

    const oldSearch = service.search('old', (items) => posted.push(['old', items]))
    await service.search('new', (items) => posted.push(['new', items]))
    releaseOld([resource('old.ts')])
    await oldSearch

    assert.deepEqual(posted.map(([query]) => query), ['new'])
    assert.equal(posted[0][1][0].insertText, 'new.ts')
  })

  it('sorts folders first, deduplicates files and symbols, and applies result limits', async () => {
    const files = [
      resource('zeta-match/file.ts'),
      resource('alpha-match/file.ts'),
      resource('alpha-match/file.ts'),
      ...Array.from({ length: 6 }, (_, index) => resource(`pkg/file-${String(index).padStart(2, '0')}-match.ts`)),
    ]
    const symbols = [
      { name: 'zSymbol', resource: resource('z.ts'), line: 4 },
      { name: 'aSymbol', resource: resource('a.ts'), line: 1 },
      { name: 'aSymbol', resource: resource('a.ts'), line: 1 },
      { name: 'bSymbol', resource: resource('b.ts'), line: 2 },
      { name: 'cSymbol', resource: resource('c.ts'), line: 3 },
      { name: 'dSymbol', resource: resource('d.ts'), line: 4 },
    ]
    let posted
    const service = new AtSearchService(dependencies({
      findFiles: async (pattern) => pattern.endsWith('/*')
        ? Array.from({ length: 12 }, (_, index) => resource(`folder-match-${index}/child.ts`))
        : files,
      findSymbols: async () => symbols,
    }))

    await service.search('match', (items) => { posted = items })

    assert.equal(posted.length, 20)
    assert.equal(posted.filter((item) => item.kind === 'folder').length, 8)
    assert.ok(posted.slice(0, 8).every((item) => item.kind === 'folder'))
    assert.equal(new Set(posted.map((item) => item.insertText)).size, posted.length)
    assert.equal(posted.filter((item) => item.insertText === 'aSymbol (a.ts:2)').length, 1)
    assert.ok(posted.some((item) => item.kind === 'symbol'))
    assert.deepEqual(posted.filter((item) => item.kind === 'file').map((item) => item.label), [
      'file-00-match.ts', 'file-01-match.ts', 'file-02-match.ts', 'file-03-match.ts',
      'file-04-match.ts', 'file-05-match.ts', 'file.ts', 'file.ts',
    ])
    assert.deepEqual(posted.filter((item) => item.kind === 'symbol').map((item) => item.label), [
      'aSymbol', 'bSymbol', 'cSymbol', 'dSymbol',
    ])
    assert.deepEqual(
      posted.slice(0, 2).map((item) => item.insertText),
      ['alpha-match/', 'folder-match-0/'],
    )
  })

  it('normalizes Windows and dot-relative paths before displaying or inserting them', async () => {
    let posted
    const service = new AtSearchService(dependencies({
      findFiles: async (pattern) => pattern.endsWith('/*') ? [] : [resource('.\\src\\match.ts')],
      findSymbols: async () => [{ name: 'matchFn', resource: resource('.\\src\\match.ts'), line: 6 }],
    }))

    await service.search('match', (items) => { posted = items })

    assert.deepEqual(posted.map((item) => item.insertText), [
      'src/match.ts',
      'matchFn (src/match.ts:7)',
    ])
    assert.equal(posted[0].label, 'match.ts')
  })

  it('returns symbols when file search fails', async () => {
    let posted
    const service = new AtSearchService(dependencies({
      findFiles: async () => { throw new Error('files unavailable') },
      findSymbols: async () => [{ name: 'onlySymbol', resource: resource('symbol.ts'), line: 0 }],
    }))

    await service.search('only', (items) => { posted = items })

    assert.deepEqual(posted.map((item) => item.kind), ['symbol'])
  })

  it('returns files when the symbol provider fails', async () => {
    let posted
    const service = new AtSearchService(dependencies({
      findFiles: async (pattern) => pattern.endsWith('/*') ? [] : [resource('only-file.ts')],
      findSymbols: async () => { throw new Error('symbols unavailable') },
    }))

    await service.search('only', (items) => { posted = items })

    assert.deepEqual(posted.map((item) => item.kind), ['file'])
  })
})
