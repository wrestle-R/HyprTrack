import path from "node:path"

import Database from "better-sqlite3"

import type { ActivitySample } from "./types"
import { DashboardDataError } from "./errors"

const REQUIRED_COLUMNS = new Set([
  "sampled_at",
  "app_class",
  "window_title",
])

export type BetterSqliteDatabase = Database.Database

function addMinute(timestamp: string) {
  const offset = timestamp.match(/([+-])(\d{2}):(\d{2})$/)
  const date = new Date(new Date(timestamp).getTime() + 60_000)
  if (!offset) {
    return date.toISOString()
  }

  const offsetMinutes =
    (offset[1] === "-" ? -1 : 1) *
    (Number(offset[2]) * 60 + Number(offset[3]))
  const local = new Date(date.getTime() + offsetMinutes * 60_000)
  return `${local.toISOString().slice(0, 19)}${offset[0]}`
}

export function resolveDefaultDatabasePath(currentWorkingDirectory: string) {
  const relativePath = currentWorkingDirectory.endsWith(`${path.sep}next`)
    ? "../collector/hyprtrack.db"
    : "collector/hyprtrack.db"

  return path.join(currentWorkingDirectory, relativePath)
}

export function resolveDatabasePath(
  override: string | undefined,
  currentWorkingDirectory = process.cwd()
) {
  const configuredPath = override ?? process.env.HYPRTRACK_DB_PATH

  return configuredPath
    ? path.resolve(configuredPath)
    : resolveDefaultDatabasePath(currentWorkingDirectory)
}

function assertSupportedSchema(database: BetterSqliteDatabase) {
  const columns = database
    .prepare("PRAGMA table_info(activity_samples)")
    .all() as Array<{ name: string }>
  const columnNames = new Set(columns.map((column) => column.name))

  if (
    columns.length === 0 ||
    [...REQUIRED_COLUMNS].some((column) => !columnNames.has(column))
  ) {
    throw new DashboardDataError(
      "INVALID_SCHEMA",
      "The activity database schema is not supported."
    )
  }
}

export function openBetterSqliteDatabase(override?: string) {
  const databasePath = resolveDatabasePath(override)

  try {
    const database = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    })
    try {
      assertSupportedSchema(database)
    } catch (error) {
      database.close()
      throw error
    }
    return database
  } catch (error) {
    if (error instanceof DashboardDataError) {
      throw error
    }

    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : ""
    if (code === "SQLITE_CANTOPEN") {
      throw new DashboardDataError(
        "DATABASE_MISSING",
        "The activity database is unavailable.",
        { cause: error }
      )
    }

    throw new DashboardDataError(
      "QUERY_FAILED",
      "The activity database could not be read.",
      { cause: error }
    )
  }
}

export function readSamples(
  database: BetterSqliteDatabase,
  start: string,
  end: string
): ActivitySample[] {
  const columns = database
    .prepare("PRAGMA table_info(activity_samples)")
    .all() as Array<{ name: string }>
  const columnNames = new Set(columns.map((column) => column.name))
  const hasIntervals =
    columnNames.has("ended_at") && columnNames.has("last_seen_at")

  const rows = database
    .prepare(
      hasIntervals
        ? `SELECT
            sampled_at AS sampledAt,
            app_class AS appClass,
            window_title AS windowTitle,
            ended_at AS endedAt,
            last_seen_at AS lastSeenAt
          FROM activity_samples
          WHERE sampled_at <= ?
            AND (
              sampled_at >= ?
              OR ended_at >= ?
              OR last_seen_at >= ?
            )
          ORDER BY sampled_at ASC`
        : `SELECT
            sampled_at AS sampledAt,
            app_class AS appClass,
            window_title AS windowTitle,
            NULL AS endedAt,
            NULL AS lastSeenAt
          FROM activity_samples
          WHERE sampled_at >= ? AND sampled_at <= ?
          ORDER BY sampled_at ASC`
    )
    .all(
      ...(hasIntervals ? [end, start, start, start] : [start, end])
    ) as Array<
    ActivitySample & {
      endedAt: string | null
      lastSeenAt: string | null
    }
  >

  const rangeStart = new Date(start).getTime()
  const rangeEnd = new Date(end).getTime()

  return rows.flatMap((row) => {
    const sampledAt = new Date(row.sampledAt).getTime()
    const legacyEnd = sampledAt + 60_000
    const legacyEndedAt = addMinute(row.sampledAt)
    const effectiveEnd = new Date(
      row.endedAt ?? row.lastSeenAt ?? legacyEnd
    ).getTime()
    const clippedStart = Math.max(sampledAt, rangeStart)
    const clippedEnd = Math.min(effectiveEnd, rangeEnd)

    if (clippedEnd <= clippedStart) {
      return []
    }

    return [
      {
        sampledAt: clippedStart === sampledAt ? row.sampledAt : start,
        endedAt:
          clippedEnd === effectiveEnd
            ? row.endedAt ?? row.lastSeenAt ?? legacyEndedAt
            : end,
        appClass: row.appClass,
        windowTitle: row.windowTitle,
      },
    ]
  })
}
