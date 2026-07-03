import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  hubAcceptsProject,
  sessionBelongsToPanel,
  projectPathMatches,
} = require('../out/workspaceMatch.js')

describe('workspaceMatch', () => {
  it('hub rejects sibling workspace projects', () => {
    const hub = ['/Users/hunter/Workspace/spatial-smart-cc']
    assert.equal(hubAcceptsProject(hub, '/Users/hunter/Workspace/spatial-smart-cc'), true)
    assert.equal(hubAcceptsProject(hub, '/Users/hunter/Workspace/mcp_feedback_ji'), false)
  })

  it('panel filters session_updated for foreign project_directory', () => {
    assert.equal(
      sessionBelongsToPanel(
        '/Users/hunter/Workspace/spatial-smart-cc',
        '/Users/hunter/Workspace/mcp_feedback_ji',
      ),
      false,
    )
    assert.equal(
      sessionBelongsToPanel(
        '/Users/hunter/Workspace/spatial-smart-cc',
        '/Users/hunter/Workspace/spatial-smart-cc',
      ),
      true,
    )
  })

  it('allows child project paths under hub workspace', () => {
    assert.equal(
      projectPathMatches('/Users/hunter/Workspace/llm-gateway', '/Users/hunter/Workspace/llm-gateway/provider'),
      true,
    )
  })

  it('hubAcceptsProject allows missing project_directory', () => {
    assert.equal(hubAcceptsProject(['/ws'], undefined), true)
    assert.equal(hubAcceptsProject([], '/any'), true)
  })

  it('sessionBelongsToPanel allows missing project_directory for legacy messages', () => {
    assert.equal(sessionBelongsToPanel('/ws', undefined), true)
  })
})
