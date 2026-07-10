# Toonflow 剧本 Agent · 方法论源（给 Claude Code）

> 本目录是 leon 的「系列剧本创作方法论」的可移植镜像，用于指导 Toonflow-app 剧本 Agent（scriptAgent）的升级改造。

## 这是什么

这些文件是 leon 在 Notion 剧本创作工作台里沉淀的成熟方法论。Claude Code 本机没有 Notion 访问权，因此把它们导出为 `.md`，随 fork 的一个专用分支进入仓库，作为你（Claude Code）改造 Toonflow 时的**方法论依据**。

## 协作模型（重要）

- **Notion = 方法论的唯一权威源（single source of truth）。** 铁柱（Notion AI）在 Notion 维护并更新这些方法论。
- **本分支的 `docs/` = 喂给 Claude Code 的镜像。** 铁柱产出/更新 `.md`，建分支、提交、推送由 Claude Code（或 leon）在本机完成。
- 方法论有更新时，铁柱重新导出，Claude Code 再同步到分支。

## 目录索引

```
docs/script-methodology/
├── README.md                         ← 本文件
├── 00-工作方案-Toonflow剧本升级.md    ← 项目入口：改造工作方案 + 三段执行指令
├── methodology/
│   ├── 01-创作方法论-写作铁律.md       ← 写正文时的创作铁律（结构/风格审计对照依据）
│   ├── 02-审计规范与清单.md            ← 双审计规范、投喂规范、误报治理、P0 分级、清单 A–E
│   ├── 03-工作流与操作规范.md          ← 工作流、多智能体协同模型、状态枚举、禁止动作
│   ├── 04-模板库.md                   ← 项目工作页/交接报告/标准大纲模板
│   └── 05-实战复盘与落地参考.md        ← 每条铁律的实战由来 + 能力边界
└── skills/
    ├── SKILL-系列故事架构师.md         ← 启发式共创搭 L0–L3 骨架（只搭骨架不写正文）
    ├── SKILL-尼克儿童写手.md           ← 按风格指纹把 L3 beats 写成正文
    └── SKILL-剧本审查子Agent.md        ← 结构/风格审计，只读回报（含可复用审查 Prompt）
```

## 方法论 → Toonflow 映射（速览）

| 方法论要素 | 对应 Toonflow 落点（方向，以调研为准） |
|---|---|
| 三层角色边界（主控/执行/审查，执行与审查须不同 Agent） | 决策层/执行层/监督层三层已同构 → 强化各岗位 .md 边界措辞 |
| 启发式共创（facilitator，四拍 Prime→Diverge→Converge→Gate，逐层门禁） | 决策层说明书 + 决策层编排（门禁交互） |
| L0–L3 分层框架 | 骨架说明书扩为 L0–L2 + 新增 L3 beats 环节 |
| 创作红线（不写鸡汤/禁凭空获知/空间自洽/章际连续） | 写入分集剧本说明书 + 监督层审计清单 |
| 双审计（结构 + 风格指纹，P0 分级，P0 回环） | 监督层增强 + 独立风格审计 + P0 门禁回环 |
| 风格指纹量化门槛 | 门槛清单写入 script/supervision 说明书 |
| 框架决策日志 / 接力 | 需持久化 → src + 数据库（落点以调研为准） |

> ⚠️ 所有落点均为**推断方向**，具体文件/层级/字段一律以 Claude Code 的真实代码调研为准，冲突先上报。详见 `00-工作方案`。

## 建议的分支落地方式（给 Claude Code）

```bash
# 在你 fork 的 toonflow 仓库里
git checkout -b feat/script-methodology
mkdir -p docs/script-methodology
# 把本目录内容拷入 docs/script-methodology/
git add docs/script-methodology
git commit -m "docs: add 剧本创作方法论源（给 scriptAgent 升级用）"
# 不 push、不提 PR，除非 leon 明确要求
```

> 分支纪律：master 不收 PR，功能分支从 upstream/develop 切；本方法论 docs 仅作为工作分支上的共享依据。
