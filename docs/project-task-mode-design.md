# DSH「项目任务模式」设计方案

- 状态：已确认
- 日期：2026-10-28
- 目标版本：DeepSeek Harness 0.2.2-rc.1（兼容范围 `>=0.2.1-rc.3 <0.3.0`，见 `package.json` 的 `engines.dsh`）

## 1. 方案结论

不直接修改 DSH 核心，而是实现为：

> 一个 Agent Preset（项目任务模式）+ 一个 Host 任务服务 + 一个 Web 任务看板插件。

DSH 已具备工作区注册表、会话生命周期、持久化存储和 UI Slot，可以覆盖主要需求，升级成本低于维护核心分支。

核心关系定义为：

```text
Workspace  = Project = 项目
Session    = 一次任务执行或交接过程
Task       = 跨 Session 共享的工作单元
Checkpoint = 某次执行开始、阶段推进、结束时的上下文快照
```

一个任务可以被多个会话接续，不永久绑定单一 Session。

## 2. 使用方式

### 开启模式

新增「项目任务」Preset。用户创建会话时选择：

- 普通模式：保持现有行为。
- 项目任务模式：启用任务拆解、上下文召回、状态回写和收尾记录。

### 推荐交互流程

```text
在项目工作区创建会话
        ↓
选择「项目任务模式」
        ↓
召回该项目未完成任务和最近交接
        ↓
用户提出需求
        ↓
创建主任务并拆解子任务
        ↓
记录任务开始快照
        ↓
执行任务，阶段变化时更新状态
        ↓
结束前写入结果、证据、遗留问题和下一步
        ↓
另一个同工作区会话可以召回并继续
```

从看板也可以直接点击「开启任务」或「继续任务」，创建绑定该任务、以任务标题命名的新会话。

## 3. 任务拆解口径

采用以下规则：

> 一个会话有一个主任务，主任务下可以有多个子任务；不是每条用户消息都创建新任务。

- 会话首个实质性需求生成一个主任务。
- 实现步骤、调查项、验证项拆成子任务。
- 后续追问、修复和补充默认归入当前主任务。
- 用户明确提出新需求，或 Agent 判断主题完全切换时，创建新主任务。
- 看板允许手工创建暂时不关联会话的任务。
- 简单问答不强制拆任务，例如“这个字段是什么意思”。

这样既满足任务化，又不会产生大量碎片任务。

## 4. 状态机

| 状态 | 含义 |
| --- | --- |
| `backlog` | 已记录，暂未安排 |
| `todo` | 可以开始 |
| `in_progress` | 正在执行 |
| `paused` | 已暂停，保留了交接上下文 |
| `blocked` | 被信息、依赖、权限或环境阻塞 |
| `in_review` | Agent 已完成实现和自测，等待用户验收 |
| `done` | 用户确认完成 |
| `cancelled` | 不再执行 |

主流程：

```text
backlog → todo → in_progress → in_review → done
                     ↕             ↓
                  blocked       返工
                     ↓
                   todo
```

责任边界：

- Agent 可以将任务推进到 `in_review`。
- 子任务（创建时即为 `todo`）等已直接完成的任务，允许从 `todo` 直接推进到 `in_review`，无需先经过 `in_progress`；这保证 Agent 完成下发的子任务后能直接提交验收，而不会命中非法转移。
- 用户验收后改为 `done`。
- 报告在 `in_review` 的原会话重新进入工作（未经看板「退回修改」）时，视为自动回退修改，任务回到 `in_progress` 并重新绑定该会话。
- 中断、应用退出或异常时不错误地标记完成，而是保留现场并标记为待恢复。
- `blocked` 必须填写具体阻塞原因和解除条件。

## 5. 数据模型

### Task

```ts
interface ProjectTask {
  id: string
  workspaceId: string
  parentId?: string
  rootId: string

  title: string
  description: string
  acceptanceCriteria: string[]

  status: TaskStatus
  priority: 'low' | 'normal' | 'high'
  revision: number

  createdBy: {
    type: 'user' | 'agent'
    sessionId?: string
  }

  createdAt: number
  updatedAt: number
  completedAt?: number

  // Storage Domain v2 为后续 F4 预留；当前不提供归档/软删行为。
  archivedAt?: number
  deletedAt?: number
}
```

