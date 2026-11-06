import { randomUUID } from 'node:crypto'
import { taskError } from '../shared/errors.ts'
import { DEFAULT_HOST_CONFIG, type HostConfig } from '../shared/config.ts'
import { evaluateRecallContext } from './recall-gate.ts'
import type {
  CheckpointInput,
  ObservedArtifact,
  ProjectTask,
  RecallAuditRecord,
  RecallEvaluation,
  StartTaskInput,
  SubtaskInput,
  TaskActivity,
  TaskActor,
  TaskCheckpoint,
  TaskContextPackage,
  TaskDetails,
  TaskListResult,
  TaskQuery,
  TaskSessionLink,
  TaskSessionRole,
  TaskStatus,
  TaskSummary,
  UpdateTaskInput,
} from '../shared/types.ts'
import { linkKey, type ProjectTaskStore } from './store.ts'

const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  backlog: ['todo', 'cancelled'],
  todo: ['backlog', 'in_progress', 'in_review', 'cancelled'],
  in_progress: ['paused', 'blocked', 'in_review', 'cancelled'],
  paused: ['todo', 'in_progress', 'blocked', 'cancelled'],
  blocked: ['todo', 'in_progress', 'cancelled'],
  in_review: ['in_progress', 'done', 'cancelled'],
  done: ['in_progress'],
  cancelled: ['backlog', 'todo'],
}

function newestFirst<T extends { createdAt?: number; updatedAt?: number; linkedAt?: number }>(items: T[]): T[] {
  return items.sort((a, b) => (b.updatedAt ?? b.createdAt ?? b.linkedAt ?? 0) - (a.updatedAt ?? a.createdAt ?? a.linkedAt ?? 0))
}

/**
 * Derive a task title from the start summary when the caller omitted `title`.
 * Uses the first non-empty line, strips common markdown emphasis/list markers,
 * collapses whitespace and caps the length so a new task can always be created.
 */
function deriveTaskTitle(summary: string): string {
  const firstLine = summary.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0) ?? ''
  const cleaned = firstLine
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[>*\-+]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const candidate = cleaned || summary.replace(/\s+/g, ' ').trim() || '未命名任务'
  return candidate.length > 120 ? `${candidate.slice(0, 120).trimEnd()}…` : candidate
}

/**
 * Whether a project_task_start call replaced the session's previously bound task with
 * a different, now-active main task — i.e. a topic switch inside one session. The
 * controller uses this to retitle the session to the new task so the session title and
 * the bound task never disagree.
 */
export function shouldRetitleSessionAfterStart(
  previousTaskId: string | undefined,
  details: TaskDetails,
  sessionId: string,
): boolean {
  const { task } = details
  return previousTaskId !== undefined &&
    task.id !== previousTaskId &&
    !task.parentId &&
    task.status === 'in_progress' &&
    task.activeSessionId === sessionId
}

export class ProjectTaskService {
  constructor(
    private readonly store: ProjectTaskStore,
    private readonly now: () => number = Date.now,
    private readonly config: HostConfig = DEFAULT_HOST_CONFIG,
  ) {}

  list(query: TaskQuery): TaskListResult {
    const keyword = query.keyword?.trim().toLocaleLowerCase()
    const matching = this.store.allTasks()
      .filter(task => task.workspaceId === query.workspaceId)
      .filter(task => !query.statuses?.length || query.statuses.includes(task.status))
      .filter(task => query.parentId === undefined || task.parentId === query.parentId)
      .filter(task => query.rootId === undefined || task.rootId === query.rootId)
      .filter(task => !keyword || `${task.id}\n${task.title}\n${task.description}`.toLocaleLowerCase().includes(keyword))
    const total = matching.length
    const offset = query.offset ?? 0
    const limit = query.limit ?? 200
    const items = newestFirst(matching).slice(offset, offset + limit).map(task => this.summary(task))
    return { items, total }
  }

