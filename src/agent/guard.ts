import type { Context } from '@deepseek-ai/cordis'
import type { ProjectTaskController } from '../host/remote.ts'
import { analyzeReadOnlyBashExecution } from './shell.ts'

const SIDE_EFFECT_TOOL = /^(bash|pwsh|terminal|write|edit|apply_patch|str_replace|multi_edit|delete|move|mkdir|workflow|subagent)/i
const TASK_START_REQUIRED = '项目任务模式要求先调用 project_task_start，并在开始 Checkpoint 持久化后再执行有副作用的操作。'

export function registerTaskStartGuard(ctx: Context, controller: ProjectTaskController): void {
  ctx.on('tools/pre-execute', async (exec, next) => {
    const session = exec.agent?.session
    if (!session || !SIDE_EFFECT_TOOL.test(exec.name)) return next()
    if (controller.activeTaskForSession(session.id)) return next()
    const bashAnalysis = /^bash$/i.test(exec.name)
      ? analyzeReadOnlyBashExecution(exec.arguments)
      : undefined
    if (bashAnalysis?.allowed) return next()
    // 待验收任务所属会话再次进入工作：视为“回退修改”，自动回到进行中并绑定该会话。
    if (await controller.reviveForSession(session.id)) return next()
    return {
      kind: 'deny',
      reason: TASK_START_REQUIRED + (bashAnalysis?.reason ? `\n只读豁免未通过：${bashAnalysis.reason}` : ''),
    }
  })
}
