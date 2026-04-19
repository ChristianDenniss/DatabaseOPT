import { z } from "zod";

export const followListResultSchema = z.object({
  userIds: z.array(z.string()),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type FollowListResult = z.infer<typeof followListResultSchema>;

export const followBodySchema = z.object({
  followerId: z.string().min(1),
  followingId: z.string().min(1),
});

export const unfollowPayloadSchema = z.object({
  followerId: z.string().min(1),
  followingId: z.string().min(1),
});

export const followPaginationQuerySchema = z.object({
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

export const userIdParamSchema = z.object({
  userId: z.string().min(1),
});
