import { useEffect, useRef, useState } from "react"
import releases from "../lib/releases.json"
import { PREFERENCES_KEY } from "../lib/preferences"

export const RELEASE_VERSION_KEY = "hyprtrack.desktop.release-version"
export type ReleaseNotice = { version: string; previousVersion: string | null; releases: typeof releases }

function compare(a: string, b: string) {
  const left = a.split(".").map(Number), right = b.split(".").map(Number)
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i]
  return 0
}

export function consumeReleaseNotice(version: string, storage: Storage, hasExistingActivity = false): ReleaseNotice | null {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null
  try {
    const saved = storage.getItem(RELEASE_VERSION_KEY)
    const previous = saved && /^\d+\.\d+\.\d+$/.test(saved) ? saved : null
    // Preserve the high-water mark across downgrades, so old notes cannot repeat.
    if (previous && compare(version, previous) <= 0) return null
    const existingInstallation = hasExistingActivity || storage.getItem(PREFERENCES_KEY) !== null
    // Earlier releases did not record their version. Show this release only for
    // that migration, rather than claiming we know which older releases were used.
    const installed = releases.filter(release => compare(release.version, version) <= 0 &&
      (previous ? compare(release.version, previous) > 0 : release.version === version))
    storage.setItem(RELEASE_VERSION_KEY, version)
    return (previous || existingInstallation) && installed.length ? { version, previousVersion: previous, releases: installed } : null
  } catch {
    // If persistence is blocked, keep the app usable without a repeating notice.
    return null
  }
}

export function useReleaseNotice(version: string | null, hasExistingActivity = false) {
  const [notice, setNotice] = useState<ReleaseNotice | null>(null)
  const handled = useRef<string | null>(null)
  useEffect(() => {
    if (!version || handled.current === version) return
    handled.current = version
    try { setNotice(consumeReleaseNotice(version, window.localStorage, hasExistingActivity)) }
    catch { setNotice(null) }
  }, [version, hasExistingActivity])
  return { notice, dismiss: () => setNotice(null) }
}
