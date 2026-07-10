import express from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

const STAGE_ORDER = [
  "构思中", "立意共创中", "框架共创中",
  "L1 已定", "L0 已定", "全系列 L2 已定", "当前季 L3 已定",
  "架构审计中", "正文创作中", "单章审计中", "单章修订中",
  "当前季已完稿", "全季一致性审计中", "全季总修中", "完成",
];

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    stage: z.string(),
    summary: z.string().optional(),
  }),
  async (req, res) => {
    const { projectId, stage, summary } = req.body;

    const current = await u.db("o_project").where("id", projectId).select("stage").first();
    const currentStage = (current?.stage as string) || "构思中";
    const currentIndex = STAGE_ORDER.indexOf(currentStage);
    const targetIndex = STAGE_ORDER.indexOf(stage);

    if (targetIndex < 0) {
      res.status(200).send(success(null, `❌ 门禁拒绝：阶段「${stage}」不在合法枚举中。合法值：${STAGE_ORDER.join("、")}`));
      return;
    }
    if (targetIndex < currentIndex) {
      res.status(200).send(success(null, `❌ 门禁拒绝：不能从「${currentStage}」回退到「${stage}」`));
      return;
    }
    if (targetIndex > currentIndex + 1) {
      res.status(200).send(success(null, `❌ 门禁拒绝：不能从「${currentStage}」跳步到「${stage}」`));
      return;
    }

    await u.db("o_project").where("id", projectId).update({ stage });

    const project = await u.db("o_project").where("id", projectId).first();
    const existingLog = (project?.decisionLog as string) || "";
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${currentStage} → ${stage} | ${summary || "XML标签自动推进"}`;
    const newLog = existingLog ? existingLog + "\n" + entry : entry;
    await u.db("o_project").where("id", projectId).update({ decisionLog: newLog });

    // emit socket event to all connected clients for this project
    const io = req.app.get("io") as any;
    if (io) {
      const namespace = io.of("/api/socket/scriptAgent");
      namespace.emit("stageUpdate", { stage, projectId });
    }

    res.status(200).send(success(null, `✅ 项目阶段已从「${currentStage}」推进到「${stage}」`));
  },
);
