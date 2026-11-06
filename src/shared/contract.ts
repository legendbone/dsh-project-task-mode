import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import {
  projectTaskSchema,
  recallAuditSchema,
  taskActivitySchema,
  taskArtifactSchema,
  taskCheckpointSchema,
  taskPrioritySchema,
  taskQuerySchema,
  taskSessionLinkSchema,
  taskStatusSchema,
  updateTaskInputSchema,
} from './schemas.ts'

const taskSummarySchema = z.object({
  task: projectTaskSchema,
  childTotal: z.number().int().nonnegative(),
  childDone: z.number().int().nonnegative(),
  latestCheckpoint: taskCheckpointSchema.optional(),
  recentSessionId: z.string().optional(),
})

const taskListResultSchema = z.object({
  items: z.array(taskSummarySchema),
  total: z.number().int().nonnegative(),
})

const taskDetailsSchema = z.object({
  task: projectTaskSchema,
  children: z.array(projectTaskSchema),
  checkpoints: z.array(taskCheckpointSchema),
  sessions: z.array(taskSessionLinkSchema),
  activities: z.array(taskActivitySchema),
  artifacts: z.array(taskArtifactSchema).optional(),
  recallAudit: z.array(recallAuditSchema).optional(),
  artifactObservationTruncated: z.boolean().optional(),
})

const contextItemSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  status: taskStatusSchema,
  summary: z.string(),
})

const contextSchema = z.object({
  workspaceId: z.string(),
  inProgress: z.array(contextItemSchema),
  blocked: z.array(contextItemSchema),
  recentHandoffs: z.array(contextItemSchema),
  boundTask: taskDetailsSchema.optional(),
})

const createSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20_000).optional(),
  acceptanceCriteria: z.array(z.string().trim().min(1)).max(50).optional(),
  priority: taskPrioritySchema.optional(),
  parentId: z.string().optional(),
  status: z.enum(['backlog', 'todo']).optional(),
})

const updateRequestSchema = updateTaskInputSchema.omit({ actor: true })
const continueSchema = z.object({
  taskId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
})
const continueResultSchema = z.object({
  taskId: z.string(),
  sessionId: z.string(),
  presetId: z.literal('project-task'),
})

const json = (name: string, typeSymbol: string, schema: z.ZodType) => ({
  name,
  wire: name,
  source: 'json' as const,
  codec: { mode: 'strict' as const, typeSymbol, create: () => schema },
})
const resultOf = (typeSymbol: string, schema: z.ZodType) => ({
  mode: 'strict' as const,
  typeSymbol,
  create: () => schema,
})
const parameter = (name: string, schema: z.ZodType) => json(name, `dsh-project-task-mode#${name}`, schema)
const result = (name: string, schema: z.ZodType) => resultOf(`dsh-project-task-mode#${name}`, schema)

function direct(
  method: string,
  parameters: ReturnType<typeof parameter>[],
  output: ReturnType<typeof result>,
): InvocationDescriptor {
  return {
    id: `dsh-project-task-mode#projectTasks/${method}`,
    service: 'projectTaskController',
    namespace: 'projectTasks',
    method,
    invocation: { kind: 'direct' },
    parameters,
    result: output,
  }
}

export const PROJECT_TASK_INVOCATIONS: readonly InvocationDescriptor[] = [
  direct('list', [parameter('query', taskQuerySchema)], result('TaskListResult', taskListResultSchema)),
  direct('get', [parameter('taskId', z.string().min(1))], result('TaskDetails', taskDetailsSchema)),
  direct('context', [
    parameter('workspaceId', z.string().min(1)),
    parameter('boundTaskId', z.string().min(1).optional()),
  ], result('TaskContextPackage', contextSchema)),
  direct('recallAudit', [
    parameter('taskId', z.string().min(1)),
    parameter('limit', z.number().int().positive().max(200).optional()),
  ], result('RecallAuditRecord[]', z.array(recallAuditSchema))),
  direct('create', [parameter('input', createSchema)], result('TaskDetails', taskDetailsSchema)),
  direct('update', [parameter('input', updateRequestSchema)], result('TaskDetails', taskDetailsSchema)),
  direct('continue', [parameter('input', continueSchema)], result('ContinueTaskResult', continueResultSchema)),
]
