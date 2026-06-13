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
                    "SELECT sampled_at, app_class, window_title "
                    "FROM activity_samples"
                ).fetchone()

        self.assertIsNotNone(row)
        sampled_at = datetime.fromisoformat(row[0])
        self.assertEqual(sampled_at.utcoffset().total_seconds(), 5.5 * 60 * 60)
        self.assertEqual(row[1:], ("kitty", "kitty"))

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

    def test_non_zen_window_stores_only_application_label(self):
        hyprtrack = load_hyprtrack()
        title = "hyprtrack.py - HyprTrack - Visual Studio Code"

        self.assertEqual(
            hyprtrack.normalize_window_title("code", title),
            "VS Code",
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

    def test_continuous_mode_samples_immediately_then_waits_for_interval(self):
        hyprtrack = load_hyprtrack()

        with contextlib.redirect_stderr(io.StringIO()):
            with (
                mock.patch.object(
                    hyprtrack,
                    "record_sample",
                    side_effect=[True, KeyboardInterrupt],
                ) as record_sample,
                mock.patch.object(
                    hyprtrack.time, "monotonic", side_effect=[10.0, 10.0]
                ),
                mock.patch.object(hyprtrack.time, "sleep") as sleep,
            ):
                hyprtrack.run(Path("activity.db"), interval=60)

        self.assertEqual(record_sample.call_count, 2)
        sleep.assert_called_once_with(60.0)

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
