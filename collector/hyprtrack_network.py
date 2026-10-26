"""Process-level network accounting and transactional 30-day compaction.

The native NetHogs executable owns capture privileges. This module, the
Hyprland collector and the desktop always run unprivileged. No packet content,
connection addresses, command lines or browser titles are stored here.
"""

import contextlib
import os
import selectors
import signal
import sqlite3
import subprocess
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

IST = timezone(timedelta(hours=5, minutes=30))
SCHEMA_PATH = Path(__file__).with_name("network-schema.sql")
CAPTURE_PATH = Path("/usr/local/libexec/hyprtrack/nethogs")
FLUSH_SECONDS = 5
MAX_FRAME_PROCESSES = 65536


def connect(db_path):
    connection = sqlite3.connect(db_path, timeout=5)
    connection.execute("PRAGMA busy_timeout=5000")
    return connection


def initialize(db_path):
    with contextlib.closing(connect(db_path)) as connection:
        connection.executescript(SCHEMA_PATH.read_text())


def set_status(db_path, state, detail, now=None):
    with contextlib.closing(connect(db_path)) as connection, connection:
        connection.execute(
            "INSERT OR REPLACE INTO network_status VALUES (1, ?, ?, ?)",
            (state, detail, int(time.time() if now is None else now)),
        )


def day_parts(start, end):
    """Yield IST day and elapsed seconds; split cross-midnight intervals."""
    cursor = datetime.fromtimestamp(start, IST)
    stop = datetime.fromtimestamp(end, IST)
    while cursor < stop:
        midnight = cursor.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        boundary = min(midnight, stop)
        yield cursor.date().isoformat(), (boundary - cursor).total_seconds()
        cursor = boundary


def compact_history(db_path, now=None, batch_size=5000):
    """Summarize then delete in ONE transaction. Retain 30 full IST days + today.

    Existing activity detail crossing the cutoff stays until its whole closed
    interval is eligible. Malformed/open activity rows are never deleted.
    SQLite reuses freed pages; no blocking full VACUUM runs in the collector.
    """
    now = datetime.now(IST) if now is None else now.astimezone(IST)
    cutoff = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=30)
    cutoff_ts = int(cutoff.timestamp())
    with contextlib.closing(connect(db_path)) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        # Bound work per pass so normal collection and dashboard reads can proceed.
        rows = connection.execute(
            "SELECT rowid, sampled_at, app_id, app_name, scope, rx_bytes, tx_bytes "
            "FROM network_samples WHERE sampled_at < ? ORDER BY sampled_at LIMIT ?",
            (cutoff_ts, batch_size),
        ).fetchall()
        totals = defaultdict(lambda: [0, 0, ""])
        for rowid, ts, app_id, name, scope, rx, tx in rows:
            key = (datetime.fromtimestamp(ts, IST).date().isoformat(), app_id, scope)
            totals[key][0] += rx
            totals[key][1] += tx
            totals[key][2] = name
        for (day, app_id, scope), (rx, tx, name) in totals.items():
            before = connection.execute(
                "SELECT rx_bytes, tx_bytes FROM network_daily_summaries "
                "WHERE day=? AND app_id=? AND scope=?", (day, app_id, scope)
            ).fetchone() or (0, 0)
            connection.execute(
                "INSERT INTO network_daily_summaries VALUES (?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(day, app_id, scope) DO UPDATE SET "
                "rx_bytes=rx_bytes+excluded.rx_bytes, tx_bytes=tx_bytes+excluded.tx_bytes",
                (day, app_id, name, scope, rx, tx),
            )
            after = connection.execute(
                "SELECT rx_bytes, tx_bytes FROM network_daily_summaries "
                "WHERE day=? AND app_id=? AND scope=?", (day, app_id, scope)
            ).fetchone()
            if after != (before[0] + rx, before[1] + tx):
                raise sqlite3.IntegrityError("Network summary verification failed")
        connection.executemany("DELETE FROM network_samples WHERE rowid=?", [(r[0],) for r in rows])

        coverage = connection.execute(
            "SELECT started_at, ended_at FROM network_coverage WHERE ended_at<=? LIMIT ?",
            (cutoff_ts, batch_size),
        ).fetchall()
        for start, end in coverage:
            for day, seconds in day_parts(start, end):
                connection.execute(
                    "INSERT INTO network_daily_coverage VALUES (?, ?) ON CONFLICT(day) "
                    "DO UPDATE SET observed_seconds=observed_seconds+excluded.observed_seconds",
                    (day, int(seconds)),
                )
            connection.execute("DELETE FROM network_coverage WHERE started_at=?", (start,))

        table_exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE name='activity_samples'"
        ).fetchone()
        activity_count = 0
        if table_exists:
            old = connection.execute(
                "SELECT id, sampled_at, ended_at, last_seen_at, app_class FROM activity_samples "
                "WHERE julianday(sampled_at)<julianday(?) AND "
                "(ended_at IS NOT NULL OR last_seen_at IS NULL) "
                "ORDER BY sampled_at LIMIT ?", (cutoff.isoformat(), batch_size)
            ).fetchall()
            for rowid, start_text, end_text, seen, app in old:
                try:
                    start = datetime.fromisoformat(start_text)
                    if start.tzinfo is None:
                        start = start.replace(tzinfo=IST)
                    end = datetime.fromisoformat(end_text) if end_text else start + timedelta(minutes=1)
                    if end.tzinfo is None:
                        end = end.replace(tzinfo=IST)
                    if end > cutoff or end < start:
                        continue
                except (ValueError, TypeError, OverflowError):
                    continue
                for day, seconds in day_parts(start.timestamp(), end.timestamp()):
                    connection.execute(
                        "INSERT INTO activity_daily_summaries VALUES (?, ?, ?, 1) "
                        "ON CONFLICT(day, app_class) DO UPDATE SET "
                        "seconds=seconds+excluded.seconds, interval_count=interval_count+1",
                        (day, app, seconds),
                    )
                # A successful INSERT and DELETE share the same durable commit.
                connection.execute("DELETE FROM activity_samples WHERE id=?", (rowid,))
                activity_count += 1
        connection.execute(
            "INSERT OR REPLACE INTO history_maintenance VALUES (1, ?, ?)",
            (cutoff.isoformat(), int(now.timestamp())),
        )
        return len(rows) + len(coverage) + activity_count


