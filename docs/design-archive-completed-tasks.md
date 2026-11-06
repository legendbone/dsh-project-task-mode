# 已完成任务归档功能设计（Archive）

- 状态：设计稿（待评审，未实现）
- 版本：draft-1
- 关联：`docs/project-task-mode-design.md`、`docs/design-integrate-memory-learnings.md`（F4「归档 + 容量 + 软删」概览）
- 本文范围：只细化 **archive / unarchive / 批量归档已完成** 这一子集；**软删、回收站、purge 不在本次范围**（见 §2）。

---

## 1. 背景与问题

项目任务按工作区（workspace）长期累积。一次会话跑得越久，`done / cancelled` 的任务就越多：

1. **看板被完成项淹没**：`board.tsx` 默认列出 `todo / in_progress / in_review / done` 四列，`done` 列只增不减，活跃任务被挤到下面。
2. **列表/分页成本上升**：`service.list()` 全量过滤后分页，`board.tsx` 又固定 `limit: 500` 后在前端只保留根任务，完成项一多就逼近上限，真实 `total` 与可见项失真。
3. **上下文噪声**：`recall-gate` 的候选筛选已跳过 `done / cancelled`，但 `buildLegacyContext()`（默认注入走的就是 legacy 路径）按状态取 `inProgress / blocked / recentHandoffs`，**没有过滤 `archivedAt`**，带 `finish / handoff` checkpoint 的已完成任务仍可能进入 `recentHandoffs`。
4. **不可区分「历史记录」与「当前工作面」**：`done` 既是终态又是工作区常驻数据，没有「已收尾、可以移出主视图但保留可查」的表达。

结论：需要一个**可逆、与状态机正交**的归档标记，把「完成且无需再关注」的任务从主视图和注入上下文中移出，同时保留全部历史（checkpoints、activities、sessions、artifacts）。

---

## 2. 目标与非目标

### 2.1 目标

- 只用一个独立标记 `archivedAt` 表达「已归档」，**不新增状态、不改变状态机**。
- 支持 **单任务归档 / 取消归档**、**一键归档本工作区全部已完成任务**，可选按天数**自动归档**。
- 归档即可逆：取消归档后任务原样回到主视图，状态仍为 `done / cancelled`。
- 归档任务默认不出现在活动看板、默认列表、上下文注入与召回候选中；但详情、历史、审计仍可完整查看。
- 覆盖三端契约（Host / Client / Remote）并补齐召回 legacy 过滤。

### 2.2 非目标（本次明确不做）

| 不做 | 说明 |
| --- | --- |
| 软删除 / 回收站 / `deletedAt` 行为 | `deletedAt` 字段已预留但本期不启用，`purge` 永久删除不做 |
| 新增 `archived` 状态 | 归档是标记不是状态，避免污染 8 状态机与所有状态映射 |
| 归档时删除任何数据 | checkpoints / activities / sessions / artifacts / insights 全部保留 |
| Agent 自动归档工具 | 首版归档只由用户在看板操作（见 §7.3） |
| 跨实例分布式锁 / 归档配额 | 沿用现有 revision 乐观锁即可 |

---

## 3. 核心概念与关键决策

### 3.1 决策一览

| # | 决策 | 理由 |
| --- | --- | --- |
| D1 | `archivedAt` 与 `status` **正交**，归档不改 `status` / `completedAt` | 历史、报表、状态迁移全部不受影响；取消归档零成本 |
| D2 | 仅 **终态**（`done`，默认含 `cancelled`）可归档 | 归档语义是「已完成、可移出工作面」；隐藏 `in_review/in_progress` 会丢失监督 |
| D3 | **祖先可见性**：任务「有效归档」= 自身或任一祖先已归档 | 看板只列根任务；归档一个根即隐藏整棵子树，无需逐个子任务写标记，也不会出现「孤儿子任务」 |
| D4 | 归档前置：终态 + 无 `activeSessionId` + **子树内无未终态任务、无活动会话** | 祖先归档会隐藏后代，必须保证后代没有正在进行的活 |
| D5 | 归档/取消归档都 **revision +1、updatedAt = now**，写 activity | 与其他写操作一致的乐观并发与审计 |
| D6 | 幂等：重复归档自身已归档任务 → 返回当前详情，不报错、不递增 revision | 前端重试/网络重发安全 |
| D7 | 归档是 **用户动作**，首版不开放 Agent 工具 | 是否「验收通过、可以收尾」由人判断，避免 Agent 擅自隐藏用户任务 |

