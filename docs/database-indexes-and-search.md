# Database indexes and search-related objects

DDL: [`backend/docker/postgres-init/01-schema.sql`](../backend/docker/postgres-init/01-schema.sql) · migration [`1740800000000-BenchIndexTypes.ts`](../backend/src/migrations/1740800000000-BenchIndexTypes.ts) · bench SQL: [`compile-entity-query.ts`](../backend/src/modules/bench/compile-entity-query.ts).

---

## Workbench text-search modes (optimization ids)

These ids are **bench labels** for how `contains` is compiled on **`posts.body`**, **`comments.body`**, and **`users.bio`** (other string columns stay on **`ILIKE`** unless you pick an FTS path that falls back to runtime `to_tsvector`).

| Mode | Meaning |
| --- | --- |
| **`baseline`** | Raw text; default plans, **`ILIKE '%…%'`** for `contains`. |
| **`fts_runtime`** | `to_tsvector('english', <text_col>) @@ plainto_tsquery(...)` at query time. |
| **`fts_stored_scan`** | Stored **`search_vector @@ plainto_tsquery(...)`** (same predicate shape as GIN/GiST); **raw SQL** runs inside **`SET LOCAL enable_indexscan = off`** / **`enable_bitmapscan = off`** so the run is biased toward evaluating the stored vector **without** those index scan types (not a hard guarantee on every planner version). |
| **`fts_gin`** | Same stored **`@@`** predicate; planner may use **GIN** on `search_vector`. |
| **`fts_gist`** | Same stored **`@@`** predicate; planner may use **GiST** on `search_vector`. |
| **`trgm_gin`** | Still **`ILIKE`**; **`pg_trgm`** GIN on the text column may apply. |

---

## B-tree index

PostgreSQL’s default index access method. **Used for** equality (`=`), inequality (`<`, `>`, `<=`, `>=`), range scans, `IN`, sorting, and many joins. **`PRIMARY KEY`** and **`UNIQUE`** constraints build a **b-tree unique** index automatically (same family). **Partial** indexes (a `WHERE` on the index definition) and **covering** indexes (`INCLUDE` extra columns) are still b-tree underneath.

Below, **each numbered block is one table**; under it, every b-tree object on that table (implicit PK first, then named indexes).

### 1. `users`

- **`users_pkey`** (implicit) — btree on `id`. **Used for** row lookup and FK targets. **Workbench:** `id` filters; compare **`baseline`** vs **`baseline` + `hash_pk`** for hash index (recipe `lookup_pk`).
- **`uq_users_username`** — `CREATE UNIQUE INDEX … ON users (username)`. **Used for** unique username. **Workbench:** `username` filters (`eq` / `neq` / etc.).
- **`uq_users_email`** — `CREATE UNIQUE INDEX … ON users (email)`. **Used for** unique email. **Workbench:** `email` filters.
- **`idx_users_created_at`** — `users(created_at)`. **Used for** signup time range / sort. **Workbench:** `created_at` range filters on **users**.

### 2. `posts`

- **`posts_pkey`** (implicit) — btree on `id`. **Workbench:** `id` filters; with **`hash_pk`** option vs **`baseline`** (recipe `lookup_pk`).
- **`idx_posts_author_created`** — `(author_id, created_at DESC)`. **Used for** author feeds with time ordering. **Workbench:** **`composite_author_time`** when `author_id` = literal and `created_at` uses `>` / `>=` / `<` / `<=`; recipe `range_composite`.
- **`idx_posts_created_at`** — `(created_at)`. **Used for** global time windows. **Workbench:** `created_at` filters on **posts**.
- **`idx_posts_repost`** — `(repost_of_post_id)`. **Used for** repost chains. **Workbench:** `repost_of_post_id` filters.
- **`idx_posts_public_created_at`** — partial btree on `(created_at DESC) WHERE visibility = 'public'::post_visibility`. **Used for** time scans on **public** rows only. **Workbench:** **`partial_public_posts`** + recipe `partial_public`.
- **`idx_posts_author_covering`** — btree on `(author_id) INCLUDE (body, visibility, created_at)`. **Used for** `author_id` equality with narrow selects. **Workbench:** **`covering_author_posts`** + recipe `covering_author`.

