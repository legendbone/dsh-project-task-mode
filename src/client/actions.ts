import type {
  ContinueTaskInput,
  ContinueTaskResult,
  CreateManualTaskInput,
  RecallAuditRecord,
  TaskDetails,
  TaskListResult,
  TaskQuery,
  UpdateTaskRequest,
} from '../shared/types.ts'

export interface ProjectTaskActions {
  list(query: TaskQuery): Promise<TaskListResult>
  get(taskId: string): Promise<TaskDetails>
  recallAudit(taskId: string, limit?: number): Promise<RecallAuditRecord[]>
  create(input: CreateManualTaskInput): Promise<TaskDetails>
  update(input: UpdateTaskRequest): Promise<TaskDetails>
  continueTask(input: ContinueTaskInput): Promise<ContinueTaskResult>
  openSession(sessionId: string): void
  openTaskSession(sessionId: string, prompt: string): void
}
