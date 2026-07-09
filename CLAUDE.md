# Toonflow-app 开发规范

> 本文件是项目级 Claude Code 指令 + 开发规范。未来 Claude Code 会话会自动加载并严格遵守；人类协作者也按此执行。
> 若与 `package.json` 或官方 README 冲突，以 `package.json` 为准并告知用户。

## 1. 项目身份

- **是什么**：AI 短剧漫剧工具，用 AI 把小说转剧本并生成图片/视频
- **技术栈**：Node.js 23.11.1+（推荐 24.x） / TypeScript / Express 5 / Electron 40 / Socket.io / better-sqlite3
- **包管理器**：**yarn classic 1.x**（禁止 npm）
- **工作目录**：`D:\user\github\toonflow-dev\Toonflow-app`
- **默认开发分支**：`fix/dev-setup`（基于 `upstream/develop`）

## 2. 红线约束（违反前必须先问用户）

| # | 禁止 | 理由 |
|---|---|---|
| 1 | ❌ 不要 push 到 `upstream`（官方仓库 `HBAI-Ltd`） | 用户无写权限，且会被官方拒绝；只 push 到 `origin`（用户的 fork） |
| 2 | ❌ 不要 `git push` / 提 PR / 修改 CI | 除非用户明确要求 |
| 3 | ❌ 不要 force push / `reset --hard` / `branch -D` | 破坏性操作，需用户明确授权 |
| 4 | ❌ 不要修改 `data/db2.sqlite` / `data/oss/` / `data/web/` | 运行时数据 / 编译产物 |
| 5 | ❌ 不要删 `data/` 下任何文件 | 用户工作数据 |
| 6 | ❌ 不要执行不可信的供应商 / skill 代码 | 项目依赖 `vm2`，已知有沙箱逃逸风险 |
| 7 | ❌ 不要用 `npm install` 装依赖 | 用 `yarn install`（yarn classic） |
| 8 | ❌ 不要在两条调试链路间无脑切换原生模块 | 见 §5 ABI 不兼容 |

## 3. 与用户的协作约定

- 用户是**编程新手**，第一次参与 Node.js + TypeScript + Electron 这类项目
- 不要堆砌术语；新概念先一句话解释再使用
- 给"按步就班、可验证、能立刻看到效果"的小步骤
- 写文件 / 跑安装 / 编译前，**先说明要做什么再执行**
- 不确定时**先问**，不要凭猜测推进
- 默认使用中文交流

## 4. 常用命令

```bash
yarn dev          # 后端调试（默认链路）：nodemon --inspect，HTTP 10588，debugger 9229
yarn dev:gui      # GUI 调试：electronmon 桌面窗口（需先 electron-rebuild，见 §5）
yarn lint         # 类型检查 tsc --noEmit（基线零错误）
yarn build        # 构建：cross-env NODE_ENV=prod tsx scripts/build.ts
yarn start        # 生产启动：node data/serve/app.js
yarn debug:ai     # AI 调用可视化（npx @ai-sdk/devtools，会联网）
```

## 5. 两条调试链路（关键，不要混用）

| 链路 | 命令 | 原生模块 ABI | 用途 |
|---|---|---|---|
| 后端 / AI 逻辑 | `yarn dev` | Node ABI | 改 `src/`、调 AI、改 `data/skills/*.md` |
| 界面重现 bug | `yarn dev:gui` | Electron ABI | 界面交互重现 |

**ABI 切换**（必须执行，否则报 `NODE_MODULE_VERSION mismatch`）：

```bash
# 后端 → GUI：先 rebuild 为 Electron ABI
npx electron-rebuild -f -w better-sqlite3,sqlite3,sharp

# GUI → 后端：重新 install 恢复 Node ABI
yarn install
```

**默认走后端链路**；GUI 仅在用户明确要重现界面 bug 时启用，启用前提醒用户 ABI 会变。

## 6. 端口与登录

- **HTTP**：`http://localhost:10588`
- **Node Debugger**：`ws://127.0.0.1:9229`
- **默认账号**：`admin` / `admin123`

## 7. Git 工作流

### 远端配置（已就绪）

| Remote | 仓库 | 权限 |
|---|---|---|
| `origin` | `github.com/leonluo2008-ops/Toonflow-app.git` | 用户的 fork，**可写** |
| `upstream` | `github.com/HBAI-Ltd/Toonflow-app.git` | 官方，**只读** |

