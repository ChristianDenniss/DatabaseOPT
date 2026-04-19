import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "user_follows" })
export class UserFollow {
  @PrimaryColumn({ name: "follower_id", type: "bigint" })
  followerId!: string;

  @PrimaryColumn({ name: "following_id", type: "bigint" })
  followingId!: string;

  @Column({ name: "created_at", type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;
}
