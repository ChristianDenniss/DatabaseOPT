import type { Request, Response } from "express";
import { likesService } from "./likes.service.js";
import { likePostBodySchema, unlikePostUserSchema } from "./likes.schemas.js";

export async function getForPost(req: Request, res: Response): Promise<void> {
  const summary = await likesService.summaryForPost(req.params.postId);
  if (!summary) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(summary);
}

export async function likePost(req: Request, res: Response): Promise<void> {
  const parsed = likePostBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { userId } = parsed.data;
  try {
    const out = await likesService.likePost(userId, req.params.postId);
    res.status(out.created ? 201 : 200).json(out);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (msg === "User not found" || msg === "Post not found") {
      res.status(404).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
}

export async function unlikePost(req: Request, res: Response): Promise<void> {
  const raw = {
    userId:
      typeof req.body?.userId === "string"
        ? req.body.userId
        : typeof req.query.userId === "string"
          ? req.query.userId
          : undefined,
  };
  const parsed = unlikePostUserSchema.safeParse(raw);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Provide userId in body or query" });
    return;
  }
  const out = await likesService.unlikePost(parsed.data.userId, req.params.postId);
  res.json(out);
}
