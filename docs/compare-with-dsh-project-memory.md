# dsh-project-memory vs dsh-project-task-mode 对比

- 对比对象：
  - `@yolk_vat-y/dsh-project-memory`（作者 00080000，版本 0.6.9，仓库 github.com/00080000/dsh-project-memory）
  - `dsh-project-task-mode`（本地仓库，版本 0.1.20，目标 DSH 0.2.2-rc.1，兼容 `>=0.2.1-rc.3 <0.3.0`）
- 日期：2026-11-04

## 0. 一句话定位

| | dsh-project-memory | dsh-project-task-mode |
| --- | --- | --- |
| 核心 | **项目「记忆」系统**：把文档、代码符号、经验、洞察索引成可检索的跨会话记忆 | **项目「任务」系统**：把对话拆成可跨会话推进、交接、验收的任务流程 |
| 任务是主角吗 | 否。TaskBridge 是「记忆的副产品」，被动从 todo / 文件读取沉淀 | 是。任务是唯一主角，有状态机、验收、交接、门禁 |
| 一句话 | 解决「项目里有什么、之前踩过什么坑」 | 解决「做到哪、谁在做、怎么交接、谁来验收」 |

两者不是同类竞品，而是**知识记忆层**与**任务流程层**两个不同切面，概念上有重叠、定位上互补。

## 1. 交付形态与架构

| 维度 | dsh-project-memory | dsh-project-task-mode |
| --- | --- | --- |
| 语言/构建 | 纯 JS（`src/*.js`），`main: src/index.js`，无 TS 构建；客户端 `client/client.js` 预构建 | TS 源码，esbuild + tsc 构建到 `lib/`（index/agent/client/remote-client） |
| 插件形态 | 单 bundle，一个 `cordis.patch.yml` 插入 `project-memory` 一条 | 三段式：Host Service（`dsh-project-task-mode`）+ 可选 Agent Preset（`project-task`）+ 客户端看板（`/client`），用 typert remote 契约连接 |
| 是否可选加载 | 全局加载 | **Preset 可选**：普通 `standard` 模式不加载任务工具/提示词/钩子 |
| 依赖 | `pdfjs-dist`；peer 用宽版本范围，node `>=18` | `zod`；`engines.dsh`/peer 用范围 `>=0.2.1-rc.3 <0.3.0`（devDep 仍钉精确版本），node `^22.19 \|\| >=24` |
| 扩展点 | 注册 `/tasks` slash 命令 + `project-memory` skill + 客户端面板/设置卡 | 注册 5 个 Agent 工具 + systemPrompt 段 + 生命周期钩子 + 客户端 main 面板 |
| 与宿主耦合 | 通过稳定公共 API（peer），尽量低耦合 | 依赖 storageDomain / workspaceRegistry / sessionController / typert 等宿主服务，深度集成 |

## 2. 数据模型与持久化

| 维度 | dsh-project-memory | dsh-project-task-mode |
| --- | --- | --- |
| 存储位置 | 每项目根下 `.dsh-project-memory/` 目录（分片 JSON）；global 在 `~/.config/dsh-project-memory/` | DSH **Storage Domain** `project_tasks`（`per-record` 布局） |
| 是否写项目 Git | 目录自我 gitignore，不污染仓库 | 存 DSH 本地，**完全不写项目目录** |
| 项目边界 | 项目根目录（VCS/清单标记推导，可配置 roots） | 原生 `WorkspaceId`（目录仅用于显示/解析） |
| 主要表/文件 | `shards/`（按源文件）、`tasks.json`、`binding.json`、`insights.json`、`vectors.json`、`watch.json`、`injection-audit.jsonl`、`admission-shadow.jsonl` | `tasks`、`checkpoints`、`task_session_links`、`activities` 四表 |
| 增量/一致性 | 内容哈希增量重抽；短时 `.write.lock` 目录锁；分片损坏隔离；双实例可共享 | revision 乐观锁；活跃 Session 冲突检测；追加式 Activity 审计 |
| 迁移 | v2 分片布局，自带格式标记 | 第一阶段明确「不提供存储格式迁移」 |

## 3. 任务模型（重叠最大的地方）

