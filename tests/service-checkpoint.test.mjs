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

function checkpoint(taskId, expectedRevision, sessionId = 'session-a') {
  return {
    taskId,
    sessionId,
    expectedRevision,
    kind: 'finish',
    actor: { type: 'agent', sessionId },
    summary: 'Finish task',
    status: 'in_review',
  }
}

test('refreshes a stale checkpoint revision while the same session still owns the task', async () => {
  const service = createService()
  const { task } = await startTask(service)
  await service.update({
    taskId: task.id,
    expectedRevision: 1,
    actor: { type: 'user' },
    title: 'Updated elsewhere',
  })

  const details = await service.checkpoint(checkpoint(task.id, 1))
  assert.equal(details.task.revision, 3)
  assert.equal(details.task.title, 'Updated elsewhere')
  assert.equal(details.task.status, 'in_review')
  assert.equal(details.checkpoints[0].summary, 'Finish task')
})

test('keeps revision protection after the task leaves the active session', async () => {
  const service = createService()
  const { task } = await startTask(service)
  await service.update({
    taskId: task.id,
    expectedRevision: 1,
    actor: { type: 'user' },
    status: 'in_review',
  })

  await assert.rejects(
    service.checkpoint(checkpoint(task.id, 1)),
    { code: 'project-task/revision-conflict' },
  )
})

test('keeps active-session protection when another session owns the task', async () => {
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
    summary: 'Hand off task',
  })

  await assert.rejects(
    service.checkpoint(checkpoint(task.id, 1)),
    { code: 'project-task/active-session-conflict' },
  )
})

test('fallback interruption increments revision and invalidates stale finish requests', async () => {
  const service = createService()
  const { task } = await startTask(service)
  await service.interruptSession('session-a', 'Missing finish checkpoint')
  assert.equal(service.get(task.id).task.revision, 2)

  await assert.rejects(
    service.checkpoint(checkpoint(task.id, 1)),
    { code: 'project-task/revision-conflict' },
  )
})

test('checkpoint revision remains optional for the owning session', async () => {
  const service = createService()
  const { task } = await startTask(service)
  await service.update({
    taskId: task.id,
    expectedRevision: 1,
    actor: { type: 'user' },
    title: 'Updated elsewhere',
  })
  const input = checkpoint(task.id, 1)
  delete input.expectedRevision

  const details = await service.checkpoint(input)
  assert.equal(details.task.revision, 3)
  assert.equal(details.task.title, 'Updated elsewhere')
})
