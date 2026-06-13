import type {
  ActivityData,
  ActivitySample,
  ApplicationsData,
  ApplicationUsage,
  HealthData,
  OverviewData,
  RangeKey,
  TimelinePoint,
} from "@/lib/dashboard/types"
import { resolveRange } from "@/lib/dashboard/ranges"
import { groupSessions } from "@/lib/dashboard/sessions"
import { openDatabase, readSamples } from "@/lib/server/database"
import { DashboardDataError } from "@/lib/server/errors"

type QueryBase = {
  databasePath?: string
  range: RangeKey
  now?: Date
}

function withDatabase<T>(
  databasePath: string | undefined,
  query: (database: ReturnType<typeof openDatabase>) => T
) {
  const database = openDatabase(databasePath)
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
  } finally {
    database.close()
  }
}

function roundShare(minutes: number, totalMinutes: number) {
  return totalMinutes === 0
    ? 0
    : Math.round((minutes / totalMinutes) * 10_000) / 100
}

function buildApplications(samples: ActivitySample[]): ApplicationUsage[] {
  const totalMinutes = samples.length
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
    const current = byApplication.get(key)
    if (current) {
      current.minutes += 1
      current.lastSeen = sample.sampledAt
    } else {
      byApplication.set(key, {
        appClass: sample.appClass,
        windowTitle: sample.windowTitle,
        minutes: 1,
        firstSeen: sample.sampledAt,
        lastSeen: sample.sampledAt,
      })
    }
  }

  return [...byApplication.entries()]
    .map(([key, application]) => {
      const applicationSessions = sessions
        .filter(
          (session) =>
            `${session.appClass}\u0000${session.windowTitle}` === key
        )
        .toReversed()

      return {
        ...application,
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
  start: string
): TimelinePoint[] {
  const buckets = new Map<string, number>()

  for (const sample of samples) {
    const bucket =
      range === "today"
        ? sample.sampledAt.slice(0, 13)
        : sample.sampledAt.slice(0, 10)
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1)
  }

  const orderedBuckets =
    range === "today"
      ? Array.from(
          { length: 24 },
          (_, hour) =>
            `${start.slice(0, 10)}T${hour.toString().padStart(2, "0")}`
        )
      : Array.from(
          { length: range === "7d" ? 7 : 30 },
          (_, index) => {
            const date = new Date(start)
            date.setUTCDate(date.getUTCDate() + index)
            return new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Kolkata",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(date)
          }
        )

  return orderedBuckets.map((bucket) => ({
    bucket,
    label:
      range === "today"
        ? `${bucket.slice(11)}:00`
        : new Intl.DateTimeFormat("en", {
            month: "short",
            day: "numeric",
            timeZone: "Asia/Kolkata",
          }).format(new Date(`${bucket}T00:00:00+05:30`)),
    minutes: buckets.get(bucket) ?? 0,
  }))
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
  databasePath,
  range,
  now,
}: QueryBase): OverviewData {
  const effectiveRange = resolveRange(range, now)

  return withDatabase(databasePath, (database) => {
    const samples = readSamples(
      database,
      effectiveRange.start,
      effectiveRange.end
    )
    const applications = buildApplications(samples)
    const sessions = groupSessions(samples).toReversed()
    const streakRows = database
      .prepare(
        `SELECT sampled_at AS sampledAt
        FROM activity_samples
        WHERE sampled_at <= ?
        ORDER BY sampled_at ASC`
      )
      .all(effectiveRange.end) as Array<{ sampledAt: string }>

    return {
      range: effectiveRange,
      trackedMinutes: samples.length,
      topApplication: applications[0] ?? null,
      streakDays: calculateStreak(
        streakRows.map((row) => row.sampledAt)
      ),
      timeline: buildTimeline(samples, range, effectiveRange.start),
      applications,
      recentSessions: sessions.slice(0, 6),
      latestSampleAt: samples.at(-1)?.sampledAt ?? null,
    }
  })
}

export function readActivity({
  databasePath,
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

  return withDatabase(databasePath, (database) => {
    const samples = readSamples(
      database,
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
  databasePath,
  range,
  search,
  now,
}: QueryBase & { search?: string }): ApplicationsData {
  const effectiveRange = resolveRange(range, now)
  const normalizedSearch = search?.trim().toLocaleLowerCase() ?? ""

  return withDatabase(databasePath, (database) => {
    const samples = readSamples(
      database,
      effectiveRange.start,
      effectiveRange.end
    )
    const items = buildApplications(samples).filter(
      (application) =>
        !normalizedSearch ||
        application.appClass.toLocaleLowerCase().includes(normalizedSearch) ||
        application.windowTitle
          .toLocaleLowerCase()
          .includes(normalizedSearch)
    )

    return { range: effectiveRange, items }
  })
}

export function readHealth({
  databasePath,
}: {
  databasePath?: string
}): HealthData {
  return withDatabase(databasePath, (database) => {
    const row = database
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
