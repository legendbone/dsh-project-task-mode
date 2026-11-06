<!-- MY-AI-NOTEBOOK:AGENT-MD:START -->
# Agent Operating Rules

Generated from `my-ai-notebook/templates/agent-md`. Edit project-specific rules outside this managed block.

- Profile: `node`

# Base Coding Discipline

这一段是所有编程项目通用的 agent 行为基线。它只约束工作方式，不替代项目自己的架构、构建、测试和发布规则。

## Think Before Coding

- 开始修改前，先确认任务目标、成功标准、影响范围和已知约束。
- 如果信息可以从仓库、日志、测试、文档或现有代码中确认，优先自己查证，不要把普通检索工作推给用户。
- 只有在缺失信息会导致明显分叉、不可逆操作或错误实现时才提问；问题必须短，并说明为什么阻塞。
- 遇到新日志、新报错或用户补充证据时，以最新证据为准，重新评估旧假设。

## Documentation First

- 每次需求都应能明确对应到一份现有或新增的需求、设计或专题文档；实现范围和验收标准应可从文档追溯。
- 仓库级功能的文档默认放在仓库根目录的 `Doc`；如果仓库已有 `docs` 或其他明确约定，则沿用现有目录，不新建并行文档目录。
- 子模块独立功能的文档默认放在对应子模块根目录的 `Doc`；如果子模块已有明确的文档目录约定，则沿用现有约定。
- 如果对应文档缺失、过期或与当前需求不一致，应先补齐或更新文档；存在未确认的需求分歧时，先完成确认，再进行实现。

## Simplicity First

- 优先选择能满足当前需求的最小清晰实现。
- 不为未确认的未来需求添加抽象层、配置层、框架层或通用机制。
- 复用项目已有工具、约定和边界，再考虑新增代码。
- 删除无用代码优先于包一层新逻辑；能局部修复就不要扩大改造面。

## Surgical Changes

- 只修改完成任务所必需的文件和代码路径。
- 不顺手重排格式、重命名符号、迁移目录或改写无关逻辑。
- 遇到脏工作区时，先区分已有改动和本次改动；不要回滚或覆盖他人改动。
- 对生成文件、锁文件、资源文件和配置文件保持谨慎，确认它们确实属于本次任务再更新。

## Goal-Driven Verification

- 实现前明确什么证据能证明任务完成。
- 优先运行项目已有的 lint、typecheck、unit test、integration test 或手工验证脚本。
- 如果不能运行完整验证，要运行可行的最小验证，并明确剩余风险。
- 不能把“代码已改”当成完成；完成必须包含结果、证据和未验证项。

## Workspace Safety

- 不执行破坏性命令，除非用户明确要求并理解后果。
- 不新增依赖，除非任务确实需要；新增前说明原因、替代方案和影响面。
- 不把密钥、token、个人隐私或机器本地绝对路径写进通用模板、示例或提交内容。
- 提交时只 stage 本任务拥有的文件；不要把无关变更扫进同一个 commit。

## Context And Experience Loop

- 新任务开工前，如果项目背景复杂或历史经验重要，优先生成或读取 `.codex/context-packs/`。
- 任务收尾时，如果产生了可复用经验、踩坑、验证方式或项目背景变化，生成 `.codex/retros/`。
- 经验沉淀要同时保留项目背景和任务 delta，避免只记录孤立问题。
- 项目规则和长期知识冲突时，以当前项目现场规则为准；长期知识只作为候选上下文。

# Node / TypeScript Project Profile

## Project Boundaries

- Read `package.json`, lock files, tsconfig files and existing scripts before choosing commands.
- Prefer the package manager already used by the repo; do not switch between npm, pnpm, yarn or bun casually.
- Do not edit generated build outputs, coverage folders or lock files unless the task requires it.
- Keep runtime code, tests, scripts and config changes separated enough to review.

## Implementation Rules

- Follow the existing module style, import style, test framework and error-handling conventions.
- Do not introduce new build tools, runtime dependencies or global state without a concrete need.
- For API, CLI or integration changes, verify both the success path and the relevant failure path.

## Verification

- Prefer existing scripts such as `lint`, `typecheck`, `test`, `build` or their closest equivalents.
- If scripts are missing, inspect the project before inventing commands.
- For frontend changes, verify the page or component behavior when a local browser/runtime path is available.
<!-- MY-AI-NOTEBOOK:AGENT-MD:END -->

# Project Local Rules

Fill this section with facts that are specific to this repository. Keep it outside the managed template block.

- Project purpose: 为 DeepSeek Harness（DSH）实现「项目任务模式」插件——以工作区为项目边界，管理主/子任务、验收标准、状态机与 Checkpoint，在会话间共享任务状态和交接上下文，并提供工作区任务看板。当前版本见 `package.json`，目标宿主 DSH `0.2.2-rc.1`（`engines.dsh` 兼容范围 `>=0.2.1-rc.3 <0.3.0`，禁止再钉精确版本）。
- Main directories:
  - `src/host/`：Host Service、Storage Domain 持久化（`store.ts`）、Remote（`remote.ts`）、Typert（`typert.ts`）与 `service.ts` 业务逻辑。
  - `src/agent/`：`project-task` Preset 的工具（`tools.ts`）、提示词（`prompt.ts`）、跨会话召回（`recall.ts`）、副作用门禁（`guard.ts`、`shell.ts`）、生命周期（`lifecycle.ts`）。
  - `src/client/`：Web 看板 UI（`board.tsx`、`task-detail.tsx`、`new-task-dialog.tsx`、`remote.ts` 等）。
  - `src/shared/`：Host/Agent/Client 共享契约、类型、zod schema 与错误。
  - `scripts/build.mjs`：esbuild 打包入口；`tests/`：node:test 测试；`docs/`：设计文档。
- Build command: `npm run build`（`node scripts/build.mjs && tsc -p tsconfig.build.json`）
- Test command: `npm test`（`node --experimental-transform-types --test tests/*.test.mjs`）
- Lint/typecheck command: `npm run lint`、`npm run typecheck`；完整校验用 `npm run check`（test + typecheck + lint + build）
- Generated files: `lib/`（含 `lib/index.js`、`lib/agent.js`、`lib/client.js`、`lib/remote-client.js`、`lib/types/`）为构建产物；根目录 `dsh-project-task-mode-*.tgz` 为 `npm pack` 产物。这些不要手工编辑，改源码后重新构建。
- Files requiring extra care: `cordis.patch.yml`（DSH 全局 Host Service 与 `project-task` Preset 注册）、`package.json` 的 `exports`/`dsh`/`peerDependencies`/`engines`、`package-lock.json`（与安装 profile 的 integrity 相关）、`src/shared/contract.ts`（跨 Host/Agent/Client 契约，改一处要三端同步）、`docs/*.md`（设计/版本串需随实现更新）。
- Package manager: 本项目开发与打包用 `npm`；安装到 DSH profile 时由宿主用 pnpm 消费 `.tgz`，不要改成 pnpm/yarn/bun 开发。
