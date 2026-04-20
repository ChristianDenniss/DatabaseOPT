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

const columnConditionSchema = z.object({
  kind: z.literal("column"),
  column: z.string().min(1),
  op: filterOpSchema,
  valueMode: z.enum(["literal", "column_ref"]),
  value: z.unknown().optional(),
  refColumn: z.string().optional(),
});

const userPostsCountWindowConditionSchema = z.object({
  kind: z.literal("user_posts_count_window"),
  windowFrom: z.string().min(1),
  windowTo: z.string().min(1),
  minCount: z.number().int().min(0).optional(),
  maxCount: z.number().int().min(0).optional(),
});

const userPostsContainsWindowConditionSchema = z.object({
  kind: z.literal("user_posts_contains_window"),
  windowFrom: z.string().min(1),
  windowTo: z.string().min(1),
  minCount: z.number().int().min(0).optional(),
  maxCount: z.number().int().min(0).optional(),
  keyword: z.string().min(1),
});

export const conditionSchema = z.discriminatedUnion("kind", [
  columnConditionSchema,
  userPostsCountWindowConditionSchema,
  userPostsContainsWindowConditionSchema,
]);

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
