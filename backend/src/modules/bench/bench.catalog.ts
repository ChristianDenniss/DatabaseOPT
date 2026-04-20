export const BENCH_APPROACHES = ["typeorm", "raw_sql"] as const;
export type BenchApproach = (typeof BENCH_APPROACHES)[number];

/** Logical type for operator sets and coercion. */
export type ColumnKind = "string" | "number" | "bigint" | "timestamp" | "enum";

export type FilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "starts_with"
  | "in";

export type BenchEntityColumn = {
  /** Stable id = SQL column name (snake_case). */
  id: string;
  /** TypeORM property (camelCase). */
  property: string;
  label: string;
  kind: ColumnKind;
  /** Postgres enum name when kind is enum. */
  pgEnum?: string;
  filterable: boolean;
  /** Included in default projection when building filters in UI. */
  defaultSelected?: boolean;
};

export type BenchEntity = {
  id: "users" | "posts" | "comments" | "post_likes" | "user_follows";
  label: string;
  description: string;
  table: string;
  /** Maps to TypeORM entity for QueryBuilder. */
  typeormEntity: "User" | "Post" | "Comment" | "PostLike" | "UserFollow";
  columns: BenchEntityColumn[];
};

export const FILTER_OPS_BY_KIND: Record<ColumnKind, FilterOp[]> = {
  string: ["eq", "neq", "contains", "starts_with", "in"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "in"],
  bigint: ["eq", "neq", "gt", "gte", "lt", "lte", "in"],
  timestamp: ["eq", "neq", "gt", "gte", "lt", "lte"],
  enum: ["eq", "neq", "in"],
};

export const BENCH_ENTITIES: BenchEntity[] = [
  {
    id: "users",
    label: "Users",
    description: "Application users (accounts, profile fields).",
    table: "users",
    typeormEntity: "User",
    columns: [
      { id: "id", property: "id", label: "ID", kind: "bigint", filterable: true, defaultSelected: true },
      { id: "username", property: "username", label: "Username", kind: "string", filterable: true, defaultSelected: true },
      { id: "email", property: "email", label: "Email", kind: "string", filterable: true, defaultSelected: true },
      {
        id: "display_name",
        property: "displayName",
        label: "Display name",
        kind: "string",
        filterable: true,
        defaultSelected: true,
      },
      { id: "bio", property: "bio", label: "Bio", kind: "string", filterable: true, defaultSelected: false },
      {
        id: "avatar_url",
        property: "avatarUrl",
        label: "Avatar URL",
        kind: "string",
        filterable: true,
        defaultSelected: false,
      },
      {
        id: "created_at",
        property: "createdAt",
        label: "Created at",
        kind: "timestamp",
        filterable: true,
        defaultSelected: true,
      },
      {
        id: "updated_at",
        property: "updatedAt",
        label: "Updated at",
        kind: "timestamp",
        filterable: true,
        defaultSelected: true,
      },
    ],
  },
  {
    id: "posts",
    label: "Posts",
    description: "Posts authored by users.",
    table: "posts",
    typeormEntity: "Post",
    columns: [
      { id: "id", property: "id", label: "ID", kind: "bigint", filterable: true, defaultSelected: true },
      { id: "author_id", property: "authorId", label: "Author ID", kind: "bigint", filterable: true, defaultSelected: true },
      { id: "body", property: "body", label: "Body", kind: "string", filterable: true, defaultSelected: true },
      {
        id: "repost_of_post_id",
        property: "repostOfPostId",
        label: "Repost of post ID",
        kind: "bigint",
        filterable: true,
        defaultSelected: false,
      },
      {
        id: "visibility",
        property: "visibility",
        label: "Visibility",
        kind: "enum",
        pgEnum: "post_visibility",
        filterable: true,
        defaultSelected: true,
      },
      {
        id: "created_at",
        property: "createdAt",
        label: "Created at",
        kind: "timestamp",
        filterable: true,
        defaultSelected: true,
      },
      {
        id: "updated_at",
        property: "updatedAt",
        label: "Updated at",
        kind: "timestamp",
        filterable: true,
        defaultSelected: true,
      },
    ],
  },
  {
    id: "comments",
    label: "Comments",
    description: "Comments on posts (threaded via optional parent).",
    table: "comments",
    typeormEntity: "Comment",
    columns: [
      { id: "id", property: "id", label: "ID", kind: "bigint", filterable: true, defaultSelected: true },
      { id: "post_id", property: "postId", label: "Post ID", kind: "bigint", filterable: true, defaultSelected: true },
      { id: "author_id", property: "authorId", label: "Author ID", kind: "bigint", filterable: true, defaultSelected: true },
      {
        id: "parent_comment_id",
        property: "parentCommentId",
        label: "Parent comment ID",
        kind: "bigint",
        filterable: true,
        defaultSelected: false,
      },
      { id: "body", property: "body", label: "Body", kind: "string", filterable: true, defaultSelected: true },
      {
        id: "created_at",
        property: "createdAt",
        label: "Created at",
        kind: "timestamp",
        filterable: true,
        defaultSelected: true,
      },
    ],
  },
  {
    id: "post_likes",
    label: "Post likes",
    description: "Who liked which post (join table).",
    table: "post_likes",
    typeormEntity: "PostLike",
    columns: [
      { id: "user_id", property: "userId", label: "User ID", kind: "bigint", filterable: true, defaultSelected: true },
      { id: "post_id", property: "postId", label: "Post ID", kind: "bigint", filterable: true, defaultSelected: true },
      {
        id: "created_at",
        property: "createdAt",
        label: "Liked at",
        kind: "timestamp",
        filterable: true,
        defaultSelected: true,
      },
    ],
  },
  {
    id: "user_follows",
    label: "Follows",
    description: "Follower → following relationships.",
    table: "user_follows",
    typeormEntity: "UserFollow",
    columns: [
      { id: "follower_id", property: "followerId", label: "Follower ID", kind: "bigint", filterable: true, defaultSelected: true },
      { id: "following_id", property: "followingId", label: "Following ID", kind: "bigint", filterable: true, defaultSelected: true },
      {
        id: "created_at",
        property: "createdAt",
        label: "Followed at",
        kind: "timestamp",
        filterable: true,
        defaultSelected: true,
      },
    ],
  },
];

