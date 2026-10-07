import Link from "next/link";
import { Arrow } from "@/components/icons";

export default function NotFound() {
  return <main id="main" className="not-found shell"><p className="eyebrow">404 / A little off track</p><h1>This moment<br /><em>got away.</em></h1><p>That page doesn’t exist. The handbook or homepage should get you where you want to go.</p><div className="hero-actions"><Link className="button" href="/">Back to the day <Arrow /></Link><Link className="text-link" href="/docs">Open the handbook <Arrow /></Link></div></main>;
}
