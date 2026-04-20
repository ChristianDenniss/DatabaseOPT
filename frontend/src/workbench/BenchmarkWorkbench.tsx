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
  filterOpLabel,
  renderSummaryCell,
  workbenchUi,
} from "./workbench.ui";
import { useColumnSamples } from "./useColumnSamples";

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

function boxIsComplete(catalog: WorkbenchCatalog | null, box: ComparisonBox): boolean {
  if (!catalog || box.approach === null) return false;
  const allowed = new Set(optimizationsForApproach(catalog, box.approach).map((o) => o.id));
  if (box.optimizationIds.length === 0) return false;
  return box.optimizationIds.every((id) => allowed.has(id));
}

function opsForColumn(catalog: WorkbenchCatalog, col: CatalogColumn | undefined): FilterOp[] {
  if (!col) return [];
  return catalog.filterOpsByKind[col.kind] ?? [];
}

function literalOk(col: CatalogColumn, op: FilterOp, value: string): boolean {
  if (op === "in") return value.trim().length > 0;
  if (col.kind === "string" && (op === "eq" || op === "neq")) return true;
  if (op === "contains" || op === "starts_with") return value.trim().length > 0;
  return value.trim().length > 0;
}

function conditionRowComplete(catalog: WorkbenchCatalog, entity: CatalogEntity, row: FilterConditionRow): boolean {
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

function queryPlanComplete(
  catalog: WorkbenchCatalog | null,
  entity: CatalogEntity | null,
  conditions: FilterConditionRow[],
  selectColumns: string[],
  limitStr: string
): boolean {
  if (!catalog || !entity) return false;
  if (selectColumns.length === 0) return false;
  const lim = Number(limitStr);
  if (!Number.isFinite(lim) || lim < 1 || lim > 500) return false;
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
  const [limitStr, setLimitStr] = useState("50");
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

  useEffect(() => {
    fetch("/api/bench/catalog")
      .then((r) => r.json())
      .then((j: WorkbenchCatalog) => {
        setCatalog(j);
        if (j.entities[0]) {
          setEntityId(j.entities[0].id);
        }
      })
      .catch(() => setCatalogError("Could not load bench catalog (is the API running on :4000?)"));
  }, []);

  useEffect(() => {
    if (!entity) return;
    setSelectColumns(defaultSelectColumns(entity));
    setConditions([]);
    setCombinator("and");
    setOrderColumn("");
    setOrderDir(
      ["posts", "comments", "post_likes", "user_follows"].includes(entity.id) ? "DESC" : "ASC"
    );
    setLimitStr("50");
    setBoxes(emptyBoxes(workbenchUi.limits.defaultSlots));
    setSlotResults([]);
    setPhase("idle");
    setRunError(null);
  }, [entity?.id]);

  const canExecute = useMemo(() => {
    if (!catalog || !entity || boxes.length < workbenchUi.limits.minSlots || phase === "running")
      return false;
    if (!queryPlanComplete(catalog, entity, conditions, selectColumns, limitStr)) return false;
    return boxes.every((b) => boxIsComplete(catalog, b));
  }, [catalog, entity, boxes, conditions, selectColumns, limitStr, phase]);

  const addCondition = useCallback(() => {
    if (!entity) return;
    const first = entity.columns.find((c) => c.filterable);
    const ops = catalog && first ? opsForColumn(catalog, first) : [];
    setConditions((prev) => [
      ...prev,
      {
        id: newId(),
        column: first?.id ?? "",
        op: ops[0] ?? "eq",
        valueMode: "literal",
        value: "",
        refColumn: "",
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
        if (patch.column != null && entity) {
          const col = entity.columns.find((c) => c.id === patch.column);
          const o = catalog && col ? opsForColumn(catalog, col) : [];
          if (!o.includes(next.op)) next.op = o[0] ?? "eq";
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
      setBoxes((prev) =>
        prev.map((b) => {
          if (b.id !== boxId) return b;
          const allowed = new Set(
            (catalog?.optimizations ?? []).filter((o) => o.approaches.includes(approach)).map((o) => o.id)
          );
          return { ...b, approach, optimizationIds: b.optimizationIds.filter((x) => allowed.has(x)) };
        })
      );
    },
    [catalog?.optimizations]
  );

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
      const lim = Math.min(500, Math.max(1, Math.floor(Number(limitStr))));
      const payload: Record<string, unknown> = {
        entityId: entity.id,
        combinator,
        conditions: conditions.map((c) => ({
          column: c.column,
          op: c.op,
          valueMode: c.valueMode,
          value: c.valueMode === "literal" ? c.value : undefined,
          refColumn: c.valueMode === "column_ref" ? c.refColumn : undefined,
        })),
        selectColumns,
        limit: lim,
        approach: box.approach,
        optimizationIds: box.optimizationIds,
      };
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

  const queryHint = useMemo(() => {
    if (!catalog || !entity) return null;
    if (selectColumns.length === 0) return workbenchUi.copy.hints.selectColumn;
    const lim = Number(limitStr);
    if (!Number.isFinite(lim) || lim < 1 || lim > 500) return workbenchUi.copy.hints.limitRange;
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
          <div className="workbench-task">
            <label className="field-label" htmlFor="wb-entity">
              1. {workbenchUi.copy.stepEntity}
            </label>
            <select
              id="wb-entity"
              className="wb-select"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
            >
              {catalog.entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
            {entity && <p className="task-desc">{entity.description}</p>}
          </div>

          {entity && (
            <>
              <div className="workbench-params">
                <h3>2. {workbenchUi.copy.stepColumns}</h3>
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
                <h3>3. {workbenchUi.copy.filtersHeading}</h3>
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
                        disabled={conditions.length === 0}
                      />
                      {workbenchUi.copy.combineAnd}
                    </label>
                    <label className="radio-pill">
                      <input
                        type="radio"
                        name="combinator"
                        checked={combinator === "or"}
                        onChange={() => setCombinator("or")}
                        disabled={conditions.length === 0}
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

              <div className="workbench-params">
                <h3>4. {workbenchUi.copy.limitSortHeading}</h3>
                <div className="params-grid">
                  <div className="field">
                    <label className="field-label" htmlFor="wb-limit">
                      {workbenchUi.copy.rowLimit}
                    </label>
                    <input
                      id="wb-limit"
                      className="wb-input"
                      type="number"
                      min={1}
                      max={500}
                      value={limitStr}
                      onChange={(e) => setLimitStr(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="wb-order-col">
                      {workbenchUi.copy.orderBy}
                    </label>
                    <select
                      id="wb-order-col"
                      className="wb-select"
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
                  </div>
                  {orderColumn && (
                    <div className="field">
                      <label className="field-label" htmlFor="wb-order-dir">
                        {workbenchUi.copy.orderDirection}
                      </label>
                      <select
                        id="wb-order-dir"
                        className="wb-select"
                        value={orderDir}
                        onChange={(e) => setOrderDir(e.target.value as "ASC" | "DESC")}
                      >
                        <option value="ASC">ASC</option>
                        <option value="DESC">DESC</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="workbench-slots">
            <div className="slots-header">
              <h3>5. {workbenchUi.copy.stepSlots}</h3>
              <button
                type="button"
                className="btn-secondary"
                onClick={addBox}
                disabled={boxes.length >= workbenchUi.limits.maxSlots}
              >
                + {workbenchUi.copy.addSlot}
              </button>
            </div>
            <p className="workbench-hint">{workbenchUi.copy.slotsHint}</p>
            {boxes.length === 0 && (
              <p className="muted small slots-empty">{workbenchUi.copy.slotsEmpty}</p>
            )}

            <div className="slots-list">
              {boxes.map((box, index) => {
                const opts = optimizationsForApproach(catalog, box.approach);
                const complete = boxIsComplete(catalog, box);
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

      {phase === "done" && slotResults.every(Boolean) && (
        <div className="summary-panel">
          <h3>{workbenchUi.copy.summaryTitle}</h3>
          <table className="summary-table">
            <thead>
              <tr>
                {workbenchUi.summaryColumns.map((c) => (
                  <th key={c.id}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slotResults.map((r, i) =>
                r ? (
                  <tr key={i}>
                    {workbenchUi.summaryColumns.map((col) => {
                      const cell = renderSummaryCell(col.id, {
                        index: i,
                        result: r,
                        bestMs,
                        empty: workbenchUi.copy.emptyCell,
                      });
                      return (
                        <td key={col.id} className={cell.className}>
                          {cell.wrapCode ? <code>{cell.text}</code> : cell.text}
                        </td>
                      );
                    })}
                  </tr>
                ) : null
              )}
            </tbody>
          </table>
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
