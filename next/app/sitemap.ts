import type { MetadataRoute } from "next";
import { DOCS, SITE_URL } from "@/lib/site";
export default function sitemap():MetadataRoute.Sitemap {
  return ["","/releases",...DOCS.map(doc => `/docs/${doc.slug}`)].map(path => ({url:`${SITE_URL}${path}`,changeFrequency:"monthly",priority:path === "" ? 1 : .7}));
}
