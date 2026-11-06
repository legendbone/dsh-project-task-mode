import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateRecallContext } from '../src/host/recall-gate.ts'
import { formatTaskContext, formatTaskContextBody } from '../src/shared/recall-format.ts'

const WORKSPACE = 'workspace-a'
const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000

function makeConfig(overrides = {}) {
  return {
    enabled: true,
    mode: 'shadow',
    gateVersion: 'f2-test',
    minSignals: 1,
    supportRatio: 0.4,
    minScore: 0.25,
    nonBoundCharBudget: 4000,
    auditLimit: 200,
    auditRetentionDays: 30,
    ...overrides,
  }
}

function makeTask(id, overrides = {}) {
  return {
    id,
    workspaceId: WORKSPACE,
    rootId: overrides.parentId ?? id,
    title: `title ${id}`,
    description: `description ${id}`,
    acceptanceCriteria: [],
    status: 'in_progress',
    priority: 'normal',
    revision: 1,
    handoffIncomplete: false,
    createdBy: { type: 'agent', sessionId: 'session-test' },
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW,
    ...overrides,
  }
}

function makeCheckpoint(taskId, overrides = {}) {
  return {
    id: `checkpoint-${taskId}`,
    taskId,
    sessionId: 'session-test',
    kind: 'progress',
    summary: `summary ${taskId}`,
    decisions: [],
    modifiedFiles: [],
    verification: [],
    openQuestions: [],
    nextSteps: [],
    createdAt: NOW,
    ...overrides,
  }
}

function makeDetails(task, checkpoints = [], children = []) {
  return {
    task,
    children,
    checkpoints,
    sessions: [],
    activities: [],
  }
}

function assertConsistent(result, input) {
  const { legacyPackage, gatedPackage, audit } = result
  assert.equal(legacyPackage.workspaceId, input.workspaceId)
  assert.equal(gatedPackage.workspaceId, input.workspaceId)
  assert.deepEqual(gatedPackage.boundTask, legacyPackage.boundTask)
  assert.deepEqual(gatedPackage.boundTask, input.boundTask)

  const nonBoundKept = gatedPackage.inProgress.length + gatedPackage.blocked.length + gatedPackage.recentHandoffs.length
  const rejected = Object.values(audit.reasonCounts).reduce((sum, count) => sum + count, 0)
  assert.equal(audit.workspaceId, input.workspaceId)
  assert.equal(audit.boundTaskId, input.boundTaskId)
  assert.equal(audit.mode, input.config.mode)
  assert.equal(audit.gateVersion, input.config.gateVersion)
  assert.equal(audit.candidateCount, nonBoundKept + rejected)
  assert.equal(audit.keptCount, nonBoundKept + (input.boundTask ? 1 : 0))
  assert.equal(audit.legacyChars, formatTaskContext(legacyPackage).length)
  assert.equal(audit.gatedChars, formatTaskContext(gatedPackage).length)
  assert.equal(audit.nonBoundBudget, input.config.nonBoundCharBudget)
  assert.equal(audit.rejectedSample.length, Math.min(20, rejected))
  assert.ok(formatTaskContextBody(gatedPackage).length <= input.config.nonBoundCharBudget)
}

function evaluate(tasks, options = {}) {
  const boundTask = options.boundTask
  const input = {
    workspaceId: WORKSPACE,
    boundTaskId: boundTask?.task.id ?? options.boundTaskId,
    boundTask,
    tasks,
    checkpoints: options.checkpoints ?? [],
    now: NOW,
    config: makeConfig(options.config),
  }
  const result = evaluateRecallContext(input)
  assertConsistent(result, input)
  return result
}

function ids(items) {
  return items.map(item => item.taskId)
}

