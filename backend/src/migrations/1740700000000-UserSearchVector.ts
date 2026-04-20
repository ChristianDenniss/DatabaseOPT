import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds stored tsvector + GIN on users.bio for full-text search benchmarks.
 */
export class UserSearchVector1740700000000 implements MigrationInterface {
  name = "UserSearchVector1740700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS search_vector tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(bio, ''))) STORED
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_search_vector ON users USING gin (search_vector)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_search_vector`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS search_vector`);
  }
}
