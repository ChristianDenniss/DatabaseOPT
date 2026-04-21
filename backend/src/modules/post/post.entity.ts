import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { PostVisibility } from "./post-visibility.enum.js";

@Entity({ name: "posts" })
export class Post {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ name: "author_id", type: "bigint" })
  authorId!: string;

  @Column({ type: "text" })
  body!: string;

  /** Generated in DB for FTS benchmarks; not inserted/updated by the app. */
  @Column({ name: "search_vector", type: "tsvector", insert: false, update: false })
  searchVector?: string;

  @Column({ name: "repost_of_post_id", type: "bigint", nullable: true })
  repostOfPostId!: string | null;

  @Column({
    type: "enum",
    enum: PostVisibility,
    enumName: "post_visibility",
    default: PostVisibility.Public,
  })
  visibility!: PostVisibility;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt!: Date;
}
