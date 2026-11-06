import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { errorMessage, taskError } from '../shared/errors.ts'
import { injectTaskContext } from '../agent/recall.ts'
import type {
  CheckpointInput,
  ContinueTaskInput,
  ContinueTaskResult,
  CreateManualTaskInput,
  ObservedArtifact,
  RecallAuditRecord,
  RecallEvaluation,
  StartTaskInput,
  SubtaskInput,
  TaskContextPackage,
  TaskDetails,
  TaskListResult,
  TaskQuery,
  UpdateTaskRequest,
} from '../shared/types.ts'
import type { ProjectTaskService } from './service.ts'
import { shouldRetitleSessionAfterStart } from './service.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    projectTaskController: ProjectTaskController
  }
}

export class ProjectTaskController extends TypertRemoteService {
  constructor(ctx: Context, private readonly tasks: ProjectTaskService) {
    super(ctx, 'projectTaskController', { namespace: 'projectTasks' })
  }

  @Remote('list')
  list(query: TaskQuery): Promise<TaskListResult> {
    return Promise.resolve(this.tasks.list(query))
  }

  @Remote('get')
  get(taskId: string): Promise<TaskDetails> {
    return Promise.resolve(this.tasks.get(taskId))
  }

  @Remote('context')
  context(workspaceId: string, boundTaskId?: string): Promise<TaskContextPackage> {
    return Promise.resolve(this.tasks.context(workspaceId, boundTaskId))
  }

  @Remote('recallAudit')
  recallAudit(taskId: string, limit?: number): Promise<RecallAuditRecord[]> {
    return Promise.resolve(this.tasks.listRecallAudit(taskId, limit))
  }

  @Remote('create')
  create(input: CreateManualTaskInput): Promise<TaskDetails> {
    return this.tasks.createManual({ ...input, actor: { type: 'user' } })
  }

  @Remote('update')
  update(input: UpdateTaskRequest): Promise<TaskDetails> {
    return this.tasks.update({ ...input, actor: { type: 'user' } })
  }

  @Remote('continue')
  async continue(input: ContinueTaskInput): Promise<ContinueTaskResult> {
    const details = this.tasks.get(input.taskId)
    const { task } = details
    const fresh = details.checkpoints.length === 0 && details.sessions.length === 0
    const created = await this.ctx.sessionController.create({
      workspaceId: task.workspaceId as WorkspaceId,
      agentPreset: 'project-task',
    })
    try {
      await this.ctx.sessionController.rename({ sessionId: created.sessionId, title: task.title })
    } catch (error) {
      // Naming the session after the task is a convenience; never block the handoff on it.
      this.ctx.logger.warn(`project-task session rename failed: ${errorMessage(error)}`)
    }
    await this.tasks.start({
      workspaceId: task.workspaceId,
      sessionId: created.sessionId,
      taskId: task.id,
      expectedRevision: input.expectedRevision,
      summary: fresh
        ? '从项目看板开启任务，并记录开始 Checkpoint。'
        : '从项目看板继续任务，沿用最近的交接、开放问题和未完成子任务。',
    })
    const agent = this.ctx.agents.get(created.sessionId)
    if (agent) injectTaskContext(agent, this.tasks.context(task.workspaceId, task.id))
    return { taskId: task.id, sessionId: created.sessionId, presetId: 'project-task' }
  }

  async workspaceIdForSession(session: Session): Promise<string> {
    const cwd = session.header.cwd
    const workspace = cwd ? await this.ctx.workspaceRegistry.resolveByPath(cwd) : undefined
    if (!workspace) {
      throw taskError('project-task/workspace-not-found', 'Session directory is not registered as a workspace', {
        sessionId: session.id,
        cwd,
      })
    }
    return workspace.id
  }

  async startForSession(
    session: Session,
    input: Omit<StartTaskInput, 'workspaceId' | 'sessionId'>,
  ): Promise<TaskDetails> {
    const previous = this.tasks.boundTaskForSession(session.id)
    const details = await this.tasks.start({
      ...input,
      workspaceId: await this.workspaceIdForSession(session),
      sessionId: session.id,
    })
    // 会话中途切换到新的主任务时，把会话标题同步成新任务标题，避免标题停留在旧任务。
    if (shouldRetitleSessionAfterStart(previous?.id, details, session.id)) {
      try {
        await this.ctx.sessionController.rename({ sessionId: session.id, title: details.task.title })
      } catch (error) {
        this.ctx.logger.warn(`project-task session retitle failed: ${errorMessage(error)}`)
      }
    }
    return details
  }

  async updateForSession(session: Session, input: UpdateTaskRequest): Promise<TaskDetails> {
    await this.assertTaskWorkspace(session, input.taskId)
    return await this.tasks.update({
      ...input,
      actor: { type: 'agent', sessionId: session.id },
    })
  }

  async addSubtasksForSession(
    session: Session,
    taskId: string,
    subtasks: readonly SubtaskInput[],
  ): Promise<TaskDetails> {
    await this.assertTaskWorkspace(session, taskId)
    return await this.tasks.addSubtasks(taskId, subtasks, { type: 'agent', sessionId: session.id })
  }

  async checkpointForSession(
    session: Session,
    input: Omit<CheckpointInput, 'sessionId' | 'actor'>,
    observedArtifacts: readonly ObservedArtifact[] = [],
  ): Promise<TaskDetails> {
    await this.assertTaskWorkspace(session, input.taskId)
    return await this.tasks.checkpoint({
      ...input,
      sessionId: session.id,
      actor: { type: 'agent', sessionId: session.id },
    }, observedArtifacts)
  }

  async listForSession(session: Session, query: Omit<TaskQuery, 'workspaceId'>): Promise<TaskListResult> {
    return this.tasks.list({ ...query, workspaceId: await this.workspaceIdForSession(session) })
  }

  async getForSession(session: Session, taskId: string): Promise<TaskDetails> {
    await this.assertTaskWorkspace(session, taskId)
    return this.tasks.get(taskId)
  }

  async contextForSession(session: Session): Promise<TaskContextPackage> {
    const workspaceId = await this.workspaceIdForSession(session)
    const boundTask = this.tasks.boundTaskForSession(session.id)
    return this.tasks.context(workspaceId, boundTask?.id)
  }

  async contextEvaluationForSession(session: Session): Promise<RecallEvaluation> {
    const workspaceId = await this.workspaceIdForSession(session)
    const boundTask = this.tasks.boundTaskForSession(session.id)
    return this.tasks.evaluateContext(workspaceId, boundTask?.id)
  }

  activeTaskForSession(sessionId: string) {
    return this.tasks.activeTaskForSession(sessionId)
  }

  reviveForSession(sessionId: string) {
    return this.tasks.reviveForSession(sessionId)
  }

  async interruptSession(
    sessionId: string,
    summary: string,
    eventRange?: { fromSeq: number; toSeq: number },
  ): Promise<void> {
    await this.tasks.interruptSession(sessionId, summary, eventRange)
  }

  private async assertTaskWorkspace(session: Session, taskId: string): Promise<void> {
    const [workspaceId, { task }] = await Promise.all([
      this.workspaceIdForSession(session),
      Promise.resolve(this.tasks.get(taskId)),
    ])
    if (task.workspaceId !== workspaceId) {
      throw taskError('project-task/forbidden', 'Task belongs to another workspace', { taskId })
    }
  }
}
