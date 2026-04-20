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
    removeFilter: "Remove",
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
    ftsOptionsHint:
      "FTS options appear when at least one filter is a completed string “contains” with a literal value (the cases where ILIKE vs tsvector differs).",
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
  baseline: "default",
  fts_tsvector: "FTS (runtime tsvector)",
  fts_gin: "FTS (stored tsvector + GIN)",
};

const OPT_LONG: Record<string, string> = {
  baseline: "the default path (including ILIKE substring search where used)",
  fts_tsvector: "full-text search with tsvector built at query time",
  fts_gin: "full-text search using the stored tsvector column and its GIN index where applicable",
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
