import type { Context } from '@deepseek-ai/cordis'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import {
  projectTaskSchema,
  recallAuditSchema,
  taskActivitySchema,
  taskArtifactSchema,
  taskCheckpointSchema,
  taskInsightSchema,
  taskSessionLinkSchema,
} from '../shared/schemas.ts'
import type {
  ObservedArtifact,
  ProjectTask,
  RecallAuditRecord,
  TaskActivity,
  TaskArtifactRecord,
  TaskCheckpoint,
  TaskInsightRecord,
  TaskSessionLink,
} from '../shared/types.ts'

export const PROJECT_TASK_DOMAIN = defineDomain({
  name: 'project_tasks',
  version: 2,
  compatibleVersions: [1],
  layout: 'per-record',
  tables: {
    tasks: domainTable<string, ProjectTask>(projectTaskSchema),
    checkpoints: domainTable<string, TaskCheckpoint>(taskCheckpointSchema),
    task_session_links: domainTable<string, TaskSessionLink>(taskSessionLinkSchema),
    activities: domainTable<string, TaskActivity>(taskActivitySchema),
    task_artifacts: domainTable<string, TaskArtifactRecord>(taskArtifactSchema),
    task_insights: domainTable<string, TaskInsightRecord>(taskInsightSchema),
    recall_audit: domainTable<string, RecallAuditRecord>(recallAuditSchema),
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

  get artifacts() {
    return this.domain.table('task_artifacts')
  }

  get insights() {
    return this.domain.table('task_insights')
  }

  get recallAudit() {
    return this.domain.table('recall_audit')
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

  allArtifacts(): TaskArtifactRecord[] {
    return [...this.artifacts.entries()].map(([, value]) => value)
  }

  allInsights(): TaskInsightRecord[] {
    return [...this.insights.entries()].map(([, value]) => value)
  }

  allRecallAudit(): RecallAuditRecord[] {
    return [...this.recallAudit.entries()].map(([, value]) => value)
  }

  listArtifacts(taskId: string, limit = 100): TaskArtifactRecord[] {
    return this.allArtifacts()
      .filter(item => item.taskId === taskId)
      .sort((a, b) => b.lastObservedAt - a.lastObservedAt || a.path.localeCompare(b.path))
      .slice(0, limit)
  }

  async upsertArtifacts(taskId: string, workspaceId: string, observations: readonly ObservedArtifact[]): Promise<void> {
    for (const observation of observations) {
      const key = artifactKey(taskId, observation.path)
      const existing = this.artifacts.get(key)
      await this.artifacts.put(key, {
        ...observation,
        ...(existing && existing.lastObservedAt > observation.observedAt ? {
          observationId: existing.observationId,
          changeKind: existing.changeKind,
          toolName: existing.toolName,
        } : {}),
        taskId,
        workspaceId,
        source: 'tool-observer',
        firstObservedAt: existing ? Math.min(existing.firstObservedAt, observation.observedAt) : observation.observedAt,
        lastObservedAt: existing ? Math.max(existing.lastObservedAt, observation.observedAt) : observation.observedAt,
      })
    }
  }

  listRecallAudit(workspaceId: string, taskId?: string, limit = 20): RecallAuditRecord[] {
    return this.allRecallAudit()
      .filter(item => item.workspaceId === workspaceId)
      .filter(item => !taskId || item.boundTaskId === taskId || item.boundTaskId === undefined)
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      .slice(0, limit)
  }

  async upsertRecallAudit(record: RecallAuditRecord): Promise<void> {
    await this.recallAudit.put(record.id, record)
  }

  async pruneRecallAudit(workspaceId: string, now: number, limit: number, retentionDays: number): Promise<void> {
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1000
    const records = this.allRecallAudit()
      .filter(item => item.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
    for (const [index, record] of records.entries()) {
      if (index < limit && record.createdAt >= cutoff) continue
      await this.recallAudit.delete(record.id)
    }
  }

  close(): Promise<void> {
    return this.domain.close()
  }
}

export function linkKey(taskId: string, sessionId: string): string {
  return `${taskId}-${Buffer.from(sessionId).toString('base64url')}`
}

/**
 * Per-record storage keys must match /^[a-zA-Z0-9_-]+$/ (see the json backend's
 * assertSafeKey). base64url output is already [A-Za-z0-9_-]; the task id is a
 * UUID (hex + dashes). Never use ':' or path separators here — doing so makes
 * putRecord throw and the artifact ledger silently drop every write.
 */
export function artifactKey(taskId: string, path: string): string {
  return `${taskId}_${Buffer.from(path).toString('base64url')}`
}
