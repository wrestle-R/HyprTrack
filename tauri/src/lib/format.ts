export function formatDuration(minutes: number) {
  const totalSeconds = Math.max(0, Math.round(minutes * 60))
  if (totalSeconds === 0) {
    return "0m"
  }

  const hours = Math.floor(totalSeconds / 3600)
  const remainingSeconds = totalSeconds % 3600
  const wholeMinutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const parts = [
    hours > 0 ? `${hours}h` : "",
    wholeMinutes > 0 ? `${wholeMinutes}m` : "",
    seconds > 0 ? `${seconds}s` : "",
  ].filter(Boolean)

  return parts.join(" ")
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
