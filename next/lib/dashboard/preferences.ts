import type { RangeKey } from "@/lib/dashboard/types"

export const PREFERENCES_KEY = "hyprtrack.preferences"

export type FontSizePreference = "small" | "default" | "large"
export type SidebarWidthPreference = "narrow" | "default" | "wide"

export type DashboardPreferences = {
  version: 1
  theme: "system" | "light" | "dark"
  defaultRange: RangeKey
  productiveTitles: string[]
  tableDensity: "compact" | "comfortable"
  fontSize: FontSizePreference
  sidebarWidth: SidebarWidthPreference
}

export const FONT_SIZE_PIXELS: Record<FontSizePreference, string> = {
  small: "14px",
  default: "16px",
  large: "18px",
}

export const SIDEBAR_WIDTH_PIXELS: Record<SidebarWidthPreference, string> = {
  narrow: "224px",
  default: "256px",
  wide: "320px",
}

export const DEFAULT_PREFERENCES: DashboardPreferences = {
  version: 1,
  theme: "system",
  defaultRange: "today",
  productiveTitles: ["VS Code", "GitHub"],
  tableDensity: "comfortable",
  fontSize: "default",
  sidebarWidth: "default",
}

function parsePreferenceDocument(value: unknown): DashboardPreferences | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const candidate = value as Partial<DashboardPreferences>
  if (
    candidate.version !== 1 ||
    !["system", "light", "dark"].includes(candidate.theme ?? "") ||
    !["today", "7d", "30d"].includes(candidate.defaultRange ?? "") ||
    !Array.isArray(candidate.productiveTitles) ||
    !candidate.productiveTitles.every((title) => typeof title === "string") ||
    !["compact", "comfortable"].includes(candidate.tableDensity ?? "") ||
    (candidate.fontSize !== undefined &&
      !["small", "default", "large"].includes(candidate.fontSize)) ||
    (candidate.sidebarWidth !== undefined &&
      !["narrow", "default", "wide"].includes(candidate.sidebarWidth))
  ) {
    return null
  }

  return {
    version: 1,
    theme: candidate.theme as DashboardPreferences["theme"],
    defaultRange:
      candidate.defaultRange as DashboardPreferences["defaultRange"],
    productiveTitles: candidate.productiveTitles,
    tableDensity:
      candidate.tableDensity as DashboardPreferences["tableDensity"],
    fontSize: candidate.fontSize ?? DEFAULT_PREFERENCES.fontSize,
    sidebarWidth: candidate.sidebarWidth ?? DEFAULT_PREFERENCES.sidebarWidth,
  }
}

export function parsePreferences(raw: string | null): DashboardPreferences {
  if (!raw) {
    return DEFAULT_PREFERENCES
  }

  try {
    const value: unknown = JSON.parse(raw)
    return parsePreferenceDocument(value) ?? DEFAULT_PREFERENCES
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
