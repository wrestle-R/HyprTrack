import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import type { ApplicationUsage, RhythmCell, TimelinePoint } from "../lib/types"
import {
  ActivityTooltip,
  TimelineTopApplicationsPanel,
  RhythmRail,
  trackedTimeComparisonLabel,
} from "./analytics-pages"

function appUsage(windowTitle: string, minutes: number): ApplicationUsage {
  return {
    windowTitle,
    appClass: windowTitle.toLowerCase().replace(/\s+/g, "-"),
    minutes,
    share: minutes,
    sessionCount: 1,
    firstSeen: "2026-06-14T09:00:00+05:30",
    lastSeen: "2026-06-14T10:00:00+05:30",
    recentSessions: [],
  }
}

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
              topApplications: [],
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

describe("tracked time comparison label", () => {
  it("uses totals for today and active-day averages for multi-day ranges", () => {
    expect(trackedTimeComparisonLabel("today")).toBe("Tracked time")
    expect(trackedTimeComparisonLabel("7d")).toBe("Average tracked/day")
    expect(trackedTimeComparisonLabel("30d")).toBe("Average tracked/day")
  })
})

describe("timeline top applications panel", () => {
  const timeline: TimelinePoint[] = [
    {
      bucket: "2026-06-13",
      label: "Jun 13",
      minutes: 30,
      topApplications: [appUsage("Terminal", 30)],
    },
    {
      bucket: "2026-06-14",
      label: "14 Jun · 12:00 pm",
      minutes: 90,
      topApplications: [appUsage("VS Code", 60), appUsage("GitHub", 30)],
    },
  ]

  it("shows range top applications until a multi-day timeline point is selected", async () => {
    const user = userEvent.setup()

    render(
      <TimelineTopApplicationsPanel
        applications={[appUsage("Chrome", 120)]}
        timeline={timeline}
        range="7d"
      />
    )

    expect(screen.getByText("Top 5 applications")).toBeInTheDocument()
    expect(screen.getByText("Chrome")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /show jun 13/i }))

    expect(screen.getByText("Jun 13")).toBeInTheDocument()
    expect(screen.getByText("Terminal")).toBeInTheDocument()
    expect(screen.queryByText("Chrome")).not.toBeInTheDocument()
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
