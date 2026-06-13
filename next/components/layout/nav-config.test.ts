import { describe, expect, it } from "vitest"

import { isNavActive } from "@/components/layout/nav-config"

describe("isNavActive", () => {
  it("matches overview only at the root route", () => {
    expect(isNavActive("/", "/")).toBe(true)
    expect(isNavActive("/activity", "/")).toBe(false)
  })

  it("matches nested routes for non-root navigation items", () => {
    expect(isNavActive("/applications", "/applications")).toBe(true)
    expect(isNavActive("/applications/vscode", "/applications")).toBe(true)
    expect(isNavActive("/activity", "/applications")).toBe(false)
  })
})
