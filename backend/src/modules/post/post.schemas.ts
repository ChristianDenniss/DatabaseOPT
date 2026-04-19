import { z } from "zod";
import { PostVisibility } from "./post-visibility.enum.js";

export const postVisibilitySchema = z.nativeEnum(PostVisibility);

export const postPublicSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  body: z.string(),
  repostOfPostId: z.string().nullable(),
  visibility: postVisibilitySchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PostPublic = z.infer<typeof postPublicSchema>;

export const listPostsQuerySchema = z.object({
  limit: z.preprocess(
    (raw) => {
      const n = Number(raw ?? 20);
      return Math.min(Math.max(n, 1), 100);
    },
    z.number().int().min(1).max(100)
  ),
  offset: z.preprocess(
    (raw) => Math.max(Number(raw ?? 0), 0),
    z.number().int().min(0)
  ),
  authorId: z.string().min(1).optional(),
});
