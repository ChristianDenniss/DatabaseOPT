import "reflect-metadata";
import dotenv from "dotenv";
import express from "express";
import { AppDataSource } from "./data-source.js";
import { getRedis, isRedisConfigured } from "./lib/redis.js";
import { applyGlobalMiddleware } from "./middleware/global.middleware.js";
import { conditionalGlobalAuth } from "./middleware/auth.middleware.js";
import authRoutes from "./modules/auth/auth.routes.js";
import commentRoutes from "./modules/comment/comment.routes.js";
import followRoutes from "./modules/follow/follow.routes.js";
import likesRoutes from "./modules/likes/likes.routes.js";
import postRoutes from "./modules/post/post.routes.js";
import userRoutes from "./modules/user/user.routes.js";
import benchRoutes from "./modules/bench/bench.routes.js";

dotenv.config();

const PORT = Number(process.env.PORT ?? 4000);

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();

  if (isRedisConfigured()) {
    await getRedis();
    console.log("[redis] connected");
  }

  const app = express();
  applyGlobalMiddleware(app);

  app.get("/api/health", async (_req, res) => {
    let ok = true;
    const body: Record<string, unknown> = {};

    try {
      await AppDataSource.query("SELECT 1");
      body.db = "up";
    } catch (e) {
      ok = false;
      body.db = "down";
      body.dbError = String((e as Error)?.message ?? e);
    }

    res.status(ok ? 200 : 503).json({ ok, ...body });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/bench", benchRoutes);
  app.use(conditionalGlobalAuth);

  app.use("/api/users", userRoutes);
  app.use("/api/posts", postRoutes);
  app.use("/api/likes", likesRoutes);
  app.use("/api/follows", followRoutes);
  app.use("/api/comments", commentRoutes);

  const server = app.listen(PORT, () => {
    console.log(`API http://localhost:${PORT}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[api] Port ${PORT} is already in use. Stop the other process or set PORT in .env.\n` +
          `  From backend/: npm run kill:port\n` +
          `  Or (Windows): netstat -ano | findstr :${PORT}   then  taskkill /PID <pid> /F`
      );
      process.exit(1);
    }
    console.error("[api] HTTP server error:", err);
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
