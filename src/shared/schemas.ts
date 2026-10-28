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
