import type { Request, Response } from "express";
import { commentService } from "./comment.service.js";
import { createCommentBodySchema, listCommentsQuerySchema } from "./comment.schemas.js";

export async function getById(req: Request, res: Response): Promise<void> {
  const c = await commentService.findById(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Comment not found" });
    return;
  }
  res.json(c);
}

export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listCommentsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    return;
  }
  const { postId, limit, offset } = parsed.data;
  const comments = await commentService.listByPost(postId, { limit, offset });
  res.json({ comments, postId, limit, offset });
}

export async function create(req: Request, res: Response): Promise<void> {
  const parsed = createCommentBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }

  try {
    const { postId, authorId, body, parentCommentId } = parsed.data;
    const comment = await commentService.create({
      postId,
      authorId,
      body,
      parentCommentId: parentCommentId ?? null,
    });
    res.status(201).json(comment);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (msg === "Post not found" || msg === "User not found" || msg === "Parent comment not found") {
      res.status(404).json({ error: msg });
      return;
    }
    if (
      msg === "Parent comment belongs to a different post" ||
      msg === "Comment body is required"
    ) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
}
