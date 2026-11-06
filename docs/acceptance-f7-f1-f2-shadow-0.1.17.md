# 验收报告：F7 / F1 / F2-shadow 记忆经验集成（task-mode 0.1.17）

> 后续更新：本报告中唯一未通过项 F1 已在 0.1.18 修复（台账 key 冒号→下划线 + 真实文件后端回归测试），详见 [`acceptance-f1-fix-0.1.18.md`](acceptance-f1-fix-0.1.18.md)。

- 验收对象：`dsh-project-task-mode@0.1.17`（已装入 Desktop profile 并重启 DSH）
- 验收时间：2026-11-05 16:20–16:35（本地）
- 运行时：DeepSeek Harness GUI http://127.0.0.1:61149；存储域根 `~/.dsh/storages/project_tasks`（json 后端 / per-record 布局）
- 验收执行任务：`79fd2d2c-d1b1-42e5-a546-0eab81e470e8`（本会话 session-18589f25-…）

## 结论汇总

| 项 | 结论 | 关键证据 |
|---|---|---|
| 版本完整性（安装=本地构建） | ✅ 通过 | local=0.1.17 / profile=0.1.17；四 bundle SHA-256 逐一相同 |
| F2 召回 shadow（审计 + 不改变 legacy 注入） | ✅ 通过 | `recall_audit/` 14 条记录，字段完整，mode 全为 shadow |
| F7 基线 / v1→v2 fixture / 回归测试 | ✅ 通过 | 169/169 测试通过；benchmark 退出码 0 |
| Client 展示（文件台账 / 召回解释） | ⚠️ 结构通过、数据受 F1 缺陷影响 | task-detail.tsx 已渲染两区块；文件台账恒为空（见 F1） |
| **F1 文件自动沉淀（写入 task_artifacts 台账）** | ❌ **未通过（确证缺陷）** | 台账目录从未创建；根因=记录 key 含 `:` 违反 per-record 路径安全正则 |

---

## 1. 版本完整性 ✅

- 本地 `package.json` = `0.1.17`；Desktop profile `node_modules/dsh-project-task-mode` = `0.1.17`。
- 四个 bundle 的 SHA-256，本地构建与安装副本逐一相同：
  - `index.js` = `fdc279a4130423e3d02ce20994b8956ab3ee8e9c997996eeb59bac0f1356088a`
  - `agent.js` = `80aaee4ca74f6b9697b354d460f0dfe300d8f9fcfa837cb1720c25e6016fa1e8`
  - `client.js` = `d0f81f11df80227da66f5ec85189c1e7ea970666eedaa06bbf9c295d61249c31`
  - `remote-client.js` = `aaf08a59189581509874c7f67f84a8563e501acab63a2bf6501e3bcc8ca40b59`
- `lib/` 构建时间（12:33）晚于 `src/`（11:37–11:50），说明安装产物对应当前源码。
- profile 依赖：`dsh-project-task-mode: file:[REPO_DIR]/dsh-project-task-mode-0.1.17.tgz`（本机仓库根目录，已用占位符代替）。

## 2. F2 召回 shadow ✅

- `project_task_get` 返回 `recallAudit` 数组；磁盘 `~/.dsh/storages/project_tasks/recall_audit/` 共 **14** 条记录，跨 2 个工作区。
- 每条均含完整核心字段：`mode / gateVersion / candidateCount / keptCount / reasonCounts / legacyChars / gatedChars / nonBoundBudget / rejectedSample`（14/14）。
- 全部 `mode=shadow`、`gateVersion=f2-v1`。示例：
  `{candidateCount:6, keptCount:2, reasonCounts:{safety-cap:3, insufficient-signals:1}, legacyChars:585, gatedChars:585, nonBoundBudget:4000}`。
- **shadow 不改变 legacy 注入**：代码路径在 shadow 下注入 `legacyPackage`（测试「default shadow mode injects legacy context and writes one aggregated comparison audit」通过）。审计里的 `legacyChars` 与 `gatedChars` 是“门控若启用会产生的差异”的度量，不是实际注入差异——14 条中有 9 条二者不同，正是门控生效度量的体现，非缺陷。
- 旧 bundle 无 `recallAudit` 字段 → 运行的确是含 F2 的新包。

## 3. F7 基线 / fixture / 回归测试 ✅