### 关键事实

- `fix/dev-setup` 当前 tracking **`upstream/develop`**（错的，是克隆时副作用）
- **第一次 push 必须用**：`git push -u origin fix/dev-setup`（修正 tracking 到 origin）
- 之后 `git push` 自动走 origin，永远安全
- 用户对 upstream 无写权限 = **天然防误推保护**，但报错信息让人困惑，需主动解释
- `master` 不接受 PR；PR 提到 `develop`（develop 只在上游仓库）

### 标准 commit + push 流程

```bash
git status                              # 看改了什么
git diff                                # 看具体改动
git add src/xxx.ts                      # 指定文件，不要 git add .
git commit -m "fix: 简要描述"
git push -u origin fix/dev-setup        # 第一次（修正 tracking）
git push                                # 之后
```

## 8. 调试

### 后端断点（VSCode）

- `.vscode/launch.json` 已配 "Attach to Toonflow (dev)"
- 配置：`port: 9229`, `restart: true`（适应 nodemon 热重启）, `sourceMaps: true`
- 流程：终端起 `yarn dev` → VSCode 调试面板启动本配置 → 下断点

### 抓"启动即触发"的 bug

把 `package.json` 里 `dev` 的 `--inspect` 临时改成 `--inspect-brk`（启动即在第一行断住等 debugger），用完改回。

### 进程清理（重要）

`yarn dev` 是 nodemon 常驻 watch 进程，**不会自己退出**。后台启动后停止时：

```bash
# Windows 上按 PID 精确杀（nodemon 父进程杀了之后，tsx 子进程可能成孤儿）
netstat -ano | grep -E ":(10588|9229)\s"     # 找 LISTENING 的 PID
taskkill //F //PID <pid>                       # 强制杀
```

不要只 `Ctrl+C` 关终端，可能留孤儿进程占着 9229/10588。

## 9. 镜像配置（中国大陆）

`yarn install` 时设这些环境变量，避免 Electron / sharp 下载超时：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
SHARP_DIST_BASE_URL=https://npmmirror.com/mirrors/sharp-libvips \
yarn install
```

`~/.npmrc` 已配 `registry=https://registry.npmmirror.com`。

## 10. 代码入口

| 路径 | 作用 |
|---|---|
| `src/app.ts` | 入口，Express 启动 |
| `src/router.ts` | 路由总入口 |
| `src/core.ts` | 动态构建路由（dev 模式每次重启重扫） |
| `src/routes/<功能>/` | 按功能分的 HTTP 接口（login / project / novel / script / setting 等） |
| `src/agents/` | AI 调用（`productionAgent` / `scriptAgent`） |
| `src/socket/` | WebSocket 实时通信（生成进度、流式输出） |
| `src/utils/` | 工具函数（数据库、文件、图片等） |
| `data/skills/*.md` | AI 提示词模板，**改完即时生效无需编译** |
| `data/modelPrompt/` | 模型提示词，即时生效 |

## 11. 编译工具链（Windows，已就绪）

- VS 2026 Community + C++ 桌面开发工作负载（`Microsoft.VisualStudio.Workload.NativeDesktop`）
- MSVC 工具集 14.44 / 14.50
- Python 3.11.15
- 原生模块（better-sqlite3 / sqlite3 / sharp）已本地编译通过

## 12. 已知陷阱与对策

| 陷阱 | 对策 |
|---|---|
| `git push` 报 `permission denied`（在 `fix/dev-setup` 上） | 第一次 push 用 `-u origin`，详见 §7 |
| 跑过 electron-rebuild 后再 `yarn dev` 报 `NODE_MODULE_VERSION mismatch` | 重新 `yarn install` 恢复 Node ABI |
| 后台 `yarn dev` 停掉后端口 9229/10588 还被占 | nodemon 子进程成孤儿，按 PID 杀（见 §8） |
| 改了原生模块 `.js` 后改动不生效 | dev 模式下 nodemon 自动重启；如果没重启，手动 `rs` 或重启 yarn dev |
| `yarn dev` 启动报端口被占 | 先确认没遗留进程；确实没有就改 `src/app.ts` 里的端口（最后手段） |
| `everything-claude-code` plugin 的 Write hook 拦 `~/.claude/` 下 .md（memory 系统） | 已在两份 hooks.json 加 `p.indexOf('.claude')===-1` 例外（marketplaces + cache 1.4.1）；**改完需重启 Claude Code 会话才生效**（hook 启动时加载到内存，运行时不重读） |
| plugin `everything-claude-code` 升级覆盖 hook 修改 | 升级后检查 `plugins/marketplaces/everything-claude-code/hooks/hooks.json` 第 40 行附近是否仍有 `.claude` 例外；原版备份在 `hooks.json.bak.20260707` |

