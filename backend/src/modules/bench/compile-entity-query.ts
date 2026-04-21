import { Brackets } from "typeorm";
import type { QueryRunner } from "typeorm";
import { Comment } from "../comment/comment.entity.js";
import { UserFollow } from "../follow/user-follow.entity.js";
import { PostLike } from "../likes/post-like.entity.js";
import { PostVisibility } from "../post/post-visibility.enum.js";
import { Post } from "../post/post.entity.js";
import { User } from "../user/user.entity.js";
import type { ExecuteSlotBody } from "./bench.schemas.js";
import type { ConditionInput } from "./bench.schemas.js";
import {
  FILTER_OPS_BY_KIND,
  ftsGinUsesStoredSearchVector,
  ftsGistUsesStoredSearchVector,
  trgmGinUsesTextColumn,
  type BenchEntity,
  type BenchEntityColumn,
  type FilterOp,
  getBenchEntity,
  getColumn,
} from "./bench.catalog.js";

const PG_IDENT = /^[a-z_][a-z0-9_]*$/;

function quoteIdent(id: string): string {
  if (!PG_IDENT.test(id)) throw new Error(`Invalid identifier: ${id}`);
  return `"${id}"`;
}

function assertOpAllowed(col: BenchEntityColumn, op: FilterOp): string | null {
  const allowed = FILTER_OPS_BY_KIND[col.kind];
  if (!allowed.includes(op)) return `Operator "${op}" is not allowed for column "${col.id}" (${col.kind})`;
  return null;
}

function parseLiteral(col: BenchEntityColumn, op: FilterOp, raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (op === "in") {
    const s = raw === undefined || raw === null ? "" : String(raw).trim();
    if (s === "") return { ok: false, error: `Value required for IN on ${col.id}` };
    const parts = s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (parts.length === 0) return { ok: false, error: "IN list is empty" };
    if (col.kind === "bigint" || col.kind === "number") {
      return { ok: true, value: parts.map((p) => (col.kind === "bigint" ? p : Number(p))) };
    }
    if (col.kind === "enum" && col.id === "visibility") {
      for (const p of parts) {
        if (!Object.values(PostVisibility).includes(p as PostVisibility)) {
          return { ok: false, error: `Invalid visibility: ${p}` };
        }
      }
      return { ok: true, value: parts };
    }
    return { ok: true, value: parts };
  }

  if (raw === undefined || raw === null) {
    return { ok: false, error: `Value required for ${col.id}` };
  }

  if (col.kind === "string") {
    return { ok: true, value: String(raw) };
  }
  if (col.kind === "number") {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return { ok: false, error: `Invalid number for ${col.id}` };
    return { ok: true, value: n };
  }
  if (col.kind === "bigint") {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) return { ok: false, error: `Invalid bigint for ${col.id}` };
    return { ok: true, value: s };
  }
  if (col.kind === "timestamp") {
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) return { ok: false, error: `Invalid timestamp for ${col.id}` };
    return { ok: true, value: d };
  }
  if (col.kind === "enum") {
    const s = String(raw);
    if (!Object.values(PostVisibility).includes(s as PostVisibility)) {
      return { ok: false, error: `Invalid enum for ${col.id}` };
    }
    return { ok: true, value: s };
  }
  return { ok: false, error: "Unsupported column kind" };
}

type ParamState = { params: unknown[] };

function createParamState(): ParamState {
  return { params: [] };
}

function pushParam(state: ParamState, value: unknown): string {
  state.params.push(value);
  return `$${state.params.length}`;
}

/**
 * How to evaluate string `contains` when text-search optimizations are selected.
 * Priority: GIN tsvector → GiST tsvector → stored @@ heap run → runtime tsvector → pg_trgm (ILIKE) → default ILIKE.
 */