export const BENCH_GLOBAL_OPTIMIZATIONS: {
  id: string;
  label: string;
  approaches: BenchApproach[];
}[] = [
  {
    id: "baseline",
    label: "B-tree baseline (default plans, ILIKE substring search where used)",
    approaches: ["typeorm", "raw_sql"],
  },
  {
    id: "fts_runtime",
    label: "FTS runtime (to_tsvector at query time)",
    approaches: ["typeorm", "raw_sql"],
  },
  {
    id: "fts_stored_scan",
    label: "FTS stored vector, heap-friendly (raw SQL: disables index/bitmap scans for this query)",
    approaches: ["raw_sql"],
  },
  {
    id: "fts_gin",
    label: "FTS (GIN on stored tsvector)",
    approaches: ["typeorm", "raw_sql"],
  },
  {
    id: "fts_gist",
    label: "FTS (GiST on stored tsvector)",
    approaches: ["typeorm", "raw_sql"],
  },
  {
    id: "trgm_gin",
    label: "Substring search (pg_trgm GIN on text)",
    approaches: ["typeorm", "raw_sql"],
  },
  {
    id: "hash_pk",
    label: "Hash index on PK (equality on id — planner may use hash)",
    approaches: ["typeorm", "raw_sql"],
  },
  {
    id: "composite_author_time",
    label: "Composite B-tree (posts: author_id + created_at — use both in filters)",
    approaches: ["typeorm", "raw_sql"],
  },
  {
    id: "partial_public_posts",
    label: "Partial B-tree (posts public rows by created_at)",
    approaches: ["typeorm", "raw_sql"],
  },
  {
    id: "covering_author_posts",
    label: "Covering B-tree (posts author_id INCLUDE body, visibility, created_at)",
    approaches: ["typeorm", "raw_sql"],
  },
];

const FTS_STORED_VECTOR_KEYS = new Set<string>(["posts:body", "comments:body", "users:bio"]);

/** True when `fts_gin` + contains on this column should use the stored `search_vector` + GIN. */
export function ftsGinUsesStoredSearchVector(entityId: BenchEntity["id"], columnId: string): boolean {
  return FTS_STORED_VECTOR_KEYS.has(`${entityId}:${columnId}`);
}

/** True when `fts_gist` + contains should use stored `search_vector` + GiST. */
export function ftsGistUsesStoredSearchVector(entityId: BenchEntity["id"], columnId: string): boolean {
  return FTS_STORED_VECTOR_KEYS.has(`${entityId}:${columnId}`);
}

/** True when `trgm_gin` applies to this text column (ILIKE / substring workloads). */
export function trgmGinUsesTextColumn(entityId: BenchEntity["id"], columnId: string): boolean {
  return FTS_STORED_VECTOR_KEYS.has(`${entityId}:${columnId}`);
}

export function getBenchEntity(id: string): BenchEntity | undefined {
  return BENCH_ENTITIES.find((e) => e.id === id);
}

export function getColumn(entity: BenchEntity, columnId: string): BenchEntityColumn | undefined {
  return entity.columns.find((c) => c.id === columnId);
}
