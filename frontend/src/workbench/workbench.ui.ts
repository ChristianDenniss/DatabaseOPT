import type { BenchApproach, FilterOp, SlotApiResult } from "./types";

/**
 * Presentation-only config: reorder `summaryColumns` or edit labels without touching layout logic.
 * Filter operators stay data-driven from the API catalog; labels map here for readability.
 */
export const workbenchUi = {
  copy: {
    title: "Query comparison workbench",
    intro:
      "Choose filters and columns, then run two or more slots with different engines. Timed results appear in the table below once a comparison finishes.",
    stepEntity: "Dataset",
    stepColumns: "Columns",
    stepFilters: "Filters",
    stepSort: "Limit and sort",
    stepSlots: "Slots",
    columnsHint: "Returned fields for each row.",
    filtersHeading: "Filters",
    filtersHint:
      "Conditions combine with AND or OR. Each value can be a literal or another column of the same type.",
    combineLabel: "Combine with",
    combineAnd: "Match all (AND)",
    combineOr: "Match any (OR)",
    addFilter: "Add condition",
    addAdvancedFilter: "Add advanced condition",
    removeFilter: "Remove",
    conditionType: "Condition type",
    conditionTypes: {
      column: "Column comparison",
      user_posts_count_window: "User posts count in time window",
      user_posts_contains_window: "User posts with text in time window",
    },
    windowFrom: "From (timestamp)",
    windowTo: "To (timestamp)",
    minCount: "Minimum posts",
    maxCount: "Maximum posts",
    keyword: "Contains text",
    keywordPlaceholder: "e.g. good",
    limitSortHeading: "Limit and sort",
    rowLimit: "Row limit",
    rowLimitPlaceholder: "No limit",
    orderBy: "Sort by",
    orderDefault: "Default",
    orderDirection: "Direction",
    slotsHeading: "Execution slots",
    addSlot: "Add slot",
    slotsHint:
      "Use the Add slot button below, then pick an engine and one or more options per slot. You need at least two slots to run.",
    slotTitle: (n: number) => `Slot ${n}`,
    removeSlot: "Remove",
    executionLabel: "Engine",
    optimizationsLabel: "Options",
    pickEngineFirst: "Choose an engine to see options.",
    rawSqlOnlyHint: "This query uses advanced filters, so only Raw SQL is available.",
    ftsOptionsHint:
      "Full-text and substring index options appear when at least one filter is a completed string “contains” with a literal value (where ILIKE vs tsvector vs pg_trgm differs).",
    recipesHeading: "Comparison recipes",
    recipesHint:
      "Each recipe fills filters, columns, and two execution slots. Only index options that match your current query are listed under each slot.",
    recipeCards: {
      lookup_pk: {
        title: "Lookup: B-tree vs hash (PK)",
        description: "Posts with id = 1; slot A baseline, slot B baseline + hash_pk.",
      },
      range_composite: {
        title: "Range + composite (author + time)",
        description: "Posts with author_id = 1 and created_at cutoff; compare baseline vs composite index tag.",
      },
      partial_public: {
        title: "Filtered: partial index (public posts)",
        description: "visibility = public and created_at cutoff; compare baseline vs partial index tag.",
      },
      covering_author: {
        title: "Covering index (narrow select)",
        description: "author_id = 1, projecting id + author_id only; compare baseline vs covering index tag.",
      },
      search_ilike_fts: {
        title: "Search: ILIKE vs stored FTS (GIN)",
        description: "body contains “bench”; baseline (ILIKE) vs fts_gin (search_vector @@).",
      },
      search_ilike_trgm: {
        title: "Search: ILIKE vs pg_trgm",
        description: "body contains “bench”; baseline vs trgm_gin (same ILIKE, trgm index eligible).",
      },
      search_runtime_vs_gin: {
        title: "Search: runtime tsvector vs stored GIN",
        description: "body contains “bench”; fts_runtime vs fts_gin.",
      },
      search_stored_scan_vs_gin: {
        title: "Search: stored @@ (heap-biased) vs GIN",
        description: "body contains “bench”; fts_stored_scan (raw SQL) vs fts_gin — preprocessing vs index benefit.",
      },
      search_gist_vs_gin: {
        title: "Search: GiST vs GIN (stored tsvector)",
        description: "body contains “bench”; same @@ query, slot A fts_gist vs slot B fts_gin (planner may pick different indexes).",
      },
    },
    runningSlot: "Running",
    execute: "Run comparison",
    executeRunning: "Running...",
    resultsTitle: "Results",
    summaryNarrativeTitle: "Summary",
    emptyCell: "n/a",
    bestSuffix: "best",
    valueModes: {
      literal: { label: "Value", placeholder: "Literal (comma-separated for IN)" },
      column_ref: { label: "Column", placeholderOption: "Compare to column..." },
    },
    approaches: {
      typeorm: "TypeORM",
      raw_sql: "Raw SQL",
    },
    hints: {
      selectColumn: "Select at least one result column.",
      limitRange: "Leave blank for no limit, or enter a number from 1 to 500.",
      filterIncomplete: "Finish each filter: column, operator, and value or column reference.",
      minSlots: "Add at least two execution slots before running.",
      slotIncomplete: "Each slot needs an engine and at least one option.",
    },
  },

  /** Display order for the results table; ids are stable for rendering logic. */
  summaryColumns: [
    { id: "slot" as const, header: "Slot" },
    { id: "strategy" as const, header: "What ran" },
    { id: "timeMs" as const, header: "Time (ms)" },
    { id: "payload" as const, header: "Payload (B)" },
    { id: "rows" as const, header: "Rows" },
    { id: "error" as const, header: "Error" },
  ],

  filterOpLabels: {
    eq: "=",
    neq: "!=",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<=",
    contains: "contains",
    starts_with: "starts with",
    in: "in list",
  } satisfies Record<FilterOp, string>,

  limits: {
    minSlots: 2,
    defaultSlots: 0,
    maxSlots: 8,
  },
} as const;