  get(taskId: string): TaskDetails {
    const task = this.requireTask(taskId)
    return {
      task,
      children: this.store.allTasks().filter(item => item.parentId === taskId)
        .sort((a, b) => a.createdAt - b.createdAt),
      checkpoints: newestFirst(this.store.allCheckpoints().filter(item => item.taskId === taskId)),
      sessions: newestFirst(this.store.allLinks().filter(item => item.taskId === taskId)),
      activities: newestFirst(this.store.allActivities().filter(item => item.taskId === taskId)),
      artifacts: this.store.listArtifacts(taskId)
        .sort((a, b) => b.lastObservedAt - a.lastObservedAt || a.path.localeCompare(b.path)),
      recallAudit: this.store.listRecallAudit(task.workspaceId, taskId, 20),
    }
  }

  listRecallAudit(taskId: string, limit = 50): RecallAuditRecord[] {
    const task = this.requireTask(taskId)
    return this.store.listRecallAudit(task.workspaceId, taskId, limit)
  }

  async createManual(input: {
    workspaceId: string
    actor: TaskActor
    title: string
    description?: string
    acceptanceCriteria?: string[]
    priority?: ProjectTask['priority']
    parentId?: string
    status?: 'backlog' | 'todo'
  }): Promise<TaskDetails> {
    const parent = input.parentId === undefined ? undefined : this.requireTask(input.parentId)
    if (parent && parent.workspaceId !== input.workspaceId) {
      throw taskError('project-task/invalid-request', 'Parent task belongs to another workspace')
    }
    const task = this.newTask({
      workspaceId: input.workspaceId,
      actor: input.actor,
      title: input.title,
      description: input.description ?? '',
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      priority: input.priority ?? 'normal',
      status: input.status ?? 'todo',
      ...(parent ? { parentId: parent.id, rootId: parent.rootId } : {}),
    })
    await this.store.tasks.put(task.id, task)
    await this.activity(task, input.actor, 'created')
    return this.get(task.id)
  }

  async start(input: StartTaskInput): Promise<TaskDetails> {
    const actor: TaskActor = { type: 'agent', sessionId: input.sessionId }
    if (input.taskId) return await this.claim(input, actor)

    // 待验收任务或未绑定执行会话的任务在同一会话重新进入工作时，接管原任务而不是新建重复任务。
    const bound = this.boundTaskForSession(input.sessionId)
    if (bound && this.isTakeoverCandidate(bound, input.sessionId)) {
      return await this.claim({ ...input, taskId: bound.id, expectedRevision: bound.revision }, actor)
    }

    const title = input.title?.trim() || deriveTaskTitle(input.summary)
    const active = this.activeTaskForSession(input.sessionId)
    if (active) {
      if (active.title === title) {
        // 同一会话、同一标题再次 start：视为对当前任务的幂等重入，不新建重复任务。
        return await this.claim({ ...input, taskId: active.id, expectedRevision: active.revision }, actor)
      }
      // 主题切换：调用方在本会话仍持有一个进行中的主任务时新建了另一个主任务。
      // 先把旧任务交接（暂停）出去，保证一个会话始终只有一个活动主任务；否则旧任务会继续以
      // activeSessionId 占用本会话，把新主任务静默吞并（见会话-任务绑定错乱问题）。
      await this.supersedeActiveTask(active, input.sessionId, title, actor)
    }

    const task = this.newTask({
      workspaceId: input.workspaceId,
      actor,
      title,
      description: input.description ?? '',
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      priority: input.priority ?? 'normal',
      status: 'in_progress',
      activeSessionId: input.sessionId,
    })
    await this.store.tasks.put(task.id, task)
    await this.link(task.id, input.sessionId, 'created', input.eventSeq)
    await this.activity(task, actor, 'started', { toStatus: 'in_progress', detail: input.summary })

    for (const subtask of input.subtasks ?? []) {
      await this.createSubtask(task, subtask, actor)
    }
    await this.writeCheckpoint(task, {
      taskId: task.id,
      sessionId: input.sessionId,
      kind: 'start',
      actor,
      summary: input.summary,
      ...(input.currentState === undefined ? {} : { currentState: input.currentState }),
      decisions: input.decisions ?? [],
      nextSteps: input.nextSteps ?? [],
      ...(input.eventSeq === undefined ? {} : { eventRange: { fromSeq: input.eventSeq, toSeq: input.eventSeq } }),
    }, false)
    return this.get(task.id)
  }