### 3.2 名词

- **归档（archived）**：`ProjectTask.archivedAt !== undefined`。
- **有效归档（effectively archived）**：自身 `archivedAt` 有值，或任一祖先 `archivedAt` 有值。
- **终态集合**：`TERMINAL_STATUSES = ['done', 'cancelled']`（`cancelled` 是否可归档由 `archive.includeCancelled` 控制，默认 `true`）。
- **可归档子树**：以目标为根的子树中，所有任务均为终态且无 `activeSessionId`。

---

## 4. 数据模型变更

### 4.1 `src/shared/types.ts`

`ProjectTask` 已有 `archivedAt?: number`（types.ts:42）。本期新增：

```ts
export interface ProjectTask {
  // ...既有字段不变
  completedAt?: number
  archivedAt?: number          // 既有：归档时间戳
  archivedBy?: TaskActor       // 新增：归档操作者（user / agent）
  deletedAt?: number           // 既有：本期不启用
}
```

### 4.2 `src/shared/schemas.ts`

`projectTaskSchema`（schemas.ts:11-32）增加一个可选字段：

```ts
archivedBy: taskActorSchema.optional(),
```

- 存储域 `PROJECT_TASK_DOMAIN` 仍是 `version: 2`、`compatibleVersions: [1]`（store.ts）。
  **新增可选字段属于向后兼容的增量**：历史记录无该字段，读取为 `undefined`；无需迁移脚本、无需提升版本号。
- 若未来提升到 `v3`，必须把 `2` 加入 `compatibleVersions`，并说明 `archivedBy` 缺省处理。

### 4.3 `TaskQuery`（types.ts:162-170 / schemas.ts:197-205）

新增两个可选过滤位：

```ts
includeArchived?: boolean   // 默认 false：活动视图排除“有效归档”
onlyArchived?: boolean      // 默认 false：true 时只返回“有效归档”（用于“已归档”视图）
```

约束：`onlyArchived` 与 `includeArchived` 同时为 `true` 时，`onlyArchived` 优先（只返回归档）。

### 4.4 活动动作（`TaskActivity.action`）

新增两个动作字符串（`activityLabel` 需在 `src/client/labels.ts` 补中文）：

| action | 触发 | detail |
| --- | --- | --- |
| `archived` | 归档成功 | 可选 `{ "mode": "single" \| "bulk" \| "auto" }` |
| `unarchived` | 取消归档成功 | 可选 `{ "mode": "single" }` |

`fromStatus / toStatus` 均为空（状态未变）。

---

## 5. 可见性规则（统一读路径）

所有读路径统一按一套规则判定，避免各端各写一份：

```ts
// 伪代码，放在 src/host/service.ts 或 shared 工具
function effectiveArchived(task: ProjectTask, byId: Map<string, ProjectTask>): boolean {
  let cur: ProjectTask | undefined = task
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    if (cur.archivedAt !== undefined) return true
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return false
}
```

### 5.1 `service.list(query)`（service.ts:68-81）

在现有过滤链（workspace → statuses → parentId → rootId → keyword）之后追加：

```ts
.filter(task => task.deletedAt === undefined)                 // 本期恒真，占位
.filter(task => {
  if (query.onlyArchived) return effectiveArchived(task, byId)
  if (query.includeArchived) return true
  return !effectiveArchived(task, byId)
})
```

- **默认**（`includeArchived !== true`）排除有效归档 → 活动看板干净。
- `total` 与分页基于过滤后的集合计算，避免完成项占满 `limit`。
- 实现上 `byId` / 有效归档集合应在一次 `allTasks()` 快照内计算一次，避免 O(n²) 反复上溯；可先建 `Map<id, task>` 并记忆化。

### 5.2 `service.get(taskId)`（service.ts:83-96）

**不过滤**：归档任务仍可按 id 打开详情（含 children / checkpoints / activities / sessions / artifacts / recallAudit）。仅在 `get` 返回体上附加派生标记（可选）：

