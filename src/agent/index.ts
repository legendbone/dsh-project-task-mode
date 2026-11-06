import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'
import { ArtifactCollector, registerArtifactCollector } from './artifacts.ts'
import { registerTaskStartGuard } from './guard.ts'
import { registerTaskLifecycle } from './lifecycle.ts'
import { registerProjectTaskPrompt } from './prompt.ts'
import { registerTaskRecall } from './recall.ts'
import { registerProjectTaskTools } from './tools.ts'
import { DEFAULT_AGENT_CONFIG, agentConfigSchema, type AgentConfig } from '../shared/config.ts'

export const name = 'dsh-project-task-mode-agent'
export const inject = ['projectTaskController', 'tools', 'systemPrompt']
export const Config = agentConfigSchema

export function apply(ctx: Context, config: AgentConfig = DEFAULT_AGENT_CONFIG): void {
  const controller = ctx.projectTaskController
  const collector = new ArtifactCollector(
    config.artifacts.maxObservations,
    Date.now,
    message => ctx.logger.warn(message),
  )
  registerProjectTaskPrompt(ctx)
  if (config.artifacts.enabled) registerArtifactCollector(ctx, collector)
  registerProjectTaskTools(ctx, controller, collector)
  registerTaskRecall(ctx, controller, config.autoContext)
  registerTaskStartGuard(ctx, controller)
  registerTaskLifecycle(ctx, controller)
}
