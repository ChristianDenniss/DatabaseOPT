import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Extra PostgreSQL indexes for the query workbench: GiST (tsvector), pg_trgm GIN,
 * hash PK, partial btree, and covering btree (INCLUDE).
 */
export class BenchIndexTypes1740800000000 implements MigrationInterface {
  name = "BenchIndexTypes1740800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_body_trgm ON posts USING gin (body gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_comments_body_trgm ON comments USING gin (body gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_bio_trgm ON users USING gin (bio gin_trgm_ops)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_search_vector_gist ON posts USING gist (search_vector)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_comments_search_vector_gist ON comments USING gist (search_vector)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_search_vector_gist ON users USING gist (search_vector)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_id_hash ON posts USING hash (id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_id_hash ON users USING hash (id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_public_created_at
      ON posts (created_at DESC)
      WHERE visibility = 'public'::post_visibility
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_author_covering
      ON posts (author_id) INCLUDE (body, visibility, created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_posts_author_covering`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_posts_public_created_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_id_hash`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_posts_id_hash`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_search_vector_gist`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_comments_search_vector_gist`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_posts_search_vector_gist`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_bio_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_comments_body_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_posts_body_trgm`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS pg_trgm`);
  }
}
