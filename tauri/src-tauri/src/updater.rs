use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

static INSTALLING: AtomicBool = AtomicBool::new(false);

struct InstallGuard;
impl Drop for InstallGuard {
    fn drop(&mut self) {
        INSTALLING.store(false, Ordering::Release);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: &'static str,
    update_supported: bool,
}

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        update_supported: std::env::var_os("APPIMAGE").is_some(),
    }
}

fn updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    app.updater_builder()
        .timeout(Duration::from_secs(30))
        .header("Cache-Control", "no-cache")
        .map_err(|_| "Could not prepare the update check.")?
        .build()
        .map_err(|_| "Could not prepare the updater.".into())
}

#[tauri::command]
pub async fn check_app_update(app: AppHandle) -> Result<Option<String>, String> {
    if !get_app_info().update_supported || INSTALLING.load(Ordering::Acquire) {
        return Ok(None);
    }
    updater(&app)?
        .check()
        .await
        .map(|update| update.map(|value| value.version))
        .map_err(|_| {
            "Could not reach the release service. Check your connection and try again.".into()
        })
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    phase: &'static str,
    downloaded: u64,
    total: Option<u64>,
    version: Option<String>,
}

fn emit(
    app: &AppHandle,
    phase: &'static str,
    downloaded: u64,
    total: Option<u64>,
    version: Option<String>,
) {
    let _ = app.emit(
        "hyprtrack://update-progress",
        UpdateProgress {
            phase,
            downloaded,
            total,
            version,
        },
    );
}

#[tauri::command]
pub async fn install_app_update(app: AppHandle) -> Result<String, String> {
    if !get_app_info().update_supported {
        return Err("In-app updates require the Linux AppImage. Update DEB/RPM installations through their package manager.".into());
    }
    INSTALLING
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map_err(|_| "An update is already in progress.")?;
    let _guard = InstallGuard;
    emit(&app, "checking", 0, None, None);
    // Re-check in Rust; never accept a download URL or signature from the webview.
    let update = updater(&app)?
        .check()
        .await
        .map_err(|_| "Could not reach the release service. Try again.")?;
    let Some(mut update) = update else {
        emit(&app, "current", 0, None, None);
        return Ok("current".into());
    };
    update.timeout = Some(Duration::from_secs(600));
    let version = update.version.clone();
    emit(&app, "downloading", 0, None, Some(version.clone()));
    let mut downloaded = 0;
    let mut last_event = Instant::now();
    update.download_and_install(|chunk, total| {
        downloaded += chunk as u64;
        if last_event.elapsed() >= Duration::from_millis(150) || total == Some(downloaded) {
            emit(&app, "downloading", downloaded, total, Some(version.clone()));
            last_event = Instant::now();
        }
    }, || emit(&app, "installing", 0, None, Some(version.clone())))
        .await.map_err(|_| "The update could not be verified or installed. Your usage history is safe. Check installation permissions and try again.")?;
    emit(&app, "restarting", 0, None, Some(version));
    tauri::async_runtime::spawn(async move {
        let _ =
            tauri::async_runtime::spawn_blocking(|| std::thread::sleep(Duration::from_millis(700)))
                .await;
        tauri_plugin_single_instance::destroy(&app);
        app.restart();
    });
    Ok("restarting".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn verify_download(tamper: bool) {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("installed.AppImage");
        std::fs::write(&target, b"original installation").unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        let endpoint = format!("http://{address}/latest.json");
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let signature = include_str!("../tests/fixtures/update.bin.sig").trim();
        let manifest = serde_json::json!({"version":"2.2.0", "platforms":{"linux-x86_64":{
            "signature":signature, "url":format!("http://{address}/update.AppImage")
        }}})
        .to_string();
        let server = std::thread::spawn(move || {
            for _ in 0..2 {
                let deadline = Instant::now() + Duration::from_secs(10);
                let mut stream = loop {
                    match listener.accept() {
                        Ok((stream, _)) => break stream,
                        Err(error)
                            if error.kind() == std::io::ErrorKind::WouldBlock
                                && Instant::now() < deadline =>
                        {
                            std::thread::sleep(Duration::from_millis(5))
                        }
                        Err(error) => panic!("Local updater test transport failed: {error}"),
                    }
                };
                stream
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .unwrap();
                let mut request = [0; 4096];
                let count = stream.read(&mut request).unwrap();
                let body =
                    if String::from_utf8_lossy(&request[..count]).contains("GET /latest.json") {
                        manifest.as_bytes().to_vec()
                    } else if tamper {
                        b"damaged download".to_vec()
                    } else {
                        include_bytes!("../tests/fixtures/update.bin").to_vec()
                    };
                write!(stream, "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n", body.len()).unwrap();
                stream.write_all(&body).unwrap();
            }
        });
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.package_info_mut().version = "2.1.0".parse().unwrap();
        // Insecure transport is enabled ONLY for this disposable loopback test.
        context.config_mut().plugins.0.insert("updater".into(), serde_json::json!({
            "pubkey":config["plugins"]["updater"]["pubkey"], "endpoints":[endpoint], "dangerousInsecureTransportProtocol":true
        }));
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_updater::Builder::new().build())
            .build(context)
            .unwrap();
        let updater = app
            .updater_builder()
            .executable_path(&target)
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap();
        let update = tauri::async_runtime::block_on(updater.check())
            .unwrap()
            .unwrap();
        let bytes = tauri::async_runtime::block_on(update.download(|_, _| {}, || {}));
        server.join().unwrap();
        if tamper {
            assert!(
                bytes.is_err(),
                "Tampered bytes must fail signature verification"
            );
        } else {
            assert_eq!(
                bytes.unwrap(),
                include_bytes!("../tests/fixtures/update.bin")
            );
        }
        assert_eq!(std::fs::read(target).unwrap(), b"original installation");
    }

    #[test]
    fn native_sdk_verifies_a_signed_download_without_changing_the_installation() {
        verify_download(false);
    }

    #[test]
    fn native_sdk_rejects_tampered_bytes_and_preserves_the_installation() {
        verify_download(true);
    }
}
