import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { PROJECT_TASK_DOMAIN, ProjectTaskStore, artifactKey, linkKey } from '../src/host/store.ts'
import { openFileDomain } from './fixtures/storage-v2.fixture.mjs'

// Regression for F1: the artifact ledger key used to be `${taskId}:${b64}`, but
// the per-record json backend only accepts /^[a-zA-Z0-9_-]+$/. A ':' makes
// putRecord throw, and persistArtifacts swallows the error, so artifacts were
// never written even though `modifiedFiles` looked correct. The in-memory fake
// store used by service-artifacts.test.mjs could not catch this — only a real
// file backend enforces the key rule, so this test drives ProjectTaskStore
// through tests/fixtures/storage-v2.fixture.mjs (which applies the same SAFE_KEY).

test('artifact ledger keys are path-safe and persist through a real per-record backend', async t => {
  // Guard the key shape directly so a future edit that reintroduces ':' fails
  // here before it ever reaches the backend.
  assert.match(artifactKey('task-abc', 'src/host/store.ts'), /^[a-zA-Z0-9_-]+$/)
  assert.match(artifactKey('task-abc', 'src with space/中文 文件.ts'), /^[a-zA-Z0-9_-]+$/)
  assert.match(linkKey('task-abc', 'session-a'), /^[a-zA-Z0-9_-]+$/)

  const root = await mkdtemp(resolve(tmpdir(), 'project-task-artifact-fs-'))
  t.after(async () => rm(root, { recursive: true, force: true }))

  const { domain } = await openFileDomain(root, PROJECT_TASK_DOMAIN)
  const store = new ProjectTaskStore(domain)
  try {
    await store.upsertArtifacts('task-abc', 'workspace-a', [
      { observationId: 'call-1:0', path: 'src/host/store.ts', changeKind: 'modified', toolName: 'edit', observedAt: 100 },
      { observationId: 'call-2:0', path: 'src with space/中文 文件.ts', changeKind: 'created', toolName: 'write', observedAt: 200 },
    ])

    const listed = store.listArtifacts('task-abc')
    assert.equal(listed.length, 2)
    assert.equal(listed[0].path, 'src with space/中文 文件.ts') // newest first
    assert.ok(listed.every(item => item.source === 'tool-observer' && item.taskId === 'task-abc'))

    const files = await readdir(resolve(root, 'project_tasks', 'task_artifacts'))
    assert.equal(files.filter(name => name.endsWith('.json')).length, 2)
  } finally {
    await domain.close()
  }
})
