import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export function createUpdaterManifest(directory, version) {
  if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version)) throw new Error("Expected a stable release version")
  const name = `HyprTrack.Desktop_${version}_amd64.AppImage`
  if (!existsSync(join(directory, name))) throw new Error(`Missing final AppImage: ${name}`)
  const signature = readFileSync(join(directory, `${name}.sig`), "utf8").trim()
  if (!Buffer.from(signature, "base64").toString("utf8").startsWith("untrusted comment:")) throw new Error("Missing or invalid AppImage signature")
  const releases = JSON.parse(readFileSync(new URL("../src/lib/releases.json", import.meta.url), "utf8"))
  const release = releases.find((entry) => entry.version === version)
  if (!release) throw new Error("Release notes must exist before publishing an update")
  return {
    version,
    notes: `${release.title}\n\n${release.highlights.map((line) => `- ${line}`).join("\n")}`,
    pub_date: `${release.date}T00:00:00+05:30`,
    platforms: { "linux-x86_64": { signature, url: `https://github.com/wrestle-R/HyprTrack/releases/download/v${version}/${name}` } },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, version, action] = process.argv.slice(2)
  const manifest = createUpdaterManifest(directory, version)
  const path = join(directory, "latest.json")
  if (action === "--check") {
    if (JSON.stringify(JSON.parse(readFileSync(path, "utf8"))) !== JSON.stringify(manifest)) throw new Error("Update manifest does not match the signed release")
  } else writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log("Signed AppImage and update manifest references match")
}