function ftsContainsMode(
  entity: BenchEntity,
  columnId: string,
  colKind: BenchEntityColumn["kind"],
  op: FilterOp,
  optimizationIds: readonly string[]
): "gin" | "gist" | "stored_scan" | "runtime" | "trgm" | "none" {
  if (op !== "contains" || colKind !== "string") return "none";
  const ids = new Set(optimizationIds);
  const wantsFts =
    ids.has("fts_runtime") || ids.has("fts_gin") || ids.has("fts_gist") || ids.has("fts_stored_scan");
  const wantsTrgm = ids.has("trgm_gin");
  if (!wantsFts && !wantsTrgm) return "none";
  if (ids.has("fts_gin") && ftsGinUsesStoredSearchVector(entity.id, columnId)) return "gin";
  if (ids.has("fts_gist") && ftsGistUsesStoredSearchVector(entity.id, columnId)) return "gist";
  if (ids.has("fts_stored_scan") && ftsGinUsesStoredSearchVector(entity.id, columnId)) return "stored_scan";
  if (ids.has("fts_runtime")) return "runtime";
  if (wantsTrgm && trgmGinUsesTextColumn(entity.id, columnId)) return "trgm";
  return "none";
}

/** Wrap raw SELECT in a short transaction with SET LOCAL so index/bitmap scans are discouraged (stored @@ vs index benefit for fts_stored_scan). */
function shouldApplyFtsStoredScanPragma(
  entity: BenchEntity,
  conditions: Pick<ExecuteSlotBody, "conditions">["conditions"],
  optimizationIds: readonly string[]
): boolean {
  if (!optimizationIds.includes("fts_stored_scan")) return false;
  return conditions.some((c) => {
    if (c.kind !== "column" || c.op !== "contains" || c.valueMode !== "literal") return false;
    if (c.value === undefined || c.value === null || String(c.value).trim() === "") return false;
    return ftsGinUsesStoredSearchVector(entity.id, c.column);
  });
}

function parseWindowBounds(windowFrom: string, windowTo: string): { ok: true; from: Date; to: Date } | { ok: false; error: string } {
  const from = new Date(windowFrom);
  const to = new Date(windowTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { ok: false, error: "Invalid time window: windowFrom and windowTo must be valid timestamps" };
  }
  if (from > to) {
    return { ok: false, error: "Invalid time window: windowFrom must be <= windowTo" };
  }
  return { ok: true, from, to };
}

function buildUserPostsWindowCondition(
  entity: BenchEntity,
  tableAlias: string,
  state: ParamState,
  args: {
    windowFrom: string;
    windowTo: string;
    minCount?: number;
    maxCount?: number;
    keyword?: string;
  }
): { ok: true; sql: string } | { ok: false; error: string } {
  if (entity.id !== "users") {
    return { ok: false, error: "User posts window filters are only valid for the users dataset" };
  }
  const bounds = parseWindowBounds(args.windowFrom, args.windowTo);
  if (!bounds.ok) return bounds;

  const hasMin = typeof args.minCount === "number";
  const hasMax = typeof args.maxCount === "number";
  if (!hasMin && !hasMax) {
    return { ok: false, error: "At least one of minCount or maxCount is required" };
  }
  if (hasMin && hasMax && (args.minCount as number) > (args.maxCount as number)) {
    return { ok: false, error: "minCount cannot be greater than maxCount" };
  }

  const fromSlot = pushParam(state, bounds.from);
  const toSlot = pushParam(state, bounds.to);
  const whereParts = [
    `p.author_id = ${tableAlias}.id`,
    `p.created_at >= ${fromSlot}`,
    `p.created_at <= ${toSlot}`,
  ];
  if (args.keyword != null) {
    const escaped = String(args.keyword).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    whereParts.push(`p.body ILIKE ${pushParam(state, `%${escaped}%`)} ESCAPE '\\'`);
  }
  const countSql = `(SELECT COUNT(*) FROM "posts" AS p WHERE ${whereParts.join(" AND ")})`;
  if (hasMin && hasMax) {
    return {
      ok: true,
      sql: `${countSql} BETWEEN ${pushParam(state, args.minCount)} AND ${pushParam(state, args.maxCount)}`,
    };
  }
  if (hasMin) {
    return { ok: true, sql: `${countSql} >= ${pushParam(state, args.minCount)}` };
  }
  return { ok: true, sql: `${countSql} <= ${pushParam(state, args.maxCount)}` };
}

