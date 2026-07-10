import { Socket } from "socket.io";
import { tool, jsonSchema } from "ai";
import { z } from "zod";
import u from "@/utils";
import Memory from "@/utils/agent/memory";
import useTools from "@/agents/scriptAgent/tools";
import ResTool from "@/socket/resTool";
import * as fs from "fs";
import path from "path";

export interface AgentContext {
  socket: Socket;
  isolationKey: string;
  text: string;
  userMessageTime?: number;
  abortSignal?: AbortSignal;
  resTool: ResTool;
  msg: ReturnType<ResTool["newMessage"]>;
  thinkConfig: {
    think: boolean;
    thinlLevel: 0 | 1 | 2 | 3;
  };
  projectId?: string;
}

function buildMemPrompt(mem: Awaited<ReturnType<Memory["get"]>>): string {
  let memoryContext = "";
  if (mem.rag.length) {
    memoryContext += `[相关记忆]\n${mem.rag.map((r) => r.content).join("\n")}`;
  }
  if (mem.summaries.length) {
    if (memoryContext) memoryContext += "\n\n";
    memoryContext += `[历史摘要]\n${mem.summaries.map((s, i) => `${i + 1}. ${s.content}`).join("\n")}`;
  }
  if (mem.shortTerm.length) {
    if (memoryContext) memoryContext += "\n\n";
    memoryContext += `[近期对话]\n${mem.shortTerm.map((m) => `${m.role}: ${m.content}`).join("\n")}`;
  }
  return `## Memory\n以下是你对用户的记忆，可作为参考但不要主动提及：\n${memoryContext}`;
}

export async function runDecisionAI(ctx: AgentContext) {
  const { isolationKey, text, userMessageTime, abortSignal, resTool } = ctx;
  const memory = new Memory("scriptAgent", isolationKey);
  await memory.add("user", text, { createTime: userMessageTime });

  const memData = await memory.get(text);

  const projectData = await u.db("o_project").where("id", resTool.data.projectId).first();
  const novelData = await u.db("o_novel").where("projectId", resTool.data.projectId).select("chapterIndex");

  const isStoryCreator = projectData?.projectType === "scriptCreation";

  const skillFile = isStoryCreator ? "story_creator_decision.md" : "script_agent_decision.md";
  const skill = path.join(u.getPath("skills"), skillFile);
  const prompt = await fs.promises.readFile(skill, "utf-8");

  const mem = buildMemPrompt(memData);

  const projectInfo = isStoryCreator
    ? [
        "## 项目信息",
        `剧本名称：${projectData?.name ?? "未知"}`,
        `剧本类型：${projectData?.type ?? "未知"}`,
        `剧本简介：${projectData?.intro ?? "无"}`,
        `写手人设：${projectData?.authorPersona ?? "无"}`,
        `目标读者：${projectData?.targetAudience ?? "无"}`,
      ].join("\n")
    : [
        "## 项目信息",
        `小说名称：${projectData?.name ?? "未知"}`,
        `小说类型：${projectData?.type ?? "未知"}`,
        `小说简介：${projectData?.intro ?? "无"}`,
        `目标改编影视视觉手册|画风：${projectData?.artStyle ?? "无"}`,
        `目标改编视频画幅：${projectData?.videoRatio ?? "16:9"}`,
        `章节数量：${novelData.length}章`,
      ].join("\n");

  const { fullStream } = await u.Ai.Text("scriptAgent:decisionAgent", ctx.thinkConfig.think, ctx.thinkConfig.thinlLevel).stream({
    messages: [
      { role: "system", content: prompt },
      { role: "assistant", content: projectInfo + "\n" + mem },
      { role: "user", content: text },
    ],
    abortSignal,
    tools: {
      ...memory.getTools(),
      ...useTools({ resTool: ctx.resTool, msg: ctx.msg }),
      ...createSubAgent(ctx, isStoryCreator),
    },
    onFinish: async (completion) => {
      await memory.add("assistant:decision", removeAllXmlTags(completion.text));
    },
  });

  let currentMsg = ctx.msg;
  await consumeFullStream(fullStream, currentMsg, () => {
    if (ctx.msg === currentMsg) return currentMsg;
    currentMsg.complete();
    currentMsg = ctx.msg;
    return currentMsg;
  });
}