test('bound task bypasses scoring and a zero non-bound budget without field truncation', () => {
  const longDescription = `bound-description-${'d'.repeat(5000)}`
  const longSummary = `bound-summary-${'s'.repeat(5000)}`
  const bound = makeTask('bound', {
    title: 'Bound root',
    description: longDescription,
    acceptanceCriteria: ['preserve every bound field'],
  })
  const boundCheckpoint = makeCheckpoint(bound.id, {
    kind: 'interrupted',
    summary: longSummary,
    decisions: ['keep bound authoritative'],
    openQuestions: ['open bound question'],
    nextSteps: ['continue bound task'],
    eventRange: { fromSeq: 11, toSeq: 22 },
  })
  const boundTask = makeDetails(bound, [boundCheckpoint], [
    makeTask('bound-display-child', { parentId: bound.id, rootId: bound.id, status: 'blocked' }),
  ])
  const other = makeTask('other', { updatedAt: NOW - 30 * DAY })

  const result = evaluate([bound, other], {
    boundTask,
    config: { minSignals: 3, supportRatio: 1, minScore: 1, nonBoundCharBudget: 0 },
  })

  assert.deepEqual(result.gatedPackage.boundTask, boundTask)
  assert.deepEqual(result.legacyPackage.boundTask, boundTask)
  assert.equal(formatTaskContextBody(result.gatedPackage), '')
  assert.equal(result.audit.keptCount, 1)
  assert.equal(result.audit.candidateCount, 1)
  const rendered = formatTaskContext(result.gatedPackage)
  assert.ok(rendered.includes(longDescription))
  assert.ok(rendered.includes(longSummary))
  assert.ok(rendered.includes('事件 11-22'))
  assert.ok(rendered.length > 10_000)
})

test('legacy remains root-only while gated candidates include only direct children of the bound root', () => {
  const bound = makeTask('bound', { title: 'bound reference', description: '' })
  const root = makeTask('root', { title: '', description: '' })
  const direct = makeTask('direct', { parentId: bound.id, rootId: bound.id, title: '', description: '' })
  const grandchild = makeTask('grandchild', { parentId: direct.id, rootId: bound.id, title: '', description: '' })
  const tasks = [bound, root, direct, grandchild]
  const checkpoints = [root, direct, grandchild].map(task => makeCheckpoint(task.id, {
    summary: '',
    nextSteps: ['continue'],
  }))

  const result = evaluate(tasks, {
    boundTask: makeDetails(bound),
    checkpoints,
    config: { supportRatio: 0, minScore: 0 },
  })

  assert.deepEqual(ids(result.legacyPackage.inProgress), ['bound', 'root'])
  assert.deepEqual(ids(result.gatedPackage.inProgress), ['direct', 'root'])
  assert.equal(result.audit.candidateCount, 2)
  assert.equal(result.audit.rejectedSample.length, 0)
  assert.ok(!ids(result.gatedPackage.inProgress).includes('bound'))
  assert.ok(!ids(result.gatedPackage.inProgress).includes('grandchild'))
})

test('overlap, direct-child, and handoff are the only support signals and drive supportRatio', () => {
  const bound = makeTask('bound', { title: 'alpha beta', description: '' })
  const definitions = [
    ['overlap', { title: '', description: 'alpha' }, false],
    ['child', { parentId: bound.id, rootId: bound.id, title: '', description: '' }, false],
    ['handoff', { title: '', description: '' }, true],
    ['overlap-handoff', { title: '', description: 'alpha' }, true],
    ['child-handoff', { parentId: bound.id, rootId: bound.id, title: '', description: '' }, true],
    ['overlap-child', { parentId: bound.id, rootId: bound.id, title: '', description: 'alpha' }, false],
  ]
  const tasks = [bound, ...definitions.map(([id, overrides]) => makeTask(id, overrides))]
  const checkpoints = definitions.filter(([, , handoff]) => handoff).map(([id]) => makeCheckpoint(id, {
    summary: '',
    nextSteps: ['continue'],
  }))
  const expectedAdmitted = ['child-handoff', 'overlap-child', 'overlap-handoff']

  const twoSignals = evaluate(tasks, {
    boundTask: makeDetails(bound),
    checkpoints,
    config: { minSignals: 2, supportRatio: 0, minScore: 0 },
  })
  assert.deepEqual(ids(twoSignals.gatedPackage.inProgress).sort(), expectedAdmitted)
  assert.deepEqual(twoSignals.audit.reasonCounts, { 'insufficient-signals': 3 })
  assert.deepEqual(twoSignals.audit.rejectedSample.map(item => item.taskId).sort(), ['child', 'handoff', 'overlap'])

  const ratio = evaluate(tasks, {
    boundTask: makeDetails(bound),
    checkpoints,
    config: { minSignals: 1, supportRatio: 0.5, minScore: 0 },
  })
  assert.deepEqual(ids(ratio.gatedPackage.inProgress).sort(), expectedAdmitted)
  assert.deepEqual(ratio.audit.reasonCounts, { 'below-support-ratio': 3 })
  assert.deepEqual(ratio.audit.rejectedSample.map(item => item.taskId).sort(), ['child', 'handoff', 'overlap'])
})

