import { z } from "zod";

export const postLikeSummarySchema = z.object({
  postId: z.string(),
  count: z.number(),
  userIds: z.array(z.string()),
});

export type PostLikeSummary = z.infer<typeof postLikeSummarySchema>;

export const likePostBodySchema = z.object({
  userId: z.string().min(1),
});

export const unlikePostUserSchema = z.object({
  userId: z.string().min(1),
});
