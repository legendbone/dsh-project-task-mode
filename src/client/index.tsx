import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult, TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { ProjectTaskActions } from './actions.ts'
import { ProjectTaskBoard } from './board.tsx'
import { PROJECT_TASK_REMOTE } from './remote.ts'
import { adoptProjectTaskStyles } from './styles.ts'

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    projectTaskDraft: unknown
  }
}

export const inject = ['slots', 'remote', 'uiWorkspace', 'sessions', 'conversation']

async function unwrap<T>(result: Promise<RemoteResult<T>>): Promise<T> {
  const resolved = await result
  if (!resolved.ok) throw resolved.error
  return resolved.value
}

export function apply(ctx: ClientContext): void {
  adoptProjectTaskStyles()
  let remote: TypertRemoteNamespaceMap['projectTasks'] | undefined

  ctx.effect(async () => {
    const dispose = await ctx.remote.$mount(PROJECT_TASK_REMOTE)
    remote = (ctx.reflect as unknown as { get(name: string): unknown }).get('remote.projectTasks') as
      TypertRemoteNamespaceMap['projectTasks'] | undefined
    if (!remote) throw new Error('项目任务 Remote namespace 挂载失败')
    return () => {
      remote = undefined
      void dispose()
    }
  }, 'dsh-project-task-mode: remote')

  function namespace(): TypertRemoteNamespaceMap['projectTasks'] {
    if (!remote) throw new Error('项目任务 Remote 尚未连接，请稍后重试')
    return remote
  }

  function openTaskSession(sessionId: string, prompt: string): void {
    // The host `SessionStore` augmentation shadows the Client `ISessions` face in
    // this shared type program; in the browser `sessions` is always the Client one.
    const sessions = ctx.sessions as unknown as ISessions
    let reference: SessionReference | undefined
    try {
      reference = sessions.retain(sessionId as SessionId, { source: 'projectTaskDraft' })
      ctx.conversation.input.requestDraftInitialization(reference.binding, {
        prompt,
        whenDraftExists: 'replace',
      })
    } catch (error) {
      // Prefilling is a convenience; opening the session must still work.
      console.warn('项目任务预输入失败，改为打开空输入框：', error)
    }
    try {
      ctx.uiWorkspace.openSession(sessionId as SessionId)
    } finally {
      reference?.release()
    }
  }

  const actions: ProjectTaskActions = {
    list: query => unwrap(namespace().list(query)),
    get: taskId => unwrap(namespace().get(taskId)),
    create: input => unwrap(namespace().create(input)),
    update: input => unwrap(namespace().update(input)),
    continueTask: input => unwrap(namespace().continue(input)),
    openSession: sessionId => ctx.uiWorkspace.openSession(sessionId as SessionId),
    openTaskSession,
  }

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: 'project-tasks' as MainPanelId,
    inject: () => ({ actions }),
  }, props => <ProjectTaskBoard {...props} actions={actions} />))

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: 'project-tasks' as MainPanelId,
    order: 15,
    label: () => '项目任务',
  }, () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M9 4.5v15M15 4.5v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>))
}
