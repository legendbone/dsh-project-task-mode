# F1 文件台账修复记录（task-mode 0.1.18）

- 修复对象：`dsh-project-task-mode@0.1.18`（已在 Desktop profile 安装，待重启生效）
- 关联验收：`docs/acceptance-f7-f1-f2-shadow-0.1.17.md` 中唯一未通过项 F1（文件自动沉淀）
- 日期：2026-11-05

## 1. 问题（0.1.17 复现）

在向任务写入文件后提交 Checkpoint，`project_task_get` 的 `modifiedFiles` 正确包含该文件路径，但 `artifacts` 恒为 `[]`，且磁盘 `~/.dsh/storages/project_tasks/task_artifacts/` 目录从未创建。

## 2. 根因

`src/host/store.ts` 的 `upsertArtifacts()` 生成的 per-record 记录 key 为 `${taskId}:${base64url(path)}`，含冒号 `:`。

运行中的 per-record 文件后端（`dsh-storage-json`）对 key 有硬约束：

```
const SAFE_KEY_RE = /^[a-zA-Z0-9_-]+$/
function assertSafeKey(unit, key) { if (!SAFE_KEY_RE.test(key)) throw new Error(...) }
```

冒号不匹配该正则 → `putRecord` 抛错 → `ProjectTaskService.persistArtifacts`（`src/host/service.ts:569-576`）的 `try/catch` 仅 `console.warn('project-task: artifact ledger write failed', ...)` 静默吞掉 → 台账从不落盘。而 `modifiedFiles` 在写库前用 `eligibleArtifacts` 计算，所以看起来“成功”，掩盖了问题。

## 3. 修复

`src/host/store.ts`：

- 抽出可测试的导出函数：

  ```ts
  export function artifactKey(taskId: string, path: string): string {
    return `${taskId}_${Buffer.from(path).toString('base64url')}`
  }
  ```

- `upsertArtifacts()` 改为调用 `artifactKey(taskId, observation.path)`。
- key 由“前缀_UUID + `_` + base64url”组成，全部落在 `[a-zA-Z0-9_-]`，满足后端约束。
- 历史无任何 artifact 记录，无需数据迁移；`listArtifacts()` 按记录内的 `taskId` 字段过滤，与 key 形式无关。

## 4. 回归测试

新增 `tests/store-artifacts-filesystem.test.mjs`：

- 用 `tests/fixtures/storage-v2.fixture.mjs` 的真实 `FileUnit`（执行与生产一致的 `SAFE_KEY`）打开 `PROJECT_TASK_DOMAIN`，实例化 `ProjectTaskStore` 后调用 `upsertArtifacts`。
- 断言：key 满足 `/^[a-zA-Z0-9_-]+$/`；两条记录落盘；`listArtifacts` 返回 2 条且按时间倒序；磁盘 `project_tasks/task_artifacts/*.json` 有 2 个文件。
- 该测试在旧冒号 key 下必然失败（`recordPath` 抛 `requires a safe per-record key`），修复后通过——弥补了 `service-artifacts.test.mjs` 使用内存假 store、绕过 `assertSafeKey` 的盲区。

## 5. 校验与打包证据

- `npm run check`（test + typecheck + lint + build）全绿：**170 tests / 170 pass / 0 fail**，lint 0 警告，构建成功。
- `npm pack` → `dsh-project-task-mode-0.1.18.tgz`，sha256 `77afda2f5fa93921ca66a0077cc114073128bc11ef6121a81f14de55fdfb90a1`。
- Desktop profile 依赖更新为 `file:.../dsh-project-task-mode-0.1.18.tgz`，安装版本 `0.1.18`。
- 安装后四 bundle SHA-256 本地==安装：
  - index.js `8de79fec1fe7e47e8df1688fe01a3e441e124df30fadc94ac0a913827e9bcae1`（本次修复载体，旧 0.1.17 为 `fdc279a4…`）
  - agent.js `80aaee4ca74f6b9697b354d460f0dfe300d8f9fcfa837cb1720c25e6016fa1e8`
  - client.js `d0f81f11df80227da66f5ec85189c1e7ea970666eedaa06bbf9c295d61249c31`
  - remote-client.js `aaf08a59189581509874c7f67f84a8563e501acab63a2bf6501e3bcc8ca40b59`
- 安装后 `lib/index.js` 内已含 `function artifactKey` 与 `${taskId}_${...toString("base64url")}`，无旧冒号构造。

## 6. 剩余步骤（运行时复验，需重启）

当前运行中的 DSH 进程仍加载 0.1.17 内存态，上述安装需**重启 DSH** 才对运行实例生效。重启复验步骤：

1. 重启 DeepSeek Harness。
2. 在一个 bound 任务会话里用 write 工具新建文件，然后提交 Checkpoint。
3. 回读 `project_task_get`：`artifacts` 应非空且包含该路径、`source: tool-observer`；磁盘 `~/.dsh/storages/project_tasks/task_artifacts/` 应出现对应 `.json`。
4. 任务详情面板「文件台账」区块应显示该文件与相对时间。

## 7. 回滚

profile 安装前备份（同目录）：

- `package.json.bak-tgz-20261105-164056`
- `pnpm-lock.yaml.bak-tgz-20261105-164056`

需要回退时用备份覆盖 `package.json` / `pnpm-lock.yaml` 后，将 `dsh-project-task-mode` 重新指向 `dsh-project-task-mode-0.1.17.tgz` 安装即可。
