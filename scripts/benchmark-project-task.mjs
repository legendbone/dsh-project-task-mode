#!/usr/bin/env node

/* global Buffer, console, process, structuredClone */

import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, totalmem } from 'node:os'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { setImmediate } from 'node:timers'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { formatTaskContext } from '../src/agent/recall.ts'
import { ProjectTaskService } from '../src/host/service.ts'
import { ProjectTaskStore } from '../src/host/store.ts'

const DEFAULT_SIZES = [50, 500, 1000, 5000, 10000]
const DEFAULT_SEED = 20261105
const WORKSPACE_ID = 'benchmark-workspace'
const CHECKPOINTS_PER_TASK = 4

function positiveIntegers(value, fallback) {
  if (!value) return fallback
  const parsed = value.split(',').map(item => Number(item.trim()))
  if (!parsed.length || parsed.some(item => !Number.isSafeInteger(item) || item <= 0)) {
    throw new Error(`Expected comma-separated positive integers, received: ${value}`)
  }
  return parsed
}

const sizes = positiveIntegers(process.env.BENCH_SIZES, DEFAULT_SIZES)
const iterations = positiveIntegers(process.env.BENCH_ITERATIONS, [5])[0]
const seed = Number(process.env.BENCH_SEED ?? DEFAULT_SEED)
if (!Number.isSafeInteger(seed)) throw new Error(`BENCH_SEED must be a safe integer: ${process.env.BENCH_SEED}`)
const label = (process.env.BENCH_LABEL ?? 'baseline').replace(/[^a-zA-Z0-9_-]/g, '_')
const outputDirectory = resolve(process.env.BENCH_OUTPUT_DIR ?? '.tmp/project-task-benchmark')
const GATE_VERSION = 'f2-v1'
const NON_BOUND_CHAR_BUDGET = 4000

