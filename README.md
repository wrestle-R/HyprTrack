# HyprTrack Desktop

HyprTrack is a standalone Arch Linux desktop application for local Hyprland
activity tracking. The Tauri application listens to Hyprland window events,
stores timed activity intervals in a private SQLite database, and presents
overview, activity, application, and productivity dashboards.

No Python runtime, web server, account, or network service is required.

## Screenshots

### Light mode

![HyprTrack Desktop in light mode](tauri/public/light_screenshot.png)

### Dark mode

![HyprTrack Desktop in dark mode](tauri/public/dark_screenshot.png)

## Supported Platform

- x86_64 Arch Linux
- Hyprland with a working `hyprctl`
- A working system tray/status notifier
- WebKitGTK and GTK runtime libraries

HyprTrack records application classes and window titles locally. The database
is not uploaded anywhere.

## Install On Arch Linux

The current release is `v0.1.4`. Download the AppImage into a permanent
location:

```bash
mkdir -p ~/.local/bin
wget -O ~/.local/bin/hyprtrack-desktop.AppImage \
  https://github.com/wrestle-R/HyprTrack/releases/download/v0.1.4/HyprTrack.Desktop_0.1.4_amd64.AppImage
chmod +x ~/.local/bin/hyprtrack-desktop.AppImage
~/.local/bin/hyprtrack-desktop.AppImage
```

The final command launches HyprTrack and registers **HyprTrack Desktop** in the
current user's application launcher with its icon. Keep the AppImage at this
path because both the launcher and login autostart record its location. If you
move it later, launch it manually from the new path to update the application
launcher, then disable **Launch at login** in Settings and enable it again.

To remove the AppImage:

```bash
rm ~/.local/bin/hyprtrack-desktop.AppImage
rm ~/.local/share/applications/com.hyprtrack.desktop
rm ~/.local/share/icons/hicolor/128x128/apps/hyprtrack-desktop.png
```

Disable **Launch at login** before removing it.

The first manual launch creates the local database, starts tracking, and
enables login autostart. Later login launches start hidden in the tray. Closing
the window hides it; use **Quit** from the tray menu to stop the application.

## Uninstall

Disable **Launch at login**, quit HyprTrack from its tray menu, and remove the
AppImage:

```bash
rm ~/.local/bin/hyprtrack-desktop.AppImage
rm ~/.local/share/applications/com.hyprtrack.desktop
rm ~/.local/share/icons/hicolor/128x128/apps/hyprtrack-desktop.png
```

Application data remains in:

```text
~/.local/share/com.hyprtrack.desktop
```

Delete that directory only when you also want to permanently erase tracking
history and preferences.

## Troubleshooting

- No new activity: verify `hyprctl activewindow -j` works in the same session.
- App starts but has no tray icon: enable a StatusNotifier-compatible tray.
- AppImage autostart breaks after moving it: launch it manually, disable
  **Launch at login**, then enable it again.

## License

HyprTrack is available under the [MIT License](LICENSE).
