import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeProjectPath,
  isProcessAlive,
  projectPathMatches,
  pickServerForProject,
  resolveWsUrl,
} from '../mcp-server/dist/serverDiscoveryCore.js'

describe('resolveWsUrl', () => {
  it('keeps url when port unchanged', () => {
    const url = 'ws://127.0.0.1:48201'
    assert.equal(resolveWsUrl(url, 48201), url)
  })

  it('updates port when extension restarted', () => {
    assert.equal(
      resolveWsUrl('ws://127.0.0.1:48203', 48201),
      'ws://127.0.0.1:48201'
    )
  })
})

describe('serverDiscoveryCore', () => {
  it('normalizeProjectPath strips trailing slashes', () => {
    assert.equal(normalizeProjectPath('/foo/bar/'), '/foo/bar')
    assert.equal(normalizeProjectPath('/foo/bar'), '/foo/bar')
  })

  it('isProcessAlive returns true for current process', () => {
    assert.equal(isProcessAlive(process.pid), true)
  })

  it('isProcessAlive returns false for invalid pid', () => {
    assert.equal(isProcessAlive(0), false)
    assert.equal(isProcessAlive(999999999), false)
  })

  it('projectPathMatches compares normalized paths', () => {
    assert.equal(projectPathMatches('/a/b/', '/a/b'), true)
    assert.equal(projectPathMatches('/a/b', '/x/y'), false)
  })

  it('pickServerForProject prefers exact project match', () => {
    const picked = pickServerForProject(
      [
        { port: 48201, pid: 1, projectPath: '/matrix', version: '1' },
        { port: 48203, pid: 2, projectPath: '/other', version: '1' },
      ],
      '/matrix'
    )
    assert.equal(picked.port, 48201)
  })

  it('pickServerForProject returns null when multiple servers and no project', () => {
    const picked = pickServerForProject(
      [
        { port: 48201, pid: 1, projectPath: '/a', version: '1' },
        { port: 48203, pid: 2, projectPath: '/b', version: '1' },
      ]
    )
    assert.equal(picked, null)
  })

  it('pickServerForProject picks newest started_at on duplicate project', () => {
    const picked = pickServerForProject(
      [
        { port: 48201, pid: 1, projectPath: '/matrix', version: '1', started_at: 100 },
        { port: 48202, pid: 2, projectPath: '/matrix', version: '1', started_at: 200 },
      ],
      '/matrix'
    )
    assert.equal(picked.port, 48202)
  })
})