test('handoff kinds and non-empty handoff fields count as support, while status and recency alone do not', async t => {
  const handoffCases = [
    ['handoff kind', { kind: 'handoff' }],
    ['finish kind', { kind: 'finish' }],
    ['interrupted kind', { kind: 'interrupted' }],
    ['nextSteps', { nextSteps: ['next'] }],
    ['openQuestions', { openQuestions: ['question'] }],
  ]
  for (const [name, checkpointOverrides] of handoffCases) {
    await t.test(name, () => {
      const task = makeTask('candidate')
      const result = evaluate([task], {
        checkpoints: [makeCheckpoint(task.id, checkpointOverrides)],
        config: { supportRatio: 0, minScore: 0 },
      })
      assert.deepEqual(ids(result.gatedPackage.inProgress), ['candidate'])
      assert.equal(result.audit.rejectedSample.length, 0)
    })
  }

  await t.test('fresh in_progress task without handoff support', () => {
    const task = makeTask('recent-only', { updatedAt: NOW })
    const result = evaluate([task], { config: { supportRatio: 0, minScore: 0 } })
    assert.deepEqual(result.gatedPackage.inProgress, [])
    assert.deepEqual(result.audit.reasonCounts, { 'insufficient-signals': 1 })
    assert.equal(result.audit.rejectedSample[0].reason, 'insufficient-signals')
  })
})

test('applies minSignals, supportRatio, and minScore rejections in that order', () => {
  const task = makeTask('ordered-thresholds', { updatedAt: NOW - 30 * DAY })
  const cases = [
    [{ minSignals: 1, supportRatio: 1, minScore: 1 }, 'insufficient-signals'],
    [{ minSignals: 0, supportRatio: 1, minScore: 1 }, 'below-support-ratio'],
    [{ minSignals: 0, supportRatio: 0, minScore: 1 }, 'below-score'],
  ]
  for (const [config, reason] of cases) {
    const result = evaluate([task], { config })
    assert.deepEqual(result.gatedPackage.inProgress, [])
    assert.deepEqual(result.audit.reasonCounts, { [reason]: 1 })
    assert.equal(result.audit.rejectedSample.length, 1)
    assert.equal(result.audit.rejectedSample[0].taskId, task.id)
    assert.equal(result.audit.rejectedSample[0].reason, reason)
    assert.equal(result.audit.rejectedSample[0].score, 0.3)
  }
})

test('sorts by score DESC, updatedAt DESC, then taskId ASC before applying caps', () => {
  const bound = makeTask('bound', { title: 'alpha beta', description: '' })
  const high = makeTask('task-high', { title: '', description: 'alpha beta', updatedAt: NOW })
  const newer = makeTask('task-z-newer', { title: '', description: 'gamma', updatedAt: NOW })
  const tieA = makeTask('task-a', { title: '', description: 'alpha beta c d e', updatedAt: NOW - 7 * DAY })
  const tieB = makeTask('task-b', { title: '', description: 'alpha beta c d e', updatedAt: NOW - 7 * DAY })
  const tieZ = makeTask('task-z-older', { title: '', description: 'alpha beta c d e', updatedAt: NOW - 7 * DAY })
  const tasks = [bound, tieZ, newer, tieB, high, tieA]
  const checkpoints = [high, newer, tieA, tieB, tieZ].map(task => makeCheckpoint(task.id, {
    summary: '',
    nextSteps: ['continue'],
  }))

  const result = evaluate(tasks, {
    boundTask: makeDetails(bound),
    checkpoints,
    config: { supportRatio: 0, minScore: 0 },
  })
  const capped = result.audit.rejectedSample.filter(item => item.reason === 'safety-cap')
  const ordered = [...ids(result.gatedPackage.inProgress), ...capped.map(item => item.taskId)]

  assert.deepEqual(ordered, ['task-high', 'task-z-newer', 'task-a', 'task-b', 'task-z-older'])
  assert.deepEqual(result.audit.reasonCounts, { 'safety-cap': 2 })
  assert.equal(capped.length, 2)
  for (const rejection of capped) assert.ok(Math.abs(rejection.score - 0.65) < 1e-12)
})

