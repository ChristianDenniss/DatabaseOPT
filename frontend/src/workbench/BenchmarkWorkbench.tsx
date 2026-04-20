import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BenchApproach,
  CatalogColumn,
  CatalogEntity,
  ComparisonBox,
  FilterConditionRow,
  FilterOp,
  SlotApiResult,
  WorkbenchCatalog,
} from "./types";
import {
  approachLabel,
  buildResultsNarrative,
  filterOpLabel,
  renderSummaryCell,
  sortResultRowsForDisplay,
  workbenchUi,
} from "./workbench.ui";
import { optimizationsForSlot, queryHasApplicableTextSearch } from "./workbench-optimizations";
import { applyRecipe, RECIPE_ORDER, type RecipeId } from "./workbench.recipes";
import { useColumnSamples } from "./useColumnSamples";

function parseOptionalCount(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyBoxes(n: number): ComparisonBox[] {
  return Array.from({ length: n }, () => ({
    id: newId(),
    approach: null,
    optimizationIds: [],
  }));
}

function defaultSelectColumns(e: CatalogEntity): string[] {
  const preferred = e.columns.filter((c) => c.defaultSelected).map((c) => c.id);
  if (preferred.length > 0) return preferred;
  return e.columns.map((c) => c.id);
}

function optimizationsForApproach(catalog: WorkbenchCatalog | null, approach: BenchApproach | null) {
  if (!catalog || !approach) return [];
  return catalog.optimizations.filter((o) => o.approaches.includes(approach));
}

function conditionsSupportTypeorm(conditions: FilterConditionRow[]): boolean {
  return conditions.every((row) => row.kind === "column");
}

function boxIsComplete(
  catalog: WorkbenchCatalog | null,
  box: ComparisonBox,
  entity: CatalogEntity | null,
  conditions: FilterConditionRow[],
  selectColumns: string[],
  isRowComplete: (row: FilterConditionRow) => boolean
): boolean {
  if (!catalog || box.approach === null || !entity) return false;
  const allowed = new Set(
    optimizationsForSlot(catalog, box.approach, entity, conditions, selectColumns, isRowComplete).map((o) => o.id)
  );
  if (box.optimizationIds.length === 0) return false;
  return box.optimizationIds.every((id) => allowed.has(id));
}

function opsForColumn(catalog: WorkbenchCatalog, col: CatalogColumn | undefined): FilterOp[] {
  if (!col) return [];
  return catalog.filterOpsByKind[col.kind] ?? [];
}

function literalOk(col: CatalogColumn, op: FilterOp, value: string): boolean {
  const t = value.trim();
  if (op === "in") {
    if (t.length === 0) return false;
    const parts = t
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (parts.length === 0) return false;
    if (col.kind === "bigint") return parts.every((p) => /^\d+$/.test(p));
    if (col.kind === "number") return parts.every((p) => Number.isFinite(Number(p)));
    if (col.kind === "timestamp") return parts.every((p) => !Number.isNaN(new Date(p).getTime()));
    return true;
  }
  if (col.kind === "string" && (op === "eq" || op === "neq")) return true;
  if (op === "contains" || op === "starts_with") return t.length > 0;
  if (col.kind === "bigint") return /^\d+$/.test(t);
  if (col.kind === "number") return t.length > 0 && Number.isFinite(Number(t));
  if (col.kind === "timestamp") return t.length > 0 && !Number.isNaN(new Date(t).getTime());
  return t.length > 0;
}

function userPostCountWindowComplete(row: FilterConditionRow): boolean {
  const min = parseOptionalCount(row.minCount);
  const max = parseOptionalCount(row.maxCount);
  if (min == null && max == null) return false;
  if (row.windowFrom.trim() === "" || row.windowTo.trim() === "") return false;
  if (Number.isNaN(new Date(row.windowFrom).getTime()) || Number.isNaN(new Date(row.windowTo).getTime()))
    return false;
  if (min != null && max != null && min > max) return false;
  return true;
}

function userPostContainsWindowComplete(row: FilterConditionRow): boolean {
  if (row.keyword.trim() === "") return false;
  if (!userPostCountWindowComplete(row)) return false;
  return true;
}

function conditionRowComplete(catalog: WorkbenchCatalog, entity: CatalogEntity, row: FilterConditionRow): boolean {
  if (row.kind === "user_posts_count_window") {
    return entity.id === "users" && userPostCountWindowComplete(row);
  }
  if (row.kind === "user_posts_contains_window") {
    return entity.id === "users" && userPostContainsWindowComplete(row);
  }
  const col = entity.columns.find((c) => c.id === row.column);
  if (!col?.filterable) return false;
  const ops = opsForColumn(catalog, col);
  if (!ops.includes(row.op)) return false;
  if (row.valueMode === "column_ref") {
    if (!row.refColumn || row.refColumn === row.column) return false;
    const ref = entity.columns.find((c) => c.id === row.refColumn);
    return !!ref?.filterable && ref.kind === col.kind;
  }
  return literalOk(col, row.op, row.value);
}

/** Empty string = no row limit; otherwise integer 1–500. */
function parseRowLimit(limitStr: string): { ok: true; limit: number | null } | { ok: false } {
  const t = limitStr.trim();
  if (t === "") return { ok: true, limit: null };
  const n = Math.floor(Number(t));
  if (!Number.isFinite(n) || n < 1 || n > 500) return { ok: false };
  return { ok: true, limit: n };
}

function queryPlanComplete(
  catalog: WorkbenchCatalog | null,
  entity: CatalogEntity | null,
  conditions: FilterConditionRow[],
  selectColumns: string[],
  limitStr: string
): boolean {
  if (!catalog || !entity) return false;
  if (selectColumns.length === 0) return false;
  if (!parseRowLimit(limitStr).ok) return false;
  for (const id of selectColumns) {
    if (!entity.columns.some((c) => c.id === id)) return false;
  }
  for (const row of conditions) {
    if (!conditionRowComplete(catalog, entity, row)) return false;
  }
  return true;
}

type FilterRowProps = {
  row: FilterConditionRow;
  entity: CatalogEntity;
  catalog: WorkbenchCatalog;
  onPatch: (id: string, patch: Partial<FilterConditionRow>) => void;
  onRemove: (id: string) => void;
};

function WorkbenchFilterRow({ row, entity, catalog, onPatch, onRemove }: FilterRowProps) {
  const col = entity.columns.find((c) => c.id === row.column);
  const ops = col ? opsForColumn(catalog, col) : [];
  const { values: existingValues, loading: samplesLoading } = useColumnSamples(
    entity.id,
    row.column,
    row.valueMode === "literal"
  );

  return (
    <div className="filter-row">
      {entity.id === "users" && (
        <select
          className="wb-input tight"
          value={row.kind}
          onChange={(e) =>
            onPatch(row.id, {
              kind: e.target.value as FilterConditionRow["kind"],
              column: entity.columns.find((c) => c.filterable)?.id ?? "",
              op: "eq",
              valueMode: "literal",
              value: "",
              refColumn: "",
              windowFrom: "",
              windowTo: "",
              minCount: "",
              maxCount: "",
              keyword: "",
            })
          }
        >
          <option value="column">{workbenchUi.copy.conditionTypes.column}</option>
          <option value="user_posts_count_window">
            {workbenchUi.copy.conditionTypes.user_posts_count_window}
          </option>
          <option value="user_posts_contains_window">
            {workbenchUi.copy.conditionTypes.user_posts_contains_window}
          </option>
        </select>
      )}
      {row.kind === "column" ? (
        <>
      <select
        className="wb-input tight"
        value={row.column}
        onChange={(e) => onPatch(row.id, { column: e.target.value })}
      >
        {entity.columns
          .filter((c) => c.filterable)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
      </select>
      <select
        className="wb-input tight"
        value={row.op}
        onChange={(e) => onPatch(row.id, { op: e.target.value as FilterOp })}
      >
        {ops.map((o) => (
          <option key={o} value={o}>
            {filterOpLabel(o)}
          </option>
        ))}
      </select>
      <div className="value-mode">
        <label className="radio-pill small">
          <input
            type="radio"
            name={`vm-${row.id}`}
            checked={row.valueMode === "literal"}
            onChange={() => onPatch(row.id, { valueMode: "literal" })}
          />
          {workbenchUi.copy.valueModes.literal.label}
        </label>
        <label className="radio-pill small">
          <input
            type="radio"
            name={`vm-${row.id}`}
            checked={row.valueMode === "column_ref"}
            onChange={() => onPatch(row.id, { valueMode: "column_ref" })}
          />
          {workbenchUi.copy.valueModes.column_ref.label}
        </label>
      </div>
      {row.valueMode === "literal" ? (
        <div className="filter-value-wrap">
          <input
            className="wb-input grow"
            list={existingValues.length > 0 ? `wb-lit-${row.id}` : undefined}
            placeholder={workbenchUi.copy.valueModes.literal.placeholder}
            value={row.value}
            onChange={(e) => onPatch(row.id, { value: e.target.value })}
            aria-busy={samplesLoading}
          />
          {existingValues.length > 0 && (
            <datalist id={`wb-lit-${row.id}`}>
              {existingValues.map((v, i) => (
                <option key={`${i}:${v}`} value={v} />
              ))}
            </datalist>
          )}
        </div>
      ) : (
        <select
          className="wb-input grow"
          value={row.refColumn}
          onChange={(e) => onPatch(row.id, { refColumn: e.target.value })}
        >
          <option value="">{workbenchUi.copy.valueModes.column_ref.placeholderOption}</option>
          {entity.columns
            .filter((c) => c.filterable && c.id !== row.column && c.kind === col?.kind)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
        </select>
      )}
      <button type="button" className="btn-ghost" onClick={() => onRemove(row.id)}>
        {workbenchUi.copy.removeFilter}
      </button>
        </>
      ) : (
        <>
          <input
            className="wb-input tight"
            type="datetime-local"
            value={row.windowFrom}
            onChange={(e) => onPatch(row.id, { windowFrom: e.target.value })}
            title={workbenchUi.copy.windowFrom}
          />
          <input
            className="wb-input tight"
            type="datetime-local"
            value={row.windowTo}
            onChange={(e) => onPatch(row.id, { windowTo: e.target.value })}
            title={workbenchUi.copy.windowTo}
          />
          <input
            className="wb-input tight"
            type="number"
            min={0}
            placeholder={workbenchUi.copy.minCount}
            value={row.minCount}
            onChange={(e) => onPatch(row.id, { minCount: e.target.value })}
          />
          <input
            className="wb-input tight"
            type="number"
            min={0}
            placeholder={workbenchUi.copy.maxCount}
            value={row.maxCount}
            onChange={(e) => onPatch(row.id, { maxCount: e.target.value })}
          />
          {row.kind === "user_posts_contains_window" && (
            <input
              className="wb-input grow"
              type="text"
              placeholder={workbenchUi.copy.keywordPlaceholder}
              value={row.keyword}
              onChange={(e) => onPatch(row.id, { keyword: e.target.value })}
            />
          )}
          <button type="button" className="btn-ghost" onClick={() => onRemove(row.id)}>
            {workbenchUi.copy.removeFilter}
          </button>
        </>
      )}
    </div>
  );
}

export function BenchmarkWorkbench() {
  const [catalog, setCatalog] = useState<WorkbenchCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [entityId, setEntityId] = useState<string>("");
  const [combinator, setCombinator] = useState<"and" | "or">("and");
  const [conditions, setConditions] = useState<FilterConditionRow[]>([]);
  const [selectColumns, setSelectColumns] = useState<string[]>([]);
  const [limitStr, setLimitStr] = useState("");
  const [orderColumn, setOrderColumn] = useState<string>("");
  const [orderDir, setOrderDir] = useState<"ASC" | "DESC">("DESC");

  const [boxes, setBoxes] = useState<ComparisonBox[]>(() =>
    emptyBoxes(workbenchUi.limits.defaultSlots)
  );
  const [runError, setRunError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [slotResults, setSlotResults] = useState<(SlotApiResult | null)[]>([]);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);

  const entity = useMemo(
    () => catalog?.entities.find((e) => e.id === entityId) ?? null,
    [catalog, entityId]
  );

  const isRowComplete = useCallback(
    (row: FilterConditionRow) =>
      !!(catalog && entity && conditionRowComplete(catalog, entity, row)),
    [catalog, entity]
  );

  const resetWorkbenchForEntity = useCallback((next: CatalogEntity) => {
    setSelectColumns(defaultSelectColumns(next));
    setConditions([]);
    setCombinator("and");
    setOrderColumn("");
    setOrderDir(
      ["posts", "comments", "post_likes", "user_follows"].includes(next.id) ? "DESC" : "ASC"
    );
    setLimitStr("");
    setBoxes(emptyBoxes(workbenchUi.limits.defaultSlots));
    setSlotResults([]);
    setPhase("idle");
    setRunError(null);
  }, []);

  const applyWorkbenchRecipe = useCallback(
    (recipeId: RecipeId) => {
      if (!catalog) return;
      const r = applyRecipe(recipeId, catalog, newId);
      setEntityId(r.entityId);
      setCombinator(r.combinator);
      setConditions(r.conditions);
      setSelectColumns(r.selectColumns);
      setLimitStr(r.limitStr);
      setOrderColumn(r.orderColumn);
      setOrderDir(r.orderDir);
      setBoxes(r.boxes);
      setSlotResults([]);
      setPhase("idle");
      setRunError(null);
    },
    [catalog]
  );

  useEffect(() => {
    fetch("/api/bench/catalog")
      .then((r) => r.json())
      .then((j: WorkbenchCatalog) => {
        setCatalog(j);
        const first = j.entities[0];
        if (first) {
          setEntityId(first.id);
          setSelectColumns(defaultSelectColumns(first));
          setConditions([]);
          setCombinator("and");
          setOrderColumn("");
          setOrderDir(
            ["posts", "comments", "post_likes", "user_follows"].includes(first.id) ? "DESC" : "ASC"
          );
          setLimitStr("");
          setBoxes(emptyBoxes(workbenchUi.limits.defaultSlots));
          setSlotResults([]);
          setPhase("idle");
          setRunError(null);
        }
      })
      .catch(() => setCatalogError("Could not load bench catalog (is the API running on :4000?)"));
  }, []);

  const canExecute = useMemo(() => {
    if (!catalog || !entity || boxes.length < workbenchUi.limits.minSlots || phase === "running")
      return false;
    if (!queryPlanComplete(catalog, entity, conditions, selectColumns, limitStr)) return false;
    return boxes.every((b) =>
      boxIsComplete(catalog, b, entity, conditions, selectColumns, isRowComplete)
    );
  }, [catalog, entity, boxes, conditions, selectColumns, limitStr, phase, isRowComplete]);

  const typeormAllowed = useMemo(() => conditionsSupportTypeorm(conditions), [conditions]);

  const addCondition = useCallback(() => {
    if (!entity) return;
    const first = entity.columns.find((c) => c.filterable);
    const ops = catalog && first ? opsForColumn(catalog, first) : [];
    setConditions((prev) => [
      ...prev,
      {
        id: newId(),
        kind: "column",
        column: first?.id ?? "",
        op: ops[0] ?? "eq",
        valueMode: "literal",
        value: "",
        refColumn: "",
        windowFrom: "",
        windowTo: "",
        minCount: "",
        maxCount: "",
        keyword: "",
      },
    ]);
  }, [catalog, entity]);

  const removeCondition = useCallback((id: string) => {
    setConditions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const patchCondition = useCallback((id: string, patch: Partial<FilterConditionRow>) => {
    setConditions((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        if ((patch.column != null || patch.kind === "column") && entity) {
          const col = entity.columns.find((c) => c.id === patch.column);
          const o = catalog && col ? opsForColumn(catalog, col) : [];
          if (!o.includes(next.op)) next.op = o[0] ?? "eq";
          next.value = "";
          next.refColumn = "";
        }
        return next;
      })
    );
  }, [catalog, entity]);

  const toggleSelectColumn = useCallback((colId: string, on: boolean) => {
    setSelectColumns((prev) => {
      const set = new Set(prev);
      if (on) set.add(colId);
      else set.delete(colId);
      const next = [...set];
      return next.length === 0 ? prev : next;
    });
  }, []);

  const addBox = useCallback(() => {
    setBoxes((prev) =>
      prev.length >= workbenchUi.limits.maxSlots
        ? prev
        : [...prev, { id: newId(), approach: null, optimizationIds: [] }]
    );
  }, []);

  const removeBox = useCallback((id: string) => {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const setApproach = useCallback(
    (boxId: string, approach: BenchApproach) => {
      if (approach === "typeorm" && !typeormAllowed) return;
      setBoxes((prev) =>
        prev.map((b) => {
          if (b.id !== boxId) return b;
          const allowed = new Set(
            optimizationsForSlot(catalog, approach, entity, conditions, selectColumns, isRowComplete).map(
              (o) => o.id
            )
          );
          return { ...b, approach, optimizationIds: b.optimizationIds.filter((x) => allowed.has(x)) };
        })
      );
    },
    [catalog, entity, conditions, selectColumns, isRowComplete, typeormAllowed]
  );

  /** Drop FTS optimization ids when the query no longer has a literal string `contains`. */
  useEffect(() => {
    if (!catalog || !entity) return;
    setBoxes((prev) => {
      let changed = false;
      const next = prev.map((box) => {
        if (box.approach === null) return box;
        const allowed = new Set(
          optimizationsForSlot(catalog, box.approach, entity, conditions, selectColumns, isRowComplete).map(
            (o) => o.id
          )
        );
        const filtered = box.optimizationIds.filter((id) => allowed.has(id));
        if (filtered.length !== box.optimizationIds.length) {
          changed = true;
          return { ...box, optimizationIds: filtered };
        }
        return box;
      });
      return changed ? next : prev;
    });
  }, [catalog, entity, conditions, selectColumns, isRowComplete]);

  useEffect(() => {
    if (typeormAllowed) return;
    setBoxes((prev) => {
      let changed = false;
      const next = prev.map((box) => {
        if (box.approach !== "typeorm") return box;
        changed = true;
        return { ...box, approach: "raw_sql" };
      });
      return changed ? next : prev;
    });
  }, [typeormAllowed]);

  const toggleOptimization = useCallback((boxId: string, optId: string, checked: boolean) => {
    setBoxes((prev) =>
      prev.map((b) => {
        if (b.id !== boxId) return b;
        const s = new Set(b.optimizationIds);
        if (checked) s.add(optId);
        else s.delete(optId);
        return { ...b, optimizationIds: [...s] };
      })
    );
  }, []);

  const buildExecutePayload = useCallback(
    (box: ComparisonBox) => {
      if (!entity || !box.approach) return null;
      const lp = parseRowLimit(limitStr);
      if (!lp.ok) return null;
      const payload: Record<string, unknown> = {
        entityId: entity.id,
        combinator,
        conditions: conditions.map((c) => ({
          ...(c.kind === "column"
            ? {
                kind: "column",
                column: c.column,
                op: c.op,
                valueMode: c.valueMode,
                value: c.valueMode === "literal" ? c.value : undefined,
                refColumn: c.valueMode === "column_ref" ? c.refColumn : undefined,
              }
            : c.kind === "user_posts_count_window"
              ? {
                  kind: "user_posts_count_window",
                  windowFrom: c.windowFrom,
                  windowTo: c.windowTo,
                  minCount: c.minCount.trim() === "" ? undefined : Number(c.minCount),
                  maxCount: c.maxCount.trim() === "" ? undefined : Number(c.maxCount),
                }
              : {
                  kind: "user_posts_contains_window",
                  windowFrom: c.windowFrom,
                  windowTo: c.windowTo,
                  minCount: c.minCount.trim() === "" ? undefined : Number(c.minCount),
                  maxCount: c.maxCount.trim() === "" ? undefined : Number(c.maxCount),
                  keyword: c.keyword,
                }),
        })),
        selectColumns,
        approach: box.approach,
        optimizationIds: box.optimizationIds,
      };
      if (lp.limit != null) {
        payload.limit = lp.limit;
      }
      if (orderColumn.trim()) {
        payload.orderBy = { column: orderColumn.trim(), direction: orderDir };
      }
      return payload;
    },
    [entity, combinator, conditions, selectColumns, limitStr, orderColumn, orderDir]
  );

  const execute = useCallback(async () => {
    if (!entity || !canExecute) return;
    setRunError(null);
    setPhase("running");
    setSlotResults(Array(boxes.length).fill(null));
    try {
      for (let i = 0; i < boxes.length; i++) {
        setActiveSlotIndex(i);
        const box = boxes[i];
        const payload = buildExecutePayload(box);
        if (!payload) throw new Error("Invalid slot");
        const res = await fetch("/api/bench/execute-slot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as SlotApiResult & { error?: string };
        if (!res.ok) throw new Error(json.error ?? res.statusText);
        setSlotResults((prev) => {
          const next = [...prev];
          next[i] = json as SlotApiResult;
          return next;
        });
      }
      setPhase("done");
    } catch (e) {
      setRunError(String((e as Error)?.message ?? e));
      setPhase("idle");
    } finally {
      setActiveSlotIndex(null);
    }
  }, [entity, boxes, canExecute, buildExecutePayload]);

  const bestMs = useMemo(() => {
    const times = slotResults
      .filter((r): r is SlotApiResult => r != null && r.error == null && r.executionTimeMs != null)
      .map((r) => r.executionTimeMs as number);
    if (times.length === 0) return null;
    return Math.min(...times);
  }, [slotResults]);

  const sortedResultRows = useMemo(
    () => (phase === "done" ? sortResultRowsForDisplay(slotResults) : null),
    [phase, slotResults]
  );

  const resultsNarrative = useMemo(() => {
    if (!sortedResultRows) return [];
    return buildResultsNarrative(sortedResultRows, entity?.label);
  }, [sortedResultRows, entity?.label]);

  const queryHint = useMemo(() => {
    if (!catalog || !entity) return null;
    if (selectColumns.length === 0) return workbenchUi.copy.hints.selectColumn;
    if (!parseRowLimit(limitStr).ok) return workbenchUi.copy.hints.limitRange;
    for (const row of conditions) {
      if (!conditionRowComplete(catalog, entity, row)) return workbenchUi.copy.hints.filterIncomplete;
    }
    return null;
  }, [catalog, entity, conditions, selectColumns, limitStr]);

  return (
    <section className="workbench">
      <h2>{workbenchUi.copy.title}</h2>
      <p className="workbench-intro">{workbenchUi.copy.intro}</p>

      {catalogError && (
        <p className="alert" role="alert">
          {catalogError}
        </p>
      )}

      {catalog && (
        <>
          <div className="workbench-params workbench-dataset-sort-row">
            <div className="wb-dataset-col">
              <h3 id="wb-dataset-step">{`1. ${workbenchUi.copy.stepEntity}`}</h3>
              <select
                id="wb-entity"
                className="wb-select wb-dataset-select wb-after-heading"
                aria-labelledby="wb-dataset-step"
                value={entityId}
                onChange={(e) => {
                  const id = e.target.value;
                  setEntityId(id);
                  const next = catalog?.entities.find((x) => x.id === id);
                  if (next) resetWorkbenchForEntity(next);
                }}
              >
                {catalog.entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
              {entity && <p className="task-desc">{entity.description}</p>}
            </div>
            <div className="wb-limitsort-col">
              {entity ? (
                <>
                  <h3>2. {workbenchUi.copy.limitSortHeading}</h3>
                  <div className="wb-limitsort-fields wb-after-heading">
                    <div className="wb-limitsort-stacked-field">
                      <input
                        id="wb-limit"
                        className="wb-input"
                        type="text"
                        inputMode="numeric"
                        placeholder={workbenchUi.copy.rowLimitPlaceholder}
                        autoComplete="off"
                        aria-labelledby="wb-limit-caption"
                        value={limitStr}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "");
                          if (raw === "") {
                            setLimitStr("");
                            return;
                          }
                          const n = Number(raw);
                          if (n > 500) return;
                          setLimitStr(raw);
                        }}
                      />
                      <p id="wb-limit-caption" className="task-desc">
                        {workbenchUi.copy.rowLimit}
                      </p>
                    </div>
                    <div className="wb-limitsort-stacked-field">
                      <select
                        id="wb-order-col"
                        className="wb-select"
                        aria-labelledby="wb-order-col-caption"
                        value={orderColumn}
                        onChange={(e) => setOrderColumn(e.target.value)}
                      >
                        <option value="">{workbenchUi.copy.orderDefault}</option>
                        {entity.columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <p id="wb-order-col-caption" className="task-desc">
                        {workbenchUi.copy.orderBy}
                      </p>
                    </div>
                    {orderColumn && (
                      <div className="wb-limitsort-stacked-field">
                        <select
                          id="wb-order-dir"
                          className="wb-select"
                          aria-labelledby="wb-order-dir-caption"
                          value={orderDir}
                          onChange={(e) => setOrderDir(e.target.value as "ASC" | "DESC")}
                        >
                          <option value="ASC">ASC</option>
                          <option value="DESC">DESC</option>
                        </select>
                        <p id="wb-order-dir-caption" className="task-desc">
                          {workbenchUi.copy.orderDirection}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="workbench-hint wb-limitsort-placeholder">2. {workbenchUi.copy.limitSortHeading}</p>
              )}
            </div>
          </div>

          {catalog && (
            <div className="workbench-recipes workbench-params">
              <h3>{workbenchUi.copy.recipesHeading}</h3>
              <p className="workbench-hint">{workbenchUi.copy.recipesHint}</p>
              <div className="recipe-grid">
                {RECIPE_ORDER.map((rid) => {
                  const card = workbenchUi.copy.recipeCards[rid];
                  return (
                    <button
                      key={rid}
                      type="button"
                      className="btn-secondary recipe-btn"
                      title={card.description}
                      onClick={() => applyWorkbenchRecipe(rid)}
                    >
                      <strong>{card.title}</strong>
                      <span className="muted small">{card.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {entity && (
            <>
              <div className="workbench-params">
                <h3>3. {workbenchUi.copy.stepColumns}</h3>
                <p className="workbench-hint">{workbenchUi.copy.columnsHint}</p>
                <div className="column-picks">
                  {entity.columns.map((c) => (
                    <label key={c.id} className="check-row" title={c.id}>
                      <input
                        type="checkbox"
                        checked={selectColumns.includes(c.id)}
                        onChange={(e) => toggleSelectColumn(c.id, e.target.checked)}
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="workbench-params">
                <h3>4. {workbenchUi.copy.filtersHeading}</h3>
                <p className="workbench-hint">{workbenchUi.copy.filtersHint}</p>
                <div className="combinator-row">
                  <span className="field-label">{workbenchUi.copy.combineLabel}</span>
                  <div className="radio-row">
                    <label className="radio-pill">
                      <input
                        type="radio"
                        name="combinator"
                        checked={combinator === "and"}
                        onChange={() => setCombinator("and")}
                      />
                      {workbenchUi.copy.combineAnd}
                    </label>
                    <label className="radio-pill">
                      <input
                        type="radio"
                        name="combinator"
                        checked={combinator === "or"}
                        onChange={() => setCombinator("or")}
                      />
                      {workbenchUi.copy.combineOr}
                    </label>
                  </div>
                </div>

                <div className="filter-rows">
                  {conditions.map((row) => (
                    <WorkbenchFilterRow
                      key={row.id}
                      row={row}
                      entity={entity}
                      catalog={catalog}
                      onPatch={patchCondition}
                      onRemove={removeCondition}
                    />
                  ))}
                </div>
                <button type="button" className="btn-secondary" onClick={addCondition}>
                  + {workbenchUi.copy.addFilter}
                </button>
              </div>

            </>
          )}

          <div className="workbench-slots">
            <div className="slots-header">
              <h3>5. {workbenchUi.copy.stepSlots}</h3>
            </div>
            <p className="workbench-hint">{workbenchUi.copy.slotsHint}</p>
            <div className="slots-add">
              <button
                type="button"
                className="btn-secondary"
                onClick={addBox}
                disabled={boxes.length >= workbenchUi.limits.maxSlots}
              >
                + {workbenchUi.copy.addSlot}
              </button>
            </div>
            <div className="slots-list">
              {boxes.map((box, index) => {
                const opts = optimizationsForSlot(
                  catalog,
                  box.approach,
                  entity,
                  conditions,
                  selectColumns,
                  isRowComplete
                );
                const complete = boxIsComplete(
                  catalog,
                  box,
                  entity,
                  conditions,
                  selectColumns,
                  isRowComplete
                );
                const textSearchOptsHidden =
                  !!catalog &&
                  !!entity &&
                  box.approach != null &&
                  !queryHasApplicableTextSearch(entity, isRowComplete, conditions);
                return (
                  <article key={box.id} className={`comparison-slot ${complete ? "complete" : "incomplete"}`}>
                    <div className="slot-head">
                      <h4>{workbenchUi.copy.slotTitle(index + 1)}</h4>
                      <button type="button" className="btn-ghost" onClick={() => removeBox(box.id)}>
                        {workbenchUi.copy.removeSlot}
                      </button>
                    </div>

                    <div className="field">
                      <span className="field-label">{workbenchUi.copy.executionLabel}</span>
                      <div className="radio-row">
                        <label className="radio-pill">
                          <input
                            type="radio"
                            name={`approach-${box.id}`}
                            checked={box.approach === "typeorm"}
                            disabled={!typeormAllowed}
                            onChange={() => setApproach(box.id, "typeorm")}
                          />
                          {approachLabel("typeorm")}
                        </label>
                        <label className="radio-pill">
                          <input
                            type="radio"
                            name={`approach-${box.id}`}
                            checked={box.approach === "raw_sql"}
                            onChange={() => setApproach(box.id, "raw_sql")}
                          />
                          {approachLabel("raw_sql")}
                        </label>
                      </div>
                    </div>

                    <div className="field">
                      <span className="field-label">{workbenchUi.copy.optimizationsLabel}</span>
                      {!box.approach ? (
                        <p className="muted small">{workbenchUi.copy.pickEngineFirst}</p>
                      ) : (
                        <>
                          {!typeormAllowed && (
                            <p className="muted small">{workbenchUi.copy.rawSqlOnlyHint}</p>
                          )}
                          <ul className="opt-list">
                            {opts.map((o) => (
                              <li key={o.id}>
                                <label className="check-row">
                                  <input
                                    type="checkbox"
                                    checked={box.optimizationIds.includes(o.id)}
                                    onChange={(e) => toggleOptimization(box.id, o.id, e.target.checked)}
                                  />
                                  {o.label}
                                </label>
                              </li>
                            ))}
                          </ul>
                          {textSearchOptsHidden && (
                            <p className="muted small">{workbenchUi.copy.ftsOptionsHint}</p>
                          )}
                        </>
                      )}
                    </div>

                    {phase !== "idle" && (
                      <div className="slot-live">
                        {activeSlotIndex === index && (
                          <span className="pulse">{workbenchUi.copy.runningSlot}</span>
                        )}
                        {slotResults[index] && <SlotResultPreview result={slotResults[index]!} />}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>

          <div className="workbench-actions">
            <button type="button" className="primary" disabled={!canExecute} onClick={() => void execute()}>
              {phase === "running" ? workbenchUi.copy.executeRunning : workbenchUi.copy.execute}
            </button>
            {!canExecute && entity && (
              <p className="execute-hint">
                {queryHint ??
                  (boxes.length < workbenchUi.limits.minSlots
                    ? workbenchUi.copy.hints.minSlots
                    : workbenchUi.copy.hints.slotIncomplete)}
              </p>
            )}
          </div>
        </>
      )}

      {runError && (
        <p className="alert" role="alert">
          {runError}
        </p>
      )}

      {phase === "done" && sortedResultRows && (
        <div className="results-panel">
          <h3>{workbenchUi.copy.resultsTitle}</h3>
          <table className="summary-table">
            <thead>
              <tr>
                {workbenchUi.summaryColumns.map((c) => (
                  <th key={c.id}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedResultRows.map((row) => (
                <tr key={row.slotIndex}>
                  {workbenchUi.summaryColumns.map((col) => {
                    const cell = renderSummaryCell(col.id, {
                      displaySlotNumber: row.slotIndex + 1,
                      result: row.result,
                      bestMs,
                      empty: workbenchUi.copy.emptyCell,
                    });
                    return (
                      <td
                        key={col.id}
                        className={cell.className}
                        title={col.id === "strategy" ? row.result.strategy : undefined}
                      >
                        {cell.wrapCode ? <code>{cell.text}</code> : cell.text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {resultsNarrative.length > 0 && (
            <div className="results-narrative">
              <h4>{workbenchUi.copy.summaryNarrativeTitle}</h4>
              {resultsNarrative.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SlotResultPreview({ result }: { result: SlotApiResult }) {
  if (result.error) {
    return <p className="slot-err">{result.error}</p>;
  }
  return (
    <p className="slot-ok">
      <span className="pill">
        {result.executionTimeMs ?? workbenchUi.copy.emptyCell} ms
      </span>
      <span className="pill">{result.payloadSizeBytes} B</span>
      <span className="pill">{result.rowCount} rows</span>
    </p>
  );
}
