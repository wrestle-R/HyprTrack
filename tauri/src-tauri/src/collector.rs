use crate::storage::{initialize_database, recover_interrupted_activity};
use chrono::{FixedOffset, SecondsFormat, Utc};
use rusqlite::{params, Connection};
use serde_json::Value;
use std::{
    collections::HashMap,
    io::{BufRead, BufReader},
    os::unix::net::UnixStream,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::{Duration, Instant, SystemTime},
};

const CHECKPOINT_INTERVAL: Duration = Duration::from_secs(15);
const RECONCILE_INTERVAL: Duration = Duration::from_secs(5);
const SUSPEND_GAP_SECONDS: f64 = 5.0;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WindowInfo {
    pub address: String,
    pub app_class: String,
    pub title: String,
}

impl WindowInfo {
    pub fn new(address: &str, app_class: &str, title: &str) -> Self {
        Self {
            address: normalize_address(address),
            app_class: app_class.to_string(),
            title: title.to_string(),
        }
    }
}

fn normalize_address(address: &str) -> String {
    address
        .trim()
        .to_lowercase()
        .strip_prefix("0x")
        .unwrap_or(address.trim())
        .to_string()
}

fn browser_suffixes(class_key: &str) -> &'static [&'static str] {
    match class_key {
        "zen" => &[" — Zen Browser"],
        "brave" | "brave-browser" => &[" - Brave"],
        "brave-origin" | "brave-origin-nightly" => &[" - Brave Origin"],
        _ => &[],
    }
}

fn is_repository(value: &str) -> bool {
    let parts = value.split('/').collect::<Vec<_>>();
    parts.len() == 2
        && parts.iter().all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || "_.-".contains(character))
        })
}

pub fn normalize_window_title(app_class: &str, window_title: &str) -> String {
    let class_key = app_class.trim().to_lowercase();
    let native = match class_key.as_str() {
        "code" | "code-oss" | "visual studio code" => Some("VS Code"),
        "kitty" => Some("Terminal"),
        "com.stremio.stremio" => Some("Stremio"),
        "tauri" | "hyprtrack-desktop" => Some("HyprTrack Desktop App"),
        _ => None,
    };
    if browser_suffixes(&class_key).is_empty() {
        return native.unwrap_or(app_class.trim()).to_string();
    }

    let mut title = window_title.trim().to_string();
    for suffix in browser_suffixes(&class_key) {
        if title.ends_with(suffix) {
            title.truncate(title.len() - suffix.len());
            title = title.trim().to_string();
            break;
        }
    }
    let folded = title.to_lowercase();
    if matches!(
        folded.as_str(),
        "home | blogs" | "running out of excuses" | "russel daniel paul"
    ) {
        return "Personal Websites".into();
    }
    if folded == "x"
        || folded.starts_with("x ")
        || folded.ends_with(" on x:")
        || folded.contains(" on x: ")
    {
        return "X".into();
    }
    for (marker, label) in [
        ("chatgpt", "ChatGPT"),
        ("claude", "Claude"),
        ("github", "GitHub"),
        ("leetcode", "LeetCode"),
        ("vercel", "Vercel"),
        ("whatsapp", "WhatsApp"),
        ("x.com", "X"),
        ("youtube", "YouTube"),
    ] {
        if folded.contains(marker) {
            return label.into();
        }
    }
    if is_repository(&title)
        || title
            .rsplit_once(" · ")
            .is_some_and(|(_, repository)| is_repository(repository))
    {
        return "GitHub".into();
    }
    if let Some((_, service)) = title.rsplit_once(" - ") {
        if !service.trim().is_empty() {
            return service.trim().to_string();
        }
    }
    if !title.is_empty()
        && !title.starts_with('(')
        && !title.contains(" - ")
        && !title.contains(" | ")
        && !title.contains(" · ")
        && title.split_whitespace().count() >= 3
    {
        return "ChatGPT".into();
    }
    if title.is_empty() {
        "Zen".into()
    } else {
        title
    }
}

