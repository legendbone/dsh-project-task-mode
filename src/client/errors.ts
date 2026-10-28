const TASK_ERROR_MESSAGES: Record<string, string> = {
  'project-task/not-found': '任务不存在，可能已被移除。',
  'project-task/workspace-not-found': '当前目录还没有注册为工作区。',
  'project-task/revision-conflict': '任务刚刚在别处更新过，已为你刷新最新内容，请重试。',
  'project-task/active-session-conflict': '任务正在另一个会话中执行，请先在那边的会话里交接或结束。',
  'project-task/invalid-transition': '当前状态不能直接切换到这个状态。',
  'project-task/forbidden': '这个操作需要由你在看板上确认。',
  'project-task/invalid-request': '提交的内容不完整，请检查后重试。',
}

export function formatTaskError(cause: unknown): string {
  if (typeof cause === 'object' && cause !== null) {
    const record = cause as { code?: unknown; message?: unknown }
    if (typeof record.code === 'string' && TASK_ERROR_MESSAGES[record.code]) {
      return TASK_ERROR_MESSAGES[record.code]!
    }
  }
  if (cause instanceof Error && cause.message.trim()) return cause.message
  return String(cause)
}

export function isRevisionConflict(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && (cause as { code?: unknown }).code === 'project-task/revision-conflict'
}
