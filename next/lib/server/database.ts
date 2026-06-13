import path from "node:path"

import Database from "better-sqlite3"

import type { ActivitySample } from "@/lib/dashboard/types"
import { DashboardDataError } from "@/lib/server/errors"

const REQUIRED_COLUMNS = new Set([
  "sampled_at",
  "app_class",
  "window_title",
])

function defaultDatabasePath() {
  const relativePath = process.cwd().endsWith(`${path.sep}next`)
    ? "../collector/hyprtrack.db"
    : "collector/hyprtrack.db"

  return path.join(/*turbopackIgnore: true*/ process.cwd(), relativePath)
}

export function resolveDatabasePath(override?: string) {
  const configuredPath = override ?? process.env.HYPRTRACK_DB_PATH

  return configuredPath
    ? path.resolve(/*turbopackIgnore: true*/ configuredPath)
    : defaultDatabasePath()
}

export function openDatabase(override?: string) {
  const databasePath = resolveDatabasePath(override)

  try {
    const database = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    })
    const columns = database
      .prepare("PRAGMA table_info(activity_samples)")
      .all() as Array<{ name: string }>
    const columnNames = new Set(columns.map((column) => column.name))

    if (
      columns.length === 0 ||
      [...REQUIRED_COLUMNS].some((column) => !columnNames.has(column))
    ) {
      database.close()
      throw new DashboardDataError(
        "INVALID_SCHEMA",
        "The activity database schema is not supported."
      )
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
  database: Database.Database,
  start: string,
  end: string
): ActivitySample[] {
  return database
    .prepare(
      `SELECT
        sampled_at AS sampledAt,
        app_class AS appClass,
        window_title AS windowTitle
      FROM activity_samples
      WHERE sampled_at >= ? AND sampled_at <= ?
      ORDER BY sampled_at ASC`
    )
    .all(start, end) as ActivitySample[]
}
