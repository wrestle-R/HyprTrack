# HyprTrack Dashboard Design

## Goal

Build a polished, responsive HyprTrack analytics dashboard in a new `next/`
application. Preserve the existing Python tracker as an independently runnable
collector under `collector/`, and read its SQLite database directly from
Next.js route handlers.

## Repository Structure

```text
HyprTrack/
├── collector/
│   ├── hyprtrack.py
│   ├── hyprtrack.db
│   ├── tests/
│   └── README.md
├── next/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── public/
└── README.md
```

The current Python source, tests, database, and collector documentation move to
`collector/`. The repository-level README becomes a short guide to the two
parts of the project.

## Application Architecture

The dashboard is a Next.js App Router application with TypeScript and shadcn/ui.
It uses the supplied tweakcn registry theme:

```bash
npx shadcn@latest add https://tweakcn.com/r/themes/cmjgilzlg000404ju2wgs7uj9
```

There is no separate Node.js server. Next.js route handlers are the only web
backend. A server-only SQLite module opens
`../collector/hyprtrack.db` in read-only mode, validates the schema, and exposes
focused query functions. Route handlers return JSON for overview metrics,
timeline data, application summaries, and paginated activity.

Database access must not be bundled into client components. SQL inputs use
bound parameters, date ranges are validated, and API failures return a stable
error shape without leaking filesystem details.

## Sidebar And Layout

The shell follows the supplied sidebar guide:

- `SidebarProvider` owns expanded, collapsed, and mobile drawer state.
- The desktop sidebar uses `collapsible="icon"` and includes `SidebarRail`.
- The mobile sidebar opens as the shadcn responsive drawer.
- Navigation is type-safe and configuration-driven.
- Active routes use exact or prefix matching and remain visible without relying
  on color alone.
- A sticky top bar contains `SidebarTrigger`, breadcrumbs, date range controls,
  and theme switching.
- Tooltips identify icon-only navigation when collapsed.
- Sidebar state persists through the shadcn sidebar cookie behavior.

The HyprTrack navigation is intentionally shallow:

- Overview: `/`
- Activity: `/activity`
- Applications: `/applications`
- Settings: `/settings`

The sidebar header shows the HyprTrack wordmark and a compact tracking-status
indicator. The footer contains a theme control and a local-data label. There is
no authentication or sign-out flow because this is a local dashboard.

## Visual System

The tweakcn theme is the source of truth. Components use semantic shadcn colors
such as `background`, `foreground`, `card`, `muted`, `primary`, `accent`,
`border`, `destructive`, and chart tokens. No hardcoded palette classes or
custom hex colors are introduced.

The dashboard should feel refined but restrained:

- Strong typography and generous spacing
- Clear hierarchy with compact utility text
- Subtle borders and elevation from the active shadcn theme
- Consistent card, table, input, badge, and chart treatment
- Purposeful hover, focus, selected, loading, and empty states
- Light and dark modes using the same semantic token system
- Motion limited to sidebar transitions, chart entry, and small state changes
  with reduced-motion support

## Pages And Features

### Overview

The overview provides a useful first viewport:

- Tracked time for the selected period
- Productive time based on configurable productive applications
- Most-used application
- Daily activity streak
- Activity timeline chart
- Application usage breakdown
- Recent activity list

The default range is the current day in IST, matching collector timestamps.
Controls also provide seven-day and thirty-day views.

### Activity

The activity page contains:

- Date range filtering
- Search across normalized and full window titles
- Application filter
- Sortable timestamp and duration columns
- Paginated activity table
- Expandable access to the original `window_full` value
- Empty, loading, and database-error states

Consecutive samples with the same normalized application are grouped into
sessions for display. A session duration is the number of one-minute samples;
isolated samples count as one minute.

### Applications

The applications page contains:

- Ranked application usage
- Total minutes and percentage share
- Session count
- First and latest activity in the selected range
- Search and date range filtering
- Application detail drawer with recent sessions and original window examples

### Settings

Settings are local browser preferences and do not alter collector behavior:

- Theme: system, light, or dark
- Default dashboard date range
- Productive application selections
- Compact or comfortable table density

Preferences are versioned in local storage. The page clearly identifies the
resolved SQLite database path and read-only connection status without exposing
controls that imply the dashboard can edit tracked history.

## Data Contracts

The API exposes:

- `GET /api/overview?range=today|7d|30d`
- `GET /api/timeline?range=today|7d|30d`
- `GET /api/applications?range=...&search=...`
- `GET /api/activity?range=...&app=...&search=...&page=...&pageSize=...`
- `GET /api/health`

Responses include explicit timestamps, minute counts, percentages, pagination
metadata, and the effective IST range. The client never derives totals from a
partially paginated result.

## Error Handling

Route handlers distinguish missing database, invalid schema, invalid query
parameters, and query failure. UI errors use shadcn `Alert` with a retry action.
Empty datasets use the shadcn empty-state pattern. Loading states use skeletons
that preserve the final layout.

The dashboard remains navigable when the database is empty or temporarily
unavailable.

## Testing And Verification

- Keep and update the Python collector unit tests after the folder move.
- Add unit tests for range parsing, session grouping, and metric calculations.
- Add route-handler tests against a temporary SQLite fixture.
- Add component tests for active sidebar state, filters, empty states, and
  pagination.
- Run Python tests, Next.js lint, type checking, tests, and production build.
- Run the app and verify desktop and mobile layouts in a browser.
- Verify sidebar expansion, collapsed tooltips, mobile drawer, breadcrumbs,
  date filtering, search, pagination, theme switching, and database errors.
- Compare the rendered dashboard against the accepted design direction and
  inspect screenshots before completion.

## Scope Boundaries

This version does not add authentication, cloud synchronization, database
editing, WebSockets, a second backend service, or changes to the collector's
sampling behavior. The dashboard is a read-only local analytics surface over
the existing SQLite data.
