import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { decisionsMarkdown } from "./decisionsLogSource";

type HealthState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

type TechItem = {
  id: string;
  badge: string;
  body: ReactNode;
};

type ApproachItem = {
  id: string;
  title: string;
  whatItIs: ReactNode;
  /** When or why this beats “plain” plans (heap scans, naive ILIKE, single-column indexes, etc.). */
  whyItWins: ReactNode;
  howImplemented: ReactNode;
};

/** DB / search patterns used in the bench (see docs/database-indexes-and-search.md). */
const APPROACHES: ApproachItem[] = [
  {
    id: "btree",
    title: "B-tree index",
    whatItIs: (
      <p>
        PostgreSQL’s default index family: a sorted, balanced tree on the indexed column(s). Equality, inequalities, ranges,
        <code>IN</code>, and many <code>ORDER BY</code> / join patterns can use it. Primary keys and <code>UNIQUE</code>{" "}
        constraints build a b-tree unique index automatically.
      </p>
    ),
    whyItWins: (
      <p>
        Compared to <strong>no supporting index</strong> (heap scans, heavy sorts), a matching btree path usually means far
        less data touched and more predictable latency for equality, ranges, and typical <code>ORDER BY</code>. This is the
        default “make queries fast” tool in PostgreSQL.
      </p>
    ),
    howImplemented: (
      <p>
        Every table has a btree primary key; named indexes cover common paths (e.g. <code>idx_posts_created_at</code>,{" "}
        <code>idx_comments_post_created</code>). The workbench <code>baseline</code> optimization relies on normal planner
        choices with these indexes when filters line up.
      </p>
    ),
  },
  {
    id: "composite-btree",
    title: "Composite B-tree",
    whatItIs: (
      <p>
        One b-tree on <strong>multiple columns</strong> in order. A classic pattern: equality on a left prefix plus a range on
        the next column (for example one author’s posts after a timestamp).
      </p>
    ),
    whyItWins: (
      <p>
        Versus <strong>two separate single-column</strong> btree indexes (or scanning many rows on <code>author_id</code>{" "}
        alone), one well-ordered composite index lets the planner walk a tight range: same author, time window, often fewer
        pages and less work per row.
      </p>
    ),
    howImplemented: (
      <p>
        On <code>posts</code>, <code>idx_posts_author_created</code> is <code>(author_id, created_at DESC)</code>. The bench
        exposes <code>composite_author_time</code> when <code>author_id</code> is a literal and <code>created_at</code> uses
        comparison operators; see recipe <code>range_composite</code>.
      </p>
    ),
  },
  {
    id: "partial-btree",
    title: "Partial B-tree",
    whatItIs: (
      <p>
        Still a b-tree, but the index definition includes a <strong>WHERE</strong> predicate so only matching rows are
        indexed, so the structure is smaller when queries always target the same subset (e.g. public posts only).
      </p>
    ),
    whyItWins: (
      <p>
        Against a <strong>full-table btree on the same column</strong>, a partial index is smaller and cheaper to scan when
        your predicate always includes the partial condition, which means less RAM/disk traffic and often better cache behavior for
        “public timeline only” style queries.
      </p>
    ),
    howImplemented: (
      <p>
        On <code>posts</code>, <code>idx_posts_public_created_at</code> indexes <code>created_at DESC</code> where{" "}
        <code>visibility = &apos;public&apos;</code>. Workbench <code>partial_public_posts</code> and recipe{" "}
        <code>partial_public</code> target that shape.
      </p>
    ),
  },
  {
    id: "covering-btree",
    title: "Covering B-tree (INCLUDE)",
    whatItIs: (
      <p>
        A b-tree on leading column(s) with <code>INCLUDE</code> for extra columns in the index, so index-only plans can avoid
        heap fetches for those included fields when the planner chooses to.
      </p>
    ),
    whyItWins: (
      <p>
        Next to a <strong>plain btree on only <code>author_id</code></strong>, <code>INCLUDE</code> can satisfy “give me a
        few columns for this author” from the index alone, with fewer random heap reads when the planner picks an index-only path.
      </p>
    ),
    howImplemented: (
      <p>
        On <code>posts</code>, <code>idx_posts_author_covering</code> is btree on <code>(author_id)</code>{" "}
        <code>INCLUDE (body, visibility, created_at)</code>. Optimization <code>covering_author_posts</code> and recipe{" "}
        <code>covering_author</code> align narrow <code>author_id</code> selects with this index.
      </p>
    ),
  },
  {
    id: "hash",
    title: "Hash index",
    whatItIs: (
      <p>
        An access method aimed at <strong>equality</strong> on the indexed column. The planner may pick it instead of a
        btree PK lookup for <code>=</code> filters in some plans.
      </p>
    ),
    whyItWins: (
      <p>
        For <strong>single-column equality</strong>, hash can be competitive with btree PK lookups depending on version and
        cost settings. The bench exposes the contrast so you see planner choice, not a myth that one is always faster.
      </p>
    ),
    howImplemented: (
      <p>
        <code>idx_posts_id_hash</code> and <code>idx_users_id_hash</code> use <code>USING hash (id)</code>. Workbench{" "}
        <code>hash_pk</code> plus recipe <code>lookup_pk</code> contrasts hash vs btree on single-row <code>id</code> equality.
      </p>
    ),
  },
  {
    id: "tsvector-col",
    title: "Stored tsvector",
    whatItIs: (
      <p>
        A <code>tsvector</code> is PostgreSQL’s tokenized search document. A <strong>generated stored</strong> column keeps that
        vector on each row so <code>@@</code> predicates need not rebuild from raw text on every read.
      </p>
    ),
    whyItWins: (
      <p>
        Versus <strong>building <code>to_tsvector</code> in every query</strong> (<code>fts_runtime</code>), stored vectors
        move CPU to write/refresh time and shrink read-path work, often much better on large bodies when you match on{" "}
        <code>@@</code> repeatedly.
      </p>
    ),
    howImplemented: (
      <p>
        On <code>posts</code> and <code>comments</code>, <code>search_vector</code> is generated from <code>body</code>; on{" "}
        <code>users</code> from <code>bio</code>; each <code>GENERATED ALWAYS … STORED</code> with{" "}
        <code>to_tsvector(&apos;english&apos;, coalesce(…))</code>. Migrations add the column; <code>fts_gin</code>,{" "}
        <code>fts_gist</code>, and <code>fts_stored_scan</code> compile to{" "}
        <code>search_vector @@ plainto_tsquery(&apos;english&apos;, $1)</code> for literal <code>contains</code> on those long
        text columns.
      </p>
    ),
  },
  {
    id: "gin-tsvector",
    title: "GIN on tsvector",
    whatItIs: (
      <p>
        <strong>GIN</strong> (Generalized Inverted Index) fits composite values like <code>tsvector</code>: token → row lists
        so full-text <code>@@</code> matches can skip heap scans when the planner uses the index.
      </p>
    ),
    whyItWins: (
      <p>
        Against <strong>sequential scans</strong> or runtime-only vectors at scale, GIN on <code>tsvector</code> is the usual
        fast path for token lookup on stored <code>@@</code> predicates: posting lists are built for exactly that access pattern.
      </p>
    ),
    howImplemented: (
      <p>
        <code>idx_posts_search_vector</code>, <code>idx_comments_search_vector</code>, <code>idx_users_search_vector</code>{" "}
        use <code>USING gin (search_vector)</code>. <code>fts_gin</code> keeps that predicate shape so PostgreSQL may use
        those GIN indexes.
      </p>
    ),
  },
  {
    id: "gist-tsvector",
    title: "GiST on tsvector",
    whatItIs: (
      <p>
        <strong>GiST</strong> can also index <code>tsvector</code>. Same <code>@@</code> family as GIN; the planner picks GiST
        vs GIN from cost and statistics.
      </p>
    ),
    whyItWins: (
      <p>
        Not “always faster than GIN”, but <strong>having both</strong> lets the planner pick the better structure for your
        data and selectivity, and the workbench can show when GiST wins a footrace on the same <code>@@</code> predicate.
      </p>
    ),
    howImplemented: (
      <p>
        <code>idx_*_search_vector_gist</code> use <code>USING gist (search_vector)</code>. <code>fts_gist</code> exposes that
        path; recipe <code>search_gist_vs_gin</code> contrasts GiST vs GIN on the same stored predicate.
      </p>
    ),
  },
  {
    id: "gin-trgm",
    title: "GIN + trigram (pg_trgm)",
    whatItIs: (
      <p>
        Trigrams split text into three-character chunks so <strong>substring</strong> workloads (<code>ILIKE &apos;%term%&apos;</code>)
        can use an inverted index. The         <code>pg_trgm</code> extension supplies <code>gin_trgm_ops</code> for GIN on plain text.
      </p>
    ),
    whyItWins: (
      <p>
        Versus <strong>naive <code>ILIKE &apos;%term%&apos;</code></strong> on big tables (baseline), trigram GIN can cut
        candidate rows dramatically, with the same substring semantics you expect from ILIKE, but with an index-friendly access path
        when the planner uses it.
      </p>
    ),
    howImplemented: (
      <p>
        <code>pg_trgm</code> is enabled in Docker init SQL / migration <code>1740800000000-BenchIndexTypes</code>. Indexes{" "}
        <code>idx_posts_body_trgm</code>, <code>idx_comments_body_trgm</code>, <code>idx_users_bio_trgm</code> use{" "}
        <code>gin_trgm_ops</code>. <code>trgm_gin</code> keeps SQL as escaped <code>ILIKE</code> while the planner may use those
        indexes on <code>posts.body</code>, <code>comments.body</code>, and <code>users.bio</code>.
      </p>
    ),
  },
  {
    id: "fts-runtime",
    title: "Full-text at query time",
    whatItIs: (
      <p>
        The query builds <code>to_tsvector(&apos;english&apos;, …)</code> on the live text column at read time and applies{" "}
        <code>@@ plainto_tsquery(…)</code> instead of reading a precomputed <code>search_vector</code>, useful to compare CPU at
        read time vs stored vectors.
      </p>
    ),
    whyItWins: (
      <p>
        Best as a <strong>comparison baseline</strong>: no stored column or GIN to maintain, so you get an honest “pay at query time.” It
        can lose on large bodies vs stored <code>tsvector</code> + GIN, but wins on simplicity and on measuring that gap in
        the workbench.
      </p>
    ),
    howImplemented: (
      <p>
        Optimization <code>fts_runtime</code> in <code>compile-entity-query.ts</code> emits{" "}
        <code>{`to_tsvector('english', <text_col>) @@ plainto_tsquery('english', $1)`}</code> for literal{" "}
        <code>contains</code> on <code>posts.body</code>, <code>comments.body</code>, or <code>users.bio</code>.
      </p>
    ),
  },
  {
    id: "fts-stored-scan",
    title: "Stored vector, heap-biased scan",
    whatItIs: (
      <p>
        Same <code>search_vector @@ plainto_tsquery</code> predicate as GIN/GiST paths, but the session discourages index and
        bitmap scans so the run is biased toward evaluating the stored vector without those access types (not guaranteed on
        every PostgreSQL version).
      </p>
    ),
    whyItWins: (
      <p>
        Lets you separate <strong>“stored vector work”</strong> from <strong>“GIN/GiST seek work”</strong> on the same SQL
        shape, useful for teaching and benching, not a claim that heap bias is faster in production.
      </p>
    ),
    howImplemented: (
      <p>
        <code>fts_stored_scan</code> is <strong>raw SQL only</strong>: <code>compile-entity-query.ts</code> wraps the statement
        in <code>BEGIN</code>, <code>SET LOCAL enable_indexscan = off</code>, <code>SET LOCAL enable_bitmapscan = off</code>,
        then the query and <code>COMMIT</code>, isolating “stored preprocessing” from “index seek benefit.”
      </p>
    ),
  },
  {
    id: "baseline-ilike",
    title: "Baseline ILIKE substring",
    whatItIs: (
      <p>
        Case-insensitive pattern match on raw text: <code>ILIKE &apos;%…%&apos;</code> with escaped <code>%</code> and{" "}
        <code>_</code>. No tokenization; different semantics from <code>@@</code>         full-text, but the usual substring baseline.
      </p>
    ),
    whyItWins: (
      <p>
        Zero extra indexes required; semantics match <strong>substring ILIKE</strong> exactly. It often loses raw speed to{" "}
        <code>trgm_gin</code> or FTS on huge text, but wins on portability and on being the honest default before you opt into
        heavier machinery.
      </p>
    ),
    howImplemented: (
      <p>
        <code>baseline</code> (or no FTS/trgm mode where applicable) compiles <code>contains</code> to escaped{" "}
        <code>ILIKE</code> in <code>compile-entity-query.ts</code>. FTS/trgm toggles only appear for <code>posts.body</code>,{" "}
        <code>comments.body</code>, and <code>users.bio</code> per <code>workbench-optimizations.ts</code>; other string columns
        stay on this path.
      </p>
    ),
  },
  {
    id: "plainto-tsquery",
    title: "plainto_tsquery",
    whatItIs: (
      <p>
        Builds a safe <code>tsquery</code> from user text for <code>@@</code>: light tokenization so raw input is not
        interpreted as tsquery operators.
      </p>
    ),
    whyItWins: (
      <p>
        Safer and simpler than letting users assemble <code>tsquery</code> text by hand, with fewer footguns than{" "}
        <code>to_tsquery</code> on raw input, while still pairing cleanly with <code>@@</code> in every stored and runtime FTS
        path here.
      </p>
    ),
    howImplemented: (
      <p>
        Any <code>@@</code> path with a bound search term uses <code>plainto_tsquery(&apos;english&apos;, $1)</code> next to
        either <code>search_vector</code> (stored) or <code>to_tsvector(&apos;english&apos;, col)</code> (
        <code>fts_runtime</code>) in <code>compile-entity-query.ts</code>.
      </p>
    ),
  },
];

