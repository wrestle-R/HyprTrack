use std::{
    env, fs,
    path::{Path, PathBuf},
};

const DESKTOP_FILE_NAME: &str = "hyprtrack-desktop.desktop";
const ICON_FILE_NAME: &str = "hyprtrack-desktop.png";
const ICON_BYTES: &[u8] = include_bytes!("../icons/128x128.png");

fn quote_exec_path(path: &Path) -> String {
    let escaped = path
        .to_string_lossy()
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('`', "\\`")
        .replace('$', "\\$");
    format!("\"{escaped}\"")
}

fn desktop_entry(appimage_path: &Path) -> String {
    format!(
        "[Desktop Entry]\n\
         Version=1.0\n\
         Type=Application\n\
         Name=HyprTrack Desktop\n\
         Comment=Local Hyprland activity intelligence\n\
         Exec={}\n\
         Icon=hyprtrack-desktop\n\
         Terminal=false\n\
         Categories=Utility;\n\
         StartupWMClass=hyprtrack-desktop\n\
         X-AppImage-Name=HyprTrack Desktop\n",
        quote_exec_path(appimage_path),
    )
}

fn install_appimage_desktop_entry(
    data_home: &Path,
    appimage_path: &Path,
) -> Result<PathBuf, String> {
    let applications_dir = data_home.join("applications");
    let icon_dir = data_home.join("icons/hicolor/128x128/apps");
    let launcher_path = applications_dir.join(DESKTOP_FILE_NAME);
    let icon_path = icon_dir.join(ICON_FILE_NAME);

    fs::create_dir_all(&applications_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&icon_dir).map_err(|error| error.to_string())?;
    fs::write(&icon_path, ICON_BYTES).map_err(|error| error.to_string())?;
    fs::write(&launcher_path, desktop_entry(appimage_path)).map_err(|error| error.to_string())?;

    Ok(launcher_path)
}

fn user_data_home() -> Option<PathBuf> {
    env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")))
}

pub fn configure_appimage_desktop_integration() -> Result<Option<PathBuf>, String> {
    let Some(appimage_path) = env::var_os("APPIMAGE").map(PathBuf::from) else {
        return Ok(None);
    };
    if !appimage_path.is_file() {
        return Ok(None);
    }
    let data_home = user_data_home()
        .ok_or_else(|| "Unable to determine the user data directory.".to_string())?;
    install_appimage_desktop_entry(&data_home, &appimage_path).map(Some)
}

#[cfg(test)]
mod tests {
    use super::{desktop_entry, install_appimage_desktop_entry};
    use std::fs;
    use std::path::Path;

    #[test]
    fn desktop_entry_uses_absolute_appimage_and_icon_paths() {
        let entry = desktop_entry(Path::new(
            "/home/test/Applications/HyprTrack Desktop.AppImage",
        ));

        assert!(entry.contains("Exec=\"/home/test/Applications/HyprTrack Desktop.AppImage\"\n"));
        assert!(entry.contains("Icon=hyprtrack-desktop\n"));
        assert!(entry.contains("StartupWMClass=hyprtrack-desktop\n"));
    }

    #[test]
    fn installs_launcher_and_icon_in_the_user_data_directory() {
        let temp = tempfile::tempdir().unwrap();
        let appimage = temp.path().join("HyprTrack Desktop.AppImage");
        fs::write(&appimage, b"appimage").unwrap();

        let launcher = install_appimage_desktop_entry(temp.path(), &appimage).unwrap();
        let icon = temp
            .path()
            .join("icons/hicolor/128x128/apps/hyprtrack-desktop.png");

        assert_eq!(
            launcher,
            temp.path().join("applications/hyprtrack-desktop.desktop")
        );
        assert!(launcher.is_file());
        assert!(icon.is_file());

        let entry = fs::read_to_string(launcher).unwrap();
        assert!(entry.contains("Icon=hyprtrack-desktop\n"));
        assert!(entry.contains(&format!("Exec=\"{}\"\n", appimage.display())));
    }
}