  async update(input: UpdateTaskInput): Promise<TaskDetails> {
    const previous = this.requireTask(input.taskId)
    if (input.actor.type === 'agent' && (input.status === 'done' || input.status === 'cancelled')) {
      throw taskError('project-task/forbidden', 'Agents cannot mark tasks done or cancelled; user action is required')
    }
    if (input.status && input.status !== previous.status && !TRANSITIONS[previous.status].includes(input.status)) {
      throw taskError('project-task/invalid-transition', `Cannot move ${previous.status} task to ${input.status}`, {
        fromStatus: previous.status,
        toStatus: input.status,
      })
    }
    const blockedReason = input.status === 'blocked' ? input.blockedReason ?? previous.blockedReason : input.blockedReason
    const unblockCondition = input.status === 'blocked' ? input.unblockCondition ?? previous.unblockCondition : input.unblockCondition
    if (input.status === 'blocked' && (!blockedReason?.trim() || !unblockCondition?.trim())) {
      throw taskError('project-task/invalid-request', 'Blocked tasks require a reason and an unblock condition')
    }

    const updated = await this.store.tasks.update(input.taskId, current => {
      this.assertRevision(current, input.expectedRevision)
      const status = input.status ?? current.status
      const next: ProjectTask = {
        ...current,
        title: input.title ?? current.title,
        description: input.description ?? current.description,
        acceptanceCriteria: input.acceptanceCriteria ?? current.acceptanceCriteria,
        priority: input.priority ?? current.priority,
        status,
        revision: current.revision + 1,
        updatedAt: this.now(),
        handoffIncomplete: false,
      }
      if (status === 'blocked') {
        next.blockedReason = blockedReason
        next.unblockCondition = unblockCondition
      } else if (input.status && input.status !== 'blocked') {
        delete next.blockedReason
        delete next.unblockCondition
      } else {
        if (input.blockedReason !== undefined) next.blockedReason = input.blockedReason
        if (input.unblockCondition !== undefined) next.unblockCondition = input.unblockCondition
      }
      if (status === 'done') next.completedAt = this.now()
      else if (input.status && current.status === 'done') delete next.completedAt

      if (input.actor.sessionId && status === 'in_progress') {
        this.assertActiveSession(current, input.actor.sessionId)
        next.activeSessionId = input.actor.sessionId
      } else if (input.status && ['paused', 'blocked', 'in_review', 'done', 'cancelled'].includes(status)) {
        delete next.activeSessionId
      }
      return next
    })
    await this.activity(updated, input.actor, input.status ? 'status_changed' : 'updated', {
      fromStatus: previous.status,
      toStatus: updated.status,
      detail: input.detail,
    })
    return this.get(updated.id)
  }

  async addSubtasks(taskId: string, subtasks: readonly SubtaskInput[], actor: TaskActor): Promise<TaskDetails> {
    const parent = this.requireTask(taskId)
    for (const input of subtasks) await this.createSubtask(parent, input, actor)
    return this.get(taskId)
  }

  async checkpoint(input: CheckpointInput, observedArtifacts: readonly ObservedArtifact[] = []): Promise<TaskDetails> {
    const task = this.requireTask(input.taskId)
    const canRefreshRevision = input.expectedRevision !== undefined &&
      task.revision !== input.expectedRevision &&
      task.status === 'in_progress' &&
      task.activeSessionId === input.sessionId
    const effectiveInput = canRefreshRevision
      ? { ...input, expectedRevision: task.revision }
      : input
    await this.writeCheckpoint(task, effectiveInput, true, observedArtifacts)
    return this.get(input.taskId)
  }

