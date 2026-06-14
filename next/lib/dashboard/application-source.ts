export type ApplicationSource = "app" | "browser"

const BROWSER_LABELS: Record<string, string> = {
  zen: "Zen",
  brave: "Brave",
  "brave-browser": "Brave",
  "brave-origin": "Brave",
  "brave-origin-nightly": "Brave",
}

export function getApplicationSource(appClass: string): ApplicationSource {
  return appClass.toLocaleLowerCase() in BROWSER_LABELS ? "browser" : "app"
}

export function getApplicationSourceLabel(appClass: string) {
  const normalizedClass = appClass.toLocaleLowerCase()
  const browserLabel = BROWSER_LABELS[normalizedClass]

  return browserLabel
    ? `Browser window · ${browserLabel}`
    : `Application · ${appClass}`
}
