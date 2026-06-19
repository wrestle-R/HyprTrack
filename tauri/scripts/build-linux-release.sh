#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPIMAGE_PLUGIN="${APPIMAGE_PLUGIN:-$HOME/.cache/tauri/linuxdeploy-plugin-appimage.AppImage}"
APPIMAGE_RUNTIME_CACHE="${APPIMAGE_RUNTIME_CACHE:-$HOME/.cache/tauri/runtime-x86_64}"
APPIMAGE_RUNTIME_SOURCE="${APPIMAGE_RUNTIME_SOURCE:-$HOME/.local/bin/hyprtrack-desktop.AppImage}"

usage() {
  cat <<'USAGE'
Usage:
  scripts/build-linux-release.sh
  scripts/build-linux-release.sh --patch-appdir <path-to-AppDir>

Builds the Linux release bundles, patches the AppImage AppRun wrapper to prefer
system WebKitGTK/GTK libraries, repacks the AppImage, and writes SHA256SUMS.
USAGE
}

patch_appdir() {
  local appdir="$1"
  local app_bin="$appdir/usr/bin/hyprtrack-desktop"
  local desktop_file
  local icon_name
  local icon_path

  if [[ ! -d "$appdir" ]]; then
    echo "AppDir not found: $appdir" >&2
    exit 1
  fi
  if [[ ! -x "$app_bin" ]]; then
    echo "HyprTrack binary not found or not executable: $app_bin" >&2
    exit 1
  fi

  cat > "$appdir/AppRun" <<'APP_RUN'
#!/usr/bin/env bash
set -e

this_dir="$(readlink -f "$(dirname "$0")")"
export APPDIR="${APPDIR:-$this_dir}"
export LD_LIBRARY_PATH="/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

exec "$this_dir/usr/bin/hyprtrack-desktop" "$@"
APP_RUN
  chmod +x "$appdir/AppRun"

  desktop_file="$(find "$appdir/usr/share/applications" -maxdepth 1 -type f -name '*.desktop' | sort | head -n 1)"
  if [[ -n "$desktop_file" ]]; then
    local root_desktop="$appdir/$(basename "$desktop_file")"
    if [[ "$(readlink -f "$desktop_file")" != "$(readlink -f "$root_desktop" 2>/dev/null || true)" ]]; then
      cp -f "$desktop_file" "$root_desktop"
    fi
    icon_name="$(awk -F= '$1 == "Icon" { print $2; exit }' "$desktop_file")"
    if [[ -n "$icon_name" && "$icon_name" != /* ]]; then
      icon_path="$(find "$appdir/usr/share/icons" -type f \( -name "$icon_name.png" -o -name "$icon_name.svg" -o -name "$icon_name.xpm" \) | sort | head -n 1)"
      if [[ -n "$icon_path" ]]; then
        cp -f "$icon_path" "$appdir/$(basename "$icon_path")"
      fi
    fi
  fi
}

prepare_appimage_runtime() {
  local offset
  local temporary_runtime

  if [[ -n "${LDAI_RUNTIME_FILE:-}" && -f "$LDAI_RUNTIME_FILE" ]]; then
    return
  fi
  if [[ -f "$APPIMAGE_RUNTIME_CACHE" ]]; then
    export LDAI_RUNTIME_FILE="$APPIMAGE_RUNTIME_CACHE"
    return
  fi
  if [[ ! -x "$APPIMAGE_RUNTIME_SOURCE" ]]; then
    return
  fi

  offset="$("$APPIMAGE_RUNTIME_SOURCE" --appimage-offset 2>/dev/null || true)"
  if [[ ! "$offset" =~ ^[0-9]+$ || "$offset" -le 0 ]]; then
    return
  fi

  mkdir -p "$(dirname "$APPIMAGE_RUNTIME_CACHE")"
  temporary_runtime="${APPIMAGE_RUNTIME_CACHE}.tmp"
  head -c "$offset" "$APPIMAGE_RUNTIME_SOURCE" > "$temporary_runtime"
  chmod +x "$temporary_runtime"
  mv "$temporary_runtime" "$APPIMAGE_RUNTIME_CACHE"
  export LDAI_RUNTIME_FILE="$APPIMAGE_RUNTIME_CACHE"
  echo "Using cached AppImage runtime: $LDAI_RUNTIME_FILE"
}

if [[ "${1:-}" == "--patch-appdir" ]]; then
  if [[ $# -ne 2 ]]; then
    usage >&2
    exit 1
  fi
  patch_appdir "$2"
  exit 0
fi

if [[ $# -ne 0 ]]; then
  usage >&2
  exit 1
fi

cd "$ROOT_DIR"

version="$(node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json","utf8")).version)')"
bundle_dir="$ROOT_DIR/src-tauri/target/release/bundle"
appimage_dir="$bundle_dir/appimage"
artifact_name="HyprTrack.Desktop_${version}_amd64.AppImage"

rm -rf "$bundle_dir"

npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri -- build --bundles deb,rpm

set +e
npm run tauri -- build --bundles appimage
appimage_build_status=$?
set -e
if [[ "$appimage_build_status" -ne 0 ]]; then
  echo "Tauri AppImage finalization failed; continuing with generated AppDir for patched repack."
fi

mapfile -t appdirs < <(find "$appimage_dir" -maxdepth 1 -type d -name '*.AppDir' | sort)
if [[ "${#appdirs[@]}" -ne 1 ]]; then
  echo "Expected one AppDir in $appimage_dir, found ${#appdirs[@]}" >&2
  printf '%s\n' "${appdirs[@]}" >&2
  exit 1
fi

appdir="${appdirs[0]}"
patch_appdir "$appdir"

if [[ ! -x "$APPIMAGE_PLUGIN" ]]; then
  echo "AppImage plugin not found or not executable: $APPIMAGE_PLUGIN" >&2
  echo "Tauri did not download linuxdeploy-plugin-appimage during the AppImage build." >&2
  exit 1
fi

prepare_appimage_runtime

rm -f "$appimage_dir"/*.AppImage
(
  cd "$appimage_dir"
  ARCH=x86_64 "$APPIMAGE_PLUGIN" --appdir="$appdir"
)

mapfile -t generated < <(find "$appimage_dir" -maxdepth 1 -type f -name '*.AppImage' | sort)
if [[ "${#generated[@]}" -ne 1 ]]; then
  echo "Expected one generated AppImage, found ${#generated[@]}" >&2
  printf '%s\n' "${generated[@]}" >&2
  exit 1
fi
mv "${generated[0]}" "$appimage_dir/$artifact_name"

find "$bundle_dir" \
  -type f \( -name '*.AppImage' -o -name '*.deb' -o -name '*.rpm' \) \
  -print0 | sort -z | xargs -0 sha256sum > "$ROOT_DIR/SHA256SUMS"

echo "Linux release artifacts:"
find "$bundle_dir" \
  -type f \( -name '*.AppImage' -o -name '*.deb' -o -name '*.rpm' \) \
  -print | sort
echo "$ROOT_DIR/SHA256SUMS"