function createSubAgent(parentCtx: AgentContext, isStoryCreator: boolean = false) {
  if (isStoryCreator) {
    return createStoryCreatorSubAgent(parentCtx);
  }
  return createScriptSubAgent(parentCtx);
}

function createScriptSubAgent(parentCtx: AgentContext) {
  const { resTool, abortSignal } = parentCtx;
  const memory = new Memory("scriptAgent", parentCtx.isolationKey);

  async function runAgent({
    key,
    prompt,
    system,
    name,
    memoryKey,
    tools: extraTools,
    messages,
  }: {
    key: `${string}:${string}`;
    prompt: string;
    system: string;
    name: string;
    memoryKey: string;
    tools?: Record<string, any>;
    messages?: { role: "user" | "assistant" | "system"; content: string }[];
  }) {
    parentCtx.msg.complete();
    const subMsg = resTool.newMessage("assistant", name);

    const { fullStream } = await u.Ai.Text(key, parentCtx.thinkConfig.think, parentCtx.thinkConfig.thinlLevel).stream({
      system,
      messages: messages ?? [{ role: "user", content: prompt }],
      abortSignal,
      tools: { ...extraTools, ...useTools({ resTool, msg: subMsg }) },
    });

    const fullResponse = await consumeFullStream(fullStream, subMsg);

    if (fullResponse.trim()) {
      await memory.add(memoryKey, removeAllXmlTags(fullResponse), {
        name,
        createTime: new Date(subMsg.datetime).getTime(),
      });
    }

    parentCtx.msg = resTool.newMessage("assistant", "视频策划");
    return fullResponse;
  }

  const promptInput = z
    .object({
      prompt: z.string().describe("交给子Agent的任务简约描述，100字以内"),
    })
    .toJSONSchema();

  const run_sub_agent_storySkeleton = tool({
    description: "运行执行subAgent来完成故事骨架相关任务",
    inputSchema: jsonSchema<{ prompt: string }>(promptInput),
    execute: async ({ prompt }) => {
      const skill = path.join(u.getPath("skills"), "script_execution_skeleton.md");
      const systemPrompt = await fs.promises.readFile(skill, "utf-8");

      const formatPrompt = "\n你必须使用如下XML格式写入工作区：\n<storySkeleton>故事骨架内容</storySkeleton>";

      return runAgent({
        key: "scriptAgent:storySkeletonAgent",
        prompt,
        system: systemPrompt + formatPrompt,
        name: "编剧",
        memoryKey: "assistant:execution:storySkeleton",
        messages: [{ role: "user", content: prompt + formatPrompt }],
      });
    },
  });

  const run_sub_agent_adaptationStrategy = tool({
    description: "运行执行subAgent来完成改编策略相关任务",
    inputSchema: jsonSchema<{ prompt: string }>(promptInput),
    execute: async ({ prompt }) => {
      const skill = path.join(u.getPath("skills"), "script_execution_adaptation.md");
      const systemPrompt = await fs.promises.readFile(skill, "utf-8");

      const formatPrompt = "\n你必须使用如下XML格式写入工作区：\n<adaptationStrategy>改编策略内容</adaptationStrategy>";

      return runAgent({
        key: "scriptAgent:adaptationStrategyAgent",
        prompt,
        system: systemPrompt + formatPrompt,
        name: "编剧",
        memoryKey: "assistant:execution:adaptationStrategy",
        messages: [{ role: "user", content: prompt + formatPrompt }],
      });
    },
  });

  const run_sub_agent_script = tool({
    description: "运行执行subAgent来完成剧本相关任务",
    inputSchema: jsonSchema<{ prompt: string }>(promptInput),
    execute: async ({ prompt }) => {
      const skill = path.join(u.getPath("skills"), "script_execution_script.md");
      const systemPrompt = await fs.promises.readFile(skill, "utf-8");

      const scriptList = await u.db("o_script").where("projectId", resTool.data.projectId).select("id", "name");
      const scriptPrompt = ["## 可用剧本(ID:名称)", scriptList.map((s: any) => `${s.id}:${(s.name || "").replace(/[,:]/g, "")}`).join(","), ""].join(
        "\n",
      );

      const novelData = await u.db("o_novel").where("projectId", resTool.data.projectId).select("chapterIndex");

      const formatPrompt = `\n你必须使用如下XML格式写入工作区：\nXML不得添加任何额外标签<scriptItem name="剧本名称">剧本内容</scriptItem><scriptItem name="剧本名称">剧本内容</scriptItem><scriptItem name="剧本名称">剧本内容</scriptItem>`;

      return runAgent({
        key: "scriptAgent:scriptAgent",
        prompt,
        system: systemPrompt + formatPrompt,
        messages: [
          { role: "assistant", content: scriptPrompt + `章节数量：${novelData.length}章` },
          { role: "user", content: prompt + formatPrompt },
        ],
        name: "编剧",
        memoryKey: "assistant:execution:script",
      });
    },
  });

  const run_supervision_agent = tool({
    description: "运行监督层subAgent执行独立任务，完成后返回结果",
    inputSchema: jsonSchema<{ prompt: string }>(promptInput),
    execute: async ({ prompt }) => {
      const skill = path.join(u.getPath("skills"), "script_agent_supervision.md");
      const systemPrompt = await fs.promises.readFile(skill, "utf-8");

      return runAgent({
        key: "scriptAgent:supervisionAgent",
        prompt,
        system: systemPrompt,
        name: "编辑",
        memoryKey: "assistant:supervision",
      });
    },
  });

  return {
    run_sub_agent_storySkeleton,
    run_sub_agent_adaptationStrategy,
    run_sub_agent_script,
    run_supervision_agent,
  };
}

