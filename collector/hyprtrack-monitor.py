#!/usr/bin/env python3

import argparse
import contextlib
import fcntl
import json
import os
import re
import signal
import socket
import sqlite3
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Event


DEFAULT_DATABASE = Path(__file__).resolve().with_name("hyprtrack.db")
CHECKPOINT_INTERVAL = 15
MAX_RECONNECT_DELAY = 5.0
SUSPEND_GAP_SECONDS = 5.0
HYPRCTL_TIMEOUT = 5
IST = timezone(timedelta(hours=5, minutes=30), name="IST")
APP_LABELS = {
    "code": "VS Code",
    "code-oss": "VS Code",
    "com.microsoft.vscode": "VS Code",
    "vscode": "VS Code",
    "visual studio code": "VS Code",
    "kitty": "Terminal",
    "com.stremio.stremio": "Stremio",
    "tauri": "HyprTrack Desktop App",
    "hyprtrack-desktop": "HyprTrack Desktop App",
}
ZEN_SERVICES = {
    "chatgpt": "ChatGPT",
    "claude": "Claude",
    "github": "GitHub",
    "leetcode": "LeetCode",
    "vercel": "Vercel",
    "whatsapp": "WhatsApp",
    "x.com": "X",
    "youtube": "YouTube",
}
GITHUB_REPOSITORY_TITLE = re.compile(
    r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"
)
PERSONAL_WEBSITE_TITLES = {
    "home | blogs",
    "running out of excuses",
    "russel daniel paul",
}
BROWSER_SUFFIXES = {
    "zen": (" — Zen Browser",),
    "brave": (" - Brave",),
    "brave-browser": (" - Brave",),
    "brave-origin": (" - Brave Origin",),
    "brave-origin-nightly": (" - Brave Origin",),
}
BROWSER_CLASSES = frozenset(BROWSER_SUFFIXES)


@dataclass(frozen=True)
class WindowInfo:
    address: str
    app_class: str
    title: str


@dataclass(frozen=True)
class ActiveWindowResult:
    status: str
    window: WindowInfo | None = None


def normalize_address(address: str) -> str:
    normalized = address.strip().casefold()
    return normalized[2:] if normalized.startswith("0x") else normalized


