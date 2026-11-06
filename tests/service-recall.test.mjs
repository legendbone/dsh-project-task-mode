import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_HOST_CONFIG } from '../src/shared/config.ts'
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

function config(overrides = {}) {
  return {
    ...DEFAULT_HOST_CONFIG,
    recallGate: { ...DEFAULT_HOST_CONFIG.recallGate, ...overrides },
  }
}

function createService(recallGate) {
  const tables = Object.fromEntries(['tasks', 'checkpoints', 'task_session_links', 'activities', 'task_artifacts', 'task_insights', 'recall_audit'].map(name => [name, table()]))
  const store = new ProjectTaskStore({ table: name => tables[name] })
  let now = 100000
  const service = new ProjectTaskService(store, () => ++now, config(recallGate))
  return { service, store }
}

async function createBoundAndUnrelated(service, store) {
  const { task: bound } = await service.start({
    workspaceId: 'workspace-a',
    sessionId: 'session-a',
    title: 'Implement database migration',
    description: 'Add schema version two',
    summary: 'Start migration',
  })
  const unrelated = {
    id: 'task-unrelated', workspaceId: 'workspace-a', rootId: 'task-unrelated',
    title: 'Unrelated typography', description: 'Adjust button typography', acceptanceCriteria: [],
    status: 'in_progress', priority: 'normal', revision: 1, handoffIncomplete: false,
    createdBy: { type: 'user' }, createdAt: 99999, updatedAt: 99999,
  }
  await store.tasks.put(unrelated.id, unrelated)
  return { bound, unrelated }
}

const flushAudit = () => new Promise(resolve => setImmediate(resolve))

test('default shadow mode injects legacy context and writes one aggregated comparison audit', async () => {
  const { service, store } = createService()
  const { bound } = await createBoundAndUnrelated(service, store)
  const context = service.context('workspace-a', bound.id)
  const evaluation = service.evaluateContext('workspace-a', bound.id)
  assert.deepEqual(context.inProgress, evaluation.legacyPackage.inProgress)
  assert.deepEqual(context.blocked, evaluation.legacyPackage.blocked)
  assert.deepEqual(context.recentHandoffs, evaluation.legacyPackage.recentHandoffs)
  assert.ok(context.inProgress.some(item => item.taskId === 'task-unrelated'))
  assert.ok(!evaluation.gatedPackage.inProgress.some(item => item.taskId === 'task-unrelated'))
  await flushAudit()
  const audits = store.allRecallAudit()
  assert.equal(audits.length, 2)
  assert.ok(audits.every(audit => audit.mode === 'shadow' && audit.gateVersion === 'f2-v1'))
  assert.ok(audits.every(audit => audit.boundTaskId === bound.id))
  assert.ok(audits.every(audit => audit.rejectedSample.length <= 20))
})

test('actual mode selects gated context while disabled mode stays legacy without audit', async () => {
  const actual = createService({ mode: 'actual' })
  const { bound } = await createBoundAndUnrelated(actual.service, actual.store)
  const context = actual.service.context('workspace-a', bound.id)
  assert.ok(!context.inProgress.some(item => item.taskId === 'task-unrelated'))
  assert.equal(context.boundTask.task.id, bound.id)

  const disabled = createService({ enabled: false })
  const disabledBound = await createBoundAndUnrelated(disabled.service, disabled.store)
  const legacy = disabled.service.context('workspace-a', disabledBound.bound.id)
  assert.ok(legacy.inProgress.some(item => item.taskId === 'task-unrelated'))
  await flushAudit()
  assert.equal(disabled.store.allRecallAudit().length, 0)
})

test('audit failures do not block recall and retention is bounded', async () => {
  const failing = createService()
  await createBoundAndUnrelated(failing.service, failing.store)
  failing.store.upsertRecallAudit = async () => { throw new Error('audit unavailable') }
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => warnings.push(args)
  try {
    const context = failing.service.context('workspace-a')
    assert.equal(context.workspaceId, 'workspace-a')
    await flushAudit()
    assert.ok(warnings.some(args => String(args[0]).includes('recall audit write failed')))
  } finally {
    console.warn = originalWarn
  }

  const bounded = createService({ auditLimit: 2, auditRetentionDays: 30 })
  for (let index = 0; index < 3; index += 1) {
    bounded.service.context('workspace-a')
    await flushAudit()
  }
  assert.equal(bounded.store.allRecallAudit().length, 2)
})