function createStoryCreatorSubAgent(parentCtx: AgentContext) {
  const { resTool, abortSignal } = parentCtx;
  const memory = new Memory("scriptAgent", parentCtx.isolationKey);

  async function runAgent({
    key,
    prompt,
    system,
    name,
    memoryKey,
    tools: extraTools,
    messages,
  }: {
    key: `${string}:${string}`;
    prompt: string;
    system: string;
    name: string;
    memoryKey: string;
    tools?: Record<string, any>;
    messages?: { role: "user" | "assistant" | "system"; content: string }[];
  }) {
    parentCtx.msg.complete();
    const subMsg = resTool.newMessage("assistant", name);

    const { fullStream } = await u.Ai.Text(key, parentCtx.thinkConfig.think, parentCtx.thinkConfig.thinlLevel).stream({
      system,
      messages: messages ?? [{ role: "user", content: prompt }],
      abortSignal,
      tools: { ...extraTools, ...useTools({ resTool, msg: subMsg }) },
    });

    const fullResponse = await consumeFullStream(fullStream, subMsg);

    if (fullResponse.trim()) {
      await memory.add(memoryKey, removeAllXmlTags(fullResponse), {
        name,
        createTime: new Date(subMsg.datetime).getTime(),
      });
    }

    parentCtx.msg = resTool.newMessage("assistant", "视频策划");
    return fullResponse;
  }

  const promptInput = z
    .object({
      prompt: z.string().describe("交给子Agent的任务简约描述，100字以内"),
    })
    .toJSONSchema();

  const run_sub_agent_l0l2 = tool({
    description: "运行执行subAgent完成L0-L2框架（立意+世界+人物内核+季路）",
    inputSchema: jsonSchema<{ prompt: string }>(promptInput),
    execute: async ({ prompt }) => {
      const skill = path.join(u.getPath("skills"), "story_creator_l0l2.md");
      const systemPrompt = await fs.promises.readFile(skill, "utf-8");

      const formatPrompt = "\n你必须使用如下XML格式写入工作区：\n<storySkeleton>L0-L2框架内容</storySkeleton>";

      return runAgent({
        key: "storyCreator:l0l2Agent",
        prompt,
        system: systemPrompt + formatPrompt,
        name: "架构师",
        memoryKey: "assistant:execution:l0l2",
        messages: [{ role: "user", content: prompt + formatPrompt }],
      });
    },
  });

  const run_sub_agent_l3 = tool({
    description: "运行执行subAgent完成L3分章beats大纲",
    inputSchema: jsonSchema<{ prompt: string }>(promptInput),
    execute: async ({ prompt }) => {
      const skill = path.join(u.getPath("skills"), "story_creator_l3.md");
      const systemPrompt = await fs.promises.readFile(skill, "utf-8");

      const formatPrompt = "\n你必须使用如下XML格式写入工作区：\n<adaptationStrategy>L3分章beats内容</adaptationStrategy>";

      return runAgent({
        key: "storyCreator:l3Agent",
        prompt,
        system: systemPrompt + formatPrompt,
        name: "架构师",
        memoryKey: "assistant:execution:l3",
        messages: [{ role: "user", content: prompt + formatPrompt }],
      });
    },
  });

  const run_sub_agent_draft = tool({
    description: "运行执行subAgent完成单章正文（逐章写，prompt指定章节）",
    inputSchema: jsonSchema<{ prompt: string }>(promptInput),
    execute: async ({ prompt }) => {
      const skill = path.join(u.getPath("skills"), "story_creator_draft.md");
      let systemPrompt = await fs.promises.readFile(skill, "utf-8");

      // 根据项目的写手人设动态加载对应 SKILL 文件
      const projectData = await u.db("o_project").where("id", resTool.data.projectId).first();
      const authorPersona = projectData?.authorPersona;
      if (authorPersona) {
        const personaSkillPath = path.join(u.getPath("skills"), `SKILL-${authorPersona}.md`);
        try {
          const personaSkill = await fs.promises.readFile(personaSkillPath, "utf-8");
          // 替换 draft.md 中的动态注入占位
          systemPrompt = systemPrompt.replace(
            "<!-- AUTHOR_PERSONA_SKILL_RULES: 此处由运行时动态追加写手 SKILL 内容 -->",
            personaSkill,
          );
        } catch {
          // SKILL 文件不存在时保持占位，不中断流程
        }
      }

      // 根据项目的目标读者动态加载对应 AUDIENCE SKILL
      const targetAudience = projectData?.targetAudience;
      if (targetAudience) {
        const audienceSkillPath = path.join(u.getPath("skills"), `AUDIENCE-${targetAudience}.md`);
        try {
          const audienceSkill = await fs.promises.readFile(audienceSkillPath, "utf-8");
          systemPrompt = systemPrompt.replace(
            "<!-- TARGET_AUDIENCE_SKILL_RULES: 此处由运行时动态追加目标读者 SKILL 内容 -->",
            audienceSkill,
          );
        } catch {
          // SKILL 文件不存在时保持占位，不中断流程
        }
      }

      const formatPrompt = '\n你必须使用如下XML格式写入工作区：\n<scriptItem name="第N章：标题">单章正文内容</scriptItem>\n注意：attrs.name必须包含章节编号和标题。修订时使用相同的attrs.name覆盖，不新建条目。';

      return runAgent({
        key: "storyCreator:draftAgent",
        prompt,
        system: systemPrompt + formatPrompt,
        name: "编剧",
        memoryKey: "assistant:execution:draft",
        messages: [{ role: "user", content: prompt + formatPrompt }],
      });
    },
  });

  const run_story_creator_supervision = tool({
    description: "运行审计subAgent（架构/结构/风格/全季一致性，prompt指定审计类型）",
    inputSchema: jsonSchema<{ prompt: string }>(promptInput),
    execute: async ({ prompt }) => {
      const skill = path.join(u.getPath("skills"), "story_creator_supervision.md");
      const systemPrompt = await fs.promises.readFile(skill, "utf-8");

      return runAgent({
        key: "storyCreator:supervisionAgent",
        prompt,
        system: systemPrompt,
        name: "审查",
        memoryKey: "assistant:supervision",
      });
    },
  });

  const auditPromptInput = z
    .object({
      auditType: z.enum(["structure", "style"]).describe("审计类型：structure=结构审计，style=风格审计"),
      prompt: z.string().describe("审计任务描述，100字以内"),
    })
    .toJSONSchema();

  const run_story_creator_structure_audit = tool({
    description: "运行独立结构审计subAgent（仅结构审计，不可兼任风格审计）",
    inputSchema: jsonSchema<{ auditType: string; prompt: string }>(auditPromptInput),
    execute: async ({ auditType, prompt }) => {
      const skill = path.join(u.getPath("skills"), "story_creator_supervision.md");
      const systemPrompt = await fs.promises.readFile(skill, "utf-8");

      return runAgent({
        key: "scriptAgent:supervisionAgent",
        prompt: `【结构审计】${prompt}`,
        system: systemPrompt,
        name: "结构审计",
        memoryKey: "assistant:audit:structure",
      });
    },
  });

  const run_story_creator_style_audit = tool({
    description: "运行独立风格审计subAgent（仅风格审计，不可兼任结构审计）",
    inputSchema: jsonSchema<{ auditType: string; prompt: string }>(auditPromptInput),
    execute: async ({ auditType, prompt }) => {
      const skill = path.join(u.getPath("skills"), "story_creator_supervision.md");
      const systemPrompt = await fs.promises.readFile(skill, "utf-8");

      return runAgent({
        key: "scriptAgent:supervisionAgent",
        prompt: `【风格审计】${prompt}`,
        system: systemPrompt,
        name: "风格审计",
        memoryKey: "assistant:audit:style",
      });
    },
  });

  const lockProjectStageInput = z
    .object({
      stage: z.string().describe("项目阶段枚举值，如：构思中/L1已定/L0已定/全系列L2已定/当前季L3已定/架构审计中/正文创作中/单章审计中/当前季已完稿/暂停"),
      summary: z.string().describe("本次阶段变更摘要，50字以内"),
    })
    .toJSONSchema();

  const lock_project_stage = tool({
    description: "锁定剧本创作项目当前阶段（写入DB o_project.stage）",
    inputSchema: jsonSchema<{ stage: string; summary: string }>(lockProjectStageInput),
    execute: async ({ stage, summary }) => {
      const projectId = resTool.data.projectId;
      await u.db("o_project").where("id", projectId).update({ stage });

      const project = await u.db("o_project").where("id", projectId).first();
      const existingLog = (project?.decisionLog as string) || "";
      const timestamp = new Date().toISOString();
      const entry = `[${timestamp}] stage=${stage} | ${summary}`;
      const newLog = existingLog ? existingLog + "\n" + entry : entry;
      await u.db("o_project").where("id", projectId).update({ decisionLog: newLog });

      return `项目阶段已锁定为「${stage}」，决策日志已更新。`;
    },
  });

  return { run_sub_agent_l0l2, run_sub_agent_l3, run_sub_agent_draft, run_story_creator_supervision, run_story_creator_structure_audit, run_story_creator_style_audit, lock_project_stage };
}

