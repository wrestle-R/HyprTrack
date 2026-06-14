import { describe, expect, it } from "vitest"

import {
  calculateProductiveMinutes,
  formatDuration,
  formatTimestamp,
} from "@/lib/dashboard/format"

describe("dashboard formatting", () => {
  it("formats minute estimates compactly", () => {
    expect(formatDuration(0)).toBe("0m")
    expect(formatDuration(0.5)).toBe("30s")
    expect(formatDuration(1.5)).toBe("1m 30s")
    expect(formatDuration(59)).toBe("59m")
    expect(formatDuration(125)).toBe("2h 5m")
  })

  it("formats timestamps in IST", () => {
    expect(formatTimestamp("2026-06-14T09:01:00+05:30")).toContain("9:01")
  })

  it("sums minutes for user-selected productive titles", () => {
    expect(
      calculateProductiveMinutes(
        [
          { windowTitle: "VS Code", minutes: 8 },
          { windowTitle: "YouTube", minutes: 3 },
          { windowTitle: "GitHub", minutes: 2 },
        ],
        ["VS Code", "GitHub"]
      )
    ).toBe(10)
  })
})