  evaluateContext(workspaceId: string, boundTaskId?: string): RecallEvaluation {
    const evaluation = evaluateRecallContext({
      workspaceId,
      ...(boundTaskId ? { boundTaskId, boundTask: this.get(boundTaskId) } : {}),
      tasks: this.store.allTasks(),
      checkpoints: this.store.allCheckpoints(),
      now: this.now(),
      config: this.config.recallGate,
    })
    if (this.config.recallGate.enabled) this.persistRecallAudit(evaluation.audit)
    return evaluation
  }

  context(workspaceId: string, boundTaskId?: string): TaskContextPackage {
    const evaluation = this.evaluateContext(workspaceId, boundTaskId)
    return this.config.recallGate.enabled && this.config.recallGate.mode === 'actual'
      ? evaluation.gatedPackage
      : evaluation.legacyPackage
  }

  private persistRecallAudit(summary: RecallEvaluation['audit']): void {
    void (async () => {
      await this.store.upsertRecallAudit({
        ...summary,
        id: randomUUID(),
        createdAt: this.now(),
      })
      await this.store.pruneRecallAudit(
        summary.workspaceId,
        this.now(),
        this.config.recallGate.auditLimit,
        this.config.recallGate.auditRetentionDays,
      )
    })().catch(error => {
      console.warn('project-task: recall audit write failed', error)
    })
  }

  activeTaskForSession(sessionId: string): ProjectTask | undefined {
    return newestFirst(this.store.allTasks().filter(task =>
      task.activeSessionId === sessionId && task.status === 'in_progress' && !task.parentId,
    ))[0]
  }

  boundTaskForSession(sessionId: string): ProjectTask | undefined {
    // Prefer the task this session is actively executing. A session can accumulate
    // links to several root tasks (handoffs, checkpoints on other tasks); the newest
    // link is not necessarily the task being worked, which made the task tab and the
    // session title disagree with the actual work.
    const active = this.activeTaskForSession(sessionId)
    if (active) return active
    const link = newestFirst(this.store.allLinks().filter(item => item.sessionId === sessionId && !item.taskId.includes(':')))[0]
    if (!link) return undefined
    const task = this.store.tasks.get(link.taskId)
    return task && !task.parentId ? task : undefined
  }

  /**
   * A task bound to this session can be taken over when it is waiting for review
   * (in_review) or when it is in_progress but no session owns it any more (for
   * example the board moved it back to in_progress without an executing session).
   * A task owned by another session, or in done/paused/blocked, must not be stolen.
   */
  private isTakeoverCandidate(task: ProjectTask, sessionId: string): boolean {
    if (task.parentId) return false
    if (task.activeSessionId && task.activeSessionId !== sessionId) return false
    if (task.status === 'in_review') return true
    return task.status === 'in_progress' && !task.activeSessionId
  }

  /**
   * Re-entering a session whose bound task is in_review is treated as "rollback to
   * modify": the task returns to in_progress and is re-bound to this session so the
   * start guard no longer blocks side-effect tools. Idempotent and safe for
   * concurrent callers; returns the (possibly unchanged) task when it can be used.
   */
  async reviveForSession(sessionId: string): Promise<ProjectTask | undefined> {
    const bound = this.boundTaskForSession(sessionId)
    if (!bound) return undefined
    if (bound.status === 'in_progress' && bound.activeSessionId === sessionId) return bound
    if (!this.isTakeoverCandidate(bound, sessionId)) return undefined

    let revived = false
    let fromStatus: TaskStatus = bound.status
    const updated = await this.store.tasks.update(bound.id, current => {
      if (!this.isTakeoverCandidate(current, sessionId)) return current
      fromStatus = current.status
      revived = true
      const next: ProjectTask = {
        ...current,
        status: 'in_progress',
        activeSessionId: sessionId,
        revision: current.revision + 1,
        updatedAt: this.now(),
        handoffIncomplete: false,
      }
      delete next.completedAt
      delete next.blockedReason
      delete next.unblockCondition
      return next
    })
    if (!revived) return undefined
    await this.activity(updated, { type: 'agent', sessionId }, 'resumed', {
      fromStatus,
      toStatus: 'in_progress',
      detail: fromStatus === 'in_review'
        ? '待验收会话重新进入工作，自动回退为进行中（回退修改）。'
        : '会话重新接管未绑定执行会话的任务。',
    })
    return updated
  }

