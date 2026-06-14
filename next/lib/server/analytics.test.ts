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
} from "@/lib/server/analytics"

describe("dashboard analytics", () => {
  let tempDirectory: string
  let databasePath: string

  beforeEach(() => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hyprtrack-"))
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

  it("builds overview totals and rankings from the three allowed columns", () => {
    const overview = readOverview({
      databasePath,
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
    expect(overview.timeline).toHaveLength(24)
    expect(overview.timeline.find((point) => point.label === "09:00")).toMatchObject({
      minutes: 4,
    })
    expect(JSON.stringify(overview)).not.toContain("secret")
    expect(JSON.stringify(overview)).not.toContain("windowFull")
  })

  it("filters and paginates grouped activity sessions", () => {
    const activity = readActivity({
      databasePath,
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
  })

  it("ranks applications with share, sessions, and first and last activity", () => {
    const applications = readApplications({
      databasePath,
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
  })

  it("reports sanitized database health", () => {
    expect(readHealth({ databasePath })).toEqual({
      status: "connected",
      sampleCount: 5,
      latestSampleAt: "2026-06-14T09:04:00+05:30",
    })
  })

  it("calculates exact interval durations and splits them across hours", () => {
    const database = new Database(databasePath)
    database.exec(`
      ALTER TABLE activity_samples ADD COLUMN ended_at TEXT;
      ALTER TABLE activity_samples ADD COLUMN last_seen_at TEXT;
    `)
    database
      .prepare(
        `INSERT INTO activity_samples (
          sampled_at,
          app_class,
          window_title,
          window_full,
          ended_at,
          last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        "2026-06-14T09:30:00+05:30",
        "zen",
        "YouTube",
        "private video title",
        "2026-06-14T10:15:00+05:30",
        "2026-06-14T10:15:00+05:30"
      )
    database.close()

    const overview = readOverview({
      databasePath,
      range: "today",
      now: new Date("2026-06-14T06:00:00.000Z"),
    })

    expect(overview.trackedMinutes).toBe(49)
    expect(overview.topApplication).toMatchObject({
      windowTitle: "YouTube",
      minutes: 46,
    })
    expect(
      overview.timeline.find((point) => point.label === "09:00")
    ).toMatchObject({ minutes: 34 })
    expect(
      overview.timeline.find((point) => point.label === "10:00")
    ).toMatchObject({ minutes: 15 })
    expect(JSON.stringify(overview)).not.toContain("private video title")
  })

  it("clips intervals at the selected range and uses checkpoints for open rows", () => {
    const database = new Database(databasePath)
    database.exec(`
      ALTER TABLE activity_samples ADD COLUMN ended_at TEXT;
      ALTER TABLE activity_samples ADD COLUMN last_seen_at TEXT;
      DELETE FROM activity_samples;
    `)
    const insert = database.prepare(
      `INSERT INTO activity_samples (
        sampled_at,
        app_class,
        window_title,
        window_full,
        ended_at,
        last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    insert.run(
      "2026-06-13T23:50:00+05:30",
      "code",
      "VS Code",
      "private title",
      "2026-06-14T00:10:00+05:30",
      "2026-06-14T00:10:00+05:30"
    )
    insert.run(
      "2026-06-14T01:00:00+05:30",
      "zen",
      "GitHub",
      "private title",
      null,
      "2026-06-14T01:20:00+05:30"
    )
    database.close()

    const overview = readOverview({
      databasePath,
      range: "today",
      now: new Date("2026-06-14T06:00:00.000Z"),
    })

    expect(overview.trackedMinutes).toBe(30)
    expect(overview.applications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ windowTitle: "VS Code", minutes: 10 }),
        expect.objectContaining({ windowTitle: "GitHub", minutes: 20 }),
      ])
    )
  })
})