fn now_ist() -> String {
    let offset = FixedOffset::east_opt(5 * 3600 + 30 * 60).expect("valid IST offset");
    Utc::now()
        .with_timezone(&offset)
        .to_rfc3339_opts(SecondsFormat::Millis, false)
}

pub struct ActivityTracker {
    database_path: PathBuf,
    current_id: Option<i64>,
    current_window: Option<(String, String, String)>,
}

impl ActivityTracker {
    pub fn new(database_path: PathBuf) -> Result<Self, String> {
        initialize_database(&database_path)?;
        Ok(Self {
            database_path,
            current_id: None,
            current_window: None,
        })
    }

    pub fn observe(
        &mut self,
        window: WindowInfo,
        observed_at: &str,
    ) -> Result<&'static str, String> {
        let identity = (
            normalize_address(&window.address),
            window.app_class.clone(),
            window.title.clone(),
        );
        if self.current_window.as_ref() == Some(&identity) {
            return Ok("unchanged");
        }
        let connection =
            Connection::open(&self.database_path).map_err(|error| error.to_string())?;
        if let Some(current_id) = self.current_id {
            connection
                .execute(
                    "UPDATE activity_samples SET ended_at = ?1, last_seen_at = ?1
                     WHERE id = ?2 AND ended_at IS NULL",
                    params![observed_at, current_id],
                )
                .map_err(|error| error.to_string())?;
        }
        connection
            .execute(
                "INSERT INTO activity_samples (
                    sampled_at, app_class, window_title, window_full,
                    ended_at, last_seen_at, window_address
                 ) VALUES (?1, ?2, ?3, ?4, NULL, ?1, ?5)",
                params![
                    observed_at,
                    window.app_class,
                    normalize_window_title(&identity.1, &identity.2),
                    window.title,
                    if identity.0.is_empty() {
                        None::<String>
                    } else {
                        Some(identity.0.clone())
                    }
                ],
            )
            .map_err(|error| error.to_string())?;
        let action = if self.current_id.is_some() {
            "changed"
        } else {
            "started"
        };
        self.current_id = Some(connection.last_insert_rowid());
        self.current_window = Some(identity);
        Ok(action)
    }

    pub fn checkpoint(&self, observed_at: &str) -> Result<bool, String> {
        let Some(current_id) = self.current_id else {
            return Ok(false);
        };
        Connection::open(&self.database_path)
            .map_err(|error| error.to_string())?
            .execute(
                "UPDATE activity_samples SET last_seen_at = ?1
                 WHERE id = ?2 AND ended_at IS NULL",
                params![observed_at, current_id],
            )
            .map(|rows| rows == 1)
            .map_err(|error| error.to_string())
    }

    pub fn pause(&mut self, observed_at: &str) -> Result<bool, String> {
        let Some(current_id) = self.current_id else {
            return Ok(false);
        };
        let updated = Connection::open(&self.database_path)
            .map_err(|error| error.to_string())?
            .execute(
                "UPDATE activity_samples SET ended_at = ?1, last_seen_at = ?1
                 WHERE id = ?2 AND ended_at IS NULL",
                params![observed_at, current_id],
            )
            .map_err(|error| error.to_string())?;
        self.current_id = None;
        self.current_window = None;
        Ok(updated == 1)
    }

    pub fn interrupt(&mut self) -> Result<bool, String> {
        let Some(current_id) = self.current_id else {
            return Ok(false);
        };
        let updated = Connection::open(&self.database_path)
            .map_err(|error| error.to_string())?
            .execute(
                "UPDATE activity_samples SET ended_at = last_seen_at
                 WHERE id = ?1 AND ended_at IS NULL AND last_seen_at IS NOT NULL",
                [current_id],
            )
            .map_err(|error| error.to_string())?;
        self.current_id = None;
        self.current_window = None;
        Ok(updated == 1)
    }
}

