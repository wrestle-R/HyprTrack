import type { RangeKey } from "./types"
import {
  cloneDefaultKeybindings,
  type Keybinding,
} from "./keybindings"
import {
  cloneDefaultMappingRules,
  type MappingRule,
} from "./mappings"

export const PREFERENCES_KEY = "hyprtrack.desktop.preferences"

export type FontSizePreference = "small" | "default" | "large"
export type SidebarWidthPreference = "narrow" | "default" | "wide"

export type DesktopPreferences = {
  version: 2
  theme: "system" | "light" | "dark"
  defaultRange: RangeKey
  productiveTitles: string[]
  tableDensity: "compact" | "comfortable"
  fontSize: FontSizePreference
  sidebarWidth: SidebarWidthPreference
  mappingRules: MappingRule[]
  keybindings: Keybinding[]
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

export const DEFAULT_PREFERENCES: DesktopPreferences = {
  version: 2,
  theme: "system",
  defaultRange: "today",
  productiveTitles: ["VS Code", "GitHub"],
  tableDensity: "comfortable",
  fontSize: "default",
  sidebarWidth: "default",
  mappingRules: cloneDefaultMappingRules(),
  keybindings: cloneDefaultKeybindings(),
}

function parsePreferenceDocument(value: unknown): DesktopPreferences | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const candidate = value as Partial<DesktopPreferences> & { version?: number }
  if (
    ![1, 2].includes(candidate.version ?? 0) ||
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
    version: 2,
    theme: candidate.theme as DesktopPreferences["theme"],
    defaultRange:
      candidate.defaultRange as DesktopPreferences["defaultRange"],
    productiveTitles: candidate.productiveTitles,
    tableDensity:
      candidate.tableDensity as DesktopPreferences["tableDensity"],
    fontSize: candidate.fontSize ?? DEFAULT_PREFERENCES.fontSize,
    sidebarWidth: candidate.sidebarWidth ?? DEFAULT_PREFERENCES.sidebarWidth,
    mappingRules:
      candidate.version === 2 && Array.isArray(candidate.mappingRules)
        ? candidate.mappingRules
        : cloneDefaultMappingRules(),
    keybindings:
      candidate.version === 2 && Array.isArray(candidate.keybindings)
        ? candidate.keybindings
        : cloneDefaultKeybindings(),
  }
}

export function parsePreferences(raw: string | null): DesktopPreferences {
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

export function serializePreferences(preferences: DesktopPreferences) {
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
  window.addEventListener("hyprtrack-desktop-preferences", handleChange)
  return () => {
    window.removeEventListener("storage", handleChange)
    window.removeEventListener("hyprtrack-desktop-preferences", handleChange)
  }
}

export function writePreferences(preferences: DesktopPreferences) {
  localStorage.setItem(PREFERENCES_KEY, serializePreferences(preferences))
  window.dispatchEvent(new Event("hyprtrack-desktop-preferences"))
}
