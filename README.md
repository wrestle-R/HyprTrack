# HyprTrack Desktop

HyprTrack is a standalone Linux desktop application for local Hyprland activity
tracking. The Tauri application listens to Hyprland window events, stores timed
activity intervals in a private SQLite database, and presents overview,
activity, application, and productivity dashboards.

No Python runtime, web server, account, or network service is required.

## Requirements

- x86_64 Linux
- Hyprland with `hyprctl`
- A working system tray/status notifier
- WebKitGTK and GTK runtime libraries supplied by your distribution

HyprTrack records application classes and window titles locally. The database
is not uploaded anywhere.

## Install From GitHub Releases

Download one file from the latest GitHub Release:

- `*.AppImage`: portable option for most Linux distributions
- `*.deb`: Debian, Ubuntu, and derivatives
- `*.rpm`: Fedora, RHEL-compatible distributions, and openSUSE

### AppImage

```bash
chmod +x HyprTrack*.AppImage
./HyprTrack*.AppImage
```

Keep the AppImage in a permanent location before enabling login autostart. If
you move it later, disable and re-enable **Launch at login** in Settings.

### Debian or Ubuntu

```bash
sudo apt install ./HyprTrack*.deb
```

### Fedora

```bash
sudo dnf install ./HyprTrack*.rpm
```

The first manual launch creates the local database, starts tracking, and
enables login autostart. Later login launches start hidden in the tray. Closing
the window hides it; use **Quit** from the tray menu to stop the application.

## Data And Migration

The production database is stored at:

```text
~/.local/share/com.hyprtrack.desktop/hyprtrack.db
```

On a source checkout, the first launch imports `collector/hyprtrack.db` when
that legacy database exists and the new database does not. Import uses SQLite's
backup API, verifies database integrity and row counts, and leaves the original
file untouched as a backup.

To override the legacy source during migration:

```bash
HYPRTRACK_LEGACY_DB=/path/to/hyprtrack.db ./HyprTrack.AppImage
```

## Local Development

Install Node.js, npm, Rust, and the
[Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/).

On Arch Linux:

```bash
sudo pacman -S --needed base-devel curl file openssl appmenu-gtk-module \
  gtk3 libappindicator-gtk3 librsvg webkit2gtk-4.1
cd tauri
npm ci
npm run tauri dev
```

Run checks:

```bash
cd tauri
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Create and run the local production binary:

```bash
cd tauri
npm run tauri build -- --no-bundle
./src-tauri/target/release/hyprtrack-desktop
```

Create packages locally:

```bash
npm run tauri build -- --bundles deb,rpm
```

Bundles are written below `tauri/src-tauri/target/release/bundle/`. The official
AppImage is built on Ubuntu by GitHub Actions. Arch's current GTK layout is not
compatible with the older `linuxdeploy` GTK plugin used by Tauri, so local
AppImage generation may fail even though the production binary, deb, and rpm
build successfully.

## Publishing A Release

Normal pushes and pull requests run CI but never publish installers. A release
is created only when a strict semantic-version tag is pushed:

```bash
git switch main
git pull
git tag -a v0.1.0 -m "HyprTrack Desktop v0.1.0"
git push origin v0.1.0
```

GitHub Actions derives version `0.1.0` from the tag, runs tests, builds the
x86_64 AppImage, deb, and rpm packages, generates `SHA256SUMS`, and publishes
the GitHub Release. GitHub also adds source ZIP and tar.gz archives.

If the workflow fails, no public release is published. Fix the tagged commit,
delete the failed tag locally and remotely, then create the tag again, or use a
new patch version.

## Uninstall

Remove the installed package using your package manager. AppImage users can
delete the AppImage after disabling **Launch at login**.

Application data remains in:

```text
~/.local/share/com.hyprtrack.desktop
```

Delete that directory only when you also want to permanently erase tracking
history and preferences.

## Troubleshooting

- No new activity: verify `hyprctl activewindow -j` works in the same session.
- App starts but has no tray icon: enable a StatusNotifier-compatible tray.
- Old Python collector still runs: remove its Hyprland startup command and log
  in again before using the standalone collector.
- AppImage autostart breaks after moving it: launch it manually, disable
  **Launch at login**, then enable it again.

## License

HyprTrack is available under the [MIT License](LICENSE).
