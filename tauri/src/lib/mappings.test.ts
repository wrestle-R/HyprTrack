import { describe, expect, it } from "vitest"

import {
  DEFAULT_MAPPING_RULES,
  prioritizeMappingRules,
  validateMappingRules,
  type MappingRule,
} from "./mappings"

describe("mapping rules", () => {
  it("places custom rules before default rules while preserving each group order", () => {
    const rules: MappingRule[] = [
      DEFAULT_MAPPING_RULES[0],
      {
        id: "custom-repository",
        matchText: "wrestle-r/dots-hyprland",
        displayLabel: "Dotfiles",
        enabled: true,
        isDefault: false,
      },
      DEFAULT_MAPPING_RULES[1],
    ]

    expect(prioritizeMappingRules(rules).map((rule) => rule.id)).toEqual([
      "custom-repository",
      DEFAULT_MAPPING_RULES[0].id,
      DEFAULT_MAPPING_RULES[1].id,
    ])
  })

  it("rejects blank fields and duplicate case-insensitive match text", () => {
    const rules: MappingRule[] = [
      {
        id: "first",
        matchText: "GitHub",
        displayLabel: "GitHub",
        enabled: true,
        isDefault: false,
      },
      {
        id: "second",
        matchText: " github ",
        displayLabel: "",
        enabled: true,
        isDefault: false,
      },
    ]

    expect(validateMappingRules(rules)).toEqual({
      second: {
        matchText: "Match text must be unique.",
        displayLabel: "Display label is required.",
      },
    })
  })
})
