# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
- The entire project is a single self-contained file: `index.html` (~390 KB) containing inline HTML, CSS, and JavaScript.
- It is "Frenchie's HR & Payroll" — a fully client-side single-page app (Overview, Time & Pay, Events, Pay stubs, Role rates, Hiring, Employees, Relations, Shifts, Compliance, Expenses, Reports, Backup).
- There is **no backend, no build system, no package manager, and no dependencies to install**. Data persists in the browser via `localStorage` (keys defined in `index.html`).

### Running it (development)
- Serve the file with any static server, then open it in a browser. Example:
  - `python3 -m http.server 8000` (from repo root), then load `http://localhost:8000/index.html`.
- Opening `index.html` directly via `file://` also works, but serving over HTTP is preferred so relative behavior and Google Fonts (loaded from a CDN) match a normal browser session. The app still functions if font CDN requests are blocked.

### Lint / test / build
- There is no lint, test, or build tooling in this repo. There is nothing to compile. "Building" the app is a no-op — the shipped artifact is `index.html` itself.

### Gotchas
- State lives entirely in `localStorage`, so a fresh browser profile / incognito starts empty. Use the in-app **Backup** view to export/import data.
- Monetary amounts are displayed rounded to whole dollars in tables and summary cards (e.g. `$42.50` shows as `$43`); the underlying stored value is not rounded. This is expected display formatting, not a bug.
