import { useCallback, useEffect, useMemo, useState } from "react";

type VariantMeta = { id: string; label: string };

type ScenarioListItem = {
  id: string;
  title: string;
  description: string;
  variants: VariantMeta[];
};

type BenchmarkResult = {
  variantId: string;
  label: string;
  sql: string;
  timingMs: number;
  rowCount: number;
  sampleRows: Record<string, unknown>[];
  explain: unknown;
};

export function App() {
  const [health, setHealth] = useState<string>("…");
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [scenarioId, setScenarioId] = useState<string>("");
  const [vA, setVA] = useState<string>("");
  const [vB, setVB] = useState<string>("");
  const [userId, setUserId] = useState<string>("1");
  const [hashtag, setHashtag] = useState<string>("dev");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BenchmarkResult[] | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setHealth(j.ok ? "API + DB ok" : "API up"))
      .catch(() => setHealth("API unreachable"));
  }, []);

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((j: { scenarios: ScenarioListItem[] }) => {
        setScenarios(j.scenarios ?? []);
        const first = j.scenarios?.[0];
        if (first) {
          setScenarioId(first.id);
          const [a, b] = first.variants;
          if (a) setVA(a.id);
          if (b) setVB(b.id);
        }
      })
      .catch(() => setError("Could not load scenarios (is the API running?)"));
  }, []);

  const active = useMemo(
    () => scenarios.find((s) => s.id === scenarioId),
    [scenarios, scenarioId]
  );

  const onScenarioChange = useCallback(
    (id: string) => {
      setScenarioId(id);
      const s = scenarios.find((x) => x.id === id);
      if (s?.variants?.length >= 2) {
        setVA(s.variants[0].id);
        setVB(s.variants[1].id);
      }
    },
    [scenarios]
  );

  const run = useCallback(async () => {
    if (!scenarioId || !vA || !vB) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/benchmark/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId,
          variantIds: [vA, vB],
          params: { userId: Number(userId), hashtag },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      setResults(json.results as BenchmarkResult[]);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [scenarioId, vA, vB, userId, hashtag]);

  const bestMs = useMemo(() => {
    if (!results?.length) return null;
    return Math.min(...results.map((r) => r.timingMs));
  }, [results]);

  return (
    <div className="app">
      <header>
        <h1>DatabaseOPT — relational query lab</h1>
        <p>
          Side-by-side timings and <code>EXPLAIN</code> for the same logical result. Data model:
          users, follows, posts, comments, likes, hashtags, DMs, notifications.
        </p>
        <p className="status">Status: {health}</p>
      </header>

      <section className="toolbar">
        <div className="field">
          <label htmlFor="scenario">Scenario</label>
          <select
            id="scenario"
            value={scenarioId}
            onChange={(e) => onScenarioChange(e.target.value)}
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="va">Variant A</label>
          <select
            id="va"
            value={vA}
            onChange={(e) => setVA(e.target.value)}
          >
            {active?.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="vb">Variant B</label>
          <select
            id="vb"
            value={vB}
            onChange={(e) => setVB(e.target.value)}
          >
            {active?.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="userId">userId (params)</label>
          <input
            id="userId"
            type="number"
            min={1}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="hashtag">hashtag (no #)</label>
          <input
            id="hashtag"
            value={hashtag}
            onChange={(e) => setHashtag(e.target.value)}
          />
        </div>
        <button type="button" className="primary" disabled={loading} onClick={() => void run()}>
          {loading ? "Running…" : "Run comparison"}
        </button>
      </section>

      {active && (
        <p style={{ color: "#9aa3ad", fontSize: "0.95rem" }}>{active.description}</p>
      )}

      {error && (
        <p style={{ color: "#fca5a5" }} role="alert">
          {error}
        </p>
      )}

      {results && bestMs != null && (
        <div className="grid">
          {results.map((r) => {
            const isBest = r.timingMs === bestMs && results.length > 1;
            return (
              <article key={r.variantId} className="panel">
                <h2>{r.label}</h2>
                <div className="meta">
                  <span className={`pill ${isBest ? "fast" : "slow"}`}>
                    {r.timingMs} ms
                    {isBest ? " — faster" : ""}
                  </span>
                  <span className="pill">{r.rowCount} rows</span>
                </div>
                <pre className="sql">{r.sql}</pre>
                <SampleTable rows={r.sampleRows} />
                <details className="explain">
                  <summary>EXPLAIN (FORMAT JSON) — PostgreSQL</summary>
                  <pre>{JSON.stringify(r.explain, null, 2)}</pre>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SampleTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows?.length) return <p style={{ color: "#9aa3ad" }}>No rows.</p>;
  const keys = Object.keys(rows[0]);
  return (
    <table className="sample">
      <thead>
        <tr>
          {keys.map((k) => (
            <th key={k}>{k}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {keys.map((k) => (
              <td key={k}>{formatCell(row[k])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatCell(v: unknown) {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
