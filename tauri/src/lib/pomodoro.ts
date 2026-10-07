export const POMODORO_KEY = "hyprtrack.desktop.pomodoro"
export type PomodoroPhase = "focus" | "shortBreak" | "longBreak"
export const PHASE_LABELS: Record<PomodoroPhase, string> = {
  focus: "Focus", shortBreak: "Short break", longBreak: "Long break",
}
export type PomodoroState = {
  version: 1
  phase: PomodoroPhase
  focusMinutes: number
  remainingSeconds: number
  deadline: number | null
  completed: number
  completedToday: number
  day: string
  sound: boolean
}

function localDay(now: number) {
  const date = new Date(now)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

export function phaseSeconds(phase: PomodoroPhase, focusMinutes: number) {
  return (phase === "focus" ? focusMinutes : phase === "shortBreak" ? 5 : 15) * 60
}

export function freshPomodoro(now = Date.now()): PomodoroState {
  return { version: 1, phase: "focus", focusMinutes: 25, remainingSeconds: 1500,
    deadline: null, completed: 0, completedToday: 0, day: localDay(now), sound: false }
}

export function remainingSeconds(state: PomodoroState, now: number) {
  return state.deadline === null ? state.remainingSeconds : Math.max(0, Math.ceil((state.deadline - now) / 1000))
}

// Complete only the running session. A break always waits for an explicit start.
export function reconcilePomodoro(state: PomodoroState, now: number): PomodoroState {
  const today = localDay(now)
  let next = state.day === today ? state : { ...state, day: today, completedToday: 0 }
  if (state.deadline === null || state.deadline > now) return next
  const completedFocus = state.phase === "focus"
  const completed = state.completed + (completedFocus ? 1 : 0)
  const phase = completedFocus ? (completed % 4 === 0 ? "longBreak" : "shortBreak") : "focus"
  // A focus block ending yesterday belongs to yesterday, even if opened today.
  const completedToday = next.completedToday + (completedFocus && localDay(state.deadline) === today ? 1 : 0)
  return { ...next, phase, completed, completedToday, deadline: null,
    remainingSeconds: phaseSeconds(phase, state.focusMinutes) }
}

export function parsePomodoro(raw: string | null, now = Date.now()): PomodoroState {
  try {
    const value = JSON.parse(raw ?? "null") as PomodoroState | null
    if (!value || value.version !== 1 || !["focus", "shortBreak", "longBreak"].includes(value.phase)
      || ![15, 25, 45, 60].includes(value.focusMinutes)
      || !Number.isInteger(value.remainingSeconds) || value.remainingSeconds < 0
      || value.remainingSeconds > phaseSeconds(value.phase, value.focusMinutes)
      || !(value.deadline === null || (Number.isFinite(value.deadline) && value.deadline > 0))
      || !Number.isInteger(value.completed) || value.completed < 0
      || !Number.isInteger(value.completedToday) || value.completedToday < 0
      || typeof value.day !== "string" || typeof value.sound !== "boolean") return freshPomodoro(now)
    return reconcilePomodoro(value, now)
  } catch { return freshPomodoro(now) }
}

export function togglePomodoro(state: PomodoroState, now: number): PomodoroState {
  const next = reconcilePomodoro(state, now)
  if (state.deadline !== null && state.deadline <= now) return next
  return next.deadline === null
    ? { ...next, deadline: now + next.remainingSeconds * 1000 }
    : { ...next, remainingSeconds: remainingSeconds(next, now), deadline: null }
}

export function selectPhase(state: PomodoroState, phase: PomodoroPhase): PomodoroState {
  return { ...state, phase, deadline: null, remainingSeconds: phaseSeconds(phase, state.focusMinutes) }
}