## 13. 任务管理约定

- 多步任务（≥3 步）用 TaskCreate 跟踪
- 完成一步立刻 TaskUpdate 标 completed，不要批处理
- 阻塞性决策用 AskUserQuestion，不要替用户做决定

## 14. 剧本 Agent 结构（二次开发必读）

> 本节记录 leon 方法论二次开发的代码落点。Phase 1-2 完成于 2026-07-09，改动前务必先读本节。

### 14.1 文件结构

```
src/agents/scriptAgent/
├── index.ts   (~440 行) ← 三层架构全在这一个文件，含短剧创作 + 剧本创作双模式
└── tools.ts   (121 行) ← 通用工具（查小说/查工作区/查剧本）
```

剧本创作说明书（5 个，Phase 1 新增）：
```
data/skills/
├── story_creator_decision.md       ← 决策层（全流程编排）
├── story_creator_l0l2.md           ← L0-L2 执行层（立意+世界+人物内核+季路）
├── story_creator_l3.md             ← L3 执行层（分章 beats 大纲）
├── story_creator_draft.md          ← 正文创作执行层（逐章写）
└── story_creator_supervision.md    ← 审计监督层（架构/结构/风格/全季一致性）
```

### 14.2 三层架构代码落点

**双模式切换**（Phase 2 改动）：模式由 `projectType` 驱动，不再用关键词检测。

```typescript
// index.ts runDecisionAI() 内
const projectData = await u.db("o_project").where("id", resTool.data.projectId).first();
const isStoryCreator = projectData?.projectType === "scriptCreation";
// → true: 加载 story_creator_decision.md + createStoryCreatorSubAgent
// → false: 加载 script_agent_decision.md + createScriptSubAgent（短剧创作）
```

| 模式 | projectType | 决策层说明书 | 执行层 tool 工厂 |
|---|---|---|---|
| 短剧创作 | `"novel"` / `"script"` | `script_agent_decision.md` | `createScriptSubAgent()` |
| 剧本创作 | `"scriptCreation"` | `story_creator_decision.md` | `createStoryCreatorSubAgent()` |

**剧本创作执行层 4 个 tool**（`createStoryCreatorSubAgent` 内）：

| tool 名 | 说明书 | 输出 XML 标签 | 角色 |
|---|---|---|---|
| `run_sub_agent_l0l2` | `story_creator_l0l2.md` | `<storySkeleton>` | 架构师 |
| `run_sub_agent_l3` | `story_creator_l3.md` | `<adaptationStrategy>` | 架构师 |
| `run_sub_agent_draft` | `story_creator_draft.md` | `<scriptItem name="第N章：标题">` | 编剧 |
| `run_story_creator_supervision` | `story_creator_supervision.md` | 审计报告（消息流） | 审查 |

**短剧创作执行层 4 个 tool**（`createScriptSubAgent` 内，逻辑不变）：

| tool 名 | 说明书 | 输出 XML 标签 |
|---|---|---|
| `run_sub_agent_storySkeleton` | `script_execution_skeleton.md` | `<storySkeleton>` |
| `run_sub_agent_adaptationStrategy` | `script_execution_adaptation.md` | `<adaptationStrategy>` |
| `run_sub_agent_script` | `script_execution_script.md` | `<scriptItem>` |
| `run_supervision_agent` | `script_agent_supervision.md` | 审核报告 |

### 14.3 说明书加载方式

**直接 `fs.promises.readFile(skill, "utf-8")`**，不用 `skillsTools.ts` 的 `activate_skill` / frontmatter 机制。
→ 改 `data/skills/*.md` **即时生效无需编译**（dev 模式 nodemon 重启也无需，因为每次调用都重读文件）。

### 14.4 数据流

```
AI 产出带 XML 标签的文本
  ↓ socket.emit("content:update") 流式输出
前端解析 XML
  ↓ HTTP POST /api/scriptAgent/setPlanData
后端写入 o_agentWorkData + o_script
```

