import contextlib
import importlib.util
import io
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = PROJECT_ROOT / "hyprtrack.py"


def load_hyprtrack():
    spec = importlib.util.spec_from_file_location("hyprtrack", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class HyprTrackTests(unittest.TestCase):
    def test_record_sample_stores_valid_active_window(self):
        hyprtrack = load_hyprtrack()
        active_window = {"class": "kitty", "title": "HyprTrack"}

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            completed = subprocess.CompletedProcess(
                ["hyprctl", "activewindow", "-j"],
                0,
                stdout=json.dumps(active_window),
                stderr="",
            )

            with mock.patch.object(
                hyprtrack.subprocess, "run", return_value=completed
            ):
                self.assertTrue(hyprtrack.record_sample(db_path))

            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                row = connection.execute(
                    "SELECT sampled_at, app_class, window_title, window_full "
                    "FROM activity_samples"
                ).fetchone()

        self.assertIsNotNone(row)
        sampled_at = datetime.fromisoformat(row[0])
        self.assertEqual(sampled_at.utcoffset().total_seconds(), 5.5 * 60 * 60)
        self.assertEqual(row[1:], ("kitty", "Terminal", "HyprTrack"))

    def test_initialize_database_adds_window_full_to_legacy_schema(self):
        hyprtrack = load_hyprtrack()

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "legacy.db"
            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                connection.execute(
                    """
                    CREATE TABLE activity_samples (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        sampled_at TEXT NOT NULL,
                        app_class TEXT NOT NULL,
                        window_title TEXT NOT NULL
                    )
                    """
                )
                connection.commit()

            hyprtrack.initialize_database(db_path)

            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                columns = {
                    row[1]
                    for row in connection.execute(
                        "PRAGMA table_info(activity_samples)"
                    )
                }

        self.assertIn("window_full", columns)
        self.assertIn("ended_at", columns)
        self.assertIn("last_seen_at", columns)
        self.assertIn("window_address", columns)

    def test_recover_interrupted_activity_uses_last_checkpoint(self):
        hyprtrack = load_hyprtrack()

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            hyprtrack.initialize_database(db_path)
            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                connection.execute(
                    """
                    INSERT INTO activity_samples (
                        sampled_at,
                        app_class,
                        window_title,
                        window_full,
                        ended_at,
                        last_seen_at
                    )
                    VALUES (?, ?, ?, ?, NULL, ?)
                    """,
                    (
                        "2026-06-14T10:00:00+05:30",
                        "code",
                        "VS Code",
                        "private title",
                        "2026-06-14T10:04:00+05:30",
                    ),
                )
                connection.commit()

            self.assertEqual(hyprtrack.recover_interrupted_activity(db_path), 1)

            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                row = connection.execute(
                    "SELECT ended_at, last_seen_at FROM activity_samples"
                ).fetchone()

        self.assertEqual(
            row,
            (
                "2026-06-14T10:04:00+05:30",
                "2026-06-14T10:04:00+05:30",
            ),
        )

    def test_recovery_does_not_change_legacy_samples(self):
        hyprtrack = load_hyprtrack()

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            hyprtrack.initialize_database(db_path)
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
                    (
                        "2026-06-14T10:00:00+05:30",
                        "code",
                        "VS Code",
                        "private title",
                    ),
                )
                connection.commit()

            self.assertEqual(hyprtrack.recover_interrupted_activity(db_path), 0)

            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                ended_at = connection.execute(
                    "SELECT ended_at FROM activity_samples"
                ).fetchone()[0]

        self.assertIsNone(ended_at)

    def test_tracker_checkpoints_without_creating_another_row(self):
        hyprtrack = load_hyprtrack()

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            tracker = hyprtrack.ActivityTracker(db_path)

            self.assertEqual(
                tracker.observe(
                    ("zen", "GitHub — Zen Browser"),
                    "2026-06-14T10:00:00+05:30",
                ),
                "started",
            )
            tracker.checkpoint("2026-06-14T10:01:00+05:30")

            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                rows = connection.execute(
                    """
                    SELECT sampled_at, ended_at, last_seen_at
                    FROM activity_samples
                    """
                ).fetchall()

        self.assertEqual(
            rows,
            [
                (
                    "2026-06-14T10:00:00+05:30",
                    None,
                    "2026-06-14T10:01:00+05:30",
                )
            ],
        )

    def test_tracker_closes_previous_row_on_raw_title_change(self):
        hyprtrack = load_hyprtrack()

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            tracker = hyprtrack.ActivityTracker(db_path)

            tracker.observe(
                ("zen", "First video - YouTube — Zen Browser"),
                "2026-06-14T10:00:00+05:30",
            )
            self.assertEqual(
                tracker.observe(
                    ("zen", "Second video - YouTube — Zen Browser"),
                    "2026-06-14T10:02:00+05:30",
                ),
                "changed",
            )

            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                rows = connection.execute(
                    """
                    SELECT window_title, window_full, ended_at, last_seen_at
                    FROM activity_samples
                    ORDER BY id
                    """
                ).fetchall()

        self.assertEqual(
            rows,
            [
                (
                    "YouTube",
                    "First video - YouTube — Zen Browser",
                    "2026-06-14T10:02:00+05:30",
                    "2026-06-14T10:02:00+05:30",
                ),
                (
                    "YouTube",
                    "Second video - YouTube — Zen Browser",
                    None,
                    "2026-06-14T10:02:00+05:30",
                ),
            ],
        )

    def test_tracker_ignores_duplicate_window_observations(self):
        hyprtrack = load_hyprtrack()

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            tracker = hyprtrack.ActivityTracker(db_path)
            window = ("kitty", "HyprTrack")

            tracker.observe(window, "2026-06-14T10:00:00+05:30")
            self.assertEqual(
                tracker.observe(window, "2026-06-14T10:00:10+05:30"),
                "unchanged",
            )

            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                count = connection.execute(
                    "SELECT COUNT(*) FROM activity_samples"
                ).fetchone()[0]

        self.assertEqual(count, 1)

    def test_tracker_records_same_title_on_different_window_addresses(self):
        hyprtrack = load_hyprtrack()

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            tracker = hyprtrack.ActivityTracker(db_path)
            window = ("code", "HyprTrack - Visual Studio Code")

            tracker.observe(
                window,
                "2026-06-14T10:00:00.100+05:30",
                address="abc",
            )
            tracker.observe(
                window,
                "2026-06-14T10:00:00.200+05:30",
                address="def",
            )

            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                rows = connection.execute(
                    """
                    SELECT window_address, sampled_at, ended_at
                    FROM activity_samples
                    ORDER BY id
                    """
                ).fetchall()

        self.assertEqual(
            rows,
            [
                (
                    "abc",
                    "2026-06-14T10:00:00.100+05:30",
                    "2026-06-14T10:00:00.200+05:30",
                ),
                (
                    "def",
                    "2026-06-14T10:00:00.200+05:30",
                    None,
                ),
            ],
        )

    def test_tracker_pauses_on_valid_no_window_state(self):
        hyprtrack = load_hyprtrack()

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            tracker = hyprtrack.ActivityTracker(db_path)
            tracker.observe(
                ("code", "HyprTrack - Visual Studio Code"),
                "2026-06-14T10:00:00+05:30",
            )

            self.assertTrue(
                tracker.pause("2026-06-14T10:03:00+05:30")
            )

            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                row = connection.execute(
                    "SELECT ended_at, last_seen_at FROM activity_samples"
                ).fetchone()

        self.assertEqual(
            row,
            (
                "2026-06-14T10:03:00+05:30",
                "2026-06-14T10:03:00+05:30",
            ),
        )

    def test_tracker_interrupt_closes_at_last_checkpoint(self):
        hyprtrack = load_hyprtrack()

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            tracker = hyprtrack.ActivityTracker(db_path)
            tracker.observe(
                ("code", "HyprTrack - Visual Studio Code"),
                "2026-06-14T10:00:00+05:30",
            )
            tracker.checkpoint("2026-06-14T10:04:00+05:30")

            self.assertTrue(tracker.interrupt())

            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                row = connection.execute(
                    "SELECT ended_at, last_seen_at FROM activity_samples"
                ).fetchone()

        self.assertEqual(
            row,
            (
                "2026-06-14T10:04:00+05:30",
                "2026-06-14T10:04:00+05:30",
            ),
        )

    def test_detects_wall_clock_gap_caused_by_suspend(self):
        hyprtrack = load_hyprtrack()

        self.assertTrue(
            hyprtrack.suspension_detected(
                previous_wall=100.0,
                current_wall=710.0,
                previous_monotonic=50.0,
                current_monotonic=60.0,
            )
        )
        self.assertFalse(
            hyprtrack.suspension_detected(
                previous_wall=100.0,
                current_wall=110.0,
                previous_monotonic=50.0,
                current_monotonic=60.0,
            )
        )

    def test_browser_title_stores_service_after_last_separator(self):
        hyprtrack = load_hyprtrack()

        cases = {
            "The Best Claire & Jay Moments | TBS - YouTube — Zen Browser": (
                "YouTube"
            ),
            "PC usage tracker with app monitoring - Claude — Zen Browser": (
                "Claude"
            ),
            "HyprTrack logger discussion - ChatGPT — Zen Browser": "ChatGPT",
        }

        for title, expected in cases.items():
            with self.subTest(title=title):
                self.assertEqual(
                    hyprtrack.normalize_window_title("zen", title),
                    expected,
                )

    def test_zen_recognizes_direct_service_titles(self):
        hyprtrack = load_hyprtrack()

        cases = {
            "WhatsApp — Zen Browser": "WhatsApp",
            "GitHub — Zen Browser": "GitHub",
            "Vercel — Zen Browser": "Vercel",
        }

        for title, expected in cases.items():
            with self.subTest(title=title):
                self.assertEqual(
                    hyprtrack.normalize_window_title("zen", title),
                    expected,
                )

    def test_zen_recognizes_github_repository_titles(self):
        hyprtrack = load_hyprtrack()

        self.assertEqual(
            hyprtrack.normalize_window_title(
                "zen",
                "Technode-system/php-dashboard — Zen Browser",
            ),
            "GitHub",
        )

    def test_zen_groups_personal_website_titles(self):
        hyprtrack = load_hyprtrack()

        titles = [
            "Running Out of Excuses — Zen Browser",
            "Russel Daniel Paul — Zen Browser",
            "Home | Blogs — Zen Browser",
        ]

        for title in titles:
            with self.subTest(title=title):
                self.assertEqual(
                    hyprtrack.normalize_window_title("zen", title),
                    "Personal Websites",
                )

    def test_brave_uses_the_same_browser_classification_as_zen(self):
        hyprtrack = load_hyprtrack()

        cases = {
            "Sign in - Claude - Brave Origin": "Claude",
            "Technode-system/php-dashboard - Brave Origin": "GitHub",
            "Problems - LeetCode - Brave Origin": "LeetCode",
            "Running Out of Excuses - Brave Origin": "Personal Websites",
            "WhatsApp - Brave Origin": "WhatsApp",
            "Vercel - Brave Origin": "Vercel",
        }

        for title, expected in cases.items():
            with self.subTest(title=title):
                self.assertEqual(
                    hyprtrack.normalize_window_title(
                        "brave-origin-nightly",
                        title,
                    ),
                    expected,
                )

    def test_zen_recognizes_leetcode_in_both_title_orders(self):
        hyprtrack = load_hyprtrack()

        titles = [
            (
                "LeetCode - The World's Leading Online Programming Learning "
                "Platform — Zen Browser"
            ),
            "Problems - LeetCode — Zen Browser",
        ]

        for title in titles:
            with self.subTest(title=title):
                self.assertEqual(
                    hyprtrack.normalize_window_title("zen", title),
                    "LeetCode",
                )

    def test_non_zen_window_stores_only_application_label(self):
        hyprtrack = load_hyprtrack()
        title = "hyprtrack.py - HyprTrack - Visual Studio Code"

        self.assertEqual(
            hyprtrack.normalize_window_title("code", title),
            "VS Code",
        )

        self.assertEqual(
            hyprtrack.normalize_window_title(
                "kitty",
                "sleep 1 && hyprctl activewindow",
            ),
            "Terminal",
        )

    def test_record_sample_skips_insert_when_hyprctl_fails(self):
        hyprtrack = load_hyprtrack()

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            stderr = io.StringIO()

            with (
                mock.patch.object(
                    hyprtrack.subprocess,
                    "run",
                    side_effect=subprocess.CalledProcessError(
                        1,
                        ["hyprctl", "activewindow", "-j"],
                        stderr="socket unavailable",
                    ),
                ),
                contextlib.redirect_stderr(stderr),
            ):
                self.assertFalse(hyprtrack.record_sample(db_path))

            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                count = connection.execute(
                    "SELECT COUNT(*) FROM activity_samples"
                ).fetchone()[0]

        self.assertEqual(count, 0)
        self.assertIn("hyprctl failed", stderr.getvalue())

    def test_record_sample_skips_insert_for_invalid_json(self):
        hyprtrack = load_hyprtrack()
        completed = subprocess.CompletedProcess(
            ["hyprctl", "activewindow", "-j"],
            0,
            stdout="{invalid",
            stderr="",
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            stderr = io.StringIO()

            with (
                mock.patch.object(
                    hyprtrack.subprocess, "run", return_value=completed
                ),
                contextlib.redirect_stderr(stderr),
            ):
                self.assertFalse(hyprtrack.record_sample(db_path))

            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                count = connection.execute(
                    "SELECT COUNT(*) FROM activity_samples"
                ).fetchone()[0]

        self.assertEqual(count, 0)
        self.assertIn("invalid JSON", stderr.getvalue())

    def test_record_sample_skips_insert_for_missing_window_fields(self):
        hyprtrack = load_hyprtrack()
        completed = subprocess.CompletedProcess(
            ["hyprctl", "activewindow", "-j"],
            0,
            stdout=json.dumps({"class": "", "title": ""}),
            stderr="",
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            stderr = io.StringIO()

            with (
                mock.patch.object(
                    hyprtrack.subprocess, "run", return_value=completed
                ),
                contextlib.redirect_stderr(stderr),
            ):
                self.assertFalse(hyprtrack.record_sample(db_path))

            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                count = connection.execute(
                    "SELECT COUNT(*) FROM activity_samples"
                ).fetchone()[0]

        self.assertEqual(count, 0)

    def test_event_processor_records_rapid_focus_and_browser_title_changes(self):
        hyprtrack = load_hyprtrack()

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            tracker = hyprtrack.ActivityTracker(db_path)
            processor = hyprtrack.EventProcessor(
                tracker,
                {
                    "aaa": hyprtrack.WindowInfo(
                        "aaa",
                        "zen",
                        "First - YouTube — Zen Browser",
                    ),
                    "bbb": hyprtrack.WindowInfo(
                        "bbb",
                        "code",
                        "HyprTrack - Visual Studio Code",
                    ),
                },
            )

            processor.handle(
                "activewindowv2>>aaa",
                "2026-06-14T10:00:00.100+05:30",
            )
            processor.handle(
                "windowtitlev2>>aaa,Second - YouTube — Zen Browser",
                "2026-06-14T10:00:00.200+05:30",
            )
            processor.handle(
                "activewindowv2>>bbb",
                "2026-06-14T10:00:00.300+05:30",
            )

            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                rows = connection.execute(
                    """
                    SELECT window_address, window_full, sampled_at, ended_at
                    FROM activity_samples
                    ORDER BY id
                    """
                ).fetchall()

        self.assertEqual(
            rows,
            [
                (
                    "aaa",
                    "First - YouTube — Zen Browser",
                    "2026-06-14T10:00:00.100+05:30",
                    "2026-06-14T10:00:00.200+05:30",
                ),
                (
                    "aaa",
                    "Second - YouTube — Zen Browser",
                    "2026-06-14T10:00:00.200+05:30",
                    "2026-06-14T10:00:00.300+05:30",
                ),
                (
                    "bbb",
                    "HyprTrack - Visual Studio Code",
                    "2026-06-14T10:00:00.300+05:30",
                    None,
                ),
            ],
        )

    def test_event_processor_ignores_duplicate_and_background_title_events(self):
        hyprtrack = load_hyprtrack()

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            tracker = hyprtrack.ActivityTracker(db_path)
            processor = hyprtrack.EventProcessor(
                tracker,
                {
                    "aaa": hyprtrack.WindowInfo(
                        "aaa",
                        "zen",
                        "Active - YouTube — Zen Browser",
                    ),
                    "bbb": hyprtrack.WindowInfo(
                        "bbb",
                        "zen",
                        "Background - GitHub — Zen Browser",
                    ),
                },
            )
            processor.handle(
                "activewindowv2>>aaa",
                "2026-06-14T10:00:00.100+05:30",
            )
            processor.handle(
                "windowtitlev2>>bbb,Changed - GitHub — Zen Browser",
                "2026-06-14T10:00:00.200+05:30",
            )
            processor.handle(
                "windowtitlev2>>aaa,Active - YouTube — Zen Browser",
                "2026-06-14T10:00:00.300+05:30",
            )

            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                count = connection.execute(
                    "SELECT COUNT(*) FROM activity_samples"
                ).fetchone()[0]

        self.assertEqual(count, 1)

    def test_event_processor_updates_metadata_and_pauses_for_empty_focus(self):
        hyprtrack = load_hyprtrack()

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            tracker = hyprtrack.ActivityTracker(db_path)
            processor = hyprtrack.EventProcessor(tracker, {})

            processor.handle(
                "openwindow>>abc,1,kitty,Terminal",
                "2026-06-14T10:00:00.100+05:30",
            )
            processor.handle(
                "activewindowv2>>abc",
                "2026-06-14T10:00:00.200+05:30",
            )
            processor.handle(
                "activewindowv2>>",
                "2026-06-14T10:00:00.300+05:30",
            )
            processor.handle(
                "closewindow>>abc",
                "2026-06-14T10:00:00.400+05:30",
            )

            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                row = connection.execute(
                    """
                    SELECT window_address, sampled_at, ended_at
                    FROM activity_samples
                    """
                ).fetchone()

        self.assertEqual(
            row,
            (
                "abc",
                "2026-06-14T10:00:00.200+05:30",
                "2026-06-14T10:00:00.300+05:30",
            ),
        )

    def test_event_processor_uses_recovery_only_for_unknown_active_address(self):
        hyprtrack = load_hyprtrack()

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            tracker = hyprtrack.ActivityTracker(db_path)
            recovered = hyprtrack.WindowInfo(
                "missing",
                "code",
                "Recovered - Visual Studio Code",
            )
            recovery = mock.Mock(return_value=recovered)
            processor = hyprtrack.EventProcessor(
                tracker,
                {},
                recover_active=recovery,
            )

            processor.handle(
                "activewindowv2>>missing",
                "2026-06-14T10:00:00.123+05:30",
            )

        recovery.assert_called_once_with("missing")

    def test_now_ist_preserves_milliseconds(self):
        hyprtrack = load_hyprtrack()

        with mock.patch.object(hyprtrack, "datetime") as fake_datetime:
            fake_datetime.now.return_value = datetime.fromisoformat(
                "2026-06-14T10:00:00.123456+05:30"
            )
            self.assertEqual(
                hyprtrack.now_ist(),
                "2026-06-14T10:00:00.123+05:30",
            )

    def test_query_clients_builds_address_metadata_map(self):
        hyprtrack = load_hyprtrack()
        completed = subprocess.CompletedProcess(
            ["hyprctl", "clients", "-j"],
            0,
            stdout=json.dumps(
                [
                    {
                        "address": "0xABC",
                        "class": "zen",
                        "title": "GitHub — Zen Browser",
                    },
                    {"address": "", "class": "code", "title": "Ignored"},
                ]
            ),
            stderr="",
        )

        with mock.patch.object(
            hyprtrack.subprocess,
            "run",
            return_value=completed,
        ):
            windows = hyprtrack.query_clients()

        self.assertEqual(
            windows,
            {
                "abc": hyprtrack.WindowInfo(
                    "abc",
                    "zen",
                    "GitHub — Zen Browser",
                )
            },
        )

    def test_instance_lock_rejects_second_collector(self):
        hyprtrack = load_hyprtrack()

        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "activity.db"
            with hyprtrack.instance_lock(db_path):
                with self.assertRaisesRegex(
                    OSError,
                    "already running",
                ):
                    with hyprtrack.instance_lock(db_path):
                        pass

    def test_once_cli_creates_database_at_requested_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "custom.db"
            fake_bin = Path(temp_dir) / "bin"
            fake_bin.mkdir()
            fake_hyprctl = fake_bin / "hyprctl"
            fake_hyprctl.write_text(
                "#!/bin/sh\n"
                "printf '%s\\n' "
                '\'{"class":"foot","title":"Terminal"}\'\n',
                encoding="utf-8",
            )
            fake_hyprctl.chmod(0o755)

            env = {"PATH": f"{fake_bin}:{Path('/usr/bin')}"}
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--once",
                    "--db",
                    str(db_path),
                ],
                capture_output=True,
                text=True,
                env=env,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            with contextlib.closing(sqlite3.connect(db_path)) as connection:
                row = connection.execute(
                    "SELECT app_class, window_title FROM activity_samples"
                ).fetchone()

        self.assertEqual(row, ("foot", "foot"))


if __name__ == "__main__":
    unittest.main()
