import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { pickServerForProject } = require('../mcp-server/dist/serverDiscoveryCore.js')

describe('multi-workspace routing', () => {
  it('picks exact project match when two hubs are registered', () => {
    const candidates = [
      {
        hash: 'a',
        port: 48201,
        pid: 100,
        projectPath: '/Users/hunter/Workspace/project-a',
        version: '2.5.1-ji.65',
        started_at: 1,
      },
      {
        hash: 'b',
        port: 48202,
        pid: 200,
        projectPath: '/Users/hunter/Workspace/project-b',
        version: '2.5.1-ji.65',
        started_at: 2,
      },
    ]

    const pickA = pickServerForProject(candidates, '/Users/hunter/Workspace/project-a')
    const pickB = pickServerForProject(candidates, '/Users/hunter/Workspace/project-b')

    assert.equal(pickA?.port, 48201)
    assert.equal(pickB?.port, 48202)
    assert.notEqual(pickA?.port, pickB?.port)
  })
})
