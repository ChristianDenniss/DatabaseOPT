import { useEffect, useState, useSyncExternalStore } from "react";
import { AboutPage } from "./AboutPage";
import { SiteNav } from "./SiteNav";
import { BenchmarkWorkbench } from "./workbench/BenchmarkWorkbench";

type HealthState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

function subscribePathname(onStoreChange: () => void): () => void {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function getPathname(): string {
  return window.location.pathname;
}

function isAboutPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/about";
}

export function App() {
  const pathname = useSyncExternalStore(subscribePathname, getPathname, () => "/");
  const [health, setHealth] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    fetch("/api/health")
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          db?: string;
          dbError?: string;
        };
        if (r.ok && j.ok && j.db === "up") {
          setHealth({ status: "ready" });
          return;
        }
        const msg =
          j.db === "down"
            ? j.dbError ?? "Database did not respond."
            : "API reported an unhealthy state.";
        setHealth({ status: "error", message: msg });
      })
      .catch(() =>
        setHealth({
          status: "error",
          message: "Cannot reach the API. Start the backend (port 4000) or check the Vite proxy.",
        })
      );
  }, []);

  const onAbout = isAboutPath(pathname);

  return (
    <>
      <SiteNav pathname={pathname} wide={onAbout} />
      {onAbout ? (
        <AboutPage health={health} />
      ) : (
        <div className="app app--with-site-nav">
          <header className="site-header">
            <div className="site-header-top">
              <p className="site-eyebrow">Query lab</p>
              <div
                className={`health-badge ${health.status === "ready" ? "health-badge--ok" : ""} ${health.status === "error" ? "health-badge--bad" : ""} ${health.status === "loading" ? "health-badge--pending" : ""}`}
                role="status"
                aria-live="polite"
              >
                {health.status === "loading" && "Checking connection…"}
                {health.status === "ready" && "API & database online"}
                {health.status === "error" && health.message}
              </div>
            </div>
            <h1 className="site-title">DatabaseOPT</h1>
            <p className="site-lede">
              Run the <strong>same</strong> filters and column selection through TypeORM and raw SQL, one slot at a time.
              The summary compares wall-clock time and payload size so you can see where each path pays off.
            </p>
          </header>

          <BenchmarkWorkbench />
        </div>
      )}
    </>
  );
}
