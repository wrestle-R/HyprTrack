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
      version: 2,
      theme: "dark",
      defaultRange: "30d",
      productiveTitles: ["VS Code"],
      tableDensity: "compact",
      fontSize: "large",
      sidebarWidth: "wide",
    })
    expect(migrated.mappingRules).toEqual(DEFAULT_PREFERENCES.mappingRules)
    expect(migrated.keybindings).toEqual(DEFAULT_PREFERENCES.keybindings)
  })
})
