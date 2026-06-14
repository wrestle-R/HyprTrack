mod analytics;

use std::{
    fs::OpenOptions,
    path::Path,
    process::{Child, Command, Stdio},
    sync::Mutex,
};

use analytics::{
    read_activity, read_applications, read_health, read_overview, ApplicationsData, HealthData,
    OverviewData, ActivityData,
};
use fs2::FileExt;
use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State, WindowEvent,
};
#[cfg(desktop)]
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

const DEFAULT_DB_PATH: &str = "/home/rdp/Desktop/code/HyprTrack/collector/hyprtrack.db";
const COLLECTOR_DIR: &str = "/home/rdp/Desktop/code/HyprTrack/collector";

struct AppState {
    collector: Mutex<Option<Child>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CollectorStatus {
    state: &'static str,
    db_path: String,
    latest_sample_at: Option<String>,
    pid: Option<u32>,
    managed_by_app: bool,
    message: String,
}

#[derive(Serialize)]
struct AutostartStatus {
    enabled: bool,
}

fn latest_sample_at() -> Option<String> {
    read_health(DEFAULT_DB_PATH).ok().and_then(|health| health.latest_sample_at)
}

fn collector_lock_is_held() -> Result<bool, String> {
    let lock_path = format!("{DEFAULT_DB_PATH}.lock");
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(lock_path)
        .map_err(|error| error.to_string())?;

    match file.try_lock_exclusive() {
        Ok(()) => {
            let _ = file.unlock();
            Ok(false)
        }
        Err(_) => Ok(true),
    }
}

fn managed_pid(state: &AppState) -> Result<Option<u32>, String> {
    let mut guard = state.collector.lock().map_err(|_| "Collector state is unavailable.".to_string())?;
    if let Some(child) = guard.as_mut() {
        match child.try_wait().map_err(|error| error.to_string())? {
            Some(_) => {
                *guard = None;
                Ok(None)
            }
            None => Ok(Some(child.id())),
        }
    } else {
        Ok(None)
    }
}

fn resolve_collector_status(state: &AppState) -> Result<CollectorStatus, String> {
    let latest_sample_at = latest_sample_at();
    if let Some(pid) = managed_pid(state)? {
        return Ok(CollectorStatus {
            state: "running_app",
            db_path: DEFAULT_DB_PATH.to_string(),
            latest_sample_at,
            pid: Some(pid),
            managed_by_app: true,
            message: "Collector is running under desktop control.".into(),
        });
    }

    if collector_lock_is_held()? {
        return Ok(CollectorStatus {
            state: "running_external",
            db_path: DEFAULT_DB_PATH.to_string(),
            latest_sample_at,
            pid: None,
            managed_by_app: false,
            message: "Collector is already running outside the desktop app.".into(),
        });
    }

    Ok(CollectorStatus {
        state: "stopped",
        db_path: DEFAULT_DB_PATH.to_string(),
        latest_sample_at,
        pid: None,
        managed_by_app: false,
        message: "Collector is not running.".into(),
    })
}

fn emit_refresh(app: &AppHandle) {
    let _ = app.emit("hyprtrack://refresh", ());
}

fn show_main_window_impl(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_main_window_impl(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn start_collector_impl(state: &AppState) -> Result<CollectorStatus, String> {
    let status = resolve_collector_status(state)?;
    if status.state == "running_app" || status.state == "running_external" {
        return Ok(status);
    }

    if !Path::new(DEFAULT_DB_PATH).exists() {
        return Err(format!("Database path does not exist: {DEFAULT_DB_PATH}"));
    }

    let mut guard = state.collector.lock().map_err(|_| "Collector state is unavailable.".to_string())?;
    let child = Command::new("python3")
        .arg("hyprtrack.py")
        .arg("--db")
        .arg(DEFAULT_DB_PATH)
        .current_dir(COLLECTOR_DIR)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())?;
    *guard = Some(child);
    drop(guard);

    resolve_collector_status(state)
}

fn stop_collector_impl(state: &AppState) -> Result<CollectorStatus, String> {
    let mut guard = state.collector.lock().map_err(|_| "Collector state is unavailable.".to_string())?;
    if let Some(child) = guard.as_mut() {
        child.kill().map_err(|error| error.to_string())?;
        let _ = child.wait();
        *guard = None;
    }
    drop(guard);

    resolve_collector_status(state)
}

fn restart_collector_impl(state: &AppState) -> Result<CollectorStatus, String> {
    let current = resolve_collector_status(state)?;
    if current.state == "running_external" {
        return Ok(current);
    }
    let _ = stop_collector_impl(state)?;
    start_collector_impl(state)
}

#[tauri::command]
fn get_overview(range: String) -> Result<OverviewData, String> {
    read_overview(DEFAULT_DB_PATH, &range)
}

#[tauri::command]
fn get_activity(
    range: String,
    page: usize,
    page_size: usize,
    app: Option<String>,
    search: Option<String>,
) -> Result<ActivityData, String> {
    read_activity(DEFAULT_DB_PATH, &range, app, search, page, page_size)
}

#[tauri::command]
fn get_applications(range: String, search: Option<String>) -> Result<ApplicationsData, String> {
    read_applications(DEFAULT_DB_PATH, &range, search)
}

#[tauri::command]
fn get_health() -> Result<HealthData, String> {
    read_health(DEFAULT_DB_PATH)
}

#[tauri::command]
fn get_collector_status(state: State<'_, AppState>) -> Result<CollectorStatus, String> {
    resolve_collector_status(&state)
}

#[tauri::command]
fn start_collector(state: State<'_, AppState>) -> Result<CollectorStatus, String> {
    start_collector_impl(&state)
}

#[tauri::command]
fn stop_collector(state: State<'_, AppState>) -> Result<CollectorStatus, String> {
    stop_collector_impl(&state)
}

#[tauri::command]
fn restart_collector(state: State<'_, AppState>) -> Result<CollectorStatus, String> {
    restart_collector_impl(&state)
}

#[tauri::command]
fn show_main_window(app: AppHandle) {
    show_main_window_impl(&app);
}

#[tauri::command]
fn get_autostart_status(app: AppHandle) -> Result<AutostartStatus, String> {
    Ok(AutostartStatus {
        enabled: app.autolaunch().is_enabled().map_err(|error| error.to_string())?,
    })
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<AutostartStatus, String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|error| error.to_string())?;
    } else {
        manager.disable().map_err(|error| error.to_string())?;
    }
    Ok(AutostartStatus {
        enabled: manager.is_enabled().map_err(|error| error.to_string())?,
    })
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show window", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide window", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh data", true, None::<&str>)?;
    let start = MenuItem::with_id(app, "start", "Start collector", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "Stop collector", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart", "Restart collector", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &refresh, &start, &stop, &restart, &quit])?;

    let handle = app.clone();
    let mut tray_builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app_handle, event| match event.id.as_ref() {
            "show" => show_main_window_impl(app_handle),
            "hide" => hide_main_window_impl(app_handle),
            "refresh" => emit_refresh(app_handle),
            "start" => {
                let _ = start_collector_impl(&app_handle.state::<AppState>());
                emit_refresh(app_handle);
            }
            "stop" => {
                let _ = stop_collector_impl(&app_handle.state::<AppState>());
                emit_refresh(app_handle);
            }
            "restart" => {
                let _ = restart_collector_impl(&app_handle.state::<AppState>());
                emit_refresh(app_handle);
            }
            "quit" => app_handle.exit(0),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder.build(&handle)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            collector: Mutex::new(None),
        })
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.handle()
                .plugin(tauri_plugin_autostart::init(
                    MacosLauncher::LaunchAgent,
                    None::<Vec<&str>>,
                ))?;
            build_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_overview,
            get_activity,
            get_applications,
            get_health,
            get_collector_status,
            start_collector,
            stop_collector,
            restart_collector,
            get_autostart_status,
            set_autostart,
            show_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
