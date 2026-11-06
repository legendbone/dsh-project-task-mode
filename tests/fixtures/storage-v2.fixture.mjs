#!/usr/bin/env node

/* global console, process, structuredClone */

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DomainFacility, defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { PROJECT_TASK_DOMAIN } from '../../src/host/store.ts'
import {
  projectTaskSchema,
  taskActivitySchema,
  taskCheckpointSchema,
  taskSessionLinkSchema,
} from '../../src/shared/schemas.ts'

const DOMAIN_NAME = 'project_tasks'
const SAFE_KEY = /^[a-zA-Z0-9_-]+$/
let temporaryFileCounter = 0

export const PROJECT_TASK_DOMAIN_V1 = defineDomain({
  name: DOMAIN_NAME,
  version: 1,
  layout: 'per-record',
  tables: {
    tasks: domainTable(projectTaskSchema),
    checkpoints: domainTable(taskCheckpointSchema.unwrap().omit({ lessons: true, procedures: true }).readonly()),
    task_session_links: domainTable(taskSessionLinkSchema),
    activities: domainTable(taskActivitySchema),
  },
})

function recordPath(root, table, key) {
  if (!SAFE_KEY.test(key)) throw new Error(`Fixture backend requires a safe per-record key: ${key}`)
  return resolve(root, DOMAIN_NAME, table, `${key}.json`)
}

class FileUnit {
  constructor(root, descriptor, backend) {
    this.root = root
    this.descriptor = descriptor
    this.backend = backend
    this.closed = false
  }

  assertOpen() {
    if (this.closed) throw new Error('KV unit is closed')
  }

  acceptedVersions() {
    return new Set([this.descriptor.version, ...(this.descriptor.compatibleVersions ?? [])])
  }

  async loadAll() {
    this.assertOpen()
    const tables = {}
    const acceptedVersions = this.acceptedVersions()
    for (const table of this.descriptor.tables) {
      const records = {}
      const directory = resolve(this.root, DOMAIN_NAME, table)
      const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
        if (error.code === 'ENOENT') return []
        throw error
      })
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue
        const key = entry.name.slice(0, -'.json'.length)
        const envelope = JSON.parse(await readFile(resolve(directory, entry.name), 'utf8'))
        if (!acceptedVersions.has(envelope.version)) continue
        records[key] = envelope.value
      }
      tables[table] = records
    }
    return { tables, global: null }
  }

  async putRecord(table, key, value) {
    this.assertOpen()
    const path = recordPath(this.root, table, key)
    await mkdir(resolve(path, '..'), { recursive: true })
    const temporaryPath = `${path}.${process.pid}.${temporaryFileCounter++}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify({ version: this.descriptor.version, key, value }, null, 2)}\n`)
    await rename(temporaryPath, path)
  }

  async deleteRecord(table, key) {
    this.assertOpen()
    const { rm } = await import('node:fs/promises')
    await rm(recordPath(this.root, table, key), { force: true })
  }

  async setGlobal() {
    throw new Error('The project task domain has no global value')
  }

  async close() {
    if (this.closed) return
    this.closed = true
    this.backend.units.delete(this)
  }
}

class FileBackend {
  constructor(root) {
    this.root = root
    this.units = new Set()
    this.kv = {
      open: async descriptor => {
        if (this.units.size) throw new Error(`Fixture backend unit is already open: ${descriptor.name}`)
        const unit = new FileUnit(this.root, descriptor, this)
        this.units.add(unit)
        return unit
      },
    }
  }

  async close() {
    await Promise.all([...this.units].map(unit => unit.close()))
  }
}

export async function openFileDomain(root, spec) {
  const backend = new FileBackend(root)
  const context = {
    storage: { backend: { get: () => backend } },
    emit() {},
    logger: { warn() {}, error() {} },
  }
  const facility = new DomainFacility(context, { backend: 'fixture-file', routes: {} })
  const domain = await facility.open(spec)
  return { domain, backend }
}

export async function readStoredEnvelope(root, table, key) {
  return JSON.parse(await readFile(recordPath(root, table, key), 'utf8'))
}

export function fixtureRecords() {
  const createdAt = 1700000000000
  const rootTask = {
    id: 'task-root',
    workspaceId: 'fixture-workspace',
    rootId: 'task-root',
    title: 'V1 root task',
    description: 'Generated through the real v1 DomainFacility',
    acceptanceCriteria: ['Read with Domain v2'],
    status: 'in_progress',
    priority: 'normal',
    revision: 1,
    activeSessionId: 'fixture-session',
    handoffIncomplete: false,
    createdBy: { type: 'agent', sessionId: 'fixture-session' },
    createdAt,
    updatedAt: createdAt,
  }
  const childBase = structuredClone(rootTask)
  delete childBase.activeSessionId
  const childTask = {
    ...childBase,
    id: 'task-child',
    rootId: 'task-root',
    parentId: 'task-root',
    title: 'V1 child task',
    status: 'todo',
    createdAt: createdAt + 1,
    updatedAt: createdAt + 1,
  }
  const checkpoints = ['start', 'progress'].map((kind, index) => ({
    id: `checkpoint-${index}`,
    taskId: 'task-root',
    sessionId: 'fixture-session',
    kind,
    summary: `V1 ${kind} checkpoint`,
    decisions: ['Keep v1 records readable'],
    modifiedFiles: [],
    verification: [],
    openQuestions: [],
    nextSteps: ['Open a copied directory with v2'],
    createdAt: createdAt + index,
  }))
  const link = {
    taskId: 'task-root',
    sessionId: 'fixture-session',
    role: 'created',
    linkedAt: createdAt,
  }
  const activity = {
    id: 'activity-start',
    taskId: 'task-root',
    workspaceId: 'fixture-workspace',
    actor: { type: 'agent', sessionId: 'fixture-session' },
    action: 'started',
    toStatus: 'in_progress',
    createdAt,
  }
  return { rootTask, childTask, checkpoints, link, activity }
}

export async function generateV1Fixture(root) {
  const expected = fixtureRecords()
  const { domain } = await openFileDomain(root, PROJECT_TASK_DOMAIN_V1)
  try {
    await domain.table('tasks').put(expected.rootTask.id, expected.rootTask)
    await domain.table('tasks').put(expected.childTask.id, expected.childTask)
    for (const checkpoint of expected.checkpoints) {
      await domain.table('checkpoints').put(checkpoint.id, checkpoint)
    }
    await domain.table('task_session_links').put('task-root-link', expected.link)
    await domain.table('activities').put(expected.activity.id, expected.activity)
  } finally {
    await domain.close()
  }
  const manifest = {
    domain: DOMAIN_NAME,
    version: 1,
    generatedBy: '@deepseek-ai/dsh-storage-domain DomainFacility',
    backend: 'tests/fixtures/storage-v2.fixture.mjs FileBackend (public KvUnit contract)',
    records: { tasks: 2, checkpoints: 2, task_session_links: 1, activities: 1 },
  }
  await writeFile(resolve(root, 'fixture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return expected
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  const output = resolve(process.argv[2] ?? '.tmp/project-task-fixtures/storage-v1')
  await generateV1Fixture(output)
  console.log(`V1 fixture: ${output}`)
  console.log(`Reopen with Domain version ${PROJECT_TASK_DOMAIN.version} after copying this directory.`)
}
