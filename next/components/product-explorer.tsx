"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Arrow } from "./icons";
import dark from "@/public/images/dark_screenshot.png";
import light from "@/public/images/light_screenshot.png";
import focus from "@/public/images/pomodoro_screenshot.png";
import lightFocus from "@/public/images/pomodoro_light_screenshot.png";

import lightSettings from "@/public/images/settings_light_screenshot.png";
import darkSettings from "@/public/images/settings_dark_screenshot.png";

const views = [
  { title: "The big picture", lightImage: light, darkImage: dark, caption: "Overview", description: "Tracked time, productive time, your top applications, and the rhythm of your day. All in one calm workspace.", alt: "overview with tracked time, focus quality, activity rhythm and VS Code usage" },
  { title: "Make it yours", lightImage: lightSettings, darkImage: darkSettings, caption: "Settings", description: "The same clear picture in your preferred appearance. Resize the workspace, adjust the typography, and find a layout that feels right.", alt: "settings with appearance palettes, display mode, typography and sidebar controls" },
  { title: "Time to focus", lightImage: lightFocus, darkImage: focus, caption: "Pomodoro", description: "A compact timer that stays with you across pages. Choose a focus block, take a break, and pick up where you left off.", alt: "Pomodoro with the compact desktop timer controls open" },
];

export function ProductExplorer() {
  const [index, setIndex] = useState(0);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("vertical");
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setOrientation(media.matches ? "horizontal" : "vertical");
    update(); media.addEventListener("change",update);
    return () => media.removeEventListener("change",update);
  },[]);
  return <div className="product-explorer">
    <div className="product-frame" id="product-panel" role="tabpanel" aria-labelledby={`product-tab-${index}`}>
      <div className="product-chrome"><span><i /><i /><i /></span><span className="mono">HyprTrack Desktop / v2.1.0</span><span className="window-mark">↗</span></div>
      {views.map((view, i) => <div key={view.title} hidden={index !== i}>
        {(["light", "dark"] as const).map(mode => <Image key={mode} src={mode === "light" ? view.lightImage : view.darkImage} alt={`HyprTrack ${mode} ${view.alt}`} sizes="(max-width: 900px) 95vw, 76vw" loading="eager" placeholder="blur" className={`product-image theme-preview-${mode}`} />)}
      </div>)}
      <div className="product-caption"><span className="mono">{views[index].caption} · <span className="theme-preview-light">light mode</span><span className="theme-preview-dark">dark mode</span></span><span>App screenshot · sample data</span></div>
    </div>
    <div className="product-selector">
      <div role="tablist" aria-label="App previews" aria-orientation={orientation} onKeyDown={e => {
        if (!["ArrowDown","ArrowUp","ArrowRight","ArrowLeft","Home","End"].includes(e.key)) return;
        e.preventDefault();
        const next = e.key === "Home" ? 0 : e.key === "End" ? 2 : (index + (["ArrowDown","ArrowRight"].includes(e.key) ? 1 : 2)) % 3;
        setIndex(next); buttons.current[next]?.focus();
      }}>{views.map((view,i) => <button key={view.title} ref={el => { buttons.current[i] = el; }} id={`product-tab-${i}`} role="tab" aria-selected={index === i} aria-controls="product-panel" tabIndex={index === i ? 0 : -1} onClick={() => setIndex(i)} className={index === i ? "selected" : ""}><span className="mono">0{i+1}</span><span>{view.title}</span><Arrow /></button>)}</div>
      <p aria-live="polite">{views[index].description}</p><Link href="/docs/getting-started" className="text-link">Take a closer look <Arrow /></Link>
    </div>
  </div>;
}
