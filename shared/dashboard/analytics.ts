import { resolveRange } from "./ranges"
import { groupSessions } from "./sessions"
import { readSamples, type BetterSqliteDatabase } from "./database"
import { DashboardDataError } from "./errors"
import type {
  ActivityData,
  ActivitySample,
  ApplicationsData,
  ApplicationUsage,
  HealthData,
  OverviewData,
  RangeKey,
  TimelinePoint,
} from "./types"

type QueryBase = {
  database: BetterSqliteDatabase
  range: RangeKey
  now?: Date
}

function withDatabase<T>(
  database: BetterSqliteDatabase,
  query: (database: BetterSqliteDatabase) => T
) {
  try {
    return query(database)
  } catch (error) {
    if (error instanceof DashboardDataError) {
      throw error
    }
    throw new DashboardDataError(
      "QUERY_FAILED",
      "The requested activity data could not be read.",
      { cause: error }
    )
  }
}

function roundShare(minutes: number, totalMinutes: number) {
  return totalMinutes === 0
    ? 0
    : Math.round((minutes / totalMinutes) * 10_000) / 100
}

function sampleMinutes(sample: ActivitySample) {
  const endedAt =
    sample.endedAt ??
    new Date(new Date(sample.sampledAt).getTime() + 60_000).toISOString()
  return (
    (new Date(endedAt).getTime() - new Date(sample.sampledAt).getTime()) /
    60_000
  )
}

function roundMinutes(minutes: number) {
  return Math.round(minutes * 100) / 100
}

function buildApplications(samples: ActivitySample[]): ApplicationUsage[] {
  const totalMinutes = samples.reduce(
    (total, sample) => total + sampleMinutes(sample),
    0
  )
  const sessions = groupSessions(samples)
  const byApplication = new Map<
    string,
    {
      appClass: string
      windowTitle: string
      minutes: number
      firstSeen: string
      lastSeen: string
    }
  >()

  for (const sample of samples) {
    const key = `${sample.appClass}\u0000${sample.windowTitle}`
    const minutes = sampleMinutes(sample)
    const current = byApplication.get(key)
    if (current) {
      current.minutes += minutes
      current.lastSeen = sample.endedAt ?? sample.sampledAt
    } else {
      byApplication.set(key, {
        appClass: sample.appClass,
        windowTitle: sample.windowTitle,
        minutes,
        firstSeen: sample.sampledAt,
        lastSeen: sample.endedAt ?? sample.sampledAt,
      })
    }
  }

  return [...byApplication.entries()]
    .map(([key, application]) => {
      const applicationSessions = sessions
        .filter(
          (session) => `${session.appClass}\u0000${session.windowTitle}` === key
        )
        .toReversed()

      return {
        ...application,
        minutes: roundMinutes(application.minutes),
        share: roundShare(application.minutes, totalMinutes),
        sessionCount: applicationSessions.length,
        recentSessions: applicationSessions.slice(0, 5),
      }
    })
    .toSorted(
      (left, right) =>
        right.minutes - left.minutes ||
        left.windowTitle.localeCompare(right.windowTitle)
    )
}

function buildTimeline(
  samples: ActivitySample[],
  range: RangeKey,
  start: string,
  end: string
): TimelinePoint[] {
  const endpoint = new Date(end)
  const endpointParts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).formatToParts(endpoint)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    endpointParts.find((item) => item.type === type)?.value ?? ""
  const endpointLabel = `${part("day")} ${part("month")} · ${part(
    "hour"
  )}:${part("minute")} ${part("dayPeriod").toLocaleLowerCase()}`
  const currentHour = Number(end.slice(11, 13))
  const orderedBuckets =
    range === "today"
      ? Array.from({ length: currentHour + 1 }, (_, hour) => {
          const bucket = `${start.slice(0, 10)}T${hour
            .toString()
            .padStart(2, "0")}`
          const bucketStart = new Date(`${bucket}:00:00+05:30`).getTime()
          return {
            bucket,
            start: bucketStart,
            end: bucketStart + 60 * 60_000,
          }
        })
      : Array.from({ length: range === "7d" ? 7 : 30 }, (_, index) => {
          const date = new Date(start)
          date.setUTCDate(date.getUTCDate() + index)
          const bucket = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(date)
          const bucketStart = new Date(`${bucket}T00:00:00+05:30`).getTime()
          return {
            bucket,
            start: bucketStart,
            end: bucketStart + 24 * 60 * 60_000,
          }
        })

  return orderedBuckets.map((bucket, index) => {
    const minutes = samples.reduce((total, sample) => {
      const sampleStart = new Date(sample.sampledAt).getTime()
      const sampleEnd = new Date(sample.endedAt ?? sample.sampledAt).getTime()
      const overlap = Math.max(
        0,
        Math.min(sampleEnd, bucket.end) - Math.max(sampleStart, bucket.start)
      )
      return total + overlap / 60_000
    }, 0)

    return {
      bucket: bucket.bucket,
      label:
        index === orderedBuckets.length - 1
          ? endpointLabel
          : range === "today"
            ? `${bucket.bucket.slice(11)}:00`
            : new Intl.DateTimeFormat("en", {
                month: "short",
                day: "numeric",
                timeZone: "Asia/Kolkata",
              }).format(new Date(`${bucket.bucket}T00:00:00+05:30`)),
      minutes: roundMinutes(minutes),
    }
  })
}

