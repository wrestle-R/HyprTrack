import { describe, expect, it } from "vitest"
import { formatBytes, rankedApplications, type NetworkApplication } from "./network"

describe("network measurements", () => {
  it("uses decimal units and handles observed zero without invalid labels", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(1500)).toBe("1.5 KB")
    expect(formatBytes(2_500_000_000)).toBe("2.5 GB")
    expect(formatBytes(Number.NaN)).toBe("0 B")
  })

  it("filters and sorts app totals without mutating the backend snapshot", () => {
    const apps: NetworkApplication[] = [
      { appId: "zen", appName: "Zen", scope: "app", rxBytes: 5000, txBytes: 10 },
      { appId: "resolved", appName: "Resolver", scope: "system", rxBytes: 200, txBytes: 1000 },
    ]
    expect(rankedApplications(apps, "", "all", "upload")[0].appId).toBe("resolved")
    expect(rankedApplications(apps, " ZEN ", "app", "total").map((app) => app.appId)).toEqual(["zen"])
    expect(rankedApplications(apps, "zen", "system", "total")).toEqual([])
    expect(apps[0].appId).toBe("zen")
  })
})
