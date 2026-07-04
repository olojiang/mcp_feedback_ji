import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeProjectPath,
  isProcessAlive,
  projectPathMatches,
  projectPathRelation,
  pickServerForProject,
  pickServerForImplicitProject,
  resolveImplicitProjectDirectory,
  isCurrentRegistryEntry,
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

  it('normalizeProjectPath preserves filesystem roots and trims both separator styles', () => {
    assert.equal(normalizeProjectPath('/'), '/')
    assert.equal(normalizeProjectPath('/foo/bar\\\\'), '/foo/bar')
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

  it('projectPathMatches accepts parent and child workspace paths', () => {
    assert.equal(projectPathRelation('/a/b', '/a/b/c'), 'ancestor')
    assert.equal(projectPathRelation('/a/b/c', '/a/b'), 'descendant')
    assert.equal(projectPathMatches('/Users/hunter/Workspace/llm-gateway', '/Users/hunter/Workspace/llm-gateway/provider_mock'), true)
  })

  it('projectPathMatches does not match sibling paths with a common prefix', () => {
    assert.equal(projectPathMatches('/repo/app', '/repo/app2'), false)
    assert.equal(projectPathMatches('/repo/app2', '/repo/app'), false)
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

  it('pickServerForProject rejects lone wrong-project hub when implicit workspace is set', () => {
    const picked = pickServerForProject(
      [
        { port: 48201, pid: 93985, projectPath: '/Users/hunter/Workspace/spatial-smart-apps', version: '1' },
      ],
      '/Users/hunter/Workspace/mcp_feedback_ji',
    )
    assert.equal(picked, null)
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

  it('pickServerForProject accepts multiple workspace entries for the same server when no project is provided', () => {
    const picked = pickServerForProject(
      [
        { port: 48201, pid: 1, projectPath: '/repo/a', version: '1', started_at: 100 },
        { port: 48201, pid: 1, projectPath: '/repo/b', version: '1', started_at: 200 },
      ]
    )
    assert.equal(picked.port, 48201)
    assert.equal(picked.pid, 1)
  })

  it('pickServerForProject stays conservative for multiple distinct servers when no project is provided', () => {
    const picked = pickServerForProject(
      [
        { port: 48201, pid: 1, projectPath: '/repo/a', version: '1' },
        { port: 48202, pid: 1, projectPath: '/repo/b', version: '1' },
      ]
    )
    assert.equal(picked, null)
  })

  it('pickServerForImplicitProject uses cwd when it is inside one registered workspace', () => {
    const picked = pickServerForImplicitProject(
      [
        { port: 48201, pid: 1, projectPath: '/Users/hunter/Workspace/mcp_feedback_ji', version: '1' },
        { port: 48202, pid: 2, projectPath: '/Users/hunter/Workspace/dual_finder', version: '1' },
      ],
      '/Users/hunter/Workspace/mcp_feedback_ji/mcp-server'
    )
    assert.equal(picked.port, 48201)
  })

  it('pickServerForImplicitProject does not pick from a common parent directory', () => {
    const picked = pickServerForImplicitProject(
      [
        { port: 48201, pid: 1, projectPath: '/Users/hunter/Workspace/mcp_feedback_ji', version: '1' },
        { port: 48202, pid: 2, projectPath: '/Users/hunter/Workspace/dual_finder', version: '1' },
      ],
      '/Users/hunter/Workspace'
    )
    assert.equal(picked, null)
  })

  it('resolveImplicitProjectDirectory prefers agent context over cwd', () => {
    const now = Date.now()
    const resolved = resolveImplicitProjectDirectory({
      cwd: '/Users/hunter/.cursor/extensions/mcp-feedback',
      agentContext: {
        traceId: 'trace-a',
        workspaceRoots: ['/Users/hunter/Workspace/llm-gateway'],
        updatedAt: now,
      },
      traceId: 'trace-a',
      now,
    })
    assert.equal(resolved, '/Users/hunter/Workspace/llm-gateway')
  })

  it('resolveImplicitProjectDirectory ignores stale agent context', () => {
    const resolved = resolveImplicitProjectDirectory({
      cwd: '/tmp',
      agentContext: {
        workspaceRoots: ['/Users/hunter/Workspace/llm-gateway'],
        updatedAt: Date.now() - 6 * 60 * 1000,
      },
      now: Date.now(),
    })
    assert.equal(resolved, '/tmp')
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

  it('pickServerForProject prefers exact match over parent workspace', () => {
    const picked = pickServerForProject(
      [
        { port: 48201, pid: 1, projectPath: '/Users/hunter/Workspace/llm-gateway', version: '1' },
        { port: 48203, pid: 2, projectPath: '/Users/hunter/Workspace/llm-gateway/provider_mock', version: '1' },
      ],
      '/Users/hunter/Workspace/llm-gateway/provider_mock'
    )
    assert.equal(picked.port, 48203)
  })

  it('pickServerForProject falls back to parent workspace for subfolder requests', () => {
    const picked = pickServerForProject(
      [
        { port: 48201, pid: 1, projectPath: '/Users/hunter/Workspace/llm-gateway', version: '1' },
      ],
      '/Users/hunter/Workspace/llm-gateway/provider_mock'
    )
    assert.equal(picked.port, 48201)
  })

  it('pickServerForProject chooses nearest ancestor when multiple parent workspaces match', () => {
    const picked = pickServerForProject(
      [
        { port: 48201, pid: 1, projectPath: '/Users/hunter/Workspace', version: '1' },
        { port: 48202, pid: 2, projectPath: '/Users/hunter/Workspace/llm-gateway', version: '1' },
      ],
      '/Users/hunter/Workspace/llm-gateway/provider_mock'
    )
    assert.equal(picked.port, 48202)
  })

  it('pickServerForProject routes subfolder requests to the matching workspace among multiple Cursor windows', () => {
    const picked = pickServerForProject(
      [
        { port: 48200, pid: 1, projectPath: '/Users/hunter/Workspace/mcp_feedback_ji', version: '1' },
        { port: 48201, pid: 2, projectPath: '/Users/hunter/Workspace/llm-gateway', version: '1' },
      ],
      '/Users/hunter/Workspace/llm-gateway/provider_mock'
    )
    assert.equal(picked.port, 48201)
  })

  it('isCurrentRegistryEntry rejects stale pid even when the port is healthy', () => {
    assert.equal(
      isCurrentRegistryEntry(
        { port: 48200, pid: 111, projectPath: '/repo', version: '1' },
        { ok: true, port: 48200, pid: 222, version: '1' }
      ),
      false
    )
  })
})
