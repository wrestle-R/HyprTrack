import type { EffectiveRange, RangeKey } from "@/lib/dashboard/types"

const IST_OFFSET_MINUTES = 330
const RANGE_DAYS: Record<RangeKey, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
}
const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
}
const dateTimeFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})

function getIstParts(date: Date) {
  const parts = Object.fromEntries(
    dateTimeFormat
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  )

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

function formatIst(date: Date) {
  const parts = getIstParts(date)
  const pad = (value: number) => value.toString().padStart(2, "0")

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}+05:30`
}

function istMidnight(
  year: number,
  month: number,
  day: number,
  daysBack: number
) {
  return new Date(
    Date.UTC(year, month - 1, day - daysBack, 0, -IST_OFFSET_MINUTES)
  )
}

export function isRangeKey(value: string | null): value is RangeKey {
  return value !== null && value in RANGE_DAYS
}

export function resolveRange(
  value: string | null | undefined,
  now = new Date()
): EffectiveRange {
  const key = value ?? "today"
  if (!isRangeKey(key)) {
    throw new Error("Invalid range")
  }

  const current = getIstParts(now)
  const start = istMidnight(
    current.year,
    current.month,
    current.day,
    RANGE_DAYS[key] - 1
  )

  return {
    key,
    start: formatIst(start),
    end: formatIst(now),
    label: RANGE_LABELS[key],
  }
}