| 维度 | dsh-project-memory（TaskBridge） | dsh-project-task-mode |
| --- | --- | --- |
| 任务从哪来 | **被动沉淀**：会话 `todo/write` 或读过的文件自动建档（子代理不建档） | **主动创建**：Agent 首个实质需求调 `project_task_start`，或看板手工新建 |
| 任务字段 | id（root+title+时间+随机）、steps（todo 镜像）、files/fileMeta（读/写热度排序）、archived、insights、lastSessionId | id、workspace、parent/root 父子、title、description、acceptanceCriteria、status、priority、revision、blockedReason/unblockCondition、activeSessionId、handoffIncomplete |
| 状态 | 轻量：主要靠 steps 进度，只有 `archived` 一个显式生命周期位 | 重状态机：`backlog→todo→in_progress→in_review→done`，含 `paused/blocked/cancelled` 与合法转移约束 |
| 验收 | 无 | 有：Agent 只能到 `in_review`，用户验收后 `done` |
| 交接 | 任务卡（steps+files+insights）随会话绑定重建清单 | 结构化 `TaskCheckpoint`（start/progress/handoff/finish/interrupted），含决策/修改文件/验证/开放问题/下一步/事件区间 |
| 会话关联 | 单绑定：sessionId → taskId（binding.json） | 多对多 `TaskSessionLink`（created/executed/handoff/reviewed） |
| 任务工具 | `list_tasks`、`select_task`、`archive_task`、`show_task_panel` | `project_task_start/update/checkpoint/list/get` |
| 归档 | 有（archived，select 可恢复，停止同步） | 第一阶段**明确不提供归档** |

## 4. 召回与上下文注入

| 维度 | dsh-project-memory | dsh-project-task-mode |
| --- | --- | --- |
| 召回对象 | 文档块 / 代码符号 / 经验笔记 / 分层 insight，混合打分合并排序 | 任务（进行中/阻塞/最近交接）+ 绑定任务详情 |
| 检索方式 | BM25 式词法为主，可选 leanvec 语义重排；可选 LLM 查询扩展；带 `路径:行号` 引用 | 无检索，按 workspace 取任务包 |
| 注入内容 | autoContext 静默注入：常驻任务卡 + 受门槛约束的条目；四条阈值通道（coverage/matched/support/ratio）、审计日志、shadow log、预算熔断 | 新会话注入最小上下文包：进行中≤3、阻塞≤2、最近交接≤2；绑定任务另注入验收标准/子任务/最近 checkpoint/决策/开放问题/可回查 session+事件区间 |
| 注入纪律 | 语料正文永不触发注入；只有宿主事实与真人不可逆动作触发全文；统计通道默认沉默 | 静态 systemPrompt 只放「任务工作纪律」；动态内容 `agent.inject()`；按需 `project_task_get` 拉全量 |
| 上下文膨胀控制 | 分块 ≤300 字符摘要 + 有界词项；条目通道有每会话硬上限 | 不复制对话全文；只注入摘要，完整历史回查原 session |

## 5. UI

| 维度 | dsh-project-memory | dsh-project-task-mode |
| --- | --- | --- |
| 主面板 | TaskPanel：工作流卡片，可拖拽、可缩成迷你条、可隐藏，四种外观风格 | 工作区任务看板：项目切换、概览统计、需要关注、搜索/状态视图、四列看板、任务卡片 |
| 详情 | 分级记忆视图（任务/项目/全局），列表新→旧增量加载、每页 30、离屏不渲染 | 阅读/编辑两态详情：描述、验收标准、子任务、状态流转、checkpoint 时间线、关联 session、活动记录 |
| 入口 | 唯一用户命令 `/tasks`（web 菜单「工作流」组），其余为卡片子动作 | 侧栏「项目任务」入口 + `main` 独立面板 |
| 主题/响应式 | 四档外观只改材质/几何/字型，颜色跟随宿主 | 完全跟随 DSH 语义 Token；桌面侧栏 / 窄屏抽屉 / 移动全屏 |
| 会话联动 | 卡片驱动工作流；BroadcastChannel 跨标签同步 | 从看板「开启/继续任务」创建绑定任务、以任务标题命名的新会话，输入框预填「开始/继续任务：<标题>」，注入最近交接 |
| 状态感知动作 | 切换/归档/绑定/改名/步骤编辑 | 开启任务/继续任务/打开执行会话/通过验收/退回修改 |

## 6. 生命周期与可靠性

| 维度 | dsh-project-memory | dsh-project-task-mode |
| --- | --- | --- |
| 自动刷新 | watch 轮询 + 懒索引（读到即记）+ 回合结束补扫 | 无文件监听；靠 Agent 主动 checkpoint |
| 并发 | 目录锁 + 退出 flush，允许两个 dsh 实例共享存储 | revision 乐观锁 + 活跃 session 冲突检测 + rebase 规则 |
| 漏做保护 | 无（任务是被动沉淀） | 有：开始工作前门禁（未建任务时拦副作用工具，只放行只读命令） |
| 异常兜底 | 分片损坏改名重索引 | `turn/end` / `agent/error` / `agent/disposed` 兜底写 `interrupted` checkpoint，绝不自动宣称完成 |
| 回退语义 | — | `in_review` 会话再次发起副作用时惰性自动回退 `in_progress` 并重绑 |
| 去重/沉淀 | 经验笔记近重复合并/覆盖；insight 衰减提升 | 无去重；checkpoint 手填 |