关键：AI **不直接写工作区**（tools.ts 没有 set_planData tool），由前端解析 XML 后回传。
→ 新增 XML 标签需**前端配合解析**。前端源码在 `D:\user\github\toonflow-dev\Toonflow-web`（GitHub: `leonluo2008-ops/Toonflow-web`），见 §14.8。

### 14.5 数据模型（关键表）

| 表 | 关键字段 | 用途 |
|---|---|---|
| `o_project` | id, projectType, name, artStyle, directorManual, mode | 项目设置 |
| `o_novel` | id, chapterIndex, chapter, chapterData, event, eventState | 原小说章节+事件 |
| `o_script` | id, name, content, projectId, extractState | 剧本条目 |
| `o_agentWorkData` | id, projectId, episodesId, key, data(JSON string) | Agent 工作区（storySkeleton/adaptationStrategy/script） |

`o_agentWorkData.data` 是 JSON 字符串，schema：`{ storySkeleton, adaptationStrategy, script }`。

### 14.6 现有护栏（不能删，改时保留）

| # | 护栏 | 位置 |
|---|---|---|
| 1 | 决策层不读取工作区数据 | decision.md L7 |
| 2 | subagent 失败时决策层不得接管 | decision.md L8, L233 |
| 3 | 严禁决策层自行接管执行 | decision.md L233 |
| 4 | 严禁在 subagent 异常时触发审核 | decision.md L234 |
| 5 | 派发指令正文不超过 100 字 | decision.md L139 |
| 6 | 展示报告后必须停下等用户回复 | decision.md L190 |
| 7 | 监督层只提问题不做修改决策 | supervision.md L5 |

### 14.7 现状 vs leon 方法论差距矩阵（Phase 1-2 更新）

| 方法论要素 | 状态 | 说明 |
|---|---|---|
| L0-L3 逐层门禁 | ✅ Phase 1 | `story_creator_decision.md` 文字指令实现逐层门禁 |
| P0 分级 + 自动回环 | ✅ Phase 1 | `story_creator_supervision.md` 定义 P0-硬伤/P0-设计/P0-风格/P1；decision.md 编排修订回环 |
| 双审计（结构+风格） | ✅ Phase 1 | decision.md 指定"结构审计与风格审计必须分开两次调用" |
| 风格指纹量化 | ✅ Phase 1 | `story_creator_draft.md` 定义 7 条量化门槛；`supervision.md` 提供审计口径 |
| 启发式共创四拍 | ✅ Phase 1 | `story_creator_decision.md` 编排 Prime→Diverge→Converge→Gate |
| 创作红线 | ✅ Phase 1 | `story_creator_draft.md` 4 条红线 + `supervision.md` 审计口径 |
| 执行/审查 Agent 隔离 | ✅ Phase 1 | 每次调用都是独立子 Agent（不同 tool） |
| 独立入口（项目类型驱动） | ✅ Phase 2 | `projectType === "scriptCreation"` 驱动模式选择 |
| 误报登记机制 | ❌ 未实现 | 需 `o_agentWorkData.data` 加字段 + 前端 UI |
| 框架决策日志 | ❌ 未实现 | 需 `o_agentWorkData.data` 加字段 + 前端 UI |
| P0 修复记录持久化 | ❌ 未实现 | 当前走消息流，无结构化存储 |

### 14.8 前端源码与构建部署（Phase 2 更新）

**前端源码位置**：`D:\user\github\toonflow-dev\Toonflow-web`
- GitHub：`https://github.com/leonluo2008-ops/Toonflow-web.git`
- 技术栈：Vue 3.5 + TDesign Vue Next + Pinia + vue-router 4 (Hash 模式) + Vite + vite-plugin-singlefile
- 构建产物：单文件 `dist/index.html`（~27MB）+ 4 个 Monaco worker JS + favicon

**构建 + 部署**（改了前端源码后必须执行）：

```bash
cd D:\user\github\toonflow-dev\Toonflow-web
yarn install          # 首次
yarn build-only       # 跳过 vue-tsc（有预存的 TS 报错在 generate copy.vue）
# 或 yarn build       # 完整构建（vue-tsc + vite），但会因预存报错失败
cp -f dist/* D:/user/github/toonflow-dev/Toonflow-app/data/web/
```