def initialize_database(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with contextlib.closing(sqlite3.connect(db_path)) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS activity_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sampled_at TEXT NOT NULL,
                app_class TEXT NOT NULL,
                window_title TEXT NOT NULL,
                window_full TEXT NOT NULL,
                ended_at TEXT,
                last_seen_at TEXT,
                window_address TEXT
            )
            """
        )
        columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(activity_samples)"
            )
        }
        if "window_full" not in columns:
            connection.execute(
                "ALTER TABLE activity_samples "
                "ADD COLUMN window_full TEXT NOT NULL DEFAULT ''"
            )
        if "ended_at" not in columns:
            connection.execute(
                "ALTER TABLE activity_samples ADD COLUMN ended_at TEXT"
            )
        if "last_seen_at" not in columns:
            connection.execute(
                "ALTER TABLE activity_samples ADD COLUMN last_seen_at TEXT"
            )
        if "window_address" not in columns:
            connection.execute(
                "ALTER TABLE activity_samples ADD COLUMN window_address TEXT"
            )
        connection.commit()


def query_active_window() -> ActiveWindowResult:
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
        return ActiveWindowResult("error")
    except subprocess.TimeoutExpired:
        print("HyprTrack: hyprctl timed out.", file=sys.stderr)
        return ActiveWindowResult("error")
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or "").strip()
        message = f"HyprTrack: hyprctl failed with exit code {error.returncode}."
        if detail:
            message = f"{message} {detail}"
        print(message, file=sys.stderr)
        return ActiveWindowResult("error")

    try:
        window = json.loads(result.stdout)
    except (json.JSONDecodeError, TypeError):
        print("HyprTrack: hyprctl returned invalid JSON.", file=sys.stderr)
        return ActiveWindowResult("error")

    if not isinstance(window, dict):
        print("HyprTrack: hyprctl returned an invalid window object.", file=sys.stderr)
        return ActiveWindowResult("error")

    app_class = window.get("class")
    window_title = window.get("title")
    address = window.get("address", "")
    if not app_class and not window_title:
        print("HyprTrack: no active window was reported.", file=sys.stderr)
        return ActiveWindowResult("none")
    if not isinstance(app_class, str) or not app_class.strip():
        print("HyprTrack: active window class was invalid.", file=sys.stderr)
        return ActiveWindowResult("error")
    if not isinstance(window_title, str):
        print("HyprTrack: active window title was invalid.", file=sys.stderr)
        return ActiveWindowResult("error")

    return ActiveWindowResult(
        "active",
        WindowInfo(
            normalize_address(address) if isinstance(address, str) else "",
            app_class,
            window_title,
        ),
    )


def get_active_window() -> tuple[str, str] | None:
    result = query_active_window()
    if result.status != "active" or result.window is None:
        return None
    return result.window.app_class, result.window.title


def query_clients() -> dict[str, WindowInfo]:
    try:
        result = subprocess.run(
            ["hyprctl", "clients", "-j"],
            capture_output=True,
            text=True,
            check=True,
            timeout=HYPRCTL_TIMEOUT,
        )
    except (
        FileNotFoundError,
        subprocess.TimeoutExpired,
        subprocess.CalledProcessError,
    ) as error:
        print(f"HyprTrack: could not query clients: {error}", file=sys.stderr)
        return {}

    try:
        clients = json.loads(result.stdout)
    except (json.JSONDecodeError, TypeError):
        print("HyprTrack: hyprctl clients returned invalid JSON.", file=sys.stderr)
        return {}
    if not isinstance(clients, list):
        print("HyprTrack: hyprctl clients returned invalid data.", file=sys.stderr)
        return {}

    windows: dict[str, WindowInfo] = {}
    for client in clients:
        if not isinstance(client, dict):
            continue
        address = client.get("address")
        app_class = client.get("class")
        title = client.get("title")
        if (
            not isinstance(address, str)
            or not normalize_address(address)
            or not isinstance(app_class, str)
            or not app_class.strip()
            or not isinstance(title, str)
        ):
            continue
        normalized_address = normalize_address(address)
        windows[normalized_address] = WindowInfo(
            normalized_address,
            app_class,
            title,
        )
    return windows


def normalize_window_title(app_class: str, window_title: str) -> str:
    normalized_class = app_class.strip()
    class_key = normalized_class.casefold()
    if class_key not in BROWSER_SUFFIXES:
        return APP_LABELS.get(
            class_key,
            normalized_class,
        )

    title_without_browser = window_title.strip()
    for suffix in BROWSER_SUFFIXES[class_key]:
        if title_without_browser.endswith(suffix):
            title_without_browser = title_without_browser[: -len(suffix)].strip()
            break

    folded_title = title_without_browser.casefold()
    if folded_title in PERSONAL_WEBSITE_TITLES:
        return "Personal Websites"

    if (
        folded_title == "x"
        or folded_title.startswith("x ")
        or folded_title.endswith(" on x:")
        or " on x: " in folded_title
    ):
        return "X"

    for marker, label in ZEN_SERVICES.items():
        if marker in folded_title:
            return label

    if GITHUB_REPOSITORY_TITLE.fullmatch(title_without_browser):
        return "GitHub"

    repository_context = title_without_browser.rsplit(" · ", 1)
    if len(repository_context) == 2 and GITHUB_REPOSITORY_TITLE.fullmatch(repository_context[1]):
        return "GitHub"

    if " - " in title_without_browser:
        service = title_without_browser.rsplit(" - ", 1)[1].strip()
        if service:
            return service

    if (
        title_without_browser
        and not title_without_browser.startswith("(")
        and " - " not in title_without_browser
        and " | " not in title_without_browser
        and " · " not in title_without_browser
        and len(title_without_browser.split()) >= 3
    ):
        return "ChatGPT"

    return title_without_browser or "Zen"


def record_sample(db_path: Path) -> bool:
    initialize_database(db_path)
    active_window = get_active_window()
    if active_window is None:
        return False

    app_class, window_full = active_window
    window_title = normalize_window_title(app_class, window_full)
    sampled_at = datetime.now(IST).isoformat(timespec="seconds")

    with contextlib.closing(sqlite3.connect(db_path)) as connection:
        connection.execute(
            """
            INSERT INTO activity_samples (
                sampled_at,
                app_class,
                window_title,
                window_full
            )
            VALUES (?, ?, ?, ?)
            """,
            (sampled_at, app_class, window_title, window_full),
        )
        connection.commit()

    return True


def recover_interrupted_activity(db_path: Path) -> int:
    initialize_database(db_path)
    with contextlib.closing(sqlite3.connect(db_path)) as connection:
        cursor = connection.execute(
            """
            UPDATE activity_samples
            SET ended_at = last_seen_at
            WHERE ended_at IS NULL
              AND last_seen_at IS NOT NULL
            """
        )
        connection.commit()
        return cursor.rowcount


class ActivityTracker:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.current_id: int | None = None
        self.current_window: tuple[str, str, str] | None = None
        initialize_database(db_path)

    @property
    def current_app_class(self) -> str | None:
        return self.current_window[1] if self.current_window else None

    def observe(
        self,
        window: tuple[str, str],
        observed_at: str,
        *,
        address: str = "",
    ) -> str:
        app_class, window_full = window
        identity = (
            normalize_address(address),
            app_class,
            window_full,
        )
        if identity == self.current_window:
            return "unchanged"

        window_title = normalize_window_title(app_class, window_full)
        with contextlib.closing(sqlite3.connect(self.db_path)) as connection:
            if self.current_id is not None:
                connection.execute(
                    """
                    UPDATE activity_samples
                    SET ended_at = ?, last_seen_at = ?
                    WHERE id = ? AND ended_at IS NULL
                    """,
                    (observed_at, observed_at, self.current_id),
                )
            cursor = connection.execute(
                """
                INSERT INTO activity_samples (
                    sampled_at,
                    app_class,
                    window_title,
                    window_full,
                    ended_at,
                    last_seen_at,
                    window_address
                )
                VALUES (?, ?, ?, ?, NULL, ?, ?)
                """,
                (
                    observed_at,
                    app_class,
                    window_title,
                    window_full,
                    observed_at,
                    identity[0] or None,
                ),
            )
            connection.commit()

        action = "changed" if self.current_id is not None else "started"
        self.current_id = cursor.lastrowid
        self.current_window = identity
        return action

    def checkpoint(self, observed_at: str) -> bool:
        if self.current_id is None:
            return False
        with contextlib.closing(sqlite3.connect(self.db_path)) as connection:
            cursor = connection.execute(
                """
                UPDATE activity_samples
                SET last_seen_at = ?
                WHERE id = ? AND ended_at IS NULL
                """,
                (observed_at, self.current_id),
            )
            connection.commit()
            return cursor.rowcount == 1

    def pause(self, observed_at: str) -> bool:
        if self.current_id is None:
            return False
        with contextlib.closing(sqlite3.connect(self.db_path)) as connection:
            cursor = connection.execute(
                """
                UPDATE activity_samples
                SET ended_at = ?, last_seen_at = ?
                WHERE id = ? AND ended_at IS NULL
                """,
                (observed_at, observed_at, self.current_id),
            )
            connection.commit()
        self.current_id = None
        self.current_window = None
        return cursor.rowcount == 1

    def close(self, observed_at: str) -> bool:
        return self.pause(observed_at)

    def interrupt(self) -> bool:
        if self.current_id is None:
            return False
        with contextlib.closing(sqlite3.connect(self.db_path)) as connection:
            cursor = connection.execute(
                """
                UPDATE activity_samples
                SET ended_at = last_seen_at
                WHERE id = ?
                  AND ended_at IS NULL
                  AND last_seen_at IS NOT NULL
                """,
                (self.current_id,),
            )
            connection.commit()
        self.current_id = None
        self.current_window = None
        return cursor.rowcount == 1


def now_ist() -> str:
    return datetime.now(IST).isoformat(timespec="milliseconds")


class EventClock:
    def __init__(self):
        self.last: datetime | None = None

    def now(self) -> str:
        current = datetime.now(IST)
        if self.last is not None and current <= self.last:
            current = self.last + timedelta(milliseconds=1)
        self.last = current
        return current.isoformat(timespec="milliseconds")


class EventProcessor:
    def __init__(
        self,
        tracker: ActivityTracker,
        windows: dict[str, WindowInfo],
        recover_active=None,
    ):
        self.tracker = tracker
        self.windows = {
            normalize_address(address): window
            for address, window in windows.items()
        }
        self.active_address: str | None = None
        self.recover_active = recover_active

    def _observe(self, window: WindowInfo, observed_at: str) -> str:
        self.windows[window.address] = window
        self.active_address = window.address
        return self.tracker.observe(
            (window.app_class, window.title),
            observed_at,
            address=window.address,
        )

    def bootstrap(
        self,
        active: ActiveWindowResult,
        observed_at: str,
    ) -> None:
        if active.status == "none":
            self.active_address = None
            self.tracker.pause(observed_at)
        elif active.status == "active" and active.window is not None:
            self._observe(active.window, observed_at)

    def handle(self, event_line: str, observed_at: str) -> str | None:
        event_name, separator, data = event_line.partition(">>")
        if not separator:
            return None

        if event_name == "activewindowv2":
            address = normalize_address(data)
            if not address:
                self.active_address = None
                self.tracker.pause(observed_at)
                return "paused"
            window = self.windows.get(address)
            if window is None and self.recover_active is not None:
                window = self.recover_active(address)
            if window is None:
                return None
            return self._observe(window, observed_at)

        if event_name == "windowtitlev2":
            address_text, title_separator, title = data.partition(",")
            if not title_separator:
                return None
            address = normalize_address(address_text)
            window = self.windows.get(address)
            if window is None:
                return None
            updated = WindowInfo(address, window.app_class, title)
            self.windows[address] = updated
            if (
                address == self.active_address
                and window.app_class.casefold() in BROWSER_CLASSES
            ):
                return self._observe(updated, observed_at)
            return None

        if event_name == "openwindow":
            parts = data.split(",", 3)
            if len(parts) != 4:
                return None
            address = normalize_address(parts[0])
            app_class = parts[2]
            if address and app_class:
                self.windows[address] = WindowInfo(
                    address,
                    app_class,
                    parts[3],
                )
            return None

        if event_name == "closewindow":
            address = normalize_address(data)
            self.windows.pop(address, None)
            if address == self.active_address:
                self.active_address = None
                self.tracker.pause(observed_at)
                return "paused"
        return None


@contextlib.contextmanager
def instance_lock(db_path: Path):
    lock_path = Path(f"{db_path}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock_file = lock_path.open("a+", encoding="utf-8")
    try:
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise OSError(
                f"HyprTrack is already running for {db_path}."
            ) from error
        yield
    finally:
        with contextlib.suppress(OSError):
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        lock_file.close()


def suspension_detected(
    *,
    previous_wall: float,
    current_wall: float,
    previous_monotonic: float,
    current_monotonic: float,
) -> bool:
    wall_elapsed = current_wall - previous_wall
    monotonic_elapsed = current_monotonic - previous_monotonic
    return wall_elapsed - monotonic_elapsed >= SUSPEND_GAP_SECONDS


def hyprland_event_socket_path() -> Path:
    runtime_dir = os.environ.get("XDG_RUNTIME_DIR")
    signature = os.environ.get("HYPRLAND_INSTANCE_SIGNATURE")
    if not runtime_dir or not signature:
        raise OSError("Hyprland session environment is unavailable.")
    return Path(runtime_dir) / "hypr" / signature / ".socket2.sock"


def recover_active_window(address: str) -> WindowInfo | None:
    normalized_address = normalize_address(address)
    active = query_active_window()
    if (
        active.status == "active"
        and active.window is not None
        and active.window.address == normalized_address
    ):
        return active.window
    return query_clients().get(normalized_address)


def listen_for_events(
    tracker: ActivityTracker,
    stop_event: Event,
    checkpoint_interval: int,
) -> None:
    event_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    event_socket.settimeout(1.0)
    try:
        event_socket.connect(str(hyprland_event_socket_path()))
        clock = EventClock()
        processor = EventProcessor(
            tracker,
            query_clients(),
            recover_active=recover_active_window,
        )
        processor.bootstrap(query_active_window(), clock.now())
        buffer = ""
        next_checkpoint = time.monotonic() + checkpoint_interval
        previous_wall = time.time()
        previous_monotonic = time.monotonic()

        while not stop_event.is_set():
            now = time.monotonic()
            timeout = max(0.01, min(1.0, next_checkpoint - now))
            event_socket.settimeout(timeout)

            try:
                payload = event_socket.recv(65536)
            except socket.timeout:
                payload = None

            current_wall = time.time()
            current_monotonic = time.monotonic()
            if suspension_detected(
                previous_wall=previous_wall,
                current_wall=current_wall,
                previous_monotonic=previous_monotonic,
                current_monotonic=current_monotonic,
            ):
                tracker.interrupt()
                processor = EventProcessor(
                    tracker,
                    query_clients(),
                    recover_active=recover_active_window,
                )
                processor.bootstrap(query_active_window(), clock.now())
                next_checkpoint = current_monotonic + checkpoint_interval
            previous_wall = current_wall
            previous_monotonic = current_monotonic

            if payload == b"":
                raise ConnectionError("Hyprland event socket disconnected.")
            if payload:
                buffer += payload.decode("utf-8", errors="replace")

            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                processor.handle(line, clock.now())

            now = time.monotonic()
            if now >= next_checkpoint:
                tracker.checkpoint(clock.now())
                next_checkpoint = now + checkpoint_interval
    finally:
        event_socket.close()


def _run(
    db_path: Path,
    checkpoint_interval: int = CHECKPOINT_INTERVAL,
) -> None:
    recover_interrupted_activity(db_path)
    tracker = ActivityTracker(db_path)
    stop_event = Event()
    previous_handlers: dict[int, object] = {}

    def request_stop(_signum, _frame) -> None:
        stop_event.set()

    for signum in (signal.SIGINT, signal.SIGTERM):
        previous_handlers[signum] = signal.getsignal(signum)
        signal.signal(signum, request_stop)

    try:
        reconnect_delay = 0.25
        while not stop_event.is_set():
            try:
                listen_for_events(
                    tracker,
                    stop_event,
                    checkpoint_interval,
                )
                reconnect_delay = 0.25
            except (ConnectionError, OSError) as error:
                if stop_event.is_set():
                    break
                print(
                    f"HyprTrack: event socket unavailable: {error}",
                    file=sys.stderr,
                )
                wait_wall = time.time()
                wait_monotonic = time.monotonic()
                stop_event.wait(reconnect_delay)
                if suspension_detected(
                    previous_wall=wait_wall,
                    current_wall=time.time(),
                    previous_monotonic=wait_monotonic,
                    current_monotonic=time.monotonic(),
                ):
                    tracker.interrupt()
                reconnect_delay = min(
                    reconnect_delay * 2,
                    MAX_RECONNECT_DELAY,
                )
    finally:
        tracker.close(now_ist())
        for signum, handler in previous_handlers.items():
            signal.signal(signum, handler)
        print("HyprTrack stopped.", file=sys.stderr)


def run(
    db_path: Path,
    checkpoint_interval: int = CHECKPOINT_INTERVAL,
) -> None:
    with instance_lock(db_path):
        _run(db_path, checkpoint_interval)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Record active Hyprland windows in the HyprTrack SQLite database."
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DATABASE,
        help="SQLite database path (default: hyprtrack.db next to this script)",
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
