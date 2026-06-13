import type { RangeKey } from "@/lib/dashboard/types"

export const PREFERENCES_KEY = "hyprtrack.preferences"

export type DashboardPreferences = {
  version: 1
  theme: "system" | "light" | "dark"
  defaultRange: RangeKey
  productiveTitles: string[]
  tableDensity: "compact" | "comfortable"
}

export const DEFAULT_PREFERENCES: DashboardPreferences = {
  version: 1,
  theme: "system",
  defaultRange: "today",
  productiveTitles: ["VS Code", "GitHub"],
  tableDensity: "comfortable",
}

function isPreferences(value: unknown): value is DashboardPreferences {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<DashboardPreferences>
  return (
    candidate.version === 1 &&
    ["system", "light", "dark"].includes(candidate.theme ?? "") &&
    ["today", "7d", "30d"].includes(candidate.defaultRange ?? "") &&
    Array.isArray(candidate.productiveTitles) &&
    candidate.productiveTitles.every((title) => typeof title === "string") &&
    ["compact", "comfortable"].includes(candidate.tableDensity ?? "")
  )
}

export function parsePreferences(raw: string | null): DashboardPreferences {
  if (!raw) {
    return DEFAULT_PREFERENCES
  }

  try {
    const value: unknown = JSON.parse(raw)
    return isPreferences(value) ? value : DEFAULT_PREFERENCES
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function serializePreferences(preferences: DashboardPreferences) {
  return JSON.stringify(preferences)
}

let cachedRaw: string | null | undefined
let cachedPreferences = DEFAULT_PREFERENCES

export function getPreferencesSnapshot() {
  const raw = localStorage.getItem(PREFERENCES_KEY)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedPreferences = parsePreferences(raw)
  }
  return cachedPreferences
}

export function getServerPreferencesSnapshot() {
  return DEFAULT_PREFERENCES
}

export function subscribePreferences(callback: () => void) {
  const handleChange = (event: Event) => {
    if (
      event instanceof StorageEvent &&
      event.key !== null &&
      event.key !== PREFERENCES_KEY
    ) {
      return
    }
    callback()
  }

  window.addEventListener("storage", handleChange)
  window.addEventListener("hyprtrack-preferences", handleChange)
  return () => {
    window.removeEventListener("storage", handleChange)
    window.removeEventListener("hyprtrack-preferences", handleChange)
  }
}

export function writePreferences(preferences: DashboardPreferences) {
  localStorage.setItem(PREFERENCES_KEY, serializePreferences(preferences))
  window.dispatchEvent(new Event("hyprtrack-preferences"))
}
