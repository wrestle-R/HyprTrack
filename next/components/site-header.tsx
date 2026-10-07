"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DOWNLOAD, REPO } from "@/lib/site";
import { Arrow, Mark } from "./icons";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { setDark(document.documentElement.dataset.theme === "dark"); }, []);
  useEffect(() => {
    if (!open) return;
    function close(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); menuButton.current?.focus(); }
    }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  function toggleTheme(event: React.MouseEvent<HTMLButtonElement>) {
    const root = document.documentElement;
    const next = !dark;
    const apply = () => {
      root.dataset.theme = next ? "dark" : "light";
      setDark(next);
      try { localStorage.setItem("hyprtrack.site.appearance", next ? "dark" : "light"); } catch { /* Private storage can be unavailable. */ }
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { apply(); return; }
    if (!document.startViewTransition) {
      root.classList.add("theme-fade"); apply();
      window.setTimeout(() => root.classList.remove("theme-fade"),300);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.detail ? event.clientX : rect.left + rect.width / 2;
    const y = event.detail ? event.clientY : rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const transition = document.startViewTransition(apply);
    void transition.ready.then(() => root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 550, easing: "cubic-bezier(.2,.6,.3,1)", pseudoElement: "::view-transition-new(root)" },
    )).catch(() => { /* The theme is already applied if a transition is skipped. */ });
  }

  return <header className="site-header shell">
    <Link href="/" className="brand" aria-label="HyprTrack home" onClick={() => setOpen(false)}><Mark /><span>HyprTrack<span className="brand-dot">.</span></span></Link>
    <nav id="main-navigation" className={`main-nav ${open ? "is-open" : ""}`} aria-label="Main navigation">
      <Link href="/#features" onClick={() => setOpen(false)}>Features</Link>
      <Link href="/docs" aria-current={pathname.startsWith("/docs") ? "page" : undefined} onClick={() => setOpen(false)}>Docs</Link>
      <Link href="/releases" aria-current={pathname === "/releases" ? "page" : undefined} onClick={() => setOpen(false)}>Releases</Link>
      <a href={REPO} onClick={() => setOpen(false)}>GitHub <span className="sr-only">repository</span></a>
    </nav>
    <div className="header-actions">
      <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">{dark ? <><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></> : <path d="M20.8 13.1A9 9 0 0 1 10.9 3.2 9 9 0 1 0 20.8 13.1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />}</svg>
      </button>
      <a className="button button-small header-download" href={DOWNLOAD}>Get the app <Arrow /></a>
      <button ref={menuButton} className="icon-button menu-toggle" aria-expanded={open} aria-controls="main-navigation" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">{open ? <path d="m6 6 12 12M6 18 18 6" stroke="currentColor" strokeWidth="1.5" /> : <path d="M4 8h16M4 16h16" stroke="currentColor" strokeWidth="1.5" />}</svg>
      </button>
    </div>
  </header>;
}
