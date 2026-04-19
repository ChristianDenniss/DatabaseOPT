import cors from "cors";
import express, { type Express } from "express";
import { createCacheMiddleware } from "./cache.middleware.js";
import { loggingMiddleware } from "./logging.middleware.js";
import { requestIdMiddleware } from "./request-id.middleware.js";
import { isRedisConfigured } from "../lib/redis.js";

/**
 * Named middleware stack. Add new cross-cutting middleware here, then wire it in `applyGlobalMiddleware`.
 */
export const globalMiddleware = {
  requestId: requestIdMiddleware,
  logging: loggingMiddleware,
  cors: cors({ origin: true }),
  json: express.json({ limit: "512kb" }),
  /** Redis-backed response cache for GET + `res.json` (no-op if REDIS_URL unset). */
  cache: createCacheMiddleware(),
} as const;

export function applyGlobalMiddleware(app: Express): void {
  app.use(globalMiddleware.requestId);
  app.use(globalMiddleware.logging);
  app.use(globalMiddleware.cors);
  app.use(globalMiddleware.json);
  if (isRedisConfigured()) {
    app.use(globalMiddleware.cache);
  }
}
