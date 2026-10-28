import type { TaskCheckpointKind, TaskPriority, TaskSessionRole, TaskStatus } from '../shared/types.ts'

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: '待规划',
  todo: '待处理',
  in_progress: '进行中',
  paused: '已暂停',
  blocked: '已阻塞',
  in_review: '待验收',
  done: '已完成',
  cancelled: '已取消',
}

export const STATUS_HINTS: Record<TaskStatus, string> = {
  backlog: '已记录，暂未安排',
  todo: '可以开始执行',
  in_progress: '正在执行中',
  paused: '保留了交接上下文',
  blocked: '等待解除阻塞',
  in_review: '等待你验收',
  done: '已通过验收',
  cancelled: '不再执行',
}

export const PRIMARY_COLUMNS: readonly TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done']

/** Mirrors the Host transition table so the board only offers reachable states. */
export const STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  backlog: ['todo', 'cancelled'],
  todo: ['backlog', 'in_progress', 'cancelled'],
  in_progress: ['paused', 'blocked', 'in_review', 'cancelled'],
  paused: ['todo', 'in_progress', 'blocked', 'cancelled'],
  blocked: ['todo', 'in_progress', 'cancelled'],
  in_review: ['in_progress', 'done', 'cancelled'],
  done: ['in_progress'],
  cancelled: ['backlog', 'todo'],
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: '低优先级',
  normal: '普通优先级',
  high: '高优先级',
}

export const PRIORITY_SHORT: Record<TaskPriority, string> = {
  low: '低',
  normal: '普通',
  high: '高',
}

export const CHECKPOINT_LABELS: Record<TaskCheckpointKind, string> = {
  start: '开始',
  progress: '进展',
  handoff: '交接',
  finish: '收尾',
  interrupted: '中断',
}

export const SESSION_ROLE_LABELS: Record<TaskSessionRole, string> = {
  created: '创建任务',
  executed: '执行任务',
  handoff: '接续任务',
  reviewed: '验收任务',
}

const ACTIVITY_LABELS: Record<string, string> = {
  created: '创建任务',
  started: '开始任务',
  resumed: '继续任务',
  handed_off: '交接任务',
  status_changed: '更新状态',
  updated: '更新任务',
  checkpoint: '记录进展',
}

export function activityLabel(action: string): string {
  return ACTIVITY_LABELS[action] ?? action
}

export function emptyColumnCopy(status: TaskStatus): string {
  switch (status) {
    case 'backlog':
      return '还没安排的任务会放在这里'
    case 'todo':
      return '暂无待处理任务'
    case 'in_progress':
      return '任务开启后会出现在这里'
    case 'in_review':
      return 'Agent 完成后会在这里等你验收'
    case 'done':
      return '已验收的任务会沉淀在这里'
    case 'paused':
      return '暂停的任务会保留交接上下文'
    case 'blocked':
      return '被依赖或信息卡住的任务会在这里提醒你'
    case 'cancelled':
      return '取消的任务仍可重新开启'
  }
}
