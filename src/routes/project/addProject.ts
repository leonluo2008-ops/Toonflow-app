import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 新增项目
export default router.post(
  "/",
  validateFields({
    projectType: z.string(),
    name: z.string(),
    intro: z.string(),
    type: z.string(),
    artStyle: z.string().optional(),
    directorManual: z.string().optional(),
    videoRatio: z.string().optional(),
    imageModel: z.string().optional(),
    videoModel: z.string().optional(),
    imageQuality: z.string().optional(),
    mode: z.string().optional(),
    authorPersona: z.string().optional(),
    targetAudience: z.string().optional(),
  }),
  async (req, res) => {
    const { projectType, name, intro, type, directorManual, artStyle, videoRatio, imageModel, videoModel, imageQuality, mode, authorPersona, targetAudience } = req.body;

    await u.db("o_project").insert({
      id: Date.now(),
      projectType,
      name,
      intro,
      type,
      artStyle: artStyle || "",
      videoRatio: videoRatio || "16:9",
      directorManual: directorManual || "",
      userId: 1,
      imageModel: imageModel || "",
      videoModel: videoModel || "",
      createTime: Date.now(),
      imageQuality: imageQuality || "",
      mode: mode || "",
      authorPersona: authorPersona || "",
      targetAudience: targetAudience || "",
    });

    res.status(200).send(success({ message: "新增项目成功" }));
  },
);