function randomGenerator(initialSeed) {
  let state = initialSeed >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

class MemoryUnit {
  constructor(descriptor, backend) {
    this.descriptor = descriptor
    this.backend = backend
    this.tables = new Map(descriptor.tables.map(table => [table, new Map()]))
    this.closed = false
  }

  assertOpen() {
    if (this.closed) throw new Error('KV unit is closed')
  }

  async loadAll() {
    this.assertOpen()
    return {
      tables: Object.fromEntries([...this.tables].map(([table, records]) => [table, Object.fromEntries(records)])),
      global: null,
    }
  }

  async putRecord(table, key, value) {
    this.assertOpen()
    this.tables.get(table).set(key, structuredClone(value))
    this.backend.writes += 1
  }

  async deleteRecord(table, key) {
    this.assertOpen()
    this.tables.get(table).delete(key)
    this.backend.writes += 1
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

class MemoryBackend {
  constructor() {
    this.units = new Set()
    this.writes = 0
    this.kv = {
      open: async descriptor => {
        const unit = new MemoryUnit(descriptor, this)
        this.units.add(unit)
        return unit
      },
    }
  }

  async close() {
    await Promise.all([...this.units].map(unit => unit.close()))
  }
}

async function openStore() {
  const backend = new MemoryBackend()
  const context = {
    storage: { backend: { get: () => backend } },
    emit() {},
    logger: { warn() {}, error() {} },
  }
  const facility = new DomainFacility(context, { backend: 'memory', routes: {} })
  const store = await ProjectTaskStore.open({ storageDomain: { open: spec => facility.open(spec) } })
  return { backend, store }
}

function taskFixture(index, random) {
  const id = `task-${String(index).padStart(7, '0')}`
  const createdAt = 1700000000000 + index * 1000
  const statuses = ['in_progress', 'blocked', 'in_review', 'paused', 'todo']
  const status = statuses[index % statuses.length]
  const sessionId = `session-${String(index).padStart(7, '0')}`
  const task = {
    id,
    workspaceId: WORKSPACE_ID,
    rootId: id,
    title: `Benchmark task ${index}`,
    description: `Deterministic benchmark description ${index}: ${'task-data-'.repeat(12)}${Math.floor(random() * 1e9)}`,
    acceptanceCriteria: [`Verify benchmark task ${index}`, 'Keep deterministic output'],
    status,
    priority: ['low', 'normal', 'high'][index % 3],
    revision: 1,
    handoffIncomplete: false,
    createdBy: { type: 'agent', sessionId },
    createdAt,
    updatedAt: createdAt + 400,
    ...(status === 'in_progress' ? { activeSessionId: sessionId } : {}),
    ...(status === 'blocked' ? { blockedReason: 'Benchmark blocker', unblockCondition: 'Resolve benchmark blocker' } : {}),
  }
  const checkpoints = Array.from({ length: CHECKPOINTS_PER_TASK }, (_, checkpointIndex) => ({
    id: `checkpoint-${String(index).padStart(7, '0')}-${checkpointIndex}`,
    taskId: id,
    sessionId,
    kind: ['start', 'progress', 'handoff', 'finish'][checkpointIndex],
    summary: `Checkpoint ${checkpointIndex} for task ${index}: ${'context-data-'.repeat(12)}${Math.floor(random() * 1e9)}`,
    currentState: `State ${checkpointIndex}`,
    decisions: [`Decision ${checkpointIndex}`],
    modifiedFiles: [`src/fixture-${index}.ts`],
    verification: [`Verification ${checkpointIndex}`],
    openQuestions: [],
    nextSteps: [`Next step ${checkpointIndex}`],
    createdAt: createdAt + checkpointIndex * 100,
  }))
  const link = { taskId: id, sessionId, role: 'created', linkedAt: createdAt }
  const activity = {
    id: `activity-${String(index).padStart(7, '0')}`,
    taskId: id,
    workspaceId: WORKSPACE_ID,
    actor: { type: 'agent', sessionId },
    action: 'started',
    toStatus: 'in_progress',
    createdAt,
  }
  return { task, checkpoints, link, activity }
}

async function populate(store, size) {
  const random = randomGenerator(seed)
  for (let index = 0; index < size; index += 1) {
    const fixture = taskFixture(index, random)
    await store.tasks.put(fixture.task.id, fixture.task)
    for (const checkpoint of fixture.checkpoints) await store.checkpoints.put(checkpoint.id, checkpoint)
    await store.links.put(`${fixture.task.id}-link`, fixture.link)
    await store.activities.put(fixture.activity.id, fixture.activity)
  }
}

function percentile(sorted, ratio) {
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)]
}

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1) ?? 0,
  }
}

async function measure(backend, name, implementation, count, operation, warmup = false) {
  if (warmup) await operation(-1)
  const durations = []
  const writes = []
  const contextCharacters = []
  for (let iteration = 0; iteration < count; iteration += 1) {
    const writesBefore = backend.writes
    const started = performance.now()
    const result = await operation(iteration)
    durations.push(performance.now() - started)
    writes.push(backend.writes - writesBefore + (result?.fallbackWrites ?? 0))
    if (typeof result?.contextCharacters === 'number') contextCharacters.push(result.contextCharacters)
  }
  const memory = process.memoryUsage()
  return {
    name,
    implementation,
    iterations: count,
    milliseconds: distribution(durations),
    writes: {
      total: writes.reduce((sum, value) => sum + value, 0),
      mean: writes.reduce((sum, value) => sum + value, 0) / writes.length,
      min: Math.min(...writes),
      max: Math.max(...writes),
    },
    contextCharacters: contextCharacters.length ? {
      min: Math.min(...contextCharacters),
      max: Math.max(...contextCharacters),
      mean: contextCharacters.reduce((sum, value) => sum + value, 0) / contextCharacters.length,
    } : null,
    memory: {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      externalBytes: memory.external,
      processPeakRssBytes: process.resourceUsage().maxRSS * 1024,
    },
  }
}

