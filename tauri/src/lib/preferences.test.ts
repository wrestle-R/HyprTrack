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
      version: 4,
      theme: "dark",
      colorTheme: "orange",
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

  it("adds the palette to v3 without resetting custom mappings or shortcuts", () => {
    const previous = {
      ...DEFAULT_PREFERENCES,
      version: 3,
      theme: "dark",
      mappingRules: [{ id: "custom", matchText: "docs", displayLabel: "Research", enabled: false, isDefault: false }],
      keybindings: [{ action: "theme.toggle", shortcut: "Ctrl+Alt+D" }],
    }
    const migrated = parsePreferences(JSON.stringify(previous))
    expect(migrated).toMatchObject({ ...previous, version: 4, colorTheme: "orange" })
  })

  it("keeps a saved palette and falls back safely for an unknown palette", () => {
    expect(parsePreferences(JSON.stringify({ ...DEFAULT_PREFERENCES, colorTheme: "ocean" })).colorTheme).toBe("ocean")
    const recovered = parsePreferences(JSON.stringify({ ...DEFAULT_PREFERENCES, theme: "dark", colorTheme: "unknown" }))
    expect(recovered.colorTheme).toBe("orange")
    expect(recovered.theme).toBe("dark")
  })

  it("retains productive VS Code selections after normalizing the app label", () => {
    const migrated = parsePreferences(JSON.stringify({ ...DEFAULT_PREFERENCES, version: 3, productiveTitles: ["com.microsoft.VSCode", "GitHub", "VS Code", "Research"] }))
    expect(migrated.productiveTitles).toEqual(["VS Code", "GitHub", "Research"])
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
