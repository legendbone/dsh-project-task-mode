import type { Context } from '@deepseek-ai/cordis'
import { errorMessage } from '../shared/errors.ts'
import type { ProjectTaskController } from '../host/remote.ts'

export function registerTaskLifecycle(ctx: Context, controller: ProjectTaskController): void {
  const turnStarts = new Map<string, number>()
  const completedTurns = new Set<string>()

  async function interrupt(sessionId: string, turn: number, reason: string): Promise<void> {
    const key = `${sessionId}:${turn}`
    if (completedTurns.has(key)) return
    completedTurns.add(key)
    try {
      const fromSeq = turnStarts.get(key) ?? turnStarts.get(sessionId) ?? 0
      await controller.interruptSession(sessionId, reason, { fromSeq, toSeq: fromSeq })
      turnStarts.delete(key)
      turnStarts.delete(sessionId)
    } catch (error) {
      completedTurns.delete(key)
      ctx.logger.warn(`project-task interrupted checkpoint failed: ${errorMessage(error)}`)
    }
  }

  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/start') {
      turnStarts.set(`${session.id}:${event.data.turn}`, event.seq)
      turnStarts.set(session.id, event.seq)
      return
    }
    if (event.type !== 'turn/end') return
    const key = `${session.id}:${event.data.turn}`
    const fromSeq = turnStarts.get(key) ?? event.seq
    completedTurns.add(key)
    void controller.interruptSession(
      session.id,
      '会话轮次结束前没有写入任务收尾 Checkpoint。',
      { fromSeq, toSeq: event.seq },
    ).catch(error => ctx.logger.warn(`project-task turn fallback failed: ${errorMessage(error)}`))
    turnStarts.delete(key)
    turnStarts.delete(session.id)
  })

  ctx.on('agent/error', ({ agent, turn }) => {
    void interrupt(agent.session.id, turn, 'Agent 轮次异常失败，未写入任务收尾 Checkpoint。')
  })

  ctx.on('agent/disposed', ({ agent }) => {
    void controller.interruptSession(
      agent.session.id,
      'Agent 在写入任务收尾 Checkpoint 前被释放。',
    ).catch(error => ctx.logger.warn(`project-task disposal fallback failed: ${errorMessage(error)}`))
  })
}