```ts
// TaskDetails 增加可选字段（不改存储）
archived: boolean            // 自身 archivedAt 有值
archivedByAncestor: boolean  // 自身未归档但祖先已归档
```

### 5.3 上下文与召回（`src/host/recall-gate.ts`）

1. **候选筛选已正确**：`evaluateRecallContext` 第 108 行已 `task.archivedAt !== undefined || task.deletedAt !== undefined → continue`（同时跳过 done/cancelled），无需改。
2. **必须补 legacy**：`buildLegacyContext` 第 70 行
   ```ts
   const roots = tasks.filter(task => task.workspaceId === workspaceId && !task.parentId)
   ```
   改为同时排除有效归档：
   ```ts
   const byId = new Map(tasks.map(t => [t.id, t]))
   const roots = tasks.filter(task =>
     task.workspaceId === workspaceId && !task.parentId &&
     task.deletedAt === undefined &&
     !effectiveArchived(task, byId))
   ```
   否则归档的已完成任务仍会经 `recentHandoffs` 注入，违背归档初衷。
3. `boundTask` 若被归档：绑定关系保留可查看，但**不可作为活动任务继续执行**（见 §6.3）。

### 5.4 看板（`src/client/board.tsx`）

- `statusFilter` 增加虚拟视图 `'archived'`（不是 `TaskStatus`）：
  - 值为 `'archived'` → 调 `list({ workspaceId, keyword, onlyArchived: true, limit: 500 })`。
  - 其余值 → 维持现状，额外显式传 `includeArchived: false`（默认即 false，显式写出便于阅读）。
- `'archived'` 视图不套用 `PRIMARY_COLUMNS` 四列，改为单列/列表式展示（因为归档项都是终态）。
- `overview` 增加 `archived` 计数（基于 `onlyArchived` 单独查询或后端 summary 返回，二选一，建议后端 `summary()` 增加 `archivedTotal`）。

---

## 6. 服务层 API

均在 `src/host/service.ts` 新增，沿用现有 `requireTask` / `assertRevision` / `assertActiveSession` 与写库方式（`store` upsert + activity）。

### 6.1 `archive(taskId, actor, expectedRevision?)`

```ts
archive(taskId: string, actor: TaskActor, expectedRevision?: number): Promise<TaskDetails>
```

前置校验（按顺序，失败即抛业务错误）：

1. `task = requireTask(taskId)` → 否则 `task-not-found`
2. `expectedRevision` 传入则 `assertRevision(task, expectedRevision)` → 否则 `revision-conflict`
3. `task.archivedAt !== undefined` → **幂等返回** `this.get(taskId)`（不写库）
4. `task.status` 不在终态集合 → `archive-not-terminal`
   - 终态集合 = `['done', ...(config.archive.includeCancelled ? ['cancelled'] : [])]`
5. `task.activeSessionId` 有值 → `archive-active-session`
6. 子树内有非终态任务或存在 `activeSessionId` → `archive-active-descendant`
   - 子树 = 以 `taskId` 为根，沿 `parentId` 递归收集（用一次 `allTasks()` 快照）
7. 成功：`archivedAt = now()`、`archivedBy = actor`、`updatedAt = now()`、`revision + 1`，`status` 不变；写 activity `archived`；返回 `get(taskId)`。

### 6.2 `unarchive(taskId, actor, expectedRevision?)`

```ts
unarchive(taskId: string, actor: TaskActor, expectedRevision?: number): Promise<TaskDetails>
```

1. `requireTask`、`assertRevision`
2. `task.archivedAt === undefined`：
   - 若祖先已归档 → `archived-by-ancestor`（提示需先取消祖先归档）
   - 否则幂等返回当前详情
3. 成功：删除 `archivedAt` / `archivedBy`（置 `undefined`，序列化时省略），`updatedAt = now()`、`revision + 1`，`status` 不变；写 activity `unarchived`；返回 `get(taskId)`。

> 取消归档只清自身标记；若仍有祖先归档，任务仍为「有效归档」，需自顶向下逐层取消。看板详情页据此显示按钮：自身归档显示「取消归档」，仅祖先归档显示提示文案。

### 6.3 与既有写路径的交界

