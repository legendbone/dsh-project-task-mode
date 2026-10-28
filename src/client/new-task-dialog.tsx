import { useEffect, useState, type FormEvent } from 'react'
import type { CreateManualTaskInput, TaskDetails, TaskPriority } from '../shared/types.ts'
import type { ProjectTaskActions } from './actions.ts'
import { formatTaskError } from './errors.ts'
import { IconClose, IconPlus } from './icons.tsx'
import { PRIORITY_SHORT } from './labels.ts'

const PRIORITIES: readonly TaskPriority[] = ['low', 'normal', 'high']

interface NewTaskDialogProps {
  workspaceId: string
  workspaceTitle: string
  initialStatus: 'todo' | 'backlog'
  actions: ProjectTaskActions
  onClose(): void
  onCreated(details: TaskDetails): void
}

export function NewTaskDialog({ workspaceId, workspaceTitle, initialStatus, actions, onClose, onCreated }: NewTaskDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [criteria, setCriteria] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [status, setStatus] = useState<'todo' | 'backlog'>(initialStatus)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (busy) return
    if (!title.trim()) {
      setError('请先填写任务标题。')
      return
    }
    setBusy(true)
    setError('')
    const input: CreateManualTaskInput = {
      workspaceId,
      title: title.trim(),
      description: description.trim(),
      acceptanceCriteria: criteria.split('\n').map(item => item.trim()).filter(Boolean),
      priority,
      status,
    }
    try {
      onCreated(await actions.create(input))
    } catch (cause) {
      setError(formatTaskError(cause))
    } finally {
      setBusy(false)
    }
  }

  return <div
    className="ptm-modal-layer"
    role="presentation"
    onMouseDown={event => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}
  >
    <div className="ptm-modal" role="dialog" aria-modal="true" aria-labelledby="ptm-new-task-title">
      <header className="ptm-modal-head">
        <div className="ptm-modal-title">
          <span className="ptm-modal-icon"><IconPlus size={17} /></span>
          <div>
            <h2 id="ptm-new-task-title">新建任务</h2>
            <p>在「{workspaceTitle}」中记录一件要做的事</p>
          </div>
        </div>
        <button type="button" className="ptm-icon-button" aria-label="关闭" onClick={onClose} disabled={busy}>
          <IconClose size={16} />
        </button>
      </header>

      <form className="ptm-modal-form" onSubmit={event => void submit(event)}>
        <label className="ptm-field">
          <span className="ptm-field-label">任务标题</span>
          <input
            autoFocus
            required
            maxLength={300}
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="例如：优化项目任务看板的空状态"
          />
        </label>

        <div className="ptm-field-row">
          <div className="ptm-field">
            <span className="ptm-field-label">优先级</span>
            <div className="ptm-segmented" role="group" aria-label="优先级">
              {PRIORITIES.map(value => <button
                key={value}
                type="button"
                className={priority === value ? 'is-active' : undefined}
                aria-pressed={priority === value}
                onClick={() => setPriority(value)}
              >{PRIORITY_SHORT[value]}</button>)}
            </div>
          </div>
          <div className="ptm-field">
            <span className="ptm-field-label">初始状态</span>
            <div className="ptm-segmented" role="group" aria-label="初始状态">
              <button type="button" className={status === 'todo' ? 'is-active' : undefined} aria-pressed={status === 'todo'} onClick={() => setStatus('todo')}>待处理</button>
              <button type="button" className={status === 'backlog' ? 'is-active' : undefined} aria-pressed={status === 'backlog'} onClick={() => setStatus('backlog')}>待规划</button>
            </div>
          </div>
        </div>

        <label className="ptm-field">
          <span className="ptm-field-label">描述<span className="ptm-field-optional">可选</span></span>
          <textarea
            rows={3}
            value={description}
            onChange={event => setDescription(event.target.value)}
            placeholder="补充背景、目标或约束，便于之后开启会话时理解任务。"
          />
        </label>

        <label className="ptm-field">
          <span className="ptm-field-label">验收标准<span className="ptm-field-optional">每行一条</span></span>
          <textarea
            rows={3}
            value={criteria}
            onChange={event => setCriteria(event.target.value)}
            placeholder={'例如：\n浅色与深色主题下都保持清晰\n窄屏下详情面板可正常使用'}
          />
        </label>

        {error && <p className="ptm-form-error" role="alert">{error}</p>}

        <footer className="ptm-modal-foot">
          <span className="ptm-modal-hint">创建后可以从详情面板开启一个同名会话。</span>
          <div className="ptm-modal-actions">
            <button type="button" className="ptm-button" onClick={onClose} disabled={busy}>取消</button>
            <button type="submit" className="ptm-button ptm-primary" disabled={busy}>{busy ? '创建中…' : '创建任务'}</button>
          </div>
        </footer>
      </form>
    </div>
  </div>
}
