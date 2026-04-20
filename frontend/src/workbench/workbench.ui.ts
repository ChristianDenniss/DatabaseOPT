import type { BenchApproach, FilterOp, SlotApiResult } from "./types";

/**
 * Presentation-only config: reorder `summaryColumns` or edit labels without touching layout logic.
 * Filter operators stay data-driven from the API catalog; labels map here for readability.
 */
export const workbenchUi = {
  copy: {
    title: "Query comparison workbench",
    intro:
      "Choose filters and columns, then run two or more slots with different engines. Results land in the summary table below.",
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
    orderBy: "Sort by",
    orderDefault: "Default",
    orderDirection: "Direction",
    slotsHeading: "Execution slots",
    addSlot: "Add slot",
    slotsHint: "Add slots with the button above, then pick an engine and one or more options per slot. You need at least two slots to run.",
    slotsEmpty: "No slots yet. Use Add slot to create them.",
    slotTitle: (n: number) => `Slot ${n}`,
    removeSlot: "Remove",
    executionLabel: "Engine",
    optimizationsLabel: "Options",
    pickEngineFirst: "Choose an engine to see options.",
    runningSlot: "Running",
    execute: "Run comparison",
    executeRunning: "Running...",
    summaryTitle: "Summary",
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
      limitRange: "Limit must be between 1 and 500.",
      filterIncomplete: "Finish each filter: column, operator, and value or column reference.",
      minSlots: "Add at least two execution slots before running.",
      slotIncomplete: "Each slot needs an engine and at least one option.",
    },
  },

  /** Display order for the results table; ids are stable for rendering logic. */
  summaryColumns: [
    { id: "slot" as const, header: "Slot" },
    { id: "strategy" as const, header: "Strategy" },
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

export function renderSummaryCell(
  col: SummaryColumnId,
  args: {
    index: number;
    result: SlotApiResult;
    bestMs: number | null;
    empty: string;
  }
): { text: string; className?: string; wrapCode?: boolean } {
  const { index, result, bestMs, empty } = args;
  switch (col) {
    case "slot":
      return { text: String(index + 1) };
    case "strategy":
      return { text: result.strategy, wrapCode: true };
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
