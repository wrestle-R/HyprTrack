mod analytics;
mod desktop_integration;
mod storage;

use std::{fs, path::PathBuf};

use analytics::{
    read_activity, read_applications, read_health, read_overview, ActivityData, ApplicationsData,
    HealthData, MappingRule, OverviewData,
};
use desktop_integration::configure_appimage_desktop_integration;
use storage::{prepare_database, MigrationResult};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State, WindowEvent,
};

const COLLECTOR_SCRIPT_BYTES: &[u8] =
    include_bytes!("../../../collector/hyprtrack-monitor.py");
const COLLECTOR_SCRIPT_NAME: &str = "hyprtrack-monitor.py";
const COLLECTOR_DATABASE_NAME: &str = "hyprtrack.db";

struct AppState {
    database_path: PathBuf,
}

fn database_string(state: &AppState) -> String {
    state.database_path.to_string_lossy().into_owned()
}

#[tauri::command]
fn get_overview(
    range: String,
    mapping_rules: Vec<MappingRule>,
    state: State<'_, AppState>,
) -> Result<OverviewData, String> {
    read_overview(&database_string(&state), &range, &mapping_rules)
}

#[tauri::command]
fn get_activity(
    range: String,
    page: usize,
    page_size: usize,
    app: Option<String>,
    search: Option<String>,
    mapping_rules: Vec<MappingRule>,
    state: State<'_, AppState>,
) -> Result<ActivityData, String> {
    read_activity(
        &database_string(&state),
        &range,
        app,
        search,
        page,
        page_size,
        &mapping_rules,
    )
}

#[tauri::command]
fn get_applications(
    range: String,
    search: Option<String>,
    mapping_rules: Vec<MappingRule>,
    state: State<'_, AppState>,
) -> Result<ApplicationsData, String> {
    read_applications(&database_string(&state), &range, search, &mapping_rules)
}

#[tauri::command]
fn get_health(state: State<'_, AppState>) -> Result<HealthData, String> {
    read_health(&database_string(&state))
}

#[tauri::command]
fn show_main_window(app: AppHandle) {
    show_main_window_impl(&app);
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
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &refresh, &quit])?;

    let handle = app.clone();
    let mut tray_builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app_handle, event| match event.id.as_ref() {
            "show" => show_main_window_impl(app_handle),
            "hide" => hide_main_window_impl(app_handle),
            "refresh" => emit_refresh(app_handle),
            "quit" => app_handle.exit(0),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }
    tray_builder.build(&handle)?;
    Ok(())
}

fn home_dir() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or_else(|| "HOME is unavailable; cannot resolve HyprTrack paths.".to_string())
}

fn collector_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".local/bin/hyprtrack/collector"))
}

fn collector_script_path() -> Result<PathBuf, String> {
    Ok(collector_dir()?.join(COLLECTOR_SCRIPT_NAME))
}

fn collector_database_path() -> Result<PathBuf, String> {
    Ok(collector_dir()?.join(COLLECTOR_DATABASE_NAME))
}

fn old_app_data_database_candidate() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("HYPRTRACK_LEGACY_DB").map(PathBuf::from) {
        return path.is_file().then_some(path);
    }
    let data_home = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home_dir().unwrap_or_default().join(".local/share"));
    let candidate = data_home
        .join("com.hyprtrack.desktop")
        .join(COLLECTOR_DATABASE_NAME);
    candidate.is_file().then_some(candidate)
}

fn install_collector_script() -> Result<PathBuf, String> {
    let script_path = collector_script_path()?;
    let Some(parent) = script_path.parent() else {
        return Err("Unable to resolve HyprTrack collector directory.".into());
    };
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;

    let needs_write = fs::read(&script_path)
        .map(|existing| existing != COLLECTOR_SCRIPT_BYTES)
        .unwrap_or(true);
    if needs_write {
        fs::write(&script_path, COLLECTOR_SCRIPT_BYTES).map_err(|error| error.to_string())?;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let mut permissions = fs::metadata(&script_path)
            .map_err(|error| error.to_string())?
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&script_path, permissions).map_err(|error| error.to_string())?;
    }

    Ok(script_path)
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

            let collector_script =
                install_collector_script().map_err(std::io::Error::other)?;
            eprintln!(
                "HyprTrack collector script is available at {}.",
                collector_script.display()
            );

            let database_path = collector_database_path().map_err(std::io::Error::other)?;
            let migration =
                prepare_database(&database_path, old_app_data_database_candidate().as_deref())
                    .map_err(std::io::Error::other)?;
            match migration {
                MigrationResult::Imported { rows } => {
                    eprintln!("HyprTrack imported {rows} legacy activity rows.");
                }
                MigrationResult::Created | MigrationResult::Existing => {}
            }

            app.manage(AppState { database_path });
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
            show_main_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while building HyprTrack Desktop");

    app.run(|_, _| {});
}
