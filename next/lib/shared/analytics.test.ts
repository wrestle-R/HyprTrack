import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  readActivity,
  readApplications,
  readHealth,
  readOverview,
} from "../../../shared/dashboard/analytics"
import { openBetterSqliteDatabase } from "../../../shared/dashboard/database"

describe("shared dashboard analytics", () => {
  let tempDirectory: string
  let databasePath: string

  beforeEach(() => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hyprtrack-shared-"))
    databasePath = path.join(tempDirectory, "fixture.db")
    const database = new Database(databasePath)
    database.exec(`
      CREATE TABLE activity_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sampled_at TEXT NOT NULL,
        app_class TEXT NOT NULL,
        window_title TEXT NOT NULL,
        window_full TEXT NOT NULL
      )
    `)
    const insert = database.prepare(`
      INSERT INTO activity_samples (
        sampled_at,
        app_class,
        window_title,
        window_full
      ) VALUES (?, ?, ?, ?)
    `)
    const rows = [
      ["2026-06-13T09:00:00+05:30", "code", "VS Code", "secret one"],
      ["2026-06-14T09:00:00+05:30", "code", "VS Code", "secret two"],
      ["2026-06-14T09:01:00+05:30", "code", "VS Code", "secret three"],
      ["2026-06-14T09:03:00+05:30", "zen", "GitHub", "secret four"],
      ["2026-06-14T09:04:00+05:30", "zen", "YouTube", "secret five"],
    ]
    const transaction = database.transaction(() => {
      for (const row of rows) {
        insert.run(...row)
      }
    })
    transaction()
    database.close()
  })

  afterEach(() => {
    fs.rmSync(tempDirectory, { recursive: true, force: true })
  })

  it("builds overview totals and rankings from the allowed columns", () => {
    const database = openBetterSqliteDatabase(databasePath)
    try {
      const overview = readOverview({
        database,
        range: "today",
        now: new Date("2026-06-14T06:00:00.000Z"),
      })

      expect(overview.trackedMinutes).toBe(4)
      expect(overview.topApplication).toMatchObject({
        windowTitle: "VS Code",
        appClass: "code",
        minutes: 2,
      })
      expect(overview.streakDays).toBe(2)
      expect(overview.recentSessions).toHaveLength(3)
      expect(overview.timeline).toHaveLength(12)
      expect(
        overview.timeline.find((point) => point.label === "09:00")
      ).toMatchObject({
        minutes: 4,
      })
      expect(overview.timeline.at(-1)).toMatchObject({
        label: "14 Jun · 11:30 am",
      })
      expect(JSON.stringify(overview)).not.toContain("secret")
      expect(JSON.stringify(overview)).not.toContain("windowFull")
    } finally {
      database.close()
    }
  })

  it("filters and paginates grouped activity sessions", () => {
    const database = openBetterSqliteDatabase(databasePath)
    try {
      const activity = readActivity({
        database,
        range: "today",
        app: "zen",
        search: "git",
        page: 1,
        pageSize: 1,
        now: new Date("2026-06-14T06:00:00.000Z"),
      })

      expect(activity.sessions).toHaveLength(1)
      expect(activity.sessions[0]).toMatchObject({
        appClass: "zen",
        windowTitle: "GitHub",
        durationMinutes: 1,
      })
      expect(activity.pagination).toEqual({
        page: 1,
        pageSize: 1,
        totalItems: 1,
        totalPages: 1,
      })
      expect(activity.appClasses).toEqual(["code", "zen"])
    } finally {
      database.close()
    }
  })

  it("ranks applications with share, sessions, and first and last activity", () => {
    const database = openBetterSqliteDatabase(databasePath)
    try {
      const applications = readApplications({
        database,
        range: "today",
        search: "",
        now: new Date("2026-06-14T06:00:00.000Z"),
      })

      expect(applications.items[0]).toMatchObject({
        windowTitle: "VS Code",
        appClass: "code",
        minutes: 2,
        share: 50,
        sessionCount: 1,
        firstSeen: "2026-06-14T09:00:00+05:30",
        lastSeen: "2026-06-14T09:02:00+05:30",
      })
    } finally {
      database.close()
    }
  })

  it("reports sanitized database health", () => {
    const database = openBetterSqliteDatabase(databasePath)
    try {
      expect(readHealth({ database })).toEqual({
        status: "connected",
        sampleCount: 5,
        latestSampleAt: "2026-06-14T09:04:00+05:30",
      })
    } finally {
      database.close()
    }
  })
})
