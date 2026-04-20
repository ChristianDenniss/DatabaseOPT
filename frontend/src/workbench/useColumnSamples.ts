import { useEffect, useState } from "react";

/**
 * Distinct non-null values for a bench entity column (from `/api/bench/column-samples`).
 */
export function useColumnSamples(entityId: string, columnId: string, enabled: boolean) {
  const [values, setValues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !entityId || !columnId) {
      setValues([]);
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    const debounce = window.setTimeout(() => {
      setLoading(true);
      const qs = new URLSearchParams({ entityId, columnId });
      fetch(`/api/bench/column-samples?${qs}`, { signal: ac.signal })
        .then((r) => r.json())
        .then((j: { values?: unknown; error?: string }) => {
          if (ac.signal.aborted) return;
          const raw = j.values;
          setValues(Array.isArray(raw) ? raw.map((v) => String(v)) : []);
        })
        .catch(() => {
          if (!ac.signal.aborted) setValues([]);
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    }, 200);

    return () => {
      window.clearTimeout(debounce);
      ac.abort();
    };
  }, [entityId, columnId, enabled]);

  return { values, loading };
}