export type SummaryColumnId = (typeof workbenchUi.summaryColumns)[number]["id"];

export function filterOpLabel(op: FilterOp): string {
  return workbenchUi.filterOpLabels[op] ?? op;
}

export function approachLabel(a: BenchApproach): string {
  return workbenchUi.copy.approaches[a];
}

const OPT_SHORT: Record<string, string> = {
  baseline: "B-tree baseline",
  fts_runtime: "FTS (runtime tsvector)",
  fts_stored_scan: "FTS (stored @@ scan)",
  fts_gin: "FTS (GIN tsvector)",
  fts_gist: "FTS (GiST tsvector)",
  trgm_gin: "pg_trgm GIN",
  hash_pk: "Hash PK",
  composite_author_time: "Composite B-tree",
  partial_public_posts: "Partial B-tree",
  covering_author_posts: "Covering B-tree",
};

const OPT_LONG: Record<string, string> = {
  baseline: "default B-tree-oriented plans (including ILIKE substring search where used)",
  fts_runtime: "full-text search with tsvector built at query time",
  fts_stored_scan:
    "same search_vector @@ plainto_tsquery as fts_gin, but raw SQL runs in a short transaction with index/bitmap scans discouraged to approximate heap evaluation of the stored vector",
  fts_gin: "full-text search using the stored tsvector column and its GIN index where applicable",
  fts_gist: "full-text search using the stored tsvector column and its GiST index where applicable",
  trgm_gin: "substring ILIKE workloads with a pg_trgm GIN index on body/bio columns",
  hash_pk: "equality on bigint id where PostgreSQL may use a hash index on the primary key",
  composite_author_time:
    "filters that combine posts.author_id with created_at so the composite B-tree (author_id, created_at) can apply",
  partial_public_posts:
    "posts filtered to public visibility with a created_at predicate so a partial index on public rows can apply",
  covering_author_posts:
    "posts filtered by author_id with a narrow select list so a covering index on author_id INCLUDE (...) may avoid heap fetches",
};

/** Parses `entity:approach:opt+opt|…` strategy prefix from the API. */
function parseStrategyHead(strategy: string): { entityId: string; approach: string; opts: string[] } | null {
  const pipe = strategy.indexOf("|");
  const head = pipe >= 0 ? strategy.slice(0, pipe) : strategy;
  const segs = head.split(":");
  if (segs.length < 3) return null;
  const [entityId, approach, ...optParts] = segs;
  const optsJoined = optParts.join(":");
  const opts = optsJoined.split("+").filter(Boolean);
  return { entityId, approach, opts };
}

/** Short label for the results table (tooltip shows full strategy string). */
export function formatRunSetupShort(strategy: string): string {
  const parsed = parseStrategyHead(strategy);
  if (!parsed) return strategy;
  const engine = workbenchUi.copy.approaches[parsed.approach as BenchApproach] ?? parsed.approach;
  const opts = [...parsed.opts].sort().map((id) => OPT_SHORT[id] ?? id);
  return `${parsed.entityId} · ${engine} · ${opts.join(" + ")}`;
}

