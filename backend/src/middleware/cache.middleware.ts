import type { NextFunction, Request, Response } from "express";
import { getRedis, isRedisConfigured } from "../lib/redis.js";

function cacheKey(req: Request): string {
  return `http:get:${req.originalUrl}`;
}

function shouldSkipCache(req: Request): boolean {
  if (req.method !== "GET") return true;
  if (req.get("cache-control")?.includes("no-cache")) return true;
  const p = req.path;
  if (p === "/api/health") return true;
  if (p.startsWith("/api/auth")) return true;
  return false;
}

function ttlSeconds(): number {
  const n = parseInt(process.env.REDIS_CACHE_TTL_SECONDS ?? "60", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 3600) : 60;
}

/**
 * Caches JSON responses for GET requests when Redis is available.
 * Only works for handlers that use `res.json()` (intercepts `res.json`).
 */
export function createCacheMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!isRedisConfigured() || shouldSkipCache(req)) {
      next();
      return;
    }

    const redis = await getRedis();
    if (!redis) {
      next();
      return;
    }

    const key = cacheKey(req);
    try {
      const hit = await redis.get(key);
      if (hit != null) {
        res.setHeader("x-cache", "HIT");
        res.type("application/json");
        res.send(hit);
        return;
      }
    } catch (e) {
      console.error("[cache] get", e);
    }

    const originalJson = res.json.bind(res);
    res.json = function jsonWithCache(body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        res.setHeader("x-cache", "MISS");
        try {
          void redis.setEx(key, ttlSeconds(), JSON.stringify(body));
        } catch (e) {
          console.error("[cache] set", e);
        }
      }
      return originalJson(body);
    };

    next();
  };
}
