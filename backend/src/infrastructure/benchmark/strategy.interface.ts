import type { QueryRunner } from "typeorm";

/** Passed to each strategy so it uses this connection only (no shared session with other strategies). */
export type StrategyExecutionContext = {
  queryRunner: QueryRunner;
};

/**
 * One execution path (e.g. ORM vs raw). Must not contain timing or serialization logic.
 * Use `ctx.queryRunner.manager` or `ctx.queryRunner.query()` only — not the global DataSource manager.
 */
export type BenchmarkStrategy<T> = {
  readonly name: string;
  execute(ctx: StrategyExecutionContext): Promise<T>;
};