### 3. `comments`

- **`comments_pkey`** (implicit) — btree on `id`. **Workbench:** `id` filters.
- **`idx_comments_post_created`** — `(post_id, created_at)`. **Used for** comments on a post in time order. **Workbench:** `post_id` / `created_at` filters.
- **`idx_comments_author`** — `(author_id)`. **Used for** comments by author. **Workbench:** `author_id` filters.
- **`idx_comments_parent`** — `(parent_comment_id)`. **Used for** threads. **Workbench:** `parent_comment_id` filters.

### 4. `user_follows`

- **`user_follows_pkey`** (implicit) — btree on `(follower_id, following_id)`. **Workbench:** composite-key filters on **user_follows**.
- **`idx_follows_following`** — `(following_id)`. **Used for** “who follows this user?” reverse lookups. **Workbench:** `following_id` filters.

### 5. `post_likes`

- **`post_likes_pkey`** (implicit) — btree on `(user_id, post_id)`. **Workbench:** filters on **post_likes** PK columns.
- **`idx_post_likes_post`** — `(post_id)`. **Used for** likes per post. **Workbench:** `post_id` filters.

### 6. `comment_likes`

- **`comment_likes_pkey`** (implicit) — btree on `(user_id, comment_id)`. **Workbench:** PK filters.
- **`idx_comment_likes_comment`** — `(comment_id)`. **Used for** likes per comment. **Workbench:** `comment_id` filters.

### 7. `hashtags`

- **`hashtags_pkey`** (implicit) — btree on `id`. **Workbench:** `id` filters (dataset not in current bench catalog — listed for schema completeness).
- **`uq_hashtags_tag`** — `CREATE UNIQUE INDEX … ON hashtags (tag)`. **Used for** unique tag string.

### 8. `post_hashtags`

- **`post_hashtags_pkey`** (implicit) — btree on `(post_id, hashtag_id)`. **Workbench:** PK-style filters if this table is queried.
- **`idx_post_hashtags_hashtag`** — `(hashtag_id)`. **Used for** posts by hashtag. **Workbench:** `hashtag_id` filters.

### 9. `user_saved_posts`

- **`user_saved_posts_pkey`** (implicit) — btree on `(user_id, post_id)`. **Workbench:** PK filters.
- **`idx_saved_post`** — `(post_id)`. **Used for** saves per post. **Workbench:** `post_id` filters.

### 10. `conversations`

- **`conversations_pkey`** (implicit) — btree on `id`. **Workbench:** `id` filters (table not in current bench catalog — schema completeness).

### 11. `conversation_members`

- **`conversation_members_pkey`** (implicit) — btree on `(conversation_id, user_id)`. **Workbench:** PK filters.
- **`idx_cm_user`** — `(user_id)`. **Used for** memberships by user. **Workbench:** `user_id` filters.

### 12. `messages`

- **`messages_pkey`** (implicit) — btree on `id`. **Workbench:** `id` filters.
- **`idx_messages_conv_created`** — `(conversation_id, created_at)`. **Used for** conversation history. **Workbench:** `conversation_id` / `created_at` filters.
- **`idx_messages_sender`** — `(sender_id)`. **Used for** messages by sender. **Workbench:** `sender_id` filters.

### 13. `notifications`

- **`notifications_pkey`** (implicit) — btree on `id`. **Workbench:** `id` filters.
- **`idx_notif_user_unread`** — `(user_id, read_at, created_at)`. **Used for** inbox-style queries. **Workbench:** filters on those columns.
- **`idx_notif_actor`** — `(actor_id)`. **Used for** notifications by actor. **Workbench:** `actor_id` filters.

---

## GIN index (tsvector)

**Used for** full-text predicates on **`tsvector`** (e.g. `search_vector @@ plainto_tsquery(...)`). One index per table that has a stored **`search_vector`**.

### 1. `posts`

