# DSH Project Task Mode

为 DeepSeek Harness（DSH）实现「项目任务模式」：以工作区为项目边界，将对话拆解为可持续推进的任务，在同工作区的会话间共享任务状态和交接上下文，并提供工作区任务看板。

当前版本：`0.1.12`。目标宿主：DeepSeek Harness `0.2.1-rc.5`。

## 已实现

- 可选 `project-task` Agent Preset，普通 `standard` 模式不加载任务工具、提示词或生命周期钩子。
- 主任务与子任务、验收标准、优先级、状态机、阻塞原因和解除条件。
- 任务与 Session 多对多关联，以及 `start / progress / handoff / finish / interrupted` Checkpoint。
- Revision 乐观锁、活跃执行 Session 冲突检测和追加式 Activity 审计。
- Agent 只能推进到 `in_review`；用户在看板验收后才能进入 `done`。
- 开始副作用工作前的任务门禁，以及遗漏收尾或异常中断时的降级 Checkpoint。
- 有界跨会话召回：进行中最多 3 个、阻塞最多 2 个、最近交接最多 2 份；绑定任务另注入详情。
- 工作区看板：项目切换、概览统计、需要关注区域、搜索与状态视图、手工新建、任务卡片、阅读/编辑两态的详情面板、Checkpoint 时间线、关联 Session 和活动记录。
- 看板跟随 DSH 主题（浅色/深色/跟随系统），颜色、表面、边框、状态徽章、圆角和字体均取自 DSH 语义 Token；桌面、窄屏和移动宽度分别使用侧栏、抽屉和全屏详情。
- 详情动作随状态变化：未开始的任务显示「开启任务」，有历史的任务显示「继续任务」，活跃会话优先「打开执行会话」；待验收任务直接提供「通过验收 / 退回修改」。
- 从看板开启或接续任务时，新会话以任务标题命名，并自动注入最近的交接与未完成子任务。
- 从看板开启或接续任务后，输入框预填「开始任务：<标题>」或「继续任务：<标题>」，可直接发送；预填失败不影响会话打开。
- DSH 本地 Storage Domain 持久化，不写入项目 Git 目录。

## 安装

需要 Node.js `^22.19.0 || >=24`、DSH `0.2.1-rc.5` 和 `pnpm`。

### Web / CLI profile

```bash
npm pack
npx @deepseek-ai/dsh@0.2.1-rc.5 plugin --profile web add ./dsh-project-task-mode-0.1.12.tgz
```

### DeepSeek Harness Desktop

桌面版的 `desktop` profile 由 Electron 独占管理，`dsh plugin --profile desktop` 会被启动器拒绝。在应用侧栏的「插件」页安装本地的 `.tgz` 即可：插件管理器会复用应用内置的 pnpm，在运行中的 Host 上完成安装；首次安装会热应用，不需要重启应用。升级已经加载的插件时，插件管理器会提示需要重启，重启应用后新版本生效。安装完成后侧栏出现「项目任务」，新建会话时可以选择「项目任务」。

如果侧栏或预设没有立即出现，刷新一次窗口（macOS `Cmd+R`）。

## 首次使用

Web profile 安装后需要重启 DSH Web；Desktop 安装后刷新窗口即可。

1. 在侧栏点击「项目任务」打开工作区看板；看板会跟随当前选中会话切换所属项目，也可手动切换项目。
2. 新建会话时在 Agent Preset 中选择「项目任务」。
3. 提出实质需求后，Agent 会创建主任务并记录开始 Checkpoint。
4. Agent 完成实现和自测后，任务进入「待验收」；在详情中确认后改为「已完成」。
5. 点击「开启任务」或「继续任务」会创建绑定该任务、以任务标题命名的新会话，并注入最近交接，不复制旧对话全文；输入框会预填对应的「开始任务：<标题>」或「继续任务：<标题>」，确认后直接发送即可。

## Agent 工具

- `project_task_start`：创建或认领主任务、拆解子任务并写开始 Checkpoint。
- `project_task_update`：按预期 Revision 更新任务、状态或追加子任务。
- `project_task_checkpoint`：记录决策、修改文件、验证证据、开放问题和下一步。
- `project_task_list`：查询当前工作区任务。
- `project_task_get`：读取任务、子任务、Checkpoint、Session 关联和 Activity。

## 开发与构建

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run build
npm run check
npm pack --dry-run
```

构建产物：

- `lib/index.js`：Host Service 与 Typert Remote。
- `lib/agent.js`：Preset 专属工具、提示词、召回、门禁和生命周期。
- `lib/client.js`：Web 看板。
- `lib/remote-client.js`：共享 Remote contract。
- `lib/types/`：TypeScript 声明。

`cordis.patch.yml` 同时注册全局 Host Service 和独立 `project-task` Preset。Agent 与看板都调用同一个 `ProjectTaskService`，不修改 DSH 核心。

## 数据与状态

Storage Domain：`project_tasks`，包含 `tasks`、`checkpoints`、`task_session_links` 和 `activities` 四张表。项目身份使用原生 `WorkspaceId`，目录路径仅用于显示和工作区解析。

主流程：

```text
backlog → todo → in_progress → in_review → done
                     ↕             ↓
                  blocked       返工
```

## 验证情况

`0.1.12` 已在 DSH `0.2.1-rc.5` 下通过自动化检查、Host/Agent 模块导入、隔离 profile 安装和配置组合验证。以下端到端功能此前已在隔离的真实 DSH `0.2.1-rc.3` Web 实例中验证：

- 看板创建、状态流转和用户验收。
- Agent 一次调用创建主任务、子任务和开始 Checkpoint，再干净地进入 `in_review`。
- 看板展示修改证据、Checkpoint、Activity 和关联 Session。
- 从看板创建接续会话，新会话无需工具调用即可复述绑定任务、最近交接和未完成子任务。
- 从看板开启或继续任务时，输入框预填「开始任务：<标题>」/「继续任务：<标题>」，发送按钮可用；会话标题等于任务标题，绑定任务与召回正常注入。
- 新会话标题与任务标题一致；在浅色、深色、1024px 和移动宽度下检查了看板与详情面板。
- 重启后任务、Checkpoint、Session 关联和 Activity 仍可读取。

## 当前边界

第一阶段暂不提供任务归档、存储格式迁移、Token 注入量或恢复成功率统计。不同工作区隔离、Revision 冲突和活跃 Session 冲突已有 Host 强制逻辑，但尚未形成独立的自动化测试套件。

设计文档：[项目任务模式设计方案](docs/project-task-mode-design.md)。
