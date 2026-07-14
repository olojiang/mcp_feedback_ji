import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const uxModule = require('../out/webview/panelStateUx.js')
const { PanelState } = require('../out/webview/panelState.js')

const helperNames = [
  'normalizeQuickReplies',
  'parseQuickRepliesConfig',
  'clampInputPaneHeight',
  'parseStoredInputPaneHeight',
  'shouldConfirmFinished',
  'shouldSubmitOnCtrlEnter',
  'resolveQuickReplyMode',
  'versionSkewBannerText',
  'deployReloadBannerText',
  'messagesScrolledUp',
]

describe('panelStateUx module boundary', () => {
  it('attaches the complete stateless UX helper surface', () => {
    class AttachedPanelState {}
    uxModule.attachPanelStateUx(AttachedPanelState)

    for (const helperName of helperNames) {
      assert.equal(typeof AttachedPanelState[helperName], 'function', helperName)
    }
  })

  it('keeps PanelState helpers sourced from panelStateUx', () => {
    for (const helperName of helperNames) {
      assert.equal(PanelState[helperName], uxModule[helperName], helperName)
    }
  })

  it('parses custom replies with pipes and Finished semantics', () => {
    class AttachedPanelState {}
    uxModule.attachPanelStateUx(AttachedPanelState)

    assert.deepEqual(AttachedPanelState.parseQuickRepliesConfig([
      'Explain|Use A | B',
      'Finished|done',
    ].join('\n')), [
      { id: 'custom-0', label: 'Explain', text: 'Use A | B', icon: '', finished: false },
      { id: 'custom-1', label: 'Finished', text: 'done', icon: '', finished: true },
    ])
  })
})
