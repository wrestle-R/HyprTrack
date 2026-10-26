export type NetworkPoint = {
  bucket: string
  label: string
  rxBytes: number | null
  txBytes: number | null
  observedSeconds: number
}

export type NetworkApplication = {
  appId: string
  appName: string
  scope: "app" | "system" | "unknown"
  rxBytes: number
  txBytes: number
}

export type NetworkData = {
  rangeLabel: string
  rxBytes: number
  txBytes: number
  observedSeconds: number
  coveragePercent: number
  health: { state: string; detail: string; updatedAt: string | null }
  timeline: NetworkPoint[]
  applications: NetworkApplication[]
  archivedDays: number
  archivedActivityDays: number
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB", "PB"]
  const exponent = Math.min(Math.floor(Math.log10(bytes) / 3), units.length - 1)
  const value = bytes / 1000 ** exponent
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: exponent === 0 || value >= 100 ? 0 : 1 }).format(value)} ${units[exponent]}`
}

export function rankedApplications(
  applications: NetworkApplication[], search: string,
  scope: "all" | NetworkApplication["scope"], sort: "total" | "download" | "upload"
) {
  const query = search.trim().toLocaleLowerCase()
  const value = (app: NetworkApplication) => sort === "download" ? app.rxBytes : sort === "upload" ? app.txBytes : app.rxBytes + app.txBytes
  return applications.filter((app) =>
    (scope === "all" || app.scope === scope) &&
    `${app.appName} ${app.appId}`.toLocaleLowerCase().includes(query)
  ).sort((a, b) => value(b) - value(a) || a.appName.localeCompare(b.appName))
}
