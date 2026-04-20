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

function buildOneCondition(
  entity: BenchEntity,
  tableAlias: string,
  c: ConditionInput,
  state: ParamState
): { ok: true; sql: string } | { ok: false; error: string } {
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
  const slot = pushParam(state, v);

  switch (c.op) {
    case "eq":
      return { ok: true, sql: `${ta}.${qc} = ${slot}` };
    case "neq":
      return { ok: true, sql: `${ta}.${qc} <> ${slot}` };
    case "gt":
      return { ok: true, sql: `${ta}.${qc} > ${slot}` };
    case "gte":
      return { ok: true, sql: `${ta}.${qc} >= ${slot}` };
    case "lt":
      return { ok: true, sql: `${ta}.${qc} < ${slot}` };
    case "lte":
      return { ok: true, sql: `${ta}.${qc} <= ${slot}` };
    case "contains": {
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
    "entityId" | "combinator" | "conditions" | "selectColumns" | "limit" | "orderBy"
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
    const built = buildOneCondition(entity, tableAlias, c, state);
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
  const sql =
    sqlParts.length === 0
      ? `SELECT ${selectList} FROM ${fromSql} ORDER BY ${order} LIMIT ${body.limit}`
      : `SELECT ${selectList} FROM ${fromSql} WHERE ${whereSql} ORDER BY ${order} LIMIT ${body.limit}`;

  const selectIds = body.selectColumns;

  const runRaw = async (qr: QueryRunner): Promise<unknown[]> => {
    const rows = (await qr.query(sql, flatParams)) as Record<string, unknown>[];
    return rows.map((r) => mapRow(entity, r, selectIds));
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
      const built = buildOneCondition(entity, alias, c, st);
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
    qb.take(body.limit);

    const rawRows = await qb.getRawMany();
    return rawRows.map((r) => mapRow(entity, { ...r } as Record<string, unknown>, selectIds));
  };

  return { entity, runRaw, runTypeorm };
}
