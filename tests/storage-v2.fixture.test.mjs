import assert from 'node:assert/strict'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { PROJECT_TASK_DOMAIN } from '../src/host/store.ts'
import {
  generateV1Fixture,
  openFileDomain,
  readStoredEnvelope,
} from './fixtures/storage-v2.fixture.mjs'

test('generates v1 through DomainFacility, then reads and writes a copied directory with v2', async t => {
  assert.equal(PROJECT_TASK_DOMAIN.version, 2)
  assert.ok(PROJECT_TASK_DOMAIN.compatibleVersions.includes(1))

  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'project-task-storage-v2-'))
  const source = resolve(temporaryRoot, 'source-v1')
  const copied = resolve(temporaryRoot, 'copied-for-v2')
  t.after(async () => rm(temporaryRoot, { recursive: true, force: true }))

  const expected = await generateV1Fixture(source)
  assert.equal((await readStoredEnvelope(source, 'tasks', 'task-root')).version, 1)
  assert.equal((await readStoredEnvelope(source, 'checkpoints', 'checkpoint-0')).version, 1)

  await cp(source, copied, { recursive: true })
  const opened = await openFileDomain(copied, PROJECT_TASK_DOMAIN)
  const domain = opened.domain
  try {
    assert.deepEqual(domain.table('tasks').get('task-root'), expected.rootTask)
    assert.deepEqual(domain.table('tasks').get('task-child'), expected.childTask)
    assert.deepEqual(domain.table('checkpoints').get('checkpoint-0'), expected.checkpoints[0])
    assert.deepEqual(domain.table('checkpoints').get('checkpoint-1'), expected.checkpoints[1])
    assert.deepEqual(domain.table('task_session_links').get('task-root-link'), expected.link)
    assert.deepEqual(domain.table('activities').get('activity-start'), expected.activity)
    assert.equal(domain.table('task_artifacts').size, 0)
    assert.equal(domain.table('task_insights').size, 0)
    assert.equal(domain.table('recall_audit').size, 0)
    assert.equal(Object.hasOwn(domain.table('checkpoints').get('checkpoint-0'), 'lessons'), false)
    assert.equal(Object.hasOwn(domain.table('checkpoints').get('checkpoint-0'), 'procedures'), false)

    await domain.table('tasks').update('task-root', current => ({ ...current, title: 'Updated by Domain v2' }))
    await domain.table('task_insights').put('insight-v2', {
      id: 'insight-v2',
      workspaceId: 'fixture-workspace',
      taskId: 'task-root',
      kind: 'decision',
      scope: 'task',
      content: 'V2 can add new records after reading v1',
      contentHash: 'fixture-hash',
      status: 'active',
      sourceCheckpointId: 'checkpoint-1',
      createdAt: 1700000001000,
      updatedAt: 1700000001000,
      lastSeenAt: 1700000001000,
    })

    assert.equal((await readStoredEnvelope(copied, 'tasks', 'task-root')).version, 2)
    assert.equal((await readStoredEnvelope(copied, 'checkpoints', 'checkpoint-0')).version, 1)
    assert.equal((await readStoredEnvelope(source, 'tasks', 'task-root')).version, 1)
  } finally {
    await domain.close()
  }

  const reopened = await openFileDomain(copied, PROJECT_TASK_DOMAIN)
  try {
    assert.equal(reopened.domain.table('tasks').get('task-root').title, 'Updated by Domain v2')
    assert.deepEqual(reopened.domain.table('checkpoints').get('checkpoint-0'), expected.checkpoints[0])
    assert.equal(reopened.domain.table('task_insights').get('insight-v2').contentHash, 'fixture-hash')
  } finally {
    await reopened.domain.close()
  }
})
