import { AppDataSource } from "../../data-source.js";
import { runBenchmarkStrategiesSequential } from "../../infrastructure/benchmark/benchmark.runner.js";
import type { BenchmarkStrategy } from "../../infrastructure/benchmark/strategy.interface.js";
import type { BenchmarkStrategyResult } from "../../infrastructure/benchmark/types.js";
import { BENCH_GLOBAL_OPTIMIZATIONS } from "./bench.catalog.js";
import type { BenchApproach } from "./bench.catalog.js";
import { compileEntityQuery } from "./compile-entity-query.js";
import type { ExecuteSlotBody } from "./bench.schemas.js";

function supportsTypeorm(body: ExecuteSlotBody): boolean {
  return body.conditions.every((c) => c.kind === "column");
}

function validateOptimizations(approach: BenchApproach, optimizationIds: string[]): string | null {
  const validIds = new Set(BENCH_GLOBAL_OPTIMIZATIONS.map((o) => o.id));
  for (const id of optimizationIds) {
    if (!validIds.has(id)) return `Unknown optimization: ${id}`;
    const opt = BENCH_GLOBAL_OPTIMIZATIONS.find((o) => o.id === id);
    if (opt && !opt.approaches.includes(approach)) {
      return `Optimization "${id}" is not available for approach "${approach}"`;
    }
  }
  return null;
}

function strategyName(body: ExecuteSlotBody): string {
  const tag = [...body.optimizationIds].sort().join("+") || "none";
  const condTag = body.conditions.length
    ? `conds=${body.conditions.length}:${body.combinator}`
    : "conds=0";
  const cols = [...body.selectColumns].sort().join("+");
  const limTag = body.limit != null ? String(body.limit) : "all";
  return `${body.entityId}:${body.approach}:${tag}|${condTag}|sel=${cols}|lim=${limTag}`;
}

function buildStrategy(body: ExecuteSlotBody): { error: string } | { strategy: BenchmarkStrategy<unknown> } {
  if (body.approach === "typeorm" && !supportsTypeorm(body)) {
    return { error: "TypeORM is only available for basic column conditions. Use Raw SQL for advanced filters." };
  }
  const optErr = validateOptimizations(body.approach, body.optimizationIds);
  if (optErr) return { error: optErr };

  const compiled = compileEntityQuery(body);
  if ("error" in compiled) return { error: compiled.error };

  const name = strategyName(body);

  if (body.approach === "typeorm") {
    return {
      strategy: {
        name,
        async execute({ queryRunner }) {
          return compiled.runTypeorm(queryRunner);
        },
      },
    };
  }

  return {
    strategy: {
      name,
      async execute({ queryRunner }) {
        return compiled.runRaw(queryRunner);
      },
    },
  };
}

export async function executeSlot(
  body: ExecuteSlotBody,
  requestId?: string
): Promise<{ ok: true; result: BenchmarkStrategyResult<unknown> } | { ok: false; error: string }> {
  const built = buildStrategy(body);
  if ("error" in built) return { ok: false, error: built.error };

  const rows = await runBenchmarkStrategiesSequential(AppDataSource, [built.strategy], {
    requestId,
  });
  const result = rows[0];
  if (!result) return { ok: false, error: "No benchmark row returned" };
  return { ok: true, result };
}