### TaskSessionLink

任务和会话是多对多关系：

```ts
interface TaskSessionLink {
  taskId: string
  sessionId: string
  role: 'created' | 'executed' | 'handoff' | 'reviewed'
  firstEventSeq?: number
  lastEventSeq?: number
  linkedAt: number
}
```

不能只保存一个 `sessionId`，否则第二个会话接手后会丢失历史来源。

### TaskCheckpoint

```ts
interface TaskCheckpoint {
  id: string
  taskId: string
  sessionId: string
  kind: 'start' | 'progress' | 'handoff' | 'finish' | 'interrupted'

  summary: string
  currentState?: string
  decisions: string[]
  modifiedFiles: string[]
  lessons?: string[]
  procedures?: string[]
  verification: string[]
  openQuestions: string[]
  nextSteps: string[]

  eventRange?: {
    fromSeq: number
    toSeq: number
  }

  createdAt: number
}
```

另外保留一份追加式 Activity，记录状态变化和人工操作，便于审计。

### 并发控制

- Task 使用 `revision` 做乐观锁。
- 更新时携带预期版本。
- 两个会话同时修改同一任务时，后写入者必须重新读取，不能静默覆盖。
- 当前活跃执行会话写 Checkpoint 时，若仅版本号过期，可重基到刚读取的版本；原子更新仍会再次检查版本和会话所有权。任务已离开该会话时不自动重试。
- 同一任务默认只允许一个活跃执行会话；第二个会话继续时提示交接或并行风险。

## 6. 存储方案

使用 DSH 的 `storageDomain` 持久化任务数据，以原生 `WorkspaceId` 为项目边界。

```text
DSH Storage Domain: project_tasks v2（compatibleVersions: [1]）
├── tasks
├── checkpoints
├── task_session_links
├── activities
├── task_artifacts
├── task_insights
└── recall_audit
```

原则：

- 会话原文仍由 DSH Session Log 保存。
- 任务库保存跨会话共享状态、精简上下文和人工看板修改。
- 不复制完整对话，不直接改写 Session Log。
- Checkpoint 保存会话事件区间，需要详情时回到原会话查阅。
- 第一版存 DSH 本地，不放进项目 Git，避免污染仓库和产生协作冲突。
- v2 新表均为派生/预留数据；权威任务与 Checkpoint 保持原语义，旧 v1 数据通过真实后端 fixture 验证升级。
- `task_insights` 及归档/软删字段只完成 schema 预留，洞察提取与生命周期操作不在当前版本启用。
- 后续可增加导出为 Markdown/JSON 的能力。

工作区标识使用 `WorkspaceId`，目录路径只用于显示和初次解析，避免修改会话 cwd 后任务串项目。

## 7. Agent 工具设计

第一版控制在少量工具，看板和 Agent 工具调用同一个 Host Service。

### `project_task_start`

创建或认领任务，可以同时提交子任务拆解和验收标准。新建主任务时 `title` 可选，缺省时从 `summary` 首行派生（去 Markdown 标记、截断到 120 字符内）。

写入：

- 主任务和子任务。
- 当前 Session 关联。
- `in_progress` 状态。
- 开始 Checkpoint：目标、已知上下文、计划、约束。

### `project_task_update`

用于修改任务状态、标题、描述、验收标准和子任务，以及设置阻塞原因。

### `project_task_checkpoint`

记录阶段进度或最终交接：

- 已完成内容。
- 关键决策。
- 修改文件。
- 验证结果。
- 遗留问题。
- 推荐下一步。
- 可选原始经验与操作流程（`lessons/procedures`），按 Checkpoint 原值持久化。

Agent 同时通过 `tools/result` 同步观察成功的文件工具调用，并在调用 Checkpoint 时显式携带观察快照。Host 按 Session 绑定时间过滤，将自动路径与手工 `modifiedFiles` 稳定去重后写入权威 Checkpoint，再 best-effort 更新文件台账；只有权威写成功才确认本次观察，失败可随下次 Checkpoint 重试。observer 不直接写 Host，也不承诺进程退出补写。

