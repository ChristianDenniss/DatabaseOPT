import type { BenchApproach, CatalogEntity, FilterConditionRow, WorkbenchCatalog } from "./types";

/** Optimizations that change literal `contains` on indexed text (body / bio). */
export const TEXT_SEARCH_OPTIMIZATION_IDS = new Set<string>([
  "fts_runtime",
  "fts_stored_scan",
  "fts_gin",
  "fts_gist",
  "trgm_gin",
]);

const RANGE_OPS = new Set(["gt", "gte", "lt", "lte"]);

function columnRow(
  row: FilterConditionRow
): { column: string; op: string; valueMode: string; value: string } | null {
  if (row.kind !== "column") return null;
  return { column: row.column, op: row.op, valueMode: row.valueMode, value: row.value };
}

export function queryHasApplicableTextSearch(
  entity: CatalogEntity,
  isRowComplete: (row: FilterConditionRow) => boolean,
  conditions: FilterConditionRow[]
): boolean {
  const textCols =
    entity.id === "posts" || entity.id === "comments"
      ? (["body"] as const)
      : entity.id === "users"
        ? (["bio"] as const)
        : ([] as const);
  if (textCols.length === 0) return false;
  return conditions.some((row) => {
    const c = columnRow(row);
    if (!c || c.op !== "contains" || c.valueMode !== "literal") return false;
    if (!textCols.includes(c.column as "body" | "bio")) return false;
    return isRowComplete(row);
  });
}

function hasCompleteIdEq(
  entity: CatalogEntity,
  isRowComplete: (row: FilterConditionRow) => boolean,
  conditions: FilterConditionRow[]
): boolean {
  if (entity.id !== "posts" && entity.id !== "users") return false;
  return conditions.some((row) => {
    const c = columnRow(row);
    if (!c || c.column !== "id" || c.op !== "eq" || c.valueMode !== "literal") return false;
    return isRowComplete(row) && /^\d+$/.test(c.value.trim());
  });
}

function hasCompleteCreatedAtRange(
  entity: CatalogEntity,
  isRowComplete: (row: FilterConditionRow) => boolean,
  conditions: FilterConditionRow[]
): boolean {
  return conditions.some((row) => {
    const c = columnRow(row);
    if (!c || c.column !== "created_at" || !RANGE_OPS.has(c.op) || c.valueMode !== "literal") return false;
    return isRowComplete(row);
  });
}

function hasCompleteAuthorIdEq(
  entity: CatalogEntity,
  isRowComplete: (row: FilterConditionRow) => boolean,
  conditions: FilterConditionRow[]
): boolean {
  if (entity.id !== "posts") return false;
  return conditions.some((row) => {
    const c = columnRow(row);
    if (!c || c.column !== "author_id" || c.op !== "eq" || c.valueMode !== "literal") return false;
    return isRowComplete(row) && /^\d+$/.test(c.value.trim());
  });
}

function hasCompleteVisibilityPublic(
  entity: CatalogEntity,
  isRowComplete: (row: FilterConditionRow) => boolean,
  conditions: FilterConditionRow[]
): boolean {
  if (entity.id !== "posts") return false;
  return conditions.some((row) => {
    const c = columnRow(row);
    if (!c || c.column !== "visibility" || c.op !== "eq" || c.valueMode !== "literal") return false;
    return isRowComplete(row) && c.value.trim() === "public";
  });
}

const POST_COVERING_SELECT = new Set(["id", "author_id", "body", "visibility", "created_at"]);

function coveringAuthorWorkload(
  entity: CatalogEntity,
  isRowComplete: (row: FilterConditionRow) => boolean,
  conditions: FilterConditionRow[],
  selectColumns: string[]
): boolean {
  if (entity.id !== "posts") return false;
  if (!hasCompleteAuthorIdEq(entity, isRowComplete, conditions)) return false;
  if (selectColumns.length === 0) return false;
  return selectColumns.every((id) => POST_COVERING_SELECT.has(id));
}

/**
 * Optimization ids that make sense for the current filters, entity, and projection.
 * Always includes `baseline` when present in the catalog.
 */
export function getApplicableOptimizationIds(
  catalog: WorkbenchCatalog,
  entity: CatalogEntity,
  conditions: FilterConditionRow[],
  selectColumns: string[],
  isRowComplete: (row: FilterConditionRow) => boolean
): Set<string> {
  const ids = new Set<string>();
  for (const o of catalog.optimizations) {
    ids.add(o.id);
  }

  const textContains = queryHasApplicableTextSearch(entity, isRowComplete, conditions);
  for (const id of TEXT_SEARCH_OPTIMIZATION_IDS) {
    if (!textContains) ids.delete(id);
  }

  if (!hasCompleteIdEq(entity, isRowComplete, conditions)) {
    ids.delete("hash_pk");
  }

  if (
    entity.id !== "posts" ||
    !hasCompleteAuthorIdEq(entity, isRowComplete, conditions) ||
    !hasCompleteCreatedAtRange(entity, isRowComplete, conditions)
  ) {
    ids.delete("composite_author_time");
  }

  if (
    entity.id !== "posts" ||
    !hasCompleteVisibilityPublic(entity, isRowComplete, conditions) ||
    !hasCompleteCreatedAtRange(entity, isRowComplete, conditions)
  ) {
    ids.delete("partial_public_posts");
  }

  if (!coveringAuthorWorkload(entity, isRowComplete, conditions, selectColumns)) {
    ids.delete("covering_author_posts");
  }

  return ids;
}

export function optimizationsForSlot(
  catalog: WorkbenchCatalog | null,
  approach: BenchApproach | null,
  entity: CatalogEntity | null,
  conditions: FilterConditionRow[],
  selectColumns: string[],
  isRowComplete: (row: FilterConditionRow) => boolean
): { id: string; label: string; approaches: BenchApproach[] }[] {
  if (!catalog || !approach || !entity) return [];
  const base = catalog.optimizations.filter((o) => o.approaches.includes(approach));
  const allowed = getApplicableOptimizationIds(catalog, entity, conditions, selectColumns, isRowComplete);
  return base.filter((o) => allowed.has(o.id));
}
