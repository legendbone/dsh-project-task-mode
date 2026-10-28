import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-typert-registry'
import type {} from '@deepseek-ai/dsh-workspace'
import { ProjectTaskController } from './host/remote.ts'
import { ProjectTaskService } from './host/service.ts'
import { ProjectTaskStore } from './host/store.ts'
import { TYPERT_MANIFEST } from './host/typert.ts'

export const name = 'dsh-project-task-mode'
export const inject = ['storageDomain', 'workspaceRegistry', 'sessionController', 'agents', 'typert']

export async function apply(ctx: Context): Promise<void> {
  const store = await ProjectTaskStore.open(ctx)
  const service = new ProjectTaskService(store)
  new ProjectTaskController(ctx, service)

  ctx.effect(() => {
    const dispose = ctx.typert.register(TYPERT_MANIFEST)
    return () => { void dispose() }
  }, 'dsh-project-task-mode: typert manifest')
  ctx.effect(() => () => store.close(), 'dsh-project-task-mode: storage')
}
