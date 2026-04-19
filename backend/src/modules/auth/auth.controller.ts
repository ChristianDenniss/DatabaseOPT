import type { Request, Response } from "express";
import { signTokenPair, verifyRefreshToken } from "../../lib/jwt.js";
import { userService } from "../user/user.service.js";
import { issueDevTokenBodySchema, refreshBodySchema } from "./auth.schemas.js";

function tokenResponse(accessToken: string, refreshToken: string) {
  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer" as const,
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
  };
}

/**
 * Issues access + refresh JWTs for a user id. **Insecure** — only when AUTH_ISSUE_DEV_TOKENS=true.
 */
export async function issueDevToken(req: Request, res: Response): Promise<void> {
  if (process.env.AUTH_ISSUE_DEV_TOKENS !== "true") {
    res.status(403).json({ error: "Dev token issuance is disabled (set AUTH_ISSUE_DEV_TOKENS=true)" });
    return;
  }
  const parsed = issueDevTokenBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { userId } = parsed.data;
  const user = await userService.findById(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  try {
    const pair = signTokenPair(user.id);
    res.json(tokenResponse(pair.accessToken, pair.refreshToken));
  } catch (e) {
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
}

/**
 * Exchange a valid refresh token for a new access + refresh pair (rotation).
 */
export async function refreshTokens(req: Request, res: Response): Promise<void> {
  const parsed = refreshBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { refreshToken } = parsed.data;
  try {
    const { sub } = verifyRefreshToken(refreshToken);
    const user = await userService.findById(sub);
    if (!user) {
      res.status(401).json({ error: "User no longer exists" });
      return;
    }
    const pair = signTokenPair(user.id);
    res.json(tokenResponse(pair.accessToken, pair.refreshToken));
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
}
