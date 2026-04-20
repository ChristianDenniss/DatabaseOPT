import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds stored tsvector + GIN for full-text search benchmarks on post and comment bodies.
 */
export class PostCommentSearchVector1740600000000 implements MigrationInterface {
  name = "PostCommentSearchVector1740600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE posts
      ADD COLUMN IF NOT EXISTS search_vector tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_search_vector ON posts USING gin (search_vector)
    `);
    await queryRunner.query(`
      ALTER TABLE comments
      ADD COLUMN IF NOT EXISTS search_vector tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_comments_search_vector ON comments USING gin (search_vector)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_comments_search_vector`);
    await queryRunner.query(`ALTER TABLE comments DROP COLUMN IF EXISTS search_vector`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_posts_search_vector`);
    await queryRunner.query(`ALTER TABLE posts DROP COLUMN IF EXISTS search_vector`);
  }
}
