import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "post_likes" })
export class PostLike {
  @PrimaryColumn({ name: "user_id", type: "bigint" })
  userId!: string;

  @PrimaryColumn({ name: "post_id", type: "bigint" })
  postId!: string;

  @Column({ name: "created_at", type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;
}
