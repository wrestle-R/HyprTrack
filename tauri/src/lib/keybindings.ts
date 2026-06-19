export type ShortcutActionId =
  | "navigate.overview"
  | "navigate.applications"
  | "navigate.activity"
  | "navigate.mappings"
  | "navigate.settings"
  | "navigate.keybindings"
  | "dashboard.refresh"
  | "theme.toggle"
  | "autoRefresh.toggle"
  | "range.today"
  | "range.7d"
  | "range.30d"
  | "search.focus"

export type ShortcutGroup = "Navigation" | "Dashboard" | "Display"

export type Keybinding = {
  action: ShortcutActionId
  label: string
  group: ShortcutGroup
  shortcut: string
}

export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  { action: "navigate.overview", label: "Open Overview", group: "Navigation", shortcut: "Ctrl+Alt+1" },
  { action: "navigate.applications", label: "Open Applications", group: "Navigation", shortcut: "Ctrl+Alt+2" },
  { action: "navigate.activity", label: "Open Activity", group: "Navigation", shortcut: "Ctrl+Alt+3" },
  { action: "navigate.mappings", label: "Open Mappings", group: "Navigation", shortcut: "Ctrl+Alt+4" },
  { action: "navigate.settings", label: "Open Settings", group: "Navigation", shortcut: "Ctrl+Alt+5" },
  { action: "navigate.keybindings", label: "Open Keybindings", group: "Navigation", shortcut: "Ctrl+Alt+K" },
  { action: "dashboard.refresh", label: "Refresh data", group: "Dashboard", shortcut: "Ctrl+Alt+R" },
  { action: "autoRefresh.toggle", label: "Toggle auto-refresh", group: "Dashboard", shortcut: "Ctrl+Alt+A" },
  { action: "range.today", label: "Use Today range", group: "Dashboard", shortcut: "Ctrl+Alt+Shift+1" },
  { action: "range.7d", label: "Use 7-day range", group: "Dashboard", shortcut: "Ctrl+Alt+Shift+2" },
  { action: "range.30d", label: "Use 30-day range", group: "Dashboard", shortcut: "Ctrl+Alt+Shift+3" },
  { action: "search.focus", label: "Focus page search", group: "Dashboard", shortcut: "Ctrl+Alt+F" },
  { action: "theme.toggle", label: "Toggle theme", group: "Display", shortcut: "Ctrl+Alt+T" },
]

type KeyboardShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
>

const NAMED_KEYS: Record<string, string> = {
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  Tab: "Tab",
  Enter: "Enter",
  Escape: "Escape",
}

export function shortcutFromKeyboardEvent(event: KeyboardShortcutEvent) {
  if (event.metaKey || (!event.ctrlKey && !event.altKey)) {
    return null
  }

  const normalizedKey =
    NAMED_KEYS[event.key] ??
    (/^[a-z0-9]$/i.test(event.key) ? event.key.toLocaleUpperCase() : null)
  if (!normalizedKey) {
    return null
  }

  return [
    event.ctrlKey ? "Ctrl" : null,
    event.altKey ? "Alt" : null,
    event.shiftKey ? "Shift" : null,
    normalizedKey,
  ]
    .filter(Boolean)
    .join("+")
}

export function validateKeybindings(
  bindings: Keybinding[]
): Partial<Record<ShortcutActionId, string>> {
  const errors: Partial<Record<ShortcutActionId, string>> = {}
  const seen = new Set<string>()

  for (const binding of bindings) {
    if (!binding.shortcut) {
      continue
    }
    const normalized = binding.shortcut.toLocaleLowerCase()
    if (seen.has(normalized)) {
      errors[binding.action] = "Shortcut is already assigned."
    } else {
      seen.add(normalized)
    }
  }

  return errors
}

export function cloneDefaultKeybindings() {
  return DEFAULT_KEYBINDINGS.map((binding) => ({ ...binding }))
}
