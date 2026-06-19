import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { RhythmCell } from "../lib/types"
import { ActivityTooltip, RhythmRail } from "./analytics-pages"

describe("activity rhythm tooltip", () => {
  it("shows duration and difference from the selected-range average", () => {
    render(
      <ActivityTooltip
        active
        average={30}
        payload={[
          {
            payload: {
              bucket: "2026-06-14T10",
              label: "10:00",
              minutes: 45,
            },
            value: 45,
          },
        ]}
      />
    )

    expect(screen.getByText("10:00")).toBeInTheDocument()
    expect(screen.getByText("45m")).toBeInTheDocument()
    expect(screen.getByText("15m above average")).toBeInTheDocument()
  })
})

describe("weekly rhythm rail", () => {
  const rhythm: RhythmCell[] = Array.from({ length: 24 }, (_, hour) => ({
    dayIndex: 0,
    dayLabel: "Today",
    hour,
    trackedMinutes: hour === 10 ? 52 : hour === 16 ? 31 : 0,
    focusedMinutes: hour === 10 ? 40 : 0,
  }))

  it("keeps all hours in a responsive rail without a scroll container", () => {
    const { container } = render(<RhythmRail cells={rhythm} />)

    expect(container.querySelector(".rhythm-rail")).toBeInTheDocument()
    expect(container.querySelector(".heatmap-scroll")).not.toBeInTheDocument()
    expect(container.querySelectorAll(".rhythm-segment")).toHaveLength(24)
    expect(screen.getByText("12 AM")).toBeInTheDocument()
    expect(screen.getByText("6 PM")).toBeInTheDocument()
  })

  it("summarizes the strongest hour as the peak window", () => {
    render(<RhythmRail cells={rhythm} />)

    expect(screen.getByText("Peak window")).toBeInTheDocument()
    expect(screen.getByText("10–11 AM")).toBeInTheDocument()
  })
})