- 资产齐全：`scripts/benchmark-project-task.mjs`（16096B）、`tests/storage-v2.fixture.test.mjs`、`tests/fixtures/{README.md,storage-v2.fixture.mjs}`。
- 全量测试 `node --experimental-transform-types --test tests/*.test.mjs`：**tests 169 / pass 169 / fail 0**，退出码 0。其中「generates v1 through DomainFacility, then reads and writes a copied directory with v2」即真实 v1→v2 迁移用例通过。
- benchmark：`BENCH_SIZES=50,500 BENCH_ITERATIONS=1 node --experimental-transform-types scripts/benchmark-project-task.mjs` 退出码 0，输出 p95 指标与 `.tmp/project-task-benchmark/baseline.{json,md}`。
  - 注意：脚本使用 TS 参数属性语法，须带 `--experimental-transform-types` 运行（`npm test` 已带该 flag；直接 `node scripts/...` 会报 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`）。

## 4. F1 文件自动沉淀 ❌（确证缺陷，需修复）

### 现象
两次受控实验：用 `write` 工具新建 `.tmp/verify/f1-artifact-proof.txt` 与 `.tmp/verify/f1-artifact-proof2.txt`，随后写 Checkpoint：
- Checkpoint 的 `modifiedFiles` **正确包含**该文件路径（说明 Agent 端 collector 观察 → 合并链路生效）；
- 但 `project_task_get().artifacts` **始终为 `[]`**；
- 磁盘 `~/.dsh/storages/project_tasks/task_artifacts/` **目录从未被创建**（`No such file or directory`），全库无任何 `source:"tool-observer"` 记录。

即：观察收集成功，但 **task_artifacts 台账持久化 0 落盘**。

### 根因（确证）
`src/host/store.ts:113` 构造记录 key 时用了冒号分隔：

```ts
const key = `${taskId}:${Buffer.from(observation.path).toString('base64url')}`
```

而 per-record 的 json 后端（`@deepseek-ai/dsh-storage-json`，来自运行中 app.asar）在 `PerRecordJsonUnit.putRecord` 中先执行 `assertSafeKey`：

```js
const SAFE_KEY_RE = /^[a-zA-Z0-9_-]+$/
function assertSafeKey(unit, key) {
  if (!SAFE_KEY_RE.test(key)) throw new Error(`unit '${unit}': per-record key '${key}' is not path-safe (must match ${SAFE_KEY_RE})`)
}
```

`:` 不在 `[a-zA-Z0-9_-]` 内 → `put` 抛错 → `store.upsertArtifacts` 抛出 → 被 `src/host/service.ts:569-576` 的 `persistArtifacts` 的 `try/catch` **静默吞掉**（仅 `console.warn('project-task: artifact ledger write failed', error)`），表现为“文件名并入 modifiedFiles、但台账不落盘”。

其余表 key 都是 UUID（或 `linkKey` 用 `-` 分隔），均满足正则，故 `tasks/checkpoints/activities/task_session_links/recall_audit` 均可正常落盘，唯独 artifact 表因 `:` 而必然失败。

### 复现证据（用项目自带 fixture 后端，与生产 SAFE_KEY 同规则）
`.tmp/verify/prove-artifact-key.mjs` 实测：
```
COLON KEY: THREW -> Fixture backend requires a safe per-record key: 79fd2d2c-...:LnRtcC92ZXJpZnkv...
FIXED KEY: wrote OK; ledger size = 1
```

### 为何单测没暴露（测试缺口）
`tests/service-artifacts.test.mjs` 等使用内存 `table()` 假 store（`upsertArtifacts: async () => {}` / 自建 Map），**不经过真实后端的 `assertSafeKey`**，因此 key 含 `:` 也不会报错——单测全绿但运行时必挂。

### 建议修复（一行 + 回归测试）
1. `src/host/store.ts:113` 将分隔符从 `:` 改为 `_`（或 `-`）；taskId 为定长 UUID 不含 `_`，故首个 `_` 即分隔符，无歧义，且 base64url 自负安全：
   ```ts
   const key = `${taskId}_${Buffer.from(observation.path).toString('base64url')}`
   ```
2. 因当前无任何 artifact 历史记录，**无需数据迁移**；`listArtifacts` 按 `taskId` 字段过滤，不依赖 key 结构，无需改动。
3. 增加一条回归测试：用 `tests/fixtures/storage-v2.fixture.mjs` 的 `FileBackend`（同样执行 `SAFE_KEY` 校验）真实 `put` 一条 artifact，断言 key 安全且 `task_artifacts.size===1`，防止假 store 再次掩盖问题。
4. 修复后需重新 `npm pack` → pnpm 装入 profile → **重启 DSH**，再用本报告的两次受控实验复验 `artifacts.length` 与磁盘 `task_artifacts/` 目录。

## 5. Client 展示 ⚠️（结构通过，数据受 F1 影响）
- `src/client/task-detail.tsx` 已实现「文件台账」区块（`artifacts.length` 计数、`artifactObservationTruncated` 提示、按 `lastObservedAt` 相对时间）与「召回解释」区块（`recallAudits` 明细）。
- `board.tsx` 已对 `artifacts`/`recallAudit` 变化做刷新判定。
- 因 F1 台账恒为空，「文件台账」运行时会一直显示“无记录”；「召回解释」有审计数据可正常展示。修好 F1 后该区块即可显示。

---

## 剩余风险 / 下一步
- [阻塞验收] 修复 `src/host/store.ts:113` 的 `:` → `_`，补回归测试，重打包/装/重启后复验 F1。
- [可选] 将 `console.warn` 的被吞异常提升为可观测（如计数/告警），避免同类“静默失败”再次未被发现。
- [可选] benchmark 运行方式写入 README（需 `--experimental-transform-types`）。
