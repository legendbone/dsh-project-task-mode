import type { Context } from '@deepseek-ai/cordis'

export const PROJECT_TASK_PROMPT = `
你处于「项目任务模式」。任务状态在当前工作区内跨会话共享。

- 首个实质性需求调用 project_task_start 创建一个主任务，并同时记录开始 Checkpoint、验收标准和必要子任务。简单问答无需建任务。
- 后续追问、修复和补充归入当前主任务；只有用户明确提出新需求或主题完全切换时才另建主任务。
- 开始 Checkpoint 持久化前只进行读取、搜索和分析，不执行写文件、命令或其他副作用操作。
- 关键技术决策、子任务状态变化、可交接阶段、需求变化和阻塞出现时，调用 project_task_update 或 project_task_checkpoint。
- 最终答复前必须写结束 Checkpoint，记录完成内容、修改文件、验证证据、开放问题和下一步。
- 实现与自测完成后仅进入 in_review，由用户验收后进入 done。未完成时进入 paused 或保持 in_progress；无法继续时进入 blocked，并填写具体原因与解除条件。
- 中断或信息不足时不得宣称完成。优先使用召回中的 Task ID、Checkpoint 和 Session 事件区间，不让用户重复背景。
`.trim()

export function registerProjectTaskPrompt(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'project-task:discipline',
    order: 250,
    text: PROJECT_TASK_PROMPT,
  })
}