  async interruptSession(sessionId: string, summary: string, eventRange?: { fromSeq: number; toSeq: number }): Promise<void> {
    const task = this.activeTaskForSession(sessionId)
    if (!task) return
    const existing = this.store.allCheckpoints().find(item =>
      item.taskId === task.id && item.sessionId === sessionId && item.eventRange?.toSeq === eventRange?.toSeq &&
      (item.kind === 'finish' || item.kind === 'interrupted'),
    )
    if (existing) return
    await this.checkpoint({
      taskId: task.id,
      sessionId,
      kind: 'interrupted',
      actor: { type: 'agent', sessionId },
      summary,
      currentState: '会话在没有明确收尾 Checkpoint 的情况下结束，交接信息不完整。',
      nextSteps: ['回看上一次会话并继续任务。'],
      ...(eventRange ? { eventRange } : {}),
      status: 'paused',
    })
  }

  private async claim(input: StartTaskInput, actor: TaskActor): Promise<TaskDetails> {
    const current = this.requireTask(input.taskId!)
    if (current.workspaceId !== input.workspaceId) {
      throw taskError('project-task/forbidden', 'Cannot claim a task from another workspace')
    }
    const hasOtherSession = this.store.allLinks().some(link => link.taskId === current.id && link.sessionId !== input.sessionId)
    const updated = await this.store.tasks.update(current.id, task => {
      this.assertActiveSession(task, input.sessionId)
      if (input.expectedRevision !== undefined) this.assertRevision(task, input.expectedRevision)
      const next: ProjectTask = {
        ...task,
        status: 'in_progress',
        activeSessionId: input.sessionId,
        handoffIncomplete: false,
        revision: task.revision + 1,
        updatedAt: this.now(),
      }
      delete next.blockedReason
      delete next.unblockCondition
      delete next.completedAt
      return next
    })
    await this.link(current.id, input.sessionId, hasOtherSession ? 'handoff' : 'executed', input.eventSeq)
    await this.activity(updated, actor, hasOtherSession ? 'handed_off' : 'resumed', { toStatus: 'in_progress' })
    await this.writeCheckpoint(updated, {
      taskId: current.id,
      sessionId: input.sessionId,
      kind: hasOtherSession ? 'handoff' : 'start',
      actor,
      summary: input.summary,
      ...(input.currentState === undefined ? {} : { currentState: input.currentState }),
      decisions: input.decisions ?? [],
      nextSteps: input.nextSteps ?? [],
      ...(input.eventSeq === undefined ? {} : { eventRange: { fromSeq: input.eventSeq, toSeq: input.eventSeq } }),
    }, false)
    return this.get(current.id)
  }

  /**
   * Hand off a task that is still owned by this session but is being replaced by a new
   * main task in the same session (topic switch). Pauses it with a handoff checkpoint
   * and clears activeSessionId so the session keeps exactly one active main task.
   */
  private async supersedeActiveTask(
    task: ProjectTask,
    sessionId: string,
    newTitle: string,
    actor: TaskActor,
  ): Promise<void> {
    await this.writeCheckpoint(task, {
      taskId: task.id,
      sessionId,
      kind: 'handoff',
      actor,
      summary: `在本会话中切换到新的主任务「${newTitle}」，原任务已暂停并保留交接上下文。`,
      status: 'paused',
    }, true)
  }

  private async createSubtask(parent: ProjectTask, input: SubtaskInput, actor: TaskActor): Promise<void> {
    const task = this.newTask({
      workspaceId: parent.workspaceId,
      actor,
      title: input.title,
      description: input.description ?? '',
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      priority: input.priority ?? parent.priority,
      status: 'todo',
      parentId: parent.id,
      rootId: parent.rootId,
    })
    await this.store.tasks.put(task.id, task)
    if (actor.sessionId) await this.link(task.id, actor.sessionId, 'executed')
    await this.activity(task, actor, 'created', { detail: `Subtask of ${parent.id}` })
  }