- `claim()` / `start()`：目标任务若 `archivedAt !== undefined` → 新增 `task-archived` 错误，**禁止开启已归档任务**（先取消归档）。
- `continue`（remote.ts）：底层走 `start/claim`，同样被 `task-archived` 拦截。
- `reviveForSession` / `isTakeoverCandidate` / `boundTaskForSession`：以 `activeSessionId` 为入口，归档前置已保证无活动会话，原则上不冲突；仍建议在 `activeTaskForSession` 结果上过滤 `archivedAt !== undefined` 作为防御。
- `update()`：归档任务默认禁止普通状态编辑（避免绕过归档语义）；仅允许 `unarchive` 先解除。若产品希望「归档任务可直接改回 in_progress」，则复用现有 `done → in_progress` 迁移并在 update 内自动清 `archivedAt`——**本期选择前者（需先取消归档）**，更直观、错误面更小。

### 6.4 `archiveCompleted(query)`（批量）

```ts
archiveCompleted(query: { workspaceId: string; keyword?: string }, actor: TaskActor):
  Promise<{ archived: number; skipped: Array<{ taskId: string; reason: string }> }>
```

- 选取该工作区**根任务**（`parentId === undefined`）、未有效归档、状态在终态集合、且子树可归档者。
- 逐个走 `archive()` 核心校验；单个失败记入 `skipped`（`reason` 为错误码），不中断整体。
- 返回汇总，前端 toast：`已归档 N 个，跳过 M 个`。
- 不做跨任务事务；每任务独立 revision 递增。

### 6.5 `sweepCompleted(now)`（自动归档，可选启用）

```ts
sweepCompleted(now?: number): Promise<{ archived: number }>
```

- 仅当 `config.archive.autoArchiveDoneAfterDays > 0` 时生效。
- 条件：`done`（不含 cancelled，可配置）、`completedAt ?? updatedAt` 距今 ≥ N 天、且通过 §6.1 全部前置。
- 触发时机：Host Service 启动时一次 + `setInterval(autoSweepIntervalMinutes)`；不引入外部调度依赖。
- 自动归档 activity 的 `actor` 记为 `{ type: 'agent' }`（现有 `TaskActor` 无 `system` 类型，本期不扩展；如需区分可用 detail.mode='auto'）。

---

## 7. 契约、Remote 与 Agent 工具

### 7.1 `src/shared/contract.ts`（`PROJECT_TASK_INVOCATIONS`）

新增三条 direct 调用（与现有 `list/get/create/update/continue` 同构，contract.ts:106-120）：

```ts
direct('archive', [
  parameter('taskId', z.string().min(1)),
  parameter('expectedRevision', z.number().int().nonnegative().optional()),
], result('TaskDetails', taskDetailsSchema)),

direct('unarchive', [
  parameter('taskId', z.string().min(1)),
  parameter('expectedRevision', z.number().int().nonnegative().optional()),
], result('TaskDetails', taskDetailsSchema)),

direct('archiveCompleted', [
  parameter('input', z.object({ workspaceId: z.string().min(1), keyword: z.string().max(500).optional() })),
], result('ArchiveCompletedResult', z.object({
  archived: z.number().int().nonnegative(),
  skipped: z.array(z.object({ taskId: z.string(), reason: z.string() })),
}))),
```

`list` 的 `taskQuerySchema` 同步增加 `includeArchived` / `onlyArchived`。

### 7.2 `src/host/remote.ts`

`ProjectTaskController` 增加 `@Remote archive / unarchive / archiveCompleted`，内部经 `assertTaskWorkspace` 后调用 service；`actor` 由调用方身份推导（Remote 现有模式）。`list` 透传新过滤位。

### 7.3 `src/client/remote.ts`

手写 namespace 类型映射补三条方法签名（与 contract 一致），否则 TypeScript 客户端类型缺失。

### 7.4 `src/agent/tools.ts`

**本期不新增 Agent 归档工具**（决策 D7）。Agent 仍只有 `start/update/checkpoint/list/get`；归档由用户在 Web 看板操作。后续若开放，需单独评审「Agent 是否可判断任务收尾」。

---

## 8. 看板与交互细节

### 8.1 `src/client/board.tsx`

- 工具栏的状态视图下拉增加一项：`已归档`（对应 `statusFilter = 'archived'`）。
- 工具栏增加按钮 **「归档已完成」**：
  - 点击弹确认框（复用现有对话框风格）：`将归档本工作区所有已完成（done/cancelled）任务，共约 N 个，可在“已归档”中恢复。`
  - 确认后调 `archiveCompleted({ workspaceId })`，toast 显示结果，刷新列表。
