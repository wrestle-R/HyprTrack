//! Verify the published updater against a disposable copy of an AppImage.
//! No installed application, collector, preferences or database is modified.
use std::path::PathBuf;
use std::time::Duration;
use tauri_plugin_updater::UpdaterExt;

fn main() {
    assert_eq!(
        std::env::var("HYPRTRACK_UPDATER_VERIFY").as_deref(),
        Ok("1")
    );
    let args: Vec<String> = std::env::args().collect();
    assert_eq!(
        args.len(),
        3,
        "Pass source AppImage and temporary output directory"
    );
    let output = PathBuf::from(&args[2]).canonicalize().unwrap();
    assert!(output.starts_with(std::env::temp_dir()) && output != std::env::temp_dir());
    let temporary = tempfile::tempdir().unwrap();
    let target = temporary.path().join("HyprTrack.AppImage");
    std::fs::copy(&args[1], &target).unwrap();
    let configuration: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.package_info_mut().version = "2.1.0".parse().unwrap();
    context.config_mut().plugins.0.insert(
        "updater".into(),
        configuration["plugins"]["updater"].clone(),
    );
    let app = tauri::test::mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(context)
        .unwrap();
    let updater = app
        .updater_builder()
        .executable_path(&target)
        .timeout(Duration::from_secs(600))
        .build()
        .unwrap();
    let update = tauri::async_runtime::block_on(updater.check())
        .unwrap()
        .expect("Published update missing");
    let bytes = tauri::async_runtime::block_on(update.download(|_, _| {}, || {}))
        .expect("Published signature must verify");
    update
        .install(&bytes)
        .expect("Disposable AppImage update must install");
    assert_eq!(std::fs::read(&target).unwrap(), bytes);
    let destination = output.join(format!(
        "HyprTrack.Desktop_{}_amd64.AppImage",
        update.version
    ));
    std::fs::copy(target, &destination).unwrap();
    println!(
        "Verified published signature and native AppImage installation: v{} ({} bytes)",
        update.version,
        bytes.len()
    );
    println!("{}", destination.display());
}
