import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { GET as getActivity } from "@/app/api/activity/route"
import { GET as getApplications } from "@/app/api/applications/route"
import { GET as getHealth } from "@/app/api/health/route"
import { GET as getOverview } from "@/app/api/overview/route"

describe("dashboard route handlers", () => {
  let tempDirectory: string
  let databasePath: string

  beforeEach(() => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hyprtrack-api-"))
    databasePath = path.join(tempDirectory, "fixture.db")
    process.env.HYPRTRACK_DB_PATH = databasePath

    const database = new Database(databasePath)
    database.exec(`
      CREATE TABLE activity_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sampled_at TEXT NOT NULL,
        app_class TEXT NOT NULL,
        window_title TEXT NOT NULL,
        window_full TEXT NOT NULL
      );
      INSERT INTO activity_samples (
        sampled_at, app_class, window_title, window_full
      ) VALUES
        ('2026-06-14T00:01:00+05:30', 'code', 'VS Code', 'private title'),
        ('2026-06-14T00:02:00+05:30', 'zen', 'GitHub', 'private title');
    `)
    database.close()
  })

  afterEach(() => {
    delete process.env.HYPRTRACK_DB_PATH
    fs.rmSync(tempDirectory, { recursive: true, force: true })
  })

  it("returns no-store overview JSON without forbidden columns", async () => {
    const response = await getOverview(
      new Request("http://localhost/api/overview?range=30d")
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(body.trackedMinutes).toBe(2)
    expect(JSON.stringify(body)).not.toContain("private title")
    expect(JSON.stringify(body)).not.toContain("window_full")
  })

  it("validates pagination parameters", async () => {
    const response = await getActivity(
      new Request("http://localhost/api/activity?page=0&pageSize=500")
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_QUERY",
        message: "The request query is invalid.",
      },
    })
  })

  it("returns applications and health through focused endpoints", async () => {
    const [applicationsResponse, healthResponse] = await Promise.all([
      getApplications(
        new Request("http://localhost/api/applications?range=30d&search=code")
      ),
      getHealth(),
    ])

    const applications = await applicationsResponse.json()
    const health = await healthResponse.json()

    expect(applications.items[0].windowTitle).toBe("VS Code")
    expect(health).toMatchObject({
      status: "connected",
      sampleCount: 2,
    })
  })

  it("maps a missing database to a sanitized 404", async () => {
    process.env.HYPRTRACK_DB_PATH = path.join(tempDirectory, "missing.db")

    const response = await getHealth()

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe("DATABASE_MISSING")
    expect(JSON.stringify(body)).not.toContain(tempDirectory)
  })
})
