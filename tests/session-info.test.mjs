import assert from 'node:assert/strict'
import test from 'node:test'
import { currentWorkspaceId } from '../src/client/session-info.ts'

const workspaces = [
  { workspaceId: 'workspace-a', sessionIds: ['session-a'] },
  { workspaceId: 'workspace-b', sessionIds: ['session-b', 'session-c'] },
]

function sessions(mainViewId) {
  return {
    byId: Object.fromEntries(['session-a', 'session-b', 'session-c'].map(id => [id, {
      id,
      retainedBy: id === mainViewId ? { mainView: 1 } : {},
    }])),
  }
}

test('resolves the workspace containing the selected session', () => {
  assert.equal(currentWorkspaceId(sessions('session-b'), workspaces), 'workspace-b')
  assert.equal(currentWorkspaceId(sessions('session-a'), workspaces), 'workspace-a')
})

test('follows selection changes between sessions and workspaces', () => {
  assert.equal(currentWorkspaceId(sessions('session-b'), workspaces), 'workspace-b')
  assert.equal(currentWorkspaceId(sessions('session-c'), workspaces), 'workspace-b')
  assert.equal(currentWorkspaceId(sessions('session-a'), workspaces), 'workspace-a')
})

test('returns no workspace without a selected or grouped session', () => {
  assert.equal(currentWorkspaceId(sessions(undefined), workspaces), undefined)
  assert.equal(currentWorkspaceId({
    byId: { ungrouped: { id: 'ungrouped', retainedBy: { mainView: 1 } } },
  }, workspaces), undefined)
})
