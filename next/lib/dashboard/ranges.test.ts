import { describe, expect, it } from "vitest"

import { resolveRange } from "@/lib/dashboard/ranges"

describe("resolveRange", () => {
  const now = new Date("2026-06-14T04:30:00.000Z")

  it("resolves today to midnight in IST through the supplied current time", () => {
    expect(resolveRange("today", now)).toEqual({
      key: "today",
      start: "2026-06-14T00:00:00+05:30",
      end: "2026-06-14T10:00:00+05:30",
      label: "Today",
    })
  })

  it("includes the current day plus the previous six days for 7d", () => {
    expect(resolveRange("7d", now).start).toBe(
      "2026-06-08T00:00:00+05:30"
    )
  })

  it("includes the current day plus the previous twenty-nine days for 30d", () => {
    expect(resolveRange("30d", now).start).toBe(
      "2026-05-16T00:00:00+05:30"
    )
  })

  it("rejects unsupported range values", () => {
    expect(() => resolveRange("year", now)).toThrowError("Invalid range")
  })
})
