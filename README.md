# DatabaseOPT

Social-style relational data in **PostgreSQL** for experimenting with query shapes, timings, and `EXPLAIN` plans. The UI compares two built-in SQL variants side by side. Design notes and rationale live in [`docs/decisions.md`](docs/decisions.md).

## Prerequisites

- Docker (for PostgreSQL 16 locally)
- Node.js 18+

The API is **TypeScript** with **TypeORM** (PostgreSQL driver). Schema is applied by Docker init SQL; `synchronize` stays off so production stays explicit and safe.

## One-time setup

1. Start PostgreSQL (first run applies `backend/docker/postgres-init/01-schema.sql`):

   ```bash
   docker compose up -d
   ```

2. Backend env:

   ```bash
   copy backend\.env.example backend\.env
   ```

   Adjust credentials if you changed them in `docker-compose.yml`.

3. Install and seed:

   ```bash
   cd backend
   npm install
   npm run seed
   ```

   Optional: set `SEED_USERS`, `SEED_POSTS`, `SEED_COMMENTS`, `SEED_POST_LIKES`, `SEED_COMMENT_LIKES`, etc. in `backend/.env` before seeding (defaults are large; trim for quick local runs).

4. Frontend:

   ```bash
   cd ..\frontend
   npm install
   ```

## Run

Terminal A — API (default `http://localhost:4000`):

```bash
cd backend
npm run dev
```

Terminal B — UI (`http://localhost:5173`, proxies `/api` to the API):

```bash
cd frontend
npm run dev
```

## API

- `GET /api/health` — DB connectivity
- `GET /api/bench/catalog` — entities, columns, filter operators, optimization ids for the query workbench
- `GET /api/bench/column-samples` — optional sample values for filter UX
- `POST /api/bench/execute-slot` — run one compiled query variant (body: filters, entity, approach `typeorm` | `raw_sql`, optimizations, etc.)

CRUD routes live under `/api/users`, `/api/posts`, `/api/comments`, `/api/likes`, `/api/follows`, `/api/auth`. See [`docs/decisions.md`](docs/decisions.md) for auth and Redis caching behavior.

## Deploying

Use any host that provides PostgreSQL and a Node runtime. Point `PG_*` (or your provider’s connection URL mapped into those vars) at the database and run `npm run seed` once against that instance (or import a dump). Build the API with `npm run build` in `backend/` and run `npm start` (uses `dist/`). Build the frontend with `npm run build` in `frontend/` and serve `frontend/dist` behind your reverse proxy.

If you previously used the MySQL Docker volume, run `docker compose down -v` once so Postgres can initialize a fresh data directory.