APP_ALIASES = {
    "zen": ("zen", "Zen"), "zen-bin": ("zen", "Zen"),
    "zen-browser": ("zen", "Zen"), "zenbrowser": ("zen", "Zen"),
    "firefox": ("firefox", "Firefox"), "firefox-bin": ("firefox", "Firefox"),
    "brave": ("brave", "Brave"), "brave-browser": ("brave", "Brave"),
    "brave-origin": ("brave", "Brave"), "brave-origin-nightly": ("brave", "Brave"),
    "chrome": ("chrome", "Chrome"), "google-chrome": ("chrome", "Chrome"),
    "chromium": ("chromium", "Chromium"),
    "code": ("code", "VS Code"), "code-oss": ("code", "VS Code"),
    "spotify": ("spotify", "Spotify"), "discord": ("discord", "Discord"),
    "stremio": ("stremio", "Stremio"),
}


def app_identity(executable, uid, pid):
    if pid == 0 or executable.lower().startswith("unknown"):
        return "unattributed", "Unattributed", "unknown"
    name = Path(executable).name.lower().removesuffix(" (deleted)")
    # Mozilla children can report their helper executable instead of the browser.
    if name in ("plugin-container", "socket process", "web content"):
        parent = Path(executable).parent.name.lower()
        if parent in APP_ALIASES:
            name = parent
    app_id, label = APP_ALIASES.get(name, (name, Path(executable).name))
    return app_id[:200], label[:200], "system" if uid < 1000 else "app"


def parse_trace_line(line):
    """NetHogs -t -v 2: executable/pid/uid TAB cumulative-TX TAB cumulative-RX."""
    try:
        process, sent, received = line.strip().split("\t")
        executable, pid_text, uid_text = process.rsplit("/", 2)
        pid, uid = int(pid_text), int(uid_text)
        tx, rx = Decimal(sent), Decimal(received)
        if pid < 0 or uid < 0 or not tx.is_finite() or not rx.is_finite():
            return None
        if min(tx, rx) < 0 or max(tx, rx) > 2**63 - 1:
            return None
        return executable, pid, uid, int(rx), int(tx)
    except (ValueError, InvalidOperation):
        return None


def physical_interfaces(sys_net=Path("/sys/class/net")):
    """One capture layer: physical interfaces only, excluding VPN/bridge/veth copies."""
    result = []
    for entry in sys_net.iterdir():
        if (entry / "device").exists():
            try:
                if (entry / "operstate").read_text().strip() in ("up", "unknown"):
                    result.append(entry.name)
            except OSError:
                pass
    return sorted(result)


