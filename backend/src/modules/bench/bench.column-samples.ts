import { AppDataSource } from "../../data-source.js";
import { getBenchEntity, getColumn, type BenchEntityColumn } from "./bench.catalog.js";

const MAX_SAMPLES = 100;
const MAX_STRING_LEN = 120;

function quotePgIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error("Invalid identifier");
  }
  return `"${name.replace(/"/g, '""')}"`;
}

function truncateCell(v: string, col: BenchEntityColumn): string {
  if (col.kind !== "string") return v;
  if (v.length <= MAX_STRING_LEN) return v;
  return `${v.slice(0, MAX_STRING_LEN - 1)}…`;
}

async function enumLabelsFromPg(typname: string): Promise<string[]> {
  if (!/^[a-z_][a-z0-9_]*$/i.test(typname)) return [];
  const rows: { v: string }[] = await AppDataSource.query(
    `SELECT e.enumlabel AS v
     FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE t.typname = $1 AND n.nspname = current_schema()
     ORDER BY e.enumsortorder`,
    [typname]
  );
  return rows.map((r) => r.v).filter(Boolean);
}

export async function getColumnSampleValues(
  entityId: string,
  columnId: string
): Promise<{ ok: true; values: string[] } | { ok: false; error: string }> {
  const entity = getBenchEntity(entityId);
  if (!entity) return { ok: false, error: "Unknown entity" };
  const col = getColumn(entity, columnId);
  if (!col?.filterable) return { ok: false, error: "Unknown or non-filterable column" };

  const qTable = quotePgIdent(entity.table);
  const qCol = quotePgIdent(col.id);

  try {
    const rows: { v: string | null }[] = await AppDataSource.query(
      `SELECT DISTINCT ${qCol}::text AS v
       FROM ${qTable}
       WHERE ${qCol} IS NOT NULL
       ORDER BY 1
       LIMIT ${MAX_SAMPLES}`
    );

    const values = rows
      .map((r) => (r.v == null ? "" : truncateCell(String(r.v), col)))
      .filter((v) => v.length > 0);

    if (values.length === 0 && col.kind === "enum" && col.pgEnum) {
      const enums = await enumLabelsFromPg(col.pgEnum);
      return { ok: true, values: enums };
    }

    return { ok: true, values };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}
