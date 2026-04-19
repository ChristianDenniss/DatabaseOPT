import { z } from "zod";

export const userPublicSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UserPublic = z.infer<typeof userPublicSchema>;

export const listUsersQuerySchema = z.object({
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
});