pub struct EventProcessor {
    tracker: ActivityTracker,
    windows: HashMap<String, WindowInfo>,
    active_address: Option<String>,
}

impl EventProcessor {
    pub fn new(tracker: ActivityTracker, windows: HashMap<String, WindowInfo>) -> Self {
        Self {
            tracker,
            windows,
            active_address: None,
        }
    }

    fn observe(&mut self, window: WindowInfo, observed_at: &str) -> Result<(), String> {
        self.active_address = Some(window.address.clone());
        self.windows.insert(window.address.clone(), window.clone());
        self.tracker.observe(window, observed_at)?;
        Ok(())
    }

    pub fn handle(&mut self, line: &str, observed_at: &str) -> Result<(), String> {
        let Some((event, data)) = line.split_once(">>") else {
            return Ok(());
        };
        match event {
            "activewindowv2" => {
                let address = normalize_address(data);
                if address.is_empty() {
                    self.active_address = None;
                    self.tracker.pause(observed_at)?;
                } else if let Some(window) = self.windows.get(&address).cloned() {
                    self.observe(window, observed_at)?;
                } else if let Some(window) = query_active_window().ok().flatten() {
                    if window.address == address {
                        self.observe(window, observed_at)?;
                    }
                }
            }
            "windowtitlev2" => {
                if let Some((address, title)) = data.split_once(',') {
                    let address = normalize_address(address);
                    if let Some(window) = self.windows.get(&address).cloned() {
                        let updated = WindowInfo::new(&address, &window.app_class, title);
                        self.windows.insert(address.clone(), updated.clone());
                        if self.active_address.as_deref() == Some(&address)
                            && !browser_suffixes(&window.app_class.to_lowercase()).is_empty()
                        {
                            self.observe(updated, observed_at)?;
                        }
                    }
                }
            }
            "openwindow" => {
                let parts = data.splitn(4, ',').collect::<Vec<_>>();
                if parts.len() == 4 {
                    let window = WindowInfo::new(parts[0], parts[2], parts[3]);
                    self.windows.insert(window.address.clone(), window);
                }
            }
            "closewindow" => {
                let address = normalize_address(data);
                self.windows.remove(&address);
                if self.active_address.as_deref() == Some(&address) {
                    self.active_address = None;
                    self.tracker.pause(observed_at)?;
                }
            }
            _ => {}
        }
        Ok(())
    }

    pub fn reconcile_active_window(
        &mut self,
        active_window: Option<WindowInfo>,
        observed_at: &str,
    ) -> Result<(), String> {
        let Some(window) = active_window else {
            self.active_address = None;
            self.tracker.pause(observed_at)?;
            return Ok(());
        };
        let known_window = self.windows.get(&window.address);
        let changed = self.active_address.as_deref() != Some(window.address.as_str())
            || known_window != Some(&window);
        if changed {
            self.observe(window, observed_at)?;
        }
        Ok(())
    }
}

pub fn suspension_detected(
    previous_wall: f64,
    current_wall: f64,
    previous_monotonic: f64,
    current_monotonic: f64,
) -> bool {
    (current_wall - previous_wall) - (current_monotonic - previous_monotonic) >= SUSPEND_GAP_SECONDS
}

fn parse_window(value: &Value) -> Option<WindowInfo> {
    let app_class = value.get("class")?.as_str()?.trim();
    let title = value.get("title")?.as_str()?;
    if app_class.is_empty() {
        return None;
    }
    Some(WindowInfo::new(
        value
            .get("address")
            .and_then(Value::as_str)
            .unwrap_or_default(),
        app_class,
        title,
    ))
}

