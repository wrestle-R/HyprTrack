import path from "node:path"

import Database from "better-sqlite3"

import type { ActivitySample } from "./types"
import { DashboardDataError } from "./errors"

const REQUIRED_COLUMNS = new Set([
  "sampled_at",
  "app_class",
  "window_title",
])

const APP_LABELS: Record<string, string> = {
  tauri: "HyprTrack Desktop App",
}

const ZEN_SERVICES: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  github: "GitHub",
  leetcode: "LeetCode",
  vercel: "Vercel",
  whatsapp: "WhatsApp",
  "x.com": "X",
  youtube: "YouTube",
}

const PERSONAL_WEBSITE_TITLES = new Set([
  "home | blogs",
  "running out of excuses",
  "russel daniel paul",
])

const GITHUB_REPOSITORY_TITLE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const GITHUB_REPOSITORY_CONTEXT_TITLE =
  /^.+\s+·\s+[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

const BROWSER_SUFFIXES: Record<string, string[]> = {
  zen: [" — Zen Browser"],
  brave: [" - Brave"],
  "brave-browser": [" - Brave"],
  "brave-origin": [" - Brave Origin"],
  "brave-origin-nightly": [" - Brave Origin"],
}

function stripBrowserSuffix(appClass: string, title: string) {
  const suffixes = BROWSER_SUFFIXES[appClass] ?? []
  let value = title.trim()

  for (const suffix of suffixes) {
    if (value.endsWith(suffix)) {
      value = value.slice(0, -suffix.length).trim()
      break
    }
  }

  return value
}

function resolveBrowserSourceTitle(
  appClass: string,
  windowTitle: string,
  windowFull?: string | null
) {
  const fullTitle = windowFull?.trim()
  if (!fullTitle) {
    return windowTitle
  }

  const suffixes = BROWSER_SUFFIXES[appClass] ?? []
  if (suffixes.some((suffix) => fullTitle.endsWith(suffix))) {
    return fullTitle
  }

  return windowTitle
}

function isProbableChatGptConversationTitle(title: string) {
  const stripped = title.trim()
  return (
    Boolean(stripped) &&
    !stripped.startsWith("(") &&
    !stripped.includes(" - ") &&
    !stripped.includes(" | ") &&
    !stripped.includes(" · ") &&
    stripped.split(/\s+/).length >= 3
  )
}

function normalizeDisplayLabels(
  appClass: string,
  windowTitle: string,
  windowFull?: string | null
) {
  const classKey = appClass.trim().toLowerCase()
  const appLabel = APP_LABELS[classKey]
  if (appLabel) {
    return {
      appClass: appLabel,
      windowTitle: windowTitle.trim().toLowerCase() === classKey ? appLabel : windowTitle,
    }
  }

  if (!(classKey in BROWSER_SUFFIXES)) {
    return { appClass, windowTitle }
  }

  const rawTitle = stripBrowserSuffix(
    classKey,
    resolveBrowserSourceTitle(classKey, windowTitle, windowFull)
  )
  const foldedTitle = rawTitle.toLowerCase()

  if (PERSONAL_WEBSITE_TITLES.has(foldedTitle)) {
    return { appClass, windowTitle: "Personal Websites" }
  }

  if (
    foldedTitle === "x" ||
    foldedTitle.startsWith("x ") ||
    foldedTitle.endsWith(" on x:") ||
    foldedTitle.includes(" on x: ")
  ) {
    return { appClass, windowTitle: "X" }
  }

  for (const [marker, label] of Object.entries(ZEN_SERVICES)) {
    if (foldedTitle.includes(marker)) {
      return { appClass, windowTitle: label }
    }
  }

  if (
    GITHUB_REPOSITORY_TITLE.test(rawTitle) ||
    GITHUB_REPOSITORY_CONTEXT_TITLE.test(rawTitle)
  ) {
    return { appClass, windowTitle: "GitHub" }
  }

  if (rawTitle.includes(" - ")) {
    const service = rawTitle.split(" - ").at(-1)?.trim()
    if (service) {
      return { appClass, windowTitle: service }
    }
  }

  if (isProbableChatGptConversationTitle(rawTitle)) {
    return { appClass, windowTitle: "ChatGPT" }
  }

  return { appClass, windowTitle }
}

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
            window_full AS windowFull,
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
            window_full AS windowFull,
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
      windowFull?: string | null
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

    const normalized = normalizeDisplayLabels(
      row.appClass,
      row.windowTitle,
      row.windowFull
    )

    return [
      {
        sampledAt: clippedStart === sampledAt ? row.sampledAt : start,
        endedAt:
          clippedEnd === effectiveEnd
            ? row.endedAt ?? row.lastSeenAt ?? legacyEndedAt
            : end,
        appClass: normalized.appClass,
        windowTitle: normalized.windowTitle,
      },
    ]
  })
}
