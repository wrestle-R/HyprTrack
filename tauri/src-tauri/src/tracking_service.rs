use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

const SERVICE_NAME: &str = "hyprtrack-tracker.service";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ServiceState {
    Running,
    Stopped,
    Starting,
    Restarting,
    Failed,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackingServiceStatus {
    pub state: ServiceState,
    pub pid: Option<u32>,
    pub message: String,
    pub last_error: Option<String>,
    pub journal_excerpt: Vec<String>,
    pub installed: bool,
    pub enabled: bool,
}

#[derive(Clone, Debug)]
pub struct ParsedSystemctlStatus {
    pub state: ServiceState,
    pub pid: Option<u32>,
    pub installed: bool,
    pub enabled: bool,
}

pub fn service_name() -> &'static str {
    SERVICE_NAME
}

fn quote_systemd_exec_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

pub fn build_service_unit(executable_path: &Path) -> String {
    format!(
        "[Unit]\n\
         Description=HyprTrack background tracker\n\
         \n\
         [Service]\n\
         Type=simple\n\
         ExecStart={} --collector-service\n\
         Restart=always\n\
         RestartSec=2\n\
         \n\
         [Install]\n\
         WantedBy=default.target\n",
        quote_systemd_exec_path(executable_path)
    )
}

fn env_path(name: &str) -> Option<PathBuf> {
    std::env::var_os(name)
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
}

pub fn service_unit_path() -> Result<PathBuf, String> {
    let config_home = env_path("XDG_CONFIG_HOME")
        .or_else(|| env_path("HOME").map(|home| home.join(".config")))
        .ok_or_else(|| "HOME is unavailable; cannot resolve systemd user unit path.".to_string())?;
    Ok(config_home.join("systemd/user").join(SERVICE_NAME))
}

pub fn preferred_service_executable() -> Result<PathBuf, String> {
    if let Some(appimage) = env_path("APPIMAGE") {
        return Ok(appimage);
    }
    std::env::current_exe().map_err(|error| error.to_string())
}

fn run_systemctl(args: &[&str]) -> Result<String, String> {
    let output = Command::new("systemctl")
        .arg("--user")
        .args(args)
        .output()
        .map_err(|error| format!("Could not run systemctl --user: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("systemctl --user {} failed", args.join(" "))
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn run_journal_excerpt() -> Vec<String> {
    let output = Command::new("journalctl")
        .args([
            "--user",
            "-u",
            SERVICE_NAME,
            "-n",
            "12",
            "--no-pager",
            "--output=cat",
        ])
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

pub fn resolve_service_state(
    load_state: &str,
    active_state: &str,
    sub_state: &str,
) -> ServiceState {
    if load_state == "error" || active_state == "failed" {
        return ServiceState::Failed;
    }
    if active_state == "active" && sub_state == "running" {
        return ServiceState::Running;
    }
    if active_state == "activating" && sub_state == "auto-restart" {
        return ServiceState::Restarting;
    }
    if active_state == "activating" {
        return ServiceState::Starting;
    }
    ServiceState::Stopped
}

pub fn parse_systemctl_status(output: &str) -> ParsedSystemctlStatus {
    let values = output
        .lines()
        .filter_map(|line| line.split_once('='))
        .map(|(key, value)| (key.trim().to_string(), value.trim().to_string()))
        .collect::<HashMap<_, _>>();
    let load_state = values
        .get("LoadState")
        .map(String::as_str)
        .unwrap_or("not-found");
    let active_state = values
        .get("ActiveState")
        .map(String::as_str)
        .unwrap_or("inactive");
    let sub_state = values.get("SubState").map(String::as_str).unwrap_or("dead");
    let pid = values
        .get("MainPID")
        .and_then(|value| value.parse::<u32>().ok())
        .filter(|pid| *pid > 0);
    let unit_file_state = values
        .get("UnitFileState")
        .map(String::as_str)
        .unwrap_or("disabled");

    ParsedSystemctlStatus {
        state: resolve_service_state(load_state, active_state, sub_state),
        pid,
        installed: load_state != "not-found",
        enabled: unit_file_state == "enabled",
    }
}

fn status_message(status: &ParsedSystemctlStatus) -> String {
    match status.state {
        ServiceState::Running => "Tracking service is running.".into(),
        ServiceState::Stopped => {
            if status.installed {
                "Tracking service is stopped.".into()
            } else {
                "Tracking service is not installed.".into()
            }
        }
        ServiceState::Starting => "Tracking service is starting.".into(),
        ServiceState::Restarting => "Tracking service is restarting.".into(),
        ServiceState::Failed => "Tracking service failed.".into(),
    }
}

pub fn get_status() -> TrackingServiceStatus {
    let properties = [
        "show",
        SERVICE_NAME,
        "--property=LoadState",
        "--property=ActiveState",
        "--property=SubState",
        "--property=MainPID",
        "--property=UnitFileState",
        "--no-pager",
    ];
    let (parsed, last_error) = match run_systemctl(&properties) {
        Ok(output) => (parse_systemctl_status(&output), None),
        Err(error) => (
            ParsedSystemctlStatus {
                state: ServiceState::Stopped,
                pid: None,
                installed: service_unit_path()
                    .map(|path| path.exists())
                    .unwrap_or(false),
                enabled: false,
            },
            Some(error),
        ),
    };
    TrackingServiceStatus {
        state: parsed.state,
        pid: parsed.pid,
        message: status_message(&parsed),
        last_error,
        journal_excerpt: run_journal_excerpt(),
        installed: parsed.installed,
        enabled: parsed.enabled,
    }
}

pub fn install() -> Result<TrackingServiceStatus, String> {
    let unit_path = service_unit_path()?;
    if let Some(parent) = unit_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let executable = preferred_service_executable()?;
    fs::write(&unit_path, build_service_unit(&executable)).map_err(|error| error.to_string())?;
    run_systemctl(&["daemon-reload"])?;
    run_systemctl(&["enable", SERVICE_NAME])?;
    Ok(get_status())
}

pub fn import_hyprland_environment() -> Result<(), String> {
    run_systemctl(&[
        "import-environment",
        "XDG_RUNTIME_DIR",
        "HYPRLAND_INSTANCE_SIGNATURE",
        "WAYLAND_DISPLAY",
        "XDG_CURRENT_DESKTOP",
    ])
    .map(|_| ())
}

pub fn start() -> Result<TrackingServiceStatus, String> {
    let _ = import_hyprland_environment();
    run_systemctl(&["start", SERVICE_NAME])?;
    Ok(get_status())
}

pub fn restart() -> Result<TrackingServiceStatus, String> {
    let _ = import_hyprland_environment();
    run_systemctl(&["restart", SERVICE_NAME])?;
    Ok(get_status())
}

pub fn uninstall() -> Result<TrackingServiceStatus, String> {
    let _ = run_systemctl(&["disable", "--now", SERVICE_NAME]);
    if let Ok(unit_path) = service_unit_path() {
        if unit_path.exists() {
            fs::remove_file(unit_path).map_err(|error| error.to_string())?;
        }
    }
    let _ = run_systemctl(&["daemon-reload"]);
    Ok(get_status())
}
