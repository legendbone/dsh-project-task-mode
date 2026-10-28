import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'
import { registerTaskStartGuard } from './guard.ts'
import { registerTaskLifecycle } from './lifecycle.ts'
import { registerProjectTaskPrompt } from './prompt.ts'
import { registerTaskRecall } from './recall.ts'
import { registerProjectTaskTools } from './tools.ts'

export const name = 'dsh-project-task-mode-agent'
export const inject = ['projectTaskController', 'tools', 'systemPrompt']

export function apply(ctx: Context): void {
  const controller = ctx.projectTaskController
  registerProjectTaskPrompt(ctx)
  registerProjectTaskTools(ctx, controller)
  registerTaskRecall(ctx, controller)
  registerTaskStartGuard(ctx, controller)
  registerTaskLifecycle(ctx, controller)
}
