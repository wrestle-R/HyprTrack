import Link from "next/link";
import { REPO } from "@/lib/site";
import { Mark } from "./icons";

export function SiteFooter() {
  return <footer className="site-footer shell">
    <Link className="brand" href="/"><Mark /><span>HyprTrack.</span></Link>
    <p>Made for Hyprland.<br />Open to everyone.</p>
    <nav aria-label="Footer navigation"><Link href="/docs">Docs</Link><Link href="/releases">Releases</Link><a href={REPO}>GitHub</a><Link href="/docs/privacy">Your data</Link></nav>
    <a href={`${REPO}/blob/main/LICENSE`} className="mono footer-license">MIT License ↗</a>
  </footer>;
}
