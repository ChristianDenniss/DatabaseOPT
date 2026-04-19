import dotenv from "dotenv";
import { DataSource } from "typeorm";
import { Comment } from "./modules/comment/comment.entity.js";
import { UserFollow } from "./modules/follow/user-follow.entity.js";
import { PostLike } from "./modules/likes/post-like.entity.js";
import { Post } from "./modules/post/post.entity.js";
import { User } from "./modules/user/user.entity.js";

dotenv.config();

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.PG_HOST ?? "127.0.0.1",
  port: parseInt(process.env.PG_PORT ?? "5432", 10),
  username: process.env.PG_USER ?? "bench",
  password: process.env.PG_PASSWORD ?? "benchdev",
  database: process.env.PG_DATABASE ?? "socialbench",
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === "1",
  entities: [User, UserFollow, Post, PostLike, Comment],
  extra: {
    max: 10,
  },
});