function buildOneCondition(
  entity: BenchEntity,
  tableAlias: string,
  c: ConditionInput,
  state: ParamState,
  optimizationIds: readonly string[]
): { ok: true; sql: string } | { ok: false; error: string } {
  if (c.kind === "user_posts_count_window") {
    return buildUserPostsWindowCondition(entity, tableAlias, state, {
      windowFrom: c.windowFrom,
      windowTo: c.windowTo,
      minCount: c.minCount,
      maxCount: c.maxCount,
    });
  }
  if (c.kind === "user_posts_contains_window") {
    return buildUserPostsWindowCondition(entity, tableAlias, state, {
      windowFrom: c.windowFrom,
      windowTo: c.windowTo,
      minCount: c.minCount,
      maxCount: c.maxCount,
      keyword: c.keyword,
    });
  }

  const col = getColumn(entity, c.column);
  if (!col || !col.filterable) return { ok: false, error: `Unknown or non-filterable column: ${c.column}` };
  const opErr = assertOpAllowed(col, c.op);
  if (opErr) return { ok: false, error: opErr };

  const qc = quoteIdent(col.id);
  const ta = tableAlias;

  if (c.valueMode === "column_ref") {
    const ref = c.refColumn ? getColumn(entity, c.refColumn) : undefined;
    if (!ref || !ref.filterable) return { ok: false, error: `Unknown ref column: ${c.refColumn}` };
    if (ref.id === col.id) return { ok: false, error: "refColumn must differ from column" };
    if (ref.kind !== col.kind) {
      return { ok: false, error: `Column ref kinds must match (${col.kind} vs ${ref.kind})` };
    }
    const qr = quoteIdent(ref.id);
    const map: Record<FilterOp, string | undefined> = {
      eq: `${ta}.${qc} = ${ta}.${qr}`,
      neq: `${ta}.${qc} <> ${ta}.${qr}`,
      gt: `${ta}.${qc} > ${ta}.${qr}`,
      gte: `${ta}.${qc} >= ${ta}.${qr}`,
      lt: `${ta}.${qc} < ${ta}.${qr}`,
      lte: `${ta}.${qc} <= ${ta}.${qr}`,
      contains: undefined,
      starts_with: undefined,
      in: undefined,
    };
    const sql = map[c.op];
    if (!sql) return { ok: false, error: `Operator "${c.op}" is not supported for column-to-column comparison` };
    return { ok: true, sql };
  }

  const parsed = parseLiteral(col, c.op, c.value);
  if (!parsed.ok) return parsed;

  if (c.op === "in") {
    const vals = parsed.value as unknown[];
    const slots = vals.map((v) => pushParam(state, v));
    return { ok: true, sql: `${ta}.${qc} IN (${slots.join(", ")})` };
  }

  const v = parsed.value;

  switch (c.op) {
    case "eq":
      return { ok: true, sql: `${ta}.${qc} = ${pushParam(state, v)}` };
    case "neq":
      return { ok: true, sql: `${ta}.${qc} <> ${pushParam(state, v)}` };
    case "gt":
      return { ok: true, sql: `${ta}.${qc} > ${pushParam(state, v)}` };
    case "gte":
      return { ok: true, sql: `${ta}.${qc} >= ${pushParam(state, v)}` };
    case "lt":
      return { ok: true, sql: `${ta}.${qc} < ${pushParam(state, v)}` };
    case "lte":
      return { ok: true, sql: `${ta}.${qc} <= ${pushParam(state, v)}` };
    case "contains": {
      const fts = ftsContainsMode(entity, col.id, col.kind, c.op, optimizationIds);
      if (fts === "gin" || fts === "gist" || fts === "stored_scan") {
        return {
          ok: true,
          sql: `${ta}.${quoteIdent("search_vector")} @@ plainto_tsquery('english', ${pushParam(state, String(v))})`,
        };
      }
      if (fts === "runtime") {
        return {
          ok: true,
          sql: `to_tsvector('english', ${ta}.${qc}) @@ plainto_tsquery('english', ${pushParam(state, String(v))})`,
        };
      }
      const escaped = String(v).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
      const s = pushParam(state, `%${escaped}%`);
      return { ok: true, sql: `${ta}.${qc} ILIKE ${s} ESCAPE '\\'` };
    }
    case "starts_with": {
      const escaped = String(v).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
      const s = pushParam(state, `${escaped}%`);
      return { ok: true, sql: `${ta}.${qc} ILIKE ${s} ESCAPE '\\'` };
    }
    default:
      return { ok: false, error: `Unsupported op ${c.op}` };
  }
}

