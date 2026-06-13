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
- `app_class`
- `window_title`

Durations are estimates: each sample contributes one minute. Matching
consecutive samples are grouped into sessions, and gaps over 90 seconds split a
session.

## Checks

```bash
npm test
npm run lint
npm run typecheck
npm run build
```
