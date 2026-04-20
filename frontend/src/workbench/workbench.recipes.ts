import type { BenchApproach, ComparisonBox, FilterConditionRow, WorkbenchCatalog } from "./types";

export type RecipeId =
  | "lookup_pk"
  | "range_composite"
  | "partial_public"
  | "covering_author"
  | "search_ilike_fts"
  | "search_ilike_trgm"
  | "search_runtime_vs_gin"
  | "search_stored_scan_vs_gin"
  | "search_gist_vs_gin";

export type RecipeApplyResult = {
  entityId: string;
  combinator: "and";
  conditions: FilterConditionRow[];
  selectColumns: string[];
  limitStr: string;
  orderColumn: string;
  orderDir: "ASC" | "DESC";
  boxes: ComparisonBox[];
};

function box(genId: () => string, approach: BenchApproach, optimizationIds: string[]): ComparisonBox {
  return { id: genId(), approach, optimizationIds };
}

function colRow(
  genId: () => string,
  column: string,
  op: FilterConditionRow["op"],
  valueMode: FilterConditionRow["valueMode"],
  value: string,
  refColumn = ""
): FilterConditionRow {
  return {
    id: genId(),
    kind: "column",
    column,
    op,
    valueMode,
    value,
    refColumn,
    windowFrom: "",
    windowTo: "",
    minCount: "",
    maxCount: "",
    keyword: "",
  };
}

/** One-click presets: filters, columns, and two comparison slots. */
export function applyRecipe(recipeId: RecipeId, _catalog: WorkbenchCatalog, genId: () => string): RecipeApplyResult {
  switch (recipeId) {
    case "lookup_pk":
      return {
        entityId: "posts",
        combinator: "and",
        conditions: [colRow(genId, "id", "eq", "literal", "1")],
        selectColumns: ["id", "author_id", "body", "visibility", "created_at"],
        limitStr: "",
        orderColumn: "",
        orderDir: "DESC",
        boxes: [
          box(genId, "typeorm", ["baseline"]),
          box(genId, "typeorm", ["baseline", "hash_pk"]),
        ],
      };
    case "range_composite":
      return {
        entityId: "posts",
        combinator: "and",
        conditions: [
          colRow(genId, "author_id", "eq", "literal", "1"),
          colRow(genId, "created_at", "gte", "literal", "2024-01-01T00:00"),
        ],
        selectColumns: ["id", "author_id", "body", "visibility", "created_at"],
        limitStr: "",
        orderColumn: "created_at",
        orderDir: "DESC",
        boxes: [
          box(genId, "typeorm", ["baseline"]),
          box(genId, "typeorm", ["baseline", "composite_author_time"]),
        ],
      };
    case "partial_public":
      return {
        entityId: "posts",
        combinator: "and",
        conditions: [
          colRow(genId, "visibility", "eq", "literal", "public"),
          colRow(genId, "created_at", "gte", "literal", "2024-01-01T00:00"),
        ],
        selectColumns: ["id", "author_id", "body", "visibility", "created_at"],
        limitStr: "",
        orderColumn: "created_at",
        orderDir: "DESC",
        boxes: [
          box(genId, "typeorm", ["baseline"]),
          box(genId, "typeorm", ["baseline", "partial_public_posts"]),
        ],
      };
    case "covering_author":
      return {
        entityId: "posts",
        combinator: "and",
        conditions: [colRow(genId, "author_id", "eq", "literal", "1")],
        selectColumns: ["id", "author_id"],
        limitStr: "",
        orderColumn: "",
        orderDir: "DESC",
        boxes: [
          box(genId, "typeorm", ["baseline"]),
          box(genId, "typeorm", ["baseline", "covering_author_posts"]),
        ],
      };
    case "search_ilike_fts":
      return {
        entityId: "posts",
        combinator: "and",
        conditions: [colRow(genId, "body", "contains", "literal", "bench")],
        selectColumns: ["id", "author_id", "body", "visibility", "created_at"],
        limitStr: "",
        orderColumn: "",
        orderDir: "DESC",
        boxes: [
          box(genId, "typeorm", ["baseline"]),
          box(genId, "typeorm", ["fts_gin"]),
        ],
      };
    case "search_ilike_trgm":
      return {
        entityId: "posts",
        combinator: "and",
        conditions: [colRow(genId, "body", "contains", "literal", "bench")],
        selectColumns: ["id", "author_id", "body", "visibility", "created_at"],
        limitStr: "",
        orderColumn: "",
        orderDir: "DESC",
        boxes: [
          box(genId, "typeorm", ["baseline"]),
          box(genId, "typeorm", ["trgm_gin"]),
        ],
      };
    case "search_runtime_vs_gin":
      return {
        entityId: "posts",
        combinator: "and",
        conditions: [colRow(genId, "body", "contains", "literal", "bench")],
        selectColumns: ["id", "author_id", "body", "visibility", "created_at"],
        limitStr: "",
        orderColumn: "",
        orderDir: "DESC",
        boxes: [
          box(genId, "typeorm", ["fts_runtime"]),
          box(genId, "typeorm", ["fts_gin"]),
        ],
      };
    case "search_stored_scan_vs_gin":
      return {
        entityId: "posts",
        combinator: "and",
        conditions: [colRow(genId, "body", "contains", "literal", "bench")],
        selectColumns: ["id", "author_id", "body", "visibility", "created_at"],
        limitStr: "",
        orderColumn: "",
        orderDir: "DESC",
        boxes: [
          box(genId, "raw_sql", ["fts_stored_scan"]),
          box(genId, "raw_sql", ["fts_gin"]),
        ],
      };
    case "search_gist_vs_gin":
      return {
        entityId: "posts",
        combinator: "and",
        conditions: [colRow(genId, "body", "contains", "literal", "bench")],
        selectColumns: ["id", "author_id", "body", "visibility", "created_at"],
        limitStr: "",
        orderColumn: "",
        orderDir: "DESC",
        boxes: [
          box(genId, "typeorm", ["fts_gist"]),
          box(genId, "typeorm", ["fts_gin"]),
        ],
      };
  }
}

export const RECIPE_ORDER: RecipeId[] = [
  "lookup_pk",
  "range_composite",
  "partial_public",
  "covering_author",
  "search_ilike_fts",
  "search_ilike_trgm",
  "search_runtime_vs_gin",
  "search_stored_scan_vs_gin",
  "search_gist_vs_gin",
];
