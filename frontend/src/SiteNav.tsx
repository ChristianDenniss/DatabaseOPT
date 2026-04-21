const CONTACT_EMAIL =
  (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || "christian.dennis@unb.ca";

function isAboutPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/about";
}

function navTo(path: string) {
  const next = path === "/" ? "/" : path;
  if (window.location.pathname === next) return;
  window.history.pushState({}, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function LogoMark() {
  return (
    <svg className="site-nav-logo-svg" viewBox="0 0 32 32" width="20" height="20" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="#fff" />
      <ellipse
        cx="16"
        cy="16"
        rx="11"
        ry="3.2"
        fill="none"
        stroke="#111"
        strokeWidth="1.35"
        transform="rotate(-18 16 16)"
      />
      <circle cx="16" cy="16" r="4.2" fill="#111" />
    </svg>
  );
}

type SiteNavProps = {
  pathname: string;
  /** Match about page shell width when true. */
  wide?: boolean;
};

export function SiteNav({ pathname, wide }: SiteNavProps) {
  const onAbout = isAboutPath(pathname);
  const onWorkbench = !onAbout;

  return (
    <div className={`site-nav-root${wide ? " site-nav-root--wide" : ""}`}>
      <nav className="site-nav-bar" aria-label="Site">
        <a
          href="/"
          className="site-nav-logo"
          aria-label="DatabaseOPT home"
          onClick={(e) => {
            e.preventDefault();
            navTo("/");
          }}
        >
          <span className="site-nav-logo-ring" aria-hidden>
            <LogoMark />
          </span>
        </a>

        <div className="site-nav-links">
          <a
            href="/about"
            className="site-nav-link"
            aria-current={onAbout ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              navTo("/about");
            }}
          >
            About
          </a>
          <a
            href="/"
            className="site-nav-link"
            aria-current={onWorkbench ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              navTo("/");
            }}
          >
            Workbench
          </a>
        </div>

        <div className="site-nav-end">
          <span className="site-nav-wip">WIP</span>
          <a className="site-nav-email" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </div>
      </nav>
    </div>
  );
}
