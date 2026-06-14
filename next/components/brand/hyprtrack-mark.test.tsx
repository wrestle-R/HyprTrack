import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { HyprTrackMark } from "@/components/brand/hyprtrack-mark"

describe("HyprTrackMark", () => {
  it("renders an accessible HyprTrack logo", () => {
    const markup = renderToStaticMarkup(<HyprTrackMark title="HyprTrack" />)

    expect(markup).toContain("<title>HyprTrack</title>")
    expect(markup).toContain('role="img"')
    expect(markup).toContain('viewBox="0 0 64 64"')
  })
})
