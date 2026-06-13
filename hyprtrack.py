#!/usr/bin/env python3

import argparse
import contextlib
import json
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path


DEFAULT_DATABASE = Path("hyprtrack.db")
DEFAULT_INTERVAL = 60
HYPRCTL_TIMEOUT = 5
IST = timezone(timedelta(hours=5, minutes=30), name="IST")
APP_LABELS = {
    "code": "VS Code",
    "code-oss": "VS Code",
    "visual studio code": "VS Code",
}


def initialize_database(db_path: Path) -> None:
    with contextlib.closing(sqlite3.connect(db_path)) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS activity_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sampled_at TEXT NOT NULL,
                app_class TEXT NOT NULL,
                window_title TEXT NOT NULL
            )
            """
        )
        connection.commit()


def get_active_window() -> tuple[str, str] | None:
    try:
        result = subprocess.run(
            ["hyprctl", "activewindow", "-j"],
            capture_output=True,
            text=True,
            check=True,
            timeout=HYPRCTL_TIMEOUT,
        )
    except FileNotFoundError:
        print("HyprTrack: hyprctl was not found.", file=sys.stderr)
        return None
    except subprocess.TimeoutExpired:
        print("HyprTrack: hyprctl timed out.", file=sys.stderr)
        return None
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or "").strip()
        message = f"HyprTrack: hyprctl failed with exit code {error.returncode}."
        if detail:
            message = f"{message} {detail}"
        print(message, file=sys.stderr)
        return None

    try:
        window = json.loads(result.stdout)
    except (json.JSONDecodeError, TypeError):
        print("HyprTrack: hyprctl returned invalid JSON.", file=sys.stderr)
        return None

    if not isinstance(window, dict):
        print("HyprTrack: hyprctl returned an invalid window object.", file=sys.stderr)
        return None

    app_class = window.get("class")
    window_title = window.get("title")
    if not isinstance(app_class, str) or not app_class.strip():
        print("HyprTrack: no active window was reported.", file=sys.stderr)
        return None
    if not isinstance(window_title, str):
        print("HyprTrack: active window title was invalid.", file=sys.stderr)
        return None

    return app_class, window_title


def normalize_window_title(app_class: str, window_title: str) -> str:
    normalized_class = app_class.strip()
    if normalized_class.casefold() != "zen":
        return APP_LABELS.get(
            normalized_class.casefold(),
            normalized_class,
        )

    title_without_browser = window_title.rsplit(" — ", 1)[0].strip()
    if " - " not in title_without_browser:
        return "Zen"

    service = title_without_browser.rsplit(" - ", 1)[1].strip()
    return service or "Zen"


def record_sample(db_path: Path) -> bool:
    initialize_database(db_path)
    active_window = get_active_window()
    if active_window is None:
        return False

    app_class, window_title = active_window
    window_title = normalize_window_title(app_class, window_title)
    sampled_at = datetime.now(IST).isoformat(timespec="seconds")

    with contextlib.closing(sqlite3.connect(db_path)) as connection:
        connection.execute(
            """
            INSERT INTO activity_samples (sampled_at, app_class, window_title)
            VALUES (?, ?, ?)
            """,
            (sampled_at, app_class, window_title),
        )
        connection.commit()

    return True


def run(db_path: Path, interval: int = DEFAULT_INTERVAL) -> None:
    next_sample = time.monotonic()

    try:
        while True:
            record_sample(db_path)
            next_sample += interval
            time.sleep(max(0.0, next_sample - time.monotonic()))
    except KeyboardInterrupt:
        print("\nHyprTrack stopped.", file=sys.stderr)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Record the active Hyprland window in SQLite."
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DATABASE,
        help="SQLite database path (default: ./hyprtrack.db)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Record one sample and exit.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        if args.once:
            return 0 if record_sample(args.db) else 1

        run(args.db)
        return 0
    except (OSError, sqlite3.Error) as error:
        print(f"HyprTrack: database error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