function artifactObservations(taskId, prefix, count = 20) {
  return Array.from({ length: count }, (_, index) => ({
    observationId: `${prefix}-observation-${index}`,
    path: `${prefix}/src/file-${Math.floor(index / 2)}.ts`,
    changeKind: 'modified',
    toolName: 'benchmark',
    observedAt: 1700001000000 + index,
  }))
}

async function referenceArtifactMerge(store, taskId, observations, fallbackArtifacts) {
  if (!store.artifacts) {
    for (const observation of observations) {
      const key = `${taskId}:${Buffer.from(observation.path).toString('base64url')}`
      const existing = fallbackArtifacts.get(key)
      fallbackArtifacts.set(key, {
        ...observation,
        taskId,
        workspaceId: WORKSPACE_ID,
        source: 'tool-observer',
        firstObservedAt: existing?.firstObservedAt ?? observation.observedAt,
        lastObservedAt: observation.observedAt,
      })
    }
    return { fallbackWrites: observations.length }
  }
  for (const observation of observations) {
    const key = `${taskId}:${Buffer.from(observation.path).toString('base64url')}`
    const existing = store.artifacts.get(key)
    await store.artifacts.put(key, {
      ...observation,
      taskId,
      workspaceId: WORKSPACE_ID,
      source: 'tool-observer',
      firstObservedAt: existing?.firstObservedAt ?? observation.observedAt,
      lastObservedAt: observation.observedAt,
    })
  }
  return undefined
}

function auditRecord(id) {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    boundTaskId: 'task-0000000',
    sessionId: 'session-0000000',
    mode: 'shadow',
    gateVersion: GATE_VERSION,
    candidateCount: 10,
    keptCount: 2,
    reasonCounts: { 'below-score': 8 },
    legacyChars: 1000,
    gatedChars: 200,
    nonBoundBudget: NON_BOUND_CHAR_BUDGET,
    rejectedSample: [],
    createdAt: 1700002000000,
  }
}

async function referenceAuditWrite(store, id, fallbackAudits) {
  const record = auditRecord(id)
  if (!store.recallAudit) {
    fallbackAudits.set(id, record)
    return { fallbackWrites: 1 }
  }
  await store.recallAudit.put(id, record)
  return undefined
}

async function benchmarkSize(size) {
  const { backend, store } = await openStore()
  try {
    await populate(store, size)
    backend.writes = 0
    const service = new ProjectTaskService(store, () => 1700003000000)
    const firstTaskId = 'task-0000000'
    const firstTask = store.tasks.get(firstTaskId)
    const fallbackArtifacts = new Map()
    const fallbackAudits = new Map()
    const operations = []

    operations.push(await measure(backend, 'list', 'ProjectTaskService.list', iterations,
      () => service.list({ workspaceId: WORKSPACE_ID, limit: 200 }), true))
    operations.push(await measure(backend, 'get', 'ProjectTaskService.get', iterations,
      () => service.get(firstTaskId), true))
    operations.push(await measure(backend, 'context', 'ProjectTaskService.context + formatTaskContext', iterations, async () => {
      const text = formatTaskContext(service.context(WORKSPACE_ID, firstTaskId))
      // Shadow recall audits are intentionally fire-and-forget in the service;
      // drain their in-memory writes before sampling the next operation.
      await new Promise(resolve => setImmediate(resolve))
      return { contextCharacters: text.length }
    }, true))
    operations.push(await measure(backend, 'checkpoint', 'ProjectTaskService.checkpoint', iterations,
      iteration => service.checkpoint({
        taskId: firstTaskId,
        sessionId: firstTask.activeSessionId,
        kind: 'progress',
        actor: { type: 'agent', sessionId: firstTask.activeSessionId },
        summary: `Benchmark checkpoint ${iteration}`,
      })))

    const referenceObservations = artifactObservations(firstTaskId, 'reference')
    operations.push(await measure(backend, 'artifactMerge',
      'benchmark reference: ordered per-observation read/upsert; preserve firstObservedAt and replace lastObservedAt', 1,
      () => referenceArtifactMerge(store, firstTaskId, referenceObservations, fallbackArtifacts)))
    if (typeof store.upsertArtifacts === 'function') {
      const serviceObservations = artifactObservations(firstTaskId, 'service')
      operations.push(await measure(backend, 'artifactMergeService', 'ProjectTaskStore.upsertArtifacts', 1,
        () => store.upsertArtifacts(firstTaskId, WORKSPACE_ID, serviceObservations)))
    }
    operations.push(await measure(backend, 'auditWrite',
      'benchmark reference: upsert exactly one recall audit record; pruning excluded', 1,
      () => referenceAuditWrite(store, 'benchmark-audit', fallbackAudits)))

    return {
      size,
      fixture: {
        seed,
        rootTasks: size,
        checkpointsPerTask: CHECKPOINTS_PER_TASK,
        initialCheckpoints: size * CHECKPOINTS_PER_TASK,
        sessionLinks: size,
        activities: size,
      },
      operations,
    }
  } finally {
    await store.close()
  }
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', cwd: process.cwd() }).trim()
}

