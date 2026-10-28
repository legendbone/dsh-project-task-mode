import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import { PROJECT_TASK_INVOCATIONS } from '../shared/contract.ts'

export const TYPERT_MANIFEST: TypertContribution = {
  package: 'dsh-project-task-mode',
  face: 'host',
  schemas: [],
  model: {
    services: [{
      key: 'projectTaskController',
      exportName: 'ProjectTaskController',
      description: 'Workspace-scoped project task service.',
      tags: [],
      members: [
        { kind: 'method', name: 'list', signature: 'list(query: TaskQuery): Promise<TaskListResult>' },
        { kind: 'method', name: 'get', signature: 'get(taskId: string): Promise<TaskDetails>' },
        { kind: 'method', name: 'context', signature: 'context(workspaceId: string, boundTaskId?: string): Promise<TaskContextPackage>' },
        { kind: 'method', name: 'create', signature: 'create(input: CreateManualTaskInput): Promise<TaskDetails>' },
        { kind: 'method', name: 'update', signature: 'update(input: UpdateTaskRequest): Promise<TaskDetails>' },
        { kind: 'method', name: 'continue', signature: 'continue(input: ContinueTaskInput): Promise<ContinueTaskResult>' },
      ],
      types: [],
    }],
    events: [],
    objects: [],
  },
  invocations: PROJECT_TASK_INVOCATIONS,
}
