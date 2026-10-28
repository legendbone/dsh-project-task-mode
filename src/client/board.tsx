import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  TASK_STATUSES,
  type TaskDetails,
  type TaskStatus,
  type TaskSummary,
  type UpdateTaskRequest,
} from '../shared/types.ts'
import type { ProjectTaskActions } from './actions.ts'
import { formatTaskError, isRevisionConflict } from './errors.ts'
import { formatPercent, fullTime, relativeTime, shortId } from './format.ts'
import {
  IconAlert,
  IconBoard,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconClose,
  IconFolder,
  IconInbox,
  IconLayers,
  IconMessage,
  IconPlus,
  IconRefresh,
  IconSearch,
} from './icons.tsx'
import { emptyColumnCopy, PRIMARY_COLUMNS, STATUS_HINTS, STATUS_LABELS } from './labels.ts'
import { NewTaskDialog } from './new-task-dialog.tsx'
import { sessionLabel, type SessionInfo, type SessionInfoMap } from './session-info.ts'
import { TaskDetail } from './task-detail.tsx'

const DEFAULT_REFRESH_MS = 4000

export type ProjectTaskBoardProps = PropsRuntime<'main'> & {
  actions: ProjectTaskActions
}

export function ProjectTaskBoard({ actions, useWorkspaces, useSessions }: ProjectTaskBoardProps) {
  const workspaceSnapshot = useWorkspaces((value: WorkspaceSnapshot) => value)
  const sessionSnapshot = useSessions((value: SessionListState) => value)
  const workspaces: readonly WorkspaceView[] = workspaceSnapshot.items
  const [workspaceId, setWorkspaceId] = useState('')
  const [items, setItems] = useState<TaskSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<number>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const [searchDraft, setSearchDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'default' | 'all' | TaskStatus>('default')
  const [details, setDetails] = useState<TaskDetails>()
  const [openTaskId, setOpenTaskId] = useState<string>()
  const [detailLoading, setDetailLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [createStatus, setCreateStatus] = useState<'todo' | 'backlog'>()
  const [now, setNow] = useState(() => Date.now())

  const detailsRef = useRef<TaskDetails>()
  detailsRef.current = details
  const detailDirtyRef = useRef(false)
  const busyRef = useRef(false)
  busyRef.current = busy
  const openSeqRef = useRef(0)
  const noticeTimerRef = useRef<number>()

  const workspace = workspaces.find(item => item.workspaceId === workspaceId)

  const sessionInfo = useMemo(() => {
    const map: Record<string, SessionInfo> = {}
    const rows = sessionSnapshot.byId as unknown as Record<string, { displayTitle: string; running: boolean } | undefined>
    for (const [id, row] of Object.entries(rows)) {
      if (row) map[id] = { title: row.displayTitle, running: row.running }
    }
    return map
  }, [sessionSnapshot])

  useEffect(() => {
    if (!workspaces.some(item => item.workspaceId === workspaceId)) {
      setWorkspaceId(workspaces[0]?.workspaceId ?? '')
      setDetails(undefined)
      setOpenTaskId(undefined)
    }
  }, [workspaceId, workspaces])

  useEffect(() => {
    const timer = window.setTimeout(() => setKeyword(searchDraft.trim()), 260)
    return () => window.clearTimeout(timer)
  }, [searchDraft])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== undefined) window.clearTimeout(noticeTimerRef.current)
    }
  }, [])

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimerRef.current !== undefined) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 2600)
  }, [])

  const refresh = useCallback(() => setReload(value => value + 1), [])

  useEffect(() => {
    if (!workspaceId) {
      setItems([])
      setLoading(false)
      setSyncing(false)
      return
    }
    let active = true
    let first = true
    const load = async () => {
      if (document.visibilityState === 'hidden') return
      if (first) setSyncing(true)
      try {
        const result = await actions.list({ workspaceId, ...(keyword ? { keyword } : {}), limit: 500 })
        if (!active) return
        setItems(result.items.filter(item => !item.task.parentId))
        setLastSynced(Date.now())
        setError('')
        const open = detailsRef.current
        if (open && !detailDirtyRef.current && !busyRef.current) {
          try {
            const fresh = await actions.get(open.task.id)
            if (active && fresh.task.revision !== open.task.revision) setDetails(fresh)
          } catch {
            // Keep the current detail when a background refresh cannot read it.
          }
        }
      } catch (cause) {
        if (active) setError(formatTaskError(cause))
      } finally {
        if (active) {
          setLoading(false)
          if (first) setSyncing(false)
          first = false
        }
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), DEFAULT_REFRESH_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [actions, keyword, reload, workspaceId])

  const openTask = useCallback(async (taskId: string) => {
    if (detailDirtyRef.current) {
      showNotice('有未保存的修改，请先保存或取消')
      return
    }
    const seq = openSeqRef.current + 1
    openSeqRef.current = seq
    setOpenTaskId(taskId)
    setDetailLoading(true)
    setDetails(undefined)
    detailDirtyRef.current = false
    setError('')
    try {
      const next = await actions.get(taskId)
      if (seq === openSeqRef.current) setDetails(next)
    } catch (cause) {
      if (seq === openSeqRef.current) {
        setError(formatTaskError(cause))
        setOpenTaskId(undefined)
      }
    } finally {
      if (seq === openSeqRef.current) setDetailLoading(false)
    }
  }, [actions, showNotice])

  const handleDirtyChange = useCallback((value: boolean) => {
    detailDirtyRef.current = value
  }, [])

  const closeDetails = useCallback(() => {
    if (detailDirtyRef.current) {
      showNotice('有未保存的修改，请先保存或取消')
      return
    }
    openSeqRef.current += 1
    setOpenTaskId(undefined)
    setDetails(undefined)
    setDetailLoading(false)
    detailDirtyRef.current = false
  }, [showNotice])

  async function update(input: UpdateTaskRequest): Promise<boolean> {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const previous = detailsRef.current?.task.status
      const next = await actions.update(input)
      setDetails(next)
      showNotice(updateNotice(previous, input))
      refresh()
      return true
    } catch (cause) {
      if (isRevisionConflict(cause)) {
        try {
          setDetails(await actions.get(input.taskId))
        } catch {
          // The original conflict message below still explains the state.
        }
      }
      setError(formatTaskError(cause))
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function continueTask(): Promise<void> {
    const current = detailsRef.current
    if (!current || busyRef.current) return
    const fresh = current.checkpoints.length === 0 && current.sessions.length === 0
    const finished = current.task.status === 'done' || current.task.status === 'cancelled'
    const action = finished ? '重新开启任务' : fresh ? '开始任务' : '继续任务'
    const prompt = `${action}：${current.task.title.trim()}`
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const result = await actions.continueTask({
        taskId: current.task.id,
        expectedRevision: current.task.revision,
      })
      showNotice('会话已创建，正在打开…')
      closeDetails()
      refresh()
      actions.openTaskSession(result.sessionId, prompt)
    } catch (cause) {
      setError(formatTaskError(cause))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function requestCreate(status: 'todo' | 'backlog'): void {
    if (detailDirtyRef.current) {
      showNotice('有未保存的修改，请先保存或取消')
      return
    }
    setCreateStatus(status)
  }

  function handleCreated(next: TaskDetails): void {
    setCreateStatus(undefined)
    closeDetails()
    setDetails(next)
    setOpenTaskId(next.task.id)
    setDetailLoading(false)
    showNotice('任务已创建')
    refresh()
  }

  const counts = useMemo(() => {
    const map = new Map<TaskStatus, number>()
    for (const status of TASK_STATUSES) map.set(status, 0)
    for (const item of items) map.set(item.task.status, (map.get(item.task.status) ?? 0) + 1)
    return map
  }, [items])

  const tasksByStatus = useMemo(() => {
    const map = new Map<TaskStatus, TaskSummary[]>()
    for (const status of TASK_STATUSES) map.set(status, [])
    for (const item of items) map.get(item.task.status)?.push(item)
    return map
  }, [items])

  const attention = useMemo(() => items
    .filter(item => item.task.status === 'blocked' || item.task.status === 'paused' || item.task.handoffIncomplete)
    .sort((a, b) => b.task.updatedAt - a.task.updatedAt), [items])

  const columns: readonly TaskStatus[] = statusFilter === 'default'
    ? PRIMARY_COLUMNS
    : statusFilter === 'all'
      ? TASK_STATUSES
      : [statusFilter]

  const searching = keyword.length > 0
  const showSkeleton = !workspaceId ? false : loading && items.length === 0 && !searching
  const emptyProject = !loading && !searching && items.length === 0
  const noResults = !loading && searching && items.length === 0

  return <main className="ptm-board">
    <header className="ptm-pagehead">
      <div className="ptm-pagehead-main">
        <div className="ptm-titleline">
          <span className="ptm-pageicon"><IconBoard size={17} /></span>
          <h1>项目任务</h1>
        </div>
        <div className="ptm-contextline">
          <label className="ptm-projectpick" title="切换工作区">
            <IconFolder size={14} />
            <select
              aria-label="当前项目"
              value={workspaceId}
              disabled={workspaces.length === 0}
              onChange={event => {
                detailDirtyRef.current = false
                setWorkspaceId(event.target.value)
                closeDetails()
              }}
            >
              {workspaces.length === 0
                ? <option value="">尚未注册工作区</option>
                : workspaces.map(item => <option key={item.workspaceId} value={item.workspaceId}>{item.title}</option>)}
            </select>
            <IconChevronDown size={14} />
          </label>
          {workspace && <span className="ptm-path" title={workspace.path}>{workspace.path}</span>}
        </div>
      </div>
      <div className="ptm-page-actions">
        <span className={`ptm-sync${syncing ? ' is-syncing' : ''}`} title={lastSynced ? `上次同步 ${fullTime(lastSynced)}` : '正在等待第一次同步'}>
          <span className="ptm-sync-dot" />
          {syncing ? '同步中' : '自动同步'}
        </span>
        <button
          type="button"
          className="ptm-button ptm-primary"
          disabled={!workspaceId}
          onClick={() => requestCreate('todo')}
        >
          <IconPlus size={16} />
          新建任务
        </button>
      </div>
    </header>

    {workspaceId && <section className="ptm-overview" aria-label="任务概况">
      <div className="ptm-overview-stats">
        <OverviewStat status="todo" label="待处理" value={counts.get('todo') ?? 0} />
        <OverviewStat status="in_progress" label="进行中" value={counts.get('in_progress') ?? 0} />
        <OverviewStat status="in_review" label="待验收" value={counts.get('in_review') ?? 0} />
        <OverviewStat status="done" label="已完成" value={counts.get('done') ?? 0} />
        {attention.length > 0 && <OverviewStat status="blocked" label="需要关注" value={attention.length} />}
      </div>
      <span className="ptm-overview-total">{searching ? `找到 ${items.length} 个任务` : `共 ${items.length} 个任务`}</span>
    </section>}

    <div className="ptm-toolbar">
      <form
        className="ptm-search"
        role="search"
        onSubmit={event => {
          event.preventDefault()
          setKeyword(searchDraft.trim())
        }}
      >
        <IconSearch size={15} />
        <input
          value={searchDraft}
          onChange={event => setSearchDraft(event.target.value)}
          placeholder="搜索任务标题、描述或 ID"
          aria-label="搜索任务"
        />
        {searchDraft && <button
          type="button"
          className="ptm-search-clear"
          aria-label="清除搜索"
          onClick={() => {
            setSearchDraft('')
            setKeyword('')
          }}
        ><IconClose size={13} /></button>}
      </form>
      <div className="ptm-toolbar-actions">
        <label className="ptm-select">
          <IconLayers size={15} />
          <select
            aria-label="状态视图"
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}
          >
            <option value="default">主流程视图</option>
            <option value="all">全部状态</option>
            {TASK_STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
          </select>
          <IconChevronDown size={14} />
        </label>
        <button
          type="button"
          className="ptm-icon-button"
          title="立即刷新"
          aria-label="立即刷新"
          disabled={!workspaceId}
          onClick={refresh}
        >
          <IconRefresh size={16} className={syncing ? 'ptm-spin' : undefined} />
        </button>
      </div>
    </div>

    {error && <div className="ptm-error" role="alert">
      <IconAlert size={15} />
      <span>{error}</span>
      <button type="button" className="ptm-icon-button" aria-label="关闭提示" onClick={() => setError('')}>
        <IconClose size={14} />
      </button>
    </div>}

    {attention.length > 0 && statusFilter === 'default' && <section className="ptm-attention" aria-label="需要关注">
      <div className="ptm-attention-head">
        <IconAlert size={15} />
        <span>需要关注</span>
        <span className="ptm-attention-count">{attention.length}</span>
      </div>
      <div className="ptm-attention-items">
        {attention.slice(0, 3).map(item => <button
          key={item.task.id}
          type="button"
          className="ptm-attention-item"
          onClick={() => void openTask(item.task.id)}
          title={attentionTooltip(item)}
        >
          <span className={`ptm-dot ptm-dot-${item.task.status}`} />
          <span className="ptm-attention-title">{item.task.title}</span>
          <span className="ptm-attention-reason">{attentionReason(item)}</span>
          <IconChevronRight size={13} />
        </button>)}
        {attention.length > 3 && <span className="ptm-attention-more">还有 {attention.length - 3} 个</span>}
      </div>
    </section>}

    <div className="ptm-boardarea">
      <div className="ptm-boardscroll">
        {showSkeleton
          ? <BoardSkeleton />
          : !workspaceId
            ? <EmptyState
              icon={<IconFolder size={22} />}
              title="还没有可用的工作区"
              description="先在 DSH 中打开一个项目目录，再回来把工作拆成任务。"
            />
            : noResults
              ? <EmptyState
                icon={<IconSearch size={22} />}
                title="没有找到匹配的任务"
                description={`没有与「${keyword}」匹配的任务，试试更短的关键词。`}
                action={<button type="button" className="ptm-button" onClick={() => { setSearchDraft(''); setKeyword('') }}>
                  <IconClose size={14} />清除搜索
                </button>}
              />
              : emptyProject
                ? <EmptyState
                  icon={<IconInbox size={22} />}
                  title="这个项目还没有任务"
                  description="手动记录第一件要做的事，或让「项目任务」模式的 Agent 在会话中把工作拆成任务。"
                  action={<button type="button" className="ptm-button ptm-primary" onClick={() => requestCreate('todo')}>
                    <IconPlus size={15} />新建第一个任务
                  </button>}
                />
                : <div className="ptm-columns">
                  {columns.map(status => <BoardColumn
                    key={status}
                    status={status}
                    tasks={tasksByStatus.get(status) ?? []}
                    now={now}
                    sessionInfo={sessionInfo}
                    onOpen={taskId => void openTask(taskId)}
                    onCreate={requestCreate}
                  />)}
                </div>}
      </div>

      {openTaskId && <>
        <div className="ptm-scrim" onClick={closeDetails} />
        {details
          ? <TaskDetail
            key={details.task.id}
            details={details}
            busy={busy}
            now={now}
            sessionInfo={sessionInfo}
            onClose={closeDetails}
            onUpdate={update}
            onContinue={continueTask}
            onOpenSession={actions.openSession}
            onOpenTask={taskId => void openTask(taskId)}
            onDirtyChange={handleDirtyChange}
          />
          : <DetailSkeleton loading={detailLoading} onClose={closeDetails} />}
      </>}
    </div>

    {createStatus && workspaceId && <NewTaskDialog
      workspaceId={workspaceId}
      workspaceTitle={workspace?.title ?? '当前项目'}
      initialStatus={createStatus}
      actions={actions}
      onClose={() => setCreateStatus(undefined)}
      onCreated={handleCreated}
    />}

    {notice && <div className="ptm-toast" role="status">{notice}</div>}
  </main>
}

function updateNotice(previous: TaskStatus | undefined, input: UpdateTaskRequest): string {
  if (input.status === 'done') return '任务已验收'
  if (input.status === 'in_review') return '已提交验收'
  if (input.status === 'blocked') return '已标记阻塞'
  if (input.status === 'in_progress' && previous === 'in_review') return '已退回修改'
  if (input.status === 'in_progress' && previous === 'blocked') return '已解除阻塞'
  if (input.status === 'paused') return '任务已暂停'
  return '修改已保存'
}

function OverviewStat({ status, label, value }: { status: TaskStatus; label: string; value: number }) {
  return <span className="ptm-stat">
    <span className={`ptm-dot ptm-dot-${status}`} />
    <span className="ptm-stat-label">{label}</span>
    <span className="ptm-stat-value">{value}</span>
  </span>
}

function attentionReason(summary: TaskSummary): string {
  if (summary.task.status === 'blocked') return '已阻塞'
  if (summary.task.status === 'paused') return '已暂停'
  return '交接待补充'
}

function attentionTooltip(summary: TaskSummary): string {
  const reason = summary.task.status === 'blocked' ? summary.task.blockedReason?.trim() : undefined
  return reason ? `${summary.task.title} · ${reason}` : summary.task.title
}

function BoardColumn({ status, tasks, now, sessionInfo, onOpen, onCreate }: {
  status: TaskStatus
  tasks: readonly TaskSummary[]
  now: number
  sessionInfo: SessionInfoMap
  onOpen(taskId: string): void
  onCreate(status: 'todo' | 'backlog'): void
}) {
  const canCreate = status === 'todo' || status === 'backlog'
  return <section className="ptm-column" data-status={status} aria-label={STATUS_LABELS[status]}>
    <header className="ptm-column-head">
      <span className={`ptm-dot ptm-dot-${status}`} />
      <h2 title={STATUS_HINTS[status]}>{STATUS_LABELS[status]}</h2>
      <span className="ptm-column-count">{tasks.length}</span>
      <span className="ptm-column-spacer" />
      {canCreate && <button
        type="button"
        className="ptm-icon-button ptm-column-add"
        title={`在「${STATUS_LABELS[status]}」中新建任务`}
        aria-label={`在「${STATUS_LABELS[status]}」中新建任务`}
        onClick={() => onCreate(status)}
      ><IconPlus size={15} /></button>}
    </header>
    {tasks.length === 0
      ? <div className="ptm-column-empty">
        <span>{emptyColumnCopy(status)}</span>
        {canCreate && <button type="button" className="ptm-textbutton" onClick={() => onCreate(status)}>
          <IconPlus size={13} />新建任务
        </button>}
      </div>
      : <div className="ptm-cards">
        {tasks.map(item => <TaskCard
          key={item.task.id}
          summary={item}
          now={now}
          sessionTitle={item.recentSessionId ? sessionLabel(sessionInfo, item.recentSessionId) : undefined}
          onOpen={() => onOpen(item.task.id)}
        />)}
      </div>}
  </section>
}

function TaskCard({ summary, now, sessionTitle, onOpen }: {
  summary: TaskSummary
  now: number
  sessionTitle?: string
  onOpen(): void
}) {
  const { task } = summary
  const blocked = task.status === 'blocked'
  const progress = formatPercent(summary.childDone, summary.childTotal)
  return <button
    type="button"
    className="ptm-card"
    onClick={onOpen}
    aria-label={`${STATUS_LABELS[task.status]}：${task.title}`}
  >
    <span className="ptm-card-top">
      <span className="ptm-card-id">#{shortId(task.id)}</span>
      {task.priority === 'high' && <span className="ptm-priority ptm-priority-high">高优先级</span>}
      {task.priority === 'low' && <span className="ptm-priority">低优先级</span>}
    </span>
    <span className="ptm-card-title">{task.title}</span>
    {(blocked || task.handoffIncomplete) && <span className="ptm-card-badges">
      {blocked && <span className="ptm-badge ptm-badge-danger">已阻塞</span>}
      {task.handoffIncomplete && <span className="ptm-badge ptm-badge-warn">交接待补充</span>}
    </span>}
    {summary.childTotal > 0 && <span className="ptm-progress">
      <span className="ptm-progress-track"><span className="ptm-progress-fill" style={{ width: `${progress}%` }} /></span>
      <span className="ptm-progress-text">{summary.childDone}/{summary.childTotal}</span>
    </span>}
    <span className="ptm-card-meta">
      <span className="ptm-card-time" title={fullTime(task.updatedAt)}>
        <IconClock size={12} />
        {relativeTime(task.updatedAt, now)}
      </span>
      {sessionTitle && <span className="ptm-card-session" title={sessionTitle}>
        <IconMessage size={12} />
        <span className="ptm-card-session-text">{sessionTitle}</span>
      </span>}
    </span>
  </button>
}

function EmptyState({ icon, title, description, action }: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return <div className="ptm-emptystate">
    <span className="ptm-emptystate-icon">{icon}</span>
    <h2>{title}</h2>
    <p>{description}</p>
    {action && <div className="ptm-emptystate-actions">{action}</div>}
  </div>
}

function BoardSkeleton() {
  return <div className="ptm-columns" aria-busy="true" aria-label="正在加载任务">
    {PRIMARY_COLUMNS.map(status => <div className="ptm-column" key={status}>
      <div className="ptm-column-head">
        <span className={`ptm-dot ptm-dot-${status}`} />
        <span className="ptm-skeleton ptm-skeleton-heading" />
      </div>
      <div className="ptm-cards">
        {[0, 1, 2].map(index => <div className="ptm-card ptm-skeleton-card" key={index}>
          <span className="ptm-skeleton ptm-skeleton-line is-short" />
          <span className="ptm-skeleton ptm-skeleton-line" />
          <span className="ptm-skeleton ptm-skeleton-line is-medium" />
          <span className="ptm-skeleton ptm-skeleton-line is-tiny" />
        </div>)}
      </div>
    </div>)}
  </div>
}

function DetailSkeleton({ loading, onClose }: { loading: boolean; onClose(): void }) {
  return <aside className="ptm-detail ptm-detail-skeleton" aria-label={loading ? '正在加载任务详情' : '任务详情'}>
    <header className="ptm-detail-head">
      <div className="ptm-skeleton ptm-skeleton-line is-short" />
      <div className="ptm-skeleton ptm-skeleton-title" />
      <button type="button" className="ptm-icon-button ptm-detail-close" aria-label="关闭详情" onClick={onClose}>
        <IconClose size={16} />
      </button>
    </header>
    <div className="ptm-detail-scroll" aria-busy={loading}>
      {[0, 1, 2, 3, 4].map(index => <div className="ptm-skeleton ptm-skeleton-line" key={index} />)}
    </div>
  </aside>
}
