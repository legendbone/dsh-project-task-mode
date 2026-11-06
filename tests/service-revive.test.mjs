import assert from 'node:assert/strict'
import test from 'node:test'
import { ProjectTaskService } from '../src/host/service.ts'

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

async function startTask(service, sessionId = 'session-a') {
  return service.start({
    workspaceId: 'workspace-a',
    sessionId,
    title: 'Task title',
    summary: 'Start task',
  })
}

async function toReview(service, taskId, sessionId = 'session-a') {
  return service.checkpoint({
    taskId,
    sessionId,
    expectedRevision: service.get(taskId).task.revision,
    kind: 'finish',
    actor: { type: 'agent', sessionId },
    summary: 'Finish task',
    status: 'in_review',
  })
}

test('re-entering a review session revives the task to in_progress and rebinds it', async () => {
  const service = createService()
  const { task } = await startTask(service)
  const reviewed = await toReview(service, task.id)
  assert.equal(reviewed.task.status, 'in_review')
  assert.equal(reviewed.task.activeSessionId, undefined)
  // Before the revive the start guard would deny side-effect tools.
  assert.equal(service.activeTaskForSession('session-a'), undefined)

  const revived = await service.reviveForSession('session-a')
  assert.ok(revived)
  assert.equal(revived.status, 'in_progress')
  assert.equal(revived.activeSessionId, 'session-a')
  assert.equal(revived.revision, reviewed.task.revision + 1)
  // Now the guard's active-task check succeeds.
  assert.equal(service.activeTaskForSession('session-a')?.id, task.id)
})

test('revive is idempotent while the same session keeps owning the task', async () => {
  const service = createService()
  const { task } = await startTask(service)
  const reviewed = await toReview(service, task.id)
  const first = await service.reviveForSession('session-a')
  assert.equal(first.revision, reviewed.task.revision + 1)
  const second = await service.reviveForSession('session-a')
  assert.equal(second.revision, first.revision)
  assert.equal(second.activeSessionId, 'session-a')
})

test('does not revive done or paused tasks', async () => {
  const service = createService()
  const { task } = await startTask(service)
  // in_progress -> paused is a user action
  const paused = await service.update({
    taskId: task.id,
    expectedRevision: 1,
    actor: { type: 'user' },
    status: 'paused',
  })
  assert.equal(paused.task.status, 'paused')
  assert.equal(await service.reviveForSession('session-a'), undefined)

  // in_review -> done is a user action
  const service2 = createService()
  const started2 = await startTask(service2)
  await toReview(service2, started2.task.id)
  const current = service2.get(started2.task.id).task
  const done = await service2.update({
    taskId: started2.task.id,
    expectedRevision: current.revision,
    actor: { type: 'user' },
    status: 'done',
  })
  assert.equal(done.task.status, 'done')
  assert.equal(await service2.reviveForSession('session-a'), undefined)
})

test('does not steal a task that another session is actively executing', async () => {
  const service = createService()
  const { task } = await startTask(service)
  await service.update({
    taskId: task.id,
    expectedRevision: 1,
    actor: { type: 'user' },
    status: 'paused',
  })
  await service.start({
    workspaceId: 'workspace-a',
    sessionId: 'session-b',
    taskId: task.id,
    expectedRevision: 2,
    summary: 'Hand off',
  })
  assert.equal(service.get(task.id).task.activeSessionId, 'session-b')

  assert.equal(await service.reviveForSession('session-a'), undefined)
  assert.equal(service.get(task.id).task.activeSessionId, 'session-b')
  assert.equal(service.get(task.id).task.status, 'in_progress')
})

test('project_task_start on a review session takes over the bound task instead of creating a duplicate', async () => {
  const service = createService()
  const { task } = await startTask(service)
  await toReview(service, task.id)

  const resumed = await service.start({
    workspaceId: 'workspace-a',
    sessionId: 'session-a',
    summary: 'Continue improving the reviewed task',
  })
  assert.equal(resumed.task.id, task.id)
  assert.equal(resumed.task.status, 'in_progress')
  assert.equal(resumed.task.activeSessionId, 'session-a')
  assert.equal(service.list({ workspaceId: 'workspace-a' }).total, 1)
  assert.equal(resumed.checkpoints[0].summary, 'Continue improving the reviewed task')
})

test('project_task_start takes over an in_progress task whose executing session was cleared', async () => {
  const service = createService()
  const { task } = await startTask(service)
  // Simulate the board moving in_progress -> in_review -> in_progress without a session.
  await service.update({ taskId: task.id, expectedRevision: 1, actor: { type: 'user' }, status: 'in_review' })
  await service.update({ taskId: task.id, expectedRevision: 2, actor: { type: 'user' }, status: 'in_progress' })
  const cleared = service.get(task.id).task
  assert.equal(cleared.status, 'in_progress')
  assert.equal(cleared.activeSessionId, undefined)

  const resumed = await service.start({
    workspaceId: 'workspace-a',
    sessionId: 'session-a',
    summary: 'Resume after board rollback',
  })
  assert.equal(resumed.task.id, task.id)
  assert.equal(resumed.task.activeSessionId, 'session-a')
  assert.equal(service.list({ workspaceId: 'workspace-a' }).total, 1)
})

test('derives a title from summary when project_task_start omits title', async () => {
  const service = createService()
  const details = await service.start({
    workspaceId: 'workspace-a',
    sessionId: 'session-a',
    summary: '## 修复只读 guard 误判\n在 for 循环里 cat 文件被拒',
  })
  assert.equal(details.task.title, '修复只读 guard 误判')
  assert.equal(details.task.status, 'in_progress')
  assert.equal(details.task.activeSessionId, 'session-a')
})

test('falls back to a placeholder title when summary has no usable first line', async () => {
  const service = createService()
  const details = await service.start({
    workspaceId: 'workspace-a',
    sessionId: 'session-a',
    summary: '   ',
  })
  assert.equal(details.task.title, '未命名任务')
})

test('keeps an explicit title when provided', async () => {
  const service = createService()
  const details = await service.start({
    workspaceId: 'workspace-a',
    sessionId: 'session-a',
    title: 'Explicit title',
    summary: 'A different summary line',
  })
  assert.equal(details.task.title, 'Explicit title')
})