### `project_task_list`

按当前工作区查询任务，支持状态、关键词和父子关系过滤。

### `project_task_get`

读取单个任务的完整详情、Checkpoint 和会话关联。

## 8. 生命周期与可靠性设计

### 任务开始

在项目任务模式中：

1. 会话创建时解析并绑定 Workspace。
2. 注入当前项目的未完成任务摘要。
3. 用户提出实质需求后，Agent 调用 `project_task_start`。
4. 开始 Checkpoint 落库后，才允许执行有副作用的工作。

为了防止模型忘记创建任务：

- 任务建立前允许读取、搜索等分析操作。
- `bash` 对可完整解析的只读命令做保守豁免：支持用 `;`、`&&`、`||`、`|`、换行连接的复合命令，只要每一段都是只读命令即放行。此外支持 `for NAME in 列表; do <只读命令序列>; done` 形式的只读循环，循环体逐条校验，并允许循环变量等以 `$VAR`/`${VAR}` 形式引用（`$(...)` 命令替换与反引号仍拒绝）。只读白名单覆盖探查类命令（`pwd`、`ls`、`cat`、`head`、`tail`、`wc`、`grep`、`rg`、`find`（无 `-delete`/`-exec` 等写语义）、`sed -n`（纯打印脚本）、`git status`/`log`/`diff`/`show`/`branch --list` 等）。重定向仅在可证明不写文件时豁免：`2>/dev/null`（含操作符后的空白）、`>/dev/null`、`1>/dev/null`、`2>&1`、`1>&2` 及其安全组合；追加、文件目标、输入重定向、其他文件描述符与不完整目标仍拒绝。命令替换、反引号、子 shell/命令分组、后台 `&`、写文件参数（如 `sort -o`、`tree -o`、`git diff --output`）、未知或带写语义的命令仍按副作用处理。因重定向拒绝时，错误中附带具体操作符与安全范围，避免与任务未绑定混淆。
- 对写文件、执行命令等有副作用工具增加前置保护。
- 未建立任务时提示先调用 `project_task_start`，而不是悄悄跳过任务记录。

### 执行过程中

不要求每次工具调用都写 Checkpoint，只在以下时机记录：

- 子任务状态变化。
- 作出关键技术决策。
- 完成一个可交接阶段。
- 出现阻塞。
- 用户改变需求或验收标准。

避免高频写入和上下文膨胀。

### 正常结束

Agent 输出最终答复前调用 `project_task_checkpoint`：

- 已完成并自测：进入 `in_review`。
- 尚未完成：进入 `paused` 或保持 `in_progress`。
- 无法继续：进入 `blocked` 并写明原因。
- 记录验证证据和下一步。

### 待验收会话重新进入（自动回退修改）

任务进入 `in_review` 时会清除执行会话绑定（`activeSessionId`）。如果用户没有在看板点「退回修改」，而是直接回到原会话继续对话要求改进：

- 当该会话再次发起副作用工作（`bash` / `write` / `edit` 等）时，`tools/pre-execute` 门禁在拒绝前会尝试把该会话绑定的 `in_review` 任务原子地回退为 `in_progress` 并重新绑定当前会话（`revision + 1`，记录 `resumed` 活动），随后放行。
- 若会话绑定的任务已是 `in_progress` 但执行会话被清除（例如看板把任务从 `in_review` 退回 `in_progress`，而 update 使用 user actor 不带 `sessionId`），同一会话也会重新接管它。
- `project_task_start` 在没有显式 `taskId`、且会话存在上述可接管任务时，会 `claim` 原任务而不是新建重复任务。
- 并发保护不削弱：已被其他会话占用、或处于 `done` / `paused` / `blocked` 的任务不会被自动接管；`activeSessionId` 属于其他会话时 `claim` 仍报 `active-session-conflict`。
- 仅在真正再次发起工作时回退（lazy），不在每轮 `turn/start` 就回退，避免纯问答把任务误翻成进行中再被兜底暂停。

### 同一会话内切换到新主任务（主题切换）