fn hyprctl_json(arguments: &[&str]) -> Result<Value, String> {
    let output = Command::new("hyprctl")
        .args(arguments)
        .output()
        .map_err(|error| format!("Could not run hyprctl: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    serde_json::from_slice(&output.stdout).map_err(|error| error.to_string())
}

fn query_active_window() -> Result<Option<WindowInfo>, String> {
    let value = hyprctl_json(&["activewindow", "-j"])?;
    Ok(parse_window(&value))
}

fn query_clients() -> Result<HashMap<String, WindowInfo>, String> {
    let value = hyprctl_json(&["clients", "-j"])?;
    let mut windows = HashMap::new();
    for value in value.as_array().into_iter().flatten() {
        if let Some(window) = parse_window(value) {
            windows.insert(window.address.clone(), window);
        }
    }
    Ok(windows)
}

fn event_socket_path() -> Result<PathBuf, String> {
    let runtime = std::env::var_os("XDG_RUNTIME_DIR")
        .ok_or_else(|| "XDG_RUNTIME_DIR is unavailable.".to_string())?;
    let signature = std::env::var_os("HYPRLAND_INSTANCE_SIGNATURE")
        .ok_or_else(|| "HYPRLAND_INSTANCE_SIGNATURE is unavailable.".to_string())?;
    Ok(PathBuf::from(runtime)
        .join("hypr")
        .join(signature)
        .join(".socket2.sock"))
}

fn wall_seconds() -> f64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}

fn listen(database_path: &Path, stop: &AtomicBool) -> Result<(), String> {
    let stream = UnixStream::connect(event_socket_path()?).map_err(|error| error.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(1)))
        .map_err(|error| error.to_string())?;
    let tracker = ActivityTracker::new(database_path.to_path_buf())?;
    let mut processor = EventProcessor::new(tracker, query_clients()?);
    if let Some(window) = query_active_window()? {
        processor.observe(window, &now_ist())?;
    }
    let mut reader = BufReader::new(stream);
    let mut next_checkpoint = Instant::now() + CHECKPOINT_INTERVAL;
    let mut next_reconcile = Instant::now() + RECONCILE_INTERVAL;
    let mut previous_wall = wall_seconds();
    let mut previous_monotonic = Instant::now();
    let mut line = String::new();

    while !stop.load(Ordering::Relaxed) {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => return Err("Hyprland event socket disconnected.".into()),
            Ok(_) => {
                for event in line.lines() {
                    processor.handle(event, &now_ist())?;
                }
            }
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) => {}
            Err(error) => return Err(error.to_string()),
        }

        let current_wall = wall_seconds();
        let current_monotonic = Instant::now();
        if suspension_detected(
            previous_wall,
            current_wall,
            0.0,
            current_monotonic
                .duration_since(previous_monotonic)
                .as_secs_f64(),
        ) {
            processor.tracker.interrupt()?;
        }
        previous_wall = current_wall;
        previous_monotonic = current_monotonic;
        if Instant::now() >= next_checkpoint {
            processor.tracker.checkpoint(&now_ist())?;
            next_checkpoint = Instant::now() + CHECKPOINT_INTERVAL;
        }
        if Instant::now() >= next_reconcile {
            processor.reconcile_active_window(query_active_window()?, &now_ist())?;
            next_reconcile = Instant::now() + RECONCILE_INTERVAL;
        }
    }
    processor.tracker.pause(&now_ist())?;
    Ok(())
}

