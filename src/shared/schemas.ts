import { z } from 'zod'
import { TASK_STATUSES } from './types.ts'

export const taskStatusSchema = z.enum(TASK_STATUSES)
export const taskPrioritySchema = z.enum(['low', 'normal', 'high'])
export const taskActorSchema = z.object({
  type: z.enum(['user', 'agent']),
  sessionId: z.string().optional(),
}).readonly()

export const projectTaskSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  parentId: z.string().optional(),
  rootId: z.string(),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  revision: z.number().int().nonnegative(),
  blockedReason: z.string().optional(),
  unblockCondition: z.string().optional(),
  activeSessionId: z.string().optional(),
  handoffIncomplete: z.boolean(),
  createdBy: taskActorSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
  completedAt: z.number().optional(),
  archivedAt: z.number().optional(),
  deletedAt: z.number().optional(),
}).readonly()

export const taskSessionLinkSchema = z.object({
  taskId: z.string(),
  sessionId: z.string(),
  role: z.enum(['created', 'executed', 'handoff', 'reviewed']),
  firstEventSeq: z.number().int().nonnegative().optional(),
  lastEventSeq: z.number().int().nonnegative().optional(),
  linkedAt: z.number(),
}).readonly()

export const taskCheckpointSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  sessionId: z.string(),
  kind: z.enum(['start', 'progress', 'handoff', 'finish', 'interrupted']),
  summary: z.string(),
  currentState: z.string().optional(),
  decisions: z.array(z.string()),
  modifiedFiles: z.array(z.string()),
  verification: z.array(z.string()),
  openQuestions: z.array(z.string()),
  nextSteps: z.array(z.string()),
  lessons: z.array(z.string()).optional(),
  procedures: z.array(z.string()).optional(),
  eventRange: z.object({
    fromSeq: z.number().int().nonnegative(),
    toSeq: z.number().int().nonnegative(),
  }).optional(),
  createdAt: z.number(),
}).readonly()

export const taskActivitySchema = z.object({
  id: z.string(),
  taskId: z.string(),
  workspaceId: z.string(),
  actor: taskActorSchema,
  action: z.string(),
  fromStatus: taskStatusSchema.optional(),
  toStatus: taskStatusSchema.optional(),
  detail: z.string().optional(),
  createdAt: z.number(),
}).readonly()

export const observedArtifactSchema = z.object({
  observationId: z.string().min(1).max(500),
  path: z.string().min(1).max(2000),
  changeKind: z.enum(['created', 'modified', 'deleted', 'renamed']),
  toolName: z.string().min(1).max(100),
  observedAt: z.number().nonnegative(),
})

export const taskArtifactSchema = observedArtifactSchema.extend({
  taskId: z.string().min(1),
  workspaceId: z.string().min(1),
  source: z.literal('tool-observer'),
  firstObservedAt: z.number().nonnegative(),
  lastObservedAt: z.number().nonnegative(),
}).readonly()

export const recallRejectionSchema = z.object({
  taskId: z.string().min(1),
  reason: z.enum(['below-score', 'insufficient-signals', 'below-support-ratio', 'no-context-slot', 'safety-cap', 'budget-truncated']),
  score: z.number().finite(),
})

export const recallAuditSummarySchema = z.object({
  workspaceId: z.string().min(1),
  boundTaskId: z.string().optional(),
  mode: z.enum(['shadow', 'actual']),
  gateVersion: z.string().min(1),
  candidateCount: z.number().int().nonnegative(),
  keptCount: z.number().int().nonnegative(),
  reasonCounts: z.record(z.string(), z.number().int().nonnegative()),
  legacyChars: z.number().int().nonnegative(),
  gatedChars: z.number().int().nonnegative(),
  nonBoundBudget: z.number().int().nonnegative(),
  rejectedSample: z.array(recallRejectionSchema).max(20),
})

export const recallAuditSchema = recallAuditSummarySchema.extend({
  id: z.string().min(1),
  sessionId: z.string().optional(),
  createdAt: z.number().nonnegative(),
}).readonly()

export const taskInsightSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  taskId: z.string().optional(),
  kind: z.enum(['decision', 'lesson', 'procedure', 'question']),
  scope: z.enum(['task', 'workspace', 'global']),
  content: z.string(),
  contentHash: z.string(),
  status: z.enum(['active', 'resolved', 'stale', 'superseded']).default('active'),
  supersededByInsightId: z.string().optional(),
  sourceCheckpointId: z.string().optional(),
  createdAt: z.number().nonnegative(),
  updatedAt: z.number().nonnegative(),
  lastSeenAt: z.number().nonnegative(),
  lastUsedAt: z.number().nonnegative().optional(),
}).readonly()

export const subtaskInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20_000).optional(),
  acceptanceCriteria: z.array(z.string().trim().min(1)).max(50).optional(),
  priority: taskPrioritySchema.optional(),
})

export const startTaskInputSchema = z.object({
  workspaceId: z.string().min(1),
  sessionId: z.string().min(1),
  taskId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(20_000).optional(),
  acceptanceCriteria: z.array(z.string().trim().min(1)).max(50).optional(),
  priority: taskPrioritySchema.optional(),
  subtasks: z.array(subtaskInputSchema).max(100).optional(),
  summary: z.string().trim().min(1).max(20_000),
  currentState: z.string().max(20_000).optional(),
  decisions: z.array(z.string()).max(100).optional(),
  nextSteps: z.array(z.string()).max(100).optional(),
  eventSeq: z.number().int().nonnegative().optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
})

export const updateTaskInputSchema = z.object({
  taskId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
  actor: taskActorSchema,
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(20_000).optional(),
  acceptanceCriteria: z.array(z.string().trim().min(1)).max(50).optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  blockedReason: z.string().max(20_000).optional(),
  unblockCondition: z.string().max(20_000).optional(),
  detail: z.string().max(20_000).optional(),
})

export const checkpointInputSchema = z.object({
  taskId: z.string().min(1),
  sessionId: z.string().min(1),
  kind: z.enum(['start', 'progress', 'handoff', 'finish', 'interrupted']),
  actor: taskActorSchema,
  summary: z.string().trim().min(1).max(20_000),
  currentState: z.string().max(20_000).optional(),
  decisions: z.array(z.string()).max(100).optional(),
  modifiedFiles: z.array(z.string()).max(500).optional(),
  verification: z.array(z.string()).max(200).optional(),
  openQuestions: z.array(z.string()).max(100).optional(),
  nextSteps: z.array(z.string()).max(100).optional(),
  lessons: z.array(z.string()).max(100).optional(),
  procedures: z.array(z.string()).max(100).optional(),
  eventRange: z.object({
    fromSeq: z.number().int().nonnegative(),
    toSeq: z.number().int().nonnegative(),
  }).optional(),
  status: z.enum(['in_progress', 'paused', 'blocked', 'in_review']).optional(),
  blockedReason: z.string().max(20_000).optional(),
  unblockCondition: z.string().max(20_000).optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
})

export const taskQuerySchema = z.object({
  workspaceId: z.string().min(1),
  statuses: z.array(taskStatusSchema).max(TASK_STATUSES.length).optional(),
  keyword: z.string().max(500).optional(),
  parentId: z.string().optional(),
  rootId: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().nonnegative().optional(),
})