- 一个会话始终只保留一个活动主任务。当 `project_task_start` 未带 `taskId`、而该会话已有一个**进行中**的主任务、且调用方给出的标题与当前任务不同，视为主题切换：先把旧任务以 `handoff` Checkpoint 暂停（保留交接上下文并清除其 `activeSessionId`），再新建主任务并绑定本会话。
- 新建成功后，宿主会把会话标题同步为新任务标题，避免标题停留在旧任务。
- 若标题与当前活动任务相同，则视为对当前任务的幂等重入，复用已有任务、不新建重复任务。
- 会话的「绑定任务」以当前活动主任务优先，其次才回退到最近一条 `task_session_links` 记录，避免历史 link（交接或对其它任务的 Checkpoint）把任务页签指向并非当前在做的任务。
- 背景：早期实现中，`project_task_start` 在无 `taskId` 时会无条件 `claim` 会话上任意 `in_progress` 的 `activeSessionId` 任务（包括看板「继续任务」刚建立、尚未实际开工的旧任务），导致用同一会话开展新任务时被静默吞并成旧任务的交接，标题与页签都停留在旧任务。该问题已通过上述规则修复。

### 忘记收尾或异常中断

利用 `agent/turn-stopping`、`turn/end` 等生命周期补充兜底：

- 未写结束 Checkpoint 时，根据已有工具记录生成降级快照。
- 标记 `interrupted` 或“交接信息不完整”。
- 不自动宣称任务完成。
- 下次会话优先提示恢复该任务。

兜底记录不能替代 Agent 主动总结，因为工具日志无法可靠推断所有决策和意图。

## 9. 跨会话上下文召回

不每次注入整个项目任务库，而是生成最小上下文包。

### 新会话默认注入

```text
当前项目
├── 进行中的任务：最多 3 个
├── 阻塞任务：最多 2 个
├── 最近交接：最多 2 份
└── 每个任务仅包含标题、状态、最新摘要和任务 ID
```

### 绑定具体任务后注入

- 任务目标和范围。
- 验收标准。
- 未完成的子任务。
- 最近一次 Checkpoint。
- 关键决策。
- 阻塞和开放问题。
- 可回查的 Session 与事件区间。

完整历史和旧 Checkpoint 由 Agent 按需调用 `project_task_get` 获取。

当前默认启用 F2 shadow：Host 同时生成原四桶 `legacyPackage` 和评分/预算后的 `gatedPackage`，Agent 仍注入 legacy，并记录一次召回归总审计。绑定任务始终直通。只有后续达到召回质量、预算和性能门槛后，才通过 `recallGate.mode=actual` 灰度切换；`recallGate.enabled=false` 可回到仅 legacy 路径。

动态内容通过 `agent.inject()` 注入；Preset 的系统提示词只保存任务工作纪律，避免每轮重复携带大段项目历史。

## 10. 工作区任务看板

### 入口

利用现有 UI Slot：

- `sidebar.panellist`：增加「任务」入口。
- `main`：注册独立的 `project-tasks` 主面板。
- `conversation.composer.dock`：后续可显示当前会话绑定任务。

不替换现有会话页和侧栏。

### 看板布局

```text
┌ 当前项目：my-ai-notebook ─── 搜索 / 筛选 / 新建任务 ┐
├──────────┬──────────┬──────────┬──────────┤
│ 待处理   │ 进行中   │ 待验收   │ 已完成   │
│          │          │          │          │
│ 任务卡片 │ 任务卡片 │ 任务卡片 │ 任务卡片 │
└──────────┴──────────┴──────────┴──────────┘
```

默认显示 `todo / in_progress / in_review / done`；`backlog / paused / blocked / cancelled` 通过「全部状态」查看。阻塞、暂停和交接不完整的任务会同时进入「需要关注」区域，避免在默认视图中丢失。

页面按「页头 / 概览 / 工具栏 / 看板 / 详情」组织：

- 页头：当前项目、路径、同步状态和新建任务。
- 概览：主流程各状态计数与需要关注数量。
- 工具栏：即时搜索、状态视图和刷新。
- 看板：四列主流程，列头带状态色和计数，卡片展示优先级、父子任务进度、最近会话与更新时间。
- 详情：宽屏为常驻侧栏，窄屏为抽屉，移动宽度为全屏页面。

