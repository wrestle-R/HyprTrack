import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts")
  return {
    ...actual,
    ResponsiveContainer: ({
      children,
    }: {
      children: React.ReactNode
    }) => <div style={{ width: 640, height: 320 }}>{children}</div>,
  }
})

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) => {
    switch (command) {
      case "get_health":
        return {
          status: "connected",
          sampleCount: 439,
          latestSampleAt: "2026-06-14T13:37:43.221+05:30",
        }
      case "get_collector_status":
        return {
          state: "running_app",
          dbPath: "/home/test/.local/share/com.hyprtrack.desktop/hyprtrack.db",
          latestSampleAt: "2026-06-14T13:37:43.221+05:30",
          pid: 42,
          managedByApp: true,
          message: "Collector is running inside HyprTrack Desktop.",
        }
      case "get_autostart_status":
        return { enabled: false }
      case "get_overview":
        return {
          range: {
            key: "today",
            start: "2026-06-14T00:00:00+05:30",
            end: "2026-06-14T13:37:43+05:30",
            label: "Today",
          },
          trackedMinutes: 120,
          topApplication: {
            windowTitle: "VS Code",
            appClass: "code",
            minutes: 60,
            share: 50,
            sessionCount: 2,
            firstSeen: "2026-06-14T09:00:00+05:30",
            lastSeen: "2026-06-14T10:00:00+05:30",
            recentSessions: [],
          },
          streakDays: 2,
          timeline: [],
          applications: [],
          recentSessions: [],
          latestSampleAt: "2026-06-14T13:37:43.221+05:30",
        }
      case "get_activity":
        return {
          range: {
            key: "today",
            start: "2026-06-14T00:00:00+05:30",
            end: "2026-06-14T13:37:43+05:30",
            label: "Today",
          },
          sessions: [],
          appClasses: ["code", "zen"],
          pagination: {
            page: 1,
            pageSize: 15,
            totalItems: 0,
            totalPages: 1,
          },
        }
      case "get_applications":
        return {
          range: {
            key: "today",
            start: "2026-06-14T00:00:00+05:30",
            end: "2026-06-14T13:37:43+05:30",
            label: "Today",
          },
          items: [],
        }
      default:
        return null
    }
  }),
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => undefined),
}))

import App from "./App"

describe("App", () => {
  it("renders the desktop dashboard shell instead of the starter greet screen", async () => {
    render(<App />)

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Activity" })).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Applications" })
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument()
    expect(screen.getByText("Auto 1m")).toBeInTheDocument()
    expect(screen.getByLabelText("Use dark theme")).toBeInTheDocument()
    expect(
      screen.queryByText("Welcome to Tauri + React")
    ).not.toBeInTheDocument()
  })
})
