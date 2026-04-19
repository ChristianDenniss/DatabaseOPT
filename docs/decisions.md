# Project decisions

Short log of non-obvious choices. Add new entries at the top with today’s date when you change direction.

---

## PostgreSQL instead of MySQL (2026-04-19)

**Decision:** Run the app on PostgreSQL 16 (Docker + `pg` + TypeORM `postgres` driver). Init SQL lives in `backend/docker/postgres-init/`. Environment variables use the `PG_*` prefix.

**Why:** Easier alignment with many managed hosts (Neon, Supabase, RDS, Render Postgres, etc.), richer `EXPLAIN` tooling, and native enum types for visibility and notification kinds. Benchmark SQL was adjusted for PostgreSQL (`EXPLAIN (FORMAT JSON)`, `$1` parameters).

**Migration note:** Drop old Docker volumes if you still have a MySQL volume from earlier (`docker compose down -v`).

---

## TypeScript + TypeORM on the API (2026-04-19)

**Decision:** Implement the backend in TypeScript with TypeORM mapping the existing relational schema (`synchronize: false`). SQL init scripts remain the source of truth for DDL; entities mirror tables for typed repositories and future CRUD. Benchmark timing still uses a `QueryRunner` and raw SQL strings so `EXPLAIN` and apples-to-apples comparisons stay straightforward.

**Why:** TypeORM gives a single connection model and typed entities without abandoning raw SQL for performance experiments. Each table’s mapping lives in its own folder under `backend/src/modules/` (e.g. `user/entity/`, `post/entity/`), re-exported from `modules/entities/index.ts` for the `DataSource`. The benchmark module keeps SQL scenario definitions under `benchmark/entity/` even though those are not database tables—only a consistent module layout.

**Alternatives considered:** Stay on a raw driver only (lighter, no entity mapping); Prisma (different migration story vs existing SQL files).

---

## Docker for local database (2026-04-19)

**Decision:** Use Docker Compose at the repo root to run PostgreSQL 16 for development. SQL init scripts and anything else container-specific live under `backend/docker/`.

**Why:** Docker is worth using for this project—not because it makes your code faster, but because it makes your environment **consistent and reproducible**, which matters a lot when you are working on database performance. Everyone gets the same engine version and initialization path; benchmarks and `EXPLAIN` output stay comparable across machines and over time.

**Alternatives considered:** Install PostgreSQL directly on the host (faster to start sometimes, but version and config drift); cloud-only DB (good for demos, heavier for day-to-day iteration).

---

## Docs folder (2026-04-19)

**Decision:** Keep a root `docs/` directory for decision logs and longer-form notes so the README stays a quick start.

**Why:** Separates “how to run it” from “why we built it this way,” which helps portfolio readers and future you.
