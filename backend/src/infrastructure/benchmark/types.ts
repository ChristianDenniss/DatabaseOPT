/** One row in the benchmark response for a single strategy execution. */
export type BenchmarkStrategyResult<T> = {
  strategy: string;
  executionTimeMs: number | null;
  payloadSizeBytes: number;
  rowCount: number;
  result: T | null;
  error: string | null;
};

export type RunBenchmarksOptions<T> = {
  /** Used in log lines so benchmark batches correlate to HTTP requests. */
  requestId?: string;
  /** Override how rows are counted from `result` (default: arrays → length, else 1 if non-null). */
  rowCount?: (result: T) => number;
  /** Override serialized size (default: JSON.stringify). */
  payloadSizeBytes?: (result: T) => number;
};
