import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  type TaskCheckpoint,
  type TaskDetails,
  type TaskPriority,
  type TaskStatus,
  type UpdateTaskRequest,
} from '../shared/types.ts'
import { formatPercent, fullTime, relativeTime, shortId } from './format.ts'
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconChevronRight,
  IconClose,
  IconEdit,
  IconMessage,
  IconPlay,
  IconUndo,
} from './icons.tsx'
import {
  activityLabel,
  CHECKPOINT_LABELS,
  PRIORITY_LABELS,
  SESSION_ROLE_LABELS,
  STATUS_HINTS,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
} from './labels.ts'
import { sessionLabel, type SessionInfoMap } from './session-info.ts'

const PRIORITIES: readonly TaskPriority[] = ['low', 'normal', 'high']

interface TaskDetailProps {
  details: TaskDetails
  busy: boolean
  now: number
  sessionInfo: SessionInfoMap
  onClose(): void
  onUpdate(input: UpdateTaskRequest): Promise<boolean>
  onContinue(): Promise<void>
  onOpenSession(sessionId: string): void
  onOpenTask(taskId: string): void
  onDirtyChange(value: boolean): void
}

export function TaskDetail({
  details,
  busy,
  now,
  sessionInfo,
  onClose,
  onUpdate,
  onContinue,
  onOpenSession,
  onOpenTask,
  onDirtyChange,
}: TaskDetailProps) {
  const { task } = details
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [criteria, setCriteria] = useState(task.acceptanceCriteria.join('\n'))
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [blockedReason, setBlockedReason] = useState(task.blockedReason ?? '')
  const [unblockCondition, setUnblockCondition] = useState(task.unblockCondition ?? '')
  const [formError, setFormError] = useState('')
  const [continuing, setContinuing] = useState(false)
  const [showAllCheckpoints, setShowAllCheckpoints] = useState(false)

  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description)
    setCriteria(task.acceptanceCriteria.join('\n'))
    setStatus(task.status)
    setPriority(task.priority)
    setBlockedReason(task.blockedReason ?? '')
    setUnblockCondition(task.unblockCondition ?? '')
    setFormError('')
    setEditing(false)
    setShowAllCheckpoints(false)
  }, [task])

  const draftCriteria = criteria.split('\n').map(item => item.trim()).filter(Boolean)
  const dirty = editing && (
    title.trim() !== task.title ||
    description !== task.description ||
    draftCriteria.join('\n') !== task.acceptanceCriteria.join('\n') ||
    status !== task.status ||
    priority !== task.priority ||
    (status === 'blocked' && (
      blockedReason !== (task.blockedReason ?? '') ||
      unblockCondition !== (task.unblockCondition ?? '')
    ))
  )

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  function resetDraft(): void {
    setTitle(task.title)
    setDescription(task.description)
    setCriteria(task.acceptanceCriteria.join('\n'))
    setStatus(task.status)
    setPriority(task.priority)
    setBlockedReason(task.blockedReason ?? '')
    setUnblockCondition(task.unblockCondition ?? '')
    setFormError('')
  }

  function beginEdit(): void {
    resetDraft()
    setEditing(true)
  }

  function cancelEdit(): void {
    resetDraft()
    setEditing(false)
    onDirtyChange(false)
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (busy) return
    if (!title.trim()) {
      setFormError('任务标题不能为空。')
      return
    }
    if (status === 'blocked' && (!blockedReason.trim() || !unblockCondition.trim())) {
      setFormError('阻塞任务需要同时填写阻塞原因和解除条件。')
      return
    }
    setFormError('')
    const ok = await onUpdate({
      taskId: task.id,
      expectedRevision: task.revision,
      title: title.trim(),
      description,
      acceptanceCriteria: draftCriteria,
      status,
      priority,
      ...(status === 'blocked' ? { blockedReason: blockedReason.trim(), unblockCondition: unblockCondition.trim() } : {}),
    })
    if (ok) setEditing(false)
  }

  async function quickUpdate(next: TaskStatus, detail: string): Promise<void> {
    if (busy) return
    const ok = await onUpdate({ taskId: task.id, expectedRevision: task.revision, status: next, detail })
    if (ok) setEditing(false)
  }

  async function startSession(): Promise<void> {
    if (busy || continuing) return
    setContinuing(true)
    try {
      await onContinue()
    } finally {
      setContinuing(false)
    }
  }

  const fresh = details.checkpoints.length === 0 && details.sessions.length === 0
  const finished = task.status === 'done' || task.status === 'cancelled'
  const inReview = task.status === 'in_review'
  const activeSessionId = task.status === 'in_progress' ? task.activeSessionId : undefined
  const primaryLabel = finished ? '重新开启任务' : fresh ? '开启任务' : '继续任务'
  const recentSession = details.sessions[0]
  const checkpointCount = details.checkpoints.length
  const visibleCheckpoints = showAllCheckpoints ? details.checkpoints : details.checkpoints.slice(0, 3)
  const childDone = details.children.filter(item => item.status === 'done').length
  const hint = inReview
    ? '通过验收后任务进入已完成；退回修改会重新标记为进行中。'
    : task.status === 'blocked'
      ? '继续任务会清除阻塞原因并把状态推进为进行中；请先确认解除条件已经满足。'
      : task.status === 'paused'
        ? '继续任务会从暂停恢复为进行中，并带上最近的交接上下文。'
        : activeSessionId
      ? '当前有一个活跃的执行会话；打开它可以回到上次进度，也可以新开会话接续。'
      : finished
        ? '重新开启会创建一个新会话，并把任务推进为进行中。'
        : fresh
          ? '会在「项目任务」模式中创建一个与任务同名的会话，并把任务推进为进行中。'
          : '将创建接续会话，并自动带上最近的交接、开放问题和未完成子任务。'

  return <aside className="ptm-detail" aria-label="任务详情">
    <header className="ptm-detail-head">
      <div className="ptm-detail-headrow">
        <span className={`ptm-statuspill ptm-status-${task.status}`} title={STATUS_HINTS[task.status]}>
          <span className={`ptm-dot ptm-dot-${task.status}`} />
          {STATUS_LABELS[task.status]}
        </span>
        {task.priority !== 'normal' && <span className={`ptm-priority ptm-priority-${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span>}
        <span className="ptm-detail-id">#{shortId(task.id)}</span>
        <span className="ptm-detail-rev">修订 {task.revision}</span>
        <span className="ptm-detail-spacer" />
        <button type="button" className="ptm-icon-button" aria-label="关闭详情" title="关闭详情" onClick={onClose}>
          <IconClose size={16} />
        </button>
      </div>
      <h2>{task.title}</h2>
      <div className="ptm-detail-meta">
        <span>{task.createdBy.type === 'agent' ? '由 Agent 创建' : '由你创建'}</span>
        <span className="ptm-meta-sep">·</span>
        <span title={fullTime(task.updatedAt)}>更新于 {relativeTime(task.updatedAt, now)}</span>
        {task.activeSessionId && <span className="ptm-live"><span className="ptm-live-dot" />会话执行中</span>}
      </div>
    </header>

    <div className="ptm-detail-actions">
      {inReview
        ? <>
          <button type="button" className="ptm-button ptm-primary" disabled={busy || editing} onClick={() => void quickUpdate('done', '用户在看板通过验收')}>
            <IconCheck size={15} />通过验收
          </button>
          <button type="button" className="ptm-button" disabled={busy || editing} onClick={() => void quickUpdate('in_progress', '用户退回修改')}>
            <IconUndo size={15} />退回修改
          </button>
          <button type="button" className="ptm-textbutton" disabled={busy || continuing || editing} onClick={() => void startSession()}>
            {continuing ? '正在创建会话…' : '继续任务'}
          </button>
        </>
        : <>
          {activeSessionId
            ? <button type="button" className="ptm-button ptm-primary" disabled={busy || editing} onClick={() => onOpenSession(activeSessionId)}>
              <IconArrowRight size={15} />打开执行会话
            </button>
            : <button type="button" className="ptm-button ptm-primary" disabled={busy || continuing || editing} onClick={() => void startSession()}>
              {finished || fresh ? <IconPlay size={15} /> : <IconArrowRight size={15} />}
              {continuing ? '正在创建会话…' : primaryLabel}
            </button>}
          {activeSessionId
            ? <button type="button" className="ptm-button" disabled={busy || continuing || editing} onClick={() => void startSession()}>
              <IconMessage size={15} />{continuing ? '正在创建…' : '新开会话继续'}
            </button>
            : recentSession && <button
              type="button"
              className="ptm-button"
              disabled={busy}
              onClick={() => onOpenSession(recentSession.sessionId)}
            >
              <IconMessage size={15} />打开最近会话
            </button>}
          <button type="button" className="ptm-textbutton ptm-detail-edit" disabled={busy || editing} onClick={beginEdit}>
            <IconEdit size={14} />编辑
          </button>
        </>}
      {inReview && <button type="button" className="ptm-textbutton ptm-detail-edit" disabled={busy || editing} onClick={beginEdit}>
        <IconEdit size={14} />编辑
      </button>}
    </div>
    <p className="ptm-action-hint">{hint}</p>

    <div className="ptm-detail-scroll">
      {task.status === 'blocked' && <div className="ptm-blockcallout" role="status">
        <div className="ptm-blockcallout-head"><IconAlert size={15} /><strong>任务已被阻塞</strong></div>
        <p>{task.blockedReason || '未填写阻塞原因'}</p>
        <div className="ptm-blockcallout-sub">
          <span>解除条件</span>
          <p>{task.unblockCondition || '未填写解除条件'}</p>
        </div>
      </div>}

      {editing
        ? <form id="ptm-edit-task" className="ptm-editform" onSubmit={event => void save(event)}>
          <label className="ptm-field">
            <span className="ptm-field-label">任务标题</span>
            <input required maxLength={300} value={title} onChange={event => setTitle(event.target.value)} />
          </label>
          <div className="ptm-field-row">
            <label className="ptm-field">
              <span className="ptm-field-label">状态</span>
              <select value={status} onChange={event => setStatus(event.target.value as TaskStatus)}>
                {[task.status, ...STATUS_TRANSITIONS[task.status].filter(item => item !== task.status)]
                  .map(item => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}
              </select>
            </label>
            <label className="ptm-field">
              <span className="ptm-field-label">优先级</span>
              <select value={priority} onChange={event => setPriority(event.target.value as TaskPriority)}>
                {PRIORITIES.map(item => <option key={item} value={item}>{PRIORITY_LABELS[item]}</option>)}
              </select>
            </label>
          </div>
          {status === 'blocked' && <>
            <label className="ptm-field">
              <span className="ptm-field-label">阻塞原因</span>
              <textarea required rows={2} value={blockedReason} onChange={event => setBlockedReason(event.target.value)} placeholder="具体卡在哪里？" />
            </label>
            <label className="ptm-field">
              <span className="ptm-field-label">解除条件</span>
              <textarea required rows={2} value={unblockCondition} onChange={event => setUnblockCondition(event.target.value)} placeholder="满足什么条件后可以继续？" />
            </label>
          </>}
          <label className="ptm-field">
            <span className="ptm-field-label">任务说明</span>
            <textarea rows={5} value={description} onChange={event => setDescription(event.target.value)} placeholder="补充背景、目标和约束。" />
          </label>
          <label className="ptm-field">
            <span className="ptm-field-label">验收标准<span className="ptm-field-optional">每行一条</span></span>
            <textarea rows={4} value={criteria} onChange={event => setCriteria(event.target.value)} placeholder="写下可以逐条确认的验收标准。" />
          </label>
          {formError && <p className="ptm-form-error" role="alert">{formError}</p>}
        </form>
        : <>
          <Section title="任务说明">
            {task.description
              ? <p className="ptm-prose">{task.description}</p>
              : <p className="ptm-muted">还没有填写任务说明。</p>}
          </Section>
          <Section title="验收标准">
            {task.acceptanceCriteria.length === 0
              ? <p className="ptm-muted">未填写验收标准。</p>
              : <ul className="ptm-criteria">
                {task.acceptanceCriteria.map((item, index) => <li key={`${index}:${item}`}>
                  <span className={`ptm-criteria-mark${task.status === 'done' ? ' is-done' : ''}`}>
                    {task.status === 'done' ? <IconCheck size={11} /> : index + 1}
                  </span>
                  <span>{item}</span>
                </li>)}
              </ul>}
          </Section>
        </>}

      <Section title="子任务" count={`${childDone}/${details.children.length}`}>
        {details.children.length === 0
          ? <p className="ptm-muted">暂无子任务。</p>
          : <>
            <div className="ptm-childprogress">
              <span className="ptm-progress-track"><span className="ptm-progress-fill" style={{ width: `${formatPercent(childDone, details.children.length)}%` }} /></span>
              <span>{formatPercent(childDone, details.children.length)}%</span>
            </div>
            <div className="ptm-children">
              {details.children.map(child => <button
                key={child.id}
                type="button"
                className={`ptm-child ptm-child-${child.status}`}
                onClick={() => onOpenTask(child.id)}
                title="打开子任务"
                disabled={editing}
              >
                <span className={`ptm-dot ptm-dot-${child.status}`} />
                <span className="ptm-child-title">{child.title}</span>
                <span className="ptm-child-status">{STATUS_LABELS[child.status]}</span>
                <IconChevronRight size={13} />
              </button>)}
            </div>
          </>}
      </Section>

      <Section title="进展记录" count={String(checkpointCount)}>
        {checkpointCount === 0
          ? <p className="ptm-muted">还没有 Checkpoint，开启会话后会记下第一条进展。</p>
          : <>
            <div className="ptm-timeline">
              {visibleCheckpoints.map(checkpoint => <CheckpointCard
                key={checkpoint.id}
                checkpoint={checkpoint}
                now={now}
                sessionInfo={sessionInfo}
                onOpenSession={onOpenSession}
                disabled={editing}
              />)}
            </div>
            {checkpointCount > 3 && <button
              type="button"
              className="ptm-textbutton"
              onClick={() => setShowAllCheckpoints(value => !value)}
            >
              {showAllCheckpoints ? '收起较早的记录' : `查看全部 ${checkpointCount} 条记录`}
            </button>}
          </>}
      </Section>

      <Section title="关联会话" count={String(details.sessions.length)}>
        {details.sessions.length === 0
          ? <p className="ptm-muted">还没有关联会话，开启任务后会出现在这里。</p>
          : <ul className="ptm-sessions">
            {details.sessions.map(link => {
              const info = sessionInfo[link.sessionId]
              const active = link.sessionId === task.activeSessionId
              return <li key={`${link.taskId}:${link.sessionId}`}>
                <button
                  type="button"
                  className="ptm-sessionrow"
                  title={link.sessionId}
                  onClick={() => onOpenSession(link.sessionId)}
                  disabled={editing}
                >
                  <span className="ptm-sessionrow-icon"><IconMessage size={15} /></span>
                  <span className="ptm-sessionrow-main">
                    <span className="ptm-sessionrow-title">{sessionLabel(sessionInfo, link.sessionId)}</span>
                    <span className="ptm-sessionrow-meta">
                      {SESSION_ROLE_LABELS[link.role]} · {relativeTime(link.linkedAt, now)}
                      {info?.running ? ' · 运行中' : ''}
                    </span>
                  </span>
                  {active && <span className="ptm-badge ptm-badge-accent">执行中</span>}
                  <IconChevronRight size={14} />
                </button>
              </li>
            })}
          </ul>}
      </Section>

      <details className="ptm-activities">
        <summary>
          <span>操作记录</span>
          <span className="ptm-count-badge">{details.activities.length}</span>
        </summary>
        {details.activities.length === 0
          ? <p className="ptm-muted">暂无操作记录。</p>
          : <ul className="ptm-activity-list">
            {details.activities.map(activity => <li key={activity.id}>
              <span className="ptm-activity-dot" />
              <div className="ptm-activity-main">
                <span className="ptm-activity-action">{activityLabel(activity.action)}</span>
                {activity.fromStatus && activity.toStatus && activity.fromStatus !== activity.toStatus && <span className="ptm-activity-transition">
                  {STATUS_LABELS[activity.fromStatus]} → {STATUS_LABELS[activity.toStatus]}
                </span>}
                {activity.detail && <p className="ptm-activity-detail">{activity.detail}</p>}
              </div>
              <time title={fullTime(activity.createdAt)}>{relativeTime(activity.createdAt, now)}</time>
            </li>)}
          </ul>}
      </details>
    </div>

    {editing && <div className="ptm-savebar">
      <span>{dirty ? '有未保存的修改' : '编辑模式'}</span>
      <span className="ptm-savebar-spacer" />
      <button type="button" className="ptm-button" onClick={cancelEdit} disabled={busy}>取消</button>
      <button type="submit" form="ptm-edit-task" className="ptm-button ptm-primary" disabled={busy || !dirty}>
        {busy ? '保存中…' : '保存修改'}
      </button>
    </div>}

  </aside>
}

function Section({ title, count, children }: { title: string; count?: string; children: ReactNode }) {
  return <section className="ptm-section">
    <header className="ptm-section-head">
      <h3>{title}</h3>
      {count !== undefined && <span className="ptm-count-badge">{count}</span>}
    </header>
    {children}
  </section>
}

function CheckpointCard({ checkpoint, now, sessionInfo, onOpenSession, disabled }: {
  checkpoint: TaskCheckpoint
  now: number
  sessionInfo: SessionInfoMap
  onOpenSession(sessionId: string): void
  disabled: boolean
}) {
  return <article className={`ptm-checkpoint ptm-cp-${checkpoint.kind}`}>
    <header className="ptm-checkpoint-head">
      <span className={`ptm-kind ptm-kind-${checkpoint.kind}`}>{CHECKPOINT_LABELS[checkpoint.kind]}</span>
      <time title={fullTime(checkpoint.createdAt)}>{relativeTime(checkpoint.createdAt, now)}</time>
    </header>
    <p className="ptm-checkpoint-summary">{checkpoint.summary}</p>
    {checkpoint.currentState && <p className="ptm-checkpoint-state">{checkpoint.currentState}</p>}
    <Evidence checkpoint={checkpoint} />
    <button
      type="button"
      className="ptm-link"
      onClick={() => onOpenSession(checkpoint.sessionId)}
      title={checkpoint.sessionId}
      disabled={disabled}
    >
      <IconMessage size={12} />
      {sessionLabel(sessionInfo, checkpoint.sessionId)}
      {checkpoint.eventRange ? ` · 事件 ${checkpoint.eventRange.fromSeq}-${checkpoint.eventRange.toSeq}` : ''}
    </button>
  </article>
}

function Evidence({ checkpoint }: { checkpoint: TaskCheckpoint }) {
  const groups = [
    { title: '关键决策', items: checkpoint.decisions, code: false },
    { title: '修改文件', items: checkpoint.modifiedFiles, code: true },
    { title: '验证证据', items: checkpoint.verification, code: false },
    { title: '开放问题', items: checkpoint.openQuestions, code: false },
    { title: '下一步', items: checkpoint.nextSteps, code: false },
  ].filter(group => group.items.length > 0)
  if (groups.length === 0) return null
  const total = groups.reduce((sum, group) => sum + group.items.length, 0)
  return <details className="ptm-evidence">
    <summary>证据与下一步<span className="ptm-count-badge">{total}</span></summary>
    {groups.map(group => <div className="ptm-evidence-group" key={group.title}>
      <strong>{group.title}</strong>
      <ul>
        {group.items.map((item, index) => <li key={`${index}:${item}`}>
          {group.code ? <code>{item}</code> : item}
        </li>)}
      </ul>
    </div>)}
  </details>
}