## 7. 重叠 / 差异 / 互补

**重叠（容易让人觉得「像」）**
- 都以「项目/工作区」为边界，都提供跨会话连续性与「不用重复梳理项目」。
- 都有任务概念 + 任务面板/看板 + 任务类工具（list/select）+ 自动注入。
- 都强调「上下文易失、记忆/任务持久化」。

**本质差异**
- memory 是**知识记忆检索系统**（文档/符号/经验/insight 的 RAG），任务是副产物、被动、轻量、以步骤进度为主、可归档。
- task-mode 是**任务协作流程系统**（状态机、验收、结构化交接、门禁、强制纪律），不做任何代码/文档语义检索。

**互补关系**
- memory 回答「这个项目里有什么、之前怎么解决的」；task-mode 回答「这件事做到哪、谁来验收、怎么交接」。
- 可在同一项目**并存**：用 task-mode 管任务骨架与验收，用 memory 管代码/文档召回与经验沉淀。
- 同时启用的摩擦点：两套任务面板、两套任务概念（memory 的 TaskBridge 任务 vs task-mode 的 ProjectTask）、两条注入通道；需要用户自行区分，或未来做**任务桥接**（task-mode 任务 ↔ memory 任务双向同步，类比 memory 的 `adoptStepsToSession` 反向推送）。

## 8. 对 task-mode 可借鉴的具体点（来自 memory）

1. **文件自动沉淀**：memory 从 `read/write/edit` 工具调用自动累积 `task.files` 并按读/写热度排序。task-mode 目前 `modifiedFiles` 靠 checkpoint 手填——可在 `tools/pre-execute` 监听 fs 工具自动累积，减轻 Agent 负担。
2. **注入门控与审计**：memory 的阈值通道 + `injection-audit.jsonl` + `admission-shadow.jsonl` + 预算熔断，能让「注入了什么/为什么/丢了什么」可离线复盘。task-mode 召回是固定上限、无审计——可加轻量召回审计。
3. **去重与分层沉淀**：把 checkpoint 的 `decisions/openQuestions` 做近重复合并，并引入「教训/决策/流程」分层 insight，避免同类记录重复膨胀。
4. **归档与容量**：task-mode 明确暂不提供归档；可借鉴 memory 的 `archive_task` + 容量上限 + 软删（`deleted.json` 可找回）。
5. **多实例共享/锁**：memory 的目录锁 + 退出 flush + 死锁回收，可补强 task-mode 跨进程并发（当前乐观锁只在 Host 进程内）。
6. **用法 skill 化**：memory 把查询/写入流程注册为 skill 按需加载；task-mode 的常驻 systemPrompt 段已较省，但更复杂后可参考 skill 化。
7. **性能基准脚本**：memory 随包发布 `bench:*` 脚本；task-mode 可补一份任务库规模/召回耗时基准。

## 9. task-mode 相对 memory 的优势（memory 可反向借鉴）

- 严格状态机 + 验收分离（Agent 到 `in_review`，用户 `done`），职责边界清晰。
- 结构化 Checkpoint 交接（决策/修改文件/验证/开放问题/下一步/事件区间），可回查原 session。
- 开始工作前的门禁：防止模型漏建任务就动手，同时用只读白名单避免误伤分析操作。
- 生命周期兜底 `interrupted` 检查点，异常时绝不误标完成。
- revision 乐观锁 + 活跃 session 冲突 + 惰性自动回退，并发语义明确。
- 显式 Preset 隔离，普通模式零影响。
- 多对多 TaskSessionLink 保留完整来源链；WorkspaceId 作为项目边界避免 cwd 变更串项目。

## 10. 结论

- 不要把两者当竞品二选一。**memory 是「记忆」，task-mode 是「任务」**。
- 若只有一个选择：做代码/知识密集、需要反复回查代码和踩坑经验的项目，选 memory；做多会话长任务、需要验收与交接纪律的项目，选 task-mode。
- 本插件（task-mode）可优先借鉴 memory 的「文件自动沉淀 + 召回门控审计 + 归档容量 + 跨实例锁」四项，用较小改动显著提升闭环完整度与可观测性。
