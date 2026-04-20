# Project decisions

Short log of non-obvious choices. Add new entries at the top with today’s date when you change direction.

---

## Workbench text-search optimization ids + stored-vector heap mode (2026-04-20)

**Decision:** Treat workbench **text-search** optimization ids as **modes**, not index type names alone: **`baseline`** (default plans, **`ILIKE`** for `contains` on long text), **`fts_runtime`** (query-time `to_tsvector` + `@@`; renamed from **`fts_tsvector`**), **`fts_stored_scan`** (same **`search_vector @@ plainto_tsquery`** as GIN/GiST on **`posts.body`**, **`comments.body`**, **`users.bio`**, **raw SQL only**, wrapped in **`SET LOCAL enable_indexscan = off`** / **`enable_bitmapscan = off`** so a run approximates “stored preprocessing without leaning on those index scan types”), **`fts_gin`** / **`fts_gist`** (same predicate; planner may use GIN or GiST on `search_vector`), **`trgm_gin`** (still **`ILIKE`**; **`pg_trgm`** GIN may apply).

**Docs:** Summary table lives in **`docs/database-indexes-and-search.md`** under “Workbench text-search modes.”

**Caveat:** Session **`SET LOCAL`** is a **bias**, not a proof that no index access occurs on every PostgreSQL version or plan shape.

---

## Query comparison workbench (`/api/bench`) (2026-04-19)

**Decision:** Expose a **catalog-driven** query lab under **`GET /api/bench/catalog`**, **`GET /api/bench/column-samples`**, and **`POST /api/bench/execute-slot`**. The client sends entity, filters, projection, sort/limit, **approach** (**`typeorm`** or **`raw_sql`**), and **optimization ids**; the server compiles SQL in **`compile-entity-query.ts`** and times execution via **`runBenchmarkStrategiesSequential`** (one strategy per HTTP call for the workbench).

**TypeORM vs raw SQL:** **`typeorm`** is allowed only when every condition is a **column** comparison (no advanced window conditions). **`raw_sql`** always compiles to a parameterized **`SELECT`**. Some optimizations are **approach-gated** in **`bench.catalog.ts`** (e.g. **`fts_stored_scan`** is **`raw_sql`** only so the session wrapper stays meaningful).

**Why:** Keeps comparisons **reproducible** and **schema-aligned** (same filter semantics, two execution engines) without ad-hoc SQL from the browser.

**Validation:** Slot payloads are parsed with **Zod** (`bench.schemas.ts`).

---

## Extra bench-only PostgreSQL indexes (GiST, `pg_trgm`, hash, partial, covering) (2026-04-19)

**Decision:** Add migration **`1740800000000-BenchIndexTypes`**: **`pg_trgm`** plus GIN **`gin_trgm_ops`** on **`posts.body`**, **`comments.body`**, **`users.bio`**; **GiST** on **`search_vector`** for the same three tables (alongside existing GIN on `search_vector` from earlier migrations); **hash** indexes on **`posts.id`** and **`users.id`**; a **partial** btree on **public** **`posts`** by **`created_at`**; a **covering** btree on **`posts(author_id) INCLUDE (...)`**. Same objects are reflected in **`backend/docker/postgres-init/01-schema.sql`** for fresh Docker installs.

**Why:** The workbench compares **planner choices** (GIN vs GiST vs heap-biased scan vs trgm vs btree patterns); the extra indexes exist to make those contrasts possible on a realistic social schema.

---

## Benchmark runner: sequential strategies, one `QueryRunner` each (2026-04-19)

**Decision:** **`runBenchmarkStrategiesSequential`** runs each **`BenchmarkStrategy`** in order, each on its **own** `QueryRunner` (connect → execute → `finally` release). No shared session between strategies.

**Why:** Avoids **session state** and **prepared statement** carryover between timed runs. Documented limitation: **shared buffers** and **OS page cache** remain instance-wide, so absolute timings are still environment-dependent.

---

## Optional Redis + HTTP GET response cache (2026-04-19)

**Decision:** When **`REDIS_URL`** is set, bootstrap connects a singleton Redis client; **`createCacheMiddleware`** may cache **`res.json`** bodies for **GET** requests (TTL from **`REDIS_CACHE_TTL_SECONDS`**, default 60s), skipping **`/api/health`**, **`/api/auth/*`**, and requests with **`Cache-Control: no-cache`**. If Redis is unset, cache middleware no-ops.

**Why:** Optional speed-up for read-heavy demos without requiring Redis for local bench work.

---

## HTTP stack: Express, optional global JWT, bench stays public (2026-04-19)

**Decision:** Use **Express** with modular routers under **`/api/*`**. When **`AUTH_GLOBAL_PROTECT=1`**, **`conditionalGlobalAuth`** requires a valid **Bearer JWT** for protected routes; **`/api/health`**, **`/api/auth/*`**, and **`/api/bench/*`** stay **unauthenticated** so local query experiments do not require a token.

**Why:** CRUD-style routes can be locked down for demos while the workbench remains usable out of the box.

---

## Frontend: Vite + React query workbench (2026-04-19)

**Decision:** Ship a **Vite + React** UI on port **5173** with dev **`/api` → `127.0.0.1:4000`** proxy. The **Benchmark workbench** loads the bench catalog, builds filters and multi-slot comparisons, and applies **recipe** presets (see **`frontend/src/workbench/`**).