> ⚠️ `yarn build` 会因 `src/views/production/components/workbench/generate copy.vue` 的 TS 语法报错失败（预存问题，非本次引入）。用 `yarn build-only` 跳过类型检查。

**Phase 2 前端改动清单**：

| 文件 | 改动 |
|---|---|
| `src/views/project/components/projectDialog.vue` | 新增 `<t-option value="scriptCreation">` 第三项目类型 |
| `src/views/project/index.vue` | L120 加 `scriptCreation → /scriptAgent` 路由；L26 显示标签改动态 key |
| `src/pages/workbench/index.vue` | 菜单可见性用 `types` 数组替代 `nodelOnly`；tooltip 标签条件化 |
| `src/views/scriptAgent/index.vue` | 加 `isScriptCreation` computed；3 个 tab label 条件化（剧本创作模式显示 L0-L2框架/L3分章大纲/章节正文） |
| `src/locales/language/*.json`（7 个） | 新增 i18n key：`basedOnScriptCreation`、`type.scriptCreation`、`menu.scriptCreation`、`scriptAgent.{storySkeletonSC,adaptationStrategySC,scriptSC}` |

**菜单可见性矩阵**（`workbench/index.vue` rightBtnList，types 数组驱动）：

| 菜单 | novel | script | scriptCreation |
|---|---|---|---|
| `/novel` 小说原文 | ✅ | ❌ | ❌ |
| `/scriptAgent` 剧本Agent/创作 | ✅ | ❌ | ✅ |
| `/script` 剧本管理 | ✅ | ✅ | ❌ |
| `/cornerScape` 塑角造景 | ✅ | ✅ | ❌ |
| `/production` 视频生产 | ✅ | ✅ | ❌ |
| `/assets` 资产中心 | ✅ | ✅ | ✅ |

**XML 标签复用**（未变）：剧本创作复用短剧创作的 3 个 XML 标签（storySkeleton/adaptationStrategy/scriptItem），前端无需改动 XML 解析逻辑。前端 store `src/stores/scriptAgent.ts` 的 socket namespace `/api/socket/scriptAgent` 和 isolationKey `${projectId}:scriptAgent` 也保持不变——不同 projectId 天然隔离工作区数据。

### 14.9 改造分层原则

| 改动类型 | 落点 | 是否需编译 |
|---|---|---|
| 纯提示词/流程文字 | `data/skills/*.md` | ❌ 免编译即时生效 |
| 新增执行层 tool | `src/agents/scriptAgent/index.ts` | ✅ 需 `yarn dev` 重启 |
| 前端 UI 改动 | `Toonflow-web/src/**` | ✅ 需 `yarn build-only` + 复制 dist 到 data/web/ |
| 新增数据表/字段 | `src/lib/initDB.ts` + 迁移 | ✅ 需编译 |

### 14.10 方法论源文件

- 原始方法论：`D:\user\github\toonflow-dev\toonflow-script-methodology\`（8 个文件，Notion 是唯一权威源）
- 部署说明：`Toonflow-app/AGENTS.md`（hermes Linux 部署用）

### 14.11 Phase 1-2 完成状态（2026-07-09）

**Phase 1（方法论说明书 + 执行层）— ✅ 完成**：
- 5 个 skill 说明书覆盖三阶段：框架（L0-L3 逐层门禁 + 启发式共创四拍）→ 逐章正文（创作红线 + 风格指纹 7 条）→ 交付（全季一致性审计）
- `createStoryCreatorSubAgent` 4 个 tool：l0l2 / l3 / draft / supervision
- P0 分级口径（P0-硬伤 / P0-设计 / P0-风格 / P1）+ A/B/C/D 评级
- `yarn lint` 零错误

**Phase 2（独立入口）— ✅ 完成**：
- 后端：模式检测从关键词扫描改为 `projectType === "scriptCreation"` 确定性判断
- 前端：新增 projectType 选项 + 自动路由 + 菜单可见性 + tab 标签适配
- 7 个 i18n 文件已加翻译 key
- 前端已构建并部署到 `data/web/`

**待验证 / 后续优化**：
- 端到端测试：创建 scriptCreation 项目 → 完整跑通三阶段流程
- 误报登记机制（需 `o_agentWorkData.data` 加字段 + 前端 UI）
- 框架决策日志持久化（同上）
- `generate copy.vue` 的预存 TS 报错（影响 `yarn build` 完整构建）
- 审计报告走消息流时可能被截断（长文本场景需测试）
