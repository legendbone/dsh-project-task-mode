# DSH Project Task Mode

为 DeepSeek Harness（DSH）设计并实现「项目任务模式」：以工作区为项目边界，将对话拆解为可持续推进的任务，在同工作区的会话间共享任务状态和交接上下文，并提供工作区任务看板。

## 文档

- [项目任务模式设计方案](docs/project-task-mode-design.md)

## 已确认的设计决策

1. 一个会话对应一个主任务，主任务下可以拆解子任务；不是每条消息都创建任务。
2. Agent 完成实现和自测后进入 `in_review`，由用户验收后进入 `done`。
3. 第一版数据存入 DSH 本地 Storage Domain，不写入项目目录。
4. 通过可选 Agent Preset 与 Host/Client 插件交付，不维护 DSH 核心分支。

## 当前状态

设计已确认，尚未开始实现。
