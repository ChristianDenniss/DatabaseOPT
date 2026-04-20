import dns from "node:dns";
import dotenv from "dotenv";
import { DataSource } from "typeorm";
import { InitialSchema1740000000000 } from "./migrations/1740000000000-InitialSchema.js";
import { PostCommentSearchVector1740600000000 } from "./migrations/1740600000000-PostCommentSearchVector.js";
import { UserSearchVector1740700000000 } from "./migrations/1740700000000-UserSearchVector.js";
import { Comment } from "./modules/comment/comment.entity.js";
import { UserFollow } from "./modules/follow/user-follow.entity.js";
import { PostLike } from "./modules/likes/post-like.entity.js";
import { Post } from "./modules/post/post.entity.js";
import { User } from "./modules/user/user.entity.js";

dotenv.config();

/** Prefer IPv4 when resolving DB host (avoids broken IPv6 on some Windows networks). */
dns.setDefaultResultOrder("ipv4first");

function loopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h.endsWith(".localhost");
}

/**
 * TLS when PG_SSL=require|1|true; off on loopback unless forced.
 * PG_SSL_REJECT_UNAUTHORIZED=0 disables cert verification (e.g. corporate TLS inspection).
 */
function resolveSsl(host: string): boolean | { rejectUnauthorized: boolean } {
  const mode = (process.env.PG_SSL ?? "").toLowerCase();
  if (mode === "0" || mode === "false" || mode === "off") {
    return false;
  }
  if (mode === "1" || mode === "true" || mode === "require") {
    return { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "0" };
  }
  if (loopbackHost(host)) {
    return false;
  }
  return { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "0" };
}

const pgHost = (process.env.PG_HOST ?? "").trim() || "127.0.0.1";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: pgHost,
  port: parseInt(process.env.PG_PORT ?? "5432", 10),
  username: process.env.PG_USER ?? "postgres",
  password: process.env.PG_PASSWORD ?? "",
  database: process.env.PG_DATABASE ?? "postgres",
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === "1",
  entities: [User, UserFollow, Post, PostLike, Comment],
  migrations: [InitialSchema1740000000000, PostCommentSearchVector1740600000000, UserSearchVector1740700000000],
  migrationsTableName: "typeorm_migrations",
  extra: {
    max: 10,
  },
  ssl: resolveSsl(pgHost),
});

export default AppDataSource;
