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

async function startTaskWithSubtask(service, sessionId = 'session-a') {
  const details = await service.start({
    workspaceId: 'workspace-a',
    sessionId,
    title: 'Parent task',
    summary: 'Start parent task',
    subtasks: [{ title: 'Subtask', description: 'Child work' }],
  })
  const sub = details.children[0]
  return { parent: details.task, sub }
}

test('agent can move a todo subtask straight to in_review via update', async () => {
  const service = createService()
  const { sub } = await startTaskWithSubtask(service)
  assert.equal(sub.status, 'todo')

  const updated = await service.update({
    taskId: sub.id,
    expectedRevision: sub.revision,
    actor: { type: 'agent', sessionId: 'session-a' },
    status: 'in_review',
  })
  assert.equal(updated.task.status, 'in_review')
  assert.equal(updated.task.activeSessionId, undefined)
})

test('agent can move a todo subtask straight to in_review via checkpoint finish', async () => {
  const service = createService()
  const { sub } = await startTaskWithSubtask(service)

  const updated = await service.checkpoint({
    taskId: sub.id,
    sessionId: 'session-a',
    expectedRevision: sub.revision,
    kind: 'finish',
    actor: { type: 'agent', sessionId: 'session-a' },
    summary: 'Finished subtask',
    status: 'in_review',
  })
  assert.equal(updated.task.status, 'in_review')
})

test('backlog can still not jump straight to in_review', async () => {
  const service = createService()
  const created = await service.createManual({
    workspaceId: 'workspace-a',
    title: 'Backlog item',
    status: 'backlog',
    actor: { type: 'user' },
  })

  await assert.rejects(
    service.update({
      taskId: created.task.id,
      expectedRevision: created.task.revision,
      actor: { type: 'user' },
      status: 'in_review',
    }),
    { code: 'project-task/invalid-transition' },
  )
})
