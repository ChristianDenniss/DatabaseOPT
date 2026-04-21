import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "users" })
export class User {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "varchar", length: 50 })
  username!: string;

  @Column({ type: "varchar", length: 255 })
  email!: string;

  @Column({ name: "display_name", type: "varchar", length: 100 })
  displayName!: string;

  @Column({ type: "text", nullable: true })
  bio!: string | null;

  /** Generated in DB for FTS benchmarks; not inserted/updated by the app. */
  @Column({ name: "search_vector", type: "tsvector", insert: false, update: false })
  searchVector?: string;

  @Column({ name: "avatar_url", type: "varchar", length: 512, nullable: true })
  avatarUrl!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt!: Date;
}
