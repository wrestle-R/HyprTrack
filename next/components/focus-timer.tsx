"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const phases = [{ label: "Focus", seconds: 1500 },{ label: "Short break", seconds: 300 },{ label: "Long break", seconds: 900 }];
const KEY = "hyprtrack.site.timer.v1";
type Timer = { phase: number; remaining: number; deadline: number | null };
const fresh: Timer = { phase: 0, remaining: 1500, deadline: null };

export function FocusTimer() {
  const [timer, setTimer] = useState<Timer>(fresh);
  const [now, setNow] = useState(0);
  const [ready, setReady] = useState(false);
  const [completed, setCompleted] = useState(false);
  const stateRef = useRef(timer);
  stateRef.current = timer;
  const commitTimer = useCallback((next: Timer) => {
    stateRef.current = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Timer still works without persistence. */ }
    setTimer(next);
  }, []);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Timer | null;
      if (saved && Number.isInteger(saved.phase) && saved.phase >= 0 && saved.phase < 3 && Number.isFinite(saved.remaining) && saved.remaining >= 0 && saved.remaining <= phases[saved.phase].seconds && (saved.deadline === null || Number.isFinite(saved.deadline) && saved.deadline > 0)) {
        const restored = saved.deadline !== null && saved.deadline <= Date.now() ? { ...saved, deadline: null, remaining: 0 } : saved;
        commitTimer(restored);
        setCompleted(restored.deadline === null && restored.remaining === 0);
      }
    } catch { /* Fresh timer if storage is restricted or invalid. */ }
    setNow(Date.now()); setReady(true);
  }, [commitTimer]);
  useEffect(() => {
    if (timer.deadline === null) return;
    function tick() {
      const time = Date.now(); setNow(time);
      if (stateRef.current.deadline !== null && stateRef.current.deadline <= time) { commitTimer({ ...stateRef.current, deadline: null, remaining: 0 }); setCompleted(true); }
    }
    tick(); const interval = setInterval(tick, 500);
    document.addEventListener("visibilitychange",tick);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange",tick); };
  }, [timer.deadline, commitTimer]);
  const remaining = timer.deadline === null ? timer.remaining : Math.max(0, Math.ceil((timer.deadline - now) / 1000));
  const time = `${String(Math.floor(remaining / 60)).padStart(2,"0")}:${String(remaining % 60).padStart(2,"0")}`;
  const progress = remaining / phases[timer.phase].seconds;
  function toggle() {
    const time = Date.now(); setNow(time);
    const current = stateRef.current;
    if (current.deadline !== null && current.deadline <= time) {
      commitTimer({ ...current, deadline: null, remaining: 0 }); setCompleted(true); return;
    }
    setCompleted(false);
    commitTimer(current.deadline === null
      ? { ...current, remaining: current.remaining || phases[current.phase].seconds, deadline: time + (current.remaining || phases[current.phase].seconds) * 1000 }
      : { ...current, remaining: Math.max(0,Math.ceil((current.deadline - time) / 1000)), deadline: null });
  }
  return <div className="focus-timer">
    <div className="timer-dial">
      <svg viewBox="0 0 360 360" fill="none" aria-hidden="true">{Array.from({length:60},(_,i) => <line key={i} x1="180" y1={i % 5 === 0 ? "16" : "21"} x2="180" y2="30" stroke="currentColor" strokeOpacity={i % 5 === 0 ? .8 : .35} transform={`rotate(${i*6} 180 180)`} />)}<circle cx="180" cy="180" r="150" stroke="currentColor" strokeOpacity=".08" strokeWidth="8" /><circle cx="180" cy="180" r="150" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${progress * 942.48} 942.48`} transform="rotate(-90 180 180)" className="timer-progress" /></svg>
      <div className="timer-center"><span className="timer-time" role="timer" aria-label={`${phases[timer.phase].label}: ${time} remaining`} aria-live="off">{time}</span><span className="mono">{phases[timer.phase].label} session</span></div>
    </div>
    <div className="timer-controls"><button className="button button-accent" onClick={toggle} disabled={!ready}>{timer.deadline !== null ? "Pause the session" : completed ? "Start again" : timer.remaining < phases[timer.phase].seconds ? "Resume the session" : "Start a session"}<span aria-hidden="true">{timer.deadline !== null ? "Ⅱ" : "▷"}</span></button><button className="timer-reset" aria-label="Reset timer" disabled={!ready} onClick={() => { commitTimer({ phase: timer.phase, remaining: phases[timer.phase].seconds, deadline: null }); setCompleted(false); }}>↺</button></div>
    <div className="timer-phases" role="group" aria-label="Timer session type">{phases.map((p,i) => <button key={p.label} aria-pressed={timer.phase === i} disabled={!ready} onClick={() => { commitTimer({ phase:i, remaining:p.seconds, deadline:null }); setCompleted(false); }}>{p.label}</button>)}</div>
    <p className="timer-note" aria-live="polite">{completed ? "Session complete. Take a moment for yourself." : "Try it here. Your timer stays in this browser."}</p>
  </div>;
}
