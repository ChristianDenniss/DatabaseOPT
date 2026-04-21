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
    recipesHeading: "Pre-built Comparisons",
    recipesHint:
      "One click loads a realistic filter, projection, and two slots so you can compare timings and plans without wiring everything by hand.",
    recipeCards: {
      lookup_pk: {
        title: "Primary-key lookup: btree vs hash",
        description:
          "Single-row fetch by id. Contrasts the default primary-key plan with the optional hash-index hint so you can see when hash might compete on equality.",
      },
      range_composite: {
        title: "Author feed: composite vs generic btree",
        description:
          "One author’s posts over a time window. Shows when a composite (author + time) index lines up with the filter versus relying on separate btree paths.",
      },
      partial_public: {
        title: "Public-only timeline: partial index",
        description:
          "Public posts in a date range. Highlights a partial index that ignores private rows so you can compare selective btree scans against a full-table baseline.",
      },
      covering_author: {
        title: "Narrow “by author” list: covering index",
        description:
          "Filter by author but return only a few columns. Explores when an INCLUDE-style covering index can satisfy the query with fewer heap touches.",
      },
      search_ilike_fts: {
        title: "Text search: substring vs full text (GIN)",
        description:
          "Same natural-language filter: baseline substring matching against stored-token full text so you can contrast ILIKE plans with GIN-backed tsvector.",
      },
      search_ilike_trgm: {
        title: "Text search: substring with trigram help",
        description:
          "Still substring-style matching. Adds the pg_trgm index story so you can see when trigram GIN changes the plan without changing the SQL shape.",
      },
      search_runtime_vs_gin: {
        title: "Full text: compute at read time vs stored vector",
        description:
          "Same search intent: builds tsvector in the query versus using a maintained search column so you can separate “parse text now” from “read precomputed tokens”.",
      },
      search_stored_scan_vs_gin: {
        title: "Full text: heap-style scan vs GIN index",
        description:
          "Same stored-vector predicate in raw SQL. Biases away from bitmap/index scans on one slot and normal GIN on the other to isolate index benefit from stored preprocessing.",
      },
      search_gist_vs_gin: {
        title: "Full text: GiST vs GIN on the same vector",
        description:
          "Identical tsvector predicate. Two planner tags so you can watch PostgreSQL pick GiST or GIN on the same column for the same @@ condition.",
      },
    },
    runningSlot: "Running",
    execute: "Run comparison",
    executeRunning: "Running...",
    resultsTitle: "Results",
    summaryNarrativeTitle: "Summary",
    emptyCell: "N/A",
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
  if (typeof strategy !== "string") return String(strategy);
  const parsed = parseStrategyHead(strategy);
  if (!parsed) return strategy;
  const engine = workbenchUi.copy.approaches[parsed.approach as BenchApproach] ?? parsed.approach;
  const opts = [...parsed.opts].sort().map((id) => OPT_SHORT[id] ?? id);
  return `${parsed.entityId} · ${engine} · ${opts.join(" + ")}`;
}

function formatRunSetupLong(strategy: string): string {
  if (typeof strategy !== "string") return String(strategy);
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

/** One fragment in a summary paragraph (plain, bold key figures, or muted strategy text). */
export type NarrativeSegment = { text: string; variant?: "strong" | "muted" };

/** A paragraph rendered as one `<p>` with mixed emphasis. */
export type NarrativeParagraph = NarrativeSegment[];

function s(text: string, variant?: "strong" | "muted"): NarrativeSegment {
  const safe = typeof text === "string" ? text : String(text);
  return variant ? { text: safe, variant } : { text: safe };
}

/** Plain-language bullets for under the results table. */
export function buildResultsNarrative(rows: SortedResultRow[], datasetLabel?: string): NarrativeParagraph[] {
  const paragraphs: NarrativeParagraph[] = [];

  const timedOk = rows.filter((r) => r.result.error == null && r.result.executionTimeMs != null);
  const failed = rows.filter((r) => r.result.error != null);

  if (timedOk.length > 0) {
    const fastest = timedOk[0]!;
    const slotFast = fastest.slotIndex + 1;
    const msFast = fastest.result.executionTimeMs!.toFixed(2);
    const open = datasetLabel
      ? s(`For ${datasetLabel}, the fastest successful run was `, "strong")
      : s("The fastest successful run was ", "strong");
    paragraphs.push([
      open,
      s(`slot ${slotFast} (${msFast} ms)`, "strong"),
      s(": "),
      s(formatRunSetupLong(fastest.result.strategy), "muted"),
      s("."),
    ]);
    if (timedOk.length > 1) {
      const slowest = timedOk[timedOk.length - 1]!;
      if (slowest.slotIndex !== fastest.slotIndex) {
        const mult = slowest.result.executionTimeMs! / fastest.result.executionTimeMs!;
        const slotSlow = slowest.slotIndex + 1;
        const msSlow = slowest.result.executionTimeMs!.toFixed(2);
        paragraphs.push([
          s("The slowest successful run was ", "strong"),
          s(`slot ${slotSlow} (${msSlow} ms)`, "strong"),
          s(": "),
          s(formatRunSetupLong(slowest.result.strategy), "muted"),
          s(", "),
          s(`about ${mult.toFixed(1)}× slower than the fastest.`, "strong"),
        ]);
      }
    }
  } else {
    paragraphs.push([
      ...(datasetLabel ? [s(`For ${datasetLabel}, `)] : []),
      s("No run finished without an error", "strong"),
      s(", so there is no timing comparison to highlight."),
    ]);
  }

  for (const r of failed) {
    const err =
      typeof r.result.error === "string" || r.result.error == null
        ? (r.result.error ?? "")
        : String(r.result.error);
    paragraphs.push([s(`Slot ${r.slotIndex + 1} failed: `, "strong"), s(err, "muted")]);
  }

  const counts = [...new Set(rows.map((r) => r.result.rowCount))];
  if (counts.length === 1) {
    paragraphs.push([s("Every run returned ", "strong"), s(`${counts[0]!} row(s)`, "strong"), s(".")]);
  } else {
    paragraphs.push([
      s("Row counts differed between slots.", "strong"),
      s(
        " If you did not intend that, treat timing gaps cautiously: the queries may not be returning the same data."
      ),
    ]);
  }

  return paragraphs;
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
      return {
        text: formatRunSetupShort(typeof result.strategy === "string" ? result.strategy : String(result.strategy)),
        wrapCode: false,
      };
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
    case "error": {
      const errText =
        typeof result.error === "string" || result.error == null
          ? (result.error ?? empty)
          : String(result.error);
      return {
        text: errText,
        className: result.error ? "err" : undefined,
      };
    }
    default:
      return { text: empty };
  }
}
