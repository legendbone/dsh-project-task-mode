import assert from 'node:assert/strict'
import test from 'node:test'
import { ProjectTaskService, shouldRetitleSessionAfterStart } from '../src/host/service.ts'

function table() {
  const records = new Map()
  return {
    get: key => records.get(key),
    entries: () => records.entries(),
    async put(key, value) {
      records.set(key, structuredClone(value))
    },
    async update(key, update) {
      const next = update(records.get(key))
      records.set(key, structuredClone(next))
      return next
    },
  }
}

function createService() {
  const tables = {
    tasks: table(),
    checkpoints: table(),
    links: table(),
    activities: table(),
    artifacts: table(),
    insights: table(),
    recallAudit: table(),
  }
  const store = {
    ...tables,
    allTasks: () => [...tables.tasks.entries()].map(([, value]) => value),
    allCheckpoints: () => [...tables.checkpoints.entries()].map(([, value]) => value),
    allLinks: () => [...tables.links.entries()].map(([, value]) => value),
    allActivities: () => [...tables.activities.entries()].map(([, value]) => value),
    listArtifacts: taskId => [...tables.artifacts.entries()].map(([, value]) => value).filter(value => value.taskId === taskId),
    listRecallAudit: () => [],
    upsertArtifacts: async () => {},
    upsertRecallAudit: async () => {},
    pruneRecallAudit: async () => {},
  }
  let now = 1000
  return new ProjectTaskService(store, () => ++now)
}

async function startTask(service, sessionId, title, summary = `Start ${title}`) {
  return service.start({ workspaceId: 'workspace-a', sessionId, title, summary })
}

test('a new main task started mid-session creates a new task and pauses the previously active one', async () => {
  const service = createService()
  const first = await startTask(service, 'session-a', 'Scatter 第五列滚动修复')
  assert.equal(first.task.status, 'in_progress')
  assert.equal(first.task.activeSessionId, 'session-a')

  const second = await startTask(service, 'session-a', '审查 reward_ad 修复提交 baf38e23')

  // A brand new task must be created instead of silently claiming the old one.
  assert.notEqual(second.task.id, first.task.id)
  assert.equal(second.task.title, '审查 reward_ad 修复提交 baf38e23')
  assert.equal(second.task.status, 'in_progress')
  assert.equal(second.task.activeSessionId, 'session-a')
  assert.equal(service.list({ workspaceId: 'workspace-a' }).total, 2)

  // The old task is handed off (paused) and no longer owns the session.
  const old = service.get(first.task.id).task
  assert.equal(old.status, 'paused')
  assert.equal(old.activeSessionId, undefined)
  const oldCheckpoints = service.get(first.task.id).checkpoints
  assert.equal(oldCheckpoints[0].kind, 'handoff')
  assert.match(oldCheckpoints[0].summary, /切换到新的主任务/)

  // The session now has exactly one active main task, and it is the new one.
  assert.equal(service.activeTaskForSession('session-a')?.id, second.task.id)
  assert.equal(service.boundTaskForSession('session-a')?.id, second.task.id)
})

test('re-entering with the same title is idempotent and does not create a duplicate', async () => {
  const service = createService()
  const first = await startTask(service, 'session-a', 'Same task')
  const again = await startTask(service, 'session-a', 'Same task', 'A later summary for the same task')
  assert.equal(again.task.id, first.task.id)
  assert.equal(service.list({ workspaceId: 'workspace-a' }).total, 1)
  assert.equal(again.task.status, 'in_progress')
})

test('a title-less summary still creates a new task when it differs from the active task title', async () => {
  const service = createService()
  await startTask(service, 'session-a', 'First task')
  const second = await service.start({
    workspaceId: 'workspace-a',
    sessionId: 'session-a',
    summary: '## 修复另一个模块的崩溃\n详细背景',
  })
  assert.equal(service.list({ workspaceId: 'workspace-a' }).total, 2)
  assert.equal(second.task.title, '修复另一个模块的崩溃')
  assert.equal(second.task.activeSessionId, 'session-a')
})

test('bound task prefers the live active task over a newer stale link', async () => {
  const service = createService()
  const first = await startTask(service, 'session-a', 'Old task')
  const second = await startTask(service, 'session-a', 'New task')

  // Simulate a stale link to the old (paused) task being the newest by linkedAt.
  for (const [, link] of service.store.links.entries()) {
    if (link.taskId === first.task.id) link.linkedAt = Date.now() + 1_000_000
  }
  assert.equal(service.boundTaskForSession('session-a')?.id, second.task.id)
})

test('shouldRetitleSessionAfterStart only fires when a different task replaces the bound one', async () => {
  const service = createService()
  const first = await startTask(service, 'session-a', 'Old task')
  const second = await startTask(service, 'session-a', 'New task')

  const newDetails = service.get(second.task.id)
  const oldDetails = service.get(first.task.id)

  // No previous binding → leave the session title to the host.
  assert.equal(shouldRetitleSessionAfterStart(undefined, newDetails, 'session-a'), false)
  // Same task (idempotent re-entry / claim) → keep the title.
  assert.equal(shouldRetitleSessionAfterStart(newDetails.task.id, newDetails, 'session-a'), false)
  // Different task supersedes the binding → retitle.
  assert.equal(shouldRetitleSessionAfterStart(oldDetails.task.id, newDetails, 'session-a'), true)
  // A task bound to a different session must not retitle this session.
  assert.equal(shouldRetitleSessionAfterStart(oldDetails.task.id, newDetails, 'session-b'), false)
})
