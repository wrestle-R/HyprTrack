mod analytics;
mod collector;
mod desktop_integration;
mod storage;

use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use analytics::{
    read_activity, read_applications, read_health, read_overview, ActivityData, ApplicationsData,
    HealthData, OverviewData,
};
use collector::CollectorHandle;
use desktop_integration::configure_appimage_desktop_integration;
use serde::Serialize;
use storage::{prepare_database, MigrationResult};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, RunEvent, State, WindowEvent,
};
#[cfg(desktop)]
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

struct AppState {
    database_path: PathBuf,
    collector: Mutex<Option<CollectorHandle>>,
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

fn database_string(state: &AppState) -> String {
    state.database_path.to_string_lossy().into_owned()
}

fn latest_sample_at(state: &AppState) -> Option<String> {
    read_health(&database_string(state))
        .ok()
        .and_then(|health| health.latest_sample_at)
}

fn resolve_collector_status(state: &AppState) -> Result<CollectorStatus, String> {
    let guard = state
        .collector
        .lock()
        .map_err(|_| "Collector state is unavailable.".to_string())?;
    let runtime = guard
        .as_ref()
        .and_then(|handle| handle.state.lock().ok().map(|state| state.clone()));
    let (collector_state, message) = match runtime {
        Some(runtime) if runtime.running => (
            "running_app",
            runtime
                .last_error
                .map(|error| format!("Collector is reconnecting: {error}"))
                .unwrap_or_else(|| "Collector is running inside HyprTrack Desktop.".into()),
        ),
        Some(runtime) => (
            "error",
            runtime
                .last_error
                .unwrap_or_else(|| "Collector stopped unexpectedly.".into()),
        ),
        None => ("stopped", "Collector is stopped.".into()),
    };
    Ok(CollectorStatus {
        state: collector_state,
        db_path: database_string(state),
        latest_sample_at: latest_sample_at(state),
        pid: Some(std::process::id()),
        managed_by_app: true,
        message,
    })
}

fn start_collector_impl(state: &AppState) -> Result<CollectorStatus, String> {
    let mut guard = state
        .collector
        .lock()
        .map_err(|_| "Collector state is unavailable.".to_string())?;
    let running = guard
        .as_ref()
        .and_then(|handle| handle.state.lock().ok())
        .is_some_and(|runtime| runtime.running);
    if !running {
        if let Some(handle) = guard.take() {
            handle.stop();
        }
        *guard = Some(collector::start(state.database_path.clone())?);
    }
    drop(guard);
    resolve_collector_status(state)
}

fn stop_collector_impl(state: &AppState) -> Result<CollectorStatus, String> {
    let handle = state
        .collector
        .lock()
        .map_err(|_| "Collector state is unavailable.".to_string())?
        .take();
    if let Some(handle) = handle {
        handle.stop();
    }
    resolve_collector_status(state)
}

fn restart_collector_impl(state: &AppState) -> Result<CollectorStatus, String> {
    let _ = stop_collector_impl(state)?;
    start_collector_impl(state)
}

#[tauri::command]
fn get_overview(range: String, state: State<'_, AppState>) -> Result<OverviewData, String> {
    read_overview(&database_string(&state), &range)
}

#[tauri::command]
fn get_activity(
    range: String,
    page: usize,
    page_size: usize,
    app: Option<String>,
    search: Option<String>,
    state: State<'_, AppState>,
) -> Result<ActivityData, String> {
    read_activity(
        &database_string(&state),
        &range,
        app,
        search,
        page,
        page_size,
    )
}

#[tauri::command]
fn get_applications(
    range: String,
    search: Option<String>,
    state: State<'_, AppState>,
) -> Result<ApplicationsData, String> {
    read_applications(&database_string(&state), &range, search)
}

#[tauri::command]
fn get_health(state: State<'_, AppState>) -> Result<HealthData, String> {
    read_health(&database_string(&state))
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
        enabled: app
            .autolaunch()
            .is_enabled()
            .map_err(|error| error.to_string())?,
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

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show window", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide window", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh data", true, None::<&str>)?;
    let start = MenuItem::with_id(app, "start", "Start tracking", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "Stop tracking", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart", "Restart tracking", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&show, &hide, &refresh, &start, &stop, &restart, &quit],
    )?;

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

fn legacy_database_candidate() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("HYPRTRACK_LEGACY_DB").map(PathBuf::from) {
        return path.is_file().then_some(path);
    }
    let roots = [
        std::env::current_dir().ok(),
        std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(Path::to_path_buf)),
    ];
    roots
        .into_iter()
        .flatten()
        .flat_map(|root| {
            root.ancestors()
                .map(|ancestor| ancestor.join("collector/hyprtrack.db"))
                .collect::<Vec<_>>()
        })
        .find(|path| path.is_file())
}

fn configure_first_run_autostart(app: &AppHandle, app_data_dir: &Path) -> Result<(), String> {
    let marker = app_data_dir.join(".autostart-initialized");
    if marker.exists() {
        return Ok(());
    }
    app.autolaunch()
        .enable()
        .map_err(|error| error.to_string())?;
    fs::write(marker, b"enabled-on-first-launch\n").map_err(|error| error.to_string())
}

fn is_autostart_launch() -> bool {
    std::env::args().any(|argument| argument == "--autostart")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window_impl(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Err(error) = configure_appimage_desktop_integration() {
                eprintln!("HyprTrack could not install its application launcher: {error}");
            }
            app.handle().plugin(tauri_plugin_autostart::init(
                MacosLauncher::LaunchAgent,
                Some(vec!["--autostart"]),
            ))?;
            let app_data_dir = app.path().app_data_dir()?;
            let database_path = app_data_dir.join("hyprtrack.db");
            let migration =
                prepare_database(&database_path, legacy_database_candidate().as_deref())
                    .map_err(std::io::Error::other)?;
            match migration {
                MigrationResult::Imported { rows } => {
                    eprintln!("HyprTrack imported {rows} legacy activity rows.");
                }
                MigrationResult::Created | MigrationResult::Existing => {}
            }
            configure_first_run_autostart(app.handle(), &app_data_dir)
                .map_err(std::io::Error::other)?;
            app.manage(AppState {
                database_path,
                collector: Mutex::new(None),
            });
            start_collector_impl(&app.state::<AppState>()).map_err(std::io::Error::other)?;
            build_tray(app.handle())?;
            if is_autostart_launch() {
                hide_main_window_impl(app.handle());
            }
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
        .build(tauri::generate_context!())
        .expect("error while building HyprTrack Desktop");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            if let Some(state) = app_handle.try_state::<AppState>() {
                let _ = stop_collector_impl(&state);
            }
        }
    });
}
