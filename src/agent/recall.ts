import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { TaskContextPackage } from '../shared/types.ts'
import type { ProjectTaskController } from '../host/remote.ts'
import { errorMessage } from '../shared/errors.ts'
import { formatTaskContext } from '../shared/recall-format.ts'

export { formatTaskContext } from '../shared/recall-format.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'project-task': {
      kind: 'project-task'
      form: 'recall'
    }
  }
}

export function injectTaskContext(agent: {
  inject(message: ReturnType<typeof createUserMessage>): void
}, context: TaskContextPackage): void {
  const text = formatTaskContext(context)
  if (!text) return
  agent.inject(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'project-task', form: 'recall' },
  }))
}

export function registerTaskRecall(
  ctx: Context,
  controller: ProjectTaskController,
  autoContext = true,
): void {
  if (!autoContext) return
  ctx.on('agent/created', async ({ agent }) => {
    try {
      const evaluation = await controller.contextEvaluationForSession(agent.session)
      injectTaskContext(agent, evaluation.audit.mode === 'actual' ? evaluation.gatedPackage : evaluation.legacyPackage)
    } catch (error) {
      ctx.logger.warn(`project-task recall failed: ${errorMessage(error)}`)
    }
    return undefined
  })
}
