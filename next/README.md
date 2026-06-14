# HyprTrack Dashboard

A local-first Next.js dashboard for the HyprTrack SQLite activity database.
The web app is read-only: the Python collector remains the only database
writer.

## Run

From this directory:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The default database is `../collector/hyprtrack.db`. Override it when needed:

```bash
HYPRTRACK_DB_PATH=/absolute/path/to/hyprtrack.db npm run dev
```

## Data Boundary

Dashboard queries select only:

- `sampled_at`
- `ended_at`
- `last_seen_at`
- `app_class`
- `window_title`

Durations come from completed activity intervals. Open intervals are counted
only through their latest checkpoint, and intervals are clipped to the selected
date range. Legacy rows without interval fields continue to contribute one
minute. Full browser titles remain private to the collector database.

## Checks

```bash
npm test
npm run lint
npm run typecheck
npm run build
```
