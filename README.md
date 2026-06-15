# HyprTrack Desktop

HyprTrack is a standalone Linux desktop application for local Hyprland activity
tracking. The Tauri application listens to Hyprland window events, stores timed
activity intervals in a private SQLite database, and presents overview,
activity, application, and productivity dashboards.

No Python runtime, web server, account, or network service is required.

## Screenshots

### Light mode

![HyprTrack Desktop in light mode](tauri/public/light_screenshot.png)

### Dark mode

![HyprTrack Desktop in dark mode](tauri/public/dark_screenshot.png)

## Requirements

- x86_64 Linux
- Hyprland with `hyprctl`
- A working system tray/status notifier
- WebKitGTK and GTK runtime libraries supplied by your distribution

HyprTrack records application classes and window titles locally. The database
is not uploaded anywhere.

## Install From GitHub Releases

The current release is `v0.1.1`. Choose one installation method:

- **AppImage:** portable option for Arch Linux and other distributions
- **Debian package:** Debian, Ubuntu, Linux Mint, Pop!_OS, and derivatives
- **RPM package:** Fedora, RHEL-compatible distributions, and openSUSE

### AppImage (Arch Linux and other distributions)

Download the AppImage into a permanent location:

```bash
mkdir -p ~/.local/bin
wget -O ~/.local/bin/hyprtrack-desktop.AppImage \
  https://github.com/wrestle-R/HyprTrack/releases/download/v0.1.1/HyprTrack.Desktop_0.1.1_amd64.AppImage
chmod +x ~/.local/bin/hyprtrack-desktop.AppImage
~/.local/bin/hyprtrack-desktop.AppImage
```

The final command launches HyprTrack. Keep the AppImage at this path because
login autostart records its location. If you move it later, launch it manually,
disable **Launch at login** in Settings, and enable it again.

To remove the AppImage:

```bash
rm ~/.local/bin/hyprtrack-desktop.AppImage
```

Disable **Launch at login** before removing it.

### Debian, Ubuntu, Linux Mint, or Pop!_OS

Download and install the Debian package:

```bash
cd /tmp
wget https://github.com/wrestle-R/HyprTrack/releases/download/v0.1.1/HyprTrack.Desktop_0.1.1_amd64.deb
sudo apt install ./HyprTrack.Desktop_0.1.1_amd64.deb
hyprtrack-desktop
```

The `apt install` command installs required package dependencies. To uninstall:

```bash
sudo apt remove hyprtrack-desktop
```

### Fedora

Download and install the RPM package:

```bash
cd /tmp
wget https://github.com/wrestle-R/HyprTrack/releases/download/v0.1.1/HyprTrack.Desktop-0.1.1-1.x86_64.rpm
sudo dnf install ./HyprTrack.Desktop-0.1.1-1.x86_64.rpm
hyprtrack-desktop
```

To uninstall:

```bash
sudo dnf remove hyprtrack-desktop
```

### openSUSE

Download and install the same RPM package:

```bash
cd /tmp
wget https://github.com/wrestle-R/HyprTrack/releases/download/v0.1.1/HyprTrack.Desktop-0.1.1-1.x86_64.rpm
sudo zypper install ./HyprTrack.Desktop-0.1.1-1.x86_64.rpm
hyprtrack-desktop
```

To uninstall:

```bash
sudo zypper remove hyprtrack-desktop
```

The first manual launch creates the local database, starts tracking, and
enables login autostart. Later login launches start hidden in the tray. Closing
the window hides it; use **Quit** from the tray menu to stop the application.

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
- AppImage autostart breaks after moving it: launch it manually, disable
  **Launch at login**, then enable it again.

## License

HyprTrack is available under the [MIT License](LICENSE).
