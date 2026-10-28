export const TASK_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'paused',
  'blocked',
  'in_review',
  'done',
  'cancelled',
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = 'low' | 'normal' | 'high'
export type TaskActorType = 'user' | 'agent'
export type TaskSessionRole = 'created' | 'executed' | 'handoff' | 'reviewed'
export type TaskCheckpointKind = 'start' | 'progress' | 'handoff' | 'finish' | 'interrupted'

export interface TaskActor {
  type: TaskActorType
  sessionId?: string
}

export interface ProjectTask {
  id: string
  workspaceId: string
  parentId?: string
  rootId: string
  title: string
  description: string
  acceptanceCriteria: string[]
  status: TaskStatus
  priority: TaskPriority
  revision: number
  blockedReason?: string
  unblockCondition?: string
  activeSessionId?: string
  handoffIncomplete: boolean
  createdBy: TaskActor
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface TaskSessionLink {
  taskId: string
  sessionId: string
  role: TaskSessionRole
  firstEventSeq?: number
  lastEventSeq?: number
  linkedAt: number
}

export interface TaskCheckpoint {
  id: string
  taskId: string
  sessionId: string
  kind: TaskCheckpointKind
  summary: string
  currentState?: string
  decisions: string[]
  modifiedFiles: string[]
  verification: string[]
  openQuestions: string[]
  nextSteps: string[]
  eventRange?: {
    fromSeq: number
    toSeq: number
  }
  createdAt: number
}

export interface TaskActivity {
  id: string
  taskId: string
  workspaceId: string
  actor: TaskActor
  action: string
  fromStatus?: TaskStatus
  toStatus?: TaskStatus
  detail?: string
  createdAt: number
}

export interface SubtaskInput {
  title: string
  description?: string
  acceptanceCriteria?: string[]
  priority?: TaskPriority
}

export interface StartTaskInput {
  workspaceId: string
  sessionId: string
  taskId?: string
  title?: string
  description?: string
  acceptanceCriteria?: string[]
  priority?: TaskPriority
  subtasks?: SubtaskInput[]
  summary: string
  currentState?: string
  decisions?: string[]
  nextSteps?: string[]
  eventSeq?: number
  expectedRevision?: number
}

export interface CreateManualTaskInput {
  workspaceId: string
  title: string
  description?: string
  acceptanceCriteria?: string[]
  priority?: TaskPriority
  parentId?: string
  status?: 'backlog' | 'todo'
}

export type UpdateTaskRequest = Omit<UpdateTaskInput, 'actor'>

export interface UpdateTaskInput {
  taskId: string
  expectedRevision: number
  actor: TaskActor
  title?: string
  description?: string
  acceptanceCriteria?: string[]
  status?: TaskStatus
  priority?: TaskPriority
  blockedReason?: string
  unblockCondition?: string
  detail?: string
}

export interface CheckpointInput {
  taskId: string
  sessionId: string
  kind: TaskCheckpointKind
  actor: TaskActor
  summary: string
  currentState?: string
  decisions?: string[]
  modifiedFiles?: string[]
  verification?: string[]
  openQuestions?: string[]
  nextSteps?: string[]
  eventRange?: {
    fromSeq: number
    toSeq: number
  }
  status?: 'in_progress' | 'paused' | 'blocked' | 'in_review'
  blockedReason?: string
  unblockCondition?: string
  expectedRevision?: number
}

export interface TaskQuery {
  workspaceId: string
  statuses?: TaskStatus[]
  keyword?: string
  parentId?: string
  rootId?: string
  limit?: number
  offset?: number
}

export interface TaskSummary {
  task: ProjectTask
  childTotal: number
  childDone: number
  latestCheckpoint?: TaskCheckpoint
  recentSessionId?: string
}

export interface TaskListResult {
  items: TaskSummary[]
  total: number
}

export interface TaskDetails {
  task: ProjectTask
  children: ProjectTask[]
  checkpoints: TaskCheckpoint[]
  sessions: TaskSessionLink[]
  activities: TaskActivity[]
}

export interface TaskContextItem {
  taskId: string
  title: string
  status: TaskStatus
  summary: string
}

export interface TaskContextPackage {
  workspaceId: string
  inProgress: TaskContextItem[]
  blocked: TaskContextItem[]
  recentHandoffs: TaskContextItem[]
  boundTask?: TaskDetails
}

export interface ContinueTaskInput {
  taskId: string
  expectedRevision: number
}

export interface ContinueTaskResult {
  taskId: string
  sessionId: string
  presetId: 'project-task'
}
