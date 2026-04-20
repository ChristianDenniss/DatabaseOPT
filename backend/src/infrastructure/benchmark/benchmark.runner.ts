import type { DataSource } from "typeorm";
import type { BenchmarkStrategy } from "./strategy.interface.js";
import type { BenchmarkStrategyResult, RunBenchmarksOptions } from "./types.js";

function defaultRowCount<T>(result: T): number {
  if (result == null) return 0;
  if (Array.isArray(result)) return result.length;
  return 1;
}

function defaultPayloadBytes<T>(result: T): number {
  try {
    return Buffer.byteLength(JSON.stringify(result), "utf8");
  } catch {
    return 0;
  }
}

function logBenchmarkIsolation(requestId: string | undefined): void {
  const rid = requestId ?? "-";
  console.log(
    `[benchmark][${rid}] isolation=dedicated_pooled_connection_per_strategy ` +
      "execution_order=sequential " +
      "rationale=avoid_session_state_and_prepared_statement_carryover_between_strategies"
  );
  console.log(
    `[benchmark][${rid}] isolation_limitation=postgresql_shared_buffers_and_os_page_cache ` +
      "remain_instance_wide; strategies_do_not_share_a_db_session"
  );
}

/**
 * Runs strategies one after another. Each strategy gets its own `QueryRunner` (own pooled
 * connection), connected immediately before `execute` and released in `finally`, so later
 * strategies do not reuse the earlier strategy's session.
 */
export async function runBenchmarkStrategiesSequential<T>(
  dataSource: DataSource,
  strategies: BenchmarkStrategy<T>[],
  options: RunBenchmarksOptions<T> = {}
): Promise<BenchmarkStrategyResult<T>[]> {
  logBenchmarkIsolation(options.requestId);

  const rowCountFn = options.rowCount ?? defaultRowCount;
  const payloadFn = options.payloadSizeBytes ?? defaultPayloadBytes;

  const out: BenchmarkStrategyResult<T>[] = [];

  for (const strategy of strategies) {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    const started = performance.now();
    try {
      const result = await strategy.execute({ queryRunner });
      const executionTimeMs = Math.round((performance.now() - started) * 100) / 100;
      out.push({
        strategy: strategy.name,
        executionTimeMs,
        payloadSizeBytes: payloadFn(result),
        rowCount: rowCountFn(result),
        result,
        error: null,
      });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      out.push({
        strategy: strategy.name,
        executionTimeMs: null,
        payloadSizeBytes: 0,
        rowCount: 0,
        result: null,
        error: msg,
      });
    } finally {
      await queryRunner.release();
    }
  }

  return out;
}
