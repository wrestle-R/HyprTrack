"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { PALETTES } from "@/lib/site";

const bars = [12,18,31,47,65,51,42,26,19,39,62,91,78,53,23,18,21,40,69,86,74,55,31,22,15,12,30,56,62,37,22,11];

export function ThemePlayground() {
  const [palette, setPalette] = useState(0);
  const [mode, setMode] = useState<"light" | "dark">("dark");
  const colors = PALETTES[palette][mode];
  const style = { "--demo-bg": colors[0], "--demo-text": colors[1], "--demo-accent": colors[2], "--demo-border": colors[3] } as CSSProperties;
  return <div className="theme-playground">
    <div className="playground-toolbar"><span className="mono">Appearance playground</span><div className="mode-selector" role="group" aria-label="Preview appearance">{(["light","dark"] as const).map(m => <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>{m === "light" ? "Light" : "Dark"}</button>)}</div></div>
    <div className="theme-demo" style={style} data-palette={PALETTES[palette].id} data-mode={mode} aria-label={`${PALETTES[palette].name} ${mode} theme preview`}>
      <div className="demo-sidebar" aria-hidden="true"><span className="demo-logo">H<span>/</span>T</span><span className="active">▦ <span>Overview</span></span><span>↗ <span>Insights</span></span><span>▥ <span>Applications</span></span><span>≡ <span>Activity</span></span><span>◇ <span>Mappings</span></span><span className="demo-local">● <span>On your machine</span></span></div>
      <div className="demo-content"><div className="demo-title"><span>Your day, at a glance.</span><span className="mono">TODAY</span></div><div className="demo-metrics"><div><small>Tracked time</small><strong>8h 42m</strong></div><div><small>Top application</small><strong>VS Code</strong></div></div><span className="mono demo-chart-title">Activity rhythm</span><div className="demo-bars" aria-hidden="true">{bars.map((h,i) => <span key={i} style={{ height: `${h}%`, opacity: i % 4 === 0 ? .45 : .95 }} />)}</div><div className="demo-chart-labels mono"><span>06:00</span><span>12:00</span><span>18:00</span></div><div className="demo-apps">{[["VS Code","4h 12m","48%"],["Firefox","2h 06m","24%"],["Terminal","1h 08m","13%"]].map(([name,time,percent]) => <div key={name}><span>{name}</span><span className="demo-app-bar"><i style={{ width: percent }} /></span><span className="mono">{time}</span></div>)}</div></div>
    </div>
    <fieldset className="palette-picker"><legend className="sr-only">Choose a theme palette</legend>{PALETTES.map((p,i) => <label key={p.id} className={palette === i ? "is-selected" : ""}><input type="radio" name="palette" value={p.id} checked={palette === i} onChange={() => setPalette(i)} /><span className="swatch" style={{ background: p.dark[2] }} /><span className="mono">{p.name}</span></label>)}</fieldset>
    <p className="playground-caption">The six MultiCodex palettes, in light and dark. <span>Illustrative app preview.</span></p>
  </div>;
}