- `done` 列在默认视图只剩「近期完成、尚未归档」的任务，天然变短。

### 8.2 `src/client/task-detail.tsx`

- 任务为终态且未归档 → 操作区显示「归档」按钮（调用 `archive(task.id, revision)`）。
- 任务自身已归档 → 顶部灰色横幅「已归档 · 归档于 {时间}」，操作区显示「取消归档」。
- 仅祖先归档（自身未归档）→ 横幅提示「所属父任务已归档，取消父任务归档后恢复显示」。
- 归档任务详情内禁止显示「开启/继续任务」，替换为「已归档，无法执行」。

### 8.3 `src/client/labels.ts`

- `activityLabel` 增加：`archived: '已归档'`、`unarchived: '已取消归档'`。
- 可选：`STATUS_HINTS` / 空列表文案对「已归档」视图单独定制（如「暂无已归档任务」）。

---

## 9. 配置项

`src/shared/config.ts` 增加 `archiveConfigSchema` 并挂到 `hostConfigSchema`：

```ts
export const archiveConfigSchema = z.object({
  enabled: z.boolean().default(true),                       // 关闭后看板隐藏入口，service 拒绝归档
  includeCancelled: z.boolean().default(true),              // cancelled 是否可归档
  autoArchiveDoneAfterDays: z.number().int().min(0).default(0),      // 0 = 关闭自动归档
  autoSweepIntervalMinutes: z.number().int().min(1).max(1440).default(60),
}).prefault({})

export const hostConfigSchema = z.object({
  recallGate: recallGateConfigSchema,
  archive: archiveConfigSchema,
}).prefault({})
```

- `enabled=false` 时：`archive/unarchive/archiveCompleted` 抛 `archive-disabled`；看板隐藏相关按钮。
- 默认全开但自动归档关闭（`autoArchiveDoneAfterDays=0`），行为可预期。

---

## 10. 边界、并发与幂等

| 场景 | 行为 |
| --- | --- |
| 归档 `in_progress / in_review / blocked / paused / todo / backlog` | `archive-not-terminal` |
| 归档有活动执行会话的任务 | `archive-active-session` |
| 归档“自身已 done、但有 in_progress 子任务”的根任务 | `archive-active-descendant` |
| 重复归档 | 幂等，返回当前详情，不写库 |
| 重复取消归档（自身未归档且无祖先归档） | 幂等，返回当前详情 |
| 取消归档子任务但其父仍归档 | `archived-by-ancestor`（提示先取消父） |
| 归档同时有人 `update` | revision 乐观锁 → `revision-conflict`，前端刷新重试 |
| 归档后执行 `continue/claim` | `task-archived` |
| 归档任务仍在 `get` / 审计中可见 | 是，只影响列表/上下文/召回，不隐藏详情 |
| 批量归档部分失败 | 成功项生效，失败项入 `skipped`，整体不报错 |

错误码新增：`archive-not-terminal`、`archive-active-session`、`archive-active-descendant`、`archive-disabled`、`not-archived`、`archived-by-ancestor`、`task-archived`。均纳入 `src/shared` 错误定义与 i18n/文案。

---

## 11. 存储与迁移

- 无新表、无新索引要求（沿用 `per-record` layout 与 `allTasks()`）。
- `archivedBy` 为可选增量字段，v2 schema 内兼容；历史数据不重写。
- 序列化：`archivedBy === undefined` 时省略键（与现有 `parentId` 等一致）。
- 备份/回滚：归档是可逆标记，回滚只需清 `archivedAt/archivedBy`；无需数据修复脚本。

---

## 12. 测试与验收

### 12.1 单元测试（`tests/*.test.mjs`，node:test）