function markdown(report) {
  const lines = [
    `# Project task benchmark: ${report.label}`,
    '',
    `- Recorded at: ${report.recordedAt}`,
    `- Commit: ${report.environment.commit}`,
    `- Dirty worktree: ${report.environment.dirtyWorktree}`,
    `- Node: ${report.environment.node}`,
    `- OS/CPU: ${report.environment.os.platform} ${report.environment.os.release} ${report.environment.os.arch}; ${report.environment.os.cpuModel} x ${report.environment.os.cpuCount}`,
    `- Seed: ${report.config.seed}; iterations: ${report.config.iterations}; gateVersion: ${report.config.gateVersion}`,
    '- Percentiles use nearest-rank over measured iterations. Memory is sampled after each operation; processPeakRssBytes is a monotonic process high-water mark.',
    '',
  ]
  for (const result of report.results) {
    lines.push(`## N=${result.size}`, '',
      '| Operation | Implementation | p50 ms | p95 ms | Max ms | Writes/op | Context chars | Peak RSS bytes |',
      '|---|---|---:|---:|---:|---:|---:|---:|')
    for (const operation of result.operations) {
      lines.push(`| ${operation.name} | ${operation.implementation} | ${operation.milliseconds.p50.toFixed(3)} | ${operation.milliseconds.p95.toFixed(3)} | ${operation.milliseconds.max.toFixed(3)} | ${operation.writes.mean.toFixed(1)} | ${operation.contextCharacters?.mean.toFixed(0) ?? '-'} | ${operation.memory.processPeakRssBytes} |`)
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

const report = {
  schemaVersion: 1,
  label,
  recordedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    commit: git(['rev-parse', 'HEAD']),
    dirtyWorktree: git(['status', '--porcelain']).length > 0,
    os: {
      platform: platform(),
      release: release(),
      arch: arch(),
      cpuModel: cpus()[0]?.model ?? 'unknown',
      cpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
    },
  },
  config: {
    seed,
    sizes,
    iterations,
    checkpointsPerTask: CHECKPOINTS_PER_TASK,
    gateVersion: GATE_VERSION,
    recallGate: { gateVersion: GATE_VERSION, nonBoundCharBudget: NON_BOUND_CHAR_BUDGET },
    percentileMethod: 'nearest-rank',
    memoryMethod: 'process.memoryUsage after operation; process.resourceUsage.maxRSS process high-water mark',
  },
  results: [],
}

for (const size of sizes) {
  const result = await benchmarkSize(size)
  report.results.push(result)
  console.log(`N=${size}: ${result.operations.map(operation => `${operation.name} p95=${operation.milliseconds.p95.toFixed(3)}ms`).join(', ')}`)
}

await mkdir(outputDirectory, { recursive: true })
const jsonPath = resolve(outputDirectory, `${label}.json`)
const markdownPath = resolve(outputDirectory, `${label}.md`)
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
await writeFile(markdownPath, markdown(report))
console.log(`JSON: ${jsonPath}`)
console.log(`Markdown: ${markdownPath}`)
