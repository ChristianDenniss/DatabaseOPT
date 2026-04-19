import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType | null> | null = null;

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

/**
 * Singleton Redis client. Returns null when REDIS_URL is unset (cache middleware skips).
 */
export async function getRedis(): Promise<RedisClientType | null> {
  if (!isRedisConfigured()) return null;
  if (client?.isOpen) return client;
  if (!connectPromise) {
    connectPromise = (async () => {
      const url = process.env.REDIS_URL!.trim();
      const c = createClient({ url });
      c.on("error", (err) => console.error("[redis]", err));
      await c.connect();
      client = c as RedisClientType;
      return client;
    })();
  }
  return connectPromise;
}
