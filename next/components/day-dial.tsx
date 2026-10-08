"use client";

import { useEffect, useState } from "react";

const segments = [
  { start: 0, end: 390, color: "var(--dial-empty)", app: "Away", kind: "Untracked time" },
  { start: 390, end: 450, color: "#a09a8c", app: "Terminal", kind: "Getting started" },
  { start: 450, end: 635, color: "var(--accent)", app: "VS Code", kind: "Building something" },
  { start: 635, end: 705, color: "#747e5d", app: "Firefox", kind: "A little research" },
  { start: 705, end: 795, color: "var(--dial-empty)", app: "Away", kind: "Room for a break" },
  { start: 795, end: 995, color: "var(--accent)", app: "VS Code", kind: "Back in the flow" },
  { start: 995, end: 1065, color: "#747e5d", app: "Firefox", kind: "Reading the docs" },
  { start: 1065, end: 1125, color: "#a09a8c", app: "Terminal", kind: "Wrapping things up" },
  { start: 1125, end: 1440, color: "var(--dial-empty)", app: "Away", kind: "The rest of your day" },
];
function point(minutes: number, radius: number) {
  const angle = minutes / 1440 * Math.PI * 2 - Math.PI / 2;
  return [260 + Math.cos(angle) * radius, 260 + Math.sin(angle) * radius];
}
function arc(start: number, end: number) {
  const [x1, y1] = point(start + 3, 210);
  const [x2, y2] = point(end - 3, 210);
  return `M${x1} ${y1} A210 210 0 ${end - start > 720 ? 1 : 0} 1 ${x2} ${y2}`;
}

const istClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function currentISTMinute() {
  const parts = istClock.formatToParts(new Date());
  return Number(parts.find(p => p.type === "hour")?.value) * 60 + Number(parts.find(p => p.type === "minute")?.value);
}

export function DayDial() {
  const [liveMinute, setLiveMinute] = useState<number | null>(null);
  const [previewMinute, setPreviewMinute] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setLiveMinute(currentISTMinute());
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);
  const minute = previewMinute ?? liveMinute ?? 0;
  const selected = segments.find(s => minute >= s.start && minute < s.end) ?? segments[0];
  const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const [x, y] = point(minute, 194);

  return <div className="day-instrument">
    <div className="day-dial">
      <svg viewBox="0 0 520 520" fill="none" aria-hidden="true">
        {Array.from({ length: 144 }, (_, i) => {
          const [x1,y1] = point(i * 10, i % 6 === 0 ? 232 : 239);
          const [x2,y2] = point(i * 10, 246);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeOpacity={i % 6 === 0 ? .6 : .27} />;
        })}
        {segments.map(s => <path key={s.start} d={arc(s.start,s.end)} stroke={s.color} strokeWidth="22" />)}
        <g className="dial-pointer"><line x1="260" y1="260" x2={x} y2={y} stroke="currentColor" strokeOpacity=".65" /><circle cx={x} cy={y} r="6" fill="var(--accent)" stroke="var(--paper)" strokeWidth="3" /></g>
      </svg>
      <span className="dial-hour hour-0">00</span><span className="dial-hour hour-6">06</span><span className="dial-hour hour-12">12</span><span className="dial-hour hour-18">18</span>
      <div className="dial-center"><span className="mono">A day in motion</span><span className="dial-time">{liveMinute === null && previewMinute === null ? "--:--" : time}</span><span className="dial-zone mono">IST · UTC+05:30</span><span className="dial-app">{selected.app}</span><span className="dial-description">{selected.kind}</span></div>
    </div>
    <div className="day-scrubber">
      <div className="scrubber-caption"><label htmlFor="day-minute">Drag through a day <span>→</span></label><div className="scrubber-status">{previewMinute !== null && <button type="button" onClick={() => setPreviewMinute(null)}>Back to now</button>}<span className="mono">Illustrative data · IST</span></div></div>
      <div className="scrubber-track"><div className="time-rail" aria-hidden="true">{segments.map(s => <span key={s.start} style={{ width: `${(s.end - s.start) / 14.4}%`, background: s.color }} />)}</div>
      <input id="day-minute" type="range" min="0" max="1439" value={minute} onChange={e => setPreviewMinute(Number(e.target.value))} aria-valuetext={`${time} IST, ${selected.app}, ${selected.kind}`} /></div>
      <div className="rail-labels mono"><span>00:00</span><span>12:00</span><span>24:00</span></div>
    </div>
  </div>;
}
