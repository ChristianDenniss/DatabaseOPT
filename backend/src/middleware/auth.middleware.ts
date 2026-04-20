import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt.js";

export function authenticateJwt(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization?.trim();
  if (!auth?.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header (expected Bearer token)" });
    return;
  }
  const token = auth.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: "Empty bearer token" });
    return;
  }
  try {
    const { sub } = verifyAccessToken(token);
    req.user = { sub };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * When `AUTH_GLOBAL_PROTECT=1`, require a valid JWT for all `/api/*` routes except
 * `/api/health` and `/api/auth/*`. Disabled by default.
 */
export function conditionalGlobalAuth(req: Request, res: Response, next: NextFunction): void {
  if (process.env.AUTH_GLOBAL_PROTECT !== "1") {
    next();
    return;
  }
  if (req.method === "OPTIONS") {
    next();
    return;
  }
  const p = req.path;
  if (p === "/api/health" || p.startsWith("/api/auth") || p.startsWith("/api/bench")) {
    next();
    return;
  }
  authenticateJwt(req, res, next);
}
