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
