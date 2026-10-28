import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'project-task/not-found': Record<string, unknown>
    'project-task/workspace-not-found': Record<string, unknown>
    'project-task/revision-conflict': Record<string, unknown>
    'project-task/active-session-conflict': Record<string, unknown>
    'project-task/invalid-transition': Record<string, unknown>
    'project-task/forbidden': Record<string, unknown>
    'project-task/invalid-request': Record<string, unknown>
  }
}

export type ProjectTaskErrorCode =
  | 'project-task/not-found'
  | 'project-task/workspace-not-found'
  | 'project-task/revision-conflict'
  | 'project-task/active-session-conflict'
  | 'project-task/invalid-transition'
  | 'project-task/forbidden'
  | 'project-task/invalid-request'

export function taskError(
  code: ProjectTaskErrorCode,
  message: string,
  details: Record<string, unknown> = {},
): RemoteError {
  return new RemoteError(code, message, details)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
