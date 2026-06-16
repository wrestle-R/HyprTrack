# HyprTrack Desktop

HyprTrack is a standalone Arch Linux desktop application for local Hyprland
activity tracking. A persistent `systemd --user` service listens to Hyprland
window events, stores timed activity intervals in a private SQLite database,
and the Tauri application presents overview, activity, application, and
productivity dashboards.

No Python runtime, web server, account, or network service is required.

## Screenshots

### Light mode

![HyprTrack Desktop in light mode](tauri/public/light_screenshot.png)

### Dark mode

![HyprTrack Desktop in dark mode](tauri/public/dark_screenshot.png)

## Supported Platform

- x86_64 Arch Linux
- Hyprland with a working `hyprctl`
- A working `systemd --user` session
- A working system tray/status notifier
- WebKitGTK and GTK runtime libraries

HyprTrack records application classes and window titles locally. The database
is not uploaded anywhere.

## Install On Arch Linux

The current release is `v0.1.5`. Download the AppImage into a permanent
location:

```bash
mkdir -p ~/.local/bin
wget -O ~/.local/bin/hyprtrack-desktop.AppImage \
  https://github.com/wrestle-R/HyprTrack/releases/download/v0.1.5/HyprTrack.Desktop_0.1.5_amd64.AppImage
chmod +x ~/.local/bin/hyprtrack-desktop.AppImage
~/.local/bin/hyprtrack-desktop.AppImage
```

The final command launches HyprTrack and registers **HyprTrack Desktop** in the
current user's application launcher with its icon. Keep the AppImage at this
path because both the launcher and background service record its location. If
you move it later, launch it manually from the new path and use **Install
Service** in Settings to rewrite the service unit.

First launch creates the local database and installs, enables, and starts this
user service:

```bash
systemctl --user enable --now hyprtrack-tracker.service
```

You can inspect it with:

```bash
systemctl --user status hyprtrack-tracker.service
journalctl --user -u hyprtrack-tracker.service -n 100 --no-pager
```

Tracking resumes after you log into a Hyprland session. Closing or force
quitting the desktop window does not stop the service.

To remove the AppImage:

```bash
rm ~/.local/bin/hyprtrack-desktop.AppImage
rm ~/.local/share/applications/hyprtrack-desktop.desktop
rm ~/.local/share/icons/hicolor/128x128/apps/hyprtrack-desktop.png
```

Disable and remove the user service before removing the AppImage:

```bash
systemctl --user disable --now hyprtrack-tracker.service
rm ~/.config/systemd/user/hyprtrack-tracker.service
systemctl --user daemon-reload
```

## Uninstall

Disable the user service, quit HyprTrack from its tray menu, and remove the
AppImage:

```bash
systemctl --user disable --now hyprtrack-tracker.service
rm ~/.config/systemd/user/hyprtrack-tracker.service
systemctl --user daemon-reload
```

```bash
rm ~/.local/bin/hyprtrack-desktop.AppImage
rm ~/.local/share/applications/hyprtrack-desktop.desktop
rm ~/.local/share/icons/hicolor/128x128/apps/hyprtrack-desktop.png
```

Application data remains in:

```text
~/.local/share/com.hyprtrack.desktop
```

Delete that directory only when you also want to permanently erase tracking
history and preferences.

## Troubleshooting

- No new activity: verify the service is running with
  `systemctl --user status hyprtrack-tracker.service`.
- Hyprland connection errors: verify `hyprctl activewindow -j` works in the
  same session, then use **Restart Service** in Settings.
- Service logs: run
  `journalctl --user -u hyprtrack-tracker.service -n 100 --no-pager`.
- App starts but has no tray icon: enable a StatusNotifier-compatible tray.
- AppImage service breaks after moving it: launch it manually from the new path
  and use **Install Service** in Settings.

## License

HyprTrack is available under the [MIT License](LICENSE).
