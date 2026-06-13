# HyprTrack

HyprTrack is a small, local Hyprland activity logger. It samples the active
window once per minute and stores a compact activity label in SQLite.

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
Browser titles are reduced to their service name, such as `YouTube`, `Claude`,
or `ChatGPT`. Other windows store only the application name, such as `VS Code`.
A missing active window or a `hyprctl` error is printed to stderr and creates
no activity row.

Stop continuous tracking with `Ctrl+C`.

## Inspect the data

Using the SQLite command-line client:

```bash
sqlite3 hyprtrack.db \
  "SELECT sampled_at, app_class, window_title FROM activity_samples ORDER BY sampled_at DESC LIMIT 20;"
```

Summarize the number of samples by application:

```bash
sqlite3 hyprtrack.db \
  "SELECT app_class, COUNT(*) AS samples FROM activity_samples GROUP BY app_class ORDER BY samples DESC;"
```

Each sample represents approximately one minute of activity.

## Tests

```bash
python3 -m unittest discover -s tests -v
```
