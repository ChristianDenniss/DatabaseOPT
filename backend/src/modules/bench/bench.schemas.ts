import { z } from "zod";
import { BENCH_APPROACHES } from "./bench.catalog.js";

export const filterOpSchema = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "starts_with",
  "in",
]);

export const conditionSchema = z.object({
  column: z.string().min(1),
  op: filterOpSchema,
  valueMode: z.enum(["literal", "column_ref"]),
  value: z.unknown().optional(),
  refColumn: z.string().optional(),
});

export const executeSlotBodySchema = z.object({
  entityId: z.enum(["users", "posts", "comments", "post_likes", "user_follows"]),
  combinator: z.enum(["and", "or"]),
  conditions: z.array(conditionSchema),
  /** Whitelisted column ids to return (subset of entity columns). */
  selectColumns: z.array(z.string().min(1)).min(1).max(32),
  /** Omit or leave unset for no row cap (all matching rows). */
  limit: z.number().int().min(1).max(500).optional(),
  orderBy: z
    .object({
      column: z.string().min(1),
      direction: z.enum(["ASC", "DESC"]),
    })
    .optional(),
  approach: z.enum(BENCH_APPROACHES),
  optimizationIds: z.array(z.string().min(1)).min(1),
});

export type ExecuteSlotBody = z.infer<typeof executeSlotBodySchema>;
export type ConditionInput = z.infer<typeof conditionSchema>;
