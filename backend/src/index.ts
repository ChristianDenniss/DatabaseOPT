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
    try {
      await AppDataSource.query("SELECT 1");
      res.json({ ok: true, db: "up" });
    } catch (e) {
      res.status(503).json({ ok: false, error: String((e as Error)?.message ?? e) });
    }
  });

  app.use("/api/auth", authRoutes);
  app.use(conditionalGlobalAuth);

  app.use("/api/users", userRoutes);
  app.use("/api/posts", postRoutes);
  app.use("/api/likes", likesRoutes);
  app.use("/api/follows", followRoutes);
  app.use("/api/comments", commentRoutes);

  app.listen(PORT, () => {
    console.log(`API http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
