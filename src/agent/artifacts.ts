import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { ArtifactChangeKind, ObservedArtifact } from '../shared/types.ts'

const OBSERVED_TOOLS = new Set(['write', 'edit', 'apply_patch', 'str_replace', 'multi_edit', 'delete', 'move'])

type ToolArguments = Record<string, unknown>

function stringField(args: ToolArguments, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = args[name]
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

function workspacePath(root: string, candidate: string): string | undefined {
  const absolute = path.resolve(root, candidate)
  const relative = path.relative(root, absolute)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return undefined
  return relative.split(path.sep).join('/')
}

export interface ArtifactSnapshot {
  observations: ObservedArtifact[]
  truncated: boolean
}

export class ArtifactCollector {
  private readonly sessions = new Map<string, Map<string, ObservedArtifact>>()
  private readonly truncatedSessions = new Set<string>()

  constructor(
    private readonly maxObservations = 500,
    private readonly now: () => number = Date.now,
    private readonly warn: (message: string) => void = () => {},
  ) {}

  observe(exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): void {
    const session = exec.agent?.session
    const workspaceRoot = session?.header.cwd
    if (result.isError || !session || !workspaceRoot || !OBSERVED_TOOLS.has(exec.name)) return
    if (!exec.arguments || typeof exec.arguments !== 'object' || Array.isArray(exec.arguments)) return
    const args = exec.arguments as ToolArguments
    const changes: { path: string; changeKind: ArtifactChangeKind }[] = []
    const filePath = stringField(args, ['file_path', 'filePath', 'path'])
    if (filePath) {
      const meta = result.meta && typeof result.meta === 'object' && !Array.isArray(result.meta)
        ? result.meta as { created?: unknown }
        : undefined
      changes.push({
        path: filePath,
        changeKind: exec.name === 'delete'
          ? 'deleted'
          : exec.name === 'write' && meta?.created === true ? 'created' : 'modified',
      })
    }
    if (exec.name === 'multi_edit' && Array.isArray(args.edits)) {
      for (const edit of args.edits) {
        if (!edit || typeof edit !== 'object' || Array.isArray(edit)) continue
        const editPath = stringField(edit as ToolArguments, ['file_path', 'filePath', 'path'])
        if (editPath) changes.push({ path: editPath, changeKind: 'modified' })
      }
    }
    if (exec.name === 'move') {
      const oldPath = stringField(args, ['old_path', 'oldPath', 'source', 'source_path'])
      const newPath = stringField(args, ['new_path', 'newPath', 'destination', 'destination_path'])
      if (oldPath) changes.push({ path: oldPath, changeKind: 'deleted' })
      if (newPath) changes.push({ path: newPath, changeKind: 'renamed' })
    }
    if (exec.name === 'apply_patch' && typeof args.patch === 'string') {
      const patch = args.patch
      for (const match of patch.matchAll(/^\*\*\* (Add|Update|Delete|Move) File:\s*(.+)$/gm)) {
        const operation = match[1]
        const file = match[2]?.trim()
        if (!file) continue
        changes.push({
          path: file,
          changeKind: operation === 'Add' ? 'created' : operation === 'Delete' || operation === 'Move' ? 'deleted' : 'modified',
        })
        if (operation === 'Move') {
          const moveTarget = patch.slice((match.index ?? 0) + match[0].length).match(/^\*\*\* Move to:\s*(.+)$/m)?.[1]?.trim()
          if (moveTarget) changes.push({ path: moveTarget, changeKind: 'renamed' })
        }
      }
    }
    if (!changes.length) {
      this.warn(`project-task artifact observer: no known file path for ${exec.name}`)
      return
    }

    const sessionId = session.id
    const observations = this.sessions.get(sessionId) ?? new Map<string, ObservedArtifact>()
    this.sessions.set(sessionId, observations)
    const uniqueChanges = [...new Map(changes.map(change => [`${change.path}\0${change.changeKind}`, change])).values()]
    for (const [index, change] of uniqueChanges.entries()) {
      const normalized = workspacePath(workspaceRoot, change.path)
      if (!normalized) {
        this.warn(`project-task artifact observer: skipped path outside workspace: ${change.path}`)
        continue
      }
      const observationId = `${String(exec.callId)}:${index}`
      if (observations.has(observationId)) continue
      if (observations.size >= this.maxObservations) {
        if (!this.truncatedSessions.has(sessionId)) {
          this.warn(`project-task artifact observer: session ${sessionId} reached ${this.maxObservations} observations`)
        }
        this.truncatedSessions.add(sessionId)
        continue
      }
      observations.set(observationId, {
        observationId,
        path: normalized,
        changeKind: change.changeKind,
        toolName: exec.name,
        observedAt: this.now(),
      })
    }
  }

  peek(sessionId: string): ArtifactSnapshot {
    return {
      observations: [...(this.sessions.get(sessionId)?.values() ?? [])]
        .sort((a, b) => a.observedAt - b.observedAt || a.observationId.localeCompare(b.observationId)),
      truncated: this.truncatedSessions.has(sessionId),
    }
  }

  ack(sessionId: string, observationIds: readonly string[]): void {
    const observations = this.sessions.get(sessionId)
    if (!observations) return
    for (const id of observationIds) observations.delete(id)
    if (!observations.size) {
      this.sessions.delete(sessionId)
      this.truncatedSessions.delete(sessionId)
    }
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId)
    this.truncatedSessions.delete(sessionId)
  }
}

export function registerArtifactCollector(ctx: Context, collector: ArtifactCollector): void {
  ctx.on('tools/result', (exec, result) => {
    collector.observe(exec, result)
  })
  ctx.on('agent/disposed', ({ agent }) => collector.clear(agent.session.id))
}
