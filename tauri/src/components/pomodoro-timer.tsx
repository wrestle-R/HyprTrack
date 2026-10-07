import { useEffect, useId, useRef, useState } from "react"
import {
  PHASE_LABELS, POMODORO_KEY, parsePomodoro, phaseSeconds, reconcilePomodoro,
  remainingSeconds, selectPhase, togglePomodoro, type PomodoroPhase,
} from "../lib/pomodoro"

function playChime() {
  try {
    const context = new AudioContext()
    for (const [index, frequency] of [660, 880].entries()) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.frequency.value = frequency
      const start = context.currentTime + index * 0.22
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.09, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6)
      oscillator.start(start)
      oscillator.stop(start + 0.65)
    }
    window.setTimeout(() => { void context.close() }, 1200)
  } catch { /* The visible completion message remains available without audio. */ }
}

export function PomodoroTimer() {
  const [state, setState] = useState(() => parsePomodoro(localStorage.getItem(POMODORO_KEY)))
  const [now, setNow] = useState(Date.now)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState("")
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  const id = useId()
  const seconds = remainingSeconds(state, now)
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
  const progress = 1 - seconds / phaseSeconds(state.phase, state.focusMinutes)
  const close = () => { setOpen(false); trigger.current?.focus() }

  useEffect(() => { localStorage.setItem(POMODORO_KEY, JSON.stringify(state)) }, [state])
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const interval = window.setInterval(tick, 1000)
    window.addEventListener("focus", tick)
    document.addEventListener("visibilitychange", tick)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", tick)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [])
  useEffect(() => {
    const next = reconcilePomodoro(state, now)
    if (next !== state) {
      if (state.deadline !== null && state.deadline <= now) {
        setNotice(state.phase === "focus" ? "Focus complete. Take a breath." : "Break complete. Ready when you are.")
        if (state.sound) playChime()
      }
      setState(next)
    }
  }, [state, now])
  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLButtonElement>(".pomodoro-start")?.focus()
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener("pointerdown", outside)
    return () => document.removeEventListener("pointerdown", outside)
  }, [open])

  return (
    <div className="pomodoro" ref={root}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
      onKeyDown={(event) => { if (event.key === "Escape" && open) { event.stopPropagation(); close() } }}>
      <button ref={trigger} className={`button secondary pomodoro-trigger ${state.deadline !== null ? "running" : ""}`}
        type="button" aria-label={`Pomodoro timer: ${PHASE_LABELS[state.phase]}, ${time}${state.deadline !== null ? ", running" : ""}`}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => setOpen((current) => !current)}>
        <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            strokeDasharray="56.55" strokeDashoffset={56.55 * (1 - Math.max(0.04, progress))} transform="rotate(-90 12 12)" />
        </svg>
        <span>{time}</span>
        {state.deadline !== null && <i className="timer-running-dot" aria-hidden="true" />}
      </button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">{notice}</span>
      {notice && !open && <div className="pomodoro-notice"><span>{notice}</span><button type="button" aria-label="Dismiss timer message" onClick={() => setNotice("")}>×</button></div>}
      {open && (
        <section className="pomodoro-popover" ref={panel} id={id} role="dialog" aria-label="Pomodoro timer">
          <div className="popover-heading"><strong>A little time to focus.</strong><span>{state.completedToday} {state.completedToday === 1 ? "session" : "sessions"} completed today</span></div>
          <div className="pomodoro-modes" aria-label="Timer phase">
            {(["focus", "shortBreak", "longBreak"] as PomodoroPhase[]).map((phase) => (
              <button type="button" key={phase} aria-pressed={state.phase === phase}
                onClick={() => { setState(selectPhase(state, phase)); setNotice("") }}>{PHASE_LABELS[phase]}</button>
            ))}
          </div>
          <div className="pomodoro-clock" role="timer" aria-label={`${PHASE_LABELS[state.phase]} time remaining`}>{time}</div>
          <p className="pomodoro-caption">{notice || (state.deadline !== null ? "One thing at a time. You’ve got this." : "Settle in. Start when you’re ready.")}</p>
          <div className="pomodoro-actions">
            <button className="button primary pomodoro-start" type="button" onClick={() => {
              const timeNow = Date.now(); setNow(timeNow); setState(togglePomodoro(state, timeNow)); setNotice("")
            }}>{state.deadline !== null ? "Pause" : "Start"} {PHASE_LABELS[state.phase].toLowerCase()}</button>
            <button className="button secondary" type="button" aria-label="Reset current timer"
              onClick={() => { setState(selectPhase(state, state.phase)); setNotice("") }}>Reset</button>
          </div>
          <div className="pomodoro-preferences">
            <label>Focus length
              <select className="select" value={state.focusMinutes} disabled={state.deadline !== null}
                onChange={(event) => {
                  const focusMinutes = Number(event.currentTarget.value)
                  setState({ ...state, focusMinutes, remainingSeconds: phaseSeconds(state.phase, focusMinutes) })
                }}>
                {[15, 25, 45, 60].map((minutes) => <option value={minutes} key={minutes}>{minutes} minutes</option>)}
              </select>
            </label>
            <label className="pomodoro-sound"><input type="checkbox" checked={state.sound}
              onChange={(event) => setState({ ...state, sound: event.currentTarget.checked })} />Gentle chime</label>
          </div>
          <p className="pomodoro-footnote">5-minute breaks. A 15-minute break every four focus sessions. Each session starts with you.</p>
        </section>
      )}
    </div>
  )
}
