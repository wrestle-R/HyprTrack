export function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`
}

export function formatTimestamp(value: string, includeDate = false) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    ...(includeDate
      ? { day: "numeric", month: "short", year: "numeric" }
      : {}),
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

export function calculateProductiveMinutes(
  applications: Array<{ windowTitle: string; minutes: number }>,
  productiveTitles: string[]
) {
  const productive = new Set(productiveTitles)
  return applications.reduce(
    (total, application) =>
      total +
      (productive.has(application.windowTitle) ? application.minutes : 0),
    0
  )
}
