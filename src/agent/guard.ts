import type { Context } from '@deepseek-ai/cordis'
import type { ProjectTaskController } from '../host/remote.ts'

const SIDE_EFFECT_TOOL = /^(bash|pwsh|terminal|write|edit|apply_patch|str_replace|multi_edit|delete|move|mkdir|workflow|subagent)/i

export function registerTaskStartGuard(ctx: Context, controller: ProjectTaskController): void {
  ctx.on('tools/pre-execute', async (exec, next) => {
    const session = exec.agent?.session
    if (!session || !SIDE_EFFECT_TOOL.test(exec.name)) return next()
    if (controller.activeTaskForSession(session.id)) return next()
    return {
      kind: 'deny',
      reason: '项目任务模式要求先调用 project_task_start，并在开始 Checkpoint 持久化后再执行有副作用的操作。',
    }
  })
}
