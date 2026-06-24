#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
VERSION="$(node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json","utf8")).version)')"
EXPECTED_APPIMAGE="HyprTrack.Desktop_${VERSION}_amd64.AppImage"

if [[ "$EXPECTED_APPIMAGE" != "HyprTrack.Desktop_0.2.0_amd64.AppImage" ]]; then
  echo "Unexpected release AppImage name: $EXPECTED_APPIMAGE"
  exit 1
fi

if ! grep -Fq 'LDAI_RUNTIME_FILE' "$ROOT_DIR/scripts/build-linux-release.sh"; then
  echo "Release builder does not provide an offline AppImage runtime fallback"
  exit 1
fi

APPDIR="$TMP_DIR/HyprTrack Desktop.AppDir"
mkdir -p \
  "$APPDIR/usr/bin" \
  "$APPDIR/apprun-hooks" \
  "$APPDIR/usr/share/applications" \
  "$APPDIR/usr/share/icons/hicolor/128x128/apps"

cat > "$APPDIR/AppRun" <<'APP_RUN'
#!/usr/bin/env bash
source "$(dirname "$0")/apprun-hooks/linuxdeploy-plugin-gtk.sh"
exec "$(dirname "$0")/AppRun.wrapped" "$@"
APP_RUN
chmod +x "$APPDIR/AppRun"

cat > "$APPDIR/usr/bin/hyprtrack-desktop" <<'APP_BIN'
#!/usr/bin/env bash
echo hyprtrack
APP_BIN
chmod +x "$APPDIR/usr/bin/hyprtrack-desktop"

cat > "$APPDIR/usr/share/applications/HyprTrack Desktop.desktop" <<'DESKTOP'
[Desktop Entry]
Name=HyprTrack Desktop
Exec=hyprtrack-desktop
Icon=hyprtrack-desktop
Type=Application
Categories=Utility;
DESKTOP
printf 'png' > "$APPDIR/usr/share/icons/hicolor/128x128/apps/hyprtrack-desktop.png"

"$ROOT_DIR/scripts/build-linux-release.sh" --patch-appdir "$APPDIR"

if ! grep -Fq 'LD_LIBRARY_PATH="/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"' "$APPDIR/AppRun"; then
  echo "AppRun does not force system libraries first"
  exit 1
fi

if grep -Fq 'linuxdeploy-plugin-gtk.sh' "$APPDIR/AppRun"; then
  echo "AppRun still sources the linuxdeploy GTK hook"
  exit 1
fi

if ! "$APPDIR/AppRun" --version >/dev/null 2>&1; then
  echo "Patched AppRun is not executable"
  exit 1
fi

if [[ ! -f "$APPDIR/hyprtrack-desktop.png" ]]; then
  echo "Root AppImage icon was not staged"
  exit 1
fi