- **`idx_posts_search_vector`** — `USING gin (search_vector)`. **Workbench:** **`fts_gin`** + literal **`contains`** on **`posts.body`** → `search_vector @@ plainto_tsquery('english', …)` in `compile-entity-query.ts`. Contrast **`fts_stored_scan`** (same SQL, heap-biased session) to separate **index benefit** from **stored preprocessing**.

### 2. `comments`

- **`idx_comments_search_vector`** — `USING gin (search_vector)`. **Workbench:** **`fts_gin`** + **`contains`** on **`comments.body`**.

### 3. `users`

- **`idx_users_search_vector`** — `USING gin (search_vector)`. **Workbench:** **`fts_gin`** + **`contains`** on **`users.bio`**.

---

## GIN index (pg_trgm / `gin_trgm_ops`)

**Used for** substring-style **`text`** workloads (e.g. `ILIKE '%term%'`); needs **`pg_trgm`**.

### 1. `posts`

- **`idx_posts_body_trgm`** — `USING gin (body gin_trgm_ops)`. **Workbench:** **`trgm_gin`** + **`contains`** on **`posts.body`** (SQL remains **`ILIKE`**).

### 2. `comments`

- **`idx_comments_body_trgm`** — `USING gin (body gin_trgm_ops)`. **Workbench:** **`trgm_gin`** + **`contains`** on **`comments.body`**.

### 3. `users`

- **`idx_users_bio_trgm`** — `USING gin (bio gin_trgm_ops)`. **Workbench:** **`trgm_gin`** + **`contains`** on **`users.bio`**.

---

## GiST index (tsvector)

**Used for** the same **`@@`** family as GIN on **`tsvector`**; planner may choose GiST vs GIN.

### 1. `posts`

- **`idx_posts_search_vector_gist`** — `USING gist (search_vector)`. **Workbench:** **`fts_gist`** + **`contains`** on **`posts.body`**; recipe **`search_gist_vs_gin`** vs **`fts_gin`** slot.

### 2. `comments`

- **`idx_comments_search_vector_gist`** — `USING gist (search_vector)`. **Workbench:** **`fts_gist`** + **`contains`** on **`comments.body`**.

### 3. `users`

- **`idx_users_search_vector_gist`** — `USING gist (search_vector)`. **Workbench:** **`fts_gist`** + **`contains`** on **`users.bio`**.

---

## HASH index

**Used for** **`=`** only on the indexed column; optional alternative to btree PK scans.

### 1. `posts`

- **`idx_posts_id_hash`** — `USING hash (id)`. **Workbench:** **`hash_pk`** + **`id` =** literal (recipe **`lookup_pk`** vs **`baseline`**).

### 2. `users`

- **`idx_users_id_hash`** — `USING hash (id)`. **Workbench:** **`hash_pk`** + **`id` =** literal on **users**.

---

## Generated column (`tsvector`)

**Not an index** — a **stored, generated** `tsvector` column on each row. **Used for** precomputing document vectors so **`@@`** predicates can hit **GIN/GiST** on `search_vector` without building the vector in the query. **Workbench:** consumed when **`fts_gin`**, **`fts_gist`**, or **`fts_stored_scan`** is selected with literal **`contains`** on the table’s text body column (see `compile-entity-query.ts`).

### 1. `posts`

- **`search_vector`** — `GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED`. **Workbench:** **`fts_gin`** / **`fts_gist`** / **`fts_stored_scan`** + **`contains`** on **`posts.body`** → `search_vector @@ plainto_tsquery('english', …)`.

### 2. `comments`

- **`search_vector`** — `GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED`. **Workbench:** **`fts_gin`** / **`fts_gist`** / **`fts_stored_scan`** + **`contains`** on **`comments.body`**.

### 3. `users`

- **`search_vector`** — `GENERATED ALWAYS AS (to_tsvector('english', coalesce(bio, ''))) STORED`. **Workbench:** **`fts_gin`** / **`fts_gist`** / **`fts_stored_scan`** + **`contains`** on **`users.bio`**.

---

## Extension (`pg_trgm`)