function calculateStreak(sampledAtValues: string[]) {
  const days = [
    ...new Set(sampledAtValues.map((sampledAt) => sampledAt.slice(0, 10))),
  ].toSorted()
  if (days.length === 0) {
    return 0
  }

  let streak = 1
  for (let index = days.length - 1; index > 0; index -= 1) {
    const current = new Date(`${days[index]}T00:00:00+05:30`)
    const previous = new Date(`${days[index - 1]}T00:00:00+05:30`)
    if (current.getTime() - previous.getTime() !== 86_400_000) {
      break
    }
    streak += 1
  }
  return streak
}

export function readOverview({
  database,
  range,
  now,
}: QueryBase): OverviewData {
  const effectiveRange = resolveRange(range, now)

  return withDatabase(database, (activeDatabase) => {
    const samples = readSamples(
      activeDatabase,
      effectiveRange.start,
      effectiveRange.end
    )
    const applications = buildApplications(samples)
    const sessions = groupSessions(samples).toReversed()
    const streakRows = activeDatabase
      .prepare(
        `SELECT sampled_at AS sampledAt
        FROM activity_samples
        WHERE sampled_at <= ?
        ORDER BY sampled_at ASC`
      )
      .all(effectiveRange.end) as Array<{ sampledAt: string }>

    return {
      range: effectiveRange,
      trackedMinutes: roundMinutes(
        samples.reduce((total, sample) => total + sampleMinutes(sample), 0)
      ),
      topApplication: applications[0] ?? null,
      streakDays: calculateStreak(streakRows.map((row) => row.sampledAt)),
      timeline: buildTimeline(
        samples,
        range,
        effectiveRange.start,
        effectiveRange.end
      ),
      applications,
      recentSessions: sessions.slice(0, 6),
      latestSampleAt: samples.at(-1)?.sampledAt ?? null,
    }
  })
}

export function readActivity({
  database,
  range,
  app,
  search,
  page,
  pageSize,
  now,
}: QueryBase & {
  app?: string
  search?: string
  page: number
  pageSize: number
}): ActivityData {
  const effectiveRange = resolveRange(range, now)

  return withDatabase(database, (activeDatabase) => {
    const samples = readSamples(
      activeDatabase,
      effectiveRange.start,
      effectiveRange.end
    )
    const appClasses = [
      ...new Set(samples.map((sample) => sample.appClass)),
    ].toSorted()
    const normalizedSearch = search?.trim().toLocaleLowerCase() ?? ""
    const filtered = samples.filter(
      (sample) =>
        (!app || sample.appClass === app) &&
        (!normalizedSearch ||
          sample.appClass.toLocaleLowerCase().includes(normalizedSearch) ||
          sample.windowTitle.toLocaleLowerCase().includes(normalizedSearch))
    )
    const sessions = groupSessions(filtered).toReversed()
    const totalItems = sessions.length
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
    const offset = (page - 1) * pageSize

    return {
      range: effectiveRange,
      sessions: sessions.slice(offset, offset + pageSize),
      appClasses,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
    }
  })
}

export function readApplications({
  database,
  range,
  search,
  now,
}: QueryBase & { search?: string }): ApplicationsData {
  const effectiveRange = resolveRange(range, now)
  const normalizedSearch = search?.trim().toLocaleLowerCase() ?? ""

  return withDatabase(database, (activeDatabase) => {
    const samples = readSamples(
      activeDatabase,
      effectiveRange.start,
      effectiveRange.end
    )
    const items = buildApplications(samples).filter(
      (application) =>
        !normalizedSearch ||
        application.appClass.toLocaleLowerCase().includes(normalizedSearch) ||
        application.windowTitle.toLocaleLowerCase().includes(normalizedSearch)
    )

    return { range: effectiveRange, items }
  })
}

export function readHealth({
  database,
}: {
  database: BetterSqliteDatabase
}): HealthData {
  return withDatabase(database, (activeDatabase) => {
    const row = activeDatabase
      .prepare(
        `SELECT
          COUNT(sampled_at) AS sampleCount,
          MAX(sampled_at) AS latestSampleAt
        FROM activity_samples`
      )
      .get() as { sampleCount: number; latestSampleAt: string | null }

    return {
      status: "connected",
      sampleCount: row.sampleCount,
      latestSampleAt: row.latestSampleAt,
    }
  })
}