**Why:** Fast dev feedback and a dedicated surface for side-by-side timings without coupling the experiment UI to production CRUD layouts.

---

## FTS: stored `tsvector` + GIN on posts, comments, users (2026-04-19)

**Decision:** Add a **`search_vector`** column on **`posts`**, **`comments`**, and **`users`**, each **`GENERATED ALWAYS`** from `to_tsvector('english', coalesce(<text>, ''))` **STORED**, plus a **GIN** index on `search_vector`. Post and comment vectors are built from **`body`**; the user vector is built from **`bio`** only.

**Bench integration:** Global optimizations **`fts_runtime`** (runtime `to_tsvector` on the filtered string column for **`contains`**), **`fts_gin`** / **`fts_gist`** (stored `search_vector` with planner-eligible GIN or GiST), and **`fts_stored_scan`** (same `search_vector @@ plainto_tsquery` SQL as GIN/GiST on **`posts.body`**, **`comments.body`**, and **`users.bio`**, **raw SQL only**, wrapped so index/bitmap scans are discouraged to approximate “stored vector without leaning on the FTS indexes”). **`fts_gin`**, **`fts_gist`**, and **`fts_stored_scan`** use the stored column only where `ftsGinUsesStoredSearchVector` in `bench.catalog.ts` applies; other string columns still use runtime `to_tsvector` when **`fts_gin`** / **`fts_gist`** / **`fts_runtime`** is selected, else baseline **`ILIKE`**.

**Why these tables:** They hold the **long free-text** fields the workbench can meaningfully compare (substring vs tokenized FTS). **`user_follows`**, **`post_likes`**, and similar tables are mostly foreign keys and timestamps, with no natural text column to index, so GIN there would not support the bench’s text search story.

**DDL path:** `backend/docker/postgres-init/01-schema.sql` for fresh installs; incremental migrations `1740600000000-PostCommentSearchVector` and `1740700000000-UserSearchVector` for existing databases.

**Caveat:** `plainto_tsquery` is **not** semantically identical to `ILIKE '%…%'`; the options exist to compare execution strategies, not to claim byte-for-byte result parity.

---

## Postgres connection: `PG_*` only + DNS (2026-04-19)

**Decision:** Configure the API and seed script with discrete **`PG_*`** variables only (no `DATABASE_URL` / connection-string aliases in app code). TLS follows `PG_SSL` and `PG_SSL_REJECT_UNAUTHORIZED` the same way for every host.

**Supporting tweak:** `dns.setDefaultResultOrder("ipv4first")` in `data-source.ts` and the seed script so some Windows networks resolve the DB host over IPv4 reliably.

**Local Docker:** Compose maps Postgres to host **5433** by default; use `PG_SSL=off` against loopback.

---

## PostgreSQL instead of MySQL (2026-04-19)

**Decision:** Run the app on PostgreSQL 16 (Docker + `pg` + TypeORM `postgres` driver). Init SQL lives in `backend/docker/postgres-init/`. Environment variables use the `PG_*` prefix.

**Why:** Easier alignment with many managed hosts (Neon, RDS, Render Postgres, etc.), richer `EXPLAIN` tooling, and native enum types for visibility and notification kinds. Benchmark SQL was adjusted for PostgreSQL (`EXPLAIN (FORMAT JSON)`, `$1` parameters).

**Migration note:** Drop old Docker volumes if you still have a MySQL volume from earlier (`docker compose down -v`).

---

## TypeScript + TypeORM on the API (2026-04-19)

**Decision:** Implement the backend in TypeScript with TypeORM mapping the existing relational schema (`synchronize: false`). SQL init scripts remain the source of truth for DDL; entities mirror tables for typed repositories and future CRUD. Benchmark timing still uses a `QueryRunner` and raw SQL strings so `EXPLAIN` and apples-to-apples comparisons stay straightforward.

**Why:** TypeORM gives a single connection model and typed entities without abandoning raw SQL for performance experiments. Each table’s mapping lives in its own folder under `backend/src/modules/` (e.g. `user/`, `post/`), re-exported for the `DataSource`. Ad hoc timed SQL for the workbench lives in **`modules/bench/`** (`compile-entity-query.ts`, catalog, schemas); shared timing helpers live in **`infrastructure/benchmark/`** (`benchmark.runner.ts`, strategy types).

**Alternatives considered:** Stay on a raw driver only (lighter, no entity mapping); Prisma (different migration story vs existing SQL files).

---

## Docker for local database (2026-04-19)

**Decision:** Use Docker Compose at the repo root to run PostgreSQL 16 for development. SQL init scripts and anything else container-specific live under `backend/docker/`.

**Why:** Docker is worth using for this project, not because it makes your code faster, but because it makes your environment **consistent and reproducible**, which matters a lot when you are working on database performance. Everyone gets the same engine version and initialization path; benchmarks and `EXPLAIN` output stay comparable across machines and over time.

**Alternatives considered:** Install PostgreSQL directly on the host (faster to start sometimes, but version and config drift); cloud-only DB (good for demos, heavier for day-to-day iteration).

---

## Docs folder (2026-04-19)

**Decision:** Keep a root `docs/` directory for decision logs and longer-form notes so the README stays a quick start.

**Why:** Separates “how to run it” from “why we built it this way,” which helps portfolio readers and future you.
