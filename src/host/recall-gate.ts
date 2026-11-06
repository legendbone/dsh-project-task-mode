import type { RecallGateConfig } from '../shared/config.ts'
import { formatTaskContext, formatTaskContextBody } from '../shared/recall-format.ts'
import type {
  ProjectTask,
  RecallEvaluation,
  RecallRejection,
  TaskCheckpoint,
  TaskContextItem,
  TaskContextPackage,
  TaskDetails,
  TaskStatus,
} from '../shared/types.ts'

const STATUS_SCORE: Record<TaskStatus, number> = {
  in_progress: 1,
  blocked: 0.9,
  in_review: 0.75,
  paused: 0.65,
  todo: 0.5,
  backlog: 0.3,
  done: 0,
  cancelled: 0,
}

function newestFirst<T extends { createdAt?: number; updatedAt?: number; linkedAt?: number }>(items: T[]): T[] {
  return items.sort((a, b) => (b.updatedAt ?? b.createdAt ?? b.linkedAt ?? 0) - (a.updatedAt ?? a.createdAt ?? a.linkedAt ?? 0))
}

function tokenSet(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0
  let intersection = 0
  for (const token of left) if (right.has(token)) intersection += 1
  return intersection / (left.size + right.size - intersection)
}

function hasHandoff(checkpoint: TaskCheckpoint | undefined): boolean {
  return Boolean(checkpoint && (
    checkpoint.kind === 'handoff' || checkpoint.kind === 'finish' || checkpoint.kind === 'interrupted' ||
    checkpoint.nextSteps.length > 0 || checkpoint.openQuestions.length > 0
  ))
}

export interface RecallContextInput {
  workspaceId: string
  boundTaskId?: string
  boundTask?: TaskDetails
  tasks: readonly ProjectTask[]
  checkpoints: readonly TaskCheckpoint[]
  now: number
  config: RecallGateConfig
}

interface Candidate {
  task: ProjectTask
  item: TaskContextItem
  latest?: TaskCheckpoint
  score: number
  handoff: boolean
  signals: number
  availableSignals: number
  supportRatio: number
}

export function buildLegacyContext(input: Omit<RecallContextInput, 'now' | 'config'>): TaskContextPackage {
  const { workspaceId, boundTaskId, boundTask, tasks, checkpoints } = input
  const roots = tasks.filter(task => task.workspaceId === workspaceId && !task.parentId)
  const sortedCheckpoints = newestFirst([...checkpoints])
  const latestByTask = new Map<string, TaskCheckpoint>()
  for (const checkpoint of sortedCheckpoints) {
    if (!latestByTask.has(checkpoint.taskId)) latestByTask.set(checkpoint.taskId, checkpoint)
  }
  const contextItem = (task: ProjectTask): TaskContextItem => ({
    taskId: task.id,
    title: task.title,
    status: task.status,
    summary: latestByTask.get(task.id)?.summary ?? task.description,
  })
  const handoffTaskIds = new Set(sortedCheckpoints
    .filter(item => item.kind === 'handoff' || item.kind === 'finish' || item.kind === 'interrupted')
    .map(item => item.taskId))
  const handoffs = newestFirst(roots.filter(task => handoffTaskIds.has(task.id))).slice(0, 2).map(contextItem)
  return {
    workspaceId,
    inProgress: newestFirst(roots.filter(task => task.status === 'in_progress')).slice(0, 3).map(contextItem),
    blocked: newestFirst(roots.filter(task => task.status === 'blocked')).slice(0, 2).map(contextItem),
    recentHandoffs: handoffs,
    ...(boundTaskId && boundTask ? { boundTask } : {}),
  }
}

