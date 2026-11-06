import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { taskError } from '../shared/errors.ts'
import type {
  CheckpointInput,
  StartTaskInput,
  SubtaskInput,
  TaskQuery,
  UpdateTaskRequest,
} from '../shared/types.ts'
import type { ProjectTaskController } from '../host/remote.ts'
import type { ArtifactCollector } from './artifacts.ts'

const TEXT_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: String(value) }],
}

const stringArray = { type: 'array', items: { type: 'string' } }
const subtaskSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    acceptanceCriteria: stringArray,
    priority: { type: 'string', enum: ['low', 'normal', 'high'] },
  },
  required: ['title'],
  additionalProperties: false,
}
const statuses = ['backlog', 'todo', 'in_progress', 'paused', 'blocked', 'in_review', 'done', 'cancelled']

function sessionOf(exec: ToolRunContext): Session {
  const session = exec.agent?.session
  if (!session) throw taskError('project-task/invalid-request', 'Project task tools require an Agent Session')
  return session
}

function json(value: unknown): string {
  return JSON.stringify(value)
}

export function registerProjectTaskTools(
  ctx: Context,
  controller: ProjectTaskController,
  collector?: ArtifactCollector,
): void {
  const register = (definition: ToolDefinition) => ctx.tools.register(definition)

  register({
    name: 'project_task_start',
    description: 'Create or claim one main project task, optionally decompose subtasks, and persist the required start checkpoint before side-effect work.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Existing task to claim; omit to create a new main task.' },
        expectedRevision: { type: 'number', description: 'Revision read when claiming an existing task.' },
        title: { type: 'string', description: 'New task title. Optional when creating a new main task; if omitted it is derived from summary.' },
        description: { type: 'string' },
        acceptanceCriteria: stringArray,
        priority: { type: 'string', enum: ['low', 'normal', 'high'] },
        subtasks: { type: 'array', items: subtaskSchema },
        summary: { type: 'string', description: 'Goal, known context, plan, and constraints for the start checkpoint.' },
        currentState: { type: 'string' },
        decisions: stringArray,
        nextSteps: stringArray,
        eventSeq: { type: 'number' },
      },
      required: ['summary'],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const input = args as Omit<StartTaskInput, 'workspaceId' | 'sessionId'>
      return json(await controller.startForSession(sessionOf(exec), input))
    },
  })

  register({
    name: 'project_task_update',
    description: 'Update a task using its expected revision. Agents may reach in_review but cannot accept done. Blocked status requires a reason and unblock condition.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        expectedRevision: { type: 'number' },
        title: { type: 'string' },
        description: { type: 'string' },
        acceptanceCriteria: stringArray,
        status: { type: 'string', enum: statuses },
        priority: { type: 'string', enum: ['low', 'normal', 'high'] },
        blockedReason: { type: 'string' },
        unblockCondition: { type: 'string' },
        detail: { type: 'string' },
        subtasks: { type: 'array', items: subtaskSchema, description: 'Additional subtasks to append.' },
      },
      required: ['taskId', 'expectedRevision'],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const session = sessionOf(exec)
      const { subtasks, ...input } = args as UpdateTaskRequest & { subtasks?: SubtaskInput[] }
      await controller.updateForSession(session, input)
      const details = subtasks?.length
        ? await controller.addSubtasksForSession(session, input.taskId, subtasks)
        : await controller.getForSession(session, input.taskId)
      return json(details)
    },
  })

  register({
    name: 'project_task_checkpoint',
    description: 'Record progress, handoff, finish, or interruption with decisions, modified files, verification, open questions, and next steps. Finish with in_review, paused, or blocked.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        expectedRevision: { type: 'number' },
        kind: { type: 'string', enum: ['start', 'progress', 'handoff', 'finish', 'interrupted'] },
        summary: { type: 'string' },
        currentState: { type: 'string' },
        decisions: stringArray,
        lessons: stringArray,
        procedures: stringArray,
        modifiedFiles: stringArray,
        verification: stringArray,
        openQuestions: stringArray,
        nextSteps: stringArray,
        eventRange: {
          type: 'object',
          properties: { fromSeq: { type: 'number' }, toSeq: { type: 'number' } },
          required: ['fromSeq', 'toSeq'],
          additionalProperties: false,
        },
        status: { type: 'string', enum: ['in_progress', 'paused', 'blocked', 'in_review'] },
        blockedReason: { type: 'string' },
        unblockCondition: { type: 'string' },
      },
      required: ['taskId', 'kind', 'summary'],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const input = args as Omit<CheckpointInput, 'sessionId' | 'actor'>
      const session = sessionOf(exec)
      const snapshot = collector?.peek(session.id)
      const details = await controller.checkpointForSession(session, input, snapshot?.observations ?? [])
      if (snapshot) collector?.ack(session.id, snapshot.observations.map(item => item.observationId))
      return json(snapshot?.truncated ? { ...details, artifactObservationTruncated: true } : details)
    },
  })

  register({
    name: 'project_task_list',
    description: 'List tasks in the current workspace with optional status, keyword, parent, and root filters.',
    parameters: {
      type: 'object',
      properties: {
        statuses: { type: 'array', items: { type: 'string', enum: statuses } },
        keyword: { type: 'string' },
        parentId: { type: 'string' },
        rootId: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 500 },
        offset: { type: 'number', minimum: 0 },
      },
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      return json(await controller.listForSession(sessionOf(exec), args as Omit<TaskQuery, 'workspaceId'>))
    },
  })

  register({
    name: 'project_task_get',
    description: 'Read one task with children, checkpoints, session links, and activity history.',
    parameters: {
      type: 'object',
      properties: { taskId: { type: 'string' } },
      required: ['taskId'],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const { taskId } = args as { taskId: string }
      return json(await controller.getForSession(sessionOf(exec), taskId))
    },
  })
}
