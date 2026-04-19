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

   Optional: set `SEED_USERS`, `SEED_POSTS`, etc. in `backend/.env` before seeding.

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
- `GET /api/scenarios` — built-in benchmark scenarios
- `POST /api/benchmark/run` — body: `{ scenarioId, variantIds: [a,b], params?: { userId, hashtag } }`

Optional: set `ALLOW_RAW_QUERIES=1` in `backend/.env` for `POST /api/benchmark/raw` with two or more **single-statement** `SELECT`s (local use only).

## Deploying

Use any host that provides PostgreSQL and a Node runtime. Point `PG_*` (or your provider’s connection URL mapped into those vars) at the database and run `npm run seed` once against that instance (or import a dump). Build the API with `npm run build` in `backend/` and run `npm start` (uses `dist/`). Build the frontend with `npm run build` in `frontend/` and serve `frontend/dist` behind your reverse proxy.

If you previously used the MySQL Docker volume, run `docker compose down -v` once so Postgres can initialize a fresh data directory.
