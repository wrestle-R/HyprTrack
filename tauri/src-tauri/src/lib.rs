mod analytics;
mod collector;
mod desktop_integration;
mod storage;
pub mod tracking_service;

use std::path::{Path, PathBuf};

use analytics::{
    read_activity, read_applications, read_health, read_overview, ActivityData, ApplicationsData,
    HealthData, OverviewData,
};
use desktop_integration::configure_appimage_desktop_integration;
use storage::{prepare_database, MigrationResult};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State, WindowEvent,
};

struct AppState {
    database_path: PathBuf,
}

fn database_string(state: &AppState) -> String {
    state.database_path.to_string_lossy().into_owned()
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
fn show_main_window(app: AppHandle) {
    show_main_window_impl(&app);
}

#[tauri::command]
fn get_tracking_service_status() -> tracking_service::TrackingServiceStatus {
    tracking_service::get_status()
}

#[tauri::command]
fn install_tracking_service() -> Result<tracking_service::TrackingServiceStatus, String> {
    tracking_service::install()
}

#[tauri::command]
fn start_tracking_service() -> Result<tracking_service::TrackingServiceStatus, String> {
    tracking_service::start()
}

#[tauri::command]
fn restart_tracking_service() -> Result<tracking_service::TrackingServiceStatus, String> {
    tracking_service::restart()
}

#[tauri::command]
fn uninstall_tracking_service() -> Result<tracking_service::TrackingServiceStatus, String> {
    tracking_service::uninstall()
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
    let start = MenuItem::with_id(app, "start", "Start Service", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart", "Restart Service", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &refresh, &start, &restart, &quit])?;

    let handle = app.clone();
    let mut tray_builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app_handle, event| match event.id.as_ref() {
            "show" => show_main_window_impl(app_handle),
            "hide" => hide_main_window_impl(app_handle),
            "refresh" => emit_refresh(app_handle),
            "start" => {
                let _ = tracking_service::start();
                emit_refresh(app_handle);
            }
            "restart" => {
                let _ = tracking_service::restart();
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

fn fallback_app_data_dir() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from) {
        return Ok(path.join("com.hyprtrack.desktop"));
    }
    let home = std::env::var_os("HOME").map(PathBuf::from).ok_or_else(|| {
        "HOME is unavailable; cannot resolve HyprTrack data directory.".to_string()
    })?;
    Ok(home.join(".local/share/com.hyprtrack.desktop"))
}

fn run_collector_service() -> Result<(), String> {
    let database_path = fallback_app_data_dir()?.join("hyprtrack.db");
    prepare_database(&database_path, legacy_database_candidate().as_deref())?;
    collector::run_service(database_path)
}

fn is_collector_service_launch() -> bool {
    std::env::args().any(|argument| argument == "--collector-service")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if is_collector_service_launch() {
        if let Err(error) = run_collector_service() {
            eprintln!("HyprTrack collector service stopped: {error}");
            std::process::exit(1);
        }
        return;
    }

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window_impl(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Err(error) = configure_appimage_desktop_integration() {
                eprintln!("HyprTrack could not install its application launcher: {error}");
            }
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
            app.manage(AppState { database_path });
            if let Err(error) = tracking_service::install().and_then(|_| tracking_service::start())
            {
                eprintln!("HyprTrack could not start its user service: {error}");
            }
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
            get_tracking_service_status,
            install_tracking_service,
            start_tracking_service,
            restart_tracking_service,
            uninstall_tracking_service,
            show_main_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while building HyprTrack Desktop");

    app.run(|_, _| {});
}
