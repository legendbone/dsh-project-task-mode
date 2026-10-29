import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'

export interface SessionInfo {
  title: string
  running: boolean
}

export type SessionInfoMap = Record<string, SessionInfo | undefined>

export function sessionLabel(info: SessionInfoMap, sessionId: string): string {
  const title = info[sessionId]?.title?.trim()
  if (title) return title
  const tail = sessionId.startsWith('session-') ? sessionId.slice('session-'.length) : sessionId
  return `会话 ${tail.slice(0, 8)}`
}

export function currentWorkspaceId(
  sessionSnapshot: Pick<SessionListState, 'byId'>,
  workspaces: readonly WorkspaceView[],
): string | undefined {
  const sessionId = Object.values(sessionSnapshot.byId)
    .find(session => (session.retainedBy.mainView ?? 0) > 0)?.id
  if (!sessionId) return undefined
  return workspaces.find(workspace => workspace.sessionIds.includes(sessionId))?.workspaceId
}
