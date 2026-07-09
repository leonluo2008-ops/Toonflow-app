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
    id: z.number(),
    name: z.string(),
    intro: z.string(),
    type: z.string(),
    artStyle: z.string().optional(),
    directorManual: z.string().optional(),
    videoRatio: z.string().optional(),
    imageModel: z.string().optional(),
    videoModel: z.string().optional(),
    projectType: z.string(),
    imageQuality: z.string().optional(),
    mode: z.string().optional(),
    authorPersona: z.string().optional(),
    targetAudience: z.string().optional(),
  }),
  async (req, res) => {
    const { id, name, intro, type, artStyle, videoRatio, directorManual, imageModel, videoModel, imageQuality, projectType, mode, authorPersona, targetAudience } = req.body;

    await u.db("o_project").where("id", id).update({
      name,
      intro,
      type,
      artStyle,
      videoRatio,
      directorManual,
      imageModel,
      videoModel,
      imageQuality,
      projectType,
      mode,
      authorPersona: authorPersona || "",
      targetAudience: targetAudience || "",
    });

    res.status(200).send(success({ message: "编辑项目成功" }));
  },
);
