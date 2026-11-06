import type { TaskContextItem, TaskContextPackage, TaskDetails } from './types.ts'

function itemLines(title: string, items: TaskContextItem[]): string[] {
  if (!items.length) return []
  return [title, ...items.map(item => formatTaskContextItem(item))]
}

export function formatTaskContextItem(item: TaskContextItem): string {
  return `- [${item.status}] ${item.title} (${item.taskId})${item.summary ? `\n  ${item.summary}` : ''}`
}

function boundLines(details: TaskDetails): string[] {
  const latest = details.checkpoints[0]
  const unfinished = details.children.filter(task => !['done', 'cancelled'].includes(task.status))
  return [
    `绑定任务：${details.task.title} (${details.task.id})`,
    `目标：${details.task.description || '未填写'}`,
    `验收标准：${details.task.acceptanceCriteria.join('；') || '未填写'}`,
    `未完成子任务：${unfinished.map(task => `${task.title} (${task.id}, ${task.status})`).join('；') || '无'}`,
    ...(latest ? [
      `最近 Checkpoint [${latest.kind}]：${latest.summary}`,
      `关键决策：${latest.decisions.join('；') || '无'}`,
      `开放问题：${latest.openQuestions.join('；') || '无'}`,
      `下一步：${latest.nextSteps.join('；') || '无'}`,
      `可回查 Session：${latest.sessionId}${latest.eventRange ? `，事件 ${latest.eventRange.fromSeq}-${latest.eventRange.toSeq}` : ''}`,
    ] : []),
  ]
}

export function formatTaskContextBody(context: TaskContextPackage): string {
  return [
    ...itemLines('进行中的任务：', context.inProgress),
    ...itemLines('阻塞任务：', context.blocked),
    ...itemLines('最近交接：', context.recentHandoffs),
  ].join('\n')
}

export function formatTaskContext(context: TaskContextPackage): string {
  const lines = [
    '以下是当前工作区的项目任务召回，仅包含有限摘要；需要完整历史时调用 project_task_get。',
    ...itemLines('进行中的任务：', context.inProgress),
    ...itemLines('阻塞任务：', context.blocked),
    ...itemLines('最近交接：', context.recentHandoffs),
    ...(context.boundTask ? boundLines(context.boundTask) : []),
  ]
  return lines.length > 1 ? lines.join('\n') : ''
}