const TECH_STACK: TechItem[] = [
  {
    id: "react",
    badge: "React",
    body: (
      <>
        <p>
          UI library: you build with <strong>components</strong>; React reconciles state to the DOM so you are not toggling
          nodes by hand.
        </p>
        <p>
          <strong>Technical:</strong> declarative trees, virtual DOM diff, hooks for state and effects; the workbench is a
          composition of smaller components (filters, slots, results).
        </p>
      </>
    ),
  },
  {
    id: "typescript",
    badge: "TS",
    body: (
      <>
        <p>
          JavaScript plus a <strong>static type layer</strong> so impossible shapes and typos surface in the editor instead
          of at runtime.
        </p>
        <p>
          <strong>Technical:</strong> types erase at compile time; the emitted bundle is plain JS with the same module graph
          Vite consumes.
        </p>
      </>
    ),
  },
  {
    id: "vite",
    badge: "Vite",
    body: (
      <>
        <p>
          Frontend <strong>tooling</strong>: fast dev server (native ESM) and a production bundler/minifier in one toolchain.
        </p>
        <p>
          <strong>Technical:</strong> dev proxy sends <code>/api</code> to the backend on port 4000 so the browser avoids
          CORS friction while iterating locally.
        </p>
      </>
    ),
  },
  {
    id: "node",
    badge: "Node",
    body: (
      <>
        <p>
          <strong>Node.js</strong> runs JavaScript on the server: event loop, I/O, HTTP handling. This API process is a Node
          program.
        </p>
        <p>
          <strong>Technical:</strong> same language on client and server for shared validation patterns and JSON-heavy
          handlers.
        </p>
      </>
    ),
  },
  {
    id: "express",
    badge: "Express",
    body: (
      <>
        <p>
          Minimal HTTP framework: <strong>routing</strong>, middleware chain, JSON request/response helpers, with enough structure
          without a heavy platform.
        </p>
        <p>
          <strong>Technical:</strong> modular routers (<code>/api/bench/*</code>, <code>/api/users</code>, …), shared
          middleware for logging, cache headers, and optional JWT gates.
        </p>
      </>
    ),
  },
  {
    id: "postgres",
    badge: "Postgres",
    body: (
      <>
        <p>
          The <strong>relational database</strong>: ACID transactions, rich SQL, planner + indexes. The demo schema models
          users, posts, comments, likes, and follows so comparisons feel like a real app.
        </p>
        <p>
          <strong>Technical:</strong> btree / GIN / GiST / partial / covering / <code>pg_trgm</code> / stored{" "}
          <code>tsvector</code>. Extras exist so the planner has meaningful choices under the same predicates.
        </p>
      </>
    ),
  },
  {
    id: "typeorm",
    badge: "TypeORM",
    body: (
      <>
        <p>
          <strong>ORM layer</strong>: entities map to tables; the query builder emits parameterized SQL so you are not
          concatenating strings in handlers.
        </p>
        <p>
          <strong>Technical:</strong> the bench can run the same logical filter set through TypeORM <em>or</em> the compiled
          raw-SQL path for apples-to-apples timings.
        </p>
      </>
    ),
  },
  {
    id: "zod",
    badge: "Zod",
    body: (
      <>
        <p>
          <strong>Runtime schemas</strong> for JSON bodies (e.g. execute-slot payloads): invalid shapes fail fast with a
          readable validation error instead of deep compiler errors.
        </p>
        <p>
          <strong>Technical:</strong> parse → typed object; TypeScript inference can mirror the same schema for compile-time
          hints.
        </p>
      </>
    ),
  },
  {
    id: "redis",
    badge: "Redis",
    body: (
      <>
        <p>
          Optional <strong>in-memory cache</strong> for short-lived HTTP GET responses when <code>REDIS_URL</code> is set, which is nice
          for demos, not required for the bench itself.
        </p>
        <p>
          <strong>Technical:</strong> middleware can cache JSON bodies with a TTL; health and auth routes stay uncached.
        </p>
      </>
    ),
  },
  {
    id: "jwt",
    badge: "JWT",
    body: (
      <>
        <p>
          Optional <strong>Bearer tokens</strong> for locking down CRUD demos: signed claims the server verifies without a
          session table per request.
        </p>
        <p>
          <strong>Technical:</strong> middleware validates signature/expiry; bench and health remain public so the lab works
          without a login step.
        </p>
      </>
    ),
  },
  {
    id: "bench-runner",
    badge: "Bench",
    body: (
      <>
        <p>
          The UI sends a <strong>structured query</strong> (entity, filters, columns, limits); the server compiles
          parameterized SQL and records wall time, row count, and serialized payload size per slot.
        </p>
        <p>
          <strong>Technical:</strong> dedicated <code>QueryRunner</code> per slot, sequential execution to avoid session/plan
          leakage between timed runs.
        </p>
      </>
    ),
  },
  {
    id: "docker-migrations",
    badge: "Docker",
    body: (
      <>
        <p>
          <strong>Containers</strong> for a reproducible Postgres (same extensions and seed as documented installs) so new
          contributors spin up the same shape quickly.
        </p>
        <p>
          <strong>Technical:</strong> compose-friendly images plus init SQL; incremental TypeORM migrations track schema
          evolution in git.
        </p>
      </>
    ),
  },
];

function ApproachPanelBody({ a }: { a: ApproachItem }) {
  return (
    <div className="about-approach-panel">
      <div className="about-approach-block">
        <h3 className="about-approach-label">What exactly it is</h3>
        <div className="about-approach-copy">{a.whatItIs}</div>
      </div>
      <div className="about-approach-block">
        <h3 className="about-approach-label">What you gain over the default</h3>
        <div className="about-approach-copy">{a.whyItWins}</div>
      </div>
      <div className="about-approach-block">
        <h3 className="about-approach-label">How we implemented it</h3>
        <div className="about-approach-copy">{a.howImplemented}</div>
      </div>
    </div>
  );
}

function ApproachTileBrowser({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected = APPROACHES.find((x) => x.id === selectedId) ?? null;
  const others = selected ? APPROACHES.filter((x) => x.id !== selected.id) : APPROACHES;
  const [bodyRevealed, setBodyRevealed] = useState(false);
  const prevHadSelection = useRef(false);

  useEffect(() => {
    if (!selectedId) {
      setBodyRevealed(false);
      prevHadSelection.current = false;
      return;
    }
    if (!prevHadSelection.current) {
      setBodyRevealed(false);
      const t = requestAnimationFrame(() => {
        requestAnimationFrame(() => setBodyRevealed(true));
      });
      prevHadSelection.current = true;
      return () => cancelAnimationFrame(t);
    }
    setBodyRevealed(true);
  }, [selectedId]);

  return (
    <div className="about-approach-browser">
      {selected ? (
        <>
          <div className="about-approach-hero">
            <button
              type="button"
              className="about-approach-tile about-approach-tile--hero about-approach-tile--active"
              aria-expanded={true}
              onClick={() => onSelect(selected.id)}
            >
              <span className="about-approach-tile-text">
                <span className="about-approach-tile-label">{selected.title}</span>
                <span className="about-approach-tile-hint">Tap again or Esc to close</span>
              </span>
            </button>
          </div>
          <div className={`about-approach-expand ${bodyRevealed ? "about-approach-expand--open" : ""}`}>
            <div className="about-approach-expand-inner">
              <ApproachPanelBody a={selected} />
            </div>
          </div>
        </>
      ) : null}
      <div className={`about-approach-tile-grid${selected ? " about-approach-tile-grid--filtered" : ""}`}>
        {others.map((a) => (
          <button
            key={a.id}
            type="button"
            className="about-approach-tile"
            aria-expanded={false}
            onClick={() => onSelect(a.id)}
          >
            <span className="about-approach-tile-label">{a.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AboutPage({ health }: { health: HealthState }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedApproachId, setSelectedApproachId] = useState<string | null>(null);
  const [decisionsOpen, setDecisionsOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedApproachId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedApproachId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedApproachId]);

  const clearIfFocusLeft = useCallback(() => {
    requestAnimationFrame(() => {
      const root = shellRef.current;
      const ae = document.activeElement;
      if (!root || !ae || !root.contains(ae)) {
        setActiveId(null);
      }
    });
  }, []);

  return (
    <div className="app about-app about-app--with-site-nav">
      <header className="about-masthead">
        <div className="about-masthead-row about-masthead-row--status-only">
          <div
            className={`health-badge about-health-badge ${health.status === "ready" ? "health-badge--ok" : ""} ${health.status === "error" ? "health-badge--bad" : ""} ${health.status === "loading" ? "health-badge--pending" : ""}`}
            role="status"
            aria-live="polite"
          >
            {health.status === "loading" && "Checking connection…"}
            {health.status === "ready" && "API & database online"}
            {health.status === "error" && health.message}
          </div>
        </div>
        <h1 className="about-hero-title">About</h1>
        <p className="about-hero-lede">DatabaseOPT: why it exists, what the lab does, and what the stack is made of.</p>
      </header>

      <main className="about-main">
        <section className="about-block" aria-labelledby="about-why-heading">
          <h2 id="about-why-heading" className="about-heading">
            Why I made this
          </h2>
          <div className="about-copy">
            <p>
              I wanted a <strong>controlled place</strong> to compare how the same business-shaped query behaves when you
              change small things: ORM vs raw SQL, different index strategies, full-text vs substring search. In production,
              traffic, caches, and data skew make that hard to reason about.
            </p>
            <p>
              This project keeps the <strong>schema and filters honest</strong>: one catalog, one compiler, repeatable timed
              runs, so latency and payload differences are easier to tie to the knob you actually turned.
            </p>
          </div>
        </section>

        <section className="about-block" aria-labelledby="about-what-heading">
          <h2 id="about-what-heading" className="about-heading">
            What it does
          </h2>
          <div className="about-copy">
            <p>
              The <strong>query comparison workbench</strong> loads entities and columns from the API, lets you set filters,
              projections, sort/limit, and multiple <strong>slots</strong> (TypeORM vs raw SQL and optimization toggles). Each
              slot runs on the server; the UI shows time, payload size, row counts, and a short summary.
            </p>
            <p>
              Underneath is a <strong>PostgreSQL</strong> social-style schema with bench-oriented indexes so the planner has
              real choices, not a toy single-index toy database.
            </p>
          </div>
        </section>

        <section className="about-block" aria-labelledby="about-approaches-heading">
          <h2 id="about-approaches-heading" className="about-heading">
            Approaches
          </h2>
          <ApproachTileBrowser
            selectedId={selectedApproachId}
            onSelect={(id) => setSelectedApproachId((cur) => (cur === id ? null : id))}
          />
        </section>

        <section className="about-block" aria-labelledby="about-decisions-heading">
          <h2 id="about-decisions-heading" className="about-heading">
            Decision log
          </h2>
          <div className="about-decisions-wrap">
            <button
              type="button"
              className="btn-secondary about-decisions-toggle"
              id="about-decisions-toggle"
              aria-expanded={decisionsOpen}
              aria-controls={decisionsOpen ? "about-decisions-panel" : undefined}
              onClick={() => setDecisionsOpen((o) => !o)}
            >
              {decisionsOpen ? "Hide decision log" : "View Decision log"}
            </button>
            {decisionsOpen ? (
              <div
                id="about-decisions-panel"
                className="about-decisions-body"
                role="region"
                aria-labelledby="about-decisions-toggle"
              >
                <div className="about-decisions-md">
                  <ReactMarkdown
                    components={{
                      a: ({ href, children, ...rest }) => (
                        <a
                          {...rest}
                          href={href}
                          target={href?.startsWith("http") ? "_blank" : undefined}
                          rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {decisionsMarkdown}
                  </ReactMarkdown>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="about-block" aria-labelledby="about-stack-heading">
          <h2 id="about-stack-heading" className="about-heading">
            What powers it
          </h2>
          <p className="about-stack-hint">Hover or keyboard-focus a tag. On touch, tap once to show notes, again to hide.</p>

          <div
            ref={shellRef}
            className="about-tech-shell"
            onMouseLeave={() => setActiveId(null)}
          >
            <div className="about-badge-grid" role="group" aria-label="Technology stack">
              {TECH_STACK.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`about-tech-badge ${activeId === t.id ? "about-tech-badge--active" : ""}`}
                  aria-pressed={activeId === t.id}
                  onMouseEnter={() => setActiveId(t.id)}
                  onFocus={() => setActiveId(t.id)}
                  onBlur={clearIfFocusLeft}
                  onClick={() => setActiveId((cur) => (cur === t.id ? null : t.id))}
                >
                  {t.badge}
                </button>
              ))}
            </div>

            <div className="about-tech-blurb" aria-live="polite">
              {activeId ? (
                <div className="about-tech-blurb-inner" key={activeId}>
                  {TECH_STACK.find((x) => x.id === activeId)?.body}
                </div>
              ) : (
                <p className="about-tech-placeholder">Pick a tag above for a quick rundown.</p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
