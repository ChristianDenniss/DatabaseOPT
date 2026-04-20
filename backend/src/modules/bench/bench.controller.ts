import type { Request, Response } from "express";
import { getColumnSampleValues } from "./bench.column-samples.js";
import { executeSlotBodySchema } from "./bench.schemas.js";
import { executeSlot } from "./bench.service.js";
import { BENCH_ENTITIES, BENCH_GLOBAL_OPTIMIZATIONS, FILTER_OPS_BY_KIND } from "./bench.catalog.js";

export function getCatalog(_req: Request, res: Response): void {
  res.json({
    entities: BENCH_ENTITIES,
    optimizations: BENCH_GLOBAL_OPTIMIZATIONS,
    filterOpsByKind: FILTER_OPS_BY_KIND,
  });
}

export async function getColumnSamples(req: Request, res: Response): Promise<void> {
  const entityId = String(req.query.entityId ?? "").trim();
  const columnId = String(req.query.columnId ?? "").trim();
  if (!entityId || !columnId) {
    res.status(400).json({ error: "Query params entityId and columnId are required" });
    return;
  }
  const out = await getColumnSampleValues(entityId, columnId);
  if (!out.ok) {
    res.status(400).json({ error: out.error });
    return;
  }
  res.json({ values: out.values });
}

export async function postExecuteSlot(req: Request, res: Response): Promise<void> {
  const parsed = executeSlotBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const out = await executeSlot(parsed.data, req.requestId);
  if (!out.ok) {
    res.status(400).json({ error: out.error });
    return;
  }
  res.json(out.result);
}
