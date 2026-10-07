import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS, REPO, VERSION } from "@/lib/site";
import { DocContent, DOC_HEADINGS } from "@/components/doc-content";

type Props = {params:Promise<{slug:string}>};
export const dynamicParams = false;
export function generateStaticParams() { return DOCS.map(doc => ({slug:doc.slug})); }
export async function generateMetadata({params}:Props):Promise<Metadata> {
  const {slug} = await params;
  const doc = DOCS.find(d => d.slug === slug);
  if (!doc) return {};
  return {title:doc.title,description:doc.description,alternates:{canonical:`/docs/${slug}`}};
}

export default async function DocPage({params}:Props) {
  const {slug} = await params;
  const index = DOCS.findIndex(doc => doc.slug === slug);
  if (index < 0) notFound();
  const doc = DOCS[index];
  const heading = DOC_HEADINGS[slug];
  return <article className="doc-article"><p className="eyebrow">Docs / {String(index+1).padStart(2,"0")}</p><h1>{heading[0]}<br /><em>{heading[1]}</em></h1><p className="doc-intro">{doc.description}</p><div className="doc-facts mono"><span>Hyprland + Arch Linux</span><span>Desktop v{VERSION}</span></div><DocContent slug={slug} /><nav className="doc-pagination" aria-label="Adjacent documentation chapters">{index > 0 && <Link href={`/docs/${DOCS[index-1].slug}`}><span className="mono">← Previous</span>{DOCS[index-1].title}</Link>}{index < DOCS.length-1 && <Link href={`/docs/${DOCS[index+1].slug}`}><span className="mono">Next →</span>{DOCS[index+1].title}</Link>}</nav><p className="doc-feedback">Something missing? <a href={`${REPO}/issues/new`}>Help improve the handbook ↗</a></p></article>;
}
