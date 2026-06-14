import { readFileSync } from "node:fs"
import path from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { HyprTrackMark } from "@/components/brand/hyprtrack-mark"

describe("HyprTrackMark", () => {
  it("renders an accessible HyprTrack logo", () => {
    const markup = renderToStaticMarkup(<HyprTrackMark title="HyprTrack" />)

    expect(markup).toContain("<title>HyprTrack</title>")
    expect(markup).toContain('role="img"')
    expect(markup).toContain('viewBox="0 0 64 64"')
    expect(markup).toContain('stroke="var(--foreground)"')
    expect(markup).not.toContain("<rect")
  })

  it("uses a transparent browser icon that adapts to the color scheme", () => {
    const icon = readFileSync(path.join(process.cwd(), "app/icon.svg"), "utf8")

    expect(icon).toContain("prefers-color-scheme: dark")
    expect(icon).toContain('stroke="currentColor"')
    expect(icon).not.toContain("<rect")
  })
})