**Not an index** — a database extension that adds trigram types and **`gin_trgm_ops`**. **Used for** building **`idx_*_body_trgm`** / **`idx_users_bio_trgm`** (GIN trgm indexes above). **Workbench:** no direct toggle; required so **`trgm_gin`** workloads can use those indexes.

### 1. Database-wide

- **`pg_trgm`** — `CREATE EXTENSION IF NOT EXISTS pg_trgm` (see init SQL / migration `1740800000000-BenchIndexTypes`). **Workbench:** indirect; enables trgm GIN indexes used when **`trgm_gin`** + **`contains`** on **`posts.body`**, **`comments.body`**, **`users.bio`**.

---

## Runtime full-text expression (query only)

**Not an index** — the vector is built **in the query** from live text, then **`@@`** is applied. **Used for** comparing “compute at read time” vs stored **`search_vector`**. **Workbench:** optimization **`fts_runtime`** + literal **`contains`** on **`posts.body`**, **`comments.body`**, or **`users.bio`** → `to_tsvector('english', <text_col>) @@ plainto_tsquery('english', …)` in `compile-entity-query.ts`.

### 1. `posts`

- **Runtime predicate on `body`** — no stored column read for the `@@` side. **Workbench:** **`fts_runtime`** + **`contains`** on **`posts.body`**.

### 2. `comments`

- **Runtime predicate on `body`**. **Workbench:** **`fts_runtime`** + **`contains`** on **`comments.body`**.

### 3. `users`

- **Runtime predicate on `bio`**. **Workbench:** **`fts_runtime`** + **`contains`** on **`users.bio`**.

---

## SQL helper (`plainto_tsquery`)

**Not an index** — a PostgreSQL function call in emitted SQL. **Used for** turning a user search string into a `tsquery` for **`@@`**. **Workbench:** appears in **stored-vector** paths (`fts_gin`, **`fts_gist`**, **`fts_stored_scan`**) and the **runtime** (`fts_runtime`) path from `compile-entity-query.ts`.

### 1. `posts`

- **`plainto_tsquery('english', $1)`** — paired with **`search_vector @@ …`** or **`to_tsvector('english', body) @@ …`**. **Workbench:** **`fts_gin`** / **`fts_gist`** / **`fts_stored_scan`** / **`fts_runtime`** + **`contains`** on **`posts.body`**.

### 2. `comments`

- **`plainto_tsquery('english', $1)`** — same pairing on **`comments.body`**. **Workbench:** **`fts_gin`** / **`fts_gist`** / **`fts_stored_scan`** / **`fts_runtime`** + **`contains`** on **`comments.body`**.

### 3. `users`

- **`plainto_tsquery('english', $1)`** — same pairing on **`users.bio`**. **Workbench:** **`fts_gin`** / **`fts_gist`** / **`fts_stored_scan`** / **`fts_runtime`** + **`contains`** on **`users.bio`**.

---

## Baseline substring predicate (query only)

**Not an index** — case-insensitive pattern match on raw text. **Used for** default substring search when no FTS/trgm optimization wins for **`contains`**. **Workbench:** optimization **`baseline`** (or no text-search optimization selected) → `ILIKE '%…%' ESCAPE '\'` on the filtered string column in `compile-entity-query.ts`.

### 1. `posts`

- **`body` ILIKE** — escaped wildcard pattern. **Workbench:** **`contains`** on **`posts.body`** when compiler stays on the ILIKE path (e.g. **`baseline`** only, or **`trgm_gin`** which keeps ILIKE but may use trgm index).

### 2. `comments`

- **`body` ILIKE**. **Workbench:** **`contains`** on **`comments.body`** (same rules as posts).

### 3. `users`

- **`bio` ILIKE**. **Workbench:** **`contains`** on **`users.bio`** (same rules).

### 4. Other string columns (any bench entity)

- **Same ILIKE pattern** on whichever string column has **`contains`**. **Workbench:** FTS/trgm options stay **hidden** unless the column is **`posts.body`**, **`comments.body`**, or **`users.bio`** (`workbench-optimizations.ts`).