function formatRunSetupLong(strategy: string): string {
  const parsed = parseStrategyHead(strategy);
  if (!parsed) return strategy;
  const engine = parsed.approach === "typeorm" ? "TypeORM" : parsed.approach === "raw_sql" ? "raw SQL" : parsed.approach;
  const parts = [...parsed.opts].sort().map((id) => OPT_LONG[id] ?? id);
  let optPhrase = "unspecified options";
  if (parts.length === 1) optPhrase = parts[0]!;
  else if (parts.length > 1) optPhrase = `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]!}`;
  return `${engine} with ${optPhrase}`;
}

export type SortedResultRow = { slotIndex: number; result: SlotApiResult };

/** Fastest successful runs first; errors and untimed runs last. Preserves stable order on ties. */
export function sortResultRowsForDisplay(slotResults: (SlotApiResult | null)[]): SortedResultRow[] | null {
  if (!slotResults.every((r): r is SlotApiResult => r != null)) return null;
  const rows: SortedResultRow[] = slotResults.map((r, i) => ({ slotIndex: i, result: r }));
  rows.sort((a, b) => {
    const errA = a.result.error != null;
    const errB = b.result.error != null;
    if (errA !== errB) return errA ? 1 : -1;
    if (errA) return a.slotIndex - b.slotIndex;
    const msA = a.result.executionTimeMs;
    const msB = b.result.executionTimeMs;
    if (msA != null && msB != null && msA !== msB) return msA - msB;
    if (msA == null && msB == null) return a.slotIndex - b.slotIndex;
    if (msA == null) return 1;
    if (msB == null) return -1;
    return a.slotIndex - b.slotIndex;
  });
  return rows;
}

/** Plain-language bullets for under the results table. */
export function buildResultsNarrative(rows: SortedResultRow[], datasetLabel?: string): string[] {
  const lines: string[] = [];
  const lead = datasetLabel ? `For ${datasetLabel}, ` : "";

  const timedOk = rows.filter((r) => r.result.error == null && r.result.executionTimeMs != null);
  const failed = rows.filter((r) => r.result.error != null);

  if (timedOk.length > 0) {
    const fastest = timedOk[0]!;
    lines.push(
      `${lead}the fastest successful run was slot ${fastest.slotIndex + 1} (${fastest.result.executionTimeMs!.toFixed(2)} ms): ${formatRunSetupLong(fastest.result.strategy)}.`
    );
    if (timedOk.length > 1) {
      const slowest = timedOk[timedOk.length - 1]!;
      if (slowest.slotIndex !== fastest.slotIndex) {
        const mult = slowest.result.executionTimeMs! / fastest.result.executionTimeMs!;
        lines.push(
          `The slowest successful run was slot ${slowest.slotIndex + 1} (${slowest.result.executionTimeMs!.toFixed(2)} ms): ${formatRunSetupLong(slowest.result.strategy)}, about ${mult.toFixed(1)}× slower than the fastest.`
        );
      }
    }
  } else {
    lines.push(`${lead}no run finished without an error, so there is no timing comparison to highlight.`);
  }

  for (const r of failed) {
    lines.push(`Slot ${r.slotIndex + 1} failed: ${r.result.error}`);
  }

  const counts = [...new Set(rows.map((r) => r.result.rowCount))];
  if (counts.length === 1) {
    lines.push(`Every run returned ${counts[0]!} row(s).`);
  } else {
    lines.push(
      "Row counts differed between slots. If you did not intend that, treat timing gaps cautiously—the queries may not be returning the same data."
    );
  }

  return lines;
}

export function renderSummaryCell(
  col: SummaryColumnId,
  args: {
    displaySlotNumber: number;
    result: SlotApiResult;
    bestMs: number | null;
    empty: string;
  }
): { text: string; className?: string; wrapCode?: boolean } {
  const { displaySlotNumber, result, bestMs, empty } = args;
  switch (col) {
    case "slot":
      return { text: String(displaySlotNumber) };
    case "strategy":
      return { text: formatRunSetupShort(result.strategy), wrapCode: false };
    case "timeMs": {
      const ms = result.executionTimeMs;
      const isBest = ms != null && bestMs != null && ms === bestMs && result.error == null;
      return {
        text: ms != null ? `${ms}${isBest ? ` (${workbenchUi.copy.bestSuffix})` : ""}` : empty,
        className: isBest ? "best" : undefined,
      };
    }
    case "payload":
      return { text: String(result.payloadSizeBytes) };
    case "rows":
      return { text: String(result.rowCount) };
    case "error":
      return {
        text: result.error ?? empty,
        className: result.error ? "err" : undefined,
      };
    default:
      return { text: empty };
  }
}
