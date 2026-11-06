import assert from 'node:assert/strict'
import test from 'node:test'
import { ProjectTaskService } from '../src/host/service.ts'
import { ProjectTaskStore } from '../src/host/store.ts'

function table() {
  const records = new Map()
  return {
    get: key => records.get(key),
    entries: () => records.entries(),
    async put(key, value) { records.set(key, structuredClone(value)) },
    async delete(key) { records.delete(key) },
    async update(key, update) {
      const next = update(records.get(key))
      records.set(key, structuredClone(next))
      return next
    },
  }
}

function createService() {
  const tables = Object.fromEntries(['tasks', 'checkpoints', 'task_session_links', 'activities', 'task_artifacts', 'task_insights', 'recall_audit'].map(name => [name, table()]))
  const store = new ProjectTaskStore({ table: name => tables[name] })
  let now = 1000
  const service = new ProjectTaskService(store, () => ++now)
  return { service, store }
}

async function startTask(service) {
  return service.start({
    workspaceId: 'workspace-a',
    sessionId: 'session-a',
    title: 'Artifact task',
    summary: 'Start artifact task',
  })
}

function observation(id, path, observedAt, changeKind = 'modified') {
  return { observationId: id, path, changeKind, toolName: 'edit', observedAt }
}

test('checkpoint merges eligible observed files with manual evidence and preserves raw lessons/procedures', async () => {
  const { service, store } = createService()
  const { task } = await startTask(service)
  const linkedAt = service.get(task.id).sessions[0].linkedAt
  const observed = [
    observation('call-1:0', 'src/auto.ts', linkedAt + 1),
    observation('call-1b:0', 'src/duplicate-observation.ts', linkedAt + 1),
    observation('call-2:0', 'src/stale.ts', linkedAt),
    observation('call-3:0', '../outside.ts', linkedAt + 1),
    observation('call-4:0', 'src/manual.ts', linkedAt + 1),
  ]

  const details = await service.checkpoint({
    taskId: task.id,
    sessionId: 'session-a',
    expectedRevision: task.revision,
    kind: 'progress',
    actor: { type: 'agent', sessionId: 'session-a' },
    summary: 'Progress with artifacts',
    modifiedFiles: ['src/manual.ts', 'src/handwritten.ts'],
    lessons: ['Keep the raw lesson'],
    procedures: ['First inspect', 'Then verify'],
  }, observed)

  const checkpoint = details.checkpoints[0]
  assert.deepEqual(checkpoint.modifiedFiles, ['src/manual.ts', 'src/handwritten.ts', 'src/auto.ts', 'src/duplicate-observation.ts'])
  assert.deepEqual(checkpoint.lessons, ['Keep the raw lesson'])
  assert.deepEqual(checkpoint.procedures, ['First inspect', 'Then verify'])
  assert.deepEqual(details.artifacts.map(item => item.path), ['src/auto.ts', 'src/duplicate-observation.ts', 'src/manual.ts'])
  assert.ok(details.artifacts.every(item => item.taskId === task.id && item.workspaceId === 'workspace-a'))
  assert.equal(store.allCheckpoints().length, 2)
})

test('artifact persistence is best effort after the authoritative checkpoint', async () => {
  const { service, store } = createService()
  const { task } = await startTask(service)
  const linkedAt = service.get(task.id).sessions[0].linkedAt
  store.upsertArtifacts = async () => { throw new Error('derived store unavailable') }
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => warnings.push(args)
  try {
    const details = await service.checkpoint({
      taskId: task.id,
      sessionId: 'session-a',
      expectedRevision: task.revision,
      kind: 'progress',
      actor: { type: 'agent', sessionId: 'session-a' },
      summary: 'Checkpoint survives derived failure',
    }, [observation('call-1:0', 'src/authoritative.ts', linkedAt + 1)])
    assert.deepEqual(details.checkpoints[0].modifiedFiles, ['src/authoritative.ts'])
    assert.equal(details.task.revision, task.revision + 1)
    assert.equal(details.artifacts.length, 0)
    assert.ok(warnings.some(args => String(args[0]).includes('artifact ledger write failed')))
  } finally {
    console.warn = originalWarn
  }
})

test('store merges artifacts by path and keeps the newest operation under out-of-order delivery', async () => {
  const { store } = createService()
  await store.upsertArtifacts('task-a', 'workspace-a', [observation('new:0', 'src/a.ts', 200, 'deleted')])
  await store.upsertArtifacts('task-a', 'workspace-a', [observation('old:0', 'src/a.ts', 100, 'created')])
  const [artifact] = store.listArtifacts('task-a')
  assert.equal(artifact.firstObservedAt, 100)
  assert.equal(artifact.lastObservedAt, 200)
  assert.equal(artifact.observationId, 'new:0')
  assert.equal(artifact.changeKind, 'deleted')
})
