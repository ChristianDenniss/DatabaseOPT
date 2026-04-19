import type { Request, Response } from "express";
import { postService } from "./post.service.js";
import { listPostsQuerySchema } from "./post.schemas.js";

export async function getById(req: Request, res: Response): Promise<void> {
  const post = await postService.findById(req.params.id);
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(post);
}

export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listPostsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    return;
  }
  const { limit, offset, authorId } = parsed.data;

  const posts = authorId
    ? await postService.listByAuthor(authorId, { limit, offset })
    : await postService.listRecent({ limit, offset });

  res.json({ posts, limit, offset, authorId: authorId ?? null });
}
