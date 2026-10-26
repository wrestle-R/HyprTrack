#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

tag="${RELEASE_TAG:?RELEASE_TAG must name the built release}"
version="${tag#v}"
[[ "$tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]
bundle=src-tauri/target/release/bundle
assets=(
  "$bundle/appimage/HyprTrack.Desktop_${version}_amd64.AppImage"
  "$bundle/appimage/HyprTrack.Desktop_${version}_amd64.AppImage.sig"
  "$bundle/appimage/latest.json"
  "$bundle/deb/HyprTrack.Desktop_${version}_amd64.deb"
  "$bundle/rpm/HyprTrack.Desktop-${version}-1.x86_64.rpm"
  SHA256SUMS
)
for asset in "${assets[@]}"; do test -s "$asset"; done
node --input-type=module - "${assets[@]:0:5}" <<'JS'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
const lines = fs.readFileSync('SHA256SUMS', 'utf8').trim().split('\n')
if (lines.length !== 5) throw Error('Expected checksums for exactly five final assets')
for (const file of process.argv.slice(2)) {
  const digest = createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  if (!lines.includes(`${digest}  ${path.basename(file)}`)) throw Error(`Checksum mismatch: ${file}`)
}
JS
node scripts/updater-manifest.mjs "$bundle/appimage" "$version" --check
notes="$(mktemp)"
trap 'rm -f "$notes"' EXIT
RELEASE_NOTES="$notes" node --input-type=module <<'JS'
import fs from 'node:fs'
const version = process.env.RELEASE_TAG.slice(1)
const entry = JSON.parse(fs.readFileSync('src/lib/releases.json', 'utf8')).find(r => r.version === version)
if (!entry) throw Error('Missing release notes')
fs.writeFileSync(process.env.RELEASE_NOTES, [entry.title, '', ...entry.highlights.map(s => `- ${s}`), '', 'Linux network capture needs the one-time NetHogs setup described in the README. Signed in-app updates are available for AppImage installations.', ''].join('\n'))
JS

if gh release view "$tag" --json isDraft >/dev/null 2>&1; then
  [[ "$(gh release view "$tag" --json isDraft --jq .isDraft)" == true ]] || {
    echo 'Refusing to replace an already published release' >&2; exit 1;
  }
else
  gh release create "$tag" --verify-tag --draft --title "HyprTrack Desktop $tag" --notes-file "$notes"
fi

# Upload final assets sequentially. A retry can safely replace a partial draft upload.
for asset in "${assets[@]}"; do
  uploaded=false
  for attempt in 1 2 3; do
    if gh release upload "$tag" "$asset" --clobber; then uploaded=true; break; fi
    sleep "$((attempt * 3))"
  done
  [[ "$uploaded" == true ]] || exit 1
done
[[ "$(gh release view "$tag" --json assets --jq '.assets | length')" == 6 ]]
gh release edit "$tag" --draft=false