async function consumeFullStream(
  fullStream: AsyncIterable<any>,
  initialMsg: ReturnType<ResTool["newMessage"]>,
  syncMsg?: () => ReturnType<ResTool["newMessage"]>,
): Promise<string> {
  let msg = initialMsg;
  let text = msg.text();
  let thinking: ReturnType<typeof msg.thinking> | null = null;
  let thinkTime = 0;
  let fullResponse = "";

  try {
    for await (const chunk of fullStream) {
      if (syncMsg) {
        const newMsg = syncMsg();
        if (newMsg !== msg) {
          msg = newMsg;
          text = msg.text();
        }
      }
      if (chunk.type === "reasoning-start") {
        thinkTime = Date.now();
        thinking = msg.thinking("思考中...");
      } else if (chunk.type === "reasoning-delta") {
        thinking?.append(chunk.text);
      } else if (chunk.type === "reasoning-end") {
        thinkTime = Date.now() - thinkTime;
        thinking?.updateTitle(`思考完毕（${(thinkTime / 1000).toFixed(1)} 秒）`);
        thinking?.complete();
        thinking = null;
      } else if (chunk.type === "text-delta") {
        text.append(chunk.text);
        fullResponse += chunk.text;
      } else if (chunk.type === "error") {
        throw chunk.error;
      }
    }
    text.complete();
    msg.complete();
  } catch (err: any) {
    thinking?.complete();
    const errMsg = err?.message ?? String(err);
    text.append(errMsg);
    text.error();
    msg.error();
    throw err;
  }

  return fullResponse;
}

function removeAllXmlTags(text: string): string {
  text = text.replace(/<([a-zA-Z][\w-]*)(\s+[^>]*)?>([\s\S]*?)<\/\1>/g, "");
  text = text.replace(/<([a-zA-Z][\w-]*)(\s+[^>]*)?\/>/g, "");
  text = text.replace(/<\/?[a-zA-Z][\w-]*(\s+[^>]*)?>/g, "");
  return text.trim();
}
