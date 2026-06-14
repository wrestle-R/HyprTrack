# HyprTrack

HyprTrack is a small, local Hyprland activity logger. It listens for active
window and browser-title events and stores timed activity intervals in SQLite.
Hyprland window addresses distinguish separate windows, and distinct active
browser-title events are recorded immediately without a settling delay.

## Requirements

- Python 3.10 or newer
- Hyprland with `hyprctl` available in `PATH`

## Usage

Start continuous tracking from the directory where the database should live:

```bash
python3 hyprtrack.py
```

Record one sample for testing:

```bash
python3 hyprtrack.py --once
```

Use a different database path:

```bash
python3 hyprtrack.py --db /path/to/activity.db
```

The default database is `./hyprtrack.db`. Timestamps use IST (`+05:30`). Zen
and Brave titles are reduced to service names such as `YouTube`, `Claude`,
`ChatGPT`, `WhatsApp`, `GitHub`, `LeetCode`, and `Vercel`. Other windows store
only the application name, such as `VS Code` or `Terminal`. Known personal
sites are grouped under `Personal Websites`. A valid missing-window state
pauses tracking. A malformed event or `hyprctl` error is printed to stderr
without closing the current activity interval.

Each row also includes `window_full`, containing the original unmodified
Hyprland title. New rows include `ended_at` and `last_seen_at`. The collector
checkpoints `last_seen_at` once per minute so an interval interrupted by a
power loss is recovered without counting powered-off time. A per-database
process lock prevents multiple collectors from writing concurrently.

Stop continuous tracking with `Ctrl+C`.

## Inspect the data

Using the SQLite command-line client:

```bash
sqlite3 hyprtrack.db \
  "SELECT sampled_at, ended_at, last_seen_at, app_class, window_title FROM activity_samples ORDER BY sampled_at DESC LIMIT 20;"
```

Summarize completed duration by application:

```bash
sqlite3 hyprtrack.db \
  "SELECT app_class, ROUND(SUM((julianday(COALESCE(ended_at, last_seen_at)) - julianday(sampled_at)) * 1440), 1) AS minutes FROM activity_samples WHERE COALESCE(ended_at, last_seen_at) IS NOT NULL GROUP BY app_class ORDER BY minutes DESC;"
```

Rows created by older HyprTrack versions remain valid one-minute samples.

## Tests

```bash
python3 -m unittest discover -s tests -v
```
