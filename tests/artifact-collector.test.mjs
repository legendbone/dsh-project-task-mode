import assert from 'node:assert/strict'
import test from 'node:test'
import { ArtifactCollector, registerArtifactCollector } from '../src/agent/artifacts.ts'
import { registerProjectTaskTools } from '../src/agent/tools.ts'

const session = { id: 'session-a', header: { cwd: '/workspace/project' } }
let callSequence = 0

function execution(name, args, callId = `call-${++callSequence}`) {
  return { name, arguments: args, callId, agent: { session } }
}

function observe(collector, name, args, result = {}) {
  collector.observe(execution(name, args), { isError: false, ...result })
}

test('collects supported file mutations synchronously and ignores reads, failures, and outside paths', () => {
  const warnings = []
  let now = 100
  const collector = new ArtifactCollector(500, () => ++now, message => warnings.push(message))

  observe(collector, 'write', { file_path: 'src/new.ts' }, { meta: { created: true } })
  observe(collector, 'edit', { file_path: '/workspace/project/src/existing.ts' })
  observe(collector, 'read', { file_path: 'src/ignored.ts' })
  collector.observe(execution('write', { file_path: 'src/failed.ts' }), { isError: true })
  observe(collector, 'delete', { file_path: '../outside.ts' })
  observe(collector, 'move', { source: 'src/old.ts', destination: 'src/new-name.ts' })
  observe(collector, 'apply_patch', { patch: '*** Begin Patch\n*** Add File: src/added.ts\n*** Update File: src/updated.ts\n*** Delete File: src/deleted.ts\n*** End Patch' })

  const snapshot = collector.peek('session-a')
  assert.deepEqual(snapshot.observations.map(item => [item.path, item.changeKind]), [
    ['src/new.ts', 'created'],
    ['src/existing.ts', 'modified'],
    ['src/old.ts', 'deleted'],
    ['src/new-name.ts', 'renamed'],
    ['src/added.ts', 'created'],
    ['src/updated.ts', 'modified'],
    ['src/deleted.ts', 'deleted'],
  ])
  assert.equal(snapshot.truncated, false)
  assert.ok(warnings.some(message => message.includes('outside workspace')))
})

test('bounds pending observations, acks only the requested snapshot, and clears disposed sessions', () => {
  let now = 100
  const collector = new ArtifactCollector(3, () => ++now)
  observe(collector, 'write', { file_path: 'one.ts' })
  observe(collector, 'write', { file_path: 'two.ts' })
  observe(collector, 'write', { file_path: 'three.ts' })
  observe(collector, 'write', { file_path: 'dropped.ts' })
  assert.equal(collector.peek('session-a').observations.length, 3)
  assert.equal(collector.peek('session-a').truncated, true)

  const first = collector.peek('session-a').observations[0]
  collector.ack('session-a', [first.observationId])
  observe(collector, 'write', { file_path: 'four.ts' })
  assert.deepEqual(collector.peek('session-a').observations.map(item => item.path), ['two.ts', 'three.ts', 'four.ts'])
  collector.ack('session-a', collector.peek('session-a').observations.map(item => item.observationId))
  assert.equal(collector.peek('session-a').truncated, false)

  observe(collector, 'write', { file_path: 'five.ts' })
  collector.clear('session-a')
  assert.deepEqual(collector.peek('session-a'), { observations: [], truncated: false })
})

test('registers a synchronous tools/result observer and disposes session state', () => {
  const handlers = new Map()
  const ctx = { on: (event, handler) => handlers.set(event, handler) }
  const collector = new ArtifactCollector()
  registerArtifactCollector(ctx, collector)
  handlers.get('tools/result')(execution('write', { file_path: 'src/observed.ts' }), { isError: false })
  assert.deepEqual(collector.peek('session-a').observations.map(item => item.path), ['src/observed.ts'])
  handlers.get('agent/disposed')({ agent: { session } })
  assert.equal(collector.peek('session-a').observations.length, 0)
})

test('checkpoint sends one observation snapshot and acks only after Host success', async () => {
  const definitions = new Map()
  const ctx = { tools: { register: definition => definitions.set(definition.name, definition) } }
  const collector = new ArtifactCollector()
  let received
  let failure
  const controller = {
    async checkpointForSession(_session, input, observations) {
      received = { input, observations }
      if (failure) throw failure
      return { task: { id: input.taskId }, children: [], checkpoints: [], sessions: [], activities: [] }
    },
  }
  registerProjectTaskTools(ctx, controller, collector)
  const checkpoint = definitions.get('project_task_checkpoint')
  const exec = { agent: { session } }
  const args = { taskId: 'task-a', kind: 'progress', summary: 'Progress' }

  observe(collector, 'write', { file_path: 'src/kept-on-error.ts' })
  failure = new Error('checkpoint failed')
  await assert.rejects(checkpoint.execute(args, exec), /checkpoint failed/)
  assert.equal(collector.peek('session-a').observations.length, 1)

  failure = undefined
  const output = JSON.parse(await checkpoint.execute(args, exec))
  assert.equal(output.task.id, 'task-a')
  assert.equal(received.observations[0].path, 'src/kept-on-error.ts')
  assert.equal(collector.peek('session-a').observations.length, 0)
})
