import type {
  RemoteResult,
  TypertRemoteContribution,
} from '@deepseek-ai/dsh-typert-protocol'
import type {
  ContinueTaskInput,
  ContinueTaskResult,
  CreateManualTaskInput,
  TaskContextPackage,
  TaskDetails,
  TaskListResult,
  TaskQuery,
  UpdateTaskRequest,
} from '../shared/types.ts'
import { PROJECT_TASK_INVOCATIONS } from '../shared/contract.ts'

export const PROJECT_TASK_REMOTE: TypertRemoteContribution = {
  package: 'dsh-project-task-mode',
  descriptors: PROJECT_TASK_INVOCATIONS,
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$70726f6a6563745461736b73 {
    list: (query: TaskQuery) => Promise<RemoteResult<TaskListResult>>
    get: (taskId: string) => Promise<RemoteResult<TaskDetails>>
    context: (workspaceId: string, boundTaskId?: string) => Promise<RemoteResult<TaskContextPackage>>
    create: (input: CreateManualTaskInput) => Promise<RemoteResult<TaskDetails>>
    update: (input: UpdateTaskRequest) => Promise<RemoteResult<TaskDetails>>
    continue: (input: ContinueTaskInput) => Promise<RemoteResult<ContinueTaskResult>>
  }

  interface TypertRemoteMap {
    'projectTasks/list': TypertRemoteNamespace$70726f6a6563745461736b73['list']
    'projectTasks/get': TypertRemoteNamespace$70726f6a6563745461736b73['get']
    'projectTasks/context': TypertRemoteNamespace$70726f6a6563745461736b73['context']
    'projectTasks/create': TypertRemoteNamespace$70726f6a6563745461736b73['create']
    'projectTasks/update': TypertRemoteNamespace$70726f6a6563745461736b73['update']
    'projectTasks/continue': TypertRemoteNamespace$70726f6a6563745461736b73['continue']
  }

  interface TypertRemoteNamespaceMap {
    projectTasks: TypertRemoteNamespace$70726f6a6563745461736b73
  }
}
