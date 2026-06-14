import { describe, expect, it } from "vitest"

import { groupSessions } from "@/lib/dashboard/sessions"

describe("groupSessions", () => {
  it("uses exact interval durations and groups adjacent matching rows", () => {
    const sessions = groupSessions([
      {
        sampledAt: "2026-06-14T10:00:00+05:30",
        endedAt: "2026-06-14T10:02:30+05:30",
        appClass: "zen",
        windowTitle: "YouTube",
      },
      {
        sampledAt: "2026-06-14T10:02:30+05:30",
        endedAt: "2026-06-14T10:03:00+05:30",
        appClass: "zen",
        windowTitle: "YouTube",
      },
    ])

    expect(sessions).toEqual([
      {
        startAt: "2026-06-14T10:00:00+05:30",
        endAt: "2026-06-14T10:03:00+05:30",
        appClass: "zen",
        windowTitle: "YouTube",
        durationMinutes: 3,
        sampleCount: 2,
      },
    ])
  })

  it("groups adjacent matching samples and counts one minute per sample", () => {
    const sessions = groupSessions([
      {
        sampledAt: "2026-06-14T10:00:00+05:30",
        appClass: "code",
        windowTitle: "VS Code",
      },
      {
        sampledAt: "2026-06-14T10:01:00+05:30",
        appClass: "code",
        windowTitle: "VS Code",
      },
    ])

    expect(sessions).toEqual([
      {
        startAt: "2026-06-14T10:00:00+05:30",
        endAt: "2026-06-14T10:02:00+05:30",
        appClass: "code",
        windowTitle: "VS Code",
        durationMinutes: 2,
        sampleCount: 2,
      },
    ])
  })

  it("splits matching labels when samples are more than 90 seconds apart", () => {
    const sessions = groupSessions([
      {
        sampledAt: "2026-06-14T10:00:00+05:30",
        appClass: "zen",
        windowTitle: "GitHub",
      },
      {
        sampledAt: "2026-06-14T10:02:00+05:30",
        appClass: "zen",
        windowTitle: "GitHub",
      },
    ])

    expect(sessions).toHaveLength(2)
    expect(sessions.every((session) => session.durationMinutes === 1)).toBe(true)
  })

  it("does not combine adjacent samples with different normalized titles", () => {
    const sessions = groupSessions([
      {
        sampledAt: "2026-06-14T10:00:00+05:30",
        appClass: "zen",
        windowTitle: "GitHub",
      },
      {
        sampledAt: "2026-06-14T10:01:00+05:30",
        appClass: "zen",
        windowTitle: "YouTube",
      },
    ])

    expect(sessions.map((session) => session.windowTitle)).toEqual([
      "GitHub",
      "YouTube",
    ])
  })
})
