import type { Metadata } from "next";
import Link from "next/link";
import { DayDial } from "@/components/day-dial";
import { ProductExplorer } from "@/components/product-explorer";
import { ThemePlayground } from "@/components/theme-playground";
import { FocusTimer } from "@/components/focus-timer";
import { CodeBlock } from "@/components/code-block";
import { Arrow } from "@/components/icons";
import { DOWNLOAD, INSTALL, REPO, VERSION } from "@/lib/site";

export const metadata: Metadata = { alternates:{canonical:"/"} };

export default function Home() {
  return <main id="main">
    <section className="hero shell" aria-labelledby="hero-title">
      <div className="hero-copy"><p className="eyebrow">Your day, in view.</p><h1 id="hero-title">Time leaves<br />a <em>trace.</em></h1><p className="hero-description">A quiet record of where your day goes.<br className="desktop-break" /> Built for Hyprland. Kept on your machine.</p><div className="hero-actions"><a href={DOWNLOAD} className="button">Download for Linux <Arrow /></a><a href="#features" className="text-link">See how it works <Arrow down /></a></div><p className="hero-platform mono">v{VERSION} · Arch Linux · x86_64 · Free</p></div>
      <DayDial />
      <div className="principles"><div><span className="mono">01</span><span>Local by default.</span></div><div><span className="mono">02</span><span>Six ways to see it.</span></div><div><span className="mono">03</span><span>Open source, always.</span></div></div>
    </section>
    <section id="features" className="features-section shell section-space" aria-labelledby="features-title">
      <div className="section-heading"><div><p className="eyebrow">01 / The record</p><h2 id="features-title">Your day.<br /><em>In detail.</em></h2></div><p>Catch the patterns you usually miss. Explore your applications, activity, and focus without sending your day to someone else’s server.</p></div>
      <ProductExplorer />
      <div className="feature-notes"><div><span className="mono">01 / Perspective</span><h3>Catch the pattern.</h3><p>Daily, weekly, and monthly views reveal when you settle in, what gets your attention, and how your habits shift.</p></div><div><span className="mono">02 / Continuity</span><h3>Follow the session.</h3><p>The collector listens to Hyprland events. Your timeline keeps growing even when the dashboard is closed.</p></div><div><span className="mono">03 / Personal</span><h3>Name it your way.</h3><p>Turn noisy window titles into useful labels. Your mappings update historical views while keeping the raw data intact.</p></div></div>
    </section>
    <section id="playground" className="rhythm-section section-space" aria-labelledby="rhythm-title"><div className="shell">
      <div className="section-heading"><div><p className="eyebrow">02 / Find your rhythm</p><h2 id="rhythm-title">A little color.<br /><em>A lot of focus.</em></h2></div><p>Six palettes. Light or dark.<br />A quiet timer for the work in front of you. Go on, give them a try.</p></div>
      <div className="rhythm-grid"><ThemePlayground /><FocusTimer /></div>
      <div className="rhythm-bottom"><p>Make it yours. Then get back to it.</p><Link href="/docs/themes-and-focus" className="text-link">The details <Arrow /></Link></div>
    </div></section>
    <section id="download" className="install-section shell section-space" aria-labelledby="install-title"><div className="install-copy"><p className="eyebrow">03 / Take it with you</p><h2 id="install-title">Keep your day.<br /><em>Keep your data.</em></h2><p>No account. No uploads. Just your machine,<br className="desktop-break" /> your time, and a clearer picture.</p><div className="hero-actions"><a className="button" href={DOWNLOAD}>Download v{VERSION} <Arrow /></a><a href={REPO} className="text-link">View source <Arrow /></a></div></div><div className="install-terminal"><CodeBlock code={INSTALL} label="Quick start / Arch Linux x86_64" /><Link className="text-link" href="/docs/getting-started">Read the install guide <Arrow /></Link><p>Requires Hyprland, Python 3.10+, and GTK / WebKitGTK. Start the collector after your first launch.</p></div></section>
  </main>;
}