function validateSelectAndOrder(
  entity: BenchEntity,
  selectColumns: string[],
  orderBy?: { column: string; direction: "ASC" | "DESC" }
): string | null {
  for (const id of selectColumns) {
    if (!getColumn(entity, id)) return `Unknown select column: ${id}`;
  }
  if (orderBy) {
    if (!getColumn(entity, orderBy.column)) return `Unknown orderBy column: ${orderBy.column}`;
  }
  return null;
}

function mapRow(entity: BenchEntity, row: Record<string, unknown>, selectIds: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const id of selectIds) {
    const col = getColumn(entity, id);
    if (!col) continue;
    const v = row[id] ?? row[col.property];
    out[col.property] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

/** Default ORDER BY when the client does not specify one. */
function defaultOrder(entity: BenchEntity): { column: string; direction: "ASC" | "DESC" } {
  if (entity.id === "posts" || entity.id === "comments" || entity.id === "post_likes" || entity.id === "user_follows") {
    return { column: "created_at", direction: "DESC" };
  }
  return { column: "id", direction: "ASC" };
}

const typeormEntityClass = {
  User,
  Post,
  Comment,
  PostLike,
  UserFollow,
} as const;

export function compileEntityQuery(
  body: Pick<
    ExecuteSlotBody,
    "entityId" | "combinator" | "conditions" | "selectColumns" | "limit" | "orderBy" | "optimizationIds"
  >
): { error: string } | { entity: BenchEntity; runRaw: (qr: QueryRunner) => Promise<unknown[]>; runTypeorm: (qr: QueryRunner) => Promise<unknown[]> } {
  const entity = getBenchEntity(body.entityId);
  if (!entity) return { error: "Unknown entity" };

  const selErr = validateSelectAndOrder(entity, body.selectColumns, body.orderBy);
  if (selErr) return { error: selErr };

  const tableAlias = "e";
  const selectList = body.selectColumns
    .map((id) => `${tableAlias}.${quoteIdent(id)} AS ${quoteIdent(id)}`)
    .join(", ");

  const state = createParamState();
  const sqlParts: string[] = [];
  for (const c of body.conditions) {
    const built = buildOneCondition(entity, tableAlias, c, state, body.optimizationIds);
    if (!built.ok) return { error: built.error };
    sqlParts.push(`(${built.sql})`);
  }

  const comb = body.combinator === "or" ? " OR " : " AND ";
  const whereSql = sqlParts.length === 0 ? "" : sqlParts.join(comb);
  const flatParams = state.params;

  const defOrder = defaultOrder(entity);
  const order =
    body.orderBy != null
      ? `${tableAlias}.${quoteIdent(body.orderBy.column)} ${body.orderBy.direction}`
      : `${tableAlias}.${quoteIdent(defOrder.column)} ${defOrder.direction}`;

  const fromSql = `${quoteIdent(entity.table)} AS ${tableAlias}`;
  const limitSql = body.limit != null ? ` LIMIT ${body.limit}` : "";
  const sql =
    sqlParts.length === 0
      ? `SELECT ${selectList} FROM ${fromSql} ORDER BY ${order}${limitSql}`
      : `SELECT ${selectList} FROM ${fromSql} WHERE ${whereSql} ORDER BY ${order}${limitSql}`;

  const selectIds = body.selectColumns;

  const runRaw = async (qr: QueryRunner): Promise<unknown[]> => {
    const usePragma = shouldApplyFtsStoredScanPragma(entity, body.conditions, body.optimizationIds);
    if (!usePragma) {
      const rows = (await qr.query(sql, flatParams)) as Record<string, unknown>[];
      return rows.map((r) => mapRow(entity, r, selectIds));
    }
    // SET LOCAL must run inside a transaction; use separate statements so the driver does not
    // send BEGIN/SET/SELECT/COMMIT as one prepared multi-command string (node-pg rejects that).
    await qr.startTransaction();
    try {
      await qr.query(`SET LOCAL enable_indexscan = off`);
      await qr.query(`SET LOCAL enable_bitmapscan = off`);
      const rows = (await qr.query(sql, flatParams)) as Record<string, unknown>[];
      await qr.commitTransaction();
      return rows.map((r) => mapRow(entity, r, selectIds));
    } catch (e) {
      try {
        await qr.rollbackTransaction();
      } catch {
        /* ignore rollback errors */
      }
      throw e;
    }
  };

  const runTypeorm = async (qr: QueryRunner): Promise<unknown[]> => {
    const EntityClass = typeormEntityClass[entity.typeormEntity];
    const alias = "e";
    const qb = qr.manager.createQueryBuilder(EntityClass, alias);
    const firstId = selectIds[0]!;
    const firstCol = getColumn(entity, firstId)!;
    qb.select(`${alias}.${firstCol.property}`, firstId);
    for (let i = 1; i < selectIds.length; i++) {
      const id = selectIds[i]!;
      const col = getColumn(entity, id)!;
      qb.addSelect(`${alias}.${col.property}`, id);
    }

    let named = 0;
    const nextName = () => `c${named++}`;

    const fragments: { sql: string; params: Record<string, unknown> }[] = [];
    for (const c of body.conditions) {
      const st = createParamState();
      const built = buildOneCondition(entity, alias, c, st, body.optimizationIds);
      if (!built.ok) throw new Error(built.error);
      const params: Record<string, unknown> = {};
      let sqlFrag = built.sql;
      for (let i = 0; i < st.params.length; i++) {
        const nm = nextName();
        sqlFrag = sqlFrag.replace(new RegExp(`\\$${i + 1}\\b`, "g"), `:${nm}`);
        params[nm] = st.params[i];
      }
      fragments.push({ sql: sqlFrag, params });
    }

    if (fragments.length > 0) {
      if (body.combinator === "and") {
        for (const f of fragments) {
          qb.andWhere(f.sql, f.params);
        }
      } else {
        qb.andWhere(
          new Brackets((w) => {
            fragments.forEach((f, i) => {
              if (i === 0) w.where(f.sql, f.params);
              else w.orWhere(f.sql, f.params);
            });
          })
        );
      }
    }

    const obCol = body.orderBy?.column ?? defOrder.column;
    const obProp = getColumn(entity, obCol)!.property;
    const obDir = body.orderBy?.direction ?? defOrder.direction;
    qb.orderBy(`${alias}.${obProp}`, obDir);
    if (body.limit != null) {
      qb.take(body.limit);
    }

    const rawRows = await qb.getRawMany();
    return rawRows.map((r) => mapRow(entity, { ...r } as Record<string, unknown>, selectIds));
  };

  return { entity, runRaw, runTypeorm };
}
