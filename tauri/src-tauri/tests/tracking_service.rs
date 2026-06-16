use std::path::Path;

use tauri_lib::tracking_service::{
    build_service_unit, parse_systemctl_status, resolve_service_state, ServiceState,
};

#[test]
fn service_unit_uses_appimage_and_collector_service_flag() {
    let unit = build_service_unit(Path::new("/home/test/Apps/HyprTrack Desktop.AppImage"));

    assert!(unit.contains("Description=HyprTrack background tracker"));
    assert!(unit
        .contains("ExecStart=\"/home/test/Apps/HyprTrack Desktop.AppImage\" --collector-service"));
    assert!(unit.contains("Restart=always"));
    assert!(unit.contains("RestartSec=2"));
    assert!(unit.contains("WantedBy=default.target"));
}

#[test]
fn status_parser_maps_systemd_states() {
    let running = parse_systemctl_status(
        "LoadState=loaded\nActiveState=active\nSubState=running\nMainPID=4321\nUnitFileState=enabled\n",
    );
    assert_eq!(running.state, ServiceState::Running);
    assert_eq!(running.pid, Some(4321));
    assert!(running.installed);
    assert!(running.enabled);

    assert_eq!(
        resolve_service_state("loaded", "activating", "auto-restart"),
        ServiceState::Restarting
    );
    assert_eq!(
        resolve_service_state("loaded", "activating", "start"),
        ServiceState::Starting
    );
    assert_eq!(
        resolve_service_state("loaded", "failed", "failed"),
        ServiceState::Failed
    );
    assert_eq!(
        resolve_service_state("not-found", "inactive", "dead"),
        ServiceState::Stopped
    );
}
