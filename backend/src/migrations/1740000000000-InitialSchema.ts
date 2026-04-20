import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MigrationInterface, QueryRunner } from "typeorm";

const __dirname = dirname(fileURLToPath(import.meta.url));

function schemaSqlPath(): string {
  return join(__dirname, "..", "..", "docker", "postgres-init", "01-schema.sql");
}

export class InitialSchema1740000000000 implements MigrationInterface {
  name = "InitialSchema1740000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sql = readFileSync(schemaSqlPath(), "utf8");
    await queryRunner.query(sql);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const drops = [
      "DROP TABLE IF EXISTS notifications CASCADE",
      "DROP TABLE IF EXISTS messages CASCADE",
      "DROP TABLE IF EXISTS conversation_members CASCADE",
      "DROP TABLE IF EXISTS conversations CASCADE",
      "DROP TABLE IF EXISTS user_saved_posts CASCADE",
      "DROP TABLE IF EXISTS post_hashtags CASCADE",
      "DROP TABLE IF EXISTS hashtags CASCADE",
      "DROP TABLE IF EXISTS comment_likes CASCADE",
      "DROP TABLE IF EXISTS post_likes CASCADE",
      "DROP TABLE IF EXISTS comments CASCADE",
      "DROP TABLE IF EXISTS posts CASCADE",
      "DROP TABLE IF EXISTS user_follows CASCADE",
      "DROP TABLE IF EXISTS users CASCADE",
      "DROP FUNCTION IF EXISTS trigger_set_updated_at() CASCADE",
      "DROP TYPE IF EXISTS notification_type CASCADE",
      "DROP TYPE IF EXISTS post_visibility CASCADE",
    ];
    for (const stmt of drops) {
      await queryRunner.query(stmt);
    }
  }
}
