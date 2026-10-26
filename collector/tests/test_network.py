import sqlite3
import importlib.util
import builtins
import contextlib
import sys
import tempfile
import time
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import hyprtrack_network as network


@contextlib.contextmanager
def database_connection(path):
    with contextlib.closing(sqlite3.connect(path)) as connection, connection:
        yield connection


class NetworkTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "test.db"
        network.initialize(self.path)
        with database_connection(self.path) as connection:
            connection.execute("CREATE TABLE activity_samples (id INTEGER PRIMARY KEY, sampled_at TEXT, ended_at TEXT, last_seen_at TEXT, app_class TEXT)")

    def test_trace_parser_handles_paths_scientific_notation_and_invalid_output(self):
        row = network.parse_trace_line("/opt/zen browser/zen/123/1000\t1.2e+06\t2000\n")
        self.assertEqual(row, ("/opt/zen browser/zen", 123, 1000, 2000, 1200000))
        for line in ("Refreshing:", "Unknown connection: private address", "/usr/bin/zen/1/1000\tnan\t1", "/usr/bin/zen/1/1000\t-1\t1"):
            self.assertIsNone(network.parse_trace_line(line))

    def test_identity_keeps_browser_helpers_together_and_terminal_commands_separate(self):
        self.assertEqual(network.app_identity("/opt/zen/plugin-container", 1000, 123), ("zen", "Zen", "app"))
        self.assertEqual(network.app_identity("/usr/bin/curl", 1000, 12), ("curl", "curl", "app"))
        self.assertEqual(network.app_identity("/usr/lib/systemd/systemd-resolved", 991, 21)[2], "system")
        self.assertEqual(network.app_identity("unknown UDP", 0, 0), ("unattributed", "Unattributed", "unknown"))

    def test_cumulative_samples_count_deltas_once_and_preserve_zero_coverage(self):
        accumulator = network.TraceAccumulator()
        row = ("/opt/zen/zen", 10, 1000, 1000, 100)
        accumulator.observe(row)
        accumulator.finish_frame()
        accumulator.flush(self.path, 100, 105)
        accumulator.observe(row)
        accumulator.finish_frame()
        accumulator.flush(self.path, 105, 110)
        accumulator.observe(("/opt/zen/zen", 10, 1000, 1500, 125))
        accumulator.finish_frame()
        accumulator.flush(self.path, 110, 115)
        with database_connection(self.path) as connection:
            self.assertEqual(connection.execute("SELECT SUM(rx_bytes), SUM(tx_bytes) FROM network_samples").fetchone(), (1500, 125))
            self.assertEqual(connection.execute("SELECT DISTINCT scope FROM network_samples").fetchone()[0], "app")
            self.assertEqual(connection.execute("SELECT SUM(ended_at-started_at) FROM network_coverage").fetchone()[0], 15)

    def test_failed_flush_retains_pending_bytes_for_retry(self):
        accumulator = network.TraceAccumulator()
        accumulator.observe(("/usr/bin/curl", 10, 1000, 1000, 100))
        accumulator.finish_frame()
        with mock.patch.object(network, "connect", side_effect=sqlite3.OperationalError("busy")):
            with self.assertRaises(sqlite3.OperationalError):
                accumulator.flush(self.path, 100, 105)
        self.assertEqual(next(iter(accumulator.pending.values())), [1000, 100])
        accumulator.flush(self.path, 100, 105)
        self.assertFalse(accumulator.pending)

    def test_unknown_ownership_transfer_does_not_count_old_bytes_twice(self):
        accumulator = network.TraceAccumulator()
        accumulator.observe(("unknown TCP", 0, 0, 1000, 100))
        accumulator.finish_frame()
        accumulator.flush(self.path, 100, 105)
        accumulator.observe(("unknown TCP", 0, 0, 0, 0))
        accumulator.observe(("/usr/bin/curl", 10, 1000, 1500, 150))
        accumulator.finish_frame()
        accumulator.flush(self.path, 105, 110)
        with database_connection(self.path) as connection:
            self.assertEqual(connection.execute("SELECT SUM(rx_bytes), SUM(tx_bytes) FROM network_samples").fetchone(), (1500, 150))

    def test_compaction_preserves_totals_both_histories_and_is_idempotent(self):
        now = datetime(2026, 10, 26, 12, tzinfo=network.IST)
        old = int(datetime(2026, 9, 1, 12, tzinfo=network.IST).timestamp())
        recent = int(now.timestamp()) - 10
        with database_connection(self.path) as connection:
            connection.executemany("INSERT INTO network_samples VALUES (?, 'zen', 'Zen', 'app', ?, ?)", [(old, 1000, 100), (old + 5, 2000, 200), (recent, 500, 50)])
            connection.execute("INSERT INTO network_coverage VALUES (?, ?)", (old, old + 10))
            connection.executemany("INSERT INTO activity_samples VALUES (?, ?, ?, ?, 'zen')", [
                (1, '2026-09-01T23:59:00+05:30', '2026-09-02T00:01:00+05:30', None),
                (2, '2026-10-26T10:00:00+05:30', '2026-10-26T10:01:00+05:30', None),
                (3, '2026-09-01T12:00:00+05:30', None, '2026-10-26T12:00:00+05:30'),
            ])
        self.assertEqual(network.compact_history(self.path, now), 4)
        self.assertEqual(network.compact_history(self.path, now), 0)
        with database_connection(self.path) as connection:
            self.assertEqual(connection.execute("SELECT rx_bytes,tx_bytes FROM network_daily_summaries").fetchone(), (3000, 300))
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM network_samples").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT SUM(seconds) FROM activity_daily_summaries").fetchone()[0], 120)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM activity_daily_summaries").fetchone()[0], 2)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM activity_samples").fetchone()[0], 2)
            self.assertEqual(connection.execute("SELECT observed_seconds FROM network_daily_coverage").fetchone()[0], 10)

    def test_delete_failure_rolls_back_summary_and_preserves_detail(self):
        with database_connection(self.path) as connection:
            connection.executescript("INSERT INTO network_samples VALUES (1, 'zen', 'Zen', 'app', 1000, 100); CREATE TRIGGER prevent_delete BEFORE DELETE ON network_samples BEGIN SELECT RAISE(ABORT, 'disk failure'); END;")
        with self.assertRaises(sqlite3.IntegrityError):
            network.compact_history(self.path)
        with database_connection(self.path) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM network_samples").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM network_daily_summaries").fetchone()[0], 0)

    def test_cutoff_is_ist_and_keeps_thirty_complete_days(self):
        now = datetime(2026, 10, 26, 12, tzinfo=network.IST)
        cutoff = int(datetime(2026, 9, 26, tzinfo=network.IST).timestamp())
        with database_connection(self.path) as connection:
            connection.executemany("INSERT INTO network_samples VALUES (?, 'zen', 'Zen', 'app', 10, 1)", [(cutoff - 1,), (cutoff,)])
        network.compact_history(self.path, now)
        with database_connection(self.path) as connection:
            self.assertEqual(connection.execute("SELECT sampled_at FROM network_samples").fetchone()[0], cutoff)
            self.assertEqual(connection.execute("SELECT day FROM network_daily_summaries").fetchone()[0], "2026-09-25")

    def test_one_collector_records_screen_time_and_network_together(self):
        script = Path(__file__).resolve().parents[1] / "hyprtrack-monitor.py"
        spec = importlib.util.spec_from_file_location("combined_hyprtrack", script)
        collector = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(collector)
        # Fresh database uses the actual activity schema. Never touch the live DB.
        database = Path(self.directory.name) / "combined.db"
        capture = Path(self.directory.name) / "native-fixture"
        capture.write_text(
            f"#!{sys.executable}\nimport time\nn=0\nwhile True:\n"
            " n+=1\n print('Refreshing:', flush=True)\n"
            " print(f'/opt/zen/zen/10/1000\\t{n*10}\\t{n*100}', flush=True)\n time.sleep(.1)\n"
        )
        capture.chmod(0o755)

        def screen_events(tracker, stop, checkpoint_interval):
            tracker.observe(("code", "Existing screen behavior"), collector.now_ist(), address="abc")
            deadline = time.monotonic() + 4
            while time.monotonic() < deadline:
                with database_connection(database) as connection:
                    ready = connection.execute("SELECT COUNT(*) FROM sqlite_master WHERE name='network_samples'").fetchone()[0]
                    if ready and connection.execute("SELECT COUNT(*) FROM network_samples").fetchone()[0]:
                        break
                time.sleep(.05)
            stop.set()

        with mock.patch.object(network, "CAPTURE_PATH", capture), mock.patch.object(network, "physical_interfaces", return_value=["eth0"]), mock.patch.object(network, "FLUSH_SECONDS", 1), mock.patch.object(collector, "listen_for_events", side_effect=screen_events):
            collector.run(database)
        with database_connection(database) as connection:
            self.assertEqual(connection.execute("SELECT app_class FROM activity_samples").fetchone()[0], "code")
            self.assertGreater(connection.execute("SELECT SUM(rx_bytes) FROM network_samples").fetchone()[0], 0)
            self.assertEqual(connection.execute("SELECT state FROM network_status").fetchone()[0], "stopped")

    def test_missing_network_module_does_not_change_screen_time_collection(self):
        script = Path(__file__).resolve().parents[1] / "hyprtrack-monitor.py"
        spec = importlib.util.spec_from_file_location("screen_only_hyprtrack", script)
        collector = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(collector)
        database = Path(self.directory.name) / "screen-only.db"
        original_import = builtins.__import__

        def import_without_network(name, *args, **kwargs):
            if name == "hyprtrack_network":
                raise ImportError("missing companion")
            return original_import(name, *args, **kwargs)

        def screen_events(tracker, stop, checkpoint_interval):
            tracker.observe(("code", "Screen time survives"), collector.now_ist(), address="abc")
            tracker.checkpoint(collector.now_ist())
            stop.set()

        with mock.patch.object(builtins, "__import__", side_effect=import_without_network), mock.patch.object(collector, "listen_for_events", side_effect=screen_events):
            collector.run(database)
        with database_connection(database) as connection:
            row = connection.execute("SELECT app_class, ended_at, last_seen_at FROM activity_samples").fetchone()
            self.assertEqual(row[0], "code")
            self.assertIsNotNone(row[1])
            self.assertIsNotNone(row[2])


if __name__ == "__main__":
    unittest.main()
