# HyprTrack Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Python collector into `collector/` and build a polished Next.js dashboard that reads its SQLite database through tested route handlers.

**Architecture:** The Python process remains the only writer to `collector/hyprtrack.db`. A Next.js App Router application in `next/` uses a server-only SQLite query module and thin JSON route handlers; client pages consume those APIs and render the approved shadcn sidebar dashboard.

**Tech Stack:** Python 3, SQLite, Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, tweakcn theme, Recharts, Vitest, Testing Library.

---

## File Map

- Move collector runtime and tests to `collector/`.
- Create `next/app/api/*` route handlers for read-only data access.
- Create `next/lib/server/*` for database, range, session, and analytics logic.
- Create `next/components/layout/*` for sidebar, header, breadcrumb, and theme.
- Create `next/components/dashboard/*` for cards, charts, tables, filters, and states.
- Create route pages in `next/app`, `next/app/activity`, `next/app/applications`, and `next/app/settings`.
- Add Vitest tests beside pure logic and under `next/tests/` for routes/components.

### Task 1: Split The Repository

**Files:**
- Move: `hyprtrack.py` to `collector/hyprtrack.py`
- Move: `hyprtrack.db` to `collector/hyprtrack.db`
- Move: `tests/test_hyprtrack.py` to `collector/tests/test_hyprtrack.py`
- Move: `README.md` to `collector/README.md`
- Create: `README.md`
- Modify: `.gitignore`

- [ ] Move the existing collector files without changing behavior.
- [ ] Update `PROJECT_ROOT` and script paths in the collector tests for their new location.
- [ ] Run `python3 -m unittest discover -s collector/tests -v` and confirm all tests pass.
- [ ] Write the root README with exact collector and dashboard run commands.
- [ ] Commit the repository split.

### Task 2: Scaffold Next.js And Install The Theme

**Files:**
- Create: `next/*` using the official Next.js scaffold
- Modify: `next/package.json`
- Modify: `next/app/globals.css`
- Create/modify: `next/components/ui/*`

- [ ] Scaffold a TypeScript App Router app with Tailwind and the `@/*` alias.
- [ ] Initialize shadcn using the detected project configuration.
- [ ] Run the exact registry command:

```bash
npx shadcn@latest add https://tweakcn.com/r/themes/cmjgilzlg000404ju2wgs7uj9
```

- [ ] Add the documented shadcn components needed by the design: sidebar, breadcrumb, button, card, chart, table, badge, alert, skeleton, empty, input, select, tabs, sheet, dropdown-menu, tooltip, separator, pagination, switch, toggle-group, and sonner.
- [ ] Inspect all generated files and retain semantic theme variables as the only color source.
- [ ] Add Vitest, Testing Library, jsdom, and the SQLite package selected for the installed Node version.
- [ ] Run `npm run lint` and `npm run build`.
- [ ] Commit the scaffold and theme.

### Task 3: Build The Analytics Core With TDD

**Files:**
- Create: `next/lib/types.ts`
- Create: `next/lib/server/ranges.ts`
- Create: `next/lib/server/sessions.ts`
- Create: `next/lib/server/database.ts`
- Create: `next/lib/server/queries.ts`
- Test: `next/lib/server/ranges.test.ts`
- Test: `next/lib/server/sessions.test.ts`
- Test: `next/lib/server/queries.test.ts`

- [ ] Write failing tests showing `today`, `7d`, and `30d` resolve to explicit IST start/end timestamps and invalid values are rejected.
- [ ] Run the range tests and confirm failure because the module does not exist.
- [ ] Implement typed range parsing and rerun until green.
- [ ] Write failing tests showing adjacent equal application samples become one session, gaps over 90 seconds split sessions, and isolated samples count as one minute.
- [ ] Run the session tests and confirm expected failure.
- [ ] Implement session grouping and rerun until green.
- [ ] Write failing fixture-database tests for overview totals, productive totals, application ranking, timeline buckets, search, filtering, and pagination.
- [ ] Implement a read-only database opener with schema validation and bound SQL parameters.
- [ ] Implement focused query functions that return complete typed aggregates rather than exposing SQL rows.
- [ ] Run all analytics tests and confirm they pass.
- [ ] Commit the analytics core.

### Task 4: Add Tested Route Handlers

**Files:**
- Create: `next/app/api/health/route.ts`
- Create: `next/app/api/overview/route.ts`
- Create: `next/app/api/timeline/route.ts`
- Create: `next/app/api/applications/route.ts`
- Create: `next/app/api/activity/route.ts`
- Create: `next/lib/server/http.ts`
- Test: `next/tests/api-routes.test.ts`

- [ ] Write failing tests for successful response shapes and `400`, `404`, `422`, and `500` error contracts.
- [ ] Confirm tests fail before route implementations exist.
- [ ] Add thin route handlers that validate `URLSearchParams`, call query functions, and map typed errors to:

