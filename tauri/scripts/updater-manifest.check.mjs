import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createUpdaterManifest } from "./updater-manifest.mjs"

test("the manifest requires the exact final artifact and signature", () => {
  const directory = mkdtempSync(join(tmpdir(), "hyprtrack-manifest-"))
  try {
    assert.throws(() => createUpdaterManifest(directory, "../../bad"))
    assert.throws(() => createUpdaterManifest(directory, "2.2.1"))
    const path = join(directory, "HyprTrack.Desktop_2.2.1_amd64.AppImage")
    writeFileSync(path, "fixture")
    writeFileSync(`${path}.sig`, "invalid")
    assert.throws(() => createUpdaterManifest(directory, "2.2.1"))
    const signature = Buffer.from("untrusted comment: fixture signature\nnot-a-real-key").toString("base64")
    writeFileSync(`${path}.sig`, signature)
    const manifest = createUpdaterManifest(directory, "2.2.1")
    assert.equal(manifest.platforms["linux-x86_64"].signature, signature)
    assert.equal(manifest.platforms["linux-x86_64"].url, "https://github.com/wrestle-R/HyprTrack/releases/download/v2.2.1/HyprTrack.Desktop_2.2.1_amd64.AppImage")
    assert.match(manifest.notes, /Dataflow/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
