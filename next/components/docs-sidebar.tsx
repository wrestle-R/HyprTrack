"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { DOCS, VERSION } from "@/lib/site";

export function DocsSidebar() {
  const pathname = usePathname();
  const [query,setQuery] = useState("");
  const [open,setOpen] = useState(false);
  const filtered = DOCS.filter(doc => `${doc.title} ${doc.description}`.toLowerCase().includes(query.toLowerCase()));
  const current = DOCS.find(doc => pathname === `/docs/${doc.slug}`);
  return <aside className="docs-sidebar"><div className="docs-sidebar-inner">
    <p className="eyebrow">The handbook</p>
    <button className="docs-menu-button" aria-expanded={open} aria-controls="docs-navigation" onClick={() => setOpen(!open)}><span>{current?.title ?? "The handbook"}</span><span>{open ? "Close −" : "Chapters +"}</span></button>
    <div id="docs-navigation" className={`docs-sidebar-content ${open ? "is-open" : ""}`}>
      <label className="sr-only" htmlFor="docs-search">Find a chapter</label><input id="docs-search" type="search" className="docs-search" placeholder="Find a chapter…" value={query} onChange={e => setQuery(e.target.value)} />
      <nav className="docs-links" aria-label="Documentation chapters">{filtered.map(doc => <Link key={doc.slug} href={`/docs/${doc.slug}`} aria-current={pathname === `/docs/${doc.slug}` ? "page" : undefined} onClick={() => { setOpen(false); setQuery(""); }}>{doc.title}</Link>)}</nav>
      {!filtered.length && <p className="docs-no-results" role="status">No matching chapter. Try “collector” or “focus”.</p>}
    </div><Link href="/releases" className="mono docs-sidebar-version">Handbook for v{VERSION} ↗</Link>
  </div></aside>;
}