class TraceAccumulator:
    def __init__(self):
        self.previous = {}
        self.pending = defaultdict(lambda: [0, 0])
        self.frames = 0
        self.frame = {}

    def observe(self, row):
        executable, pid, uid, rx, tx = row
        # NetHogs cumulative mode retains process totals until its own restart.
        # Do not change identity to a re-used /proc PID while reading older totals.
        key = (executable, pid, uid)
        self.frame[key] = (rx, tx)

    def finish_frame(self):
        # NetHogs may move an existing connection out of unknown into a named
        # process. Those older bytes were already counted. Keep their historical
        # ownership unknown instead of counting them a second time under the app.
        def unknown_totals(frame):
            return [sum(value[axis] for (executable, pid, uid), value in frame.items()
                        if app_identity(executable, uid, pid)[2] == "unknown") for axis in (0, 1)]
        previous_unknown, current_unknown = unknown_totals(self.previous), unknown_totals(self.frame)
        credit = [max(0, previous_unknown[axis] - current_unknown[axis]) for axis in (0, 1)]
        for key, current in self.frame.items():
            previous = self.previous.get(key, (0, 0))
            identity = app_identity(key[0], key[2], key[1])
            for axis in (0, 1):
                delta = max(0, current[axis] - previous[axis])
                if identity[2] != "unknown":
                    transferred = min(delta, credit[axis])
                    credit[axis] -= transferred
                    delta -= transferred
                self.pending[identity][axis] += delta
        self.previous = self.frame
        self.frame = {}

    def flush(self, db_path, start, end):
        # Store point measurements at their observation time, not invented times
        # within the sample interval. Coverage independently represents true zero.
        with contextlib.closing(connect(db_path)) as connection, connection:
            for (app_id, label, scope), (rx, tx) in self.pending.items():
                if rx or tx:
                    connection.execute(
                        "INSERT INTO network_samples VALUES (?, ?, ?, ?, ?, ?) "
                        "ON CONFLICT(sampled_at, app_id, scope) DO UPDATE SET "
                        "rx_bytes=rx_bytes+excluded.rx_bytes, tx_bytes=tx_bytes+excluded.tx_bytes",
                        (end, app_id, label, scope, rx, tx),
                    )
            if end > start:
                connection.execute("INSERT OR IGNORE INTO network_coverage VALUES (?, ?)", (start, end))
            connection.execute("INSERT OR REPLACE INTO network_status VALUES (1, 'recording', '', ?)", (end,))
        self.pending.clear()


def capture(db_path, stop_event, interfaces):
    # Fixed administrator-owned executable. Never sudo or execute an arbitrary
    # environment-provided command from the collector.
    process = subprocess.Popen(
        [str(CAPTURE_PATH), "-t", "-v", "2", "-d", "1", "-C", *interfaces],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0,
        env={"PATH": "/usr/bin:/bin", "LC_ALL": "C"},
    )
    accumulator = TraceAccumulator()
    started = int(time.time())
    flushed = started
    last_frame = time.monotonic()
    next_maintenance = time.monotonic() + 3600
    frame_seen = False
    buffer = b""
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while not stop_event.is_set():
                for key, _ in selector.select(timeout=1):
                    payload = os.read(key.fd, 65536)
                    if not payload:
                        raise OSError("NetHogs stopped. Check the installed capture permissions.")
                    buffer += payload
                    if len(buffer) > 2**20:
                        raise OSError("Unexpected capture output; collection stopped.")
                    while b"\n" in buffer:
                        raw, buffer = buffer.split(b"\n", 1)
                        line = raw.decode("utf-8", errors="replace")
                        if line.strip() == "Refreshing:":
                            if frame_seen:
                                accumulator.finish_frame()
                            frame_seen = True
                            last_frame = time.monotonic()
                            accumulator.frames += 1
                        elif frame_seen:
                            row = parse_trace_line(line)
                            if row is not None:
                                accumulator.observe(row)
                                if len(accumulator.frame) > MAX_FRAME_PROCESSES:
                                    raise OSError("Capture process limit reached; restarting counters.")
                if process.poll() is not None or time.monotonic() - last_frame > 15:
                    raise OSError("Capture heartbeat stopped. Check network permissions and interfaces.")
                now = int(time.time())
                if frame_seen and now - flushed >= FLUSH_SECONDS:
                    if now - flushed > 15:  # suspend/clock jump: do not invent covered time
                        flushed = now
                    accumulator.flush(db_path, flushed, now)
                    flushed = now
                    if time.monotonic() >= next_maintenance:
                        changed = compact_history(db_path)
                        next_maintenance = time.monotonic() + (5 if changed >= 5000 else 3600)
                if physical_interfaces() != interfaces:
                    raise OSError("Network interfaces changed; reconnecting capture.")
    finally:
        process.send_signal(signal.SIGINT) if process.poll() is None else None
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        if frame_seen and accumulator.pending:
            ended = int(time.time())
            accumulator.flush(db_path, flushed if 0 <= ended - flushed <= 15 else ended, ended)
        if process.stdout:
            process.stdout.close()


def run_network_worker(db_path, stop_event):
    initialize(db_path)
    next_maintenance = 0
    while not stop_event.is_set():
        try:
            if time.monotonic() >= next_maintenance:
                changed = compact_history(db_path)
                next_maintenance = time.monotonic() + (5 if changed >= 5000 else 3600)
            if not CAPTURE_PATH.is_file():
                set_status(db_path, "setup_required", "Set up the native collector to start recording internet usage.")
                stop_event.wait(30)
                continue
            interfaces = physical_interfaces()
            if not interfaces:
                set_status(db_path, "offline", "No active physical network interface. Tracking will resume automatically.")
                stop_event.wait(5)
                continue
            set_status(db_path, "starting", "Connecting to the native collector.")
            capture(db_path, stop_event, interfaces)
        except (OSError, sqlite3.Error, ValueError) as error:
            # No native stdout/stderr is persisted: it may contain addresses.
            message = ("The usage database is busy or unavailable. Collection will retry."
                       if isinstance(error, sqlite3.Error) else str(error))
            try:
                set_status(db_path, "error", message)
            except sqlite3.Error:
                pass
            stop_event.wait(10)
    set_status(db_path, "stopped", "The HyprTrack collector is stopped.")