test('enforces inProgress, blocked, and recentHandoffs safety caps of 3, 2, and 2', () => {
  const inProgress = Array.from({ length: 4 }, (_, index) => makeTask(`ip-${index + 1}`, {
    updatedAt: NOW - index * DAY,
  }))
  const blocked = Array.from({ length: 3 }, (_, index) => makeTask(`blocked-${index + 1}`, {
    status: 'blocked',
    updatedAt: NOW - index * DAY,
  }))
  const handoffs = Array.from({ length: 3 }, (_, index) => makeTask(`handoff-${index + 1}`, {
    status: 'paused',
    updatedAt: NOW - index * DAY,
  }))
  const tasks = [...inProgress, ...blocked, ...handoffs]
  const checkpoints = [
    ...[...inProgress, ...blocked].map(task => makeCheckpoint(task.id, { nextSteps: ['continue'] })),
    ...handoffs.map(task => makeCheckpoint(task.id, { kind: 'handoff' })),
  ]

  const result = evaluate(tasks, { checkpoints })

  assert.deepEqual(ids(result.gatedPackage.inProgress), ['ip-1', 'ip-2', 'ip-3'])
  assert.deepEqual(ids(result.gatedPackage.blocked), ['blocked-1', 'blocked-2'])
  assert.deepEqual(ids(result.gatedPackage.recentHandoffs), ['handoff-1', 'handoff-2'])
  assert.deepEqual(result.gatedPackage.inProgress, result.legacyPackage.inProgress)
  assert.deepEqual(result.gatedPackage.blocked, result.legacyPackage.blocked)
  assert.deepEqual(result.gatedPackage.recentHandoffs, result.legacyPackage.recentHandoffs)
  assert.deepEqual(result.audit.reasonCounts, { 'safety-cap': 3 })
  assert.deepEqual(result.audit.rejectedSample.map(item => item.taskId).sort(), ['blocked-3', 'handoff-3', 'ip-4'])
})

test('uses the default 4000-character non-bound rendering budget and reports budget-truncated', () => {
  const tasks = Array.from({ length: 3 }, (_, index) => makeTask(`budget-${index + 1}`, {
    updatedAt: NOW - index * DAY,
  }))
  const checkpoints = tasks.map(task => makeCheckpoint(task.id, {
    summary: 'x'.repeat(1500),
    nextSteps: ['continue'],
  }))

  const result = evaluate(tasks, { checkpoints })

  assert.equal(result.audit.nonBoundBudget, 4000)
  assert.deepEqual(ids(result.legacyPackage.inProgress), ['budget-1', 'budget-2', 'budget-3'])
  assert.deepEqual(ids(result.gatedPackage.inProgress), ['budget-1', 'budget-2'])
  assert.ok(formatTaskContextBody(result.gatedPackage).length <= 4000)
  assert.deepEqual(result.audit.reasonCounts, { 'budget-truncated': 1 })
  assert.equal(result.audit.rejectedSample[0].taskId, 'budget-3')
  assert.equal(result.audit.rejectedSample[0].reason, 'budget-truncated')
  const withThird = {
    ...result.gatedPackage,
    inProgress: [...result.gatedPackage.inProgress, result.legacyPackage.inProgress[2]],
  }
  assert.ok(formatTaskContextBody(withThird).length > 4000)
})

test('keeps legacy, gated, and audit fields exactly consistent', () => {
  const kept = makeTask('kept', { updatedAt: NOW })
  const rejected = makeTask('rejected', {
    description: 'fallback description',
    updatedAt: NOW - 14 * DAY,
  })
  const result = evaluate([kept, rejected], {
    checkpoints: [makeCheckpoint(kept.id, { summary: 'kept summary', nextSteps: ['continue'] })],
    config: {
      mode: 'actual',
      gateVersion: 'f2-exact',
      supportRatio: 0,
      minScore: 0,
      nonBoundCharBudget: 4321,
    },
  })

  assert.deepEqual(result.legacyPackage, {
    workspaceId: WORKSPACE,
    inProgress: [
      { taskId: 'kept', title: 'title kept', status: 'in_progress', summary: 'kept summary' },
      { taskId: 'rejected', title: 'title rejected', status: 'in_progress', summary: 'fallback description' },
    ],
    blocked: [],
    recentHandoffs: [],
  })
  assert.deepEqual(result.gatedPackage, {
    workspaceId: WORKSPACE,
    inProgress: [
      { taskId: 'kept', title: 'title kept', status: 'in_progress', summary: 'kept summary' },
    ],
    blocked: [],
    recentHandoffs: [],
  })
  assert.deepEqual(result.audit, {
    workspaceId: WORKSPACE,
    mode: 'actual',
    gateVersion: 'f2-exact',
    candidateCount: 2,
    keptCount: 1,
    reasonCounts: { 'insufficient-signals': 1 },
    legacyChars: formatTaskContext(result.legacyPackage).length,
    gatedChars: formatTaskContext(result.gatedPackage).length,
    nonBoundBudget: 4321,
    rejectedSample: [{ taskId: 'rejected', reason: 'insufficient-signals', score: 0.3 }],
  })
})
