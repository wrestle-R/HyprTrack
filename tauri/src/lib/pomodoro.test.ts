import { describe, expect, it } from "vitest"
import { freshPomodoro, parsePomodoro, reconcilePomodoro, remainingSeconds, selectPhase, togglePomodoro } from "./pomodoro"

const now = new Date(2026, 9, 7, 12, 0).getTime()

describe("persistent Pomodoro clock", () => {
  it("uses a deadline across reloads, then pauses and resumes without drift", () => {
    const started = togglePomodoro(freshPomodoro(now), now)
    const reopened = parsePomodoro(JSON.stringify(started), now + 90_000)
    expect(remainingSeconds(reopened, now + 90_000)).toBe(1410)
    const paused = togglePomodoro(reopened, now + 90_000)
    expect(paused.deadline).toBeNull()
    expect(remainingSeconds(paused, now + 600_000)).toBe(1410)
    expect(togglePomodoro(paused, now + 600_000).deadline).toBe(now + 2_010_000)
  })

  it("completes an overdue focus block exactly once and leaves the break paused", () => {
    const started = togglePomodoro(freshPomodoro(now), now)
    const finished = reconcilePomodoro(started, now + 1_600_000)
    expect(finished).toMatchObject({ phase: "shortBreak", remainingSeconds: 300, completed: 1, completedToday: 1, deadline: null })
    expect(reconcilePomodoro(finished, now + 3_600_000)).toBe(finished)
    expect(parsePomodoro(JSON.stringify(started), now + 1_600_000)).toEqual(finished)
  })

  it("offers a long break after four sessions and returns to focus after a break", () => {
    const started = togglePomodoro({ ...freshPomodoro(now), completed: 3 }, now)
    const longBreak = reconcilePomodoro(started, now + 1_500_000)
    expect(longBreak).toMatchObject({ phase: "longBreak", remainingSeconds: 900, completed: 4 })
    const focused = reconcilePomodoro(togglePomodoro(longBreak, now + 1_500_000), now + 2_400_000)
    expect(focused).toMatchObject({ phase: "focus", remainingSeconds: 1500, completed: 4, deadline: null })
  })

  it("resets a session without erasing completed sessions", () => {
    const reset = selectPhase({ ...freshPomodoro(now), completed: 7, completedToday: 3, deadline: now + 1000 }, "focus")
    expect(reset).toMatchObject({ remainingSeconds: 1500, deadline: null, completed: 7, completedToday: 3 })
  })

  it("does not count yesterday’s completed block as today’s", () => {
    const yesterday = new Date(2026, 9, 6, 18, 0).getTime()
    const finished = parsePomodoro(JSON.stringify(togglePomodoro(freshPomodoro(yesterday), yesterday)), now)
    expect(finished).toMatchObject({ completed: 1, completedToday: 0, phase: "shortBreak", deadline: null })
  })

  it("recovers from invalid or incomplete saved state", () => {
    for (const raw of [null, "{", JSON.stringify({ version: 1 }), JSON.stringify({ ...freshPomodoro(now), deadline: "bad" })]) {
      expect(parsePomodoro(raw, now)).toEqual(freshPomodoro(now))
    }
  })
})