### 任务卡片

显示标题和任务编号、状态、优先级、父子任务进度、当前或最近处理会话、最近更新时间，以及阻塞或交接不完整标记。

### 任务详情

采用抽屉或详情页，包含：

- 描述与验收标准。
- 子任务。
- 状态流转。
- Checkpoint 时间线。
- 关联会话列表。
- 修改文件与验证证据。
- 文件台账（最近 20 条）与召回解释（最近 5 条），含 shadow/actual、保留/候选数量、字符预算和拒绝原因。
- 「开启任务 / 继续任务」「打开执行会话 / 打开最近会话」「通过验收 / 退回修改」等状态感知动作。

详情面板采用阅读态与编辑态分离：进入编辑后所有跳转与会话动作都会被禁用，底部保存条提示未保存修改；关闭详情时若有未保存内容会被拦截，避免误丢草稿。

看板开启或继续任务时创建新 Session，并显式绑定 Task；同时把新会话标题设置为任务标题。不会把旧对话全文复制进新会话。

## 11. 模块划分

```text
项目任务 Bundle
├── Agent Preset
│   ├── 项目任务工作纪律
│   └── 任务工具挂载
│
├── Host Plugin
│   ├── ProjectTaskService
│   ├── Storage Domain
│   ├── Workspace 绑定
│   ├── Agent Tools
│   ├── 生命周期与兜底 Checkpoint
│   └── Web Remote API
│
└── Client Plugin
    ├── 看板入口与主面板
    ├── 任务详情
    ├── 状态编辑
    └── 会话跳转与任务继续
```

Host Service 是唯一业务入口，Agent 工具、看板按钮和后续命令都复用它。

## 12. 实施阶段

### 第一阶段：任务闭环 MVP

- ProjectTaskService 与持久化数据结构。
- 任务 CRUD、Session 关联、Checkpoint。
- 项目任务 Preset。
- 开始、更新、结束工具。
- 同工作区新会话召回并继续任务。

### 第二阶段：任务看板

- 看板入口和主面板。
- 状态列、筛选、任务详情。
- 状态编辑和关联会话跳转。
- 从看板创建接续会话。

### 第三阶段：可靠性完善

- 未创建任务时的副作用工具保护。
- 中断和异常兜底。
- 乐观锁与活跃执行冲突处理。
- 大数据量分页、归档和数据迁移。
- Token 注入量与任务恢复成功率统计。

### 第四阶段：可观测沉淀与召回评估（当前）

- F7：固定数据集 benchmark、JSON/Markdown 报告和真实 v1→v2 fixture。
- F1：文件工具同步观察、Checkpoint 显式合并、文件台账与失败重试。
- F2 shadow：legacy/gated 双包、聚合召回审计和详情解释；默认注入仍为 legacy。
- F2 actual、F3 洞察和 F4 生命周期治理分别在后续阶段验收，不随本阶段默认启用。

## 13. 验收场景

至少验证：

1. 会话 A 创建任务并拆解子任务，看板实时出现。
2. 会话 A 完成后记录修改文件、验证结果和下一步。
3. 同工作区会话 B 能召回任务并继续，不需要用户重复背景。
4. 不同工作区的会话看不到该项目任务。
5. 从看板打开历史会话，能定位到原处理过程。
6. Agent 中断后，任务不会错误进入 `done`。
7. 两个会话同时更新任务时不会出现静默覆盖。
8. 普通模式完全不受任务机制影响。
9. 重启 DSH 后任务、Checkpoint 和会话关联仍然存在。
10. 大型项目历史任务较多时，不会把全部任务注入上下文。

## 14. 已确认决策

1. 一个会话对应一个主任务，子任务拆解；不是每条消息新建任务。
2. Agent 完成到 `in_review`，用户验收后 `done`。
3. 数据存 DSH 本地 Storage Domain，第一版不写项目目录。
4. 以可选 Preset + 插件交付，不修改现有普通模式和 DSH 核心分支。
