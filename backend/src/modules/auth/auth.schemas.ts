import { z } from "zod";

export const issueDevTokenBodySchema = z.object({
  userId: z.string().min(1),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});
