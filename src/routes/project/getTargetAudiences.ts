import express from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import fs from "fs";

const router = express.Router();

// 返回可用的目标读者画像 SKILL 列表（扫描 data/skills/AUDIENCE-*.md）
export default router.get("/", async (req, res) => {
  const skillsDir = u.getPath("skills");
  const files = await fs.promises.readdir(skillsDir);

  const audiences = files
    .filter((f) => f.startsWith("AUDIENCE-") && f.endsWith(".md"))
    .map((f) => f.replace(/^AUDIENCE-/, "").replace(/\.md$/, ""));

  return res.status(200).send(success({ data: audiences }));
});