export function evaluateRecallContext(input: RecallContextInput): RecallEvaluation {
  const { workspaceId, boundTaskId, boundTask, now, config } = input
  const tasks = input.tasks.filter(task => task.workspaceId === workspaceId)
  const taskIds = new Set(tasks.map(task => task.id))
  const checkpoints = input.checkpoints.filter(checkpoint => taskIds.has(checkpoint.taskId))
  const legacyPackage = buildLegacyContext({ ...input, tasks, checkpoints })
  const latestByTask = new Map<string, TaskCheckpoint>()
  for (const checkpoint of newestFirst([...checkpoints])) {
    if (!latestByTask.has(checkpoint.taskId)) latestByTask.set(checkpoint.taskId, checkpoint)
  }
  const boundRootId = boundTask?.task.rootId
  const candidatesById = new Map<string, ProjectTask>()
  for (const task of tasks) {
    if (task.id === boundTaskId || task.archivedAt !== undefined || task.deletedAt !== undefined) continue
    if (task.status === 'done' || task.status === 'cancelled') continue
    if (!task.parentId || (boundRootId && task.parentId === boundRootId)) candidatesById.set(task.id, task)
  }
  const reference = boundTask
    ? tokenSet(`${boundTask.task.title}\n${boundTask.task.description}\n${boundTask.checkpoints[0]?.summary ?? ''}`)
    : new Set<string>()
  const candidates: Candidate[] = [...candidatesById.values()].map(task => {
    const latest = latestByTask.get(task.id)
    const overlap = boundTask && reference.size
      ? jaccard(reference, tokenSet(`${task.title}\n${task.description}\n${latest?.summary ?? ''}`))
      : undefined
    const child = boundTask ? task.parentId === boundTask.task.id : undefined
    const handoff = hasHandoff(latest)
    const recency = Math.max(0, Math.min(1, 1 - Math.max(0, now - task.updatedAt) / (14 * 24 * 60 * 60 * 1000)))
    const score = 0.30 * STATUS_SCORE[task.status] + 0.20 * recency + 0.25 * (overlap ?? 0) +
      0.10 * (child ? 1 : 0) + 0.15 * (handoff ? 1 : 0)
    const signals = Number((overlap ?? 0) > 0) + Number(child === true) + Number(handoff)
    const availableSignals = Number(overlap !== undefined) + Number(child !== undefined) + 1
    return {
      task,
      latest,
      item: {
        taskId: task.id,
        title: task.title,
        status: task.status,
        summary: latest?.summary ?? task.description,
      },
      score,
      handoff,
      signals,
      availableSignals,
      supportRatio: availableSignals ? signals / availableSignals : 0,
    }
  }).sort((a, b) => b.score - a.score || b.task.updatedAt - a.task.updatedAt || a.task.id.localeCompare(b.task.id))

  const gatedPackage: TaskContextPackage = {
    workspaceId,
    inProgress: [],
    blocked: [],
    recentHandoffs: [],
    ...(boundTaskId && boundTask ? { boundTask } : {}),
  }
  const rejections: { taskId: string; reason: RecallRejection['reason']; score: number }[] = []
  const kept = new Set<string>()
  for (const candidate of candidates) {
    let reason: RecallRejection['reason'] | undefined
    if (candidate.signals < config.minSignals) reason = 'insufficient-signals'
    else if (candidate.supportRatio < config.supportRatio) reason = 'below-support-ratio'
    else if (candidate.score < config.minScore) reason = 'below-score'
    if (reason) {
      rejections.push({ taskId: candidate.task.id, reason, score: candidate.score })
      continue
    }
    const bucket = candidate.task.status === 'in_progress'
      ? 'inProgress'
      : candidate.task.status === 'blocked'
        ? 'blocked'
        : candidate.handoff ? 'recentHandoffs' : undefined
    if (!bucket) {
      rejections.push({ taskId: candidate.task.id, reason: 'no-context-slot', score: candidate.score })
      continue
    }
    const cap = bucket === 'inProgress' ? 3 : 2
    if (gatedPackage[bucket].length >= cap) {
      rejections.push({ taskId: candidate.task.id, reason: 'safety-cap', score: candidate.score })
      continue
    }
    gatedPackage[bucket].push(candidate.item)
    if (formatTaskContextBody(gatedPackage).length > config.nonBoundCharBudget) {
      gatedPackage[bucket].pop()
      rejections.push({ taskId: candidate.task.id, reason: 'budget-truncated', score: candidate.score })
      continue
    }
    kept.add(candidate.task.id)
  }
  const reasonCounts: Record<string, number> = {}
  for (const rejection of rejections) reasonCounts[rejection.reason] = (reasonCounts[rejection.reason] ?? 0) + 1
  return {
    legacyPackage,
    gatedPackage,
    audit: {
      workspaceId,
      ...(boundTaskId ? { boundTaskId } : {}),
      mode: config.mode,
      gateVersion: config.gateVersion,
      candidateCount: candidates.length,
      keptCount: kept.size + (boundTask ? 1 : 0),
      reasonCounts,
      legacyChars: formatTaskContext(legacyPackage).length,
      gatedChars: formatTaskContext(gatedPackage).length,
      nonBoundBudget: config.nonBoundCharBudget,
      rejectedSample: rejections.slice(0, 20),
    },
  }
}
