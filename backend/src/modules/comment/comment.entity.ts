import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "comments" })
export class Comment {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ name: "post_id", type: "bigint" })
  postId!: string;

  @Column({ name: "author_id", type: "bigint" })
  authorId!: string;

  @Column({ name: "parent_comment_id", type: "bigint", nullable: true })
  parentCommentId!: string | null;

  @Column({ type: "text" })
  body!: string;

  /** Generated in DB for FTS benchmarks; not inserted/updated by the app. */
  @Column({ name: "search_vector", type: "tsvector", insert: false, update: false })
  searchVector?: string;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt!: Date;
}
