import type {
  ContinueTaskInput,
  ContinueTaskResult,
  CreateManualTaskInput,
  TaskDetails,
  TaskListResult,
  TaskQuery,
  UpdateTaskRequest,
} from '../shared/types.ts'

export interface ProjectTaskActions {
  list(query: TaskQuery): Promise<TaskListResult>
  get(taskId: string): Promise<TaskDetails>
  create(input: CreateManualTaskInput): Promise<TaskDetails>
  update(input: UpdateTaskRequest): Promise<TaskDetails>
  continueTask(input: ContinueTaskInput): Promise<ContinueTaskResult>
  openSession(sessionId: string): void
  openTaskSession(sessionId: string, prompt: string): void
}
