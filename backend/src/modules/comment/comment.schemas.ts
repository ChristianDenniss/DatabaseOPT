import { z } from "zod";

export const commentPublicSchema = z.object({
  id: z.string(),
  postId: z.string(),
  authorId: z.string(),
  parentCommentId: z.string().nullable(),
  body: z.string(),
  createdAt: z.date(),
});

export type CommentPublic = z.infer<typeof commentPublicSchema>;

export const createCommentBodySchema = z.object({
  postId: z.string().min(1),
  authorId: z.string().min(1),
  body: z.string(),
  parentCommentId: z.union([z.string().min(1), z.null()]).optional(),
});

export type CreateCommentInput = z.infer<typeof createCommentBodySchema>;

export const listCommentsQuerySchema = z.object({
  postId: z.string().min(1),
  limit: z.preprocess(
    (raw) => {
      const n = Number(raw ?? 50);
      return Math.min(Math.max(n, 1), 200);
    },
    z.number().int().min(1).max(200)
  ),
  offset: z.preprocess(
    (raw) => Math.max(Number(raw ?? 0), 0),
    z.number().int().min(0)
  ),
});