pub fn run_service(database_path: PathBuf) -> Result<(), String> {
    recover_interrupted_activity(&database_path)?;
    let stop = AtomicBool::new(false);
    let mut delay = Duration::from_millis(250);
    loop {
        match listen(&database_path, &stop) {
            Ok(()) => delay = Duration::from_millis(250),
            Err(error) => {
                eprintln!("HyprTrack collector waiting for Hyprland: {error}");
                thread::sleep(delay);
                delay = (delay * 2).min(Duration::from_secs(5));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::collections::HashMap;
    use tempfile::tempdir;

    #[test]
    fn normalizes_native_and_browser_titles() {
        assert_eq!(
            normalize_window_title("code", "hyprtrack.rs - Visual Studio Code"),
            "VS Code"
        );
        assert_eq!(
            normalize_window_title("zen", "Hyprland Desktop App Frameworks — Zen Browser"),
            "ChatGPT"
        );
        assert_eq!(
            normalize_window_title("zen", "(4) Bilal on X: \"Thread title\" — Zen Browser"),
            "X"
        );
        assert_eq!(
            normalize_window_title(
                "brave-origin-nightly",
                "Technode-system/php-dashboard - Brave Origin"
            ),
            "GitHub"
        );
        for (class, title, expected) in [
            ("kitty", "sleep 1 && hyprctl activewindow", "Terminal"),
            (
                "com.stremio.stremio",
                "Stremio - Freedom to Stream",
                "Stremio",
            ),
            ("tauri", "tauri", "HyprTrack Desktop App"),
            ("zen", "WhatsApp — Zen Browser", "WhatsApp"),
            (
                "zen",
                "Branches · wrestle-R/HyprTrack — Zen Browser",
                "GitHub",
            ),
            (
                "zen",
                "Running Out of Excuses — Zen Browser",
                "Personal Websites",
            ),
            (
                "brave-origin-nightly",
                "Problems - LeetCode - Brave Origin",
                "LeetCode",
            ),
        ] {
            assert_eq!(normalize_window_title(class, title), expected);
        }
    }

    #[test]
    fn tracker_closes_previous_interval_on_window_change() {
        let directory = tempdir().unwrap();
        let database = directory.path().join("hyprtrack.db");
        let mut tracker = ActivityTracker::new(database.clone()).unwrap();

        tracker
            .observe(
                WindowInfo::new("aaa", "zen", "First - YouTube — Zen Browser"),
                "2026-06-14T10:00:00.100+05:30",
            )
            .unwrap();
        tracker
            .observe(
                WindowInfo::new("bbb", "code", "HyprTrack - Visual Studio Code"),
                "2026-06-14T10:00:00.200+05:30",
            )
            .unwrap();

        let connection = Connection::open(database).unwrap();
        let rows = connection
            .prepare(
                "SELECT window_address, window_title, sampled_at, ended_at
                 FROM activity_samples ORDER BY id",
            )
            .unwrap()
            .query_map([], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert_eq!(
            rows,
            vec![
                (
                    Some("aaa".into()),
                    "YouTube".into(),
                    "2026-06-14T10:00:00.100+05:30".into(),
                    Some("2026-06-14T10:00:00.200+05:30".into()),
                ),
                (
                    Some("bbb".into()),
                    "VS Code".into(),
                    "2026-06-14T10:00:00.200+05:30".into(),
                    None,
                ),
            ]
        );
    }

    #[test]
    fn event_processor_records_rapid_title_and_focus_changes() {
        let directory = tempdir().unwrap();
        let database = directory.path().join("hyprtrack.db");
        let tracker = ActivityTracker::new(database.clone()).unwrap();
        let windows = HashMap::from([
            (
                "aaa".into(),
                WindowInfo::new("aaa", "zen", "First - YouTube — Zen Browser"),
            ),
            (
                "bbb".into(),
                WindowInfo::new("bbb", "code", "HyprTrack - Visual Studio Code"),
            ),
        ]);
        let mut processor = EventProcessor::new(tracker, windows);

        processor
            .handle("activewindowv2>>aaa", "2026-06-14T10:00:00.100+05:30")
            .unwrap();
        processor
            .handle(
                "windowtitlev2>>aaa,Second - YouTube — Zen Browser",
                "2026-06-14T10:00:00.200+05:30",
            )
            .unwrap();
        processor
            .handle("activewindowv2>>bbb", "2026-06-14T10:00:00.300+05:30")
            .unwrap();

        let connection = Connection::open(database).unwrap();
        let rows = connection
            .prepare("SELECT window_full, sampled_at, ended_at FROM activity_samples ORDER BY id")
            .unwrap()
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].2.as_deref(), Some("2026-06-14T10:00:00.200+05:30"));
        assert_eq!(rows[1].2.as_deref(), Some("2026-06-14T10:00:00.300+05:30"));
        assert_eq!(rows[2].2, None);
    }

    #[test]
    fn detects_suspend_from_wall_clock_gap() {
        assert!(suspension_detected(100.0, 710.0, 50.0, 60.0));
        assert!(!suspension_detected(100.0, 110.0, 50.0, 60.0));
    }

    #[test]
    fn event_processor_ignores_background_browser_title_changes() {
        let directory = tempdir().unwrap();
        let database = directory.path().join("hyprtrack.db");
        let tracker = ActivityTracker::new(database.clone()).unwrap();
        let windows = HashMap::from([
            (
                "aaa".into(),
                WindowInfo::new("aaa", "zen", "Active - YouTube — Zen Browser"),
            ),
            (
                "bbb".into(),
                WindowInfo::new("bbb", "zen", "Background - GitHub — Zen Browser"),
            ),
        ]);
        let mut processor = EventProcessor::new(tracker, windows);
        processor
            .handle("activewindowv2>>aaa", "2026-06-14T10:00:00.100+05:30")
            .unwrap();
        processor
            .handle(
                "windowtitlev2>>bbb,Changed - GitHub — Zen Browser",
                "2026-06-14T10:00:00.200+05:30",
            )
            .unwrap();

        let count: i64 = Connection::open(database)
            .unwrap()
            .query_row("SELECT COUNT(*) FROM activity_samples", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn tracker_interrupts_at_last_checkpoint() {
        let directory = tempdir().unwrap();
        let database = directory.path().join("hyprtrack.db");
        let mut tracker = ActivityTracker::new(database.clone()).unwrap();
        tracker
            .observe(
                WindowInfo::new("abc", "code", "HyprTrack - Visual Studio Code"),
                "2026-06-14T10:00:00+05:30",
            )
            .unwrap();
        tracker.checkpoint("2026-06-14T10:04:00+05:30").unwrap();
        tracker.interrupt().unwrap();

        let row = Connection::open(database)
            .unwrap()
            .query_row(
                "SELECT ended_at, last_seen_at FROM activity_samples",
                [],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .unwrap();
        assert_eq!(
            row,
            (
                "2026-06-14T10:04:00+05:30".into(),
                "2026-06-14T10:04:00+05:30".into(),
            )
        );
    }

    #[test]
    fn checkpoint_interval_is_short_enough_for_service_crash_recovery() {
        assert_eq!(CHECKPOINT_INTERVAL, Duration::from_secs(15));
    }

    #[test]
    fn reconciliation_records_missed_active_window_change() {
        let directory = tempdir().unwrap();
        let database = directory.path().join("hyprtrack.db");
        let tracker = ActivityTracker::new(database.clone()).unwrap();
        let windows = HashMap::from([(
            "aaa".into(),
            WindowInfo::new("aaa", "zen", "First - YouTube — Zen Browser"),
        )]);
        let mut processor = EventProcessor::new(tracker, windows);

        processor
            .handle("activewindowv2>>aaa", "2026-06-14T10:00:00.000+05:30")
            .unwrap();
        processor
            .reconcile_active_window(
                Some(WindowInfo::new(
                    "bbb",
                    "code",
                    "HyprTrack - Visual Studio Code",
                )),
                "2026-06-14T10:00:05.000+05:30",
            )
            .unwrap();

        let rows = Connection::open(database)
            .unwrap()
            .prepare("SELECT window_address, window_title, sampled_at, ended_at FROM activity_samples ORDER BY id")
            .unwrap()
            .query_map([], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].3.as_deref(), Some("2026-06-14T10:00:05.000+05:30"));
        assert_eq!(
            rows[1],
            (
                Some("bbb".into()),
                "VS Code".into(),
                "2026-06-14T10:00:05.000+05:30".into(),
                None,
            )
        );
    }
}