1. **可归档矩阵**：done 可归档；cancelled（includeCancelled=true）可归档；in_progress/in_review 拒绝；done + activeSessionId 拒绝；done 根 + in_progress 子 拒绝。
2. **幂等**：重复 `archive` 返回同 revision 且无第二条 activity；重复 `unarchive` 同理。
3. **可见性**：归档根后 `list(默认)` 不含该根及其子；`list({onlyArchived:true})` 含根；`list({includeArchived:true})` 含根。
4. **祖先可见性**：归档根后，子任务即使自身未归档，在默认 `list`/`context` 中也不可见；取消根归档后恢复。
5. **召回回归**：`buildLegacyContext` 对“归档的 done + finish checkpoint”不再进入 `recentHandoffs`；`evaluateRecallContext` 候选不含归档任务。
6. **批量**：`archiveCompleted` 对多个 done 根归档计数正确，对含活动子的根记入 skipped。
7. **并发**：错误 `expectedRevision` 抛 `revision-conflict`。
8. **claim 拦截**：归档任务 `claim/continue` 抛 `task-archived`。

### 12.2 手工验收（Web 看板）

- 打开活动看板，`done` 列仅有未归档完成项。
- 在详情归档一个 done 任务 → 从活动视图消失；切「已归档」可见；取消归档后回来。
- 点「归档已完成」→ 确认框 → toast 数字与「已归档」视图数量一致。
- 归档任务详情显示灰色横幅，且无「继续任务」。

### 12.3 校验命令

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- 完整：`npm run check`

---

## 13. 实施阶段（后续，不在本文交付）

| 阶段 | 内容 | 主要文件 |
| --- | --- | --- |
| P1 数据与核心 | `archivedBy`、`TaskQuery` 过滤位、`effectiveArchived`、`archive/unarchive`、错误码、activity | `src/shared/types.ts`、`src/shared/schemas.ts`、`src/host/service.ts` |
| P2 契约与 Remote | 三条 invocation、`remote.ts`、`client/remote.ts` | `src/shared/contract.ts`、`src/host/remote.ts`、`src/client/remote.ts` |
| P3 召回与看板 | `buildLegacyContext` 过滤、`board.tsx` 已归档视图 + 批量按钮、`task-detail.tsx`、`labels.ts` | 见左 |
| P4 配置与自动化 | `archiveConfig`、`sweepCompleted` 定时、`summary().archivedTotal` | `src/shared/config.ts`、`src/host/service.ts` |
| P5 测试与验收 | §12 全部测试 + 手工验收 + `npm run check` | `tests/*.test.mjs` |

每个阶段独立可运行；P1–P2 不依赖 UI，P3 完成后即可交付可用功能，P4 自动归档为可选增强。

---

## 14. 开放问题

1. **批量归档是否包含 `cancelled`？** 本文默认包含（`includeCancelled=true`）；若产品认为「取消任务」仍需保留在主视图复盘，可拆成两个按钮。
2. **自动归档默认周期**：`autoSweepIntervalMinutes=60` 是否合适，还是只在 Host 启动时扫一次即可（省定时器）。
3. **`summary().archivedTotal`** 是否值得为看板统计单独加返回字段，或前端用 `onlyArchived` 单独请求。
4. **归档后是否允许直接编辑状态**（本文：需先取消归档）；若用户希望「归档任务也能一键重启」，需调整 §6.3。

---

## 附录 A：错误码 → HTTP/提示文案（建议）

| 错误码 | 用户文案 |
| --- | --- |
| `archive-not-terminal` | 只有已完成或已取消的任务可以归档 |
| `archive-active-session` | 任务仍有执行会话，结束会话后再归档 |
| `archive-active-descendant` | 子任务中仍有未完成任务，无法归档 |
| `task-archived` | 任务已归档，请先取消归档再执行 |
| `archived-by-ancestor` | 父任务已归档，请先取消父任务归档 |
| `archive-disabled` | 归档功能已被配置关闭 |

## 附录 B：与 F4 的关系

`docs/design-integrate-memory-learnings.md` 的 F4 把「归档 + 容量上限（maxActiveTasksPerWorkspace）+ 软删/purge + visibleTasks」作为一组。本文**只取其 archive/unarchive 子集**并落地为可实施方案，明确：

- 复用 F4 的 `archivedAt` / `archivedBy` 与「活动看板隐藏 archived、管理视图 `includeArchived`」思路；
- **不实现** F4 的 `softDelete / restoreDeleted / purge` 与容量上限；
- 对 F4 的「无未归档子任务」前置做细化为「祖先可见性 + 子树终态校验」，避免要求用户逐个子任务先归档。
