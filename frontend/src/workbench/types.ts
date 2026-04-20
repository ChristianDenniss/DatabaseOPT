export type BenchApproach = "typeorm" | "raw_sql";

export type ColumnKind = "string" | "number" | "bigint" | "timestamp" | "enum";

export type FilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "starts_with"
  | "in";

export type CatalogColumn = {
  id: string;
  property: string;
  label: string;
  kind: ColumnKind;
  filterable: boolean;
  defaultSelected?: boolean;
};

export type CatalogEntity = {
  id: string;
  label: string;
  description: string;
  table: string;
  columns: CatalogColumn[];
};

export type CatalogOptimization = {
  id: string;
  label: string;
  approaches: BenchApproach[];
};

export type WorkbenchCatalog = {
  entities: CatalogEntity[];
  optimizations: CatalogOptimization[];
  filterOpsByKind: Record<ColumnKind, FilterOp[]>;
};

export type SlotApiResult = {
  strategy: string;
  executionTimeMs: number | null;
  payloadSizeBytes: number;
  rowCount: number;
  result: unknown;
  error: string | null;
};

export type ComparisonBox = {
  id: string;
  approach: BenchApproach | null;
  optimizationIds: string[];
};

export type FilterConditionRow = {
  id: string;
  kind: "column" | "user_posts_count_window" | "user_posts_contains_window";
  column: string;
  op: FilterOp;
  valueMode: "literal" | "column_ref";
  value: string;
  refColumn: string;
  windowFrom: string;
  windowTo: string;
  minCount: string;
  maxCount: string;
  keyword: string;
};
