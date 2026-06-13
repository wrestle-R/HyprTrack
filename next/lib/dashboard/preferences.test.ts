import { describe, expect, it } from "vitest"

import {
  DEFAULT_PREFERENCES,
  parsePreferences,
  serializePreferences,
} from "@/lib/dashboard/preferences"

describe("dashboard preferences", () => {
  it("returns defaults for missing or corrupt storage", () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES)
    expect(parsePreferences("{broken")).toEqual(DEFAULT_PREFERENCES)
  })

  it("accepts a valid versioned preference document", () => {
    const preferences = {
      version: 1 as const,
      theme: "dark" as const,
      defaultRange: "7d" as const,
      productiveTitles: ["VS Code", "GitHub"],
      tableDensity: "compact" as const,
    }

    expect(parsePreferences(serializePreferences(preferences))).toEqual(
      preferences
    )
  })

  it("falls back when stored values are from another version", () => {
    expect(
      parsePreferences(JSON.stringify({ version: 2, theme: "dark" }))
    ).toEqual(DEFAULT_PREFERENCES)
  })
})
