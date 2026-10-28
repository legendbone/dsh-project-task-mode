import type { Context } from '@deepseek-ai/cordis'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import {
  projectTaskSchema,
  taskActivitySchema,
  taskCheckpointSchema,
  taskSessionLinkSchema,
} from '../shared/schemas.ts'
import type { ProjectTask, TaskActivity, TaskCheckpoint, TaskSessionLink } from '../shared/types.ts'

export const PROJECT_TASK_DOMAIN = defineDomain({
  name: 'project_tasks',
  version: 1,
  layout: 'per-record',
  tables: {
    tasks: domainTable<string, ProjectTask>(projectTaskSchema),
    checkpoints: domainTable<string, TaskCheckpoint>(taskCheckpointSchema),
    task_session_links: domainTable<string, TaskSessionLink>(taskSessionLinkSchema),
    activities: domainTable<string, TaskActivity>(taskActivitySchema),
  },
})

export type ProjectTaskDomain = Domain<typeof PROJECT_TASK_DOMAIN>

export class ProjectTaskStore {
  private constructor(readonly domain: ProjectTaskDomain) {}

  static async open(ctx: Context): Promise<ProjectTaskStore> {
    return new ProjectTaskStore(await ctx.storageDomain.open(PROJECT_TASK_DOMAIN))
  }

  get tasks() {
    return this.domain.table('tasks')
  }

  get checkpoints() {
    return this.domain.table('checkpoints')
  }

  get links() {
    return this.domain.table('task_session_links')
  }

  get activities() {
    return this.domain.table('activities')
  }

  allTasks(): ProjectTask[] {
    return [...this.tasks.entries()].map(([, value]) => value)
  }

  allCheckpoints(): TaskCheckpoint[] {
    return [...this.checkpoints.entries()].map(([, value]) => value)
  }

  allLinks(): TaskSessionLink[] {
    return [...this.links.entries()].map(([, value]) => value)
  }

  allActivities(): TaskActivity[] {
    return [...this.activities.entries()].map(([, value]) => value)
  }

  close(): Promise<void> {
    return this.domain.close()
  }
}

export function linkKey(taskId: string, sessionId: string): string {
  return `${taskId}-${Buffer.from(sessionId).toString('base64url')}`
}