  private newTask(input: {
    workspaceId: string
    actor: TaskActor
    title: string
    description: string
    acceptanceCriteria: string[]
    priority: ProjectTask['priority']
    status: TaskStatus
    parentId?: string
    rootId?: string
    activeSessionId?: string
  }): ProjectTask {
    const id = randomUUID()
    const timestamp = this.now()
    return {
      id,
      workspaceId: input.workspaceId,
      rootId: input.rootId ?? id,
      title: input.title,
      description: input.description,
      acceptanceCriteria: input.acceptanceCriteria,
      status: input.status,
      priority: input.priority,
      revision: 1,
      handoffIncomplete: false,
      createdBy: input.actor,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.parentId ? { parentId: input.parentId } : {}),
      ...(input.activeSessionId ? { activeSessionId: input.activeSessionId } : {}),
    }
  }

  private async writeCheckpoint(
    task: ProjectTask,
    input: CheckpointInput,
    mutateTask: boolean,
    observedArtifacts: readonly ObservedArtifact[] = [],
  ): Promise<void> {
    const timestamp = this.now()
    const eligibleArtifacts = this.eligibleArtifacts(task, input.sessionId, observedArtifacts)
    const checkpoint: TaskCheckpoint = {
      id: randomUUID(),
      taskId: task.id,
      sessionId: input.sessionId,
      kind: input.kind,
      summary: input.summary,
      decisions: input.decisions ?? [],
      modifiedFiles: [...new Set([...(input.modifiedFiles ?? []), ...eligibleArtifacts.map(item => item.path)])],
      verification: input.verification ?? [],
      openQuestions: input.openQuestions ?? [],
      nextSteps: input.nextSteps ?? [],
      createdAt: timestamp,
      ...(input.lessons?.length ? { lessons: [...input.lessons] } : {}),
      ...(input.procedures?.length ? { procedures: [...input.procedures] } : {}),
      ...(input.currentState === undefined ? {} : { currentState: input.currentState }),
      ...(input.eventRange ? { eventRange: input.eventRange } : {}),
    }
    const writeRecord = async (): Promise<void> => {
      await this.store.checkpoints.put(checkpoint.id, checkpoint)
      await this.link(task.id, input.sessionId, input.kind === 'handoff' ? 'handoff' : 'executed', input.eventRange?.fromSeq, input.eventRange?.toSeq)
    }
    if (!mutateTask) {
      await writeRecord()
      await this.persistArtifacts(task, eligibleArtifacts)
      return
    }

    let fromStatus = task.status
    const updated = await this.store.tasks.update(task.id, current => {
      this.assertActiveSession(current, input.sessionId)
      if (input.expectedRevision !== undefined) this.assertRevision(current, input.expectedRevision)
      fromStatus = current.status
      const status = input.status ?? current.status
      if (status !== current.status && !TRANSITIONS[current.status].includes(status)) {
        throw taskError('project-task/invalid-transition', `Cannot move ${current.status} task to ${status}`)
      }
      if (input.actor.type === 'agent' && status === 'done') {
        throw taskError('project-task/forbidden', 'Agents cannot mark tasks done')
      }
      if (status === 'blocked' && (!input.blockedReason?.trim() || !input.unblockCondition?.trim())) {
        throw taskError('project-task/invalid-request', 'Blocked checkpoints require a reason and an unblock condition')
      }
      const next: ProjectTask = {
        ...current,
        status,
        revision: current.revision + 1,
        updatedAt: timestamp,
        handoffIncomplete: input.kind === 'interrupted',
      }
      if (input.kind === 'finish' || input.kind === 'interrupted' || ['paused', 'blocked', 'in_review'].includes(status)) {
        delete next.activeSessionId
      } else if (status === 'in_progress') {
        next.activeSessionId = input.sessionId
      }
      if (status === 'blocked') {
        next.blockedReason = input.blockedReason
        next.unblockCondition = input.unblockCondition
      } else {
        delete next.blockedReason
        delete next.unblockCondition
      }
      return next
    })
    await writeRecord()
    await this.persistArtifacts(task, eligibleArtifacts)
    await this.activity(updated, input.actor, 'checkpoint', {
      fromStatus,
      toStatus: updated.status,
      detail: `${input.kind}: ${input.summary}`,
    })
  }

  private eligibleArtifacts(
    task: ProjectTask,
    sessionId: string,
    observedArtifacts: readonly ObservedArtifact[],
  ): ObservedArtifact[] {
    if (!observedArtifacts.length) return []
    const link = this.store.links.get(linkKey(task.id, sessionId))
    if (!link) return []
    const seen = new Set<string>()
    return observedArtifacts.filter(item => {
      if (seen.has(item.observationId) || item.observedAt <= link.linkedAt) return false
      const segments = item.path.split('/')
      if (!item.path || item.path.startsWith('/') || segments.some(segment => !segment || segment === '.' || segment === '..')) return false
      seen.add(item.observationId)
      return true
    })
  }

  private async persistArtifacts(task: ProjectTask, artifacts: readonly ObservedArtifact[]): Promise<void> {
    if (!artifacts.length) return
    try {
      await this.store.upsertArtifacts(task.id, task.workspaceId, artifacts)
    } catch (error) {
      console.warn('project-task: artifact ledger write failed', error)
    }
  }

  private async link(
    taskId: string,
    sessionId: string,
    role: TaskSessionRole,
    firstEventSeq?: number,
    lastEventSeq?: number,
  ): Promise<void> {
    const key = linkKey(taskId, sessionId)
    const previous = this.store.links.get(key)
    const link: TaskSessionLink = {
      taskId,
      sessionId,
      role: previous?.role === 'created' ? 'created' : role,
      linkedAt: this.now(),
      ...(firstEventSeq ?? previous?.firstEventSeq) === undefined ? {} : { firstEventSeq: firstEventSeq ?? previous?.firstEventSeq },
      ...(lastEventSeq ?? previous?.lastEventSeq) === undefined ? {} : { lastEventSeq: lastEventSeq ?? previous?.lastEventSeq },
    }
    await this.store.links.put(key, link)
  }

  private async activity(
    task: ProjectTask,
    actor: TaskActor,
    action: string,
    extra: { fromStatus?: TaskStatus; toStatus?: TaskStatus; detail?: string } = {},
  ): Promise<void> {
    const activity: TaskActivity = {
      id: randomUUID(),
      taskId: task.id,
      workspaceId: task.workspaceId,
      actor,
      action,
      createdAt: this.now(),
      ...extra,
    }
    await this.store.activities.put(activity.id, activity)
  }

  private summary(task: ProjectTask): TaskSummary {
    const children = this.store.allTasks().filter(item => item.parentId === task.id)
    const latestCheckpoint = newestFirst(this.store.allCheckpoints().filter(item => item.taskId === task.id))[0]
    const recentSessionId = newestFirst(this.store.allLinks().filter(item => item.taskId === task.id))[0]?.sessionId
    return {
      task,
      childTotal: children.length,
      childDone: children.filter(item => item.status === 'done').length,
      ...(latestCheckpoint ? { latestCheckpoint } : {}),
      ...(recentSessionId ? { recentSessionId } : {}),
    }
  }

  private requireTask(taskId: string): ProjectTask {
    const task = this.store.tasks.get(taskId)
    if (!task) throw taskError('project-task/not-found', `Task ${taskId} does not exist`, { taskId })
    return task
  }

  private assertRevision(task: ProjectTask, expectedRevision: number): void {
    if (task.revision !== expectedRevision) {
      throw taskError('project-task/revision-conflict', 'Task changed since it was read; reload before updating', {
        taskId: task.id,
        expectedRevision,
        actualRevision: task.revision,
      })
    }
  }

  private assertActiveSession(task: ProjectTask, sessionId: string): void {
    if (task.activeSessionId && task.activeSessionId !== sessionId) {
      throw taskError('project-task/active-session-conflict', 'Task is active in another session; hand it off before continuing', {
        taskId: task.id,
        activeSessionId: task.activeSessionId,
        requestingSessionId: sessionId,
      })
    }
  }
}
