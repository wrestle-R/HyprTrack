import { describe, expect, it } from "vitest"

import { DEFAULT_PREFERENCES, parsePreferences } from "./preferences"

describe("desktop preference migration", () => {
  it("migrates version 1 preferences without losing existing choices", () => {
    const migrated = parsePreferences(
      JSON.stringify({
        version: 1,
        theme: "dark",
        defaultRange: "30d",
        productiveTitles: ["VS Code"],
        tableDensity: "compact",
        fontSize: "large",
        sidebarWidth: "wide",
      })
    )

    expect(migrated).toMatchObject({
      version: 3,
      theme: "dark",
      defaultRange: "30d",
      productiveTitles: ["VS Code"],
      tableDensity: "compact",
      fontSize: "large",
      sidebarWidth: "wide",
      focusThresholdMinutes: 25,
    })
    expect(migrated.mappingRules).toEqual(DEFAULT_PREFERENCES.mappingRules)
    expect(migrated.keybindings).toEqual(DEFAULT_PREFERENCES.keybindings)
  })

  it("preserves a valid focus threshold from version 3 preferences", () => {
    const migrated = parsePreferences(
      JSON.stringify({
        ...DEFAULT_PREFERENCES,
        version: 3,
        focusThresholdMinutes: 45,
      })
    )

    expect(migrated.focusThresholdMinutes).toBe(45)
  })

  it("falls back to 25 minutes for unsupported focus thresholds", () => {
    const migrated = parsePreferences(
      JSON.stringify({
        ...DEFAULT_PREFERENCES,
        version: 3,
        focusThresholdMinutes: 17,
      })
    )

    expect(migrated.focusThresholdMinutes).toBe(25)
  })
})