```ts
type ApiError = {
  error: {
    code: "INVALID_QUERY" | "DATABASE_MISSING" | "INVALID_SCHEMA" | "QUERY_FAILED"
    message: string
  }
}
```

- [ ] Ensure runtime responses never include absolute paths or SQL text.
- [ ] Run route tests and commit once green.

### Task 5: Build The App Shell And Sidebar

**Files:**
- Create: `next/components/layout/app-sidebar.tsx`
- Create: `next/components/layout/app-header.tsx`
- Create: `next/components/layout/app-breadcrumb.tsx`
- Create: `next/components/layout/theme-provider.tsx`
- Create: `next/components/layout/theme-toggle.tsx`
- Create: `next/components/layout/nav-config.ts`
- Modify: `next/app/layout.tsx`
- Test: `next/tests/app-sidebar.test.tsx`

- [ ] Write failing component tests for active-route matching, all four navigation links, collapsed tooltips, and accessible sidebar labels.
- [ ] Implement the supplied architecture using `SidebarProvider`, `Sidebar`, `SidebarRail`, `SidebarTrigger`, configuration-driven navigation, breadcrumbs, and responsive mobile behavior.
- [ ] Use only semantic shadcn color classes; remove hardcoded status colors from adapted guide patterns.
- [ ] Add the HyprTrack mark, read-only local-data footer, and theme control.
- [ ] Run sidebar tests and commit once green.

### Task 6: Build Shared Dashboard Components

**Files:**
- Create: `next/components/dashboard/page-heading.tsx`
- Create: `next/components/dashboard/range-toggle.tsx`
- Create: `next/components/dashboard/stat-card.tsx`
- Create: `next/components/dashboard/activity-chart.tsx`
- Create: `next/components/dashboard/application-chart.tsx`
- Create: `next/components/dashboard/recent-activity.tsx`
- Create: `next/components/dashboard/data-state.tsx`
- Create: `next/hooks/use-dashboard-data.ts`
- Create: `next/lib/format.ts`
- Test: `next/tests/dashboard-components.test.tsx`

- [ ] Write failing tests for range selection, loading skeletons, API error alerts with retry, empty states, and minute formatting.
- [ ] Implement the shared fetch hook with abort handling and stable request keys.
- [ ] Compose shadcn Card, Chart, Table, Alert, Empty, and Skeleton components.
- [ ] Keep charts on shadcn chart tokens and ensure tooltips/labels are keyboard and screen-reader usable.
- [ ] Run tests and commit once green.

### Task 7: Implement Overview, Activity, And Applications

**Files:**
- Modify: `next/app/page.tsx`
- Create: `next/app/activity/page.tsx`
- Create: `next/app/applications/page.tsx`
- Create: `next/components/dashboard/activity-table.tsx`
- Create: `next/components/dashboard/activity-filters.tsx`
- Create: `next/components/dashboard/application-table.tsx`
- Create: `next/components/dashboard/application-detail.tsx`
- Test: `next/tests/pages.test.tsx`

- [ ] Write failing tests for overview metrics, range changes, activity search/filter/pagination, sortable columns, original-title expansion, and application detail opening.
- [ ] Build the overview with four metric cards, timeline, usage breakdown, and recent activity.
- [ ] Build the activity page with URL-backed filters and pagination.
- [ ] Build the applications ranking with a shadcn Sheet detail view.
- [ ] Confirm all controls update real component state and API requests.
- [ ] Run page tests and commit once green.

### Task 8: Implement Versioned Local Settings

**Files:**
- Create: `next/app/settings/page.tsx`
- Create: `next/lib/preferences.ts`
- Create: `next/hooks/use-preferences.ts`
- Test: `next/lib/preferences.test.ts`
- Test: `next/tests/settings.test.tsx`

- [ ] Write failing tests for defaults, versioned local-storage parsing, corrupt-data fallback, and preference updates.
- [ ] Implement productive-app selection, default range, table density, and theme settings.
- [ ] Display health/database status read-only and avoid any history-editing controls.
- [ ] Run settings tests and commit once green.

### Task 9: Documentation And Full Verification

**Files:**
- Modify: `README.md`
- Modify: `collector/README.md`
- Modify: `next/README.md`

- [ ] Run collector tests.
- [ ] Run Next.js unit/component tests, lint, typecheck, and production build.
- [ ] Start the collector once against a temporary database and verify a row is created.
- [ ] Start Next.js and verify `/api/health` and all dashboard routes.
- [ ] Verify desktop, collapsed desktop, and mobile sidebar states in a browser.
- [ ] Verify range controls, filters, pagination, detail sheet, settings persistence, light mode, and dark mode.
- [ ] Capture implementation screenshots and inspect them for hierarchy, typography, semantic colors, responsive behavior, and unfinished states.
- [ ] Remove temporary QA artifacts, run `git diff --check`, and commit documentation/final fixes.
