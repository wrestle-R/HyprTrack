import { describe, expect, it } from "vitest"

import {
  getApplicationSource,
  getApplicationSourceLabel,
} from "@/lib/dashboard/application-source"

describe("application source", () => {
  it("separates browser windows from native applications by app class", () => {
    expect(getApplicationSource("zen")).toBe("browser")
    expect(getApplicationSource("brave-origin-nightly")).toBe("browser")
    expect(getApplicationSource("code")).toBe("app")
    expect(getApplicationSource("com.stremio.stremio")).toBe("app")
  })

  it("formats clear source labels", () => {
    expect(getApplicationSourceLabel("zen")).toBe("Browser window · Zen")
    expect(getApplicationSourceLabel("code")).toBe("Application · code")
  })
})
